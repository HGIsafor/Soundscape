import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { bestGuitarMatch, capoLabel, cleanSongTitle, guitarSearchUrl, transposeContent } from '../lib/guitar';
import type { GuitarResult, GuitarTab } from '../lib/guitar';
import { Palette, readableAccent, useTheme } from '../theme/theme';
import { ChordDiagrams } from '../components/ChordDiagrams';

type Track = { title: string; artist: string; artwork?: string };
type Search = { query: string; track?: Track; attempt: number };

export function GuitarPage({ active, compact, accent, foreground, track, accountId, onSignIn }: {
  active: boolean; compact: boolean; accent: string; foreground: string;
  track: Track | null; accountId?: string; onSignIn: () => void;
}) {
  const theme = useTheme();
  const s = useMemo(() => styles(theme), [theme]);
  const accentText = readableAccent(accent, theme);
  const [sync, setSync] = useState(true);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<Search | null>(null);
  const [results, setResults] = useState<GuitarResult[]>([]);
  const [resultsWidth, setResultsWidth] = useState(0);
  const [selected, setSelected] = useState<GuitarResult | null>(null);
  const [tab, setTab] = useState<GuitarTab | null>(null);
  const [searching, setSearching] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [tabError, setTabError] = useState('');
  const [retry, setRetry] = useState(0);
  const fontSize = 13;
  const resultGroups = useMemo(() => {
    if (search?.track) return [{ artist: '', items: results }];
    const groups = new Map<string, { artist: string; items: GuitarResult[] }>();
    for (const item of results) {
      const key = item.artist.trim().toLocaleLowerCase();
      const group = groups.get(key);
      if (group) group.items.push(item);
      else groups.set(key, { artist: item.artist, items: [item] });
    }
    return [...groups.values()];
  }, [results, search?.track]);
  const [transpose, setTranspose] = useState(0);
  const transposedContent = useMemo(() => transposeContent(tab?.content ?? '', transpose), [tab?.content, transpose]);
  useEffect(() => { setTranspose(0); }, [selected?.url]);
  const cache = useRef(new Map<string, { at: number; data: unknown }>());

  async function request<T>(body: object, signal: AbortSignal): Promise<T> {
    const key = JSON.stringify(body);
    const saved = cache.current.get(key);
    if (saved && Date.now() - saved.at < 600000) return saved.data as T;
    const { data, error: failure } = await supabase.functions.invoke('guitar-tabs', { body, signal });
    if (failure) {
      let message = 'Tab lookup is unavailable. Try again or open Ultimate Guitar below.';
      try {
        const details = await failure.context?.json();
        if (typeof details?.error === 'string') message = details.error;
      } catch { /* Keep the fallback for network and deployment errors. */ }
      throw new Error(message);
    }
    if (!data || data.error) throw new Error(data?.error || 'No response from tab search. Please try again.');
    if (cache.current.size >= 60) cache.current.delete(cache.current.keys().next().value!);
    cache.current.set(key, { data, at: Date.now() });
    return data as T;
  }

  useEffect(() => {
    if (!sync) return;
    setSelected(null); setTab(null); setResults([]); setError(''); setTabError('');
    if (!track) { setSearch(null); setQuery(''); return; }
    const next = `${cleanSongTitle(track.title)} ${track.artist}`.slice(0, 200);
    setQuery(next);
    setSearch({ query: next, track: { title: track.title, artist: track.artist }, attempt: 0 });
  }, [sync, track?.title, track?.artist]);

  useEffect(() => {
    if (!active || !accountId || !search) return;
    const controller = new AbortController();
    setSearching(true); setError('');
    request<{ results: GuitarResult[] }>({ action: 'search', query: search.query }, controller.signal)
      .then(data => {
        if (controller.signal.aborted) return;
        const match = search.track ? bestGuitarMatch(data.results, search.track.title, search.track.artist) : null;
        const ranked = match ? [match, ...data.results.filter(item => item.id !== match.id)] : data.results;
        const visible = search.track ? ranked.slice(0, 5) : ranked;
        setResults(visible);
        if (search.track) setSelected(current => visible.some(item => item.id === current?.id) ? current : match);
      })
      .catch(cause => { if (!controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    return () => controller.abort();
  }, [active, accountId, search]);

  useEffect(() => {
    if (!active || !accountId || !selected) return;
    const controller = new AbortController();
    setReading(true); setTab(null); setTabError('');
    request<{ tab: GuitarTab }>({ action: 'tab', url: selected.url }, controller.signal)
      .then(data => {
        if (controller.signal.aborted) return;
        setTab(data.tab);
      })
      .catch(cause => { if (!controller.signal.aborted) setTabError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setReading(false); });
    return () => controller.abort();
  }, [active, accountId, selected?.url, retry]);

  const submit = () => {
    if (query.trim().length < 2) return;
    setSync(false); setSelected(null); setTab(null); setResults([]); setTabError('');
    setSearch(previous => ({ query: query.trim(), attempt: (previous?.attempt ?? 0) + 1 }));
  };
  const open = async (url: string) => {
    try { await Linking.openURL(url); }
    catch { setError('Could not open the browser. Please try again.'); }
  };
  const sourceUrl = selected?.url ?? guitarSearchUrl(search?.query ?? query);

  return <ScrollView style={s.screen} contentContainerStyle={[s.page, !compact && s.desktop]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
    <View style={s.syncCard}>
      <View style={s.flex}><Text style={s.heading}>Play along.</Text><Text style={s.copy}>{sync ? 'Tabs follow your currently playing song.' : 'Auto-sync is off. Stay with this song or find another.'}</Text></View>
      <View style={s.switchGroup}><Text style={[s.kicker, { color: accentText }]}>AUTO-SYNC</Text><Switch accessibilityLabel="Sync guitar tabs with the playing song" value={sync} onValueChange={setSync} trackColor={{ false: theme.line, true: accent }} thumbColor={theme.text} /></View>
    </View>

    {sync && track && <View style={s.nowPlaying}>
      {track.artwork && <Image source={{ uri: track.artwork }} style={s.art} />}
      <View style={s.flex}><Text style={[s.kicker, { color: accentText }]}>FOLLOWING PLAYBACK</Text><Text numberOfLines={2} style={s.song}>{track.title}</Text><Text numberOfLines={1} style={s.copy}>{track.artist}</Text></View>
    </View>}

    <View style={s.searchRow}>
      <TextInput accessibilityLabel="Search guitar tabs by song or artist" placeholder="Song or artist" placeholderTextColor={theme.subtle} value={query} onChangeText={setQuery} onSubmitEditing={submit} returnKeyType="search" maxLength={200} style={s.input} selectionColor={accent} />
      <Pressable accessibilityRole="button" disabled={query.trim().length < 2} onPress={submit} style={[s.button, { backgroundColor: accent, opacity: query.trim().length < 2 ? 0.45 : 1 }]}><Text style={[s.buttonText, { color: foreground }]}>Search</Text></Pressable>
    </View>
    {sync && <Text style={s.hint}>Searching manually turns auto-sync off.</Text>}

    {!accountId ? <View style={s.empty}><Text style={s.heading}>Your next song starts here.</Text><Text style={s.copy}>Sign in to find guitar tabs and chords inside the app.</Text><Pressable accessibilityRole="button" onPress={onSignIn} style={[s.button, { backgroundColor: accent }]}><Text style={[s.buttonText, { color: foreground }]}>Sign in</Text></Pressable></View>
      : !search ? <View style={s.empty}><Text style={s.heading}>{sync ? 'Put a song on.' : 'Find something to play.'}</Text><Text style={s.copy}>Start Spotify playback to follow along, or search for a song and artist above.</Text></View>
      : searching ? <View style={s.loading}><ActivityIndicator color={accentText} /><Text style={s.copy}>Finding tabs…</Text></View>
      : error ? <View style={s.empty}><Text accessibilityLiveRegion="polite" style={s.copy}>{error}</Text><Pressable accessibilityRole="button" onPress={() => setSearch({ ...search, attempt: search.attempt + 1 })}><Text style={[s.link, { color: accentText }]}>Try again</Text></Pressable></View>
      : <>
        <View style={s.resultsHead}><Text style={s.heading}>{search.track ? 'Tabs & versions' : 'Search results'}</Text><Text style={s.hint}>{results.length} found</Text></View>
        {!results.length && <Text style={s.copy}>No public guitar tabs or chords found. Try a shorter song title or another artist spelling.</Text>}
        {!!results.length && !selected && <Text style={s.copy}>{search.track ? 'No exact song and artist match. Choose a result below, or refine your search.' : 'Choose a version to open the tab.'}</Text>}
        {resultGroups.map(group => <View key={group.artist} style={!search.track && s.artistSection}>
          {!search.track && <View style={s.artistHeading}><View style={[s.artistMark, { backgroundColor: accent }]} /><Text accessibilityRole="header" style={s.artistName}>{group.artist}</Text><Text style={s.hint}>{group.items.length}</Text></View>}
          <View onLayout={event => setResultsWidth(event.nativeEvent.layout.width)} style={[s.results, compact && { gap: 5 }]}>
          {group.items.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: selected?.id === item.id }} onPress={() => setSelected(item)} style={[s.result, { width: resultsWidth ? Math.floor((resultsWidth - 4 * (compact ? 5 : 8)) / 5 * 100) / 100 : '18%' }, selected?.id === item.id && { borderColor: accentText, backgroundColor: theme.raised }]}>
            <Text numberOfLines={1} style={[s.kicker, { color: accentText, letterSpacing: 0, fontSize: compact ? 8 : 9 }]}>{item.type}</Text>
            <Text style={[s.version, { color: accentText }]}>V{item.version || 1}</Text>
            <Text numberOfLines={2} style={[s.resultTitle, compact && { fontSize: 10 }]}>{item.title}</Text><Text numberOfLines={1} style={s.resultArtist}>{item.artist}</Text>
            <Text numberOfLines={1} style={s.rating}>{item.rating ? `★ ${item.rating.toFixed(1)}` : 'Unrated'}</Text>
          </Pressable>)}
          </View>
        </View>)}
      </>}

    {!!selected && !searching && !error && <View style={s.reader}>
      <View style={s.readerHead}><View style={s.flex}><Text style={s.readerTitle}>{selected.title}</Text><Text style={s.copy}>{selected.artist} · {selected.type} · Version {selected.version || 1}</Text></View>
      </View>
      {reading ? <View style={s.loading}><ActivityIndicator color={accentText} /><Text style={s.copy}>Opening tab…</Text></View>
        : tabError ? <View style={s.empty}><Text accessibilityLiveRegion="polite" style={s.copy}>{tabError}</Text><Pressable accessibilityRole="button" onPress={() => setRetry(value => value + 1)}><Text style={[s.link, { color: accentText }]}>Retry this version</Text></Pressable></View>
        : tab && <>
          <View style={s.practiceControls}>
            <View style={s.capoCard}><Text style={[s.kicker, { color: accentText }]}>CAPO · ORIGINAL TAB</Text><Text style={s.song}>{capoLabel(tab.capo, tab.content)}</Text></View>
            <View style={s.transposeGroup}><Text style={[s.kicker, { color: accentText }]}>TRANSPOSE</Text><View style={s.fontButtons}>
              <Pressable accessibilityRole="button" accessibilityLabel="Transpose down one semitone" disabled={transpose <= -12} onPress={() => setTranspose(value => Math.max(-12, value - 1))} style={[s.fontButton, transpose <= -12 && { opacity: 0.4 }]}><Text style={s.fontText}>−</Text></Pressable>
              <Text accessibilityLiveRegion="polite" style={s.transposeValue}>{transpose > 0 ? '+' : ''}{transpose}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Transpose up one semitone" disabled={transpose >= 12} onPress={() => setTranspose(value => Math.min(12, value + 1))} style={[s.fontButton, transpose >= 12 && { opacity: 0.4 }]}><Text style={s.fontText}>+</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Reset transposition" disabled={transpose === 0} onPress={() => setTranspose(0)} style={[s.fontButton, { paddingHorizontal: 10, opacity: transpose === 0 ? 0.4 : 1 }]}><Text style={s.fontText}>Reset</Text></Pressable>
            </View></View>
          </View>
          <Text style={s.transposeHint}>Each step shifts chord names by one semitone. Keep the shown capo position; fret numbers and Spotify audio stay unchanged.</Text>
          <View style={s.details}>{[tab.difficulty, tab.tuning && `Tuning: ${tab.tuning}`, tab.author && `By ${tab.author}`].filter(Boolean).map(detail => <Text key={detail} style={s.detail}>{detail}</Text>)}</View>
          <ChordDiagrams content={transposedContent} tuning={tab.tuning} />
          <ScrollView horizontal style={s.tabScroll} contentContainerStyle={s.tabContent}><Text selectable style={[s.tabText, { fontSize, lineHeight: fontSize * 1.55 }]}>{transposedContent}</Text></ScrollView>
        </>}
    </View>}
    <Pressable accessibilityRole="link" onPress={() => open(sourceUrl)} style={s.source}><Text style={[s.link, { color: accentText }]}>{selected ? 'View original on Ultimate Guitar ↗' : 'Search on Ultimate Guitar ↗'}</Text></Pressable>
    <Text style={s.footer}>Tabs and chords from Ultimate Guitar contributors. Auto-sync follows song changes; tab scrolling is manual.</Text>
  </ScrollView>;
}

const styles = (C: Palette) => StyleSheet.create({
  artistSection: { borderTopWidth: 1, borderColor: C.border, paddingTop: 18, gap: 14 }, artistHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 }, artistMark: { width: 4, height: 22, borderRadius: 2 }, artistName: { flex: 1, color: C.text, fontSize: 17, fontWeight: '800' },
  practiceControls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 20, paddingHorizontal: 20, paddingBottom: 14 }, capoCard: { flexGrow: 1 }, transposeGroup: { gap: 8 }, transposeValue: { color: C.text, fontSize: 16, fontWeight: '800', minWidth: 36, textAlign: 'center', lineHeight: 44, fontVariant: ['tabular-nums'] }, transposeHint: { color: C.secondary, fontSize: 11, lineHeight: 17, paddingHorizontal: 20, paddingBottom: 16 },
  screen: { flex: 1 }, page: { padding: 24, paddingBottom: 125, gap: 18 }, desktop: { width: '100%', maxWidth: 1100, alignSelf: 'center', paddingTop: 12 },
  flex: { flex: 1, minWidth: 0 }, heading: { color: C.text, fontSize: 21, fontWeight: '800', letterSpacing: -0.5 }, copy: { color: C.secondary, fontSize: 13, lineHeight: 20, marginTop: 5 },
  syncCard: { flexDirection: 'row', alignItems: 'center', gap: 18 }, switchGroup: { alignItems: 'center', gap: 8 }, kicker: { fontSize: 9, letterSpacing: 1.2, fontWeight: '900' },
  nowPlaying: { flexDirection: 'row', gap: 16, padding: 18, alignItems: 'center', backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border }, art: { width: 64, height: 64, borderRadius: 8 }, song: { color: C.text, fontSize: 16, fontWeight: '800', marginTop: 8 },
  searchRow: { flexDirection: 'row', gap: 10 }, input: { flex: 1, minWidth: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, color: C.text, paddingHorizontal: 16, paddingVertical: 14, fontSize: 14 }, button: { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }, buttonText: { fontSize: 13, fontWeight: '800' }, hint: { color: C.subtle, fontSize: 11 },
  empty: { alignItems: 'center', gap: 16, backgroundColor: C.surface, borderRadius: 16, padding: 24 }, loading: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, padding: 28 },
  resultsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, results: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 10 }, result: { flexGrow: 0, flexShrink: 0, minWidth: 0, paddingHorizontal: 7, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface }, rating: { color: C.secondary, fontSize: 10, marginTop: 8 }, version: { fontSize: 10, fontWeight: '800', marginTop: 3 }, resultTitle: { color: C.text, fontSize: 13, fontWeight: '800', marginTop: 6 }, resultArtist: { color: C.secondary, fontSize: 10, marginTop: 4 },
  reader: { backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }, readerHead: { flexDirection: 'row', gap: 10, padding: 20, alignItems: 'center' }, readerTitle: { color: C.text, fontSize: 22, fontWeight: '900' }, fontButtons: { flexDirection: 'row', gap: 6 }, fontButton: { minWidth: 42, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: C.raised, borderRadius: 8 }, fontText: { color: C.text, fontSize: 14, fontWeight: '800' },
  details: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingBottom: 16 }, detail: { color: C.secondary, fontSize: 11, paddingVertical: 5, paddingHorizontal: 9, backgroundColor: C.raised, borderRadius: 6 },
  tabScroll: { flexGrow: 0, flexShrink: 0, borderTopWidth: 1, borderColor: C.border }, tabContent: { padding: 20 }, tabText: { color: C.text, fontFamily: Platform.OS === 'ios' ? 'Menlo' : Platform.OS === 'web' ? 'monospace' : 'monospace' },
  source: { alignItems: 'center', paddingVertical: 8 }, link: { fontSize: 12, fontWeight: '800' }, footer: { color: C.subtle, fontSize: 10, lineHeight: 17, textAlign: 'center' },
});
