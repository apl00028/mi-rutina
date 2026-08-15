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
  currentProtocol=true,writeError=null,writeConflict=false,sharedRemote=null
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
  let remoteState=sharedRemote?sharedRemote.state:(remote?JSON.parse(JSON.stringify(remote)):null);
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
      syncIssue:null,syncStatus:"connected"
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
    addSyncAudit:()=>{},
    buildSyncPayload:()=>({stable:true}),
    simpleChecksum:()=>checksum,
    getLocalRevision:()=>Number(values.get("gymos:localRevision")||0),
    setLocalRevision:value=>values.set("gymos:localRevision",String(value)),
    getLastRemoteRevision:()=>Number(values.get("gymos:lastRemoteRevision")||0),
    setLastRemoteRevision:value=>values.set("gymos:lastRemoteRevision",String(value)),
    getSyncBaseRevision:()=>Number(values.get("gymos:syncBaseRevision")||0),
    setSyncBaseRevision:value=>values.set("gymos:syncBaseRevision",String(value)),
    markSyncProtocolCurrent:()=>values.set("gymos:syncProtocolVersion","2"),
    isLocalSyncProtocolCurrent:()=>Number(values.get("gymos:syncProtocolVersion")||0)>=2,
    isRemoteSyncProtocolCurrent:row=>Number(row?.payload?.syncProtocolVersion||0)>=2,
    chooseConflictResolution:async()=>"remote",
    applySyncPayload:()=>{counters.applies+=1;},
    buildSyncEnvelope:(base,candidate)=>{
      return {
        payload:{stable:true,syncProtocolVersion:2,syncParentRevision:base},
        revision:candidate,parentRevision:base,deviceId:"device",
        checksum:"same",updatedAt:"2026-07-29T10:00:00.000Z"
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
  return {context,values,counters,get remote(){return sharedRemote?sharedRemote.state:remoteState;}};
}

function casHarness({updateResponse=null,insertResponse=null}={}){
  const source=appSource.slice(
    appSource.indexOf("function syncConflictError"),
    appSource.indexOf("async function syncNow")
  );
  const calls=[];
  const makeQuery=response=>({
    eq(column,value){calls.push(["eq",column,value]);return this;},
    async select(columns){calls.push(["select",columns]);return response;}
  });
  const client={
    from(table){
      calls.push(["from",table]);
      return {
        update(record,options){
          calls.push(["update",record,options]);
          return makeQuery(updateResponse||{data:[{revision:913}],count:1,error:null});
        },
        insert(record,options){
          calls.push(["insert",record,options]);
          return makeQuery(insertResponse||{data:[{revision:1}],count:1,error:null});
        }
      };
    }
  };
  const context={client,calls};
  vm.createContext(context);
  vm.runInContext(`${source}; this.write=writeSyncEnvelopeWithCas;`,context);
  return context;
}

function recoveryHarness({
  remote={
    revision:912,checksum:"a455414f",device_id:"mobile",
    updated_at:"2026-08-15T10:00:00.000Z",
    payload:{source:"remote",canonicalRoutine:{routineId:"routine-0916"}}
  },
  localOverrides={},writeError=null
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
    writeSyncEnvelopeWithCas:async(_client,userId,envelope,base,exists,expectedChecksum)=>{
      writeCalls.push({
        userId,envelope,base,exists,expectedChecksum,
        localRevisionBefore:values.get("gymos:localRevision")
      });
      if(writeError) throw writeError;
      return {revision:envelope.revision};
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
        href:"",download:"",
        click(){downloads.push({payload:JSON.parse(lastDownloadPayloadText),fileName:this.download});},
        remove(){}
      })
    },
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
  const remote={
    revision:913,
    checksum:"759d936c",
    device_id:"pc-device",
    updated_at:"2026-08-15T10:00:00.000Z",
    payload:{
      source:"remote-pc",
      syncProtocolVersion:2,
      canonicalRoutine:{routineId:"routine-02488c9c-d38e-4b59-8814-f7e0bcbd7d5e"},
      selectedSessionId:"roadmap-2026-08-a",
      history:["remote-history"]
    },
    ...remoteOverrides
  };
  if(remoteOverrides.payload){
    remote.payload={...remote.payload,...remoteOverrides.payload};
  }
  const values=new Map([
    ["gymos:deviceId","mobile-device"],
    ["gymos:localRevision","914"],
    ["gymos:lastRemoteRevision","912"],
    ["gymos:syncBaseRevision","912"],
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
  const counters={apply:0,syncNow:0,autoSync:0};
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
  const client={from(){return query;}};
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
    applySyncPayload:payload=>{
      counters.apply+=1;
      values.set("gymos:routine:canonical",JSON.stringify(payload.canonicalRoutine));
      values.set("gymos:selectedSessionId",payload.selectedSessionId);
      values.set("gymos:history",JSON.stringify(payload.history||[]));
      values.set("gymos:deviceId",remote.device_id);
      values.set("gymos:partialDuringApply","1");
      if(applyError) throw applyError;
      values.delete("gymos:partialDuringApply");
    },
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
  return {context,values,writes,remoteWrites,counters,snapshot:()=>new Map(values)};
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
  assert.match(sync,/if\(state\.syncInProgress\) return \{direction:"busy"\}/);
  assert.match(sync,/remote&&!hasPendingChanges&&!options\.forceUpload&&remoteRevision===localRevision&&remote\.checksum===localChecksum/);
  assert.match(sync,/return \{direction:"none",revision:remoteRevision\}/);
  assert.ok((sync.match(/localStorage\.removeItem\("gymos:syncPending"\)/g)||[]).length>=2);
  assert.match(sync,/localStorage\.setItem\("gymos:lastSyncHash",envelope\.checksum\)/);
  assert.match(sync,/writeSyncEnvelopeWithCas\(client,userId,envelope,baseRevision,Boolean\(remote\)\)/);
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

test("sync v2 CAS usa count exact y valida exactamente una fila actualizada",async()=>{
  const harness=casHarness();
  const result=await harness.write(
    harness.client,"user-a",
    {payload:{},revision:913,deviceId:"device",checksum:"same",updatedAt:"2026-08-15T10:00:00.000Z"},
    912,true
  );
  assert.equal(result.revision,913);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.calls.find(call=>call[0]==="update")[2])),{count:"exact"});
  assert.deepEqual(harness.calls.filter(call=>call[0]==="eq").map(call=>call.slice(1)),[
    ["user_id","user-a"],["revision",912]
  ]);
});

