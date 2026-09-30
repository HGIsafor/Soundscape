export type RankedEntry = { item: { id: string } };

export function rankMovement(entries: RankedEntry[] | null, id: string, index: number) {
  if (entries === null) return { text: '—', label: 'First snapshot' };
  const before = entries.findIndex(entry => entry.item.id === id);
  if (before === -1) return { text: 'New', label: 'New to this chart' };
  const change = before - index;
  if (change === 0) return { text: '—', label: 'Rank unchanged' };
  return {
    text: `${change > 0 ? '↑' : '↓'} ${Math.abs(change)}`,
    label: `${change > 0 ? 'Up' : 'Down'} ${Math.abs(change)} ${Math.abs(change) === 1 ? 'place' : 'places'}`,
  };
}
