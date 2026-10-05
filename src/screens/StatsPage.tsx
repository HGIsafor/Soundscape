import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { spotifyApi, SpotifyToken } from '../lib/spotify';
import { Palette, useTheme, readableAccent } from '../theme/theme';
import { supabase } from '../lib/supabase';
import { rankMovement } from '../lib/rankings';

type Item = {
  id: string; name: string; images?: { url: string }[];
  artists?: { name: string }[]; album?: { name: string; images?: { url: string }[] };
  external_urls?: { spotify?: string }; duration_ms?: number;
};
type Entry = { item: Item; playedAt?: string };
type ChartSnapshot = { entries: Entry[]; capturedAt: string; previousEntries: Entry[] | null; previousAt: string | null; isCurrent: boolean };
type Section = 'tracks' | 'artists' | 'recent';
const ranges = [{ id: 'short_term', label: '4 weeks' }, { id: 'medium_term', label: '6 months' }, { id: 'long_term', label: '1 year' }];
const sections: { id: Section; label: string }[] = [{ id: 'tracks', label: 'Tracks' }, { id: 'artists', label: 'Artists' }, { id: 'recent', label: 'Recent' }];
const art = (item: Item) => item.images?.[0]?.url ?? item.album?.images?.[0]?.url;
const subtitle = (item: Item) => item.artists?.map(artist => artist.name).join(', ') ?? 'Artist';

