import { ActivityDiscipline, PerformanceCalendarEvent, disciplineLabel } from '../components/activity-calendar/activity-calendar';
import type { PersistedRunningSession } from '../../../core/running.service';
import { persistedRunningSessionToView } from '../../running/domain/running-session';
import type { SwimmingFitImportResponse } from '../../swimming/domain/swimming-fit-session';

export interface ActivitySet {
  setId: string;
  exerciseId: string;
  setIndex: number;
  setType?: 'warmup' | 'working';
  completedAt?: string | null;
  weight?: number | null;
  reps?: number | null;
  rir?: number | null;
  rpe?: number | null;
  durationSeconds?: number | null;
}
export interface ActivityWorkout {
  workoutId: string;
  routineId: string;
  sessionId: string;
  status: 'in_progress' | 'finished';
  startedAt?: string;
  finishedAt?: string;
  sets: ActivitySet[];
}
export interface ActivityRoutine {
  routineId: string;
  discipline?: ActivityDiscipline | null;
  sessions: Array<{ sessionId: string; name?: string; label?: string;
    exercises?: Array<{ exerciseId: string; name?: string; recordTypes?: string[]; recordType?: string;
      prescription?: { target?: { type?: string } } }> }>;
}
export interface ActivityMetric { label: string; value: string; }
export interface ActivityDetail extends PerformanceCalendarEvent {
  metrics: ActivityMetric[];
  exercises?: Array<{ id: string; name: string; sets: Array<{ label: string; value: string }> }>;
  lengths?: Array<{ label: string; value: string }>;
}
const present = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export function durationLabel(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
function metric(label: string, value: number | null | undefined, unit = '', duration = false): ActivityMetric[] {
  return present(value) ? [{ label, value: duration ? durationLabel(value) + unit : value.toLocaleString('es-ES', { maximumFractionDigits: 2 }) + unit }] : [];
}
function elapsed(start?: string, end?: string): number | undefined {
  const value = start && end ? (Date.parse(end) - Date.parse(start)) / 1000 : NaN;
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}
export function workoutActivities(workouts: ActivityWorkout[], routines: ActivityRoutine[]): ActivityDetail[] {
  return workouts.filter(workout => workout.status === 'finished').map(workout => {
    const routine = routines.find(row => row.routineId === workout.routineId);
    const session = routine?.sessions.find(row => row.sessionId === workout.sessionId);
    // Legacy routines without a discipline use strength throughout the existing workout flow.
    const discipline = routine ? routine.discipline ?? 'strength' : 'unknown';
    const recorded = workout.sets;
    const exercises = [...new Set(recorded.map(set => set.exerciseId))].map(id => {
      const exercise = session?.exercises?.find(row => row.exerciseId === id);
      const sets = recorded.filter(set => set.exerciseId === id).sort((a, b) => {
        if (a.setType === 'warmup' && b.setType !== 'warmup') return -1;
        if (b.setType === 'warmup' && a.setType !== 'warmup') return 1;
        return a.setIndex < 0 && b.setIndex < 0 ? b.setIndex - a.setIndex : a.setIndex - b.setIndex;
      });
      return { id, name: exercise?.name || 'Ejercicio sin nombre', sets: sets.map(set => {
        const duration = exercise?.recordTypes?.includes('duration') || exercise?.recordType === 'duration'
          || exercise?.prescription?.target?.type === 'duration'
          || (present(set.durationSeconds) && !present(set.reps));
        const values = [
          ...metric('Peso', set.weight, ' kg'), ...metric('Repeticiones', set.reps, ' reps'),
          ...metric('Duración', set.durationSeconds, '', true),
        ].map(row => row.value);
        if (duration && present(set.rpe)) values.push(`RPE ${set.rpe}`);
        if (!duration && present(set.rir)) values.push(`RIR ${set.rir}`);
        return { label: set.setType === 'warmup' ? 'Calentamiento' : `Serie ${set.setIndex + 1}`,
          value: values.join(' · ') || (set.completedAt ? 'Completada' : 'Sin métricas registradas') };
      }) };
    });
    return { id: `workout:${workout.workoutId}`, discipline, title: session?.name || session?.label || (discipline === 'unknown' ? 'Sesión registrada' : `Sesión de ${disciplineLabel(discipline).toLowerCase()}`),
      event_at: workout.finishedAt ?? workout.startedAt ?? null,
      started_at: workout.startedAt, finished_at: workout.finishedAt,
      metrics: metric('Tiempo transcurrido', elapsed(workout.startedAt, workout.finishedAt), '', true), exercises };
  });
}
export function runningActivities(sessions: PersistedRunningSession[]): ActivityDetail[] {
  return sessions.map(source => {
    const session = persistedRunningSessionToView(source);
    return { id: `running:${source.id}`, discipline: 'running', title: 'Carrera', event_at: source.started_at,
      metrics: [
        ...metric('Duración', session.durationSeconds, '', true),
        ...metric('Distancia', session.distanceMeters, ' m'),
        ...metric('Ritmo medio desde velocidad', session.paceSecondsPerKmFromSpeed, '/km', true),
        ...metric('Velocidad media', session.speedAverageMetersPerSecond, ' m/s'),
        ...metric('Velocidad máxima', session.speedMaxMetersPerSecond, ' m/s'),
        ...metric('FC media', session.heartRateAverageBpm, ' ppm'),
        ...metric('FC máxima', session.heartRateMaxBpm, ' ppm'),
        ...metric('Vueltas', session.lapCount), ...metric('Segmentos', session.segmentCount),
      ] };
  });
}
export function swimmingActivities(sessions: SwimmingFitImportResponse[]): ActivityDetail[] {
  return sessions.map((session, index) => ({
    // This existing endpoint returns normalized sessions without persistence IDs.
    id: `swimming:${session.start_time ?? 'undated'}:${index}`, discipline: 'swimming', title: 'Natación',
    event_at: session.start_time ?? null,
    metrics: [
      ...metric('Duración', session.total_timer_time_seconds ?? session.total_elapsed_time_seconds ?? session.total_moving_time_seconds, '', true),
      ...metric('Distancia', session.distance_meters, ' m'),
      ...metric('Ritmo medio', session.average_pace_seconds_per_100m, '/100 m', true),
      ...metric('Tiempo en movimiento', session.total_moving_time_seconds, '', true),
      ...metric('Piscina', session.pool_length_meters, ' m'),
      ...metric('Brazadas', session.total_strokes),
      ...metric('Cadencia de brazada', session.average_stroke_rate_spm, '/min'),
      ...metric('Velocidad media', session.average_speed_meters_per_second, ' m/s'),
      ...metric('Velocidad máxima', session.max_speed_meters_per_second, ' m/s'),
      ...metric('FC media', session.heart_rate_average_bpm, ' ppm'),
      ...metric('FC máxima', session.heart_rate_max_bpm, ' ppm'),
      ...metric('Energía', session.total_calories, ' kcal'),
      ...metric('Efecto aeróbico', session.aerobic_training_effect),
      ...metric('Efecto anaeróbico', session.anaerobic_training_effect),
    ],
    lengths: session.lengths.map((length, index) => ({ label: `Largo ${index + 1}`,
      value: [
        ...metric('Distancia', length.distance_meters, ' m'),
        ...metric('Duración', length.duration_seconds, '', true),
        ...metric('Brazadas', length.total_strokes, ' brazadas'),
      ].map(row => row.value).join(' · ') || 'Sin métricas disponibles' })),
  }));
}
