(function(global){
  "use strict";

  const RUNTIME_VERSION="4.2.0-phase-h3";

  function model(){
    if(!global.GymOSRoutineSessionModel) throw new Error("GymOSRoutineSessionModel is required.");
    return global.GymOSRoutineSessionModel;
  }
  function migration(){
    if(!global.GymOSRoutineSessionMigration) throw new Error("GymOSRoutineSessionMigration is required.");
    return global.GymOSRoutineSessionMigration;
  }
  function clone(value){
    return value===undefined?undefined:JSON.parse(JSON.stringify(value));
  }
  function text(value){return String(value??"").trim();}
  function list(value){return Array.isArray(value)?value:[];}
  function normalizeOwnerId(value){return migration().normalizeOwnerId(value);}
  function orderedSessions(routine){
    if(!routine) return [];
    return model().sortSessions(model().normalizeCanonicalRoutine(routine).sessions);
  }
  function sessionById(routine,sessionId){
    const id=text(sessionId);
    return orderedSessions(routine).find(session=>session.sessionId===id)||null;
  }
  function sessionByLegacyKey(routine,legacySessionKey){
    const key=text(legacySessionKey);
    return orderedSessions(routine).find(session=>session.legacySessionKey===key)||null;
  }
  function displayName(session,index=0){
    const explicit=text(session?.name);
    if(explicit) return explicit;
    const label=text(session?.label||session?.legacySessionKey);
    return label?`Sesión ${label}`:`Sesión ${index+1}`;
  }
  function displayLabel(session,index=0){
    return text(session?.label||session?.legacySessionKey)||String(index+1);
  }
  function historySessionId(workout,routine){
    const explicit=text(workout?.sessionId);
    if(explicit&&sessionById(routine,explicit)) return explicit;
    const legacy=text(workout?.legacySessionKey||workout?.sessionKey||workout?.session);
    return sessionByLegacyKey(routine,legacy)?.sessionId||null;
  }
  function historyMatchesSession(workout,routine,sessionId){
    const session=sessionById(routine,sessionId);
    if(!session) return false;
    if(text(workout?.sessionId)) return text(workout.sessionId)===session.sessionId;
    const legacy=text(workout?.legacySessionKey||workout?.sessionKey||workout?.session);
    return Boolean(session.legacySessionKey&&legacy===session.legacySessionKey);
  }
  function selectedSessionId({
    routine,preferredSessionId=null,legacySelection=null,history=[]
  }={}){
    const sessions=orderedSessions(routine);
    if(!sessions.length) return null;
    const preferred=text(preferredSessionId);
    if(preferred&&sessions.some(session=>session.sessionId===preferred)) return preferred;
    const legacy=sessionByLegacyKey(routine,legacySelection);
    if(legacy) return legacy.sessionId;
    const latest=list(history).slice().sort((left,right)=>
      new Date(right?.date||0)-new Date(left?.date||0)||
      text(left?.id).localeCompare(text(right?.id),"en")
    ).find(workout=>historySessionId(workout,routine));
    const latestId=latest&&historySessionId(latest,routine);
    if(latestId){
      const index=sessions.findIndex(session=>session.sessionId===latestId);
      return sessions[(index+1)%sessions.length].sessionId;
    }
    return sessions[0].sessionId;
  }
  function nextSessionId(routine,currentSessionId){
    const sessions=orderedSessions(routine);
    if(!sessions.length) return null;
    const index=sessions.findIndex(session=>session.sessionId===text(currentSessionId));
    return sessions[(index<0?0:index+1)%sessions.length].sessionId;
  }
  function legacySelection(routine,sessionId){
    const sessions=orderedSessions(routine);
    const index=sessions.findIndex(session=>session.sessionId===text(sessionId));
    if(index<0) return null;
    return sessions[index].legacySessionKey||null;
  }
  function legacyShadow(routine){
    const normalized=model().normalizeCanonicalRoutine(routine);
    const shadow={A:[],B:[],C:[]};
    normalized.sessions.forEach(session=>{
      const key=session.legacySessionKey;
      if(["A","B","C"].includes(key)) shadow[key]=clone(session.exercises);
    });
    return shadow;
  }
  function lastWorkout(history,routine,sessionId){
    return list(history).find(workout=>historyMatchesSession(workout,routine,sessionId))||null;
  }
  function validTimestamp(value){
    if(value===null||value===undefined||value==="") return null;
    const numeric=Number(value);
    if(Number.isFinite(numeric)&&numeric>=0) return numeric;
    const parsed=typeof value==="string"?Date.parse(value):NaN;
    return Number.isFinite(parsed)&&parsed>=0?parsed:null;
  }
  function normalizeSessionTimer(timer,{
    ownerId,sessionId,legacyStartedAt=null
  }={}){
    const owner=normalizeOwnerId(ownerId);
    const session=text(sessionId);
    if(!session) throw new Error("session_id_required");
    const source=timer&&typeof timer==="object"?timer:{};
    if(source.ownerId&&normalizeOwnerId(source.ownerId)!==owner){
      throw new Error("session_timer_owner_mismatch");
    }
    if(source.sessionId&&text(source.sessionId)!==session){
      throw new Error("session_timer_session_mismatch");
    }
    const elapsedMs=Math.max(0,Number.isFinite(Number(source.elapsedMs))
      ?Math.round(Number(source.elapsedMs))
      :0);
    const legacyStart=validTimestamp(legacyStartedAt);
    let status=["idle","running","paused"].includes(source.status)
      ?source.status
      :(source.running===true?"running":source.running===false&&elapsedMs>0?"paused":"idle");
    let startedAt=validTimestamp(source.startedAt);
    if(!timer&&legacyStart!==null){
      status="running";
      startedAt=legacyStart;
    }
    if(status==="idle"&&elapsedMs>0) status="paused";
    if(status==="running"&&startedAt===null) status=elapsedMs>0?"paused":"idle";
    if(status!=="running") startedAt=null;
    return {
      ownerId:owner,
      sessionId:session,
      status,
      running:status==="running",
      elapsedMs,
      startedAt
    };
  }
  function sessionTimerElapsedMs(timer,now=Date.now()){
    const elapsed=Math.max(0,Number(timer?.elapsedMs)||0);
    const current=validTimestamp(now);
    const started=validTimestamp(timer?.startedAt);
    if(timer?.status!=="running"||started===null||current===null) return Math.round(elapsed);
    return Math.round(elapsed+Math.max(0,current-started));
  }
  function transitionSessionTimer(timer,action,{
    ownerId,sessionId,now=Date.now()
  }={}){
    const current=normalizeSessionTimer(timer,{ownerId,sessionId});
    const timestamp=validTimestamp(now);
    if(timestamp===null) throw new Error("invalid_timer_timestamp");
    if(action==="start"||action==="resume"){
      if(current.status==="running") return current;
      return {
        ...current,status:"running",running:true,startedAt:timestamp
      };
    }
    if(action==="pause"){
      if(current.status!=="running") return current;
      return {
        ...current,status:"paused",running:false,
        elapsedMs:sessionTimerElapsedMs(current,timestamp),startedAt:null
      };
    }
    if(action==="reset"){
      return {
        ...current,
        status:current.status,
        running:current.status==="running",
        elapsedMs:0,
        startedAt:current.status==="running"?timestamp:null
      };
    }
    throw new Error("invalid_timer_action");
  }
  function formatSessionTimer(elapsedMs){
    const totalSeconds=Math.max(0,Math.floor((Number(elapsedMs)||0)/1000));
    const seconds=String(totalSeconds%60).padStart(2,"0");
    const totalMinutes=Math.floor(totalSeconds/60);
    if(totalMinutes<60) return `${String(totalMinutes).padStart(2,"0")}:${seconds}`;
    const hours=String(Math.floor(totalMinutes/60)).padStart(2,"0");
    const minutes=String(totalMinutes%60).padStart(2,"0");
    return `${hours}:${minutes}:${seconds}`;
  }
  function validateDraftIdentity(draft,{ownerId,routine,sessionId}={}){
    const errors=[];
    let owner=null;
    try{owner=normalizeOwnerId(ownerId);}
    catch(_){errors.push("invalid_owner");}
    const session=sessionById(routine,sessionId);
    if(!session) errors.push("session_not_found");
    if(!draft||typeof draft!=="object") errors.push("invalid_draft");
    if(draft&&owner&&draft.ownerId!==owner) errors.push("owner_mismatch");
    if(draft&&routine&&draft.routineId!==routine.routineId) errors.push("routine_mismatch");
    if(draft&&session&&draft.sessionId!==session.sessionId) errors.push("session_mismatch");
    if(draft&&!text(draft.draftId)) errors.push("draft_id_required");
    return {valid:errors.length===0,errors};
  }
  function getDraft(container,{ownerId,routine,sessionId}={}){
    const draft=container?.draftsBySessionId?.[text(sessionId)];
    if(!draft) return null;
    const validation=validateDraftIdentity(draft,{ownerId,routine,sessionId});
    return validation.valid?clone(draft):null;
  }
  function upsertDraft(container,draft,{ownerId,routine}={}){
    const normalized=model().normalizeCanonicalRoutine(routine);
    const validation=validateDraftIdentity(draft,{
      ownerId,routine:normalized,sessionId:draft?.sessionId
    });
    if(!validation.valid){
      const error=new Error(`invalid_draft:${validation.errors.join(",")}`);
      error.code="invalid_draft";
      error.details=validation.errors;
      throw error;
    }
    const current=container
      ?clone(container)
      :migration().emptyDraftContainer(normalized.routineId);
    if(current.routineId!==normalized.routineId) throw new Error("draft_container_routine_mismatch");
    current.draftsBySessionId=current.draftsBySessionId||{};
    current.orphanedLegacyDrafts=current.orphanedLegacyDrafts||{};
    current.draftsBySessionId[draft.sessionId]=clone(draft);
    const containerValidation=migration().validateDraftContainer(current,{
      ownerId:normalizeOwnerId(ownerId),canonicalRoutine:normalized
    });
    if(!containerValidation.valid){
      throw new Error(`invalid_draft_container:${containerValidation.errors.join(",")}`);
    }
    return current;
  }
  function removeDraft(container,{ownerId,routine,sessionId}={}){
    const normalized=model().normalizeCanonicalRoutine(routine);
    const current=container
      ?clone(container)
      :migration().emptyDraftContainer(normalized.routineId);
    if(current.routineId!==normalized.routineId) throw new Error("draft_container_routine_mismatch");
    const id=text(sessionId);
    const existing=current.draftsBySessionId?.[id];
    if(existing&&existing.ownerId!==normalizeOwnerId(ownerId)) throw new Error("owner_mismatch");
    if(current.draftsBySessionId) delete current.draftsBySessionId[id];
    const validation=migration().validateDraftContainer(current,{
      ownerId:normalizeOwnerId(ownerId),canonicalRoutine:normalized
    });
    if(!validation.valid) throw new Error(`invalid_draft_container:${validation.errors.join(",")}`);
    return current;
  }
  function historyEntry({
    ownerId,routine,sessionId,draft,workoutId,date,durationMs,completedSeries,exercises
  }={}){
    const normalized=model().normalizeCanonicalRoutine(routine);
    const session=sessionById(normalized,sessionId);
    if(!session) throw new Error("session_not_found");
    const owner=normalizeOwnerId(ownerId);
    if(draft){
      const validation=validateDraftIdentity(draft,{
        ownerId:owner,routine:normalized,sessionId:session.sessionId
      });
      if(!validation.valid) throw new Error(`invalid_draft:${validation.errors.join(",")}`);
    }
    const index=orderedSessions(normalized).findIndex(item=>item.sessionId===session.sessionId);
    return {
      id:workoutId,
      ownerId:owner,
      routineId:normalized.routineId,
      sessionId:session.sessionId,
      sessionName:displayName(session,index),
      sessionLabel:displayLabel(session,index),
      ...(session.legacySessionKey?{
        legacySessionKey:session.legacySessionKey,
        session:session.legacySessionKey
      }:{session:displayLabel(session,index)}),
      date,
      durationMs,
      completedSeries,
      exercises:clone(exercises),
      sessionSnapshot:{
        sessionId:session.sessionId,
        name:displayName(session,index),
        label:displayLabel(session,index),
        focus:text(session.focus),
        order:session.order,
        legacySessionKey:session.legacySessionKey||null
      }
    };
  }

  global.GymOSRoutineSessionRuntime=Object.freeze({
    RUNTIME_VERSION,
    orderedSessions,sessionById,sessionByLegacyKey,displayName,displayLabel,
    historySessionId,historyMatchesSession,selectedSessionId,nextSessionId,
    legacySelection,legacyShadow,lastWorkout,validateDraftIdentity,getDraft,
    upsertDraft,removeDraft,historyEntry,normalizeSessionTimer,
    sessionTimerElapsedMs,transitionSessionTimer,formatSessionTimer
  });
})(typeof window!=="undefined"?window:globalThis);
