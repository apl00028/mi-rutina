"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const root=path.resolve(__dirname,"..");
const moduleSource=fs.readFileSync(path.join(root,"active-workout.js"),"utf8");
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

test("entrenamiento activo: el módulo expone modelos puros sin dependencias de entorno",()=>{
  const api=loadApi();
  for(const name of [
    "activeWorkoutHeaderModel","sessionElapsedModel","exerciseGuideModel",
    "exerciseMuscleModel","exerciseTechniqueModel","exerciseLibraryResolutionModel",
    "setEntryModel","restTimerModel","workoutCompletionReviewModel"
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

test("guía: presenta técnica existente y un estado vacío cuando no existe",()=>{
  const api=loadApi();
  const complete=api.exerciseTechniqueModel({exercise:libraryExercise()});
  assert.equal(complete.available,true);
  assert.equal(complete.highlights.length,3);
  assert.equal(complete.cautions.length,1);
  assert.equal(api.exerciseTechniqueModel({exercise:{}}).available,false);
  assert.match(workoutUiSource,/Técnica todavía no disponible para este ejercicio/);
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

test("descanso: conserva el valor iniciado y separa el siguiente valor por defecto",()=>{
  const model=loadApi().restTimerModel({seconds:72,running:true,defaultSeconds:120});
  assert.deepEqual(plain(model),{
    remainingSeconds:72,running:true,defaultSeconds:120,finished:false
  });
});

test("revisión: distingue ejercicios completos, parciales y no iniciados",()=>{
  const model=loadApi().workoutCompletionReviewModel({
    elapsedMs:120000,
    exercises:[
      {exerciseId:"a",name:"A",series:[{done:true}],notes:"Bien"},
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
    "sessionElapsedAccessible","Ejercicio ${header.exerciseNumber} de ${header.totalExercises}"
  ]) assert.ok(renderSource.includes(token),token);
  assert.match(renderSource,/← Volver a \$\{esc\(sessionName\)\}/);
});

test("volver: guarda el draft oficial, detiene timers y no finaliza ni elimina",()=>{
  const backBranch=between(bindingSource,'if(button.matches("[data-workout-back]"))','}else if(button.matches("[data-workout-session-toggle]"))');
  assert.match(backBranch,/saveDraft\(draft\)/);
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
  assert.match(bindingSource,/requestAnimationFrame\(\(\)=>document\.getElementById\("activeExerciseTitle"\)\?\.focus\(\)\)/);
  assert.match(bindingSource,/event\.key==="Escape"/);
});

test("ficha ambigua: sustituye el toast por un bloque inline no bloqueante",()=>{
  assert.match(workoutUiSource,/active-workout-resolution/);
  assert.match(workoutUiSource,/FICHA DEL EJERCICIO PENDIENTE/);
  assert.match(workoutUiSource,/Elegir la ficha correcta/);
  assert.match(workoutUiSource,/Continuar sin ficha/);
  assert.doesNotMatch(workoutUiSource,/Este ejercicio todavía no tiene una ficha inequívoca en la biblioteca/);
  assert.match(bindingSource,/workoutUnresolvedDismissed\.add/);
  assert.match(bindingSource,/workoutVisualLibrarySelections\.set/);
});

test("ficha ambigua: elegir candidato es solo visual y no escribe rutina ni historial",()=>{
  const candidateBranch=between(bindingSource,'}else if(button.matches("[data-workout-library-candidate]"))','}else if(button.matches("[data-active-timer-start]"))');
  assert.match(candidateBranch,/workoutVisualLibrarySelections\.set/);
  assert.doesNotMatch(candidateBranch,/saveRoutine|saveHistory|localStorage|markLocalUpdated|autoSync/);
});

test("cambio de ejercicio: existe un único menú y reutiliza los modos temporal y permanente",()=>{
  assert.match(renderSource,/Cambiar ejercicio/);
  assert.match(workoutUiSource,/¿Dónde quieres aplicar el cambio\?/);
  assert.match(workoutUiSource,/Solo en este entrenamiento/);
  assert.match(workoutUiSource,/Cambiar en mi rutina/);
  assert.match(bindingSource,/openExerciseSubstitution\(mode,context\.exerciseIndex\)/);
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
  assert.match(workoutUiSource,/active-set-card \$\{row\.done\?"completed":row\.index===nextPendingIndex\?"next":""\}/);
});

test("registro: completar usa busy, inicia descanso solo en serie de trabajo y permite confirmación interna",()=>{
  const completeBranch=between(bindingSource,'}else if(button.matches("[data-complete-active-set]"))','}else if(button.matches("[data-add-active-set]"))');
  assert.match(completeBranch,/workoutSetBusyKey===busyKey/);
  assert.match(completeBranch,/startRest=!wasDone&&!set\.warmup/);
  assert.match(completeBranch,/startTimer\(getRestSeconds\(\)\)/);
  assert.match(bindingSource,/workoutSeriesDeleteCandidate/);
  assert.match(workoutUiSource,/data-confirm-delete-active-set/);
  assert.doesNotMatch(completeBranch,/window\.confirm|confirm\(/);
});

test("descanso: muestra Omitir y +30 sin confundirlo con el tiempo de sesión",()=>{
  assert.match(renderSource,/data-active-rest-time/);
  assert.match(renderSource,/Omitir descanso/);
  assert.match(renderSource,/\+30 s/);
  assert.match(renderSource,/id="activeRestStatus"[\s\S]*aria-live="polite"/);
  assert.match(bindingSource,/state\.timerSeconds=Math\.max\(0,state\.timerSeconds\)\+30/);
  assert.match(bindingSource,/state\.timerSeconds=0/);
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

test("writer final: deduplica por draftId, guarda duración real y elimina el draft una vez",()=>{
  assert.match(finishSource,/find\(workout=>workout\.draftId===d\.draftId\)/);
  assert.match(finishSource,/durationMs:workoutSessionElapsedMs\(d\)/);
  assert.match(finishSource,/if\(!history\.some\(item=>item\.draftId===d\.draftId\)\)/);
  assert.equal((finishSource.match(/clearDraft\(s,\{mark:false\}\)/g)||[]).length,1);
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
    '<main class="screen active-workout-screen"','aria-labelledby="activeExerciseTitle"',
    'aria-controls="workoutSessionOverviewDialog"','aria-controls="workoutChangeDialog"',
    'aria-controls="workoutCompletionDialog"','role="dialog"','aria-modal="true"',
    'inputmode="decimal"','inputmode="numeric"','aria-pressed="${row.done}"'
  ]) assert.ok(workoutUiSource.includes(token),token);
  assert.match(bindingSource,/event\.key==="Tab"/);
  assert.match(appSource,/returnFocusSelector[\s\S]*?requestAnimationFrame/);
});

test("responsive: escritorio usa dos columnas y móvil conserva una columna sin scroll horizontal",()=>{
  assert.match(stylesSource,/\.active-workout-layout\{[\s\S]*?grid-template-columns:minmax\(0,1\.8fr\) minmax\(18rem,1fr\)/);
  assert.match(stylesSource,/@media\(max-width:1199px\)\{[\s\S]*?grid-template-areas:"heading" "guide" "register"/);
  assert.match(stylesSource,/@media\(max-width:767px\)\{[\s\S]*?\.active-set-card\{[\s\S]*?grid-template-columns:1fr/);
  assert.match(stylesSource,/\.active-workout-screen\{[\s\S]*?overflow-x:clip/);
  assert.match(stylesSource,/@media\(max-width:430px\)/);
  assert.match(stylesSource,/@media\(max-width:360px\)/);
  assert.match(stylesSource,/env\(safe-area-inset-bottom\)/);
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

test("integración offline: el módulo carga antes de app.js y está en el precache RC.2",()=>{
  const moduleIndex=indexSource.indexOf('<script src="active-workout.js"></script>');
  const appIndex=indexSource.indexOf('<script src="app.js"></script>');
  assert.ok(moduleIndex>=0&&appIndex>moduleIndex);
  assert.match(workerSource,/"active-workout\.js"/);
  assert.match(workerSource,/gymos-cache-4\.2\.0-rc\.2/);
  assert.match(workerSource,/url\.origin!==self\.location\.origin/);
});
