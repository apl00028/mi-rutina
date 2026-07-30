"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const projectRoot=path.resolve(__dirname,"..");
const moduleSource=fs.readFileSync(path.join(projectRoot,"profile-data.js"),"utf8");
const OWNER_A="11111111-1111-4111-8111-111111111111";
const OWNER_B="22222222-2222-4222-8222-222222222222";
let generatedId=0;

function createStorage(initial={}){
  const storage={};
  Object.defineProperties(storage,{
    getItem:{enumerable:false,value:key=>Object.prototype.hasOwnProperty.call(storage,key)?String(storage[key]):null},
    setItem:{enumerable:false,value:(key,value)=>{storage[key]=String(value);}},
    removeItem:{enumerable:false,value:key=>{delete storage[key];}},
    clear:{enumerable:false,value:()=>{Object.keys(storage).forEach(key=>delete storage[key]);}},
    key:{enumerable:false,value:index=>Object.keys(storage)[index]??null},
    length:{enumerable:false,get:()=>Object.keys(storage).length}
  });
  Object.entries(initial).forEach(([key,value])=>storage.setItem(key,value));
  return storage;
}

function loadProfileData(initial={}){
  const localStorage=createStorage(initial);
  const context={
    localStorage,
    console,
    crypto:{randomUUID:()=>`test-${++generatedId}`}
  };
  context.window=context;
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(moduleSource,context,{filename:"profile-data.js"});
  return {api:context.GymOSProfileData,localStorage};
}

function storageSnapshot(storage){
  return Object.fromEntries(Object.keys(storage).sort().map(key=>[key,storage.getItem(key)]));
}

function vaultKey(ownerId){return `gymos:userVault:${ownerId}`;}
function activeUserKeys(api){
  return [...new Set([...api.SNAPSHOT_DATA_KEYS,api.STORAGE_KEYS.dataSchemaVersion])];
}
function snapshotActiveUserData(api,storage){
  const snapshot={};
  activeUserKeys(api).forEach(key=>{
    const value=storage.getItem(key);
    if(value!==null) snapshot[key]=value;
  });
  return snapshot;
}
function clearActiveUserData(api,storage){
  activeUserKeys(api).forEach(key=>storage.removeItem(key));
}
function saveTestVault(api,storage,ownerId){
  storage.setItem(vaultKey(ownerId),JSON.stringify(snapshotActiveUserData(api,storage)));
}
function loadTestVault(api,storage,ownerId){
  clearActiveUserData(api,storage);
  const vault=JSON.parse(storage.getItem(vaultKey(ownerId))||"{}");
  Object.entries(vault).forEach(([key,value])=>storage.setItem(key,value));
}
function hasLegacyUserData(storage){
  return ["gymos:routine","gymos:history","gymos:onboardingProfile","gymos:body","gymos:nutritionEntries"]
    .some(key=>storage.getItem(key)!==null);
}
function activateTestOwner(api,storage,ownerId){
  const previous=storage.getItem("gymos:localDataOwnerId");
  if(previous===ownerId){
    api.migrateDataModel({ownerId,mark:false});
    saveTestVault(api,storage,ownerId);
    return;
  }
  if(previous){
    saveTestVault(api,storage,previous);
    loadTestVault(api,storage,ownerId);
  }else if(hasLegacyUserData(storage)){
    storage.setItem(vaultKey(ownerId),JSON.stringify(snapshotActiveUserData(api,storage)));
  }else{
    loadTestVault(api,storage,ownerId);
  }
  storage.setItem("gymos:localDataOwnerId",ownerId);
  api.migrateDataModel({ownerId,mark:false});
  saveTestVault(api,storage,ownerId);
}

function assertIsoDates(record){
  assert.match(record.createdAt,/^\d{4}-\d{2}-\d{2}T/);
  assert.match(record.updatedAt,/^\d{4}-\d{2}-\d{2}T/);
  assert.match(record.startedAt,/^\d{4}-\d{2}-\d{2}$/);
}

