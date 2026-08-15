const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const root=path.join(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const appSource=read("app.js");
const stylesSource=read("styles.css");
const indexSource=read("index.html");
const workerSource=read("service-worker.js");

test("I1 mantiene una única implementación de los puntos consolidados",()=>{
  const count=name=>(appSource.match(new RegExp(`function ${name}\\(`,"g"))||[]).length;
  for(const name of [
    "estimatedOneRepMax","renderExerciseLibrary",
    "renderExerciseLibraryEditor","renderExerciseDetail"
  ]) assert.equal(count(name),1,name);
});

test("I1 e1RM trata una repetición como medición directa",()=>{
  const source=appSource.match(/function estimatedOneRepMax\(weight,reps\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(source);
  const context={};
  vm.runInNewContext(`${source};result=[
    estimatedOneRepMax(100,1),
    estimatedOneRepMax(100,2),
    estimatedOneRepMax(0,8)
  ];`,context);
  assert.deepEqual(Array.from(context.result),[100,100*(1+2/30),0]);
});

test("I1 APIs de módulos quedan congeladas y sus nombres son únicos",()=>{
  const files=[
    "daily-thoughts.js","assets/heroes/manifest.js","recovery-center.js",
    "professional-nutrition.js","nutrition-engine.js","workout-analysis.js",
    "exercise-domain.js","profile-data.js","routine-session-model.js",
    "routine-session-migration.js","routine-session-runtime.js",
    "routine-generator.js","routine-proposals.js","routine-activation.js",
    "routine-io.js","exercise-library-workflow.js","routine-workflow-ui.js"
  ];
  const names=[];
  for(const file of files){
    const source=read(file);
    assert.match(source,/GymOS[A-Za-z0-9_]+\s*=\s*Object\.freeze\(/,file);
    names.push(...Array.from(source.matchAll(/(?:window|global)\.(GymOS[A-Za-z0-9_]+)\s*=/g),match=>match[1]));
  }
  assert.equal(new Set(names).size,names.length);
  assert.doesNotMatch(
    files.map(read).join("\n"),
    /window\.(?:render|adapt)[A-Z][A-Za-z0-9_]*\s*=/
  );
});

test("I2 no usa alertas genéricas ni eventos onclick inline",()=>{
  assert.doesNotMatch(appSource,/\balert\s*\(/);
  assert.doesNotMatch(`${indexSource}\n${appSource}`,/<[^>]+\sonclick\s*=/i);
});

test("I3 ofrece foco visible y respeta reducción de movimiento",()=>{
  assert.match(stylesSource,/:focus-visible/);
  assert.match(stylesSource,/@media\s*\(prefers-reduced-motion:reduce\)/);
});

test("I2 presenta borradores obsoletos y sesiones vacías sin perder datos",()=>{
  assert.match(appSource,/Este borrador pertenece a una versión anterior de la sesión/);
  assert.match(appSource,/no se ha mezclado con la rutina actual/);
  assert.match(appSource,/Esta sesión no tiene ejercicios/);
  assert.match(appSource,/const progress=total\?/);
  assert.match(appSource,/id="finishWorkout"[^>]*\$\{emptySession\?"disabled"/);
});

test("I3 el diálogo corporal admite Escape y restaura el foco",()=>{
  assert.match(appSource,/aria-describedby="bodySummaryEditorHelp"/);
  assert.match(appSource,/event\.key==="Escape"/);
  assert.match(appSource,/returnFocus\?\.isConnected/);
});

test("I4 el escape común neutraliza texto y atributos maliciosos",()=>{
  const source=appSource.match(/function esc\(value\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(source);
  const context={};
  vm.runInNewContext(`${source};result=[
    esc("<script>alert(1)</script>"),
    esc("<img src=x onerror=alert(1)>"),
    esc("\\"comillas\\" 'apóstrofos' &"),
    esc("javascript:alert(1)\\nsiguiente")
  ];`,context);
  const [script,image,quotes,scheme]=Array.from(context.result);
  assert.equal(script,"&lt;script&gt;alert(1)&lt;/script&gt;");
  assert.equal(image,"&lt;img src=x onerror=alert(1)&gt;");
  assert.equal(quotes,"&quot;comillas&quot; &#039;apóstrofos&#039; &amp;");
  assert.equal(scheme,"javascript:alert(1)\nsiguiente");
});

test("I4 el cambio de propietario limpia estado privado y operaciones pendientes",()=>{
  const reset=appSource.slice(
    appSource.indexOf("function resetRoutineSessionOwnerState"),
    appSource.indexOf("function assertActiveLocalOwner")
  );
  for(const token of [
    "sessions=[]","clearActiveRestTimer","syncTimer","syncInProgress",
    "routineWorkflow","routineImport","completedWorkoutSummary",
    "workoutAnalysisId","coachChatMessages","nutritionPreview",
    "professionalNutritionDraft","quickActionsDraft","bodySummaryDraft",
    "recoveryDraft","accountProfile","onboardingDraft"
  ]) assert.match(reset,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")),token);
  const clearRest=appSource.slice(
    appSource.indexOf("function clearActiveRestTimer"),
    appSource.indexOf("function finishActiveRestTimer")
  );
  assert.match(clearRest,/clearInterval\(state\.timerInterval\)/);
  assert.match(clearRest,/state\.restTimerGeneration=/);
  assert.match(clearRest,/removeStoredRestTimer/);
});

test("I4 sincronización captura propietario, bloquea dobles ejecuciones y revalida awaits",()=>{
  const sync=appSource.slice(
    appSource.indexOf("async function syncNow"),
    appSource.indexOf("async function autoSync")
  );
  assert.match(sync,/if\(state\.syncInProgress\) return/);
  assert.match(sync,/const ownerId=currentRoutineOwnerOrNull\(\)/);
  assert.match(sync,/const userId=state\.syncUser\.id/);
  assert.ok((sync.match(/assertOwner\(\)/g)||[]).length>=7);
  assert.match(sync,/finally\{\s*if\(state\.syncOperationId===operationId\) state\.syncInProgress=false/);
});

test("I4 los logs de contraseña y sincronización no persisten usuario ni sesión",()=>{
  assert.doesNotMatch(appSource,/PASSWORD UPDATE RESULT|SESSION AFTER PASSWORD UPDATE/);
  const audit=appSource.slice(
    appSource.indexOf("function getSyncAudit"),
    appSource.indexOf("function simpleChecksum")
  );
  assert.match(audit,/\(\{userId,deviceId,\.\.\.entry\}\)/);
  assert.doesNotMatch(audit,/items\.push\(\{[^}]*userId/);
});

test("I4 las descargas históricas bloquean esquemas y tipos no admitidos",()=>{
  const source=read("professional-nutrition.js");
  assert.match(source,/function isSafeSourceDataUrl/);
  assert.match(source,/if\(!isSafeSourceDataUrl\(source\?\.dataUrl\)\)/);
  assert.doesNotMatch(
    source.match(/function isSafeSourceDataUrl[\s\S]*?\n  \}/)?.[0]||"",
    /text\\\/html/
  );
});

test("I5 la caché rc.2 contiene todos los módulos locales en orden de carga",()=>{
  assert.match(workerSource,/const GYMOS_BUILD_VERSION="4\.2\.0-rc\.7-sync-rpc"/);
  assert.match(workerSource,/const CACHE=`gymos-cache-\$\{GYMOS_BUILD_VERSION\}`/);
  const localScripts=Array.from(
    indexSource.matchAll(/<script src="(?!https?:)([^"]+)"/g),
    match=>match[1]
  );
  for(const script of localScripts){
    if(script.startsWith("app.js?v=")){
      assert.equal((workerSource.match(/"app\.js\?v=4\.2\.0-rc\.7-sync-rpc"/g)||[]).length,1);
      continue;
    }
    assert.equal((workerSource.match(new RegExp(
      script.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"g"
    ))||[]).length,1,script);
  }
});

test("I5 el worker no cachea Supabase ni peticiones mutables",()=>{
  assert.match(workerSource,/e\.request\.method!=="GET"/);
  assert.match(workerSource,/url\.origin!==self\.location\.origin/);
  assert.match(workerSource,/key\.startsWith\("gymos-cache-"\)/);
  assert.match(workerSource,/e\.request\.mode==="navigate"/);
  assert.doesNotMatch(workerSource,/keys\.filter\(k=>k!==CACHE\)/);
});

test("I7 prepara la versión rc sin alterar versiones históricas de migración",()=>{
  assert.match(appSource,/const GYMOS_VERSION="4\.2\.0-rc\.7-sync-rpc"/);
  assert.match(appSource,/const GYMOS_BACKUP_VERSION=GYMOS_VERSION/);
  const manifest=JSON.parse(read("manifest.json"));
  assert.equal(manifest.name,"GymOS 4.2.0-rc.7-sync-rpc");
  assert.equal(manifest.start_url,"./?v=420rc7-sync-rpc");
  assert.match(read("routine-session-migration.js"),/MIGRATION_VERSION/);
});
