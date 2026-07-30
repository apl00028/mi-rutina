const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const root=path.resolve(__dirname,"..");
const appSource=fs.readFileSync(path.join(root,"app.js"),"utf8");
const stylesSource=fs.readFileSync(path.join(root,"styles.css"),"utf8");

function sourceBetween(start,end){
  const from=appSource.indexOf(start);
  const to=appSource.indexOf(end,from+start.length);
  assert.ok(from>=0,`No se encontró ${start}`);
  assert.ok(to>from,`No se encontró ${end}`);
  return appSource.slice(from,to);
}

const shellSource=sourceBetween("function nav(","function closeNavigationPanel");
const bindingSource=sourceBetween("function bindNav(","function toast(");

test("shell: la topbar global deriva títulos humanos del destino autoritativo",()=>{
  assert.match(shellSource,/class="shell-global-topbar"/);
  assert.match(shellSource,/const context=shellScreenContext\(\)/);
  assert.match(shellSource,/\$\{esc\(context\.title\)\}/);
  for(const title of [
    "Inicio","Entrenar","Progreso","Coach","Nutrición","Rutina",
    "Biblioteca","Recuperación","Cuenta","Ajustes"
  ]) assert.ok(appSource.includes(`${title}`),title);
  assert.match(appSource,/const destination=navigationDestinationForScreen\(screen\)/);
  assert.match(shellSource,/context\.route/);
});

test("shell: el saludo de Inicio es contenido contextual y queda fuera de la topbar",()=>{
  const home=sourceBetween("function renderHome()","function renderWorkout(");
  assert.match(home,/class="home-context-header"/);
  assert.match(home,/id="homeGreetingTitle"/);
  assert.doesNotMatch(home,/class="topbar home-topbar"/);
  const globalHeader=shellSource.slice(
    shellSource.indexOf('<header class="shell-global-topbar">'),
    shellSource.indexOf("</header>")+9
  );
  assert.doesNotMatch(globalHeader,/homeGreeting|homeDateLabel|homeTodayDescription/);
});

test("shell: sincronización reutiliza state.syncStatus y su detalle existente",()=>{
  assert.match(shellSource,/state\.syncStatus/);
  assert.match(shellSource,/syncStatusLabel\(\)/);
  assert.match(shellSource,/syncStatusDescription\(\)/);
  assert.match(shellSource,/id="shellSyncPanel"/);
  assert.match(shellSource,/data-shell-action="sync-retry"/);
  assert.match(bindingSource,/retrySyncFromNavigation\(\)/);
  assert.doesNotMatch(shellSource,/localStorage\.setItem\([^)]*syncStatus/);
  for(const label of [
    "Sincronizado","Sincronizando","Cambios pendientes","Sin conexión",
    "Conflicto de sincronización","Sesión caducada","Permiso rechazado","Error recuperable"
  ]) assert.ok(appSource.includes(label),label);
});

