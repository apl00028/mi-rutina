const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const root=path.join(__dirname,"..");
const recoverySource=fs.readFileSync(path.join(root,"recovery-center.js"),"utf8");
const appSource=fs.readFileSync(path.join(root,"app.js"),"utf8");
const stylesSource=fs.readFileSync(path.join(root,"styles.css"),"utf8");

function storage(){
  const values=new Map();
  return {
    get length(){return values.size;},
    key(index){return [...values.keys()][index]??null;},
    getItem(key){return values.has(key)?values.get(key):null;},
    setItem(key,value){values.set(String(key),String(value));},
    removeItem(key){values.delete(String(key));},
    snapshot(){return Object.fromEntries(values);}
  };
}
function dateKey(value){
  const date=new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
function loadRecovery({owner="11111111-1111-4111-8111-111111111111",history=[]}={}){
  const localStorage=storage();
  const context={
    window:{},localStorage,state:{recoveryView:"overview"},navigator:{onLine:true},
    currentOwner:owner,history:[...history],
    currentRoutineOwnerOrNull(){return context.currentOwner;},
    getHistory(){return context.history;},
    dateKey,esc:value=>String(value??"").replace(/[<>&"']/g,""),
    formatDuration:value=>`${Math.round(Number(value||0)/60000)} min`,
    markLocalUpdated(){context.marks=(context.marks||0)+1;},
    autoSync(){context.syncs=(context.syncs||0)+1;},
    isAppAuthenticated(){return true;},
    getSupabaseClient(){return null;},
    nav(){return "";},bindNav(){},navigateToScreen(){},
    app:{innerHTML:""},document:{querySelector(){return null;}},
    queueMicrotask,console,Date,setTimeout,clearTimeout
  };
  vm.createContext(context);
  vm.runInContext(recoverySource,context,{filename:"recovery-center.js"});
  return {api:context.window.GymOSRecovery,context,localStorage};
}
const completeAnswers={
  sleepQuality:4,energy:4,fatigue:1,painLevel:0,motivation:4,stress:2,
  painLocation:[],notes:""
};
function workout(id="workout-1"){
  return {
    id,ownerId:"11111111-1111-4111-8111-111111111111",
    routineId:"routine-1",sessionId:"session-a",session:"A",
    sessionName:"Sesión A",date:"2026-07-28T18:00:00+02:00",
    durationMs:2700000,exercises:[{name:"Remo"},{name:"Jalón"}],
    sessionSnapshot:{focus:"Espalda y cadena posterior"}
  };
}

test("crea un único check-in al finalizar un entrenamiento guardado",()=>{
  const item=workout();
  const {api,context}=loadRecovery({history:[item]});
  const first=api.createPendingCheckin(item);
  const second=api.createPendingCheckin(item);
  assert.equal(first.id,second.id);
  assert.equal(api.getCheckins().length,1);
  assert.equal(first.availableFrom,"2026-07-29");
  assert.equal(context.marks,1);
});

test("no crea check-in para un entrenamiento descartado o ajeno",()=>{
  const item=workout();
  const loaded=loadRecovery({history:[]});
  assert.equal(loaded.api.createPendingCheckin(item),null);
  loaded.context.history=[{...item,ownerId:"22222222-2222-4222-8222-222222222222"}];
  assert.equal(loaded.api.createPendingCheckin(loaded.context.history[0]),null);
});

test("el snapshot histórico conserva sesión, foco y duración",()=>{
  const item=workout();
  const {api}=loadRecovery({history:[item]});
  const checkin=api.createPendingCheckin(item);
  assert.deepEqual(
    JSON.parse(JSON.stringify(checkin.workoutSnapshot)),
    {sessionName:"Sesión A",sessionFocus:"Espalda y cadena posterior",durationMs:2700000,completedExercises:2}
  );
  assert.equal(checkin.routineId,"routine-1");
  assert.equal(checkin.sessionId,"session-a");
});

test("guardar completa check-in y entrada una sola vez sin tocar el historial",()=>{
  const item=workout();
  const {api,context}=loadRecovery({history:[item]});
  const checkin=api.createPendingCheckin(item);
  const historyBefore=JSON.stringify(context.history);
  const first=api.completeRecoveryAssessment({
    checkinId:checkin.id,draft:completeAnswers,
    ownerId:context.currentOwner,completedAt:"2026-07-29T08:00:00.000Z"
  });
  assert.equal(first.checkin.status,"completed");
  assert.equal(api.getEntries().length,1);
  assert.equal(JSON.stringify(context.history),historyBefore);
  assert.throws(()=>api.completeRecoveryAssessment({
    checkinId:checkin.id,draft:completeAnswers,
    ownerId:context.currentOwner,completedAt:"2026-07-29T08:00:00.000Z"
  }),/checkin_stale/);
  assert.equal(api.getEntries().length,1);
});

test("guardar offline conserva owner y deja la sincronización pendiente",()=>{
  const item=workout();
  const {api,context,localStorage}=loadRecovery({history:[item]});
  context.navigator.onLine=false;
  const checkin=api.createPendingCheckin(item,{mark:false,sync:false});
  api.completeRecoveryAssessment({
    checkinId:checkin.id,draft:completeAnswers,
    ownerId:context.currentOwner,completedAt:"2026-07-29T08:00:00.000Z"
  });
  assert.equal(api.getEntries()[0].ownerId,context.currentOwner);
  assert.equal(context.syncs,1);
  assert.ok(localStorage.getItem(api.storageKey));
});

test("un propietario distinto no puede completar ni modificar el check-in",()=>{
  const item=workout();
  const {api,context,localStorage}=loadRecovery({history:[item]});
  const checkin=api.createPendingCheckin(item,{mark:false,sync:false});
  const before=JSON.stringify(localStorage.snapshot());
  assert.throws(()=>api.completeRecoveryAssessment({
    checkinId:checkin.id,draft:completeAnswers,
    ownerId:"22222222-2222-4222-8222-222222222222",
    completedAt:"2026-07-29T08:00:00.000Z"
  }),/owner_changed/);
  assert.equal(JSON.stringify(localStorage.snapshot()),before);
  assert.equal(context.currentOwner,item.ownerId);
});

test("los estados cubren primer uso, próximo, pendiente y completado",()=>{
  const {api}=loadRecovery();
  assert.equal(api.recoveryPendingModel({referenceDate:"2026-07-29"}).state,"first_use");
  const pending={id:"c1",status:"pending",workoutDate:"2026-07-28",availableFrom:"2026-07-30"};
  assert.equal(api.recoveryPendingModel({checkins:[pending],referenceDate:"2026-07-29"}).state,"upcoming");
  assert.equal(api.recoveryPendingModel({checkins:[pending],referenceDate:"2026-07-30"}).state,"pending");
  assert.equal(api.recoveryPendingModel({
    entries:[{...completeAnswers,date:"2026-07-30"}],referenceDate:"2026-07-30"
  }).state,"completed_today");
});

test("los estados distinguen idle, offline, error recuperable y sesión caducada",()=>{
  const {api}=loadRecovery();
  const old={...completeAnswers,date:"2026-07-28"};
  assert.equal(api.recoveryPendingModel({entries:[old],referenceDate:"2026-07-29"}).state,"idle");
  assert.equal(api.recoveryPendingModel({entries:[old],referenceDate:"2026-07-29",online:false}).online,false);
  assert.deepEqual(
    JSON.parse(JSON.stringify(api.recoveryPendingModel({
      referenceDate:"2026-07-29",error:{code:"network",retryable:true}
    }))),
    {state:"error",title:"No se pudo actualizar Recuperación.",retryable:true,networkState:"online"}
  );
  assert.equal(api.recoveryPendingModel({referenceDate:"2026-07-29",authenticated:false}).state,"session_error");
});

test("el cuestionario contiene exactamente seis preguntas con etiquetas humanas",()=>{
  const {api}=loadRecovery();
  const model=api.recoveryQuestionnaireModel({answers:{}});
  assert.equal(model.questions.length,6);
  assert.deepEqual(
    JSON.parse(JSON.stringify(model.questions.map(question=>question.id))),
    ["sleepQuality","energy","fatigue","painLevel","motivation","stress"]
  );
  assert.equal(model.questions.every(question=>question.options.every(option=>typeof option.label==="string")),true);
});

test("todas las respuestas son obligatorias y la molestia relevante pide zona",()=>{
  const {api}=loadRecovery();
  assert.equal(api.recoveryQuestionnaireModel({answers:{}}).complete,false);
  assert.equal(api.recoveryQuestionnaireModel({answers:{...completeAnswers,painLevel:2}}).complete,false);
  const valid=api.recoveryQuestionnaireModel({
    answers:{...completeAnswers,painLevel:2,painLocation:["Rodilla"]}
  });
  assert.equal(valid.complete,true);
  assert.equal(valid.relevantPain,true);
});

test("al reducir la molestia se ignoran zona y comentario y se limita el texto",()=>{
  const {api}=loadRecovery();
  const hidden=api.recoveryQuestionnaireModel({
    answers:{...completeAnswers,painLevel:1,painLocation:["Rodilla"],notes:"privado"}
  });
  assert.deepEqual(JSON.parse(JSON.stringify(hidden.selectedPainLocations)),[]);
  assert.equal(hidden.comment,"");
  const limited=api.recoveryQuestionnaireModel({
    answers:{...completeAnswers,painLevel:2,painLocation:["Rodilla"],notes:"x".repeat(400)}
  });
  assert.equal(limited.comment.length,300);
});

for(const [name,answers,status] of [
  ["preparado",completeAnswers,"ready"],
  ["margen",{...completeAnswers,energy:2,fatigue:3},"margin"],
  ["recuperación baja",{...completeAnswers,sleepQuality:1,energy:1,fatigue:4,stress:5},"low"],
  ["molestia relevante",{...completeAnswers,painLevel:3,painLocation:["Rodilla"]},"pain_review"]
]){
  test(`interpreta el resultado ${name} de forma determinista`,()=>{
    const {api}=loadRecovery();
    const before=JSON.stringify(answers);
    const first=api.recoveryResultModel({answers,completedAt:"2026-07-29T08:00:00.000Z"});
    const second=api.recoveryResultModel({answers,completedAt:"2026-07-29T08:00:00.000Z"});
    assert.equal(first.status,status);
    assert.deepEqual(first,second);
    assert.equal(first.reasons.length<=3,true);
    assert.equal(JSON.stringify(answers),before);
    assert.equal("score" in first,false);
  });
}

test("la seguridad por dolor domina el resto de señales positivas",()=>{
  const {api}=loadRecovery();
  const result=api.recoveryResultModel({
    answers:{...completeAnswers,sleepQuality:5,energy:5,fatigue:0,motivation:5,stress:1,painLevel:4,painLocation:["Rodilla"]}
  });
  assert.equal(result.status,"pain_review");
  assert.match(result.guidance,/dolor|valóralo/i);
});

test("el historial no inventa gráfico con cero o un registro",()=>{
  const {api}=loadRecovery();
  assert.equal(api.recoveryHistoryModel({entries:[],referenceDate:"2026-07-29"}).state,"empty");
  const single=api.recoveryHistoryModel({entries:[{...completeAnswers,date:"2026-07-29"}],referenceDate:"2026-07-29"});
  assert.equal(single.state,"single");
  assert.equal(single.trend.available,false);
});

test("el historial con dos registros conserva días sin evaluación y fechas válidas",()=>{
  const {api}=loadRecovery();
  const model=api.recoveryHistoryModel({
    entries:[
      {...completeAnswers,date:"2026-07-27"},
      {...completeAnswers,date:"2026-07-29",energy:3}
    ],
    referenceDate:"2026-07-29"
  });
  assert.equal(model.state,"trend");
  assert.equal(model.items.length,7);
  assert.equal(model.items.some(item=>item.entry===null),true);
  assert.equal(JSON.stringify(model).includes("NaN"),false);
});

test("una tendencia solo se explica con el mínimo documentado",()=>{
  const {api}=loadRecovery();
  const entries=["2026-07-27","2026-07-28","2026-07-29"].map((date,index)=>({
    ...completeAnswers,date,energy:index+2
  }));
  const model=api.recoveryTrendModel({entries});
  assert.equal(model.minimum,3);
  assert.equal(model.count,3);
  assert.equal(model.observations.length<=3,true);
});

test("merge conserva conflictos sin sustituirlos silenciosamente",()=>{
  const {api,localStorage}=loadRecovery();
  api.saveEntries([{...completeAnswers,id:"r1",date:"2026-07-29",ownerId:"11111111-1111-4111-8111-111111111111",updatedAt:"2026-07-29T08:00:00Z"}],false);
  api.mergeRecoveryEntries([{...completeAnswers,id:"r1",date:"2026-07-29",energy:1,ownerId:"11111111-1111-4111-8111-111111111111",updatedAt:"2026-07-29T09:00:00Z"}],false);
  assert.equal(api.getEntries()[0].conflictVariants.length,1);
  assert.ok(localStorage.getItem(api.storageKey));
});

test("dos IDs para el mismo workout se deduplican sin perder el conflicto",()=>{
  const {api,context}=loadRecovery();
  const base={
    workoutId:"workout-1",ownerId:context.currentOwner,userId:context.currentOwner,
    workoutDate:"2026-07-28T18:00:00Z",availableFrom:"2026-07-29",
    status:"pending",createdAt:"2026-07-28T19:00:00Z",updatedAt:"2026-07-28T19:00:00Z"
  };
  api.saveCheckins([
    {...base,id:"legacy-id",sessionName:"Nombre antiguo"},
    {...base,id:"recovery-checkin-workout-1",sessionName:"Sesión A"}
  ],false);
  const saved=api.getCheckins();
  assert.equal(saved.length,1);
  assert.equal(saved[0].id,"recovery-checkin-workout-1");
  assert.equal(saved[0].conflictVariants.length,1);
});

test("el cambio de propietario oculta registros y check-ins de otra cuenta",()=>{
  const {api,context}=loadRecovery();
  api.saveEntries([{...completeAnswers,date:"2026-07-29"}],false);
  context.currentOwner="22222222-2222-4222-8222-222222222222";
  assert.equal(api.getEntries().length,0);
  assert.equal(api.getCheckins().length,0);
});

test("Inicio consume el modelo público y Entrenamiento la orientación pública",()=>{
  assert.match(appSource,/api\.recoveryHomeSummaryModel\(/);
  assert.match(appSource,/recoveryApi\?\.resultForEntry\?\.\(entry\)/);
  assert.match(appSource,/active-workout-recovery/);
  assert.doesNotMatch(appSource,/activeWorkoutRecoveryGuidanceModel[\s\S]{0,900}saveRoutine\(/);
});

test("la finalización crea el check-in dentro de la transacción y no abre el cuestionario",()=>{
  const finish=appSource.slice(appSource.indexOf("function finishWorkout()"),appSource.indexOf("function showRecordsCelebration("));
  const transaction=finish.slice(finish.indexOf("const before="),finish.indexOf("}catch(error)"));
  assert.match(transaction,/createPendingCheckin\?\.\(workout,\{mark:false,sync:false\}\)/);
  assert.ok(transaction.indexOf("createPendingCheckin")<transaction.indexOf("markLocalUpdated"));
  const completion=recoverySource.slice(
    recoverySource.indexOf("function renderWorkoutComplete()"),
    recoverySource.indexOf("window.GymOSRecovery=Object.freeze")
  );
  assert.match(completion,/Ahora toca recuperar/);
  assert.doesNotMatch(completion,/Completar check-in|recoveryQuestionnaireModel|Recovery Score/);
});

test("la API pública expone los seis modelos puros y la navegación oficial",()=>{
  const {api}=loadRecovery();
  for(const name of [
    "recoveryPendingModel","recoveryQuestionnaireModel","recoveryResultModel",
    "recoveryHistoryModel","recoveryTrendModel","recoveryHomeSummaryModel"
  ]) assert.equal(typeof api[name],"function");
  assert.match(recoverySource,/navigateToScreen\("history"\)/);
  assert.match(recoverySource,/navigateToScreen\("home"\)/);
});

test("la UI normal no muestra nombre inglés, puntuación opaca ni gráfico vacío",()=>{
  const experience=recoverySource.slice(recoverySource.indexOf("function renderRecoveryHistoryExperience"));
  assert.doesNotMatch(experience,/Recovery Center|Recovery Score|recovery-score-ring|recovery-chart/);
  assert.doesNotMatch(experience,/<strong[^>]*>\s*\$\{[^}]*recoveryScore/);
  assert.match(experience,/Motivos principales/);
});

test("la UI es accesible, responsive y no usa handlers inline",()=>{
  assert.match(recoverySource,/fieldset class="recovery-question"/);
  assert.match(recoverySource,/role="alert"/);
  assert.match(recoverySource,/aria-labelledby="recoveryResultTitle"/);
  assert.doesNotMatch(recoverySource,/onclick\s*=|\.onclick\s*=/);
  assert.match(stylesSource,/@media\s*\(max-width:620px\)/);
  assert.match(stylesSource,/prefers-reduced-motion:reduce/);
});

test("renderizar Recuperación no contiene writers de rutina o historial",()=>{
  assert.doesNotMatch(recoverySource,/\bsaveRoutine\s*\(|\bsaveHistory\s*\(/);
  assert.doesNotMatch(recoverySource,/localStorage\.setItem\(["']gymos:(routine|history)/);
});

test("el modelo y el render no mutan rutina ni historial",()=>{
  const routine={id:"routine",sessions:[{id:"a"}]};
  const history=[workout()];
  const beforeRoutine=JSON.stringify(routine);
  const beforeHistory=JSON.stringify(history);
  const {api}=loadRecovery({history});
  api.recoveryHomeSummaryModel({
    entries:[],checkins:[],referenceDate:"2026-07-29",online:false,authenticated:true
  });
  api.recoveryResultModel({answers:completeAnswers,completedAt:"2026-07-29T08:00:00Z"});
  assert.equal(JSON.stringify(routine),beforeRoutine);
  assert.equal(JSON.stringify(history),beforeHistory);
});

test("el SQL mantiene RLS y añade contexto histórico sin credenciales",()=>{
  const sql=fs.readFileSync(path.join(root,"supabase-recovery-center.sql"),"utf8");
  assert.match(sql,/enable row level security/i);
  assert.match(sql,/\(select auth\.uid\(\)\) = user_id/i);
  assert.match(sql,/workout_snapshot jsonb/i);
  assert.doesNotMatch(sql,/service_role|secret[_ -]?key/i);
});

test("el service worker solo cachea assets locales y nunca respuestas privadas",()=>{
  const worker=fs.readFileSync(path.join(root,"service-worker.js"),"utf8");
  assert.match(worker,/url\.origin!==self\.location\.origin/);
  assert.match(worker,/e\.request\.method!=="GET"/);
  assert.doesNotMatch(worker,/dailyRecovery|recoveryCheckins|supabase\.co|auth\/v1|rest\/v1/);
});
