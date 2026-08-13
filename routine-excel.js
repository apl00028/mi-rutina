(function(global){
  "use strict";

  const TEMPLATE_VERSION=2;
  const SCHEMA_VERSION="4.2";
  const MAX_TOTAL_CELLS=32000;
  const MAX_CELL_LENGTH=4000;
  const TARGET_TYPES=Object.freeze(["repeticiones","duracion"]);
  const SESSION_COLUMNS=Object.freeze([
    {key:"session",header:"Sesión",required:true},
    {key:"order",header:"Orden",required:true},
    {key:"name",header:"Nombre",required:true},
    {key:"focus",header:"Enfoque",required:false},
    {key:"duration",header:"Duración estimada (min)",required:false},
    {key:"notes",header:"Notas de sesión",required:false},
    {key:"sessionId",header:"_GymOS session",required:false,hidden:true}
  ]);
  const ROUTINE_COLUMNS=Object.freeze([
    {key:"session",header:"Sesión",required:true},
    {key:"order",header:"Orden",required:true},
    {key:"exercise",header:"Ejercicio",required:true},
    {key:"sets",header:"Series",required:true},
    {key:"targetType",header:"Tipo de objetivo",required:true},
    {key:"targetMin",header:"Objetivo mínimo",required:true},
    {key:"targetMax",header:"Objetivo máximo",required:false},
    {key:"rirMin",header:"RIR mínimo",required:true},
    {key:"rirMax",header:"RIR máximo",required:false},
    {key:"restSeconds",header:"Descanso (s)",required:true},
    {key:"notes",header:"Notas",required:false},
    {key:"exerciseId",header:"_GymOS exercise",required:false,hidden:true}
  ]);
  const LIBRARY_COLUMNS=Object.freeze([
    "_GymOS exercise","Ejercicio","Alias","Patrón","Subpatrón",
    "Músculos principales","Músculos secundarios","Equipamiento técnico",
    "Grupo visible","Equipamiento visible","Tipo","Notas"
  ]);
  const LEGACY_HEADERS=Object.freeze([
    "sesion","orden","ejercicio","series","reps min","reps max","incremento kg","tipo"
  ]);

  function text(value){return String(value??"").trim();}
  function list(value){return Array.isArray(value)?value:[];}
  function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
  function token(value){
    return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLowerCase().replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
  }
  function columnName(index){
    let value=Number(index)+1,output="";
    while(value>0){
      value-=1;
      output=String.fromCharCode(65+(value%26))+output;
      value=Math.floor(value/26);
    }
    return output;
  }
  function location(sheet,row,columnIndex,column){
    const numericRow=Number(row)||null;
    const numericColumn=Number.isInteger(columnIndex)?columnIndex:null;
    return {
      sheet:text(sheet)||null,
      row:numericRow,
      column:text(column)||null,
      cell:numericRow&&numericColumn!==null?`${columnName(numericColumn)}${numericRow}`:null
    };
  }
  function issue(code,message,{
    severity="error",sheet=null,row=null,columnIndex=null,column=null,cell=null,value=null,help=null,
    originalName=null,canonicalName=null,exerciseId=null
  }={}){
    const resolvedLocation=location(sheet,row,columnIndex,column);
    if(cell) resolvedLocation.cell=text(cell);
    const result={
      code,severity,message,
      location:resolvedLocation,
      value:value===null?null:text(value).slice(0,160),
      help:text(help)||null
    };
    if(originalName!==null) result.originalName=text(originalName).slice(0,160);
    if(canonicalName!==null) result.canonicalName=text(canonicalName).slice(0,160);
    if(exerciseId!==null) result.exerciseId=text(exerciseId).slice(0,120);
    return result;
  }
  function headerMap(row,columns){
    const byHeader=new Map(columns.map((column,index)=>[token(column.header),{...column,index}]));
    const indexes={},unknown=[],duplicates=[];
    list(row).forEach((value,index)=>{
      const definition=byHeader.get(token(value));
      if(!definition){
        if(text(value)) unknown.push({index,header:text(value)});
        return;
      }
      if(indexes[definition.key]!==undefined){
        duplicates.push({key:definition.key,index,header:text(value)});
        return;
      }
      indexes[definition.key]=index;
    });
    const missing=columns.filter(column=>column.required&&indexes[column.key]===undefined);
    return {valid:missing.length===0&&duplicates.length===0,indexes,missing,duplicates,unknown};
  }
  function rowsToRecords(sheet,columns){
    const rows=list(sheet?.rows);
    const errors=[];
    if(!rows.length){
      return {records:[],errors:[issue("empty_sheet","La hoja no contiene datos.",{sheet:sheet?.name})]};
    }
    const headers=headerMap(rows[0],columns);
    headers.missing.forEach(column=>errors.push(issue(
      "missing_header",`Falta la columna obligatoria ${column.header}.`,
      {sheet:sheet.name,row:1,column:column.header}
    )));
    headers.duplicates.forEach(column=>errors.push(issue(
      "duplicate_header",`La columna ${column.header} está repetida.`,
      {sheet:sheet.name,row:1,columnIndex:column.index,column:column.header}
    )));
    if(errors.length) return {records:[],errors};
    const records=[];
    rows.slice(1).forEach((row,index)=>{
      if(!list(row).some(value=>text(value))) return;
      const record={__rowNumber:index+2,__locations:{}};
      columns.forEach(column=>{
        const columnIndex=headers.indexes[column.key];
        record[column.key]=columnIndex===undefined?"":row[columnIndex];
        record.__locations[column.key]=location(sheet.name,index+2,columnIndex,column.header);
      });
      records.push(record);
    });
    return {records,errors};
  }
  function workbookSheet(workbook,name){
    return list(workbook?.sheets).find(sheet=>token(sheet?.name)===token(name))||null;
  }
  function metadataValue(workbook,key){
    const sheet=workbookSheet(workbook,"_GymOS");
    const row=list(sheet?.rows).find(item=>token(item?.[0])===token(key));
    return text(row?.[1]);
  }
  function isLegacyWorkbook(workbook){
    const sheet=workbookSheet(workbook,"Rutina");
    const headers=list(sheet?.rows?.[0]).map(token).filter(Boolean);
    return LEGACY_HEADERS.every(header=>headers.includes(header));
  }
  function finiteInteger(value,min,max){
    const number=Number(value);
    return Number.isInteger(number)&&number>=min&&number<=max?number:null;
  }
  function finiteNumber(value,min,max){
    const number=Number(value);
    return Number.isFinite(number)&&number>=min&&number<=max?number:null;
  }
  function normalizedTargetType(value){
    const normalized=token(value);
    if(["repeticiones","repeticion","reps","rep"].includes(normalized)) return "repeticiones";
    if(["duracion","tiempo","segundos","seconds","duration"].includes(normalized)) return "duracion";
    return null;
  }
  function builtInLibraryRows(){
    const catalog=global.GymOSBuiltInExerciseCatalog?.get?.();
    const metadata=global.GymOSExerciseDomain?.LEGACY_EXERCISE_METADATA;
    if(!Array.isArray(catalog)||!metadata) throw new Error("GymOS canonical exercise catalog is required.");
    return catalog.map(exercise=>{
      const domain=metadata[exercise.id];
      if(!domain) throw new Error(`Missing exercise metadata: ${exercise.id}`);
      return [
        exercise.id,exercise.name,list(domain.aliases).join(" · "),
        text(domain.movementPattern),text(domain.movementSubpattern),
        list(domain.primaryMuscles).join(" · "),list(domain.secondaryMuscles).join(" · "),
        list(domain.requiredEquipment).join(" · "),text(exercise.muscle),
        text(exercise.equipment),text(exercise.type),text(exercise.notes)
      ];
    });
  }
  function validateWorkbookLimits(workbook){
    const errors=[];
    let totalCells=0;
    list(workbook?.sheets).forEach(sheet=>{
      list(sheet?.rows).forEach((row,rowIndex)=>{
        totalCells+=list(row).length;
        list(row).forEach((value,columnIndex)=>{
          if(String(value??"").length>MAX_CELL_LENGTH){
            errors.push(issue(
              "cell_too_long",`La celda supera el límite de ${MAX_CELL_LENGTH} caracteres.`,
              {sheet:sheet.name,row:rowIndex+1,columnIndex,value}
            ));
          }
        });
      });
    });
    if(totalCells>MAX_TOTAL_CELLS){
      errors.push(issue(
        "too_many_cells",`El libro supera el límite de ${MAX_TOTAL_CELLS} celdas.`,
        {help:"Reduce el número de filas o columnas antes de volver a importarlo."}
      ));
    }
    return errors;
  }
  function normalizeExternalLinkIssues(workbook){
    return list(workbook?.externalLinks).map(item=>issue(
      "external_link_not_allowed","El archivo contiene un enlace externo no permitido.",
      {sheet:item?.sheet,row:item?.row,column:item?.column,cell:item?.cell,value:item?.target}
    ));
  }
  function normalizeFormulaIssues(workbook){
    return list(workbook?.formulaCells).slice(0,100).map(item=>{
      const raw=typeof item==="string"?item:text(item?.cell);
      const match=raw.match(/^(.+)!([A-Z]+)(\d+)$/i);
      return issue(
        "formula_not_allowed","Las fórmulas no están permitidas. Sustitúyela por un valor.",
        {
          sheet:item?.sheet||match?.[1]||null,
          row:item?.row||Number(match?.[3])||null,
          column:item?.column||match?.[2]||null,
          value:raw
        }
      );
    });
  }
  function inspectWorkbook(workbook,context={}){
    const structuralWarnings=[];
    const errors=[
      ...list(workbook?.errors).map(item=>item.location?clone(item):issue(
        item.code||"invalid_workbook",item.message||"El libro no es válido.",
        {sheet:item.sheet||item.column,row:item.row,column:item.column,value:item.value}
      )),
      ...validateWorkbookLimits(workbook),
      ...normalizeFormulaIssues(workbook),
      ...normalizeExternalLinkIssues(workbook)
    ];
    if(workbook?.hasMacros){
      errors.push(issue("macros_not_allowed","Los archivos con macros no están permitidos."));
    }
    if(errors.length) return preview(null,errors,[],context);
    if(isLegacyWorkbook(workbook)){
      return preview(null,[issue(
        "obsolete_template",
        "Esta plantilla pertenece a una versión anterior de GymOS. Descarga la plantilla actual para importar la rutina con todos sus datos.",
        {sheet:"Rutina",row:1,help:"No se han inventado valores de RIR, descanso ni prescripción."}
      )],[],context);
    }
    const templateVersion=Number(metadataValue(workbook,"templateVersion"));
    if(templateVersion!==TEMPLATE_VERSION){
      errors.push(issue(
        "unsupported_template_version",
        `Esta versión de GymOS requiere la plantilla v${TEMPLATE_VERSION}.`,
        {sheet:"_GymOS",column:"templateVersion",value:templateVersion||"ausente"}
      ));
    }
    const schemaVersion=metadataValue(workbook,"schemaVersion");
    if(schemaVersion!==SCHEMA_VERSION){
      errors.push(issue(
        "unsupported_schema_version",
        `Esta versión de GymOS requiere el esquema ${SCHEMA_VERSION}.`,
        {sheet:"_GymOS",column:"schemaVersion",value:schemaVersion||"ausente"}
      ));
    }
    const sessionSheet=workbookSheet(workbook,"Sesiones");
    const routineSheet=workbookSheet(workbook,"Rutina");
    if(!sessionSheet) errors.push(issue("missing_sheet","Falta la hoja Sesiones.",{sheet:"Sesiones"}));
    if(!routineSheet) errors.push(issue("missing_sheet","Falta la hoja Rutina.",{sheet:"Rutina"}));
    if(errors.length) return preview(null,errors,[],context);
    const sessionTable=rowsToRecords(sessionSheet,SESSION_COLUMNS);
    const routineTable=rowsToRecords(routineSheet,ROUTINE_COLUMNS);
    errors.push(...sessionTable.errors,...routineTable.errors);
    const sessions=new Map();
    const sessionIdHints=new Set();
    sessionTable.records.forEach(row=>{
      const key=text(row.session);
      const order=finiteInteger(row.order,1,6);
      if(!key) errors.push(issue("session_required","Indica la sesión.",row.__locations.session));
      if(!order) errors.push(issue("invalid_session_order","El orden debe ser un entero entre 1 y 6.",{
        ...row.__locations.order,value:row.order
      }));
      if(!text(row.name)) errors.push(issue("session_name_required","Indica el nombre de la sesión.",row.__locations.name));
      const duration=text(row.duration)?finiteInteger(row.duration,1,300):null;
      if(text(row.duration)&&!duration) errors.push(issue(
        "invalid_session_duration","La duración debe estar entre 1 y 300 minutos.",
        {...row.__locations.duration,value:row.duration}
      ));
      if(text(row.notes).length>1000) errors.push(issue(
        "session_notes_too_long","Las notas de sesión no pueden superar 1000 caracteres.",
        {...row.__locations.notes,value:row.notes}
      ));
      if(key&&sessions.has(key)) errors.push(issue(
        "duplicate_session","La sesión está repetida.",{...row.__locations.session,value:key}
      ));
      const sessionId=text(row.sessionId);
      if(sessionId.length>200) errors.push(issue(
        "invalid_session_id_hint","El identificador interno de sesión no es válido.",
        {...row.__locations.sessionId,value:""}
      ));
      if(sessionId&&sessionIdHints.has(sessionId)) errors.push(issue(
        "duplicate_session_id_hint","El archivo repite una identidad interna de sesión.",
        {...row.__locations.sessionId,value:""}
      ));
      if(sessionId) sessionIdHints.add(sessionId);
      if(key) sessions.set(key,{
        key,order,name:text(row.name),focus:text(row.focus),durationMin:duration,
        notes:text(row.notes),sessionId, rowNumber:row.__rowNumber
      });
    });
    if(sessions.size<2||sessions.size>6){
      errors.push(issue(
        "invalid_session_count","La rutina debe contener entre 2 y 6 sesiones.",
        {sheet:"Sesiones",value:sessions.size}
      ));
    }
    const sessionOrders=[...sessions.values()].map(item=>item.order).filter(Boolean);
    if(new Set(sessionOrders).size!==sessionOrders.length){
      errors.push(issue("duplicate_session_order","El orden de las sesiones debe ser único.",{sheet:"Sesiones",column:"Orden"}));
    }
    const ioRows=[];
    const perSession=new Map();
    routineTable.records.forEach(row=>{
      const session=sessions.get(text(row.session));
      if(!session){
        errors.push(issue(
          "unknown_session_reference","La sesión indicada no existe en la hoja Sesiones.",
          {...row.__locations.session,value:row.session}
        ));
        return;
      }
      const order=finiteInteger(row.order,1,1000);
      const sets=finiteInteger(row.sets,1,10);
      const targetType=normalizedTargetType(row.targetType);
      const targetLimit=targetType==="duracion"?3600:100;
      const targetMin=targetType?finiteNumber(row.targetMin,1,targetLimit):null;
      const targetMax=text(row.targetMax)
        ?finiteNumber(row.targetMax,1,targetLimit)
        :targetMin;
      const rirMin=finiteNumber(row.rirMin,0,10);
      const rirMax=text(row.rirMax)?finiteNumber(row.rirMax,0,10):rirMin;
      const rest=finiteNumber(row.restSeconds,0,600);
      if(!order) errors.push(issue("invalid_order","El orden debe ser un entero positivo.",{
        ...row.__locations.order,value:row.order
      }));
      if(!text(row.exercise)&&!text(row.exerciseId)) errors.push(issue("exercise_required","Indica el ID o el nombre del ejercicio.",row.__locations.exercise));
      if(!sets) errors.push(issue("invalid_sets","Las series deben estar entre 1 y 10.",{
        ...row.__locations.sets,value:row.sets
      }));
      if(!targetType) errors.push(issue(
        "invalid_target_type","Usa repeticiones o duración.",
        {...row.__locations.targetType,value:row.targetType}
      ));
      if(targetType&&!targetMin) errors.push(issue(
        "invalid_target_min",
        `El objetivo debe estar entre 1 y ${targetLimit}${targetType==="duracion"?" segundos":""}.`,
        {...row.__locations.targetMin,value:row.targetMin}
      ));
      if(targetType&&(!targetMax||targetMax<targetMin)) errors.push(issue(
        "invalid_target_max","El objetivo máximo debe ser mayor o igual que el mínimo.",
        {...row.__locations.targetMax,value:row.targetMax}
      ));
      if(rirMin===null) errors.push(issue("invalid_rir","El RIR debe estar entre 0 y 10.",{
        ...row.__locations.rirMin,value:row.rirMin
      }));
      if(rirMax===null||rirMax<rirMin) errors.push(issue(
        "invalid_rir_max","El RIR máximo debe ser mayor o igual que el mínimo.",
        {...row.__locations.rirMax,value:row.rirMax}
      ));
      if(rest===null) errors.push(issue(
        "invalid_rest","El descanso debe estar entre 0 y 600 segundos.",
        {...row.__locations.restSeconds,value:row.restSeconds}
      ));
      if(text(row.notes).length>1000) errors.push(issue(
        "notes_too_long","Las notas no pueden superar 1000 caracteres.",
        {...row.__locations.notes,value:row.notes}
      ));
      const sessionItems=perSession.get(session.key)||[];
      if(order&&sessionItems.includes(order)) errors.push(issue(
        "duplicate_order","El orden está repetido dentro de la sesión.",
        {...row.__locations.order,value:order}
      ));
      sessionItems.push(order);
      perSession.set(session.key,sessionItems);
      if(order&&sets&&targetType&&targetMin&&targetMax&&rirMin!==null&&
        rirMax!==null&&rest!==null&&(text(row.exercise)||text(row.exerciseId))){
        ioRows.push({
          __rowNumber:row.__rowNumber,
          templateVersion:1,
          session:session.key,sessionName:session.name,focus:session.focus,
          durationMin:session.durationMin,order,
          exerciseId:text(row.exerciseId),exerciseName:text(row.exercise),
          sets,
          target:`${targetMin}${targetMax!==targetMin?`-${targetMax}`:""} ${targetType==="duracion"?"s":"reps"}`,
          rir:`${rirMin}${rirMax!==rirMin?`-${rirMax}`:""}`,
          restSeconds:rest,notes:text(row.notes)
        });
      }
    });
    sessions.forEach(session=>{
      const count=list(perSession.get(session.key)).length;
      if(!count) structuralWarnings.push(issue(
        "empty_session_review_required",
        "La sesión está vacía. Se conservará en la propuesta, pero tendrás que añadir un ejercicio antes de activarla.",
        {severity:"warning",sheet:"Sesiones",row:session.rowNumber,column:"Sesión",value:session.key}
      ));
      if(count>20) errors.push(issue(
        "too_many_session_exercises","Una sesión no puede superar 20 ejercicios.",
        {sheet:"Rutina",column:"Sesión",value:session.key}
      ));
    });
    if(ioRows.length>100) errors.push(issue(
      "too_many_exercises","La rutina no puede superar 100 ejercicios.",{sheet:"Rutina",value:ioRows.length}
    ));
    if(errors.length) return preview(null,errors,[],context);
    if(!global.GymOSRoutineIO?.convertRows){
      throw new Error("GymOSRoutineIO is required.");
    }
    const converted=ioRows.length
      ?global.GymOSRoutineIO.convertRows(ioRows,context)
      :{
        sessions:[],errors:[],warnings:[],exerciseCount:0,reviewRequired:true,
        activationCompatibility:{compatible:false,sessionCount:sessions.size,reasons:["empty_session"]}
      };
    const convertedErrors=list(converted.errors).filter(item=>
      !(
        (item.code==="invalid_session_count"||item.code==="too_few_sessions")&&
        sessions.size>=2&&sessions.size<=6&&
        structuralWarnings.some(warning=>warning.code==="empty_session_review_required")
      )
    ).map(item=>issue(
      item.code,item.message,{
        severity:item.severity||"error",sheet:"Rutina",row:item.row,
        column:item.column,value:item.value
      }
    ));
    const warnings=[
      ...structuralWarnings,
      ...list(converted.warnings).map(item=>issue(
        item.code,item.message,{
          severity:item.severity||"warning",sheet:"Rutina",row:item.row,column:item.column,value:item.value,
          originalName:item.originalName,canonicalName:item.canonicalName,exerciseId:item.exerciseId
        }
      ))
    ];
    const convertedByKey=new Map(list(converted.sessions).map(item=>[item.key,item]));
    converted.sessions=[...sessions.values()].map(source=>{
      const item=convertedByKey.get(source.key)||{
        key:source.key,name:source.name,focus:source.focus,rows:[]
      };
      return {
        ...item,
        order:source.order,
        name:source.name,
        focus:source.focus,
        durationMin:source.durationMin,
        notes:source.notes,
        sessionIdHint:source.sessionId
      };
    }).sort((a,b)=>a.order-b.order||a.key.localeCompare(b.key,"es"));
    if(warnings.some(item=>item.code==="empty_session_review_required")){
      converted.reviewRequired=true;
    }
    converted.templateVersion=TEMPLATE_VERSION;
    converted.valid=convertedErrors.length===0;
    converted.errors=convertedErrors;
    converted.warnings=warnings;
    return preview(converted,convertedErrors,warnings,context);
  }
  function preview(result,errors,warnings,context={}){
    const sessions=list(result?.sessions);
    const corrections=warnings.filter(item=>item.severity==="correction");
    return {
      state:errors.length?"errors":warnings.length?"warnings":"valid",
      fileName:text(context.fileName),format:text(context.format).toUpperCase(),
      sheetName:"Rutina",rowCount:sessions.reduce((sum,item)=>sum+list(item.rows).length,0),
      sessionCount:sessions.length,exerciseCount:Number(result?.exerciseCount)||0,
      recognizedExerciseCount:Number(result?.exerciseCount)||0,
      sessions:sessions.map(session=>({
        key:session.key,name:session.name,focus:session.focus,
        durationMin:session.durationMin,exerciseCount:list(session.rows).length,
        exercises:list(session.rows).map(row=>({
          order:row.order,name:row.name,sets:row.sets,
          target:global.GymOSRoutineIO?.targetText?.(row.target)||"",
          rir:global.GymOSRoutineIO?.rirText?.(row.targetRir)||"",
          restSeconds:row.restSeconds,notes:row.notes
        }))
      })),
      errors:clone(errors),warnings:clone(warnings),ignoredRows:[],
      corrections:clone(corrections),correctionCount:corrections.length,
      activationCompatible:Boolean(result?.activationCompatibility?.compatible)&&!result?.reviewRequired,
      reviewRequired:Boolean(result?.reviewRequired),
      canSave:errors.length===0&&Boolean(result),
      templateVersion:TEMPLATE_VERSION,
      imported:result?clone(result):null
    };
  }
  function targetParts(value){
    const target=value?.prescription?.target??value?.target??value?.reps;
    if(target&&typeof target==="object"){
      const type=target.type==="duration"?"duracion":"repeticiones";
      return {type,min:Number(target.min),max:Number(target.max??target.min)};
    }
    const parsed=global.GymOSRoutineIO?.parseTarget?.(target);
    if(parsed){
      return {
        type:parsed.type==="duration"?"duracion":"repeticiones",
        min:Number(parsed.min),max:Number(parsed.max??parsed.min)
      };
    }
    return {type:"repeticiones",min:"",max:""};
  }
  function rangeParts(value){
    if(value&&typeof value==="object"){
      return {min:Number(value.min),max:Number(value.max??value.min)};
    }
    const match=text(value).match(/^(\d+(?:[.,]\d+)?)(?:\s*-\s*(\d+(?:[.,]\d+)?))?$/);
    if(!match) return {min:"",max:""};
    return {min:Number(match[1].replace(",",".")),max:Number((match[2]||match[1]).replace(",","."))};
  }
  function orderedSessions(routine){
    if(Array.isArray(routine?.sessions)){
      return clone(routine.sessions).sort((a,b)=>
        (Number(a?.order)||999)-(Number(b?.order)||999)||
        text(a?.sessionId).localeCompare(text(b?.sessionId),"en")
      );
    }
    return ["A","B","C"].filter(key=>list(routine?.[key]).length).map((key,index)=>({
      sessionId:"",legacySessionKey:key,order:index+1,label:key,name:`Sesión ${key}`,
      focus:"",estimatedDurationMinutes:null,notes:"",
      exercises:list(routine[key])
    }));
  }
  function workbookModel(routine,{kind="active_export"}={}){
    const sessions=orderedSessions(routine);
    const sessionRows=sessions.map((session,index)=>[
      String.fromCharCode(65+index),
      Number(session.order)||index+1,
      text(session.name)||`Sesión ${index+1}`,
      text(session.focus),
      Number(session.estimatedDurationMinutes)||"",
      text(session.notes),
      text(session.sessionId)
    ]);
    const routineRows=[];
    sessions.forEach((session,sessionIndex)=>{
      const sessionKey=String.fromCharCode(65+sessionIndex);
      list(session.exercises).forEach((exercise,index)=>{
        const target=targetParts(exercise);
        const rir=rangeParts(exercise?.prescription?.targetRir??exercise?.targetRir??exercise?.rir);
        routineRows.push([
          sessionKey,index+1,text(exercise.name),
          Number(exercise?.prescription?.sets??exercise.sets)||"",
          target.type,target.min,target.max,
          rir.min,rir.max,
          Number(exercise?.prescription?.restSeconds??exercise.restSeconds),
          text(exercise.notes)||text(exercise?.prescription?.notes),
          text(exercise.exerciseId||exercise.id)
        ]);
      });
    });
    const sheets=[
      {
        name:"Instrucciones",
        rows:[
          ["Plantilla de Rutina GymOS",`Versión ${TEMPLATE_VERSION}`],
          ["Sesiones","Incluye entre 2 y 6 sesiones y referencia sus claves desde la hoja Rutina."],
          ["Objetivos","Usa repeticiones o duración. La duración se expresa en segundos."],
          ["RIR","Indica valores entre 0 y 10. El máximo no puede ser menor que el mínimo."],
          ["Descanso","Indica segundos entre 0 y 600."],
          ["Biblioteca","Selecciona ejercicios de Biblioteca: no inventes uno si allí existe una alternativa válida. Copia _GymOS exercise y Ejercicio cuando puedas."],
          ["IDs","_GymOS exercise es la única identidad autoritativa: no lo traduzcas, abrevies, modifiques ni inventes. Ejercicio es descriptivo; si no coincide, GymOS lo reemplaza por el nombre oficial del ID válido, aunque el texto corresponda a otro ejercicio conocido."],
          ["ChatGPT","Puede ayudarte a rellenar Sesiones y Rutina. Debe copiar el ID y el nombre desde Biblioteca cuando pueda, respetando columnas y estructura."],
          ["Hojas protegidas","No cambies los nombres, cabeceras ni estructura de las hojas _Catálogos y _GymOS."],
          ["Importación","Importar prepara una propuesta para revisar. Tu rutina actual solo cambiará cuando actives esa propuesta."],
          ["Errores","GymOS indicará hoja, fila y columna para que puedas corregirlos."]
        ]
      },
      {
        name:"Sesiones",
        rows:[SESSION_COLUMNS.map(column=>column.header),...sessionRows],
        hiddenColumns:SESSION_COLUMNS.map((column,index)=>column.hidden?index:null).filter(Number.isInteger)
      },
      {
        name:"Rutina",
        rows:[ROUTINE_COLUMNS.map(column=>column.header),...routineRows],
        hiddenColumns:ROUTINE_COLUMNS.map((column,index)=>column.hidden?index:null).filter(Number.isInteger)
      }
    ];
    if(kind==="template"){
      sheets.push({
        name:"Biblioteca",rows:[LIBRARY_COLUMNS,...builtInLibraryRows()],
        columnWidths:[24,34,42,22,28,30,30,34,20,24,18,48]
      });
    }
    sheets.push(
      {
        name:"_Catálogos",hidden:true,
        rows:[["Tipos de objetivo"],["repeticiones"],["duración"]]
      },
      {
        name:"_GymOS",veryHidden:true,
        rows:[
          ["templateVersion",TEMPLATE_VERSION],
          ["schemaVersion",SCHEMA_VERSION],
          ["kind",kind]
        ]
      }
    );
    return {templateVersion:TEMPLATE_VERSION,sheets};
  }
  function templateModel(){
    const example={
      schemaVersion:SCHEMA_VERSION,routineId:"",revision:1,
      sessions:[1,2].map(index=>({
        sessionId:"",order:index,label:String.fromCharCode(64+index),
        name:`Sesión ${String.fromCharCode(64+index)}`,focus:"full_body",
        estimatedDurationMinutes:60,exercises:[]
      }))
    };
    return workbookModel(example,{kind:"template"});
  }
  function importedProposalResult(result){
    const cloneResult=clone(result);
    cloneResult.sessions=list(cloneResult.sessions).map((session,index)=>({
      ...session,
      order:Number(session.order)||index+1,
      estimatedDurationMin:session.durationMin,
      estimatedDurationMinutes:session.durationMin,
      notes:session.notes||""
    }));
    return cloneResult;
  }

  global.GymOSRoutineExcel=Object.freeze({
    TEMPLATE_VERSION,SCHEMA_VERSION,MAX_TOTAL_CELLS,MAX_CELL_LENGTH,
    TARGET_TYPES,SESSION_COLUMNS,ROUTINE_COLUMNS,LIBRARY_COLUMNS,
    issue,location,headerMap,isLegacyWorkbook,inspectWorkbook,
    workbookModel,templateModel,importedProposalResult
  });
})(typeof window!=="undefined"?window:globalThis);
