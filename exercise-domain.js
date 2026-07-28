(function(global){
  "use strict";

  const DOMAIN_VERSION="4.2.0-alpha.1";
  const EXERCISE_SCHEMA_VERSION=1;

  const MOVEMENT_PATTERNS=Object.freeze([
    "squat","knee_dominant","hip_hinge","horizontal_push","vertical_push",
    "horizontal_pull","vertical_pull","hip_extension","knee_flexion","knee_extension",
    "calf_raise","elbow_flexion","elbow_extension","shoulder_abduction",
    "shoulder_external_rotation","anti_extension_core","anti_rotation_core",
    "lateral_core","loaded_carry","unilateral_lower_body"
  ]);
  const EXERCISE_CATEGORIES=Object.freeze([
    "strength","cardio","mobility","breathing","pelvic_floor","warm_up","recovery"
  ]);
  const EQUIPMENT_TAXONOMY=Object.freeze([
    "bodyweight","mat","bench","adjustable_bench","dumbbells","barbell","plates",
    "squat_rack","smith_machine","cable_machine","resistance_band",
    "chest_press_machine","shoulder_press_machine","leg_press","leg_extension",
    "seated_leg_curl","lying_leg_curl","hip_thrust_machine","lat_pulldown",
    "seated_row","calf_raise_machine","treadmill","stationary_bike","elliptical",
    "step","stability_ball"
  ]);
  const EXPERIENCE_LEVELS=Object.freeze(["beginner","intermediate","advanced","returning"]);
  const RECORD_TYPES=Object.freeze([
    "weight_reps","bodyweight_reps","assisted_reps","duration","distance_time",
    "guided_repetitions","mobility_quality"
  ]);
  const EQUIPMENT_PRESETS=Object.freeze({
    full:Object.freeze([...EQUIPMENT_TAXONOMY]),
    gym_full:Object.freeze([...EQUIPMENT_TAXONOMY]),
    home_dumbbells:Object.freeze(["bodyweight","mat","dumbbells","bench"]),
    home_basic:Object.freeze(["bodyweight","mat","resistance_band"]),
    bodyweight:Object.freeze(["bodyweight","mat"])
  });
  const PROGRAMMING_PRIORITY=Object.freeze([
    "life_state","restrictions","primary_goal","training_phase","secondary_goals","preferences"
  ]);
  const PROGRAMMING_RULES=Object.freeze({
    return_to_training:Object.freeze({
      mainSets:[2,3],accessorySets:[1,2],mainRepRange:[8,12],accessoryRepRange:[10,15],
      targetRir:[3,4],mainRestSeconds:[90,150],accessoryRestSeconds:[60,90],
      maxTechnicalComplexity:2,preferSupported:true
    }),
    muscle_gain:Object.freeze({
      mainSets:[3,4],accessorySets:[2,4],mainRepRange:[6,12],accessoryRepRange:[10,20],
      targetRir:[1,3],mainRestSeconds:[120,180],accessoryRestSeconds:[60,120],
      maxTechnicalComplexity:4,preferSupported:false
    }),
    strength_gain:Object.freeze({
      mainSets:[3,5],accessorySets:[2,3],mainRepRange:[3,6],accessoryRepRange:[6,12],
      targetRir:[2,3],mainRestSeconds:[180,300],accessoryRestSeconds:[90,150],
      maxTechnicalComplexity:4,preferSupported:false
    }),
    fat_loss:Object.freeze({
      mainSets:[2,4],accessorySets:[2,3],mainRepRange:[6,12],accessoryRepRange:[10,15],
      targetRir:[2,4],mainRestSeconds:[90,180],accessoryRestSeconds:[60,120],
      maxTechnicalComplexity:3,preferSupported:false
    }),
    general_health:Object.freeze({
      mainSets:[2,3],accessorySets:[1,3],mainRepRange:[8,12],accessoryRepRange:[10,15],
      targetRir:[2,4],mainRestSeconds:[90,150],accessoryRestSeconds:[60,90],
      maxTechnicalComplexity:3,preferSupported:false
    }),
    maintenance:Object.freeze({
      mainSets:[2,3],accessorySets:[1,2],mainRepRange:[6,12],accessoryRepRange:[10,15],
      targetRir:[2,4],mainRestSeconds:[90,180],accessoryRestSeconds:[60,90],
      maxTechnicalComplexity:4,preferSupported:false
    })
  });

  const EQUIPMENT_ALIASES=Object.freeze({
    "peso corporal":"bodyweight","bodyweight":"bodyweight",
    "esterilla":"mat","colchoneta":"mat","mat":"mat",
    "banco":"bench","bench":"bench","banco ajustable":"adjustable_bench",
    "mancuerna":"dumbbells","mancuernas":"dumbbells","dumbbells":"dumbbells",
    "barra":"barbell","barbell":"barbell","discos":"plates","plates":"plates",
    "rack":"squat_rack","jaula":"squat_rack","polea":"cable_machine","poleas":"cable_machine",
    "banda":"resistance_band","bandas":"resistance_band","banda elastica":"resistance_band",
    "maquina":"machine","máquina":"machine",
    "gimnasio completo":"gym_full","full":"full",
    "casa con mancuernas":"home_dumbbells","home dumbbells":"home_dumbbells",
    "casa basica":"home_basic","home basic":"home_basic"
  });

  const LEGACY_EXERCISE_METADATA=Object.freeze({
    "bench-press":{
      aliases:["Press banca","Press con barra"],movementPattern:"horizontal_push",
      movementSubpattern:"barbell_horizontal_push",primaryMuscles:["chest"],
      secondaryMuscles:["triceps","anterior_deltoid"],
      requiredEquipment:["barbell","plates","bench","squat_rack"],
      difficulty:"intermediate",technicalComplexity:3,stabilityDemand:2,balanceDemand:1,
      supported:true,bodyPositions:["supine"],loadingTypes:["free_weight"],prolongedSupine:true
    },
    "incline-db-press":{
      aliases:["Press inclinado mancuernas"],movementPattern:"horizontal_push",
      movementSubpattern:"incline_dumbbell_push",primaryMuscles:["chest"],
      secondaryMuscles:["triceps","anterior_deltoid"],
      requiredEquipment:["dumbbells","adjustable_bench"],
      difficulty:"intermediate",technicalComplexity:2,stabilityDemand:2,balanceDemand:1,
      supported:true,bodyPositions:["incline_supine"],loadingTypes:["free_weight"],prolongedSupine:true
    },
    "lat-pulldown":{
      aliases:["Jalón","Jalón polea"],movementPattern:"vertical_pull",
      movementSubpattern:"cable_vertical_pull",primaryMuscles:["latissimus_dorsi"],
      secondaryMuscles:["biceps","upper_back"],requiredEquipment:["lat_pulldown"],
      difficulty:"beginner",technicalComplexity:1,stabilityDemand:1,balanceDemand:1,
      supported:true,bodyPositions:["seated"],loadingTypes:["machine_stack"]
    },
    "barbell-row":{
      aliases:["Remo barra"],movementPattern:"horizontal_pull",
      movementSubpattern:"barbell_horizontal_pull",primaryMuscles:["upper_back","latissimus_dorsi"],
      secondaryMuscles:["biceps","posterior_deltoid"],requiredEquipment:["barbell","plates"],
      difficulty:"intermediate",technicalComplexity:3,stabilityDemand:3,balanceDemand:1,
      supported:false,bodyPositions:["bent_over"],loadingTypes:["free_weight"]
    },
    "back-squat":{
      aliases:["Sentadilla con barra"],movementPattern:"squat",
      movementSubpattern:"barbell_back_squat",primaryMuscles:["quadriceps","glutes"],
      secondaryMuscles:["hamstrings","trunk"],requiredEquipment:["barbell","plates","squat_rack"],
      difficulty:"intermediate",technicalComplexity:4,stabilityDemand:4,balanceDemand:3,
      supported:false,bodyPositions:["standing"],loadingTypes:["free_weight"]
    },
    "leg-press":{
      aliases:["Prensa"],movementPattern:"knee_dominant",
      movementSubpattern:"machine_leg_press",primaryMuscles:["quadriceps","glutes"],
      secondaryMuscles:["hamstrings"],requiredEquipment:["leg_press"],
      difficulty:"beginner",technicalComplexity:1,stabilityDemand:1,balanceDemand:1,
      supported:true,bodyPositions:["seated"],loadingTypes:["machine_stack"]
    },
    "romanian-deadlift":{
      aliases:["Peso muerto rumano con barra"],movementPattern:"hip_hinge",
      movementSubpattern:"barbell_hip_hinge",primaryMuscles:["hamstrings","glutes"],
      secondaryMuscles:["spinal_erectors"],requiredEquipment:["barbell","plates"],
      difficulty:"intermediate",technicalComplexity:3,stabilityDemand:3,balanceDemand:2,
      supported:false,bodyPositions:["standing"],loadingTypes:["free_weight"]
    },
    "leg-curl":{
      aliases:["Curl femoral máquina"],movementPattern:"knee_flexion",
      movementSubpattern:"machine_knee_flexion",primaryMuscles:["hamstrings"],
      secondaryMuscles:[],requiredEquipment:["seated_leg_curl"],
      difficulty:"beginner",technicalComplexity:1,stabilityDemand:1,balanceDemand:1,
      supported:true,bodyPositions:["seated"],loadingTypes:["machine_stack"]
    },
    "overhead-press":{
      aliases:["Press militar con barra"],movementPattern:"vertical_push",
      movementSubpattern:"barbell_vertical_push",primaryMuscles:["deltoids"],
      secondaryMuscles:["triceps"],requiredEquipment:["barbell","plates"],
      difficulty:"intermediate",technicalComplexity:3,stabilityDemand:3,balanceDemand:2,
      supported:false,bodyPositions:["standing"],loadingTypes:["free_weight"]
    },
    "lateral-raise":{
      aliases:["Elevación lateral"],movementPattern:"shoulder_abduction",
      movementSubpattern:"dumbbell_shoulder_abduction",primaryMuscles:["lateral_deltoid"],
      secondaryMuscles:[],requiredEquipment:["dumbbells"],
      difficulty:"beginner",technicalComplexity:1,stabilityDemand:2,balanceDemand:1,
      supported:false,bodyPositions:["standing"],loadingTypes:["free_weight"]
    },
    "biceps-curl":{
      aliases:["Curl bíceps"],movementPattern:"elbow_flexion",
      movementSubpattern:"dumbbell_elbow_flexion",primaryMuscles:["biceps"],
      secondaryMuscles:["forearms"],requiredEquipment:["dumbbells"],
      difficulty:"beginner",technicalComplexity:1,stabilityDemand:2,balanceDemand:1,
      supported:false,bodyPositions:["standing"],loadingTypes:["free_weight"]
    },
    "triceps-pushdown":{
      aliases:["Tríceps polea"],movementPattern:"elbow_extension",
      movementSubpattern:"cable_elbow_extension",primaryMuscles:["triceps"],
      secondaryMuscles:[],requiredEquipment:["cable_machine"],
      difficulty:"beginner",technicalComplexity:1,stabilityDemand:2,balanceDemand:1,
      supported:false,bodyPositions:["standing"],loadingTypes:["machine_stack"]
    },
    "calf-raise":{
      aliases:["Gemelo máquina"],movementPattern:"calf_raise",
      movementSubpattern:"machine_calf_raise",primaryMuscles:["calves"],
      secondaryMuscles:[],requiredEquipment:["calf_raise_machine"],
      difficulty:"beginner",technicalComplexity:1,stabilityDemand:2,balanceDemand:1,
      supported:true,bodyPositions:["standing"],loadingTypes:["machine_stack"]
    },
    "plank":{
      aliases:["Plancha frontal"],movementPattern:"anti_extension_core",
      movementSubpattern:"bodyweight_anti_extension",primaryMuscles:["trunk"],
      secondaryMuscles:["shoulders","glutes"],requiredEquipment:["bodyweight","mat"],
      difficulty:"beginner",technicalComplexity:1,stabilityDemand:2,balanceDemand:1,
      supported:false,bodyPositions:["prone"],loadingTypes:["bodyweight"]
    }
  });

  function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
  function cleanText(value,max=500){return String(value??"").trim().replace(/\s+/g," ").slice(0,max);}
  function normalizeToken(value){
    return cleanText(value,120).normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLowerCase().replace(/[‐‑‒–—/]+/g," ").replace(/[^a-z0-9]+/g," ").trim();
  }
  function slug(value){
    return normalizeToken(value).replace(/\s+/g,"_")||"custom_exercise";
  }
  function exerciseIdentityKey(input={}){
    const explicit=cleanText(input.legacyIdentityKey,300);
    if(explicit) return explicit;
    const inheritedId=cleanText(input.legacyDuplicateId||input.id,120)||`custom-${slug(input.name)}`;
    return `${slug(inheritedId)}::${slug(input.name)}`;
  }
  function uniqueStrings(value,max=50){
    const list=Array.isArray(value)?value:[value];
    return [...new Set(list.map(item=>cleanText(item,120)).filter(Boolean))].slice(0,max);
  }
  function boundedNumber(value,fallback,min,max){
    const parsed=Number(value);
    return Number.isFinite(parsed)?Math.max(min,Math.min(max,parsed)):fallback;
  }
  function legacyMuscleIds(value){
    const normalized=normalizeToken(value);
    const mappings={
      pecho:["chest"],espalda:["upper_back","latissimus_dorsi"],piernas:["quadriceps","glutes"],
      isquios:["hamstrings"],hombros:["deltoids"],biceps:["biceps"],triceps:["triceps"],
      gemelos:["calves"],core:["trunk"]
    };
    return mappings[normalized]||[];
  }
  function legacyEquipmentIds(value,id=""){
    const metadata=LEGACY_EXERCISE_METADATA[id];
    if(metadata?.requiredEquipment) return [...metadata.requiredEquipment];
    const mapped=EQUIPMENT_ALIASES[normalizeToken(value)];
    if(!mapped||mapped==="machine") return [];
    return EQUIPMENT_PRESETS[mapped]?[...EQUIPMENT_PRESETS[mapped]]:[mapped];
  }
  function normalizeEquipmentSelection(value){
    const source=Array.isArray(value)?value:[value];
    const equipment=[];
    source.filter(item=>item!==null&&item!==undefined&&String(item).trim()).forEach(item=>{
      const token=normalizeToken(item);
      const mapped=EQUIPMENT_ALIASES[token]||token.replace(/\s+/g,"_");
      const values=EQUIPMENT_PRESETS[mapped]||[mapped];
      values.filter(Boolean).forEach(id=>{if(!equipment.includes(id)) equipment.push(id);});
    });
    return equipment;
  }
  function trainingLocationsForEquipment(equipmentIds){
    if(!equipmentIds.length) return [];
    const gymOnly=new Set([
      "smith_machine","cable_machine","chest_press_machine","shoulder_press_machine",
      "leg_press","leg_extension","seated_leg_curl","lying_leg_curl",
      "hip_thrust_machine","lat_pulldown","seated_row","calf_raise_machine",
      "treadmill","stationary_bike","elliptical"
    ]);
    return equipmentIds.some(id=>gymOnly.has(id))?["gym"]:["gym","home"];
  }
  function legacyCategory(item){
    const type=normalizeToken(item.type);
    if(type==="cardio") return "cardio";
    if(type==="movilidad") return "mobility";
    return "strength";
  }
  function defaultRecordType(item,metadata){
    if(item.recordTypes?.length) return item.recordTypes[0];
    if(metadata?.movementPattern==="anti_extension_core"||normalizeToken(item.type)==="tiempo") return "duration";
    if(metadata?.loadingTypes?.includes("bodyweight")) return "bodyweight_reps";
    return "weight_reps";
  }
  function normalizePregnancyMetadata(input={},metadata={}){
    const source=input&&typeof input==="object"?input:{};
    return {
      eligibleForConsideration:Boolean(source.eligibleForConsideration),
      requiresProfessionalClearance:source.requiresProfessionalClearance!==false,
      prohibitedByProduct:Boolean(source.prohibitedByProduct),
      stageTags:uniqueStrings(source.stageTags||[]),
      positionFlags:uniqueStrings(source.positionFlags||metadata.bodyPositions||[]),
      balanceRisk:["low","moderate","high","unknown"].includes(source.balanceRisk)?source.balanceRisk:"unknown",
      fallRisk:["low","moderate","high","unknown"].includes(source.fallRisk)?source.fallRisk:"unknown",
      impactLevel:["low","moderate","high","unknown"].includes(source.impactLevel)?source.impactLevel:"unknown",
      prolongedSupine:Boolean(source.prolongedSupine??metadata.prolongedSupine),
      abdominalPressureDemand:["low","moderate","high","unknown"].includes(source.abdominalPressureDemand)
        ?source.abdominalPressureDemand:"unknown",
      notes:uniqueStrings(source.notes?.length?source.notes:["Pendiente de revisión específica antes de utilizarse durante el embarazo."])
    };
  }
  function normalizePrescription(input={},recordType="weight_reps"){
    const repRange=input.repRange&&typeof input.repRange==="object"
      ?{min:boundedNumber(input.repRange.min,8,1,100),max:boundedNumber(input.repRange.max,12,1,100)}
      :recordType==="duration"?null:{min:8,max:12};
    if(repRange&&repRange.max<repRange.min) repRange.max=repRange.min;
    const targetRir=input.targetRir&&typeof input.targetRir==="object"
      ?{min:boundedNumber(input.targetRir.min,2,0,10),max:boundedNumber(input.targetRir.max,3,0,10)}
      :{min:2,max:3};
    if(targetRir.max<targetRir.min) targetRir.max=targetRir.min;
    return {
      sets:boundedNumber(input.sets,3,1,10),
      repRange,
      targetRir,
      restSeconds:boundedNumber(input.restSeconds,90,15,600),
      incrementKg:boundedNumber(input.incrementKg,recordType==="weight_reps"?2.5:0,0,100)
    };
  }
  function normalizeExerciseDefinition(input={},options={}){
    const timestamp=options.timestamp||new Date(0).toISOString();
    const originalId=cleanText(input.id,120);
    const id=originalId||`custom-${slug(input.name)}`;
    const metadata=LEGACY_EXERCISE_METADATA[id]||{};
    const requiredEquipment=uniqueStrings(
      input.requiredEquipment||input.equipmentIds||legacyEquipmentIds(input.equipment,id)
    );
    const primaryMuscles=uniqueStrings(input.primaryMuscles?.length?input.primaryMuscles:metadata.primaryMuscles||legacyMuscleIds(input.muscle));
    const recordType=defaultRecordType(input,metadata);
    const recordTypes=uniqueStrings(input.recordTypes?.length?input.recordTypes:[recordType]);
    const movementPattern=MOVEMENT_PATTERNS.includes(input.movementPattern)
      ?input.movementPattern
      :metadata.movementPattern||null;
    const category=EXERCISE_CATEGORIES.includes(input.category)?input.category:legacyCategory(input);
    const isReviewed=Boolean(movementPattern&&primaryMuscles.length&&requiredEquipment.length);
    const createdAt=input.createdAt||timestamp;
    const updatedAt=options.touchUpdatedAt?timestamp:(input.updatedAt||timestamp);
    const legacyEquipment=cleanText(input.equipment,80)||(
      requiredEquipment.includes("bodyweight")?"Peso corporal":
      requiredEquipment.includes("dumbbells")?"Mancuernas":
      requiredEquipment.includes("barbell")?"Barra":
      requiredEquipment.some(item=>item.includes("machine")||item==="leg_press")?"Máquina":
      requiredEquipment.includes("cable_machine")?"Polea":""
    );
    return {
      ...clone(input),
      id,
      schemaVersion:EXERCISE_SCHEMA_VERSION,
      legacyIdentityKey:exerciseIdentityKey({...input,id}),
      name:cleanText(input.name,160)||"Ejercicio sin nombre",
      aliases:uniqueStrings(input.aliases?.length?input.aliases:metadata.aliases||[]),
      category,
      movementPattern,
      movementSubpattern:cleanText(input.movementSubpattern||metadata.movementSubpattern,120)||null,
      primaryMuscles,
      secondaryMuscles:uniqueStrings(input.secondaryMuscles?.length?input.secondaryMuscles:metadata.secondaryMuscles||[]),
      requiredEquipment,
      trainingLocations:uniqueStrings(input.trainingLocations?.length?input.trainingLocations:trainingLocationsForEquipment(requiredEquipment)),
      difficulty:EXPERIENCE_LEVELS.includes(input.difficulty)?input.difficulty:(metadata.difficulty||"beginner"),
      technicalComplexity:boundedNumber(input.technicalComplexity,metadata.technicalComplexity||1,1,5),
      stabilityDemand:boundedNumber(input.stabilityDemand,metadata.stabilityDemand||1,1,5),
      balanceDemand:boundedNumber(input.balanceDemand,metadata.balanceDemand||1,1,5),
      unilateral:Boolean(input.unilateral??metadata.unilateral),
      supported:Boolean(input.supported??metadata.supported),
      closedChain:Boolean(input.closedChain??metadata.closedChain),
      bodyPositions:uniqueStrings(input.bodyPositions?.length?input.bodyPositions:metadata.bodyPositions||[]),
      loadingTypes:uniqueStrings(input.loadingTypes?.length?input.loadingTypes:metadata.loadingTypes||[]),
      recordTypes,
      suitableGoals:uniqueStrings(input.suitableGoals?.length?input.suitableGoals:[
        "return_to_training","muscle_gain","general_health","maintenance"
      ]),
      lessSuitableGoals:uniqueStrings(input.lessSuitableGoals||[]),
      experienceLevels:uniqueStrings(input.experienceLevels?.length?input.experienceLevels:EXPERIENCE_LEVELS),
      defaultPrescription:normalizePrescription(input.defaultPrescription,recordTypes[0]),
      cautionFlags:uniqueStrings(input.cautionFlags||[]),
      exclusionFlags:uniqueStrings(input.exclusionFlags||[]),
      substitutionGroups:uniqueStrings(input.substitutionGroups?.length?input.substitutionGroups:[
        movementPattern,...primaryMuscles
      ].filter(Boolean)),
      alternatives:uniqueStrings(input.alternatives||[]),
      pregnancy:normalizePregnancyMetadata(input.pregnancy,metadata),
      instructions:{
        short:cleanText(input.instructions?.short??input.notes,500),
        breathing:cleanText(input.instructions?.breathing,300),
        setup:uniqueStrings(input.instructions?.setup||[]),
        execution:uniqueStrings(input.instructions?.execution||[]),
        stopIf:uniqueStrings(input.instructions?.stopIf||[])
      },
      source:input.source||((input.custom||!LEGACY_EXERCISE_METADATA[id])?"custom":"built_in"),
      migrationStatus:isReviewed?"ready":"needs_review",
      muscle:cleanText(input.muscle,80),
      equipment:legacyEquipment,
      type:cleanText(input.type,80),
      favorite:Boolean(input.favorite),
      custom:Boolean(input.custom||!LEGACY_EXERCISE_METADATA[id]),
      notes:cleanText(input.notes,1000),
      createdAt,
      updatedAt
    };
  }
  function migrateExerciseLibrary(items,options={}){
    const source=Array.isArray(items)?items:[];
    const timestamp=options.timestamp||new Date().toISOString();
    const usedIds=new Set();
    const library=source.map(item=>{
      const normalized=normalizeExerciseDefinition(item,{
        timestamp,
        touchUpdatedAt:Boolean(options.touchUpdatedAt)
      });
      const base=normalized.id;
      let id=base;
      let suffix=2;
      while(usedIds.has(id)) id=`${base}-${suffix++}`;
      usedIds.add(id);
      return id===base?normalized:{...normalized,id,legacyDuplicateId:base,migrationStatus:"needs_review"};
    });
    return {
      domainVersion:DOMAIN_VERSION,
      exerciseSchemaVersion:EXERCISE_SCHEMA_VERSION,
      library,
      changed:JSON.stringify(source)!==JSON.stringify(library),
      validation:library.map(exercise=>({id:exercise.id,...validateExerciseDefinition(exercise)}))
    };
  }
  function mergeExerciseLibraries(currentItems,incomingItems,options={}){
    const timestamp=options.timestamp||new Date().toISOString();
    const currentSource=Array.isArray(currentItems)?currentItems:[];
    const incomingSource=Array.isArray(incomingItems)?incomingItems:[];
    const merged=migrateExerciseLibrary(currentSource,{timestamp}).library.map(item=>clone(item));
    const identityIndexes=new Map();
    merged.forEach((item,index)=>identityIndexes.set(exerciseIdentityKey(item),index));
    const normalizedIncoming=migrateExerciseLibrary(incomingSource,{timestamp}).library;

    normalizedIncoming.forEach((incoming,index)=>{
      const identity=exerciseIdentityKey(incoming);
      const existingIndex=identityIndexes.get(identity);
      if(existingIndex===undefined){
        identityIndexes.set(identity,merged.length);
        merged.push(incoming);
        return;
      }

      const existing=merged[existingIndex];
      const rawIncoming=incomingSource[index]||{};
      const currentTime=Date.parse(existing.updatedAt||"");
      const incomingTime=Date.parse(rawIncoming.updatedAt||"");
      const incomingIsNewer=Number.isFinite(incomingTime)&&(
        !Number.isFinite(currentTime)||incomingTime>currentTime
      );
      if(!incomingIsNewer) return;
      merged[existingIndex]={
        ...incoming,
        id:existing.id,
        legacyDuplicateId:existing.legacyDuplicateId||incoming.legacyDuplicateId,
        legacyIdentityKey:identity,
        createdAt:existing.createdAt||incoming.createdAt,
        updatedAt:rawIncoming.updatedAt
      };
    });

    const result=migrateExerciseLibrary(merged,{timestamp});
    return {
      ...result,
      mergePolicy:"same_origin_id_and_normalized_name",
      currentCount:currentSource.length,
      incomingCount:incomingSource.length
    };
  }
  function validateExerciseDefinition(exercise={}){
    const errors=[],warnings=[];
    if(!cleanText(exercise.id)) errors.push("exercise_id_required");
    if(!cleanText(exercise.name)) errors.push("exercise_name_required");
    if(!EXERCISE_CATEGORIES.includes(exercise.category)) errors.push("invalid_category");
    if(exercise.movementPattern===null||exercise.movementPattern===undefined) warnings.push("movement_pattern_review_required");
    else if(!MOVEMENT_PATTERNS.includes(exercise.movementPattern)) errors.push("invalid_movement_pattern");
    if(!Array.isArray(exercise.primaryMuscles)||!exercise.primaryMuscles.length) warnings.push("primary_muscles_review_required");
    if(!Array.isArray(exercise.requiredEquipment)||!exercise.requiredEquipment.length) warnings.push("equipment_review_required");
    if(!Array.isArray(exercise.recordTypes)||exercise.recordTypes.some(type=>!RECORD_TYPES.includes(type))){
      errors.push("invalid_record_type");
    }
    if(exercise.pregnancy?.eligibleForConsideration&&exercise.pregnancy?.stageTags?.length===0){
      warnings.push("pregnancy_review_required");
    }
    return {valid:errors.length===0,errors,warnings};
  }
  function getProgrammingRule(goalId){
    return clone(PROGRAMMING_RULES[goalId]||PROGRAMMING_RULES.general_health);
  }
  function buildExerciseDomainMigration(input={}){
    const timestamp=input.timestamp||new Date().toISOString();
    const migrated=migrateExerciseLibrary(input.exerciseLibrary,{timestamp});
    const originalProfile=input.userProfile&&typeof input.userProfile==="object"
      ?clone(input.userProfile)
      :null;
    const normalizedEquipment=originalProfile
      ?normalizeEquipmentSelection(originalProfile.availableEquipment)
      :[];
    const userProfile=originalProfile
      ?{
        ...originalProfile,
        availableEquipment:normalizedEquipment,
        updatedAt:normalizedEquipment.join("\u0000")===
          uniqueStrings(originalProfile.availableEquipment||[]).join("\u0000")
          ?originalProfile.updatedAt
          :timestamp
      }
      :null;
    return {
      domainVersion:DOMAIN_VERSION,
      exerciseSchemaVersion:EXERCISE_SCHEMA_VERSION,
      exerciseLibrary:migrated.library,
      userProfile,
      validation:migrated.validation
    };
  }

  global.GymOSExerciseDomain=Object.freeze({
    DOMAIN_VERSION,EXERCISE_SCHEMA_VERSION,
    MOVEMENT_PATTERNS,EXERCISE_CATEGORIES,EQUIPMENT_TAXONOMY,EQUIPMENT_PRESETS,
    EXPERIENCE_LEVELS,RECORD_TYPES,PROGRAMMING_PRIORITY,PROGRAMMING_RULES,
    LEGACY_EXERCISE_METADATA,
    normalizeToken,normalizeEquipmentSelection,exerciseIdentityKey,normalizeExerciseDefinition,
    migrateExerciseLibrary,mergeExerciseLibraries,validateExerciseDefinition,getProgrammingRule,
    buildExerciseDomainMigration
  });
})(typeof window!=="undefined"?window:globalThis);
