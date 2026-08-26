import {
  Component
} from '@angular/core';

import {
  LegalPage
} from './legal';


@Component({
  selector: 'app-privacy-page',
  standalone: true,
  imports: [
    LegalPage
  ],
  template: `
    <app-legal-page
      page="privacy"
    />
  `
})
export class PrivacyPage {}
