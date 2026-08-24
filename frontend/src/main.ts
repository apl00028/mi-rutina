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


bootstrapApplication(
  App,
  appConfig
)
  .then(() => {
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
