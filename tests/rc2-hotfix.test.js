"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const root=path.resolve(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const appSource=read("app.js");
const stylesSource=read("styles.css");
const recoverySource=read("recovery-center.js");
const workerSource=read("service-worker.js");
const indexSource=read("index.html");
const schemaSource=read("database/supabase/schema.sql");
const syncRpcFunctionsSource=read("database/supabase/sync-rpc-v2-functions.sql");
const syncRpcLockdownSource=read("database/supabase/sync-rpc-v2-lockdown.sql");
const OWNER_A="11111111-1111-4111-8111-111111111111";

function functionSource(name,nextName){
  const start=appSource.indexOf(`function ${name}(`);
  const end=appSource.indexOf(`function ${nextName}(`,start+1);
  assert.ok(start>=0,`${name} existe`);
  assert.ok(end>start,`${nextName} delimita ${name}`);
  return appSource.slice(start,end);
}

function syncHarness({
  remote=null,readError=null,pending=false,online=true,recoverySync=null,
  checksum="same",localRevision=2,lastRemoteRevision=2,baseRevision=lastRemoteRevision,
  currentProtocol=true,writeError=null,writeConflict=false,sharedRemote=null,
  initialStatus="connected",initialIssue=null,initialLastError=null,
  conflictResolution="cancel",localPayload=null
}={}){
  const source=appSource.slice(
    appSource.indexOf("async function syncNow"),
    appSource.indexOf("async function autoSync")
  );
  const values=new Map([
    ["gymos:localRevision",String(localRevision)],
    ["gymos:lastRemoteRevision",String(lastRemoteRevision)],
    ["gymos:syncBaseRevision",String(baseRevision)],
    ...(currentProtocol?[["gymos:syncProtocolVersion","2"]]:[]),
    ...(pending?[["gymos:syncPending","1"]]:[])
  ]);
  const counters={reads:0,writes:0,writeAttempts:0,applies:0};
  const audits=[];
  let remoteState=sharedRemote?sharedRemote.state:(remote?JSON.parse(JSON.stringify(remote)):null);
  let currentLocalPayload=localPayload?JSON.parse(JSON.stringify(localPayload)):{stable:true};
  const currentRemoteState=()=>sharedRemote?sharedRemote.state:remoteState;
  const setRemoteState=value=>{
    if(sharedRemote) sharedRemote.state=value;
    remoteState=value;
  };
  const query={
    select(){return this;},
    eq(){return this;},
    async maybeSingle(){counters.reads+=1;return {data:currentRemoteState(),error:readError};}
  };
  const client={
    from(){return query;},
  };
  const context={
    navigator:{onLine:online},
    window:{
      GymOSRecovery:{syncWithSupabase:recoverySync||(()=>Promise.resolve())},
      GymOSProfessionalNutrition:{syncWithSupabase:()=>Promise.resolve()},
      GymOSWorkoutAnalysis:{syncWithSupabase:()=>Promise.resolve()}
    },
    state:{
      syncUser:{id:"owner-a"},syncInProgress:false,syncOperationId:0,
      syncIssue:initialIssue,syncStatus:initialStatus,
      syncDiagnosticLastError:initialLastError
    },
    localStorage:{
      getItem:key=>values.has(key)?values.get(key):null,
      setItem:(key,value)=>values.set(key,String(value)),
      removeItem:key=>values.delete(key)
    },
    getSupabaseClient:()=>client,
    isAppAuthenticated:()=>true,
    isSyncDebugRequested:()=>false,
    currentRoutineOwnerOrNull:()=>context.owner,
    assertActiveLocalOwner:owner=>{
      if(owner!==context.owner) throw new Error("owner_changed");
    },
    syncBodyMeasurementsWithSupabase:()=>Promise.resolve(),
    updateSyncIndicators:()=>{},
    addSyncAudit:(action,status,details={})=>audits.push({action,status,details}),
    finalizeSuccessfulSync:({revision,checksum,auditStatus,auditDetails={}})=>{
      context.setLocalRevision(revision);
      context.setLastRemoteRevision(revision);
      context.setSyncBaseRevision(revision);
      context.markSyncProtocolCurrent();
      values.delete("gymos:syncPending");
      if(checksum) values.set("gymos:lastSyncHash",String(checksum));
      values.set("gymos:lastSyncAt",new Date().toISOString());
      context.state.syncStatus="synced";
      context.state.syncIssue=null;
      context.state.syncDiagnosticLastError=null;
      audits.push({action:"sync",status:auditStatus,details:auditDetails});
    },
    buildSyncPayload:()=>JSON.parse(JSON.stringify(currentLocalPayload)),
    simpleChecksum:()=>checksum,
    functionalSyncChecksum:payload=>payload?.functionalVariant||"functional-same",
    syncChecksumComparisonMode:({
      remote,remoteRevision,localRevision,syncBaseRevision,hasPendingChanges,
      localChecksum,localFunctionalChecksum
    })=>{
      const remoteFunctional=remote?.payload?.functionalChecksum||null;
      if(remoteFunctional){
        return {
          mode:"functional_v1",
          remoteFunctionalChecksum:remoteFunctional,
          localFunctionalChecksum,
          equivalent:remoteFunctional===localFunctionalChecksum
        };
      }
      const legacyAck=Boolean(
        remote?.checksum&&!hasPendingChanges&&remoteRevision===localRevision&&
        syncBaseRevision===remoteRevision&&values.get("gymos:lastSyncHash")===remote.checksum
      );
      return {
        mode:legacyAck?"legacy_ack":"legacy_full",
        remoteFunctionalChecksum:null,
        localFunctionalChecksum,
        equivalent:legacyAck||remote?.checksum===localChecksum
      };
    },
    remoteFunctionalChecksum:row=>row?.payload?.functionalChecksum||row?.functionalChecksum||null,
    functionalSyncProjectionDiffSummary:(localPayload,remotePayload)=>{
      const localHash=context.functionalSyncChecksum(localPayload);
      const remoteHash=context.functionalSyncChecksum(remotePayload);
      const same=JSON.stringify(localPayload)===JSON.stringify(remotePayload);
      return {
        localHash,remoteHash,
        diffPaths:same?[]:[{
          path:"$",
          local:{exists:true,type:typeof localPayload,hash:localHash},
          remote:{exists:true,type:typeof remotePayload,hash:remoteHash}
        }],
        truncated:false
      };
    },
    syncAuditFingerprintSummary:details=>({
      appVersion:"test",
      branch:details?.condition||null,
      remoteRevision:details?.remoteRevision??null,
      localRevision:details?.localRevision??null,
      lastRemoteRevision:details?.lastRemoteRevision??null,
      syncBaseRevision:details?.syncBaseRevision??null,
      hasPendingChanges:details?.hasPendingChanges??null,
      checksumMode:details?.checksumComparison?.mode||null,
      functionalChecksum:{
        local:details?.checksumComparison?.localFunctionalChecksum||details?.localFunctionalChecksum||null,
        remote:details?.checksumComparison?.remoteFunctionalChecksum||details?.remote?.payload?.functionalChecksum||null,
        base:details?.baseFunctionalChecksum||values.get("gymos:lastSyncHash")||null
      },
      functionalProjectionDiff:details?.functionalProjectionDiff||null
    }),
    getLocalRevision:()=>Number(values.get("gymos:localRevision")||0),
    setLocalRevision:value=>values.set("gymos:localRevision",String(value)),
    getLastRemoteRevision:()=>Number(values.get("gymos:lastRemoteRevision")||0),
    setLastRemoteRevision:value=>values.set("gymos:lastRemoteRevision",String(value)),
    getSyncBaseRevision:()=>Number(values.get("gymos:syncBaseRevision")||0),
    setSyncBaseRevision:value=>values.set("gymos:syncBaseRevision",String(value)),
    markSyncProtocolCurrent:()=>values.set("gymos:syncProtocolVersion","2"),
    isLocalSyncProtocolCurrent:()=>Number(values.get("gymos:syncProtocolVersion")||0)>=2,
    isRemoteSyncProtocolCurrent:row=>Number(row?.payload?.syncProtocolVersion||0)>=2,
    chooseConflictResolution:async()=>conflictResolution,
    applySyncPayload:payload=>{
      counters.applies+=1;
      currentLocalPayload=JSON.parse(JSON.stringify(payload||{}));
    },
    buildSyncEnvelope:(base,candidate)=>{
      return {
        payload:{
          stable:true,syncProtocolVersion:2,syncParentRevision:base,
          syncFunctionalChecksumVersion:1,functionalChecksum:"functional-same"
        },
        revision:candidate,parentRevision:base,deviceId:"device",
        checksum:"same",functionalChecksum:"functional-same",updatedAt:"2026-07-29T10:00:00.000Z"
      };
    },
    writeSyncEnvelopeWithCas:async(_client,_userId,envelope,base,exists)=>{
      counters.writeAttempts+=1;
      if(writeError) throw writeError;
      if(writeConflict) throw Object.assign(new Error("sync_conflict"),{code:"sync_conflict"});
      if(exists){
        const current=currentRemoteState();
        if(!current||Number(current.revision)!==Number(base)){
          throw Object.assign(new Error("sync_conflict"),{code:"sync_conflict"});
        }
      }else if(Number(base)!==0){
        throw Object.assign(new Error("sync_conflict"),{code:"sync_conflict"});
      }
      counters.writes+=1;
      setRemoteState({
        revision:envelope.revision,
        checksum:envelope.checksum,
        device_id:envelope.deviceId,
        updated_at:envelope.updatedAt,
        payload:envelope.payload
      });
      return {revision:envelope.revision};
    },
    setSyncConflictState:(kind,details={})=>{
      context.state.syncStatus="conflict";
      context.state.syncIssue={kind,retryable:false,details};
      return {direction:"conflict",kind,details};
    },
    classifySyncError:error=>{
      if(!online) return {status:"offline",kind:"offline",retryable:true};
      if(error?.status===401) return {status:"session_expired",kind:"session",retryable:true};
      if(error?.status===403) return {status:"permission_denied",kind:"permission",retryable:true};
      return {status:"recoverable_error",kind:"network",retryable:true};
    },
    owner:"owner-a",
    console,
    Date
  };
  vm.createContext(context);
  vm.runInContext(`${source}; runSync=syncNow;`,context);
  return {context,values,counters,audits,get remote(){return sharedRemote?sharedRemote.state:remoteState;}};
}

function casHarness({rpcResponse=null,rpcError=null}={}){
  const source=appSource.slice(
    appSource.indexOf("function syncConflictError"),
    appSource.indexOf("async function syncNow")
  );
  const calls=[];
  const client={
    async rpc(name,args){
      calls.push(["rpc",name,args]);
      return rpcResponse||{data:[{success:true,conflict:false,revision:913,checksum:"same"}],error:rpcError};
    }
  };
  const context={client,calls};
  vm.createContext(context);
  vm.runInContext(`${source}; this.write=writeSyncEnvelopeWithCas;`,context);
  return context;
}

function recoveryHarness({
  remote={
    revision:915,checksum:"a585090d",device_id:"134d82b5-0770-4779-a0d6-a79f99804c44",
    updated_at:"2026-08-15T10:00:00.000Z",
    payload:{
      version:"3.7.0",
      source:"remote-legacy-mobile",
      routineId:"routine-0916bea3-2e64-446b-8219-529102300960",
      selectedSessionId:"session-7846de07-5290-4758-88d0-43d54e75885e"
    }
  },
  localOverrides={},writeError=null,writeResult={revision:916}
}={}){
  const source=appSource.slice(
    appSource.indexOf("const SYNC_RECOVERY_EXPECTED_REMOTE"),
    appSource.indexOf("async function syncNow")
  );
  const values=new Map([
    ["gymos:deviceId","pc-device"],
    ["gymos:localRevision","419"],
    ["gymos:lastRemoteRevision","419"],
    ["gymos:syncBaseRevision","419"]
  ]);
  const writes=[];
  const downloads=[];
  const writeCalls=[];
  let lastDownloadPayloadText="";
  const localPayload={
    source:"local-pc",
    canonicalRoutine:{routineId:"routine-02488c9c-d38e-4b59-8814-f7e0bcbd7d5e"},
    selectedSessionId:"roadmap-2026-08-a",
    history:["local-history"]
  };
  const client={
    from(){return {
      select(){return this;},
      eq(){return this;},
      async maybeSingle(){return {data:remote,error:null};}
    };}
  };
  const context={
    SYNC_PROTOCOL_VERSION:2,
    SYNC_FUNCTIONAL_CHECKSUM_VERSION:1,
    DEVICE_ID_KEY:"gymos:deviceId",
    state:{syncUser:{id:"user-a"},syncStatus:"conflict",syncIssue:{kind:"legacy_sync_conflict"}},
    localStorage:{
      getItem:key=>values.has(key)?values.get(key):null,
      setItem:(key,value)=>{writes.push(["setItem",key,String(value)]);values.set(key,String(value));},
      removeItem:key=>{writes.push(["removeItem",key]);values.delete(key);}
    },
    getSupabaseClient:()=>client,
    isAppAuthenticated:()=>true,
    localSyncDiagnosticSnapshot:()=>({
      ownerId:"user-a",
      deviceId:values.get("gymos:deviceId")||null,
      localRevision:Number(values.get("gymos:localRevision")||0),
      lastRemoteRevision:Number(values.get("gymos:lastRemoteRevision")||0),
      syncBaseRevision:Number(values.get("gymos:syncBaseRevision")||0),
      syncPending:values.get("gymos:syncPending")==="1",
      routineId:"routine-02488c9c-d38e-4b59-8814-f7e0bcbd7d5e",
      selectedSessionId:"roadmap-2026-08-a",
      routineHash:"223f0a1a",
      historyHash:"c2248975",
      ...localOverrides
    }),
    buildSyncPayload:()=>JSON.parse(JSON.stringify(localPayload)),
    simpleChecksum:payload=>payload?.source==="local-pc"?"pc-checksum":"other-checksum",
    functionalSyncChecksum:payload=>payload?.source==="local-pc"?"pc-functional-checksum":"other-functional-checksum",
    writeSyncEnvelopeWithCas:async(_client,userId,envelope,base,exists,expectedChecksum)=>{
      writeCalls.push({
        userId,envelope,base,exists,expectedChecksum,
        localRevisionBefore:values.get("gymos:localRevision")
      });
      if(writeError) throw writeError;
      if(writeResult?.success===false) throw Object.assign(new Error("sync_conflict"),{code:"sync_conflict"});
      return writeResult||{revision:envelope.revision};
    },
    setLocalRevision:value=>{writes.push(["setItem","gymos:localRevision",String(value)]);values.set("gymos:localRevision",String(value));},
    setLastRemoteRevision:value=>{writes.push(["setItem","gymos:lastRemoteRevision",String(value)]);values.set("gymos:lastRemoteRevision",String(value));},
    setSyncBaseRevision:value=>{writes.push(["setItem","gymos:syncBaseRevision",String(value)]);values.set("gymos:syncBaseRevision",String(value));},
    markSyncProtocolCurrent:()=>{writes.push(["setItem","gymos:syncProtocolVersion","2"]);values.set("gymos:syncProtocolVersion","2");},
    updateSyncIndicators:()=>{},
    Blob:class {constructor(parts,options){lastDownloadPayloadText=String(parts?.[0]||"null");this.options=options;}},
    URL:{createObjectURL:()=>"blob:gymos-recovery",revokeObjectURL(){}},
    document:{
      body:{appendChild(){}},
      createElement:()=>({
        href:"",download:"",style:{},
        click(){downloads.push({payload:JSON.parse(lastDownloadPayloadText),fileName:this.download});},
        remove(){}
      })
    },
    setTimeout:callback=>callback(),
    Date
  };
  vm.createContext(context);
  vm.runInContext(`${source}; this.promote=promoteLocalDeviceAsCanonicalSyncHead; this.backup=downloadRemoteSyncRecoveryBackup;`,context);
  return {context,values,writes,downloads,writeCalls,localPayload};
}

