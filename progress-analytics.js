(function(global){
  "use strict";

  const VERSION="4.2.0-rc.6-progress-1";
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
  const MUSCLE_GROUP_ALIASES=Object.freeze({
    chest:"Pecho",pectoral:"Pecho",pectorals:"Pecho",pecho:"Pecho",
    back:"Espalda",espalda:"Espalda",lats:"Espalda",latissimus:"Espalda",
    latissimus_dorsi:"Espalda",upper_back:"Espalda",middle_back:"Espalda",
    traps:"Espalda",trapezius:"Espalda",upper_traps:"Espalda",
    spinal_erectors:"Espalda",spinal_mobility:"Espalda",thoracic_spine:"Espalda",
    shoulder:"Hombros",shoulders:"Hombros",hombro:"Hombros",hombros:"Hombros",
    deltoid:"Hombros",deltoids:"Hombros",anterior_deltoid:"Hombros",
    lateral_deltoid:"Hombros",posterior_deltoid:"Hombros",rotator_cuff:"Hombros",
    biceps:"Bíceps",bicep:"Bíceps",brachialis:"Bíceps",forearms:"Bíceps",
    triceps:"Tríceps",tricep:"Tríceps",
    quadriceps:"Cuádriceps",quadricep:"Cuádriceps",quads:"Cuádriceps",
    piernas:"Cuádriceps",legs:"Cuádriceps",
    hamstrings:"Isquios",hamstring:"Isquios",isquios:"Isquios",adductors:"Isquios",
    glutes:"Glúteos",gluteus:"Glúteos",gluteos:"Glúteos",
    gluteus_medius:"Glúteos",gluteus_minimus:"Glúteos",
    calves:"Gemelos",calf:"Gemelos",gemelos:"Gemelos",
    core:"Core",trunk:"Core",abdominals:"Core",abdominales:"Core",abs:"Core",
    obliques:"Core",rectus_abdominis:"Core",hip_flexors:"Core"
  });
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
    return [record?.date,record?.completedAt,record?.startedAt,record?.createdAt,record?.updatedAt]
      .map(validDate).find(Boolean)||null;
  }
  function sourceExercises(record){
    return list(record?.exercises).length?list(record.exercises):list(record?.items);
  }
  function sourceSetCollection(exercise){
    for(const field of ["series","sets","completedSets"]){
      if(Array.isArray(exercise?.[field])&&exercise[field].length){
        return {sets:exercise[field],completionImplied:field==="completedSets"};
      }
    }
    for(const field of ["series","sets","completedSets"]){
      if(Array.isArray(exercise?.[field])){
        return {sets:exercise[field],completionImplied:field==="completedSets"};
      }
    }
    return {sets:[],completionImplied:false};
  }
  function sourceSets(exercise){
    return sourceSetCollection(exercise).sets;
  }
  function setHasResult(set){
    return ["weight","kg","load","reps","seconds","duration","distance","value","assistance"]
      .some(field=>number(set?.[field])!==null);
  }
  function completedSet(set,{completionImplied=false}={}){
    const marker=Boolean(
      set?.done===true||set?.completed===true||set?.performed===true||
      ["done","completed","performed"].includes(text(set?.status).toLowerCase())
    );
    return marker||completionImplied||setHasResult(set);
  }
  function completedSession(record,source){
    const status=text(record?.status).toLowerCase();
    if(["active","paused","draft","incomplete"].includes(status)) return false;
    return Boolean(
      source.includes("history")||["finalized","completed","done"].includes(status)||
      record?.completed===true||record?.done===true||record?.completedAt
    );
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
    const canonical=value=>{
      const key=normalizedName(value).replace(/[\s-]+/g,"_");
      return MUSCLE_GROUP_ALIASES[key]||null;
    };
    const primary=list(item.primaryMuscles).map(canonical).find(Boolean);
    if(primary) return [primary];
    const fallback=[item.muscle,...list(item.muscles)].map(canonical).find(Boolean);
    return [fallback||"Sin clasificar"];
  }
  function normalizeCandidate(record,{source,ownerId,findLibrary}){
    if(!record||typeof record!=="object") return {rejected:"registro no válido"};
    if(record.ownerId&&ownerId&&record.ownerId!==ownerId) return {rejected:"otro propietario"};
    if(source.includes("progress")&&record.ownerId!==ownerId) return {rejected:"sin propietario verificable"};
    const identity=recordIdentity(record);
    if(!identity) return {rejected:"sin identidad deduplicable"};
    const date=dateValue(record);
    if(!date) return {rejected:"fecha no válida"};
    const completed=completedSession(record,source);
    const exercises=[];
    sourceExercises(record).forEach((exercise,exerciseIndex)=>{
      const libraryItem=findLibrary(exercise);
      const setCollection=sourceSetCollection(exercise);
      const sets=setCollection.sets.map((set,setIndex)=>{
        if(!completedSet(set,{completionImplied:setCollection.completionImplied})) return null;
        const weight=number(set?.weight??set?.kg??set?.load);
        const reps=number(set?.reps);
        const rir=number(set?.rir??set?.RIR);
        const seconds=number(set?.seconds??set?.duration);
        const distance=number(set?.distance);
        return {
          id:text(set?.setInstanceId)||`${exerciseIndex}:${setIndex}`,
          weight,reps,rir,seconds,distance,
          volume:weight!==null&&reps!==null?weight*reps:null,
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
      exercise.sets.forEach(set=>{
        const stored=sets.get(set.id);
        if(!stored){sets.set(set.id,clone(set));return;}
        ["weight","reps","rir","seconds","distance","volume"].forEach(field=>{
          if(stored[field]===null&&set[field]!==null) stored[field]=set[field];
        });
      });
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
    const repsValues=sets.map(set=>set.reps).filter(value=>value!==null);
    const volumeValues=sets.map(set=>set.volume).filter(value=>value!==null);
    const weightValues=sets.map(set=>set.weight).filter(value=>value!==null);
    const secondsValues=sets.map(set=>set.seconds).filter(value=>value!==null);
    const distanceValues=sets.map(set=>set.distance).filter(value=>value!==null);
    return {
      sets:sets.length,
      reps:repsValues.reduce((sum,value)=>sum+value,0),repsCount:repsValues.length,
      volume:volumeValues.reduce((sum,value)=>sum+value,0),volumeCount:volumeValues.length,
      maxWeight:weightValues.length?Math.max(...weightValues):null,weightCount:weightValues.length,
      seconds:secondsValues.reduce((sum,value)=>sum+value,0),secondsCount:secondsValues.length,
      distance:distanceValues.reduce((sum,value)=>sum+value,0),distanceCount:distanceValues.length,
      rirValues:sets.map(set=>set.rir).filter(value=>value!==null),
      bestSet:session.exercises.flatMap(exercise=>exercise.sets.map(set=>({
        exercise:exercise.name,...set
      }))).filter(set=>set.volume!==null||set.weight!==null||set.reps!==null)
        .sort((a,b)=>Number(b.volume||0)-Number(a.volume||0)||Number(b.weight||0)-Number(a.weight||0)||Number(b.reps||0)-Number(a.reps||0))[0]||null
    };
  }
  function weekBuckets(sessions,{weeks,now}){
    const currentStart=localWeekStart(now);
    const buckets=[];
    for(let offset=weeks-1;offset>=0;offset-=1){
      const start=new Date(currentStart);start.setDate(start.getDate()-offset*7);
      const end=new Date(start);end.setDate(end.getDate()+7);
      buckets.push({
        start,end,label:start.toLocaleDateString("es-ES",{day:"2-digit",month:"2-digit"}),
        sessions:[],workouts:0,completed:0,incomplete:0,sets:0,reps:0,volume:0,
        maxWeight:null,durationMs:0,avgRir:null,muscleSets:{},
        metricCounts:{reps:0,volume:0,load:0,duration:0,rir:0,seconds:0,distance:0}
      });
    }
    sessions.forEach(session=>{
      const bucket=buckets.find(item=>session.date>=item.start&&session.date<item.end);
      if(!bucket) return;
      const totals=sessionTotals(session);
      bucket.sessions.push(session);bucket.workouts+=1;
      bucket[session.completed?"completed":"incomplete"]+=1;
      bucket.sets+=totals.sets;bucket.reps+=totals.reps;bucket.volume+=totals.volume;
      bucket.metricCounts.reps+=totals.repsCount;
      bucket.metricCounts.volume+=totals.volumeCount;
      bucket.metricCounts.load+=totals.weightCount;
      bucket.metricCounts.seconds+=totals.secondsCount;
      bucket.metricCounts.distance+=totals.distanceCount;
      if(totals.maxWeight!==null) bucket.maxWeight=bucket.maxWeight===null
        ?totals.maxWeight:Math.max(bucket.maxWeight,totals.maxWeight);
      if(session.durationMs!==null){bucket.durationMs+=session.durationMs;bucket.metricCounts.duration+=1;}
      bucket._rir=[...(bucket._rir||[]),...totals.rirValues];
      session.exercises.forEach(exercise=>exercise.muscles.forEach(muscle=>{
        bucket.muscleSets[muscle]=(bucket.muscleSets[muscle]||0)+exercise.sets.length;
      }));
    });
    buckets.forEach(bucket=>{
      bucket.avgRir=bucket._rir?.length?bucket._rir.reduce((a,b)=>a+b,0)/bucket._rir.length:null;
      bucket.metricCounts.rir=bucket._rir?.length||0;
      delete bucket._rir;
    });
    return buckets;
  }
  function exerciseMetrics(sessions){
    const output=new Map();
    sessions.forEach(session=>session.exercises.forEach(exercise=>{
      const key=normalizedName(exercise.name);
      const current=output.get(key)||{name:exercise.name,sets:0,reps:0,volume:0,performances:[],metricCounts:{reps:0,volume:0,load:0,rir:0}};
      exercise.sets.forEach(set=>{
        current.sets+=1;
        if(set.reps!==null){current.reps+=set.reps;current.metricCounts.reps+=1;}
        if(set.volume!==null){current.volume+=set.volume;current.metricCounts.volume+=1;}
        if(set.weight!==null) current.metricCounts.load+=1;
        if(set.rir!==null) current.metricCounts.rir+=1;
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
  function periodTotals(sessions,{start,end}={}){
    const selected=list(sessions).filter(session=>session.date>=start&&session.date<end);
    const totals=selected.map(session=>({session,totals:sessionTotals(session)}));
    const rirValues=totals.flatMap(item=>item.totals.rirValues);
    const durations=selected.map(session=>session.durationMs).filter(value=>value!==null);
    const weights=totals.map(item=>item.totals.maxWeight).filter(value=>value!==null);
    return {
      start,end,sessions:selected,workouts:selected.length,
      completed:selected.filter(session=>session.completed).length,
      incomplete:selected.filter(session=>!session.completed).length,
      sets:totals.reduce((sum,item)=>sum+item.totals.sets,0),
      reps:totals.reduce((sum,item)=>sum+item.totals.reps,0),
      volume:totals.reduce((sum,item)=>sum+item.totals.volume,0),
      maxWeight:weights.length?Math.max(...weights):null,
      averageDurationMs:durations.length?durations.reduce((a,b)=>a+b,0)/durations.length:null,
      avgRir:rirValues.length?rirValues.reduce((a,b)=>a+b,0)/rirValues.length:null,
      metricCounts:{
        reps:totals.reduce((sum,item)=>sum+item.totals.repsCount,0),
        volume:totals.reduce((sum,item)=>sum+item.totals.volumeCount,0),
        load:totals.reduce((sum,item)=>sum+item.totals.weightCount,0),
        duration:durations.length,rir:rirValues.length
      }
    };
  }
  function comparisonDimension(before,value,{beforeAvailable=true,valueAvailable=true}={}){
    if(!beforeAvailable&&!valueAvailable){
      return {status:"sin_datos",previous:null,current:null,delta:null,change:null};
    }
    if(!beforeAvailable||!valueAvailable){
      return {
        status:"sin_comparacion",previous:beforeAvailable?before:null,
        current:valueAvailable?value:null,delta:null,change:null
      };
    }
    const delta=value-before;
    return {
      status:"comparable",previous:before,current:value,delta,
      change:before===0?null:(delta/before)*100
    };
  }
  function countComparisonDimension(before,value,{periodHasBefore=false,periodHasCurrent=false}={}){
    if(!periodHasBefore&&!periodHasCurrent){
      return {status:"sin_datos",previous:null,current:null,delta:null,change:null};
    }
    if(!periodHasBefore||!periodHasCurrent){
      return {
        status:"sin_comparacion",previous:periodHasBefore?before:null,
        current:periodHasCurrent?value:null,delta:null,change:null
      };
    }
    return comparisonDimension(before,value);
  }
  function comparison(weeks,exerciseRows,{now=new Date()}={}){
    const currentStart=localWeekStart(now);
    const currentEnd=new Date(currentStart);
    currentEnd.setDate(currentEnd.getDate()+((validDate(now)||new Date()).getDay()+6)%7+1);
    const previousStart=new Date(currentStart);previousStart.setDate(previousStart.getDate()-7);
    const previousEnd=new Date(previousStart);
    previousEnd.setDate(previousEnd.getDate()+((validDate(now)||new Date()).getDay()+6)%7+1);
    const allSessions=weeks.flatMap(week=>week.sessions);
    const previous=periodTotals(allSessions,{start:previousStart,end:previousEnd});
    const current=periodTotals(allSessions,{start:currentStart,end:currentEnd});
    const previousExercises=new Map(exerciseMetrics(previous.sessions).map(item=>[normalizedName(item.name),item]));
    const currentExercises=exerciseMetrics(current.sessions);
    const increasedWeight=[],increasedReps=[],newRecords=[];
    currentExercises.forEach(item=>{
      const before=previousExercises.get(normalizedName(item.name));
      if(!before) return;
      const currentWeights=item.performances.map(value=>value.weight).filter(value=>value!==null);
      const beforeWeights=before.performances.map(value=>value.weight).filter(value=>value!==null);
      const currentRepetitions=item.performances.map(value=>value.reps).filter(value=>value!==null);
      const beforeRepetitions=before.performances.map(value=>value.reps).filter(value=>value!==null);
      const currentWeight=currentWeights.length?Math.max(...currentWeights):null;
      const beforeWeight=beforeWeights.length?Math.max(...beforeWeights):null;
      const currentReps=currentRepetitions.length?Math.max(...currentRepetitions):null;
      const beforeReps=beforeRepetitions.length?Math.max(...beforeRepetitions):null;
      if(currentWeight!==null&&beforeWeight!==null&&currentWeight>beforeWeight) increasedWeight.push(item.name);
      if(currentReps!==null&&beforeReps!==null&&currentReps>beforeReps) increasedReps.push(item.name);
      const currentVolumes=item.performances.map(value=>value.volume).filter(value=>value!==null);
      const beforeVolumes=before.performances.map(value=>value.volume).filter(value=>value!==null);
      const currentBest=currentVolumes.length?Math.max(...currentVolumes):null;
      const beforeBest=beforeVolumes.length?Math.max(...beforeVolumes):null;
      if(
        currentWeight!==null&&beforeWeight!==null&&currentWeight>beforeWeight||
        currentBest!==null&&beforeBest!==null&&currentBest>beforeBest
      ) newRecords.push(item.name);
    });
    const bestSet=current.sessions.map(session=>sessionTotals(session).bestSet).filter(Boolean)
      .sort((a,b)=>b.volume-a.volume||Number(b.weight||0)-Number(a.weight||0))[0]||null;
    const previousHasSessions=previous.workouts>0,currentHasSessions=current.workouts>0;
    const dimensions={
      sessions:countComparisonDimension(previous.workouts,current.workouts,{
        periodHasBefore:previousHasSessions,periodHasCurrent:currentHasSessions
      }),
      sets:countComparisonDimension(previous.sets,current.sets,{
        periodHasBefore:previousHasSessions,periodHasCurrent:currentHasSessions
      }),
      load:comparisonDimension(previous.maxWeight,current.maxWeight,{
        beforeAvailable:previous.metricCounts.load>0,valueAvailable:current.metricCounts.load>0
      }),
      reps:comparisonDimension(previous.reps,current.reps,{
        beforeAvailable:previous.metricCounts.reps>0,valueAvailable:current.metricCounts.reps>0
      }),
      volume:comparisonDimension(previous.volume,current.volume,{
        beforeAvailable:previous.metricCounts.volume>0,valueAvailable:current.metricCounts.volume>0
      }),
      duration:comparisonDimension(previous.averageDurationMs,current.averageDurationMs,{
        beforeAvailable:previous.metricCounts.duration>0,valueAvailable:current.metricCounts.duration>0
      }),
      rir:comparisonDimension(previous.avgRir,current.avgRir,{
        beforeAvailable:previous.metricCounts.rir>0,valueAvailable:current.metricCounts.rir>0
      })
    };
    const volumeChange=dimensions.volume.change;
    const setChange=dimensions.sets.change;
    const repsChange=dimensions.reps.change;
    const quality=current.sessions.length?current.completed/current.sessions.length:null;
    const directional=[dimensions.sessions,dimensions.sets,dimensions.load,dimensions.reps,dimensions.volume]
      .filter(item=>item.status==="comparable"&&item.delta!==0).map(item=>Math.sign(item.delta));
    let trend;
    if(!previousHasSessions&&!currentHasSessions) trend="sin_datos";
    else if(!previousHasSessions||!currentHasSessions) trend="sin_comparacion";
    else if(directional.some(value=>value>0)&&directional.some(value=>value<0)) trend="mixta";
    else if(directional.some(value=>value>0)) trend="ascendente";
    else if(directional.some(value=>value<0)) trend="descendente";
    else trend="estable";
    return {
      previous,current,dimensions,period:{currentStart,currentEnd,previousStart,previousEnd},
      volumeChange,setChange,repsChange,increasedWeight,increasedReps,newRecords,bestSet,trend,quality
    };
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
    const activitySessions=sessions.filter(session=>session.completed||session.exercises.length);
    const metricSessions=activitySessions;
    const normalizedNow=validDate(now)||new Date();
    const weeks=weekBuckets(activitySessions,{weeks:Math.max(2,Number(rangeWeeks)||8),now:normalizedNow});
    const exercises=exerciseMetrics(activitySessions);
    const allSets=activitySessions.flatMap(session=>session.exercises.flatMap(exercise=>exercise.sets));
    const durations=activitySessions.map(session=>session.durationMs).filter(value=>value>0);
    const rirValues=allSets.map(set=>set.rir).filter(value=>value!==null);
    const day=localDay(normalizedNow);
    const countDays=days=>{
      const start=new Date(day);start.setDate(start.getDate()-(days-1));
      const end=new Date(day);end.setDate(end.getDate()+1);
      return activitySessions.filter(session=>session.date>=start&&session.date<end).length;
    };
    const planned=Number.isInteger(plannedSessionsPerWeek)&&plannedSessionsPerWeek>0?plannedSessionsPerWeek:null;
    const currentWeek=weeks.at(-1);
    return {
      version:VERSION,sessions,activitySessions,metricSessions,weeks,exercises,records:records(exercises),
      comparison:comparison(weeks,exercises,{now:normalizedNow}),
      summary:{
        sessions7:countDays(7),sessions14:countDays(14),sessions30:countDays(30),
        completed:activitySessions.filter(item=>item.completed).length,
        incomplete:activitySessions.filter(item=>!item.completed).length,
        pendingSync:activitySessions.filter(item=>item.pendingSync).length,
        completedSets:allSets.length,totalReps:allSets.reduce((sum,set)=>sum+(set.reps===null?0:set.reps),0),
        averageDurationMs:durations.length?durations.reduce((a,b)=>a+b,0)/durations.length:null,
        averageRir:rirValues.length?rirValues.reduce((a,b)=>a+b,0)/rirValues.length:null,
        currentWeekVolume:currentWeek?.volume||0,
        metricAvailability:{
          reps:allSets.filter(set=>set.reps!==null).length,
          volume:allSets.filter(set=>set.volume!==null).length,
          load:allSets.filter(set=>set.weight!==null).length,
          duration:durations.length,rir:rirValues.length,
          seconds:allSets.filter(set=>set.seconds!==null).length,
          distance:allSets.filter(set=>set.distance!==null).length
        },
        adherence:planned?{available:true,completed:currentWeek?.workouts||0,planned,percent:Math.min(100,(currentWeek?.workouts||0)/planned*100)}:{available:false}
      },
      diagnostics:{
        rawCounts,deduplicatedSessions:sessions.length,
        completed:activitySessions.filter(item=>item.completed).length,
        incomplete:activitySessions.filter(item=>!item.completed).length,
        pendingSync:activitySessions.filter(item=>item.pendingSync).length,
        withCompletedSets:activitySessions.filter(item=>item.exercises.length).length,
        withoutCompletedSets:activitySessions.filter(item=>!item.exercises.length).length,
        notPerformed:sessions.length-activitySessions.length,discarded
      }
    };
  }

  global.GymOSProgressAnalytics=Object.freeze({
    VERSION,aggregate,localWeekStart,recordIdentity
  });
})(typeof window!=="undefined"?window:globalThis);
