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
          'GymOS · Plantilla nutrición',
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
    'imports a valid GymOS nutrition workbook',
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

});
