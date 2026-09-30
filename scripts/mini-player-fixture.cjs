const fs = require('node:fs');
const env = require('dotenv').parse(fs.readFileSync('.env'));

async function installFixture(context) {
  const supabase = env.EXPO_PUBLIC_SUPABASE_URL;
  const user = { id: '00000000-0000-4000-8000-000000000001', email: 'test@example.com', user_metadata: {} };
  const expires = Math.floor(Date.now() / 1000) + 86400;
  const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: expires })).toString('base64url')}.fixture`;
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
    key: `sb-${new URL(supabase).hostname.split('.')[0]}-auth-token`,
    session: { access_token: token, refresh_token: 'fixture', expires_at: expires, expires_in: 86400, token_type: 'bearer', user },
  });
  await context.route(`${supabase}/**`, route => {
    const url = route.request().url();
    let data = [];
    if (url.includes('/auth/v1/user')) data = user;
    if (url.includes('/user_settings')) data = { username: 'Listener', favorite_color: '#1ed760', follow_cover: false };
    if (url.includes('/spotify_connections')) data = { access_token: 'fixture', refresh_token: 'fixture', expires_at: new Date(expires * 1000).toISOString() };
    return route.fulfill({ status: 200, json: data });
  });
  let index = 0, playing = true, position = 35000;
  const calls = [];
  const item = offset => ({ id: String(offset), uri: `spotify:track:${offset}`, name: ['Midnight Drive', 'Morning Light'][Math.abs(offset) % 2], artists: [{ name: 'Test Artist' }], album: { name: 'After Hours', images: [] }, duration_ms: 210000 });
  await context.route('https://api.spotify.com/**', route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() !== 'GET') {
      calls.push({ path: url.pathname, query: url.search });
      if (calls.failNext) { calls.failNext = false; return route.fulfill({ status: 403 }); }
      if (url.pathname.endsWith('/pause')) playing = false;
      if (url.pathname.endsWith('/play')) playing = true;
      if (url.pathname.endsWith('/next')) { index++; position = 0; }
      if (url.pathname.endsWith('/previous')) { index--; position = 0; }
      if (url.pathname.endsWith('/seek')) position = Number(url.searchParams.get('position_ms'));
      return route.fulfill({ status: 204 });
    }
    if (url.pathname.endsWith('/queue')) return route.fulfill({ json: { currently_playing: item(index), queue: [item(index + 1)] } });
    if (url.pathname.endsWith('/player')) return route.fulfill({ json: { item: item(index), progress_ms: position, is_playing: playing } });
    return route.fulfill({ json: { items: [] } });
  });
  await context.route('https://lrclib.net/**', route => route.fulfill({ status: 404 }));
  return calls;
}
module.exports = { installFixture };
