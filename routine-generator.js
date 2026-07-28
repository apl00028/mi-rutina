(function(global){
  "use strict";

  const GENERATOR_VERSION="4.2.0-alpha.1-phase-b";
  const PRIORITY_ORDER=Object.freeze([
    "life_state","restrictions","primary_goal","training_phase","secondary_goals","preferences"
  ]);
  const DIFFICULTY_RANK=Object.freeze({beginner:1,returning:1,intermediate:2,advanced:3});
  const ESSENTIAL_PATTERNS=Object.freeze([
    "knee_dominant","hip_hinge","horizontal_push","horizontal_pull","vertical_pull","anti_extension_core"
  ]);
  const RESTRICTION_RULES=Object.freeze({
    knee:Object.freeze(["squat","knee_dominant","knee_extension","unilateral_lower_body"]),
    lumbar:Object.freeze(["hip_hinge"]),
    shoulder:Object.freeze([
      "horizontal_push","vertical_push","shoulder_abduction","shoulder_external_rotation"
    ])
  });

  function domain(){
    if(!global.GymOSExerciseDomain) throw new Error("GymOSExerciseDomain is required.");
    return global.GymOSExerciseDomain;
  }
  function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
  function text(value){return String(value??"").trim();}
  function token(value){
    return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
      .replace(/[^a-z0-9]+/g," ").trim();
  }
  function unique(values){return [...new Set((values||[]).filter(Boolean))];}
  function canonical(value){
    if(Array.isArray(value)) return value.map(canonical);
    if(value&&typeof value==="object"){
      return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
    }
    return value;
  }
  function stableStringify(value){return JSON.stringify(canonical(value));}
  function stableHash(value){
    const source=stableStringify(value);
    let hash=2166136261;
    for(let index=0;index<source.length;index+=1){
      hash^=source.charCodeAt(index);
      hash=Math.imul(hash,16777619);
    }
    return (hash>>>0).toString(36).padStart(7,"0");
  }
  function list(value){return Array.isArray(value)?value.filter(Boolean):value?[value]:[];}
  function sortedTextSet(value){
    return unique(list(value).map(item=>text(item))).sort((a,b)=>a.localeCompare(b,"en"));
  }
  function normalizeGenerationInput(rawInput={}){
    const input=clone(rawInput);
    const profile=input.userProfile||{};
    ["injuries","painAreas","medicalRestrictions","avoidedExercises"].forEach(key=>{
      if(profile[key]!==undefined) profile[key]=sortedTextSet(profile[key]);
    });
    if(profile.availableEquipment!==undefined){
      profile.availableEquipment=domain().normalizeEquipmentSelection(profile.availableEquipment)
        .sort((a,b)=>a.localeCompare(b,"en"));
    }
    if(input.currentLifeState?.details){
      ["currentLimitations","professionalRestrictions"].forEach(key=>{
        if(input.currentLifeState.details[key]!==undefined){
          input.currentLifeState.details[key]=sortedTextSet(input.currentLifeState.details[key]);
        }
      });
    }
    if(input.activeGoalCycle?.secondaryGoals){
      input.activeGoalCycle.secondaryGoals=sortedTextSet(input.activeGoalCycle.secondaryGoals);
    }
    const preferences=input.generationPreferences||{};
    ["preferredExerciseIds","preferredExercises"].forEach(key=>{
      if(preferences[key]!==undefined) preferences[key]=sortedTextSet(preferences[key]);
    });
    input.exerciseLibrary=list(input.exerciseLibrary).sort((a,b)=>
      text(a.id).localeCompare(text(b.id),"en")||
      text(a.legacyIdentityKey).localeCompare(text(b.legacyIdentityKey),"en")||
      stableStringify(a).localeCompare(stableStringify(b),"en")
    );
    return input;
  }
  function goalId(activeGoalCycle){return text(activeGoalCycle?.primaryGoal)||"general_health";}
  function phaseId(activeTrainingPhase){return text(activeTrainingPhase?.type)||"maintenance";}
  function normalizedEquipment(userProfile){
    return domain().normalizeEquipmentSelection(userProfile?.availableEquipment||[]);
  }
  function allRestrictions(userProfile,lifeState){
    return unique([
      ...list(userProfile?.injuries),
      ...list(userProfile?.painAreas),
      ...list(userProfile?.medicalRestrictions),
      ...list(lifeState?.details?.currentLimitations),
      ...list(lifeState?.details?.professionalRestrictions)
    ].map(token)).sort((a,b)=>a.localeCompare(b,"en"));
  }
  function restrictionKinds(restrictions){
    const joined=restrictions.join(" ");
    const kinds=[];
    if(/\b(rodilla|knee|patela|rotula)\b/.test(joined)) kinds.push("knee");
    if(/\b(lumbar|espalda baja|lower back|lumbalgia)\b/.test(joined)) kinds.push("lumbar");
    if(/\b(hombro|shoulder|manguito)\b/.test(joined)) kinds.push("shoulder");
    return kinds;
  }
  function unresolvedMedicalRestriction(restrictions){
    return restrictions.some(value=>/\b(pendiente|desconocid|unknown|sin aclarar|consultar)\b/.test(value));
  }
  function pregnancyReview(lifeState){
    if(lifeState?.type!=="pregnancy") return {required:false,questions:[],warnings:[]};
    const details=lifeState.details||{};
    const questions=[],warnings=[];
    if(details.medicalExerciseClearance!=="yes"){
      questions.push("Confirma con tu profesional sanitario que puedes realizar ejercicio.");
    }
    if(details.highRiskStatus!=="no"){
      questions.push("Aclara con tu profesional si existe una situación de embarazo de riesgo.");
    }
    if(details.requiresProfessionalReview){
      questions.push("Revisa las restricciones profesionales antes de generar la propuesta.");
    }
    if(questions.length){
      warnings.push("No se seleccionan ejercicios automáticamente hasta aclarar la información de seguridad.");
    }
    return {required:questions.length>0,questions,warnings};
  }
  function specialStateReview(lifeState){
    const type=lifeState?.type;
    if(!type||["general","pregnancy"].includes(type)) return {required:false,questions:[]};
    const details=lifeState.details||{};
    const hasGuidance=list(details.currentLimitations).length>0||
      list(details.professionalRestrictions).length>0;
    const inherentlyUnclear=["injury_recovery","surgery_recovery","special_situation"].includes(type);
    if(details.requiresProfessionalReview||(inherentlyUnclear&&!hasGuidance)){
      return {
        required:true,
        questions:["Aclara las limitaciones y recomendaciones profesionales de tu situación actual."]
      };
    }
    return {required:false,questions:[]};
  }
  function validateInputs(input){
    const blockers=[],warnings=[],unresolvedQuestions=[],validationIssues=[];
    const profile=input.userProfile||{};
    const days=Number(profile.weeklyAvailability);
    const duration=Number(profile.preferredSessionDurationMin);
    const equipment=normalizedEquipment(profile).sort((a,b)=>a.localeCompare(b,"en"));
    const restrictions=allRestrictions(profile,input.currentLifeState);
    if(!input.userProfile) blockers.push("Falta el perfil del usuario.");
    if(!input.activeGoalCycle?.primaryGoal) blockers.push("Falta el objetivo principal.");
    if(!Number.isInteger(days)||days<2||days>6) blockers.push("Los días disponibles deben estar entre 2 y 6.");
    if(!Number.isFinite(duration)||duration<25||duration>180) blockers.push("La duración por sesión debe estar entre 25 y 180 minutos.");
    if(!equipment.length) blockers.push("Falta indicar el equipamiento disponible.");
    if(!Array.isArray(input.exerciseLibrary)||!input.exerciseLibrary.length) blockers.push("La biblioteca de ejercicios está vacía.");
    if(Array.isArray(input.exerciseLibrary)){
      const ids=input.exerciseLibrary.map(item=>text(item?.id)).filter(Boolean);
      if(new Set(ids).size!==ids.length){
        blockers.push("La biblioteca contiene identificadores duplicados.");
        validationIssues.push({code:"library_duplicate_ids",severity:"error"});
      }
      const invalid=input.exerciseLibrary.filter(item=>!domain().validateExerciseDefinition(item).valid);
      if(invalid.length){
        blockers.push("La biblioteca contiene ejercicios no válidos.");
        validationIssues.push({
          code:"invalid_exercise",severity:"error",
          exerciseIds:invalid.map(item=>item?.id||null)
        });
      }
    }
    if(unresolvedMedicalRestriction(restrictions)){
      blockers.push("Existe una restricción médica pendiente de aclarar.");
      unresolvedQuestions.push("Aclara la restricción médica antes de generar una propuesta.");
    }
    const pregnancy=pregnancyReview(input.currentLifeState);
    const specialState=specialStateReview(input.currentLifeState);
    warnings.push(...pregnancy.warnings);
    unresolvedQuestions.push(...pregnancy.questions);
    unresolvedQuestions.push(...specialState.questions);
    if(input.currentLifeState?.type==="pregnancy"&&[
      "fat_loss","aggressive_weight_loss","maximal_strength_testing","competition_peak"
    ].includes(goalId(input.activeGoalCycle))){
      blockers.push("El objetivo principal no es compatible con el estado vital actual.");
      unresolvedQuestions.push("Selecciona un objetivo compatible antes de generar la propuesta.");
    }
    return {
      valid:blockers.length===0&&!pregnancy.required&&!specialState.required,
      reviewRequired:pregnancy.required||specialState.required||unresolvedQuestions.length>0,
      blockers,warnings,unresolvedQuestions,equipment,restrictions,validationIssues,
      restrictionKinds:restrictionKinds(restrictions),days,duration
    };
  }

  function weeklyStructure(days,goal,experience,phase,duration=60,restrictedKinds=[]){
    const returning=experience==="beginner"||experience==="returning"||
      goal==="return_to_training"||["adaptation","return_to_training"].includes(phase);
    const constrained=duration<=40||restrictedKinds.length>=2;
    if(days===2) return {id:"two_day_full_body",label:"Full body A/B",focuses:["full_body","full_body"]};
    if(days===3&&goal==="muscle_gain"&&!returning&&!constrained){
      return {id:"upper_lower_full",label:"Torso / Pierna / Full body",focuses:["upper","lower","full_body"]};
    }
    if(days===3) return {id:"three_day_full_body",label:"Full body rotativo",focuses:["full_body","full_body","full_body"]};
    if(days===4) return {id:"upper_lower_four",label:"Torso / Pierna",focuses:["upper","lower","upper","lower"]};
    if(days===5){
      return returning||constrained
        ?{id:"three_strength_two_support",label:"Tres sesiones globales y dos de apoyo",focuses:["full_body","upper","lower","full_body","full_body"]}
        :{id:"upper_lower_five",label:"Torso / Pierna con frecuencia distribuida",focuses:["upper","lower","full_body","upper","lower"]};
    }
    return {id:"upper_lower_six",label:"Torso / Pierna alternos",focuses:["upper","lower","upper","lower","upper","lower"]};
  }

  const SLOT_TEMPLATES=Object.freeze({
    upper:Object.freeze([
      {pattern:"horizontal_push",role:"main",required:true},
      {pattern:"horizontal_pull",role:"main",required:true},
      {pattern:"vertical_pull",role:"main",required:true},
      {pattern:"vertical_push",role:"accessory",required:false},
      {pattern:"elbow_flexion",role:"accessory",required:false},
      {pattern:"elbow_extension",role:"accessory",required:false}
    ]),
    lower:Object.freeze([
      {pattern:"knee_dominant",role:"main",required:true},
      {pattern:"hip_hinge",role:"main",required:true},
      {pattern:"unilateral_lower_body",role:"main",required:false},
      {pattern:"knee_flexion",role:"accessory",required:false},
      {pattern:"calf_raise",role:"accessory",required:false},
      {pattern:"anti_extension_core",role:"accessory",required:true}
    ]),
    full_body:Object.freeze([
      {pattern:"knee_dominant",role:"main",required:true},
      {pattern:"horizontal_push",role:"main",required:true},
      {pattern:"horizontal_pull",role:"main",required:true},
      {pattern:"hip_hinge",role:"main",required:true},
      {pattern:"vertical_pull",role:"accessory",required:false},
      {pattern:"anti_extension_core",role:"accessory",required:false}
    ])
  });
  function rotateSlots(slots,index){
    if(!slots.length) return [];
    const offset=index%Math.min(3,slots.length);
    return [...slots.slice(offset),...slots.slice(0,offset)];
  }
  function sessionSlots(focus,index,duration,weeklyDays=3){
    const source=rotateSlots(SLOT_TEMPLATES[focus]||SLOT_TEMPLATES.full_body,index);
    const limit=weeklyDays>=5?4:duration<=35?4:duration<=50?5:6;
    const required=source.filter(slot=>slot.required);
    const optional=source.filter(slot=>!slot.required);
    return [...required,...optional].slice(0,Math.max(limit,required.length));
  }
  function exerciseAvailable(exercise,equipment,location){
    const required=list(exercise.requiredEquipment);
    if(!required.every(id=>equipment.includes(id))) return false;
    const locations=list(exercise.trainingLocations);
    if(location&&location!=="mixed"&&location!=="other"&&locations.length&&!locations.includes(location)) return false;
    return true;
  }
  function restrictionBlockers(exercise,kinds,avoided,lifeState){
    const blockers=[];
    const exerciseToken=token(`${exercise.id} ${exercise.name}`);
    if(avoided.some(value=>exerciseToken.includes(token(value)))) blockers.push("exercise_avoided");
    kinds.forEach(kind=>{
      if(RESTRICTION_RULES[kind]?.includes(exercise.movementPattern)) blockers.push(`${kind}_restriction`);
      if(kind==="lumbar"&&list(exercise.bodyPositions).includes("bent_over")) blockers.push("lumbar_position");
    });
    const flags=[...list(exercise.exclusionFlags),...list(exercise.cautionFlags)].map(token);
    kinds.forEach(kind=>{if(flags.some(flag=>flag.includes(kind))) blockers.push(`${kind}_flag`);});
    if(lifeState?.type==="pregnancy"){
      const pregnancy=exercise.pregnancy||{};
      if(!pregnancy.eligibleForConsideration) blockers.push("pregnancy_not_reviewed");
      if(pregnancy.prohibitedByProduct) blockers.push("pregnancy_prohibited");
      if(pregnancy.balanceRisk==="unknown"||pregnancy.fallRisk==="unknown"||pregnancy.impactLevel==="unknown"){
        blockers.push("pregnancy_risk_unknown");
      }
    }
    return unique(blockers);
  }
  function scoreExerciseCandidate(input){
    const {
      exercise,slot,userProfile,currentLifeState,activeGoalCycle,activeTrainingPhase,
      currentRoutine,availableEquipment,restrictionKinds:restrictedKinds,usedExerciseIds,
      usedPatterns,generationPreferences
    }=input;
    const blockers=[];
    if(!exercise||domain().validateExerciseDefinition(exercise).valid===false) blockers.push("invalid_exercise");
    if(exercise?.movementPattern!==slot?.pattern) blockers.push("pattern_mismatch");
    if(!exerciseAvailable(exercise,availableEquipment,userProfile?.trainingLocation)) blockers.push("equipment_or_location_unavailable");
    blockers.push(...restrictionBlockers(
      exercise,restrictedKinds,list(userProfile?.avoidedExercises),currentLifeState
    ));
    const experience=userProfile?.trainingExperience||"beginner";
    const rule=domain().getProgrammingRule(goalId(activeGoalCycle));
    if((DIFFICULTY_RANK[exercise?.difficulty]||1)>(DIFFICULTY_RANK[experience]||1)+1){
      blockers.push("experience_mismatch");
    }
    if(Number(exercise?.technicalComplexity)>Number(rule.maxTechnicalComplexity)){
      blockers.push("technical_complexity");
    }
    if(usedExerciseIds.has(exercise?.id)) blockers.push("duplicate_exercise");
    if(blockers.length) return {
      eligible:false,score:-Infinity,components:{},positiveReasons:[],penalties:[],blockers:unique(blockers)
    };

    const components={
      pattern:50,equipment:10,goal:0,phase:0,experience:0,preference:0,
      continuity:0,custom:0,repetition:0,balance:0
    };
    let score=components.pattern+components.equipment;
    const positiveReasons=["Cubre el patrón requerido."],penalties=[];
    const primary=goalId(activeGoalCycle);
    if(list(exercise.suitableGoals).includes(primary)){
      components.goal+=12;score+=12;positiveReasons.push("Compatible con el objetivo principal.");
    }
    if(list(exercise.lessSuitableGoals).includes(primary)){
      components.goal-=16;score-=16;penalties.push("Menos adecuado para el objetivo principal.");
    }
    if(list(exercise.experienceLevels).includes(experience)){
      components.experience+=6;score+=6;positiveReasons.push("Compatible con la experiencia.");
    }
    if(rule.preferSupported&&exercise.supported){
      components.phase+=8;score+=8;positiveReasons.push("Ofrece el apoyo priorizado en esta fase.");
    }
    if(["adaptation","return_to_training","deload"].includes(phaseId(activeTrainingPhase))){
      const phaseScore=Math.max(0,5-Number(exercise.technicalComplexity||1));
      components.phase+=phaseScore;score+=phaseScore;
    }
    const preferred=unique([
      ...list(generationPreferences?.preferredExerciseIds),
      ...list(generationPreferences?.preferredExercises)
    ]).map(token);
    if(exercise.favorite||preferred.includes(token(exercise.id))||preferred.includes(token(exercise.name))){
      components.preference+=5;score+=5;positiveReasons.push("Respeta una preferencia compatible.");
    }
    const knownNames=stableStringify(currentRoutine||{}).toLowerCase();
    if(knownNames.includes(text(exercise.name).toLowerCase())){
      components.continuity+=4;score+=4;positiveReasons.push("Mantiene continuidad con un ejercicio conocido.");
    }
    if(exercise.custom){
      components.custom+=2;score+=2;positiveReasons.push("Conserva un ejercicio personalizado válido.");
    }
    if(usedPatterns.has(exercise.movementPattern)){
      components.repetition-=5;score-=5;penalties.push("El patrón ya aparece en la sesión.");
    }
    const balancePenalty=Math.max(0,Number(exercise.balanceDemand||1)-2);
    components.balance-=balancePenalty;score-=balancePenalty;
    return {eligible:true,score,components,positiveReasons,penalties,blockers:[]};
  }
  function candidateOrder(a,b){
    if(b.result.score!==a.result.score) return b.result.score-a.result.score;
    return text(a.exercise.id).localeCompare(text(b.exercise.id),"en");
  }
  function doseFor(slot,goal,phase,experience,duration){
    const rule=domain().getProgrammingRule(goal);
    const main=slot.role==="main";
    const setRange=main?rule.mainSets:rule.accessorySets;
    const repRange=main?rule.mainRepRange:rule.accessoryRepRange;
    const restRange=main?rule.mainRestSeconds:rule.accessoryRestSeconds;
    let sets=setRange[0];
    let rir=rule.targetRir[0];
    if(experience==="advanced"&&duration>50) sets=Math.min(setRange[1],sets+1);
    if(["adaptation","return_to_training","deload"].includes(phase)){
      sets=Math.max(1,sets-1);
      rir=Math.min(5,rir+1);
    }
    if(duration<=35&&!slot.required) sets=Math.max(1,sets-1);
    return {
      sets,
      target:{type:"repetitions",min:repRange[0],max:repRange[1]},
      targetRir:{min:rir,max:Math.max(rir,rule.targetRir[1])},
      restSeconds:restRange[0],
      recordType:null
    };
  }
  function estimateExerciseSeconds(prescription){
    return prescription.sets*(40+prescription.restSeconds)+75;
  }
  function estimateSessionDuration(exercises){
    const seconds=300+exercises.reduce((sum,item)=>sum+estimateExerciseSeconds(item.prescription),0);
    return Math.ceil(seconds/60);
  }
  function selectSession(input,focus,index,context){
    const slots=sessionSlots(focus,index,context.duration,context.days);
    const selected=[],usedExerciseIds=new Set(),usedPatterns=new Set();
    const missingRequired=[],rejections=[];
    slots.forEach(slot=>{
      const candidates=input.exerciseLibrary.map(exercise=>({
        exercise,
        result:scoreExerciseCandidate({
          exercise,slot,userProfile:input.userProfile,currentLifeState:input.currentLifeState,
          activeGoalCycle:input.activeGoalCycle,activeTrainingPhase:input.activeTrainingPhase,
          currentRoutine:input.currentRoutine,availableEquipment:context.equipment,
          restrictionKinds:context.restrictionKinds,usedExerciseIds,usedPatterns,
          generationPreferences:input.generationPreferences
        })
      })).filter(candidate=>candidate.result.eligible).sort(candidateOrder);
      if(!candidates.length){
        if(slot.required) missingRequired.push(slot.pattern);
        rejections.push({slot:slot.pattern,reason:"no_compatible_candidate"});
        return;
      }
      const winner=candidates[0];
      const prescription=doseFor(
        slot,context.goal,context.phase,input.userProfile.trainingExperience,context.duration
      );
      const proposed={
        exerciseId:winner.exercise.id,
        name:winner.exercise.name,
        pattern:slot.pattern,
        role:slot.role,
        prescription:{
          ...prescription,
          recordType:list(winner.exercise.recordTypes)[0]||"weight_reps"
        },
        selectionReason:winner.result.positiveReasons.join(" "),
        scoreBreakdown:winner.result,
        alternatives:candidates.slice(1,4).map(candidate=>({
          exerciseId:candidate.exercise.id,name:candidate.exercise.name,
          score:candidate.result.score,reason:candidate.result.positiveReasons.join(" ")
        }))
      };
      const projected=estimateSessionDuration([...selected,proposed]);
      if(projected>context.duration&&selected.length>=3&&!slot.required){
        rejections.push({slot:slot.pattern,reason:"time_budget"});
        return;
      }
      selected.push(proposed);
      usedExerciseIds.add(winner.exercise.id);
      usedPatterns.add(slot.pattern);
    });
    return {
      id:`session-${index+1}`,label:`Sesión ${index+1}`,focus,
      exercises:selected,
      estimatedDurationMin:estimateSessionDuration(selected),
      timeLimitMin:context.duration,
      missingRequiredPatterns:missingRequired,
      rejectedSlots:rejections
    };
  }
  function validateProposal(sessions,context,input){
    const results=[];
    sessions.forEach(session=>{
      if(!session.exercises.length) results.push({code:"empty_session",severity:"error",sessionId:session.id});
      if(session.estimatedDurationMin>context.duration){
        results.push({code:"duration_exceeded",severity:"warning",sessionId:session.id});
      }
      const ids=session.exercises.map(item=>item.exerciseId);
      if(new Set(ids).size!==ids.length) results.push({code:"duplicate_exercise",severity:"error",sessionId:session.id});
      const totalSets=session.exercises.reduce((sum,item)=>sum+Number(item.prescription.sets||0),0);
      if(totalSets<4||totalSets>30){
        results.push({code:"volume_out_of_limits",severity:totalSets>30?"error":"warning",sessionId:session.id,totalSets});
      }
      session.missingRequiredPatterns.forEach(pattern=>{
        results.push({code:"required_pattern_missing",severity:"warning",sessionId:session.id,pattern});
      });
    });
    const selected=sessions.flatMap(session=>session.exercises);
    const selectedIds=selected.map(item=>item.exerciseId);
    if(new Set(input.exerciseLibrary.map(item=>item.id)).size!==input.exerciseLibrary.length){
      results.push({code:"library_duplicate_ids",severity:"warning"});
    }
    input.exerciseLibrary.forEach(exercise=>{
      if(!domain().validateExerciseDefinition(exercise).valid){
        results.push({code:"invalid_exercise",severity:"warning",exerciseId:exercise.id||null});
      }
    });
    selected.forEach(item=>{
      const exercise=input.exerciseLibrary.find(candidate=>candidate.id===item.exerciseId);
      if(!exerciseAvailable(exercise,context.equipment,input.userProfile.trainingLocation)){
        results.push({code:"equipment_missing",severity:"error",exerciseId:item.exerciseId});
      }
      const breaches=restrictionBlockers(
        exercise,context.restrictionKinds,list(input.userProfile.avoidedExercises),input.currentLifeState
      );
      if(breaches.length){
        results.push({code:"restriction_breach",severity:"error",exerciseId:item.exerciseId,breaches});
      }
    });
    return {
      valid:!results.some(result=>result.severity==="error"),
      results,
      selectedExerciseIds:selectedIds
    };
  }
  function blockedProposal(input,context,timestamp){
    const fingerprint={
      userProfile:input.userProfile,currentLifeState:input.currentLifeState,
      activeGoalCycle:input.activeGoalCycle,activeTrainingPhase:input.activeTrainingPhase,
      generationPreferences:input.generationPreferences
    };
    return {
      proposalId:`proposal-${stableHash(fingerprint)}`,
      type:"generated",status:"pending_review",generatorVersion:GENERATOR_VERSION,
      generatedAt:timestamp,reviewRequired:true,
      inputSummary:{days:context.days,durationMin:context.duration,equipment:context.equipment},
      rationale:["La seguridad y las restricciones tienen prioridad sobre el resto de preferencias."],
      warnings:[...context.warnings,...context.blockers],
      unresolvedQuestions:context.unresolvedQuestions,
      weeklyStructure:null,sessions:[],selectedExercises:[],
      coverage:{requiredPatterns:ESSENTIAL_PATTERNS,coveredPatterns:[],missingPatterns:ESSENTIAL_PATTERNS,balanced:false},
      validation:{
        valid:false,
        results:[
          ...context.validationIssues,
          ...context.blockers.map(message=>({code:"input_blocker",severity:"error",message}))
        ]
      }
    };
  }
  function generateRoutineProposal(rawInput={},options={}){
    const timestamp=options.timestamp||new Date().toISOString();
    const input=normalizeGenerationInput(rawInput);
    const context=validateInputs(input);
    if(!context.valid) return blockedProposal(input,context,timestamp);
    context.goal=goalId(input.activeGoalCycle);
    context.phase=phaseId(input.activeTrainingPhase);
    const experience=input.userProfile.trainingExperience||"beginner";
    const structure=weeklyStructure(
      context.days,context.goal,experience,context.phase,context.duration,context.restrictionKinds
    );
    const sessions=structure.focuses.map((focus,index)=>selectSession(input,focus,index,context));
    const validation=validateProposal(sessions,context,input);
    const selectedExercises=sessions.flatMap(session=>session.exercises.map(item=>({
      sessionId:session.id,...item
    })));
    const coveredPatterns=unique(selectedExercises.map(item=>item.pattern));
    const requiredPatterns=unique(sessions.flatMap(session=>
      sessionSlots(session.focus,Number(session.id.split("-")[1])-1,context.duration,context.days)
        .filter(slot=>slot.required).map(slot=>slot.pattern)
    ));
    const missingPatterns=requiredPatterns.filter(pattern=>!coveredPatterns.includes(pattern));
    const fingerprint={
      userProfile:input.userProfile,currentLifeState:input.currentLifeState,
      activeGoalCycle:input.activeGoalCycle,activeTrainingPhase:input.activeTrainingPhase,
      generationPreferences:input.generationPreferences,
      exerciseLibrary:input.exerciseLibrary.map(item=>({
        id:item.id,updatedAt:item.updatedAt,movementPattern:item.movementPattern
      })),
      structure:structure.id
    };
    const warnings=[...context.warnings];
    const unresolvedQuestions=[...context.unresolvedQuestions];
    if(missingPatterns.length){
      warnings.push("No se han podido cubrir todos los patrones requeridos.");
      unresolvedQuestions.push(
        `Faltan alternativas compatibles para: ${missingPatterns.join(", ")}.`
      );
    }
    if(validation.results.some(result=>result.code==="duration_exceeded")){
      warnings.push("Alguna sesión supera la duración declarada y requiere revisión.");
    }
    return {
      proposalId:`proposal-${stableHash(fingerprint)}`,
      type:"generated",status:"pending",generatorVersion:GENERATOR_VERSION,
      generatedAt:timestamp,
      reviewRequired:context.reviewRequired||!validation.valid||missingPatterns.length>0,
      inputSummary:{
        goal:context.goal,secondaryGoals:list(input.activeGoalCycle.secondaryGoals),
        phase:context.phase,experience,days:context.days,durationMin:context.duration,
        location:input.userProfile.trainingLocation,equipment:context.equipment,
        priorityOrder:PRIORITY_ORDER
      },
      rationale:[
        `La estructura ${structure.label} se ajusta a ${context.days} días disponibles.`,
        `La dosificación base corresponde al objetivo ${context.goal}.`,
        `La fase ${context.phase} modera volumen, complejidad y esfuerzo antes de aplicar preferencias.`
      ],
      warnings,
      unresolvedQuestions,
      weeklyStructure:{id:structure.id,label:structure.label,days:context.days,focuses:structure.focuses},
      sessions,selectedExercises,
      coverage:{
        requiredPatterns,coveredPatterns,missingPatterns,
        balanced:missingPatterns.length===0
      },
      validation
    };
  }

  global.GymOSRoutineGenerator=Object.freeze({
    GENERATOR_VERSION,PRIORITY_ORDER,ESSENTIAL_PATTERNS,RESTRICTION_RULES,
    stableStringify,stableHash,validateInputs,weeklyStructure,sessionSlots,
    scoreExerciseCandidate,estimateSessionDuration,generateRoutineProposal
  });
})(typeof window!=="undefined"?window:globalThis);
