import type { ThemeMode } from '../theme/theme';

export type Values = { bass: number; mid: number; treble: number; ambience: number; gain: number };
export type Profile = { id: string; name: string; values: Values };
export type Account = { id: string; email: string; name: string; avatarPath?: string; avatarUrl?: string; favoriteColor: string; followCover: boolean; theme: ThemeMode };
export type SpotifyTrack = { id?: string; uri?: string; title: string; artist: string; album?: string; artwork?: string; durationMs: number; progressMs: number };
export type SharedSession = { id: string; code: string; hostUserId: string };
