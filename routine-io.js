(function(global){
  "use strict";

  const MODEL_VERSION="4.2.0-alpha.1-phase-f";
  const ROUTINE_TEMPLATE_VERSION=1;
  const MAX_FILE_BYTES=5*1024*1024;
  const MAX_ROWS=500;
  const MAX_EXERCISES=100;
  const MAX_EXERCISES_PER_SESSION=20;
  const MAX_SHEETS=50;
  const MAX_COLUMNS=64;
  const FORMATS=Object.freeze(["xlsx","xls","csv"]);
  const EXPORT_FORMATS=Object.freeze(["xlsx","csv"]);
  const MIME_BY_FORMAT=Object.freeze({
    xlsx:Object.freeze([
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ]),
    xls:Object.freeze(["application/vnd.ms-excel"]),
    csv:Object.freeze(["text/csv","application/csv","text/plain"])
  });
  const GENERIC_MIME_TYPES=Object.freeze(["","application/octet-stream"]);
  const DANGEROUS_INNER_EXTENSIONS=Object.freeze([
    "exe","com","bat","cmd","msi","js","mjs","html","htm","svg",
    "zip","rar","7z","gz","xlsm","xlam","xlsb"
  ]);
  const CSV_TEXT_GUARD="'\u2063";
  const COLUMNS=Object.freeze([
    {key:"templateVersion",header:"Versión plantilla",aliases:["version plantilla","template version","version"]},
    {key:"session",header:"Sesión",aliases:["sesion","session"]},
    {key:"sessionName",header:"Nombre de sesión",aliases:["nombre sesion","session name"]},
    {key:"focus",header:"Enfoque",aliases:["focus"]},
    {key:"durationMin",header:"Duración sesión (min)",aliases:["duracion sesion min","duration min","session duration","duration"]},
    {key:"order",header:"Orden de ejercicio",aliases:["orden","exercise order","order"]},
    {key:"exerciseId",header:"ID de ejercicio",aliases:["id ejercicio","exercise id","exercise_id"]},
    {key:"exerciseName",header:"Ejercicio",aliases:["exercise","exercise name","nombre ejercicio"]},
    {key:"sets",header:"Series",aliases:["sets"]},
    {key:"target",header:"Objetivo",aliases:["repeticiones","reps","target","duration"]},
    {key:"rir",header:"RIR",aliases:["target rir"]},
    {key:"restSeconds",header:"Descanso (s)",aliases:["descanso","rest","rest seconds","rest_seconds"]},
    {key:"pattern",header:"Patrón",aliases:["patron","movement pattern","movement_pattern"]},
    {key:"role",header:"Función",aliases:["funcion","role","function"]},
    {key:"recordType",header:"Tipo de registro",aliases:["record type","record_type","tipo"]},
    {key:"notes",header:"Notas",aliases:["notes"]}
  ]);
  const ESSENTIAL_KEYS=Object.freeze(["session","order","sets","target","rir","restSeconds"]);
  const INSTRUCTIONS=Object.freeze([
    ["Plantilla oficial de rutinas GymOS",`Versión ${ROUTINE_TEMPLATE_VERSION}`],
    ["Estructura","Utiliza una fila por ejercicio y entre 2 y 6 sesiones."],
    ["Orden","Indica un número entero positivo y único dentro de cada sesión."],
    ["Objetivo","Usa repeticiones como 8-12 reps o duración como 30-45 s."],
    ["Identidad","Es preferible utilizar el ID exacto de la biblioteca. También se admite un nombre único."],
    ["Seguridad","Los ejercicios desconocidos o ambiguos deben corregirse antes de guardar."],
    ["Importación","La importación crea una propuesta pendiente. Nunca sustituye automáticamente la rutina activa."]
  ]);
  const HEADER_BY_TOKEN=new Map();

  function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
  function text(value){return String(value??"").trim();}
  function list(value){return Array.isArray(value)?value:[];}
  function unique(values){return [...new Set(list(values).filter(Boolean))];}
  function normalizeToken(value){
    return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
      .replace(/[_-]+/g," ").replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
  }
  function canonical(value){
    if(Array.isArray(value)) return value.map(canonical);
    if(value&&typeof value==="object"){
      return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
    }
    return value;
  }
  function stableStringify(value){return JSON.stringify(canonical(value));}
  function stableHash(value){
    if(!global.GymOSRoutineProposals?.stableHash){
      throw new Error("GymOSRoutineProposals is required.");
    }
    return global.GymOSRoutineProposals.stableHash(value);
  }
  function normalizeOwnerId(ownerId){
    if(!global.GymOSProfileData?.normalizeOwnerId){
      throw new Error("GymOSProfileData is required.");
    }
    return global.GymOSProfileData.normalizeOwnerId(ownerId);
  }
  function issue(code,message,{row=null,column=null,value=null,severity="error"}={}){
    return {code,severity,row,column,value:value===null?null:text(value).slice(0,160),message};
  }
  function safeFileName(value){
    const leaf=text(value).split(/[\\/]/).pop()||"rutina";
    return leaf.replace(/[\u0000-\u001f\u007f<>:"|?*]/g,"_").slice(0,120)||"rutina";
  }
  function fileFormat(name){
    const match=safeFileName(name).toLowerCase().match(/\.([a-z0-9]+)$/);
    return match?.[1]||"";
  }
  function validateFileDescriptor({name,size,type}={}){
    const format=fileFormat(name);
    const errors=[];
    if(!FORMATS.includes(format)){
      errors.push(issue("unsupported_format","Utiliza un archivo XLSX, XLS o CSV."));
    }
    if(!Number.isFinite(Number(size))||Number(size)<=0){
      errors.push(issue("empty_file","El archivo está vacío."));
    }else if(Number(size)>MAX_FILE_BYTES){
      errors.push(issue("file_too_large","El archivo supera el límite de 5 MB."));
    }
    const parts=safeFileName(name).toLowerCase().split(".");
    const innerExtensions=parts.slice(1,-1);
    if(innerExtensions.some(extension=>DANGEROUS_INNER_EXTENSIONS.includes(extension))){
      errors.push(issue("manipulated_extension","El nombre contiene una extensión interna no permitida."));
    }
    const acceptedMimes=MIME_BY_FORMAT[format]||[];
    if(
      format&&text(type)&&!GENERIC_MIME_TYPES.includes(text(type).toLowerCase())&&
      !acceptedMimes.includes(text(type).toLowerCase())
    ){
      errors.push(issue("mime_mismatch","El tipo declarado por el archivo no coincide con su extensión."));
    }
    return {
      valid:errors.length===0,format,fileName:safeFileName(name),
      mime:text(type).toLowerCase(),errors
    };
  }

  COLUMNS.forEach(column=>{
    [column.header,...column.aliases].forEach(alias=>{
      const token=normalizeToken(alias);
      if(!HEADER_BY_TOKEN.has(token)) HEADER_BY_TOKEN.set(token,new Set());
      HEADER_BY_TOKEN.get(token).add(column.key);
    });
  });
  function mapHeaders(headerRow){
    const indexes={},originals={},duplicates=[],ambiguous=[],unknown=[];
    list(headerRow).forEach((header,index)=>{
      const token=normalizeToken(header);
      if(!token) return;
      const keys=[...(HEADER_BY_TOKEN.get(token)||[])];
      if(!keys.length){unknown.push({index,header:text(header)});return;}
      if(keys.length>1){
        ambiguous.push({index,header:text(header),keys});
        return;
      }
      const key=keys[0];
      if(indexes[key]!==undefined){
        duplicates.push({
          key,
          headers:[originals[key],{index,header:text(header)}]
        });
      }else{
        indexes[key]=index;
        originals[key]={index,header:text(header)};
      }
    });
    const missing=ESSENTIAL_KEYS.filter(key=>indexes[key]===undefined);
    if(indexes.exerciseId===undefined&&indexes.exerciseName===undefined) missing.push("exerciseIdentity");
    return {
      valid:missing.length===0&&duplicates.length===0&&ambiguous.length===0,
      indexes,originals,missing,duplicates,ambiguous,unknown
    };
  }
  function tableRowsToObjects(rows){
    const source=list(rows);
    if(!source.length) return {rows:[],headers:null,errors:[issue("empty_sheet","La hoja no contiene datos.")]};
    if(source.length-1>MAX_ROWS){
      return {
        rows:[],headers:null,
        errors:[issue("too_many_rows",`La hoja supera el límite de ${MAX_ROWS} filas.`)]
      };
    }
    if(source.some(row=>list(row).length>MAX_COLUMNS)){
      return {
        rows:[],headers:null,
        errors:[issue("too_many_columns",`La hoja supera el límite de ${MAX_COLUMNS} columnas.`)]
      };
    }
    const headers=mapHeaders(source[0]);
    if(!headers.valid){
      const headerIssues=[
        ...headers.duplicates.map(duplicate=>issue(
          "duplicate_header",
          `Las columnas ${duplicate.headers.map(item=>`“${item.header}”`).join(" y ")} representan el mismo campo.`,
          {row:1,column:duplicate.headers.map(item=>item.header).join(" / ")}
        )),
        ...headers.ambiguous.map(item=>issue(
          "ambiguous_header",
          `La columna “${item.header}” puede representar más de un campo.`,
          {row:1,column:item.header}
        ))
      ];
      if(!headerIssues.length){
        headerIssues.push(issue(
          "invalid_headers",
          `Faltan encabezados esenciales: ${headers.missing.join(", ")}.`,
          {row:1}
        ));
      }
      return {
        rows:[],headers,
        errors:headerIssues
      };
    }
    const output=[],ignoredRows=[];
    source.slice(1).forEach((cells,index)=>{
      const values=list(cells);
      if(values.every(value=>!text(value))){
        ignoredRows.push(index+2);
        return;
      }
      const row={__rowNumber:index+2};
      Object.entries(headers.indexes).forEach(([key,columnIndex])=>{
        row[key]=unprotectCsvText(values[columnIndex]);
      });
      output.push(row);
    });
    return {rows:output,ignoredRows,headers,errors:[]};
  }
  function usableSheet(sheet){
    const rows=list(sheet?.rows);
    return rows.length>0&&rows.some(row=>list(row).some(value=>text(value)));
  }
  function sheetIsVisible(sheet){return sheet?.hidden!==true&&Number(sheet?.hidden)!==1&&Number(sheet?.hidden)!==2;}
  function sheetIsExcluded(sheet){
    return ["instrucciones","ejemplo"].includes(normalizeToken(sheet?.name));
  }
  function sheetIsMacro(sheet){
    return sheet?.macro===true||normalizeToken(sheet?.type)==="macro";
  }
  function selectRoutineSheet(workbook){
    const allSheets=list(workbook?.sheets);
    if(!allSheets.length){
      return {sheet:null,errors:[issue("empty_workbook","El archivo no contiene hojas.")]};
    }
    if(allSheets.length>MAX_SHEETS){
      return {sheet:null,errors:[issue("too_many_sheets",`El libro supera el límite de ${MAX_SHEETS} hojas.`)]};
    }
    if(allSheets.some(sheet=>sheetIsMacro(sheet))){
      return {sheet:null,errors:[issue("macros_not_allowed","El libro contiene una hoja de macros no permitida.")]};
    }
    const visible=allSheets.filter(sheetIsVisible);
    const sheets=visible.filter(sheet=>!sheetIsExcluded(sheet)&&usableSheet(sheet));
    const named=sheets.filter(sheet=>normalizeToken(sheet.name)==="rutina");
    if(named.length===1) return {sheet:named[0],errors:[]};
    if(named.length>1){
      return {sheet:null,errors:[issue("ambiguous_sheet","Existe más de una hoja llamada Rutina.")]};
    }
    if(sheets.length===1) return {sheet:sheets[0],errors:[]};
    if(!visible.length){
      return {sheet:null,errors:[issue("hidden_sheet","El libro no contiene hojas visibles utilizables.")]};
    }
    if(!sheets.length) return {sheet:null,errors:[issue("empty_workbook","El archivo no contiene una hoja de datos utilizable.")]};
    return {sheet:null,errors:[issue("ambiguous_sheet","Añade una hoja llamada Rutina o deja una única hoja utilizable.")]};
  }
  function finiteInteger(value,min,max){
    const number=Number(text(value).replace(",","."));
    return Number.isInteger(number)&&number>=min&&number<=max?number:null;
  }
  function finiteNumber(value,min,max){
    const number=Number(text(value).replace(",","."));
    return Number.isFinite(number)&&number>=min&&number<=max?number:null;
  }
  function parseRange(value,min,max){
    const raw=text(value).replace(/[–—]/g,"-").replace(",",".");
    const match=raw.match(/^(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?$/);
    if(!match) return null;
    const low=Number(match[1]),high=Number(match[2]??match[1]);
    if(low<min||high>max||high<low) return null;
    return {min:low,max:high};
  }
  function parseTarget(value){
    const raw=text(value).replace(/[–—]/g,"-").toLowerCase();
    const duration=/(\d+)\s*(?:-\s*(\d+))?\s*(s|seg|segundos?|sec|seconds?)$/.exec(raw);
    if(duration){
      const min=Number(duration[1]),max=Number(duration[2]??duration[1]);
      if(min>=1&&max<=3600&&max>=min) return {type:"duration",min,max};
      return null;
    }
    const reps=/^(\d+)\s*(?:-\s*(\d+))?\s*(?:reps?|repeticiones?)?$/.exec(raw);
    if(reps){
      const min=Number(reps[1]),max=Number(reps[2]??reps[1]);
      if(min>=1&&max<=100&&max>=min){
        return {type:"repetitions",min,max};
      }
    }
    return null;
  }
  function targetText(target){
    if(typeof target==="string") return text(target);
    if(!target||typeof target!=="object") return "";
    const min=target.min??target.seconds??target.max;
    const max=target.max??min;
    if(min===undefined) return "";
    const range=Number(max)!==Number(min)?`${min}-${max}`:`${min}`;
    return target.type==="duration"?`${range} s`:`${range} reps`;
  }
  function rirText(rir){
    if(rir===null||rir===undefined) return "";
    if(typeof rir!=="object") return text(rir);
    const min=rir.min??rir.max,max=rir.max??min;
    return min===undefined?"":Number(min)===Number(max)?`${min}`:`${min}-${max}`;
  }
  function normalizedExerciseName(value){return normalizeToken(value);}
  function libraryIndex(library){
    const byId=new Map(),byName=new Map(),duplicateIds=[],invalidExercises=[];
    list(library).forEach(exercise=>{
      const id=text(exercise?.id);
      if(id&&byId.has(id)) duplicateIds.push(id);
      else if(id) byId.set(id,exercise);
      if(!global.GymOSExerciseDomain?.validateExerciseDefinition){
        throw new Error("GymOSExerciseDomain is required.");
      }
      const definition=global.GymOSExerciseDomain.validateExerciseDefinition(exercise);
      if(definition.valid===false) invalidExercises.push(id||null);
      const names=[exercise?.name,...list(exercise?.aliases)];
      names.forEach(name=>{
        const key=normalizedExerciseName(name);
        if(!key) return;
        if(!byName.has(key)) byName.set(key,[]);
        byName.get(key).push(exercise);
      });
    });
    return {
      byId,byName,
      duplicateIds:unique(duplicateIds).sort(),
      invalidExercises:unique(invalidExercises).sort()
    };
  }
  function matchExercise(row,index){
    const id=text(row.exerciseId),name=text(row.exerciseName);
    if(id&&index.byId.has(id)){
      const exercise=index.byId.get(id);
      return {
        exercise,
        warning:name&&normalizedExerciseName(name)!==normalizedExerciseName(exercise.name)
          ?"El nombre del archivo no coincide con el ID; se utiliza el nombre de la biblioteca."
          :null
      };
    }
    if(id&&!name) return {error:"No se reconoce el ID del ejercicio."};
    const matches=index.byName.get(normalizedExerciseName(name))||[];
    const distinct=[...new Map(matches.map(item=>[text(item.id),item])).values()];
    if(distinct.length===1) return {exercise:distinct[0],warning:null};
    if(distinct.length>1) return {error:"El nombre coincide con varios ejercicios. Utiliza el ID exacto."};
    return {error:"No se reconoce el ejercicio. Utiliza un ID de la biblioteca o corrige el nombre."};
  }
  function compatibilityLabel(code){
    return {
      invalid_exercise:"La definición del ejercicio no es válida.",
      equipment_or_location_unavailable:"El ejercicio no es compatible con tu equipamiento o lugar de entrenamiento.",
      exercise_avoided:"El ejercicio figura entre los movimientos que prefieres evitar.",
      knee_restriction:"El ejercicio requiere revisión por una restricción de rodilla.",
      lumbar_restriction:"El ejercicio requiere revisión por una restricción lumbar.",
      shoulder_restriction:"El ejercicio requiere revisión por una restricción de hombro.",
      lumbar_position:"La posición del ejercicio requiere revisión por la restricción lumbar.",
      pregnancy_not_reviewed:"El ejercicio no está revisado para la situación vital actual.",
      pregnancy_prohibited:"El ejercicio está excluido para la situación vital actual.",
      pregnancy_risk_unknown:"Faltan datos de seguridad para la situación vital actual."
    }[code]||"El ejercicio requiere una revisión de compatibilidad.";
  }
  function convertRows(rows,{exerciseLibrary=[],userProfile={},currentLifeState=null}={}){
    const errors=[],warnings=[],ignoredRows=[],unresolvedQuestions=[];
    const index=libraryIndex(exerciseLibrary);
    const sessions=new Map();
    const limited=list(rows).slice(0,MAX_ROWS);
    if(!list(exerciseLibrary).length){
      errors.push(issue("empty_library","La biblioteca de ejercicios está vacía."));
    }
    if(index.duplicateIds.length){
      errors.push(issue(
        "library_duplicate_ids",
        "La biblioteca contiene IDs duplicados. Corrígela antes de importar.",
        {value:index.duplicateIds.join(", ")}
      ));
    }
    if(index.invalidExercises.length){
      errors.push(issue(
        "invalid_exercise_library",
        "La biblioteca contiene ejercicios no válidos. Corrígela antes de importar.",
        {value:index.invalidExercises.join(", ")}
      ));
    }
    const templateVersions=unique(limited.map(row=>text(row.templateVersion)).filter(Boolean));
    if(templateVersions.some(value=>Number(value)!==ROUTINE_TEMPLATE_VERSION)){
      errors.push(issue(
        "unsupported_template_version",
        `Esta versión de GymOS admite la plantilla v${ROUTINE_TEMPLATE_VERSION}.`,
        {column:"Versión plantilla",value:templateVersions.join(", ")}
      ));
    }
    if(templateVersions.length>1){
      errors.push(issue(
        "mixed_template_versions",
        "Todas las filas deben utilizar la misma versión de plantilla.",
        {column:"Versión plantilla",value:templateVersions.join(", ")}
      ));
    }
    if(list(rows).length>MAX_ROWS){
      errors.push(issue("too_many_rows",`El archivo supera el límite de ${MAX_ROWS} filas.`));
    }
    limited.forEach(row=>{
      const rowNumber=Number(row.__rowNumber)||null;
      const sessionKey=text(row.session);
      const identity=text(row.exerciseId)||text(row.exerciseName);
      if(!sessionKey&&!identity){
        errors.push(issue(
          "ambiguous_row",
          "La fila contiene datos, pero no permite identificar la sesión ni el ejercicio.",
          {row:rowNumber}
        ));
        return;
      }
      const rowErrors=[];
      if(!sessionKey) rowErrors.push(issue("session_required","Indica la sesión.",{row:rowNumber,column:"Sesión"}));
      if(sessionKey.length>80) rowErrors.push(issue("session_too_long","La sesión es demasiado larga.",{row:rowNumber,column:"Sesión",value:sessionKey}));
      if(!identity) rowErrors.push(issue("exercise_required","Indica el ID o el nombre del ejercicio.",{row:rowNumber,column:"Ejercicio"}));
      if(text(row.exerciseId).length>120) rowErrors.push(issue("exercise_id_too_long","El ID supera 120 caracteres.",{row:rowNumber,column:"ID de ejercicio",value:row.exerciseId}));
      if(text(row.exerciseName).length>160) rowErrors.push(issue("exercise_name_too_long","El nombre supera 160 caracteres.",{row:rowNumber,column:"Ejercicio",value:row.exerciseName}));
      if(text(row.sessionName).length>160) rowErrors.push(issue("session_name_too_long","El nombre de sesión supera 160 caracteres.",{row:rowNumber,column:"Nombre de sesión",value:row.sessionName}));
      if(text(row.focus).length>120) rowErrors.push(issue("focus_too_long","El enfoque supera 120 caracteres.",{row:rowNumber,column:"Enfoque",value:row.focus}));
      if(text(row.notes).length>1000) rowErrors.push(issue("notes_too_long","Las notas superan 1000 caracteres.",{row:rowNumber,column:"Notas",value:row.notes}));
      const order=finiteInteger(row.order,1,1000);
      if(order===null) rowErrors.push(issue("invalid_order","Utiliza un orden entero positivo.",{row:rowNumber,column:"Orden de ejercicio",value:row.order}));
      const sets=finiteInteger(row.sets,1,10);
      if(sets===null) rowErrors.push(issue("invalid_sets","Las series deben estar entre 1 y 10.",{row:rowNumber,column:"Series",value:row.sets}));
      const target=parseTarget(row.target);
      if(!target) rowErrors.push(issue("invalid_target","Usa repeticiones como 8-12 reps o duración como 30-45 s.",{row:rowNumber,column:"Objetivo",value:row.target}));
      const rir=parseRange(row.rir,0,10);
      if(!rir) rowErrors.push(issue("invalid_rir","El RIR debe estar entre 0 y 10.",{row:rowNumber,column:"RIR",value:row.rir}));
      const restSeconds=finiteNumber(row.restSeconds,0,600);
      if(restSeconds===null) rowErrors.push(issue("invalid_rest","El descanso debe estar entre 0 y 600 segundos.",{row:rowNumber,column:"Descanso (s)",value:row.restSeconds}));
      const durationMin=text(row.durationMin)?finiteNumber(row.durationMin,1,300):null;
      if(text(row.durationMin)&&durationMin===null) rowErrors.push(issue("invalid_duration","La duración de sesión debe estar entre 1 y 300 minutos.",{row:rowNumber,column:"Duración sesión (min)",value:row.durationMin}));
      const match=identity?matchExercise(row,index):null;
      if(match?.error) rowErrors.push(issue(
        match.error.includes("varios")?"ambiguous_exercise":"unknown_exercise",
        match.error,{row:rowNumber,column:text(row.exerciseId)?"ID de ejercicio":"Ejercicio",value:identity}
      ));
      if(rowErrors.length){errors.push(...rowErrors);return;}
      const exercise=match.exercise;
      if(match.warning) warnings.push(issue("exercise_name_mismatch",match.warning,{severity:"warning",row:rowNumber,column:"Ejercicio",value:row.exerciseName}));
      if(text(row.pattern)&&normalizeToken(row.pattern)!==normalizeToken(exercise.movementPattern)){
        warnings.push(issue("pattern_mismatch","El patrón del archivo difiere; se utiliza el de la biblioteca.",{severity:"warning",row:rowNumber,column:"Patrón",value:row.pattern}));
      }
      const authoritativeRole=text(exercise.function||exercise.role||"main");
      if(text(row.role)&&normalizeToken(row.role)!==normalizeToken(authoritativeRole)){
        warnings.push(issue("role_mismatch","La función del archivo difiere; se utiliza la de la biblioteca.",{severity:"warning",row:rowNumber,column:"Función",value:row.role}));
      }
      const authoritativeRecordType=list(exercise.recordTypes)[0]||
        (target.type==="duration"?"duration":"weight_reps");
      const targetRecordType=target.type==="duration"?"duration":"weight_reps";
      const recordTypeMismatch=authoritativeRecordType==="duration"
        ?targetRecordType!=="duration"
        :targetRecordType==="duration";
      if(recordTypeMismatch){
        warnings.push(issue(
          "record_type_mismatch",
          authoritativeRecordType==="duration"
            ?"El ejercicio se registra por duración, pero el objetivo del archivo usa repeticiones."
            :"El ejercicio se registra por repeticiones, pero el objetivo del archivo usa duración.",
          {severity:"warning",row:rowNumber,column:"Objetivo",value:row.target}
        ));
      }
      if(
        text(row.recordType)&&
        normalizeToken(row.recordType)!==normalizeToken(authoritativeRecordType)
      ){
        warnings.push(issue(
          "record_type_file_mismatch",
          "El tipo de registro del archivo difiere; se conserva el de la biblioteca.",
          {severity:"warning",row:rowNumber,column:"Tipo de registro",value:row.recordType}
        ));
      }
      if(!global.GymOSRoutineGenerator?.validateExerciseCompatibility){
        throw new Error("GymOSRoutineGenerator is required.");
      }
      const compatibility=global.GymOSRoutineGenerator.validateExerciseCompatibility({
        exercise,userProfile,currentLifeState
      });
      const compatibilityWarnings=unique([
        ...list(compatibility.blockers).map(compatibilityLabel),
        ...list(compatibility.warnings).map(compatibilityLabel),
        ...list(compatibility.unresolvedQuestions)
      ]);
      unresolvedQuestions.push(...list(compatibility.unresolvedQuestions));
      compatibilityWarnings.forEach(message=>warnings.push(issue(
        "compatibility_review",message,{severity:"warning",row:rowNumber,column:"Ejercicio",value:exercise.name}
      )));
      if(!sessions.has(sessionKey)){
        sessions.set(sessionKey,{
          key:sessionKey,name:text(row.sessionName)||`Sesión ${sessionKey}`,
          focus:text(row.focus)||"full_body",durationMin,rows:[],compatibilityReview:false
        });
      }
      const session=sessions.get(sessionKey);
      const metadataConflict=(
        text(row.sessionName)&&text(row.sessionName)!==session.name
      )||(
        text(row.focus)&&text(row.focus)!==session.focus
      )||(
        durationMin!==null&&session.durationMin!==null&&durationMin!==session.durationMin
      );
      if(metadataConflict){
        errors.push(issue(
          "inconsistent_session_metadata",
          "El nombre, enfoque y duración deben ser coherentes en todas las filas de la sesión.",
          {row:rowNumber,column:"Sesión",value:sessionKey}
        ));
        return;
      }
      if(session.rows.some(item=>item.order===order)){
        errors.push(issue("duplicate_order","El orden está duplicado dentro de la sesión.",{row:rowNumber,column:"Orden de ejercicio",value:order}));
        return;
      }
      session.compatibilityReview||=!compatibility.compatible||
        compatibilityWarnings.length>0||recordTypeMismatch;
      session.rows.push({
        order,
        exerciseId:text(exercise.id),name:text(exercise.name),
        sets,target,targetRir:rir,restSeconds,
        pattern:text(exercise.movementPattern),
        role:authoritativeRole,
        recordType:authoritativeRecordType,
        notes:text(row.notes),
        equipment:clone(exercise.requiredEquipment||[]),
        difficulty:text(exercise.difficulty),
        sourceMetadata:{
          category:text(exercise.category),
          security:{
            pregnancy:clone(exercise.pregnancy||null),
            cautionFlags:clone(exercise.cautionFlags||[]),
            exclusionFlags:clone(exercise.exclusionFlags||[])
          }
        }
      });
    });
    const orderedSessions=[...sessions.values()].sort((a,b)=>
      normalizeToken(a.key).localeCompare(normalizeToken(b.key),"es",{numeric:true})
    );
    orderedSessions.forEach(session=>{
      session.rows.sort((a,b)=>a.order-b.order||a.exerciseId.localeCompare(b.exerciseId,"en"));
      if(session.rows.length>MAX_EXERCISES_PER_SESSION){
        errors.push(issue("too_many_session_exercises",`La sesión ${session.key} supera ${MAX_EXERCISES_PER_SESSION} ejercicios.`));
      }
      const ids=session.rows.map(row=>row.exerciseId);
      if(new Set(ids).size!==ids.length){
        errors.push(issue("duplicate_exercise","Un ejercicio no puede repetirse dentro de la misma sesión.",{value:session.key}));
      }
    });
    const exerciseCount=orderedSessions.reduce((sum,session)=>sum+session.rows.length,0);
    if(exerciseCount>MAX_EXERCISES){
      errors.push(issue("too_many_exercises",`La rutina supera ${MAX_EXERCISES} ejercicios.`));
    }
    if(orderedSessions.length<2) errors.push(issue("too_few_sessions","La rutina debe contener entre 2 y 6 sesiones."));
    if(orderedSessions.length>6) errors.push(issue("too_many_sessions","La rutina debe contener entre 2 y 6 sesiones."));
    const coveredPatterns=unique(orderedSessions.flatMap(session=>session.rows.map(row=>row.pattern))).sort();
    const requiredPatterns=list(global.GymOSRoutineGenerator.ESSENTIAL_PATTERNS);
    const missingPatterns=requiredPatterns.filter(pattern=>!coveredPatterns.includes(pattern));
    if(missingPatterns.length){
      warnings.push(issue("missing_patterns","Faltan patrones de movimiento obligatorios; la propuesta requiere revisión.",{severity:"warning"}));
    }
    const reviewRequired=orderedSessions.some(session=>session.compatibilityReview)||
      missingPatterns.length>0;
    if(!global.GymOSRoutineProposals?.activationCompatibility){
      throw new Error("GymOSRoutineProposals is required.");
    }
    const activationCompatibility=global.GymOSRoutineProposals.activationCompatibility({
      sessions:orderedSessions
    });
    return {
      valid:errors.length===0,errors,warnings,ignoredRows,
      sessions:orderedSessions,exerciseCount,coveredPatterns,missingPatterns,reviewRequired,
      activationCompatibility,unresolvedQuestions:unique(unresolvedQuestions),
      templateVersion:templateVersions.length?Number(templateVersions[0]):ROUTINE_TEMPLATE_VERSION
    };
  }
  function inspectWorkbook(workbook,context={}){
    if(list(workbook?.errors).length){
      return previewModel({
        fileName:context.fileName,format:context.format,sheetName:null,rowCount:0,
        result:{valid:false,sessions:[],exerciseCount:0,warnings:[],ignoredRows:[],
          errors:clone(workbook.errors)}
      });
    }
    const formulaCells=list(workbook?.formulaCells);
    if(formulaCells.length){
      return previewModel({
        fileName:context.fileName,format:context.format,sheetName:null,rowCount:0,
        result:{valid:false,sessions:[],exerciseCount:0,warnings:[],ignoredRows:[],
          errors:[issue("formula_not_allowed","El archivo contiene fórmulas. Sustitúyelas por valores antes de importarlo.")]}
      });
    }
    if(workbook?.hasMacros){
      return previewModel({
        fileName:context.fileName,format:context.format,sheetName:null,rowCount:0,
        result:{valid:false,sessions:[],exerciseCount:0,warnings:[],ignoredRows:[],
          errors:[issue("macros_not_allowed","Los archivos con macros no están permitidos.")]}
      });
    }
    const selected=selectRoutineSheet(workbook);
    if(!selected.sheet){
      return previewModel({
        fileName:context.fileName,format:context.format,sheetName:null,rowCount:0,
        result:{valid:false,sessions:[],exerciseCount:0,warnings:[],ignoredRows:[],errors:selected.errors}
      });
    }
    const converted=tableRowsToObjects(selected.sheet.rows);
    const result=converted.errors.length
      ?{valid:false,sessions:[],exerciseCount:0,warnings:[],ignoredRows:[],errors:converted.errors}
      :convertRows(converted.rows,context);
    if(!converted.errors.length){
      result.ignoredRows=unique([
        ...list(converted.ignoredRows),...list(result.ignoredRows)
      ]).sort((a,b)=>a-b);
    }
    return previewModel({
      fileName:context.fileName,format:context.format,sheetName:selected.sheet.name,
      rowCount:converted.rows.length,result
    });
  }
  function previewModel({fileName,format,sheetName,rowCount,result}){
    const sessions=list(result?.sessions);
    return {
      state:list(result?.errors).length?"errors":list(result?.warnings).length?"warnings":"valid",
      fileName:safeFileName(fileName),format:text(format).toUpperCase(),sheetName:text(sheetName)||null,
      rowCount:Number(rowCount)||0,sessionCount:sessions.length,
      exerciseCount:Number(result?.exerciseCount)||0,
      templateVersion:Number(result?.templateVersion)||ROUTINE_TEMPLATE_VERSION,
      recognizedExerciseCount:Number(result?.exerciseCount)||0,
      sessions:sessions.map(session=>({
        key:session.key,name:session.name,focus:session.focus,
        durationMin:session.durationMin,exerciseCount:session.rows.length,
        exercises:session.rows.map(row=>({
          order:row.order,id:row.exerciseId,name:row.name,sets:row.sets,
          target:targetText(row.target),rir:rirText(row.targetRir),
          restSeconds:row.restSeconds
        }))
      })),
      warnings:clone(result?.warnings||[]),errors:clone(result?.errors||[]),
      ignoredRows:clone(result?.ignoredRows||[]),
      activationCompatible:result?.activationCompatibility?.compatible===true&&!result?.reviewRequired,
      reviewRequired:Boolean(result?.reviewRequired),
      canSave:list(result?.errors).length===0,
      imported:clone(result)
    };
  }

  function exportRoutineRows(routine){
    const rows=[];
    const keys=Array.isArray(routine?.sessions)
      ?routine.sessions.map((_,index)=>index)
      :["A","B","C"].filter(key=>list(routine?.[key]).length);
    keys.forEach((key,sessionIndex)=>{
      const session=Array.isArray(routine?.sessions)?routine.sessions[key]:null;
      const exercises=session?list(session.exercises):list(routine?.[key]);
      if(!exercises.length) return;
      const metadata=session||exercises[0]?.sessionMetadata||{};
      const sessionLabel=session
        ?text(session.name||session.label)||`Session ${String.fromCharCode(65+sessionIndex)}`
        :text(key)||String.fromCharCode(65+sessionIndex);
      exercises.forEach((item,index)=>{
        const prescription=item.prescription||{};
        rows.push({
          templateVersion:ROUTINE_TEMPLATE_VERSION,
          session:session?.legacySessionKey||String.fromCharCode(65+sessionIndex),
          sessionName:text(metadata.name||metadata.label)||`Sesión ${text(key)||String.fromCharCode(65+sessionIndex)}`,
          focus:text(metadata.focus),
          durationMin:Number(metadata.estimatedDurationMin||metadata.durationMin)||"",
          order:index+1,
          exerciseId:text(item.exerciseId||item.id),
          exerciseName:text(item.name),
          sets:Number(prescription.sets??item.sets)||"",
          target:targetText(prescription.target??item.target??item.reps),
          rir:rirText(prescription.targetRir??item.targetRir??item.rir),
          restSeconds:Number(prescription.restSeconds??item.restSeconds)||0,
          pattern:text(item.pattern||item.movementPattern),
          role:text(item.role||item.function),
          recordType:text(prescription.recordType||item.recordType),
          notes:text(item.notes)
        });
      });
    });
    return rows;
  }
  function rowsAsTable(rows){
    return [
      COLUMNS.map(column=>column.header),
      ...list(rows).map(row=>COLUMNS.map(column=>row?.[column.key]??""))
    ];
  }
  function beginsWithSpreadsheetOperator(value){
    return /^[\u0000-\u0020\u007f]*[=+\-@]/.test(String(value??""));
  }
  function protectCsvText(value){
    const raw=String(value??"");
    if(raw.startsWith(CSV_TEXT_GUARD)) return `${CSV_TEXT_GUARD}${raw}`;
    return beginsWithSpreadsheetOperator(raw)?`${CSV_TEXT_GUARD}${raw}`:raw;
  }
  function unprotectCsvText(value){
    const raw=String(value??"");
    if(raw.startsWith(`${CSV_TEXT_GUARD}${CSV_TEXT_GUARD}`)){
      return raw.slice(CSV_TEXT_GUARD.length);
    }
    if(raw.startsWith(CSV_TEXT_GUARD)){
      const logical=raw.slice(CSV_TEXT_GUARD.length);
      if(beginsWithSpreadsheetOperator(logical)) return logical;
    }
    return raw;
  }
  function csvCell(value){
    const safe=protectCsvText(value).replace(/"/g,'""');
    return `"${safe}"`;
  }
  function serializeCsv(rows){
    return "\uFEFF"+rowsAsTable(rows).map(row=>row.map(csvCell).join(",")).join("\r\n");
  }
  function parseDelimitedText(source,delimiter){
    const rows=[],row=[];
    let cell="",quoted=false;
    for(let index=0;index<source.length;index+=1){
      const character=source[index];
      if(quoted){
        if(character==='"'&&source[index+1]==='"'){
          cell+='"';index+=1;
        }else if(character==='"') quoted=false;
        else cell+=character;
        continue;
      }
      if(character==='"'){quoted=true;continue;}
      if(character===delimiter){row.push(cell);cell="";continue;}
      if(character==="\r"||character==="\n"){
        if(character==="\r"&&source[index+1]==="\n") index+=1;
        row.push(cell);cell="";
        rows.push(row.splice(0));
        continue;
      }
      cell+=character;
    }
    row.push(cell);
    if(row.some(value=>value!=="")||!rows.length) rows.push(row);
    return {rows,unterminatedQuote:quoted};
  }
  function parseCsvText(value){
    const source=String(value??"").replace(/^\uFEFF/,"");
    if(!source) return {rows:[],delimiter:null,errors:[issue("empty_file","El archivo CSV está vacío.")]};
    const candidates=[",",";"].map(delimiter=>{
      const parsed=parseDelimitedText(source,delimiter);
      return {
        delimiter,...parsed,
        header:mapHeaders(parsed.rows[0]||[])
      };
    });
    const valid=candidates.filter(candidate=>candidate.header.valid);
    const selected=valid.length===1
      ?valid[0]
      :valid.length>1
        ?valid.sort((a,b)=>b.rows[0].length-a.rows[0].length)[0]
        :candidates.sort((a,b)=>b.rows[0].length-a.rows[0].length)[0];
    const errors=[];
    if(selected.unterminatedQuote){
      errors.push(issue("invalid_csv","El CSV contiene una celda entrecomillada sin cerrar."));
    }
    if((selected.rows[0]||[]).length>MAX_COLUMNS){
      errors.push(issue("too_many_columns",`El CSV supera el límite de ${MAX_COLUMNS} columnas.`));
    }
    if(selected.rows.length-1>MAX_ROWS){
      errors.push(issue("too_many_rows",`El CSV supera el límite de ${MAX_ROWS} filas.`));
    }
    return {rows:selected.rows,delimiter:selected.delimiter,errors};
  }
  function templateModel(){
    return {
      templateVersion:ROUTINE_TEMPLATE_VERSION,
      sheets:[
        {name:"Rutina",rows:[COLUMNS.map(column=>column.header)]},
        {name:"Instrucciones",rows:clone(INSTRUCTIONS)}
      ],
      csv:serializeCsv([])
    };
  }
  function canonicalImportedRoutine(result){
    return list(result?.sessions).map((session,index)=>({
      id:text(session.sessionIdHint)||`session-${index+1}`,
      label:session.name,name:session.name,focus:session.focus,
      estimatedDurationMin:session.durationMin||null,
      estimatedDurationMinutes:session.durationMin||null,
      notes:text(session.notes)||null,
      exercises:list(session.rows).map(row=>({
        exerciseId:row.exerciseId,name:row.name,pattern:row.pattern,role:row.role,
        prescription:{
          sets:row.sets,target:clone(row.target),targetRir:clone(row.targetRir),
          restSeconds:row.restSeconds,recordType:row.recordType
        },
        movementPattern:row.pattern,function:row.role,
        requiredEquipment:clone(row.equipment),equipment:clone(row.equipment),
        difficulty:row.difficulty||null,notes:row.notes||null,
        metadata:clone(row.sourceMetadata||null)
      }))
    }));
  }
  function importFingerprint({ownerId,result,baselineHash,templateVersion=ROUTINE_TEMPLATE_VERSION}={}){
    return stableHash({
      ownerId:normalizeOwnerId(ownerId),
      routine:canonicalImportedRoutine(result),
      templateVersion:Number(templateVersion)||ROUTINE_TEMPLATE_VERSION,
      baselineHash:text(baselineHash)
    });
  }
  function buildImportedProposal({
    ownerId,result,baselineHash,format,fileName,
    templateVersion=ROUTINE_TEMPLATE_VERSION,generatedAt
  }={}){
    if(!result?.valid||list(result.errors).length) throw new Error("invalid_import");
    const timestamp=text(generatedAt);
    if(!timestamp||Number.isNaN(Date.parse(timestamp))) throw new Error("invalid_timestamp");
    const fingerprint=importFingerprint({ownerId,result,baselineHash,templateVersion});
    const sessions=canonicalImportedRoutine(result).map(session=>({
      ...session,
      exercises:session.exercises.map(exercise=>({
        ...exercise,
        selectionReason:"Ejercicio incluido en la rutina importada.",
        selectionReasons:["Ejercicio incluido en la rutina importada."],
        alternatives:[]
      }))
    }));
    const coveredPatterns=unique(sessions.flatMap(session=>session.exercises.map(item=>item.pattern))).sort();
    const missingPatterns=list(global.GymOSRoutineGenerator.ESSENTIAL_PATTERNS)
      .filter(pattern=>!coveredPatterns.includes(pattern));
    return {
      version:MODEL_VERSION,
      proposalId:`proposal-import-${fingerprint.replace(/^routine-/,"")}`,
      type:"imported",
      generatedAt:timestamp,
      reviewRequired:Boolean(result.reviewRequired),
      source:{
        type:"file_import",format:text(format).toLowerCase(),
        templateVersion:Number(templateVersion)||ROUTINE_TEMPLATE_VERSION,
        fileName:safeFileName(fileName),importFingerprint:fingerprint
      },
      inputSummary:{source:"file_import",days:sessions.length},
      rationale:["Rutina leída desde un archivo y pendiente de revisión explícita."],
      warnings:list(result.warnings).map(item=>item.message),
      unresolvedQuestions:clone(result.unresolvedQuestions||[]),
      weeklyStructure:{
        id:`imported_${sessions.length}_day`,
        label:`Rutina importada de ${sessions.length} sesiones`,
        days:sessions.length,focuses:sessions.map(session=>session.focus)
      },
      sessions,
      selectedExercises:sessions.flatMap(session=>session.exercises.map(item=>item.exerciseId)),
      coverage:{
        requiredPatterns:list(global.GymOSRoutineGenerator.ESSENTIAL_PATTERNS),
        coveredPatterns,missingPatterns,balanced:missingPatterns.length===0
      },
      activationCompatibility:clone(result.activationCompatibility),
      validation:{
        valid:true,
        results:list(result.warnings).map(item=>({
          code:item.code,severity:"warning",message:item.message
        })),
        selectedExerciseIds:sessions.flatMap(session=>session.exercises.map(item=>item.exerciseId))
      }
    };
  }
  function findExistingImport(records,ownerId,fingerprint){
    const normalizedOwner=normalizeOwnerId(ownerId);
    const matches=list(records).filter(record=>
      record?.ownerId===normalizedOwner&&
      record?.proposal?.source?.importFingerprint===fingerprint
    ).sort((a,b)=>
      text(b.lifecycle?.createdAt).localeCompare(text(a.lifecycle?.createdAt),"en")||
      text(a.proposal?.proposalId).localeCompare(text(b.proposal?.proposalId),"en")
    );
    return clone(matches[0]||null);
  }
  function exportFileName(kind,format,date=new Date(0)){
    const extension=EXPORT_FORMATS.includes(format)?format:"xlsx";
    if(kind==="template") return `gymos-plantilla-rutina-v${ROUTINE_TEMPLATE_VERSION}.${extension}`;
    const value=date instanceof Date&&!Number.isNaN(date.getTime())
      ?date.toISOString().slice(0,10):"fecha";
    return `gymos-rutina-${value}.${extension}`;
  }

  global.GymOSRoutineIO=Object.freeze({
    MODEL_VERSION,ROUTINE_TEMPLATE_VERSION,MAX_FILE_BYTES,MAX_ROWS,MAX_EXERCISES,
    MAX_EXERCISES_PER_SESSION,MAX_SHEETS,MAX_COLUMNS,FORMATS,EXPORT_FORMATS,
    COLUMNS,INSTRUCTIONS,CSV_TEXT_GUARD,
    normalizeToken,safeFileName,fileFormat,validateFileDescriptor,mapHeaders,
    tableRowsToObjects,selectRoutineSheet,parseTarget,targetText,rirText,
    matchExercise,convertRows,inspectWorkbook,previewModel,exportRoutineRows,
    rowsAsTable,protectCsvText,unprotectCsvText,serializeCsv,parseCsvText,templateModel,
    canonicalImportedRoutine,importFingerprint,buildImportedProposal,
    findExistingImport,exportFileName,stableStringify
  });
})(typeof window!=="undefined"?window:globalThis);
