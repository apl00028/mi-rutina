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

  private readonly apiUrl =
    environment.apiUrl;

  weights = signal<WeightEntry[]>([]);
  summary =
    signal<WeightTrendSummary | null>(null);
  checkins =
    signal<WeeklyCheckIn[]>([]);
  dailyCheckins =
    signal<DailyCheckIn[]>([]);

  activeSection =
    signal<'metrics' | 'weekly'>('metrics');

  loading = signal(false);
  savingWeight = signal(false);
  savingCheckin = signal(false);
  savingDailyCheckin = signal(false);
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
        dailyCheckins
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
        )
      ]);

      this.summary.set(summary);
      this.weights.set(weights);
      this.checkins.set(checkins);
      this.dailyCheckins.set(dailyCheckins);

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
