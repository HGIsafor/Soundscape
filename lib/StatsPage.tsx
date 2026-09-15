import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { spotifyApi, SpotifyToken } from './spotify';

type Item = {
  id: string; name: string; images?: { url: string }[]; genres?: string[];
  artists?: { name: string }[]; album?: { name: string; images?: { url: string }[] };
  external_urls?: { spotify?: string }; duration_ms?: number;
};
type Entry = { item: Item; playedAt?: string };
type Section = 'tracks' | 'artists' | 'genres' | 'recent';
const ranges = [{ id: 'short_term', label: '4 weeks' }, { id: 'medium_term', label: '6 months' }, { id: 'long_term', label: '1 year' }];
const sections: { id: Section; label: string }[] = [{ id: 'tracks', label: 'Tracks' }, { id: 'artists', label: 'Artists' }, { id: 'genres', label: 'Genres' }, { id: 'recent', label: 'Recent' }];
const art = (item: Item) => item.images?.[0]?.url ?? item.album?.images?.[0]?.url;
const subtitle = (item: Item) => item.artists?.map(artist => artist.name).join(', ') ?? 'Artist';

export function StatsPage({ active, compact, accent, foreground, accountId, connected, tokenKey, getToken, onConnect }: {
  active: boolean; compact: boolean; accent: string; foreground: string; accountId?: string;
  connected: boolean; tokenKey?: string; getToken: () => Promise<SpotifyToken>; onConnect: () => Promise<void>;
}) {
  const [section, setSection] = useState<Section>('tracks');
  const [range, setRange] = useState('short_term');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [permissionNeeded, setPermissionNeeded] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [authorizing, setAuthorizing] = useState(false);
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const cache = useRef(new Map<string, { entries: Entry[]; at: number }>());
  useEffect(() => { cache.current.clear(); setEntries([]); setError(''); setUpdated(null); }, [accountId, tokenKey]);
  useEffect(() => {
    if (!active || !connected) return;
    let cancelled = false;
    const key = `${section === 'genres' ? 'artists' : section}:${range}`;
    const cached = cache.current.get(key);
    setError(''); setPermissionNeeded(false);
    if (cached && Date.now() - cached.at < 60000) {
      setEntries(cached.entries); setUpdated(new Date(cached.at)); setLoading(false); return;
    }
    setEntries([]); setLoading(true);
    (async () => {
      try {
        const token = await getTokenRef.current();
        if (cancelled) return;
        const path = section === 'recent' ? '/me/player/recently-played?limit=50' : `/me/top/${section === 'genres' ? 'artists' : section}?limit=50&time_range=${range}`;
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
        cache.current.set(key, { entries: result, at });
        setEntries(result); setUpdated(new Date(at));
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not reach Spotify. Try again.');
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [active, connected, accountId, tokenKey, section, range, refresh]);

  const genres = useMemo(() => {
    const counts = new Map<string, number>();
    entries.forEach(({ item }) => new Set(item.genres ?? []).forEach(genre => counts.set(genre, (counts.get(genre) ?? 0) + 1)));
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [entries]);
  const authorize = async () => {
    setAuthorizing(true);
    try { await onConnect(); } catch { setError('Could not open Spotify login. Please try again.'); }
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
        {connected && <Pressable accessibilityRole="button" accessibilityLabel="Refresh listening stats" disabled={loading} onPress={reload} style={st.refresh}><Text style={{ color: accent, fontSize: 22 }}>↻</Text></Pressable>}
      </View>
      <View style={st.tabs} accessibilityRole="tablist">
        {sections.map(tab => <Pressable key={tab.id} accessibilityRole="tab" accessibilityState={{ selected: section === tab.id }} onPress={() => setSection(tab.id)} style={[st.tab, section === tab.id && { backgroundColor: accent }]}><Text style={[st.tabText, section === tab.id && { color: foreground }]}>{tab.label}</Text></Pressable>)}
      </View>
      {section !== 'recent' && <View style={st.ranges}>{ranges.map(option => <Pressable key={option.id} accessibilityRole="button" accessibilityState={{ selected: range === option.id }} onPress={() => setRange(option.id)} style={[st.range, range === option.id && { borderColor: accent, backgroundColor: `${accent}18` }]}><Text style={[st.rangeText, range === option.id && { color: accent }]}>{option.label}</Text></Pressable>)}</View>}

      {!connected ? <View style={st.empty}>
        <View style={[st.record, { borderColor: accent }]}><View style={[st.recordLabel, { backgroundColor: accent }]} /></View>
        <Text style={st.emptyTitle}>Meet your music taste.</Text>
        <Text style={st.emptyCopy}>Connect your Spotify account to explore your personal charts and recent listening.</Text>
        <Pressable accessibilityRole="button" disabled={authorizing} onPress={authorize} style={[st.button, { backgroundColor: accent }]}><Text style={[st.buttonText, { color: foreground }]}>{authorizing ? 'Opening Spotify…' : 'Connect Spotify'}</Text></Pressable>
      </View> : loading ? <View style={st.empty}><ActivityIndicator color={accent} size="large" /><Text style={st.copy}>Reading your record collection…</Text></View> : error ? <View style={st.empty} accessibilityLiveRegion="polite">
        <Text style={st.emptyTitle}>{permissionNeeded ? 'Unlock your listening stats' : 'Couldn’t load this chart'}</Text><Text style={st.emptyCopy}>{error}</Text>
        <Pressable accessibilityRole="button" disabled={authorizing} onPress={permissionNeeded ? authorize : reload} style={[st.button, { backgroundColor: accent }]}><Text style={[st.buttonText, { color: foreground }]}>{authorizing ? 'Opening Spotify…' : permissionNeeded ? 'Enable stats' : 'Try again'}</Text></Pressable>
      </View> : null}

      {ready && first && section !== 'genres' && section !== 'recent' && <Pressable accessibilityRole="link" accessibilityLabel={`Open ${first.name} in Spotify`} onPress={() => openItem(first)} style={[st.feature, compact && st.featureCompact]}>
        {art(first) ? <Image source={{ uri: art(first) }} style={[st.featureArt, section === 'artists' && st.round]} /> : <View style={[st.featureArt, st.placeholder]}><Text style={{ color: accent, fontSize: 38 }}>♪</Text></View>}
        <View style={st.flex}><Text style={[st.kicker, { color: accent }]}>ON REPEAT · NO. 01</Text><Text numberOfLines={2} style={st.featureTitle}>{first.name}</Text><Text numberOfLines={2} style={st.copy}>{section === 'tracks' ? subtitle(first) : 'Your top artist'}</Text><Text style={st.spotifyLink}>Open in Spotify ↗</Text></View>
      </Pressable>}

      {ready && <View style={st.panel}>
        <View style={st.panelHead}><Text style={st.panelTitle}>{section === 'recent' ? 'Recently played' : `Your top ${section}`}</Text><Text style={st.count}>{section === 'genres' ? genres.length : entries.length}</Text></View>
        {section === 'genres' ? <>
          <Text style={st.note}>Genres associated with your top artists. Bars count artists, not plays.</Text>
          {genres.map(([genre, count], index) => <View key={genre} style={st.genre}><View style={st.headingRow}><Text style={st.itemName}>{String(index + 1).padStart(2, '0')}  {genre}</Text><Text style={st.meta}>{count} {count === 1 ? 'artist' : 'artists'}</Text></View><View style={st.bar}><View style={[st.barFill, { backgroundColor: accent, width: `${count / genres[0][1] * 100}%` }]} /></View></View>)}
          {!genres.length && <Text style={st.emptyCopy}>Spotify hasn’t supplied genre information for these artists. Your tracks and artists are still available in the other charts.</Text>}
        </> : entries.map(({ item, playedAt }, index) => <Pressable key={`${item.id}-${playedAt ?? index}`} accessibilityRole="link" accessibilityLabel={`Open ${item.name} in Spotify`} onPress={() => openItem(item)} style={({ pressed }) => [st.row, pressed && st.pressed]}>
          <Text style={[st.rank, index < 3 && section !== 'recent' && { color: accent }]}>{String(index + 1).padStart(2, '0')}</Text>
          {art(item) ? <Image source={{ uri: art(item) }} style={[st.art, section === 'artists' && st.round]} /> : <View style={[st.art, st.placeholder]}><Text style={st.meta}>♪</Text></View>}
          <View style={st.flex}><Text numberOfLines={1} style={st.itemName}>{item.name}</Text><Text numberOfLines={1} style={st.meta}>{section === 'artists' ? item.genres?.slice(0, 2).join(' · ') || 'Artist' : subtitle(item)}</Text>{playedAt && <Text style={st.timestamp}>{new Date(playedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>}</View>
          <Text style={st.arrow}>↗</Text>
        </Pressable>)}
        {!entries.length && section !== 'genres' && <Text style={st.emptyCopy}>No listening data for this view yet. Try another time range or come back after listening on Spotify.</Text>}
      </View>}
      <Text style={st.footer}>{section === 'recent' ? 'Your latest available Spotify history, up to 50 plays.' : 'Rankings by Spotify. Time ranges are approximate; rankings are not play counts.'}{updated && ready ? ` Updated ${updated.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}.` : ''}</Text>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1 }, page: { padding: 24, paddingBottom: 125, gap: 22 }, desktop: { width: '100%', maxWidth: 920, alignSelf: 'center', paddingTop: 12 },
  flex: { flex: 1, minWidth: 0 }, headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  heading: { color: '#fff', fontSize: 24, fontWeight: '800', letterSpacing: -0.7 }, copy: { color: '#999', fontSize: 13, lineHeight: 20, marginTop: 6 },
  refresh: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: '#303030', alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', padding: 5, borderRadius: 28, backgroundColor: '#171717', borderWidth: 1, borderColor: '#303030', gap: 3 },
  tab: { flex: 1, paddingVertical: 13, alignItems: 'center', borderRadius: 22 }, tabText: { color: '#999', fontWeight: '800', fontSize: 12 },
  ranges: { flexDirection: 'row', gap: 8 }, range: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#303030' }, rangeText: { fontSize: 12, color: '#999', fontWeight: '700' },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 24, padding: 24, borderRadius: 20, backgroundColor: '#161616', borderWidth: 1, borderColor: '#333' }, featureCompact: { gap: 16, padding: 16 }, featureArt: { width: 112, height: 112, borderRadius: 8, backgroundColor: '#252525' }, featureTitle: { color: '#fff', fontSize: 23, fontWeight: '900', letterSpacing: -0.5, marginTop: 10 }, kicker: { fontSize: 9, letterSpacing: 1.6, fontWeight: '900' }, spotifyLink: { color: '#b3b3b3', fontSize: 10, fontWeight: '700', marginTop: 12 },
  panel: { backgroundColor: '#121212', borderWidth: 1, borderColor: '#303030', borderRadius: 18, padding: 16 }, panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16 }, panelTitle: { color: '#fff', fontSize: 18, fontWeight: '800' }, count: { color: '#999', fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderColor: '#242424' }, rank: { color: '#777', fontSize: 12, fontWeight: '800', width: 23, fontVariant: ['tabular-nums'] }, art: { width: 46, height: 46, borderRadius: 5, backgroundColor: '#252525' }, round: { borderRadius: 999 }, placeholder: { alignItems: 'center', justifyContent: 'center' }, itemName: { color: '#eee', fontSize: 13, fontWeight: '700', flexShrink: 1 }, meta: { color: '#999', fontSize: 11, marginTop: 4 }, timestamp: { color: '#777', fontSize: 10, marginTop: 5 }, arrow: { color: '#777', fontSize: 18 }, pressed: { opacity: 0.6 },
  empty: { alignItems: 'center', padding: 30, paddingVertical: 44, gap: 18, borderRadius: 20, backgroundColor: '#121212', borderWidth: 1, borderColor: '#303030' }, emptyTitle: { color: '#fff', fontSize: 23, fontWeight: '800', textAlign: 'center' }, emptyCopy: { color: '#999', fontSize: 13, lineHeight: 21, textAlign: 'center', paddingVertical: 12 }, button: { borderRadius: 24, paddingHorizontal: 28, paddingVertical: 14 }, buttonText: { fontSize: 13, fontWeight: '800' }, record: { width: 90, height: 90, borderRadius: 45, borderWidth: 2, backgroundColor: '#080808', alignItems: 'center', justifyContent: 'center' }, recordLabel: { width: 28, height: 28, borderRadius: 14 },
  genre: { gap: 12, paddingVertical: 14 }, bar: { height: 5, borderRadius: 3, backgroundColor: '#292929', overflow: 'hidden' }, barFill: { height: '100%', borderRadius: 3 }, note: { color: '#999', fontSize: 11, lineHeight: 18, paddingBottom: 12 }, footer: { color: '#777', fontSize: 10, lineHeight: 17, textAlign: 'center' },
});
