"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const test=require("node:test");

const root=path.resolve(__dirname,"..");
const modelSource=fs.readFileSync(path.join(root,"routine-session-model.js"),"utf8");
const migrationSource=fs.readFileSync(path.join(root,"routine-session-migration.js"),"utf8");
const proposalsSource=fs.readFileSync(path.join(root,"routine-proposals.js"),"utf8");
const activationSource=fs.readFileSync(path.join(root,"routine-activation.js"),"utf8");
const appSource=fs.readFileSync(path.join(root,"app.js"),"utf8");
const profileSource=fs.readFileSync(path.join(root,"profile-data.js"),"utf8");
const indexSource=fs.readFileSync(path.join(root,"index.html"),"utf8");
const workerSource=fs.readFileSync(path.join(root,"service-worker.js"),"utf8");
const OWNER_A="11111111-1111-4111-8111-111111111111";
const OWNER_B="22222222-2222-4222-8222-222222222222";
const T1="2026-07-29T10:00:00.000Z";

function plain(value){return JSON.parse(JSON.stringify(value));}
function loadMigration(){
  const context={console};
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(modelSource,context,{filename:"routine-session-model.js"});
  vm.runInContext(migrationSource,context,{filename:"routine-session-migration.js"});
  return {model:context.GymOSRoutineSessionModel,migration:context.GymOSRoutineSessionMigration};
}
function loadActivation(){
  const context={
    console,
    GymOSProfileData:{
      normalizeOwnerId:value=>{
        const normalized=String(value||"").toLowerCase();
        if(normalized==="local"||/^[0-9a-f-]{36}$/.test(normalized)) return normalized;
        throw new Error("invalid_owner");
      }
    }
  };
  context.globalThis=context;
  context.window=context;
  vm.createContext(context);
  vm.runInContext(modelSource,context,{filename:"routine-session-model.js"});
  vm.runInContext(proposalsSource,context,{filename:"routine-proposals.js"});
  vm.runInContext(activationSource,context,{filename:"routine-activation.js"});
  return {
    model:context.GymOSRoutineSessionModel,
    proposals:context.GymOSRoutineProposals,
    activation:context.GymOSRoutineActivation
  };
}
function exercise(id,overrides={}){
  return {
    id,exerciseId:id,name:`Ejercicio ${id}`,sets:3,target:"8-10 reps",
    prescription:{
      sets:3,target:{type:"repetitions",min:8,max:10},
      targetRir:{min:2,max:3},restSeconds:90,recordType:"weight_reps"
    },
    ...overrides
  };
}
function legacy(keys=["A","B","C"]){
  return Object.fromEntries(["A","B","C"].map(key=>[
    key,keys.includes(key)?[exercise(`legacy-${key.toLowerCase()}`)]:[]
  ]));
}
function rawDraft(key,overrides={}){
  return JSON.stringify({
    session:key,startedAt:"2026-07-29T08:00:00.000Z",
    updatedAt:"2026-07-29T09:00:00.000Z",
    exercises:[{
      name:`Draft ${key}`,
      series:[{weight:"42.5",reps:"10",rir:"2",done:true}],
      substitution:{
        active:true,plannedSnapshot:{id:`legacy-${key.toLowerCase()}`},
        reason:"equipamiento"
      }
    }],
    ...overrides
  });
}
function ids(){
  return {
    routineId:"routine-fixed",
    sessionIds:{A:"session-fixed-a",B:"session-fixed-b",C:"session-fixed-c"},
    draftIds:{A:"draft-fixed-a",B:"draft-fixed-b",C:"draft-fixed-c"}
  };
}
function migrationPlan(overrides={}){
  const {migration}=loadMigration(),fixed=ids();
  const plan=migration.createMigrationPlan({
    ownerId:OWNER_A,
    legacyRoutine:legacy(),
    legacyDraftsRaw:{A:rawDraft("A"),B:rawDraft("B"),C:null},
    legacySelection:"B",
    migrationVersion:migration.MIGRATION_VERSION,
    timestamp:T1,
    ...fixed,
    ...overrides
  });
  return {migration,plan:plain(plan)};
}
function makeRawAdapter(initial,ownerId=OWNER_A){
  const store=new Map(Object.entries(initial).filter(([,value])=>value!==null));
  let owner=ownerId;
  return {
    store,
    adapter:{
      getRaw:key=>store.has(key)?store.get(key):null,
      setRaw:(key,value)=>store.set(key,String(value)),
      remove:key=>store.delete(key),
      currentOwner:()=>owner
    },
    setOwner:value=>{owner=value;}
  };
}
function proposal(days){
  return {
    proposalId:`proposal-${days}`,generatedAt:T1,generatorVersion:"test",
    reviewRequired:false,warnings:[],unresolvedQuestions:[],
    sessions:Array.from({length:days},(_,index)=>({
      id:`proposal-session-${index+1}`,
      order:index+1,label:`Sesión ${index+1}`,focus:index%2?"lower":"upper",
      estimatedDurationMinutes:45,
      exercises:[{
        exerciseId:`exercise-${index+1}`,name:`Ejercicio ${index+1}`,
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
function activationPlan(days){
  const api=loadActivation();
  const current={A:[exercise("old-a")],B:[exercise("old-b")],C:[]};
  const value=proposal(days);
  const record=api.proposals.createProposalRecord({
    ownerId:OWNER_A,proposal:value,currentRoutine:current,timestamp:T1
  });
  const result=api.activation.createActivationPlan({
    ownerId:OWNER_A,proposalRecord:record,currentRoutine:current,
    targetRoutineId:`routine-target-${days}`,selectedSession:"A",
    confirmed:true,timestamp:T1
  });
  return {api,result:plain(result),current};
}

test("migra A/B/C y conserva asociación e identidad explícita",()=>{
  const {migration,plan}=migrationPlan();
  assert.equal(plan.ok,true);
  assert.deepEqual(plan.canonicalRoutine.sessions.map(item=>item.sessionId),[
    "session-fixed-a","session-fixed-b","session-fixed-c"
  ]);
  assert.deepEqual(plan.association,{
    A:"session-fixed-a",B:"session-fixed-b",C:"session-fixed-c"
  });
  assert.equal(migration.validateMigrationPlan(plan,{ownerId:OWNER_A}).valid,true);
});

test("migra A/B con C vacía sin fabricar la tercera sesión",()=>{
  const {plan}=migrationPlan({legacyRoutine:legacy(["A","B"])});
  assert.equal(plan.canonicalRoutine.sessions.length,2);
  assert.equal(plan.canonicalRoutine.sessions.some(item=>item.legacySessionKey==="C"),false);
});

test("migra una sola sesión y la marca como no activable",()=>{
  const {model}=loadMigration();
  const {plan}=migrationPlan({legacyRoutine:legacy(["A"])});
  assert.equal(plan.canonicalRoutine.sessions.length,1);
  assert.equal(model.validateCanonicalRoutine(plan.canonicalRoutine).activation.compatible,false);
});

test("migra una rutina vacía sin fabricar ni perder claves legacy",()=>{
  const {plan}=migrationPlan({legacyRoutine:legacy([]),legacyDraftsRaw:{}});
  assert.equal(plan.canonicalRoutine.sessions.length,0);
  assert.deepEqual(plan.legacyRoutine,{});
});

test("la segunda planificación conserva routineId, sessionId y no necesita IDs nuevos",()=>{
  const {migration,plan}=migrationPlan();
  const second=migration.createMigrationPlan({
    ownerId:OWNER_A,
    legacyRoutine:plan.legacyRoutine,
    canonicalRoutine:plan.canonicalRoutine,
    canonicalDrafts:plan.canonicalDrafts,
    legacyDraftsRaw:{A:rawDraft("A"),B:rawDraft("B"),C:null},
    legacySelection:plan.legacySelectedSession,
    selectedSessionId:plan.selectedSessionId,
    migrationMetadata:plan.migrationMetadata,
    migrationVersion:migration.MIGRATION_VERSION
  });
  assert.equal(second.changed,false);
  assert.equal(second.canonicalRoutine.routineId,"routine-fixed");
  assert.equal(JSON.stringify(second.canonicalRoutine.sessions),JSON.stringify(plan.canonicalRoutine.sessions));
});

test("el módulo no genera IDs ni usa información personal para construirlos",()=>{
  assert.doesNotMatch(migrationSource,/Math\.random|Date\.now|\bcrypto\b|randomUUID|getRandomValues/);
  assert.doesNotMatch(migrationSource,/\bemail\b|\bcorreo\b/);
  assert.match(appSource,/function secureSessionModelId\(prefix\)/);
  assert.match(appSource,/crypto\?\.randomUUID|crypto\?\.getRandomValues/);
});

test("ejercicios, prescripción, IDs y metadatos desconocidos conservan igualdad exacta",()=>{
  const source=legacy();
  source.A[0].unknown={nested:["preserve",42]};
  const {plan}=migrationPlan({legacyRoutine:source});
  assert.equal(JSON.stringify(plan.canonicalRoutine.sessions[0].exercises),JSON.stringify(source.A));
});

test("legacySessionKey se conserva aunque una sesión intermedia esté vacía",()=>{
  const {plan}=migrationPlan({legacyRoutine:legacy(["A","C"])});
  assert.deepEqual(plan.canonicalRoutine.sessions.map(item=>[
    item.legacySessionKey,item.order
  ]),[["A",1],["C",3]]);
  assert.deepEqual(Object.keys(plan.legacyRoutine),["A","C"]);
});

test("un marcador incompleto bloquea la reparación destructiva",()=>{
  const {migration,plan}=migrationPlan();
  const result=migration.createMigrationPlan({
    ownerId:OWNER_A,legacyRoutine:plan.legacyRoutine,
    canonicalRoutine:plan.canonicalRoutine,canonicalDrafts:plan.canonicalDrafts,
    migrationMetadata:{completed:false},migrationVersion:migration.MIGRATION_VERSION
  });
  assert.equal(result.ok,false);
  assert.equal(result.code,"incomplete_migration_marker");
});

test("un marcador sin rutina canónica bloquea una nueva migración",()=>{
  const {migration}=loadMigration(),fixed=ids();
  const result=migration.createMigrationPlan({
    ownerId:OWNER_A,legacyRoutine:legacy(),migrationMetadata:{completed:false},
    migrationVersion:migration.MIGRATION_VERSION,...fixed
  });
  assert.equal(result.ok,false);
  assert.equal(result.code,"incomplete_migration_marker");
});

test("un marcador completo no basta si falta el contenedor canónico de drafts",()=>{
  const {migration,plan}=migrationPlan();
  const result=migration.createMigrationPlan({
    ownerId:OWNER_A,legacyRoutine:plan.legacyRoutine,
    canonicalRoutine:plan.canonicalRoutine,canonicalDrafts:null,
    legacySelection:plan.legacySelectedSession,
    selectedSessionId:plan.selectedSessionId,
    migrationMetadata:plan.migrationMetadata,
    migrationVersion:migration.MIGRATION_VERSION
  });
  assert.equal(result.ok,true);
  assert.equal(result.changed,true);
});

test("un canónico inválido no reemplaza la rutina legacy válida",()=>{
  const {migration}=loadMigration(),source=legacy(),before=JSON.stringify(source);
  const result=migration.createMigrationPlan({
    ownerId:OWNER_A,legacyRoutine:source,
    canonicalRoutine:{schemaVersion:"4.2",routineId:"broken",revision:1,sessions:"bad"}
  });
  assert.equal(result.ok,false);
  assert.equal(result.code,"invalid_existing_canonical");
  assert.equal(JSON.stringify(source),before);
});

test("captura y restaura presencia, ausencia y raw exactos",()=>{
  const {migration}=loadMigration();
  const state={a:'{"x": 1}',b:null,c:"raw"};
  const snapshot=migration.captureRawSnapshot(state,["a","b","c","d"]);
  const restored=migration.restoreRawSnapshot({a:"changed",b:"created",d:"new"},snapshot);
  assert.equal(restored.a,'{"x": 1}');
  assert.equal(Object.hasOwn(restored,"b"),false);
  assert.equal(restored.c,"raw");
  assert.equal(Object.hasOwn(restored,"d"),false);
});

test("un cambio de propietario durante una transacción restaura raw exacto",()=>{
  const {migration}=loadMigration(),raw=makeRawAdapter({a:"old"});
  let writes=0;
  const adapter={
    ...raw.adapter,
    setRaw:(key,value)=>{
      raw.store.set(key,String(value));
      writes+=1;
      if(writes===1) raw.setOwner(OWNER_B);
    }
  };
  const result=migration.executeRawTransaction({
    ownerId:OWNER_A,expectedRaw:{a:"old"},writes:{a:"new",b:"value"},adapter
  });
  assert.equal(result.ok,false);
  assert.equal(raw.store.get("a"),"old");
  assert.equal(raw.store.has("b"),false);
});

test("un cambio raw del origen bloquea antes de escribir",()=>{
  const {migration}=loadMigration(),raw=makeRawAdapter({a:"changed"});
  const result=migration.executeRawTransaction({
    ownerId:OWNER_A,expectedRaw:{a:"expected"},writes:{a:"new"},adapter:raw.adapter
  });
  assert.equal(result.ok,false);
  assert.equal(raw.store.get("a"),"changed");
});

test("la inyección de fallo en cada etapa restaura igualdad raw exacta",()=>{
  const {migration}=loadMigration();
  const writes={a:"new-a",b:"new-b",c:null};
  Object.keys(writes).forEach((key,index)=>{
    const raw=makeRawAdapter({a:"old-a",c:"old-c"});
    const before=JSON.stringify([...raw.store.entries()]);
    const result=migration.executeRawTransaction({
      ownerId:OWNER_A,expectedRaw:{a:"old-a",b:null,c:"old-c"},
      writes,adapter:raw.adapter,failAt:index
    });
    assert.equal(result.ok,false,key);
    assert.equal(JSON.stringify([...raw.store.entries()]),before,key);
  });
});

test("el backup previo queda en una colección interna y fuera de backup/vault",()=>{
  assert.match(profileSource,/SESSION_MODEL_MIGRATION_BACKUP_PREFIX/);
  const backupBlock=appSource.slice(
    appSource.indexOf("const GYMOS_BACKUP_KEYS=["),
    appSource.indexOf("];",appSource.indexOf("const GYMOS_BACKUP_KEYS=["))
  );
  const vaultBlock=appSource.slice(
    appSource.indexOf("function localDataKeys()"),
    appSource.indexOf("function snapshotCurrentLocalData")
  );
  assert.doesNotMatch(backupBlock,/preSessionMigration/);
  assert.doesNotMatch(vaultBlock,/preSessionMigration/);
});

test("draft A migra al sessionId correcto",()=>{
  const {plan}=migrationPlan();
  const draft=plan.canonicalDrafts.draftsBySessionId["session-fixed-a"];
  assert.equal(draft.sessionId,"session-fixed-a");
  assert.equal(draft.sessionSnapshot.legacySessionKey,"A");
});

test("draft B conserva resultados parciales, sustitución y plannedSnapshot",()=>{
  const {plan}=migrationPlan();
  const draft=plan.canonicalDrafts.draftsBySessionId["session-fixed-b"];
  assert.equal(draft.exercises[0].series[0].weight,"42.5");
  assert.equal(draft.exercises[0].series[0].done,true);
  assert.equal(draft.exercises[0].substitution.active,true);
  assert.equal(draft.exercises[0].substitution.plannedSnapshot.id,"legacy-b");
});

test("draft conserva timestamps existentes sin sustituirlos",()=>{
  const {plan}=migrationPlan();
  const draft=plan.canonicalDrafts.draftsBySessionId["session-fixed-a"];
  assert.equal(draft.startedAt,"2026-07-29T08:00:00.000Z");
  assert.equal(draft.updatedAt,"2026-07-29T09:00:00.000Z");
});

test("draft sin sesión canónica se conserva raw como huérfano",()=>{
  const {plan}=migrationPlan({
    legacyRoutine:legacy(["A"]),
    legacyDraftsRaw:{A:rawDraft("A"),B:rawDraft("B")}
  });
  assert.equal(plan.canonicalDrafts.orphanedLegacyDrafts.B.reason,"session_not_found");
  assert.equal(plan.canonicalDrafts.orphanedLegacyDrafts.B.raw,rawDraft("B"));
});

test("draft de otro propietario queda huérfano y no se carga",()=>{
  const {plan}=migrationPlan({
    legacyDraftsRaw:{A:rawDraft("A",{ownerId:OWNER_B})}
  });
  assert.equal(plan.canonicalDrafts.orphanedLegacyDrafts.A.reason,"owner_mismatch");
  assert.equal(Object.keys(plan.canonicalDrafts.draftsBySessionId).length,0);
});

test("sessionDefinitionHash es estable para la misma definición",()=>{
  const {migration,plan}=migrationPlan();
  const first=migration.sessionDefinitionHash(plan.canonicalRoutine,"session-fixed-a");
  const second=migration.sessionDefinitionHash(plain(plan.canonicalRoutine),"session-fixed-a");
  assert.equal(first,second);
});

test("un draft obsoleto se marca sin mezclarse ni eliminarse",()=>{
  const {migration,plan}=migrationPlan();
  const changed=plain(plan.canonicalRoutine);
  changed.sessions[0].exercises[0].sets=9;
  const marked=migration.markStaleDrafts(plan.canonicalDrafts,{
    ownerId:OWNER_A,canonicalRoutine:changed
  });
  const draft=marked.draftsBySessionId["session-fixed-a"];
  assert.equal(draft.stale,true);
  assert.ok(draft.staleReasons.includes("session_definition_changed"));
  assert.equal(draft.exercises[0].series[0].weight,"42.5");
});

test("cambiar routineId, propietario o eliminar sesión detecta borrador obsoleto",()=>{
  const {migration,plan}=migrationPlan();
  const draft=plan.canonicalDrafts.draftsBySessionId["session-fixed-a"];
  assert.ok(migration.draftStatus(draft,{
    ownerId:OWNER_B,canonicalRoutine:{...plan.canonicalRoutine,routineId:"other"}
  }).reasons.includes("owner_changed"));
  const removed={...plan.canonicalRoutine,sessions:plan.canonicalRoutine.sessions.slice(1)};
  assert.ok(migration.draftStatus(draft,{ownerId:OWNER_A,canonicalRoutine:removed}).reasons.includes("session_removed"));
});

test("selectedSession legacy migra a selectedSessionId",()=>{
  const {plan}=migrationPlan();
  assert.equal(plan.legacySelectedSession,"B");
  assert.equal(plan.selectedSessionId,"session-fixed-b");
});

test("renombrar, cambiar label o reordenar físicamente conserva selectedSessionId",()=>{
  const {migration,plan}=migrationPlan();
  const changed=plain(plan.canonicalRoutine);
  changed.sessions[1].name="Renombrada";
  changed.sessions[1].label="Personalizada";
  changed.sessions.reverse();
  assert.equal(
    migration.selectedSessionId(changed,"A","session-fixed-b"),
    "session-fixed-b"
  );
});

test("si desaparece la selección elige la primera por order determinísticamente",()=>{
  const {migration,plan}=migrationPlan();
  const changed=plain(plan.canonicalRoutine);
  changed.sessions=changed.sessions.filter(item=>item.sessionId!=="session-fixed-b").reverse();
  assert.equal(migration.selectedSessionId(changed,"Z","missing"),"session-fixed-a");
});

test("selección de otro propietario no se reutiliza durante la planificación",()=>{
  const {plan}=migrationPlan({selectedSessionId:"foreign-session"});
  assert.equal(plan.selectedSessionId,"session-fixed-b");
});

for(const days of [2,3,4,5,6]){
  test(`plan canónico de ${days} sesiones conserva todas las sesiones e IDs`,()=>{
    const {result}=activationPlan(days);
    assert.equal(result.ok,true);
    assert.equal(result.canonicalRoutine.sessions.length,days);
    assert.deepEqual(
      result.canonicalRoutine.sessions.map(item=>item.sessionId),
      Array.from({length:days},(_,index)=>`proposal-session-${index+1}`)
    );
    assert.equal(result.activationEngineCompatible,true);
    assert.equal(result.runtimeCompatible,true);
  });
}

test("un plan sin IDs de sesión exige asignación explícita",()=>{
  const api=loadActivation(),current={A:[exercise("a")],B:[exercise("b")],C:[]};
  const value=proposal(2);
  value.sessions.forEach(item=>{delete item.id;});
  const record=api.proposals.createProposalRecord({
    ownerId:OWNER_A,proposal:value,currentRoutine:current,timestamp:T1
  });
  const result=api.activation.createActivationPlan({
    ownerId:OWNER_A,proposalRecord:record,currentRoutine:current,
    targetRoutineId:"routine-target",confirmed:true,timestamp:T1
  });
  assert.equal(result.ok,false);
  assert.equal(result.code,"session_id_required");
});

test("IDs proporcionados al target se reutilizan sin regeneración",()=>{
  const first=activationPlan(3).result;
  const second=activationPlan(3).result;
  assert.equal(JSON.stringify(first.canonicalRoutine),JSON.stringify(second.canonicalRoutine));
});

test("planes de dos y tres producen sombra legacy aplicable",()=>{
  [2,3].forEach(days=>{
    const {result}=activationPlan(days);
    assert.equal(result.compatibleNow,true);
    assert.equal(Object.keys(result.routine).length,days);
    assert.equal(result.selectedSession,"A");
    assert.equal(result.selectedSessionId,"proposal-session-1");
  });
});

test("planes de cuatro a seis habilitan runtime canónico sin crear claves D/E/F",()=>{
  [4,5,6].forEach(days=>{
    const {result}=activationPlan(days);
    assert.equal(result.ok,true);
    assert.equal(result.applicationError,null);
    assert.deepEqual(Object.keys(result.routine),["A","B","C"]);
    assert.equal(result.record.activated.runtimeCompatible,true);
    assert.equal(result.record.activated.canonicalRoutine.sessions.length,days);
  });
});

test("la compatibilidad distingue modelo, motor, runtime y activación actual",()=>{
  const {api}=activationPlan(4);
  const fields=api.activation.activationCompatibilityFields(proposal(4));
  assert.deepEqual(plain(fields),{
    canonicalCompatible:true,
    activationEngineCompatible:true,
    runtimeCompatible:true,
    compatibleNow:true,
    sessionCount:4,
    code:null
  });
});

test("aplicación visible activa el plan canónico mediante una transacción",()=>{
  const functionStart=appSource.indexOf("function activateStoredRoutineProposal");
  const functionEnd=appSource.indexOf("function rollbackStoredRoutineActivation",functionStart);
  const source=appSource.slice(functionStart,functionEnd);
  assert.doesNotMatch(source,/code:"runtime_not_ready"/);
  assert.match(source,/saveCanonicalRoutine\(plan\.canonicalRoutine/);
  assert.match(source,/executeTransaction/);
});

test("snapshot de activación contiene canónico, drafts y selecciones raw",()=>{
  const {result}=activationPlan(3);
  assert.ok(Object.hasOwn(result.record.baseline,"canonicalRoutineRaw"));
  assert.ok(Object.hasOwn(result.record.baseline,"canonicalDraftsRaw"));
  assert.ok(Object.hasOwn(result.record.baseline,"selectedSessionIdRaw"));
  assert.ok(Object.hasOwn(result.record.baseline,"migrationMetadataRaw"));
});

test("rollback canónico se bloquea cuando el target diverge",()=>{
  const {api,result}=activationPlan(3);
  const diverged=plain(result.canonicalRoutine);
  diverged.sessions[0].name="Cambio posterior";
  const decision=api.activation.rollbackDecision({
    ownerId:OWNER_A,activationRecord:result.record,
    currentRoutine:result.routine,currentCanonicalRoutine:diverged
  });
  assert.equal(decision.ok,false);
  assert.equal(decision.code,"routine_changed");
});

test("rollback canónico válido y repetido conserva idempotencia lifecycle",()=>{
  const {api,result}=activationPlan(3);
  const decision=api.activation.rollbackDecision({
    ownerId:OWNER_A,activationRecord:result.record,
    currentRoutine:result.routine,currentCanonicalRoutine:result.canonicalRoutine
  });
  assert.equal(decision.ok,true);
  const rolled=api.activation.markRolledBack(result.record,T1);
  const repeated=api.activation.rollbackDecision({
    ownerId:OWNER_A,activationRecord:rolled,
    currentRoutine:result.routine,currentCanonicalRoutine:result.canonicalRoutine
  });
  assert.equal(repeated.ok,true);
  assert.equal(repeated.idempotent,true);
});

test("fallo durante rollback transaccional restaura el estado anterior al intento",()=>{
  const {activation}=loadActivation();
  const store={canonical:"active",legacy:"active"};
  const before=JSON.stringify(store);
  const result=activation.executeTransaction({
    capture:()=>plain(store),
    restore:snapshot=>{
      Object.keys(store).forEach(key=>delete store[key]);
      Object.assign(store,snapshot);
    }
  },[
    ()=>{store.canonical="baseline";},
    ()=>{throw new Error("injected");}
  ]);
  assert.equal(result.ok,false);
  assert.equal(JSON.stringify(store),before);
});

test("vault y backup funcional incluyen claves canónicas y excluyen backup interno",()=>{
  ["gymos:routine:canonical","gymos:routineDrafts","gymos:selectedSessionId","gymos:sessionModelMigration"]
    .forEach(key=>assert.match(appSource.slice(
      appSource.indexOf("const GYMOS_BACKUP_KEYS=["),
      appSource.indexOf("];",appSource.indexOf("const GYMOS_BACKUP_KEYS=["))
    ),new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"))));
  assert.doesNotMatch(appSource.slice(
    appSource.indexOf("const GYMOS_BACKUP_KEYS=["),
    appSource.indexOf("];",appSource.indexOf("const GYMOS_BACKUP_KEYS=["))
  ),/preSessionMigration/);
});

test("sync exporta canónico, drafts, selección y asociaciones",()=>{
  const source=appSource.slice(
    appSource.indexOf("function buildSyncPayload()"),
    appSource.indexOf("function applySyncPayload")
  );
  assert.match(source,/canonicalRoutine:getCanonicalRoutine\(\)/);
  assert.match(
    source,
    /canonicalDrafts:sanitizeWorkoutDraftContainer\(getCanonicalDrafts\(\)/
  );
  assert.match(source,/selectedSessionId/);
  assert.match(source,/sessionModelMigration/);
});

test("sync rechaza canónico inválido y detecta conflicto de identidades",()=>{
  const source=appSource.slice(
    appSource.indexOf("function applySyncPayload"),
    appSource.indexOf("const SYNC_AUDIT_KEY")
  );
  assert.match(source,/invalid_remote_canonical/);
  assert.match(source,/canonicalSyncDecision/);
  assert.match(source,/local_legacy_shadow_conflict/);
  assert.match(source,/remoteMetadata\?\.ownerId===ownerId/);
});

test("sincronización repetida no genera IDs ni ejecuta migración desde buildSyncPayload",()=>{
  const source=appSource.slice(
    appSource.indexOf("function buildSyncPayload()"),
    appSource.indexOf("function applySyncPayload")
  );
  assert.doesNotMatch(source,/secureSessionModelId|ensureRoutineSessionMigration|markLocalUpdated/);
});

test("getRoutine mantiene una sombra A/B/C y el dominio canónico conserva IDs",()=>{
  const getSource=appSource.slice(
    appSource.indexOf("function getRoutine()"),
    appSource.indexOf("let sessions=getRoutine")
  );
  assert.match(getSource,/routineSessionRuntimeApi\(\)\.legacyShadow/);
  assert.match(appSource,/function activeRoutineForComparison\(\)/);
  assert.match(getSource,/reconcileLegacyRoutine/);
  assert.match(getSource,/saveCanonicalRoutine/);
});

test("draft runtime escribe sombra legacy y contenedor canónico en una operación lógica",()=>{
  const source=appSource.slice(
    appSource.indexOf("function saveDraft(d)"),
    appSource.indexOf("function lastWorkoutForSession")
  );
  assert.match(source,/CANONICAL_DRAFTS_KEY/);
  assert.match(source,/routineSessionRuntimeApi\(\)\.upsertDraft/);
  assert.match(source,/restoreStorageValue/);
});

test("la migración se ejecuta tras asignar propietario y antes de otros modelos privados",()=>{
  const source=appSource.slice(
    appSource.indexOf("function finishLocalUserActivation"),
    appSource.indexOf("function activateLocalUser")
  );
  const ownerCheck=source.indexOf("assertActiveLocalOwner(userId)");
  const migration=source.indexOf("ensureRoutineSessionMigration");
  const profile=source.indexOf("ensureProfileDataMigration");
  assert.ok(ownerCheck<migration);
  assert.ok(migration<profile);
  const activation=appSource.slice(
    appSource.indexOf("function activateLocalUser"),
    appSource.indexOf("function deactivateLocalUser")
  );
  assert.ok(
    activation.indexOf("localStorage.setItem(LOCAL_OWNER_KEY,userId)")<
    activation.lastIndexOf("finishLocalUserActivation(userId)")
  );
});

test("no existe migración automática en carga pública",()=>{
  const calls=appSource.match(/ensureRoutineSessionMigration\(/g)||[];
  assert.equal(calls.length,4);
  const declaration=appSource.indexOf("function ensureRoutineSessionMigration");
  const activation=appSource.indexOf("function activateLocalUser");
  assert.ok(declaration<activation);
  const idCalls=[...appSource.matchAll(/secureSessionModelId\("routine"\)/g)].map(match=>match.index);
  assert.equal(idCalls.length,2);
  const activationStart=appSource.indexOf("function activateStoredRoutineProposal");
  const activationEnd=appSource.indexOf("function rollbackStoredRoutineActivation");
  const migrationEnd=appSource.indexOf("function exerciseDomainMigrationBackupKey");
  assert.ok(idCalls.every(index=>
    (index>activationStart&&index<activationEnd)||(index>declaration&&index<migrationEnd)
  ));
});

test("el módulo H2 es puro y no accede a efectos externos",()=>{
  [
    /\bdocument\b/,/\blocalStorage\b/,/\bSupabase\b/,/\bfetch\s*\(/,
    /\bcrypto\b/,/Math\.random/,/Date\.now/,/\bsetTimeout\b/,/\bsetInterval\b/,
    /\bnavigator\b/
  ].forEach(pattern=>assert.doesNotMatch(migrationSource,pattern));
});

test("script H2 aparece una vez y respeta el orden de dependencias",()=>{
  assert.equal((indexSource.match(/routine-session-migration\.js/g)||[]).length,1);
  assert.ok(indexSource.indexOf("routine-session-model.js")<indexSource.indexOf("routine-session-migration.js"));
  assert.ok(indexSource.indexOf("routine-session-migration.js")<indexSource.indexOf("routine-generator.js"));
});

test("service worker incluye H2 y H3 una vez con estrategia segura rc.2",()=>{
  assert.equal((workerSource.match(/routine-session-migration\.js/g)||[]).length,1);
  assert.equal((workerSource.match(/routine-session-runtime\.js/g)||[]).length,1);
  assert.match(workerSource,/gymos-cache-4\.2\.0-routine-hub/);
  assert.equal((workerSource.match(/addEventListener\("fetch"/g)||[]).length,1);
  assert.match(workerSource,/fetch\(e\.request\)/);
});

test("historial no se modifica desde los módulos puros H1/H2/activación",()=>{
  assert.doesNotMatch(migrationSource,/gymos:history|saveHistory|getHistory/);
  assert.doesNotMatch(modelSource,/gymos:history|saveHistory|getHistory/);
  assert.doesNotMatch(activationSource,/gymos:history|saveHistory|getHistory/);
});

test("claves funcionales nuevas no contienen propietario ni datos personales",()=>{
  const {migration}=loadMigration();
  Object.values(migration.STORAGE_KEYS).forEach(key=>{
    assert.doesNotMatch(key,new RegExp(OWNER_A,"i"));
    assert.doesNotMatch(key,/@/);
  });
});

test("tres arranques lógicos son JSON-idempotentes y no requieren nuevas identidades",()=>{
  const {migration,plan}=migrationPlan();
  const input={
    ownerId:OWNER_A,
    legacyRoutine:plan.legacyRoutine,
    canonicalRoutine:plan.canonicalRoutine,
    canonicalDrafts:plan.canonicalDrafts,
    legacyDraftsRaw:{A:rawDraft("A"),B:rawDraft("B"),C:null},
    legacySelection:plan.legacySelectedSession,
    selectedSessionId:plan.selectedSessionId,
    migrationMetadata:plan.migrationMetadata,
    migrationVersion:migration.MIGRATION_VERSION
  };
  const second=plain(migration.createMigrationPlan(input));
  const third=plain(migration.createMigrationPlan({...input,canonicalRoutine:second.canonicalRoutine}));
  assert.equal(second.changed,false);
  assert.equal(third.changed,false);
  assert.equal(JSON.stringify(second),JSON.stringify(third));
  assert.equal(second.canonicalRoutine.routineId,"routine-fixed");
  assert.equal(second.canonicalDrafts.draftsBySessionId["session-fixed-a"].draftId,"draft-fixed-a");
});

test("A/C, solo B, solo C y B/C conservan su letra y orden sin renumeración",()=>{
  const scenarios=[
    [["A","C"],[["A",1],["C",3]]],
    [["B"],[["B",2]]],
    [["C"],[["C",3]]],
    [["B","C"],[["B",2],["C",3]]]
  ];
  scenarios.forEach(([keys,expected])=>{
    const {plan}=migrationPlan({legacyRoutine:legacy(keys),legacyDraftsRaw:{}});
    assert.deepEqual(
      plan.canonicalRoutine.sessions.map(item=>[item.legacySessionKey,item.order]),
      expected
    );
    assert.deepEqual(Object.keys(plan.legacyRoutine).filter(key=>["A","B","C"].includes(key)),keys);
  });
});

test("canonicalToLegacyRuntimeView usa legacySessionKey como asociación autoritativa",()=>{
  const {model,plan}=(()=>{const value=migrationPlan();return {...loadMigration(),plan:value.plan};})();
  const changed=plain(plan.canonicalRoutine);
  changed.sessions.find(item=>item.legacySessionKey==="A").order=3;
  changed.sessions.find(item=>item.legacySessionKey==="C").order=1;
  const shadow=plain(model.canonicalToLegacyRuntimeView(changed));
  assert.equal(shadow.A[0].exerciseId,"legacy-a");
  assert.equal(shadow.C[0].exerciseId,"legacy-c");
});

test("drafts conservan ceros, timer, sustitución, snapshot y campos antiguos raw exactos",()=>{
  const raw=rawDraft("A",{
    timer:{active:true,remainingMs:12500},
    oldUnknown:{nested:["x",0]},
    exercises:[{
      name:"Draft A",
      series:[{weight:0,reps:0,rir:"",done:false}],
      substitution:{active:true,plannedSnapshot:{id:"planned-a"},reason:"dolor"}
    }]
  });
  const {plan}=migrationPlan({legacyDraftsRaw:{A:raw}});
  const draft=plan.canonicalDrafts.draftsBySessionId["session-fixed-a"];
  assert.equal(draft.legacyRaw,raw);
  assert.equal(draft.exercises[0].series[0].weight,0);
  assert.equal(draft.exercises[0].series[0].reps,0);
  assert.equal(draft.timer.active,true);
  assert.deepEqual(draft.oldUnknown,{nested:["x",0]});
  assert.equal(draft.exercises[0].substitution.plannedSnapshot.id,"planned-a");
});

test("draft corrupto y draft sin sesión quedan recuperables y no se cargan",()=>{
  const {plan}=migrationPlan({
    legacyRoutine:legacy(["A"]),
    legacyDraftsRaw:{B:"{broken",C:rawDraft("C")}
  });
  assert.equal(plan.canonicalDrafts.orphanedLegacyDrafts.B.reason,"invalid_json");
  assert.equal(plan.canonicalDrafts.orphanedLegacyDrafts.B.raw,"{broken");
  assert.equal(plan.canonicalDrafts.orphanedLegacyDrafts.C.reason,"session_not_found");
  assert.equal(plan.canonicalDrafts.orphanedLegacyDrafts.C.raw,rawDraft("C"));
  assert.equal(Object.keys(plan.canonicalDrafts.draftsBySessionId).length,0);
});

test("marcador o sombras divergentes no sobrescriben datos válidos",()=>{
  const {migration,plan}=migrationPlan();
  const divergent=plain(plan.legacyRoutine);
  divergent.A[0].name="Cambio legacy independiente";
  const routineConflict=migration.createMigrationPlan({
    ownerId:OWNER_A,legacyRoutine:divergent,
    canonicalRoutine:plan.canonicalRoutine,canonicalDrafts:plan.canonicalDrafts,
    legacyDraftsRaw:{A:rawDraft("A"),B:rawDraft("B"),C:null},
    migrationMetadata:plan.migrationMetadata,
    migrationVersion:migration.MIGRATION_VERSION
  });
  assert.equal(routineConflict.code,"routine_shadow_conflict");
  const draftConflict=migration.createMigrationPlan({
    ownerId:OWNER_A,legacyRoutine:plan.legacyRoutine,
    canonicalRoutine:plan.canonicalRoutine,canonicalDrafts:plan.canonicalDrafts,
    legacyDraftsRaw:{A:rawDraft("A",{exercises:[{name:"Otro",series:[]}]})},
    migrationMetadata:plan.migrationMetadata,
    migrationVersion:migration.MIGRATION_VERSION
  });
  assert.equal(draftConflict.code,"draft_shadow_conflict");
});

test("conflictos remotos respetan identidad, revisión y no dependen de nombre o contenido parecido",()=>{
  const {migration,plan}=migrationPlan();
  const local=plan.canonicalRoutine;
  const identical=migration.canonicalSyncDecision(local,plain(local));
  assert.deepEqual(plain(identical),{accept:true,idempotent:true,code:null});
  const newer=plain(local);
  newer.revision+=1;
  newer.sessions[0].name="Actualizada";
  assert.equal(migration.canonicalSyncDecision(local,newer).accept,true);
  const sameRevision=plain(local);
  sameRevision.sessions[0].name="Conflicto";
  assert.equal(
    migration.canonicalSyncDecision(local,sameRevision).code,
    "canonical_same_revision_conflict"
  );
  const otherRoutine=plain(local);
  otherRoutine.routineId="routine-other";
  assert.equal(
    migration.canonicalSyncDecision(local,otherRoutine).code,
    "canonical_routine_id_conflict"
  );
  const otherSession=plain(newer);
  otherSession.sessions[0].sessionId="session-other";
  assert.equal(
    migration.canonicalSyncDecision(local,otherSession).code,
    "canonical_session_id_conflict"
  );
});

test("el snapshot H2 enumera raw y presencia de todas las claves transaccionales",()=>{
  const source=appSource.slice(
    appSource.indexOf("const affected=[",appSource.indexOf("function ensureRoutineSessionMigration")),
    appSource.indexOf("const expectedRaw=",appSource.indexOf("function ensureRoutineSessionMigration"))
  );
  [
    "CANONICAL_ROUTINE_KEY","CANONICAL_DRAFTS_KEY","SELECTED_SESSION_ID_KEY",
    "SESSION_MODEL_MIGRATION_KEY",'\"gymos:routine\"','\"gymos:selectedSession\"',
    'draftKey("A")','draftKey("B")','draftKey("C")',
    "ROUTINE_ACTIVATION_HISTORY_KEY","ACTIVE_ROUTINE_ACTIVATION_ID_KEY",
    '"gymos:history"',
    '"gymos:updatedAt"','"gymos:localUpdatedAt"','"gymos:syncPending"',
    '"gymos:localRevision"',"LOCAL_VAULT_PREFIX"
  ].forEach(token=>assert.match(source,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"))));
  assert.match(migrationSource,/values\[key\]=\{present,raw:/);
});

test("arranque privado valida owner antes de cada etapa, difiere sync y revierte fallo tardío",()=>{
  const source=appSource.slice(
    appSource.indexOf("function finishLocalUserActivation"),
    appSource.indexOf("function activateLocalUser")
  );
  assert.ok((source.match(/assertActiveLocalOwner\(ownerId\)/g)||[]).length>=8);
  assert.match(source,/markLocalUpdated\(\{schedule:false\}\)/);
  assert.ok(source.indexOf("saveCurrentUserVault(ownerId)")<source.indexOf("scheduleAutoSync()"));
  assert.match(source,/restoreRoutineSessionStartupStorage\(before,ownerId\)/);
  assert.match(source,/clearTimeout\(state\.syncTimer\)/);
});

test("saveRoutine y drafts validan doble representación y restauran controles",()=>{
  const routineSource=appSource.slice(
    appSource.indexOf("function saveCanonicalRoutine("),appSource.indexOf("let sessions=")
  );
  assert.match(routineSource,/reconcileLegacyRoutine/);
  assert.match(routineSource,/legacy_shadow_write_validation_failed/);
  assert.match(routineSource,/invalid_canonical_drafts/);
  assert.match(routineSource,/localRevision/);
  const draftSource=appSource.slice(
    appSource.indexOf("function saveDraft("),appSource.indexOf("function lastWorkoutForSession")
  );
  assert.match(draftSource,/routineSessionRuntimeApi\(\)\.upsertDraft/);
  assert.match(draftSource,/canonical_draft_write_validation_failed/);
  assert.match(draftSource,/localRevision/);
});

test("los nombres públicos nuevos H2 no colisionan y no hay listeners de migración",()=>{
  const declarations=[...appSource.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)]
    .map(match=>match[1]);
  [
    "ensureRoutineSessionMigration","finishLocalUserActivation",
    "captureRoutineSessionStartupStorage","restoreRoutineSessionStartupStorage",
    "assertActiveLocalOwner"
  ].forEach(name=>assert.equal(declarations.filter(item=>item===name).length,1,name));
  assert.doesNotMatch(migrationSource,/addEventListener|onAuthStateChange/);
  assert.equal((appSource.match(/onAuthStateChange\(/g)||[]).length,1);
});

test("login, recarga, cambio directo y logout respetan el límite propietario-vault-migración",()=>{
  const authSource=appSource.slice(
    appSource.indexOf("function resolveAuthenticatedAppState"),
    appSource.indexOf("function hasLocalUserData")
  );
  assert.match(authSource,/session&&isEmailConfirmed\(user\)/);
  assert.match(authSource,/activateLocalUser\(user\.id\)/);
  assert.match(authSource,/deactivateLocalUser\(\)/);
  const activateSource=appSource.slice(
    appSource.indexOf("function activateLocalUser"),
    appSource.indexOf("function deactivateLocalUser")
  );
  assert.match(activateSource,/previous===userId[\s\S]*finishLocalUserActivation\(userId\)/);
  assert.match(activateSource,/saveCurrentUserVault\(previous\)[\s\S]*loadUserVault\(userId\)/);
  assert.match(activateSource,/setItem\(LOCAL_OWNER_KEY,userId\)[\s\S]*finishLocalUserActivation\(userId\)/);
  const deactivateSource=appSource.slice(
    appSource.indexOf("function deactivateLocalUser"),
    appSource.indexOf("function deleteOwnerLocalData")
  );
  assert.match(deactivateSource,/saveCurrentUserVault\(current\)[\s\S]*clearCurrentUserData\(\)[\s\S]*removeItem\(LOCAL_OWNER_KEY\)/);
  assert.doesNotMatch(appSource.slice(0,appSource.indexOf("function activateLocalUser")),/let sessions=getRoutine\(\)/);
});

test("planes runtime 4–6 conservan preflight y aplican transaccionalmente",()=>{
  const source=appSource.slice(
    appSource.indexOf("function activateStoredRoutineProposal"),
    appSource.indexOf("function rollbackStoredRoutineActivation")
  );
  const capture=source.indexOf("const preflightStorage=captureRoutineActivationStorage");
  const transaction=source.indexOf("executeTransaction");
  const mark=source.indexOf("markRoutineActivationSyncPending");
  assert.ok(capture>=0&&capture<transaction&&transaction<mark);
  assert.doesNotMatch(source,/runtime_not_ready/);
});

test("el backup H2 no entra en diagnósticos visibles",()=>{
  const source=appSource.slice(
    appSource.indexOf("function storageDiagnostics"),
    appSource.indexOf("function formatBytes")
  );
  assert.match(source,/MIGRATION_INTERNAL_KEY_PREFIXES/);
  assert.match(source,/!internalPrefixes\.some/);
});

test("importación H2 valida el paquete completo y revierte raw ante cualquier fallo",()=>{
  const source=appSource.slice(
    appSource.indexOf("function importGymOSBackup"),
    appSource.indexOf("function readJsonFile")
  );
  [
    /validateCanonicalRoutine\(incomingCanonical\)/,
    /validateDraftContainer\(/,
    /metadataMatches/,
    /legacyRoutineEquivalent\(/,
    /routineSessionRuntimeApi\(\)\.legacyShadow\(incomingCanonical\)/,
    /captureRoutineSessionStartupStorage\(normalizedOwner\)/,
    /restoreRoutineSessionStartupStorage\(importBefore,normalizedOwner\)/,
    /assertActiveLocalOwner\(normalizedOwner\)/,
    /saveCurrentUserVault\(ownerId\)/
  ].forEach(pattern=>assert.match(source,pattern));
});

test("reconciliar una rutina representable conserva IDs, asociación y metadatos desconocidos",()=>{
  const {migration,plan}=migrationPlan();
  const canonical=plain(plan.canonicalRoutine);
  canonical.customMetadata={source:"legacy",nested:{keep:true}};
  const legacyNext=plain(plan.legacyRoutine);
  legacyNext.B[0].sets=5;
  const result=plain(migration.reconcileLegacyRoutine({
    canonicalRoutine:canonical,legacyRoutine:legacyNext
  }));
  assert.equal(result.ok,true);
  assert.equal(result.canonicalRoutine.routineId,canonical.routineId);
  assert.deepEqual(
    result.canonicalRoutine.sessions.map(item=>[item.sessionId,item.legacySessionKey]),
    canonical.sessions.map(item=>[item.sessionId,item.legacySessionKey])
  );
  assert.deepEqual(result.canonicalRoutine.customMetadata,canonical.customMetadata);
  assert.equal(result.canonicalRoutine.sessions[1].exercises[0].sets,5);
});

test("reconciliar cuatro a seis sesiones falla antes de mutar cualquier entrada",()=>{
  [4,5,6].forEach(days=>{
    const {api,result}=activationPlan(days);
    const canonical=plain(result.canonicalRoutine);
    const legacyInput={A:[],B:[],C:[]};
    const beforeCanonical=JSON.stringify(canonical);
    const beforeLegacy=JSON.stringify(legacyInput);
    const decision=api.migration
      ?api.migration.reconcileLegacyRoutine({canonicalRoutine:canonical,legacyRoutine:legacyInput})
      :loadMigration().migration.reconcileLegacyRoutine({
        canonicalRoutine:canonical,legacyRoutine:legacyInput
      });
    assert.equal(decision.code,"legacy_runtime_incompatible");
    assert.equal(JSON.stringify(canonical),beforeCanonical);
    assert.equal(JSON.stringify(legacyInput),beforeLegacy);
  });
});

test("draftId es externo, estable y no deriva de la letra legacy",()=>{
  const {migration,plan}=migrationPlan();
  const first=plan.canonicalDrafts.draftsBySessionId["session-fixed-a"];
  assert.equal(first.draftId,"draft-fixed-a");
  assert.notEqual(first.draftId,"A");
  assert.doesNotMatch(first.draftId,new RegExp(OWNER_A,"i"));
  const renamed=plain(plan.canonicalRoutine);
  renamed.sessions[0].name="Sesión renombrada";
  const status=migration.draftStatus(first,{ownerId:OWNER_A,canonicalRoutine:renamed});
  assert.equal(first.draftId,"draft-fixed-a");
  assert.ok(["current","stale"].includes(status.status));
});
