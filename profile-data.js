(function(global){
  "use strict";

  const DATA_SCHEMA_VERSION="4.1.0-alpha.1";
  const STORAGE_KEYS=Object.freeze({
    dataSchemaVersion:"gymos:dataSchemaVersion",
    userProfile:"gymos:userProfile",
    currentLifeState:"gymos:currentLifeState",
    lifeStateHistory:"gymos:lifeStateHistory",
    activeGoalCycle:"gymos:activeGoalCycle",
    goalsHistory:"gymos:goalsHistory",
    activeTrainingPhase:"gymos:activeTrainingPhase",
    trainingPhases:"gymos:trainingPhases"
  });
  const MANAGED_KEYS=Object.freeze([
    STORAGE_KEYS.userProfile,
    STORAGE_KEYS.currentLifeState,
    STORAGE_KEYS.lifeStateHistory,
    STORAGE_KEYS.activeGoalCycle,
    STORAGE_KEYS.goalsHistory,
    STORAGE_KEYS.activeTrainingPhase,
    STORAGE_KEYS.trainingPhases
  ]);
  const SNAPSHOT_PREFIX="gymos:preMigration:4.1.0-alpha.1:";
  const MIGRATION_INTERNAL_KEY_PREFIXES=Object.freeze([SNAPSHOT_PREFIX]);
  const SNAPSHOT_DATA_KEYS=Object.freeze([
    "gymos:routine",
    "gymos:history",
    "gymos:bodyWeight",
    "gymos:body",
    "gymos:bodySummaryMetrics",
    "gymos:blocks",
    "gymos:trainingBlocks",
    "gymos:activeBlockId",
    "gymos:exerciseLibrary",
    "gymos:exerciseSubstitutions",
    "gymos:favoriteSubstitutions",
    "gymos:coachSettings",
    "gymos:coachProposals",
    "gymos:coachSnapshots",
    "gymos:workoutAnalyses",
    "gymos:coachChat",
    "gymos:nutritionSettings",
    "gymos:nutritionEntries",
    "gymos:professionalNutritionPlans",
    "gymos:appPreferences",
    "gymos:quickActions",
    "gymos:healthSettings",
    "gymos:healthEntries",
    "gymos:healthImports",
    "gymos:dailyRecovery",
    "gymos:recoveryCheckins",
    "gymos:onboardingProfile",
    "gymos:draft:A",
    "gymos:draft:B",
    "gymos:draft:C",
    "gymos:selectedSession",
    "gymos:restSeconds",
    "gymos:weeklyGoal",
    "gymos:weeklyGoalCelebrated",
    "gymos:dailyThought",
    ...MANAGED_KEYS
  ]);

  const GOAL_OPTIONS=Object.freeze([
    {id:"fat_loss",label:"Perder grasa"},
    {id:"muscle_gain",label:"Ganar masa muscular"},
    {id:"strength_gain",label:"Ganar fuerza"},
    {id:"maintain_strength",label:"Mantener fuerza"},
    {id:"maintenance",label:"Mantenerme"},
    {id:"return_to_training",label:"Retomar el gimnasio"},
    {id:"general_health",label:"Mejorar la salud general"},
    {id:"mobility",label:"Mejorar la movilidad"},
    {id:"endurance",label:"Mejorar la resistencia"},
    {id:"sport_event",label:"Preparar una prueba deportiva"},
    {id:"pregnancy_training",label:"Entrenar durante el embarazo"},
    {id:"maintain_activity",label:"Mantener actividad"},
    {id:"wellbeing",label:"Mejorar el bienestar"},
    {id:"maintain_habits",label:"Mantener hábitos"},
    {id:"postpartum_recovery",label:"Recuperación postparto"},
    {id:"custom",label:"Otro objetivo"}
  ]);
  const LIFE_STATE_OPTIONS=Object.freeze([
    {id:"general",label:"Estado general"},
    {id:"pregnancy",label:"Embarazo"},
    {id:"postpartum",label:"Postparto"},
    {id:"injury_recovery",label:"Recuperación de lesión"},
    {id:"surgery_recovery",label:"Recuperación de cirugía"},
    {id:"special_situation",label:"Otra situación especial"}
  ]);
  const TRAINING_PHASE_OPTIONS=Object.freeze([
    {id:"adaptation",label:"Adaptación"},
    {id:"return_to_training",label:"Retomar entrenamiento"},
    {id:"maintenance",label:"Mantenimiento"},
    {id:"fat_loss",label:"Pérdida de grasa"},
    {id:"muscle_gain",label:"Ganancia muscular"},
    {id:"strength",label:"Fuerza"},
    {id:"deload",label:"Descarga"},
    {id:"pregnancy",label:"Embarazo"},
    {id:"postpartum",label:"Postparto"},
    {id:"sport_preparation",label:"Preparación deportiva"},
    {id:"custom",label:"Personalizada"}
  ]);
  const GOAL_FINAL_STATUSES=new Set(["completed","abandoned","replaced"]);
  const PHASE_FINAL_STATUSES=new Set(["completed","abandoned","replaced"]);

  function nowIso(){return new Date().toISOString();}
  function todayIso(){return nowIso().slice(0,10);}
  function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
  function makeId(prefix){
    return global.crypto?.randomUUID
      ?`${prefix}-${global.crypto.randomUUID()}`
      :`${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
  function cleanText(value,max=500){
    return String(value??"").trim().replace(/\s+/g," ").slice(0,max);
  }
  function cleanMultiline(value,max=2000){
    return String(value??"").trim().slice(0,max);
  }
  function normalizeTextArray(value){
    const source=Array.isArray(value)?value:String(value??"").split(/[,;\n]+/);
    return [...new Set(source.map(item=>cleanText(item,160)).filter(Boolean))].slice(0,50);
  }
  function numberOrNull(value){
    if(value===""||value===null||value===undefined) return null;
    const parsed=Number(value);
    return Number.isFinite(parsed)?parsed:null;
  }
  function isoDate(value,{optional=true}={}){
    if(!value) return optional?null:false;
    const text=String(value);
    const parsed=new Date(text);
    return Number.isNaN(parsed.getTime())?false:text.slice(0,10);
  }
  function readJson(key,fallback=null){
    try{
      const raw=localStorage.getItem(key);
      return raw===null?clone(fallback):JSON.parse(raw);
    }catch(error){
      return clone(fallback);
    }
  }
  function writeJson(key,value,{mark=true}={}){
    if(value===null||value===undefined) localStorage.removeItem(key);
    else localStorage.setItem(key,JSON.stringify(value));
    if(mark&&typeof global.markLocalUpdated==="function") global.markLocalUpdated();
    return value;
  }
  function timestampOf(item){
    const parsed=new Date(item?.updatedAt||item?.createdAt||0);
    return Number.isNaN(parsed.getTime())?0:parsed.getTime();
  }
  function preferNewer(first,second){
    if(!first) return second||null;
    if(!second) return first;
    return timestampOf(second)>timestampOf(first)?second:first;
  }
  function mergeById(){
    const byId=new Map();
    [...arguments].flat().filter(Boolean).forEach(item=>{
      if(!item?.id) return;
      byId.set(item.id,preferNewer(byId.get(item.id),item));
    });
    return [...byId.values()].sort((a,b)=>timestampOf(b)-timestampOf(a));
  }
  function inactiveOnly(items){
    return (Array.isArray(items)?items:[]).filter(item=>item?.id&&!(item.status==="active"&&!item.endedAt));
  }
  function markUpdated(mark){
    if(mark&&typeof global.markLocalUpdated==="function") global.markLocalUpdated();
  }
  function normalizeOwnerId(ownerId){
    const value=String(ownerId??"").trim();
    if(value==="local") return value;
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if(!uuid.test(value)){
      throw new Error("La migración necesita un identificador de propietario válido.");
    }
    return value.toLowerCase();
  }
  function migrationSnapshotKey(ownerId){
    return `${SNAPSHOT_PREFIX}${normalizeOwnerId(ownerId)}`;
  }
  function migrationInternalKeys(ownerId){
    return Object.freeze([migrationSnapshotKey(ownerId)]);
  }
  function removeMigrationInternalData(ownerId){
    migrationInternalKeys(ownerId).forEach(key=>localStorage.removeItem(key));
  }

  function calculatePregnancyTrimester(week){
    const numeric=Number(week);
    if(!Number.isInteger(numeric)||numeric<1||numeric>42) return null;
    if(numeric<=13) return {id:"first",label:"Primer trimestre"};
    if(numeric<=27) return {id:"second",label:"Segundo trimestre"};
    return {id:"third",label:"Tercer trimestre"};
  }
  function normalizePregnancyDetails(input={}){
    const pregnancyWeek=Number(input.pregnancyWeek);
    if(!Number.isInteger(pregnancyWeek)||pregnancyWeek<1||pregnancyWeek>42){
      throw new Error("La semana de embarazo debe estar entre 1 y 42.");
    }
    return {
      pregnancyWeek,
      pregnancyTrimester:calculatePregnancyTrimester(pregnancyWeek)?.id||null,
      estimatedDueDate:isoDate(input.estimatedDueDate),
      pregnancyType:["singleton","multiple","unknown"].includes(input.pregnancyType)?input.pregnancyType:"unknown",
      trainedBeforePregnancy:["yes","no","unknown"].includes(input.trainedBeforePregnancy)?input.trainedBeforePregnancy:"unknown",
      previousTrainingLevel:["none","beginner","intermediate","advanced","unknown"].includes(input.previousTrainingLevel)?input.previousTrainingLevel:"unknown",
      medicalExerciseClearance:["yes","no","unknown"].includes(input.medicalExerciseClearance)?input.medicalExerciseClearance:"unknown",
      highRiskStatus:["yes","no","unknown"].includes(input.highRiskStatus)?input.highRiskStatus:"unknown",
      currentLimitations:normalizeTextArray(input.currentLimitations),
      professionalRestrictions:normalizeTextArray(input.professionalRestrictions),
      requiresProfessionalReview:Boolean(input.requiresProfessionalReview)
    };
  }

  function migrateLegacyGoal(value){
    const raw=cleanText(value,120);
    if(!raw) return null;
    if(GOAL_OPTIONS.some(option=>option.id===raw)){
      return {id:raw,customGoalLabel:null,notes:""};
    }
    const normalized=raw.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[_-]+/g," ");
    const mappings={
      "fat loss":"fat_loss","perder grasa":"fat_loss",
      "muscle":"muscle_gain","ganar musculo":"muscle_gain",
      "strength":"strength_gain","ganar fuerza":"strength_gain","mejorar fuerza":"strength_gain",
      "maintain":"maintenance","mantenerme":"maintenance","mantener forma fisica":"maintenance",
      "return":"return_to_training","retomar el gimnasio":"return_to_training","retomar el entrenamiento":"return_to_training",
      "health":"general_health","mejorar salud y condicion fisica":"general_health"
    };
    return mappings[normalized]
      ?{id:mappings[normalized],customGoalLabel:null,notes:""}
      :{id:"custom",customGoalLabel:raw,notes:`Objetivo migrado desde GymOS anterior: ${raw}`};
  }
  function validateGoalSelection(primaryGoal,secondaryGoals=[],options={}){
    const primary=cleanText(primaryGoal,80);
    const secondary=(Array.isArray(secondaryGoals)?secondaryGoals:[]).map(item=>cleanText(item,80)).filter(Boolean);
    const allowed=new Set(GOAL_OPTIONS.map(option=>option.id));
    const errors=[];
    if(!primary) errors.push("Selecciona exactamente un objetivo principal.");
    if(secondary.length>2) errors.push("Puedes seleccionar como máximo dos objetivos secundarios.");
    if(new Set(secondary).size!==secondary.length) errors.push("Los objetivos secundarios no pueden repetirse.");
    if(secondary.includes(primary)) errors.push("El objetivo principal no puede repetirse como secundario.");
    if(primary&&!allowed.has(primary)) errors.push("El objetivo principal no es válido.");
    if(secondary.some(id=>!allowed.has(id))) errors.push("Hay un objetivo secundario no válido.");
    if(primary==="custom"&&!cleanText(options.customGoalLabel,120)) errors.push("Describe el objetivo personalizado.");
    return {valid:errors.length===0,errors,primaryGoal:primary,secondaryGoals:secondary};
  }
  function buildGoalCycle(input={}){
    const validation=validateGoalSelection(input.primaryGoal,input.secondaryGoals,{customGoalLabel:input.customGoalLabel});
    if(!validation.valid) throw new Error(validation.errors[0]);
    const startedAt=isoDate(input.startedAt,{optional:false});
    if(!startedAt) throw new Error("La fecha de inicio del objetivo no es válida.");
    const plannedReviewAt=isoDate(input.plannedReviewAt);
    if(input.plannedReviewAt&&!plannedReviewAt) throw new Error("La fecha de revisión no es válida.");
    const now=nowIso();
    return {
      id:input.id||makeId("goal"),
      primaryGoal:validation.primaryGoal,
      secondaryGoals:validation.secondaryGoals,
      customGoalLabel:validation.primaryGoal==="custom"?cleanText(input.customGoalLabel,120):null,
      startedAt,plannedReviewAt,endedAt:null,status:"active",
      changeReason:cleanText(input.changeReason,500),
      notes:cleanMultiline(input.notes,2000),
      lifeStateId:input.lifeStateId||null,
      createdAt:input.createdAt||now,updatedAt:input.updatedAt||now
    };
  }
  function buildTrainingPhase(input={}){
    if(!TRAINING_PHASE_OPTIONS.some(option=>option.id===input.type)) throw new Error("La fase seleccionada no es válida.");
    const startedAt=isoDate(input.startedAt,{optional:false});
    if(!startedAt) throw new Error("La fecha de inicio de la fase no es válida.");
    const plannedReviewAt=isoDate(input.plannedReviewAt);
    if(input.plannedReviewAt&&!plannedReviewAt) throw new Error("La fecha de revisión de la fase no es válida.");
    const now=nowIso();
    return {
      id:input.id||makeId("phase"),type:input.type,
      name:input.type==="custom"?cleanText(input.name,120):(TRAINING_PHASE_OPTIONS.find(option=>option.id===input.type)?.label||""),
      goalCycleId:input.goalCycleId||null,lifeStateId:input.lifeStateId||null,
      startedAt,plannedReviewAt,endedAt:null,status:"active",
      notes:cleanMultiline(input.notes,2000),
      createdAt:input.createdAt||now,updatedAt:input.updatedAt||now
    };
  }
  function normalizeUserProfile(input={},existing=null){
    const now=nowIso();
    const weeklyAvailability=numberOrNull(input.weeklyAvailability??input.days);
    const preferredSessionDurationMin=numberOrNull(input.preferredSessionDurationMin??input.duration);
    if(weeklyAvailability!==null&&(!Number.isInteger(weeklyAvailability)||weeklyAvailability<1||weeklyAvailability>7)){
      throw new Error("La disponibilidad semanal debe estar entre 1 y 7 días.");
    }
    if(preferredSessionDurationMin!==null&&(preferredSessionDurationMin<=0||preferredSessionDurationMin>240)){
      throw new Error("La duración de sesión no es válida.");
    }
    const experienceMap={new:"beginner",beginner:"beginner",intermediate:"intermediate",advanced:"advanced",return:"returning",returning:"returning"};
    const locationMap={gym:"gym",home:"home",both:"mixed",mixed:"mixed",other:"other"};
    return {
      id:existing?.id||input.id||makeId("profile"),
      name:cleanText(input.name,80),
      age:numberOrNull(input.age),
      dateOfBirth:isoDate(input.dateOfBirth),
      sex:["male","female","other",""].includes(input.sex)?input.sex:"",
      heightCm:numberOrNull(input.heightCm??input.height),
      weightKg:numberOrNull(input.weightKg??input.weight),
      trainingExperience:experienceMap[input.trainingExperience??input.experience]||"beginner",
      weeklyAvailability,preferredSessionDurationMin,
      trainingLocation:locationMap[input.trainingLocation??input.location]||"other",
      availableEquipment:normalizeTextArray(input.availableEquipment??input.equipment),
      injuries:normalizeTextArray(input.injuries??input.injuryNotes),
      painAreas:normalizeTextArray(input.painAreas),
      medicalRestrictions:normalizeTextArray(input.medicalRestrictions??(input.medicalRestriction==="yes"?"Pendiente de concretar":"")),
      avoidedExercises:normalizeTextArray(input.avoidedExercises??input.avoidExercises),
      createdAt:existing?.createdAt||input.createdAt||now,updatedAt:input.updatedAt||now
    };
  }
  function buildLifeState(input={},existing=null){
    const type=LIFE_STATE_OPTIONS.some(option=>option.id===input.type)?input.type:"general";
    const now=nowIso();
    const details=type==="pregnancy"
      ?normalizePregnancyDetails(input.details||input)
      :{
        currentLimitations:normalizeTextArray(input.details?.currentLimitations??input.currentLimitations),
        professionalRestrictions:normalizeTextArray(input.details?.professionalRestrictions??input.professionalRestrictions),
        notes:cleanMultiline(input.details?.notes??input.notes,2000)
      };
    return {
      id:existing?.id||input.id||makeId("life"),
      type,status:"active",startedAt:isoDate(input.startedAt)||todayIso(),endedAt:null,details,
      createdAt:existing?.createdAt||input.createdAt||now,updatedAt:input.updatedAt||now
    };
  }

  function getUserProfile(){return readJson(STORAGE_KEYS.userProfile,null);}
  function saveUserProfile(input,{mark=true}={}){
    return writeJson(STORAGE_KEYS.userProfile,normalizeUserProfile(input,getUserProfile()),{mark});
  }
  function getCurrentLifeState(){return readJson(STORAGE_KEYS.currentLifeState,null);}
  function getLifeStateHistory(){return inactiveOnly(readJson(STORAGE_KEYS.lifeStateHistory,[]));}
  function setCurrentLifeState(input,{mark=true}={}){
    const previous=getCurrentLifeState();
    const now=nowIso();
    const history=previous
      ?mergeById(getLifeStateHistory(),[{...previous,status:"replaced",endedAt:isoDate(input.startedAt)||todayIso(),updatedAt:now}])
      :getLifeStateHistory();
    const next=buildLifeState(input);
    writeJson(STORAGE_KEYS.lifeStateHistory,inactiveOnly(history),{mark:false});
    writeJson(STORAGE_KEYS.currentLifeState,next,{mark:false});
    markUpdated(mark);
    return next;
  }
  function getActiveGoalCycle(){return readJson(STORAGE_KEYS.activeGoalCycle,null);}
  function getGoalsHistory(){return inactiveOnly(readJson(STORAGE_KEYS.goalsHistory,[]));}
  function startGoalCycle(input,{mark=true}={}){
    const previous=getActiveGoalCycle();
    const now=nowIso();
    const history=previous
      ?mergeById(getGoalsHistory(),[{...previous,status:"replaced",endedAt:isoDate(input.startedAt)||todayIso(),updatedAt:now}])
      :getGoalsHistory();
    const next=buildGoalCycle({...input,lifeStateId:input.lifeStateId||getCurrentLifeState()?.id});
    writeJson(STORAGE_KEYS.goalsHistory,inactiveOnly(history),{mark:false});
    writeJson(STORAGE_KEYS.activeGoalCycle,next,{mark:false});
    markUpdated(mark);
    return next;
  }
  function closeGoalCycle(status="completed",{mark=true}={}){
    if(!GOAL_FINAL_STATUSES.has(status)) throw new Error("El estado final del objetivo no es válido.");
    const current=getActiveGoalCycle();
    if(!current) return null;
    const now=nowIso();
    const closed={...current,status,endedAt:todayIso(),updatedAt:now};
    writeJson(STORAGE_KEYS.goalsHistory,mergeById(getGoalsHistory(),[closed]),{mark:false});
    writeJson(STORAGE_KEYS.activeGoalCycle,null,{mark:false});
    markUpdated(mark);
    return closed;
  }
  function getActiveTrainingPhase(){return readJson(STORAGE_KEYS.activeTrainingPhase,null);}
  function getTrainingPhases(){return inactiveOnly(readJson(STORAGE_KEYS.trainingPhases,[]));}
  function startTrainingPhase(input,{mark=true}={}){
    const previous=getActiveTrainingPhase();
    const now=nowIso();
    const history=previous
      ?mergeById(getTrainingPhases(),[{...previous,status:"replaced",endedAt:isoDate(input.startedAt)||todayIso(),updatedAt:now}])
      :getTrainingPhases();
    const next=buildTrainingPhase({
      ...input,
      goalCycleId:input.goalCycleId||getActiveGoalCycle()?.id,
      lifeStateId:input.lifeStateId||getCurrentLifeState()?.id
    });
    writeJson(STORAGE_KEYS.trainingPhases,inactiveOnly(history),{mark:false});
    writeJson(STORAGE_KEYS.activeTrainingPhase,next,{mark:false});
    markUpdated(mark);
    return next;
  }
  function closeTrainingPhase(status="completed",{mark=true}={}){
    if(!PHASE_FINAL_STATUSES.has(status)) throw new Error("El estado final de la fase no es válido.");
    const current=getActiveTrainingPhase();
    if(!current) return null;
    const now=nowIso();
    const closed={...current,status,endedAt:todayIso(),updatedAt:now};
    writeJson(STORAGE_KEYS.trainingPhases,mergeById(getTrainingPhases(),[closed]),{mark:false});
    writeJson(STORAGE_KEYS.activeTrainingPhase,null,{mark:false});
    markUpdated(mark);
    return closed;
  }

  function phaseFromGoal(goalId){
    return {
      fat_loss:"fat_loss",
      muscle_gain:"muscle_gain",
      strength_gain:"strength",
      maintain_strength:"maintenance",
      maintenance:"maintenance",
      return_to_training:"return_to_training"
    }[goalId]||null;
  }
  function createMigrationSnapshot(ownerId){
    const normalizedOwnerId=normalizeOwnerId(ownerId);
    const snapshotKey=migrationSnapshotKey(normalizedOwnerId);
    if(localStorage.getItem(snapshotKey)!==null) return readJson(snapshotKey,null);
    const storage={};
    SNAPSHOT_DATA_KEYS.forEach(key=>{
      const value=localStorage.getItem(key);
      if(value!==null) storage[key]=value;
    });
    const snapshot={
      app:"GymOS",
      ownerId:normalizedOwnerId,
      sourceVersion:"4.0.3",
      targetVersion:DATA_SCHEMA_VERSION,
      createdAt:nowIso(),
      storage
    };
    writeJson(snapshotKey,snapshot,{mark:false});
    return snapshot;
  }
  function migrateDataModel(options={}){
    const ownerId=normalizeOwnerId(options.ownerId);
    if(localStorage.getItem(STORAGE_KEYS.dataSchemaVersion)===DATA_SCHEMA_VERSION){
      return {migrated:false,version:DATA_SCHEMA_VERSION,ownerId};
    }
    createMigrationSnapshot(ownerId);
    const beforeRoutine=localStorage.getItem("gymos:routine");
    const beforeHistory=localStorage.getItem("gymos:history");
    const previous=new Map([...MANAGED_KEYS,STORAGE_KEYS.dataSchemaVersion].map(key=>[key,localStorage.getItem(key)]));
    try{
      const legacy=options.legacyProfile||readJson("gymos:onboardingProfile",{})||{};
      if(!getUserProfile()) saveUserProfile(legacy,{mark:false});
      if(!getCurrentLifeState()){
        writeJson(STORAGE_KEYS.currentLifeState,buildLifeState({type:"general",startedAt:todayIso()}),{mark:false});
      }
      if(!getActiveGoalCycle()){
        const migratedGoal=migrateLegacyGoal(legacy.goal);
        if(migratedGoal){
          startGoalCycle({
            primaryGoal:migratedGoal.id,secondaryGoals:[],
            customGoalLabel:migratedGoal.customGoalLabel,
            notes:migratedGoal.notes,
            changeReason:"Migración automática desde GymOS 4.0.3",
            startedAt:isoDate(legacy.completedAt||legacy.updatedAt)||todayIso()
          },{mark:false});
        }
      }
      if(!getActiveTrainingPhase()){
        const inferredPhase=phaseFromGoal(getActiveGoalCycle()?.primaryGoal);
        if(inferredPhase){
          startTrainingPhase({
            type:inferredPhase,startedAt:getActiveGoalCycle()?.startedAt||todayIso(),
            notes:"Fase inicial deducida del objetivo anterior."
          },{mark:false});
        }
      }
      if(beforeRoutine!==localStorage.getItem("gymos:routine")) throw new Error("La migración intentó modificar la rutina.");
      if(beforeHistory!==localStorage.getItem("gymos:history")) throw new Error("La migración intentó modificar el historial.");
      localStorage.setItem(STORAGE_KEYS.dataSchemaVersion,DATA_SCHEMA_VERSION);
      markUpdated(options.mark!==false);
      return {migrated:true,version:DATA_SCHEMA_VERSION,ownerId};
    }catch(error){
      previous.forEach((value,key)=>{
        if(value===null) localStorage.removeItem(key);
        else localStorage.setItem(key,value);
      });
      throw error;
    }
  }

  function resolveImportedActive(localActive,remoteActive,localHistory,remoteHistory){
    const all=mergeById(localHistory,remoteHistory,localActive,remoteActive);
    const active=all.filter(item=>item.status==="active"&&!item.endedAt).sort((a,b)=>timestampOf(b)-timestampOf(a));
    const winner=active[0]||null;
    const endedAt=winner?.startedAt||todayIso();
    const history=all.filter(item=>!winner||item.id!==winner.id).map(item=>{
      if(item.status==="active"&&!item.endedAt){
        return {...item,status:"replaced",endedAt,updatedAt:winner?.updatedAt||nowIso()};
      }
      return item;
    });
    return {active:winner,history:inactiveOnly(history)};
  }
  function exportSyncData(){
    return {
      dataSchemaVersion:localStorage.getItem(STORAGE_KEYS.dataSchemaVersion)||DATA_SCHEMA_VERSION,
      userProfile:getUserProfile(),
      currentLifeState:getCurrentLifeState(),
      lifeStateHistory:getLifeStateHistory(),
      activeGoalCycle:getActiveGoalCycle(),
      goalsHistory:getGoalsHistory(),
      activeTrainingPhase:getActiveTrainingPhase(),
      trainingPhases:getTrainingPhases()
    };
  }
  function importSyncData(payload,{mark=false}={}){
    if(!payload||typeof payload!=="object") return false;
    const hasProfileData=[
      "userProfile","currentLifeState","lifeStateHistory","activeGoalCycle",
      "goalsHistory","activeTrainingPhase","trainingPhases"
    ].some(key=>Object.prototype.hasOwnProperty.call(payload,key));
    if(!hasProfileData) return false;
    if(payload.userProfile){
      writeJson(STORAGE_KEYS.userProfile,preferNewer(getUserProfile(),payload.userProfile),{mark:false});
    }
    const life=resolveImportedActive(
      getCurrentLifeState(),payload.currentLifeState,getLifeStateHistory(),payload.lifeStateHistory
    );
    writeJson(STORAGE_KEYS.currentLifeState,life.active,{mark:false});
    writeJson(STORAGE_KEYS.lifeStateHistory,life.history,{mark:false});
    const goals=resolveImportedActive(
      getActiveGoalCycle(),payload.activeGoalCycle,getGoalsHistory(),payload.goalsHistory
    );
    writeJson(STORAGE_KEYS.activeGoalCycle,goals.active,{mark:false});
    writeJson(STORAGE_KEYS.goalsHistory,goals.history,{mark:false});
    const phases=resolveImportedActive(
      getActiveTrainingPhase(),payload.activeTrainingPhase,getTrainingPhases(),payload.trainingPhases
    );
    writeJson(STORAGE_KEYS.activeTrainingPhase,phases.active,{mark:false});
    writeJson(STORAGE_KEYS.trainingPhases,phases.history,{mark:false});
    localStorage.setItem(STORAGE_KEYS.dataSchemaVersion,DATA_SCHEMA_VERSION);
    markUpdated(mark);
    return true;
  }

  global.GymOSProfileData=Object.freeze({
    DATA_SCHEMA_VERSION,STORAGE_KEYS,MANAGED_KEYS,
    SNAPSHOT_PREFIX,SNAPSHOT_DATA_KEYS,MIGRATION_INTERNAL_KEY_PREFIXES,
    GOAL_OPTIONS,LIFE_STATE_OPTIONS,TRAINING_PHASE_OPTIONS,
    calculatePregnancyTrimester,normalizePregnancyDetails,
    migrateLegacyGoal,validateGoalSelection,buildGoalCycle,buildTrainingPhase,normalizeUserProfile,buildLifeState,
    getUserProfile,saveUserProfile,getCurrentLifeState,getLifeStateHistory,setCurrentLifeState,
    getActiveGoalCycle,getGoalsHistory,startGoalCycle,closeGoalCycle,
    getActiveTrainingPhase,getTrainingPhases,startTrainingPhase,closeTrainingPhase,
    normalizeOwnerId,migrationSnapshotKey,migrationInternalKeys,removeMigrationInternalData,
    createMigrationSnapshot,migrateDataModel,exportSyncData,importSyncData
  });
})(typeof window!=="undefined"?window:globalThis);
