"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const root=path.resolve(__dirname,"..");
const moduleSource=fs.readFileSync(path.join(root,"active-workout.js"),"utf8");
const catalogSource=fs.readFileSync(path.join(root,"built-in-exercise-catalog.js"),"utf8");
const domainSource=fs.readFileSync(path.join(root,"exercise-domain.js"),"utf8");
const appSource=fs.readFileSync(path.join(root,"app.js"),"utf8");
const stylesSource=fs.readFileSync(path.join(root,"styles.css"),"utf8");
const indexSource=fs.readFileSync(path.join(root,"index.html"),"utf8");
const workerSource=fs.readFileSync(path.join(root,"service-worker.js"),"utf8");

function between(source,start,end){
  const from=source.indexOf(start);
  const to=source.indexOf(end,from+start.length);
  assert.ok(from>=0,`No se encontró ${start}`);
  assert.ok(to>from,`No se encontró ${end}`);
  return source.slice(from,to);
}

const renderSource=between(appSource,"function renderWorkout()","function activeWorkoutIdentityValid(");
const workoutUiSource=between(appSource,"function renderActiveWorkoutGuide(","function activeWorkoutIdentityValid(");
const bindingSource=between(appSource,"function bindActiveWorkoutEvents(","function renderLegacyWorkout(");
const sessionTimerSource=between(appSource,"function stopWorkoutSessionTimer()","function activeWorkoutExerciseKey(");
const finishSource=between(appSource,"function finishWorkout()","function showRecordsCelebration(");
const substitutionSource=between(appSource,"function openExerciseSubstitution(","function substitutionAlternatives(");

function loadApi(){
  const context={console};
  context.globalThis=context;
  context.window=context;
  vm.createContext(context);
  vm.runInContext(moduleSource,context,{filename:"active-workout.js"});
  return context.GymOSActiveWorkout;
}

