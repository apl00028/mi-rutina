(function(global){
  "use strict";

  const MODEL_VERSION="4.2.0-rc.2-active-workout";
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
    const selectedMatches=selectedExerciseId?items.filter(item=>item?.id===selectedExerciseId):[];
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
      index,number:index+1,timed:Boolean(timed),target:text(target),
      previous:previous?{
        weight:previous.weight??"",reps:previous.reps??"",rir:previous.rir??"",
        seconds:previous.seconds??""
      }:null,
      weight:row.weight??"",reps:row.reps??"",rir:row.rir??"",
      seconds:row.seconds??"",warmup:Boolean(row.warmup),done:Boolean(row.done),
      hasResults:setHasResults(row),canDelete:!row.done
    };
  }
  function restTimerModel({seconds=0,running=false,defaultSeconds=90}={}){
    const remaining=Math.max(0,Math.floor(finite(seconds)||0));
    const fallback=Math.max(0,Math.floor(finite(defaultSeconds)||0));
    return {remainingSeconds:remaining,running:Boolean(running&&remaining>0),defaultSeconds:fallback,finished:Boolean(running&&remaining===0)};
  }
  function workoutCompletionReviewModel({exercises=[],elapsedMs=0}={}){
    const rows=list(exercises).map((exercise,index)=>{
      const sets=list(exercise?.series);
      const completedSets=sets.filter(set=>set?.done).length;
      const startedSets=sets.filter(setHasResults).length;
      const note=text(exercise?.notes);
      const status=completedSets===sets.length&&sets.length
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

  global.GymOSActiveWorkout=Object.freeze({
    MODEL_VERSION,
    exerciseIdentity,
    setHasResults,
    sessionElapsedModel,
    activeWorkoutHeaderModel,
    exerciseLibraryResolutionModel,
    exerciseMuscleModel,
    exerciseTechniqueModel,
    exerciseGuideModel,
    setEntryModel,
    restTimerModel,
    workoutCompletionReviewModel
  });
})(typeof window!=="undefined"?window:globalThis);
