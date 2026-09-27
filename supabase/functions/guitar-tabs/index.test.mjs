import assert from 'node:assert/strict';
import test from 'node:test';

let handler;
globalThis.Deno = { serve: value => { handler = value; }, env: { get: name => name === 'SUPABASE_URL' ? 'https://account.example' : 'test-public-key' } };
await import('./index.ts');
const request = body => new Request('https://function.example', { method: 'POST', headers: { Authorization: 'Bearer test-token' }, body: JSON.stringify(body) });
const authResponse = () => Response.json({ id: 'test-user' });
const row = { id: 987, song_name: 'Fixture', artist_name: 'Test Artist', type: 'Tabs', tab_access_type: 'public', tab_url: 'https://tabs.ultimate-guitar.com/tab/test-artist/fixture-tabs-987' };
const html = data => `<div class="js-store" data-content="${JSON.stringify({ store: { page: { data } } }).replace(/"/g, '&quot;')}"></div>`;

test('preflight works without authentication; unsigned calls are rejected', async () => {
  const preflight = await handler(new Request('https://function.example', { method: 'OPTIONS' }));
  assert.equal(preflight.status, 200);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), '*');
  const unsigned = await handler(new Request('https://function.example', { method: 'POST' }));
  assert.equal(unsigned.status, 401);
});
test('invalid sessions never reach the provider', async t => {
  let count = 0;
  t.mock.method(globalThis, 'fetch', async url => { count++; assert.equal(url, 'https://account.example/auth/v1/user'); return new Response('', { status: 401 }); });
  assert.equal((await handler(request({ action: 'search', query: 'Song' }))).status, 401);
  assert.equal(count, 1);
});
test('arbitrary URLs and invalid inputs are rejected after authentication', async t => {
  t.mock.method(globalThis, 'fetch', async url => { assert.equal(url, 'https://account.example/auth/v1/user'); return authResponse(); });
  for (const body of [{ action: 'tab', url: 'https://127.0.0.1/private' }, { action: 'search', query: 'x' }, { action: 'search', query: 'x'.repeat(201) }, null]) {
    assert.equal((await handler(request(body))).status, 400);
  }
});
test('successful lookups are cached while every request still authenticates', async t => {
  let providerCalls = 0, authCalls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.includes('/auth/v1/user')) { authCalls++; return authResponse(); }
    providerCalls++;
    assert.ok(url.startsWith('https://www.ultimate-guitar.com/search.php?'));
    assert.equal(options.redirect, 'error');
    return new Response(html({ results: [row] }));
  });
  for (let index = 0; index < 2; index++) {
    const response = await handler(request({ action: 'search', query: 'Fixture cache' }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).results[0].title, 'Fixture');
  }
  assert.equal(providerCalls, 1);
  assert.equal(authCalls, 2);
});
test('provider failure returns a readable error with CORS headers', async t => {
  t.mock.method(globalThis, 'fetch', async url => url.includes('/auth/v1/user') ? authResponse() : new Response('', { status: 429 }));
  const response = await handler(request({ action: 'search', query: 'Busy provider' }));
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /busy/);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
});
