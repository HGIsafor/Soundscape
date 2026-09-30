export type MiniTrack = {
  id?: string; uri?: string; title: string; artist: string; album?: string;
  artwork?: string; durationMs: number; progressMs: number;
};

export type MiniPlayerHandle = { leavingPlayback: () => void };
export type MiniRotationValue = {
  __getValue: () => number;
  addListener: (listener: (event: { value: number }) => void) => string;
  removeListener: (id: string) => void;
};
export type MiniPlayerProps = {
  available: boolean;
  playing: boolean;
  track: MiniTrack | null;
  connected: boolean;
  error: string;
  accent: string;
  foreground: string;
  textColor: string;
  surfaceColor: string;
  rotationValue: MiniRotationValue;
  onToggle: () => void | Promise<void>;
  onPrevious: () => void | Promise<void>;
  onNext: () => void | Promise<void>;
  onSeek: (position: number) => void | Promise<void>;
  onPlayback: () => void;
  onConnect: () => void;
};
