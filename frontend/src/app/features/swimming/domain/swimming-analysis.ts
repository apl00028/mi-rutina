export interface SwimmingAnalysisSession {
  distanceMeters: number | null;
  durationSeconds: number;

  strokesPerLength: number | null;
  metersPerStroke: number | null;

  elapsedPaceSecondsPer100m: number | null;

  heartRateAverageBpm: number | null;
}


export interface SwimmingMetricChange {
  current: number | null;
  previous: number | null;

  absoluteChange: number | null;
  percentChange: number | null;
}


export interface SwimmingSessionComparison {
  distance: SwimmingMetricChange;
  pace: SwimmingMetricChange;
  strokesPerLength: SwimmingMetricChange;
  metersPerStroke: SwimmingMetricChange;
  heartRateAverage: SwimmingMetricChange;

  summary: string[];
  integratedSummary: string | null;
}


function metricChange(
  current: number | null,
  previous: number | null
): SwimmingMetricChange {

  if (
    current === null
    || previous === null
    || !Number.isFinite(current)
    || !Number.isFinite(previous)
  ) {
    return {
      current,
      previous,
      absoluteChange: null,
      percentChange: null
    };
  }

  const absoluteChange =
    current - previous;

  const percentChange =
    previous !== 0
      ? (
          absoluteChange
          / previous
        ) * 100
      : null;

  return {
    current,
    previous,
    absoluteChange,
    percentChange
  };
}


function approximatelyEqual(
  left: number,
  right: number,
  relativeTolerance = 0.02
): boolean {

  if (left === right) {
    return true;
  }

  const denominator =
    Math.max(
      Math.abs(left),
      Math.abs(right)
    );

  if (denominator === 0) {
    return true;
  }

  return (
    Math.abs(left - right)
    / denominator
  ) <= relativeTolerance;
}


export function compareSwimmingSessions(
  current: SwimmingAnalysisSession,
  previous: SwimmingAnalysisSession
): SwimmingSessionComparison {

  const distance =
    metricChange(
      current.distanceMeters,
      previous.distanceMeters
    );

  const pace =
    metricChange(
      current.elapsedPaceSecondsPer100m,
      previous.elapsedPaceSecondsPer100m
    );

  const strokesPerLength =
    metricChange(
      current.strokesPerLength,
      previous.strokesPerLength
    );

  const metersPerStroke =
    metricChange(
      current.metersPerStroke,
      previous.metersPerStroke
    );

  const heartRateAverage =
    metricChange(
      current.heartRateAverageBpm,
      previous.heartRateAverageBpm
    );


  const summary: string[] = [];


  if (
    distance.percentChange !== null
    && Math.abs(
      distance.percentChange
    ) >= 1
  ) {
    summary.push(
      distance.percentChange > 0
        ? 'Mayor distancia total.'
        : 'Menor distancia total.'
    );
  }


  if (
    pace.current !== null
    && pace.previous !== null
  ) {

    if (
      approximatelyEqual(
        pace.current,
        pace.previous
      )
    ) {
      summary.push(
        'Ritmo total similar.'
      );

    } else if (
      pace.current <
      pace.previous
    ) {
      summary.push(
        'Ritmo total más rápido.'
      );

    } else {
      summary.push(
        'Ritmo total más lento.'
      );
    }
  }


  if (
    strokesPerLength.current !== null
    && strokesPerLength.previous !== null
  ) {

    if (
      approximatelyEqual(
        strokesPerLength.current,
        strokesPerLength.previous
      )
    ) {
      summary.push(
        'Brazadas por largo estables.'
      );

    } else if (
      strokesPerLength.current <
      strokesPerLength.previous
    ) {
      summary.push(
        'Menos brazadas por largo.'
      );

    } else {
      summary.push(
        'Más brazadas por largo.'
      );
    }
  }


  if (
    metersPerStroke.current !== null
    && metersPerStroke.previous !== null
  ) {

    if (
      approximatelyEqual(
        metersPerStroke.current,
        metersPerStroke.previous
      )
    ) {
      summary.push(
        'Distancia por brazada estable.'
      );

    } else if (
      metersPerStroke.current >
      metersPerStroke.previous
    ) {
      summary.push(
        'Mayor distancia por brazada.'
      );

    } else {
      summary.push(
        'Menor distancia por brazada.'
      );
    }
  }


  if (
    heartRateAverage.current !== null
    && heartRateAverage.previous !== null
  ) {

    if (
      approximatelyEqual(
        heartRateAverage.current,
        heartRateAverage.previous,
        0.03
      )
    ) {
      summary.push(
        'Coste cardiovascular similar.'
      );

    } else if (
      heartRateAverage.current >
      heartRateAverage.previous
    ) {
      summary.push(
        'Mayor frecuencia cardiaca media.'
      );

    } else {
      summary.push(
        'Menor frecuencia cardiaca media.'
      );
    }
  }


  let integratedSummary:
    string | null = null;

  const parts: string[] = [];

  if (
    distance.percentChange !== null
    && Math.abs(distance.percentChange) >= 1
  ) {
    parts.push(
      distance.percentChange > 0
        ? 'mayor volumen'
        : 'menor volumen'
    );
  }

  if (
    pace.current !== null
    && pace.previous !== null
    && !approximatelyEqual(
      pace.current,
      pace.previous
    )
  ) {
    parts.push(
      pace.current < pace.previous
        ? 'ritmo total más rápido'
        : 'ritmo total más lento'
    );
  }

  const strokeEfficiencyStable =
    (
      strokesPerLength.current !== null
      && strokesPerLength.previous !== null
      && approximatelyEqual(
        strokesPerLength.current,
        strokesPerLength.previous
      )
    )
    ||
    (
      metersPerStroke.current !== null
      && metersPerStroke.previous !== null
      && approximatelyEqual(
        metersPerStroke.current,
        metersPerStroke.previous
      )
    );

  if (strokeEfficiencyStable) {
    parts.push(
      'eficiencia de brazada estable'
    );
  }

  if (
    heartRateAverage.current !== null
    && heartRateAverage.previous !== null
    && !approximatelyEqual(
      heartRateAverage.current,
      heartRateAverage.previous,
      0.03
    )
  ) {
    parts.push(
      heartRateAverage.current >
        heartRateAverage.previous
        ? 'mayor coste cardiovascular'
        : 'menor coste cardiovascular'
    );
  }

  if (parts.length > 0) {
    integratedSummary =
      parts.join(', ') + '.';

    integratedSummary =
      integratedSummary.charAt(0).toUpperCase()
      + integratedSummary.slice(1);
  }

  return {
    distance,
    pace,
    strokesPerLength,
    metersPerStroke,
    heartRateAverage,
    summary,
    integratedSummary
  };
}
