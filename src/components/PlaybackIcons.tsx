import { View } from 'react-native';
import { useAppStyles } from '../theme/styles';

export function PlayPauseIcon({ playing }: { playing: boolean }) {
  const s = useAppStyles();
  return playing
    ? <View style={s.pauseIcon}><View style={s.pauseBar} /><View style={s.pauseBar} /></View>
    : <View style={s.playTriangle} />;
}

export function SkipIcon({ direction }: { direction: 'previous' | 'next' }) {
  const s = useAppStyles();
  return direction === 'previous'
    ? <View style={s.skipIcon}><View style={s.skipStem} /><View style={s.skipTriangleLeft} /></View>
    : <View style={s.skipIcon}><View style={s.skipTriangleRight} /><View style={s.skipStem} /></View>;
}
