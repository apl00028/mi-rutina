import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.adrianpelaez.aptus',
  appName: 'Aptus',
  webDir: 'dist/frontend/browser',

  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      launchFadeOutDuration: 200,
    },
  },
};

export default config;
