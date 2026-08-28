export function calculateEpleyOneRepMax(
  weight: number | null | undefined,
  reps: number | null | undefined
): number | null {
  if (
    weight === null ||
    weight === undefined ||
    reps === null ||
    reps === undefined ||
    !Number.isFinite(weight) ||
    !Number.isFinite(reps) ||
    weight <= 0 ||
    reps <= 0
  ) {
    return null;
  }

  return weight * (1 + reps / 30);
}
