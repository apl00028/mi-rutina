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
const modelSource=sourceBetween("function homeValidDate(","function homeDashboardState(");
const pureModelSource=sourceBetween("function homeValidDate(","function readHomeDraft(");
const renderSource=sourceBetween("function renderHome()","function isTimedExercise(");

function models(){
  const context={
    Intl,Date,Math,Number,String,Array,Set,
    mondayOf(value){
      const date=new Date(value);
      const day=(date.getDay()+6)%7;
      date.setDate(date.getDate()-day);
      date.setHours(0,0,0,0);
      return date;
    },
    addDays(value,days){
      const date=new Date(value);
      date.setDate(date.getDate()+days);
      return date;
    },
    homeGreeting:()=> "Buenas tardes",
    homeDateLabel:()=> "Miércoles · 29 julio",
    homeSessionProfile:()=>({focus:"Cuerpo completo",heroType:"strength"}),
    esc:value=>String(value),
    formatDate:value=>String(value).slice(0,10),
    formatBodyNumber:value=>String(value).replace(".",","),
    signedBodyValue:(value,unit)=>`${value>0?"+":"−"}${Math.abs(value)} ${unit}`
  };
  vm.createContext(context);
  vm.runInContext(`${modelSource};this.api={
    homeHeaderModel,nextSessionModel,homeSessionPreviewModel,weeklyGoalModel,recoverySummaryModel,
    weeklyActivityModel,recentProgressModel,lastWorkoutModel,
    renderHomeNextSession,renderHomeSessionPreview,renderHomeWeeklyGoal,renderHomeRecovery,
    renderHomeWeek,renderHomeProgress,renderHomeLastWorkout
  };`,context);
  return context.api;
}

function session(index){
  return {
    sessionId:`session-${index}`,
    name:`Sesión ${index}`,
    focus:index===2?"Espalda y cadena posterior":"",
    estimatedDurationMinutes:40+index,
    exercises:[{name:"Ejercicio 1"},{name:"Ejercicio 2"}]
  };
}
const now=new Date("2026-07-29T12:00:00.000Z");

test("home: la estructura visual sigue la jerarquía funcional y el pensamiento queda al final",()=>{
  for(const token of [
    "home-context-header","home-primary-grid","renderHomeNextSession(dashboard.next)",
    "renderHomeWeeklyGoal(dashboard.weekly)","renderHomeRecovery(dashboard.recovery)",
    "renderHomeWeek(dashboard.activity)","home-detail-grid",
    "renderHomeProgress(dashboard.progress)","renderHomeLastWorkout(dashboard.lastWorkout)"
  ]) assert.ok(renderSource.includes(token),token);
  assert.ok(renderSource.indexOf("${thought}")>renderSource.indexOf("renderHomeLastWorkout"));
  assert.doesNotMatch(renderSource,/renderHomeQuickActions|renderHomeCoachInsight|homeDashboardHero/);
  assert.doesNotMatch(renderSource,/>HOY</);
});

test("home: el saludo es contextual, queda fuera de la topbar y resume la semana solo con objetivo",()=>{
  const api=models();
  const header=api.homeHeaderModel({
    now,name:"Adrián Pérez",session:session(2),focus:"Espalda",
    hasRoutine:true,weekly:{configured:true,count:1,goal:3}
  });
  assert.equal(header.name,"Adrián");
  assert.equal(header.description,"Hoy toca espalda.");
  assert.equal(header.weeklySummary,"1 de 3 sesiones esta semana");
  assert.doesNotMatch(renderSource,/class="topbar home-topbar"/);
});

test("home: la próxima sesión usa sessionId y admite de dos a seis sesiones",()=>{
  const api=models();
  for(let count=2;count<=6;count++){
    const sessions=Array.from({length:count},(_,index)=>session(index+1));
    const model=api.nextSessionModel({
      sessions,selectedSessionId:`session-${count}`,routineAvailable:true
    });
    assert.equal(model.sessionId,`session-${count}`);
    assert.equal(model.name,`Sesión ${count}`);
    assert.equal(model.canChange,true);
  }
});

