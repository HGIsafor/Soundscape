import * as ImagePicker from 'expo-image-picker';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, SafeAreaView,
  Image, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View,
} from 'react-native';
import { supabase } from './lib/supabase';
import { coverColor } from './lib/cover-color';
import { StatsPage } from './lib/StatsPage';
import { loadSpotifyToken, refreshSpotifyToken, saveSpotifyToken, spotifyApi, spotifyDiscovery, spotifyScopes, SpotifyToken } from './lib/spotify';

// A direct visit to the callback has no opener and Expo throws here, which used
// to prevent React from mounting and left the user on a completely white page.
let spotifyBrowserCompletion: ReturnType<typeof WebBrowser.maybeCompleteAuthSession> | null = null;
if (Platform.OS === 'web') {
  try { spotifyBrowserCompletion = WebBrowser.maybeCompleteAuthSession(); } catch { /* handled in App */ }
}

const C = { bg: '#000', surface: '#121212', raised: '#1f1f1f', line: '#535353', text: '#fff', muted: '#b3b3b3', green: '#1ed760' };
const AccentContext = createContext(C.green);
const accentForeground = (hex: string) => {
  const channels = [1, 3, 5].map(index => {
    const value = parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance < 0.05 ? '#ddd' : '#050505';
};
const accentHeadingGlow = (hex: string, thickness = 0.35) => accentForeground(hex) === '#ddd'
  ? ({ textShadow: `${thickness}px 0 #ddd, -${thickness}px 0 #ddd, 0 ${thickness}px #ddd, 0 -${thickness}px #ddd` } as any)
  : {};
function contrastStyles(accent: string) {
  const color = accentForeground(accent);
  return {
    ...s,
    pauseBar: { ...s.pauseBar, backgroundColor: color },
    playTriangle: { ...s.playTriangle, borderLeftColor: color },
    navDeckActive: { ...s.navDeckActive, borderColor: color },
    navIconShapeActive: { ...s.navIconShapeActive, borderColor: color },
    navIconSolidActive: { ...s.navIconSolidActive, backgroundColor: color },
    navFaderKnobActive: { ...s.navFaderKnobActive, backgroundColor: color, borderColor: color },
    confirmText: { ...s.confirmText, color },
    presetTextActive: { ...s.presetTextActive, color },
    saveHeaderText: { ...s.saveHeaderText, color },
    spotifyAccountButtonText: { ...s.spotifyAccountButtonText, color },
    sessionHostText: { ...s.sessionHostText, color },
    useSuggestionText: { ...s.useSuggestionText, color },
  };
}
const normalizeColor = (value?: string) => /^#[0-9a-f]{6}$/i.test(value ?? '') ? value!.toLowerCase() : C.green;
const colorAlpha = (hex: string, alpha: number) => {
  const color = normalizeColor(hex).slice(1);
  return `rgba(${parseInt(color.slice(0, 2), 16)},${parseInt(color.slice(2, 4), 16)},${parseInt(color.slice(4, 6), 16)},${alpha})`;
};
const darkenColor = (hex: string, amount = 0.45) => {
  const color = normalizeColor(hex).slice(1);
  return `#${[0, 2, 4].map(index => Math.round(parseInt(color.slice(index, index + 2), 16) * amount).toString(16).padStart(2, '0')).join('')}`;
};
type Hsv = { h: number; s: number; v: number };
const hsvToHex = ({ h, s, v }: Hsv) => {
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b].map(channel => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('')}`;
};
const hexToHsv = (hex: string): Hsv => {
  const clean = normalizeColor(hex).slice(1);
  const [r, g, b] = [0, 2, 4].map(index => parseInt(clean.slice(index, index + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const h = delta === 0 ? 0 : max === r ? 60 * (((g - b) / delta) % 6) : max === g ? 60 * ((b - r) / delta + 2) : 60 * ((r - g) / delta + 4);
  return { h: (h + 360) % 360, s: max === 0 ? 0 : delta / max, v: max };
};
type Values = { bass: number; mid: number; treble: number; ambience: number; gain: number };
type Profile = { id: string; name: string; values: Values };
type Account = { id: string; email: string; name: string; avatarPath?: string; avatarUrl?: string; favoriteColor: string; followCover: boolean };
type SpotifyTrack = { id?: string; uri?: string; title: string; artist: string; album?: string; artwork?: string; durationMs: number; progressMs: number };
const spotifyTrackKey = (track: SpotifyTrack) => track.uri ?? track.id ?? `${track.title}\u0000${track.artist}`;
const sameSpotifyTrack = (left: SpotifyTrack | null | undefined, right: SpotifyTrack | null | undefined) => !!left && !!right && spotifyTrackKey(left) === spotifyTrackKey(right);
type SharedSession = { id: string; code: string; hostUserId: string };
type LyricLine = { timeMs: number; text: string };
type LyricsResult = { synced: LyricLine[]; plain: string[]; instrumental: boolean };
const parseSyncedLyrics = (source: string): LyricLine[] => source.split(/\r?\n/).flatMap(row => {
  const match = row.match(/^\[(\d{1,3}):(\d{2}(?:\.\d+)?)\]\s*(.*)$/);
  return match && match[3].trim() ? [{ timeMs: Math.round((Number(match[1]) * 60 + Number(match[2])) * 1000), text: match[3].trim() }] : [];
});
const initials = (name: string) => name.trim().split(/\s+/).filter(Boolean).map(word => word[0]).join('').toUpperCase() || '?';
const EMAIL_TYPOS: Record<string, string> = { 'gmai.com': 'gmail.com', 'gmial.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmail.co': 'gmail.com', 'hotnail.com': 'hotmail.com', 'outlok.com': 'outlook.com', 'yaho.com': 'yahoo.com' };
const DEFAULTS: Profile[] = [
  { id: 'warm', name: 'Warm', values: { bass: 72, mid: 55, treble: 42, ambience: 28, gain: 64 } },
  { id: 'flat', name: 'Flat', values: { bass: 50, mid: 50, treble: 50, ambience: 20, gain: 58 } },
  { id: 'bright', name: 'Bright', values: { bass: 42, mid: 58, treble: 76, ambience: 24, gain: 56 } },
];

function Slider({ label, value, onChange, transition }: { label: string; value: number; onChange: (v: number) => void; transition: number }) {
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
  const setFromX = (x: number) => latest.current.onChange(Math.round(Math.max(0, Math.min(100, x / latest.current.width * 100))));
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

function SeekBar({ value, duration, onPreview, onCommit }: { value: number; duration: number; onPreview: (value: number) => void; onCommit: (value: number) => void }) {
  const accent = useContext(AccentContext);
  const latest = useRef({ width: 1, value, duration, onPreview, onCommit });
  latest.current = { ...latest.current, value, duration, onPreview, onCommit };
  const seekFromX = (x: number, commit = false) => {
    const next = Math.round(Math.max(0, Math.min(latest.current.duration, x / latest.current.width * latest.current.duration)));
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

const DEMO_TRACKS = [
  { title: '-------', artist: 'Connect Spotify to begin', color: '#282828' },
];

const spotifyItemToTrack = (item: any): SpotifyTrack => ({
  id: item?.id,
  uri: item?.uri,
  title: item?.name ?? 'Unknown track',
  artist: item?.artists?.map((artist: { name: string }) => artist.name).join(', ') ?? 'Spotify',
  album: item?.album?.name,
  artwork: item?.album?.images?.[0]?.url,
  durationMs: item?.duration_ms ?? 0,
  progressMs: 0,
});

function PlayPauseIcon({ playing }: { playing: boolean }) {
  const s = contrastStyles(useContext(AccentContext));
  return playing
    ? <View style={s.pauseIcon}><View style={s.pauseBar} /><View style={s.pauseBar} /></View>
    : <View style={s.playTriangle} />;
}

function SkipIcon({ direction }: { direction: 'previous' | 'next' }) {
  return direction === 'previous'
    ? <View style={s.skipIcon}><View style={s.skipStem} /><View style={s.skipTriangleLeft} /></View>
    : <View style={s.skipIcon}><View style={s.skipTriangleRight} /><View style={s.skipStem} /></View>;
}

function TurntableNavIcon({ active }: { active: boolean }) {
  const s = contrastStyles(useContext(AccentContext));
  return <View style={[s.turntableNavIcon, active && s.navDeckActive]}><View style={[s.navPlatter, active && s.navIconShapeActive]}><View style={[s.navPlatterLabel, active && s.navIconShapeActive]}><View style={[s.navSpindle, active && s.navIconSolidActive]} /></View></View><View style={[s.navTonearmBase, active && s.navIconShapeActive]} /><View style={[s.navTonearm, active && s.navIconSolidActive]}><View style={[s.navTonearmHead, active && s.navIconSolidActive]} /></View><View style={[s.navDeckButton, active && s.navIconSolidActive]} /></View>;
}

function EqualizerNavIcon({ active }: { active: boolean }) {
  const s = contrastStyles(useContext(AccentContext));
  return <View style={s.equalizerNavIcon}>{[15, 5, 11].map((top, index) => <View key={index} style={s.navFaderColumn}><View style={[s.navFaderTrack, active && s.navIconSolidActive]} /><View style={[s.navFaderKnob, { top }, active && s.navFaderKnobActive]} /></View>)}</View>;
}

function CurvedLabelText({ text, compact }: { text: string; compact: boolean }) {
  const characters = text.split('');
  const arc = (bottom: boolean) => characters.map((character, index) => {
    const progress = characters.length <= 1 ? 0.5 : index / (characters.length - 1);
    const degrees = bottom ? 37.5 + progress * 105 : 217.5 + progress * 105;
    const radians = degrees * Math.PI / 180;
    return <Text key={`${bottom ? 'bottom' : 'top'}-${index}`} style={[s.curvedLabelCharacter, compact && s.curvedLabelCharacterMobile, { left: `${50 + Math.cos(radians) * 35}%`, top: `${50 + Math.sin(radians) * 35}%`, transform: [{ translateX: -3.5 }, { translateY: -4 }, { rotate: `${degrees + 90}deg` }] }]}>{character}</Text>;
  });
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>{arc(false)}{arc(true)}</View>;
}

function ColorWheel({ value, onChange }: { value: string; onChange: (color: string) => void }) {
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
    const angle = Math.atan2(y - center, x - center) * 180 / Math.PI;
    update({ ...latest.current.hsv, h: (angle + 360) % 360 });
  };
  const chooseShade = (x: number, y: number) => update({ ...latest.current.hsv, s: Math.max(0, Math.min(1, x / squareSize)), v: 1 - Math.max(0, Math.min(1, y / squareSize)) });
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

function MusicPage({ playing, trackIndex, compact, spotifyTrack, spotifyHistory, spotifyNextTrack, spotifyConnected, spotifyError, onConnect, onToggle, onPrevious, onNext, onJump, onSeek }: { playing: boolean; trackIndex: number; compact: boolean; spotifyTrack: SpotifyTrack | null; spotifyHistory: SpotifyTrack[]; spotifyNextTrack: SpotifyTrack | null; spotifyConnected: boolean; spotifyError: string; onConnect: () => void; onToggle: () => void; onPrevious: () => void; onNext: () => void; onJump: (offset: number, track: SpotifyTrack) => void; onSeek: (position: number) => void }) {
  const accent = useContext(AccentContext);
  const spin = useRef(new Animated.Value(0)).current;
  const spinLoop = useRef<Animated.CompositeAnimation | null>(null);
  const spinning = useRef(playing);
  const arm = useRef(new Animated.Value(playing ? 1 : 0)).current;
  const demoTrack = DEMO_TRACKS[trackIndex];
  const track = spotifyTrack ?? { ...demoTrack, durationMs: 222000, progressMs: playing ? 84000 : 0 };
  const [connectionLinkHeight, setConnectionLinkHeight] = useState(28);
  const connectionSpace = spotifyConnected ? 0 : connectionLinkHeight + 24;
  const lyricViewportHeight = Math.max(0, (compact ? 96 : 160) - connectionSpace);
  const coverTracks = useMemo<(SpotifyTrack | null)[]>(() => {
    if (spotifyTrack) {
      return [spotifyHistory.at(-1) ?? null, spotifyTrack, spotifyNextTrack];
    }
    return [null, { ...demoTrack, durationMs: 0, progressMs: 0 }, null];
  }, [spotifyTrack, spotifyHistory, spotifyNextTrack, trackIndex]);
  const [displayProgress, setDisplayProgress] = useState(track.progressMs);
  const [lyrics, setLyrics] = useState<LyricsResult | null>(null);
  const [lyricsState, setLyricsState] = useState<'demo' | 'loading' | 'ready' | 'missing' | 'error'>(spotifyTrack ? 'loading' : 'demo');
  const [lyricsMode, setLyricsMode] = useState<'synced' | 'unsynced'>('synced');
  const [hoveredCover, setHoveredCover] = useState<number | null>(null);
  const lyricSlide = useRef(new Animated.Value(0)).current;
  const syncedScroll = useRef(new Animated.Value(0)).current;
  const unsyncedScroll = useRef(new Animated.Value(0)).current;
  const previousLyric = useRef(-1);
  const lyricsCache = useRef(new Map<string, LyricsResult | null>());
  const displayProgressRef = useRef(track.progressMs);
  const [scrubbing, setScrubbing] = useState(false);
  const vinylGesture = useRef({ lastAngle: 0, spin: 0 });
  const vinylRef = useRef<any>(null);
  const vinylCenter = useRef({ x: 0, y: 0, radius: 1, ready: false });
  const vinylLatest = useRef({ duration: track.durationMs, onSeek });
  vinylLatest.current = { duration: track.durationMs, onSeek };
  const progress: `${number}%` = track.durationMs ? `${Math.min(100, displayProgress / track.durationMs * 100)}%` : '0%';
  const formatTime = (milliseconds: number) => `${Math.floor(milliseconds / 60000)}:${Math.floor(milliseconds % 60000 / 1000).toString().padStart(2, '0')}`;

  const previewProgress = (next: number) => { displayProgressRef.current = next; setDisplayProgress(next); };
  useEffect(() => { previewProgress(track.progressMs); }, [track.title, track.artist, track.progressMs]);
  useEffect(() => {
    if (!spotifyTrack) { setLyrics(null); setLyricsState('demo'); return; }
    const key = `${spotifyTrack.title}|${spotifyTrack.artist}|${Math.round(spotifyTrack.durationMs / 1000)}`;
    if (lyricsCache.current.has(key)) {
      const cached = lyricsCache.current.get(key) ?? null;
      setLyrics(cached);
      setLyricsMode(cached?.synced.length ? 'synced' : 'unsynced');
      setLyricsState(cached ? 'ready' : 'missing');
      return;
    }
    const controller = new AbortController();
    setLyrics(null);
    setLyricsState('loading');
    const query = new URLSearchParams({ track_name: spotifyTrack.title, artist_name: spotifyTrack.artist, duration: String(Math.round(spotifyTrack.durationMs / 1000)) });
    if (spotifyTrack.album) query.set('album_name', spotifyTrack.album);
    fetch(`https://lrclib.net/api/get?${query}`, { signal: controller.signal, headers: { 'Lrclib-Client': 'Soundscape v0.1 (personal project)' } })
      .then(async response => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`Lyrics service returned ${response.status}`);
        const data = await response.json();
        return { synced: parseSyncedLyrics(data.syncedLyrics ?? ''), plain: (data.plainLyrics ?? '').split(/\r?\n/).map((line: string) => line.trim()).filter(Boolean), instrumental: !!data.instrumental } as LyricsResult;
      })
      .then(result => { lyricsCache.current.set(key, result); setLyrics(result); setLyricsMode(result?.synced.length ? 'synced' : 'unsynced'); setLyricsState(result ? 'ready' : 'missing'); })
      .catch(error => { if (error instanceof Error && error.name === 'AbortError') return; setLyricsState('error'); });
    return () => controller.abort();
  }, [spotifyTrack?.title, spotifyTrack?.artist, spotifyTrack?.album, spotifyTrack?.durationMs]);
  useEffect(() => {
    if (!playing || scrubbing) return;
    const clock = setInterval(() => setDisplayProgress(current => { const next = Math.min(track.durationMs, current + 1000); displayProgressRef.current = next; return next; }), 1000);
    return () => clearInterval(clock);
  }, [playing, scrubbing, track.durationMs, track.title]);

  useEffect(() => {
    spinning.current = playing;
    if (playing && !scrubbing) {
      const rotate = (from: number) => {
        spin.setValue(from);
        const animation = Animated.timing(spin, { toValue: 1, duration: Math.max(1, (1 - from) * 2400), easing: value => value, useNativeDriver: true });
        spinLoop.current = animation;
        animation.start(({ finished }) => {
          if (finished && spinning.current) rotate(0);
        });
      };
      spin.stopAnimation(value => rotate(value >= 1 ? 0 : Math.max(0, value)));
    } else spinLoop.current?.stop();
    Animated.spring(arm, { toValue: playing ? 1 : 0, friction: 8, tension: 55, useNativeDriver: true }).start();
    return () => { spinning.current = false; spinLoop.current?.stop(); };
  }, [playing, scrubbing, spin, arm]);

  const vinylPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (_event, gesture) => {
      const pageX = gesture.x0;
      const pageY = gesture.y0;
      spinning.current = false;
      spinLoop.current?.stop();
      vinylCenter.current.ready = false;
      vinylRef.current?.measureInWindow((x: number, y: number, width: number, height: number) => {
        vinylCenter.current = { x: x + width / 2, y: y + height / 2, radius: Math.min(width, height) / 2, ready: true };
        vinylGesture.current.lastAngle = Math.atan2(pageY - vinylCenter.current.y, pageX - vinylCenter.current.x);
      });
      setScrubbing(true);
      spin.stopAnimation(value => {
        vinylGesture.current.spin = value >= 1 ? 0 : Math.max(0, value);
        spin.setValue(vinylGesture.current.spin);
      });
    },
    onPanResponderMove: (_event, gesture) => {
      const center = vinylCenter.current;
      if (!center.ready) return;
      const dx = gesture.moveX - center.x;
      const dy = gesture.moveY - center.y;
      if (Math.hypot(dx, dy) < center.radius * 0.22) return;
      const angle = Math.atan2(dy, dx);
      let delta = angle - vinylGesture.current.lastAngle;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      vinylGesture.current.lastAngle = angle;
      vinylGesture.current.spin = (vinylGesture.current.spin + delta / (Math.PI * 2) + 1) % 1;
      spin.setValue(vinylGesture.current.spin);
      previewProgress(Math.max(0, Math.min(vinylLatest.current.duration, displayProgressRef.current + delta / (Math.PI * 2) * 60000)));
    },
    onPanResponderRelease: () => { vinylCenter.current.ready = false; setScrubbing(false); vinylLatest.current.onSeek(displayProgressRef.current); },
    onPanResponderTerminate: () => { vinylCenter.current.ready = false; setScrubbing(false); vinylLatest.current.onSeek(displayProgressRef.current); },
  })).current;

  const armPan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderRelease: (_event, gesture) => {
      if ((!playing && gesture.dx < -16) || (playing && gesture.dx > 16) || Math.abs(gesture.dx) <= 16) onToggle();
    },
  });
  const rotation = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const armRotation = arm.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '30deg'] });
  const activeLyricIndex = lyrics?.synced.reduce((active, line, index) => line.timeMs <= displayProgress ? index : active, -1) ?? -1;
  const lyricStart = lyrics?.synced.length ? Math.max(0, Math.min(activeLyricIndex - 1, lyrics.synced.length - 4)) : 0;
  const visibleLyrics = lyrics?.synced.length ? lyrics.synced.slice(lyricStart, lyricStart + 4) : [];
  const rollingLyrics = useMemo(() => {
    if (!lyrics?.synced.length) return lyrics?.plain ?? [];
    const slotMs = 4000;
    const slots = Array.from({ length: Math.max(1, Math.ceil(track.durationMs / slotMs) + 1) }, () => '');
    for (const line of lyrics.synced) {
      const index = Math.max(0, Math.min(slots.length - 1, Math.round(line.timeMs / slotMs)));
      slots[index] = slots[index] ? `${slots[index]}. ${line.text}` : line.text;
    }
    const occupied = slots.map((text, index) => text ? index : -1).filter(index => index >= 0);
    for (let pair = -1; pair < occupied.length; pair++) {
      const before = pair < 0 ? -1 : occupied[pair];
      const after = pair + 1 < occupied.length ? occupied[pair + 1] : slots.length;
      if (after - before >= 4) {
        for (let index = before + 1; index < after; index++) slots[index] = '♪';
      }
    }
    return slots;
  }, [lyrics, track.durationMs]);
  useEffect(() => {
    if (lyricsMode !== 'synced' || activeLyricIndex === previousLyric.current) return;
    previousLyric.current = activeLyricIndex;
    if (!lyrics?.synced.length) return;
    const maxTravel = Math.max(0, lyrics.synced.length * 26 - lyricViewportHeight);
    const centred = Math.max(0, Math.min(maxTravel, activeLyricIndex * 26 - (lyricViewportHeight / 2 - 9)));
    Animated.timing(syncedScroll, { toValue: -centred, duration: 680, easing: value => value * value * (3 - 2 * value), useNativeDriver: true }).start();
  }, [activeLyricIndex, lyricsMode, lyrics?.synced.length, lyricViewportHeight, syncedScroll]);
  useEffect(() => {
    if (lyricsMode !== 'unsynced' || !rollingLyrics.length) return;
    const maxTravel = Math.max(0, rollingLyrics.length * 26 - lyricViewportHeight);
    const target = track.durationMs ? -(displayProgress / track.durationMs) * maxTravel : 0;
    Animated.timing(unsyncedScroll, { toValue: target, duration: playing ? 1000 : 180, easing: value => value, useNativeDriver: true }).start();
  }, [displayProgress, lyricsMode, rollingLyrics.length, lyrics?.synced.length, activeLyricIndex, track.durationMs, playing, lyricViewportHeight, unsyncedScroll]);
  const lyricsBlock = (
              <View style={[s.lyricsWindow, !compact && s.lyricsWindowDesktop, { minHeight: (compact ? 190 : 254) - connectionSpace }]}>
            <View style={s.lyricsHeader}><Text style={s.lyricsKicker}>LYRICS</Text><Pressable disabled={!lyrics?.synced.length} onPress={() => setLyricsMode(current => current === 'synced' ? 'unsynced' : 'synced')} style={({ pressed }) => [s.lyricsPreviewBadge, pressed && s.pressed]}><Text style={s.lyricsPreviewBadgeText}>{lyrics?.synced.length ? lyricsMode.toUpperCase() : lyricsState === 'ready' ? 'PLAIN' : lyricsState === 'loading' ? 'LOADING' : 'NO LYRICS'}</Text></Pressable></View>
            <View style={[s.lyricsViewport, { height: lyricViewportHeight }]}>
            {lyricsMode === 'synced' ? <Animated.View style={[s.lyricsLines, { transform: [{ translateY: lyrics?.synced.length ? syncedScroll : lyricSlide }] }]}>
              {lyricsState === 'demo' && <Text style={s.lyricsFaded}>Start Spotify playback to load lyrics.</Text>}
              {lyricsState === 'loading' && <Text style={s.lyricsFaded}>Finding synchronized lyrics…</Text>}
              {(lyricsState === 'missing' || lyricsState === 'error') && <Text style={s.lyricsFaded}>{lyricsState === 'missing' ? 'No lyrics found for this track.' : 'Lyrics are temporarily unavailable.'}</Text>}
              {lyrics?.instrumental && <Text style={s.lyricsFaded}>Instrumental track</Text>}
              {lyrics?.synced.map((line, index) => <Text key={`${line.timeMs}-${index}`} numberOfLines={1} style={index === activeLyricIndex ? [s.lyricsActive, s.lyricsActiveStable, { color: accent }] : index < activeLyricIndex ? s.lyricsFaded : s.lyricsUpcoming}>{line.text}</Text>)}
              {!lyrics?.synced.length && lyrics?.plain.slice(0, 4).map((line, index) => <Text key={index} style={s.lyricsUpcoming}>{line}</Text>)}
            </Animated.View> : <Animated.View style={[s.rollingLyrics, { transform: [{ translateY: unsyncedScroll }] }]}>{rollingLyrics.map((line, index) => <Text key={index} numberOfLines={1} style={s.rollingLyricLine}>{line}</Text>)}</Animated.View>}
            </View>
          </View>
  )

  return (
    <ScrollView style={s.screen} showsVerticalScrollIndicator={false} contentContainerStyle={[s.musicPage, !compact && s.musicPageDesktop]}>
      <View style={[s.musicLayout, !compact && s.musicLayoutDesktop]}>
        <View style={[s.deckColumn, !compact && s.deckColumnDesktop]}>
          <View style={[s.deck, compact ? s.deckMobile : s.deckDesktop]}>
          <View style={s.deckBrand}><Text style={s.deckBrandText}>EXIBEL</Text><Text style={s.deckModel}>BXLP-45</Text></View>
          <View style={[s.platterShadow, compact && s.platterShadowMobile]} />
          <Animated.View ref={vinylRef} {...vinylPan.panHandlers} style={[s.vinyl, compact && s.vinylMobile, { transform: [{ rotate: rotation }] }]}>
            <View pointerEvents="none" style={[s.grooveOne, compact && s.grooveOneMobile]}><View style={[s.grooveTwo, compact && s.grooveTwoMobile]}><View style={[s.grooveThree, compact && s.grooveThreeMobile]} /></View></View>
            <View pointerEvents="none" style={[s.vinylLabel, compact && s.vinylLabelMobile, { backgroundColor: spotifyTrack ? '#252525' : demoTrack.color }]}>
              {track.artwork ? <Image source={{ uri: track.artwork }} style={s.recordArtwork} /> : spotifyTrack ? <Text numberOfLines={2} style={[s.vinylLabelTitle, compact && s.vinylLabelTitleMobile]}>{track.title}</Text> : <CurvedLabelText text="START PLAYING" compact={compact} />}<View style={s.spindle} />
            </View>
          </Animated.View>
          <View style={[s.strobeLight, spotifyConnected && s.strobeLightConnected]} />
          <View pointerEvents="none" style={[s.armBase, compact && s.armBaseMobile]}><View style={s.armBaseInner}><View style={s.pivotCap} /></View></View>
          <Animated.View {...armPan.panHandlers} style={[s.tonearmWrap, compact && s.tonearmWrapMobile, { transform: [{ rotate: armRotation }] }]}>
            <View style={[s.counterweight, compact && s.counterweightMobile]}><View style={s.counterweightRing} /></View>
            <View style={[s.tonearm, compact && s.tonearmMobile]}>
              <View style={s.armCollar} />
              <View style={s.cartridge}><View style={s.headshellSlot} /><View style={s.fingerLift} /><View style={[s.stylusTip, { borderBottomColor: accent }]} /></View>
            </View>
          </Animated.View>
            <Text style={s.armHint}>{playing ? 'Click the tonearm or base to pause' : 'Click the tonearm or base to play'}</Text>
          </View>
          <View style={[s.coverArc, compact && s.coverArcMobile]}>
            {coverTracks.map((cover, index) => {
              const offset = index - 1;
              const lift = hoveredCover === index ? -20 : index === 1 ? -12 : 0;
              return (
                <Pressable
                  key={`${cover?.id ?? cover?.title ?? 'empty'}-${index}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${offset < 0 ? 'Previous track' : offset > 0 ? 'Next track' : 'Currently playing'}${cover ? `: ${cover.title}` : ''}`}
                  disabled={!cover && (!spotifyConnected || offset === 0)}
                  onHoverIn={() => setHoveredCover(index)}
                  onHoverOut={() => setHoveredCover(current => current === index ? null : current)}
                  onPress={() => cover ? onJump(offset, cover) : offset < 0 ? onPrevious() : offset > 0 ? onNext() : undefined}
                  style={({ pressed }) => [s.coverSleeve, compact && s.coverSleeveMobile, index > 0 && s.coverOverlap, hoveredCover === index && s.coverSleeveHovered, hoveredCover === index && { borderColor: accent, shadowColor: accent }, { zIndex: hoveredCover === index ? 20 : 10 - Math.abs(offset), transform: [{ translateY: lift }, { rotate: `${offset * 8}deg` }] }, pressed && offset !== 0 && s.coverPressed]}
                >
                  {cover?.artwork ? <Image source={{ uri: cover.artwork }} style={s.coverArtwork} /> : <View style={s.coverFallback}><View style={s.coverRecord}><View style={s.coverRecordLabel} /></View></View>}
                  {cover && <View style={s.coverShade} />}
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[s.playerPanel, !compact && s.playerPanelDesktop]}>
          {!compact && lyricsBlock}
          <View style={s.trackCopy}><Text style={[s.trackKicker, { color: accent }, accentHeadingGlow(accent)]}>{spotifyTrack ? 'NOW PLAYING' : 'START PLAYING'}</Text><Text style={s.trackTitle}>{track.title}</Text><Text style={s.trackArtist}>{track.artist}</Text></View>
          <View><SeekBar value={displayProgress} duration={track.durationMs} onPreview={previewProgress} onCommit={onSeek} /><View style={s.timeRow}><Text style={s.timeText}>{formatTime(displayProgress)}</Text><Text style={s.timeText}>{formatTime(track.durationMs)}</Text></View></View>
          <View style={s.playbackControls}>
            <Pressable accessibilityLabel="Previous track" onPress={onPrevious} style={({ pressed }) => [s.skipButton, pressed && s.pressed]}><SkipIcon direction="previous" /></Pressable>
            <Pressable accessibilityLabel={playing ? 'Pause' : 'Play'} onPress={onToggle} style={({ pressed }) => [s.playButton, { backgroundColor: accent }, pressed && s.pressed]}><PlayPauseIcon playing={playing} /></Pressable>
            <Pressable accessibilityLabel="Next track" onPress={onNext} style={({ pressed }) => [s.skipButton, pressed && s.pressed]}><SkipIcon direction="next" /></Pressable>
          </View>
          {!spotifyConnected && <Pressable onLayout={event => setConnectionLinkHeight(event.nativeEvent.layout.height)} onPress={onConnect} style={({ pressed }) => [s.spotifySettingsLink, pressed && s.pressed]}><Text style={s.spotifySettingsLinkText}>Go to Spotify connection</Text><Text style={[s.spotifySettingsArrow, { color: accent }]}>›</Text></Pressable>}
          {!!spotifyError && <Text style={s.spotifyError}>{spotifyError}</Text>}
          {compact && lyricsBlock}
        </View>
      </View>
    </ScrollView>
  );
}

export default function App() {
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const spotifyClientId = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID!;
  const spotifyRedirectUri = Platform.OS === 'web' && typeof window !== 'undefined'
    ? `${window.location.origin}/spotify-callback`
    : AuthSession.makeRedirectUri({ scheme: 'soundscape-login', path: 'callback' });
  const [spotifyRequest, spotifyResponse, promptSpotify] = AuthSession.useAuthRequest({ clientId: spotifyClientId, responseType: AuthSession.ResponseType.Code, redirectUri: spotifyRedirectUri, scopes: spotifyScopes, usePKCE: true }, spotifyDiscovery);
  const [page, setPage] = useState<'music' | 'eq' | 'stats'>('eq');
  const [navWidth, setNavWidth] = useState(0);
  const pagerX = useRef(new Animated.Value(-width)).current;
  const pagerLatest = useRef({ page: 'eq' as 'music' | 'eq' | 'stats', width });
  pagerLatest.current = { page, width };
  const [playing, setPlaying] = useState(false);
  const [trackIndex, setTrackIndex] = useState(0);
  const [spotifyToken, setSpotifyToken] = useState<SpotifyToken | null>(null);
  const [spotifyTrack, setSpotifyTrack] = useState<SpotifyTrack | null>(null);
  const [spotifyHistory, setSpotifyHistory] = useState<SpotifyTrack[]>([]);
  const [spotifyNextTrack, setSpotifyNextTrack] = useState<SpotifyTrack | null>(null);
  const [spotifyError, setSpotifyError] = useState('');
  const [sharedSession, setSharedSession] = useState<SharedSession | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [sessionError, setSessionError] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>(DEFAULTS);
  const [selectedId, setSelectedId] = useState<string>('flat');
  const [values, setValues] = useState<Values>({ ...DEFAULTS[1].values });
  const [customValues, setCustomValues] = useState<Values>({ ...DEFAULTS[1].values });
  const [sliderTransition, setSliderTransition] = useState(0);
  const [saveOpen, setSaveOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [user, setUser] = useState<Account | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'create'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [avatarDraft, setAvatarDraft] = useState<string | undefined>();
  const [avatarMime, setAvatarMime] = useState<string | undefined>();
  const [favoriteColorDraft, setFavoriteColorDraft] = useState(C.green);
  const [followCoverDraft, setFollowCoverDraft] = useState(false);
  const [artworkAccent, setArtworkAccent] = useState<{ url: string; color: string } | null>(null);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [emailWarning, setEmailWarning] = useState<{ email: string; suggestion: string } | null>(null);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const passwordRef = useRef<TextInput>(null);
  const passwordConfirmRef = useRef<TextInput>(null);
  const currentPasswordRef = useRef<TextInput>(null);
  const newPasswordRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const spotifyNavigation = useRef<{ action: 'previous' | 'next'; targetKey?: string; expiresAt: number } | null>(null);
  // Polling and shared-session commands need the latest confirmed history.
  const spotifyTrackRef = useRef<SpotifyTrack | null>(null);
  const spotifyHistoryRef = useRef<SpotifyTrack[]>([]);
  const spotifyQueueDiagnostic = useRef<Record<string, unknown> | null>(null);
  const spotifyQueueDiagnosticSignature = useRef('');
  const spotifyReadInFlight = useRef(false);
  const spotifyPendingRead = useRef<(() => void) | null>(null);
  const spotifyReadVersion = useRef(0);
  const spotifyIsGuest = useRef(false);
  spotifyIsGuest.current = !!sharedSession && sharedSession.hostUserId !== user?.id;
  useEffect(() => {
    spotifyReadVersion.current++;
    spotifyPendingRead.current = null;
    spotifyNavigation.current = null;
    setSpotifyNextTrack(null);
    spotifyQueueDiagnostic.current = null;
    spotifyQueueDiagnosticSignature.current = '';
  }, [user?.id, sharedSession?.id]);
  useEffect(() => {
    setArtworkAccent(null);
    if (!user?.followCover || !spotifyTrack?.artwork) return;
    const controller = new AbortController();
    const url = spotifyTrack.artwork;
    coverColor(url, controller.signal).then(color => {
      if (!controller.signal.aborted) setArtworkAccent({ url, color });
    }).catch(() => {});
    return () => controller.abort();
  }, [user?.id, user?.followCover, spotifyTrack?.artwork]);
  const accent = user?.followCover && artworkAccent?.url === spotifyTrack?.artwork && artworkAccent
    ? artworkAccent.color : normalizeColor(user?.favoriteColor);
  const s = useMemo(() => contrastStyles(accent), [accent]);
  const accentTheme = useMemo(() => ({
    text: { color: accent },
    background: { backgroundColor: accent },
    border: { borderColor: accent },
    backgroundBorder: { backgroundColor: accent, borderColor: accent },
    tint: { backgroundColor: colorAlpha(accent, 0.14) },
  }), [accent]);

  const ensureSpotifyToken = async (candidate: SpotifyToken) => {
    if (candidate.expiresAt > Date.now() + 60000) return candidate;
    if (!user) throw new Error('Log in to Soundscape to use Spotify');
    const refreshed = await refreshSpotifyToken(candidate, spotifyClientId, user.id);
    setSpotifyToken(refreshed);
    return refreshed;
  };
  const readSpotifyPlayback = async (candidate?: SpotifyToken | null) => {
    const current = candidate ?? spotifyToken;
    if (!current || spotifyIsGuest.current) return;
    if (spotifyReadInFlight.current) {
      spotifyPendingRead.current = () => { void readSpotifyPlayback(current); };
      return;
    }
    spotifyReadInFlight.current = true;
    const readVersion = spotifyReadVersion.current;
    try {
      const valid = await ensureSpotifyToken(current);
      const response = await spotifyApi(valid.accessToken, '/me/player');
      if (readVersion !== spotifyReadVersion.current) return;
      if (response.status === 204) {
        spotifyTrackRef.current = null;
        spotifyHistoryRef.current = [];
        spotifyNavigation.current = null;
        setSpotifyTrack(null);
        setSpotifyNextTrack(null);
        setSpotifyHistory([]);
        setPlaying(false);
        setSpotifyError('Open Spotify and start a song on any device.');
        return;
      }
      if (!response.ok) throw new Error(`Spotify returned ${response.status}`);
      const data = await response.json();
      if (readVersion !== spotifyReadVersion.current) return;
      const item = data.item;
      const nextTrack = item ? { ...spotifyItemToTrack(item), progressMs: data.progress_ms ?? 0 } : null;
      const previousTrack = spotifyTrackRef.current;
      const changed = !!previousTrack && !!nextTrack && !sameSpotifyTrack(previousTrack, nextTrack);
      if (__DEV__ && changed) {
        console.info('[Spotify queue diagnostic] Track changed', JSON.stringify({
          observedAt: new Date().toISOString(),
          action: spotifyNavigation.current?.action ?? 'external change or automatic advance',
          previous: previousTrack,
          actual: nextTrack,
          lastQueueSnapshot: spotifyQueueDiagnostic.current,
        }));
      }
      setPlaying(!!data.is_playing);
      if (spotifyNavigation.current && spotifyNavigation.current.expiresAt < Date.now()) spotifyNavigation.current = null;
      if (nextTrack) {
        if (changed && previousTrack) {
          const navigation = spotifyNavigation.current;
          spotifyNavigation.current = null;
          const returnedToHistoryTrack = navigation?.action === 'previous'
            && navigation.targetKey === spotifyTrackKey(nextTrack)
            && sameSpotifyTrack(spotifyHistoryRef.current.at(-1), nextTrack);
          // Going back consumes the matching history entry. If Spotify returns
          // an unknown predecessor, we do not know what lies before that track.
          const history = returnedToHistoryTrack ? spotifyHistoryRef.current.slice(0, -1)
            : navigation?.action === 'previous' ? [] : [...spotifyHistoryRef.current, previousTrack];
          spotifyHistoryRef.current = history;
          setSpotifyHistory(history);
        }
      } else {
        spotifyHistoryRef.current = [];
        spotifyNavigation.current = null;
        setSpotifyHistory([]);
      }
      spotifyTrackRef.current = nextTrack;
      setSpotifyTrack(nextTrack);
      setSpotifyError('');
      if (changed || !nextTrack) setSpotifyNextTrack(null);
      if (nextTrack) {
        // The queue may change in Spotify even while the same song keeps playing.
        // A queue failure should only clear the preview, not interrupt playback.
        let upcoming: SpotifyTrack | null = null;
        let queueDiagnostic: Record<string, unknown> = {
          playbackCurrent: nextTrack,
          context: data.context?.type ?? null,
          shuffle: data.shuffle_state,
          repeat: data.repeat_state,
        };
        try {
          const queueResponse = await spotifyApi(valid.accessToken, '/me/player/queue');
          queueDiagnostic.status = queueResponse.status;
          if (queueResponse.ok) {
            const queueData = await queueResponse.json();
            const queueCurrent = queueData.currently_playing;
            const currentMatches = !!queueCurrent && sameSpotifyTrack(spotifyItemToTrack(queueCurrent), nextTrack);
            queueDiagnostic = {
              ...queueDiagnostic,
              queueCurrent: queueCurrent ? spotifyItemToTrack(queueCurrent) : null,
              currentMatches,
              queueLength: queueData.queue?.length ?? 0,
              firstFive: queueData.queue?.slice(0, 5).map(spotifyItemToTrack) ?? [],
              previewReason: !currentMatches ? 'Current track mismatch or missing' : !queueData.queue?.[0] ? 'Empty queue' : 'Using first queue item',
            };
            if (queueCurrent && sameSpotifyTrack(spotifyItemToTrack(queueCurrent), nextTrack) && queueData.queue?.[0]) {
              upcoming = spotifyItemToTrack(queueData.queue[0]);
            }
          }
        } catch {
          queueDiagnostic.previewReason = 'Queue request or response parsing failed';
        }
        if (readVersion === spotifyReadVersion.current) {
          if (__DEV__) {
            // Ignore the changing progress counter when deduplicating polling logs.
            const snapshot = { ...queueDiagnostic, playbackCurrent: { ...nextTrack, progressMs: 0 }, displayedPreview: upcoming };
            const signature = JSON.stringify(snapshot);
            spotifyQueueDiagnostic.current = { ...snapshot, observedAt: new Date().toISOString() };
            if (signature !== spotifyQueueDiagnosticSignature.current) {
              spotifyQueueDiagnosticSignature.current = signature;
              console.info('[Spotify queue diagnostic] Queue snapshot', JSON.stringify(spotifyQueueDiagnostic.current));
            }
          }
          setSpotifyNextTrack(upcoming);
        }
      }
    } catch (error) {
      if (readVersion === spotifyReadVersion.current) {
        setSpotifyNextTrack(null);
        setSpotifyError(error instanceof Error ? error.message : 'Could not reach Spotify');
      }
    }
    finally {
      spotifyReadInFlight.current = false;
      const pendingRead = spotifyPendingRead.current;
      spotifyPendingRead.current = null;
      pendingRead?.();
    }
  };

  useEffect(() => {
    setSpotifyToken(null);
    setSpotifyTrack(null);
    setSpotifyNextTrack(null);
    setSpotifyHistory([]);
    spotifyTrackRef.current = null;
    spotifyHistoryRef.current = [];
    spotifyNavigation.current = null;
    setPlaying(false);
    if (!user) return;
    let cancelled = false;
    loadSpotifyToken(user.id)
      .then(token => { if (!cancelled && token) { setSpotifyToken(token); readSpotifyPlayback(token); } })
      .catch(error => { if (!cancelled) setSpotifyError(error instanceof Error ? error.message : 'Could not load Spotify connection'); });
    return () => { cancelled = true; };
  }, [user?.id]);
  useEffect(() => {
    setSharedSession(null);
    setSessionError('');
    if (!user) return;
    (async () => {
      const { data: hosted } = await supabase.from('turntable_sessions').select('id, join_code, host_user_id').eq('host_user_id', user.id).eq('active', true).maybeSingle();
      if (hosted) { setSharedSession({ id: hosted.id, code: hosted.join_code, hostUserId: hosted.host_user_id }); return; }
      const { data: membership } = await supabase.from('turntable_session_members').select('session_id').eq('user_id', user.id).order('joined_at', { ascending: false }).limit(1).maybeSingle();
      if (!membership) return;
      const { data: joined } = await supabase.from('turntable_sessions').select('id, join_code, host_user_id').eq('id', membership.session_id).eq('active', true).maybeSingle();
      if (joined) setSharedSession({ id: joined.id, code: joined.join_code, hostUserId: joined.host_user_id });
    })().catch(() => {});
  }, [user?.id]);
  useEffect(() => {
    if (Platform.OS !== 'web' || spotifyBrowserCompletion?.type === 'success') return;
    const callback = new URL(window.location.href);
    const code = callback.searchParams.get('code');
    if (!code || !callback.pathname.endsWith('/spotify-callback')) return;
    const pendingRaw = window.localStorage.getItem('soundscape.spotify.pending');
    if (!pendingRaw) { setSpotifyError('Spotify login expired. Return to Soundscape and connect again.'); return; }
    try {
      const pending = JSON.parse(pendingRaw) as { verifier: string; state: string | null; redirectUri: string };
      if (pending.state && callback.searchParams.get('state') !== pending.state) throw new Error('Spotify login could not be verified. Please try again.');
      AuthSession.exchangeCodeAsync({ clientId: spotifyClientId, code, redirectUri: pending.redirectUri, extraParams: { code_verifier: pending.verifier } }, spotifyDiscovery)
        .then(async response => {
          if (!response.refreshToken) throw new Error('Spotify did not return a refresh token');
          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (!authUser) throw new Error('Log in to Soundscape before connecting Spotify');
          await saveSpotifyToken(authUser.id, { accessToken: response.accessToken, refreshToken: response.refreshToken, expiresAt: Date.now() + (response.expiresIn ?? 3600) * 1000 });
          window.localStorage.removeItem('soundscape.spotify.pending');
          window.location.replace(window.location.origin);
        })
        .catch(error => setSpotifyError(error instanceof Error ? error.message : 'Spotify login failed'));
    } catch (error) { setSpotifyError(error instanceof Error ? error.message : 'Spotify login failed'); }
  }, []);
  useEffect(() => {
    if (spotifyResponse?.type !== 'success' || !spotifyResponse.params.code || !spotifyRequest?.codeVerifier || !user) return;
    AuthSession.exchangeCodeAsync({ clientId: spotifyClientId, code: spotifyResponse.params.code, redirectUri: spotifyRedirectUri, extraParams: { code_verifier: spotifyRequest.codeVerifier } }, spotifyDiscovery)
      .then(async response => {
        if (!response.refreshToken) throw new Error('Spotify did not return a refresh token');
        const token = { accessToken: response.accessToken, refreshToken: response.refreshToken, expiresAt: Date.now() + (response.expiresIn ?? 3600) * 1000 };
        setSpotifyToken(token); await saveSpotifyToken(user.id, token); await readSpotifyPlayback(token);
      }).catch(error => setSpotifyError(error instanceof Error ? error.message : 'Spotify login failed'));
  }, [spotifyResponse, user?.id]);
  useEffect(() => {
    if (!spotifyToken || (sharedSession && sharedSession.hostUserId !== user?.id)) return;
    const interval = setInterval(() => readSpotifyPlayback(), 2000);
    return () => clearInterval(interval);
  }, [spotifyToken, sharedSession?.id, user?.id]);

  useEffect(() => {
    if (!sharedSession || sharedSession.hostUserId === user?.id) return;
    let cancelled = false;
    let reading = false;
    spotifyHistoryRef.current = [];
    setSpotifyHistory([]);
    const readSharedPlayback = async () => {
      if (reading || cancelled) return;
      reading = true;
      try {
        const { data } = await supabase.from('turntable_sessions').select('playback').eq('id', sharedSession.id).single();
        if (cancelled || !data?.playback) return;
        spotifyTrackRef.current = data.playback.track ?? null;
        spotifyHistoryRef.current = data.playback.history ?? [];
        setSpotifyTrack(spotifyTrackRef.current);
        setSpotifyHistory(spotifyHistoryRef.current);
        setSpotifyNextTrack(data.playback.nextTrack ?? null);
        setPlaying(!!data.playback.playing);
        setSpotifyError('');
      } finally { reading = false; }
    };
    readSharedPlayback();
    const interval = setInterval(readSharedPlayback, 2000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [sharedSession?.id, sharedSession?.hostUserId, user?.id]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !sharedSession || sharedSession.hostUserId !== user?.id) return;
    let accessToken = '';
    supabase.auth.getSession().then(({ data }) => { accessToken = data.session?.access_token ?? ''; });
    const endHostedSession = () => {
      if (!accessToken) return;
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      if (!supabaseUrl || !supabaseKey) return;
      void fetch(`${supabaseUrl}/rest/v1/turntable_sessions?id=eq.${encodeURIComponent(sharedSession.id)}&host_user_id=eq.${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        keepalive: true,
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ active: false, updated_at: new Date().toISOString() }),
      });
    };
    window.addEventListener('pagehide', endHostedSession);
    return () => window.removeEventListener('pagehide', endHostedSession);
  }, [sharedSession?.id, sharedSession?.hostUserId, user?.id]);

  useEffect(() => {
    if (!sharedSession || sharedSession.hostUserId !== user?.id || !spotifyToken) return;
    supabase.from('turntable_sessions').update({ playback: { track: spotifyTrack, playing, history: spotifyHistory.slice(-1), nextTrack: spotifyNextTrack }, updated_at: new Date().toISOString() }).eq('id', sharedSession.id).then(() => {});
  }, [sharedSession?.id, spotifyTrack, playing, spotifyHistory, spotifyNextTrack, user?.id]);

  const connectSpotify = async () => {
    if (!user) { setAuthOpen(true); return; }
    if (spotifyToken) {
      if (sharedSession?.hostUserId === user.id) {
        await supabase.from('turntable_sessions').update({ active: false, updated_at: new Date().toISOString() }).eq('id', sharedSession.id).eq('host_user_id', user.id);
        setSharedSession(null);
      }
      setSpotifyToken(null);
      spotifyReadVersion.current++;
      spotifyPendingRead.current = null;
      spotifyTrackRef.current = null;
      spotifyHistoryRef.current = [];
      spotifyNavigation.current = null;
      setSpotifyTrack(null);
      setSpotifyNextTrack(null);
      setSpotifyHistory([]);
      setPlaying(false);
      setSpotifyError('');
      await saveSpotifyToken(user.id, null);
      return;
    }
    await authorizeSpotify();
  };
  const authorizeSpotify = async () => {
    if (!user) { setAuthOpen(true); return; }
    if (!spotifyRequest) throw new Error('Spotify login is still loading. Please try again.');
    if (spotifyRequest) {
      if (Platform.OS === 'web' && spotifyRequest.codeVerifier && spotifyRequest.url) {
        const state = new URL(spotifyRequest.url).searchParams.get('state');
        window.localStorage.setItem('soundscape.spotify.pending', JSON.stringify({ verifier: spotifyRequest.codeVerifier, state, redirectUri: spotifyRedirectUri }));
      }
      await promptSpotify();
    }
  };
  const controlSpotify = async (action: 'toggle' | 'next' | 'previous', backTarget?: SpotifyTrack) => {
    const commandVersion = spotifyReadVersion.current;
    if (sharedSession && sharedSession.hostUserId !== user?.id) {
      const { error } = await supabase.from('turntable_commands').insert({ session_id: sharedSession.id, user_id: user?.id, action });
      if (error) setSpotifyError(error.message);
      else if (action === 'toggle') setPlaying(current => !current);
      return;
    }
    if (!spotifyToken) {
      if (action === 'toggle') setPlaying(current => !current);
      else setTrackIndex(current => action === 'next' ? (current + 1) % DEMO_TRACKS.length : (current + DEMO_TRACKS.length - 1) % DEMO_TRACKS.length);
      return;
    }
    try {
      const valid = await ensureSpotifyToken(spotifyToken);
      if (commandVersion !== spotifyReadVersion.current) return;
      const path = action === 'toggle' ? `/me/player/${playing ? 'pause' : 'play'}` : `/me/player/${action}`;
      if (action !== 'toggle') {
        const target = backTarget ?? spotifyHistoryRef.current.at(-1);
        if (__DEV__) console.info('[Spotify queue diagnostic] Skip requested', JSON.stringify({ action, observedAt: new Date().toISOString(), lastQueueSnapshot: spotifyQueueDiagnostic.current }));
        spotifyNavigation.current = { action, targetKey: action === 'previous' && target ? spotifyTrackKey(target) : undefined, expiresAt: Date.now() + 5000 };
      }
      const response = await spotifyApi(valid.accessToken, path, action === 'toggle' ? 'PUT' : 'POST');
      if (commandVersion !== spotifyReadVersion.current) return;
      if (!response.ok) throw new Error(response.status === 404 ? 'No active Spotify device. Open Spotify first.' : `Spotify returned ${response.status}`);
      if (action === 'toggle') setPlaying(current => !current);
      setTimeout(() => { if (commandVersion === spotifyReadVersion.current) void readSpotifyPlayback(valid); }, 100);
      setSpotifyError('');
    } catch (error) {
      if (commandVersion !== spotifyReadVersion.current) return;
      if (action !== 'toggle') spotifyNavigation.current = null;
      setSpotifyError(error instanceof Error ? error.message : 'Playback control failed');
    }
  };
  const seekSpotify = async (position: number) => {
    spotifyNavigation.current = null;
    if (sharedSession && sharedSession.hostUserId !== user?.id) {
      const next = Math.max(0, Math.round(position));
      setSpotifyTrack(current => current ? { ...current, progressMs: Math.min(current.durationMs, next) } : current);
      const { error } = await supabase.from('turntable_commands').insert({ session_id: sharedSession.id, user_id: user?.id, action: 'seek', position_ms: next });
      if (error) setSpotifyError(error.message);
      return;
    }
    if (!spotifyToken) return;
    const next = Math.max(0, Math.round(position));
    setSpotifyTrack(current => current ? { ...current, progressMs: Math.min(current.durationMs, next) } : current);
    try {
      const valid = await ensureSpotifyToken(spotifyToken);
      const response = await spotifyApi(valid.accessToken, `/me/player/seek?position_ms=${next}`, 'PUT');
      if (!response.ok) throw new Error(response.status === 404 ? 'No active Spotify device. Open Spotify first.' : `Spotify returned ${response.status}`);
      setSpotifyError('');
    } catch (error) { setSpotifyError(error instanceof Error ? error.message : 'Could not seek this track'); }
  };
  const jumpSpotify = async (offset: number, target: SpotifyTrack) => {
    if (offset < 0) await controlSpotify('previous', target);
    else if (offset > 0) await controlSpotify('next');
  };
  useEffect(() => {
    if (!sharedSession || sharedSession.hostUserId !== user?.id || !spotifyToken) return;
    let working = false;
    const relayCommands = async () => {
      if (working) return;
      working = true;
      try {
        const { data } = await supabase.from('turntable_commands').select('id, action, position_ms').eq('session_id', sharedSession.id).eq('handled', false).order('created_at').limit(10);
        for (const command of data ?? []) {
          if (command.action === 'seek') await seekSpotify(command.position_ms ?? 0);
          else await controlSpotify(command.action as 'toggle' | 'next' | 'previous');
          await supabase.from('turntable_commands').update({ handled: true }).eq('id', command.id);
        }
      } finally { working = false; }
    };
    relayCommands();
    const interval = setInterval(relayCommands, 800);
    return () => clearInterval(interval);
  }, [sharedSession?.id, sharedSession?.hostUserId, spotifyToken, user?.id, playing]);

  const hostSession = async () => {
    if (!user || !spotifyToken) { setSessionError('Connect Spotify before hosting a session.'); return; }
    setSessionError('');
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const { data, error } = await supabase.rpc('host_turntable_session', { code, initial_playback: { track: spotifyTrack, playing, history: spotifyHistory.slice(-1), nextTrack: spotifyNextTrack } }).single();
    if (error) { setSessionError(error.message); return; }
    const hosted = data as { id: string; join_code: string; host_user_id: string };
    setSharedSession({ id: hosted.id, code: hosted.join_code, hostUserId: hosted.host_user_id });
  };
  const joinSession = async () => {
    if (!user || !joinCode.trim()) return;
    setSessionError('');
    const { data: sessionId, error } = await supabase.rpc('join_turntable_session', { code: joinCode.trim().toUpperCase() });
    if (error) { setSessionError(error.message); return; }
    const { data } = await supabase.from('turntable_sessions').select('id, join_code, host_user_id').eq('id', sessionId).single();
    if (!data) { setSessionError('Could not open that session.'); return; }
    setSharedSession({ id: data.id, code: data.join_code, hostUserId: data.host_user_id });
    setJoinCode('');
  };
  const leaveSession = async () => {
    if (!user || !sharedSession) return;
    if (sharedSession.hostUserId === user.id) await supabase.from('turntable_sessions').update({ active: false }).eq('id', sharedSession.id);
    else await supabase.from('turntable_session_members').delete().eq('session_id', sharedSession.id).eq('user_id', user.id);
    setSharedSession(null);
    spotifyTrackRef.current = null;
    spotifyHistoryRef.current = [];
    setSpotifyTrack(null);
    setSpotifyNextTrack(null);
    setSpotifyHistory([]);
    setPlaying(false);
    if (spotifyToken) readSpotifyPlayback(spotifyToken);
  };

  const showSaved = () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastOpacity.stopAnimation();
    toastOpacity.setValue(0);
    Animated.timing(toastOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start();
    }, 850);
  };

  const loadCloudAccount = async (authUser: { id: string; email?: string }) => {
    const [{ data: settings }, { data: rows }] = await Promise.all([
      supabase.from('user_settings').select('username, avatar_path, favorite_color, follow_cover').eq('user_id', authUser.id).single(),
      supabase.from('sound_profiles').select('id, name, bass, mid, treble, ambience, gain').eq('user_id', authUser.id).order('created_at'),
    ]);
    let avatarUrl: string | undefined;
    if (settings?.avatar_path) {
      const { data } = await supabase.storage.from('avatars').createSignedUrl(settings.avatar_path, 3600);
      avatarUrl = data?.signedUrl;
    }
    const loaded: Profile[] = (rows ?? []).map(row => ({ id: row.id, name: row.name, values: { bass: row.bass, mid: row.mid, treble: row.treble, ambience: row.ambience, gain: row.gain } }));
    setUser({ id: authUser.id, email: authUser.email ?? '', name: settings?.username ?? authUser.email?.split('@')[0] ?? 'User', avatarPath: settings?.avatar_path ?? undefined, avatarUrl, favoriteColor: normalizeColor(settings?.favorite_color), followCover: settings?.follow_cover === true });
    setProfiles(loaded);
    if (loaded.length) { setSelectedId(loaded[0].id); setValues({ ...loaded[0].values }); }
    else setSelectedId('custom');
  };
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) loadCloudAccount(data.session.user); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setTimeout(() => loadCloudAccount(session.user), 0);
      else {
        setUser(null);
        setProfiles(DEFAULTS.map(p => ({ ...p, values: { ...p.values } })));
        setSelectedId('flat');
        setValues({ ...DEFAULTS[1].values });
        setCustomValues({ ...DEFAULTS[1].values });
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const selected = profiles.find(p => p.id === selectedId);
  const summary = useMemo(() => values.bass > values.treble + 10 ? 'Deep and warm' : values.treble > values.bass + 10 ? 'Crisp and bright' : 'Clean and balanced', [values]);
  const choose = (profile: Profile) => { setSelectedId(profile.id); setValues({ ...profile.values }); setSliderTransition(current => current + 1); };
  const chooseCustom = () => { setSelectedId('custom'); setValues({ ...customValues }); setSliderTransition(current => current + 1); };
  const update = (key: keyof Values, value: number) => {
    const next = { ...values, [key]: value };
    setCustomValues(next);
    setValues(next);
    setSelectedId('custom');
  };
  const remove = async (id: string) => {
    if (!user) return;
    const { error } = await supabase.from('sound_profiles').delete().eq('id', id).eq('user_id', user.id);
    if (error) return;
    const remaining = profiles.filter(p => p.id !== id);
    setProfiles(remaining);
    if (selectedId === id) {
      if (remaining.length) choose(remaining[0]);
      else chooseCustom();
    }
    setDeleteTarget(null);
    showSaved();
  };
  const save = async () => {
    if (!user) return;
    const clean = name.trim();
    if (!clean) return;
    const { data, error } = await supabase.from('sound_profiles').insert({ user_id: user.id, name: clean, ...values }).select('id').single();
    if (error || !data) return;
    const profile: Profile = { id: data.id, name: clean, values: { ...values } };
    setProfiles(current => [...current, profile]);
    setSelectedId(profile.id);
    setName('');
    setSaveOpen(false);
    showSaved();
  };
  const resetAuthForm = () => { setUsername(''); setEmail(''); setCurrentPassword(''); setPassword(''); setPasswordConfirm(''); setFavoriteColorDraft(C.green); setAuthError(''); };
  const submitAuth = async (allowCommonTypo = false, emailOverride?: string) => {
    const enteredLogin = (emailOverride ?? email).trim().toLowerCase();
    if (!enteredLogin || !password || (authMode === 'create' && !username.trim())) { setAuthError('Complete every field.'); return; }
    let cleanEmail = enteredLogin;
    if (authMode === 'login' && !enteredLogin.includes('@')) {
      const { data, error } = await supabase.rpc('resolve_login_email', { login_name: enteredLogin });
      if (error || !data) { setAuthError('Incorrect username/email or password.'); return; }
      cleanEmail = data;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) { setAuthError('Enter a valid email address.'); return; }
    const domain = cleanEmail.split('@')[1];
    if (enteredLogin.includes('@') && EMAIL_TYPOS[domain] && !allowCommonTypo) {
      setEmailWarning({ email: cleanEmail, suggestion: `${cleanEmail.split('@')[0]}@${EMAIL_TYPOS[domain]}` });
      return;
    }
    if (authMode === 'create') {
      if (password !== passwordConfirm) { setAuthError('Passwords do not match.'); return; }
      const { data, error } = await supabase.auth.signUp({ email: cleanEmail, password, options: { data: { username: username.trim() } } });
      if (error) { setAuthError(error.message); return; }
      if (!data.session) { setAuthError('Account created. Check your email to confirm it, then log in.'); return; }
      setAuthOpen(false); resetAuthForm();
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      if (error) { setAuthError(error.message); return; }
      setAuthOpen(false); resetAuthForm();
    }
  };
  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.75 });
    if (!result.canceled) { setAvatarDraft(result.assets[0].uri); setAvatarMime(result.assets[0].mimeType ?? 'image/jpeg'); setAvatarFailed(false); }
  };
  const saveAccount = async () => {
    if (!user) return;
    const clean = username.trim();
    if (!clean) { setAuthError('Enter a username.'); return; }
    if (!/^#[0-9a-f]{6}$/i.test(favoriteColorDraft.trim())) { setAuthError('Enter a color as #RRGGBB.'); return; }
    const favoriteColor = normalizeColor(favoriteColorDraft.trim());
    const changed = clean !== user.name || avatarDraft !== user.avatarUrl || favoriteColor !== user.favoriteColor || followCoverDraft !== user.followCover || !!password;
    if (!changed) { setAuthOpen(false); resetAuthForm(); return; }
    if (password && password !== passwordConfirm) { setAuthError('Passwords do not match.'); return; }
    if (password) {
      const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
      if (error) { setAuthError('Current password is incorrect.'); return; }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) { setAuthError(updateError.message); return; }
    }
    let avatarPath = user.avatarPath;
    let avatarUrl = user.avatarUrl;
    if (avatarDraft && avatarDraft !== user.avatarUrl) {
      try {
        const mime = avatarMime === 'image/jpg' ? 'image/jpeg' : avatarMime ?? 'image/jpeg';
        const extension = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
        avatarPath = `${user.id}/avatar-${Date.now()}.${extension}`;
        const bytes = await fetch(avatarDraft).then(response => response.arrayBuffer());
        const { error } = await supabase.storage.from('avatars').upload(avatarPath, bytes, { contentType: mime });
        if (error) throw error;
        const { data } = await supabase.storage.from('avatars').createSignedUrl(avatarPath, 3600);
        avatarUrl = data?.signedUrl;
      } catch (error) {
        setAuthError(`Could not save photo: ${error instanceof Error ? error.message : 'upload failed'}`);
        return;
      }
    } else if (!avatarDraft) { avatarPath = undefined; avatarUrl = undefined; }
    const { error: settingsError } = await supabase.from('user_settings').update({ username: clean, avatar_path: avatarPath ?? null, favorite_color: favoriteColor, follow_cover: followCoverDraft, updated_at: new Date().toISOString() }).eq('user_id', user.id);
    if (settingsError) { setAuthError(settingsError.message); return; }
    if (user.avatarPath && user.avatarPath !== avatarPath) {
      await supabase.storage.from('avatars').remove([user.avatarPath]);
    }
    setUser({ ...user, name: clean, avatarPath, avatarUrl, favoriteColor, followCover: followCoverDraft });
    setAuthOpen(false);
    resetAuthForm();
    showSaved();
  };
  const logout = async () => {
    await supabase.auth.signOut();
    setSharedSession(null);
    setSpotifyToken(null);
    setSpotifyTrack(null);
    setSpotifyNextTrack(null);
    setPlaying(false);
    setSpotifyError('');
    setUser(null);
    setProfiles(DEFAULTS.map(p => ({ ...p, values: { ...p.values } })));
    setSelectedId('flat');
    setValues({ ...DEFAULTS[1].values });
    setCustomValues({ ...DEFAULTS[1].values });
    setAuthOpen(false);
    resetAuthForm();
  };
  const deleteAccount = async () => {
    if (!user) return;
    const { error } = await supabase.rpc('delete_own_account');
    if (error) { setAuthError(error.message); setDeleteAccountOpen(false); return; }
    await supabase.auth.signOut();
    setSharedSession(null);
    setSpotifyToken(null);
    setSpotifyTrack(null);
    setSpotifyNextTrack(null);
    setPlaying(false);
    setSpotifyError('');
    setUser(null);
    setProfiles(DEFAULTS.map(p => ({ ...p, values: { ...p.values } })));
    setSelectedId('flat');
    setValues({ ...DEFAULTS[1].values });
    setCustomValues({ ...DEFAULTS[1].values });
    setDeleteAccountOpen(false);
    setAuthOpen(false);
    resetAuthForm();
  };
  const animateToPage = (target: 'music' | 'eq' | 'stats') => {
    setPage(target);
    Animated.spring(pagerX, { toValue: -['music', 'eq', 'stats'].indexOf(target) * pagerLatest.current.width, useNativeDriver: true, tension: 70, friction: 11 }).start();
  };
  useEffect(() => { pagerX.setValue(-['music', 'eq', 'stats'].indexOf(page) * width); }, [width]);
  const leftEdgePan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => pagerX.stopAnimation(),
    onPanResponderMove: (_event, gesture) => {
      const index = ['music', 'eq', 'stats'].indexOf(pagerLatest.current.page);
      const pageWidth = pagerLatest.current.width;
      pagerX.setValue(Math.max(-index * pageWidth, Math.min(-(index - 1) * pageWidth, -index * pageWidth + gesture.dx)));
    },
    onPanResponderRelease: (_event, gesture) => {
      const click = Math.abs(gesture.dx) < 8 && Math.abs(gesture.dy) < 8;
      animateToPage(click || gesture.dx > 40 || gesture.vx > 0.45 ? pagerLatest.current.page === 'stats' ? 'eq' : 'music' : pagerLatest.current.page);
    },
    onPanResponderTerminate: () => animateToPage(pagerLatest.current.page),
  })).current;
  const rightEdgePan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => pagerX.stopAnimation(),
    onPanResponderMove: (_event, gesture) => {
      const index = ['music', 'eq', 'stats'].indexOf(pagerLatest.current.page);
      const pageWidth = pagerLatest.current.width;
      pagerX.setValue(Math.max(-(index + 1) * pageWidth, Math.min(-index * pageWidth, -index * pageWidth + gesture.dx)));
    },
    onPanResponderRelease: (_event, gesture) => {
      const click = Math.abs(gesture.dx) < 8 && Math.abs(gesture.dy) < 8;
      animateToPage(click || gesture.dx < -40 || gesture.vx < -0.45 ? pagerLatest.current.page === 'music' ? 'eq' : 'stats' : pagerLatest.current.page);
    },
    onPanResponderTerminate: () => animateToPage(pagerLatest.current.page),
  })).current;
  const navigation = (
    <View style={[s.appNav, compact ? s.appNavMobile : s.appNavDesktop, Platform.OS === 'web' && ({ position: 'fixed' } as any)]}>
      <View onLayout={event => setNavWidth(event.nativeEvent.layout.width)} style={s.navTabs}>
        {navWidth > 0 && <Animated.View pointerEvents="none" style={[s.navIndicator, accentTheme.background, { width: (navWidth - 8) / 3, transform: [{ translateX: pagerX.interpolate({ inputRange: [-width * 2, 0], outputRange: [(navWidth + 4) * 2 / 3, 0], extrapolate: 'clamp' }) }] }]} />}
        <Pressable accessibilityRole="button" accessibilityLabel="Music" onPress={() => animateToPage('music')} style={[s.navItem, s.navItemTall]}>
          <TurntableNavIcon active={page === 'music'} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Sound profiles" onPress={() => animateToPage('eq')} style={[s.navItem, s.navItemTall]}>
          <EqualizerNavIcon active={page === 'eq'} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Listening stats" accessibilityState={{ selected: page === 'stats' }} onPress={() => animateToPage('stats')} style={[s.navItem, s.navItemTall]}>
          <View style={{ height: 28, flexDirection: 'row', alignItems: 'flex-end', gap: 5 }}>
            {[12, 25, 18].map((height, index) => <View key={index} style={{ width: 6, height, borderRadius: 2, backgroundColor: page === 'stats' ? accentForeground(accent) : '#aaa' }} />)}
          </View>
        </Pressable>
      </View>
    </View>
  );
  const openAccount = () => {
    if (user) {
      setUsername(user.name);
      setAvatarDraft(user.avatarUrl);
      setAvatarMime(undefined);
      setFavoriteColorDraft(user.favoriteColor);
      setFollowCoverDraft(user.followCover);
      setAvatarFailed(false);
    }
    setAuthOpen(true);
  };
  const appHeader = (
    <View style={[s.universalHeader, !compact && s.universalHeaderDesktop]}>
      <View>
              <Text style={[s.eyebrow, accentTheme.text, accentHeadingGlow(accent)]}>{page === 'music' ? 'PLAYBACK' : page === 'stats' ? 'YOUR LISTENING' : 'SOUND PROFILE'}</Text>
        <Text style={s.title}>{page === 'music' ? 'Turntable' : page === 'stats' ? 'On Record' : 'Soundscape'}</Text>
      </View>
      {user ? (
        <Pressable accessibilityLabel="Open account" onPress={openAccount} style={({ pressed }) => [s.avatar, pressed && s.pressed]}>
          {user.avatarUrl && !avatarFailed ? <Image source={{ uri: user.avatarUrl }} onError={() => setAvatarFailed(true)} style={s.avatarImage} /> : <Text style={s.avatarText}>{initials(user.name)}</Text>}
        </Pressable>
      ) : (
        <Pressable accessibilityLabel="Log in" onPress={openAccount} style={({ pressed }) => [s.loginButton, pressed && s.pressed]}>
          <Text style={s.loginButtonText}>Log in</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <AccentContext.Provider value={accent}>
    <SafeAreaView style={s.safe}>
      <StatusBar style="light" />
      {appHeader}
      <View style={s.pagerViewport}>
        <Animated.View style={[s.pagerTrack, { width: width * 3, transform: [{ translateX: pagerX }] }]}>
          <View style={[s.pagerPage, { width }]}>
            <MusicPage
              playing={playing}
              trackIndex={trackIndex}
              compact={compact}
              spotifyTrack={spotifyTrack}
              spotifyHistory={spotifyHistory}
              spotifyNextTrack={spotifyNextTrack}
              spotifyConnected={!!spotifyToken || !!sharedSession}
              spotifyError={spotifyError}
              onConnect={openAccount}
              onToggle={() => controlSpotify('toggle')}
              onPrevious={() => controlSpotify('previous', spotifyHistory.at(-1))}
              onNext={() => controlSpotify('next')}
              onJump={jumpSpotify}
              onSeek={seekSpotify}
            />
          </View>
          <View style={[s.pagerPage, { width }]}>
            <ScrollView style={s.screen} showsVerticalScrollIndicator={false} contentContainerStyle={[s.page, !compact && s.pageDesktop]} keyboardShouldPersistTaps="handled">
          <View style={s.hero}>
          <View style={[s.record, accentTheme.background]}><View style={[s.recordRing, { borderColor: darkenColor(accent) }]} /><View style={[s.recordDot, { backgroundColor: darkenColor(accent), borderColor: accent }]} /></View>
          <View style={s.heroCopy}><Text style={s.overline}>ACTIVE PROFILE</Text><Text numberOfLines={1} style={s.heroTitle}>{selected?.name ?? 'Custom'}</Text><Text style={s.muted}>{summary}</Text></View>
          <View style={[s.live, accentTheme.tint]}><View style={[s.liveDot, accentTheme.background]} /><Text style={[s.liveText, accentTheme.text]}>LIVE</Text></View>
        </View>

        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>Your sound profiles</Text>
            {user && selected ? (
              <Pressable onPress={() => setDeleteTarget(selected)} style={({ pressed }) => [s.deleteHeaderButton, pressed && s.pressed]}>
                <Text style={s.deleteHeaderText}>Delete profile</Text>
              </Pressable>
            ) : user ? (
              <Pressable onPress={() => setSaveOpen(true)} style={({ pressed }) => [s.saveHeaderButton, accentTheme.backgroundBorder, pressed && s.pressed]}>
                <Text style={s.saveHeaderText}>Save profile</Text>
              </Pressable>
            ) : <View style={s.guestBadge}><Text style={s.guestBadgeText}>LOG IN TO MANAGE</Text></View>}
          </View>
          {profiles.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.presetRow}>
              {profiles.map(profile => {
                const active = selectedId === profile.id;
                return (
                  <View key={profile.id} style={[s.preset, active && s.presetActive, active && accentTheme.backgroundBorder]}>
                    <Pressable onPress={() => choose(profile)} style={s.presetName}>
                      <Text style={[s.presetText, active && s.presetTextActive]}>{active ? '✓  ' : ''}{profile.name}</Text>
                    </Pressable>
                  </View>
                );
              })}
              <Pressable onPress={chooseCustom} style={[s.preset, selectedId === 'custom' && s.presetActive, selectedId === 'custom' && accentTheme.backgroundBorder, s.customPreset]}>
                <Text style={[s.presetText, selectedId === 'custom' && s.presetTextActive]}>{selectedId === 'custom' ? '✓  ' : ''}Custom</Text>
              </Pressable>
            </ScrollView>
          ) : (
            <Pressable onPress={chooseCustom} style={[s.preset, s.presetActive, accentTheme.backgroundBorder, s.customPreset]}><Text style={[s.presetText, s.presetTextActive]}>✓  Custom</Text></Pressable>
          )}
        </View>

        <View style={s.panel}>
          <View style={s.panelHead}>
            <View><Text style={s.sectionTitle}>Tone controls</Text><Text style={s.helper}>Drag to fine-tune your sound</Text></View>
            {selectedId === 'custom' && <View style={[s.customPill, accentTheme.tint]}><Text style={[s.customText, accentTheme.text]}>CUSTOM</Text></View>}
          </View>
          <Slider label="Bass" value={values.bass} onChange={v => update('bass', v)} transition={sliderTransition} />
          <Slider label="Midrange" value={values.mid} onChange={v => update('mid', v)} transition={sliderTransition} />
          <Slider label="Treble" value={values.treble} onChange={v => update('treble', v)} transition={sliderTransition} />
          <Slider label="Ambience" value={values.ambience} onChange={v => update('ambience', v)} transition={sliderTransition} />
        </View>

        <View style={s.panel}>
          <View style={s.outputHead}><View><Text style={s.sectionTitle}>Output level</Text><Text style={s.helper}>Overall profile gain</Text></View></View>
          <Slider label="Gain" value={values.gain} onChange={v => update('gain', v)} transition={sliderTransition} />
        </View>
        <Text style={s.footer}>Changes apply instantly to your turntable output.</Text>
            </ScrollView>
          </View>
          <View style={[s.pagerPage, { width }]}>
            <StatsPage active={page === 'stats'} compact={compact} accent={accent} foreground={accentForeground(accent)} accountId={user?.id} connected={!!spotifyToken} tokenKey={spotifyToken?.accessToken}
              getToken={async () => { if (!spotifyToken) throw new Error('Connect Spotify first.'); return ensureSpotifyToken(spotifyToken); }}
              onConnect={authorizeSpotify} />
          </View>
        </Animated.View>
        {page !== 'music' && <View accessible accessibilityRole="button" accessibilityLabel={page === 'stats' ? 'Open sound page' : 'Open music page'} onAccessibilityTap={() => animateToPage(page === 'stats' ? 'eq' : 'music')} {...leftEdgePan.panHandlers} style={[s.edgeButton, s.edgeButtonLeft]} />}
        {page !== 'stats' && <View accessible accessibilityRole="button" accessibilityLabel={page === 'music' ? 'Open sound page' : 'Open stats page'} onAccessibilityTap={() => animateToPage(page === 'music' ? 'eq' : 'stats')} {...rightEdgePan.panHandlers} style={[s.edgeButton, s.edgeButtonRight]} />}
      </View>
      {navigation}

      <Modal visible={saveOpen} transparent animationType="fade" onRequestClose={() => setSaveOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSaveOpen(false)} />
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>Name this profile</Text>
            <Text style={s.dialogCopy}>Save these settings to use them again anytime.</Text>
            <TextInput autoFocus value={name} onChangeText={setName} onSubmitEditing={save} placeholder="Profile name" placeholderTextColor="#777" selectionColor={accent} maxLength={30} style={s.input} />
            <View style={s.dialogActions}>
              <Pressable onPress={() => { setSaveOpen(false); setName(''); }} style={s.cancel}><Text style={s.cancelText}>Cancel</Text></Pressable>
              <Pressable disabled={!name.trim()} onPress={save} style={[s.confirm, accentTheme.background, !name.trim() && s.disabled]}><Text style={s.confirmText}>Save</Text></Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <View style={s.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setDeleteTarget(null)} />
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>Delete {deleteTarget?.name}?</Text>
            <Text style={s.dialogCopy}>This profile will be removed permanently. This cannot be undone.</Text>
            <View style={s.dialogActions}>
              <Pressable onPress={() => setDeleteTarget(null)} style={s.cancel}><Text style={s.cancelText}>Cancel</Text></Pressable>
              <Pressable onPress={() => deleteTarget && remove(deleteTarget.id)} style={s.deleteConfirm}><Text style={s.deleteConfirmText}>Delete</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={authOpen} transparent animationType="fade" onRequestClose={() => { setAuthOpen(false); resetAuthForm(); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { setAuthOpen(false); resetAuthForm(); }} />
          {user ? (
            <ScrollView style={s.accountDialog} contentContainerStyle={s.dialog} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={s.dialogTitle}>Profile settings</Text>
              <Pressable onPress={pickAvatar} style={s.photoPicker}>
                {avatarDraft && !avatarFailed ? <Image source={{ uri: avatarDraft }} onError={() => setAvatarFailed(true)} style={s.photoPreview} /> : <View style={s.photoFallback}><Text style={s.photoInitials}>{initials(username || user.name)}</Text></View>}
                <Text style={[s.photoAction, accentTheme.text]}>{avatarDraft ? 'Change photo' : 'Add profile photo'}</Text>
              </Pressable>
              {!!avatarDraft && (
                <Pressable onPress={() => { setAvatarDraft(undefined); setAvatarMime(undefined); setAvatarFailed(false); }} style={s.removePhotoButton}>
                  <Text style={s.removePhotoText}>Remove photo</Text>
                </Pressable>
              )}
              <Text style={s.fieldLabel}>USERNAME</Text>
              <TextInput autoCapitalize="none" value={username} onChangeText={text => { setUsername(text); setAuthError(''); }} onSubmitEditing={() => currentPasswordRef.current?.focus()} returnKeyType="next" blurOnSubmit={false} placeholder="Username" placeholderTextColor="#777" selectionColor={accent} style={s.input} />
              <Text style={s.fieldLabel}>ACCENT COLOR</Text>
              <View style={s.colorSettingsRow}>
                <Pressable accessibilityLabel="Open color picker" onPress={() => setColorPickerOpen(true)} style={[s.colorPreview, { backgroundColor: normalizeColor(favoriteColorDraft) }]} />
                <TextInput autoCapitalize="none" value={favoriteColorDraft} onChangeText={text => { setFavoriteColorDraft(text); setAuthError(''); }} maxLength={7} placeholder="#1ed760" placeholderTextColor="#777" selectionColor={accent} style={[s.input, s.colorInput]} />
              </View>
              <Pressable accessibilityRole="switch" accessibilityState={{ checked: followCoverDraft }} onPress={() => setFollowCoverDraft(current => !current)} style={[s.sessionJoinButton, { padding: 12 }, followCoverDraft && accentTheme.background]}>
                <Text style={{ color: followCoverDraft ? accentForeground(accent) : accent, fontWeight: '700' }}>Follow cover {followCoverDraft ? 'On' : 'Off'}</Text>
              </Pressable>
              <Text style={s.helper}>Match the playing cover. Your chosen color stays saved as the fallback.</Text>
              <Text style={s.fieldLabel}>CURRENT PASSWORD</Text>
              <TextInput ref={currentPasswordRef} secureTextEntry value={currentPassword} onChangeText={text => { setCurrentPassword(text); setAuthError(''); }} onSubmitEditing={() => newPasswordRef.current?.focus()} returnKeyType="next" blurOnSubmit={false} placeholder="Required to change password" placeholderTextColor="#777" selectionColor={accent} style={s.input} />
              <Text style={s.fieldLabel}>NEW PASSWORD</Text>
              <TextInput ref={newPasswordRef} secureTextEntry value={password} onChangeText={text => { setPassword(text); setAuthError(''); }} onSubmitEditing={() => passwordConfirmRef.current?.focus()} returnKeyType="next" blurOnSubmit={false} placeholder="Leave blank to keep current" placeholderTextColor="#777" selectionColor={accent} style={s.input} />
              <TextInput ref={passwordConfirmRef} secureTextEntry value={passwordConfirm} onChangeText={text => { setPasswordConfirm(text); setAuthError(''); }} onSubmitEditing={saveAccount} returnKeyType="done" placeholder="Repeat new password" placeholderTextColor="#777" selectionColor={accent} style={s.input} />
              <View style={s.spotifyAccountSection}>
                <View style={s.spotifyAccountCopy}>
                  <View style={s.spotifyAccountTitleRow}><View style={[s.spotifyAccountDot, spotifyToken && s.spotifyAccountDotConnected]} /><Text style={s.spotifyAccountTitle}>Spotify</Text></View>
                  <Text style={s.spotifyAccountStatus}>{spotifyToken ? 'Connected for playback' : 'Not connected'}</Text>
                </View>
                <Pressable onPress={connectSpotify} style={({ pressed }) => [s.spotifyAccountButton, accentTheme.background, spotifyToken && s.spotifyAccountDisconnect, pressed && s.pressed]}><Text style={[s.spotifyAccountButtonText, spotifyToken && s.spotifyAccountDisconnectText]}>{spotifyToken ? 'Disconnect' : 'Connect'}</Text></Pressable>
              </View>
              <View style={s.sessionSection}>
                <Text style={s.fieldLabel}>SHARED TURNTABLE SESSION</Text>
                {sharedSession ? (
                  <>
                    <View style={s.sessionActiveRow}>
                      <View><Text style={s.sessionRole}>{sharedSession.hostUserId === user.id ? 'You are hosting' : 'Joined as guest'}</Text><Text style={[s.sessionCode, accentTheme.text]}>Code {sharedSession.code}</Text></View>
                      <Pressable onPress={leaveSession} style={s.sessionLeaveButton}><Text style={s.sessionLeaveText}>{sharedSession.hostUserId === user.id ? 'End' : 'Leave'}</Text></Pressable>
                    </View>
                    <Text style={s.sessionHelp}>{sharedSession.hostUserId === user.id ? 'Keep Soundscape open to relay guest controls through your Spotify.' : "Playback controls use the host's Spotify. Your sound profiles stay personal."}</Text>
                  </>
                ) : (
                  <>
                    <Pressable onPress={hostSession} style={[s.sessionHostButton, accentTheme.background, !spotifyToken && s.disabled]}><Text style={s.sessionHostText}>Host with my Spotify</Text></Pressable>
                    <View style={s.sessionJoinRow}>
                      <TextInput autoCapitalize="characters" value={joinCode} onChangeText={text => { setJoinCode(text.toUpperCase()); setSessionError(''); }} onSubmitEditing={joinSession} returnKeyType="go" maxLength={6} placeholder="SESSION CODE" placeholderTextColor="#777" selectionColor={accent} style={s.sessionCodeInput} />
                      <Pressable disabled={!joinCode.trim()} onPress={joinSession} style={[s.sessionJoinButton, accentTheme.border, !joinCode.trim() && s.disabled]}><Text style={[s.sessionJoinText, accentTheme.text]}>Join</Text></Pressable>
                    </View>
                  </>
                )}
                {!!sessionError && <Text style={s.errorText}>{sessionError}</Text>}
              </View>
              {!!spotifyError && <Text style={s.errorText}>{spotifyError}</Text>}
              {!!authError && <Text style={s.errorText}>{authError}</Text>}
              <Pressable onPress={() => setDeleteAccountOpen(true)} style={s.deleteAccountLink}>
                <Text style={s.deleteAccountLinkText}>Delete account</Text>
              </Pressable>
              <View style={s.dialogActions}>
                <Pressable onPress={logout} style={s.logoutButton}><Text style={s.logoutText}>Log out</Text></Pressable>
                <View style={s.actionSpacer} />
                <Pressable onPress={() => { setAuthOpen(false); resetAuthForm(); }} style={s.cancel}><Text style={s.cancelText}>Cancel</Text></Pressable>
                <Pressable onPress={saveAccount} style={[s.confirm, accentTheme.background]}><Text style={s.confirmText}>Save</Text></Pressable>
              </View>
            </ScrollView>
          ) : (
            <View style={s.dialog}>
              <Text style={s.dialogTitle}>{authMode === 'login' ? 'Log in' : 'Create account'}</Text>
              <Text style={s.dialogCopy}>{authMode === 'login' ? 'Access your personal sound profiles.' : 'Every new account starts with Warm, Flat, and Bright.'}</Text>
              {authMode === 'create' && <TextInput autoFocus value={username} onChangeText={text => { setUsername(text); setAuthError(''); }} onSubmitEditing={() => emailRef.current?.focus()} returnKeyType="next" blurOnSubmit={false} placeholder="Username" placeholderTextColor="#777" selectionColor={accent} style={s.input} />}
              <TextInput ref={emailRef} autoFocus={authMode === 'login'} autoCapitalize="none" keyboardType={authMode === 'create' ? 'email-address' : 'default'} value={email} onChangeText={text => { setEmail(text); setAuthError(''); }} onSubmitEditing={() => passwordRef.current?.focus()} returnKeyType="next" blurOnSubmit={false} placeholder={authMode === 'login' ? 'Email or username' : 'Email'} placeholderTextColor="#777" selectionColor={accent} style={s.input} />
              <TextInput ref={passwordRef} secureTextEntry value={password} onChangeText={text => { setPassword(text); setAuthError(''); }} onSubmitEditing={() => authMode === 'create' ? passwordConfirmRef.current?.focus() : submitAuth()} returnKeyType={authMode === 'create' ? 'next' : 'done'} blurOnSubmit={authMode !== 'create'} placeholder="Password" placeholderTextColor="#777" selectionColor={accent} style={s.input} />
              {authMode === 'create' && <TextInput ref={passwordConfirmRef} secureTextEntry value={passwordConfirm} onChangeText={text => { setPasswordConfirm(text); setAuthError(''); }} onSubmitEditing={() => submitAuth()} returnKeyType="done" placeholder="Repeat password" placeholderTextColor="#777" selectionColor={accent} style={s.input} />}
              {!!authError && <Text style={authError.startsWith('Account created') ? [s.infoText, accentTheme.text] : s.errorText}>{authError}</Text>}
              <Pressable onPress={() => { setAuthMode(authMode === 'login' ? 'create' : 'login'); setAuthError(''); }}>
                <Text style={[s.switchAuth, accentTheme.text]}>{authMode === 'login' ? 'New here? Create an account' : 'Already have an account? Log in'}</Text>
              </Pressable>
              <View style={s.dialogActions}>
                <Pressable onPress={() => { setAuthOpen(false); resetAuthForm(); }} style={s.cancel}><Text style={s.cancelText}>Cancel</Text></Pressable>
                <Pressable onPress={() => submitAuth()} style={[s.confirm, accentTheme.background]}><Text style={s.confirmText}>{authMode === 'login' ? 'Log in' : 'Create'}</Text></Pressable>
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={colorPickerOpen} transparent animationType="fade" onRequestClose={() => setColorPickerOpen(false)}>
        <View style={s.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setColorPickerOpen(false)} />
          <View style={[s.dialog, s.colorPickerDialog]}>
            <Text style={s.dialogTitle}>Accent color</Text>
            <Text style={s.dialogCopy}>Choose a hue, then adjust saturation and brightness in the center.</Text>
            <ColorWheel value={favoriteColorDraft} onChange={setFavoriteColorDraft} />
            <View style={s.colorPickerValueRow}>
              <View style={[s.colorPickerValuePreview, { backgroundColor: normalizeColor(favoriteColorDraft) }]} />
              <Text style={s.colorPickerValue}>{normalizeColor(favoriteColorDraft).toUpperCase()}</Text>
            </View>
            <Pressable onPress={() => setColorPickerOpen(false)} style={[s.confirm, { backgroundColor: normalizeColor(favoriteColorDraft) }, s.colorPickerDone]}><Text style={[s.confirmText, { color: accentForeground(normalizeColor(favoriteColorDraft)) }]}>Done</Text></Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={!!emailWarning} transparent animationType="fade" onRequestClose={() => setEmailWarning(null)}>
        <View style={s.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEmailWarning(null)} />
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>Check your email</Text>
            <Text style={s.dialogCopy}>This email address contains a common typo. Are you sure it is correct?</Text>
            <View style={s.emailComparison}>
              <Text style={s.emailCaption}>YOU ENTERED</Text>
              <Text style={s.enteredEmail}>{emailWarning?.email}</Text>
              <Text style={s.emailCaption}>DID YOU MEAN?</Text>
              <Text style={[s.suggestedEmail, accentTheme.text]}>{emailWarning?.suggestion}</Text>
            </View>
            <Pressable
              onPress={() => {
                if (!emailWarning) return;
                const suggestion = emailWarning.suggestion;
                setEmail(suggestion);
                setEmailWarning(null);
                submitAuth(true, suggestion);
              }}
              style={[s.useSuggestionButton, accentTheme.background]}
            >
              <Text style={s.useSuggestionText}>Use suggested email</Text>
            </Pressable>
            <View style={s.dialogActions}>
              <Pressable onPress={() => { setEmailWarning(null); setTimeout(() => emailRef.current?.focus(), 150); }} style={s.cancel}><Text style={s.cancelText}>Edit email</Text></Pressable>
              <Pressable onPress={() => { setEmailWarning(null); submitAuth(true); }} style={[s.confirm, accentTheme.background]}><Text style={s.confirmText}>Use it anyway</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={deleteAccountOpen} transparent animationType="fade" onRequestClose={() => setDeleteAccountOpen(false)}>
        <View style={s.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setDeleteAccountOpen(false)} />
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>Delete your account?</Text>
            <Text style={s.dialogCopy}>Your account and every saved sound profile will be permanently deleted. This cannot be undone.</Text>
            <View style={s.dialogActions}>
              <Pressable onPress={() => setDeleteAccountOpen(false)} style={s.cancel}><Text style={s.cancelText}>Cancel</Text></Pressable>
              <Pressable onPress={deleteAccount} style={s.deleteConfirm}><Text style={s.deleteConfirmText}>Delete account</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Animated.View pointerEvents="none" style={[s.savedToast, { opacity: toastOpacity }]}>
        <View style={[s.savedToastDot, accentTheme.background]} />
        <Text style={s.savedToastText}>Changes saved</Text>
      </Animated.View>
    </SafeAreaView>
    </AccentContext.Provider>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg }, page: { paddingHorizontal: 20, paddingTop: 0, paddingBottom: 112, gap: 28 },
  universalHeader: { width: '100%', paddingHorizontal: 20, paddingTop: 22, paddingBottom: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.bg, zIndex: 20 }, universalHeaderDesktop: { maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 32 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, eyebrow: { color: C.green, fontSize: 11, fontWeight: '800', letterSpacing: 1.8, marginBottom: 7 },
  title: { color: C.text, fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.8 }, loginButton: { borderWidth: 1, borderColor: '#727272', borderRadius: 99, paddingHorizontal: 18, paddingVertical: 9 }, loginButtonText: { color: C.text, fontSize: 12, fontWeight: '800' }, avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, avatarImage: { width: '100%', height: '100%' }, avatarText: { color: C.text, fontWeight: '800', fontSize: 12 },
  hero: { minHeight: 142, padding: 20, borderRadius: 12, backgroundColor: C.raised, flexDirection: 'row', alignItems: 'center' }, record: { width: 70, height: 70, borderRadius: 8, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  recordRing: { position: 'absolute', width: 45, height: 45, borderRadius: 23, borderWidth: 2, borderColor: '#0d6f31' }, recordDot: { width: 13, height: 13, borderRadius: 7, backgroundColor: '#0d6f31', borderWidth: 3, borderColor: C.green },
  heroCopy: { flex: 1 }, overline: { color: C.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 5 }, heroTitle: { color: C.text, fontSize: 23, fontWeight: '800' }, muted: { color: C.muted, fontSize: 13, marginTop: 3 },
  live: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#173b24', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 5 }, liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green }, liveText: { color: C.green, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  section: { gap: 13 }, sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, sectionTitle: { color: C.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.25 },
  presetRow: { gap: 8, paddingRight: 8 }, preset: { minHeight: 43, borderRadius: 99, borderWidth: 1, borderColor: '#727272', flexDirection: 'row', alignItems: 'center', overflow: 'hidden' }, presetActive: { backgroundColor: C.green, borderColor: C.green },
  presetName: { paddingHorizontal: 16, paddingVertical: 11 }, customPreset: { paddingHorizontal: 16, paddingVertical: 11 }, presetText: { color: C.text, fontSize: 14, fontWeight: '700' }, presetTextActive: { color: C.bg, fontWeight: '800' },
  deleteHeaderButton: { minWidth: 102, alignItems: 'center', borderWidth: 1, borderColor: '#7f7f7f', borderRadius: 99, paddingHorizontal: 13, paddingVertical: 7 }, deleteHeaderText: { color: C.text, fontSize: 11, fontWeight: '800' },
  saveHeaderButton: { minWidth: 102, alignItems: 'center', backgroundColor: C.green, borderWidth: 1, borderColor: C.green, borderRadius: 99, paddingHorizontal: 13, paddingVertical: 7 }, saveHeaderText: { color: C.bg, fontSize: 11, fontWeight: '800' },
  guestBadge: { minWidth: 102, alignItems: 'center', paddingVertical: 8 }, guestBadgeText: { color: '#777', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  panel: { backgroundColor: C.surface, borderRadius: 12, padding: 18, gap: 22 }, panelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 }, helper: { color: C.muted, fontSize: 13, marginTop: 5 },
  customPill: { backgroundColor: '#173b24', borderRadius: 99, paddingHorizontal: 9, paddingVertical: 6 }, customText: { color: C.green, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  control: { gap: 5 }, controlTop: { flexDirection: 'row', justifyContent: 'space-between' }, controlLabel: { color: C.text, fontSize: 14, fontWeight: '700' }, controlValue: { color: C.muted, fontSize: 13, fontVariant: ['tabular-nums'] },
  touchTrack: { height: 30, justifyContent: 'center' }, track: { height: 4, borderRadius: 99, backgroundColor: C.line }, fill: { height: '100%', borderRadius: 99, backgroundColor: C.green }, thumb: { position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: C.text, top: -6, marginLeft: -8 },
  outputHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: -4 }, outputValue: { color: C.green, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  footer: { color: '#6a6a6a', fontSize: 12, textAlign: 'center', marginTop: -10 }, pressed: { opacity: 0.72 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.72)', justifyContent: 'center', padding: 24 }, accountDialog: { maxHeight: '92%', borderRadius: 12 }, dialog: { backgroundColor: '#282828', borderRadius: 12, padding: 24, gap: 14 },
  dialogTitle: { color: C.text, fontSize: 23, fontWeight: '800' }, dialogCopy: { color: C.muted, fontSize: 14, lineHeight: 20 }, input: { height: 50, borderWidth: 1, borderColor: '#777', borderRadius: 5, paddingHorizontal: 14, color: C.text, backgroundColor: '#333', fontSize: 16 },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 4 }, cancel: { paddingHorizontal: 14, paddingVertical: 11 }, cancelText: { color: C.text, fontWeight: '700' }, confirm: { backgroundColor: C.green, borderRadius: 99, paddingHorizontal: 24, paddingVertical: 12 }, confirmText: { color: C.bg, fontWeight: '800' }, disabled: { opacity: 0.35 },
  deleteConfirm: { backgroundColor: '#e91429', borderRadius: 99, paddingHorizontal: 24, paddingVertical: 12 }, deleteConfirmText: { color: C.text, fontWeight: '800' },
  errorText: { color: '#ff6b6b', fontSize: 13 }, infoText: { color: C.green, fontSize: 13, lineHeight: 18 }, switchAuth: { color: C.green, fontSize: 13, fontWeight: '700' }, fieldLabel: { color: C.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: -7 }, photoPicker: { alignItems: 'center', gap: 9, marginVertical: 2 }, photoPreview: { width: 76, height: 76, borderRadius: 38 }, photoFallback: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#3a3a3a', alignItems: 'center', justifyContent: 'center' }, photoInitials: { color: C.text, fontSize: 21, fontWeight: '800' }, photoAction: { color: C.green, fontSize: 13, fontWeight: '800' }, removePhotoButton: { alignSelf: 'center', marginTop: -8, paddingHorizontal: 12, paddingVertical: 5 }, removePhotoText: { color: '#ff6574', fontSize: 12, fontWeight: '700' }, logoutButton: { borderWidth: 1, borderColor: '#e91429', borderRadius: 99, paddingHorizontal: 16, paddingVertical: 11 }, logoutText: { color: '#ff6574', fontWeight: '800' }, actionSpacer: { flex: 1 },
  deleteAccountLink: { alignSelf: 'flex-start', paddingVertical: 4 }, deleteAccountLinkText: { color: '#ff6574', fontSize: 13, fontWeight: '800' },
  emailComparison: { backgroundColor: '#333', borderRadius: 8, padding: 14, gap: 5 }, emailCaption: { color: '#888', fontSize: 9, fontWeight: '800', letterSpacing: 1, marginTop: 3 }, enteredEmail: { color: C.text, fontSize: 14, fontWeight: '700', marginBottom: 7 }, suggestedEmail: { color: C.green, fontSize: 14, fontWeight: '800' },
  colorSettingsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, colorPreview: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: '#eee', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 6 }, colorInput: { flex: 1 }, colorPickerDialog: { alignSelf: 'center', width: '100%', maxWidth: 340, alignItems: 'center' }, colorWheel: { position: 'relative', alignSelf: 'center', marginVertical: 4 }, hueDot: { position: 'absolute', width: 14, height: 14, borderRadius: 7 }, hueCursor: { position: 'absolute', width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: '#fff', backgroundColor: 'transparent', zIndex: 4, shadowColor: '#000', shadowOpacity: 0.7, shadowRadius: 3 }, shadeSquare: { position: 'absolute', overflow: 'hidden', borderRadius: 5, zIndex: 5, borderWidth: 1, borderColor: '#777' }, shadeCursor: { position: 'absolute', width: 16, height: 16, borderRadius: 8, borderWidth: 3, borderColor: '#fff', backgroundColor: 'transparent', shadowColor: '#000', shadowOpacity: 0.8, shadowRadius: 3 }, colorPickerValueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }, colorPickerValuePreview: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: '#fff' }, colorPickerValue: { color: C.text, fontSize: 13, fontWeight: '900', letterSpacing: 1 }, colorPickerDone: { alignSelf: 'stretch', alignItems: 'center' },
  useSuggestionButton: { minHeight: 46, borderRadius: 99, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 }, useSuggestionText: { color: C.bg, fontSize: 13, fontWeight: '800' },
  savedToast: { position: 'absolute', bottom: 24, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#282828', borderRadius: 99, paddingHorizontal: 18, paddingVertical: 11, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 }, savedToastDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.green }, savedToastText: { color: C.text, fontSize: 13, fontWeight: '800' },
  screen: { flex: 1 }, pagerViewport: { flex: 1, overflow: 'hidden' }, pagerTrack: { flex: 1, flexDirection: 'row' }, pagerPage: { height: '100%' }, edgeButton: { position: 'absolute', top: 0, bottom: 78, width: 36, zIndex: 40 }, edgeButtonLeft: { left: 0 }, edgeButtonRight: { right: 0 }, pageDesktop: { width: '100%', maxWidth: 920, alignSelf: 'center', paddingBottom: 110 },
  appNav: { position: 'absolute', bottom: 14, height: 64, backgroundColor: '#202020', borderWidth: 1, borderColor: '#383838', borderRadius: 32, zIndex: 999, elevation: 50, padding: 6, shadowColor: '#000', shadowOpacity: 0.75, shadowRadius: 20 }, appNavDesktop: { width: 270, left: '50%', marginLeft: -135 }, appNavMobile: { left: '14%', right: '14%' }, navTabs: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  navIndicator: { position: 'absolute', left: 0, height: 50, borderRadius: 26, backgroundColor: C.green },
  navItemTall: { height: 50 },
  navItem: { flex: 1, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' }, navItemActive: { backgroundColor: C.green }, turntableNavIcon: { width: 38, height: 29, borderRadius: 5, borderWidth: 2, borderColor: '#aaa' }, navDeckActive: { borderColor: '#050505' }, equalizerNavIcon: { width: 34, height: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, navPlatter: { position: 'absolute', left: 4, top: 4, width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#aaa', alignItems: 'center', justifyContent: 'center' }, navPlatterLabel: { width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: '#aaa', alignItems: 'center', justifyContent: 'center' }, navSpindle: { width: 2, height: 2, borderRadius: 1, backgroundColor: '#aaa' }, navTonearmBase: { position: 'absolute', right: 5, top: 4, width: 7, height: 7, borderRadius: 4, borderWidth: 2, borderColor: '#aaa' }, navTonearm: { position: 'absolute', right: 10, top: 9, width: 2, height: 11, borderRadius: 2, backgroundColor: '#aaa', transform: [{ rotate: '36deg' }] }, navTonearmHead: { position: 'absolute', left: -2, bottom: -6, width: 5, height: 9, borderRadius: 2, backgroundColor: '#aaa', transform: [{ rotate: '8deg' }] }, navDeckButton: { position: 'absolute', right: 4, bottom: 4, width: 3, height: 3, borderRadius: 2, backgroundColor: '#aaa' }, navFaderColumn: { width: 6, height: 28, alignItems: 'center' }, navFaderTrack: { position: 'absolute', top: 2, bottom: 2, width: 2, borderRadius: 1, backgroundColor: '#aaa' }, navFaderKnob: { position: 'absolute', left: 0, width: 6, height: 7, borderRadius: 3, backgroundColor: '#202020', borderWidth: 2, borderColor: '#aaa' }, navFaderKnobActive: { backgroundColor: '#050505', borderColor: '#050505' }, navIconShapeActive: { borderColor: '#050505' }, navIconSolidActive: { backgroundColor: '#050505' },
  musicPage: { paddingHorizontal: 16, paddingTop: 0, paddingBottom: 104 }, musicPageDesktop: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 32, paddingBottom: 110 }, musicHeader: { marginBottom: 22 }, musicLayout: { gap: 24 }, musicLayoutDesktop: { flexDirection: 'row', alignItems: 'center', gap: 36 },
  deckColumn: { width: '100%', alignItems: 'center', gap: 7 }, deckColumnDesktop: { flex: 1.02, maxWidth: 610 },
  deck: { position: 'relative', aspectRatio: 45 / 35, borderRadius: 10, backgroundColor: '#151515', borderWidth: 1, borderColor: '#353535', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.8, shadowRadius: 24, elevation: 12 }, deckMobile: { width: '90%', alignSelf: 'center' }, deckDesktop: { width: '100%', maxWidth: 590 }, deckBrand: { position: 'absolute', left: '3.5%', top: '3.8%', zIndex: 8 }, deckBrandText: { color: '#ddd', fontSize: 9, fontWeight: '900', letterSpacing: 1.6 }, deckModel: { color: '#696969', fontSize: 6, letterSpacing: 0.8 },
  coverArc: { width: '94%', height: 154, marginTop: -28, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 15 }, coverArcMobile: { width: '100%', height: 124, marginTop: -20, paddingTop: 12 }, coverSleeve: { width: 132, height: 132, borderRadius: 4, overflow: 'hidden', backgroundColor: '#242424', borderWidth: 1, borderColor: '#484848', shadowColor: '#000', shadowOpacity: 0.75, shadowRadius: 10, elevation: 5 }, coverSleeveMobile: { width: 102, height: 102 }, coverOverlap: { marginLeft: -24 }, coverSleeveHovered: { borderColor: C.green, shadowColor: C.green, shadowOpacity: 0.8, shadowRadius: 14, elevation: 12 }, coverPressed: { opacity: 0.72 }, coverArtwork: { width: '100%', height: '100%' }, coverFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#282828' }, coverRecord: { width: '70%', height: '70%', borderRadius: 999, backgroundColor: '#101010', borderWidth: 1, borderColor: '#3b3b3b', alignItems: 'center', justifyContent: 'center' }, coverRecordLabel: { width: '28%', height: '28%', borderRadius: 999, backgroundColor: '#686868' }, coverShade: { position: 'absolute', inset: 0, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  platterShadow: { position: 'absolute', width: '67%', aspectRatio: 1, borderRadius: 999, left: '3.5%', top: '8%', backgroundColor: '#050505', borderWidth: 5, borderColor: '#242424', shadowColor: '#000', shadowOpacity: 0.9, shadowRadius: 14, zIndex: 3, elevation: 3 }, platterShadowMobile: { borderWidth: 3 }, vinyl: { position: 'absolute', width: '62%', aspectRatio: 1, borderRadius: 999, left: '6%', top: '10.7%', backgroundColor: '#090909', alignItems: 'center', justifyContent: 'center', zIndex: 4, elevation: 4 }, vinylMobile: {},
  grooveOne: { width: '88%', aspectRatio: 1, borderRadius: 999, borderWidth: 1, borderColor: '#242424', alignItems: 'center', justifyContent: 'center' }, grooveOneMobile: {}, grooveTwo: { width: '78%', aspectRatio: 1, borderRadius: 999, borderWidth: 1, borderColor: '#202020', alignItems: 'center', justifyContent: 'center' }, grooveTwoMobile: {}, grooveThree: { width: '76%', aspectRatio: 1, borderRadius: 999, borderWidth: 1, borderColor: '#282828' }, grooveThreeMobile: {},
  vinylLabel: { position: 'absolute', width: '36%', aspectRatio: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center', padding: 14, overflow: 'hidden' }, vinylLabelMobile: { padding: 8 }, vinylLabelTitle: { color: '#080808', fontSize: 10, lineHeight: 12, fontWeight: '900', textAlign: 'center' }, vinylLabelTitleMobile: { fontSize: 7, lineHeight: 8 }, curvedLabelCharacter: { position: 'absolute', color: '#090909', fontSize: 7, lineHeight: 9, fontWeight: '900' }, curvedLabelCharacterMobile: { fontSize: 5, lineHeight: 7 }, recordArtwork: { position: 'absolute', width: '100%', height: '100%' }, spindle: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: '#eee' }, strobeLight: { position: 'absolute', left: '4.5%', bottom: '6%', width: 8, height: 8, borderRadius: 4, backgroundColor: '#e34837', borderWidth: 1, borderColor: '#ff8a7d', shadowColor: '#ff4d3a', shadowOpacity: 1, shadowRadius: 9, boxShadow: '0 0 9px rgba(255,77,58,0.95)' }, strobeLightConnected: { backgroundColor: C.green, borderColor: '#8dffb5', shadowColor: C.green, boxShadow: '0 0 9px rgba(30,215,96,0.95)' },
  armBase: { position: 'absolute', width: '30%', aspectRatio: 1, borderRadius: 999, right: '7%', top: '7%', backgroundColor: '#111', borderWidth: 4, borderColor: '#333', alignItems: 'center', justifyContent: 'center', zIndex: 1, elevation: 1, shadowColor: '#000', shadowOpacity: 0.9, shadowRadius: 8 }, armBaseMobile: { borderWidth: 3 }, armBaseInner: { width: '63%', aspectRatio: 1, borderRadius: 999, backgroundColor: '#5f5f5f', borderWidth: 4, borderColor: '#1d1d1d', alignItems: 'center', justifyContent: 'center' }, pivotCap: { width: '42%', aspectRatio: 1, borderRadius: 999, backgroundColor: '#c3c3c3', borderWidth: 2, borderColor: '#777' }, tonearmWrap: { position: 'absolute', width: '14%', height: '68%', right: '15%', top: '21.5%', zIndex: 7, elevation: 7, transformOrigin: 'center top' }, tonearmWrapMobile: {}, counterweight: { position: 'absolute', left: '2%', top: '-10%', width: '96%', height: '21%', borderRadius: 10, backgroundColor: '#292929', borderWidth: 2, borderColor: '#555', overflow: 'hidden' }, counterweightMobile: {}, counterweightRing: { position: 'absolute', left: '25%', top: -2, bottom: -2, width: '13%', backgroundColor: '#aaa', borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#dedede' }, tonearm: { position: 'absolute', left: '45%', top: '6%', width: 7, height: '78%', borderRadius: 4, backgroundColor: '#d5d5d5', borderWidth: 1, borderColor: '#858585' }, tonearmMobile: { width: 5 }, armCollar: { position: 'absolute', left: -3, top: '5%', width: 11, height: 20, borderRadius: 5, backgroundColor: '#343434', borderWidth: 1, borderColor: '#858585' }, cartridge: { position: 'absolute', left: -7, bottom: -40, width: 21, height: 50, borderRadius: 3, backgroundColor: '#bdbdbd', borderWidth: 1, borderColor: '#686868' }, headshellSlot: { position: 'absolute', left: 6, top: 7, width: 7, height: 25, borderRadius: 4, backgroundColor: '#242424' }, fingerLift: { position: 'absolute', right: -10, top: 8, width: 13, height: 3, borderRadius: 2, backgroundColor: '#bdbdbd', transform: [{ rotate: '-12deg' }] }, stylusTip: { position: 'absolute', left: 6, bottom: -6, width: 8, height: 9, borderRadius: 1, backgroundColor: '#242424', borderBottomWidth: 3, borderBottomColor: '#d23b32' }, armHint: { position: 'absolute', right: '3%', bottom: '2.5%', color: '#686868', fontSize: 8, fontWeight: '700' },
  playerPanel: { gap: 24, paddingHorizontal: 8 }, playerPanelDesktop: { flex: 0.98, minWidth: 320, maxWidth: 470, paddingHorizontal: 0, marginBottom: 50 }, lyricsWindow: { minHeight: 190, borderRadius: 12, overflow: 'hidden', padding: 18, backgroundColor: '#181818', borderWidth: 1, borderColor: '#303030', gap: 16 }, lyricsWindowDesktop: { minHeight: 254 }, lyricsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, lyricsKicker: { color: C.text, fontSize: 11, fontWeight: '900', letterSpacing: 1.4 }, lyricsPreviewBadge: { color: '#777', fontSize: 8, fontWeight: '900', letterSpacing: 1, borderWidth: 1, borderColor: '#444', borderRadius: 99, paddingHorizontal: 7, paddingVertical: 4, transform: [{ translateY: -5 }] }, lyricsLines: { gap: 8 }, lyricsFaded: { color: '#666', fontSize: 13, lineHeight: 18, fontWeight: '600' }, lyricsActive: { color: C.green, fontSize: 15, lineHeight: 20, fontWeight: '900' }, lyricsUpcoming: { color: '#aaa', fontSize: 13, lineHeight: 18, fontWeight: '600' }, trackCopy: { alignItems: 'flex-start' }, trackKicker: { color: C.green, fontSize: 9, fontWeight: '900', letterSpacing: 1.4, marginBottom: 8 }, trackTitle: { color: C.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.7 }, trackArtist: { color: C.muted, fontSize: 14, marginTop: 6 }, seekTouch: { height: 24, justifyContent: 'center' }, progressTrack: { height: 4, borderRadius: 99, backgroundColor: '#484848' }, progressFill: { height: '100%', borderRadius: 99, backgroundColor: C.green }, seekThumb: { position: 'absolute', top: -4, width: 12, height: 12, marginLeft: -6, borderRadius: 6, backgroundColor: '#fff' }, timeRow: { flexDirection: 'row', justifyContent: 'space-between' }, timeText: { color: '#858585', fontSize: 10, fontVariant: ['tabular-nums'] }, playbackControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 30 }, skipButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }, skipText: { color: C.text, fontSize: 28, fontWeight: '700' }, playButton: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }, playText: { color: C.bg, fontSize: 24, fontWeight: '900', marginLeft: 2 }, spotifySettingsLink: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 5 }, spotifySettingsLinkText: { color: C.muted, fontSize: 11, fontWeight: '800' }, spotifySettingsArrow: { color: C.green, fontSize: 18, lineHeight: 18 }, spotifyError: { color: '#ff8585', fontSize: 11, lineHeight: 16, marginTop: -14 },
  lyricsPreviewBadgeText: { color: '#777', fontSize: 8, fontWeight: '900', letterSpacing: 1 }, lyricsViewport: { height: 96, overflow: 'hidden' }, lyricsViewportDesktop: { height: 160 }, rollingLyrics: { gap: 6 }, rollingLyricLine: { height: 20, color: '#aaa', fontSize: 13, lineHeight: 20, fontWeight: '600' }, lyricsActiveStable: { fontSize: 13, lineHeight: 18 },
  pauseIcon: { flexDirection: 'row', alignItems: 'center', gap: 5 }, pauseBar: { width: 5, height: 20, borderRadius: 2, backgroundColor: C.bg }, playTriangle: { width: 0, height: 0, marginLeft: 3, borderTopWidth: 11, borderBottomWidth: 11, borderLeftWidth: 17, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: C.bg }, skipIcon: { flexDirection: 'row', alignItems: 'center', gap: 3 }, skipStem: { width: 3, height: 19, borderRadius: 2, backgroundColor: C.text }, skipTriangleLeft: { width: 0, height: 0, borderTopWidth: 9, borderBottomWidth: 9, borderRightWidth: 13, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderRightColor: C.text }, skipTriangleRight: { width: 0, height: 0, borderTopWidth: 9, borderBottomWidth: 9, borderLeftWidth: 13, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: C.text },
  spotifyAccountSection: { minHeight: 66, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: '#202020', borderWidth: 1, borderColor: '#3b3b3b', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, spotifyAccountCopy: { flex: 1, gap: 4 }, spotifyAccountTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, spotifyAccountDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#e34837' }, spotifyAccountDotConnected: { backgroundColor: C.green }, spotifyAccountTitle: { color: C.text, fontSize: 14, fontWeight: '800' }, spotifyAccountStatus: { color: C.muted, fontSize: 11 }, spotifyAccountButton: { borderRadius: 99, backgroundColor: C.green, paddingHorizontal: 16, paddingVertical: 9 }, spotifyAccountButtonText: { color: C.bg, fontSize: 11, fontWeight: '900' }, spotifyAccountDisconnect: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#777' }, spotifyAccountDisconnectText: { color: C.text },
  sessionSection: { borderRadius: 9, padding: 14, backgroundColor: '#202020', borderWidth: 1, borderColor: '#3b3b3b', gap: 12 }, sessionActiveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, sessionRole: { color: C.text, fontSize: 14, fontWeight: '800' }, sessionCode: { color: C.green, fontSize: 13, fontWeight: '900', letterSpacing: 1.4, marginTop: 4 }, sessionHelp: { color: C.muted, fontSize: 11, lineHeight: 16 }, sessionLeaveButton: { borderWidth: 1, borderColor: '#777', borderRadius: 99, paddingHorizontal: 15, paddingVertical: 8 }, sessionLeaveText: { color: C.text, fontSize: 11, fontWeight: '800' }, sessionHostButton: { minHeight: 42, borderRadius: 99, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }, sessionHostText: { color: C.bg, fontSize: 12, fontWeight: '900' }, sessionJoinRow: { flexDirection: 'row', gap: 9 }, sessionCodeInput: { flex: 1, height: 43, borderWidth: 1, borderColor: '#666', borderRadius: 6, paddingHorizontal: 12, color: C.text, fontSize: 13, fontWeight: '800', letterSpacing: 1.2 }, sessionJoinButton: { minWidth: 70, borderRadius: 99, borderWidth: 1, borderColor: C.green, alignItems: 'center', justifyContent: 'center' }, sessionJoinText: { color: C.green, fontSize: 12, fontWeight: '900' },
});
