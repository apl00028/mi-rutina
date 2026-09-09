import { signal } from '@angular/core';
/**
 * @vitest-environment jsdom
 */

import {
  HttpClient
} from '@angular/common/http';

import {
  Router
} from '@angular/router';

import {
  TestBed
} from '@angular/core/testing';

import {
  beforeEach,
  describe,
  expect,
  it
} from 'vitest';

import {
  AuthService
} from '../../core/auth.service';

import {
  SettingsService
} from '../../core/settings.service';

import {
  Home
} from './home';


describe('Home', () => {

  beforeEach(async () => {

    localStorage.removeItem(
      'aptus-settings-v1'
    );

    document.documentElement.className = '';

    await TestBed.configureTestingModule({

      imports: [
        Home
      ],

      providers: [

        {
          provide: AuthService,
          useValue: {
            user: signal(null),
            getAccessToken:
              async () => null
          }
        },

        {
          provide: HttpClient,
          useValue: {}
        },

        {
          provide: Router,
          useValue: {
            navigateByUrl:
              async () => true
          }
        }

      ]

    }).compileComponents();
  });


  it(
    'renders the mobile home dashboard',
    async () => {

      TestBed.inject(
        SettingsService
      );

      const fixture =
        TestBed.createComponent(
          Home
        );

      fixture.detectChanges();

      await fixture.whenStable();

      fixture.detectChanges();

      const text =
        (
          fixture.nativeElement
            .textContent ?? ''
        ).replace(/\s+/g, ' ');

      expect(text).toContain(
        'Tu día en Aptus'
      );

      expect(text).toContain(
        'Entrenamiento'
      );

      expect(text).toContain(
        'Nutrición'
      );

      expect(text).toContain(
        'Salud'
      );

      expect(
        document.documentElement
          .classList
          .contains(
            'aptus-theme-system'
          )
      ).toBe(true);
    }
  );
});

// Exercise the existing endpoints and the shared calendar together.
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { WorkoutOutboxService } from '../../core/workout-outbox.service';
import { PullRefresh } from '../../core/pull-refresh.component';
import { By } from '@angular/platform-browser';
import { localDateKey } from '../../features/training/components/activity-calendar/activity-calendar';

