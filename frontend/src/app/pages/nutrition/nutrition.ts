import {
  Component,
  OnInit,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  HttpClient,
  HttpHeaders
} from '@angular/common/http';
import * as XLSX from 'xlsx';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';


type NutritionGoal =
  | 'lose_fat'
  | 'maintain'
  | 'gain_muscle';

type MealType =
  | 'breakfast'
  | 'lunch'
  | 'snack'
  | 'dinner';

type MeasurementBasis =
  | 'raw'
  | 'cooked'
  | 'product'
  | 'unit';


interface NutritionPer100g {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}


interface NutritionIngredient {
  ingredientId: string;
  name: string;
  productBrand?: string;
  quantity: number;
  unit: string;
  measurementBasis: MeasurementBasis;
  nutritionPer100g?: NutritionPer100g;
  notes?: string;
}


interface NutritionMeal {
  mealId: string;
  type: MealType;
  name: string;
  ingredients: NutritionIngredient[];
}


interface NutritionDay {
  date: string;
  meals: NutritionMeal[];
}


interface NutritionPlan {
  planId: string;
  schemaVersion: string;
  weekStart: string;
  status:
    | 'draft'
    | 'active'
    | 'completed';
  goal: NutritionGoal;
  targets?: {
    calorieTarget?: number;
    proteinTarget?: number;
    carbTarget?: number;
    fatTarget?: number;
  } | null;
  days: NutritionDay[];
  createdAt?: string;
  updatedAt?: string;
}


interface ImportIssue {
  sheet: string;
  row?: number;
  column?: string;
  message: string;
}


@Component({
  selector: 'app-nutrition',
  standalone: true,
  imports: [
    CommonModule
  ],
  templateUrl: './nutrition.html',
  styleUrl: './nutrition.scss'
})
export class Nutrition implements OnInit {

  private readonly apiUrl =
    environment.apiUrl;

  plans = signal<NutritionPlan[]>([]);
  loading = signal(false);
  saving = signal(false);

  preview = signal<NutritionPlan | null>(
    null
  );

  importIssues = signal<ImportIssue[]>([]);
  message = signal<string | null>(null);
  error = signal<string | null>(null);

  constructor(
    private http: HttpClient,
    public auth: AuthService
  ) {}


  async ngOnInit(): Promise<void> {
    await this.loadPlans();
  }


  private async authHeaders():
    Promise<HttpHeaders> {

    const token =
      await this.auth.getAccessToken();

    if (!token) {
      throw new Error(
        'Necesitas iniciar sesión.'
      );
    }

    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
  }


  async loadPlans(): Promise<void> {
    this.loading.set(true);

    try {
      const headers =
        await this.authHeaders();

      const plans =
        await new Promise<NutritionPlan[]>(
          (resolve, reject) => {
            this.http
              .get<NutritionPlan[]>(
                `${this.apiUrl}/nutrition/plans`,
                { headers }
              )
              .subscribe({
                next: resolve,
                error: reject
              });
          }
        );

      this.plans.set(plans);

    } catch (err: any) {
      this.error.set(
        err?.error?.detail ??
        err?.message ??
        'No se pudieron cargar los planes.'
      );
    } finally {
      this.loading.set(false);
    }
  }


  async importExcel(
    event: Event
  ): Promise<void> {

    this.preview.set(null);
    this.importIssues.set([]);
    this.message.set(null);
    this.error.set(null);

    const input =
      event.target as HTMLInputElement;

    const file =
      input.files?.[0];

    if (!file) {
      return;
    }

    try {
      const buffer =
        await file.arrayBuffer();

      const workbook =
        XLSX.read(
          buffer,
          {
            type: 'array',
            cellDates: true
          }
        );

      const result =
        this.parseWorkbook(workbook);

      this.importIssues.set(
        result.issues
      );

      if (result.issues.length) {
        return;
      }

      this.preview.set(
        result.plan
      );

    } catch (err: any) {
      this.error.set(
        err?.message ??
        'No se pudo leer el archivo.'
      );
    } finally {
      input.value = '';
    }
  }


