(function(){
  const STORAGE_KEY="gymos:workoutAnalyses";
  const STATUS_LABELS={
    clear_progression:"Progresión clara",
    moderate_progression:"Progresión moderada",
    stable:"Estable",
    excessive_effort:"Esfuerzo excesivo",
    lower_performance:"Rendimiento inferior",
    insufficient_data:"Datos insuficientes",
    discomfort:"Molestia registrada"
  };
  const ACTION_LABELS={
    increase:"Subir carga",
    maintain:"Mantener carga",
    reduce:"Reducir carga",
    change_range:"Cambiar rango",
    review:"Revisar ejercicio"
  };

  function number(value){
    if(value===null||value===undefined||value==="") return null;
    const parsed=Number(String(value).replace(",","."));
    return Number.isFinite(parsed)?parsed:null;
  }
  function normalizeName(value){
    return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase();
  }
  function parseRange(value){
    const values=(String(value||"").match(/\d+(?:[.,]\d+)?/g)||[]).map(number).filter(item=>item!==null);
    if(!values.length) return null;
    return {min:values[0],max:values[1]??values[0]};
  }
  function parseTargetRir(value){
    const range=parseRange(value);
    return range?{min:Math.min(range.min,range.max),max:Math.max(range.min,range.max)}:null;
  }
  function effectiveSeries(exercise){
    return (exercise?.series||[]).filter(set=>!set?.warmup);
  }
  function completedSeries(exercise){
    return effectiveSeries(exercise).filter(set=>Boolean(set?.done));
  }
  function seriesMetrics(exercise){
    const completed=completedSeries(exercise);
    const resistance=completed.map(set=>({
      weight:number(set.weight),reps:number(set.reps),rir:number(set.rir),
      seconds:number(set.seconds),distance:number(set.distance)
    }));
    const validVolume=resistance.filter(set=>set.weight!==null&&set.reps!==null);
    const validReps=resistance.filter(set=>set.reps!==null);
    const validTime=resistance.filter(set=>set.seconds!==null);
    const rirValues=resistance.map(set=>set.rir).filter(value=>value!==null);
    return {
      plannedSets:Number(exercise?.sets)||effectiveSeries(exercise).length,
      completedSets:completed.length,
      volume:validVolume.reduce((sum,set)=>sum+set.weight*set.reps,0),
      totalReps:validReps.reduce((sum,set)=>sum+set.reps,0),
      maxWeight:validVolume.length?Math.max(...validVolume.map(set=>set.weight)):null,
      reps:validReps.map(set=>set.reps),
      seconds:validTime.reduce((sum,set)=>sum+set.seconds,0),
      distance:resistance.filter(set=>set.distance!==null).reduce((sum,set)=>sum+set.distance,0),
      rirValues,
      averageRir:rirValues.length?rirValues.reduce((sum,value)=>sum+value,0)/rirValues.length:null,
      validSetCount:validVolume.length||validReps.length||validTime.length,
      hasResistanceData:validVolume.length>0,
      hasRepData:validReps.length>0,
      hasTimeData:validTime.length>0
    };
  }
  function comparableExercise(current,previous){
    if(normalizeName(current?.name)!==normalizeName(previous?.name)) return false;
    const variantA=normalizeName(current?.variant),variantB=normalizeName(previous?.variant);
    if(variantA&&variantB&&variantA!==variantB) return false;
    const equipmentA=normalizeName(current?.equipment),equipmentB=normalizeName(previous?.equipment);
    if(equipmentA&&equipmentB&&equipmentA!==equipmentB) return false;
    const typeA=normalizeName(current?.type),typeB=normalizeName(previous?.type);
    return !(typeA&&typeB&&typeA!==typeB);
  }
  function previousComparableWorkout(workout,history){
    return (history||[])
      .filter(item=>String(item.id)!==String(workout.id)&&item.session===workout.session&&new Date(item.date)<new Date(workout.date))
      .sort((a,b)=>new Date(b.date)-new Date(a.date))[0]||null;
  }
  function percentChange(current,previous){
    return previous>0?((current-previous)/previous)*100:null;
  }
  function minimumIncrementText(exercise,metrics){
    const increment=number(exercise?.increment);
    if(increment&&metrics.maxWeight!==null){
      return `Subir al siguiente incremento configurado: ${format(metrics.maxWeight+increment)} kg.`;
    }
    if(/tiempo|time/.test(String(exercise?.type||"").toLowerCase())) return "Aumentar ligeramente el tiempo manteniendo el margen previsto.";
    return "Subir el mínimo disponible para este ejercicio y volver a la parte baja del rango.";
  }
  function format(value){
    return String(Math.round(Number(value)*10)/10).replace(".",",");
  }
  function analyzeExercise(exercise,previousExercise){
    const current=seriesMetrics(exercise);
    const previous=previousExercise?seriesMetrics(previousExercise):null;
    const techniques=[...new Set(completedSeries(exercise).flatMap(set=>[
      set?.dropset?"dropset":null,set?.restPause?"rest_pause":null,
      set?.unilateral?"unilateral":null,String(set?.technique||"").trim()||null
    ]).filter(Boolean))];
    const range=parseRange(exercise?.target);
    const targetRir=parseTargetRir(exercise?.targetRir);
    const discomfort=String(exercise?.discomfort||"").trim();
    const completedAll=current.plannedSets>0&&current.completedSets>=current.plannedSets;
    const rangeSets=range&&current.reps.length?current.reps.filter(reps=>reps>=range.min&&reps<=range.max).length:0;
    const rangeCompliance=range&&current.reps.length?rangeSets/current.reps.length:null;
    const reachedTop=Boolean(range&&current.reps.length&&current.reps.length>=current.plannedSets&&current.reps.every(reps=>reps>=range.max));
    const rirOnTarget=Boolean(targetRir&&current.averageRir!==null&&current.averageRir>=targetRir.min&&current.averageRir<=targetRir.max);
    const repDrop=current.reps.length>1&&current.reps[0]>0
      ?(current.reps[0]-current.reps.at(-1))/current.reps[0]
      :0;
    const volumeChange=previous?percentChange(current.volume,previous.volume):null;
    const repsChange=previous?current.totalReps-previous.totalReps:null;
    const loadChange=previous&&current.maxWeight!==null&&previous.maxWeight!==null?current.maxWeight-previous.maxWeight:null;
    const rirChange=previous&&current.averageRir!==null&&previous.averageRir!==null?current.averageRir-previous.averageRir:null;
    const improved=Boolean(previous&&(
      (volumeChange!==null&&volumeChange>2)||
      (repsChange!==null&&repsChange>0)||
      (loadChange!==null&&loadChange>0)||
      (current.seconds>0&&current.seconds>previous.seconds)||
      (current.distance>0&&current.distance>previous.distance)
    ));
    let status="insufficient_data",action="maintain",recommendation="Registrar series, repeticiones y RIR para poder comparar.";

    if(discomfort){
      status="discomfort";action="review";
      recommendation="Revisar técnica, rango de movimiento o sustitución del ejercicio antes de progresar.";
    }else if(!current.completedSets||!current.validSetCount){
      status="insufficient_data";action="maintain";
      recommendation="Completar y registrar las series efectivas antes de decidir una progresión.";
    }else if((targetRir&&current.averageRir!==null&&current.averageRir<=1&&targetRir.min>=3)||repDrop>=.25){
      status="excessive_effort";action=repDrop>=.35?"reduce":"maintain";
      recommendation=action==="reduce"
        ?"Reducir ligeramente la carga y recuperar el margen previsto."
        :"Mantener la carga y recuperar el margen de RIR previsto.";
    }else if(previous&&((volumeChange!==null&&volumeChange< -10)||(repsChange!==null&&repsChange< -Math.max(2,current.plannedSets)))&&rangeCompliance!==1){
      status="lower_performance";action="maintain";
      recommendation="Revisar recuperación, descanso y carga utilizada antes de modificar el plan.";
    }else if(previous&&reachedTop&&completedAll&&rirOnTarget&&(volumeChange===null||volumeChange>=-2)){
      status="clear_progression";action="increase";
      recommendation=minimumIncrementText(exercise,current);
    }else if(improved&&(!targetRir||current.averageRir===null||current.averageRir>=targetRir.min-1)){
      status="moderate_progression";action="maintain";
      recommendation="Mantener la carga e intentar completar más repeticiones dentro del rango.";
    }else if(rangeCompliance!==null&&rangeCompliance>=.7&&completedAll){
      status="stable";action="maintain";
      recommendation="Repetir la carga y consolidar el rango con el RIR previsto.";
    }else if(!previous){
      status="stable";action="maintain";
      recommendation="Usar esta sesión como referencia y repetir condiciones comparables.";
    }else{
      status="lower_performance";action="maintain";
      recommendation="Repetir la carga y revisar recuperación antes de progresar.";
    }

    const missing=[];
    if(!targetRir) missing.push("target_rir");
    if(current.averageRir===null) missing.push("actual_rir");
    if(!range) missing.push("rep_range");
    if(!previous) missing.push("previous_session");
    if(exercise?.discomfort===undefined) missing.push("discomfort");
    return {
      exercise:exercise?.name||"Ejercicio",
      variant:exercise?.variant||null,
      equipment:exercise?.equipment||null,
      status,status_label:STATUS_LABELS[status],
      planned_sets:current.plannedSets,completed_sets:current.completedSets,
      target_range:range,target_rir:targetRir,average_rir:current.averageRir,
      range_compliance:rangeCompliance,
      current:{volume:current.volume,total_reps:current.totalReps,max_weight:current.maxWeight,seconds:current.seconds,distance:current.distance,reps:current.reps},
      previous:previous?{volume:previous.volume,total_reps:previous.totalReps,max_weight:previous.maxWeight,seconds:previous.seconds,distance:previous.distance,reps:previous.reps}:null,
      changes:{volume_percent:volumeChange,repetitions:repsChange,load:loadChange,rir:rirChange,seconds:previous?current.seconds-previous.seconds:null,distance:previous?current.distance-previous.distance:null},
      discomfort:discomfort||null,notes:String(exercise?.notes||"").trim()||null,
      special_techniques:techniques,
      missing_data:missing,action,action_label:ACTION_LABELS[action],recommendation
    };
  }
  function overallCopy(status,results){
    const progressed=results.filter(item=>["clear_progression","moderate_progression"].includes(item.status));
    const maintain=results.filter(item=>item.action==="maintain");
    const first=progressed[0],hold=maintain.find(item=>item.exercise!==first?.exercise);
    const copies={
      excellent:["Excelente sesión","Completaste la sesión con margen y señales claras de progresión."],
      good_progression:["Buena sesión de progresión",first?`Mejoraste en ${first.exercise}.`:"La sesión avanzó en la dirección prevista."],
      productive:["Sesión productiva","Completaste trabajo útil y mantuviste una referencia sólida."],
      demanding:["Sesión exigente","El esfuerzo fue superior al margen previsto en parte de la sesión."],
      below_expected:["Sesión por debajo de lo esperado","El rendimiento quedó por debajo de referencias comparables."],
      limited:["Análisis limitado","Faltan datos para valorar la sesión con suficiente fiabilidad."]
    };
    const [title,lead]=copies[status];
    return {title,message:`${lead}${hold?` Conviene ${hold.recommendation.charAt(0).toLowerCase()+hold.recommendation.slice(1)}`:""}`};
  }
  function analyzeWorkout(workout,history=[],options={}){
    const previousWorkout=previousComparableWorkout(workout,history);
    const previousExercises=previousWorkout?.exercises||[];
    const results=(workout?.exercises||[]).map(exercise=>{
      const previous=previousExercises.find(item=>comparableExercise(exercise,item));
      return analyzeExercise(exercise,previous);
    });
    const planned=results.length;
    const completed=results.filter(item=>item.completed_sets>=item.planned_sets&&item.planned_sets>0).length;
    const completion=planned?completed/planned:0;
    const progression=results.filter(item=>["clear_progression","moderate_progression"].includes(item.status)).length;
    const excessive=results.filter(item=>item.status==="excessive_effort").length;
    const inferior=results.filter(item=>item.status==="lower_performance").length;
    const discomfort=results.filter(item=>item.status==="discomfort");
    const insufficient=results.filter(item=>item.status==="insufficient_data").length;
    const currentComparableVolume=results.filter(item=>item.previous&&item.current.volume>0).reduce((sum,item)=>sum+item.current.volume,0);
    const previousComparableVolume=results.filter(item=>item.previous&&item.previous.volume>0).reduce((sum,item)=>sum+item.previous.volume,0);
    const volumeChange=percentChange(currentComparableVolume,previousComparableVolume);
    const warnings=[];
    if(!previousWorkout) warnings.push({code:"first_session",message:"Primera sesión comparable: se crea una referencia inicial."});
    const missingRir=results.filter(item=>item.missing_data.includes("actual_rir")).length;
    if(missingRir) warnings.push({code:"missing_rir",message:"Análisis limitado: faltan datos de RIR."});
    if(results.some(item=>item.missing_data.includes("discomfort"))) warnings.push({code:"missing_discomfort",message:"Las sesiones antiguas no tienen un campo específico de molestias."});
    discomfort.forEach(item=>warnings.push({code:"discomfort",exercise:item.exercise,message:`Molestia registrada en ${item.exercise}.`}));
    const duration=Number(workout?.durationMs||0);
    const comparableDurations=(history||[]).filter(item=>item.session===workout.session&&String(item.id)!==String(workout.id)).slice(0,5).map(item=>Number(item.durationMs||0)).filter(Boolean);
    if(duration&&comparableDurations.length){
      const average=comparableDurations.reduce((sum,value)=>sum+value,0)/comparableDurations.length;
      if(duration<average*.5||duration>average*1.8) warnings.push({code:"unusual_duration",message:"La duración fue poco habitual respecto a sesiones comparables."});
    }
    const recovery=options.recovery||null;
    if(recovery&&Number(recovery.recoveryScore)<45) warnings.push({code:"low_recovery",message:"La recuperación registrada era baja; interpreta el rendimiento con contexto."});
    let overall="productive";
    if(!planned||insufficient>planned/2) overall="limited";
    else if(completion<.6||inferior>=Math.max(2,Math.ceil(planned/2))) overall="below_expected";
    else if(excessive||discomfort.length||recovery&&Number(recovery.recoveryScore)<45) overall="demanding";
    else if(completion>=.95&&progression>=Math.max(1,Math.ceil(planned/2))&&!missingRir) overall="excellent";
    else if(completion>=.8&&progression) overall="good_progression";
    const copy=overallCopy(overall,results);
    const nextActions=results.map(item=>({
      exercise:item.exercise,action:item.action,label:item.action_label,
      recommendation:item.recommendation,requires_confirmation:true
    }));
    return {
      overall_status:overall,
      completed_exercises:completed,planned_exercises:planned,
      completed_series:results.reduce((sum,item)=>sum+item.completed_sets,0),
      planned_series:results.reduce((sum,item)=>sum+item.planned_sets,0),
      volume_change_percent:volumeChange,
      previous_workout_id:previousWorkout?String(previousWorkout.id):null,
      duration_ms:duration||null,recovery:recovery?{score:recovery.recoveryScore??null}:null,
      exercise_results:results,warnings,next_session_actions:nextActions,
      short_title:copy.title,short_message:copy.message
    };
  }
  function normalizeAnalysis(item){
    return {
      id:String(item?.id||`workout-analysis-${item?.workoutId??item?.workout_id}`),
      workoutId:String(item?.workoutId??item?.workout_id??""),
      workoutDate:item?.workoutDate??item?.workout_date??item?.createdAt??item?.created_at??new Date().toISOString(),
      overallStatus:item?.overallStatus??item?.overall_status??item?.structuredAnalysis?.overall_status??item?.structured_analysis?.overall_status??"limited",
      shortTitle:item?.shortTitle??item?.short_title??"Análisis de sesión",
      shortMessage:item?.shortMessage??item?.short_message??"",
      structuredAnalysis:item?.structuredAnalysis??item?.structured_analysis??{},
      aiMessage:item?.aiMessage??item?.ai_message??null,
      analysisSource:item?.analysisSource??item?.analysis_source??"rules",
      createdAt:item?.createdAt??item?.created_at??new Date().toISOString(),
      updatedAt:item?.updatedAt??item?.updated_at??item?.createdAt??item?.created_at??new Date().toISOString()
    };
  }
  function getAnalyses(){
    try{
      const data=JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]");
      return (Array.isArray(data)?data:[]).map(normalizeAnalysis).filter(item=>item.workoutId).sort((a,b)=>new Date(b.workoutDate)-new Date(a.workoutDate));
    }catch(error){return [];}
  }
  function saveAnalyses(items,mark=true){
    const normalized=(items||[]).map(normalizeAnalysis).filter(item=>item.workoutId);
    const unique=[...new Map(normalized.map(item=>[item.workoutId,item])).values()].sort((a,b)=>new Date(b.workoutDate)-new Date(a.workoutDate));
    localStorage.setItem(STORAGE_KEY,JSON.stringify(unique.slice(0,300)));
    if(mark&&typeof markLocalUpdated==="function") markLocalUpdated();
    return unique;
  }
  function mergeAnalyses(items,mark=true){
    const merged=new Map(getAnalyses().map(item=>[item.workoutId,item]));
    (items||[]).map(normalizeAnalysis).forEach(item=>{
      const current=merged.get(item.workoutId);
      if(!current||new Date(item.updatedAt)>=new Date(current.updatedAt)) merged.set(item.workoutId,item);
    });
    return saveAnalyses([...merged.values()],mark);
  }
  function getForWorkout(workoutId){
    return getAnalyses().find(item=>item.workoutId===String(workoutId))||null;
  }
  function analyzeAndSave(workout,{force=false}={}){
    if(!workout?.id) return null;
    const existing=getForWorkout(workout.id);
    if(existing&&!force) return existing;
    const recovery=window.GymOSRecovery?.entryForDate?.(String(workout.date||"").slice(0,10))||null;
    const structured=analyzeWorkout(workout,typeof getHistory==="function"?getHistory():[],{recovery});
    const now=new Date().toISOString();
    const item=normalizeAnalysis({
      id:existing?.id||`workout-analysis-${workout.id}`,workoutId:workout.id,workoutDate:workout.date,
      overallStatus:structured.overall_status,shortTitle:structured.short_title,shortMessage:structured.short_message,
      structuredAnalysis:structured,analysisSource:"rules",createdAt:existing?.createdAt||now,updatedAt:now
    });
    mergeAnalyses([item]);
    return item;
  }
  function ensureAnalyses(workouts){
    const history=Array.isArray(workouts)?workouts:[];
    const existing=getAnalyses();
    const known=new Set(existing.map(item=>item.workoutId));
    const created=history.filter(workout=>workout?.id&&!known.has(String(workout.id))).map(workout=>{
      const recovery=window.GymOSRecovery?.entryForDate?.(String(workout.date||"").slice(0,10))||null;
      const structured=analyzeWorkout(workout,history,{recovery});
      const now=new Date().toISOString();
      return normalizeAnalysis({
        id:`workout-analysis-${workout.id}`,workoutId:workout.id,workoutDate:workout.date,
        overallStatus:structured.overall_status,shortTitle:structured.short_title,
        shortMessage:structured.short_message,structuredAnalysis:structured,
        analysisSource:"rules",createdAt:now,updatedAt:now
      });
    });
    return created.length?saveAnalyses([...existing,...created]):existing;
  }
  function deleteForWorkout(workoutId){
    saveAnalyses(getAnalyses().filter(item=>item.workoutId!==String(workoutId)));
    const client=typeof getSupabaseClient==="function"?getSupabaseClient():null;
    if(client&&typeof isAppAuthenticated==="function"&&isAppAuthenticated()){
      client.from("workout_analyses").delete().eq("workout_id",String(workoutId)).eq("user_id",state.syncUser.id).then(({error})=>{if(error&&!["42P01","PGRST205"].includes(error.code))console.error("Workout analysis deletion",error);});
    }
  }
  function minimalAiPayload(structured){
    return {
      overall_status:structured?.overall_status||"limited",
      short_title:structured?.short_title||"Análisis de sesión",
      short_message:structured?.short_message||"",
      exercise_results:(structured?.exercise_results||[]).map(result=>({
        exercise:result.exercise,
        load:result.current?.max_weight??null,
        repetitions:result.current?.reps||[],
        rir:result.average_rir??null,
        status:result.status,
        recommendation:result.recommendation,
        action:result.action
      }))
    };
  }
  async function requestAiNarrative(item){
    const settings=typeof getCoachSettings==="function"?getCoachSettings():{};
    if(!settings.aiEnabled) throw new Error("Los mensajes de IA están desactivados.");
    if(!settings.backendUrl) throw new Error("Configura primero el backend seguro del Coach.");
    const data=typeof coachBackendFetch==="function"
      ?await coachBackendFetch("/workout-analysis",{
        method:"POST",body:JSON.stringify({workout_analysis:minimalAiPayload(item.structuredAnalysis)})
      })
      :await (async()=>{
        const response=await fetch(`${settings.backendUrl.replace(/\/$/,"")}/workout-analysis`,{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({workout_analysis:minimalAiPayload(item.structuredAnalysis)})
        });
        if(!response.ok) throw new Error("El backend no pudo redactar el análisis.");
        return response.json();
      })();
    const message=String(data.message||data.analysis||"").trim();
    if(!message) throw new Error("La IA no devolvió una explicación.");
    const updated={
      ...item,aiMessage:message,
      analysisSource:data.analysis_source==="local_fallback"?"local_fallback":"ai",
      updatedAt:new Date().toISOString()
    };
    mergeAnalyses([updated]);
    return updated;
  }
  async function maybeGenerateAiNarrative(item,{force=false}={}){
    const settings=typeof getCoachSettings==="function"?getCoachSettings():{};
    if(!settings.aiEnabled||!item) return item;
    if(!force&&item.aiMessage&&["ai","local_fallback"].includes(item.analysisSource)) return item;
    try{
      return await requestAiNarrative(item);
    }catch(error){
      console.warn("Coach AI unavailable; local rules retained.",error);
      const fallback={
        ...item,analysisSource:"local_fallback",
        updatedAt:new Date().toISOString()
      };
      mergeAnalyses([fallback]);
      return fallback;
    }
  }
  async function syncWithSupabase(){
    const client=typeof getSupabaseClient==="function"?getSupabaseClient():null;
    if(!client||typeof isAppAuthenticated!=="function"||!isAppAuthenticated()) return;
    const {data,error}=await client.from("workout_analyses").select("*").eq("user_id",state.syncUser.id);
    if(error){
      if(["42P01","PGRST205"].includes(error.code)){console.warn("Workout analyses table is not installed; using user sync payload.");return;}
      throw error;
    }
    const remote=(data||[]).map(normalizeAnalysis);
    const merged=mergeAnalyses(remote,false);
    if(!merged.length) return;
    const rows=merged.map(item=>({
      id:item.id,user_id:state.syncUser.id,workout_id:item.workoutId,
      overall_status:item.overallStatus,short_title:item.shortTitle,short_message:item.shortMessage,
      structured_analysis:item.structuredAnalysis,ai_message:item.aiMessage,
      analysis_source:item.analysisSource,created_at:item.createdAt,updated_at:item.updatedAt
    }));
    const {error:writeError}=await client.from("workout_analyses").upsert(rows,{onConflict:"user_id,workout_id"});
    if(writeError&&!["42P01","PGRST205"].includes(writeError.code)) throw writeError;
  }

  window.GymOSWorkoutAnalysis={
    STORAGE_KEY,STATUS_LABELS,ACTION_LABELS,
    analyzeWorkout,analyzeAndSave,ensureAnalyses,getAnalyses,getForWorkout,
    saveAnalyses,mergeAnalyses,deleteForWorkout,minimalAiPayload,
    requestAiNarrative,maybeGenerateAiNarrative,syncWithSupabase
  };
})();
