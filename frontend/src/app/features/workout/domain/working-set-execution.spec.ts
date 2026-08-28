import {
  describe,
  expect,
  it
} from 'vitest';

import {
  transitionAfterInterSideRest,
  transitionWorkingSetCompletion,
  unilateralPhaseForSet,
  type UnilateralExecutionState
} from './working-set-execution';
import {
  buildExecutionPlan,
  findCurrentStep,
  hasPendingStepAfter
} from './execution-plan';


describe('working set execution transitions', () => {
  const firstSet = {
    exerciseId: 'row',
    setIndex: 0
  };


  it('keeps bilateral working-set completion unchanged', () => {
    expect(
      transitionWorkingSetCompletion(
        false,
        null,
        firstSet
      )
    ).toEqual({
      action: 'complete-set',
      state: null
    });
  });


  it('moves unilateral side 1 into inter-side rest without completing the set', () => {
    expect(
      transitionWorkingSetCompletion(
        true,
        null,
        firstSet
      )
    ).toEqual({
      action: 'start-inter-side-rest',
      state: {
        ...firstSet,
        phase: 'between-sides'
      }
    });
  });


  it('moves to side 2 when inter-side rest ends', () => {
    const resting:
      UnilateralExecutionState = {
      ...firstSet,
      phase: 'between-sides'
    };

    expect(
      transitionAfterInterSideRest(
        resting,
        firstSet
      )
    ).toEqual({
      ...firstSet,
      phase: 'second'
    });
  });


  it('completes the persisted set after unilateral side 2', () => {
    expect(
      transitionWorkingSetCompletion(
        true,
        {
          ...firstSet,
          phase: 'second'
        },
        firstSet
      )
    ).toEqual({
      action: 'complete-set',
      state: null
    });
  });


  it.each([
    {
      workingSetCount: 2,
      setIndex: 0,
      pendingAfter: true
    },
    {
      workingSetCount: 1,
      setIndex: 0,
      pendingAfter: false
    }
  ])(
    'uses the persisted plan after side 2 (pending: $pendingAfter)',
    ({
      workingSetCount,
      setIndex,
      pendingAfter
    }) => {
      const plan = buildExecutionPlan([
        {
          exerciseId: 'row',
          workingSetCount,
          warmupSetIndices: []
        }
      ]);
      const step = findCurrentStep(
        plan,
        {
          kind: 'working',
          exerciseId: 'row',
          setIndex
        }
      );
      const transition =
        transitionWorkingSetCompletion(
          true,
          {
            exerciseId: 'row',
            setIndex,
            phase: 'second'
          },
          {
            exerciseId: 'row',
            setIndex
          }
        );

      expect(transition.action)
        .toBe('complete-set');
      expect(
        hasPendingStepAfter(
          plan,
          step!,
          candidate =>
            candidate.exerciseId === 'row' &&
            candidate.setIndex === setIndex
        )
      ).toBe(pendingAfter);
    }
  );


  it('replaces a stale unilateral phase when another unilateral set is completed', () => {
    const secondSet = {
      exerciseId: 'split-squat',
      setIndex: 1
    };

    expect(
      transitionWorkingSetCompletion(
        true,
        {
          ...firstSet,
          phase: 'second'
        },
        secondSet
      )
    ).toEqual({
      action: 'start-inter-side-rest',
      state: {
        ...secondSet,
        phase: 'between-sides'
      }
    });
  });


  it('clears stale unilateral state when another bilateral set completes', () => {
    expect(
      transitionWorkingSetCompletion(
        false,
        {
          ...firstSet,
          phase: 'second'
        },
        {
          exerciseId: 'press',
          setIndex: 0
        }
      )
    ).toEqual({
      action: 'complete-set',
      state: null
    });
  });


  it('ignores stale timer completion and derives side labels per set', () => {
    const resting:
      UnilateralExecutionState = {
      ...firstSet,
      phase: 'between-sides'
    };

    expect(
      transitionAfterInterSideRest(
        resting,
        {
          exerciseId: 'row',
          setIndex: 1
        }
      )
    ).toBe(resting);
    expect(
      unilateralPhaseForSet(
        true,
        resting,
        firstSet
      )
    ).toBe('between-sides');
    expect(
      unilateralPhaseForSet(
        true,
        resting,
        {
          exerciseId: 'row',
          setIndex: 1
        }
      )
    ).toBe('first');
    expect(
      unilateralPhaseForSet(
        false,
        resting,
        firstSet
      )
    ).toBeNull();
  });
});
