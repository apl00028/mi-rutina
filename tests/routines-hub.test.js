"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const root=path.resolve(__dirname,"..");
const experienceSource=fs.readFileSync(path.join(root,"routines-experience.js"),"utf8");
const hubSource=fs.readFileSync(path.join(root,"routine-hub.js"),"utf8");
const appSource=fs.readFileSync(path.join(root,"app.js"),"utf8");
const cssSource=fs.readFileSync(path.join(root,"styles.css"),"utf8");
const indexSource=fs.readFileSync(path.join(root,"index.html"),"utf8");
const workerSource=fs.readFileSync(path.join(root,"service-worker.js"),"utf8");

function api(){
  const context={console};context.window=context;context.globalThis=context;
  vm.createContext(context);vm.runInContext(experienceSource,context);
  return context.GymOSRoutinesExperience;
}
const library=[
  {id:"press-1",name:"Press banca",aliases:["Press de banca"]},
  {id:"remo-1",name:"Remo",aliases:["Remo sentado"]}
];
const simple=`Rutina: Fuerza\nObjetivo: Ganar fuerza\nFrecuencia: 2\n\nSesión A\n- Press banca: 3×10, RIR 2, descanso 120 s\n\nSesión B\n- Remo: 3×12, RIR 2, descanso 90 s`;
function routine(){return {name:"Fuerza",objective:"Progresar",startedAt:"2026-07-01T00:00:00.000Z",sessions:[{name:"A",exercises:[{name:"Press banca"}]},{name:"B",exercises:[{name:"Remo"}]}]};}
function history(){return [{ownerId:"owner-a",date:"2026-08-02T10:00:00.000Z",sessionName:"A",durationMs:3600000,exercises:[{name:"Press banca",notes:"Bien",discomfort:"Ninguna",series:[{weight:50,reps:10,rir:2,done:true}]}]},{ownerId:"owner-b",date:"2026-08-03T10:00:00.000Z",sessionName:"Ajena",exercises:[]}];}
function progress(options={}){return api().buildProgressExportViewModel({routine:routine(),history:history(),recovery:[{date:"2026-08-02",summary:"Buena"}],ownerId:"owner-a",options:{now:"2026-08-06T12:00:00.000Z",...options}});}

