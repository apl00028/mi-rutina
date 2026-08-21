import {
  Injectable,
  signal
} from '@angular/core';

export type WorkoutSessionShellState =
  | 'idle'
  | 'checking'
  | 'active';

@Injectable({
  providedIn: 'root'
})
export class WorkoutSessionStateService {
  readonly state =
    signal<WorkoutSessionShellState>(
      'idle'
    );

  readonly shouldHideBottomNav =
    signal(false);

  setChecking(): void {
    this.setState('checking');
  }

  setActive(): void {
    this.setState('active');
  }

  setIdle(): void {
    this.setState('idle');
  }

  private setState(
    state: WorkoutSessionShellState
  ): void {
    this.state.set(state);
    this.shouldHideBottomNav.set(
      state !== 'idle'
    );
  }
}
