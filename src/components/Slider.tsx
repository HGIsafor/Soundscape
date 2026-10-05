import { useContext, useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, Text, View } from 'react-native';
import { useAppStyles } from '../theme/styles';
import { AccentContext } from '../theme/accent';
import { layoutDistance } from '../lib/display-scale';

export function Slider({ label, value, onChange, transition }: { label: string; value: number; onChange: (v: number) => void; transition: number }) {
  const s = useAppStyles();
  const accent = useContext(AccentContext);
  const [width, setWidth] = useState(1);
  const animatedValue = useRef(new Animated.Value(value)).current;
  const previousTransition = useRef(transition);
  const latest = useRef({ width, onChange });
  latest.current = { width, onChange };
  useEffect(() => {
    if (previousTransition.current !== transition) {
      previousTransition.current = transition;
      Animated.timing(animatedValue, { toValue: value, duration: 260, useNativeDriver: false }).start();
    } else {
      animatedValue.stopAnimation();
      animatedValue.setValue(value);
    }
  }, [value, transition, animatedValue]);
  const animatedPosition = animatedValue.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });
  const setFromX = (x: number) => latest.current.onChange(Math.round(Math.max(0, Math.min(100, layoutDistance(x) / latest.current.width * 100))));
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: e => setFromX(e.nativeEvent.locationX),
    onPanResponderMove: e => setFromX(e.nativeEvent.locationX),
  })).current;

  return (
    <View style={s.control}>
      <View style={s.controlTop}><Text style={s.controlLabel}>{label}</Text><Text style={s.controlValue}>{value}%</Text></View>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: value }}
        onLayout={e => setWidth(e.nativeEvent.layout.width)}
        style={s.touchTrack}
        {...pan.panHandlers}
      >
        <View style={s.track}>
          <Animated.View style={[s.fill, { width: animatedPosition, backgroundColor: accent }]} />
          <Animated.View style={[s.thumb, { left: animatedPosition }]} />
        </View>
      </View>
    </View>
  );
}
