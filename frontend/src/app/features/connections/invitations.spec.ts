import { TestBed, ComponentFixture } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionInvitations } from './invitations';
import { ConnectionsService } from '../../core/connections.service';
import { ConnectionInvitation } from '../../core/connections.models';

const invitation = (id: string, status: ConnectionInvitation['status'] = 'pending'): ConnectionInvitation => ({
  id, trainer_id: 'trainer', athlete_id: 'athlete', inviter_id: 'trainer', recipient_id: 'athlete',
  direction: 'trainer_to_athlete', status, created_at: '2026-09-07T08:00:00Z', expires_at: '2099-09-14T08:00:00Z',
  accepted_at: null, revoked_at: null, revoked_by: null, other_display_name: 'Persona', other_alias: 'alias',
});

describe.each(['trainer', 'athlete'] as const)('Invitations in %s context', context => {
  let fixture: ComponentFixture<ConnectionInvitations>;
  let component: ConnectionInvitations;
  const api = { list: vi.fn(), inviteAthlete: vi.fn(), inviteTrainer: vi.fn(), act: vi.fn(), generateContactCode: vi.fn() };
  async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); fixture.detectChanges(); }
  async function click(text: string) {
    const button = Array.from(fixture.nativeElement.querySelectorAll('button'))
      .find((node: any) => node.textContent.trim() === text) as HTMLButtonElement;
    expect(button).toBeTruthy(); button.click(); await settle();
  }
  beforeEach(async () => {
    vi.resetAllMocks();
    api.list.mockImplementation(async box => [invitation(box), invitation('terminal', 'accepted')]);
    api.inviteAthlete.mockResolvedValue({ id: 'new' }); api.inviteTrainer.mockResolvedValue({ id: 'new' });
    api.act.mockResolvedValue(undefined); api.generateContactCode.mockResolvedValue({ code: 'APT-ABCD-EFGH-JKLM-NPQR' });
    await TestBed.configureTestingModule({ imports: [ConnectionInvitations], providers: [{ provide: ConnectionsService, useValue: api }] }).compileComponents();
    fixture = TestBed.createComponent(ConnectionInvitations); component = fixture.componentInstance;
    fixture.componentRef.setInput('context', context); fixture.detectChanges(); await settle();
  });
  afterEach(() => { fixture.destroy(); vi.restoreAllMocks(); });
  it('loads both lists, does not generate or accept, and filters terminal states', () => {
    expect(api.list).toHaveBeenCalledWith('received'); expect(api.list).toHaveBeenCalledWith('sent');
    expect(api.generateContactCode).not.toHaveBeenCalled(); expect(api.act).not.toHaveBeenCalled();
    expect(component.received().map(item => item.id)).toEqual(['received']);
    expect(fixture.nativeElement.textContent).toContain('Solicitudes recibidas');
    expect(fixture.nativeElement.textContent).toContain('Invitaciones enviadas');
    expect(fixture.nativeElement.textContent).not.toContain('hash');
  });
  it('form sends to the contextual endpoint and clears its input', async () => {
    await click(context === 'trainer' ? 'Añadir cliente' : 'Añadir entrenador');
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'APT-ABCD-EFGH-JKLM-NPQR'; input.dispatchEvent(new Event('input'));
    await settle(); fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true })); await settle();
    expect(context === 'trainer' ? api.inviteAthlete : api.inviteTrainer).toHaveBeenCalledWith(input.value);
    expect(context === 'trainer' ? api.inviteTrainer : api.inviteAthlete).not.toHaveBeenCalled();
    expect(component.contactCode).toBe(''); expect(component.formOpen()).toBe(false);
  });
  it.each(['accept', 'reject', 'revoke'] as const)('%s is explicit and refreshes both lists', async action => {
    const accepted = vi.fn(); component.accepted.subscribe(accepted);
    api.list.mockClear();
    await click(action === 'accept' ? 'Aceptar' : action === 'reject' ? 'Rechazar' : 'Cancelar invitación');
    expect(api.act).toHaveBeenCalledWith(action === 'revoke' ? 'sent' : 'received', action);
    expect(api.list).toHaveBeenCalledWith('received'); expect(api.list).toHaveBeenCalledWith('sent');
    expect(accepted).toHaveBeenCalledTimes(action === 'accept' ? 1 : 0);
  });
  it('generates explicitly, copies and never persists raw codes', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const copy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
    const contact = fixture.nativeElement.querySelector('details.contact') as HTMLDetailsElement;
    expect(contact.open).toBe(false); contact.querySelector('summary')!.click();
    await click('Generar código'); await click('Copiar código');
    expect(copy).toHaveBeenCalledWith('APT-ABCD-EFGH-JKLM-NPQR'); expect(storage).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('invalida el anterior');
    fixture.destroy(); expect(component.code()).toBe('');
  });
  it('does not restore a code when returning', async () => {
    await component.generateCode(); fixture.destroy();
    fixture = TestBed.createComponent(ConnectionInvitations); fixture.componentRef.setInput('context', context);
    fixture.detectChanges(); await settle();
    expect(fixture.componentInstance.code()).toBe(''); expect(api.generateContactCode).toHaveBeenCalledTimes(1);
  });
  it('shows the public invalid-code error', async () => {
    const detail = 'El código de contacto no es válido o no está disponible.';
    api.inviteAthlete.mockRejectedValue(new HttpErrorResponse({ status: 400, error: { detail } }));
    api.inviteTrainer.mockRejectedValue(new HttpErrorResponse({ status: 400, error: { detail } }));
    component.contactCode = 'bad'; await component.invite(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(detail);
  });
  it('rejects expired, terminal and wrong-box actions', async () => {
    const expired = { ...invitation('old'), expires_at: '2000-01-01T00:00:00Z' };
    component.received.set([expired, invitation('terminal', 'revoked')]);
    await component.act(expired, 'accept'); await component.act(component.received()[1], 'reject');
    await component.act(component.sent()[0], 'accept');
    expect(api.act).not.toHaveBeenCalled(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Aceptar');
  });
  it('prevents duplicate submissions and discards a late code after leaving', async () => {
    let resolve!: (value: { code: string }) => void;
    api.generateContactCode.mockReturnValue(new Promise(r => { resolve = r; }));
    const first = component.generateCode(); await component.generateCode();
    expect(api.generateContactCode).toHaveBeenCalledTimes(1);
    fixture.destroy(); resolve({ code: 'secret' }); await first;
    expect(component.code()).toBe('');
  });
  it('uses one compact empty state and only displays populated inboxes', async () => {
    api.list.mockResolvedValue([]); await component.refresh(); await settle();
    expect(fixture.nativeElement.textContent).toContain('Sin invitaciones pendientes.');
    expect(fixture.nativeElement.querySelector('[aria-label="Solicitudes recibidas"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[aria-label="Invitaciones enviadas"]')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Actualizar invitaciones');
    component.received.set([invitation('received')]); await settle();
    expect(fixture.nativeElement.querySelector('[aria-label="Solicitudes recibidas"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[aria-label="Invitaciones enviadas"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Aceptar');
    expect(fixture.nativeElement.textContent).toContain('Rechazar');
  });

});
