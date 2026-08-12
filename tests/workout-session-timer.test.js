"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const test=require("node:test");

const root=path.resolve(__dirname,"..");
const appSource=fs.readFileSync(path.join(root,"app.js"),"utf8");
const runtimeSource=fs.readFileSync(path.join(root,"routine-session-runtime.js"),"utf8");
const activeWorkoutSource=fs.readFileSync(path.join(root,"active-workout.js"),"utf8");
const OWNER_A="11111111-1111-4111-8111-111111111111";
const OWNER_B="22222222-2222-4222-8222-222222222222";
const SESSION_A="session-a";

function loadApi(){
  const context={console};
  context.globalThis=context;
  context.window=context;
  vm.createContext(context);
  for(const file of [
    "routine-session-model.js",
    "routine-session-migration.js",
    "routine-session-runtime.js"
  ]){
    vm.runInContext(
      fs.readFileSync(path.join(root,file),"utf8"),
      context,{filename:file}
    );
  }
  return context.GymOSRoutineSessionRuntime;
}
function loadActiveWorkoutApi(){
  const context={console};
  context.globalThis=context;
  context.window=context;
  vm.createContext(context);
  vm.runInContext(activeWorkoutSource,context,{filename:"active-workout.js"});
  return context.GymOSActiveWorkout;
}
function plain(value){return JSON.parse(JSON.stringify(value));}
function timer(api,overrides={}){
  return api.normalizeSessionTimer({
    ownerId:OWNER_A,sessionId:SESSION_A,status:"idle",running:false,
    elapsedMs:0,startedAt:null,...overrides
  },{ownerId:OWNER_A,sessionId:SESSION_A});
}

test("abrir una sesión nueva conserva 00:00 y ofrece Empezar sesión",()=>{
  const api=loadApi();
  const initial=timer(api);
  assert.equal(api.sessionTimerElapsedMs(initial,60_000),0);
  const control=loadActiveWorkoutApi().sessionTimerControlModel({
    status:initial.status,elapsedMs:0,restored:false
  });
  assert.deepEqual(plain(control),{
    state:"NOT_STARTED",restoredState:null,
    primaryLabel:"Empezar sesión",showReset:false,intervalRequired:false
  });
  const navigation=appSource.slice(
    appSource.indexOf("function navigateToScreen"),
    appSource.indexOf("function bindNav")
  );
  const render=appSource.slice(
    appSource.indexOf("function renderWorkout()"),
    appSource.indexOf("function activeWorkoutIdentityValid(")
  );
  assert.doesNotMatch(navigation,/ensureWorkoutSessionTimerStarted/);
  assert.doesNotMatch(render,/draft=ensureWorkoutSessionTimerStarted/);
  assert.match(appSource,/startedAt:null,\s*sessionTimer:/);
});

test("empezar crea un único startedAt y una segunda transición es idempotente",()=>{
  const api=loadApi();
  const started=api.transitionSessionTimer(timer(api),"start",{
    ownerId:OWNER_A,sessionId:SESSION_A,now:1000
  });
  const repeated=api.transitionSessionTimer(started,"start",{
    ownerId:OWNER_A,sessionId:SESSION_A,now:9000
  });
  assert.equal(started.status,"running");
  assert.equal(started.startedAt,1000);
  assert.deepEqual(plain(repeated),plain(started));
  const action=appSource.slice(
    appSource.indexOf("function setWorkoutSessionTimerAction("),
    appSource.indexOf("function stopWorkoutSessionTimerDisplay(")
  );
  assert.match(action,/action==="start"&&current\.status==="running"\) return draft/);
  assert.match(action,/new Date\(now\)\.toISOString\(\)/);
});

test("pausa y reanudación conservan exactamente el tiempo acumulado",()=>{
  const api=loadApi();
  const initial=timer(api);
  const running=api.transitionSessionTimer(initial,"start",{
    ownerId:OWNER_A,sessionId:SESSION_A,now:1000
  });
  const paused=api.transitionSessionTimer(running,"pause",{
    ownerId:OWNER_A,sessionId:SESSION_A,now:6500
  });
  assert.equal(paused.status,"paused");
  assert.equal(paused.elapsedMs,5500);
  assert.equal(api.sessionTimerElapsedMs(paused,9000),5500);
  const resumed=api.transitionSessionTimer(paused,"resume",{
    ownerId:OWNER_A,sessionId:SESSION_A,now:10000
  });
  assert.equal(api.sessionTimerElapsedMs(resumed,12500),8000);
});