test("home: la acción principal distingue draft, sesión nueva, ausencia e invalidez",()=>{
  const api=models();
  const sessions=[session(1),session(2)];
  assert.equal(api.nextSessionModel({
    sessions,selectedSessionId:"session-1",draft:{draftId:"d1"},draftStatus:"current"
  }).primaryLabel,"Continuar entrenamiento");
  assert.equal(api.nextSessionModel({
    sessions,selectedSessionId:"session-1"
  }).primaryLabel,"Comenzar entrenamiento");
  assert.equal(api.nextSessionModel({
    sessions:[],routineAvailable:false
  }).primaryLabel,"Crear mi rutina");
  assert.equal(api.nextSessionModel({
    sessions:[{sessionId:"broken"}],routineValid:false
  }).primaryLabel,"Revisar mi rutina");
});

test("home: Ver sesion presenta el plan completo y la referencia sin iniciarlo",()=>{
  const api=models();
  const planned={
    sessionId:"session-preview",name:"Torso A",focus:"Pecho y espalda",
    estimatedDurationMinutes:52,notes:"Prioriza la tecnica",exercises:[{
      exerciseId:"press",name:"Press banca",notes:"Pausa breve",
      prescription:{sets:4,target:{type:"repetitions",min:8,max:10},targetRir:{min:1,max:2},restSeconds:120}
    }]
  };
  const exerciseLibrary=[{
    id:"press",name:"Press banca",
    instructions:{short:"Empuje horizontal",setup:["Apoya los pies"],execution:["Baja con control"]}
  }];
  const model=api.nextSessionModel({sessions:[planned],exerciseLibrary});
  assert.equal(model.preview.name,"Torso A");
  assert.equal(model.preview.duration,52);
  assert.equal(model.preview.exerciseCount,1);
  assert.deepEqual(JSON.parse(JSON.stringify(model.preview.exercises[0])),{
    order:1,name:"Press banca",sets:4,target:"8\u201310 reps",rir:"1\u20132",restSeconds:120,
    notes:"Pausa breve",reference:{
      name:"Press banca",short:"Empuje horizontal",setup:["Apoya los pies"],execution:["Baja con control"]
    }
  });
  const html=api.renderHomeSessionPreview(model.preview);
  for(const text of ["Torso A","Pecho y espalda","52 min","4","8\u201310 reps","1\u20132","120 s","Pausa breve","Ver ficha t\u00e9cnica"]){
    assert.ok(html.includes(text),text);
  }
});

test("home: las acciones se ordenan comenzar, ver y cambiar; la vista solo abre y cierra",()=>{
  const api=models();
  const html=api.renderHomeNextSession(api.nextSessionModel({
    sessions:[session(1),session(2)],selectedSessionId:"session-1"
  }));
  assert.ok(html.indexOf("Comenzar entrenamiento")<html.indexOf("Ver sesi\u00f3n"));
  assert.ok(html.indexOf("Ver sesi\u00f3n")<html.indexOf("Cambiar sesi\u00f3n"));
  const from=renderSource.indexOf("const homeViewSession=");
  const to=renderSource.indexOf("const homeSecondaryAction=",from);
  assert.ok(from>=0&&to>from);
  const previewHandlers=renderSource.slice(from,to);
  assert.match(previewHandlers,/showModal\(\)/);
  assert.match(previewHandlers,/\.close\(\)/);
  assert.doesNotMatch(previewHandlers,/navigateToScreen|save|draft|timer|history|localStorage/i);
});

