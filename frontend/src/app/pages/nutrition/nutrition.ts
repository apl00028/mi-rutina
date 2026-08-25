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

type NutritionSection =
  | 'week'
  | 'plan'
  | 'shopping';


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

  recipeId?: string;
  servings?: number;
  prepMinutes?: number;
  cookMinutes?: number;
  steps?: string[];
  notes?: string;

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


interface ShoppingListSource {
  date: string;
  mealType: MealType;
  mealName: string;
}


interface ShoppingListItem {
  name: string;
  unit: string;
  quantity: number;
  productBrand?: string;
  sources: ShoppingListSource[];
}


interface NutritionMealCompletion {
  id: string;
  planId: string;
  mealDate: string;
  mealId: string;
  createdAt?: string;
  updatedAt?: string;
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

  nutritionSection =
    signal<NutritionSection>('week');

  shoppingList =
    signal<ShoppingListItem[]>([]);

  shoppingLoading =
    signal(false);

  selectedNutritionDate =
    signal('');

  mealCompletions =
    signal<NutritionMealCompletion[]>([]);

  savingMealCompletion =
    signal<string | null>(null);


  purchasedItems =
    signal<Set<string>>(
      new Set()
    );


  selectedMeal =
    signal<NutritionMeal | null>(null);

  recipeServings =
    signal(1);


  savingRecipe =
    signal(false);



  constructor(
    private http: HttpClient,
    public auth: AuthService
  ) {}


