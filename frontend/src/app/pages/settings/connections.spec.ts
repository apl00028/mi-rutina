import { TestBed, ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthService } from '../../core/auth.service';
import { ConnectionsService } from '../../core/connections.service';
import { TrainerAthleteConnection } from '../../core/connections.models';
import { ConnectionInvitations } from '../../features/connections/invitations';
import { ConnectionSettings } from './connections';

const row: TrainerAthleteConnection = { trainer_id: 'trainer', athlete_id: 'athlete', status: 'active',
  created_at: '2026-09-07T08:00:00Z', updated_at: '2026-09-07T08:00:00.123456Z',
  other_display_name: 'Persona', other_alias: null, domains: ['swimming'] };

describe('Connection settings', () => {
  let fixture: ComponentFixture<ConnectionSettings>;
  let component: ConnectionSettings;
  const api = { relationships: vi.fn(), list: vi.fn(), setPermissions: vi.fn(), unlink: vi.fn(), act: vi.fn() };
  const resolveAccess = vi.fn();
  beforeEach(async () => {
    vi.resetAllMocks(); resolveAccess.mockResolvedValue({ role: 'user', access_status: 'active' });
    api.relationships.mockResolvedValue([row]); api.list.mockResolvedValue([]);
    api.setPermissions.mockResolvedValue({ updated_at: '2026-09-07T09:00:00Z' }); api.unlink.mockResolvedValue(undefined);
    await TestBed.configureTestingModule({ imports: [ConnectionSettings], providers: [provideRouter([]),
      { provide: ConnectionsService, useValue: api }, { provide: AuthService, useValue: { resolveAccess } }] }).compileComponents();
  });
  async function settle() { for(let i=0;i<12;i++) await Promise.resolve(); fixture.detectChanges(); }
  async function start() { fixture=TestBed.createComponent(ConnectionSettings); component=fixture.componentInstance; fixture.detectChanges(); await settle(); await fixture.whenStable(); fixture.detectChanges(); }
  afterEach(() => fixture?.destroy());
  it('shows per-trainer grants and keeps the athlete invitation context', async () => {
    await start(); expect(fixture.nativeElement.textContent).toContain('Natación');
    expect(fixture.nativeElement.textContent).toContain('Gestionar permisos');
    expect(fixture.debugElement.query(By.directive(ConnectionInvitations)).componentInstance.context).toBe('athlete');
    expect(api.setPermissions).not.toHaveBeenCalled();
  });
  it('saves explicitly after server confirmation, preserving timestamp precision', async () => {
    await start(); component.edit(row); component.toggle('running', true);
    let complete!: (value: { updated_at: string }) => void;
    api.setPermissions.mockReturnValue(new Promise(resolve => complete=resolve));
    const save=component.save(); await settle();
    expect(component.relationships()[0].domains).toEqual(['swimming']);
    expect(api.setPermissions).toHaveBeenCalledWith('trainer',['swimming','running'],row.updated_at);
    complete({ updated_at: '2026-09-07T09:00:00Z' }); await save;
    expect(component.relationships()[0].domains).toEqual(['swimming','running']);
  });
  it('retains confirmed values and the draft on server conflict', async () => {
    await start(); component.edit(row); component.toggle('health',true);
    api.setPermissions.mockRejectedValue(new HttpErrorResponse({status:409,error:{detail:'La conexión ha cambiado. Actualiza antes de guardar.'}}));
    await component.save(); fixture.detectChanges();
    expect(component.relationships()[0].domains).toEqual(['swimming']); expect(component.draft()).toContain('health');
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Actualiza');
  });
  it('trainer can view permissions but cannot edit them', async () => {
    resolveAccess.mockResolvedValue({role:'trainer',access_status:'active'}); await start();
    expect(fixture.nativeElement.textContent).not.toContain('Gestionar permisos');
    component.edit(row); await component.save(); expect(api.setPermissions).not.toHaveBeenCalled();
    expect(fixture.debugElement.query(By.directive(ConnectionInvitations)).componentInstance.context).toBe('trainer');
  });
  it('requires explicit unlink confirmation, handles failure, then removes the confirmed relation', async () => {
    await start(); expect(api.unlink).not.toHaveBeenCalled(); component.unlinking.set(row);
    api.unlink.mockRejectedValueOnce(new Error()); await component.unlink();
    expect(component.relationships()).toEqual([row]);
    await component.unlink(); expect(api.unlink).toHaveBeenCalledWith('trainer',row.updated_at);
    expect(component.relationships()).toEqual([]);
  });
  it('refreshes relationships after accepting an invitation', async () => {
    await start(); const panel = fixture.debugElement.query(By.directive(ConnectionInvitations)).componentInstance;
    api.relationships.mockClear(); panel.accepted.emit(); await settle(); expect(api.relationships).toHaveBeenCalledTimes(1);
  });
  it('admin manages its own connection explicitly in athlete context', async () => {
    resolveAccess.mockResolvedValue({role:'admin',access_status:'active'}); await start();
    const panel = fixture.debugElement.query(By.directive(ConnectionInvitations)).componentInstance;
    expect(panel.context).toBe('athlete');
    expect(fixture.nativeElement.textContent).toContain('Añadir entrenador');
    expect(fixture.nativeElement.textContent).not.toContain('Añadir cliente');
    expect(api.setPermissions).not.toHaveBeenCalled();
    component.edit(row); component.toggle('swimming',false); await component.save();
    expect(api.setPermissions).toHaveBeenCalledWith(row.trainer_id,[],row.updated_at);
  });
  it('shows no access compactly and offers one refresh for the whole screen', async () => {
    api.relationships.mockResolvedValue([{...row, domains: []}]); await start();
    expect(fixture.nativeElement.textContent).toContain('Sin acceso');
    expect(fixture.nativeElement.textContent).not.toContain('Actualizar conexiones');
    expect(fixture.nativeElement.textContent).not.toContain('Actualizar invitaciones');
    api.relationships.mockClear(); api.list.mockClear();
    fixture.nativeElement.querySelector('button[aria-label="Actualizar toda la pantalla"]').click();
    await settle();
    expect(api.relationships).toHaveBeenCalledTimes(1);
    expect(api.list.mock.calls).toEqual([['received'], ['sent']]);
  });
  it('edits through controls and keeps confirmed chips until explicit save', async () => {
    await start();
    const button = (text: string) => Array.from(fixture.nativeElement.querySelectorAll('button'))
      .find((node: any) => node.textContent.trim() === text) as HTMLButtonElement;
    button('Gestionar permisos').click(); await settle();
    const labels = Array.from(fixture.nativeElement.querySelectorAll('fieldset label')) as HTMLLabelElement[];
    labels.find(label => label.textContent?.includes('Carrera'))!.querySelector('input')!.click();
    await settle();
    expect(api.setPermissions).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.chips').textContent).not.toContain('Carrera');
    button('Guardar permisos').click(); await settle();
    expect(api.setPermissions).toHaveBeenCalledWith('trainer', ['swimming','running'], row.updated_at);
    expect(fixture.nativeElement.querySelector('.chips').textContent).toContain('Carrera');
  });
  it('keeps unlink behind options and requires a separate confirmation click', async () => {
    await start();
    const options = fixture.nativeElement.querySelector('details.more-actions') as HTMLDetailsElement;
    expect(options.open).toBe(false);
    options.querySelector('summary')!.click(); await settle();
    options.querySelector('button')!.click(); await settle();
    expect(api.unlink).not.toHaveBeenCalled();
    const confirm = Array.from(fixture.nativeElement.querySelectorAll('button'))
      .find((node: any) => node.textContent.trim() === 'Confirmar desvinculación') as HTMLButtonElement;
    confirm.click(); await settle();
    expect(api.unlink).toHaveBeenCalledWith('trainer', row.updated_at);
  });

});
