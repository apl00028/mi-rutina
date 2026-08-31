export type RunningRoutineBlockType =
  | 'warmup'
  | 'main'
  | 'intervals'
  | 'sprints'
  | 'cooldown';

export type RunningTargetType =
  | 'duration'
  | 'distance';

export type RunningIntensityMode =
  | 'heartRateMax'
  | 'heartRateRange'
  | 'rpeRange'
  | 'paceRange'
  | 'sprint'
  | 'free';


export interface RunningRoutineSet {
  repetitions: number;

  targetType: RunningTargetType;

  durationSeconds?: number;
  distanceMeters?: number;

  intensityMode: RunningIntensityMode;

  heartRateMaxBpm?: number;
  heartRateMinBpm?: number;
  heartRateMaxRangeBpm?: number;

  rpeMin?: number;
  rpeMax?: number;

  paceMinSecondsPerKm?: number;
  paceMaxSecondsPerKm?: number;

  recoverySeconds?: number;

  instruction?: string;
}


export interface RunningRoutineBlock {
  id: string;

  type: RunningRoutineBlockType;

  title: string;

  sets: RunningRoutineSet[];
}


export interface RunningRoutine {
  id: string;

  date: string;

  title: string;

  objective: string;

  estimatedDurationMinutes: number;

  blocks: RunningRoutineBlock[];

  notes?: string;
}


export function runningRoutineSetDistance(
  set: RunningRoutineSet
): number {

  if (
    set.targetType !== 'distance'
    || set.distanceMeters == null
  ) {
    return 0;
  }

  return (
    set.repetitions
    * set.distanceMeters
  );
}


export function runningRoutineDistance(
  routine: RunningRoutine
): number {

  return routine.blocks.reduce(
    (total, block) =>
      total
      + block.sets.reduce(
          (blockTotal, set) =>
            blockTotal
            + runningRoutineSetDistance(set),
          0
        ),
    0
  );
}


export function runningRoutineSetWorkSeconds(
  set: RunningRoutineSet
): number {

  if (
    set.targetType !== 'duration'
    || set.durationSeconds == null
  ) {
    return 0;
  }

  return (
    set.repetitions
    * set.durationSeconds
  );
}


export function runningRoutineSetRecoverySeconds(
  set: RunningRoutineSet
): number {

  if (
    set.repetitions <= 1
    || set.recoverySeconds == null
  ) {
    return 0;
  }

  return (
    (set.repetitions - 1)
    * set.recoverySeconds
  );
}