test("sync v2 CAS convierte update count 0 en sync_conflict",async()=>{
  const harness=casHarness({updateResponse:{data:[],count:0,error:null}});
  await assert.rejects(
    ()=>harness.write(
      harness.client,"user-a",
      {payload:{},revision:913,deviceId:"device",checksum:"same",updatedAt:"2026-08-15T10:00:00.000Z"},
      912,true
    ),
    error=>error.code==="sync_conflict"
  );
});

test("sync v2 CAS no interpreta data vacía como éxito aunque no venga count fiable",async()=>{
  const harness=casHarness({updateResponse:{data:[],count:null,error:null}});
  await assert.rejects(
    ()=>harness.write(
      harness.client,"user-a",
      {payload:{},revision:913,deviceId:"device",checksum:"same",updatedAt:"2026-08-15T10:00:00.000Z"},
      912,true
    ),
    error=>error.code==="sync_conflict"
  );
});

test("sync v2 CAS clasifica colisión de insert inicial como conflicto",async()=>{
  const harness=casHarness({insertResponse:{data:null,count:null,error:{code:"23505",status:409}}});
  await assert.rejects(
    ()=>harness.write(
      harness.client,"user-a",
      {payload:{},revision:1,deviceId:"device",checksum:"same",updatedAt:"2026-08-15T10:00:00.000Z"},
      0,false
    ),
    error=>error.code==="sync_conflict"
  );
  assert.deepEqual(JSON.parse(JSON.stringify(harness.calls.find(call=>call[0]==="insert")[2])),{count:"exact"});
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
  assert.equal(row.revision,912);
  assert.equal(harness.downloads.length,1);
  assert.match(harness.downloads[0].fileName,/^gymos-remote-sync-backup-/);
  assert.equal(harness.downloads[0].payload.row.payload.source,"remote");
  assert.deepEqual(harness.writes,[]);
  assert.equal(harness.writeCalls.length,0);
});

test("recovery: aborta si remote revision no es 912",async()=>{
  const harness=recoveryHarness({
    remote:{revision:913,checksum:"a455414f",payload:{source:"remote"}}
  });
  await assert.rejects(()=>harness.context.promote(),error=>error.code==="recovery_remote_changed");
  assert.equal(harness.writeCalls.length,0);
  assert.deepEqual(harness.writes,[]);
});

