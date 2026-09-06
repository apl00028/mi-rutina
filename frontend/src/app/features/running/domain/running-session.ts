import { HealthConnectRunningMetricSession } from '../../../core/health-connect.plugin';
import { PersistedRunningSession } from '../../../core/running.service';

type RunningRequiredField = 'recordId' | 'sourcePackage' | 'exerciseType'
  | 'startTime' | 'endTime' | 'durationSeconds';

// Persisted metrics can be absent/null, unlike mandatory native counters.
export type RunningSessionView = Pick<HealthConnectRunningMetricSession, RunningRequiredField> & {
  [K in Exclude<keyof HealthConnectRunningMetricSession, RunningRequiredField>]?:
    HealthConnectRunningMetricSession[K] | null;
};

export function runningSessionKey(session: Pick<RunningSessionView, 'sourcePackage' | 'recordId'>): string {
  return JSON.stringify([session.sourcePackage, session.recordId]);
}

export function persistedRunningSessionToView(session: PersistedRunningSession): RunningSessionView {
  const data = session.data;
  const speed = data.speed_average_meters_per_second;
  return {
    recordId: session.source_record_id,
    sourcePackage: session.source_package,
    exerciseType: data.exercise_type,
    startTime: session.started_at,
    endTime: session.ended_at,
    // Native: Duration.between(start, end).toMillis() / 1000.0.
    durationSeconds: (Date.parse(session.ended_at) - Date.parse(session.started_at)) / 1000,
    distanceMeters: data.distance_meters,
    heartRateAverageBpm: data.heart_rate_average_bpm,
    heartRateMaxBpm: data.heart_rate_max_bpm,
    heartRateSampleCount: data.heart_rate_sample_count,
    speedAverageMetersPerSecond: speed,
    speedMaxMetersPerSecond: data.speed_max_meters_per_second,
    speedSampleCount: data.speed_sample_count,
    paceSecondsPerKmFromSpeed: speed != null && Number.isFinite(speed) && speed > 0
      ? 1000 / speed : undefined,
    lapCount: data.lap_count,
    segmentCount: data.segment_count,
    hasRoute: data.has_route,
  };
}

export function mergeRunningSessions(
  persisted: RunningSessionView[], local: HealthConnectRunningMetricSession[],
): RunningSessionView[] {
  const sessions = new Map<string, RunningSessionView>();
  for (const session of [...persisted, ...local]) {
    sessions.set(runningSessionKey(session), session);
  }
  return [...sessions.values()].sort((a, b) =>
    Date.parse(b.startTime) - Date.parse(a.startTime)
    || runningSessionKey(a).localeCompare(runningSessionKey(b)),
  );
}
