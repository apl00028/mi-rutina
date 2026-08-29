import {
  describe,
  expect,
  it
} from 'vitest';

import {
  evaluateSwimmingSessions
} from './swimming-coach-analysis';


describe(
  'evaluateSwimmingSessions',
  () => {

    it(
      'identifies higher work capacity with mixed performance signals',
      () => {

        const result =
          evaluateSwimmingSessions(
            {
              distanceMeters: 1200,
              heartRateAverageBpm: 138,

              detailedAnalysis: {
                activeLengths: 48,
                idleLengths: 10,

                blocks: [],
                blockCount: 11,
                longestBlockMeters: 200,

                averageRestSeconds: 42,
                maxRestSeconds: 62,

                strokes: [
                  {
                    stroke: 'freestyle',
                    lengths: 43,
                    distanceMeters: 1075,
                    swimSeconds: 1846.3,
                    paceSecondsPer100m: 171.8,
                    strokesPerLength: 16.6,
                    averageStrokeRateSpm: 23.7
                  }
                ]
              }
            },

            {
              distanceMeters: 950,
              heartRateAverageBpm: 126,

              detailedAnalysis: {
                activeLengths: 38,
                idleLengths: 11,

                blocks: [],
                blockCount: 11,
                longestBlockMeters: 225,

                averageRestSeconds: 41,
                maxRestSeconds: 81,

                strokes: [
                  {
                    stroke: 'freestyle',
                    lengths: 30,
                    distanceMeters: 750,
                    swimSeconds: 1223.1,
                    paceSecondsPer100m: 163.1,
                    strokesPerLength: 15.8,
                    averageStrokeRateSpm: 23.3
                  }
                ]
              }
            }
          );

        expect(
          result.workCapacity.status
        ).toBe('better');

        expect(
          result.pace.status
        ).toBe('worse');

        expect(
          result.technique.status
        ).toBe('worse');

        expect(
          result.continuity.status
        ).toBe('similar');

        expect(
          result.cardiovascularCost.status
        ).toBe('worse');

        expect(
          result.overallStatus
        ).toBe('mixed');

        expect(
          result.headline
        ).toBe(
          'Mayor capacidad de trabajo, con señales mixtas de rendimiento.'
        );
      }
    );


    it(
      'does not invent conclusions without freestyle data',
      () => {

        const result =
          evaluateSwimmingSessions(
            {
              distanceMeters: 1000,
              heartRateAverageBpm: null,
              detailedAnalysis: null
            },
            {
              distanceMeters: 1000,
              heartRateAverageBpm: null,
              detailedAnalysis: null
            }
          );

        expect(
          result.workCapacity.status
        ).toBe('unclear');

        expect(
          result.pace.status
        ).toBe('unclear');

        expect(
          result.technique.status
        ).toBe('unclear');

        expect(
          result.continuity.status
        ).toBe('unclear');

        expect(
          result.cardiovascularCost.status
        ).toBe('unclear');
      }
    );
  }
);
