import type {
  SwimmingDetailedSessionAnalysis,
  SwimmingStrokeSummary
} from './swimming-session-detail-analysis';


export interface SwimmingCoachSession {
  distanceMeters: number | null;
  heartRateAverageBpm: number | null;

  detailedAnalysis:
    SwimmingDetailedSessionAnalysis | null;
}


export interface SwimmingCoachDimension {
  status:
    | 'better'
    | 'similar'
    | 'worse'
    | 'unclear';

  summary: string;
}


export interface SwimmingCoachAssessment {
  workCapacity: SwimmingCoachDimension;
  pace: SwimmingCoachDimension;
  technique: SwimmingCoachDimension;
  continuity: SwimmingCoachDimension;
  cardiovascularCost: SwimmingCoachDimension;

  overallStatus:
    | 'better'
    | 'similar'
    | 'mixed'
    | 'unclear';

  headline: string;
  narrative: string;
}


function freestyleSummary(
  session: SwimmingCoachSession
): SwimmingStrokeSummary | null {

  return (
    session.detailedAnalysis
      ?.strokes.find(
        item =>
          item.stroke ===
          'freestyle'
      )
    ?? null
  );
}


function approximatelyEqual(
  left: number,
  right: number,
  relativeTolerance: number
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


export function evaluateSwimmingSessions(
  current: SwimmingCoachSession,
  previous: SwimmingCoachSession
): SwimmingCoachAssessment {

  const currentFreestyle =
    freestyleSummary(current);

  const previousFreestyle =
    freestyleSummary(previous);


  // ==========================================================
  // Work capacity
  // ==========================================================

  let workCapacity:
    SwimmingCoachDimension;

  if (
    currentFreestyle
    && previousFreestyle
  ) {

    const difference =
      currentFreestyle.distanceMeters
      - previousFreestyle.distanceMeters;

    const percent =
      previousFreestyle.distanceMeters > 0
        ? (
            difference
            / previousFreestyle.distanceMeters
          ) * 100
        : null;

    if (
      percent !== null
      && percent >= 10
    ) {
      workCapacity = {
        status: 'better',
        summary:
          `Mayor volumen específico de crol: `
          + `${Math.round(currentFreestyle.distanceMeters)} m `
          + `vs ${Math.round(previousFreestyle.distanceMeters)} m.`
      };

    } else if (
      percent !== null
      && percent <= -10
    ) {
      workCapacity = {
        status: 'worse',
        summary:
          `Menor volumen específico de crol: `
          + `${Math.round(currentFreestyle.distanceMeters)} m `
          + `vs ${Math.round(previousFreestyle.distanceMeters)} m.`
      };

    } else {
      workCapacity = {
        status: 'similar',
        summary:
          'Volumen específico de crol similar.'
      };
    }

  } else {
    workCapacity = {
      status: 'unclear',
      summary:
        'No hay datos homogéneos suficientes para valorar el volumen específico de crol.'
    };
  }


  // ==========================================================
  // Pace
  // ==========================================================

  let pace:
    SwimmingCoachDimension;

  if (
    currentFreestyle?.paceSecondsPer100m !== null
    && currentFreestyle?.paceSecondsPer100m !== undefined
    && previousFreestyle?.paceSecondsPer100m !== null
    && previousFreestyle?.paceSecondsPer100m !== undefined
  ) {

    const currentPace =
      currentFreestyle.paceSecondsPer100m;

    const previousPace =
      previousFreestyle.paceSecondsPer100m;

    if (
      approximatelyEqual(
        currentPace,
        previousPace,
        0.02
      )
    ) {
      pace = {
        status: 'similar',
        summary:
          'Ritmo específico de crol similar.'
      };

    } else if (
      currentPace <
      previousPace
    ) {
      pace = {
        status: 'better',
        summary:
          'Ritmo específico de crol más rápido.'
      };

    } else {
      pace = {
        status: 'worse',
        summary:
          'Ritmo específico de crol más lento.'
      };
    }

  } else {
    pace = {
      status: 'unclear',
      summary:
        'No hay datos homogéneos suficientes para valorar el ritmo específico de crol.'
    };
  }


  // ==========================================================
  // Technique
  // ==========================================================

  let technique:
    SwimmingCoachDimension;

  if (
    currentFreestyle?.strokesPerLength !== null
    && currentFreestyle?.strokesPerLength !== undefined
    && previousFreestyle?.strokesPerLength !== null
    && previousFreestyle?.strokesPerLength !== undefined
  ) {

    const currentStrokes =
      currentFreestyle.strokesPerLength;

    const previousStrokes =
      previousFreestyle.strokesPerLength;

    if (
      approximatelyEqual(
        currentStrokes,
        previousStrokes,
        0.03
      )
    ) {
      technique = {
        status: 'similar',
        summary:
          'Eficiencia de brazada de crol estable.'
      };

    } else if (
      currentStrokes <
      previousStrokes
    ) {
      technique = {
        status: 'better',
        summary:
          'Menos brazadas por largo de crol.'
      };

    } else {
      technique = {
        status: 'worse',
        summary:
          'Más brazadas por largo de crol.'
      };
    }

  } else {
    technique = {
      status: 'unclear',
      summary:
        'No hay datos suficientes para valorar la eficiencia de brazada.'
    };
  }


  // ==========================================================
  // Continuity
  // ==========================================================

  let continuity:
    SwimmingCoachDimension;

  const currentDetail =
    current.detailedAnalysis;

  const previousDetail =
    previous.detailedAnalysis;

  if (
    currentDetail
    && previousDetail
  ) {

    const longestCurrent =
      currentDetail.longestBlockMeters;

    const longestPrevious =
      previousDetail.longestBlockMeters;

    const restCurrent =
      currentDetail.averageRestSeconds;

    const restPrevious =
      previousDetail.averageRestSeconds;

    const blockCountCurrent =
      currentDetail.blockCount;

    const blockCountPrevious =
      previousDetail.blockCount;

    const sameBlocks =
      blockCountCurrent ===
      blockCountPrevious;

    const similarRest =
      restCurrent !== null
      && restPrevious !== null
      && approximatelyEqual(
        restCurrent,
        restPrevious,
        0.10
      );

    if (
      longestCurrent >
        longestPrevious * 1.15
      && (
        restCurrent === null
        || restPrevious === null
        || restCurrent <=
          restPrevious * 1.10
      )
    ) {
      continuity = {
        status: 'better',
        summary:
          'Mayor continuidad de nado sin aumento relevante del descanso.'
      };

    } else if (
      longestCurrent <
        longestPrevious * 0.85
      && (
        restCurrent === null
        || restPrevious === null
        || restCurrent >=
          restPrevious * 0.90
      )
    ) {
      continuity = {
        status: 'worse',
        summary:
          'Menor bloque continuo máximo sin compensación clara en el descanso.'
      };

    } else if (
      sameBlocks
      && similarRest
    ) {
      continuity = {
        status: 'similar',
        summary:
          'Continuidad global similar entre ambas sesiones.'
      };

    } else {
      continuity = {
        status: 'unclear',
        summary:
          'La continuidad presenta cambios mixtos y no permite una conclusión única.'
      };
    }

  } else {
    continuity = {
      status: 'unclear',
      summary:
        'No hay datos suficientes para valorar la continuidad.'
    };
  }


  // ==========================================================
  // Cardiovascular cost
  // ==========================================================

  let cardiovascularCost:
    SwimmingCoachDimension;

  if (
    current.heartRateAverageBpm !== null
    && previous.heartRateAverageBpm !== null
  ) {

    if (
      approximatelyEqual(
        current.heartRateAverageBpm,
        previous.heartRateAverageBpm,
        0.03
      )
    ) {
      cardiovascularCost = {
        status: 'similar',
        summary:
          'Coste cardiovascular medio similar.'
      };

    } else if (
      current.heartRateAverageBpm <
      previous.heartRateAverageBpm
    ) {
      cardiovascularCost = {
        status: 'better',
        summary:
          'Menor frecuencia cardiaca media.'
      };

    } else {
      cardiovascularCost = {
        status: 'worse',
        summary:
          'Mayor frecuencia cardiaca media.'
      };
    }

  } else {
    cardiovascularCost = {
      status: 'unclear',
      summary:
        'No hay datos suficientes para valorar el coste cardiovascular.'
    };
  }


  // ==========================================================
  // Overall assessment
  // ==========================================================

  const statuses = [
    workCapacity.status,
    pace.status,
    technique.status,
    continuity.status,
    cardiovascularCost.status
  ];

  const betterCount =
    statuses.filter(
      item => item === 'better'
    ).length;

  const worseCount =
    statuses.filter(
      item => item === 'worse'
    ).length;

  let overallStatus:
    SwimmingCoachAssessment[
      'overallStatus'
    ];

  let headline: string;

  if (
    betterCount >= 2
    && worseCount === 0
  ) {
    overallStatus = 'better';
    headline =
      'Mejor ejecución global.';

  } else if (
    worseCount >= 2
    && betterCount === 0
  ) {
    overallStatus = 'unclear';
    headline =
      'Peor ejecución en varias dimensiones.';

  } else if (
    betterCount === 0
    && worseCount === 0
  ) {
    overallStatus = 'similar';
    headline =
      'Ejecución global similar.';

  } else {
    overallStatus = 'mixed';
    headline =
      'Mayor capacidad de trabajo, con señales mixtas de rendimiento.';
  }


  const narrative =
    [
      workCapacity.summary,
      pace.summary,
      technique.summary,
      continuity.summary,
      cardiovascularCost.summary
    ].join(' ');


  return {
    workCapacity,
    pace,
    technique,
    continuity,
    cardiovascularCost,
    overallStatus,
    headline,
    narrative
  };
}
