import type { SpotifyTrack } from '../types/app';

export const spotifyTrackKey = (track: SpotifyTrack) => track.uri ?? track.id ?? `${track.title}\u0000${track.artist}`;
export const sameSpotifyTrack = (left: SpotifyTrack | null | undefined, right: SpotifyTrack | null | undefined) => !!left && !!right && spotifyTrackKey(left) === spotifyTrackKey(right);
export const DEMO_TRACKS = [
  { title: '-------', artist: 'Connect Spotify to begin', color: '#282828' },
];

export const spotifyItemToTrack = (item: any): SpotifyTrack => ({
  id: item?.id,
  uri: item?.uri,
  title: item?.name ?? 'Unknown track',
  artist: item?.artists?.map((artist: { name: string }) => artist.name).join(', ') ?? 'Spotify',
  album: item?.album?.name,
  artwork: item?.album?.images?.[0]?.url,
  durationMs: item?.duration_ms ?? 0,
  progressMs: 0,
});
