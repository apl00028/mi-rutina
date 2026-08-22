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

    http.expectOne(
      `${environment.apiUrl}/health/daily-checkins`
    ).flush([]);

    http.expectOne(
      `${environment.apiUrl}/health/body-measurements`
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
        .toContain('Resumen y tendencias');

      expect(text)
        .toContain('Peso');

      expect(text)
        .toContain('75.4 kg');

      expect(text)
        .toContain('75.5 kg');

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
          recovery: 4,
          motivation: 4,
          waistCm: 88
        }
      ]);

      http.expectOne(
        `${environment.apiUrl}/health/daily-checkins`
      ).flush([
        {
          id: 'daily-1',
          measurementDate:
            component.dailyDate(),
          hunger: 2,
          dietAdherencePercent: 90
        }
      ]);

      http.expectOne(
        `${environment.apiUrl}/health/body-measurements`
      ).flush([]);

      await flushPromises();
      await fixture.whenStable();
      await flushPromises();
      fixture.detectChanges();

      expect(component.fatigue())
        .toBe('3');

      expect(component.recovery())
        .toBe('4');

      expect(component.motivation())
        .toBe('4');

      expect(component.waistCm())
        .toBe('88');

      expect(component.dailyHunger())
        .toBe('2');

      expect(component.dailyAdherence())
        .toBe('90');
    }
  );


  it(
    'calculates body composition and waist trends',
    () => {

      component.weights.set([
        {
          id: 'w1',
          measurementDate: '2026-08-22',
          weightKg: 75,
          bodyFatPercent: 18,
          muscleMassKg: 60,
          source: 'manual'
        },
        {
          id: 'w2',
          measurementDate: '2026-08-21',
          weightKg: 75,
          bodyFatPercent: 18.2,
          muscleMassKg: 60.2,
          source: 'manual'
        },
        {
          id: 'w3',
          measurementDate: '2026-08-15',
          weightKg: 76,
          bodyFatPercent: 19,
          muscleMassKg: 59.5,
          source: 'manual'
        },
        {
          id: 'w4',
          measurementDate: '2026-08-14',
          weightKg: 76,
          bodyFatPercent: 19.2,
          muscleMassKg: 59.7,
          source: 'manual'
        }
      ]);

      component.checkins.set([
        {
          id: 'c1',
          weekStart: '2026-08-17',
          waistCm: 88
        },
        {
          id: 'c2',
          weekStart: '2026-08-10',
          waistCm: 89.5
        }
      ]);

      expect(component.latestBodyFat())
        .toBe(18);

      expect(component.bodyFatTrend())
        .toBeCloseTo(-1);

      expect(component.latestMuscleMass())
        .toBe(60);

      expect(component.muscleMassTrend())
        .toBeCloseTo(0.5);

      expect(component.latestWaist())
        .toBe(88);

      expect(component.waistTrend())
        .toBeCloseTo(-1.5);
    }
  );


  it(
    'builds chart series for health metrics',
    () => {

      component.weights.set([
        {
          id: 'w1',
          measurementDate: '2026-08-01',
          weightKg: 76,
          bodyFatPercent: 19,
          source: 'manual'
        },
        {
          id: 'w2',
          measurementDate: '2026-08-22',
          weightKg: 75,
          bodyFatPercent: 18,
          source: 'manual'
        }
      ]);

      component.bodyMeasurements.set([
        {
          id: 'b1',
          measurementDate: '2026-08-01',
          waistCm: 90
        },
        {
          id: 'b2',
          measurementDate: '2026-08-22',
          waistCm: 88
        }
      ]);

      component.chartMetric.set('weight');

      expect(component.chartSeries())
        .toEqual([
          {
            date: '2026-08-01',
            value: 76
          },
          {
            date: '2026-08-22',
            value: 75
          }
        ]);

      component.chartMetric.set('waist');

      expect(component.chartSeries())
        .toEqual([
          {
            date: '2026-08-01',
            value: 90
          },
          {
            date: '2026-08-22',
            value: 88
          }
        ]);

      expect(component.chartUnit())
        .toBe('cm');
    }
  );


  it(
    'returns the correct trend direction',
    () => {
      expect(component.trendArrow(-0.5))
        .toBe('↓');

      expect(component.trendArrow(0.5))
        .toBe('↑');

      expect(component.trendArrow(0.01))
        .toBe('→');
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
    'saves body measurements and reloads health data',
    async () => {

      component.bodyMeasurementDate.set(
        '2026-08-24'
      );

      component.waistMeasurementCm.set('88');
      component.leftArmCm.set('36');
      component.rightArmCm.set('36.5');
      component.leftThighCm.set('58');
      component.rightThighCm.set('58.5');

      const savePromise =
        component.saveBodyMeasurement();

      await flushPromises();

      const request =
        http.expectOne(
          (
            `${environment.apiUrl}`
            + '/health/body-measurements/'
            + '2026-08-24'
          )
        );

      expect(request.request.method)
        .toBe('PUT');

      expect(request.request.body)
        .toEqual({
          waistCm: 88,
          leftArmCm: 36,
          rightArmCm: 36.5,
          leftThighCm: 58,
          rightThighCm: 58.5
        });

      request.flush({
        id: 'body-1',
        measurementDate:
          '2026-08-24',
        waistCm: 88,
        leftArmCm: 36,
        rightArmCm: 36.5,
        leftThighCm: 58,
        rightThighCm: 58.5
      });

      await flushHealthLoad();

      await savePromise;

      expect(
        component.waistMeasurementCm()
      ).toBe('');

      expect(component.leftArmCm())
        .toBe('');

      expect(component.rightArmCm())
        .toBe('');

      expect(component.message())
        .toBe(
          'Medidas corporales guardadas.'
        );
    }
  );


  it(
    'rejects an invalid daily check-in',
    async () => {

      component.dailyHunger.set('');
      component.dailyAdherence.set('90');

      await component.saveDailyCheckin();

      expect(component.error())
        .toBe(
          'Selecciona el hambre del 1 al 5.'
        );

      expect(getAccessToken)
        .not.toHaveBeenCalled();

      http.verify();
    }
  );


  it(
    'saves the daily check-in and reloads health data',
    async () => {

      component.dailyDate.set(
        '2026-08-24'
      );

      component.dailyHunger.set('4');
      component.dailyAdherence.set('90');

      const savePromise =
        component.saveDailyCheckin();

      await flushPromises();

      const request =
        http.expectOne(
          (
            `${environment.apiUrl}`
            + '/health/daily-checkins/'
            + '2026-08-24'
          )
        );

      expect(request.request.method)
        .toBe('PUT');

      expect(request.request.body)
        .toEqual({
          hunger: 4,
          dietAdherencePercent: 90
        });

      request.flush({
        id: 'daily-1',
        measurementDate: '2026-08-24',
        hunger: 4,
        dietAdherencePercent: 90
      });

      await flushHealthLoad();

      await savePromise;

      expect(component.message())
        .toBe(
          'Estado diario guardado.'
        );
    }
  );


  it(
    'rejects an incomplete weekly check-in',
    async () => {

      component.fatigue.set('3');
      component.recovery.set('');
      component.motivation.set('4');

      await component.saveCheckin();

      expect(component.error())
        .toBe(
          'Completa fatiga, recuperación y motivación del 1 al 5.'
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
      component.recovery.set('4');
      component.motivation.set('4');
      component.waistCm.set('88');

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
          recovery: 4,
          motivation: 4,
          waistCm: 88
        });

      request.flush({
        id: 'checkin-1',
        weekStart: week,
        fatigue: 3,
        recovery: 4,
        motivation: 4,
        waistCm: 88
      });

      await flushHealthLoad();

      await savePromise;

      expect(component.message())
        .toBe(
          'Estado semanal guardado.'
        );
    }
  );

});
