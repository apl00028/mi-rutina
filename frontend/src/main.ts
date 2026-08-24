import {
  bootstrapApplication
} from '@angular/platform-browser';

import {
  Capacitor
} from '@capacitor/core';

import {
  SplashScreen
} from '@capacitor/splash-screen';

import {
  appConfig
} from './app/app.config';

import {
  App
} from './app/app';


if (
  Capacitor.isNativePlatform()
) {
  console.info(
    `[GymOS startup] JavaScript ready: ` +
    `${Math.round(performance.now())} ms total`
  );
}


bootstrapApplication(
  App,
  appConfig
)
  .then(() => {
    if (
      Capacitor.isNativePlatform()
    ) {
      console.info(
        `[GymOS startup] Angular ready: ` +
        `${Math.round(performance.now())} ms total`
      );
    }

    if (
      !Capacitor.isNativePlatform()
    ) {
      return;
    }

    requestAnimationFrame(() => {
      void SplashScreen.hide();
    });
  })
  .catch(
    err => console.error(err)
  );