test("01 Rutinas aparece en Seguimiento",()=>assert.match(appSource,/label:"Seguimiento"[\s\S]*\["routineHub","routine","Rutinas"\]/));
test("02 escritorio y drawer comparten la configuración",()=>assert.match(appSource,/NAVIGATION_GROUPS\.map\(group=>/));
test("03 Rutinas no está duplicada",()=>assert.equal((appSource.match(/\["routineHub","routine","Rutinas"\]/g)||[]).length,1));
test("04 el estado activo usa el destino routineHub",()=>{assert.match(appSource,/const active=navigationDestinationForScreen\(\)/);assert.match(appSource,/const selected=screen===active/);});
test("05 Ajustes no es el acceso principal",()=>assert.doesNotMatch(appSource,/class="card routine-workflow-entry"/));

test("06 Mi rutina renderiza la rutina activa",()=>assert.match(hubSource,/routineSummary\(data\.routine\)/));
test("07 Mi rutina tolera ausencia de rutina",()=>assert.equal(api().validateRoutineImport(null).valid,false));
test("08 el runtime visible admite 2–6 sesiones",()=>assert.match(hubSource,/sessions\.length<2\|\|sessions\.length>6/));
test("09 resumir no muta la rutina",()=>{const value=routine(),before=JSON.stringify(value);api().buildProgressExportViewModel({routine:value});assert.equal(JSON.stringify(value),before);});
test("10 los cambios pasan por propuesta",()=>{assert.match(hubSource,/submitCandidate\(actions\.buildCandidate/);assert.doesNotMatch(hubSource,/activeRoutine\s*=/);});

test("11 analiza texto simple de ChatGPT",()=>assert.equal(api().parseRoutineImport(simple,{library}).parsed.sessions.length,2));
test("12 analiza Markdown",()=>assert.equal(api().parseRoutineImport(`# Rutina\n\nSesión A\n- Press banca: 3×8\n\nSesión B\n- Remo: 3×10`,{library}).format,"markdown"));
test("13 analiza JSON versionado",()=>{const value=api().parseRoutineImport(JSON.stringify({schemaVersion:api().ROUTINE_JSON_VERSION,routine:{name:"X",sessions:[{name:"A",exercises:[{name:"Press banca",sets:3,target:{type:"reps",min:8,max:8}}]},{name:"B",exercises:[{name:"Remo",sets:3,target:{type:"reps",min:8,max:8}}]}]}}),{library});assert.equal(value.format,"json");});
test("14 campos desconocidos generan advertencia",()=>assert.ok(api().parseRoutineImport(`${simple}\nCampo raro`,{library}).warnings.some(item=>item.code==="unknown_field")));
test("15 no inventa valores ausentes",()=>{const item=api().parseRoutineImport(`Sesión A\n- Press banca\nSesión B\n- Remo`,{library}).parsed.sessions[0].exercises[0];assert.equal(item.sets,null);assert.equal(item.target,null);});
test("16 detecta coincidencias ambiguas",()=>{const result=api().libraryMatch("Remo",[{id:"1",name:"Remo"},{id:"2",name:"Remo"}]);assert.equal(result.status,"ambiguous");});
test("17 no autoselecciona coincidencias ambiguas",()=>assert.equal(api().libraryMatch("Remo",[{id:"1",name:"Remo"},{id:"2",name:"Remo"}]).exerciseId,null));
test("18 escapa HTML importado",()=>{const result=api().parseRoutineImport(`Sesión A\n- <b>Press</b>: 3×8\nSesión B\n- Remo: 3×8`,{library:[]});assert.doesNotMatch(result.parsed.sessions[0].exercises[0].name,/[<>]/);});
test("19 rechaza scripts",()=>assert.equal(api().parseRoutineImport(`<script>alert(1)</script>`).errors[0].code,"unsafe_content"));
test("20 limita entradas excesivas",()=>assert.equal(api().parseRoutineImport("x".repeat(api().MAX_INPUT_CHARS+1)).errors[0].code,"input_too_large"));
test("21 crea propuesta pendiente",()=>assert.match(appSource,/persistRoutineProposal\(proposal,\{ownerId,replacePending\}\)/));
test("22 no activa automáticamente",()=>assert.doesNotMatch(appSource,/textImportCandidate[\s\S]{0,500}activateStoredRoutineProposal/));
test("23 la importación comprueba propietario",()=>assert.match(appSource,/currentRoutineOwnerOrNull\(\)!==ownerId/));
test("24 parser y borrador funcionan offline",()=>{assert.doesNotMatch(experienceSource,/fetch\(|supabase/i);assert.match(workerSource,/routines-experience\.js/);});
test("25 propuestas duplicadas se delegan al motor canónico",()=>assert.match(hubSource,/requiresReplacementConfirmation/));

test("26 exporta última semana",()=>assert.equal(progress({period:"week"}).period.key,"week"));
test("27 exporta últimas dos semanas",()=>assert.equal(progress({period:"two_weeks"}).period.key,"two_weeks"));
test("28 exporta último mes",()=>assert.equal(progress({period:"month"}).period.key,"month"));
test("29 exporta desde inicio de rutina",()=>assert.equal(new Date(progress({period:"routine"}).period.start).getDate(),1));
test("30 exporta intervalo personalizado",()=>{const value=progress({period:"custom",customStart:"2026-08-01",customEnd:"2026-08-04"});assert.equal(new Date(value.period.start).getDate(),1);assert.equal(new Date(value.period.end).getDate(),4);});
test("31 incluye previstas y realizadas",()=>{const value=progress();assert.ok(value.adherence.planned>=2);assert.equal(value.adherence.completed,1);});
test("32 incluye ejercicios series cargas repeticiones y RIR",()=>assert.deepEqual(JSON.parse(JSON.stringify(progress().workouts[0].exercises[0].series[0])).weight,50));
test("33 incluye notas solo al seleccionarlas",()=>{assert.equal(progress({includeNotes:false}).workouts[0].exercises[0].notes,"");assert.equal(progress({includeNotes:true}).workouts[0].exercises[0].notes,"Bien");});
test("34 incluye Recuperación solo al seleccionarla",()=>{assert.equal(progress({includeRecovery:false}).recovery.length,0);assert.equal(progress({includeRecovery:true}).recovery.length,1);});
test("35 excluye datos privados",()=>{const json=JSON.stringify(api().buildStructuredProgressExport(progress()));assert.doesNotMatch(json,/owner-a|ownerId|workoutInstanceId|token|email/);});
test("36 exportar no modifica historial",()=>{const value=history(),before=JSON.stringify(value);api().buildProgressExportViewModel({routine:routine(),history:value,ownerId:"owner-a"});assert.equal(JSON.stringify(value),before);});
test("37 exportar no modifica rutina",()=>{const value=routine(),before=JSON.stringify(value);api().buildProgressExportViewModel({routine:value});assert.equal(JSON.stringify(value),before);});
test("38 exportar no modifica Recuperación",()=>{const value=[{date:"2026-08-02",summary:"Bien"}],before=JSON.stringify(value);api().buildProgressExportViewModel({recovery:value,options:{includeRecovery:true}});assert.equal(JSON.stringify(value),before);});
test("39 Markdown es determinista",()=>{const value=progress();assert.equal(api().buildChatGPTMarkdown(value),api().buildChatGPTMarkdown(value));});
test("40 JSON es versionado y seguro",()=>{const value=api().buildStructuredProgressExport(progress());assert.equal(value.schemaVersion,api().STRUCTURED_EXPORT_VERSION);});
test("41 interfaz implementa copia correcta",()=>assert.match(appSource,/navigator\.clipboard\.writeText/));
test("42 existe fallback de Clipboard",()=>assert.match(hubSource,/copyFallback/));
test("43 soporta periodo sin datos",()=>assert.equal(progress({period:"custom",customStart:"2020-01-01",customEnd:"2020-01-02"}).workouts.length,0));
test("44 no depende de Supabase",()=>assert.doesNotMatch(experienceSource,/Supabase|fetch\(/));
test("45 conserva estado de series incompletas",()=>{const value=progress();assert.equal(value.workouts[0].exercises[0].series[0].completed,true);});
test("46 no inventa conclusiones",()=>assert.doesNotMatch(api().buildChatGPTMarkdown(progress()),/debes|recomiendo|aumenta el peso/i));
test("47 preguntas seleccionadas aparecen al final",()=>assert.match(api().buildChatGPTMarkdown(progress({questions:["Pregunta final"]})).trimEnd(),/Pregunta final$/));
test("48 texto personalizado se limpia",()=>assert.doesNotMatch(api().buildChatGPTMarkdown(progress({customQuestion:"<b>¿Qué ves?</b>"})),/[<>]/));

test("49 rutas antiguas redirigen a Rutinas",()=>assert.match(appSource,/\["routineWorkflow","plan","routineEditor"[\s\S]*\.includes\(screen\)\) return "routineHub"/));
test("50 backup técnico sigue en Ajustes",()=>{assert.match(appSource,/openBackupRestore/);assert.match(appSource,/function importGymOSBackup/);});
test("51 no hay segundo writer activo",()=>{assert.doesNotMatch(experienceSource,/localStorage|saveCanonicalRoutine/);assert.doesNotMatch(hubSource,/saveCanonicalRoutine/);});

test("52 móvil evita scroll horizontal en tabs",()=>{assert.match(cssSource,/routines-primary-tabs[\s\S]*grid-template-columns:repeat\(3/);assert.match(cssSource,/@media\(max-width:767px\)/);});
test("53 tabs tienen roles y aria-selected",()=>{assert.match(hubSource,/role="tablist"/);assert.match(hubSource,/aria-selected=/);});
test("54 textarea y filtros tienen labels",()=>{assert.match(hubSource,/for="routineImportText"/);assert.match(hubSource,/<legend>Privacidad y detalle<\/legend>/);});
test("55 tabs permiten navegación por teclado",()=>assert.match(hubSource,/\["ArrowLeft","ArrowRight","Home","End"\]/));
test("56 UI normal no muestra IDs ni JSON crudo",()=>{assert.doesNotMatch(hubSource,/>ownerId<|>workoutInstanceId<|>sessionId<|<pre/);assert.ok(indexSource.indexOf("routines-experience.js")<indexSource.indexOf("routine-hub.js"));});

function exportSingleWorkout(workout){
  return api().buildProgressExportViewModel({
    routine:routine(),history:[workout],ownerId:"owner-a",
    options:{now:"2026-08-06T12:00:00.000Z"}
  });
}

test("57 planned session is not exported as completed",()=>{
  const value=exportSingleWorkout({
    ownerId:"owner-a",date:"2026-08-05T10:00:00.000Z",sessionName:"A",
    exercises:[{name:"Press banca",series:[{done:false}]}]
  });
  assert.equal(value.workouts[0].completed,false);
  assert.equal(value.adherence.completed,0);
});

test("58 done set without metrics is exported as performed without invented values",()=>{
  const value=exportSingleWorkout({
    ownerId:"owner-a",date:"2026-08-05T10:00:00.000Z",sessionName:"A",
    exercises:[{name:"Press banca",series:[{done:true}]}]
  });
  const set=value.workouts[0].exercises[0].series[0];
  assert.equal(value.workouts[0].completed,true);
  assert.equal(value.workouts[0].completedSeries,1);
  assert.equal(set.completed,true);
  assert.equal(set.weight,null);
  assert.equal(set.reps,null);
  assert.equal(set.rir,null);
  assert.equal(set.seconds,null);
  assert.equal(set.distance,null);
});

test("59 set without performance evidence is not exported as completed",()=>{
  const value=exportSingleWorkout({
    ownerId:"owner-a",date:"2026-08-05T10:00:00.000Z",sessionName:"A",
    exercises:[{name:"Press banca",sets:[{}]}]
  });
  assert.equal(value.workouts[0].exercises[0].series[0].completed,false);
  assert.equal(value.workouts[0].completedSeries,0);
});

test("60 mixed session preserves performed and pending sets",()=>{
  const value=exportSingleWorkout({
    ownerId:"owner-a",date:"2026-08-05T10:00:00.000Z",sessionName:"A",completed:true,
    exercises:[{name:"Press banca",series:[{done:true},{done:false}]}]
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(value.workouts[0].exercises[0].series.map(set=>set.completed))),
    [true,false]
  );
  assert.equal(value.workouts[0].completedSeries,1);
});
