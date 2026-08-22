import {
  Component,
  OnInit,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as XLSX from 'xlsx';
import {
  HttpClient,
  HttpHeaders
} from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';


interface WeightEntry {
  id: string;
  measurementDate: string;
  weightKg: number;
  bodyFatPercent?: number;
  muscleMassKg?: number;
  bodyWaterPercent?: number;
  visceralFatIndex?: number;
  source: 'manual' | 'imported' | 'scale';
  notes?: string;
}


interface WeightTrendSummary {
  currentWeightKg?: number;
  currentBodyFatPercent?: number;
  latestMeasurementDate?: string;
  recentAverageKg?: number;
  previousAverageKg?: number;
  changeKg?: number;
  changePercent?: number;
  recentEntries: number;
  previousEntries: number;
}


type HealthMetricFamily =
  | 'composition'
  | 'measurements';


type HealthChartMetric =
  | 'weight'
  | 'bodyFat'
  | 'muscle'
  | 'bodyWater'
  | 'visceralFat'
  | 'waist'
  | 'abdomen'
  | 'chest'
  | 'shoulders'
  | 'neck'
  | 'leftArm'
  | 'rightArm'
  | 'leftThigh'
  | 'rightThigh';


interface HealthMetricOption {
  key: HealthChartMetric;
  label: string;
  unit: string;
}

type HealthChartPeriod =
  | 30
  | 90
  | 365
  | 'all';


interface BodyMeasurement {
  id: string;
  measurementDate: string;
  waistCm?: number;
  abdomenCm?: number;
  chestCm?: number;
  shouldersCm?: number;
  neckCm?: number;
  leftArmCm?: number;
  rightArmCm?: number;
  leftThighCm?: number;
  rightThighCm?: number;
  notes?: string;
}


interface DailyCheckIn {
  id: string;
  measurementDate: string;
  hunger?: number;
  dietAdherencePercent?: number;
  notes?: string;
}


interface WeeklyCheckIn {
  id: string;
  weekStart: string;
  fatigue?: number;
  hunger?: number;
  recovery?: number;
  motivation?: number;
  waistCm?: number;
  dietAdherencePercent?: number;
  notes?: string;
}


@Component({
  selector: 'app-health',
  standalone: true,
  imports: [
    CommonModule
  ],
  templateUrl: './health.html',
  styleUrl: './health.scss'
})
export class Health implements OnInit {

  readonly Math = Math;

  private readonly apiUrl =
    environment.apiUrl;

  weights = signal<WeightEntry[]>([]);
  summary =
    signal<WeightTrendSummary | null>(null);
  checkins =
    signal<WeeklyCheckIn[]>([]);
  dailyCheckins =
    signal<DailyCheckIn[]>([]);
  bodyMeasurements =
    signal<BodyMeasurement[]>([]);

  activeSection =
    signal<'metrics' | 'weekly'>('metrics');

  metricEntryMode =
    signal<'weight' | 'body'>('weight');

  stateEntryMode =
    signal<'daily' | 'weekly'>('daily');

  metricFamily =
    signal<HealthMetricFamily>(
      'composition'
    );

  chartMetric =
    signal<HealthChartMetric>('weight');

  historyMetric =
    signal<HealthChartMetric>('weight');

  chartPeriod =
    signal<HealthChartPeriod>(90);

  loading = signal(false);
  savingWeight = signal(false);
  savingCheckin = signal(false);
  savingDailyCheckin = signal(false);
  savingBodyMeasurement = signal(false);
  deletingWeight = signal<string | null>(null);

  message = signal<string | null>(null);
  error = signal<string | null>(null);

  weightDate = signal(
    this.localDate(new Date())
  );

  weightKg = signal('');
  bodyFatPercent = signal('');
  muscleMassKg = signal('');
  bodyWaterPercent = signal('');
  visceralFatIndex = signal('');

  bodyMeasurementDate = signal(
    this.localDate(new Date())
  );

  waistMeasurementCm = signal('');
  abdomenCm = signal('');
  chestCm = signal('');
  shouldersCm = signal('');
  neckCm = signal('');
  leftArmCm = signal('');
  rightArmCm = signal('');
  leftThighCm = signal('');
  rightThighCm = signal('');


  checkinWeekStart = signal(
    this.currentMonday()
  );

  dailyDate = signal(
    this.localDate(new Date())
  );
  dailyHunger = signal('');
  dailyAdherence = signal('');

  fatigue = signal('');
  recovery = signal('');
  motivation = signal('');
  waistCm = signal('');


  constructor(
    private http: HttpClient,
    public auth: AuthService
  ) {}


  async ngOnInit(): Promise<void> {
    await this.loadHealth();
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


  async loadHealth(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const headers =
        await this.authHeaders();

      const [
        summary,
        weights,
        checkins,
        dailyCheckins,
        bodyMeasurements
      ] = await Promise.all([
        firstValueFrom(
          this.http.get<WeightTrendSummary>(
            `${this.apiUrl}/health/weight-summary`,
            { headers }
          )
        ),
        firstValueFrom(
          this.http.get<WeightEntry[]>(
            `${this.apiUrl}/health/weights`,
            { headers }
          )
        ),
        firstValueFrom(
          this.http.get<WeeklyCheckIn[]>(
            `${this.apiUrl}/health/checkins`,
            { headers }
          )
        ),
        firstValueFrom(
          this.http.get<DailyCheckIn[]>(
            `${this.apiUrl}/health/daily-checkins`,
            { headers }
          )
        ),
        firstValueFrom(
          this.http.get<BodyMeasurement[]>(
            `${this.apiUrl}/health/body-measurements`,
            { headers }
          )
        )
      ]);

      this.summary.set(summary);
      this.weights.set(weights);
      this.checkins.set(checkins);
      this.dailyCheckins.set(dailyCheckins);
      this.bodyMeasurements.set(
        bodyMeasurements
      );

      const currentDaily =
        dailyCheckins.find(
          item =>
            item.measurementDate ===
            this.dailyDate()
        );

      this.dailyHunger.set(
        currentDaily?.hunger?.toString()
        ?? ''
      );

      this.dailyAdherence.set(
        currentDaily
          ?.dietAdherencePercent
          ?.toString()
        ?? ''
      );

      const currentCheckin =
        checkins.find(
          item =>
            item.weekStart ===
            this.checkinWeekStart()
        );

      if (currentCheckin) {
        this.fatigue.set(
          currentCheckin.fatigue?.toString()
          ?? ''
        );
        this.recovery.set(
          currentCheckin.recovery?.toString()
          ?? ''
        );
        this.motivation.set(
          currentCheckin.motivation?.toString()
          ?? ''
        );
        this.waistCm.set(
          currentCheckin.waistCm?.toString()
          ?? ''
        );
      }

    } catch (err: any) {
      this.error.set(
        err?.error?.detail ??
        err?.message ??
        'No se pudieron cargar los datos de salud.'
      );
    } finally {
      this.loading.set(false);
    }
  }


  async saveWeight(): Promise<void> {
    this.error.set(null);
    this.message.set(null);

    const weight =
      Number(this.weightKg());

    if (
      !Number.isFinite(weight)
      || weight < 20
      || weight > 350
    ) {
      this.error.set(
        'Introduce un peso válido.'
      );
      return;
    }

    const bodyFatText =
      this.bodyFatPercent().trim();

    const bodyFat =
      bodyFatText === ''
        ? null
        : Number(bodyFatText);

    if (
      bodyFat !== null
      && (
        !Number.isFinite(bodyFat)
        || bodyFat < 0
        || bodyFat > 100
      )
    ) {
      this.error.set(
        'El porcentaje de grasa no es válido.'
      );
      return;
    }

    const muscleText =
      this.muscleMassKg().trim();

    const muscle =
      muscleText === ''
        ? null
        : Number(muscleText);

    if (
      muscle !== null
      && (
        !Number.isFinite(muscle)
        || muscle <= 0
        || muscle > 250
      )
    ) {
      this.error.set(
        'La masa muscular no es válida.'
      );
      return;
    }

    const waterText =
      this.bodyWaterPercent().trim();

    const water =
      waterText === ''
        ? null
        : Number(waterText);

    if (
      water !== null
      && (
        !Number.isFinite(water)
        || water < 0
        || water > 100
      )
    ) {
      this.error.set(
        'El porcentaje de agua no es válido.'
      );
      return;
    }

    const visceralText =
      this.visceralFatIndex().trim();

    const visceral =
      visceralText === ''
        ? null
        : Number(visceralText);

    if (
      visceral !== null
      && (
        !Number.isFinite(visceral)
        || visceral < 0
      )
    ) {
      this.error.set(
        'La grasa visceral no es válida.'
      );
      return;
    }

    this.savingWeight.set(true);

    try {
      const headers =
        await this.authHeaders();

      const payload: {
        weightKg: number;
        bodyFatPercent?: number;
        muscleMassKg?: number;
        bodyWaterPercent?: number;
        visceralFatIndex?: number;
        source: 'manual';
      } = {
        weightKg: weight,
        source: 'manual'
      };

      if (bodyFat !== null) {
        payload.bodyFatPercent = bodyFat;
      }

      if (muscle !== null) {
        payload.muscleMassKg = muscle;
      }

      if (water !== null) {
        payload.bodyWaterPercent = water;
      }

      if (visceral !== null) {
        payload.visceralFatIndex = visceral;
      }

      await firstValueFrom(
        this.http.put(
          (
            `${this.apiUrl}/health/weights/`
            + this.weightDate()
          ),
          payload,
          { headers }
        )
      );

      await this.loadHealth();

      this.weightKg.set('');
      this.bodyFatPercent.set('');
      this.muscleMassKg.set('');
      this.bodyWaterPercent.set('');
      this.visceralFatIndex.set('');

      this.message.set(
        'Peso registrado correctamente.'
      );

    } catch (err: any) {
      this.error.set(
        err?.error?.detail ??
        err?.message ??
        'No se pudo guardar el peso.'
      );
    } finally {
      this.savingWeight.set(false);
    }
  }


  async deleteWeight(
    measurementDate: string
  ): Promise<void> {

    const confirmed =
      window.confirm(
        `¿Eliminar el peso del ${measurementDate}?`
      );

    if (!confirmed) {
      return;
    }

    this.error.set(null);
    this.message.set(null);
    this.deletingWeight.set(
      measurementDate
    );

    try {
      const headers =
        await this.authHeaders();

      await firstValueFrom(
        this.http.delete(
          (
            `${this.apiUrl}/health/weights/`
            + measurementDate
          ),
          { headers }
        )
      );

      await this.loadHealth();

      this.message.set(
        'Registro de peso eliminado.'
      );

    } catch (err: any) {
      this.error.set(
        err?.error?.detail ??
        err?.message ??
        'No se pudo eliminar el peso.'
      );
    } finally {
      this.deletingWeight.set(null);
    }
  }


  async saveBodyMeasurement(): Promise<void> {
    this.error.set(null);
    this.message.set(null);

    const definitions = [
      [
        'waistCm',
        this.waistMeasurementCm(),
        30,
        250,
      ],
      [
        'abdomenCm',
        this.abdomenCm(),
        30,
        250,
      ],
      [
        'chestCm',
        this.chestCm(),
        30,
        250,
      ],
      [
        'shouldersCm',
        this.shouldersCm(),
        30,
        250,
      ],
      [
        'neckCm',
        this.neckCm(),
        20,
        100,
      ],
      [
        'leftArmCm',
        this.leftArmCm(),
        10,
        100,
      ],
      [
        'rightArmCm',
        this.rightArmCm(),
        10,
        100,
      ],
      [
        'leftThighCm',
        this.leftThighCm(),
        20,
        150,
      ],
      [
        'rightThighCm',
        this.rightThighCm(),
        20,
        150,
      ],
    ] as const;

    const payload: Record<string, number> = {};

    for (
      const [
        key,
        rawValue,
        minimum,
        maximum
      ] of definitions
    ) {
      const text = rawValue.trim();

      if (!text) {
        continue;
      }

      const value = Number(text);

      if (
        !Number.isFinite(value)
        || value < minimum
        || value > maximum
      ) {
        this.error.set(
          'Revisa las medidas corporales introducidas.'
        );
        return;
      }

      payload[key] = value;
    }

    if (!Object.keys(payload).length) {
      this.error.set(
        'Introduce al menos una medida corporal.'
      );
      return;
    }

    this.savingBodyMeasurement.set(true);

    try {
      const headers =
        await this.authHeaders();

      await firstValueFrom(
        this.http.put(
          (
            `${this.apiUrl}/health/body-measurements/`
            + this.bodyMeasurementDate()
          ),
          payload,
          { headers }
        )
      );

      await this.loadHealth();

      this.waistMeasurementCm.set('');
      this.abdomenCm.set('');
      this.chestCm.set('');
      this.shouldersCm.set('');
      this.neckCm.set('');
      this.leftArmCm.set('');
      this.rightArmCm.set('');
      this.leftThighCm.set('');
      this.rightThighCm.set('');

      this.message.set(
        'Medidas corporales guardadas.'
      );

    } catch (err: any) {
      this.error.set(
        err?.error?.detail ??
        err?.message ??
        'No se pudieron guardar las medidas corporales.'
      );
    } finally {
      this.savingBodyMeasurement.set(false);
    }
  }


  async saveDailyCheckin(): Promise<void> {
    this.error.set(null);
    this.message.set(null);

    const hunger =
      Number(this.dailyHunger());

    const adherence =
      Number(this.dailyAdherence());

    if (
      !Number.isInteger(hunger)
      || hunger < 1
      || hunger > 5
    ) {
      this.error.set(
        'Selecciona el hambre del 1 al 5.'
      );
      return;
    }

    if (
      !Number.isFinite(adherence)
      || adherence < 0
      || adherence > 100
    ) {
      this.error.set(
        'La adherencia debe estar entre 0 y 100 %.'
      );
      return;
    }

    this.savingDailyCheckin.set(true);

    try {
      const headers =
        await this.authHeaders();

      await firstValueFrom(
        this.http.put(
          (
            `${this.apiUrl}/health/daily-checkins/`
            + this.dailyDate()
          ),
          {
            hunger,
            dietAdherencePercent:
              adherence
          },
          { headers }
        )
      );

      await this.loadHealth();

      this.message.set(
        'Estado diario guardado.'
      );

    } catch (err: any) {
      this.error.set(
        err?.error?.detail ??
        err?.message ??
        'No se pudo guardar el estado diario.'
      );
    } finally {
      this.savingDailyCheckin.set(false);
    }
  }


  async saveCheckin(): Promise<void> {
    this.error.set(null);
    this.message.set(null);

    const fatigue =
      Number(this.fatigue());

    const recovery =
      Number(this.recovery());

    const motivation =
      Number(this.motivation());

    const waistText =
      this.waistCm().trim();

    const waist =
      waistText === ''
        ? null
        : Number(waistText);

    const validScale = (
      value: number
    ) =>
      Number.isInteger(value)
      && value >= 1
      && value <= 5;

    if (
      !validScale(fatigue)
      || !validScale(recovery)
      || !validScale(motivation)
    ) {
      this.error.set(
        'Completa fatiga, recuperación y motivación del 1 al 5.'
      );
      return;
    }

    if (
      waist !== null
      && (
        !Number.isFinite(waist)
        || waist < 30
        || waist > 250
      )
    ) {
      this.error.set(
        'Introduce una cintura válida.'
      );
      return;
    }

    this.savingCheckin.set(true);

    try {
      const headers =
        await this.authHeaders();

      const payload: {
        fatigue: number;
        recovery: number;
        motivation: number;
        waistCm?: number;
      } = {
        fatigue,
        recovery,
        motivation
      };

      if (waist !== null) {
        payload.waistCm = waist;
      }

      await firstValueFrom(
        this.http.put(
          (
            `${this.apiUrl}/health/checkins/`
            + this.checkinWeekStart()
          ),
          payload,
          { headers }
        )
      );

      await this.loadHealth();

      this.message.set(
        'Estado semanal guardado.'
      );

    } catch (err: any) {
      this.error.set(
        err?.error?.detail ??
        err?.message ??
        'No se pudo guardar el estado semanal.'
      );
    } finally {
      this.savingCheckin.set(false);
    }
  }


  hasTrend(): boolean {
    const value =
      this.summary()?.changeKg;

    return (
      value !== null
      && value !== undefined
    );
  }


  latestBodyFat(): number | undefined {
    return this.latestWeightMetric(
      'bodyFatPercent'
    );
  }


  bodyFatTrend(): number | undefined {
    return this.weightMetricTrend(
      'bodyFatPercent'
    );
  }


  latestMuscleMass(): number | undefined {
    return this.latestWeightMetric(
      'muscleMassKg'
    );
  }


  muscleMassTrend(): number | undefined {
    return this.weightMetricTrend(
      'muscleMassKg'
    );
  }


  latestWaist(): number | undefined {
    const bodyEntries =
      this.bodyMeasurements()
        .filter(
          item =>
            typeof item.waistCm === 'number'
        )
        .sort(
          (a, b) =>
            b.measurementDate.localeCompare(
              a.measurementDate
            )
        );

    if (bodyEntries.length) {
      return bodyEntries[0].waistCm;
    }

    const legacyEntries =
      this.checkins()
        .filter(
          item =>
            typeof item.waistCm === 'number'
        )
        .sort(
          (a, b) =>
            b.weekStart.localeCompare(
              a.weekStart
            )
        );

    return legacyEntries[0]?.waistCm;
  }


  waistTrend(): number | undefined {
    const bodyEntries =
      this.bodyMeasurements()
        .filter(
          item =>
            typeof item.waistCm === 'number'
        )
        .sort(
          (a, b) =>
            b.measurementDate.localeCompare(
              a.measurementDate
            )
        );

    if (bodyEntries.length >= 2) {
      return (
        bodyEntries[0].waistCm!
        - bodyEntries[1].waistCm!
      );
    }

    const legacyEntries =
      this.checkins()
        .filter(
          item =>
            typeof item.waistCm === 'number'
        )
        .sort(
          (a, b) =>
            b.weekStart.localeCompare(
              a.weekStart
            )
        );

    if (legacyEntries.length < 2) {
      return undefined;
    }

    return (
      legacyEntries[0].waistCm!
      - legacyEntries[1].waistCm!
    );
  }


  private latestWeightMetric(
    metric:
      'bodyFatPercent'
      | 'muscleMassKg'
  ): number | undefined {

    const entry =
      this.weights()
        .filter(
          item =>
            typeof item[metric] === 'number'
        )
        .sort(
          (a, b) =>
            b.measurementDate.localeCompare(
              a.measurementDate
            )
        )[0];

    return entry?.[metric];
  }


  private weightMetricTrend(
    metric:
      'bodyFatPercent'
      | 'muscleMassKg'
  ): number | undefined {

    const entries =
      this.weights()
        .filter(
          item =>
            typeof item[metric] === 'number'
        )
        .sort(
          (a, b) =>
            b.measurementDate.localeCompare(
              a.measurementDate
            )
        );

    if (!entries.length) {
      return undefined;
    }

    const anchor =
      this.dayNumber(
        entries[0].measurementDate
      );

    const recent =
      entries.filter(item => {
        const day =
          this.dayNumber(
            item.measurementDate
          );

        return (
          day >= anchor - 6
          && day <= anchor
        );
      });

    const previous =
      entries.filter(item => {
        const day =
          this.dayNumber(
            item.measurementDate
          );

        return (
          day >= anchor - 13
          && day <= anchor - 7
        );
      });

    if (
      recent.length < 2
      || previous.length < 2
    ) {
      return undefined;
    }

    const average = (
      values: WeightEntry[]
    ) =>
      values.reduce(
        (sum, item) =>
          sum + (item[metric] as number),
        0
      ) / values.length;

    return (
      average(recent)
      - average(previous)
    );
  }


  private dayNumber(
    dateValue: string
  ): number {
    return (
      Date.parse(
        `${dateValue}T00:00:00Z`
      )
      / 86_400_000
    );
  }


  metricOptions(
    family: HealthMetricFamily =
      this.metricFamily()
  ): HealthMetricOption[] {

    if (family === 'composition') {
      return [
        {
          key: 'weight',
          label: 'Peso',
          unit: 'kg'
        },
        {
          key: 'bodyFat',
          label: 'Grasa corporal',
          unit: '%'
        },
        {
          key: 'muscle',
          label: 'Masa muscular',
          unit: 'kg'
        },
        {
          key: 'bodyWater',
          label: 'Agua corporal',
          unit: '%'
        },
        {
          key: 'visceralFat',
          label: 'Grasa visceral',
          unit: ''
        }
      ];
    }

    return [
      {
        key: 'waist',
        label: 'Cintura',
        unit: 'cm'
      },
      {
        key: 'abdomen',
        label: 'Abdomen',
        unit: 'cm'
      },
      {
        key: 'chest',
        label: 'Pecho',
        unit: 'cm'
      },
      {
        key: 'shoulders',
        label: 'Hombros',
        unit: 'cm'
      },
      {
        key: 'neck',
        label: 'Cuello',
        unit: 'cm'
      },
      {
        key: 'leftArm',
        label: 'Brazo izquierdo',
        unit: 'cm'
      },
      {
        key: 'rightArm',
        label: 'Brazo derecho',
        unit: 'cm'
      },
      {
        key: 'leftThigh',
        label: 'Muslo izquierdo',
        unit: 'cm'
      },
      {
        key: 'rightThigh',
        label: 'Muslo derecho',
        unit: 'cm'
      }
    ];
  }


  setMetricFamily(
    value: string
  ): void {

    if (
      value !== 'composition' &&
      value !== 'measurements'
    ) {
      return;
    }

    this.metricFamily.set(value);

    const first =
      this.metricOptions(value)[0];

    this.chartMetric.set(first.key);
    this.historyMetric.set(first.key);
  }


  setChartMetric(
    value: string
  ): void {

    const metric =
      this.metricOptions()
        .find(
          item =>
            item.key === value
        );

    if (metric) {
      this.chartMetric.set(
        metric.key
      );
    }
  }


  setHistoryMetric(
    value: string
  ): void {

    const metric =
      this.metricOptions()
        .find(
          item =>
            item.key === value
        );

    if (metric) {
      this.historyMetric.set(
        metric.key
      );
    }
  }


  metricLabel(
    metric: HealthChartMetric
  ): string {

    const all = [
      ...this.metricOptions(
        'composition'
      ),
      ...this.metricOptions(
        'measurements'
      )
    ];

    return (
      all.find(
        item =>
          item.key === metric
      )?.label ?? metric
    );
  }


  metricUnit(
    metric: HealthChartMetric
  ): string {

    const all = [
      ...this.metricOptions(
        'composition'
      ),
      ...this.metricOptions(
        'measurements'
      )
    ];

    return (
      all.find(
        item =>
          item.key === metric
      )?.unit ?? ''
    );
  }


  metricSeries(
    metric: HealthChartMetric
  ): {
    date: string;
    value: number;
  }[] {

    const entries: {
      date: string;
      value: number;
    }[] = [];


    const weightFields:
      Partial<
        Record<
          HealthChartMetric,
          keyof WeightEntry
        >
      > = {
        weight: 'weightKg',
        bodyFat: 'bodyFatPercent',
        muscle: 'muscleMassKg',
        bodyWater:
          'bodyWaterPercent',
        visceralFat:
          'visceralFatIndex'
      };


    const measurementFields:
      Partial<
        Record<
          HealthChartMetric,
          keyof BodyMeasurement
        >
      > = {
        waist: 'waistCm',
        abdomen: 'abdomenCm',
        chest: 'chestCm',
        shoulders: 'shouldersCm',
        neck: 'neckCm',
        leftArm: 'leftArmCm',
        rightArm: 'rightArmCm',
        leftThigh: 'leftThighCm',
        rightThigh: 'rightThighCm'
      };


    const weightField =
      weightFields[metric];

    if (weightField) {

      for (
        const item
        of this.weights()
      ) {

        const value =
          item[weightField];

        if (
          typeof value === 'number'
        ) {
          entries.push({
            date:
              item.measurementDate,
            value
          });
        }
      }
    }


    const measurementField =
      measurementFields[metric];

    if (measurementField) {

      for (
        const item
        of this.bodyMeasurements()
      ) {

        const value =
          item[measurementField];

        if (
          typeof value === 'number'
        ) {
          entries.push({
            date:
              item.measurementDate,
            value
          });
        }
      }
    }


    return entries.sort(
      (a, b) =>
        a.date.localeCompare(b.date)
    );
  }


  metricLatest(
    metric: HealthChartMetric
  ): number | undefined {

    const series =
      this.metricSeries(metric);

    return (
      series.length
        ? series[
            series.length - 1
          ].value
        : undefined
    );
  }


  metricChange(
    metric: HealthChartMetric
  ): number | undefined {

    const series =
      this.metricSeries(metric);

    if (series.length < 2) {
      return undefined;
    }

    return Number(
      (
        series[
          series.length - 1
        ].value
        - series[
            series.length - 2
          ].value
      ).toFixed(2)
    );
  }


  summaryMetrics(): {
    key: HealthChartMetric;
    label: string;
    unit: string;
    value?: number;
    change?: number;
  }[] {

    return this.metricOptions()
      .map(
        metric => ({
          ...metric,
          value:
            this.metricLatest(
              metric.key
            ),
          change:
            this.metricChange(
              metric.key
            )
        })
      );
  }


  historySeries(): {
    date: string;
    value: number;
  }[] {

    return [
      ...this.metricSeries(
        this.historyMetric()
      )
    ]
      .reverse()
      .slice(0, 20);
  }


  chartSeries(): {
    date: string;
    value: number;
  }[] {

    const entries =
      this.metricSeries(
        this.chartMetric()
      );

    const period =
      this.chartPeriod();

    if (
      period === 'all'
      || entries.length === 0
    ) {
      return entries;
    }

    const latestDay =
      this.dayNumber(
        entries[
          entries.length - 1
        ].date
      );

    const cutoff =
      latestDay - period + 1;

    return entries.filter(
      item =>
        this.dayNumber(
          item.date
        ) >= cutoff
    );
  }


  chartMetricLabel(): string {
    return this.metricLabel(
      this.chartMetric()
    );
  }


  chartUnit(): string {
    return this.metricUnit(
      this.chartMetric()
    );
  }


  chartCurrentValue(): number | undefined {
    const series = this.chartSeries();

    return series.length
      ? series[series.length - 1].value
      : undefined;
  }


  chartChange(): number | undefined {
    const series = this.chartSeries();

    if (series.length < 2) {
      return undefined;
    }

    return Number(
      (
        series[series.length - 1].value
        - series[0].value
      ).toFixed(2)
    );
  }


  chartChangeUnit(): string {
    return (
      this.chartMetric() === 'bodyFat'
      || this.chartMetric() === 'bodyWater'
        ? 'pp'
        : this.chartMetric() === 'visceralFat'
          ? 'puntos'
          : this.chartUnit()
    );
  }


  chartVisibleRangeLabel(): string {
    const series = this.chartSeries();

    if (!series.length) {
      return '';
    }

    if (series.length === 1) {
      return this.formatChartDate(
        series[0].date
      );
    }

    return (
      this.formatChartDate(
        series[0].date
      )
      + ' → '
      + this.formatChartDate(
        series[series.length - 1].date
      )
    );
  }


  chartMin(): number | undefined {
    return this.chartDomain()?.min;
  }


  chartMax(): number | undefined {
    return this.chartDomain()?.max;
  }


  chartTicks(): number[] {
    const domain = this.chartDomain();

    if (!domain) {
      return [];
    }

    const steps = 4;

    return Array.from(
      { length: steps + 1 },
      (_, index) =>
        domain.max
        - (
            (
              domain.max - domain.min
            ) / steps
          ) * index
    );
  }


  chartGridY(index: number): number {
    return 8 + index * 21;
  }


  chartX(dateValue: string): number {
    const series = this.chartSeries();

    if (series.length <= 1) {
      return 50;
    }

    const first =
      this.dayNumber(series[0].date);

    const last =
      this.dayNumber(
        series[series.length - 1].date
      );

    const current =
      this.dayNumber(dateValue);

    if (last === first) {
      return 50;
    }

    return (
      3
      + (
          (current - first)
          / (last - first)
        ) * 94
    );
  }


  chartY(value: number): number {
    const domain = this.chartDomain();

    if (!domain) {
      return 50;
    }

    const range =
      domain.max - domain.min;

    if (range <= 0) {
      return 50;
    }

    return (
      8
      + (
          (domain.max - value)
          / range
        ) * 84
    );
  }


  chartPoints(): string {
    return this.chartSeries()
      .map(
        item =>
          `${this.chartX(item.date)},`
          + `${this.chartY(item.value)}`
      )
      .join(' ');
  }


  chartXAxisLabels(): {
    date: string;
    label: string;
    x: number;
  }[] {
    const series = this.chartSeries();

    if (!series.length) {
      return [];
    }

    const wanted =
      Math.min(series.length, 5);

    if (wanted === 1) {
      return [{
        date: series[0].date,
        label: this.formatChartDate(
          series[0].date
        ),
        x: 50
      }];
    }

    const indices =
      Array.from(
        { length: wanted },
        (_, index) =>
          Math.round(
            index
            * (series.length - 1)
            / (wanted - 1)
          )
      );

    return [
      ...new Set(indices)
    ].map(index => ({
      date: series[index].date,
      label: this.formatChartDate(
        series[index].date
      ),
      x: this.chartX(
        series[index].date
      )
    }));
  }


  formatChartDate(
    dateValue: string
  ): string {
    const [
      yearText,
      monthText,
      dayText
    ] = dateValue.split('-');

    const months = [
      'ene',
      'feb',
      'mar',
      'abr',
      'may',
      'jun',
      'jul',
      'ago',
      'sep',
      'oct',
      'nov',
      'dic'
    ];

    const month =
      months[
        Number(monthText) - 1
      ] ?? '';

    const year =
      Number(yearText);

    const currentYear =
      new Date().getFullYear();

    return (
      `${Number(dayText)} ${month}`
      + (
          year !== currentYear
            ? ` ${year}`
            : ''
        )
    );
  }


  private chartDomain(): {
    min: number;
    max: number;
  } | null {
    const values =
      this.chartSeries().map(
        item => item.value
      );

    if (!values.length) {
      return null;
    }

    const rawMin =
      Math.min(...values);

    const rawMax =
      Math.max(...values);

    const range =
      rawMax - rawMin;

    const padding =
      range === 0
        ? Math.max(
            Math.abs(rawMin) * 0.01,
            0.5
          )
        : Math.max(
            range * 0.12,
            0.25
          );

    return {
      min: rawMin - padding,
      max: rawMax + padding
    };
  }


  buildHealthExportWorkbook():
    XLSX.WorkBook {

    const workbook =
      XLSX.utils.book_new();

    const sortByDate = <
      T extends {
        measurementDate: string
      }
    >(
      values: T[]
    ): T[] =>
      [...values].sort(
        (a, b) =>
          a.measurementDate
            .localeCompare(
              b.measurementDate
            )
      );


    const allMetrics = [
      ...this.metricOptions(
        'composition'
      ).map(
        metric => ({
          family:
            'Peso y composición',
          ...metric
        })
      ),

      ...this.metricOptions(
        'measurements'
      ).map(
        metric => ({
          family:
            'Medidas corporales',
          ...metric
        })
      )
    ];


    const summaryRows = [
      [
        'GymOS Health Export',
        'Versión 1'
      ],
      [
        'Exportado',
        new Date().toISOString()
      ],
      [],
      [
        'Familia',
        'Métrica',
        'Último valor',
        'Unidad',
        'Cambio vs anterior'
      ],

      ...allMetrics.map(
        metric => [
          metric.family,
          metric.label,
          this.metricLatest(
            metric.key
          ) ?? '',
          metric.unit,
          this.metricChange(
            metric.key
          ) ?? ''
        ]
      ),

      [],
      [
        'Peso - media últimos 7 días',
        this.summary()
          ?.recentAverageKg ?? '',
        'kg'
      ],
      [
        'Peso - media período anterior',
        this.summary()
          ?.previousAverageKg ?? '',
        'kg'
      ],
      [
        'Peso - cambio entre períodos',
        this.summary()
          ?.changeKg ?? '',
        'kg'
      ],
      [
        'Peso - cambio porcentual',
        this.summary()
          ?.changePercent ?? '',
        '%'
      ]
    ];


    const weightRows = [
      [
        'Fecha',
        'Peso (kg)',
        'Grasa corporal (%)',
        'Masa muscular (kg)',
        'Agua corporal (%)',
        'Índice grasa visceral',
        'Origen',
        'Notas'
      ],

      ...sortByDate(
        this.weights()
      ).map(
        item => [
          item.measurementDate,
          item.weightKg,
          item.bodyFatPercent ?? '',
          item.muscleMassKg ?? '',
          item.bodyWaterPercent ?? '',
          item.visceralFatIndex ?? '',
          item.source,
          item.notes ?? ''
        ]
      )
    ];


    const bodyRows = [
      [
        'Fecha',
        'Cintura (cm)',
        'Abdomen (cm)',
        'Pecho (cm)',
        'Hombros (cm)',
        'Cuello (cm)',
        'Brazo izquierdo (cm)',
        'Brazo derecho (cm)',
        'Muslo izquierdo (cm)',
        'Muslo derecho (cm)',
        'Notas'
      ],

      ...sortByDate(
        this.bodyMeasurements()
      ).map(
        item => [
          item.measurementDate,
          item.waistCm ?? '',
          item.abdomenCm ?? '',
          item.chestCm ?? '',
          item.shouldersCm ?? '',
          item.neckCm ?? '',
          item.leftArmCm ?? '',
          item.rightArmCm ?? '',
          item.leftThighCm ?? '',
          item.rightThighCm ?? '',
          item.notes ?? ''
        ]
      )
    ];


    const dailyRows = [
      [
        'Fecha',
        'Hambre (1-5)',
        'Adherencia nutricional (%)',
        'Notas'
      ],

      ...sortByDate(
        this.dailyCheckins()
      ).map(
        item => [
          item.measurementDate,
          item.hunger ?? '',
          item.dietAdherencePercent
            ?? '',
          item.notes ?? ''
        ]
      )
    ];


    const weeklyRows = [
      [
        'Semana',
        'Fatiga (1-5)',
        'Hambre (1-5)',
        'Recuperación (1-5)',
        'Motivación (1-5)',
        'Cintura legacy (cm)',
        'Adherencia nutricional (%)',
        'Notas'
      ],

      ...[...this.checkins()]
        .sort(
          (a, b) =>
            a.weekStart.localeCompare(
              b.weekStart
            )
        )
        .map(
          item => [
            item.weekStart,
            item.fatigue ?? '',
            item.hunger ?? '',
            item.recovery ?? '',
            item.motivation ?? '',
            item.waistCm ?? '',
            item.dietAdherencePercent
              ?? '',
            item.notes ?? ''
          ]
        )
    ];


    const sheets = [
      [
        'Resumen',
        summaryRows
      ],
      [
        'Peso y composición',
        weightRows
      ],
      [
        'Medidas corporales',
        bodyRows
      ],
      [
        'Estado diario',
        dailyRows
      ],
      [
        'Estado semanal',
        weeklyRows
      ]
    ] as const;


    for (
      const [name, rows]
      of sheets
    ) {

      const sheet =
        XLSX.utils.aoa_to_sheet(
          rows
        );

      sheet['!cols'] =
        Array.from(
          {
            length:
              Math.max(
                ...rows.map(
                  row => row.length
                )
              )
          },
          () => ({
            wch: 22
          })
        );

      XLSX.utils.book_append_sheet(
        workbook,
        sheet,
        name
      );
    }

    return workbook;
  }


  exportHealthData(): void {

    const workbook =
      this.buildHealthExportWorkbook();

    const today =
      new Date()
        .toISOString()
        .slice(0, 10);

    XLSX.writeFile(
      workbook,
      `gymos-health-${today}.xlsx`
    );
  }


  trendArrow(
    value: number | null | undefined,
    threshold = 0.05
  ): string {
    if (
      value === null
      || value === undefined
      || Math.abs(value) < threshold
    ) {
      return '→';
    }

    return value > 0 ? '↑' : '↓';
  }


  private currentMonday(): string {
    const today =
      new Date();

    const day =
      today.getDay();

    const diff =
      day === 0
        ? -6
        : 1 - day;

    const monday =
      new Date(today);

    monday.setDate(
      today.getDate() + diff
    );

    return this.localDate(monday);
  }


  private localDate(
    value: Date
  ): string {

    const year =
      value.getFullYear();

    const month =
      String(
        value.getMonth() + 1
      ).padStart(2, '0');

    const day =
      String(
        value.getDate()
      ).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }
}
