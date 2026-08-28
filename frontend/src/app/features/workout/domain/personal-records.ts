import {
  calculateEpleyOneRepMax
} from './strength-metrics';

export type PersonalRecordType =
  | 'max-weight'
  | 'estimated-1rm'
  | 'max-reps'
  | 'duration';

export interface PersonalRecord {
  readonly type: PersonalRecordType;
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly value: number;
  readonly previousBest: number;
}

export interface PersonalRecordExercise {
  readonly exerciseId: string;
  readonly name: string;
  readonly recordTypes?: readonly string[] | null;
}

export interface PersonalRecordSet {
  readonly exerciseId: string;
  readonly setIndex: number;
  readonly setType?: 'working' | 'warmup';
  readonly weight?: number | null;
  readonly reps?: number | null;
  readonly durationSeconds?: number | null;
  readonly completedAt?: string | null;
}

export interface PersonalRecordWorkout {
  readonly workoutId: string;
  readonly status: string;
  readonly sets: readonly PersonalRecordSet[];
}

export interface DetectPersonalRecordsInput {
  readonly currentWorkout: PersonalRecordWorkout;
  readonly previousWorkouts:
    readonly PersonalRecordWorkout[];
  readonly exercises:
    readonly PersonalRecordExercise[];
}

type Metric =
  | 'weight'
  | 'estimated-1rm'
  | 'reps'
  | 'duration';

const METRIC_PRECISION:
  Record<Metric, number> = {
    weight: 3,
    'estimated-1rm': 1,
    reps: 0,
    duration: 0
  };


export function detectPersonalRecords(
  input: DetectPersonalRecordsInput
): PersonalRecord[] {
  if (input.currentWorkout.status !== 'finished') {
    return [];
  }

  const previousFinished =
    input.previousWorkouts.filter(
      workout =>
        workout.status === 'finished' &&
        workout.workoutId !==
          input.currentWorkout.workoutId
    );
  const records: PersonalRecord[] = [];

  for (const exercise of input.exercises) {
    const currentSets = completedWorkingSets(
      input.currentWorkout,
      exercise.exerciseId
    );

    if (!currentSets.length) {
      continue;
    }

    const historicalSets =
      previousFinished.flatMap(workout =>
        completedWorkingSets(
          workout,
          exercise.exerciseId
        )
      );

    if (!historicalSets.length) {
      continue;
    }

    const recordTypes = cleanRecordTypes(
      exercise.recordTypes
    );
    const externallyLoaded =
      recordTypes.length === 0 ||
      recordTypes.includes('weight_reps');

    if (externallyLoaded) {
      addRecord(
        records,
        exercise,
        'max-weight',
        bestValue(currentSets, 'weight'),
        bestValue(historicalSets, 'weight'),
        'weight'
      );
      addRecord(
        records,
        exercise,
        'estimated-1rm',
        bestValue(
          currentSets,
          'estimated-1rm'
        ),
        bestValue(
          historicalSets,
          'estimated-1rm'
        ),
        'estimated-1rm'
      );
    }

    if (
      recordTypes.includes(
        'bodyweight_reps'
      ) ||
      recordTypes.includes(
        'guided_repetitions'
      )
    ) {
      addRecord(
        records,
        exercise,
        'max-reps',
        bestValue(currentSets, 'reps'),
        bestValue(historicalSets, 'reps'),
        'reps'
      );
    }

    if (recordTypes.includes('duration')) {
      addRecord(
        records,
        exercise,
        'duration',
        bestValue(currentSets, 'duration'),
        bestValue(historicalSets, 'duration'),
        'duration'
      );
    }
  }

  return records;
}


function completedWorkingSets(
  workout: PersonalRecordWorkout,
  exerciseId: string
): PersonalRecordSet[] {
  return workout.sets.filter(
    set =>
      set.exerciseId === exerciseId &&
      set.setType !== 'warmup' &&
      set.setIndex >= 0 &&
      Boolean(set.completedAt)
  );
}


function cleanRecordTypes(
  recordTypes: readonly string[] | null | undefined
): string[] {
  return [
    ...new Set(
      (recordTypes ?? [])
        .map(type => type.trim())
        .filter(Boolean)
    )
  ];
}


function bestValue(
  sets: readonly PersonalRecordSet[],
  metric: Metric
): number | null {
  const values = sets
    .map(set => metricValue(set, metric))
    .filter(
      (value): value is number =>
        value !== null
    );

  return values.length
    ? Math.max(...values)
    : null;
}


function metricValue(
  set: PersonalRecordSet,
  metric: Metric
): number | null {
  if (metric === 'estimated-1rm') {
    return calculateEpleyOneRepMax(
      set.weight,
      set.reps
    );
  }

  const value =
    metric === 'weight'
      ? set.weight
      : metric === 'reps'
        ? set.reps
        : set.durationSeconds;

  return (
    value !== null &&
    value !== undefined &&
    Number.isFinite(value) &&
    value > 0
  )
    ? value
    : null;
}


function addRecord(
  records: PersonalRecord[],
  exercise: PersonalRecordExercise,
  type: PersonalRecordType,
  currentBest: number | null,
  previousBest: number | null,
  metric: Metric
): void {
  if (
    currentBest === null ||
    previousBest === null
  ) {
    return;
  }

  const precision =
    METRIC_PRECISION[metric];
  const currentComparable =
    roundTo(currentBest, precision);
  const previousComparable =
    roundTo(previousBest, precision);

  if (currentComparable <= previousComparable) {
    return;
  }

  records.push({
    type,
    exerciseId: exercise.exerciseId,
    exerciseName: exercise.name,
    value: currentComparable,
    previousBest: previousComparable
  });
}


function roundTo(
  value: number,
  precision: number
): number {
  const factor = 10 ** precision;

  return Math.round(
    (value + Number.EPSILON) * factor
  ) / factor;
}
