import {
  Component,
  OnInit,
  signal
} from '@angular/core';

import {
  HttpClient,
  HttpHeaders
} from '@angular/common/http';

import {
  Router
} from '@angular/router';

import {
  firstValueFrom
} from 'rxjs';

import {
  environment
} from '../../../environments/environment';

import {
  AuthService
} from '../../core/auth.service';


interface DashboardWorkout {
  status:
    | 'in_progress'
    | 'finished';
}


interface DashboardMeal {
  mealId: string;
}


interface DashboardNutritionDay {
  date: string;
  meals: DashboardMeal[];
}


interface DashboardNutritionPlan {
  planId: string;

  status:
    | 'draft'
    | 'active'
    | 'completed';

  days: DashboardNutritionDay[];
}


interface DashboardMealCompletion {
  mealId: string;
  mealDate: string;
}


interface DashboardWeightSummary {
  currentWeightKg?: number;
  changeKg?: number;
  latestMeasurementDate?: string;
}


@Component({
  selector: 'app-home',
  standalone: true,
  imports: [],
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class Home implements OnInit {

  private readonly apiUrl =
    environment.apiUrl;


  loading =
    signal(true);

  error =
    signal<string | null>(null);


  hasActiveWorkout =
    signal(false);


  todayMealsCompleted =
    signal<number | null>(null);

  todayMealsTotal =
    signal<number | null>(null);


  currentWeightKg =
    signal<number | null>(null);

  weightChangeKg =
    signal<number | null>(null);


  readonly todayLabel =
    this.formatTodayLabel();


  constructor(
    private http: HttpClient,
    private router: Router,
    public auth: AuthService
  ) {}


  async ngOnInit():
    Promise<void> {

    await this.loadDashboard();
  }


  go(
    path: string
  ): void {

    void this.router.navigateByUrl(
      path
    );
  }


  nutritionProgress():
    number {

    const completed =
      this.todayMealsCompleted();

    const total =
      this.todayMealsTotal();

    if (
      completed === null ||
      total === null ||
      total <= 0
    ) {
      return 0;
    }

    return Math.min(
      100,
      Math.round(
        completed /
        total *
        100
      )
    );
  }


  weightLabel():
    string {

    const weight =
      this.currentWeightKg();

    if (weight === null) {
      return 'Sin peso registrado';
    }

    return (
      `${weight.toLocaleString(
        'es-ES',
        {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1
        }
      )} kg`
    );
  }


  weightTrendLabel():
    string {

    const change =
      this.weightChangeKg();

    if (change === null) {
      return 'Sin tendencia suficiente';
    }

    if (Math.abs(change) < 0.05) {
      return 'Peso estable en la tendencia reciente';
    }

    const formatted =
      Math.abs(change).toLocaleString(
        'es-ES',
        {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1
        }
      );

    return change < 0
      ? `-${formatted} kg en tendencia reciente`
      : `+${formatted} kg en tendencia reciente`;
  }


  private async loadDashboard():
    Promise<void> {

    this.loading.set(true);
    this.error.set(null);

    try {

      const token =
        await this.auth.getAccessToken();

      if (!token) {
        this.error.set(
          'No se pudo cargar el resumen.'
        );
        return;
      }

      const headers =
        new HttpHeaders({
          Authorization:
            `Bearer ${token}`
        });


      const [
        workoutsResult,
        nutritionResult,
        weightResult
      ] =
        await Promise.allSettled([

          firstValueFrom(
            this.http.get<
              DashboardWorkout[]
            >(
              `${this.apiUrl}/workouts`,
              { headers }
            )
          ),

          firstValueFrom(
            this.http.get<
              DashboardNutritionPlan[]
            >(
              `${this.apiUrl}/nutrition/plans`,
              { headers }
            )
          ),

          firstValueFrom(
            this.http.get<
              DashboardWeightSummary
            >(
              `${this.apiUrl}/health/weight-summary`,
              { headers }
            )
          )

        ]);


      /*
       * Entrenamiento
       */

      if (
        workoutsResult.status ===
        'fulfilled'
      ) {
        this.hasActiveWorkout.set(
          workoutsResult.value.some(
            workout =>
              workout.status ===
              'in_progress'
          )
        );
      }


      /*
       * Salud
       */

      if (
        weightResult.status ===
        'fulfilled'
      ) {

        const summary =
          weightResult.value;

        this.currentWeightKg.set(
          Number.isFinite(
            summary.currentWeightKg
          )
            ? summary.currentWeightKg!
            : null
        );

        this.weightChangeKg.set(
          Number.isFinite(
            summary.changeKg
          )
            ? summary.changeKg!
            : null
        );
      }


      /*
       * Nutrición
       */

      if (
        nutritionResult.status ===
        'fulfilled'
      ) {

        const plans =
          nutritionResult.value;

        const plan =
          plans.find(
            item =>
              item.status === 'active'
          )
          ?? plans[0]
          ?? null;

        if (plan) {

          const today =
            this.localDate(
              new Date()
            );

          const day =
            plan.days.find(
              item =>
                item.date === today
            );

          if (day) {

            this.todayMealsTotal.set(
              day.meals.length
            );

            try {

              const completions =
                await firstValueFrom(
                  this.http.get<
                    DashboardMealCompletion[]
                  >(
                    (
                      `${this.apiUrl}`
                      + `/nutrition/plans/`
                      + `${encodeURIComponent(
                          plan.planId
                        )}`
                      + `/meal-completions`
                    ),
                    { headers }
                  )
                );

              const completedIds =
                new Set(
                  completions
                    .filter(
                      item =>
                        item.mealDate ===
                        today
                    )
                    .map(
                      item =>
                        item.mealId
                    )
                );

              this.todayMealsCompleted.set(
                day.meals.filter(
                  meal =>
                    completedIds.has(
                      meal.mealId
                    )
                ).length
              );

            } catch {

              this.todayMealsCompleted.set(
                0
              );
            }

          } else {

            this.todayMealsTotal.set(0);
            this.todayMealsCompleted.set(0);
          }
        }
      }


      const failed =
        [
          workoutsResult,
          nutritionResult,
          weightResult
        ].filter(
          result =>
            result.status ===
            'rejected'
        ).length;

      if (failed === 3) {
        this.error.set(
          'No se pudo actualizar el resumen.'
        );
      }

    } catch {

      this.error.set(
        'No se pudo actualizar el resumen.'
      );

    } finally {

      this.loading.set(false);
    }
  }


  private localDate(
    date: Date
  ): string {

    return (
      `${date.getFullYear()}-`
      + `${String(
          date.getMonth() + 1
        ).padStart(2, '0')}-`
      + `${String(
          date.getDate()
        ).padStart(2, '0')}`
    );
  }


  private formatTodayLabel():
    string {

    return new Intl.DateTimeFormat(
      'es-ES',
      {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      }
    ).format(
      new Date()
    );
  }
}
