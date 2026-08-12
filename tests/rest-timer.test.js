"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const root=path.resolve(__dirname,"..");
const activeSource=fs.readFileSync(path.join(root,"active-workout.js"),"utf8");
const appSource=fs.readFileSync(path.join(root,"app.js"),"utf8");
const restAppSource=appSource.slice(
  appSource.indexOf("function restTimerContextForDraft("),
  appSource.indexOf("function formatTimer(")
);
const OWNER_A="11111111-1111-4111-8111-111111111111";
const OWNER_B="22222222-2222-4222-8222-222222222222";
const DRAFT={ownerId:OWNER_A,workoutInstanceId:"workout-a",sessionId:"session-a"};

function loadApi(){
  const context={console};context.window=context;context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(activeSource,context,{filename:"active-workout.js"});
  return context.GymOSActiveWorkout;
}
function storageHarness(initial=new Map(),failure={}){
  const values=initial;
  return {
    values,
    get length(){return values.size;},
    key:index=>[...values.keys()][index]??null,
    getItem:key=>{
      if(failure.read) throw new Error("read_failed");
      return values.has(key)?values.get(key):null;
    },
    setItem:(key,value)=>{
      if(failure.write) throw new Error("write_failed");
      values.set(key,String(value));
    },
    removeItem:key=>{
      if(failure.remove) throw new Error("remove_failed");
      values.delete(key);
    }
  };
}
function loadAppTimer({storage=storageHarness(),ownerId=OWNER_A,draft=DRAFT}={}){
  const api=loadApi();
  const intervals=new Map();let nextInterval=1,vibrations=0,renders=0;
  const state={
    workoutDraftMemory:JSON.parse(JSON.stringify(draft)),
    timerSeconds:0,timerInterval:null,timerDeadline:null,
    restTimerPayload:null,restTimerGeneration:0,restTimerPersistenceFailed:false,
    workoutRestAnnouncement:null
  };
  const context={
    console,JSON,Date,Math,encodeURIComponent,
    REST_TIMER_STORAGE_PREFIX:"gymos:restTimer:",state,localStorage:storage,
    currentRoutineOwnerOrNull:()=>ownerId,
    activeWorkoutApi:()=>api,
    setInterval:callback=>{const id=nextInterval++;intervals.set(id,callback);return id;},
    clearInterval:id=>intervals.delete(id),
    document:{
      getElementById:()=>null,querySelector:()=>null
    },
    navigator:{vibrate:()=>{vibrations+=1;}},
    requestSafeActiveWorkoutRender:()=>{renders+=1;},
    updateTimerUI:()=>{},formatTimer:seconds=>String(seconds)
  };
  vm.createContext(context);
  vm.runInContext(restAppSource,context,{filename:"app-rest-timer.js"});
  return {
    api,state,storage,intervals,context,
    vibrations:()=>vibrations,renders:()=>renders,
    call:(name,...args)=>context[name](...args)
  };
}

test("deadline es la única verdad y saltarse ticks no introduce deriva",()=>{
  const api=loadApi();
  const payload=api.buildRestTimerPayload({
    ownerId:OWNER_A,workoutInstanceId:"workout-a",sessionId:"session-a",
    startedAtEpochMs:1_000,deadlineEpochMs:91_000,durationSeconds:90
  });
  assert.equal(api.restTimerRemaining(payload,1_000),90);
  assert.equal(api.restTimerRemaining(payload,31_001),60);
  assert.equal(api.restTimerRemaining(payload,95_000),0);
  assert.deepEqual(JSON.parse(JSON.stringify(api.restTimerModel({
    deadlineEpochMs:payload.deadlineEpochMs,now:31_001,running:false
  }))),{remainingSeconds:60,running:true,defaultSeconds:90,finished:false});
});

test("payload versionado valida números, coherencia e identidad completa",()=>{
  const api=loadApi();
  const payload=api.buildRestTimerPayload({
    ownerId:OWNER_A,workoutInstanceId:"workout-a",sessionId:"session-a",
    startedAtEpochMs:1_000,deadlineEpochMs:61_000,durationSeconds:60
  });
  assert.ok(payload);
  assert.equal(api.restTimerBelongsTo(payload,DRAFT),true);
  assert.equal(api.restTimerBelongsTo(payload,{...DRAFT,ownerId:OWNER_B}),false);
  assert.equal(api.restTimerBelongsTo(payload,{...DRAFT,workoutInstanceId:"workout-b"}),false);
  assert.equal(api.restTimerBelongsTo(payload,{...DRAFT,sessionId:"session-b"}),false);
  assert.equal(api.normalizeRestTimerPayload({...payload,version:2}),null);
  assert.equal(api.normalizeRestTimerPayload({...payload,deadlineEpochMs:60_000}),null);
});