function plain(value){return JSON.parse(JSON.stringify(value));}
function deepFreeze(value){
  if(value&&typeof value==="object"&&!Object.isFrozen(value)){
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}
const normalize=value=>String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
const libraryExercise=(overrides={})=>({
  id:"press-maquina",
  name:"Press de hombro en máquina",
  aliases:["Press máquina"],
  movementPattern:"vertical_push",
  primaryMuscles:["deltoides_anterior","deltoides_medio"],
  secondaryMuscles:["triceps","deltoides_medio"],
  requiredEquipment:["machine"],
  imageAsset:"assets/exercises/press-maquina.webp",
  instructions:{
    short:"Mantén el tronco estable.",
    setup:["Ajusta el asiento."],
    execution:["Empuja sin perder el apoyo."],
    breathing:"Expulsa el aire al empujar.",
    stopIf:["Detén la serie si aparece dolor."]
  },
  ...overrides
});

function integratedLibrary(){
  const context={console};context.window=context;context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(catalogSource,context,{filename:"built-in-exercise-catalog.js"});
  vm.runInContext(domainSource,context,{filename:"exercise-domain.js"});
  return plain(context.GymOSExerciseDomain.migrateExerciseLibrary(
    context.GymOSBuiltInExerciseCatalog.get()
  ).library);
}

test("entrenamiento activo: el módulo expone modelos puros sin dependencias de entorno",()=>{
  const api=loadApi();
  for(const name of [
    "activeWorkoutHeaderModel","sessionElapsedModel","exerciseGuideModel",
    "exerciseMuscleModel","exerciseTechniqueModel","exerciseLibraryResolutionModel",
    "googleExerciseReferenceModel","exerciseRecordType",
    "setEntryModel","sessionTimerControlModel","restTimerModel",
    "shouldStartRestTimerAfterSetCompletion",
    "workoutCompletionReviewModel","exerciseDetailDisclosureModel",
    "mobileWorkoutViewModel","reduceMobileWorkoutUi"
  ]) assert.equal(typeof api[name],"function",name);
  assert.doesNotMatch(moduleSource,/localStorage|document\.|supabase|setInterval|setTimeout|saveRoutine|saveHistory/);
});

test("cabecera: deriva Ejercicio X de N y progreso sin asumir seis ejercicios",()=>{
  const api=loadApi();
  for(let total=2;total<=6;total++){
    const model=api.activeWorkoutHeaderModel({
      session:{sessionId:"session-real",name:"Torso",focus:"Empuje"},
      exerciseIndex:total-1,totalExercises:total,
      startedAt:"2026-07-29T10:00:00.000Z",now:"2026-07-29T10:10:00.000Z"
    });
    assert.equal(model.sessionId,"session-real");
    assert.equal(model.exerciseNumber,total);
    assert.equal(model.totalExercises,total);
    assert.equal(model.progressPercentage,100);
  }
});

test("tiempo de sesión: un draft sin startedAt no recibe una hora inventada",()=>{
  const model=loadApi().sessionElapsedModel({
    startedAt:null,now:"2026-07-29T10:00:00.000Z"
  });
  assert.deepEqual(plain(model),{available:false,startedAt:null,elapsedMs:0,anomalous:false});
});

test("tiempo de sesión: avanza desde timestamps explícitos y conserva milisegundos",()=>{
  const model=loadApi().sessionElapsedModel({
    startedAt:"2026-07-29T10:00:00.000Z",now:"2026-07-29T10:18:42.000Z"
  });
  assert.equal(model.elapsedMs,1122000);
  assert.equal(model.available,true);
});

test("tiempo de sesión: admite una hora o más y detecta borradores anormalmente antiguos",()=>{
  const api=loadApi();
  assert.equal(api.sessionElapsedModel({
    startedAt:"2026-07-29T10:00:00.000Z",now:"2026-07-29T11:18:42.000Z"
  }).elapsedMs,4722000);
  assert.equal(api.sessionElapsedModel({
    startedAt:"2026-07-20T10:00:00.000Z",now:"2026-07-29T10:00:00.000Z"
  }).anomalous,true);
});

test("tiempo de sesión: recargar o cambiar de ejercicio produce el mismo valor para el mismo timestamp",()=>{
  const api=loadApi();
  const input={startedAt:"2026-07-29T10:00:00.000Z",now:"2026-07-29T10:30:00.000Z"};
  assert.deepEqual(plain(api.sessionElapsedModel(input)),plain(api.sessionElapsedModel(input)));
});

test("resolución: usa un ID inequívoco y devuelve una copia de la ficha",()=>{
  const api=loadApi();
  const item=libraryExercise();
  const result=api.exerciseLibraryResolutionModel({
    exercise:{exerciseId:item.id,name:"Nombre legacy"},library:[item],normalize
  });
  assert.equal(result.status,"exact");
  assert.equal(result.exercise.id,item.id);
  assert.notEqual(result.exercise,item);
});

test("resolución: encuentra un alias ignorando mayúsculas y tildes",()=>{
  const result=loadApi().exerciseLibraryResolutionModel({
    exercise:{name:"PRESS MAQUINA"},library:[libraryExercise()],normalize
  });
  assert.equal(result.status,"unique_name");
  assert.equal(result.exercise.id,"press-maquina");
});

test("resolución: una coincidencia ambigua o un ID duplicado nunca se selecciona automáticamente",()=>{
  const api=loadApi();
  const first=libraryExercise({id:"duplicado",name:"Press A"});
  const second=libraryExercise({id:"duplicado",name:"Press B"});
  const duplicate=api.exerciseLibraryResolutionModel({
    exercise:{exerciseId:"duplicado"},library:[first,second],normalize
  });
  assert.equal(duplicate.status,"ambiguous");
  assert.equal(duplicate.exercise,null);
  assert.equal(duplicate.candidates.length,2);
  const names=api.exerciseLibraryResolutionModel({
    exercise:{name:"Press",movementPattern:"vertical_push"},
    library:[
      libraryExercise({id:"a",name:"Press",aliases:[]}),
      libraryExercise({id:"b",name:"Press",aliases:[]})
    ],normalize
  });
  assert.equal(names.status,"ambiguous");
  assert.equal(names.exercise,null);
});

test("resolución: una selección visual inequívoca requiere un ID confirmado",()=>{
  const result=loadApi().exerciseLibraryResolutionModel({
    exercise:{name:"Legacy"},library:[libraryExercise()],
    selectedExerciseId:"press-maquina",normalize
  });
  assert.equal(result.status,"visual_selection");
  assert.equal(result.exercise.id,"press-maquina");
});

test("referencia Google usa nombre canónico codificado y fallback visible seguro",()=>{
  const api=loadApi();
  const canonical=api.googleExerciseReferenceModel({
    exercise:{id:"bench-press",name:"Nombre visible"},
    libraryExercise:{id:"bench-press",name:"Press banca / máquina"}
  });
  assert.equal(canonical.name,"Press banca / máquina");
  assert.equal(canonical.canonical,true);
  assert.equal(
    canonical.url,
    `https://www.google.com/search?q=${encodeURIComponent("Press banca / máquina")}`
  );
  assert.doesNotMatch(canonical.url,/bench-press/);
  const fallback=api.googleExerciseReferenceModel({
    exercise:{id:"technical-id",name:"Plancha & respiración"}
  });
  assert.equal(fallback.canonical,false);
  assert.equal(
    fallback.url,
    `https://www.google.com/search?q=${encodeURIComponent("Plancha & respiración")}`
  );
});

test("tipo de registro reconoce duración canónica y variantes normalizadas",()=>{
  const api=loadApi();
  assert.equal(api.exerciseRecordType({recordType:"duration"}),"duration");
  assert.equal(api.exerciseRecordType({recordTypes:["duration"]}),"duration");
  assert.equal(api.exerciseRecordType({target:{type:"duración"}}),"duration");
  assert.equal(api.exerciseRecordType({prescription:{target:{type:"tiempo"}}}),"duration");
  assert.equal(api.exerciseRecordType({recordType:"weight_reps"}),"weight_reps");
});

test("resolución integrada prioriza ID directo nombre oficial y alias exacto",()=>{
  const api=loadApi(),library=integratedLibrary();
  const direct=api.exerciseLibraryResolutionModel({
    exercise:{exerciseId:"bench-press",name:"Press banca / máquina pecho"},library,normalize
  });
  assert.equal(direct.status,"exact");
  assert.equal(direct.exercise.id,"bench-press");
  const official=api.exerciseLibraryResolutionModel({
    exercise:{name:"Press de banca"},library,normalize
  });
  assert.equal(official.status,"unique_name");
  assert.equal(official.exercise.id,"bench-press");
  const alias=api.exerciseLibraryResolutionModel({
    exercise:{name:"Tríceps polea"},library,normalize
  });
  assert.equal(alias.status,"unique_name");
  assert.equal(alias.exercise.id,"triceps-pushdown");
});

test("resolución legacy inequívoca usa un ID existente sin generar otro",()=>{
  const library=integratedLibrary();
  const before=JSON.stringify(library);
  const result=loadApi().exerciseLibraryResolutionModel({
    exercise:{name:"Remo sentado"},library,normalize
  });
  assert.equal(result.status,"legacy_exact");
  assert.equal(result.exercise.id,"seated-cable-row");
  assert.equal(JSON.stringify(library),before);
});

test("resolución legacy no oculta un ID duplicado",()=>{
  const item=integratedLibrary().find(exercise=>exercise.id==="seated-cable-row");
  const result=loadApi().exerciseLibraryResolutionModel({
    exercise:{name:"Remo sentado"},library:[item,{...item,name:"Copia corrupta"}],normalize
  });
  assert.equal(result.status,"legacy_ambiguous");
  assert.equal(result.exercise,null);
  assert.equal(result.candidates.length,2);
});

test("resolución legacy compuesta devuelve candidatos explícitos",()=>{
  const result=loadApi().exerciseLibraryResolutionModel({
    exercise:{name:"Press hombro máquina/mancuernas"},library:integratedLibrary(),normalize
  });
  assert.equal(result.status,"legacy_ambiguous");
  assert.equal(result.exercise,null);
  assert.deepEqual(plain(result.candidates.map(item=>item.id)),[
    "machine-shoulder-press","db-shoulder-press"
  ]);
});

test("nombre legacy sin equivalencia segura ni candidatos queda pendiente",()=>{
  const result=loadApi().exerciseLibraryResolutionModel({
    exercise:{name:"Movimiento heredado sin equivalencia"},library:integratedLibrary(),normalize
  });
  assert.equal(result.status,"missing");
  assert.equal(result.exercise,null);
  assert.deepEqual(plain(result.candidates),[]);
});

test("los 18 nombres legacy quedan 12 resueltos 6 ambiguos y ninguno sin candidato",()=>{
  const names=[
    "Press banca / máquina pecho","Remo sentado","Prensa","Elevaciones laterales",
    "Curl bíceps","Plancha","Peso muerto rumano","Jalón al pecho",
    "Press hombro máquina/mancuernas","Zancadas / split squat","Tríceps polea",
    "Abdominales","Sentadilla goblet / hack / prensa","Press inclinado mancuernas",
    "Remo pecho apoyado","Curl femoral","Face pull","Gemelo"
  ];
  const api=loadApi(),library=integratedLibrary();
  const results=names.map(name=>({name,result:api.exerciseLibraryResolutionModel({exercise:{name},library,normalize})}));
  assert.equal(results.filter(item=>Boolean(item.result.exercise)).length,12);
  assert.equal(results.filter(item=>item.result.candidates.length>0).length,6);
  assert.equal(results.filter(item=>!item.result.exercise&&!item.result.candidates.length).length,0);
});

test("una resolución manual guardada se restaura desde el borrador",()=>{
  const exercise={name:"Abdominales",resolvedLibraryExerciseId:"reverse-crunch"};
  const first=loadApi().exerciseLibraryResolutionModel({exercise,library:integratedLibrary(),normalize});
  const reloaded=loadApi().exerciseLibraryResolutionModel({
    exercise:JSON.parse(JSON.stringify(exercise)),library:integratedLibrary(),normalize
  });
  assert.equal(first.status,"visual_selection");
  assert.equal(reloaded.status,"visual_selection");
  assert.equal(reloaded.exercise.id,"reverse-crunch");
});

test("guía: acepta únicamente assets locales controlados y genera un alt humano",()=>{
  const api=loadApi();
  const local=api.exerciseGuideModel({exercise:libraryExercise(),label:value=>value});
  assert.equal(local.image.src,"assets/exercises/press-maquina.webp");
  assert.match(local.image.alt,/Press de hombro/);
  const remote=api.exerciseGuideModel({
    exercise:libraryExercise({imageAsset:"https://example.com/press.webp"}),label:value=>value
  });
  assert.equal(remote.image,null);
});

test("guía: separa músculos principales y secundarios sin duplicarlos",()=>{
  const muscles=loadApi().exerciseMuscleModel({
    exercise:libraryExercise(),label:value=>value.replaceAll("_"," ")
  });
  assert.deepEqual(plain(muscles.primary),["deltoides anterior","deltoides medio"]);
  assert.deepEqual(plain(muscles.secondary),["triceps"]);
});

test("guía: presenta técnica existente y un estado vacío amable cuando no existe",()=>{
  const api=loadApi();
  const complete=api.exerciseTechniqueModel({exercise:libraryExercise()});
  assert.equal(complete.available,true);
  assert.equal(complete.highlights.length,3);
  assert.equal(complete.cautions.length,1);
  assert.equal(api.exerciseTechniqueModel({exercise:{}}).available,false);
  assert.match(workoutUiSource,/Aún no tenemos indicaciones confirmadas/);
  assert.match(workoutUiSource,/Referencia visual pendiente/);
  assert.match(workoutUiSource,/Puedes registrar el ejercicio con normalidad/);
});

test("guía: todo contenido procedente de biblioteca pasa por escaping al renderizarse",()=>{
  const guideSource=between(appSource,"function renderActiveWorkoutGuide(","function renderActiveWorkoutUnresolved(");
  assert.match(guideSource,/esc\(item\)/);
  assert.match(guideSource,/esc\(technique\.breathing\)/);
  assert.match(guideSource,/esc\(value\)/);
  assert.match(guideSource,/esc\(guide\.image\.src\)/);
});

test("series: conserva ceros explícitos en peso, repeticiones, RIR y duración",()=>{
  const api=loadApi();
  const row=api.setEntryModel({
    set:{weight:0,reps:0,rir:0,seconds:0,warmup:true,done:false},
    previous:{weight:0,reps:0,rir:0,seconds:0},index:0,timed:true
  });
  assert.equal(row.weight,0);
  assert.equal(row.reps,0);
  assert.equal(row.rir,0);
  assert.equal(row.seconds,0);
  assert.equal(row.previous.weight,0);
  assert.equal(row.hasResults,true);
});

test("series: diferencia calentamiento, estado, borrado y registro por duración",()=>{
  const api=loadApi();
  const pending=api.setEntryModel({set:{warmup:true},index:2,timed:true,target:"45 s"});
  assert.equal(pending.number,3);
  assert.equal(pending.timed,true);
  assert.equal(pending.warmup,true);
  assert.equal(pending.canDelete,true);
  assert.equal(api.setEntryModel({set:{done:true}}).canDelete,false);
});

test("serie extra: crea identidad explícita sin copiar resultados reales",()=>{
  const api=loadApi();
  const extra=api.manualExtraSetModel({
    setInstanceId:"set-extra-1",ownerId:"owner-1",
    workoutInstanceId:"workout-1",exerciseInstanceId:"exercise-1",
    createdAt:"2026-07-30T12:00:00.000Z",target:"8–10 reps",
    targetRir:"2",restSeconds:90,type:"peso"
  });
  assert.deepEqual(plain(extra),{
    setInstanceId:"set-extra-1",ownerId:"owner-1",
    workoutInstanceId:"workout-1",exerciseInstanceId:"exercise-1",
    planned:false,source:"manual_extra",createdAt:"2026-07-30T12:00:00.000Z",
    target:"8–10 reps",targetRir:"2",restSeconds:90,type:"peso",
    weight:"",reps:"",rir:"",seconds:"",distance:"",technique:"",
    dropset:false,restPause:false,unilateral:false,warmup:false,done:false
  });
  assert.throws(()=>api.manualExtraSetModel({}),/invalid_extra_set_identity/);
});

test("serie extra: resume previstas, extras y realizadas sin mutar entradas",()=>{
  const api=loadApi();
  const series=deepFreeze([
    {setInstanceId:"p1",done:true},
    {setInstanceId:"p2",done:true},
    {setInstanceId:"p3",done:true},
    {setInstanceId:"x1",planned:false,source:"manual_extra",done:false}
  ]);
  const before=JSON.stringify(series);
  const pending=api.setSeriesSummaryModel({series,plannedSets:3});
  assert.equal(pending.label,"3 previstas + 1 extra");
  assert.equal(pending.completed,3);
  const completed=api.setSeriesSummaryModel({
    series:series.map(set=>({...set,done:true})),plannedSets:3
  });
  assert.equal(completed.performedLabel,"4 realizadas · 3 previstas");
  assert.equal(JSON.stringify(series),before);
});

test("serie extra completada debe desmarcarse antes de poder eliminarse",()=>{
  const api=loadApi();
  const completed=api.setEntryModel({
    set:{setInstanceId:"extra",planned:false,source:"manual_extra",done:true}
  });
  assert.equal(completed.planned,false);
  assert.equal(completed.canDelete,false);
  assert.equal(api.setEntryModel({
    set:{...completed,done:false,weight:"80",reps:"8"}
  }).canDelete,true);
});

test("series: cuenta 0 de 3 sin checks",()=>{
  const api=loadApi();
  const summary=api.setSeriesSummaryModel({
    series:[
      {weight:"80",reps:"10",rir:"2",done:false},
      {weight:"80",reps:"10",rir:"2",done:false},
      {weight:"80",reps:"10",rir:"2",done:false}
    ],
    plannedSets:3
  });
  assert.equal(summary.completed,0);
  assert.equal(summary.label,"0 de 3 series previstas");
});

test("series: cuenta 1 de 3 con un check",()=>{
  const api=loadApi();
  const summary=api.setSeriesSummaryModel({
    series:[{done:true},{done:false},{done:false}],
    plannedSets:3
  });
  assert.equal(summary.completed,1);
  assert.equal(summary.label,"1 de 3 series previstas");
});

test("series: cuenta 2 de 3 con dos checks",()=>{
  const api=loadApi();
  const summary=api.setSeriesSummaryModel({
    series:[{done:true},{done:true},{done:false}],
    plannedSets:3
  });
  assert.equal(summary.completed,2);
  assert.equal(summary.label,"2 de 3 series previstas");
});

test("series: cuenta 3 de 3 con tres checks",()=>{
  const api=loadApi();
  const summary=api.setSeriesSummaryModel({
    series:[{done:true},{done:true},{done:true}],
    plannedSets:3
  });
  assert.equal(summary.completed,3);
  assert.equal(summary.label,"3 de 3 series previstas");
});

test("series: peso precargado sin completar no cuenta ni muestra checks",()=>{
  const api=loadApi();
  const summary=api.setSeriesSummaryModel({
    series:[
      {weight:"80",reps:"",rir:"",done:false},
      {weight:"",reps:"",rir:"",done:false},
      {weight:"",reps:"",rir:"",done:false}
    ],
    plannedSets:3
  });
  assert.equal(summary.completed,0);
  assert.equal(summary.label,"0 de 3 series previstas");
});

test("series: peso y repeticiones escritos sin completar no cuenta ni muestra checks",()=>{
  const api=loadApi();
  const summary=api.setSeriesSummaryModel({
    series:[
      {weight:"80",reps:"8",rir:"2",done:false},
      {weight:"80",reps:"8",rir:"2",done:false},
      {weight:"80",reps:"8",rir:"2",done:false}
    ],
    plannedSets:3
  });
  assert.equal(summary.completed,0);
  assert.equal(summary.label,"0 de 3 series previstas");
});

test("series: recarga conserva exactamente contador y checks",()=>{
  const api=loadApi();
  const series=[{done:true},{done:true},{done:false}];
  const original=api.setSeriesSummaryModel({series,plannedSets:3});
  const reloaded=api.setSeriesSummaryModel({series:JSON.parse(JSON.stringify(series)),plannedSets:3});
  assert.deepEqual(original,reloaded);
});

test("serie completada editada permanece completada salvo reabrirla",()=>{
  const api=loadApi();
  const exercise={
    exerciseId:"test",series:[{done:true},{done:true}],completedAt:"2026-07-30T10:00:00.000Z"
  };
  assert.equal(api.workoutCompletionReviewModel({exercises:[exercise]}).completedExercises,1);
  const edited={...exercise,series:[{...exercise.series[0],weight:"82.5"},{...exercise.series[1]}]};
  assert.equal(api.workoutCompletionReviewModel({exercises:[edited]}).completedExercises,1);
  const reopened={...exercise,series:[{...exercise.series[0],done:false},{...exercise.series[1]}]};
  assert.equal(api.workoutCompletionReviewModel({exercises:[reopened]}).completedExercises,0);
});

test("serie migrada sin bandera inequívoca se considera incompleta",()=>{
  const api=loadApi();
  const summary=api.setSeriesSummaryModel({
    series:[{weight:"80",reps:"10",rir:"2",done:false}],
    plannedSets:1
  });
  assert.equal(summary.completed,0);
  assert.equal(summary.label,"0 de 1 serie prevista");
});

test("ficha pendiente: copy y botones exactos",()=>{
  assert.match(workoutUiSource,/Ficha pendiente/);
  assert.match(workoutUiSource,/GymOS ha encontrado varias fichas posibles/);
  assert.match(workoutUiSource,/Este ejercicio no tiene una ficha confirmada/);
  assert.match(workoutUiSource,/No hay una ficha compatible para seleccionar/);
  assert.doesNotMatch(workoutUiSource,/Selecciona una ficha para ver técnica y músculos trabajados\./);
  assert.match(workoutUiSource,/Elegir ficha/);
  assert.match(workoutUiSource,/Continuar sin ficha/);
});

test("ficha pendiente solo se renderiza cuando el ejercicio sigue sin resolver",()=>{
  assert.match(workoutUiSource,/\$\{!resolution\.exercise\?renderActiveWorkoutUnresolved/);
  assert.match(workoutUiSource,/\$\{!resolution\.exercise\?`<button[^`]+Ficha pendiente/);
});

test("completar ejercicio pliega el actual y abre el siguiente pendiente",()=>{
  const completeBranch=between(bindingSource,'}else if(button.matches("[data-complete-active-exercise]"))','}else if(button.matches("[data-workout-discard-menu]"))');
  assert.match(completeBranch,/collapseCompletedWorkoutExercise\(/);
});

test("updateActiveWorkoutExerciseUi actualiza el resumen de series tras completar una serie",()=>{
  assert.match(appSource,/const sectionSummary=card\.querySelector\("\.active-workout-section-heading small"\);/);
  assert.match(appSource,/if\(sectionSummary\) sectionSummary\.textContent=seriesSummary\.label;/);
});

test("ficha pendiente no bloquea series, ejercicio ni finalización",()=>{
  const model=loadApi().restTimerModel({seconds:72,running:true,defaultSeconds:120});
  assert.deepEqual(plain(model),{
    remainingSeconds:72,running:true,defaultSeconds:120,finished:false
  });
});

test("revisión: distingue ejercicios completos, parciales y no iniciados",()=>{
  const model=loadApi().workoutCompletionReviewModel({
    elapsedMs:120000,
    exercises:[
      {exerciseId:"a",name:"A",series:[{done:true}],notes:"Bien",completedAt:"2026-07-30T10:00:00.000Z"},
      {exerciseId:"b",name:"B",series:[{weight:20,done:false},{done:false}],substitution:{}},
      {exerciseId:"c",name:"C",series:[{done:false}]}
    ]
  });
  assert.equal(model.completedExercises,1);
  assert.equal(model.partialExercises,1);
  assert.equal(model.untouchedExercises,1);
  assert.equal(model.pendingSets,3);
  assert.equal(model.substitutions,1);
  assert.equal(model.notes,1);
  assert.equal(model.complete,false);
});

test("revisión: una serie hecha no completa un ejercicio sin confirmación de finalización",()=>{
  const api=loadApi();
  const model=api.workoutCompletionReviewModel({
    exercises:[{series:[{done:true},{done:true}]}]
  });
  assert.equal(model.completedExercises,0);
  assert.equal(model.partialExercises,1);
  assert.equal(model.untouchedExercises,0);
  assert.equal(model.pendingSets,0);
  assert.equal(model.complete,false);
});

test("modelos: son deterministas, JSON serializables y no mutan entradas congeladas",()=>{
  const api=loadApi();
  const input=deepFreeze({
    exercise:libraryExercise(),
    library:[libraryExercise()],
    selectedExerciseId:null
  });
  const before=JSON.stringify(input);
  const first=api.exerciseLibraryResolutionModel({...input,normalize});
  const second=api.exerciseLibraryResolutionModel({...input,normalize});
  assert.equal(JSON.stringify(input),before);
  assert.equal(JSON.stringify(first),JSON.stringify(second));
  assert.doesNotThrow(()=>JSON.stringify(first));
});

test("cabecera visual: ofrece Volver, progreso accesible, resumen y tiempo total independiente",()=>{
  for(const token of [
    "data-workout-back","data-workout-session-overview",
    'role="progressbar"','data-workout-session-elapsed',
    "sessionElapsedAccessible","completedExercises} de ${totalExercises} ejercicios"
  ]) assert.ok(renderSource.includes(token),token);
  assert.match(renderSource,/data-workout-back aria-label="Volver a Inicio"/);
  assert.match(renderSource,/id="activeWorkoutTitle"/);
});

test("volver: fuerza el guardado pendiente, detiene timers y no finaliza ni elimina",()=>{
  const backBranch=between(bindingSource,'if(button.matches("[data-workout-back]"))','}else if(button.matches("[data-workout-session-toggle]"))');
  assert.match(backBranch,/flushWorkoutDraftProgress\(\{scheduleSync:false\}\)/);
  assert.match(backBranch,/stopAllExerciseTimers\(\)/);
  assert.match(backBranch,/stopWorkoutSessionTimer\(\)/);
  assert.match(backBranch,/renderHome\(\)/);
  assert.doesNotMatch(backBranch,/finishWorkout|clearDraft|history\.back/);
});

test("timer de sesión: usa un único intervalo, deriva timestamps y no escribe cada segundo",()=>{
  assert.match(sessionTimerSource,/setInterval\(updateWorkoutSessionElapsed,1000\)/);
  assert.match(sessionTimerSource,/current&&current\.ownerId===ownerId&&current\.draftId===id/);
  assert.match(sessionTimerSource,/sessionTimerElapsedMs\(context\.sessionTimer\)/);
  assert.doesNotMatch(sessionTimerSource,/localStorage|saveDraft|markLocalUpdated|autoSync|localRevision/);
});

test("timer de sesión: se cancela al salir, finalizar, descartar y cambiar de propietario",()=>{
  const navigationSource=between(appSource,"function navigateToScreen(screen)","function bindNav(");
  assert.match(navigationSource,/screen!=="workout"\) stopWorkoutSessionTimer\(\)/);
  assert.match(finishSource,/stopWorkoutSessionTimer\(\)/);
  assert.match(bindingSource,/data-confirm-discard-workout[\s\S]*?stopWorkoutSessionTimer\(\)/);
  const resetSource=between(appSource,"function resetRoutineSessionOwnerState()","let state =");
  assert.match(resetSource,/stopWorkoutSessionTimer\(\)/);
});

test("resumen de sesión: usa identidades estables, estado humano y restauración de foco",()=>{
  assert.match(workoutUiSource,/data-exercise-id="\$\{esc\(activeWorkoutApi\(\)\.exerciseIdentity/);
  assert.match(workoutUiSource,/Pendiente/);
  assert.match(workoutUiSource,/Iniciado/);
  assert.match(workoutUiSource,/Completado/);
  assert.match(workoutUiSource,/Sustituido/);
  assert.match(bindingSource,/activeWorkoutApi\(\)\.exerciseIdentity\(exercise,index\)!==button\.dataset\.exerciseId/);
  assert.match(bindingSource,/target\?\.querySelector\("\[data-workout-toggle-exercise\]"\)\?\.focus\(\)/);
  assert.match(bindingSource,/event\.key==="Escape"/);
});

test("ficha ambigua: muestra un bloque inline compacto y no bloqueante",()=>{
  assert.match(workoutUiSource,/active-workout-resolution/);
  assert.match(workoutUiSource,/FICHA PENDIENTE/);
  assert.match(workoutUiSource,/Elegir ficha/);
  assert.match(workoutUiSource,/Continuar sin ficha/);
  assert.match(workoutUiSource,/Ficha pendiente/);
  assert.match(workoutUiSource,/data-workout-show-candidates[\s\S]*?>Seleccionar</);
  assert.doesNotMatch(workoutUiSource,/Este ejercicio todavía no tiene una ficha inequívoca en la biblioteca/);
  assert.match(bindingSource,/workoutUnresolvedDismissed\.add/);
  assert.match(bindingSource,/workoutVisualLibrarySelections\.set/);
  assert.match(stylesSource,/@media\(max-width:767px\)\{[\s\S]*?\.active-workout-resolution\{grid-template-columns:1fr/);
});

test("ficha ambigua: continuar sin ficha persiste el plegado sin iniciar la sesión",()=>{
  const dismissBranch=between(
    bindingSource,
    '}else if(button.matches("[data-workout-dismiss-resolution]"))',
    '}else if(button.matches("[data-workout-library-candidate]"))'
  );
  assert.match(dismissBranch,/current\.libraryResolutionDismissed=true/);
  assert.match(dismissBranch,/stageWorkoutDraft\(draft,\{immediate:true,scheduleSync:false\}\)/);
  assert.doesNotMatch(dismissBranch,/startWorkoutSessionInDraft|saveRoutine|saveHistory/);
});

test("ficha ambigua: elegir candidato lo asocia al draft sin tocar rutina ni historial",()=>{
  const candidateBranch=between(bindingSource,'}else if(button.matches("[data-workout-library-candidate]"))','}else if(button.matches("[data-active-timer-start]"))');
  assert.match(candidateBranch,/workoutVisualLibrarySelections\.set/);
  assert.match(candidateBranch,/current\.resolvedLibraryExerciseId=candidateId/);
  assert.match(candidateBranch,/stageWorkoutDraft\(draft,\{immediate:true,scheduleSync:true\}\)/);
  assert.doesNotMatch(candidateBranch,/saveRoutine|saveHistory|localStorage|startWorkoutSessionInDraft/);
});

test("ficha pendiente no bloquea series, ejercicio ni finalización",()=>{
  const completeSetBranch=between(
    bindingSource,
    '}else if(button.matches("[data-complete-active-set]"))',
    '}else if(button.matches("[data-add-extra-set]"))'
  );
  const completeExerciseBranch=between(
    bindingSource,
    '}else if(button.matches("[data-complete-active-exercise]"))',
    '}else if(button.matches("[data-workout-discard-menu]"))'
  );
  assert.doesNotMatch(completeSetBranch,/libraryResolution|workoutUnresolved|resolvedLibrary/);
  assert.doesNotMatch(completeExerciseBranch,/libraryResolution|workoutUnresolved|resolvedLibrary/);
  assert.doesNotMatch(finishSource,/libraryResolution|workoutUnresolved|resolvedLibrary/);
});

test("en móvil el descanso queda en flujo y no se superpone al registro",()=>{
  assert.match(
    stylesSource,
    /@media\(max-width:767px\)\{[\s\S]*?\.active-rest-timer\{[\s\S]*?position:static[\s\S]*?min-width:0/
  );
});

test("cambio de ejercicio: existe un único menú y reutiliza los modos temporal y permanente",()=>{
  assert.match(workoutUiSource,/Cambiar ejercicio/);
  assert.match(workoutUiSource,/¿Dónde quieres aplicar el cambio\?/);
  assert.match(workoutUiSource,/Solo en este entrenamiento/);
  assert.match(workoutUiSource,/Cambiar en mi rutina/);
  assert.match(bindingSource,/openExerciseSubstitution\(mode,index\)/);
  assert.match(substitutionSource,/api\.hasExerciseResults\(exercise\)/);
  assert.doesNotMatch(substitutionSource,/saveRoutine\(/);
  assert.match(appSource,/permanentSubstitutionProposal/);
});

test("registro: ofrece campos etiquetados, calentamiento completo y acciones inequívocas",()=>{
  for(const token of [
    "Peso <small>(kg)</small>","Repeticiones","Duración <small>(segundos)</small>",
    "<span>RIR</span>","Serie de calentamiento","Completar serie","Corregir serie",
    "Añadir serie","Eliminar serie"
  ]) assert.ok(workoutUiSource.includes(token),token);
  assert.doesNotMatch(workoutUiSource,/>Cal\.</);
  assert.doesNotMatch(workoutUiSource,/>Hecha</);
  assert.match(workoutUiSource,/active-set-card \$\{row\.done\?"completed":""\}/);
});

test("registro: completar usa busy, inicia descanso solo en serie de trabajo y permite confirmación interna",()=>{
  const completeBranch=between(bindingSource,'}else if(button.matches("[data-complete-active-set]"))','}else if(button.matches("[data-add-extra-set]"))');
  assert.match(completeBranch,/workoutSetBusyKey===busyKey/);
  assert.match(completeBranch,/shouldStartRestTimerAfterSetCompletion\(\{[\s\S]*?exercises:before\.exercises,exerciseInstanceId,setInstanceId/);
  assert.match(completeBranch,/startRest=shouldStartRest/);
  assert.match(completeBranch,/exercise\.series\.length&&exercise\.series\.every\(item=>item\.done\)/);
  assert.match(completeBranch,/exercise\.completedAt=new Date\(\)\.toISOString\(\)/);
  assert.match(completeBranch,/effectiveRestSeconds\(\s*beforeExercise,getRestSeconds\(\)\s*\)/);
  assert.match(completeBranch,/startTimer\(restDuration\)/);
  assert.match(bindingSource,/workoutSeriesDeleteCandidate/);
  assert.match(workoutUiSource,/data-confirm-delete-active-set/);
  assert.doesNotMatch(completeBranch,/window\.confirm|confirm\(/);
});

test("descanso: muestra Omitir y +30 sin confundirlo con el tiempo de sesión",()=>{
  assert.match(renderSource,/data-active-rest-time/);
  assert.match(renderSource,/>Omitir</);
  assert.match(renderSource,/\+30 s/);
  assert.match(renderSource,/id="activeRestStatus"[\s\S]*aria-live="polite"/);
  assert.match(bindingSource,/extendActiveRestTimer\(30\)/);
  assert.match(bindingSource,/clearActiveRestTimer\(\{removePersisted:true\}\)/);
});

test("finalización: revisa pendientes, duración, sustituciones y notas antes del writer oficial",()=>{
  for(const token of [
    "Revisa tu entrenamiento","Ejercicios completados","Ejercicios parciales",
    "Sin comenzar","Series pendientes","Duración","Sustituciones",
    "Ejercicios con notas","Finalizar de todas formas","Volver al entrenamiento"
  ]) assert.ok(workoutUiSource.includes(token),token);
  assert.match(bindingSource,/if\(state\.finishingWorkout\) return/);
  assert.match(bindingSource,/finishWorkout\(\)/);
  assert.doesNotMatch(bindingSource,/localStorage\.setItem\("gymos:history"/);
});

test("finalización: incluye series extra sin modificar la rutina ni duplicar historial o Recuperación",()=>{
  assert.match(finishSource,/completedExercises=d\.exercises\.map/);
  assert.match(finishSource,/exercises:completedExercises/);
  assert.doesNotMatch(finishSource,/planned!==false|source!=="manual_extra"/);
  assert.doesNotMatch(finishSource,/saveRoutine|saveCanonicalRoutine/);
  assert.match(finishSource,/workout\.workoutInstanceId===d\.workoutInstanceId\|\|workout\.draftId===d\.draftId/);
  assert.equal((finishSource.match(/createPendingCheckin\?\.\(workout,\{mark:false,sync:false\}\)/g)||[]).length,1);
});

test("writer final: deduplica por identidad estable, guarda duración real y retira el draft activo",()=>{
  assert.match(finishSource,/workout\.workoutInstanceId===d\.workoutInstanceId\|\|workout\.draftId===d\.draftId/);
  assert.match(finishSource,/durationMs:workoutSessionElapsedMs\(d\)/);
  assert.match(finishSource,/item\.workoutInstanceId===d\.workoutInstanceId\|\|item\.draftId===d\.draftId/);
  assert.match(finishSource,/workoutId:d\.workoutInstanceId/);
  assert.match(finishSource,/clearDraft\(s,\{mark:false,preserveProgress:true\}\)/);
  assert.match(finishSource,/finally\{\s*state\.finishingWorkout=false/);
});

test("owner isolation: revalida propietario, draft, rutina y sesión antes de escribir",()=>{
  const identitySource=between(appSource,"function activeWorkoutIdentityValid(","function activeWorkoutHumanError(");
  assert.match(identitySource,/currentRoutineOwnerOrNull\(\)!==context\.ownerId/);
  assert.match(identitySource,/stored\.draft\.draftId===context\.draftId/);
  assert.match(identitySource,/stored\.draft\.routineId===getCanonicalRoutine\(\)\?\.routineId/);
  assert.match(identitySource,/stored\.draft\.sessionId===context\.sessionId/);
  assert.match(bindingSource,/if\(!activeWorkoutIdentityValid\(context\)\) throw new Error\("owner_changed"\)/);
});

test("accesibilidad: usa landmarks, labels, controles reales, Escape, foco y aria-controls",()=>{
  for(const token of [
    '<main class="screen active-workout-screen"','aria-labelledby="activeWorkoutTitle"',
    'aria-controls="workoutSessionOverviewDialog"','aria-controls="workoutChangeDialog"',
    'aria-controls="workoutCompletionDialog"','target="_blank"','rel="noopener noreferrer"',
    'role="dialog"','aria-modal="true"','aria-expanded="${expanded}"',
    'inputmode="decimal"','inputmode="numeric"','aria-pressed="${row.done}"'
  ]) assert.ok(workoutUiSource.includes(token),token);
  assert.match(bindingSource,/event\.key==="Tab"/);
  assert.match(appSource,/returnFocusSelector[\s\S]*?requestAnimationFrame/);
});

test("responsive: la hoja compacta conserva filas densas y adaptación móvil",()=>{
  assert.match(stylesSource,/\.workout-exercise-sheet\{display:grid;gap:\.6rem\}/);
  assert.match(stylesSource,/\.workout-exercise-toggle\{[\s\S]*?grid-template-columns:2rem minmax\(11rem,1\.45fr\)/);
  assert.match(stylesSource,/@media\(max-width:767px\)\{[\s\S]*?\.active-set-card\{[\s\S]*?grid-template-columns:1\.8rem/);
  assert.match(stylesSource,/\.active-workout-screen\{[\s\S]*?overflow-x:clip/);
  assert.match(stylesSource,/\@media\(max-width:430px\)/);
  assert.match(stylesSource,/\.active-set-card\{[\s\S]*?grid-template-areas:[\s\S]*?"actions actions"/);
  assert.match(stylesSource,/\.active-set-actions\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(stylesSource,/\@media\(max-width:360px\)/);
  assert.match(stylesSource,/env\(safe-area-inset-bottom\)/);
});

test("hoja de sesión: renderiza todos los ejercicios y elimina el carrusel obligatorio",()=>{
  assert.match(renderSource,/draft\.exercises\.map\(\(item,index\)=>renderActiveWorkoutExercise/);
  assert.match(workoutUiSource,/class="workout-exercise-card status-\$\{status\}/);
  assert.match(workoutUiSource,/data-workout-toggle-exercise/);
  assert.match(renderSource,/data-workout-next-pending/);
  assert.doesNotMatch(renderSource,/data-workout-previous|data-workout-next(?!-pending)/);
});

test("referencia: abre Google fuera de GymOS sin escribir estado de entrenamiento",()=>{
  assert.match(workoutUiSource,/data-workout-reference/);
  assert.match(workoutUiSource,/googleExerciseReferenceModel/);
  assert.match(workoutUiSource,/href="\$\{esc\(googleReference\.url\)\}"/);
  assert.match(workoutUiSource,/target="_blank" rel="noopener noreferrer"/);
  assert.match(workoutUiSource,/Ver referencia en Google/);
  const referenceModel=between(
    moduleSource,"function googleExerciseReferenceModel(","function exerciseRecordType("
  );
  assert.match(referenceModel,/encodeURIComponent\(searchName\)/);
  assert.doesNotMatch(referenceModel,/localStorage|saveDraft|saveHistory|stageWorkoutDraft/);
});

test("duración renderiza segundos sin kg/reps y conserva el writer canónico",()=>{
  assert.match(appSource,/const recordType=activeWorkoutApi\(\)\.exerciseRecordType\(exercise\)/);
  assert.match(workoutUiSource,/row\.timed[\s\S]*?data-set-field="seconds"[\s\S]*?:`<label><span>Peso/);
  assert.match(workoutUiSource,/mobile-workout-set-fields \$\{timed\?"duration-fields":"conventional-fields"\}/);
  const inputBranch=between(
    bindingSource,'main.addEventListener("input",event=>{','main.addEventListener("change",event=>{'
  );
  assert.match(inputBranch,/set\[target\.dataset\.setField\]=target\.value/);
  assert.match(inputBranch,/target\.dataset\.setField==="seconds"\)\{set\.weight="";set\.reps="";\}/);
  assert.doesNotMatch(inputBranch,/Number\(target\.value\)\|\|/);
  const emptyDraftSource=between(
    appSource,"function emptyDraft(","function getDraft("
  );
  assert.match(emptyDraftSource,/const durationExercise=isTimedExercise\(item\)/);
  assert.match(emptyDraftSource,/weight:durationExercise\?"":/);
  assert.match(emptyDraftSource,/seconds:""/);
  assert.match(stylesSource,/\.active-set-fields\.duration-fields/);
  assert.match(stylesSource,/mobile-workout-set-fields\.duration-fields/);
});

test("overlay de descanso separa visibilidad y deadline, cierra por backdrop o Escape",()=>{
  const overlaySource=between(
    appSource,"function renderActiveRestOverlay(","function hasInputValue("
  );
  const timerSource=between(
    appSource,"function restTimerContextForDraft(","function formatTimer("
  );
  assert.match(overlaySource,/role="dialog" aria-modal="true"/);
  assert.match(overlaySource,/state\.restOverlayOpen=false/);
  assert.doesNotMatch(overlaySource,/clearActiveRestTimer|deadlineEpochMs\s*=|restTimerPayload\s*=/);
  assert.match(timerSource,/state\.restOverlayOpen=true/);
  const restoreSource=between(
    timerSource,"function restoreActiveRestTimer(","function startTimer("
  );
  assert.doesNotMatch(restoreSource,/restOverlayOpen=true/);
  assert.match(bindingSource,/event\.target===restOverlay/);
  assert.match(bindingSource,/event\.key==="Escape"&&restDialog/);
  assert.match(bindingSource,/extendActiveRestTimer\(30\)/);
  assert.match(stylesSource,/\.workout-rest-overlay\{[\s\S]*?position:fixed[\s\S]*?overflow-x:hidden/);
  assert.match(stylesSource,/@media\(max-width:430px\)\{[\s\S]*?\.workout-rest-dialog\{width:100%/);
});

test("expandir o colapsar una tarjeta no reconstruye la sesión",()=>{
  const toggleBranch=between(
    bindingSource,
    '}else if(button.matches("[data-workout-toggle-exercise]"))',
    '}else if(button.matches("[data-workout-reference]"))'
  );
  assert.match(toggleBranch,/panel\.hidden=expanded/);
  assert.match(toggleBranch,/workoutExpandedExercises\.(delete|add)/);
  assert.doesNotMatch(toggleBranch,/renderWorkout|saveDraft|stageWorkoutDraft|localStorage/);
});

test("notas y molestias comienzan plegadas con controles accesibles independientes",()=>{
  assert.match(workoutUiSource,/data-workout-detail-toggle="notes"[\s\S]*?aria-expanded="\$\{notesExpanded\}"[\s\S]*?aria-controls="workoutExerciseNotesPanel\$\{index\}"/);
  assert.match(workoutUiSource,/data-workout-detail-toggle="discomfort"[\s\S]*?aria-expanded="\$\{discomfortExpanded\}"[\s\S]*?aria-controls="workoutExerciseDiscomfortPanel\$\{index\}"/);
  assert.match(workoutUiSource,/class="workout-exercise-detail-panel" \$\{notesExpanded\?"":"hidden"\}/);
  assert.match(workoutUiSource,/class="workout-exercise-detail-panel" \$\{discomfortExpanded\?"":"hidden"\}/);
  assert.match(stylesSource,/\.workout-exercise-detail-panel\[hidden\]\{display:none\}/);
});

test("el resumen indica contenido sin revelar notas ni molestias",()=>{
  const api=loadApi();
  const model=api.exerciseDetailDisclosureModel({
    notes:"Aumentar carga la próxima vez",
    discomfort:"Dolor punzante detallado en rodilla derecha"
  });
  assert.equal(model.notes.label,"Notas del ejercicio · Añadida");
  assert.equal(model.discomfort.label,"Molestias durante el ejercicio · Registrada");
  assert.equal(model.discomfort.safeSummary,"Molestia registrada");
  assert.doesNotMatch(JSON.stringify(model),/punzante|rodilla derecha|Aumentar carga/);
});

test("abrir un panel no escribe y cerrarlo solo hace flush si hay cambios",()=>{
  const detailBranch=between(
    bindingSource,
    '}else if(button.matches("[data-workout-detail-toggle]"))',
    '}else if(button.matches("[data-workout-reference]"))'
  );
  assert.match(detailBranch,/expanded&&!flushWorkoutDetailPanels/);
  assert.match(detailBranch,/workoutExpandedDetailPanels\.(delete|add)/);
  assert.match(detailBranch,/event\.detail===0[\s\S]*?textarea,input[\s\S]*?focus/);
  assert.doesNotMatch(detailBranch,/renderWorkout|stageWorkoutDraft|saveDraft|localStorage/);
  const flushHelper=between(
    appSource,
    "function flushWorkoutDetailPanels(",
    "function focusNextPendingWorkoutExercise("
  );
  assert.match(flushHelper,/if\(!dirtyKeys\.length\) return true/);
  assert.match(flushHelper,/requireLocal:true/);
});

test("completar ejercicio guarda localmente y actualiza solo la tarjeta visible",()=>{
  const completeBranch=between(
    bindingSource,
    '}else if(button.matches("[data-complete-active-exercise]"))',
    '}else if(button.matches("[data-workout-discard-menu]"))'
  );
  assert.match(completeBranch,/flushWorkoutDraftProgress\(\{[\s\S]*?requireLocal:true/);
  assert.match(completeBranch,/persist\([\s\S]*?completedAt=new Date\(\)\.toISOString/);
  assert.match(completeBranch,/if\(!workoutLocalSaveSucceeded\(\)\) return/);
  assert.match(completeBranch,/updateActiveWorkoutExerciseUi\(exerciseInstanceId,saved\)/);
  assert.match(completeBranch,/collapseCompletedWorkoutExercise\(/);
});

test("fallo remoto permite plegar y fallo local lo impide",()=>{
  const savePolicy=between(
    appSource,
    "function workoutLocalSaveSucceeded(",
    "function flushWorkoutDetailPanels("
  );
  assert.match(savePolicy,/workoutDraftSaveStatus!=="local_error"/);
  assert.match(savePolicy,/workoutDraftLastError\.code==="remote_sync_failed"/);
});

test("corregir una serie completada devuelve el ejercicio a En progreso",()=>{
  const setBranch=between(
    bindingSource,
    '}else if(button.matches("[data-complete-active-set]"))',
    '}else if(button.matches("[data-add-extra-set]"))'
  );
  assert.match(setBranch,/if\(wasDone\) exercise\.completedAt=null/);
});

test("última serie: el último ejercicio queda completado y se renderiza verde tras rerender",()=>{
  const setBranch=between(
    bindingSource,
    '}else if(button.matches("[data-complete-active-set]"))',
    '}else if(button.matches("[data-add-extra-set]"))'
  );
  assert.match(setBranch,/exercise\.completedAt=new Date\(\)\.toISOString\(\)/);
  assert.match(setBranch,/updateActiveWorkoutExerciseUi\(exerciseInstanceId,updated\)/);
  assert.match(workoutUiSource,/class="workout-exercise-card status-\$\{status\}/);
  assert.match(workoutUiSource,/workout-exercise-state" data-status="\$\{status\}"/);
  assert.match(stylesSource,/\.workout-exercise-state\[data-status="completed"\]\{color:var\(--success\)\}/);
  assert.match(stylesSource,/\.workout-exercise-card\.status-completed/);
});

test("descanso tras serie: se mantiene entre series y ejercicios pendientes",()=>{
  const api=loadApi();
  const exercises=[
    {
      exerciseInstanceId:"press",
      series:[
        {setInstanceId:"press-1",done:false},
        {setInstanceId:"press-2",done:false}
      ]
    },
    {
      exerciseInstanceId:"row",
      series:[{setInstanceId:"row-1",done:false}]
    }
  ];
  assert.equal(api.shouldStartRestTimerAfterSetCompletion({
    exercises,exerciseInstanceId:"press",setInstanceId:"press-1"
  }),true);
  exercises[0].series[0].done=true;
  assert.equal(api.shouldStartRestTimerAfterSetCompletion({
    exercises,exerciseInstanceId:"press",setInstanceId:"press-2"
  }),true);
});

test("descanso tras serie: no arranca al completar la última serie del último ejercicio",()=>{
  const api=loadApi();
  const exercises=[
    {
      exerciseInstanceId:"press",
      completedAt:"2026-07-30T10:00:00.000Z",
      series:[
        {setInstanceId:"press-1",done:true},
        {setInstanceId:"press-2",done:true}
      ]
    },
    {
      exerciseInstanceId:"row",
      series:[
        {setInstanceId:"row-1",done:true},
        {setInstanceId:"row-2",done:false}
      ]
    }
  ];
  assert.equal(api.shouldStartRestTimerAfterSetCompletion({
    exercises,exerciseInstanceId:"row",setInstanceId:"row-2"
  }),false);
  const completed=plain(exercises);
  completed[1].series[1].done=true;
  completed[1].completedAt="2026-07-30T10:01:00.000Z";
  assert.equal(api.workoutCompletionReviewModel({exercises:completed}).complete,true);
});

test("serie extra: ofrece una única acción visible por breakpoint y etiqueta la fila",()=>{
  assert.match(workoutUiSource,/data-add-extra-set/);
  assert.match(workoutUiSource,/add-extra-set-header/);
  assert.match(workoutUiSource,/add-extra-set-footer/);
  assert.match(workoutUiSource,/active-set-extra-label/);
  assert.match(stylesSource,/\.add-extra-set-footer\{display:none/);
  assert.match(stylesSource,/@media\(max-width:767px\)\{[\s\S]*?\.add-extra-set-header\{display:none\}[\s\S]*?\.add-extra-set-footer\{display:block\}/);
});

test("serie extra: el handler guarda localmente, conserva la prescripción y enfoca solo con puntero preciso",()=>{
  const addBranch=between(
    bindingSource,
    '}else if(button.matches("[data-add-extra-set]"))',
    '}else if(button.matches("[data-delete-active-set]"))'
  );
  assert.match(addBranch,/manualExtraSetModel/);
  assert.match(addBranch,/planned:false|manualExtraSetModel/);
  assert.match(addBranch,/exercise\.completedAt=null/);
  assert.match(addBranch,/\{immediate:true,scheduleSync:true,exerciseInstanceId\}/);
  assert.match(addBranch,/scrollIntoView/);
  assert.match(addBranch,/matchMedia\?\.\("\(pointer:fine\)"\)/);
  assert.doesNotMatch(addBranch,/exercise\.sets\s*=|saveRoutine|saveHistory|supabase/);
});

test("UI: no conserva acciones ambiguas ni listeners inline en el render autoritativo",()=>{
  assert.doesNotMatch(renderSource,/>Salir</);
  assert.doesNotMatch(renderSource,/>Finalizar</);
  assert.doesNotMatch(renderSource,/Cambiar solo hoy/);
  assert.doesNotMatch(renderSource,/onclick=/);
  assert.equal((bindingSource.match(/main\.addEventListener\("click"/g)||[]).length,1);
  assert.equal((bindingSource.match(/shell\.addEventListener\("click"/g)||[]).length,1);
});

test("operaciones de solo lectura: los modelos no cambian rutina ni historial",()=>{
  const api=loadApi();
  const routine=deepFreeze({routineId:"routine-1",sessions:[{sessionId:"session-1",exercises:[libraryExercise()]}]});
  const history=deepFreeze([{id:"workout-1",exercises:[libraryExercise()]}]);
  const beforeRoutine=JSON.stringify(routine);
  const beforeHistory=JSON.stringify(history);
  api.activeWorkoutHeaderModel({
    session:routine.sessions[0],exerciseIndex:0,totalExercises:1,
    startedAt:"2026-07-29T10:00:00Z",now:"2026-07-29T10:10:00Z"
  });
  api.exerciseGuideModel({exercise:routine.sessions[0].exercises[0],label:value=>value});
  api.workoutCompletionReviewModel({exercises:history[0].exercises});
  assert.equal(JSON.stringify(routine),beforeRoutine);
  assert.equal(JSON.stringify(history),beforeHistory);
});

test("integración offline: los módulos activos cargan antes de app.js y están en el precache RC.3",()=>{
  const moduleIndex=indexSource.indexOf('<script src="active-workout.js"></script>');
  const progressIndex=indexSource.indexOf('<script src="workout-progress.js"></script>');
  const appIndex=indexSource.indexOf('src="app.js?v=');
  assert.ok(moduleIndex>=0&&progressIndex>moduleIndex&&appIndex>progressIndex);
  assert.match(workerSource,/"active-workout\.js"/);
  assert.match(workerSource,/"workout-progress\.js"/);
  assert.match(workerSource,/const GYMOS_BUILD_VERSION="4\.2\.0-rc\.13-sync-audit-last-sync"/);
  assert.match(workerSource,/const CACHE=`gymos-cache-\$\{GYMOS_BUILD_VERSION\}`/);
  assert.match(workerSource,/url\.origin!==self\.location\.origin/);
});

function mobileDraft(){
  return {
    ownerId:"local",workoutInstanceId:"workout-mobile",
    currentExerciseInstanceId:"exercise-press",
    exercises:[
      {
        exerciseInstanceId:"exercise-press",name:"Press",sets:3,target:"8-10",
        targetRir:"2",series:[
          {setInstanceId:"set-press-1",weight:"70",reps:"10",rir:"2",done:true},
          {setInstanceId:"set-press-2",weight:"72.5",reps:"",rir:"",done:false},
          {setInstanceId:"set-press-3",weight:"",reps:"",rir:"",done:false}
        ]
      },
      {
        exerciseInstanceId:"exercise-row",name:"Remo",sets:1,target:"10",
        targetRir:"2",series:[
          {setInstanceId:"set-row-1",weight:"",reps:"",rir:"",done:false}
        ]
      }
    ]
  };
}

test("modelo móvil: deriva un ejercicio canónico y una única serie editable por identidades",()=>{
  const api=loadApi();
  const draft=mobileDraft();
  const model=api.mobileWorkoutViewModel({
    draft,sessionTimerStatus:"running",saveStatus:"saved_local"
  });
  assert.equal(model.exerciseInstanceId,"exercise-press");
  assert.equal(model.positionLabel,"Ejercicio 1 de 2");
  assert.equal(model.activeSet.setInstanceId,"set-press-2");
  assert.deepEqual(
    plain(model.completedSets.map(row=>row.setInstanceId)),["set-press-1"]
  );
  assert.deepEqual(
    plain(model.futureSets.map(row=>row.setInstanceId)),["set-press-3"]
  );
  assert.equal(model.primaryAction.kind,"complete_set");
  assert.equal(model.previousExercise,null);
  assert.equal(model.nextExercise.exerciseInstanceId,"exercise-row");
});

test("modelo móvil: una serie realizada puede ser la única seleccionada para corrección",()=>{
  const api=loadApi();
  const model=api.mobileWorkoutViewModel({
    draft:mobileDraft(),selectedSetInstanceId:"set-press-1",
    sessionTimerStatus:"running"
  });
  assert.equal(model.activeSet.setInstanceId,"set-press-1");
  assert.equal(model.completedSets.length,0);
  assert.equal(model.futureSets.length,2);
  assert.equal(model.primaryAction.kind,"save_set_correction");
});

test("modelo móvil: la acción primaria cubre inicio, ejercicio, revisión, anomalía y vacío",()=>{
  const api=loadApi();
  const fresh=mobileDraft();
  fresh.exercises[0].series.forEach(set=>{
    set.weight="";set.reps="";set.rir="";set.done=false;
  });
  assert.equal(api.mobileWorkoutViewModel({
    draft:fresh,sessionTimerStatus:"idle"
  }).primaryAction.kind,"start_session");
  fresh.exercises[0].series.forEach(set=>{set.reps="8";set.done=true;});
  assert.equal(api.mobileWorkoutViewModel({
    draft:fresh,sessionTimerStatus:"running"
  }).primaryAction.kind,"complete_exercise");
  fresh.exercises.forEach(exercise=>{
    exercise.series.forEach(set=>{set.reps="8";set.done=true;});
    exercise.completedAt="2026-07-30T10:00:00.000Z";
  });
  assert.equal(api.mobileWorkoutViewModel({
    draft:fresh,sessionTimerStatus:"running"
  }).primaryAction.kind,"review");
  assert.equal(api.mobileWorkoutViewModel({
    draft:mobileDraft(),elapsedAnomalous:true
  }).primaryAction.kind,"reset_anomalous");
  assert.equal(api.mobileWorkoutViewModel({
    draft:{exercises:[]}
  }).primaryAction.kind,"open_routine");
});

test("modelo móvil: continuar busca el siguiente pendiente de forma circular",()=>{
  const api=loadApi();
  const draft=mobileDraft();
  draft.exercises[0].series.forEach(set=>{set.reps="8";set.done=true;});
  draft.exercises[0].completedAt="2026-07-30T10:00:00.000Z";
  draft.exercises[1].series.forEach(set=>{set.reps="8";set.done=true;});
  draft.currentExerciseInstanceId=draft.exercises[1].exerciseInstanceId;
  let model=api.mobileWorkoutViewModel({
    draft,sessionTimerStatus:"running"
  });
  assert.equal(model.primaryAction.kind,"complete_exercise");
  assert.equal(model.primaryAction.label,"Completar ejercicio y revisar");

  draft.exercises[0].completedAt=null;
  draft.exercises[1].completedAt="2026-07-30T10:01:00.000Z";
  model=api.mobileWorkoutViewModel({
    draft,sessionTimerStatus:"running"
  });
  assert.equal(model.primaryAction.kind,"next_pending");
  assert.equal(
    model.primaryAction.exerciseInstanceId,
    draft.exercises[0].exerciseInstanceId
  );
});

test("reducer móvil mantiene un único panel y una única selección efímera",()=>{
  const api=loadApi();
  let ui=api.reduceMobileWorkoutUi({},{
    type:"OPEN_PANEL",panel:"notes"
  });
  assert.equal(ui.panel,"notes");
  ui=api.reduceMobileWorkoutUi(ui,{type:"OPEN_PANEL",panel:"technique"});
  assert.equal(ui.panel,"technique");
  ui=api.reduceMobileWorkoutUi(ui,{
    type:"SELECT_SET",setInstanceId:"set-press-3"
  });
  assert.equal(ui.selectedSetInstanceId,"set-press-3");
  ui=api.reduceMobileWorkoutUi(ui,{type:"CLOSE_PANEL"});
  assert.equal(ui.panel,null);
  assert.equal(ui.selectedSetInstanceId,"set-press-3");
});

test("renderer móvil reutiliza la lista completa y no activa el wizard separado",()=>{
  assert.doesNotMatch(renderSource,/if\(activeWorkoutUsesMobileLayout\(\)\)/);
  assert.doesNotMatch(renderSource,/renderMobileWorkout\(/);
  assert.match(renderSource,/draft\.exercises\.map/);
  assert.match(renderSource,/\$\{nav\("workout"\)\}/);
  assert.match(renderSource,/active-workout-final-summary/);
  assert.match(renderSource,/data-workout-completed-sets/);
  assert.match(
    bindingSource,
    /\.active-workout-screen,\.active-workout-mobile-screen/
  );
});

test("navegación móvil hace flush local y persiste currentExerciseInstanceId con el writer existente",()=>{
  const navigation=between(
    bindingSource,
    "const navigateMobileWorkoutExercise=",
    "const rerenderWithError="
  );
  assert.match(navigation,/flushWorkoutDraftProgress/);
  assert.match(navigation,/requireLocal:true/);
  assert.match(navigation,/draft\.currentExerciseInstanceId=target\.exerciseInstanceId/);
  assert.match(navigation,/stageWorkoutDraft\(draft,\{immediate:true,scheduleSync:true\}\)/);
  assert.doesNotMatch(navigation,/localStorage|saveRoutine|saveHistory|supabase/);
});

test("sheets móviles aíslan fondo, restauran foco y Notas exige flush local",()=>{
  const mobileSource=between(
    appSource,"function renderMobileWorkoutSheet({","function renderWorkout()"
  );
  assert.match(mobileSource,/role="dialog"/);
  assert.match(mobileSource,/inert aria-hidden/);
  assert.match(mobileSource,/data-mobile-autofocus/);
  assert.match(mobileSource,/data-mobile-save-close/);
  const closeSource=between(
    appSource,"function closeActiveWorkoutOverlay()",
    "function activeWorkoutRecoveryGuidanceModel("
  );
  assert.match(closeSource,/workoutMobileUi\?\.panel==="notes"/);
  assert.match(closeSource,/flushWorkoutDraftProgress/);
  assert.match(closeSource,/requireLocal:true/);
  assert.match(bindingSource,/event\.key==="Escape"/);
  assert.match(bindingSource,/event\.key==="Tab"/);
});

test("teclado y storage difieren reconstrucción mientras existe una edición activa",()=>{
  assert.match(appSource,/function activeWorkoutEditingInProgress\(\)/);
  assert.match(appSource,/state\.workoutDeferredRender=true/);
  assert.match(appSource,/window\.visualViewport/);
  assert.match(appSource,/--workout-keyboard-inset/);
  assert.match(bindingSource,/event\.key==="Enter"/);
  assert.match(bindingSource,/event\.preventDefault\(\)/);
  assert.match(appSource,/requestSafeActiveWorkoutRender\(\)/);
  assert.match(stylesSource,/data-keyboard-open/);
});

test("descanso usa deadline persistente local sin crear writer de entrenamiento",()=>{
  const timerSource=between(
    appSource,"function restTimerContextForDraft(","function formatTimer("
  );
  assert.match(timerSource,/deadlineEpochMs/);
  assert.match(timerSource,/restTimerRemaining/);
  assert.match(timerSource,/localStorage\.setItem/);
  assert.match(timerSource,/Descanso finalizado/);
  assert.match(timerSource,/},1000\)/);
  assert.doesNotMatch(timerSource,/saveDraft|stageWorkoutDraft|flushWorkoutDraftProgress|supabase/i);
  assert.match(stylesSource,/\.mobile-workout-rest/);
  assert.match(appSource,/data-active-rest-time aria-live="off"/);
});

test("CSS móvil está encapsulado, respeta safe areas y targets esenciales",()=>{
  assert.match(stylesSource,/@media\(max-width:767px\)\{[\s\S]*?data-workout-layout="mobile"/);
  assert.match(stylesSource,/--workout-visual-height/);
  assert.match(stylesSource,/env\(safe-area-inset-bottom\)/);
  assert.match(stylesSource,/min-height:44px/);
  assert.match(stylesSource,/min-height:52px/);
  assert.match(stylesSource,/font-size:1rem/);
  assert.match(stylesSource,/@media\(max-width:430px\)/);
  assert.match(stylesSource,/@media\(max-width:360px\)/);
  assert.match(stylesSource,/prefers-reduced-motion:reduce/);
});

test("el rediseño no añade store, storage key ni writer de progreso",()=>{
  assert.equal((appSource.match(/function saveDraft\(d\)/g)||[]).length,1);
  assert.doesNotMatch(moduleSource,/localStorage|sessionStorage|indexedDB|saveDraft|stageWorkoutDraft|flushWorkoutDraftProgress/);
  assert.doesNotMatch(appSource,/gymos:mobileWorkout|gymos:workoutLayout/);
});
