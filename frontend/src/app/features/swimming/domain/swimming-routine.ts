export type SwimmingRoutineBlockType =
  | 'warmup'
  | 'technique'
  | 'main'
  | 'cooldown';

export type SwimmingStroke =
  | 'freestyle'
  | 'backstroke'
  | 'breaststroke'
  | 'mixed';

export type SwimmingWorkType =
  | 'swim'
  | 'technique'
  | 'kick'
  | 'pull';

export type SwimmingIntensity =
  | 'easy'
  | 'controlled'
  | 'strong';


export interface SwimmingRoutineSet {
  repetitions: number;
  distanceMeters: number;

  stroke: SwimmingStroke;
  workType: SwimmingWorkType;
  intensity: SwimmingIntensity;

  restSeconds: number;

  instruction?: string;
}


export interface SwimmingRoutineBlock {
  id: string;
  type: SwimmingRoutineBlockType;
  title: string;

  sets: SwimmingRoutineSet[];
}


export interface SwimmingRoutine {
  id: string;

  date: string;

  title: string;
  objective: string;

  poolLengthMeters: number;

  estimatedDurationMinutes: number;

  blocks: SwimmingRoutineBlock[];

  technicalFocus: string[];
}


export function swimmingRoutineSetDistance(
  set: SwimmingRoutineSet
): number {

  return (
    set.repetitions
    * set.distanceMeters
  );
}


export function swimmingRoutineBlockDistance(
  block: SwimmingRoutineBlock
): number {

  return block.sets.reduce(
    (total, set) =>
      total
      + swimmingRoutineSetDistance(set),
    0
  );
}


export function swimmingRoutineDistance(
  routine: SwimmingRoutine
): number {

  return routine.blocks.reduce(
    (total, block) =>
      total
      + swimmingRoutineBlockDistance(block),
    0
  );
}
