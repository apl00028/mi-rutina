import {
  describe,
  expect,
  it
} from 'vitest';

import {
  swimmingRoutineBlockDistance,
  swimmingRoutineDistance,
  swimmingRoutineSetDistance
} from './swimming-routine';

import type {
  SwimmingRoutine
} from './swimming-routine';


describe(
  'swimming routine',
  () => {

    const routine: SwimmingRoutine = {
      id: 'test-routine',

      date: '2026-08-29',

      title: 'Técnica y continuidad',
      objective:
        'Mejorar respiración y continuidad de crol.',

      poolLengthMeters: 25,

      estimatedDurationMinutes: 45,

      blocks: [
        {
          id: 'warmup',
          type: 'warmup',
          title: 'Calentamiento',

          sets: [
            {
              repetitions: 1,
              distanceMeters: 200,

              stroke: 'freestyle',
              workType: 'swim',
              intensity: 'easy',

              restSeconds: 0
            }
          ]
        },

        {
          id: 'technique',
          type: 'technique',
          title: 'Técnica',

          sets: [
            {
              repetitions: 4,
              distanceMeters: 25,

              stroke: 'freestyle',
              workType: 'technique',
              intensity: 'easy',

              restSeconds: 20
            },

            {
              repetitions: 4,
              distanceMeters: 25,

              stroke: 'freestyle',
              workType: 'technique',
              intensity: 'easy',

              restSeconds: 20
            }
          ]
        }
      ],

      technicalFocus: [
        'Respiración relajada.',
        'Mantener alineación.'
      ]
    };


    it(
      'calculates set distance',
      () => {

        expect(
          swimmingRoutineSetDistance(
            routine.blocks[1].sets[0]
          )
        ).toBe(100);
      }
    );


    it(
      'calculates block distance',
      () => {

        expect(
          swimmingRoutineBlockDistance(
            routine.blocks[1]
          )
        ).toBe(200);
      }
    );


    it(
      'calculates total routine distance',
      () => {

        expect(
          swimmingRoutineDistance(
            routine
          )
        ).toBe(400);
      }
    );
  }
);