test("home: el objetivo semanal cuenta historial válido, completa y evita NaN sin objetivo",()=>{
  const api=models();
  const history=[
    {date:"2026-07-27T10:00:00.000Z"},
    {date:"2026-07-29T10:00:00.000Z"},
    {date:"no-date"},
    {date:"2026-07-20T10:00:00.000Z"}
  ];
  const normal=api.weeklyGoalModel({history,goal:3,now});
  assert.deepEqual(
    {count:normal.count,goal:normal.goal,remaining:normal.remaining,percentage:normal.percentage,complete:normal.complete},
    {count:2,goal:3,remaining:1,percentage:67,complete:false}
  );
  const completed=api.weeklyGoalModel({history,goal:2,now});
  assert.equal(completed.complete,true);
  const missing=api.weeklyGoalModel({history,goal:null,now});
  assert.equal(missing.configured,false);
  assert.equal(Number.isNaN(missing.percentage),false);
  assert.doesNotMatch(api.renderHomeWeeklyGoal(missing),/NaN|Infinity/);
});

test("home: Recuperación representa pendiente, completada, vacía y módulo no disponible",()=>{
  const api=models();
  const pending=api.recoverySummaryModel({available:true,pending:{id:"check-1"}});
  assert.equal(pending.status,"pending");
  assert.equal(pending.action,"checkin");
  assert.match(api.renderHomeRecovery(pending),/Completar check-in/);
  assert.equal(api.recoverySummaryModel({available:true}).status,"idle");
  assert.equal(api.recoverySummaryModel({available:false}).status,"unavailable");
  const completed=api.recoverySummaryModel({
    available:true,entry:{recoveryScore:82},label:"Buena"
  });
  assert.equal(completed.detail,"Evaluación completada hoy.");
  assert.doesNotMatch(JSON.stringify(completed),/82|score/i);
  assert.match(appSource,/window\.GymOSRecovery\?\.dueCheckin/);
  assert.match(renderSource,/window\.GymOSRecovery\.startCheckin/);
  assert.doesNotMatch(renderSource,/renderRecoveryCenter/);
});

test("home: Tu semana usa actividad real, no inventa fechas y conserva seis sesiones",()=>{
  const api=models();
  const sessions=Array.from({length:6},(_,index)=>session(index+1));
  const rows=api.weeklyActivityModel({
    sessions,
    selectedSessionId:"session-2",
    drafts:[{sessionId:"session-3",status:"current"}],
    history:[{sessionId:"session-1",date:"2026-07-28T10:00:00.000Z"}],
    now
  });
  assert.equal(rows.length,6);
  assert.equal(rows[0].status,"completed");
  assert.equal(rows[1].status,"next");
  assert.equal(rows[2].status,"draft");
  assert.equal(rows[3].status,"pending");
  assert.equal(rows[3].completedAt,null);
  assert.doesNotMatch(JSON.stringify(rows),/viernes|programada/i);
});

test("home: progreso muestra tendencias solo con dos mediciones y maneja vacío",()=>{
  const api=models();
  const one=api.recentProgressModel({
    bodyHistory:[{date:"2026-07-20",weight:79.2}],history:[],now
  });
  assert.equal(one.metrics.find(item=>item.key==="weight").trend,null);
  const two=api.recentProgressModel({
    bodyHistory:[
      {date:"2026-06-20",weight:80,waist:85},
      {date:"2026-07-20",weight:79.2,waist:84}
    ],
    history:[{date:"2026-07-10"}],now
  });
  assert.ok(Math.abs(two.metrics.find(item=>item.key==="weight").trend+0.8)<1e-9);
  assert.equal(two.metrics.find(item=>item.key==="monthlySessions").value,1);
  const empty=api.recentProgressModel({bodyHistory:[],history:[],now});
  assert.equal(empty.empty,true);
  assert.match(api.renderHomeProgress(empty),/Registrar primera medición/);
});

