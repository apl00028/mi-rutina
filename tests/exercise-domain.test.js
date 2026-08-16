"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const test=require("node:test");

const projectRoot=path.resolve(__dirname,"..");
const moduleSource=fs.readFileSync(path.join(projectRoot,"exercise-domain.js"),"utf8");
const catalogSource=fs.readFileSync(path.join(projectRoot,"built-in-exercise-catalog.js"),"utf8");
const appSource=fs.readFileSync(path.join(projectRoot,"app.js"),"utf8");
const indexSource=fs.readFileSync(path.join(projectRoot,"index.html"),"utf8");
const serviceWorkerSource=fs.readFileSync(path.join(projectRoot,"service-worker.js"),"utf8");
const TIMESTAMP="2026-07-28T10:00:00.000Z";

function loadDomain(){
  const context={console};
  context.window=context;
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(moduleSource,context,{filename:"exercise-domain.js"});
  return context.GymOSExerciseDomain;
}

function plain(value){
  return JSON.parse(JSON.stringify(value));
}

function createStorage(initial={}){
  const values=new Map(Object.entries(initial).map(([key,value])=>[key,String(value)]));
  return {
    getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key),
    snapshot:()=>Object.fromEntries(values)
  };
}

function extractFunction(source,name){
  const start=source.indexOf(`function ${name}`);
  assert.notEqual(start,-1,`No se encontro ${name}`);
  const bodyStart=source.indexOf("){",start)+1;
  assert.ok(bodyStart>0,`No se encontro el cuerpo de ${name}`);
  let depth=0;
  for(let index=bodyStart;index<source.length;index+=1){
    if(source[index]==="{") depth+=1;
    if(source[index]==="}") depth-=1;
    if(depth===0) return source.slice(start,index+1);
  }
  throw new Error(`No se pudo extraer ${name}`);
}

function testOwnerProfileApi(localStorage){
  return {
    normalizeOwnerId:value=>{
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)){
        throw new Error("owner invalido");
      }
      return value.toLowerCase();
    },
    getUserProfile:()=>JSON.parse(localStorage.getItem("gymos:userProfile")||"null"),
    saveUserProfile:value=>localStorage.setItem("gymos:userProfile",JSON.stringify(value)),
    importSyncData:payload=>{
      if(!payload.userProfile) return false;
      localStorage.setItem("gymos:userProfile",JSON.stringify(payload.userProfile));
      return true;
    }
  };
}

function legacyLibrary(){
  return [
    {id:"bench-press",name:"Press de banca",muscle:"Pecho",equipment:"Barra",type:"Fuerza",favorite:true,custom:false,notes:"Tecnica"},
    {id:"incline-db-press",name:"Press inclinado con mancuernas",muscle:"Pecho",equipment:"Mancuernas",type:"Hipertrofia",favorite:false,custom:false,notes:""},
    {id:"lat-pulldown",name:"Jalon al pecho",muscle:"Espalda",equipment:"Polea",type:"Hipertrofia",favorite:false,custom:false,notes:""},
    {id:"barbell-row",name:"Remo con barra",muscle:"Espalda",equipment:"Barra",type:"Fuerza",favorite:false,custom:false,notes:""},
    {id:"back-squat",name:"Sentadilla trasera",muscle:"Piernas",equipment:"Barra",type:"Fuerza",favorite:true,custom:false,notes:""},
    {id:"leg-press",name:"Prensa de piernas",muscle:"Piernas",equipment:"Maquina",type:"Hipertrofia",favorite:false,custom:false,notes:""},
    {id:"romanian-deadlift",name:"Peso muerto rumano",muscle:"Isquios",equipment:"Barra",type:"Fuerza",favorite:false,custom:false,notes:""},
    {id:"leg-curl",name:"Curl femoral",muscle:"Isquios",equipment:"Maquina",type:"Hipertrofia",favorite:false,custom:false,notes:""},
    {id:"overhead-press",name:"Press militar",muscle:"Hombros",equipment:"Barra",type:"Fuerza",favorite:false,custom:false,notes:""},
    {id:"lateral-raise",name:"Elevaciones laterales",muscle:"Hombros",equipment:"Mancuernas",type:"Hipertrofia",favorite:true,custom:false,notes:""},
    {id:"biceps-curl",name:"Curl de biceps",muscle:"Biceps",equipment:"Mancuernas",type:"Hipertrofia",favorite:false,custom:false,notes:""},
    {id:"triceps-pushdown",name:"Extension de triceps en polea",muscle:"Triceps",equipment:"Polea",type:"Hipertrofia",favorite:false,custom:false,notes:""},
    {id:"calf-raise",name:"Elevacion de gemelos",muscle:"Gemelos",equipment:"Maquina",type:"Hipertrofia",favorite:false,custom:false,notes:""},
    {id:"plank",name:"Plancha",muscle:"Core",equipment:"Peso corporal",type:"Core",favorite:false,custom:false,notes:""}
  ];
}

