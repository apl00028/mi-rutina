import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';
import {
  TrainerAthlete,
  TrainerAthleteOverview,
  TrainerRoutineTemplate,
} from '../../core/trainer.service';
import { Trainer } from './trainer';

const athlete: TrainerAthlete = {
  athlete_id: 'athlete-1',
  status: 'active',
  display_name: 'Athlete One',
  email: 'athlete@example.com',
  client_since: '2026-08-15T10:00:00Z',
};
const api = `${environment.apiUrl}/trainer`;

describe('Trainer experience', () => {
  let fixture: ComponentFixture<Trainer>;
  let http: HttpTestingController;
  let router: Router;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Trainer],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideLocationMocks(),
        provideRouter([{ path: 'trainer', component: Trainer }]),
        {
          provide: AuthService,
          useValue: { getAccessToken: vi.fn().mockResolvedValue('access-token') },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    router.setUpLocationChangeListener();
  });
  afterEach(() => http.verify());
  async function settle() {
    for (let i = 0; i < 12; i++) await Promise.resolve();
    fixture?.detectChanges();
  }
  function text(): string {
    return fixture.nativeElement.textContent.replace(/\s+/g, ' ');
  }
  async function start(
    view = '',
    templates = [templateWithRoutineData()],
    clients = [athlete],
    failOverview = false,
  ) {
    await router.navigateByUrl(`/trainer${view}`);
    fixture = TestBed.createComponent(Trainer);
    fixture.detectChanges();
    await settle();
    http.expectOne(`${api}/athletes`).flush(clients);
    http.expectOne(`${api}/templates`).flush(templates);
    await settle();
    for (const client of clients) {
      const req = http.expectOne(`${api}/athletes/${client.athlete_id}`);
      if (failOverview) req.flush({}, { status: 503, statusText: 'Unavailable' });
      else req.flush(overviewResponse(client));
    }
    await settle();
  }
  async function click(label: string) {
    const button = (
      Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[]
    ).find((b) => b.textContent?.includes(label));
    expect(button, label).toBeTruthy();
    button!.click();
    await settle();
  }
  async function assignment() {
    await start('?view=templates');
    await click('Base fuerza');
    await click('Asignar a deportista');
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = athlete.athlete_id;
    select.dispatchEvent(new Event('change'));
    await settle();
  }
  function completeAssignment(routineId: string) {
    http
      .expectOne(`${api}/templates/strength-base/assign`)
      .flush({
        assignment_id: 'assignment-1',
        athlete_id: athlete.athlete_id,
        template_id: 'strength-base',
        routine_id: routineId,
        discipline: 'strength',
        assigned_at: '2026-09-05T10:00:00Z',
      });
  }

  it('shows a compact dashboard with scoped totals and recent activity, without full lists or duplicate navigation', async () => {
    await start();
    expect(text()).toContain('Panel de entrenador');
    expect(fixture.nativeElement.querySelectorAll('.summary-card')).toHaveLength(3);
    expect(text()).toContain('no incluye natación importada');
    expect(fixture.nativeElement.querySelectorAll('.activity-row')).toHaveLength(1);
    expect(
      fixture.nativeElement.querySelector(
        '.athlete-card, .template-card, .quick-actions, .view-switch',
      ),
    ).toBeNull();
    expect(text()).not.toContain('Acciones rápidas');
  });
  it('reacts to query navigation and browser back/forward on the same component', async () => {
    await start();
    await router.navigateByUrl('/trainer?view=clients');
    await settle();
    expect(fixture.nativeElement.querySelector('.athlete-card')).toBeTruthy();
    await router.navigateByUrl('/trainer?view=templates');
    await settle();
    expect(fixture.nativeElement.querySelector('.template-card')).toBeTruthy();
    TestBed.inject(Location).back();
    await vi.waitFor(() => expect(router.url).toBe('/trainer?view=clients'));
    await settle();
    expect(fixture.componentInstance.activeView()).toBe('athletes');
    TestBed.inject(Location).forward();
    await vi.waitFor(() => expect(router.url).toBe('/trainer?view=templates'));
    await settle();
    expect(fixture.componentInstance.activeView()).toBe('templates');
  });
  it('renders compact client links with actual counts and no technical identity', async () => {
    await start('?view=clients');
    const row = fixture.nativeElement.querySelector('.athlete-card');
    expect(row.getAttribute('href')).toBe('/trainer/clients/athlete-1');
    expect(row.textContent).toContain('3 sesiones últimos 7 días');
    expect(row.textContent).toContain('2 rutinas activas');
    expect(row.querySelector('details')).toBeNull();
    expect(text()).not.toContain('athlete-1');
    expect(text()).not.toContain('Fuerza base');
  });
  it('uses a human identity fallback', async () => {
    await start('?view=clients', [], [{ ...athlete, display_name: null, email: null }]);
    expect(text()).toContain('Deportista');
    expect(text()).not.toContain('athlete-1');
  });
  it('does not present missing overviews as zero activity', async () => {
    await start('', [], [athlete], true);
    expect(fixture.componentInstance.summarySessionsLabel()).toBe('—');
    await router.navigateByUrl('/trainer?view=clients');
    await settle();
    expect(text()).toContain('Sesiones no disponibles');
    expect(text()).not.toContain('0 rutinas activas');
  });
  it('shows empty clients and disables assignment without clients', async () => {
    await start('?view=templates', [templateWithRoutineData()], []);
    await click('Base fuerza');
    await click('Asignar a deportista');
    expect(text()).toContain('No hay clientes activos');
    expect(fixture.nativeElement.querySelector('.primary-button').disabled).toBe(true);
  });
  it('filters templates by each modality with chips', async () => {
    const base = templateWithRoutineData();
    await start('?view=templates', [
      base,
      ...(['swimming', 'running', 'cycling'] as const).map((d) => ({
        ...base,
        id: d,
        name: `Plan ${d}`,
        discipline: d,
      })),
    ]);
    expect(fixture.nativeElement.querySelectorAll('.discipline-filters button')).toHaveLength(5);
    await click('Natación');
    expect(fixture.nativeElement.querySelectorAll('.template-card')).toHaveLength(1);
    expect(text()).toContain('Plan swimming');
    await click('Bici');
    expect(text()).toContain('Plan cycling');
    expect(text()).not.toContain('Base fuerza');
    await click('Todas');
    expect(fixture.nativeElement.querySelectorAll('.template-card')).toHaveLength(4);
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
    expect(text()).not.toContain('Asignada a');
  });
  it('opens a readable detail and returns to the filtered library', async () => {
    await start('?view=templates');
    await click('Fuerza');
    await click('Base fuerza');
    expect(text()).toContain('Press de banca');
    expect(text()).toContain('Descanso 120 s');
    expect(fixture.nativeElement.querySelector('.template-list')).toBeNull();
    expect(text()).not.toContain('session-a');
    expect(text()).not.toContain('bench-press');
    expect(router.url).toContain('template=strength-base');
    await click('← Plantillas');
    expect(fixture.nativeElement.querySelectorAll('.template-card')).toHaveLength(1);
  });
  it('opens template detail from its URL', async () => {
    await start('?view=templates&template=strength-base');
    expect(text()).toContain('Press de banca');
  });
  it('renders canonical strength prescription including zero values', async () => {
    const template = templateWithRoutineData();
    template.data['sessions'] = [
      {
        sessionId: 'technical-session',
        exercises: [
          {
            exerciseId: 'technical-exercise',
            name: 'Sentadilla',
            prescription: {
              sets: 3,
              target: { type: 'repetitions', min: 8, max: 12 },
              targetRir: { min: 0, max: 2 },
              weight: 0,
              restSeconds: 90,
            },
          },
        ],
      },
    ];
    await start('?view=templates&template=strength-base', [template]);
    expect(text()).toContain('3 series · 8–12 reps · RIR 0–2 · 0 kg · Descanso 90 s');
    expect(text()).toContain('Sesión 1');
    expect(text()).not.toContain('technical-');
  });
  it('renders swimming sets with translated labels and running targets using their actual shapes', async () => {
    const template = templateWithRoutineData();
    template.discipline = 'swimming';
    template.data['sessions'] = [
      {
        sessionId: 'swim',
        title: 'Técnica',
        poolLengthMeters: 25,
        blocks: [
          {
            type: 'warmup',
            sets: [
              {
                repetitions: 4,
                distanceMeters: 50,
                stroke: 'freestyle',
                workType: 'swim',
                intensity: 'easy',
                restSeconds: 0,
              },
            ],
          },
        ],
      },
    ];
    await start('?view=templates&template=strength-base', [template]);
    expect(text()).toContain('4 x 50 m');
    expect(text()).toContain('Crol · Nado · Suave · Descanso 0 s');
    expect(text()).toContain('Calentamiento');
    template.discipline = 'running';
    template.data['sessions'] = [
      {
        sessionId: 'run',
        blocks: [
          {
            title: 'Series',
            sets: [
              {
                repetitions: 3,
                targetType: 'duration',
                durationSeconds: 120,
                intensityMode: 'rpeRange',
                rpeMin: 6,
                rpeMax: 8,
                recoverySeconds: 60,
              },
            ],
          },
        ],
      },
    ];
    fixture.componentInstance.templates.set([{ ...template }]);
    await settle();
    expect(text()).toContain('3 × 120 s');
    expect(text()).toContain('RPE 6–8');
    expect(text()).toContain('Recuperación 60 s');
  });
  it('requires selecting a client and exposes no manual ID controls', async () => {
    await start('?view=templates');
    await click('Base fuerza');
    await click('Asignar a deportista');
    expect(fixture.nativeElement.querySelector('.primary-button').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('input')).toBeNull();
    expect(text()).not.toContain('ID de rutina');
    expect(text()).not.toContain('Generar ID');
    expect(text()).toContain('Podrá activarla');
  });
  it('posts only athlete_id and an internal UUID, blocks double submit and refreshes the overview', async () => {
    await assignment();
    const button = fixture.nativeElement.querySelector('.primary-button') as HTMLButtonElement;
    button.click();
    button.click();
    await settle();
    const requests = http.match(`${api}/templates/strength-base/assign`);
    expect(requests).toHaveLength(1);
    const body = requests[0].request.body;
    expect(Object.keys(body).sort()).toEqual(['athlete_id', 'routine_id']);
    expect(body.athlete_id).toBe('athlete-1');
    expect(body.routine_id).toMatch(/^routine-[0-9a-f-]{36}$/);
    requests[0].flush({
      assignment_id: 'assigned',
      athlete_id: 'athlete-1',
      template_id: 'strength-base',
      routine_id: body.routine_id,
      discipline: 'strength',
      assigned_at: '2026-09-05T10:00:00Z',
    });
    await settle();
    http.expectOne(`${api}/athletes/athlete-1`).flush(overviewResponse(athlete));
    await settle();
    expect(text()).toContain('Base fuerza asignada a Athlete One.');
    expect(text()).not.toContain(body.routine_id);
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
  });
  it('keeps the assignment ID for a retry and generates a new one for an explicit reassignment', async () => {
    await assignment();
    const firstId = fixture.componentInstance.routineId();
    await click('Confirmar asignación');
    http
      .expectOne(`${api}/templates/strength-base/assign`)
      .flush({}, { status: 503, statusText: 'Unavailable' });
    await settle();
    await click('Confirmar asignación');
    expect(fixture.componentInstance.routineId()).toBe(firstId);
    completeAssignment(firstId);
    await settle();
    http.expectOne(`${api}/athletes/athlete-1`).flush(overviewResponse(athlete));
    await settle();
    await click('Asignar a deportista');
    expect(fixture.componentInstance.routineId()).not.toBe(firstId);
  });
  it('reports an ID conflict without automatically creating another copy', async () => {
    await assignment();
    const id = fixture.componentInstance.routineId();
    await click('Confirmar asignación');
    http
      .expectOne(`${api}/templates/strength-base/assign`)
      .flush({}, { status: 409, statusText: 'Conflict' });
    await settle();
    expect(text()).toContain('Esta asignación ya existe');
    expect(fixture.componentInstance.routineId()).toBe(id);
  });
  async function manage(action: 'edit' | 'duplicate' | 'delete') {
    await start('?view=templates&template=strength-base');
    const promise = fixture.componentInstance.manageTemplate(action);
    await settle();
    const template = templateWithRoutineData();
    template.data['schemaVersion'] = '4.2';
    template.data['revision'] = 3;
    http.expectOne(`${api}/templates/strength-base`).flush(template);
    await promise;
    await settle();
    return template;
  }

  it('offers creation and the existing supported import formats without a cycling editor', async () => {
    await start('?view=templates');
    await click('+ Nueva plantilla');
    expect(text()).toContain('Crear desde cero');
    await click('Importar rutina');
    expect(text()).toContain('Fuerza · Excel');
    expect(text()).toContain('Carrera · JSON');
    expect(text()).toContain('No hay un importador de rutinas de natación o bici');
  });

  it('creates a named template with an internal ID and stays in the reusable library', async () => {
    await start('?view=templates');
    await click('+ Nueva plantilla');
    await click('Crear desde cero');
    await click('Fuerza');
    const context = fixture.componentInstance.editorContext()!;
    expect(context.mode).toBe('create');
    expect(context.routine.discipline).toBe('strength');
    expect(context.routine.routineId).toMatch(/^routine-[a-f0-9-]{36}$/);
    await expect(context.save(context.routine)).rejects.toThrow('Indica un nombre');
    const data = { ...context.routine, name: '  Base triatlón  ' };
    const promise = context.save(data);
    await settle();
    const request = http.expectOne(`${api}/templates`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body.name).toBe('Base triatlón');
    expect(request.request.body.id).toBe(context.routine.routineId);
    request.flush({ ...templateWithRoutineData(), id: context.routine.routineId, name: 'Base triatlón', data });
    await promise;
    await settle();
    expect(text()).toContain('Plantilla creada.');
    expect(fixture.componentInstance.templateCount()).toBe(2);
    expect(text()).not.toContain(context.routine.routineId);
    http.expectNone(req => req.url.includes('/routines'));
  });

  it('loads current content for editing and renames using PUT without assigning or activating', async () => {
    const template = await manage('edit');
    const context = fixture.componentInstance.editorContext()!;
    expect(context.routine.sessions).toEqual(template.data['sessions']);
    expect(context.routine.revision).toBe(3);
    const promise = context.save({ ...context.routine, name: 'Plan revisado', revision: 4 });
    await settle();
    const request = http.expectOne(`${api}/templates/strength-base`);
    expect(request.request.method).toBe('PUT');
    expect(Object.keys(request.request.body).sort()).toEqual(['data', 'discipline', 'name']);
    expect(request.request.body.name).toBe('Plan revisado');
    expect(request.request.body.data.revision).toBe(4);
    request.flush({ ...template, name: 'Plan revisado', data: request.request.body.data });
    await promise;
    await settle();
    expect(text()).toContain('Plan revisado');
    expect(text()).toContain('Plantilla actualizada.');
    http.expectNone(req => req.url.includes('/assign') || req.url.includes('/routines'));
  });

  it('duplicates with editable name, new routine/session IDs and unchanged catalogue exercise IDs', async () => {
    const template = await manage('duplicate');
    expect(fixture.componentInstance.templateName()).toBe('Base fuerza · copia');
    fixture.componentInstance.templateName.set('Otro plan');
    const promise = fixture.componentInstance.saveTemplateCopyOrName();
    await settle();
    const request = http.expectOne(`${api}/templates`);
    const body = request.request.body;
    expect(request.request.method).toBe('POST');
    expect(body.name).toBe('Otro plan');
    expect(body.id).not.toBe(template.id);
    expect(body.data.routineId).toBe(body.id);
    expect(body.data.sessions[0].sessionId).not.toBe('session-a');
    expect(body.data.sessions[0].exercises[0].exerciseId).toBe('bench-press');
    expect(body.data.schemaVersion).toBe('4.2');
    expect(body.data.revision).toBe(1);
    request.flush({ ...template, id: body.id, name: body.name, data: body.data });
    await promise;
    await settle();
    expect(fixture.componentInstance.templateCount()).toBe(2);
  });

  it('requires a name for the duplicate', async () => {
    await manage('duplicate');
    fixture.componentInstance.templateName.set('  ');
    await click('Guardar copia');
    expect(text()).toContain('Indica un nombre');
    http.expectNone(req => req.method === 'POST');
  });

  it('shows explicit deletion confirmation and cancelling never deletes', async () => {
    await manage('delete');
    expect(text()).toContain('¿Eliminar «Base fuerza»?');
    expect(text()).toContain('Las plantillas con asignaciones no se pueden eliminar.');
    http.expectNone(req => req.method === 'DELETE');
    await click('Cancelar');
    expect(fixture.componentInstance.templateCount()).toBe(1);
    expect(fixture.componentInstance.templateAction()).toBeNull();
    http.expectNone(req => req.method === 'DELETE');
  });

  it('deletes only after confirmation and returns to the refreshed library', async () => {
    await manage('delete');
    await click('Confirmar eliminación');
    const request = http.expectOne(`${api}/templates/strength-base`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    expect(fixture.componentInstance.templateCount()).toBe(0);
    expect(fixture.componentInstance.selectedTemplateId()).toBeNull();
    expect(text()).toContain('Plantilla eliminada.');
  });

  it.each([409, 502, 503, 404, 0])('retains the template and reports deletion error %s accurately', async (status) => {
    await manage('delete');
    await click('Confirmar eliminación');
    const request = http.expectOne(`${api}/templates/strength-base`);
    if (status === 0) request.error(new ProgressEvent('error'));
    else request.flush({}, { status, statusText: 'Error' });
    await settle();
    if (status === 409) {
      expect(text()).toContain('Esta plantilla tiene asignaciones y no puede eliminarse.');
    } else {
      expect(text()).toContain('No se pudo eliminar la plantilla. Inténtalo de nuevo.');
      expect(text()).not.toContain('Esta plantilla tiene asignaciones');
    }
    expect(fixture.componentInstance.templateCount()).toBe(1);
    expect(fixture.componentInstance.templateBusy()).toBe(false);
  });

  it('ignores a late edit load after navigating away', async () => {
    await start('?view=templates&template=strength-base');
    const promise = fixture.componentInstance.manageTemplate('edit');
    await settle();
    const request = http.expectOne(`${api}/templates/strength-base`);
    await router.navigateByUrl('/trainer?view=clients');
    await settle();
    request.flush(templateWithRoutineData());
    await promise;
    await settle();
    expect(fixture.componentInstance.editorContext()).toBeNull();
    expect(fixture.componentInstance.templateAction()).toBeNull();
  });

  function templateWithRoutineData(): TrainerRoutineTemplate {
    return {
      id: 'strength-base',
      name: 'Base fuerza',
      discipline: 'strength',
      data: {
        routineId: 'strength-base',
        schemaVersion: '1',
        revision: 0,
        discipline: 'strength',
        sessions: [
          {
            sessionId: 'session-a',
            name: 'Sesión A',
            exercises: [
              {
                exerciseId: 'bench-press',
                name: 'Press de banca',
                restSeconds: 120,
              },
            ],
          },
        ],
      },
      created_at: '2026-09-01T10:00:00Z',
      updated_at: '2026-09-02T10:00:00Z',
    };
  }

  function overviewResponse(
    athlete: TrainerAthlete,
    patch: Partial<TrainerAthleteOverview> = {},
  ): TrainerAthleteOverview {
    return {
      athlete_id: athlete.athlete_id,
      status: athlete.status,
      email: athlete.email,
      display_name: athlete.display_name,
      client_since: athlete.client_since,
      health: {
        weight_measurement_date: null,
        waist_measurement_date: null,
        weight_kg: null,
        body_fat_percent: null,
        muscle_mass_kg: null,
        body_water_percent: null,
        visceral_fat_index: null,
        waist_cm: null,
      },
      recent_training: {
        last_completed: {
          workout_id: 'workout-1',
          routine_id: 'routine-1',
          session_id: 'session-1',
          session_name: 'Fuerza base',
          finished_at: '2026-09-02T10:00:00Z',
        },
        completed_last_7_days: 3,
      },
      active_routines: {
        strength: {
          routine_id: 'strength-routine',
          name: 'Fuerza',
          activated_at: '2026-09-01T10:00:00Z',
        },
        swimming: {
          routine_id: 'swimming-routine',
          name: 'Natación',
          activated_at: '2026-09-01T10:00:00Z',
        },
        running: null,
        cycling: null,
      },
      trainer: {
        last_assignment: null,
      },
      ...patch,
    };
  }
});
