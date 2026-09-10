/** @vitest-environment jsdom */
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AthleteProfileService } from '../../core/athlete-profile.service';
import { Goal, GoalMetricState } from '../../core/goal.models';
import { GoalService } from '../../core/goal.service';
import { SettingsAthleteProfile } from './athlete-profile';
import { SettingsGoals } from './goals';

const goal = (overrides: Partial<Goal> = {}): Goal => ({
  id: 'goal-1', userId: 'user-1', category: 'endurance', kind: 'running', variant: '10k',
  targetDate: '2027-04-18', status: 'active', createdByUserId: 'user-1',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...overrides
});
const state = (): GoalMetricState => ({
  metric: { id: 'metric-1', goalId: 'goal-1', metricKey: 'body_weight', unit: 'kg', targetValue: 75, createdAt: '', updatedAt: '' },
  baseline: { id: 'baseline-1', goalMetricId: 'metric-1', value: 80, unit: 'kg', measuredAt: '2026-01-01', sourceType: 'manual', sourceDomain: null, sourceRecordId: null, createdAt: '', updatedAt: '' },
  target: { value: 75, unit: 'kg' },
  current: { metricKey: 'body_weight', value: 78, unit: 'kg', measuredAt: '2026-02-01', source: { sourceType: 'scale', sourceDomain: 'health_weight_entries', sourceRecordId: 'weight-1' }, available: true, reason: null }
});
const text = (fixture: any) => (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ');
const settle = async () => { for (let index = 0; index < 30; index++) await Promise.resolve(); };

describe('Settings athlete profile', () => {
  const update = vi.fn();
  const get = vi.fn();
  const getActive = vi.fn();

  beforeEach(async () => {
    get.mockReset().mockResolvedValue({ userId: 'user-1', experienceLevel: 'intermediate', weeklyAvailability: 4,
      sessionDurationMin: 60, injuries: ['Rodilla sensible'], painAreas: ['rodilla'] });
    update.mockReset().mockImplementation(async input => ({ userId: 'user-1', experienceLevel: input.experienceLevel ?? 'intermediate',
      weeklyAvailability: input.weeklyAvailability, sessionDurationMin: input.sessionDurationMin,
      injuries: input.injuries, painAreas: input.painAreas }));
    getActive.mockReset().mockResolvedValue(goal({ category: 'strength', kind: 'strength_gain', variant: null }));
    await TestBed.configureTestingModule({ imports: [SettingsAthleteProfile], providers: [
      provideRouter([]),
      { provide: AthleteProfileService, useValue: { get, update } },
      { provide: GoalService, useValue: { getActive } }
    ] }).compileComponents();
  });

  it('edits availability and restrictions without regenerating a routine', async () => {
    const fixture = TestBed.createComponent(SettingsAthleteProfile); fixture.detectChanges(); await settle(); fixture.detectChanges();
    expect(text(fixture)).toContain('Experiencia de fuerza');
    const inputs = fixture.nativeElement.querySelectorAll('input[type="number"]') as NodeListOf<HTMLInputElement>;
    inputs[0].value = '3'; inputs[0].dispatchEvent(new Event('input'));
    inputs[1].value = '45'; inputs[1].dispatchEvent(new Event('input'));
    (fixture.nativeElement.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await settle(); fixture.detectChanges();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ weeklyAvailability: 3, sessionDurationMin: 45 }));
    expect(JSON.stringify(update.mock.calls)).not.toContain('routine');
    expect(text(fixture)).toContain('Perfil deportivo actualizado');
  });

  it('keeps strength-specific experience out of non-strength profiles', async () => {
    getActive.mockResolvedValue(goal({ category: 'endurance', kind: 'running' }));
    const fixture = TestBed.createComponent(SettingsAthleteProfile); fixture.detectChanges(); await settle(); fixture.detectChanges();
    expect(text(fixture)).not.toContain('Experiencia de fuerza');
  });

  it('keeps a profile error isolated from Goal lookup', async () => {
    get.mockRejectedValue(new Error('offline'));
    const fixture = TestBed.createComponent(SettingsAthleteProfile); fixture.detectChanges(); await settle(); fixture.detectChanges();
    expect(text(fixture)).toContain('No se pudo cargar el perfil deportivo');
  });
});

