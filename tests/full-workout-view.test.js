const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const root=path.join(__dirname,"..");
const app=fs.readFileSync(path.join(root,"app.js"),"utf8");
const styles=fs.readFileSync(path.join(root,"styles.css"),"utf8");
const progress=fs.readFileSync(path.join(root,"workout-progress.js"),"utf8");

function between(source,start,end){
  const from=source.indexOf(start);
  const to=source.indexOf(end,from+start.length);
  assert.ok(from>=0,`missing start: ${start}`);
  assert.ok(to>from,`missing end: ${end}`);
  return source.slice(from,to);
}

const render=between(app,"function renderWorkout()","function activeWorkoutIdentityValid(");
const exercise=between(app,"function renderActiveWorkoutExercise(","function renderActiveWorkoutOverlays(");
const set=between(app,"function renderActiveWorkoutSet(","function hasInputValue(");
const bind=between(app,"function bindActiveWorkoutEvents(","function renderLegacyWorkout(");
const input=between(bind,'main.addEventListener("input"','main.addEventListener("change"');
const setComplete=between(bind,'}else if(button.matches("[data-complete-active-set]"))','}else if(button.matches("[data-add-extra-set]"))');
const exerciseComplete=between(bind,'}else if(button.matches("[data-complete-active-exercise]"))','}else if(button.matches("[data-workout-discard-menu]"))');
const finish=between(app,"function finishWorkout()","function showRecordsCelebration(");

