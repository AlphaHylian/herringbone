import { Capacitor } from '@capacitor/core';

/** One-time native shell setup: status bar style and hiding the splash screen. */
export async function initNativeShell(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Light });
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setOverlaysWebView({ overlay: true });
    }
  } catch {
    /* plugin missing; not fatal */
  }
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 300 });
  } catch {
    /* ignore */
  }
}
