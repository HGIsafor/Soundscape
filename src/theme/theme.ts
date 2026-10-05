import { createContext, useContext } from 'react';

export type ThemeMode = 'dark' | 'light';
export const palettes = {
  dark: {
    mode: 'dark', bg: '#000000', surface: '#121212', raised: '#1f1f1f',
    dialog: '#282828', input: '#333333', line: '#535353', border: '#383838',
    text: '#ffffff', muted: '#b3b3b3', secondary: '#999999', subtle: '#858585',
    green: '#1ed760', danger: '#ff8585', backdrop: 'rgba(0,0,0,0.72)',
  },
  light: {
    mode: 'light', bg: '#f5f6f4', surface: '#ffffff', raised: '#e8ece7',
    dialog: '#ffffff', input: '#f2f4f0', line: '#9ca69d', border: '#ccd3cb',
    text: '#18221b', muted: '#4e5d52', secondary: '#59675d', subtle: '#647168',
    green: '#1ed760', danger: '#b42335', backdrop: 'rgba(18,30,22,0.35)',
  },
} as const;
export type Palette = typeof palettes[ThemeMode];
export const ThemeContext = createContext<Palette>(palettes.dark);
export const useTheme = () => useContext(ThemeContext);

const luminance = (hex: string) => {
  const rgb = [1, 3, 5].map(index => {
    const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};

// Keep the chosen color on filled controls; adjust its text variant for contrast.
export function readableAccent(hex: string, theme: Palette) {
  const backgrounds = [theme.bg, theme.surface, theme.raised, theme.dialog, theme.input];
  let result = hex;
  for (let step = 0; step <= 20; step++) {
    const value = luminance(result);
    if (backgrounds.every(background => {
      const other = luminance(background);
      return (Math.max(value, other) + 0.05) / (Math.min(value, other) + 0.05) >= 4.5;
    })) return result;
    const target = theme.mode === 'light' ? 0 : 255;
    result = '#' + [1, 3, 5].map(index => Math.round(parseInt(hex.slice(index, index + 2), 16) * (1 - (step + 1) / 21) + target * (step + 1) / 21).toString(16).padStart(2, '0')).join('');
  }
  return theme.text;
}
