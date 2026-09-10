export type GoalCategory =
  | 'health'
  | 'body_composition'
  | 'strength'
  | 'endurance'
  | 'sport_performance';

export type GoalKind =
  | 'general_health'
  | 'more_active'
  | 'fat_loss'
  | 'recomposition'
  | 'muscle_gain'
  | 'strength_gain'
  | 'return_to_training'
  | 'running'
  | 'swimming'
  | 'cycling'
  | 'triathlon'
  | 'duathlon'
  | 'sport_performance';

export type GoalVariant =
  | '5k'
  | '10k'
  | 'half_marathon'
  | 'sprint'
  | 'olympic';

export type GoalStatus =
  | 'active'
  | 'completed'
  | 'abandoned';

export type GoalClosingStatus =
  Exclude<GoalStatus, 'active'>;

export interface Goal {
  id: string;
  userId: string;
  category: GoalCategory;
  kind: GoalKind;
  variant: GoalVariant | null;
  targetDate: string | null;
  status: GoalStatus;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GoalCreateInput {
  category: GoalCategory;
  kind: GoalKind;
  variant?: GoalVariant | null;
  targetDate?: string | null;
}

export interface GoalUpdateInput {
  category?: GoalCategory;
  kind?: GoalKind;
  variant?: GoalVariant | null;
  targetDate?: string | null;
}

export type GoalMetricKey =
  | 'body_weight'
  | 'waist_circumference'
  | 'continuous_swim_distance'
  | 'continuous_run_distance'
  | 'cycling_distance';

export type GoalMetricUnit = 'kg' | 'cm' | 'm';

export type GoalMetricSourceType =
  | 'manual'
  | 'aptus'
  | 'health_connect'
  | 'imported'
  | 'derived'
  | 'scale';

export type GoalMetricSourceDomain =
  | 'health_weight_entries'
  | 'health_body_measurements'
  | 'health_weekly_checkins'
  | 'running_sessions'
  | 'swimming_sessions'
  | 'workouts';

export type CurrentUnavailableReason =
  | 'no_reliable_resolver'
  | 'no_measurement'
  | 'no_measurement_after_baseline';

export interface GoalMetric {
  id: string;
  goalId: string;
  metricKey: GoalMetricKey;
  unit: GoalMetricUnit;
  targetValue: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface GoalMetricBaseline {
  id: string;
  goalMetricId: string;
  value: number;
  unit: GoalMetricUnit;
  measuredAt: string;
  sourceType: GoalMetricSourceType;
  sourceDomain: GoalMetricSourceDomain | null;
  sourceRecordId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CurrentMetricSource {
  sourceType: GoalMetricSourceType;
  sourceDomain: GoalMetricSourceDomain;
  sourceRecordId: string | null;
}

export interface CurrentMetricValue {
  metricKey: GoalMetricKey;
  value: number | null;
  unit: GoalMetricUnit;
  measuredAt: string | null;
  source: CurrentMetricSource | null;
  available: boolean;
  reason: CurrentUnavailableReason | null;
}

export interface GoalMetricValue {
  value: number;
  unit: GoalMetricUnit;
}

export interface GoalMetricState {
  metric: GoalMetric;
  baseline: GoalMetricBaseline | null;
  target: GoalMetricValue | null;
  current: CurrentMetricValue;
}

export interface GoalMetricCreateInput {
  metricKey: GoalMetricKey;
  targetValue?: number | null;
}

export interface GoalMetricBaselineInput {
  value: number;
  measuredAt: string;
  sourceType: GoalMetricSourceType;
  sourceDomain?: GoalMetricSourceDomain | null;
  sourceRecordId?: string | null;
}


const categories = new Set<GoalCategory>([
  'health',
  'body_composition',
  'strength',
  'endurance',
  'sport_performance'
]);

const kinds = new Set<GoalKind>([
  'general_health',
  'more_active',
  'fat_loss',
  'recomposition',
  'muscle_gain',
  'strength_gain',
  'return_to_training',
  'running',
  'swimming',
  'cycling',
  'triathlon',
  'duathlon',
  'sport_performance'
]);

const variants = new Set<GoalVariant>([
  '5k',
  '10k',
  'half_marathon',
  'sprint',
  'olympic'
]);

const statuses = new Set<GoalStatus>([
  'active',
  'completed',
  'abandoned'
]);

const metricKeys = new Set<GoalMetricKey>([
  'body_weight',
  'waist_circumference',
  'continuous_swim_distance',
  'continuous_run_distance',
  'cycling_distance'
]);

const metricUnits = new Set<GoalMetricUnit>([
  'kg', 'cm', 'm'
]);

const metricSources = new Set<GoalMetricSourceType>([
  'manual',
  'aptus',
  'health_connect',
  'imported',
  'derived',
  'scale'
]);

const metricSourceDomains = new Set<GoalMetricSourceDomain>([
  'health_weight_entries',
  'health_body_measurements',
  'health_weekly_checkins',
  'running_sessions',
  'swimming_sessions',
  'workouts'
]);

const unavailableReasons =
  new Set<CurrentUnavailableReason>([
    'no_reliable_resolver',
    'no_measurement',
    'no_measurement_after_baseline'
  ]);

const kindsByCategory: Record<
  GoalCategory,
  ReadonlySet<GoalKind>
> = {
  health: new Set([
    'general_health',
    'more_active'
  ]),
  body_composition: new Set([
    'fat_loss',
    'recomposition'
  ]),
  strength: new Set([
    'muscle_gain',
    'strength_gain',
    'return_to_training'
  ]),
  endurance: new Set([
    'running',
    'swimming',
    'cycling',
    'triathlon',
    'duathlon'
  ]),
  sport_performance: new Set([
    'sport_performance'
  ])
};

const variantsByKind = new Map<
  GoalKind,
  ReadonlySet<GoalVariant>
>([
  ['running', new Set([
    '5k',
    '10k',
    'half_marathon'
  ])],
  ['triathlon', new Set([
    'sprint',
    'olympic'
  ])]
]);


function requiredString(
  row: Record<string, unknown>,
  key: string
): string {
  const value = row[key];
  if (typeof value !== 'string' || !value) {
    throw new Error('Respuesta de Goal no válida.');
  }
  return value;
}


function nullableString(
  row: Record<string, unknown>,
  key: string
): string | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new Error('Respuesta de Goal no válida.');
  }
  return value;
}


function record(value: unknown): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error('Respuesta de métrica no válida.');
  }
  return value as Record<string, unknown>;
}


