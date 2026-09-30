import { PlaybackPage } from './screens/PlaybackPage';
import { SoundscapePage } from './screens/SoundscapePage';
import { ColorWheel } from './components/ColorWheel';
import { TurntableNavIcon, EqualizerNavIcon } from './components/NavigationIcons';
import { AccentContext, accentForeground, accentHeadingGlow, normalizeColor, colorAlpha } from './theme/accent';
import { contrastStyles, createStyles } from './theme/styles';
import type { Account, Profile, SharedSession, SpotifyTrack, Values } from './types/app';
import { DEFAULTS } from './lib/profiles';
import { DEMO_TRACKS, spotifyItemToTrack, sameSpotifyTrack, spotifyTrackKey } from './lib/playback';
import * as ImagePicker from 'expo-image-picker';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, SafeAreaView,
  Image, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { supabase } from './lib/supabase';
import { coverColor } from './lib/cover-color';
import { StatsPage } from './screens/StatsPage';
import { GuitarPage } from './screens/GuitarPage';
import { layoutDistance, useDisplayDimensions } from './lib/display-scale';
import { MiniPlayer } from './components/mini-player/MiniPlayer';
import type { MiniPlayerHandle, MiniRotationValue } from './components/mini-player/mini-player-types';
import { palettes, ThemeContext, ThemeMode, readableAccent } from './theme/theme';
import { loadSpotifyToken, refreshSpotifyToken, saveSpotifyToken, spotifyApi, spotifyDiscovery, spotifyScopes, SpotifyToken } from './lib/spotify';

// A direct visit to the callback has no opener and Expo throws here, which used
// to prevent React from mounting and left the user on a completely white page.
let spotifyBrowserCompletion: ReturnType<typeof WebBrowser.maybeCompleteAuthSession> | null = null;
if (Platform.OS === 'web') {
  try { spotifyBrowserCompletion = WebBrowser.maybeCompleteAuthSession(); } catch { /* handled in App */ }
}