function adoptionHarness({
  remoteOverrides={},localOverrides={},applyError=null
}={}){
  const source=appSource.slice(
    appSource.indexOf("const SYNC_RECOVERY_EXPECTED_REMOTE"),
    appSource.indexOf("async function syncNow")
  );
  const defaultCanonicalRoutine={
    schemaVersion:"4.2",
    routineId:"routine-02488c9c-d38e-4b59-8814-f7e0bcbd7d5e",
    revision:12,
    sessions:[{
      sessionId:"roadmap-2026-08-a",
      legacySessionKey:"A",
      order:1,
      label:"A",
      name:"Sesión A",
      focus:"full_body",
      estimatedDurationMinutes:45,
      exercises:[]
    }]
  };
  const defaultRemotePayload={
    source:"remote-pc",
    syncProtocolVersion:2,
    routine:defaultCanonicalRoutine,
    canonicalRoutine:defaultCanonicalRoutine,
    selectedSessionId:"roadmap-2026-08-a",
    history:["remote-history"]
  };
  const remote={
    revision:916,
    checksum:"759d936c",
    device_id:"pc-device",
    updated_at:"2026-08-15T10:00:00.000Z",
    payload:defaultRemotePayload,
    ...remoteOverrides
  };
  if(remoteOverrides.payload){
    remote.payload={...defaultRemotePayload,...remoteOverrides.payload};
  }
  const values=new Map([
    ["gymos:deviceId","134d82b5-0770-4779-a0d6-a79f99804c44"],
    ["gymos:localRevision","915"],
    ["gymos:lastRemoteRevision","915"],
    ["gymos:syncBaseRevision","915"],
    ["gymos:syncProtocolVersion","2"],
    ["gymos:syncPending","1"],
    ["gymos:routine:canonical",JSON.stringify({routineId:"routine-0916bea3-2e64-446b-8219-529102300960"})],
    ["gymos:selectedSessionId","session-7846de07-5290-4758-88d0-43d54e75885e"],
    ["gymos:history",JSON.stringify(["local-history"])],
    ["unrelated:key","untouched"]
  ]);
  for(const [key,value] of Object.entries(localOverrides.storage||{})){
    if(value===null) values.delete(key);
    else values.set(key,String(value));
  }
  const writes=[];
  const remoteWrites=[];
  const counters={apply:0,syncNow:0,autoSync:0,cas:0,rpc:0};
  const applyOptions=[];
  const currentSnapshot=()=>({
    deviceId:values.get("gymos:deviceId")||null,
    localRevision:Number(values.get("gymos:localRevision")||0),
    lastRemoteRevision:Number(values.get("gymos:lastRemoteRevision")||0),
    syncBaseRevision:Number(values.get("gymos:syncBaseRevision")||0),
    syncPending:values.get("gymos:syncPending")==="1",
    routineId:JSON.parse(values.get("gymos:routine:canonical")||"{}").routineId||null,
    selectedSessionId:values.get("gymos:selectedSessionId")||null,
    routineHash:"mobile-routine",
    historyHash:"mobile-history",
    ...localOverrides.snapshot
  });
  const query={
    select(){return this;},
    eq(){return this;},
    update(){remoteWrites.push("update");return this;},
    insert(){remoteWrites.push("insert");return this;},
    upsert(){remoteWrites.push("upsert");return this;},
    async maybeSingle(){return {data:remote,error:null};}
  };
  const client={
    from(){return query;},
    rpc(){counters.rpc+=1;return Promise.resolve({data:null,error:null});}
  };
  const context={
    SYNC_PROTOCOL_VERSION:2,
    DEVICE_ID_KEY:"gymos:deviceId",
    state:{syncUser:{id:"user-a"},syncStatus:"conflict",syncIssue:{kind:"mobile_divergent"}},
    localStorage:{
      get length(){return values.size;},
      key:index=>Array.from(values.keys())[index]||null,
      getItem:key=>values.has(key)?values.get(key):null,
      setItem:(key,value)=>{writes.push(["setItem",key,String(value)]);values.set(key,String(value));},
      removeItem:key=>{writes.push(["removeItem",key]);values.delete(key);}
    },
    getSupabaseClient:()=>client,
    isAppAuthenticated:()=>true,
    localSyncDiagnosticSnapshot:currentSnapshot,
    remoteSyncDiagnosticFromRow:row=>({
      revision:Number(row?.revision||0),
      checksum:row?.checksum||null,
      routineId:row?.payload?.canonicalRoutine?.routineId||null,
      selectedSessionId:row?.payload?.selectedSessionId||null
    }),
    restoreStorageValue:(key,value)=>{
      writes.push([value===null?"removeItem":"setItem",key,value===null?undefined:String(value)]);
      if(value===null) values.delete(key);
      else values.set(key,String(value));
    },
    applySyncPayload:(payload,options={})=>{
      counters.apply+=1;
      applyOptions.push(options);
      if(!options.recoveryCanonicalReplacement){
        const error=new Error("canonical_routine_id_conflict");
        error.code="canonical_routine_id_conflict";
        throw error;
      }
      if(payload.canonicalRoutine?.invalid){
        const error=new Error("invalid_remote_canonical");
        error.code="invalid_remote_canonical";
        throw error;
      }
      if(payload.canonicalDrafts?.invalid){
        const error=new Error("invalid_remote_session_state");
        error.code="invalid_remote_session_state";
        throw error;
      }
      values.set("gymos:routine:canonical",JSON.stringify(payload.canonicalRoutine));
      values.set("gymos:selectedSessionId",payload.selectedSessionId);
      values.set("gymos:history",JSON.stringify(payload.history||[]));
      values.set("gymos:deviceId",remote.device_id);
      values.set("gymos:partialDuringApply","1");
      if(applyError) throw applyError;
      values.delete("gymos:partialDuringApply");
    },
    writeSyncEnvelopeWithCas:()=>{counters.cas+=1;throw new Error("unexpected CAS");},
    setLocalRevision:value=>{writes.push(["setItem","gymos:localRevision",String(value)]);values.set("gymos:localRevision",String(value));},
    setLastRemoteRevision:value=>{writes.push(["setItem","gymos:lastRemoteRevision",String(value)]);values.set("gymos:lastRemoteRevision",String(value));},
    setSyncBaseRevision:value=>{writes.push(["setItem","gymos:syncBaseRevision",String(value)]);values.set("gymos:syncBaseRevision",String(value));},
    markSyncProtocolCurrent:()=>{writes.push(["setItem","gymos:syncProtocolVersion","2"]);values.set("gymos:syncProtocolVersion","2");},
    updateSyncIndicators:()=>{},
    syncNow:()=>{counters.syncNow+=1;},
    autoSync:()=>{counters.autoSync+=1;},
    Date
  };
  vm.createContext(context);
  vm.runInContext(`${source}; this.adopt=adoptCanonicalRemoteSyncHeadOnThisDevice;`,context);
  return {context,values,writes,remoteWrites,counters,applyOptions,snapshot:()=>new Map(values)};
}

function sortedEntries(map){
  return [...map.entries()].sort(([left],[right])=>left.localeCompare(right));
}

