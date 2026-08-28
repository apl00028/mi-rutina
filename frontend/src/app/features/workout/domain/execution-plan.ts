export interface ExecutionPlanExercise {
  exerciseId: string;
  workingSetCount: number;
  warmupSetIndices: readonly number[];
}

export type ExecutionStep =
  | {
      kind: 'warmup';
      exerciseId: string;
      setIndex: number;
    }
  | {
      kind: 'working';
      exerciseId: string;
      setIndex: number;
    };

export type ExecutionStepCompletion = (
  step: ExecutionStep
) => boolean;


export function buildExecutionPlan(
  exercises: readonly ExecutionPlanExercise[]
): ExecutionStep[] {
  return exercises.flatMap(exercise => {
    const warmups: ExecutionStep[] =
      orderWarmupSteps(
        exercise.warmupSetIndices.map(
          setIndex => ({
            setIndex
          })
        )
      ).map(({ setIndex }) => ({
        kind: 'warmup',
        exerciseId: exercise.exerciseId,
        setIndex
      }));

    const workingSetCount =
      Number.isFinite(exercise.workingSetCount)
        ? Math.max(
            0,
            Math.floor(exercise.workingSetCount)
          )
        : 0;

    const workingSets: ExecutionStep[] =
      Array.from(
        {
          length: workingSetCount
        },
        (_, setIndex) => ({
          kind: 'working',
          exerciseId: exercise.exerciseId,
          setIndex
        })
      );

    return [
      ...warmups,
      ...workingSets
    ];
  });
}


export function orderWarmupSteps<
  T extends { setIndex: number }
>(warmups: readonly T[]): T[] {
  return [...warmups].sort(
    (left, right) =>
      right.setIndex - left.setIndex
  );
}


export function findCurrentStep(
  plan: readonly ExecutionStep[],
  current: ExecutionStep
): ExecutionStep | null {
  return plan.find(
    step => sameStep(step, current)
  ) ?? null;
}


export function nextPlannedStep(
  plan: readonly ExecutionStep[],
  current: ExecutionStep
): ExecutionStep | null {
  const currentIndex = plan.findIndex(
    step => sameStep(step, current)
  );

  if (currentIndex < 0) {
    return null;
  }

  return plan[currentIndex + 1] ?? null;
}


export function nextPendingStep(
  plan: readonly ExecutionStep[],
  isCompleted: ExecutionStepCompletion,
  after?: ExecutionStep
): ExecutionStep | null {
  let startIndex = 0;

  if (after) {
    const currentIndex = plan.findIndex(
      step => sameStep(step, after)
    );

    if (currentIndex < 0) {
      return null;
    }

    startIndex = currentIndex + 1;
  }

  return plan
    .slice(startIndex)
    .find(step => !isCompleted(step)) ?? null;
}


export function hasPendingStepAfter(
  plan: readonly ExecutionStep[],
  current: ExecutionStep,
  isCompleted: ExecutionStepCompletion
): boolean {
  return nextPendingStep(
    plan,
    isCompleted,
    current
  ) !== null;
}


function sameStep(
  left: ExecutionStep,
  right: ExecutionStep
): boolean {
  return (
    left.kind === right.kind &&
    left.exerciseId === right.exerciseId &&
    left.setIndex === right.setIndex
  );
}
