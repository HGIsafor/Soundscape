import assert from 'node:assert/strict';
import test from 'node:test';
import { chordShape } from './chord-shapes.ts';
import { songChords, transposeContent } from './guitar.ts';

test('the reference chords have the expected string positions', () => {
  const expected = { Em: [0,2,2,0,0,0], G: [3,2,0,0,0,3], Am: [-1,0,2,2,1,0], C: [-1,3,2,0,1,0], Bm: [-1,2,4,4,3,2], D: [-1,-1,0,2,3,2] };
  for (const [name, frets] of Object.entries(expected)) assert.deepEqual(chordShape(name).frets, frets);
  assert.deepEqual(chordShape('Bm').barre, { fret: 2, from: 1, to: 5 });
});

test('movable and open shapes contain the required chord tones for all roots', () => {
  const roots = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
  const qualities = { '': [0,4,7], m: [0,3,7], '7': [0,4,7,10], m7: [0,3,7,10], maj7: [0,4,7,11], sus2: [0,2,7], sus4: [0,5,7], '5': [0,7] };
  const strings = [4,9,2,7,11,4];
  roots.forEach((root, pitch) => {
    for (const [quality, intervals] of Object.entries(qualities)) {
      const shape = chordShape(root + quality);
      assert.ok(shape, root + quality);
      const notes = new Set(shape.frets.flatMap((fret, index) => fret < 0 ? [] : [(strings[index] + fret - pitch + 12) % 12]));
      assert.ok([...notes].every(note => intervals.includes(note)), root + quality);
      // Seventh voicings may omit the fifth (the common open C7 does).
      assert.ok(intervals.filter(note => intervals.length !== 4 || note !== 7).every(note => notes.has(note)), root + quality);
      assert.equal(shape.fingers.length, 6);
      const pressed = shape.frets.filter(fret => fret > 0);
      assert.ok(Math.max(...pressed) - Math.min(...pressed) < 4, root + quality);
    }
  });
});

test('extracts unique chords in song order and follows transposition', () => {
  const source = '[Verse]\nEm G Am C Bm D\nA lyric with a C in it\nEm G\n[Am]Hello';
  assert.deepEqual(songChords(source), ['Em','G','Am','C','Bm','D']);
  assert.deepEqual(songChords(transposeContent(source, 2)), ['F#m','A','Bm','D','C#m','E']);
  assert.equal(chordShape('Cunknown'), null);
  assert.equal(chordShape('C/Bb'), null);
});