  private parseWorkbook(
    workbook: XLSX.WorkBook
  ): {
    plan: NutritionPlan;
    issues: ImportIssue[];
  } {

    const issues: ImportIssue[] = [];

    const configSheet =
      workbook.Sheets['Configuración'];

    const planSheet =
      workbook.Sheets['Plan'];

    if (!configSheet) {
      issues.push({
        sheet: 'Configuración',
        message:
          'Falta la hoja obligatoria "Configuración".'
      });
    }

    if (!planSheet) {
      issues.push({
        sheet: 'Plan',
        message:
          'Falta la hoja obligatoria "Plan".'
      });
    }

    if (
      !configSheet ||
      !planSheet
    ) {
      return {
        plan:
          this.emptyPlan(),
        issues
      };
    }

    const configRows =
      XLSX.utils.sheet_to_json<any[]>(
        configSheet,
        {
          header: 1,
          defval: ''
        }
      );

    const config =
      new Map<string, unknown>();

    for (const row of configRows) {
      const key =
        this.normalize(
          row?.[0]
        );

      if (key) {
        config.set(
          key,
          row?.[1]
        );
      }
    }

    const weekStart =
      this.parseExcelDate(
        config.get(
          this.normalize(
            'Semana (lunes)'
          )
        )
      );

    if (!weekStart) {
      issues.push({
        sheet: 'Configuración',
        column: 'Semana (lunes)',
        message:
          'La semana debe indicar una fecha válida.'
      });
    }

    const goal =
      this.parseGoal(
        config.get(
          this.normalize(
            'Objetivo'
          )
        )
      );

    if (!goal) {
      issues.push({
        sheet: 'Configuración',
        column: 'Objetivo',
        message:
          'Objetivo debe ser perder_grasa, mantener o ganar_musculo.'
      });
    }

    const rawRows =
      XLSX.utils.sheet_to_json<
        Record<string, unknown>
      >(
        planSheet,
        {
          defval: ''
        }
      );

    const requiredHeaders = [
      'Día',
      'Comida',
      'Plato',
      'Ingrediente',
      'Cantidad',
      'Unidad',
      'Medición'
    ];

    const firstRow =
      rawRows[0] ?? {};

    for (
      const header
      of requiredHeaders
    ) {
      if (
        !Object.keys(firstRow)
          .some(
            key =>
              this.normalize(key) ===
              this.normalize(header)
          )
      ) {
        issues.push({
          sheet: 'Plan',
          row: 1,
          column: header,
          message:
            `Falta la columna obligatoria "${header}".`
        });
      }
    }

    const dayMap =
      new Map<number, NutritionDay>();

    const mealMap =
      new Map<string, NutritionMeal>();

    rawRows.forEach(
      (rawRow, index) => {

        const rowNumber =
          index + 2;

        const row =
          this.normalizeRow(rawRow);

        const dayIndex =
          this.parseDayIndex(
            row['dia']
          );

        const mealType =
          this.parseMealType(
            row['comida']
          );

        const dish =
          String(
            row['plato'] ?? ''
          ).trim();

        const ingredientName =
          String(
            row['ingrediente'] ?? ''
          ).trim();

        const quantity =
          this.numberOrNull(
            row['cantidad']
          );

        const unit =
          this.parseUnit(
            row['unidad']
          );

        const measurement =
          this.parseMeasurement(
            row['medicion']
          );

        if (dayIndex === null) {
          issues.push({
            sheet: 'Plan',
            row: rowNumber,
            column: 'Día',
            message:
              'Día no reconocido.'
          });
        }

        if (!mealType) {
          issues.push({
            sheet: 'Plan',
            row: rowNumber,
            column: 'Comida',
            message:
              'Comida no reconocida.'
          });
        }

        if (!dish) {
          issues.push({
            sheet: 'Plan',
            row: rowNumber,
            column: 'Plato',
            message:
              'Falta el nombre del plato.'
          });
        }

        if (!ingredientName) {
          issues.push({
            sheet: 'Plan',
            row: rowNumber,
            column: 'Ingrediente',
            message:
              'Falta el ingrediente.'
          });
        }

        if (
          quantity === null ||
          quantity <= 0
        ) {
          issues.push({
            sheet: 'Plan',
            row: rowNumber,
            column: 'Cantidad',
            message:
              'La cantidad debe ser mayor que 0.'
          });
        }

        if (!unit) {
          issues.push({
            sheet: 'Plan',
            row: rowNumber,
            column: 'Unidad',
            message:
              'Unidad debe ser g, ml o ud.'
          });
        }

        if (!measurement) {
          issues.push({
            sheet: 'Plan',
            row: rowNumber,
            column: 'Medición',
            message:
              'Medición debe ser crudo, cocinado, producto o unidad.'
          });
        }

        if (
          dayIndex === null ||
          !mealType ||
          !dish ||
          !ingredientName ||
          quantity === null ||
          quantity <= 0 ||
          !unit ||
          !measurement ||
          !weekStart
        ) {
          return;
        }

        let day =
          dayMap.get(dayIndex);

        if (!day) {
          day = {
            date:
              this.addDays(
                weekStart,
                dayIndex
              ),
            meals: []
          };

          dayMap.set(
            dayIndex,
            day
          );
        }

        const mealKey =
          [
            dayIndex,
            mealType,
            this.normalize(dish)
          ].join('|');

        let meal =
          mealMap.get(mealKey);

        if (!meal) {
          meal = {
            mealId:
              crypto.randomUUID(),
            type: mealType,
            name: dish,
            ingredients: []
          };

          mealMap.set(
            mealKey,
            meal
          );

          day.meals.push(meal);
        }

        const nutrition =
          this.readNutrition(
            row
          );

        meal.ingredients.push({
          ingredientId:
            crypto.randomUUID(),
          name:
            ingredientName,
          productBrand:
            this.optionalText(
              row['producto / marca']
            ),
          quantity,
          unit,
          measurementBasis:
            measurement,
          nutritionPer100g:
            nutrition,
          notes:
            this.optionalText(
              row['notas']
            )
        });
      }
    );

    const targets = {
      calorieTarget:
        this.numberOrUndefined(
          config.get(
            this.normalize(
              'Calorías objetivo'
            )
          )
        ),
      proteinTarget:
        this.numberOrUndefined(
          config.get(
            this.normalize(
              'Proteína objetivo (g)'
            )
          )
        ),
      carbTarget:
        this.numberOrUndefined(
          config.get(
            this.normalize(
              'Carbohidratos objetivo (g)'
            )
          )
        ),
      fatTarget:
        this.numberOrUndefined(
          config.get(
            this.normalize(
              'Grasas objetivo (g)'
            )
          )
        )
    };

    const existing =
      weekStart
        ? this.plans()
            .find(
              item =>
                item.weekStart ===
                weekStart
            )
        : undefined;

    return {
      issues,
      plan: {
        planId:
          existing?.planId ??
          crypto.randomUUID(),
        schemaVersion: '1.0',
        weekStart:
          weekStart ?? '',
        status: 'active',
        goal:
          goal ?? 'maintain',
        targets:
          Object.values(targets)
            .some(
              value =>
                value !== undefined
            )
            ? targets
            : null,
        days:
          [...dayMap.entries()]
            .sort(
              (a, b) =>
                a[0] - b[0]
            )
            .map(
              item => item[1]
            )
      }
    };
  }


