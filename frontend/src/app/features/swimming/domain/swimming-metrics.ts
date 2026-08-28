export const DEFAULT_POOL_LENGTH_METERS = 25;


export interface SwimmingMetricsInput {
  distanceMeters: number;
  durationSeconds: number;
  totalStrokes?: number | null;
  poolLengthMeters?: number | null;
}


export interface SwimmingMetrics {
  poolLengthMeters: number;
  lengths: number | null;
  totalStrokes: number | null;
  strokesPerLength: number | null;
  metersPerStroke: number | null;
  elapsedPaceSecondsPer100m: number | null;
}


export function normalizePoolLengthMeters(
  value?: number | null
): number {
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || value <= 0
  ) {
    return DEFAULT_POOL_LENGTH_METERS;
  }

  return value;
}


export function deriveSwimmingMetrics(
  input: SwimmingMetricsInput
): SwimmingMetrics {
  const poolLengthMeters =
    normalizePoolLengthMeters(
      input.poolLengthMeters
    );

  const distanceMeters =
    Number.isFinite(input.distanceMeters)
    && input.distanceMeters > 0
      ? input.distanceMeters
      : 0;

  const durationSeconds =
    Number.isFinite(input.durationSeconds)
    && input.durationSeconds > 0
      ? input.durationSeconds
      : 0;

  const totalStrokes =
    typeof input.totalStrokes === 'number'
    && Number.isFinite(input.totalStrokes)
    && input.totalStrokes > 0
      ? input.totalStrokes
      : null;

  const exactLengths =
    distanceMeters > 0
      ? distanceMeters / poolLengthMeters
      : 0;

  const roundedLengths =
    Math.round(exactLengths);

  const lengths =
    distanceMeters > 0
    && Math.abs(
      exactLengths - roundedLengths
    ) < 0.01
      ? roundedLengths
      : null;

  return {
    poolLengthMeters,
    lengths,
    totalStrokes,

    strokesPerLength:
      totalStrokes !== null
      && lengths !== null
      && lengths > 0
        ? totalStrokes / lengths
        : null,

    metersPerStroke:
      totalStrokes !== null
      && distanceMeters > 0
        ? distanceMeters / totalStrokes
        : null,

    elapsedPaceSecondsPer100m:
      distanceMeters > 0
      && durationSeconds > 0
        ? (
            durationSeconds
            / distanceMeters
          ) * 100
        : null
  };
}
