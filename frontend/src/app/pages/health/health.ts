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


interface WeeklyCheckIn {
  id: string;
  weekStart: string;
  fatigue?: number;
  hunger?: number;
  recovery?: number;
  motivation?: number;
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

  activeSection =
    signal<'metrics' | 'weekly'>('metrics');

  loading = signal(false);
  savingWeight = signal(false);
  savingCheckin = signal(false);
  deletingWeight = signal<string | null>(null);

  message = signal<string | null>(null);
  error = signal<string | null>(null);

  weightDate = signal(
    this.localDate(new Date())
  );

  weightKg = signal('');
  bodyFatPercent = signal('');

  checkinWeekStart = signal(
    this.currentMonday()
  );

  fatigue = signal('');
  hunger = signal('');
  recovery = signal('');
  motivation = signal('');
  adherence = signal('');


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
        checkins
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
        )
      ]);

      this.summary.set(summary);
      this.weights.set(weights);
      this.checkins.set(checkins);

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
        this.hunger.set(
          currentCheckin.hunger?.toString()
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
        this.adherence.set(
          currentCheckin
            .dietAdherencePercent
            ?.toString()
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

    this.savingWeight.set(true);

    try {
      const headers =
        await this.authHeaders();

      const payload: {
        weightKg: number;
        bodyFatPercent?: number;
        source: 'manual';
      } = {
        weightKg: weight,
        source: 'manual'
      };

      if (bodyFat !== null) {
        payload.bodyFatPercent = bodyFat;
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


  async saveCheckin(): Promise<void> {
    this.error.set(null);
    this.message.set(null);

    const fatigue =
      Number(this.fatigue());
    const hunger =
      Number(this.hunger());
    const recovery =
      Number(this.recovery());
    const motivation =
      Number(this.motivation());
    const adherence =
      Number(this.adherence());

    const validScale = (
      value: number
    ) =>
      Number.isInteger(value)
      && value >= 1
      && value <= 5;

    if (
      !validScale(fatigue)
      || !validScale(hunger)
      || !validScale(recovery)
      || !validScale(motivation)
    ) {
      this.error.set(
        'Completa fatiga, hambre, recuperación y motivación del 1 al 5.'
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

    this.savingCheckin.set(true);

    try {
      const headers =
        await this.authHeaders();

      await firstValueFrom(
        this.http.put(
          (
            `${this.apiUrl}/health/checkins/`
            + this.checkinWeekStart()
          ),
          {
            fatigue,
            hunger,
            recovery,
            motivation,
            dietAdherencePercent:
              adherence
          },
          { headers }
        )
      );

      await this.loadHealth();

      this.message.set(
        'Check-in semanal guardado.'
      );

    } catch (err: any) {
      this.error.set(
        err?.error?.detail ??
        err?.message ??
        'No se pudo guardar el check-in.'
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