export function StatsPage({ active, compact, accent, foreground, accountId, connected, tokenKey, getToken, onConnect, authError }: {
  active: boolean; compact: boolean; accent: string; foreground: string; accountId?: string;
  connected: boolean; tokenKey?: string; getToken: () => Promise<SpotifyToken>; onConnect: () => Promise<void>;
  authError?: string;
}) {
  const theme = useTheme();
  const st = useMemo(() => createStyles(theme), [theme]);
  const accentText = readableAccent(accent, theme);
  const [section, setSection] = useState<Section>('tracks');
  const [range, setRange] = useState('short_term');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [permissionNeeded, setPermissionNeeded] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [authorizing, setAuthorizing] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [snapshot, setSnapshot] = useState<ChartSnapshot | null>(null);
  const [cacheError, setCacheError] = useState('');
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const cache = useRef(new Map<string, { entries: Entry[]; at: number }>());
  useEffect(() => { cache.current.clear(); setEntries([]); setError(''); setUpdated(null); setSnapshot(null); setCacheError(''); }, [accountId, tokenKey]);
  useEffect(() => {
    if (!active || !connected) return;
    let cancelled = false;
    const key = `${section}:${range}`;
    const cached = cache.current.get(key);
    setError(''); setPermissionNeeded(false); setSnapshot(null); setCacheError('');
    if (section === 'recent' && cached && Date.now() - cached.at < 60000) {
      setEntries(cached.entries); setUpdated(new Date(cached.at)); setLoading(false); return;
    }
    setEntries([]); setLoading(true);
    (async () => {
      let saved: ChartSnapshot | null = null;
      let canSave = !!accountId && section !== 'recent';
      const showSnapshot = (value: ChartSnapshot) => {
        setSnapshot(value); setEntries(value.entries); setUpdated(new Date(value.capturedAt));
      };
      try {
        if (canSave) {
          const { data, error: readError } = await supabase.rpc('listening_chart', { p_section: section, p_range: range });
          if (cancelled) return;
          if (readError) {
            canSave = false;
            setCacheError('Account history is unavailable. Showing live rankings without movement.');
          } else {
            saved = data as ChartSnapshot | null;
            if (saved?.isCurrent) { showSnapshot(saved); return; }
          }
        } else if (section !== 'recent') {
          setCacheError('Sign in to save daily rankings across devices.');
        }
        const token = await getTokenRef.current();
        if (cancelled) return;
        const path = section === 'recent' ? '/me/player/recently-played?limit=50' : `/me/top/${section}?limit=50&time_range=${range}`;
        const response = await spotifyApi(token.accessToken, path);
        if (cancelled) return;
        if (!response.ok) {
          if (response.status === 403 || response.status === 401) {
            setPermissionNeeded(true);
            throw new Error('Allow access to your Spotify listening stats to see your charts. If you already allowed access, Spotify may be restricting this account or app.');
          }
          if (response.status === 429) throw new Error(`Spotify needs a short break. Try again in ${response.headers.get('Retry-After') ?? '60'} seconds.`);
          throw new Error(`Could not load your stats (Spotify ${response.status}). Please try again.`);
        }
        const data = await response.json();
        if (cancelled) return;
        const result: Entry[] = section === 'recent'
          ? (data.items ?? []).filter((entry: { track?: Item }) => entry.track).map((entry: { track: Item; played_at: string }) => ({ item: entry.track, playedAt: entry.played_at }))
          : (data.items ?? []).map((item: Item) => ({ item }));
        const at = Date.now();
        if (canSave) {
          const { data, error: saveError } = await supabase.rpc('listening_chart', { p_section: section, p_range: range, p_entries: result });
          if (cancelled) return;
          if (!saveError && data) { showSnapshot(data as ChartSnapshot); return; }
          setCacheError('Could not save today’s chart to your account. Movement will return when saving succeeds.');
        }
        cache.current.set(key, { entries: result, at });
        setEntries(result); setUpdated(new Date(at));
      } catch (cause) {
        if (!cancelled) {
          if (saved) {
            showSnapshot(saved);
            setCacheError('Could not update from Spotify. Showing your last saved chart; try refreshing later.');
          } else setError(cause instanceof Error ? cause.message : 'Could not reach Spotify. Try again.');
        }
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [active, connected, accountId, tokenKey, section, range, refresh]);

  const authorize = async () => {
    setConnectionError('');
    setAuthorizing(true);
    try { await onConnect(); } catch (cause) { setConnectionError(cause instanceof Error ? cause.message : 'Could not open Spotify login. Please try again.'); }
    finally { setAuthorizing(false); }
  };
  const openItem = async (item: Item) => {
    if (!item.external_urls?.spotify) return;
    try { await Linking.openURL(item.external_urls.spotify); }
    catch { setError('Could not open Spotify. Please try again.'); }
  };
  const first = entries[0]?.item;
  const ready = connected && !loading && !error;
  const reload = () => { cache.current.clear(); setRefresh(value => value + 1); };
  return (
    <ScrollView style={st.screen} contentContainerStyle={[st.page, !compact && st.desktop]} showsVerticalScrollIndicator={false}>
      <View style={st.headingRow}>
        <View style={st.flex}><Text style={st.heading}>Your listening, on record.</Text><Text style={st.copy}>The songs and artists you keep coming back to.</Text></View>
        {connected && <Pressable accessibilityRole="button" accessibilityLabel="Refresh listening stats" disabled={loading} onPress={reload} style={st.refresh}><Text style={{ color: accentText, fontSize: 22 }}>↻</Text></Pressable>}
      </View>
      <View style={st.tabs} accessibilityRole="tablist">
        {sections.map(tab => <Pressable key={tab.id} accessibilityRole="tab" accessibilityState={{ selected: section === tab.id }} onPress={() => setSection(tab.id)} style={[st.tab, section === tab.id && { backgroundColor: accent }]}><Text style={[st.tabText, section === tab.id && { color: foreground }]}>{tab.label}</Text></Pressable>)}
      </View>
      {section !== 'recent' && <View style={st.ranges}>{ranges.map(option => <Pressable key={option.id} accessibilityRole="button" accessibilityState={{ selected: range === option.id }} onPress={() => setRange(option.id)} style={[st.range, range === option.id && { borderColor: accent, backgroundColor: `${accent}18` }]}><Text style={[st.rangeText, range === option.id && { color: accentText }]}>{option.label}</Text></Pressable>)}</View>}
      {!!(connectionError || authError) && <Text accessibilityLiveRegion="polite" style={st.emptyCopy}>{connectionError || authError}</Text>}

      {!connected ? <View style={st.empty}>
        <View style={[st.record, { borderColor: accent }]}><View style={[st.recordLabel, { backgroundColor: accent }]} /></View>
        <Text style={st.emptyTitle}>Meet your music taste.</Text>
        <Text style={st.emptyCopy}>Connect your Spotify account to explore your personal charts and recent listening.</Text>
        <Pressable accessibilityRole="button" disabled={authorizing} onPress={authorize} style={[st.button, { backgroundColor: accent }]}><Text style={[st.buttonText, { color: foreground }]}>{authorizing ? 'Opening Spotify…' : 'Connect Spotify'}</Text></Pressable>
      </View> : loading ? <View style={st.empty}><ActivityIndicator color={accent} size="large" /><Text style={st.copy}>Reading your record collection…</Text></View> : error ? <View style={st.empty} accessibilityLiveRegion="polite">
        <Text style={st.emptyTitle}>{permissionNeeded ? 'Unlock your listening stats' : 'Couldn’t load this chart'}</Text><Text style={st.emptyCopy}>{error}</Text>
        <Pressable accessibilityRole="button" disabled={authorizing} onPress={permissionNeeded ? authorize : reload} style={[st.button, { backgroundColor: accent }]}><Text style={[st.buttonText, { color: foreground }]}>{authorizing ? 'Opening Spotify…' : permissionNeeded ? 'Enable stats' : 'Try again'}</Text></Pressable>
      </View> : null}

      {ready && first && section !== 'recent' && <Pressable accessibilityRole="link" accessibilityLabel={`Open ${first.name} in Spotify`} onPress={() => openItem(first)} style={[st.feature, compact && st.featureCompact]}>
        {art(first) ? <Image source={{ uri: art(first) }} style={[st.featureArt, section === 'artists' && st.round]} /> : <View style={[st.featureArt, st.placeholder]}><Text style={{ color: accentText, fontSize: 38 }}>♪</Text></View>}
        <View style={st.flex}><Text style={[st.kicker, { color: accentText }]}>ON REPEAT · NO. 01</Text><Text numberOfLines={2} style={st.featureTitle}>{first.name}</Text><Text numberOfLines={2} style={st.copy}>{section === 'tracks' ? subtitle(first) : 'Your top artist'}</Text><Text style={st.spotifyLink}>Open in Spotify ↗</Text></View>
      </Pressable>}

      {ready && <View style={st.panel}>
        <View style={st.panelHead}><Text style={st.panelTitle}>{section === 'recent' ? 'Recently played' : `Your top ${section}`}</Text><Text style={st.count}>{entries.length}</Text></View>
        {section !== 'recent' && snapshot && <Text style={st.comparison}>{snapshot.previousAt
          ? `Movement since ${new Date(snapshot.previousAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}. Rankings saved once per day (UTC).`
          : 'First snapshot saved. Movement appears with your next daily snapshot.'}</Text>}
        {section !== 'recent' && !!cacheError && <Text accessibilityLiveRegion="polite" style={st.comparison}>{cacheError}</Text>}
        {entries.map(({ item, playedAt }, index) => <Pressable key={`${item.id}-${playedAt ?? index}`} accessibilityRole="link" accessibilityLabel={`Open ${item.name} in Spotify${section !== 'recent' && snapshot ? `. Rank ${index + 1}. ${rankMovement(snapshot.previousEntries, item.id, index).label}` : ''}`} onPress={() => openItem(item)} style={({ pressed }) => [st.row, pressed && st.pressed]}>
          <Text style={[st.rank, index < 3 && section !== 'recent' && { color: accentText }]}>{String(index + 1).padStart(2, '0')}</Text>
          {section !== 'recent' && snapshot && <Text style={[st.movement, { color: accentText }]}>{rankMovement(snapshot.previousEntries, item.id, index).text}</Text>}
          {art(item) ? <Image source={{ uri: art(item) }} style={[st.art, section === 'artists' && st.round]} /> : <View style={[st.art, st.placeholder]}><Text style={st.meta}>♪</Text></View>}
          <View style={st.flex}><Text numberOfLines={1} style={st.itemName}>{item.name}</Text><Text numberOfLines={1} style={st.meta}>{section === 'artists' ? 'Artist' : subtitle(item)}</Text>{playedAt && <Text style={st.timestamp}>{new Date(playedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>}</View>
          <Text style={st.arrow}>↗</Text>
        </Pressable>)}
        {!entries.length && <Text style={st.emptyCopy}>No listening data for this view yet. Try another time range or come back after listening on Spotify.</Text>}
      </View>}
      <Text style={st.footer}>{section === 'recent' ? 'Your latest available Spotify history, up to 50 plays.' : 'Rankings by Spotify. Time ranges are approximate; rankings are not play counts.'}{updated && ready ? ` Updated ${updated.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}.` : ''}</Text>
    </ScrollView>
  );
}

const createStyles = (C: Palette) => StyleSheet.create({
  comparison: { color: C.secondary, fontSize: 11, lineHeight: 17, paddingBottom: 14 },
  movement: { width: 34, fontSize: 10, fontWeight: '800', fontVariant: ['tabular-nums'], textAlign: 'center' },
  screen: { flex: 1 }, page: { padding: 24, paddingBottom: 125, gap: 22 }, desktop: { width: '100%', maxWidth: 920, alignSelf: 'center', paddingTop: 12 },
  flex: { flex: 1, minWidth: 0 }, headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  heading: { color: C.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.7 }, copy: { color: C.secondary, fontSize: 13, lineHeight: 20, marginTop: 6 },
  refresh: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', padding: 5, borderRadius: 28, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, gap: 3 },
  tab: { flex: 1, paddingVertical: 13, alignItems: 'center', borderRadius: 22 }, tabText: { color: C.secondary, fontWeight: '800', fontSize: 12 },
  ranges: { flexDirection: 'row', gap: 8 }, range: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: C.border }, rangeText: { fontSize: 12, color: C.secondary, fontWeight: '700' },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 24, padding: 24, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }, featureCompact: { gap: 16, padding: 16 }, featureArt: { width: 112, height: 112, borderRadius: 8, backgroundColor: C.raised }, featureTitle: { color: C.text, fontSize: 23, fontWeight: '900', letterSpacing: -0.5, marginTop: 10 }, kicker: { fontSize: 9, letterSpacing: 1.6, fontWeight: '900' }, spotifyLink: { color: C.secondary, fontSize: 10, fontWeight: '700', marginTop: 12 },
  panel: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 16 }, panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16 }, panelTitle: { color: C.text, fontSize: 18, fontWeight: '800' }, count: { color: C.secondary, fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderColor: C.border }, rank: { color: C.subtle, fontSize: 12, fontWeight: '800', width: 23, fontVariant: ['tabular-nums'] }, art: { width: 46, height: 46, borderRadius: 5, backgroundColor: C.raised }, round: { borderRadius: 999 }, placeholder: { alignItems: 'center', justifyContent: 'center' }, itemName: { color: C.text, fontSize: 13, fontWeight: '700', flexShrink: 1 }, meta: { color: C.secondary, fontSize: 11, marginTop: 4 }, timestamp: { color: C.subtle, fontSize: 10, marginTop: 5 }, arrow: { color: C.subtle, fontSize: 18 }, pressed: { opacity: 0.6 },
  empty: { alignItems: 'center', padding: 30, paddingVertical: 44, gap: 18, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }, emptyTitle: { color: C.text, fontSize: 23, fontWeight: '800', textAlign: 'center' }, emptyCopy: { color: C.secondary, fontSize: 13, lineHeight: 21, textAlign: 'center', paddingVertical: 12 }, button: { borderRadius: 24, paddingHorizontal: 28, paddingVertical: 14 }, buttonText: { fontSize: 13, fontWeight: '800' }, record: { width: 90, height: 90, borderRadius: 45, borderWidth: 2, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }, recordLabel: { width: 28, height: 28, borderRadius: 14 },
  footer: { color: C.subtle, fontSize: 10, lineHeight: 17, textAlign: 'center' },
});
