import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.alphahylian.herringbone',
  appName: 'Herringbone',
  webDir: 'dist',
  backgroundColor: '#e8d9bf',
  ios: {
    contentInset: 'never',
    backgroundColor: '#e8d9bf',
  },
  android: {
    backgroundColor: '#e8d9bf',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      launchAutoHide: true,
      backgroundColor: '#e8d9bf',
      showSpinner: false,
    },
    StatusBar: {
      style: 'LIGHT',
      overlaysWebView: true,
      backgroundColor: '#00000000',
    },
  },
};

export default config;
