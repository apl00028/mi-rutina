const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const root=path.join(__dirname,"..");
const sources=[
  "exercise-domain.js","profile-data.js","routine-generator.js",
  "routine-proposals.js","routine-activation.js","exercise-library-workflow.js"
].map(name=>[name,fs.readFileSync(path.join(root,name),"utf8")]);
const appSource=fs.readFileSync(path.join(root,"app.js"),"utf8");
const indexSource=fs.readFileSync(path.join(root,"index.html"),"utf8");
const workerSource=fs.readFileSync(path.join(root,"service-worker.js"),"utf8");
const OWNER_A="11111111-1111-4111-8111-111111111111";
const OWNER_B="22222222-2222-4222-8222-222222222222";
const T1="2026-07-29T08:00:00.000Z";
const T2="2026-07-29T09:00:00.000Z";

function plain(value){return JSON.parse(JSON.stringify(value));}
function load(){
  return loadContext().GymOSExerciseLibraryWorkflow;
}
function loadContext(){
  const context={console,structuredClone:value=>plain(value)};
  context.globalThis=context;
  for(const [name,source] of sources) vm.runInNewContext(source,context,{filename:name});
  return context;
}
function exercise(id,name,overrides={}){
  return {
    id,name,aliases:[],category:"strength",movementPattern:"horizontal_push",
    primaryMuscles:["chest"],secondaryMuscles:["triceps"],
    requiredEquipment:["bodyweight"],trainingLocations:["gym"],
    difficulty:"beginner",recordTypes:["weight_reps"],
    defaultPrescription:{sets:3,repRange:{min:8,max:12},targetRir:{min:2,max:3},restSeconds:90,incrementKg:2.5},
    substitutionGroups:["horizontal_push","chest"],alternatives:[],
    pregnancy:{eligibleForConsideration:false,stageTags:[],prohibitedByProduct:false,balanceRisk:"low",fallRisk:"low",impactLevel:"low"},
    cautionFlags:[],exclusionFlags:[],instructions:{short:"Controla el movimiento.",setup:[],execution:[],breathing:"",stopIf:[]},
    source:"built_in",custom:false,migrationStatus:"ready",favorite:false,
    createdAt:T1,updatedAt:T1,archived:false,archivedAt:null,...overrides
  };
}
function library(){
  return [
    exercise("press","Press de banca",{aliases:["Press banca"],requiredEquipment:["barbell"],favorite:true}),
    exercise("row","Remo sentado",{movementPattern:"horizontal_pull",primaryMuscles:["back"],secondaryMuscles:["biceps"],requiredEquipment:["cable_machine"]}),
    exercise("pushup","Flexiones",{aliases:["Fondos en suelo"],requiredEquipment:["bodyweight"],createdAt:T2}),
    exercise("custom-remo-1","Remo de casa",{source:"custom",custom:true,movementPattern:"horizontal_pull",primaryMuscles:["back"],requiredEquipment:["dumbbells"],ownerId:OWNER_A}),
    exercise("archived","Press antiguo",{source:"custom",custom:true,archived:true,archivedAt:T2,ownerId:OWNER_A})
  ];
}
function context(overrides={}){
  return {userProfile:{availableEquipment:["bodyweight","barbell","cable_machine","dumbbells"],trainingLocation:"gym",avoidedExercises:[]},...overrides};
}
function routine(){
  return {
    A:[
      {id:"press",exerciseId:"press",name:"Press de banca",sets:3,target:"8-12",targetRir:"2-3",restSeconds:90,recordTypes:["weight_reps"],movementPattern:"horizontal_push",requiredEquipment:["barbell"]},
      {id:"row",exerciseId:"row",name:"Remo sentado",sets:3,target:"8-12",targetRir:"2-3",restSeconds:90,recordTypes:["weight_reps"],movementPattern:"horizontal_pull",requiredEquipment:["cable_machine"]}
    ],
    B:[
      {id:"pushup",exerciseId:"pushup",name:"Flexiones",sets:3,target:"10-15",targetRir:"2-3",restSeconds:60,recordTypes:["weight_reps"],movementPattern:"horizontal_push",requiredEquipment:["bodyweight"]}
    ],
    C:[]
  };
}
function draft(){
  return {
    session:"A",startedAt:1,exercises:[
      {id:"press",exerciseId:"press",name:"Press de banca",sets:3,target:"8-12",targetRir:"2-3",restSeconds:90,type:"Fuerza",series:[
        {weight:"",reps:"",rir:"",done:false},{weight:"",reps:"",rir:"",done:false},{weight:"",reps:"",rir:"",done:false}
      ]},
      {id:"row",exerciseId:"row",name:"Remo sentado",sets:3,target:"8-12",targetRir:"2-3",restSeconds:90,type:"Fuerza",series:[
        {weight:"",reps:"",rir:"",done:false}
      ]}
    ]
  };
}
function customInput(overrides={}){
  return {
    name:"Press personal",aliases:["Press propio"],category:"strength",
    movementPattern:"horizontal_push",primaryMuscles:["chest"],secondaryMuscles:["triceps"],
    requiredEquipment:["bodyweight"],trainingLocations:["gym"],difficulty:"beginner",
    recordTypes:["weight_reps"],defaultPrescription:{sets:3,repRange:{min:8,max:12},targetRir:{min:2,max:3},restSeconds:90},
    instructions:{short:"Controla el movimiento.",setup:["Prepárate"],execution:["Empuja"],breathing:"Espira",stopIf:["Dolor"]},
    notes:"Nota",...overrides
  };
}
function searchDebounceHarness(){
  const start=appSource.indexOf("function cancelExerciseLibrarySearchDebounce()");
  const end=appSource.indexOf("function renderExerciseLibrary(){",start);
  const source=appSource.slice(start,end);
  const pending=new Map();
  let nextId=1,renderCount=0,currentOwner=OWNER_A;
  const context={
    setTimeout(callback,delay){const id=nextId++;pending.set(id,{callback,delay});return id;},
    clearTimeout(id){pending.delete(id);},
    state:{screen:"exerciseLibrary",exerciseLibrarySearchRefocus:false},
    currentRoutineOwnerOrNull:()=>currentOwner,
    renderExerciseLibrary:()=>{renderCount+=1;}
  };
  context.globalThis=context;
  vm.runInNewContext(
    `let exerciseLibrarySearchDebounceTimer=null;
     let exerciseLibrarySearchDebounceVersion=0;
     ${source}
     globalThis.searchApi={cancelExerciseLibrarySearchDebounce,scheduleExerciseLibrarySearchUpdate};`,
    context
  );
  return {
    api:context.searchApi,pending,context,
    setOwner(value){currentOwner=value;},
    renderCount(){return renderCount;}
  };
}

