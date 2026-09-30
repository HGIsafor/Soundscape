
export type LyricLine = { timeMs: number; text: string };
export type LyricsResult = { synced: LyricLine[]; plain: string[]; instrumental: boolean };
export const parseSyncedLyrics = (source: string): LyricLine[] => source.split(/\r?\n/).flatMap(row => {
  const match = row.match(/^\[(\d{1,3}):(\d{2}(?:\.\d+)?)\]\s*(.*)$/);
  return match && match[3].trim() ? [{ timeMs: Math.round((Number(match[1]) * 60 + Number(match[2])) * 1000), text: match[3].trim() }] : [];
});
