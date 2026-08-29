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
      'compares the two known Garmin swimming sessions',
      () => {

        const result =
          compareSwimmingSessions(
            {
              distanceMeters: 1200,
              durationSeconds: 2439.2,
              elapsedPaceSecondsPer100m:
                203.27,
              strokesPerLength: 15.79,
              metersPerStroke: 1.58,
              heartRateAverageBpm: 138
            },
            {
              distanceMeters: 950,
              durationSeconds: 2097.6,
              elapsedPaceSecondsPer100m:
                220.8,
              strokesPerLength: 16.03,
              metersPerStroke: 1.56,
              heartRateAverageBpm: 126
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
          -17.53,
          2
        );

        expect(
          result.summary
        ).toContain(
          'Mayor distancia total.'
        );

        expect(
          result.summary
        ).toContain(
          'Ritmo total más rápido.'
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
          'Mayor frecuencia cardiaca media.'
        );

        expect(
          result.integratedSummary
        ).toBe(
          'Mayor volumen, ritmo total más rápido, eficiencia de brazada estable, mayor coste cardiovascular.'
        );

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
              strokesPerLength: null,
              metersPerStroke: null,
              heartRateAverageBpm: null
            },
            {
              distanceMeters: 1000,
              durationSeconds: 1000,
              elapsedPaceSecondsPer100m:
                200,
              strokesPerLength: 16,
              metersPerStroke: 1.5,
              heartRateAverageBpm: 130
            }
          );

        expect(
          result.distance.absoluteChange
        ).toBeNull();

        expect(
          result.pace.absoluteChange
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
