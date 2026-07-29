"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const test=require("node:test");

const root=path.resolve(__dirname,"..");
const proposalsSource=fs.readFileSync(path.join(root,"routine-proposals.js"),"utf8");
const workflowSource=fs.readFileSync(path.join(root,"routine-workflow-ui.js"),"utf8");
const appSource=fs.readFileSync(path.join(root,"app.js"),"utf8");
const indexSource=fs.readFileSync(path.join(root,"index.html"),"utf8");
const workerSource=fs.readFileSync(path.join(root,"service-worker.js"),"utf8");
const OWNER_A="11111111-1111-4111-8111-111111111111";
const OWNER_B="22222222-2222-4222-8222-222222222222";
const T1="2026-07-28T10:00:00.000Z";

function plain(value){return JSON.parse(JSON.stringify(value));}
function deepFreeze(value){
  if(value&&typeof value==="object"&&!Object.isFrozen(value)){
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
function loadApi(){
  const normalizeOwnerId=value=>{
    if(value==="local") return value;
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value||""))){
      throw new Error("invalid owner");
    }
    return String(value).toLowerCase();
  };
  const context={
    console,
    GymOSProfileData:{
      normalizeOwnerId,
      GOAL_OPTIONS:[{id:"muscle_gain",label:"Ganar masa muscular"}],
      LIFE_STATE_OPTIONS:[{id:"general",label:"Estado general"}],
      TRAINING_PHASE_OPTIONS:[{id:"muscle_gain",label:"Ganancia muscular"}]
    }
  };
  context.window=context;
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(proposalsSource,context,{filename:"routine-proposals.js"});
  vm.runInContext(workflowSource,context,{filename:"routine-workflow-ui.js"});
  return {ui:context.GymOSRoutineWorkflowUI,proposals:context.GymOSRoutineProposals};
}
function routine(sessionCount=3){
  return {
    A:[{exerciseId:"old-a",name:"Press",sets:3,target:"8–10 reps"}],
    B:[{exerciseId:"old-b",name:"Remo",sets:3,target:"8–10 reps"}],
    C:sessionCount===3?[{exerciseId:"old-c",name:"Prensa",sets:3,target:"10 reps"}]:[]
  };
}
function source(overrides={}){
  return {
    userProfile:{
      trainingExperience:"intermediate",weeklyAvailability:3,
      preferredSessionDurationMin:50,trainingLocation:"gym",
      availableEquipment:["barbell","cable"],injuries:[],painAreas:[],
      medicalRestrictions:[],avoidedExercises:[]
    },
    currentLifeState:{id:"life-1",type:"general",details:{}},
    activeGoalCycle:{id:"goal-1",primaryGoal:"muscle_gain",secondaryGoals:[]},
    activeTrainingPhase:{id:"phase-1",type:"muscle_gain"},
    exerciseLibrary:[{id:"bench",name:"Press banca"}],
    currentRoutine:routine(),
    workoutHistory:[{id:"workout-1",session:"A"}],
    generationPreferences:{preferredExerciseIds:["bench"]},
    ...overrides
  };
}
function proposal(id="proposal-1",sessionCount=3,overrides={}){
  return {
    proposalId:id,generatedAt:T1,status:"pending",reviewRequired:false,
    inputSummary:{goal:"muscle_gain",phase:"muscle_gain"},
    weeklyStructure:{id:"full-body",label:"Full body"},
    warnings:[],unresolvedQuestions:[],
    coverage:{balanced:true,coveredPatterns:["horizontal_push"],missingPatterns:[]},
    validation:{valid:true,results:[]},
    sessions:Array.from({length:sessionCount},(_,index)=>({
      id:`session-${index+1}`,label:`Sesión ${index+1}`,focus:index?"lower":"upper",
      estimatedDurationMin:45,
      exercises:[{
        exerciseId:`exercise-${index+1}`,name:`Ejercicio ${index+1}`,
        pattern:"horizontal_push",role:"main",selectionReason:"Compatible con el objetivo.",
        prescription:{
          sets:3,target:{type:"repetitions",min:8,max:12},
          targetRir:{min:2,max:3},restSeconds:90,recordType:"weight_reps"
        },
        alternatives:[{exerciseId:`alt-${index}`,name:"Alternativa",reason:"Mismo patrón"}],
        scoreBreakdown:{
          eligible:true,score:72,
          components:{pattern:50,equipment:10},
          positiveReasons:[
            "Cubre el patrón requerido.",
            "Compatible con el objetivo principal.",
            "Compatible con la experiencia."
          ],
          penalties:["El patrón ya aparece en la sesión."],
          blockers:[]
        }
      }]
    })),
    ...overrides
  };
}
function record(api,value=proposal(),options={}){
  const current=options.currentRoutine||routine();
  return {
    ownerId:options.ownerId||OWNER_A,
    proposal:plain(value),
    lifecycle:{status:options.status||"pending_review",createdAt:T1,updatedAt:T1},
    baseline:{routineHash:api.proposals.routineHash(current),routineCapturedAt:T1},
    comparison:{
      stale:Boolean(options.stale),generatedAt:T1,
      summary:{
        totalChanges:2,sessionsAdded:1,sessionsRemoved:0,
        exercisesAdded:1,exercisesRemoved:0,exercisesSubstituted:1,
        orderChanges:0,prescriptionChanges:1
      },
      changes:[{type:"exercise_added",message:"Se añade un ejercicio."}]
    },
    activationCompatibility:{
      compatible:options.compatible??(value.sessions.length>=2&&value.sessions.length<=6),
      sessionCount:value.sessions.length,
      reasons:value.sessions.length>6?["Se admiten entre dos y seis sesiones."]:[]
    }
  };
}
function labels(){
  return {
    goals:[{id:"muscle_gain",label:"Ganar masa muscular"}],
    lifeStates:[{id:"general",label:"Estado general"}],
    phases:[{id:"muscle_gain",label:"Ganancia muscular"}],
    experience:[{id:"intermediate",label:"Intermedio"}],
    locations:[{id:"gym",label:"Gimnasio"}],
    equipment:[
      {id:"barbell",label:"Barra"},
      {id:"cable",label:"Poleas"}
    ]
  };
}

