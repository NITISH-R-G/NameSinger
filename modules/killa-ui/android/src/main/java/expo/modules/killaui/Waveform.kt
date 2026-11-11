package expo.modules.killaui

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
