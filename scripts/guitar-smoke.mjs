// Network smoke test: node --experimental-strip-types scripts/guitar-smoke.mjs
// Prints metadata only; no tab content is stored or logged.
import assert from 'node:assert/strict';
import { parseSearch, parseTab } from '../supabase/functions/_shared/ultimate-guitar.ts';
import { bestGuitarMatch, guitarSearchUrl } from '../src/lib/guitar.ts';

const search = await fetch(guitarSearchUrl('Radiohead Creep'), { signal: AbortSignal.timeout(15000) });
assert.equal(search.status, 200, 'Public search should respond');
const results = parseSearch(await search.text());
const match = bestGuitarMatch(results, 'Creep', 'Radiohead');
assert.ok(match, 'An exact public tab or chords version should match');
const response = await fetch(match.url, { signal: AbortSignal.timeout(15000) });
assert.equal(response.status, 200, 'Public tab should respond');
const tab = parseTab(await response.text());
assert.ok(tab.content.length > 0);
console.log(JSON.stringify({ results: results.length, matched: tab.title, artist: tab.artist, type: tab.type, contentCharacters: tab.content.length }));
