/** Short vibrations on key moments, where the platform supports them (Android browsers; iOS ignores). */
export function buzz(pattern: number | number[]) {
  try {
    const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
    nav.vibrate?.(pattern);
  } catch { /* not supported */ }
}
