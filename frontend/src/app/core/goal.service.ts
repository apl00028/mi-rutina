import {
  HttpClient,
  HttpHeaders
} from '@angular/common/http';
import {
  Injectable,
  inject
} from '@angular/core';
import {
  firstValueFrom
} from 'rxjs';

import {
  environment
} from '../../environments/environment';
import {
  AuthService
} from './auth.service';
import {
  Goal,
  GoalClosingStatus,
  GoalCreateInput,
  GoalMetric,
  GoalMetricBaseline,
  GoalMetricBaselineInput,
  GoalMetricCreateInput,
  GoalMetricState,
  GoalUpdateInput,
  parseGoal,
  parseGoalMetric,
  parseGoalMetricBaseline,
  parseGoalMetricState
} from './goal.models';


type GoalResponse = Record<string, unknown>;


@Injectable({ providedIn: 'root' })
export class GoalService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly url = `${environment.apiUrl}/goals`;

  private async headers(): Promise<HttpHeaders> {
    const token = await this.auth.getAccessToken();
    if (!token) {
      throw new Error('No hay una sesión válida.');
    }
    return new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
  }

  private payload(
    input: GoalCreateInput | GoalUpdateInput
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {};

    if (input.category !== undefined) {
      payload['category'] = input.category;
    }
    if (input.kind !== undefined) {
      payload['kind'] = input.kind;
    }
    if (input.variant !== undefined) {
      payload['variant'] = input.variant;
    }
    if (input.targetDate !== undefined) {
      payload['target_date'] = input.targetDate;
    }

    return payload;
  }

  async getActive(): Promise<Goal | null> {
    const response = await firstValueFrom(
      this.http.get<GoalResponse | null>(
        `${this.url}/active`,
        { headers: await this.headers() }
      )
    );
    return response === null
      ? null
      : parseGoal(response);
  }

  async list(): Promise<Goal[]> {
    const response = await firstValueFrom(
      this.http.get<GoalResponse[]>(
        this.url,
        { headers: await this.headers() }
      )
    );
    return response.map(parseGoal);
  }

  async create(input: GoalCreateInput): Promise<Goal> {
    const response = await firstValueFrom(
      this.http.post<GoalResponse>(
        this.url,
        this.payload(input),
        { headers: await this.headers() }
      )
    );
    return parseGoal(response);
  }

  async update(
    goalId: string,
    input: GoalUpdateInput
  ): Promise<Goal> {
    const response = await firstValueFrom(
      this.http.patch<GoalResponse>(
        `${this.url}/${encodeURIComponent(goalId)}`,
        this.payload(input),
        { headers: await this.headers() }
      )
    );
    return parseGoal(response);
  }

  async changeStatus(
    goalId: string,
    status: GoalClosingStatus
  ): Promise<Goal> {
    const response = await firstValueFrom(
      this.http.patch<GoalResponse>(
        `${this.url}/${encodeURIComponent(goalId)}/status`,
        { status },
        { headers: await this.headers() }
      )
    );
    return parseGoal(response);
  }

  private metricUrl(goalId: string): string {
    return `${this.url}/${encodeURIComponent(goalId)}/metrics`;
  }

  async listMetrics(goalId: string): Promise<GoalMetric[]> {
    const response = await firstValueFrom(
      this.http.get<GoalResponse[]>(
        this.metricUrl(goalId),
        { headers: await this.headers() }
      )
    );
    return response.map(parseGoalMetric);
  }

  async createMetric(
    goalId: string,
    input: GoalMetricCreateInput
  ): Promise<GoalMetric> {
    const payload: Record<string, unknown> = {
      metric_key: input.metricKey
    };
    if (input.targetValue !== undefined) {
      payload['target_value'] = input.targetValue;
    }
    const response = await firstValueFrom(
      this.http.post<GoalResponse>(
        this.metricUrl(goalId),
        payload,
        { headers: await this.headers() }
      )
    );
    return parseGoalMetric(response);
  }

  async updateMetricTarget(
    goalId: string,
    metricId: string,
    targetValue: number | null
  ): Promise<GoalMetric> {
    const response = await firstValueFrom(
      this.http.patch<GoalResponse>(
        `${this.metricUrl(goalId)}/${encodeURIComponent(metricId)}/target`,
        { target_value: targetValue },
        { headers: await this.headers() }
      )
    );
    return parseGoalMetric(response);
  }

  async putMetricBaseline(
    goalId: string,
    metricId: string,
    input: GoalMetricBaselineInput
  ): Promise<GoalMetricBaseline> {
    const response = await firstValueFrom(
      this.http.put<GoalResponse>(
        `${this.metricUrl(goalId)}/${encodeURIComponent(metricId)}/baseline`,
        {
          value: input.value,
          measured_at: input.measuredAt,
          source_type: input.sourceType,
          source_domain: input.sourceDomain ?? null,
          source_record_id: input.sourceRecordId ?? null
        },
        { headers: await this.headers() }
      )
    );
    return parseGoalMetricBaseline(response);
  }

  async listMetricStates(
    goalId: string
  ): Promise<GoalMetricState[]> {
    const response = await firstValueFrom(
      this.http.get<GoalResponse[]>(
        `${this.url}/${encodeURIComponent(goalId)}/metric-states`,
        { headers: await this.headers() }
      )
    );
    return response.map(parseGoalMetricState);
  }
}
