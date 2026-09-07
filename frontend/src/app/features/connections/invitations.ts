import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConnectionInvitation, InvitationAction } from '../../core/connections.models';
import { ConnectionsService, connectionError } from '../../core/connections.service';

@Component({
  selector: 'app-connection-invitations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './invitations.html',
  styleUrl: './invitations.scss',
})
export class ConnectionInvitations implements OnInit, OnDestroy {
  @Input({ required: true }) context!: 'trainer' | 'athlete';
  @Output() accepted = new EventEmitter<void>();
  private readonly connections = inject(ConnectionsService);
  private destroyed = false;
  readonly received = signal<ConnectionInvitation[]>([]);
  readonly sent = signal<ConnectionInvitation[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly code = signal('');
  readonly formOpen = signal(false);
  contactCode = '';

  ngOnInit(): void { void this.refresh(); }
  ngOnDestroy(): void {
    this.destroyed = true;
    this.code.set('');
    this.contactCode = '';
  }

  isPending(invitation: ConnectionInvitation): boolean {
    return invitation.status === 'pending' && Date.parse(invitation.expires_at) > Date.now();
  }

  async refresh(): Promise<void> {
    if (this.loading() || this.destroyed) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const [received, sent] = await Promise.all([this.connections.list('received'), this.connections.list('sent')]);
      if (this.destroyed) return;
      this.received.set(received.filter(item => this.isPending(item)));
      this.sent.set(sent.filter(item => this.isPending(item)));
    } catch (error) {
      if (!this.destroyed) this.error.set(connectionError(error));
    } finally { if (!this.destroyed) this.loading.set(false); }
  }

  closeForm(): void { this.contactCode = ''; this.formOpen.set(false); }

  private async perform(operation: () => Promise<void>): Promise<void> {
    if (this.busy() || this.loading() || this.destroyed) return;
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    try { await operation(); }
    catch (error) { if (!this.destroyed) this.error.set(connectionError(error)); }
    finally { if (!this.destroyed) this.busy.set(false); }
  }

  async invite(): Promise<void> {
    await this.perform(async () => {
      if (this.context === 'trainer') await this.connections.inviteAthlete(this.contactCode);
      else await this.connections.inviteTrainer(this.contactCode);
      if (this.destroyed) return;
      this.closeForm();
      this.message.set('Invitación enviada. La otra persona debe aceptarla.');
      await this.refresh();
    });
  }

  async act(invitation: ConnectionInvitation, action: InvitationAction): Promise<void> {
    const items = action === 'revoke' ? this.sent() : this.received();
    if (!items.includes(invitation) || !this.isPending(invitation)) return;
    await this.perform(async () => {
      await this.connections.act(invitation.id, action);
      if (this.destroyed) return;
      // Remove the completed action even if refreshing the lists fails.
      this.received.update(items => items.filter(item => item.id !== invitation.id));
      this.sent.update(items => items.filter(item => item.id !== invitation.id));
      this.message.set(action === 'accept' ? 'Invitación aceptada.' : action === 'reject' ? 'Solicitud rechazada.' : 'Invitación cancelada.');
      if (action === 'accept') this.accepted.emit();
      await this.refresh();
    });
  }

  async generateCode(): Promise<void> {
    await this.perform(async () => {
      // A failed response may still have replaced the old code on the server.
      this.code.set('');
      const result = await this.connections.generateContactCode();
      if (!this.destroyed) this.code.set(result.code);
    });
  }

  async copyCode(): Promise<void> {
    if (!this.code() || this.busy()) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(this.code());
      else {
        const textarea = document.createElement('textarea');
        textarea.value = this.code();
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.setAttribute('readonly', '');
        document.body.appendChild(textarea);
        try {
          textarea.select();
          if (!document.execCommand('copy')) throw new Error();
        } finally { textarea.remove(); }
      }
      if (!this.destroyed) this.message.set('Código copiado.');
    } catch {
      if (!this.destroyed) this.error.set('No se pudo copiar. Selecciona el código y cópialo manualmente.');
    }
  }
}
