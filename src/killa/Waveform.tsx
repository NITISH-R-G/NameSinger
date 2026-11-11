import { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { killa } from './tokens';

interface WaveformProps {
  /** Peak levels 0..1 from the real audio; empty while unavailable. */
  peaks: number[];
  /** Seconds. */
  position: number;
  duration: number;
  onSeek: (seconds: number) => void;
}

const HEIGHT = 72;
const BAR = 4;
const GAP = 3;

function clock(sec: number) {
  const t = Math.max(0, Math.floor(sec));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** The song's own shape as the timeline: bars so far are gold, the rest dim. Drag or tap to seek. */
export function Waveform({ peaks, position, duration, onSeek }: WaveformProps) {
  const [width, setWidth] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const widthRef = useRef(0);
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const seekRef = useRef(onSeek);
  seekRef.current = onSeek;

  const fraction = scrub ?? (duration > 0 ? Math.min(1, position / duration) : 0);
  const count = width > 0 ? Math.max(8, Math.floor((width + GAP) / (BAR + GAP))) : 0;

  const bars = useMemo(() => {
    if (count === 0) return [];
    return Array.from({ length: count }, (_, i) => {
      if (peaks.length === 0) return 0.12;
      const v = peaks[Math.min(peaks.length - 1, Math.floor((i / count) * peaks.length))] ?? 0;
      return Math.max(0.1, v);
    });
  }, [peaks, count]);

  const pan = useMemo(() => {
    const frac = (x: number) => Math.max(0, Math.min(1, x / Math.max(1, widthRef.current)));
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => setScrub(frac(e.nativeEvent.locationX)),
      onPanResponderMove: (e) => setScrub(frac(e.nativeEvent.locationX)),
      onPanResponderRelease: (e) => {
        const f = frac(e.nativeEvent.locationX);
        setScrub(null);
        seekRef.current(f * durationRef.current);
      },
      onPanResponderTerminate: () => setScrub(null),
    });
  }, []);

  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
    setWidth(e.nativeEvent.layout.width);
  };

  const shownPos = scrub !== null ? scrub * duration : position;

  return (
    <View>
      <View
        {...pan.panHandlers}
        onLayout={onLayout}
        style={styles.track}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Playback position"
        accessibilityValue={{ text: `${clock(shownPos)} of ${clock(duration)}` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          const step = e.nativeEvent.actionName === 'increment' ? 5 : -5;
          seekRef.current(Math.max(0, Math.min(durationRef.current, position + step)));
        }}
      >
        {width > 0 ? (
          <Svg width={width} height={HEIGHT}>
            {bars.map((v, i) => {
              const h = Math.max(4, v * (HEIGHT - 8));
              const played = (i + 0.5) / count <= fraction;
              return (
                <Rect
                  key={i}
                  x={i * (BAR + GAP)}
                  y={(HEIGHT - h) / 2}
                  width={BAR}
                  height={h}
                  rx={BAR / 2}
                  fill={played ? killa.accent : '#4A402A'}
                />
              );
            })}
            <Rect x={Math.max(0, Math.min(width - 2, fraction * width - 1))} y={0} width={2} height={HEIGHT} rx={1} fill={killa.hi} />
          </Svg>
        ) : null}
      </View>
      <View style={styles.times}>
        <Text style={styles.time}>{clock(shownPos)}</Text>
        <Text style={styles.time}>{clock(duration)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: HEIGHT, justifyContent: 'center' },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  time: { fontFamily: killa.textFont, fontSize: 14, color: killa.dim },
});
