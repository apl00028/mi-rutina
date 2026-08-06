const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const root=path.resolve(__dirname,"..");
const appSource=fs.readFileSync(path.join(root,"app.js"),"utf8");
const stylesSource=fs.readFileSync(path.join(root,"styles.css"),"utf8");

function between(start,end){
  const from=appSource.indexOf(start);
  const to=appSource.indexOf(end,from+start.length);
  assert.ok(from>=0,`No se encontró ${start}`);
  assert.ok(to>from,`No se encontró ${end}`);
  return appSource.slice(from,to);
}

const configurationSource=between("const NAVIGATION_GROUPS=","const NAVIGATION_ICON_PATHS=");
const navigationSource=between("function nav(","function closeNavigationPanel");
const railSource=navigationSource.slice(
  navigationSource.indexOf("<aside"),
  navigationSource.indexOf("navigation-backdrop")
);
const bindingSource=between("function bindNav(","function toast(");

function navigationConfiguration(){
  const context={};
  vm.createContext(context);
  vm.runInContext(
    `${configurationSource};result={groups:NAVIGATION_GROUPS,footer:NAVIGATION_FOOTER_ITEMS};`,
    context
  );
  return JSON.parse(JSON.stringify(context.result));
}

test("sidebar: contiene ocho destinos en el orden definitivo",()=>{
  const {groups}=navigationConfiguration();
  assert.deepEqual(
    groups.flatMap(group=>group.items.map(item=>item[2])),
    ["Inicio","Entrenar","Recuperación","Progreso","Rutinas","Coach","Nutrición","Biblioteca"]
  );
});

test("sidebar: utiliza exactamente tres grupos lógicos",()=>{
  const {groups}=navigationConfiguration();
  assert.deepEqual(groups.map(group=>group.label),["Entrenamiento","Seguimiento","Planificación"]);
  assert.deepEqual(groups.map(group=>group.items.length),[3,4,1]);
});

test("sidebar: Recuperación conserva el destino interno sin mostrar el nombre inglés",()=>{
  const {groups}=navigationConfiguration();
  const recovery=groups.flatMap(group=>group.items).find(item=>item[0]==="recovery");
  assert.deepEqual(recovery,["recovery","recovery","Recuperación"]);
  assert.doesNotMatch(configurationSource,/Recovery Center/);
  assert.match(appSource,/navigationDestinations\(\)\.find\(item=>item\[0\]===destination\)\?\.\[2\]/);
});