test("1. construye input sin mutar los datos originales",()=>{
  const {ui}=loadApi(),original=source(),before=JSON.stringify(original);
  deepFreeze(original);
  const input=ui.buildGenerationInput(original);
  assert.equal(JSON.stringify(original),before);
  assert.equal(JSON.stringify(input),before);
  assert.notEqual(input,original);
});

test("2. los datos incompletos bloquean la generación",()=>{
  const {ui}=loadApi();
  const model=ui.preparationModel(source({
    userProfile:{weeklyAvailability:1,preferredSessionDurationMin:10,availableEquipment:[]},
    activeGoalCycle:null
  }),labels());
  assert.equal(model.canGenerate,false);
  assert.ok(model.missing.includes("Objetivo principal"));
  assert.ok(model.missing.includes("Equipamiento disponible"));
});

test("2b. el resumen traduce valores técnicos del perfil",()=>{
  const {ui}=loadApi();
  const model=ui.preparationModel(source(),labels());
  assert.equal(model.summary.experience,"Intermedio");
  assert.equal(model.summary.location,"Gimnasio");
  assert.deepEqual(plain(model.summary.equipment),["Barra","Poleas"]);
});

test("2c. la vista mantiene un único objetivo principal y limita secundarios a dos",()=>{
  const {ui}=loadApi();
  const options=[
    ...ui.COMMON_GOAL_IDS.map(id=>({id,label:id})),
    {id:"mobility",label:"Movilidad"},
    {id:"endurance",label:"Resistencia"}
  ];
  const model=ui.goalSelectionViewModel(options,{
    primaryGoal:"muscle_gain",
    secondaryGoals:["strength_gain","mobility","endurance"],
    expanded:true
  });
  assert.equal(model.visible.filter(option=>option.primarySelected).length,1);
  assert.deepEqual(plain(model.secondaryGoals),["strength_gain","mobility"]);
  assert.equal(model.secondaryCount,2);
  assert.match(appSource,/type="radio" name="obPrimaryGoal"/);
});

