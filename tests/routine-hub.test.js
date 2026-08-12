"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const root=path.resolve(__dirname,"..");
const source=fs.readFileSync(path.join(root,"routine-hub.js"),"utf8");
const appSource=fs.readFileSync(path.join(root,"app.js"),"utf8");
const indexSource=fs.readFileSync(path.join(root,"index.html"),"utf8");

function loadApi(){
  const context={console,confirm:()=>true};
  context.window=context;
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(source,context,{filename:"routine-hub.js"});
  return context.GymOSRoutineHub;
}
function loadActiveWorkoutGuard({memory=null,records=[],readError=null,currentRoutineId="routine-current"}={}){
  const start=appSource.indexOf("function routineOwnerHasActiveWorkout");
  const end=appSource.indexOf("\nfunction ",start+10);
  const context={
    console:{warn:()=>{}},
    state:{workoutDraftMemory:memory},
    routineProposalOwnerId:value=>String(value),
    activeRoutineForComparison:()=>({routineId:currentRoutineId}),
    storedWorkoutProgressRecords:()=>{
      if(readError) throw readError;
      return records;
    }
  };
  vm.createContext(context);
  vm.runInContext(appSource.slice(start,end),context,{filename:"app-active-workout-guard.js"});
  return context.routineOwnerHasActiveWorkout;
}
function routine(count=2){
  return {
    schemaVersion:"4.2",routineId:"hidden",revision:1,
    sessions:Array.from({length:count},(_,index)=>({
      sessionId:`hidden-${index}`,order:index+1,label:String.fromCharCode(65+index),
      name:`Sesión ${index+1}`,focus:"full_body",estimatedDurationMinutes:50,
      exercises:[{
        exerciseId:`exercise-${index}`,name:`Ejercicio ${index+1}`,
        prescription:{sets:3,target:{type:"repetitions",min:8,max:12},targetRir:{min:2,max:2},restSeconds:90}
      }]
    }))
  };
}

test("hub expone las ocho vistas owner-scoped",()=>{
  const api=loadApi();
  assert.deepEqual(JSON.parse(JSON.stringify(api.VIEWS)),[
    "overview","active","manual","import","share","reconfigure","proposal","versions"
  ]);
});

test("resumen y editor clonan la rutina sin modificarla",()=>{
  const api=loadApi(),value=routine(6),before=JSON.stringify(value);
  const summary=JSON.parse(JSON.stringify(api.routineSummary(value)));
  const manual=JSON.parse(JSON.stringify(api.manualFromRoutine(value)));
  manual[0].name="Cambio local";
  assert.equal(summary.sessionCount,6);
  assert.equal(summary.exerciseCount,6);
  assert.equal(JSON.stringify(value),before);
  assert.equal(api.manualFromRoutine(null).length,2);
});

test("validación manual mantiene 2–6 y prescripción completa",()=>{
  const api=loadApi();
  const valid=[1,2].map(index=>({
    name:`Sesión ${index}`,exercises:[{
      exerciseId:`exercise-${index}`,
      prescription:{
        sets:3,target:{type:"reps",min:8,max:12},
        targetRir:{min:2,max:3},restSeconds:90
      }
    }]
  }));
  assert.deepEqual(JSON.parse(JSON.stringify(api.validateManual(valid))),[]);
  assert.match(api.validateManual(valid.slice(0,1))[0],/entre 2 y 6/);
  valid[0].exercises[0].prescription.restSeconds=700;
  assert.match(api.validateManual(valid).join(" "),/descanso/);
});

