import { Routes } from '@angular/router';

import { Home } from './pages/home/home';
import { Train } from './pages/train/train';
import { Routines } from './pages/routines/routines';

export const routes: Routes = [
  {
    path: '',
    component: Home
  },
  {
    path: 'entrenar',
    component: Train
  },
  {
    path: 'rutinas',
    component: Routines
  },
  {
    path: '**',
    redirectTo: ''
  }
];