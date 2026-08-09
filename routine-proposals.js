(function(global){
  "use strict";

  const MODEL_VERSION="4.2.0-alpha.1-phase-c";
  const MAX_PROPOSALS_PER_OWNER=20;
  const ALLOWED_STATUSES=Object.freeze([
    "pending_review","rejected","superseded","activated","rolled_back"
  ]);

  function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
  function text(value){return String(value??"").trim();}
  function token(value){
    return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");
  }
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
    return `routine-${(hash>>>0).toString(36).padStart(7,"0")}`;
  }
  function normalizeOwnerId(ownerId){
    if(!global.GymOSProfileData?.normalizeOwnerId){
      throw new Error("GymOSProfileData is required.");
    }
    return global.GymOSProfileData.normalizeOwnerId(ownerId);
  }
  function list(value){return Array.isArray(value)?value:[];}
  function sessionId(session,index){return text(session?.id||session?.key)||`session-${index+1}`;}
  function exerciseId(exercise,index){
    return text(exercise?.exerciseId||exercise?.id)||`name:${token(exercise?.name)||`exercise_${index+1}`}`;
  }
  function exerciseModel(exercise,index){
    const prescription=exercise?.prescription||{};
    return {
      id:exerciseId(exercise,index),
      name:text(exercise?.name),
      pattern:text(exercise?.pattern||exercise?.movementPattern),
      role:text(exercise?.role||exercise?.function),
      order:index,
      sets:Number(prescription.sets??exercise?.sets)||0,
      target:clone(prescription.target??exercise?.target??exercise?.reps??null),
      targetRir:clone(prescription.targetRir??exercise?.targetRir??exercise?.rir??null),
      restSeconds:Number(prescription.restSeconds??exercise?.restSeconds)||0,
      notes:text(exercise?.notes)||text(prescription.notes)
    };
  }
  function routineSessions(routine){
    if(Array.isArray(routine?.sessions)){
      return routine.sessions.map((session,index)=>({
        id:sessionId(session,index),
        name:text(session.name||session.label),
        focus:text(session.focus),
        durationMinutes:Number(session.estimatedDurationMinutes??session.estimatedDurationMin)||null,
        notes:text(session.notes),
        order:Number(session.order)||index+1,
        exercises:list(session.exercises).map(exerciseModel)
      }));
    }
    if(routine&&typeof routine==="object"){
      return Object.keys(routine).sort().map((key,index)=>({
        id:key,name:`Sesión ${key}`,focus:"",durationMinutes:null,notes:"",order:index+1,
        exercises:list(routine[key]).map(exerciseModel)
      }));
    }
    return [];
  }
  function proposalSessions(proposal){
    return list(proposal?.sessions).map((session,index)=>({
      id:sessionId(session,index),
      name:text(session.name||session.label),
      focus:text(session.focus),
      durationMinutes:Number(session.estimatedDurationMinutes??session.estimatedDurationMin)||null,
      notes:text(session.notes),
      order:Number(session.order)||index+1,
      exercises:list(session.exercises).map(exerciseModel)
    }));
  }
  function routineHash(routine){return stableHash(routineSessions(routine));}
  function same(a,b){return stableStringify(a)===stableStringify(b);}
  function change(type,sessionIdValue,exerciseIdValue,before,after,message){
    return {
      type,sessionId:sessionIdValue||null,exerciseId:exerciseIdValue||null,
      before:clone(before),after:clone(after),message
    };
  }
  function compareExerciseFields(before,after,sessionIdValue,changes){
    const fields=[
      ["name","exercise_name_changed","nombre"],
      ["sets","sets_changed","series"],
      ["target","target_changed","repeticiones o duración"],
      ["targetRir","rir_changed","RIR"],
      ["restSeconds","rest_changed","descanso"],
      ["notes","notes_changed","notas"],
      ["pattern","pattern_changed","patrón o función"],
      ["role","function_changed","función"]
    ];
    fields.forEach(([field,type,label])=>{
      if(!same(before[field],after[field])){
        changes.push(change(
          type,sessionIdValue,after.id,before[field],after[field],
          `${after.name||before.name}: cambia ${label}.`
        ));
      }
    });
    if(before.order!==after.order){
      changes.push(change(
        "exercise_order_changed",sessionIdValue,after.id,before.order,after.order,
        `${after.name||before.name}: cambia de posición en la sesión.`
      ));
    }
  }
  function compareSessionExercises(beforeSession,afterSession,changes){
    const beforeById=new Map(beforeSession.exercises.map(item=>[item.id,item]));
    const afterById=new Map(afterSession.exercises.map(item=>[item.id,item]));
    const shared=[...beforeById.keys()].filter(id=>afterById.has(id)).sort();
    shared.forEach(id=>compareExerciseFields(
      beforeById.get(id),afterById.get(id),afterSession.id,changes
    ));
    const removed=beforeSession.exercises.filter(item=>!afterById.has(item.id));
    const added=afterSession.exercises.filter(item=>!beforeById.has(item.id));
    const paired=Math.min(removed.length,added.length);
    for(let index=0;index<paired;index+=1){
      const before=removed[index],after=added[index];
      changes.push(change(
        "exercise_substituted",afterSession.id,after.id,before,after,
        `${before.name||before.id} se sustituye por ${after.name||after.id}.`
      ));
    }
    removed.slice(paired).forEach(item=>changes.push(change(
      "exercise_removed",afterSession.id,item.id,item,null,
      `${item.name||item.id} se elimina de la sesión.`
    )));
    added.slice(paired).forEach(item=>changes.push(change(
      "exercise_added",afterSession.id,item.id,null,item,
      `${item.name||item.id} se añade a la sesión.`
    )));
  }
  function changeOrder(a,b){
    return a.type.localeCompare(b.type,"en")||
      text(a.sessionId).localeCompare(text(b.sessionId),"en")||
      text(a.exerciseId).localeCompare(text(b.exerciseId),"en");
  }
  function compareRoutineProposal(currentRoutine,proposal,options={}){
    const current=routineSessions(currentRoutine);
    const proposed=proposalSessions(proposal);
    const currentHash=stableHash(current);
    const baselineHash=text(options.baselineHash)||currentHash;
    const currentById=new Map(current.map(item=>[item.id,item]));
    const proposedById=new Map(proposed.map(item=>[item.id,item]));
    const changes=[];

    current.filter(session=>!proposedById.has(session.id)).forEach(session=>{
      changes.push(change(
        "session_removed",session.id,null,session,null,
        `${session.name||session.id} se elimina de la propuesta.`
      ));
    });
    proposed.filter(session=>!currentById.has(session.id)).forEach(session=>{
      changes.push(change(
        "session_added",session.id,null,null,session,
        `${session.name||session.id} se añade a la propuesta.`
      ));
    });
    [...currentById.keys()].filter(id=>proposedById.has(id)).sort().forEach(id=>{
      const before=currentById.get(id),after=proposedById.get(id);
      if(before.name!==after.name){
        changes.push(change("session_name_changed",id,null,before.name,after.name,"Cambia el nombre de la sesión."));
      }
      if(before.focus!==after.focus){
        changes.push(change("session_focus_changed",id,null,before.focus,after.focus,"Cambia el enfoque de la sesión."));
      }
      if(before.durationMinutes!==after.durationMinutes){
        changes.push(change("session_duration_changed",id,null,before.durationMinutes,after.durationMinutes,"Cambia la duración estimada de la sesión."));
      }
      if(before.notes!==after.notes){
        changes.push(change("session_notes_changed",id,null,before.notes,after.notes,"Cambian las notas de la sesión."));
      }
      if(before.order!==after.order){
        changes.push(change("session_order_changed",id,null,before.order,after.order,"Cambia el orden semanal de la sesión."));
      }
      compareSessionExercises(before,after,changes);
    });
    changes.sort(changeOrder);
    const counts={};
    changes.forEach(item=>{counts[item.type]=(counts[item.type]||0)+1;});
    return {
      generatedAt:options.timestamp||proposal?.generatedAt||null,
      routineHash:currentHash,
      baselineHash,
      stale:currentHash!==baselineHash,
      summary:{
        totalChanges:changes.length,
        sessionsAdded:counts.session_added||0,
        sessionsRemoved:counts.session_removed||0,
        exercisesAdded:counts.exercise_added||0,
        exercisesRemoved:counts.exercise_removed||0,
        exercisesSubstituted:counts.exercise_substituted||0,
        orderChanges:(counts.exercise_order_changed||0)+(counts.session_order_changed||0),
        prescriptionChanges:(counts.sets_changed||0)+(counts.target_changed||0)+
          (counts.rir_changed||0)+(counts.rest_changed||0),
        byType:counts
      },
      changes
    };
  }
  function activationCompatibility(proposal){
    const count=list(proposal?.sessions).length;
    const reasons=[];
    if(count<2) reasons.push("La propuesta necesita al menos dos sesiones.");
    if(count>6) reasons.push("La propuesta no puede superar seis sesiones.");
    return {compatible:reasons.length===0,reasons,sessionCount:count};
  }
  function validateProposal(proposal){
    const errors=[];
    if(!proposal||typeof proposal!=="object") return {valid:false,errors:["proposal_required"]};
    if(!text(proposal.proposalId)) errors.push("proposal_id_required");
    if(!text(proposal.generatedAt)) errors.push("generated_at_required");
    if(!Array.isArray(proposal.sessions)||!proposal.sessions.length) errors.push("sessions_required");
    const sessionIds=list(proposal.sessions).map(session=>text(session?.id)).filter(Boolean);
    if(new Set(sessionIds).size!==sessionIds.length) errors.push("duplicate_session_ids");
    list(proposal.sessions).forEach((session,index)=>{
      const ids=list(session?.exercises).map((exercise,exerciseIndex)=>exerciseId(exercise,exerciseIndex));
      if(new Set(ids).size!==ids.length) errors.push(`duplicate_exercise_ids:${sessionId(session,index)}`);
    });
    if(["approved","activated","rolled_back"].includes(proposal.status)) errors.push("unsupported_activation_status");
    return {valid:errors.length===0,errors};
  }
  function createCandidateProposal({
    type,source=null,sessions,generatedAt,baselineHash="",summary=null,
    warnings=[],unresolvedQuestions=[],rationale=[]
  }={}){
    const allowedTypes=["manual","import","imported","reconfigure","restore","generated"];
    const normalizedType=token(type);
    if(!allowedTypes.includes(normalizedType)) throw new Error("invalid_proposal_type");
    const timestamp=text(generatedAt);
    if(!timestamp||Number.isNaN(Date.parse(timestamp))) throw new Error("invalid_timestamp");
    const immutableSessions=clone(list(sessions));
    const proposalId=`proposal-${normalizedType}-${stableHash({
      type:normalizedType,baselineHash:text(baselineHash),sessions:immutableSessions
    }).replace(/^routine-/,"")}`;
    const proposal={
      version:MODEL_VERSION,
      proposalId,
      type:normalizedType==="imported"?"import":normalizedType,
      status:"pending",
      generatedAt:timestamp,
      source:clone(source||{type:normalizedType}),
      summary:clone(summary),
      inputSummary:{source:normalizedType,days:immutableSessions.length},
      rationale:list(rationale).map(text).filter(Boolean),
      warnings:list(warnings).map(text).filter(Boolean),
      unresolvedQuestions:list(unresolvedQuestions).map(text).filter(Boolean),
      reviewRequired:list(unresolvedQuestions).length>0,
      sessions:immutableSessions,
      selectedExercises:immutableSessions.flatMap(session=>
        list(session?.exercises).map(exercise=>text(exercise?.exerciseId||exercise?.id)).filter(Boolean)
      ),
      coverage:{
        requiredPatterns:[],coveredPatterns:[],missingPatterns:[],balanced:true
      },
      activationCompatibility:activationCompatibility({sessions:immutableSessions}),
      validation:{valid:true,results:[]}
    };
    const validation=validateProposal(proposal);
    if(!validation.valid) throw new Error(`Invalid proposal: ${validation.errors.join(",")}`);
    return proposal;
  }
  function validateRecord(record,ownerId){
    const errors=[];
    const normalizedOwner=normalizeOwnerId(ownerId);
    if(record?.ownerId!==normalizedOwner) errors.push("owner_mismatch");
    errors.push(...validateProposal(record?.proposal).errors);
    if(!ALLOWED_STATUSES.includes(record?.lifecycle?.status)) errors.push("invalid_lifecycle_status");
    if(!text(record?.baseline?.routineHash)) errors.push("baseline_hash_required");
    return {valid:errors.length===0,errors};
  }
  function createProposalRecord({ownerId,proposal,currentRoutine,timestamp}){
    const normalizedOwner=normalizeOwnerId(ownerId);
    const validation=validateProposal(proposal);
    if(!validation.valid) throw new Error(`Invalid proposal: ${validation.errors.join(",")}`);
    const createdAt=timestamp||proposal.generatedAt;
    const baselineHash=routineHash(currentRoutine);
    const immutableProposal=clone(proposal);
    const comparison=compareRoutineProposal(currentRoutine,immutableProposal,{
      baselineHash,timestamp:createdAt
    });
    return {
      modelVersion:MODEL_VERSION,
      ownerId:normalizedOwner,
      proposal:immutableProposal,
      lifecycle:{
        status:"pending_review",createdAt,updatedAt:createdAt,
        reviewedAt:null,rejectedAt:null,supersededAt:null,rejectionReason:null
      },
      baseline:{routineHash:baselineHash,routineCapturedAt:createdAt},
      comparison,
      activationCompatibility:activationCompatibility(immutableProposal)
    };
  }
  function recordOrder(a,b){
    return text(b.lifecycle?.createdAt).localeCompare(text(a.lifecycle?.createdAt),"en")||
      text(a.proposal?.proposalId).localeCompare(text(b.proposal?.proposalId),"en");
  }
  function removalOrder(a,b){
    const priority={rejected:0,superseded:1,rolled_back:2,activated:3,pending_review:4};
    return (priority[a.lifecycle.status]??3)-(priority[b.lifecycle.status]??3)||
      text(a.lifecycle.createdAt).localeCompare(text(b.lifecycle.createdAt),"en")||
      text(a.proposal.proposalId).localeCompare(text(b.proposal.proposalId),"en");
  }
  function selectActiveProposalId(records,ownerId,preferredId=null){
    const normalizedOwner=normalizeOwnerId(ownerId);
    const pending=list(records).filter(record=>
      validateRecord(record,normalizedOwner).valid&&record.lifecycle.status==="pending_review"
    ).sort(recordOrder);
    const preferred=text(preferredId);
    if(preferred&&pending.some(record=>record.proposal.proposalId===preferred)) return preferred;
    return pending[0]?.proposal?.proposalId||null;
  }
  function trimRecords(records,ownerId,activeProposalId=null){
    const normalizedOwner=normalizeOwnerId(ownerId);
    const next=list(records).filter(record=>validateRecord(record,normalizedOwner).valid);
    const protectedId=selectActiveProposalId(next,normalizedOwner,activeProposalId);
    while(next.length>MAX_PROPOSALS_PER_OWNER){
      const removable=next.filter(record=>!(
        record.proposal.proposalId===protectedId&&record.lifecycle.status==="pending_review"
      )).sort(removalOrder);
      const target=removable[0];
      if(!target) break;
      const index=next.findIndex(record=>record.proposal.proposalId===target.proposal.proposalId);
      next.splice(index,1);
    }
    return next.sort(recordOrder);
  }
  function normalizeRecords(records,ownerId,options={}){
    const normalizedOwner=normalizeOwnerId(ownerId);
    const byId=new Map();
    list(records).map(clone).sort((a,b)=>
      text(a?.proposal?.proposalId).localeCompare(text(b?.proposal?.proposalId),"en")||
      stableStringify(a?.proposal).localeCompare(stableStringify(b?.proposal),"en")||
      stableStringify(a).localeCompare(stableStringify(b),"en")
    ).forEach(record=>{
      if(!validateRecord(record,normalizedOwner).valid) return;
      const id=record.proposal.proposalId;
      const existing=byId.get(id);
      if(!existing){
        byId.set(id,record);
        return;
      }
      if(same(existing.proposal,record.proposal)&&
        text(record.lifecycle.updatedAt)>text(existing.lifecycle.updatedAt)){
        byId.set(id,record);
      }
    });
    return trimRecords([...byId.values()],normalizedOwner,options.activeProposalId);
  }
  function storeProposal(records,{ownerId,proposal,currentRoutine,timestamp,supersedePrevious=false,activeProposalId=null}){
    const normalizedOwner=normalizeOwnerId(ownerId);
    const effectiveTimestamp=timestamp||proposal?.generatedAt;
    const current=normalizeRecords(records,normalizedOwner,{activeProposalId});
    const duplicate=current.find(
      record=>record.proposal.proposalId===proposal?.proposalId
    );

    if(duplicate){
      const existingFingerprint=text(
        duplicate.proposal?.source?.importFingerprint
      );
      const incomingFingerprint=text(
        proposal?.source?.importFingerprint
      );

      const sameImportedRoutine=
        duplicate.proposal?.type==="imported" &&
        proposal?.type==="imported" &&
        existingFingerprint &&
        existingFingerprint===incomingFingerprint;

      if(!same(duplicate.proposal,proposal) && !sameImportedRoutine){
        throw new Error("proposal_id_conflict");
      }

      return {
        records:current,
        record:clone(duplicate),
        activeProposalId:selectActiveProposalId(
          current,
          normalizedOwner,
          activeProposalId
        ),
        created:false,
        incidents:[]
      };
    }
    const existingPending=current.find(record=>record.lifecycle.status==="pending_review");
    if(existingPending&&!supersedePrevious){
      return {
        records:current,record:null,
        activeProposalId:selectActiveProposalId(current,normalizedOwner,activeProposalId),
        created:false,requiresReplacementConfirmation:true,
        existingPending:clone(existingPending),incidents:[{code:"pending_proposal_exists"}]
      };
    }
    const nextRecord=createProposalRecord({
      ownerId:normalizedOwner,proposal,currentRoutine,timestamp:effectiveTimestamp
    });
    const updated=current.map(record=>{
      if(!supersedePrevious||record.lifecycle.status!=="pending_review") return record;
      return {
        ...record,
        lifecycle:{
          ...record.lifecycle,status:"superseded",updatedAt:effectiveTimestamp,
          reviewedAt:effectiveTimestamp,supersededAt:effectiveTimestamp
        }
      };
    });
    const next=normalizeRecords([nextRecord,...updated],normalizedOwner,{
      activeProposalId:nextRecord.proposal.proposalId
    });
    return {
      records:next,record:clone(nextRecord),
      activeProposalId:selectActiveProposalId(next,normalizedOwner,nextRecord.proposal.proposalId),
      created:true,incidents:[]
    };
  }
  function rejectProposal(records,{ownerId,proposalId,rejectionReason,timestamp}){
    const normalizedOwner=normalizeOwnerId(ownerId);
    let found=false;
    const next=normalizeRecords(records,normalizedOwner).map(record=>{
      if(record.proposal.proposalId!==proposalId) return record;
      found=true;
      return {
        ...record,
        lifecycle:{
          ...record,status:"rejected",updatedAt:timestamp,reviewedAt:timestamp,
          rejectedAt:timestamp,rejectionReason:text(rejectionReason).slice(0,500)||null
        }
      };
    });
    if(!found) throw new Error("Proposal not found.");
    return normalizeRecords(next,normalizedOwner);
  }
  function transitionProposalLifecycle(records,{ownerId,proposalId,status,timestamp}){
    const normalizedOwner=normalizeOwnerId(ownerId);
    if(!["activated","rolled_back"].includes(status)) throw new Error("Invalid lifecycle transition.");
    let found=false;
    const next=normalizeRecords(records,normalizedOwner).map(record=>{
      if(record.proposal.proposalId!==proposalId) return record;
      found=true;
      if(record.lifecycle.status===status) return record;
      if(status==="activated"&&record.lifecycle.status!=="pending_review"){
        throw new Error("proposal_not_pending");
      }
      if(status==="rolled_back"&&record.lifecycle.status!=="activated"){
        throw new Error("proposal_not_activated");
      }
      return {
        ...record,
        lifecycle:{
          ...record.lifecycle,status,updatedAt:timestamp,reviewedAt:timestamp,
          activatedAt:status==="activated"?timestamp:record.lifecycle.activatedAt||null,
          rolledBackAt:status==="rolled_back"?timestamp:record.lifecycle.rolledBackAt||null
        }
      };
    });
    if(!found) throw new Error("Proposal not found.");
    return normalizeRecords(next,normalizedOwner);
  }
  function mergeProposalRecords(current,incoming,{ownerId,activeProposalId=null}){
    const normalizedOwner=normalizeOwnerId(ownerId);
    const base=normalizeRecords(current,normalizedOwner,{activeProposalId});
    const byId=new Map(base.map(record=>[record.proposal.proposalId,record]));
    const incidents=[];
    list(incoming).forEach(raw=>{
      const record=clone(raw);
      const validation=validateRecord(record,normalizedOwner);
      if(!validation.valid){
        incidents.push({
          code:"invalid_or_foreign_record",
          proposalId:text(record?.proposal?.proposalId)||null,
          errors:validation.errors
        });
        return;
      }
      const id=record.proposal.proposalId;
      const existing=byId.get(id);
      if(!existing){
        byId.set(id,record);
        return;
      }
      if(!same(existing.proposal,record.proposal)){
        incidents.push({code:"proposal_id_conflict",proposalId:id});
        return;
      }
      if(text(record.lifecycle.updatedAt)>text(existing.lifecycle.updatedAt)){
        byId.set(id,{
          ...record,
          proposal:clone(existing.proposal),
          baseline:clone(existing.baseline),
          comparison:record.comparison?.baselineHash===existing.baseline.routineHash
            ?clone(record.comparison)
            :clone(existing.comparison)
        });
      }
    });
    const records=trimRecords([...byId.values()],normalizedOwner,activeProposalId);
    return {
      records,
      incidents,
      activeProposalId:selectActiveProposalId(records,normalizedOwner,activeProposalId)
    };
  }
  function refreshProposalComparisons(records,{ownerId,currentRoutine,timestamp}){
    const normalizedOwner=normalizeOwnerId(ownerId);
    return normalizeRecords(records,normalizedOwner).map(record=>({
      ...record,
      comparison:compareRoutineProposal(currentRoutine,record.proposal,{
        baselineHash:record.baseline.routineHash,
        timestamp:timestamp||record.comparison.generatedAt
      })
    }));
  }

  global.GymOSRoutineProposals=Object.freeze({
    MODEL_VERSION,MAX_PROPOSALS_PER_OWNER,ALLOWED_STATUSES,
    stableStringify,stableHash,routineHash,validateProposal,validateRecord,
    compareRoutineProposal,activationCompatibility,createCandidateProposal,createProposalRecord,
    normalizeRecords,selectActiveProposalId,trimRecords,storeProposal,rejectProposal,
    transitionProposalLifecycle,mergeProposalRecords,
    refreshProposalComparisons
  });
})(typeof window!=="undefined"?window:globalThis);
