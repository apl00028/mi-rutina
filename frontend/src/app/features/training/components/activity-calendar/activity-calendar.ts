import { Component, computed, input, output } from '@angular/core';

export type ActivityDiscipline = 'strength' | 'swimming' | 'running' | 'cycling' | 'unknown';
export interface PerformanceCalendarEvent {
  id: string;
  discipline: ActivityDiscipline;
  event_at: string | null;
  title: string;
  started_at?: string | null;
  finished_at?: string | null;
  duration_seconds?: number | null;
}
export interface PerformanceCalendarDay {
  dateKey: string;
  dayNumber: number;
  inMonth: boolean;
  events: PerformanceCalendarEvent[];
  selected: boolean;
}
export const activityDisciplines: ActivityDiscipline[] = ['strength', 'swimming', 'running', 'cycling'];
export const disciplineInitial = (discipline: ActivityDiscipline) =>
  ({ strength: 'F', swimming: 'N', running: 'C', cycling: 'B', unknown: '?' })[discipline];
export const disciplineLabel = (discipline: ActivityDiscipline) =>
  ({ strength: 'Fuerza', swimming: 'Natación', running: 'Carrera', cycling: 'Ciclismo', unknown: 'Sin disciplina disponible' })[discipline];
export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function activityDateKey(value: string | null | undefined): string | null {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? localDateKey(date) : null;
}
export function calendarDateLabel(key: string): string {
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${key}T12:00:00Z`));
}

@Component({
  selector: 'app-activity-calendar',
  standalone: true,
  templateUrl: './activity-calendar.html',
  styleUrl: './activity-calendar.scss',
})
export class ActivityCalendar {
  readonly month = input.required<string>();
  readonly events = input<PerformanceCalendarEvent[]>([]);
  readonly selectedDate = input<string | null>(null);
  readonly monthChange = output<string>();
  readonly daySelected = output<PerformanceCalendarDay>();
  readonly disciplines = computed(() => this.events().some(event => event.discipline === 'unknown')
    ? [...activityDisciplines, 'unknown' as const] : activityDisciplines);
  readonly initial = disciplineInitial;
  readonly label = disciplineLabel;
  readonly monthLabel = computed(() => new Intl.DateTimeFormat('es-ES', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${this.month()}-01T00:00:00Z`)));
  readonly days = computed(() => {
    const month = this.month();
    const start = new Date(`${month}-01T00:00:00Z`);
    const firstWeekday = start.getUTCDay() || 7;
    const gridStart = new Date(start);
    gridStart.setUTCDate(2 - firstWeekday);
    const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
    const byDate = new Map<string, PerformanceCalendarEvent[]>();
    for (const event of this.events()) {
      const key = activityDateKey(event.event_at);
      if (key) byDate.set(key, [...(byDate.get(key) ?? []), event]);
    }
    return Array.from({ length: Math.ceil((firstWeekday - 1 + last.getUTCDate()) / 7) * 7 }, (_, index) => {
      const date = new Date(gridStart);
      date.setUTCDate(gridStart.getUTCDate() + index);
      const dateKey = date.toISOString().slice(0, 10);
      return { dateKey, dayNumber: date.getUTCDate(), inMonth: dateKey.startsWith(month),
        events: byDate.get(dateKey) ?? [], selected: dateKey === this.selectedDate() };
    });
  });
  shiftMonth(delta: number): void {
    const date = new Date(`${this.month()}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + delta);
    this.monthChange.emit(date.toISOString().slice(0, 7));
  }
  dayLabel(day: PerformanceCalendarDay): string {
    return `${calendarDateLabel(day.dateKey)}, ${day.events.length} ${day.events.length === 1 ? 'sesión' : 'sesiones'}`;
  }
  marks(day: PerformanceCalendarDay) {
    return this.disciplines().flatMap(discipline => {
      const count = day.events.filter(event => event.discipline === discipline).length;
      return count ? [{ discipline, label: `${disciplineInitial(discipline)}${count > 1 ? `×${count}` : ''}` }] : [];
    });
  }
}
