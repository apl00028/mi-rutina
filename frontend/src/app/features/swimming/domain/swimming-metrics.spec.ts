import {
  describe,
  expect,
  it
} from 'vitest';

import {
  DEFAULT_POOL_LENGTH_METERS,
  deriveSwimmingMetrics,
  normalizePoolLengthMeters
} from './swimming-metrics';


describe('swimming metrics', () => {
  it('uses a 25 metre pool by default', () => {
    expect(
      normalizePoolLengthMeters()
    ).toBe(
      DEFAULT_POOL_LENGTH_METERS
    );
  });


  it('derives the 950 m Garmin session', () => {
    const metrics =
      deriveSwimmingMetrics({
        distanceMeters: 950,
        durationSeconds: 2097.568,
        totalStrokes: 609
      });

    expect(metrics.poolLengthMeters)
      .toBe(25);

    expect(metrics.lengths)
      .toBe(38);

    expect(metrics.strokesPerLength)
      .toBeCloseTo(16.026, 2);

    expect(metrics.metersPerStroke)
      .toBeCloseTo(1.56, 2);
  });


  it('derives the 1200 m Garmin session', () => {
    const metrics =
      deriveSwimmingMetrics({
        distanceMeters: 1200,
        durationSeconds: 2439.193,
        totalStrokes: 758
      });

    expect(metrics.lengths)
      .toBe(48);

    expect(metrics.strokesPerLength)
      .toBeCloseTo(15.79, 2);

    expect(metrics.metersPerStroke)
      .toBeCloseTo(1.58, 2);
  });


  it('supports a 50 metre pool override', () => {
    const metrics =
      deriveSwimmingMetrics({
        distanceMeters: 1000,
        durationSeconds: 1800,
        totalStrokes: 500,
        poolLengthMeters: 50
      });

    expect(metrics.poolLengthMeters)
      .toBe(50);

    expect(metrics.lengths)
      .toBe(20);

    expect(metrics.strokesPerLength)
      .toBe(25);
  });


  it('does not invent a whole number of lengths', () => {
    const metrics =
      deriveSwimmingMetrics({
        distanceMeters: 975,
        durationSeconds: 1800,
        poolLengthMeters: 50
      });

    expect(metrics.lengths)
      .toBeNull();
  });
});
