import {
  signal
} from '@angular/core';


export interface RestTimerContext {
  readonly exerciseId: string;
  readonly sourceKind:
    | 'warmup'
    | 'working';
  readonly setIndex: number;
  readonly exerciseName: string;
  readonly setLabel: string;
}

export interface RestTimerState
  extends RestTimerContext {
  readonly endsAt: number;
  readonly remainingSeconds: number;
  readonly finished: boolean;
}

export interface RestTimerEnd {
  readonly reason:
    | 'expired'
    | 'skipped';
  readonly context: RestTimerContext;
}

type RestTimerEndHandler = (
  event: RestTimerEnd
) => void;


export class RestTimerController {
  private readonly current =
    signal<RestTimerState | null>(null);

  readonly state =
    this.current.asReadonly();

  private interval:
    ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly onEnded:
      RestTimerEndHandler = () => {}
  ) {}


  start(
    context: RestTimerContext,
    durationSeconds: number
  ): void {
    this.clear();

    if (
      !Number.isFinite(durationSeconds) ||
      durationSeconds <= 0
    ) {
      return;
    }

    const duration =
      Math.floor(durationSeconds);

    this.current.set({
      ...context,
      endsAt:
        Date.now() + duration * 1000,
      remainingSeconds:
        duration,
      finished:
        false
    });

    this.interval =
      setInterval(
        () => this.reconcile(),
        250
      );

    this.reconcile();
  }


  adjust(seconds: number): void {
    const timer =
      this.current();

    if (!timer) {
      return;
    }

    const nextEndsAt =
      Math.max(
        Date.now(),
        timer.endsAt + seconds * 1000
      );

    this.current.set({
      ...timer,
      endsAt:
        nextEndsAt,
      remainingSeconds:
        Math.max(
          0,
          Math.ceil(
            (nextEndsAt - Date.now()) / 1000
          )
        ),
      finished:
        nextEndsAt <= Date.now()
    });

    if (
      nextEndsAt > Date.now() &&
      !this.interval
    ) {
      this.interval =
        setInterval(
          () => this.reconcile(),
          250
        );
    }
  }


  skip(): void {
    const timer =
      this.current();

    if (!timer) {
      return;
    }

    const context =
      this.contextFrom(timer);

    this.clear();
    this.onEnded({
      reason: 'skipped',
      context
    });
  }


  clear(): void {
    this.clearInterval();
    this.current.set(null);
  }


  destroy(): void {
    this.clear();
  }


  private reconcile(): void {
    const timer =
      this.current();

    if (!timer) {
      this.clearInterval();
      return;
    }

    const remainingSeconds =
      Math.max(
        0,
        Math.ceil(
          (timer.endsAt - Date.now()) / 1000
        )
      );

    if (remainingSeconds <= 0) {
      const context =
        this.contextFrom(timer);

      this.clear();
      this.onEnded({
        reason: 'expired',
        context
      });
      return;
    }

    if (
      remainingSeconds !==
      timer.remainingSeconds
    ) {
      this.current.set({
        ...timer,
        remainingSeconds,
        finished: false
      });
    }
  }


  private clearInterval(): void {
    if (!this.interval) {
      return;
    }

    clearInterval(this.interval);
    this.interval = null;
  }


  private contextFrom(
    timer: RestTimerState
  ): RestTimerContext {
    return {
      exerciseId:
        timer.exerciseId,
      sourceKind:
        timer.sourceKind,
      setIndex:
        timer.setIndex,
      exerciseName:
        timer.exerciseName,
      setLabel:
        timer.setLabel
    };
  }
}