  async savePreview():
    Promise<void> {

    const plan =
      this.preview();

    if (!plan) {
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    this.message.set(null);

    try {
      const headers =
        await this.authHeaders();

      const existing =
        this.plans()
          .find(
            item =>
              item.weekStart ===
              plan.weekStart
          );

      const saved =
        await new Promise<NutritionPlan>(
          (resolve, reject) => {

            const request =
              existing
                ? this.http.put<NutritionPlan>(
                    `${this.apiUrl}/nutrition/plans/${encodeURIComponent(plan.planId)}`,
                    plan,
                    { headers }
                  )
                : this.http.post<NutritionPlan>(
                    `${this.apiUrl}/nutrition/plans`,
                    plan,
                    { headers }
                  );

            request.subscribe({
              next: resolve,
              error: reject
            });
          }
        );

      this.preview.set(saved);

      this.message.set(
        existing
          ? 'Plan nutricional actualizado.'
          : 'Plan nutricional importado.'
      );

      await this.loadPlans();

    } catch (err: any) {
      this.error.set(
        err?.error?.detail ??
        err?.message ??
        'No se pudo guardar el plan.'
      );
    } finally {
      this.saving.set(false);
    }
  }


  private normalizeRow(
    row: Record<string, unknown>
  ): Record<string, unknown> {

    return Object.fromEntries(
      Object.entries(row)
        .map(
          ([key, value]) => [
            this.normalize(key),
            value
          ]
        )
    );
  }


  private normalize(
    value: unknown
  ): string {

    return String(
      value ?? ''
    )
      .trim()
      .normalize('NFD')
      .replace(
        /[\u0300-\u036f]/g,
        ''
      )
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }


  private parseGoal(
    value: unknown
  ): NutritionGoal | null {

    const token =
      this.normalize(value)
        .replace(/\s+/g, '_');

    if (
      [
        'perder_grasa',
        'lose_fat'
      ].includes(token)
    ) {
      return 'lose_fat';
    }

    if (
      [
        'mantener',
        'mantenimiento',
        'maintain'
      ].includes(token)
    ) {
      return 'maintain';
    }

    if (
      [
        'ganar_musculo',
        'ganar_masa_muscular',
        'gain_muscle'
      ].includes(token)
    ) {
      return 'gain_muscle';
    }

    return null;
  }


  private parseMealType(
    value: unknown
  ): MealType | null {

    switch (
      this.normalize(value)
    ) {
      case 'desayuno':
      case 'breakfast':
        return 'breakfast';

      case 'comida':
      case 'almuerzo':
      case 'lunch':
        return 'lunch';

      case 'merienda':
      case 'snack':
        return 'snack';

      case 'cena':
      case 'dinner':
        return 'dinner';

      default:
        return null;
    }
  }


  private parseMeasurement(
    value: unknown
  ): MeasurementBasis | null {

    switch (
      this.normalize(value)
    ) {
      case 'crudo':
      case 'raw':
        return 'raw';

      case 'cocinado':
      case 'cooked':
        return 'cooked';

      case 'producto':
      case 'product':
        return 'product';

      case 'unidad':
      case 'unit':
        return 'unit';

      default:
        return null;
    }
  }


  private parseUnit(
    value: unknown
  ): string | null {

    const unit =
      this.normalize(value);

    if (
      ['g', 'ml', 'ud'].includes(unit)
    ) {
      return unit;
    }

    return null;
  }


  private parseDayIndex(
    value: unknown
  ): number | null {

    const days =
      new Map<string, number>([
        ['lunes', 0],
        ['martes', 1],
        ['miercoles', 2],
        ['jueves', 3],
        ['viernes', 4],
        ['sabado', 5],
        ['domingo', 6]
      ]);

    return (
      days.get(
        this.normalize(value)
      ) ?? null
    );
  }


  private numberOrNull(
    value: unknown
  ): number | null {

    if (
      value === '' ||
      value === null ||
      value === undefined
    ) {
      return null;
    }

    const number =
      typeof value === 'number'
        ? value
        : Number(
            String(value)
              .replace(',', '.')
          );

    return Number.isFinite(number)
      ? number
      : null;
  }


  private numberOrUndefined(
    value: unknown
  ): number | undefined {

    return (
      this.numberOrNull(value) ??
      undefined
    );
  }


  private optionalText(
    value: unknown
  ): string | undefined {

    const text =
      String(value ?? '')
        .trim();

    return text || undefined;
  }


  private readNutrition(
    row: Record<string, unknown>
  ): NutritionPer100g | undefined {

    const nutrition = {
      calories:
        this.numberOrUndefined(
          row['kcal / 100 g']
        ),
      protein:
        this.numberOrUndefined(
          row['proteina / 100 g']
        ),
      carbs:
        this.numberOrUndefined(
          row['carbohidratos / 100 g']
        ),
      fat:
        this.numberOrUndefined(
          row['grasas / 100 g']
        )
    };

    return Object.values(nutrition)
      .some(
        value =>
          value !== undefined
      )
        ? nutrition
        : undefined;
  }


  private parseExcelDate(
    value: unknown
  ): string | null {

    if (value instanceof Date) {
      return this.localDate(value);
    }

    if (typeof value === 'number') {
      const parsed =
        XLSX.SSF.parse_date_code(
          value
        );

      if (parsed) {
        return [
          String(parsed.y)
            .padStart(4, '0'),
          String(parsed.m)
            .padStart(2, '0'),
          String(parsed.d)
            .padStart(2, '0')
        ].join('-');
      }
    }

    const text =
      String(value ?? '')
        .trim();

    if (
      /^\d{4}-\d{2}-\d{2}$/
        .test(text)
    ) {
      return text;
    }

    const match =
      text.match(
        /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/
      );

    if (match) {
      return [
        match[3],
        match[2].padStart(2, '0'),
        match[1].padStart(2, '0')
      ].join('-');
    }

    return null;
  }


  private addDays(
    isoDate: string,
    days: number
  ): string {

    const [year, month, day] =
      isoDate
        .split('-')
        .map(Number);

    const date =
      new Date(
        year,
        month - 1,
        day + days
      );

    return this.localDate(date);
  }


  private localDate(
    date: Date
  ): string {

    return [
      date.getFullYear(),
      String(
        date.getMonth() + 1
      ).padStart(2, '0'),
      String(
        date.getDate()
      ).padStart(2, '0')
    ].join('-');
  }


  private emptyPlan():
    NutritionPlan {

    return {
      planId:
        crypto.randomUUID(),
      schemaVersion: '1.0',
      weekStart: '',
      status: 'draft',
      goal: 'maintain',
      targets: null,
      days: []
    };
  }


  goalLabel(
    goal: NutritionGoal
  ): string {

    switch (goal) {
      case 'lose_fat':
        return 'Perder grasa';
      case 'gain_muscle':
        return 'Ganar masa muscular';
      default:
        return 'Mantener';
    }
  }


  mealLabel(
    type: MealType
  ): string {

    switch (type) {
      case 'breakfast':
        return 'Desayuno';
      case 'lunch':
        return 'Comida';
      case 'snack':
        return 'Merienda';
      case 'dinner':
        return 'Cena';
    }
  }
}
