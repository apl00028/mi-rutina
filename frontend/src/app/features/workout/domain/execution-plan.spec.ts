import {
  describe,
  expect,
  it
} from 'vitest';

import {
  buildExecutionPlan,
  findCurrentStep,
  hasPendingStepAfter,
  nextPendingStep,
  nextPlannedStep,
  type ExecutionStep
} from './execution-plan';


describe('workout execution plan', () => {
  const stepKey = (
    step: ExecutionStep | null
  ): string | null =>
    step
      ? `${step.kind}:${step.exerciseId}:${step.setIndex}`
      : null;


  it('orders each exercise warmups before working sets', () => {
    const plan = buildExecutionPlan([
      {
        exerciseId: 'press',
        workingSetCount: 2,
        warmupSetIndices: [-2, -1]
      },
      {
        exerciseId: 'row',
        workingSetCount: 1,
        warmupSetIndices: [-1]
      }
    ]);

    expect(plan.map(stepKey)).toEqual([
      'warmup:press:-1',
      'warmup:press:-2',
      'working:press:0',
      'working:press:1',
      'warmup:row:-1',
      'working:row:0'
    ]);
  });


  it.each([
    {
      name: 'first warmup to second warmup',
      current: {
        kind: 'warmup',
        exerciseId: 'press',
        setIndex: -1
      } as const,
      expected: 'warmup:press:-2'
    },
    {
      name: 'final warmup to first working set',
      current: {
        kind: 'warmup',
        exerciseId: 'press',
        setIndex: -2
      } as const,
      expected: 'working:press:0'
    },
    {
      name: 'working set to next working set',
      current: {
        kind: 'working',
        exerciseId: 'press',
        setIndex: 0
      } as const,
      expected: 'working:press:1'
    },
    {
      name: 'final set to next exercise warmup',
      current: {
        kind: 'working',
        exerciseId: 'press',
        setIndex: 1
      } as const,
      expected: 'warmup:row:-1'
    }
  ])('finds the next planned step: $name', ({
    current,
    expected
  }) => {
    const plan = buildExecutionPlan([
      {
        exerciseId: 'press',
        workingSetCount: 2,
        warmupSetIndices: [-1, -2]
      },
      {
        exerciseId: 'row',
        workingSetCount: 1,
        warmupSetIndices: [-1]
      }
    ]);

    expect(
      stepKey(
        nextPlannedStep(
          plan,
          current
        )
      )
    ).toBe(expected);
  });


  it('skips completed later steps in a partially completed workout', () => {
    const plan = buildExecutionPlan([
      {
        exerciseId: 'press',
        workingSetCount: 3,
        warmupSetIndices: [-1]
      },
      {
        exerciseId: 'row',
        workingSetCount: 2,
        warmupSetIndices: []
      }
    ]);

    const completed = new Set([
      'working:press:1',
      'working:row:0'
    ]);

    const isCompleted = (
      step: ExecutionStep
    ): boolean => completed.has(
      stepKey(step)!
    );

    expect(
      stepKey(
        nextPendingStep(
          plan,
          isCompleted,
          {
            kind: 'working',
            exerciseId: 'press',
            setIndex: 0
          }
        )
      )
    ).toBe('working:press:2');

    expect(
      stepKey(
        nextPendingStep(
          plan,
          isCompleted,
          {
            kind: 'working',
            exerciseId: 'press',
            setIndex: 2
          }
        )
      )
    ).toBe('working:row:1');
  });


  it('reports pending work only after the current planned step', () => {
    const plan = buildExecutionPlan([
      {
        exerciseId: 'press',
        workingSetCount: 2,
        warmupSetIndices: []
      }
    ]);

    const first = findCurrentStep(
      plan,
      {
        kind: 'working',
        exerciseId: 'press',
        setIndex: 0
      }
    );
    const final = findCurrentStep(
      plan,
      {
        kind: 'working',
        exerciseId: 'press',
        setIndex: 1
      }
    );

    expect(first).not.toBeNull();
    expect(final).not.toBeNull();
    expect(
      hasPendingStepAfter(
        plan,
        first!,
        () => false
      )
    ).toBe(true);
    expect(
      hasPendingStepAfter(
        plan,
        final!,
        () => false
      )
    ).toBe(false);
  });


  it('supports exercises with no warmups or no planned working sets', () => {
    const plan = buildExecutionPlan([
      {
        exerciseId: 'empty',
        workingSetCount: 0,
        warmupSetIndices: []
      },
      {
        exerciseId: 'plank',
        workingSetCount: 1,
        warmupSetIndices: []
      }
    ]);

    expect(plan.map(stepKey)).toEqual([
      'working:plank:0'
    ]);
    expect(
      stepKey(
        nextPendingStep(
          plan,
          () => false
        )
      )
    ).toBe('working:plank:0');

    expect(
      buildExecutionPlan([
        {
          exerciseId: 'empty',
          workingSetCount: 0,
          warmupSetIndices: []
        }
      ])
    ).toEqual([]);
  });
});
