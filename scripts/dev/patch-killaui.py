"""One-off patch: Vinyl record view, waveform extractor, removal of the old Deck/RecordSpin. (Kept for provenance.)"""
import os, re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
J = os.path.join(ROOT, "modules", "killa-ui", "android", "src", "main", "java")
SKIN = os.path.join(J, "ai", "jackknife", "killayue", "Skin.java")
KT = os.path.join(J, "expo", "modules", "killaui", "KillaUiModule.kt")
VINYL = os.path.join(J, "ai", "jackknife", "killayue", "Vinyl.java")


def rw(path, fn):
    s = open(path, encoding="utf-8").read()
    s2 = fn(s)
    assert s2 != s, path
    open(path, "w", encoding="utf-8", newline="\n").write(s2)


# --- Skin: plain artwork again (Vinyl paints its own face) and drop the earlier overlay helper
def skin(s):
    s = s.replace('dial = withoutLettering(bitmap(c, "dial"));', 'dial = bitmap(c, "dial");')
    a = s.index("    /**\n     * NameSinger: Killa's record artwork has the Killa YuE lettering")
    b = s.index("    private static Bitmap bitmap(Context c, String name)")
    return s[:a] + s[b:]


rw(SKIN, skin)

# --- Vinyl: leave margin around the disc for the glow
rw(VINYL, lambda s: s.replace("int s = Math.min(w, h) & ~1; // even, so the centre falls on a pixel edge",
                              "int s = (int) (Math.min(w, h) * 0.8f) & ~1; // 80% of the view (the glow needs room), even so the centre falls on a pixel edge"))


# --- Kotlin module
def kt(s):
    s = s.replace("import ai.jackknife.killayue.Deck\n", "").replace("import ai.jackknife.killayue.RecordSpin\n", "import ai.jackknife.killayue.Vinyl\n")
    # definition: record view with speed, deck view removed, waveform added
    s = s.replace('''    View(KillaRecordView::class) {
      Prop("spinning") { view: KillaRecordView, v: Boolean -> view.record.setSpinning(v) }
    }

    View(KillaDeckView::class) {
      Prop("source") { view: KillaDeckView, v: String? -> view.setSong(v) }
      Prop("title") { view: KillaDeckView, v: String -> view.deck.setTitle(v) }
      AsyncFunction("replay") { view: KillaDeckView -> view.deck.replay() }
    }''', '''    View(KillaRecordView::class) {
      // degrees per second: 0 stops the record (it eases to a stop), 200 is a 33 rpm record
      Prop("speed") { view: KillaRecordView, v: Double -> view.record.setSpeed(v.toFloat()) }
    }

    // The real amplitude shape of an audio file, as `bars` values from 0 to 1, for the playback timeline.
    AsyncFunction("waveform") { path: String, bars: Int -> Waveform.peaks(path, bars) }''')
    s = s.replace("val record: RecordSpin", "val record: Vinyl").replace("record = RecordSpin(context)", "record = Vinyl(context)")
    # drop the deck view class
    a = s.index("class KillaDeckView(")
    b = s.index("/** One rounded group of options")
    s = s[:a] + s[b:]
    return s


rw(KT, kt)

# --- Waveform extractor
open(os.path.join(J, "expo", "modules", "killaui", "Waveform.kt"), "w", encoding="utf-8", newline="\n").write('''package expo.modules.killaui

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import java.nio.ByteOrder

/** Decodes an audio file with the platform codec and reduces it to peak levels. Returns an empty list if it cannot be decoded. */
object Waveform {
  fun peaks(path: String, bars: Int): List<Double> {
    val n = bars.coerceIn(8, 400)
    val ex = MediaExtractor()
    var codec: MediaCodec? = null
    try {
      ex.setDataSource(path)
      var track = -1
      var format: MediaFormat? = null
      for (i in 0 until ex.trackCount) {
        val f = ex.getTrackFormat(i)
        if ((f.getString(MediaFormat.KEY_MIME) ?: "").startsWith("audio/")) { track = i; format = f; break }
      }
      if (track < 0 || format == null) return emptyList()
      ex.selectTrack(track)
      val channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT).coerceAtLeast(1)
      codec = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
      codec.configure(format, null, null, 0)
      codec.start()
      val info = MediaCodec.BufferInfo()
      val frames = ArrayList<Float>() // peak of each ~1024-frame block, 0..1
      var inputDone = false
      var outputDone = false
      var block = 0f
      var inBlock = 0
      while (!outputDone) {
        if (!inputDone) {
          val ii = codec.dequeueInputBuffer(10_000)
          if (ii >= 0) {
            val buf = codec.getInputBuffer(ii)!!
            val size = ex.readSampleData(buf, 0)
            if (size < 0) {
              codec.queueInputBuffer(ii, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inputDone = true
            } else {
              codec.queueInputBuffer(ii, 0, size, ex.sampleTime, 0)
              ex.advance()
            }
          }
        }
        val oi = codec.dequeueOutputBuffer(info, 10_000)
        if (oi >= 0) {
          val out = codec.getOutputBuffer(oi)!!
          out.order(ByteOrder.LITTLE_ENDIAN)
          val sb = out.asShortBuffer()
          val total = info.size / 2
          var i = 0
          while (i + channels <= total) {
            var m = 0
            for (c in 0 until channels) { val v = Math.abs(sb.get(i + c).toInt()); if (v > m) m = v }
            if (m / 32768f > block) block = m / 32768f
            inBlock++
            if (inBlock == 1024) { frames.add(block); block = 0f; inBlock = 0 }
            i += channels
          }
          codec.releaseOutputBuffer(oi, false)
          if ((info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) outputDone = true
        }
      }
      if (inBlock > 0) frames.add(block)
      if (frames.isEmpty()) return emptyList()
      val out = DoubleArray(n)
      for (b in 0 until n) {
        val from = (b.toLong() * frames.size / n).toInt()
        val to = ((b + 1).toLong() * frames.size / n).toInt().coerceAtLeast(from + 1).coerceAtMost(frames.size)
        var m = 0f
        for (k in from until to) if (frames[k] > m) m = frames[k]
        out[b] = m.toDouble()
      }
      val top = out.maxOrNull() ?: 1.0
      return out.map { if (top > 0) it / top else 0.0 }
    } catch (e: Exception) {
      return emptyList()
    } finally {
      try { codec?.stop(); codec?.release() } catch (_: Exception) {}
      ex.release()
    }
  }
}
''')
print("patched")
