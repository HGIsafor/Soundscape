import { supabase } from './supabase';

export const spotifyDiscovery = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
};
export const spotifyScopes = [
  'user-read-private',
  'user-read-email',
  'user-read-playback-state',
  'user-read-currently-playing',
  'user-modify-playback-state',
  'user-library-read',
  'playlist-read-private',
  'user-top-read',
  'user-read-recently-played',
];

export type SpotifyToken = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export async function saveSpotifyToken(userId: string, token: SpotifyToken | null) {
  if (!token) {
    const { error } = await supabase.from('spotify_connections').delete().eq('user_id', userId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('spotify_connections').upsert({
    user_id: userId,
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    expires_at: new Date(token.expiresAt).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) throw error;
}

export async function loadSpotifyToken(userId: string): Promise<SpotifyToken | null> {
  const { data, error } = await supabase.from('spotify_connections').select('access_token, refresh_token, expires_at').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data ? { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: new Date(data.expires_at).getTime() } : null;
}

export async function refreshSpotifyToken(token: SpotifyToken, clientId: string, userId: string): Promise<SpotifyToken> {
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: token.refreshToken, client_id: clientId });
  const response = await fetch(spotifyDiscovery.tokenEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  if (!response.ok) throw new Error('Spotify session expired');
  const data = await response.json();
  const refreshed = { accessToken: data.access_token, refreshToken: data.refresh_token ?? token.refreshToken, expiresAt: Date.now() + data.expires_in * 1000 };
  await saveSpotifyToken(userId, refreshed);
  return refreshed;
}

export async function spotifyApi(token: string, path: string, method = 'GET') {
  return fetch(`https://api.spotify.com/v1${path}`, { method, cache: 'no-store', headers: { Authorization: `Bearer ${token}` } });
}
