import { decode } from 'jpeg-js';

// Hue families keep shaded surfaces together; neutrals retain their brightness.
export async function coverColor(url: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('Artwork unavailable');
  const bytes = new Uint8Array(await response.arrayBuffer());
  const { data } = decode(bytes, { useTArray: true, maxResolutionInMP: 4, maxMemoryUsageInMB: 64 });
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  let samples = 0;
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const delta = max - min;
    const saturation = max === 0 ? 0 : delta / max;
    const colored = max >= 32 && delta >= 16 && saturation >= 0.2;
    let key: number;
    if (colored) {
      const hue = max === r ? 60 * ((g - b) / delta) : max === g ? 60 * ((b - r) / delta + 2) : 60 * ((r - g) / delta + 4);
      key = Math.round(((hue + 360) % 360) / 30) % 12;
    } else {
      key = 12 + Math.floor((r + g + b) / 3 / 32);
    }
    samples++;
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count++; bucket.r += r; bucket.g += g; bucket.b += b;
    buckets.set(key, bucket);
  }
  // A colored family must cover at least 15% of the image to outweigh neutrals.
  // This prevents a tiny logo or compression noise from coloring a black cover.
  const prominentColors = [...buckets.entries()].filter(([key, bucket]) => key < 12 && bucket.count >= samples * 0.15);
  const candidates = prominentColors.length ? prominentColors.map(([, bucket]) => bucket) : [...buckets.values()];
  const winner = candidates.sort((a, b) => b.count - a.count)[0];
  if (!winner) throw new Error('Empty artwork');
  const rgb = [winner.r, winner.g, winner.b].map(channel => channel / winner.count);
  return '#' + rgb.map(channel => Math.round(channel).toString(16).padStart(2, '0')).join('');
}
