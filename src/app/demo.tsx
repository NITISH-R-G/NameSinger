import { useLocalSearchParams } from 'expo-router';

import { DemoSongScreen } from '../components/demo/DemoSongScreen';
import { demoSongById } from '../demo/demoSongs';

/** A bundled, pre-generated demo song. Reached only by the link namesinger://demo?song=isabella; nothing in the app links here. */
export default function DemoRoute() {
  const { song } = useLocalSearchParams<{ song?: string }>();
  return <DemoSongScreen song={demoSongById(typeof song === 'string' ? song : undefined)} />;
}
