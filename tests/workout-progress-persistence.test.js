const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const root=path.resolve(__dirname,"..");
const source=fs.readFileSync(path.join(root,"workout-progress.js"),"utf8");
const appSource=fs.readFileSync(path.join(root,"app.js"),"utf8");
const OWNER_A="11111111-1111-4111-8111-111111111111";
const OWNER_B="22222222-2222-4222-8222-222222222222";
const NOW="2026-07-30T10:00:00.000Z";

function api(){
  const context={JSON,Date,Number,String,Array,Map,Set,Math};
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(source,context,{filename:"workout-progress.js"});
  return context.GymOSWorkoutProgress;
}
function runtimeApi(){
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
function draft(owner=OWNER_A,{workout="workout-1",session="session-1"}={}){
  return {
    draftId:`draft-${workout}`,workoutInstanceId:workout,ownerId:owner,
    routineId:"routine-1",sessionId:session,startedAt:NOW,
    revision:1,updatedAt:NOW,clientInstanceId:"seed",status:"active",
    sessionTimer:{ownerId:owner,sessionId:session,status:"running",elapsedMs:0,startedAt:Date.parse(NOW)},
    exercises:[
      {
        exerciseId:"row",name:"Remo",exerciseInstanceId:`exercise-${workout}-row`,
        series:[
          {setInstanceId:`set-${workout}-row-1`,weight:"",reps:"",rir:"",done:false},
          {setInstanceId:`set-${workout}-row-2`,weight:"",reps:"",rir:"",done:false}
        ],notes:"",discomfort:""
      },
      {
        exerciseId:"press",name:"Press",exerciseInstanceId:`exercise-${workout}-press`,
        series:[{setInstanceId:`set-${workout}-press-1`,weight:"",reps:"",rir:"",done:false}],
        notes:"",discomfort:""
      }
    ]
  };
}
function edit(base,mutator,{time,client}){
  const engine=api();
  const candidate=JSON.parse(JSON.stringify(base));
  mutator(candidate);
  return engine.stampLocalChanges(base,candidate,{now:time,clientInstanceId:client}).draft;
}
function extractFunction(code,name){
  const start=code.indexOf(`function ${name}(`);
  assert.ok(start>=0,`No se encontrÃ³ ${name}`);
  const openParen=code.indexOf("(",start);
  let parenDepth=0,bodyStart=-1;
  for(let index=openParen;index<code.length;index++){
    if(code[index]==="(") parenDepth+=1;
    else if(code[index]===")"&&--parenDepth===0){
      bodyStart=code.indexOf("{",index);
      break;
    }
  }
  const brace=bodyStart;
  let depth=0,quote=null,escaped=false,templateDepth=0;
  for(let index=brace;index<code.length;index++){
    const character=code[index];
    if(quote){
      if(escaped){escaped=false;continue;}
      if(character==="\\"){escaped=true;continue;}
      if(quote==="`"&&character==="$"&&code[index+1]==="{"){
        templateDepth+=1;depth+=1;index+=1;continue;
      }
      if(character===quote&&templateDepth===0) quote=null;
      else if(quote==="`"&&character==="}"&&templateDepth>0){templateDepth-=1;depth-=1;}
      continue;
    }
    if(character==="'"||character==='"'||character==="`"){quote=character;continue;}
    if(character==="{") depth+=1;
    if(character==="}"&&--depth===0) return code.slice(start,index+1);
  }
  throw new Error(`FunciÃ³n incompleta: ${name}`);
}
function autosaveHarness({saveDraft}){
  const engine=api();
  const state={
    workoutDraftMemory:engine.normalizeDraft(draft(),{}),
    workoutDraftAutosaveTimer:null,
    workoutDraftOperationId:0,
    workoutDraftSaveStatus:"saved",
    workoutDraftLastError:null,
    workoutInlineMessage:null,
    workoutQuotaRecoveryInProgress:false
  };
  const context={
    state,Date,JSON,setTimeout,clearTimeout,
    navigator:{onLine:true},
    currentRoutineOwnerOrNull:()=>OWNER_A,
    workoutProgressApi:()=>engine,
    getWorkoutClientInstanceId:()=>"failure-test",
    updateWorkoutSaveIndicator:()=>{},
    updateActiveWorkoutInlineMessage:()=>{},
    setActiveWorkoutMessage:(type,text,options={})=>{
      state.workoutInlineMessage={type,text,...options};
    },
    isAppAuthenticated:()=>true,
    scheduleAutoSync:()=>{context.remoteRequests+=1;},
    saveDraft:value=>saveDraft(value,state),
    remoteRequests:0,
    compactionAttempts:0,
    localStorage:{getItem:key=>key==="gymos:syncPending"?"1":null}
  };
  context.classifyWorkoutPersistenceError=(error,options={})=>{
    if(error?.code) return error;
    const classified=new Error(options.fallback||"local_progress_write_failed");
    classified.code=options.fallback||"local_progress_write_failed";
    classified.phase=options.phase||"test";
    classified.cause=error;
    return classified;
  };
  context.workoutPersistenceError=(code,phase,cause)=>{
    const error=new Error(code);
    error.code=code;error.phase=phase;error.cause=cause;
    return error;
  };
  context.logWorkoutPersistenceError=error=>error;
  context.compactWorkoutStorageForQuota=()=>{
    context.compactionAttempts+=1;
    return {attempted:true,actions:[]};
  };
  context.handleWorkoutPersistenceFailure=error=>{
    state.workoutDraftLastError=error;
    state.workoutDraftSaveStatus="local_error";
    state.workoutInlineMessage={
      type:"error",
      text:error?.code==="storage_quota"
        ?"No hay espacio suficiente para guardar. Los cambios se conservan temporalmente en esta sesión. Mantén esta pantalla abierta y reintenta."
        :"Los cambios siguen en memoria.",
      retry:true
    };
    return error;
  };
  vm.createContext(context);
  vm.runInContext(
    `${extractFunction(appSource,"flushWorkoutDraftProgress")}
     ${extractFunction(appSource,"stageWorkoutDraft")}`,
    context
  );
  return {context,state,engine};
}

test("cada progreso se aísla por ownerId y workoutInstanceId",()=>{
  const engine=api();
  const a=engine.normalizeDraft(draft(OWNER_A),{});
  const b=engine.normalizeDraft(draft(OWNER_B),{});
  assert.notEqual(
    engine.progressStorageKey(a.ownerId,a.workoutInstanceId),
    engine.progressStorageKey(b.ownerId,b.workoutInstanceId)
  );
  assert.throws(()=>engine.mergeDrafts(a,b),/owner_mismatch/);
  const collection=engine.mergeCollections([a],[b],{owner:OWNER_A});
  assert.equal(collection.records.length,1);
  assert.equal(collection.records[0].ownerId,OWNER_A);
  assert.equal(collection.rejected.length,1);
});

test("dos propietarios entrenan en paralelo y recuperan solo su propia instancia",()=>{
  const engine=api();
  const storage=new Map();
  const userA=edit(engine.normalizeDraft(draft(OWNER_A),{}),value=>{
    value.exercises[0].series[0].weight="80";
    value.exercises[0].notes="Nota privada A";
  },{time:"2026-07-30T10:01:00.000Z",client:"device-a"});
  const userB=edit(engine.normalizeDraft(draft(OWNER_B,{workout:"workout-b"}),{}),value=>{
    value.exercises[1].series[0].reps="12";
    value.exercises[1].notes="Nota privada B";
  },{time:"2026-07-30T10:02:00.000Z",client:"device-b"});
  storage.set(engine.progressStorageKey(userA.ownerId,userA.workoutInstanceId),JSON.stringify(userA));
  storage.set(engine.progressStorageKey(userB.ownerId,userB.workoutInstanceId),JSON.stringify(userB));

  const restoredA=JSON.parse(storage.get(engine.progressStorageKey(OWNER_A,"workout-1")));
  const restoredB=JSON.parse(storage.get(engine.progressStorageKey(OWNER_B,"workout-b")));
  assert.equal(restoredA.exercises[0].series[0].weight,"80");
  assert.equal(restoredB.exercises[1].series[0].reps,"12");
  assert.equal(restoredA.exercises[0].notes,"Nota privada A");
  assert.equal(restoredB.exercises[1].notes,"Nota privada B");
  assert.equal(restoredA.ownerId,OWNER_A);
  assert.equal(restoredB.ownerId,OWNER_B);
  assert.doesNotMatch(engine.progressStorageKey(OWNER_A,"workout-1"),new RegExp(OWNER_B));
  assert.doesNotMatch(engine.progressStorageKey(OWNER_B,"workout-b"),new RegExp(OWNER_A));
});

test("normalizar añade identidades estables a entrenamiento, ejercicios y series",()=>{
  const engine=api();
  const legacy=draft();
  delete legacy.workoutInstanceId;
  legacy.exercises.forEach(exercise=>{
    delete exercise.exerciseInstanceId;
    exercise.series.forEach(set=>delete set.setInstanceId);
  });
  const first=engine.normalizeDraft(legacy,{});
  const second=engine.normalizeDraft(legacy,{});
  assert.equal(first.workoutInstanceId,legacy.draftId);
  assert.deepEqual(
    JSON.parse(JSON.stringify(first.exercises.map(item=>[
      item.exerciseInstanceId,item.series.map(set=>set.setInstanceId)
    ]))),
    JSON.parse(JSON.stringify(second.exercises.map(item=>[
      item.exerciseInstanceId,item.series.map(set=>set.setInstanceId)
    ])))
  );
});

test("un draft nuevo conserva startedAt nulo hasta empezar la sesión",()=>{
  const engine=api();
  const fresh=draft();
  fresh.startedAt=null;
  fresh.sessionTimer={
    ownerId:OWNER_A,sessionId:"session-1",
    status:"idle",running:false,elapsedMs:0,startedAt:null
  };
  const normalized=engine.normalizeDraft(fresh,{
    now:"2026-07-30T12:00:00.000Z"
  });
  assert.equal(normalized.startedAt,null);
  assert.equal(normalized.sessionTimer.status,"idle");
  assert.equal(normalized.sessionTimer.startedAt,null);
});

test("dos pestañas fusionan cambios en ejercicios diferentes sin perder ninguno",()=>{
  const engine=api();
  const base=engine.normalizeDraft(draft(),{});
  const tabA=edit(base,value=>{
    value.exercises[0].series[0].weight="72.5";
    value.exercises[0].series[0].reps="10";
  },{time:"2026-07-30T10:01:00.000Z",client:"tab-a"});
  const tabB=edit(base,value=>{
    value.exercises[1].series[0].weight="24";
    value.exercises[1].series[0].reps="12";
  },{time:"2026-07-30T10:01:05.000Z",client:"tab-b"});
  const merged=engine.mergeDrafts(tabA,tabB).draft;
  assert.equal(merged.exercises[0].series[0].weight,"72.5");
  assert.equal(merged.exercises[0].series[0].reps,"10");
  assert.equal(merged.exercises[1].series[0].weight,"24");
  assert.equal(merged.exercises[1].series[0].reps,"12");
});

test("dos dispositivos conservan sustituciones, nuevas series y borrados por identidad",()=>{
  const engine=api();
  const base=engine.normalizeDraft(draft(),{});
  const deviceA=JSON.parse(JSON.stringify(base));
  deviceA.exercises[0].name="Remo con apoyo";
  deviceA.exercises[0].exerciseId="row-supported";
  deviceA.exercises[0].substitution={mode:"temporary",plannedExerciseId:"row"};
  deviceA.exercises[0].series.push({
    setInstanceId:"set-device-a-new",weight:"75",reps:"8",rir:"2",done:true
  });
  const stampedA=engine.stampLocalChanges(base,deviceA,{
    now:"2026-07-30T10:03:00.000Z",clientInstanceId:"device-a"
  }).draft;
  const deviceB=JSON.parse(JSON.stringify(base));
  deviceB.exercises[1].series=[];
  const stampedB=engine.stampLocalChanges(base,deviceB,{
    now:"2026-07-30T10:04:00.000Z",clientInstanceId:"device-b"
  }).draft;
  const merged=engine.mergeDrafts(stampedA,stampedB).draft;
  assert.equal(merged.exercises[0].name,"Remo con apoyo");
  assert.equal(merged.exercises[0].substitution.mode,"temporary");
  assert.ok(merged.exercises[0].series.some(set=>set.setInstanceId==="set-device-a-new"));
  assert.equal(merged.exercises[1].series.length,0);
  assert.ok(merged.exercises[1].deletedSetInstanceIds.includes("set-workout-1-press-1"));
  assert.deepEqual(
    JSON.parse(JSON.stringify(engine.mergeDrafts(merged,base).draft)),
    JSON.parse(JSON.stringify(merged))
  );
});

test("series extra: varias identidades sobreviven recarga, dos pestañas y remoto antiguo",()=>{
  const engine=api();
  const base=engine.normalizeDraft(draft(),{});
  const withExtras=JSON.parse(JSON.stringify(base));
  withExtras.exercises[0].series.push(
    {
      setInstanceId:"set-extra-a",ownerId:OWNER_A,
      workoutInstanceId:base.workoutInstanceId,
      exerciseInstanceId:base.exercises[0].exerciseInstanceId,
      planned:false,source:"manual_extra",createdAt:"2026-07-30T10:01:00.000Z",
      target:"8–10",targetRir:"2",restSeconds:90,type:"peso",
      weight:"",reps:"",rir:"",done:false
    },
    {
      setInstanceId:"set-extra-b",ownerId:OWNER_A,
      workoutInstanceId:base.workoutInstanceId,
      exerciseInstanceId:base.exercises[0].exerciseInstanceId,
      planned:false,source:"manual_extra",createdAt:"2026-07-30T10:02:00.000Z",
      target:"8–10",targetRir:"2",restSeconds:90,type:"peso",
      weight:"",reps:"",rir:"",done:false
    }
  );
  const local=engine.stampLocalChanges(base,withExtras,{
    now:"2026-07-30T10:02:00.000Z",clientInstanceId:"device-a"
  }).draft;
  const otherTab=JSON.parse(JSON.stringify(base));
  otherTab.exercises[1].series[0].weight="45";
  const remote=engine.stampLocalChanges(base,otherTab,{
    now:"2026-07-30T10:03:00.000Z",clientInstanceId:"device-b"
  }).draft;
  const merged=engine.mergeDrafts(local,remote).draft;
  const reloaded=engine.normalizeDraft(JSON.parse(JSON.stringify(merged)),{});
  assert.deepEqual(
    reloaded.exercises[0].series.filter(set=>set.planned===false).map(set=>set.setInstanceId),
    ["set-extra-a","set-extra-b"]
  );
  assert.equal(reloaded.exercises[0].sets,2);
  assert.equal(reloaded.exercises[1].series[0].weight,"45");
  const afterOldRemote=engine.mergeDrafts(reloaded,base).draft;
  assert.equal(afterOldRemote.exercises[0].series.filter(set=>set.planned===false).length,2);
});

test("ficha pendiente: plegado y selección sobreviven recarga sin perder progreso",()=>{
  const engine=api();
  const base=engine.normalizeDraft(draft(),{});
  const recording=JSON.parse(JSON.stringify(base));
  recording.exercises[0].series[0].weight="72.5";
  recording.exercises[0].series[0].reps="9";
  recording.exercises[0].series[0].rir="2";
  recording.exercises[0].notes="Mantener la técnica";
  const withResults=engine.stampLocalChanges(base,recording,{
    now:"2026-07-30T10:01:00.000Z",clientInstanceId:"device-a"
  }).draft;
  const dismissedInput=JSON.parse(JSON.stringify(withResults));
  dismissedInput.exercises[0].libraryResolutionDismissed=true;
  const dismissed=engine.stampLocalChanges(withResults,dismissedInput,{
    now:"2026-07-30T10:02:00.000Z",clientInstanceId:"device-a"
  }).draft;
  const reloaded=engine.normalizeDraft(JSON.parse(JSON.stringify(dismissed)),{});
  assert.equal(reloaded.exercises[0].libraryResolutionDismissed,true);
  const progressBefore=JSON.stringify({
    series:reloaded.exercises[0].series,
    notes:reloaded.exercises[0].notes,
    completedAt:reloaded.exercises[0].completedAt
  });
  const selectedInput=JSON.parse(JSON.stringify(reloaded));
  selectedInput.exercises[0].resolvedLibraryExerciseId="press-maquina";
  selectedInput.exercises[0].libraryResolutionDismissed=false;
  const selected=engine.stampLocalChanges(reloaded,selectedInput,{
    now:"2026-07-30T10:03:00.000Z",clientInstanceId:"device-a"
  }).draft;
  assert.equal(selected.exercises[0].resolvedLibraryExerciseId,"press-maquina");
  assert.equal(selected.exercises[0].libraryResolutionDismissed,false);
  assert.equal(JSON.stringify({
    series:selected.exercises[0].series,
    notes:selected.exercises[0].notes,
    completedAt:selected.exercises[0].completedAt
  }),progressBefore);
});

test("serie extra eliminada genera tombstone y no reaparece desde una respuesta antigua",()=>{
  const engine=api();
  const base=engine.normalizeDraft(draft(),{});
  const added=JSON.parse(JSON.stringify(base));
  added.exercises[0].series.push({
    setInstanceId:"set-extra-delete",ownerId:OWNER_A,
    workoutInstanceId:base.workoutInstanceId,
    exerciseInstanceId:base.exercises[0].exerciseInstanceId,
    planned:false,source:"manual_extra",createdAt:"2026-07-30T10:01:00.000Z",
    weight:"70",reps:"9",rir:"2",done:false
  });
  const saved=engine.stampLocalChanges(base,added,{
    now:"2026-07-30T10:01:00.000Z",clientInstanceId:"offline-tab"
  }).draft;
  const removed=JSON.parse(JSON.stringify(saved));
  removed.exercises[0].series=removed.exercises[0].series.filter(
    set=>set.setInstanceId!=="set-extra-delete"
  );
  const deleted=engine.stampLocalChanges(saved,removed,{
    now:"2026-07-30T10:02:00.000Z",clientInstanceId:"offline-tab"
  }).draft;
  const tombstone=deleted.exercises[0].deletedSetTombstones.find(
    item=>item.setInstanceId==="set-extra-delete"
  );
  assert.equal(tombstone.ownerId,OWNER_A);
  assert.equal(tombstone.workoutInstanceId,base.workoutInstanceId);
  assert.equal(tombstone.exerciseInstanceId,base.exercises[0].exerciseInstanceId);
  assert.equal(engine.mergeDrafts(deleted,saved).draft.exercises[0].series.some(
    set=>set.setInstanceId==="set-extra-delete"
  ),false);
});

test("una respuesta remota antigua no elimina un valor local más reciente",()=>{
  const engine=api();
  const base=engine.normalizeDraft(draft(),{});
  const older=edit(base,value=>{
    value.exercises[0].series[0].weight="60";
  },{time:"2026-07-30T10:01:00.000Z",client:"remote"});
  const newer=edit(base,value=>{
    value.exercises[0].series[0].weight="70";
  },{time:"2026-07-30T10:02:00.000Z",client:"local"});
  const once=engine.mergeDrafts(newer,older).draft;
  const twice=engine.mergeDrafts(once,older).draft;
  assert.equal(once.exercises[0].series[0].weight,"70");
  assert.deepEqual(JSON.parse(JSON.stringify(twice)),JSON.parse(JSON.stringify(once)));
});

test("un conflicto simultáneo del mismo campo se conserva y se resuelve de forma explícita",()=>{
  const engine=api();
  const base=engine.normalizeDraft(draft(),{});
  const left=edit(base,value=>{
    value.exercises[0].series[0].reps="8";
  },{time:"2026-07-30T10:01:00.000Z",client:"tab-a"});
  const right=edit(base,value=>{
    value.exercises[0].series[0].reps="10";
  },{time:"2026-07-30T10:01:00.000Z",client:"tab-b"});
  const result=engine.mergeDrafts(left,right);
  assert.ok(["8","10"].includes(result.draft.exercises[0].series[0].reps));
  assert.ok(result.conflicts.some(conflict=>conflict.path.endsWith(".reps")));
  assert.equal(result.conflicts.find(conflict=>conflict.path.endsWith(".reps")).variants.length,2);
});

test("completar una serie y un ejercicio sobrevive a recarga y trabajo offline",()=>{
  const engine=api();
  const base=engine.normalizeDraft(draft(),{});
  const completed=edit(base,value=>{
    const set=value.exercises[0].series[0];
    set.weight="70";set.reps="10";set.rir="2";set.done=true;
    value.exercises[0].completedAt="2026-07-30T10:03:00.000Z";
  },{time:"2026-07-30T10:03:00.000Z",client:"offline-device"});
  const serialized=JSON.stringify(completed);
  const restored=engine.normalizeDraft(JSON.parse(serialized),{});
  assert.equal(restored.exercises[0].series[0].done,true);
  assert.equal(restored.exercises[0].series[0].weight,"70");
  assert.equal(restored.exercises[0].completedAt,"2026-07-30T10:03:00.000Z");
  assert.equal(restored.status,"active");
});

test("cerrar sin finalizar conserva activo y finalizar no duplica identidad",()=>{
  const engine=api();
  const active=engine.normalizeDraft(draft(),{});
  const reopened=engine.normalizeDraft(JSON.parse(JSON.stringify(active)),{});
  assert.equal(reopened.status,"active");
  assert.equal(reopened.workoutInstanceId,active.workoutInstanceId);
  const finalized=engine.normalizeDraft({
    ...reopened,status:"finalized",completedAt:"2026-07-30T11:00:00.000Z"
  },{});
  const collection=engine.mergeCollections([finalized],[finalized],{owner:OWNER_A});
  assert.equal(collection.records.length,1);
});

test("dos a seis sesiones mantienen instancias independientes",()=>{
  const engine=api();
  for(let count=2;count<=6;count++){
    const records=Array.from({length:count},(_,index)=>
      engine.normalizeDraft(draft(OWNER_A,{
        workout:`workout-${count}-${index+1}`,session:`session-${index+1}`
      }),{})
    );
    assert.equal(new Set(records.map(item=>item.workoutInstanceId)).size,count);
    assert.equal(new Set(records.map(item=>item.sessionId)).size,count);
    assert.ok(records.every(item=>item.ownerId===OWNER_A));
  }
});

test("la integración usa debounce, flush de ciclo de vida y un writer canónico",()=>{
  assert.match(appSource,/setTimeout\(\(\)=>\{[\s\S]*?\},400\)/);
  assert.match(appSource,/visibilityState==="hidden"[\s\S]*?flushWorkoutDraftProgress/);
  assert.match(appSource,/addEventListener\("pagehide"/);
  assert.match(appSource,/addEventListener\("storage"/);
  assert.match(appSource,/data-workout-save-status/);
  assert.match(appSource,/data-complete-active-exercise/);
  assert.match(appSource,/workout\.workoutInstanceId=d\.workoutInstanceId/);
  assert.match(appSource,/workoutId:d\.workoutInstanceId/);
  assert.match(appSource,/createPendingCheckin\?\.\(workout,\{mark:false,sync:false\}\)/);
});

test("guardar progreso no modifica rutina y el cronómetro no escribe cada segundo",()=>{
  const autosave=appSource.slice(
    appSource.indexOf("function workoutSaveStatusLabel("),
    appSource.indexOf("function clearDraft(")
  );
  assert.doesNotMatch(autosave,/saveRoutine|saveCanonicalRoutine|saveHistory/);
  const timer=appSource.slice(
    appSource.indexOf("function updateWorkoutSessionElapsed("),
    appSource.indexOf("function activeWorkoutExerciseKey(")
  );
  assert.doesNotMatch(timer,/saveDraft|localStorage|markLocalUpdated|autoSync/);
});

test("serie, ejercicio y navegaciÃ³n aplican la polÃ­tica de guardado requerida",()=>{
  assert.match(appSource,/data-complete-active-set[\s\S]*?\{immediate:true,scheduleSync:true,exerciseInstanceId\}/);
  assert.match(appSource,/data-complete-active-exercise[\s\S]*?completedAt=new Date\(\)\.toISOString\(\)[\s\S]*?\{immediate:true,scheduleSync:true,exerciseInstanceId\}/);
  const bindingStart=appSource.indexOf("function bindActiveWorkoutEvents(");
  const toggle=appSource.slice(
    appSource.indexOf("data-workout-toggle-exercise",bindingStart),
    appSource.indexOf("data-workout-reference",bindingStart)
  );
  assert.doesNotMatch(toggle,/persist\(|stageWorkoutDraft|saveDraft|markLocalUpdated/);
  assert.doesNotMatch(appSource.slice(bindingStart),/data-workout-previous|data-workout-next(?!-pending)/);
  const reviewOffset=appSource.indexOf("data-workout-review",bindingStart);
  assert.match(
    appSource.slice(reviewOffset,reviewOffset+500),
    /flushWorkoutDraftProgress\(\{scheduleSync:false\}\)/
  );
  assert.match(appSource,/Ejercicio guardado\./);
});

test("cambiar de propietario vacÃ­a el debounce antes del vault y no borra su progreso",()=>{
  const activation=appSource.slice(
    appSource.indexOf("function activateLocalUser("),
    appSource.indexOf("function deactivateLocalUser(")
  );
  assert.ok(
    activation.indexOf("flushWorkoutDraftProgress")<
    activation.indexOf("saveCurrentUserVault(previous)")
  );
  const deactivation=appSource.slice(
    appSource.indexOf("function deactivateLocalUser("),
    appSource.indexOf("function removeOwnerRecoveryReminderData(")
  );
  assert.ok(
    deactivation.indexOf("flushWorkoutDraftProgress")<
    deactivation.indexOf("saveCurrentUserVault(current)")
  );
  assert.doesNotMatch(activation,/removeOwnerWorkoutProgressData/);
  assert.doesNotMatch(deactivation,/removeOwnerWorkoutProgressData/);
  const localKeys=appSource.slice(
    appSource.indexOf("function localDataKeys("),
    appSource.indexOf("function snapshotCurrentLocalData(")
  );
  assert.doesNotMatch(localKeys,/workoutProgress|activeWorkout/);
});

test("finalizar es idempotente y conserva el check-in dentro de la transacciÃ³n",()=>{
  const finish=appSource.slice(
    appSource.indexOf("function finishWorkout("),
    appSource.indexOf("function showRecordsCelebration(")
  );
  assert.match(finish,/workout\.workoutInstanceId===d\.workoutInstanceId\|\|workout\.draftId===d\.draftId/);
  assert.match(finish,/item\.workoutInstanceId===d\.workoutInstanceId\|\|item\.draftId===d\.draftId/);
  assert.match(finish,/createPendingCheckin\?\.\(workout,\{mark:false,sync:false\}\)/);
  assert.match(finish,/status:"finalized"/);
  assert.match(finish,/clearDraft\(s,\{mark:false,preserveProgress:true\}\)/);
  assert.ok(
    finish.indexOf("mergeWorkoutHistory")<
    finish.lastIndexOf("clearDraft(s,{mark:false,preserveProgress:true})")
  );
});

test("notas rápidas actualizan memoria y producen una sola persistencia debounced",async()=>{
  const engine=api();
  const state={
    workoutDraftMemory:engine.normalizeDraft(draft(),{}),
    workoutDraftAutosaveTimer:null,workoutDraftOperationId:0,
    workoutDraftSaveStatus:"saved"
  };
  let writes=0,lastSaved=null,remoteRequests=0,renders=0;
  const context={
    state,Date,JSON,setTimeout,clearTimeout,
    navigator:{onLine:false},
    currentRoutineOwnerOrNull:()=>OWNER_A,
    workoutProgressApi:()=>engine,
    getWorkoutClientInstanceId:()=>"typing-client",
    updateWorkoutSaveIndicator:()=>{},
    saveDraft:value=>{writes+=1;lastSaved=JSON.parse(JSON.stringify(value));},
    isAppAuthenticated:()=>false,
    scheduleAutoSync:()=>{remoteRequests+=1;},
    renderWorkout:()=>{renders+=1;}
  };
  vm.createContext(context);
  vm.runInContext(
    `${extractFunction(appSource,"flushWorkoutDraftProgress")}
     ${extractFunction(appSource,"stageWorkoutDraft")}`,
    context
  );
  for(const value of ["N","No","Nota","Nota exacta"]){
    const candidate=JSON.parse(JSON.stringify(state.workoutDraftMemory));
    candidate.exercises[0].notes=value;
    context.candidate=candidate;
    vm.runInContext("stageWorkoutDraft(candidate)",context);
  }
  assert.equal(state.workoutDraftMemory.exercises[0].notes,"Nota exacta");
  assert.equal(writes,0);
  await new Promise(resolve=>setTimeout(resolve,450));
  assert.equal(writes,1);
  assert.equal(lastSaved.exercises[0].notes,"Nota exacta");
  assert.equal(remoteRequests,0);
  assert.equal(renders,0);
  const restored=engine.normalizeDraft(JSON.parse(JSON.stringify(lastSaved)),{});
  assert.equal(restored.exercises[0].notes,"Nota exacta");
});

test("una operación debounced obsoleta se descarta con código seguro y no escribe",async()=>{
  let writes=0;
  const {context,state}=autosaveHarness({
    saveDraft(){writes+=1;}
  });
  const candidate=JSON.parse(JSON.stringify(state.workoutDraftMemory));
  candidate.exercises[0].series[0].weight="55";
  context.candidate=candidate;
  vm.runInContext("stageWorkoutDraft(candidate)",context);
  state.workoutDraftOperationId+=1;
  await new Promise(resolve=>setTimeout(resolve,450));
  assert.equal(writes,0);
  assert.deepEqual(JSON.parse(JSON.stringify(state.workoutLastDiscardedOperation)),{
    code:"stale_operation",phase:"autosave_debounce"
  });
  assert.equal(state.workoutDraftMemory.exercises[0].series[0].weight,"55");
});

test("campos rápidos guardan una vez y programan una sola sincronización posterior",async()=>{
  let writes=0;
  const {context,state}=autosaveHarness({
    saveDraft(value,currentState){
      writes+=1;
      currentState.workoutDraftMemory=JSON.parse(JSON.stringify(value));
      currentState.workoutDraftLastError=null;
      currentState.workoutDraftSaveStatus="pending_sync";
    }
  });
  for(const [weight,reps] of [["8",""],["82","1"],["82.5","10"]]){
    const candidate=JSON.parse(JSON.stringify(state.workoutDraftMemory));
    candidate.exercises[0].series[0].weight=weight;
    candidate.exercises[0].series[0].reps=reps;
    context.candidate=candidate;
    vm.runInContext(
      "stageWorkoutDraft(candidate,{scheduleSync:true})",
      context
    );
  }
  assert.equal(state.workoutDraftMemory.exercises[0].series[0].weight,"82.5");
  assert.equal(state.workoutDraftMemory.exercises[0].series[0].reps,"10");
  assert.equal(context.remoteRequests,0);
  await new Promise(resolve=>setTimeout(resolve,450));
  assert.equal(writes,1);
  assert.equal(context.remoteRequests,1);
});

test("el input de notas no reconstruye la vista y blur o salida fuerzan flush",()=>{
  const binding=appSource.slice(
    appSource.indexOf("function bindActiveWorkoutEvents("),
    appSource.indexOf("function renderLegacyWorkout(")
  );
  const inputBranch=binding.slice(
    binding.indexOf('main.addEventListener("input"'),
    binding.indexOf('main.addEventListener("change"')
  );
  assert.match(inputBranch,/data-active-workout-notes/);
  assert.match(inputBranch,/stageWorkoutDraft|persist\(/);
  assert.match(inputBranch,/scheduleSync:true/);
  assert.doesNotMatch(inputBranch,/renderWorkout|innerHTML|replaceWith|saveCurrentUserVault|autoSync/);
  assert.match(binding,/main\.addEventListener\("focusout"[\s\S]*?flushWorkoutDraftProgress/);
  assert.match(binding,/data-workout-back[\s\S]*?flushWorkoutDraftProgress/);
  assert.match(binding,/data-complete-active-exercise[\s\S]*?immediate:true,scheduleSync:true/);
  assert.match(appSource,/function navigateToScreen[\s\S]*?state\.screen==="workout"[\s\S]*?flushWorkoutDraftProgress/);
  assert.match(appSource,/visibilityState==="hidden"[\s\S]*?flushWorkoutDraftProgress/);
  assert.match(appSource,/addEventListener\("pagehide"[\s\S]*?flushWorkoutDraftProgress/);
});

test("migración RC.2 conserva resultados, notas, sustitución, timer y foco con IDs estables",()=>{
  const engine=api();
  const legacy=draft();
  delete legacy.workoutInstanceId;
  delete legacy.revision;
  delete legacy.clientInstanceId;
  legacy.currentExerciseIndex=1;
  legacy.exercises[0].notes="Nota RC.2";
  legacy.exercises[0].substitution={
    mode:"temporary",performedExerciseId:"row-supported",
    plannedExerciseId:"row"
  };
  legacy.exercises[0].series[0]={weight:"82.5",reps:"9",rir:"2",done:true};
  legacy.sessionTimer={status:"paused",elapsedMs:754321,startedAt:null};
  legacy.exercises.forEach(exercise=>{
    delete exercise.exerciseInstanceId;
    exercise.series.forEach(set=>delete set.setInstanceId);
  });
  const first=engine.normalizeDraft(legacy,{
    owner:OWNER_A,sessionId:"session-1",routineId:"routine-1",
    now:NOW,clientInstanceId:"migration"
  });
  const second=engine.normalizeDraft(legacy,{
    owner:OWNER_A,sessionId:"session-1",routineId:"routine-1",
    now:NOW,clientInstanceId:"migration"
  });
  assert.equal(first.workoutInstanceId,legacy.draftId);
  assert.equal(first.currentExerciseIndex,1);
  assert.equal(first.currentExerciseInstanceId,first.exercises[1].exerciseInstanceId);
  assert.equal(first.exercises[0].notes,"Nota RC.2");
  assert.equal(first.exercises[0].substitution.mode,"temporary");
  assert.equal(first.exercises[0].series[0].weight,"82.5");
  assert.equal(first.exercises[0].series[0].reps,"9");
  assert.equal(first.exercises[0].series[0].rir,"2");
  assert.equal(first.sessionTimer.elapsedMs,754321);
  assert.deepEqual(JSON.parse(JSON.stringify(second)),JSON.parse(JSON.stringify(first)));
});

test("migración RC.2 parcial, repetida y de 2–6 ejercicios permanece determinista",()=>{
  const engine=api();
  for(let exerciseCount=2;exerciseCount<=6;exerciseCount++){
    const legacy=draft(OWNER_A,{workout:`legacy-${exerciseCount}`});
    delete legacy.workoutInstanceId;
    legacy.exercises=Array.from({length:exerciseCount},(_,index)=>({
      exerciseId:`exercise-${index+1}`,name:`Ejercicio ${index+1}`,
      notes:index===0?"parcial":"",
      series:[{weight:index===0?"40":"",reps:index===0?"8":"",rir:""}]
    }));
    const migrated=engine.normalizeDraft(legacy,{});
    const repeated=engine.mergeDrafts(migrated,engine.normalizeDraft(legacy,{})).draft;
    assert.equal(migrated.exercises.length,exerciseCount);
    assert.equal(new Set(migrated.exercises.map(item=>item.exerciseInstanceId)).size,exerciseCount);
    assert.deepEqual(JSON.parse(JSON.stringify(repeated)),JSON.parse(JSON.stringify(migrated)));
  }
  assert.throws(
    ()=>engine.normalizeDraft({...draft(),ownerId:"otro-propietario"},{}),
    /invalid_owner/
  );
  assert.throws(()=>engine.normalizeDraft({ownerId:OWNER_A},{}));
});

test("migración RC.2 es transaccional, owner-scoped y no crea historial ni Recuperación",()=>{
  const migration=appSource.slice(
    appSource.indexOf("function ensureWorkoutProgressMigration("),
    appSource.indexOf("function mergeIncomingWorkoutProgress(")
  );
  const write=migration.indexOf("localStorage.setItem(progressKey");
  const verify=migration.indexOf("workout_progress_verification_failed");
  const pointer=migration.indexOf("storeWorkoutProgressRecord(progress");
  const legacy=migration.indexOf("localStorage.setItem(CANONICAL_DRAFTS_KEY");
  const marker=migration.indexOf("localStorage.setItem(markerKey");
  assert.ok(write>=0&&write<verify&&verify<pointer&&pointer<legacy&&legacy<marker);
  assert.match(migration,/legacy\.ownerId!==normalizedOwner/);
  assert.match(migration,/restoreOwnerWorkoutProgressStorage/);
  assert.match(migration,/restoreStorageValue\(CANONICAL_DRAFTS_KEY/);
  assert.doesNotMatch(migration,/saveHistory|gymos:history|createPendingCheckin|GymOSRecovery/);
  assert.match(appSource,/ensureRoutineSessionMigration[\s\S]*?ensureWorkoutProgressMigration/);
});

test("punteros activos convergen sin mezclar workoutInstanceId distintos",()=>{
  const engine=api();
  const base={
    ownerId:OWNER_A,sessionId:"session-1",workoutInstanceId:"workout-local",
    updatedAt:"2026-07-30T10:00:00.000Z",revision:3,clientInstanceId:"device-local"
  };
  const sameRemote={
    ...base,updatedAt:"2026-07-30T10:02:00.000Z",revision:4,
    clientInstanceId:"device-remote"
  };
  assert.equal(
    engine.selectActivePointer(base,sameRemote).pointer.workoutInstanceId,
    "workout-local"
  );
  const competing={
    ...sameRemote,workoutInstanceId:"workout-remote",
    updatedAt:"2026-07-30T10:03:00.000Z"
  };
  const online=engine.selectActivePointer(base,competing);
  assert.equal(online.pointer.workoutInstanceId,"workout-remote");
  assert.equal(online.conflict.code,"competing_workout_instances");
  const offline=engine.selectActivePointer(base,competing,{localPending:true});
  assert.equal(offline.pointer.workoutInstanceId,"workout-local");
  assert.equal(offline.conflict.code,"competing_workout_instances");
  assert.throws(
    ()=>engine.mergeDrafts(draft(OWNER_A,{workout:"one"}),draft(OWNER_A,{workout:"two"})),
    /workout_instance_mismatch/
  );
});

test("punteros separan sesiones, propietarios y arranques simultáneos de forma estable",()=>{
  const engine=api();
  const sessionA={
    ownerId:OWNER_A,sessionId:"session-1",workoutInstanceId:"workout-a",
    updatedAt:NOW,revision:1,clientInstanceId:"tab-a"
  };
  const sessionB={...sessionA,sessionId:"session-2",workoutInstanceId:"workout-b"};
  assert.throws(()=>engine.selectActivePointer(sessionA,sessionB),/session_mismatch/);
  assert.throws(
    ()=>engine.selectActivePointer(sessionA,{...sessionA,ownerId:OWNER_B}),
    /owner_mismatch/
  );
  const tabB={...sessionA,workoutInstanceId:"workout-b",clientInstanceId:"tab-b"};
  const forward=engine.selectActivePointer(sessionA,tabB);
  const reverse=engine.selectActivePointer(tabB,sessionA);
  assert.equal(forward.pointer.workoutInstanceId,reverse.pointer.workoutInstanceId);
  assert.ok(forward.conflict&&reverse.conflict);
});

test("merge usa metadatos por campo y tombstones causales owner-scoped",()=>{
  const engine=api();
  const base=engine.normalizeDraft(draft(),{});
  const local=edit(base,value=>{
    value.exercises[0].notes="Nueva";
    value.exercises[0].series=value.exercises[0].series.slice(1);
  },{time:"2026-07-30T10:05:00.000Z",client:"local"});
  const old=edit(base,value=>{
    value.exercises[1].notes="Otro ejercicio";
  },{time:"2026-07-30T10:01:00.000Z",client:"remote"});
  const merged=engine.mergeDrafts(local,old).draft;
  const noteMeta=merged.exercises[0]._fieldMeta.notes;
  const tombstone=merged.exercises[0].deletedSetTombstones[0];
  assert.equal(noteMeta.updatedAt,"2026-07-30T10:05:00.000Z");
  assert.equal(noteMeta.clientInstanceId,"local");
  assert.equal(merged.exercises[0].notes,"Nueva");
  assert.equal(tombstone.ownerId,OWNER_A);
  assert.equal(tombstone.workoutInstanceId,base.workoutInstanceId);
  assert.equal(tombstone.exerciseInstanceId,base.exercises[0].exerciseInstanceId);
  assert.equal(tombstone.updatedAt,"2026-07-30T10:05:00.000Z");
  assert.ok(tombstone.revision>=2);
  assert.deepEqual(
    merged.exercises.map(item=>item.exerciseInstanceId),
    base.exercises.map(item=>item.exerciseInstanceId)
  );
  assert.ok(merged.conflicts.every(item=>item.ownerId===OWNER_A));

  const finalized=engine.normalizeDraft({
    ...merged,status:"finalized",completedAt:"2026-07-30T11:00:00.000Z",
    updatedAt:"2026-07-30T11:00:00.000Z",revision:merged.revision+1
  },{});
  assert.equal(finalized.deletedExerciseTombstones.length,0);
  assert.ok(finalized.exercises.every(item=>item.deletedSetTombstones.length===0));
});

test("integración técnica mantiene un consumidor, un listener storage y aislamiento asíncrono",()=>{
  const indexSource=fs.readFileSync(path.join(root,"index.html"),"utf8");
  const workerSource=fs.readFileSync(path.join(root,"service-worker.js"),"utf8");
  const progressIndex=indexSource.indexOf('<script src="workout-progress.js"></script>');
  const appIndex=indexSource.indexOf('src="app.js?v=');
  assert.ok(progressIndex>=0&&progressIndex<appIndex);
  assert.match(workerSource,/const GYMOS_BUILD_VERSION="4\.2\.0-rc\.9-adoption916"/);
  assert.match(workerSource,/"workout-progress\.js"/);
  assert.equal((appSource.match(/addEventListener\("storage"/g)||[]).length,1);
  assert.match(appSource,/state\.syncOperationId\+=1/);
  assert.match(appSource,/state\.workoutDraftOperationId=.*\+1/);
  assert.match(appSource,/assertActiveLocalOwner\(ownerId\)/);
  assert.equal((appSource.match(/function saveDraft\(d\)/g)||[]).length,1);
});

test("un fallo local conserva la edición en memoria y permite reintentar sin Supabase",()=>{
  let attempts=0;
  const {context,state}=autosaveHarness({
    saveDraft(value,currentState){
      attempts+=1;
      if(attempts===1){
        const error=new Error("blocked storage");
        error.code="local_progress_write_failed";
        throw error;
      }
      currentState.workoutDraftMemory=JSON.parse(JSON.stringify(value));
      currentState.workoutDraftLastError=null;
      currentState.workoutDraftSaveStatus="saved_local";
    }
  });
  const edited=JSON.parse(JSON.stringify(state.workoutDraftMemory));
  edited.exercises[0].series[0].weight="87.5";
  context.edited=edited;
  vm.runInContext(
    "stageWorkoutDraft(edited,{immediate:true,scheduleSync:true})",
    context
  );
  assert.equal(state.workoutDraftMemory.exercises[0].series[0].weight,"87.5");
  assert.equal(state.workoutDraftSaveStatus,"local_error");
  assert.equal(state.workoutInlineMessage.retry,true);
  assert.equal(context.remoteRequests,0);
  vm.runInContext(
    "flushWorkoutDraftProgress({scheduleSync:false,silent:true})",
    context
  );
  assert.equal(attempts,2);
  assert.equal(state.workoutDraftMemory.exercises[0].series[0].weight,"87.5");
  assert.equal(state.workoutDraftSaveStatus,"saved_local");
  assert.equal(state.workoutDraftLastError,null);
});

test("un error remoto ocurre después del guardado local y no revierte una serie",()=>{
  let localWrites=0;
  const {context,state}=autosaveHarness({
    saveDraft(value,currentState){
      localWrites+=1;
      currentState.workoutDraftMemory=JSON.parse(JSON.stringify(value));
      currentState.workoutDraftLastError=null;
      currentState.workoutDraftSaveStatus="pending_sync";
    }
  });
  const edited=JSON.parse(JSON.stringify(state.workoutDraftMemory));
  edited.exercises[0].series[0].weight="82.5";
  edited.exercises[0].series[0].reps="11";
  context.edited=edited;
  vm.runInContext(
    "stageWorkoutDraft(edited,{immediate:true,scheduleSync:true})",
    context
  );
  assert.equal(localWrites,1);
  assert.equal(context.remoteRequests,1);
  assert.equal(state.workoutDraftMemory.exercises[0].series[0].weight,"82.5");
  assert.equal(state.workoutDraftMemory.exercises[0].series[0].reps,"11");
  // Una respuesta remota fallida solo cambia el estado de sincronización.
  state.workoutDraftLastError={code:"remote_sync_failed",phase:"supabase_sync"};
  state.workoutDraftSaveStatus="pending_sync";
  assert.equal(state.workoutDraftMemory.exercises[0].series[0].weight,"82.5");
  assert.equal(state.workoutDraftMemory.exercises[0].series[0].reps,"11");
  assert.equal(state.workoutDraftSaveStatus,"pending_sync");
});

test("QuotaExceededError compacta una vez y el segundo intento persiste el último estado",()=>{
  let attempts=0;
  let persisted=null;
  const {context,state}=autosaveHarness({
    saveDraft(value,currentState){
      attempts+=1;
      if(attempts===1){
        const error=new Error("quota");
        error.name="QuotaExceededError";
        error.code="storage_quota";
        throw error;
      }
      persisted=JSON.parse(JSON.stringify(value));
      currentState.workoutDraftMemory=persisted;
      currentState.workoutDraftLastError=null;
    }
  });
  const edited=JSON.parse(JSON.stringify(state.workoutDraftMemory));
  edited.exercises[0].notes="Última nota antes de recuperar espacio";
  context.edited=edited;
  vm.runInContext(
    "stageWorkoutDraft(edited,{immediate:true,scheduleSync:false})",
    context
  );
  assert.equal(attempts,2);
  assert.equal(context.compactionAttempts,1);
  assert.equal(
    persisted.exercises[0].notes,
    "Última nota antes de recuperar espacio"
  );
  assert.equal(state.workoutDraftSaveStatus,"saved_local");
  assert.equal(state.workoutDraftLastError,null);
  assert.match(state.workoutInlineMessage.text,/Guardado en este dispositivo/);
  assert.match(state.workoutInlineMessage.text,/pendiente de sincronización/);
  const restored=api().normalizeDraft(JSON.parse(JSON.stringify(persisted)),{});
  assert.equal(
    restored.exercises[0].notes,
    "Última nota antes de recuperar espacio"
  );
});

test("si el segundo intento también agota cuota no existe un bucle y el aviso persiste",()=>{
  let attempts=0;
  const {context,state}=autosaveHarness({
    saveDraft(){
      attempts+=1;
      const error=new Error("quota");
      error.name="QuotaExceededError";
      error.code="storage_quota";
      throw error;
    }
  });
  const edited=JSON.parse(JSON.stringify(state.workoutDraftMemory));
  edited.exercises[0].series[0].rir="1";
  context.edited=edited;
  vm.runInContext(
    "stageWorkoutDraft(edited,{immediate:true,scheduleSync:false})",
    context
  );
  assert.equal(attempts,2);
  assert.equal(context.compactionAttempts,1);
  assert.equal(state.workoutDraftMemory.exercises[0].series[0].rir,"1");
  assert.equal(state.workoutDraftSaveStatus,"local_error");
  assert.match(state.workoutInlineMessage.text,/No hay espacio suficiente/);
  assert.match(state.workoutInlineMessage.text,/Mantén esta pantalla abierta/);
  assert.equal(state.workoutInlineMessage.retry,true);
  assert.equal(state.workoutQuotaRecoveryInProgress,false);
});

test("una nota con cuota llena conserva foco lógico y el valor más reciente en memoria",async()=>{
  let attempts=0;
  const {context,state}=autosaveHarness({
    saveDraft(){
      attempts+=1;
      const error=new Error("quota");
      error.code="storage_quota";
      throw error;
    }
  });
  for(const value of ["N","Nota","Nota más reciente"]){
    const edited=JSON.parse(JSON.stringify(state.workoutDraftMemory));
    edited.exercises[0].notes=value;
    context.edited=edited;
    vm.runInContext("stageWorkoutDraft(edited)",context);
  }
  await new Promise(resolve=>setTimeout(resolve,450));
  assert.equal(attempts,2);
  assert.equal(context.compactionAttempts,1);
  assert.equal(state.workoutDraftMemory.exercises[0].notes,"Nota más reciente");
  assert.equal(state.workoutDraftSaveStatus,"local_error");
});

test("escritura rápida con fallo local no deshabilita ni reconstruye los campos",async()=>{
  let writes=0;
  const {context,state}=autosaveHarness({
    saveDraft(){
      writes+=1;
      const error=new Error("storage unavailable");
      error.code="local_progress_write_failed";
      throw error;
    }
  });
  for(const value of ["8","82","82.5"]){
    const edited=JSON.parse(JSON.stringify(state.workoutDraftMemory));
    edited.exercises[0].series[0].weight=value;
    context.edited=edited;
    vm.runInContext("stageWorkoutDraft(edited)",context);
  }
  assert.equal(state.workoutDraftMemory.exercises[0].series[0].weight,"82.5");
  await new Promise(resolve=>setTimeout(resolve,450));
  assert.equal(writes,1);
  assert.equal(state.workoutDraftMemory.exercises[0].series[0].weight,"82.5");
  const activeRender=appSource.slice(
    appSource.indexOf("function renderWorkout("),
    appSource.indexOf("function renderLegacyWorkout(")
  );
  assert.doesNotMatch(
    activeRender,
    /workoutDraft(?:LastError|SaveStatus)[\s\S]{0,120}disabled/
  );
  assert.match(appSource,/data-workout-retry-save/);
});

test("errores de cuota, propietario, identidad y sincronización tienen códigos distintos",()=>{
  const context={
    console:{error(){}},
    Set,Error,String,
    localStorage:{
      setItem(){
        const error=new Error("storage blocked");
        error.name="SecurityError";
        throw error;
      }
    },
    WORKOUT_PERSISTENCE_ERROR_CODES:new Set([
      "memory_update_failed","local_progress_write_failed",
      "active_pointer_write_failed","legacy_shadow_write_failed",
      "remote_sync_failed","owner_mismatch","invalid_workout_identity",
      "storage_quota","migration_failed","stale_operation",
      "corrupt_active_pointer"
    ])
  };
  vm.createContext(context);
  vm.runInContext(
    `${extractFunction(appSource,"isWorkoutStorageQuotaError")}
     ${extractFunction(appSource,"workoutPersistenceError")}
     ${extractFunction(appSource,"classifyWorkoutPersistenceError")}
     ${extractFunction(appSource,"writeWorkoutStorage")}
     ${extractFunction(appSource,"workoutPersistenceUserMessage")}`,
    context
  );
  const quota={name:"QuotaExceededError",code:22};
  context.quota=quota;
  const classified=vm.runInContext(
    'classifyWorkoutPersistenceError(quota,{phase:"progress_record"})',
    context
  );
  assert.equal(classified.code,"storage_quota");
  assert.equal(classified.phase,"progress_record");
  assert.equal(classified.cause,quota);
  const remote=vm.runInContext(
    'workoutPersistenceUserMessage(workoutPersistenceError("remote_sync_failed","supabase_sync"))',
    context
  );
  const local=vm.runInContext(
    'workoutPersistenceUserMessage(workoutPersistenceError("local_progress_write_failed","progress_record"))',
    context
  );
  assert.match(remote.text,/Guardado en este dispositivo/);
  assert.match(remote.text,/pendiente de sincronización/);
  assert.match(local.text,/siguen en memoria/);
  assert.notEqual(remote.text,local.text);
  assert.equal(
    vm.runInContext(
      'classifyWorkoutPersistenceError(new Error("owner_changed"),{phase:"guard"}).code',
      context
    ),
    "owner_mismatch"
  );
  const blocked=vm.runInContext(
    '(()=>{try{writeWorkoutStorage("key","value",{code:"local_progress_write_failed",phase:"progress_record"});}catch(error){return error;}})()',
    context
  );
  assert.equal(blocked.code,"local_progress_write_failed");
  assert.equal(blocked.phase,"progress_record");
  assert.equal(blocked.cause.name,"SecurityError");
  assert.equal(
    vm.runInContext(
      'classifyWorkoutPersistenceError(new Error("stale_operation"),{phase:"autosave"}).code',
      context
    ),
    "stale_operation"
  );
  assert.equal(
    vm.runInContext(
      'classifyWorkoutPersistenceError(new Error("active_pointer_target_invalid"),{phase:"pointer"}).code',
      context
    ),
    "corrupt_active_pointer"
  );
});

test("un draft RC.2 sin identidades conserva timer e IDs estables en migración repetida",()=>{
  const engine=api();
  const legacy=draft();
  delete legacy.workoutInstanceId;
  delete legacy.draftId;
  delete legacy.revision;
  delete legacy.updatedAt;
  legacy.sessionTimer={
    ownerId:OWNER_A,sessionId:"session-1",status:"running",
    elapsedMs:7_200_000,startedAt:Date.parse(NOW)
  };
  legacy.exercises.forEach(exercise=>{
    delete exercise.exerciseInstanceId;
    exercise.series.forEach(set=>delete set.setInstanceId);
  });
  const first=engine.normalizeDraft(legacy,{
    owner:OWNER_A,sessionId:"session-1",routineId:"routine-1",
    clientInstanceId:"migration",idFactory:()=>`random-${Math.random()}`
  });
  const second=engine.normalizeDraft(legacy,{
    owner:OWNER_A,sessionId:"session-1",routineId:"routine-1",
    clientInstanceId:"migration",idFactory:()=>`random-${Math.random()}`
  });
  assert.equal(first.workoutInstanceId,second.workoutInstanceId);
  assert.deepEqual(
    first.exercises.map(item=>item.exerciseInstanceId),
    second.exercises.map(item=>item.exerciseInstanceId)
  );
  assert.equal(first.sessionTimer.elapsedMs,7_200_000);
  assert.equal(first.sessionTimer.status,"running");
});

test("puntero corrupto se descarta y la migración parcial sigue siendo reparable",()=>{
  const pointerReader=appSource.slice(
    appSource.indexOf("function activeWorkoutProgressRecord("),
    appSource.indexOf("function activeWorkoutPointerId(")
  );
  assert.match(pointerReader,/normalizePointer\(rawPointer/);
  assert.match(pointerReader,/discardCorruptActiveWorkoutPointer\(activeKey/);
  assert.match(pointerReader,/phase:"active_pointer_parse"/);
  assert.match(pointerReader,/phase:"active_pointer_target"/);
  const pointerRepair=appSource.slice(
    appSource.indexOf("function discardCorruptActiveWorkoutPointer("),
    appSource.indexOf("function approximateStorageBytes(")
  );
  assert.match(pointerRepair,/corrupt_active_pointer/);
  assert.match(pointerRepair,/active_pointer_write_failed/);
  assert.match(pointerRepair,/logWorkoutPersistenceError/);
  const migration=appSource.slice(
    appSource.indexOf("function ensureWorkoutProgressMigration("),
    appSource.indexOf("function mergeIncomingWorkoutProgress(")
  );
  assert.match(migration,/migration_failed/);
  assert.match(migration,/storeWorkoutProgressRecord\(progress/);
  assert.match(migration,/workout_progress_verification_failed/);
  assert.ok(
    migration.indexOf("localStorage.setItem(progressKey")<
    migration.indexOf("storeWorkoutProgressRecord(progress")
  );
});

test("cronómetro y campos escriben memoria antes de persistir y no esperan a Supabase",()=>{
  const timerAction=appSource.slice(
    appSource.indexOf("function setWorkoutSessionTimerAction("),
    appSource.indexOf("function stopWorkoutSessionTimerDisplay(")
  );
  assert.match(timerAction,/stageWorkoutDraft\(draft,\{immediate:true,scheduleSync:true\}\)/);
  assert.doesNotMatch(timerAction,/supabase|syncNow|autoSync|await/);
  const save=appSource.slice(
    appSource.indexOf("function saveDraft("),
    appSource.indexOf("function workoutSaveStatusLabel(")
  );
  assert.ok(
    save.indexOf("state.workoutDraftMemory=JSON.parse")<
    save.indexOf("storeWorkoutProgressRecord(nextDraft")
  );
  assert.doesNotMatch(save,/restoreStorageValue/);
  assert.match(save,/local_progress_write_failed/);
  assert.match(save,/legacy_shadow_write_failed/);
});

test("reiniciar el cronómetro cambia la memoria aunque falle la persistencia local",()=>{
  const runtime=runtimeApi();
  const {context,state}=autosaveHarness({
    saveDraft(){
      const error=new Error("storage blocked");
      error.name="QuotaExceededError";
      error.code="storage_quota";
      throw error;
    }
  });
  state.workoutDraftMemory.sessionTimer=runtime.normalizeSessionTimer({
    ownerId:OWNER_A,sessionId:"session-1",status:"running",
    elapsedMs:90_000,startedAt:Date.parse(NOW)
  },{ownerId:OWNER_A,sessionId:"session-1"});
  context.routineSessionRuntimeApi=()=>runtime;
  context.resolveRuntimeSessionId=()=> "session-1";
  context.getDraft=()=>JSON.parse(JSON.stringify(state.workoutDraftMemory));
  context.workoutSessionTimerForDraft=value=>runtime.normalizeSessionTimer(
    value.sessionTimer,{ownerId:OWNER_A,sessionId:"session-1"}
  );
  vm.runInContext(
    extractFunction(appSource,"setWorkoutSessionTimerAction"),
    context
  );
  vm.runInContext(
    'setWorkoutSessionTimerAction("session-1","reset",Date.parse("2026-07-30T12:00:00.000Z"))',
    context
  );
  assert.equal(state.workoutDraftMemory.sessionTimer.elapsedMs,0);
  assert.equal(
    state.workoutDraftMemory.sessionTimer.startedAt,
    Date.parse("2026-07-30T12:00:00.000Z")
  );
  assert.equal(state.workoutDraftMemory.exercises[0].series[0].weight,"");
  assert.equal(state.workoutDraftSaveStatus,"local_error");
  assert.equal(context.compactionAttempts,1);
});

test("reiniciar el cronómetro no espera a Supabase y sobrevive a su fallo",()=>{
  const runtime=runtimeApi();
  const {context,state}=autosaveHarness({
    saveDraft(value,currentState){
      currentState.workoutDraftMemory=JSON.parse(JSON.stringify(value));
      currentState.workoutDraftLastError=null;
      currentState.workoutDraftSaveStatus="pending_sync";
    }
  });
  state.workoutDraftMemory.sessionTimer=runtime.normalizeSessionTimer({
    ownerId:OWNER_A,sessionId:"session-1",status:"running",
    elapsedMs:90_000,startedAt:Date.parse(NOW)
  },{ownerId:OWNER_A,sessionId:"session-1"});
  context.routineSessionRuntimeApi=()=>runtime;
  context.resolveRuntimeSessionId=()=> "session-1";
  context.getDraft=()=>JSON.parse(JSON.stringify(state.workoutDraftMemory));
  context.workoutSessionTimerForDraft=value=>runtime.normalizeSessionTimer(
    value.sessionTimer,{ownerId:OWNER_A,sessionId:"session-1"}
  );
  vm.runInContext(
    extractFunction(appSource,"setWorkoutSessionTimerAction"),
    context
  );
  vm.runInContext(
    'setWorkoutSessionTimerAction("session-1","reset",Date.parse("2026-07-30T12:00:00.000Z"))',
    context
  );
  assert.equal(state.workoutDraftMemory.sessionTimer.elapsedMs,0);
  assert.equal(context.remoteRequests,1);
  state.workoutDraftLastError={code:"remote_sync_failed",phase:"supabase_sync"};
  state.workoutDraftSaveStatus="pending_sync";
  assert.equal(state.workoutDraftMemory.sessionTimer.elapsedMs,0);
  assert.equal(
    state.workoutDraftMemory.sessionTimer.startedAt,
    Date.parse("2026-07-30T12:00:00.000Z")
  );
});

test("una respuesta remota antigua no sustituye valores visibles pendientes",()=>{
  const getter=appSource.slice(
    appSource.indexOf("function getDraft("),
    appSource.indexOf("function saveDraft(")
  );
  assert.ok(
    getter.indexOf("state.workoutDraftMemory?.ownerId")<
    getter.indexOf("activeWorkoutProgressRecord(ownerId,resolved)")
  );
  assert.match(getter,/return JSON\.parse\(JSON\.stringify\(state\.workoutDraftMemory\)\)/);
  const engine=api();
  const base=engine.normalizeDraft(draft(),{});
  const local=edit(base,value=>{
    value.exercises[0].notes="texto visible nuevo";
  },{time:"2026-07-30T10:05:00.000Z",client:"local"});
  const remote=edit(base,value=>{
    value.exercises[1].notes="respuesta remota";
  },{time:"2026-07-30T10:01:00.000Z",client:"remote"});
  const merged=engine.mergeDrafts(local,remote).draft;
  assert.equal(merged.exercises[0].notes,"texto visible nuevo");
  assert.equal(merged.exercises[1].notes,"respuesta remota");
});

test("el diagnóstico de almacenamiento solo expone metadatos seguros",()=>{
  const context={
    CANONICAL_DRAFTS_KEY:"gymos:routineDrafts",
    CANONICAL_ROUTINE_KEY:"gymos:routine:canonical"
  };
  vm.createContext(context);
  vm.runInContext(
    `${extractFunction(appSource,"approximateStorageBytes")}
     ${extractFunction(appSource,"workoutStorageEntryDescriptor")}`,
    context
  );
  context.secret=JSON.stringify({
    ownerId:OWNER_A,notes:"nota que no debe aparecer",weight:"105"
  });
  const descriptor=vm.runInContext(
    `workoutStorageEntryDescriptor(
      "gymos:workoutProgress:${OWNER_A}:workout-1",secret,"${OWNER_A}"
    )`,
    context
  );
  const serialized=JSON.stringify(descriptor);
  assert.equal(descriptor.ownerId,OWNER_A);
  assert.equal(descriptor.contentType,"workout_progress");
  assert.equal(descriptor.role,"authoritative");
  assert.equal(descriptor.writer,"storeWorkoutProgressRecord");
  assert.ok(descriptor.approximateBytes>0);
  assert.doesNotMatch(serialized,/nota que no debe aparecer|105/);
});

test("legacyRaw deja de crecer y no se duplica dentro de workoutProgress",()=>{
  const save=appSource.slice(
    appSource.indexOf("function saveDraft("),
    appSource.indexOf("function workoutSaveStatusLabel(")
  );
  assert.ok(
    save.indexOf("delete nextDraft.legacyRaw")<
    save.indexOf("nextDraft.legacyRaw=compactWorkoutDraftShadow")
  );
  const store=appSource.slice(
    appSource.indexOf("function storeWorkoutProgressRecord("),
    appSource.indexOf("function removeWorkoutProgressRecord(")
  );
  assert.match(store,/delete progressRecord\.legacyRaw/);
  const makeShadow=value=>{
    const next=JSON.parse(JSON.stringify(value));
    delete next.legacyRaw;
    next.legacyRaw=JSON.stringify({...next,session:"A"});
    return next;
  };
  const once=makeShadow({...draft(),session:"A"});
  const twice=makeShadow(once);
  const three=makeShadow(twice);
  assert.equal(twice.legacyRaw.length,three.legacyRaw.length);
  assert.doesNotMatch(JSON.parse(three.legacyRaw).legacyRaw||"",/./);
});

test("la compactación protege datos funcionales, pendientes y otros propietarios",()=>{
  const compaction=appSource.slice(
    appSource.indexOf("function compactWorkoutStorageForQuota("),
    appSource.indexOf("function storeWorkoutProgressRecord(")
  );
  for(const protectedKey of [
    '"gymos:routine"',
    "CANONICAL_ROUTINE_KEY",
    '"gymos:history"',
    '"gymos:dailyRecovery"',
    '"gymos:recoveryCheckins"',
    '"gymos:syncPending"'
  ]){
    assert.match(compaction,new RegExp(protectedKey.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  }
  assert.doesNotMatch(
    compaction,
    /removeItem\((?:"gymos:(?:routine|history|dailyRecovery|recoveryCheckins)"|CANONICAL_ROUTINE_KEY)/
  );
  assert.match(compaction,/protectedBefore\.syncPending!=="1"/);
  assert.match(compaction,/storedWorkoutProgressRecords\(normalizedOwner\)/);
  assert.match(compaction,/LOCAL_VAULT_PREFIX.*normalizedOwner/);
  assert.match(compaction,/assertActiveLocalOwner\(normalizedOwner\)/);
  assert.match(compaction,/remove_verified_legacy_shadow/);
});

test("una sombra legacy solo es eliminable tras doble verificación y nunca si está activa",()=>{
  const legacy={
    draftId:"draft-old",workoutInstanceId:"workout-old",
    ownerId:OWNER_A,routineId:"routine-1",sessionId:"session-1",
    session:"A",status:"finalized",exercises:[{
      name:"Remo",series:[{weight:"80",reps:"10",rir:"2",done:true}]
    }]
  };
  const raw=JSON.stringify(legacy);
  const finalized={...legacy,updatedAt:NOW};
  const context={
    storedWorkoutProgressRecords:()=>[finalized],
    activeWorkoutProgressRecord:()=>null,
    getCanonicalDrafts:()=>({
      draftsBySessionId:{
        "session-1":{...finalized,legacyRaw:raw}
      }
    })
  };
  vm.createContext(context);
  vm.runInContext(
    `${extractFunction(appSource,"storageValueContains")}
     ${extractFunction(appSource,"verifiedLegacyShadowDuplicate")}`,
    context
  );
  context.raw=raw;
  assert.equal(
    vm.runInContext(
      `verifiedLegacyShadowDuplicate(
        "${OWNER_A}","session-1",raw,{allowActive:false}
      )`,
      context
    ),
    true
  );
  context.activeWorkoutProgressRecord=()=>({...finalized,status:"active"});
  assert.equal(
    vm.runInContext(
      `verifiedLegacyShadowDuplicate(
        "${OWNER_A}","session-1",raw,{allowActive:false}
      )`,
      context
    ),
    false
  );
  context.activeWorkoutProgressRecord=()=>null;
  context.getCanonicalDrafts=()=>({draftsBySessionId:{}});
  assert.equal(
    vm.runInContext(
      `verifiedLegacyShadowDuplicate(
        "${OWNER_A}","session-1",raw,{allowActive:false}
      )`,
      context
    ),
    false
  );
});

test("el mensaje genérico anterior se elimina y cada fase conserva la causa original",()=>{
  assert.doesNotMatch(
    appSource,
    /No se pudieron guardar los cambios\. Inténtalo de nuevo\./
  );
  assert.match(appSource,/error\.cause=cause/);
  for(const code of [
    "memory_update_failed","local_progress_write_failed",
    "active_pointer_write_failed","legacy_shadow_write_failed",
    "remote_sync_failed","owner_mismatch","invalid_workout_identity",
    "storage_quota","migration_failed","stale_operation",
    "corrupt_active_pointer"
  ]){
    assert.match(appSource,new RegExp(`"${code}"`),code);
  }
});

test("legacyRaw se inspecciona con limites, se elimina al normalizar y la reparacion es idempotente",()=>{
  const engine=api();
  const base=draft();
  const one={...base,legacyRaw:JSON.stringify({...base,session:"A"})};
  const two={...base,legacyRaw:JSON.stringify(one)};
  const three={...base,legacyRaw:JSON.stringify(two)};
  assert.equal(engine.inspectLegacyRaw(one).present,true);
  assert.equal(engine.inspectLegacyRaw(one).nested,false);
  assert.equal(engine.inspectLegacyRaw(three).nested,true);
  assert.ok(engine.inspectLegacyRaw(three).depth<=engine.LEGACY_RAW_SCAN_MAX_DEPTH);
  const oversized={...base,legacyRaw:"x".repeat(engine.LEGACY_RAW_SCAN_MAX_BYTES)};
  const inspection=engine.inspectLegacyRaw(oversized);
  assert.equal(inspection.oversized,true);
  assert.equal(inspection.truncated,true);
  assert.equal(inspection.depth,0);
  const normalized=engine.normalizeDraft(three,{});
  assert.equal(Object.hasOwn(normalized,"legacyRaw"),false);
  assert.deepEqual(
    JSON.parse(JSON.stringify(normalized.exercises)),
    JSON.parse(JSON.stringify(engine.normalizeDraft(base,{}).exercises))
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(normalized.sessionTimer)),
    JSON.parse(JSON.stringify(engine.normalizeDraft(base,{}).sessionTimer))
  );
  const once=engine.stripLegacyRaw(three).draft;
  const twice=engine.stripLegacyRaw(once).draft;
  assert.equal(JSON.stringify(once),JSON.stringify(twice));
});

test("payload remoto o de otra pestana no puede reintroducir legacyRaw recursivo",()=>{
  const engine=api();
  const base=engine.normalizeDraft(draft(),{});
  const incoming={
    ...base,
    legacyRaw:JSON.stringify({
      ...base,
      legacyRaw:JSON.stringify({...base,session:"A"})
    })
  };
  const merged=engine.mergeCollections([],[incoming],{owner:OWNER_A});
  assert.equal(merged.rejected.length,0);
  assert.equal(merged.records.length,1);
  assert.equal(Object.hasOwn(merged.records[0],"legacyRaw"),false);
  assert.equal(
    merged.records[0].exercises[0].series[0].setInstanceId,
    base.exercises[0].series[0].setInstanceId
  );
});

test("repara datos legacy inflados con cuota llena conservando entrenamiento y otros dominios",()=>{
  const engine=api();
  const base=engine.normalizeDraft({
    ...draft(),
    currentExerciseInstanceId:"exercise-workout-1-row",
    substitutions:[{from:"remo",to:"jalon"}],
    exercises:[{
      exerciseId:"row",name:"Remo",
      exerciseInstanceId:"exercise-workout-1-row",
      notes:"nota exacta",substitution:{from:"remo",to:"jalon"},
      series:[{
        setInstanceId:"set-workout-1-row-1",
        weight:"82.5",reps:"9",rir:"2",done:true
      }]
    }],
    sessionTimer:{
      ownerId:OWNER_A,sessionId:"session-1",status:"paused",
      elapsedMs:987654,startedAt:null
    }
  },{});
  let inflated={...base,legacyRaw:JSON.stringify({...base,session:"A"})};
  for(let level=0;level<5;level+=1){
    inflated={...base,legacyRaw:JSON.stringify(inflated)};
  }
  const canonicalRoutine={
    routineId:"routine-1",
    sessions:[{sessionId:"session-1",legacySessionKey:"A"}]
  };
  const canonicalContainer={
    routineId:"routine-1",draftsBySessionId:{"session-1":inflated}
  };
  const otherOwnerKey=`gymos:workoutProgress:${OWNER_B}:workout-b`;
  const storageMap=new Map([
    ["gymos:routine",JSON.stringify({A:[{name:"Remo"}]})],
    ["gymos:routine:canonical",JSON.stringify(canonicalRoutine)],
    ["gymos:routineDrafts",JSON.stringify(canonicalContainer)],
    ["gymos:draft:A",JSON.stringify(inflated)],
    ["gymos:history",JSON.stringify([{id:"history-1"}])],
    ["gymos:dailyRecovery",JSON.stringify({score:71})],
    ["gymos:recoveryCheckins",JSON.stringify([{id:"checkin-1"}])],
    [otherOwnerKey,JSON.stringify({
      ...base,ownerId:OWNER_B,workoutInstanceId:"workout-b"
    })]
  ]);
  const storageBytes=entries=>[...entries].reduce(
    (total,[key,value])=>total+(key.length+String(value).length)*2,0
  );
  const quota=storageBytes(storageMap);
  const localStorage={
    get length(){return storageMap.size;},
    key:index=>[...storageMap.keys()][index]??null,
    getItem:key=>storageMap.has(key)?storageMap.get(key):null,
    removeItem:key=>storageMap.delete(key),
    setItem(key,value){
      const next=new Map(storageMap);
      next.set(String(key),String(value));
      if(storageBytes(next)>quota){
        const error=new Error("quota");
        error.name="QuotaExceededError";
        error.code=22;
        throw error;
      }
      storageMap.set(String(key),String(value));
    }
  };
  assert.throws(
    ()=>localStorage.setItem(
      `gymos:workoutProgress:${OWNER_A}:workout-1`,JSON.stringify(base)
    ),
    error=>error.name==="QuotaExceededError"
  );
  const protectedBefore={
    routine:localStorage.getItem("gymos:routine"),
    canonicalRoutine:localStorage.getItem("gymos:routine:canonical"),
    history:localStorage.getItem("gymos:history"),
    recovery:localStorage.getItem("gymos:dailyRecovery"),
    recoveryCheckins:localStorage.getItem("gymos:recoveryCheckins"),
    other:localStorage.getItem(otherOwnerKey)
  };
  const state={
    workoutDraftMemory:null,workoutDraftLastError:null,
    workoutDraftSaveStatus:"saved_local",workoutInlineMessage:null
  };
  const context={
    JSON,Map,Object,String,Array,Date,localStorage,state,
    CANONICAL_DRAFTS_KEY:"gymos:routineDrafts",
    CANONICAL_ROUTINE_KEY:"gymos:routine:canonical",
    workoutProgressApi:()=>engine,
    currentRoutineOwnerOrNull:()=>OWNER_A,
    getCanonicalRoutine:()=>canonicalRoutine,
    readStoredJson:key=>{
      try{return JSON.parse(localStorage.getItem(key));}catch(_){return null;}
    },
    assertActiveLocalOwner:owner=>{
      if(owner!==OWNER_A) throw new Error("owner_changed");
      return owner;
    },
    writeWorkoutStorage:(key,value)=>{
      try{localStorage.setItem(key,value);}
      catch(error){
        const wrapped=new Error("storage_quota");
        wrapped.name="WorkoutPersistenceError";
        wrapped.code=error.name==="QuotaExceededError"
          ?"storage_quota":"local_progress_write_failed";
        wrapped.cause=error;
        throw wrapped;
      }
    },
    classifyWorkoutPersistenceError:(error,options={})=>{
      if(error?.name==="WorkoutPersistenceError") return error;
      const wrapped=new Error(options.fallback||"migration_failed");
      wrapped.name="WorkoutPersistenceError";
      wrapped.code=error?.name==="QuotaExceededError"
        ?"storage_quota":(options.fallback||"migration_failed");
      wrapped.phase=options.phase;
      wrapped.cause=error;
      return wrapped;
    },
    logWorkoutPersistenceError:()=>{},
    setActiveWorkoutMessage:(type,text,options={})=>{
      state.workoutInlineMessage={type,text,...options};
    }
  };
  vm.createContext(context);
  vm.runInContext(
    `${extractFunction(appSource,"draftKey")}
     ${extractFunction(appSource,"workoutProgressPrefix")}
     ${extractFunction(appSource,"compactWorkoutDraftShadow")}
     ${extractFunction(appSource,"sanitizeWorkoutDraftContainer")}
     ${extractFunction(appSource,"repairInflatedLegacyWorkoutStorage")}`,
    context
  );
  const first=vm.runInContext(
    `repairInflatedLegacyWorkoutStorage({ownerId:"${OWNER_A}"})`,context
  );
  assert.equal(first.completed,true);
  assert.equal(first.repaired,true);
  const progress=JSON.parse(localStorage.getItem(
    `gymos:workoutProgress:${OWNER_A}:workout-1`
  ));
  assert.equal(progress.workoutInstanceId,"workout-1");
  assert.equal(progress.currentExerciseInstanceId,"exercise-workout-1-row");
  assert.equal(progress.exercises[0].notes,"nota exacta");
  assert.equal(progress.exercises[0].series[0].weight,"82.5");
  assert.equal(progress.exercises[0].series[0].reps,"9");
  assert.equal(progress.sessionTimer.elapsedMs,987654);
  assert.equal(progress.exercises[0].substitution.to,"jalon");
  assert.equal(Object.hasOwn(progress,"legacyRaw"),false);
  const compactCanonical=JSON.parse(localStorage.getItem("gymos:routineDrafts"));
  const compactDraft=compactCanonical.draftsBySessionId["session-1"];
  assert.equal(
    Object.hasOwn(JSON.parse(compactDraft.legacyRaw),"legacyRaw"),false
  );
  assert.deepEqual({
    routine:localStorage.getItem("gymos:routine"),
    canonicalRoutine:localStorage.getItem("gymos:routine:canonical"),
    history:localStorage.getItem("gymos:history"),
    recovery:localStorage.getItem("gymos:dailyRecovery"),
    recoveryCheckins:localStorage.getItem("gymos:recoveryCheckins"),
    other:localStorage.getItem(otherOwnerKey)
  },protectedBefore);
  const afterFirst=JSON.stringify([...storageMap.entries()].sort());
  const second=vm.runInContext(
    `repairInflatedLegacyWorkoutStorage({ownerId:"${OWNER_A}"})`,context
  );
  assert.equal(second.completed,true);
  assert.equal(second.repaired,false);
  assert.equal(JSON.stringify([...storageMap.entries()].sort()),afterFirst);
});

test("salidas y entradas funcionales sanean legacyRaw antes de persistir",()=>{
  const backup=appSource.slice(
    appSource.indexOf("function buildGymOSBackup("),
    appSource.indexOf("function downloadGymOSBackup(")
  );
  const vault=appSource.slice(
    appSource.indexOf("function snapshotCurrentLocalData("),
    appSource.indexOf("function resetExerciseLibraryOwnerState(")
  );
  const sync=appSource.slice(
    appSource.indexOf("function buildSyncPayload("),
    appSource.indexOf("const SYNC_AUDIT_KEY")
  );
  const storageListener=appSource.slice(
    appSource.indexOf('window.addEventListener("storage"'),
    appSource.indexOf("setInterval(()=>autoSync")
  );
  assert.match(backup,/sanitizeWorkoutStorageValue/);
  assert.match(vault,/sanitizeWorkoutStorageValue/);
  assert.match(sync,/sanitizeWorkoutDraftContainer/);
  assert.match(sync,/sanitizeIncomingWorkoutPayload/);
  assert.match(storageListener,/repairInflatedLegacyWorkoutStorage/);
  assert.match(storageListener,/mergeDrafts\(memory,incoming\)/);
});

test("navegación móvil conserva un writer, identidad canónica y difiere storage durante edición",()=>{
  const navigation=appSource.slice(
    appSource.indexOf("const navigateMobileWorkoutExercise="),
    appSource.indexOf("const rerenderWithError=")
  );
  assert.match(navigation,/flushWorkoutDraftProgress/);
  assert.match(navigation,/requireLocal:true/);
  assert.match(navigation,/currentExerciseInstanceId=target\.exerciseInstanceId/);
  assert.match(navigation,/stageWorkoutDraft/);
  assert.doesNotMatch(navigation,/localStorage|saveRoutine|saveHistory/);
  const storageListener=appSource.slice(
    appSource.indexOf('window.addEventListener("storage"'),
    appSource.indexOf("setInterval(()=>autoSync")
  );
  assert.match(storageListener,/requestSafeActiveWorkoutRender/);
  assert.equal((appSource.match(/function saveDraft\(d\)/g)||[]).length,1);
  assert.equal((appSource.match(/function stageWorkoutDraft\(/g)||[]).length,1);
  assert.equal((appSource.match(/function flushWorkoutDraftProgress\(/g)||[]).length,1);
});
