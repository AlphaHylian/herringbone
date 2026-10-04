import { Capacitor } from '@capacitor/core';

export type HapticStrength = 'light' | 'medium' | 'heavy';

/** Small haptics interface so game code never touches Capacitor directly. */
export interface Haptics {
  impact(strength: HapticStrength): void;
  /** A very short selection-style tick. */
  tick(): void;
  setEnabled(enabled: boolean): void;
}

class WebHaptics implements Haptics {
  private enabled = true;
  impact(strength: HapticStrength): void {
    if (!this.enabled) return;
    const ms = strength === 'light' ? 8 : strength === 'medium' ? 16 : 30;
    try {
      navigator.vibrate?.(ms);
    } catch {
      /* not supported */
    }
  }
  tick(): void {
    this.impact('light');
  }
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}

class NativeHaptics implements Haptics {
  private enabled = true;
  private mod: typeof import('@capacitor/haptics') | null = null;
  constructor() {
    void import('@capacitor/haptics').then((m) => (this.mod = m));
  }
  impact(strength: HapticStrength): void {
    if (!this.enabled || !this.mod) return;
    const { Haptics: H, ImpactStyle } = this.mod;
    const style =
      strength === 'light'
        ? ImpactStyle.Light
        : strength === 'medium'
          ? ImpactStyle.Medium
          : ImpactStyle.Heavy;
    void H.impact({ style }).catch(() => undefined);
  }
  tick(): void {
    if (!this.enabled || !this.mod) return;
    void this.mod.Haptics.selectionChanged().catch(() => undefined);
  }
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}

export function createHaptics(): Haptics {
  return Capacitor.isNativePlatform() ? new NativeHaptics() : new WebHaptics();
}
