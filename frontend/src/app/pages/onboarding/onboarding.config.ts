import {
  GoalCategory,
  GoalKind,
  GoalMetricKey,
  GoalVariant
} from '../../core/goal.models';


export interface OnboardingGoalOption {
  category: GoalCategory;
  kind: GoalKind;
  group: string;
  label: string;
  description: string;
}


export const ONBOARDING_GOALS: readonly OnboardingGoalOption[] = [
  { category: 'health', kind: 'more_active', group: 'Salud', label: 'Estar más activo', description: 'Moverme más y ganar constancia.' },
  { category: 'health', kind: 'general_health', group: 'Salud', label: 'Mejorar mi salud', description: 'Sentirme mejor y cuidar mi condición general.' },
  { category: 'body_composition', kind: 'fat_loss', group: 'Composición corporal', label: 'Reducir grasa', description: 'Cambiar mi composición sin asumir una cifra.' },
  { category: 'body_composition', kind: 'recomposition', group: 'Composición corporal', label: 'Mejorar mi composición', description: 'Recomponer peso, cintura y masa corporal.' },
  { category: 'strength', kind: 'muscle_gain', group: 'Fuerza', label: 'Ganar músculo', description: 'Desarrollar masa muscular.' },
  { category: 'strength', kind: 'strength_gain', group: 'Fuerza', label: 'Ganar fuerza', description: 'Mejorar mi rendimiento con cargas.' },
  { category: 'strength', kind: 'return_to_training', group: 'Fuerza', label: 'Volver a entrenar', description: 'Retomar el entrenamiento progresivamente.' },
  { category: 'endurance', kind: 'running', group: 'Resistencia', label: 'Carrera', description: 'Preparar o mejorar mi carrera.' },
  { category: 'endurance', kind: 'swimming', group: 'Resistencia', label: 'Natación', description: 'Mejorar mi capacidad nadando.' },
  { category: 'endurance', kind: 'cycling', group: 'Resistencia', label: 'Ciclismo', description: 'Mejorar sobre la bicicleta.' },
  { category: 'endurance', kind: 'triathlon', group: 'Resistencia', label: 'Triatlón', description: 'Combinar natación, bicicleta y carrera.' },
  { category: 'endurance', kind: 'duathlon', group: 'Resistencia', label: 'Duatlón', description: 'Combinar carrera y bicicleta.' },
  { category: 'sport_performance', kind: 'sport_performance', group: 'Rendimiento', label: 'Rendimiento deportivo', description: 'Rendir mejor en mi deporte.' }
];


export const GOAL_VARIANT_OPTIONS: Partial<Record<
  GoalKind,
  readonly { value: GoalVariant | null; label: string }[]
>> = {
  running: [
    { value: '5k', label: '5K' },
    { value: '10k', label: '10K' },
    { value: 'half_marathon', label: 'Media maratón' },
    { value: null, label: 'Sin distancia concreta' }
  ],
  triathlon: [
    { value: 'sprint', label: 'Sprint' },
    { value: 'olympic', label: 'Olímpico' },
    { value: null, label: 'Sin modalidad concreta' }
  ]
};


export interface OnboardingMetricOption {
  key: GoalMetricKey;
  label: string;
  displayUnit: 'kg' | 'cm' | 'm' | 'km';
  canonicalMultiplier: number;
  minimum: number;
  maximum: number;
}


export const ONBOARDING_METRICS: Record<
  GoalMetricKey,
  OnboardingMetricOption
> = {
  body_weight: { key: 'body_weight', label: 'Peso', displayUnit: 'kg', canonicalMultiplier: 1, minimum: 20, maximum: 350 },
  waist_circumference: { key: 'waist_circumference', label: 'Cintura', displayUnit: 'cm', canonicalMultiplier: 1, minimum: 30, maximum: 250 },
  continuous_swim_distance: { key: 'continuous_swim_distance', label: 'Natación continua', displayUnit: 'm', canonicalMultiplier: 1, minimum: 1, maximum: 1_000_000 },
  continuous_run_distance: { key: 'continuous_run_distance', label: 'Carrera continua', displayUnit: 'km', canonicalMultiplier: 1000, minimum: 0.001, maximum: 1000 },
  cycling_distance: { key: 'cycling_distance', label: 'Bicicleta continua', displayUnit: 'km', canonicalMultiplier: 1000, minimum: 0.001, maximum: 1000 }
};


export function goalOption(
  category: GoalCategory,
  kind: GoalKind
): OnboardingGoalOption | undefined {
  return ONBOARDING_GOALS.find(
    option => option.category === category && option.kind === kind
  );
}


export function metricKeysForGoal(
  kind: GoalKind
): readonly GoalMetricKey[] {
  switch (kind) {
    case 'general_health':
    case 'more_active':
      return ['body_weight'];
    case 'fat_loss':
    case 'recomposition':
      return ['body_weight', 'waist_circumference'];
    case 'running':
      return ['continuous_run_distance'];
    case 'swimming':
      return ['continuous_swim_distance'];
    case 'cycling':
      return ['cycling_distance'];
    case 'triathlon':
      return [
        'continuous_swim_distance',
        'continuous_run_distance',
        'cycling_distance'
      ];
    case 'duathlon':
      return ['continuous_run_distance', 'cycling_distance'];
    default:
      return [];
  }
}
