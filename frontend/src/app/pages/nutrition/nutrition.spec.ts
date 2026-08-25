/**
 * @vitest-environment jsdom
 */

import { signal } from '@angular/core';
import {
  provideHttpClient
} from '@angular/common/http';
import {
  provideHttpClientTesting
} from '@angular/common/http/testing';
import {
  TestBed
} from '@angular/core/testing';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';
import * as XLSX from 'xlsx';

import {
  AuthService
} from '../../core/auth.service';
import {
  Nutrition
} from './nutrition';


describe('Nutrition import', () => {

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        Nutrition
      ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: {
            user: signal({
              email: 'test@example.com'
            }),
            getAccessToken:
              vi.fn()
                .mockResolvedValue(
                  'access-token'
                )
          }
        }
      ]
    }).compileComponents();
  });


  function workbook(
    quantity: unknown = 200
  ): XLSX.WorkBook {

    const wb =
      XLSX.utils.book_new();

    const config =
      XLSX.utils.aoa_to_sheet([
        [
          'Aptus · Plantilla nutrición',
          'Valor'
        ],
        [
          'Versión esquema',
          '1.0'
        ],
        [
          'Semana (lunes)',
          '2026-08-24'
        ],
        [
          'Objetivo',
          'perder_grasa'
        ],
        [
          'Calorías objetivo',
          2200
        ],
        [
          'Proteína objetivo (g)',
          160
        ],
        [
          'Carbohidratos objetivo (g)',
          230
        ],
        [
          'Grasas objetivo (g)',
          70
        ]
      ]);

    const plan =
      XLSX.utils.json_to_sheet([
        {
          'Día':
            'Lunes',
          'Comida':
            'Comida',
          'Plato':
            'Pollo con arroz',
          'Ingrediente':
            'Pechuga de pollo',
          'Producto / marca':
            'Pechuga de pollo Mercadona',
          'Cantidad':
            quantity,
          'Unidad':
            'g',
          'Medición':
            'producto',
          'kcal / 100 g':
            110,
          'Proteína / 100 g':
            23,
          'Carbohidratos / 100 g':
            0,
          'Grasas / 100 g':
            2,
          'Notas':
            'Valores verificados'
        }
      ]);

    XLSX.utils.book_append_sheet(
      wb,
      config,
      'Configuración'
    );

    XLSX.utils.book_append_sheet(
      wb,
      plan,
      'Plan'
    );

    return wb;
  }


  function parse(
    component: Nutrition,
    wb: XLSX.WorkBook
  ): any {
    return (
      component as any
    ).parseWorkbook(wb);
  }


  it(
    'imports a valid Aptus nutrition workbook',
    () => {
      const fixture =
        TestBed.createComponent(
          Nutrition
        );

      const component =
        fixture.componentInstance;

      const result =
        parse(
          component,
          workbook()
        );

      expect(result.issues)
        .toEqual([]);

      expect(result.plan)
        .toMatchObject({
          schemaVersion:
            '1.0',
          weekStart:
            '2026-08-24',
          status:
            'active',
          goal:
            'lose_fat',
          targets: {
            calorieTarget:
              2200,
            proteinTarget:
              160,
            carbTarget:
              230,
            fatTarget:
              70
          }
        });

      expect(
        result.plan.days
      ).toHaveLength(1);
    }
  );


  it(
    'preserves Mercadona product and verified nutrition values',
    () => {
      const fixture =
        TestBed.createComponent(
          Nutrition
        );

      const result =
        parse(
          fixture.componentInstance,
          workbook()
        );

      const ingredient =
        result.plan
          .days[0]
          .meals[0]
          .ingredients[0];

      expect(ingredient)
        .toMatchObject({
          name:
            'Pechuga de pollo',
          productBrand:
            'Pechuga de pollo Mercadona',
          quantity:
            200,
          unit:
            'g',
          measurementBasis:
            'product',
          nutritionPer100g: {
            calories:
              110,
            protein:
              23,
            carbs:
              0,
            fat:
              2
          },
          notes:
            'Valores verificados'
        });
    }
  );


  it(
    'reports invalid quantities with sheet row and column',
    () => {
      const fixture =
        TestBed.createComponent(
          Nutrition
        );

      const result =
        parse(
          fixture.componentInstance,
          workbook(-10)
        );

      expect(result.issues)
        .toContainEqual({
          sheet:
            'Plan',
          row:
            2,
          column:
            'Cantidad',
          message:
            'La cantidad debe ser mayor que 0.'
        });
    }
  );


  it(
    'reuses the plan id when importing an existing week',
    () => {
      const fixture =
        TestBed.createComponent(
          Nutrition
        );

      const component =
        fixture.componentInstance;

      component.plans.set([
        {
          planId:
            '7d80a518-b080-4c8f-9781-92f39fb5809a',
          schemaVersion:
            '1.0',
          weekStart:
            '2026-08-24',
          status:
            'active',
          goal:
            'maintain',
          targets:
            null,
          days:
            []
        }
      ]);

      const result =
        parse(
          component,
          workbook()
        );

      expect(
        result.plan.planId
      ).toBe(
        '7d80a518-b080-4c8f-9781-92f39fb5809a'
      );
    }
  );


  it(
    'rejects a workbook without the Plan sheet',
    () => {
      const wb =
        XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([
          [
            'Semana (lunes)',
            '2026-08-24'
          ]
        ]),
        'Configuración'
      );

      const fixture =
        TestBed.createComponent(
          Nutrition
        );

      const result =
        parse(
          fixture.componentInstance,
          wb
        );

      expect(result.issues)
        .toContainEqual({
          sheet:
            'Plan',
          message:
            'Falta la hoja obligatoria "Plan".'
        });
    }
  );

  it(
    'imports recipe instructions from the Recetas sheet',
    () => {

      const fixture =
        TestBed.createComponent(
          Nutrition
        );

      const component =
        fixture.componentInstance;

      const wb =
        workbook();

      const planSheet =
        wb.Sheets['Plan'];

      const rows =
        XLSX.utils.sheet_to_json<any>(
          planSheet
        );

      rows[0]['Receta ID'] =
        'pollo-arroz';

      wb.Sheets['Plan'] =
        XLSX.utils.json_to_sheet(
          rows
        );

      const recipes =
        XLSX.utils.json_to_sheet([
          {
            'Receta ID':
              'pollo-arroz',
            'Plato':
              'Pollo con arroz',
            'Raciones':
              1,
            'Preparación min':
              10,
            'Cocción min':
              20,
            'Paso':
              1,
            'Instrucción':
              'Cocer el arroz.',
            'Notas':
              'Arroz pesado en crudo.'
          },
          {
            'Receta ID':
              'pollo-arroz',
            'Plato':
              'Pollo con arroz',
            'Raciones':
              1,
            'Preparación min':
              10,
            'Cocción min':
              20,
            'Paso':
              2,
            'Instrucción':
              'Cocinar el pollo.',
            'Notas':
              'Arroz pesado en crudo.'
          }
        ]);

      XLSX.utils.book_append_sheet(
        wb,
        recipes,
        'Recetas'
      );

      const result =
        parse(
          component,
          wb
        );

      expect(result.issues)
        .toEqual([]);

      const meal =
        result.plan.days[0]
          .meals[0];

      expect(meal)
        .toMatchObject({
          recipeId:
            'pollo-arroz',
          servings:
            1,
          prepMinutes:
            10,
          cookMinutes:
            20,
          steps: [
            'Cocer el arroz.',
            'Cocinar el pollo.'
          ],
          notes:
            'Arroz pesado en crudo.'
        });
    }
  );



  it(
    'scales recipe ingredient quantities by servings',
    () => {

      const fixture =
        TestBed.createComponent(
          Nutrition
        );

      const component =
        fixture.componentInstance;

      const meal: any = {
        mealId: 'meal-1',
        type: 'lunch',
        name: 'Pollo con arroz',
        servings: 2,
        ingredients: [
          {
            ingredientId: 'rice',
            name: 'Arroz',
            quantity: 160,
            unit: 'g',
            measurementBasis: 'raw'
          }
        ]
      };

      component.openRecipe(meal);

      expect(
        component.recipeServings()
      ).toBe(2);

      component.increaseRecipeServings();

      expect(
        component.scaledQuantity(
          meal.ingredients[0],
          meal
        )
      ).toBe(240);

      component.decreaseRecipeServings();

      expect(
        component.scaledQuantity(
          meal.ingredients[0],
          meal
        )
      ).toBe(160);
    }
  );



  it(
    'updates ingredient quantities when recipe servings change',
    () => {

      const fixture =
        TestBed.createComponent(
          Nutrition
        );

      const component =
        fixture.componentInstance;

      const result =
        parse(
          component,
          workbook()
        );

      const plan =
        result.plan;

      const meal =
        plan.days[0]
          .meals[0];

      const updated =
        component
          .planWithRecipeServings(
            plan,
            meal.mealId,
            2
          );

      expect(
        updated.days[0]
          .meals[0]
          .servings
      ).toBe(2);

      expect(
        updated.days[0]
          .meals[0]
          .ingredients[0]
          .quantity
      ).toBe(400);

      expect(
        plan.days[0]
          .meals[0]
          .ingredients[0]
          .quantity
      ).toBe(200);
    }
  );



  it(
    'migrates legacy GymOS shopping state to Aptus storage',
    () => {
      globalThis.localStorage.clear();

      const fixture =
        TestBed.createComponent(
          Nutrition
        );

      const component =
        fixture.componentInstance;

      const result =
        parse(
          component,
          workbook()
        );

      component.plans.set([
        result.plan
      ]);

      const items: any[] = [
        {
          name: 'Arroz',
          unit: 'g',
          quantity: 500,
          productBrand: 'Hacendado',
          sources: []
        }
      ];

      const itemKey =
        (component as any)
          .shoppingItemKey(
            items[0]
          );

      globalThis.localStorage.setItem(
        'gymos:nutrition:shopping:'
          + result.plan.planId,
        JSON.stringify([
          itemKey
        ])
      );

      (component as any)
        .loadPurchasedItems(
          result.plan.planId,
          items
        );

      expect(
        component.isShoppingItemPurchased(
          items[0]
        )
      ).toBe(true);

      expect(
        globalThis.localStorage.getItem(
          'aptus:nutrition:shopping:'
            + result.plan.planId
        )
      ).not.toBeNull();

      expect(
        globalThis.localStorage.getItem(
          'gymos:nutrition:shopping:'
            + result.plan.planId
        )
      ).toBeNull();
    }
  );



  it(
    'tracks shopping progress and purchased items',
    () => {

      globalThis.localStorage.clear();

      const fixture =
        TestBed.createComponent(
          Nutrition
        );

      const component =
        fixture.componentInstance;

      const result =
        parse(
          component,
          workbook()
        );

      component.plans.set([
        result.plan
      ]);

      const items: any[] = [
        {
          name: 'Arroz',
          unit: 'g',
          quantity: 500,
          productBrand: 'Hacendado',
          sources: []
        },
        {
          name: 'Pechuga de pollo',
          unit: 'g',
          quantity: 800,
          productBrand: 'Mercadona',
          sources: []
        }
      ];

      component.shoppingList.set(
        items
      );

      expect(
        component.purchasedCount()
      ).toBe(0);

      component.toggleShoppingItem(
        items[0]
      );

      expect(
        component.purchasedCount()
      ).toBe(1);

      expect(
        component.shoppingProgress()
      ).toBe(50);

      expect(
        component.isShoppingItemPurchased(
          items[0]
        )
      ).toBe(true);

      component.toggleShoppingItem(
        items[0]
      );

      expect(
        component.purchasedCount()
      ).toBe(0);
    }
  );


});