test("búsqueda por nombre, alias y sin tildes",()=>{
  const api=load(),items=library();
  assert.deepEqual(api.filterExercises(items,{query:"press"}).map(x=>x.id),["press"]);
  assert.deepEqual(api.filterExercises(items,{query:"fondos en suelo"}).map(x=>x.id),["pushup"]);
  assert.deepEqual(api.filterExercises(items,{query:"flexiones"}).map(x=>x.id),["pushup"]);
});
test("búsqueda usa músculos y equipamiento traducido",()=>{
  const api=load();
  assert.deepEqual(api.filterExercises(library(),{query:"espalda"}).map(x=>x.id),["custom-remo-1","row"]);
  assert.deepEqual(api.filterExercises(library(),{query:"mancuernas"}).map(x=>x.id),["custom-remo-1"]);
});
test("filtros por categoría, patrón, músculo y equipamiento",()=>{
  const api=load(),items=library();
  assert.equal(api.filterExercises(items,{category:"strength"}).length,4);
  assert.deepEqual(api.filterExercises(items,{pattern:"horizontal_pull"}).map(x=>x.id),["custom-remo-1","row"]);
  assert.deepEqual(api.filterExercises(items,{muscle:"back"}).map(x=>x.id),["custom-remo-1","row"]);
  assert.deepEqual(api.filterExercises(items,{equipment:"barbell"}).map(x=>x.id),["press"]);
});
test("filtros favoritos, personalizados, estado y archivados",()=>{
  const api=load(),items=library();
  assert.deepEqual(api.filterExercises(items,{favorites:true}).map(x=>x.id),["press"]);
  assert.deepEqual(api.filterExercises(items,{custom:true}).map(x=>x.id),["custom-remo-1"]);
  assert.equal(api.filterExercises(items,{status:"ready"}).length,4);
  assert.deepEqual(api.filterExercises(items,{archived:true}).map(x=>x.id),["archived"]);
});
test("filtros se combinan por intersección",()=>{
  const api=load();
  assert.deepEqual(api.filterExercises(library(),{custom:true,pattern:"horizontal_pull",equipment:"dumbbells"}).map(x=>x.id),["custom-remo-1"]);
  assert.equal(api.filterExercises(library(),{favorites:true,pattern:"horizontal_pull"}).length,0);
});
test("ordenación es determinista e independiente de entrada",()=>{
  const api=load(),items=library(),reversed=[...items].reverse();
  for(const sort of api.SORTS){
    const options={usage:{press:{count:2},row:{count:5}}};
    assert.deepEqual(api.filterExercises(items,{sort},options),api.filterExercises(reversed,{sort},options));
  }
});
test("filtrar y ordenar no modifica la biblioteca",()=>{
  const api=load(),items=library(),before=JSON.stringify(items);
  api.filterExercises(items,{query:"press",sort:"favorites"});
  assert.equal(JSON.stringify(items),before);
});
test("estado visual por propietario se reinicia sin datos anteriores",()=>{
  const api=load();
  assert.deepEqual(plain(api.clearOwnerUiState()),{
    filters:plain(api.normalizeFilters()),selectedId:null,form:null,substitution:null,message:null,busy:null
  });
});
test("favorito conserva el resto e idempotencia",()=>{
  const api=load(),item=exercise("x","Ejercicio"),before=plain(item);
  const changed=api.favoriteUpdate(item,true);
  assert.equal(changed.changed,true);
  assert.deepEqual(plain({...changed.exercise,favorite:false}),before);
  assert.equal(api.favoriteUpdate(changed.exercise,true).changed,false);
  assert.equal(api.favoriteUpdate(changed.exercise,false).exercise.favorite,false);
});
test("tarjeta y detalle traducen códigos y no exponen tokens crudos",()=>{
  const api=load(),item=exercise("x","Ejercicio",{movementPattern:"knee_dominant"});
  const card=api.cardModel(item,context());
  assert.equal(card.pattern,"Dominante de rodilla");
  assert.equal(JSON.stringify(card).includes("knee_dominant"),false);
  const detail=api.detailModel(item,context());
  assert.equal(detail.editable,false);
});
test("código desconocido se convierte en texto legible",()=>{
  assert.equal(load().label("new_unknown_code"),"New unknown code");
});
test("crear personalizado válido genera ID owner-scoped estable",()=>{
  const api=load(),options={ownerId:OWNER_A,library:library(),timestamp:T1,idSeed:"seed-a"};
  const result=api.buildCustomExercise(customInput(),options);
  assert.equal(result.valid,true);
  assert.match(result.exercise.id,/^custom-press-personal-[a-z0-9]{8}$/);
  assert.equal(result.exercise.ownerId,OWNER_A);
  assert.equal(result.exercise.migrationStatus,"ready");
  assert.equal(api.buildCustomExercise(customInput(),options).exercise.id,result.exercise.id);
});
test("dos ejercicios con mismo nombre reciben IDs distintos y warning",()=>{
  const api=load();
  const first=api.buildCustomExercise(customInput(),{ownerId:OWNER_A,library:library(),timestamp:T1,idSeed:"one"}).exercise;
  const second=api.buildCustomExercise(customInput(),{ownerId:OWNER_A,library:[...library(),first],timestamp:T2,idSeed:"two"});
  assert.notEqual(second.exercise.id,first.id);
  assert.ok(second.warnings.includes("duplicate_name"));
});
test("validación bloquea nombre, categoría, patrón y tipo inválidos",()=>{
  const api=load();
  assert.ok(api.validateCustomExercise(customInput({name:""})).errors.includes("exercise_name_required"));
  assert.ok(api.validateCustomExercise(customInput({category:"bad"})).errors.includes("invalid_category"));
  assert.ok(api.validateCustomExercise(customInput({movementPattern:"bad"})).errors.includes("invalid_movement_pattern"));
  assert.ok(api.validateCustomExercise(customInput({recordTypes:["bad"]})).errors.includes("invalid_record_type"));
});
test("warnings producen needs_review sin inventar datos",()=>{
  const api=load();
  const result=api.buildCustomExercise(customInput({primaryMuscles:[],requiredEquipment:[],instructions:{}}),{
    ownerId:OWNER_A,library:library(),timestamp:T1,idSeed:"review"
  });
  assert.equal(result.valid,true);
  assert.equal(result.exercise.migrationStatus,"needs_review");
  assert.deepEqual(plain(result.exercise.primaryMuscles),[]);
});
test("editar conserva ID, createdAt y edición idéntica conserva updatedAt",()=>{
  const api=load();
  const original=api.buildCustomExercise(customInput(),{ownerId:OWNER_A,library:library(),timestamp:T1,idSeed:"edit"}).exercise;
  const same=api.buildCustomExercise(customInput(),{ownerId:OWNER_A,library:[...library(),original],existing:original,timestamp:T2,idSeed:"ignored"});
  assert.equal(same.changed,false);
  assert.equal(same.exercise.id,original.id);
  assert.equal(same.exercise.createdAt,T1);
  assert.equal(same.exercise.updatedAt,T1);
  const changed=api.buildCustomExercise(customInput({notes:"Cambio"}),{ownerId:OWNER_A,library:[...library(),original],existing:original,timestamp:T2});
  assert.equal(changed.exercise.updatedAt,T2);
});
test("integrado no se puede editar",()=>{
  assert.throws(()=>load().buildCustomExercise(customInput(),{ownerId:OWNER_A,library:library(),existing:library()[0],timestamp:T2}),/exercise_not_editable/);
});
test("ID no es editable y propietario queda aislado",()=>{
  const api=load();
  assert.ok(api.validateCustomExercise({...customInput(),id:"changed"},{existingId:"original"}).errors.includes("exercise_id_immutable"));
  const custom=exercise("custom-x","X",{custom:true,source:"custom",ownerId:OWNER_A});
  assert.throws(()=>api.buildCustomExercise(customInput(),{ownerId:OWNER_B,existing:custom,timestamp:T2}),/exercise_not_editable/);
});
test("migración archived es idempotente y no cambia timestamps",()=>{
  const api=load(),items=[exercise("x","X")];
  delete items[0].archived;delete items[0].archivedAt;
  const first=api.migrateArchived(items),second=api.migrateArchived(first.library);
  assert.equal(first.changed,true);assert.equal(second.changed,false);
  assert.equal(first.library[0].updatedAt,T1);
});
test("detecta referencias de rutina, historial, draft, propuestas, activaciones y alternativas",()=>{
  const api=load(),id="custom-x";
  const ref={exerciseId:id};
  const summary=api.referenceSummary(id,{
    routine:{A:[ref]},history:[{exercises:[ref]}],drafts:{A:{exercises:[ref]}},
    proposals:[{proposal:{sessions:[{exercises:[ref]}]}}],
    activations:[{baseline:{routine:{A:[ref]}},activated:{routine:{A:[ref]}}}],
    library:[exercise(id,"X",{custom:true,source:"custom",favorite:true}),exercise("y","Y",{alternatives:[id]})]
  });
  assert.equal(summary.counts.routine,1);assert.equal(summary.counts.history,1);
  assert.equal(summary.counts.drafts,1);assert.equal(summary.counts.proposals,1);
  assert.equal(summary.counts.activations,2);assert.equal(summary.counts.alternatives,1);
  assert.equal(summary.counts.favorites,1);
});
test("sin referencias elimina; con referencias archiva; integrado se bloquea",()=>{
  const api=load(),custom=exercise("x","X",{custom:true,source:"custom"});
  assert.equal(api.removalPolicy(custom,{total:0}).action,"delete");
  assert.equal(api.removalPolicy(custom,{total:1}).action,"archive");
  assert.equal(api.removalPolicy(exercise("x","X"),{total:0}).allowed,false);
});
test("archivar, restaurar e idempotencia conservan ID",()=>{
  const api=load(),custom=exercise("x","X",{custom:true,source:"custom"});
  const archived=api.archiveExercise(custom,{timestamp:T2});
  assert.equal(archived.exercise.id,"x");assert.equal(archived.exercise.archived,true);
  assert.equal(api.archiveExercise(archived.exercise,{timestamp:T2}).changed,false);
  const restored=api.restoreExercise(archived.exercise,{timestamp:T2});
  assert.equal(restored.exercise.archived,false);assert.equal(restored.exercise.id,"x");
});
test("alternativa explícita y grupo compartido tienen prioridad",()=>{
  const api=load(),items=library();
  const original=exercise("original","Original",{alternatives:["row"],substitutionGroups:["special"],requiredEquipment:["bodyweight"]});
  items[2].substitutionGroups=["special"];
  const result=api.evaluateAlternatives(original,items,context());
  assert.equal(result.available[0].exercise.id,"row");
  assert.equal(result.available[1].exercise.id,"pushup");
});
test("ranking contempla patrón y músculo y no modifica entradas",()=>{
  const api=load(),items=library(),original=exercise("original","Original"),before=JSON.stringify(items);
  const result=api.evaluateAlternatives(original,items,context());
  assert.ok(result.available.some(row=>row.exercise.id==="pushup"&&row.reasons.includes("Mantiene el mismo patrón.")));
  assert.equal(JSON.stringify(items),before);
});
test("ranking es independiente del orden de biblioteca",()=>{
  const api=load(),items=library(),original=exercise("original","Original");
  assert.deepEqual(api.evaluateAlternatives(original,items,context()),api.evaluateAlternatives(original,[...items].reverse(),context()));
});
test("equipamiento, restricción, evitado, archived y needs_review bloquean",()=>{
  const api=load(),original=exercise("original","Original");
  const items=[
    exercise("equipment","Equipo",{requiredEquipment:["leg_press"]}),
    exercise("avoided","Evitar este",{requiredEquipment:["bodyweight"]}),
    exercise("old","Archivado",{archived:true}),
    exercise("review","Revisión",{migrationStatus:"needs_review"})
  ];
  const result=api.evaluateAlternatives(original,items,context({userProfile:{availableEquipment:["bodyweight"],trainingLocation:"gym",avoidedExercises:["Evitar este"]}}));
  assert.equal(result.available.length,0);
  assert.ok(result.unavailable.find(row=>row.exercise.id==="equipment").blocked.includes("equipment_or_location_unavailable"));
  assert.ok(result.unavailable.find(row=>row.exercise.id==="avoided").blocked.includes("exercise_avoided"));
  assert.ok(result.unavailable.find(row=>row.exercise.id==="old").blocked.includes("archived"));
  assert.ok(result.unavailable.find(row=>row.exercise.id==="review").blocked.includes("needs_review"));
});
test("biblioteca con IDs duplicados bloquea ranking completo",()=>{
  const api=load(),item=exercise("same","A");
  assert.deepEqual(plain(api.evaluateAlternatives(exercise("original","Original"),[item,{...item,name:"B"}],context()).errors),["library_duplicate_ids"]);
});
test("no existe fallback inseguro ni candidato sin relación",()=>{
  const api=load(),unrelated=exercise("run","Correr",{category:"cardio",movementPattern:"loaded_carry",primaryMuscles:["calves"],recordTypes:["distance_time"],substitutionGroups:["cardio"]});
  const result=api.evaluateAlternatives(exercise("original","Original"),[unrelated],context());
  assert.equal(result.available.length,0);assert.equal(result.unavailable.length,0);
});
test("compatibilidad de tipos exige familia exacta",()=>{
  const api=load();
  assert.equal(api.recordTypesCompatible(exercise("a","A"),exercise("b","B")),true);
  assert.equal(api.recordTypesCompatible(exercise("a","A"),exercise("b","B",{recordTypes:["duration"]})),false);
});
test("sustitución temporal conserva prescripción y solo cambia un ejercicio",()=>{
  const api=load(),before=draft(),routineBefore=JSON.stringify(routine()),historyBefore="[]";
  const result=api.temporarySubstitution({
    draft:before,session:"A",exerciseIndex:0,original:library()[0],
    replacement:library()[2],reason:"Molestia",timestamp:T2
  });
  assert.equal(result.ok,true);
  assert.equal(result.draft.exercises[0].name,"Flexiones");
  assert.equal(result.draft.exercises[0].target,"8-12");
  assert.deepEqual(plain(result.draft.exercises[1]),before.exercises[1]);
  assert.equal(JSON.stringify(routine()),routineBefore);assert.equal(historyBefore,"[]");
});
test("sustitución temporal guarda metadatos y limpia resultados/timers de serie",()=>{
  const api=load(),result=api.temporarySubstitution({
    draft:draft(),session:"A",exerciseIndex:0,original:library()[0],replacement:library()[2],timestamp:T2
  });
  assert.equal(result.exercise.substitution.mode,"temporary");
  assert.equal(result.exercise.substitution.plannedExerciseId,"press");
  assert.equal(result.exercise.substitution.performedExerciseId,"pushup");
  assert.equal(result.exercise.series.every(row=>!row.done&&row.weight===""&&row.reps===""),true);
});
test("no sustituye después de registrar resultados",()=>{
  const api=load(),started=draft();started.exercises[0].series[0].weight="40";
  assert.equal(api.temporarySubstitution({draft:started,session:"A",exerciseIndex:0,original:library()[0],replacement:library()[2],timestamp:T2}).code,"exercise_already_started");
  started.exercises[0].series[0].weight="";started.exercises[0].series[0].done=true;
  assert.equal(api.temporarySubstitution({draft:started,session:"A",exerciseIndex:0,original:library()[0],replacement:library()[2],timestamp:T2}).code,"exercise_already_started");
});
test("tipo incompatible bloquea sustitución rápida",()=>{
  const timed=exercise("timer","Plancha",{recordTypes:["duration"]});
  assert.equal(load().temporarySubstitution({draft:draft(),session:"A",exerciseIndex:0,original:library()[0],replacement:timed,timestamp:T2}).code,"record_type_incompatible");
});
test("deshacer restaura original y repetir es idempotente",()=>{
  const api=load(),changed=api.temporarySubstitution({draft:draft(),session:"A",exerciseIndex:0,original:library()[0],replacement:library()[2],timestamp:T2});
  const restored=api.undoTemporarySubstitution({draft:changed.draft,session:"A",exerciseIndex:0});
  assert.equal(restored.ok,true);assert.equal(restored.exercise.name,"Press de banca");
  assert.equal(api.undoTemporarySubstitution({draft:restored.draft,session:"A",exerciseIndex:0}).idempotent,true);
});
test("deshacer se bloquea si ya existen resultados",()=>{
  const api=load(),changed=api.temporarySubstitution({draft:draft(),session:"A",exerciseIndex:0,original:library()[0],replacement:library()[2],timestamp:T2});
  changed.draft.exercises[0].series[0].reps="8";
  assert.equal(api.undoTemporarySubstitution({draft:changed.draft,session:"A",exerciseIndex:0}).code,"exercise_already_started");
});
test("snapshot histórico usa ejercicio realizado y conserva planificado",()=>{
  const api=load(),changed=api.temporarySubstitution({draft:draft(),session:"A",exerciseIndex:0,original:library()[0],replacement:library()[2],reason:"Equipo",timestamp:T2});
  const history=api.historyExercise(changed.exercise);
  assert.equal(history.exerciseId,"pushup");assert.equal(history.name,"Flexiones");
  assert.equal(history.substitution.plannedExerciseId,"press");
  assert.equal("plannedSnapshot" in history.substitution,false);
});
test("registro histórico antiguo sigue funcionando sin substitution",()=>{
  const api=load(),old=draft().exercises[0];
  assert.deepEqual(plain(api.historyExercise(old)),old);
});
test("propuesta permanente contiene rutina completa y cambia solo el seleccionado",()=>{
  const api=load(),current=routine(),before=JSON.stringify(current);
  const proposal=api.permanentSubstitutionProposal({
    ownerId:OWNER_A,routine:current,baselineHash:"routine-base",sessionId:"A",
    exerciseIndex:0,original:library()[0],replacement:library()[2],reason:"Preferencia",
    generatedAt:T2,compatibility:{compatible:true,blockers:[],warnings:[],unresolvedQuestions:[]}
  });
  assert.equal(proposal.sessions.length,2);
  assert.equal(proposal.sessions[0].exercises[0].exerciseId,"pushup");
  assert.equal(proposal.sessions[0].exercises[1].exerciseId,"row");
  assert.equal(proposal.sessions[1].exercises[0].exerciseId,"pushup");
  assert.equal(JSON.stringify(current),before);
});
test("propuesta no incluye lifecycle, kg ni resultados",()=>{
  const api=load(),proposal=api.permanentSubstitutionProposal({
    ownerId:OWNER_A,routine:routine(),baselineHash:"routine-base",sessionId:"A",
    exerciseIndex:0,original:library()[0],replacement:library()[2],generatedAt:T2,
    compatibility:{compatible:true,blockers:[],warnings:[],unresolvedQuestions:[]}
  });
  const encoded=JSON.stringify(proposal);
  assert.equal("lifecycle" in proposal,false);assert.equal(/"weight"|"done"|"completed"/.test(encoded),false);
});
test("tipo incompatible requiere revisión e impide compatibilidad de activación",()=>{
  const api=load(),timed=exercise("timer","Plancha",{recordTypes:["duration"],movementPattern:"anti_extension_core",primaryMuscles:["core"]});
  const proposal=api.permanentSubstitutionProposal({
    ownerId:OWNER_A,routine:routine(),baselineHash:"routine-base",sessionId:"A",
    exerciseIndex:0,original:library()[0],replacement:timed,generatedAt:T2,
    compatibility:{compatible:true,blockers:[],warnings:[],unresolvedQuestions:[]}
  });
  assert.equal(proposal.reviewRequired,true);assert.equal(proposal.activationCompatibility.compatible,false);
  assert.ok(proposal.validation.results.some(row=>row.code==="record_type_incompatible"));
});
test("contrato permanente es válido para Fase C",()=>{
  const api=load(),proposal=api.permanentSubstitutionProposal({
    ownerId:OWNER_A,routine:routine(),baselineHash:"routine-base",sessionId:"A",
    exerciseIndex:0,original:library()[0],replacement:library()[2],generatedAt:T2,
    compatibility:{compatible:true,blockers:[],warnings:[],unresolvedQuestions:[]}
  });
  const context={console};context.globalThis=context;
  vm.runInNewContext(fs.readFileSync(path.join(root,"profile-data.js"),"utf8"),context);
  vm.runInNewContext(fs.readFileSync(path.join(root,"routine-proposals.js"),"utf8"),context);
  const stored=context.GymOSRoutineProposals.storeProposal([],{
    ownerId:OWNER_A,proposal,currentRoutine:routine(),timestamp:T2
  });
  assert.equal(stored.record.lifecycle.status,"pending_review");
  assert.equal(context.GymOSRoutineProposals.validateRecord(stored.record,OWNER_A).valid,true);
  assert.equal(context.GymOSRoutineProposals.compareRoutineProposal(routine(),proposal).summary.exercisesSubstituted,1);
});
test("fingerprint es idempotente e ignora timestamp y motivo",()=>{
  const api=load(),base={ownerId:OWNER_A,baselineHash:"base",sessionId:"A",exerciseIndex:0,originalExerciseId:"press",replacementExerciseId:"pushup",prescription:{sets:3,target:"8-12"}};
  assert.equal(api.substitutionFingerprint({...base,timestamp:T1,reason:"A"}),api.substitutionFingerprint({...base,timestamp:T2,reason:"B"}));
});
test("fingerprint cambia con owner, baseline, ejercicio, sustituto o prescripción",()=>{
  const api=load(),base={ownerId:OWNER_A,baselineHash:"base",sessionId:"A",exerciseIndex:0,originalExerciseId:"press",replacementExerciseId:"pushup",prescription:{sets:3}};
  const original=api.substitutionFingerprint(base);
  for(const changed of [
    {...base,ownerId:OWNER_B},{...base,baselineHash:"other"},{...base,originalExerciseId:"row"},
    {...base,replacementExerciseId:"row"},{...base,prescription:{sets:4}}
  ]) assert.notEqual(api.substitutionFingerprint(changed),original);
});
test("repetición recupera propuesta existente por fingerprint",()=>{
  const api=load(),proposal=api.permanentSubstitutionProposal({
    ownerId:OWNER_A,routine:routine(),baselineHash:"base",sessionId:"A",
    exerciseIndex:0,original:library()[0],replacement:library()[2],generatedAt:T2,
    compatibility:{compatible:true,blockers:[],warnings:[],unresolvedQuestions:[]}
  });
  const record={ownerId:OWNER_A,proposal,lifecycle:{createdAt:T2}};
  assert.equal(api.findExistingSubstitution([record],OWNER_A,proposal.source.substitutionFingerprint).proposal.proposalId,proposal.proposalId);
  assert.equal(api.findExistingSubstitution([record],OWNER_B,proposal.source.substitutionFingerprint),null);
});
test("baseline cambiado se detecta por hash y ejercicio cambiado bloquea construcción",()=>{
  const api=load(),hashA=api.substitutionFingerprint({ownerId:OWNER_A,baselineHash:"a",sessionId:"A",exerciseIndex:0,originalExerciseId:"press",replacementExerciseId:"pushup",prescription:{sets:3}});
  const hashB=api.substitutionFingerprint({ownerId:OWNER_A,baselineHash:"b",sessionId:"A",exerciseIndex:0,originalExerciseId:"press",replacementExerciseId:"pushup",prescription:{sets:3}});
  assert.notEqual(hashA,hashB);
  assert.throws(()=>api.permanentSubstitutionProposal({
    ownerId:OWNER_A,routine:routine(),baselineHash:"a",sessionId:"A",exerciseIndex:0,
    original:exercise("other","Otro"),replacement:library()[2],generatedAt:T2
  }),/baseline_exercise_changed/);
});
test("módulo puro no accede a DOM, storage, red, timers ni librerías externas",()=>{
  const source=sources.at(-1)[1];
  for(const forbidden of ["document.","localStorage","sessionStorage","fetch(","XMLHttpRequest","setTimeout","setInterval","alert(","confirm(","FileReader","XLSX"]){
    assert.equal(source.includes(forbidden),false,forbidden);
  }
});
test("integración declara script una vez, orden correcto y caché phase-g",()=>{
  const io=indexSource.indexOf('src="routine-io.js"');
  const libraryIndex=indexSource.indexOf('src="exercise-library-workflow.js"');
  const workflow=indexSource.indexOf('src="routine-workflow-ui.js"');
  assert.ok(io>=0&&libraryIndex>io&&workflow>libraryIndex);
  assert.equal((indexSource.match(/exercise-library-workflow\.js/g)||[]).length,1);
  assert.equal((workerSource.match(/exercise-library-workflow\.js/g)||[]).length,1);
  assert.match(workerSource,/phase-g/);
});
test("interfaz no usa onclick inline ni muestra JSON técnico en biblioteca",()=>{
  const start=appSource.lastIndexOf("function renderExerciseLibrary()");
  const end=appSource.indexOf("function exerciseReferenceSources()",start);
  const section=appSource.slice(start,end);
  assert.doesNotMatch(section,/<[^>]+\sonclick\s*=/i);
  assert.equal(section.includes("JSON.stringify"),false);
});
test("abrir modelos no modifica almacenamiento funcional simulado",()=>{
  const api=load(),storage={routine:JSON.stringify(routine()),history:"[]",library:JSON.stringify(library())},before=JSON.stringify(storage);
  api.filterExercises(library(),{});api.cardModel(library()[0],context());api.detailModel(library()[0],context());
  assert.equal(JSON.stringify(storage),before);
});
test("filtro por dificultad",()=>{
  const api=load(),items=library();items[1].difficulty="advanced";
  assert.deepEqual(api.filterExercises(items,{difficulty:"advanced"}).map(item=>item.id),["row"]);
});
test("filtro needs_review",()=>{
  const api=load(),items=library();items[2].migrationStatus="needs_review";
  assert.deepEqual(api.filterExercises(items,{status:"needs_review"}).map(item=>item.id),["pushup"]);
});
test("opciones de filtro son únicas y deterministas",()=>{
  const api=load(),options=api.filterOptions([...library(),library()[0]]);
  assert.equal(new Set(options.patterns).size,options.patterns.length);
  assert.deepEqual(plain(options.patterns),[...options.patterns].sort((a,b)=>api.label(a).localeCompare(api.label(b),"es")));
});
test("orden favoritos primero conserva desempate por nombre",()=>{
  const ids=load().filterExercises(library(),{sort:"favorites"}).map(item=>item.id);
  assert.equal(ids[0],"press");
  assert.deepEqual(ids.slice(1),[...ids.slice(1)].sort((a,b)=>{
    const items=library();return items.find(x=>x.id===a).name.localeCompare(items.find(x=>x.id===b).name,"es",{sensitivity:"base"});
  }));
});
test("orden más usados no inventa uso ausente",()=>{
  const api=load(),items=library();
  const alphabetical=api.filterExercises(items,{sort:"name"}).map(item=>item.id);
  assert.deepEqual(api.filterExercises(items,{sort:"used"},{usage:{}}).map(item=>item.id),alphabetical);
});
test("orden recientemente añadido usa createdAt",()=>{
  const ids=load().filterExercises(library(),{sort:"recent"}).map(item=>item.id);
  assert.equal(ids[0],"pushup");
});
test("normalización de filtros descarta valores inválidos",()=>{
  const filters=load().normalizeFilters({category:"TODOS",status:"bad",sort:"bad"});
  assert.equal(filters.category,"all");assert.equal(filters.status,"all");assert.equal(filters.sort,"name");
});
test("detalle incluye instrucciones, prescripción y alternativas",()=>{
  const api=load(),item=exercise("x","X",{alternatives:["press"],instructions:{short:"Breve",setup:["A"],execution:["B"],breathing:"C",stopIf:["D"]}});
  const detail=api.detailModel(item,context());
  assert.equal(detail.instructions.short,"Breve");assert.equal(detail.prescription.sets,3);
  assert.deepEqual(plain(detail.alternatives),["press"]);
});
test("favorito no modifica updatedAt",()=>{
  const item=exercise("x","X"),updated=load().favoriteUpdate(item,true).exercise;
  assert.equal(updated.updatedAt,item.updatedAt);
});
test("nombre demasiado largo bloquea personalizado",()=>{
  assert.ok(load().validateCustomExercise(customInput({name:"x".repeat(161)})).errors.includes("exercise_name_too_long"));
});
test("metadatos fuera de 1–5 bloquean personalizado",()=>{
  assert.ok(load().validateCustomExercise(customInput({technicalComplexity:6})).errors.includes("metadata_out_of_range"));
});
test("estructura circular bloquea personalizado",()=>{
  const api=load(),input=customInput();input.instructions.self=input.instructions;
  assert.ok(api.validateCustomExercise(input).errors.includes("exercise_not_serializable"));
});
test("edición estructural actualiza timestamp una sola vez",()=>{
  const api=load(),first=api.buildCustomExercise(customInput(),{ownerId:OWNER_A,library:library(),timestamp:T1,idSeed:"x"}).exercise;
  const changed=api.buildCustomExercise(customInput({notes:"nuevo"}),{ownerId:OWNER_A,library:[...library(),first],existing:first,timestamp:T2}).exercise;
  const repeated=api.buildCustomExercise(customInput({notes:"nuevo"}),{ownerId:OWNER_A,library:[...library(),changed],existing:changed,timestamp:"2026-07-29T10:00:00.000Z"});
  assert.equal(repeated.changed,false);assert.equal(repeated.exercise.updatedAt,T2);
});
test("ID personalizado no contiene datos del propietario",()=>{
  const id=load().customExerciseId({ownerId:OWNER_A,name:"Mi ejercicio",idSeed:"seed",library:[]});
  assert.equal(id.includes(OWNER_A),false);
});
test("colisión de semilla se resuelve sin sobrescribir",()=>{
  const api=load(),id=api.customExerciseId({ownerId:OWNER_A,name:"X",idSeed:"seed",library:[]});
  const next=api.customExerciseId({ownerId:OWNER_A,name:"X",idSeed:"seed",library:[{id}]});
  assert.notEqual(next,id);
});
test("referencia histórica por nombre legado impide eliminación",()=>{
  const api=load(),custom=exercise("custom-x","Nombre legado",{custom:true,source:"custom"});
  const refs=api.referenceSummary(custom.id,{history:[{exercises:[{name:"Nombre legado"}]}],library:[custom]});
  assert.equal(refs.counts.history,1);assert.equal(api.removalPolicy(custom,refs).action,"archive");
});
test("archivado queda excluido de candidatos aunque sea alternativa explícita",()=>{
  const api=load(),original=exercise("o","O",{alternatives:["a"]}),archived=exercise("a","A",{archived:true});
  const ranked=api.evaluateAlternatives(original,[archived],context());
  assert.equal(ranked.available.length,0);assert.ok(ranked.unavailable[0].blocked.includes("archived"));
});
test("needs_review queda excluido aunque sea favorito",()=>{
  const api=load(),original=exercise("o","O"),review=exercise("r","R",{migrationStatus:"needs_review",favorite:true});
  assert.equal(api.evaluateAlternatives(original,[review],context()).available.length,0);
});
test("personalizado de otro propietario queda bloqueado",()=>{
  const api=load(),original=exercise("o","O"),foreign=exercise("f","F",{custom:true,source:"custom",ownerId:OWNER_B});
  const result=api.evaluateAlternatives(original,[foreign],context({ownerId:OWNER_A}));
  assert.ok(result.unavailable[0].blocked.includes("owner_mismatch"));
});
test("estado vital embarazo no usa fallback inseguro",()=>{
  const api=load(),original=exercise("o","O"),candidate=exercise("c","C",{pregnancy:{eligibleForConsideration:false,stageTags:[],prohibitedByProduct:false,balanceRisk:"unknown",fallRisk:"unknown",impactLevel:"unknown"}});
  const result=api.evaluateAlternatives(original,[candidate],context({currentLifeState:{type:"pregnancy"}}));
  assert.equal(result.available.length,0);assert.ok(result.unavailable[0].blocked.some(code=>code.includes("pregnancy")));
});
test("ejercicio original nunca aparece como alternativa",()=>{
  const api=load(),original=exercise("same","Mismo");
  assert.equal(api.evaluateAlternatives(original,[original],context()).available.length,0);
});
test("candidato sin relación no aparece ni siquiera bloqueado",()=>{
  const api=load(),original=exercise("o","O"),other=exercise("x","X",{movementPattern:"loaded_carry",primaryMuscles:["calves"],substitutionGroups:["carry"],recordTypes:["distance_time"]});
  const result=api.evaluateAlternatives(original,[other],context());
  assert.equal(result.available.length+result.unavailable.length,0);
});
test("sustitución temporal no altera el draft original",()=>{
  const api=load(),source=draft(),before=JSON.stringify(source);
  api.temporarySubstitution({draft:source,session:"A",exerciseIndex:0,original:library()[0],replacement:library()[2],timestamp:T2});
  assert.equal(JSON.stringify(source),before);
});
test("sustitución temporal valida sesión",()=>{
  const result=load().temporarySubstitution({draft:draft(),session:"B",exerciseIndex:0,original:library()[0],replacement:library()[2],timestamp:T2});
  assert.equal(result.code,"draft_changed");
});
test("sustitución temporal valida índice",()=>{
  const result=load().temporarySubstitution({draft:draft(),session:"A",exerciseIndex:99,original:library()[0],replacement:library()[2],timestamp:T2});
  assert.equal(result.code,"exercise_not_found");
});
test("deshacer no altera draft original",()=>{
  const api=load(),changed=api.temporarySubstitution({draft:draft(),session:"A",exerciseIndex:0,original:library()[0],replacement:library()[2],timestamp:T2}).draft;
  const before=JSON.stringify(changed);api.undoTemporarySubstitution({draft:changed,session:"A",exerciseIndex:0});
  assert.equal(JSON.stringify(changed),before);
});
test("snapshot temporal conserva la prescripción planificada",()=>{
  const api=load(),result=api.temporarySubstitution({draft:draft(),session:"A",exerciseIndex:0,original:library()[0],replacement:library()[2],timestamp:T2});
  assert.equal(result.exercise.substitution.prescription.target,"8-12");
  assert.equal(result.exercise.substitution.plannedSnapshot.sets,3);
});
test("historial temporal conserva motivo",()=>{
  const api=load(),changed=api.temporarySubstitution({draft:draft(),session:"A",exerciseIndex:0,original:library()[0],replacement:library()[2],reason:"Dolor",timestamp:T2});
  assert.equal(api.historyExercise(changed.exercise).substitution.reason,"Dolor");
});
test("propuesta permanente conserva prescripción compatible",()=>{
  const proposal=load().permanentSubstitutionProposal({
    ownerId:OWNER_A,routine:routine(),baselineHash:"base",sessionId:"A",exerciseIndex:0,
    original:library()[0],replacement:library()[2],generatedAt:T2,
    compatibility:{compatible:true,blockers:[],warnings:[],unresolvedQuestions:[]}
  });
  assert.equal(proposal.sessions[0].exercises[0].prescription.sets,3);
  assert.equal(proposal.sessions[0].exercises[0].prescription.target,"8-12");
});
test("propuesta usa metadatos autoritativos del reemplazo",()=>{
  const replacement=library()[2],proposal=load().permanentSubstitutionProposal({
    ownerId:OWNER_A,routine:routine(),baselineHash:"base",sessionId:"A",exerciseIndex:0,
    original:library()[0],replacement,generatedAt:T2,
    compatibility:{compatible:true,blockers:[],warnings:[],unresolvedQuestions:[]}
  }),selected=proposal.sessions[0].exercises[0];
  assert.equal(selected.name,replacement.name);assert.equal(selected.pattern,replacement.movementPattern);
  assert.deepEqual(plain(selected.requiredEquipment),replacement.requiredEquipment);
});
test("propuesta incluye source sin motivo libre",()=>{
  const proposal=load().permanentSubstitutionProposal({
    ownerId:OWNER_A,routine:routine(),baselineHash:"base",sessionId:"A",exerciseIndex:0,
    original:library()[0],replacement:library()[2],reason:"Privado",generatedAt:T2,
    compatibility:{compatible:true,blockers:[],warnings:[],unresolvedQuestions:[]}
  });
  assert.equal("reason" in proposal.source,false);assert.equal(proposal.source.type,"exercise_substitution");
});
test("propuesta no modifica sesiones no seleccionadas",()=>{
  const api=load(),source=routine(),proposal=api.permanentSubstitutionProposal({
    ownerId:OWNER_A,routine:source,baselineHash:"base",sessionId:"A",exerciseIndex:0,
    original:library()[0],replacement:library()[2],generatedAt:T2,
    compatibility:{compatible:true,blockers:[],warnings:[],unresolvedQuestions:[]}
  });
  const modelB=proposal.sessions.find(session=>session.id==="B");
  assert.equal(modelB.exercises[0].name,source.B[0].name);
});
test("propuesta compatible llega a createActivationPlan",()=>{
  const ctx=loadContext(),api=ctx.GymOSExerciseLibraryWorkflow,current=routine();
  const proposal=api.permanentSubstitutionProposal({
    ownerId:OWNER_A,routine:current,baselineHash:ctx.GymOSRoutineProposals.routineHash(current),
    sessionId:"A",exerciseIndex:0,original:library()[0],replacement:library()[2],generatedAt:T2,
    compatibility:{compatible:true,blockers:[],warnings:[],unresolvedQuestions:[]}
  });
  const record=ctx.GymOSRoutineProposals.createProposalRecord({ownerId:OWNER_A,proposal,currentRoutine:current,timestamp:T2});
  const result=ctx.GymOSRoutineActivation.createActivationPlan({
    ownerId:OWNER_A,proposalRecord:record,currentRoutine:current,selectedSession:"A",
    drafts:{A:null,B:null,C:null},rawBaseline:{routine:JSON.stringify(current),selectedSession:"A",drafts:{A:null,B:null,C:null}},
    confirmed:true,timestamp:T2
  });
  assert.equal(result.ok,true,JSON.stringify(plain(result)));assert.equal(result.routine.A[0].name,"Flexiones");
});
test("crear propuesta no activa ni escribe rutina por sí mismo",()=>{
  const api=load(),source=routine(),before=JSON.stringify(source);
  api.permanentSubstitutionProposal({
    ownerId:OWNER_A,routine:source,baselineHash:"base",sessionId:"A",exerciseIndex:0,
    original:library()[0],replacement:library()[2],generatedAt:T2,
    compatibility:{compatible:true,blockers:[],warnings:[],unresolvedQuestions:[]}
  });
  assert.equal(JSON.stringify(source),before);
});
test("cambio de propietario no recupera propuesta ajena",()=>{
  const api=load(),fingerprint="routine-x",record={ownerId:OWNER_B,proposal:{source:{substitutionFingerprint:fingerprint}},lifecycle:{createdAt:T2}};
  assert.equal(api.findExistingSubstitution([record],OWNER_A,fingerprint),null);
});
test("el módulo no contiene reglas duplicadas de lesiones o dosificación",()=>{
  const source=sources.at(-1)[1];
  for(const token of ["PROGRAMMING_RULES","RESTRICTION_RULES","mainSets","accessorySets"]) assert.equal(source.includes(token),false);
});
test("UI limita alternativas iniciales a diez",()=>{
  assert.match(appSource,/alternatives\.available\.slice\(0,10\)/);
  assert.match(appSource,/Ver más alternativas/);
});
test("UI usa disabled real y aria-live",()=>{
  const start=appSource.indexOf("function renderExerciseSubstitution()");
  const section=appSource.slice(start,appSource.indexOf("async function applyExerciseLibrarySubstitution",start));
  assert.match(section,/disabled/);assert.match(section,/aria-live/);
});
test("UI escapa nombres, razones y advertencias",()=>{
  const start=appSource.indexOf("function renderAlternativeCard");
  const section=appSource.slice(start,appSource.indexOf("function renderExerciseSubstitution",start));
  assert.match(section,/esc\(exercise\.name\)/);assert.match(section,/esc\(row\.reasons/);assert.match(section,/esc\(row\.warnings/);
});
test("flujo permanente no llama saveRoutine",()=>{
  const start=appSource.indexOf("async function applyExerciseLibrarySubstitution");
  const section=appSource.slice(start,appSource.indexOf("async function undoCurrentExerciseSubstitution",start));
  assert.equal(section.includes("saveRoutine("),false);
  assert.match(section,/persistRoutineProposal\(/);
});
test("flujo temporal usa draft existente sin clave nueva",()=>{
  const start=appSource.indexOf("async function applyExerciseLibrarySubstitution");
  const section=appSource.slice(start,appSource.indexOf("async function undoCurrentExerciseSubstitution",start));
  assert.match(section,/getDraft\(/);assert.match(section,/saveDraft\(/);
  assert.equal(section.includes("localStorage.setItem"),false);
});
test("auditoría G no oculta el controlador histórico de sustituciones",()=>{
  assert.equal([...appSource.matchAll(/function applyExerciseSubstitution\(/g)].length,1);
  assert.equal([...appSource.matchAll(/function applyExerciseLibrarySubstitution\(/g)].length,1);
  assert.match(appSource,/applyExerciseSubstitution\(session,index,replacement,reason\)/);
  assert.match(appSource,/applyExerciseLibrarySubstitution\(\)/);
});
test("auditoría G detecta referencias en source de propuesta y snapshots de rollback",()=>{
  const api=load(),id="custom-ref",custom=exercise(id,"Personalizado",{
    source:"custom",custom:true,ownerId:OWNER_A
  });
  const proposal={sessions:[],source:{type:"exercise_substitution",originalExerciseId:id}};
  const storedDraft=JSON.stringify({session:"A",exercises:[{exerciseId:id,name:"Personalizado"}]});
  const result=api.referenceSummary(id,{
    library:[custom],
    proposals:[{proposal}],
    activations:[{baseline:{draftsRaw:{A:storedDraft},proposal},activated:{routine:{A:[]}}}]
  });
  assert.equal(result.counts.proposals,1);
  assert.equal(result.counts.activations,2);
  assert.equal(api.removalPolicy(custom,result).action,"archive");
});
test("auditoría G detecta cualquier resultado real antes de sustituir o deshacer",()=>{
  const api=load();
  for(const started of [
    {series:[{rir:2}]},
    {series:[],status:"completed"},
    {series:[],done:true},
    {series:[],results:{partialReps:3}}
  ]) assert.equal(api.hasExerciseResults(started),true);
  assert.equal(api.hasExerciseResults({series:[{weight:"",reps:"",rir:"",done:false}]}),false);
});
test("auditoría G usa writer owner-scoped y favorito no toca updatedAt",()=>{
  const start=appSource.indexOf("function setExerciseFavorite");
  const section=appSource.slice(start,appSource.indexOf("function favoriteExerciseUsage",start));
  assert.match(section,/saveExerciseLibrary\(library,\{touchUpdatedAt:false,ownerId\}\)/);
  const writer=appSource.slice(
    appSource.indexOf("function saveExerciseLibrary"),
    appSource.indexOf("function ensureExerciseLibraryWorkflowMigration")
  );
  assert.match(writer,/exercise_library_owner_changed/);
  assert.match(writer,/exercise_library_owner_mismatch/);
});
test("auditoría G genera la semilla del ID solo con criptografía del navegador",()=>{
  const start=appSource.indexOf("function createExerciseIdentitySeed");
  const section=appSource.slice(start,appSource.indexOf("async function saveLibraryExerciseForm",start));
  assert.match(section,/randomUUID/);
  assert.match(section,/getRandomValues/);
  assert.doesNotMatch(section,/Math\.random/);
  assert.match(appSource,/const seed=createExerciseIdentitySeed\(\)/);
});
test("auditoría G libera busy en finally y escapa datos personalizados en runtime e historial",()=>{
  const start=appSource.indexOf("async function applyExerciseLibrarySubstitution");
  const section=appSource.slice(start,appSource.indexOf("async function undoCurrentExerciseSubstitution",start));
  assert.match(section,/finally\{[\s\S]*flow\.busy=null/);
  assert.match(appSource,/<h2>\$\{esc\(ex\.name\)\}<\/h2>/);
  assert.match(appSource,/<strong>\$\{esc\(e\.name\)\}<\/strong>/);
  assert.match(appSource,/\$\{e\.notes\?`<small>\$\{esc\(e\.notes\)\}<\/small>`:""\}/);
});
test("14bis escribir jalon encuentra Jalón sin pulsar Enter",()=>{
  const api=load(),items=[exercise("pulldown","Jalón al pecho",{aliases:["Jalon dorsal"]})];
  assert.deepEqual(api.filterExercises(items,{query:"jalon"}).map(item=>item.id),["pulldown"]);
});
test("14bis el buscador escucha input y usa debounce de 200 ms",()=>{
  const start=appSource.lastIndexOf("function renderExerciseLibrary()");
  const section=appSource.slice(start,appSource.indexOf("function exerciseReferenceSources()",start));
  assert.match(section,/search\.oninput=/);
  assert.match(appSource,/setTimeout\(\(\)=>\{[\s\S]*?\},200\)/);
  assert.doesNotMatch(section,/query\.length\s*[<>]=?/);
});
test("14bis actualización automática conserva filtros y ordenación",()=>{
  const api=load(),filters=api.normalizeFilters({pattern:"horizontal_pull",sort:"favorites",query:""});
  const typing=api.normalizeFilters({...filters,query:"remo"});
  assert.equal(typing.pattern,"horizontal pull");
  assert.equal(typing.sort,"favorites");
  assert.deepEqual(api.filterExercises(library(),typing).map(item=>item.id),["custom-remo-1","row"]);
});
test("14bis Enter cancela debounce y actualiza inmediatamente",()=>{
  const start=appSource.lastIndexOf("function renderExerciseLibrary()");
  const section=appSource.slice(start,appSource.indexOf("function exerciseReferenceSources()",start));
  assert.match(section,/search\.onkeydown=event=>\{/);
  assert.match(section,/event\.key!=="Enter"/);
  const enter=section.slice(section.indexOf("search.onkeydown"),section.indexOf('document.getElementById("backExerciseLibrary"'));
  assert.ok(enter.indexOf("cancelExerciseLibrarySearchDebounce()")<enter.indexOf("renderExerciseLibrary()"));
  assert.match(enter,/event\.preventDefault\(\)/);
});
test("14bis limpiar conserva los demás filtros y restaura resultados",()=>{
  const api=load(),active=api.normalizeFilters({query:"remo",pattern:"horizontal_pull",sort:"favorites"});
  const cleared=api.normalizeFilters({...active,query:""});
  assert.equal(cleared.pattern,active.pattern);assert.equal(cleared.sort,active.sort);
  assert.equal(api.filterExercises(library(),cleared).length,2);
  const start=appSource.lastIndexOf("function renderExerciseLibrary()");
  const section=appSource.slice(start,appSource.indexOf("function exerciseReferenceSources()",start));
  assert.match(section,/aria-label="Limpiar búsqueda"/);
  assert.match(section,/filters\.query\?/);
});
test("14bis buscar no modifica biblioteca, rutina, historial ni almacenamiento",()=>{
  const api=load(),items=library(),activeRoutine=routine(),history=[{id:1}],storage={key:"value"};
  const before=JSON.stringify({items,activeRoutine,history,storage});
  api.filterExercises(items,{query:"jalon",pattern:"horizontal_pull",sort:"favorites"});
  assert.equal(JSON.stringify({items,activeRoutine,history,storage}),before);
  const start=appSource.indexOf("function scheduleExerciseLibrarySearchUpdate");
  const end=appSource.indexOf("function exerciseReferenceSources()",start);
  const section=appSource.slice(start,end);
  assert.doesNotMatch(section,/saveExerciseLibrary\(|saveRoutine\(|saveHistory\(|markLocalUpdated\(|scheduleAutoSync\(|localStorage\.(setItem|removeItem)/);
});
test("14bis renderizar varias veces no duplica ejecuciones",()=>{
  const harness=searchDebounceHarness();
  harness.api.scheduleExerciseLibrarySearchUpdate(OWNER_A);
  harness.api.scheduleExerciseLibrarySearchUpdate(OWNER_A);
  assert.equal(harness.pending.size,1);
  [...harness.pending.values()][0].callback();
  assert.equal(harness.renderCount(),1);
});
test("14bis cambio de propietario invalida debounce pendiente",()=>{
  const harness=searchDebounceHarness();
  harness.api.scheduleExerciseLibrarySearchUpdate(OWNER_A);
  const callback=[...harness.pending.values()][0].callback;
  harness.setOwner(OWNER_B);callback();
  assert.equal(harness.renderCount(),0);
  const reset=appSource.slice(appSource.indexOf("function resetExerciseLibraryOwnerState"),appSource.indexOf("function activateLocalUser"));
  assert.match(reset,/cancelExerciseLibrarySearchDebounce\(\)/);
});
test("14bis abandonar pantalla cancela temporizador pendiente",()=>{
  const harness=searchDebounceHarness();
  harness.api.scheduleExerciseLibrarySearchUpdate(OWNER_A);
  harness.api.cancelExerciseLibrarySearchDebounce();
  assert.equal(harness.pending.size,0);
  const navigation=appSource.slice(appSource.indexOf("function navigateToScreen"),appSource.indexOf("function bindNav"));
  assert.match(navigation,/screen!=="exerciseLibrary"\) cancelExerciseLibrarySearchDebounce\(\)/);
});
test("14bis no existe submit, botón Buscar ni recarga",()=>{
  const start=appSource.lastIndexOf("function renderExerciseLibrary()");
  const section=appSource.slice(start,appSource.indexOf("function exerciseReferenceSources()",start));
  assert.doesNotMatch(section,/<form|type="submit"|\.submit\(|location\.reload|>Buscar</);
  assert.match(section,/type="search"/);
});
