"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const test=require("node:test");

const root=path.resolve(__dirname,"..");
const sources=["routine-session-model.js","routine-session-migration.js","routine-session-runtime.js"]
  .map(file=>[file,fs.readFileSync(path.join(root,file),"utf8")]);
const appSource=fs.readFileSync(path.join(root,"app.js"),"utf8");
const indexSource=fs.readFileSync(path.join(root,"index.html"),"utf8");
const workerSource=fs.readFileSync(path.join(root,"service-worker.js"),"utf8");
const OWNER_A="11111111-1111-4111-8111-111111111111";
const OWNER_B="22222222-2222-4222-8222-222222222222";

function plain(value){return JSON.parse(JSON.stringify(value));}
function load(){
  const context={console};
  context.globalThis=context;
  context.window=context;
  vm.createContext(context);
  sources.forEach(([file,source])=>vm.runInContext(source,context,{filename:file}));
  return context;
}
function loadFull(){
  const context=load();
  context.GymOSProfileData={
    normalizeOwnerId:value=>{
      const normalized=String(value||"").toLowerCase();
      if(normalized==="local"||/^[0-9a-f-]{36}$/.test(normalized)) return normalized;
      throw new Error("invalid_owner");
    }
  };
  ["routine-proposals.js","routine-activation.js"].forEach(file=>
    vm.runInContext(fs.readFileSync(path.join(root,file),"utf8"),context,{filename:file})
  );
  return context;
}
function proposal(count){
  return {
    proposalId:`proposal-${count}`,generatedAt:"2026-07-29T10:00:00.000Z",
    generatorVersion:"h3-test",reviewRequired:false,warnings:[],unresolvedQuestions:[],
    sessions:Array.from({length:count},(_,index)=>({
      id:`target-session-${index+1}`,order:index+1,
      label:`Día ${index+1}`,name:`Entrenamiento ${index+1}`,focus:"full_body",
      estimatedDurationMinutes:45,
      exercises:[{
        exerciseId:`target-exercise-${index+1}`,name:`Ejercicio ${index+1}`,
        prescription:{
          sets:3,target:{type:"repetitions",min:8,max:10},
          targetRir:{min:2,max:3},restSeconds:90,recordType:"weight_reps"
        }
      }]
    })),
    coverage:{requiredPatterns:[],coveredPatterns:[],missingPatterns:[],balanced:true},
    validation:{valid:true,results:[]}
  };
}
function exercise(id){
  return {id,exerciseId:id,name:`Ejercicio ${id}`,sets:3,target:"8–10 reps",type:"peso"};
}
function routine(count=6){
  return {
    schemaVersion:"4.2",routineId:"routine-runtime",revision:1,
    sessions:Array.from({length:count},(_,index)=>({
      sessionId:`stable-session-${index+1}`,order:index+1,
      label:String.fromCharCode(65+index),
      name:index<2?"Nombre duplicado":`Sesión personalizada ${index+1}`,
      focus:`Enfoque ${index+1}`,estimatedDurationMinutes:40+index,
      ...(index<3?{legacySessionKey:String.fromCharCode(65+index)}:{}),
      exercises:[exercise(`exercise-${index+1}`)]
    }))
  };
}
function draft(sessionId,overrides={}){
  return {
    draftId:`draft-${sessionId}`,ownerId:OWNER_A,routineId:"routine-runtime",
    routineRevision:1,sessionId,sessionDefinitionHash:"hash",
    startedAt:0,updatedAt:"2026-07-29T10:00:00.000Z",
    sessionSnapshot:{label:"D",name:"Día D",focus:"",order:4,legacySessionKey:null},
    exercises:[{...exercise("exercise-4"),series:[{weight:0,reps:0,rir:0,done:false}]}],
    ...overrides
  };
}

for(const count of [2,3,4,5,6]){
  test(`runtime enumera y rota ${count} sesiones por ID`,()=>{
    const api=load().GymOSRoutineSessionRuntime;
    const value=routine(count);
    assert.deepEqual(
      plain(api.orderedSessions(value).map(item=>item.sessionId)),
      Array.from({length:count},(_,index)=>`stable-session-${index+1}`)
    );
    assert.equal(api.nextSessionId(value,`stable-session-${count}`),"stable-session-1");
  });
}

test("la selección usa sessionId y sobrevive a reordenado y nombres duplicados",()=>{
  const api=load().GymOSRoutineSessionRuntime;
  const value=routine(6);
  value.sessions.reverse();
  assert.equal(api.selectedSessionId({
    routine:value,preferredSessionId:"stable-session-5",legacySelection:"A"
  }),"stable-session-5");
  assert.equal(api.sessionById(value,"stable-session-1").name,"Nombre duplicado");
  assert.equal(api.sessionById(value,"stable-session-2").name,"Nombre duplicado");
});