  async ngOnInit(): Promise<void> {
    await this.loadPlans();

    this.selectDefaultNutritionDay();

    const plan =
      this.activePlan();

    if (plan) {
      await this.loadMealCompletions(
        plan.planId
      );
    }
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


  openRecipe(
    meal: NutritionMeal
  ): void {

    this.selectedMeal.set(meal);

    this.recipeServings.set(
      meal.servings ?? 1
    );
  }


  closeRecipe(): void {
    this.selectedMeal.set(null);
  }


  increaseRecipeServings(): void {
    this.recipeServings.update(
      value =>
        Math.min(
          20,
          value + 1
        )
    );
  }


  decreaseRecipeServings(): void {
    this.recipeServings.update(
      value =>
        Math.max(
          1,
          value - 1
        )
    );
  }


  scaledQuantity(
    ingredient: NutritionIngredient,
    meal: NutritionMeal
  ): number {

    const originalServings =
      meal.servings ?? 1;

    return (
      ingredient.quantity
      * this.recipeServings()
      / originalServings
    );
  }


  planWithRecipeServings(
    plan: NutritionPlan,
    mealId: string,
    servings: number
  ): NutritionPlan {

    const sourceMeal =
      plan.days
        .flatMap(day => day.meals)
        .find(
          meal =>
            meal.mealId === mealId
        );

    if (!sourceMeal) {
      return plan;
    }

    const originalServings =
      sourceMeal.servings ?? 1;

    const factor =
      servings / originalServings;

    return {
      ...plan,

      days:
        plan.days.map(
          day => ({
            ...day,

            meals:
              day.meals.map(
                meal => {

                  if (
                    meal.mealId !== mealId
                  ) {
                    return meal;
                  }

                  return {
                    ...meal,

                    servings,

                    ingredients:
                      meal.ingredients.map(
                        ingredient => ({
                          ...ingredient,

                          quantity:
                            Number(
                              (
                                ingredient.quantity
                                * factor
                              ).toFixed(4)
                            )
                        })
                      )
                  };
                }
              )
          })
        )
    };
  }


  async saveRecipeServings():
    Promise<void> {

    const meal =
      this.selectedMeal();

    const plan =
      this.activePlan();

    if (!meal || !plan) {
      return;
    }

    const servings =
      this.recipeServings();

    const originalServings =
      meal.servings ?? 1;

    if (
      servings === originalServings
    ) {
      return;
    }

    const updatedPlan =
      this.planWithRecipeServings(
        plan,
        meal.mealId,
        servings
      );

    this.savingRecipe.set(true);
    this.error.set(null);
    this.message.set(null);

    try {

      const headers =
        await this.authHeaders();

      const saved =
        await new Promise<NutritionPlan>(
          (resolve, reject) => {

            this.http
              .put<NutritionPlan>(
                `${this.apiUrl}/nutrition/plans/${encodeURIComponent(plan.planId)}`,
                updatedPlan,
                { headers }
              )
              .subscribe({
                next: resolve,
                error: reject
              });
          }
        );

      this.plans.update(
        current => [
          saved,
          ...current.filter(
            item =>
              item.planId !==
              saved.planId
          )
        ]
      );

      const savedMeal =
        saved.days
          .flatMap(day => day.meals)
          .find(
            item =>
              item.mealId ===
              meal.mealId
          );

      if (savedMeal) {
        this.selectedMeal.set(
          savedMeal
        );
      }

      this.recipeServings.set(
        servings
      );

      this.message.set(
        'Raciones y cantidades actualizadas.'
      );

      if (
        this.shoppingList().length
      ) {
        await this.loadShoppingList(
          saved.planId
        );
      }

    } catch (err: any) {

      this.error.set(
        err?.error?.detail ??
        err?.message ??
        'No se pudieron actualizar las raciones.'
      );

    } finally {
      this.savingRecipe.set(false);
    }
  }


  recipeTotalMinutes(
    meal: NutritionMeal
  ): number | undefined {

    const prep =
      meal.prepMinutes;

    const cook =
      meal.cookMinutes;

    if (
      prep === undefined &&
      cook === undefined
    ) {
      return undefined;
    }

    return (
      (prep ?? 0)
      + (cook ?? 0)
    );
  }


  hasRecipeDetails(
    meal: NutritionMeal
  ): boolean {

    return Boolean(
      meal.steps?.length ||
      meal.prepMinutes !== undefined ||
      meal.cookMinutes !== undefined ||
      meal.notes
    );
  }


  activePlan(): NutritionPlan | null {
    return this.plans()[0] ?? null;
  }


  async selectSection(
    section: NutritionSection
  ): Promise<void> {

    this.nutritionSection.set(section);
    this.error.set(null);

    if (section !== 'shopping') {
      return;
    }

    const plan = this.activePlan();

    if (!plan) {
      this.shoppingList.set([]);
      return;
    }

    await this.loadShoppingList(
      plan.planId
    );
  }


  async loadShoppingList(
    planId: string
  ): Promise<void> {

    this.shoppingLoading.set(true);

    try {
      const headers =
        await this.authHeaders();

      const items =
        await new Promise<
          ShoppingListItem[]
        >(
          (resolve, reject) => {
            this.http
              .get<ShoppingListItem[]>(
                `${this.apiUrl}/nutrition/plans/${planId}/shopping-list`,
                { headers }
              )
              .subscribe({
                next: resolve,
                error: reject
              });
          }
        );

      this.shoppingList.set(items);

      this.loadPurchasedItems(
        planId,
        items
      );

    } catch (err: any) {
      this.error.set(
        err?.error?.detail ??
        err?.message ??
        'No se pudo generar la lista de la compra.'
      );
    } finally {
      this.shoppingLoading.set(false);
    }
  }


  async loadMealCompletions(
    planId: string
  ): Promise<void> {

    try {
      const headers =
        await this.authHeaders();

      const items =
        await new Promise<
          NutritionMealCompletion[]
        >(
          (resolve, reject) => {
            this.http
              .get<NutritionMealCompletion[]>(
                (
                  `${this.apiUrl}`
                  + `/nutrition/plans/`
                  + `${encodeURIComponent(planId)}`
                  + `/meal-completions`
                ),
                { headers }
              )
              .subscribe({
                next: resolve,
                error: reject
              });
          }
        );

      this.mealCompletions.set(
        items
      );

    } catch (err: any) {
      this.error.set(
        err?.error?.detail ??
        err?.message ??
        'No se pudo cargar el seguimiento de comidas.'
      );
    }
  }


  private todayDate(): string {

    const now = new Date();

    return (
      `${now.getFullYear()}-`
      + `${String(
          now.getMonth() + 1
        ).padStart(2, '0')}-`
      + `${String(
          now.getDate()
        ).padStart(2, '0')}`
    );
  }


  selectDefaultNutritionDay(): void {

    const plan =
      this.activePlan();

    if (!plan) {
      this.selectedNutritionDate.set('');
      return;
    }

    const days =
      this.weekDays(plan);

    const today =
      this.todayDate();

    const selected =
      days.some(
        day => day.date === today
      )
        ? today
        : days[0]?.date ?? '';

    this.selectedNutritionDate.set(
      selected
    );
  }


  selectedNutritionDay(
    plan: NutritionPlan
  ): NutritionDay | null {

    const days =
      this.weekDays(plan);

    return (
      days.find(
        day =>
          day.date ===
          this.selectedNutritionDate()
      )
      ?? days[0]
      ?? null
    );
  }


  selectNutritionDay(
    value: string
  ): void {

    this.selectedNutritionDate.set(
      value
    );
  }


  shiftNutritionDay(
    plan: NutritionPlan,
    offset: number
  ): void {

    const days =
      this.weekDays(plan);

    const current =
      this.selectedNutritionDay(plan);

    if (!current) {
      return;
    }

    const index =
      days.findIndex(
        day =>
          day.date === current.date
      );

    const target =
      days[index + offset];

    if (target) {
      this.selectedNutritionDate.set(
        target.date
      );
    }
  }


  canShiftNutritionDay(
    plan: NutritionPlan,
    offset: number
  ): boolean {

    const days =
      this.weekDays(plan);

    const current =
      this.selectedNutritionDay(plan);

    if (!current) {
      return false;
    }

    const index =
      days.findIndex(
        day =>
          day.date === current.date
      );

    return Boolean(
      days[index + offset]
    );
  }


  isFutureNutritionDay(
    dateValue: string
  ): boolean {

    return (
      dateValue >
      this.todayDate()
    );
  }


  isMealCompleted(
    mealId: string
  ): boolean {

    return this.mealCompletions()
      .some(
        item =>
          item.mealId === mealId
      );
  }


  completedMealsForDay(
    day: NutritionDay
  ): number {

    return day.meals.filter(
      meal =>
        this.isMealCompleted(
          meal.mealId
        )
    ).length;
  }


  dayMealAdherencePercent(
    day: NutritionDay
  ): number {

    if (!day.meals.length) {
      return 0;
    }

    return Math.round(
      this.completedMealsForDay(day)
      / day.meals.length
      * 100
    );
  }


  plannedElapsedMeals(
    plan: NutritionPlan
  ): number {

    const today =
      this.todayDate();

    return this.weekDays(plan)
      .filter(
        day =>
          day.date <= today
      )
      .reduce(
        (total, day) =>
          total + day.meals.length,
        0
      );
  }


  completedWeekMeals(
    plan: NutritionPlan
  ): number {

    const today =
      this.todayDate();

    return this.weekDays(plan)
      .filter(
        day =>
          day.date <= today
      )
      .reduce(
        (total, day) =>
          total
          + this.completedMealsForDay(
              day
            ),
        0
      );
  }


  weekMealAdherencePercent(
    plan: NutritionPlan
  ): number {

    const planned =
      this.plannedElapsedMeals(plan);

    if (!planned) {
      return 0;
    }

    return Math.round(
      this.completedWeekMeals(plan)
      / planned
      * 100
    );
  }


  private mealCompletionKey(
    planId: string,
    mealId: string
  ): string {

    return (
      planId
      + ':'
      + mealId
    );
  }


  async toggleMealCompletion(
    plan: NutritionPlan,
    day: NutritionDay,
    meal: NutritionMeal
  ): Promise<void> {

    if (
      this.isFutureNutritionDay(
        day.date
      )
    ) {
      return;
    }

    const key =
      this.mealCompletionKey(
        plan.planId,
        meal.mealId
      );

    if (this.savingMealCompletion()) {
      return;
    }

    this.savingMealCompletion.set(
      key
    );

    this.error.set(null);

    try {
      const headers =
        await this.authHeaders();

      const url =
        (
          `${this.apiUrl}`
          + `/nutrition/plans/`
          + `${encodeURIComponent(plan.planId)}`
          + `/meal-completions/`
          + `${encodeURIComponent(meal.mealId)}`
        );

      if (
        this.isMealCompleted(
          meal.mealId
        )
      ) {

        await new Promise<void>(
          (resolve, reject) => {
            this.http
              .delete<void>(
                url,
                { headers }
              )
              .subscribe({
                next: () =>
                  resolve(),
                error: reject
              });
          }
        );

        this.mealCompletions.update(
          current =>
            current.filter(
              item =>
                item.mealId
                !== meal.mealId
            )
        );

      } else {

        const saved =
          await new Promise<
            NutritionMealCompletion
          >(
            (resolve, reject) => {
              this.http
                .put<NutritionMealCompletion>(
                  url,
                  {},
                  { headers }
                )
                .subscribe({
                  next: resolve,
                  error: reject
                });
            }
          );

        this.mealCompletions.update(
          current => [
            saved,
            ...current.filter(
              item =>
                item.mealId
                !== saved.mealId
            )
          ]
        );
      }

    } catch (err: any) {

      this.error.set(
        err?.error?.detail ??
        err?.message ??
        'No se pudo actualizar la comida.'
      );

    } finally {

      this.savingMealCompletion.set(
        null
      );
    }
  }


  orderedDays(
    plan: NutritionPlan
  ): NutritionDay[] {

    return [...plan.days].sort(
      (a, b) =>
        a.date.localeCompare(b.date)
    );
  }


  weekDays(
    plan: NutritionPlan
  ): NutritionDay[] {

    const existing =
      new Map(
        plan.days.map(
          day => [
            day.date,
            day
          ]
        )
      );

    return Array.from(
      { length: 7 },
      (_, index) => {

        const date =
          this.addDays(
            plan.weekStart,
            index
          );

        return (
          existing.get(date)
          ?? {
            date,
            meals: []
          }
        );
      }
    );
  }


  weekRangeLabel(
    plan: NutritionPlan
  ): string {

    const start =
      this.calendarDate(plan.weekStart);

    const end =
      new Date(start);

    end.setDate(
      end.getDate() + 6
    );

    return (
      `${this.shortDate(start)}`
      + ' – '
      + `${this.shortDate(end)}`
    );
  }


  dayName(
    dateValue: string
  ): string {

    const value =
      this.calendarDate(dateValue)
        .toLocaleDateString(
          'es-ES',
          {
            weekday: 'long'
          }
        );

    return (
      value.charAt(0).toUpperCase()
      + value.slice(1)
    );
  }


  dayDate(
    dateValue: string
  ): string {

    return this.shortDate(
      this.calendarDate(dateValue)
    );
  }


  isToday(
    dateValue: string
  ): boolean {

    return (
      dateValue ===
      this.todayDate()
    );
  }


  mealCount(
    plan: NutritionPlan
  ): number {

    return plan.days.reduce(
      (total, day) =>
        total + day.meals.length,
      0
    );
  }


  ingredientCount(
    plan: NutritionPlan
  ): number {

    return plan.days.reduce(
      (dayTotal, day) =>
        dayTotal
        + day.meals.reduce(
            (mealTotal, meal) =>
              mealTotal
              + meal.ingredients.length,
            0
          ),
      0
    );
  }


  shoppingItemKey(
    item: ShoppingListItem
  ): string {

    return [
      item.name
        .trim()
        .toLocaleLowerCase('es-ES'),

      item.unit
        .trim()
        .toLocaleLowerCase('es-ES'),

      (item.productBrand ?? '')
        .trim()
        .toLocaleLowerCase('es-ES')
    ].join('|');
  }


  isShoppingItemPurchased(
    item: ShoppingListItem
  ): boolean {

    return this.purchasedItems()
      .has(
        this.shoppingItemKey(item)
      );
  }


  toggleShoppingItem(
    item: ShoppingListItem
  ): void {

    const plan =
      this.activePlan();

    if (!plan) {
      return;
    }

    const key =
      this.shoppingItemKey(item);

    const next =
      new Set(
        this.purchasedItems()
      );

    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }

    this.purchasedItems.set(next);

    this.persistPurchasedItems(
      plan.planId,
      next
    );
  }