test("reiniciar conserva el estado de marcha y la interfaz exige confirmación",()=>{
  const api=loadApi();
  const running=timer(api,{status:"running",running:true,elapsedMs:4500,startedAt:1000});
  const reset=api.transitionSessionTimer(running,"reset",{
    ownerId:OWNER_A,sessionId:SESSION_A,now:9000
  });
  assert.equal(reset.status,"running");
  assert.equal(reset.elapsedMs,0);
  assert.equal(reset.startedAt,9000);
  const paused=timer(api,{status:"paused",elapsedMs:4500,startedAt:null});
  const pausedReset=api.transitionSessionTimer(paused,"reset",{
    ownerId:OWNER_A,sessionId:SESSION_A,now:9000
  });
  assert.equal(pausedReset.status,"paused");
  assert.equal(pausedReset.elapsedMs,0);
  assert.equal(pausedReset.startedAt,null);
  const bindings=appSource.slice(
    appSource.indexOf('}else if(button.matches("[data-workout-session-reset]"))'),
    appSource.indexOf('}else if(button.matches("[data-workout-session-overview]"))')
  );
  assert.match(bindings,/window\.confirm/);
  assert.ok(
    bindings.indexOf("window.confirm")<
    bindings.indexOf('setWorkoutSessionTimerAction(context.sessionId,"reset")')
  );
});

test("el estado serializado recupera el tiempo correcto tras una recarga",()=>{
  const api=loadApi();
  const persisted=api.transitionSessionTimer(timer(api),"start",{
    ownerId:OWNER_A,sessionId:SESSION_A,now:1000
  });
  const reloaded=api.normalizeSessionTimer(
    JSON.parse(JSON.stringify(persisted)),
    {ownerId:OWNER_A,sessionId:SESSION_A}
  );
  assert.equal(api.sessionTimerElapsedMs(reloaded,61000),60000);
  assert.equal(api.formatSessionTimer(60000),"01:00");
  assert.equal(api.formatSessionTimer(3661000),"01:01:01");
});

test("una sesión pausada se restaura pausada y nunca crea un interval",()=>{
  const api=loadApi();
  const restored=api.normalizeSessionTimer(
    timer(api,{status:"paused",elapsedMs:32_000,startedAt:null}),
    {ownerId:OWNER_A,sessionId:SESSION_A}
  );
  const control=loadActiveWorkoutApi().sessionTimerControlModel({
    status:restored.status,elapsedMs:restored.elapsedMs,restored:true
  });
  assert.equal(control.state,"PAUSED");
  assert.equal(control.restoredState,"RESTORED");
  assert.equal(control.primaryLabel,"Reanudar");
  assert.equal(control.intervalRequired,false);
  assert.equal(api.sessionTimerElapsedMs(restored,99_000),32_000);
});

test("una sesión en curso se restaura corriendo desde su referencia temporal",()=>{
  const api=loadApi();
  const restored=api.normalizeSessionTimer(
    timer(api,{status:"running",running:true,elapsedMs:5_000,startedAt:10_000}),
    {ownerId:OWNER_A,sessionId:SESSION_A}
  );
  const control=loadActiveWorkoutApi().sessionTimerControlModel({
    status:restored.status,elapsedMs:15_000,restored:true
  });
  assert.equal(control.state,"RUNNING");
  assert.equal(control.restoredState,"RESTORED");
  assert.equal(control.primaryLabel,"Pausar");
  assert.equal(control.intervalRequired,true);
  assert.equal(api.sessionTimerElapsedMs(restored,20_000),15_000);
});

test("un draft anterior con startedAt ISO recupera el cronómetro en marcha",()=>{
  const api=loadApi();
  const legacyStart="2026-07-29T10:00:00.000Z";
  const recovered=api.normalizeSessionTimer(null,{
    ownerId:OWNER_A,sessionId:SESSION_A,legacyStartedAt:legacyStart
  });
  assert.equal(recovered.status,"running");
  assert.equal(recovered.startedAt,Date.parse(legacyStart));
  assert.equal(
    api.sessionTimerElapsedMs(recovered,Date.parse("2026-07-29T10:12:34.000Z")),
    754000
  );
});

test("el cronómetro de sesión es independiente del descanso y de las series",()=>{
  const api=loadApi();
  const original={
    restSeconds:90,
    exercises:[{series:[{weight:"80",reps:"8",done:true}]}],
    sessionTimer:timer(api,{status:"running",running:true,startedAt:1000})
  };
  const before=plain(original);
  const nextTimer=api.transitionSessionTimer(original.sessionTimer,"pause",{
    ownerId:OWNER_A,sessionId:SESSION_A,now:4000
  });
  assert.deepEqual(plain(original),before);
  assert.deepEqual(original.exercises,before.exercises);
  assert.equal(original.restSeconds,90);
  assert.equal(nextTimer.elapsedMs,3000);
  assert.doesNotMatch(runtimeSource,/timerSeconds|timerInterval|saveRoutine|saveHistory/);
});

