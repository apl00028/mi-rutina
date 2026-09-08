import { Component, OnDestroy, OnInit, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ConnectionsService, connectionError } from '../../core/connections.service';
import { ConnectionDomain, TrainerAthleteConnection, connectionDomains } from '../../core/connections.models';
import { ConnectionInvitations } from '../../features/connections/invitations';

@Component({
  selector: 'app-connection-settings', standalone: true,
  imports: [RouterLink, ConnectionInvitations],
  templateUrl: './connections.html', styleUrl: './connections.scss',
})
export class ConnectionSettings implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ConnectionsService);
  private destroyed = false;
  private refreshPending = false;
  readonly invitations = viewChild(ConnectionInvitations);
  readonly context = signal<'trainer' | 'athlete' | null>(null);
  readonly relationships = signal<TrainerAthleteConnection[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly editing = signal<TrainerAthleteConnection | null>(null);
  readonly draft = signal<ConnectionDomain[]>([]);
  readonly unlinking = signal<TrainerAthleteConnection | null>(null);
  readonly domains = connectionDomains;
  readonly labels: Record<ConnectionDomain, string> = { swimming: 'Natación', running: 'Carrera', cycling: 'Ciclismo', strength: 'Fuerza', health: 'Salud' };

  async ngOnInit(): Promise<void> {
    try {
      const me = await this.auth.resolveAccess();
      if (this.destroyed) return;
      if (me.access_status !== 'active' || !['trainer', 'user', 'admin'].includes(me.role ?? '')) {
        this.error.set('No tienes autorización para gestionar conexiones.'); return;
      }
      this.context.set(me.role === 'trainer' ? 'trainer' : 'athlete');
      await this.refresh();
    } catch (error) { if (!this.destroyed) this.error.set(connectionError(error)); }
  }
  ngOnDestroy(): void { this.destroyed = true; }
  displayName(row: TrainerAthleteConnection): string {
    return row.other_display_name || row.other_alias || (this.context() === 'trainer' ? 'Atleta' : 'Entrenador');
  }
  initials(row: TrainerAthleteConnection): string {
    return this.displayName(row).trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  }
  async refreshAll(): Promise<void> {
    const panel = this.invitations();
    if (this.busy() || this.loading() || panel?.busy() || panel?.loading()) return;
    await Promise.all([this.refresh(), panel?.refresh()]);
  }

  async refresh(): Promise<void> {
    if (this.destroyed) return;
    if (this.busy()) { this.refreshPending = true; return; }
    if (this.loading()) return;
    this.loading.set(true); this.error.set('');
    try {
      const rows = await this.api.relationships();
      if (!this.destroyed) { this.relationships.set(rows); this.editing.set(null); this.unlinking.set(null); }
    } catch (error) { if (!this.destroyed) this.error.set(connectionError(error)); }
    finally { if (!this.destroyed) this.loading.set(false); }
  }
  edit(row: TrainerAthleteConnection): void {
    if (this.context() !== 'athlete' || this.busy() || this.loading() || row.status !== 'active') return;
    this.unlinking.set(null);
    this.editing.set(row); this.draft.set([...row.domains]); this.error.set(''); this.message.set('');
  }
  toggle(domain: ConnectionDomain, checked: boolean): void {
    this.draft.update(values => checked ? [...new Set([...values, domain])] : values.filter(value => value !== domain));
  }
  async save(): Promise<void> {
    const row = this.editing();
    if (!row || this.context() !== 'athlete' || this.busy() || this.loading()) return;
    const selected = [...this.draft()]; this.busy.set(true); this.error.set('');
    try {
      const result = await this.api.setPermissions(row.trainer_id, selected, row.updated_at);
      if (this.destroyed) return;
      this.relationships.update(rows => rows.map(item => item === row ? { ...row, domains: selected, updated_at: result.updated_at } : item));
      this.editing.set(null); this.message.set('Permisos guardados.');
    } catch (error) { if (!this.destroyed) this.error.set(connectionError(error)); }
    finally {
      if (!this.destroyed) {
        this.busy.set(false);
        if (this.refreshPending) { this.refreshPending = false; void this.refresh(); }
      }
    }
  }
  askUnlink(row: TrainerAthleteConnection): void {
    if (this.busy() || this.loading()) return;
    this.editing.set(null); this.unlinking.set(row);
  }
  async unlink(): Promise<void> {
    const row = this.unlinking();
    if (!row || this.busy() || this.loading()) return;
    this.busy.set(true); this.error.set('');
    try {
      await this.api.unlink(this.context() === 'athlete' ? row.trainer_id : row.athlete_id, row.updated_at);
      if (this.destroyed) return;
      this.relationships.update(rows => rows.filter(item => item !== row));
      this.unlinking.set(null); this.editing.set(null); this.message.set('Conexión desvinculada.');
    } catch (error) { if (!this.destroyed) this.error.set(connectionError(error)); }
    finally {
      if (!this.destroyed) {
        this.busy.set(false);
        if (this.refreshPending) { this.refreshPending = false; void this.refresh(); }
      }
    }
  }
}
