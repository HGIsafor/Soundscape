import { View } from 'react-native';
import { useAppStyles } from '../theme/styles';

export function TurntableNavIcon({ active }: { active: boolean }) {
  const s = useAppStyles();
  return <View style={[s.turntableNavIcon, active && s.navDeckActive]}><View style={[s.navPlatter, active && s.navIconShapeActive]}><View style={[s.navPlatterLabel, active && s.navIconShapeActive]}><View style={[s.navSpindle, active && s.navIconSolidActive]} /></View></View><View style={[s.navTonearmBase, active && s.navIconShapeActive]} /><View style={[s.navTonearm, active && s.navIconSolidActive]}><View style={[s.navTonearmHead, active && s.navIconSolidActive]} /></View><View style={[s.navDeckButton, active && s.navIconSolidActive]} /></View>;
}

export function EqualizerNavIcon({ active }: { active: boolean }) {
  const s = useAppStyles();
  return <View style={s.equalizerNavIcon}>{[15, 5, 11].map((top, index) => <View key={index} style={s.navFaderColumn}><View style={[s.navFaderTrack, active && s.navIconSolidActive]} /><View style={[s.navFaderKnob, { top }, active && s.navFaderKnobActive]} /></View>)}</View>;
}
