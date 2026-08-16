(function(global){
  "use strict";

  const MODEL_VERSION="4.2.0-rc.3-active-workout-sheet-1";
  const REST_TIMER_VERSION=1;
  const MAX_REST_TIMER_DURATION_SECONDS=24*60*60;
  const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  const text=value=>String(value??"").trim();
  const list=value=>Array.isArray(value)?value:[];
  const finite=value=>{
    const parsed=Number(value);
    return Number.isFinite(parsed)?parsed:null;
  };
  const validDate=value=>{
    if(value===null||value===undefined||value==="") return null;
    const date=new Date(value);
    return Number.isFinite(date.getTime())?date:null;
  };
  const hasValue=value=>value!==null&&value!==undefined&&value!=="";
  const setHasResults=set=>Boolean(
    set?.done||hasValue(set?.weight)||hasValue(set?.reps)||hasValue(set?.rir)||
    hasValue(set?.seconds)||hasValue(set?.distance)||text(set?.technique)
  );
  const exerciseIdentity=(exercise,index=0)=>text(exercise?.exerciseId||exercise?.id)||`position-${index}`;
  const LEGACY_EXERCISE_RESOLUTIONS=Object.freeze([
    {name:"Press banca / máquina pecho",mode:"candidates",exerciseIds:["bench-press","machine-chest-press"]},
    {name:"Remo sentado",mode:"exact",exerciseIds:["seated-cable-row"]},
    {name:"Jalón al pecho",mode:"exact",exerciseIds:["lat-pulldown"]},
    {name:"Press hombro máquina/mancuernas",mode:"candidates",exerciseIds:["machine-shoulder-press","db-shoulder-press"]},
    {name:"Zancadas / split squat",mode:"candidates",exerciseIds:["walking-lunge","bulgarian-split-squat"]},
    {name:"Abdominales",mode:"candidates",exerciseIds:["cable-crunch","reverse-crunch","hanging-knee-raise","ab-wheel-rollout"]},
    {name:"Sentadilla goblet / hack / prensa",mode:"candidates",exerciseIds:["goblet-squat","hack-squat","leg-press"]},
    {name:"Gemelo",mode:"candidates",exerciseIds:["calf-raise","standing-calf-raise","seated-calf-raise","leg-press-calf-raise"]}
  ]);

  function sessionElapsedModel({startedAt=null,now=Date.now(),maxReasonableMs=72*60*60*1000}={}){
    const start=validDate(startedAt);
    const current=validDate(now);
    if(!start||!current||current<start){
      return {available:false,startedAt:start?.toISOString()||null,elapsedMs:0,anomalous:false};
    }
    const elapsedMs=current-start;
    return {
      available:true,
      startedAt:start.toISOString(),
      elapsedMs,
      anomalous:elapsedMs>maxReasonableMs
    };
  }
  function activeWorkoutHeaderModel({session=null,exerciseIndex=0,totalExercises=0,startedAt=null,now=Date.now()}={}){
    const total=Math.max(0,Math.floor(finite(totalExercises)||0));
    const index=total?Math.min(total-1,Math.max(0,Math.floor(finite(exerciseIndex)||0))):0;
    const elapsed=sessionElapsedModel({startedAt,now});
    return {
      sessionId:text(session?.sessionId)||null,
      sessionName:text(session?.name||session?.label)||"Sesión",
      focus:text(session?.focus),
      exerciseIndex:index,
      exerciseNumber:total?index+1:0,
      totalExercises:total,
      progressPercentage:total?Math.round(((index+1)/total)*100):0,
      elapsed
    };
  }
  function exerciseLibraryResolutionModel({exercise=null,library=[],selectedExerciseId=null,normalize=value=>text(value).toLowerCase()}={}){
    const items=list(library);
    const runtimeId=text(exercise?.exerciseId||exercise?.id);
    const persistedSelection=text(selectedExerciseId||exercise?.resolvedLibraryExerciseId);
    const selectedMatches=persistedSelection?items.filter(item=>item?.id===persistedSelection):[];
    if(selectedMatches.length===1) return {status:"visual_selection",exercise:clone(selectedMatches[0]),candidates:[]};
    if(selectedMatches.length>1) return {status:"ambiguous",exercise:null,candidates:clone(selectedMatches.slice(0,8))};
    if(runtimeId){
      const exact=items.filter(item=>item?.id===runtimeId);
      if(exact.length===1) return {status:"exact",exercise:clone(exact[0]),candidates:[]};
      if(exact.length>1) return {status:"ambiguous",exercise:null,candidates:clone(exact.slice(0,8))};
    }
    const nameKey=normalize(exercise?.name);
    const matches=nameKey?items.filter(item=>
      normalize(item?.name)===nameKey||list(item?.aliases).some(alias=>normalize(alias)===nameKey)
    ):[];
    if(matches.length===1) return {status:"unique_name",exercise:clone(matches[0]),candidates:[]};
    const legacy=LEGACY_EXERCISE_RESOLUTIONS.find(item=>normalize(item.name)===nameKey);
    if(legacy){
      const candidates=legacy.exerciseIds.flatMap(id=>items.filter(item=>item?.id===id));
      if(legacy.mode==="exact"&&candidates.length===1){
        return {status:"legacy_exact",exercise:clone(candidates[0]),candidates:[]};
      }
      return {
        status:candidates.length?"legacy_ambiguous":"missing",
        exercise:null,candidates:clone(candidates.slice(0,8))
      };
    }
    const pattern=text(exercise?.movementPattern||exercise?.pattern);
    const compatible=matches.length>1
      ?matches
      :pattern?items.filter(item=>item?.movementPattern===pattern):[];
    return {
      status:compatible.length>1?"ambiguous":"missing",
      exercise:null,
      candidates:clone(compatible.slice(0,8))
    };
  }
  function exerciseMuscleModel({exercise=null,label=value=>text(value)}={}){
    const primary=list(exercise?.primaryMuscles).map(label).filter(Boolean);
    const primaryTokens=new Set(list(exercise?.primaryMuscles).map(text));
    const secondary=list(exercise?.secondaryMuscles)
      .filter(value=>!primaryTokens.has(text(value)))
      .map(label).filter(Boolean);
    return {available:Boolean(primary.length||secondary.length),primary,secondary};
  }
  function exerciseTechniqueModel({exercise=null}={}){
    const instructions=exercise?.instructions||{};
    const setup=list(instructions.setup).map(text).filter(Boolean);
    const execution=list(instructions.execution).map(text).filter(Boolean);
    const breathing=text(instructions.breathing);
    const cautions=list(instructions.stopIf).map(text).filter(Boolean).slice(0,4);
    const short=text(instructions.short||exercise?.notes);
    const highlights=[short,...setup,...execution,breathing].filter(Boolean).slice(0,3);
    return {
      available:Boolean(highlights.length||cautions.length),
      highlights,short,setup,execution,breathing,cautions
    };
  }
  function exerciseGuideModel({exercise=null,label=value=>text(value)}={}){
    if(!exercise){
      return {
        available:false,image:null,muscles:{available:false,primary:[],secondary:[]},
        technique:exerciseTechniqueModel(),pattern:"",equipment:[]
      };
    }
    const asset=text(exercise.imageAsset||exercise.image);
    const image=/^(?:\.\/)?assets\//.test(asset)
      ?{src:asset,alt:`Referencia visual de ${text(exercise.name)||"este ejercicio"}`}
      :null;
    return {
      available:true,
      image,
      muscles:exerciseMuscleModel({exercise,label}),
      technique:exerciseTechniqueModel({exercise}),
      pattern:exercise.movementPattern?label(exercise.movementPattern):"",
      equipment:list(exercise.requiredEquipment).map(label).filter(Boolean)
    };
  }
  function setEntryModel({set=null,index=0,previous=null,target="",timed=false}={}){
    const row=set||{};
    return {
      index,number:index+1,setInstanceId:text(row.setInstanceId)||null,
      planned:row.planned!==false,source:text(row.source),
      timed:Boolean(timed),target:text(target),
      previous:previous?{
        weight:previous.weight??"",reps:previous.reps??"",rir:previous.rir??"",
        seconds:previous.seconds??""
      }:null,
      weight:row.weight??"",reps:row.reps??"",rir:row.rir??"",
      seconds:row.seconds??"",warmup:Boolean(row.warmup),done:Boolean(row.done),
      hasResults:setHasResults(row),canDelete:!row.done
    };
  }
  function manualExtraSetModel({
    setInstanceId,ownerId,workoutInstanceId,exerciseInstanceId,createdAt,
    target="",targetRir="",restSeconds=0,type=""
  }={}){
    const identity={
      setInstanceId:text(setInstanceId),ownerId:text(ownerId),
      workoutInstanceId:text(workoutInstanceId),
      exerciseInstanceId:text(exerciseInstanceId)
    };
    if(Object.values(identity).some(value=>!value)) throw new Error("invalid_extra_set_identity");
    const timestamp=new Date(createdAt);
    if(!Number.isFinite(timestamp.getTime())) throw new Error("invalid_extra_set_created_at");
    return {
      ...identity,planned:false,source:"manual_extra",
      createdAt:timestamp.toISOString(),target:text(target),targetRir:text(targetRir),
      restSeconds:Math.max(0,Math.floor(finite(restSeconds)||0)),type:text(type),
      weight:"",reps:"",rir:"",seconds:"",distance:"",technique:"",
      dropset:false,restPause:false,unilateral:false,warmup:false,done:false
    };
  }
  function normalizeSeriesSummarySet(set={}){
    return {
      ...set,
      done:Boolean(set?.done),
      planned:set?.planned!==false,
      warmup:Boolean(set?.warmup)
    };
  }
  function setSeriesSummaryModel({series=[],plannedSets=null}={}){
    const rows=list(series).map(normalizeSeriesSummarySet);
    const inferredPlanned=rows.filter(set=>set.planned).length;
    const requested=plannedSets===null||plannedSets===undefined||plannedSets===""
      ?null
      :finite(plannedSets);
    const planned=Math.max(0,Math.floor(requested===null?inferredPlanned:requested));
    const extras=rows.filter(set=>!set.planned).length;
    const completed=rows.filter(set=>set.done).length;
    const label=extras
      ?`${planned} ${planned===1?"prevista":"previstas"} + ${extras} ${extras===1?"extra":"extras"}`
      :`${completed} de ${planned} ${planned===1?"serie prevista":"series previstas"}`;
    const performedLabel=extras&&completed>planned
      ?`${completed} realizadas · ${planned} previstas`
      :label;
    return {planned,extras,completed,total:rows.length,label,performedLabel};
  }
  function exerciseDetailDisclosureModel({notes="",discomfort=""}={}){
    const hasNotes=Boolean(text(notes));
    const hasDiscomfort=Boolean(text(discomfort));
    return {
      notes:{
        hasContent:hasNotes,
        label:hasNotes?"Notas del ejercicio · Añadida":"Notas del ejercicio"
      },
      discomfort:{
        hasContent:hasDiscomfort,
        label:hasDiscomfort
          ?"Molestias durante el ejercicio · Registrada"
          :"Molestias durante el ejercicio",
        safeSummary:hasDiscomfort?"Molestia registrada":""
      }
    };
  }
  function sessionTimerControlModel({
    status="idle",elapsedMs=0,restored=false
  }={}){
    const normalized=["running","paused"].includes(status)?status:"idle";
    const state={
      idle:"NOT_STARTED",
      running:"RUNNING",
      paused:"PAUSED"
    }[normalized];
    return {
      state,
      restoredState:Boolean(restored&&state!=="NOT_STARTED")?"RESTORED":null,
      primaryLabel:{
        NOT_STARTED:"Empezar sesión",
        RUNNING:"Pausar",
        PAUSED:"Reanudar"
      }[state],
      showReset:Math.max(0,finite(elapsedMs)||0)>0,
      intervalRequired:state==="RUNNING"
    };
  }
  function validRestSeconds(value){
    const number=Number(value);
    return Number.isFinite(number)&&number>=15&&number<=600
      ?Math.floor(number)
      :null;
  }
  function googleExerciseReferenceModel({exercise=null,libraryExercise=null}={}){
    const canonicalName=text(libraryExercise?.name);
    const visibleName=text(exercise?.name);
    const searchName=canonicalName||visibleName;
    return {
      name:searchName,
      canonical:Boolean(canonicalName),
      url:searchName
        ?`https://www.google.com/search?q=${encodeURIComponent(searchName)}`
        :"https://www.google.com/search"
    };
  }
  function exerciseRecordType(exercise={}){
    const normalize=value=>text(value)
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    const candidates=[
      exercise?.recordType,
      ...list(exercise?.recordTypes),
      exercise?.target?.type,
      exercise?.prescription?.target?.type,
      exercise?.prescription?.type
    ].map(normalize).filter(Boolean);
    if(candidates.some(value=>["duration","duracion","tiempo","time"].includes(value))){
      return "duration";
    }
    if(candidates.length) return candidates[0];
    const legacyType=normalize(exercise?.type);
    return ["duration","duracion","tiempo","time"].includes(legacyType)
      ?"duration"
      :null;
  }
  function effectiveRestSeconds(exercise={},preference=90){
    for(const value of [
      exercise?.prescription?.restSeconds,exercise?.restSeconds,preference,90
    ]){
      const valid=validRestSeconds(value);
      if(valid!==null) return valid;
    }
    return 90;
  }
  function restTimerRemaining(payload,now=Date.now()){
    const deadline=Number(payload?.deadlineEpochMs);
    const timestamp=Number(now);
    if(!Number.isFinite(deadline)||!Number.isFinite(timestamp)) return 0;
    return Math.max(0,Math.ceil((deadline-timestamp)/1000));
  }
  function buildRestTimerPayload({
    ownerId,workoutInstanceId,sessionId=null,startedAtEpochMs,deadlineEpochMs,durationSeconds
  }={}){
    const started=Number(startedAtEpochMs);
    const deadline=Number(deadlineEpochMs);
    const duration=Number(durationSeconds);
    const payload={
      version:REST_TIMER_VERSION,
      ownerId:text(ownerId),workoutInstanceId:text(workoutInstanceId),
      sessionId:text(sessionId)||null,
      startedAtEpochMs:started,deadlineEpochMs:deadline,durationSeconds:duration
    };
    if(!payload.ownerId||!payload.workoutInstanceId) return null;
    if(
      !Number.isSafeInteger(started)||!Number.isSafeInteger(deadline)||
      !Number.isSafeInteger(duration)||duration<=0||
      duration>MAX_REST_TIMER_DURATION_SECONDS||deadline<started||
      deadline-started!==duration*1000
    ) return null;
    return payload;
  }
  function normalizeRestTimerPayload(payload){
    if(!payload||typeof payload!=="object"||Array.isArray(payload)) return null;
    if(Number(payload.version)!==REST_TIMER_VERSION) return null;
    return buildRestTimerPayload(payload);
  }
  function restTimerBelongsTo(payload,{ownerId,workoutInstanceId,sessionId=null}={}){
    const normalized=normalizeRestTimerPayload(payload);
    if(!normalized) return false;
    if(
      normalized.ownerId!==text(ownerId)||
      normalized.workoutInstanceId!==text(workoutInstanceId)
    ) return false;
    const expectedSession=text(sessionId)||null;
    return !expectedSession||normalized.sessionId===expectedSession;
  }
  function restTimerModel({
    seconds=0,deadlineEpochMs=null,now=Date.now(),running=false,defaultSeconds=90
  }={}){
    const hasDeadline=deadlineEpochMs!==null&&deadlineEpochMs!==undefined&&deadlineEpochMs!==""&&
      Number.isFinite(Number(deadlineEpochMs));
    const remaining=hasDeadline
      ?restTimerRemaining({deadlineEpochMs},now)
      :Math.max(0,Math.floor(finite(seconds)||0));
    const fallback=Math.max(0,Math.floor(finite(defaultSeconds)||0));
    const active=hasDeadline?remaining>0:Boolean(running&&remaining>0);
    return {
      remainingSeconds:remaining,running:active,defaultSeconds:fallback,
      finished:Boolean((hasDeadline||running)&&remaining===0)
    };
  }
  function shouldStartRestTimerAfterSetCompletion({
    exercises=[],exerciseInstanceId=null,setInstanceId=null
  }={}){
    const rows=list(exercises);
    const currentId=text(exerciseInstanceId);
    const targetSetId=text(setInstanceId);
    if(!currentId||!targetSetId) return false;
    const exerciseIndex=rows.findIndex(
      exercise=>text(exercise?.exerciseInstanceId)===currentId
    );
    if(exerciseIndex<0) return false;
    const exercise=rows[exerciseIndex];
    const set=list(exercise?.series).find(
      item=>text(item?.setInstanceId)===targetSetId
    );
    if(!set||set.done||set.warmup) return false;
    return rows.some((item,index)=>list(item?.series).some(candidate=>{
      if(index===exerciseIndex&&text(candidate?.setInstanceId)===targetSetId){
        return false;
      }
      return !candidate?.done;
    }));
  }
  function workoutCompletionReviewModel({exercises=[],elapsedMs=0}={}){
    const rows=list(exercises).map((exercise,index)=>{
      const sets=list(exercise?.series).map(normalizeSeriesSummarySet);
      const completedSets=sets.filter(set=>set.done).length;
      const startedSets=sets.filter(setHasResults).length;
      const note=text(exercise?.notes);
      const completed=Boolean(
        exercise?.completedAt&&sets.length&&completedSets===sets.length
      );
      const status=completed
        ?"completed"
        :startedSets||completedSets?"partial":"not_started";
      return {
        exerciseId:exerciseIdentity(exercise,index),
        name:text(exercise?.name)||`Ejercicio ${index+1}`,
        status,totalSets:sets.length,completedSets,
        pendingSets:Math.max(0,sets.length-completedSets),
        substituted:Boolean(exercise?.substitution),
        hasNotes:Boolean(note),note
      };
    });
    return {
      exercises:rows,
      completedExercises:rows.filter(row=>row.status==="completed").length,
      partialExercises:rows.filter(row=>row.status==="partial").length,
      untouchedExercises:rows.filter(row=>row.status==="not_started").length,
      pendingSets:rows.reduce((sum,row)=>sum+row.pendingSets,0),
      substitutions:rows.filter(row=>row.substituted).length,
      notes:rows.filter(row=>row.hasNotes).length,
      noteItems:rows.filter(row=>row.hasNotes).map(row=>({
        exerciseId:row.exerciseId,name:row.name,text:row.note
      })),
      elapsedMs:Math.max(0,finite(elapsedMs)||0),
      complete:rows.length>0&&rows.every(row=>row.status==="completed")
    };
  }
  function mobileWorkoutViewModel({
    draft=null,currentExerciseInstanceId=null,selectedSetInstanceId=null,
    previousExercises=[],sessionTimerStatus="idle",elapsedAnomalous=false,
    saveStatus="saved_local",offline=false
  }={}){
    const exercises=list(draft?.exercises);
    const mobileExerciseIdentity=(exercise,index=0)=>
      text(exercise?.exerciseInstanceId)||exerciseIdentity(exercise,index);
    const requestedExerciseId=text(
      currentExerciseInstanceId||draft?.currentExerciseInstanceId
    );
    let exerciseIndex=exercises.findIndex(
      (exercise,index)=>mobileExerciseIdentity(exercise,index)===requestedExerciseId
    );
    if(exerciseIndex<0){
      exerciseIndex=exercises.findIndex(exercise=>{
        const series=list(exercise?.series);
        return !(exercise?.completedAt&&series.length&&series.every(set=>set?.done));
      });
    }
    if(exerciseIndex<0&&exercises.length) exerciseIndex=0;
    const exercise=exerciseIndex>=0?exercises[exerciseIndex]:null;
    const exerciseInstanceId=exercise
      ?mobileExerciseIdentity(exercise,exerciseIndex)
      :null;
    const series=list(exercise?.series);
    const requestedSetId=text(selectedSetInstanceId);
    let activeSetIndex=series.findIndex(
      set=>text(set?.setInstanceId)===requestedSetId
    );
    if(activeSetIndex<0) activeSetIndex=series.findIndex(set=>!set?.done);
    const activeSet=activeSetIndex>=0
      ?setEntryModel({set:series[activeSetIndex],index:activeSetIndex})
      :null;
    const completedSets=series.map((set,index)=>({set,index})).filter(
      row=>row.set?.done&&row.index!==activeSetIndex
    ).map(row=>setEntryModel({set:row.set,index:row.index}));
    const futureSets=series.map((set,index)=>({set,index})).filter(
      row=>!row.set?.done&&row.index!==activeSetIndex
    ).map(row=>setEntryModel({set:row.set,index:row.index}));
    const exerciseRows=exercises.map((item,index)=>{
      const sets=list(item?.series);
      const completed=sets.filter(set=>set?.done).length;
      const started=sets.some(setHasResults);
      const status=item?.completedAt&&sets.length&&completed===sets.length
        ?"completed"
        :started||completed?"started":"pending";
      return {
        exerciseInstanceId:mobileExerciseIdentity(item,index),
        index,name:text(item?.name)||`Ejercicio ${index+1}`,
        status,completedSets:completed,totalSets:sets.length,
        current:index===exerciseIndex
      };
    });
    const allSetsComplete=Boolean(series.length&&series.every(set=>set?.done));
    const allExercisesComplete=Boolean(
      exerciseRows.length&&exerciseRows.every(row=>row.status==="completed")
    );
    const orderedOtherRows=exerciseIndex>=0
      ?[
          ...exerciseRows.slice(exerciseIndex+1),
          ...exerciseRows.slice(0,exerciseIndex)
        ]
      :exerciseRows;
    const nextPendingExercise=orderedOtherRows.find(
      row=>row.status!=="completed"
    )||null;
    let primaryAction;
    if(!exercises.length){
      primaryAction={kind:"open_routine",label:"Ir a Mi rutina"};
    }else if(elapsedAnomalous){
      primaryAction={kind:"reset_anomalous",label:"Retomar tiempo desde ahora"};
    }else if(allExercisesComplete){
      primaryAction={kind:"review",label:"Revisar y finalizar"};
    }else if(activeSet?.done){
      primaryAction={kind:"save_set_correction",label:"Guardar corrección"};
    }else if(exercise?.completedAt){
      primaryAction={
        kind:"next_pending",label:"Ir al siguiente pendiente",
        exerciseInstanceId:nextPendingExercise?.exerciseInstanceId||null
      };
    }else if(allSetsComplete&&!exercise?.completedAt){
      primaryAction={
        kind:"complete_exercise",
        label:nextPendingExercise
          ?"Completar ejercicio y continuar"
          :"Completar ejercicio y revisar"
      };
    }else if(sessionTimerStatus==="idle"&&!series.some(setHasResults)){
      primaryAction={kind:"start_session",label:"Empezar sesión"};
    }else{
      primaryAction={kind:"complete_set",label:"Completar serie"};
    }
    const previousExercise=exerciseIndex>0?exerciseRows[exerciseIndex-1]:null;
    const nextExercise=exerciseIndex>=0&&exerciseIndex<exerciseRows.length-1
      ?exerciseRows[exerciseIndex+1]
      :null;
    const saveLabel={
      saving:"Guardando…",saved:"Guardado",saved_local:"Guardado",
      pending_sync:"Pendiente",conflict:"Conflicto",
      local_error:"Error al guardar"
    }[saveStatus]||"Guardado";
    return {
      empty:!exercises.length,
      exercise,exerciseIndex,exerciseInstanceId,
      positionLabel:exercise?`Ejercicio ${exerciseIndex+1} de ${exercises.length}`:"Sin ejercicios",
      progress:{
        current:exercise?exerciseIndex+1:0,total:exercises.length,
        completed:exerciseRows.filter(row=>row.status==="completed").length
      },
      activeSet,activeSetIndex,
      completedSets,futureSets,allSetsComplete,allExercisesComplete,
      exerciseRows,previousExercise,nextExercise,nextPendingExercise,primaryAction,
      prescription:{
        sets:Number(exercise?.sets)||series.length,
        target:text(exercise?.target),
        targetRir:text(exercise?.targetRir),
        restSeconds:Math.max(0,Math.floor(finite(exercise?.restSeconds)||0))
      },
      libraryPending:Boolean(exercise&&!exercise?.resolvedLibraryExerciseId),
      notesPresent:Boolean(text(exercise?.notes)||text(exercise?.discomfort)),
      save:{status:saveStatus,label:offline?`Sin conexión · ${saveLabel.toLocaleLowerCase("es")}`:saveLabel},
      accessibleLabel:exercise
        ?`${exerciseRows[exerciseIndex].name}. ${exerciseIndex+1} de ${exercises.length}.`
        :"Esta sesión no tiene ejercicios."
    };
  }
  function reduceMobileWorkoutUi(state={},action={}){
    const current={
      panel:null,selectedSetInstanceId:null,
      completedExpanded:false,futureExpanded:false,restMinimized:false,
      ...clone(state)
    };
    switch(action.type){
      case "OPEN_PANEL":
        return {...current,panel:text(action.panel)||null};
      case "CLOSE_PANEL":
        return {...current,panel:null};
      case "SELECT_SET":
        return {...current,selectedSetInstanceId:text(action.setInstanceId)||null};
      case "CLEAR_SET":
        return {...current,selectedSetInstanceId:null};
      case "TOGGLE_COMPLETED":
        return {...current,completedExpanded:!current.completedExpanded};
      case "TOGGLE_FUTURE":
        return {...current,futureExpanded:!current.futureExpanded};
      case "TOGGLE_REST":
        return {...current,restMinimized:!current.restMinimized};
      default:
        return current;
    }
  }

  global.GymOSActiveWorkout=Object.freeze({
    MODEL_VERSION,REST_TIMER_VERSION,MAX_REST_TIMER_DURATION_SECONDS,
    exerciseIdentity,
    setHasResults,
    sessionElapsedModel,
    activeWorkoutHeaderModel,
    exerciseLibraryResolutionModel,
    googleExerciseReferenceModel,
    exerciseRecordType,
    exerciseMuscleModel,
    exerciseTechniqueModel,
    exerciseGuideModel,
    setEntryModel,
    manualExtraSetModel,
    setSeriesSummaryModel,
    exerciseDetailDisclosureModel,
    sessionTimerControlModel,
    validRestSeconds,effectiveRestSeconds,restTimerRemaining,
    buildRestTimerPayload,normalizeRestTimerPayload,restTimerBelongsTo,restTimerModel,
    shouldStartRestTimerAfterSetCompletion,
    workoutCompletionReviewModel,
    mobileWorkoutViewModel,
    reduceMobileWorkoutUi
  });
})(typeof window!=="undefined"?window:globalThis);