function requiredNumber(
  row: Record<string, unknown>,
  key: string
): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Respuesta de métrica no válida.');
  }
  return value;
}


function nullableNumber(
  row: Record<string, unknown>,
  key: string
): number | null {
  return row[key] === null
    ? null
    : requiredNumber(row, key);
}


export function parseGoal(value: unknown): Goal {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error('Respuesta de Goal no válida.');
  }

  const row = value as Record<string, unknown>;
  const category = requiredString(row, 'category');
  const kind = requiredString(row, 'kind');
  const variant = nullableString(row, 'variant');
  const status = requiredString(row, 'status');

  if (
    !categories.has(category as GoalCategory) ||
    !kinds.has(kind as GoalKind) ||
    (
      variant !== null &&
      !variants.has(variant as GoalVariant)
    ) ||
    !statuses.has(status as GoalStatus)
  ) {
    throw new Error('Respuesta de Goal no válida.');
  }

  const typedCategory = category as GoalCategory;
  const typedKind = kind as GoalKind;
  const typedVariant = variant as GoalVariant | null;
  const allowedVariants = variantsByKind.get(typedKind);

  if (
    !kindsByCategory[typedCategory].has(typedKind) ||
    (
      typedVariant !== null &&
      (
        allowedVariants === undefined ||
        !allowedVariants.has(typedVariant)
      )
    )
  ) {
    throw new Error('Respuesta de Goal no válida.');
  }

  return {
    id: requiredString(row, 'id'),
    userId: requiredString(row, 'user_id'),
    category: typedCategory,
    kind: typedKind,
    variant: typedVariant,
    targetDate: nullableString(row, 'target_date'),
    status: status as GoalStatus,
    createdByUserId: nullableString(
      row,
      'created_by_user_id'
    ),
    createdAt: requiredString(row, 'created_at'),
    updatedAt: requiredString(row, 'updated_at')
  };
}


export function parseGoalMetric(value: unknown): GoalMetric {
  const row = record(value);
  const metricKey = requiredString(row, 'metric_key');
  const unit = requiredString(row, 'unit');
  if (
    !metricKeys.has(metricKey as GoalMetricKey) ||
    !metricUnits.has(unit as GoalMetricUnit)
  ) {
    throw new Error('Respuesta de métrica no válida.');
  }
  return {
    id: requiredString(row, 'id'),
    goalId: requiredString(row, 'goal_id'),
    metricKey: metricKey as GoalMetricKey,
    unit: unit as GoalMetricUnit,
    targetValue: nullableNumber(row, 'target_value'),
    createdAt: requiredString(row, 'created_at'),
    updatedAt: requiredString(row, 'updated_at')
  };
}


