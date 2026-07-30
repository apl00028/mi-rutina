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

function syncHarness({remote=null,readError=null,pending=false,online=true,recoverySync=null,checksum="same"}={}){
  const source=appSource.slice(
    appSource.indexOf("async function syncNow"),
    appSource.indexOf("async function autoSync")
  );
  const values=new Map([
    ["gymos:localRevision","2"],
    ["gymos:lastRemoteRevision","2"],
    ...(pending?[["gymos:syncPending","1"]]:[])
  ]);
  const counters={reads:0,writes:0,applies:0};
  const query={
    select(){return this;},
    eq(){return this;},
    async maybeSingle(){counters.reads+=1;return {data:remote,error:readError};}
  };
  const client={
    from(){return query;},
  };
  query.upsert=async()=>{counters.writes+=1;return {error:null};};
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
    chooseConflictResolution:async()=>"remote",
    applySyncPayload:()=>{counters.applies+=1;},
    buildSyncEnvelope:()=>{
      const revision=Number(values.get("gymos:localRevision")||0)+1;
      values.set("gymos:localRevision",String(revision));
      return {
        payload:{stable:true},revision,deviceId:"device",
        checksum:"same",updatedAt:"2026-07-29T10:00:00.000Z"
      };
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
  return {context,values,counters};
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
  assert.ok((sync.match(/localStorage\.removeItem\("gymos:syncPending"\)/g)||[]).length>=3);
  assert.match(sync,/localStorage\.setItem\("gymos:lastSyncHash",envelope\.checksum\)/);
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
  assert.equal(result.direction,"download");
  assert.equal(harness.counters.applies,1);
  assert.equal(harness.counters.writes,0);
  assert.equal(harness.values.has("gymos:syncPending"),false);
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
  assert.match(workerSource,/const CACHE="gymos-cache-4\.2\.0-routine-hub"/);
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