describe('Settings Goals', () => {
  const service = {
    getActive: vi.fn(), list: vi.fn(), listMetricStates: vi.fn(),
    update: vi.fn(), changeStatus: vi.fn(), create: vi.fn(),
    createMetric: vi.fn(), updateMetricTarget: vi.fn(), putMetricBaseline: vi.fn()
  };

  beforeEach(async () => {
    service.getActive.mockReset().mockResolvedValue(goal());
    service.list.mockReset().mockResolvedValue([
      goal(), goal({ id: 'old', status: 'completed', variant: '5k', updatedAt: '2025-02-01T00:00:00Z' })
    ]);
    service.listMetricStates.mockReset().mockResolvedValue([]);
    service.update.mockReset(); service.changeStatus.mockReset(); service.create.mockReset();
    service.createMetric.mockReset(); service.updateMetricTarget.mockReset(); service.putMetricBaseline.mockReset();
    await TestBed.configureTestingModule({ imports: [SettingsGoals], providers: [
      provideRouter([]), { provide: GoalService, useValue: service }
    ] }).compileComponents();
  });

  async function render() {
    const fixture = TestBed.createComponent(SettingsGoals); fixture.detectChanges(); await settle(); fixture.detectChanges(); return fixture;
  }

  it('shows the active Goal, compatible variant, date, status and history', async () => {
    const fixture = await render();
    expect(text(fixture)).toContain('Carrera · 10K'); expect(text(fixture)).toContain('Activo');
    expect(text(fixture)).toContain('Carrera · 5K'); expect(text(fixture)).toContain('Completado');
    (fixture.nativeElement.querySelectorAll('.goal-actions button')[0] as HTMLButtonElement).click(); fixture.detectChanges();
    const options = [...fixture.nativeElement.querySelectorAll('.goal-edit option')].map((item: any) => item.textContent.trim());
    expect(options).toEqual(['Sin modalidad concreta', '5K', '10K', 'Media maratón']);
    expect(options).not.toContain('Sprint');
  });

  it('edits target date and a compatible variant through GoalService', async () => {
    service.update.mockResolvedValue(goal({ variant: 'half_marathon', targetDate: '2027-06-01' }));
    const fixture = await render(); fixture.componentInstance.startEditGoal();
    fixture.componentInstance.editVariant.set('half_marathon'); fixture.componentInstance.editTargetDate.set('2027-06-01');
    await fixture.componentInstance.saveGoal(new Event('submit'));
    expect(service.update).toHaveBeenCalledWith('goal-1', { variant: 'half_marathon', targetDate: '2027-06-01' });
  });

  it('surfaces an invalid variant rejection without changing the Goal', async () => {
    service.update.mockRejectedValue(new Error('422'));
    const fixture = await render(); fixture.componentInstance.startEditGoal();
    fixture.componentInstance.editVariant.set('olympic');
    await fixture.componentInstance.saveGoal(new Event('submit')); fixture.detectChanges();
    expect(text(fixture)).toContain('Revisa la variante y la fecha');
    expect(fixture.componentInstance.activeGoal()?.variant).toBe('10k');
  });

  it.each([['completed', 'conseguido'], ['abandoned', 'abandonado']] as const)(
    'confirms and preserves a %s Goal in history', async (status, message) => {
      service.changeStatus.mockResolvedValue(goal({ status }));
      const fixture = await render(); fixture.componentInstance.confirmation.set(status); fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeTruthy();
      await fixture.componentInstance.closeGoal(status); fixture.detectChanges();
      expect(service.changeStatus).toHaveBeenCalledWith('goal-1', status);
      expect(fixture.componentInstance.closedGoals().some(item => item.status === status)).toBe(true);
      expect(text(fixture)).toContain(message);
    }
  );

  it('abandons the current Goal only after confirmation and creates the selected replacement', async () => {
    const replacement = goal({ id: 'goal-2', category: 'health', kind: 'more_active', variant: null, targetDate: null });
    service.changeStatus.mockResolvedValue(goal({ status: 'abandoned' })); service.create.mockResolvedValue(replacement);
    const fixture = await render();
    fixture.componentInstance.requestReplacement({ category: 'health', kind: 'more_active' }); fixture.detectChanges();
    expect(service.changeStatus).not.toHaveBeenCalled();
    await fixture.componentInstance.confirmReplacement();
    expect(service.changeStatus).toHaveBeenCalledWith('goal-1', 'abandoned');
    expect(service.create).toHaveBeenCalledWith({ category: 'health', kind: 'more_active' });
    expect(fixture.componentInstance.activeGoal()?.id).toBe('goal-2');
  });

  it('allows a user without Goal to create one without onboarding', async () => {
    service.getActive.mockResolvedValue(null); service.list.mockResolvedValue([]);
    const fixture = await render();
    expect(text(fixture)).toContain('Sin objetivo activo'); expect(text(fixture)).toContain('Definir objetivo');
    expect(text(fixture)).not.toContain('Lesiones o limitaciones');
  });

  it('edits baseline and target while Current remains read-only', async () => {
    service.listMetricStates.mockResolvedValue([state()]);
    service.updateMetricTarget.mockResolvedValue({}); service.putMetricBaseline.mockResolvedValue({});
    const fixture = await render();
    expect(text(fixture)).toContain('Current · solo lectura'); expect(text(fixture)).toContain('78 kg');
    expect(fixture.nativeElement.querySelectorAll('.metric-edit input')).toHaveLength(3);
    fixture.componentInstance.metricEdits.set({ 'metric-1': { baseline: '79', baselineDate: '2026-01-02', target: '' } });
    await fixture.componentInstance.saveMetric(state());
    expect(service.updateMetricTarget).toHaveBeenCalledWith('goal-1', 'metric-1', null);
    expect(service.putMetricBaseline).toHaveBeenCalledWith('goal-1', 'metric-1', {
      value: 79, measuredAt: '2026-01-02', sourceType: 'manual'
    });
  });

  it('treats unavailable Current as information and offers only coherent metrics', async () => {
    service.getActive.mockResolvedValue(goal({ category: 'body_composition', kind: 'fat_loss', variant: null }));
    service.listMetricStates.mockResolvedValue([]);
    const fixture = await render();
    expect(text(fixture)).toContain('Añadir peso'); expect(text(fixture)).toContain('Añadir cintura');
    expect(text(fixture)).not.toContain('Añadir natación');
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('keeps history when metric loading fails', async () => {
    service.listMetricStates.mockRejectedValue(new Error('offline'));
    const fixture = await render();
    expect(text(fixture)).toContain('Carrera · 5K');
    expect(text(fixture)).toContain('sus métricas no se pudieron cargar');
  });
});
