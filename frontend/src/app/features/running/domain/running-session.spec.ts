import { describe, expect, it } from 'vitest';
import { PersistedRunningSession } from '../../../core/running.service';
import { persistedRunningSessionToView, runningSessionKey } from './running-session';

describe('Persisted running adapter', () => {
  const session: PersistedRunningSession = {
    id: 'db-id', source: 'health_connect', source_package: 'writer', source_record_id: 'record',
    started_at: '2026-08-30T10:00:00+02:00', ended_at: '2026-08-30T08:25:00.500Z',
    data: { schema_version: 1, exercise_type: 34 },
  };

  it('derives the same elapsed seconds and speed pace as native, preserving unknowns', () => {
    const view = persistedRunningSessionToView({ ...session, data: {
      ...session.data, distance_meters: null, lap_count: 0, has_route: false,
      heart_rate_average_bpm: null, speed_average_meters_per_second: 4,
    } });
    expect(view.durationSeconds).toBe(1500.5);
    expect(view.paceSecondsPerKmFromSpeed).toBe(250);
    expect(view.distanceMeters).toBeNull();
    expect(view.heartRateAverageBpm).toBeNull();
    expect(view.heartRateMaxBpm).toBeUndefined();
    expect(view.lapCount).toBe(0);
    expect(view.segmentCount).toBeUndefined();
    expect(view.hasRoute).toBe(false);
    expect(view.exerciseType).toBe(34);
  });

  it('does not fabricate pace from distance or missing/zero speed', () => {
    for (const speed of [undefined, null, 0]) {
      const view = persistedRunningSessionToView({ ...session, data: {
        ...session.data, distance_meters: 5000, speed_average_meters_per_second: speed,
      } });
      expect(view.paceSecondsPerKmFromSpeed).toBeUndefined();
      expect(view.speedAverageMetersPerSecond).toBe(speed);
    }
  });

  it('uses an unambiguous tuple identity', () => {
    expect(runningSessionKey({ sourcePackage: 'a:b', recordId: 'c' }))
      .not.toBe(runningSessionKey({ sourcePackage: 'a', recordId: 'b:c' }));
  });
});
