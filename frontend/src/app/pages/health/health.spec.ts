import {
  ComponentFixture,
  TestBed
} from '@angular/core/testing';
import {
  provideHttpClient
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting
} from '@angular/common/http/testing';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { Health } from './health';
import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';


describe('Health', () => {

  let fixture:
    ComponentFixture<Health>;

  let component:
    Health;

  let http:
    HttpTestingController;

  let getAccessToken:
    ReturnType<typeof vi.fn>;


  beforeEach(async () => {
    getAccessToken =
      vi.fn()
        .mockResolvedValue('token-123');

    await TestBed.configureTestingModule({
      imports: [
        Health
      ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: {
            getAccessToken
          }
        }
      ]
    }).compileComponents();

    fixture =
      TestBed.createComponent(Health);

    component =
      fixture.componentInstance;

    http =
      TestBed.inject(
        HttpTestingController
      );
  });


  async function flushPromises() {
    await Promise.resolve();
    await Promise.resolve();
  }


  async function flushHealthLoad(
    options: {
      currentWeightKg?: number;
      changeKg?: number;
      changePercent?: number;
      recentAverageKg?: number;
    } = {}
  ) {
    await flushPromises();

    http.expectOne(
      `${environment.apiUrl}/health/weight-summary`
    ).flush({
      currentWeightKg:
        options.currentWeightKg ?? 75.4,
      latestMeasurementDate:
        '2026-08-24',
      recentAverageKg:
        options.recentAverageKg ?? 75.5,
      previousAverageKg:
        76.0,
      changeKg:
        options.changeKg ?? -0.5,
      changePercent:
        options.changePercent ?? -0.66,
      recentEntries:
        7,
      previousEntries:
        7
    });

    http.expectOne(
      `${environment.apiUrl}/health/weights`
    ).flush([
      {
        id: 'weight-1',
        measurementDate:
          '2026-08-24',
        weightKg:
          options.currentWeightKg ?? 75.4,
        bodyFatPercent:
          18.2,
        source:
          'manual'
      }
    ]);

    http.expectOne(
      `${environment.apiUrl}/health/checkins`
    ).flush([]);

    await flushPromises();
    await fixture.whenStable();
    await flushPromises();
    fixture.detectChanges();
  }


  it(
    'loads health data and renders weight trend',
    async () => {

      fixture.detectChanges();

      await flushHealthLoad();

      expect(
        component.summary()?.currentWeightKg
      ).toBe(75.4);

      expect(
        component.weights()
      ).toHaveLength(1);

      expect(
        component.hasTrend()
      ).toBe(true);

      const text =
        fixture.nativeElement
          .textContent
          ?.replace(/\s+/g, ' ');

      expect(text)
        .toContain('Peso actual');

      expect(text)
        .toContain('75.4 kg');

      expect(text)
        .toContain('Media últimos 7 días');

      expect(text)
        .toContain('75.5 kg');
    }
  );


  it(
    'loads the current weekly check-in into the form',
    async () => {

      fixture.detectChanges();

      await flushPromises();

      http.expectOne(
        `${environment.apiUrl}/health/weight-summary`
      ).flush({
        recentEntries: 0,
        previousEntries: 0
      });

      http.expectOne(
        `${environment.apiUrl}/health/weights`
      ).flush([]);

      http.expectOne(
        `${environment.apiUrl}/health/checkins`
      ).flush([
        {
          id: 'checkin-1',
          weekStart:
            component.checkinWeekStart(),
          fatigue: 3,
          hunger: 2,
          recovery: 4,
          dietAdherencePercent: 90
        }
      ]);

      await flushPromises();
      await fixture.whenStable();
      await flushPromises();
      fixture.detectChanges();

      expect(component.fatigue())
        .toBe('3');

      expect(component.hunger())
        .toBe('2');

      expect(component.recovery())
        .toBe('4');

      expect(component.adherence())
        .toBe('90');
    }
  );


  it(
    'rejects an invalid weight without calling the API',
    async () => {

      component.weightKg.set('5');

      await component.saveWeight();

      expect(component.error())
        .toBe(
          'Introduce un peso válido.'
        );

      expect(getAccessToken)
        .not.toHaveBeenCalled();

      http.verify();
    }
  );


  it(
    'saves a weight and reloads health data',
    async () => {

      component.weightDate.set(
        '2026-08-24'
      );

      component.weightKg.set(
        '75.4'
      );

      component.bodyFatPercent.set(
        '18.2'
      );

      const savePromise =
        component.saveWeight();

      await flushPromises();

      const request =
        http.expectOne(
          (
            `${environment.apiUrl}`
            + '/health/weights/'
            + '2026-08-24'
          )
        );

      expect(request.request.method)
        .toBe('PUT');

      expect(request.request.body)
        .toEqual({
          weightKg: 75.4,
          bodyFatPercent: 18.2,
          source: 'manual'
        });

      request.flush({
        id: 'weight-1',
        measurementDate:
          '2026-08-24',
        weightKg: 75.4,
        bodyFatPercent: 18.2,
        source: 'manual'
      });

      await flushHealthLoad({
        currentWeightKg: 75.4
      });

      await savePromise;

      expect(component.weightKg())
        .toBe('');

      expect(
        component.bodyFatPercent()
      ).toBe('');

      expect(component.message())
        .toBe(
          'Peso registrado correctamente.'
        );
    }
  );


  it(
    'rejects an incomplete weekly check-in',
    async () => {

      component.fatigue.set('3');
      component.hunger.set('');
      component.recovery.set('4');
      component.adherence.set('90');

      await component.saveCheckin();

      expect(component.error())
        .toBe(
          'Completa fatiga, hambre y recuperación del 1 al 5.'
        );

      expect(getAccessToken)
        .not.toHaveBeenCalled();

      http.verify();
    }
  );


  it(
    'saves the weekly check-in and reloads health data',
    async () => {

      component.fatigue.set('3');
      component.hunger.set('2');
      component.recovery.set('4');
      component.adherence.set('90');

      const week =
        component.checkinWeekStart();

      const savePromise =
        component.saveCheckin();

      await flushPromises();

      const request =
        http.expectOne(
          (
            `${environment.apiUrl}`
            + '/health/checkins/'
            + week
          )
        );

      expect(request.request.method)
        .toBe('PUT');

      expect(request.request.body)
        .toEqual({
          fatigue: 3,
          hunger: 2,
          recovery: 4,
          dietAdherencePercent: 90
        });

      request.flush({
        id: 'checkin-1',
        weekStart: week,
        fatigue: 3,
        hunger: 2,
        recovery: 4,
        dietAdherencePercent: 90
      });

      await flushHealthLoad();

      await savePromise;

      expect(component.message())
        .toBe(
          'Check-in semanal guardado.'
        );
    }
  );

});
