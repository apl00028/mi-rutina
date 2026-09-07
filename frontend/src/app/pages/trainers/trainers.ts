import { Component } from '@angular/core';
import { ConnectionInvitations } from '../../features/connections/invitations';

@Component({
  selector: 'app-trainers',
  standalone: true,
  imports: [ConnectionInvitations],
  template: `
    <section class="trainers-page">
      <h1>Entrenadores</h1>
      <p>Conecta con tus entrenadores mediante invitaciones. La persona que recibe una invitación debe aceptarla.</p>
      <app-connection-invitations context="athlete" />
    </section>
  `,
  styles: `
    .trainers-page { width: min(100%, 1000px); margin: auto; padding: 24px; box-sizing: border-box; }
    h1 { font-size: clamp(24px, 4vw, 30px); }
    p { color: var(--aptus-text-muted); line-height: 1.6; margin-bottom: 24px; }
    @media(max-width: 640px) { .trainers-page { padding: 16px; } }
  `,
})
export class Trainers {}