test("restSeconds respeta prescripción, ejercicio, preferencia y fallback 90",()=>{
  const api=loadApi();
  assert.equal(api.effectiveRestSeconds({prescription:{restSeconds:120},restSeconds:90},60),120);
  assert.equal(api.effectiveRestSeconds({prescription:{restSeconds:999},restSeconds:75},60),75);
  assert.equal(api.effectiveRestSeconds({restSeconds:-1},180),180);
  assert.equal(api.effectiveRestSeconds({restSeconds:14},60),60);
  assert.equal(api.effectiveRestSeconds({restSeconds:15},60),15);
  assert.equal(api.effectiveRestSeconds({restSeconds:"inválido"},999),90);
});

test("iniciar persiste una sola vez y un nuevo descanso sustituye intervalo y payload",()=>{
  const timer=loadAppTimer();
  const first=timer.call("startTimer",60,DRAFT,1_000);
  const firstInterval=timer.state.timerInterval;
  assert.equal(first.deadlineEpochMs,61_000);
  assert.equal(timer.storage.values.size,1);
  const second=timer.call("startTimer",90,DRAFT,2_000);
  assert.equal(second.deadlineEpochMs,92_000);
  assert.equal(timer.intervals.has(firstInterval),false);
  assert.equal(timer.intervals.size,1);
  assert.equal(timer.storage.values.size,1);
});

test("reload restaura solo el owner, workout y session actuales",()=>{
  const storage=storageHarness();
  const first=loadAppTimer({storage});
  first.call("startTimer",90,DRAFT,1_000);
  const reloaded=loadAppTimer({storage});
  assert.ok(reloaded.call("restoreActiveRestTimer",DRAFT,{now:31_000}));
  assert.equal(reloaded.state.timerSeconds,60);
  assert.equal(reloaded.intervals.size,1);

  const wrongOwner=loadAppTimer({storage,ownerId:OWNER_B,draft:{...DRAFT,ownerId:OWNER_B}});
  assert.equal(wrongOwner.call("restoreActiveRestTimer",wrongOwner.state.workoutDraftMemory,{now:31_000}),null);
  const wrongWorkout=loadAppTimer({storage,draft:{...DRAFT,workoutInstanceId:"workout-b"}});
  assert.equal(wrongWorkout.call("restoreActiveRestTimer",wrongWorkout.state.workoutDraftMemory,{now:31_000}),null);
});

test("background reconcilia antes y después del vencimiento sin contar ticks",()=>{
  const timer=loadAppTimer();
  timer.call("startTimer",90,DRAFT,1_000);
  timer.call("restoreActiveRestTimer",DRAFT,{now:61_001,announceExpired:true});
  assert.equal(timer.state.timerSeconds,30);
  assert.equal(timer.vibrations(),0);
  timer.call("restoreActiveRestTimer",DRAFT,{now:92_000,announceExpired:true});
  assert.equal(timer.state.restTimerPayload,null);
  assert.equal(timer.storage.values.size,0);
  assert.equal(timer.vibrations(),1);
  timer.call("restoreActiveRestTimer",DRAFT,{now:93_000,announceExpired:true});
  assert.equal(timer.vibrations(),1);
});

test("deadline vencido al cargar se limpia sin reactivar ni avisar",()=>{
  const api=loadApi();
  const payload=api.buildRestTimerPayload({
    ...DRAFT,startedAtEpochMs:1_000,deadlineEpochMs:61_000,durationSeconds:60
  });
  const key=`gymos:restTimer:${encodeURIComponent(OWNER_A)}:workout-a`;
  const storage=storageHarness(new Map([[key,JSON.stringify(payload)]]));
  const timer=loadAppTimer({storage});
  assert.equal(timer.call("restoreActiveRestTimer",DRAFT,{now:70_000}),null);
  assert.equal(timer.storage.values.size,0);
  assert.equal(timer.vibrations(),0);
});

