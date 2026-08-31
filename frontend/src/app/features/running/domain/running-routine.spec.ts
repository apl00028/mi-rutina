import {
  runningRoutineDistance,
  runningRoutineSetDistance,
  runningRoutineSetRecoverySeconds,
  runningRoutineSetWorkSeconds,
  type RunningRoutine,
  type RunningRoutineSet
} from './running-routine';


describe('running routine prescription', () => {

  it('calculates prescribed distance', () => {

    const set: RunningRoutineSet = {
      repetitions: 3,
      targetType: 'distance',
      distanceMeters: 1000,
      intensityMode: 'heartRateMax',
      heartRateMaxBpm: 155,
      recoverySeconds: 120
    };

    expect(
      runningRoutineSetDistance(set)
    ).toBe(3000);
  });


  it('calculates prescribed duration work', () => {

    const set: RunningRoutineSet = {
      repetitions: 6,
      targetType: 'duration',
      durationSeconds: 30,
      intensityMode: 'sprint',
      recoverySeconds: 90
    };

    expect(
      runningRoutineSetWorkSeconds(set)
    ).toBe(180);
  });


  it('calculates recovery only between repetitions', () => {

    const set: RunningRoutineSet = {
      repetitions: 6,
      targetType: 'duration',
      durationSeconds: 30,
      intensityMode: 'sprint',
      recoverySeconds: 90
    };

    expect(
      runningRoutineSetRecoverySeconds(set)
    ).toBe(450);
  });


  it('supports a heart-rate ceiling prescription', () => {

    const set: RunningRoutineSet = {
      repetitions: 1,
      targetType: 'duration',
      durationSeconds: 25 * 60,
      intensityMode: 'heartRateMax',
      heartRateMaxBpm: 155
    };

    expect(set.intensityMode)
      .toBe('heartRateMax');

    expect(set.heartRateMaxBpm)
      .toBe(155);

    expect(
      runningRoutineSetWorkSeconds(set)
    ).toBe(1500);
  });


  it('adds only distance-based work to routine distance', () => {

    const routine: RunningRoutine = {
      id: 'run',
      date: '2026-08-31',
      title: 'Carrera controlada',
      objective:
        'Mantener el trabajo aeróbico bajo control',
      estimatedDurationMinutes: 40,
      blocks: [
        {
          id: 'warmup',
          type: 'warmup',
          title: 'Calentamiento',
          sets: [
            {
              repetitions: 1,
              targetType: 'duration',
              durationSeconds: 600,
              intensityMode: 'heartRateMax',
              heartRateMaxBpm: 145
            }
          ]
        },
        {
          id: 'main',
          type: 'main',
          title: 'Principal',
          sets: [
            {
              repetitions: 1,
              targetType: 'distance',
              distanceMeters: 4000,
              intensityMode: 'heartRateMax',
              heartRateMaxBpm: 155
            }
          ]
        },
        {
          id: 'sprints',
          type: 'sprints',
          title: 'Sprints',
          sets: [
            {
              repetitions: 6,
              targetType: 'duration',
              durationSeconds: 30,
              intensityMode: 'sprint',
              recoverySeconds: 90
            }
          ]
        }
      ]
    };

    expect(
      runningRoutineDistance(routine)
    ).toBe(4000);
  });

});