test("una selección eliminada cae de forma determinista en la primera sesión ordenada",()=>{
  const api=load().GymOSRoutineSessionRuntime;
  assert.equal(api.selectedSessionId({
    routine:routine(4),preferredSessionId:"missing"
  }),"stable-session-1");
});

test("el historial legacy sigue resolviendo A/B/C sin inventar equivalencias para IDs distintos",()=>{
  const api=load().GymOSRoutineSessionRuntime,value=routine(4);
  assert.equal(api.historyMatchesSession({session:"B"},value,"stable-session-2"),true);
  assert.equal(api.historyMatchesSession({
    sessionId:"old-session",session:"B"
  },value,"stable-session-2"),false);
});

test("la siguiente sesión inferida usa el entrenamiento más reciente aunque el array esté desordenado",()=>{
  const api=load().GymOSRoutineSessionRuntime,value=routine(5);
  assert.equal(api.selectedSessionId({
    routine:value,
    history:[
      {id:2,date:"2026-07-28T10:00:00.000Z",sessionId:"stable-session-2"},
      {id:1,date:"2026-07-29T10:00:00.000Z",sessionId:"stable-session-4"}
    ]
  }),"stable-session-5");
});

test("la sombra legacy conserva solo A/B/C y nunca crea D/E/F",()=>{
  const api=load().GymOSRoutineSessionRuntime;
  const shadow=plain(api.legacyShadow(routine(6)));
  assert.deepEqual(Object.keys(shadow),["A","B","C"]);
  assert.equal(shadow.A[0].exerciseId,"exercise-1");
  assert.equal(Object.hasOwn(shadow,"D"),false);
});

test("drafts D–F conservan ceros, identidad y aislamiento entre sesiones",()=>{
  const context=load(),api=context.GymOSRoutineSessionRuntime;
  const value=routine(6);
  let container=context.GymOSRoutineSessionMigration.emptyDraftContainer(value.routineId);
  const draftD=draft("stable-session-4");
  const draftF=draft("stable-session-6",{
    draftId:"draft-stable-session-6",
    sessionId:"stable-session-6",
    exercises:[{...exercise("exercise-6"),series:[{weight:"",reps:"",rir:"",done:false}]}]
  });
  container=api.upsertDraft(container,draftD,{ownerId:OWNER_A,routine:value});
  container=api.upsertDraft(container,draftF,{ownerId:OWNER_A,routine:value});
  const beforeF=JSON.stringify(container.draftsBySessionId["stable-session-6"]);
  container=api.removeDraft(container,{
    ownerId:OWNER_A,routine:value,sessionId:"stable-session-4"
  });
  assert.equal(container.draftsBySessionId["stable-session-4"],undefined);
  assert.equal(JSON.stringify(container.draftsBySessionId["stable-session-6"]),beforeF);
  assert.equal(draftD.exercises[0].series[0].weight,0);
  assert.throws(()=>api.upsertDraft(container,draftD,{ownerId:OWNER_B,routine:value}),/invalid_draft/);
});

test("el historial nuevo conserva rutina, sesión, nombre y compatibilidad legacy",()=>{
  const api=load().GymOSRoutineSessionRuntime,value=routine(6);
  const entry=plain(api.historyEntry({
    ownerId:OWNER_A,routine:value,sessionId:"stable-session-4",
    draft:draft("stable-session-4"),workoutId:7,
    date:"2026-07-29T11:00:00.000Z",durationMs:1000,completedSeries:1,
    exercises:[exercise("exercise-4")]
  }));
  assert.equal(entry.routineId,value.routineId);
  assert.equal(entry.sessionId,"stable-session-4");
  assert.equal(entry.sessionName,"Sesión personalizada 4");
  assert.equal(entry.legacySessionKey,undefined);
  assert.equal(entry.sessionSnapshot.order,4);
  const legacy=plain(api.historyEntry({
    ownerId:OWNER_A,routine:value,sessionId:"stable-session-2",
    draft:draft("stable-session-2",{sessionId:"stable-session-2"}),
    workoutId:8,date:"2026-07-29T12:00:00.000Z",durationMs:1000,
    completedSeries:1,exercises:[exercise("exercise-2")]
  }));
  assert.equal(legacy.session,"B");
  assert.equal(legacy.legacySessionKey,"B");
});

test("la integración carga runtime antes de app y lo precachea con versión rc.1",()=>{
  assert.ok(indexSource.indexOf('src="routine-session-runtime.js"')>
    indexSource.indexOf('src="routine-session-migration.js"'));
  assert.ok(indexSource.indexOf('src="routine-session-runtime.js"')<
    indexSource.indexOf('src="app.js"'));
  assert.match(workerSource,/routine-session-runtime\.js/);
  assert.match(workerSource,/gymos-cache-4\.2\.0-rc\.1/);
});