test("shell: existe un único botón global Apariencia y usa las preferencias actuales",()=>{
  assert.equal((shellSource.match(/class="shell-appearance-trigger"/g)||[]).length,1);
  assert.match(shellSource,/const appearance=getAppPreferences\(\)/);
  for(const key of ["theme","fontScale","highContrast","animations"]){
    assert.match(shellSource,new RegExp(`data-shell-appearance="${key}"`));
  }
  assert.match(bindingSource,/saveAppPreferences\(\{\s*\[appearanceButton\.dataset\.shellAppearance\]/);
  assert.match(bindingSource,/saveAppPreferences\(\{\[key\]:value\}\)/);
  assert.doesNotMatch(shellSource,/GYMOS_APPEARANCE_KEY|GYMOS_FONT_SCALE_KEY/);
});

test("shell: saveAppPreferences no escribe si la operación es idempotente",()=>{
  const saveSource=sourceBetween("function saveAppPreferences(","const DAILY_THOUGHT_STORAGE_KEY");
  let current={
    mode:"user",theme:"system",accent:"violet",density:"comfortable",
    fontScale:"normal",highContrast:false,largeTapTargets:false,
    compact:false,animations:true,dailyThought:"automatic"
  };
  let writes=0;
  const context={
    APP_PREFERENCES_KEY:"gymos:appPreferences",
    getAppPreferences:()=>({...current}),
    applyAppPreferences:()=>{},
    localStorage:{setItem(_key,value){writes+=1;current=JSON.parse(value);}},
    JSON
  };
  vm.createContext(context);
  vm.runInContext(`${saveSource}; save=saveAppPreferences;`,context);
  const same=context.save({theme:"system"});
  assert.equal(same.changed,false);
  assert.equal(writes,0);
  const changed=context.save({theme:"dark"});
  assert.equal(changed.changed,true);
  assert.equal(writes,1);
});

test("shell: el menú de cuenta contiene identidad segura y acciones humanas",()=>{
  assert.match(shellSource,/id="shellAccountPanel"/);
  assert.match(shellSource,/\$\{esc\(accountName\)\}/);
  assert.ok((shellSource.match(/esc\(accountEmail\)/g)||[]).length>=2);
  assert.match(shellSource,/title="\$\{esc\(accountEmail\)\}"/);
  assert.match(shellSource,/>Mi cuenta</);
  assert.match(shellSource,/>Ajustes</);
  assert.match(shellSource,/>Cerrar sesión</);
  assert.doesNotMatch(shellSource,/syncUser\?\.id|UUID|ID interno/);
  assert.doesNotMatch(shellSource,/console\.(?:log|error)[^;]*accountEmail/);
});

test("shell: cerrar sesión usa el flujo oficial y no es una acción permanente",()=>{
  const globalHeader=shellSource.slice(
    shellSource.indexOf('<header class="shell-global-topbar">'),
    shellSource.indexOf("</header>")+9
  );
  assert.doesNotMatch(globalHeader,/signout|Cerrar sesión/);
  assert.match(bindingSource,/action==="signout"&&confirm/);
  assert.match(bindingSource,/signOutSync\(\)\.then/);
  const signOut=sourceBetween("async function signOutSync(","function bodyMeasurementToDatabase");
  assert.match(signOut,/client\.auth\.signOut\(\)/);
  assert.match(signOut,/resolveAuthenticatedAppState\(null\)/);
});

test("shell: la barra lateral contiene únicamente navegación, Ajustes y expansión",()=>{
  const rail=shellSource.slice(shellSource.indexOf("<aside"),shellSource.indexOf("navigation-backdrop"));
  assert.match(rail,/navigation-groups/);
  assert.match(rail,/NAVIGATION_FOOTER_ITEMS\.map\(\(\[screen,icon,label\]\)=>navigationItem\(screen,icon,label,active\)\)/);
  assert.match(rail,/navigation-expand-button/);
  assert.doesNotMatch(rail,/sync-detail|accountEmail|Cerrar sesión|Apariencia|fontScale|highContrast/);
  assert.match(appSource,/aria-current="page"/);
});

test("shell: escritorio, tablet y móvil mantienen una topbar compacta",()=>{
  assert.match(stylesSource,/@media\(min-width:1024px\)/);
  assert.match(stylesSource,/@media\(min-width:768px\) and \(max-width:1023px\)/);
  assert.match(stylesSource,/@media\(max-width:767px\)/);
  assert.match(stylesSource,/\.shell-global-topbar\{[\s\S]*grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(stylesSource,/@media\(max-width:767px\)\{[\s\S]*grid-template-columns:42px minmax\(0,1fr\) auto/);
  assert.match(stylesSource,/\.shell-action-label,.shell-appearance-trigger,.shell-account-chevron\{display:none\}/);
  assert.match(stylesSource,/\.shell-screen-context span\{display:none\}/);
  assert.match(stylesSource,/width:100%;max-width:none/);
});

test("shell: paneles cierran con Escape o clic exterior y restauran foco",()=>{
  assert.match(bindingSource,/if\(event\.key!=="Escape"\) return/);
  assert.match(bindingSource,/closeShellPopover\(\)/);
  assert.match(bindingSource,/!event\.target\.closest\?\.\("\.shell-popover"\)/);
  assert.match(shellSource,/shellPanelReturnAction/);
  assert.match(shellSource,/querySelector\(`\[data-shell-action="\$\{returnAction\}"\]`\)\?\.focus\(\)/);
  assert.match(shellSource,/aria-expanded="\$\{navigationSyncDetailOpen\}"/);
  assert.match(shellSource,/aria-expanded="\$\{shellAppearancePanelOpen\}"/);
  assert.match(shellSource,/aria-expanded="\$\{shellAccountPanelOpen\}"/);
});

test("shell: los listeners son únicos y navegar no escribe datos funcionales",()=>{
  assert.match(bindingSource,/if\(globalNavigationBound\) return/);
  assert.equal((bindingSource.match(/document\.addEventListener\("click"/g)||[]).length,1);
  assert.equal((bindingSource.match(/document\.addEventListener\("change"/g)||[]).length,1);
  const navigate=sourceBetween("function navigateToScreen(","function bindNav(");
  assert.doesNotMatch(navigate,/saveRoutine|saveHistory|saveDraft|markLocalUpdated|localStorage\.setItem/);
  assert.match(navigate,/render\(\)/);
});

test("shell: cambiar de propietario cierra drawer y todos los paneles globales",()=>{
  const reset=sourceBetween("function resetRoutineSessionOwnerState(","function assertActiveLocalOwner");
  assert.match(reset,/closeShellPopover\(\{restoreFocus:false,renderShell:false\}\)/);
  assert.match(reset,/closeNavigationPanel\(\{restoreFocus:false\}\)/);
  assert.match(reset,/state\.syncOperationId\+=1/);
});