const C = palettes.dark;
const PAGES = ['guitar', 'music', 'eq', 'stats'] as const;
type Page = typeof PAGES[number];
const adjacentPage = (page: Page, direction: number): Page => PAGES[Math.max(0, Math.min(PAGES.length - 1, PAGES.indexOf(page) + direction))];
const initials = (name: string) => name.trim().split(/\s+/).filter(Boolean).map(word => word[0]).join('').toUpperCase() || '?';
const EMAIL_TYPOS: Record<string, string> = { 'gmai.com': 'gmail.com', 'gmial.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmail.co': 'gmail.com', 'hotnail.com': 'hotmail.com', 'outlok.com': 'outlook.com', 'yaho.com': 'yahoo.com' };
export default function App() {
  const { width } = useDisplayDimensions();
  const miniPlayer = useRef<MiniPlayerHandle>(null);
  const compact = width < 760;
  const [themeSaving, setThemeSaving] = useState(false);
  const [themeError, setThemeError] = useState('');
  const spotifyClientId = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID!;
  const spotifyRedirectUri = Platform.OS === 'web'
    ? process.env.EXPO_PUBLIC_SPOTIFY_REDIRECT_URI?.trim() || `${window.location.origin}/spotify-callback`
    : AuthSession.makeRedirectUri({ scheme: 'soundscape-login', path: 'callback', native: 'soundscape-login://callback' });
  const [spotifyRequest, spotifyResponse, promptSpotify] = AuthSession.useAuthRequest({ clientId: spotifyClientId, responseType: AuthSession.ResponseType.Code, redirectUri: spotifyRedirectUri, scopes: spotifyScopes, usePKCE: true }, spotifyDiscovery);
  const [page, setPage] = useState<Page>('eq');
  const [navWidth, setNavWidth] = useState(0);
  const spin = useRef(new Animated.Value(0)).current;
  const pagerX = useRef(new Animated.Value(-width * PAGES.indexOf('eq'))).current;
  const pagerLatest = useRef({ page: 'eq' as Page, width });
  pagerLatest.current = { page, width };
  const [playing, setPlaying] = useState(false);
  const [trackIndex, setTrackIndex] = useState(0);
  const [spotifyToken, setSpotifyToken] = useState<SpotifyToken | null>(null);
  const [spotifyTrack, setSpotifyTrack] = useState<SpotifyTrack | null>(null);
  const [spotifyHistory, setSpotifyHistory] = useState<SpotifyTrack[]>([]);
  const [spotifyNextTrack, setSpotifyNextTrack] = useState<SpotifyTrack | null>(null);
  const [spotifyError, setSpotifyError] = useState('');
  const [spotifyAuthError, setSpotifyAuthError] = useState('');
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
  const [favoriteColorDraft, setFavoriteColorDraft] = useState<string>(C.green);
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
  const themeMode = user?.theme ?? 'dark';
  const theme = palettes[themeMode];
  const accentText = readableAccent(accent, theme);
  const s = useMemo(() => contrastStyles(accent, createStyles(theme)), [accent, theme]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    document.documentElement.style.colorScheme = themeMode;
    document.documentElement.style.backgroundColor = theme.bg;
    document.body.style.backgroundColor = theme.bg;
  }, [themeMode, theme]);
  const changeTheme = async (next: ThemeMode) => {
    if (themeSaving || next === themeMode) return;
    setThemeError('');
    if (!user) return;
    const accountId = user.id;
    setThemeSaving(true);
    try {
      // Supabase merges this preference into the signed-in account's metadata.
      // No device storage or schema migration is needed.
      const { error } = await supabase.auth.updateUser({ data: { soundscape_theme: next } });
      if (error) throw error;
      setUser(current => current?.id === accountId ? { ...current, theme: next } : current);
    } catch {
      setThemeError('Could not save your appearance. Please try again.');
    } finally { setThemeSaving(false); }
  };
  const accentTheme = useMemo(() => ({
    text: { color: accentText },
    background: { backgroundColor: accent },
    border: { borderColor: accent },
    backgroundBorder: { backgroundColor: accent, borderColor: accent },
    tint: { backgroundColor: colorAlpha(accent, 0.14) },
  }), [accent, accentText]);

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
    if (spotifyResponse?.type === 'error') {
      setSpotifyAuthError(`Spotify login failed: ${spotifyResponse.params.error_description ?? spotifyResponse.params.error ?? 'Please try again.'}`);
      return;
    }
    if (spotifyResponse?.type !== 'success' || !spotifyResponse.params.code || !spotifyRequest?.codeVerifier || !user) return;
    AuthSession.exchangeCodeAsync({ clientId: spotifyClientId, code: spotifyResponse.params.code, redirectUri: spotifyRedirectUri, extraParams: { code_verifier: spotifyRequest.codeVerifier } }, spotifyDiscovery)
      .then(async response => {
        if (!response.refreshToken) throw new Error('Spotify did not return a refresh token');
        const token = { accessToken: response.accessToken, refreshToken: response.refreshToken, expiresAt: Date.now() + (response.expiresIn ?? 3600) * 1000 };
        setSpotifyToken(token); await saveSpotifyToken(user.id, token); await readSpotifyPlayback(token);
      }).catch(error => {
        const message = error instanceof Error ? error.message : 'Spotify login failed';
        setSpotifyError(message); setSpotifyAuthError(message);
      });
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
    try { await authorizeSpotify(); }
    catch (error) { setSpotifyError(error instanceof Error ? error.message : 'Could not open Spotify login.'); }
  };
  const authorizeSpotify = async () => {
    if (!user) { setAuthOpen(true); return; }
    setSpotifyAuthError('');
    if (Platform.OS === 'web') {
      const callback = new URL(spotifyRedirectUri);
      if (callback.hostname === 'localhost' || (callback.protocol !== 'https:' && !(callback.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(callback.hostname)))) {
        throw new Error('Spotify requires HTTPS or a loopback IP address. For local development, open Soundscape at http://127.0.0.1:' + (window.location.port || '80') + ' and register its /spotify-callback URL in the Spotify Developer Dashboard.');
      }
      if (callback.origin !== window.location.origin) {
        throw new Error(`Open Soundscape at ${callback.origin} before connecting Spotify so login can return to this browser session.`);
      }
    }
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

  const loadCloudAccount = async (authUser: { id: string; email?: string; user_metadata?: Record<string, unknown> }) => {
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
    setUser({ id: authUser.id, email: authUser.email ?? '', name: settings?.username ?? authUser.email?.split('@')[0] ?? 'User', avatarPath: settings?.avatar_path ?? undefined, avatarUrl, favoriteColor: normalizeColor(settings?.favorite_color), followCover: settings?.follow_cover === true, theme: authUser.user_metadata?.soundscape_theme === 'light' ? 'light' : 'dark' });
    setProfiles(loaded);
    if (loaded.length) { setSelectedId(loaded[0].id); setValues({ ...loaded[0].values }); }
    else setSelectedId('custom');
  };
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) loadCloudAccount(data.user); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === 'USER_UPDATED' && session) {
        setUser(current => current?.id === session.user.id ? { ...current, theme: session.user.user_metadata?.soundscape_theme === 'light' ? 'light' : 'dark' } : current);
        return;
      }
      if (session) setTimeout(() => loadCloudAccount(session.user), 0);
      else {
        setThemeError('');
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
  const animateToPage = (target: Page) => {
    if (pagerLatest.current.page === 'music' && target !== 'music') miniPlayer.current?.leavingPlayback();
    setPage(target);
    Animated.spring(pagerX, { toValue: -PAGES.indexOf(target) * pagerLatest.current.width, useNativeDriver: true, tension: 70, friction: 11 }).start();
  };
  useEffect(() => { pagerX.setValue(-PAGES.indexOf(page) * width); }, [width]);
  const leftEdgePan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => pagerX.stopAnimation(),
    onPanResponderMove: (_event, gesture) => {
      const index = PAGES.indexOf(pagerLatest.current.page);
      const pageWidth = pagerLatest.current.width;
      pagerX.setValue(Math.max(-index * pageWidth, Math.min(-(index - 1) * pageWidth, -index * pageWidth + layoutDistance(gesture.dx))));
    },
    onPanResponderRelease: (_event, gesture) => {
      const click = Math.abs(gesture.dx) < 8 && Math.abs(gesture.dy) < 8;
      animateToPage(click || gesture.dx > 40 || gesture.vx > 0.45 ? adjacentPage(pagerLatest.current.page, -1) : pagerLatest.current.page);
    },
    onPanResponderTerminate: () => animateToPage(pagerLatest.current.page),
  })).current;
  const rightEdgePan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => pagerX.stopAnimation(),
    onPanResponderMove: (_event, gesture) => {
      const index = PAGES.indexOf(pagerLatest.current.page);
      const pageWidth = pagerLatest.current.width;
      pagerX.setValue(Math.max(-(index + 1) * pageWidth, Math.min(-index * pageWidth, -index * pageWidth + layoutDistance(gesture.dx))));
    },
    onPanResponderRelease: (_event, gesture) => {
      const click = Math.abs(gesture.dx) < 8 && Math.abs(gesture.dy) < 8;
      animateToPage(click || gesture.dx < -40 || gesture.vx < -0.45 ? adjacentPage(pagerLatest.current.page, 1) : pagerLatest.current.page);
    },
    onPanResponderTerminate: () => animateToPage(pagerLatest.current.page),
  })).current;
  const navigation = (
    <View style={[s.appNav, compact ? s.appNavMobile : s.appNavDesktop, Platform.OS === 'web' && ({ position: 'fixed' } as any)]}>
      <View onLayout={event => setNavWidth(event.nativeEvent.layout.width)} style={s.navTabs}>
        {navWidth > 0 && <Animated.View pointerEvents="none" style={[s.navIndicator, accentTheme.background, { width: (navWidth - 4 * (PAGES.length - 1)) / PAGES.length, transform: [{ translateX: pagerX.interpolate({ inputRange: [-width * (PAGES.length - 1), 0], outputRange: [(navWidth + 4) * (PAGES.length - 1) / PAGES.length, 0], extrapolate: 'clamp' }) }] }]} />}
        <Pressable accessibilityRole="button" accessibilityLabel="Guitar tabs" accessibilityState={{ selected: page === 'guitar' }} onPress={() => animateToPage('guitar')} style={[s.navItem, s.navItemTall]}>
          <Text style={{ color: page === 'guitar' ? accentForeground(accent) : theme.muted, fontSize: 14, fontWeight: '900', letterSpacing: 1 }}>TAB</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Music" onPress={() => animateToPage('music')} style={[s.navItem, s.navItemTall]}>
          <TurntableNavIcon active={page === 'music'} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Sound profiles" onPress={() => animateToPage('eq')} style={[s.navItem, s.navItemTall]}>
          <EqualizerNavIcon active={page === 'eq'} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Listening stats" accessibilityState={{ selected: page === 'stats' }} onPress={() => animateToPage('stats')} style={[s.navItem, s.navItemTall]}>
          <View style={{ height: 28, flexDirection: 'row', alignItems: 'flex-end', gap: 5 }}>
            {[12, 25, 18].map((height, index) => <View key={index} style={{ width: 6, height, borderRadius: 2, backgroundColor: page === 'stats' ? accentForeground(accent) : theme.muted }} />)}
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
              <Text style={[s.eyebrow, accentTheme.text, (theme.mode === 'dark' ? accentHeadingGlow(accentText) : {})]}>{page === 'guitar' ? 'PLAY ALONG' : page === 'music' ? 'PLAYBACK' : page === 'stats' ? 'YOUR LISTENING' : 'SOUND PROFILE'}</Text>
        <Text style={s.title}>{page === 'guitar' ? 'Guitar' : page === 'music' ? 'Turntable' : page === 'stats' ? 'On Record' : 'Soundscape'}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <MiniPlayer ref={miniPlayer} available={Platform.OS === 'web' && !compact} playing={playing}
        track={spotifyTrack}
        connected={!!spotifyToken || !!sharedSession} error={spotifyError} accent={accent} foreground={accentForeground(accent)} textColor={theme.text} surfaceColor={theme.bg} rotationValue={spin as unknown as MiniRotationValue}
        onToggle={() => controlSpotify('toggle')} onPrevious={() => controlSpotify('previous', spotifyHistory.at(-1))}
        onNext={() => controlSpotify('next')} onSeek={seekSpotify} onPlayback={() => animateToPage('music')} onConnect={openAccount} />
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
    </View>
  );

  return (
    <ThemeContext.Provider value={theme}>
    <AccentContext.Provider value={accent}>
    <SafeAreaView style={s.safe}>
      <StatusBar style={themeMode === 'light' ? 'dark' : 'light'} />
      {appHeader}
      <View style={s.pagerViewport}>
        <Animated.View style={[s.pagerTrack, { width: width * PAGES.length, transform: [{ translateX: pagerX }] }]}>
          <View style={[s.pagerPage, { width }]}>
            <GuitarPage key={user?.id ?? 'guest'} active={page === 'guitar'} compact={compact} accent={accent} foreground={accentForeground(accent)} track={spotifyTrack} accountId={user?.id} onSignIn={openAccount} />
          </View>
          <View style={[s.pagerPage, { width }]}>
            <PlaybackPage
              playing={playing}
              trackIndex={trackIndex}
              spin={spin}
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
            <SoundscapePage compact={compact} canManage={!!user} profiles={profiles} selected={selected} selectedId={selectedId}
              summary={summary} values={values} sliderTransition={sliderTransition} onSave={() => setSaveOpen(true)}
              onDelete={setDeleteTarget} onChoose={choose} onChooseCustom={chooseCustom} onUpdate={update} />
          </View>
          <View style={[s.pagerPage, { width }]}>
            <StatsPage active={page === 'stats'} compact={compact} accent={accent} foreground={accentForeground(accent)} accountId={user?.id} connected={!!spotifyToken} tokenKey={spotifyToken?.accessToken}
              getToken={async () => { if (!spotifyToken) throw new Error('Connect Spotify first.'); return ensureSpotifyToken(spotifyToken); }}
              onConnect={authorizeSpotify} authError={spotifyAuthError} />
          </View>
        </Animated.View>
        {page !== 'guitar' && <View accessible accessibilityRole="button" accessibilityLabel={`Open ${adjacentPage(page, -1)} page`} onAccessibilityTap={() => animateToPage(adjacentPage(page, -1))} {...leftEdgePan.panHandlers} style={[s.edgeButton, s.edgeButtonLeft]} />}
        {page !== 'stats' && <View accessible accessibilityRole="button" accessibilityLabel={`Open ${adjacentPage(page, 1)} page`} onAccessibilityTap={() => animateToPage(adjacentPage(page, 1))} {...rightEdgePan.panHandlers} style={[s.edgeButton, s.edgeButtonRight]} />}
      </View>
      {navigation}

      <Modal visible={saveOpen} transparent animationType="fade" onRequestClose={() => setSaveOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSaveOpen(false)} />
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>Name this profile</Text>
            <Text style={s.dialogCopy}>Save these settings to use them again anytime.</Text>
            <TextInput autoFocus value={name} onChangeText={setName} onSubmitEditing={save} placeholder="Profile name" placeholderTextColor={theme.subtle} selectionColor={accent} maxLength={30} style={s.input} />
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
              <View style={s.sessionActiveRow}>
                <Text style={[s.dialogTitle, { flex: 1 }]}>Profile settings</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View accessible={false} aria-hidden style={{ width: 20, height: 20, overflow: 'hidden' }}>
                    <View style={{ position: 'absolute', left: 1, top: 1, width: 18, height: 18, borderRadius: 9, backgroundColor: theme.text }} />
                    <View style={{ position: 'absolute', left: 7, top: -3, width: 17, height: 17, borderRadius: 9, backgroundColor: theme.dialog }} />
                  </View>
                  <Switch accessibilityLabel="Dark mode" accessibilityHint="Saves your appearance to your account" value={themeMode === 'dark'} disabled={themeSaving} onValueChange={enabled => changeTheme(enabled ? 'dark' : 'light')} trackColor={{ false: theme.line, true: accent }} thumbColor={themeMode === 'dark' ? accentForeground(accent) : theme.text} ios_backgroundColor={theme.line} />
                </View>
              </View>
              {!!themeError && <Text accessibilityLiveRegion="polite" style={s.errorText}>{themeError}</Text>}
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
              <TextInput autoCapitalize="none" value={username} onChangeText={text => { setUsername(text); setAuthError(''); }} onSubmitEditing={() => currentPasswordRef.current?.focus()} returnKeyType="next" blurOnSubmit={false} placeholder="Username" placeholderTextColor={theme.subtle} selectionColor={accent} style={s.input} />
              <Text style={s.fieldLabel}>ACCENT COLOR</Text>
              <View style={s.colorSettingsRow}>
                <Pressable accessibilityLabel="Open color picker" onPress={() => setColorPickerOpen(true)} style={[s.colorPreview, { backgroundColor: normalizeColor(favoriteColorDraft) }]} />
                <TextInput autoCapitalize="none" value={favoriteColorDraft} onChangeText={text => { setFavoriteColorDraft(text); setAuthError(''); }} maxLength={7} placeholder="#1ed760" placeholderTextColor={theme.subtle} selectionColor={accent} style={[s.input, s.colorInput]} />
              </View>
              <Pressable accessibilityRole="switch" accessibilityState={{ checked: followCoverDraft }} onPress={() => setFollowCoverDraft(current => !current)} style={[s.sessionJoinButton, { padding: 12 }, followCoverDraft && accentTheme.background]}>
                <Text style={{ color: followCoverDraft ? accentForeground(accent) : accentText, fontWeight: '700' }}>Follow cover {followCoverDraft ? 'On' : 'Off'}</Text>
              </Pressable>
              <Text style={s.helper}>Match the playing cover. Your chosen color stays saved as the fallback.</Text>
              <Text style={s.fieldLabel}>CURRENT PASSWORD</Text>
              <TextInput ref={currentPasswordRef} secureTextEntry value={currentPassword} onChangeText={text => { setCurrentPassword(text); setAuthError(''); }} onSubmitEditing={() => newPasswordRef.current?.focus()} returnKeyType="next" blurOnSubmit={false} placeholder="Required to change password" placeholderTextColor={theme.subtle} selectionColor={accent} style={s.input} />
              <Text style={s.fieldLabel}>NEW PASSWORD</Text>
              <TextInput ref={newPasswordRef} secureTextEntry value={password} onChangeText={text => { setPassword(text); setAuthError(''); }} onSubmitEditing={() => passwordConfirmRef.current?.focus()} returnKeyType="next" blurOnSubmit={false} placeholder="Leave blank to keep current" placeholderTextColor={theme.subtle} selectionColor={accent} style={s.input} />
              <TextInput ref={passwordConfirmRef} secureTextEntry value={passwordConfirm} onChangeText={text => { setPasswordConfirm(text); setAuthError(''); }} onSubmitEditing={saveAccount} returnKeyType="done" placeholder="Repeat new password" placeholderTextColor={theme.subtle} selectionColor={accent} style={s.input} />
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
                      <TextInput autoCapitalize="characters" value={joinCode} onChangeText={text => { setJoinCode(text.toUpperCase()); setSessionError(''); }} onSubmitEditing={joinSession} returnKeyType="go" maxLength={6} placeholder="SESSION CODE" placeholderTextColor={theme.subtle} selectionColor={accent} style={s.sessionCodeInput} />
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
              {authMode === 'create' && <TextInput autoFocus value={username} onChangeText={text => { setUsername(text); setAuthError(''); }} onSubmitEditing={() => emailRef.current?.focus()} returnKeyType="next" blurOnSubmit={false} placeholder="Username" placeholderTextColor={theme.subtle} selectionColor={accent} style={s.input} />}
              <TextInput ref={emailRef} autoFocus={authMode === 'login'} autoCapitalize="none" keyboardType={authMode === 'create' ? 'email-address' : 'default'} value={email} onChangeText={text => { setEmail(text); setAuthError(''); }} onSubmitEditing={() => passwordRef.current?.focus()} returnKeyType="next" blurOnSubmit={false} placeholder={authMode === 'login' ? 'Email or username' : 'Email'} placeholderTextColor={theme.subtle} selectionColor={accent} style={s.input} />
              <TextInput ref={passwordRef} secureTextEntry value={password} onChangeText={text => { setPassword(text); setAuthError(''); }} onSubmitEditing={() => authMode === 'create' ? passwordConfirmRef.current?.focus() : submitAuth()} returnKeyType={authMode === 'create' ? 'next' : 'done'} blurOnSubmit={authMode !== 'create'} placeholder="Password" placeholderTextColor={theme.subtle} selectionColor={accent} style={s.input} />
              {authMode === 'create' && <TextInput ref={passwordConfirmRef} secureTextEntry value={passwordConfirm} onChangeText={text => { setPasswordConfirm(text); setAuthError(''); }} onSubmitEditing={() => submitAuth()} returnKeyType="done" placeholder="Repeat password" placeholderTextColor={theme.subtle} selectionColor={accent} style={s.input} />}
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
    </ThemeContext.Provider>
  );
}
