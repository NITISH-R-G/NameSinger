package expo.modules.yueengine

import android.system.Os
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.ArrayDeque

/**
 * Runs the prebuilt yue2 song engine (libyueserver_portable.so, CPU only) as a child process and talks to its
 * documented HTTP API on 127.0.0.1. The engine files come unmodified from the Killa YuE 1.8.1 release.
 * Nothing here throttles the engine: Killa's "gentle mode" (nice, 2 threads, sleeps) is NOT applied unless asked.
 */
class YueEngineModule : Module() {
  private var process: Process? = null
  private val logLines = ArrayDeque<String>()
  private var exitCode: Int? = null
  private val port = 8087

  private fun ctx() = appContext.reactContext ?: throw IllegalStateException("No Android context")

  private fun log(line: String) {
    synchronized(logLines) {
      logLines.addLast(line)
      while (logLines.size > 600) logLines.removeFirst()
    }
  }

  /** Symlinks libggml-cpu-<variant>.so -> libkycpu-<variant>.so, the layout the engine's backend loader expects. */
  private fun prepareBackends(): File {
    val lib = File(ctx().applicationInfo.nativeLibraryDir)
    val dir = File(ctx().filesDir, "song-backends-cpu")
    if (!dir.isDirectory && !dir.mkdirs()) throw IllegalStateException("Cannot create backend folder")
    var variants = 0
    lib.listFiles()?.forEach { f ->
      val n = f.name
      if (n.startsWith("libkycpu-") && n.endsWith(".so")) {
        val link = File(dir, "libggml-cpu-" + n.removePrefix("libkycpu-"))
        link.delete()
        Os.symlink(f.absolutePath, link.absolutePath)
        variants++
      }
    }
    if (variants == 0) throw IllegalStateException("Engine CPU kernels are missing from this build")
    return dir
  }

  private val busy = java.util.concurrent.atomic.AtomicBoolean(false)
  @Volatile private var currentJob: String? = null
  @Volatile private var cancelled = false

  private fun submit(json: String): String {
    val c = URL("http://127.0.0.1:$port/synth").openConnection() as HttpURLConnection
    c.requestMethod = "POST"; c.doOutput = true
    c.setRequestProperty("Content-Type", "application/json")
    c.connectTimeout = 5000; c.readTimeout = 30000
    c.outputStream.use { it.write(json.toByteArray(Charsets.UTF_8)) }
    val code = c.responseCode
    val body = (if (code in 200..299) c.inputStream else c.errorStream).readBytes().toString(Charsets.UTF_8)
    c.disconnect()
    if (code !in 200..299) throw IllegalStateException("Engine rejected the request: $body")
    return org.json.JSONObject(body).getString("id")
  }

  private fun jobStatus(id: String): String {
    val c = URL("http://127.0.0.1:$port/job?id=$id").openConnection() as HttpURLConnection
    c.connectTimeout = 5000; c.readTimeout = 15000
    val body = c.inputStream.readBytes().toString(Charsets.UTF_8)
    c.disconnect()
    return org.json.JSONObject(body).getString("status")
  }

  private fun fetchResult(id: String): ByteArray {
    val c = URL("http://127.0.0.1:$port/job?id=$id&result=1").openConnection() as HttpURLConnection
    c.connectTimeout = 5000; c.readTimeout = 120000
    val bytes = c.inputStream.readBytes()
    c.disconnect()
    return bytes
  }

  private fun indexOf(h: ByteArray, n: ByteArray, from: Int): Int {
    var i = from
    outer@ while (i <= h.size - n.size) {
      for (j in n.indices) if (h[i + j] != n[j]) { i++; continue@outer }
      return i
    }
    return -1
  }

  /** multipart/mixed -> list of (content-type, body). Boundary is taken from the first line of the payload. */
  private fun parseMultipart(raw: ByteArray): List<Pair<String, ByteArray>> {
    val firstEol = indexOf(raw, "\r\n".toByteArray(), 0)
    if (firstEol < 3) throw IllegalStateException("Unexpected engine result format")
    val delim = raw.copyOfRange(0, firstEol)             // "--boundary"
    val sep = "\r\n".toByteArray() + delim               // "\r\n--boundary"
    val out = ArrayList<Pair<String, ByteArray>>()
    var pos = firstEol + 2
    while (pos < raw.size) {
      val hdrEnd = indexOf(raw, "\r\n\r\n".toByteArray(), pos)
      if (hdrEnd < 0) break
      val headers = String(raw, pos, hdrEnd - pos, Charsets.ISO_8859_1)
      val bodyStart = hdrEnd + 4
      val next = indexOf(raw, sep, bodyStart)
      val bodyEnd = if (next < 0) raw.size else next
      val ctype = Regex("(?i)content-type:\\s*([^\\r\\n]+)").find(headers)?.groupValues?.get(1)?.trim() ?: ""
      out.add(ctype to raw.copyOfRange(bodyStart, bodyEnd))
      if (next < 0) break
      pos = next + sep.size
      if (pos + 2 <= raw.size && raw[pos] == '-'.code.toByte() && raw[pos + 1] == '-'.code.toByte()) break
      pos += 2 // CRLF after the boundary
    }
    return out
  }