function canonicalBuiltIns(){
  const context={};context.window=context;context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(catalogSource,context,{filename:"built-in-exercise-catalog.js"});
  return plain(context.GymOSBuiltInExerciseCatalog.get());
}

test("el catálogo canónico contiene 100 IDs únicos y conserva los 14 originales",()=>{
  const catalog=canonicalBuiltIns();
  const ids=catalog.map(item=>item.id);
  const originalIds=legacyLibrary().map(item=>item.id);
  assert.equal(catalog.length,100);
  assert.equal(new Set(ids).size,100);
  originalIds.forEach(id=>assert.ok(ids.includes(id),id));
});

test("el módulo canónico es la única lista integrada completa y app la consume",()=>{
  const catalog=canonicalBuiltIns();
  const metadata=loadDomain().LEGACY_EXERCISE_METADATA;
  assert.equal(fs.existsSync(path.join(projectRoot,"built-in-exercise-catalog.js")),true);
  assert.deepEqual(Object.keys(metadata).sort(),catalog.map(item=>item.id).sort());
  assert.equal((appSource.match(/function defaultExerciseLibrary\(\)/g)||[]).length,1);
  assert.match(extractFunction(appSource,"defaultExerciseLibrary"),/GymOSBuiltInExerciseCatalog\.get\(\)/);
  assert.doesNotMatch(appSource,/const CATALOG=|"hip-flexor-stretch"/);
});

test("nombres y aliases integrados no colisionan entre IDs",()=>{
  const api=loadDomain();
  const migrated=plain(api.migrateExerciseLibrary(canonicalBuiltIns()).library);
  const labels=new Map();
  migrated.forEach(item=>[item.name,...(item.aliases||[])].forEach(label=>{
    const key=api.normalizeToken(label);
    const ids=labels.get(key)||new Set();
    ids.add(item.id);labels.set(key,ids);
  }));
  const ambiguous=[...labels.entries()].filter(([,ids])=>ids.size>1);
  assert.deepEqual(ambiguous,[]);
});

test("consolidar integrados no elimina ni pisa ejercicios personalizados",()=>{
  const custom={
    id:"custom-owner-stable",name:"Mi ejercicio",custom:true,source:"custom",
    ownerId:"11111111-1111-4111-8111-111111111111",category:"strength",
    movementPattern:"horizontal_push"
  };
  const migrated=plain(loadDomain().migrateExerciseLibrary([...canonicalBuiltIns(),custom]).library);
  assert.equal(migrated.length,101);
  assert.equal(migrated.at(-1).id,custom.id);
  assert.equal(migrated.at(-1).name,custom.name);
  assert.equal(migrated.at(-1).custom,true);
});

test("centraliza las taxonomias requeridas para la fase A",()=>{
  const api=loadDomain();
  [
    "squat","hip_hinge","horizontal_push","vertical_push","horizontal_pull",
    "vertical_pull","loaded_carry","unilateral_lower_body"
  ].forEach(value=>assert.ok(api.MOVEMENT_PATTERNS.includes(value)));
  ["strength","cardio","mobility","breathing","pelvic_floor","warm_up","recovery"]
    .forEach(value=>assert.ok(api.EXERCISE_CATEGORIES.includes(value)));
  ["bodyweight","dumbbells","barbell","cable_machine","leg_press","treadmill"]
    .forEach(value=>assert.ok(api.EQUIPMENT_TAXONOMY.includes(value)));
});

