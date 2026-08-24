import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.adrianpelaez.gymos',
  appName: 'GymOS',
  webDir: 'dist/frontend/browser',

  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      launchFadeOutDuration: 200,
    },
  },
};

export default config;
