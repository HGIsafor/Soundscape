import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSearch, parseTab, validTabUrl, decodeEntities } from '../supabase/functions/_shared/ultimate-guitar.ts';
import { bestGuitarMatch, capoLabel, cleanSongTitle, guitarSearchUrl, transposeChord, transposeContent } from './guitar.ts';

const row = { id: 123, song_name: 'Example Song', artist_name: 'Example Artist', type: 'Tabs', tab_access_type: 'public', tab_url: 'https://tabs.ultimate-guitar.com/tab/example-artist/example-song-tabs-123', votes: 10, rating: 4.5, version: 2 };
const page = data => `<div class="js-store" data-content="${JSON.stringify({ store: { page: { data } } }).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></div>`;

test('transposition handles roots, accidentals, chord qualities and slash bass notes', () => {
  assert.equal(transposeChord('C', 1), 'C#');
  assert.equal(transposeChord('C', -1), 'B');
  assert.equal(transposeChord('Bbmaj7/F', 2), 'Cmaj7/G');
  assert.equal(transposeChord('F#m7/C#', -2), 'Em7/B');
  assert.equal(transposeChord('Gsus4', 2), 'Asus4');
  assert.equal(transposeChord('C7(b9)', 2), 'D7(b9)');
  assert.equal(transposeChord('Am', -12), 'Am');
  assert.equal(transposeChord('Bridge', 2), 'Bridge');
});
test('transposition preserves lyrics, tablature, headings and chord alignment', () => {
  const source = '[Verse]\nC    G/B  Am\nA quiet day in E\ne|--0--2--|\n[Am]hello [G]there';
  assert.equal(transposeContent(source, 1), '[Verse]\nC#   G#/C A#m\nA quiet day in E\ne|--0--2--|\n[A#m]hello [G#]there');
  assert.equal(transposeContent(source, 0), source);
});
test('capo display distinguishes missing information, no capo, and a fret position', () => {
  assert.equal(capoLabel('0'), 'No capo');
  assert.equal(capoLabel('2'), 'Fret 2');
  assert.equal(capoLabel('3rd fret'), 'Fret 3');
  assert.equal(capoLabel(''), 'No capo');
  assert.equal(capoLabel('', 'Capo: 4th fret\nC G Am'), 'Fret 4');
  assert.equal(capoLabel('', 'Capo: none\nC G'), 'No capo');
  assert.equal(capoLabel('2', 'Capo: 4'), 'Fret 2');
});

test('search accepts public text tabs, removes duplicates and rejects paid or external results', () => {
  const results = parseSearch(page({ results: [row, row, { ...row, id: 124, type: 'Official' }, { ...row, id: 125, tab_access_type: 'private' }, { ...row, id: 126, tab_url: 'https://example.org/tab/123' }] }));
  assert.equal(results.length, 1);
  assert.equal(results[0].title, 'Example Song');
  assert.equal(results[0].version, 2);
  assert.deepEqual(parseSearch(page({ results: [] })), []);
  assert.throws(() => parseSearch('<html>Unavailable</html>'), /not returning/);
});
test('reader preserves tablature alignment and brackets without rendering markup', () => {
  const tab = parseTab(page({ tab: row, tab_view: { wiki_tab: { content: '[tab]e|--0--2--|\r\n  [ch]Am[/ch]  [Intro]\n<script>text</script>[/tab]', username: 'Contributor' }, meta: { tuning: { value: 'E A D G B E' }, capo: 0 } } }));
  assert.equal(tab.content, 'e|--0--2--|\n  Am  [Intro]\n<script>text</script>');
  assert.equal(tab.capo, '0');
  assert.equal(tab.tuning, 'E A D G B E');
  assert.throws(() => parseTab(page({ tab: row, tab_view: { blocked: true, wiki_tab: { content: 'restricted' } } })), /not available/);
});
test('only exact Ultimate Guitar tab URLs are accepted', () => {
  assert.ok(validTabUrl(row.tab_url));
  for (const url of ['http://tabs.ultimate-guitar.com/tab/a/b-1', 'https://tabs.ultimate-guitar.com.evil.test/tab/a/b-1', 'https://user:pass@tabs.ultimate-guitar.com/tab/a/b-1', 'https://tabs.ultimate-guitar.com:8443/tab/a/b-1', row.tab_url + '?redirect=https://example.org', 'https://127.0.0.1/tab/a/b-1', 'file:///tab/a/b-1']) assert.equal(validTabUrl(url), false);
});
test('entities decode once without corrupting literal ampersands', () => {
  assert.equal(decodeEntities('&quot;A &amp; B&#39; &amp;quot; &#x1F3B8;'), '"A & B\' &quot; 🎸');
});
test('auto-match requires the correct artist and handles Spotify edition suffixes', () => {
  const [item] = parseSearch(page({ results: [row] }));
  assert.equal(cleanSongTitle('Example Song - 2011 Remaster'), 'Example Song');
  assert.equal(bestGuitarMatch([{ ...item, artist: 'Cover Artist', votes: 999 }, item], 'Example Song (Remastered)', 'Example Artist')?.id, item.id);
  assert.equal(bestGuitarMatch([item], 'Different Song', 'Example Artist'), null);
  assert.equal(bestGuitarMatch([item], 'Example Song', 'Different Artist'), null);
  assert.equal(bestGuitarMatch([{ ...item, title: '東京' }], '大阪', 'Example Artist'), null);
  assert.ok(guitarSearchUrl('A & B').includes('A%20%26%20B'));
});
