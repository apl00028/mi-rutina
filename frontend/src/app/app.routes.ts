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
    path: 'entrenar/natacion',
    loadComponent: () =>
      import(
        './pages/endurance/endurance'
      ).then(
        module => module.Endurance
      ),
    data: {
      discipline: 'swimming'
    },
    canActivate: [
      accessGuard
    ]
  },
  {
    path: 'entrenar/bicicleta',
    loadComponent: () =>
      import(
        './pages/endurance/endurance'
      ).then(
        module => module.Endurance
      ),
    data: {
      discipline: 'cycling'
    },
    canActivate: [
      accessGuard
    ]
  },
  {
    path: 'entrenar/correr',
    loadComponent: () =>
      import(
        './pages/endurance/endurance'
      ).then(
        module => module.Endurance
      ),
    data: {
      discipline: 'running'
    },
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
    path: 'nutricion',
    loadComponent: () =>
      import(
        './pages/nutrition/nutrition'
      ).then(
        module => module.Nutrition
      ),
    canActivate: [
      accessGuard
    ]
  },
  {
    path: 'salud',
    loadComponent: () =>
      import(
        './pages/health/health'
      ).then(
        module => module.Health
      ),
    canActivate: [
      accessGuard
    ]
  },
  {
    path: 'ajustes',
    loadComponent: () =>
      import(
        './pages/settings/settings'
      ).then(
        module => module.SettingsHub
      ),
    canActivate: [
      accessGuard
    ]
  },
  {
    path: 'ajustes/cuenta',
    loadComponent: () =>
      import(
        './pages/settings/settings'
      ).then(
        module => module.SettingsAccount
      ),
    canActivate: [
      accessGuard
    ]
  },
  {
    path: 'ajustes/entrenamiento',
    loadComponent: () =>
      import(
        './pages/settings/settings'
      ).then(
        module => module.SettingsTraining
      ),
    canActivate: [
      accessGuard
    ]
  },
  {
    path: 'ajustes/apariencia',
    loadComponent: () =>
      import(
        './pages/settings/settings'
      ).then(
        module => module.SettingsAppearance
      ),
    canActivate: [
      accessGuard
    ]
  },
  {
    path: 'ajustes/datos',
    loadComponent: () =>
      import(
        './pages/settings/settings'
      ).then(
        module => module.SettingsData
      ),
    canActivate: [
      accessGuard
    ]
  },
  {
    path: 'ajustes/acerca-de',
    loadComponent: () =>
      import(
        './pages/settings/settings'
      ).then(
        module => module.SettingsAbout
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