test("operar el cronómetro no escribe rutina, historial ni propuestas",()=>{
  const source=appSource.slice(
    appSource.indexOf("function setWorkoutSessionTimerAction"),
    appSource.indexOf("function stopWorkoutSessionTimerDisplay")
  );
  assert.match(
    source,
    /stageWorkoutDraft\(draft,\{immediate:true,scheduleSync:true\}\)/
  );
  assert.doesNotMatch(source,/saveRoutine|gymos:history|routineProposal|localStorage/);
});

test("la primera entrada de datos inicia y persiste localmente la sesión",()=>{
  const binding=appSource.slice(
    appSource.indexOf("function bindActiveWorkoutEvents("),
    appSource.indexOf("function renderLegacyWorkout(")
  );
  assert.match(binding,/const sessionStarted=startWorkoutSessionInDraft\(draft,context\.sessionId\)/);
  assert.match(binding,/immediate:immediate\|\|sessionStarted/);
  assert.match(binding,/scheduleSync:scheduleSync\|\|sessionStarted/);
  assert.match(binding,/setActiveWorkoutMessage\("success","Sesión iniciada\."\)/);
  const readOnlyBranch=binding.slice(
    binding.indexOf('}else if(button.matches("[data-workout-toggle-exercise]"))'),
    binding.indexOf('}else if(button.matches("[data-workout-session-toggle]"))')
  );
  assert.doesNotMatch(
    readOnlyBranch,
    /startWorkoutSessionInDraft/
  );
});

test("un error remoto no forma parte de los controles locales del cronómetro",()=>{
  const source=appSource.slice(
    appSource.indexOf("function startWorkoutSessionInDraft("),
    appSource.indexOf("function stopWorkoutSessionTimerDisplay(")
  );
  assert.match(source,/stageWorkoutDraft\(draft,\{immediate:true,scheduleSync:true\}\)/);
  assert.doesNotMatch(source,/supabase|await|syncNow|fetch\(/);
});

test("un cronómetro nunca se reasigna silenciosamente a otro propietario o sesión",()=>{
  const api=loadApi();
  const owned=timer(api,{status:"paused",elapsedMs:3000});
  assert.throws(()=>api.normalizeSessionTimer(owned,{
    ownerId:OWNER_B,sessionId:SESSION_A
  }),/owner_mismatch/);
  assert.throws(()=>api.normalizeSessionTimer(owned,{
    ownerId:OWNER_A,sessionId:"session-b"
  }),/session_mismatch/);
  assert.throws(()=>api.transitionSessionTimer(owned,"resume",{
    ownerId:OWNER_B,sessionId:SESSION_A,now:5000
  }),/owner_mismatch/);
  const reset=appSource.slice(
    appSource.indexOf("function resetRoutineSessionOwnerState"),
    appSource.indexOf("function assertActiveLocalOwner")
  );
  assert.match(reset,/stopWorkoutSessionTimer\(\)/);
  assert.match(appSource,/workoutSessionTimerInterval:\s*null/);
});

test("finalizar usa el tiempo del cronómetro y pausar no finaliza la sesión",()=>{
  const pauseSource=appSource.slice(
    appSource.indexOf("function setWorkoutSessionTimerAction"),
    appSource.indexOf("function stopWorkoutSessionTimerDisplay")
  );
  assert.doesNotMatch(pauseSource,/finishWorkout|clearDraft|getHistory/);
  const finishSource=appSource.slice(
    appSource.indexOf("function finishWorkout"),
    appSource.indexOf("function showRecordsCelebration")
  );
  assert.match(finishSource,/durationMs:workoutSessionElapsedMs\(d\)/);
});

test("descanso móvil usa deadline persistente local y sigue independiente del cronómetro de sesión",()=>{
  const restSource=appSource.slice(
    appSource.indexOf("function restTimerContextForDraft("),
    appSource.indexOf("function formatTimer(")
  );
  assert.match(restSource,/deadlineEpochMs/);
  assert.match(restSource,/restTimerRemaining/);
  assert.match(restSource,/localStorage\.setItem/);
  assert.doesNotMatch(
    restSource,
    /sessionTimer|workoutSessionTimer|saveDraft|stageWorkoutDraft|supabase/i
  );
  assert.match(appSource,/timerDeadline:\s*null/);
  assert.match(appSource,/data-active-rest-time aria-live="off"/);
});
