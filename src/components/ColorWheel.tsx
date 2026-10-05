import { useEffect, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import { useAppStyles } from '../theme/styles';
import { LinearGradient } from 'expo-linear-gradient';
import { Hsv, hexToHsv, hsvToHex, normalizeColor } from '../theme/accent';
import { layoutDistance } from '../lib/display-scale';

export function ColorWheel({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const s = useAppStyles();
  const size = 250;
  const center = size / 2;
  const ringRadius = 105;
  const squareSize = 126;
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const latest = useRef({ hsv, onChange });
  latest.current = { hsv, onChange };
  useEffect(() => { if (/^#[0-9a-f]{6}$/i.test(value) && normalizeColor(value) !== hsvToHex(latest.current.hsv)) setHsv(hexToHsv(value)); }, [value]);
  const update = (next: Hsv) => { setHsv(next); latest.current.hsv = next; latest.current.onChange(hsvToHex(next)); };
  const chooseHue = (x: number, y: number) => {
    const angle = Math.atan2(layoutDistance(y) - center, layoutDistance(x) - center) * 180 / Math.PI;
    update({ ...latest.current.hsv, h: (angle + 360) % 360 });
  };
  const chooseShade = (x: number, y: number) => update({ ...latest.current.hsv, s: Math.max(0, Math.min(1, layoutDistance(x) / squareSize)), v: 1 - Math.max(0, Math.min(1, layoutDistance(y) / squareSize)) });
  const wheelPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: event => chooseHue(event.nativeEvent.locationX, event.nativeEvent.locationY),
    onPanResponderMove: event => chooseHue(event.nativeEvent.locationX, event.nativeEvent.locationY),
  })).current;
  const shadePan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: event => chooseShade(event.nativeEvent.locationX, event.nativeEvent.locationY),
    onPanResponderMove: event => chooseShade(event.nativeEvent.locationX, event.nativeEvent.locationY),
  })).current;
  const hueRadians = hsv.h * Math.PI / 180;
  return (
    <View style={[s.colorWheel, { width: size, height: size }]} {...wheelPan.panHandlers}>
      {Array.from({ length: 120 }, (_, index) => {
        const angle = index / 120 * Math.PI * 2;
        return <View key={index} pointerEvents="none" style={[s.hueDot, { left: center + Math.cos(angle) * ringRadius - 7, top: center + Math.sin(angle) * ringRadius - 7, backgroundColor: hsvToHex({ h: index * 3, s: 1, v: 1 }) }]} />;
      })}
      <View pointerEvents="none" style={[s.hueCursor, { left: center + Math.cos(hueRadians) * ringRadius - 9, top: center + Math.sin(hueRadians) * ringRadius - 9 }]} />
      <View style={[s.shadeSquare, { width: squareSize, height: squareSize, left: center - squareSize / 2, top: center - squareSize / 2, backgroundColor: hsvToHex({ h: hsv.h, s: 1, v: 1 }) }]} {...shadePan.panHandlers}>
        <LinearGradient pointerEvents="none" colors={['#ffffff', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
        <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', '#000000']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
        <View pointerEvents="none" style={[s.shadeCursor, { left: hsv.s * squareSize - 8, top: (1 - hsv.v) * squareSize - 8 }]} />
      </View>
    </View>
  );
}