test("sidebar navega a Rutinas y Ajustes no duplica el acceso principal",()=>{
  assert.match(appSource,/\["routineHub","routine","Rutinas"\]/);
  assert.doesNotMatch(appSource,/class="card routine-workflow-entry"/);
  assert.equal((appSource.match(/function renderRoutineHub\(/g)||[]).length,1);
  assert.doesNotMatch(appSource,/bindScreen\("openRoutineEditor"/);
  assert.doesNotMatch(appSource,/bindScreen\("openRoutineWorkflow"/);
  assert.match(appSource,/state\.screen==="routineWorkflow"\|\|state\.screen==="routineEditor"\) renderRoutineHub\(\)/);
  assert.match(appSource,/returnScreen="routineHub"/);
});

test("hub y Excel se cargan antes de app desde recursos locales",()=>{
  assert.ok(indexSource.indexOf('src="routine-excel.js"')<indexSource.indexOf('src="app.js"'));
  assert.ok(indexSource.indexOf('src="routine-hub.js"')<indexSource.indexOf('src="app.js"'));
  assert.match(indexSource,/src="vendor\/xlsx\.full\.min\.js"/);
  assert.doesNotMatch(indexSource,/cdn\.jsdelivr\.net\/npm\/xlsx/);
});

test("el hub no contiene writers ni muestra nombres de IDs técnicos",()=>{
  assert.doesNotMatch(source,/saveCanonicalRoutine|saveRoutine\(|localStorage|gymos:history/);
  assert.doesNotMatch(source,/>ownerId<|>routineId<|>sessionId<|>Hash<|>JSON</i);
  assert.match(appSource,/activeWorkoutState:routineOwnerHasActiveWorkout\(normalizedOwner\)/);
  assert.match(appSource,/function routineOwnerHasActiveWorkout[\s\S]*catch\([^)]*\)[\s\S]*return true;/);
});

test("guard de rutina permite continuar solo si confirma que no hay entrenamiento activo",()=>{
  const guard=loadActiveWorkoutGuard();
  assert.equal(guard("owner-a"),false);
});

test("guard de rutina bloquea entrenamiento activo en memoria o persistido",()=>{
  const active={
    ownerId:"owner-a",routineId:"routine-current",status:"active",
    startedAt:"2026-08-12T10:00:00.000Z"
  };
  assert.equal(loadActiveWorkoutGuard({memory:active})("owner-a"),true);
  assert.equal(loadActiveWorkoutGuard({records:[active]})("owner-a"),true);
  assert.equal(loadActiveWorkoutGuard({records:[active]})("owner-b"),false);
});

test("guard de rutina falla cerrado si la lectura no es verificable",()=>{
  const guard=loadActiveWorkoutGuard({readError:new Error("corrupt_storage")});
  assert.equal(guard("owner-a"),true);
});

test("entrenamiento activo bloquea activar pero permite preparar una restauracion",()=>{
  assert.match(source,/data-hub-action="open-activation" \$\{blockers\.length\|\|data\.activeWorkout\?"disabled":""\}/);
  assert.match(source,/data-hub-action="prepare-restore">Preparar restauraci/);
  assert.doesNotMatch(source,/data-hub-action="prepare-restore" \$\{data\.activeWorkout\?"disabled":""\}/);
});

test("confirmaciones accesibles cierran con Escape sin escribir datos",()=>{
  assert.equal((source.match(/role="dialog"/g)||[]).length,2);
  assert.ok((source.match(/tabindex="-1"/g)||[]).length>=2);
  assert.match(source,/options\.root\.onkeydown=event=>/);
  assert.match(source,/event\.key!=="Escape"/);
});

test("backup exige propietario coincidente antes de capturar o escribir",()=>{
  const start=appSource.indexOf("function importGymOSBackup");
  const end=appSource.indexOf("function ",start+10);
  const section=appSource.slice(start,end);
  const missing=section.indexOf("if(!backup.ownerId)");
  const mismatch=section.indexOf("backupOwner!==normalizedOwner");
  const capture=section.indexOf("captureRoutineSessionStartupStorage");
  assert.ok(missing>=0&&mismatch>missing&&capture>mismatch);
  assert.doesNotMatch(section.slice(0,capture),/localStorage\.(setItem|removeItem)/);
  const handlerStart=appSource.indexOf("importFile.onchange");
  const handler=appSource.slice(
    handlerStart,
    appSource.indexOf('if("serviceWorker" in navigator)',handlerStart)
  );
  assert.match(handler,/importGymOSBackup\(data,"merge"\)/);
  assert.doesNotMatch(handler,/saveHistory|saveRoutine\(|saveCanonicalRoutine|localStorage\.setItem/);
  assert.match(section,/routineOwnerHasActiveWorkout\(normalizedOwner\)/);
});
