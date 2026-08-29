export interface SwimmingAnalysisSession {
  distanceMeters: number | null;
  durationSeconds: number;

  strokesPerLength: number | null;
  metersPerStroke: number | null;

  elapsedPaceSecondsPer100m: number | null;

  averagePaceSecondsPer100m?:
    number | null;

  restTimeSeconds?:
    number | null;

  averageStrokeRateSpm?:
    number | null;

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

  /*
   * Ritmo efectivo de natación.
   * Solo se compara cuando ambos lados tienen
   * el dato FIT enriquecido.
   */
  pace: SwimmingMetricChange;

  /*
   * Ritmo de sesión incluyendo descansos.
   * Se conserva como contexto secundario.
   */
  totalPace: SwimmingMetricChange;

  restPercent: SwimmingMetricChange;

  strokesPerLength: SwimmingMetricChange;
  metersPerStroke: SwimmingMetricChange;
  strokeRate: SwimmingMetricChange;

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


function optionalMetric(
  value:
    number | null | undefined
): number | null {

  return (
    typeof value === 'number'
    && Number.isFinite(value)
  )
    ? value
    : null;
}


function restPercent(
  session: SwimmingAnalysisSession
): number | null {

  const rest =
    optionalMetric(
      session.restTimeSeconds
    );

  if (
    rest === null
    || !Number.isFinite(
      session.durationSeconds
    )
    || session.durationSeconds <= 0
  ) {
    return null;
  }

  return (
    rest /
    session.durationSeconds
  ) * 100;
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
      optionalMetric(
        current.averagePaceSecondsPer100m
      ),
      optionalMetric(
        previous.averagePaceSecondsPer100m
      )
    );

  const totalPace =
    metricChange(
      current.elapsedPaceSecondsPer100m,
      previous.elapsedPaceSecondsPer100m
    );

  const restPercentChange =
    metricChange(
      restPercent(current),
      restPercent(previous)
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

  const strokeRate =
    metricChange(
      optionalMetric(
        current.averageStrokeRateSpm
      ),
      optionalMetric(
        previous.averageStrokeRateSpm
      )
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
        'Ritmo medio similar.'
      );

    } else if (
      pace.current <
      pace.previous
    ) {
      summary.push(
        'Ritmo medio más rápido.'
      );

    } else {
      summary.push(
        'Ritmo medio más lento.'
      );
    }
  }


  if (
    restPercentChange.current !== null
    && restPercentChange.previous !== null
  ) {

    const difference =
      restPercentChange.absoluteChange;

    if (
      difference !== null
      && Math.abs(difference) < 1
    ) {
      summary.push(
        'Proporción de descanso similar.'
      );

    } else if (
      difference !== null
      && difference < 0
    ) {
      summary.push(
        'Menor proporción de descanso.'
      );

    } else if (difference !== null) {
      summary.push(
        'Mayor proporción de descanso.'
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
    strokeRate.current !== null
    && strokeRate.previous !== null
  ) {

    if (
      approximatelyEqual(
        strokeRate.current,
        strokeRate.previous,
        0.03
      )
    ) {
      summary.push(
        'Cadencia de brazada similar.'
      );

    } else if (
      strokeRate.current >
      strokeRate.previous
    ) {
      summary.push(
        'Mayor frecuencia de brazada.'
      );

    } else {
      summary.push(
        'Menor frecuencia de brazada.'
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


  const parts: string[] = [];


  if (
    distance.percentChange !== null
    && Math.abs(
      distance.percentChange
    ) >= 1
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
        ? 'ritmo medio más rápido'
        : 'ritmo medio más lento'
    );
  }


  if (
    restPercentChange.absoluteChange !== null
    && Math.abs(
      restPercentChange.absoluteChange
    ) >= 1
  ) {
    parts.push(
      restPercentChange.absoluteChange < 0
        ? 'menor proporción de descanso'
        : 'mayor proporción de descanso'
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
    strokeRate.current !== null
    && strokeRate.previous !== null
    && !approximatelyEqual(
      strokeRate.current,
      strokeRate.previous,
      0.03
    )
  ) {
    parts.push(
      strokeRate.current >
        strokeRate.previous
        ? 'mayor frecuencia de brazada'
        : 'menor frecuencia de brazada'
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


  let integratedSummary:
    string | null = null;

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
    totalPace,
    restPercent:
      restPercentChange,
    strokesPerLength,
    metersPerStroke,
    strokeRate,
    heartRateAverage,
    summary,
    integratedSummary
  };
}
