import type { GuitarResult } from '../supabase/functions/_shared/ultimate-guitar';
export type { GuitarResult, GuitarTab } from '../supabase/functions/_shared/ultimate-guitar';

export const cleanSongTitle = (title: string) => title
  .replace(/\s*\((?:[^)]*\b(?:remaster(?:ed)?|live|mono|stereo|radio edit)\b[^)]*)\)/gi, '')
  .replace(/\s+-\s+(?:.*\b(?:remaster(?:ed)?|live|mono|stereo|radio edit)\b.*)$/gi, '').trim();
const normalize = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
export const guitarSearchUrl = (query: string) => `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(query)}`;

// Only open automatically when both song and artist agree. Other matches stay
// available for the listener to choose, including cover versions.
export function bestGuitarMatch(results: GuitarResult[], title: string, artist: string) {
  const artists = [artist, ...artist.split(/,\s*|;\s*/)].map(normalize);
  return results.filter(item => normalize(cleanSongTitle(item.title)) === normalize(cleanSongTitle(title)) && artists.includes(normalize(item.artist)))
    .sort((a, b) => Number(b.type === 'Tabs') - Number(a.type === 'Tabs') || b.votes - a.votes || b.rating - a.rating)[0] ?? null;
}

const chordPattern = /^([A-G])([#b♯♭]?)(?:(m(?:aj|in)?|maj|dim|aug|sus|add|M|ø|°|\+|-)?(\d*(?:(?:sus|add|no|maj|[#b])\d+)*(?:\([\d,#b+\-]+\))?))(?:\/([A-G])([#b♯♭]?))?$/;
const pitch: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const sharps = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const flats = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export function transposeChord(chord: string, semitones: number) {
  if (!semitones || !chordPattern.test(chord)) return chord;
  const names = /[b♭]/.test(chord) ? flats : sharps;
  return chord.replace(/(^|\/)([A-G])([#b♯♭]?)/g, (_whole, prefix: string, note: string, accidental: string) => {
    const offset = accidental === '#' || accidental === '♯' ? 1 : accidental === 'b' || accidental === '♭' ? -1 : 0;
    return prefix + names[((pitch[note] + offset + semitones) % 12 + 12) % 12];
  });
}

export function transposeContent(content: string, semitones: number) {
  if (!semitones) return content;
  return content.split('\n').map(line => {
    // Transpose only chord rows or explicitly bracketed chords. Never change
    // prose, lyric words, string labels, tuning instructions, or fret numbers.
    const tokens = line.trim().split(/\s+/);
    const chordRow = tokens.some(token => chordPattern.test(token)) && tokens.every(token => chordPattern.test(token) || /^(?:[|:/()%\-]+|x\d+|N\.C\.)$/i.test(token));
    if (!chordRow) return line.replace(/\[([^\]\n]+)\]/g, (whole, chord: string) => chordPattern.test(chord) ? `[${transposeChord(chord, semitones)}]` : whole);
    // Use following spaces to absorb chord-width changes, keeping later chords
    // above the same lyric columns whenever there is room.
    return line.replace(/\S+\s*/g, group => {
      const chord = group.trimEnd();
      const changed = transposeChord(chord, semitones);
      const space = group.length - chord.length;
      return changed + ' '.repeat(space ? Math.max(1, space + chord.length - changed.length) : 0);
    });
  }).join('\n');
}

export function songChords(content: string) {
  const found = new Set<string>();
  for (const line of content.split('\n')) {
    const tokens = line.trim().split(/\s+/);
    if (tokens.some(token => chordPattern.test(token)) && tokens.every(token => chordPattern.test(token) || /^(?:[|:/()%\-]+|x\d+|N\.C\.)$/i.test(token))) {
      tokens.filter(token => chordPattern.test(token)).forEach(token => found.add(token));
    } else {
      for (const match of line.matchAll(/\[([^\]\n]+)\]/g)) if (chordPattern.test(match[1])) found.add(match[1]);
    }
  }
  return [...found];
}

export function capoLabel(capo: string, content = '') {
  let value = capo.trim();
  if (!value) value = content.match(/^\s*capo\s*:?\s*(.+)$/im)?.[1]?.trim() ?? '';
  if (!value) return 'No capo';
  if (/^(?:0|none|no capo|without capo)\.?$/i.test(value)) return 'No capo';
  const fret = value.match(/^(?:(?:on|at)\s+)?(?:the\s+)?(?:(?:fret\s+)(\d{1,2})|(\d{1,2})(?:st|nd|rd|th)?(?:\s+fret)?)\.?$/i);
  if (fret) return Number(fret[1] ?? fret[2]) === 0 ? 'No capo' : `Fret ${Number(fret[1] ?? fret[2])}`;
  return value;
}