export function parseGoalMetricBaseline(
  value: unknown
): GoalMetricBaseline {
  const row = record(value);
  const unit = requiredString(row, 'unit');
  const sourceType = requiredString(row, 'source_type');
  const sourceDomain = nullableString(row, 'source_domain');
  if (
    !metricUnits.has(unit as GoalMetricUnit) ||
    !metricSources.has(sourceType as GoalMetricSourceType) ||
    (
      sourceDomain !== null &&
      !metricSourceDomains.has(
        sourceDomain as GoalMetricSourceDomain
      )
    )
  ) {
    throw new Error('Respuesta de métrica no válida.');
  }
  return {
    id: requiredString(row, 'id'),
    goalMetricId: requiredString(row, 'goal_metric_id'),
    value: requiredNumber(row, 'value'),
    unit: unit as GoalMetricUnit,
    measuredAt: requiredString(row, 'measured_at'),
    sourceType: sourceType as GoalMetricSourceType,
    sourceDomain: sourceDomain as GoalMetricSourceDomain | null,
    sourceRecordId: nullableString(row, 'source_record_id'),
    createdAt: requiredString(row, 'created_at'),
    updatedAt: requiredString(row, 'updated_at')
  };
}


export function parseCurrentMetricValue(
  value: unknown
): CurrentMetricValue {
  const row = record(value);
  const metricKey = requiredString(row, 'metric_key');
  const unit = requiredString(row, 'unit');
  const available = row['available'];
  const reason = nullableString(row, 'reason');
  if (
    !metricKeys.has(metricKey as GoalMetricKey) ||
    !metricUnits.has(unit as GoalMetricUnit) ||
    typeof available !== 'boolean' ||
    (
      reason !== null &&
      !unavailableReasons.has(
        reason as CurrentUnavailableReason
      )
    )
  ) {
    throw new Error('Respuesta de métrica no válida.');
  }
  const sourceRow = row['source'];
  let source: CurrentMetricSource | null = null;
  if (sourceRow !== null) {
    const parsed = record(sourceRow);
    const sourceType = requiredString(parsed, 'source_type');
    const sourceDomain = requiredString(parsed, 'source_domain');
    if (
      !metricSources.has(sourceType as GoalMetricSourceType) ||
      !metricSourceDomains.has(
        sourceDomain as GoalMetricSourceDomain
      )
    ) {
      throw new Error('Respuesta de métrica no válida.');
    }
    source = {
      sourceType: sourceType as GoalMetricSourceType,
      sourceDomain: sourceDomain as GoalMetricSourceDomain,
      sourceRecordId: nullableString(
        parsed,
        'source_record_id'
      )
    };
  }
  const currentValue = nullableNumber(row, 'value');
  const measuredAt = nullableString(row, 'measured_at');
  if (
    (
      available &&
      (
        currentValue === null ||
        measuredAt === null ||
        source === null ||
        reason !== null
      )
    ) ||
    (
      !available &&
      (
        currentValue !== null ||
        measuredAt !== null ||
        source !== null ||
        reason === null
      )
    )
  ) {
    throw new Error('Respuesta de métrica no válida.');
  }
  return {
    metricKey: metricKey as GoalMetricKey,
    value: currentValue,
    unit: unit as GoalMetricUnit,
    measuredAt,
    source,
    available,
    reason: reason as CurrentUnavailableReason | null
  };
}


export function parseGoalMetricState(
  value: unknown
): GoalMetricState {
  const row = record(value);
  const targetRow = row['target'];
  let target: GoalMetricValue | null = null;
  if (targetRow !== null) {
    const parsed = record(targetRow);
    const unit = requiredString(parsed, 'unit');
    if (!metricUnits.has(unit as GoalMetricUnit)) {
      throw new Error('Respuesta de métrica no válida.');
    }
    target = {
      value: requiredNumber(parsed, 'value'),
      unit: unit as GoalMetricUnit
    };
  }
  return {
    metric: parseGoalMetric(row['metric']),
    baseline: row['baseline'] === null
      ? null
      : parseGoalMetricBaseline(row['baseline']),
    target,
    current: parseCurrentMetricValue(row['current'])
  };
}
