(function(global){
  "use strict";

  const MODEL_VERSION="gymos-routines-experience-1";
  const STRUCTURED_EXPORT_VERSION="gymos-progress-export-1";
  const ROUTINE_JSON_VERSION="gymos-routine-import-1";
  const MAX_INPUT_CHARS=100000;
  const PERIODS=Object.freeze(["week","two_weeks","month","routine","custom"]);
  const PRIVATE_KEYS=new Set([
    "ownerId","workoutInstanceId","sessionId","clientInstanceId","draftId",
    "email","token","accessToken","refreshToken","syncMetadata"
  ]);
  const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  const text=value=>String(value??"").trim();
  const list=value=>Array.isArray(value)?value:[];
  const finite=value=>{
    const parsed=Number(String(value??"").replace(",","."));
    return Number.isFinite(parsed)?parsed:null;
  };
  const normalize=value=>text(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLocaleLowerCase("es").replace(/[^a-z0-9]+/g," ").trim();
  function stableStringify(value){
    if(Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    if(value&&typeof value==="object") return `{${Object.keys(value).sort().map(
      key=>`${JSON.stringify(key)}:${stableStringify(value[key])}`
    ).join(",")}}`;
    return JSON.stringify(value);
  }
  function stableHash(value){
    const source=stableStringify(value);
    let hash=2166136261;
    for(let index=0;index<source.length;index+=1){
      hash^=source.charCodeAt(index);
      hash=Math.imul(hash,16777619);
    }
    return (hash>>>0).toString(36);
  }
  function humanId(prefix,value){return `${prefix}-${stableHash(normalize(value)||value)}`;}
  function dangerousInput(value){
    return /<\s*script\b|<\s*iframe\b|javascript\s*:|on(?:error|load|click|focus)\s*=/i.test(value);
  }
  function cleanImportedText(value){return text(value).replace(/[<>]/g,character=>character==="<"?"‹":"›");}
  function numberRange(value){
    const match=text(value).match(/(\d+(?:[.,]\d+)?)\s*(?:[-–]\s*(\d+(?:[.,]\d+)?))?/);
    if(!match) return null;
    const min=finite(match[1]),max=finite(match[2]??match[1]);
    return min===null||max===null?null:{min,max};
  }
  function libraryMatch(name,library=[]){
    const key=normalize(name);
    if(!key) return {status:"missing",exerciseId:null,candidates:[]};
    const matches=list(library).filter(item=>[
      item?.name,...list(item?.aliases)
    ].some(value=>normalize(value)===key));
    if(matches.length===1) return {
      status:"matched",exerciseId:text(matches[0].id),
      name:text(matches[0].name)||cleanImportedText(name),candidates:[]
    };
    if(matches.length>1) return {
      status:"ambiguous",exerciseId:null,
      candidates:matches.slice(0,8).map(item=>({id:text(item.id),name:text(item.name)}))
    };
    return {status:"unmatched",exerciseId:null,candidates:[]};
  }
  function parsePrescription(value){
    const source=text(value);
    const setsMatch=source.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)(?:\s*[-–]\s*(\d+(?:[.,]\d+)?))?/i);
    const durationMatch=source.match(/(\d+(?:[.,]\d+)?)\s*(s|seg(?:undos?)?|min(?:utos?)?)/i);
    const distanceMatch=source.match(/(\d+(?:[.,]\d+)?)\s*(km|m)\b/i);
    const rirMatch=source.match(/\bRIR\s*[:=]?\s*(\d+(?:[.,]\d+)?)(?:\s*[-–]\s*(\d+(?:[.,]\d+)?))?/i);
    const restMatch=source.match(/(?:descanso|descansa|rest)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(s|seg(?:undos?)?|min(?:utos?)?)?/i);
    const sets=setsMatch?finite(setsMatch[1]):null;
    let target=null,recordType="weight_reps";
    if(setsMatch){
      target={type:"reps",min:finite(setsMatch[2]),max:finite(setsMatch[3]??setsMatch[2])};
    }else if(durationMatch){
      const amount=finite(durationMatch[1]);
      const seconds=/^min/i.test(durationMatch[2])?amount*60:amount;
      target={type:"duration",min:seconds,max:seconds};recordType="duration";
    }else if(distanceMatch){
      const amount=finite(distanceMatch[1]);
      const metres=distanceMatch[2].toLowerCase()==="km"?amount*1000:amount;
      target={type:"distance",min:metres,max:metres};recordType="distance";
    }
    const rir=rirMatch?{min:finite(rirMatch[1]),max:finite(rirMatch[2]??rirMatch[1])}:null;
    let restSeconds=null;
    if(restMatch){
      restSeconds=finite(restMatch[1]);
      if(/^min/i.test(restMatch[2]||"")) restSeconds*=60;
    }
    return {sets,target,targetRir:rir,restSeconds,recordType};
  }
  function importedExercise(name,prescription,library,notes=""){
    const safeName=cleanImportedText(name);
    const match=libraryMatch(safeName,library);
    const parsed=parsePrescription(prescription);
    return {
      exerciseId:match.exerciseId||humanId("imported-exercise",safeName),
      name:match.name||safeName,importedName:safeName,matchStatus:match.status,
      candidates:match.candidates,sets:parsed.sets,target:parsed.target,
      targetRir:parsed.targetRir,restSeconds:parsed.restSeconds,
      recordType:parsed.recordType,notes:cleanImportedText(notes),warmup:/\bcalentamiento\b/i.test(prescription),
      sourceText:cleanImportedText(prescription)
    };
  }
  function normalizeJsonRoutine(raw,library){
    const body=raw?.schemaVersion===ROUTINE_JSON_VERSION?raw.routine:(raw?.routine||raw);
    const sessions=list(body?.sessions).map((session,index)=>({
      id:text(session?.id||session?.sessionId)||humanId("imported-session",`${index}:${session?.name||session?.label}`),
      order:index+1,label:text(session?.label)||String.fromCharCode(65+index),
      name:cleanImportedText(session?.name||session?.label||`Sesión ${index+1}`),
      focus:cleanImportedText(session?.focus),notes:cleanImportedText(session?.notes),
      estimatedDurationMinutes:finite(session?.estimatedDurationMinutes??session?.durationMin),
      exercises:list(session?.exercises).map(item=>{
        if(typeof item==="string") return importedExercise(item,"",library);
        const prescription=item?.prescription||{};
        const imported=importedExercise(
          item?.name||"",
          [
            prescription.sets??item?.sets,
            prescription.target?.min??item?.target,
            prescription.targetRir?.min??item?.targetRir,
            prescription.restSeconds??item?.restSeconds
          ].filter(value=>value!==undefined&&value!==null).join(" "),library,item?.notes
        );
        return {
          ...imported,
          sets:finite(prescription.sets??item?.sets),
          target:clone(prescription.target??item?.target??null),
          targetRir:clone(prescription.targetRir??item?.targetRir??null),
          restSeconds:finite(prescription.restSeconds??item?.restSeconds),
          recordType:text(prescription.recordType||item?.recordType)||imported.recordType
        };
      })
    }));
    return {
      schemaVersion:ROUTINE_JSON_VERSION,
      name:cleanImportedText(body?.name)||"Rutina importada",
      objective:cleanImportedText(body?.objective||body?.goal||body?.focus),
      frequencyPerWeek:finite(body?.frequencyPerWeek),sessions,
      unknownFields:Object.keys(body||{}).filter(key=>![
        "name","objective","goal","focus","frequencyPerWeek","sessions","revision","startedAt"
      ].includes(key))
    };
  }
  function parseTextRoutine(source,library){
    const lines=source.replace(/\r/g,"").split("\n");
    const parsed={
      schemaVersion:ROUTINE_JSON_VERSION,name:"Rutina importada",objective:"",
      frequencyPerWeek:null,sessions:[],unknownFields:[]
    };
    let current=null;
    lines.forEach((raw,index)=>{
      const line=text(raw.replace(/^#{1,6}\s*/,""));
      if(!line) return;
      const objective=line.match(/^(?:objetivo|enfoque)\s*:\s*(.+)$/i);
      if(objective){parsed.objective=cleanImportedText(objective[1]);return;}
      const frequency=line.match(/^(?:frecuencia|días por semana)\s*:\s*(\d+)/i);
      if(frequency){parsed.frequencyPerWeek=finite(frequency[1]);return;}
      const routineName=line.match(/^(?:rutina|plan)\s*:\s*(.+)$/i);
      if(routineName){parsed.name=cleanImportedText(routineName[1]);return;}
      const session=line.match(/^sesi[oó]n\s+(.+)$/i);
      if(session){
        const label=cleanImportedText(session[1]);
        current={
          id:humanId("imported-session",`${parsed.sessions.length}:${label}`),
          order:parsed.sessions.length+1,label:label.length<=3?label:String.fromCharCode(65+parsed.sessions.length),
          name:`Sesión ${label}`,focus:"",notes:"",estimatedDurationMinutes:null,exercises:[]
        };
        parsed.sessions.push(current);return;
      }
      const exercise=line.match(/^[-*•]\s*([^:]+)(?::\s*(.+))?$/);
      if(exercise&&current){
        current.exercises.push(importedExercise(exercise[1],exercise[2]||"",library));return;
      }
      if(!current&&parsed.name==="Rutina importada"&&!/^(rutina|plan)\s*:/i.test(line)){
        parsed.name=cleanImportedText(line.replace(/^(rutina|plan)\s*:\s*/i,""));return;
      }
      parsed.unknownFields.push({line:index+1,text:cleanImportedText(line)});
    });
    return parsed;
  }
  function validateRoutineImport(parsed,{forActivation=false}={}){
    const errors=[],warnings=[];
    const sessions=list(parsed?.sessions);
    if(!sessions.length) errors.push({code:"routine_empty",message:"No se encontraron sesiones."});
    if(forActivation&&sessions.length<2) errors.push({code:"too_few_sessions",message:"Se necesitan al menos 2 sesiones para activar."});
    if(sessions.length>6) errors.push({code:"too_many_sessions",message:"No se pueden activar más de 6 sesiones."});
    sessions.forEach((session,sessionIndex)=>{
      if(!list(session?.exercises).length) errors.push({code:"session_empty",session:sessionIndex,message:`${session?.name||"La sesión"} no contiene ejercicios.`});
      list(session?.exercises).forEach((exercise,exerciseIndex)=>{
        if(!text(exercise?.name)) errors.push({code:"exercise_name",session:sessionIndex,exercise:exerciseIndex,message:"Falta el nombre de un ejercicio."});
        if(exercise?.sets===null) warnings.push({code:"sets_missing",session:sessionIndex,exercise:exerciseIndex,message:`${exercise?.name||"Ejercicio"}: series pendientes.`});
        if(!exercise?.target) warnings.push({code:"target_missing",session:sessionIndex,exercise:exerciseIndex,message:`${exercise?.name||"Ejercicio"}: objetivo pendiente.`});
        if(exercise?.sets!==null&&(exercise.sets<1||exercise.sets>20)) errors.push({code:"sets_range",message:`${exercise.name}: número de series no válido.`});
        if(exercise?.restSeconds!==null&&exercise.restSeconds<0) errors.push({code:"rest_range",message:`${exercise.name}: el descanso no puede ser negativo.`});
        const rir=exercise?.targetRir;
        if(rir&&(rir.min<0||rir.max>10||rir.min>rir.max)) errors.push({code:"rir_range",message:`${exercise.name}: RIR fuera de rango.`});
        if(exercise?.matchStatus==="ambiguous") warnings.push({code:"exercise_ambiguous",message:`${exercise.name}: ejercicio pendiente de identificar.`});
        if(exercise?.matchStatus==="unmatched") warnings.push({code:"exercise_unmatched",message:`${exercise.name}: se conservará el nombre importado.`});
      });
    });
    list(parsed?.unknownFields).forEach(item=>warnings.push({code:"unknown_field",message:`Línea ${item.line||""}: contenido no reconocido.`}));
    return {valid:errors.length===0,canPropose:errors.length===0&&sessions.length>=2&&sessions.length<=6,errors,warnings};
  }
  function parseRoutineImport(input,{library=[]}={}){
    const source=typeof input==="string"?input:text(input);
    if(!text(source)) return {status:"empty",parsed:null,errors:[{code:"input_empty",message:"Pega una rutina antes de analizarla."}],warnings:[]};
    if(source.length>MAX_INPUT_CHARS) return {status:"invalid",parsed:null,errors:[{code:"input_too_large",message:`El texto supera ${MAX_INPUT_CHARS} caracteres.`}],warnings:[]};
    if(dangerousInput(source)) return {status:"invalid",parsed:null,errors:[{code:"unsafe_content",message:"El contenido incluye HTML o scripts no permitidos."}],warnings:[]};
    let parsed,format="text";
    if(/^[\[{]/.test(source.trim())){
      format="json";
      try{parsed=normalizeJsonRoutine(JSON.parse(source),library);}
      catch(_){return {status:"invalid",parsed:null,format,errors:[{code:"invalid_json",message:"El JSON no está bien formado."}],warnings:[]};}
    }else{
      format=/^\s*#|\n\s*[-*•]\s/m.test(source)?"markdown":"text";
      parsed=parseTextRoutine(source,library);
    }
    const validation=validateRoutineImport(parsed,{forActivation:true});
    return {
      status:validation.valid?(validation.warnings.length?"warning":"valid"):"invalid",
      parsed,format,...validation
    };
  }
  function proposalSessionsFromImport(parsed){
    return list(parsed?.sessions).map((session,index)=>({
      id:text(session.id)||humanId("imported-session",`${index}:${session.name}`),
      order:index+1,label:text(session.label)||String.fromCharCode(65+index),
      name:text(session.name)||`Sesión ${index+1}`,focus:text(session.focus||parsed.objective),
      estimatedDurationMinutes:finite(session.estimatedDurationMinutes),notes:text(session.notes),
      exercises:list(session.exercises).map(exercise=>({
        exerciseId:text(exercise.exerciseId)||humanId("imported-exercise",exercise.name),
        name:text(exercise.name),notes:text(exercise.notes),pattern:"",role:"main",
        prescription:{
          sets:exercise.sets,target:clone(exercise.target),targetRir:clone(exercise.targetRir),
          restSeconds:exercise.restSeconds,recordType:text(exercise.recordType)||"weight_reps"
        }
      }))
    }));
  }
  function periodBounds(period,{now=Date.now(),routineStartedAt=null,customStart=null,customEnd=null}={}){
    const end=new Date(period==="custom"&&customEnd?customEnd:now);
    end.setHours(23,59,59,999);
    const start=new Date(end);
    if(period==="week") start.setDate(start.getDate()-6);
    else if(period==="two_weeks") start.setDate(start.getDate()-13);
    else if(period==="month") start.setDate(start.getDate()-29);
    else if(period==="routine"&&routineStartedAt) start.setTime(new Date(routineStartedAt).getTime());
    else if(period==="custom"&&customStart) start.setTime(new Date(customStart).getTime());
    else start.setDate(start.getDate()-13);
    start.setHours(0,0,0,0);
    return {start:start.toISOString(),end:end.toISOString()};
  }
  function safeWorkout(workout,options){
    return {
      date:text(workout?.date||workout?.completedAt),
      sessionName:text(workout?.sessionName||workout?.session||workout?.legacySessionKey)||"Sesión",
      completed:Boolean(workout?.completed??workout?.done??true),
      durationMs:options.includeDuration?finite(workout?.durationMs):null,
      completedSeries:finite(workout?.completedSeries),
      exercises:list(workout?.exercises).map(exercise=>({
        name:text(exercise?.name)||"Ejercicio",
        omitted:Boolean(exercise?.omitted),
        substitution:exercise?.substitution?{
          plannedExerciseName:text(exercise.substitution.plannedExerciseName),
          mode:text(exercise.substitution.mode)
        }:null,
        notes:options.includeNotes?text(exercise?.notes):"",
        discomfort:options.includeDiscomfort?text(exercise?.discomfort):"",
        series:list(exercise?.series).map((set,index)=>({
          number:index+1,weight:options.includeLoads?set?.weight??null:null,
          reps:options.includeLoads?set?.reps??null:null,
          rir:options.includeLoads?set?.rir??null:null,
          seconds:set?.seconds??null,distance:set?.distance??null,
          warmup:Boolean(set?.warmup),completed:Boolean(set?.done??true)
        }))
      }))
    };
  }
  function weekKey(value){
    const date=new Date(value);date.setHours(0,0,0,0);
    date.setDate(date.getDate()+3-((date.getDay()+6)%7));
    const first=new Date(date.getFullYear(),0,4);
    const week=1+Math.round(((date-first)/86400000-3+((first.getDay()+6)%7))/7);
    return `${date.getFullYear()}-W${String(week).padStart(2,"0")}`;
  }
  function buildExerciseEvolution(workouts){
    const groups=new Map();
    workouts.filter(item=>item.completed).forEach(workout=>workout.exercises.forEach(exercise=>{
      const completed=exercise.series.filter(set=>set.completed);
      const weights=completed.map(set=>finite(set.weight)).filter(value=>value!==null);
      const reps=completed.map(set=>finite(set.reps)).filter(value=>value!==null);
      const rirs=completed.map(set=>finite(set.rir)).filter(value=>value!==null);
      const row={date:workout.date,maxLoad:weights.length?Math.max(...weights):null,totalReps:reps.length?reps.reduce((sum,value)=>sum+value,0):null,averageRir:rirs.length?Math.round((rirs.reduce((sum,value)=>sum+value,0)/rirs.length)*10)/10:null};
      const key=normalize(exercise.name);if(!groups.has(key)) groups.set(key,{name:exercise.name,observations:[]});groups.get(key).observations.push(row);
    }));
    return [...groups.values()].map(group=>{
      const first=group.observations[0],last=group.observations[group.observations.length-1];
      return {...group,changes:{load:first.maxLoad!==null&&last.maxLoad!==null?last.maxLoad-first.maxLoad:null,repetitions:first.totalReps!==null&&last.totalReps!==null?last.totalReps-first.totalReps:null,rir:first.averageRir!==null&&last.averageRir!==null?Math.round((last.averageRir-first.averageRir)*10)/10:null}};
    });
  }
  function buildProgressExportViewModel({routine=null,history=[],recovery=[],ownerId=null,options={}}={}){
    const selected={
      period:PERIODS.includes(options.period)?options.period:"two_weeks",
      includeNotes:options.includeNotes!==false,includeDiscomfort:options.includeDiscomfort!==false,
      includeRecovery:Boolean(options.includeRecovery),includeDuration:options.includeDuration!==false,
      includeLoads:options.includeLoads!==false,includeMissed:options.includeMissed!==false,
      customStart:options.customStart||null,customEnd:options.customEnd||null
    };
    const bounds=periodBounds(selected.period,{
      now:options.now,routineStartedAt:routine?.startedAt||routine?.createdAt,
      customStart:selected.customStart,customEnd:selected.customEnd
    });
    const workouts=list(history).filter(item=>(!item?.ownerId||!ownerId||item.ownerId===ownerId))
      .filter(item=>{
        const date=new Date(item?.date||item?.completedAt).getTime();
        return Number.isFinite(date)&&date>=Date.parse(bounds.start)&&date<=Date.parse(bounds.end);
      }).sort((a,b)=>text(a.date).localeCompare(text(b.date),"en"))
      .map(item=>safeWorkout(item,selected));
    const sessions=list(routine?.sessions);
    const days=Math.max(1,Math.ceil((Date.parse(bounds.end)-Date.parse(bounds.start)+1)/86400000));
    const planned=Math.ceil(days/7)*sessions.length;
    const completed=workouts.filter(item=>item.completed).length;
    const completedWeeks=new Map();
    workouts.filter(item=>item.completed).forEach(item=>completedWeeks.set(weekKey(item.date),(completedWeeks.get(weekKey(item.date))||0)+1));
    const secondWeekComplete=sessions.length>0&&[...completedWeeks.values()].filter(count=>count>=sessions.length).length>=2;
    const recoveryRows=selected.includeRecovery?list(recovery).filter(item=>{
      const date=new Date(item?.date||item?.completedAt).getTime();
      return Number.isFinite(date)&&date>=Date.parse(bounds.start)&&date<=Date.parse(bounds.end);
    }).map(item=>({
      date:text(item.date||item.completedAt),status:text(item.result?.status||item.status),
      summary:text(item.result?.title||item.summary)
    })):[];
    return {
      schemaVersion:STRUCTURED_EXPORT_VERSION,
      routine:{name:text(routine?.name)||"Rutina activa",objective:text(routine?.objective||routine?.focus),sessionCount:sessions.length},
      period:{key:selected.period,start:bounds.start,end:bounds.end},options:selected,
      adherence:{planned,completed,missed:selected.includeMissed?Math.max(0,planned-completed):null,percentage:planned?Math.round((completed/planned)*100):0},
      workouts,evolution:buildExerciseEvolution(workouts),recovery:recoveryRows,secondWeekComplete,
      questions:list(options.questions).map(text).filter(Boolean),customQuestion:text(options.customQuestion)
    };
  }
  function formatDate(value){
    const date=new Date(value);
    return Number.isFinite(date.getTime())?date.toLocaleDateString("es-ES",{day:"numeric",month:"long",year:"numeric"}):"Sin fecha";
  }
  function markdownValue(value){return text(value).replace(/[<>]/g,"").replace(/\r?\n/g," ");}
  function buildChatGPTMarkdown(model){
    const lines=["# Revisión de entrenamiento","","## Contexto",`Rutina: ${markdownValue(model.routine.name)}`,`Periodo: ${formatDate(model.period.start)} – ${formatDate(model.period.end)}`];
    if(model.routine.objective) lines.push(`Objetivo: ${markdownValue(model.routine.objective)}`);
    lines.push("","## Adherencia",`Sesiones previstas: ${model.adherence.planned}`,`Sesiones completadas: ${model.adherence.completed}`);
    if(model.adherence.missed!==null) lines.push(`Sesiones no realizadas: ${model.adherence.missed}`);
    lines.push(`Adherencia: ${model.adherence.percentage} %`,"");
    if(!model.workouts.length) lines.push("## Entrenamientos","No hay entrenamientos en el periodo seleccionado.","");
    model.workouts.forEach(workout=>{
      lines.push(`## ${formatDate(workout.date)} · ${markdownValue(workout.sessionName)}`);
      lines.push(`Estado: ${workout.completed?"completada":"no finalizada"}`);
      if(workout.durationMs!==null) lines.push(`Duración: ${Math.round(workout.durationMs/60000)} min`);
      workout.exercises.forEach(exercise=>{
        lines.push("",`### ${markdownValue(exercise.name)}`);
        if(exercise.substitution?.plannedExerciseName) lines.push(`Sustitución de: ${markdownValue(exercise.substitution.plannedExerciseName)}`);
        exercise.series.forEach(set=>{
          const values=[];
          if(set.weight!==null&&set.weight!=="") values.push(`${set.weight} kg`);
          if(set.reps!==null&&set.reps!=="") values.push(`${set.reps} reps`);
          if(set.seconds!==null&&set.seconds!=="") values.push(`${set.seconds} s`);
          if(set.distance!==null&&set.distance!=="") values.push(`${set.distance} m`);
          if(set.rir!==null&&set.rir!=="") values.push(`RIR ${set.rir}`);
          if(set.warmup) values.push("calentamiento");
          lines.push(`- Serie ${set.number}: ${values.join(" · ")||"sin datos cuantitativos"}`);
        });
        if(exercise.notes) lines.push(`- Notas: ${markdownValue(exercise.notes)}`);
        if(exercise.discomfort) lines.push(`- Molestias: ${markdownValue(exercise.discomfort)}`);
      });
      lines.push("");
    });
    const comparable=list(model.evolution).filter(item=>item.observations.length>1);
    if(comparable.length){
      lines.push("## Evolución por ejercicio");
      comparable.forEach(item=>{
        lines.push("",`### ${markdownValue(item.name)}`);
        item.observations.forEach(row=>lines.push(`- ${formatDate(row.date)}: carga máxima ${row.maxLoad??"sin dato"} kg · repeticiones totales ${row.totalReps??"sin dato"} · RIR medio ${row.averageRir??"sin dato"}`));
        const changes=item.changes;lines.push(`- Cambio observado: carga ${changes.load??"sin dato"} kg · repeticiones ${changes.repetitions??"sin dato"} · RIR ${changes.rir??"sin dato"}`);
      });lines.push("");
    }
    if(model.recovery.length){
      lines.push("## Recuperación");
      model.recovery.forEach(item=>lines.push(`- ${formatDate(item.date)}: ${markdownValue(item.summary||item.status||"Registro disponible")}`));
      lines.push("");
    }
    const questions=[...model.questions,model.customQuestion].map(markdownValue).filter(Boolean);
    if(questions.length){
      lines.push("## Preguntas para ChatGPT");questions.forEach(item=>lines.push(`- ${item}`));
    }
    return lines.join("\n").trim()+"\n";
  }
  function stripPrivate(value){
    if(Array.isArray(value)) return value.map(stripPrivate);
    if(value&&typeof value==="object") return Object.fromEntries(Object.entries(value)
      .filter(([key])=>!PRIVATE_KEYS.has(key)).map(([key,item])=>[key,stripPrivate(item)]));
    return value;
  }
  function buildStructuredProgressExport(model){return stripPrivate(clone(model));}

  global.GymOSRoutinesExperience=Object.freeze({
    MODEL_VERSION,STRUCTURED_EXPORT_VERSION,ROUTINE_JSON_VERSION,MAX_INPUT_CHARS,PERIODS,
    normalize,stableStringify,parsePrescription,libraryMatch,parseRoutineImport,
    validateRoutineImport,proposalSessionsFromImport,periodBounds,
    buildProgressExportViewModel,buildChatGPTMarkdown,buildStructuredProgressExport
  });
})(typeof window!=="undefined"?window:globalThis);
