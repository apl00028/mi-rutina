import { Routes } from '@angular/router';

import {
  adminGuard
} from './core/admin.guard';

import {
  authGuard
} from './core/auth.guard';

import {
  accessGuard
} from './core/access.guard';


export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import(
        './pages/login/login'
      ).then(
        module => module.Login
      )
  },
  {
    path: 'access-pending',
    loadComponent: () =>
      import(
        './pages/access-pending/access-pending'
      ).then(
        module => module.AccessPending
      ),
    canActivate: [
      authGuard
    ]
  },
  {
    path: 'onboarding',
    loadComponent: () =>
      import(
        './pages/onboarding/onboarding'
      ).then(
        module => module.Onboarding
      ),
    canActivate: [
      accessGuard
    ]
  },
  {
  path: 'admin/access',
  loadComponent: () =>
    import(
      './pages/admin-access/admin-access'
    ).then(
      m => m.AdminAccess
    ),
  canActivate: [
    adminGuard
  ]
  },
  {
    path: '',
    loadComponent: () =>
      import(
        './pages/home/home'
      ).then(
        module => module.Home
      ),
    canActivate: [
      accessGuard
    ]
  },
  {
    path: 'entrenar',
    loadComponent: () =>
      import(
        './pages/train/train'
      ).then(
        module => module.Train
      ),
    canActivate: [
      accessGuard
    ]
  },
  {
    path: 'rutinas',
    loadComponent: () =>
      import(
        './pages/routines/routines'
      ).then(
        module => module.Routines
      ),
    canActivate: [
      accessGuard
    ]
  },
  {
    path: '**',
    redirectTo: ''
  }
];