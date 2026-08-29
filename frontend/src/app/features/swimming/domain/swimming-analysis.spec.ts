import {
  describe,
  expect,
  it
} from 'vitest';

import {
  compareSwimmingSessions
} from './swimming-analysis';


describe(
  'compareSwimmingSessions',
  () => {

    it(
      'compares enriched Garmin swimming sessions',
      () => {

        const result =
          compareSwimmingSessions(
            {
              distanceMeters: 1200,
              durationSeconds: 2439.2,

              elapsedPaceSecondsPer100m:
                203.27,

              averagePaceSecondsPer100m:
                168,

              restTimeSeconds:
                423.2,

              strokesPerLength:
                15.79,

              metersPerStroke:
                1.58,

              averageStrokeRateSpm:
                23,

              heartRateAverageBpm:
                138
            },
            {
              distanceMeters: 950,
              durationSeconds: 2097.6,

              elapsedPaceSecondsPer100m:
                220.8,

              averagePaceSecondsPer100m:
                173,

              restTimeSeconds:
                451.6,

              strokesPerLength:
                16.03,

              metersPerStroke:
                1.56,

              averageStrokeRateSpm:
                22,

              heartRateAverageBpm:
                126
            }
          );


        expect(
          result.distance.percentChange
        ).toBeCloseTo(
          26.3158,
          3
        );


        expect(
          result.pace.absoluteChange
        ).toBeCloseTo(
          -5,
          2
        );


        expect(
          result.totalPace.absoluteChange
        ).toBeCloseTo(
          -17.53,
          2
        );


        expect(
          result.restPercent.current
        ).toBeCloseTo(
          17.35,
          1
        );

        expect(
          result.restPercent.previous
        ).toBeCloseTo(
          21.53,
          1
        );


        expect(
          result.strokeRate.absoluteChange
        ).toBe(
          1
        );


        expect(
          result.summary
        ).toContain(
          'Mayor distancia total.'
        );

        expect(
          result.summary
        ).toContain(
          'Ritmo medio más rápido.'
        );

        expect(
          result.summary
        ).toContain(
          'Menor proporción de descanso.'
        );

        expect(
          result.summary
        ).toContain(
          'Brazadas por largo estables.'
        );

        expect(
          result.summary
        ).toContain(
          'Distancia por brazada estable.'
        );

        expect(
          result.summary
        ).toContain(
          'Mayor frecuencia de brazada.'
        );

        expect(
          result.summary
        ).toContain(
          'Mayor frecuencia cardiaca media.'
        );


        expect(
          result.integratedSummary
        ).toBe(
          'Mayor volumen, ritmo medio más rápido, menor proporción de descanso, eficiencia de brazada estable, mayor frecuencia de brazada, mayor coste cardiovascular.'
        );
      }
    );


    it(
      'does not substitute total pace for missing FIT pace',
      () => {

        const result =
          compareSwimmingSessions(
            {
              distanceMeters: 1000,
              durationSeconds: 2000,

              elapsedPaceSecondsPer100m:
                200,

              averagePaceSecondsPer100m:
                null,

              restTimeSeconds:
                null,

              strokesPerLength:
                null,

              metersPerStroke:
                null,

              averageStrokeRateSpm:
                null,

              heartRateAverageBpm:
                null
            },
            {
              distanceMeters: 1000,
              durationSeconds: 1900,

              elapsedPaceSecondsPer100m:
                190,

              averagePaceSecondsPer100m:
                null,

              restTimeSeconds:
                null,

              strokesPerLength:
                null,

              metersPerStroke:
                null,

              averageStrokeRateSpm:
                null,

              heartRateAverageBpm:
                null
            }
          );

        expect(
          result.pace.absoluteChange
        ).toBeNull();

        expect(
          result.totalPace.absoluteChange
        ).toBe(
          10
        );

        expect(
          result.summary
        ).toEqual([]);
      }
    );


    it(
      'does not invent comparisons when metrics are missing',
      () => {

        const result =
          compareSwimmingSessions(
            {
              distanceMeters: null,
              durationSeconds: 1000,

              elapsedPaceSecondsPer100m:
                null,

              strokesPerLength:
                null,

              metersPerStroke:
                null,

              heartRateAverageBpm:
                null
            },
            {
              distanceMeters: 1000,
              durationSeconds: 1000,

              elapsedPaceSecondsPer100m:
                200,

              strokesPerLength:
                16,

              metersPerStroke:
                1.5,

              heartRateAverageBpm:
                130
            }
          );

        expect(
          result.distance.absoluteChange
        ).toBeNull();

        expect(
          result.pace.absoluteChange
        ).toBeNull();

        expect(
          result.restPercent.absoluteChange
        ).toBeNull();

        expect(
          result.strokeRate.absoluteChange
        ).toBeNull();

        expect(
          result.summary
        ).toEqual([]);

        expect(
          result.integratedSummary
        ).toBeNull();
      }
    );
  }
);
