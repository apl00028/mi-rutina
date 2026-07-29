(function(global){
  "use strict";

  const MODEL_VERSION="4.2.0-alpha.1-phase-g";
  const FILTER_DEFAULTS=Object.freeze({
    query:"",category:"all",pattern:"all",muscle:"all",equipment:"all",
    difficulty:"all",favorites:false,custom:false,status:"all",archived:false,
    sort:"name"
  });
  const SORTS=Object.freeze(["name","favorites","used","recent"]);
  const RECORD_TYPE_FAMILIES=Object.freeze({
    weight_reps:"weight_reps",bodyweight_reps:"bodyweight_reps",
    assisted_reps:"assisted_reps",duration:"duration",
    distance_time:"distance_time",guided_repetitions:"guided_repetitions",
    mobility_quality:"mobility_quality"
  });
  const LABELS=Object.freeze({
    strength:"Fuerza",cardio:"Cardio",mobility:"Movilidad",breathing:"Respiración",
    pelvic_floor:"Suelo pélvico",warm_up:"Calentamiento",recovery:"Recuperación",
    squat:"Sentadilla",knee_dominant:"Dominante de rodilla",hip_hinge:"Bisagra de cadera",
    horizontal_push:"Empuje horizontal",vertical_push:"Empuje vertical",
    horizontal_pull:"Tirón horizontal",vertical_pull:"Tirón vertical",
    hip_extension:"Extensión de cadera",knee_flexion:"Flexión de rodilla",
    knee_extension:"Extensión de rodilla",calf_raise:"Elevación de gemelos",
    elbow_flexion:"Flexión de codo",elbow_extension:"Extensión de codo",
    shoulder_abduction:"Abducción de hombro",
    shoulder_external_rotation:"Rotación externa de hombro",
    anti_extension_core:"Core antiextensión",anti_rotation_core:"Core antirrotación",
    lateral_core:"Core lateral",loaded_carry:"Transporte con carga",
    unilateral_lower_body:"Tren inferior unilateral",
    beginner:"Principiante",intermediate:"Intermedio",advanced:"Avanzado",
    returning:"Retorno",weight_reps:"Peso y repeticiones",
    bodyweight_reps:"Peso corporal y repeticiones",
    assisted_reps:"Repeticiones asistidas",duration:"Duración",
    distance_time:"Distancia y tiempo",guided_repetitions:"Repeticiones guiadas",
    mobility_quality:"Calidad de movilidad",bodyweight:"Peso corporal",mat:"Esterilla",
    bench:"Banco",adjustable_bench:"Banco ajustable",dumbbells:"Mancuernas",
    barbell:"Barra",plates:"Discos",squat_rack:"Rack",smith_machine:"Máquina Smith",
    cable_machine:"Polea",resistance_band:"Banda elástica",
    chest_press_machine:"Máquina de press de pecho",
    shoulder_press_machine:"Máquina de press de hombros",leg_press:"Prensa",
    leg_extension:"Extensión de piernas",seated_leg_curl:"Curl femoral sentado",
    lying_leg_curl:"Curl femoral tumbado",hip_thrust_machine:"Máquina de hip thrust",
    lat_pulldown:"Jalón al pecho",seated_row:"Remo sentado",
    calf_raise_machine:"Máquina de gemelos",treadmill:"Cinta",
    stationary_bike:"Bicicleta estática",elliptical:"Elíptica",step:"Step",
    stability_ball:"Fitball",chest:"Pecho",back:"Espalda",lats:"Dorsales",
    triceps:"Tríceps",biceps:"Bíceps",quadriceps:"Cuádriceps",hamstrings:"Isquios",
    glutes:"Glúteos",calves:"Gemelos",core:"Core",anterior_deltoid:"Deltoide anterior",
    lateral_deltoid:"Deltoide lateral",posterior_deltoid:"Deltoide posterior",
    full_body:"Cuerpo completo",main:"Principal",accessory:"Accesorio",support:"Apoyo",
    home:"Casa",gym:"Gimnasio",outdoors:"Exterior",mixed:"Mixto",other:"Otro"
  });

  function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
  function list(value){return Array.isArray(value)?value:[];}
  function text(value,max=1000){return String(value??"").trim().slice(0,max);}
  function token(value){
    return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLowerCase().replace(/[_-]+/g," ").replace(/\s+/g," ").trim();
  }
  function unique(values){return [...new Set(list(values).map(item=>text(item)).filter(Boolean))];}
  function label(value){
    const key=text(value);
    if(!key) return "Sin especificar";
    if(LABELS[key]) return LABELS[key];
    const readable=key.replace(/[_-]+/g," ").replace(/\s+/g," ").trim();
    return readable.charAt(0).toUpperCase()+readable.slice(1);
  }
  function stableStringify(value){
    if(Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    if(value&&typeof value==="object"){
      return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  }
  function localHash(value){
    let hash=2166136261;
    const source=stableStringify(value);
    for(let index=0;index<source.length;index++){
      hash^=source.charCodeAt(index);
      hash=Math.imul(hash,16777619);
    }
    return (hash>>>0).toString(36).padStart(8,"0");
  }
  function domain(){
    if(!global.GymOSExerciseDomain) throw new Error("exercise_domain_unavailable");
    return global.GymOSExerciseDomain;
  }
  function generator(){
    if(!global.GymOSRoutineGenerator) throw new Error("routine_generator_unavailable");
    return global.GymOSRoutineGenerator;
  }
  function proposals(){
    if(!global.GymOSRoutineProposals) throw new Error("routine_proposals_unavailable");
    return global.GymOSRoutineProposals;
  }
  function normalizeOwnerId(value){
    if(global.GymOSProfileData?.normalizeOwnerId) return global.GymOSProfileData.normalizeOwnerId(value);
    const owner=text(value);
    if(owner==="local"||/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(owner)) return owner;
    throw new Error("invalid_owner");
  }
  function normalizeFilters(value={}){
    const source=value&&typeof value==="object"?value:{};
    const pick=key=>{
      const result=token(source[key]);
      return result&&result!=="todos"?result:"all";
    };
    return {
      query:text(source.query,160),category:pick("category"),pattern:pick("pattern"),
      muscle:pick("muscle"),equipment:pick("equipment"),difficulty:pick("difficulty"),
      favorites:Boolean(source.favorites),custom:Boolean(source.custom),
      status:["all","ready","needs review"].includes(pick("status"))?pick("status").replace(" ","_"):"all",
      archived:Boolean(source.archived),
      sort:SORTS.includes(source.sort)?source.sort:"name"
    };
  }
  function clearOwnerUiState(){return {filters:normalizeFilters(),selectedId:null,form:null,substitution:null,message:null,busy:null};}
  function exerciseSearchText(exercise){
    return token([
      exercise.name,...list(exercise.aliases),exercise.category,exercise.movementPattern,
      ...list(exercise.primaryMuscles),...list(exercise.secondaryMuscles),
      ...list(exercise.requiredEquipment),...list(exercise.trainingLocations),
      label(exercise.category),label(exercise.movementPattern),
      ...list(exercise.primaryMuscles).map(label),...list(exercise.secondaryMuscles).map(label),
      ...list(exercise.requiredEquipment).map(label)
    ].join(" "));
  }
  function isCustom(exercise){return exercise?.source==="custom"||exercise?.custom===true;}
  function statusOf(exercise){
    if(exercise?.archived) return "archived";
    return exercise?.migrationStatus==="ready"?"ready":"needs_review";
  }
  function usageFor(exercise,usage={}){
    const byId=usage&&typeof usage==="object"?usage:{};
    return byId[exercise.id]||byId[token(exercise.name)]||{};
  }
  function compareExercises(a,b,sort,usage){
    if(sort==="favorites"){
      const favorite=Number(Boolean(b.favorite))-Number(Boolean(a.favorite));
      if(favorite) return favorite;
    }
    if(sort==="used"){
      const count=(Number(usageFor(b,usage).count)||0)-(Number(usageFor(a,usage).count)||0);
      if(count) return count;
    }
    if(sort==="recent"){
      const recent=text(b.createdAt).localeCompare(text(a.createdAt),"en");
      if(recent) return recent;
    }
    return text(a.name).localeCompare(text(b.name),"es",{sensitivity:"base"})||
      text(a.id).localeCompare(text(b.id),"en");
  }
  function filterExercises(items,filters={},options={}){
    const normalized=normalizeFilters(filters);
    const source=list(items);
    const result=source.filter(exercise=>{
      if(Boolean(exercise?.archived)!==normalized.archived) return false;
      if(normalized.query&&!exerciseSearchText(exercise).includes(token(normalized.query))) return false;
      if(normalized.category!=="all"&&token(exercise.category)!==normalized.category) return false;
      if(normalized.pattern!=="all"&&token(exercise.movementPattern)!==normalized.pattern) return false;
      if(normalized.muscle!=="all"&&![...list(exercise.primaryMuscles),...list(exercise.secondaryMuscles)].some(value=>token(value)===normalized.muscle)) return false;
      if(normalized.equipment!=="all"&&!list(exercise.requiredEquipment).some(value=>token(value)===normalized.equipment)) return false;
      if(normalized.difficulty!=="all"&&token(exercise.difficulty)!==normalized.difficulty) return false;
      if(normalized.favorites&&!exercise.favorite) return false;
      if(normalized.custom&&!isCustom(exercise)) return false;
      if(normalized.status!=="all"&&statusOf(exercise)!==normalized.status) return false;
      return true;
    }).map(clone);
    result.sort((a,b)=>compareExercises(a,b,normalized.sort,options.usage||{}));
    return result;
  }
  function filterOptions(items){
    const values=field=>unique(list(items).flatMap(field)).sort((a,b)=>label(a).localeCompare(label(b),"es"));
    return {
      categories:values(item=>[item.category]),patterns:values(item=>[item.movementPattern]),
      muscles:values(item=>[...list(item.primaryMuscles),...list(item.secondaryMuscles)]),
      equipment:values(item=>list(item.requiredEquipment)),
      difficulties:values(item=>[item.difficulty])
    };
  }
  function compatibilityFor(exercise,context={}){
    return generator().validateExerciseCompatibility({
      exercise,userProfile:context.userProfile||{},currentLifeState:context.currentLifeState||null,
      availableEquipment:context.availableEquipment||null
    });
  }
  function cardModel(exercise,context={}){
    const compatibility=compatibilityFor(exercise,context);
    return {
      id:exercise.id,name:exercise.name,favorite:Boolean(exercise.favorite),
      category:label(exercise.category),pattern:label(exercise.movementPattern),
      muscles:list(exercise.primaryMuscles).map(label),
      equipment:list(exercise.requiredEquipment).map(label),
      recordTypes:list(exercise.recordTypes).map(label),difficulty:label(exercise.difficulty),
      origin:isCustom(exercise)?"Personalizado":"GymOS",status:statusOf(exercise),
      warning:compatibility.compatible?null:compatibilityMessage(compatibility),
      archived:Boolean(exercise.archived)
    };
  }
  function detailModel(exercise,context={}){
    const card=cardModel(exercise,context);
    return {
      ...card,aliases:clone(exercise.aliases||[]),subpattern:label(exercise.movementSubpattern),
      secondaryMuscles:list(exercise.secondaryMuscles).map(label),
      locations:list(exercise.trainingLocations).map(label),
      prescription:clone(exercise.defaultPrescription||{}),
      instructions:{
        short:text(exercise.instructions?.short||exercise.notes),
        setup:clone(exercise.instructions?.setup||[]),
        execution:clone(exercise.instructions?.execution||[]),
        breathing:text(exercise.instructions?.breathing),
        stopIf:clone(exercise.instructions?.stopIf||[])
      },
      warnings:unique([...list(exercise.cautionFlags).map(label),...list(exercise.exclusionFlags).map(label)]),
      pregnancy:clone(exercise.pregnancy||null),
      alternatives:clone(exercise.alternatives||[]),
      editable:isCustom(exercise)
    };
  }
  function compatibilityMessage(result){
    const codes=list(result?.blockers);
    if(codes.includes("equipment_or_location_unavailable")) return "No está disponible con tu equipamiento o ubicación actual.";
    if(codes.includes("exercise_avoided")) return "Está en tu lista de ejercicios evitados.";
    if(codes.some(code=>code.includes("pregnancy"))) return "No está disponible para tu estado vital actual.";
    if(codes.includes("invalid_exercise")) return "La ficha del ejercicio necesita revisión.";
    if(codes.length) return "No está disponible por una restricción de tu perfil.";
    if(list(result?.unresolvedQuestions).length) return "Necesita revisar información de seguridad.";
    return null;
  }
  function favoriteUpdate(exercise,value){
    if(!exercise) return {changed:false,exercise:null};
    const next=Boolean(value);
    if(Boolean(exercise.favorite)===next) return {changed:false,exercise:clone(exercise)};
    return {changed:true,exercise:{...clone(exercise),favorite:next}};
  }
  function serializable(value){
    try{
      const encoded=JSON.stringify(value);
      return typeof encoded==="string"&&!encoded.includes("[object Object]");
    }catch(_){return false;}
  }
  function customInput(input={}){
    return {
      name:text(input.name,160),aliases:unique(input.aliases),category:text(input.category),
      movementPattern:text(input.movementPattern),primaryMuscles:unique(input.primaryMuscles),
      secondaryMuscles:unique(input.secondaryMuscles),requiredEquipment:unique(input.requiredEquipment),
      trainingLocations:unique(input.trainingLocations),difficulty:text(input.difficulty),
      recordTypes:unique(input.recordTypes),defaultPrescription:clone(input.defaultPrescription||{}),
      instructions:clone(input.instructions||{}),notes:text(input.notes,1000),
      technicalComplexity:input.technicalComplexity,stabilityDemand:input.stabilityDemand,
      balanceDemand:input.balanceDemand,unilateral:Boolean(input.unilateral),
      supported:Boolean(input.supported),bodyPositions:unique(input.bodyPositions),
      loadingTypes:unique(input.loadingTypes),substitutionGroups:unique(input.substitutionGroups),
      cautionFlags:unique(input.cautionFlags),exclusionFlags:unique(input.exclusionFlags),
      pregnancy:clone(input.pregnancy||{})
    };
  }
  function validateCustomExercise(input,{library=[],existingId=null}={}){
    if(!serializable(input)){
      return {valid:false,errors:["exercise_not_serializable"],warnings:[],normalized:null};
    }
    const raw=customInput(input),errors=[],warnings=[];
    if(!raw.name) errors.push("exercise_name_required");
    if(text(input?.name).length>160) errors.push("exercise_name_too_long");
    if(!domain().EXERCISE_CATEGORIES.includes(raw.category)) errors.push("invalid_category");
    if(!domain().MOVEMENT_PATTERNS.includes(raw.movementPattern)) errors.push("invalid_movement_pattern");
    if(!raw.recordTypes.length||raw.recordTypes.some(type=>!domain().RECORD_TYPES.includes(type))) errors.push("invalid_record_type");
    if(input?.id&&input.id!==existingId) errors.push("exercise_id_immutable");
    if(existingId&&list(library).some(item=>item.id===existingId&&!isCustom(item))) errors.push("built_in_read_only");
    if(!serializable(raw)) errors.push("exercise_not_serializable");
    const bounded=["technicalComplexity","stabilityDemand","balanceDemand"];
    if(bounded.some(key=>raw[key]!==undefined&&(Number(raw[key])<1||Number(raw[key])>5))) errors.push("metadata_out_of_range");
    const normalized=domain().normalizeExerciseDefinition({
      ...raw,id:existingId||"custom-preview",custom:true,source:"custom"
    },{timestamp:new Date(0).toISOString()});
    const domainValidation=domain().validateExerciseDefinition(normalized);
    errors.push(...domainValidation.errors);
    warnings.push(...domainValidation.warnings);
    if(!text(raw.instructions?.short)&&!raw.instructions?.setup?.length&&!raw.instructions?.execution?.length) warnings.push("instructions_review_required");
    if(raw.pregnancy&&Object.keys(raw.pregnancy).length&&!raw.pregnancy.reviewedAt) warnings.push("pregnancy_review_required");
    const duplicateName=list(library).some(item=>item.id!==existingId&&token(item.name)===token(raw.name));
    if(duplicateName) warnings.push("duplicate_name");
    return {valid:unique(errors).length===0,errors:unique(errors),warnings:unique(warnings),normalized};
  }
  function customExerciseId({ownerId,name,idSeed,library=[]}={}){
    const owner=normalizeOwnerId(ownerId);
    const slug=token(name).replace(/[^a-z0-9 ]/g,"").replace(/\s+/g,"-").replace(/^-|-$/g,"").slice(0,40)||"ejercicio";
    const seed=text(idSeed,200);
    if(!seed) throw new Error("id_seed_required");
    let attempt=0,id;
    do{id=`custom-${slug}-${localHash({owner,seed,attempt}).slice(0,8)}`;attempt++;}while(list(library).some(item=>item.id===id));
    return id;
  }
  function structuralExercise(exercise){
    const copy=clone(exercise);
    delete copy.updatedAt;
    return copy;
  }
  function buildCustomExercise(input,{ownerId,library=[],existing=null,timestamp,idSeed}={}){
    const owner=normalizeOwnerId(ownerId);
    if(existing&&(!isCustom(existing)||existing.ownerId&&existing.ownerId!==owner)) throw new Error("exercise_not_editable");
    const validation=validateCustomExercise(input,{library,existingId:existing?.id||null});
    if(!validation.valid) return {...validation,exercise:null,changed:false};
    const createdAt=existing?.createdAt||text(timestamp);
    if(!createdAt||Number.isNaN(Date.parse(createdAt))) throw new Error("invalid_timestamp");
    const id=existing?.id||customExerciseId({ownerId:owner,name:input.name,idSeed,library});
    const normalized=domain().normalizeExerciseDefinition({
      ...customInput(input),id,custom:true,source:"custom",ownerId:owner,
      favorite:existing?.favorite??Boolean(input.favorite),createdAt,
      updatedAt:existing?.updatedAt||createdAt,legacyIdentityKey:existing?.legacyIdentityKey
    },{timestamp:createdAt});
    const ready=validation.warnings.length===0;
    const candidate={
      ...normalized,id,ownerId:owner,source:"custom",custom:true,
      createdAt,legacyIdentityKey:existing?.legacyIdentityKey||normalized.legacyIdentityKey,
      archived:Boolean(existing?.archived),archivedAt:existing?.archivedAt||null,
      migrationStatus:ready?"ready":"needs_review"
    };
    const changed=!existing||stableStringify(structuralExercise(existing))!==stableStringify(structuralExercise(candidate));
    candidate.updatedAt=changed?text(timestamp):existing.updatedAt;
    return {...validation,exercise:candidate,changed};
  }
  function migrateArchived(items){
    let changed=false;
    const library=list(items).map(item=>{
      if(Object.prototype.hasOwnProperty.call(item,"archived")&&Object.prototype.hasOwnProperty.call(item,"archivedAt")) return clone(item);
      changed=true;
      return {...clone(item),archived:Boolean(item.archived),archivedAt:item.archivedAt||null};
    });
    return {library,changed};
  }
  function referenceSummary(exerciseId,sources={}){
    const target=list(sources.library).find(item=>item.id===exerciseId);
    const targetName=token(target?.name);
    const parseStored=value=>{
      if(typeof value!=="string") return value;
      try{return JSON.parse(value);}catch(_){return null;}
    };
    const matches=value=>{
      const explicit=text(value?.exerciseId||value?.id);
      return explicit===exerciseId||
        text(value?.substitution?.plannedExerciseId)===exerciseId||
        text(value?.substitution?.performedExerciseId)===exerciseId||
        (!explicit&&targetName&&token(value?.name)===targetName);
    };
    const countRoutine=routine=>{
      let count=0;
      if(Array.isArray(routine?.sessions)){
        routine.sessions.forEach(session=>list(session?.exercises).forEach(item=>{if(matches(item)) count++;}));
        return count;
      }
      Object.values(routine||{}).flat().forEach(item=>{if(matches(item)) count++;});
      return count;
    };
    const countDrafts=drafts=>{
      let count=0;
      Object.values(drafts||{}).forEach(raw=>{
        const draft=parseStored(raw);
        list(draft?.exercises).forEach(item=>{if(matches(item)) count++;});
      });
      return count;
    };
    const proposalReferences=proposal=>{
      let count=countRoutine({sessions:list(proposal?.sessions)});
      const source=proposal?.source||{};
      if(text(source.originalExerciseId)===exerciseId) count++;
      if(text(source.replacementExerciseId)===exerciseId) count++;
      return count;
    };
    const counts={routine:0,history:0,drafts:0,proposals:0,activations:0,alternatives:0,favorites:0};
    counts.routine=countRoutine(sources.routine);
    list(sources.history).forEach(workout=>list(workout.exercises).forEach(item=>{if(matches(item)) counts.history++;}));
    counts.drafts=countDrafts(sources.drafts);
    list(sources.proposals).forEach(record=>{
      counts.proposals+=proposalReferences(record?.proposal);
      list(record?.comparison?.changes).forEach(change=>{
        if(matches(change?.before)) counts.proposals++;
        if(matches(change?.after)) counts.proposals++;
      });
    });
    list(sources.activations).forEach(record=>{
      counts.activations+=countRoutine(record?.baseline?.routine);
      counts.activations+=countRoutine(record?.activated?.routine);
      counts.activations+=proposalReferences(record?.baseline?.proposal);
      counts.activations+=countDrafts(record?.baseline?.drafts);
      counts.activations+=countDrafts(record?.baseline?.draftsRaw);
    });
    list(sources.library).forEach(item=>{if(item.id!==exerciseId&&list(item.alternatives).includes(exerciseId)) counts.alternatives++;});
    if(target?.favorite) counts.favorites=1;
    return {counts,total:Object.values(counts).reduce((sum,value)=>sum+value,0),types:Object.keys(counts).filter(key=>counts[key]>0)};
  }
  function removalPolicy(exercise,references){
    if(!exercise) return {allowed:false,action:"none",code:"exercise_not_found"};
    if(!isCustom(exercise)) return {allowed:false,action:"none",code:"built_in_read_only"};
    if(references?.total>0) return {allowed:true,action:"archive",code:"exercise_referenced"};
    return {allowed:true,action:"delete",code:"unreferenced_custom"};
  }
  function archiveExercise(exercise,{timestamp}={}){
    if(!isCustom(exercise)) throw new Error("built_in_read_only");
    if(exercise.archived) return {changed:false,exercise:clone(exercise)};
    return {changed:true,exercise:{...clone(exercise),archived:true,archivedAt:text(timestamp),updatedAt:text(timestamp)}};
  }
  function restoreExercise(exercise,{timestamp}={}){
    if(!isCustom(exercise)) throw new Error("built_in_read_only");
    if(!exercise.archived) return {changed:false,exercise:clone(exercise)};
    return {changed:true,exercise:{...clone(exercise),archived:false,archivedAt:null,updatedAt:text(timestamp)}};
  }
  function recordTypesCompatible(original,replacement){
    const left=list(original?.recordTypes),right=list(replacement?.recordTypes);
    return left.some(a=>right.some(b=>RECORD_TYPE_FAMILIES[a]&&RECORD_TYPE_FAMILIES[a]===RECORD_TYPE_FAMILIES[b]));
  }
  function evaluateAlternatives(original,library,context={}){
    const duplicateIds=new Set();
    const seen=new Set();
    list(library).forEach(item=>{if(seen.has(item.id)) duplicateIds.add(item.id);seen.add(item.id);});
    if(duplicateIds.size) return {available:[],unavailable:[],errors:["library_duplicate_ids"]};
    const alternatives=new Set(list(original?.alternatives));
    const groups=new Set(list(original?.substitutionGroups));
    const originalMuscles=new Set(list(original?.primaryMuscles));
    const rows=list(library).filter(item=>item.id!==original?.id).map(exercise=>{
      const definition=domain().validateExerciseDefinition(exercise);
      const compatibility=compatibilityFor(exercise,context);
      const reasons=[];
      let tier=5,score=0;
      if(alternatives.has(exercise.id)){tier=0;score+=100;reasons.push("Alternativa indicada en la ficha.");}
      if(list(exercise.substitutionGroups).some(group=>groups.has(group))){tier=Math.min(tier,1);score+=50;reasons.push("Comparte grupo de sustitución.");}
      if(exercise.movementPattern===original?.movementPattern){tier=Math.min(tier,2);score+=30;reasons.push("Mantiene el mismo patrón.");}
      const muscleMatches=list(exercise.primaryMuscles).filter(muscle=>originalMuscles.has(muscle)).length;
      if(muscleMatches){tier=Math.min(tier,3);score+=muscleMatches*10;reasons.push("Trabaja el mismo grupo muscular.");}
      const recordCompatible=recordTypesCompatible(original,exercise);
      if(recordCompatible) score+=5;
      if(exercise.favorite) score+=2;
      if(list(context.knownExerciseIds).includes(exercise.id)) score+=1;
      const blocked=[];
      if(isCustom(exercise)&&exercise.ownerId&&context.ownerId&&exercise.ownerId!==context.ownerId){
        blocked.push("owner_mismatch");
      }
      if(exercise.archived) blocked.push("archived");
      if(exercise.migrationStatus!=="ready") blocked.push("needs_review");
      if(!definition.valid) blocked.push("invalid_exercise");
      blocked.push(...list(compatibility.blockers));
      if(!recordCompatible) blocked.push("record_type_incompatible");
      const available=unique(blocked).length===0&&reasons.length>0;
      return {
        exercise:clone(exercise),available,blocked:unique(blocked),
        warnings:unique([...list(definition.warnings),...list(compatibility.warnings)]),
        unresolvedQuestions:clone(compatibility.unresolvedQuestions||[]),
        reasons:unique(reasons),tier,score,
        label:tier===0?"Mejor coincidencia":tier<=2?"Mismo patrón":tier===3?"Mismo grupo muscular":"Alternativa"
      };
    });
    const order=(a,b)=>a.tier-b.tier||b.score-a.score||
      text(a.exercise.name).localeCompare(text(b.exercise.name),"es",{sensitivity:"base"})||
      text(a.exercise.id).localeCompare(text(b.exercise.id),"en");
    return {
      available:rows.filter(row=>row.available).sort(order).map(clone),
      unavailable:rows.filter(row=>!row.available&&row.reasons.length).sort(order).map(clone),
      errors:[]
    };
  }
  function hasExerciseResults(exercise){
    if(Boolean(exercise?.done||exercise?.completed)) return true;
    if(["done","completed"].includes(token(exercise?.status))) return true;
    const resultValues=exercise?.results&&typeof exercise.results==="object"
      ?Object.values(exercise.results)
      :[];
    if(resultValues.some(value=>Array.isArray(value)?value.length>0:text(value)!=="")) return true;
    return list(exercise?.series).some(series=>
      Boolean(series?.done||series?.completed)||
      ["weight","reps","seconds","duration","distance","rir","value","load","assistance"]
        .some(key=>text(series?.[key])!=="")
    );
  }
  function resetSeriesForReplacement(series){
    return list(series).map(item=>({
      ...clone(item),weight:"",reps:"",seconds:"",duration:"",distance:"",
      done:false,completed:false,rir:""
    }));
  }
  function temporarySubstitution({draft,session,exerciseIndex,original,replacement,reason,timestamp}={}){
    const next=clone(draft);
    if(!next||next.session!==session) return {ok:false,code:"draft_changed"};
    const index=Number(exerciseIndex),current=next.exercises?.[index];
    if(!current) return {ok:false,code:"exercise_not_found"};
    if(hasExerciseResults(current)) return {ok:false,code:"exercise_already_started"};
    if(!recordTypesCompatible(original,replacement)) return {ok:false,code:"record_type_incompatible"};
    const prescription={
      target:current.target,sets:current.sets,increment:current.increment,
      type:current.type,targetRir:current.targetRir,restSeconds:current.restSeconds
    };
    next.exercises[index]={
      ...current,id:replacement.id,exerciseId:replacement.id,name:replacement.name,
      equipment:list(replacement.requiredEquipment).join(", "),
      recordTypes:clone(replacement.recordTypes),
      series:resetSeriesForReplacement(current.series),
      substitution:{
        mode:"temporary",
        plannedExerciseId:original.id||current.exerciseId||current.id||null,
        plannedExerciseName:original.name||current.name,
        performedExerciseId:replacement.id,
        performedExerciseName:replacement.name,
        substitutedAt:text(timestamp),reason:text(reason,500),
        plannedSnapshot:{...clone(current),substitution:undefined,series:resetSeriesForReplacement(current.series)},
        prescription
      }
    };
    return {ok:true,draft:next,exercise:clone(next.exercises[index])};
  }
  function undoTemporarySubstitution({draft,session,exerciseIndex}={}){
    const next=clone(draft);
    if(!next||next.session!==session) return {ok:false,code:"draft_changed"};
    const index=Number(exerciseIndex),current=next.exercises?.[index];
    if(!current) return {ok:false,code:"exercise_not_found"};
    if(!current.substitution||current.substitution.mode!=="temporary") return {ok:true,idempotent:true,draft:next};
    if(hasExerciseResults(current)) return {ok:false,code:"exercise_already_started"};
    next.exercises[index]=clone(current.substitution.plannedSnapshot);
    return {ok:true,idempotent:false,draft:next,exercise:clone(next.exercises[index])};
  }
  function proposalSessionFromRoutine(key,items,index){
    return {
      id:key,label:`Sesión ${key}`,focus:null,estimatedDurationMin:null,
      exercises:list(items).map((item,exerciseIndex)=>({
        exerciseId:item.exerciseId||item.id||`legacy-${key}-${exerciseIndex+1}`,
        name:item.name,pattern:item.pattern||item.movementPattern||null,
        role:item.role||item.function||"main",
        prescription:{
          sets:Number(item.sets)||3,target:clone(item.target||item.reps||"8-12"),
          targetRir:clone(item.targetRir||{min:2,max:4}),
          restSeconds:Number(item.restSeconds)||90,
          recordType:list(item.recordTypes)[0]||item.recordType||"weight_reps"
        },
        movementPattern:item.movementPattern||item.pattern||null,
        function:item.function||item.role||"main",
        requiredEquipment:clone(item.requiredEquipment||item.equipment||[]),
        equipment:clone(item.requiredEquipment||item.equipment||[]),
        difficulty:item.difficulty||null,notes:item.notes||null,
        metadata:clone(item.metadata||null)
      }))
    };
  }
  function routineSessions(routine){
    if(Array.isArray(routine?.sessions)) return clone(routine.sessions);
    return ["A","B","C"].filter(key=>list(routine?.[key]).length)
      .map((key,index)=>proposalSessionFromRoutine(key,routine[key],index));
  }
  function substitutionFingerprint({ownerId,baselineHash,sessionId,exerciseIndex,originalExerciseId,replacementExerciseId,prescription}={}){
    const payload={
      ownerId:normalizeOwnerId(ownerId),baselineHash:text(baselineHash),
      sessionId:text(sessionId),exerciseIndex:Number(exerciseIndex),
      originalExerciseId:text(originalExerciseId),replacementExerciseId:text(replacementExerciseId),
      prescription:clone(prescription),version:MODEL_VERSION
    };
    return proposals().stableHash?proposals().stableHash(payload):`substitution-${localHash(payload)}`;
  }
  function permanentSubstitutionProposal({
    ownerId,routine,baselineHash,sessionId,exerciseIndex,original,replacement,
    reason,generatedAt,compatibility
  }={}){
    const sessions=routineSessions(routine);
    const session=sessions.find(item=>item.id===sessionId);
    const index=Number(exerciseIndex);
    const current=session?.exercises?.[index];
    const sameOriginal=current&&(
      current.exerciseId===original?.id||
      token(current.name)===token(original?.name)||
      list(original?.aliases).some(alias=>token(alias)===token(current.name))
    );
    if(!sameOriginal) throw new Error("baseline_exercise_changed");
    const compatibleType=recordTypesCompatible(original,replacement);
    const replacementValidation=domain().validateExerciseDefinition(replacement);
    const replacementCompatibility=compatibility||{compatible:true,blockers:[],warnings:[],unresolvedQuestions:[]};
    const nextExercise={
      ...clone(current),exerciseId:replacement.id,name:replacement.name,
      pattern:replacement.movementPattern,function:current.function||current.role||"main",
      movementPattern:replacement.movementPattern,
      requiredEquipment:clone(replacement.requiredEquipment),
      equipment:clone(replacement.requiredEquipment),difficulty:replacement.difficulty,
      metadata:{
        source:replacement.source,recordTypes:clone(replacement.recordTypes),
        primaryMuscles:clone(replacement.primaryMuscles),
        substitution:{originalExerciseId:original.id,reason:text(reason,500)}
      },
      prescription:compatibleType?clone(current.prescription):{
        ...clone(replacement.defaultPrescription),
        recordType:list(replacement.recordTypes)[0]||null
      },
      selectionReason:`Sustituye ${original.name} por decisión del usuario.`,
      selectionReasons:["Sustitución solicitada por el usuario."],alternatives:[]
    };
    session.exercises[index]=nextExercise;
    const fingerprint=substitutionFingerprint({
      ownerId,baselineHash,sessionId,exerciseIndex: index,
      originalExerciseId:original.id,replacementExerciseId:replacement.id,
      prescription:nextExercise.prescription
    });
    const warningCodes=unique([
      ...list(replacementValidation.warnings),...list(replacementCompatibility.warnings),
      ...(!compatibleType?["record_type_incompatible"]:[])
    ]);
    const unresolved=unique([
      ...list(replacementCompatibility.unresolvedQuestions),
      ...list(replacementCompatibility.blockers)
    ]);
    const reviewRequired=!compatibleType||!replacementValidation.valid||
      !replacementCompatibility.compatible||warningCodes.length>0||unresolved.length>0;
    const covered=unique(sessions.flatMap(item=>item.exercises.map(ex=>ex.pattern).filter(Boolean))).sort();
    // A substitution proposal preserves an already-active baseline. It validates the
    // replacement, but must not retroactively reject legacy routine metadata that
    // predates the generator's complete-pattern contract.
    const required=clone(covered);
    const missing=[];
    const activationCompatibility=proposals().activationCompatibility({sessions});
    if(reviewRequired) activationCompatibility.compatible=false;
    return {
      version:MODEL_VERSION,
      proposalId:`proposal-substitution-${fingerprint.replace(/^routine-/,"")}`,
      type:"exercise_substitution",generatedAt:text(generatedAt),reviewRequired,
      source:{
        type:"exercise_substitution",sessionId,originalExerciseId:original.id,
        replacementExerciseId:replacement.id,substitutionFingerprint:fingerprint
      },
      inputSummary:{source:"exercise_substitution",days:sessions.length},
      rationale:[`Sustituir ${original.name} por ${replacement.name}.`,...(text(reason)?[`Motivo: ${text(reason,500)}`]:[])],
      warnings:warningCodes.map(label),unresolvedQuestions:unresolved.map(label),
      weeklyStructure:{id:`substitution_${sessions.length}_day`,label:`Rutina de ${sessions.length} sesiones`,days:sessions.length,focuses:sessions.map(item=>item.focus)},
      sessions,selectedExercises:sessions.flatMap(item=>item.exercises.map(ex=>ex.exerciseId)),
      coverage:{requiredPatterns:required,coveredPatterns:covered,missingPatterns:missing,balanced:missing.length===0},
      activationCompatibility,
      validation:{
        valid:replacementValidation.valid&&unresolved.length===0&&compatibleType,
        results:warningCodes.map(code=>({code,severity:"warning",message:label(code)})),
        selectedExerciseIds:sessions.flatMap(item=>item.exercises.map(ex=>ex.exerciseId))
      }
    };
  }
  function findExistingSubstitution(records,ownerId,fingerprint){
    const owner=normalizeOwnerId(ownerId);
    const matches=list(records).filter(record=>record?.ownerId===owner&&
      record?.proposal?.source?.substitutionFingerprint===fingerprint);
    matches.sort((a,b)=>text(b.lifecycle?.createdAt).localeCompare(text(a.lifecycle?.createdAt),"en")||
      text(a.proposal?.proposalId).localeCompare(text(b.proposal?.proposalId),"en"));
    return clone(matches[0]||null);
  }
  function historyExercise(exercise){
    const result=clone(exercise);
    if(result?.substitution?.mode==="temporary"){
      delete result.substitution.plannedSnapshot;
      delete result.substitution.prescription;
      result.exerciseId=result.substitution.performedExerciseId||result.exerciseId;
      result.name=result.substitution.performedExerciseName||result.name;
    }
    return result;
  }

  global.GymOSExerciseLibraryWorkflow=Object.freeze({
    MODEL_VERSION,FILTER_DEFAULTS,SORTS,RECORD_TYPE_FAMILIES,LABELS,
    label,normalizeFilters,clearOwnerUiState,filterExercises,filterOptions,
    cardModel,detailModel,favoriteUpdate,validateCustomExercise,customExerciseId,
    buildCustomExercise,migrateArchived,referenceSummary,removalPolicy,
    archiveExercise,restoreExercise,recordTypesCompatible,evaluateAlternatives,
    hasExerciseResults,temporarySubstitution,undoTemporarySubstitution,
    substitutionFingerprint,permanentSubstitutionProposal,findExistingSubstitution,
    historyExercise
  });
})(typeof window!=="undefined"?window:globalThis);
