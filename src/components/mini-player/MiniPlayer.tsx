import { forwardRef } from 'react';
import type { MiniPlayerHandle, MiniPlayerProps } from './mini-player-types';

// Electron and browser previews use the web implementation; phones stay unchanged.
export const MiniPlayer = forwardRef<MiniPlayerHandle, MiniPlayerProps>(function MiniPlayer() {
  return null;
});
