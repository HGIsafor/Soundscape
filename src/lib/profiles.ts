import type { Profile } from '../types/app';

export const DEFAULTS: Profile[] = [
  { id: 'warm', name: 'Warm', values: { bass: 72, mid: 55, treble: 42, ambience: 28, gain: 64 } },
  { id: 'flat', name: 'Flat', values: { bass: 50, mid: 50, treble: 50, ambience: 20, gain: 58 } },
  { id: 'bright', name: 'Bright', values: { bass: 42, mid: 58, treble: 76, ambience: 24, gain: 56 } },
];