test("home: el último entrenamiento prioriza snapshot moderno y mantiene legacy",()=>{
  const api=models();
  const modern=api.lastWorkoutModel({history:[{
    id:"w-1",date:"2026-07-28T10:00:00.000Z",sessionName:"Sesión original",
    sessionSnapshot:{name:"Snapshot original",focus:"Torso"},
    durationMs:2880000,
    exercises:[{series:[{done:true}]},{series:[{done:false}]}]
  }]});
  assert.equal(modern.name,"Sesión original");
  assert.equal(modern.focus,"Torso");
  assert.equal(modern.durationMinutes,48);
  assert.equal(modern.completedExercises,1);
  const legacy=api.lastWorkoutModel({history:[{
    id:2,date:"2026-07-27",session:"B",duration:45,exercises:[]
  }]});
  assert.equal(legacy.name,"Sesión B");
  assert.equal(legacy.durationMinutes,45);
  assert.equal(api.lastWorkoutModel({history:[]}).available,false);
});

test("home: los modelos son puros, serializables e inmutables respecto a sus entradas",()=>{
  const api=models();
  const input={
    sessions:[session(1),session(2)],
    history:[{sessionId:"session-1",date:"2026-07-28"}],
    bodyHistory:[{date:"2026-07-20",weight:79}]
  };
  const before=JSON.stringify(input);
  const results=[
    api.nextSessionModel({sessions:input.sessions,selectedSessionId:"session-1"}),
    api.homeSessionPreviewModel({session:input.sessions[0],exerciseLibrary:[]}),
    api.weeklyGoalModel({history:input.history,goal:3,now}),
    api.weeklyActivityModel({sessions:input.sessions,history:input.history,now}),
    api.recentProgressModel({bodyHistory:input.bodyHistory,history:input.history,now}),
    api.lastWorkoutModel({history:input.history})
  ];
  assert.equal(JSON.stringify(input),before);
  assert.doesNotThrow(()=>JSON.stringify(results));
  assert.doesNotMatch(pureModelSource,/localStorage|supabase|setTimeout|setInterval|document\.|window\.|getHistory\(/i);
});

test("home: render y navegación no escriben rutina ni historial",()=>{
  const before={
    routine:JSON.stringify({routineId:"r-1"}),
    history:JSON.stringify([{id:"h-1"}])
  };
  const api=models();
  api.renderHomeNextSession(api.nextSessionModel({
    sessions:[session(1),session(2)],selectedSessionId:"session-1"
  }));
  api.renderHomeLastWorkout(api.lastWorkoutModel({history:JSON.parse(before.history)}));
  assert.deepEqual(before,{
    routine:JSON.stringify({routineId:"r-1"}),
    history:JSON.stringify([{id:"h-1"}])
  });
  assert.doesNotMatch(renderSource,/saveRoutine|saveHistory|saveDraft|markLocalUpdated|localStorage\.(setItem|removeItem)/);
});

test("home: responsive, accesibilidad y listeners permanecen explícitos",()=>{
  assert.match(stylesSource,/@media\(max-width:1199px\)[\s\S]*\.home-summary-stack\{grid-template-columns:repeat\(2/);
  assert.match(stylesSource,/@media\(max-width:767px\)[\s\S]*\.home-last-workout-card\{order:6\}[\s\S]*\.home-progress-card\{order:7\}/);
  assert.match(stylesSource,/\.home-primary-grid\{[\s\S]*grid-template-columns:minmax\(0,2fr\)/);
  assert.match(stylesSource,/@media\(max-width:390px\)/);
  for(const token of [
    'aria-labelledby="homeGreetingTitle"','role="progressbar"',
    'aria-valuemin="0"','aria-valuemax="100"','type="button"',
    'aria-labelledby="homeSessionPreviewTitle"','aria-label="Cerrar vista de sesi\u00f3n"'
  ]) assert.ok(appSource.includes(token),token);
  assert.doesNotMatch(renderSource,/\.onclick\s*=/);
  assert.match(renderSource,/addEventListener\("click"[\s\S]*\{once:true\}/);
  assert.doesNotMatch(renderSource,/<[^>]+\sonclick=/);
});
