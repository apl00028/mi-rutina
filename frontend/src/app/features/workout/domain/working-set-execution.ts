export const DEFAULT_INTER_SIDE_REST_SECONDS = 30;

export interface WorkingSetReference {
  readonly exerciseId: string;
  readonly setIndex: number;
}

export type UnilateralPhase =
  | 'between-sides'
  | 'second';

export interface UnilateralExecutionState
  extends WorkingSetReference {
  readonly phase: UnilateralPhase;
}

export type WorkingSetCompletionTransition =
  | {
      readonly action: 'complete-set';
      readonly state: null;
    }
  | {
      readonly action: 'start-inter-side-rest';
      readonly state: UnilateralExecutionState;
    };


export function transitionWorkingSetCompletion(
  unilateral: boolean,
  current: UnilateralExecutionState | null,
  set: WorkingSetReference
): WorkingSetCompletionTransition {
  if (!unilateral) {
    return {
      action: 'complete-set',
      state: null
    };
  }

  if (
    current?.phase === 'second' &&
    sameSet(current, set)
  ) {
    return {
      action: 'complete-set',
      state: null
    };
  }

  return {
    action: 'start-inter-side-rest',
    state: {
      ...set,
      phase: 'between-sides'
    }
  };
}


export function transitionAfterInterSideRest(
  current: UnilateralExecutionState | null,
  set: WorkingSetReference
): UnilateralExecutionState | null {
  if (
    current?.phase !== 'between-sides' ||
    !sameSet(current, set)
  ) {
    return current;
  }

  return {
    ...current,
    phase: 'second'
  };
}


export function unilateralPhaseForSet(
  unilateral: boolean,
  current: UnilateralExecutionState | null,
  set: WorkingSetReference
): 'first' | UnilateralPhase | null {
  if (!unilateral) {
    return null;
  }

  return current && sameSet(current, set)
    ? current.phase
    : 'first';
}


function sameSet(
  left: WorkingSetReference,
  right: WorkingSetReference
): boolean {
  return (
    left.exerciseId === right.exerciseId &&
    left.setIndex === right.setIndex
  );
}
