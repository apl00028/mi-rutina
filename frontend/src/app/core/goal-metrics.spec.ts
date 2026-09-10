import {
  HttpErrorResponse,
  provideHttpClient
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import {
  parseCurrentMetricValue,
  parseGoalMetricState
} from './goal.models';
import { GoalService } from './goal.service';


const goalId = '11111111-1111-4111-8111-111111111111';
const metricId = '33333333-3333-4333-8333-333333333333';
const metricRow = {
  id: metricId,
  goal_id: goalId,
  metric_key: 'body_weight',
  unit: 'kg',
  target_value: 80,
  created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-01T10:00:00Z'
};
const baselineRow = {
  id: '44444444-4444-4444-8444-444444444444',
  goal_metric_id: metricId,
  value: 91,
  unit: 'kg',
  measured_at: '2026-09-01',
  source_type: 'manual',
  source_domain: null,
  source_record_id: null,
  created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-01T10:00:00Z'
};
const currentRow = {
  metric_key: 'body_weight',
  value: 87,
  unit: 'kg',
  measured_at: '2026-09-08',
  source: {
    source_type: 'scale',
    source_domain: 'health_weight_entries',
    source_record_id: '55555555-5555-4555-8555-555555555555'
  },
  available: true,
  reason: null
};


describe('Goal metric contracts', () => {
  it('maps baseline, target and available Current', () => {
    const state = parseGoalMetricState({
      metric: metricRow,
      baseline: baselineRow,
      target: { value: 80, unit: 'kg' },
      current: currentRow
    });
    expect(state.baseline?.value).toBe(91);
    expect(state.target?.value).toBe(80);
    expect(state.current).toMatchObject({
      value: 87,
      available: true,
      source: { sourceType: 'scale' }
    });
  });

  it('maps a typed unavailable Current', () => {
    expect(parseCurrentMetricValue({
      metric_key: 'continuous_swim_distance',
      value: null,
      unit: 'm',
      measured_at: null,
      source: null,
      available: false,
      reason: 'no_reliable_resolver'
    })).toEqual({
      metricKey: 'continuous_swim_distance',
      value: null,
      unit: 'm',
      measuredAt: null,
      source: null,
      available: false,
      reason: 'no_reliable_resolver'
    });
  });
});


describe('GoalService metrics', () => {
  let service: GoalService;
  let http: HttpTestingController;
  const getAccessToken = vi.fn();
  const url = `${environment.apiUrl}/goals/${goalId}`;

  beforeEach(() => {
    getAccessToken.mockReset().mockResolvedValue('user-token');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: { getAccessToken }
        }
      ]
    });
    service = TestBed.inject(GoalService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function tick(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
  }

  it('lists metrics and accepts a Goal without metrics', async () => {
    const listed = service.listMetrics(goalId);
    await tick();
    http.expectOne(`${url}/metrics`).flush([metricRow]);
    expect((await listed)[0].unit).toBe('kg');

    const empty = service.listMetricStates(goalId);
    await tick();
    http.expectOne(`${url}/metric-states`).flush([]);
    await expect(empty).resolves.toEqual([]);
  });

  it('creates a metric and edits a nullable target', async () => {
    const created = service.createMetric(goalId, {
      metricKey: 'body_weight'
    });
    await tick();
    const createRequest = http.expectOne(`${url}/metrics`);
    expect(createRequest.request.body).toEqual({
      metric_key: 'body_weight'
    });
    createRequest.flush(metricRow);
    await created;

    const updated = service.updateMetricTarget(
      goalId,
      metricId,
      null
    );
    await tick();
    const updateRequest = http.expectOne(
      `${url}/metrics/${metricId}/target`
    );
    expect(updateRequest.request.body).toEqual({
      target_value: null
    });
    updateRequest.flush({ ...metricRow, target_value: null });
    expect((await updated).targetValue).toBeNull();
  });

  it('puts a baseline with provenance', async () => {
    const saved = service.putMetricBaseline(
      goalId,
      metricId,
      {
        value: 91,
        measuredAt: '2026-09-01',
        sourceType: 'manual'
      }
    );
    await tick();
    const request = http.expectOne(
      `${url}/metrics/${metricId}/baseline`
    );
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      value: 91,
      measured_at: '2026-09-01',
      source_type: 'manual',
      source_domain: null,
      source_record_id: null
    });
    request.flush(baselineRow);
    expect((await saved).sourceType).toBe('manual');
  });

  it('lists full states and propagates errors', async () => {
    const listed = service.listMetricStates(goalId);
    await tick();
    http.expectOne(`${url}/metric-states`).flush([{
      metric: metricRow,
      baseline: baselineRow,
      target: { value: 80, unit: 'kg' },
      current: currentRow
    }]);
    expect((await listed)[0].current.value).toBe(87);

    const failed = service.listMetrics(goalId);
    await tick();
    http.expectOne(`${url}/metrics`).flush(
      { detail: 'Goal service is unavailable' },
      { status: 502, statusText: 'Bad Gateway' }
    );
    await expect(failed).rejects
      .toBeInstanceOf(HttpErrorResponse);
  });
});
