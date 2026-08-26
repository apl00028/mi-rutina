import {
  Component
} from '@angular/core';

import {
  LegalPage
} from './legal';


@Component({
  selector: 'app-delete-account-page',
  standalone: true,
  imports: [
    LegalPage
  ],
  template: `
    <app-legal-page
      page="delete-account"
    />
  `
})
export class DeleteAccountPage {}
