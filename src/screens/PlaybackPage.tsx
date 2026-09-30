import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, PanResponder, Pressable, ScrollView, Text, View } from 'react-native';
import { useAppStyles } from '../theme/styles';
import { AccentContext, accentHeadingGlow } from '../theme/accent';
import { useTheme, readableAccent } from '../theme/theme';
import type { SpotifyTrack } from '../types/app';
import { DEMO_TRACKS } from '../lib/playback';
import { parseSyncedLyrics, LyricsResult } from '../lib/lyrics';
import { CurvedLabelText } from '../components/CurvedLabelText';
import { SeekBar } from '../components/SeekBar';
import { PlayPauseIcon, SkipIcon } from '../components/PlaybackIcons';

export function PlaybackPage({ playing, trackIndex, compact, spotifyTrack, spotifyHistory, spotifyNextTrack, spotifyConnected, spotifyError, spin, onConnect, onToggle, onPrevious, onNext, onJump, onSeek }: { playing: boolean; trackIndex: number; compact: boolean; spotifyTrack: SpotifyTrack | null; spotifyHistory: SpotifyTrack[]; spotifyNextTrack: SpotifyTrack | null; spotifyConnected: boolean; spotifyError: string; spin: Animated.Value; onConnect: () => void; onToggle: () => void; onPrevious: () => void; onNext: () => void; onJump: (offset: number, track: SpotifyTrack) => void; onSeek: (position: number) => void }) {
  const s = useAppStyles();
  const accent = useContext(AccentContext);
  const theme = useTheme();
  const accentText = readableAccent(accent, theme);
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
          <View style={s.trackCopy}><Text style={[s.trackKicker, { color: accentText }, (theme.mode === 'dark' ? accentHeadingGlow(accentText) : {})]}>{spotifyTrack ? 'NOW PLAYING' : 'START PLAYING'}</Text><Text style={s.trackTitle}>{track.title}</Text><Text style={s.trackArtist}>{track.artist}</Text></View>
          <View><SeekBar value={displayProgress} duration={track.durationMs} onPreview={previewProgress} onCommit={onSeek} /><View style={s.timeRow}><Text style={s.timeText}>{formatTime(displayProgress)}</Text><Text style={s.timeText}>{formatTime(track.durationMs)}</Text></View></View>
          <View style={s.playbackControls}>
            <Pressable accessibilityLabel="Previous track" onPress={onPrevious} style={({ pressed }) => [s.skipButton, pressed && s.pressed]}><SkipIcon direction="previous" /></Pressable>
            <Pressable accessibilityLabel={playing ? 'Pause' : 'Play'} onPress={onToggle} style={({ pressed }) => [s.playButton, { backgroundColor: accent }, pressed && s.pressed]}><PlayPauseIcon playing={playing} /></Pressable>
            <Pressable accessibilityLabel="Next track" onPress={onNext} style={({ pressed }) => [s.skipButton, pressed && s.pressed]}><SkipIcon direction="next" /></Pressable>
          </View>
          {!spotifyConnected && <Pressable onLayout={event => setConnectionLinkHeight(event.nativeEvent.layout.height)} onPress={onConnect} style={({ pressed }) => [s.spotifySettingsLink, pressed && s.pressed]}><Text style={s.spotifySettingsLinkText}>Go to Spotify connection</Text><Text style={[s.spotifySettingsArrow, { color: accentText }]}>›</Text></Pressable>}
          {!!spotifyError && <Text style={s.spotifyError}>{spotifyError}</Text>}
          {compact && lyricsBlock}
        </View>
      </View>
    </ScrollView>
  );
}