test("migra los 14 ejercicios sin perder identidad ni campos heredados",()=>{
  const api=loadDomain();
  const source=legacyLibrary();
  const result=plain(api.migrateExerciseLibrary(source,{timestamp:TIMESTAMP}));
  assert.equal(result.library.length,source.length);
  assert.deepEqual(result.library.map(item=>item.id),source.map(item=>item.id));
  source.forEach((legacy,index)=>{
    const migrated=result.library[index];
    for(const field of ["name","muscle","equipment","type","favorite","custom","notes"]){
      assert.deepEqual(migrated[field],legacy[field]);
    }
    assert.equal(migrated.schemaVersion,1);
    assert.ok(migrated.movementPattern);
    assert.ok(migrated.primaryMuscles.length);
    assert.ok(migrated.requiredEquipment.length);
  });
  assert.ok(result.validation.every(item=>item.valid));
});

test("la migracion es determinista e idempotente",()=>{
  const api=loadDomain();
  const first=plain(api.migrateExerciseLibrary(legacyLibrary(),{timestamp:TIMESTAMP}).library);
  const second=plain(api.migrateExerciseLibrary(first,{timestamp:TIMESTAMP}).library);
  assert.deepEqual(second,first);
  assert.deepEqual(
    plain(api.buildExerciseDomainMigration({exerciseLibrary:legacyLibrary(),timestamp:TIMESTAMP})),
    plain(api.buildExerciseDomainMigration({exerciseLibrary:legacyLibrary(),timestamp:TIMESTAMP}))
  );
});

test("normaliza presets de equipamiento a identificadores concretos",()=>{
  const api=loadDomain();
  const full=plain(api.normalizeEquipmentSelection(["Gimnasio completo"]));
  assert.ok(full.includes("barbell"));
  assert.ok(full.includes("cable_machine"));
  assert.ok(!full.includes("full"));
  assert.deepEqual(
    plain(api.normalizeEquipmentSelection(["Casa con mancuernas"])),
    ["bodyweight","mat","dumbbells","bench"]
  );
});

test("conserva ejercicios personalizados y marca los metadatos pendientes",()=>{
  const api=loadDomain();
  const custom={
    id:"mi-ejercicio",name:"Mi ejercicio",muscle:"Espalda",equipment:"Mancuernas",
    type:"Hipertrofia",favorite:true,custom:true,notes:"Mantener"
  };
  const migrated=plain(api.migrateExerciseLibrary([custom],{timestamp:TIMESTAMP}).library[0]);
  assert.equal(migrated.id,custom.id);
  assert.equal(migrated.name,custom.name);
  assert.equal(migrated.notes,custom.notes);
  assert.equal(migrated.source,"custom");
  assert.equal(migrated.migrationStatus,"needs_review");
});

test("resuelve ids duplicados sin descartar ejercicios",()=>{
  const api=loadDomain();
  const source=[legacyLibrary()[0],{...legacyLibrary()[0],name:"Variante"}];
  const migrated=plain(api.migrateExerciseLibrary(source,{timestamp:TIMESTAMP}).library);
  assert.equal(migrated.length,2);
  assert.equal(new Set(migrated.map(item=>item.id)).size,2);
  assert.equal(migrated[1].legacyDuplicateId,"bench-press");
});

