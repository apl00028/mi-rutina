(function(){
  "use strict";

  const STORAGE_KEY="gymos:dailyRecovery";
  const CHECKINS_KEY="gymos:recoveryCheckins";
  const INTERPRETATION_VERSION="4.2.0-rc.2-recovery-1";
  const MAX_COMMENT_LENGTH=300;
  const MAX_PAIN_LOCATIONS=4;
  const TREND_MINIMUM=3;
  const PROVIDERS=["manual","apple_health","google_fit","garmin","polar","whoop","oura","fitbit"];
  const providerAdapters=new Map();
  const scaleLabels={
    sleepQuality:["Muy mal","Mal","Normal","Bien","Muy bien"],
    energy:["Muy bajo","Bajo","Normal","Bueno","Muy bueno"],
    fatigue:["Ninguna","Leve","Moderada","Alta","Muy alta"],
    stress:["Muy bajo","Bajo","Normal","Alto","Muy alto"],
    painLevel:["Ninguno","Leve","Moderado","Alto","Muy alto"],
    motivation:["Muy bajas","Bajas","Normales","Altas","Muy altas"]
  };
  const painLocations=[
    "Cuello","Hombro","Brazo o codo","Muñeca o mano","Espalda alta",
    "Espalda baja","Cadera","Rodilla","Tobillo o pie","Otro"
  ];
  const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  const cleanText=(value,max=500)=>String(value??"").trim().slice(0,max);
  const finite=(value,fallback=null)=>{
    const number=Number(value);
    return Number.isFinite(number)?number:fallback;
  };
  const boundedVariants=value=>Array.isArray(value)
    ?value.filter(item=>{
      try{return JSON.stringify(item).length<=8000;}catch(error){return false;}
    }).slice(-2).map(clone)
    :[];
  const normalizeStoredResult=value=>{
    if(!value||typeof value!=="object") return null;
    return {
      status:cleanText(value.status,30),
      title:cleanText(value.title,140),
      summary:cleanText(value.summary,500),
      reasons:Array.isArray(value.reasons)?value.reasons.map(item=>cleanText(item,180)).filter(Boolean).slice(0,3):[],
      guidance:cleanText(value.guidance,500),
      flags:{
        relevantPain:Boolean(value.flags?.relevantPain),
        highPain:Boolean(value.flags?.highPain),
        veryHighFatigue:Boolean(value.flags?.veryHighFatigue),
        veryLowEnergy:Boolean(value.flags?.veryLowEnergy),
        poorSleep:Boolean(value.flags?.poorSleep),
        highStress:Boolean(value.flags?.highStress),
        lowMotivation:Boolean(value.flags?.lowMotivation)
      },
      completedAt:cleanText(value.completedAt,50)||null,
      version:cleanText(value.version,60),
      context:{
        workoutId:cleanText(value.context?.workoutId,160),
        routineId:cleanText(value.context?.routineId,160),
        sessionId:cleanText(value.context?.sessionId,160)
      }
    };
  };
  const currentOwnerId=()=>typeof currentRoutineOwnerOrNull==="function"
    ?currentRoutineOwnerOrNull()
    :null;

  function getEntries(){
    try{
      const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]");
      const ownerId=currentOwnerId();
      return Array.isArray(value)?value.map(normalizeEntry)
        .filter(entry=>!entry.ownerId||!ownerId||entry.ownerId===ownerId)
        .sort((a,b)=>a.date.localeCompare(b.date)):[];
    }catch(error){
      return [];
    }
  }
  function normalizeEntry(entry){
    const result=normalizeStoredResult(entry.result);
    return {
      id:cleanText(entry.id||`recovery-${entry.date}`,200),
      date:cleanText(entry.date,20),
      ownerId:cleanText(entry.ownerId??entry.owner_id??entry.userId??entry.user_id,80),
      sleepHours:finite(entry.sleepHours??entry.sleep_hours,null),
      sleepQuality:finite(entry.sleepQuality??entry.sleep_quality,0),
      energy:finite(entry.energy,0),
      fatigue:finite(entry.fatigue,0),
      stress:finite(entry.stress,0),
      motivation:finite(entry.motivation,3),
      painLevel:finite(entry.painLevel??entry.pain_level,0),
      painLocation:Array.isArray(entry.painLocation??entry.pain_location)
        ?[...(entry.painLocation??entry.pain_location)].map(value=>cleanText(value,40)).filter(Boolean).slice(0,MAX_PAIN_LOCATIONS)
        :entry.painLocation||entry.pain_location?[cleanText(entry.painLocation||entry.pain_location,40)]:[],
      recoveryScore:finite(entry.recoveryScore??entry.recovery_score,0),
      coachMessage:String((entry.coachMessage??entry.coach_message)||""),
      notes:cleanText(entry.notes,MAX_COMMENT_LENGTH),
      workoutId:cleanText(entry.workoutId??entry.workout_id,200),
      checkinId:cleanText(entry.checkinId??entry.checkin_id,240),
      routineId:cleanText(entry.routineId??entry.routine_id,200),
      sessionId:cleanText(entry.sessionId??entry.session_id,200),
      sessionName:cleanText(entry.sessionName??entry.session_name,120),
      result,
      source:cleanText(entry.source||"manual",40),
      createdAt:cleanText(entry.createdAt||entry.created_at,50)||null,
      updatedAt:cleanText(entry.updatedAt||entry.updated_at||entry.createdAt||entry.created_at,50)||null,
      conflictVariants:boundedVariants(entry.conflictVariants)
    };
  }
  function saveEntries(entries,mark=true){
    const ownerId=currentOwnerId();
    const normalized=entries.map(normalizeEntry)
      .filter(entry=>entry.date)
      .filter(entry=>!entry.ownerId||!ownerId||entry.ownerId===ownerId)
      .map(entry=>ownerId&&!entry.ownerId?{...entry,ownerId}:entry)
      .sort((a,b)=>a.date.localeCompare(b.date))
      .slice(-730);
    localStorage.setItem(STORAGE_KEY,JSON.stringify(normalized));
    if(mark&&typeof markLocalUpdated==="function") markLocalUpdated();
    return normalized;
  }
  function entryForDate(date){
    return getEntries().filter(entry=>entry.date===date)
      .sort((a,b)=>String(b.updatedAt||"").localeCompare(String(a.updatedAt||""))||String(a.id).localeCompare(String(b.id)))[0]||null;
  }
  function normalizeCheckin(checkin){
    const snapshot=checkin.workoutSnapshot??checkin.workout_snapshot;
    return {
      id:cleanText(checkin.id||`recovery-checkin-${checkin.workoutId??checkin.workout_id}`,240),
      workoutId:cleanText(checkin.workoutId??checkin.workout_id,200),
      ownerId:cleanText(checkin.ownerId??checkin.owner_id??checkin.userId??checkin.user_id,80),
      userId:cleanText(checkin.userId??checkin.user_id??checkin.ownerId??checkin.owner_id,80),
      workoutDate:cleanText(checkin.workoutDate??checkin.workout_date,50),
      availableFrom:cleanText(checkin.availableFrom??checkin.available_from,20),
      status:checkin.status==="completed"?"completed":"pending",
      session:cleanText(checkin.session,20),
      routineId:cleanText(checkin.routineId??checkin.routine_id,200),
      sessionId:cleanText(checkin.sessionId??checkin.session_id,200),
      sessionName:cleanText(checkin.sessionName??checkin.session_name,120),
      sessionFocus:cleanText(checkin.sessionFocus??checkin.session_focus,160),
      durationMs:Math.max(0,finite(checkin.durationMs??checkin.duration_ms,0)),
      workoutSnapshot:snapshot&&typeof snapshot==="object"?{
        sessionName:cleanText(snapshot.sessionName??snapshot.session_name,120),
        sessionFocus:cleanText(snapshot.sessionFocus??snapshot.session_focus,160),
        durationMs:Math.max(0,finite(snapshot.durationMs??snapshot.duration_ms,0)),
        completedExercises:Math.max(0,Math.trunc(finite(snapshot.completedExercises??snapshot.completed_exercises,0)))
      }:null,
      completedAt:cleanText(checkin.completedAt??checkin.completed_at,50)||null,
      createdAt:cleanText(checkin.createdAt??checkin.created_at,50)||null,
      updatedAt:cleanText(checkin.updatedAt??checkin.updated_at??checkin.createdAt??checkin.created_at,50)||null,
      conflictVariants:boundedVariants(checkin.conflictVariants)
    };
  }
  function responseLabel(field,value){
    const labels=scaleLabels[field]||[];
    const index=["fatigue","painLevel"].includes(field)?Number(value):Number(value)-1;
    return labels[index]||"Sin responder";
  }
  function recoveryQuestionnaireModel({answers={}}={}){
    const definitions=[
      ["sleepQuality","¿Cómo has dormido?",scaleLabels.sleepQuality.map((label,index)=>({value:index+1,label}))],
      ["energy","¿Cómo está tu nivel de energía?",scaleLabels.energy.map((label,index)=>({value:index+1,label}))],
      ["fatigue","¿Cuánta fatiga o agujetas notas?",scaleLabels.fatigue.map((label,index)=>({value:index,label}))],
      ["painLevel","¿Notas alguna molestia o dolor?",scaleLabels.painLevel.map((label,index)=>({value:index,label}))],
      ["motivation","¿Cómo están tus ganas de entrenar?",scaleLabels.motivation.map((label,index)=>({value:index+1,label}))],
      ["stress","¿Cómo está tu nivel de estrés general?",scaleLabels.stress.map((label,index)=>({value:index+1,label}))]
    ];
    const questions=definitions.map(([id,label,options],index)=>({
      id,label,number:index+1,total:definitions.length,options,
      value:answers[id]??null,answered:answers[id]!==null&&answers[id]!==undefined&&answers[id]!==""
    }));
    const relevantPain=Number(answers.painLevel)>=2;
    const locations=relevantPain&&Array.isArray(answers.painLocation)
      ?answers.painLocation.filter(value=>painLocations.includes(value)).slice(0,MAX_PAIN_LOCATIONS)
      :[];
    return {
      questions,
      complete:questions.every(question=>question.answered)&&(!relevantPain||locations.length>0),
      missing:questions.filter(question=>!question.answered).map(question=>question.id),
      relevantPain,
      painLocations:painLocations.map(label=>({value:label,label,selected:locations.includes(label)})),
      selectedPainLocations:locations,
      comment:cleanText(relevantPain?answers.notes:"",MAX_COMMENT_LENGTH),
      maxCommentLength:MAX_COMMENT_LENGTH,
      maxPainLocations:MAX_PAIN_LOCATIONS
    };
  }
  function recoveryResultModel({answers={},completedAt,context={}}={}){
    const normalized={
      sleepQuality:finite(answers.sleepQuality,0),
      energy:finite(answers.energy,0),
      fatigue:finite(answers.fatigue,0),
      painLevel:finite(answers.painLevel,0),
      motivation:finite(answers.motivation,0),
      stress:finite(answers.stress,0)
    };
    const flags={
      relevantPain:normalized.painLevel>=2,
      highPain:normalized.painLevel>=3,
      veryHighFatigue:normalized.fatigue>=4,
      veryLowEnergy:normalized.energy<=1,
      poorSleep:normalized.sleepQuality<=2,
      highStress:normalized.stress>=4,
      lowMotivation:normalized.motivation<=2
    };
    let status="ready";
    if(flags.highPain) status="pain_review";
    else if(
      (flags.veryHighFatigue&&normalized.energy<=2)||
      [flags.veryHighFatigue,flags.veryLowEnergy,flags.poorSleep,flags.highStress].filter(Boolean).length>=3
    ) status="low";
    else if(
      flags.relevantPain||
      normalized.fatigue>=3||
      normalized.energy<=2||
      [flags.poorSleep,flags.highStress,flags.lowMotivation].filter(Boolean).length>=2
    ) status="margin";
    const copy={
      ready:{
        title:"Preparado para entrenar",
        summary:"Tu sueño, energía y nivel de molestias son compatibles con mantener la sesión prevista.",
        guidance:"Mantén el RIR programado y ajusta la carga según tus sensaciones reales."
      },
      margin:{
        title:"Entrena con algo más de margen",
        summary:"Hoy aparecen algunas señales de recuperación incompleta.",
        guidance:"Mantén los ejercicios, pero considera trabajar con 1–2 repeticiones adicionales en reserva o utilizar una carga ligeramente menor."
      },
      low:{
        title:"Recuperación baja",
        summary:"La combinación de fatiga, energía o sueño sugiere que hoy puede convenir una sesión más conservadora.",
        guidance:"Reduce la exigencia, el volumen o la duración y evita buscar marcas personales."
      },
      pain_review:{
        title:"Revisa la molestia antes de entrenar",
        summary:"Has registrado una molestia relevante.",
        guidance:"Evita movimientos que aumenten el dolor. Si es intenso, nuevo o persistente, valóralo adecuadamente antes de continuar."
      }
    }[status];
    const reasonCandidates=[];
    if(flags.relevantPain) reasonCandidates.push(`Molestias: ${responseLabel("painLevel",normalized.painLevel)}.`);
    if(normalized.fatigue>=3) reasonCandidates.push(`Fatiga muscular: ${responseLabel("fatigue",normalized.fatigue)}.`);
    if(normalized.energy<=2) reasonCandidates.push(`Energía: ${responseLabel("energy",normalized.energy)}.`);
    if(flags.poorSleep) reasonCandidates.push(`Sueño: ${responseLabel("sleepQuality",normalized.sleepQuality)}.`);
    if(flags.highStress) reasonCandidates.push(`Estrés: ${responseLabel("stress",normalized.stress)}.`);
    if(flags.lowMotivation) reasonCandidates.push(`Motivación: ${responseLabel("motivation",normalized.motivation)}.`);
    if(!reasonCandidates.length){
      reasonCandidates.push(
        `Sueño: ${responseLabel("sleepQuality",normalized.sleepQuality)}.`,
        `Energía: ${responseLabel("energy",normalized.energy)}.`,
        `Fatiga muscular: ${responseLabel("fatigue",normalized.fatigue)}.`
      );
    }
    const completedDate=new Date(completedAt);
    return {
      status,title:copy.title,summary:copy.summary,
      reasons:reasonCandidates.slice(0,3),guidance:copy.guidance,flags,
      completedAt:Number.isFinite(completedDate.getTime())?completedDate.toISOString():null,
      version:INTERPRETATION_VERSION,
      context:{
        workoutId:String(context.workoutId||""),
        routineId:String(context.routineId||""),
        sessionId:String(context.sessionId||"")
      }
    };
  }
  function resultForEntry(entry){
    if(!entry) return null;
    return recoveryResultModel({
      answers:entry,
      completedAt:entry.updatedAt||entry.createdAt||`${entry.date}T12:00:00`,
      context:entry
    });
  }
  function recoveryPendingModel({
    entries=[],checkins=[],referenceDate,online=true,error=null,authenticated=true
  }={}){
    const networkState=online?"online":"offline";
    if(error) return {
      state:["session_not_found","permission_denied","not_authenticated"].includes(error.code)?"session_error":"error",
      title:["session_not_found","permission_denied","not_authenticated"].includes(error.code)
        ?"Tu sesión ya no está disponible."
        :"No se pudo actualizar Recuperación.",
      retryable:Boolean(error.retryable),networkState
    };
    if(!authenticated) return {state:"session_error",title:"Tu sesión ya no está disponible.",retryable:false,networkState};
    const today=String(referenceDate||"");
    const completed=[...entries].filter(entry=>entry?.date).sort((a,b)=>
      String(b.date).localeCompare(String(a.date))||
      String(b.updatedAt||"").localeCompare(String(a.updatedAt||""))||
      String(a.id||"").localeCompare(String(b.id||""))
    );
    const completedToday=completed.find(entry=>entry.date===today)||null;
    if(completedToday) return {state:"completed_today",entry:clone(completedToday),result:resultForEntry(completedToday),online,networkState};
    const pending=[...checkins].filter(checkin=>checkin?.status==="pending");
    const due=pending.filter(checkin=>checkin.availableFrom&&checkin.availableFrom<=today)
      .sort((a,b)=>String(a.workoutDate).localeCompare(String(b.workoutDate))||String(a.id).localeCompare(String(b.id)))[0]||null;
    if(due) return {state:"pending",checkin:clone(due),online,networkState};
    const upcoming=pending.filter(checkin=>checkin.availableFrom>today)
      .sort((a,b)=>String(a.availableFrom).localeCompare(String(b.availableFrom))||String(a.id).localeCompare(String(b.id)))[0]||null;
    if(upcoming) return {state:"upcoming",checkin:clone(upcoming),online,networkState};
    if(!completed.length) return {state:"first_use",online,networkState};
    return {state:"idle",entry:clone(completed[0]),result:resultForEntry(completed[0]),online,networkState};
  }
  function recoveryTrendModel({entries=[]}={}){
    const comparable=[...entries].filter(entry=>
      [entry?.sleepQuality,entry?.energy,entry?.fatigue,entry?.painLevel,entry?.motivation,entry?.stress]
        .every(value=>Number.isFinite(Number(value)))
    ).sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(-7);
    if(comparable.length<TREND_MINIMUM){
      return {available:false,minimum:TREND_MINIMUM,count:comparable.length,periodDays:comparable.length,observations:[]};
    }
    const observations=[];
    const first=comparable.slice(0,Math.ceil(comparable.length/2));
    const last=comparable.slice(-Math.ceil(comparable.length/2));
    const average=(rows,field)=>rows.reduce((sum,row)=>sum+Number(row[field]),0)/rows.length;
    if(average(last,"energy")-average(first,"energy")>=.75) observations.push("La energía está mejorando en tus registros recientes.");
    if(average(last,"sleepQuality")<=average(comparable,"sleepQuality")-.75) observations.push("El sueño está por debajo de tu media reciente.");
    if(last.filter(entry=>Number(entry.fatigue)>=3).length>=2) observations.push("La fatiga muscular aparece elevada en los últimos check-ins.");
    if(comparable.every(entry=>Number(entry.painLevel)<2)) observations.push("No has registrado molestias relevantes en este periodo.");
    if(Math.max(...comparable.map(entry=>Number(entry.motivation)))-Math.min(...comparable.map(entry=>Number(entry.motivation)))<=1){
      observations.push("La motivación se mantiene estable.");
    }
    return {
      available:observations.length>0,minimum:TREND_MINIMUM,count:comparable.length,
      periodDays:comparable.length,observations:observations.slice(0,3)
    };
  }
  function recoveryHistoryModel({entries=[],referenceDate}={}){
    const normalized=[...entries].filter(entry=>
      entry?.date&&Number.isFinite(new Date(`${entry.date}T12:00:00`).getTime())
    )
      .sort((a,b)=>
        String(a.date).localeCompare(String(b.date))||
        String(a.updatedAt||"").localeCompare(String(b.updatedAt||""))||
        String(a.id||"").localeCompare(String(b.id||""))
      );
    if(!normalized.length) return {state:"empty",items:[],trend:recoveryTrendModel()};
    if(normalized.length===1){
      const entry=normalized[0];
      return {state:"single",items:[{date:entry.date,result:resultForEntry(entry),entry:clone(entry)}],trend:recoveryTrendModel({entries:normalized})};
    }
    const map=new Map(normalized.map(entry=>[entry.date,entry]));
    const end=new Date(`${referenceDate}T12:00:00`);
    const items=[];
    for(let offset=6;offset>=0;offset--){
      const date=new Date(end);
      date.setDate(date.getDate()-offset);
      const key=dateKey(date);
      const entry=map.get(key)||null;
      items.push({date:key,result:entry?resultForEntry(entry):null,entry:entry?clone(entry):null});
    }
    return {state:"trend",items,trend:recoveryTrendModel({entries:normalized})};
  }
  function recoveryHomeSummaryModel(input={}){
    const model=recoveryPendingModel(input);
    const mapping={
      first_use:{status:"idle",title:"Recuperación",detail:"Disponible después de tu próximo entrenamiento.",action:"recovery"},
      idle:{status:"idle",title:"Todo al día",detail:"No tienes ninguna evaluación pendiente.",action:"recovery"},
      upcoming:{status:"upcoming",title:"Disponible mañana",detail:"Tu próximo check-in aún no está disponible.",action:"recovery"},
      pending:{status:"pending",title:"Check-in pendiente",detail:"Cuéntanos cómo has recuperado.",action:"checkin",checkinId:model.checkin?.id},
      completed_today:{status:"completed",title:model.result?.title||"Recuperación registrada",detail:"Evaluación completada hoy.",action:"recovery"},
      error:{status:"error",title:model.title,detail:"Puedes volver a intentarlo.",action:"recovery"},
      session_error:{status:"error",title:model.title,detail:"Vuelve a iniciar sesión.",action:"recovery"}
    };
    return {...mapping[model.state],state:model.state};
  }
  function getCheckins(){
    try{
      const value=JSON.parse(localStorage.getItem(CHECKINS_KEY)||"[]");
      const ownerId=currentOwnerId();
      return Array.isArray(value)?value.map(normalizeCheckin)
        .filter(checkin=>!checkin.ownerId||!ownerId||checkin.ownerId===ownerId):[];
    }catch(error){return [];}
  }
  function saveCheckins(checkins,mark=true){
    const ownerId=currentOwnerId();
    const byWorkout=new Map();
    checkins.map(normalizeCheckin)
      .filter(checkin=>checkin.workoutId)
      .filter(checkin=>!checkin.ownerId||!ownerId||checkin.ownerId===ownerId)
      .map(checkin=>ownerId&&!checkin.ownerId?{...checkin,ownerId,userId:ownerId}:checkin)
      .sort((a,b)=>String(a.createdAt||"").localeCompare(String(b.createdAt||""))||a.id.localeCompare(b.id))
      .forEach(checkin=>{
        const existing=byWorkout.get(checkin.workoutId);
        if(!existing){byWorkout.set(checkin.workoutId,checkin);return;}
        if(recoverySameContent(existing,checkin)) return;
        const canonicalId=`recovery-checkin-${checkin.workoutId}`;
        const existingTime=new Date(existing.updatedAt||0).getTime()||0;
        const incomingTime=new Date(checkin.updatedAt||0).getTime()||0;
        const preferred=existing.status!==checkin.status
          ?existing.status==="completed"?existing:checkin
          :existing.id===canonicalId&&checkin.id!==canonicalId
            ?existing
            :checkin.id===canonicalId&&existing.id!==canonicalId
              ?checkin
              :incomingTime!==existingTime
                ?incomingTime>existingTime?checkin:existing
                :existing.id.localeCompare(checkin.id)<=0?existing:checkin;
        const conflict=preferred===existing?checkin:existing;
        byWorkout.set(checkin.workoutId,{
          ...preferred,
          conflictVariants:[
            ...(preferred.conflictVariants||[]),
            recoveryStableValue(conflict)
          ].slice(-2)
        });
      });
    const normalized=[...byWorkout.values()].slice(-500);
    localStorage.setItem(CHECKINS_KEY,JSON.stringify(normalized));
    if(mark&&typeof markLocalUpdated==="function") markLocalUpdated();
    return normalized;
  }
  function recoveryStableValue(value){
    if(Array.isArray(value)) return value.map(recoveryStableValue);
    if(value&&typeof value==="object"){
      return Object.fromEntries(Object.keys(value).sort()
        .filter(key=>!["updatedAt","updated_at","conflictVariants"].includes(key))
        .map(key=>[key,recoveryStableValue(value[key])]));
    }
    return value;
  }
  function recoverySameContent(a,b){
    return JSON.stringify(recoveryStableValue(a))===JSON.stringify(recoveryStableValue(b));
  }
  function recoveryEntryIdentity(entry){
    return entry?.checkinId?`checkin:${entry.checkinId}`:`date:${entry?.date||""}`;
  }
  function mergeRecoveryEntries(incoming,mark=false){
    const ownerId=currentOwnerId();
    const merged=new Map(getEntries().map(entry=>[recoveryEntryIdentity(entry),entry]));
    (incoming||[]).map(normalizeEntry)
      .filter(entry=>!entry.ownerId||!ownerId||entry.ownerId===ownerId)
      .forEach(entry=>{
        const key=recoveryEntryIdentity(entry);
        const current=merged.get(key);
        if(!current){merged.set(key,entry);return;}
        if(recoverySameContent(current,entry)) return;
        const currentTime=new Date(current.updatedAt||0).getTime()||0;
        const incomingTime=new Date(entry.updatedAt||0).getTime()||0;
        const preferred=incomingTime>currentTime?entry:current;
        const conflict=incomingTime>currentTime?current:entry;
        merged.set(key,{
          ...preferred,
          conflictVariants:[
            ...(preferred.conflictVariants||[]),
            recoveryStableValue(conflict)
          ].slice(-2)
        });
      });
    return saveEntries([...merged.values()],mark);
  }
  function mergeCheckins(incoming,mark=false){
    const merged=new Map(getCheckins().map(checkin=>[checkin.id,checkin]));
    const ownerId=currentOwnerId();
    (incoming||[]).map(normalizeCheckin)
      .filter(checkin=>!checkin.ownerId||!ownerId||checkin.ownerId===ownerId)
      .forEach(checkin=>{
        const current=merged.get(checkin.id);
        if(!current){merged.set(checkin.id,checkin);return;}
        if(current.status==="completed"&&checkin.status==="pending") return;
        if(recoverySameContent(current,checkin)) return;
        const currentTime=new Date(current.updatedAt||0).getTime()||0;
        const incomingTime=new Date(checkin.updatedAt||0).getTime()||0;
        const preferred=checkin.status==="completed"&&current.status!=="completed"
          ?checkin
          :incomingTime>currentTime?checkin:current;
        const conflict=preferred===checkin?current:checkin;
        merged.set(checkin.id,{
          ...preferred,
          conflictVariants:[
            ...(preferred.conflictVariants||[]),
            recoveryStableValue(conflict)
          ].slice(-2)
        });
      });
    return saveCheckins([...merged.values()],mark);
  }
  function nextLocalDate(value){
    const date=new Date(value);
    return dateKey(new Date(date.getFullYear(),date.getMonth(),date.getDate()+1));
  }
  function createPendingCheckin(workout,{mark=true,sync=true}={}){
    const ownerId=currentOwnerId();
    if(!ownerId||!workout?.id||!workout?.date) return null;
    if(workout.ownerId&&workout.ownerId!==ownerId) return null;
    const storedWorkout=typeof getHistory==="function"
      ?getHistory().find(item=>String(item.id)===String(workout.id))
      :workout;
    if(!storedWorkout||storedWorkout.ownerId&&storedWorkout.ownerId!==ownerId) return null;
    const existing=getCheckins().find(item=>item.workoutId===String(storedWorkout.id));
    if(existing) return existing;
    const now=new Date().toISOString();
    const checkin=normalizeCheckin({
      id:`recovery-checkin-${storedWorkout.id}`,
      workoutId:String(storedWorkout.id),
      ownerId,
      userId:ownerId,
      workoutDate:storedWorkout.date,
      availableFrom:nextLocalDate(storedWorkout.date),
      status:"pending",
      session:storedWorkout.session,
      routineId:storedWorkout.routineId||"",
      sessionId:storedWorkout.sessionId||"",
      sessionName:storedWorkout.sessionName||"",
      sessionFocus:storedWorkout.sessionSnapshot?.focus||storedWorkout.sessionFocus||"",
      durationMs:storedWorkout.durationMs||0,
      workoutSnapshot:{
        sessionName:storedWorkout.sessionName||"",
        sessionFocus:storedWorkout.sessionSnapshot?.focus||storedWorkout.sessionFocus||"",
        durationMs:Math.max(0,finite(storedWorkout.durationMs,0)),
        completedExercises:Array.isArray(storedWorkout.exercises)?storedWorkout.exercises.length:0
      },
      createdAt:now,
      updatedAt:now
    });
    const saved=mergeCheckins([checkin],mark).find(item=>item.id===checkin.id)||checkin;
    if(sync) syncWithSupabase().catch(()=>{});
    return saved;
  }
  function dueCheckin(referenceDate=dateKey(new Date())){
    return getCheckins()
      .filter(checkin=>checkin.status==="pending"&&checkin.availableFrom&&checkin.availableFrom<=referenceDate)
      .sort((a,b)=>a.workoutDate.localeCompare(b.workoutDate)||a.id.localeCompare(b.id))[0]||null;
  }
  function upcomingCheckin(referenceDate=dateKey(new Date())){
    return getCheckins()
      .filter(checkin=>checkin.status==="pending"&&checkin.availableFrom>referenceDate)
      .sort((a,b)=>a.availableFrom.localeCompare(b.availableFrom)||a.id.localeCompare(b.id))[0]||null;
  }
  function checkinById(id){return getCheckins().find(checkin=>checkin.id===id)||null;}
  function reminderKey(checkin){
    const ownerId=currentOwnerId();
    return checkin&&ownerId
      ?`gymos:recovery-reminder:${ownerId}:${dateKey(new Date())}:${checkin.id}`
      :null;
  }
  function reminderDismissed(checkin){
    const key=reminderKey(checkin);
    return Boolean(key&&localStorage.getItem(key));
  }
  function dismissReminder(checkin){
    const key=reminderKey(checkin);
    if(key) localStorage.setItem(key,"1");
  }
  function startCheckin(checkin){
    const current=checkinById(checkin?.id);
    const ownerId=currentOwnerId();
    if(
      !current||current.status!=="pending"||current.availableFrom>dateKey(new Date())||
      current.ownerId&&current.ownerId!==ownerId
    ){
      state.recoveryMessage={type:"error",text:"Este check-in ya no está disponible."};
      state.recoveryView="overview";
      state.screen="recovery";
      renderRecoveryCenter();
      return;
    }
    const preserveDraft=state.recoveryCheckinId===current.id&&state.recoveryDraft;
    state.recoveryCheckinId=current.id;
    state.recoveryDraft=preserveDraft?state.recoveryDraft:draftForCheckin(current);
    state.recoveryQuestionnaireError=null;
    state.recoveryView="checkin";
    state.screen="recovery";
    renderRecoveryCenter();
  }
  function upsertLocal(entry){
    const entries=getEntries();
    const normalized=normalizeEntry(entry);
    const index=entries.findIndex(item=>item.date===normalized.date);
    if(index>=0){
      normalized.id=entries[index].id;
      normalized.createdAt=entries[index].createdAt;
      entries[index]=normalized;
    }else{
      entries.push(normalized);
    }
    saveEntries(entries);
    return normalized;
  }
  function scoreLabel(score){
    if(score>=78) return "Preparado para entrenar";
    if(score>=58) return "Entrena con algo más de margen";
    return "Recuperación baja";
  }
  function calculateScore(input){
    let score=100;
    score-=(5-Number(input.sleepQuality||0))*7;
    score-=(5-Number(input.energy||0))*7;
    score-=Number(input.fatigue||0)*7;
    score-=(Number(input.stress||1)-1)*4;
    score-=(5-Number(input.motivation||0))*3;
    score-=Number(input.painLevel||0)*9;
    return Math.max(0,Math.min(100,Math.round(score)));
  }
  function coachRecommendation(score,input){
    return recoveryResultModel({
      answers:input,
      completedAt:input.updatedAt||input.createdAt||new Date().toISOString(),
      context:input
    }).guidance;
  }
  function resultDetails(entry){
    return resultForEntry(entry)?.reasons||[];
  }
  function analyzeSignals(entries=getEntries()){
    return recoveryTrendModel({entries}).observations;
  }
  function createEntry(draft){
    const now=draft.completedAt||new Date().toISOString();
    const linkedCheckin=state.recoveryCheckinId?checkinById(state.recoveryCheckinId):null;
    const result=recoveryResultModel({
      answers:draft,completedAt:now,
      context:{
        workoutId:linkedCheckin?.workoutId,
        routineId:linkedCheckin?.routineId,
        sessionId:linkedCheckin?.sessionId
      }
    });
    const base={
      id:linkedCheckin?`recovery-${linkedCheckin.id}`:`recovery-${draft.date}`,
      date:draft.date,
      ownerId:currentOwnerId()||"",
      sleepHours:finite(draft.sleepHours,null),
      sleepQuality:Number(draft.sleepQuality),
      energy:Number(draft.energy),
      fatigue:Number(draft.fatigue),
      stress:Number(draft.stress),
      motivation:Number(draft.motivation),
      painLevel:Number(draft.painLevel),
      painLocation:Number(draft.painLevel)>0?[...(draft.painLocation||[])]:[],
      workoutId:linkedCheckin?.workoutId||"",
      checkinId:linkedCheckin?.id||"",
      routineId:linkedCheckin?.routineId||"",
      sessionId:linkedCheckin?.sessionId||"",
      sessionName:linkedCheckin?.sessionName||"",
      notes:cleanText(draft.notes,MAX_COMMENT_LENGTH),
      result,
      source:"manual",
      createdAt:now,
      updatedAt:now
    };
    const recoveryScore=calculateScore(base);
    return {...base,recoveryScore,coachMessage:result.guidance};
  }
  function remoteRow(entry){
    return {
      user_id:state.syncUser.id,
      entry_key:entry.checkinId||`date:${entry.date}`,
      date:entry.date,
      sleep_hours:entry.sleepHours,
      sleep_quality:entry.sleepQuality,
      energy:entry.energy,
      fatigue:entry.fatigue,
      stress:entry.stress,
      motivation:entry.motivation,
      pain_level:entry.painLevel,
      pain_location:entry.painLocation,
      recovery_score:entry.recoveryScore,
      coach_message:entry.coachMessage,
      notes:entry.notes,
      workout_id:entry.workoutId||null,
      checkin_id:entry.checkinId||null,
      routine_id:entry.routineId||null,
      session_id:entry.sessionId||null,
      session_name:entry.sessionName||null,
      result:entry.result||null,
      source:entry.source,
      updated_at:entry.updatedAt
    };
  }
  async function syncWithSupabase(){
    if(typeof isAppAuthenticated!=="function"||!isAppAuthenticated()) return {status:"local"};
    const client=getSupabaseClient();
    if(!client) return {status:"local"};
    const ownerId=currentRoutineOwnerOrNull();
    const userId=state.syncUser.id;
    const assertOwner=()=>{
      assertActiveLocalOwner(ownerId);
      if(state.syncUser?.id!==userId) throw new Error("owner_changed");
    };
    try{
      const {data,error}=await client.from("daily_recovery")
        .select("id,entry_key,date,user_id,sleep_hours,sleep_quality,energy,fatigue,stress,motivation,pain_level,pain_location,recovery_score,coach_message,notes,workout_id,checkin_id,routine_id,session_id,session_name,result,source,created_at,updated_at")
        .eq("user_id",userId)
        .order("date",{ascending:true});
      assertOwner();
      if(error) throw error;
      assertOwner();
      const entries=mergeRecoveryEntries(data||[],false);
      if(entries.length){
        assertOwner();
        const {error:writeError}=await client.from("daily_recovery")
          .upsert(entries.map(entry=>({...remoteRow(entry),user_id:userId})),{onConflict:"user_id,entry_key"});
        assertOwner();
        if(writeError) throw writeError;
      }
      const {data:remoteCheckins,error:checkinsError}=await client.from("recovery_checkins")
        .select("id,workout_id,user_id,workout_date,available_from,status,session,routine_id,session_id,session_name,session_focus,duration_ms,workout_snapshot,completed_at,created_at,updated_at")
        .eq("user_id",userId);
      assertOwner();
      if(checkinsError) throw checkinsError;
      const remoteCheckinMap=new Map((remoteCheckins||[]).map(checkin=>[String(checkin.id),checkin]));
      const checkins=mergeCheckins(remoteCheckins||[],false);
      if(checkins.length){
        const pendingWrites=checkins.filter(checkin=>{
          const remote=remoteCheckinMap.get(checkin.id);
          return !remote||new Date(checkin.updatedAt)>new Date(remote.updated_at);
        });
        assertOwner();
        const {error:writeCheckinsError}=pendingWrites.length
          ?await client.from("recovery_checkins").upsert(pendingWrites.map(checkin=>({
          id:checkin.id,user_id:userId,workout_id:checkin.workoutId,
          workout_date:checkin.workoutDate,available_from:checkin.availableFrom,
          status:checkin.status,session:checkin.session,routine_id:checkin.routineId||null,
          session_id:checkin.sessionId||null,session_name:checkin.sessionName||null,
          session_focus:checkin.sessionFocus||null,duration_ms:checkin.durationMs||0,
          workout_snapshot:checkin.workoutSnapshot||null,completed_at:checkin.completedAt,
          updated_at:checkin.updatedAt
        })),{onConflict:"id"})
          :{error:null};
        assertOwner();
        if(writeCheckinsError) throw writeCheckinsError;
      }
      return {status:"synced",count:entries.length,checkins:checkins.length};
    }catch(error){
      console.warn("Recovery sync unavailable",{
        code:error?.code||"sync_error",
        status:error?.status||null
      });
      return {status:"error",error};
    }
  }
  async function saveEntry(entry){
    const saved=upsertLocal(entry);
    syncWithSupabase();
    if(typeof autoSync==="function") autoSync("recovery check-in");
    return saved;
  }
  function registerProvider(key,adapter){
    if(!PROVIDERS.includes(key)||key==="manual") throw new Error("Proveedor de recuperación no compatible.");
    if(!adapter||typeof adapter.readDaily!=="function") throw new Error("El proveedor debe implementar readDaily(date).");
    providerAdapters.set(key,adapter);
  }
  async function importFromProvider(key,date=dateKey(new Date())){
    const adapter=providerAdapters.get(key);
    if(!adapter) throw new Error("El proveedor de recuperación todavía no está conectado.");
    const imported=await adapter.readDaily(date);
    const entry=createEntry({...imported,date});
    entry.source=key;
    return saveEntry(entry);
  }
  function draftForCheckin(checkin){
    const existing=getEntries().find(entry=>entry.checkinId===checkin?.id);
    return existing?{
      date:dateKey(new Date()),
      sleepQuality:existing.sleepQuality,
      energy:existing.energy,
      fatigue:existing.fatigue,
      painLevel:existing.painLevel,
      motivation:existing.motivation,
      stress:existing.stress,
      painLocation:[...existing.painLocation],
      notes:existing.notes||""
    }:{
      date:dateKey(new Date()),sleepQuality:null,energy:null,fatigue:null,
      painLevel:null,motivation:null,stress:null,painLocation:[],notes:""
    };
  }
  function workoutRelativeModel(checkin,now=new Date()){
    const workoutDate=new Date(checkin?.workoutDate);
    if(!Number.isFinite(workoutDate.getTime())) return {label:"Fecha no disponible",dateTime:"",fullDate:""};
    const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    const workoutDay=new Date(workoutDate.getFullYear(),workoutDate.getMonth(),workoutDate.getDate());
    const difference=Math.round((today-workoutDay)/86400000);
    const label=difference===0?"Hoy":difference===1?"Ayer":difference>1?`Hace ${difference} días`:"Fecha registrada";
    return {
      label,dateTime:workoutDate.toISOString(),
      fullDate:workoutDate.toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long",year:"numeric"})
    };
  }
  function recoveryWorkoutContextHtml(checkin,{verb="Realizada"}={}){
    if(!checkin) return "";
    const relative=workoutRelativeModel(checkin);
    const name=checkin.sessionName||checkin.workoutSnapshot?.sessionName||`Sesión ${checkin.session||""}`.trim();
    const focus=checkin.sessionFocus||checkin.workoutSnapshot?.sessionFocus||"";
    const duration=Math.max(0,finite(checkin.durationMs??checkin.workoutSnapshot?.durationMs,0));
    return `<div class="recovery-related-workout">
      <strong>${esc(name||"Sesión completada")}${focus?` · ${esc(focus)}`:""}</strong>
      <span>${relative.dateTime?`${esc(verb)} <time datetime="${esc(relative.dateTime)}" title="${esc(relative.fullDate)}">${esc(relative.label.toLocaleLowerCase("es"))}</time>`:"Fecha no disponible"}${duration?` · ${esc(formatDuration(duration))}`:""}</span>
    </div>`;
  }
  function recoveryAnswersHtml(entry,{compact=false}={}){
    const rows=[
      ["Sueño","sleepQuality"],["Energía","energy"],["Fatiga muscular","fatigue"],
      ["Molestias","painLevel"],["Motivación","motivation"],["Estrés","stress"]
    ].slice(0,compact?4:6);
    return `<dl class="recovery-answer-summary">${rows.map(([label,field])=>`
      <div><dt>${label}</dt><dd>${esc(responseLabel(field,entry[field]))}</dd></div>
    `).join("")}</dl>`;
  }
  function recoveryStatusLabel(status){
    return {
      ready:"Preparado",margin:"Más margen",low:"Recuperación baja",
      pain_review:"Molestia relevante"
    }[status]||"Evaluación registrada";
  }
  function renderRecoveryHistoryExperience(entries,referenceDate){
    const model=recoveryHistoryModel({entries,referenceDate});
    if(model.state!=="trend") return "";
    return `<section class="recovery-history-experience" aria-labelledby="recoveryHistoryTitle">
      <div class="recovery-section-heading">
        <div><span class="section-kicker">HISTORIAL</span><h2 id="recoveryHistoryTitle">Tendencia de recuperación</h2></div>
        <p>Últimos 7 días</p>
      </div>
      <div class="recovery-history-list">
        ${model.items.map(item=>{
          const date=new Date(`${item.date}T12:00:00`);
          const full=date.toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
          const short=date.toLocaleDateString("es-ES",{weekday:"short",day:"numeric"});
          return `<article class="${item.result?`status-${esc(item.result.status)}`:"missing"}">
            <time datetime="${esc(item.date)}" title="${esc(full)}">${esc(short)}</time>
            <strong>${item.result?esc(recoveryStatusLabel(item.result.status)):"Sin evaluación"}</strong>
          </article>`;
        }).join("")}
      </div>
      ${model.trend.available?`<section class="recovery-observations" aria-labelledby="recoveryObservationsTitle">
        <h3 id="recoveryObservationsTitle">Observaciones recientes</h3>
        <p>Basadas en ${model.trend.count} evaluaciones comparables.</p>
        <ul>${model.trend.observations.map(item=>`<li>${esc(item)}</li>`).join("")}</ul>
      </section>`:""}
    </section>`;
  }
  function renderRecoveryResult(entry,{newResult=false}={}){
    const result=resultForEntry(entry);
    return `<section class="recovery-completed-layout ${newResult?"is-new":""}" ${newResult?'role="status" aria-live="polite"':""}>
      <article class="recovery-result-experience status-${esc(result.status)}" aria-labelledby="recoveryResultTitle">
        <span class="section-kicker">RECUPERACIÓN DE HOY</span>
        <h1 id="recoveryResultTitle">${esc(result.title)}</h1>
        <p>${esc(result.summary)}</p>
        <section aria-labelledby="recoveryReasonsTitle">
          <h2 id="recoveryReasonsTitle">Motivos principales</h2>
          <ul>${result.reasons.map(reason=>`<li>${esc(reason)}</li>`).join("")}</ul>
        </section>
        <section class="recovery-guidance" aria-labelledby="recoveryGuidanceTitle">
          <span class="section-kicker">ORIENTACIÓN</span>
          <h2 id="recoveryGuidanceTitle">${esc(result.guidance)}</h2>
        </section>
        ${result.flags.relevantPain?'<p class="recovery-health-note">GymOS ofrece orientación de entrenamiento y no sustituye una valoración sanitaria.</p>':""}
        <div class="recovery-result-actions">
          <button type="button" class="primary" data-recovery-view-session>Ver sesión de hoy</button>
          <button type="button" class="text-button" data-recovery-home>Volver a Inicio</button>
        </div>
      </article>
      <aside class="recovery-responses" aria-labelledby="recoveryResponsesTitle">
        <span class="section-kicker">RESPUESTAS</span>
        <h2 id="recoveryResponsesTitle">Cómo te encuentras hoy</h2>
        ${recoveryAnswersHtml(entry)}
        ${entry.painLocation?.length?`<div class="recovery-pain-summary"><strong>Zonas indicadas</strong><p>${entry.painLocation.map(esc).join(" · ")}</p></div>`:""}
        ${entry.notes?`<div class="recovery-comment-summary"><strong>Comentario</strong><p>${esc(entry.notes)}</p></div>`:""}
      </aside>
    </section>`;
  }
  function renderRecoveryState(model,entries){
    if(model.state==="completed_today"){
      return renderRecoveryResult(model.entry,{newResult:state.recoveryView==="result"});
    }
    if(model.state==="pending"){
      return `<section class="recovery-primary-state pending" aria-labelledby="recoveryPendingTitle">
        <span class="section-kicker">¿CÓMO TE HAS RECUPERADO?</span>
        <h1 id="recoveryPendingTitle">Cuéntanos cómo te encuentras hoy</h1>
        ${recoveryWorkoutContextHtml(model.checkin)}
        <p>Completa un check-in de menos de 30 segundos.</p>
        <button type="button" class="primary" data-recovery-start="${esc(model.checkin.id)}">Completar check-in</button>
        <aside><strong>¿Por qué te preguntamos esto?</strong><p>Tus respuestas permiten ofrecer una orientación prudente para la sesión de hoy. No modificaremos tu rutina automáticamente.</p></aside>
      </section>`;
    }
    if(model.state==="upcoming"){
      return `<section class="recovery-primary-state upcoming" aria-labelledby="recoveryUpcomingTitle">
        <span class="section-kicker">PRÓXIMO CHECK-IN</span>
        <h1 id="recoveryUpcomingTitle">Tu evaluación estará disponible mañana</h1>
        ${recoveryWorkoutContextHtml(model.checkin,{verb:"Completada"})}
        <p>Primero necesitamos conocer el sueño y las sensaciones posteriores al entrenamiento.</p>
      </section>`;
    }
    if(model.state==="first_use"){
      return `<section class="recovery-primary-state first-use" aria-labelledby="recoveryFirstUseTitle">
        <span class="section-kicker">PRIMER CHECK-IN</span>
        <h1 id="recoveryFirstUseTitle">Descubre cómo estás respondiendo a tus entrenamientos</h1>
        <p>Después de entrenar, GymOS te preguntará por sueño, energía, fatiga y molestias. Tus respuestas ayudan a valorar si conviene mantener la sesión prevista o entrenar con algo más de margen.</p>
        <p>El primer check-in estará disponible después de completar un entrenamiento y alcanzar el día siguiente.</p>
        <button type="button" class="secondary" data-recovery-view-session>Ver mi próxima sesión</button>
      </section>`;
    }
    if(model.state==="idle"){
      const lastRelative=model.entry?workoutRelativeModel({workoutDate:`${model.entry.date}T12:00:00`}):null;
      return `<section class="recovery-primary-state idle" aria-labelledby="recoveryIdleTitle">
        <span class="section-kicker">TODO AL DÍA</span>
        <h1 id="recoveryIdleTitle">No tienes ningún check-in pendiente</h1>
        <p>El próximo estará disponible después de completar un entrenamiento y alcanzar el día siguiente.</p>
        ${model.entry?`<article class="recovery-last-entry">
          <span class="section-kicker">ÚLTIMA RECUPERACIÓN</span>
          <strong>${esc(model.result.title)}</strong>
          <time datetime="${esc(model.entry.date)}" title="${esc(lastRelative.fullDate)}">${esc(lastRelative.label)}</time>
          ${recoveryAnswersHtml(model.entry,{compact:true})}
          ${entries.length>=2?'<button type="button" class="text-button" data-recovery-history>Ver historial →</button>':""}
        </article>`:""}
      </section>`;
    }
    return `<section class="recovery-primary-state error" role="${model.state==="session_error"?"alert":"status"}">
      <span class="section-kicker">${model.state==="session_error"?"SESIÓN NO DISPONIBLE":"NO SE PUDO ACTUALIZAR"}</span>
      <h1>${esc(model.title||"No se pudo cargar Recuperación")}</h1>
      <p>${model.state==="session_error"?"Cierra sesión y vuelve a entrar.":"Tus datos locales se conservan. Puedes volver a intentarlo."}</p>
      ${model.retryable?'<button type="button" class="secondary" data-recovery-retry>Reintentar</button>':""}
    </section>`;
  }
  function renderRecoveryExperienceOverview(){
    const today=dateKey(new Date());
    const entries=getEntries();
    const checkins=getCheckins();
    const conflict=entries.some(entry=>entry.conflictVariants?.length)||checkins.some(checkin=>checkin.conflictVariants?.length);
    const error=state.recoveryMessage?.type==="error"
      ?{code:state.recoveryMessage.code||"load_error",retryable:true}
      :null;
    const model=recoveryPendingModel({
      entries,checkins,referenceDate:today,online:navigator.onLine,
      error,authenticated:typeof isAppAuthenticated!=="function"||isAppAuthenticated()
    });
    app.innerHTML=`<div class="app-shell recovery-shell">
      <main class="screen recovery-screen recovery-experience-screen">
        ${!navigator.onLine?'<p class="recovery-connectivity-note" role="status">Sin conexión. Puedes completar el check-in y GymOS lo sincronizará más tarde.</p>':""}
        ${conflict?'<p class="form-message info" role="status">Hay dos versiones de una evaluación. Ambas se conservan; vuelve a sincronizar para revisarlo.</p>':""}
        ${renderRecoveryState(model,entries)}
        ${entries.length>=2?renderRecoveryHistoryExperience(entries,today):""}
        ${entries.length?'<p class="recovery-disclaimer">Las orientaciones describen tus respuestas y no constituyen un diagnóstico.</p>':""}
      </main>
      ${nav("recovery")}
    </div>`;
    bindRecoveryExperienceEvents();
    bindNav();
  }
  function renderRecoveryQuestionnaire(){
    const checkin=checkinById(state.recoveryCheckinId);
    if(!checkin||checkin.status!=="pending"){state.recoveryView="overview";renderRecoveryExperienceOverview();return;}
    const draft=state.recoveryDraft||draftForCheckin(checkin);
    state.recoveryDraft=draft;
    const model=recoveryQuestionnaireModel({answers:draft});
    app.innerHTML=`<div class="app-shell recovery-shell">
      <main class="screen recovery-screen recovery-questionnaire-screen">
        <header class="recovery-questionnaire-header">
          <button type="button" class="text-button" data-recovery-close-questionnaire>← Volver</button>
          <div><span class="section-kicker">CHECK-IN DE RECUPERACIÓN</span><h1>¿Cómo te encuentras hoy?</h1><p>Seis preguntas · menos de 30 segundos</p></div>
          ${recoveryWorkoutContextHtml(checkin)}
        </header>
        <form id="recoveryExperienceForm" class="recovery-questionnaire" novalidate>
          ${model.questions.map(question=>`<fieldset class="recovery-question" data-recovery-question="${esc(question.id)}">
            <legend><span>${question.number} de ${question.total}</span>${esc(question.label)}</legend>
            <div class="recovery-option-grid">
              ${question.options.map(option=>`<label>
                <input type="radio" name="${esc(question.id)}" value="${option.value}" ${Number(question.value)===option.value?"checked":""}>
                <span>${esc(option.label)}</span>
              </label>`).join("")}
            </div>
          </fieldset>`).join("")}
          <fieldset id="recoveryPainDetails" class="recovery-question recovery-pain-details ${model.relevantPain?"":"hidden"}">
            <legend><span>Solo si hay molestias relevantes</span>¿Dónde notas la molestia?</legend>
            <p>Puedes indicar hasta ${model.maxPainLocations} zonas. Esto no constituye un diagnóstico.</p>
            <div class="recovery-pain-location-grid">
              ${model.painLocations.map(option=>`<label>
                <input type="checkbox" name="painLocation" value="${esc(option.value)}" ${option.selected?"checked":""}>
                <span>${esc(option.label)}</span>
              </label>`).join("")}
            </div>
            <label class="recovery-comment"><span>Comentario opcional</span>
              <textarea name="recoveryNotes" maxlength="${model.maxCommentLength}" rows="3">${esc(model.comment)}</textarea>
              <small>Máximo ${model.maxCommentLength} caracteres.</small>
            </label>
          </fieldset>
          <p id="recoveryQuestionnaireMessage" class="inline-message ${state.recoveryQuestionnaireError?"":"hidden"}" role="alert">${esc(state.recoveryQuestionnaireError||"")}</p>
          <button type="submit" class="primary full recovery-submit" ${state.recoveryBusy?"disabled":""}>${state.recoveryBusy?"Guardando…":"Guardar check-in"}</button>
          <p class="sr-only" role="status" aria-live="polite">${state.recoveryBusy?"Guardando el check-in.":""}</p>
          <p class="recovery-save-note">Tu rutina no se modificará automáticamente.</p>
        </form>
      </main>
      ${nav("recovery")}
    </div>`;
    bindRecoveryQuestionnaireEvents({checkinId:checkin.id,ownerId:currentOwnerId()});
    bindNav();
  }
  function upsertRecoveryEntryWithoutMark(entry){
    const entries=getEntries();
    const index=entries.findIndex(item=>
      entry.checkinId&&item.checkinId===entry.checkinId||
      !entry.checkinId&&item.date===entry.date
    );
    if(index>=0){
      entry.id=entries[index].id;
      entry.createdAt=entries[index].createdAt||entry.createdAt;
      entries[index]=entry;
    }else entries.push(entry);
    saveEntries(entries,false);
    return entry;
  }
  function completeRecoveryAssessment({checkinId,draft,ownerId,completedAt}){
    if(!ownerId||currentOwnerId()!==ownerId) throw new Error("owner_changed");
    const checkin=checkinById(checkinId);
    if(!checkin||checkin.status!=="pending") throw new Error("checkin_stale");
    if(checkin.ownerId&&checkin.ownerId!==ownerId) throw new Error("owner_changed");
    if(checkin.availableFrom>dateKey(new Date(completedAt))) throw new Error("checkin_not_available");
    const workout=typeof getHistory==="function"
      ?getHistory().find(item=>String(item.id)===checkin.workoutId)
      :null;
    if(!workout) throw new Error("workout_not_found");
    if(workout.ownerId&&workout.ownerId!==ownerId) throw new Error("owner_changed");
    const beforeEntries=localStorage.getItem(STORAGE_KEY);
    const beforeCheckins=localStorage.getItem(CHECKINS_KEY);
    const metadataKeys=["gymos:updatedAt","gymos:localUpdatedAt","gymos:syncPending","gymos:localRevision"];
    const beforeMetadata=Object.fromEntries(metadataKeys.map(key=>[key,localStorage.getItem(key)]));
    try{
      const normalizedDraft={
        ...draft,date:dateKey(new Date(completedAt)),
        notes:cleanText(draft.notes,MAX_COMMENT_LENGTH),
        painLocation:Number(draft.painLevel)>=2
          ?[...(draft.painLocation||[])].filter(value=>painLocations.includes(value)).slice(0,MAX_PAIN_LOCATIONS)
          :[]
      };
      const questionnaire=recoveryQuestionnaireModel({answers:normalizedDraft});
      if(!questionnaire.complete) throw new Error("incomplete_questionnaire");
      state.recoveryCheckinId=checkin.id;
      const entry=createEntry({...normalizedDraft,completedAt});
      upsertRecoveryEntryWithoutMark(entry);
      const checkins=getCheckins();
      const index=checkins.findIndex(item=>item.id===checkin.id);
      if(index<0) throw new Error("checkin_stale");
      checkins[index]={...checkins[index],status:"completed",completedAt,updatedAt:completedAt};
      saveCheckins(checkins,false);
      if(currentOwnerId()!==ownerId) throw new Error("owner_changed");
      if(typeof markLocalUpdated==="function") markLocalUpdated();
      if(typeof autoSync==="function") autoSync("recovery check-in");
      syncWithSupabase().catch(()=>{});
      return {entry,checkin:checkins[index]};
    }catch(error){
      if(currentOwnerId()===ownerId){
        if(beforeEntries===null) localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY,beforeEntries);
        if(beforeCheckins===null) localStorage.removeItem(CHECKINS_KEY);
        else localStorage.setItem(CHECKINS_KEY,beforeCheckins);
        Object.entries(beforeMetadata).forEach(([key,value])=>{
          if(value===null) localStorage.removeItem(key);
          else localStorage.setItem(key,value);
        });
      }
      throw error;
    }finally{
      state.recoveryCheckinId=checkinId;
    }
  }
  function bindRecoveryExperienceEvents(){
    const screen=document.querySelector(".recovery-experience-screen");
    if(!screen) return;
    screen.addEventListener("click",event=>{
      const button=event.target.closest("button");
      if(!button||button.disabled) return;
      if(button.matches("[data-recovery-start]")){
        const checkin=checkinById(button.dataset.recoveryStart);
        if(checkin) startCheckin(checkin);
      }else if(button.matches("[data-recovery-view-session]")){
        navigateToScreen("routineWorkflow");
      }else if(button.matches("[data-recovery-home]")){
        state.recoveryView="overview";
        navigateToScreen("home");
      }else if(button.matches("[data-recovery-retry]")){
        if(state.recoveryBusy) return;
        const ownerId=currentOwnerId();
        const operationId=(state.recoveryOperationId||0)+1;
        state.recoveryOperationId=operationId;
        state.recoveryBusy=true;
        button.disabled=true;
        button.textContent="Reintentando…";
        syncWithSupabase().then(result=>{
          if(currentOwnerId()!==ownerId||state.recoveryOperationId!==operationId) return;
          state.recoveryMessage=result.status==="error"
            ?{type:"error",code:result.error?.code||"sync_error"}
            :null;
        }).finally(()=>{
          if(currentOwnerId()!==ownerId||state.recoveryOperationId!==operationId) return;
          state.recoveryBusy=false;
          renderRecoveryExperienceOverview();
        });
      }else if(button.matches("[data-recovery-history]")){
        document.getElementById("recoveryHistoryTitle")?.scrollIntoView({behavior:"smooth",block:"start"});
      }
    });
  }
  function bindRecoveryQuestionnaireEvents(context){
    const form=document.getElementById("recoveryExperienceForm");
    if(!form) return;
    form.addEventListener("change",event=>{
      const target=event.target;
      if(target.type==="radio"){
        state.recoveryDraft[target.name]=Number(target.value);
        if(target.name==="painLevel"){
          const relevant=Number(target.value)>=2;
          form.querySelector("#recoveryPainDetails")?.classList.toggle("hidden",!relevant);
          if(!relevant){
            state.recoveryDraft.painLocation=[];
            state.recoveryDraft.notes="";
            form.querySelectorAll('[name="painLocation"]').forEach(input=>{input.checked=false;});
            const comment=form.querySelector('[name="recoveryNotes"]');
            if(comment) comment.value="";
          }
        }
      }else if(target.name==="painLocation"){
        const selected=[...form.querySelectorAll('[name="painLocation"]:checked')].map(item=>item.value);
        if(selected.length>MAX_PAIN_LOCATIONS){
          target.checked=false;
          state.recoveryQuestionnaireError=`Puedes seleccionar hasta ${MAX_PAIN_LOCATIONS} zonas.`;
        }else{
          state.recoveryDraft.painLocation=selected;
          state.recoveryQuestionnaireError=null;
        }
        const message=form.querySelector("#recoveryQuestionnaireMessage");
        if(message){
          message.textContent=state.recoveryQuestionnaireError||"";
          message.classList.toggle("hidden",!state.recoveryQuestionnaireError);
        }
      }
    });
    form.addEventListener("input",event=>{
      if(event.target.name==="recoveryNotes"){
        state.recoveryDraft.notes=cleanText(event.target.value,MAX_COMMENT_LENGTH);
      }
    });
    form.addEventListener("submit",event=>{
      event.preventDefault();
      if(state.recoveryBusy) return;
      const model=recoveryQuestionnaireModel({answers:state.recoveryDraft});
      if(!model.complete){
        state.recoveryQuestionnaireError=model.relevantPain&&!model.selectedPainLocations.length
          ?"Indica al menos una zona de molestia."
          :"Responde las seis preguntas antes de guardar.";
        const message=document.getElementById("recoveryQuestionnaireMessage");
        if(message){message.textContent=state.recoveryQuestionnaireError;message.classList.remove("hidden");}
        const firstMissing=model.missing[0];
        const question=firstMissing
          ?document.querySelector(`[data-recovery-question="${firstMissing}"]`)
          :document.getElementById("recoveryPainDetails");
        question?.setAttribute("aria-describedby","recoveryQuestionnaireMessage");
        question?.querySelector("input")?.focus();
        return;
      }
      state.recoveryBusy=true;
      renderRecoveryQuestionnaire();
      queueMicrotask(()=>{
        try{
          if(currentOwnerId()!==context.ownerId||state.recoveryCheckinId!==context.checkinId) throw new Error("owner_changed");
          const result=completeRecoveryAssessment({
            checkinId:context.checkinId,draft:state.recoveryDraft,
            ownerId:context.ownerId,completedAt:new Date().toISOString()
          });
          if(currentOwnerId()!==context.ownerId) return;
          state.recoveryResultDate=result.entry.date;
          state.recoveryDraft=null;
          state.recoveryCheckinId=null;
          state.recoveryQuestionnaireError=null;
          state.recoveryView="result";
        }catch(error){
          state.recoveryQuestionnaireError={
            owner_changed:"La cuenta activa ha cambiado. Vuelve a abrir Recuperación.",
            checkin_stale:"Este check-in ya se completó o cambió en otro dispositivo.",
            workout_not_found:"El entrenamiento relacionado ya no está disponible.",
            incomplete_questionnaire:"Responde las seis preguntas antes de guardar."
          }[error?.message]||"No se pudo guardar el check-in. Inténtalo de nuevo.";
        }finally{
          state.recoveryBusy=false;
          if(currentOwnerId()===context.ownerId) renderRecoveryCenter();
        }
      });
    });
    document.querySelector("[data-recovery-close-questionnaire]")?.addEventListener("click",()=>{
      state.recoveryView="overview";
      state.recoveryQuestionnaireError=null;
      renderRecoveryCenter();
    },{once:true});
  }
  function renderRecoveryCenter(){
    if(state.recoveryView==="checkin") renderRecoveryQuestionnaire();
    else renderRecoveryExperienceOverview();
  }
  function renderWorkoutComplete(){
    const workout=state.completedWorkoutSummary;
    app.innerHTML=`<div class="app-shell">
      <main class="screen workout-complete-screen">
        <section class="workout-complete-card">
          <span class="section-kicker">SESIÓN COMPLETADA</span>
          <h1>Ahora toca recuperar</h1>
          <p>Come bien, hidrátate y descansa.</p>
          ${workout?`<div class="workout-complete-meta">${esc(workout.sessionName||`Sesión ${workout.session}`)} · ${formatDuration(workout.durationMs)}</div>`:""}
          <div class="workout-complete-links"><button id="viewCompletedWorkout" class="text-button">Ver entrenamiento</button><button id="backHomeAfterWorkout" class="text-button">Volver a Inicio</button></div>
        </section>
      </main>
    </div>`;
    document.getElementById("viewCompletedWorkout")?.addEventListener("click",()=>{
      state.expandedHistoryId=workout?.id||null;
      navigateToScreen("history");
    },{once:true});
    document.getElementById("backHomeAfterWorkout")?.addEventListener("click",()=>{
      navigateToScreen("home");
    },{once:true});
  }

  window.GymOSRecovery=Object.freeze({
    storageKey:STORAGE_KEY,
    providers:PROVIDERS,
    getEntries,
    entryForDate,
    saveEntries,
    mergeRecoveryEntries,
    getCheckins,
    saveCheckins,
    mergeCheckins,
    createPendingCheckin,
    dueCheckin,
    upcomingCheckin,
    reminderDismissed,
    dismissReminder,
    startCheckin,
    responseLabel,
    recoveryQuestionnaireModel,
    recoveryResultModel,
    recoveryPendingModel,
    recoveryHistoryModel,
    recoveryTrendModel,
    recoveryHomeSummaryModel,
    resultForEntry,
    completeRecoveryAssessment,
    calculateScore,
    scoreLabel,
    resultDetails,
    analyzeSignals,
    coachRecommendation,
    registerProvider,
    importFromProvider,
    syncWithSupabase,
    renderRecoveryCenter,
    renderWorkoutComplete
  });
})();