test("renderiza todos los ejercicios de la sesión",()=>{
  assert.match(render,/draft\.exercises\.map\(\(item,index\)=>renderActiveWorkoutExercise/);
  assert.doesNotMatch(render,/renderMobileWorkout\(/);
});

test("cada ejercicio renderiza todas sus series",()=>{
  assert.match(exercise,/rows\.map\(row=>renderActiveWorkoutSet/);
});

test("las filas conservan exerciseInstanceId y setInstanceId",()=>{
  assert.match(exercise,/data-exercise-instance-id="\$\{esc\(instanceId\)\}"/);
  assert.match(set,/data-set-instance-id="\$\{esc\(row\.setInstanceId\|\|""\)\}"/);
});

test("editar una serie no oculta las demás",()=>{
  assert.match(input,/stageWorkoutDraft|persist\(/);
  assert.doesNotMatch(input,/renderWorkout|innerHTML/);
});

test("completar una serie no cambia a un wizard",()=>{
  assert.match(setComplete,/updateActiveWorkoutExerciseUi/);
  assert.doesNotMatch(setComplete,/navigateMobileWorkoutExercise|renderWorkout\(\)/);
});

test("completar ejercicio no finaliza la sesión",()=>{
  assert.match(exerciseComplete,/completedAt=new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(exerciseComplete,/finishWorkout|saveHistory|createPendingCheckin/);
});

test("una serie completada puede volver a editarse",()=>{
  assert.match(setComplete,/set\.done=!wasDone/);
  assert.match(setComplete,/control\.disabled=Boolean\(updatedSet\.done\)/);
});

test("un ejercicio se contrae y expande sin persistencia",()=>{
  const toggle=between(bind,'}else if(button.matches("[data-workout-toggle-exercise]"))','}else if(button.matches("[data-workout-detail-toggle]"))');
  assert.match(toggle,/panel\.hidden=expanded/);
  assert.doesNotMatch(toggle,/stageWorkoutDraft|saveDraft|renderWorkout/);
});

test("la expansión usa exerciseInstanceId y no el índice",()=>{
  assert.match(exercise,/workoutExpandedExercises\.has\(instanceId\)/);
  assert.match(bind,/workoutExpandedExercises\.(?:add|delete)\(exerciseInstanceId\)/);
});

test("ir al siguiente pendiente hace scroll sin reconstruir",()=>{
  const next=between(bind,'}else if(button.matches("[data-workout-next-pending]"))','}else if(button.matches("[data-workout-review]"))');
  assert.match(next,/scrollIntoView/);
  assert.doesNotMatch(next,/renderWorkout/);
});

test("las notas no provocan rerender por carácter",()=>{
  assert.match(input,/exercise\.notes=target\.value/);
  assert.doesNotMatch(input,/renderWorkout|replaceWith/);
});

test("el autosave mantiene el debounce canónico",()=>{
  assert.match(app,/workoutDraftAutosaveTimer=setTimeout/);
  assert.match(app,/},400\)/);
  assert.equal((app.match(/function stageWorkoutDraft\(/g)||[]).length,1);
});

test("la edición offline conserva el guardado local",()=>{
  assert.match(app,/Sin conexión · guardado en este dispositivo/);
  assert.match(app,/saveDraft\(draft,\{mark:true,schedule:scheduleSync\}\)/);
});

test("el cronómetro de sesión conserva un único intervalo",()=>{
  assert.match(app,/state\.workoutSessionTimerInterval=setInterval\(updateWorkoutSessionElapsed,1000\)/);
  const timer=between(app,"function updateWorkoutSessionElapsed()","function startWorkoutSessionTimer(");
  assert.doesNotMatch(timer,/saveDraft|stageWorkoutDraft|localStorage/);
});

test("el registro no modifica la rutina",()=>{
  assert.doesNotMatch(input,/saveRoutine|saveCanonicalRoutine/);
  assert.doesNotMatch(setComplete,/saveRoutine|saveCanonicalRoutine/);
});

test("no escribe historial antes de finalizar",()=>{
  assert.doesNotMatch(bind,/saveHistory\(/);
});

test("no crea Recuperación antes de finalizar",()=>{
  assert.doesNotMatch(bind,/createPendingCheckin/);
});

test("finalizar deduplica historial",()=>{
  assert.match(finish,/getHistory\(\)\.find\(workout=>/);
  assert.match(finish,/workout\.workoutInstanceId===d\.workoutInstanceId/);
});

test("finalizar crea un único check-in por el writer existente",()=>{
  assert.equal((finish.match(/createPendingCheckin/g)||[]).length,2);
  assert.match(finish,/if\(existing\)/);
});

test("la sesión restaura el draft sin cambiar workoutInstanceId",()=>{
  assert.match(render,/readHomeDraft\(session,canonical\)/);
  assert.match(render,/state\.workoutActiveInstanceId!==draft\.workoutInstanceId/);
  assert.doesNotMatch(render,/secureSessionModelId\("workout"\)/);
});

test("propietarios distintos siguen aislados",()=>{
  assert.match(bind,/currentRoutineOwnerOrNull\(\)===context\.ownerId/);
  assert.match(progress,/ownerId/);
});

test("el CSS móvil impide scroll horizontal",()=>{
  assert.match(styles,/\.active-workout-screen\{[\s\S]*?overflow-x:clip/);
  assert.match(styles,/@media\(max-width:430px\)/);
});

test("el bloque final no tapa la última serie",()=>{
  assert.match(styles,/\.active-workout-final-summary \.active-exercise-navigation\{[\s\S]*?position:static/);
  assert.match(styles,/env\(safe-area-inset-bottom\)/);
});

test("la vista no muestra IDs, JSON ni estados técnicos",()=>{
  assert.doesNotMatch(render,/>\$\{esc\(draft\.(?:draftId|workoutInstanceId|ownerId)/);
  assert.doesNotMatch(render,/JSON\.stringify/);
});

test("la lista no impone límites de 2 a 6 ejercicios",()=>{
  assert.match(render,/draft\.exercises\.map/);
  assert.doesNotMatch(render,/slice\(0,6\)|Math\.min\(6/);
});

test("el runtime no impone límites de 2 a 6 sesiones",()=>{
  assert.match(app,/activeRoutineSessions\(\)/);
  assert.doesNotMatch(render,/\["A","B","C"\]/);
});