describe('Home activity history', () => {
  const api = environment.apiUrl;
  let http: HttpTestingController;
  let fixture: ReturnType<typeof TestBed.createComponent<Home>>;
  const today = new Date();
  const key = localDateKey(today);
  const timestamp = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10).toISOString();
  const earlier = new Date(today.getFullYear(), today.getMonth() - 1, 3, 10);
  const oldKey = localDateKey(earlier);
  let snapshots: any[];
  function workout(id: string, routineId: string, at = timestamp) {
    return { workoutId: id, routineId, sessionId: 's', status: 'finished', finishedAt: at,
      startedAt: new Date(Date.parse(at) - 600000).toISOString(),
      sets: [{ setId: `${id}-set`, exerciseId: 'plank', setIndex: 0, durationSeconds: 75, rpe: 8, rir: 2, completedAt: at }] };
  }
  const routines = [
    { routineId: 'strength', discipline: 'strength', sessions: [{ sessionId: 's', name: 'Estabilidad', exercises: [{ exerciseId: 'plank', name: 'Plancha', recordTypes: ['duration'] }] }] },
    { routineId: 'bike', discipline: 'cycling', sessions: [{ sessionId: 's', name: 'Bicicleta suave', exercises: [] }] },
  ];
  beforeEach(async () => {
    snapshots = [];
    await TestBed.configureTestingModule({ imports: [Home], providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: { user: signal({ id: 'own' }), getAccessToken: async () => 'token' } },
      { provide: Router, useValue: { navigateByUrl: async () => true } },
      { provide: WorkoutOutboxService, useValue: { reconciledSnapshots: () => snapshots } },
    ] }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  async function settle() {
    for (let index = 0; index < 25; index++) await Promise.resolve();
    fixture.detectChanges();
  }
  function text() { return fixture.nativeElement.textContent.replace(/\s+/g, ' '); }
  async function respond(failSwimming = false, name = 'Estabilidad', failRoutines = false) {
    await settle();
    http.expectOne(`${api}/nutrition/plans`).flush([]);
    http.expectOne(`${api}/health/weight-summary`).flush({});
    http.expectOne(`${api}/workouts`).flush([
      workout('strength-1', 'strength'), workout('bike-1', 'bike'), workout('old', 'strength', earlier.toISOString()),
      { ...workout('pending', 'strength'), status: 'in_progress' },
    ]);
    const routineRequest = http.expectOne(`${api}/routines`);
    if (failRoutines) routineRequest.flush({}, { status: 503, statusText: 'Unavailable' });
    else routineRequest.flush(routines.map(row => row.discipline === 'strength'
      ? { ...row, sessions: [{ ...row.sessions[0], name }] } : row));
    http.expectOne(`${api}/running/sessions`).flush([{ id: 'run', source: 'health_connect', source_package: 'garmin', source_record_id: 'run',
      started_at: timestamp, ended_at: new Date(Date.parse(timestamp) + 600000).toISOString(),
      data: { schema_version: 1, exercise_type: 33, distance_meters: 2000, speed_average_meters_per_second: 3, heart_rate_average_bpm: 140 } }]);
    const swimming = http.expectOne(`${api}/swimming/sessions`);
    if (failSwimming) swimming.flush({}, { status: 503, statusText: 'Unavailable' });
    else swimming.flush([{ start_time: timestamp, total_timer_time_seconds: 600, distance_meters: 500, average_pace_seconds_per_100m: 120,
      lengths: [{ distance_meters: 25, duration_seconds: 30, total_strokes: 12 }] }]);
    await settle();
  }
  async function start(failSwimming = false) {
    fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    await respond(failSwimming);
  }
  function day(date: string) {
    const component = fixture.componentInstance;
    component.selectDay({ dateKey: date, dayNumber: Number(date.slice(-2)), inMonth: true, events: [], selected: false });
    fixture.detectChanges();
  }
  function open(title: string) {
    const button = (Array.from(fixture.nativeElement.querySelectorAll('.activity-row')) as HTMLButtonElement[])
      .find(button => button.textContent?.includes(title))!;
    expect(button).toBeTruthy();
    button.click(); fixture.detectChanges();
  }
  function back() { fixture.nativeElement.querySelector('.activity-back').click(); fixture.detectChanges(); }

  it('selects today and renders all four disciplines before the training card', async () => {
    await start();
    expect(fixture.componentInstance.selectedDate()).toBe(key);
    expect(fixture.nativeElement.querySelectorAll('.activity-row')).toHaveLength(4);
    expect(fixture.nativeElement.querySelectorAll('.calendar-day.selected .calendar-marks span')).toHaveLength(4);
    const order = Array.from(fixture.nativeElement.querySelectorAll('.home-header, .activity-section, .training-card, .home-grid')) as HTMLElement[];
    expect(order.map(item => item.className)).toEqual(['home-header', 'activity-section', 'home-card training-card', 'home-grid']);
    expect(text()).not.toContain('pending');
  });
  it('opens actual force, running, swimming and cycling details without extra requests or invented metrics', async () => {
    await start();
    open('Estabilidad');
    expect(text()).toContain('Plancha');
    expect(text()).toContain('1:15 · RPE 8');
    expect(fixture.nativeElement.querySelector('.activity-detail').textContent).not.toContain('RIR 2');
    back(); open('Carrera');
    expect(text()).toContain('2000 m');
    expect(text()).toContain('5:33/km');
    expect(text()).toContain('140 ppm');
    back(); open('Natación');
    expect(text()).toContain('500 m');
    expect(text()).toContain('2:00/100 m');
    expect(text()).toContain('Largo 1');
    back(); open('Bicicleta suave');
    const detail = fixture.nativeElement.querySelector('.activity-detail').textContent;
    expect(detail).toContain('Ciclismo');
    expect(detail).toContain('Tiempo transcurrido');
    expect(detail).not.toContain('Distancia');
    http.expectNone(() => true);
  });
  it('changes days and months from cached history without fetching again', async () => {
    await start();
    const other = `${key.slice(0, 8)}${today.getDate() === 1 ? '02' : '01'}`;
    day(other);
    expect(text()).toContain('No hay actividades disponibles para este día');
    fixture.nativeElement.querySelector('[aria-label="Mes anterior"]').click(); fixture.detectChanges();
    expect(fixture.componentInstance.calendarMonth()).toBe(oldKey.slice(0, 7));
    const third = (Array.from(fixture.nativeElement.querySelectorAll('.calendar-day:not(.outside-month)')) as HTMLButtonElement[])
      .find(button => button.querySelector('span')?.textContent?.trim() === '3')!;
    third.click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.activity-row')).toHaveLength(1);
    fixture.nativeElement.querySelector('[aria-label="Mes siguiente"]').click(); fixture.detectChanges();
    expect(fixture.componentInstance.selectedDate()).toBe(key);
    await fixture.componentInstance.history.load();
    http.expectNone(() => true);
  });
  it('keeps other disciplines visible on partial failure and refreshes the selected month through pull-to-refresh', async () => {
    await start(true);
    expect(text()).toContain('No se pudo cargar natación');
    expect(fixture.nativeElement.querySelectorAll('.activity-row')).toHaveLength(3);
    day(oldKey); open('Estabilidad');
    const refresh = fixture.debugElement.query(By.directive(PullRefresh)).componentInstance as PullRefresh;
    const pending = refresh.refresh();
    await respond(false, 'Estabilidad actualizada');
    await pending;
    expect(fixture.componentInstance.calendarMonth()).toBe(oldKey.slice(0, 7));
    expect(fixture.componentInstance.selectedDate()).toBe(oldKey);
    expect(text()).toContain('Estabilidad actualizada');
    expect(text()).not.toContain('No se pudo cargar natación');
    day(key);
    expect(fixture.nativeElement.querySelectorAll('.activity-row')).toHaveLength(4);
  });
  it('lets a local finished snapshot override stale remote state without duplicating it', async () => {
    snapshots = [workout('pending', 'strength')];
    await start();
    expect(fixture.componentInstance.hasActiveWorkout()).toBe(false);
    expect(fixture.nativeElement.querySelectorAll('.activity-row')).toHaveLength(5);
    expect(fixture.componentInstance.history.workouts().filter(row => row.workoutId === 'pending')).toHaveLength(1);
  });
  it('retains workouts and other sources when routine metadata fails without inventing a discipline', async () => {
    fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    await respond(false, 'unused', true);
    expect(text()).toContain('No se pudo cargar nombres y disciplinas');
    expect(fixture.componentInstance.dayActivities().filter(row => row.discipline === 'unknown')).toHaveLength(2);
    expect(fixture.nativeElement.querySelectorAll('.activity-row')).toHaveLength(4);
    open('Sesión registrada');
    expect(text()).toContain('Sin disciplina disponible');
    expect(text()).toContain('1:15 · RPE 8');
  });

});