  /**
   * The engine was built against a newer libc++ than the one React Native ships, and both are called
   * libc++_shared.so. The engine's copy is bundled as libyuecxx.so and exposed under the real name in a private
   * folder that comes first on LD_LIBRARY_PATH, so the engine resolves its own runtime.
   */
  private fun prepareRuntime(): File {
    val dir = File(ctx().filesDir, "engine-runtime")
    if (!dir.isDirectory && !dir.mkdirs()) throw IllegalStateException("Cannot create runtime folder")
    val target = File(ctx().applicationInfo.nativeLibraryDir, "libyuecxx.so")
    if (!target.isFile) throw IllegalStateException("Engine C++ runtime is missing from this build")
    val link = File(dir, "libc++_shared.so")
    link.delete()
    Os.symlink(target.absolutePath, link.absolutePath)
    return dir
  }

  private fun healthy(): Boolean = try {
    val c = URL("http://127.0.0.1:$port/health").openConnection() as HttpURLConnection
    c.connectTimeout = 800; c.readTimeout = 800
    val ok = c.responseCode == 200
    c.disconnect(); ok
  } catch (e: Exception) { false }

  override fun definition() = ModuleDefinition {
    Name("YueEngine")

    Function("nativeLibraryDir") { ctx().applicationInfo.nativeLibraryDir }

    // Private app storage: files written here are owned by this app, so the engine child process can read them.
    Function("modelsDir") {
      File(ctx().filesDir, "models").also { it.mkdirs() }.absolutePath
    }

    Function("songsDir") { File(ctx().filesDir, "songs").also { it.mkdirs() }.absolutePath }

    Function("fileSize") { path: String -> File(path).let { if (it.isFile) it.length().toDouble() else -1.0 } }

    Function("freeStorageBytes") { ctx().filesDir.usableSpace.toDouble() }

    Function("availableMemoryBytes") {
      val am = ctx().getSystemService(android.content.Context.ACTIVITY_SERVICE) as android.app.ActivityManager
      val mi = android.app.ActivityManager.MemoryInfo()
      am.getMemoryInfo(mi)
      mi.availMem.toDouble()
    }

    Function("hasEngineBinary") {
      File(ctx().applicationInfo.nativeLibraryDir, "libyueserver_portable.so").isFile
    }

    // options: threads (0 = engine default), maxSeq, gentle
    Function("start") { modelPath: String, vaePath: String, threads: Int, maxSeq: Int, gentle: Boolean ->
      if (process?.isAlive == true) return@Function "already-running"
      val lib = ctx().applicationInfo.nativeLibraryDir
      val exe = File(lib, "libyueserver_portable.so")
      if (!exe.isFile) throw IllegalStateException("Engine binary not found in $lib")
      val backends = prepareBackends()
      val adapters = File(ctx().filesDir, "adapters").apply { mkdirs() }
      val args = arrayListOf(
        exe.absolutePath, "--model", modelPath, "--vae", vaePath,
        "--host", "127.0.0.1", "--port", port.toString(), "--device", "CPU",
        "--max-seq", maxSeq.toString(), "--max-batch", "1", "--adapters", adapters.absolutePath
      )
      val pb = ProcessBuilder(args).redirectErrorStream(true).directory(ctx().filesDir)
      val env = pb.environment()
      listOf("VK_DRIVER_FILES", "VK_ICD_FILENAMES", "GGML_BACKEND_PATH", "TU_KGSL_PRIORITY").forEach { env.remove(it) }
      env["LD_LIBRARY_PATH"] = prepareRuntime().absolutePath + ":" + lib
      env["GGML_DISABLE_VULKAN"] = "1"
      env["YUE_BACKEND_DIR"] = backends.absolutePath
      env["HOME"] = ctx().filesDir.absolutePath
      env["TMPDIR"] = ctx().cacheDir.absolutePath
      if (threads > 0) env["YUE_THREADS"] = threads.toString()
      if (gentle) { env["YUE_AR_PAUSE_MS"] = "15"; env["YUE_NAR_PAUSE_MS"] = "1500" }
      exitCode = null
      log("[YueEngine] start: $args threads=$threads gentle=$gentle")
      val p = pb.start()
      process = p
      Thread {
        try {
          BufferedReader(InputStreamReader(p.inputStream)).forEachLine { log(it) }
        } catch (_: Exception) {}
        exitCode = try { p.waitFor() } catch (_: Exception) { -1 }
        log("[YueEngine] exited code=$exitCode")
      }.also { it.isDaemon = true }.start()
      "started"
    }

    Function("stop") {
      process?.destroy()
      process = null
      "stopped"
    }

    Function("status") {
      mapOf(
        "running" to (process?.isAlive == true),
        "healthy" to healthy(),
        "exitCode" to exitCode
      )
    }

    Function("recentLog") { n: Int ->
      synchronized(logLines) { logLines.toList().takeLast(n) }
    }

    // One job at a time. Submits the request, waits for the engine, writes <outDir>/<tag>.mp3 and .json.
    AsyncFunction("generate") { requestJson: String, outDir: String, tag: String ->
      if (!busy.compareAndSet(false, true)) throw IllegalStateException("A song is already being generated")
      try {
        cancelled = false
        val id = submit(requestJson)
        currentJob = id
        log("[YueEngine] job $id submitted")
        var status = "running"
        while (status == "running" || status == "queued") {
          Thread.sleep(1500)
          if (process?.isAlive != true) throw IllegalStateException("The song engine stopped (exit code $exitCode)")
          status = jobStatus(id)
        }
        if (status == "cancelled" || cancelled) throw IllegalStateException("cancelled")
        if (status != "done") throw IllegalStateException("Song generation $status")
        val raw = fetchResult(id)
        val dir = File(outDir).apply { mkdirs() }
        val parts = parseMultipart(raw)
        var audio: File? = null
        var replay: String? = null
        for ((ctype, body) in parts) {
          if (ctype.contains("json") && replay == null) replay = String(body, Charsets.UTF_8)
          else if ((ctype.contains("mpeg") || ctype.contains("audio")) && audio == null) {
            audio = File(dir, "$tag.mp3").also { it.writeBytes(body) }
          }
        }
        if (audio == null) throw IllegalStateException("The engine returned no audio")
        if (replay != null) File(dir, "$tag.json").writeText(replay)
        mapOf("audioPath" to audio.absolutePath, "replayJson" to (replay ?: ""))
      } finally {
        currentJob = null
        busy.set(false)
      }
    }

    Function("cancel") {
      val id = currentJob
      if (id != null) {
        cancelled = true
        try {
          val c = URL("http://127.0.0.1:$port/job?id=$id&cancel=1").openConnection() as HttpURLConnection
          c.requestMethod = "POST"; c.doOutput = true; c.outputStream.close(); c.responseCode; c.disconnect()
        } catch (_: Exception) {}
      }
      id != null
    }

    // Copies a finished song into the public Music/NameSinger folder (MediaStore, no storage permission needed).
    Function("saveToMusic") { path: String, displayName: String ->
      val src = File(path)
      val values = android.content.ContentValues().apply {
        put(android.provider.MediaStore.Audio.Media.DISPLAY_NAME, "$displayName.mp3")
        put(android.provider.MediaStore.Audio.Media.MIME_TYPE, "audio/mpeg")
        put(android.provider.MediaStore.Audio.Media.RELATIVE_PATH, "Music/NameSinger")
        put(android.provider.MediaStore.Audio.Media.IS_PENDING, 1)
      }
      val resolver = ctx().contentResolver
      val collection = android.provider.MediaStore.Audio.Media.getContentUri(android.provider.MediaStore.VOLUME_EXTERNAL_PRIMARY)
      val uri = resolver.insert(collection, values) ?: throw IllegalStateException("Could not create the audio file")
      resolver.openOutputStream(uri)!!.use { out -> src.inputStream().use { it.copyTo(out) } }
      values.clear(); values.put(android.provider.MediaStore.Audio.Media.IS_PENDING, 0)
      resolver.update(uri, values, null, null)
      uri.toString()
    }

    Function("shareUri") { uri: String, title: String ->
      val send = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
        type = "audio/mpeg"
        putExtra(android.content.Intent.EXTRA_STREAM, android.net.Uri.parse(uri))
        putExtra(android.content.Intent.EXTRA_TEXT, title)
        addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      val chooser = android.content.Intent.createChooser(send, title).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
      ctx().startActivity(chooser)
      true
    }
  }
}
