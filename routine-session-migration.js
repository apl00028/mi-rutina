(function(global){
  "use strict";

  const MIGRATION_VERSION="4.2.0-alpha.1-phase-h2";
  const STORAGE_KEYS=Object.freeze({
    canonicalRoutine:"gymos:routine:canonical",
    legacyRoutine:"gymos:routine",
    canonicalDrafts:"gymos:routineDrafts",
    selectedSessionId:"gymos:selectedSessionId",
    legacySelectedSession:"gymos:selectedSession",
    migrationMetadata:"gymos:sessionModelMigration"
  });
  const LEGACY_SESSION_KEYS=Object.freeze(["A","B","C"]);

  function model(){
    if(!global.GymOSRoutineSessionModel) throw new Error("GymOSRoutineSessionModel is required.");
    return global.GymOSRoutineSessionModel;
  }
  function clone(value){
    if(value===undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }
  function text(value){return String(value??"").trim();}
  function record(value){
    return value&&Object.prototype.toString.call(value)==="[object Object]";
  }
  function stable(value){
    if(Array.isArray(value)) return value.map(stable);
    if(record(value)){
      return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
    }
    return value;
  }
  function stableStringify(value){return JSON.stringify(stable(value));}
  function same(a,b){return stableStringify(a)===stableStringify(b);}
  function incident(code,message,details={}){
    return {ok:false,code,message,...clone(details)};
  }
  function normalizeOwnerId(ownerId){
    const value=text(ownerId).toLowerCase();
    if(value==="local") return value;
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)){
      throw new Error("invalid_owner");
    }
    return value;
  }
  function parseRaw(raw){
    if(raw===null||raw===undefined) return {present:false,value:null,error:null};
    try{return {present:true,value:JSON.parse(raw),error:null};}
    catch(error){return {present:true,value:null,error:"invalid_json"};}
  }
  function sessionMap(canonicalRoutine){
    return Object.fromEntries(
      model().sortSessions(canonicalRoutine?.sessions||[])
        .filter(session=>text(session.legacySessionKey))
        .map(session=>[session.legacySessionKey,session.sessionId])
    );
  }
  function sessionByLegacyKey(canonicalRoutine,key){
    return model().sortSessions(canonicalRoutine?.sessions||[])
      .find(session=>session.legacySessionKey===key)||null;
  }
  function sessionDefinitionHash(canonicalRoutine,sessionId){
    const normalized=model().normalizeCanonicalRoutine(canonicalRoutine);
    const selected=normalized.sessions.find(session=>session.sessionId===sessionId);
    if(!selected) throw new Error("session_not_found");
    return model().canonicalRoutineHash({
      schemaVersion:normalized.schemaVersion,
      routineId:normalized.routineId,
      revision:1,
      sessions:[selected]
    });
  }
  function validateDraftContainer(container,{ownerId=null,canonicalRoutine=null}={}){
    const errors=[],warnings=[];
    let normalizedOwner=null;
    try{normalizedOwner=ownerId===null?null:normalizeOwnerId(ownerId);}
    catch(_){errors.push("invalid_owner");}
    if(!record(container)) errors.push("invalid_container");
    if(record(container)){
      if(container.schemaVersion!==model().SCHEMA_VERSION) errors.push("invalid_schema_version");
      if(!text(container.routineId)) errors.push("routine_id_required");
      if(canonicalRoutine&&container.routineId!==canonicalRoutine.routineId){
        errors.push("container_routine_mismatch");
      }
      if(!record(container.draftsBySessionId)) errors.push("invalid_drafts_map");
      if(!record(container.orphanedLegacyDrafts)) errors.push("invalid_orphans_map");
      const knownIds=new Set(canonicalRoutine?.sessions?.map(session=>session.sessionId)||[]);
      const draftIds=new Set();
      Object.entries(container.draftsBySessionId||{}).forEach(([key,draft])=>{
        if(!record(draft)) errors.push(`invalid_draft:${key}`);
        else{
          if(key!==draft.sessionId) errors.push(`draft_key_mismatch:${key}`);
          if(draft.routineId!==container.routineId) errors.push(`draft_routine_mismatch:${key}`);
          if(normalizedOwner&&draft.ownerId!==normalizedOwner) errors.push(`draft_owner_mismatch:${key}`);
          if(!text(draft.draftId)) errors.push(`draft_id_required:${key}`);
          else if(draftIds.has(draft.draftId)) errors.push(`duplicate_draft_id:${key}`);
          else draftIds.add(draft.draftId);
          if(!Array.isArray(draft.exercises)) errors.push(`draft_exercises_required:${key}`);
          if(canonicalRoutine&&!knownIds.has(key)) warnings.push(`orphaned_session:${key}`);
        }
      });
    }
    return {valid:errors.length===0,errors,warnings};
  }
  function emptyDraftContainer(routineId){
    return {
      schemaVersion:model().SCHEMA_VERSION,
      routineId,
      draftsBySessionId:{},
      orphanedLegacyDrafts:{}
    };
  }
  function migrateLegacyDrafts({
    ownerId,canonicalRoutine,legacyDraftsRaw={},draftIds={},timestamp
  }={}){
    const normalizedOwner=normalizeOwnerId(ownerId);
    const canonical=model().normalizeCanonicalRoutine(canonicalRoutine);
    const container=emptyDraftContainer(canonical.routineId);
    const mapping=sessionMap(canonical);
    LEGACY_SESSION_KEYS.forEach(key=>{
      const raw=Object.prototype.hasOwnProperty.call(legacyDraftsRaw,key)
        ?legacyDraftsRaw[key]
        :null;
      if(raw===null||raw===undefined) return;
      const parsed=parseRaw(raw);
      const sessionId=mapping[key];
      if(!parsed.present||parsed.error||!record(parsed.value)){
        container.orphanedLegacyDrafts[key]={
          legacySessionKey:key,
          reason:parsed.error||"invalid_draft",
          raw
        };
        return;
      }
      const legacyDraft=parsed.value;
      if(legacyDraft.ownerId&&legacyDraft.ownerId!==normalizedOwner){
        container.orphanedLegacyDrafts[key]={
          legacySessionKey:key,
          reason:"owner_mismatch",
          raw
        };
        return;
      }
      if(!sessionId){
        container.orphanedLegacyDrafts[key]={
          legacySessionKey:key,
          reason:"session_not_found",
          raw
        };
        return;
      }
      const assignedDraftId=text(legacyDraft.draftId||draftIds[key]);
      if(!assignedDraftId) throw new Error(`missing_draft_id:${key}`);
      const session=sessionByLegacyKey(canonical,key);
      container.draftsBySessionId[sessionId]={
        ...clone(legacyDraft),
        legacyRaw:String(raw),
        draftId:assignedDraftId,
        ownerId:normalizedOwner,
        routineId:canonical.routineId,
        routineRevision:canonical.revision,
        sessionId,
        sessionDefinitionHash:sessionDefinitionHash(canonical,sessionId),
        startedAt:legacyDraft.startedAt??timestamp??null,
        updatedAt:legacyDraft.updatedAt??timestamp??legacyDraft.startedAt??null,
        sessionSnapshot:{
          label:session.label||model().deriveSessionLabel(session.order),
          name:session.name,
          focus:session.focus,
          order:session.order,
          legacySessionKey:key
        },
        exercises:clone(Array.isArray(legacyDraft.exercises)?legacyDraft.exercises:[])
      };
    });
    const validation=validateDraftContainer(container,{
      ownerId:normalizedOwner,canonicalRoutine:canonical
    });
    if(!validation.valid) throw new Error(`invalid_draft_container:${validation.errors.join(",")}`);
    return container;
  }
  function draftStatus(draft,{ownerId,canonicalRoutine}={}){
    let normalizedOwner;
    try{normalizedOwner=normalizeOwnerId(ownerId);}
    catch(_){return {status:"stale",reasons:["invalid_owner"]};}
    if(!record(draft)) return {status:"stale",reasons:["invalid_draft"]};
    const reasons=[];
    if(draft.ownerId!==normalizedOwner) reasons.push("owner_changed");
    if(draft.routineId!==canonicalRoutine?.routineId) reasons.push("routine_changed");
    const session=canonicalRoutine?.sessions?.find(item=>item.sessionId===draft.sessionId);
    if(!session) reasons.push("session_removed");
    if(session){
      const expected=sessionDefinitionHash(canonicalRoutine,session.sessionId);
      if(draft.sessionDefinitionHash!==expected) reasons.push("session_definition_changed");
      if(Number(draft.routineRevision)>Number(canonicalRoutine.revision)){
        reasons.push("incompatible_revision");
      }
    }
    return {status:reasons.length?"stale":"current",reasons};
  }
  function markStaleDrafts(container,{ownerId,canonicalRoutine}={}){
    const output=clone(container);
    Object.values(output.draftsBySessionId||{}).forEach(draft=>{
      const result=draftStatus(draft,{ownerId,canonicalRoutine});
      if(result.status==="stale"){
        draft.stale=true;
        draft.staleReasons=result.reasons;
      }else{
        delete draft.stale;
        delete draft.staleReasons;
      }
    });
    return output;
  }
  function legacyKeyForSession(canonicalRoutine,sessionId){
    const session=canonicalRoutine?.sessions?.find(item=>item.sessionId===sessionId);
    return session?.legacySessionKey||null;
  }
  function legacyDraftShadowsMatch(canonicalRoutine,container,legacyDraftsRaw={}){
    return LEGACY_SESSION_KEYS.every(key=>{
      const raw=Object.prototype.hasOwnProperty.call(legacyDraftsRaw,key)
        ?legacyDraftsRaw[key]
        :null;
      const session=sessionByLegacyKey(canonicalRoutine,key);
      const draft=session?container?.draftsBySessionId?.[session.sessionId]:null;
      const orphan=container?.orphanedLegacyDrafts?.[key];
      if(draft) return typeof draft.legacyRaw==="string"&&draft.legacyRaw===raw;
      if(orphan) return orphan.raw===raw;
      return raw===null||raw===undefined;
    });
  }
  function legacyRoutineEquivalent(left,right){
    if(!record(left)||!record(right)) return false;
    const normalize=value=>({
      ...Object.fromEntries(
        Object.entries(value).filter(([key])=>!LEGACY_SESSION_KEYS.includes(key))
      ),
      ...Object.fromEntries(LEGACY_SESSION_KEYS.map(key=>[
        key,Array.isArray(value[key])?value[key]:[]
      ]))
    });
    return same(normalize(left),normalize(right));
  }
  function canonicalLegacyShadow(canonicalRoutine){
    const shadow={A:[],B:[],C:[]};
    model().sortSessions(canonicalRoutine?.sessions||[]).forEach(session=>{
      if(LEGACY_SESSION_KEYS.includes(session.legacySessionKey)){
        shadow[session.legacySessionKey]=clone(session.exercises);
      }
    });
    return shadow;
  }
  function reconcileCanonicalDraftShadows({
    ownerId,canonicalRoutine,canonicalDrafts,legacyDraftsRaw={},draftIds={},timestamp
  }={}){
    const output=clone(canonicalDrafts||emptyDraftContainer(canonicalRoutine.routineId));
    for(const key of LEGACY_SESSION_KEYS){
      const raw=Object.prototype.hasOwnProperty.call(legacyDraftsRaw,key)
        ?legacyDraftsRaw[key]
        :null;
      if(raw===null||raw===undefined) continue;
      const session=sessionByLegacyKey(canonicalRoutine,key);
      const current=session?output.draftsBySessionId?.[session.sessionId]:null;
      const orphan=output.orphanedLegacyDrafts?.[key];
      if(current){
        if(current.legacyRaw===raw) continue;
        const parsed=parseRaw(raw);
        if(parsed.error||!record(parsed.value)||!same(parsed.value.exercises,current.exercises)){
          return incident("draft_shadow_conflict","El borrador legacy diverge del borrador canónico.",{
            legacySessionKey:key
          });
        }
        current.legacyRaw=String(raw);
        continue;
      }
      if(orphan){
        if(orphan.raw!==raw){
          return incident("orphan_shadow_conflict","El borrador huérfano diverge de su copia legacy.",{
            legacySessionKey:key
          });
        }
        continue;
      }
      const migrated=migrateLegacyDrafts({
        ownerId,canonicalRoutine,legacyDraftsRaw:{[key]:raw},
        draftIds:{[key]:draftIds[key]},timestamp
      });
      Object.assign(output.draftsBySessionId,migrated.draftsBySessionId);
      Object.assign(output.orphanedLegacyDrafts,migrated.orphanedLegacyDrafts);
    }
    return {ok:true,container:output};
  }
  function selectedSessionId(canonicalRoutine,legacySelection,currentSessionId=null){
    const ordered=model().sortSessions(canonicalRoutine?.sessions||[]);
    if(currentSessionId&&ordered.some(session=>session.sessionId===currentSessionId)){
      return currentSessionId;
    }
    const legacy=ordered.find(session=>session.legacySessionKey===legacySelection);
    return legacy?.sessionId||ordered[0]?.sessionId||null;
  }
  function legacySelection(canonicalRoutine,sessionId){
    const ordered=model().sortSessions(canonicalRoutine?.sessions||[]);
    const selected=ordered.find(session=>session.sessionId===sessionId)||ordered[0]||null;
    if(!selected) return null;
    return selected.legacySessionKey||model().deriveSessionLabel(ordered.indexOf(selected)+1);
  }
  function reconcileLegacyRoutine({canonicalRoutine,legacyRoutine}={}){
    const canonical=model().normalizeCanonicalRoutine(canonicalRoutine);
    if(canonical.sessions.length>3){
      return incident(
        "legacy_runtime_incompatible",
        "La rutina canónica no puede editarse mediante el runtime legacy."
      );
    }
    if(!record(legacyRoutine)) return incident("invalid_legacy_routine","La rutina legacy no es válida.");
    const next=clone(canonical);
    const ordered=model().sortSessions(next.sessions);
    ordered.forEach((session,index)=>{
      const key=session.legacySessionKey||model().deriveSessionLabel(index+1);
      if(!Array.isArray(legacyRoutine[key])) throw new Error(`invalid_legacy_session:${key}`);
      session.exercises=clone(legacyRoutine[key]);
      session.legacySessionKey=key;
    });
    next.sessions=ordered;
    const normalized=model().normalizeCanonicalRoutine(next);
    return {
      ok:true,
      changed:!same(normalized,canonical),
      canonicalRoutine:normalized,
      legacyRoutine:model().canonicalToLegacyRuntimeView(normalized)
    };
  }
  function canonicalSyncDecision(localRoutine,remoteRoutine){
    if(!localRoutine) return {accept:true,idempotent:false,code:null};
    const local=model().normalizeCanonicalRoutine(localRoutine);
    const remote=model().normalizeCanonicalRoutine(remoteRoutine);
    if(same(local,remote)) return {accept:true,idempotent:true,code:null};
    if(local.routineId!==remote.routineId){
      return {accept:false,idempotent:false,code:"canonical_routine_id_conflict"};
    }
    const identity=routine=>model().sortSessions(routine.sessions).map(session=>({
      sessionId:session.sessionId,
      legacySessionKey:session.legacySessionKey??null
    }));
    if(!same(identity(local),identity(remote))){
      return {accept:false,idempotent:false,code:"canonical_session_id_conflict"};
    }
    if(remote.revision<local.revision){
      return {accept:false,idempotent:false,code:"canonical_remote_stale"};
    }
    if(remote.revision===local.revision){
      return {accept:false,idempotent:false,code:"canonical_same_revision_conflict"};
    }
    return {accept:true,idempotent:false,code:null};
  }
  function createMigrationPlan({
    ownerId,legacyRoutine,canonicalRoutine=null,canonicalDrafts=null,
    legacyDraftsRaw={},legacySelection="A",selectedSessionId:storedSelectedId=null,
    migrationMetadata=null,routineId=null,sessionIds={},draftIds={},
    migrationVersion=MIGRATION_VERSION,timestamp=null,routineMetadata={}
  }={}){
    const normalizedOwner=normalizeOwnerId(ownerId);
    if(canonicalRoutine!==null){
      const canonicalValidation=model().validateCanonicalRoutine(canonicalRoutine);
      if(!canonicalValidation.valid){
        return incident("invalid_existing_canonical","La rutina canónica existente no es válida.",{
          errors:canonicalValidation.errors
        });
      }
      const canonical=model().normalizeCanonicalRoutine(canonicalRoutine);
      const canonicalShadow=canonicalLegacyShadow(canonical);
      if(!legacyRoutineEquivalent(legacyRoutine,canonicalShadow)){
        return incident(
          "routine_shadow_conflict",
          "La rutina legacy diverge de la rutina canónica; se conserva sin sobrescribir."
        );
      }
      if(
        migrationMetadata&&(
          migrationMetadata.ownerId!==normalizedOwner||
          migrationMetadata.routineId!==canonical.routineId||
          migrationMetadata.completed!==true
        )
      ){
        return incident("incomplete_migration_marker","Los metadatos de migración no son coherentes.");
      }
      const hasDraftContainer=canonicalDrafts!==null;
      const reconciledDrafts=reconcileCanonicalDraftShadows({
        ownerId:normalizedOwner,canonicalRoutine:canonical,canonicalDrafts,
        legacyDraftsRaw,draftIds,timestamp
      });
      if(!reconciledDrafts.ok) return reconciledDrafts;
      const drafts=reconciledDrafts.container;
      const draftValidation=validateDraftContainer(drafts,{
        ownerId:normalizedOwner,canonicalRoutine:canonical
      });
      if(!draftValidation.valid){
        return incident("invalid_existing_drafts","Los borradores canónicos no son válidos.",{
          errors:draftValidation.errors
        });
      }
      const selection=selectedSessionId(canonical,legacySelection,storedSelectedId);
      const association=sessionMap(canonical);
      const expectedMetadata={
        schemaVersion:model().SCHEMA_VERSION,
        migrationVersion,
        ownerId:normalizedOwner,
        routineId:canonical.routineId,
        legacySessionMap:association,
        completed:true,
        validated:true
      };
      const complete=Boolean(
        hasDraftContainer&&
        migrationMetadata&&same(migrationMetadata,expectedMetadata)&&
        storedSelectedId===selection&&
        legacyRoutineEquivalent(legacyRoutine,canonicalShadow)&&
        legacyDraftShadowsMatch(canonical,drafts,legacyDraftsRaw)
      );
      return {
        ok:true,
        changed:!complete,
        existingCanonical:true,
        canonicalRoutine:canonical,
        legacyRoutine:canonicalLegacyShadow(canonical),
        canonicalDrafts:clone(drafts),
        selectedSessionId:selection,
        legacySelectedSession:legacySelectionForPlan(canonical,selection),
        migrationMetadata:expectedMetadata,
        association
      };
    }
    if(migrationMetadata!==null){
      return incident("incomplete_migration_marker","Existe un marcador sin rutina canónica válida.");
    }
    const legacyPlan=model().createLegacyMigrationPlan({
      legacyRoutine,routineId,sessionIds,routineMetadata,
      migrationVersion,revision:1
    });
    const canonical=model().applyLegacyMigrationPlan(legacyPlan);
    const drafts=migrateLegacyDrafts({
      ownerId:normalizedOwner,canonicalRoutine:canonical,
      legacyDraftsRaw,draftIds,timestamp
    });
    const association=sessionMap(canonical);
    const selection=selectedSessionId(canonical,legacySelection,storedSelectedId);
    return {
      ok:true,
      changed:true,
      existingCanonical:false,
      canonicalRoutine:canonical,
      legacyRoutine:model().canonicalToLegacyRuntimeView(canonical),
      canonicalDrafts:drafts,
      selectedSessionId:selection,
      legacySelectedSession:legacySelectionForPlan(canonical,selection),
      association,
      migrationMetadata:{
        schemaVersion:model().SCHEMA_VERSION,
        migrationVersion,
        ownerId:normalizedOwner,
        routineId:canonical.routineId,
        legacySessionMap:association,
        completed:true,
        validated:true
      }
    };
  }
  function legacySelectionForPlan(canonicalRoutine,sessionId){
    return legacyKeyForSession(canonicalRoutine,sessionId);
  }
  function validateMigrationPlan(plan,{ownerId}={}){
    const errors=[];
    let normalizedOwner;
    try{normalizedOwner=normalizeOwnerId(ownerId);}
    catch(_){errors.push("invalid_owner");}
    if(!plan?.ok) errors.push(plan?.code||"invalid_plan");
    const routineValidation=model().validateCanonicalRoutine(plan?.canonicalRoutine);
    if(!routineValidation.valid) errors.push("invalid_canonical_routine");
    const draftValidation=validateDraftContainer(plan?.canonicalDrafts,{
      ownerId:normalizedOwner,canonicalRoutine:plan?.canonicalRoutine
    });
    if(!draftValidation.valid) errors.push("invalid_canonical_drafts");
    if(plan?.migrationMetadata?.ownerId!==normalizedOwner) errors.push("metadata_owner_mismatch");
    if(plan?.migrationMetadata?.routineId!==plan?.canonicalRoutine?.routineId){
      errors.push("metadata_routine_mismatch");
    }
    if(!same(plan?.association,sessionMap(plan?.canonicalRoutine))){
      errors.push("association_mismatch");
    }
    if(
      plan?.selectedSessionId!==null&&
      !plan?.canonicalRoutine?.sessions?.some(session=>session.sessionId===plan.selectedSessionId)
    ) errors.push("invalid_selected_session");
    return {valid:errors.length===0,errors};
  }
  function captureRawSnapshot(rawState,keys){
    const values={};
    keys.forEach(key=>{
      const present=Object.prototype.hasOwnProperty.call(rawState,key)&&rawState[key]!==null;
      values[key]={present,raw:present?String(rawState[key]):null};
    });
    return {keys:[...keys],values};
  }
  function restoreRawSnapshot(rawState,snapshot){
    const output={...rawState};
    snapshot.keys.forEach(key=>{
      const value=snapshot.values[key];
      if(value.present) output[key]=value.raw;
      else delete output[key];
    });
    return output;
  }
  function buildMigrationWrites(plan){
    const validation=validateMigrationPlan(plan,{ownerId:plan?.migrationMetadata?.ownerId});
    if(!validation.valid) throw new Error(`invalid_migration_plan:${validation.errors.join(",")}`);
    return {
      [STORAGE_KEYS.canonicalRoutine]:JSON.stringify(plan.canonicalRoutine),
      [STORAGE_KEYS.canonicalDrafts]:JSON.stringify(plan.canonicalDrafts),
      [STORAGE_KEYS.selectedSessionId]:plan.selectedSessionId,
      [STORAGE_KEYS.migrationMetadata]:JSON.stringify(plan.migrationMetadata),
      [STORAGE_KEYS.legacyRoutine]:JSON.stringify(plan.legacyRoutine),
      [STORAGE_KEYS.legacySelectedSession]:plan.legacySelectedSession,
      ...Object.fromEntries(LEGACY_SESSION_KEYS.map(key=>{
        const session=sessionByLegacyKey(plan.canonicalRoutine,key);
        const draft=session
          ?plan.canonicalDrafts?.draftsBySessionId?.[session.sessionId]
          :null;
        const orphan=plan.canonicalDrafts?.orphanedLegacyDrafts?.[key];
        return [`gymos:draft:${key}`,draft?.legacyRaw??orphan?.raw??null];
      }))
    };
  }
  function executeRawTransaction({
    ownerId,expectedRaw={},writes={},adapter,failAt=null
  }={}){
    const normalizedOwner=normalizeOwnerId(ownerId);
    if(!adapter||typeof adapter.getRaw!=="function"||typeof adapter.setRaw!=="function"||
      typeof adapter.remove!=="function"||typeof adapter.currentOwner!=="function"){
      throw new Error("transaction_adapter_required");
    }
    const keys=[...new Set([...Object.keys(expectedRaw),...Object.keys(writes)])];
    const before=Object.fromEntries(keys.map(key=>[key,adapter.getRaw(key)]));
    function assertOwner(){
      if(normalizeOwnerId(adapter.currentOwner())!==normalizedOwner) throw new Error("owner_changed");
    }
    try{
      assertOwner();
      Object.entries(expectedRaw).forEach(([key,raw])=>{
        if(adapter.getRaw(key)!==raw) throw new Error(`source_changed:${key}`);
      });
      Object.entries(writes).forEach(([key,raw],index)=>{
        assertOwner();
        if(failAt===index||failAt===key) throw new Error(`injected_failure:${key}`);
        if(raw===null||raw===undefined) adapter.remove(key);
        else adapter.setRaw(key,String(raw));
      });
      assertOwner();
      Object.entries(writes).forEach(([key,raw])=>{
        const expected=raw===null||raw===undefined?null:String(raw);
        if(adapter.getRaw(key)!==expected) throw new Error(`post_write_mismatch:${key}`);
      });
      return {ok:true,changed:Object.keys(writes).some(key=>before[key]!==adapter.getRaw(key)),before};
    }catch(error){
      try{
        Object.entries(before).forEach(([key,raw])=>{
          if(raw===null) adapter.remove(key);
          else adapter.setRaw(key,raw);
        });
      }catch(restoreError){
        return incident("transaction_restore_failed","No se pudo restaurar la transacción.",{
          error:text(error?.message),restoreError:text(restoreError?.message)
        });
      }
      return incident("transaction_failed","La transacción se revirtió.",{
        error:text(error?.message)
      });
    }
  }

  global.GymOSRoutineSessionMigration=Object.freeze({
    MIGRATION_VERSION,STORAGE_KEYS,LEGACY_SESSION_KEYS,
    normalizeOwnerId,parseRaw,stableStringify,sessionMap,sessionDefinitionHash,
    validateDraftContainer,emptyDraftContainer,migrateLegacyDrafts,
    legacyDraftShadowsMatch,legacyRoutineEquivalent,canonicalLegacyShadow,reconcileCanonicalDraftShadows,
    draftStatus,markStaleDrafts,selectedSessionId,legacySelection,
    reconcileLegacyRoutine,canonicalSyncDecision,createMigrationPlan,validateMigrationPlan,
    captureRawSnapshot,restoreRawSnapshot,buildMigrationWrites,executeRawTransaction
  });
})(globalThis);
