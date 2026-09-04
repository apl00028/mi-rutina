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
  weight_measurement_date: string | null;
  waist_measurement_date: string | null;
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
  name: string | null;
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
  name: string | null;
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


export interface TrainerStrengthSet {
  set_index: number | null;
  set_order: number;
  set_type: string | null;
  reps: number | null;
  weight_kg: number | null;
  rir: number | null;
  rpe: number | null;
  duration_seconds: number | null;
}


export interface TrainerStrengthExercise {
  exercise_id: string;
  exercise_name: string | null;
  sets: TrainerStrengthSet[];
}


export interface TrainerStrengthSession {
  workout_id: string;
  routine_id: string | null;
  session_id: string | null;
  session_name: string | null;
  started_at: string | null;
  finished_at: string | null;
  exercises: TrainerStrengthExercise[];
}


export interface TrainerPerformanceSession {
  id: string;
  discipline: TrainerDiscipline;
  title: string;
  event_at: string;
  finished_at: string | null;
  started_at: string | null;
  duration_seconds?: number | null;
  routine_id?: string | null;
  session_id?: string | null;
  source?: string | null;
}


export interface TrainerSwimmingLength {
  start_time: string | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  total_strokes: number | null;
  average_stroke_rate_spm: number | null;
  stroke: string | null;
  length_type: string | null;
}


export interface TrainerSwimmingSessionDetail {
  id: string;
  discipline: 'swimming';
  title: string;
  event_at: string;
  started_at: string;
  duration_seconds: number | null;
  total_distance_meters: number | null;
  pool_length_meters: number | null;
  total_elapsed_time_seconds: number | null;
  total_timer_time_seconds: number | null;
  total_moving_time_seconds: number | null;
  average_pace_seconds_per_100m: number | null;
  total_strokes: number | null;
  heart_rate_average_bpm: number | null;
  heart_rate_max_bpm: number | null;
  total_calories: number | null;
  aerobic_training_effect: number | null;
  anaerobic_training_effect: number | null;
  average_stroke_rate_spm: number | null;
  average_speed_meters_per_second: number | null;
  max_speed_meters_per_second: number | null;
  objective: string | null;
  technical_focus: string[];
  lengths: TrainerSwimmingLength[];
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


  async listStrengthSessions(
    athleteId: string
  ): Promise<TrainerStrengthSession[]> {
    const headers =
      await this.headers();

    return await firstValueFrom(
      this.http.get<TrainerStrengthSession[]>(
        (
          `${this.apiUrl}/trainer/athletes/` +
          `${encodeURIComponent(athleteId)}/` +
          'strength-sessions'
        ),
        {
          headers
        }
      )
    );
  }


  async listSwimmingSessions(
    athleteId: string
  ): Promise<TrainerPerformanceSession[]> {
    return await this.listPerformanceSessions(
      athleteId,
      'swimming-sessions'
    );
  }


  async listRunningSessions(
    athleteId: string
  ): Promise<TrainerPerformanceSession[]> {
    return await this.listPerformanceSessions(
      athleteId,
      'running-sessions'
    );
  }


  async getSwimmingSession(
    athleteId: string,
    sessionId: string
  ): Promise<TrainerSwimmingSessionDetail> {
    const headers =
      await this.headers();

    return await firstValueFrom(
      this.http.get<
        TrainerSwimmingSessionDetail
      >(
        (
          `${this.apiUrl}/trainer/athletes/` +
          `${encodeURIComponent(athleteId)}/` +
          'swimming-sessions/' +
          encodeURIComponent(sessionId)
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


  private async listPerformanceSessions(
    athleteId: string,
    segment: string
  ): Promise<TrainerPerformanceSession[]> {
    const headers =
      await this.headers();

    return await firstValueFrom(
      this.http.get<
        TrainerPerformanceSession[]
      >(
        (
          `${this.apiUrl}/trainer/athletes/` +
          `${encodeURIComponent(athleteId)}/` +
          segment
        ),
        {
          headers
        }
      )
    );
  }
}
