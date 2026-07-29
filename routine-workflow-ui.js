(function(global){
  "use strict";

  const MODEL_VERSION="4.2.0-alpha.1-phase-e";
  const VIEWS=Object.freeze(["summary","prepare","review","import"]);
  const CONFIRMATIONS=Object.freeze(["reject","activate","rollback"]);
  const COMMON_GOAL_IDS=Object.freeze([
    "fat_loss","muscle_gain","strength_gain",
    "general_health","return_to_training","maintenance"
  ]);
  const PRESENTABLE_LABELS=Object.freeze({
    full_body:"Cuerpo completo",
    upper:"Tren superior",
    lower:"Tren inferior",
    horizontal_push:"Empuje horizontal",
    horizontal_pull:"Tirón horizontal",
    vertical_push:"Empuje vertical",
    vertical_pull:"Tirón vertical",
    knee_dominant:"Dominante de rodilla",
    hip_hinge:"Bisagra de cadera",
    anti_extension_core:"Core antiextensión",
    main:"Principal",
    accessory:"Accesorio",
    support:"Apoyo"
  });

  function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
  function text(value){return String(value??"").trim();}
  function list(value){return Array.isArray(value)?value:[];}
  function unique(values){return [...new Set(list(values).map(text).filter(Boolean))];}
  function escapeHtml(value){
    return String(value??"").replace(/[&<>"']/g,character=>({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    })[character]);
  }
  function normalizeOwnerId(ownerId){
    if(!global.GymOSProfileData?.normalizeOwnerId){
      throw new Error("GymOSProfileData is required.");
    }
    return global.GymOSProfileData.normalizeOwnerId(ownerId);
  }
  function labelFrom(options,value,fallback="Sin configurar"){
    return list(options).find(option=>option.id===value)?.label||text(value)||fallback;
  }
  function presentableLabel(value,fallback="Sin configurar"){
    const raw=text(value);
    if(!raw) return fallback;
    const token=raw
      .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g,"$1_$2")
      .replace(/[\s-]+/g,"_")
      .toLowerCase();
    if(PRESENTABLE_LABELS[token]) return PRESENTABLE_LABELS[token];
    const readable=token.replace(/_+/g," ").trim();
    return readable?readable.charAt(0).toUpperCase()+readable.slice(1):fallback;
  }
  function readableSentence(value,fallback=""){
    const raw=text(value);
    if(!raw) return fallback;
    const known={
      "Cubre el patrón requerido.":"Cubre el patrón necesario.",
      "Compatible con el objetivo principal.":"Encaja con el objetivo principal.",
      "Compatible con la experiencia.":"Se adapta a tu experiencia.",
      "Respeta una preferencia compatible.":"Respeta tus preferencias.",
      "Mantiene continuidad con un ejercicio conocido.":"Mantiene continuidad con un ejercicio conocido.",
      "Conserva un ejercicio personalizado válido.":"Conserva un ejercicio personalizado que ya utilizas.",
      "Ofrece el apoyo priorizado en esta fase.":"Ofrece el apoyo adecuado para esta fase.",
      "Mismo patrón":"Mantiene el mismo patrón de movimiento.",
      "Alternativa compatible":"Es una alternativa compatible con esta sesión."
    };
    if(known[raw]) return known[raw];
    if(/^[a-z0-9_-]+$/i.test(raw)) return `${presentableLabel(raw)}.`;
    return /[.!?]$/.test(raw)?raw:`${raw}.`;
  }
  function warningLabel(value){
    const raw=text(value);
    const known={
      "Menos adecuado para el objetivo principal.":"Su encaje con el objetivo principal es menor, pero mantiene la estructura de la sesión.",
      "El patrón ya aparece en la sesión.":"Este patrón también aparece en otro ejercicio de la sesión.",
      exercise_avoided:"El ejercicio figura entre los movimientos que prefieres evitar.",
      equipment_or_location_unavailable:"El ejercicio necesita otro equipamiento o entorno.",
      experience_mismatch:"La dificultad requiere una revisión según tu experiencia.",
      technical_complexity:"La complejidad técnica requiere una revisión adicional."
    };
    return known[raw]||readableSentence(raw);
  }
  function exerciseSelectionPresentation(exercise={}){
    const scoring=exercise.scoreBreakdown||{};
    const explicitReasons=list(exercise.selectionReasons).map(reason=>readableSentence(reason));
    const reasons=unique(explicitReasons.length?explicitReasons:[
        "Cubre el patrón necesario.",
        "Es compatible con tu equipamiento.",
        ...list(scoring.positiveReasons).map(reason=>readableSentence(reason)),
        readableSentence(exercise.selectionReason)
      ]).filter(Boolean);
    const warnings=unique([
      ...list(scoring.penalties).map(warningLabel),
      ...list(scoring.blockers).map(warningLabel)
    ]).filter(Boolean);
    return {
      reasons,
      warnings,
      summary:reasons.slice(0,2).join(" ")
    };
  }
  function sessionDisplayName(session,index){
    const fallback=`Sesión ${String.fromCharCode(65+Math.max(0,index))}`;
    const raw=text(session?.name||session?.label);
    if(!raw) return fallback;
    const normalized=raw.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    if(
      normalized===text(session?.id).toLowerCase()||
      /^(session|sesion)[\s_-]*\d+$/.test(normalized)
    ) return fallback;
    return presentableLabel(raw,fallback);
  }
  function goalSelectionViewModel(options,{primaryGoal,secondaryGoals=[],expanded=false}={}){
    const primary=text(primaryGoal);
    const secondary=unique(secondaryGoals).filter(goal=>goal!==primary).slice(0,2);
    const selected=new Set([primary,...secondary].filter(Boolean));
    const normalized=list(options)
      .filter(option=>text(option?.id)&&text(option?.label))
      .map(option=>({id:text(option.id),label:text(option.label)}));
    const hasAdditional=normalized.some(option=>!COMMON_GOAL_IDS.includes(option.id));
    const visible=normalized.filter(option=>
      expanded||COMMON_GOAL_IDS.includes(option.id)||selected.has(option.id)
    ).map(option=>({
      ...option,
      primarySelected:option.id===primary,
      secondarySelected:secondary.includes(option.id),
      secondaryDisabled:option.id===primary
    }));
    return {
      primaryGoal:primary,
      secondaryGoals:secondary,
      secondaryCount:secondary.length,
      expanded:Boolean(expanded),
      hasAdditional,
      visible
    };
  }
  function createFlowState(ownerId){
    return {
      ownerId:normalizeOwnerId(ownerId),
      view:"summary",
      selectedProposalId:null,
      confirmation:null,
      busy:null,
      message:null
    };
  }
  function resetFlowForOwner(state,ownerId){
    const normalizedOwner=normalizeOwnerId(ownerId);
    if(state?.ownerId===normalizedOwner) return clone(state);
    return createFlowState(normalizedOwner);
  }
  function setFlowView(state,view,proposalId=null){
    return {
      ...clone(state),
      view:VIEWS.includes(view)?view:"summary",
      selectedProposalId:text(proposalId)||null,
      confirmation:null,
      message:null
    };
  }
  function openConfirmation(state,type){
    return {
      ...clone(state),
      confirmation:CONFIRMATIONS.includes(type)?type:null,
      message:null
    };
  }
  function closeConfirmation(state){
    return {...clone(state),confirmation:null};
  }
  function beginOperation(state,operation){
    if(state?.busy) return {accepted:false,state:clone(state)};
    return {
      accepted:true,
      state:{...clone(state),busy:text(operation)||"loading",message:null}
    };
  }
  function finishOperation(state,message=null){
    return {...clone(state),busy:null,message:message?clone(message):null};
  }
  function buildGenerationInput(source={}){
    return clone({
      userProfile:source.userProfile||null,
      currentLifeState:source.currentLifeState||null,
      activeGoalCycle:source.activeGoalCycle||null,
      activeTrainingPhase:source.activeTrainingPhase||null,
      exerciseLibrary:list(source.exerciseLibrary),
      currentRoutine:source.currentRoutine||{A:[],B:[],C:[]},
      workoutHistory:list(source.workoutHistory),
      generationPreferences:source.generationPreferences||{}
    });
  }
  function validateGenerationInput(input){
    const missing=[];
    const profile=input?.userProfile;
    if(!profile) missing.push("Perfil deportivo");
    if(!input?.currentLifeState) missing.push("Estado vital");
    if(!input?.activeGoalCycle?.primaryGoal) missing.push("Objetivo principal");
    if(!input?.activeTrainingPhase?.type) missing.push("Fase de entrenamiento");
    const days=Number(profile?.weeklyAvailability);
    if(!Number.isInteger(days)||days<2||days>6) missing.push("Días disponibles entre 2 y 6");
    const duration=Number(profile?.preferredSessionDurationMin);
    if(!Number.isFinite(duration)||duration<25||duration>180){
      missing.push("Duración de sesión entre 25 y 180 minutos");
    }
    if(!text(profile?.trainingLocation)) missing.push("Lugar de entrenamiento");
    if(!list(profile?.availableEquipment).length) missing.push("Equipamiento disponible");
    if(!list(input?.exerciseLibrary).length) missing.push("Biblioteca de ejercicios");
    return {valid:missing.length===0,missing:unique(missing)};
  }
  function routineSummary(routine){
    const sessions=Array.isArray(routine?.sessions)
      ?routine.sessions.slice().sort((a,b)=>
        (Number(a?.order)||Number.MAX_SAFE_INTEGER)-
        (Number(b?.order)||Number.MAX_SAFE_INTEGER)||
        text(a?.sessionId).localeCompare(text(b?.sessionId),"en")
      ).map((session,index)=>({
        key:text(session.sessionId),
        name:text(session.name)||`Sesión ${text(session.label)||index+1}`,
        focus:text(session.focus)||null,
        exerciseCount:list(session.exercises).length
      }))
      :["A","B","C"].filter(key=>list(routine?.[key]).length).map(key=>{
        const exercises=list(routine[key]);
        const metadata=exercises[0]?.sessionMetadata||{};
        return {
          key,
          name:text(metadata.name)||`Sesión ${key}`,
          focus:text(metadata.focus)||null,
          exerciseCount:exercises.length
        };
      });
    return {
      sessionCount:sessions.length,
      sessions,
      exerciseCount:sessions.reduce((sum,session)=>sum+session.exerciseCount,0)
    };
  }
  function preparationModel(source,labels={}){
    const input=buildGenerationInput(source);
    const validation=validateGenerationInput(input);
    const profile=input.userProfile||{};
    const life=input.currentLifeState||{};
    const goal=input.activeGoalCycle||{};
    const phase=input.activeTrainingPhase||{};
    const restrictions=unique([
      ...list(profile.injuries),...list(profile.painAreas),
      ...list(profile.medicalRestrictions),
      ...list(life.details?.currentLimitations),
      ...list(life.details?.professionalRestrictions)
    ]);
    const preferredIds=unique(input.generationPreferences?.preferredExerciseIds);
    return {
      input,
      canGenerate:validation.valid,
      missing:validation.missing,
      summary:{
        primaryGoal:labelFrom(labels.goals,goal.primaryGoal),
        secondaryGoals:list(goal.secondaryGoals).map(value=>labelFrom(labels.goals,value,value)),
        phase:labelFrom(labels.phases,phase.type),
        lifeState:labelFrom(labels.lifeStates,life.type),
        experience:labelFrom(labels.experience,profile.trainingExperience),
        days:Number(profile.weeklyAvailability)||null,
        duration:Number(profile.preferredSessionDurationMin)||null,
        location:labelFrom(labels.locations,profile.trainingLocation),
        equipment:unique(profile.availableEquipment).map(value=>labelFrom(labels.equipment,value,value)),
        restrictions,
        preferences:{
          preferredExerciseIds:preferredIds,
          avoidedExercises:unique(profile.avoidedExercises),
          style:text(input.generationPreferences?.style),
          cardio:text(input.generationPreferences?.cardio)
        },
        knownExerciseCount:routineSummary(input.currentRoutine).exerciseCount,
        previousWorkoutCount:list(input.workoutHistory).length
      }
    };
  }
  function targetLabel(target){
    if(typeof target==="string") return target;
    if(!target||typeof target!=="object") return "Sin objetivo";
    const suffix=target.type==="duration"?" s":" reps";
    if(target.min!==undefined&&target.max!==undefined&&target.min!==target.max){
      return `${target.min}–${target.max}${suffix}`;
    }
    return `${target.min??target.max??target.seconds??"—"}${suffix}`;
  }
  function rirLabel(value){
    if(value===null||value===undefined) return "Sin RIR";
    if(typeof value!=="object") return `RIR ${value}`;
    if(value.min!==undefined&&value.max!==undefined&&value.min!==value.max){
      return `RIR ${value.min}–${value.max}`;
    }
    return `RIR ${value.min??value.max??"—"}`;
  }
  function proposalBlockers(record,ownerId,currentRoutine){
    const blockers=[];
    let normalizedOwner;
    try{normalizedOwner=normalizeOwnerId(ownerId);}
    catch(_){return ["invalid_owner"];}
    if(!record) return ["proposal_not_found"];
    if(record.ownerId!==normalizedOwner) blockers.push("owner_mismatch");
    if(record.lifecycle?.status!=="pending_review") blockers.push("proposal_not_pending");
    if(record.comparison?.stale) blockers.push("proposal_stale");
    if(record.activationCompatibility?.compatible!==true) blockers.push("activation_incompatible");
    if(record.proposal?.reviewRequired) blockers.push("review_required");
    if(list(record.proposal?.unresolvedQuestions).length) blockers.push("unresolved_questions");
    if(list(record.proposal?.coverage?.missingPatterns).length) blockers.push("missing_patterns");
    if(record.proposal?.validation?.valid===false) blockers.push("proposal_invalid");
    if(list(record.proposal?.validation?.results).some(result=>result?.severity==="error")){
      blockers.push("proposal_errors");
    }
    if(list(record.proposal?.blockers).length||list(record.proposal?.errors).length){
      blockers.push("proposal_errors");
    }
    if(global.GymOSRoutineActivation?.validateProposalSessions(record.proposal)?.length){
      blockers.push("proposal_errors");
    }
    if(global.GymOSRoutineProposals&&currentRoutine){
      if(record.baseline?.routineHash!==global.GymOSRoutineProposals.routineHash(currentRoutine)){
        blockers.push("baseline_mismatch");
      }
    }
    return unique(blockers);
  }
  function proposalStatus(record,blockers){
    if(record?.comparison?.stale||blockers.includes("baseline_mismatch")) return "stale";
    if(record?.proposal?.reviewRequired) return "review_required";
    if(record?.activationCompatibility?.compatible!==true) return "incompatible";
    return record?.lifecycle?.status||"unavailable";
  }
  function proposalViewModel(record,{ownerId,currentRoutine,labels={}}={}){
    if(!record) return null;
    const immutable=clone(record);
    const blockers=proposalBlockers(immutable,ownerId,currentRoutine);
    const proposal=immutable.proposal||{};
    const sessions=list(proposal.sessions).map((session,index)=>({
      name:sessionDisplayName(session,index),
      focus:presentableLabel(session.focus,"Enfoque general"),
      estimatedDurationMin:Number(session.estimatedDurationMin)||null,
      exercises:list(session.exercises).map((exercise,exerciseIndex)=>{
        const prescription=exercise.prescription||{};
        const presentation=exerciseSelectionPresentation(exercise);
        return {
          id:text(exercise.exerciseId||exercise.id),
          order:exerciseIndex+1,
          name:text(exercise.name)||"Ejercicio sin nombre",
          pattern:presentableLabel(exercise.pattern||exercise.movementPattern,"Patrón general"),
          role:presentableLabel(exercise.role||exercise.function,"Complementario"),
          sets:Number(prescription.sets??exercise.sets)||0,
          target:targetLabel(prescription.target??exercise.target??exercise.reps),
          rir:rirLabel(prescription.targetRir??exercise.targetRir??exercise.rir),
          restSeconds:Number(prescription.restSeconds??exercise.restSeconds)||0,
          reason:presentation.summary||"Selección compatible con la sesión.",
          reasons:presentation.reasons,
          warnings:presentation.warnings,
          alternatives:list(exercise.alternatives).map(alternative=>({
            id:text(alternative.exerciseId||alternative.id),
            name:text(alternative.name)||"Alternativa",
            reason:readableSentence(alternative.reason,"Es una alternativa compatible con esta sesión.")
          }))
        };
      })
    }));
    const comparison=immutable.comparison||{};
    const summary=comparison.summary||{};
    return {
      proposalId:text(proposal.proposalId),
      status:proposalStatus(immutable,blockers),
      blockers,
      canActivate:blockers.length===0,
      generatedAt:proposal.generatedAt||immutable.lifecycle?.createdAt||null,
      weeklyStructure:presentableLabel(
        proposal.weeklyStructure?.label||proposal.weeklyStructure?.id,
        "Sin estructura"
      ),
      sessionCount:sessions.length,
      estimatedDurationMin:sessions.length
        ?Math.max(...sessions.map(session=>session.estimatedDurationMin||0))||null
        :null,
      primaryGoal:labelFrom(labels.goals,proposal.inputSummary?.goal),
      phase:labelFrom(labels.phases,proposal.inputSummary?.phase),
      coverage:{
        balanced:Boolean(proposal.coverage?.balanced),
        covered:list(proposal.coverage?.coveredPatterns),
        missing:list(proposal.coverage?.missingPatterns)
      },
      compatible:Boolean(immutable.activationCompatibility?.compatible),
      compatibilityReasons:list(immutable.activationCompatibility?.reasons),
      stale:Boolean(comparison.stale),
      reviewRequired:Boolean(proposal.reviewRequired),
      warnings:list(proposal.warnings).map(text).filter(Boolean),
      questions:list(proposal.unresolvedQuestions).map(text).filter(Boolean),
      sessions,
      diff:{
        summary:{
          total:Number(summary.totalChanges)||0,
          sessionsAdded:Number(summary.sessionsAdded)||0,
          sessionsRemoved:Number(summary.sessionsRemoved)||0,
          exercisesAdded:Number(summary.exercisesAdded)||0,
          exercisesRemoved:Number(summary.exercisesRemoved)||0,
          exercisesSubstituted:Number(summary.exercisesSubstituted)||0,
          orderChanges:Number(summary.orderChanges)||0,
          prescriptionChanges:Number(summary.prescriptionChanges)||0
        },
        changes:list(comparison.changes).map(change=>({
          type:text(change.type),
          message:text(change.message)||"Cambio en la rutina",
          sessionId:text(change.sessionId)||null,
          exerciseId:text(change.exerciseId)||null
        }))
      }
    };
  }
  function selectPendingProposal(records,ownerId,preferredId=null){
    const normalizedOwner=normalizeOwnerId(ownerId);
    const pending=list(records).filter(record=>
      record?.ownerId===normalizedOwner&&record?.lifecycle?.status==="pending_review"
    );
    const preferred=text(preferredId);
    return clone(
      pending.find(record=>record.proposal?.proposalId===preferred)||
      pending[0]||null
    );
  }
  function selectReversibleActivation(records,ownerId,preferredId=null){
    const normalizedOwner=normalizeOwnerId(ownerId);
    const reversible=list(records).filter(record=>
      record?.ownerId===normalizedOwner&&record?.status==="activated"&&
      record?.rollback?.available===true
    );
    const preferred=text(preferredId);
    return clone(
      reversible.find(record=>record.activationId===preferred)||
      reversible[0]||null
    );
  }
  function workflowSummaryModel({
    ownerId,currentRoutine,proposalRecords,activationRecords,
    activeProposalId,activeActivationId,activeGoalCycle,activeTrainingPhase,labels={}
  }={}){
    const normalizedOwner=normalizeOwnerId(ownerId);
    const proposal=selectPendingProposal(proposalRecords,normalizedOwner,activeProposalId);
    const activation=selectReversibleActivation(
      activationRecords,normalizedOwner,activeActivationId
    );
    const blocked=list(activationRecords).find(record=>
      record?.ownerId===normalizedOwner&&record?.status==="rollback_blocked"
    )||null;
    const latestActivation=list(activationRecords).find(record=>
      record?.ownerId===normalizedOwner
    )||null;
    return {
      ownerId:normalizedOwner,
      routine:routineSummary(currentRoutine),
      goal:labelFrom(labels.goals,activeGoalCycle?.primaryGoal),
      phase:labelFrom(labels.phases,activeTrainingPhase?.type),
      lastActivation:latestActivation?{
        activationId:latestActivation.activationId,
        status:latestActivation.status,
        activatedAt:latestActivation.activatedAt
      }:null,
      pendingProposal:proposal?proposalViewModel(proposal,{
        ownerId:normalizedOwner,currentRoutine,labels
      }):null,
      reversibleActivation:activation?{
        activationId:activation.activationId,
        proposalId:activation.proposalId,
        activatedAt:activation.activatedAt,
        current:routineSummary(
          activation.activated?.canonicalRoutine||activation.activated?.routine
        ),
        baseline:routineSummary(
          activation.baseline?.canonicalRoutine||activation.baseline?.routine
        ),
        blockedReason:activation.rollback?.blockedReason||null
      }:null,
      blockedActivation:blocked?{
        activationId:blocked.activationId,
        proposalId:blocked.proposalId,
        activatedAt:blocked.activatedAt,
        blockedReason:blocked.rollback?.blockedReason||"routine_changed"
      }:null
    };
  }

  global.GymOSRoutineWorkflowUI=Object.freeze({
    MODEL_VERSION,VIEWS,CONFIRMATIONS,COMMON_GOAL_IDS,PRESENTABLE_LABELS,
    escapeHtml,presentableLabel,exerciseSelectionPresentation,goalSelectionViewModel,
    createFlowState,resetFlowForOwner,setFlowView,openConfirmation,closeConfirmation,
    beginOperation,finishOperation,buildGenerationInput,validateGenerationInput,
    routineSummary,preparationModel,proposalBlockers,proposalViewModel,
    selectPendingProposal,selectReversibleActivation,workflowSummaryModel
  });
})(typeof window!=="undefined"?window:globalThis);