function test(name,fn){
  try{
    fn();
    console.log(`PASS ${name}`);
  }catch(error){
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const legacyRoutine=JSON.stringify({
  A:[{name:"Sentadilla",sets:4,target:"8"}],
  B:[{name:"Press banca",sets:3,target:"10"}],
  C:[]
});
const legacyHistory=JSON.stringify([
  {id:"workout-1",date:"2026-07-26",session:"A",sets:[{weight:80,reps:8}]}
]);
const legacyProfile=JSON.stringify({
  name:"Persona de prueba",
  goal:"muscle",
  days:4,
  duration:60,
  experience:"intermediate",
  location:"gym",
  completedAt:"2026-05-10T09:30:00.000Z"
});
const legacyNutrition=JSON.stringify({calories:2400,protein:160});

test("migra un usuario v4.0.3 y conserva todos sus datos anteriores",()=>{
  const {api,localStorage}=loadProfileData({
    "gymos:routine":legacyRoutine,
    "gymos:history":legacyHistory,
    "gymos:onboardingProfile":legacyProfile,
    "gymos:nutritionSettings":legacyNutrition,
    "gymos:dailyRecovery":JSON.stringify([{date:"2026-07-27",score:76}])
  });
  const beforeRoutine=localStorage.getItem("gymos:routine");
  const beforeHistory=localStorage.getItem("gymos:history");
  const beforeNutrition=localStorage.getItem("gymos:nutritionSettings");
  const result=api.migrateDataModel({ownerId:OWNER_A,mark:false});

  assert.equal(result.migrated,true);
  assert.equal(localStorage.getItem("gymos:routine"),beforeRoutine);
  assert.equal(localStorage.getItem("gymos:history"),beforeHistory);
  assert.equal(localStorage.getItem("gymos:nutritionSettings"),beforeNutrition);
  assert.equal(api.getUserProfile().name,"Persona de prueba");
  assert.equal(api.getActiveGoalCycle().primaryGoal,"muscle_gain");
  assert.equal(api.getActiveTrainingPhase().type,"muscle_gain");
  assert.equal(api.getCurrentLifeState().type,"general");
  assertIsoDates(api.getActiveGoalCycle());
  assertIsoDates(api.getActiveTrainingPhase());
  assertIsoDates(api.getCurrentLifeState());

  const snapshot=JSON.parse(localStorage.getItem(api.migrationSnapshotKey(OWNER_A)));
  assert.equal(snapshot.ownerId,OWNER_A);
  assert.equal(snapshot.storage["gymos:routine"],legacyRoutine);
  assert.equal(snapshot.storage["gymos:history"],legacyHistory);
  assert.equal(snapshot.storage["gymos:nutritionSettings"],legacyNutrition);
});

test("la migración se ejecuta una sola vez sin duplicar registros",()=>{
  const {api,localStorage}=loadProfileData({
    "gymos:routine":legacyRoutine,
    "gymos:history":legacyHistory,
    "gymos:onboardingProfile":legacyProfile
  });
  api.migrateDataModel({ownerId:OWNER_A,mark:false});
  const first=storageSnapshot(localStorage);
  const result=api.migrateDataModel({ownerId:OWNER_A,mark:false});
  const second=storageSnapshot(localStorage);

  assert.equal(result.migrated,false);
  assert.deepEqual(second,first);
  assert.equal(api.getGoalsHistory().length,0);
  assert.equal(api.getTrainingPhases().length,0);
});

test("rechaza objetivos duplicados y más de dos secundarios",()=>{
  const {api}=loadProfileData();
  assert.equal(api.validateGoalSelection("muscle_gain",["muscle_gain"]).valid,false);
  assert.equal(api.validateGoalSelection("muscle_gain",["strength_gain","strength_gain"]).valid,false);
  assert.equal(api.validateGoalSelection("muscle_gain",["strength_gain","mobility","endurance"]).valid,false);
  assert.equal(api.validateGoalSelection("muscle_gain",["strength_gain","mobility"]).valid,true);
});

test("mantiene un solo ciclo de objetivo activo y archiva el anterior",()=>{
  const {api}=loadProfileData();
  api.setCurrentLifeState({type:"general",startedAt:"2026-07-01"},{mark:false});
  const first=api.startGoalCycle({primaryGoal:"strength_gain",startedAt:"2026-07-01"},{mark:false});
  const second=api.startGoalCycle({primaryGoal:"mobility",startedAt:"2026-07-28"},{mark:false});

  assert.equal(api.getActiveGoalCycle().id,second.id);
  assert.equal(api.getGoalsHistory().length,1);
  assert.equal(api.getGoalsHistory()[0].id,first.id);
  assert.equal(api.getGoalsHistory()[0].status,"replaced");
  assert.equal(api.getGoalsHistory()[0].endedAt,"2026-07-28");
});

test("mantiene un solo estado vital activo y conserva su historial",()=>{
  const {api}=loadProfileData();
  const first=api.setCurrentLifeState({type:"general",startedAt:"2026-06-01"},{mark:false});
  const second=api.setCurrentLifeState({
    type:"pregnancy",
    startedAt:"2026-07-28",
    pregnancyWeek:14,
    estimatedDueDate:"2027-01-20",
    pregnancyType:"singleton",
    trainedBeforePregnancy:"yes",
    previousTrainingLevel:"intermediate",
    medicalExerciseClearance:"unknown",
    highRiskStatus:"unknown",
    currentLimitations:["fatiga"],
    professionalRestrictions:[],
    requiresProfessionalReview:true
  },{mark:false});

  assert.equal(api.getCurrentLifeState().id,second.id);
  assert.equal(api.getCurrentLifeState().details.pregnancyTrimester,"second");
  assert.equal(api.getLifeStateHistory().length,1);
  assert.equal(api.getLifeStateHistory()[0].id,first.id);
  assert.equal(api.getLifeStateHistory()[0].status,"replaced");
});

test("mantiene una sola fase activa y conserva su historial",()=>{
  const {api}=loadProfileData();
  const first=api.startTrainingPhase({type:"adaptation",startedAt:"2026-07-01"},{mark:false});
  const second=api.startTrainingPhase({type:"strength",startedAt:"2026-07-28"},{mark:false});

  assert.equal(api.getActiveTrainingPhase().id,second.id);
  assert.equal(api.getTrainingPhases().length,1);
  assert.equal(api.getTrainingPhases()[0].id,first.id);
  assert.equal(api.getTrainingPhases()[0].status,"replaced");
});

test("restaura una copia antigua y ejecuta después la migración",()=>{
  const oldBackup={
    app:"GymOS",
    backupVersion:"4.0.3",
    storage:{
      "gymos:routine":legacyRoutine,
      "gymos:history":legacyHistory,
      "gymos:onboardingProfile":legacyProfile,
      "gymos:nutritionSettings":legacyNutrition
    }
  };
  const {api,localStorage}=loadProfileData();
  Object.entries(oldBackup.storage).forEach(([key,value])=>localStorage.setItem(key,value));
  api.migrateDataModel({ownerId:OWNER_A,mark:false});

  assert.equal(localStorage.getItem("gymos:routine"),legacyRoutine);
  assert.equal(localStorage.getItem("gymos:history"),legacyHistory);
  assert.equal(localStorage.getItem("gymos:nutritionSettings"),legacyNutrition);
  assert.equal(api.getActiveGoalCycle().primaryGoal,"muscle_gain");
});

test("serializa y recupera el nuevo modelo sin modificar rutina ni historial",()=>{
  const source=loadProfileData({
    "gymos:routine":legacyRoutine,
    "gymos:history":legacyHistory,
    "gymos:onboardingProfile":legacyProfile
  });
  source.api.migrateDataModel({ownerId:OWNER_A,mark:false});
  source.api.startGoalCycle({
    primaryGoal:"strength_gain",
    secondaryGoals:["mobility"],
    startedAt:"2026-07-28"
  },{mark:false});
  const payload=source.api.exportSyncData();

  const target=loadProfileData({
    "gymos:routine":legacyRoutine,
    "gymos:history":legacyHistory
  });
  const beforeRoutine=target.localStorage.getItem("gymos:routine");
  const beforeHistory=target.localStorage.getItem("gymos:history");
  assert.equal(target.api.importSyncData(payload,{mark:false}),true);

  assert.equal(JSON.stringify(target.api.exportSyncData()),JSON.stringify(payload));
  assert.equal(target.localStorage.getItem("gymos:routine"),beforeRoutine);
  assert.equal(target.localStorage.getItem("gymos:history"),beforeHistory);
});

test("el payload de sincronización incluye las ocho entidades nuevas",()=>{
  const {api}=loadProfileData({"gymos:onboardingProfile":legacyProfile});
  api.migrateDataModel({ownerId:OWNER_A,mark:false});
  const payload=api.exportSyncData();
  [
    "dataSchemaVersion","userProfile","currentLifeState","lifeStateHistory",
    "activeGoalCycle","goalsHistory","activeTrainingPhase","trainingPhases"
  ].forEach(key=>assert.ok(Object.prototype.hasOwnProperty.call(payload,key),`Falta ${key}`));

  const appSource=fs.readFileSync(path.join(projectRoot,"app.js"),"utf8");
  assert.match(appSource,/GymOSProfileData\?\.exportSyncData/);
  assert.match(appSource,/GymOSProfileData\?\.importSyncData/);
});

test("backup, restauración y vault incluyen el modelo sin añadir reemplazo de rutina",()=>{
  const appSource=fs.readFileSync(path.join(projectRoot,"app.js"),"utf8");
  [
    "gymos:dataSchemaVersion","gymos:userProfile","gymos:currentLifeState",
    "gymos:lifeStateHistory","gymos:activeGoalCycle","gymos:goalsHistory",
    "gymos:activeTrainingPhase","gymos:trainingPhases"
  ].forEach(key=>assert.ok(appSource.includes(`"${key}"`),`Falta ${key} en la persistencia de app.js`));
  assert.match(appSource,/function localDataKeys\(\)[\s\S]*GYMOS_BACKUP_KEYS/);
  assert.match(appSource,/function importGymOSBackup[\s\S]*ensureProfileDataMigration\(\{ownerId,mark:false\}\)/);
  assert.match(appSource,/function activateLocalUser[\s\S]*localStorage\.setItem\(LOCAL_OWNER_KEY,userId\);[\s\S]*finishLocalUserActivation\(userId\)/);
  assert.match(appSource,/function finishLocalUserActivation[\s\S]*ensureProfileDataMigration\(\{ownerId,mark:false\}\);[\s\S]*saveCurrentUserVault\(ownerId\)/);
  assert.doesNotMatch(appSource,/GYMOS_BACKUP_KEYS=\[[\s\S]*gymos:preMigration/);
  assert.doesNotMatch(moduleSource,/generateRoutineProposal|diffRoutines|activateRoutineProposal|pendingRoutineProposal/);
  assert.doesNotMatch(moduleSource,/localStorage\.setItem\(["']gymos:routine/);
  assert.doesNotMatch(moduleSource,/saveRoutine\s*\(/);
});

test("aísla la migración y el snapshot de dos usuarios en el mismo navegador",()=>{
  const routineB=JSON.stringify({A:[{name:"Peso muerto",sets:3,target:"5"}],B:[],C:[]});
  const historyB=JSON.stringify([{id:"workout-B",date:"2026-07-20",session:"A"}]);
  const profileB=JSON.stringify({name:"Bea",goal:"strength",days:3,completedAt:"2026-06-01T10:00:00.000Z"});
  const vaultA={
    "gymos:routine":legacyRoutine,
    "gymos:history":legacyHistory,
    "gymos:onboardingProfile":legacyProfile
  };
  const vaultB={
    "gymos:routine":routineB,
    "gymos:history":historyB,
    "gymos:onboardingProfile":profileB
  };
  const {api,localStorage}=loadProfileData({
    [vaultKey(OWNER_A)]:JSON.stringify(vaultA),
    [vaultKey(OWNER_B)]:JSON.stringify(vaultB),
    "gymos:supabaseUrl":"https://example.supabase.co",
    "gymos:supabaseAnonKey":"secret-not-a-real-key",
    "gymos:syncEmail":"b@example.com"
  });
  const untouchedB=localStorage.getItem(vaultKey(OWNER_B));

  activateTestOwner(api,localStorage,OWNER_A);
  assert.equal(localStorage.getItem(vaultKey(OWNER_B)),untouchedB);
  assert.equal(localStorage.getItem("gymos:routine"),legacyRoutine);
  const migratedA=localStorage.getItem(vaultKey(OWNER_A));

  const snapshotA=JSON.parse(localStorage.getItem(api.migrationSnapshotKey(OWNER_A)));
  assert.equal(snapshotA.ownerId,OWNER_A);
  assert.equal(snapshotA.storage["gymos:routine"],legacyRoutine);
  assert.equal(JSON.stringify(snapshotA).includes("Peso muerto"),false);
  assert.equal(Object.keys(snapshotA.storage).some(key=>key.startsWith("gymos:userVault:")),false);
  assert.equal(Object.keys(snapshotA.storage).some(key=>key.startsWith(api.SNAPSHOT_PREFIX)),false);
  assert.equal(Object.prototype.hasOwnProperty.call(snapshotA.storage,"gymos:localDataOwnerId"),false);
  assert.equal(Object.prototype.hasOwnProperty.call(snapshotA.storage,"gymos:supabaseUrl"),false);
  assert.equal(Object.prototype.hasOwnProperty.call(snapshotA.storage,"gymos:supabaseAnonKey"),false);
  assert.equal(Object.prototype.hasOwnProperty.call(snapshotA.storage,"gymos:syncEmail"),false);

  activateTestOwner(api,localStorage,OWNER_B);
  assert.equal(localStorage.getItem(vaultKey(OWNER_A)),migratedA);
  assert.equal(localStorage.getItem("gymos:routine"),routineB);
  const snapshotB=JSON.parse(localStorage.getItem(api.migrationSnapshotKey(OWNER_B)));
  assert.equal(snapshotB.ownerId,OWNER_B);
  assert.equal(snapshotB.storage["gymos:routine"],routineB);
  assert.equal(JSON.stringify(snapshotB).includes("Sentadilla"),false);
  assert.notEqual(localStorage.getItem(api.migrationSnapshotKey(OWNER_A)),null);
});

test("no permite migrar antes de determinar el propietario",()=>{
  const {api}=loadProfileData({"gymos:routine":legacyRoutine});
  assert.throws(()=>api.migrateDataModel({mark:false}),/propietario válido/);
  [null,undefined,"","usuario","user-A","a@example.com"].forEach(ownerId=>{
    assert.throws(()=>api.normalizeOwnerId(ownerId),/propietario válido/);
  });
  assert.equal(api.normalizeOwnerId("local"),"local");
  assert.equal(api.normalizeOwnerId(OWNER_A.toUpperCase()),OWNER_A);

  const appSource=fs.readFileSync(path.join(projectRoot,"app.js"),"utf8");
  assert.match(appSource,/const AUTH_REQUIRED=true/);
  assert.doesNotMatch(appSource,/ensureProfileDataMigration\(\);\s*render\(\);\s*refreshSyncSession/);
  assert.match(appSource,/render\(\);\s*refreshSyncSession/);
});

test("asigna datos heredados al propietario antes de migrarlos",()=>{
  const {api,localStorage}=loadProfileData({
    "gymos:routine":legacyRoutine,
    "gymos:history":legacyHistory,
    "gymos:onboardingProfile":legacyProfile
  });
  assert.equal(localStorage.getItem("gymos:localDataOwnerId"),null);

  activateTestOwner(api,localStorage,OWNER_A);

  assert.equal(localStorage.getItem("gymos:localDataOwnerId"),OWNER_A);
  assert.equal(localStorage.getItem(vaultKey(OWNER_B)),null);
  const vaultA=JSON.parse(localStorage.getItem(vaultKey(OWNER_A)));
  assert.equal(vaultA["gymos:routine"],legacyRoutine);
  assert.equal(vaultA["gymos:history"],legacyHistory);
  assert.equal(vaultA["gymos:dataSchemaVersion"],api.DATA_SCHEMA_VERSION);
  assert.equal(localStorage.getItem("gymos:routine"),legacyRoutine);
  assert.equal(localStorage.getItem("gymos:history"),legacyHistory);
});

test("la idempotencia se mantiene de forma independiente por usuario",()=>{
  const profileB=JSON.stringify({name:"Bea",goal:"strength",days:3});
  const {api,localStorage}=loadProfileData({
    [vaultKey(OWNER_A)]:JSON.stringify({
      "gymos:routine":legacyRoutine,
      "gymos:history":legacyHistory,
      "gymos:onboardingProfile":legacyProfile
    }),
    [vaultKey(OWNER_B)]:JSON.stringify({
      "gymos:routine":JSON.stringify({A:[],B:[{name:"Remo",sets:3}],C:[]}),
      "gymos:history":"[]",
      "gymos:onboardingProfile":profileB
    })
  });

  activateTestOwner(api,localStorage,OWNER_A);
  const firstA=localStorage.getItem(vaultKey(OWNER_A));
  activateTestOwner(api,localStorage,OWNER_A);
  assert.equal(localStorage.getItem(vaultKey(OWNER_A)),firstA);

  activateTestOwner(api,localStorage,OWNER_B);
  const firstB=localStorage.getItem(vaultKey(OWNER_B));
  activateTestOwner(api,localStorage,OWNER_B);
  assert.equal(localStorage.getItem(vaultKey(OWNER_B)),firstB);

  const vaultA=JSON.parse(localStorage.getItem(vaultKey(OWNER_A)));
  const vaultB=JSON.parse(localStorage.getItem(vaultKey(OWNER_B)));
  assert.equal(JSON.parse(vaultA["gymos:goalsHistory"]||"[]").length,0);
  assert.equal(JSON.parse(vaultA["gymos:trainingPhases"]||"[]").length,0);
  assert.equal(JSON.parse(vaultB["gymos:goalsHistory"]||"[]").length,0);
  assert.equal(JSON.parse(vaultB["gymos:trainingPhases"]||"[]").length,0);
});

test("sincroniza el modelo pero excluye snapshots, vaults y credenciales",()=>{
  const {api}=loadProfileData({
    "gymos:onboardingProfile":legacyProfile,
    [vaultKey(OWNER_B)]:JSON.stringify({"gymos:routine":"DATOS-OTRO-USUARIO"}),
    "gymos:supabaseUrl":"https://example.supabase.co",
    "gymos:supabaseAnonKey":"secret-not-a-real-key",
    "gymos:syncEmail":"other@example.com"
  });
  api.migrateDataModel({ownerId:OWNER_A,mark:false});
  const payload=api.exportSyncData();
  const serialized=JSON.stringify(payload);
  [
    "dataSchemaVersion","userProfile","currentLifeState","lifeStateHistory",
    "activeGoalCycle","goalsHistory","activeTrainingPhase","trainingPhases"
  ].forEach(key=>assert.ok(Object.prototype.hasOwnProperty.call(payload,key),`Falta ${key}`));
  assert.equal(serialized.includes("preMigration"),false);
  assert.equal(serialized.includes("userVault"),false);
  assert.equal(serialized.includes("supabaseAnonKey"),false);
  assert.equal(serialized.includes("supabaseUrl"),false);
  assert.equal(serialized.includes("syncEmail"),false);
  assert.equal(serialized.includes("DATOS-OTRO-USUARIO"),false);

  const appSource=fs.readFileSync(path.join(projectRoot,"app.js"),"utf8");
  const syncStart=appSource.indexOf("function buildSyncPayload()");
  const syncEnd=appSource.indexOf("function applySyncPayload",syncStart);
  const syncSource=appSource.slice(syncStart,syncEnd);
  assert.match(syncSource,/GymOSProfileData\?\.exportSyncData/);
  assert.doesNotMatch(syncSource,/preMigration|userVault|supabaseAnonKey|supabaseUrl|syncEmail/);
});

test("mantiene las claves internas de migración fuera del backup, vault y sincronización",()=>{
  const {api}=loadProfileData();
  assert.deepEqual(
    Array.from(api.MIGRATION_INTERNAL_KEY_PREFIXES),
    [
      "gymos:preMigration:4.1.0-alpha.1:",
      "gymos:legacyTrainingSetup:4.2.0-alpha.1:",
      "gymos:preSessionMigration:4.2.0-alpha.1-phase-h2:"
    ]
  );
  assert.deepEqual(
    Array.from(api.migrationInternalKeys(OWNER_A)),
    [
      `gymos:preMigration:4.1.0-alpha.1:${OWNER_A}`,
      `gymos:legacyTrainingSetup:4.2.0-alpha.1:${OWNER_A}`,
      `gymos:preSessionMigration:4.2.0-alpha.1-phase-h2:${api.opaqueOwnerStorageId(OWNER_A)}`,
      `gymos:preSessionMigration:4.2.0-alpha.1-phase-h2:${OWNER_A}`
    ]
  );

  const appSource=fs.readFileSync(path.join(projectRoot,"app.js"),"utf8");
  const backupStart=appSource.indexOf("const GYMOS_BACKUP_KEYS=[");
  const backupEnd=appSource.indexOf("];",backupStart);
  const backupSource=appSource.slice(backupStart,backupEnd);
  assert.doesNotMatch(backupSource,/preMigration|MIGRATION_INTERNAL/);

  const syncStart=appSource.indexOf("function buildSyncPayload()");
  const syncEnd=appSource.indexOf("function applySyncPayload",syncStart);
  assert.doesNotMatch(appSource.slice(syncStart,syncEnd),/preMigration|MIGRATION_INTERNAL/);

  const vaultStart=appSource.indexOf("function localDataKeys()");
  const vaultEnd=appSource.indexOf("function snapshotCurrentLocalData",vaultStart);
  assert.doesNotMatch(appSource.slice(vaultStart,vaultEnd),/preMigration|MIGRATION_INTERNAL/);
});

test("la identidad del backup H2 es opaca, estable, aislada y migra la clave de desarrollo",()=>{
  const legacyKey=`gymos:preSessionMigration:4.2.0-alpha.1-phase-h2:${OWNER_A}`;
  const {api,localStorage}=loadProfileData({[legacyKey]:'{"raw":"legacy"}'});
  const keyA=api.sessionModelMigrationBackupKey(OWNER_A);
  const keyASecond=api.sessionModelMigrationBackupKey(OWNER_A.toUpperCase());
  const keyB=api.sessionModelMigrationBackupKey(OWNER_B);
  assert.equal(keyA,keyASecond);
  assert.notEqual(keyA,keyB);
  assert.doesNotMatch(keyA,new RegExp(OWNER_A,"i"));
  assert.doesNotMatch(keyA,/@|undefined|null/i);
  assert.match(keyA,/phase-h2:o-[0-9a-f]{32}$/);
  assert.equal(api.migrateSessionModelMigrationBackup(OWNER_A),keyA);
  assert.equal(localStorage.getItem(keyA),'{"raw":"legacy"}');
  assert.equal(localStorage.getItem(legacyKey),null);
});

test("elimina únicamente el snapshot del propietario en los flujos de borrado",()=>{
  const {api,localStorage}=loadProfileData({"gymos:routine":legacyRoutine});
  api.createMigrationSnapshot(OWNER_A);
  localStorage.setItem("gymos:routine",JSON.stringify({A:[{name:"Remo"}],B:[],C:[]}));
  api.createMigrationSnapshot(OWNER_B);
  const snapshotB=localStorage.getItem(api.migrationSnapshotKey(OWNER_B));

  api.removeMigrationInternalData(OWNER_A);

  assert.equal(localStorage.getItem(api.migrationSnapshotKey(OWNER_A)),null);
  assert.equal(localStorage.getItem(api.migrationSnapshotKey(OWNER_B)),snapshotB);

  const appSource=fs.readFileSync(path.join(projectRoot,"app.js"),"utf8");
  assert.match(appSource,/function deleteOwnerLocalData[\s\S]*removeMigrationInternalData\(normalizedOwnerId\)/);
  assert.match(appSource,/deleteDataButton[\s\S]*deleteOwnerLocalData\(ownerId\)/);
  assert.match(appSource,/requestAccountDeletion[\s\S]*await signOutSync\(\);[\s\S]*deleteOwnerLocalData\(ownerId,\{removeOwner:true\}\)/);
  assert.doesNotMatch(
    appSource.slice(
      appSource.indexOf("function deactivateLocalUser"),
      appSource.indexOf("function deleteOwnerLocalData")
    ),
    /removeMigrationInternalData|preMigration/
  );
});

test("adapta un perfil anterior completado aunque la migración de esquema ya hubiera terminado",()=>{
  const legacy=JSON.parse(legacyProfile);
  legacy.equipment="basic";
  legacy.preference="machines";
  legacy.cardio="walking";
  const {api,localStorage}=loadProfileData({
    "gymos:dataSchemaVersion":"4.1.0-alpha.1",
    "gymos:onboardingProfile":JSON.stringify(legacy),
    "gymos:routine":legacyRoutine,
    "gymos:history":legacyHistory
  });
  const routineBefore=localStorage.getItem("gymos:routine");
  const historyBefore=localStorage.getItem("gymos:history");

  const result=api.migrateLegacyTrainingSetup({ownerId:OWNER_A,mark:false});

  assert.equal(result.migrated,true);
  assert.equal(api.getActiveGoalCycle().primaryGoal,"muscle_gain");
  assert.equal(api.getActiveTrainingPhase().type,"muscle_gain");
  assert.equal(api.getUserProfile().weeklyAvailability,4);
  assert.equal(api.getUserProfile().preferredSessionDurationMin,60);
  assert.equal(api.getUserProfile().trainingLocation,"gym");
  assert.deepEqual(Array.from(api.getUserProfile().availableEquipment),[
    "bodyweight","mat","dumbbells","bench","resistance_band"
  ]);
  assert.equal(api.getUserProfile().trainingPreferences.style,"machines");
  assert.equal(localStorage.getItem("gymos:routine"),routineBefore);
  assert.equal(localStorage.getItem("gymos:history"),historyBefore);
});

test("la adaptación del configurador anterior es idempotente y separada por propietario",()=>{
  const {api,localStorage}=loadProfileData({
    "gymos:onboardingProfile":legacyProfile,
    "gymos:routine":legacyRoutine,
    "gymos:history":legacyHistory
  });
  const first=api.migrateLegacyTrainingSetup({ownerId:OWNER_A,mark:false});
  const serialized=JSON.stringify(api.exportSyncData());
  const second=api.migrateLegacyTrainingSetup({ownerId:OWNER_A,mark:false});

  assert.equal(first.migrated,true);
  assert.equal(second.migrated,false);
  assert.equal(second.reason,"already_migrated");
  assert.equal(JSON.stringify(api.exportSyncData()),serialized);
  assert.ok(localStorage.getItem(api.legacyTrainingSetupMigrationKey(OWNER_A)));
  assert.equal(localStorage.getItem(api.legacyTrainingSetupMigrationKey(OWNER_B)),null);
});

test("rellena el perfil marcador incompleto creado antes de terminar el configurador",()=>{
  const {api}=loadProfileData({
    "gymos:onboardingProfile":"{}"
  });
  api.migrateDataModel({ownerId:OWNER_A,mark:false});
  assert.equal(api.getUserProfile().weeklyAvailability,null);
  assert.deepEqual(Array.from(api.getUserProfile().availableEquipment),[]);

  const completed={
    ...JSON.parse(legacyProfile),
    equipment:"full",
    injuryNotes:"Molestia lumbar",
    avoidExercises:"Burpees"
  };
  const result=api.migrateLegacyTrainingSetup({
    ownerId:OWNER_A,legacyProfile:completed,mark:false
  });

  assert.equal(result.migrated,true);
  assert.equal(api.getUserProfile().weeklyAvailability,4);
  assert.equal(api.getUserProfile().preferredSessionDurationMin,60);
  assert.equal(api.getUserProfile().trainingExperience,"intermediate");
  assert.equal(api.getUserProfile().trainingLocation,"gym");
  assert.ok(api.getUserProfile().availableEquipment.includes("dumbbells"));
  assert.deepEqual(Array.from(api.getUserProfile().injuries),["Molestia lumbar"]);
  assert.deepEqual(Array.from(api.getUserProfile().avoidedExercises),["Burpees"]);
});

test("la adaptación anterior no sobrescribe datos nuevos ya configurados",()=>{
  const {api}=loadProfileData({"gymos:onboardingProfile":legacyProfile});
  api.saveUserProfile({
    name:"Perfil nuevo",experience:"advanced",days:5,duration:75,
    location:"home",equipment:["bodyweight","mat"]
  },{mark:false});
  api.setCurrentLifeState({type:"general",startedAt:"2026-07-01"},{mark:false});
  api.startGoalCycle({
    primaryGoal:"strength_gain",secondaryGoals:["mobility"],
    startedAt:"2026-07-01"
  },{mark:false});
  api.startTrainingPhase({type:"strength",startedAt:"2026-07-01"},{mark:false});
  const before=JSON.stringify(api.exportSyncData());

  api.migrateLegacyTrainingSetup({ownerId:OWNER_A,mark:false});

  assert.equal(JSON.stringify(api.exportSyncData()),before);
});

test("las APIs públicas guardan objetivos, fase y disponibilidad sin tocar rutina ni historial",()=>{
  const {api,localStorage}=loadProfileData({
    "gymos:routine":legacyRoutine,
    "gymos:history":legacyHistory
  });
  const beforeRoutine=localStorage.getItem("gymos:routine");
  const beforeHistory=localStorage.getItem("gymos:history");
  const validation=api.validateGoalSelection("muscle_gain",["strength_gain","mobility"]);
  assert.equal(validation.valid,true);
  assert.equal(api.validateGoalSelection("muscle_gain",["strength_gain","mobility","endurance"]).valid,false);
  assert.equal(api.validateGoalSelection("muscle_gain",["muscle_gain"]).valid,false);

  const profile=api.saveUserProfile({
    experience:"intermediate",days:5,duration:60,location:"gym",
    equipment:["dumbbells","bench"]
  },{mark:false});
  const goal=api.startGoalCycle({
    primaryGoal:validation.primaryGoal,secondaryGoals:validation.secondaryGoals,
    startedAt:"2026-07-28"
  },{mark:false});
  const phase=api.startTrainingPhase({
    type:"muscle_gain",goalCycleId:goal.id,startedAt:"2026-07-28"
  },{mark:false});

  assert.equal(profile.weeklyAvailability,5);
  assert.equal(profile.preferredSessionDurationMin,60);
  assert.equal(profile.trainingLocation,"gym");
  assert.deepEqual(Array.from(profile.availableEquipment),["dumbbells","bench"]);
  assert.deepEqual(Array.from(goal.secondaryGoals),["strength_gain","mobility"]);
  assert.equal(phase.type,"muscle_gain");
  assert.equal(localStorage.getItem("gymos:routine"),beforeRoutine);
  assert.equal(localStorage.getItem("gymos:history"),beforeHistory);
});

test("el configurador conectado no genera ni activa una rutina al guardar el perfil",()=>{
  const appSource=fs.readFileSync(path.join(projectRoot,"app.js"),"utf8");
  const onboarding=appSource.slice(
    appSource.indexOf("function renderOnboarding()"),
    appSource.indexOf("function render(){")
  );
  assert.match(onboarding,/Guardar perfil/);
  assert.match(onboarding,/Guardar y crear propuesta/);
  assert.match(onboarding,/persistTrainingProfileData\(p\)/);
  assert.match(onboarding,/state\.screen="routineHub"/);
  assert.match(onboarding,/renderRoutineHub\(\)/);
  assert.doesNotMatch(onboarding,/saveRoutine\(|activateStoredRoutineProposal\(|persistRoutineProposal\(/);
  assert.match(appSource,/const goalCycle=window\.GymOSProfileData\?\.getActiveGoalCycle/);
  assert.match(appSource,/const trainingPhase=window\.GymOSProfileData\?\.getActiveTrainingPhase/);
  assert.match(appSource,/secondaryGoals:secondaryGoals\.filter\(goal=>goal!==primaryGoal\)/);
  assert.match(appSource,/activeGoalCycle:window\.GymOSProfileData\.getActiveGoalCycle\(\)/);
  assert.match(appSource,/activeTrainingPhase:window\.GymOSProfileData\.getActiveTrainingPhase\(\)/);
  assert.match(appSource,/function trainingProfileMissingStep/);
  assert.match(appSource,/Completar perfil para generar/);
  assert.match(appSource,/openTrainingProfileEditor\(\s*trainingProfileMissingStep\(preparation\.missing\)/);
  assert.match(appSource,/Principiante o retomando/);
  assert.match(appSource,/Otro lugar/);
});

console.log("All profile data tests passed.");