test("2d. contraer Ver más conserva cualquier selección ampliada",()=>{
  const {ui}=loadApi();
  const options=[
    ...ui.COMMON_GOAL_IDS.map(id=>({id,label:id})),
    {id:"mobility",label:"Mejorar movilidad"},
    {id:"endurance",label:"Mejorar resistencia"}
  ];
  const collapsed=ui.goalSelectionViewModel(options,{
    primaryGoal:"mobility",
    secondaryGoals:["endurance"],
    expanded:false
  });
  assert.ok(collapsed.visible.some(option=>option.id==="mobility"&&option.primarySelected));
  assert.ok(collapsed.visible.some(option=>option.id==="endurance"&&option.secondarySelected));
  assert.equal(collapsed.expanded,false);
  assert.match(appSource,/id="toggleMoreGoals"[\s\S]*Ver más objetivos/);
});

test("2e. el objetivo principal queda deshabilitado como secundario",()=>{
  const {ui}=loadApi();
  const model=ui.goalSelectionViewModel([
    {id:"fat_loss",label:"Perder grasa"},
    {id:"muscle_gain",label:"Ganar masa muscular"}
  ],{primaryGoal:"fat_loss"});
  const primary=model.visible.find(option=>option.id==="fat_loss");
  assert.equal(primary.secondaryDisabled,true);
  assert.match(appSource,/option\.secondaryDisabled\?"disabled":""/);
});

test("2f. la fase elegida se conserva sin una casilla visual redundante",()=>{
  const onboarding=appSource.slice(
    appSource.indexOf("function renderOnboarding()"),
    appSource.indexOf("function render(){")
  );
  assert.match(onboarding,/p\.phase=document\.getElementById\("obPhase"\)\?\.value\|\|p\.phase/);
  assert.match(onboarding,/p\.phaseConfirmed=true/);
  assert.match(onboarding,/id="togglePhaseEditor"/);
  assert.doesNotMatch(onboarding,/id="obPhaseConfirmed"/);
});

