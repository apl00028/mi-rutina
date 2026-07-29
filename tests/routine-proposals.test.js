"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const test=require("node:test");

const root=path.resolve(__dirname,"..");
const moduleSource=fs.readFileSync(path.join(root,"routine-proposals.js"),"utf8");
const appSource=fs.readFileSync(path.join(root,"app.js"),"utf8");
const indexSource=fs.readFileSync(path.join(root,"index.html"),"utf8");
const serviceWorkerSource=fs.readFileSync(path.join(root,"service-worker.js"),"utf8");
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
  vm.runInContext(moduleSource,context,{filename:"routine-proposals.js"});
  return context.GymOSRoutineProposals;
}
function plain(value){return JSON.parse(JSON.stringify(value));}
function exercise(id,name,overrides={}){
  return {
    exerciseId:id,name,pattern:"horizontal_push",role:"main",
    prescription:{
      sets:3,target:{type:"repetitions",min:8,max:12},
      targetRir:{min:2,max:3},restSeconds:90,recordType:"weight_reps"
    },
    ...overrides
  };
}
function proposal(id="proposal-1",sessionCount=3){
  return {
    proposalId:id,generatedAt:T1,generatorVersion:"test",
    status:"pending",warnings:[],unresolvedQuestions:[],
    weeklyStructure:{id:"test",days:sessionCount},
    sessions:Array.from({length:sessionCount},(_,index)=>({
      id:`session-${index+1}`,label:`Sesión ${index+1}`,
      focus:index%2?"lower":"upper",
      exercises:[exercise(`exercise-${index+1}`,`Ejercicio ${index+1}`)]
    }))
  };
}
function activeRoutineFromProposal(value){
  return {sessions:plain(value.sessions)};
}
function store(api,records,value,options={}){
  return plain(api.storeProposal(records,{
    ownerId:options.ownerId||OWNER_A,
    proposal:value,
    currentRoutine:options.currentRoutine||activeRoutineFromProposal(value),
    timestamp:options.timestamp||value.generatedAt
  }));
}
function deepFreeze(value){
  if(value&&typeof value==="object"&&!Object.isFrozen(value)){
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

test("1. guarda una propuesta pendiente",()=>{
  const api=loadApi(),value=proposal();
  const result=store(api,[],value);
  assert.equal(result.records.length,1);
  assert.equal(result.record.lifecycle.status,"pending_review");
  assert.equal(result.activeProposalId,value.proposalId);
});

test("2. recupera con igualdad JSON exacta",()=>{
  const api=loadApi(),result=store(api,[],proposal());
  const serialized=JSON.stringify(result.records);
  assert.equal(JSON.stringify(api.normalizeRecords(JSON.parse(serialized),OWNER_A)),serialized);
});

test("3. no muta la propuesta original",()=>{
  const api=loadApi(),value=proposal();
  const before=JSON.stringify(value);
  deepFreeze(value);
  store(api,[],value);
  assert.equal(JSON.stringify(value),before);
});

test("4. no duplica proposalId",()=>{
  const api=loadApi(),value=proposal();
  const first=store(api,[],value);
  const second=store(api,first.records,value,{timestamp:T2});
  assert.equal(second.records.length,1);
  assert.equal(second.created,false);
  assert.equal(JSON.stringify(second.records),JSON.stringify(first.records));
});

test("5. una propuesta nueva marca la anterior como superseded",()=>{
  const api=loadApi();
  const first=store(api,[],proposal("proposal-1"),{timestamp:T1});
  const second=store(api,first.records,{...proposal("proposal-2"),generatedAt:T2},{timestamp:T2});
  assert.equal(second.records.find(item=>item.proposal.proposalId==="proposal-1").lifecycle.status,"superseded");
  assert.equal(second.records.find(item=>item.proposal.proposalId==="proposal-2").lifecycle.status,"pending_review");
});

test("6. rechazo conserva propuesta original",()=>{
  const api=loadApi(),value=proposal();
  const stored=store(api,[],value);
  const rejected=plain(api.rejectProposal(stored.records,{
    ownerId:OWNER_A,proposalId:value.proposalId,rejectionReason:"No encaja",timestamp:T2
  }));
  assert.equal(rejected[0].lifecycle.status,"rejected");
  assert.equal(rejected[0].lifecycle.rejectionReason,"No encaja");
  assert.deepEqual(rejected[0].proposal,value);
});

test("7. aislamiento entre propietarios",()=>{
  const api=loadApi();
  const a=store(api,[],proposal("proposal-a"),{ownerId:OWNER_A}).records[0];
  const b=store(api,[],proposal("proposal-b"),{ownerId:OWNER_B}).records[0];
  assert.deepEqual(plain(api.normalizeRecords([a,b],OWNER_A).map(item=>item.proposal.proposalId)),["proposal-a"]);
  assert.deepEqual(plain(api.normalizeRecords([a,b],OWNER_B).map(item=>item.proposal.proposalId)),["proposal-b"]);
});

test("8. borrado local apunta solo al propietario solicitado",()=>{
  assert.match(appSource,/function deleteOwnerLocalData\(ownerId[\s\S]*clearCurrentUserData\(\)/);
  assert.match(appSource,/localStorage\.removeItem\(`\$\{LOCAL_VAULT_PREFIX\}\$\{normalizedOwnerId\}`\)/);
  assert.doesNotMatch(
    appSource.slice(appSource.indexOf("function deleteOwnerLocalData"),appSource.indexOf("function renderAuthConfigurationRequired")),
    /localStorage\.clear/
  );
});

test("9. backup, restauración y vault incluyen propuestas",()=>{
  const backupStart=appSource.indexOf("const GYMOS_BACKUP_KEYS=[");
  const backupEnd=appSource.indexOf("];",backupStart);
  const keys=appSource.slice(backupStart,backupEnd);
  assert.match(keys,/gymos:routineProposals/);
  assert.match(keys,/gymos:activeRoutineProposalId/);
  assert.match(appSource,/function snapshotCurrentLocalData[\s\S]*localDataKeys/);
  assert.match(appSource,/function importGymOSBackup[\s\S]*ROUTINE_PROPOSALS_KEY/);
});

test("10. backup antiguo sin propuestas sigue siendo aceptado",()=>{
  assert.match(appSource,/function validateGymOSBackup[\s\S]*payload\.storage/);
  assert.doesNotMatch(
    appSource.slice(appSource.indexOf("function validateGymOSBackup"),appSource.indexOf("function importGymOSBackup")),
    /routineProposals/
  );
});

test("11. sincronización repetida es idempotente",()=>{
  const api=loadApi();
  const record=store(api,[],proposal()).records[0];
  const first=plain(api.mergeProposalRecords([],[record],{ownerId:OWNER_A}));
  const second=plain(api.mergeProposalRecords(first.records,[record],{
    ownerId:OWNER_A,activeProposalId:first.activeProposalId
  }));
  assert.equal(JSON.stringify(second),JSON.stringify(first));
  assert.match(appSource,/routineProposals:getRoutineProposalRecords\(\)/);
  assert.match(appSource,/importRoutineProposalSyncData\(payload,\{mark:false\}\)/);
});

test("12. diff sin cambios",()=>{
  const api=loadApi(),value=proposal();
  const diff=plain(api.compareRoutineProposal(activeRoutineFromProposal(value),value,{timestamp:T1}));
  assert.equal(diff.summary.totalChanges,0);
  assert.deepEqual(diff.changes,[]);
});

test("13. detecta sesión añadida",()=>{
  const api=loadApi(),value=proposal("p",3);
  const current={sessions:value.sessions.slice(0,2)};
  const diff=api.compareRoutineProposal(current,value);
  assert.equal(diff.summary.sessionsAdded,1);
});

test("14. detecta sesión eliminada",()=>{
  const api=loadApi(),value=proposal("p",2);
  const current={sessions:proposal("current",3).sessions};
  const diff=api.compareRoutineProposal(current,value);
  assert.equal(diff.summary.sessionsRemoved,1);
});

test("15. detecta ejercicio añadido",()=>{
  const api=loadApi(),value=proposal();
  const current=activeRoutineFromProposal(value);
  value.sessions[0].exercises.push(exercise("added","Añadido"));
  assert.equal(api.compareRoutineProposal(current,value).summary.exercisesAdded,1);
});

test("16. detecta ejercicio eliminado",()=>{
  const api=loadApi(),value=proposal();
  value.sessions[0].exercises.push(exercise("removed","Eliminado"));
  const current=activeRoutineFromProposal(value);
  value.sessions[0].exercises.pop();
  assert.equal(api.compareRoutineProposal(current,value).summary.exercisesRemoved,1);
});

test("17. detecta ejercicio sustituido por ID estable",()=>{
  const api=loadApi(),value=proposal();
  const current=activeRoutineFromProposal(value);
  value.sessions[0].exercises[0]=exercise("replacement","Sustituto");
  const diff=api.compareRoutineProposal(current,value);
  assert.equal(diff.summary.exercisesSubstituted,1);
});

test("18. detecta series, objetivo, RIR y descanso",()=>{
  const api=loadApi(),value=proposal();
  const current=activeRoutineFromProposal(value);
  const prescription=value.sessions[0].exercises[0].prescription;
  prescription.sets=4;
  prescription.target={type:"repetitions",min:5,max:8};
  prescription.targetRir={min:1,max:2};
  prescription.restSeconds=150;
  value.sessions[0].exercises[0].pattern="vertical_push";
  value.sessions[0].exercises[0].role="accessory";
  const types=api.compareRoutineProposal(current,value).changes.map(item=>item.type);
  [
    "sets_changed","target_changed","rir_changed","rest_changed",
    "pattern_changed","function_changed"
  ].forEach(type=>assert.ok(types.includes(type)));
});

test("19. detecta cambio de orden",()=>{
  const api=loadApi(),value=proposal();
  value.sessions[0].exercises.push(exercise("second","Segundo"));
  const current=activeRoutineFromProposal(value);
  value.sessions[0].exercises.reverse();
  assert.equal(api.compareRoutineProposal(current,value).summary.orderChanges,2);
});

test("20. propuestas de 4 a 6 días son activables por runtime H3",()=>{
  const api=loadApi();
  [4,5,6].forEach(days=>{
    const result=api.activationCompatibility(proposal(`p-${days}`,days));
    assert.equal(result.compatible,true);
    assert.equal(result.reasons.length,0);
  });
  assert.equal(api.activationCompatibility(proposal("p-2",2)).compatible,true);
  assert.equal(api.activationCompatibility(proposal("p-3",3)).compatible,true);
});

test("21. cambio posterior de rutina marca stale sin alterar baseline",()=>{
  const api=loadApi(),value=proposal();
  const stored=store(api,[],value);
  const baseline=stored.records[0].baseline.routineHash;
  const changed=activeRoutineFromProposal(value);
  changed.sessions[0].exercises[0].prescription.sets=5;
  const refreshed=plain(api.refreshProposalComparisons(stored.records,{
    ownerId:OWNER_A,currentRoutine:changed,timestamp:T2
  }));
  assert.equal(refreshed[0].comparison.stale,true);
  assert.equal(refreshed[0].baseline.routineHash,baseline);
  assert.notEqual(refreshed[0].comparison.routineHash,baseline);
});

test("22. reordenar claves de entrada produce el mismo diff",()=>{
  const api=loadApi(),value=proposal();
  const currentA={B:[],A:[{id:"x",name:"X",sets:3,target:"8"}]};
  const currentB={A:[{target:"8",sets:3,name:"X",id:"x"}],B:[]};
  assert.equal(
    JSON.stringify(api.compareRoutineProposal(currentA,value,{timestamp:T1})),
    JSON.stringify(api.compareRoutineProposal(currentB,value,{timestamp:T1}))
  );
});

test("23. propuesta inválida o con IDs duplicados no se persiste",()=>{
  const api=loadApi(),value=proposal();
  value.sessions[0].exercises.push({...value.sessions[0].exercises[0]});
  assert.throws(()=>store(api,[],value),/Invalid proposal/);
  assert.throws(()=>store(api,[],{sessions:[]}),/Invalid proposal/);
});

test("24. conserva como máximo veinte propuestas",()=>{
  const api=loadApi();
  let records=[];
  for(let index=0;index<25;index+=1){
    const timestamp=`2026-07-${String(index+1).padStart(2,"0")}T10:00:00.000Z`;
    const value={...proposal(`proposal-${index}`),generatedAt:timestamp};
    records=store(api,records,value,{timestamp}).records;
  }
  assert.equal(records.length,20);
  assert.ok(records.some(item=>item.proposal.proposalId==="proposal-24"));
  assert.ok(!records.some(item=>item.proposal.proposalId==="proposal-0"));
});

test("25. rutina e historial mantienen igualdad serializada exacta",()=>{
  const api=loadApi(),value=proposal();
  const routine={A:[{id:"x",name:"X",sets:3,target:"8"}],B:[],C:[]};
  const history=[{date:"2026-07-27",session:"A",sets:[{kg:20,reps:8}]}];
  const beforeRoutine=JSON.stringify(routine),beforeHistory=JSON.stringify(history);
  const stored=store(api,[],value,{currentRoutine:routine});
  api.compareRoutineProposal(routine,value,{baselineHash:stored.record.baseline.routineHash,timestamp:T2});
  assert.equal(JSON.stringify(routine),beforeRoutine);
  assert.equal(JSON.stringify(history),beforeHistory);
  assert.doesNotMatch(moduleSource,/localStorage|document\.|saveRoutine\s*\(|saveHistory\s*\(|Math\.random|supabase/i);
});

test("integración carga el módulo antes de app y lo cachea",()=>{
  assert.ok(indexSource.indexOf("routine-proposals.js")<indexSource.indexOf("app.js"));
  assert.match(serviceWorkerSource,/routine-proposals\.js/);
});

test("detecta cambios de nombre y enfoque de sesión",()=>{
  const api=loadApi(),value=proposal();
  const current=activeRoutineFromProposal(value);
  value.sessions[0].label="Torso principal";
  value.sessions[0].focus="full_body";
  const types=api.compareRoutineProposal(current,value).changes.map(item=>item.type);
  assert.ok(types.includes("session_name_changed"));
  assert.ok(types.includes("session_focus_changed"));
});

test("rechaza propietarios no válidos",()=>{
  const api=loadApi();
  assert.throws(()=>store(api,[],proposal(),{ownerId:"correo@example.com"}),/invalid owner/);
});

test("rechazar la propuesta activa selecciona otra pending de forma determinista",()=>{
  const api=loadApi();
  const first=plain(api.storeProposal([],{
    ownerId:OWNER_A,proposal:proposal("proposal-a"),
    currentRoutine:activeRoutineFromProposal(proposal("proposal-a")),timestamp:T1,
    supersedePrevious:false
  }));
  const secondValue={...proposal("proposal-b"),generatedAt:T2};
  const second=plain(api.storeProposal(first.records,{
    ownerId:OWNER_A,proposal:secondValue,currentRoutine:activeRoutineFromProposal(secondValue),
    timestamp:T2,supersedePrevious:false,activeProposalId:"proposal-a"
  }));
  const rejected=plain(api.rejectProposal(second.records,{
    ownerId:OWNER_A,proposalId:"proposal-b",rejectionReason:"No",timestamp:"2026-07-28T12:00:00.000Z"
  }));
  assert.equal(api.selectActiveProposalId(rejected,OWNER_A,"proposal-b"),"proposal-a");
  assert.equal(rejected.find(item=>item.proposal.proposalId==="proposal-b").lifecycle.status,"rejected");
});

test("activeRoutineProposalId inexistente cae a pending más reciente",()=>{
  const api=loadApi();
  const value=proposal("proposal-valid");
  const record=store(api,[],value).records[0];
  const result=plain(api.mergeProposalRecords([record],[],{
    ownerId:OWNER_A,activeProposalId:"proposal-inexistente"
  }));
  assert.equal(result.activeProposalId,"proposal-valid");
});

test("el límite protege la propuesta pending activa referenciada",()=>{
  const api=loadApi();
  const activeValue={...proposal("proposal-active"),generatedAt:"2026-01-01T10:00:00.000Z"};
  const active=store(api,[],activeValue,{timestamp:activeValue.generatedAt}).records[0];
  const records=[active];
  for(let index=0;index<21;index+=1){
    const timestamp=`2026-02-${String(index+1).padStart(2,"0")}T10:00:00.000Z`;
    const value={...proposal(`proposal-extra-${index}`),generatedAt:timestamp};
    const record=store(api,[],value,{timestamp}).records[0];
    record.lifecycle.status=index<8?"rejected":index<16?"superseded":"pending_review";
    records.push(record);
  }
  const trimmed=plain(api.trimRecords(records,OWNER_A,"proposal-active"));
  assert.equal(trimmed.length,20);
  assert.ok(trimmed.some(item=>item.proposal.proposalId==="proposal-active"));
  assert.equal(api.selectActiveProposalId(trimmed,OWNER_A,"proposal-active"),"proposal-active");
  assert.ok(!trimmed.some(item=>item.proposal.proposalId==="proposal-extra-0"));
  assert.ok(trimmed.some(item=>item.proposal.proposalId==="proposal-extra-8"));
});

test("borrado del propietario elimina también las claves activas funcionales",()=>{
  const keysStart=appSource.indexOf("const GYMOS_BACKUP_KEYS=[");
  const keysEnd=appSource.indexOf("];",keysStart);
  const keys=appSource.slice(keysStart,keysEnd);
  assert.match(keys,/gymos:routineProposals/);
  assert.match(keys,/gymos:activeRoutineProposalId/);
  assert.match(appSource,/function clearCurrentUserData\(\)[\s\S]*localDataKeys\(\)\.forEach\(key=>localStorage\.removeItem\(key\)\)/);
});

test("cambio entre propietarios revalida registros y active ID",()=>{
  const api=loadApi();
  const a=store(api,[],proposal("proposal-a"),{ownerId:OWNER_A}).records[0];
  const b=store(api,[],proposal("proposal-b"),{ownerId:OWNER_B}).records[0];
  assert.equal(api.selectActiveProposalId([a,b],OWNER_A,"proposal-b"),"proposal-a");
  assert.equal(api.selectActiveProposalId([a,b],OWNER_B,"proposal-a"),"proposal-b");
  const activateSource=appSource.slice(
    appSource.indexOf("function finishLocalUserActivation"),
    appSource.indexOf("function activateLocalUser")
  );
  assert.match(activateSource,/ensureRoutineProposalState\(ownerId\)/);
});

test("proposalId conflictivo conserva proposal original y devuelve incidencia",()=>{
  const api=loadApi();
  const original=store(api,[],proposal("proposal-conflict")).records[0];
  const incoming=plain(original);
  incoming.proposal.sessions[0].label="Contenido diferente";
  incoming.lifecycle.updatedAt="2026-08-01T10:00:00.000Z";
  const result=plain(api.mergeProposalRecords([original],[incoming],{
    ownerId:OWNER_A,activeProposalId:"proposal-conflict"
  }));
  assert.deepEqual(result.records[0].proposal,original.proposal);
  assert.equal(result.records[0].lifecycle.updatedAt,original.lifecycle.updatedAt);
  assert.deepEqual(result.incidents,[{
    code:"proposal_id_conflict",proposalId:"proposal-conflict"
  }]);
});

test("stale repetido es idempotente y no altera metadatos externos",()=>{
  const api=loadApi(),value=proposal();
  const stored=store(api,[],value);
  const changed=activeRoutineFromProposal(value);
  changed.sessions[0].exercises[0].prescription.sets=6;
  const external={
    localRevision:"revision-10",
    updatedAt:"2026-07-28T09:00:00.000Z"
  };
  const first=plain(api.refreshProposalComparisons(stored.records,{
    ownerId:OWNER_A,currentRoutine:changed,timestamp:T2
  }));
  const second=plain(api.refreshProposalComparisons(first,{
    ownerId:OWNER_A,currentRoutine:changed
  }));
  assert.equal(JSON.stringify(second),JSON.stringify(first));
  assert.equal(first[0].comparison.stale,true);
  assert.equal(first[0].baseline.routineHash,stored.records[0].baseline.routineHash);
  assert.deepEqual(first[0].proposal,stored.records[0].proposal);
  assert.equal(first[0].lifecycle.updatedAt,stored.records[0].lifecycle.updatedAt);
  assert.equal(first[0].comparison.generatedAt,T2);
  assert.deepEqual(external,{
    localRevision:"revision-10",
    updatedAt:"2026-07-28T09:00:00.000Z"
  });
});

test("payload extranjero o sin ownerId se rechaza sin cambiar active ID",()=>{
  const api=loadApi();
  const local=store(api,[],proposal("proposal-a"),{ownerId:OWNER_A}).records[0];
  const foreign=store(api,[],proposal("proposal-b"),{ownerId:OWNER_B}).records[0];
  const ownerless=plain(foreign);
  delete ownerless.ownerId;
  const before=JSON.stringify([local]);
  const result=plain(api.mergeProposalRecords([local],[foreign,ownerless],{
    ownerId:OWNER_A,activeProposalId:"proposal-a"
  }));
  assert.equal(JSON.stringify(result.records),before);
  assert.equal(result.activeProposalId,"proposal-a");
  assert.equal(result.incidents.length,2);
  assert.ok(result.incidents.every(item=>item.code==="invalid_or_foreign_record"));
});

test("recorte prioriza rejected, luego superseded y resuelve empates por ID",()=>{
  const api=loadApi();
  const records=[];
  for(let index=0;index<22;index+=1){
    const value={...proposal(`proposal-${String(index).padStart(2,"0")}`),generatedAt:T1};
    const record=store(api,[],value,{timestamp:T1}).records[0];
    record.lifecycle.status=index<2?"rejected":index<4?"superseded":"pending_review";
    records.push(record);
  }
  const trimmed=plain(api.trimRecords(records,OWNER_A,"proposal-10"));
  assert.equal(trimmed.length,20);
  assert.ok(!trimmed.some(item=>item.proposal.proposalId==="proposal-00"));
  assert.ok(!trimmed.some(item=>item.proposal.proposalId==="proposal-01"));
  assert.ok(trimmed.some(item=>item.proposal.proposalId==="proposal-02"));
  assert.equal(api.selectActiveProposalId(trimmed,OWNER_A,"proposal-10"),"proposal-10");
});
