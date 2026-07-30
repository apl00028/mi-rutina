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
  const appIndex=indexSource.indexOf('<script src="app.js"></script>');
  assert.ok(progressIndex>=0&&progressIndex<appIndex);
  assert.match(workerSource,/gymos-cache-4\.2\.0-rc\.3/);
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
  edited.exercises[0].series[0].reps="11";
  context.edited=edited;
  vm.runInContext(
    "stageWorkoutDraft(edited,{immediate:true,scheduleSync:true})",
    context
  );
  assert.equal(localWrites,1);
  assert.equal(context.remoteRequests,1);
  assert.equal(state.workoutDraftMemory.exercises[0].series[0].reps,"11");
  // Una respuesta remota fallida solo cambia el estado de sincronización.
  state.workoutDraftLastError={code:"remote_sync_failed",phase:"supabase_sync"};
  state.workoutDraftSaveStatus="pending_sync";
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
    WORKOUT_PERSISTENCE_ERROR_CODES:new Set([
      "memory_update_failed","local_progress_write_failed",
      "active_pointer_write_failed","legacy_shadow_write_failed",
      "remote_sync_failed","owner_mismatch","invalid_workout_identity",
      "storage_quota","migration_failed"
    ])
  };
  vm.createContext(context);
  vm.runInContext(
    `${extractFunction(appSource,"isWorkoutStorageQuotaError")}
     ${extractFunction(appSource,"workoutPersistenceError")}
     ${extractFunction(appSource,"classifyWorkoutPersistenceError")}
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
  assert.match(pointerReader,/localStorage\.removeItem\(activeKey\)/);
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
    appSource.indexOf("function ensureWorkoutSessionTimerStarted(")
  );
  assert.match(timerAction,/stageWorkoutDraft\(draft,\{immediate:true,scheduleSync:false\}\)/);
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
    save.indexOf("nextDraft.legacyRaw=JSON.stringify")
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
    "storage_quota","migration_failed"
  ]){
    assert.match(appSource,new RegExp(`"${code}"`),code);
  }
});
