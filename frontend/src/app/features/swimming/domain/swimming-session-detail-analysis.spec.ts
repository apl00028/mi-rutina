import {
  describe,
  expect,
  it
} from 'vitest';

import {
  analyseSwimmingLengths
} from './swimming-session-detail-analysis';


describe(
  'analyseSwimmingLengths',
  () => {

    it(
      'reconstructs swimming blocks separated by rests',
      () => {

        const result =
          analyseSwimmingLengths(
            [
              {
                length_type: 'active',
                swim_stroke: 'freestyle',
                duration_seconds: 40,
                total_strokes: 16,
                average_stroke_rate_spm: 24
              },
              {
                length_type: 'active',
                swim_stroke: 'freestyle',
                duration_seconds: 42,
                total_strokes: 17,
                average_stroke_rate_spm: 24
              },
              {
                length_type: 'idle',
                duration_seconds: 30
              },
              {
                length_type: 'active',
                swim_stroke: 'freestyle',
                duration_seconds: 41,
                total_strokes: 16,
                average_stroke_rate_spm: 25
              }
            ],
            25
          );

        expect(
          result.blockCount
        ).toBe(2);

        expect(
          result.blocks[0]
            .distanceMeters
        ).toBe(50);

        expect(
          result.blocks[1]
            .distanceMeters
        ).toBe(25);

        expect(
          result.blocks[1]
            .restBeforeSeconds
        ).toBe(30);

        expect(
          result.longestBlockMeters
        ).toBe(50);
      }
    );


    it(
      'summarises each stroke separately',
      () => {

        const result =
          analyseSwimmingLengths(
            [
              {
                length_type: 'active',
                swim_stroke: 'freestyle',
                duration_seconds: 40,
                total_strokes: 16,
                average_stroke_rate_spm: 24
              },
              {
                length_type: 'active',
                swim_stroke: 'freestyle',
                duration_seconds: 45,
                total_strokes: 18,
                average_stroke_rate_spm: 22
              },
              {
                length_type: 'active',
                swim_stroke: 'breaststroke',
                duration_seconds: 50,
                total_strokes: 12,
                average_stroke_rate_spm: 18
              }
            ],
            25
          );

        const freestyle =
          result.strokes.find(
            item =>
              item.stroke ===
              'freestyle'
          );

        expect(
          freestyle
        ).toBeDefined();

        expect(
          freestyle?.distanceMeters
        ).toBe(50);

        expect(
          freestyle?.strokesPerLength
        ).toBe(17);

        expect(
          freestyle?.averageStrokeRateSpm
        ).toBe(23);

        expect(
          freestyle?.paceSecondsPer100m
        ).toBe(170);
      }
    );


    it(
      'calculates rest statistics',
      () => {

        const result =
          analyseSwimmingLengths(
            [
              {
                length_type: 'active',
                duration_seconds: 40
              },
              {
                length_type: 'idle',
                duration_seconds: 20
              },
              {
                length_type: 'active',
                duration_seconds: 40
              },
              {
                length_type: 'idle',
                duration_seconds: 40
              },
              {
                length_type: 'active',
                duration_seconds: 40
              }
            ]
          );

        expect(
          result.averageRestSeconds
        ).toBe(30);

        expect(
          result.maxRestSeconds
        ).toBe(40);
      }
    );


    it(
      'does not invent missing stroke metrics',
      () => {

        const result =
          analyseSwimmingLengths(
            [
              {
                length_type: 'active',
                swim_stroke: 'freestyle',
                duration_seconds: 40
              }
            ]
          );

        expect(
          result.strokes[0]
            .strokesPerLength
        ).toBeNull();

        expect(
          result.strokes[0]
            .averageStrokeRateSpm
        ).toBeNull();
      }
    );
  }
);
