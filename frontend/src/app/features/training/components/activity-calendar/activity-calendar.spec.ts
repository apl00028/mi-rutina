import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { ActivityCalendar, activityDateKey } from './activity-calendar';

describe('Shared activity calendar', () => {
  function create(month = '2026-09') {
    const fixture = TestBed.createComponent(ActivityCalendar);
    fixture.componentRef.setInput('month', month);
    fixture.detectChanges();
    return fixture;
  }
  it('builds Monday-first weeks, including leap days and adjacent days', () => {
    const fixture = create('2024-02');
    const days = fixture.componentInstance.days();
    expect(days[0].dateKey).toBe('2024-01-29');
    expect(days.filter(day => day.inMonth)).toHaveLength(29);
    expect(days.at(-1)?.dateKey).toBe('2024-03-03');
  });
  it('navigates across years and emits a day without owning or fetching history', () => {
    const fixture = create('2026-12');
    const month = vi.fn();
    const day = vi.fn();
    fixture.componentInstance.monthChange.subscribe(month);
    fixture.componentInstance.daySelected.subscribe(day);
    fixture.nativeElement.querySelector('[aria-label="Mes siguiente"]').click();
    expect(month).toHaveBeenCalledWith('2027-01');
    fixture.componentRef.setInput('month', '2027-01');
    fixture.componentRef.setInput('selectedDate', '2027-01-01');
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.calendar-day.selected').click();
    expect(day).toHaveBeenCalledWith(expect.objectContaining({ dateKey: '2027-01-01', selected: true }));
    fixture.nativeElement.querySelector('[aria-label="Mes anterior"]').click();
    expect(month).toHaveBeenLastCalledWith('2026-12');
  });
  it('groups in local dates with discipline markers, multiplicity and accessible selection', () => {
    const fixture = create();
    const time = new Date(2026, 8, 9, 0, 15).toISOString();
    fixture.componentRef.setInput('events', ['strength', 'strength', 'running', 'swimming', 'cycling'].map((discipline, index) => ({
      id: String(index), discipline, title: discipline, event_at: time,
    })));
    fixture.componentRef.setInput('selectedDate', '2026-09-09');
    fixture.detectChanges();
    const day = fixture.nativeElement.querySelector('.calendar-day.selected');
    expect(day.getAttribute('aria-pressed')).toBe('true');
    expect(day.getAttribute('aria-label')).toContain('5 sesiones');
    expect(day.textContent).toContain('F×2');
    expect(day.querySelectorAll('.calendar-marks span')).toHaveLength(4);
    expect(activityDateKey(time)).toBe('2026-09-09');
    expect(activityDateKey('invalid')).toBeNull();
  });
});