test("RC2 Ajustes usa exclusivamente la API pública de Recovery Center",()=>{
  const settings=appSource.slice(
    appSource.indexOf("function renderSettings("),
    appSource.indexOf("function exportData(")
  );
  assert.match(settings,/bindScreen\("openRecoveryCenter","recovery",\(\)=>window\.GymOSRecovery\.renderRecoveryCenter\(\)\)/);
  assert.doesNotMatch(settings,/(?<!\.)\brenderRecoveryCenter\(/);
  assert.match(recoverySource,/window\.GymOSRecovery=Object\.freeze\(\{/);
  assert.match(recoverySource,/\n\s*renderRecoveryCenter,/);
});

test("RC2 el render autoritativo abre Ajustes y Recovery mediante destinos distintos",()=>{
  const render=functionSource("render","homeGreeting");
  assert.match(render,/state\.screen==="recovery"\) window\.GymOSRecovery\.renderRecoveryCenter\(\)/);
  assert.match(render,/else renderSettings\(\)/);
});

test("RC2 los fallos de render muestran un mensaje comprensible sin detalles JavaScript",()=>{
  const navigation=functionSource("navigateToScreen","bindNav");
  assert.match(navigation,/No se pudo abrir esta sección\. Vuelve a intentarlo\./);
  assert.doesNotMatch(navigation,/error\.message/);
  assert.doesNotMatch(navigation,/ReferenceError|renderRecoveryCenter is not defined/);
});

test("RC2 clasifica estados de sincronización sin exponer detalles privados",()=>{
  const source=functionSource("classifySyncError","syncStatusDescription");
  const context={navigator:{onLine:true}};
  vm.createContext(context);
  vm.runInContext(`${source}; classify=classifySyncError;`,context);
  assert.equal(context.classify({}).status,"recoverable_error");
  assert.equal(context.classify({code:"session_not_found"}).status,"session_expired");
  assert.equal(context.classify({code:"42501"}).status,"permission_denied");
  assert.equal(context.classify({code:"sync_conflict"}).status,"conflict");
  context.navigator.onLine=false;
  assert.equal(context.classify({}).status,"offline");
});

test("RC2 sincroniza, resuelve no-op y limpia pendientes solo tras éxito",()=>{
  const sync=appSource.slice(
    appSource.indexOf("async function syncNow"),
    appSource.indexOf("async function autoSync")
  );
  assert.match(sync,/if\(state\.syncInProgress\)\{[\s\S]*addSyncAudit\("sync_trace","busy",\{branch:"busy"\}\);[\s\S]*return \{direction:"busy"\}/);
  assert.match(sync,/remote&&!hasPendingChanges&&!options\.forceUpload&&remoteRevision===localRevision&&checksumComparison\.equivalent/);
  assert.match(sync,/return \{direction:"none",revision:remoteRevision\}/);
  assert.ok((sync.match(/localStorage\.removeItem\("gymos:syncPending"\)/g)||[]).length>=2);
  assert.match(sync,/localStorage\.setItem\("gymos:lastSyncHash",envelope\.checksum\)/);
  assert.match(sync,/writeSyncEnvelopeWithCas\(client,userId,envelope,baseRevision,Boolean\(remote\),remote\?\.checksum\|\|null\)/);
  assert.doesNotMatch(sync,/\.upsert\(/);
  assert.match(sync,/const ownerId=currentRoutineOwnerOrNull\(\)/);
  assert.match(sync,/const operationId=\+\+state\.syncOperationId/);
  assert.ok((sync.match(/assertOwner\(\)/g)||[]).length>=7);
  assert.match(sync,/finally\{\s*if\(state\.syncOperationId===operationId\) state\.syncInProgress=false/);
});

test("RC2 sincronización sin cambios no escribe ni incrementa revisión",async()=>{
  const harness=syncHarness({
    remote:{revision:2,checksum:"same",payload:{stable:true}}
  });
  const result=await harness.context.runSync();
  assert.equal(result.direction,"none");
  assert.equal(harness.counters.writes,0);
  assert.equal(harness.values.get("gymos:localRevision"),"2");
  assert.equal(harness.context.state.syncStatus,"synced");
});

test("RC2 cambios pendientes se suben y solo entonces se limpian",async()=>{
  const harness=syncHarness({
    remote:{revision:2,checksum:"same",payload:{stable:true}},
    pending:true
  });
  const result=await harness.context.runSync();
  assert.equal(result.direction,"upload");
  assert.equal(harness.counters.writes,1);
  assert.equal(harness.values.has("gymos:syncPending"),false);
  assert.equal(harness.values.get("gymos:lastSyncHash"),"same");
});

test("RC2 un checksum local distinto con cambios pendientes es una subida, no un falso conflicto",async()=>{
  const harness=syncHarness({
    remote:{revision:2,checksum:"remote-old",payload:{stable:false}},
    pending:true,
    checksum:"local-new"
  });
  const result=await harness.context.runSync();
  assert.equal(result.direction,"upload");
  assert.equal(harness.counters.applies,0);
  assert.equal(harness.counters.writes,1);
});

test("RC2 una revisión remota nueva con cambios locales se resuelve como conflicto",async()=>{
  const harness=syncHarness({
    remote:{revision:3,checksum:"remote-new",payload:{stable:false}},
    pending:true,
    checksum:"local-new"
  });
  const result=await harness.context.runSync();
  assert.equal(result.direction,"conflict");
  assert.equal(harness.counters.applies,0);
  assert.equal(harness.counters.writes,0);
  assert.equal(harness.values.get("gymos:syncPending"),"1");
});

test("RC2 errores de red, sesión y permisos conservan cambios pendientes",async()=>{
  for(const [status,expected] of [[0,"recoverable_error"],[401,"session_expired"],[403,"permission_denied"]]){
    const harness=syncHarness({
      readError:{status,code:`error-${status}`},pending:true
    });
    await assert.rejects(()=>harness.context.runSync());
    assert.equal(harness.context.state.syncStatus,expected);
    assert.equal(harness.values.get("gymos:syncPending"),"1");
    assert.equal(harness.counters.writes,0);
  }
});

test("RC2 una segunda sincronización concurrente queda bloqueada",async()=>{
  let release;
  const wait=new Promise(resolve=>{release=resolve;});
  const harness=syncHarness({
    remote:{revision:2,checksum:"same",payload:{stable:true}},
    recoverySync:()=>wait
  });
  const first=harness.context.runSync();
  const second=await harness.context.runSync();
  assert.equal(second.direction,"busy");
  release();
  assert.equal((await first).direction,"none");
  assert.equal(harness.counters.reads,1);
});

test("RC2 descarta un resultado si cambia el propietario durante la petición",async()=>{
  let release;
  const wait=new Promise(resolve=>{release=resolve;});
  const harness=syncHarness({
    remote:{revision:2,checksum:"same",payload:{stable:true}},
    recoverySync:()=>wait
  });
  const running=harness.context.runSync();
  harness.context.owner="owner-b";
  harness.context.state.syncUser={id:"owner-b"};
  harness.context.state.syncOperationId+=1;
  release();
  await assert.rejects(running,/owner_changed/);
  assert.equal(harness.counters.reads,0);
  assert.notEqual(harness.context.state.syncStatus,"synced");
});

test("sync v2 A: base local igual a remoto permite upload CAS y avanza remoto a 913",async()=>{
  const harness=syncHarness({
    remote:{revision:912,checksum:"old",payload:{stable:false,syncProtocolVersion:2}},
    localRevision:912,lastRemoteRevision:912,baseRevision:912,pending:true
  });
  const result=await harness.context.runSync();
  assert.equal(result.direction,"upload");
  assert.equal(harness.remote.revision,913);
  assert.equal(harness.values.get("gymos:localRevision"),"913");
});

test("sync v2 CAS cliente usa RPC server-side sin aceptar user_id como autoridad",async()=>{
  const harness=casHarness();
  const result=await harness.write(
    harness.client,"user-a",
    {payload:{},revision:913,deviceId:"device",checksum:"same",updatedAt:"2026-08-15T10:00:00.000Z"},
    912,true,"old"
  );
  assert.equal(result.revision,913);
  const rpcCall=harness.calls.find(call=>call[0]==="rpc");
  assert.equal(rpcCall[1],"gymos_sync_compare_and_swap");
  assert.deepEqual(JSON.parse(JSON.stringify(rpcCall[2])),{
    expected_revision:912,
    expected_checksum:"old",
    new_revision:913,
    new_device_id:"device",
    new_checksum:"same",
    new_payload:{}
  });
  assert.equal(JSON.stringify(rpcCall[2]).includes("user-a"),false);
});

test("sync v2 CAS convierte success false de RPC en sync_conflict",async()=>{
  const harness=casHarness({rpcResponse:{data:[{success:false,conflict:true,revision:912,checksum:"old"}],error:null}});
  await assert.rejects(
    ()=>harness.write(
      harness.client,"user-a",
      {payload:{},revision:913,deviceId:"device",checksum:"same",updatedAt:"2026-08-15T10:00:00.000Z"},
      912,true,"old"
    ),
    error=>error.code==="sync_conflict"
  );
});

test("sync v2 CAS requiere checksum esperado para actualizar una fila existente",async()=>{
  const harness=casHarness();
  await assert.rejects(
    ()=>harness.write(
      harness.client,"user-a",
      {payload:{},revision:913,deviceId:"device",checksum:"same",updatedAt:"2026-08-15T10:00:00.000Z"},
      912,true
    ),
    error=>error.code==="sync_conflict"
  );
});

test("sync v2 CAS clasifica colisión de creación inicial RPC como conflicto",async()=>{
  const harness=casHarness({rpcError:{code:"23505",status:409}});
  await assert.rejects(
    ()=>harness.write(
      harness.client,"user-a",
      {payload:{},revision:1,deviceId:"device",checksum:"same",updatedAt:"2026-08-15T10:00:00.000Z"},
      0,false
    ),
    error=>error.code==="sync_conflict"
  );
});

test("sync server-side fase A contiene solo funciones y grants de ejecución",()=>{
  assert.match(syncRpcFunctionsSource,/create or replace function public\.gymos_sync_compare_and_swap/);
  assert.match(syncRpcFunctionsSource,/create or replace function public\.gymos_sync_delete_own/);
  assert.match(syncRpcFunctionsSource,/revoke all on function public\.gymos_sync_compare_and_swap\(bigint,text,bigint,text,text,jsonb\) from public/);
  assert.match(syncRpcFunctionsSource,/revoke all on function public\.gymos_sync_compare_and_swap\(bigint,text,bigint,text,text,jsonb\) from anon/);
  assert.match(syncRpcFunctionsSource,/grant execute on function public\.gymos_sync_compare_and_swap\(bigint,text,bigint,text,text,jsonb\) to authenticated/);
  assert.doesNotMatch(syncRpcFunctionsSource,/drop policy if exists "Users can (?:insert|update|delete) their own GymOS data"/i);
  assert.doesNotMatch(syncRpcFunctionsSource,/revoke insert, update, delete on table public\.gymos_sync/i);
});

test("sync server-side fase B bloquea legacy directo y mantiene SELECT",()=>{
  assert.match(syncRpcLockdownSource,/drop policy if exists "Users can insert their own GymOS data" on public\.gymos_sync/);
  assert.match(syncRpcLockdownSource,/drop policy if exists "Users can update their own GymOS data" on public\.gymos_sync/);
  assert.match(syncRpcLockdownSource,/drop policy if exists "Users can delete their own GymOS data" on public\.gymos_sync/);
  assert.doesNotMatch(syncRpcLockdownSource,/create policy "Users can insert their own GymOS data"[\s\S]*?on public\.gymos_sync for insert/);
  assert.doesNotMatch(syncRpcLockdownSource,/create policy "Users can update their own GymOS data"[\s\S]*?on public\.gymos_sync for update/);
  assert.match(syncRpcLockdownSource,/revoke insert, update, delete on table public\.gymos_sync from anon, authenticated/);
  assert.match(syncRpcLockdownSource,/create policy "Users can read their own GymOS data"[\s\S]*?on public\.gymos_sync for select/);
  assert.match(syncRpcLockdownSource,/grant select on table public\.gymos_sync to authenticated/);
  assert.doesNotMatch(syncRpcLockdownSource,/create or replace function public\.gymos_sync_/);
});

test("sync server-side RPC CAS usa SECURITY DEFINER endurecido",()=>{
  assert.match(syncRpcFunctionsSource,/security definer\s+set search_path = pg_catalog/);
  assert.match(syncRpcFunctionsSource,/current_user_id uuid := auth\.uid\(\)/);
  assert.match(syncRpcFunctionsSource,/if current_user_id is null then\s+raise exception 'not_authenticated'/);
  assert.match(syncRpcFunctionsSource,/where sync_row\.user_id = current_user_id\s+and sync_row\.revision = expected_revision\s+and sync_row\.checksum = expected_checksum/);
  assert.match(syncRpcFunctionsSource,/return query select true, false, written_revision, written_checksum/);
  assert.match(syncRpcFunctionsSource,/return query select false, true, written_revision, written_checksum/);
  assert.match(syncRpcFunctionsSource,/from public\.gymos_sync as sync_row/);
  assert.match(syncRpcFunctionsSource,/update public\.gymos_sync as sync_row/);
  assert.match(syncRpcFunctionsSource,/insert into public\.gymos_sync as sync_row/);
  assert.match(syncRpcFunctionsSource,/pg_catalog\.now\(\)/);
  const signature=syncRpcFunctionsSource.slice(
    syncRpcFunctionsSource.indexOf("create or replace function public.gymos_sync_compare_and_swap"),
    syncRpcFunctionsSource.indexOf(")",syncRpcFunctionsSource.indexOf("create or replace function public.gymos_sync_compare_and_swap"))+1
  );
  assert.doesNotMatch(signature,/\buser_id\b/);
});

test("sync server-side RPC rechaza revisiones no consecutivas",()=>{
  const accepts=(expected,newRevision)=>newRevision===expected+1;
  assert.equal(accepts(915,916),true);
  assert.equal(accepts(915,917),false);
  assert.equal(accepts(0,1),true);
  assert.equal(accepts(0,10),false);
  assert.match(syncRpcFunctionsSource,/new_revision is null or new_revision <> expected_revision \+ 1/);
  assert.match(syncRpcFunctionsSource,/if expected_revision = 0 then[\s\S]*?new_revision <> 1 or expected_checksum is not null[\s\S]*?sync_protocol_error/);
});

test("sync server-side: auth.uid distinto no puede tocar fila ajena y RPC sigue tras lockdown",()=>{
  assert.match(syncRpcFunctionsSource,/where sync_row\.user_id = current_user_id/);
  assert.match(syncRpcFunctionsSource,/delete from public\.gymos_sync as sync_row\s+where sync_row\.user_id = current_user_id/);
  assert.match(syncRpcLockdownSource,/revoke insert, update, delete on table public\.gymos_sync from anon, authenticated/);
  assert.match(syncRpcFunctionsSource,/grant execute on function public\.gymos_sync_compare_and_swap\(bigint,text,bigint,text,text,jsonb\) to authenticated/);
});

test("sync server-side: dos RPC concurrentes desde la misma base solo pueden tener un ganador",()=>{
  assert.match(syncRpcFunctionsSource,/update public\.gymos_sync[\s\S]*?where sync_row\.user_id = current_user_id\s+and sync_row\.revision = expected_revision\s+and sync_row\.checksum = expected_checksum[\s\S]*?returning sync_row\.revision/);
  assert.match(syncRpcFunctionsSource,/insert into public\.gymos_sync[\s\S]*?on conflict \(user_id\) do nothing[\s\S]*?returning sync_row\.revision/);
});

test("sync v2 B: pending con remoto cambiado desde la base queda en conflicto y no sube",async()=>{
  const harness=syncHarness({
    remote:{revision:913,checksum:"remote-new",payload:{stable:false,syncProtocolVersion:2}},
    localRevision:913,lastRemoteRevision:912,baseRevision:912,pending:true
  });
  const result=await harness.context.runSync();
  assert.equal(result.direction,"conflict");
  assert.equal(harness.counters.writeAttempts,0);
  assert.equal(harness.values.get("gymos:syncPending"),"1");
});

test("sync v2 C: dos dispositivos desde la misma base solo escriben una revision 913",async()=>{
  const sharedRemote={state:{revision:912,checksum:"old",payload:{stable:false,syncProtocolVersion:2}}};
  const first=syncHarness({
    sharedRemote,localRevision:912,lastRemoteRevision:912,baseRevision:912,pending:true
  });
  const second=syncHarness({
    sharedRemote,localRevision:912,lastRemoteRevision:912,baseRevision:912,pending:true
  });
  assert.equal((await first.context.runSync()).direction,"upload");
  assert.equal((await second.context.runSync()).direction,"conflict");
  assert.equal(first.counters.writes,1);
  assert.equal(second.counters.writes,0);
  assert.equal(sharedRemote.state.revision,913);
});

test("sync v2 D: un upload fallido no incrementa localRevision",async()=>{
  const harness=syncHarness({
    remote:{revision:912,checksum:"old",payload:{stable:false,syncProtocolVersion:2}},
    localRevision:912,lastRemoteRevision:912,baseRevision:912,pending:true,
    writeError:{status:500,code:"network_error"}
  });
  await assert.rejects(()=>harness.context.runSync());
  assert.equal(harness.values.get("gymos:localRevision"),"912");
});

test("sync v2 E: diez uploads fallidos no incrementan localRevision",async()=>{
  const harness=syncHarness({
    remote:{revision:912,checksum:"old",payload:{stable:false,syncProtocolVersion:2}},
    localRevision:912,lastRemoteRevision:912,baseRevision:912,pending:true,
    writeError:{status:500,code:"network_error"}
  });
  for(let index=0;index<10;index+=1){
    await assert.rejects(()=>harness.context.runSync());
  }
  assert.equal(harness.values.get("gymos:localRevision"),"912");
});

test("sync v2 F: misma revision con checksum distinto es conflicto",async()=>{
  const harness=syncHarness({
    remote:{revision:912,checksum:"remote-different",payload:{stable:false,syncProtocolVersion:2}},
    localRevision:912,lastRemoteRevision:912,baseRevision:912,pending:false,
    checksum:"local-different"
  });
  const result=await harness.context.runSync();
  assert.equal(result.direction,"conflict");
  assert.equal(harness.counters.writes,0);
});

test("sync v2 G: mismo deviceId no evita conflicto si la base diverge",async()=>{
  const harness=syncHarness({
    remote:{revision:913,checksum:"remote-new",device_id:"device",payload:{stable:false,syncProtocolVersion:2}},
    localRevision:913,lastRemoteRevision:912,baseRevision:912,pending:true
  });
  const result=await harness.context.runSync();
  assert.equal(result.direction,"conflict");
  assert.equal(harness.counters.writes,0);
});

test("sync v2 H: estado legacy divergente no descarga ni sube automaticamente",async()=>{
  const harness=syncHarness({
    remote:{revision:912,checksum:"remote-legacy",payload:{stable:false}},
    localRevision:419,lastRemoteRevision:419,baseRevision:419,pending:false,
    currentProtocol:false,checksum:"local-correct"
  });
  const result=await harness.context.runSync();
  assert.equal(result.direction,"conflict");
  assert.equal(result.kind,"legacy_sync_conflict");
  assert.equal(harness.counters.applies,0);
  assert.equal(harness.counters.writes,0);
});

test("sync v2 I: download confirmado actualiza las tres revisiones",async()=>{
  const harness=syncHarness({
    remote:{revision:913,checksum:"same",payload:{stable:true,syncProtocolVersion:2}},
    localRevision:912,lastRemoteRevision:912,baseRevision:912,pending:false
  });
  const result=await harness.context.runSync();
  assert.equal(result.direction,"download");
  assert.equal(harness.counters.applies,1);
  assert.equal(harness.values.get("gymos:localRevision"),"913");
  assert.equal(harness.values.get("gymos:lastRemoteRevision"),"913");
  assert.equal(harness.values.get("gymos:syncBaseRevision"),"913");
});

test("sync v2 J: upload confirmado actualiza las tres revisiones y limpia pending",async()=>{
  const harness=syncHarness({
    remote:{revision:912,checksum:"old",payload:{stable:false,syncProtocolVersion:2}},
    localRevision:912,lastRemoteRevision:912,baseRevision:912,pending:true
  });
  const result=await harness.context.runSync();
  assert.equal(result.direction,"upload");
  assert.equal(harness.values.get("gymos:localRevision"),"913");
  assert.equal(harness.values.get("gymos:lastRemoteRevision"),"913");
  assert.equal(harness.values.get("gymos:syncBaseRevision"),"913");
  assert.equal(harness.values.has("gymos:syncPending"),false);
});

test("recovery: backup remoto descarga la fila completa sin escribir localmente",async()=>{
  const harness=recoveryHarness();
  const row=await harness.context.backup();
  assert.equal(row.revision,915);
  assert.equal(harness.downloads.length,1);
  assert.match(harness.downloads[0].fileName,/^gymos-remote-sync-backup-/);
  assert.equal(harness.downloads[0].payload.row.payload.source,"remote-legacy-mobile");
  assert.deepEqual(harness.writes,[]);
  assert.equal(harness.writeCalls.length,0);
});

test("recovery: aborta si remote revision no es 915",async()=>{
  const harness=recoveryHarness({
    remote:{revision:916,checksum:"a585090d",payload:{source:"remote"}}
  });
  await assert.rejects(()=>harness.context.promote(),error=>error.code==="recovery_remote_changed");
  assert.equal(harness.writeCalls.length,0);
  assert.deepEqual(harness.writes,[]);
});

test("recovery: aborta si remote checksum no es el esperado",async()=>{
  const harness=recoveryHarness({
    remote:{revision:915,checksum:"changed",payload:{source:"remote"}}
  });
  await assert.rejects(()=>harness.context.promote(),error=>error.code==="recovery_remote_changed");
  assert.equal(harness.writeCalls.length,0);
  assert.deepEqual(harness.writes,[]);
});

test("recovery: aborta si cambia routineHash local",async()=>{
  const harness=recoveryHarness({localOverrides:{routineHash:"different"}});
  await assert.rejects(()=>harness.context.promote(),error=>error.code==="recovery_local_changed");
  assert.equal(harness.writeCalls.length,0);
  assert.deepEqual(harness.writes,[]);
});

test("recovery: aborta si cambia historyHash local",async()=>{
  const harness=recoveryHarness({localOverrides:{historyHash:"different"}});
  await assert.rejects(()=>harness.context.promote(),error=>error.code==="recovery_local_changed");
  assert.equal(harness.writeCalls.length,0);
  assert.deepEqual(harness.writes,[]);
});

test("recovery: CAS con cero filas no cambia metadata local",async()=>{
  const harness=recoveryHarness({writeError:Object.assign(new Error("sync_conflict"),{code:"sync_conflict"})});
  await assert.rejects(()=>harness.context.promote(),error=>error.code==="sync_conflict");
  assert.equal(harness.writeCalls.length,1);
  assert.deepEqual(harness.writes,[]);
  assert.equal(harness.values.get("gymos:localRevision"),"419");
});

test("recovery: RPC success false no cambia metadata local",async()=>{
  const harness=recoveryHarness({writeResult:{success:false,conflict:true,revision:915}});
  await assert.rejects(()=>harness.context.promote(),error=>error.code==="sync_conflict");
  assert.equal(harness.writeCalls.length,1);
  assert.deepEqual(harness.writes,[]);
  assert.equal(harness.values.get("gymos:localRevision"),"419");
  assert.equal(harness.values.get("gymos:lastRemoteRevision"),"419");
  assert.equal(harness.values.get("gymos:syncBaseRevision"),"419");
});

test("recovery: error de red no cambia metadata local",async()=>{
  const harness=recoveryHarness({writeError:{status:503,code:"network_error"}});
  await assert.rejects(()=>harness.context.promote());
  assert.equal(harness.writeCalls.length,1);
  assert.deepEqual(harness.writes,[]);
  assert.equal(harness.values.get("gymos:localRevision"),"419");
});

test("recovery: éxito solicita exactamente 915 a 916 con protocolo v2 usando payload local",async()=>{
  const harness=recoveryHarness();
  const result=await harness.context.promote();
  assert.equal(result.direction,"recovery_upload");
  assert.equal(result.revision,916);
  assert.equal(harness.writeCalls.length,1);
  const call=harness.writeCalls[0];
  assert.equal(call.base,915);
  assert.equal(call.exists,true);
  assert.equal(call.expectedChecksum,"a585090d");
  assert.equal(call.envelope.revision,916);
  assert.equal(call.envelope.parentRevision,915);
  assert.equal(call.envelope.payload.syncProtocolVersion,2);
  assert.equal(call.envelope.payload.syncParentRevision,915);
  assert.equal(call.envelope.payload.source,"local-pc");
  assert.equal(call.envelope.payload.source==="remote",false);
  assert.equal(call.envelope.checksum,"pc-checksum");
});

test("recovery: metadata local se actualiza solo después del éxito remoto",async()=>{
  const harness=recoveryHarness();
  await harness.context.promote();
  assert.equal(harness.writeCalls[0].localRevisionBefore,"419");
  assert.deepEqual(harness.writes.map(write=>write[1]),[
    "gymos:localRevision",
    "gymos:lastRemoteRevision",
    "gymos:syncBaseRevision",
    "gymos:syncProtocolVersion",
    "gymos:syncPending",
    "gymos:lastSyncAt"
  ]);
  assert.equal(harness.values.get("gymos:localRevision"),"916");
  assert.equal(harness.values.get("gymos:lastRemoteRevision"),"916");
  assert.equal(harness.values.get("gymos:syncBaseRevision"),"916");
  assert.equal(harness.values.get("gymos:syncProtocolVersion"),"2");
  assert.equal(harness.values.has("gymos:syncPending"),false);
});

test("recovery: promoción usa CAS RPC y no escritura directa a gymos_sync",()=>{
  const source=appSource.slice(
    appSource.indexOf("async function promoteLocalDeviceAsCanonicalSyncHead"),
    appSource.indexOf("async function adoptCanonicalRemoteSyncHeadOnThisDevice")
  );
  assert.match(source,/writeSyncEnvelopeWithCas\(/);
  assert.doesNotMatch(source,/from\("gymos_sync"\)\.(?:insert|update|upsert|delete)\(/);
  assert.doesNotMatch(source,/\.upsert\(/);
  assert.match(appSource,/rpc\("gymos_sync_compare_and_swap"/);
});

test("recovery adoption: no escribe nunca en Supabase",async()=>{
  const harness=adoptionHarness();
  const result=await harness.context.adopt();
  assert.equal(result.direction,"recovery_download");
  assert.deepEqual(harness.remoteWrites,[]);
});

test("recovery adoption: remoto exacto 916 / 759d936c permite adopción",async()=>{
  const harness=adoptionHarness();
  const result=await harness.context.adopt();
  assert.equal(result.revision,916);
  assert.equal(harness.counters.apply,1);
  assert.equal(harness.values.get("gymos:lastSyncHash"),"759d936c");
});

test("recovery adoption: remoto con revision distinta aborta sin tocar local",async()=>{
  const harness=adoptionHarness({remoteOverrides:{revision:915}});
  const before=sortedEntries(harness.snapshot());
  await assert.rejects(()=>harness.context.adopt(),error=>error.code==="recovery_remote_changed");
  assert.deepEqual(sortedEntries(harness.snapshot()),before);
  assert.deepEqual(harness.remoteWrites,[]);
  assert.equal(harness.counters.apply,0);
});

test("recovery adoption: remoto con checksum distinto aborta",async()=>{
  const harness=adoptionHarness({remoteOverrides:{checksum:"changed"}});
  const before=sortedEntries(harness.snapshot());
  await assert.rejects(()=>harness.context.adopt(),error=>error.code==="recovery_remote_changed");
  assert.deepEqual(sortedEntries(harness.snapshot()),before);
  assert.equal(harness.counters.apply,0);
});

test("recovery adoption: routineId remoto distinto aborta",async()=>{
  const harness=adoptionHarness({remoteOverrides:{payload:{canonicalRoutine:{routineId:"routine-other"}}}});
  const before=sortedEntries(harness.snapshot());
  await assert.rejects(()=>harness.context.adopt(),error=>error.code==="recovery_remote_changed");
  assert.deepEqual(sortedEntries(harness.snapshot()),before);
  assert.equal(harness.counters.apply,0);
});

test("recovery adoption: selectedSessionId remoto distinto aborta",async()=>{
  const harness=adoptionHarness({remoteOverrides:{payload:{selectedSessionId:"session-other"}}});
  const before=sortedEntries(harness.snapshot());
  await assert.rejects(()=>harness.context.adopt(),error=>error.code==="recovery_remote_changed");
  assert.deepEqual(sortedEntries(harness.snapshot()),before);
  assert.equal(harness.counters.apply,0);
});

test("recovery adoption: protocolVersion remoto distinto de 2 aborta",async()=>{
  const harness=adoptionHarness({remoteOverrides:{payload:{syncProtocolVersion:1}}});
  const before=sortedEntries(harness.snapshot());
  await assert.rejects(()=>harness.context.adopt(),error=>error.code==="recovery_remote_changed");
  assert.deepEqual(sortedEntries(harness.snapshot()),before);
  assert.equal(harness.counters.apply,0);
});

test("recovery adoption: deviceId local distinto aborta",async()=>{
  const harness=adoptionHarness({localOverrides:{snapshot:{deviceId:"other-device"}}});
  const before=sortedEntries(harness.snapshot());
  await assert.rejects(()=>harness.context.adopt(),error=>error.code==="recovery_local_changed");
  assert.deepEqual(sortedEntries(harness.snapshot()),before);
  assert.equal(harness.counters.apply,0);
});

test("recovery adoption: revision local distinta de 915 aborta",async()=>{
  const harness=adoptionHarness({localOverrides:{snapshot:{localRevision:914}}});
  const before=sortedEntries(harness.snapshot());
  await assert.rejects(()=>harness.context.adopt(),error=>error.code==="recovery_local_changed");
  assert.deepEqual(sortedEntries(harness.snapshot()),before);
  assert.equal(harness.counters.apply,0);
});

test("recovery adoption: lastRemoteRevision local distinta de 915 aborta",async()=>{
  const harness=adoptionHarness({localOverrides:{snapshot:{lastRemoteRevision:914}}});
  const before=sortedEntries(harness.snapshot());
  await assert.rejects(()=>harness.context.adopt(),error=>error.code==="recovery_local_changed");
  assert.deepEqual(sortedEntries(harness.snapshot()),before);
  assert.equal(harness.counters.apply,0);
});

test("recovery adoption: syncBaseRevision local distinta de 915 aborta",async()=>{
  const harness=adoptionHarness({localOverrides:{snapshot:{syncBaseRevision:914}}});
  const before=sortedEntries(harness.snapshot());
  await assert.rejects(()=>harness.context.adopt(),error=>error.code==="recovery_local_changed");
  assert.deepEqual(sortedEntries(harness.snapshot()),before);
  assert.equal(harness.counters.apply,0);
});

test("recovery adoption: local sin pending aborta",async()=>{
  const harness=adoptionHarness({
    localOverrides:{
      snapshot:{syncPending:false},
      storage:{"gymos:syncPending":null}
    }
  });
  const before=sortedEntries(harness.snapshot());
  await assert.rejects(()=>harness.context.adopt(),error=>error.code==="recovery_local_changed");
  assert.deepEqual(sortedEntries(harness.snapshot()),before);
  assert.equal(harness.counters.apply,0);
});

test("recovery adoption: routineId local distinto aborta",async()=>{
  const harness=adoptionHarness({localOverrides:{snapshot:{routineId:"routine-other"}}});
  const before=sortedEntries(harness.snapshot());
  await assert.rejects(()=>harness.context.adopt(),error=>error.code==="recovery_local_changed");
  assert.deepEqual(sortedEntries(harness.snapshot()),before);
  assert.equal(harness.counters.apply,0);
});

test("recovery adoption: selectedSessionId local distinto aborta",async()=>{
  const harness=adoptionHarness({localOverrides:{snapshot:{selectedSessionId:"session-other"}}});
  const before=sortedEntries(harness.snapshot());
  await assert.rejects(()=>harness.context.adopt(),error=>error.code==="recovery_local_changed");
  assert.deepEqual(sortedEntries(harness.snapshot()),before);
  assert.equal(harness.counters.apply,0);
});

test("recovery adoption: fallo de applySyncPayload restaura integramente el estado local",async()=>{
  const harness=adoptionHarness({applyError:Object.assign(new Error("partial apply"),{code:"apply_failed"})});
  const before=sortedEntries(harness.snapshot());
  await assert.rejects(()=>harness.context.adopt(),error=>error.code==="recovery_local_apply_failed");
  assert.deepEqual(sortedEntries(harness.snapshot()),before);
  assert.equal(harness.values.get("gymos:deviceId"),"134d82b5-0770-4779-a0d6-a79f99804c44");
  assert.deepEqual(harness.remoteWrites,[]);
});

test("recovery adoption: canonicalRoutine remoto inválido aborta y restaura snapshot",async()=>{
  const harness=adoptionHarness({
    remoteOverrides:{payload:{canonicalRoutine:{
      routineId:"routine-02488c9c-d38e-4b59-8814-f7e0bcbd7d5e",
      invalid:true
    }}}
  });
  const before=sortedEntries(harness.snapshot());
  await assert.rejects(
    ()=>harness.context.adopt(),
    error=>error.code==="recovery_local_apply_failed"&&
      error.details?.cause==="invalid_remote_canonical"
  );
  assert.deepEqual(sortedEntries(harness.snapshot()),before);
  assert.equal(harness.counters.apply,1);
  assert.deepEqual(harness.remoteWrites,[]);
});

test("recovery adoption: canonicalDrafts inválidos abortan y restauran snapshot",async()=>{
  const harness=adoptionHarness({
    remoteOverrides:{payload:{canonicalDrafts:{invalid:true}}}
  });
  const before=sortedEntries(harness.snapshot());
  await assert.rejects(
    ()=>harness.context.adopt(),
    error=>error.code==="recovery_local_apply_failed"&&
      error.details?.cause==="invalid_remote_session_state"
  );
  assert.deepEqual(sortedEntries(harness.snapshot()),before);
  assert.equal(harness.counters.apply,1);
  assert.deepEqual(harness.remoteWrites,[]);
});

test("recovery adoption: éxito aplica payload remoto y conserva deviceId móvil",async()=>{
  const harness=adoptionHarness();
  const result=await harness.context.adopt();
  assert.equal(result.revision,916);
  assert.equal(harness.counters.apply,1);
  assert.equal(harness.applyOptions.length,1);
  assert.equal(harness.applyOptions[0].recoveryCanonicalReplacement,true);
  assert.equal(harness.values.get("gymos:deviceId"),"134d82b5-0770-4779-a0d6-a79f99804c44");
  assert.equal(
    JSON.parse(harness.values.get("gymos:routine:canonical")).routineId,
    "routine-02488c9c-d38e-4b59-8814-f7e0bcbd7d5e"
  );
  assert.equal(harness.values.get("gymos:selectedSessionId"),"roadmap-2026-08-a");
});

test("recovery adoption: éxito fija revisiones 916, limpia pending y no ejecuta sync",async()=>{
  const harness=adoptionHarness();
  await harness.context.adopt();
  assert.equal(harness.values.get("gymos:localRevision"),"916");
  assert.equal(harness.values.get("gymos:lastRemoteRevision"),"916");
  assert.equal(harness.values.get("gymos:syncBaseRevision"),"916");
  assert.equal(harness.values.get("gymos:syncProtocolVersion"),"2");
  assert.equal(harness.values.get("gymos:lastSyncHash"),"759d936c");
  assert.equal(harness.values.has("gymos:syncPending"),false);
  assert.equal(harness.counters.syncNow,0);
  assert.equal(harness.counters.autoSync,0);
  assert.equal(harness.counters.cas,0);
  assert.equal(harness.counters.rpc,0);
});

test("recovery adoption: no llama CAS RPC ni escritura directa a gymos_sync",()=>{
  const source=appSource.slice(
    appSource.indexOf("async function adoptCanonicalRemoteSyncHeadOnThisDevice"),
    appSource.indexOf("async function syncNow")
  );
  assert.doesNotMatch(source,/writeSyncEnvelopeWithCas\(/);
  assert.doesNotMatch(source,/gymos_sync_compare_and_swap/);
  assert.doesNotMatch(source,/\.rpc\(/);
  assert.doesNotMatch(source,/from\("gymos_sync"\)\.(?:insert|update|upsert|delete)\(/);
  assert.doesNotMatch(source,/\.upsert\(/);
});

test("recovery adoption: es la única ruta que activa recoveryCanonicalReplacement",()=>{
  const occurrences=[...appSource.matchAll(/recoveryCanonicalReplacement:true/g)];
  assert.equal(occurrences.length,1);
  const adoptionSource=appSource.slice(
    appSource.indexOf("async function adoptCanonicalRemoteSyncHeadOnThisDevice"),
    appSource.indexOf("async function syncNow")
  );
  assert.match(adoptionSource,/applySyncPayload\(row\.payload\|\|\{\},\{\s*recoveryCanonicalReplacement:true\s*\}\)/);
});

test("recovery adoption: diagnóstico muestra cause seguro del fallo interno",()=>{
  const source=[
    functionSource("sanitizeSyncError","syncDiagnosticLog"),
    functionSource("renderSyncDebugError","syncDebugActionsHtml")
  ].join("\n");
  const context={};
  vm.createContext(context);
  vm.runInContext(`${source};`,context);
  const error=Object.assign(new Error("recovery_local_apply_failed"),{
    code:"recovery_local_apply_failed",
    details:{cause:"canonical_routine_id_conflict",secret:"hidden"}
  });
  const sanitized=context.sanitizeSyncError(error);
  assert.equal(sanitized.details.cause,"canonical_routine_id_conflict");
  assert.doesNotMatch(JSON.stringify(sanitized),/hidden/);
  assert.match(context.renderSyncDebugError(sanitized),/cause=canonical_routine_id_conflict/);
});

test("sync v2 móvil legacy base 912 pending contra remoto v2 913 queda en conflicto sin upload",async()=>{
  const harness=syncHarness({
    remote:{revision:913,checksum:"pc-checksum",payload:{source:"pc",syncProtocolVersion:2}},
    localRevision:913,lastRemoteRevision:912,baseRevision:912,pending:true,
    currentProtocol:false,checksum:"mobile-checksum"
  });
  const result=await harness.context.runSync();
  assert.equal(result.direction,"conflict");
  assert.equal(harness.counters.writeAttempts,0);
  assert.equal(harness.counters.writes,0);
  assert.equal(harness.values.get("gymos:syncPending"),"1");
});

test("sync v2 no quedan escrituras directas sobre gymos_sync en app.js",()=>{
  const gymosSyncCalls=[...appSource.matchAll(/from\("gymos_sync"\)[\s\S]{0,180}/g)]
    .map(match=>match[0]);
  assert.ok(gymosSyncCalls.length>=4);
  for(const call of gymosSyncCalls) assert.doesNotMatch(call,/\.(?:insert|update|upsert|delete)\(/);
  assert.match(appSource,/rpc\("gymos_sync_compare_and_swap"/);
  assert.match(appSource,/rpc\("gymos_sync_delete_own"/);
});

function syncDiagnosticHashHarness({canonical,history=[]}={}){
  const source=appSource.slice(
    appSource.indexOf("function simpleChecksum"),
    appSource.indexOf("function remoteSyncDiagnosticFromRow")
  );
  const values=new Map([
    ["gymos:deviceId","device-a"],
    ["gymos:routine:canonical",JSON.stringify(canonical)],
    ["gymos:history",JSON.stringify(history)],
    ["gymos:selectedSessionId","session-a"]
  ]);
  const context={
    DEVICE_ID_KEY:"gymos:deviceId",
    SELECTED_SESSION_ID_KEY:"gymos:selectedSessionId",
    localStorage:{getItem:key=>values.has(key)?values.get(key):null},
    window:{
      GymOSRoutineSessionModel:{
        validateCanonicalRoutine:value=>({valid:Boolean(value?.routineId&&Array.isArray(value?.sessions))}),
        normalizeCanonicalRoutine:value=>({
          ...JSON.parse(JSON.stringify(value)),
          sessions:JSON.parse(JSON.stringify(value.sessions)).sort((left,right)=>
            Number(left.order||0)-Number(right.order||0)||
            String(left.sessionId||"").localeCompare(String(right.sessionId||""),"en")
          )
        })
      }
    },
    currentRoutineOwnerOrNull:()=>OWNER_A,
    mergeWorkoutHistory:(localHistory,incomingHistory,ownerId)=>{
      const records=new Map();
      const identity=workout=>String(workout?.workoutInstanceId||workout?.draftId||workout?.id||"");
      (Array.isArray(localHistory)?localHistory:[]).forEach(workout=>{
        const id=identity(workout);
        if(id) records.set(id,JSON.parse(JSON.stringify(workout)));
      });
      (Array.isArray(incomingHistory)?incomingHistory:[]).forEach(workout=>{
        if(workout?.ownerId&&ownerId&&workout.ownerId!==ownerId) return;
        const id=identity(workout);
        if(!id||records.has(id)) return;
        records.set(id,JSON.parse(JSON.stringify(workout)));
      });
      return [...records.values()].sort((left,right)=>
        new Date(right?.date||0)-new Date(left?.date||0)||
        identity(left).localeCompare(identity(right),"en")
      );
    },
    getCanonicalRoutine:()=>context.window.GymOSRoutineSessionModel.normalizeCanonicalRoutine(
      JSON.parse(values.get("gymos:routine:canonical"))
    ),
    getHistory:()=>JSON.parse(values.get("gymos:history")||"[]"),
    getLocalRevision:()=>916,
    getLastRemoteRevision:()=>916,
    getSyncBaseRevision:()=>916,
    getLastSyncAt:()=>null,
    buildSyncPayload:()=>({
      canonicalRoutine:context.getCanonicalRoutine(),
      routine:context.getCanonicalRoutine(),
      selectedSessionId:values.get("gymos:selectedSessionId")||null,
      history:context.getHistory()
    })
  };
  vm.createContext(context);
  vm.runInContext(source,context);
  return {context,values};
}

test("sync diagnóstico: round-trip semántico iguala routineHash e historyHash",()=>{
  const canonical={
    schemaVersion:"4.2",
    routineId:"routine-02488c9c-d38e-4b59-8814-f7e0bcbd7d5e",
    revision:12,
    sessions:[
      {sessionId:"session-b",order:2,legacySessionKey:"B",exercises:[{name:"Remo"}]},
      {sessionId:"session-a",order:1,legacySessionKey:"A",exercises:[{name:"Press"}]}
    ]
  };
  const remoteHistory=[
    {id:"w-2",ownerId:OWNER_A,date:"2026-08-14",sets:[{kg:30,reps:8}]},
    {id:"w-1",ownerId:OWNER_A,date:"2026-08-15",sets:[{kg:20,reps:10}]}
  ];
  const {context,values}=syncDiagnosticHashHarness({canonical});
  values.set("gymos:history",JSON.stringify(context.mergeWorkoutHistory([],remoteHistory,OWNER_A)));
  const local=context.localSyncDiagnosticSnapshot();
  const remote=context.remotePayloadDiagnostic({
    canonicalRoutine:JSON.parse(JSON.stringify(canonical)),
    routine:JSON.parse(JSON.stringify(canonical)),
    selectedSessionId:"session-a",
    history:remoteHistory
  });
  assert.equal(local.routineHash,remote.routineHash);
  assert.equal(local.historyHash,remote.historyHash);
});

test("sync diagnóstico: divergencias reales de rutina e historial siguen detectándose",()=>{
  const canonical={
    schemaVersion:"4.2",routineId:"routine-a",revision:1,
    sessions:[{sessionId:"session-a",order:1,legacySessionKey:"A",exercises:[{name:"Press"}]}]
  };
  const {context,values}=syncDiagnosticHashHarness({
    canonical,
    history:[{id:"w-1",ownerId:OWNER_A,date:"2026-08-15",sets:[{kg:20,reps:10}]}]
  });
  const remoteCanonical=JSON.parse(JSON.stringify(canonical));
  remoteCanonical.sessions[0].exercises[0].name="Sentadilla";
  const remoteHistory=[{id:"w-1",ownerId:OWNER_A,date:"2026-08-15",sets:[{kg:25,reps:10}]}];
  const local=context.localSyncDiagnosticSnapshot();
  const remote=context.remotePayloadDiagnostic({
    canonicalRoutine:remoteCanonical,
    selectedSessionId:"session-a",
    history:remoteHistory
  });
  assert.notEqual(local.routineHash,remote.routineHash);
  assert.notEqual(local.historyHash,remote.historyHash);
  values.set("gymos:history",JSON.stringify(remoteHistory));
  assert.equal(context.localSyncDiagnosticSnapshot().historyHash,remote.historyHash);
});

function buildPayloadChecksumHarness({
  deviceId="device",
  deviceName="Device",
  updatedAt="2026-08-15T10:00:00.000Z",
  canonicalRoutine=null,
  history=[],
  extraPayload={}
}={}){
  const source=[
    functionSource("buildSyncPayload","routinePayloadCompatibilityWithCanonical"),
    functionSource("simpleChecksum","storedValueHash")
  ].join("\n");
  const routine=canonicalRoutine||{
    schemaVersion:"4.2",
    routineId:"routine-functional",
    revision:7,
    sessions:[{
      sessionId:"session-a",
      order:1,
      legacySessionKey:"A",
      exercises:[{name:"Press",sets:3,target:"8-10 reps"}]
    }]
  };
  const drafts={schemaVersion:"4.2",ownerId:"owner-a",routineId:routine.routineId,draftsBySessionId:{},orphanedLegacyDrafts:{}};
  const values=new Map([
    ["gymos:selectedSessionId","session-a"],
    ["gymos:selectedSession","A"],
    ["gymos:sessionModelMigration",JSON.stringify({
      completed:true,validated:true,ownerId:"owner-a",routineId:routine.routineId,
      legacySessionMap:{A:"session-a"}
    })]
  ]);
  const context={
    window:{
      GymOSProfessionalNutrition:{getPlans(){return [];}},
      GymOSRecovery:{getEntries(){return [];},getCheckins(){return [];}},
      GymOSWorkoutAnalysis:{getAnalyses(){return [];}},
      GymOSProfileData:{exportSyncData(){return {};}}
    },
    localStorage:{getItem:key=>values.has(key)?values.get(key):null},
    SELECTED_SESSION_ID_KEY:"gymos:selectedSessionId",
    SESSION_MODEL_MIGRATION_KEY:"gymos:sessionModelMigration",
    ACTIVE_ROUTINE_PROPOSAL_ID_KEY:"gymos:activeRoutineProposalId",
    ACTIVE_ROUTINE_ACTIVATION_ID_KEY:"gymos:activeRoutineActivationId",
    EXERCISE_DOMAIN_SCHEMA_KEY:"gymos:exerciseDomainSchemaVersion",
    currentRoutineOwnerOrNull:()=>"owner-a",
    getLocalUpdatedAt:()=>updatedAt,
    getDeviceId:()=>deviceId,
    getDeviceName:()=>deviceName,
    getHistory:()=>JSON.parse(JSON.stringify(history)),
    activeRoutineForComparison:()=>JSON.parse(JSON.stringify(routine)),
    getCanonicalRoutine:()=>JSON.parse(JSON.stringify(routine)),
    getCanonicalDrafts:()=>JSON.parse(JSON.stringify(drafts)),
    sanitizeWorkoutDraftContainer:value=>JSON.parse(JSON.stringify(value)),
    storedWorkoutProgressRecords:()=>[],
    readStoredJson:key=>JSON.parse(values.get(key)||"null"),
    getBodyHistory:()=>[],
    getBodySummaryMetrics:()=>[],
    getRestSeconds:()=>90,
    getWeeklyGoal:()=>3,
    getTrainingBlocks:()=>[],
    getRoutineProposalRecords:()=>[],
    getRoutineActivationRecords:()=>[],
    getExerciseLibrary:()=>[],
    getExerciseSubstitutions:()=>[],
    getNutritionSettings:()=>null,
    getNutritionEntries:()=>[],
    getHealthSettings:()=>null,
    getHealthEntries:()=>[],
    getHealthImports:()=>[],
    getAppPreferences:()=>({theme:"system"}),
    getCoachSettings:()=>({aiEnabled:false}),
    getQuickActionPreferences:()=>({quickActions:["start"],hidden:false}),
    getFavoriteSubstitutions:()=>[]
  };
  vm.createContext(context);
  vm.runInContext(source,context);
  const payload={...context.buildSyncPayload(),...extraPayload};
  return {
    payload,
    checksum:context.simpleChecksum(payload),
    functionalChecksum:context.functionalSyncChecksum(payload),
    context
  };
}

function functionalPayloadProjection(payload){
  return payload;
}





test("sameRevisionDiverged: elegir nube adopta remoto/base y la siguiente sync devuelve none",async()=>{
  const remotePayload={
    stable:true,
    syncProtocolVersion:2,
    syncFunctionalChecksumVersion:1,
    functionalChecksum:"remote-functional",
    functionalVariant:"remote-functional"
  };
  const sharedRemote={state:{
    revision:964,checksum:"remote-full",device_id:"pc",
    updated_at:"2026-08-16T08:12:38.433Z",payload:remotePayload
  }};
  const harness=syncHarness({
    sharedRemote,checksum:"local-full",localRevision:964,lastRemoteRevision:964,baseRevision:964,
    pending:false,conflictResolution:"remote",
    localPayload:{...remotePayload,functionalVariant:"contaminated-local"}
  });
  const first=await harness.context.runSync();
  assert.equal(first.direction,"download");
  assert.equal(first.resolvedConflict,true);
  assert.equal(first.resolution,"remote");
  assert.equal(harness.counters.applies,1);
  assert.equal(harness.values.get("gymos:localRevision"),"964");
  assert.equal(harness.values.get("gymos:lastRemoteRevision"),"964");
  assert.equal(harness.values.get("gymos:syncBaseRevision"),"964");
  assert.equal(harness.values.get("gymos:lastSyncHash"),"remote-full");
  assert.equal(harness.values.has("gymos:syncPending"),false);
  assert.equal(harness.context.state.syncIssue,null);
  assert.equal(harness.context.functionalSyncChecksum(harness.context.buildSyncPayload()),"remote-functional");

  const second=await harness.context.runSync();
  assert.equal(second.direction,"none");
  assert.equal(harness.counters.writes,0);
  assert.equal(harness.audits.some(item=>
    item.action==="sync_trace"&&item.status==="conflict_remote_applied"
  ),true);
});

test("sync posterior a adopción remota canónica en revisión N termina none sin pending",async()=>{
  const remote={
    revision:964,checksum:"same",device_id:"pc",updated_at:"2026-08-16T08:12:38.433Z",
    payload:{stable:true,syncProtocolVersion:2,functionalChecksum:"functional-same"}
  };
  const harness=syncHarness({
    remote,checksum:"same",localRevision:964,lastRemoteRevision:964,baseRevision:964
  });
  const result=await harness.context.runSync();
  assert.equal(result.direction,"none");
  assert.equal(harness.values.get("gymos:localRevision"),"964");
  assert.equal(harness.values.has("gymos:syncPending"),false);
  assert.equal(harness.counters.applies,0);
  assert.equal(harness.audits.some(item=>item.status==="conflict"),false);
  assert.equal(harness.audits.some(item=>item.status==="none_synced"),true);
});

test("sync checksum: mismo estado funcional con distinto deviceId/deviceName/updatedAt conserva functionalChecksum",()=>{
  const canonicalRoutine={
    schemaVersion:"4.2",
    routineId:"routine-functional",
    revision:7,
    sessions:[{
      sessionId:"session-a",
      order:1,
      legacySessionKey:"A",
      exercises:[{name:"Press",sets:3,target:"8-10 reps"}]
    }]
  };
  const history=[{id:"w-1",ownerId:"owner-a",date:"2026-08-15",sets:[{kg:20,reps:10}]}];
  const pc=buildPayloadChecksumHarness({
    deviceId:"pc",deviceName:"PC",updatedAt:"2026-08-15T10:00:00.000Z",
    canonicalRoutine,history
  });
  const mobile=buildPayloadChecksumHarness({
    deviceId:"mobile",deviceName:"Mobile",updatedAt:"2026-08-15T10:00:00.000Z",
    canonicalRoutine,history
  });
  const mobileSameName=buildPayloadChecksumHarness({
    deviceId:"mobile",deviceName:"PC",updatedAt:"2026-08-15T10:00:00.000Z",
    canonicalRoutine,history
  });
  const mobileSameDeviceNewTime=buildPayloadChecksumHarness({
    deviceId:"pc",deviceName:"PC",updatedAt:"2026-08-15T10:05:00.000Z",
    canonicalRoutine,history
  });
  assert.equal(
    JSON.stringify(pc.context.functionalSyncProjection(pc.payload)),
    JSON.stringify(mobile.context.functionalSyncProjection(mobile.payload))
  );
  assert.equal(pc.functionalChecksum,mobile.functionalChecksum);
  assert.equal(pc.functionalChecksum,mobileSameName.functionalChecksum);
  assert.equal(pc.functionalChecksum,mobileSameDeviceNewTime.functionalChecksum);
  assert.notEqual(pc.checksum,mobile.checksum);
  assert.notEqual(pc.checksum,mobileSameName.checksum);
  assert.notEqual(pc.checksum,mobileSameDeviceNewTime.checksum);
  assert.equal(pc.payload.deviceId,"pc");
  assert.equal(mobile.payload.deviceId,"mobile");
  assert.equal(pc.payload.deviceName,"PC");
  assert.equal(mobile.payload.deviceName,"Mobile");
  assert.equal(pc.payload.updatedAt,"2026-08-15T10:00:00.000Z");
});

test("sync checksum: cambio funcional real también cambia functionalChecksum",()=>{
  const base=buildPayloadChecksumHarness();
  const routineChanged=buildPayloadChecksumHarness({
    canonicalRoutine:{
      schemaVersion:"4.2",routineId:"routine-functional",revision:7,
      sessions:[{
        sessionId:"session-a",order:1,legacySessionKey:"A",
        exercises:[{name:"Sentadilla",sets:3,target:"8-10 reps"}]
      }]
    }
  });
  const historyChanged=buildPayloadChecksumHarness({
    history:[{id:"w-1",ownerId:"owner-a",date:"2026-08-15",sets:[{kg:25,reps:10}]}]
  });
  assert.notDeepEqual(
    base.context.functionalSyncProjection(base.payload),
    routineChanged.context.functionalSyncProjection(routineChanged.payload)
  );
  assert.notDeepEqual(
    base.context.functionalSyncProjection(base.payload),
    historyChanged.context.functionalSyncProjection(historyChanged.payload)
  );
  assert.notEqual(base.functionalChecksum,routineChanged.functionalChecksum);
  assert.notEqual(base.functionalChecksum,historyChanged.functionalChecksum);
  assert.notEqual(base.checksum,routineChanged.checksum);
  assert.notEqual(base.checksum,historyChanged.checksum);
});

test("sync checksum: round-trip semántico de payload mantiene checksum funcional",()=>{
  const canonicalRoutine={
    schemaVersion:"4.2",
    routineId:"routine-functional",
    revision:7,
    sessions:[{
      sessionId:"session-a",order:1,legacySessionKey:"A",
      exercises:[{name:"Press",sets:3,target:"8-10 reps"}]
    }]
  };
  const history=[
    {id:"w-2",ownerId:"owner-a",date:"2026-08-16",sets:[{kg:22.5,reps:8}]},
    {id:"w-1",ownerId:"owner-a",date:"2026-08-15",sets:[{kg:20,reps:10}]}
  ];
  const uploaded=buildPayloadChecksumHarness({
    deviceId:"pc",deviceName:"PC",updatedAt:"2026-08-15T10:00:00.000Z",
    canonicalRoutine,history
  });
  const storedRemotePayload={
    ...uploaded.payload,
    syncProtocolVersion:2,
    syncParentRevision:916,
    syncFunctionalChecksumVersion:1,
    functionalChecksum:uploaded.functionalChecksum
  };
  const rebuilt=buildPayloadChecksumHarness({
    deviceId:"mobile",deviceName:"Mobile",updatedAt:"2026-08-15T10:05:00.000Z",
    canonicalRoutine:storedRemotePayload.canonicalRoutine,
    history:storedRemotePayload.history
  });
  assert.equal(
    rebuilt.context.functionalSyncChecksum(rebuilt.payload),
    storedRemotePayload.functionalChecksum
  );
});

test("sync v2: upload 964 seguido de sync sin cambios no crea falso conflicto",async()=>{
  const sharedRemote={
    state:{
      revision:963,
      checksum:"remote-963",
      payload:{stable:false,syncProtocolVersion:2}
    }
  };
  const first=syncHarness({
    sharedRemote,
    localRevision:963,
    lastRemoteRevision:963,
    baseRevision:963,
    pending:true
  });
  first.context.buildSyncEnvelope=(base,candidate)=>{
    const payload={
      stable:true,
      syncProtocolVersion:2,
      syncParentRevision:base,
      syncFunctionalChecksumVersion:1,
      functionalChecksum:"functional-964"
    };
    return {
      payload,
      revision:candidate,
      parentRevision:base,
      deviceId:"mobile",
      checksum:"full-964",
      functionalChecksum:"functional-964",
      updatedAt:"2026-08-16T10:00:00.000Z"
    };
  };
  const upload=await first.context.runSync();
  assert.equal(upload.direction,"upload");
  assert.equal(upload.revision,964);
  assert.equal(first.values.get("gymos:localRevision"),"964");
  assert.equal(first.values.get("gymos:lastRemoteRevision"),"964");
  assert.equal(first.values.get("gymos:syncBaseRevision"),"964");
  assert.equal(first.values.has("gymos:syncPending"),false);

  const second=syncHarness({
    sharedRemote,
    checksum:"full-964",
    localRevision:964,
    lastRemoteRevision:964,
    baseRevision:964,
    pending:false
  });
  second.context.functionalSyncChecksum=()=>"functional-964";
  const result=await second.context.runSync();
  assert.equal(result.direction,"none");
  assert.equal(second.context.state.syncStatus,"synced");
  assert.equal(second.counters.writeAttempts,0);
  assert.equal(second.counters.applies,0);
});

function syncIndicatorHarness(status="conflict"){
  const source=appSource.slice(
    appSource.indexOf("function updateSyncIndicators("),
    appSource.indexOf("async function retrySyncFromNavigation(")
  );
  const nodes={
    label:{textContent:""},
    dot:{className:`sync-dot ${status}`},
    description:{textContent:""},
    lastSync:{textContent:""},
    trigger:{
      classes:new Set(["shell-sync-trigger",status]),
      attrs:{},
      classList:{
        remove(...items){items.forEach(item=>nodes.trigger.classes.delete(item));},
        add(item){nodes.trigger.classes.add(item);}
      },
      setAttribute(name,value){this.attrs[name]=value;}
    }
  };
  const context={
    state:{syncStatus:status},
    document:{
      querySelectorAll(selector){
        return {
          "[data-sync-label]":[nodes.label],
          "[data-sync-dot]":[nodes.dot],
          "[data-sync-description]":[nodes.description],
          "[data-last-sync]":[nodes.lastSync],
          ".shell-sync-trigger":[nodes.trigger]
        }[selector]||[];
      }
    },
    formatSyncDate:()=>"ahora",
    getLastSyncAt:()=>"2026-08-16T10:00:00.000Z"
  };
  vm.createContext(context);
  vm.runInContext(`${source}; this.update=updateSyncIndicators; this.label=syncStatusLabel;`,context);
  return {context,nodes};
}

test("sync visual: una sync sana limpia rojo previo del indicador y error histórico",async()=>{
  const harness=syncHarness({
    remote:{
      revision:964,
      checksum:"full-964",
      payload:{
        stable:true,
        syncProtocolVersion:2,
        syncFunctionalChecksumVersion:1,
        functionalChecksum:"functional-same"
      }
    },
    checksum:"full-964",
    localRevision:964,
    lastRemoteRevision:964,
    baseRevision:964,
    pending:false,
    initialStatus:"conflict",
    initialIssue:{kind:"sync_conflict",retryable:false},
    initialLastError:{code:"sync_conflict",message:"falso conflicto 964"}
  });
  const result=await harness.context.runSync();
  assert.equal(result.direction,"none");
  assert.equal(harness.context.state.syncStatus,"synced");
  assert.equal(harness.context.state.syncIssue,null);
  assert.equal(harness.context.state.syncDiagnosticLastError,null);

  const visual=syncIndicatorHarness("conflict");
  visual.context.state.syncStatus="synced";
  visual.context.update();
  assert.equal(visual.nodes.dot.className,"sync-dot synced");
  assert.equal(visual.nodes.trigger.classes.has("conflict"),false);
  assert.equal(visual.nodes.trigger.classes.has("synced"),true);
  assert.equal(visual.nodes.trigger.attrs["aria-label"],"Sincronización: Sincronizado");
});

test("sync diff funcional: resume rutas divergentes sin exponer valores",()=>{
  const source=appSource.slice(
    appSource.indexOf("function simpleChecksum"),
    appSource.indexOf("function storedValueHash")
  );
  const context={};
  vm.createContext(context);
  vm.runInContext(`${source}; this.diff=functionalSyncProjectionDiffSummary;`,context);
  const result=context.diff(
    {profile:{name:"Nombre Sensible",optional:null},history:[{id:"h1",notes:"privado"}],presentUndefined:undefined},
    {profile:{name:"Otro Nombre"},history:[]}
  );
  const paths=result.diffPaths.map(item=>item.path);
  assert.deepEqual([...paths],["history[0]","presentUndefined","profile.name","profile.optional"]);
  assert.equal(result.diffPaths[0].local.exists,true);
  assert.equal(result.diffPaths[0].remote.exists,false);
  assert.equal(result.diffPaths[1].local.type,"undefined");
  assert.equal(result.diffPaths[1].remote.type,"absent");
  assert.equal(result.diffPaths[3].local.type,"null");
  assert.equal(result.diffPaths[3].remote.type,"absent");
  const serialized=JSON.stringify(result);
  assert.equal(serialized.includes("Nombre Sensible"),false);
  assert.equal(serialized.includes("Otro Nombre"),false);
  assert.equal(serialized.includes("privado"),false);
});

test("syncNow: todos los retornos sanos actualizan lastSyncAt",async()=>{
  const cases=[
    {
      direction:"none",
      harness:()=>syncHarness({
        remote:{revision:2,checksum:"same",payload:{syncProtocolVersion:2,functionalChecksum:"functional-same"}},
        localRevision:2,lastRemoteRevision:2,baseRevision:2
      })
    },
    {
      direction:"download",
      harness:()=>syncHarness({
        remote:{revision:3,checksum:"same",payload:{syncProtocolVersion:2,functionalChecksum:"functional-same"}},
        localRevision:2,lastRemoteRevision:2,baseRevision:2
      })
    },
    {
      direction:"upload",
      harness:()=>syncHarness({remote:null,localRevision:0,lastRemoteRevision:0,baseRevision:0,pending:true})
    }
  ];
  for(const item of cases){
    const harness=item.harness();
    harness.values.set("gymos:lastSyncAt","2026-08-16T08:12:38.433Z");
    const result=await harness.context.runSync();
    assert.equal(result.direction,item.direction);
    assert.notEqual(harness.values.get("gymos:lastSyncAt"),"2026-08-16T08:12:38.433Z");
    assert.ok(Date.parse(harness.values.get("gymos:lastSyncAt"))>0);
  }
});

test("syncNow: retornos tempranos no sanos no actualizan lastSyncAt",async()=>{
  const debug=syncHarness();
  debug.context.isSyncDebugRequested=()=>true;
  debug.values.set("gymos:lastSyncAt","2026-08-16T08:12:38.433Z");
  const debugResult=await debug.context.runSync();
  assert.equal(debugResult.direction,"diagnostic_mode");
  assert.equal(debug.values.get("gymos:lastSyncAt"),"2026-08-16T08:12:38.433Z");
  assert.equal(debug.audits.at(-1).status,"diagnostic_mode");

  const busy=syncHarness();
  busy.context.state.syncInProgress=true;
  busy.values.set("gymos:lastSyncAt","2026-08-16T08:12:38.433Z");
  const busyResult=await busy.context.runSync();
  assert.equal(busyResult.direction,"busy");
  assert.equal(busy.values.get("gymos:lastSyncAt"),"2026-08-16T08:12:38.433Z");
  assert.equal(busy.audits.at(-1).status,"busy");
});

test("sync audit: registra ramas y fingerprints seguros para diagnosticar móvil rojo",async()=>{
  const healthy=syncHarness({
    remote:{
      revision:964,
      checksum:"full-964",
      payload:{
        stable:true,
        syncProtocolVersion:2,
        syncFunctionalChecksumVersion:1,
        functionalChecksum:"functional-same"
      }
    },
    checksum:"full-964",
    localRevision:964,
    lastRemoteRevision:964,
    baseRevision:964,
    pending:false
  });
  await healthy.context.runSync();
  assert.deepEqual(
    healthy.audits.filter(item=>item.action==="sync_trace").map(item=>item.status),
    ["started","remote_fetch","checksum_comparison","none_synced"]
  );
  const checksumTrace=healthy.audits.find(item=>item.status==="checksum_comparison");
  assert.equal(checksumTrace.details.appVersion,"test");
  assert.equal(checksumTrace.details.functionalChecksum.local,"functional-same");
  assert.equal(checksumTrace.details.functionalChecksum.remote,"functional-same");
  assert.equal(checksumTrace.details.remoteRevision,964);
  assert.equal(checksumTrace.details.localRevision,964);
  assert.equal(checksumTrace.details.lastRemoteRevision,964);
  assert.equal(checksumTrace.details.syncBaseRevision,964);
  assert.equal(checksumTrace.details.hasPendingChanges,false);
  assert.equal(JSON.stringify(checksumTrace.details).includes("owner-a"),false);

  const conflict=syncHarness({
    remote:{
      revision:964,
      checksum:"full-964",
      payload:{
        stable:true,
        syncProtocolVersion:2,
        syncFunctionalChecksumVersion:1,
        functionalChecksum:"remote-functional"
      }
    },
    checksum:"local-full",
    localRevision:964,
    lastRemoteRevision:964,
    baseRevision:964,
    pending:false
  });
  await conflict.context.runSync();
  const conflictTrace=conflict.audits.find(item=>item.status==="conflict"&&item.action==="sync_trace");
  assert.equal(conflictTrace.details.branch,"sameRevisionDiverged");
  assert.equal(conflictTrace.details.checksumMode,"functional_v1");
  assert.equal(conflictTrace.details.functionalChecksum.local,"functional-same");
  assert.equal(conflictTrace.details.functionalChecksum.remote,"remote-functional");
  assert.ok(conflictTrace.details.functionalProjectionDiff.diffPaths.length>=1);

  const error=syncHarness({readError:{status:0,code:"network_failed"},pending:true});
  await assert.rejects(()=>error.context.runSync());
  const errorTrace=error.audits.find(item=>item.status==="recoverable_error"&&item.action==="sync_trace");
  assert.equal(errorTrace.details.branch,"recoverable_error");
  assert.equal(errorTrace.details.hasPendingChanges,true);
});

test("sync visual: conflicto real y error recuperable no se limpian sin sync sana",async()=>{
  const conflict=syncHarness({
    remote:{
      revision:964,
      checksum:"full-964",
      payload:{
        stable:true,
        syncProtocolVersion:2,
        syncFunctionalChecksumVersion:1,
        functionalChecksum:"remote-functional"
      }
    },
    checksum:"local-full",
    localRevision:964,
    lastRemoteRevision:964,
    baseRevision:964,
    pending:false,
    initialStatus:"conflict",
    initialIssue:{kind:"sync_conflict",retryable:false}
  });
  const conflictResult=await conflict.context.runSync();
  assert.equal(conflictResult.direction,"conflict");
  assert.equal(conflict.context.state.syncStatus,"conflict");
  assert.equal(conflict.context.state.syncIssue.kind,"sync_conflict");

  const error=syncHarness({
    readError:{status:0,code:"network_failed"},
    pending:true,
    initialStatus:"conflict",
    initialIssue:{kind:"sync_conflict",retryable:false}
  });
  await assert.rejects(()=>error.context.runSync());
  assert.equal(error.context.state.syncStatus,"recoverable_error");
  assert.equal(error.context.state.syncIssue.kind,"network");
  assert.equal(error.context.state.syncIssue.retryable,true);
});

test("sync checksum: los metadatos de envelope no cambian el checksum funcional",()=>{
  const uploaded=buildPayloadChecksumHarness();
  const remotePayload={
    ...uploaded.payload,
    schemaVersion:2,
    revision:964,
    parentRevision:963,
    checksum:"full-964",
    syncProtocolVersion:2,
    syncParentRevision:963,
    syncFunctionalChecksumVersion:1,
    functionalChecksum:uploaded.functionalChecksum
  };
  assert.equal(
    uploaded.context.functionalSyncChecksum(remotePayload),
    uploaded.functionalChecksum
  );
});

test("sync decisión: legacy 916 con ACK completo hace no-op seguro aunque el checksum local difiera",async()=>{
  const harness=syncHarness({
    remote:{
      revision:916,
      checksum:"759d936c",
      payload:{syncProtocolVersion:2,stable:true},
      device_id:"pc"
    },
    checksum:"mobile-derived-checksum",
    localRevision:916,
    lastRemoteRevision:916,
    baseRevision:916,
    pending:false,
    currentProtocol:true
  });
  harness.values.set("gymos:lastSyncHash","759d936c");
  const result=await harness.context.runSync();
  assert.equal(result.direction,"none");
  assert.equal(harness.context.state.syncStatus,"synced");
  assert.equal(harness.values.get("gymos:lastSyncHash"),"759d936c");
  assert.equal(harness.counters.applies,0);
  assert.equal(harness.counters.writeAttempts,0);
});

test("sync decisión: legacy 916 sin ACK completo conserva conflicto por checksum completo",async()=>{
  const harness=syncHarness({
    remote:{
      revision:916,
      checksum:"759d936c",
      payload:{syncProtocolVersion:2,stable:true},
      device_id:"pc"
    },
    checksum:"mobile-derived-checksum",
    localRevision:916,
    lastRemoteRevision:916,
    baseRevision:916,
    pending:false,
    currentProtocol:true
  });
  harness.values.set("gymos:lastSyncHash","otro-checksum");
  const result=await harness.context.runSync();
  assert.equal(result.direction,"conflict");
  assert.equal(result.kind,"sync_conflict");
  assert.equal(harness.counters.applies,0);
  assert.equal(harness.counters.writeAttempts,0);
});

test("sync decisión: ACK legacy no oculta cambios pendientes",async()=>{
  const harness=syncHarness({
    remote:{
      revision:916,
      checksum:"759d936c",
      payload:{syncProtocolVersion:2,stable:true},
      device_id:"pc"
    },
    checksum:"mobile-derived-checksum",
    localRevision:916,
    lastRemoteRevision:916,
    baseRevision:916,
    pending:true,
    currentProtocol:true
  });
  harness.values.set("gymos:lastSyncHash","759d936c");
  const result=await harness.context.runSync();
  assert.equal(result.direction,"upload");
  assert.equal(result.revision,917);
  assert.equal(harness.counters.writeAttempts,1);
});

test("sync decisión: remoto v1 funcional usa functionalChecksum y no checksum completo",async()=>{
  const harness=syncHarness({
    remote:{
      revision:917,
      checksum:"full-checksum-pc",
      payload:{
        syncProtocolVersion:2,
        syncFunctionalChecksumVersion:1,
        functionalChecksum:"functional-same",
        stable:true
      },
      device_id:"pc"
    },
    checksum:"full-checksum-mobile",
    localRevision:917,
    lastRemoteRevision:917,
    baseRevision:917,
    pending:false,
    currentProtocol:true
  });
  const result=await harness.context.runSync();
  assert.equal(result.direction,"none");
  assert.equal(harness.values.get("gymos:lastSyncHash"),"full-checksum-pc");
  assert.equal(harness.counters.applies,0);
  assert.equal(harness.counters.writeAttempts,0);
});

test("sync decisión: misma revisión con functionalChecksum distinto sigue siendo conflicto real",async()=>{
  const harness=syncHarness({
    remote:{
      revision:917,
      checksum:"full-checksum-pc",
      payload:{
        syncProtocolVersion:2,
        syncFunctionalChecksumVersion:1,
        functionalChecksum:"functional-remoto",
        stable:true
      },
      device_id:"pc"
    },
    checksum:"full-checksum-mobile",
    localRevision:917,
    lastRemoteRevision:917,
    baseRevision:917,
    pending:false,
    currentProtocol:true
  });
  const result=await harness.context.runSync();
  assert.equal(result.direction,"conflict");
  assert.equal(result.kind,"sync_conflict");
  assert.equal(harness.counters.applies,0);
  assert.equal(harness.counters.writeAttempts,0);
});

test("RC2 diferencia los ocho estados y ofrece reintento solo para errores recuperables",()=>{
  for(const status of [
    "synced","pending","syncing","offline","conflict",
    "session_expired","permission_denied","recoverable_error"
  ]) assert.match(appSource,new RegExp(`${status}:|"${status}"`),status);
  const navigation=functionSource("nav","closeNavigationPanel");
  assert.match(navigation,/Boolean\(state\.syncIssue\?\.retryable\)&&navigator\.onLine/);
  assert.match(navigation,/data-shell-action="sync-retry"/);
  assert.match(navigation,/data-sync-description/);
});

test("RC2 la topbar usa estados comprensibles y no confunde sesión con sincronización",()=>{
  const source=functionSource("syncStatusLabel","classifySyncError");
  const context={state:{syncStatus:"synced"}};
  vm.createContext(context);
  vm.runInContext(`${source}; label=syncStatusLabel;`,context);
  const expected={
    synced:"Sincronizado",
    syncing:"Sincronizando…",
    pending:"Cambios pendientes",
    connected:"Cambios pendientes",
    offline:"Sin conexión",
    conflict:"Conflicto de sincronización",
    recoverable_error:"Error recuperable",
    session_expired:"Sesión caducada",
    permission_denied:"Permiso rechazado"
  };
  for(const [status,label] of Object.entries(expected)){
    context.state.syncStatus=status;
    assert.equal(context.label(),label,status);
  }
  assert.match(stylesSource,/sync-dot\.synced,[\s\S]*background:#059669/);
  assert.match(stylesSource,/sync-dot\.conflict[\s\S]*background:#dc2626/);
});

test("RC2 la navegación lateral agrupa destinos humanos y marca el activo",()=>{
  for(const label of [
    "Entrenamiento","Inicio","Entrenar","Recuperación",
    "Seguimiento","Progreso","Coach","Nutrición",
    "Planificación","Rutina","Biblioteca","Ajustes"
  ]) assert.ok(appSource.includes(label),label);
  assert.match(appSource,/aria-current="page"/);
  assert.match(appSource,/navigationDestinationForScreen/);
  assert.doesNotMatch(functionSource("nav","closeNavigationPanel"),/>session-[^<]*</);
});

test("RC2 el shell no conserva la barra inferior y responde por breakpoint",()=>{
  assert.doesNotMatch(`${appSource}\n${stylesSource}\n${indexSource}`,/bottom-nav/);
  assert.match(stylesSource,/@media\(min-width:1024px\)/);
  assert.match(stylesSource,/@media\(min-width:768px\) and \(max-width:1023px\)/);
  assert.match(stylesSource,/@media\(max-width:767px\)/);
  assert.match(stylesSource,/width:70px/);
  assert.match(stylesSource,/width:248px/);
  assert.match(stylesSource,/width:min\(86vw,288px\)/);
  assert.match(stylesSource,/body\.navigation-panel-open\{overflow:hidden\}/);
});

test("RC2 el drawer ofrece backdrop, Escape, diálogo y restauración de foco",()=>{
  const shell=appSource.slice(
    appSource.indexOf("function nav("),
    appSource.indexOf("function toast(")
  );
  assert.match(shell,/navigation-backdrop/);
  assert.match(shell,/event\.key!=="Escape"/);
  assert.match(shell,/else if\(navigationPanelOpen\)/);
  assert.match(shell,/setAttribute\("role","dialog"\)/);
  assert.match(shell,/setAttribute\("aria-modal","true"\)/);
  assert.match(shell,/navigationReturnFocus\?\.isConnected/);
  assert.match(shell,/setAttribute\("inert",""\)/);
  assert.match(shell,/setAttribute\("aria-hidden","true"\)/);
  assert.match(shell,/aria-controls="gymosNavigation"/);
  assert.match(shell,/aria-expanded=/);
});

test("RC2 el listener delegado del shell se instala una sola vez",()=>{
  const binding=functionSource("bindNav","toast");
  assert.match(binding,/arrangeNavigationLandmarks\(\)/);
  assert.match(binding,/if\(globalNavigationBound\) return/);
  assert.equal((binding.match(/document\.addEventListener\("click"/g)||[]).length,1);
  assert.match(binding,/navigateToScreen\(button\.dataset\.nav\)/);
  assert.match(binding,/event\.stopPropagation\(\)/);
});

test("RC2 la preferencia de expansión es local y no ensucia datos del propietario",()=>{
  const shell=appSource.slice(
    appSource.indexOf("const NAVIGATION_GROUPS"),
    appSource.indexOf("function toast(")
  );
  assert.match(appSource,/const GYMOS_NAV_EXPANDED_KEY="gymos:deviceNavigationExpanded"/);
  assert.match(shell,/localStorage\.setItem\(GYMOS_NAV_EXPANDED_KEY/);
  assert.doesNotMatch(shell,/markLocalUpdated|saveCurrentUserVault|ownerId|localRevision|updatedAt/);
  const reset=appSource.slice(
    appSource.indexOf("function resetRoutineSessionOwnerState"),
    appSource.indexOf("function assertActiveLocalOwner")
  );
  assert.match(reset,/closeNavigationPanel\(\{restoreFocus:false\}\)/);
  assert.match(reset,/state\.syncOperationId\+=1/);
});

test("RC2 el footer queda dedicado a Ajustes y expansión",()=>{
  const navigation=functionSource("nav","closeNavigationPanel");
  assert.match(navigation,/class="navigation-footer"/);
  assert.doesNotMatch(navigation,/data-shell-action="theme"/);
  assert.doesNotMatch(navigation,/data-shell-action="font"/);
  assert.match(navigation,/NAVIGATION_FOOTER_ITEMS\.map\(\(\[screen,icon,label\]\)=>navigationItem\(screen,icon,label,active\)\)/);
  assert.match(navigation,/class="navigation-item navigation-expand-button"/);
  const rail=navigation.slice(navigation.indexOf("<aside"),navigation.indexOf("navigation-backdrop"));
  assert.doesNotMatch(rail,/sync-detail|accountEmail|data-shell-action="signout"/);
  assert.doesNotMatch(appSource,/id="homeThemeToggle"|id="homeFontScaleToggle"|sync-badge/);
});

test("RC2 Ajustes conserva tema, cuatro tamaños, contraste y reducción de movimiento",()=>{
  const settings=appSource.slice(
    appSource.indexOf("function renderSettings("),
    appSource.indexOf("function exportData(")
  );
  assert.match(settings,/id="appTheme"/);
  assert.match(settings,/id="appFontScale"/);
  for(const size of ["small","normal","large","xlarge"]){
    assert.match(settings,new RegExp(`option value="${size}"`));
  }
  assert.match(settings,/id="highContrastUi"/);
  assert.match(settings,/id="reduceMotionUi"/);
  assert.match(settings,/saveAppPreferences\(\{animations:!e\.target\.checked\}\)/);
});

test("RC2 el correo del bloque de cuenta se escapa, trunca y no se persiste",()=>{
  const navigation=functionSource("nav","closeNavigationPanel");
  assert.match(navigation,/const accountEmail=String\(state\.syncUser\?\.email\|\|""\)\.trim\(\)/);
  assert.ok((navigation.match(/esc\(accountEmail\)/g)||[]).length>=2);
  assert.match(navigation,/title="\$\{esc\(accountEmail\)\}"/);
  assert.match(stylesSource,/shell-account-identity strong,.shell-account-identity span\{[\s\S]*text-overflow:ellipsis;white-space:nowrap/);
  assert.doesNotMatch(navigation,/localStorage\.(?:setItem|getItem)\([^)]*(?:email|accountEmail)/i);
});

test("RC2 la cuenta está en la topbar y el cierre queda dentro de su menú",()=>{
  const navigation=functionSource("nav","closeNavigationPanel");
  const groups=appSource.slice(
    appSource.indexOf("const NAVIGATION_GROUPS"),
    appSource.indexOf("let navigationPanelOpen")
  );
  assert.doesNotMatch(groups,/\["account"/);
  assert.match(navigation,/data-shell-action="account-menu" aria-label="Abrir menú de cuenta"/);
  assert.match(navigation,/class="shell-signout-action" data-shell-action="signout">Cerrar sesión/);
  assert.match(stylesSource,/\.shell-account-trigger/);
  assert.match(stylesSource,/\.shell-account-panel/);
});

test("RC2 el pie es fijo y solo la navegación central puede desplazarse",()=>{
  assert.match(stylesSource,/navigation-groups\{[\s\S]*flex:1;min-height:0;[\s\S]*overflow:visible/);
  assert.match(stylesSource,/@media\(max-height:660px\)\{[\s\S]*overflow-y:auto/);
  assert.match(stylesSource,/navigation-footer\{flex:0 0 auto/);
  assert.match(stylesSource,/scrollbar-gutter:stable/);
  assert.match(stylesSource,/navigation-groups::-webkit-scrollbar\{width:4px\}/);
  assert.match(stylesSource,/padding-right:8px/);
});

test("RC2 el cambio de propietario renueva cuenta y estado sin conservar el menú",()=>{
  const navigation=functionSource("nav","closeNavigationPanel");
  const reset=appSource.slice(
    appSource.indexOf("function resetRoutineSessionOwnerState"),
    appSource.indexOf("function assertActiveLocalOwner")
  );
  assert.match(navigation,/state\.syncUser\?\.email/);
  assert.match(reset,/state\.syncIssue=null/);
  assert.match(reset,/state\.syncStatus=navigator\.onLine\?"local":"offline"/);
  assert.match(reset,/closeNavigationPanel\(\{restoreFocus:false\}\)/);
});

test("RC2 cerrar sesión cierra el menú, invalida lo privado y vuelve a Cuenta",()=>{
  const binding=functionSource("bindNav","toast");
  const signOut=appSource.slice(
    appSource.indexOf("async function signOutSync"),
    appSource.indexOf("function bodyMeasurementToDatabase")
  );
  assert.match(binding,/closeNavigationPanel\(\{restoreFocus:false\}\)/);
  assert.match(binding,/signOutSync\(\)\.then\(\(\)=>\{[\s\S]*state\.screen="account";[\s\S]*render\(\)/);
  assert.match(signOut,/resolveAuthenticatedAppState\(null\)/);
  assert.match(appSource,/if\(previousAuthorizedUserId\) deactivateLocalUser\(\)/);
});

test("RC2 respeta foco visible y movimiento reducido",()=>{
  assert.match(stylesSource,/:focus-visible/);
  assert.match(stylesSource,/@media\s*\(prefers-reduced-motion:reduce\)/);
  assert.match(stylesSource,/transition-duration:\.01ms!important/);
});

test("RC2 actualiza el caché y mantiene Supabase fuera de Cache Storage",()=>{
  assert.match(workerSource,/const GYMOS_BUILD_VERSION="4\.2\.0-rc\.13-sync-audit-last-sync"/);
  assert.match(workerSource,/const CACHE=`gymos-cache-\$\{GYMOS_BUILD_VERSION\}`/);
  assert.match(workerSource,/e\.request\.method!=="GET"\|\|url\.origin!==self\.location\.origin/);
  assert.match(workerSource,/keys\.filter\(key=>key\.startsWith\("gymos-cache-"\)&&key!==CACHE\)/);
  const fetchHandler=workerSource.slice(workerSource.indexOf('self.addEventListener("fetch"'));
  assert.doesNotMatch(fetchHandler,/supabase|auth|gymos_sync/i);
});

test("RC2 navegar no escribe rutina, historial, drafts ni sincronización",()=>{
  const navigation=appSource.slice(
    appSource.indexOf("const NAVIGATION_GROUPS"),
    appSource.indexOf("function toast(")
  );
  assert.doesNotMatch(navigation,/saveRoutine|saveHistory|saveCanonicalRoutine|saveDraft|markLocalUpdated|syncNow\(/);
});

test("RC2 no registra tokens, sesiones completas ni correos en los nuevos errores",()=>{
  const sync=appSource.slice(
    appSource.indexOf("async function syncNow"),
    appSource.indexOf("function dateKey")
  );
  assert.doesNotMatch(sync,/console\.(?:log|error|warn)\([^)]*(?:token|email|session|payload|userId)/i);
  assert.doesNotMatch(sync,/JSON\.stringify\(error|console\.error\([^,]+,\s*state\.syncSession/);
});
