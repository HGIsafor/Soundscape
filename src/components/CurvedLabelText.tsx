import { StyleSheet, Text, View } from 'react-native';
import { useAppStyles } from '../theme/styles';

export function CurvedLabelText({ text, compact }: { text: string; compact: boolean }) {
  const s = useAppStyles();
  const characters = text.split('');
  const arc = (bottom: boolean) => characters.map((character, index) => {
    const progress = characters.length <= 1 ? 0.5 : index / (characters.length - 1);
    const degrees = bottom ? 37.5 + progress * 105 : 217.5 + progress * 105;
    const radians = degrees * Math.PI / 180;
    return <Text key={`${bottom ? 'bottom' : 'top'}-${index}`} style={[s.curvedLabelCharacter, compact && s.curvedLabelCharacterMobile, { left: `${50 + Math.cos(radians) * 35}%`, top: `${50 + Math.sin(radians) * 35}%`, transform: [{ translateX: -3.5 }, { translateY: -4 }, { rotate: `${degrees + 90}deg` }] }]}>{character}</Text>;
  });
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>{arc(false)}{arc(true)}</View>;
}