test("el merge conserva colisiones heredadas y repetir el backup no duplica",()=>{
  const api=loadDomain();
  const ownerId="11111111-1111-4111-8111-111111111111";
  const current=[{
    id:"custom-1",name:"Remo artesanal",muscle:"Espalda",equipment:"Mancuernas",
    type:"Hipertrofia",favorite:true,custom:true,notes:"Ejercicio local"
  }];
  const incoming=[{
    id:"custom-1",name:"Sentadilla a cajon",muscle:"Piernas",equipment:"Peso corporal",
    type:"Fuerza",favorite:false,custom:true,notes:"Ejercicio del backup"
  }];
  const localStorage=createStorage({
    "gymos:localDataOwnerId":ownerId,
    "gymos:exerciseLibrary":JSON.stringify(current)
  });
  const context={
    console,localStorage,
    window:{
      GymOSExerciseDomain:api,
      GymOSProfileData:{normalizeOwnerId:value=>String(value).toLowerCase()},
      GymOSRoutineSessionModel:{validateCanonicalRoutine:()=>({valid:true})}
    },
    GYMOS_BACKUP_KEYS:["gymos:exerciseLibrary"],
    EXERCISE_LIBRARY_KEY:"gymos:exerciseLibrary",
    EXERCISE_SUBSTITUTIONS_KEY:"gymos:exerciseSubstitutions",
    FAVORITE_SUBSTITUTIONS_KEY:"gymos:favoriteSubstitutions",
    ROUTINE_PROPOSALS_KEY:"gymos:routineProposals",
    ACTIVE_ROUTINE_PROPOSAL_ID_KEY:"gymos:activeRoutineProposalId",
    LOCAL_OWNER_KEY:"gymos:localDataOwnerId",
    CANONICAL_ROUTINE_KEY:"gymos:routine:canonical",
    CANONICAL_DRAFTS_KEY:"gymos:routineDrafts",
    SELECTED_SESSION_ID_KEY:"gymos:selectedSessionId",
    SESSION_MODEL_MIGRATION_KEY:"gymos:sessionModelMigration",
    draftKey:key=>`gymos:draft:${key}`,
    AUTH_REQUIRED:true,
    assertActiveLocalOwner:value=>String(value).toLowerCase(),
    captureRoutineSessionStartupStorage:()=>localStorage.snapshot(),
    restoreRoutineSessionStartupStorage:snapshot=>{
      Object.keys(localStorage.snapshot()).forEach(key=>localStorage.removeItem(key));
      Object.entries(snapshot).forEach(([key,value])=>localStorage.setItem(key,value));
    },
    getExerciseLibrary:()=>JSON.parse(localStorage.getItem("gymos:exerciseLibrary")||"[]"),
    saveExerciseLibrary:items=>localStorage.setItem(
      "gymos:exerciseLibrary",
      JSON.stringify(api.migrateExerciseLibrary(items,{timestamp:TIMESTAMP}).library)
    ),
    getExerciseSubstitutions:()=>[],
    saveExerciseSubstitutions:()=>{},
    getFavoriteSubstitutions:()=>[],
    saveFavoriteSubstitutions:()=>{},
    ensureProfileDataMigration:()=>{},
    ensureRoutineSessionMigration:()=>{},
    ensureExerciseDomainMigration:()=>{},
    saveCurrentUserVault:()=>{},
    getRoutine:()=>({A:[],B:[],C:[]}),
    sessions:null
  };
  vm.createContext(context);
  vm.runInContext(extractFunction(appSource,"validateGymOSBackup"),context);
  vm.runInContext(extractFunction(appSource,"importGymOSBackup"),context);
  const backup={
    app:"GymOS",
    ownerId,
    storage:{"gymos:exerciseLibrary":JSON.stringify(incoming)}
  };

  context.backup=backup;
  vm.runInContext("importGymOSBackup(backup,'merge')",context);
  const firstRaw=localStorage.getItem("gymos:exerciseLibrary");
  const first=JSON.parse(firstRaw);
  assert.equal(first.length,2);
  assert.deepEqual(first.map(item=>item.name),["Remo artesanal","Sentadilla a cajon"]);
  assert.deepEqual(first.map(item=>item.id),["custom-1","custom-1-2"]);
  assert.equal(new Set(first.map(item=>item.id)).size,2);
  assert.equal(first[1].legacyDuplicateId,"custom-1");

  vm.runInContext("importGymOSBackup(backup,'merge')",context);
  const secondRaw=localStorage.getItem("gymos:exerciseLibrary");
  assert.equal(secondRaw,firstRaw);
  assert.deepEqual(
    JSON.parse(secondRaw).map(item=>item.id),
    ["custom-1","custom-1-2"]
  );
});