test("+30 cambia y persiste el deadline conservando identidad",()=>{
  const timer=loadAppTimer();
  timer.call("startTimer",60,DRAFT,1_000);
  const extended=timer.call("extendActiveRestTimer",30,20_000);
  assert.equal(extended.deadlineEpochMs,91_000);
  assert.equal(extended.ownerId,OWNER_A);
  assert.equal(extended.workoutInstanceId,"workout-a");
  assert.equal(JSON.parse([...timer.storage.values.values()][0]).deadlineEpochMs,91_000);
});

test("Omitir limpia memoria, intervalo y persistencia sin aviso posterior",()=>{
  const timer=loadAppTimer();
  timer.call("startTimer",60,DRAFT,1_000);
  const oldCallbacks=[...timer.intervals.values()];
  timer.call("clearActiveRestTimer",{removePersisted:true});
  oldCallbacks.forEach(callback=>callback());
  assert.equal(timer.state.restTimerPayload,null);
  assert.equal(timer.state.timerInterval,null);
  assert.equal(timer.storage.values.size,0);
  assert.equal(timer.vibrations(),0);
});

test("payload corrupto o lectura fallida degrada a timer legacy ausente",()=>{
  const key=`gymos:restTimer:${encodeURIComponent(OWNER_A)}:workout-a`;
  const corrupt=loadAppTimer({storage:storageHarness(new Map([[key,"{no-json"]]))});
  assert.equal(corrupt.call("restoreActiveRestTimer",DRAFT,{now:1_000}),null);
  assert.equal(corrupt.storage.values.size,0);
  const failed=loadAppTimer({storage:storageHarness(new Map(),{read:true})});
  assert.doesNotThrow(()=>failed.call("restoreActiveRestTimer",DRAFT,{now:1_000}));
  assert.equal(failed.state.restTimerPayload,null);
});

test("fallo de escritura mantiene countdown e intervalo en memoria",()=>{
  const timer=loadAppTimer({storage:storageHarness(new Map(),{write:true})});
  assert.doesNotThrow(()=>timer.call("startTimer",60,DRAFT,1_000));
  assert.equal(timer.state.timerSeconds,60);
  assert.ok(timer.state.restTimerPayload);
  assert.equal(timer.intervals.size,1);
  assert.equal(timer.state.restTimerPersistenceFailed,true);
});

test("app limpia descanso en finalización normal, idempotente y descarte",()=>{
  const finish=appSource.slice(
    appSource.indexOf("function finishWorkout()"),appSource.indexOf("function showRecordsCelebration(")
  );
  const discard=appSource.slice(
    appSource.indexOf('if(button?.matches("[data-confirm-discard-workout]"))'),
    appSource.indexOf('if(button?.matches("[data-workout-finish]"))')
  );
  assert.match(finish,/if\(existing\)[\s\S]*?clearActiveRestTimer\(\{removePersisted:true\}\)[\s\S]*?return/);
  assert.ok((finish.match(/clearActiveRestTimer\(\{removePersisted:true\}\)/g)||[]).length>=2);
  assert.match(discard,/clearDraft\(context\.sessionId\);[\s\S]*?clearActiveRestTimer\(\{removePersisted:true\}\)/);
});

test("completar serie usa duración efectiva y warm-up conserva el contrato actual",()=>{
  const binding=appSource.slice(
    appSource.indexOf("function bindActiveWorkoutEvents("),
    appSource.indexOf("function renderLegacyWorkout(")
  );
  assert.match(binding,/effectiveRestSeconds\([\s\S]*?beforeExercise,getRestSeconds\(\)/);
  assert.match(binding,/startRest=!wasDone&&!set\.warmup/);
  assert.match(binding,/if\(startRest\) startTimer\(restDuration\)/);
  assert.match(appSource,/workout-exercise-prescription[\s\S]*?\$\{restDuration\} s descanso/);
});

test("el timer queda local y fuera de workout-progress, Supabase y Service Worker",()=>{
  const progressSource=fs.readFileSync(path.join(root,"workout-progress.js"),"utf8");
  const workerSource=fs.readFileSync(path.join(root,"service-worker.js"),"utf8");
  assert.doesNotMatch(progressSource,/restTimer|restStartedAt|deadlineEpochMs/);
  assert.doesNotMatch(workerSource,/Notification|showNotification|notificationclick|restTimer/);
  assert.doesNotMatch(restAppSource,/supabase|syncNow|autoSync|markLocalUpdated/);
});
