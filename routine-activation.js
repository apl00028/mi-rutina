(function(global){
  "use strict";

  const MODEL_VERSION="4.2.0-alpha.1-phase-d";
  const MAX_ACTIVATIONS_PER_OWNER=10;
  const ALLOWED_STATUSES=Object.freeze(["activated","rolled_back","rollback_blocked"]);

  function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
  function text(value){return String(value??"").trim();}
  function list(value){return Array.isArray(value)?value:[];}
  function canonical(value){
    if(Array.isArray(value)) return value.map(canonical);
    if(value&&typeof value==="object"){
      return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
    }
    return value;
  }
  function stableStringify(value){return JSON.stringify(canonical(value));}
  function same(a,b){return stableStringify(a)===stableStringify(b);}
  function proposals(){
    if(!global.GymOSRoutineProposals) throw new Error("GymOSRoutineProposals is required.");
    return global.GymOSRoutineProposals;
  }
  function normalizeOwnerId(ownerId){
    if(!global.GymOSProfileData?.normalizeOwnerId){
      throw new Error("GymOSProfileData is required.");
    }
    return global.GymOSProfileData.normalizeOwnerId(ownerId);
  }
  function routineHash(routine){return proposals().routineHash(routine);}
  function incident(code,message,details={}){
    return {ok:false,code,message,...clone(details)};
  }
  function validTimestamp(value){return text(value)&&!Number.isNaN(Date.parse(value));}
  function parseRawJson(raw,fallback){
    if(raw===null||raw===undefined) return clone(fallback);
    try{return JSON.parse(raw);}catch(_){return clone(fallback);}
  }
  function validExerciseId(exercise){
    return Boolean(text(exercise?.exerciseId||exercise?.id));
  }
  function proposalBlockers(proposal){
    const blockers=[];
    if(proposal?.reviewRequired) blockers.push("review_required");
    if(list(proposal?.unresolvedQuestions).length) blockers.push("unresolved_questions");
    if(list(proposal?.coverage?.missingPatterns).length) blockers.push("missing_required_patterns");
    if(proposal?.validation?.valid===false) blockers.push("proposal_validation_failed");
    if(list(proposal?.validation?.results).some(item=>item?.severity==="error")){
      blockers.push("proposal_validation_errors");
    }
    if(list(proposal?.blockers).length||list(proposal?.errors).length){
      blockers.push("proposal_blockers");
    }
    return [...new Set(blockers)];
  }
  function validateProposalSessions(proposal){
    const errors=[];
    const sessions=list(proposal?.sessions);
    if(sessions.length<2||sessions.length>3) errors.push("incompatible_session_count");
    sessions.forEach((session,index)=>{
      const exercises=list(session?.exercises);
      if(!exercises.length) errors.push(`empty_session:${index+1}`);
      exercises.forEach((exercise,exerciseIndex)=>{
        if(!validExerciseId(exercise)) errors.push(`invalid_exercise_id:${index+1}:${exerciseIndex+1}`);
      });
      const ids=exercises.map(exercise=>text(exercise.exerciseId||exercise.id));
      if(new Set(ids).size!==ids.length) errors.push(`duplicate_exercise_id:${index+1}`);
    });
    return errors;
  }
  function activationId(ownerId,proposalId,timestamp){
    return `activation-${proposals().stableHash({
      ownerId,proposalId,timestamp
    }).replace(/^routine-/,"")}`;
  }
  function mapExercise(exercise,session,index){
    const prescription=exercise?.prescription||{};
    const target=clone(prescription.target??exercise?.target??exercise?.reps??null);
    const targetLabel=typeof target==="string"
      ?target
      :target?.type==="duration"
        ?`${target.min??target.seconds??""}${target.max?`–${target.max}`:""} s`.trim()
        :target?.min||target?.max
          ?`${target.min??target.max}${target.max&&target.max!==target.min?`–${target.max}`:""} reps`
          :"8–10 reps";
    return {
      id:text(exercise?.exerciseId||exercise?.id),
      exerciseId:text(exercise?.exerciseId||exercise?.id),
      name:text(exercise?.name),
      target:targetLabel,
      sets:Math.max(1,Number(prescription.sets??exercise?.sets)||1),
      increment:Number(exercise?.increment)||0,
      type:prescription.recordType==="duration"||target?.type==="duration"?"tiempo":"peso",
      prescription:clone(prescription),
      pattern:text(exercise?.pattern||exercise?.movementPattern),
      role:text(exercise?.role||exercise?.function),
      targetRir:clone(prescription.targetRir??exercise?.targetRir??exercise?.rir??null),
      restSeconds:Number(prescription.restSeconds??exercise?.restSeconds)||0,
      recordType:text(prescription.recordType||exercise?.recordType),
      movementPattern:text(exercise?.movementPattern||exercise?.pattern),
      function:text(exercise?.function||exercise?.role),
      equipment:clone(exercise?.equipment??null),
      variant:clone(exercise?.variant??null),
      notes:clone(exercise?.notes??null),
      metadata:clone(exercise?.metadata??null),
      order:index,
      sessionMetadata:{
        id:text(session?.id),
        name:text(session?.name||session?.label),
        focus:text(session?.focus),
        metadata:clone(session?.metadata||null)
      }
    };
  }
  function mapProposalToRoutine(proposal){
    const output={A:[],B:[],C:[]};
    const sessionMapping={};
    list(proposal?.sessions).forEach((session,index)=>{
      const key=["A","B","C"][index];
      sessionMapping[text(session?.id)||`session-${index+1}`]=key;
      output[key]=list(session?.exercises).map((exercise,exerciseIndex)=>
        mapExercise(exercise,session,exerciseIndex)
      );
    });
    return {routine:output,sessionMapping};
  }
  function validateActivationRequest({
    ownerId,proposalRecord,currentRoutine,confirmed=false
  }={}){
    let normalizedOwner;
    try{normalizedOwner=normalizeOwnerId(ownerId);}
    catch(_){return incident("invalid_owner","El propietario no es válido.");}
    if(confirmed!==true) return incident("explicit_confirmation_required","La activación requiere confirmación explícita.");
    if(!proposalRecord) return incident("proposal_not_found","La propuesta no existe.");
    if(proposalRecord.ownerId!==normalizedOwner){
      return incident("owner_mismatch","La propuesta pertenece a otro propietario.");
    }
    const proposalValidation=proposals().validateRecord(proposalRecord,normalizedOwner);
    if(!proposalValidation.valid){
      return incident("invalid_proposal_record","El registro de propuesta no es válido.",{
        errors:proposalValidation.errors
      });
    }
    if(proposalRecord.lifecycle.status!=="pending_review"){
      return incident("proposal_not_pending","La propuesta ya no está pendiente de revisión.");
    }
    if(proposalRecord.comparison?.stale){
      return incident("proposal_stale","La propuesta está desactualizada.");
    }
    const currentHash=routineHash(currentRoutine);
    if(proposalRecord.baseline.routineHash!==currentHash){
      return incident("baseline_mismatch","La rutina actual ya no coincide con la base de la propuesta.",{
        expected:proposalRecord.baseline.routineHash,actual:currentHash
      });
    }
    if(proposalRecord.activationCompatibility?.compatible!==true){
      return incident("activation_incompatible","La propuesta no es compatible con el runtime A/B/C.");
    }
    const blockers=proposalBlockers(proposalRecord.proposal);
    if(blockers.length){
      return incident("proposal_requires_review","La propuesta contiene incidencias sin resolver.",{blockers});
    }
    const sessionErrors=validateProposalSessions(proposalRecord.proposal);
    if(sessionErrors.length){
      return incident("invalid_proposal_sessions","Las sesiones de la propuesta no pueden activarse.",{
        errors:sessionErrors
      });
    }
    return {ok:true,ownerId:normalizedOwner,currentHash};
  }
  function createActivationPlan({
    ownerId,proposalRecord,currentRoutine,selectedSession,drafts,
    rawBaseline={},confirmed=false,timestamp
  }={}){
    const validation=validateActivationRequest({
      ownerId,proposalRecord,currentRoutine,confirmed
    });
    if(!validation.ok) return validation;
    const effectiveTimestamp=text(timestamp);
    if(!validTimestamp(effectiveTimestamp)){
      return incident("invalid_timestamp","La activación necesita un timestamp válido.");
    }
    const mapped=mapProposalToRoutine(proposalRecord.proposal);
    const mappedErrors=validateProposalSessions({
      sessions:Object.entries(mapped.routine).filter(([,items])=>items.length).map(([key,items])=>({
        id:key,exercises:items
      }))
    });
    if(mappedErrors.length){
      return incident("invalid_mapped_routine","La rutina A/B/C resultante no es válida.",{errors:mappedErrors});
    }
    const id=activationId(
      validation.ownerId,proposalRecord.proposal.proposalId,effectiveTimestamp
    );
    const record={
      modelVersion:MODEL_VERSION,
      activationId:id,
      ownerId:validation.ownerId,
      proposalId:proposalRecord.proposal.proposalId,
      status:"activated",
      createdAt:effectiveTimestamp,
      activatedAt:effectiveTimestamp,
      rolledBackAt:null,
      baseline:{
        routine:parseRawJson(rawBaseline.routine,currentRoutine),
        routineRaw:rawBaseline.routine??null,
        routineHash:validation.currentHash,
        selectedSession:text(selectedSession)||null,
        selectedSessionRaw:rawBaseline.selectedSession??null,
        drafts:clone(drafts||{A:null,B:null,C:null}),
        draftsRaw:clone(rawBaseline.drafts||{A:null,B:null,C:null}),
        proposal:clone(proposalRecord.proposal)
      },
      activated:{
        routine:clone(mapped.routine),
        routineHash:routineHash(mapped.routine),
        sessionMapping:clone(mapped.sessionMapping)
      },
      rollback:{
        available:true,
        blockedReason:null,
        restoredRoutineHash:null
      }
    };
    return {ok:true,record,routine:clone(mapped.routine),selectedSession:"A"};
  }
  function validateRecord(record,ownerId){
    const errors=[];
    let normalizedOwner;
    try{normalizedOwner=normalizeOwnerId(ownerId);}
    catch(_){return {valid:false,errors:["invalid_owner"]};}
    if(record?.ownerId!==normalizedOwner) errors.push("owner_mismatch");
    if(!text(record?.activationId)) errors.push("activation_id_required");
    if(!text(record?.proposalId)) errors.push("proposal_id_required");
    if(!ALLOWED_STATUSES.includes(record?.status)) errors.push("invalid_status");
    if(!validTimestamp(record?.createdAt)||!validTimestamp(record?.activatedAt)){
      errors.push("invalid_timestamp");
    }
    if(!text(record?.baseline?.routineHash)) errors.push("baseline_hash_required");
    if(!text(record?.activated?.routineHash)) errors.push("activated_hash_required");
    if(record?.status==="activated"&&record?.rollback?.available!==true){
      errors.push("activated_must_be_reversible");
    }
    return {valid:errors.length===0,errors};
  }
  function recordOrder(a,b){
    return text(b.activatedAt).localeCompare(text(a.activatedAt),"en")||
      text(a.activationId).localeCompare(text(b.activationId),"en");
  }
  function removalOrder(a,b){
    const priority={rolled_back:0,rollback_blocked:1,activated:2};
    return (priority[a.status]??3)-(priority[b.status]??3)||
      text(a.activatedAt).localeCompare(text(b.activatedAt),"en")||
      text(a.activationId).localeCompare(text(b.activationId),"en");
  }
  function structuralIdentity(record){
    return {
      activationId:text(record?.activationId),
      ownerId:text(record?.ownerId),
      proposalId:text(record?.proposalId),
      activatedAt:text(record?.activatedAt),
      baseline:clone(record?.baseline),
      activated:{
        routine:clone(record?.activated?.routine),
        routineHash:text(record?.activated?.routineHash),
        sessionMapping:clone(record?.activated?.sessionMapping)
      }
    };
  }
  function lifecycleRank(record){
    return ({activated:0,rollback_blocked:1,rolled_back:2})[record?.status]??-1;
  }
  function lifecycleMoment(record){
    if(record?.status==="rolled_back") return text(record.rolledBackAt);
    if(record?.status==="rollback_blocked") return text(record.rollbackBlockedAt);
    return text(record?.activatedAt);
  }
  function preferLifecycle(existing,incoming){
    const existingRank=lifecycleRank(existing),incomingRank=lifecycleRank(incoming);
    if(incomingRank!==existingRank) return incomingRank>existingRank?incoming:existing;
    return lifecycleMoment(incoming)>lifecycleMoment(existing)?incoming:existing;
  }
  function selectActiveActivationId(records,ownerId,preferredId=null){
    const normalizedOwner=normalizeOwnerId(ownerId);
    const reversible=list(records).filter(record=>
      validateRecord(record,normalizedOwner).valid&&
      record.status==="activated"&&record.rollback.available===true
    ).sort(recordOrder);
    const preferred=text(preferredId);
    if(preferred&&reversible.some(record=>record.activationId===preferred)) return preferred;
    return reversible[0]?.activationId||null;
  }
  function trimRecords(records,ownerId,activeActivationId=null){
    const normalizedOwner=normalizeOwnerId(ownerId);
    const next=list(records).filter(record=>validateRecord(record,normalizedOwner).valid);
    const protectedId=selectActiveActivationId(next,normalizedOwner,activeActivationId);
    while(next.length>MAX_ACTIVATIONS_PER_OWNER){
      const removable=next.filter(record=>record.activationId!==protectedId).sort(removalOrder);
      if(!removable.length) break;
      const target=removable[0];
      next.splice(next.findIndex(record=>record.activationId===target.activationId),1);
    }
    return next.sort(recordOrder);
  }
  function normalizeRecords(records,ownerId,options={}){
    const normalizedOwner=normalizeOwnerId(ownerId);
    const byId=new Map();
    list(records).map(clone).sort((a,b)=>
      text(a?.activationId).localeCompare(text(b?.activationId),"en")||
      stableStringify(a).localeCompare(stableStringify(b),"en")
    ).forEach(record=>{
      if(!validateRecord(record,normalizedOwner).valid) return;
      const existing=byId.get(record.activationId);
      if(!existing) byId.set(record.activationId,record);
      else if(same(structuralIdentity(existing),structuralIdentity(record))){
        byId.set(record.activationId,preferLifecycle(existing,record));
      }
    });
    return trimRecords([...byId.values()],normalizedOwner,options.activeActivationId);
  }
  function mergeActivationRecords(current,incoming,{ownerId,activeActivationId=null}={}){
    const normalizedOwner=normalizeOwnerId(ownerId);
    const base=normalizeRecords(current,normalizedOwner,{activeActivationId});
    const byId=new Map(base.map(record=>[record.activationId,record]));
    const incidents=[];
    list(incoming).forEach(raw=>{
      const record=clone(raw);
      const id=text(record?.activationId);
      const existing=byId.get(id);
      if(existing&&!same(structuralIdentity(existing),structuralIdentity(record))){
        incidents.push({code:"activation_id_conflict",activationId:id});
        return;
      }
      const validation=validateRecord(record,normalizedOwner);
      if(!validation.valid){
        incidents.push({
          code:"invalid_or_foreign_activation",
          activationId:text(record?.activationId)||null,
          errors:validation.errors
        });
        return;
      }
      if(!existing){byId.set(record.activationId,record);return;}
      byId.set(record.activationId,preferLifecycle(existing,record));
    });
    const records=trimRecords([...byId.values()],normalizedOwner,activeActivationId);
    return {
      records,incidents,
      activeActivationId:selectActiveActivationId(records,normalizedOwner,activeActivationId)
    };
  }
  function addActivationRecord(records,record,{ownerId,activeActivationId=null}={}){
    const normalizedOwner=normalizeOwnerId(ownerId);
    const current=normalizeRecords(records,normalizedOwner,{activeActivationId});
    const existing=current.find(item=>item.proposalId===record?.proposalId&&item.status==="activated");
    if(existing){
      return {
        records:current,record:clone(existing),created:false,
        activeActivationId:selectActiveActivationId(current,normalizedOwner,existing.activationId)
      };
    }
    if(!validateRecord(record,normalizedOwner).valid) throw new Error("invalid_activation_record");
    const next=normalizeRecords([record,...current],normalizedOwner,{
      activeActivationId:record.activationId
    });
    return {
      records:next,record:clone(record),created:true,
      activeActivationId:selectActiveActivationId(next,normalizedOwner,record.activationId)
    };
  }
  function rollbackDecision({ownerId,activationRecord,currentRoutine}={}){
    let normalizedOwner;
    try{normalizedOwner=normalizeOwnerId(ownerId);}
    catch(_){return incident("invalid_owner","El propietario no es válido.");}
    if(!activationRecord) return incident("activation_not_found","La activación no existe.");
    const validation=validateRecord(activationRecord,normalizedOwner);
    if(!validation.valid){
      return incident("invalid_activation","La activación no es válida.",{errors:validation.errors});
    }
    if(activationRecord.status==="rolled_back"){
      return {ok:true,idempotent:true,record:clone(activationRecord)};
    }
    if(activationRecord.status!=="activated"){
      return incident("rollback_not_available","La activación no se puede revertir.");
    }
    if(!activationRecord.baseline||activationRecord.baseline.routineRaw===undefined){
      return incident("snapshot_missing","No existe una copia completa para revertir.");
    }
    const currentHash=routineHash(currentRoutine);
    if(currentHash!==activationRecord.activated.routineHash){
      return incident("routine_changed","La rutina actual cambió después de la activación.",{
        currentHash,expectedHash:activationRecord.activated.routineHash
      });
    }
    return {ok:true,idempotent:false,currentHash};
  }
  function markRollbackBlocked(record,reason,timestamp){
    return {
      ...clone(record),
      status:"rollback_blocked",
      rollback:{
        ...clone(record.rollback),available:false,
        blockedReason:text(reason)||"routine_changed",restoredRoutineHash:null
      },
      rollbackBlockedAt:timestamp
    };
  }
  function markRolledBack(record,timestamp){
    return {
      ...clone(record),
      status:"rolled_back",
      rolledBackAt:timestamp,
      rollback:{
        ...clone(record.rollback),available:false,blockedReason:null,
        restoredRoutineHash:record.baseline.routineHash
      }
    };
  }
  function updateRecord(records,nextRecord,{ownerId,activeActivationId=null}={}){
    const normalizedOwner=normalizeOwnerId(ownerId);
    let found=false;
    const next=normalizeRecords(records,normalizedOwner,{activeActivationId}).map(record=>{
      if(record.activationId!==nextRecord.activationId) return record;
      found=true;
      return clone(nextRecord);
    });
    if(!found) throw new Error("activation_not_found");
    const normalized=normalizeRecords(next,normalizedOwner,{activeActivationId});
    return {
      records:normalized,
      activeActivationId:selectActiveActivationId(normalized,normalizedOwner,activeActivationId)
    };
  }
  function executeTransaction(adapter,steps){
    if(!adapter||typeof adapter.capture!=="function"||typeof adapter.restore!=="function"){
      throw new Error("transaction_adapter_required");
    }
    const snapshot=adapter.capture();
    try{
      steps.forEach(step=>step());
      return {ok:true,snapshot};
    }catch(error){
      try{adapter.restore(snapshot);}
      catch(restoreError){
        return incident("transaction_restore_failed","No se pudo restaurar el estado previo.",{
          error:text(error?.message),restoreError:text(restoreError?.message)
        });
      }
      return incident("transaction_failed","La operación falló y se restauró el estado previo.",{
        error:text(error?.message)
      });
    }
  }

  global.GymOSRoutineActivation=Object.freeze({
    MODEL_VERSION,MAX_ACTIVATIONS_PER_OWNER,ALLOWED_STATUSES,
    stableStringify,validateProposalSessions,validateActivationRequest,
    mapProposalToRoutine,createActivationPlan,validateRecord,
    structuralIdentity,
    normalizeRecords,selectActiveActivationId,trimRecords,mergeActivationRecords,
    addActivationRecord,rollbackDecision,markRollbackBlocked,markRolledBack,
    updateRecord,executeTransaction
  });
})(typeof window!=="undefined"?window:globalThis);
