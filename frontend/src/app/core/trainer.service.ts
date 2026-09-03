import {
  Injectable
} from '@angular/core';

import {
  HttpClient,
  HttpHeaders
} from '@angular/common/http';

import {
  firstValueFrom
} from 'rxjs';

import {
  AuthService
} from './auth.service';

import {
  environment
} from '../../environments/environment';


export type TrainerDiscipline =
  | 'strength'
  | 'swimming'
  | 'cycling'
  | 'running';


export interface TrainerAthlete {
  athlete_id: string;
  status: 'active' | 'inactive';
  email: string | null;
  display_name: string | null;
  client_since: string;
}


export interface TrainerAthleteHealth {
  measurement_date: string | null;
  weight_kg: number | null;
  body_fat_percent: number | null;
  muscle_mass_kg: number | null;
  body_water_percent: number | null;
  visceral_fat_index: number | null;
  waist_cm: number | null;
}


export interface TrainerAthleteLastWorkout {
  workout_id: string | null;
  routine_id: string | null;
  session_id: string | null;
  session_name: string | null;
  finished_at: string | null;
}


export interface TrainerAthleteRecentTraining {
  last_completed: TrainerAthleteLastWorkout | null;
  completed_last_7_days: number;
}


export interface TrainerAthleteActiveRoutine {
  routine_id: string | null;
  activated_at: string | null;
}


export interface TrainerAthleteActiveRoutines {
  strength: TrainerAthleteActiveRoutine | null;
  swimming: TrainerAthleteActiveRoutine | null;
  running: TrainerAthleteActiveRoutine | null;
  cycling: TrainerAthleteActiveRoutine | null;
}


export interface TrainerAthleteLastAssignment {
  template_id: string | null;
  routine_id: string | null;
  discipline: TrainerDiscipline | null;
  assigned_at: string | null;
}


export interface TrainerAthleteTrainerInfo {
  last_assignment: TrainerAthleteLastAssignment | null;
}


export interface TrainerAthleteOverview
  extends TrainerAthlete {
  health: TrainerAthleteHealth;
  recent_training: TrainerAthleteRecentTraining;
  active_routines: TrainerAthleteActiveRoutines;
  trainer: TrainerAthleteTrainerInfo;
}


export interface TrainerRoutineTemplate {
  id: string;
  name: string;
  discipline: TrainerDiscipline;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}


export interface TrainerTemplateAssignment {
  assignment_id: string;
  athlete_id: string;
  template_id: string;
  routine_id: string;
  discipline: TrainerDiscipline;
  assigned_at: string;
}


@Injectable({
  providedIn: 'root'
})
export class TrainerService {
  private readonly apiUrl =
    environment.apiUrl;


  constructor(
    private http: HttpClient,
    private auth: AuthService
  ) {}


  private async headers():
    Promise<HttpHeaders> {
    const token =
      await this.auth.getAccessToken();

    if (!token) {
      throw new Error(
        'No hay una sesión válida.'
      );
    }

    return new HttpHeaders({
      Authorization:
        `Bearer ${token}`
    });
  }


  async listAthletes():
    Promise<TrainerAthlete[]> {
    const headers =
      await this.headers();

    return await firstValueFrom(
      this.http.get<TrainerAthlete[]>(
        `${this.apiUrl}/trainer/athletes`,
        {
          headers
        }
      )
    );
  }


  async getAthleteOverview(
    athleteId: string
  ): Promise<TrainerAthleteOverview> {
    const headers =
      await this.headers();

    return await firstValueFrom(
      this.http.get<TrainerAthleteOverview>(
        (
          `${this.apiUrl}/trainer/athletes/` +
          `${encodeURIComponent(athleteId)}`
        ),
        {
          headers
        }
      )
    );
  }


  async listTemplates():
    Promise<TrainerRoutineTemplate[]> {
    const headers =
      await this.headers();

    return await firstValueFrom(
      this.http.get<
        TrainerRoutineTemplate[]
      >(
        `${this.apiUrl}/trainer/templates`,
        {
          headers
        }
      )
    );
  }


  async assignTemplate(
    templateId: string,
    athleteId: string,
    routineId: string
  ): Promise<TrainerTemplateAssignment> {
    const headers =
      await this.headers();

    return await firstValueFrom(
      this.http.post<
        TrainerTemplateAssignment
      >(
        (
          `${this.apiUrl}/trainer/templates/` +
          `${encodeURIComponent(templateId)}/assign`
        ),
        {
          athlete_id:
            athleteId,
          routine_id:
            routineId
        },
        {
          headers
        }
      )
    );
  }
}