test("3. abrir la pantalla no genera propuestas",()=>{
  const workflowSegment=appSource.slice(
    appSource.indexOf("function renderRoutineWorkflow(){"),
    appSource.indexOf("function exerciseLibraryWorkflowApi(){")
  );
  assert.doesNotMatch(workflowSegment,/generateRoutineProposal\(/);
  assert.doesNotMatch(workflowSegment,/persistRoutineProposal\(/);
});

test("4. renderizar nuevamente solo construye modelos de vista",()=>{
  const {ui,proposals}=loadApi(),current=routine(),stored=record({proposals},proposal());
  const first=ui.workflowSummaryModel({
    ownerId:OWNER_A,currentRoutine:current,proposalRecords:[stored],activationRecords:[]
  });
  const second=ui.workflowSummaryModel({
    ownerId:OWNER_A,currentRoutine:current,proposalRecords:[stored],activationRecords:[]
  });
  assert.equal(JSON.stringify(first),JSON.stringify(second));
});

test("5. una acción explícita conecta generación y persistencia",()=>{
  assert.match(appSource,/generateRoutineProposal[\s\S]*GymOSRoutineGenerator\.generateRoutineProposal/);
  assert.match(appSource,/GymOSRoutineGenerator\.generateRoutineProposal[\s\S]*persistRoutineProposal/);
});

test("6. doble pulsación queda bloqueada por el estado busy",()=>{
  const {ui}=loadApi(),initial=ui.createFlowState(OWNER_A);
  const first=ui.beginOperation(initial,"generating");
  const second=ui.beginOperation(first.state,"generating");
  assert.equal(first.accepted,true);
  assert.equal(second.accepted,false);
  assert.equal(second.state.busy,"generating");
});

test("7. preparar y revisar no modifica rutina ni historial",()=>{
  const {ui}=loadApi(),data=source();
  const beforeRoutine=JSON.stringify(data.currentRoutine);
  const beforeHistory=JSON.stringify(data.workoutHistory);
  ui.preparationModel(data,labels());
  assert.equal(JSON.stringify(data.currentRoutine),beforeRoutine);
  assert.equal(JSON.stringify(data.workoutHistory),beforeHistory);
});

test("8. una propuesta pendiente aparece en el resumen",()=>{
  const {ui,proposals}=loadApi(),current=routine(),stored=record({proposals});
  const model=ui.workflowSummaryModel({
    ownerId:OWNER_A,currentRoutine:current,proposalRecords:[stored],activationRecords:[]
  });
  assert.equal(model.pendingProposal.proposalId,"proposal-1");
  assert.equal(model.pendingProposal.status,"pending_review");
});

test("9. propuesta stale avisa y no permite activar",()=>{
  const {ui,proposals}=loadApi(),current=routine(),stored=record({proposals},proposal(),{stale:true});
  const model=ui.proposalViewModel(stored,{ownerId:OWNER_A,currentRoutine:current});
  assert.equal(model.status,"stale");
  assert.equal(model.canActivate,false);
  assert.ok(model.blockers.includes("proposal_stale"));
});

test("10. reviewRequired no permite activar",()=>{
  const {ui,proposals}=loadApi(),value=proposal("review",3,{reviewRequired:true});
  const model=ui.proposalViewModel(record({proposals},value),{
    ownerId:OWNER_A,currentRoutine:routine()
  });
  assert.equal(model.status,"review_required");
  assert.equal(model.canActivate,false);
});

test("11. cuatro sesiones compatibles pueden llegar a confirmación",()=>{
  const {ui,proposals}=loadApi(),value=proposal("four",4);
  const model=ui.proposalViewModel(record({proposals},value),{
    ownerId:OWNER_A,currentRoutine:routine()
  });
  assert.equal(model.status,"pending_review");
  assert.equal(model.canActivate,true);
});

test("12. una propuesta compatible de dos sesiones llega a confirmación",()=>{
  const {ui,proposals}=loadApi(),current=routine(2),value=proposal("two",2);
  const model=ui.proposalViewModel(record({proposals},value,{currentRoutine:current}),{
    ownerId:OWNER_A,currentRoutine:current
  });
  assert.equal(model.canActivate,true);
});

test("13. una propuesta compatible de tres sesiones llega a confirmación",()=>{
  const {ui,proposals}=loadApi(),current=routine(),value=proposal("three",3);
  const model=ui.proposalViewModel(record({proposals},value),{
    ownerId:OWNER_A,currentRoutine:current
  });
  assert.equal(model.canActivate,true);
});

test("14. sin casilla no se invoca la activación",()=>{
  const handler=appSource.slice(
    appSource.indexOf('const confirmActivation=document.getElementById("confirmRoutineActivation")'),
    appSource.indexOf('const confirmRollback=document.getElementById("confirmRoutineRollback")')
  );
  assert.match(handler,/if\(!checkbox\?\.checked\) return;/);
  assert.ok(handler.indexOf("if(!checkbox?.checked) return;")<handler.indexOf("activateStoredRoutineProposal("));
});

test("15. confirmed true solo aparece después de comprobar la casilla",()=>{
  const workflowStart=appSource.indexOf("function routineWorkflowOwnerId");
  const workflowEnd=appSource.indexOf("function renderSettings");
  const workflow=appSource.slice(workflowStart,workflowEnd);
  assert.equal((workflow.match(/activateStoredRoutineProposal\(/g)||[]).length,1);
  assert.equal((workflow.match(/confirmed:true/g)||[]).length,1);
  assert.ok(workflow.indexOf("checkbox?.checked")<workflow.indexOf("confirmed:true"));
});

test("16. rechazo usa la API y no toca rutina ni historial",()=>{
  const workflow=appSource.slice(
    appSource.indexOf("function routineWorkflowOwnerId"),
    appSource.indexOf("function exerciseLibraryWorkflowApi")
  );
  assert.equal((workflow.match(/rejectStoredRoutineProposal\(/g)||[]).length,1);
  assert.doesNotMatch(workflow,/saveRoutine\(|saveHistory\(/);
});

test("17. rollback reversible aparece en el resumen",()=>{
  const {ui}=loadApi();
  const activation={
    activationId:"activation-1",ownerId:OWNER_A,proposalId:"proposal-1",
    status:"activated",activatedAt:T1,rollback:{available:true},
    baseline:{routine:routine(2)},activated:{routine:routine(3)}
  };
  const model=ui.workflowSummaryModel({
    ownerId:OWNER_A,currentRoutine:routine(),proposalRecords:[],
    activationRecords:[activation]
  });
  assert.equal(model.reversibleActivation.activationId,"activation-1");
});

test("18. sin confirmación no se llama al rollback",()=>{
  const handler=appSource.slice(
    appSource.indexOf('const confirmRollback=document.getElementById("confirmRoutineRollback")'),
    appSource.indexOf("function renderRoutineWorkflow(){")
  );
  assert.match(handler,/if\(!checkbox\?\.checked\) return;/);
  assert.ok(handler.indexOf("checkbox?.checked")<handler.indexOf("rollbackStoredRoutineActivation("));
});

test("19. rollback bloqueado se presenta sin considerarlo reversible",()=>{
  const {ui}=loadApi();
  const blocked={
    activationId:"blocked-1",ownerId:OWNER_A,proposalId:"proposal-1",
    status:"rollback_blocked",activatedAt:T1,
    rollback:{available:false,blockedReason:"routine_changed"}
  };
  const model=ui.workflowSummaryModel({
    ownerId:OWNER_A,currentRoutine:routine(),proposalRecords:[],
    activationRecords:[blocked]
  });
  assert.equal(model.reversibleActivation,null);
  assert.equal(model.blockedActivation.activationId,"blocked-1");
});

test("20. cambiar de propietario limpia el estado visual anterior",()=>{
  const {ui}=loadApi();
  const previous={
    ...ui.createFlowState(OWNER_A),view:"review",
    selectedProposalId:"proposal-a",confirmation:"activate",
    message:{type:"success",text:"Anterior"}
  };
  const next=ui.resetFlowForOwner(previous,OWNER_B);
  assert.equal(next.ownerId,OWNER_B);
  assert.equal(next.view,"summary");
  assert.equal(next.selectedProposalId,null);
  assert.equal(next.confirmation,null);
  assert.equal(next.message,null);
});

test("21. escapa texto dinámico potencialmente peligroso",()=>{
  const {ui}=loadApi();
  assert.equal(
    ui.escapeHtml('<img src=x onerror="alert(1)">'),
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"
  );
  const workflow=appSource.slice(
    appSource.indexOf("function routineWorkflowOwnerId"),
    appSource.indexOf("function renderSettings")
  );
  assert.doesNotMatch(workflow,/\sonclick=/);
});

test("22. construir el modelo de propuesta no modifica el original",()=>{
  const {ui,proposals}=loadApi(),stored=record({proposals}),before=JSON.stringify(stored);
  deepFreeze(stored);
  ui.proposalViewModel(stored,{ownerId:OWNER_A,currentRoutine:routine()});
  assert.equal(JSON.stringify(stored),before);
});

test("23. una rutina de dos sesiones no muestra C como entrenable",()=>{
  const {ui}=loadApi(),summary=ui.routineSummary(routine(2));
  assert.deepEqual(plain(summary.sessions.map(session=>session.key)),["A","B"]);
  assert.equal(summary.sessionCount,2);
});

test("24. abrir y cerrar el estado mantiene rutina e historial exactos",()=>{
  const {ui}=loadApi(),data=source();
  const before=JSON.stringify({routine:data.currentRoutine,history:data.workoutHistory});
  let flow=ui.createFlowState(OWNER_A);
  flow=ui.setFlowView(flow,"prepare");
  ui.preparationModel(data,labels());
  flow=ui.setFlowView(flow,"summary");
  assert.equal(flow.view,"summary");
  assert.equal(JSON.stringify({routine:data.currentRoutine,history:data.workoutHistory}),before);
});

test("7b. la revisión traduce sesiones, estructura, patrones y funciones",()=>{
  const {ui,proposals}=loadApi();
  const value=proposal("translated",1);
  value.weeklyStructure={id:"full_body"};
  value.sessions[0].focus="full_body";
  value.sessions[0].exercises[0].pattern="knee_dominant";
  value.sessions[0].exercises[0].role="main";
  const model=ui.proposalViewModel(record({proposals},value),{
    ownerId:OWNER_A,currentRoutine:routine()
  });

  assert.equal(model.weeklyStructure,"Cuerpo completo");
  assert.equal(model.sessions[0].name,"Sesión A");
  assert.equal(model.sessions[0].focus,"Cuerpo completo");
  assert.equal(model.sessions[0].exercises[0].pattern,"Dominante de rodilla");
  assert.equal(model.sessions[0].exercises[0].role,"Principal");
  assert.equal(ui.presentableLabel("rotational_carry"),"Rotational carry");
});

test("7c. el modelo de presentación elimina el desglose matemático del scoring",()=>{
  const {ui,proposals}=loadApi();
  const model=ui.proposalViewModel(record({proposals}),{
    ownerId:OWNER_A,currentRoutine:routine()
  });
  const exercise=model.sessions[0].exercises[0];
  const serialized=JSON.stringify(exercise);

  assert.equal(serialized.includes('"components"'),false);
  assert.equal(serialized.includes('"penalties"'),false);
  assert.equal(serialized.includes('"eligible"'),false);
  assert.equal(serialized.includes('"score"'),false);
  assert.ok(exercise.reasons.includes("Cubre el patrón necesario."));
  assert.ok(exercise.reasons.includes("Es compatible con tu equipamiento."));
  assert.ok(exercise.reasons.includes("Se adapta a tu experiencia."));
  assert.ok(exercise.warnings.includes("Este patrón también aparece en otro ejercicio de la sesión."));
});

test("7d. el HTML normal no imprime IDs internos ni JSON técnico",()=>{
  const review=appSource.slice(
    appSource.indexOf("function renderRoutineProposalReview"),
    appSource.indexOf("function renderRoutineWorkflowConfirmation")
  );
  assert.doesNotMatch(review,/session\.id|JSON\.stringify|<pre>|exercise\.technical/);
  assert.doesNotMatch(review,/session-1|full_body|knee_dominant/);
  assert.doesNotMatch(review,/"components"|"penalties"|"eligible"/);
  assert.match(review,/¿Por qué este ejercicio\?/);
  assert.match(review,/routine-reason-list/);
  assert.match(review,/Alternativas disponibles/);
  assert.match(review,/session\.exercises\.length/);
});

test("25. orden final de scripts correcto",()=>{
  const files=[
    "exercise-domain.js","profile-data.js","routine-generator.js",
    "routine-proposals.js","routine-activation.js","routine-workflow-ui.js","app.js"
  ];
  const positions=files.map(file=>indexSource.indexOf(`src="${file}"`));
  assert.ok(positions.every(position=>position>=0));
  assert.deepEqual([...positions].sort((a,b)=>a-b),positions);
});

test("26. generador y workflow están incluidos en el service worker",()=>{
  assert.match(workerSource,/routine-generator\.js/);
  assert.match(workerSource,/routine-workflow-ui\.js/);
  assert.match(workerSource,/gymos-cache-4\.2\.0-rc\.1/);
});

test("27. el módulo puro no accede a DOM, almacenamiento, red ni navegación",()=>{
  assert.doesNotMatch(
    workflowSource,
    /document\.|querySelector|localStorage|sessionStorage|supabase|fetch\(|location\.|navigate|setTimeout|setInterval/
  );
});

test("28. la interfaz solo usa APIs centrales para operaciones funcionales",()=>{
  const workflow=appSource.slice(
    appSource.indexOf("function routineWorkflowOwnerId"),
    appSource.indexOf("function exerciseLibraryWorkflowApi")
  );
  [
    "persistRoutineProposal(","rejectStoredRoutineProposal(",
    "activateStoredRoutineProposal(","rollbackStoredRoutineActivation(",
    "getRoutineProposalRecords(","getRoutineActivationRecords(",
    "activeRoutineForComparison(","getExerciseLibrary("
  ].forEach(call=>assert.ok(workflow.includes(call),call));
  assert.doesNotMatch(
    workflow,
    /localStorage\.|GYMOS_BACKUP_KEYS|ROUTINE_PROPOSALS_KEY|ROUTINE_ACTIVATION_HISTORY_KEY|saveRoutine\(/
  );
});
