import { useContext, useRef } from 'react';
import { PanResponder, View } from 'react-native';
import { useAppStyles } from '../theme/styles';
import { AccentContext } from '../theme/accent';
import { layoutDistance } from '../lib/display-scale';

export function SeekBar({ value, duration, onPreview, onCommit }: { value: number; duration: number; onPreview: (value: number) => void; onCommit: (value: number) => void }) {
  const s = useAppStyles();
  const accent = useContext(AccentContext);
  const latest = useRef({ width: 1, value, duration, onPreview, onCommit });
  latest.current = { ...latest.current, value, duration, onPreview, onCommit };
  const seekFromX = (x: number, commit = false) => {
    const next = Math.round(Math.max(0, Math.min(latest.current.duration, layoutDistance(x) / latest.current.width * latest.current.duration)));
    latest.current.value = next;
    latest.current.onPreview(next);
    if (commit) latest.current.onCommit(next);
  };
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: event => seekFromX(event.nativeEvent.locationX),
    onPanResponderMove: event => seekFromX(event.nativeEvent.locationX),
    onPanResponderRelease: event => seekFromX(event.nativeEvent.locationX, true),
  })).current;
  const width: `${number}%` = duration ? `${Math.min(100, value / duration * 100)}%` : '0%';
  return <View onLayout={event => { latest.current.width = event.nativeEvent.layout.width; }} style={s.seekTouch} {...pan.panHandlers}><View style={s.progressTrack}><View style={[s.progressFill, { width, backgroundColor: accent }]} /><View style={[s.seekThumb, { left: width }]} /></View></View>;
}