  purchasedCount(): number {

    return this.shoppingList()
      .filter(
        item =>
          this.isShoppingItemPurchased(
            item
          )
      )
      .length;
  }


  shoppingProgress(): number {

    const total =
      this.shoppingList().length;

    if (!total) {
      return 0;
    }

    return (
      this.purchasedCount()
      / total
      * 100
    );
  }


  clearPurchasedItems(): void {

    const plan =
      this.activePlan();

    this.purchasedItems.set(
      new Set()
    );

    if (!plan) {
      return;
    }

    if (
      'localStorage' in globalThis
    ) {
      globalThis.localStorage
        .removeItem(
          this.shoppingStorageKey(
            plan.planId
          )
        );
    }
  }


  shoppingSourceLabel(
    source: ShoppingListSource
  ): string {

    const weekday =
      this.dayName(source.date)
        .slice(0, 3);

    return (
      `${weekday} `
      + `${this.dayDate(source.date)}`
      + ' · '
      + `${this.mealLabel(
          source.mealType
        )}`
      + ' · '
      + source.mealName
    );
  }


  private shoppingStorageKey(
    planId: string
  ): string {

    return (
      'gymos:nutrition:shopping:'
      + planId
    );
  }


  private persistPurchasedItems(
    planId: string,
    items: Set<string>
  ): void {

    if (
      !('localStorage' in globalThis)
    ) {
      return;
    }

    globalThis.localStorage.setItem(
      this.shoppingStorageKey(planId),
      JSON.stringify(
        [...items]
      )
    );
  }


