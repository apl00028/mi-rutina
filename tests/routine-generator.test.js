"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const test=require("node:test");

const root=path.resolve(__dirname,"..");
const domainSource=fs.readFileSync(path.join(root,"exercise-domain.js"),"utf8");
const generatorSource=fs.readFileSync(path.join(root,"routine-generator.js"),"utf8");
const FIXED_TIME="2026-07-28T12:00:00.000Z";

function loadModules(){
  const context={console};
  context.window=context;
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(domainSource,context,{filename:"exercise-domain.js"});
  vm.runInContext(generatorSource,context,{filename:"routine-generator.js"});
  return {domain:context.GymOSExerciseDomain,generator:context.GymOSRoutineGenerator};
}
function plain(value){return JSON.parse(JSON.stringify(value));}
function exercise(domain,id,name,pattern,equipment=["bodyweight"],overrides={}){
  return plain(domain.normalizeExerciseDefinition({
    id,name,category:"strength",movementPattern:pattern,
    primaryMuscles:[pattern],requiredEquipment:equipment,
    difficulty:"beginner",technicalComplexity:1,stabilityDemand:1,balanceDemand:1,
    recordTypes:["weight_reps"],suitableGoals:[
      "return_to_training","muscle_gain","strength_gain","fat_loss","general_health","maintenance"
    ],
    experienceLevels:["beginner","returning","intermediate","advanced"],
    custom:true,createdAt:"2026-07-01T00:00:00.000Z",updatedAt:"2026-07-01T00:00:00.000Z",
    ...overrides
  },{timestamp:FIXED_TIME}));
}
function richLibrary(domain){
  return [
    exercise(domain,"body-squat","Sentadilla corporal","knee_dominant"),
    exercise(domain,"leg-press-test","Prensa","knee_dominant",["leg_press"],{custom:false,supported:true}),
    exercise(domain,"db-rdl","Peso muerto rumano mancuernas","hip_hinge",["dumbbells"]),
    exercise(domain,"body-hinge","Bisagra corporal","hip_hinge"),
    exercise(domain,"push-up","Flexiones","horizontal_push"),
    exercise(domain,"db-press","Press mancuernas","horizontal_push",["dumbbells","bench"]),
    exercise(domain,"machine-press","Press máquina","horizontal_push",["chest_press_machine"],{supported:true}),
    exercise(domain,"band-row","Remo con banda","horizontal_pull",["resistance_band"]),
    exercise(domain,"db-row","Remo mancuerna","horizontal_pull",["dumbbells","bench"]),
    exercise(domain,"seated-row-test","Remo sentado","horizontal_pull",["seated_row"],{supported:true}),
    exercise(domain,"lat-pulldown-test","Jalón","vertical_pull",["lat_pulldown"],{supported:true}),
    exercise(domain,"band-pulldown","Jalón con banda","vertical_pull",["resistance_band"]),
    exercise(domain,"pike-push-up","Flexiones pica","vertical_push"),
    exercise(domain,"db-shoulder","Press hombro","vertical_push",["dumbbells"]),
    exercise(domain,"split-squat","Zancada","unilateral_lower_body"),
    exercise(domain,"sliding-curl","Curl femoral deslizante","knee_flexion"),
    exercise(domain,"calf-body","Gemelos de pie","calf_raise"),
    exercise(domain,"plank-test","Plancha","anti_extension_core"),
    exercise(domain,"curl-db","Curl bíceps","elbow_flexion",["dumbbells"]),
    exercise(domain,"triceps-band","Tríceps banda","elbow_extension",["resistance_band"])
  ];
}
function baseInput(domain,overrides={}){
  const input={
    userProfile:{
      id:"profile-1",trainingExperience:"intermediate",weeklyAvailability:3,
      preferredSessionDurationMin:60,trainingLocation:"gym",
      availableEquipment:["gym_full"],injuries:[],painAreas:[],
      medicalRestrictions:[],avoidedExercises:[]
    },
    currentLifeState:{type:"general",details:{}},
    activeGoalCycle:{primaryGoal:"general_health",secondaryGoals:[]},
    activeTrainingPhase:{type:"maintenance"},
    currentRoutine:{A:[],B:[],C:[]},
    exerciseHistory:[],
    exerciseLibrary:richLibrary(domain),
    generationPreferences:{preferredExerciseIds:[]}
  };
  return {
    ...input,...overrides,
    userProfile:{...input.userProfile,...(overrides.userProfile||{})},
    activeGoalCycle:{...input.activeGoalCycle,...(overrides.activeGoalCycle||{})},
    activeTrainingPhase:{...input.activeTrainingPhase,...(overrides.activeTrainingPhase||{})},
    generationPreferences:{...input.generationPreferences,...(overrides.generationPreferences||{})}
  };
}
function generate(generator,input){
  return plain(generator.generateRoutineProposal(input,{timestamp:FIXED_TIME}));
}
function selected(proposal){return proposal.selectedExercises;}
function equipmentCompatible(proposal,input,domain){
  const available=domain.normalizeEquipmentSelection(input.userProfile.availableEquipment);
  const byId=new Map(input.exerciseLibrary.map(item=>[item.id,item]));
  return selected(proposal).every(item=>
    byId.get(item.exerciseId).requiredEquipment.every(equipment=>available.includes(equipment))
  );
}
function deepFreeze(value){
  if(value&&typeof value==="object"&&!Object.isFrozen(value)){
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
function assertHealthyWeek(proposal,expectedDays){
  assert.equal(proposal.sessions.length,expectedDays);
  assert.ok(proposal.sessions.every(session=>session.exercises.length>0));
  assert.ok(proposal.sessions.every(session=>session.estimatedDurationMin<=session.timeLimitMin));
  assert.ok(proposal.sessions.every(session=>{
    const ids=session.exercises.map(item=>item.exerciseId);
    return new Set(ids).size===ids.length;
  }));
  const weeklySets=selected(proposal).reduce((sum,item)=>sum+item.prescription.sets,0);
  assert.ok(weeklySets>=expectedDays*4&&weeklySets<=60);
  const patterns=new Set(selected(proposal).map(item=>item.pattern));
  assert.ok(patterns.has("horizontal_push"));
  assert.ok(patterns.has("horizontal_pull")||patterns.has("vertical_pull"));
  assert.ok(patterns.has("knee_dominant")||patterns.has("hip_hinge"));
}

test("1. usuario que retoma, 3 días, gimnasio completo",()=>{
  const {domain,generator}=loadModules();
  const input=baseInput(domain,{
    userProfile:{trainingExperience:"returning",weeklyAvailability:3},
    activeGoalCycle:{primaryGoal:"return_to_training"},
    activeTrainingPhase:{type:"return_to_training"}
  });
  const proposal=generate(generator,input);
  assert.equal(proposal.weeklyStructure.id,"three_day_full_body");
  assert.equal(proposal.sessions.length,3);
  assert.ok(selected(proposal).every(item=>item.prescription.targetRir.min>=4));
});

test("2. hipertrofia, 4 días usa torso/pierna",()=>{
  const {domain,generator}=loadModules();
  const proposal=generate(generator,baseInput(domain,{
    userProfile:{weeklyAvailability:4},
    activeGoalCycle:{primaryGoal:"muscle_gain"},
    activeTrainingPhase:{type:"muscle_gain"}
  }));
  assert.equal(proposal.weeklyStructure.id,"upper_lower_four");
  assert.deepEqual(proposal.weeklyStructure.focuses,["upper","lower","upper","lower"]);
});

test("3. fuerza, 3 días modifica repeticiones y descansos",()=>{
  const {domain,generator}=loadModules();
  const proposal=generate(generator,baseInput(domain,{
    activeGoalCycle:{primaryGoal:"strength_gain"},
    activeTrainingPhase:{type:"strength"}
  }));
  assert.equal(proposal.sessions.length,3);
  const main=selected(proposal).find(item=>item.role==="main");
  assert.deepEqual(main.prescription.target,{type:"repetitions",min:3,max:6});
  assert.equal(main.prescription.restSeconds,180);
  assert.equal(main.scoreBreakdown.components.pattern,50);
  assert.equal(main.scoreBreakdown.components.equipment,10);
});

test("4. pérdida de grasa, 2 días y sesiones cortas conserva fuerza esencial",()=>{
  const {domain,generator}=loadModules();
  const proposal=generate(generator,baseInput(domain,{
    userProfile:{weeklyAvailability:2,preferredSessionDurationMin:35},
    activeGoalCycle:{primaryGoal:"fat_loss"},
    activeTrainingPhase:{type:"fat_loss"}
  }));
  assert.equal(proposal.weeklyStructure.id,"two_day_full_body");
  assert.equal(proposal.sessions.length,2);
  assert.ok(proposal.sessions.every(session=>session.exercises.length<=4));
  assert.ok(proposal.sessions.every(session=>session.exercises.some(item=>item.role==="main")));
});

test("5. casa con mancuernas excluye máquinas",()=>{
  const {domain,generator}=loadModules();
  const input=baseInput(domain,{userProfile:{
    trainingLocation:"home",availableEquipment:["home_dumbbells"]
  }});
  const proposal=generate(generator,input);
  assert.ok(selected(proposal).length>0);
  assert.ok(equipmentCompatible(proposal,input,domain));
  assert.ok(!selected(proposal).some(item=>item.exerciseId.includes("machine")||item.exerciseId.includes("leg-press")));
});

test("6. solo peso corporal selecciona únicamente equipamiento disponible",()=>{
  const {domain,generator}=loadModules();
  const input=baseInput(domain,{userProfile:{
    trainingLocation:"home",availableEquipment:["bodyweight"]
  }});
  const proposal=generate(generator,input);
  assert.ok(selected(proposal).length>0);
  assert.ok(equipmentCompatible(proposal,input,domain));
});

test("7. preset se convierte a equipamiento concreto",()=>{
  const {domain,generator}=loadModules();
  const proposal=generate(generator,baseInput(domain,{
    userProfile:{availableEquipment:["Gimnasio completo"]}
  }));
  assert.ok(proposal.inputSummary.equipment.includes("barbell"));
  assert.ok(proposal.inputSummary.equipment.includes("cable_machine"));
  assert.ok(!proposal.inputSummary.equipment.includes("full"));
});

for(const [number,label,restriction,forbidden] of [
  [8,"rodilla","Dolor de rodilla",["knee_dominant","squat","knee_extension","unilateral_lower_body"]],
  [9,"lumbar","Molestia lumbar",["hip_hinge"]],
  [10,"hombro","Dolor de hombro",["horizontal_push","vertical_push","shoulder_abduction"]]
]){
  test(`${number}. restricción de ${label} tiene prioridad`,()=>{
    const {domain,generator}=loadModules();
    const proposal=generate(generator,baseInput(domain,{userProfile:{painAreas:[restriction]}}));
    assert.ok(!selected(proposal).some(item=>forbidden.includes(item.pattern)));
    assert.ok(proposal.validation.results.some(item=>item.code==="required_pattern_missing"));
  });
}

test("11. ejercicio personalizado válido puede ser seleccionado",()=>{
  const {domain,generator}=loadModules();
  const custom=exercise(domain,"aaa-custom-row","Remo personalizado","horizontal_pull",["dumbbells"],{favorite:true});
  const input=baseInput(domain,{
    userProfile:{trainingLocation:"home",availableEquipment:["home_dumbbells"]},
    exerciseLibrary:[custom,...richLibrary(domain)]
  });
  const proposal=generate(generator,input);
  assert.ok(selected(proposal).some(item=>item.exerciseId==="aaa-custom-row"));
});

test("12. ejercicio sin equipamiento disponible queda excluido",()=>{
  const {domain,generator}=loadModules();
  const input=baseInput(domain,{userProfile:{
    trainingLocation:"home",availableEquipment:["home_basic"]
  }});
  const proposal=generate(generator,input);
  assert.ok(!selected(proposal).some(item=>item.exerciseId==="machine-press"));
  assert.ok(equipmentCompatible(proposal,input,domain));
});

test("13. los empates se resuelven por id estable",()=>{
  const {domain,generator}=loadModules();
  const a=exercise(domain,"aaa-push","Empuje A","horizontal_push");
  const z=exercise(domain,"zzz-push","Empuje Z","horizontal_push");
  const input=baseInput(domain,{exerciseLibrary:[
    a,z,...richLibrary(domain).filter(item=>item.movementPattern!=="horizontal_push")
  ]});
  const proposal=generate(generator,input);
  assert.equal(selected(proposal).find(item=>item.pattern==="horizontal_push").exerciseId,"aaa-push");
});

test("14. misma entrada y timestamp produce JSON idéntico",()=>{
  const {domain,generator}=loadModules();
  const input=baseInput(domain);
  assert.equal(JSON.stringify(generate(generator,input)),JSON.stringify(generate(generator,input)));
});

test("15. objetivo secundario no sustituye dosificación principal",()=>{
  const {domain,generator}=loadModules();
  const proposal=generate(generator,baseInput(domain,{
    activeGoalCycle:{primaryGoal:"strength_gain",secondaryGoals:["muscle_gain"]}
  }));
  const main=selected(proposal).find(item=>item.role==="main");
  assert.equal(main.prescription.target.max,6);
  assert.equal(main.prescription.restSeconds,180);
});

test("16. preferencia no supera una restricción",()=>{
  const {domain,generator}=loadModules();
  const proposal=generate(generator,baseInput(domain,{
    userProfile:{painAreas:["Dolor de rodilla"]},
    generationPreferences:{preferredExerciseIds:["leg-press-test"]}
  }));
  assert.ok(!selected(proposal).some(item=>item.exerciseId==="leg-press-test"));
});

test("17. 35 minutos reduce volumen sin romper slots esenciales disponibles",()=>{
  const {domain,generator}=loadModules();
  const proposal=generate(generator,baseInput(domain,{
    userProfile:{preferredSessionDurationMin:35,weeklyAvailability:2}
  }));
  assert.ok(proposal.sessions.every(session=>session.exercises.length===4));
  assert.ok(proposal.sessions.every(session=>session.estimatedDurationMin<=35));
  assert.ok(proposal.sessions.every(session=>session.missingRequiredPatterns.length===0));
});

test("18. estado vital insuficiente exige revisión",()=>{
  const {domain,generator}=loadModules();
  const proposal=generate(generator,baseInput(domain,{
    currentLifeState:{type:"pregnancy",details:{
      medicalExerciseClearance:"unknown",highRiskStatus:"unknown",requiresProfessionalReview:true
    }}
  }));
  assert.equal(proposal.reviewRequired,true);
  assert.equal(proposal.sessions.length,0);
  assert.ok(proposal.unresolvedQuestions.length>=2);
});

test("19. riesgo de embarazo desconocido impide selección automática",()=>{
  const {domain,generator}=loadModules();
  const proposal=generate(generator,baseInput(domain,{
    currentLifeState:{type:"pregnancy",details:{
      medicalExerciseClearance:"yes",highRiskStatus:"no",requiresProfessionalReview:false
    }}
  }));
  assert.equal(proposal.reviewRequired,true);
  assert.equal(selected(proposal).length,0);
  assert.ok(proposal.validation.results.some(item=>item.code==="empty_session"));
});

test("20. rutina e historial permanecen serializados exactamente igual",()=>{
  const {domain,generator}=loadModules();
  const routine={A:[{name:"Press anterior",sets:3,reps:"8"}],B:[],C:[]};
  const history=[{date:"2026-07-27",session:"A",sets:[{kg:30,reps:8}]}];
  const input=baseInput(domain,{currentRoutine:routine,exerciseHistory:history});
  const beforeRoutine=JSON.stringify(routine);
  const beforeHistory=JSON.stringify(history);
  generate(generator,input);
  assert.equal(JSON.stringify(routine),beforeRoutine);
  assert.equal(JSON.stringify(history),beforeHistory);
  assert.doesNotMatch(generatorSource,/localStorage|document\.|saveRoutine\s*\(|saveHistory\s*\(|supabase|Math\.random/);
});

test("validación detecta identificadores duplicados en biblioteca",()=>{
  const {domain,generator}=loadModules();
  const library=richLibrary(domain);
  library.push({...library[0]});
  const proposal=generate(generator,baseInput(domain,{exerciseLibrary:library}));
  assert.ok(proposal.validation.results.some(item=>item.code==="library_duplicate_ids"));
  assert.equal(proposal.validation.valid,false);
  assert.equal(proposal.reviewRequired,true);
  assert.equal(selected(proposal).length,0);
});

test("entradas profundamente congeladas permanecen inmutables",()=>{
  const {domain,generator}=loadModules();
  const input=baseInput(domain,{
    userProfile:{
      availableEquipment:["bench","dumbbells","bodyweight","mat"],
      injuries:["Tensión cervical"],painAreas:["Molestia de muñeca"]
    },
    activeGoalCycle:{secondaryGoals:["mobility","maintenance"]},
    generationPreferences:{
      preferredExerciseIds:["db-row","db-press"],
      preferredExercises:["Plancha"]
    }
  });
  const before=JSON.stringify(input);
  deepFreeze(input);
  const proposal=generate(generator,input);
  assert.ok(proposal.sessions.length>0);
  assert.equal(JSON.stringify(input),before);
});

test("arrays semánticamente equivalentes producen propuesta JSON idéntica",()=>{
  const {domain,generator}=loadModules();
  const original=baseInput(domain,{
    userProfile:{
      availableEquipment:["bench","dumbbells","bodyweight","mat"],
      injuries:["Tensión cervical","Molestia de muñeca"],
      medicalRestrictions:["Evitar impacto","Sin saltos"]
    },
    activeGoalCycle:{secondaryGoals:["mobility","maintenance"]},
    generationPreferences:{
      preferredExerciseIds:["db-row","db-press"],
      preferredExercises:["Plancha","Flexiones"]
    }
  });
  const reordered=plain(original);
  reordered.exerciseLibrary.reverse();
  reordered.userProfile.availableEquipment.reverse();
  reordered.userProfile.injuries.reverse();
  reordered.userProfile.medicalRestrictions.reverse();
  reordered.activeGoalCycle.secondaryGoals.reverse();
  reordered.generationPreferences.preferredExerciseIds.reverse();
  reordered.generationPreferences.preferredExercises.reverse();
  assert.equal(
    JSON.stringify(generate(generator,original)),
    JSON.stringify(generate(generator,reordered))
  );
});

test("un patrón obligatorio sin candidatos queda explícitamente sin resolver",()=>{
  const {domain,generator}=loadModules();
  const library=richLibrary(domain).filter(item=>item.movementPattern!=="horizontal_pull");
  const proposal=generate(generator,baseInput(domain,{exerciseLibrary:library}));
  assert.equal(proposal.coverage.balanced,false);
  assert.ok(proposal.coverage.missingPatterns.includes("horizontal_pull"));
  assert.ok(proposal.warnings.some(message=>/patrones requeridos/i.test(message)));
  assert.ok(proposal.unresolvedQuestions.some(message=>/horizontal_pull/.test(message)));
  assert.equal(proposal.reviewRequired,true);
  assert.ok(proposal.sessions.some(session=>
    session.missingRequiredPatterns.includes("horizontal_pull")&&
    session.rejectedSlots.some(slot=>slot.slot==="horizontal_pull")
  ));
  assert.ok(!selected(proposal).some(item=>item.pattern==="horizontal_pull"));
});

test("biblioteca inválida o duplicada se bloquea sin selección ambigua",()=>{
  const {domain,generator}=loadModules();
  const valid=richLibrary(domain);
  const invalid={id:"invalid",name:"Inválido",category:"unknown"};
  const library=[...valid,{...valid[0],name:"Duplicado"},invalid];
  const first=generate(generator,baseInput(domain,{exerciseLibrary:library}));
  const second=generate(generator,baseInput(domain,{exerciseLibrary:[...library].reverse()}));
  assert.equal(first.validation.valid,false);
  assert.equal(first.reviewRequired,true);
  assert.equal(first.sessions.length,0);
  assert.equal(first.selectedExercises.length,0);
  assert.ok(first.validation.results.some(item=>item.code==="library_duplicate_ids"));
  assert.ok(first.validation.results.some(item=>item.code==="invalid_exercise"));
  assert.equal(JSON.stringify(first),JSON.stringify(second));
});

test("continuidad conocida no supera una restricción",()=>{
  const {domain,generator}=loadModules();
  const proposal=generate(generator,baseInput(domain,{
    userProfile:{painAreas:["Dolor de rodilla"]},
    currentRoutine:{A:[{name:"Prensa",sets:4,reps:"8"}],B:[],C:[]}
  }));
  assert.ok(!selected(proposal).some(item=>item.exerciseId==="leg-press-test"));
});

test("ejercicio personalizado no supera equipamiento incompatible",()=>{
  const {domain,generator}=loadModules();
  const custom=exercise(
    domain,"custom-cable-row","Remo personal en polea","horizontal_pull",
    ["cable_machine"],{favorite:true}
  );
  const input=baseInput(domain,{
    userProfile:{trainingLocation:"home",availableEquipment:["home_dumbbells"]},
    exerciseLibrary:[custom,...richLibrary(domain)]
  });
  const proposal=generate(generator,input);
  assert.ok(!selected(proposal).some(item=>item.exerciseId==="custom-cable-row"));
  assert.ok(equipmentCompatible(proposal,input,domain));
});

test("preferencia no sustituye el patrón obligatorio",()=>{
  const {domain,generator}=loadModules();
  const input=baseInput(domain,{
    generationPreferences:{preferredExerciseIds:["pike-push-up"]}
  });
  const proposal=generate(generator,input);
  assert.ok(selected(proposal).some(item=>item.pattern==="horizontal_push"));
  assert.ok(selected(proposal).every(item=>{
    const source=input.exerciseLibrary.find(exercise=>exercise.id===item.exerciseId);
    return source.movementPattern===item.pattern;
  }));
});

test("estructura de cinco días mantiene frecuencia, cobertura y presupuesto",()=>{
  const {domain,generator}=loadModules();
  const proposal=generate(generator,baseInput(domain,{
    userProfile:{weeklyAvailability:5,preferredSessionDurationMin:60},
    activeGoalCycle:{primaryGoal:"muscle_gain"},
    activeTrainingPhase:{type:"muscle_gain"}
  }));
  assert.equal(proposal.weeklyStructure.id,"upper_lower_five");
  assert.equal(proposal.weeklyStructure.focuses.filter(focus=>focus==="upper").length,2);
  assert.equal(proposal.weeklyStructure.focuses.filter(focus=>focus==="lower").length,2);
  assertHealthyWeek(proposal,5);
});

test("estructura de seis días mantiene frecuencia, cobertura y presupuesto",()=>{
  const {domain,generator}=loadModules();
  const proposal=generate(generator,baseInput(domain,{
    userProfile:{weeklyAvailability:6,preferredSessionDurationMin:60},
    activeGoalCycle:{primaryGoal:"maintenance"},
    activeTrainingPhase:{type:"maintenance"}
  }));
  assert.equal(proposal.weeklyStructure.id,"upper_lower_six");
  assert.equal(proposal.weeklyStructure.focuses.filter(focus=>focus==="upper").length,3);
  assert.equal(proposal.weeklyStructure.focuses.filter(focus=>focus==="lower").length,3);
  assertHealthyWeek(proposal,6);
});

test("consume reglas y taxonomías mediante GymOSExerciseDomain",()=>{
  assert.match(generatorSource,/global\.GymOSExerciseDomain/);
  assert.match(generatorSource,/domain\(\)\.getProgrammingRule/);
  assert.match(generatorSource,/domain\(\)\.normalizeEquipmentSelection/);
  assert.match(generatorSource,/domain\(\)\.validateExerciseDefinition/);
  assert.doesNotMatch(generatorSource,/const\s+PROGRAMMING_RULES|const\s+MOVEMENT_PATTERNS|const\s+EQUIPMENT_TAXONOMY/);
});
