import {
  Component,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  inject,
  signal
} from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ActivityHistoryService } from '../../core/activity-history.service';
import { AuthService } from '../../core/auth.service';
import { Goal, GoalMetricState } from '../../core/goal.models';
import { GoalService } from '../../core/goal.service';
import { PullRefresh } from '../../core/pull-refresh.component';
import {
  ActivityCalendar,
  PerformanceCalendarDay,
  activityDateKey,
  calendarDateLabel,
  disciplineInitial,
  disciplineLabel,
  localDateKey
} from '../../features/training/components/activity-calendar/activity-calendar';
import { GoalDefinition } from './goal-definition';
import { GoalProgress } from './goal-progress';
import { GOAL_VARIANT_OPTIONS, goalOption } from '../onboarding/onboarding.config';

interface DashboardMeal { mealId: string; }
interface DashboardNutritionDay { date: string; meals: DashboardMeal[]; }
interface DashboardNutritionPlan {
  planId: string;
  status: 'draft' | 'active' | 'completed';
  days: DashboardNutritionDay[];
}
interface DashboardMealCompletion { mealId: string; mealDate: string; }

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [PullRefresh, ActivityCalendar, GoalDefinition, GoalProgress],
  providers: [ActivityHistoryService],
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class Home implements OnInit {
  readonly history = inject(ActivityHistoryService);
  readonly refreshPage = () => this.loadHome(true);
  readonly goal = signal<Goal | null>(null);
  readonly goalLoading = signal(true);
  readonly goalError = signal<string | null>(null);
  readonly metricStates = signal<GoalMetricState[]>([]);
  readonly metricsLoading = signal(false);
  readonly metricsError = signal<string | null>(null);
  readonly todayLoading = signal(true);
  readonly todayError = signal(false);
  readonly hasActiveRoutine = signal(false);
  readonly hasActiveWorkout = signal(false);
  readonly todayMealsCompleted = signal<number | null>(null);
  readonly todayMealsTotal = signal<number | null>(null);
  readonly calendarMonth = signal(localDateKey(new Date()).slice(0, 7));
  readonly selectedDate = signal(localDateKey(new Date()));
  readonly selectedActivityId = signal<string | null>(null);
  readonly selectedActivity = computed(() => this.history.activities().find(
    activity => activity.id === this.selectedActivityId()
  ) ?? null);
  readonly dayActivities = computed(() => this.history.activities().filter(
    activity => activityDateKey(activity.event_at) === this.selectedDate()
  ));
  readonly recentActivities = computed(() => this.history.activities().slice(0, 3));
  readonly selectedDayLabel = computed(() => calendarDateLabel(this.selectedDate()));
  readonly activityInitial = disciplineInitial;
  readonly activityDisciplineLabel = disciplineLabel;
  readonly todayLabel = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long'
  }).format(new Date());

  private readonly apiUrl = environment.apiUrl;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
    private readonly auth: AuthService,
    private readonly goals: GoalService
  ) {}

  async ngOnInit(): Promise<void> { await this.loadHome(); }

  async loadHome(refresh = false): Promise<void> {
    await Promise.allSettled([
      this.loadGoal(),
      this.loadToday(),
      this.history.load(refresh)
    ]);
    this.hasActiveWorkout.set(
      this.history.workouts().some(workout => workout.status === 'in_progress')
    );
  }

  async loadGoal(): Promise<void> {
    this.goalLoading.set(true);
    this.goalError.set(null);
    this.metricsError.set(null);
    try {
      const goal = await this.goals.getActive();
      this.goal.set(goal);
      this.metricStates.set([]);
      if (goal) await this.loadMetricStates(goal.id);
    } catch {
      this.goal.set(null);
      this.metricStates.set([]);
      this.goalError.set('No se pudo cargar tu objetivo.');
    } finally {
      this.goalLoading.set(false);
    }
  }

  async loadMetricStates(goalId: string): Promise<void> {
    this.metricsLoading.set(true);
    try {
      this.metricStates.set(await this.goals.listMetricStates(goalId));
    } catch {
      this.metricStates.set([]);
      this.metricsError.set('No se pudo cargar el estado de tus métricas.');
    } finally {
      this.metricsLoading.set(false);
    }
  }

  async goalCreated(goal: Goal): Promise<void> {
    this.goal.set(goal);
    this.goalError.set(null);
    this.metricStates.set([]);
    await this.loadMetricStates(goal.id);
  }

  goalTitle(): string {
    const goal = this.goal();
    if (!goal) return '';
    const option = goalOption(goal.category, goal.kind);
    const variant = (GOAL_VARIANT_OPTIONS[goal.kind] ?? [])
      .find(candidate => candidate.value === goal.variant);
    return variant?.value
      ? `${option?.label ?? goal.kind} · ${variant.label}`
      : option?.label ?? goal.kind;
  }

  goalDate(): string | null {
    const value = this.goal()?.targetDate;
    if (!value) return null;
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat('es-ES', {
          day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
        }).format(date)
      : null;
  }

  go(path: string): void { void this.router.navigateByUrl(path); }

  nutritionLabel(): string | null {
    const total = this.todayMealsTotal();
    if (total === null || total === 0) return null;
    return `${this.todayMealsCompleted() ?? 0} de ${total} comidas registradas`;
  }

  openActivity(id: string | null): void {
    this.selectedActivityId.set(id);
    afterNextRender(() => {
      this.host.nativeElement.querySelector<HTMLElement>(
        id ? '.activity-detail' : '.recent-activities'
      )?.focus({ preventScroll: true });
    }, { injector: this.injector });
  }

  activityDate(timestamp: string | null): string {
    const date = timestamp ? new Date(timestamp) : null;
    return date && Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat('es-ES', {
          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
        }).format(date)
      : 'Fecha no disponible';
  }

  activityTime(timestamp: string | null): string {
    const date = timestamp ? new Date(timestamp) : null;
    return date && Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(date)
      : '';
  }

  changeMonth(month: string): void {
    this.calendarMonth.set(month);
    this.selectedDate.set(month === localDateKey(new Date()).slice(0, 7)
      ? localDateKey(new Date()) : `${month}-01`);
    this.selectedActivityId.set(null);
  }

  selectDay(day: PerformanceCalendarDay): void {
    this.selectedDate.set(day.dateKey);
    this.calendarMonth.set(day.dateKey.slice(0, 7));
    this.selectedActivityId.set(null);
  }

  private async headers(): Promise<HttpHeaders> {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error('No hay una sesión válida.');
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  private async loadToday(): Promise<void> {
    this.todayLoading.set(true);
    this.todayError.set(false);
    this.hasActiveRoutine.set(false);
    this.todayMealsCompleted.set(null);
    this.todayMealsTotal.set(null);
    try {
      const headers = await this.headers();
      const [routineResult, nutritionResult] = await Promise.allSettled([
        firstValueFrom(this.http.get<unknown>(`${this.apiUrl}/routines/active`, { headers })),
        firstValueFrom(this.http.get<DashboardNutritionPlan[]>(`${this.apiUrl}/nutrition/plans`, { headers }))
      ]);
      this.hasActiveRoutine.set(routineResult.status === 'fulfilled');
      if (nutritionResult.status === 'fulfilled') {
        await this.loadTodayNutrition(nutritionResult.value, headers);
      }
      const routineFailed = routineResult.status === 'rejected' &&
        (routineResult.reason as { status?: number } | null)?.status !== 404;
      this.todayError.set(routineFailed || nutritionResult.status === 'rejected');
    } catch {
      this.todayError.set(true);
    } finally {
      this.todayLoading.set(false);
    }
  }

  private async loadTodayNutrition(
    plans: DashboardNutritionPlan[], headers: HttpHeaders
  ): Promise<void> {
    const plan = plans.find(item => item.status === 'active') ?? plans[0] ?? null;
    const day = plan?.days.find(item => item.date === localDateKey(new Date()));
    if (!plan || !day) {
      this.todayMealsTotal.set(0);
      this.todayMealsCompleted.set(0);
      return;
    }
    this.todayMealsTotal.set(day.meals.length);
    try {
      const completions = await firstValueFrom(this.http.get<DashboardMealCompletion[]>(
        `${this.apiUrl}/nutrition/plans/${encodeURIComponent(plan.planId)}/meal-completions`,
        { headers }
      ));
      const completedIds = new Set(completions
        .filter(item => item.mealDate === localDateKey(new Date()))
        .map(item => item.mealId));
      this.todayMealsCompleted.set(day.meals.filter(
        meal => completedIds.has(meal.mealId)
      ).length);
    } catch {
      this.todayMealsCompleted.set(null);
    }
  }
}