  private loadPurchasedItems(
    planId: string,
    items: ShoppingListItem[]
  ): void {

    if (
      !('localStorage' in globalThis)
    ) {
      this.purchasedItems.set(
        new Set()
      );
      return;
    }

    try {

      const raw =
        globalThis.localStorage
          .getItem(
            this.shoppingStorageKey(
              planId
            )
          );

      const stored =
        raw
          ? JSON.parse(raw)
          : [];

      const validKeys =
        new Set(
          items.map(
            item =>
              this.shoppingItemKey(
                item
              )
          )
        );

      const purchased =
        Array.isArray(stored)
          ? stored.filter(
              key =>
                typeof key === 'string'
                && validKeys.has(key)
            )
          : [];

      this.purchasedItems.set(
        new Set(purchased)
      );

    } catch {

      this.purchasedItems.set(
        new Set()
      );
    }
  }


  shoppingGroups(): {
    category: string;
    items: ShoppingListItem[];
  }[] {

    const groups =
      new Map<
        string,
        ShoppingListItem[]
      >();

    for (
      const item
      of this.shoppingList()
    ) {
      const category =
        this.shoppingCategory(
          item.name
        );

      const current =
        groups.get(category) ?? [];

      current.push(item);

      groups.set(
        category,
        current
      );
    }

    const order = [
      'Fruta y verdura',
      'Proteínas',
      'Lácteos y refrigerados',
      'Despensa',
      'Otros'
    ];

    return order
      .filter(
        category =>
          groups.has(category)
      )
      .map(
        category => ({
          category,
          items:
            groups.get(category) ?? []
        })
      );
  }


