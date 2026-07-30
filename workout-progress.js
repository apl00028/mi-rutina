(function(global){
  "use strict";

  const VERSION="4.2.0-rc.3-workout-progress-1";
  const OWNER_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const TOKEN_PATTERN=/^[A-Za-z0-9._:-]{1,240}$/;
  const SET_FIELDS=[
    "weight","reps","rir","seconds","duration","distance","value","load","assistance",
    "technique","dropset","restPause","unilateral","warmup","done","completed",
    "planned","source","createdAt","ownerId","workoutInstanceId","exerciseInstanceId",
    "target","targetRir","restSeconds","type"
  ];
  const EXERCISE_FIELDS=[
    "exerciseId","id","name","target","increment","type","equipment","variant",
    "targetRir","restSeconds","recordTypes","substitution","notes","discomfort","completedAt"
  ];
  const ROOT_FIELDS=[
    "startedAt","sessionTimer","currentExerciseInstanceId","status","completedAt"
  ];
  const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  const list=value=>Array.isArray(value)?value:[];
  const text=value=>String(value??"").trim();
  const record=value=>Boolean(value&&typeof value==="object"&&!Array.isArray(value));
  const iso=value=>{
    const date=new Date(value);
    return Number.isFinite(date.getTime())?date.toISOString():null;
  };
  const stable=value=>{
    if(Array.isArray(value)) return value.map(stable);
    if(record(value)) return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
    return value;
  };
  const same=(left,right)=>JSON.stringify(stable(left))===JSON.stringify(stable(right));
  function hash(value){
    let output=2166136261;
    for(const character of String(value)){
      output^=character.charCodeAt(0);
      output=Math.imul(output,16777619);
    }
    return (output>>>0).toString(36);
  }
  function ownerId(value){
    const normalized=text(value);
    if(normalized==="local"||OWNER_PATTERN.test(normalized)) return normalized;
    throw new Error("invalid_owner");
  }
  function token(value,label){
    const normalized=text(value);
    if(!TOKEN_PATTERN.test(normalized)) throw new Error(`invalid_${label}`);
    return normalized;
  }
  function progressStorageKey(owner,workoutInstanceId){
    return `gymos:workoutProgress:${ownerId(owner)}:${token(workoutInstanceId,"workout_instance_id")}`;
  }
  function activeWorkoutStorageKey(owner,sessionId){
    return `gymos:activeWorkout:${ownerId(owner)}:${token(sessionId,"session_id")}`;
  }
  function migrationStorageKey(owner){
    return `gymos:workoutProgressMigration:${ownerId(owner)}`;
  }
  function deterministicId(prefix,...parts){
    return `${prefix}-${hash(parts.map(text).join("|"))}`;
  }
  function stamp(updatedAt,revision,clientInstanceId){
    return {
      updatedAt:iso(updatedAt)||new Date(0).toISOString(),
      revision:Math.max(1,Number(revision)||1),
      clientInstanceId:text(clientInstanceId)||"legacy"
    };
  }
  function normalizeMeta(meta,fallback){
    const source=record(meta)?meta:{};
    return stamp(source.updatedAt||fallback.updatedAt,source.revision||fallback.revision,source.clientInstanceId||fallback.clientInstanceId);
  }
  function normalizePointer(pointer,{owner,sessionId}={}){
    const source=record(pointer)?pointer:{workoutInstanceId:pointer};
    return {
      ownerId:ownerId(source.ownerId||owner),
      sessionId:token(source.sessionId||sessionId,"session_id"),
      workoutInstanceId:token(source.workoutInstanceId,"workout_instance_id"),
      ...stamp(source.updatedAt,source.revision,source.clientInstanceId)
    };
  }
  function selectActivePointer(currentPointer,candidatePointer,{localPending=false}={}){
    const candidate=normalizePointer(candidatePointer,{});
    if(!currentPointer) return {pointer:candidate,changed:true,conflict:null};
    const current=normalizePointer(currentPointer,{});
    if(current.ownerId!==candidate.ownerId) throw new Error("owner_mismatch");
    if(current.sessionId!==candidate.sessionId) throw new Error("session_mismatch");
    if(current.workoutInstanceId===candidate.workoutInstanceId){
      const selected=compareStamp(current,candidate)<0?candidate:current;
      return {pointer:selected,changed:!same(selected,current),conflict:null};
    }
    const conflict={
      code:"competing_workout_instances",
      ownerId:current.ownerId,
      sessionId:current.sessionId,
      workoutInstanceIds:[current.workoutInstanceId,candidate.workoutInstanceId].sort()
    };
    if(localPending) return {pointer:current,changed:false,conflict};
    const selected=compareStamp(current,candidate)<0?candidate:current;
    return {pointer:selected,changed:!same(selected,current),conflict};
  }
  function tombstone(value,{
    idField,owner,workoutInstanceId,exerciseInstanceId=null,fallback
  }){
    const source=record(value)?value:{[idField]:value};
    return {
      [idField]:token(source[idField],"tombstone_id"),
      ownerId:ownerId(source.ownerId||owner),
      workoutInstanceId:token(
        source.workoutInstanceId||workoutInstanceId,"workout_instance_id"
      ),
      ...(exerciseInstanceId?{
        exerciseInstanceId:token(
          source.exerciseInstanceId||exerciseInstanceId,"exercise_instance_id"
        )
      }:{}),
      ...normalizeMeta(source,fallback)
    };
  }
  function mergeTombstones(left,right,idField){
    const output=new Map();
    [...list(left),...list(right)].forEach(item=>{
      const id=item[idField];
      const current=output.get(id);
      if(!current||compareStamp(current,item)<0) output.set(id,clone(item));
    });
    return [...output.values()].sort((a,b)=>a[idField].localeCompare(b[idField],"en"));
  }
  function normalizeDraft(draft,{
    owner,sessionId,routineId,now=new Date().toISOString(),clientInstanceId="legacy",idFactory=null
  }={}){
    if(!record(draft)) throw new Error("invalid_workout_progress");
    const normalizedOwner=ownerId(draft.ownerId||owner);
    const session=token(draft.sessionId||sessionId,"session_id");
    const routine=token(draft.routineId||routineId,"routine_id");
    const updatedAt=iso(draft.updatedAt)||iso(now)||new Date().toISOString();
    const revision=Math.max(1,Number(draft.revision)||1);
    const client=text(draft.clientInstanceId||draft.deviceId||clientInstanceId)||"legacy";
    const legacyStartedAt=iso(draft.startedAt)||iso(draft.sessionTimer?.startedAt);
    const legacyIdentity=deterministicId(
      "workout",normalizedOwner,routine,session,legacyStartedAt||"legacy-active"
    );
    const generated=typeof idFactory==="function"?idFactory("workout"):null;
    const workoutId=token(
      draft.workoutInstanceId||draft.draftId||
      (draft.startedAt||draft.sessionTimer||draft.updatedAt?legacyIdentity:generated),
      "workout_instance_id"
    );
    const fallback=stamp(updatedAt,revision,client);
    const exerciseOccurrences=new Map();
    const exercises=list(draft.exercises).map((exercise,exerciseIndex)=>{
      const sourceId=text(exercise?.exerciseId||exercise?.id||exercise?.name)||`position-${exerciseIndex}`;
      const occurrence=exerciseOccurrences.get(sourceId)||0;
      exerciseOccurrences.set(sourceId,occurrence+1);
      const exerciseId=token(
        exercise?.exerciseInstanceId||deterministicId("exercise",workoutId,sourceId,occurrence),
        "exercise_instance_id"
      );
      const setOccurrences=new Map();
      const series=list(exercise?.series).map((set,setIndex)=>{
        const sourceSet=text(set?.setInstanceId)||`position-${setIndex}`;
        const setOccurrence=setOccurrences.get(sourceSet)||0;
        setOccurrences.set(sourceSet,setOccurrence+1);
        const setId=token(
          set?.setInstanceId||deterministicId("set",exerciseId,sourceSet,setOccurrence),
          "set_instance_id"
        );
        const fieldMeta={};
        SET_FIELDS.forEach(field=>{
          if(record(set?._fieldMeta?.[field])){
            fieldMeta[field]=normalizeMeta(set._fieldMeta[field],fallback);
          }else if(set?.[field]!==undefined&&set[field]!==""&&set[field]!==false){
            fieldMeta[field]=fallback;
          }
        });
        return {...clone(set||{}),setInstanceId:setId,_fieldMeta:fieldMeta};
      });
      const fieldMeta={};
      EXERCISE_FIELDS.forEach(field=>{
        if(record(exercise?._fieldMeta?.[field])){
          fieldMeta[field]=normalizeMeta(exercise._fieldMeta[field],fallback);
        }else if(exercise?.[field]){
          fieldMeta[field]=fallback;
        }
      });
      const explicitSetTombstones=list(exercise?.deletedSetTombstones).map(value=>tombstone(value,{
          idField:"setInstanceId",owner:normalizedOwner,workoutInstanceId:workoutId,
          exerciseInstanceId:exerciseId,fallback
        }));
      const explicitSetIds=new Set(explicitSetTombstones.map(item=>item.setInstanceId));
      const deletedSetTombstones=draft.status==="finalized"?[]:mergeTombstones(
        explicitSetTombstones,
        list(exercise?.deletedSetInstanceIds)
          .filter(value=>!explicitSetIds.has(text(value)))
          .map(value=>tombstone(value,{
          idField:"setInstanceId",owner:normalizedOwner,workoutInstanceId:workoutId,
          exerciseInstanceId:exerciseId,fallback
        })),
        "setInstanceId"
      );
      const deletedSetInstanceIds=deletedSetTombstones.map(item=>item.setInstanceId);
      return {
        ...clone(exercise||{}),exerciseInstanceId:exerciseId,series,
        deletedSetInstanceIds,deletedSetTombstones,_fieldMeta:fieldMeta
      };
    });
    const explicitExerciseTombstones=list(draft.deletedExerciseTombstones)
      .map(value=>tombstone(value,{
        idField:"exerciseInstanceId",owner:normalizedOwner,workoutInstanceId:workoutId,
        fallback
      }));
    const explicitExerciseIds=new Set(
      explicitExerciseTombstones.map(item=>item.exerciseInstanceId)
    );
    const deletedExerciseTombstones=draft.status==="finalized"?[]:mergeTombstones(
      explicitExerciseTombstones,
      list(draft.deletedExerciseInstanceIds)
        .filter(value=>!explicitExerciseIds.has(text(value)))
        .map(value=>tombstone(value,{
        idField:"exerciseInstanceId",owner:normalizedOwner,workoutInstanceId:workoutId,
        fallback
      })),
      "exerciseInstanceId"
    );
    const deletedExerciseInstanceIds=deletedExerciseTombstones
      .map(item=>item.exerciseInstanceId);
    const requestedExerciseId=text(draft.currentExerciseInstanceId);
    const legacyExerciseIndex=Math.max(
      0,Math.min(exercises.length-1,Number(draft.currentExerciseIndex)||0)
    );
    const currentExerciseInstanceId=exercises.some(
      exercise=>exercise.exerciseInstanceId===requestedExerciseId
    )
      ?requestedExerciseId
      :(exercises[legacyExerciseIndex]?.exerciseInstanceId||null);
    const fieldMeta={};
    ROOT_FIELDS.forEach(field=>{
      if(record(draft?._fieldMeta?.[field])) fieldMeta[field]=normalizeMeta(draft._fieldMeta[field],fallback);
      else if(draft[field]!==undefined&&draft[field]!==null) fieldMeta[field]=fallback;
    });
    if(currentExerciseInstanceId&&!fieldMeta.currentExerciseInstanceId){
      fieldMeta.currentExerciseInstanceId=fallback;
    }
    return {
      ...clone(draft),
      draftId:text(draft.draftId)||workoutId,
      workoutInstanceId:workoutId,
      ownerId:normalizedOwner,
      sessionId:session,
      routineId:routine,
      startedAt:draft.startedAt??now,
      revision,
      updatedAt,
      clientInstanceId:client,
      status:["active","finalized","discarded"].includes(draft.status)?draft.status:"active",
      exercises,
      currentExerciseInstanceId,
      deletedExerciseInstanceIds,
      deletedExerciseTombstones,
      _fieldMeta:fieldMeta,
      conflicts:list(draft.conflicts).map(conflict=>({
        ...clone(conflict),ownerId:normalizedOwner,workoutInstanceId:workoutId,
        variants:list(conflict?.variants).map(variant=>({
          ...clone(variant),ownerId:normalizedOwner,workoutInstanceId:workoutId
        }))
      }))
    };
  }
  function compareStamp(left,right){
    const leftTime=Date.parse(left?.updatedAt||0)||0;
    const rightTime=Date.parse(right?.updatedAt||0)||0;
    if(leftTime!==rightTime) return leftTime-rightTime;
    const revision=(Number(left?.revision)||0)-(Number(right?.revision)||0);
    if(revision) return revision;
    return text(left?.clientInstanceId).localeCompare(text(right?.clientInstanceId),"en");
  }
  function fieldChoice(local,incoming,field,localFallback,incomingFallback,path,conflicts){
    if(same(local?.[field],incoming?.[field])) return {value:clone(local?.[field]),meta:clone(local?._fieldMeta?.[field]||incoming?._fieldMeta?.[field])};
    const localExplicit=record(local?._fieldMeta?.[field]);
    const incomingExplicit=record(incoming?._fieldMeta?.[field]);
    if(localExplicit&&!incomingExplicit){
      return {value:clone(local?.[field]),meta:clone(local._fieldMeta[field])};
    }
    if(incomingExplicit&&!localExplicit){
      return {value:clone(incoming?.[field]),meta:clone(incoming._fieldMeta[field])};
    }
    const localMeta=normalizeMeta(local?._fieldMeta?.[field],localFallback);
    const incomingMeta=normalizeMeta(incoming?._fieldMeta?.[field],incomingFallback);
    const localTime=Date.parse(localMeta.updatedAt)||0;
    const incomingTime=Date.parse(incomingMeta.updatedAt)||0;
    const logicalComparison=localTime!==incomingTime
      ?localTime-incomingTime
      :(Number(localMeta.revision)||0)-(Number(incomingMeta.revision)||0);
    if(logicalComparison===0){
      conflicts.push({
        path,
        variants:[
          {value:clone(local?.[field]),...localMeta},
          {value:clone(incoming?.[field]),...incomingMeta}
        ]
      });
    }
    const useIncoming=logicalComparison<0||(
      logicalComparison===0&&
      text(localMeta.clientInstanceId).localeCompare(text(incomingMeta.clientInstanceId),"en")<0
    );
    return {
      value:clone(useIncoming?incoming?.[field]:local?.[field]),
      meta:clone(useIncoming?incomingMeta:localMeta)
    };
  }
  function mergeSet(local,incoming,localFallback,incomingFallback,path,conflicts){
    const output={...clone(local),...clone(incoming),setInstanceId:local.setInstanceId,_fieldMeta:{}};
    SET_FIELDS.forEach(field=>{
      const choice=fieldChoice(local,incoming,field,localFallback,incomingFallback,`${path}.${field}`,conflicts);
      output[field]=choice.value;
      if(choice.meta) output._fieldMeta[field]=choice.meta;
    });
    return output;
  }
  function mergeExercise(local,incoming,localFallback,incomingFallback,path,conflicts){
    const output={...clone(local),...clone(incoming),exerciseInstanceId:local.exerciseInstanceId,_fieldMeta:{}};
    EXERCISE_FIELDS.forEach(field=>{
      const choice=fieldChoice(local,incoming,field,localFallback,incomingFallback,`${path}.${field}`,conflicts);
      output[field]=choice.value;
      if(choice.meta) output._fieldMeta[field]=choice.meta;
    });
    const deletedSetTombstones=mergeTombstones(
      local.deletedSetTombstones,incoming.deletedSetTombstones,"setInstanceId"
    );
    const deletedSetInstanceIds=deletedSetTombstones.map(item=>item.setInstanceId);
    const deletedSets=new Set(deletedSetInstanceIds);
    const incomingSets=new Map(list(incoming.series)
      .filter(set=>!deletedSets.has(set.setInstanceId))
      .map(set=>[set.setInstanceId,set]));
    output.series=list(local.series).filter(set=>!deletedSets.has(set.setInstanceId)).map(set=>{
      const other=incomingSets.get(set.setInstanceId);
      incomingSets.delete(set.setInstanceId);
      return other?mergeSet(set,other,localFallback,incomingFallback,`${path}.sets.${set.setInstanceId}`,conflicts):clone(set);
    });
    [...incomingSets.values()].sort((a,b)=>text(a.setInstanceId).localeCompare(text(b.setInstanceId),"en"))
      .forEach(set=>output.series.push(clone(set)));
    output.deletedSetInstanceIds=deletedSetInstanceIds;
    output.deletedSetTombstones=deletedSetTombstones;
    output.sets=output.series.filter(set=>set?.planned!==false).length;
    return output;
  }
  function mergeDrafts(localDraft,incomingDraft){
    const local=normalizeDraft(localDraft,{});
    const incoming=normalizeDraft(incomingDraft,{});
    if(local.ownerId!==incoming.ownerId) throw new Error("owner_mismatch");
    if(local.workoutInstanceId!==incoming.workoutInstanceId) throw new Error("workout_instance_mismatch");
    if(local.sessionId!==incoming.sessionId||local.routineId!==incoming.routineId) throw new Error("workout_context_mismatch");
    if(local.status==="finalized"||incoming.status==="finalized"){
      if(local.status==="finalized"&&incoming.status!=="finalized"){
        return {draft:local,changed:false,conflicts:clone(local.conflicts)};
      }
      if(incoming.status==="finalized"&&local.status!=="finalized"){
        return {draft:incoming,changed:true,conflicts:clone(incoming.conflicts)};
      }
      const finalized=compareStamp(local,incoming)<0?incoming:local;
      const finalConflicts=same(local,incoming)?clone(finalized.conflicts):[
        ...clone(finalized.conflicts),
        {
          code:"finalized_content_conflict",path:"workout",
          ownerId:local.ownerId,workoutInstanceId:local.workoutInstanceId,
          variants:[
            {revision:local.revision,updatedAt:local.updatedAt,clientInstanceId:local.clientInstanceId,ownerId:local.ownerId,workoutInstanceId:local.workoutInstanceId},
            {revision:incoming.revision,updatedAt:incoming.updatedAt,clientInstanceId:incoming.clientInstanceId,ownerId:local.ownerId,workoutInstanceId:local.workoutInstanceId}
          ]
        }
      ];
      const finalDraft={...finalized,conflicts:finalConflicts};
      return {
        draft:finalDraft,changed:!same(finalDraft,local),conflicts:finalConflicts
      };
    }
    if(same(local,incoming)) return {draft:local,changed:false,conflicts:clone(local.conflicts)};
    const conflicts=[...list(local.conflicts),...list(incoming.conflicts)];
    const localFallback=stamp(local.updatedAt,local.revision,local.clientInstanceId);
    const incomingFallback=stamp(incoming.updatedAt,incoming.revision,incoming.clientInstanceId);
    const newer=compareStamp(localFallback,incomingFallback)<0?incoming:local;
    const output={...clone(newer),ownerId:local.ownerId,workoutInstanceId:local.workoutInstanceId,draftId:local.draftId};
    output._fieldMeta={};
    ROOT_FIELDS.forEach(field=>{
      const choice=fieldChoice(local,incoming,field,localFallback,incomingFallback,field,conflicts);
      output[field]=choice.value;
      if(choice.meta) output._fieldMeta[field]=choice.meta;
    });
    const deletedExerciseTombstones=mergeTombstones(
      local.deletedExerciseTombstones,incoming.deletedExerciseTombstones,
      "exerciseInstanceId"
    );
    const deletedExerciseInstanceIds=deletedExerciseTombstones
      .map(item=>item.exerciseInstanceId);
    const deletedExercises=new Set(deletedExerciseInstanceIds);
    const incomingExercises=new Map(incoming.exercises
      .filter(exercise=>!deletedExercises.has(exercise.exerciseInstanceId))
      .map(exercise=>[exercise.exerciseInstanceId,exercise]));
    output.exercises=local.exercises
      .filter(exercise=>!deletedExercises.has(exercise.exerciseInstanceId))
      .map(exercise=>{
      const other=incomingExercises.get(exercise.exerciseInstanceId);
      incomingExercises.delete(exercise.exerciseInstanceId);
      return other?mergeExercise(
        exercise,other,localFallback,incomingFallback,
        `exercises.${exercise.exerciseInstanceId}`,conflicts
      ):clone(exercise);
    });
    [...incomingExercises.values()]
      .sort((a,b)=>text(a.exerciseInstanceId).localeCompare(text(b.exerciseInstanceId),"en"))
      .forEach(exercise=>output.exercises.push(clone(exercise)));
    output.deletedExerciseInstanceIds=deletedExerciseInstanceIds;
    output.deletedExerciseTombstones=deletedExerciseTombstones;
    output.conflicts=conflicts.filter((conflict,index,items)=>
      items.findIndex(item=>same(item,conflict))===index
    ).map(conflict=>({
      ...clone(conflict),ownerId:local.ownerId,workoutInstanceId:local.workoutInstanceId,
      variants:list(conflict.variants).map(variant=>({
        ...clone(variant),ownerId:local.ownerId,workoutInstanceId:local.workoutInstanceId
      }))
    }));
    const contentChanged=!same(local,output);
    if(!contentChanged) return {draft:local,changed:false,conflicts:clone(local.conflicts)};
    output.revision=Math.max(local.revision,incoming.revision)+1;
    output.updatedAt=[local.updatedAt,incoming.updatedAt].sort().at(-1);
    return {draft:output,changed:true,conflicts:clone(output.conflicts)};
  }
  function stampLocalChanges(baseDraft,candidateDraft,{now=new Date().toISOString(),clientInstanceId="local"}={}){
    const base=normalizeDraft(baseDraft,{});
    const candidate=normalizeDraft(candidateDraft,{
      owner:base.ownerId,sessionId:base.sessionId,routineId:base.routineId,
      now,clientInstanceId
    });
    const timestamp=iso(now)||new Date().toISOString();
    const revision=base.revision+1;
    let changed=false;
    const mark=(entity,baseEntity,fields)=>{
      entity._fieldMeta=record(entity._fieldMeta)?entity._fieldMeta:{};
      fields.forEach(field=>{
        if(!same(entity[field],baseEntity?.[field])){
          changed=true;
          entity._fieldMeta[field]=stamp(timestamp,revision,clientInstanceId);
        }
      });
    };
    mark(candidate,base,ROOT_FIELDS);
    const baseExercises=new Map(base.exercises.map(item=>[item.exerciseInstanceId,item]));
    candidate.exercises.forEach(exercise=>{
      const previous=baseExercises.get(exercise.exerciseInstanceId);
      if(!previous) changed=true;
      mark(exercise,previous,EXERCISE_FIELDS);
      const baseSets=new Map(list(previous?.series).map(item=>[item.setInstanceId,item]));
      exercise.series.forEach(set=>{
        const previousSet=baseSets.get(set.setInstanceId);
        if(!previousSet) changed=true;
        mark(set,previousSet,SET_FIELDS);
      });
      if(previous){
        const removedSetIds=previous.series
          .filter(item=>!exercise.series.some(set=>set.setInstanceId===item.setInstanceId))
          .map(item=>item.setInstanceId);
        if(removedSetIds.length){
          changed=true;
          const removalMeta=stamp(timestamp,revision,clientInstanceId);
          exercise.deletedSetTombstones=mergeTombstones(
            exercise.deletedSetTombstones,
            removedSetIds.map(setInstanceId=>({
              setInstanceId,ownerId:base.ownerId,
              workoutInstanceId:base.workoutInstanceId,
              exerciseInstanceId:exercise.exerciseInstanceId,
              ...removalMeta
            })),
            "setInstanceId"
          );
          exercise.deletedSetInstanceIds=exercise.deletedSetTombstones
            .map(item=>item.setInstanceId);
        }
      }
    });
    const removedExerciseIds=base.exercises
      .filter(item=>!candidate.exercises.some(exercise=>exercise.exerciseInstanceId===item.exerciseInstanceId))
      .map(item=>item.exerciseInstanceId);
    if(removedExerciseIds.length){
      changed=true;
      const removalMeta=stamp(timestamp,revision,clientInstanceId);
      candidate.deletedExerciseTombstones=mergeTombstones(
        candidate.deletedExerciseTombstones,
        removedExerciseIds.map(exerciseInstanceId=>({
          exerciseInstanceId,ownerId:base.ownerId,
          workoutInstanceId:base.workoutInstanceId,...removalMeta
        })),
        "exerciseInstanceId"
      );
      candidate.deletedExerciseInstanceIds=candidate.deletedExerciseTombstones
        .map(item=>item.exerciseInstanceId);
    }
    if(!changed) return {draft:base,changed:false};
    candidate.revision=revision;
    candidate.updatedAt=timestamp;
    candidate.clientInstanceId=text(clientInstanceId)||"local";
    return {draft:candidate,changed:true};
  }
  function mergeCollections(localRecords,incomingRecords,{owner}={}){
    const normalizedOwner=ownerId(owner);
    const output=new Map();
    const rejected=[];
    list(localRecords).forEach(record=>{
      try{
        const normalized=normalizeDraft(record,{owner:normalizedOwner});
        if(normalized.ownerId!==normalizedOwner) throw new Error("owner_mismatch");
        output.set(normalized.workoutInstanceId,normalized);
      }catch(error){rejected.push({source:"local",code:error.message});}
    });
    list(incomingRecords).forEach(record=>{
      try{
        const normalized=normalizeDraft(record,{owner:normalizedOwner});
        if(normalized.ownerId!==normalizedOwner) throw new Error("owner_mismatch");
        const current=output.get(normalized.workoutInstanceId);
        output.set(normalized.workoutInstanceId,current?mergeDrafts(current,normalized).draft:normalized);
      }catch(error){rejected.push({source:"incoming",code:error.message});}
    });
    return {
      records:[...output.values()].sort((a,b)=>
        text(a.startedAt).localeCompare(text(b.startedAt),"en")||
        a.workoutInstanceId.localeCompare(b.workoutInstanceId,"en")
      ),
      rejected
    };
  }

  global.GymOSWorkoutProgress=Object.freeze({
    VERSION,SET_FIELDS,EXERCISE_FIELDS,ROOT_FIELDS,
    ownerId,progressStorageKey,activeWorkoutStorageKey,migrationStorageKey,
    normalizePointer,selectActivePointer,normalizeDraft,
    stampLocalChanges,mergeDrafts,mergeCollections,same
  });
})(typeof window!=="undefined"?window:globalThis);