test("los metadatos de embarazo son conservadores y exigen revision",()=>{
  const api=loadDomain();
  const exercise=plain(api.migrateExerciseLibrary([legacyLibrary()[0]],{timestamp:TIMESTAMP}).library[0]);
  assert.equal(exercise.pregnancy.eligibleForConsideration,false);
  assert.equal(exercise.pregnancy.requiresProfessionalClearance,true);
  assert.equal(exercise.pregnancy.balanceRisk,"unknown");
  assert.match(exercise.pregnancy.notes.join(" "),/revisi/i);
});

test("las reglas de programacion respetan prioridad y cambian por objetivo",()=>{
  const api=loadDomain();
  assert.deepEqual(plain(api.PROGRAMMING_PRIORITY),[
    "life_state","restrictions","primary_goal","training_phase","secondary_goals","preferences"
  ]);
  const returnRule=plain(api.getProgrammingRule("return_to_training"));
  const strengthRule=plain(api.getProgrammingRule("strength_gain"));
  assert.notDeepEqual(returnRule,strengthRule);
  assert.ok(returnRule.targetRir[0]>strengthRule.targetRir[0]);
  assert.ok(strengthRule.mainRestSeconds[0]>returnRule.mainRestSeconds[0]);
});

test("el plan de migracion no puede alterar rutina ni historial",()=>{
  const api=loadDomain();
  const routine=JSON.stringify({A:[{name:"Press de banca",sets:3,reps:"8"}],B:[],C:[]});
  const history=JSON.stringify([{date:"2026-07-27",session:"A"}]);
  const before={routine,history};
  api.buildExerciseDomainMigration({
    exerciseLibrary:legacyLibrary(),
    userProfile:{availableEquipment:["Gimnasio completo"]},
    timestamp:TIMESTAMP
  });
  assert.equal(routine,before.routine);
  assert.equal(history,before.history);
  assert.doesNotMatch(moduleSource,/localStorage|saveRoutine|saveHistory|gymos:routine|gymos:history/);
});