test("Inicio, entrenamiento y finalización consumen sessionId",()=>{
  assert.match(appSource,/function renderWorkout\(\)\{\s*const s=resolveRuntimeSessionId\(\)/);
  assert.match(appSource,/routineSessionRuntimeApi\(\)\.historyEntry/);
  assert.match(appSource,/routineSessionRuntimeApi\(\)\.nextSessionId/);
  assert.doesNotMatch(appSource,/const plannedExercises=sessions\[state\.selectedSession\]\.length/);
});

for(const count of [2,3,4,5,6]){
  test(`activación H3 conserva las ${count} sesiones y sus IDs`,()=>{
    const context=loadFull(),current=routine(2),target=proposal(count);
    const record=context.GymOSRoutineProposals.createProposalRecord({
      ownerId:OWNER_A,proposal:target,currentRoutine:current,
      timestamp:"2026-07-29T10:00:00.000Z"
    });
    const result=plain(context.GymOSRoutineActivation.createActivationPlan({
      ownerId:OWNER_A,proposalRecord:record,currentRoutine:current,
      currentCanonicalRoutine:current,selectedSessionId:"stable-session-2",
      targetRoutineId:`target-routine-${count}`,confirmed:true,
      timestamp:"2026-07-29T11:00:00.000Z"
    }));
    assert.equal(result.ok,true);
    assert.equal(result.runtimeCompatible,true);
    assert.equal(result.applicationError,null);
    assert.deepEqual(
      result.canonicalRoutine.sessions.map(session=>session.sessionId),
      target.sessions.map(session=>session.id)
    );
    assert.equal(result.selectedSessionId,"target-session-1");
    assert.deepEqual(Object.keys(result.routine),["A","B","C"]);
    assert.equal(Object.hasOwn(result.routine,"D"),false);
  });
}

test("stale de drafts solo cambia cuando cambia la definición de su sesión y es idempotente",()=>{
  const context=load(),migration=context.GymOSRoutineSessionMigration;
  const value=routine(6);
  const hashD=migration.sessionDefinitionHash(value,"stable-session-4");
  const hashF=migration.sessionDefinitionHash(value,"stable-session-6");
  const container={
    schemaVersion:"4.2",routineId:value.routineId,orphanedLegacyDrafts:{},
    draftsBySessionId:{
      "stable-session-4":draft("stable-session-4",{sessionDefinitionHash:hashD}),
      "stable-session-6":draft("stable-session-6",{
        sessionId:"stable-session-6",draftId:"draft-stable-session-6",
        sessionDefinitionHash:hashF
      })
    }
  };
  const changed=plain(value);
  changed.revision=2;
  changed.sessions.find(session=>session.sessionId==="stable-session-6").exercises[0].sets=4;
  const once=plain(migration.markStaleDrafts(container,{
    ownerId:OWNER_A,canonicalRoutine:changed
  }));
  const twice=plain(migration.markStaleDrafts(once,{
    ownerId:OWNER_A,canonicalRoutine:changed
  }));
  assert.equal(once.draftsBySessionId["stable-session-4"].stale,undefined);
  assert.equal(once.draftsBySessionId["stable-session-6"].stale,true);
  assert.equal(JSON.stringify(twice),JSON.stringify(once));
});

test("Fase I conserva consolidados los duplicados preexistentes equivalentes",()=>{
  const count=name=>(appSource.match(new RegExp(`function ${name}\\(`,"g"))||[]).length;
  assert.equal(count("getDeviceId"),1);
  assert.equal(count("addDays"),1);
  assert.equal(count("estimatedOneRepMax"),1);
  assert.equal(count("renderExerciseLibrary"),1);
  assert.equal(count("renderExerciseLibraryEditor"),1);
  assert.equal(count("renderExerciseDetail"),1);
});

test("H4 invalida operaciones pendientes al cambiar de propietario",()=>{
  const reset=appSource.slice(
    appSource.indexOf("function resetRoutineSessionOwnerState"),
    appSource.indexOf("function assertActiveLocalOwner")
  );
  assert.match(reset,/routineImportReadSequence\+=1/);
  assert.match(reset,/state\.routineImport=null/);
  assert.match(reset,/state\.routineFileBusy=null/);
  assert.match(reset,/state\.routineWorkflow=null/);
  assert.match(reset,/state\.selectedSessionId=null/);
  assert.match(reset,/state\.editingSession=null/);
  assert.match(reset,/state\.finishingWorkout=false/);
});

test("H4 revalida propietario y busy después de cada frontera asíncrona",()=>{
  const events=appSource.slice(
    appSource.indexOf("function bindRoutineWorkflowEvents"),
    appSource.indexOf("function renderRoutineWorkflow()")
  );
  for(const operation of ["generating","rejecting","activating","rolling_back"]){
    assert.match(events,new RegExp(
      `currentRoutineOwnerOrNull\\(\\)!==ownerAtStart[\\s\\S]{0,160}busy!==\"${operation}\"`
    ));
  }
});

test("selector dinámico de sesiones expone semántica accesible",()=>{
  const editor=appSource.slice(
    appSource.indexOf("function renderRoutineEditor"),
    appSource.indexOf("function renderBlocks")
  );
  assert.match(editor,/role="tablist" aria-label="Sesiones de la rutina"/);
  assert.match(editor,/type="button" role="tab" aria-selected=/);
  assert.match(editor,/data-edit-session="\$\{esc\(item\.sessionId\)\}"/);
});

test("H4 no muestra identificadores internos en la interfaz normal",()=>{
  assert.doesNotMatch(appSource,/getDeviceId\(\)\.slice/);
  assert.doesNotMatch(appSource,/propuesta \$\{esc\(activation\.proposalId\)\}/);
  assert.match(appSource,/Activaci.n del \$\{esc\(routineWorkflowDate\(activation\.activatedAt\)\)\}/);
});

test("H4 recorre activación, drafts, historial, rotación, aislamiento y rollback con seis sesiones",()=>{
  const context=loadFull(),current=routine(2),target=proposal(6);
  const record=context.GymOSRoutineProposals.createProposalRecord({
    ownerId:OWNER_A,proposal:target,currentRoutine:current,
    timestamp:"2026-07-29T10:00:00.000Z"
  });
  const plan=plain(context.GymOSRoutineActivation.createActivationPlan({
    ownerId:OWNER_A,proposalRecord:record,currentRoutine:current,
    currentCanonicalRoutine:current,selectedSessionId:"stable-session-2",
    targetRoutineId:"runtime-e2e-routine",confirmed:true,
    timestamp:"2026-07-29T11:00:00.000Z"
  }));
  assert.equal(plan.ok,true);
  assert.equal(plan.canonicalRoutine.sessions.length,6);

  let drafts=context.GymOSRoutineSessionMigration.emptyDraftContainer(
    plan.canonicalRoutine.routineId
  );
  const history=[];
  plan.canonicalRoutine.sessions.forEach((session,index)=>{
    const value={
      draftId:`runtime-e2e-draft-${index+1}`,ownerId:OWNER_A,
      routineId:plan.canonicalRoutine.routineId,
      routineRevision:plan.canonicalRoutine.revision,
      sessionId:session.sessionId,
      sessionDefinitionHash:context.GymOSRoutineSessionMigration.sessionDefinitionHash(
        plan.canonicalRoutine,session.sessionId
      ),
      startedAt:0,updatedAt:"2026-07-29T11:00:00.000Z",
      sessionSnapshot:{
        name:session.name,label:session.label,focus:session.focus,
        order:session.order,legacySessionKey:session.legacySessionKey||null
      },
      exercises:plain(session.exercises)
    };
    drafts=context.GymOSRoutineSessionRuntime.upsertDraft(drafts,value,{
      ownerId:OWNER_A,routine:plan.canonicalRoutine
    });
    history.push(plain(context.GymOSRoutineSessionRuntime.historyEntry({
      ownerId:OWNER_A,routine:plan.canonicalRoutine,sessionId:session.sessionId,
      draft:value,workoutId:index+1,
      date:`2026-07-${String(20+index).padStart(2,"0")}T10:00:00.000Z`,
      durationMs:2700000,completedSeries:3,exercises:value.exercises
    })));
  });
  assert.equal(Object.keys(drafts.draftsBySessionId).length,6);
  assert.equal(new Set(history.map(item=>item.sessionId)).size,6);
  assert.equal(
    context.GymOSRoutineSessionRuntime.nextSessionId(
      plan.canonicalRoutine,plan.canonicalRoutine.sessions[5].sessionId
    ),
    plan.canonicalRoutine.sessions[0].sessionId
  );
  assert.equal(context.GymOSRoutineSessionRuntime.getDraft(drafts,{
    ownerId:OWNER_B,routine:plan.canonicalRoutine,
    sessionId:plan.canonicalRoutine.sessions[0].sessionId
  }),null);
  const rollback=context.GymOSRoutineActivation.rollbackDecision({
    ownerId:OWNER_A,activationRecord:plan.record,
    currentRoutine:plan.routine,currentCanonicalRoutine:plan.canonicalRoutine
  });
  assert.equal(rollback.ok,true);
  assert.equal(rollback.idempotent,false);
});
