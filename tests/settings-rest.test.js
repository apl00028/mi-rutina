"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const root=path.resolve(__dirname,"..");
const appSource=fs.readFileSync(path.join(root,"app.js"),"utf8");
const stylesSource=fs.readFileSync(path.join(root,"styles.css"),"utf8");

function loadRestPreference(initial=120,{changeOwnerAtAssert=0}={}){
  const start=appSource.indexOf("function getRestSeconds(");
  const end=appSource.indexOf("function getWeeklyGoal(",start);
  assert.ok(start>=0&&end>start);
  const values=new Map([
    ["gymos:restSeconds",String(initial)],
    ["gymos:updatedAt","2026-07-29T10:00:00.000Z"]
  ]);
  let owner="owner-a";
  let assertions=0;
  let marks=0;
  const context={
    state:{syncStatus:"synced"},
    localStorage:{
      getItem:key=>values.has(key)?values.get(key):null,
      setItem:(key,value)=>values.set(key,String(value)),
      removeItem:key=>values.delete(key)
    },
    currentRoutineOwnerOrNull:()=>owner,
    assertActiveLocalOwner:expected=>{
      assertions+=1;
      if(changeOwnerAtAssert===assertions) owner="owner-b";
      if(expected!==owner) throw new Error("owner_changed");
    },
    markLocalUpdated:()=>{
      marks+=1;
      values.set("gymos:updatedAt","2026-07-29T11:00:00.000Z");
      values.set("gymos:syncPending","1");
    },
    restoreStorageValue:(key,value)=>{
      if(value===null||value===undefined) values.delete(key);
      else values.set(key,value);
    }
  };
  vm.createContext(context);
  vm.runInContext(`${appSource.slice(start,end)}; read=getRestSeconds; write=saveRestSeconds;`,context);
  return {
    read:()=>context.read(),
    write:value=>context.write(value),
    values,
    marks:()=>marks,
    status:()=>context.state.syncStatus
  };
}

test("descanso cambia de 120 a 60 y persiste una sola vez",()=>{
  const rest=loadRestPreference(120);
  const result=rest.write(60);
  assert.equal(result.changed,true);
  assert.equal(rest.read(),60);
  assert.equal(rest.values.get("gymos:restSeconds"),"60");
  assert.equal(rest.marks(),1);
});

test("descanso cambia de 60 a 90 y se rehidrata desde la misma fuente",()=>{
  const rest=loadRestPreference(60);
  rest.write(90);
  assert.equal(rest.read(),90);
  assert.equal(rest.values.get("gymos:restSeconds"),"90");
  assert.equal(rest.marks(),1);
});

test("pulsar el descanso ya activo no reescribe ni ensucia sincronización",()=>{
  const rest=loadRestPreference(90);
  const beforeUpdated=rest.values.get("gymos:updatedAt");
  const result=rest.write(90);
  assert.equal(result.changed,false);
  assert.equal(rest.marks(),0);
  assert.equal(rest.values.get("gymos:updatedAt"),beforeUpdated);
  assert.equal(rest.values.has("gymos:syncPending"),false);
  assert.equal(rest.status(),"synced");
});

test("un cambio de propietario durante el writer restaura el valor exacto",()=>{
  const rest=loadRestPreference(120,{changeOwnerAtAssert:2});
  const before=Object.fromEntries(rest.values);
  assert.throws(()=>rest.write(60),/owner_changed/);
  assert.deepEqual(Object.fromEntries(rest.values),before);
  assert.equal(rest.marks(),0);
});

test("el selector ofrece cuatro botones reales y una sola selección accesible",()=>{
  const settings=appSource.slice(
    appSource.indexOf("function renderSettings("),
    appSource.indexOf("function exportData(")
  );
  assert.match(settings,/\[60,90,120,180\]/);
  assert.match(settings,/<button type="button" class="rest-option/);
  assert.match(settings,/aria-pressed="\$\{getRestSeconds\(\)===value\}"/);
  for(const label of ["1 min","1:30","2 min","3 min"]) assert.ok(settings.includes(label),label);
  assert.match(stylesSource,/rest-option\[aria-pressed="true"\]::before\{content:"✓ "/);
});

test("renderizar Ajustes no acumula listeners ni exige submit",()=>{
  const settings=appSource.slice(
    appSource.indexOf("function renderSettings("),
    appSource.indexOf("function exportData(")
  );
  assert.equal((settings.match(/querySelectorAll\("\[data-rest-setting\]"\)\.forEach\(button=>button\.onclick=/g)||[]).length,1);
  assert.doesNotMatch(settings,/addEventListener\([^)]*(?:data-rest-setting|rest-setting)/);
  assert.doesNotMatch(settings,/<form|type="submit"/);
  assert.match(settings,/if\(state\.restPreferenceBusy\) return/);
  assert.match(settings,/finally\{\s*state\.restPreferenceBusy=false/);
});

test("cambiar el descanso no modifica el temporizador que ya está en marcha",()=>{
  const writer=appSource.slice(
    appSource.indexOf("function saveRestSeconds("),
    appSource.indexOf("function getWeeklyGoal(")
  );
  assert.doesNotMatch(writer,/timerSeconds|timerInterval|startTimer|clearInterval/);
  assert.match(appSource,/Un temporizador que ya esté en marcha conserva su tiempo actual/);
});

test("la preferencia existente continúa en sync, backup y vault sin clave nueva",()=>{
  assert.match(appSource,/localStorage\.getItem\("gymos:restSeconds"\)/);
  assert.match(appSource,/restSeconds:getRestSeconds\(\)/);
  assert.match(appSource,/"gymos:restSeconds"/);
  assert.doesNotMatch(appSource,/gymos:(?:trainingRest|restPreference|defaultRest)/);
});

test("Ajustes expone las seis secciones y ubica descanso en Entrenamiento",()=>{
  const organizer=appSource.slice(
    appSource.indexOf("function organizeSettingsScreen("),
    appSource.indexOf("function renderSettings(")
  );
  for(const title of [
    "Cuenta y sincronización","Apariencia","Entrenamiento",
    "Rutina y planificación","Datos","Avanzado"
  ]) assert.ok(organizer.includes(title),title);
  const training=organizer.slice(
    organizer.indexOf('id:"training"'),
    organizer.indexOf('id:"routine-planning"')
  );
  assert.match(training,/cardFor\("#trainingRestSettings"\)/);
  assert.match(appSource,/organizeSettingsScreen\(document\.querySelector\("\.settings-screen"\)\)/);
});

test("Cuenta y sincronización presenta estado, reintento y cierre de sesión",()=>{
  const settings=appSource.slice(
    appSource.indexOf("function renderSettings("),
    appSource.indexOf("function exportData(")
  );
  assert.match(settings,/class="settings-account-sync-row"/);
  assert.match(settings,/data-sync-label/);
  assert.match(settings,/id="settingsSyncRetry"/);
  assert.match(settings,/id="settingsSignOut"/);
});

test("la reorganización conserva el destino Ajustes de la navegación principal",()=>{
  const navigation=appSource.slice(
    appSource.indexOf("function nav("),
    appSource.indexOf("function closeNavigationPanel")
  );
  assert.match(navigation,/NAVIGATION_FOOTER_ITEMS\.map\(\(\[screen,icon,label\]\)=>navigationItem\(screen,icon,label,active\)\)/);
  assert.match(appSource,/else renderSettings\(\)/);
});