test("la integracion protege datos, aisla backups y respeta el orden de arranque",()=>{
  const migrationStart=appSource.indexOf("function ensureExerciseDomainMigration");
  const migrationEnd=appSource.indexOf("function localDataKeys",migrationStart);
  const migrationSource=appSource.slice(migrationStart,migrationEnd);
  assert.match(migrationSource,/protectedData=\{[\s\S]*gymos:routine[\s\S]*gymos:history/);
  assert.match(migrationSource,/localStorage\.getItem\("gymos:routine"\)!==protectedData\.routine/);
  assert.doesNotMatch(migrationSource,/saveRoutine\(|saveHistory\(/);
  assert.match(appSource,/EXERCISE_DOMAIN_MIGRATION_BACKUP_PREFIX="gymos:exerciseDomainMigrationBackup:"/);
  assert.match(appSource,/exerciseDomainMigrationBackupKey[\s\S]*normalizeOwnerId\(ownerId\)/);
  assert.match(appSource,/deleteOwnerLocalData[\s\S]*removeItem\(exerciseDomainMigrationBackupKey\(normalizedOwnerId\)\)/);

  const backupKeysStart=appSource.indexOf("const GYMOS_BACKUP_KEYS=[");
  const backupKeysEnd=appSource.indexOf("];",backupKeysStart);
  assert.doesNotMatch(
    appSource.slice(backupKeysStart,backupKeysEnd),
    /exerciseDomainMigrationBackup/
  );

  const activateStart=appSource.indexOf("function finishLocalUserActivation");
  const activateEnd=appSource.indexOf("function activateLocalUser",activateStart);
  const activateSource=appSource.slice(activateStart,activateEnd);
  assert.ok(activateSource.indexOf("ensureRoutineSessionMigration")<activateSource.lastIndexOf("ensureExerciseDomainMigration"));
  assert.ok(activateSource.lastIndexOf("ensureExerciseDomainMigration")<activateSource.lastIndexOf("saveCurrentUserVault"));
});

test("la migracion persistente real conserva la igualdad serializada",()=>{
  const api=loadDomain();
  const ownerId="11111111-1111-4111-8111-111111111111";
  const routine=JSON.stringify({A:[{name:"Press de banca",sets:3,reps:"8"}],B:[],C:[]});
  const history=JSON.stringify([{date:"2026-07-27",session:"A",sets:[{kg:50,reps:8}]}]);
  const originalLibrary=JSON.stringify(legacyLibrary());
  const originalProfile=JSON.stringify({id:"profile-1",availableEquipment:["Gimnasio completo"]});
  const localStorage=createStorage({
    "gymos:localDataOwnerId":ownerId,
    "gymos:routine":routine,
    "gymos:history":history,
    "gymos:exerciseLibrary":originalLibrary,
    "gymos:userProfile":originalProfile
  });
  const profileApi=testOwnerProfileApi(localStorage);
  const context={
    console,localStorage,
    window:{GymOSExerciseDomain:api,GymOSProfileData:profileApi},
    AUTH_REQUIRED:true,
    LOCAL_OWNER_KEY:"gymos:localDataOwnerId",
    EXERCISE_LIBRARY_KEY:"gymos:exerciseLibrary",
    EXERCISE_DOMAIN_SCHEMA_KEY:"gymos:exerciseDomainSchemaVersion",
    EXERCISE_DOMAIN_MIGRATION_BACKUP_PREFIX:"gymos:exerciseDomainMigrationBackup:",
    defaultExerciseLibrary:legacyLibrary,
    markLocalUpdated:()=>{throw new Error("No debe marcar cambios durante la migracion");}
  };
  vm.createContext(context);
  for(const name of [
    "exerciseDomainMigrationBackupKey","restoreStorageValue","ensureExerciseDomainMigration"
  ]){
    vm.runInContext(extractFunction(appSource,name),context);
  }
  const first=vm.runInContext(
    `ensureExerciseDomainMigration({ownerId:"${ownerId}",mark:false})`,
    context
  );
  assert.equal(first.migrated,true);
  assert.equal(localStorage.getItem("gymos:routine"),routine);
  assert.equal(localStorage.getItem("gymos:history"),history);
  assert.equal(localStorage.getItem("gymos:exerciseDomainSchemaVersion"),api.DOMAIN_VERSION);
  const backupKey=`gymos:exerciseDomainMigrationBackup:${ownerId}`;
  const backupRaw=localStorage.getItem(backupKey);
  const backup=JSON.parse(backupRaw);
  assert.equal(backup.ownerId,ownerId);
  assert.equal(backup.storage["gymos:exerciseLibrary"],originalLibrary);
  assert.equal(backup.storage["gymos:userProfile"],originalProfile);
  assert.deepEqual(Object.keys(backup.storage).sort(),["gymos:exerciseLibrary","gymos:userProfile"]);

  const second=vm.runInContext(
    `ensureExerciseDomainMigration({ownerId:"${ownerId}",mark:false})`,
    context
  );
  assert.equal(second.migrated,false);
  assert.equal(localStorage.getItem(backupKey),backupRaw);
  assert.equal(localStorage.getItem("gymos:routine"),routine);
  assert.equal(localStorage.getItem("gymos:history"),history);
});

test("aplicar dos veces el mismo payload conserva igualdad serializada exacta",()=>{
  const api=loadDomain();
  const ownerId="11111111-1111-4111-8111-111111111111";
  const localStorage=createStorage({
    "gymos:localDataOwnerId":ownerId,
    "gymos:localRevision":"revision-local-7",
    "gymos:appPreferences":JSON.stringify({theme:"dark",fontSize:"large"}),
    "gymos:updatedAt":"2026-07-20T08:00:00.000Z"
  });
  const profileApi=testOwnerProfileApi(localStorage);
  const state={applyingRemote:false,selectedSession:"A"};
  const context={
    console,localStorage,state,
    window:{GymOSExerciseDomain:api,GymOSProfileData:profileApi},
    AUTH_REQUIRED:true,
    LOCAL_OWNER_KEY:"gymos:localDataOwnerId",
    EXERCISE_LIBRARY_KEY:"gymos:exerciseLibrary",
    EXERCISE_DOMAIN_SCHEMA_KEY:"gymos:exerciseDomainSchemaVersion",
    EXERCISE_DOMAIN_MIGRATION_BACKUP_PREFIX:"gymos:exerciseDomainMigrationBackup:",
    defaultExerciseLibrary:legacyLibrary,
    markLocalUpdated:()=>{throw new Error("La sincronizacion remota no debe marcar una edicion local");},
    saveHistory:value=>localStorage.setItem("gymos:history",JSON.stringify(value)),
    saveRoutine:value=>localStorage.setItem("gymos:routine",JSON.stringify(value)),
    getRoutine:()=>JSON.parse(localStorage.getItem("gymos:routine")||'{"A":[],"B":[],"C":[]}'),
    ensureProfileDataMigration:()=>{},
    ensureRoutineSessionMigration:()=>({migrated:false}),
    currentRoutineOwnerOrNull:()=>ownerId,
    assertActiveLocalOwner:value=>value,
    captureRoutineSessionStartupStorage:()=>localStorage.snapshot(),
    restoreRoutineSessionStartupStorage:()=>{},
    sessions:null
  };
  vm.createContext(context);
  for(const name of [
    "saveExerciseLibrary","exerciseDomainMigrationBackupKey","restoreStorageValue",
    "ensureExerciseDomainMigration","applySyncPayload"
  ]){
    vm.runInContext(extractFunction(appSource,name),context);
  }

  const exercise=plain(api.normalizeExerciseDefinition({
    id:"custom-sync",name:"Press estable",muscle:"Pecho",equipment:"Mancuernas",
    type:"Hipertrofia",favorite:true,custom:true,notes:"Preferido",
    aliases:["Press personal"],requiredEquipment:["dumbbells"],
    movementPattern:"horizontal_push",primaryMuscles:["chest"],
    createdAt:"2026-07-01T10:00:00.000Z",updatedAt:"2026-07-10T10:00:00.000Z"
  },{timestamp:TIMESTAMP}));
  const payload={
    updatedAt:"2026-07-28T12:00:00.000Z",
    routine:{A:[{name:"Press estable",sets:3,reps:"8-12"}],B:[],C:[]},
    history:[{date:"2026-07-27",session:"A",sets:[{kg:20,reps:10}]}],
    exerciseLibrary:[exercise],
    userProfile:{
      id:"profile-sync",name:"Adrian",availableEquipment:["dumbbells","bench"],
      createdAt:"2026-07-01T09:00:00.000Z",updatedAt:"2026-07-11T09:00:00.000Z"
    }
  };
  context.payload=payload;
  vm.runInContext("applySyncPayload(payload)",context);
  const keys=[
    "gymos:exerciseLibrary","gymos:userProfile","gymos:exerciseDomainSchemaVersion",
    "gymos:routine","gymos:history","gymos:localRevision",
    "gymos:appPreferences","gymos:updatedAt"
  ];
  const first=Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)]));

  vm.runInContext("applySyncPayload(payload)",context);
  const second=Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)]));
  assert.deepEqual(second,first);
  assert.equal(JSON.parse(second["gymos:exerciseLibrary"])[0].updatedAt,exercise.updatedAt);
  assert.deepEqual(JSON.parse(second["gymos:exerciseLibrary"])[0].aliases,exercise.aliases);
  assert.equal(JSON.parse(second["gymos:exerciseLibrary"])[0].equipment,exercise.equipment);
  assert.equal(second["gymos:localRevision"],"revision-local-7");
  assert.equal(second["gymos:appPreferences"],JSON.stringify({theme:"dark",fontSize:"large"}));
  assert.equal(second["gymos:updatedAt"],payload.updatedAt);
});

test("el modulo se carga antes de app y queda incluido en la cache PWA",()=>{
  assert.ok(indexSource.indexOf("built-in-exercise-catalog.js")<indexSource.indexOf("exercise-domain.js"));
  assert.ok(indexSource.indexOf("exercise-domain.js")<indexSource.indexOf("app.js?v="));
  assert.match(serviceWorkerSource,/const GYMOS_BUILD_VERSION="4\.2\.0-rc\.13-sync-audit-last-sync"/);
  assert.equal((serviceWorkerSource.match(/built-in-exercise-catalog\.js/g)||[]).length,1);
  assert.match(serviceWorkerSource,/exercise-domain\.js/);
});
