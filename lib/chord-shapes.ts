// Strings run left to right from low E to high e. -1 means muted, 0 open.
export type ChordShape = { frets: number[]; fingers: number[]; barre?: { fret: number; from: number; to: number } };
const shape = (frets: number[], fingers: number[]): ChordShape => ({ frets, fingers });
const open: Record<string, ChordShape> = {
  C: shape([-1,3,2,0,1,0], [0,3,2,0,1,0]),
  D: shape([-1,-1,0,2,3,2], [0,0,0,1,3,2]),
  E: shape([0,2,2,1,0,0], [0,2,3,1,0,0]),
  G: shape([3,2,0,0,0,3], [2,1,0,0,0,3]),
  A: shape([-1,0,2,2,2,0], [0,0,1,2,3,0]),
  Am: shape([-1,0,2,2,1,0], [0,0,2,3,1,0]),
  Em: shape([0,2,2,0,0,0], [0,1,2,0,0,0]),
  Dm: shape([-1,-1,0,2,3,1], [0,0,0,2,3,1]),
  A7: shape([-1,0,2,0,2,0], [0,0,1,0,2,0]),
  C7: shape([-1,3,2,3,1,0], [0,3,2,4,1,0]),
  D7: shape([-1,-1,0,2,1,2], [0,0,0,2,1,3]),
  E7: shape([0,2,0,1,0,0], [0,2,0,1,0,0]),
  G7: shape([3,2,0,0,0,1], [3,2,0,0,0,1]),
  B7: shape([-1,2,1,2,0,2], [0,2,1,3,0,4]),
  Am7: shape([-1,0,2,0,1,0], [0,0,2,0,1,0]),
  Em7: shape([0,2,0,0,0,0], [0,2,0,0,0,0]),
  Dm7: { ...shape([-1,-1,0,2,1,1], [0,0,0,2,1,1]), barre: { fret: 1, from: 4, to: 5 } },
  Cmaj7: shape([-1,3,2,0,0,0], [0,3,2,0,0,0]),
  Amaj7: shape([-1,0,2,1,2,0], [0,0,2,1,3,0]),
  Dmaj7: { ...shape([-1,-1,0,2,2,2], [0,0,0,1,1,1]), barre: { fret: 2, from: 3, to: 5 } },
  Asus2: shape([-1,0,2,2,0,0], [0,0,1,2,0,0]),
  Asus4: shape([-1,0,2,2,3,0], [0,0,1,2,3,0]),
  Dsus2: shape([-1,-1,0,2,3,0], [0,0,0,1,3,0]),
  Dsus4: shape([-1,-1,0,2,3,3], [0,0,0,1,3,4]),
  Cadd9: shape([-1,3,2,0,3,0], [0,2,1,0,3,0]),
  'D/F#': shape([2,-1,0,2,3,2], [1,0,0,2,4,3]),
  'G/B': shape([-1,2,0,0,0,3], [0,1,0,0,0,3]),
  'C/G': shape([3,3,2,0,1,0], [3,4,2,0,1,0]),
  'C/E': shape([0,3,2,0,1,0], [0,3,2,0,1,0]),
  'Am/G': shape([3,0,2,2,1,0], [4,0,2,3,1,0]),
};
const pitches: Record<string, number> = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
export function chordShape(name: string): ChordShape | null {
  const clean = name.replace(/♯/g, '#').replace(/♭/g, 'b').replace(/min(?=\d|$)/, 'm');
  if (open[clean]) return open[clean];
  const match = clean.match(/^([A-G])([#b]?)(m|7|m7|maj7|sus2|sus4|5)?$/);
  if (!match) return null;
  const root = (pitches[match[1]] + (match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0) + 12) % 12;
  const quality = match[3] ?? '';
  // A-family movable shapes preserve a playable fingering for every root.
  const base = (root - 9 + 12) % 12;
  const templates: Record<string, [number[], number[]]> = {
    '': [[-1,0,2,2,2,0], [0,1,2,3,4,1]],
    m: [[-1,0,2,2,1,0], [0,1,3,4,2,1]],
    '7': [[-1,0,2,0,2,0], [0,1,3,1,4,1]],
    m7: [[-1,0,2,0,1,0], [0,1,3,1,2,1]],
    maj7: [[-1,0,2,1,2,0], [0,1,3,2,4,1]],
    sus2: [[-1,0,2,2,0,0], [0,1,3,4,1,1]],
    sus4: [[-1,0,2,2,3,0], [0,1,2,3,4,1]],
    '5': [[-1,0,2,2,-1,-1], [0,1,3,4,0,0]],
  };
  const [frets, fingers] = templates[quality];
  return { frets: frets.map(fret => fret < 0 ? -1 : fret + base), fingers: fingers.map((finger, index) => frets[index] === 0 && base === 0 ? 0 : finger),
    ...(base > 0 && quality !== '5' ? { barre: { fret: base, from: 1, to: 5 } } : {}) };
}
