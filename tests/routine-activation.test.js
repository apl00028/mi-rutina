"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const test=require("node:test");

const root=path.resolve(__dirname,"..");
const proposalSource=fs.readFileSync(path.join(root,"routine-proposals.js"),"utf8");
const sessionModelSource=fs.readFileSync(path.join(root,"routine-session-model.js"),"utf8");
const activationSource=fs.readFileSync(path.join(root,"routine-activation.js"),"utf8");
const appSource=fs.readFileSync(path.join(root,"app.js"),"utf8");
const indexSource=fs.readFileSync(path.join(root,"index.html"),"utf8");
const workerSource=fs.readFileSync(path.join(root,"service-worker.js"),"utf8");
const OWNER_A="11111111-1111-4111-8111-111111111111";
const OWNER_B="22222222-2222-4222-8222-222222222222";
const T1="2026-07-28T10:00:00.000Z";
const T2="2026-07-28T11:00:00.000Z";

function loadApi(){
  const normalizeOwnerId=value=>{
    if(value==="local") return value;
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value||""))){
      throw new Error("invalid owner");
    }
    return value.toLowerCase();
  };
  const context={console,GymOSProfileData:{normalizeOwnerId}};
  context.window=context;
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(sessionModelSource,context,{filename:"routine-session-model.js"});
  vm.runInContext(proposalSource,context,{filename:"routine-proposals.js"});
  vm.runInContext(activationSource,context,{filename:"routine-activation.js"});
  return {activation:context.GymOSRoutineActivation,proposals:context.GymOSRoutineProposals};
}
function plain(value){return JSON.parse(JSON.stringify(value));}
function deepFreeze(value){
  if(value&&typeof value==="object"&&!Object.isFrozen(value)){
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
function exercise(id,index=1){
  return {
    exerciseId:id,name:`Ejercicio ${index}`,pattern:index%2?"horizontal_push":"horizontal_pull",
    role:"main",weight:75,
    prescription:{
      sets:3,target:{type:"repetitions",min:8,max:12},
      targetRir:{min:2,max:3},restSeconds:90,recordType:"weight_reps"
    },
    metadata:{source:"test"}
  };
}
function proposal(id="proposal-1",sessionCount=3,overrides={}){
  return {
    proposalId:id,generatedAt:T1,generatorVersion:"test",status:"pending",
    reviewRequired:false,warnings:[],unresolvedQuestions:[],
    weeklyStructure:{id:"test",days:sessionCount},
    sessions:Array.from({length:sessionCount},(_,index)=>({
      id:`session-${index+1}`,label:`Sesión ${index+1}`,
      focus:index%2?"lower":"upper",
      exercises:[exercise(`exercise-${index+1}`,index+1)]
    })),
    coverage:{requiredPatterns:[],coveredPatterns:[],missingPatterns:[],balanced:true},
    validation:{valid:true,results:[]},
    ...overrides
  };
}
function routine(){
  return {
    A:[{id:"old-a",name:"Anterior A",target:"8 reps",sets:3,increment:2.5,type:"peso"}],
    B:[{id:"old-b",name:"Anterior B",target:"10 reps",sets:3,increment:2.5,type:"peso"}],
    C:[]
  };
}
function record(api,value=proposal(),ownerId=OWNER_A,currentRoutine=routine()){
  return plain(api.proposals.createProposalRecord({
    ownerId,proposal:value,currentRoutine,timestamp:T1
  }));
}
function plan(api,options={}){
  const current=options.currentRoutine||routine();
  const value=options.proposal||proposal("proposal-1",options.days||3);
  const proposalRecord=options.record||record(api,value,options.ownerId||OWNER_A,current);
  return plain(api.activation.createActivationPlan({
    ownerId:options.ownerId||OWNER_A,proposalRecord,currentRoutine:current,
    targetRoutineId:options.targetRoutineId||"routine-target-fixed",
    selectedSession:"B",drafts:{A:{x:1},B:{x:2},C:null},
    rawBaseline:{
      routine:JSON.stringify(current),selectedSession:"B",
      drafts:{A:'{"x":1}',B:'{"x":2}',C:null}
    },
    confirmed:options.confirmed??true,timestamp:options.timestamp||T1,
    activeWorkoutState:options.activeWorkoutState??false
  }));
}

test("1. activa una propuesta compatible de dos sesiones",()=>{
  const api=loadApi(),result=plan(api,{days:2});
  assert.equal(result.ok,true);
  assert.equal(result.routine.A.length,1);
  assert.equal(result.routine.B.length,1);
  assert.equal(Object.hasOwn(result.routine,"C"),false);
});

test("2. activa una propuesta compatible de tres sesiones",()=>{
  const api=loadApi(),result=plan(api,{days:3});
  assert.equal(result.ok,true);
  assert.equal(result.routine.C.length,1);
});

test("3. prepara cuatro días para el runtime dinámico",()=>{
  const api=loadApi(),value=proposal("p-4",4),proposalRecord=record(api,value);
  const result=plan(api,{proposal:value,record:proposalRecord});
  assert.equal(result.ok,true);
  assert.equal(result.runtimeCompatible,true);
  assert.equal(result.applicationError,null);
  assert.equal(result.canonicalRoutine.sessions.length,4);
  assert.deepEqual(Object.keys(result.routine),["A","B","C"]);
});

test("4. rechaza una propuesta stale",()=>{
  const api=loadApi(),proposalRecord=record(api);
  proposalRecord.comparison.stale=true;
  assert.equal(plan(api,{record:proposalRecord}).code,"proposal_stale");
});

test("5. rechaza si el baseline no coincide",()=>{
  const api=loadApi(),proposalRecord=record(api);
  proposalRecord.baseline.routineHash="routine-otro";
  assert.equal(plan(api,{record:proposalRecord}).code,"baseline_mismatch");
});

test("6. rechaza reviewRequired",()=>{
  const api=loadApi(),value=proposal("p-review",3,{reviewRequired:true});
  assert.equal(plan(api,{proposal:value,record:record(api,value)}).code,"proposal_requires_review");
});

test("7. rechaza patrones obligatorios sin resolver",()=>{
  const api=loadApi(),value=proposal("p-missing",3,{
    coverage:{requiredPatterns:["squat"],coveredPatterns:[],missingPatterns:["squat"],balanced:false}
  });
  assert.equal(plan(api,{proposal:value,record:record(api,value)}).code,"proposal_requires_review");
});

test("8. mapea determinísticamente a A/B/C",()=>{
  const api=loadApi(),value=proposal(),first=api.activation.mapProposalToRoutine(value);
  const second=api.activation.mapProposalToRoutine(value);
  assert.equal(JSON.stringify(first),JSON.stringify(second));
  assert.deepEqual(plain(first.sessionMapping),{
    "session-1":"A","session-2":"B","session-3":"C"
  });
});

test("9. conserva copia exacta de la rutina previa",()=>{
  const api=loadApi(),current=routine(),result=plan(api,{currentRoutine:current});
  assert.equal(JSON.stringify(result.record.baseline.routine),JSON.stringify(current));
  assert.equal(result.record.baseline.routineRaw,JSON.stringify(current));
});

test("10. conserva copia exacta de borradores",()=>{
  const api=loadApi(),result=plan(api);
  assert.deepEqual(result.record.baseline.drafts,{A:{x:1},B:{x:2},C:null});
  assert.deepEqual(result.record.baseline.draftsRaw,{A:'{"x":1}',B:'{"x":2}',C:null});
});

test("11. la transacción puede limpiar borradores después del snapshot",()=>{
  const api=loadApi();
  const store={draftA:"a",draftB:"b",draftC:"c"};
  const before=JSON.stringify(store);
  const result=api.activation.executeTransaction({
    capture:()=>plain(store),restore:snapshot=>Object.assign(store,snapshot)
  },[
    ()=>{store.draftA=null;store.draftB=null;store.draftC=null;}
  ]);
  assert.equal(result.ok,true);
  assert.notEqual(JSON.stringify(store),before);
  assert.deepEqual(store,{draftA:null,draftB:null,draftC:null});
});

test("12. el módulo no escribe ni referencia gymos:history",()=>{
  assert.doesNotMatch(activationSource,/gymos:history|saveHistory|getHistory/);
});

test("13. un fallo durante la escritura restaura todo exactamente",()=>{
  const api=loadApi();
  const store={routine:"old",draft:"draft",proposal:"pending",history:"same"};
  const before=JSON.stringify(store);
  const result=api.activation.executeTransaction({
    capture:()=>plain(store),
    restore:snapshot=>{
      Object.keys(store).forEach(key=>delete store[key]);
      Object.assign(store,snapshot);
    }
  },[
    ()=>{store.routine="new";},
    ()=>{store.draft=null;},
    ()=>{throw new Error("write failed");},
    ()=>{store.proposal="activated";}
  ]);
  assert.equal(result.code,"transaction_failed");
  assert.equal(JSON.stringify(store),before);
});

test("14. activar repetidamente la misma propuesta es idempotente",()=>{
  const api=loadApi(),created=plan(api).record;
  const first=api.activation.addActivationRecord([] ,created,{ownerId:OWNER_A});
  const second=api.activation.addActivationRecord(first.records,created,{ownerId:OWNER_A});
  assert.equal(second.created,false);
  assert.equal(JSON.stringify(first.records),JSON.stringify(second.records));
});

test("15. reversión correcta devuelve una decisión válida",()=>{
  const api=loadApi(),created=plan(api).record;
  const decision=api.activation.rollbackDecision({
    ownerId:OWNER_A,activationRecord:created,currentRoutine:created.activated.routine
  });
  assert.equal(decision.ok,true);
  assert.equal(decision.idempotent,false);
});

test("16. la reversión conserva selectedSession y borradores restaurables",()=>{
  const api=loadApi(),created=plan(api).record;
  assert.equal(created.baseline.selectedSessionRaw,"B");
  assert.equal(created.baseline.draftsRaw.A,'{"x":1}');
  assert.equal(created.baseline.draftsRaw.B,'{"x":2}');
});

test("17. marcar rolled_back no altera el snapshot",()=>{
  const api=loadApi(),created=plan(api).record;
  const baseline=JSON.stringify(created.baseline);
  const rolled=api.activation.markRolledBack(created,T2);
  assert.equal(JSON.stringify(rolled.baseline),baseline);
  assert.equal(rolled.rollback.restoredRoutineHash,created.baseline.routineHash);
});

test("18. bloquea la reversión si la rutina cambió",()=>{
  const api=loadApi(),created=plan(api).record;
  const decision=api.activation.rollbackDecision({
    ownerId:OWNER_A,activationRecord:created,currentRoutine:routine()
  });
  assert.equal(decision.code,"routine_changed");
  const blocked=api.activation.markRollbackBlocked(created,decision.code,T2);
  assert.equal(blocked.status,"rollback_blocked");
  assert.equal(blocked.rollback.blockedReason,"routine_changed");
});

test("19. repetir una reversión completada es idempotente",()=>{
  const api=loadApi(),rolled=api.activation.markRolledBack(plan(api).record,T2);
  const decision=api.activation.rollbackDecision({
    ownerId:OWNER_A,activationRecord:rolled,currentRoutine:routine()
  });
  assert.equal(decision.ok,true);
  assert.equal(decision.idempotent,true);
});

test("20. la propuesta original permanece inmutable",()=>{
  const api=loadApi(),value=proposal(),before=JSON.stringify(value);
  deepFreeze(value);
  const mapped=api.activation.mapProposalToRoutine(value);
  assert.equal(JSON.stringify(value),before);
  assert.equal(mapped.routine.A[0].weight,undefined);
});

test("21. aislamiento entre dos propietarios",()=>{
  const api=loadApi(),created=plan(api).record;
  assert.deepEqual(plain(api.activation.normalizeRecords([created],OWNER_B)),[]);
  assert.equal(api.activation.rollbackDecision({
    ownerId:OWNER_B,activationRecord:created,currentRoutine:created.activated.routine
  }).code,"invalid_activation");
});

test("22. payload extranjero y ownerId inválido se rechazan con incidencia",()=>{
  const api=loadApi(),foreign=plan(api,{ownerId:OWNER_B}).record;
  const result=api.activation.mergeActivationRecords([],[
    foreign,{...foreign,activationId:"bad",ownerId:"correo@example.com"}
  ],{ownerId:OWNER_A});
  assert.equal(result.records.length,0);
  assert.equal(result.incidents.length,2);
});

test("23. backup y restauración mantienen activaciones funcionales",()=>{
  assert.match(appSource,/GYMOS_BACKUP_KEYS=[\s\S]*"gymos:routineActivationHistory"/);
  assert.match(appSource,/function buildGymOSBackup\([\s\S]*GYMOS_BACKUP_KEYS/);
  assert.match(appSource,/function importGymOSBackup\([\s\S]*gymos:routineActivationHistory/);
});

test("24. un backup antiguo sin activaciones sigue siendo opcional",()=>{
  assert.match(appSource,/if\(Array\.isArray\(payload\.routineActivationHistory\)\)/);
  assert.doesNotMatch(appSource,/throw new Error\([^)]*routineActivationHistory/);
});

test("25. sincronización repetida de activaciones es JSON-idempotente",()=>{
  const api=loadApi(),created=plan(api).record;
  const first=api.activation.mergeActivationRecords([],[created],{ownerId:OWNER_A});
  const second=api.activation.mergeActivationRecords(first.records,[created],{
    ownerId:OWNER_A,activeActivationId:first.activeActivationId
  });
  assert.equal(JSON.stringify(first.records),JSON.stringify(second.records));
  assert.equal(first.activeActivationId,second.activeActivationId);
});

test("26. limita a 10 y protege la activación reversible activa",()=>{
  const api=loadApi();
  const records=Array.from({length:12},(_,index)=>{
    const created=plan(api,{
      proposal:proposal(`p-${index}`,2),
      timestamp:`2026-07-${String(index+1).padStart(2,"0")}T10:00:00.000Z`
    }).record;
    return index===11?created:api.activation.markRolledBack(created,T2);
  });
  const active=records[11].activationId;
  const trimmed=api.activation.normalizeRecords(records,OWNER_A,{activeActivationId:active});
  assert.equal(trimmed.length,10);
  assert.ok(trimmed.some(item=>item.activationId===active&&item.status==="activated"));
});

test("27. eliminar un propietario no selecciona ni reasigna registros ajenos",()=>{
  const api=loadApi(),a=plan(api).record,b=plan(api,{ownerId:OWNER_B}).record;
  const onlyB=api.activation.normalizeRecords([a,b],OWNER_B);
  assert.equal(onlyB.length,1);
  assert.equal(onlyB[0].ownerId,OWNER_B);
  assert.equal(api.activation.selectActiveActivationId(onlyB,OWNER_B),b.activationId);
});

test("28. una operación rechazada mantiene rutina e historial JSON exactos",()=>{
  const api=loadApi(),value=proposal("p-stale"),proposalRecord=record(api,value);
  proposalRecord.comparison.stale=true;
  const store={routine:routine(),history:[{id:"h1"}]};
  const before=JSON.stringify(store);
  const result=api.activation.createActivationPlan({
    ownerId:OWNER_A,proposalRecord,currentRoutine:store.routine,
    confirmed:true,timestamp:T1
  });
  assert.equal(result.ok,false);
  assert.equal(JSON.stringify(store),before);
});

test("29. exige confirmación explícita y propietario válido",()=>{
  const api=loadApi(),proposalRecord=record(api);
  assert.equal(plan(api,{record:proposalRecord,confirmed:false}).code,"explicit_confirmation_required");
  const invalid=api.activation.validateActivationRequest({
    ownerId:"user@example.com",proposalRecord,currentRoutine:routine(),confirmed:true
  });
  assert.equal(invalid.code,"invalid_owner");
});

test("29b. un entrenamiento activo bloquea activación sin alterar la propuesta",()=>{
  const api=loadApi(),value=proposal(),before=JSON.stringify(value);
  const result=plan(api,{proposal:value,activeWorkoutState:true});
  assert.equal(result.ok,false);
  assert.equal(result.code,"active_workout_in_progress");
  assert.equal(result.message,api.activation.ACTIVE_WORKOUT_MESSAGE);
  assert.equal(JSON.stringify(value),before);
});

test("29c. reconfiguración conserva estimatedDurationMin al activar",()=>{
  const api=loadApi();
  const value=proposal("duration",2);
  value.sessions[0].estimatedDurationMin=47;
  const result=plan(api,{proposal:value});
  assert.equal(result.ok,true);
  assert.equal(result.canonicalRoutine.sessions[0].estimatedDurationMinutes,47);
});

test("30. rechaza sesiones vacías e identificadores de ejercicio ausentes",()=>{
  const api=loadApi();
  const empty=proposal("empty",2);
  empty.sessions[0].exercises=[];
  assert.equal(plan(api,{proposal:empty,record:record(api,empty)}).code,"invalid_proposal_sessions");
  const invalid=proposal("invalid",2);
  delete invalid.sessions[0].exercises[0].exerciseId;
  assert.equal(plan(api,{proposal:invalid,record:record(api,invalid)}).code,"invalid_proposal_sessions");
});

test("31. lifecycle de propuesta permite activated y rolled_back explícitos",()=>{
  const api=loadApi(),value=proposal(),stored=record(api,value);
  const activated=api.proposals.transitionProposalLifecycle([stored],{
    ownerId:OWNER_A,proposalId:value.proposalId,status:"activated",timestamp:T1
  });
  const rolled=api.proposals.transitionProposalLifecycle(activated,{
    ownerId:OWNER_A,proposalId:value.proposalId,status:"rolled_back",timestamp:T2
  });
  assert.equal(activated[0].lifecycle.status,"activated");
  assert.equal(rolled[0].lifecycle.status,"rolled_back");
});

test("32. integración carga el módulo antes de app y el worker solo lo cachea",()=>{
  assert.ok(indexSource.indexOf('src="routine-activation.js"')<indexSource.indexOf('src="app.js"'));
  assert.match(workerSource,/routine-activation\.js/);
  assert.doesNotMatch(activationSource,/document\.|querySelector|render\(|navigate|location\./);
  assert.ok((appSource.match(/activateStoredRoutineProposal\(/g)||[]).length>=2);
  assert.equal((appSource.match(/rollbackStoredRoutineActivation\(/g)||[]).length,2);
  assert.ok(appSource.indexOf("checkbox?.checked")<appSource.lastIndexOf("confirmed:true"));
});

test("33. activationId conflictivo conserva el baseline y la rutina activada originales",()=>{
  const api=loadApi(),original=plan(api).record;
  const conflict=plain(original);
  conflict.baseline.routine={A:[{id:"intruso"}],B:[],C:[]};
  conflict.activated.routine={A:[{id:"otra"}],B:[{id:"rutina"}],C:[]};
  conflict.activated.routineHash=api.proposals.routineHash(conflict.activated.routine);
  conflict.activatedAt=T2;
  const result=api.activation.mergeActivationRecords([original],[conflict],{ownerId:OWNER_A});
  assert.deepEqual(plain(result.incidents),[{
    code:"activation_id_conflict",activationId:original.activationId
  }]);
  assert.equal(JSON.stringify(result.records[0]),JSON.stringify(original));
});

test("34. activationId reutilizado por otro propietario es conflicto, no reasignación",()=>{
  const api=loadApi(),original=plan(api).record;
  const foreign={...plain(original),ownerId:OWNER_B};
  const result=api.activation.mergeActivationRecords([original],[foreign],{ownerId:OWNER_A});
  assert.deepEqual(plain(result.incidents),[{
    code:"activation_id_conflict",activationId:original.activationId
  }]);
  assert.equal(result.records[0].ownerId,OWNER_A);
});

test("35. cambios legítimos de rollback se fusionan sin mezclar snapshots",()=>{
  const api=loadApi(),original=plan(api).record;
  const rolled=api.activation.markRolledBack(original,T2);
  const result=api.activation.mergeActivationRecords([original],[rolled],{ownerId:OWNER_A});
  assert.equal(result.incidents.length,0);
  assert.equal(result.records[0].status,"rolled_back");
  assert.equal(JSON.stringify(result.records[0].baseline),JSON.stringify(original.baseline));
  assert.equal(JSON.stringify(result.records[0].activated),JSON.stringify(original.activated));
});

test("36. proposalId repetida con otro timestamp no crea otra activación",()=>{
  const api=loadApi(),firstPlan=plan(api,{timestamp:T1});
  const secondPlan=plan(api,{timestamp:T2});
  assert.notEqual(firstPlan.record.activationId,secondPlan.record.activationId);
  const first=api.activation.addActivationRecord([],firstPlan.record,{ownerId:OWNER_A});
  const reloaded=plain(first.records);
  const second=api.activation.addActivationRecord(reloaded,secondPlan.record,{
    ownerId:OWNER_A,activeActivationId:null
  });
  assert.equal(second.created,false);
  assert.equal(second.records.length,1);
  assert.equal(second.record.activationId,firstPlan.record.activationId);
});

test("37. activeRoutineActivationId revalida inexistente, extranjero y estados finales",()=>{
  const api=loadApi(),active=plan(api).record;
  const other=plan(api,{proposal:proposal("proposal-2",2),timestamp:T2}).record;
  assert.equal(api.activation.selectActiveActivationId([active],OWNER_A,"missing"),active.activationId);
  assert.equal(api.activation.selectActiveActivationId([active],OWNER_A,other.activationId),active.activationId);
  const rolled=api.activation.markRolledBack(active,T2);
  assert.equal(api.activation.selectActiveActivationId([rolled],OWNER_A,active.activationId),null);
  const blocked=api.activation.markRollbackBlocked(active,"routine_changed",T2);
  assert.equal(api.activation.selectActiveActivationId([blocked],OWNER_A,active.activationId),null);
});

test("38. el recorte revalida un ID eliminado y elige otra reversible determinísticamente",()=>{
  const api=loadApi();
  const records=Array.from({length:11},(_,index)=>plan(api,{
    proposal:proposal(`trim-${index}`,2),
    timestamp:`2026-07-${String(index+1).padStart(2,"0")}T10:00:00.000Z`
  }).record);
  const removedCandidate=records[0].activationId;
  const trimmed=api.activation.trimRecords(records,OWNER_A,"missing");
  assert.equal(trimmed.length,10);
  assert.ok(!trimmed.some(item=>item.activationId===removedCandidate));
  assert.equal(
    api.activation.selectActiveActivationId(trimmed,OWNER_A,removedCandidate),
    trimmed[0].activationId
  );
});

test("39. restaura presencia y ausencia exactas de claves tras cada etapa fallida",()=>{
  const api=loadApi();
  const initialEntries=[
    ["gymos:routine",'{"A":[]}'],
    ["gymos:draft:A",""],
    ["gymos:draft:B","null"],
    ["gymos:routineProposals",'[{"id":"p"}]'],
    ["gymos:history",'[{"id":"h"}]']
  ];
  const stages=[
    ["snapshot",()=>{}],
    ["routine",store=>store.set("gymos:routine",'{"A":[1]}')],
    ["draft",store=>store.delete("gymos:draft:A")],
    ["selected",store=>store.set("gymos:selectedSession","A")],
    ["activation",store=>store.set("gymos:routineActivationHistory","[]")],
    ["proposal",store=>store.set("gymos:routineProposals",'[{"status":"activated"}]')],
    ["vault",store=>store.set("gymos:vault:owner","{}")],
    ["sync",store=>{
      store.set("gymos:updatedAt",T2);
      store.set("gymos:localRevision","9");
      store.set("gymos:syncPending","1");
    }]
  ];
  stages.forEach(([,mutate],failureIndex)=>{
    const store=new Map(initialEntries);
    const before=JSON.stringify([...store.entries()].sort());
    const steps=stages.slice(0,failureIndex+1).map(([,stage])=>()=>stage(store));
    steps.push(()=>{throw new Error(`failure-${failureIndex}`);});
    const result=api.activation.executeTransaction({
      capture:()=>new Map(store),
      restore:snapshot=>{
        store.clear();
        snapshot.forEach((value,key)=>store.set(key,value));
      }
    },steps);
    assert.equal(result.code,"transaction_failed");
    assert.equal(JSON.stringify([...store.entries()].sort()),before);
    ["gymos:selectedSession","gymos:updatedAt","gymos:localRevision",
      "gymos:activeRoutineActivationId","gymos:vault:owner"
    ].forEach(key=>assert.equal(store.has(key),false));
  });
  assert.match(appSource,/"gymos:localRevision"/);
});

test("40. dos sesiones excluyen C de sugerencias y selectores del runtime",()=>{
  const api=loadApi(),mapped=plan(api,{days:2}).routine;
  const available=["A","B","C"].filter(key=>Array.isArray(mapped[key])&&mapped[key].length>0);
  const next=last=>available[(available.indexOf(last)+1)%available.length];
  assert.deepEqual(available,["A","B"]);
  assert.equal(next("A"),"B");
  assert.equal(next("B"),"A");
  const suggestionSource=appSource.slice(
    appSource.indexOf("function nextSuggestedSession"),appSource.indexOf("function draftKey")
  );
  assert.ok(!suggestionSource.includes('h[0].session === "A" ? "B"'));
  assert.match(appSource,/function availableRoutineSessions/);
  assert.match(appSource,/function navigateToScreen[\s\S]*availableRoutineSessions\(\)/);
});

test("41. el formato A/B/C conserva prescripción y descarta datos de ejecución",()=>{
  const api=loadApi(),value=proposal("format",2);
  Object.assign(value.sessions[0].exercises[0],{
    notes:"Nota técnica",equipment:["barbell"],variant:"inclinado",
    series:[{kg:80,reps:10,done:true}],completed:true,done:true,kg:80,
    results:{volume:2400}
  });
  const before=JSON.stringify(value);
  const mapped=api.activation.mapProposalToRoutine(value).routine.A[0];
  assert.equal(mapped.exerciseId,"exercise-1");
  assert.equal(mapped.name,"Ejercicio 1");
  assert.equal(mapped.sets,3);
  assert.equal(mapped.target,"8–12 reps");
  assert.deepEqual(plain(mapped.targetRir),{min:2,max:3});
  assert.equal(mapped.restSeconds,90);
  assert.equal(mapped.pattern,"horizontal_push");
  assert.equal(mapped.role,"main");
  assert.equal(mapped.recordType,"weight_reps");
  assert.equal(mapped.notes,"Nota técnica");
  assert.deepEqual(plain(mapped.metadata),{source:"test"});
  ["weight","kg","series","completed","done","results"].forEach(key=>
    assert.equal(Object.hasOwn(mapped,key),false)
  );
  assert.equal(JSON.stringify(value),before);
});

test("42. Fase C y Fase D comparten exactamente routineHash",()=>{
  const api=loadApi(),current=routine(),proposalRecord=record(api,proposal(),OWNER_A,current);
  const created=plan(api,{currentRoutine:current,record:proposalRecord});
  assert.equal(proposalRecord.baseline.routineHash,api.proposals.routineHash(current));
  assert.equal(created.record.baseline.routineHash,proposalRecord.baseline.routineHash);
  assert.equal(
    created.record.activated.routineHash,
    api.proposals.routineHash(created.record.activated.routine)
  );
  assert.match(activationSource,/return proposals\(\)\.routineHash\(routine\)/);
});

test("43. rollback bloqueado repetido es JSON-idempotente y conserva auditoría",()=>{
  const api=loadApi(),active=plan(api).record;
  const first=api.activation.markRollbackBlocked(active,"routine_changed",T2);
  const records=api.activation.updateRecord([active],first,{
    ownerId:OWNER_A,activeActivationId:active.activationId
  });
  const before=JSON.stringify(records);
  const decision=api.activation.rollbackDecision({
    ownerId:OWNER_A,activationRecord:first,currentRoutine:routine()
  });
  assert.equal(decision.code,"rollback_not_available");
  assert.equal(JSON.stringify(records),before);
  assert.equal(records.activeActivationId,null);
  assert.equal(JSON.stringify(records.records[0].baseline),JSON.stringify(active.baseline));
});

test("44. solo el registro funcional completo entra en sync, vault y exportaciones",()=>{
  assert.match(appSource,/routineActivationHistory:getRoutineActivationRecords\(\)/);
  assert.match(appSource,/function applySyncPayload[\s\S]*importRoutineActivationSyncData/);
  assert.match(appSource,/GYMOS_BACKUP_KEYS=[\s\S]*"gymos:routineActivationHistory"/);
  assert.match(appSource,/function localDataKeys\(\)[\s\S]*GYMOS_BACKUP_KEYS/);
  assert.doesNotMatch(appSource,/gymos:routineActivationSnapshot|gymos:activationTransaction/);
  assert.doesNotMatch(activationSource,/localStorage|supabase|auth\./);
});

test("45. lifecycle activado y revertido no vuelve a pending_review",()=>{
  const api=loadApi(),value=proposal(),stored=record(api,value);
  const activated=api.proposals.transitionProposalLifecycle([stored],{
    ownerId:OWNER_A,proposalId:value.proposalId,status:"activated",timestamp:T1
  });
  assert.equal(api.proposals.selectActiveProposalId(activated,OWNER_A,value.proposalId),null);
  const repeated=api.proposals.transitionProposalLifecycle(activated,{
    ownerId:OWNER_A,proposalId:value.proposalId,status:"activated",timestamp:T2
  });
  assert.equal(JSON.stringify(repeated),JSON.stringify(activated));
  const rolled=api.proposals.transitionProposalLifecycle(activated,{
    ownerId:OWNER_A,proposalId:value.proposalId,status:"rolled_back",timestamp:T2
  });
  assert.equal(rolled[0].lifecycle.status,"rolled_back");
  assert.equal(rolled[0].baseline.routineHash,stored.baseline.routineHash);
  assert.equal(api.proposals.selectActiveProposalId(rolled,OWNER_A),null);
});
