const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const root=path.resolve(__dirname,"..");
const source=fs.readFileSync(path.join(root,"progress-analytics.js"),"utf8");
const context={window:{},globalThis:{},console,Date,Intl,JSON,Object,Array,Map,Set,String,Number,Math,Boolean};
context.globalThis=context.window;
vm.runInNewContext(source,context,{filename:"progress-analytics.js"});
const api=context.window.GymOSProgressAnalytics;
const OWNER_A="11111111-1111-4111-8111-111111111111";
const OWNER_B="22222222-2222-4222-8222-222222222222";
const NOW="2026-08-08T12:00:00+02:00";
const library=[{id:"press",name:"Press banca",migrationStatus:"ready",primaryMuscles:["Pecho"]}];

test("módulo puro carga antes de app y queda disponible offline",()=>{
  const index=fs.readFileSync(path.join(root,"index.html"),"utf8");
  const worker=fs.readFileSync(path.join(root,"service-worker.js"),"utf8");
  assert.ok(index.indexOf('<script src="progress-analytics.js"></script>')>
    index.indexOf('<script src="workout-progress.js"></script>'));
  assert.ok(index.indexOf('<script src="progress-analytics.js"></script>')<
    index.indexOf('<script src="app.js"></script>'));
  assert.equal((worker.match(/"progress-analytics\.js"/g)||[]).length,1);
  assert.doesNotMatch(source,/localStorage|sessionStorage|indexedDB|supabase|document\.|fetch\(/);
});

function workout({
  id="workout-1",ownerId=OWNER_A,date="2026-08-07T18:00:00+02:00",
  status="finalized",field="series",done=true,weight=50,reps=10,rir=2,
  durationMs=3600000,name="Press banca",exerciseId="press"
}={}){
  return {
    id,workoutInstanceId:id,ownerId,date,completedAt:status==="finalized"?date:null,
    status,durationMs,sessionId:"session-a",exercises:[{
      name,exerciseId,[field]:[{setInstanceId:`set-${id}`,weight,reps,rir,done}]
    }]
  };
}
function aggregate(options={}){
  return api.aggregate({
    ownerId:OWNER_A,history:[],progressRecords:[],remoteHistory:[],remoteProgress:[],
    exerciseLibrary:library,rangeWeeks:4,now:NOW,...options
  });
}

test("sesión finalizada solo local usa exercise.series y produce volumen",()=>{
  const result=aggregate({history:[workout()]});
  assert.equal(result.summary.completed,1);
  assert.equal(result.summary.completedSets,1);
  assert.equal(result.summary.currentWeekVolume,500);
});

test("sesión finalizada remota alimenta Progreso",()=>{
  const result=aggregate({remoteHistory:[workout({id:"remote-1"})]});
  assert.equal(result.summary.completed,1);
  assert.equal(result.diagnostics.rawCounts.remoteHistory,1);
});

test("misma sesión local y remota se deduplica",()=>{
  const item=workout({id:"same-1"});
  const result=aggregate({history:[item],remoteHistory:[JSON.parse(JSON.stringify(item))]});
  assert.equal(result.sessions.length,1);
  assert.equal(result.summary.completedSets,1);
  assert.equal(result.summary.currentWeekVolume,500);
});

test("sesión pendiente de sincronización cuenta offline",()=>{
  const item={...workout({id:"pending-1"}),pendingSync:true};
  const result=aggregate({progressRecords:[item]});
  assert.equal(result.summary.pendingSync,1);
  assert.equal(result.summary.currentWeekVolume,500);
});

test("sesión incompleta conserva sus series completadas",()=>{
  const item=workout({id:"active-1",status:"active",done:true});
  delete item.completedAt;
  const result=aggregate({progressRecords:[item]});
  assert.equal(result.summary.incomplete,1);
  assert.equal(result.summary.completedSets,1);
});

test("sesión antigua migrada acepta sets y completedSets sin owner dentro del vault activo",()=>{
  const legacyA=workout({id:"legacy-a",field:"sets"});delete legacyA.ownerId;
  const legacyB=workout({id:"legacy-b",field:"completedSets"});delete legacyB.ownerId;
  const result=aggregate({history:[legacyA,legacyB]});
  assert.equal(result.summary.completed,2);
  assert.equal(result.summary.completedSets,2);
});

test("dos usuarios distintos no se mezclan",()=>{
  const result=aggregate({
    history:[workout({id:"own"}),workout({id:"foreign",ownerId:OWNER_B})],
    progressRecords:[workout({id:"foreign-progress",ownerId:OWNER_B})]
  });
  assert.equal(result.sessions.length,1);
  assert.equal(result.diagnostics.discarded["otro propietario"],2);
});

test("ejercicio sin ficha conserva volumen bajo Sin clasificar",()=>{
  const result=aggregate({history:[workout({id:"unknown",name:"Ejercicio propio",exerciseId:"custom"})]});
  assert.equal(result.summary.currentWeekVolume,500);
  assert.equal(result.weeks.at(-1).muscleSets["Sin clasificar"],1);
  assert.equal(result.records[0].name,"Ejercicio propio");
});

test("sesión sin RIR y sin duración no inventa promedios",()=>{
  const item=workout({id:"sparse",rir:null,durationMs:null});
  const result=aggregate({history:[item]});
  assert.equal(result.summary.averageRir,null);
  assert.equal(result.summary.averageDurationMs,null);
});

test("semanas y cambios de día usan calendario local",()=>{
  const start=api.localWeekStart("2026-08-03T00:15:00+02:00");
  assert.equal(start.getDay(),1);
  assert.equal(start.getHours(),0);
  const result=aggregate({history:[
    workout({id:"sun",date:"2026-08-02T23:30:00+02:00"}),
    workout({id:"mon",date:"2026-08-03T00:30:00+02:00"})
  ]});
  assert.equal(result.weeks.at(-2).workouts,1);
  assert.equal(result.weeks.at(-1).workouts,1);
});

test("reintento remoto idempotente no duplica volumen ni récords",()=>{
  const item=workout({id:"retry"});
  const once=aggregate({history:[item],remoteProgress:[item]});
  const retried=aggregate({history:[item],remoteProgress:[item,item]});
  assert.equal(retried.summary.currentWeekVolume,once.summary.currentWeekVolume);
  assert.equal(retried.records.length,once.records.length);
  assert.equal(retried.sessions.length,1);
});

test("cuatro sesiones en dos semanas producen métricas distintas de cero y evolución",()=>{
  const history=[
    workout({id:"w1",date:"2026-07-28T18:00:00+02:00",weight:40,reps:8}),
    workout({id:"w2",date:"2026-07-31T18:00:00+02:00",weight:42,reps:8}),
    workout({id:"w3",date:"2026-08-04T18:00:00+02:00",weight:45,reps:9}),
    workout({id:"w4",date:"2026-08-07T18:00:00+02:00",weight:47,reps:10})
  ];
  const result=aggregate({history,plannedSessionsPerWeek:2});
  assert.equal(result.summary.sessions14,4);
  assert.equal(result.summary.completed,4);
  assert.equal(result.summary.completedSets,4);
  assert.ok(result.weeks.at(-2).volume>0);
  assert.ok(result.weeks.at(-1).volume>0);
  assert.ok(result.comparison.increasedWeight.includes("Press banca"));
  assert.ok(result.comparison.increasedReps.includes("Press banca"));
  assert.ok(result.comparison.newRecords.includes("Press banca"));
  assert.equal(result.summary.adherence.available,true);
});

test("adherencia no se calcula sin planificación explícita",()=>{
  assert.equal(aggregate({history:[workout()]}).summary.adherence.available,false);
});
