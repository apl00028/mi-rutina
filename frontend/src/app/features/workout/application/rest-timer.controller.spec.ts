import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi
} from 'vitest';

import {
  RestTimerController,
  type RestTimerContext,
  type RestTimerEnd
} from './rest-timer.controller';


describe('RestTimerController', () => {
  let controller:
    RestTimerController;
  let ended:
    Mock<(event: RestTimerEnd) => void>;

  const workingContext:
    RestTimerContext = {
      exerciseId: 'press',
      reason: 'between-sets',
      sourceKind: 'working',
      setIndex: 0,
      exerciseName: 'Press de banca',
      setLabel: 'serie 1'
    };


  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(
      new Date(
        '2026-08-28T10:00:00Z'
      )
    );

    ended = vi.fn();
    controller =
      new RestTimerController(ended);
  });


  afterEach(() => {
    controller.destroy();
    vi.useRealTimers();
  });


  it('starts with the configured duration and preserves context', () => {
    controller.start(
      workingContext,
      90
    );

    expect(controller.state())
      .toMatchObject({
        ...workingContext,
        remainingSeconds: 90,
        finished: false
      });
  });


  it('reconciles countdown from the wall clock', async () => {
    controller.start(
      workingContext,
      90
    );

    await vi.advanceTimersByTimeAsync(
      30_000
    );

    expect(
      controller.state()
        ?.remainingSeconds
    ).toBe(60);
  });


  it('replaces an active timer without leaving a stale interval', async () => {
    controller.start(
      workingContext,
      90
    );

    await vi.advanceTimersByTimeAsync(
      10_000
    );

    const warmupContext:
      RestTimerContext = {
        exerciseId: 'row',
        reason: 'between-sets',
        sourceKind: 'warmup',
        setIndex: -1,
        exerciseName: 'Remo',
        setLabel: 'calentamiento 1'
      };

    controller.start(
      warmupContext,
      30
    );

    await vi.advanceTimersByTimeAsync(
      20_000
    );

    expect(controller.state())
      .toMatchObject({
        ...warmupContext,
        remainingSeconds: 10
      });
    expect(ended).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(
      10_000
    );

    expect(controller.state()).toBeNull();
    expect(ended).toHaveBeenCalledOnce();
    expect(ended).toHaveBeenCalledWith({
      reason: 'expired',
      context: warmupContext
    });
  });


  it('clears state and stops future expiry notifications', async () => {
    controller.start(
      workingContext,
      30
    );

    controller.clear();

    expect(controller.state()).toBeNull();

    await vi.advanceTimersByTimeAsync(
      60_000
    );

    expect(ended).not.toHaveBeenCalled();
  });


  it('skips an active timer and reports its context', () => {
    controller.start(
      workingContext,
      90
    );

    controller.skip();

    expect(controller.state()).toBeNull();
    expect(ended).toHaveBeenCalledWith({
      reason: 'skipped',
      context: workingContext
    });
  });


  it('expires naturally and reports its context once', async () => {
    controller.start(
      workingContext,
      1
    );

    await vi.advanceTimersByTimeAsync(
      1_000
    );

    expect(controller.state()).toBeNull();
    expect(ended).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledWith({
      reason: 'expired',
      context: workingContext
    });

    await vi.advanceTimersByTimeAsync(
      1_000
    );

    expect(ended).toHaveBeenCalledTimes(1);
  });


  it('adjusts remaining time and preserves zero-time state until reconciliation', async () => {
    controller.start(
      workingContext,
      120
    );

    controller.adjust(30);

    expect(
      controller.state()
        ?.remainingSeconds
    ).toBe(150);

    controller.adjust(-30);
    controller.adjust(-300);

    expect(controller.state())
      .toMatchObject({
        remainingSeconds: 0,
        finished: true
      });

    await vi.advanceTimersByTimeAsync(250);

    expect(controller.state()).toBeNull();
    expect(ended).toHaveBeenCalledWith({
      reason: 'expired',
      context: workingContext
    });
  });


  it('destroys timer resources without notifying completion', async () => {
    controller.start(
      workingContext,
      1
    );

    controller.destroy();

    expect(controller.state()).toBeNull();

    await vi.advanceTimersByTimeAsync(
      2_000
    );

    expect(ended).not.toHaveBeenCalled();
  });
});