test("recovery: aborta si remote checksum no es el esperado",async()=>{
  const harness=recoveryHarness({
    remote:{revision:912,checksum:"changed",payload:{source:"remote"}}
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

test("recovery: error de red no cambia metadata local",async()=>{
  const harness=recoveryHarness({writeError:{status:503,code:"network_error"}});
  await assert.rejects(()=>harness.context.promote());
  assert.equal(harness.writeCalls.length,1);
  assert.deepEqual(harness.writes,[]);
  assert.equal(harness.values.get("gymos:localRevision"),"419");
});

test("recovery: éxito escribe revisión 913 con protocolo v2 usando payload local",async()=>{
  const harness=recoveryHarness();
  const result=await harness.context.promote();
  assert.equal(result.direction,"recovery_upload");
  assert.equal(result.revision,913);
  assert.equal(harness.writeCalls.length,1);
  const call=harness.writeCalls[0];
  assert.equal(call.base,912);
  assert.equal(call.exists,true);
  assert.equal(call.expectedChecksum,"a455414f");
  assert.equal(call.envelope.revision,913);
  assert.equal(call.envelope.parentRevision,912);
  assert.equal(call.envelope.payload.syncProtocolVersion,2);
  assert.equal(call.envelope.payload.syncParentRevision,912);
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
  assert.equal(harness.values.get("gymos:localRevision"),"913");
  assert.equal(harness.values.get("gymos:lastRemoteRevision"),"913");
  assert.equal(harness.values.get("gymos:syncBaseRevision"),"913");
  assert.equal(harness.values.get("gymos:syncProtocolVersion"),"2");
  assert.equal(harness.values.has("gymos:syncPending"),false);
});

test("recovery adoption: no escribe nunca en Supabase",async()=>{
  const harness=adoptionHarness();
  const result=await harness.context.adopt();
  assert.equal(result.direction,"recovery_download");
  assert.deepEqual(harness.remoteWrites,[]);
});

test("recovery adoption: remoto con revision distinta aborta sin tocar local",async()=>{
  const harness=adoptionHarness({remoteOverrides:{revision:914}});
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

test("recovery adoption: remoto con rutina sesion o protocolo distinto aborta",async()=>{
  for(const payload of [
    {canonicalRoutine:{routineId:"routine-other"}},
    {selectedSessionId:"session-other"},
    {syncProtocolVersion:1}
  ]){
    const harness=adoptionHarness({remoteOverrides:{payload}});
    const before=sortedEntries(harness.snapshot());
    await assert.rejects(()=>harness.context.adopt(),error=>error.code==="recovery_remote_changed");
    assert.deepEqual(sortedEntries(harness.snapshot()),before);
    assert.equal(harness.counters.apply,0);
  }
});

test("recovery adoption: local con base distinta de 912 aborta",async()=>{
  const harness=adoptionHarness({localOverrides:{snapshot:{syncBaseRevision:911}}});
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

test("recovery adoption: fallo de applySyncPayload restaura integramente el estado local",async()=>{
  const harness=adoptionHarness({applyError:Object.assign(new Error("partial apply"),{code:"apply_failed"})});
  const before=sortedEntries(harness.snapshot());
  await assert.rejects(()=>harness.context.adopt(),error=>error.code==="recovery_local_apply_failed");
  assert.deepEqual(sortedEntries(harness.snapshot()),before);
  assert.equal(harness.values.get("gymos:deviceId"),"mobile-device");
  assert.deepEqual(harness.remoteWrites,[]);
});

test("recovery adoption: éxito aplica payload remoto y conserva deviceId móvil",async()=>{
  const harness=adoptionHarness();
  const result=await harness.context.adopt();
  assert.equal(result.revision,913);
  assert.equal(harness.counters.apply,1);
  assert.equal(harness.values.get("gymos:deviceId"),"mobile-device");
  assert.equal(
    JSON.parse(harness.values.get("gymos:routine:canonical")).routineId,
    "routine-02488c9c-d38e-4b59-8814-f7e0bcbd7d5e"
  );
  assert.equal(harness.values.get("gymos:selectedSessionId"),"roadmap-2026-08-a");
});

test("recovery adoption: éxito fija revisiones 913, limpia pending y no ejecuta sync",async()=>{
  const harness=adoptionHarness();
  await harness.context.adopt();
  assert.equal(harness.values.get("gymos:localRevision"),"913");
  assert.equal(harness.values.get("gymos:lastRemoteRevision"),"913");
  assert.equal(harness.values.get("gymos:syncBaseRevision"),"913");
  assert.equal(harness.values.get("gymos:syncProtocolVersion"),"2");
  assert.equal(harness.values.get("gymos:lastSyncHash"),"759d936c");
  assert.equal(harness.values.has("gymos:syncPending"),false);
  assert.equal(harness.counters.syncNow,0);
  assert.equal(harness.counters.autoSync,0);
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

test("sync v2 no queda ningun upsert ciego sobre gymos_sync",()=>{
  const gymosSyncCalls=[...appSource.matchAll(/from\("gymos_sync"\)[\s\S]{0,180}/g)]
    .map(match=>match[0]);
  assert.ok(gymosSyncCalls.length>=4);
  for(const call of gymosSyncCalls) assert.doesNotMatch(call,/\.upsert\(/);
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
  assert.match(workerSource,/const CACHE="gymos-cache-4\.2\.0-rc\.6-excel-catalog"/);
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
