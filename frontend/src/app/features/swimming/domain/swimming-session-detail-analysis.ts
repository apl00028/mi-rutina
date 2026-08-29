export interface SwimmingLengthInput {
  length_type?: string | null;
  swim_stroke?: string | null;
  duration_seconds?: number | null;
  total_strokes?: number | null;
  average_stroke_rate_spm?: number | null;
}

export interface SwimmingStrokeSummary {
  stroke: string;
  lengths: number;
  distanceMeters: number;
  swimSeconds: number;
  paceSecondsPer100m: number | null;
  strokesPerLength: number | null;
  averageStrokeRateSpm: number | null;
}

export interface SwimmingBlockSummary {
  activeLengths: number;
  distanceMeters: number;
  swimSeconds: number;
  paceSecondsPer100m: number | null;
  restBeforeSeconds: number | null;
}

export interface SwimmingDetailedSessionAnalysis {
  activeLengths: number;
  idleLengths: number;

  blocks: SwimmingBlockSummary[];

  blockCount: number;
  longestBlockMeters: number;

  averageRestSeconds: number | null;
  maxRestSeconds: number | null;

  strokes: SwimmingStrokeSummary[];
}


function finite(
  value: number | null | undefined
): number | null {

  return (
    typeof value === 'number'
    && Number.isFinite(value)
  )
    ? value
    : null;
}


function paceSecondsPer100m(
  distanceMeters: number,
  durationSeconds: number
): number | null {

  if (
    distanceMeters <= 0
    || durationSeconds <= 0
  ) {
    return null;
  }

  return (
    durationSeconds
    / distanceMeters
  ) * 100;
}


export function analyseSwimmingLengths(
  lengths: SwimmingLengthInput[],
  poolLengthMeters = 25
): SwimmingDetailedSessionAnalysis {

  const active =
    lengths.filter(
      item =>
        item.length_type !== 'idle'
    );

  const idle =
    lengths.filter(
      item =>
        item.length_type === 'idle'
    );


  // ==========================================================
  // Blocks
  // ==========================================================

  const blocks: SwimmingBlockSummary[] = [];

  let currentActiveLengths = 0;
  let currentSwimSeconds = 0;
  let restBeforeSeconds:
    number | null = null;

  const flushBlock = () => {

    if (currentActiveLengths === 0) {
      return;
    }

    const distanceMeters =
      currentActiveLengths
      * poolLengthMeters;

    blocks.push({
      activeLengths:
        currentActiveLengths,

      distanceMeters,

      swimSeconds:
        currentSwimSeconds,

      paceSecondsPer100m:
        paceSecondsPer100m(
          distanceMeters,
          currentSwimSeconds
        ),

      restBeforeSeconds
    });

    currentActiveLengths = 0;
    currentSwimSeconds = 0;
    restBeforeSeconds = null;
  };


  for (const length of lengths) {

    if (length.length_type === 'idle') {

      flushBlock();

      const rest =
        finite(
          length.duration_seconds
        );

      if (rest !== null) {
        restBeforeSeconds =
          (
            restBeforeSeconds
            ?? 0
          ) + rest;
      }

      continue;
    }

    currentActiveLengths += 1;

    currentSwimSeconds +=
      finite(
        length.duration_seconds
      )
      ?? 0;
  }

  flushBlock();


  // ==========================================================
  // Rest
  // ==========================================================

  const rests =
    idle
      .map(
        item =>
          finite(
            item.duration_seconds
          )
      )
      .filter(
        (
          item
        ): item is number =>
          item !== null
          && item >= 0
      );

  const averageRestSeconds =
    rests.length > 0
      ? (
          rests.reduce(
            (sum, value) =>
              sum + value,
            0
          )
          / rests.length
        )
      : null;

  const maxRestSeconds =
    rests.length > 0
      ? Math.max(...rests)
      : null;


  // ==========================================================
  // Stroke summaries
  // ==========================================================

  const grouped =
    new Map<
      string,
      SwimmingLengthInput[]
    >();

  for (const length of active) {

    const stroke =
      length.swim_stroke
      ?? 'unknown';

    const group =
      grouped.get(stroke)
      ?? [];

    group.push(length);

    grouped.set(
      stroke,
      group
    );
  }


  const strokes:
    SwimmingStrokeSummary[] = [];

  for (
    const [
      stroke,
      group
    ] of grouped.entries()
  ) {

    const distanceMeters =
      group.length
      * poolLengthMeters;

    const swimSeconds =
      group.reduce(
        (sum, item) =>
          sum
          + (
              finite(
                item.duration_seconds
              )
              ?? 0
            ),
        0
      );

    const validStrokes =
      group
        .map(
          item =>
            finite(
              item.total_strokes
            )
        )
        .filter(
          (
            item
          ): item is number =>
            item !== null
        );

    const validRates =
      group
        .map(
          item =>
            finite(
              item.average_stroke_rate_spm
            )
        )
        .filter(
          (
            item
          ): item is number =>
            item !== null
        );


    strokes.push({
      stroke,

      lengths:
        group.length,

      distanceMeters,

      swimSeconds,

      paceSecondsPer100m:
        paceSecondsPer100m(
          distanceMeters,
          swimSeconds
        ),

      strokesPerLength:
        validStrokes.length > 0
          ? (
              validStrokes.reduce(
                (sum, value) =>
                  sum + value,
                0
              )
              / validStrokes.length
            )
          : null,

      averageStrokeRateSpm:
        validRates.length > 0
          ? (
              validRates.reduce(
                (sum, value) =>
                  sum + value,
                0
              )
              / validRates.length
            )
          : null
    });
  }


  return {
    activeLengths:
      active.length,

    idleLengths:
      idle.length,

    blocks,

    blockCount:
      blocks.length,

    longestBlockMeters:
      blocks.length > 0
        ? Math.max(
            ...blocks.map(
              block =>
                block.distanceMeters
            )
          )
        : 0,

    averageRestSeconds,
    maxRestSeconds,

    strokes:
      strokes.sort(
        (left, right) =>
          right.distanceMeters
          - left.distanceMeters
      )
  };
}
