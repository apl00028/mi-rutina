import {
  environment
} from '../../environments/environment';

export const APP_INFO = {
  name: 'Aptus',
  version: '0.0.0',
  buildDate: '21 ago 2026',
  environment: environment.production
    ? 'Production'
    : 'Development'
} as const;
