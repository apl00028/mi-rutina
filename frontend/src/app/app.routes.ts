import { Routes } from '@angular/router';

import { authGuard } from './core/auth.guard';

import { Login } from './pages/login/login';
import { Home } from './pages/home/home';
import { Train } from './pages/train/train';
import { Routines } from './pages/routines/routines';

export const routes: Routes = [
  {
    path: 'login',
    component: Login
  },
  {
    path: '',
    component: Home,
    canActivate: [authGuard]
  },
  {
    path: 'entrenar',
    component: Train,
    canActivate: [authGuard]
  },
  {
    path: 'rutinas',
    component: Routines,
    canActivate: [authGuard]
  },
  {
    path: '**',
    redirectTo: ''
  }
];