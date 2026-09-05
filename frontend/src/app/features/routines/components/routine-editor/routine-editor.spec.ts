import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { AuthService } from '../../../../core/auth.service';
import { environment } from '../../../../../environments/environment';
import { Routines } from '../../../../pages/routines/routines';
import { Endurance, ENDURANCE_HEALTH_CONNECT } from '../../../../pages/endurance/endurance';
import { RoutineEditor } from './routine-editor';
import { copyRoutine, newRoutine, RoutineDocument, RoutineEditorContext } from '../../domain/routine-editor';
import { parseRunningRoutine } from '../../domain/running-routine-import';

const exercise = { id: 'bench-press', name: 'Press de banca', muscle: 'Pecho', equipment: 'Barra', type: 'strength', category: 'compound' };
const api = environment.apiUrl;
const context = (routine: RoutineDocument, mode: RoutineEditorContext['mode'] = 'edit'): RoutineEditorContext => ({
  routine, mode, saveLabel: 'Guardar plantilla', save: vi.fn().mockResolvedValue(undefined), cancel: vi.fn(),
});
async function settle() { for (let i = 0; i < 8; ++i) await Promise.resolve(); }

describe('Shared routine editors with an external save destination', () => {
  let http: HttpTestingController;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Routines, Endurance, RoutineEditor],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ENDURANCE_HEALTH_CONNECT, useValue: { readGarminSwimmingMetrics: vi.fn(), readGarminRunningMetrics: vi.fn() } },
        { provide: AuthService, useValue: { getAccessToken: vi.fn().mockResolvedValue('token') } }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  async function strength(port: RoutineEditorContext) {
    const fixture = TestBed.createComponent(Routines);
    fixture.componentRef.setInput('editorContext', port);
    fixture.detectChanges();
    await settle();
    http.expectOne(`${api}/exercises`).flush([exercise]);
    await settle();
    fixture.detectChanges();
    http.expectNone(req => req.url.includes('/analytics') || req.url.includes('/routines'));
    return fixture;
  }

  it('uses the existing strength form and catalogue, validates the name and never writes athlete routines', async () => {
    const port = context(newRoutine('strength'), 'create');
    const fixture = await strength(port);
    const component = fixture.componentInstance;
    component.openExercisePicker(component.sessions()[0].sessionId);
    component.addExerciseToSession(exercise);
    await component.saveAndActivateRoutine();
    expect(port.save).not.toHaveBeenCalled();
    expect(component.saveError()).toContain('nombre');
    component.routineName.set('Fuerza triatlón');
    await component.saveAndActivateRoutine();
    expect(port.save).toHaveBeenCalledOnce();
    const data = vi.mocked(port.save).mock.calls[0][0];
    expect(data.routineId).toBe(port.routine.routineId);
    expect(data.schemaVersion).toBe('4.2');
    expect(data.revision).toBe(1);
    expect(data.sessions[0].exercises[0].prescription.reps).toEqual({ min: 8, max: 12 });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Aptus ID');
    expect(fixture.nativeElement.textContent).not.toContain('activar');
    http.expectNone(req => req.method !== 'GET');
  });

  it('loads existing strength prescriptions and preserves unknown content during rename/edit', async () => {
    const routine = newRoutine('strength');
    routine.name = 'Original'; routine.revision = 4;
    routine.sessions[0].notes = 'Mantener esta nota';
    routine.sessions[0].exercises = [{
      exerciseId: 'bench-press', name: 'Press', notes: 'Agarre cerrado',
      prescription: { sets: 4, target: { type: 'duration', min: 30, max: 45 }, targetRir: { min: 0, max: 1 }, restSeconds: 75 },
    }];
    const port = context(routine);
    const fixture = await strength(port);
    expect(fixture.componentInstance.sessions()[0].exercises[0].targetType).toBe('duración');
    fixture.componentInstance.routineName.set('Renombrada');
    await fixture.componentInstance.saveAndActivateRoutine();
    const saved = vi.mocked(port.save).mock.calls[0][0];
    expect(saved.name).toBe('Renombrada');
    expect(saved.revision).toBe(5);
    expect(saved.sessions[0].notes).toBe('Mantener esta nota');
    expect(saved.sessions[0].exercises[0].notes).toBe('Agarre cerrado');
    expect(routine.name).toBe('Original');
  });

  it.each([true, false])('uses the real Excel parser and previews only valid files (valid=%s)', async valid => {
    const port = context(newRoutine('strength'), 'import');
    const fixture = await strength(port);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
      { 'Sesión': 'A', 'Orden': 1, 'Nombre': 'Sesión A', '_GymOS session': '' },
      { 'Sesión': 'B', 'Orden': 2, 'Nombre': 'Sesión B', '_GymOS session': '' },
    ]), 'Sesiones');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(['A', 'B'].map(session => (
      { 'Sesión': session, 'Orden': 1, 'Ejercicio': 'Press de banca', 'Series': valid ? 3 : -1,
        'Tipo de objetivo': 'repeticiones', 'Objetivo mínimo': 8, 'Objetivo máximo': 12,
        'RIR mínimo': 1, 'RIR máximo': 3, 'Descanso (s)': 120, '_GymOS exercise': 'bench-press' }
    ))), 'Rutina');
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    await fixture.componentInstance.importRoutineFile({ target: { files: [{ name: 'Base fuerza.xlsx', arrayBuffer: async () => buffer }], value: '' } } as unknown as Event);
    expect(port.save).not.toHaveBeenCalled();
    if (valid) {
      expect(fixture.componentInstance.importError(), JSON.stringify(fixture.componentInstance.importIssues())).toBeNull();
      expect(fixture.componentInstance.creating()).toBe(true);
      expect(fixture.componentInstance.routineName()).toBe('Base fuerza');
      await fixture.componentInstance.saveAndActivateRoutine();
      expect(port.save).toHaveBeenCalledOnce();
    } else {
      expect(fixture.componentInstance.creating()).toBe(false);
      expect(fixture.componentInstance.importError()).toContain('error');
    }
    http.expectNone(req => req.url.includes('/routines'));
  });

  it.each(['swimming', 'running'] as const)('reuses the %s editor without active routine or Health Connect loads', async discipline => {
    const routine = newRoutine(discipline);
    const port = context(routine);
    const fixture = TestBed.createComponent(Endurance);
    fixture.componentRef.setInput('editorContext', port);
    fixture.detectChanges();
    if (discipline === 'swimming') {
      fixture.componentInstance.updateSwimmingRoutineField('title', 'Técnica de crol');
      await fixture.componentInstance.saveSwimmingRoutine();
    } else {
      fixture.componentInstance.updateRunningRoutineField('title', 'Series 10K');
      await fixture.componentInstance.saveRunningRoutine();
    }
    expect(port.save).toHaveBeenCalledOnce();
    expect(vi.mocked(port.save).mock.calls[0][0].sessions[0].blocks).toEqual(routine.sessions[0].blocks);
    expect(fixture.nativeElement.textContent).not.toContain('Health Connect');
    expect(fixture.nativeElement.textContent).not.toContain('Rutina de hoy');
    http.expectNone(() => true);
    const health = TestBed.inject(ENDURANCE_HEALTH_CONNECT);
    expect(health.readGarminSwimmingMetrics).not.toHaveBeenCalled();
    expect(health.readGarminRunningMetrics).not.toHaveBeenCalled();
  });

  it('merges an edited endurance session without discarding other sessions and saves the library name', async () => {
    const routine = newRoutine('running'); routine.name = 'Plan 10K'; routine.revision = 7;
    const second = structuredClone(routine.sessions[0]); second.sessionId = 'second-session'; second.notes = 'Conservar';
    routine.sessions.push(second);
    const port = context(routine);
    const fixture = TestBed.createComponent(RoutineEditor);
    fixture.componentRef.setInput('context', port); fixture.detectChanges();
    const component = fixture.componentInstance;
    const edit = component.sessionContext()!;
    const changed = structuredClone(edit.routine); changed.sessions[0].title = 'Rodaje suave';
    await edit.save(changed);
    component.name.set('Plan 10K revisado');
    await component.save();
    const saved = vi.mocked(port.save).mock.calls[0][0];
    expect(saved.name).toBe('Plan 10K revisado');
    expect(saved.revision).toBe(8);
    expect(saved.sessions[0].title).toBe('Rodaje suave');
    expect(saved.sessions[1]).toEqual(second);
  });

  it('previews a running import with the shared parser before saving', async () => {
    const port = context(newRoutine('running'), 'import');
    const fixture = TestBed.createComponent(RoutineEditor);
    fixture.componentRef.setInput('context', port); fixture.detectChanges();
    const component = fixture.componentInstance;
    component.importText.set('{broken'); component.importJson();
    expect(component.error()).toContain('JSON');
    expect(component.importReady()).toBe(false);
    const imported = newRoutine('running'); imported.name = 'Desde Health OS';
    component.importText.set(JSON.stringify(imported)); component.importJson();
    expect(component.importReady()).toBe(true);
    expect(port.save).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Principal');
    await component.save();
    expect(port.save).toHaveBeenCalledOnce();
  });
});

describe('Routine copy and shared JSON validation', () => {
  it('regenerates session and block IDs without mutating the source', () => {
    const original = newRoutine('swimming');
    const copy = copyRoutine(original);
    expect(copy.routineId).not.toBe(original.routineId);
    expect(copy.sessions[0].sessionId).not.toBe(original.sessions[0].sessionId);
    expect(copy.sessions[0].blocks[0].id).not.toBe(original.sessions[0].blocks[0].id);
    copy.sessions[0].blocks[0].sets[0].repetitions = 10;
    expect(original.sessions[0].blocks[0].sets[0].repetitions).toBe(1);
  });
  it('rejects invalid later sessions in a multi-session JSON file', () => {
    const routine = newRoutine('running');
    routine.sessions.push({ sessionId: 'bad', title: 'Inválida', blocks: [] });
    expect(() => parseRunningRoutine(JSON.stringify(routine))).toThrow('bloques');
  });
});
