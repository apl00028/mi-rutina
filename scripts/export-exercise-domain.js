const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const domainSourcePath = path.join(
  root,
  'exercise-domain.js'
);

const catalogSourcePath = path.join(
  root,
  'built-in-exercise-catalog.js'
);

const outputPath = path.join(
  root,
  'backend',
  'app',
  'data',
  'exercise_domain.json'
);


function extractFrozenObject(
  source,
  marker
) {
  const markerIndex = source.indexOf(marker);

  if (markerIndex === -1) {
    throw new Error(
      `${marker} not found`
    );
  }

  const start =
    markerIndex + marker.length;

  if (source[start] !== '{') {
    throw new Error(
      `Unexpected object format for ${marker}`
    );
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (
    let i = start;
    i < source.length;
    i += 1
  ) {
    const char = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
    }

    if (char === '}') {
      depth -= 1;

      if (depth === 0) {
        return JSON.parse(
          source.slice(
            start,
            i + 1
          )
        );
      }
    }
  }

  throw new Error(
    `Could not extract ${marker}`
  );
}


function extractCatalog(source) {
  const marker =
    'const CATALOG=deepFreeze(';

  const markerIndex =
    source.indexOf(marker);

  if (markerIndex === -1) {
    throw new Error(
      'CATALOG not found'
    );
  }

  const start =
    markerIndex + marker.length;

  if (source[start] !== '[') {
    throw new Error(
      'Unexpected CATALOG format'
    );
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (
    let i = start;
    i < source.length;
    i += 1
  ) {
    const char = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '[') {
      depth += 1;
    }

    if (char === ']') {
      depth -= 1;

      if (depth === 0) {
        return JSON.parse(
          source.slice(
            start,
            i + 1
          )
        );
      }
    }
  }

  throw new Error(
    'Could not extract CATALOG'
  );
}


const domainSource = fs.readFileSync(
  domainSourcePath,
  'utf8'
);

const catalogSource = fs.readFileSync(
  catalogSourcePath,
  'utf8'
);

const legacyMetadata =
  extractFrozenObject(
    domainSource,
    'const LEGACY_EXERCISE_METADATA=Object.freeze('
  );

const catalog =
  extractCatalog(
    catalogSource
  );

const catalogById =
  new Map(
    catalog.map(
      exercise => [
        exercise.id,
        exercise
      ]
    )
  );


function defaultRecordType(
  exercise,
  metadata
) {
  if (
    Array.isArray(exercise?.recordTypes)
    && exercise.recordTypes.length
  ) {
    return exercise.recordTypes[0];
  }

  if (
    metadata.movementPattern
    === 'anti_extension_core'
  ) {
    return 'duration';
  }

  if (
    Array.isArray(
      metadata.loadingTypes
    )
    && metadata.loadingTypes.includes(
      'bodyweight'
    )
  ) {
    return 'bodyweight_reps';
  }

  return 'weight_reps';
}


const converted = {};

for (
  const [exerciseId, metadata]
  of Object.entries(legacyMetadata)
) {
  const exercise =
    catalogById.get(exerciseId);

  if (!exercise) {
    throw new Error(
      `Catalog exercise missing: ${exerciseId}`
    );
  }

  const recordTypes =
    Array.isArray(exercise.recordTypes)
    && exercise.recordTypes.length
      ? exercise.recordTypes
      : [
          defaultRecordType(
            exercise,
            metadata
          )
        ];

  converted[exerciseId] = {
    movement_pattern:
      metadata.movementPattern,

    movement_subpattern:
      metadata.movementSubpattern ?? null,

    aliases:
      metadata.aliases ?? [],

    primary_muscles:
      metadata.primaryMuscles ?? [],

    secondary_muscles:
      metadata.secondaryMuscles ?? [],

    required_equipment:
      metadata.requiredEquipment ?? [],

    difficulty:
      metadata.difficulty ?? null,

    technical_complexity:
      metadata.technicalComplexity ?? 1,

    stability_demand:
      metadata.stabilityDemand ?? 1,

    balance_demand:
      metadata.balanceDemand ?? 1,

    supported:
      Boolean(metadata.supported),

    closed_chain:
      Boolean(metadata.closedChain),

    unilateral:
      Boolean(metadata.unilateral),

    body_positions:
      metadata.bodyPositions ?? [],

    loading_types:
      metadata.loadingTypes ?? [],

    prolonged_supine:
      Boolean(metadata.prolongedSupine),

    exclusion_flags:
      metadata.exclusionFlags ?? [],

    caution_flags:
      metadata.cautionFlags ?? [],

    record_types:
      recordTypes
  };
}

fs.writeFileSync(
  outputPath,
  JSON.stringify(
    converted,
    null,
    2
  ) + '\n',
  'utf8'
);

console.log(
  `Exported ${
    Object.keys(converted).length
  } exercises`
);

console.log(outputPath);