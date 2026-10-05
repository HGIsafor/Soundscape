import { useLayoutEffect } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

// Fit a comfortable desktop canvas; extra ultrawide space need not stretch it.
export function useDisplayDimensions() {
  const viewport = useWindowDimensions();
  const scale = Platform.OS === 'web'
    ? Math.max(1, Math.min(viewport.width / 1280, viewport.height / 800))
    : 1;

  useLayoutEffect(() => {
    if (Platform.OS !== 'web') return;
    const root = document.documentElement;
    const previousZoom = root.style.getPropertyValue('zoom');
    const previousHeight = root.style.height;
    root.style.setProperty('zoom', String(scale));
    root.style.height = `${100 / scale}vh`;
    return () => {
      root.style.setProperty('zoom', previousZoom);
      root.style.height = previousHeight;
    };
  }, [scale]);

  return { width: viewport.width / scale, height: viewport.height / scale };
}

// RN Web reports pointer locations in visual pixels and layouts in CSS pixels.
export function layoutDistance(distance: number) {
  const scale = Platform.OS === 'web'
    ? Number(document.documentElement.style.getPropertyValue('zoom')) || 1
    : 1;
  return distance / scale;
}
