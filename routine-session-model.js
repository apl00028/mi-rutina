(function(global){
  "use strict";

  const SCHEMA_VERSION="4.2";
  const MIN_ACTIVATABLE_SESSIONS=2;
  const MAX_SESSIONS=6;
  const LIMITS=Object.freeze({
    id:200,
    label:30,
    name:120,
    focus:500,
    migrationVersion:100,
    durationMinutes:1440
  });
  const HASH_IGNORED_KEYS=new Set([
    "label","uiState","viewState","panelState","selectedSession","selectedSessionId",
    "expanded","collapsed","isExpanded","createdAt","updatedAt","generatedAt",
    "timestamp","lastViewedAt"
  ]);

  class RoutineSessionModelError extends Error{
    constructor(code,message,details=[]){
      super(message);
      this.name="RoutineSessionModelError";
      this.code=code;
      this.details=details;
    }
  }

  function issue(code,path,message){
    return {code,path,message};
  }
  function isRecord(value){
    if(Object.prototype.toString.call(value)!=="[object Object]") return false;
    const prototype=Object.getPrototypeOf(value);
    return prototype===null||prototype?.constructor?.name==="Object";
  }
  function serializabilityErrors(value){
    const errors=[];
    const active=new Set();
    function visit(current,path){
      if(current===null) return;
      const type=typeof current;
      if(type==="string"||type==="boolean") return;
      if(type==="number"){
        if(!Number.isFinite(current)) errors.push(issue("non_serializable_number",path,"El número debe ser finito."));
        return;
      }
      if(type==="undefined"||type==="function"||type==="symbol"||type==="bigint"){
        errors.push(issue("non_serializable_value",path,`El valor ${type} no es serializable.`));
        return;
      }
      if(type!=="object"){
        errors.push(issue("non_serializable_value",path,"El valor no es serializable."));
        return;
      }
      if(active.has(current)){
        errors.push(issue("circular_reference",path,"Se ha detectado una referencia circular."));
        return;
      }
      if(!Array.isArray(current)&&!isRecord(current)){
        errors.push(issue("non_plain_object",path,"Solo se admiten arrays y objetos simples."));
        return;
      }
      active.add(current);
      const descriptors=Object.getOwnPropertyDescriptors(current);
      Reflect.ownKeys(descriptors).forEach(key=>{
        const descriptor=descriptors[key];
        const childPath=Array.isArray(current)?`${path}[${String(key)}]`:`${path}.${String(key)}`;
        if(typeof key==="symbol"){
          errors.push(issue("symbol_key",childPath,"Las claves Symbol no son serializables."));
        }else if(descriptor.get||descriptor.set){
          errors.push(issue("accessor_property",childPath,"No se admiten propiedades getter o setter."));
        }else if(descriptor.enumerable){
          visit(descriptor.value,childPath);
        }
      });
      active.delete(current);
    }
    visit(value,"$");
    return errors;
  }
  function cloneSerializable(value){
    if(Array.isArray(value)) return value.map(cloneSerializable);
    if(isRecord(value)){
      const output={};
      Object.keys(value).forEach(key=>{output[key]=cloneSerializable(value[key]);});
      return output;
    }
    return value;
  }
  function cloneCanonicalRoutine(routine){
    const errors=serializabilityErrors(routine);
    if(errors.length){
      throw new RoutineSessionModelError("non_serializable","La rutina no es serializable.",errors);
    }
    return cloneSerializable(routine);
  }
  function validText(value,{required=false,max=LIMITS.name}={}){
    return typeof value==="string"&&(!required||value.trim().length>0)&&value.length<=max;
  }
  function validateCanonicalRoutine(routine){
    const errors=serializabilityErrors(routine);
    const warnings=[];
    if(errors.length){
      return {
        valid:false,
        errors,
        warnings,
        activation:{compatible:false,code:"structurally_invalid",sessionCount:null}
      };
    }
    if(!isRecord(routine)){
      errors.push(issue("invalid_routine","$","La rutina debe ser un objeto."));
    }
    if(isRecord(routine)){
      if(routine.schemaVersion!==SCHEMA_VERSION){
        errors.push(issue("invalid_schema_version","$.schemaVersion",`schemaVersion debe ser ${SCHEMA_VERSION}.`));
      }
      if(!validText(routine.routineId,{required:true,max:LIMITS.id})){
        errors.push(issue("invalid_routine_id","$.routineId","routineId es obligatorio y debe ser un identificador razonable."));
      }
      if(!Number.isInteger(routine.revision)||routine.revision<1){
        errors.push(issue("invalid_revision","$.revision","revision debe ser un entero positivo."));
      }
      if(!Array.isArray(routine.sessions)){
        errors.push(issue("invalid_sessions","$.sessions","sessions debe ser un array."));
      }else{
        if(routine.sessions.length>MAX_SESSIONS){
          errors.push(issue("too_many_sessions","$.sessions",`No se admiten más de ${MAX_SESSIONS} sesiones.`));
        }
        const sessionIds=new Set();
        const orders=new Set();
        routine.sessions.forEach((session,index)=>{
          const path=`$.sessions[${index}]`;
          if(!isRecord(session)){
            errors.push(issue("invalid_session",path,"La sesión debe ser un objeto."));
            return;
          }
          if(!validText(session.sessionId,{required:true,max:LIMITS.id})){
            errors.push(issue("invalid_session_id",`${path}.sessionId`,"sessionId es obligatorio y debe ser razonable."));
          }else if(sessionIds.has(session.sessionId)){
            errors.push(issue("duplicate_session_id",`${path}.sessionId`,"sessionId debe ser único."));
          }else sessionIds.add(session.sessionId);
          if(!Number.isInteger(session.order)||session.order<1){
            errors.push(issue("invalid_session_order",`${path}.order`,"order debe ser un entero positivo."));
          }else if(orders.has(session.order)){
            errors.push(issue("duplicate_session_order",`${path}.order`,"order debe ser único."));
          }else orders.add(session.order);
          if(session.label!==undefined&&!validText(session.label,{max:LIMITS.label})){
            errors.push(issue("invalid_session_label",`${path}.label`,"label debe ser un texto corto."));
          }
          if(!validText(session.name,{max:LIMITS.name})){
            errors.push(issue("invalid_session_name",`${path}.name`,"name debe ser texto y respetar el límite."));
          }else if(!session.name.trim()){
            warnings.push(issue("missing_session_name",`${path}.name`,"La sesión todavía no tiene nombre."));
          }
          if(!validText(session.focus,{max:LIMITS.focus})){
            errors.push(issue("invalid_session_focus",`${path}.focus`,"focus debe ser texto y respetar el límite."));
          }
          if(session.estimatedDurationMinutes!==null&&session.estimatedDurationMinutes!==undefined&&(
            !Number.isInteger(session.estimatedDurationMinutes)||
            session.estimatedDurationMinutes<1||
            session.estimatedDurationMinutes>LIMITS.durationMinutes
          )){
            errors.push(issue("invalid_session_duration",`${path}.estimatedDurationMinutes`,"La duración debe ser un entero positivo acotado."));
          }else if(session.estimatedDurationMinutes===null||session.estimatedDurationMinutes===undefined){
            warnings.push(issue("missing_session_duration",`${path}.estimatedDurationMinutes`,"La duración todavía no está definida."));
          }
          if(!Array.isArray(session.exercises)){
            errors.push(issue("invalid_session_exercises",`${path}.exercises`,"exercises debe ser un array."));
          }
          if(session.legacySessionKey!==undefined&&!validText(session.legacySessionKey,{required:true,max:LIMITS.label})){
            errors.push(issue("invalid_legacy_session_key",`${path}.legacySessionKey`,"legacySessionKey no es válido."));
          }
        });
      }
    }
    const sessionCount=Array.isArray(routine?.sessions)?routine.sessions.length:null;
    let activationCode=null;
    if(errors.length) activationCode="structurally_invalid";
    else if(sessionCount<MIN_ACTIVATABLE_SESSIONS) activationCode="not_enough_sessions";
    return {
      valid:errors.length===0,
      errors,
      warnings,
      activation:{
        compatible:errors.length===0&&sessionCount>=MIN_ACTIVATABLE_SESSIONS&&sessionCount<=MAX_SESSIONS,
        code:activationCode,
        sessionCount
      }
    };
  }
  function sortSessions(sessions){
    if(!Array.isArray(sessions)){
      throw new RoutineSessionModelError("invalid_sessions","sessions debe ser un array.");
    }
    const errors=serializabilityErrors(sessions);
    if(errors.length) throw new RoutineSessionModelError("non_serializable","Las sesiones no son serializables.",errors);
    return cloneSerializable(sessions).sort((a,b)=>{
      const orderA=Number.isInteger(a?.order)?a.order:Number.MAX_SAFE_INTEGER;
      const orderB=Number.isInteger(b?.order)?b.order:Number.MAX_SAFE_INTEGER;
      if(orderA!==orderB) return orderA-orderB;
      return String(a?.sessionId??"").localeCompare(String(b?.sessionId??""),"en");
    });
  }
  function normalizeCanonicalRoutine(routine){
    const validation=validateCanonicalRoutine(routine);
    if(!validation.valid){
      throw new RoutineSessionModelError("invalid_canonical_routine","La rutina canónica no es válida.",validation.errors);
    }
    const normalized=cloneSerializable(routine);
    normalized.sessions=sortSessions(normalized.sessions);
    return normalized;
  }
  function isCanonicalRoutine(value){
    return validateCanonicalRoutine(value).valid;
  }
  function deriveSessionLabel(order){
    if(!Number.isInteger(order)||order<1||order>MAX_SESSIONS){
      throw new RoutineSessionModelError("invalid_session_order","El orden debe estar entre 1 y 6.");
    }
    return String.fromCharCode(64+order);
  }
  function canonicalize(value){
    if(Array.isArray(value)) return value.map(canonicalize);
    if(isRecord(value)){
      const output={};
      Object.keys(value).sort().forEach(key=>{output[key]=canonicalize(value[key]);});
      return output;
    }
    return value;
  }
  function stripHashNoise(value){
    if(Array.isArray(value)) return value.map(stripHashNoise);
    if(isRecord(value)){
      const output={};
      Object.keys(value).sort().forEach(key=>{
        if(!HASH_IGNORED_KEYS.has(key)) output[key]=stripHashNoise(value[key]);
      });
      return output;
    }
    return value;
  }
  function stableHash(value){
    const source=JSON.stringify(canonicalize(value));
    let hash=2166136261;
    for(let index=0;index<source.length;index+=1){
      hash^=source.charCodeAt(index);
      hash=Math.imul(hash,16777619);
    }
    return (hash>>>0).toString(36).padStart(7,"0");
  }
  function canonicalRoutineHash(routine){
    const normalized=normalizeCanonicalRoutine(routine);
    const structural={
      schemaVersion:normalized.schemaVersion,
      routineId:normalized.routineId,
      revision:normalized.revision,
      sessions:normalized.sessions.map(session=>({
        sessionId:session.sessionId,
        order:session.order,
        name:session.name,
        focus:session.focus,
        estimatedDurationMinutes:session.estimatedDurationMinutes??null,
        exercises:stripHashNoise(session.exercises)
      }))
    };
    return stableHash(structural);
  }
  function legacyEntries(legacyRoutine){
    if(!isRecord(legacyRoutine)){
      throw new RoutineSessionModelError("invalid_legacy_routine","La rutina legacy debe ser un objeto.");
    }
    return ["A","B","C"].map((key,index)=>{
      const exercises=legacyRoutine[key];
      if(exercises===undefined) return null;
      if(!Array.isArray(exercises)){
        throw new RoutineSessionModelError("invalid_legacy_session",`La sesión ${key} debe ser un array.`);
      }
      return exercises.length?{key,order:index+1,exercises}:null;
    }).filter(Boolean);
  }
  function createLegacyMigrationPlan({
    legacyRoutine,
    routineId,
    sessionIds={},
    sessionMetadata={},
    routineMetadata={},
    migrationVersion,
    revision=1
  }={}){
    if(isCanonicalRoutine(legacyRoutine)){
      return {kind:"canonical_passthrough",routine:cloneCanonicalRoutine(legacyRoutine)};
    }
    const inputErrors=serializabilityErrors({
      legacyRoutine,sessionIds,sessionMetadata,routineMetadata
    });
    if(inputErrors.length){
      throw new RoutineSessionModelError("non_serializable","El plan legacy contiene datos no serializables.",inputErrors);
    }
    if(!validText(routineId,{required:true,max:LIMITS.id})){
      throw new RoutineSessionModelError("invalid_routine_id","routineId es obligatorio.");
    }
    if(!validText(migrationVersion,{required:true,max:LIMITS.migrationVersion})){
      throw new RoutineSessionModelError("invalid_migration_version","migrationVersion es obligatoria.");
    }
    if(!Number.isInteger(revision)||revision<1){
      throw new RoutineSessionModelError("invalid_revision","revision debe ser un entero positivo.");
    }
    const sessions=legacyEntries(legacyRoutine).map(entry=>{
      const sessionId=sessionIds[entry.key];
      if(!validText(sessionId,{required:true,max:LIMITS.id})){
        throw new RoutineSessionModelError(
          "missing_legacy_session_id",
          `Falta un sessionId explícito para la sesión ${entry.key}.`,
          [issue("missing_legacy_session_id",`$.sessionIds.${entry.key}`,`Falta el ID de ${entry.key}.`)]
        );
      }
      const metadata=isRecord(sessionMetadata[entry.key])?cloneSerializable(sessionMetadata[entry.key]):{};
      delete metadata.sessionId;
      delete metadata.order;
      delete metadata.exercises;
      delete metadata.legacySessionKey;
      return {
        ...metadata,
        sessionId,
        order:entry.order,
        label:validText(metadata.label,{required:true,max:LIMITS.label})?metadata.label:entry.key,
        name:typeof metadata.name==="string"?metadata.name:"",
        focus:typeof metadata.focus==="string"?metadata.focus:"",
        estimatedDurationMinutes:metadata.estimatedDurationMinutes??null,
        exercises:cloneSerializable(entry.exercises),
        legacySessionKey:entry.key
      };
    });
    const safeRoutineMetadata=isRecord(routineMetadata)?cloneSerializable(routineMetadata):{};
    delete safeRoutineMetadata.schemaVersion;
    delete safeRoutineMetadata.routineId;
    delete safeRoutineMetadata.revision;
    delete safeRoutineMetadata.sessions;
    return {
      kind:"legacy_abc_to_canonical",
      migrationVersion,
      routine:{
        ...safeRoutineMetadata,
        schemaVersion:SCHEMA_VERSION,
        routineId,
        revision,
        sessions
      }
    };
  }
  function applyLegacyMigrationPlan(plan){
    if(!isRecord(plan)){
      throw new RoutineSessionModelError("invalid_migration_plan","El plan de migración no es válido.");
    }
    if(plan.kind==="canonical_passthrough") return cloneCanonicalRoutine(plan.routine);
    if(plan.kind!=="legacy_abc_to_canonical"){
      throw new RoutineSessionModelError("invalid_migration_plan","El tipo de plan de migración no es válido.");
    }
    return normalizeCanonicalRoutine(plan.routine);
  }
  function canonicalToLegacyRuntimeView(routine){
    const normalized=normalizeCanonicalRoutine(routine);
    if(normalized.sessions.length>3){
      throw new RoutineSessionModelError(
        "legacy_runtime_incompatible",
        "El runtime legacy no admite más de tres sesiones."
      );
    }
    const view={};
    normalized.sessions.forEach((session,index)=>{
      view[deriveSessionLabel(index+1)]=cloneSerializable(session.exercises);
    });
    return view;
  }

  global.GymOSRoutineSessionModel=Object.freeze({
    SCHEMA_VERSION,
    MIN_ACTIVATABLE_SESSIONS,
    MAX_SESSIONS,
    LIMITS,
    RoutineSessionModelError,
    normalizeCanonicalRoutine,
    validateCanonicalRoutine,
    canonicalRoutineHash,
    sortSessions,
    deriveSessionLabel,
    createLegacyMigrationPlan,
    applyLegacyMigrationPlan,
    canonicalToLegacyRuntimeView,
    isCanonicalRoutine,
    cloneCanonicalRoutine
  });
})(globalThis);
