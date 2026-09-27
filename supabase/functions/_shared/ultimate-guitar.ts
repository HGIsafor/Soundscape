export type GuitarResult = {
  id: number; title: string; artist: string; type: 'Tabs' | 'Chords';
  url: string; rating: number; votes: number; version: number; difficulty: string;
};
export type GuitarTab = GuitarResult & { content: string; tuning: string; capo: string; author: string };

type RecordValue = Record<string, any>;
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const text = (value: unknown) => typeof value === 'string' ? value : '';
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;

export function validTabUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'tabs.ultimate-guitar.com'
      && !url.port && !url.username && !url.password && /^\/tab\/[a-z0-9/_-]+-\d+$/i.test(url.pathname)
      && !url.search && !url.hash;
  } catch { return false; }
}

export function decodeEntities(value: string) {
  const named: Record<string, string> = { quot: '"', apos: "'", amp: '&', lt: '<', gt: '>', nbsp: ' ' };
  return value.replace(/&(#x[\da-f]+|#\d+|quot|apos|amp|lt|gt|nbsp);/gi, (original, entity: string) => {
    if (entity[0] !== '#') return named[entity.toLowerCase()] ?? original;
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : original;
  });
}

export function pageData(html: string): RecordValue {
  const tag = html.match(/<div\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi)
    ?.find(value => /\bclass=["'][^"']*\bjs-store\b[^"']*["']/i.test(value));
  const encoded = tag?.match(/\bdata-content=(?:"([^"]*)"|'([^']*)')/i);
  if (!encoded) throw new Error('Ultimate Guitar is not returning tab data right now. Try opening the song on their site.');
  const parsed = JSON.parse(decodeEntities(encoded[1] ?? encoded[2]));
  const data = record(record(record(parsed).store).page).data;
  if (!data || typeof data !== 'object') throw new Error('Ultimate Guitar returned an unfamiliar page.');
  return record(data);
}

function result(value: unknown): GuitarResult | null {
  const row = record(value);
  if (!['Tabs', 'Chords'].includes(row.type) || row.tab_access_type !== 'public' || !validTabUrl(text(row.tab_url))) return null;
  if (!number(row.id) || !text(row.song_name) || !text(row.artist_name)) return null;
  return { id: row.id, title: row.song_name, artist: row.artist_name, type: row.type,
    url: row.tab_url, rating: number(row.rating), votes: number(row.votes), version: number(row.version), difficulty: text(row.difficulty) };
}

export function parseSearch(html: string): GuitarResult[] {
  const data = pageData(html);
  if (!Array.isArray(data.results)) throw new Error('Ultimate Guitar search is unavailable right now.');
  const seen = new Set<number>();
  return data.results.flatMap((row: unknown) => {
    const item = result(row);
    if (!item || seen.has(item.id)) return [];
    seen.add(item.id);
    return [item];
  }).slice(0, 50);
}

export function parseTab(html: string): GuitarTab {
  const data = pageData(html);
  const item = result(data.tab);
  const view = record(data.tab_view);
  const wiki = record(view.wiki_tab);
  if (!item || view.blocked || !text(wiki.content)) throw new Error('This version is not available in the reader. Open it on Ultimate Guitar or choose another version.');
  const meta = record(view.meta);
  // Render as native text, never as HTML. Preserve spaces and tab line alignment.
  const content = text(wiki.content).replace(/\[\/?(?:tab|ch)\]/gi, '').replace(/\r\n/g, '\n');
  if (content.length > 250000) throw new Error('This tab is too large for the reader. Open it on Ultimate Guitar.');
  return { ...item, content, tuning: text(record(meta.tuning).value),
    capo: typeof meta.capo === 'number' || typeof meta.capo === 'string' ? String(meta.capo) : '', author: text(wiki.username) };
}
