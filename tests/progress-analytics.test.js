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
    index.indexOf('src="app.js?v='));
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

test("distribucion muscular consolida aliases canonicos sin duplicar series",()=>{
  const item=workout({id:"muscle-aliases"});
  item.exercises=[
    {name:"Press",exerciseId:"press-alias",series:[{done:true}]},
    {name:"Curl femoral",exerciseId:"curl-femoral",series:[{done:true}]},
    {name:"Elevacion lateral",exerciseId:"lateral",series:[{done:true}]},
    {name:"Sentadilla",exerciseId:"squat",series:[{done:true}]}
  ];
  const exerciseLibrary=[
    {id:"press-alias",name:"Press",primaryMuscles:["chest","Pecho"]},
    {id:"curl-femoral",name:"Curl femoral",primaryMuscles:["hamstrings","Isquios"]},
    {id:"lateral",name:"Elevacion lateral",primaryMuscles:["lateral_deltoid","posterior_deltoid","rotator_cuff","Hombros"]},
    {id:"squat",name:"Sentadilla",primaryMuscles:["quadriceps","glutes"]}
  ];
  const result=aggregate({history:[item],exerciseLibrary});
  const muscleSets=JSON.parse(JSON.stringify(result.weeks.at(-1).muscleSets));
  assert.deepEqual(muscleSets,{Pecho:1,Isquios:1,Hombros:1,"Cuádriceps":1});
  assert.equal(Object.values(muscleSets).reduce((sum,value)=>sum+value,0),4);
  assert.equal(Object.keys(muscleSets).some(key=>key.includes("_")),false);
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

test("finalized session counts when performed sets have no metrics",()=>{
  const item=workout({id:"done-without-metrics",weight:null,reps:null,rir:null,durationMs:null});
  item.exercises[0].series.push({setInstanceId:"set-done-2",done:true});
  const result=aggregate({history:[item]});
  assert.equal(result.summary.completed,1);
  assert.equal(result.summary.completedSets,2);
  assert.equal(result.summary.currentWeekVolume,0);
  assert.equal(result.summary.metricAvailability.volume,0);
  assert.equal(result.sessions[0].exercises[0].sets[0].volume,null);
});

test("performed sets with and without metrics count without zero imputation",()=>{
  const item=workout({id:"mixed-metrics"});
  item.exercises[0].series.push({setInstanceId:"set-missing",done:true});
  const result=aggregate({history:[item]});
  assert.equal(result.summary.completedSets,2);
  assert.equal(result.summary.totalReps,10);
  assert.equal(result.summary.currentWeekVolume,500);
  assert.equal(result.summary.metricAvailability.reps,1);
  assert.equal(result.summary.metricAvailability.volume,1);
});

test("performed timed set keeps missing duration absent",()=>{
  const item=workout({id:"timed-missing",weight:null,reps:null,rir:null,durationMs:null});
  const result=aggregate({history:[item]});
  assert.equal(result.summary.completedSets,1);
  assert.equal(result.sessions[0].exercises[0].sets[0].seconds,null);
  assert.equal(result.summary.metricAvailability.seconds,0);
  assert.equal(result.summary.averageDurationMs,null);
});

test("planned active session is not treated as performed",()=>{
  const item=workout({id:"planned",status:"active",done:false,weight:null,reps:null,rir:null,durationMs:null});
  delete item.completedAt;
  delete item.exercises[0].series[0].done;
  const result=aggregate({progressRecords:[item]});
  assert.equal(result.sessions.length,1);
  assert.equal(result.activitySessions.length,0);
  assert.equal(result.summary.completed,0);
  assert.equal(result.summary.incomplete,0);
  assert.equal(result.summary.completedSets,0);
  assert.equal(result.diagnostics.notPerformed,1);
});

test("7 14 and 30 day windows use exact local calendar boundaries",()=>{
  const result=aggregate({history:[
    workout({id:"day-7",date:"2026-08-02T12:00:00+02:00"}),
    workout({id:"day-14",date:"2026-07-26T12:00:00+02:00"}),
    workout({id:"day-30",date:"2026-07-10T12:00:00+02:00"}),
    workout({id:"outside-30",date:"2026-07-09T23:59:59+02:00"})
  ]});
  assert.equal(result.summary.sessions7,1);
  assert.equal(result.summary.sessions14,2);
  assert.equal(result.summary.sessions30,3);
});

test("series sets and completedSets preserve historical evidence",()=>{
  const series=workout({id:"format-series",field:"series",done:true,weight:null,reps:null,rir:null});
  const sets=workout({id:"format-sets",field:"sets",done:false,weight:30,reps:8,rir:null});
  const completedSets=workout({id:"format-completed",field:"completedSets",done:false,weight:null,reps:null,rir:null});
  const result=aggregate({history:[series,sets,completedSets]});
  assert.equal(result.summary.completed,3);
  assert.equal(result.summary.completedSets,3);
  assert.equal(result.summary.currentWeekVolume,240);
});

test("deduplication enriches a sparse set without duplicating it",()=>{
  const sparse=workout({id:"merge-rich",weight:null,reps:null,rir:null});
  const rich=workout({id:"merge-rich",weight:50,reps:10,rir:2});
  const result=aggregate({history:[sparse],remoteHistory:[rich]});
  assert.equal(result.sessions.length,1);
  assert.equal(result.summary.completedSets,1);
  assert.equal(result.summary.currentWeekVolume,500);
  assert.equal(result.summary.metricAvailability.volume,1);
});

test("partial week compares only through the same weekday",()=>{
  const now="2026-08-05T12:00:00+02:00";
  const history=[
    workout({id:"p-mon",date:"2026-07-27T18:00:00+02:00"}),
    workout({id:"p-tue",date:"2026-07-28T18:00:00+02:00"}),
    workout({id:"p-wed",date:"2026-07-29T18:00:00+02:00"}),
    workout({id:"p-sun",date:"2026-08-02T18:00:00+02:00",weight:200}),
    workout({id:"c-mon",date:"2026-08-03T18:00:00+02:00"}),
    workout({id:"c-tue",date:"2026-08-04T18:00:00+02:00"}),
    workout({id:"c-wed",date:"2026-08-05T10:00:00+02:00"})
  ];
  const result=aggregate({history,now});
  assert.equal(result.comparison.previous.workouts,3);
  assert.equal(result.comparison.current.workouts,3);
  assert.equal(result.comparison.volumeChange,0);
});

test("empty previous period yields unavailable comparisons",()=>{
  const result=aggregate({history:[workout({id:"only-current",date:"2026-08-05T10:00:00+02:00"})],now:"2026-08-05T12:00:00+02:00"});
  assert.equal(result.comparison.trend,"sin_comparacion");
  assert.equal(result.comparison.volumeChange,null);
  assert.equal(result.comparison.setChange,null);
  assert.equal(result.comparison.repsChange,null);
  assert.equal(result.comparison.dimensions.volume.status,"sin_comparacion");
});

test("empty current period never becomes minus one hundred or descending",()=>{
  const result=aggregate({
    history:[workout({id:"only-previous",date:"2026-07-29T10:00:00+02:00"})],
    now:"2026-08-05T12:00:00+02:00"
  });
  assert.equal(result.comparison.trend,"sin_comparacion");
  assert.equal(result.comparison.volumeChange,null);
  assert.equal(result.comparison.setChange,null);
  assert.equal(result.comparison.repsChange,null);
  assert.equal(result.comparison.dimensions.volume.status,"sin_comparacion");
  assert.equal(result.comparison.dimensions.volume.current,null);
});

test("two empty periods are reported as no data",()=>{
  const result=aggregate({now:"2026-08-05T12:00:00+02:00"});
  assert.equal(result.comparison.trend,"sin_datos");
  assert.equal(result.comparison.dimensions.sessions.status,"sin_datos");
  assert.equal(result.comparison.dimensions.volume.status,"sin_datos");
});

test("load can improve while volume declines without an opaque score",()=>{
  const result=aggregate({history:[
    workout({id:"mixed-before",date:"2026-07-29T18:00:00+02:00",weight:50,reps:10}),
    workout({id:"mixed-current",date:"2026-08-05T10:00:00+02:00",weight:60,reps:5})
  ],now:"2026-08-05T12:00:00+02:00"});
  assert.equal(result.comparison.trend,"mixta");
  assert.ok(result.comparison.dimensions.load.delta>0);
  assert.ok(result.comparison.dimensions.volume.delta<0);
  assert.equal("score" in result.comparison,false);
});

test("missing RIR stays absent and present RIR is compared",()=>{
  const absent=aggregate({history:[
    workout({id:"rir-a0",date:"2026-07-29T18:00:00+02:00",rir:null}),
    workout({id:"rir-a1",date:"2026-08-05T10:00:00+02:00",rir:null})
  ],now:"2026-08-05T12:00:00+02:00"});
  assert.equal(absent.comparison.dimensions.rir.status,"sin_datos");
  assert.equal(absent.comparison.dimensions.rir.previous,null);
  const present=aggregate({history:[
    workout({id:"rir-p0",date:"2026-07-29T18:00:00+02:00",rir:3}),
    workout({id:"rir-p1",date:"2026-08-05T10:00:00+02:00",rir:2})
  ],now:"2026-08-05T12:00:00+02:00"});
  assert.equal(present.comparison.dimensions.rir.status,"comparable");
  assert.equal(present.comparison.dimensions.rir.delta,-1);
});

test("app renders unavailable comparison without calling toFixed on null",()=>{
  const appSource=fs.readFileSync(path.join(root,"app.js"),"utf8");
  const helper=appSource.match(/function progressComparisonChange\(value\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(helper);
  const format=Function(`${helper};return progressComparisonChange;`)();
  assert.doesNotThrow(()=>format(null));
  assert.equal(format(null),"Sin comparaci\u00f3n suficiente");
  assert.equal(format(12.34),"+12,3 %");
  assert.equal(appSource.includes("Sin comparaci\u00c3"),false);
});
