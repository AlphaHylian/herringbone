import { Capacitor } from '@capacitor/core';

/** Key/value persistence. Native uses @capacitor/preferences, web uses localStorage. */
export interface Storage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const PREFIX = 'herringbone:';

export class WebStorage implements Storage {
  async get(key: string): Promise<string | null> {
    try {
      return localStorage.getItem(PREFIX + key);
    } catch {
      return null;
    }
  }
  async set(key: string, value: string): Promise<void> {
    try {
      localStorage.setItem(PREFIX + key, value);
    } catch {
      /* storage full or blocked; progress just won't persist */
    }
  }
  async remove(key: string): Promise<void> {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      /* ignore */
    }
  }
}

class NativeStorage implements Storage {
  private prefs = import('@capacitor/preferences').then((m) => m.Preferences);
  async get(key: string): Promise<string | null> {
    const p = await this.prefs;
    return (await p.get({ key })).value;
  }
  async set(key: string, value: string): Promise<void> {
    const p = await this.prefs;
    await p.set({ key, value });
  }
  async remove(key: string): Promise<void> {
    const p = await this.prefs;
    await p.remove({ key });
  }
}

export function createStorage(): Storage {
  return Capacitor.isNativePlatform() ? new NativeStorage() : new WebStorage();
}