test("sidebar: cada destino usa un icono SVG semántico local",()=>{
  const {groups,footer}=navigationConfiguration();
  assert.deepEqual(
    [...groups.flatMap(group=>group.items),...footer].map(item=>item[1]),
    ["home","dumbbell","recovery","progress","routine","coach","nutrition","library","settings"]
  );
  const icons=between("const NAVIGATION_ICON_PATHS=","function navigationIcon(");
  for(const key of [
    "home","dumbbell","recovery","progress","coach","nutrition",
    "routine","library","settings","expand","collapse"
  ]) assert.match(icons,new RegExp(`\\b${key}:`),key);
  assert.match(appSource,/navigationIcon\(icon\)/);
  assert.match(appSource,/<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">/);
  assert.doesNotMatch(configurationSource,/⌂|▶|↗|◇|◌|▤|◉/);
});

test("sidebar: existe una única configuración autoritativa de destinos",()=>{
  assert.equal((appSource.match(/const NAVIGATION_GROUPS=/g)||[]).length,1);
  assert.equal((appSource.match(/const NAVIGATION_FOOTER_ITEMS=/g)||[]).length,1);
  assert.doesNotMatch(appSource,/SHELL_DESTINATION_TITLES/);
  assert.match(appSource,/function navigationDestinations\(\)/);
  assert.match(appSource,/navigationDestinations\(\)\.find\(item=>item\[0\]===destination\)/);
});

test("sidebar: el estado contraído centra iconos y oculta textos sin recortarlos",()=>{
  assert.match(stylesSource,/\.navigation-rail\{[\s\S]*width:70px/);
  assert.match(stylesSource,/navigation-rail:not\(\.expanded\):not\(\.panel-open\) \.navigation-item\{justify-content:center;gap:0;padding-inline:0\}/);
  assert.match(stylesSource,/navigation-rail:not\(\.expanded\):not\(\.panel-open\) \.navigation-label\{width:0;opacity:0\}/);
  assert.match(stylesSource,/navigation-brand-mark\{[\s\S]*width:38px;height:38px/);
});

test("sidebar: el estado expandido usa 248 px y muestra nombres alineados",()=>{
  assert.match(stylesSource,/\.navigation-rail\.expanded\{width:248px\}/);
  assert.match(stylesSource,/\.navigation-item\{[\s\S]*display:flex;align-items:center;gap:10px/);
  assert.match(stylesSource,/body\.navigation-expanded \.app-shell\{padding-left:248px\}/);
  assert.match(stylesSource,/transition:width \.2s ease,transform \.2s ease/);
});

test("sidebar: los títulos de grupo solo aparecen al expandir o abrir el panel",()=>{
  assert.match(stylesSource,/\.navigation-group-title\{[\s\S]*display:none/);
  assert.match(stylesSource,/navigation-rail\.expanded \.navigation-group-title,[\s\S]*navigation-rail\.panel-open \.navigation-group-title\{display:block\}/);
  assert.match(railSource,/class="navigation-group-title"/);
  assert.doesNotMatch(railSource,/tabindex[^>]*navigation-group-title/);
});

test("sidebar: el estado activo combina fondo, peso, icono y aria-current",()=>{
  assert.match(appSource,/const selected=screen===active/);
  assert.match(appSource,/\$\{selected\?'aria-current="page"':""\}/);
  assert.match(stylesSource,/\.navigation-item\.active\{[\s\S]*background:var\(--brand-soft[\s\S]*font-weight:850/);
  assert.match(stylesSource,/\.navigation-item\.active::after/);
  assert.match(stylesSource,/\.navigation-item\.active \.navigation-icon svg\{stroke-width:2\.35\}/);
});

test("sidebar: todos los controles contraídos tienen nombre y tooltip accesible",()=>{
  assert.match(appSource,/aria-label="\$\{esc\(label\)\}" aria-describedby="\$\{tooltipId\}"/);
  assert.match(appSource,/role="tooltip">\$\{esc\(label\)\}/);
  assert.match(railSource,/aria-label="\$\{expanded\?"Contraer menú":"Expandir menú"\}"/);
  assert.match(railSource,/navigation-tooltip" id="nav-tooltip-expand" role="tooltip"/);
  assert.match(stylesSource,/navigation-item:hover \.navigation-tooltip,[\s\S]*navigation-item:focus-visible \.navigation-tooltip/);
  assert.match(stylesSource,/z-index:120/);
});

test("sidebar: Ajustes y expandir/contraer permanecen en el footer fijo",()=>{
  const {footer}=navigationConfiguration();
  assert.deepEqual(footer,[["settings","settings","Ajustes"]]);
  assert.match(railSource,/class="navigation-footer"/);
  assert.match(railSource,/NAVIGATION_FOOTER_ITEMS\.map/);
  assert.match(railSource,/class="navigation-item navigation-expand-button"/);
  assert.match(stylesSource,/\.navigation-footer\{flex:0 0 auto/);
});

test("sidebar: no duplica sincronización, Apariencia, Cuenta ni logout",()=>{
  assert.doesNotMatch(railSource,/sync-detail|data-sync|Sincroniz|Apariencia|Cuenta|accountEmail|signout|Cerrar sesión/);
  assert.match(navigationSource,/class="shell-global-topbar"/);
  assert.match(navigationSource,/class="shell-sync-trigger/);
  assert.match(navigationSource,/class="shell-appearance-trigger"/);
  assert.match(navigationSource,/class="shell-account-trigger/);
});

test("sidebar: en altura normal no fuerza scrollbar",()=>{
  const base=stylesSource.slice(
    stylesSource.indexOf(".navigation-groups{"),
    stylesSource.indexOf("@media(max-height:660px)")
  );
  assert.match(base,/overflow:visible/);
  assert.doesNotMatch(base,/overflow-y:auto|scrollbar-gutter/);
});

test("sidebar: en altura reducida solo la navegación central puede desplazarse",()=>{
  const compact=stylesSource.slice(
    stylesSource.indexOf("@media(max-height:660px)"),
    stylesSource.indexOf(".navigation-backdrop")
  );
  assert.match(compact,/\.navigation-groups\{[\s\S]*overflow-y:auto;overflow-x:hidden;padding-right:8px/);
  assert.match(compact,/scrollbar-width:thin/);
  assert.match(compact,/::-webkit-scrollbar\{width:4px\}/);
  assert.doesNotMatch(compact,/navigation-footer[\s\S]*overflow-y:auto/);
});

test("sidebar: tablet usa panel superpuesto y móvil usa drawer",()=>{
  assert.match(stylesSource,/@media\(min-width:768px\) and \(max-width:1023px\)\{[\s\S]*navigation-rail\.panel-open\{width:248px/);
  assert.match(stylesSource,/@media\(max-width:767px\)\{[\s\S]*navigation-rail\{width:min\(86vw,288px\);transform:translateX\(-105%\)/);
  assert.match(stylesSource,/navigation-rail\.panel-open\{transform:translateX\(0\)/);
  assert.match(navigationSource,/navigation-backdrop/);
  assert.match(appSource,/body\.classList\.add\("navigation-panel-open"\)/);
});

test("sidebar: Escape, backdrop y selección restauran o cierran el drawer",()=>{
  assert.match(bindingSource,/else if\(navigationPanelOpen\)[\s\S]*closeNavigationPanel\(\)/);
  assert.match(bindingSource,/action==="close"\) closeNavigationPanel\(\)/);
  assert.match(appSource,/navigationReturnFocus\?\.isConnected\) navigationReturnFocus\.focus\(\)/);
  const navigate=between("function navigateToScreen(","function bindNav(");
  assert.match(navigate,/closeNavigationPanel\(\{restoreFocus:false\}\)/);
});

test("sidebar: listeners y navegación permanecen únicos",()=>{
  assert.match(bindingSource,/if\(globalNavigationBound\) return/);
  assert.equal((bindingSource.match(/document\.addEventListener\("click"/g)||[]).length,1);
  assert.match(bindingSource,/navigateToScreen\(button\.dataset\.nav\)/);
  assert.doesNotMatch(railSource,/\sonclick=/);
});

test("sidebar: expandir solo persiste una preferencia local de dispositivo",()=>{
  const toggle=between("function toggleNavigation(","function navigateToScreen(");
  assert.match(toggle,/localStorage\.setItem\(GYMOS_NAV_EXPANDED_KEY,next\?"1":"0"\)/);
  assert.doesNotMatch(toggle,/markLocalUpdated|saveCurrentUserVault|syncNow|saveRoutine|saveHistory|saveDraft/);
});

test("sidebar: navegar conserva rutina, historial y drafts con igualdad JSON exacta",()=>{
  const navigate=between("function navigateToScreen(","function bindNav(");
  const storage=new Map([
    ["gymos:routine",'{"A":[{"name":"Remo"}]}'],
    ["gymos:history",'[{"id":"h-1","session":"A"}]'],
    ["gymos:workoutDrafts",'{"draft-1":{"sets":[0,8]}}']
  ]);
  const before=JSON.stringify(Object.fromEntries(storage));
  const context={
    closeShellPopover(){},closeNavigationPanel(){},cancelExerciseLibrarySearchDebounce(){},
    stopWorkoutSessionTimer(){},stopAllExerciseTimers(){},state:{screen:"home",exerciseTimers:{}},render(){},
    console:{error(){}},localStorage:{getItem:key=>storage.get(key)||null},
    availableRoutineSessions:()=>[],persistSelectedRoutineSession(){},
    SELECTED_SESSION_ID_KEY:"gymos:selectedSessionId",toast(){},renderHome(){},
    app:{innerHTML:""},nav:()=>"",document:{getElementById:()=>({})}
  };
  vm.createContext(context);
  vm.runInContext(`${navigate}; navigate=navigateToScreen;`,context);
  context.navigate("settings");
  assert.equal(JSON.stringify(Object.fromEntries(storage)),before);
});

test("sidebar: cambio de propietario cierra navegación y overlays",()=>{
  const reset=between("function resetRoutineSessionOwnerState(","function assertActiveLocalOwner");
  assert.match(reset,/closeShellPopover\(\{restoreFocus:false,renderShell:false\}\)/);
  assert.match(reset,/closeNavigationPanel\(\{restoreFocus:false\}\)/);
});

test("sidebar: conserva intacta la arquitectura de la topbar RC.2",()=>{
  assert.match(navigationSource,/class="shell-global-topbar"/);
  assert.match(navigationSource,/const context=shellScreenContext\(\)/);
  assert.match(navigationSource,/data-shell-action="sync-detail"/);
  assert.match(navigationSource,/data-shell-action="appearance"/);
  assert.match(navigationSource,/data-shell-action="account-menu"/);
});
