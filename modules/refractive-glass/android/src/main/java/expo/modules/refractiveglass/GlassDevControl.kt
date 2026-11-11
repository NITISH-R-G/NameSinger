package expo.modules.refractiveglass

import android.content.Context
import android.content.pm.ApplicationInfo
import android.os.Handler
import android.os.Looper
import android.util.Log
import org.json.JSONObject
import java.io.File

/**
 * TEMPORARY, development only: phase 2 performance instrumentation. Not a feature.
 *
 * It lets a measurement script drive the glass counters and the on/off switch from outside the app,
 * with no UI and no JavaScript involved. It does nothing unless the app is a debuggable build, and it
 * only ever reads one small file in the app's own cache directory:
 *
 *   adb shell run-as com.namesinger.app sh -c 'echo "enabled=1 seq=3 action=reset" > cache/glass-dev.cmd'
 *
 *   enabled=0|1    glass off (panes skip refraction) or on. The file's absence means on.
 *   seq=<token>    a command runs once each time this value changes
 *   action=reset   zero the counters (GlassStats.reset)
 *   action=dump    write the counters to logcat as one JSON line, tag "GlassDev"
 *
 * To remove it: delete this file, delete the one `GlassDevControl.start(...)` call in
 * RefractiveGlassModule, and delete the `GlassStats.enabled` check in RefractiveGlassView.dispatchDraw.
 */
internal object GlassDevControl {
  private const val TAG = "GlassDev"
  private const val FILE_NAME = "glass-dev.cmd"
  private const val POLL_MS = 500L

  private var started = false
  private var lastSeq: String? = null

  fun start(context: Context) {
    if (started) return
    val debuggable = (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
    if (!debuggable) return
    started = true
    val file = File(context.cacheDir, FILE_NAME)
    val handler = Handler(Looper.getMainLooper())
    val tick = object : Runnable {
      override fun run() {
        try {
          poll(file)
        } catch (error: Throwable) {
          Log.w(TAG, "poll failed", error)
        }
        handler.postDelayed(this, POLL_MS)
      }
    }
    handler.post(tick)
    Log.i(TAG, "dev control active (debuggable build); command file ${file.absolutePath}")
  }

  /** Runs on the main thread, the same thread that draws, so the counters are never read mid-update. */
  private fun poll(file: File) {
    val fields = if (file.exists()) parse(file.readText()) else emptyMap()
    val wanted = fields["enabled"] != "0"
    if (wanted != GlassStats.enabled) {
      GlassStats.enabled = wanted
      GlassRegistry.invalidateAll()
      Log.i(TAG, "glass ${if (wanted) "ON" else "OFF"}")
    }
    val seq = fields["seq"] ?: return
    if (seq == lastSeq) return
    lastSeq = seq
    when (fields["action"]) {
      "reset" -> {
        GlassStats.reset()
        Log.i(TAG, "reset seq=$seq")
      }
      "dump" -> Log.i(TAG, "stats seq=$seq ${JSONObject(GlassStats.snapshot())}")
    }
  }

  private fun parse(text: String): Map<String, String> =
    text.trim().split(Regex("\\s+")).mapNotNull { token ->
      val i = token.indexOf('=')
      if (i > 0) token.substring(0, i) to token.substring(i + 1) else null
    }.toMap()
}
