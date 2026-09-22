import { parseSearch, parseTab, validTabUrl } from '../_shared/ultimate-guitar.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
const cache = new Map<string, { data: unknown; until: number }>();

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return respond({ error: 'Use POST' }, 405);
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return respond({ error: 'Sign in to look up tabs.' }, 401);
    const auth = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
      headers: { Authorization: authorization, apikey: Deno.env.get('SUPABASE_ANON_KEY')! }, signal: AbortSignal.timeout(8000),
    });
    if (!auth.ok) return respond({ error: 'Sign in to look up tabs.' }, 401);
    await auth.body?.cancel();
    const body = await request.text();
    if (body.length > 2048) return respond({ error: 'Search request is too long.' }, 400);
    let input;
    try { input = JSON.parse(body); } catch { return respond({ error: 'Invalid search request.' }, 400); }
    let url: string;
    if (input?.action === 'search' && typeof input.query === 'string' && input.query.trim().length >= 2 && input.query.length <= 200) {
      url = `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(input.query.trim())}`;
    } else if (input?.action === 'tab' && typeof input.url === 'string' && validTabUrl(input.url)) {
      url = input.url;
    } else return respond({ error: 'Enter a song and artist, or select a tab.' }, 400);
    const saved = cache.get(url);
    if (saved && saved.until > Date.now()) return respond(saved.data);
    const upstream = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!upstream.ok) {
      await upstream.body?.cancel();
      return respond({ error: upstream.status === 429 ? 'Ultimate Guitar is busy. Try again shortly.' : 'Ultimate Guitar could not load this page. Try opening it on their site.' }, 502);
    }
    const html = await upstream.text();
    if (html.length > 5000000) return respond({ error: 'This page is too large for the reader.' }, 502);
    const data = input.action === 'search' ? { results: parseSearch(html) } : { tab: parseTab(html) };
    if (cache.size >= 80) cache.delete(cache.keys().next().value!);
    cache.set(url, { data, until: Date.now() + 10 * 60 * 1000 });
    return respond(data);
  } catch (cause) {
    return respond({ error: cause instanceof Error && !['AbortError', 'TimeoutError', 'TypeError', 'SyntaxError'].includes(cause.name)
      ? cause.message : 'Could not reach Ultimate Guitar. Try again or open the song on their site.' }, 502);
  }
});
