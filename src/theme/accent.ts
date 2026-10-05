import { createContext } from 'react';
import { palettes } from './theme';
const C = palettes.dark;

export const AccentContext = createContext<string>(C.green);
export const accentForeground = (hex: string) => {
  const channels = [1, 3, 5].map(index => {
    const value = parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance < 0.05 ? '#ddd' : '#050505';
};
export const accentHeadingGlow = (hex: string, thickness = 0.35) => accentForeground(hex) === '#ddd'
  ? ({ textShadow: `${thickness}px 0 #ddd, -${thickness}px 0 #ddd, 0 ${thickness}px #ddd, 0 -${thickness}px #ddd` } as any)
  : {};
export const normalizeColor = (value?: string) => /^#[0-9a-f]{6}$/i.test(value ?? '') ? value!.toLowerCase() : C.green;
export const colorAlpha = (hex: string, alpha: number) => {
  const color = normalizeColor(hex).slice(1);
  return `rgba(${parseInt(color.slice(0, 2), 16)},${parseInt(color.slice(2, 4), 16)},${parseInt(color.slice(4, 6), 16)},${alpha})`;
};
export const darkenColor = (hex: string, amount = 0.45) => {
  const color = normalizeColor(hex).slice(1);
  return `#${[0, 2, 4].map(index => Math.round(parseInt(color.slice(index, index + 2), 16) * amount).toString(16).padStart(2, '0')).join('')}`;
};
export type Hsv = { h: number; s: number; v: number };
export const hsvToHex = ({ h, s, v }: Hsv) => {
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b].map(channel => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('')}`;
};
export const hexToHsv = (hex: string): Hsv => {
  const clean = normalizeColor(hex).slice(1);
  const [r, g, b] = [0, 2, 4].map(index => parseInt(clean.slice(index, index + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const h = delta === 0 ? 0 : max === r ? 60 * (((g - b) / delta) % 6) : max === g ? 60 * ((b - r) / delta + 2) : 60 * ((r - g) / delta + 4);
  return { h: (h + 360) % 360, s: max === 0 ? 0 : delta / max, v: max };
};