  private shoppingCategory(
    name: string
  ): string {

    const value =
      name
        .normalize('NFD')
        .replace(
          /[\u0300-\u036f]/g,
          ''
        )
        .toLowerCase();

    const containsAny = (
      values: string[]
    ): boolean =>
      values.some(
        item => value.includes(item)
      );

    if (
      containsAny([
        'fresa',
        'arand',
        'mandarina',
        'naranja',
        'platano',
        'sandia',
        'melon',
        'tomate',
        'cebolla',
        'pimiento',
        'calabacin',
        'zanahoria',
        'brocoli',
        'espinaca',
        'lechuga',
        'aguacate',
        'patata',
        'verdura',
        'fruta'
      ])
    ) {
      return 'Fruta y verdura';
    }

    if (
      containsAny([
        'pollo',
        'pavo',
        'ternera',
        'cerdo',
        'salmon',
        'atun',
        'merluza',
        'pescado',
        'huevo',
        'tofu',
        'gamba'
      ])
    ) {
      return 'Proteínas';
    }

    if (
      containsAny([
        'leche',
        'yogur',
        'kefir',
        'queso',
        'skyr'
      ])
    ) {
      return 'Lácteos y refrigerados';
    }

    if (
      containsAny([
        'arroz',
        'pasta',
        'avena',
        'pan',
        'lenteja',
        'garbanzo',
        'alubia',
        'aceite',
        'chia',
        'lino',
        'almendra',
        'nuez',
        'chocolate'
      ])
    ) {
      return 'Despensa';
    }

    return 'Otros';
  }


