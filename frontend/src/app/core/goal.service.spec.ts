import {
  HttpErrorResponse,
  provideHttpClient
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting
} from '@angular/common/http/testing';
import {
  TestBed
} from '@angular/core/testing';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  environment
} from '../../environments/environment';
import {
  AuthService
} from './auth.service';
import {
  parseGoal
} from './goal.models';
import {
  GoalService
} from './goal.service';


const goalRow = {
  id: '11111111-1111-4111-8111-111111111111',
  user_id: '22222222-2222-4222-8222-222222222222',
  category: 'endurance',
  kind: 'running',
  variant: '10k',
  target_date: '2027-04-18',
  status: 'active',
  created_by_user_id:
    '22222222-2222-4222-8222-222222222222',
  created_at: '2026-09-09T10:00:00Z',
  updated_at: '2026-09-09T10:00:00Z'
};


describe('Goal contracts', () => {
  it('maps the backend representation', () => {
    expect(parseGoal(goalRow)).toEqual({
      id: goalRow.id,
      userId: goalRow.user_id,
      category: 'endurance',
      kind: 'running',
      variant: '10k',
      targetDate: '2027-04-18',
      status: 'active',
      createdByUserId: goalRow.created_by_user_id,
      createdAt: goalRow.created_at,
      updatedAt: goalRow.updated_at
    });
  });

  it('rejects malformed or inconsistent responses', () => {
    expect(() => parseGoal({
      ...goalRow,
      category: 'health',
      kind: 'triathlon'
    })).toThrow('no válida');
    expect(() => parseGoal({
      ...goalRow,
      variant: 'olympic'
    })).toThrow('no válida');
  });
});


describe('GoalService', () => {
  let service: GoalService;
  let http: HttpTestingController;
  const getAccessToken = vi.fn();
  const url = `${environment.apiUrl}/goals`;

  beforeEach(() => {
    getAccessToken.mockReset()
      .mockResolvedValue('user-token');
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

  it('gets and maps the active Goal', async () => {
    const result = service.getActive();
    await tick();
    const request = http.expectOne(`${url}/active`);
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization'))
      .toBe('Bearer user-token');
    request.flush(goalRow);
    expect((await result)?.targetDate)
      .toBe('2027-04-18');
  });

  it('accepts an empty active Goal', async () => {
    const result = service.getActive();
    await tick();
    http.expectOne(`${url}/active`).flush(null);
    await expect(result).resolves.toBeNull();
  });

  it('lists and maps Goal history', async () => {
    const result = service.list();
    await tick();
    http.expectOne(url).flush([
      goalRow,
      { ...goalRow, status: 'completed' }
    ]);
    expect((await result).map(goal => goal.status))
      .toEqual(['active', 'completed']);
  });

  it('creates without sending ownership or status', async () => {
    const result = service.create({
      category: 'health',
      kind: 'more_active',
      targetDate: null
    });
    await tick();
    const request = http.expectOne(url);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      category: 'health',
      kind: 'more_active',
      target_date: null
    });
    request.flush({
      ...goalRow,
      category: 'health',
      kind: 'more_active',
      variant: null,
      target_date: null
    });
    expect((await result).targetDate).toBeNull();
  });

  it('updates editable fields and changes status separately', async () => {
    const update = service.update(goalRow.id, {
      variant: null,
      targetDate: null
    });
    await tick();
    const updateRequest = http.expectOne(
      `${url}/${goalRow.id}`
    );
    expect(updateRequest.request.method).toBe('PATCH');
    expect(updateRequest.request.body).toEqual({
      variant: null,
      target_date: null
    });
    updateRequest.flush({
      ...goalRow,
      variant: null,
      target_date: null
    });
    await update;

    const close = service.changeStatus(
      goalRow.id,
      'abandoned'
    );
    await tick();
    const closeRequest = http.expectOne(
      `${url}/${goalRow.id}/status`
    );
    expect(closeRequest.request.body).toEqual({
      status: 'abandoned'
    });
    closeRequest.flush({
      ...goalRow,
      status: 'abandoned'
    });
    expect((await close).status).toBe('abandoned');
  });

  it('propagates API errors and blocks missing sessions', async () => {
    const conflict = service.create({
      category: 'health',
      kind: 'more_active'
    });
    await tick();
    http.expectOne(url).flush(
      { detail: 'An active Goal already exists' },
      { status: 409, statusText: 'Conflict' }
    );
    await expect(conflict).rejects
      .toBeInstanceOf(HttpErrorResponse);

    getAccessToken.mockResolvedValue(null);
    await expect(service.getActive())
      .rejects.toThrow('sesión válida');
    http.expectNone(() => true);
  });
});
