import {
  describe,
  expect,
  it
} from 'vitest';

import {
  detectPersonalRecords,
  type PersonalRecordExercise,
  type PersonalRecordSet,
  type PersonalRecordWorkout
} from './personal-records';

const loadedExercise: PersonalRecordExercise = {
  exerciseId: 'bench',
  name: 'Press banca',
  recordTypes: ['weight_reps']
};


function set(
  values: Partial<PersonalRecordSet> = {}
): PersonalRecordSet {
  return {
    exerciseId: 'bench',
    setIndex: 0,
    weight: 75,
    reps: 8,
    completedAt: '2026-08-28T10:00:00Z',
    ...values
  };
}


function workout(
  workoutId: string,
  sets: PersonalRecordSet[],
  status = 'finished'
): PersonalRecordWorkout {
  return {
    workoutId,
    status,
    sets
  };
}


function detect(
  currentSets: PersonalRecordSet[],
  previousWorkouts: PersonalRecordWorkout[],
  exercises: PersonalRecordExercise[] = [
    loadedExercise
  ]
) {
  return detectPersonalRecords({
    currentWorkout: workout(
      'current',
      currentSets
    ),
    previousWorkouts,
    exercises
  });
}


describe('detectPersonalRecords', () => {
  it('detects a higher max weight but not an equal max weight', () => {
    const previous = workout(
      'previous',
      [set({ weight: 75, reps: 8 })]
    );

    expect(
      detect(
        [set({ weight: 77.5, reps: 8 })],
        [previous]
      ).map(record => record.type)
    ).toContain('max-weight');

    expect(
      detect(
        [set({ weight: 75, reps: 8 })],
        [previous]
      )
    ).toEqual([]);
  });


  it('detects a higher e1RM with a lower weight', () => {
    const records = detect(
      [set({ weight: 70, reps: 12 })],
      [
        workout(
          'previous',
          [set({ weight: 75, reps: 5 })]
        )
      ]
    );

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      type: 'estimated-1rm',
      value: 98,
      previousBest: 87.5
    });
  });


  it('ignores warmups and incomplete current sets', () => {
    const previous = workout(
      'previous',
      [set({ weight: 75 })]
    );

    expect(
      detect(
        [
          set({
            setIndex: -1,
            setType: 'warmup',
            weight: 100
          }),
          set({
            setIndex: 0,
            weight: 100,
            completedAt: null
          })
        ],
        [previous]
      )
    ).toEqual([]);
  });


  it('ignores unfinished historical workouts', () => {
    expect(
      detect(
        [set({ weight: 80 })],
        [
          workout(
            'unfinished',
            [set({ weight: 70 })],
            'in_progress'
          )
        ]
      )
    ).toEqual([]);
  });


  it('excludes the current workout from its own baseline', () => {
    const current = workout(
      'current',
      [set({ weight: 80 })]
    );

    expect(
      detectPersonalRecords({
        currentWorkout: current,
        previousWorkouts: [current],
        exercises: [loadedExercise]
      })
    ).toEqual([]);
  });


  it('uses a first exercise exposure only as its baseline', () => {
    expect(
      detect([set({ weight: 80 })], [])
    ).toEqual([]);
  });


  it('detects reps-only and duration records', () => {
    const exercises: PersonalRecordExercise[] = [
      {
        exerciseId: 'pull-up',
        name: 'Dominadas',
        recordTypes: ['bodyweight_reps']
      },
      {
        exerciseId: 'plank',
        name: 'Plancha',
        recordTypes: ['duration']
      }
    ];
    const records = detect(
      [
        set({
          exerciseId: 'pull-up',
          reps: 12,
          weight: null
        }),
        set({
          exerciseId: 'plank',
          reps: null,
          weight: null,
          durationSeconds: 75
        })
      ],
      [
        workout(
          'previous',
          [
            set({
              exerciseId: 'pull-up',
              reps: 10,
              weight: null
            }),
            set({
              exerciseId: 'plank',
              reps: null,
              weight: null,
              durationSeconds: 60
            })
          ]
        )
      ],
      exercises
    );

    expect(records).toMatchObject([
      {
        type: 'max-reps',
        value: 12
      },
      {
        type: 'duration',
        value: 75
      }
    ]);
  });


  it('counts one unilateral persisted set only once', () => {
    const records = detect(
      [set({ weight: 80, reps: 8 })],
      [
        workout(
          'previous',
          [set({ weight: 75, reps: 8 })]
        )
      ]
    );

    expect(
      records.filter(
        record =>
          record.type === 'max-weight'
      )
    ).toHaveLength(1);
  });


  it('does not report floating-point-equivalent e1RM values', () => {
    const previousWeight =
      74.9189189189;

    expect(
      detect(
        [set({
          weight:
            previousWeight + 0.00000001,
          reps: 7
        })],
        [
          workout(
            'previous',
            [set({
              weight: previousWeight,
              reps: 7
            })]
          )
        ]
      )
    ).toEqual([]);
  });


  it('does not invent records for unsupported measurement models', () => {
    expect(
      detect(
        [set({ reps: 12 })],
        [
          workout(
            'previous',
            [set({ reps: 10 })]
          )
        ],
        [{
          exerciseId: 'bench',
          name: 'Dominadas asistidas',
          recordTypes: ['assisted_reps']
        }]
      )
    ).toEqual([]);
  });
});