  private calendarDate(
    value: string
  ): Date {

    const [
      year,
      month,
      day
    ] = value
      .split('-')
      .map(Number);

    return new Date(
      year,
      month - 1,
      day,
      12
    );
  }


  private shortDate(
    value: Date
  ): string {

    return value
      .toLocaleDateString(
        'es-ES',
        {
          day: 'numeric',
          month: 'short'
        }
      )
      .replace('.', '');
  }


  downloadTemplate(): void {

    const workbook =
      XLSX.utils.book_new();

    const configSheet =
      XLSX.utils.aoa_to_sheet([
        [
          'Campo',
          'Valor',
          'Ayuda'
        ],
        [
          'Versión esquema',
          '1.0',
          'No modificar'
        ],
        [
          'Semana (lunes)',
          '',
          'YYYY-MM-DD · debe ser lunes'
        ],
        [
          'Objetivo',
          '',
          'perder_grasa | mantener | ganar_musculo'
        ],
        [
          'Calorías objetivo',
          '',
          'Opcional'
        ],
        [
          'Proteína objetivo (g)',
          '',
          'Opcional'
        ],
        [
          'Carbohidratos objetivo (g)',
          '',
          'Opcional'
        ],
        [
          'Grasas objetivo (g)',
          '',
          'Opcional'
        ]
      ]);

    const planSheet =
      XLSX.utils.aoa_to_sheet([
        [
          'Día',
          'Comida',
          'Plato',
          'Receta ID',
          'Ingrediente',
          'Producto / marca',
          'Cantidad',
          'Unidad',
          'Medición',
          'kcal / 100 g',
          'Proteína / 100 g',
          'Carbohidratos / 100 g',
          'Grasas / 100 g',
          'Notas'
        ]
      ]);

    const recipesSheet =
      XLSX.utils.aoa_to_sheet([
        [
          'Receta ID',
          'Plato',
          'Raciones',
          'Preparación min',
          'Cocción min',
          'Paso',
          'Instrucción',
          'Notas'
        ]
      ]);

    recipesSheet['!cols'] = [
      { wch: 22 },
      { wch: 30 },
      { wch: 12 },
      { wch: 18 },
      { wch: 15 },
      { wch: 10 },
      { wch: 55 },
      { wch: 35 }
    ];


    const listsSheet =
      XLSX.utils.aoa_to_sheet([
        [
          'Días',
          'Comidas',
          'Medición',
          'Objetivos',
          'Unidades'
        ],
        [
          'Lunes',
          'Desayuno',
          'crudo',
          'perder_grasa',
          'g'
        ],
        [
          'Martes',
          'Comida',
          'cocinado',
          'mantener',
          'ml'
        ],
        [
          'Miércoles',
          'Merienda',
          'producto',
          'ganar_musculo',
          'ud'
        ],
        [
          'Jueves',
          'Cena',
          'unidad',
          '',
          ''
        ],
        ['Viernes', '', '', '', ''],
        ['Sábado', '', '', '', ''],
        ['Domingo', '', '', '', '']
      ]);

    configSheet['!cols'] = [
      { wch: 28 },
      { wch: 22 },
      { wch: 42 }
    ];

    planSheet['!cols'] = [
      { wch: 14 },
      { wch: 14 },
      { wch: 26 },
      { wch: 26 },
      { wch: 24 },
      { wch: 12 },
      { wch: 10 },
      { wch: 14 },
      { wch: 14 },
      { wch: 18 },
      { wch: 22 },
      { wch: 18 },
      { wch: 30 }
    ];

    XLSX.utils.book_append_sheet(
      workbook,
      configSheet,
      'Configuración'
    );

    XLSX.utils.book_append_sheet(
      workbook,
      planSheet,
      'Plan'
    );

    XLSX.utils.book_append_sheet(
      workbook,
      recipesSheet,
      'Recetas'
    );

    XLSX.utils.book_append_sheet(
      workbook,
      listsSheet,
      'Listas'
    );

    XLSX.writeFile(
      workbook,
      'aptus-plantilla-nutricion-v1.xlsx'
    );
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

    const recipeSheet =
      workbook.Sheets['Recetas'];

    const recipeMap =
      new Map<
        string,
        {
          recipeId: string;
          name: string;
          servings: number;
          prepMinutes?: number;
          cookMinutes?: number;
          steps: {
            order: number;
            text: string;
          }[];
          notes?: string;
        }
      >();


    if (recipeSheet) {

      const recipeRows =
        XLSX.utils.sheet_to_json<
          Record<string, unknown>
        >(
          recipeSheet,
          {
            defval: ''
          }
        );


      recipeRows.forEach(
        (rawRecipe, index) => {

          const rowNumber =
            index + 2;

          const row =
            this.normalizeRow(
              rawRecipe
            );

          const recipeId =
            String(
              row['receta id'] ?? ''
            ).trim();

          const name =
            String(
              row['plato'] ?? ''
            ).trim();

          const servings =
            this.numberOrNull(
              row['raciones']
            );

          const prepMinutes =
            this.numberOrUndefined(
              row['preparacion min']
            );

          const cookMinutes =
            this.numberOrUndefined(
              row['coccion min']
            );

          const step =
            this.numberOrNull(
              row['paso']
            );

          const instruction =
            String(
              row['instruccion'] ?? ''
            ).trim();


          if (!recipeId) {
            issues.push({
              sheet: 'Recetas',
              row: rowNumber,
              column: 'Receta ID',
              message:
                'Falta el identificador de la receta.'
            });
            return;
          }

          if (!name) {
            issues.push({
              sheet: 'Recetas',
              row: rowNumber,
              column: 'Plato',
              message:
                'Falta el nombre del plato.'
            });
            return;
          }

          if (
            servings === null ||
            servings <= 0
          ) {
            issues.push({
              sheet: 'Recetas',
              row: rowNumber,
              column: 'Raciones',
              message:
                'Raciones debe ser mayor que 0.'
            });
            return;
          }

          if (
            prepMinutes !== undefined &&
            prepMinutes < 0
          ) {
            issues.push({
              sheet: 'Recetas',
              row: rowNumber,
              column: 'Preparación min',
              message:
                'El tiempo no puede ser negativo.'
            });
            return;
          }

          if (
            cookMinutes !== undefined &&
            cookMinutes < 0
          ) {
            issues.push({
              sheet: 'Recetas',
              row: rowNumber,
              column: 'Cocción min',
              message:
                'El tiempo no puede ser negativo.'
            });
            return;
          }

          if (
            step === null ||
            step < 1 ||
            !Number.isInteger(step)
          ) {
            issues.push({
              sheet: 'Recetas',
              row: rowNumber,
              column: 'Paso',
              message:
                'Paso debe ser un entero mayor que 0.'
            });
            return;
          }

          if (!instruction) {
            issues.push({
              sheet: 'Recetas',
              row: rowNumber,
              column: 'Instrucción',
              message:
                'Falta la instrucción del paso.'
            });
            return;
          }


          const key =
            this.normalize(recipeId);

          let recipe =
            recipeMap.get(key);

          if (!recipe) {
            recipe = {
              recipeId,
              name,
              servings,
              prepMinutes,
              cookMinutes,
              steps: [],
              notes:
                this.optionalText(
                  row['notas']
                )
            };

            recipeMap.set(
              key,
              recipe
            );
          }


          recipe.steps.push({
            order: step,
            text: instruction
          });
        }
      );


      for (
        const recipe
        of recipeMap.values()
      ) {
        recipe.steps.sort(
          (a, b) =>
            a.order - b.order
        );
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

        const recipeId =
          this.optionalText(
            row['receta id']
          );

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

          const recipe =
            recipeId
              ? recipeMap.get(
                  this.normalize(
                    recipeId
                  )
                )
              : undefined;

          meal = {
            mealId:
              crypto.randomUUID(),
            type: mealType,
            name: dish,

            recipeId:
              recipe?.recipeId ??
              recipeId ??
              undefined,

            servings:
              recipe?.servings ?? 1,

            prepMinutes:
              recipe?.prepMinutes,

            cookMinutes:
              recipe?.cookMinutes,

            steps:
              recipe?.steps.map(
                item => item.text
              ) ?? [],

            notes:
              recipe?.notes,

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
