/**
 * Settings in localStorage, where it is available: it throws in some contexts (sandboxed frames, some automation and
 * privacy settings), and a setting is never worth failing for.
 */

export function readSetting(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSetting(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not stored; the setting lasts this session only.
  }
}
