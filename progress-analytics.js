(function(global){
  "use strict";

  const VERSION="4.2.0-rc.6-progress-1";
  const DAY_MS=86400000;
  const list=value=>Array.isArray(value)?value:[];
  const text=value=>String(value??"").trim();
  const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  const number=value=>{
    if(value===null||value===undefined||value==="") return null;
    const parsed=Number(String(value).replace(",","."));
    return Number.isFinite(parsed)?parsed:null;
  };
  const normalizedName=value=>text(value).normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ");
  function validDate(value){
    const date=new Date(value);
    return Number.isFinite(date.getTime())?date:null;
  }
  function localDay(date){
    return new Date(date.getFullYear(),date.getMonth(),date.getDate());
  }
  function localWeekStart(value){
    const date=validDate(value)||new Date();
    const start=localDay(date);
    start.setDate(start.getDate()-((start.getDay()+6)%7));
    return start;
  }
  function dateValue(record){
    return validDate(record?.date||record?.completedAt||record?.startedAt||record?.createdAt||record?.updatedAt);
  }
  function sourceExercises(record){
    return list(record?.exercises).length?list(record.exercises):list(record?.items);
  }
  function sourceSets(exercise){
    if(Array.isArray(exercise?.series)) return exercise.series;
    if(Array.isArray(exercise?.sets)) return exercise.sets;
    return list(exercise?.completedSets);
  }
  function setHasResult(set){
    return ["weight","kg","load","reps","seconds","duration","distance","value","assistance"]
      .some(field=>number(set?.[field])!==null);
  }
  function completedSet(set,sessionCompleted){
    if(!setHasResult(set)) return false;
    if(sessionCompleted) return set?.done!==false&&set?.completed!==false;
    return Boolean(set?.done||set?.completed||["done","completed"].includes(text(set?.status).toLowerCase()));
  }
  function recordIdentity(record){
    const explicit=text(record?.workoutInstanceId||record?.draftId||record?.id);
    if(explicit) return `id:${explicit}`;
    const date=text(record?.date||record?.completedAt||record?.startedAt||record?.createdAt);
    const session=text(record?.sessionId||record?.session||record?.sessionKey||record?.legacySessionKey);
    const signature=sourceExercises(record).map(exercise=>
      `${normalizedName(exercise?.name)}:${sourceSets(exercise).map(set=>[
        set?.weight??set?.kg??set?.load??"",set?.reps??"",Boolean(set?.done||set?.completed)
      ].join("/")).join(",")}`
    ).join("|");
    return date||session||signature?`legacy:${date}:${session}:${signature}`:null;
  }
  function libraryLookup(library){
    const byId=new Map(),byName=new Map();
    list(library).forEach(item=>{
      [item?.id,item?.exerciseId].map(text).filter(Boolean).forEach(id=>byId.set(id,item));
      const name=normalizedName(item?.name);
      if(name) byName.set(name,item);
    });
    return exercise=>{
      const id=text(exercise?.resolvedLibraryExerciseId||exercise?.exerciseId||exercise?.id);
      return (id&&byId.get(id))||byName.get(normalizedName(exercise?.name))||null;
    };
  }
  function confirmedLibraryItem(item){
    if(!item) return false;
    if(item.confirmed===false||item.migrationStatus&&item.migrationStatus!=="ready") return false;
    return Boolean(item.muscle||list(item.primaryMuscles).length||list(item.muscles).length);
  }
  function muscleLabels(item){
    if(!confirmedLibraryItem(item)) return ["Sin clasificar"];
    const labels=[...list(item.primaryMuscles),...list(item.muscles),item.muscle]
      .map(text).filter(Boolean);
    return labels.length?[...new Set(labels)]:["Sin clasificar"];
  }
  function normalizeCandidate(record,{source,ownerId,findLibrary}){
    if(!record||typeof record!=="object") return {rejected:"registro no válido"};
    if(record.ownerId&&ownerId&&record.ownerId!==ownerId) return {rejected:"otro propietario"};
    if(source.includes("progress")&&record.ownerId!==ownerId) return {rejected:"sin propietario verificable"};
    const identity=recordIdentity(record);
    if(!identity) return {rejected:"sin identidad deduplicable"};
    const date=dateValue(record);
    if(!date) return {rejected:"fecha no válida"};
    const completed=source.includes("history")||record.status==="finalized"||Boolean(record.completedAt);
    const exercises=[];
    sourceExercises(record).forEach((exercise,exerciseIndex)=>{
      const libraryItem=findLibrary(exercise);
      const sets=sourceSets(exercise).map((set,setIndex)=>{
        if(!completedSet(set,completed)) return null;
        const weight=number(set?.weight??set?.kg??set?.load);
        const reps=number(set?.reps);
        const rir=number(set?.rir??set?.RIR);
        const seconds=number(set?.seconds??set?.duration);
        const distance=number(set?.distance);
        return {
          id:text(set?.setInstanceId)||`${exerciseIndex}:${setIndex}`,
          weight,reps,rir,seconds,distance,
          volume:weight!==null&&reps!==null?weight*reps:0,
          warmup:Boolean(set?.warmup)
        };
      }).filter(Boolean).filter(set=>!set.warmup);
      if(!sets.length) return;
      exercises.push({
        id:text(exercise?.exerciseInstanceId||exercise?.exerciseId||exercise?.id)||`${exerciseIndex}`,
        name:text(exercise?.name)||"Ejercicio sin nombre",sets,
        muscles:muscleLabels(libraryItem),classified:confirmedLibraryItem(libraryItem)
      });
    });
    const durationMs=number(record.durationMs)??number(record.duration)*60000;
    return {session:{
      identity,source,ownerId,date,completed,status:completed?"completed":"incomplete",
      pendingSync:source.startsWith("local")&&record.pendingSync===true,
      sessionId:text(record.sessionId||record.session||record.sessionKey||record.legacySessionKey),
      durationMs:durationMs&&durationMs>0?durationMs:null,exercises,
      rawHasExercises:sourceExercises(record).length>0
    }};
  }
  function mergeSession(left,right){
    const preferred=right.completed&&!left.completed?right:left;
    const other=preferred===left?right:left;
    const exercises=new Map();
    [...preferred.exercises,...other.exercises].forEach(exercise=>{
      const key=normalizedName(exercise.name)||exercise.id;
      const current=exercises.get(key);
      if(!current){exercises.set(key,clone(exercise));return;}
      const sets=new Map(current.sets.map(set=>[set.id,set]));
      exercise.sets.forEach(set=>{if(!sets.has(set.id)) sets.set(set.id,clone(set));});
      current.sets=[...sets.values()];
      current.classified=current.classified||exercise.classified;
      if(current.muscles.includes("Sin clasificar")&&exercise.classified) current.muscles=exercise.muscles;
    });
    return {
      ...preferred,
      date:preferred.date||other.date,
      durationMs:preferred.durationMs||other.durationMs,
      exercises:[...exercises.values()],
      pendingSync:left.pendingSync||right.pendingSync,
      sources:[...new Set([...(left.sources||[left.source]),...(right.sources||[right.source])])]
    };
  }
  function sessionTotals(session){
    const sets=session.exercises.flatMap(exercise=>exercise.sets);
    return {
      sets:sets.length,
      reps:sets.reduce((sum,set)=>sum+(set.reps||0),0),
      volume:sets.reduce((sum,set)=>sum+set.volume,0),
      rirValues:sets.map(set=>set.rir).filter(value=>value!==null),
      bestSet:session.exercises.flatMap(exercise=>exercise.sets.map(set=>({
        exercise:exercise.name,...set
      }))).sort((a,b)=>b.volume-a.volume||Number(b.weight||0)-Number(a.weight||0)||Number(b.reps||0)-Number(a.reps||0))[0]||null
    };
  }
  function weekBuckets(sessions,{weeks,now}){
    const currentStart=localWeekStart(now);
    const buckets=[];
    for(let offset=weeks-1;offset>=0;offset-=1){
      const start=new Date(currentStart);start.setDate(start.getDate()-offset*7);
      const end=new Date(start);end.setDate(end.getDate()+7);
      buckets.push({start,end,label:start.toLocaleDateString("es-ES",{day:"2-digit",month:"2-digit"}),sessions:[],workouts:0,completed:0,incomplete:0,sets:0,reps:0,volume:0,avgRir:null,muscleSets:{}});
    }
    sessions.forEach(session=>{
      const bucket=buckets.find(item=>session.date>=item.start&&session.date<item.end);
      if(!bucket) return;
      const totals=sessionTotals(session);
      bucket.sessions.push(session);bucket.workouts+=1;
      bucket[session.completed?"completed":"incomplete"]+=1;
      bucket.sets+=totals.sets;bucket.reps+=totals.reps;bucket.volume+=totals.volume;
      bucket._rir=[...(bucket._rir||[]),...totals.rirValues];
      session.exercises.forEach(exercise=>exercise.muscles.forEach(muscle=>{
        bucket.muscleSets[muscle]=(bucket.muscleSets[muscle]||0)+exercise.sets.length;
      }));
    });
    buckets.forEach(bucket=>{
      bucket.avgRir=bucket._rir?.length?bucket._rir.reduce((a,b)=>a+b,0)/bucket._rir.length:null;
      delete bucket._rir;
    });
    return buckets;
  }
  function exerciseMetrics(sessions){
    const output=new Map();
    sessions.forEach(session=>session.exercises.forEach(exercise=>{
      const key=normalizedName(exercise.name);
      const current=output.get(key)||{name:exercise.name,sets:0,reps:0,volume:0,performances:[]};
      exercise.sets.forEach(set=>{
        current.sets+=1;current.reps+=set.reps||0;current.volume+=set.volume;
        current.performances.push({date:session.date,completed:session.completed,...set});
      });
      output.set(key,current);
    }));
    return [...output.values()].sort((a,b)=>b.volume-a.volume||a.name.localeCompare(b.name,"es"));
  }
  function records(exercises){
    return exercises.map(exercise=>{
      const resistance=exercise.performances.filter(item=>item.weight>0&&item.reps>0);
      if(!resistance.length) return null;
      const maxWeight=Math.max(...resistance.map(item=>item.weight));
      const best1RM=Math.max(...resistance.map(item=>item.weight*(1+item.reps/30)));
      const bestSet=resistance.slice().sort((a,b)=>b.volume-a.volume)[0];
      return {name:exercise.name,bestWeight:maxWeight,best1RM,bestSet};
    }).filter(Boolean).sort((a,b)=>b.best1RM-a.best1RM);
  }
  function comparison(weeks,exerciseRows){
    const previous=weeks.at(-2)||{sets:0,reps:0,volume:0,sessions:[]};
    const current=weeks.at(-1)||{sets:0,reps:0,volume:0,sessions:[]};
    const change=(value,before)=>before?((value-before)/before)*100:(value?100:0);
    const split=rows=>exerciseMetrics(rows.flatMap(week=>week.sessions));
    const previousExercises=new Map(split([previous]).map(item=>[normalizedName(item.name),item]));
    const currentExercises=split([current]);
    const increasedWeight=[],increasedReps=[],newRecords=[];
    currentExercises.forEach(item=>{
      const before=previousExercises.get(normalizedName(item.name));
      if(!before) return;
      const currentWeight=Math.max(0,...item.performances.map(value=>value.weight||0));
      const beforeWeight=Math.max(0,...before.performances.map(value=>value.weight||0));
      const currentReps=Math.max(0,...item.performances.map(value=>value.reps||0));
      const beforeReps=Math.max(0,...before.performances.map(value=>value.reps||0));
      if(currentWeight>beforeWeight) increasedWeight.push(item.name);
      if(currentReps>beforeReps) increasedReps.push(item.name);
      const currentBest=Math.max(0,...item.performances.map(value=>value.volume||0));
      const beforeBest=Math.max(0,...before.performances.map(value=>value.volume||0));
      if(currentWeight>beforeWeight||currentBest>beforeBest) newRecords.push(item.name);
    });
    const bestSet=current.sessions.map(session=>sessionTotals(session).bestSet).filter(Boolean)
      .sort((a,b)=>b.volume-a.volume||Number(b.weight||0)-Number(a.weight||0))[0]||null;
    const volumeChange=change(current.volume,previous.volume);
    const setChange=change(current.sets,previous.sets);
    const repsChange=change(current.reps,previous.reps);
    const quality=current.sessions.length?current.completed/current.sessions.length:null;
    let trend="estable";
    const positive=[volumeChange>2,setChange>2,repsChange>2,increasedWeight.length>0,increasedReps.length>0].filter(Boolean).length;
    const negative=[volumeChange< -2,setChange< -2,repsChange< -2].filter(Boolean).length;
    if(positive>=2&&negative<2) trend="ascendente";
    else if(negative>=2&&positive<2) trend="descendente";
    if(quality!==null&&quality<0.5&&trend==="ascendente") trend="estable";
    return {previous,current,volumeChange,setChange,repsChange,increasedWeight,increasedReps,newRecords,bestSet,trend,quality};
  }
  function aggregate({
    ownerId,history=[],progressRecords=[],remoteHistory=[],remoteProgress=[],
    exerciseLibrary=[],plannedSessionsPerWeek=null,rangeWeeks=8,now=new Date()
  }={}){
    const owner=text(ownerId);
    if(!owner) throw new Error("owner_required");
    const findLibrary=libraryLookup(exerciseLibrary);
    const inputs=[
      ...list(history).map(record=>({record,source:"local_history"})),
      ...list(progressRecords).map(record=>({record,source:"local_progress"})),
      ...list(remoteHistory).map(record=>({record,source:"remote_history"})),
      ...list(remoteProgress).map(record=>({record,source:"remote_progress"}))
    ];
    const rawCounts={localHistory:list(history).length,localProgress:list(progressRecords).length,remoteHistory:list(remoteHistory).length,remoteProgress:list(remoteProgress).length};
    const discarded={},sessionsById=new Map();
    inputs.forEach(input=>{
      const normalized=normalizeCandidate(input.record,{...input,ownerId:owner,findLibrary});
      if(normalized.rejected){discarded[normalized.rejected]=(discarded[normalized.rejected]||0)+1;return;}
      const current=sessionsById.get(normalized.session.identity);
      sessionsById.set(normalized.session.identity,current?mergeSession(current,normalized.session):{...normalized.session,sources:[normalized.session.source]});
    });
    const sessions=[...sessionsById.values()].sort((a,b)=>a.date-b.date||a.identity.localeCompare(b.identity,"en"));
    sessions.forEach(session=>{
      if(!session.exercises.length){discarded["sin series completadas"]=(discarded["sin series completadas"]||0)+1;}
    });
    const metricSessions=sessions.filter(session=>session.exercises.length);
    const weeks=weekBuckets(metricSessions,{weeks:Math.max(2,Number(rangeWeeks)||8),now:validDate(now)||new Date()});
    const exercises=exerciseMetrics(metricSessions);
    const allSets=metricSessions.flatMap(session=>session.exercises.flatMap(exercise=>exercise.sets));
    const durations=metricSessions.map(session=>session.durationMs).filter(value=>value>0);
    const rirValues=allSets.map(set=>set.rir).filter(value=>value!==null);
    const day=localDay(validDate(now)||new Date());
    const countDays=days=>metricSessions.filter(session=>session.date>=new Date(day.getTime()-(days-1)*DAY_MS)&&session.date<new Date(day.getTime()+DAY_MS)).length;
    const planned=Number.isInteger(plannedSessionsPerWeek)&&plannedSessionsPerWeek>0?plannedSessionsPerWeek:null;
    const currentWeek=weeks.at(-1);
    return {
      version:VERSION,sessions,metricSessions,weeks,exercises,records:records(exercises),
      comparison:comparison(weeks,exercises),
      summary:{
        sessions7:countDays(7),sessions14:countDays(14),sessions30:countDays(30),
        completed:metricSessions.filter(item=>item.completed).length,
        incomplete:metricSessions.filter(item=>!item.completed).length,
        pendingSync:metricSessions.filter(item=>item.pendingSync).length,
        completedSets:allSets.length,totalReps:allSets.reduce((sum,set)=>sum+(set.reps||0),0),
        averageDurationMs:durations.length?durations.reduce((a,b)=>a+b,0)/durations.length:null,
        averageRir:rirValues.length?rirValues.reduce((a,b)=>a+b,0)/rirValues.length:null,
        currentWeekVolume:currentWeek?.volume||0,
        adherence:planned?{available:true,completed:currentWeek?.workouts||0,planned,percent:Math.min(100,(currentWeek?.workouts||0)/planned*100)}:{available:false}
      },
      diagnostics:{
        rawCounts,deduplicatedSessions:sessions.length,completed:sessions.filter(item=>item.completed).length,
        incomplete:sessions.filter(item=>!item.completed).length,pendingSync:sessions.filter(item=>item.pendingSync).length,
        withCompletedSets:metricSessions.length,discarded
      }
    };
  }

  global.GymOSProgressAnalytics=Object.freeze({
    VERSION,aggregate,localWeekStart,recordIdentity
  });
})(typeof window!=="undefined"?window:globalThis);
