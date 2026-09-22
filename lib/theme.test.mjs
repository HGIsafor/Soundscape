import assert from 'node:assert/strict';
import test from 'node:test';
import { palettes, readableAccent } from './theme.ts';

function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

for (const theme of Object.values(palettes)) {
  test(`${theme.mode}: custom accent text is readable on every UI surface`, () => {
    for (const color of ['#000000', '#ffffff', '#1ed760', '#ffff00', '#ff0000', '#0000ff', '#777777']) {
      const adjusted = luminance(readableAccent(color, theme));
      for (const background of [theme.bg, theme.surface, theme.raised, theme.dialog, theme.input]) {
        const surface = luminance(background);
        assert.ok((Math.max(adjusted, surface) + 0.05) / (Math.min(adjusted, surface) + 0.05) >= 4.5, `${color} on ${background}`);
      }
    }
  });
}
