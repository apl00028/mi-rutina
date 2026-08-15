const GYMOS_VERSION="4.2.0-rc.8-recovery916";
const GYMOS_NAV_EXPANDED_KEY="gymos:deviceNavigationExpanded";
const GYMOS_FONT_SCALES=["font-scale-sm","font-scale-md","font-scale-lg","font-scale-xl"];

function getAppearancePreference(){
  return getAppPreferences().theme||"system";
}
function updateAppearanceButton(value=getAppearancePreference()){
  const button=document.getElementById("appearanceCycleButton");
  if(!button) return;
  const labels={light:"Claro",dark:"Oscuro",system:"Sistema"};
  const icons={light:"☀",dark:"☾",system:"◐"};
  button.innerHTML=`<span aria-hidden="true">${icons[value]}</span><span>${labels[value]}</span>`;
  button.setAttribute("aria-label",`Tema actual: ${labels[value]}. Pulsa para cambiar.`);
}
function applyAppearancePreference(value=getAppearancePreference()){
  const allowed=["light","dark","system"];
  const next=allowed.includes(value)?value:"light";
  saveAppPreferences({theme:next});
  updateAppearanceButton(next);
}
function cycleAppearancePreference(){
  const values=["light","dark","system"];
  const current=getAppearancePreference();
  const next=values[(values.indexOf(current)+1)%values.length];
  applyAppearancePreference(next);
}
function getFontScalePreference(){
  const stored=getAppPreferences().fontScale||"normal";
  const values={small:"font-scale-sm",normal:"font-scale-md",large:"font-scale-lg",xlarge:"font-scale-xl"};
  return values[stored]||"font-scale-md";
}
function updateFontScaleButton(value=getFontScalePreference()){
  const position=GYMOS_FONT_SCALES.indexOf(value)+1;
  document.querySelectorAll("#fontScaleCycleButton,#homeFontScaleToggle").forEach(button=>{
    button.setAttribute("aria-label",`Tamaño de letra ${position} de ${GYMOS_FONT_SCALES.length}. Pulsa para cambiar.`);
    button.title=`Tamaño de letra ${position}/${GYMOS_FONT_SCALES.length}`;
  });
}
function applyFontScalePreference(value=getFontScalePreference()){
  const next=GYMOS_FONT_SCALES.includes(value)?value:"font-scale-md";
  const scaleMap={
    "font-scale-sm":"small","font-scale-md":"normal",
    "font-scale-lg":"large","font-scale-xl":"xlarge"
  };
  saveAppPreferences({fontScale:scaleMap[next]});
  updateFontScaleButton(next);
}
function cycleFontScalePreference(){
  const current=getFontScalePreference();
  const next=GYMOS_FONT_SCALES[(GYMOS_FONT_SCALES.indexOf(current)+1)%GYMOS_FONT_SCALES.length];
  applyFontScalePreference(next);
}
function bindGlobalAppearanceControls(){
  const appearance=document.getElementById("appearanceCycleButton");
  if(appearance&&!appearance.dataset.bound){
    appearance.dataset.bound="1";
    appearance.addEventListener("click",cycleAppearancePreference);
  }
  const font=document.getElementById("fontScaleCycleButton");
  if(font&&!font.dataset.bound){
    font.dataset.bound="1";
    font.addEventListener("click",cycleFontScalePreference);
  }
  updateAppearanceButton();
  updateFontScaleButton();
}
const defaultSessions = {
  A: [
    ["Press banca / máquina pecho", "8–10 reps"],
    ["Remo sentado", "8–10 reps"],
    ["Prensa", "10 reps"],
    ["Elevaciones laterales", "12–15 reps"],
    ["Curl bíceps", "10–12 reps"],
    ["Plancha", "30–45 s"]
  ],
  B: [
    ["Peso muerto rumano", "8 reps"],
    ["Jalón al pecho", "8–10 reps"],
    ["Press hombro máquina/mancuernas", "8–10 reps"],
    ["Zancadas / split squat", "10 por pierna"],
    ["Tríceps polea", "10–12 reps"],
    ["Abdominales", "10–15 reps"]
  ],
  C: [
    ["Sentadilla goblet / hack / prensa", "8–10 reps"],
    ["Press inclinado mancuernas", "8–10 reps"],
    ["Remo pecho apoyado", "8–10 reps"],
    ["Curl femoral", "10–12 reps"],
    ["Face pull", "12–15 reps"],
    ["Gemelo", "12–15 reps"]
  ]
};

const CANONICAL_ROUTINE_KEY="gymos:routine:canonical";
const CANONICAL_DRAFTS_KEY="gymos:routineDrafts";
const SELECTED_SESSION_ID_KEY="gymos:selectedSessionId";
const SESSION_MODEL_MIGRATION_KEY="gymos:sessionModelMigration";

function routineSessionMigrationApi(){
  if(!window.GymOSRoutineSessionMigration){
    throw new Error("El adaptador de sesiones no está disponible.");
  }
  return window.GymOSRoutineSessionMigration;
}
function routineSessionRuntimeApi(){
  if(!window.GymOSRoutineSessionRuntime){
    throw new Error("El runtime canónico de sesiones no está disponible.");
  }
  return window.GymOSRoutineSessionRuntime;
}
function workoutProgressApi(){
  if(!window.GymOSWorkoutProgress){
    throw new Error("El modelo de progreso del entrenamiento no está disponible.");
  }
  return window.GymOSWorkoutProgress;
}
function secureSessionModelId(prefix){
  let value;
  if(globalThis.crypto?.randomUUID) value=globalThis.crypto.randomUUID();
  else if(globalThis.crypto?.getRandomValues){
    const bytes=new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6]=(bytes[6]&15)|64;
    bytes[8]=(bytes[8]&63)|128;
    value=[...bytes].map((byte,index)=>
      `${[4,6,8,10].includes(index)?"-":""}${byte.toString(16).padStart(2,"0")}`
    ).join("");
  }else throw new Error("No hay una fuente criptográfica segura para crear identificadores.");
  return `${prefix}-${value}`;
}
function normalizeRoutine(raw){
  const output={A:[],B:[],C:[]};
  ["A","B","C"].forEach(session=>{
    (raw?.[session]||[]).forEach(item=>{
      if(Array.isArray(item)){
        output[session].push({
          name:String(item[0]||"").trim(),
          target:String(item[1]||"8–10 reps"),
          sets:3,
          increment:2.5,
          type:"peso"
        });
      }else if(item&&item.name){
        output[session].push({
          ...item,
          name:String(item.name).trim(),
          target:String(item.target||"8–10 reps"),
          sets:Math.max(1,Math.min(10,Number(item.sets)||3)),
          increment:Number(item.increment)||0,
          type:item.type||"peso"
        });
      }
    });
  });
  return output;
}
function getCanonicalRoutine(){
  const raw=localStorage.getItem(CANONICAL_ROUTINE_KEY);
  if(raw===null) return null;
  let parsed;
  try{parsed=JSON.parse(raw);}
  catch(_){throw new Error("La rutina canónica almacenada no es JSON válido.");}
  const validation=window.GymOSRoutineSessionModel?.validateCanonicalRoutine(parsed);
  if(!validation?.valid) throw new Error("La rutina canónica almacenada no es válida.");
  return window.GymOSRoutineSessionModel.normalizeCanonicalRoutine(parsed);
}
function getRoutine(){
  const canonical=getCanonicalRoutine();
  if(canonical){
    return normalizeRoutine(routineSessionRuntimeApi().legacyShadow(canonical));
  }
  const saved=JSON.parse(localStorage.getItem("gymos:routine")||"null");
  if(saved) return normalizeRoutine(saved);
  const converted={A:[],B:[],C:[]};
  Object.entries(defaultSessions).forEach(([session,items])=>{
    converted[session]=items.map(([name,target])=>({name,target,sets:3,increment:2.5,type:"peso"}));
  });
  return converted;
}
function saveCanonicalRoutine(routine,{mark=true,writeLegacyShadow=true}={}){
  const canonical=window.GymOSRoutineSessionModel.normalizeCanonicalRoutine(routine);
  const shadow=writeLegacyShadow
    ?routineSessionRuntimeApi().legacyShadow(canonical)
    :null;
  const before={
    canonical:localStorage.getItem(CANONICAL_ROUTINE_KEY),
    legacy:localStorage.getItem("gymos:routine")
  };
  try{
    localStorage.setItem(CANONICAL_ROUTINE_KEY,JSON.stringify(canonical));
    if(writeLegacyShadow) localStorage.setItem("gymos:routine",JSON.stringify(normalizeRoutine(shadow)));
    const reread=getCanonicalRoutine();
    if(window.GymOSRoutineSessionModel.canonicalRoutineHash(reread)!==
      window.GymOSRoutineSessionModel.canonicalRoutineHash(canonical)){
      throw new Error("canonical_write_validation_failed");
    }
    if(writeLegacyShadow){
      const expectedLegacy=normalizeRoutine(shadow);
      const storedLegacy=readStoredJson("gymos:routine");
      if(!storedLegacy||routineSessionMigrationApi().stableStringify(
        normalizeRoutine(storedLegacy)
      )!==routineSessionMigrationApi().stableStringify(expectedLegacy)){
        throw new Error("legacy_shadow_write_validation_failed");
      }
    }
  }catch(error){
    restoreStorageValue(CANONICAL_ROUTINE_KEY,before.canonical);
    restoreStorageValue("gymos:routine",before.legacy);
    throw error;
  }
  if(mark) markLocalUpdated();
  return canonical;
}
function saveRoutine(routine,{mark=true}={}){
  const normalizedLegacy=normalizeRoutine(routine);
  const canonical=getCanonicalRoutine();
  if(!canonical){
    localStorage.setItem("gymos:routine",JSON.stringify(normalizedLegacy));
    if(mark) markLocalUpdated();
    return normalizedLegacy;
  }
  const reconciled=routineSessionMigrationApi().reconcileLegacyRoutine({
    canonicalRoutine:canonical,legacyRoutine:normalizedLegacy
  });
  if(!reconciled.ok){
    const error=new Error(reconciled.message);
    error.code=reconciled.code;
    throw error;
  }
  if(!reconciled.changed&&
    localStorage.getItem("gymos:routine")===JSON.stringify(normalizedLegacy)){
    return normalizedLegacy;
  }
  const previous={
    canonical:localStorage.getItem(CANONICAL_ROUTINE_KEY),
    legacy:localStorage.getItem("gymos:routine"),
    drafts:localStorage.getItem(CANONICAL_DRAFTS_KEY),
    updatedAt:localStorage.getItem("gymos:updatedAt"),
    syncPending:localStorage.getItem("gymos:syncPending"),
    localRevision:localStorage.getItem("gymos:localRevision")
  };
  const ownerId=currentRoutineOwnerOrNull();
  try{
    if(ownerId) assertActiveLocalOwner(ownerId);
    saveCanonicalRoutine(reconciled.canonicalRoutine,{mark:false,writeLegacyShadow:true});
    const drafts=getCanonicalDrafts();
    if(drafts){
      const updated=routineSessionMigrationApi().markStaleDrafts(drafts,{
        ownerId:currentRoutineOwnerOrNull(),canonicalRoutine:reconciled.canonicalRoutine
      });
      if(JSON.stringify(updated)!==JSON.stringify(drafts)){
        localStorage.setItem(CANONICAL_DRAFTS_KEY,JSON.stringify(updated));
      }
      const validation=routineSessionMigrationApi().validateDraftContainer(updated,{
        ownerId,canonicalRoutine:reconciled.canonicalRoutine
      });
      if(!validation.valid) throw new Error(`invalid_canonical_drafts:${validation.errors.join(",")}`);
    }
    if(ownerId) assertActiveLocalOwner(ownerId);
    if(mark) markLocalUpdated();
  }catch(error){
    restoreStorageValue(CANONICAL_ROUTINE_KEY,previous.canonical);
    restoreStorageValue("gymos:routine",previous.legacy);
    restoreStorageValue(CANONICAL_DRAFTS_KEY,previous.drafts);
    restoreStorageValue("gymos:updatedAt",previous.updatedAt);
    restoreStorageValue("gymos:syncPending",previous.syncPending);
    restoreStorageValue("gymos:localRevision",previous.localRevision);
    throw error;
  }
  return reconciled.legacyRoutine;
}
let sessions=normalizeRoutine(defaultSessions);

function getTrainingBlocks(){
  const raw=JSON.parse(localStorage.getItem("gymos:blocks")||"[]");
  return Array.isArray(raw)?raw:[];
}
function saveTrainingBlocks(blocks){
  localStorage.setItem("gymos:blocks",JSON.stringify(blocks));
  markLocalUpdated();
}
function getActiveBlock(){
  const id=localStorage.getItem("gymos:activeBlockId");
  return getTrainingBlocks().find(block=>block.id===id)||null;
}
function setActiveBlock(id){
  if(id) localStorage.setItem("gymos:activeBlockId",id);
  else localStorage.removeItem("gymos:activeBlockId");
  markLocalUpdated();
}
function makeBlockId(){
  return crypto.randomUUID?crypto.randomUUID():`block-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function dateOnly(value){
  const d=new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime())?null:d;
}
function blockStatus(block){
  const start=dateOnly(block.startDate);
  if(!start) return {week:1,total:block.weeks||4,status:"planned",progress:0};
  const today=new Date(); today.setHours(12,0,0,0);
  const total=Math.max(1,Number(block.weeks)||4);
  const end=addDays(start,total*7-1);
  if(today<start) return {week:1,total,status:"planned",progress:0,start,end};
  if(today>end) return {week:total,total,status:"completed",progress:100,start,end};
  const diff=Math.floor((today-start)/86400000);
  const week=Math.min(total,Math.floor(diff/7)+1);
  return {week,total,status:"active",progress:Math.round(((diff+1)/(total*7))*100),start,end};
}
function blockWeekWorkouts(block,weekNumber){
  const start=dateOnly(block.startDate);
  if(!start) return 0;
  const from=addDays(start,(weekNumber-1)*7);
  const to=addDays(from,7);
  return getHistory().filter(workout=>{
    const d=new Date(workout.date||workout.finishedAt||workout.startedAt);
    return d>=from&&d<to;
  }).length;
}

function defaultSessionPlan(count){
  const available=activeRoutineSessions().map(session=>session.sessionId);
  if(!available.length) return [];
  return Array.from(
    {length:Math.max(1,Math.min(7,Number(count)||available.length))},
    (_,index)=>available[index%available.length]
  );
}
function blockSessionPlan(block){
  const available=activeRoutineSessions();
  const validIds=new Set(available.map(session=>session.sessionId));
  const plan=Array.isArray(block.sessionPlan)?block.sessionPlan.map(value=>
    validIds.has(value)
      ?value
      :available.find(session=>session.legacySessionKey===value)?.sessionId||null
  ).filter(Boolean):[];
  return plan.length===Number(block.sessionsPerWeek)?plan:defaultSessionPlan(block.sessionsPerWeek);
}
function workoutRuntimeSessionId(workout){
  if(workout?.sessionId) return workout.sessionId;
  return activeRoutineSessions().find(session=>
    session.legacySessionKey===(workout?.legacySessionKey||workout?.session)
  )?.sessionId||null;
}
function blockWeekWorkoutRows(block,weekNumber){
  const start=dateOnly(block.startDate);
  if(!start) return [];
  const from=addDays(start,(weekNumber-1)*7);
  const to=addDays(from,7);
  return getHistory()
    .filter(workout=>{
      const d=new Date(workout.date||workout.finishedAt||workout.startedAt);
      return d>=from&&d<to;
    })
    .sort((a,b)=>new Date(a.date)-new Date(b.date));
}
function blockWeekSessionSummary(block,weekNumber){
  const plan=blockSessionPlan(block);
  const workouts=blockWeekWorkoutRows(block,weekNumber);
  const remaining=[...plan];
  const matched=[];
  workouts.forEach(workout=>{
    const id=workoutRuntimeSessionId(workout);
    const index=remaining.indexOf(id);
    if(index>=0){
      matched.push(id);
      remaining.splice(index,1);
    }
  });
  return {
    plan,
    workouts,
    matched,
    remaining,
    completed:matched.length,
    adherence:Math.min(100,Math.round((matched.length/Math.max(1,plan.length))*100))
  };
}
function nextPlannedSession(block,weekNumber){
  const summary=blockWeekSessionSummary(block,weekNumber);
  return summary.remaining[0]||null;
}

function isDeloadWeek(block,weekNumber){
  return Number(block.deloadWeek)>0 && Number(block.deloadWeek)===Number(weekNumber);
}
function deloadSettings(block){
  return {
    volumePercent: Math.max(30,Math.min(100,Number(block.deloadVolumePercent)||60)),
    intensityPercent: Math.max(40,Math.min(100,Number(block.deloadIntensityPercent)||80))
  };
}
function blockCompletionSummary(block){
  const totalWeeks=Math.max(1,Number(block.weeks)||4);
  const weeks=Array.from({length:totalWeeks},(_,i)=>{
    const week=i+1;
    const summary=blockWeekSessionSummary(block,week);
    return {
      week,
      adherence:summary.adherence,
      completed:summary.completed,
      planned:summary.plan.length,
      deload:isDeloadWeek(block,week)
    };
  });
  const totalCompleted=weeks.reduce((sum,w)=>sum+w.completed,0);
  const totalPlanned=weeks.reduce((sum,w)=>sum+w.planned,0);
  const adherence=Math.round((totalCompleted/Math.max(1,totalPlanned))*100);
  return {
    weeks,
    totalCompleted,
    totalPlanned,
    adherence,
    completedWeeks:weeks.filter(w=>w.adherence>=100).length
  };
}
function completeTrainingBlock(id){
  const blocks=getTrainingBlocks();
  const block=blocks.find(item=>item.id===id);
  if(!block) return;
  block.completedAt=new Date().toISOString();
  block.status="completed";
  block.updatedAt=new Date().toISOString();
  saveTrainingBlocks(blocks);
  if(localStorage.getItem("gymos:activeBlockId")===id) setActiveBlock(null);
}
function reopenTrainingBlock(id){
  const blocks=getTrainingBlocks();
  const block=blocks.find(item=>item.id===id);
  if(!block) return;
  delete block.completedAt;
  block.status="active";
  block.updatedAt=new Date().toISOString();
  saveTrainingBlocks(blocks);
}

function workoutDurationMinutes(workout){
  const start=new Date(workout.startedAt||workout.date||0);
  const end=new Date(workout.finishedAt||workout.date||0);
  if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<=start) return 0;
  return Math.round((end-start)/60000);
}
function workoutVolume(workout){
  const exercises=Array.isArray(workout.exercises)?workout.exercises:[];
  return exercises.reduce((total,exercise)=>{
    const sets=Array.isArray(exercise.sets)?exercise.sets:[];
    return total+sets.reduce((sum,set)=>{
      const weight=Number(set.weight)||0;
      const reps=Number(set.reps)||0;
      return sum+(weight*reps);
    },0);
  },0);
}
function workoutBestSet(workout){
  let best=null;
  const exercises=Array.isArray(workout.exercises)?workout.exercises:[];
  exercises.forEach(exercise=>{
    (exercise.sets||[]).forEach(set=>{
      const weight=Number(set.weight)||0;
      const reps=Number(set.reps)||0;
      const score=weight*reps;
      if(score>0&&(!best||score>best.score)){
        best={exercise:exercise.name||"Ejercicio",weight,reps,score};
      }
    });
  });
  return best;
}
function blockWorkoutRows(block){
  const start=dateOnly(block.startDate);
  if(!start) return [];
  const end=addDays(start,Number(block.weeks||4)*7);
  return getHistory()
    .filter(workout=>{
      const d=new Date(workout.date||workout.finishedAt||workout.startedAt);
      return d>=start&&d<end;
    })
    .sort((a,b)=>new Date(a.date||a.finishedAt)-new Date(b.date||b.finishedAt));
}
function blockAnalytics(block){
  const workouts=blockWorkoutRows(block);
  const completion=blockCompletionSummary(block);
  const totalVolume=Math.round(workouts.reduce((sum,w)=>sum+workoutVolume(w),0));
  const totalMinutes=workouts.reduce((sum,w)=>sum+workoutDurationMinutes(w),0);
  const avgMinutes=workouts.length?Math.round(totalMinutes/workouts.length):0;
  const bySession=activeRoutineSessions().map(session=>({
    session:session.sessionId,
    name:routineSessionRuntimeApi().displayName(session),
    count:workouts.filter(workout=>workoutRuntimeSessionId(workout)===session.sessionId).length
  }));
  const bestSets=workouts.map(workoutBestSet).filter(Boolean).sort((a,b)=>b.score-a.score);
  const weekly=Array.from({length:Number(block.weeks||4)},(_,i)=>{
    const week=i+1;
    const rows=blockWeekWorkoutRows(block,week);
    return {
      week,
      workouts:rows.length,
      volume:Math.round(rows.reduce((sum,w)=>sum+workoutVolume(w),0)),
      minutes:rows.reduce((sum,w)=>sum+workoutDurationMinutes(w),0),
      adherence:blockWeekSessionSummary(block,week).adherence
    };
  });
  return {
    ...completion,
    workouts:workouts.length,
    totalVolume,
    totalMinutes,
    avgMinutes,
    bySession,
    bestSets,
    weekly
  };
}
function formatVolume(value){
  const n=Number(value)||0;
  return n>=1000?`${(n/1000).toLocaleString("es-ES",{maximumFractionDigits:1})} t`:`${n.toLocaleString("es-ES")} kg`;
}

function normalizeExerciseName(name){
  return String(name||"Ejercicio").trim().toLowerCase();
}
function displayExerciseName(name){
  const text=String(name||"Ejercicio").trim();
  return text||"Ejercicio";
}
function estimatedOneRepMax(weight,reps){
  const w=Number(weight)||0;
  const r=Number(reps)||0;
  if(w<=0||r<=0) return 0;
  // Una repetición completada ya es una medición directa del 1RM.
  if(r===1) return w;
  return w*(1+r/30);
}
function exerciseRecords(){
  const rows=[];
  getHistory().forEach(workout=>{
    const date=new Date(workout.date||workout.finishedAt||workout.startedAt);
    (workout.exercises||[]).forEach(exercise=>{
      const name=displayExerciseName(exercise.name);
      const type=exercise.type||"Sin categoría";
      (exercise.sets||[]).forEach(set=>{
        const weight=Number(set.weight)||0;
        const reps=Number(set.reps)||0;
        if(weight<=0&&reps<=0) return;
        rows.push({
          name,
          key:normalizeExerciseName(name),
          type,
          session:workout.session||"",
          date,
          weight,
          reps,
          volume:weight*reps,
          e1rm:estimatedOneRepMax(weight,reps),
          rir:Number(set.rir),
          rpe:Number(set.rpe)
        });
      });
    });
  });
  return rows.sort((a,b)=>a.date-b.date);
}
function exerciseAnalytics(){
  const groups=new Map();
  exerciseRecords().forEach(row=>{
    if(!groups.has(row.key)){
      groups.set(row.key,{
        key:row.key,
        name:row.name,
        type:row.type,
        rows:[]
      });
    }
    groups.get(row.key).rows.push(row);
  });

  return [...groups.values()].map(group=>{
    const rows=group.rows;
    const dates=[...new Set(rows.map(r=>r.date.toISOString().slice(0,10)))];
    const totalVolume=Math.round(rows.reduce((sum,r)=>sum+r.volume,0));
    const bestWeight=Math.max(0,...rows.map(r=>r.weight));
    const bestE1rm=Math.max(0,...rows.map(r=>r.e1rm));
    const lastRows=rows.slice(-6);
    const previousRows=rows.slice(-12,-6);
    const recentBest=Math.max(0,...lastRows.map(r=>r.e1rm));
    const previousBest=Math.max(0,...previousRows.map(r=>r.e1rm));
    const change=previousBest>0?((recentBest-previousBest)/previousBest)*100:null;
    const lastDate=rows.length?rows[rows.length-1].date:null;
    const daysSince=lastDate?Math.floor((new Date()-lastDate)/86400000):null;
    let status="Sin datos suficientes";
    if(rows.length>=8&&change!==null){
      if(change>=2) status="Progresando";
      else if(change<=-3) status="Retroceso";
      else status="Estable";
    }else if(rows.length>=4){
      status="En seguimiento";
    }
    const stagnating=rows.length>=10&&change!==null&&Math.abs(change)<1.5;
    return {
      ...group,
      sessions:dates.length,
      sets:rows.length,
      totalVolume,
      bestWeight,
      bestE1rm,
      recentChange:change,
      status,
      stagnating,
      daysSince
    };
  }).sort((a,b)=>b.totalVolume-a.totalVolume);
}
function globalTrainingAnalytics(){
  const workouts=getHistory();
  const exercises=exerciseAnalytics();
  const rows=exerciseRecords();
  const totalVolume=Math.round(rows.reduce((sum,r)=>sum+r.volume,0));
  const totalSets=rows.length;
  const activeExercises=exercises.length;
  const progressing=exercises.filter(x=>x.status==="Progresando").length;
  const stagnating=exercises.filter(x=>x.stagnating).length;
  const categoryMap=new Map();
  exercises.forEach(exercise=>{
    const key=exercise.type||"Sin categoría";
    if(!categoryMap.has(key)) categoryMap.set(key,{name:key,volume:0,sets:0,exercises:0});
    const item=categoryMap.get(key);
    item.volume+=exercise.totalVolume;
    item.sets+=exercise.sets;
    item.exercises+=1;
  });
  return {
    workouts:workouts.length,
    totalVolume,
    totalSets,
    activeExercises,
    progressing,
    stagnating,
    exercises,
    categories:[...categoryMap.values()].sort((a,b)=>b.volume-a.volume)
  };
}
function trendLabel(value){
  if(value===null||Number.isNaN(value)) return "—";
  const rounded=Math.round(value*10)/10;
  return `${rounded>0?"+":""}${rounded.toLocaleString("es-ES")}%`;
}

const EXERCISE_LIBRARY_KEY="gymos:exerciseLibrary";
const EXERCISE_DOMAIN_SCHEMA_KEY="gymos:exerciseDomainSchemaVersion";
const EXERCISE_DOMAIN_MIGRATION_BACKUP_PREFIX="gymos:exerciseDomainMigrationBackup:";

function defaultExerciseLibrary(){
  if(!window.GymOSBuiltInExerciseCatalog) throw new Error("El catálogo integrado no está disponible.");
  return window.GymOSBuiltInExerciseCatalog.get();
}
function getExerciseLibrary(){
  let saved=null;
  try{
    saved=JSON.parse(localStorage.getItem(EXERCISE_LIBRARY_KEY)||"null");
  }catch(error){}
  const currentVersion=window.GymOSExerciseDomain?.DOMAIN_VERSION;
  if(Array.isArray(saved)&&saved.length&&localStorage.getItem(EXERCISE_DOMAIN_SCHEMA_KEY)===currentVersion){
    return saved;
  }
  const ownerId=localStorage.getItem("gymos:localDataOwnerId")||(!AUTH_REQUIRED?"local":null);
  if(ownerId&&window.GymOSExerciseDomain&&window.GymOSProfileData){
    ensureExerciseDomainMigration({ownerId,mark:false});
    try{
      const migrated=JSON.parse(localStorage.getItem(EXERCISE_LIBRARY_KEY)||"null");
      if(Array.isArray(migrated)&&migrated.length) return migrated;
    }catch(error){}
  }
  if(Array.isArray(saved)&&saved.length) return saved;
  const rawDefaults=defaultExerciseLibrary();
  const defaults=window.GymOSExerciseDomain
    ?window.GymOSExerciseDomain.migrateExerciseLibrary(rawDefaults).library
    :rawDefaults;
  localStorage.setItem(EXERCISE_LIBRARY_KEY,JSON.stringify(defaults));
  if(window.GymOSExerciseDomain){
    localStorage.setItem(EXERCISE_DOMAIN_SCHEMA_KEY,window.GymOSExerciseDomain.DOMAIN_VERSION);
  }
  return defaults;
}
function saveExerciseLibrary(items,{mark=true,touchUpdatedAt=true,setSchema=true,ownerId=null}={}){
  if(ownerId!==null){
    const normalizedOwner=window.GymOSProfileData.normalizeOwnerId(ownerId);
    if(currentRoutineOwnerOrNull()!==normalizedOwner) throw new Error("exercise_library_owner_changed");
    const foreignCustom=(Array.isArray(items)?items:[]).find(item=>
      (item?.custom===true||item?.source==="custom")&&item.ownerId&&item.ownerId!==normalizedOwner
    );
    if(foreignCustom) throw new Error("exercise_library_owner_mismatch");
  }
  const timestamp=new Date().toISOString();
  const normalized=window.GymOSExerciseDomain
    ?window.GymOSExerciseDomain.migrateExerciseLibrary(items,{timestamp,touchUpdatedAt}).library
    :(Array.isArray(items)?items:[]);
  localStorage.setItem(EXERCISE_LIBRARY_KEY,JSON.stringify(normalized));
  if(window.GymOSExerciseDomain&&setSchema){
    localStorage.setItem(EXERCISE_DOMAIN_SCHEMA_KEY,window.GymOSExerciseDomain.DOMAIN_VERSION);
  }
  if(mark) markLocalUpdated();
  return normalized;
}
function ensureExerciseLibraryWorkflowMigration(){
  const api=window.GymOSExerciseLibraryWorkflow;
  if(!api) return false;
  const ownerId=currentRoutineOwnerOrNull();
  if(!ownerId) return false;
  const current=getExerciseLibrary();
  const migrated=api.migrateArchived(current);
  if(!migrated.changed) return false;
  saveExerciseLibrary(migrated.library,{mark:false,touchUpdatedAt:false,ownerId});
  return true;
}
function makeExerciseId(name){
  const base=String(name||"ejercicio").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"ejercicio";
  return `${base}-${Date.now().toString(36)}`;
}
function exerciseLibraryFilters(items,query,muscle,equipment,favoritesOnly){
  const q=String(query||"").trim().toLowerCase();
  return items.filter(item=>{
    const matchesQuery=!q||[item.name,item.muscle,item.equipment,item.type,item.notes].join(" ").toLowerCase().includes(q);
    const matchesMuscle=!muscle||muscle==="Todos"||item.muscle===muscle;
    const matchesEquipment=!equipment||equipment==="Todos"||item.equipment===equipment;
    const matchesFavorite=!favoritesOnly||Boolean(item.favorite);
    return matchesQuery&&matchesMuscle&&matchesEquipment&&matchesFavorite;
  });
}
function addExerciseToRoutine(sessionRef,exercise){
  const session=canonicalSessionByRef(sessionRef)||activeRoutineSessions()[0];
  if(!session) throw new Error("session_not_found");
  const items=JSON.parse(JSON.stringify(session.exercises||[]));
  items.push({
    name:exercise.name,
    sets:3,
    reps:"8-12",
    type:exercise.type||"Hipertrofia",
    increment:2.5,
    notes:exercise.notes||""
  });
  saveCanonicalSessionExercises(session.sessionId,items);
}

const EXERCISE_SUBSTITUTIONS_KEY="gymos:exerciseSubstitutions";
const FAVORITE_SUBSTITUTIONS_KEY="gymos:favoriteSubstitutions";

function getExerciseSubstitutions(){
  try{
    const data=JSON.parse(localStorage.getItem(EXERCISE_SUBSTITUTIONS_KEY)||"[]");
    return Array.isArray(data)?data:[];
  }catch(error){return [];}
}
function saveExerciseSubstitutions(items){
  localStorage.setItem(EXERCISE_SUBSTITUTIONS_KEY,JSON.stringify(items));
}
function getFavoriteSubstitutions(){
  try{
    const data=JSON.parse(localStorage.getItem(FAVORITE_SUBSTITUTIONS_KEY)||"[]");
    return Array.isArray(data)?data:[];
  }catch(error){return [];}
}
function saveFavoriteSubstitutions(items){
  localStorage.setItem(FAVORITE_SUBSTITUTIONS_KEY,JSON.stringify(items));
}
function substitutionPairKey(fromName,toName){
  return `${normalizeExerciseName(fromName)}=>${normalizeExerciseName(toName)}`;
}
function exerciseLibraryItemByName(name){
  const key=normalizeExerciseName(name);
  return getExerciseLibrary().find(item=>normalizeExerciseName(item.name)===key)||null;
}

function exerciseTrainingHistory(name){
  const key=normalizeExerciseName(name);
  const workouts=getHistory();
  const entries=[];
  workouts.forEach(workout=>{
    const date=workout.date||workout.completedAt||workout.createdAt||"";
    const session=workout.session||workout.sessionKey||"";
    const exercises=workout.exercises||workout.items||[];
    exercises.forEach(exercise=>{
      if(normalizeExerciseName(exercise.name)!==key) return;
      const sets=exercise.series||exercise.sets||exercise.completedSets||[];
      sets.forEach((set,index)=>{
        const weight=Number(set.weight??set.kg??0);
        const reps=Number(set.reps??0);
        if(!weight&&!reps) return;
        entries.push({
          date,
          session,
          set:index+1,
          weight,
          reps,
          rir:set.rir??set.RIR??null,
          rpe:set.rpe??set.RPE??null,
          volume:weight*reps,
          estimated1RM:estimatedOneRepMax(weight,reps)
        });
      });
    });
  });
  return entries.sort((a,b)=>new Date(b.date)-new Date(a.date));
}
function exerciseDetailStats(name){
  const rows=exerciseTrainingHistory(name);
  if(!rows.length) return {rows:[],bestWeight:0,best1RM:0,totalVolume:0,totalSets:0,last:null};
  return {
    rows,
    bestWeight:Math.max(...rows.map(row=>row.weight||0)),
    best1RM:Math.max(...rows.map(row=>row.estimated1RM||0)),
    totalVolume:rows.reduce((sum,row)=>sum+(row.volume||0),0),
    totalSets:rows.length,
    last:rows[0]
  };
}
function updateExerciseTechnicalNotes(id,notes){
  const library=getExerciseLibrary();
  const item=library.find(exercise=>exercise.id===id);
  if(!item) return false;
  item.notes=String(notes||"").trim();
  saveExerciseLibrary(library);
  return true;
}

const GYMOS_BACKUP_VERSION=GYMOS_VERSION;
const ROUTINE_PROPOSALS_KEY="gymos:routineProposals";
const ACTIVE_ROUTINE_PROPOSAL_ID_KEY="gymos:activeRoutineProposalId";
const ROUTINE_ACTIVATION_HISTORY_KEY="gymos:routineActivationHistory";
const ACTIVE_ROUTINE_ACTIVATION_ID_KEY="gymos:activeRoutineActivationId";
const GYMOS_BACKUP_KEYS=[
  "gymos:routine",
  "gymos:routine:canonical",
  "gymos:routineDrafts",
  "gymos:selectedSessionId",
  "gymos:sessionModelMigration",
  "gymos:draft:A",
  "gymos:draft:B",
  "gymos:draft:C",
  "gymos:history",
  "gymos:bodyWeight",
  "gymos:body",
  "gymos:bodySummaryMetrics",
  "gymos:trainingBlocks",
  "gymos:activeBlockId",
  "gymos:exerciseLibrary",
  "gymos:exerciseDomainSchemaVersion",
  "gymos:routineProposals",
  "gymos:activeRoutineProposalId",
  "gymos:routineActivationHistory",
  "gymos:activeRoutineActivationId",
  "gymos:exerciseSubstitutions",
  "gymos:favoriteSubstitutions",
  "gymos:coachSettings",
  "gymos:coachProposals",
  "gymos:coachSnapshots",
  "gymos:workoutAnalyses",
  "gymos:coachChat",
  "gymos:coachConnection",
  "gymos:nutritionSettings",
  "gymos:nutritionEntries",
  "gymos:professionalNutritionPlans",
  "gymos:appPreferences",
  "gymos:quickActions",
  "gymos:developerLogs",
  "gymos:healthSettings",
  "gymos:healthEntries",
  "gymos:healthImports",
  "gymos:dailyRecovery",
  "gymos:recoveryCheckins",
  "gymos:accountMigrationStatus",
  "gymos:accountMigrationAt",
  "gymos:syncAudit",
  "gymos:deviceId",
  "gymos:localRevision",
  "gymos:lastRemoteRevision",
  "gymos:syncConflictMode",
  "gymos:onboardingProfile",
  "gymos:dataSchemaVersion",
  "gymos:userProfile",
  "gymos:currentLifeState",
  "gymos:lifeStateHistory",
  "gymos:activeGoalCycle",
  "gymos:goalsHistory",
  "gymos:activeTrainingPhase",
  "gymos:trainingPhases"
];

function routineProposalOwnerId(explicitOwnerId=null){
  if(!window.GymOSProfileData) throw new Error("El modelo de perfil no está disponible.");
  const ownerId=explicitOwnerId||localStorage.getItem(LOCAL_OWNER_KEY)||(!AUTH_REQUIRED?"local":null);
  return window.GymOSProfileData.normalizeOwnerId(ownerId);
}
function getRoutineProposalRecords(ownerId=null){
  if(!window.GymOSRoutineProposals) throw new Error("El modelo de propuestas no está disponible.");
  const normalizedOwner=routineProposalOwnerId(ownerId);
  try{
    const stored=JSON.parse(localStorage.getItem(ROUTINE_PROPOSALS_KEY)||"[]");
    const normalized=window.GymOSRoutineProposals.normalizeRecords(stored,normalizedOwner,{
      activeProposalId:localStorage.getItem(ACTIVE_ROUTINE_PROPOSAL_ID_KEY)
    });
    const activeId=window.GymOSRoutineProposals.selectActiveProposalId(
      normalized,normalizedOwner,localStorage.getItem(ACTIVE_ROUTINE_PROPOSAL_ID_KEY)
    );
    if(activeId) localStorage.setItem(ACTIVE_ROUTINE_PROPOSAL_ID_KEY,activeId);
    else localStorage.removeItem(ACTIVE_ROUTINE_PROPOSAL_ID_KEY);
    return normalized;
  }catch(error){
    localStorage.removeItem(ACTIVE_ROUTINE_PROPOSAL_ID_KEY);
    return [];
  }
}
function saveRoutineProposalRecords(records,{ownerId=null,mark=true,preferredActiveId=null}={}){
  const normalizedOwner=routineProposalOwnerId(ownerId);
  const requestedActiveId=preferredActiveId||localStorage.getItem(ACTIVE_ROUTINE_PROPOSAL_ID_KEY);
  const normalized=window.GymOSRoutineProposals.normalizeRecords(records,normalizedOwner,{
    activeProposalId:requestedActiveId
  });
  localStorage.setItem(ROUTINE_PROPOSALS_KEY,JSON.stringify(normalized));
  const activeId=window.GymOSRoutineProposals.selectActiveProposalId(
    normalized,normalizedOwner,requestedActiveId
  );
  if(activeId) localStorage.setItem(ACTIVE_ROUTINE_PROPOSAL_ID_KEY,activeId);
  else{
    localStorage.removeItem(ACTIVE_ROUTINE_PROPOSAL_ID_KEY);
  }
  if(mark) markLocalUpdated();
  return normalized;
}
function persistRoutineProposal(proposal,{
  ownerId=null,timestamp=new Date().toISOString(),mark=true,replacePending=false
}={}){
  const normalizedOwner=routineProposalOwnerId(ownerId);
  const result=window.GymOSRoutineProposals.storeProposal(getRoutineProposalRecords(normalizedOwner),{
    ownerId:normalizedOwner,proposal,currentRoutine:activeRoutineForComparison(),timestamp,
    activeProposalId:localStorage.getItem(ACTIVE_ROUTINE_PROPOSAL_ID_KEY),
    supersedePrevious:replacePending===true
  });
  if(result.requiresReplacementConfirmation) return result;
  saveRoutineProposalRecords(result.records,{
    ownerId:normalizedOwner,mark:false,preferredActiveId:result.activeProposalId
  });
  if(mark&&result.created) markLocalUpdated();
  return result;
}
function rejectStoredRoutineProposal(proposalId,rejectionReason,{ownerId=null,timestamp=new Date().toISOString(),mark=true}={}){
  const normalizedOwner=routineProposalOwnerId(ownerId);
  const records=window.GymOSRoutineProposals.rejectProposal(getRoutineProposalRecords(normalizedOwner),{
    ownerId:normalizedOwner,proposalId,rejectionReason,timestamp
  });
  saveRoutineProposalRecords(records,{
    ownerId:normalizedOwner,mark:false,
    preferredActiveId:localStorage.getItem(ACTIVE_ROUTINE_PROPOSAL_ID_KEY)
  });
  if(mark) markLocalUpdated();
  return records;
}
function importRoutineProposalSyncData(payload,{ownerId=null,mark=false}={}){
  const normalizedOwner=routineProposalOwnerId(ownerId);
  if(!Array.isArray(payload?.routineProposals)) return false;
  const currentActiveId=localStorage.getItem(ACTIVE_ROUTINE_PROPOSAL_ID_KEY);
  const requestedId=String(payload.activeRoutineProposalId||"");
  const preferredId=requestedId||currentActiveId;
  const result=window.GymOSRoutineProposals.mergeProposalRecords(
    getRoutineProposalRecords(normalizedOwner),
    payload.routineProposals,
    {ownerId:normalizedOwner,activeProposalId:preferredId}
  );
  const mergedRequestedValid=requestedId&&result.records.some(record=>
    record.proposal.proposalId===requestedId&&record.lifecycle.status==="pending_review"
  );
  saveRoutineProposalRecords(result.records,{
    ownerId:normalizedOwner,mark:false,
    preferredActiveId:mergedRequestedValid?requestedId:result.activeProposalId
  });
  if(result.incidents.length) console.warn("Routine proposal import incidents",result.incidents);
  if(mark) markLocalUpdated();
  return result;
}
function ensureRoutineProposalState(ownerId){
  const normalizedOwner=routineProposalOwnerId(ownerId);
  return saveRoutineProposalRecords(getRoutineProposalRecords(normalizedOwner),{
    ownerId:normalizedOwner,mark:false,
    preferredActiveId:localStorage.getItem(ACTIVE_ROUTINE_PROPOSAL_ID_KEY)
  });
}

function getRoutineActivationRecords(ownerId=null){
  if(!window.GymOSRoutineActivation) throw new Error("El modelo de activaciones no está disponible.");
  const normalizedOwner=routineProposalOwnerId(ownerId);
  try{
    const stored=JSON.parse(localStorage.getItem(ROUTINE_ACTIVATION_HISTORY_KEY)||"[]");
    const normalized=window.GymOSRoutineActivation.normalizeRecords(stored,normalizedOwner,{
      activeActivationId:localStorage.getItem(ACTIVE_ROUTINE_ACTIVATION_ID_KEY)
    });
    const activeId=window.GymOSRoutineActivation.selectActiveActivationId(
      normalized,normalizedOwner,localStorage.getItem(ACTIVE_ROUTINE_ACTIVATION_ID_KEY)
    );
    if(activeId) localStorage.setItem(ACTIVE_ROUTINE_ACTIVATION_ID_KEY,activeId);
    else localStorage.removeItem(ACTIVE_ROUTINE_ACTIVATION_ID_KEY);
    return normalized;
  }catch(_){
    localStorage.removeItem(ACTIVE_ROUTINE_ACTIVATION_ID_KEY);
    return [];
  }
}
function saveRoutineActivationRecords(records,{ownerId=null,mark=true,preferredActiveId=null}={}){
  const normalizedOwner=routineProposalOwnerId(ownerId);
  const requestedId=preferredActiveId||localStorage.getItem(ACTIVE_ROUTINE_ACTIVATION_ID_KEY);
  const normalized=window.GymOSRoutineActivation.normalizeRecords(records,normalizedOwner,{
    activeActivationId:requestedId
  });
  localStorage.setItem(ROUTINE_ACTIVATION_HISTORY_KEY,JSON.stringify(normalized));
  const activeId=window.GymOSRoutineActivation.selectActiveActivationId(
    normalized,normalizedOwner,requestedId
  );
  if(activeId) localStorage.setItem(ACTIVE_ROUTINE_ACTIVATION_ID_KEY,activeId);
  else localStorage.removeItem(ACTIVE_ROUTINE_ACTIVATION_ID_KEY);
  if(mark) markLocalUpdated();
  return normalized;
}
function importRoutineActivationSyncData(payload,{ownerId=null,mark=false}={}){
  const normalizedOwner=routineProposalOwnerId(ownerId);
  if(!Array.isArray(payload?.routineActivationHistory)) return false;
  const requestedId=String(payload.activeRoutineActivationId||"");
  const currentId=localStorage.getItem(ACTIVE_ROUTINE_ACTIVATION_ID_KEY);
  const result=window.GymOSRoutineActivation.mergeActivationRecords(
    getRoutineActivationRecords(normalizedOwner),
    payload.routineActivationHistory,
    {ownerId:normalizedOwner,activeActivationId:requestedId||currentId}
  );
  saveRoutineActivationRecords(result.records,{
    ownerId:normalizedOwner,mark:false,
    preferredActiveId:result.activeActivationId
  });
  if(result.incidents.length) console.warn("Routine activation import incidents",result.incidents);
  if(mark) markLocalUpdated();
  return result;
}
function ensureRoutineActivationState(ownerId){
  const normalizedOwner=routineProposalOwnerId(ownerId);
  return saveRoutineActivationRecords(getRoutineActivationRecords(normalizedOwner),{
    ownerId:normalizedOwner,mark:false,
    preferredActiveId:localStorage.getItem(ACTIVE_ROUTINE_ACTIVATION_ID_KEY)
  });
}
function parseStoredJson(raw,fallback=null){
  if(raw===null) return fallback;
  try{return JSON.parse(raw);}catch(_){return fallback;}
}
function captureRoutineActivationStorage(ownerId){
  const keys=[
    "gymos:routine","gymos:selectedSession",
    CANONICAL_ROUTINE_KEY,CANONICAL_DRAFTS_KEY,SELECTED_SESSION_ID_KEY,
    SESSION_MODEL_MIGRATION_KEY,
    draftKey("A"),draftKey("B"),draftKey("C"),
    ROUTINE_ACTIVATION_HISTORY_KEY,ACTIVE_ROUTINE_ACTIVATION_ID_KEY,
    ROUTINE_PROPOSALS_KEY,ACTIVE_ROUTINE_PROPOSAL_ID_KEY,
    "gymos:updatedAt","gymos:syncPending","gymos:localRevision",
    "gymos:lastRemoteRevision","gymos:lastSyncAt","gymos:lastSyncHash",
    `${LOCAL_VAULT_PREFIX}${ownerId}`
  ];
  return Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)]));
}
function restoreRoutineActivationStorage(snapshot){
  Object.entries(snapshot).forEach(([key,value])=>restoreStorageValue(key,value));
}
function markRoutineActivationSyncPending(timestamp){
  if(state.applyingRemote) return;
  localStorage.setItem("gymos:updatedAt",timestamp||new Date().toISOString());
  localStorage.setItem("gymos:syncPending","1");
}
function scheduleRoutineActivationSync(){
  if(!isAppAuthenticated()) return;
  state.syncStatus=navigator.onLine?"pending":"offline";
  scheduleAutoSync();
}
function routineActivationBaseline(ownerId){
  const routineRaw=localStorage.getItem("gymos:routine");
  const selectedSessionRaw=localStorage.getItem("gymos:selectedSession");
  const draftsRaw=Object.fromEntries(["A","B","C"].map(session=>[
    session,localStorage.getItem(draftKey(session))
  ]));
  const canonicalRoutineRaw=localStorage.getItem(CANONICAL_ROUTINE_KEY);
  const canonicalDraftsRaw=localStorage.getItem(CANONICAL_DRAFTS_KEY);
  const selectedSessionIdRaw=localStorage.getItem(SELECTED_SESSION_ID_KEY);
  return {
    currentRoutine:activeRoutineForComparison(),
    currentLegacyRoutine:getRoutine(),
    currentCanonicalRoutine:getCanonicalRoutine(),
    selectedSession:selectedSessionRaw||state.selectedSession||"A",
    selectedSessionId:selectedSessionIdRaw,
    drafts:Object.fromEntries(Object.entries(draftsRaw).map(([session,raw])=>[
      session,parseStoredJson(raw,null)
    ])),
    canonicalDrafts:parseStoredJson(canonicalDraftsRaw,null),
    rawBaseline:{
      routine:routineRaw,selectedSession:selectedSessionRaw,drafts:draftsRaw,
      canonicalRoutine:canonicalRoutineRaw,canonicalDrafts:canonicalDraftsRaw,
      selectedSessionId:selectedSessionIdRaw,
      migrationMetadata:localStorage.getItem(SESSION_MODEL_MIGRATION_KEY),
      storage:Object.fromEntries([
        "gymos:updatedAt","gymos:syncPending","gymos:localRevision",
        "gymos:lastRemoteRevision","gymos:lastSyncAt","gymos:lastSyncHash"
      ].map(key=>[key,localStorage.getItem(key)]))
    }
  };
}
function routineOwnerHasActiveWorkout(ownerId){
  const normalizedOwner=routineProposalOwnerId(ownerId);
  const currentRoutineId=activeRoutineForComparison()?.routineId||null;

  const belongsToCurrentRoutine=record=>
    record?.ownerId===normalizedOwner&&
    ["active","paused"].includes(record?.status)&&
    Boolean(record?.startedAt)&&
    (
      !currentRoutineId||
      !record?.routineId||
      record.routineId===currentRoutineId
    );

  const memory=state?.workoutDraftMemory;
  if(belongsToCurrentRoutine(memory)){
    return true;
  }

  try{
    return storedWorkoutProgressRecords(normalizedOwner)
      .some(belongsToCurrentRoutine);
  }catch(error){
    console.warn("Unable to check active workout state.",error);
    return true;
  }
}
function activateStoredRoutineProposal(proposalId,{
  ownerId=null,confirmed=false,timestamp=new Date().toISOString()
}={}){
  const normalizedOwner=routineProposalOwnerId(ownerId);
  assertActiveLocalOwner(normalizedOwner);
  const preflightStorage=captureRoutineActivationStorage(normalizedOwner);
  const activations=getRoutineActivationRecords(normalizedOwner);
  const existing=activations.find(record=>
    record.proposalId===proposalId&&record.status==="activated"
  );
  if(existing){
    restoreRoutineActivationStorage(preflightStorage);
    return {ok:true,idempotent:true,activation:existing};
  }
  const proposalRecords=getRoutineProposalRecords(normalizedOwner);
  const proposalRecord=proposalRecords.find(record=>record.proposal.proposalId===proposalId);
  const baseline=routineActivationBaseline(normalizedOwner);
  if(
    proposalRecord?.baseline?.routineHash===
    window.GymOSRoutineProposals.routineHash(baseline.currentLegacyRoutine)
  ){
    baseline.currentRoutine=baseline.currentLegacyRoutine;
  }
  const plan=window.GymOSRoutineActivation.createActivationPlan({
    ownerId:normalizedOwner,proposalRecord,currentRoutine:baseline.currentRoutine,
    currentCanonicalRoutine:baseline.currentCanonicalRoutine,
    selectedSession:baseline.selectedSession,selectedSessionId:baseline.selectedSessionId,
    drafts:baseline.drafts,canonicalDrafts:baseline.canonicalDrafts,
    targetRoutineId:secureSessionModelId("routine"),
    rawBaseline:baseline.rawBaseline,confirmed,timestamp,
    activeWorkoutState:routineOwnerHasActiveWorkout(normalizedOwner)
  });
  if(!plan.ok){
    restoreRoutineActivationStorage(preflightStorage);
    return plan;
  }
  if(routineOwnerHasActiveWorkout(normalizedOwner)){
    restoreRoutineActivationStorage(preflightStorage);
    return {
      ok:false,code:"active_workout_in_progress",
      message:window.GymOSRoutineActivation.ACTIVE_WORKOUT_MESSAGE
    };
  }
  const historyBefore=localStorage.getItem("gymos:history");
  let activationResult;
  const transaction=window.GymOSRoutineActivation.executeTransaction({
    capture:()=>captureRoutineActivationStorage(normalizedOwner),
    restore:restoreRoutineActivationStorage
  },[
    ()=>{
      assertActiveLocalOwner(normalizedOwner);
      if(routineOwnerHasActiveWorkout(normalizedOwner)) throw new Error("active_workout_in_progress");
      saveCanonicalRoutine(plan.canonicalRoutine,{mark:false,writeLegacyShadow:true});
    },
    ()=>{
      assertActiveLocalOwner(normalizedOwner);
      ["A","B","C"].forEach(session=>localStorage.removeItem(draftKey(session)));
      localStorage.setItem(
        CANONICAL_DRAFTS_KEY,
        JSON.stringify(routineSessionMigrationApi().emptyDraftContainer(plan.canonicalRoutine.routineId))
      );
    },
    ()=>{
      assertActiveLocalOwner(normalizedOwner);
      if(plan.selectedSession) localStorage.setItem("gymos:selectedSession",plan.selectedSession);
      else localStorage.removeItem("gymos:selectedSession");
      if(plan.selectedSessionId) localStorage.setItem(SELECTED_SESSION_ID_KEY,plan.selectedSessionId);
      localStorage.setItem(SESSION_MODEL_MIGRATION_KEY,JSON.stringify({
        schemaVersion:window.GymOSRoutineSessionModel.SCHEMA_VERSION,
        migrationVersion:routineSessionMigrationApi().MIGRATION_VERSION,
        ownerId:normalizedOwner,
        routineId:plan.canonicalRoutine.routineId,
        legacySessionMap:routineSessionMigrationApi().sessionMap(plan.canonicalRoutine),
        completed:true,
        validated:true
      }));
    },
    ()=>{
      assertActiveLocalOwner(normalizedOwner);
      activationResult=window.GymOSRoutineActivation.addActivationRecord(
        activations,plan.record,{
          ownerId:normalizedOwner,
          activeActivationId:localStorage.getItem(ACTIVE_ROUTINE_ACTIVATION_ID_KEY)
        }
      );
      saveRoutineActivationRecords(activationResult.records,{
        ownerId:normalizedOwner,mark:false,
        preferredActiveId:activationResult.activeActivationId
      });
    },
    ()=>{
      assertActiveLocalOwner(normalizedOwner);
      const nextProposals=window.GymOSRoutineProposals.transitionProposalLifecycle(
        proposalRecords,{ownerId:normalizedOwner,proposalId,status:"activated",timestamp}
      );
      saveRoutineProposalRecords(nextProposals,{ownerId:normalizedOwner,mark:false});
    },
    ()=>{
      assertActiveLocalOwner(normalizedOwner);
      if(routineOwnerHasActiveWorkout(normalizedOwner)) throw new Error("active_workout_in_progress");
      if(localStorage.getItem("gymos:history")!==historyBefore) throw new Error("history_changed");
      markRoutineActivationSyncPending(timestamp);
      assertActiveLocalOwner(normalizedOwner);
      saveCurrentUserVault(normalizedOwner);
      assertActiveLocalOwner(normalizedOwner);
    }
  ]);
  if(!transaction.ok) return transaction;
  assertActiveLocalOwner(normalizedOwner);
  sessions=getRoutine();
  persistSelectedRoutineSession(plan.selectedSessionId);
  scheduleRoutineActivationSync();
  return {ok:true,idempotent:false,activation:activationResult.record};
}
function rollbackStoredRoutineActivation(activationId,{
  ownerId=null,timestamp=new Date().toISOString()
}={}){
  const normalizedOwner=routineProposalOwnerId(ownerId);
  assertActiveLocalOwner(normalizedOwner);
  const activations=getRoutineActivationRecords(normalizedOwner);
  const activation=activations.find(record=>record.activationId===activationId);
  const decision=window.GymOSRoutineActivation.rollbackDecision({
    ownerId:normalizedOwner,activationRecord:activation,currentRoutine:activeRoutineForComparison(),
    currentCanonicalRoutine:getCanonicalRoutine(),
    activeWorkoutState:routineOwnerHasActiveWorkout(normalizedOwner)
  });
  if(!decision.ok){
    if(decision.code!=="routine_changed"||!activation) return decision;
    const blocked=window.GymOSRoutineActivation.markRollbackBlocked(
      activation,decision.code,timestamp
    );
    const blockedTransaction=window.GymOSRoutineActivation.executeTransaction({
      capture:()=>captureRoutineActivationStorage(normalizedOwner),
      restore:restoreRoutineActivationStorage
    },[()=>{
      assertActiveLocalOwner(normalizedOwner);
      const updated=window.GymOSRoutineActivation.updateRecord(activations,blocked,{
        ownerId:normalizedOwner,activeActivationId:activationId
      });
      saveRoutineActivationRecords(updated.records,{
        ownerId:normalizedOwner,mark:false,preferredActiveId:updated.activeActivationId
      });
      markRoutineActivationSyncPending(timestamp);
      assertActiveLocalOwner(normalizedOwner);
      saveCurrentUserVault(normalizedOwner);
      assertActiveLocalOwner(normalizedOwner);
    }]);
    if(!blockedTransaction.ok) return blockedTransaction;
    assertActiveLocalOwner(normalizedOwner);
    scheduleRoutineActivationSync();
    return {...decision,activation:blocked};
  }
  if(decision.idempotent) return {ok:true,idempotent:true,activation:decision.record};
  if(routineOwnerHasActiveWorkout(normalizedOwner)){
    return {
      ok:false,code:"active_workout_in_progress",
      message:window.GymOSRoutineActivation.ACTIVE_WORKOUT_MESSAGE
    };
  }
  const proposalRecords=getRoutineProposalRecords(normalizedOwner);
  const historyBefore=localStorage.getItem("gymos:history");
  let rolledBack;
  const transaction=window.GymOSRoutineActivation.executeTransaction({
    capture:()=>captureRoutineActivationStorage(normalizedOwner),
    restore:restoreRoutineActivationStorage
  },[
    ()=>{
      assertActiveLocalOwner(normalizedOwner);
      if(routineOwnerHasActiveWorkout(normalizedOwner)) throw new Error("active_workout_in_progress");
      if(Object.prototype.hasOwnProperty.call(activation.baseline,"canonicalRoutineRaw")){
        restoreStorageValue(CANONICAL_ROUTINE_KEY,activation.baseline.canonicalRoutineRaw??null);
      }
    },
    ()=>{
      assertActiveLocalOwner(normalizedOwner);
      restoreStorageValue("gymos:routine",activation.baseline.routineRaw);
    },
    ()=>{
      assertActiveLocalOwner(normalizedOwner);
      if(Object.prototype.hasOwnProperty.call(activation.baseline,"canonicalDraftsRaw")){
        restoreStorageValue(CANONICAL_DRAFTS_KEY,activation.baseline.canonicalDraftsRaw??null);
      }
      if(Object.prototype.hasOwnProperty.call(activation.baseline,"selectedSessionIdRaw")){
        restoreStorageValue(SELECTED_SESSION_ID_KEY,activation.baseline.selectedSessionIdRaw??null);
      }
      if(Object.prototype.hasOwnProperty.call(activation.baseline,"migrationMetadataRaw")){
        restoreStorageValue(SESSION_MODEL_MIGRATION_KEY,activation.baseline.migrationMetadataRaw??null);
      }
    },
    ()=>{
      assertActiveLocalOwner(normalizedOwner);
      restoreStorageValue("gymos:selectedSession",activation.baseline.selectedSessionRaw);
    },
    ()=>{
      assertActiveLocalOwner(normalizedOwner);
      ["A","B","C"].forEach(session=>
        restoreStorageValue(draftKey(session),activation.baseline.draftsRaw?.[session]??null)
      );
    },
    ()=>[
      "gymos:updatedAt","gymos:syncPending","gymos:localRevision",
      "gymos:lastRemoteRevision","gymos:lastSyncAt","gymos:lastSyncHash"
    ].forEach(key=>{
      assertActiveLocalOwner(normalizedOwner);
      if(activation.baseline.storageRaw&&
        Object.prototype.hasOwnProperty.call(activation.baseline.storageRaw,key)){
        restoreStorageValue(key,activation.baseline.storageRaw[key]);
      }
    }),
    ()=>{
      assertActiveLocalOwner(normalizedOwner);
      rolledBack=window.GymOSRoutineActivation.markRolledBack(activation,timestamp);
      const updated=window.GymOSRoutineActivation.updateRecord(activations,rolledBack,{
        ownerId:normalizedOwner,activeActivationId:activationId
      });
      saveRoutineActivationRecords(updated.records,{
        ownerId:normalizedOwner,mark:false,preferredActiveId:updated.activeActivationId
      });
    },
    ()=>{
      assertActiveLocalOwner(normalizedOwner);
      const nextProposals=window.GymOSRoutineProposals.transitionProposalLifecycle(
        proposalRecords,{
          ownerId:normalizedOwner,proposalId:activation.proposalId,
          status:"rolled_back",timestamp
        }
      );
      saveRoutineProposalRecords(nextProposals,{ownerId:normalizedOwner,mark:false});
    },
    ()=>{
      assertActiveLocalOwner(normalizedOwner);
      if(routineOwnerHasActiveWorkout(normalizedOwner)) throw new Error("active_workout_in_progress");
      if(localStorage.getItem("gymos:history")!==historyBefore) throw new Error("history_changed");
      saveCurrentUserVault(normalizedOwner);
      assertActiveLocalOwner(normalizedOwner);
    }
  ]);
  if(!transaction.ok) return transaction;
  assertActiveLocalOwner(normalizedOwner);
  sessions=getRoutine();
  persistSelectedRoutineSession(
    localStorage.getItem(SELECTED_SESSION_ID_KEY)||
    localStorage.getItem("gymos:selectedSession")||
    nextSuggestedSession()
  );
  scheduleRoutineActivationSync();
  return {ok:true,idempotent:false,activation:rolledBack};
}

function getFavoriteExercises(){
  return getExerciseLibrary().filter(item=>Boolean(item.favorite));
}
function setExerciseFavorite(id,value){
  const ownerId=currentRoutineOwnerOrNull();
  if(!ownerId) return false;
  const library=getExerciseLibrary();
  const item=library.find(exercise=>exercise.id===id);
  if(!item) return false;
  if(item.custom&&item.ownerId&&item.ownerId!==ownerId) return false;
  const result=window.GymOSExerciseLibraryWorkflow?.favoriteUpdate(item,value);
  if(!result?.changed) return true;
  Object.assign(item,result.exercise);
  saveExerciseLibrary(library,{touchUpdatedAt:false,ownerId});
  return true;
}
function favoriteExerciseUsage(name){
  const key=normalizeExerciseName(name);
  const sessionsUsed=activeRoutineSessions()
    .filter(session=>(session.exercises||[]).some(item=>normalizeExerciseName(item.name)===key))
    .map(session=>session.name||session.label||session.sessionId);
  const historyRows=exerciseTrainingHistory(name);
  return {
    sessions:sessionsUsed,
    setCount:historyRows.length,
    lastDate:historyRows[0]?.date||null
  };
}
function buildGymOSBackup(){
  const storage={};
  const ownerId=currentRoutineOwnerOrNull();
  GYMOS_BACKUP_KEYS.forEach(key=>{
    const value=localStorage.getItem(key);
    if(value!==null){
      storage[key]=sanitizeWorkoutStorageValue(key,value,{ownerId});
    }
  });
  return {
    app:"GymOS",
    backupVersion:GYMOS_BACKUP_VERSION,
    exportedAt:new Date().toISOString(),
    ownerId,
    workoutProgress:typeof storedWorkoutProgressRecords==="function"
      ?storedWorkoutProgressRecords():[],
    storage
  };
}
function downloadGymOSBackup(){
  const backup=buildGymOSBackup();
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  const stamp=new Date().toISOString().slice(0,10);
  link.href=url;
  link.download=`GymOS-backup-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
function validateGymOSBackup(payload){
  if(!payload||payload.app!=="GymOS"||!payload.storage||typeof payload.storage!=="object"){
    throw new Error("El archivo no es una copia válida de GymOS.");
  }
  return payload;
}
function importGymOSBackup(payload,mode="merge"){
  const backup=validateGymOSBackup(payload);
  const ownerId=localStorage.getItem(LOCAL_OWNER_KEY)||(!AUTH_REQUIRED?"local":null);
  const normalizedOwner=window.GymOSProfileData.normalizeOwnerId(ownerId);
  if(!backup.ownerId){
    throw new Error("La copia no identifica a su propietario y no puede aplicarse de forma segura.");
  }
  let backupOwner;
  try{backupOwner=window.GymOSProfileData.normalizeOwnerId(backup.ownerId);}
  catch(_){throw new Error("La copia contiene un propietario no válido.");}
  if(backupOwner!==normalizedOwner){
    throw new Error("Esta copia pertenece a otro propietario y no se ha aplicado.");
  }
  const routineStorageKeys=[
    "gymos:routine",CANONICAL_ROUTINE_KEY,CANONICAL_DRAFTS_KEY,
    SELECTED_SESSION_ID_KEY,SESSION_MODEL_MIGRATION_KEY,
    draftKey("A"),draftKey("B"),draftKey("C")
  ];
  if(
    routineStorageKeys.some(key=>Object.hasOwn(backup.storage,key))&&
    routineOwnerHasActiveWorkout(normalizedOwner)
  ){
    throw new Error(window.GymOSRoutineActivation.ACTIVE_WORKOUT_MESSAGE);
  }
  assertActiveLocalOwner(normalizedOwner);
  const importBefore=captureRoutineSessionStartupStorage(normalizedOwner);
  const workoutProgressBefore=typeof captureOwnerWorkoutProgressStorage==="function"
    ?captureOwnerWorkoutProgressStorage(normalizedOwner):null;
  try{
  const incomingSessionKeys=[
    CANONICAL_ROUTINE_KEY,CANONICAL_DRAFTS_KEY,SELECTED_SESSION_ID_KEY,
    SESSION_MODEL_MIGRATION_KEY
  ];
  if(incomingSessionKeys.some(key=>Object.hasOwn(backup.storage,key))){
    const incomingMetadata=parseStoredJson(
      backup.storage[SESSION_MODEL_MIGRATION_KEY]??null,null
    );
    const incomingCanonical=parseStoredJson(
      backup.storage[CANONICAL_ROUTINE_KEY]??null,null
    );
    const incomingDraftsRaw=parseStoredJson(
      backup.storage[CANONICAL_DRAFTS_KEY]??null,null
    );
    const incomingDrafts=sanitizeWorkoutDraftContainer(incomingDraftsRaw,{
      ownerId:normalizedOwner,canonicalRoutine:incomingCanonical
    });
    const incomingLegacy=parseStoredJson(
      backup.storage["gymos:routine"]??null,null
    );
    const validation=window.GymOSRoutineSessionModel.validateCanonicalRoutine(incomingCanonical);
    const draftValidation=routineSessionMigrationApi().validateDraftContainer(
      incomingDrafts,{ownerId:normalizedOwner,canonicalRoutine:incomingCanonical}
    );
    const metadataMatches=incomingMetadata?.ownerId===normalizedOwner&&
      incomingMetadata?.completed===true&&incomingMetadata?.validated===true&&
      incomingMetadata?.migrationVersion===routineSessionMigrationApi().MIGRATION_VERSION&&
      incomingMetadata?.routineId===incomingCanonical?.routineId&&
      routineSessionMigrationApi().stableStringify(incomingMetadata?.legacySessionMap||{})===
        routineSessionMigrationApi().stableStringify(
          validation.valid?routineSessionMigrationApi().sessionMap(incomingCanonical):{}
        );
    const shadowMatches=!incomingLegacy||(validation.valid&&
      routineSessionMigrationApi().legacyRoutineEquivalent(
        incomingLegacy,routineSessionRuntimeApi().legacyShadow(incomingCanonical)
      ));
    if(!validation.valid||
      !draftValidation.valid||!metadataMatches||!shadowMatches){
      throw new Error("La copia canónica pertenece a otro propietario o no es válida.");
    }
  }
  if(mode==="replace"){
    removeOwnerWorkoutProgressData(normalizedOwner);
    GYMOS_BACKUP_KEYS.forEach(key=>{
      assertActiveLocalOwner(normalizedOwner);
      localStorage.removeItem(key);
    });
  }
  Object.entries(backup.storage).forEach(([key,value])=>{
    assertActiveLocalOwner(normalizedOwner);
    if(!GYMOS_BACKUP_KEYS.includes(key)) return;
    if(key===CANONICAL_DRAFTS_KEY||/^gymos:draft:[ABC]$/.test(key)){
      const incomingCanonical=parseStoredJson(
        backup.storage[CANONICAL_ROUTINE_KEY]??null,null
      )||getCanonicalRoutine();
      localStorage.setItem(key,sanitizeWorkoutStorageValue(key,value,{
        ownerId:normalizedOwner,canonicalRoutine:incomingCanonical
      }));
      return;
    }
    if(key==="gymos:routineActivationHistory"){
      try{
        const incoming=JSON.parse(value);
        importRoutineActivationSyncData({
          routineActivationHistory:Array.isArray(incoming)?incoming:[],
          activeRoutineActivationId:backup.storage["gymos:activeRoutineActivationId"]||null
        },{ownerId,mark:false});
      }catch(error){
        console.warn("Routine activation backup import failed",error);
      }
      return;
    }
    if(key==="gymos:activeRoutineActivationId") return;
    if(mode==="merge"&&localStorage.getItem(key)!==null){
      if(key===EXERCISE_LIBRARY_KEY){
        try{
          const current=getExerciseLibrary();
          const incoming=JSON.parse(value);
          const merged=window.GymOSExerciseDomain.mergeExerciseLibraries(
            current,
            Array.isArray(incoming)?incoming:[],
            {timestamp:new Date().toISOString()}
          );
          saveExerciseLibrary(merged.library,{
            mark:false,touchUpdatedAt:false,setSchema:false,ownerId:normalizedOwner
          });
          return;
        }catch(error){}
      }
      if(key===EXERCISE_SUBSTITUTIONS_KEY){
        try{
          const current=getExerciseSubstitutions();
          const incoming=JSON.parse(value);
          const byId=new Map(current.map(item=>[item.id,item]));
          (Array.isArray(incoming)?incoming:[]).forEach(item=>byId.set(item.id,item));
          saveExerciseSubstitutions([...byId.values()].sort((a,b)=>new Date(b.date)-new Date(a.date)));
          return;
        }catch(error){}
      }
      if(key===FAVORITE_SUBSTITUTIONS_KEY){
        try{
          const current=getFavoriteSubstitutions();
          const incoming=JSON.parse(value);
          saveFavoriteSubstitutions([...new Set([...current,...(Array.isArray(incoming)?incoming:[])])]);
          return;
        }catch(error){}
      }
      if(key===ROUTINE_PROPOSALS_KEY){
        try{
          const incoming=JSON.parse(value);
          const result=window.GymOSRoutineProposals.mergeProposalRecords(
            getRoutineProposalRecords(ownerId),
            Array.isArray(incoming)?incoming:[],
            {
              ownerId:routineProposalOwnerId(ownerId),
              activeProposalId:localStorage.getItem(ACTIVE_ROUTINE_PROPOSAL_ID_KEY)
            }
          );
          saveRoutineProposalRecords(result.records,{
            ownerId,mark:false,preferredActiveId:result.activeProposalId
          });
          if(result.incidents.length) console.warn("Routine proposal backup incidents",result.incidents);
          return;
        }catch(error){}
      }
      if(key===ACTIVE_ROUTINE_PROPOSAL_ID_KEY) return;
    }
    localStorage.setItem(key,String(value));
  });
  if(Array.isArray(backup.workoutProgress)&&typeof mergeIncomingWorkoutProgress==="function"){
    mergeIncomingWorkoutProgress(backup.workoutProgress,{writeCanonical:true});
  }
  if(localStorage.getItem(ROUTINE_PROPOSALS_KEY)){
    saveRoutineProposalRecords(getRoutineProposalRecords(ownerId),{ownerId,mark:false});
    const activeId=localStorage.getItem(ACTIVE_ROUTINE_PROPOSAL_ID_KEY);
    if(activeId&&!getRoutineProposalRecords(ownerId).some(record=>record.proposal.proposalId===activeId)){
      localStorage.removeItem(ACTIVE_ROUTINE_PROPOSAL_ID_KEY);
    }
  }
  if(localStorage.getItem("gymos:routineActivationHistory")){
    ensureRoutineActivationState(ownerId);
  }
  ensureRoutineSessionMigration({ownerId,mark:false});
  if(typeof ensureWorkoutProgressMigration==="function"){
    ensureWorkoutProgressMigration({ownerId,mark:false});
  }
  assertActiveLocalOwner(normalizedOwner);
  ensureProfileDataMigration({ownerId,mark:false});
  ensureExerciseDomainMigration({ownerId,mark:false,force:true});
  assertActiveLocalOwner(normalizedOwner);
  saveCurrentUserVault(ownerId);
  assertActiveLocalOwner(normalizedOwner);
  sessions=getRoutine();
  }catch(error){
    restoreRoutineSessionStartupStorage(importBefore,normalizedOwner);
    if(workoutProgressBefore&&typeof restoreOwnerWorkoutProgressStorage==="function"){
      restoreOwnerWorkoutProgressStorage(normalizedOwner,workoutProgressBefore);
    }
    throw error;
  }
}
function readJsonFile(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>{
      try{resolve(JSON.parse(String(reader.result||"")));}catch(error){reject(new Error("El archivo JSON no es válido."));}
    };
    reader.onerror=()=>reject(new Error("No se pudo leer el archivo."));
    reader.readAsText(file);
  });
}
function syncCoverageSummary(){
  const payload=buildSyncPayload();
  return {
    routine:Boolean(payload.routine),
    history:Array.isArray(payload.history),
    bodyWeight:Array.isArray(payload.bodyWeight),
    blocks:Array.isArray(payload.blocks),
    exerciseLibrary:Array.isArray(payload.exerciseLibrary),
    substitutions:Array.isArray(payload.exerciseSubstitutions),
    favoriteSubstitutions:Array.isArray(payload.favoriteSubstitutions)
  };
}

const COACH_SETTINGS_KEY="gymos:coachSettings";
const COACH_PROPOSALS_KEY="gymos:coachProposals";
const COACH_SNAPSHOTS_KEY="gymos:coachSnapshots";

function getCoachSettings(){
  try{
    return {
      backendUrl:"",
      aiEnabled:false,
      autoWeeklyReview:false,
      requireApproval:true,
      goal:"Mantenerme definido",
      sessionDuration:60,
      ...JSON.parse(localStorage.getItem(COACH_SETTINGS_KEY)||"{}")
    };
  }catch(error){
    return {backendUrl:"",aiEnabled:false,autoWeeklyReview:false,requireApproval:true,goal:"Mantenerme definido",sessionDuration:60};
  }
}
function saveCoachSettings(settings){
  localStorage.setItem(COACH_SETTINGS_KEY,JSON.stringify(settings));
}
function getCoachProposals(){
  try{
    const data=JSON.parse(localStorage.getItem(COACH_PROPOSALS_KEY)||"[]");
    return Array.isArray(data)?data:[];
  }catch(error){return [];}
}
function saveCoachProposals(items){
  localStorage.setItem(COACH_PROPOSALS_KEY,JSON.stringify(items));
}
function getCoachSnapshots(){
  try{
    const data=JSON.parse(localStorage.getItem(COACH_SNAPSHOTS_KEY)||"[]");
    return Array.isArray(data)?data:[];
  }catch(error){return [];}
}
function saveCoachSnapshots(items){
  localStorage.setItem(COACH_SNAPSHOTS_KEY,JSON.stringify(items));
}
function lastCompletedWorkouts(limit=12){
  return [...getHistory()]
    .filter(item=>item&&item.date)
    .sort((a,b)=>new Date(b.date)-new Date(a.date))
    .slice(0,limit);
}
function coachExerciseSummary(){
  const rows=[];
  activeRoutineSessions().forEach(session=>{
    (session.exercises||[]).forEach((item,index)=>{
      const history=exerciseTrainingHistory(item.name);
      const recent=history.slice(0,6);
      const avgRir=recent.filter(row=>row.rir!==null&&row.rir!=="").length
        ? recent.filter(row=>row.rir!==null&&row.rir!=="").reduce((sum,row)=>sum+Number(row.rir),0)/recent.filter(row=>row.rir!==null&&row.rir!=="").length
        : null;
      const bestRecent=Math.max(0,...recent.map(row=>row.estimated1RM||0));
      const older=history.slice(6,12);
      const bestOlder=Math.max(0,...older.map(row=>row.estimated1RM||0));
      rows.push({
        session:session.sessionId,sessionName:routineSessionRuntimeApi().displayName(session),
        index,name:item.name,sets:Number(item.sets||0),target:item.target||item.reps||"",
        increment:Number(item.increment||0),avgRir,bestRecent,bestOlder,
        trend:bestOlder>0?(bestRecent-bestOlder)/bestOlder:null,
        historyCount:history.length,
        substitutionOf:item.substitutionOf||null
      });
    });
  });
  return rows;
}
function createLocalCoachProposal(){
  const settings=getCoachSettings();
  const summaries=coachExerciseSummary();
  const changes=[];
  const notes=[];
  const workouts=lastCompletedWorkouts(12);

  summaries.forEach(item=>{
    if(item.historyCount>=4&&item.avgRir!==null){
      if(item.avgRir>=3.5){
        changes.push({
          type:"progression",
          session:item.session,
          sessionName:item.sessionName,
          index:item.index,
          exercise:item.name,
          field:"increment",
          from:item.increment,
          to:item.increment>0?item.increment:2.5,
          reason:`RIR medio alto (${item.avgRir.toFixed(1)}): hay margen para progresar.`
        });
      }else if(item.avgRir<=0.5){
        changes.push({
          type:"fatigue",
          session:item.session,
          sessionName:item.sessionName,
          index:item.index,
          exercise:item.name,
          field:"sets",
          from:item.sets,
          to:Math.max(2,item.sets-1),
          reason:`RIR medio muy bajo (${item.avgRir.toFixed(1)}): reducir temporalmente una serie.`
        });
      }
    }
    if(item.trend!==null&&item.trend<-0.05){
      changes.push({
        type:"stagnation",
        session:item.session,
        sessionName:item.sessionName,
        index:item.index,
        exercise:item.name,
        field:"increment",
        from:item.increment,
        to:0,
        reason:"El rendimiento estimado reciente ha bajado más de un 5 %."
      });
    }
  });

  const fatigue=fatigueAssessment();
  const periodization=periodizationRecommendation();
  notes.push(`Fase recomendada: ${periodization.phase}. ${periodization.action}`);
  if(fatigue.level==="alta"){
    summaries.forEach(item=>{
      if(item.sets>2&&!changes.some(change=>change.session===item.session&&change.index===item.index&&change.field==="sets")){
        changes.push({
          type:"deload",
          session:item.session,
          sessionName:item.sessionName,
          index:item.index,
          exercise:item.name,
          field:"sets",
          from:item.sets,
          to:Math.max(2,Math.ceil(item.sets*0.65)),
          reason:"Descarga recomendada por fatiga acumulada."
        });
      }
    });
  }
  if(workouts.length<3){
    notes.push("Hay pocos entrenamientos recientes. La propuesta es conservadora.");
  }
  if(!changes.length){
    notes.push("No se detectan cambios claros. Mantener la rutina y seguir registrando RIR/RPE.");
  }

  const proposal={
    id:`coach-${Date.now().toString(36)}`,
    createdAt:new Date().toISOString(),
    source:"local",
    goal:settings.goal,
    status:"pending",
    summary:changes.length
      ? `${changes.length} ajustes propuestos según tu evolución reciente.`
      : "Mantener la rutina actual.",
    notes,
    changes
  };
  const proposals=getCoachProposals();
  proposals.unshift(proposal);
  saveCoachProposals(proposals.slice(0,50));
  state.coachSessionId=proposal.id;
  return proposal;
}
function applyCoachProposal(proposal){
  if(!proposal||proposal.status!=="pending") return false;
  const routine=JSON.parse(JSON.stringify(activeRoutineForComparison()));
  const snapshot={
    id:`snapshot-${Date.now().toString(36)}`,
    proposalId:proposal.id,
    createdAt:new Date().toISOString(),
    routine
  };
  const snapshots=getCoachSnapshots();
  snapshots.unshift(snapshot);
  saveCoachSnapshots(snapshots.slice(0,20));

  proposal.changes.forEach(change=>{
    const item=Array.isArray(routine.sessions)
      ?routine.sessions.find(session=>session.sessionId===change.session)?.exercises?.[change.index]
      :routine[change.session]?.[change.index];
    if(!item||normalizeExerciseName(item.name)!==normalizeExerciseName(change.exercise)) return;
    item[change.field]=change.to;
    item.coachAdjustedAt=new Date().toISOString();
    item.coachReason=change.reason;
  });
  if(Array.isArray(routine.sessions)){
    routine.revision=(Number(routine.revision)||1)+1;
    saveCanonicalRoutineMutation(routine);
  }else saveRoutine(routine);
  sessions=getRoutine();

  const proposals=getCoachProposals();
  const found=proposals.find(item=>item.id===proposal.id);
  if(found){
    found.status="applied";
    found.appliedAt=new Date().toISOString();
    saveCoachProposals(proposals);
  }
  return true;
}
function rejectCoachProposal(proposalId){
  const proposals=getCoachProposals();
  const found=proposals.find(item=>item.id===proposalId);
  if(!found) return false;
  found.status="rejected";
  found.rejectedAt=new Date().toISOString();
  saveCoachProposals(proposals);
  return true;
}
function undoLastCoachChange(){
  const snapshots=getCoachSnapshots();
  const latest=snapshots[0];
  if(!latest?.routine) return false;
  if(Array.isArray(latest.routine.sessions)) saveCanonicalRoutineMutation(latest.routine);
  else saveRoutine(latest.routine);
  sessions=getRoutine();
  saveCoachSnapshots(snapshots.slice(1));
  const proposals=getCoachProposals();
  const proposal=proposals.find(item=>item.id===latest.proposalId);
  if(proposal){
    proposal.status="undone";
    proposal.undoneAt=new Date().toISOString();
    saveCoachProposals(proposals);
  }
  return true;
}
function coachContextPayload(){
  return {
    version:"3.9.1",
    generatedAt:new Date().toISOString(),
    settings:getCoachSettings(),
    routine:activeRoutineForComparison(),
    recentWorkouts:lastCompletedWorkouts(12),
    exerciseSummary:coachExerciseSummary(),
    bodyWeight:getBodyWeightEntries?.()||[],
    nutrition:nutritionCoachContext(),
    health:healthCoachContext(),
    recovery:{
      recentEntries:window.GymOSRecovery?.getEntries?.().slice(-14)||[],
      pendingCheckin:window.GymOSRecovery?.dueCheckin?.()||null
    },
    activeBlock:getActiveTrainingBlock?.()||null
  };
}

function startOfWeek(date){
  const d=new Date(date);
  const day=(d.getDay()+6)%7;
  d.setHours(0,0,0,0);
  d.setDate(d.getDate()-day);
  return d;
}
function weekKey(date){
  return startOfWeek(date).toISOString().slice(0,10);
}
function workoutDateValue(workout){
  return new Date(workout.date||workout.completedAt||workout.createdAt||0);
}
function completedWorkoutExercises(workout){
  return Array.isArray(workout.exercises)?workout.exercises:(Array.isArray(workout.items)?workout.items:[]);
}
function progressAnalyticsSnapshot(rangeWeeks=state.progressRangeWeeks){
  const ownerId=currentRoutineOwnerOrNull();
  if(!ownerId||!window.GymOSProgressAnalytics) throw new Error("progress_analytics_unavailable");
  const lastSyncAt=Date.parse(localStorage.getItem("gymos:lastSyncAt")||0)||0;
  const progressRecords=storedWorkoutProgressRecords(ownerId).map(record=>({
    ...record,
    pendingSync:localStorage.getItem("gymos:syncPending")==="1"&&
      (Date.parse(record.updatedAt||record.completedAt||record.startedAt||0)||0)>lastSyncAt
  }));
  const remote=state.progressRemoteData?.ownerId===ownerId?state.progressRemoteData:{};
  const weeklyGoal=localStorage.getItem("gymos:weeklyGoal");
  return window.GymOSProgressAnalytics.aggregate({
    ownerId,history:getHistory(),progressRecords,
    remoteHistory:remote.history||[],remoteProgress:remote.progress||[],
    exerciseLibrary:getExerciseLibrary(),rangeWeeks,
    plannedSessionsPerWeek:weeklyGoal===null?null:Number(weeklyGoal),now:new Date()
  });
}
async function loadRemoteProgressData(){
  const ownerId=currentRoutineOwnerOrNull();
  if(!ownerId||state.progressRemoteStatus==="loading") return;
  if(state.progressRemoteData?.ownerId===ownerId) return;
  const client=getSupabaseClient();
  if(!client||!isAppAuthenticated()){
    state.progressRemoteData={ownerId,history:[],progress:[],unavailable:true};
    state.progressRemoteStatus="offline";
    if(state.screen==="progressDashboard") renderProgressDashboard();
    return;
  }
  state.progressRemoteStatus="loading";
  try{
    const userId=state.syncUser.id;
    const {data,error}=await client.from("gymos_sync").select("payload").eq("user_id",userId).maybeSingle();
    if(error) throw error;
    if(currentRoutineOwnerOrNull()!==ownerId||state.syncUser?.id!==userId) return;
    state.progressRemoteData={
      ownerId,
      history:Array.isArray(data?.payload?.history)?data.payload.history:[],
      progress:Array.isArray(data?.payload?.workoutProgress)?data.payload.workoutProgress:[]
    };
    state.progressRemoteStatus="loaded";
  }catch(error){
    console.warn("Progress remote diagnostics unavailable",{code:error?.code||"remote_read_failed"});
    state.progressRemoteData={ownerId,history:[],progress:[],unavailable:true};
    state.progressRemoteStatus="offline";
  }
  if(state.screen==="progressDashboard") renderProgressDashboard();
}
function weeklyTrainingAnalytics(rangeWeeks=8){
  return progressAnalyticsSnapshot(rangeWeeks).weeks;
}
function fatigueAssessment(){
  const weeks=weeklyTrainingAnalytics(4);
  const current=weeks.at(-1)||{};
  const previous=weeks.at(-2)||{};
  let score=0;
  const reasons=[];
  if(current.avgRir!==null&&current.avgRir<1){
    score+=3; reasons.push("RIR semanal muy bajo");
  }else if(current.avgRir!==null&&current.avgRir<2){
    score+=2; reasons.push("RIR semanal exigente");
  }
  if(current.avgRpe!==null&&current.avgRpe>9){
    score+=3; reasons.push("RPE semanal muy alto");
  }else if(current.avgRpe!==null&&current.avgRpe>8.5){
    score+=2; reasons.push("RPE semanal alto");
  }
  if(previous.sets&&current.sets>previous.sets*1.25){
    score+=2; reasons.push("Aumento rápido del volumen");
  }
  const summaries=coachExerciseSummary();
  const declining=summaries.filter(item=>item.trend!==null&&item.trend<-0.05).length;
  if(declining>=2){
    score+=2; reasons.push(`${declining} ejercicios con rendimiento descendente`);
  }
  const recoveryEntries=window.GymOSRecovery?.getEntries?.().slice(-3)||[];
  if(recoveryEntries.length>=2){
    const averageRecovery=recoveryEntries.reduce((sum,item)=>sum+Number(item.recoveryScore||0),0)/recoveryEntries.length;
    if(averageRecovery<55){score+=2;reasons.push("Recuperación reciente baja");}
    if(recoveryEntries.filter(item=>Number(item.fatigue)>=3).length>=2){score+=2;reasons.push("Fatiga muscular alta en varios check-ins");}
    if(recoveryEntries.filter(item=>Number(item.motivation)<=2).length>=2){score+=1;reasons.push("Motivación baja durante varios días");}
  }
  let level="baja";
  if(score>=6) level="alta";
  else if(score>=3) level="media";
  return {score,level,reasons,current,previous,declining};
}
function periodizationRecommendation(){
  const fatigue=fatigueAssessment();
  const summaries=coachExerciseSummary();
  const progressing=summaries.filter(item=>item.trend!==null&&item.trend>0.03).length;
  const stalled=summaries.filter(item=>item.historyCount>=8&&(item.trend===null||Math.abs(item.trend)<0.02)).length;
  if(fatigue.level==="alta"){
    return {phase:"Descarga",action:"Reducir durante una semana un 30–40 % las series y evitar el fallo.",reason:fatigue.reasons.join(". ")};
  }
  if(stalled>=3&&fatigue.level!=="baja"){
    return {phase:"Consolidación",action:"Mantener cargas durante una semana y priorizar técnica y recuperación.",reason:`${stalled} ejercicios muestran estancamiento.`};
  }
  if(progressing>=2){
    return {phase:"Progresión",action:"Mantener la rutina y aplicar incrementos pequeños cuando completes el rango con RIR suficiente.",reason:`${progressing} ejercicios muestran una tendencia positiva.`};
  }
  return {phase:"Acumulación",action:"Mantener el volumen actual y registrar RIR/RPE para mejorar la siguiente revisión.",reason:"Todavía no hay una señal suficientemente clara para cambiar de fase."};
}
function bodyWeightTrend(){
  let entries=[];
  try{
    entries=typeof getBodyWeightEntries==="function"?getBodyWeightEntries():[];
  }catch(error){entries=[];}
  const valid=entries
    .map(item=>({date:new Date(item.date||item.createdAt||0),weight:Number(item.weight??item.value??0)}))
    .filter(item=>item.weight>0&&!Number.isNaN(item.date.getTime()))
    .sort((a,b)=>a.date-b.date);
  if(valid.length<2) return {entries:valid,change:null,weeklyRate:null};
  const first=valid[0],last=valid.at(-1);
  const days=Math.max(1,(last.date-first.date)/86400000);
  const change=last.weight-first.weight;
  return {entries:valid,change,weeklyRate:change/(days/7)};
}
function adherenceSummary(rangeWeeks=8){
  const value=progressAnalyticsSnapshot(rangeWeeks).summary.adherence;
  return value.available
    ?{completed:value.completed,possible:value.planned,percent:value.percent,available:true}
    :{completed:0,possible:0,percent:0,available:false};
}
function personalRecords(){
  return progressAnalyticsSnapshot(state.progressRangeWeeks).records.slice(0,8);
}





const HEALTH_SETTINGS_KEY="gymos:healthSettings";
const HEALTH_ENTRIES_KEY="gymos:healthEntries";
const HEALTH_IMPORTS_KEY="gymos:healthImports";

function getHealthSettings(){
  try{
    return {
      provider:"manual",
      sleepTarget:8,
      stepTarget:8000,
      restingHrBaseline:"",
      hrvBaseline:"",
      enabledMetrics:["steps","sleep","restingHr","hrv","activeCalories"],
      ...JSON.parse(localStorage.getItem(HEALTH_SETTINGS_KEY)||"{}")
    };
  }catch(error){
    return {provider:"manual",sleepTarget:8,stepTarget:8000,restingHrBaseline:"",hrvBaseline:"",enabledMetrics:["steps","sleep","restingHr","hrv","activeCalories"]};
  }
}
function saveHealthSettings(value){
  localStorage.setItem(HEALTH_SETTINGS_KEY,JSON.stringify({...getHealthSettings(),...value}));
}
function getHealthEntries(){
  try{
    const value=JSON.parse(localStorage.getItem(HEALTH_ENTRIES_KEY)||"[]");
    return Array.isArray(value)?value:[];
  }catch(error){return [];}
}
function saveHealthEntries(entries){
  localStorage.setItem(HEALTH_ENTRIES_KEY,JSON.stringify(entries.slice(-1000)));
}
function getHealthImports(){
  try{
    const value=JSON.parse(localStorage.getItem(HEALTH_IMPORTS_KEY)||"[]");
    return Array.isArray(value)?value:[];
  }catch(error){return [];}
}
function saveHealthImports(value){
  localStorage.setItem(HEALTH_IMPORTS_KEY,JSON.stringify(value.slice(-100)));
}
function healthEntryForDate(date){
  return getHealthEntries().find(item=>item.date===date)||{
    date,steps:"",sleepHours:"",sleepScore:"",restingHr:"",hrv:"",activeCalories:"",source:"manual",notes:""
  };
}
function upsertHealthEntry(entry){
  const entries=getHealthEntries();
  const index=entries.findIndex(item=>item.date===entry.date);
  if(index>=0) entries[index]={...entries[index],...entry};
  else entries.push(entry);
  entries.sort((a,b)=>a.date.localeCompare(b.date));
  saveHealthEntries(entries);
}
function healthAverage(entries,field){
  const values=entries.map(item=>Number(item[field]||0)).filter(value=>value>0);
  return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
}
function recentHealthEntries(days=7){
  const cutoff=Date.now()-days*86400000;
  return getHealthEntries().filter(item=>new Date(item.date+"T12:00:00").getTime()>=cutoff);
}
function healthBaselines(){
  const entries=recentHealthEntries(30);
  const settings=getHealthSettings();
  return {
    restingHr:Number(settings.restingHrBaseline)||healthAverage(entries,"restingHr"),
    hrv:Number(settings.hrvBaseline)||healthAverage(entries,"hrv"),
    sleep:healthAverage(entries,"sleepHours"),
    steps:healthAverage(entries,"steps")
  };
}
function recoveryAssessment(date=state.healthDate){
  const entry=healthEntryForDate(date);
  const base=healthBaselines();
  const settings=getHealthSettings();
  let score=100;
  const reasons=[];
  const sleep=Number(entry.sleepHours||0);
  const restingHr=Number(entry.restingHr||0);
  const hrv=Number(entry.hrv||0);
  const steps=Number(entry.steps||0);

  if(sleep){
    const deficit=Number(settings.sleepTarget||8)-sleep;
    if(deficit>0){
      score-=Math.min(35,deficit*12);
      reasons.push(`Sueño ${sleep.toFixed(1)} h`);
    }
  }else{
    score-=10;
    reasons.push("Sueño no registrado");
  }

  if(restingHr&&base.restingHr){
    const increase=restingHr-base.restingHr;
    if(increase>0){
      score-=Math.min(25,increase*4);
      reasons.push(`FC reposo +${increase.toFixed(0)} bpm`);
    }
  }

  if(hrv&&base.hrv){
    const decrease=(base.hrv-hrv)/base.hrv;
    if(decrease>0){
      score-=Math.min(25,decrease*60);
      reasons.push(`HRV ${Math.round(decrease*100)}% bajo baseline`);
    }
  }

  if(steps&&steps<Number(settings.stepTarget||8000)*0.35){
    score-=5;
  }

  score=Math.max(0,Math.min(100,Math.round(score)));
  let status="Alta";
  let recommendation="Puedes entrenar según lo planificado.";
  if(score<70){status="Media";recommendation="Mantén la sesión, pero evita forzar el fallo y controla el RIR.";}
  if(score<45){status="Baja";recommendation="Considera reducir volumen o realizar una sesión ligera de recuperación.";}
  return {score,status,recommendation,reasons};
}
function weeklyHealthSummary(){
  const entries=recentHealthEntries(7);
  return {
    days:entries.length,
    sleep:healthAverage(entries,"sleepHours"),
    steps:healthAverage(entries,"steps"),
    restingHr:healthAverage(entries,"restingHr"),
    hrv:healthAverage(entries,"hrv"),
    activeCalories:healthAverage(entries,"activeCalories")
  };
}
function healthCoachContext(){
  return {
    settings:getHealthSettings(),
    recentEntries:getHealthEntries().slice(-21),
    baselines:healthBaselines(),
    recovery:recoveryAssessment(),
    weeklySummary:weeklyHealthSummary(),
    imports:getHealthImports().slice(-10)
  };
}
function normalizeHealthHeader(value){
  return String(value||"").trim().toLowerCase().replace(/[áàä]/g,"a").replace(/[éèë]/g,"e").replace(/[íìï]/g,"i").replace(/[óòö]/g,"o").replace(/[úùü]/g,"u").replace(/[^a-z0-9]+/g,"_");
}
function parseHealthCsv(text,filename="health.csv"){
  const lines=String(text||"").split(/\r?\n/).filter(line=>line.trim());
  if(lines.length<2) throw new Error("El CSV no contiene filas suficientes.");
  const delimiter=(lines[0].match(/;/g)||[]).length>(lines[0].match(/,/g)||[]).length?";":",";
  const split=line=>{
    const out=[];let current="";let quoted=false;
    for(let i=0;i<line.length;i++){
      const char=line[i];
      if(char==='"'&&line[i+1]==='"'){current+='"';i++;continue;}
      if(char==='"'){quoted=!quoted;continue;}
      if(char===delimiter&&!quoted){out.push(current.trim());current="";continue;}
      current+=char;
    }
    out.push(current.trim());
    return out;
  };
  const headers=split(lines[0]).map(normalizeHealthHeader);
  const aliases={
    date:["date","fecha","day"],
    steps:["steps","pasos","step_count"],
    sleepHours:["sleep_hours","sleep","sueno_horas","horas_sueno","sleep_duration"],
    sleepScore:["sleep_score","puntuacion_sueno"],
    restingHr:["resting_hr","resting_heart_rate","frecuencia_cardiaca_reposo","fc_reposo"],
    hrv:["hrv","heart_rate_variability","variabilidad_frecuencia_cardiaca"],
    activeCalories:["active_calories","calorias_activas","activity_calories"]
  };
  const findIndex=names=>headers.findIndex(header=>names.includes(header));
  const indexes=Object.fromEntries(Object.entries(aliases).map(([key,names])=>[key,findIndex(names)]));
  if(indexes.date<0) throw new Error("El CSV debe incluir una columna date o fecha.");

  const imported=[];
  lines.slice(1).forEach(line=>{
    const values=split(line);
    const rawDate=values[indexes.date];
    if(!rawDate) return;
    const parsedDate=rawDate.includes("/")?rawDate.split("/").reverse().join("-"):rawDate.slice(0,10);
    const entry={
      date:parsedDate,
      source:"csv",
      sourceFile:filename
    };
    Object.entries(indexes).forEach(([key,index])=>{
      if(key==="date"||index<0) return;
      const raw=String(values[index]||"").replace(",",".");
      if(raw!=="") entry[key]=Number(raw);
    });
    imported.push(entry);
  });
  if(!imported.length) throw new Error("No se encontraron registros válidos.");
  imported.forEach(upsertHealthEntry);
  const imports=getHealthImports();
  imports.push({
    id:`import-${Date.now().toString(36)}`,
    createdAt:new Date().toISOString(),
    filename,
    rows:imported.length,
    provider:"csv"
  });
  saveHealthImports(imports);
  return imported.length;
}

const APP_PREFERENCES_KEY="gymos:appPreferences";
const APP_LOGS_KEY="gymos:developerLogs";
const QUICK_ACTIONS_KEY="gymos:quickActions";
const QUICK_ACTION_KEYS=[
  "recovery","nutrition","register_food","scan_food","recipes","weight",
  "body_measurements","progress","coach","workout_history","change_session",
  "timer","sports_profile","account","appearance","sync"
];
const RECOMMENDED_QUICK_ACTIONS=["recovery","scan_food","weight","coach"];

function normalizeQuickActionItems(items){
  const source=Array.isArray(items)?items:[];
  const keys=[];
  source
    .slice()
    .sort((a,b)=>Number(a?.position||0)-Number(b?.position||0))
    .forEach(item=>{
      const key=typeof item==="string"?item:item?.key;
      if(QUICK_ACTION_KEYS.includes(key)&&!keys.includes(key)&&keys.length<4) keys.push(key);
    });
  const selected=keys.length>=2?keys:RECOMMENDED_QUICK_ACTIONS.slice();
  return selected.map((key,index)=>({key,position:index+1}));
}
function getQuickActionPreferences(){
  try{
    const stored=JSON.parse(localStorage.getItem(QUICK_ACTIONS_KEY)||"null");
    return {
      quickActions:normalizeQuickActionItems(stored?.quickActions||stored?.quick_actions||stored),
      hidden:Boolean(stored?.hidden)
    };
  }catch(error){
    return {quickActions:normalizeQuickActionItems(RECOMMENDED_QUICK_ACTIONS),hidden:false};
  }
}
function saveQuickActionPreferences(value,{markUpdated=true}={}){
  const current=getQuickActionPreferences();
  const next={
    quickActions:normalizeQuickActionItems(value?.quickActions||current.quickActions),
    hidden:value?.hidden===undefined?current.hidden:Boolean(value.hidden)
  };
  localStorage.setItem(QUICK_ACTIONS_KEY,JSON.stringify(next));
  if(markUpdated) markLocalUpdated();
  return next;
}

function getAppPreferences(){
  try{
    const stored=JSON.parse(localStorage.getItem(APP_PREFERENCES_KEY)||"{}");
    const legacyFontScale={
      "font-scale-sm":"small","font-scale-md":"normal",
      "font-scale-lg":"large","font-scale-xl":"xlarge"
    }[localStorage.getItem("gymos:fontScale")];
    return {
      mode:"user",
      theme:localStorage.getItem("gymos:appearance")||"system",
      accent:"violet",
      density:"comfortable",
      fontScale:legacyFontScale||"normal",
      highContrast:false,
      largeTapTargets:false,
      compact:false,
      animations:true,
      dailyThought:"automatic",
      ...stored
    };
  }catch(error){
    return {mode:"user",theme:"system",accent:"violet",density:"comfortable",fontScale:"normal",highContrast:false,largeTapTargets:false,compact:false,animations:true,dailyThought:"automatic"};
  }
}
function saveAppPreferences(value){
  const current=getAppPreferences();
  const next={...current,...value};
  if(JSON.stringify(current)===JSON.stringify(next)){
    applyAppPreferences();
    return {changed:false,preferences:current};
  }
  localStorage.setItem(APP_PREFERENCES_KEY,JSON.stringify(next));
  applyAppPreferences();
  return {changed:true,preferences:next};
}

const DAILY_THOUGHT_STORAGE_KEY="gymos:dailyThought";
const DAILY_THOUGHT_SOURCE={
  getEntries(){
    return Array.isArray(window.GymOSDailyThoughts?.entries)
      ?window.GymOSDailyThoughts.entries
      :[];
  }
};

function dailyThoughtDateKey(value=new Date()){
  const date=new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
function dailyThoughtHash(value){
  let hash=2166136261;
  for(let index=0;index<value.length;index++){
    hash^=value.charCodeAt(index);
    hash=Math.imul(hash,16777619);
  }
  return hash>>>0;
}
function dailyThoughtCompletedWeekStreak(history,goal,now=new Date()){
  const target=Number(goal);
  if(!Number.isInteger(target)||target<1) return 0;
  const countForWeek=start=>{
    const end=new Date(start);
    end.setDate(end.getDate()+7);
    return history.filter(item=>{
      const date=new Date(item?.date);
      return !Number.isNaN(date.getTime())&&date>=start&&date<end;
    }).length;
  };
  const cursor=new Date(now);
  cursor.setHours(0,0,0,0);
  cursor.setDate(cursor.getDate()-((cursor.getDay()+6)%7));
  if(countForWeek(cursor)<target) cursor.setDate(cursor.getDate()-7);
  let streak=0;
  while(streak<=260&&countForWeek(cursor)>=target){
    streak++;
    cursor.setDate(cursor.getDate()-7);
  }
  return streak;
}
function dailyThoughtContext(now=new Date(),inputs={}){
  const history=(Array.isArray(inputs.history)?inputs.history:getHistory())
    .filter(workout=>workout?.date&&!Number.isNaN(new Date(workout.date).getTime()))
    .sort((a,b)=>new Date(b.date)-new Date(a.date));
  const latest=history[0]||null;
  const today=dailyThoughtDateKey(now);
  const latestIsToday=Boolean(latest&&dailyThoughtDateKey(latest.date)===today);
  let improved=false;
  if(latestIsToday){
    try{
      improved=recordsForWorkout(latest,history).length>0;
    }catch(error){
      console.error("Daily thought record context",error);
    }
  }
  const lastDate=latest?new Date(latest.date):null;
  const daysSinceLast=lastDate
    ?Math.max(0,Math.floor((new Date(now.getFullYear(),now.getMonth(),now.getDate())-new Date(lastDate.getFullYear(),lastDate.getMonth(),lastDate.getDate()))/86400000))
    :null;
  const onboardingGoal=String(getOnboardingProfile()?.goal||"").toLocaleLowerCase("es");
  const hasNutritionGoal=Boolean(localStorage.getItem(NUTRITION_SETTINGS_KEY));
  const nutritionGoal=hasNutritionGoal
    ?String(getNutritionSettings()?.goal||"").toLocaleLowerCase("es")
    :"";
  const inDefinition=onboardingGoal==="fat_loss"||/defin|fat|lose|pérdida|perdida/.test(nutritionGoal);
  const tags=[];
  if(improved) tags.push("record");
  if(latestIsToday) tags.push("completed");
  if(daysSinceLast!==null&&daysSinceLast>=4) tags.push("return");
  const weeklyGoal=inputs.weeklyGoal??getWeeklyGoal();
  if(dailyThoughtCompletedWeekStreak(history,weeklyGoal,now)>=2) tags.push("streak");
  if(inDefinition) tags.push("definition");
  if(now.getDay()===1) tags.push("monday");
  if(now.getDay()===5) tags.push("friday");
  tags.push("training");
  return {tags,today,latestIsToday,daysSinceLast};
}
function readStoredDailyThought(){
  try{
    const stored=JSON.parse(localStorage.getItem(DAILY_THOUGHT_STORAGE_KEY)||"null");
    return stored&&typeof stored==="object"?stored:null;
  }catch(error){
    return null;
  }
}
function getDailyThought(now=new Date(),contextInputs={}){
  const preference=getAppPreferences().dailyThought||"automatic";
  if(preference==="disabled") return null;
  const entries=DAILY_THOUGHT_SOURCE.getEntries();
  if(!entries.length) return null;
  const context=dailyThoughtContext(now,contextInputs);
  const stored=readStoredDailyThought();
  if(stored?.date===context.today){
    const selected=entries.find(entry=>entry.id===stored.id);
    if(selected) return selected;
  }
  const available=preference==="automatic"
    ?entries
    :entries.filter(entry=>entry.category===preference);
  if(!available.length) return null;
  const matching=available
    .map(entry=>{
      const firstMatch=context.tags.findIndex(tag=>entry.tags?.includes(tag));
      return {entry,score:firstMatch===-1?0:context.tags.length-firstMatch};
    });
  const bestScore=Math.max(...matching.map(candidate=>candidate.score));
  let candidates=matching
    .filter(candidate=>candidate.score===bestScore)
    .map(candidate=>candidate.entry);
  if(candidates.length>1&&stored?.id){
    candidates=candidates.filter(entry=>entry.id!==stored.id);
  }
  if(!candidates.length) candidates=available;
  const identity=state.syncUser?.id||state.syncUser?.email||"local";
  const selected=candidates[dailyThoughtHash(`${context.today}:${identity}:${context.tags.join(",")}:${preference}`)%candidates.length];
  localStorage.setItem(DAILY_THOUGHT_STORAGE_KEY,JSON.stringify({
    date:context.today,
    id:selected.id
  }));
  return selected;
}
function renderDailyThought(thought=getDailyThought()){
  if(!thought) return "";
  return `<aside class="daily-thought-card" aria-label="Pensamiento del día">
    <div class="daily-thought-label">Pensamiento del día</div>
    <p>“${esc(thought.text).replace(/\n/g,"<br>")}”</p>
  </aside>`;
}

function resolvedTheme(){
  const preference=getAppPreferences().theme;
  if(preference!=="system") return preference;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches?"dark":"light";
}
function applyAppPreferences(){
  const preferences=getAppPreferences();
  document.documentElement.dataset.theme=resolvedTheme();
  document.documentElement.dataset.accent=preferences.accent||"violet";
  document.documentElement.dataset.fontScale=preferences.fontScale||"normal";
  document.body.dataset.mode=preferences.mode;
  document.body.dataset.density=preferences.density||"comfortable";
  document.body.classList.toggle("compact-ui",Boolean(preferences.compact));
  document.body.classList.toggle("reduce-motion",!preferences.animations);
  document.body.classList.toggle("high-contrast",Boolean(preferences.highContrast));
  document.body.classList.toggle("large-tap-targets",Boolean(preferences.largeTapTargets));
}

function appPreferencePresets(){
  return {
    balanced:{
      theme:"system",accent:"violet",density:"comfortable",fontScale:"normal",
      highContrast:false,largeTapTargets:false,compact:false,animations:true
    },
    focus:{
      theme:"dark",accent:"blue",density:"compact",fontScale:"normal",
      highContrast:false,largeTapTargets:false,compact:true,animations:false
    },
    accessible:{
      theme:"light",accent:"teal",density:"comfortable",fontScale:"large",
      highContrast:true,largeTapTargets:true,compact:false,animations:false
    },
    bold:{
      theme:"dark",accent:"orange",density:"comfortable",fontScale:"normal",
      highContrast:true,largeTapTargets:false,compact:false,animations:true
    }
  };
}
function applyPreferencePreset(name){
  const preset=appPreferencePresets()[name];
  if(!preset) return;
  saveAppPreferences(preset);
}

function developerModeEnabled(){
  return getAppPreferences().mode==="developer";
}
function addDeveloperLog(level,message,details=null){
  const logs=getDeveloperLogs();
  logs.unshift({
    id:`log-${Date.now().toString(36)}`,
    createdAt:new Date().toISOString(),
    level,
    message:String(message),
    details
  });
  localStorage.setItem(APP_LOGS_KEY,JSON.stringify(logs.slice(0,100)));
}
function getDeveloperLogs(){
  try{
    const value=JSON.parse(localStorage.getItem(APP_LOGS_KEY)||"[]");
    return Array.isArray(value)?value:[];
  }catch(error){return [];}
}
function clearDeveloperLogs(){
  localStorage.removeItem(APP_LOGS_KEY);
}
function storageDiagnostics(){
  const internalPrefixes=window.GymOSProfileData?.MIGRATION_INTERNAL_KEY_PREFIXES||[];
  const keys=Object.keys(localStorage).filter(key=>
    key.startsWith("gymos:")&&!internalPrefixes.some(prefix=>key.startsWith(prefix))
  );
  const rows=keys.map(key=>{
    const value=localStorage.getItem(key)||"";
    return {key,size:new Blob([value]).size};
  }).sort((a,b)=>b.size-a.size);
  return {
    keys:rows,
    totalBytes:rows.reduce((sum,row)=>sum+row.size,0),
    itemCount:rows.length
  };
}
function formatBytes(value){
  if(value<1024) return `${value} B`;
  if(value<1024*1024) return `${(value/1024).toFixed(1)} KB`;
  return `${(value/1024/1024).toFixed(2)} MB`;
}
async function serviceWorkerDiagnostics(){
  if(!("serviceWorker" in navigator)) return {supported:false};
  const registration=await navigator.serviceWorker.getRegistration();
  return {
    supported:true,
    registered:Boolean(registration),
    scope:registration?.scope||null,
    controller:Boolean(navigator.serviceWorker.controller)
  };
}
function downloadDeveloperDiagnostics(){
  const payload={
    generatedAt:new Date().toISOString(),
    appVersion:"3.4.0",
    preferences:getAppPreferences(),
    storage:storageDiagnostics(),
    sync:{
      status:state.syncStatus,
      user:state.syncUser?.email||null,
      lastSync:getLastSyncAt(),
      config:{
        configured:Boolean(getSyncConfig().url&&getSyncConfig().key),
        url:getSyncConfig().url||null
      }
    },
    coach:{
      connection:getCoachConnection(),
      backendConfigured:Boolean(getCoachSettings().backendUrl)
    },
    logs:getDeveloperLogs(),
    userAgent:navigator.userAgent,
    online:navigator.onLine
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;
  link.download=`gymos-diagnostics-${new Date().toISOString().slice(0,10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

const NUTRITION_SETTINGS_KEY="gymos:nutritionSettings";
const NUTRITION_ENTRIES_KEY="gymos:nutritionEntries";

function getNutritionSettings(){
  try{
    const stored=JSON.parse(localStorage.getItem(NUTRITION_SETTINGS_KEY)||"null");
    if(!stored||typeof stored!=="object"){
      return {calculated:false,source:null,goal:"",weeklyTarget:null,calories:null,protein:null,carbs:null,fat:null,fiber:null};
    }
    const hasTargets=["calories","protein","carbs","fat"].every(field=>Number(stored[field])>0);
    return {
      calculated:stored.calculated??hasTargets,
      source:stored.source||(hasTargets?"manual":null),
      goal:"",weeklyTarget:null,calories:null,protein:null,carbs:null,fat:null,fiber:null,
      ...stored
    };
  }catch(error){
    return {calculated:false,source:null,goal:"",weeklyTarget:null,calories:null,protein:null,carbs:null,fat:null,fiber:null};
  }
}
function saveNutritionSettings(value){
  localStorage.setItem(NUTRITION_SETTINGS_KEY,JSON.stringify({...value,calculated:["calories","protein","carbs","fat"].every(field=>Number(value[field])>0)}));
  markLocalUpdated();
}
function hasNutritionTargets(settings=getNutritionSettings()){
  return Boolean(settings.calculated&&["calories","protein","carbs","fat"].every(field=>Number(settings[field])>0));
}
function getNutritionEntries(){
  try{
    const data=JSON.parse(localStorage.getItem(NUTRITION_ENTRIES_KEY)||"[]");
    return Array.isArray(data)?data:[];
  }catch(error){return [];}
}
function saveNutritionEntries(entries){
  localStorage.setItem(NUTRITION_ENTRIES_KEY,JSON.stringify(entries.slice(-500)));
}
function nutritionEntryForDate(date){
  return getNutritionEntries().find(item=>item.date===date)||{
    date,calories:"",protein:"",carbs:"",fat:"",water:"",steps:"",notes:""
  };
}
function upsertNutritionEntry(entry){
  const entries=getNutritionEntries();
  const index=entries.findIndex(item=>item.date===entry.date);
  if(index>=0) entries[index]=entry;
  else entries.push(entry);
  entries.sort((a,b)=>a.date.localeCompare(b.date));
  saveNutritionEntries(entries);
}
function nutritionProgress(value,target){
  const current=Number(value||0);
  const goal=Number(target||0);
  return goal>0?Math.min(100,current/goal*100):0;
}
function nutritionWeeklySummary(){
  const entries=getNutritionEntries()
    .filter(item=>{
      const date=new Date(item.date+"T12:00:00");
      return Date.now()-date.getTime()<=7*86400000;
    });
  const average=field=>{
    const values=entries.map(item=>Number(item[field]||0)).filter(value=>value>0);
    return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
  };
  return {
    days:entries.length,
    calories:average("calories"),
    protein:average("protein"),
    carbs:average("carbs"),
    fat:average("fat"),
    water:average("water"),
    steps:average("steps")
  };
}
function bodyCompositionAssessment(){
  const trend=bodyWeightTrend();
  const settings=getNutritionSettings();
  if(!hasNutritionTargets(settings)){
    return {status:"Sin calcular",message:"Calcula tus necesidades antes de comparar la tendencia de peso."};
  }
  if(trend.weeklyRate===null){
    return {
      status:"Sin datos",
      message:"Registra al menos dos pesos para valorar la tendencia."
    };
  }
  const target=Number(settings.weeklyTarget||0);
  const difference=trend.weeklyRate-target;
  if(Math.abs(difference)<=0.15){
    return {status:"En objetivo",message:`Ritmo actual: ${trend.weeklyRate.toFixed(2)} kg/semana.`};
  }
  if(settings.goal==="Definición"&&trend.weeklyRate>target+0.15){
    return {status:"Por encima",message:"El peso baja más lento de lo previsto o está aumentando."};
  }
  if(settings.goal==="Definición"&&trend.weeklyRate<target-0.15){
    return {status:"Demasiado rápido",message:"La pérdida de peso es más rápida de lo planificado. Vigila rendimiento y recuperación."};
  }
  if(settings.goal==="Volumen"&&trend.weeklyRate<target-0.15){
    return {status:"Por debajo",message:"La subida de peso es menor de lo previsto."};
  }
  if(settings.goal==="Volumen"&&trend.weeklyRate>target+0.15){
    return {status:"Demasiado rápido",message:"La subida de peso es más rápida de lo planificado."};
  }
  return {status:"Revisar",message:`Ritmo actual: ${trend.weeklyRate.toFixed(2)} kg/semana.`};
}
function nutritionCoachContext(){
  return {
    settings:getNutritionSettings(),
    recentEntries:getNutritionEntries().slice(-14),
    professionalPlans:(window.GymOSProfessionalNutrition?.getPlans?.()||[]).map(plan=>({
      id:plan.id,title:plan.title,planDate:plan.planDate,professional:plan.professional,
      meals:plan.meals,savedAdaptations:plan.savedAdaptations||[]
    })),
    weeklySummary:nutritionWeeklySummary(),
    weightTrend:bodyWeightTrend(),
    bodyCompositionAssessment:bodyCompositionAssessment()
  };
}

const COACH_CHAT_KEY="gymos:coachChat";
const COACH_CONNECTION_KEY="gymos:coachConnection";

function getCoachConnection(){
  try{
    return {
      status:"unknown",
      checkedAt:null,
      model:null,
      provider:"rules",
      aiStatus:"unknown",
      aiCheckedAt:null,
      backendVersion:null,
      ...JSON.parse(localStorage.getItem(COACH_CONNECTION_KEY)||"{}")
    };
  }catch(error){
    return {status:"unknown",checkedAt:null,model:null,provider:"rules",aiStatus:"unknown",aiCheckedAt:null,backendVersion:null};
  }
}
function saveCoachConnection(value){
  localStorage.setItem(COACH_CONNECTION_KEY,JSON.stringify(value));
}
function getCoachChatMessages(){
  try{
    const data=JSON.parse(localStorage.getItem(COACH_CHAT_KEY)||"[]");
    return Array.isArray(data)?data:[];
  }catch(error){return [];}
}
function saveCoachChatMessages(messages){
  localStorage.setItem(COACH_CHAT_KEY,JSON.stringify(messages.slice(-100)));
}
function coachBackendBaseUrl(){
  const url=String(getCoachSettings().backendUrl||"").trim();
  if(!url) throw new Error("Configura primero la URL del backend Coach.");
  return url.replace(/\/$/,"");
}
async function coachBackendFetch(path,options={}){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),20000);
  try{
    const response=await fetch(coachBackendBaseUrl()+path,{
      ...options,
      signal:controller.signal,
      headers:{
        "Content-Type":"application/json",
        ...(state.syncSession?.access_token?{"Authorization":`Bearer ${state.syncSession.access_token}`}:{ }),
        ...(options.headers||{})
      }
    });
    let data=null;
    try{data=await response.json();}catch(error){}
    if(!response.ok){
      throw new Error(data?.detail||data?.message||`Error del backend (${response.status}).`);
    }
    return data||{};
  }catch(error){
    if(error.name==="AbortError") throw new Error("El backend ha tardado demasiado en responder.");
    throw error;
  }finally{
    clearTimeout(timeout);
  }
}
async function testCoachConnection(){
  try{
    const data=await coachBackendFetch("/health",{method:"GET"});
    const connection={
      status:"connected",
      checkedAt:new Date().toISOString(),
      model:data.model||null,
      backendVersion:data.version||null
    };
    saveCoachConnection(connection);
    return connection;
  }catch(error){
    saveCoachConnection({
      status:"error",
      checkedAt:new Date().toISOString(),
      error:error.message
    });
    throw error;
  }
}
function coachChatContext(){
  const summaries=coachExerciseSummary();
  return {
    version:"3.2.0",
    generatedAt:new Date().toISOString(),
    goal:getCoachSettings().goal,
    routine:activeRoutineForComparison(),
    recentWorkouts:lastCompletedWorkouts(8),
    exerciseSummary:summaries,
    fatigue:fatigueAssessment(),
    periodization:periodizationRecommendation(),
    bodyWeight:bodyWeightTrend(),
    nutrition:nutritionCoachContext(),
    activeBlock:typeof getActiveTrainingBlock==="function"?getActiveTrainingBlock():null
  };
}
async function sendCoachChatMessage(message){
  const trimmed=String(message||"").trim();
  if(!trimmed) throw new Error("Escribe un mensaje.");
  const messages=getCoachChatMessages();
  const userMessage={
    id:`chat-${Date.now().toString(36)}-u`,
    role:"user",
    content:trimmed,
    createdAt:new Date().toISOString()
  };
  messages.push(userMessage);
  saveCoachChatMessages(messages);

  const data=await coachBackendFetch("/coach/chat",{
    method:"POST",
    body:JSON.stringify({
      message:trimmed,
      history:messages.slice(-12),
      context:coachChatContext()
    })
  });

  const assistantMessage={
    id:`chat-${Date.now().toString(36)}-a`,
    role:"assistant",
    content:String(data.message||data.reply||"No se recibió respuesta."),
    createdAt:new Date().toISOString(),
    actions:Array.isArray(data.actions)?data.actions:[],
    proposal:data.proposal||null
  };
  messages.push(assistantMessage);
  saveCoachChatMessages(messages);

  if(data.proposal&&Array.isArray(data.proposal.changes)){
    const proposal={
      id:data.proposal.id||`coach-${Date.now().toString(36)}`,
      createdAt:new Date().toISOString(),
      source:"remote-chat",
      goal:getCoachSettings().goal,
      status:"pending",
      summary:data.proposal.summary||"Propuesta generada desde el chat.",
      notes:Array.isArray(data.proposal.notes)?data.proposal.notes:[],
      changes:data.proposal.changes
    };
    const proposals=getCoachProposals();
    proposals.unshift(proposal);
    saveCoachProposals(proposals.slice(0,50));
    assistantMessage.proposalId=proposal.id;
    saveCoachChatMessages(messages);
  }
  return assistantMessage;
}
function clearCoachChat(){
  localStorage.removeItem(COACH_CHAT_KEY);
}

async function requestRemoteCoachProposal(){
  const settings=getCoachSettings();
  if(!settings.backendUrl) throw new Error("Configura primero la URL del backend Coach.");
  const data=await coachBackendFetch("/coach/review",{
    method:"POST",
    body:JSON.stringify(coachContextPayload())
  });
  const proposal={
    id:data.id||`coach-${Date.now().toString(36)}`,
    createdAt:new Date().toISOString(),
    source:"remote",
    goal:settings.goal,
    status:"pending",
    summary:data.summary||"Propuesta recibida del Coach.",
    notes:Array.isArray(data.notes)?data.notes:[],
    changes:Array.isArray(data.changes)?data.changes:[]
  };
  const proposals=getCoachProposals();
  proposals.unshift(proposal);
  saveCoachProposals(proposals.slice(0,50));
  state.coachSessionId=proposal.id;
  return proposal;
}
function suggestedSubstitutes(currentName,query="",equipment="Todos",favoritesOnly=false){
  const current=exerciseLibraryItemByName(currentName);
  const q=String(query||"").trim().toLowerCase();
  const favoritePairs=getFavoriteSubstitutions();
  return getExerciseLibrary()
    .filter(item=>normalizeExerciseName(item.name)!==normalizeExerciseName(currentName))
    .filter(item=>!q||[item.name,item.muscle,item.equipment,item.type,item.notes].join(" ").toLowerCase().includes(q))
    .filter(item=>equipment==="Todos"||item.equipment===equipment)
    .map(item=>{
      const sameMuscle=current&&item.muscle===current.muscle;
      const sameType=current&&item.type===current.type;
      const favorite=favoritePairs.includes(substitutionPairKey(currentName,item.name));
      let score=0;
      if(sameMuscle) score+=4;
      if(sameType) score+=2;
      if(favorite) score+=6;
      if(item.favorite) score+=1;
      return {...item,sameMuscle,sameType,favorite,score};
    })
    .filter(item=>!favoritesOnly||item.favorite)
    .sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,"es"));
}
function canonicalSessionByRef(sessionRef){
  const canonical=getCanonicalRoutine();
  if(!canonical) return null;
  return routineSessionRuntimeApi().sessionById(canonical,sessionRef)||
    routineSessionRuntimeApi().sessionByLegacyKey(canonical,sessionRef);
}
function saveCanonicalSessionExercises(sessionRef,exercises,{mark=true}={}){
  const ownerId=currentRoutineOwnerOrNull();
  const canonical=getCanonicalRoutine();
  const session=canonicalSessionByRef(sessionRef);
  if(!ownerId||!canonical||!session) throw new Error("session_not_found");
  const before=captureRoutineSessionStartupStorage(ownerId);
  try{
    assertActiveLocalOwner(ownerId);
    const next=JSON.parse(JSON.stringify(canonical));
    const target=next.sessions.find(item=>item.sessionId===session.sessionId);
    target.exercises=JSON.parse(JSON.stringify(exercises));
    next.revision=canonical.revision+1;
    saveCanonicalRoutine(next,{mark:false,writeLegacyShadow:true});
    const drafts=getCanonicalDrafts();
    if(drafts){
      const updated=routineSessionMigrationApi().markStaleDrafts(drafts,{
        ownerId,canonicalRoutine:next
      });
      localStorage.setItem(CANONICAL_DRAFTS_KEY,JSON.stringify(updated));
      writeLegacyDraftShadows(next,updated);
    }
    assertActiveLocalOwner(ownerId);
    if(mark) markLocalUpdated();
    sessions=getRoutine();
    return next;
  }catch(error){
    restoreRoutineSessionStartupStorage(before,ownerId);
    throw error;
  }
}
function saveCanonicalRoutineMutation(routine,{mark=true}={}){
  const ownerId=currentRoutineOwnerOrNull();
  if(!ownerId) throw new Error("owner_required");
  const before=captureRoutineSessionStartupStorage(ownerId);
  try{
    assertActiveLocalOwner(ownerId);
    const next=saveCanonicalRoutine(routine,{mark:false,writeLegacyShadow:true});
    const drafts=getCanonicalDrafts();
    if(drafts){
      const updated=routineSessionMigrationApi().markStaleDrafts(drafts,{
        ownerId,canonicalRoutine:next
      });
      localStorage.setItem(CANONICAL_DRAFTS_KEY,JSON.stringify(updated));
      writeLegacyDraftShadows(next,updated);
    }
    assertActiveLocalOwner(ownerId);
    if(mark) markLocalUpdated();
    sessions=getRoutine();
    return next;
  }catch(error){
    restoreRoutineSessionStartupStorage(before,ownerId);
    throw error;
  }
}
function applyExerciseSubstitution(session,index,replacement,reason){
  const sessionModel=canonicalSessionByRef(session);
  const exercises=JSON.parse(JSON.stringify(sessionModel?.exercises||[]));
  const current=exercises[index];
  if(!current||!replacement) return false;
  const next={
    ...current,
    name:replacement.name,
    substitutionOf:current.name,
    substitutionReason:reason||"",
    notes:current.notes||replacement.notes||""
  };
  exercises[index]=next;
  saveCanonicalSessionExercises(session,exercises);

  const history=getExerciseSubstitutions();
  history.unshift({
    id:`sub-${Date.now().toString(36)}`,
    date:new Date().toISOString(),
    session:sessionModel.legacySessionKey||sessionModel.label,
    sessionId:sessionModel.sessionId,
    from:current.name,
    to:replacement.name,
    reason:reason||"",
    preserved:{sets:current.sets,target:current.target,increment:current.increment,type:current.type}
  });
  saveExerciseSubstitutions(history.slice(0,200));
  return true;
}
function revertLastSubstitution(session,index){
  const sessionModel=canonicalSessionByRef(session);
  const exercises=JSON.parse(JSON.stringify(sessionModel?.exercises||[]));
  const current=exercises[index];
  if(!current?.substitutionOf) return false;
  exercises[index]={
    ...current,
    name:current.substitutionOf
  };
  delete exercises[index].substitutionOf;
  delete exercises[index].substitutionReason;
  saveCanonicalSessionExercises(session,exercises);
  return true;
}
function formatBlockDate(value){
  const d=dateOnly(value);
  return d?d.toLocaleDateString("es-ES",{day:"2-digit",month:"short",year:"numeric"}):"—";
}


const app = document.getElementById("app");
const importFile = document.getElementById("importFile");
const routineFile = document.getElementById("routineFile");


const AUTH_REQUIRED=true;
const LOCAL_OWNER_KEY="gymos:localDataOwnerId";
const LOCAL_VAULT_PREFIX="gymos:userVault:";
let exerciseLibrarySearchDebounceTimer=null;
let exerciseLibrarySearchDebounceVersion=0;
const AUTH_CONFIGURED=()=>Boolean(getSyncConfig().url&&getSyncConfig().key);

function ensureProfileDataMigration(options={}){
  if(!window.GymOSProfileData) throw new Error("El modelo de perfil no está disponible.");
  const ownerId=options.ownerId||localStorage.getItem(LOCAL_OWNER_KEY)||(!AUTH_REQUIRED?"local":null);
  if(!ownerId) throw new Error("No se puede migrar sin determinar primero el propietario de los datos.");
  return window.GymOSProfileData.migrateDataModel({...options,ownerId});
}
function ensureLegacyTrainingSetupMigration(options={}){
  if(!window.GymOSProfileData) throw new Error("El modelo de perfil no está disponible.");
  const ownerId=options.ownerId||localStorage.getItem(LOCAL_OWNER_KEY)||(!AUTH_REQUIRED?"local":null);
  if(!ownerId) throw new Error("No se puede adaptar el perfil sin determinar primero el propietario.");
  return window.GymOSProfileData.migrateLegacyTrainingSetup({
    ...options,
    ownerId,
    legacyProfile:options.legacyProfile||getOnboardingProfile()
  });
}
function sessionModelMigrationBackupKey(ownerId){
  if(!window.GymOSProfileData) throw new Error("El modelo de perfil no está disponible.");
  return window.GymOSProfileData.sessionModelMigrationBackupKey(ownerId);
}
function readStoredJson(key){
  const raw=localStorage.getItem(key);
  if(raw===null) return null;
  try{return JSON.parse(raw);}
  catch(_){return null;}
}
function getCanonicalDrafts(){
  const value=readStoredJson(CANONICAL_DRAFTS_KEY);
  return value&&typeof value==="object"?value:null;
}
function writeLegacyDraftShadows(canonicalRoutine,container){
  ["A","B","C"].forEach(key=>{
    const session=canonicalRoutine?.sessions?.find(item=>item.legacySessionKey===key);
    const draft=session?container?.draftsBySessionId?.[session.sessionId]:null;
    if(draft) localStorage.setItem(
      draftKey(key),
      compactWorkoutDraftShadow(draft,key)
    );
    else localStorage.removeItem(draftKey(key));
  });
}
function selectedSessionIdForLegacy(
  legacySession,canonical=getCanonicalRoutine(),{preserveCurrent=false}={}
){
  if(!canonical) return null;
  return routineSessionMigrationApi().selectedSessionId(
    canonical,legacySession,preserveCurrent?localStorage.getItem(SELECTED_SESSION_ID_KEY):null
  );
}
function persistSelectedRoutineSession(candidate,{mark=false}={}){
  const canonical=getCanonicalRoutine();
  if(canonical){
    const byId=routineSessionRuntimeApi().sessionById(canonical,candidate);
    const byLegacy=routineSessionRuntimeApi().sessionByLegacyKey(canonical,candidate);
    const current=routineSessionRuntimeApi().sessionById(
      canonical,localStorage.getItem(SELECTED_SESSION_ID_KEY)
    );
    const session=byId||byLegacy||current||routineSessionRuntimeApi().orderedSessions(canonical)[0];
    const id=session?.sessionId||null;
    if(id) localStorage.setItem(SELECTED_SESSION_ID_KEY,id);
    else localStorage.removeItem(SELECTED_SESSION_ID_KEY);
    if(session?.legacySessionKey) localStorage.setItem("gymos:selectedSession",session.legacySessionKey);
    else localStorage.removeItem("gymos:selectedSession");
    if(typeof state!=="undefined"){
      state.selectedSession=session?.legacySessionKey||session?.label||"A";
      state.selectedSessionId=id;
    }
    if(mark) markLocalUpdated();
    return {selectedSession:session?.legacySessionKey||null,selectedSessionId:id};
  }
  const selected=validSelectedRoutineSession(candidate);
  localStorage.setItem("gymos:selectedSession",selected);
  if(typeof state!=="undefined"){
    state.selectedSession=selected;
    state.selectedSessionId=null;
  }
  if(mark) markLocalUpdated();
  return {selectedSession:selected,selectedSessionId:null};
}
function ensureRoutineSessionMigration(options={}){
  if(!window.GymOSRoutineSessionModel||!window.GymOSRoutineSessionMigration){
    throw new Error("El modelo canónico de sesiones no está disponible.");
  }
  const requested=options.ownerId||localStorage.getItem(LOCAL_OWNER_KEY)||(!AUTH_REQUIRED?"local":null);
  const ownerId=window.GymOSProfileData.normalizeOwnerId(requested);
  if(localStorage.getItem(LOCAL_OWNER_KEY)!==ownerId&&ownerId!=="local"){
    throw new Error("owner_not_active");
  }
  const api=routineSessionMigrationApi();
  const canonicalRaw=localStorage.getItem(CANONICAL_ROUTINE_KEY);
  const canonical=canonicalRaw===null?null:readStoredJson(CANONICAL_ROUTINE_KEY);
  if(canonicalRaw!==null&&!canonical) throw new Error("invalid_existing_canonical");
  const canonicalDraftsRaw=localStorage.getItem(CANONICAL_DRAFTS_KEY);
  const canonicalDrafts=canonicalDraftsRaw===null?null:readStoredJson(CANONICAL_DRAFTS_KEY);
  if(canonicalDraftsRaw!==null&&!canonicalDrafts) throw new Error("invalid_existing_canonical_drafts");
  const metadata=readStoredJson(SESSION_MODEL_MIGRATION_KEY);
  const legacyRoutineRaw=localStorage.getItem("gymos:routine");
  const legacyRoutine=legacyRoutineRaw===null
    ?normalizeRoutine(defaultSessions)
    :readStoredJson("gymos:routine");
  if(!legacyRoutine) throw new Error("invalid_legacy_routine");
  const legacyDraftsRaw=Object.fromEntries(["A","B","C"].map(key=>[
    key,localStorage.getItem(draftKey(key))
  ]));
  const sessionIds={},draftIds={};
  let routineId=null;
  if(canonicalRaw===null){
    if(localStorage.getItem(SESSION_MODEL_MIGRATION_KEY)!==null){
      throw new Error("incomplete_migration_marker");
    }
    routineId=secureSessionModelId("routine");
    ["A","B","C"].forEach(key=>{
      if(Array.isArray(legacyRoutine[key])&&legacyRoutine[key].length){
        sessionIds[key]=secureSessionModelId("session");
      }
      if(legacyDraftsRaw[key]!==null) draftIds[key]=secureSessionModelId("draft");
    });
  }else{
    ["A","B","C"].forEach(key=>{
      if(legacyDraftsRaw[key]===null) return;
      const session=canonical?.sessions?.find(item=>item.legacySessionKey===key);
      const hasCanonicalDraft=Boolean(
        session&&canonicalDrafts?.draftsBySessionId?.[session.sessionId]
      );
      const hasOrphan=Boolean(canonicalDrafts?.orphanedLegacyDrafts?.[key]);
      if(!hasCanonicalDraft&&!hasOrphan) draftIds[key]=secureSessionModelId("draft");
    });
  }
  const plan=api.createMigrationPlan({
    ownerId,legacyRoutine,canonicalRoutine:canonical,canonicalDrafts,
    legacyDraftsRaw,
    legacySelection:localStorage.getItem("gymos:selectedSession")||"A",
    selectedSessionId:localStorage.getItem(SELECTED_SESSION_ID_KEY),
    migrationMetadata:metadata,routineId,sessionIds,draftIds,
    migrationVersion:api.MIGRATION_VERSION,
    timestamp:options.timestamp||new Date().toISOString()
  });
  if(!plan.ok){
    const error=new Error(plan.message);
    error.code=plan.code;
    throw error;
  }
  if(!plan.changed) return {migrated:false,ownerId,plan};
  const validation=api.validateMigrationPlan(plan,{ownerId});
  if(!validation.valid) throw new Error(`invalid_session_migration:${validation.errors.join(",")}`);
  const backupKey=window.GymOSProfileData.migrateSessionModelMigrationBackup(ownerId);
  const affected=[
    CANONICAL_ROUTINE_KEY,CANONICAL_DRAFTS_KEY,SELECTED_SESSION_ID_KEY,
    SESSION_MODEL_MIGRATION_KEY,"gymos:routine","gymos:selectedSession",
    draftKey("A"),draftKey("B"),draftKey("C"),
    ROUTINE_ACTIVATION_HISTORY_KEY,ACTIVE_ROUTINE_ACTIVATION_ID_KEY,
    "gymos:history",
    "gymos:updatedAt","gymos:localUpdatedAt","gymos:syncPending","gymos:localRevision",
    `${LOCAL_VAULT_PREFIX}${ownerId}`
  ];
  const expectedRaw=Object.fromEntries(affected.map(key=>[key,localStorage.getItem(key)]));
  const rawState=Object.fromEntries(affected.map(key=>[key,localStorage.getItem(key)]));
  const snapshot=api.captureRawSnapshot(rawState,affected);
  const historyBefore=localStorage.getItem("gymos:history");
  const functionalWrites=api.buildMigrationWrites(plan);
  let writes=functionalWrites;
  let createdBackupRaw=null;
  if(localStorage.getItem(backupKey)===null){
    createdBackupRaw=JSON.stringify({
      format:"gymos-h2-pre-migration-v1",
      migrationVersion:api.MIGRATION_VERSION,
      snapshot
    });
    writes={
      [backupKey]:createdBackupRaw,
      ...functionalWrites
    };
    expectedRaw[backupKey]=null;
  }
  const transaction=api.executeRawTransaction({
    ownerId,expectedRaw,writes,failAt:options.failAt,
    adapter:{
      getRaw:key=>localStorage.getItem(key),
      setRaw:(key,value)=>localStorage.setItem(key,value),
      remove:key=>localStorage.removeItem(key),
      currentOwner:()=>localStorage.getItem(LOCAL_OWNER_KEY)||(!AUTH_REQUIRED?"local":null)
    }
  });
  if(!transaction.ok){
    if(createdBackupRaw!==null){
      try{localStorage.setItem(backupKey,createdBackupRaw);}
      catch(_){}
    }
    const error=new Error(transaction.message);
    error.code=transaction.code;
    error.details=transaction;
    throw error;
  }
  if(localStorage.getItem("gymos:history")!==historyBefore){
    Object.entries(transaction.before).forEach(([key,raw])=>restoreStorageValue(key,raw));
    throw new Error("history_changed");
  }
  const storedPlan=api.createMigrationPlan({
    ownerId,
    legacyRoutine:readStoredJson("gymos:routine"),
    canonicalRoutine:readStoredJson(CANONICAL_ROUTINE_KEY),
    canonicalDrafts:readStoredJson(CANONICAL_DRAFTS_KEY),
    legacyDraftsRaw:Object.fromEntries(["A","B","C"].map(key=>[
      key,localStorage.getItem(draftKey(key))
    ])),
    legacySelection:localStorage.getItem("gymos:selectedSession"),
    selectedSessionId:localStorage.getItem(SELECTED_SESSION_ID_KEY),
    migrationMetadata:readStoredJson(SESSION_MODEL_MIGRATION_KEY),
    migrationVersion:api.MIGRATION_VERSION
  });
  if(!storedPlan.ok||storedPlan.changed){
    Object.entries(transaction.before).forEach(([key,raw])=>{
      if(key!==backupKey) restoreStorageValue(key,raw);
    });
    throw new Error("session_migration_post_validation_failed");
  }
  try{
    if(window.GymOSProfileData.normalizeOwnerId(
      localStorage.getItem(LOCAL_OWNER_KEY)||(!AUTH_REQUIRED?"local":null)
    )!==ownerId) throw new Error("owner_changed");
    if(options.mark!==false) markLocalUpdated();
    if(window.GymOSProfileData.normalizeOwnerId(
      localStorage.getItem(LOCAL_OWNER_KEY)||(!AUTH_REQUIRED?"local":null)
    )!==ownerId) throw new Error("owner_changed");
    if(typeof state!=="undefined"){
      state.selectedSession=plan.legacySelectedSession;
      state.selectedSessionId=plan.selectedSessionId;
    }
  }catch(error){
    Object.entries(transaction.before).forEach(([key,raw])=>{
      if(key!==backupKey) restoreStorageValue(key,raw);
    });
    throw error;
  }
  return {migrated:true,ownerId,plan};
}

function exerciseDomainMigrationBackupKey(ownerId){
  if(!window.GymOSProfileData) throw new Error("El modelo de perfil no esta disponible.");
  return `${EXERCISE_DOMAIN_MIGRATION_BACKUP_PREFIX}${window.GymOSProfileData.normalizeOwnerId(ownerId)}`;
}

function restoreStorageValue(key,value){
  if(value===null) localStorage.removeItem(key);
  else localStorage.setItem(key,value);
}

function ensureExerciseDomainMigration(options={}){
  if(!window.GymOSExerciseDomain) throw new Error("El dominio de ejercicios no esta disponible.");
  if(!window.GymOSProfileData) throw new Error("El modelo de perfil no esta disponible.");
  const requestedOwnerId=options.ownerId||localStorage.getItem(LOCAL_OWNER_KEY)||(!AUTH_REQUIRED?"local":null);
  const ownerId=window.GymOSProfileData.normalizeOwnerId(requestedOwnerId);
  const targetVersion=window.GymOSExerciseDomain.DOMAIN_VERSION;
  if(!options.force&&localStorage.getItem(EXERCISE_DOMAIN_SCHEMA_KEY)===targetVersion){
    return {migrated:false,ownerId,version:targetVersion};
  }

  const backupKey=exerciseDomainMigrationBackupKey(ownerId);
  const previous={
    library:localStorage.getItem(EXERCISE_LIBRARY_KEY),
    profile:localStorage.getItem("gymos:userProfile"),
    schemaVersion:localStorage.getItem(EXERCISE_DOMAIN_SCHEMA_KEY),
    backup:localStorage.getItem(backupKey)
  };
  const protectedData={
    routine:localStorage.getItem("gymos:routine"),
    history:localStorage.getItem("gymos:history")
  };
  const timestamp=new Date().toISOString();

  try{
    let legacyLibrary=null;
    try{
      legacyLibrary=JSON.parse(previous.library||"null");
    }catch(error){}
    const builtInLibrary=defaultExerciseLibrary();
    if(!Array.isArray(legacyLibrary)||!legacyLibrary.length){
      legacyLibrary=builtInLibrary;
    }else{
      legacyLibrary=window.GymOSExerciseDomain.mergeExerciseLibraries(
        legacyLibrary,builtInLibrary,{timestamp}
      ).library;
    }
    const plan=window.GymOSExerciseDomain.buildExerciseDomainMigration({
      exerciseLibrary:legacyLibrary,
      userProfile:window.GymOSProfileData.getUserProfile(),
      timestamp
    });
    const invalid=plan.validation.filter(result=>!result.valid);
    if(invalid.length) throw new Error(`La biblioteca contiene ${invalid.length} ejercicios no validos.`);

    if(previous.backup===null){
      localStorage.setItem(backupKey,JSON.stringify({
        ownerId,
        fromVersion:previous.schemaVersion,
        toVersion:targetVersion,
        createdAt:timestamp,
        storage:{
          [EXERCISE_LIBRARY_KEY]:previous.library,
          "gymos:userProfile":previous.profile
        }
      }));
    }
    localStorage.setItem(EXERCISE_LIBRARY_KEY,JSON.stringify(plan.exerciseLibrary));
    if(plan.userProfile){
      window.GymOSProfileData.saveUserProfile(plan.userProfile,{mark:false});
    }
    localStorage.setItem(EXERCISE_DOMAIN_SCHEMA_KEY,targetVersion);

    if(
      localStorage.getItem("gymos:routine")!==protectedData.routine||
      localStorage.getItem("gymos:history")!==protectedData.history
    ){
      throw new Error("La migracion intento modificar la rutina o el historial.");
    }
    if(options.mark) markLocalUpdated();
    return {
      migrated:true,
      ownerId,
      version:targetVersion,
      exerciseCount:plan.exerciseLibrary.length
    };
  }catch(error){
    restoreStorageValue(EXERCISE_LIBRARY_KEY,previous.library);
    restoreStorageValue("gymos:userProfile",previous.profile);
    restoreStorageValue(EXERCISE_DOMAIN_SCHEMA_KEY,previous.schemaVersion);
    restoreStorageValue(backupKey,previous.backup);
    throw error;
  }
}

function localDataKeys(){
  const draftKeys=["A","B","C"].map(session=>draftKey(session));
  const additional=[
    "gymos:body","gymos:selectedSession","gymos:restSeconds","gymos:weeklyGoal",
    "gymos:localUpdatedAt","gymos:lastSyncAt","gymos:lastSyncHash"
  ];
  return [...new Set([...GYMOS_BACKUP_KEYS,...draftKeys,...additional])];
}

function snapshotCurrentLocalData(ownerId=currentRoutineOwnerOrNull()){
  const snapshot={};
  localDataKeys().forEach(key=>{
    const value=localStorage.getItem(key);
    if(value!==null){
      snapshot[key]=sanitizeWorkoutStorageValue(key,value,{ownerId});
    }
  });
  return snapshot;
}

function clearCurrentUserData(){
  localDataKeys().forEach(key=>localStorage.removeItem(key));
}

function saveCurrentUserVault(userId){
  if(!userId) return false;
  const key=`${LOCAL_VAULT_PREFIX}${userId}`;
  const raw=JSON.stringify(snapshotCurrentLocalData(userId));
  if(localStorage.getItem(key)===raw) return false;
  localStorage.setItem(key,raw);
  return true;
}

function loadUserVault(userId){
  clearCurrentUserData();
  if(!userId) return;
  try{
    const snapshot=JSON.parse(localStorage.getItem(`${LOCAL_VAULT_PREFIX}${userId}`)||"{}");
    Object.entries(snapshot).forEach(([key,value])=>localStorage.setItem(
      key,sanitizeWorkoutStorageValue(key,value,{ownerId:userId})
    ));
  }catch(error){
    console.error("Could not load local user vault",error);
  }
}

function resetExerciseLibraryOwnerState(){
  if(typeof state==="undefined") return;
  cancelExerciseLibrarySearchDebounce();
  const clean=window.GymOSExerciseLibraryWorkflow?.clearOwnerUiState?.()||{};
  state.exerciseLibraryFilters=clean.filters||null;
  state.selectedLibraryExerciseId=null;
  state.editingLibraryExerciseId=null;
  state.exerciseLibraryDeleteCandidate=null;
  state.exerciseLibraryMessage=null;
  state.exerciseLibraryBusy=null;
  state.exerciseLibraryAdvancedOpen=false;
  state.exerciseLibraryEditBaseline=null;
  state.exerciseLibraryFormDraft=null;
  state.exerciseLibrarySearchRefocus=false;
  state.exerciseSubstitution=null;
}
function resetRoutineSessionOwnerState(){
  if(typeof state==="undefined") return;
  flushWorkoutDraftProgress({scheduleSync:false,silent:true});
  clearTimeout(state.workoutDraftAutosaveTimer);
  state.workoutDraftAutosaveTimer=null;
  state.workoutDraftMemory=null;
  state.workoutDraftSaveStatus="saved_local";
  state.workoutDraftLastError=null;
  state.workoutStorageDiagnostic=null;
  state.workoutQuotaRecoveryInProgress=false;
  state.workoutInlineMessage=null;
  state.workoutDraftOperationId=(state.workoutDraftOperationId||0)+1;
  state.workoutLastDiscardedOperation=null;
  stopWorkoutSessionTimer();
  stopAllExerciseTimers();
  routineImportReadSequence+=1;
  state.selectedSession=null;
  state.selectedSessionId=null;
  state.editingSession=null;
  state.finishingWorkout=false;
  state.completedWorkoutSummary=null;
  state.expandedHistoryId=null;
  state.editWorkoutId=null;
  state.routineWorkflow=null;
  window.GymOSRoutineHub?.reset?.();
  state.routineImport=null;
  state.routineFileChooser=null;
  state.routineFileBusy=null;
  state.coachSessionId=null;
  state.workoutDraftMessage=null;
  state.workoutDraftObservedIds=new Set();
  state.workoutExerciseIndex=0;
  state.workoutActiveInstanceId=null;
  state.workoutSessionOverviewOpen=false;
  state.workoutTechniqueExpanded=false;
  state.workoutChangeMenuOpen=false;
  state.workoutReferenceExerciseId=null;
  state.workoutActionExerciseId=null;
  state.workoutExpandedExercises=new Set();
  state.workoutExpandedDetailPanels=new Set();
  state.workoutDirtyDetailPanels=new Set();
  state.workoutCompletionReviewOpen=false;
  state.workoutDiscardConfirmOpen=false;
  state.workoutSeriesDeleteCandidate=null;
  state.workoutInlineMessage=null;
  state.workoutVisualLibrarySelections=new Map();
  state.workoutUnresolvedDismissed=new Set();
  state.workoutLibraryCandidateKey=null;
  state.workoutDiscardMenuOpen=false;
  state.workoutReturnFocusSelector=null;
  state.workoutMobileUi=window.GymOSActiveWorkout?.reduceMobileWorkoutUi?.({},{} )||{};
  state.workoutDeferredRender=false;
  document.body.classList.remove("mobile-workout-sheet-open");
  sessions=[];
  clearActiveRestTimer({removePersisted:true});
  state.workoutRestAnnouncement=null;
  state.restPreferenceBusy=false;
  clearTimeout(state.syncTimer);
  state.syncTimer=null;
  state.syncOperationId+=1;
  state.syncInProgress=false;
  state.syncIssue=null;
  state.syncStatus=navigator.onLine?"local":"offline";
  state.completedWorkoutSummary=null;
  state.workoutAnalysisId=null;
  state.coachChatMessages=[];
  state.nutritionPreview=null;
  state.nutritionRecipeSuggestions=[];
  state.professionalNutritionDraft=null;
  state.professionalNutritionPlanId=null;
  state.professionalNutritionMealId=null;
  state.quickActionsDraft=null;
  state.quickActionsEditorMessage=null;
  state.bodySummaryDraft=null;
  state.bodySummaryReturnFocus=null;
  state.bodyFormMessage=null;
  state.recoveryView="overview";
  state.recoveryDraft=null;
  state.recoveryResultDate=null;
  state.recoveryCheckinId=null;
  state.recoveryMessage=null;
  state.recoveryQuestionnaireError=null;
  state.recoveryBusy=false;
  state.recoveryOperationId=(state.recoveryOperationId||0)+1;
  state.accountProfile=null;
  state.accountProfileUserId=null;
  state.accountIdentityDirty=false;
  state.accountPasswordMessage=null;
  state.accountManagementMessage=null;
  state.onboardingDraft=null;
  state.onboardingMessage=null;
  closeShellPopover({restoreFocus:false,renderShell:false});
  closeNavigationPanel({restoreFocus:false});
}
function assertActiveLocalOwner(ownerId){
  const expected=window.GymOSProfileData.normalizeOwnerId(ownerId);
  const current=window.GymOSProfileData.normalizeOwnerId(
    localStorage.getItem(LOCAL_OWNER_KEY)||(!AUTH_REQUIRED?"local":null)
  );
  if(current!==expected) throw new Error("owner_changed");
  return expected;
}
function captureRoutineSessionStartupStorage(ownerId){
  const keys=[...new Set([
    ...localDataKeys(),
    "gymos:updatedAt","gymos:localUpdatedAt","gymos:syncPending",
    "gymos:localRevision",`${LOCAL_VAULT_PREFIX}${ownerId}`
  ])];
  return Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)]));
}
function restoreRoutineSessionStartupStorage(snapshot,ownerId){
  const internalKeys=new Set(window.GymOSProfileData.migrationInternalKeys(ownerId));
  Object.entries(snapshot).forEach(([key,raw])=>{
    if(!internalKeys.has(key)) restoreStorageValue(key,raw);
  });
}
function finishLocalUserActivation(userId){
  const ownerId=assertActiveLocalOwner(userId);
  const before=captureRoutineSessionStartupStorage(ownerId);
  let migration;
  try{
    const legacyInflationRepair=repairInflatedLegacyWorkoutStorage({ownerId});
    assertActiveLocalOwner(ownerId);
    migration=ensureRoutineSessionMigration({ownerId,mark:false});
    assertActiveLocalOwner(ownerId);
    const progressMigration=legacyInflationRepair.completed
      ?ensureWorkoutProgressMigration({ownerId,mark:false})
      :{migrated:false,ownerId,records:legacyInflationRepair.records,rejected:[
        {code:"legacy_inflation_repair_pending"}
      ]};
    assertActiveLocalOwner(ownerId);
    ensureProfileDataMigration({ownerId,mark:false});
    assertActiveLocalOwner(ownerId);
    ensureLegacyTrainingSetupMigration({ownerId,mark:false});
    assertActiveLocalOwner(ownerId);
    ensureExerciseDomainMigration({ownerId,mark:false});
    assertActiveLocalOwner(ownerId);
    ensureExerciseLibraryWorkflowMigration();
    assertActiveLocalOwner(ownerId);
    ensureRoutineProposalState(ownerId);
    assertActiveLocalOwner(ownerId);
    ensureRoutineActivationState(ownerId);
    assertActiveLocalOwner(ownerId);
    sanitizeStoredSyncAudit();
    assertActiveLocalOwner(ownerId);
    if(migration.migrated||progressMigration.migrated) markLocalUpdated({schedule:false});
    assertActiveLocalOwner(ownerId);
    saveCurrentUserVault(ownerId);
    assertActiveLocalOwner(ownerId);
    sessions=getRoutine();
    persistSelectedRoutineSession(
      localStorage.getItem(SELECTED_SESSION_ID_KEY)||
      localStorage.getItem("gymos:selectedSession")||
      nextSuggestedSession()
    );
    if(migration.migrated||progressMigration.migrated) scheduleAutoSync();
    return {
      ...migration,
      workoutProgressMigration:progressMigration,
      legacyInflationRepair
    };
  }catch(error){
    clearTimeout(state.syncTimer);
    state.syncTimer=null;
    restoreRoutineSessionStartupStorage(before,ownerId);
    throw error;
  }
}

function activateLocalUser(userId){
  if(!userId) return;
  const previous=localStorage.getItem(LOCAL_OWNER_KEY);
  if(previous===userId){
    return finishLocalUserActivation(userId);
  }

  if(previous){
    flushWorkoutDraftProgress({scheduleSync:false,silent:true});
    saveCurrentUserVault(previous);
    loadUserVault(userId);
  }else{
    const hasExisting=hasLocalUserData();
    if(hasExisting){
      localStorage.setItem(`${LOCAL_VAULT_PREFIX}${userId}`,JSON.stringify(snapshotCurrentLocalData(userId)));
    }else{
      loadUserVault(userId);
    }
  }
  localStorage.setItem(LOCAL_OWNER_KEY,userId);
  resetExerciseLibraryOwnerState();
  resetRoutineSessionOwnerState();
  if(typeof invalidateRecoveryDerivedState==="function"){
    invalidateRecoveryDerivedState({reason:"owner_changed",renderCurrent:false});
  }
  return finishLocalUserActivation(userId);
}

function deactivateLocalUser(){
  const current=localStorage.getItem(LOCAL_OWNER_KEY);
  if(current){
    flushWorkoutDraftProgress({scheduleSync:false,silent:true});
    saveCurrentUserVault(current);
  }
  clearCurrentUserData();
  localStorage.removeItem(LOCAL_OWNER_KEY);
  resetExerciseLibraryOwnerState();
  resetRoutineSessionOwnerState();
}

function removeOwnerRecoveryReminderData(ownerId){
  const prefix=`gymos:recovery-reminder:${ownerId}:`;
  const keys=[];
  for(let index=0;index<localStorage.length;index+=1){
    const key=localStorage.key(index);
    if(key?.startsWith(prefix)) keys.push(key);
  }
  keys.forEach(key=>localStorage.removeItem(key));
}
function deleteOwnerLocalData(ownerId,{removeOwner=false}={}){
  if(!window.GymOSProfileData) throw new Error("El modelo de perfil no está disponible.");
  const normalizedOwnerId=window.GymOSProfileData.normalizeOwnerId(ownerId);
  const current=localStorage.getItem(LOCAL_OWNER_KEY);
  if(current===normalizedOwnerId) clearCurrentUserData();
  localStorage.removeItem(`${LOCAL_VAULT_PREFIX}${normalizedOwnerId}`);
  window.GymOSProfileData.removeMigrationInternalData(normalizedOwnerId);
  localStorage.removeItem(exerciseDomainMigrationBackupKey(normalizedOwnerId));
  removeOwnerRecoveryReminderData(normalizedOwnerId);
  removeOwnerWorkoutProgressData(normalizedOwnerId);
  removeOwnerRestTimerData(normalizedOwnerId);
  if(removeOwner&&current===normalizedOwnerId) localStorage.removeItem(LOCAL_OWNER_KEY);
}

function renderAuthConfigurationRequired(){
  app.innerHTML=`<div class="auth-gate-shell">
    <main class="auth-gate-card">
      <div class="auth-logo">G</div>
      <span class="section-kicker">CONFIGURACIÓN NECESARIA</span>
      <h1>Activa el acceso privado</h1>
      <p>GymOS necesita la URL y la clave pública de tu proyecto Supabase antes de permitir cuentas.</p>
      <div class="security-check-list">
        <article class="ok"><span>1</span><div><strong>Crea un proyecto Supabase</strong><small>Puede ser el plan gratuito.</small></div></article>
        <article class="ok"><span>2</span><div><strong>Edita auth-config.js</strong><small>Pega Project URL y anon public key.</small></div></article>
        <article class="ok"><span>3</span><div><strong>Ejecuta database/supabase/schema.sql</strong><small>Activa tablas y políticas por usuario.</small></div></article>
      </div>
      <p class="auth-config-note">No pongas nunca la clave <code>service_role</code> en GitHub Pages.</p>
    </main>
  </div>`;
}

function renderAuthLoading(){
  app.innerHTML=`<div class="auth-gate-shell">
    <main class="auth-gate-card auth-loading-card" aria-live="polite">
      <div class="auth-logo">G</div>
      <p>Comprobando tu acceso…</p>
    </main>
  </div>`;
}

function hasPasswordRecoveryUrl(){
  const searchParams=new URLSearchParams(location.search);
  const hashParams=new URLSearchParams(location.hash.replace(/^#/,""));
  return searchParams.get("type")==="recovery"||hashParams.get("type")==="recovery";
}

function hasAuthCallbackUrl(){
  return new URLSearchParams(location.search).has("code");
}

function friendlyAuthError(error,fallback="No se pudo completar la operación."){
  const message=String(error?.message||"");
  const normalized=message.toLowerCase();
  if(normalized.includes("invalid login credentials")){
    return "El correo o la contraseña no son correctos.";
  }
  if(normalized.includes("email rate limit exceeded")){
    return "Has solicitado demasiados correos. Espera antes de volver a intentarlo.";
  }
  return message||fallback;
}

function showAccountMessage(type,text){
  state.accountMessage={type,text};
  const element=document.getElementById("accountMessage");
  if(!element) return;
  element.className=`verification-message ${type}`;
  element.setAttribute("role",type==="error"?"alert":"status");
  element.textContent=text;
  element.hidden=false;
}

function showAccountManagementMessage(type,text){
  state.accountManagementMessage={type,text};
  const element=document.getElementById("accountManagementMessage");
  if(!element) return;
  element.className=`verification-message ${type}`;
  element.setAttribute("role",type==="error"?"alert":"status");
  element.textContent=text;
  element.hidden=false;
}

function renderPasswordRecoveryGate(){
  const message=state.passwordRecoveryMessage;
  const sessionReady=Boolean(state.syncSession);
  app.innerHTML=`<div class="auth-gate-shell">
    <main class="auth-gate-card password-recovery-card">
      <div class="auth-logo" aria-hidden="true">G</div>
      <span class="section-kicker">RECUPERACIÓN DE CUENTA</span>
      <h1>Crea una nueva contraseña</h1>
      <p>Elige una contraseña nueva para tu cuenta de GymOS.</p>
      <label><span>Nueva contraseña</span><input id="newPassword" type="password" autocomplete="new-password" minlength="8" ${sessionReady?"":"disabled"}></label>
      <label><span>Confirmar contraseña</span><input id="confirmNewPassword" type="password" autocomplete="new-password" minlength="8" ${sessionReady?"":"disabled"}></label>
      <div id="passwordRecoveryMessage" class="verification-message ${message?.type||""}" role="${message?.type==="error"?"alert":"status"}" ${message?"":"hidden"}>${message?esc(message.text):""}</div>
      <button type="button" id="saveNewPassword" class="primary full" ${sessionReady?"":"disabled"}>${sessionReady?"Guardar nueva contraseña":"Preparando recuperación…"}</button>
    </main>
  </div>`;

  document.getElementById("saveNewPassword").onclick=async event=>{
    const password=document.getElementById("newPassword").value;
    const confirmation=document.getElementById("confirmNewPassword").value;
    const messageElement=document.getElementById("passwordRecoveryMessage");
    const showMessage=(type,text)=>{
      state.passwordRecoveryMessage={type,text};
      messageElement.className=`verification-message ${type}`;
      messageElement.setAttribute("role",type==="error"?"alert":"status");
      messageElement.textContent=text;
      messageElement.hidden=false;
    };
    if(password.length<8){
      showMessage("error","La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if(password!==confirmation){
      showMessage("error","Las contraseñas no coinciden.");
      return;
    }

    const button=event.currentTarget;
    button.disabled=true;
    button.textContent="Guardando…";
    try{
      const client=getSupabaseClient();
      if(!client||!state.syncSession) throw new Error("La sesión de recuperación no está disponible. Vuelve a abrir el enlace del correo.");
      const {error}=await client.auth.updateUser({password});
      if(error) throw error;

      showMessage("success","Contraseña actualizada correctamente. Cerrando la sesión de recuperación…");
      button.textContent="Contraseña guardada";
      state.accountMessage={type:"success",text:"Contraseña actualizada correctamente. Inicia sesión con tu nueva contraseña."};
      await client.auth.signOut();
      state.passwordRecoveryMode=false;
      state.passwordRecoveryMessage=null;
      resolveAuthenticatedAppState(null);
      history.replaceState({},document.title,GYMOS_PRODUCTION_URL);
      state.accountMode="login";
      state.screen="account";
      render();
    }catch(error){
      showMessage("error",friendlyAuthError(error,"No se pudo guardar la nueva contraseña."));
      button.disabled=false;
      button.textContent="Guardar nueva contraseña";
    }
  };
}

function renderEmailVerificationGate(user=state.syncUser){
  const message=state.emailVerificationMessage;
  app.innerHTML=`<div class="auth-gate-shell">
    <main class="auth-gate-card email-verification-card">
      <div class="auth-logo" aria-hidden="true">✉</div>
      <span class="section-kicker">VERIFICACIÓN NECESARIA</span>
      <h1>Confirma tu correo</h1>
      <p>Hemos enviado un enlace de confirmación a tu correo. Ábrelo para activar tu cuenta y acceder a GymOS.</p>
      ${user?.email?`<div class="verification-email">${esc(user.email)}</div>`:""}
      ${message?`<div class="verification-message ${message.type}" role="${message.type==="error"?"alert":"status"}">${esc(message.text)}</div>`:""}
      <div class="verification-actions">
        <button type="button" id="resendConfirmation" class="primary full">Reenviar correo de confirmación</button>
        <button type="button" id="checkConfirmation" class="secondary full">Ya lo he confirmado</button>
        <button type="button" id="verificationSignOut" class="text-button full">Cerrar sesión</button>
      </div>
    </main>
  </div>`;

  document.getElementById("resendConfirmation").onclick=async event=>{
    const button=event.currentTarget;
    button.disabled=true;
    button.textContent="Reenviando…";
    try{
      await resendEmailConfirmation(user?.email);
      state.emailVerificationMessage={type:"success",text:"Correo de confirmación reenviado. Revisa también la carpeta de spam."};
    }catch(error){
      state.emailVerificationMessage={
        type:"error",
        text:friendlyAuthError(error,"No se pudo reenviar el correo de confirmación.")
      };
    }
    renderEmailVerificationGate(state.syncUser);
  };
  document.getElementById("checkConfirmation").onclick=async event=>{
    const button=event.currentTarget;
    button.disabled=true;
    button.textContent="Comprobando…";
    try{
      const accessState=await refreshEmailConfirmation();
      if(accessState==="authenticated"){
        state.emailVerificationMessage=null;
        state.screen="home";
        render();
        setTimeout(()=>autoSync("correo confirmado"),500);
        return;
      }
      state.emailVerificationMessage={type:"error",text:"El correo todavía no aparece como confirmado. Abre el enlace recibido y vuelve a intentarlo."};
    }catch(error){
      state.emailVerificationMessage={type:"error",text:error?.message||"No se pudo comprobar la confirmación."};
    }
    renderEmailVerificationGate(state.syncUser||user);
  };
  document.getElementById("verificationSignOut").onclick=async event=>{
    const button=event.currentTarget;
    button.disabled=true;
    try{
      await signOutSync();
    }catch(error){
      console.error("GymOS sign out",{
        code:error?.code||"signout_failed",
        status:error?.status||null
      });
    }
    deactivateLocalUser();
    state.emailVerificationMessage=null;
    state.accountMode="login";
    state.screen="account";
    render();
  };
}

let state = {
  screen: "home",
  selectedSession: localStorage.getItem("gymos:selectedSession") || nextSuggestedSession(),
  selectedSessionId: localStorage.getItem(SELECTED_SESSION_ID_KEY),
  timerSeconds: 0,
  timerInterval: null,
  timerDeadline: null,
  restTimerPayload: null,
  restTimerGeneration: 0,
  restTimerPersistenceFailed: false,
  restOverlayOpen: false,
  workoutRestAnnouncement: null,
  workoutSessionTimer: null,
  workoutSessionTimerInterval: null,
  workoutExerciseIndex: 0,
  workoutSessionOverviewOpen: false,
  workoutTechniqueExpanded: false,
  workoutChangeMenuOpen: false,
  workoutReferenceExerciseId: null,
  workoutActionExerciseId: null,
  workoutExpandedExercises: new Set(),
  workoutExpandedDetailPanels: new Set(),
  workoutDirtyDetailPanels: new Set(),
  workoutCompletionReviewOpen: false,
  workoutDiscardConfirmOpen: false,
  workoutSeriesDeleteCandidate: null,
  workoutInlineMessage: null,
  workoutVisualLibrarySelections: new Map(),
  workoutUnresolvedDismissed: new Set(),
  workoutLibraryCandidateKey: null,
  workoutDiscardMenuOpen: false,
  workoutReturnFocusSelector: null,
  workoutMobileUi: {
    panel:null,selectedSetInstanceId:null,
    completedExpanded:false,futureExpanded:false,restMinimized:false
  },
  workoutDeferredRender: false,
  workoutSetBusyKey: null,
  workoutDraftMemory: null,
  workoutDraftAutosaveTimer: null,
  workoutDraftSaveStatus: "saved_local",
  workoutDraftLastError: null,
  workoutStorageDiagnostic: null,
  workoutQuotaRecoveryInProgress: false,
  workoutDraftOperationId: 0,
  workoutLastDiscardedOperation: null,
  workoutActiveInstanceId: null,
  restPreferenceBusy: false,
  expandedHistoryId: null,
  selectedStatsExercise: null,
  selectedRecordExercise: null,
  editWorkoutId: null,
  planMonth: new Date().toISOString().slice(0,7),
  authResolved: false,
  authRedirectInProgress: hasAuthCallbackUrl(),
  syncSession: null,
  syncUser: null,
  accountProfile: null,
  accountProfileUserId: null,
  accountProfileStatus: "idle",
  accountIdentityDirty: false,
  accountPasswordEditorOpen: false,
  accountPasswordMessage: null,
  accountPasswordReauthRequired: false,
  accountManagementMessage: null,
  passwordRecoveryMode: hasPasswordRecoveryUrl(),
  passwordRecoveryMessage: null,
  accountMessage: null,
  emailVerificationMessage: null,
  syncStatus: navigator.onLine ? "local" : "offline",
  syncIssue: null,
  syncTimer: null,
  syncInProgress: false,
  syncOperationId: 0,
  syncDiagnosticLastDecision: null,
  syncDiagnosticLastError: null,
  applyingRemote: false,
  editingSession: "A",
  editingBlockId: null,
  analyticsBlockId: null,
  selectedAnalysisExercise: null,
  libraryQuery: "",
  libraryMuscle: "Todos",
  libraryEquipment: "Todos",
  libraryFavoritesOnly: false,
  exerciseLibraryFilters: null,
  exerciseLibraryMessage: null,
  exerciseLibraryBusy: null,
  exerciseLibraryDeleteCandidate: null,
  exerciseLibraryAdvancedOpen: false,
  exerciseLibraryEditBaseline: null,
  exerciseLibraryFormDraft: null,
  exerciseLibrarySearchRefocus: false,
  exerciseSubstitution: null,
  finishingWorkout: false,
  editingLibraryExerciseId: null,
  selectedLibraryExerciseId: null,
  favoritesSort: "name",
  coachSessionId: null,
  progressRangeWeeks: 8,
  coachChatMessages: [],
  nutritionDate: new Date().toISOString().slice(0,10),
  nutritionCalculatorOpen: false,
  nutritionPreview: null,
  nutritionCalculationExpanded: false,
  nutritionRecipeType: "comida",
  nutritionRecipeSuggestions: [],
  professionalNutritionDraft: null,
  professionalNutritionPlanId: null,
  professionalNutritionMealId: null,
  professionalNutritionDayType: "rest",
  professionalNutritionIncludePreWorkout: false,
  quickActionsDraft: null,
  quickActionsDesiredCount: 4,
  quickActionsEditorMessage: null,
  quickActionDragKey: null,
  bodyEntryOpen: false,
  bodySummaryEditorOpen: false,
  bodySummaryDraft: null,
  bodySummaryReturnFocus: null,
  selectedBodyMetric: null,
  bodyMetricPeriod: "3m",
  bodyFormMessage: null,
  developerLogFilter: "all",
  healthDate: new Date().toISOString().slice(0,10),
  recoveryView: "overview",
  recoveryDraft: null,
  recoveryResultDate: null,
  recoveryCheckinId: null,
  recoveryMessage: null,
  recoveryQuestionnaireError: null,
  recoveryBusy: false,
  recoveryOperationId: 0,
  completedWorkoutSummary: null,
  workoutAnalysisId: null,
  workoutDraftMessage: null,
  workoutDraftObservedIds: new Set(),
  progressRemoteData: null,
  progressRemoteStatus: "idle",
  aiSettingsMessage: null,
  routineWorkflow: null,
  routineImport: null,
  routineFileChooser: null,
  routineFileBusy: null,
  accountMode: "login",
  onboardingStep: 1,
  onboardingDraft: null,
  onboardingMessage: null,
  onboardingReturnScreen: null,
  onboardingCreateProposalAfterSave: false,
  onboardingExpandedGoals: false,
  onboardingPhaseEditorOpen: false,
  exerciseTimers: {}
};

function getHistory(){ return JSON.parse(localStorage.getItem("gymos:history") || "[]"); }
function mergeWorkoutHistory(localHistory,incomingHistory,ownerId=currentRoutineOwnerOrNull()){
  const records=new Map();
  const identity=workout=>String(
    workout?.workoutInstanceId||workout?.draftId||workout?.id||""
  );
  (Array.isArray(localHistory)?localHistory:[]).forEach(workout=>{
    const id=identity(workout);
    if(id) records.set(id,JSON.parse(JSON.stringify(workout)));
  });
  (Array.isArray(incomingHistory)?incomingHistory:[]).forEach(workout=>{
    if(workout?.ownerId&&ownerId&&workout.ownerId!==ownerId) return;
    const id=identity(workout);
    if(!id||records.has(id)) return;
    records.set(id,JSON.parse(JSON.stringify(workout)));
  });
  return [...records.values()].sort((left,right)=>
    new Date(right?.date||0)-new Date(left?.date||0)||
    identity(left).localeCompare(identity(right),"en")
  );
}
const BODY_SUMMARY_METRICS_KEY="gymos:bodySummaryMetrics";
const DEFAULT_BODY_SUMMARY_METRICS=["weight","waist","chest","hips"];
const BODY_METRICS=Object.freeze({
  weight:{label:"Peso",shortLabel:"Peso",unit:"kg",category:"General",tier:"Imprescindible",db:"weight_kg",help:"Por la mañana, en ayunas, después de ir al baño y antes de comer o beber."},
  bodyFat:{label:"Grasa corporal estimada",shortLabel:"Grasa corporal",unit:"%",category:"General",tier:"Opcional",db:"body_fat_percent",help:"Valor aproximado. Utiliza siempre el mismo método para comparar."},
  neck:{label:"Cuello",shortLabel:"Cuello",unit:"cm",category:"Tronco",tier:"Opcional",db:"neck_cm",help:"Medir horizontalmente por debajo de la nuez."},
  chest:{label:"Pecho",shortLabel:"Pecho",unit:"cm",category:"Tronco",tier:"Imprescindible",db:"chest_cm",help:"Medir horizontalmente por la línea de los pezones, sin expandir forzadamente el pecho."},
  shoulders:{label:"Cintura escapular / hombros",shortLabel:"Hombros",unit:"cm",category:"Tronco",tier:"Recomendada",db:"shoulder_girth_cm",help:"Medir el contorno más amplio alrededor de hombros y parte superior del torso."},
  waist:{label:"Cintura",shortLabel:"Cintura",unit:"cm",category:"Tronco",tier:"Imprescindible",db:"waist_cm",help:"Medir horizontalmente al nivel del ombligo, sin contraer el abdomen."},
  hips:{label:"Cadera",shortLabel:"Cadera",unit:"cm",category:"Tronco",tier:"Imprescindible",db:"hips_cm",help:"Medir la mayor circunferencia horizontal de las caderas."},
  rightArm:{label:"Brazo derecho flexionado",shortLabel:"Brazo derecho",unit:"cm",category:"Brazos",tier:"Recomendada",db:"right_flexed_arm_cm",help:"Medir la zona más gruesa del brazo con el bíceps contraído.",pair:"leftArm"},
  leftArm:{label:"Brazo izquierdo flexionado",shortLabel:"Brazo izquierdo",unit:"cm",category:"Brazos",tier:"Recomendada",db:"left_flexed_arm_cm",help:"Medir la zona más gruesa del brazo con el bíceps contraído.",pair:"rightArm"},
  rightThigh:{label:"Pierna derecha contraída",shortLabel:"Pierna derecha",unit:"cm",category:"Piernas",tier:"Recomendada",db:"right_flexed_thigh_cm",help:"Medir la zona más gruesa del muslo con la musculatura contraída.",pair:"leftThigh"},
  leftThigh:{label:"Pierna izquierda contraída",shortLabel:"Pierna izquierda",unit:"cm",category:"Piernas",tier:"Recomendada",db:"left_flexed_thigh_cm",help:"Medir la zona más gruesa del muslo con la musculatura contraída.",pair:"rightThigh"}
});
const BODY_METRIC_KEYS=Object.keys(BODY_METRICS);

function bodyMeasurementId(){
  return crypto.randomUUID?crypto.randomUUID():`body-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
function normalizeBodyMeasurement(row,index=0){
  const date=String(row?.date||row?.measured_at||"").slice(0,10);
  const valueFor=(key,...aliases)=>{
    const values=[row?.[key],...aliases.map(alias=>row?.[alias])];
    const value=values.find(item=>numericValue(item)!==null);
    return value===undefined?null:numericValue(value);
  };
  return {
    id:String(row?.id||`legacy-${date||"unknown"}-${index+1}`),
    date,
    weight:valueFor("weight","weight_kg"),
    neck:valueFor("neck","neck_cm"),
    chest:valueFor("chest","chest_cm"),
    shoulders:valueFor("shoulders","shoulder_girth_cm"),
    rightArm:valueFor("rightArm","right_flexed_arm_cm"),
    leftArm:valueFor("leftArm","left_flexed_arm_cm"),
    waist:valueFor("waist","waist_cm"),
    hips:valueFor("hips","hips_cm"),
    rightThigh:valueFor("rightThigh","right_flexed_thigh_cm"),
    leftThigh:valueFor("leftThigh","left_flexed_thigh_cm"),
    bodyFat:valueFor("bodyFat","bodyFatPercentage","fatPercentage","fat","body_fat_percent"),
    notes:String(row?.notes??row?.note??"").trim(),
    createdAt:row?.createdAt||row?.created_at||(date?`${date}T12:00:00.000Z`:new Date().toISOString()),
    updatedAt:row?.updatedAt||row?.updated_at||row?.createdAt||row?.created_at||(date?`${date}T12:00:00.000Z`:new Date().toISOString())
  };
}
function getBodyHistory(){
  let source=[];
  try{
    const parsed=JSON.parse(localStorage.getItem("gymos:body")||"[]");
    source=Array.isArray(parsed)?parsed:[];
  }catch(error){source=[];}
  const normalized=source
    .map(normalizeBodyMeasurement)
    .filter(row=>row.date)
    .sort((a,b)=>new Date(a.date)-new Date(b.date));
  if(JSON.stringify(source)!==JSON.stringify(normalized)){
    localStorage.setItem("gymos:body",JSON.stringify(normalized));
  }
  return normalized;
}
function saveBodyHistory(rows,{markUpdated=true}={}){
  const normalized=(Array.isArray(rows)?rows:[])
    .map(normalizeBodyMeasurement)
    .filter(row=>row.date)
    .sort((a,b)=>new Date(a.date)-new Date(b.date));
  localStorage.setItem("gymos:body",JSON.stringify(normalized));
  if(markUpdated) markLocalUpdated();
}
function getBodySummaryMetrics(){
  try{
    const stored=JSON.parse(localStorage.getItem(BODY_SUMMARY_METRICS_KEY)||"[]");
    const valid=(Array.isArray(stored)?stored:[]).filter((key,index,array)=>BODY_METRICS[key]&&array.indexOf(key)===index).slice(0,4);
    return valid.length===4?valid:DEFAULT_BODY_SUMMARY_METRICS.slice();
  }catch(error){return DEFAULT_BODY_SUMMARY_METRICS.slice();}
}
function saveBodySummaryMetrics(keys,{markUpdated=true}={}){
  const valid=(Array.isArray(keys)?keys:[]).filter((key,index,array)=>BODY_METRICS[key]&&array.indexOf(key)===index).slice(0,4);
  const next=valid.length===4?valid:DEFAULT_BODY_SUMMARY_METRICS.slice();
  localStorage.setItem(BODY_SUMMARY_METRICS_KEY,JSON.stringify(next));
  if(markUpdated) markLocalUpdated();
  return next;
}
function bodyChange(field){
  const rows=getBodyHistory().filter(r=>numericValue(r[field])!==null);
  if(rows.length<2) return null;
  return numericValue(rows.at(-1)[field])-numericValue(rows[0][field]);
}
function bodyMetricStats(field,rows=getBodyHistory()){
  const entries=rows
    .filter(row=>numericValue(row[field])!==null)
    .map(row=>({date:row.date,value:numericValue(row[field]),id:row.id}));
  if(!entries.length) return null;
  const latest=entries.at(-1);
  const previous=entries.at(-2)||null;
  const first=entries[0];
  const delta=previous?latest.value-previous.value:null;
  const percent=previous&&previous.value!==0?(delta/previous.value)*100:null;
  const totalDelta=entries.length>1?latest.value-first.value:null;
  const totalPercent=entries.length>1&&first.value!==0?(totalDelta/first.value)*100:null;
  const monthlyReference=[...entries].reverse().find(item=>new Date(latest.date)-new Date(item.date)>=28*86400000)||null;
  return {
    entries,latest,previous,first,delta,percent,totalDelta,totalPercent,
    monthlyDelta:monthlyReference?latest.value-monthlyReference.value:null
  };
}
function bodyMetricSummary(fields,unit){
  const fieldNames=Array.isArray(fields)?fields:[fields];
  const field=fieldNames.find(name=>bodyMetricStats(name));
  if(!field) return null;
  const stats=bodyMetricStats(field);
  return {
    value:stats.latest.value,
    unit,
    date:stats.latest.date,
    change:stats.delta,
    percent:stats.percent,
    totalChange:stats.totalDelta,
    totalPercent:stats.totalPercent
  };
}
function formatBodyNumber(value){
  return formatWeight(Math.round(Number(value)*10)/10);
}
function signedBodyValue(value,unit){
  if(value===null||value===undefined) return "";
  if(Math.abs(value)<.05) return `0,0 ${unit}`;
  return `${value>0?"+":"−"}${formatBodyNumber(Math.abs(value))} ${unit}`;
}
function bodyMetricChangeLabel(metric){
  if(metric.change===null) return "Primer registro";
  if(Math.abs(metric.change)<.05) return "Sin cambios";
  return `${metric.change>0?"Subió":"Bajó"} ${formatBodyNumber(Math.abs(metric.change))} ${metric.unit}`;
}
function renderHomeBodyMetric(key){
  const definition=BODY_METRICS[key];
  const stats=bodyMetricStats(key);
  const metric=stats?{
    value:stats.latest.value,unit:definition.unit,date:stats.latest.date,
    change:stats.delta,percent:stats.percent
  }:null;
  const label=definition.shortLabel;
  if(!metric){
    return `<button type="button" class="body-home-metric body-home-metric-empty" data-open-body>
      <span>${esc(label)}</span>
      <strong>Sin registrar</strong>
      <small>Añadir primera medida →</small>
    </button>`;
  }
  const numberKey=`body-${String(label).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g,"-")}`;
  const decimals=Math.abs(metric.value-Math.round(metric.value))>.001?1:0;
  return `<article class="body-home-metric">
    <span>${esc(label)}</span>
    <strong><span data-home-number data-home-number-key="${numberKey}" data-home-number-value="${metric.value}" data-home-number-decimals="${decimals}">${formatBodyNumber(metric.value)}</span> ${metric.unit}</strong>
    <div class="body-home-change">${metric.change===null?"Primer registro":signedBodyValue(metric.change,metric.unit)}${metric.percent!==null?` <small>· ${metric.percent>0?"+":metric.percent<0?"−":""}${formatBodyNumber(Math.abs(metric.percent))} %</small>`:""}</div>
    <small class="body-home-date">${formatDate(metric.date)}</small>
  </article>`;
}
function latestBodyEntry(){
  return getBodyHistory().at(-1)||null;
}
function bodyTrendSvg(rows,field,label){
  const valid=rows.filter(r=>numericValue(r[field])!==null).slice(-12);
  if(valid.length<2) return `<div class="body-empty-chart">Añade al menos dos registros para ver la tendencia.</div>`;
  const values=valid.map(r=>numericValue(r[field]));
  const min=Math.min(...values),max=Math.max(...values);
  const range=Math.max(max-min,0.5);
  const width=320,height=150,pad=18;
  const points=values.map((value,index)=>{
    const x=pad+(index/(values.length-1))*(width-pad*2);
    const y=height-pad-((value-min)/range)*(height-pad*2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return `<div class="body-chart">
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}">
      <polyline points="${points}" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
      ${points.split(" ").map(point=>{
        const [x,y]=point.split(",");
        return `<circle cx="${x}" cy="${y}" r="4.5" fill="currentColor"></circle>`;
      }).join("")}
    </svg>
    <div class="body-chart-range"><span>${formatWeight(values[0])}</span><span>${formatWeight(values.at(-1))}</span></div>
  </div>`;
}
function saveHistory(h){ localStorage.setItem("gymos:history", JSON.stringify(h)); markLocalUpdated(); }
function normalizeSeries(series){
  return {
    ...(series&&typeof series==="object"?series:{}),
    weight:series?.weight??"",
    reps:series?.reps??"",
    rir:series?.rir??"",
    seconds:series?.seconds??"",
    distance:series?.distance??"",
    technique:series?.technique??"",
    dropset:Boolean(series?.dropset),
    restPause:Boolean(series?.restPause),
    unilateral:Boolean(series?.unilateral),
    warmup:Boolean(series?.warmup),
    done:Boolean(series?.done),
    ...(series?.setInstanceId?{setInstanceId:String(series.setInstanceId)}:{}),
    ...(series?._fieldMeta&&typeof series._fieldMeta==="object"?{_fieldMeta:series._fieldMeta}:{})
  };
}
function workingSeries(series){
  return (series||[]).map(normalizeSeries).filter(s=>!s.warmup);
}
function getRestSeconds(){
  const value=Number(localStorage.getItem("gymos:restSeconds")||90);
  return [60,90,120,180].includes(value)?value:90;
}
const REST_TIMER_STORAGE_PREFIX="gymos:restTimer:";
function saveRestSeconds(value){
  const seconds=Number(value);
  if(![60,90,120,180].includes(seconds)) throw new Error("invalid_rest_seconds");
  const ownerId=currentRoutineOwnerOrNull();
  if(!ownerId) throw new Error("owner_not_active");
  assertActiveLocalOwner(ownerId);
  if(getRestSeconds()===seconds) return {changed:false,value:seconds};
  const previous={
    restSeconds:localStorage.getItem("gymos:restSeconds"),
    updatedAt:localStorage.getItem("gymos:updatedAt"),
    syncPending:localStorage.getItem("gymos:syncPending"),
    syncStatus:state.syncStatus
  };
  try{
    localStorage.setItem("gymos:restSeconds",String(seconds));
    assertActiveLocalOwner(ownerId);
    markLocalUpdated();
    assertActiveLocalOwner(ownerId);
    return {changed:true,value:seconds};
  }catch(error){
    restoreStorageValue("gymos:restSeconds",previous.restSeconds);
    restoreStorageValue("gymos:updatedAt",previous.updatedAt);
    restoreStorageValue("gymos:syncPending",previous.syncPending);
    state.syncStatus=previous.syncStatus;
    throw error;
  }
}
function getWeeklyGoal(){
  const value=Number(localStorage.getItem("gymos:weeklyGoal")||3);
  return Number.isInteger(value)&&value>=1&&value<=7?value:3;
}
function saveWeeklyGoal(value){
  localStorage.setItem("gymos:weeklyGoal",String(Math.max(1,Math.min(7,Number(value)||3))));
  markLocalUpdated();
}
const GYMOS_PRODUCTION_URL="https://apl00028.github.io/mi-rutina/";

function getSyncConfig(){
  const deployed=window.GYMOS_AUTH_CONFIG||{};
  return {
    url:String(deployed.supabaseUrl||localStorage.getItem("gymos:supabaseUrl")||"").trim(),
    key:String(deployed.supabaseAnonKey||localStorage.getItem("gymos:supabaseAnonKey")||"").trim(),
    email:localStorage.getItem("gymos:syncEmail")||""
  };
}
function saveSyncConfig(config){
  localStorage.setItem("gymos:supabaseUrl",config.url.trim());
  localStorage.setItem("gymos:supabaseAnonKey",config.key.trim());
  localStorage.setItem("gymos:syncEmail",config.email.trim());
}
function getLocalUpdatedAt(){
  return localStorage.getItem("gymos:updatedAt")||new Date(0).toISOString();
}
function getLastSyncAt(){
  return localStorage.getItem("gymos:lastSyncAt")||"";
}
function defaultDeviceName(){
  const ua=navigator.userAgent||"";
  if(/Android/i.test(ua)) return "Móvil Android";
  if(/iPhone|iPad/i.test(ua)) return "iPhone / iPad";
  if(/Windows/i.test(ua)) return "PC Windows";
  if(/Macintosh/i.test(ua)) return "Mac";
  return "Este dispositivo";
}
function getDeviceName(){
  return localStorage.getItem("gymos:deviceName")||defaultDeviceName();
}
function saveDeviceName(value){
  localStorage.setItem("gymos:deviceName",(value||"").trim()||defaultDeviceName());
}
function markLocalUpdated({schedule=true}={}){
  if(state.applyingRemote) return;
  localStorage.setItem("gymos:updatedAt",new Date().toISOString());
  localStorage.setItem("gymos:syncPending","1");
  if(schedule&&isAppAuthenticated()){
    state.syncStatus=navigator.onLine?"pending":"offline";
    scheduleAutoSync();
  }
}
function scheduleAutoSync(delay=2500){
  clearTimeout(state.syncTimer);
  if(isSyncDebugRequested()||!isAppAuthenticated()||state.syncInProgress) return;
  state.syncTimer=setTimeout(()=>autoSync("cambio local"),delay);
}
function formatSyncDate(value){
  if(!value) return "Todavía no";
  const date=new Date(value);
  if(Number.isNaN(date.getTime())) return "Todavía no";
  return date.toLocaleString("es-ES",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
}
function buildSyncPayload(){
  const ownerId=currentRoutineOwnerOrNull();
  return {
    version:"3.7.0",
    updatedAt:getLocalUpdatedAt(),
    deviceId:getDeviceId(),
    deviceName:getDeviceName(),
    history:getHistory(),
    routine:activeRoutineForComparison(),
    canonicalRoutine:getCanonicalRoutine(),
    canonicalDrafts:sanitizeWorkoutDraftContainer(getCanonicalDrafts(),{
      ownerId,canonicalRoutine:getCanonicalRoutine()
    }),
    workoutProgress:storedWorkoutProgressRecords(),
    selectedSessionId:localStorage.getItem(SELECTED_SESSION_ID_KEY),
    sessionModelMigration:readStoredJson(SESSION_MODEL_MIGRATION_KEY),
    body:getBodyHistory(),
    body_summary_metrics:getBodySummaryMetrics(),
    selectedSession:localStorage.getItem("gymos:selectedSession")||"A",
    restSeconds:getRestSeconds(),
    weeklyGoal:getWeeklyGoal(),
    blocks:getTrainingBlocks(),
    activeBlockId:localStorage.getItem("gymos:activeBlockId"),
    routineProposals:getRoutineProposalRecords(),
    activeRoutineProposalId:localStorage.getItem(ACTIVE_ROUTINE_PROPOSAL_ID_KEY),
    routineActivationHistory:getRoutineActivationRecords(),
    activeRoutineActivationId:localStorage.getItem(ACTIVE_ROUTINE_ACTIVATION_ID_KEY),
    exerciseLibrary:getExerciseLibrary(),
    exerciseDomainSchemaVersion:localStorage.getItem(EXERCISE_DOMAIN_SCHEMA_KEY),
    exerciseSubstitutions:getExerciseSubstitutions(),
    nutritionSettings:getNutritionSettings(),
    nutritionEntries:getNutritionEntries(),
    professionalNutritionPlans:window.GymOSProfessionalNutrition?.getPlans?.()||[],
    healthSettings:getHealthSettings(),
    healthEntries:getHealthEntries(),
    healthImports:getHealthImports(),
    recoveryEntries:window.GymOSRecovery?.getEntries?.()||[],
    recoveryCheckins:window.GymOSRecovery?.getCheckins?.()||[],
    workoutAnalyses:window.GymOSWorkoutAnalysis?.getAnalyses?.()||[],
    appPreferences:getAppPreferences(),
    ai_messages_enabled:Boolean(getCoachSettings().aiEnabled),
    quick_actions:getQuickActionPreferences().quickActions,
    quick_actions_hidden:getQuickActionPreferences().hidden,
    favoriteSubstitutions:getFavoriteSubstitutions(),
    ...(window.GymOSProfileData?.exportSyncData?.()||{}),
    updatedAt:getLocalUpdatedAt()
  };
}
function applySyncPayload(payload){
  if(!payload||typeof payload!=="object") throw new Error("Copia remota no válida.");
  const ownerAtStart=currentRoutineOwnerOrNull();
  if(!ownerAtStart) throw new Error("owner_not_active");
  if(typeof sanitizeIncomingWorkoutPayload==="function"){
    payload=sanitizeIncomingWorkoutPayload(payload,{ownerId:ownerAtStart});
  }
  const before=captureRoutineSessionStartupStorage(ownerAtStart);
  state.applyingRemote=true;
  try{
  assertActiveLocalOwner(ownerAtStart);
  if(Array.isArray(payload.history)) saveHistory(
    typeof mergeWorkoutHistory==="function"
      ?mergeWorkoutHistory(getHistory(),payload.history,ownerAtStart)
      :payload.history
  );
  let canonicalAccepted=false;
  const canonicalProvided=Boolean(payload.canonicalRoutine);
  if(payload.canonicalRoutine){
    const ownerId=currentRoutineOwnerOrNull();
    const validation=window.GymOSRoutineSessionModel.validateCanonicalRoutine(payload.canonicalRoutine);
    const remoteMetadata=payload.sessionModelMigration;
    const ownerMatches=ownerId&&remoteMetadata?.ownerId===ownerId;
    const draftValidation=payload.canonicalDrafts
      ?routineSessionMigrationApi().validateDraftContainer(
        payload.canonicalDrafts,{ownerId,canonicalRoutine:payload.canonicalRoutine}
      )
      :{valid:false};
    const metadataMatches=remoteMetadata?.completed===true&&
      remoteMetadata?.validated===true&&
      remoteMetadata?.routineId===payload.canonicalRoutine.routineId&&
      window.GymOSRoutineProposals.stableStringify(remoteMetadata?.legacySessionMap||{})===
        window.GymOSRoutineProposals.stableStringify(
          routineSessionMigrationApi().sessionMap(payload.canonicalRoutine)
        );
    const remoteShadow=validation.valid
      ?routineSessionRuntimeApi().legacyShadow(payload.canonicalRoutine)
      :null;
    const remoteShadowMatches=!payload.routine||(
      remoteShadow&&routineSessionMigrationApi().legacyRoutineEquivalent(
        payload.routine,remoteShadow
      )
    );
    if(
      validation.valid&&draftValidation.valid&&ownerMatches&&metadataMatches&&remoteShadowMatches
    ){
      const localCanonical=getCanonicalRoutine();
      const localShadowMatches=!localCanonical||routineSessionMigrationApi().legacyRoutineEquivalent(
        readStoredJson("gymos:routine")||{},routineSessionRuntimeApi().legacyShadow(localCanonical)
      );
      const syncDecision=localShadowMatches
        ?routineSessionMigrationApi().canonicalSyncDecision(
          localCanonical,payload.canonicalRoutine
        )
        :{accept:false,code:"local_legacy_shadow_conflict"};
      if(!syncDecision.accept){
        const error=new Error(syncDecision.code||"canonical_sync_conflict");
        error.code=syncDecision.code||"canonical_sync_conflict";
        throw error;
      }else{
        const remoteProgress=[
          ...(Array.isArray(payload.workoutProgress)?payload.workoutProgress:[]),
          ...Object.values(payload.canonicalDrafts?.draftsBySessionId||{})
        ];
        mergeIncomingWorkoutProgress(remoteProgress,{writeCanonical:false});
        saveCanonicalRoutine(payload.canonicalRoutine,{mark:false,writeLegacyShadow:true});
        let mergedDrafts=JSON.parse(JSON.stringify(payload.canonicalDrafts));
        routineSessionRuntimeApi().orderedSessions(payload.canonicalRoutine).forEach(session=>{
          const active=activeWorkoutProgressRecord(ownerId,session.sessionId);
          if(
            !active||active.routineId!==payload.canonicalRoutine.routineId||
            active.status!=="active"
          ) return;
          mergedDrafts=routineSessionRuntimeApi().upsertDraft(mergedDrafts,active,{
            ownerId,routine:payload.canonicalRoutine
          });
        });
        localStorage.setItem(CANONICAL_DRAFTS_KEY,JSON.stringify(mergedDrafts));
        writeLegacyDraftShadows(payload.canonicalRoutine,mergedDrafts);
        localStorage.setItem(SESSION_MODEL_MIGRATION_KEY,JSON.stringify(remoteMetadata));
        const remoteSelected=routineSessionMigrationApi().selectedSessionId(
          payload.canonicalRoutine,payload.selectedSession,payload.selectedSessionId
        );
        if(remoteSelected){
          localStorage.setItem(SELECTED_SESSION_ID_KEY,remoteSelected);
          const remoteLegacy=routineSessionMigrationApi().legacySelection(
            payload.canonicalRoutine,remoteSelected
          );
          if(remoteLegacy) localStorage.setItem("gymos:selectedSession",remoteLegacy);
          else localStorage.removeItem("gymos:selectedSession");
        }
        canonicalAccepted=true;
      }
    }else{
      const code=validation.valid&&remoteShadowMatches
        ?"invalid_remote_session_state"
        :validation.valid?"remote_legacy_shadow_conflict":"invalid_remote_canonical";
      const error=new Error(code);
      error.code=code;
      throw error;
    }
  }
  if(payload.routine&&!canonicalAccepted&&!canonicalProvided){
    saveRoutine(payload.routine,{mark:false});sessions=getRoutine();
  }
  else if(canonicalAccepted){
    sessions=getRoutine();
    persistSelectedRoutineSession(localStorage.getItem(SELECTED_SESSION_ID_KEY));
  }
  if(Array.isArray(payload.body)) saveBodyHistory(payload.body);
  if(Array.isArray(payload.body_summary_metrics)) saveBodySummaryMetrics(payload.body_summary_metrics,{markUpdated:false});
  if(Array.isArray(payload.exerciseLibrary)&&payload.exerciseLibrary.length){
    saveExerciseLibrary(payload.exerciseLibrary,{
      mark:false,touchUpdatedAt:false,setSchema:false,
      ownerId:currentRoutineOwnerOrNull()
    });
  }
  if(Array.isArray(payload.routineProposals)){
    importRoutineProposalSyncData(payload,{mark:false});
  }
  if(Array.isArray(payload.routineActivationHistory)){
    importRoutineActivationSyncData(payload,{mark:false});
  }
  if(payload.nutritionSettings) saveNutritionSettings(payload.nutritionSettings);
  if(Array.isArray(payload.nutritionEntries)) saveNutritionEntries(payload.nutritionEntries);
  if(Array.isArray(payload.professionalNutritionPlans)) window.GymOSProfessionalNutrition?.mergePlans?.(payload.professionalNutritionPlans,false);
  if(payload.healthSettings) saveHealthSettings(payload.healthSettings);
  if(Array.isArray(payload.healthEntries)) saveHealthEntries(payload.healthEntries);
  if(Array.isArray(payload.healthImports)) saveHealthImports(payload.healthImports);
  if(Array.isArray(payload.recoveryEntries)) window.GymOSRecovery?.mergeRecoveryEntries?.(payload.recoveryEntries,false);
  if(Array.isArray(payload.recoveryCheckins)) window.GymOSRecovery?.mergeCheckins?.(payload.recoveryCheckins,false);
  if(Array.isArray(payload.workoutAnalyses)) window.GymOSWorkoutAnalysis?.mergeAnalyses?.(payload.workoutAnalyses,false);
  if(payload.appPreferences) saveAppPreferences(payload.appPreferences);
  if(typeof payload.ai_messages_enabled==="boolean"){
    saveCoachSettings({...getCoachSettings(),aiEnabled:payload.ai_messages_enabled});
  }
  if(Array.isArray(payload.quick_actions)){
    saveQuickActionPreferences({
      quickActions:payload.quick_actions,
      hidden:Boolean(payload.quick_actions_hidden)
    },{markUpdated:false});
  }
  if(!canonicalAccepted&&["A","B","C"].includes(payload.selectedSession)){
    const selected=validSelectedRoutineSession(payload.selectedSession);
    persistSelectedRoutineSession(selected);
  }
  if([60,90,120,180].includes(Number(payload.restSeconds))) saveRestSeconds(Number(payload.restSeconds));
  if(Number(payload.weeklyGoal)>=1&&Number(payload.weeklyGoal)<=7) saveWeeklyGoal(Number(payload.weeklyGoal));
  if(Array.isArray(payload.blocks)) saveTrainingBlocks(payload.blocks);
  if(payload.activeBlockId) localStorage.setItem("gymos:activeBlockId",payload.activeBlockId);
    const importedProfileData=window.GymOSProfileData?.importSyncData?.(payload,{mark:false});
    ensureRoutineSessionMigration({ownerId:currentRoutineOwnerOrNull(),mark:false});
    if(typeof ensureWorkoutProgressMigration==="function"){
      ensureWorkoutProgressMigration({ownerId:currentRoutineOwnerOrNull(),mark:false});
    }
    if(!importedProfileData) ensureProfileDataMigration({mark:false});
    ensureExerciseDomainMigration({mark:false,force:true});
    localStorage.setItem("gymos:updatedAt",payload.updatedAt||new Date().toISOString());
    localStorage.removeItem("gymos:syncPending");
    assertActiveLocalOwner(ownerAtStart);
  }catch(error){
    restoreRoutineSessionStartupStorage(before,ownerAtStart);
    throw error;
  }finally{
    state.applyingRemote=false;
  }
}


const SYNC_AUDIT_KEY="gymos:syncAudit";
const DEVICE_ID_KEY="gymos:deviceId";
const LOCAL_REVISION_KEY="gymos:localRevision";
const LAST_REMOTE_REVISION_KEY="gymos:lastRemoteRevision";
const SYNC_BASE_REVISION_KEY="gymos:syncBaseRevision";
const SYNC_PROTOCOL_VERSION_KEY="gymos:syncProtocolVersion";
const SYNC_PROTOCOL_VERSION=2;

function getDeviceId(){
  let id=localStorage.getItem(DEVICE_ID_KEY);
  if(!id){
    id=`device-${crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_ID_KEY,id);
  }
  return id;
}
function getLocalRevision(){return Number(localStorage.getItem(LOCAL_REVISION_KEY)||0);}
function setLocalRevision(value){localStorage.setItem(LOCAL_REVISION_KEY,String(Number(value)||0));}
function getLastRemoteRevision(){return Number(localStorage.getItem(LAST_REMOTE_REVISION_KEY)||0);}
function setLastRemoteRevision(value){localStorage.setItem(LAST_REMOTE_REVISION_KEY,String(Number(value)||0));}
function getSyncBaseRevision(){
  const stored=localStorage.getItem(SYNC_BASE_REVISION_KEY);
  if(stored!==null) return Number(stored)||0;
  return getLastRemoteRevision();
}
function setSyncBaseRevision(value){localStorage.setItem(SYNC_BASE_REVISION_KEY,String(Number(value)||0));}
function markSyncProtocolCurrent(){localStorage.setItem(SYNC_PROTOCOL_VERSION_KEY,String(SYNC_PROTOCOL_VERSION));}
function isLocalSyncProtocolCurrent(){
  return Number(localStorage.getItem(SYNC_PROTOCOL_VERSION_KEY)||0)>=SYNC_PROTOCOL_VERSION;
}
function isRemoteSyncProtocolCurrent(remote){
  return Number(remote?.payload?.syncProtocolVersion||0)>=SYNC_PROTOCOL_VERSION;
}
function getSyncConflictPreference(){return localStorage.getItem("gymos:syncConflictMode")||"ask";}
function setSyncConflictPreference(value){localStorage.setItem("gymos:syncConflictMode",value);}
function getSyncAudit(){
  try{
    const value=JSON.parse(localStorage.getItem(SYNC_AUDIT_KEY)||"[]");
    return Array.isArray(value)?value.map(({userId,deviceId,...entry})=>entry):[];
  }
  catch(error){return [];}
}
function sanitizeStoredSyncAudit(){
  const raw=localStorage.getItem(SYNC_AUDIT_KEY);
  if(!raw) return;
  const sanitized=JSON.stringify(getSyncAudit());
  if(raw!==sanitized) localStorage.setItem(SYNC_AUDIT_KEY,sanitized);
}
function addSyncAudit(action,status,details={}){
  const items=getSyncAudit();
  items.push({id:`audit-${Date.now().toString(36)}`,createdAt:new Date().toISOString(),action,status,details});
  localStorage.setItem(SYNC_AUDIT_KEY,JSON.stringify(items.slice(-100)));
}
function simpleChecksum(value){
  const text=JSON.stringify(value);let hash=2166136261;
  for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return (hash>>>0).toString(16);
}
function storedValueHash(key){
  const raw=localStorage.getItem(key);
  return raw===null?null:simpleChecksum(raw);
}
function remotePayloadDiagnostic(payload){
  const data=payload&&typeof payload==="object"?payload:{};
  return {
    routineId:data.canonicalRoutine?.routineId||data.routine?.routineId||null,
    selectedSessionId:data.selectedSessionId||null,
    routineHash:data.canonicalRoutine||data.routine
      ?simpleChecksum(data.canonicalRoutine||data.routine)
      :null,
    historyHash:Array.isArray(data.history)?simpleChecksum(data.history):null,
    syncPending:null
  };
}
function localSyncDiagnosticSnapshot(){
  let routineId=null;
  try{routineId=getCanonicalRoutine()?.routineId||null;}
  catch(error){routineId=`invalid:${error?.message||"routine"}`;}
  return {
    ownerId:currentRoutineOwnerOrNull(),
    deviceId:localStorage.getItem(DEVICE_ID_KEY)||null,
    localRevision:getLocalRevision(),
    lastRemoteRevision:getLastRemoteRevision(),
    syncBaseRevision:getSyncBaseRevision(),
    syncPending:localStorage.getItem("gymos:syncPending")==="1",
    lastSyncAt:getLastSyncAt()||null,
    routineId,
    selectedSessionId:localStorage.getItem(SELECTED_SESSION_ID_KEY)||null,
    routineHash:storedValueHash(CANONICAL_ROUTINE_KEY),
    historyHash:storedValueHash("gymos:history")
  };
}
function remoteSyncDiagnosticFromRow(row){
  const payloadSummary=remotePayloadDiagnostic(row?.payload);
  return {
    exists:Boolean(row),
    revision:row?Number(row.revision||0):null,
    deviceId:row?.device_id||null,
    checksum:row?.checksum||null,
    updatedAt:row?.updated_at||null,
    ...payloadSummary
  };
}
async function remoteSyncDiagnosticSnapshot(){
  const client=getSupabaseClient();
  if(!client||!isAppAuthenticated()) return {available:false,reason:"not_authenticated"};
  const {data,error}=await client.from("gymos_sync")
    .select("payload,revision,device_id,updated_at,checksum")
    .eq("user_id",state.syncUser.id)
    .maybeSingle();
  if(error) return {available:false,reason:"remote_error",error:sanitizeSyncError(error)};
  return {available:true,...remoteSyncDiagnosticFromRow(data)};
}
function syncDiagnosticRows(snapshot){
  const local=snapshot?.local||{};
  const remote=snapshot?.remote||{};
  return [
    {
      Estado:"PC/móvil local",revision:local.localRevision,remoteRevision:local.lastRemoteRevision,
      routineId:local.routineId,selectedSessionId:local.selectedSessionId,
      routineHash:local.routineHash,historyHash:local.historyHash,
      syncBaseRevision:local.syncBaseRevision,syncPending:local.syncPending,lastSyncAt:local.lastSyncAt,
      ownerId:local.ownerId,deviceId:local.deviceId,checksum:null
    },
    {
      Estado:"Supabase",revision:remote.revision,remoteRevision:null,
      routineId:remote.routineId,selectedSessionId:remote.selectedSessionId,
      routineHash:remote.routineHash,historyHash:remote.historyHash,
      syncPending:remote.syncPending,lastSyncAt:remote.updatedAt,
      ownerId:state.syncUser?.id||null,deviceId:remote.deviceId,checksum:remote.checksum
    }
  ];
}
function sanitizeSyncError(error){
  return {
    code:error?.code||error?.name||"sync_error",
    status:error?.status||null,
    message:String(error?.message||error||"sync_error").slice(0,240)
  };
}
function syncDiagnosticLog(step,details={}){
  if(typeof state!=="undefined"){
    if(step==="decisión"&&details?.decision){
      state.syncDiagnosticLastDecision={
        decision:details.decision,
        reason:details.reason||null,
        at:new Date().toISOString()
      };
    }
    if(step==="error"){
      state.syncDiagnosticLastError={
        ...details,
        at:new Date().toISOString()
      };
    }
  }
  console.info(`[GymOS sync] ${step}`,details);
}
async function buildSyncDiagnosticSnapshot(){
  const local=localSyncDiagnosticSnapshot();
  const remote=await remoteSyncDiagnosticSnapshot();
  return {
    generatedAt:new Date().toISOString(),
    authenticated:isAppAuthenticated(),
    syncStatus:state.syncStatus,
    lastDecision:state.syncDiagnosticLastDecision||null,
    lastError:state.syncDiagnosticLastError||null,
    local,remote,rows:syncDiagnosticRows({local,remote})
  };
}
async function printSyncDiagnosticSnapshot(){
  const snapshot=await buildSyncDiagnosticSnapshot();
  console.info("[GymOS sync] diagnóstico",{generatedAt:snapshot.generatedAt});
  console.table(snapshot.rows);
  return snapshot;
}
window.GymOSSyncDiagnostics=Object.freeze({
  snapshot:buildSyncDiagnosticSnapshot,
  print:printSyncDiagnosticSnapshot,
  local:localSyncDiagnosticSnapshot
});
function buildSyncEnvelope(baseRevision,candidateRevision){
  const syncData=buildSyncPayload();
  const revision=Number(candidateRevision);
  return {
    schemaVersion:SYNC_PROTOCOL_VERSION,
    revision,
    parentRevision:Number(baseRevision)||0,
    deviceId:getDeviceId(),
    updatedAt:new Date().toISOString(),
    checksum:simpleChecksum(syncData),
    payload:{
      ...syncData,
      syncProtocolVersion:SYNC_PROTOCOL_VERSION,
      syncParentRevision:Number(baseRevision)||0
    }
  };
}
function syncSecurityState(){
  return {authenticated:isAppAuthenticated(),deviceConfigured:Boolean(getDeviceId()),localRevision:getLocalRevision(),lastRemoteRevision:getLastRemoteRevision(),syncBaseRevision:getSyncBaseRevision(),conflictMode:getSyncConflictPreference(),audit:getSyncAudit().slice(-10)};
}
async function chooseConflictResolution(remote){
  const mode=getSyncConflictPreference();
  if(mode==="remote") return "remote";
  if(mode==="local") return "local";
  return confirm("Hay cambios tanto en este dispositivo como en la nube.\n\nAceptar: usar la nube.\nCancelar: mantener este dispositivo.")?"remote":"local";
}

const ACCOUNT_AVATAR_OPTIONS=[
  {key:"initials",label:"Iniciales",icon:null},
  {key:"strength",label:"Fuerza",icon:"🏋"},
  {key:"energy",label:"Energía",icon:"⚡"},
  {key:"fire",label:"Constancia",icon:"🔥"},
  {key:"heart",label:"Bienestar",icon:"♥"},
  {key:"star",label:"Objetivo",icon:"★"}
];
function normalizeAccountAlias(value){
  return String(value||"").trim().slice(0,30);
}
function accountAlias(){
  return normalizeAccountAlias(state.accountProfile?.alias);
}
function accountDisplayName(user=state.syncUser){
  return accountAlias()||
    String(getOnboardingProfile()?.name||"").trim()||
    user?.email?.split("@")[0]||
    "Usuario";
}
function accountInitials(alias=accountDisplayName()){
  const parts=String(alias||"").trim().split(/\s+/).filter(Boolean);
  return (parts.length>1?`${parts[0][0]}${parts[parts.length-1][0]}`:parts[0]?.slice(0,2)||"G").toUpperCase();
}
function validAccountAvatarKey(value){
  return ACCOUNT_AVATAR_OPTIONS.some(option=>option.key===value)?value:"initials";
}
function accountAvatarContent(key=state.accountProfile?.avatarKey,alias=accountDisplayName()){
  const normalized=validAccountAvatarKey(key);
  const option=ACCOUNT_AVATAR_OPTIONS.find(item=>item.key===normalized);
  return option?.icon||accountInitials(alias);
}
function updateVisibleAccountIdentity(){
  document.querySelectorAll("[data-account-display-name]").forEach(element=>element.textContent=accountDisplayName());
  document.querySelectorAll("[data-account-avatar]").forEach(element=>element.textContent=accountAvatarContent());
}
function scheduleAccountProfileLoad(userId){
  if(!userId||state.accountProfileUserId===userId&&state.accountProfileStatus!=="error") return;
  if(state.accountProfileUserId!==userId){
    state.accountProfile=null;
    state.accountManagementMessage=null;
    state.accountIdentityDirty=false;
    state.accountPasswordEditorOpen=false;
    state.accountPasswordMessage=null;
    state.accountPasswordReauthRequired=false;
  }
  state.accountProfileUserId=userId;
  state.accountProfileStatus="loading";
  queueMicrotask(()=>loadAccountIdentityProfile(userId));
}
async function loadAccountIdentityProfile(userId=state.syncUser?.id){
  const client=getSupabaseClient();
  if(!client||!userId||!isAppAuthenticated()) return null;
  const ownerId=currentRoutineOwnerOrNull();
  const {data,error}=await client.from("profiles").select("alias,avatar_key").eq("id",userId).maybeSingle();
  if(state.syncUser?.id!==userId||currentRoutineOwnerOrNull()!==ownerId) return null;
  if(error){
    state.accountProfileStatus="error";
    if(state.screen==="account"){
      showAccountManagementMessage("error","No se pudo cargar el alias y el avatar. Comprueba que has ejecutado database/supabase/account-profile.sql.");
    }
    return null;
  }
  state.accountProfile={
    alias:normalizeAccountAlias(data?.alias),
    avatarKey:validAccountAvatarKey(data?.avatar_key)
  };
  state.accountProfileStatus="loaded";
  updateVisibleAccountIdentity();
  if(state.screen==="account"&&!state.accountIdentityDirty) renderAccount();
  return state.accountProfile;
}
async function saveAccountIdentityProfile(alias,avatarKey){
  const client=getSupabaseClient();
  if(!client||!isAppAuthenticated()) throw new Error("No hay una cuenta confirmada.");
  const ownerId=currentRoutineOwnerOrNull();
  const userId=state.syncUser.id;
  const normalizedAlias=normalizeAccountAlias(alias);
  const normalizedAvatar=validAccountAvatarKey(avatarKey);
  const {error}=await client.from("profiles").upsert({
    id:userId,
    alias:normalizedAlias||null,
    avatar_key:normalizedAvatar,
    updated_at:new Date().toISOString()
  },{onConflict:"id"});
  assertActiveLocalOwner(ownerId);
  if(state.syncUser?.id!==userId) throw new Error("owner_changed");
  if(error) throw error;
  state.accountProfile={alias:normalizedAlias,avatarKey:normalizedAvatar};
  state.accountProfileStatus="loaded";
  state.accountIdentityDirty=false;
  updateVisibleAccountIdentity();
  return state.accountProfile;
}
function isEmailConfirmed(user){
  return Boolean(user?.email_confirmed_at||user?.confirmed_at);
}
function isAppAuthenticated(){
  return Boolean(!state.passwordRecoveryMode&&state.syncSession&&isEmailConfirmed(state.syncUser));
}
const RECOVERY_AUTH_REFRESH_EVENTS=new Set(["SIGNED_IN","TOKEN_REFRESHED","USER_UPDATED"]);
const RECOVERY_SESSION_ERROR_CODES=new Set([
  "session_not_found","not_authenticated","refresh_token_not_found",
  "user_not_found","jwt_expired"
]);
function invalidateRecoveryDerivedState({reason="state_changed",renderCurrent=true}={}){
  const authenticated=isAppAuthenticated();
  const recoveryErrorCode=String(state.recoveryMessage?.code||"").toLowerCase();
  if(authenticated&&RECOVERY_SESSION_ERROR_CODES.has(recoveryErrorCode)){
    state.recoveryMessage=null;
  }
  if(!renderCurrent) return {reason,authenticated};
  if(state.screen==="home"){
    renderHome();
  }else if(state.screen==="recovery"){
    window.GymOSRecovery?.renderRecoveryCenter?.();
  }
  return {reason,authenticated};
}
function resolveAuthenticatedAppState(session,pendingUser=null){
  const previousAuthorizedUserId=isAppAuthenticated()?state.syncUser?.id:null;
  const user=session?.user||(pendingUser&&!isEmailConfirmed(pendingUser)?pendingUser:null);
  const confirmed=Boolean(session&&isEmailConfirmed(user));

  state.syncSession=session||null;
  state.syncUser=user;
  state.authResolved=true;
  if(!confirmed) state.syncStatus="configured";

  if(state.passwordRecoveryMode){
    state.syncStatus="configured";
    return "password-recovery";
  }
  if(confirmed){
    if(user.id!==previousAuthorizedUserId){
      activateLocalUser(user.id);
      state.syncStatus=navigator.onLine?"pending":"offline";
      state.syncIssue=navigator.onLine?null:{kind:"offline",retryable:true};
    }else if(!navigator.onLine){
      state.syncStatus="offline";
      state.syncIssue={kind:"offline",retryable:true};
    }
    scheduleAccountProfileLoad(user.id);
    return "authenticated";
  }
  if(previousAuthorizedUserId) deactivateLocalUser();
  if(!user){
    state.accountProfile=null;
    state.accountProfileUserId=null;
    state.accountProfileStatus="idle";
    state.accountIdentityDirty=false;
    state.accountManagementMessage=null;
    state.accountPasswordEditorOpen=false;
    state.accountPasswordMessage=null;
    state.accountPasswordReauthRequired=false;
  }
  if(user&&!isEmailConfirmed(user)) return "email-verification";
  return "signed-out";
}
function hasLocalUserData(){
  let storedRoutine=null,storedCanonical=null;
  try{storedRoutine=JSON.parse(localStorage.getItem("gymos:routine")||"null");}
  catch(_){}
  try{storedCanonical=JSON.parse(localStorage.getItem(CANONICAL_ROUTINE_KEY)||"null");}
  catch(_){}
  return getHistory().length>0||
    getBodyHistory().length>0||
    getNutritionEntries().length>0||
    getHealthEntries().length>0||
    Object.values(storedRoutine||{}).some(items=>Array.isArray(items)&&items.length>0)||
    Boolean(storedCanonical?.sessions?.some(session=>
      Array.isArray(session?.exercises)&&session.exercises.length>0
    ));
}
function localMigrationStatus(){
  return localStorage.getItem("gymos:accountMigrationStatus")||"pending";
}
function setLocalMigrationStatus(value){
  localStorage.setItem("gymos:accountMigrationStatus",value);
}
async function signUpWithPassword(email,password,fullName){
  const client=getSupabaseClient();
  if(!client) throw new Error("Configura Supabase antes de crear una cuenta.");
  const {data,error}=await client.auth.signUp({
    email,
    password,
    options:{
      data:{full_name:fullName.trim()},
      emailRedirectTo:GYMOS_PRODUCTION_URL
    }
  });
  if(error) throw error;
  resolveAuthenticatedAppState(data.session,data.user);
  return data;
}
async function signInWithPassword(email,password){
  const client=getSupabaseClient();
  if(!client) throw new Error("Configura Supabase antes de iniciar sesión.");
  const {data,error}=await client.auth.signInWithPassword({email,password});
  if(error) throw error;
  resolveAuthenticatedAppState(data.session);
  return data;
}
async function signInWithGoogle(){
  const client=getSupabaseClient();
  if(!client) throw new Error("Configura Supabase antes de iniciar sesión.");
  const {error}=await client.auth.signInWithOAuth({
    provider:"google",
    options:{redirectTo:GYMOS_PRODUCTION_URL}
  });
  if(error) throw error;
}
async function requestPasswordReset(email){
  const client=getSupabaseClient();
  if(!client) throw new Error("Configura Supabase antes de recuperar la contraseña.");
  const {error}=await client.auth.resetPasswordForEmail(email, {
    redirectTo: "https://apl00028.github.io/mi-rutina/"
  });
  if(error) throw error;
}
async function migrateLocalDataToAccount(){
  if(!isAppAuthenticated()) throw new Error("Confirma tu correo antes de migrar los datos.");
  const result=await syncNow({forceUpload:true});
  setLocalMigrationStatus("completed");
  localStorage.setItem("gymos:accountMigrationAt",new Date().toISOString());
  return result;
}
async function deleteCloudData(){
  const client=getSupabaseClient();
  if(!client||!isAppAuthenticated()) throw new Error("No hay una cuenta confirmada.");
  const {error}=await client.rpc("gymos_sync_delete_own");
  if(error) throw error;
  const userId=state.syncUser.id;
  await client.from("profiles").delete().eq("id",userId);
  return true;
}
async function requestAccountDeletion(){
  const client=getSupabaseClient();
  if(!client||!isAppAuthenticated()) throw new Error("No hay una cuenta confirmada.");
  const {error}=await client.from("account_deletion_requests").insert({
    user_id:state.syncUser.id,
    requested_at:new Date().toISOString(),
    status:"pending"
  });
  if(error) throw error;
}
function accountSecuritySummary(){
  return {
    authenticated:isAppAuthenticated(),
    userId:state.syncUser?.id||null,
    emailVerified:isEmailConfirmed(state.syncUser),
    rlsRequired:true,
    publicKeyConfigured:Boolean(getSyncConfig().key),
    secretKeyInClient:false
  };
}

let supabaseClient=null;
let supabaseClientConfig="";
let authStateSubscription=null;
function getSupabaseClient(){
  const config=getSyncConfig();
  if(!config.url||!config.key) return null;
  if(typeof supabase==="undefined") return null;
  const clientConfig=`${config.url}|${config.key}`;
  if(supabaseClient&&supabaseClientConfig===clientConfig) return supabaseClient;
  try{
    authStateSubscription?.unsubscribe?.();
    authStateSubscription=null;
    supabaseClient=supabase.createClient(config.url,config.key,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
    });
    supabaseClientConfig=clientConfig;
    ensureAuthStateListener(supabaseClient);
    return supabaseClient;
  }catch(error){
    return null;
  }
}
async function fetchAiConfigurationStatus(check=false){
  try{
    const data=await coachBackendFetch(`/ai/status${check?"?check=true":""}`,{method:"GET"});
    const connection={
      ...getCoachConnection(),
      aiEnabled:Boolean(data.enabled),
      provider:String(data.provider||"rules"),
      model:data.model||null,
      aiStatus:String(data.status||"not_configured"),
      aiCheckedAt:new Date().toISOString(),
      aiError:null
    };
    saveCoachConnection(connection);
    return connection;
  }catch(error){
    const connection={
      ...getCoachConnection(),
      aiStatus:"error",
      aiCheckedAt:new Date().toISOString(),
      aiError:error.message
    };
    saveCoachConnection(connection);
    throw error;
  }
}
function aiProviderLabel(provider){
  return {rules:"Reglas de GymOS",gemini:"Gemini",openai:"OpenAI",ollama:"Ollama local"}[provider]||"No configurado";
}
function aiStatusLabel(status,userEnabled=getCoachSettings().aiEnabled){
  if(!userEnabled) return "Desactivado";
  return {connected:"Conectado",error:"Error",not_configured:"No configurado",disabled:"Desactivado",unknown:"No comprobado"}[status]||"No comprobado";
}
function ensureAuthStateListener(client){
  if(authStateSubscription) return;
  const {data:listener}=client.auth.onAuthStateChange((event,session)=>{
    if(event==="PASSWORD_RECOVERY"){
      if(isAppAuthenticated()) deactivateLocalUser();
      state.passwordRecoveryMode=true;
      state.passwordRecoveryMessage=null;
    }
    resolveAuthenticatedAppState(session);
    if(RECOVERY_AUTH_REFRESH_EVENTS.has(event)){
      invalidateRecoveryDerivedState({reason:event,renderCurrent:false});
    }
    if(event==="SIGNED_OUT"&&!state.passwordRecoveryMode){
      state.screen="account";
    }
    updateSyncIndicators();
    queueMicrotask(()=>render());
  });
  authStateSubscription=listener.subscription;
}
async function refreshSyncSession(){
  const client=getSupabaseClient();
  if(!client){
    if(!AUTH_REQUIRED) activateLocalUser("local");
    resolveAuthenticatedAppState(null);
    state.syncStatus="local";
    return null;
  }
  try{
    ensureAuthStateListener(client);
    const params=new URLSearchParams(location.search);
    const code=params.get("code");
    if(code){
      const {error:exchangeError}=await client.auth.exchangeCodeForSession(code);
      if(exchangeError) throw exchangeError;
      history.replaceState({},document.title,GYMOS_PRODUCTION_URL);
    }
    const {data,error}=await client.auth.getSession();
    if(error) throw error;
    state.authRedirectInProgress=false;
    resolveAuthenticatedAppState(data.session);
    return state.syncUser;
  }catch(error){
    console.error("GymOS auth error",{code:error?.code||"auth_failed",status:error?.status||null});
    state.authRedirectInProgress=false;
    resolveAuthenticatedAppState(null);
    const issue=classifySyncError(error);
    state.syncStatus=issue.status;
    state.syncIssue=issue;
    return null;
  }
}
async function resendEmailConfirmation(email){
  const client=getSupabaseClient();
  if(!client) throw new Error("Supabase no está configurado.");
  if(!email) throw new Error("No se ha podido identificar el correo de la cuenta.");
  const {error}=await client.auth.resend({type:"signup",email});
  if(error) throw error;
}
async function refreshEmailConfirmation(){
  const client=getSupabaseClient();
  if(!client) throw new Error("Supabase no está configurado.");
  const {data:refreshData,error:refreshError}=await client.auth.refreshSession();
  if(refreshError) throw refreshError;
  const {data:userData,error:userError}=await client.auth.getUser();
  if(userError) throw userError;
  const session=refreshData.session
    ?{...refreshData.session,user:userData.user}
    :state.syncSession
      ?{...state.syncSession,user:userData.user}
      :null;
  return resolveAuthenticatedAppState(session,userData.user);
}
async function sendMagicLink(email){
  const client=getSupabaseClient();
  if(!client) throw new Error("Configura primero Supabase.");
  const redirectTo=GYMOS_PRODUCTION_URL;
  const {error}=await client.auth.signInWithOtp({
    email,
    options:{emailRedirectTo:redirectTo}
  });
  if(error) throw error;
}
async function signOutSync(){
  const client=getSupabaseClient();
  if(client) await client.auth.signOut();
  resolveAuthenticatedAppState(null);
}
function bodyMeasurementToDatabase(row,userId=state.syncUser?.id){
  const normalized=normalizeBodyMeasurement(row);
  const record={
    id:normalized.id,
    user_id:userId,
    measured_at:normalized.date,
    notes:normalized.notes||null,
    created_at:normalized.createdAt,
    updated_at:normalized.updatedAt
  };
  BODY_METRIC_KEYS.forEach(key=>{record[BODY_METRICS[key].db]=normalized[key];});
  return record;
}
function bodyMeasurementFromDatabase(row,index=0){
  const local={
    id:row.id,date:row.measured_at,notes:row.notes,
    createdAt:row.created_at,updatedAt:row.updated_at
  };
  BODY_METRIC_KEYS.forEach(key=>{local[key]=row[BODY_METRICS[key].db];});
  return normalizeBodyMeasurement(local,index);
}
function bodyMeasurementsTableMissing(error){
  return ["42P01","PGRST205"].includes(error?.code);
}
async function syncBodyMeasurementsWithSupabase(){
  const client=getSupabaseClient();
  if(!client||!isAppAuthenticated()) return;
  const ownerId=currentRoutineOwnerOrNull();
  const userId=state.syncUser.id;
  const assertOwner=()=>{
    assertActiveLocalOwner(ownerId);
    if(state.syncUser?.id!==userId) throw new Error("owner_changed");
  };
  const {data,error}=await client.from("body_measurements").select("*").eq("user_id",userId);
  assertOwner();
  if(error){
    if(bodyMeasurementsTableMissing(error)){
      console.warn("Body measurements table is not installed; using encrypted user sync payload.");
      return;
    }
    throw error;
  }
  const merged=new Map();
  getBodyHistory().forEach(row=>merged.set(String(row.id),row));
  (data||[]).map(bodyMeasurementFromDatabase).forEach(remote=>{
    const local=merged.get(String(remote.id));
    if(!local||new Date(remote.updatedAt)>=new Date(local.updatedAt)) merged.set(String(remote.id),remote);
  });
  const rows=[...merged.values()].sort((a,b)=>new Date(a.date)-new Date(b.date));
  assertOwner();
  saveBodyHistory(rows,{markUpdated:false});
  if(!rows.length) return;
  assertOwner();
  const {error:writeError}=await client.from("body_measurements").upsert(
    rows.map(row=>bodyMeasurementToDatabase(row,userId)),
    {onConflict:"id,user_id"}
  );
  assertOwner();
  if(writeError&&!bodyMeasurementsTableMissing(writeError)) throw writeError;
}
async function deleteBodyMeasurementRemote(id){
  const client=getSupabaseClient();
  if(!client||!isAppAuthenticated()) return;
  const ownerId=currentRoutineOwnerOrNull();
  const userId=state.syncUser.id;
  try{
    const {error}=await client.from("body_measurements").delete().eq("id",String(id)).eq("user_id",userId);
    assertActiveLocalOwner(ownerId);
    if(state.syncUser?.id!==userId) throw new Error("owner_changed");
    if(error&&!bodyMeasurementsTableMissing(error)) throw error;
  }catch(error){
    console.error("Body measurement deletion",error);
    toast("El registro se eliminó localmente; la nube se actualizará después.");
  }
}
function syncConflictError(kind="sync_conflict"){
  const error=new Error(kind);
  error.code=kind;
  return error;
}
function setSyncConflictState(kind,details={}){
  state.syncStatus="conflict";
  state.syncIssue={kind,retryable:false,details};
  if(state.workoutDraftMemory){
    state.workoutDraftSaveStatus="conflict";
    updateWorkoutSaveIndicator();
  }
  updateSyncIndicators();
  addSyncAudit("conflict",kind,details);
  return {direction:"conflict",kind,details};
}
async function writeSyncEnvelopeWithCas(client,userId,envelope,baseRevision,remoteExists,expectedRemoteChecksum=null){
  void userId;
  const expectedChecksum=remoteExists?expectedRemoteChecksum:null;
  if(remoteExists&&!expectedChecksum) throw syncConflictError("sync_conflict");
  if(!remoteExists&&Number(baseRevision)!==0) throw syncConflictError("sync_conflict");
  const {data,error}=await client.rpc("gymos_sync_compare_and_swap",{
    expected_revision:Number(baseRevision)||0,
    expected_checksum:expectedChecksum,
    new_revision:Number(envelope.revision)||0,
    new_device_id:envelope.deviceId,
    new_checksum:envelope.checksum,
    new_payload:envelope.payload
  });
  if(error){
    if(error.code==="23505"||error.status===409||error.code==="sync_conflict") throw syncConflictError("sync_conflict");
    throw error;
  }
  const row=Array.isArray(data)?data[0]:data;
  if(!row?.success) throw syncConflictError("sync_conflict");
  return {revision:Number(row.revision||envelope.revision),checksum:row.checksum||envelope.checksum};
}

const SYNC_RECOVERY_EXPECTED_REMOTE=Object.freeze({
  revision:915,
  checksum:"a585090d"
});
const SYNC_ADOPTION_EXPECTED_REMOTE=Object.freeze({
  revision:913,
  checksum:"759d936c",
  routineId:"routine-02488c9c-d38e-4b59-8814-f7e0bcbd7d5e",
  selectedSessionId:"roadmap-2026-08-a",
  syncProtocolVersion:2
});
const SYNC_ADOPTION_EXPECTED_LOCAL=Object.freeze({
  syncBaseRevision:912,
  syncPending:true
});
const SYNC_RECOVERY_EXPECTED_LOCAL=Object.freeze({
  routineId:"routine-02488c9c-d38e-4b59-8814-f7e0bcbd7d5e",
  selectedSessionId:"roadmap-2026-08-a",
  routineHash:"223f0a1a",
  historyHash:"c2248975",
  syncPending:false
});
const SYNC_RECOVERY_CANDIDATE_REVISION=916;
const SYNC_RECOVERY_CONFIRMATION_TEXT="PROMOVER ESTE PC";
const SYNC_ADOPTION_CONFIRMATION_TEXT="ADOPTAR ESTADO DE LA NUBE";

function recoveryError(code,details={}){
  const error=new Error(code);
  error.code=code;
  error.details=details;
  return error;
}
function downloadJsonFile(payload,filePrefix){
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  const stamp=new Date().toISOString().replace(/[:.]/g,"-");
  link.href=url;
  link.download=`${filePrefix}-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
function captureGymOSLocalStorageSnapshot(){
  const snapshot={};
  for(let index=0;index<localStorage.length;index+=1){
    const key=localStorage.key(index);
    if(key?.startsWith("gymos:")) snapshot[key]=localStorage.getItem(key);
  }
  return snapshot;
}
function restoreGymOSLocalStorageSnapshot(snapshot){
  const current=[];
  for(let index=0;index<localStorage.length;index+=1){
    const key=localStorage.key(index);
    if(key?.startsWith("gymos:")) current.push(key);
  }
  current.forEach(key=>{
    if(!Object.prototype.hasOwnProperty.call(snapshot,key)) localStorage.removeItem(key);
  });
  Object.entries(snapshot).forEach(([key,value])=>restoreStorageValue(key,value));
}
async function readCurrentRemoteSyncRow(){
  const client=getSupabaseClient();
  if(!client||!isAppAuthenticated()) throw recoveryError("recovery_not_authenticated");
  const {data,error}=await client.from("gymos_sync")
    .select("payload,revision,device_id,updated_at,checksum")
    .eq("user_id",state.syncUser.id)
    .maybeSingle();
  if(error) throw error;
  return data||null;
}
function buildRemoteSyncRecoveryBackup(row,userId=state.syncUser?.id||null){
  return {
    app:"GymOS",
    type:"remoteSyncRecoveryBackup",
    exportedAt:new Date().toISOString(),
    userId,
    row:row?{
      payload:row.payload,
      revision:row.revision,
      device_id:row.device_id,
      updated_at:row.updated_at,
      checksum:row.checksum
    }:null
  };
}
async function downloadRemoteSyncRecoveryBackup(){
  const row=await readCurrentRemoteSyncRow();
  downloadJsonFile(buildRemoteSyncRecoveryBackup(row),"gymos-remote-sync-backup");
  return row;
}
function assertRecoveryRemoteExpected(row){
  const revision=Number(row?.revision||0);
  const checksum=row?.checksum||null;
  if(revision!==SYNC_RECOVERY_EXPECTED_REMOTE.revision){
    throw recoveryError("recovery_remote_changed",{
      expectedRevision:SYNC_RECOVERY_EXPECTED_REMOTE.revision,
      actualRevision:revision
    });
  }
  if(checksum!==SYNC_RECOVERY_EXPECTED_REMOTE.checksum){
    throw recoveryError("recovery_remote_changed",{
      expectedChecksum:SYNC_RECOVERY_EXPECTED_REMOTE.checksum,
      actualChecksum:checksum
    });
  }
}
function assertAdoptionRemoteExpected(row){
  const summary=remoteSyncDiagnosticFromRow(row);
  const protocolVersion=Number(row?.payload?.syncProtocolVersion||0);
  for(const [field,expected] of Object.entries({
    revision:SYNC_ADOPTION_EXPECTED_REMOTE.revision,
    checksum:SYNC_ADOPTION_EXPECTED_REMOTE.checksum,
    routineId:SYNC_ADOPTION_EXPECTED_REMOTE.routineId,
    selectedSessionId:SYNC_ADOPTION_EXPECTED_REMOTE.selectedSessionId
  })){
    if(summary[field]!==expected){
      throw recoveryError("recovery_remote_changed",{
        field,expected,actual:summary[field]
      });
    }
  }
  if(protocolVersion!==SYNC_ADOPTION_EXPECTED_REMOTE.syncProtocolVersion){
    throw recoveryError("recovery_remote_changed",{
      field:"syncProtocolVersion",
      expected:SYNC_ADOPTION_EXPECTED_REMOTE.syncProtocolVersion,
      actual:protocolVersion
    });
  }
  return summary;
}
function assertAdoptionLocalExpected(snapshot=localSyncDiagnosticSnapshot()){
  if(snapshot.syncBaseRevision!==SYNC_ADOPTION_EXPECTED_LOCAL.syncBaseRevision){
    throw recoveryError("recovery_local_changed",{
      field:"syncBaseRevision",
      expected:SYNC_ADOPTION_EXPECTED_LOCAL.syncBaseRevision,
      actual:snapshot.syncBaseRevision
    });
  }
  if(snapshot.syncPending!==SYNC_ADOPTION_EXPECTED_LOCAL.syncPending){
    throw recoveryError("recovery_local_changed",{
      field:"syncPending",
      expected:SYNC_ADOPTION_EXPECTED_LOCAL.syncPending,
      actual:snapshot.syncPending
    });
  }
  return snapshot;
}
function assertRecoveryLocalExpected(snapshot=localSyncDiagnosticSnapshot()){
  for(const key of ["routineId","selectedSessionId","routineHash","historyHash"]){
    if(snapshot[key]!==SYNC_RECOVERY_EXPECTED_LOCAL[key]){
      throw recoveryError("recovery_local_changed",{
        field:key,expected:SYNC_RECOVERY_EXPECTED_LOCAL[key],actual:snapshot[key]
      });
    }
  }
  if(snapshot.syncPending!==SYNC_RECOVERY_EXPECTED_LOCAL.syncPending){
    throw recoveryError("recovery_local_changed",{
      field:"syncPending",expected:SYNC_RECOVERY_EXPECTED_LOCAL.syncPending,
      actual:snapshot.syncPending
    });
  }
  if(!snapshot.deviceId){
    throw recoveryError("recovery_local_changed",{field:"deviceId",expected:"present",actual:null});
  }
  return snapshot;
}
async function promoteLocalDeviceAsCanonicalSyncHead(){
  const client=getSupabaseClient();
  if(!client||!isAppAuthenticated()) throw recoveryError("recovery_not_authenticated");
  const userId=state.syncUser.id;
  assertRecoveryLocalExpected();
  const syncData=buildSyncPayload();
  const row=await readCurrentRemoteSyncRow();
  assertRecoveryRemoteExpected(row);
  assertRecoveryLocalExpected();
  const envelope={
    schemaVersion:SYNC_PROTOCOL_VERSION,
    revision:SYNC_RECOVERY_CANDIDATE_REVISION,
    parentRevision:SYNC_RECOVERY_EXPECTED_REMOTE.revision,
    deviceId:localStorage.getItem(DEVICE_ID_KEY),
    updatedAt:new Date().toISOString(),
    checksum:simpleChecksum(syncData),
    payload:{
      ...syncData,
      syncProtocolVersion:SYNC_PROTOCOL_VERSION,
      syncParentRevision:SYNC_RECOVERY_EXPECTED_REMOTE.revision
    }
  };
  await writeSyncEnvelopeWithCas(
    client,userId,envelope,SYNC_RECOVERY_EXPECTED_REMOTE.revision,true,
    SYNC_RECOVERY_EXPECTED_REMOTE.checksum
  );
  setLocalRevision(SYNC_RECOVERY_CANDIDATE_REVISION);
  setLastRemoteRevision(SYNC_RECOVERY_CANDIDATE_REVISION);
  setSyncBaseRevision(SYNC_RECOVERY_CANDIDATE_REVISION);
  markSyncProtocolCurrent();
  localStorage.removeItem("gymos:syncPending");
  localStorage.setItem("gymos:lastSyncAt",new Date().toISOString());
  state.syncStatus="synced";
  state.syncIssue=null;
  updateSyncIndicators();
  return {
    direction:"recovery_upload",
    revision:SYNC_RECOVERY_CANDIDATE_REVISION,
    checksum:envelope.checksum
  };
}
async function adoptCanonicalRemoteSyncHeadOnThisDevice(){
  if(!getSupabaseClient()||!isAppAuthenticated()) throw recoveryError("recovery_not_authenticated");
  assertAdoptionLocalExpected();
  const row=await readCurrentRemoteSyncRow();
  assertAdoptionRemoteExpected(row);
  assertAdoptionLocalExpected();
  const snapshot=captureGymOSLocalStorageSnapshot();
  const localDeviceId=localStorage.getItem(DEVICE_ID_KEY);
  try{
    applySyncPayload(row.payload||{});
  }catch(error){
    restoreGymOSLocalStorageSnapshot(snapshot);
    throw recoveryError("recovery_local_apply_failed",{
      cause:error?.code||error?.message||String(error)
    });
  }
  restoreStorageValue(DEVICE_ID_KEY,localDeviceId);
  setLocalRevision(SYNC_ADOPTION_EXPECTED_REMOTE.revision);
  setLastRemoteRevision(SYNC_ADOPTION_EXPECTED_REMOTE.revision);
  setSyncBaseRevision(SYNC_ADOPTION_EXPECTED_REMOTE.revision);
  markSyncProtocolCurrent();
  localStorage.removeItem("gymos:syncPending");
  localStorage.setItem("gymos:lastSyncHash",SYNC_ADOPTION_EXPECTED_REMOTE.checksum);
  localStorage.setItem("gymos:lastSyncAt",new Date().toISOString());
  state.syncStatus="synced";
  state.syncIssue=null;
  updateSyncIndicators();
  return {direction:"recovery_download",revision:SYNC_ADOPTION_EXPECTED_REMOTE.revision};
}
async function syncNow(options={}){
  if(isSyncDebugRequested()) return {direction:"diagnostic_mode"};
  const client=getSupabaseClient();
  if(!client||!isAppAuthenticated()) throw new Error("Confirma tu correo antes de sincronizar.");
  if(state.syncInProgress) return {direction:"busy"};
  const diagnosticLog=typeof syncDiagnosticLog==="function"
    ?syncDiagnosticLog
    :()=>{};
  const diagnosticError=typeof sanitizeSyncError==="function"
    ?sanitizeSyncError
    :error=>({code:error?.code||null,status:error?.status||null,message:error?.message||String(error)});
  const diagnosticDeviceId=typeof getDeviceId==="function"?getDeviceId():null;
  const ownerId=currentRoutineOwnerOrNull();
  const userId=state.syncUser.id;
  diagnosticLog("inicio",{
    ownerId,deviceId:diagnosticDeviceId,localRevision:getLocalRevision(),
    lastRemoteRevision:getLastRemoteRevision(),
    syncPending:localStorage.getItem("gymos:syncPending")==="1"
  });
  const assertOwner=()=>{
    assertActiveLocalOwner(ownerId);
    if(state.syncUser?.id!==userId) throw new Error("owner_changed");
  };
  state.syncInProgress=true;
  const operationId=++state.syncOperationId;
  state.syncIssue=null;
  state.syncStatus="syncing";updateSyncIndicators();addSyncAudit("sync","started");
  try{
    await window.GymOSRecovery?.syncWithSupabase?.();
    assertOwner();
    await window.GymOSProfessionalNutrition?.syncWithSupabase?.();
    assertOwner();
    await syncBodyMeasurementsWithSupabase();
    assertOwner();
    await window.GymOSWorkoutAnalysis?.syncWithSupabase?.();
    assertOwner();
    const {data:remote,error:readError}=await client.from("gymos_sync").select("payload,revision,device_id,updated_at,checksum").eq("user_id",userId).maybeSingle();
    assertOwner();
    if(readError) throw readError;
    diagnosticLog("revisión remota",{
      localRevision:getLocalRevision(),lastRemoteRevision:getLastRemoteRevision(),
      remoteRevision:Number(remote?.revision||0),remoteDeviceId:remote?.device_id||null,
      remoteChecksum:remote?.checksum||null,
      syncPending:localStorage.getItem("gymos:syncPending")==="1"
    });
    const remoteRevision=Number(remote?.revision||0);
    const localRevision=getLocalRevision();
    const lastRemote=getLastRemoteRevision();
    const syncBaseRevision=getSyncBaseRevision();
    const localChecksum=simpleChecksum(buildSyncPayload());
    const hasPendingChanges=localStorage.getItem("gymos:syncPending")==="1";
    const remoteIsCurrent=isRemoteSyncProtocolCurrent(remote);
    const localIsCurrent=isLocalSyncProtocolCurrent();
    const sameRevisionDiverged=Boolean(
      remote&&!hasPendingChanges&&remoteRevision===localRevision&&
      remote.checksum&&remote.checksum!==localChecksum
    );
    const pendingBaseDiverged=Boolean(
      remote&&hasPendingChanges&&remoteRevision!==syncBaseRevision&&!options.forceUpload
    );
    const legacyDiverged=Boolean(
      remote&&!remoteIsCurrent&&remoteRevision!==lastRemote&&
      (hasPendingChanges||remoteRevision!==localRevision||remote.checksum!==localChecksum)&&
      !options.forceUpload
    );
    const unsafeDownload=Boolean(
      remote&&!hasPendingChanges&&remoteRevision>localRevision&&
      (!remoteIsCurrent||!localIsCurrent)&&!options.forceUpload
    );
    const localAheadWithoutPending=Boolean(
      remote&&!hasPendingChanges&&localRevision>remoteRevision&&!options.forceUpload
    );
    if(sameRevisionDiverged||pendingBaseDiverged||legacyDiverged||unsafeDownload||localAheadWithoutPending){
      diagnosticLog("decisión",{
        decision:"conflict",remoteRevision,localRevision,lastRemote,syncBaseRevision,
        hasPendingChanges,sameRevisionDiverged,pendingBaseDiverged,legacyDiverged,
        unsafeDownload,localAheadWithoutPending
      });
      const kind=legacyDiverged||unsafeDownload?"legacy_sync_conflict":"sync_conflict";
      return setSyncConflictState(kind,{
        remoteRevision,localRevision,lastRemote,syncBaseRevision
      });
    }else if(remote && remoteRevision>localRevision && !hasPendingChanges && remoteIsCurrent && localIsCurrent && !options.forceUpload){
      diagnosticLog("decisión",{decision:"download",reason:"remote_newer",remoteRevision,localRevision});
      applySyncPayload(remote.payload||{});
      diagnosticLog("payload remoto aplicado",{result:"ok",remoteRevision});
      setLocalRevision(remoteRevision);setLastRemoteRevision(remoteRevision);setSyncBaseRevision(remoteRevision);markSyncProtocolCurrent();
      localStorage.removeItem("gymos:syncPending");
      localStorage.setItem("gymos:lastSyncHash",remote.checksum||simpleChecksum(buildSyncPayload()));
      localStorage.setItem("gymos:lastSyncAt",new Date().toISOString());state.syncStatus="synced";state.syncIssue=null;addSyncAudit("sync","downloaded",{revision:remoteRevision});updateSyncIndicators();
      if(typeof markWorkoutProgressSynced==="function") markWorkoutProgressSynced();
      if(typeof invalidateRecoveryDerivedState==="function"){
        invalidateRecoveryDerivedState({reason:"sync_completed",renderCurrent:true});
      }
      return {direction:"download",revision:remoteRevision};
    }else if(remote&&!hasPendingChanges&&!options.forceUpload&&remoteRevision===localRevision&&remote.checksum===localChecksum){
      diagnosticLog("decisión",{decision:"no-op",remoteRevision,localRevision});
      setLastRemoteRevision(remoteRevision);
      setSyncBaseRevision(remoteRevision);
      if(remoteIsCurrent) markSyncProtocolCurrent();
      localStorage.setItem("gymos:lastSyncAt",new Date().toISOString());
      localStorage.setItem("gymos:lastSyncHash",localChecksum);
      state.syncStatus="synced";
      state.syncIssue=null;
      updateSyncIndicators();
      if(typeof markWorkoutProgressSynced==="function") markWorkoutProgressSynced();
      if(typeof invalidateRecoveryDerivedState==="function"){
        invalidateRecoveryDerivedState({reason:"sync_completed",renderCurrent:true});
      }
      return {direction:"none",revision:remoteRevision};
    }
    assertOwner();
    const baseRevision=remote?syncBaseRevision:0;
    if(remote&&baseRevision!==remoteRevision&&!options.forceUpload){
      diagnosticLog("decisión",{decision:"conflict",reason:"cas_base_mismatch",remoteRevision,baseRevision});
      return setSyncConflictState("sync_conflict",{remoteRevision,baseRevision});
    }
    const candidateRevision=baseRevision+1;
    const envelope=buildSyncEnvelope(baseRevision,candidateRevision);
    diagnosticLog("decisión",{
      decision:"upload",remoteRevision,localRevision,
      nextRevision:envelope.revision,hasPendingChanges,forceUpload:Boolean(options.forceUpload)
    });
    await writeSyncEnvelopeWithCas(client,userId,envelope,baseRevision,Boolean(remote),remote?.checksum||null);
    assertOwner();
    diagnosticLog("payload subido",{result:"ok",revision:envelope.revision,checksum:envelope.checksum});
    setLocalRevision(envelope.revision);
    setLastRemoteRevision(envelope.revision);
    setSyncBaseRevision(envelope.revision);
    markSyncProtocolCurrent();
    localStorage.removeItem("gymos:syncPending");
    localStorage.setItem("gymos:lastSyncHash",envelope.checksum);
    localStorage.setItem("gymos:lastSyncAt",new Date().toISOString());
    state.syncStatus="synced";state.syncIssue=null;
    addSyncAudit("sync","uploaded",{revision:envelope.revision});updateSyncIndicators();
    if(typeof markWorkoutProgressSynced==="function") markWorkoutProgressSynced();
    if(typeof invalidateRecoveryDerivedState==="function"){
      invalidateRecoveryDerivedState({reason:"sync_completed",renderCurrent:true});
    }
    return {direction:"upload",revision:envelope.revision};
  }catch(error){
    diagnosticLog("error",diagnosticError(error));
    if(currentRoutineOwnerOrNull()===ownerId&&state.syncUser?.id===userId){
      const issue=classifySyncError(error);
      state.syncStatus=issue.status;
      state.syncIssue=issue;
      if(state.workoutDraftMemory){
        state.workoutDraftSaveStatus=issue.status==="offline"?"saved_local":"pending_sync";
        updateWorkoutSaveIndicator();
        const workoutFailure=workoutPersistenceError(
          "remote_sync_failed","supabase_sync",error
        );
        if(state.screen==="workout") handleWorkoutPersistenceFailure(workoutFailure);
        else logWorkoutPersistenceError(workoutFailure);
      }
      addSyncAudit("sync",issue.status,{
        code:error?.code||"sync_failed",status:error?.status||null
      });updateSyncIndicators();
    }
    throw error;
  }finally{
    if(state.syncOperationId===operationId) state.syncInProgress=false;
  }
}

async function autoSync(reason="automática"){
  if(isSyncDebugRequested()) return;
  if(!isAppAuthenticated()||!navigator.onLine||state.syncInProgress) return;
  const recoveryBefore=window.GymOSRecovery?.dueCheckin?.()?.id||"";
  try{
    await syncNow({silent:true});
  }catch(_){
    return;
  }
  const recoveryAfter=window.GymOSRecovery?.dueCheckin?.()?.id||"";
  if(state.screen==="home"&&recoveryBefore!==recoveryAfter) renderHome();
}
function updateSyncIndicators(){
  document.querySelectorAll("[data-sync-label]").forEach(el=>el.textContent=syncStatusLabel());
  document.querySelectorAll("[data-sync-dot]").forEach(el=>el.className=`sync-dot ${state.syncStatus}`);
  document.querySelectorAll("[data-sync-description]").forEach(el=>el.textContent=syncStatusDescription());
  document.querySelectorAll("[data-last-sync]").forEach(el=>el.textContent=formatSyncDate(getLastSyncAt()));
}
function syncStatusLabel(){
  if(state.syncStatus==="syncing") return "Sincronizando…";
  if(state.syncStatus==="pending") return "Cambios pendientes";
  if(state.syncStatus==="offline") return "Sin conexión";
  if(state.syncStatus==="synced") return "Sincronizado";
  if(state.syncStatus==="connected") return "Cambios pendientes";
  if(state.syncStatus==="conflict") return "Conflicto de sincronización";
  if(state.syncStatus==="session_expired") return "Sesión caducada";
  if(state.syncStatus==="permission_denied") return "Permiso rechazado";
  if(state.syncStatus==="recoverable_error") return "Error recuperable";
  if(state.syncStatus==="error") return "Error de sincronización";
  if(state.syncStatus==="configured") return "Configurado, sin sesión";
  return "Solo en este dispositivo";
}
function classifySyncError(error){
  if(!navigator.onLine) return {status:"offline",kind:"offline",retryable:true};
  const code=String(error?.code||"").toLowerCase();
  const status=Number(error?.status||0);
  const message=String(error?.message||"").toLowerCase();
  if(["session_not_found","refresh_token_not_found","user_not_found","jwt_expired"].includes(code)||status===401||message.includes("jwt expired")){
    return {status:"session_expired",kind:"session",retryable:false};
  }
  if(code==="42501"||status===403||message.includes("row-level security")||message.includes("permission denied")){
    return {status:"permission_denied",kind:"permission",retryable:false};
  }
  if(code==="sync_conflict") return {status:"conflict",kind:"conflict",retryable:false};
  return {status:"recoverable_error",kind:"network",retryable:true};
}
function syncStatusDescription(){
  const descriptions={
    synced:"Tus cambios están guardados en este dispositivo y en la nube.",
    pending:"Hay cambios locales pendientes de enviar.",
    syncing:"GymOS está comprobando tus cambios.",
    offline:"Seguirás trabajando en este dispositivo. Se reintentará al recuperar Internet.",
    conflict:"Hay cambios distintos en dos dispositivos. Elige qué versión conservar desde Cuenta.",
    session_expired:"Vuelve a iniciar sesión para continuar sincronizando.",
    permission_denied:"No se pudo acceder a tus datos en la nube. Comprueba tu cuenta o vuelve a iniciar sesión.",
    recoverable_error:"No se ha perdido ningún cambio local. Puedes volver a intentarlo.",
    connected:"La sesión está iniciada, pero la sincronización aún no se ha comprobado.",
    configured:"Inicia sesión para sincronizar.",
    local:"Los datos se guardan únicamente en este dispositivo."
  };
  return descriptions[state.syncStatus]||"Estado de sincronización disponible.";
}
async function retrySyncFromNavigation(){
  if(state.syncInProgress||!navigator.onLine) return;
  state.syncStatus="syncing";
  state.syncIssue=null;
  render();
  try{
    await syncNow();
  }catch(_){}
  render();
}
function dateKey(value){
  const d=new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function mondayOf(date){
  const d=new Date(date);
  const day=(d.getDay()+6)%7;
  d.setDate(d.getDate()-day);
  d.setHours(0,0,0,0);
  return d;
}
function addDays(date,days){
  const d=new Date(date);
  d.setDate(d.getDate()+days);
  return d;
}
function workoutsInRange(start,end){
  return getHistory().filter(w=>{
    const d=new Date(w.date);
    return d>=start&&d<end;
  });
}
function weeklyProgress(reference=new Date()){
  const start=mondayOf(reference);
  const end=addDays(start,7);
  const count=workoutsInRange(start,end).length;
  const goal=getWeeklyGoal();
  return {
    start,end,count,goal,
    remaining:Math.max(0,goal-count),
    percentage:Math.min(100,Math.round((count/goal)*100))
  };
}
function adherenceWeeks(total=8){
  const currentStart=mondayOf(new Date());
  const goal=getWeeklyGoal();
  const weeks=[];
  for(let i=total-1;i>=0;i--){
    const start=addDays(currentStart,-7*i);
    const end=addDays(start,7);
    const count=workoutsInRange(start,end).length;
    weeks.push({
      start,end,count,goal,
      met:count>=goal,
      percentage:Math.min(100,Math.round((count/goal)*100))
    });
  }
  return weeks;
}
function completedWeekStreak(){
  const goal=getWeeklyGoal();
  let streak=0;
  let cursor=mondayOf(new Date());
  const currentCount=workoutsInRange(cursor,addDays(cursor,7)).length;
  if(currentCount<goal) cursor=addDays(cursor,-7);
  while(true){
    const count=workoutsInRange(cursor,addDays(cursor,7)).length;
    if(count<goal) break;
    streak++;
    cursor=addDays(cursor,-7);
    if(streak>260) break;
  }
  return streak;
}
function monthData(monthString){
  const [year,month]=monthString.split("-").map(Number);
  const first=new Date(year,month-1,1);
  const last=new Date(year,month,0);
  const leading=(first.getDay()+6)%7;
  const totalCells=Math.ceil((leading+last.getDate())/7)*7;
  const workouts={};
  getHistory().forEach(w=>{
    const key=dateKey(w.date);
    workouts[key]=(workouts[key]||0)+1;
  });
  const bodyDates=new Set(getBodyHistory().map(r=>dateKey(r.date)));
  const cells=[];
  for(let i=0;i<totalCells;i++){
    const day=i-leading+1;
    if(day<1||day>last.getDate()){
      cells.push(null);
      continue;
    }
    const date=new Date(year,month-1,day);
    const key=dateKey(date);
    cells.push({
      day,key,
      workouts:workouts[key]||0,
      body:bodyDates.has(key),
      today:key===dateKey(new Date())
    });
  }
  return {year,month,first,last,cells};
}
function monthLabel(monthString){
  const [year,month]=monthString.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES",{month:"long",year:"numeric"}).format(new Date(year,month-1,1));
}
function shiftMonth(monthString,delta){
  const [year,month]=monthString.split("-").map(Number);
  const d=new Date(year,month-1+delta,1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function nextSuggestedSession(){
  const canonical=getCanonicalRoutine();
  if(!canonical){
    const available=availableRoutineSessions();
    if(!available.length) return "A";
    const history=JSON.parse(localStorage.getItem("gymos:history")||"[]");
    if(!history.length||!available.includes(history[0].session)) return available[0];
    return available[(available.indexOf(history[0].session)+1)%available.length];
  }
  const id=routineSessionRuntimeApi().selectedSessionId({
    routine:canonical,history:getHistory()
  });
  const session=routineSessionRuntimeApi().sessionById(canonical,id);
  return session?.legacySessionKey||session?.label||"A";
}
function activeRoutineSessions(){
  const canonical=getCanonicalRoutine();
  if(canonical) return routineSessionRuntimeApi().orderedSessions(canonical);
  return ["A","B","C"].filter(key=>Array.isArray(sessions?.[key])&&sessions[key].length)
    .map((key,index)=>({
      sessionId:`legacy-${key}`,legacySessionKey:key,label:key,name:`Sesión ${key}`,
      focus:"",order:index+1,estimatedDurationMinutes:null,exercises:sessions[key]
    }));
}
function activeRoutineSession(sessionId=state?.selectedSessionId){
  const canonical=getCanonicalRoutine();
  if(canonical) return routineSessionRuntimeApi().sessionById(canonical,sessionId);
  return activeRoutineSessions().find(session=>
    session.sessionId===sessionId||session.legacySessionKey===state?.selectedSession
  )||null;
}
function activeRoutineForComparison(){
  return getCanonicalRoutine()||getRoutine();
}
function availableRoutineSessions(){
  return activeRoutineSessions().map(session=>session.sessionId);
}
function validSelectedRoutineSession(candidate){
  const canonical=getCanonicalRoutine();
  if(!canonical){
    const available=["A","B","C"].filter(key=>Array.isArray(sessions?.[key])&&sessions[key].length);
    return available.includes(candidate)?candidate:(available[0]||"A");
  }
  const byId=routineSessionRuntimeApi().sessionById(canonical,candidate);
  const byLegacy=routineSessionRuntimeApi().sessionByLegacyKey(canonical,candidate);
  const selected=byId||byLegacy||routineSessionRuntimeApi().orderedSessions(canonical)[0]||null;
  return selected?.legacySessionKey||selected?.label||"A";
}
function draftKey(s){ return `gymos:draft:${s}`; }
function compactWorkoutDraftShadow(draft,legacySession=null){
  return workoutProgressApi().compactLegacyShadow(draft,{
    session:legacySession??draft?.session??null
  });
}
function sanitizeWorkoutDraftContainer(container,{
  ownerId=currentRoutineOwnerOrNull(),
  canonicalRoutine=getCanonicalRoutine()
}={}){
  if(!container||typeof container!=="object"||Array.isArray(container)) return container;
  const next={...container,draftsBySessionId:{...(container.draftsBySessionId||{})}};
  let changed=false;
  Object.entries(next.draftsBySessionId).forEach(([sessionId,draft])=>{
    if(!draft||typeof draft!=="object"||draft.ownerId!==ownerId) return;
    const stripped=workoutProgressApi().stripLegacyRaw(draft);
    const session=canonicalRoutine?.sessions?.find(item=>item.sessionId===sessionId);
    const legacySession=session?.legacySessionKey||draft.session||null;
    const compactRaw=legacySession
      ?compactWorkoutDraftShadow(stripped.draft,legacySession)
      :null;
    const sanitized={
      ...stripped.draft,
      ...(compactRaw?{legacyRaw:compactRaw}: {})
    };
    if(!workoutProgressApi().same(draft,sanitized)){
      next.draftsBySessionId[sessionId]=sanitized;
      changed=true;
    }
  });
  return changed?next:container;
}
function sanitizeWorkoutStorageValue(key,value,{
  ownerId=currentRoutineOwnerOrNull(),
  canonicalRoutine=getCanonicalRoutine()
}={}){
  if(value===null||value===undefined) return value;
  if(key===CANONICAL_DRAFTS_KEY){
    const parsed=typeof value==="string"?JSON.parse(value):value;
    return JSON.stringify(sanitizeWorkoutDraftContainer(parsed,{
      ownerId,canonicalRoutine
    }));
  }
  if(/^gymos:draft:[ABC]$/.test(key)){
    const parsed=typeof value==="string"?JSON.parse(value):value;
    if(parsed?.ownerId&&parsed.ownerId!==ownerId) throw new Error("owner_mismatch");
    return compactWorkoutDraftShadow(parsed,key.slice(-1));
  }
  if(key?.startsWith(workoutProgressPrefix(ownerId))){
    const parsed=typeof value==="string"?JSON.parse(value):value;
    const clean=workoutProgressApi().stripLegacyRaw(parsed).draft;
    if(clean.ownerId!==ownerId) throw new Error("owner_mismatch");
    return JSON.stringify(clean);
  }
  return typeof value==="string"?value:JSON.stringify(value);
}
function sanitizeIncomingWorkoutPayload(payload,{
  ownerId=currentRoutineOwnerOrNull()
}={}){
  if(!payload||typeof payload!=="object"||Array.isArray(payload)) return payload;
  const canonicalRoutine=payload.canonicalRoutine||getCanonicalRoutine();
  const next={...payload};
  if(payload.canonicalDrafts){
    next.canonicalDrafts=sanitizeWorkoutDraftContainer(payload.canonicalDrafts,{
      ownerId,canonicalRoutine
    });
  }
  if(Array.isArray(payload.workoutProgress)){
    next.workoutProgress=payload.workoutProgress.map(record=>{
      if(record?.ownerId!==ownerId) return record;
      return workoutProgressApi().stripLegacyRaw(record).draft;
    });
  }
  if(payload.drafts&&typeof payload.drafts==="object"){
    next.drafts=Object.fromEntries(
      Object.entries(payload.drafts).map(([session,draft])=>[
        session,
        !draft||typeof draft!=="object"||Array.isArray(draft)
          ?draft
          :draft.ownerId&&draft.ownerId!==ownerId
          ?draft
          :workoutProgressApi().stripLegacyRaw(draft).draft
      ])
    );
  }
  return next;
}
let workoutClientInstanceId=null;
function getWorkoutClientInstanceId(){
  if(!workoutClientInstanceId) workoutClientInstanceId=secureSessionModelId("client");
  return workoutClientInstanceId;
}
function workoutProgressPrefix(ownerId){
  return `gymos:workoutProgress:${workoutProgressApi().ownerId(ownerId)}:`;
}
function storedWorkoutProgressRecords(ownerId=currentRoutineOwnerOrNull()){
  if(!ownerId) return [];
  const prefix=workoutProgressPrefix(ownerId);
  const records=[];
  for(let index=0;index<localStorage.length;index+=1){
    const key=localStorage.key(index);
    if(!key?.startsWith(prefix)) continue;
    const value=readStoredJson(key);
    if(value?.ownerId!==ownerId) continue;
    try{
      records.push(workoutProgressApi().normalizeDraft(
        workoutProgressApi().stripLegacyRaw(value).draft,{
          owner:ownerId,sessionId:value.sessionId,routineId:value.routineId,
          clientInstanceId:value.clientInstanceId||"stored"
        }
      ));
    }catch(error){
      console.warn("Workout progress record ignored",{
        code:error?.message||"invalid_workout_progress"
      });
    }
  }
  return records.sort((left,right)=>
    String(left.startedAt||"").localeCompare(String(right.startedAt||""))||
    String(left.workoutInstanceId||"").localeCompare(String(right.workoutInstanceId||""))
  );
}
function activeWorkoutProgressRecord(ownerId,sessionId){
  if(!ownerId||!sessionId) return null;
  const activeKey=workoutProgressApi().activeWorkoutStorageKey(ownerId,sessionId);
  const rawPointer=localStorage.getItem(activeKey);
  if(!rawPointer) return null;
  let pointer;
  try{
    const parsed=JSON.parse(rawPointer);
    pointer=workoutProgressApi().normalizePointer(parsed,{owner:ownerId,sessionId});
  }catch(error){
    try{
      pointer=workoutProgressApi().normalizePointer(rawPointer,{owner:ownerId,sessionId});
    }catch(pointerError){
      discardCorruptActiveWorkoutPointer(activeKey,{
        phase:"active_pointer_parse",cause:pointerError
      });
      return null;
    }
  }
  const workoutInstanceId=pointer.workoutInstanceId;
  const record=readStoredJson(workoutProgressApi().progressStorageKey(ownerId,workoutInstanceId));
  if(
    !record||record.ownerId!==ownerId||record.sessionId!==sessionId||
    record.workoutInstanceId!==workoutInstanceId||record.status==="finalized"||
    record.status==="discarded"
  ){
    discardCorruptActiveWorkoutPointer(activeKey,{
      phase:"active_pointer_target",
      cause:new Error("active_pointer_target_invalid")
    });
    return null;
  }
  return record;
}
function activeWorkoutPointerId(ownerId,sessionId){
  return activeWorkoutProgressRecord(ownerId,sessionId)?.workoutInstanceId||null;
}
const WORKOUT_PERSISTENCE_ERROR_CODES=new Set([
  "memory_update_failed",
  "local_progress_write_failed",
  "active_pointer_write_failed",
  "legacy_shadow_write_failed",
  "remote_sync_failed",
  "owner_mismatch",
  "invalid_workout_identity",
  "storage_quota",
  "migration_failed",
  "stale_operation",
  "corrupt_active_pointer"
]);
function isWorkoutStorageQuotaError(error){
  return error?.name==="QuotaExceededError"||error?.code===22||error?.code===1014;
}
function workoutPersistenceError(code,phase,cause=null){
  const normalizedCode=WORKOUT_PERSISTENCE_ERROR_CODES.has(code)
    ?code:"local_progress_write_failed";
  const error=new Error(normalizedCode);
  error.name="WorkoutPersistenceError";
  error.code=normalizedCode;
  error.phase=phase||"unknown";
  if(cause&&cause!==error) error.cause=cause;
  return error;
}
function classifyWorkoutPersistenceError(error,{
  fallback="local_progress_write_failed",phase="unknown"
}={}){
  if(error?.name==="WorkoutPersistenceError"&&WORKOUT_PERSISTENCE_ERROR_CODES.has(error.code)){
    return error;
  }
  if(isWorkoutStorageQuotaError(error)){
    return workoutPersistenceError("storage_quota",phase,error);
  }
  const raw=String(error?.code||error?.message||"");
  if(["owner_changed","owner_mismatch","owner_not_active","invalid_owner"].includes(raw)){
    return workoutPersistenceError("owner_mismatch",phase,error);
  }
  if(raw.includes("stale_operation")){
    return workoutPersistenceError("stale_operation",phase,error);
  }
  if(raw.includes("corrupt_active_pointer")||raw.includes("active_pointer_target_invalid")){
    return workoutPersistenceError("corrupt_active_pointer",phase,error);
  }
  if(
    raw.includes("workout_instance")||raw.includes("session_mismatch")||
    raw.includes("invalid_workout")||raw.includes("draft_session_not_found")
  ){
    return workoutPersistenceError("invalid_workout_identity",phase,error);
  }
  return workoutPersistenceError(fallback,phase,error);
}
function logWorkoutPersistenceError(error){
  const failure=classifyWorkoutPersistenceError(error);
  console.error("Workout persistence failure",{
    code:failure.code,
    phase:failure.phase,
    originalName:failure.cause?.name||error?.name||"Error",
    originalCode:failure.cause?.code||error?.code||null
  });
  return failure;
}
function writeWorkoutStorage(key,value,{code,phase}){
  try{
    localStorage.setItem(key,value);
  }catch(error){
    throw classifyWorkoutPersistenceError(error,{fallback:code,phase});
  }
}
function removeWorkoutStorage(key,{code,phase}){
  try{
    localStorage.removeItem(key);
  }catch(error){
    throw classifyWorkoutPersistenceError(error,{fallback:code,phase});
  }
}
function discardCorruptActiveWorkoutPointer(activeKey,{phase,cause}={}){
  const failure=workoutPersistenceError(
    "corrupt_active_pointer",phase||"active_pointer",cause
  );
  logWorkoutPersistenceError(failure);
  try{
    removeWorkoutStorage(activeKey,{
      code:"active_pointer_write_failed",
      phase:`${failure.phase}_remove`
    });
  }catch(removeError){
    logWorkoutPersistenceError(removeError);
  }
  return failure;
}
function approximateStorageBytes(key,value){
  return (String(key||"").length+String(value||"").length)*2;
}
function workoutStorageEntryDescriptor(key,raw,currentOwnerId){
  const ownerMatch=String(key).match(
    /^gymos:(?:workoutProgress|activeWorkout|workoutProgressMigration):([^:]+)/
  );
  const vaultMatch=String(key).match(/^gymos:userVault:(.+)$/);
  const ownerId=ownerMatch?.[1]||vaultMatch?.[1]||currentOwnerId||null;
  let logicalName=key,contentType="functional_data",role="authoritative";
  let writer="application_writer";
  if(key===CANONICAL_DRAFTS_KEY){
    logicalName="Borradores canónicos";
    contentType="workout_drafts";
    role="active_draft";
    writer="saveDraft";
  }else if(/^gymos:draft:[ABC]$/.test(key)){
    logicalName=`Sombra legacy ${key.slice(-1)}`;
    contentType="workout_draft_shadow";
    role="legacy_shadow";
    writer="saveDraft/writeLegacyDraftShadows";
  }else if(key.startsWith("gymos:workoutProgress:")){
    let status="unknown";
    try{status=JSON.parse(raw)?.status||"unknown";}catch(_){}
    logicalName=status==="finalized"?"Progreso finalizado":"Progreso de entrenamiento";
    contentType="workout_progress";
    role=status==="active"
      ?"active_draft":status==="finalized"?"finalized":"authoritative";
    writer="storeWorkoutProgressRecord";
  }else if(key.startsWith("gymos:activeWorkout:")){
    logicalName="Puntero de entrenamiento activo";
    contentType="active_pointer";
    role="pointer";
    writer="storeWorkoutProgressRecord";
  }else if(key.startsWith("gymos:userVault:")){
    logicalName="Vault local del propietario";
    contentType="owner_vault";
    role="backup";
    writer="saveCurrentUserVault";
  }else if(
    (window.GymOSProfileData?.MIGRATION_INTERNAL_KEY_PREFIXES||[]).some(
      prefix=>key.startsWith(prefix)
    )||key.startsWith(EXERCISE_DOMAIN_MIGRATION_BACKUP_PREFIX)
  ){
    logicalName="Backup interno de migración";
    contentType="migration_backup";
    role="backup";
    writer="migration_transaction";
  }else if(key.includes("Migration")){
    logicalName="Estado de migración";
    contentType="migration_state";
    role="marker";
    writer="migration_transaction";
  }else if(key==="gymos:history"){
    logicalName="Historial definitivo";
    contentType="workout_history";
    role="finalized";
    writer="saveHistory/finishWorkout";
  }else if(key==="gymos:recoveryCheckins"||key==="gymos:dailyRecovery"){
    logicalName=key==="gymos:recoveryCheckins"
      ?"Check-ins de Recuperación":"Datos de Recuperación";
    contentType="recovery";
    role="authoritative";
    writer="GymOSRecovery";
  }else if(key==="gymos:syncAudit"||key==="gymos:developerLogs"){
    logicalName=key==="gymos:syncAudit"?"Auditoría de sincronización":"Logs internos";
    contentType="internal_cache";
    role="cache";
    writer=key==="gymos:syncAudit"?"addSyncAudit":"addDeveloperLog";
  }else if(key==="gymos:routine"||key===CANONICAL_ROUTINE_KEY){
    logicalName=key===CANONICAL_ROUTINE_KEY?"Rutina canónica":"Sombra de rutina";
    contentType="routine";
    role=key===CANONICAL_ROUTINE_KEY?"authoritative":"legacy_shadow";
    writer="saveCanonicalRoutine";
  }else if(key==="gymos:syncPending"||key==="gymos:updatedAt"){
    logicalName="Estado ligero de sincronización";
    contentType="sync_state";
    role="signal";
    writer="markLocalUpdated";
  }
  return {
    logicalName,
    key,
    approximateBytes:approximateStorageBytes(key,raw),
    ownerId,
    contentType,
    role,
    writer
  };
}
function workoutStorageUsageDiagnostic(ownerId=currentRoutineOwnerOrNull()){
  const entries=[];
  try{
    for(let index=0;index<localStorage.length;index+=1){
      const key=localStorage.key(index);
      if(!key?.startsWith("gymos:")) continue;
      const raw=localStorage.getItem(key);
      entries.push(workoutStorageEntryDescriptor(key,raw,ownerId));
    }
  }catch(error){
    return {
      ownerId,
      generatedAt:new Date().toISOString(),
      approximateBytes:entries.reduce((total,item)=>total+item.approximateBytes,0),
      entries:entries.sort((a,b)=>b.approximateBytes-a.approximateBytes),
      incomplete:true,
      errorCode:isWorkoutStorageQuotaError(error)?"storage_quota":"storage_unavailable"
    };
  }
  return {
    ownerId,
    generatedAt:new Date().toISOString(),
    approximateBytes:entries.reduce((total,item)=>total+item.approximateBytes,0),
    entries:entries.sort((a,b)=>
      b.approximateBytes-a.approximateBytes||a.key.localeCompare(b.key)
    ),
    incomplete:false
  };
}
function storageValueContains(authoritative,candidate){
  if(candidate===null||typeof candidate!=="object"){
    return Object.is(authoritative,candidate);
  }
  if(Array.isArray(candidate)){
    return Array.isArray(authoritative)&&authoritative.length===candidate.length&&
      candidate.every((item,index)=>storageValueContains(authoritative[index],item));
  }
  if(!authoritative||typeof authoritative!=="object"||Array.isArray(authoritative)){
    return false;
  }
  return Object.entries(candidate).every(([key,value])=>
    ["legacyRaw","_fieldMeta","conflicts"].includes(key)||
    storageValueContains(authoritative[key],value)
  );
}
function verifiedLegacyShadowDuplicate(ownerId,sessionId,raw,{
  allowActive=false
}={}){
  if(!raw) return false;
  const progress=activeWorkoutProgressRecord(ownerId,sessionId)||
    storedWorkoutProgressRecords(ownerId).filter(
      item=>item.sessionId===sessionId
    ).sort((left,right)=>
      String(right.updatedAt||"").localeCompare(String(left.updatedAt||""))||
      String(left.workoutInstanceId||"").localeCompare(
        String(right.workoutInstanceId||"")
      )
    )[0];
  if(!progress||progress.ownerId!==ownerId) return false;
  if(progress.status==="active"&&!allowActive) return false;
  let legacy;
  try{legacy=JSON.parse(raw);}catch(_){return false;}
  if(!storageValueContains(progress,legacy)) return false;
  const canonical=getCanonicalDrafts()?.draftsBySessionId?.[sessionId];
  return Boolean(
    canonical&&canonical.ownerId===ownerId&&canonical.legacyRaw===raw&&
    storageValueContains(canonical,legacy)
  );
}
function repairInflatedLegacyWorkoutStorage({
  ownerId=currentRoutineOwnerOrNull()
}={}){
  const normalizedOwner=workoutProgressApi().ownerId(ownerId);
  assertActiveLocalOwner(normalizedOwner);
  const canonicalRoutine=getCanonicalRoutine();
  const protectedBefore={
    routine:localStorage.getItem("gymos:routine"),
    canonicalRoutine:localStorage.getItem(CANONICAL_ROUTINE_KEY),
    history:localStorage.getItem("gymos:history"),
    recovery:localStorage.getItem("gymos:dailyRecovery"),
    recoveryCheckins:localStorage.getItem("gymos:recoveryCheckins")
  };
  const canonicalRaw=localStorage.getItem(CANONICAL_DRAFTS_KEY);
  const canonicalContainer=canonicalRaw?readStoredJson(CANONICAL_DRAFTS_KEY):null;
  const functionalByWorkoutId=new Map();
  const detections=[];
  const legacyRepairs=[];
  const progressKeys=[];
  const rememberDraft=(candidate,source,key)=>{
    if(!candidate||typeof candidate!=="object"||candidate.ownerId!==normalizedOwner) return;
    const inspection=workoutProgressApi().inspectLegacyRaw(candidate);
    let clean;
    try{
      clean=workoutProgressApi().normalizeDraft(
        workoutProgressApi().stripLegacyRaw(candidate).draft,{
          owner:normalizedOwner,sessionId:candidate.sessionId,
          routineId:candidate.routineId,
          clientInstanceId:candidate.clientInstanceId||"legacy-repair"
        }
      );
    }catch(_){return;}
    const previous=functionalByWorkoutId.get(clean.workoutInstanceId);
    if(previous){
      try{clean=workoutProgressApi().mergeDrafts(previous,clean).draft;}
      catch(_){return;}
    }
    functionalByWorkoutId.set(clean.workoutInstanceId,clean);
    if(
      inspection.present&&(
        inspection.nested||inspection.oversized||inspection.truncated||
        typeof candidate.legacyRaw!=="string"
      )
    ){
      detections.push({
        source,key,workoutInstanceId:clean.workoutInstanceId,
        nested:inspection.nested,oversized:inspection.oversized,
        truncated:inspection.truncated
      });
    }
  };

  Object.entries(canonicalContainer?.draftsBySessionId||{}).forEach(
    ([sessionId,draft])=>rememberDraft(
      draft,"canonical",`${CANONICAL_DRAFTS_KEY}:${sessionId}`
    )
  );
  for(let index=0;index<localStorage.length;index+=1){
    const key=localStorage.key(index);
    if(!key?.startsWith(workoutProgressPrefix(normalizedOwner))) continue;
    const record=readStoredJson(key);
    if(record?.ownerId!==normalizedOwner) continue;
    progressKeys.push(key);
    rememberDraft(record,"owner_progress",key);
  }
  ["A","B","C"].forEach(legacySession=>{
    const key=draftKey(legacySession);
    const raw=localStorage.getItem(key);
    if(raw===null) return;
    let parsed;
    try{parsed=JSON.parse(raw);}catch(_){return;}
    if(parsed?.ownerId!==normalizedOwner) return;
    rememberDraft(parsed,"legacy_shadow",key);
    const compactRaw=compactWorkoutDraftShadow(parsed,legacySession);
    if(
      raw!==compactRaw&&(
        workoutProgressApi().inspectLegacyRaw(parsed).present||
        raw.length>compactRaw.length*2
      )
    ){
      legacyRepairs.push({key,raw:compactRaw});
    }
  });

  const minimalContainer=canonicalContainer&&{
    ...canonicalContainer,
    draftsBySessionId:Object.fromEntries(
      Object.entries(canonicalContainer.draftsBySessionId||{}).map(
        ([sessionId,draft])=>[
          sessionId,
          draft?.ownerId===normalizedOwner
            ?workoutProgressApi().stripLegacyRaw(draft).draft
            :draft
        ]
      )
    )
  };
  const compactContainer=minimalContainer&&sanitizeWorkoutDraftContainer(
    canonicalContainer,{ownerId:normalizedOwner,canonicalRoutine}
  );
  const minimalRaw=minimalContainer?JSON.stringify(minimalContainer):null;
  const compactRaw=compactContainer?JSON.stringify(compactContainer):null;
  const canonicalInflated=Boolean(
    canonicalRaw&&compactRaw&&canonicalRaw!==compactRaw
  );
  if(!canonicalInflated&&!legacyRepairs.length&&
    !progressKeys.some(key=>readStoredJson(key)?.legacyRaw!==undefined)){
    return {
      repaired:false,completed:true,ownerId:normalizedOwner,
      detections,records:[...functionalByWorkoutId.keys()]
    };
  }

  const newestActive=[...functionalByWorkoutId.values()]
    .filter(draft=>draft.status==="active")
    .sort((left,right)=>
      String(right.updatedAt||"").localeCompare(String(left.updatedAt||""))||
      String(left.workoutInstanceId).localeCompare(String(right.workoutInstanceId))
    )[0]||null;
  if(
    newestActive&&(
      !state.workoutDraftMemory||
      state.workoutDraftMemory.ownerId!==normalizedOwner
    )
  ){
    state.workoutDraftMemory=JSON.parse(JSON.stringify(newestActive));
  }

  const actions=[];
  try{
    // Sustituir la misma clave por una versión menor libera espacio sin borrar
    // el último borrador recuperable.
    if(canonicalInflated){
      writeWorkoutStorage(CANONICAL_DRAFTS_KEY,minimalRaw,{
        code:"local_progress_write_failed",phase:"legacy_repair_release_canonical"
      });
      if(localStorage.getItem(CANONICAL_DRAFTS_KEY)!==minimalRaw){
        throw new Error("legacy_repair_canonical_verification_failed");
      }
      actions.push({type:"release_recursive_canonical_shadow",key:CANONICAL_DRAFTS_KEY});
    }
    legacyRepairs.forEach(item=>{
      writeWorkoutStorage(item.key,item.raw,{
        code:"legacy_shadow_write_failed",phase:"legacy_repair_release_shadow"
      });
      if(localStorage.getItem(item.key)!==item.raw){
        throw new Error("legacy_repair_shadow_verification_failed");
      }
      actions.push({type:"compact_legacy_shadow",key:item.key});
    });

    // Con el espacio redundante retirado, publicar y verificar primero la copia
    // funcional owner-scoped. Nunca se cambia su workoutInstanceId.
    functionalByWorkoutId.forEach(draft=>{
      assertActiveLocalOwner(normalizedOwner);
      const key=workoutProgressApi().progressStorageKey(
        normalizedOwner,draft.workoutInstanceId
      );
      const raw=JSON.stringify(workoutProgressApi().stripLegacyRaw(draft).draft);
      writeWorkoutStorage(key,raw,{
        code:"local_progress_write_failed",phase:"legacy_repair_progress"
      });
      const verified=readStoredJson(key);
      if(
        !verified||verified.ownerId!==normalizedOwner||
        verified.workoutInstanceId!==draft.workoutInstanceId||
        verified.legacyRaw!==undefined
      ){
        throw new Error("legacy_repair_progress_verification_failed");
      }
      actions.push({type:"write_clean_owner_progress",key});
    });

    // La sombra compacta se reconstruye al final. Si no cupiera, el registro
    // owner-scoped ya verificado sigue siendo la fuente funcional.
    if(canonicalInflated&&compactRaw&&compactRaw!==minimalRaw){
      try{
        writeWorkoutStorage(CANONICAL_DRAFTS_KEY,compactRaw,{
          code:"legacy_shadow_write_failed",phase:"legacy_repair_rebuild_shadow"
        });
        if(localStorage.getItem(CANONICAL_DRAFTS_KEY)===compactRaw){
          actions.push({type:"rebuild_compact_canonical_shadow",key:CANONICAL_DRAFTS_KEY});
        }
      }catch(error){
        logWorkoutPersistenceError(error);
      }
    }
    const protectedAfter={
      routine:localStorage.getItem("gymos:routine"),
      canonicalRoutine:localStorage.getItem(CANONICAL_ROUTINE_KEY),
      history:localStorage.getItem("gymos:history"),
      recovery:localStorage.getItem("gymos:dailyRecovery"),
      recoveryCheckins:localStorage.getItem("gymos:recoveryCheckins")
    };
    if(JSON.stringify(protectedAfter)!==JSON.stringify(protectedBefore)){
      throw new Error("legacy_repair_protected_storage_changed");
    }
    state.workoutDraftLastError=null;
    return {
      repaired:actions.length>0,completed:true,ownerId:normalizedOwner,
      detections,actions,records:[...functionalByWorkoutId.keys()]
    };
  }catch(error){
    const failure=classifyWorkoutPersistenceError(error,{
      fallback:"migration_failed",phase:"legacy_inflation_repair"
    });
    state.workoutDraftSaveStatus="local_error";
    state.workoutDraftLastError=failure;
    setActiveWorkoutMessage(
      "error",
      "No hay espacio suficiente para completar la reparación. El entrenamiento recuperado sigue disponible en esta sesión.",
      {retry:true}
    );
    return {
      repaired:false,completed:false,ownerId:normalizedOwner,
      detections,actions,records:[...functionalByWorkoutId.keys()],error:failure
    };
  }
}
function compactWorkoutStorageForQuota({
  ownerId=currentRoutineOwnerOrNull()
}={}){
  const normalizedOwner=workoutProgressApi().ownerId(ownerId);
  assertActiveLocalOwner(normalizedOwner);
  const before=workoutStorageUsageDiagnostic(normalizedOwner);
  const actions=[];
  const protectedBefore={
    routine:localStorage.getItem("gymos:routine"),
    canonicalRoutine:localStorage.getItem(CANONICAL_ROUTINE_KEY),
    history:localStorage.getItem("gymos:history"),
    recovery:localStorage.getItem("gymos:dailyRecovery"),
    recoveryCheckins:localStorage.getItem("gymos:recoveryCheckins"),
    syncPending:localStorage.getItem("gymos:syncPending")
  };

  // Son cachés diagnósticas limitadas; nunca son una fuente funcional.
  [SYNC_AUDIT_KEY,APP_LOGS_KEY].forEach(key=>{
    if(localStorage.getItem(key)===null) return;
    try{
      localStorage.removeItem(key);
      actions.push({type:"remove_internal_cache",key});
    }catch(_){}
  });

  // El vault activo solo se retira si es byte a byte el mismo snapshot funcional.
  const vaultKey=`${LOCAL_VAULT_PREFIX}${normalizedOwner}`;
  const vaultRaw=localStorage.getItem(vaultKey);
  if(vaultRaw!==null){
    let identical=false;
    try{identical=vaultRaw===JSON.stringify(snapshotCurrentLocalData());}
    catch(_){}
    if(identical){
      try{
        localStorage.removeItem(vaultKey);
        actions.push({type:"remove_identical_owner_vault",key:vaultKey});
      }catch(_){}
    }
  }

  // RC.3 anterior podía anidar legacyRaw dentro de la siguiente legacyRaw.
  // Se reconstruye desde el draft canónico sin esa propiedad y se verifica.
  const canonicalRoutine=getCanonicalRoutine();
  const canonicalDrafts=getCanonicalDrafts();
  if(canonicalRoutine&&canonicalDrafts?.draftsBySessionId){
    const compactedContainer=JSON.parse(JSON.stringify(canonicalDrafts));
    let containerChanged=false;
    Object.values(compactedContainer.draftsBySessionId).forEach(draft=>{
      if(draft?.ownerId!==normalizedOwner||typeof draft.legacyRaw!=="string") return;
      const session=canonicalRoutine.sessions?.find(
        item=>item.sessionId===draft.sessionId
      );
      if(!session?.legacySessionKey) return;
      const shadow={...draft,session:session.legacySessionKey};
      delete shadow.legacyRaw;
      const compactRaw=JSON.stringify(shadow);
      if(compactRaw.length>=draft.legacyRaw.length) return;
      draft.legacyRaw=compactRaw;
      containerChanged=true;
    });
    const compactedValidation=containerChanged
      ?routineSessionMigrationApi().validateDraftContainer(
        compactedContainer,{ownerId:normalizedOwner,canonicalRoutine}
      )
      :{valid:false};
    if(containerChanged&&compactedValidation.valid){
      try{
        localStorage.setItem(
          CANONICAL_DRAFTS_KEY,JSON.stringify(compactedContainer)
        );
        const verified=getCanonicalDrafts();
        const validation=routineSessionMigrationApi().validateDraftContainer(
          verified,{ownerId:normalizedOwner,canonicalRoutine}
        );
        if(validation.valid){
          Object.values(verified.draftsBySessionId||{}).forEach(draft=>{
            const session=canonicalRoutine.sessions?.find(
              item=>item.sessionId===draft.sessionId
            );
            if(!session?.legacySessionKey||typeof draft.legacyRaw!=="string") return;
            const key=draftKey(session.legacySessionKey);
            if(localStorage.getItem(key)!==null){
              try{localStorage.setItem(key,draft.legacyRaw);}catch(_){}
            }
          });
          actions.push({
            type:"compact_nested_legacy_shadow",
            key:CANONICAL_DRAFTS_KEY
          });
        }
      }catch(_){}
    }
  }

  // legacyRaw ya vive verificado en el contenedor canónico y no pertenece al
  // modelo owner-scoped. Retirarlo reduce una copia completa sin tocar resultados.
  storedWorkoutProgressRecords(normalizedOwner).forEach(record=>{
    if(typeof record.legacyRaw!=="string") return;
    const canonical=getCanonicalDrafts()?.draftsBySessionId?.[record.sessionId];
    if(
      !canonical||canonical.ownerId!==normalizedOwner||
      canonical.legacyRaw!==record.legacyRaw
    ) return;
    const compacted={...record};
    delete compacted.legacyRaw;
    const key=workoutProgressApi().progressStorageKey(
      normalizedOwner,record.workoutInstanceId
    );
    try{
      localStorage.setItem(key,JSON.stringify(compacted));
      const verified=readStoredJson(key);
      if(verified&&verified.ownerId===normalizedOwner&&!verified.legacyRaw){
        actions.push({type:"remove_redundant_progress_shadow",key});
      }
    }catch(_){}
  });

  // Una sombra legacy solo es prescindible si el entrenamiento no está activo,
  // no hay cambios pendientes y dos copias owner-scoped/canónica la contienen.
  if(protectedBefore.syncPending!=="1"){
    const canonical=getCanonicalRoutine();
    ["A","B","C"].forEach(legacySession=>{
      const session=canonical?.sessions?.find(
        item=>item.legacySessionKey===legacySession
      );
      if(!session) return;
      const key=draftKey(legacySession);
      const raw=localStorage.getItem(key);
      if(!verifiedLegacyShadowDuplicate(
        normalizedOwner,session.sessionId,raw,{allowActive:false}
      )) return;
      try{
        localStorage.removeItem(key);
        actions.push({type:"remove_verified_legacy_shadow",key});
      }catch(_){}
    });
  }

  assertActiveLocalOwner(normalizedOwner);
  const protectedAfter={
    routine:localStorage.getItem("gymos:routine"),
    canonicalRoutine:localStorage.getItem(CANONICAL_ROUTINE_KEY),
    history:localStorage.getItem("gymos:history"),
    recovery:localStorage.getItem("gymos:dailyRecovery"),
    recoveryCheckins:localStorage.getItem("gymos:recoveryCheckins"),
    syncPending:localStorage.getItem("gymos:syncPending")
  };
  if(JSON.stringify(protectedAfter)!==JSON.stringify(protectedBefore)){
    throw workoutPersistenceError(
      "local_progress_write_failed","quota_compaction_guard",
      new Error("protected_storage_changed")
    );
  }
  const after=workoutStorageUsageDiagnostic(normalizedOwner);
  if(typeof state!=="undefined") state.workoutStorageDiagnostic={before,after,actions};
  return {
    attempted:true,
    ownerId:normalizedOwner,
    actions,
    freedApproximateBytes:Math.max(
      0,before.approximateBytes-after.approximateBytes
    ),
    before,
    after
  };
}
function storeWorkoutProgressRecord(draft,{active=true,source="local"}={}){
  const ownerId=currentRoutineOwnerOrNull();
  if(!ownerId) throw workoutPersistenceError(
    "owner_mismatch","progress_owner",new Error("owner_not_active")
  );
  let normalized;
  try{
    assertActiveLocalOwner(ownerId);
    normalized=workoutProgressApi().normalizeDraft(draft,{
      owner:ownerId,
      sessionId:draft?.sessionId||resolveRuntimeSessionId(draft?.session),
      routineId:draft?.routineId||getCanonicalRoutine()?.routineId,
      clientInstanceId:getWorkoutClientInstanceId(),
      idFactory:secureSessionModelId
    });
  }catch(error){
    throw classifyWorkoutPersistenceError(error,{
      fallback:"invalid_workout_identity",phase:"progress_identity"
    });
  }
  if(normalized.ownerId!==ownerId) throw workoutPersistenceError(
    "owner_mismatch","progress_owner",new Error("owner_mismatch")
  );
  const progressRecord={...normalized};
  delete progressRecord.legacyRaw;
  writeWorkoutStorage(
    workoutProgressApi().progressStorageKey(ownerId,normalized.workoutInstanceId),
    JSON.stringify(progressRecord),
    {code:"local_progress_write_failed",phase:"progress_record"}
  );
  const activeKey=workoutProgressApi().activeWorkoutStorageKey(ownerId,normalized.sessionId);
  if(active&&normalized.status==="active"){
    let currentPointer=null;
    const currentRaw=localStorage.getItem(activeKey);
    if(currentRaw){
      try{
        currentPointer=workoutProgressApi().normalizePointer(
          JSON.parse(currentRaw),{owner:ownerId,sessionId:normalized.sessionId}
        );
      }catch(error){
        try{
          currentPointer=workoutProgressApi().normalizePointer(
            currentRaw,{owner:ownerId,sessionId:normalized.sessionId}
          );
        }catch(pointerError){}
      }
    }
    const candidatePointer={
      ownerId,sessionId:normalized.sessionId,
      workoutInstanceId:normalized.workoutInstanceId,
      updatedAt:normalized.updatedAt,revision:normalized.revision,
      clientInstanceId:normalized.clientInstanceId
    };
    const selection=workoutProgressApi().selectActivePointer(
      currentPointer,candidatePointer,{
        localPending:source==="remote"&&localStorage.getItem("gymos:syncPending")==="1"
      }
    );
    writeWorkoutStorage(
      activeKey,JSON.stringify(selection.pointer),
      {code:"active_pointer_write_failed",phase:"active_pointer"}
    );
    if(selection.conflict&&typeof state!=="undefined"){
      state.workoutDraftSaveStatus="conflict";
    }
  }else if(activeWorkoutPointerId(ownerId,normalized.sessionId)===normalized.workoutInstanceId){
    removeWorkoutStorage(activeKey,{
      code:"active_pointer_write_failed",phase:"active_pointer_remove"
    });
  }
  try{
    assertActiveLocalOwner(ownerId);
  }catch(error){
    throw classifyWorkoutPersistenceError(error,{
      fallback:"owner_mismatch",phase:"progress_owner_verify"
    });
  }
  return normalized;
}
function removeWorkoutProgressRecord(ownerId,sessionId,workoutInstanceId){
  const activeKey=workoutProgressApi().activeWorkoutStorageKey(ownerId,sessionId);
  if(activeWorkoutPointerId(ownerId,sessionId)===workoutInstanceId){
    localStorage.removeItem(activeKey);
  }
  localStorage.removeItem(workoutProgressApi().progressStorageKey(ownerId,workoutInstanceId));
}
function removeOwnerWorkoutProgressData(ownerId){
  const normalized=workoutProgressApi().ownerId(ownerId);
  const prefixes=[
    `gymos:workoutProgress:${normalized}:`,
    `gymos:activeWorkout:${normalized}:`,
    workoutProgressApi().migrationStorageKey(normalized)
  ];
  const keys=[];
  for(let index=0;index<localStorage.length;index+=1){
    const key=localStorage.key(index);
    if(prefixes.some(prefix=>key?.startsWith(prefix))) keys.push(key);
  }
  keys.forEach(key=>localStorage.removeItem(key));
}
function captureOwnerWorkoutProgressStorage(ownerId){
  const normalized=workoutProgressApi().ownerId(ownerId);
  const prefixes=[
    `gymos:workoutProgress:${normalized}:`,
    `gymos:activeWorkout:${normalized}:`,
    workoutProgressApi().migrationStorageKey(normalized)
  ];
  const snapshot={};
  for(let index=0;index<localStorage.length;index+=1){
    const key=localStorage.key(index);
    if(prefixes.some(prefix=>key?.startsWith(prefix))){
      snapshot[key]=localStorage.getItem(key);
    }
  }
  return snapshot;
}
function restoreOwnerWorkoutProgressStorage(ownerId,snapshot={}){
  removeOwnerWorkoutProgressData(ownerId);
  Object.entries(snapshot).forEach(([key,value])=>{
    if(value!==null) localStorage.setItem(key,String(value));
  });
}
function ensureWorkoutProgressMigration({ownerId=currentRoutineOwnerOrNull(),mark=false}={}){
  const normalizedOwner=workoutProgressApi().ownerId(ownerId);
  assertActiveLocalOwner(normalizedOwner);
  const canonical=getCanonicalRoutine();
  const container=getCanonicalDrafts();
  if(!canonical||!container?.draftsBySessionId){
    return {migrated:false,ownerId:normalizedOwner,records:[],rejected:[]};
  }
  const progressBefore=captureOwnerWorkoutProgressStorage(normalizedOwner);
  const canonicalBefore=localStorage.getItem(CANONICAL_DRAFTS_KEY);
  const legacyBefore=Object.fromEntries(
    ["A","B","C"].map(key=>[key,localStorage.getItem(draftKey(key))])
  );
  const markerKey=workoutProgressApi().migrationStorageKey(normalizedOwner);
  const markerBefore=localStorage.getItem(markerKey);
  const migrated=[];
  const rejected=[];
  let nextContainer=container;
  try{
    routineSessionRuntimeApi().orderedSessions(canonical).forEach(session=>{
      const legacy=container.draftsBySessionId[session.sessionId];
      if(!legacy) return;
      try{
        if(legacy.ownerId!==normalizedOwner) throw new Error("owner_mismatch");
        const status=routineSessionMigrationApi().draftStatus(legacy,{
          ownerId:normalizedOwner,canonicalRoutine:canonical
        });
        if(status.status!=="current") throw new Error(`legacy_draft_${status.status}`);
        const normalized=workoutProgressApi().normalizeDraft(legacy,{
          owner:normalizedOwner,sessionId:session.sessionId,
          routineId:canonical.routineId,clientInstanceId:getWorkoutClientInstanceId(),
          idFactory:secureSessionModelId
        });
        const progressKey=workoutProgressApi().progressStorageKey(
          normalizedOwner,normalized.workoutInstanceId
        );
        const existing=readStoredJson(progressKey);
        const progress=existing
          ?workoutProgressApi().mergeDrafts(existing,normalized).draft
          :normalized;

        // El registro owner-scoped se escribe y verifica antes de publicar el puntero.
        localStorage.setItem(progressKey,JSON.stringify(progress));
        const verified=readStoredJson(progressKey);
        if(!verified||!workoutProgressApi().same(verified,progress)){
          throw new Error("workout_progress_verification_failed");
        }
        assertActiveLocalOwner(normalizedOwner);
        storeWorkoutProgressRecord(progress,{active:true,source:"migration"});
        assertActiveLocalOwner(normalizedOwner);
        if(activeWorkoutPointerId(normalizedOwner,session.sessionId)===progress.workoutInstanceId){
          nextContainer=routineSessionRuntimeApi().upsertDraft(nextContainer,progress,{
            ownerId:normalizedOwner,routine:canonical
          });
        }
        migrated.push(progress.workoutInstanceId);
      }catch(error){
        if(
          error?.name==="WorkoutPersistenceError"||
          isWorkoutStorageQuotaError(error)
        ){
          throw workoutPersistenceError("migration_failed","legacy_progress_migration",error);
        }
        rejected.push({sessionId:session.sessionId,code:error?.message||"invalid_legacy_draft"});
      }
    });
    if(migrated.length){
      localStorage.setItem(CANONICAL_DRAFTS_KEY,JSON.stringify(nextContainer));
      writeLegacyDraftShadows(canonical,nextContainer);
    }
    const marker={
      version:workoutProgressApi().VERSION,
      ownerId:normalizedOwner,routineId:canonical.routineId,
      completed:true,migratedWorkoutInstanceIds:[...new Set(migrated)].sort(),
      rejected:rejected.map(item=>({sessionId:item.sessionId,code:item.code}))
    };
    localStorage.setItem(markerKey,JSON.stringify(marker));
    if(mark&&migrated.length) markLocalUpdated();
    return {
      migrated:migrated.some(workoutInstanceId=>
        !Object.keys(progressBefore).some(key=>key.endsWith(`:${workoutInstanceId}`))
      ),
      ownerId:normalizedOwner,records:marker.migratedWorkoutInstanceIds,rejected
    };
  }catch(error){
    const failure=classifyWorkoutPersistenceError(error,{
      fallback:"migration_failed",phase:"legacy_progress_migration"
    });
    try{
      restoreOwnerWorkoutProgressStorage(normalizedOwner,progressBefore);
      restoreStorageValue(CANONICAL_DRAFTS_KEY,canonicalBefore);
      Object.entries(legacyBefore).forEach(
        ([key,raw])=>restoreStorageValue(draftKey(key),raw)
      );
      restoreStorageValue(markerKey,markerBefore);
    }catch(restoreError){
      console.error("Workout migration rollback failure",{
        code:isWorkoutStorageQuotaError(restoreError)?"storage_quota":"migration_failed",
        phase:"legacy_progress_migration_rollback"
      });
    }
    throw failure;
  }
}
function mergeIncomingWorkoutProgress(records,{writeCanonical=true}={}){
  const ownerId=currentRoutineOwnerOrNull();
  if(!ownerId) throw new Error("owner_not_active");
  const merged=workoutProgressApi().mergeCollections(
    storedWorkoutProgressRecords(ownerId),records,{owner:ownerId}
  );
  merged.records.forEach(record=>{
    if(record.ownerId!==ownerId) return;
    storeWorkoutProgressRecord(record,{active:record.status==="active",source:"remote"});
  });
  if(writeCanonical){
    const canonical=getCanonicalRoutine();
    let container=getCanonicalDrafts()||(
      canonical?routineSessionMigrationApi().emptyDraftContainer(canonical.routineId):null
    );
    if(canonical&&container){
      merged.records.filter(record=>
        record.status==="active"&&record.routineId===canonical.routineId
      ).forEach(record=>{
        const active=activeWorkoutProgressRecord(ownerId,record.sessionId);
        if(active?.workoutInstanceId!==record.workoutInstanceId) return;
        container=routineSessionRuntimeApi().upsertDraft(container,record,{ownerId,routine:canonical});
      });
      localStorage.setItem(CANONICAL_DRAFTS_KEY,JSON.stringify(container));
      writeLegacyDraftShadows(canonical,container);
    }
  }
  return merged;
}
function resolveRuntimeSessionId(candidate=null){
  const canonical=getCanonicalRoutine();
  if(!canonical) return candidate||state?.selectedSession||"A";
  return routineSessionRuntimeApi().selectedSessionId({
    routine:canonical,
    preferredSessionId:candidate||state?.selectedSessionId||localStorage.getItem(SELECTED_SESSION_ID_KEY),
    legacySelection:state?.selectedSession||localStorage.getItem("gymos:selectedSession"),
    history:getHistory()
  });
}
function selectRoutineSession(sessionId,{mark=false}={}){
  const canonical=getCanonicalRoutine();
  if(!canonical) return persistSelectedRoutineSession(sessionId,{mark});
  const selectedId=resolveRuntimeSessionId(sessionId);
  const session=routineSessionRuntimeApi().sessionById(canonical,selectedId);
  if(!session) throw new Error("session_not_found");
  localStorage.setItem(SELECTED_SESSION_ID_KEY,selectedId);
  if(session.legacySessionKey) localStorage.setItem("gymos:selectedSession",session.legacySessionKey);
  else localStorage.removeItem("gymos:selectedSession");
  state.selectedSessionId=selectedId;
  state.selectedSession=session.legacySessionKey||session.label||String(session.order);
  if(mark) markLocalUpdated();
  return {selectedSession:state.selectedSession,selectedSessionId:selectedId};
}
function emptyDraft(sessionId){
  const canonical=getCanonicalRoutine();
  const session=canonical
    ?routineSessionRuntimeApi().sessionById(canonical,resolveRuntimeSessionId(sessionId))
    :activeRoutineSession(sessionId);
  if(!session) throw new Error("draft_session_not_found");
  const id=session.sessionId;
  const last=lastWorkoutForSession(id);
  const workoutInstanceId=secureSessionModelId("workout");
  const createdAt=new Date().toISOString();
  return {
    ...(canonical?{
      draftId:secureSessionModelId("draft"),
      workoutInstanceId,
      ownerId:currentRoutineOwnerOrNull(),
      routineId:canonical.routineId,
      routineRevision:canonical.revision,
      sessionId:id,
      revision:1,
      clientInstanceId:getWorkoutClientInstanceId(),
      status:"active",
      sessionDefinitionHash:routineSessionMigrationApi().sessionDefinitionHash(canonical,id),
      sessionSnapshot:{
        label:session.label||String(session.order),
        name:session.name||"",
        focus:session.focus||"",
        order:session.order,
        legacySessionKey:session.legacySessionKey||null
      },
      updatedAt:createdAt
    }:{}),
    session:session.legacySessionKey||id,
    startedAt:null,
    sessionTimer:routineSessionRuntimeApi().normalizeSessionTimer(null,{
      ownerId:currentRoutineOwnerOrNull(),
      sessionId:id
    }),
    copiedFromLastSession:Boolean(last),
    exercises:session.exercises.map((item,exerciseIndex)=>{
      const previous=last?.exercises?.find(exercise=>
        (item.exerciseId||item.id)&&
        (exercise.exerciseId||exercise.id)===(item.exerciseId||item.id)
      )||last?.exercises?.[exerciseIndex];
      const durationExercise=isTimedExercise(item);
      return {
      ...JSON.parse(JSON.stringify(item)),
      exerciseInstanceId:secureSessionModelId("exercise"),
      name:item.name,
      target:item.target,
      sets:item.sets,
      increment:item.increment,
      type:item.type,
      equipment:item.equipment||"",
      variant:item.variant||"",
      targetRir:item.targetRir||"3-4",
      series:Array.from({length:item.sets},(_,seriesIndex)=>({
        setInstanceId:secureSessionModelId("set"),
        weight:durationExercise?"":(previous?.series?.[seriesIndex]?.weight ?? ""),
        reps:"",
        rir:"",
        seconds:"",
        warmup:false,
        done:false
      })),
      notes:"",
      discomfort:""
    };})
  };
}
function getDraft(sessionId){
  const canonical=getCanonicalRoutine();
  const resolved=resolveRuntimeSessionId(sessionId);
  const ownerId=currentRoutineOwnerOrNull();
  let draft=null;
  state.workoutDraftMessage=null;
  if(canonical&&ownerId){
    const repair=repairInflatedLegacyWorkoutStorage({ownerId});
    if(!repair.completed&&state.workoutDraftMemory?.sessionId===resolved){
      return JSON.parse(JSON.stringify(state.workoutDraftMemory));
    }
  }
  if(
    state.workoutDraftMemory?.ownerId===ownerId&&
    state.workoutDraftMemory?.sessionId===resolved&&
    state.workoutDraftMemory?.status==="active"
  ){
    return JSON.parse(JSON.stringify(state.workoutDraftMemory));
  }
  if(canonical){
    draft=routineSessionRuntimeApi().getDraft(getCanonicalDrafts(),{
      ownerId,routine:canonical,sessionId:resolved
    });
    const progress=activeWorkoutProgressRecord(ownerId,resolved);
    if(progress){
      draft=draft&&draft.workoutInstanceId===progress.workoutInstanceId
        ?workoutProgressApi().mergeDrafts(progress,draft).draft
        :progress;
    }
    if(draft){
      const persistedDraftId=draft.draftId;
      const shouldAnnounce=!state.workoutDraftObservedIds.has(persistedDraftId);
      const status=routineSessionMigrationApi().draftStatus(draft,{
        ownerId:currentRoutineOwnerOrNull(),canonicalRoutine:canonical
      });
      if(status.status!=="current"){
        if(shouldAnnounce) state.workoutDraftMessage={
            type:"warning",
            text:"Este borrador pertenece a una versión anterior de la sesión. Se conserva para revisión y no se ha mezclado con la rutina actual."
          };
        draft=null;
      }else if(shouldAnnounce){
        state.workoutDraftMessage={
          type:"info",
          text:"Se ha recuperado el progreso guardado de esta sesión."
        };
      }
      if(shouldAnnounce&&persistedDraftId) state.workoutDraftObservedIds.add(persistedDraftId);
    }
  }else{
    draft=JSON.parse(localStorage.getItem(draftKey(resolved))||"null");
  }
  draft=draft||emptyDraft(resolved);
  if(canonical&&ownerId){
    draft=workoutProgressApi().normalizeDraft(draft,{
      owner:ownerId,sessionId:resolved,routineId:canonical.routineId,
      clientInstanceId:getWorkoutClientInstanceId(),idFactory:secureSessionModelId
    });
  }
  draft.sessionTimer=routineSessionRuntimeApi().normalizeSessionTimer(draft.sessionTimer,{
    ownerId:draft.ownerId||currentRoutineOwnerOrNull(),
    sessionId:draft.sessionId||resolved,
    legacyStartedAt:draft.sessionTimer?null:draft.startedAt
  });
  draft.exercises.forEach(ex=>{
    ex.series=ex.series.map(normalizeSeries);
    if(ex.targetRir===undefined) ex.targetRir="3-4";
    if(ex.discomfort===undefined) ex.discomfort="";
  });
  state.workoutDraftMemory=JSON.parse(JSON.stringify(draft));
  return JSON.parse(JSON.stringify(draft));
}
function saveDraft(d){
  const {mark=true,schedule=true}=arguments[1]||{};
  const canonical=getCanonicalRoutine();
  const ownerId=currentRoutineOwnerOrNull();
  if(!canonical||!ownerId){
    try{
      state.workoutDraftMemory=JSON.parse(JSON.stringify(d));
    }catch(error){
      throw workoutPersistenceError("memory_update_failed","legacy_memory",error);
    }
    writeWorkoutStorage(
      draftKey(d?.session),JSON.stringify(d),
      {code:"legacy_shadow_write_failed",phase:"legacy_draft"}
    );
    return state.workoutDraftMemory;
  }
  const sessionId=resolveRuntimeSessionId(d?.sessionId||d?.session);
  const session=routineSessionRuntimeApi().sessionById(canonical,sessionId);
  if(!session) throw workoutPersistenceError(
    "invalid_workout_identity","session_resolution",new Error("draft_session_not_found")
  );
  const legacySession=session.legacySessionKey||null;
  let phase="draft_prepare";
  try{
    assertActiveLocalOwner(ownerId);
    const existing=getCanonicalDrafts()||routineSessionMigrationApi().emptyDraftContainer(canonical.routineId);
    const existingDraft=existing.draftsBySessionId?.[sessionId];
    const timestamp=new Date().toISOString();
    let prepared=workoutProgressApi().normalizeDraft(d,{
      owner:ownerId,sessionId,routineId:canonical.routineId,now:timestamp,
      clientInstanceId:getWorkoutClientInstanceId(),idFactory:secureSessionModelId
    });
    const memoryBase=state.workoutDraftMemory;
    if(
      memoryBase?.workoutInstanceId===prepared.workoutInstanceId&&
      !workoutProgressApi().same(memoryBase,prepared)
    ){
      prepared=workoutProgressApi().stampLocalChanges(memoryBase,prepared,{
        now:timestamp,clientInstanceId:getWorkoutClientInstanceId()
      }).draft;
    }
    const storedProgress=activeWorkoutProgressRecord(ownerId,sessionId);
    if(storedProgress?.workoutInstanceId===prepared.workoutInstanceId){
      prepared=workoutProgressApi().mergeDrafts(storedProgress,prepared).draft;
    }
    const nextDraft={
      ...JSON.parse(JSON.stringify(prepared)),
      draftId:prepared.draftId||existingDraft?.draftId||secureSessionModelId("draft"),
      workoutInstanceId:prepared.workoutInstanceId,
      ownerId,
      routineId:canonical.routineId,
      routineRevision:canonical.revision,
      sessionId,
      session:legacySession||sessionId,
      sessionDefinitionHash:routineSessionMigrationApi().sessionDefinitionHash(canonical,sessionId),
      startedAt:prepared.startedAt??existingDraft?.startedAt??null,
      sessionTimer:routineSessionRuntimeApi().normalizeSessionTimer(prepared.sessionTimer,{
        ownerId,
        sessionId,
        legacyStartedAt:prepared.sessionTimer?null:(prepared.startedAt??existingDraft?.startedAt)
      }),
      updatedAt:prepared.updatedAt||timestamp,
      sessionSnapshot:{
        label:session.label||String(session.order),name:session.name||"",
        focus:session.focus||"",order:session.order,
        legacySessionKey:legacySession
      }
    };
    // Nunca serializar legacyRaw dentro de sí mismo: cada guardado anterior
    // anidaba la sombra previa y hacía crecer el draft sin límite.
    delete nextDraft.legacyRaw;
    if(legacySession){
      nextDraft.legacyRaw=compactWorkoutDraftShadow(nextDraft,legacySession);
    }
    const next=routineSessionRuntimeApi().upsertDraft(existing,nextDraft,{
      ownerId,routine:canonical
    });
    if(legacySession) delete next.orphanedLegacyDrafts?.[legacySession];
    if(currentRoutineOwnerOrNull()!==ownerId) throw new Error("owner_changed");

    // La memoria es la fuente inmediata. Las capas persistentes nunca la revierten.
    phase="memory_update";
    state.workoutDraftMemory=JSON.parse(JSON.stringify(nextDraft));

    phase="progress_record";
    storeWorkoutProgressRecord(nextDraft,{active:true});

    phase="canonical_shadow";
    writeWorkoutStorage(
      CANONICAL_DRAFTS_KEY,JSON.stringify(next),
      {code:"legacy_shadow_write_failed",phase}
    );
    if(legacySession){
      phase="legacy_shadow";
      writeWorkoutStorage(
        draftKey(legacySession),nextDraft.legacyRaw,
        {code:"legacy_shadow_write_failed",phase}
      );
    }
    const storedContainer=getCanonicalDrafts();
    const storedValidation=routineSessionMigrationApi().validateDraftContainer(storedContainer,{
      ownerId,canonicalRoutine:canonical
    });
    if(!storedValidation.valid||!storedContainer.draftsBySessionId?.[sessionId]){
      throw workoutPersistenceError(
        "legacy_shadow_write_failed","canonical_shadow_verify",
        new Error("canonical_draft_write_validation_failed")
      );
    }
    if(currentRoutineOwnerOrNull()!==ownerId) throw new Error("owner_changed");
    phase="local_revision";
    if(mark) markLocalUpdated({schedule});
    state.workoutDraftSaveStatus=navigator.onLine&&isAppAuthenticated()
      ?"pending_sync":"saved_local";
    state.workoutDraftLastError=null;
    state.workoutDraftMessage=null;
    if(state.workoutInlineMessage?.type==="error"&&state.workoutInlineMessage.retry){
      state.workoutInlineMessage=null;
      updateActiveWorkoutInlineMessage();
    }
    return state.workoutDraftMemory;
  }catch(error){
    const fallback=phase==="memory_update"
      ?"memory_update_failed"
      :phase.includes("shadow")?"legacy_shadow_write_failed"
      :"local_progress_write_failed";
    throw classifyWorkoutPersistenceError(error,{fallback,phase});
  }
}
function workoutSaveStatusLabel(){
  if(
    !navigator.onLine&&
    ["saved","saved_local","pending_sync"].includes(state.workoutDraftSaveStatus)
  ){
    return "Sin conexión · guardado en este dispositivo";
  }
  if(state.workoutDraftSaveStatus==="local_error"){
    return state.workoutDraftLastError?.code==="storage_quota"
      ?"Sin espacio para guardar · Reintentar"
      :"Guardado pendiente · Reintentar";
  }
  return {
    saving:"Guardando…",
    saved:"Guardado",
    saved_local:"Guardado en este dispositivo",
    pending_sync:"Pendiente de sincronización",
    conflict:"Conflicto pendiente"
  }[state.workoutDraftSaveStatus]||"Guardado";
}
function updateWorkoutSaveIndicator(){
  document.querySelectorAll("[data-workout-save-status]").forEach(indicator=>{
    indicator.textContent=workoutSaveStatusLabel();
    indicator.dataset.status=state.workoutDraftSaveStatus;
  });
  document.querySelectorAll("[data-workout-sync-summary]").forEach(summary=>{
    summary.textContent=workoutSaveStatusLabel();
  });
}
function markWorkoutProgressSynced(){
  if(!state.workoutDraftMemory) return;
  state.workoutDraftSaveStatus="saved";
  state.workoutDraftLastError=null;
  updateWorkoutSaveIndicator();
}
function workoutPersistenceUserMessage(error){
  const failure=classifyWorkoutPersistenceError(error);
  if(failure.code==="remote_sync_failed"){
    return {
      type:"info",
      text:"Guardado en este dispositivo · pendiente de sincronización.",
      retry:true
    };
  }
  if(failure.code==="storage_quota"){
    return {
      type:"error",
      text:"No hay espacio suficiente para guardar. Los cambios se conservan temporalmente en esta sesión. Mantén esta pantalla abierta y reintenta.",
      retry:true
    };
  }
  if(["owner_mismatch","invalid_workout_identity","migration_failed"].includes(failure.code)){
    return {
      type:"error",
      text:failure.code==="owner_mismatch"
        ?"La cuenta activa cambió. Vuelve a abrir el entrenamiento."
        :"No se pudo reparar la identidad de este entrenamiento. Tus cambios siguen en memoria.",
      retry:true
    };
  }
  return {
    type:"error",
    text:"Los cambios siguen en memoria. No se pudieron guardar en este dispositivo.",
    retry:true
  };
}
function renderActiveWorkoutInlineMessage(){
  const message=state.workoutInlineMessage;
  if(!message) return "";
  return `<div class="form-message ${esc(message.type||"info")}" role="${message.type==="error"?"alert":"status"}">
    <span>${esc(message.text)}</span>
    ${message.retry?'<button type="button" class="text-button" data-workout-retry-save>Reintentar</button>':""}
  </div>`;
}
function updateActiveWorkoutInlineMessage(){
  const region=document.querySelector("[data-workout-inline-message]");
  if(region) region.innerHTML=renderActiveWorkoutInlineMessage();
}
function handleWorkoutPersistenceFailure(error){
  const failure=logWorkoutPersistenceError(error);
  state.workoutDraftLastError=failure;
  state.workoutDraftSaveStatus=failure.code==="remote_sync_failed"
    ?"pending_sync":"local_error";
  const message=workoutPersistenceUserMessage(failure);
  setActiveWorkoutMessage(message.type,message.text,{retry:message.retry});
  updateWorkoutSaveIndicator();
  updateActiveWorkoutInlineMessage();
  return failure;
}
function stageWorkoutDraft(draft,{immediate=false,scheduleSync=false}={}){
  const ownerId=currentRoutineOwnerOrNull();
  if(!ownerId||draft?.ownerId!==ownerId) throw workoutPersistenceError(
    "owner_mismatch","memory_stage",new Error("owner_changed")
  );
  const base=state.workoutDraftMemory?.workoutInstanceId===draft.workoutInstanceId
    ?state.workoutDraftMemory
    :draft;
  const stamped=workoutProgressApi().stampLocalChanges(base,draft,{
    now:new Date().toISOString(),clientInstanceId:getWorkoutClientInstanceId()
  });
  state.workoutDraftMemory=JSON.parse(JSON.stringify(stamped.draft));
  if(!stamped.changed&&!immediate) return stamped.draft;
  state.workoutDraftSaveStatus="saving";
  updateWorkoutSaveIndicator();
  if(immediate){
    flushWorkoutDraftProgress({scheduleSync,silent:true});
    return state.workoutDraftMemory;
  }
  clearTimeout(state.workoutDraftAutosaveTimer);
  const operationId=++state.workoutDraftOperationId;
  const workoutInstanceId=stamped.draft.workoutInstanceId;
  state.workoutDraftAutosaveTimer=setTimeout(()=>{
    if(
      operationId!==state.workoutDraftOperationId||
      currentRoutineOwnerOrNull()!==ownerId||
      state.workoutDraftMemory?.workoutInstanceId!==workoutInstanceId
    ){
      state.workoutLastDiscardedOperation={
        code:"stale_operation",phase:"autosave_debounce"
      };
      return;
    }
    flushWorkoutDraftProgress({scheduleSync,silent:true});
  },400);
  return stamped.draft;
}
function flushWorkoutDraftProgress({
  scheduleSync=false,silent=false,requireLocal=false
}={}){
  clearTimeout(state?.workoutDraftAutosaveTimer);
  if(typeof state!=="undefined") state.workoutDraftAutosaveTimer=null;
  const draft=state?.workoutDraftMemory;
  if(!draft||draft.status!=="active") return null;
  const ownerId=currentRoutineOwnerOrNull();
  if(!ownerId||draft.ownerId!==ownerId) return null;
  try{
    saveDraft(draft,{mark:true,schedule:scheduleSync});
    if(scheduleSync&&isAppAuthenticated()&&navigator.onLine) scheduleAutoSync(250);
    updateWorkoutSaveIndicator();
    return state.workoutDraftMemory;
  }catch(error){
    let failure=classifyWorkoutPersistenceError(error);
    if(
      failure.code==="storage_quota"&&!state.workoutQuotaRecoveryInProgress
    ){
      state.workoutQuotaRecoveryInProgress=true;
      try{
        try{
          if(typeof repairInflatedLegacyWorkoutStorage==="function"){
            repairInflatedLegacyWorkoutStorage({ownerId});
          }
          compactWorkoutStorageForQuota({ownerId});
        }catch(compactionError){
          logWorkoutPersistenceError(
            classifyWorkoutPersistenceError(compactionError,{
              fallback:"local_progress_write_failed",phase:"quota_compaction"
            })
          );
        }
        if(currentRoutineOwnerOrNull()!==ownerId){
          throw workoutPersistenceError(
            "owner_mismatch","quota_retry_owner",new Error("owner_changed")
          );
        }
        const latestDraft=JSON.parse(JSON.stringify(state.workoutDraftMemory));
        saveDraft(latestDraft,{mark:true,schedule:scheduleSync});
        state.workoutDraftSaveStatus="saved_local";
        state.workoutDraftLastError=null;
        const pending=localStorage.getItem("gymos:syncPending")==="1";
        setActiveWorkoutMessage(
          "success",
          pending
            ?"Guardado en este dispositivo · pendiente de sincronización."
            :"Guardado en este dispositivo."
        );
        updateWorkoutSaveIndicator();
        updateActiveWorkoutInlineMessage();
        if(scheduleSync&&isAppAuthenticated()&&navigator.onLine){
          scheduleAutoSync(250);
        }
        return state.workoutDraftMemory;
      }catch(retryError){
        failure=classifyWorkoutPersistenceError(retryError,{
          fallback:"local_progress_write_failed",phase:"quota_retry"
        });
      }finally{
        state.workoutQuotaRecoveryInProgress=false;
      }
    }
    failure=handleWorkoutPersistenceFailure(failure);
    if(requireLocal||!silent) throw failure;
    return state.workoutDraftMemory;
  }
}
function clearDraft(sessionId,{mark=true,preserveProgress=false}={}){
  const canonical=getCanonicalRoutine();
  const resolved=resolveRuntimeSessionId(sessionId);
  const session=canonical?routineSessionRuntimeApi().sessionById(canonical,resolved):null;
  const legacySession=session?.legacySessionKey||(!canonical?resolved:null);
  const previousLegacy=legacySession?localStorage.getItem(draftKey(legacySession)):null;
  const previousCanonical=localStorage.getItem(CANONICAL_DRAFTS_KEY);
  const previousUpdatedAt=localStorage.getItem("gymos:updatedAt");
  const previousSyncPending=localStorage.getItem("gymos:syncPending");
  const previousLocalRevision=localStorage.getItem("gymos:localRevision");
  const ownerId=currentRoutineOwnerOrNull();
  const progress=ownerId?activeWorkoutProgressRecord(ownerId,resolved):null;
  const progressKey=progress?workoutProgressApi().progressStorageKey(ownerId,progress.workoutInstanceId):null;
  const activeProgressKey=ownerId?workoutProgressApi().activeWorkoutStorageKey(ownerId,resolved):null;
  const previousProgress=progressKey?localStorage.getItem(progressKey):null;
  const previousActiveProgress=activeProgressKey?localStorage.getItem(activeProgressKey):null;
  try{
    if(ownerId) assertActiveLocalOwner(ownerId);
    if(legacySession) localStorage.removeItem(draftKey(legacySession));
    const container=getCanonicalDrafts();
    if(canonical&&container){
      const next=routineSessionRuntimeApi().removeDraft(container,{
        ownerId,routine:canonical,sessionId:resolved
      });
      if(legacySession) delete next.orphanedLegacyDrafts?.[legacySession];
      localStorage.setItem(CANONICAL_DRAFTS_KEY,JSON.stringify(next));
      const validation=routineSessionMigrationApi().validateDraftContainer(next,{
        ownerId,canonicalRoutine:canonical
      });
      if(!validation.valid) throw new Error(`invalid_canonical_draft:${validation.errors.join(",")}`);
    }
    if(progress&&!preserveProgress){
      removeWorkoutProgressRecord(ownerId,resolved,progress.workoutInstanceId);
    }else if(progress&&preserveProgress){
      const activeKey=workoutProgressApi().activeWorkoutStorageKey(ownerId,resolved);
      if(activeWorkoutPointerId(ownerId,resolved)===progress.workoutInstanceId){
        localStorage.removeItem(activeKey);
      }
    }
    if(ownerId) assertActiveLocalOwner(ownerId);
    if(mark) markLocalUpdated();
    if(state.workoutDraftMemory?.sessionId===resolved) state.workoutDraftMemory=null;
  }catch(error){
    if(progressKey) restoreStorageValue(progressKey,previousProgress);
    if(activeProgressKey) restoreStorageValue(activeProgressKey,previousActiveProgress);
    if(legacySession) restoreStorageValue(draftKey(legacySession),previousLegacy);
    restoreStorageValue(CANONICAL_DRAFTS_KEY,previousCanonical);
    restoreStorageValue("gymos:updatedAt",previousUpdatedAt);
    restoreStorageValue("gymos:syncPending",previousSyncPending);
    restoreStorageValue("gymos:localRevision",previousLocalRevision);
    throw error;
  }
}
function lastWorkoutForSession(sessionId){
  const canonical=getCanonicalRoutine();
  if(canonical){
    return routineSessionRuntimeApi().lastWorkout(
      getHistory(),canonical,resolveRuntimeSessionId(sessionId)
    );
  }
  return getHistory().find(workout=>workout.session===sessionId);
}
function parseRepRange(target){
  const nums=(target.match(/\d+/g)||[]).map(Number);
  if(!nums.length) return null;
  if(nums.length===1) return {min:nums[0],max:nums[0]};
  return {min:nums[0],max:nums[1]};
}
function numericValue(value){
  if(value===null||value===undefined||value==="") return null;
  const parsed=Number(String(value).replace(",","."));
  return Number.isFinite(parsed)?parsed:null;
}
function formatWeight(value){
  return Number.isInteger(value)?String(value):String(value).replace(".",",");
}
function exerciseRecommendation(lastExercise,target,increment=2.5,type="peso"){
  if(!lastExercise) return {
    status:"neutral",
    title:"Primera referencia",
    text:"Registra esta sesión para que GymOS pueda recomendarte el siguiente objetivo."
  };

  const range=parseRepRange(target);
  if(!range) return {
    status:"neutral",
    title:"Repite y compara",
    text:"Mantén una ejecución cómoda y registra el resultado."
  };

  const validSeries=workingSeries(lastExercise.series)
    .map(s=>({weight:numericValue(s.weight),reps:numericValue(s.reps),rir:numericValue(s.rir)}))
    .filter(s=>s.weight!==null&&s.reps!==null);

  if(!validSeries.length) return {
    status:"neutral",
    title:"Faltan datos",
    text:"No hay suficientes pesos y repeticiones de la última sesión."
  };

  const reps=validSeries.map(s=>s.reps);
  const weights=validSeries.map(s=>s.weight);
  const sameWeight=weights.every(w=>w===weights[0]);
  const allAtMax=reps.every(r=>r>=range.max);
  const allAtMin=reps.every(r=>r>=range.min);
  const belowMin=reps.filter(r=>r<range.min).length;
  const knownRir=validSeries.map(s=>s.rir).filter(r=>r!==null);
  const tooHard=knownRir.length&&Math.min(...knownRir)<=0;
  const comfortable=knownRir.length===0||Math.min(...knownRir)>=1;

  if(allAtMax&&sameWeight&&comfortable){
    const next=weights[0]+Math.max(0,Number(increment)||0);
    return {
      status:"up",
      title:"Puedes progresar",
      text:`Completaste el rango alto. Prueba ${formatWeight(next)} kg y busca al menos ${range.min} repeticiones por serie.`
    };
  }

  if(allAtMax&&sameWeight&&tooHard){
    return {
      status:"hold",
      title:"No subas todavía",
      text:"Completaste el rango, pero llegaste a RIR 0. Repite la carga hasta dejar al menos 1–2 repeticiones en reserva."
    };
  }

  if(allAtMin){
    const nextTarget=reps.map(r=>Math.min(range.max,r+1)).join(" · ");
    return {
      status:"hold",
      title:"Mantén el peso",
      text:`Intenta mejorar una repetición: ${nextTarget}. Cuando alcances ${range.max} en todas las series, sube el peso.`
    };
  }

  if(belowMin>=2&&sameWeight){
    const next=Math.max(0,weights[0]-Math.max(0,Number(increment)||0));
    return {
      status:"down",
      title:"Reduce ligeramente",
      text:`Dos o más series quedaron por debajo del rango. Prueba ${formatWeight(next)} kg y prioriza técnica y control.`
    };
  }

  return {
    status:"hold",
    title:"Consolida el peso",
    text:`Mantén la carga e intenta alcanzar al menos ${range.min} repeticiones en todas las series.`
  };
}
function formatDuration(ms){ return `${Math.max(1,Math.round(ms/60000))} min`; }
function formatDate(iso){
  return new Intl.DateTimeFormat("es-ES",{day:"numeric",month:"long",year:"numeric"}).format(new Date(iso));
}
function allExerciseNames(){
  return [...new Set(activeRoutineSessions().flatMap(session=>session.exercises).map(item=>item.name))];
}
function getExerciseHistory(name){
  const rows=[];
  getHistory().forEach(workout=>{
    const exercise=workout.exercises.find(e=>e.name===name);
    if(!exercise) return;
    const validSeries=workingSeries(exercise.series||exercise.sets||exercise.completedSets)
      .map(s=>({weight:numericValue(s.weight),reps:numericValue(s.reps),rir:numericValue(s.rir)}))
      .filter(s=>s.weight!==null&&s.reps!==null);
    if(!validSeries.length) return;
    rows.push({
      date:workout.date,
      session:workout.session,
      series:validSeries,
      volume:validSeries.reduce((sum,s)=>sum+s.weight*s.reps,0),
      maxWeight:Math.max(...validSeries.map(s=>s.weight)),
      bestSet:validSeries.reduce((best,s)=>{
        const score=s.weight*s.reps;
        return !best||score>best.score?{...s,score}:best;
      },null)
    });
  });
  return rows.sort((a,b)=>new Date(a.date)-new Date(b.date));
}
function exerciseStats(name){
  const rows=getExerciseHistory(name);
  if(!rows.length) return null;
  const allSeries=rows.flatMap(r=>r.series.map(s=>({...s,date:r.date})));
  const maxWeight=Math.max(...allSeries.map(s=>s.weight));
  const bestSet=allSeries.reduce((best,s)=>{
    const score=s.weight*s.reps;
    return !best||score>best.score?{...s,score}:best;
  },null);
  const totalVolume=rows.reduce((sum,r)=>sum+r.volume,0);
  const lastVolume=rows.at(-1)?.volume||0;
  const previousVolume=rows.at(-2)?.volume||0;
  const change=previousVolume?((lastVolume-previousVolume)/previousVolume)*100:null;
  return {rows,maxWeight,bestSet,totalVolume,lastVolume,change};
}
function weekStart(date){
  const d=new Date(date); const day=(d.getDay()+6)%7;
  d.setDate(d.getDate()-day); d.setHours(0,0,0,0); return d;
}
function weeklySessionCount(){
  const start=weekStart(new Date());
  return getHistory().filter(w=>new Date(w.date)>=start).length;
}
function totalCurrentWeekVolume(){
  const start=weekStart(new Date());
  return getHistory()
    .filter(w=>new Date(w.date)>=start)
    .reduce((sum,w)=>sum+w.exercises.reduce((exSum,e)=>
      exSum+workingSeries(e.series).reduce((s,x)=>{
        const weight=numericValue(x.weight),reps=numericValue(x.reps);
        return s+(weight!==null&&reps!==null?weight*reps:0);
      },0),0),0);
}
function compactNumber(value){
  return new Intl.NumberFormat("es-ES",{maximumFractionDigits:0}).format(value);
}
function allExercisePerformances(name,excludeWorkoutId=null,historyInput=null){
  const performances=[];
  (Array.isArray(historyInput)?historyInput:getHistory()).forEach(workout=>{
    if(excludeWorkoutId!==null&&workout.id===excludeWorkoutId) return;
    const exercise=workout.exercises.find(e=>e.name===name);
    if(!exercise) return;
    (exercise.series||exercise.sets||exercise.completedSets||[]).map(normalizeSeries).forEach((series,index)=>{
      if(series.warmup) return;
      const weight=numericValue(series.weight);
      const reps=numericValue(series.reps);
      if(weight===null||reps===null||weight<=0||reps<=0) return;
      performances.push({
        workoutId:workout.id,
        date:workout.date,
        session:workout.session,
        set:index+1,
        weight,
        reps,
        volume:weight*reps,
        e1rm:estimatedOneRepMax(weight,reps)
      });
    });
  });
  return performances;
}
function recordStats(name){
  const performances=allExercisePerformances(name);
  if(!performances.length) return null;
  const maxWeight=performances.reduce((best,p)=>p.weight>best.weight?p:best,performances[0]);
  const bestVolumeSet=performances.reduce((best,p)=>p.volume>best.volume?p:best,performances[0]);
  const bestE1rm=performances.reduce((best,p)=>p.e1rm>best.e1rm?p:best,performances[0]);
  const maxReps=performances.reduce((best,p)=>p.reps>best.reps?p:best,performances[0]);
  return {performances,maxWeight,bestVolumeSet,bestE1rm,maxReps};
}
function recordsForWorkout(workout,historyInput=null){
  const records=[];
  workout.exercises.forEach(exercise=>{
    const previous=allExercisePerformances(exercise.name,workout.id,historyInput);
    const previousMaxWeight=previous.length?Math.max(...previous.map(p=>p.weight)):0;
    const previousBestE1rm=previous.length?Math.max(...previous.map(p=>p.e1rm)):0;
    const previousBestVolume=previous.length?Math.max(...previous.map(p=>p.volume)):0;

    const current=exercise.series.map(normalizeSeries).map((series,index)=>{
      if(series.warmup) return null;
      const weight=numericValue(series.weight);
      const reps=numericValue(series.reps);
      if(weight===null||reps===null||weight<=0||reps<=0) return null;
      return {
        set:index+1,
        weight,
        reps,
        volume:weight*reps,
        e1rm:estimatedOneRepMax(weight,reps)
      };
    }).filter(Boolean);

    if(!current.length) return;
    const currentMaxWeight=current.reduce((best,p)=>p.weight>best.weight?p:best,current[0]);
    const currentBestE1rm=current.reduce((best,p)=>p.e1rm>best.e1rm?p:best,current[0]);
    const currentBestVolume=current.reduce((best,p)=>p.volume>best.volume?p:best,current[0]);

    if(currentMaxWeight.weight>previousMaxWeight){
      records.push({
        exercise:exercise.name,
        type:"Peso máximo",
        value:`${formatWeight(currentMaxWeight.weight)} kg`
      });
    }
    if(currentBestE1rm.e1rm>previousBestE1rm+0.05){
      records.push({
        exercise:exercise.name,
        type:"Fuerza estimada",
        value:`${formatWeight(Math.round(currentBestE1rm.e1rm*10)/10)} kg e1RM`
      });
    }
    if(currentBestVolume.volume>previousBestVolume){
      records.push({
        exercise:exercise.name,
        type:"Mejor serie por volumen",
        value:`${formatWeight(currentBestVolume.weight)} × ${currentBestVolume.reps}`
      });
    }
  });
  return records;
}
function progressionStatus(name){
  const routineItem=activeRoutineSessions().flatMap(session=>session.exercises)
    .find(item=>item.name===name);
  const history=getExerciseHistory(name);
  if(!history.length) return {
    level:"neutral",
    title:"Sin referencia",
    text:"Completa una sesión para empezar a calcular la progresión."
  };
  const last=history.at(-1);
  const previous=history.at(-2);
  const range=parseRepRange(routineItem?.target||"");
  if(!range) return {
    level:"neutral",
    title:"Seguimiento disponible",
    text:"GymOS seguirá mostrando tus récords y evolución de volumen."
  };
  const valid=last.series.filter(s=>s.weight!==null&&s.reps!==null);
  const sameWeight=valid.length&&valid.every(s=>s.weight===valid[0].weight);
  const increment=Math.max(0,Number(routineItem?.increment)||0);
  if(valid.length&&sameWeight&&valid.every(s=>s.reps>=range.max)){
    return {
      level:"up",
      title:"Listo para subir",
      text:increment>0
        ?`Próxima referencia: ${formatWeight(valid[0].weight+increment)} kg.`
        :"Has completado el rango alto; ajusta la progresión según el ejercicio."
    };
  }
  if(previous&&last.volume>previous.volume){
    const pct=((last.volume-previous.volume)/previous.volume)*100;
    return {
      level:"positive",
      title:"Progresando",
      text:`El volumen aumentó un ${pct.toFixed(1).replace(".",",")}% respecto a la sesión anterior.`
    };
  }
  if(previous&&last.volume<previous.volume*0.9){
    return {
      level:"caution",
      title:"Sesión por debajo de la referencia",
      text:"Repite la carga y valora sueño, fatiga, técnica y RIR antes de modificarla."
    };
  }
  return {
    level:"hold",
    title:"Consolidando",
    text:"Mantén la carga e intenta mejorar alguna repetición sin perder técnica."
  };
}
function miniBars(rows){
  const recent=rows.slice(-6);
  const max=Math.max(...recent.map(r=>r.volume),1);
  return `<div class="mini-chart">${recent.map(r=>{
    const height=Math.max(8,(r.volume/max)*100);
    return `<div class="mini-bar-wrap" title="${formatDate(r.date)}: ${compactNumber(r.volume)} kg">
      <div class="mini-bar" style="height:${height}%"></div>
      <small>${new Date(r.date).toLocaleDateString("es-ES",{day:"2-digit",month:"2-digit"})}</small>
    </div>`;
  }).join("")}</div>`;
}
const NAVIGATION_GROUPS=[
  {label:"Entrenamiento",items:[
    ["home","home","Inicio"],["workout","dumbbell","Entrenar"],["recovery","recovery","Recuperación"]
  ]},
  {label:"Seguimiento",items:[
    ["progressDashboard","progress","Progreso"],["routineHub","routine","Rutinas"],["coach","coach","Coach"],["nutrition","nutrition","Nutrición"]
  ]},
  {label:"Planificación",items:[
    ["exerciseLibrary","library","Biblioteca"]
  ]}
];
const NAVIGATION_FOOTER_ITEMS=[
  ["settings","settings","Ajustes"]
];
const NAVIGATION_ICON_PATHS={
  home:'<path d="M3 10.8 12 3l9 7.8"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-7h5v7"/>',
  dumbbell:'<path d="M6 7v10M18 7v10M3 9v6M21 9v6M6 12h12"/>',
  recovery:'<path d="M3 12h4l2-4 3 8 2-4h7"/><path d="M20.8 5.7a5.4 5.4 0 0 0-7.6 0L12 6.9l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 22l8.8-8.7a5.4 5.4 0 0 0 0-7.6Z"/>',
  progress:'<path d="M4 19V9M10 19V5M16 19v-7M22 19V3"/><path d="m4 13 6-5 6 2 6-6"/>',
  coach:'<path d="M21 12a8 8 0 0 1-8 8H6l-4 3v-7a8 8 0 1 1 19-4Z"/><path d="m12 7 .8 2.1 2.2.2-1.7 1.5.5 2.2-1.8-1.2-1.8 1.2.5-2.2-1.7-1.5 2.2-.2Z"/>',
  nutrition:'<path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M16 3v18M16 3c3 1 4 4 4 7h-4"/>',
  routine:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M8 14h3M8 17h6"/>',
  library:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
  expand:'<path d="m9 18 6-6-6-6"/>',
  collapse:'<path d="m15 18-6-6 6-6"/>'
};
function navigationIcon(name){
  const paths=NAVIGATION_ICON_PATHS[name]||NAVIGATION_ICON_PATHS.library;
  return `<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">${paths}</svg>`;
}
let navigationPanelOpen=false;
let navigationSyncDetailOpen=false;
let navigationReturnFocus=null;
let shellAppearancePanelOpen=false;
let shellAccountPanelOpen=false;
let shellPanelReturnAction=null;
function navigationExpandedPreference(){
  return localStorage.getItem(GYMOS_NAV_EXPANDED_KEY)==="1";
}
function navigationDestinations(){
  return [...NAVIGATION_GROUPS.flatMap(group=>group.items),...NAVIGATION_FOOTER_ITEMS];
}
function navigationDestinationForScreen(screen=state.screen){
  const direct=new Set(navigationDestinations().map(item=>item[0]));
  if(direct.has(screen)) return screen;
  if(screen==="workoutComplete") return "workout";
  if(["history","stats","records","body","editWorkout"].includes(screen)) return "progressDashboard";
  if(["routineWorkflow","plan","routineEditor","blocks","blockEditor","blockAnalytics","globalAnalytics","exerciseAnalytics"].includes(screen)) return "routineHub";
  if(["exerciseLibraryEditor","exerciseDetail","favoriteExercises","exerciseSubstitution","substitutionHistory"].includes(screen)) return "exerciseLibrary";
  if(["coachProposal","coachChat","workoutAnalysis","aiSettings"].includes(screen)) return "coach";
  if(["professionalNutrition","professionalNutritionImport","professionalNutritionPlan","professionalNutritionAdapt"].includes(screen)) return "nutrition";
  if(screen==="account") return "account";
  if(["quickActions","backupRestore","developer","health"].includes(screen)) return "settings";
  return "settings";
}
const SHELL_SCREEN_ROUTES={
  history:"Historial",stats:"Estadísticas",records:"Récords",body:"Seguimiento corporal",
  editWorkout:"Editar entrenamiento",plan:"Plan semanal",routineEditor:"Editor",
  blocks:"Bloques",blockEditor:"Editar bloque",blockAnalytics:"Análisis de bloque",
  globalAnalytics:"Análisis global",exerciseAnalytics:"Análisis de ejercicio",
  exerciseLibraryEditor:"Nuevo ejercicio",exerciseDetail:"Detalle de ejercicio",
  favoriteExercises:"Favoritos",exerciseSubstitution:"Sustituir ejercicio",
  substitutionHistory:"Historial de sustituciones",coachProposal:"Propuesta",
  coachChat:"Conversación",workoutAnalysis:"Análisis de sesión",
  aiSettings:"Inteligencia artificial",professionalNutrition:"Planificación profesional",
  professionalNutritionImport:"Importar planificación",professionalNutritionPlan:"Plan profesional",
  professionalNutritionAdapt:"Adaptar planificación",backupRestore:"Copias de seguridad",
  developer:"Diagnóstico",health:"Salud"
};
function shellScreenContext(screen=state.screen){
  const destination=navigationDestinationForScreen(screen);
  const navigationLabel=navigationDestinations().find(item=>item[0]===destination)?.[2];
  return {
    destination,
    title:destination==="account"?"Cuenta":navigationLabel||"Ajustes",
    route:SHELL_SCREEN_ROUTES[screen]||""
  };
}
function shellAccountInitials(){
  return accountInitials(accountDisplayName());
}
function navigationItem(screen,icon,label,active){
  const selected=screen===active;
  const tooltipId=`nav-tooltip-${screen}`;
  return `<button type="button" class="navigation-item ${selected?"active":""}" data-nav="${screen}" aria-label="${esc(label)}" aria-describedby="${tooltipId}" ${selected?'aria-current="page"':""}>
    <span class="navigation-icon" aria-hidden="true">${navigationIcon(icon)}</span><span class="navigation-label">${esc(label)}</span>
    <span class="navigation-tooltip" id="${tooltipId}" role="tooltip">${esc(label)}</span>
  </button>`;
}
function nav(){
  const active=navigationDestinationForScreen();
  const expanded=window.matchMedia("(min-width:1024px)").matches&&navigationExpandedPreference();
  const syncRetry=Boolean(state.syncIssue?.retryable)&&navigator.onLine;
  const accountEmail=String(state.syncUser?.email||"").trim();
  const accountName=accountDisplayName();
  const context=shellScreenContext();
  const accountInitialsValue=shellAccountInitials();
  const appearance=getAppPreferences();
  return `
    <header class="shell-global-topbar">
      <button type="button" class="navigation-menu-button" data-shell-action="toggle" aria-label="Abrir menú" aria-controls="gymosNavigation" aria-expanded="${navigationPanelOpen}">☰</button>
      <div class="shell-screen-context">
        <strong>${esc(context.title)}</strong>
        ${context.route?`<span aria-label="${esc(`${context.title}, ${context.route}`)}">${esc(context.title)} / ${esc(context.route)}</span>`:""}
      </div>
      <div class="shell-global-actions">
        <button type="button" class="shell-sync-trigger ${esc(state.syncStatus)}" data-shell-action="sync-detail" aria-label="${esc(`Sincronización: ${syncStatusLabel()}`)}" aria-controls="shellSyncPanel" aria-expanded="${navigationSyncDetailOpen}">
          <span class="sync-dot ${esc(state.syncStatus)}" data-sync-dot aria-hidden="true"></span>
          <span class="shell-action-label" data-sync-label>${esc(syncStatusLabel())}</span>
        </button>
        <button type="button" class="shell-appearance-trigger" data-shell-action="appearance" aria-label="Abrir preferencias de apariencia" aria-controls="shellAppearancePanel" aria-expanded="${shellAppearancePanelOpen}">
          <span aria-hidden="true">◐</span><span class="shell-action-label">Apariencia</span>
        </button>
        <button type="button" class="shell-account-trigger ${active==="account"?"active":""}" data-shell-action="account-menu" aria-label="Abrir menú de cuenta" aria-controls="shellAccountPanel" aria-expanded="${shellAccountPanelOpen}">
          <span data-account-avatar aria-hidden="true">${esc(accountInitialsValue)}</span><span aria-hidden="true" class="shell-account-chevron">⌄</span>
        </button>
      </div>
    </header>
    ${navigationSyncDetailOpen?`<section id="shellSyncPanel" class="shell-popover shell-sync-panel" role="dialog" aria-label="Estado de sincronización">
      <div class="shell-popover-heading"><span class="sync-dot ${esc(state.syncStatus)}" data-sync-dot aria-hidden="true"></span><strong data-sync-label>${esc(syncStatusLabel())}</strong></div>
      <p data-sync-description>${esc(syncStatusDescription())}</p>
      ${syncRetry?`<button type="button" class="secondary" data-shell-action="sync-retry">Reintentar</button>`:""}
    </section>`:""}
    ${shellAppearancePanelOpen?`<section id="shellAppearancePanel" class="shell-popover shell-appearance-panel" role="dialog" aria-label="Preferencias de apariencia">
      <fieldset>
        <legend>Tema</legend>
        <div class="shell-choice-grid">
          ${[["light","Claro"],["dark","Oscuro"],["system","Sistema"]].map(([value,label])=>`<button type="button" data-shell-appearance="theme" data-value="${value}" aria-pressed="${appearance.theme===value}">${appearance.theme===value?"✓ ":""}${label}</button>`).join("")}
        </div>
      </fieldset>
      <fieldset>
        <legend>Tamaño de texto</legend>
        <div class="shell-choice-grid four">
          ${[["small","A"],["normal","A"],["large","A"],["xlarge","A"]].map(([value,label],index)=>`<button type="button" class="font-choice-${index+1}" data-shell-appearance="fontScale" data-value="${value}" aria-label="Tamaño de texto ${index+1} de 4" aria-pressed="${appearance.fontScale===value}">${appearance.fontScale===value?"✓ ":""}${label}</button>`).join("")}
        </div>
      </fieldset>
      <label class="shell-toggle"><input type="checkbox" data-shell-appearance="highContrast" ${appearance.highContrast?"checked":""}><span>Alto contraste</span></label>
      <label class="shell-toggle"><input type="checkbox" data-shell-appearance="animations" ${appearance.animations?"":"checked"}><span>Reducir movimiento</span></label>
      <button type="button" class="text-button shell-settings-link" data-nav="settings">Más opciones en Ajustes</button>
    </section>`:""}
    ${shellAccountPanelOpen?`<section id="shellAccountPanel" class="shell-popover shell-account-panel" role="menu" aria-label="Menú de cuenta">
      <div class="shell-account-identity">
        <strong>${esc(accountName)}</strong>
        <span title="${esc(accountEmail)}">${esc(accountEmail)}</span>
      </div>
      <button type="button" role="menuitem" data-nav="account">Mi cuenta</button>
      <button type="button" role="menuitem" data-nav="settings">Ajustes</button>
      <button type="button" role="menuitem" class="shell-account-appearance-link" data-shell-action="appearance">Apariencia</button>
      <hr>
      <button type="button" role="menuitem" class="shell-signout-action" data-shell-action="signout">Cerrar sesión</button>
    </section>`:""}
    <aside id="gymosNavigation" class="navigation-rail ${expanded?"expanded":""} ${navigationPanelOpen?"panel-open":""}" aria-label="Navegación de GymOS" ${navigationPanelOpen?'role="dialog" aria-modal="true"':""}>
      <div class="navigation-brand">
        <span class="navigation-brand-mark" aria-hidden="true">G</span>
        <span class="navigation-label">GymOS</span>
      </div>
      <nav class="navigation-groups" aria-label="Secciones">
        ${NAVIGATION_GROUPS.map(group=>`<section class="navigation-group" aria-label="${esc(group.label)}">
          <h2 class="navigation-group-title">${esc(group.label)}</h2>
          ${group.items.map(([screen,icon,label])=>navigationItem(screen,icon,label,active)).join("")}
        </section>`).join("")}
      </nav>
      <div class="navigation-footer">
        ${NAVIGATION_FOOTER_ITEMS.map(([screen,icon,label])=>navigationItem(screen,icon,label,active)).join("")}
        <button type="button" class="navigation-item navigation-expand-button" data-shell-action="toggle" aria-label="${expanded?"Contraer menú":"Expandir menú"}" aria-describedby="nav-tooltip-expand" aria-controls="gymosNavigation" aria-expanded="${expanded||navigationPanelOpen}">
          <span class="navigation-icon" aria-hidden="true">${navigationIcon(expanded?"collapse":"expand")}</span><span class="navigation-label">${expanded?"Contraer menú":"Expandir menú"}</span>
          <span class="navigation-tooltip" id="nav-tooltip-expand" role="tooltip">${expanded?"Contraer menú":"Expandir menú"}</span>
        </button>
      </div>
    </aside>
    <button type="button" class="navigation-backdrop ${navigationPanelOpen?"visible":""}" data-shell-action="close" aria-label="Cerrar menú" tabindex="-1"></button>`;
}
let globalNavigationBound=false;

function arrangeNavigationLandmarks(){
  const shell=document.querySelector(".app-shell");
  const header=shell?.querySelector(".shell-global-topbar");
  const rail=shell?.querySelector("#gymosNavigation");
  const backdrop=shell?.querySelector(".navigation-backdrop");
  if(!shell||!rail) return;
  if(header) shell.insertBefore(header,shell.firstChild);
  shell.insertBefore(rail,header?.nextSibling||shell.firstChild);
  if(backdrop) shell.insertBefore(backdrop,rail.nextSibling);
  const mobile=window.matchMedia("(max-width:767px)").matches;
  if(mobile&&!navigationPanelOpen){
    rail.setAttribute("inert","");
    rail.setAttribute("aria-hidden","true");
  }else{
    rail.removeAttribute("inert");
    rail.removeAttribute("aria-hidden");
  }
}
function closeShellPopover({restoreFocus=true,renderShell=true}={}){
  const returnAction=shellPanelReturnAction;
  const wasOpen=navigationSyncDetailOpen||shellAppearancePanelOpen||shellAccountPanelOpen;
  navigationSyncDetailOpen=false;
  shellAppearancePanelOpen=false;
  shellAccountPanelOpen=false;
  shellPanelReturnAction=null;
  if(!wasOpen) return;
  if(renderShell) render();
  if(restoreFocus&&returnAction){
    queueMicrotask(()=>document.querySelector(`[data-shell-action="${returnAction}"]`)?.focus());
  }
}
function openShellPopover(name,button){
  const wasOpen={
    "sync-detail":navigationSyncDetailOpen,
    appearance:shellAppearancePanelOpen,
    "account-menu":shellAccountPanelOpen
  }[name];
  navigationSyncDetailOpen=name==="sync-detail"&&!wasOpen;
  shellAppearancePanelOpen=name==="appearance"&&!wasOpen;
  shellAccountPanelOpen=name==="account-menu"&&!wasOpen;
  shellPanelReturnAction=wasOpen
    ?null
    :name==="appearance"&&button?.closest?.("#shellAccountPanel")
      ?"account-menu"
      :name;
  render();
  if(!wasOpen){
    queueMicrotask(()=>{
      const panel={
        "sync-detail":"#shellSyncPanel",
        appearance:"#shellAppearancePanel",
        "account-menu":"#shellAccountPanel"
      }[name];
      document.querySelector(`${panel} button,${panel} input`)?.focus();
    });
  }else{
    queueMicrotask(()=>document.querySelector(`[data-shell-action="${name}"]`)?.focus());
  }
}
function updateNavigationExpandControl(button,expanded){
  if(!button) return;
  const text=expanded?"Contraer menú":"Expandir menú";
  button.setAttribute("aria-label",text);
  button.setAttribute("aria-expanded",String(expanded));
  const icon=button.querySelector(".navigation-icon");
  const label=button.querySelector(".navigation-label");
  const tooltip=button.querySelector(".navigation-tooltip");
  if(icon) icon.innerHTML=navigationIcon(expanded?"collapse":"expand");
  if(label) label.textContent=text;
  if(tooltip) tooltip.textContent=text;
}
function closeNavigationPanel({restoreFocus=true}={}){
  navigationPanelOpen=false;
  document.body.classList.remove("navigation-panel-open");
  if(restoreFocus&&navigationReturnFocus?.isConnected) navigationReturnFocus.focus();
  const rail=document.getElementById("gymosNavigation");
  rail?.classList.remove("panel-open");
  rail?.removeAttribute("role");
  rail?.removeAttribute("aria-modal");
  if(window.matchMedia("(max-width:767px)").matches){
    rail?.setAttribute("inert","");
    rail?.setAttribute("aria-hidden","true");
  }
  document.querySelector(".navigation-backdrop")?.classList.remove("visible");
  document.querySelectorAll('[data-shell-action="toggle"]').forEach(button=>button.setAttribute("aria-expanded","false"));
  updateNavigationExpandControl(document.querySelector(".navigation-expand-button"),false);
  navigationReturnFocus=null;
}
function openNavigationPanel(button){
  navigationReturnFocus=button||document.activeElement;
  navigationPanelOpen=true;
  document.body.classList.add("navigation-panel-open");
  const rail=document.getElementById("gymosNavigation");
  rail?.removeAttribute("inert");
  rail?.removeAttribute("aria-hidden");
  rail?.classList.add("panel-open");
  rail?.setAttribute("role","dialog");
  rail?.setAttribute("aria-modal","true");
  document.querySelector(".navigation-backdrop")?.classList.add("visible");
  document.querySelectorAll('[data-shell-action="toggle"]').forEach(item=>item.setAttribute("aria-expanded","true"));
  updateNavigationExpandControl(rail?.querySelector(".navigation-expand-button"),true);
  rail?.querySelector("[data-nav]")?.focus();
}
function toggleNavigation(button){
  if(window.matchMedia("(min-width:1024px)").matches){
    const next=!navigationExpandedPreference();
    localStorage.setItem(GYMOS_NAV_EXPANDED_KEY,next?"1":"0");
    document.body.classList.toggle("navigation-expanded",next);
    document.getElementById("gymosNavigation")?.classList.toggle("expanded",next);
    updateNavigationExpandControl(button,next);
    return;
  }
  if(navigationPanelOpen) closeNavigationPanel();
  else openNavigationPanel(button);
}

function navigateToScreen(screen){
  closeShellPopover({restoreFocus:false,renderShell:false});
  closeNavigationPanel({restoreFocus:false});
  if(state.screen==="workout"&&screen!=="workout"){
    flushWorkoutDraftProgress({scheduleSync:false,silent:true});
  }
  if(screen!=="workout") stopWorkoutSessionTimer();
  if(screen!=="exerciseLibrary") cancelExerciseLibrarySearchDebounce();
  try{
    stopAllExerciseTimers();
  }catch(error){
    console.error("Timer cleanup failed during navigation",error);
    state.exerciseTimers={};
  }

  if(screen==="workout"){
    const available=availableRoutineSessions();
    if(!available.length){
      state.screen="home";
      renderHome();
      toast("No hay una sesión disponible para entrenar");
      return;
    }
    persistSelectedRoutineSession(
      state.selectedSessionId||localStorage.getItem(SELECTED_SESSION_ID_KEY)||available[0]
    );
  }

  state.screen=screen;

  try{
    render();
  }catch(error){
    console.error(`Could not render screen: ${screen}`,error);
    const readable="No se pudo abrir esta sección. Vuelve a intentarlo.";
    app.innerHTML=`<div class="app-shell">
      <main class="screen">
        <section class="card warning-card">
          <h1>No se pudo abrir esta sección</h1>
          <p class="subtle">${readable}</p>
          <button type="button" id="recoverHome" class="primary full">Volver a Inicio</button>
        </section>
      </main>
      ${nav(screen)}
    </div>`;
    document.getElementById("recoverHome").onclick=()=>{
      state.screen="home";
      renderHome();
    };
  }
}

function bindNav(){
  arrangeNavigationLandmarks();
  if(globalNavigationBound) return;
  globalNavigationBound=true;

  document.addEventListener("click",event=>{
    const button=event.target.closest?.("[data-nav]");
    if(button){
      event.preventDefault();
      event.stopPropagation();
      navigateToScreen(button.dataset.nav);
      return;
    }
    const appearanceButton=event.target.closest?.("button[data-shell-appearance]");
    if(appearanceButton){
      event.preventDefault();
      saveAppPreferences({
        [appearanceButton.dataset.shellAppearance]:appearanceButton.dataset.value
      });
      render();
      return;
    }
    const actionButton=event.target.closest?.("[data-shell-action]");
    if(!actionButton){
      if((navigationSyncDetailOpen||shellAppearancePanelOpen||shellAccountPanelOpen)&&
        !event.target.closest?.(".shell-popover")){
        closeShellPopover();
      }
      return;
    }
    event.preventDefault();
    const action=actionButton.dataset.shellAction;
    if(action==="toggle") toggleNavigation(actionButton);
    else if(action==="close") closeNavigationPanel();
    else if(["sync-detail","appearance","account-menu"].includes(action)){
      openShellPopover(action,actionButton);
    }else if(action==="sync-retry"){
      retrySyncFromNavigation();
    }else if(action==="signout"&&confirm("¿Cerrar sesión en este dispositivo?")){
      closeNavigationPanel({restoreFocus:false});
      actionButton.disabled=true;
      signOutSync().then(()=>{
        state.screen="account";
        render();
      }).catch(()=>{
        actionButton.disabled=false;
        toast("No se pudo cerrar la sesión. Inténtalo de nuevo.");
      });
    }
  });
  document.addEventListener("change",event=>{
    const control=event.target.closest?.("[data-shell-appearance]");
    if(!control) return;
    const key=control.dataset.shellAppearance;
    const value=key==="animations"?!control.checked:Boolean(control.checked);
    saveAppPreferences({[key]:value});
    render();
  });
  document.addEventListener("keydown",event=>{
    if(event.key!=="Escape") return;
    if(navigationSyncDetailOpen||shellAppearancePanelOpen||shellAccountPanelOpen){
      event.preventDefault();
      closeShellPopover();
    }else if(navigationPanelOpen){
      event.preventDefault();
      closeNavigationPanel();
    }
  });
  window.matchMedia("(max-width:767px)").addEventListener?.("change",()=>{
    closeShellPopover({restoreFocus:false,renderShell:false});
    closeNavigationPanel({restoreFocus:false});
    render();
  });
  document.body.classList.toggle("navigation-expanded",navigationExpandedPreference());
}
function toast(msg){
  const el=document.createElement("div"); el.className="toast"; el.textContent=msg;
  el.setAttribute("role","status");
  el.setAttribute("aria-live","polite");
  el.setAttribute("aria-atomic","true");
  document.body.appendChild(el); setTimeout(()=>el.remove(),1800);
}


const ONBOARDING_KEY="gymos:onboardingProfile";

function getOnboardingProfile(){
  try{
    const value=JSON.parse(localStorage.getItem(ONBOARDING_KEY)||"null");
    return value&&typeof value==="object"?value:null;
  }catch(error){
    return null;
  }
}
function onboardingCompleted(){
  return Boolean(getOnboardingProfile()?.completedAt);
}
function saveOnboardingProfile(profile){
  localStorage.setItem(ONBOARDING_KEY,JSON.stringify(profile));
  markLocalUpdated();
}
function canonicalOnboardingGoal(value){
  return window.GymOSProfileData?.migrateLegacyGoal(value)?.id||null;
}
function onboardingEquipmentPreset(equipment){
  const values=new Set(Array.isArray(equipment)?equipment:[]);
  const full=window.GymOSExerciseDomain?.EQUIPMENT_PRESETS?.full||[];
  if(full.length&&full.every(item=>values.has(item))) return "full";
  if(values.has("dumbbells")||values.has("bench")) return "basic";
  if(values.has("bodyweight")||values.has("mat")) return "bodyweight";
  return "full";
}
function onboardingEquipmentValues(preset){
  const presets=window.GymOSExerciseDomain?.EQUIPMENT_PRESETS||{};
  if(preset==="full") return [...(presets.full||[])];
  if(preset==="basic") return [...(presets.home_dumbbells||["bodyweight","mat","dumbbells","bench"])];
  return [...(presets.bodyweight||["bodyweight","mat"])];
}
function suggestedTrainingPhase(goal){
  return window.GymOSProfileData?.phaseFromGoal(goal)||"adaptation";
}
function newOnboardingDraft(){
  const current=getOnboardingProfile()||{};
  const userProfile=window.GymOSProfileData?.getUserProfile?.()||{};
  const goalCycle=window.GymOSProfileData?.getActiveGoalCycle?.()||{};
  const trainingPhase=window.GymOSProfileData?.getActiveTrainingPhase?.()||{};
  const primaryGoal=goalCycle.primaryGoal||canonicalOnboardingGoal(current.primaryGoal||current.goal)||"return_to_training";
  const secondaryGoals=Array.isArray(goalCycle.secondaryGoals)
    ?goalCycle.secondaryGoals.slice(0,2)
    :(Array.isArray(current.secondaryGoals)?current.secondaryGoals.slice(0,2):[]);
  return {
    name:userProfile.name||current.name||accountDisplayName(state.syncUser)||"",
    age:userProfile.age??current.age??"",
    sex:userProfile.sex??current.sex??"",
    height:userProfile.heightCm??current.height??"",
    weight:userProfile.weightKg??current.weight??"",
    experience:userProfile.trainingExperience||current.experience||"beginner",
    primaryGoal,
    secondaryGoals:secondaryGoals.filter(goal=>goal!==primaryGoal),
    phase:trainingPhase.type||current.phase||suggestedTrainingPhase(primaryGoal),
    phaseConfirmed:Boolean(trainingPhase.type||current.phase),
    days:Number(userProfile.weeklyAvailability??current.days)||3,
    duration:Number(userProfile.preferredSessionDurationMin??current.duration)||50,
    location:userProfile.trainingLocation&&userProfile.trainingLocation!=="other"
      ?({mixed:"both"}[userProfile.trainingLocation]||userProfile.trainingLocation)
      :(current.location||"gym"),
    equipment:Array.isArray(userProfile.availableEquipment)&&userProfile.availableEquipment.length
      ?onboardingEquipmentPreset(userProfile.availableEquipment)
      :(current.equipment||"full"),
    painAreas:Array.isArray(userProfile.painAreas)?userProfile.painAreas
      :(Array.isArray(current.painAreas)?current.painAreas:[]),
    injuryNotes:userProfile.injuries?.join(", ")||current.injuryNotes||"",
    medicalRestriction:userProfile.medicalRestrictions?.length?"yes":(current.medicalRestriction||"no"),
    avoidExercises:userProfile.avoidedExercises?.join(", ")||current.avoidExercises||"",
    preference:userProfile.trainingPreferences?.style||current.preference||"mixed",
    cardio:userProfile.trainingPreferences?.cardio||current.cardio||"walking",
    completedAt:current.completedAt||null
  };
}
function ensureOnboardingDraft(){
  if(!state.onboardingDraft) state.onboardingDraft=newOnboardingDraft();
  return state.onboardingDraft;
}
function onboardingGoalLabel(value){
  const goal=canonicalOnboardingGoal(value)||value;
  return window.GymOSProfileData?.GOAL_OPTIONS?.find(option=>option.id===goal)?.label||"Entrenamiento general";
}
function onboardingExperienceLabel(value){
  return ({
    new:"Nunca he entrenado",beginner:"Principiante o retomando",
    returning:"Principiante o retomando",intermediate:"Intermedio",advanced:"Avanzado"
  })[value]||"Principiante o retomando";
}
function onboardingLocationLabel(value){
  return ({gym:"Gimnasio",home:"Casa",both:"Gimnasio y casa",mixed:"Gimnasio y casa",other:"Otro lugar"})[value]||"Otro lugar";
}
function trainingPhaseLabel(value){
  return window.GymOSProfileData?.TRAINING_PHASE_OPTIONS?.find(option=>option.id===value)?.label||"Sin configurar";
}
function trainingProfileMissingStep(missing=[]){
  if(missing.some(item=>["Objetivo principal","Fase de entrenamiento"].includes(item))) return 2;
  if(missing.some(item=>/Días disponibles|Duración de sesión|Lugar de entrenamiento|Equipamiento/.test(item))) return 3;
  return 1;
}
function openTrainingProfileEditor(step=1,{returnScreen="routineHub",createProposal=false}={}){
  state.onboardingDraft=newOnboardingDraft();
  state.onboardingStep=Math.max(1,Math.min(5,Number(step)||1));
  state.onboardingMessage=null;
  state.onboardingReturnScreen=returnScreen;
  state.onboardingCreateProposalAfterSave=createProposal;
  state.onboardingExpandedGoals=false;
  state.onboardingPhaseEditorOpen=false;
  state.screen="onboarding";
  renderOnboarding();
}
function persistTrainingProfileData(profile){
  const api=window.GymOSProfileData;
  if(!api) throw new Error("El modelo de perfil no está disponible.");
  const goalValidation=api.validateGoalSelection(profile.primaryGoal,profile.secondaryGoals);
  if(!goalValidation.valid) throw new Error(goalValidation.errors[0]);
  if(!api.TRAINING_PHASE_OPTIONS.some(option=>option.id===profile.phase)){
    throw new Error("Selecciona y confirma una fase de entrenamiento.");
  }
  const routineBefore=localStorage.getItem("gymos:routine");
  const historyBefore=localStorage.getItem("gymos:history");
  const existingProfile=api.getUserProfile()||{};
  const savedProfile=api.saveUserProfile({
    ...existingProfile,
    name:profile.name,
    age:profile.age,
    sex:profile.sex,
    heightCm:profile.height,
    weightKg:profile.weight,
    trainingExperience:profile.experience,
    weeklyAvailability:Number(profile.days),
    preferredSessionDurationMin:Number(profile.duration),
    trainingLocation:profile.location,
    availableEquipment:onboardingEquipmentValues(profile.equipment),
    painAreas:profile.painAreas,
    injuries:profile.injuryNotes,
    medicalRestrictions:profile.medicalRestriction==="yes"
      ?(existingProfile.medicalRestrictions?.length?existingProfile.medicalRestrictions:["Pendiente de concretar"])
      :[],
    avoidedExercises:profile.avoidExercises,
    trainingPreferences:{style:profile.preference,cardio:profile.cardio}
  },{mark:false});
  if(!api.getCurrentLifeState()){
    api.setCurrentLifeState({type:"general",startedAt:new Date().toISOString().slice(0,10)},{mark:false});
  }
  const activeGoal=api.getActiveGoalCycle();
  const sameGoal=activeGoal?.primaryGoal===goalValidation.primaryGoal&&
    JSON.stringify(activeGoal?.secondaryGoals||[])===JSON.stringify(goalValidation.secondaryGoals);
  const goal=sameGoal?activeGoal:api.startGoalCycle({
    primaryGoal:goalValidation.primaryGoal,
    secondaryGoals:goalValidation.secondaryGoals,
    startedAt:new Date().toISOString().slice(0,10),
    changeReason:activeGoal?"Actualizado desde el perfil de entrenamiento":"Configurado desde el perfil de entrenamiento"
  },{mark:false});
  const activePhase=api.getActiveTrainingPhase();
  const phase=activePhase?.type===profile.phase?activePhase:api.startTrainingPhase({
    type:profile.phase,
    goalCycleId:goal?.id||null,
    startedAt:new Date().toISOString().slice(0,10),
    notes:"Fase confirmada por el usuario."
  },{mark:false});
  if(
    routineBefore!==localStorage.getItem("gymos:routine")||
    historyBefore!==localStorage.getItem("gymos:history")
  ){
    throw new Error("El perfil no puede modificar la rutina ni el historial.");
  }
  markLocalUpdated();
  return {
    userProfile:savedProfile,
    currentLifeState:api.getCurrentLifeState(),
    activeGoalCycle:goal,
    activeTrainingPhase:phase,
    generationPreferences:{
      preferredExerciseIds:getFavoriteExercises().map(exercise=>exercise.id),
      style:savedProfile.trainingPreferences?.style||"",
      cardio:savedProfile.trainingPreferences?.cardio||""
    }
  };
}
function selectedPain(profile,area){
  return profile.painAreas.includes(area)?"checked":"";
}
function safeExercise(base,alternatives,profile){
  const avoided=String(profile.avoidExercises||"").toLowerCase();
  const pain=new Set(profile.painAreas||[]);
  const candidates=[base,...alternatives].filter(Boolean);
  return candidates.find(item=>{
    const name=item.name.toLowerCase();
    if(avoided&&avoided.split(/[,;\n]+/).some(term=>term.trim()&&name.includes(term.trim()))) return false;
    if(pain.has("knee")&&item.flags?.includes("knee")) return false;
    if(pain.has("back")&&item.flags?.includes("back")) return false;
    if(pain.has("shoulder")&&item.flags?.includes("shoulder")) return false;
    if(pain.has("hip")&&item.flags?.includes("hip")) return false;
    return true;
  })||candidates[candidates.length-1];
}
function generatedExercise(name,target,sets=3,increment=2.5,type="peso"){
  return {name,target,sets,increment,type};
}
function buildRecommendedRoutine(profile){
  const beginner=["new","beginner"].includes(profile.experience);
  const sets=beginner?2:3;
  const repMain=profile.goal==="strength"?"5–8 reps":"8–12 reps";
  const repAccessory="10–15 reps";
  const kneeSafe=safeExercise(
    {name:"Prensa de piernas",flags:["knee"]},
    [{name:"Sentadilla a cajón",flags:["knee"]},{name:"Puente de glúteo en máquina",flags:[]}],
    profile
  );
  const hingeSafe=safeExercise(
    {name:"Peso muerto rumano con mancuernas",flags:["back"]},
    [{name:"Curl femoral sentado",flags:[]},{name:"Hip thrust en máquina",flags:[]}],
    profile
  );
  const chestSafe=safeExercise(
    {name:"Press de pecho en máquina",flags:["shoulder"]},
    [{name:"Press con mancuernas agarre neutro",flags:["shoulder"]},{name:"Pec deck con rango cómodo",flags:[]}],
    profile
  );
  const shoulderSafe=safeExercise(
    {name:"Press de hombro en máquina",flags:["shoulder"]},
    [{name:"Elevaciones laterales en máquina",flags:["shoulder"]},{name:"Face pull ligero",flags:[]}],
    profile
  );
  const rowSafe=safeExercise(
    {name:"Remo sentado con apoyo",flags:["back"]},
    [{name:"Remo pecho apoyado",flags:[]},{name:"Jalón al pecho agarre neutro",flags:[]}],
    profile
  );

  const routine={
    A:[
      generatedExercise(chestSafe.name,repMain,sets),
      generatedExercise(rowSafe.name,repMain,sets),
      generatedExercise(kneeSafe.name,"10–12 reps",sets),
      generatedExercise("Curl femoral sentado",repAccessory,sets),
      generatedExercise("Elevaciones laterales",repAccessory,2),
      generatedExercise("Plancha o dead bug","30–45 s",2,0,"tiempo")
    ],
    B:[
      generatedExercise(hingeSafe.name,repMain,sets),
      generatedExercise("Jalón al pecho agarre neutro",repMain,sets),
      generatedExercise(shoulderSafe.name,repMain,sets),
      generatedExercise((profile.painAreas||[]).includes("knee")?"Extensión de cadera en máquina":"Zancada asistida","8–12 por pierna",sets),
      generatedExercise("Curl de bíceps en polea",repAccessory,2),
      generatedExercise("Tríceps en polea",repAccessory,2)
    ],
    C:[
      generatedExercise(kneeSafe.name,repMain,sets),
      generatedExercise("Press inclinado en máquina",repMain,sets),
      generatedExercise("Remo pecho apoyado",repMain,sets),
      generatedExercise("Hip thrust en máquina","8–12 reps",sets),
      generatedExercise("Face pull",repAccessory,2),
      generatedExercise("Gemelo en máquina",repAccessory,2)
    ]
  };

  if(Number(profile.days)<=2){
    routine.A=routine.A.slice(0,6);
    routine.B=routine.B.slice(0,6);
    routine.C=[];
  }
  if(Number(profile.duration)<=35){
    Object.keys(routine).forEach(key=>routine[key]=routine[key].slice(0,5));
  }
  return normalizeRoutine(routine);
}
function onboardingSafetyMessage(profile){
  const hasPain=(profile.painAreas||[]).length>0||String(profile.injuryNotes||"").trim();
  if(profile.medicalRestriction==="yes"){
    return "Has indicado una restricción médica. GymOS no debe sustituir la valoración de un profesional sanitario. La rutina evita decisiones agresivas y debe revisarse antes de empezar.";
  }
  if(hasPain){
    return "La propuesta evita de forma básica los movimientos relacionados con las zonas señaladas. Si un ejercicio provoca dolor, no lo hagas y usa una alternativa sin dolor.";
  }
  return "Empieza con cargas cómodas, deja 3–4 repeticiones en reserva y prioriza una técnica estable durante las primeras semanas.";
}
function renderOnboarding(){
  if(!isAppAuthenticated()){
    render();
    return;
  }
  const p=ensureOnboardingDraft();
  const step=Math.max(1,Math.min(5,Number(state.onboardingStep)||1));
  const progress=step*20;

  let content="";
  if(step===1){
    content=`
      <div class="onboarding-step-icon" aria-hidden="true">01</div>
      <span class="section-kicker">TU PERFIL</span>
      <h1>Empecemos por ti</h1>
      <p class="onboarding-lead">Necesitamos cuatro datos para ajustar tu punto de partida.</p>
      <div class="onboarding-grid two">
        <label><span>Nombre</span><input id="obName" type="text" value="${esc(p.name)}" maxlength="80"></label>
        <label><span>Edad</span><input id="obAge" type="number" inputmode="numeric" min="14" max="100" value="${esc(p.age)}" placeholder="Ej. 34"></label>
        <label><span>Altura (cm)</span><input id="obHeight" type="number" inputmode="decimal" min="120" max="230" value="${esc(p.height)}" placeholder="Ej. 178"></label>
        <label><span>Peso (kg)</span><input id="obWeight" type="number" inputmode="decimal" step="0.1" min="35" max="300" value="${esc(p.weight)}" placeholder="Ej. 78,5"></label>
      </div>
      <label><span>Sexo (opcional)</span><select id="obSex">
        <option value="" ${p.sex===""?"selected":""}>Prefiero no indicarlo</option>
        <option value="male" ${p.sex==="male"?"selected":""}>Hombre</option>
        <option value="female" ${p.sex==="female"?"selected":""}>Mujer</option>
        <option value="other" ${p.sex==="other"?"selected":""}>Otro</option>
      </select></label>`;
  }else if(step===2){
    const goalOptions=(window.GymOSProfileData?.GOAL_OPTIONS||[]).filter(option=>option.id!=="custom");
    const phaseOptions=(window.GymOSProfileData?.TRAINING_PHASE_OPTIONS||[]).filter(option=>option.id!=="custom");
    const goalView=window.GymOSRoutineWorkflowUI.goalSelectionViewModel(goalOptions,{
      primaryGoal:p.primaryGoal,
      secondaryGoals:p.secondaryGoals,
      expanded:state.onboardingExpandedGoals
    });
    const goalPresentation={
      fat_loss:{icon:"↘",title:"Perder grasa",description:"Mejorar composición corporal"},
      muscle_gain:{icon:"+",title:"Ganar masa muscular",description:"Construir músculo progresivamente"},
      strength_gain:{icon:"↑",title:"Ganar fuerza",description:"Progresar en cargas y control"},
      general_health:{icon:"○",title:"Mejorar salud",description:"Sentirte mejor y moverte más"},
      return_to_training:{icon:"↺",title:"Retomar el gimnasio",description:"Volver con una progresión segura"},
      maintenance:{icon:"=",title:"Mantenerme",description:"Conservar fuerza y hábitos"}
    };
    const phaseSuggested=suggestedTrainingPhase(p.primaryGoal);
    const phaseIsSuggested=p.phase===phaseSuggested;
    content=`
      <div class="onboarding-step-icon" aria-hidden="true">02</div>
      <span class="section-kicker">OBJETIVO</span>
      <h1>¿Cuál es tu objetivo principal?</h1>
      <p class="onboarding-lead">Elige una única prioridad. Esta decisión dirige la dosificación central de la rutina.</p>
      <div class="choice-card-grid goal-choice-grid">
        ${goalView.visible.map(option=>{
          const presentation=goalPresentation[option.id]||{
            icon:"·",title:option.label,description:"Objetivo complementario de entrenamiento"
          };
          return `<label class="choice-card goal-choice-card ${option.primarySelected?"selected":""}">
          <input type="radio" name="obPrimaryGoal" value="${esc(option.id)}" ${option.primarySelected?"checked":""}>
          <span class="choice-icon" aria-hidden="true">${esc(presentation.icon)}</span>
          <span class="choice-copy"><strong>${esc(presentation.title)}</strong><small>${esc(presentation.description)}</small></span>
          <span class="choice-check" aria-hidden="true">✓</span>
        </label>`;
        }).join("")}
      </div>
      ${goalView.hasAdditional?`<button id="toggleMoreGoals" class="text-button onboarding-more-goals" type="button" aria-expanded="${goalView.expanded}">
        ${goalView.expanded?"Ver menos objetivos":"Ver más objetivos"}
      </button>`:""}
      <div class="onboarding-secondary-goals">
        <div class="secondary-goal-heading"><h2>¿Tienes otros objetivos?</h2><span id="secondaryGoalHelp" role="status">${goalView.secondaryCount} de 2 seleccionados</span></div>
        <p class="subtle">Puedes seleccionar hasta dos. Nunca sustituirán el objetivo principal.</p>
        <div class="secondary-goal-grid">
          ${goalView.visible.map(option=>`<label class="secondary-goal-chip ${option.secondarySelected?"selected":""} ${option.secondaryDisabled?"unavailable":""}">
            <input type="checkbox" name="obSecondaryGoal" value="${esc(option.id)}"
              ${option.secondarySelected?"checked":""} ${option.secondaryDisabled?"disabled":""}>
            <span>${esc(goalPresentation[option.id]?.title||option.label)}</span>
          </label>`).join("")}
        </div>
      </div>
      <section class="onboarding-phase-card">
        <div class="onboarding-phase-copy">
          <span class="section-kicker">${phaseIsSuggested?"FASE RECOMENDADA":"FASE ELEGIDA"}</span>
          <strong>${esc(trainingPhaseLabel(p.phase))}</strong>
          <small>${phaseIsSuggested?"Basada en tu objetivo principal":"Elegida para tu situación actual"}</small>
        </div>
        <button id="togglePhaseEditor" class="text-button" type="button" aria-expanded="${state.onboardingPhaseEditorOpen}">${state.onboardingPhaseEditorOpen?"Cerrar":"Cambiar fase"}</button>
        ${state.onboardingPhaseEditorOpen?`<label class="onboarding-phase-selector"><span>Fase de entrenamiento</span><select id="obPhase">
          ${phaseOptions.map(option=>`<option value="${esc(option.id)}" ${p.phase===option.id?"selected":""}>${esc(option.label)}</option>`).join("")}
        </select></label>`:""}
      </section>
      <label><span>Experiencia</span><select id="obExperience">
        <option value="new" ${p.experience==="new"?"selected":""}>Nunca he entrenado</option>
        <option value="beginner" ${["beginner","returning"].includes(p.experience)?"selected":""}>Principiante o volviendo tras una pausa</option>
        <option value="intermediate" ${p.experience==="intermediate"?"selected":""}>Intermedio</option>
        <option value="advanced" ${p.experience==="advanced"?"selected":""}>Avanzado</option>
      </select></label>`;
  }else if(step===3){
    content=`
      <div class="onboarding-step-icon" aria-hidden="true">03</div>
      <span class="section-kicker">DISPONIBILIDAD</span>
      <h1>Diseñemos algo sostenible</h1>
      <p class="onboarding-lead">La mejor rutina es la que encaja de verdad en tu semana.</p>
      <div class="onboarding-grid two">
        <label><span>Días por semana</span><select id="obDays">
          ${[2,3,4,5].map(v=>`<option value="${v}" ${Number(p.days)===v?"selected":""}>${v} días</option>`).join("")}
        </select></label>
        <label><span>Tiempo por sesión</span><select id="obDuration">
          ${[[30,"30 min"],[45,"45 min"],[50,"50–60 min"],[75,"60–75 min"]].map(([v,l])=>`<option value="${v}" ${Number(p.duration)===v?"selected":""}>${l}</option>`).join("")}
        </select></label>
      </div>
      <label><span>Dónde entrenas</span><select id="obLocation">
        <option value="gym" ${p.location==="gym"?"selected":""}>Gimnasio</option>
        <option value="home" ${p.location==="home"?"selected":""}>Casa</option>
        <option value="both" ${p.location==="both"?"selected":""}>Gimnasio y casa</option>
      </select></label>
      <label><span>Equipamiento</span><select id="obEquipment">
        <option value="full" ${p.equipment==="full"?"selected":""}>Gimnasio completo</option>
        <option value="basic" ${p.equipment==="basic"?"selected":""}>Mancuernas, banco y bandas</option>
        <option value="bodyweight" ${p.equipment==="bodyweight"?"selected":""}>Peso corporal o equipo mínimo</option>
      </select></label>`;
  }else if(step===4){
    content=`
      <div class="onboarding-step-icon" aria-hidden="true">04</div>
      <span class="section-kicker">SEGURIDAD</span>
      <h1>¿Hay algo que debamos cuidar?</h1>
      <p class="onboarding-lead">Marca las zonas con molestias para evitar propuestas poco adecuadas.</p>
      <div class="pain-grid">
        ${[
          ["shoulder","Hombro"],["back","Espalda"],["knee","Rodilla"],["hip","Cadera"],
          ["elbow","Codo"],["wrist","Muñeca"],["ankle","Tobillo"],["neck","Cuello"]
        ].map(([value,label])=>`<label><input type="checkbox" name="obPain" value="${value}" ${selectedPain(p,value)}><span>${label}</span></label>`).join("")}
      </div>
      <label><span>Lesión, dolor o limitación que debamos conocer</span><textarea id="obInjuryNotes" rows="3" placeholder="Ej. dolor anterior de rodilla al bajar profundo">${esc(p.injuryNotes)}</textarea></label>
      <label><span>¿Tienes alguna restricción médica para entrenar?</span><select id="obMedical">
        <option value="no" ${p.medicalRestriction==="no"?"selected":""}>No</option>
        <option value="yes" ${p.medicalRestriction==="yes"?"selected":""}>Sí o no estoy seguro</option>
      </select></label>
      <label><span>Ejercicios que quieres evitar</span><textarea id="obAvoid" rows="2" placeholder="Sepáralos con comas">${esc(p.avoidExercises)}</textarea></label>`;
  }else{
    content=`
      <div class="onboarding-step-icon success" aria-hidden="true">✓</div>
      <span class="section-kicker">RESUMEN</span>
      <h1>Revisa tu perfil</h1>
      <p class="onboarding-lead">Guardaremos estos datos sin modificar tu rutina ni tu historial.</p>
      <div class="onboarding-summary">
        <div><span>Objetivo principal</span><strong>${esc(onboardingGoalLabel(p.primaryGoal))}</strong></div>
        <div><span>Objetivos secundarios</span><strong>${p.secondaryGoals.length?p.secondaryGoals.map(onboardingGoalLabel).map(esc).join(", "):"Ninguno"}</strong></div>
        <div><span>Fase</span><strong>${esc(trainingPhaseLabel(p.phase))}</strong></div>
        <div><span>Nivel</span><strong>${esc(onboardingExperienceLabel(p.experience))}</strong></div>
        <div><span>Disponibilidad</span><strong>${p.days} días · ${p.duration} min</strong></div>
        <div><span>Entorno</span><strong>${esc(onboardingLocationLabel(p.location))}</strong></div>
      </div>
      <div class="safety-callout"><strong>Antes de empezar</strong><p>${esc(onboardingSafetyMessage(p))}</p></div>
      <label class="consent-row"><input id="obConfirm" type="checkbox"><span>He revisado el objetivo principal, los objetivos secundarios y la fase de entrenamiento.</span></label>`;
  }

  app.innerHTML=`<div class="onboarding-shell ${step===2?"onboarding-goal-step":""}">
    <header class="onboarding-header">
      <div class="onboarding-brand"><span class="onboarding-logo">G</span><div><div class="brand">GymOS</div><div class="subtle">Tu entrenamiento, bien planteado</div></div></div>
      <button id="cancelOnboarding" class="text-button">${state.onboardingReturnScreen?"Cerrar":"Ya lo he realizado"}</button>
    </header>
    <div class="onboarding-stepper" aria-label="Paso ${step} de 5">
      ${[1,2,3,4,5].map(n=>`<span class="${n<step?"done":n===step?"active":""}">${n<step?"✓":n}</span>`).join("")}
    </div>
    <div class="onboarding-progress"><span style="width:${progress}%"></span></div>
    <main class="onboarding-main">
      <section class="onboarding-card">
        ${state.onboardingMessage?`<p class="onboarding-inline-message ${esc(state.onboardingMessage.type||"info")}" role="${state.onboardingMessage.type==="error"?"alert":"status"}">${esc(state.onboardingMessage.text)}</p>`:""}
        ${content}
      </section>
    </main>
    <div class="onboarding-actions-wrap ${step===2?"goal-step-actions":""}">
      <div class="onboarding-actions">
        ${step>1?`<button id="obBack" class="secondary">Atrás</button>`:"<span></span>"}
        ${step===5
          ?`<div class="onboarding-final-actions">
              <button id="obSaveProfile" class="secondary">Guardar perfil</button>
              <button id="obNext" class="primary">Guardar y crear propuesta</button>
            </div>`
          :`<button id="obNext" class="primary">Continuar</button>`}
      </div>
    </div>
  </div>`;

  const cancel=document.getElementById("cancelOnboarding");
  if(cancel) cancel.onclick=()=>{
    if(state.onboardingReturnScreen){
      const destination=state.onboardingReturnScreen;
      state.onboardingDraft=null;
      state.onboardingStep=1;
      state.onboardingMessage=null;
      state.onboardingReturnScreen=null;
      state.onboardingCreateProposalAfterSave=false;
      state.screen=destination;
      render();
      return;
    }
    const existing=getOnboardingProfile()||{};
    const now=new Date().toISOString();
    saveOnboardingProfile({
      ...existing,
      onboardingDismissed:true,
      onboardingCompletedManually:true,
      updatedAt:now
    });
    state.onboardingDraft=null;
    state.onboardingStep=1;
    state.onboardingMessage=null;
    state.screen="home";
    toast("Cuestionario marcado como realizado.");
    renderHome();
    setTimeout(()=>autoSync("cuestionario marcado como realizado"),400);
  };

  const persistStep=()=>{
    if(step===1){
      p.name=document.getElementById("obName").value.trim();
      p.age=document.getElementById("obAge").value;
      p.height=document.getElementById("obHeight").value;
      p.weight=document.getElementById("obWeight").value;
      p.sex=document.getElementById("obSex").value;
    }else if(step===2){
      p.primaryGoal=document.querySelector('input[name="obPrimaryGoal"]:checked')?.value||p.primaryGoal;
      p.secondaryGoals=[...document.querySelectorAll('input[name="obSecondaryGoal"]:checked')]
        .map(input=>input.value)
        .filter(goal=>goal!==p.primaryGoal)
        .slice(0,2);
      p.phase=document.getElementById("obPhase")?.value||p.phase;
      p.phaseConfirmed=true;
      p.experience=document.getElementById("obExperience").value;
    }else if(step===3){
      p.days=Number(document.getElementById("obDays").value);
      p.duration=Number(document.getElementById("obDuration").value);
      p.location=document.getElementById("obLocation").value;
      p.equipment=document.getElementById("obEquipment").value;
    }else if(step===4){
      p.painAreas=[...document.querySelectorAll('input[name="obPain"]:checked')].map(x=>x.value);
      p.injuryNotes=document.getElementById("obInjuryNotes").value.trim();
      p.medicalRestriction=document.getElementById("obMedical").value;
      p.avoidExercises=document.getElementById("obAvoid").value.trim();
    }
    state.onboardingDraft=p;
  };
  document.querySelectorAll('input[name="obPrimaryGoal"]').forEach(input=>{
    input.onchange=()=>{
      p.primaryGoal=input.value;
      p.secondaryGoals=p.secondaryGoals.filter(goal=>goal!==input.value);
      if(!p.phaseConfirmed) p.phase=suggestedTrainingPhase(input.value);
      state.onboardingDraft=p;
      renderOnboarding();
    };
  });
  document.querySelectorAll('input[name="obSecondaryGoal"]').forEach(input=>{
    input.onchange=()=>{
      const selected=[...document.querySelectorAll('input[name="obSecondaryGoal"]:checked')]
        .map(item=>item.value)
        .filter(goal=>goal!==p.primaryGoal);
      if(selected.length>2){
        input.checked=false;
        state.onboardingMessage={type:"info",text:"Puedes seleccionar como máximo dos objetivos secundarios."};
      }else{
        p.secondaryGoals=selected;
        state.onboardingMessage=null;
      }
      state.onboardingDraft=p;
      renderOnboarding();
    };
  });
  const moreGoals=document.getElementById("toggleMoreGoals");
  if(moreGoals) moreGoals.onclick=()=>{
    state.onboardingExpandedGoals=!state.onboardingExpandedGoals;
    renderOnboarding();
  };
  const phaseEditor=document.getElementById("togglePhaseEditor");
  if(phaseEditor) phaseEditor.onclick=()=>{
    state.onboardingPhaseEditorOpen=!state.onboardingPhaseEditorOpen;
    renderOnboarding();
  };
  const phaseSelect=document.getElementById("obPhase");
  if(phaseSelect) phaseSelect.onchange=()=>{
    p.phase=phaseSelect.value;
    p.phaseConfirmed=true;
    state.onboardingDraft=p;
    renderOnboarding();
  };
  const experienceSelect=document.getElementById("obExperience");
  if(experienceSelect) experienceSelect.onchange=()=>{
    p.experience=experienceSelect.value;
    state.onboardingDraft=p;
  };
  const back=document.getElementById("obBack");
  if(back) back.onclick=()=>{persistStep();state.onboardingStep--;renderOnboarding();};
  const saveProfileOnly=document.getElementById("obSaveProfile");
  if(saveProfileOnly) saveProfileOnly.onclick=async()=>{
    persistStep();
    if(!document.getElementById("obConfirm").checked){
      state.onboardingMessage={type:"error",text:"Confirma que has revisado tus respuestas."};
      renderOnboarding();
      return;
    }
    try{
      const now=new Date().toISOString();
      persistTrainingProfileData(p);
      Object.assign(p,{
        goal:p.primaryGoal,
        completedAt:now,
        onboardingDismissed:false,
        onboardingCompletedManually:false,
        updatedAt:now
      });
      saveOnboardingProfile(p);
      state.onboardingDraft=null;
      state.onboardingStep=1;
      state.onboardingMessage=null;
      state.onboardingReturnScreen=null;
      state.onboardingCreateProposalAfterSave=false;
      state.screen="routineHub";
      toast("Perfil guardado. Tu rutina no se ha modificado.");
      renderRoutineHub();
      setTimeout(()=>autoSync("perfil deportivo actualizado"),400);
    }catch(error){
      state.onboardingMessage={type:"error",text:error?.message||"No se pudo guardar el perfil."};
      renderOnboarding();
    }
  };
  document.getElementById("obNext").onclick=async()=>{
    persistStep();
    if(step===1){
      if(!p.name||!p.age||!p.height||!p.weight){
        state.onboardingMessage={type:"error",text:"Completa nombre, edad, altura y peso para continuar."};
        renderOnboarding();
        return;
      }
      if(Number(p.age)<14||Number(p.age)>100){
        state.onboardingMessage={type:"error",text:"Revisa la edad indicada."};
        renderOnboarding();
        return;
      }
    }
    if(step===2){
      const validation=window.GymOSProfileData.validateGoalSelection(p.primaryGoal,p.secondaryGoals);
      if(!validation.valid){
        state.onboardingMessage={type:"error",text:validation.errors[0]};
        renderOnboarding();
        return;
      }
      if(!p.phaseConfirmed){
        state.onboardingMessage={type:"error",text:"Revisa y confirma la fase de entrenamiento."};
        renderOnboarding();
        return;
      }
    }
    if(step<5){
      state.onboardingMessage=null;
      state.onboardingStep++;
      renderOnboarding();
      return;
    }
    if(!document.getElementById("obConfirm").checked){
      state.onboardingMessage={type:"error",text:"Confirma que has revisado tus respuestas."};
      renderOnboarding();
      return;
    }
    try{
      const now=new Date().toISOString();
      persistTrainingProfileData(p);
      Object.assign(p,{
        goal:p.primaryGoal,
        completedAt:now,
        onboardingDismissed:false,
        onboardingCompletedManually:false,
        updatedAt:now
      });
      saveOnboardingProfile(p);
      state.onboardingDraft=null;
      state.onboardingStep=1;
      state.onboardingMessage=null;
      state.onboardingReturnScreen=null;
      state.onboardingCreateProposalAfterSave=false;
      state.screen="routineHub";
      toast("Perfil guardado. Revisa los datos antes de generar.");
      renderRoutineHub();
      setTimeout(()=>autoSync("perfil deportivo actualizado"),400);
    }catch(error){
      state.onboardingMessage={type:"error",text:error?.message||"No se pudo guardar el perfil."};
      renderOnboarding();
    }
  };
}

function isSyncDebugRequested(){
  try{
    const debug=new URLSearchParams(location.search).get("debug");
    return debug==="sync"||debug==="sync-recovery";
  }
  catch(_){return false;}
}
function buildLocalStorageDiagnosticBackup(){
  const storage={};
  for(let index=0;index<localStorage.length;index+=1){
    const key=localStorage.key(index);
    if(!key?.startsWith("gymos:")) continue;
    storage[key]=localStorage.getItem(key);
  }
  return {
    app:"GymOS",
    type:"localStorageDiagnosticBackup",
    exportedAt:new Date().toISOString(),
    storage
  };
}
function downloadLocalStorageDiagnosticBackup(){
  const backup=buildLocalStorageDiagnosticBackup();
  downloadJsonFile(backup,"gymos-local-storage-backup");
}
function maskDiagnosticId(value){
  if(value===null||value===undefined||value==="") return "—";
  const text=String(value);
  if(text.includes("@")) return "[oculto]";
  if(text.length<=8) return `${text.slice(0,2)}…`;
  return `${text.slice(0,6)}…${text.slice(-4)}`;
}
function diagnosticValue(value,{mask=false}={}){
  if(value===null||value===undefined||value==="") return "—";
  if(mask) return maskDiagnosticId(value);
  if(typeof value==="boolean") return value?"sí":"no";
  return String(value);
}
function renderDiagnosticRows(rows){
  return rows.map(([label,value,options])=>`<div class="sync-debug-row">
    <dt>${esc(label)}</dt>
    <dd>${esc(diagnosticValue(value,options))}</dd>
  </div>`).join("");
}
function renderSyncDebugPanel(title,rows){
  return `<section class="sync-debug-panel">
    <h2>${esc(title)}</h2>
    <dl>${renderDiagnosticRows(rows)}</dl>
  </section>`;
}
function syncDebugStyles(){
  return `<style>
    .sync-debug-screen{padding:20px;max-width:1080px;margin:0 auto;color:var(--text,#111827)}
    .sync-debug-screen .section-header{margin-bottom:16px}
    .sync-debug-screen h1{margin:.1rem 0 .35rem;font-size:clamp(1.7rem,6vw,2.4rem)}
    .sync-debug-screen h2{font-size:1rem;margin:0 0 12px;letter-spacing:.08em}
    .sync-debug-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .sync-debug-panel,.sync-debug-status{border:1px solid rgba(120,120,120,.35);border-radius:8px;padding:14px;background:rgba(255,255,255,.78);overflow:hidden}
    .sync-debug-banner{border:1px solid rgba(185,28,28,.35);border-radius:8px;padding:12px 14px;margin-bottom:14px;background:rgba(254,226,226,.72);font-weight:800;color:#991b1b}
    .sync-debug-actions{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 14px}
    .sync-debug-row{display:grid;grid-template-columns:minmax(118px,.8fr) minmax(0,1.2fr);gap:10px;padding:8px 0;border-top:1px solid rgba(120,120,120,.2)}
    .sync-debug-row:first-child{border-top:0}
    .sync-debug-row dt{font-weight:700;color:var(--muted,#4b5563)}
    .sync-debug-row dd{margin:0;overflow-wrap:anywhere;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
    .sync-debug-status{margin-bottom:14px}
    .sync-debug-footnote{margin-top:14px;font-size:.9rem;color:var(--muted,#4b5563)}
    @media(max-width:760px){.sync-debug-screen{padding:14px}.sync-debug-grid{grid-template-columns:1fr}.sync-debug-row{grid-template-columns:1fr;gap:4px}}
  </style>`;
}
function renderSyncDebugError(error){
  if(!error) return "—";
  return [
    error.code?`code=${error.code}`:null,
    error.status?`status=${error.status}`:null,
    error.message?`message=${error.message}`:null,
    error.at?`at=${error.at}`:null
  ].filter(Boolean).join(" · ")||"—";
}
function syncDebugActionsHtml(){
  return `<div class="sync-debug-actions">
    <button id="downloadLocalStorageDiagnosticBackup" type="button" class="secondary">Descargar copia local de seguridad</button>
    <button id="downloadRemoteSyncRecoveryBackup" type="button" class="secondary">Descargar copia del estado remoto actual</button>
    <button id="promoteLocalCanonicalRecovery" type="button" class="danger">Promover este dispositivo como estado canónico</button>
    <button id="adoptCanonicalRemoteRecovery" type="button" class="danger">Adoptar estado canónico de Supabase en este dispositivo</button>
  </div>
  <p id="syncRecoveryStatus" class="sync-debug-footnote" aria-live="polite"></p>`;
}
function bindSyncDebugActions(){
  const status=document.getElementById("syncRecoveryStatus");
  const setStatus=(message,isError=false)=>{
    if(status){
      status.textContent=message||"";
      status.className=`sync-debug-footnote${isError?" error":""}`;
    }
  };
  document.getElementById("downloadLocalStorageDiagnosticBackup")?.addEventListener(
    "click",()=>downloadLocalStorageDiagnosticBackup()
  );
  document.getElementById("downloadRemoteSyncRecoveryBackup")?.addEventListener(
    "click",async()=>{
      try{
        setStatus("Preparando copia remota…");
        await downloadRemoteSyncRecoveryBackup();
        setStatus("Copia remota descargada.");
      }catch(error){
        setStatus(renderSyncDebugError(sanitizeSyncError(error)),true);
      }
    }
  );
  document.getElementById("promoteLocalCanonicalRecovery")?.addEventListener(
    "click",async()=>{
      const confirmation=prompt(`Escribe ${SYNC_RECOVERY_CONFIRMATION_TEXT} para promover este dispositivo.`);
      if(confirmation!==SYNC_RECOVERY_CONFIRMATION_TEXT){
        setStatus("Recuperación cancelada.");
        return;
      }
      try{
        setStatus("Validando y promoviendo estado local…");
        await promoteLocalDeviceAsCanonicalSyncHead();
        setStatus("RECUPERACIÓN COMPLETADA — ESTE DISPOSITIVO ES LA NUEVA CABEZA CANÓNICA");
      }catch(error){
        setStatus(renderSyncDebugError(sanitizeSyncError(error)),true);
      }
    }
  );
  document.getElementById("adoptCanonicalRemoteRecovery")?.addEventListener(
    "click",async()=>{
      const confirmation=prompt(`Escribe ${SYNC_ADOPTION_CONFIRMATION_TEXT} para adoptar el estado canónico remoto en este dispositivo.`);
      if(confirmation!==SYNC_ADOPTION_CONFIRMATION_TEXT){
        setStatus("Adopción cancelada.");
        return;
      }
      try{
        setStatus("Validando y adoptando estado canónico remoto…");
        await adoptCanonicalRemoteSyncHeadOnThisDevice();
        await renderSyncDebugScreen();
        const nextStatus=document.getElementById("syncRecoveryStatus");
        if(nextStatus){
          nextStatus.textContent="ESTADO CANÓNICO ADOPTADO — ESTE DISPOSITIVO YA ESTÁ ALINEADO CON SUPABASE";
        }
      }catch(error){
        setStatus(renderSyncDebugError(sanitizeSyncError(error)),true);
      }
    }
  );
}
async function renderSyncDebugScreen(){
  app.innerHTML=`<main class="screen sync-debug-screen" aria-labelledby="syncDebugTitle">
    ${syncDebugStyles()}
    <header class="section-header">
      <span class="section-kicker">DIAGNÓSTICO TEMPORAL</span>
      <h1 id="syncDebugTitle">Sincronización</h1>
      <p>Lectura local y Supabase sin ejecutar sincronización ni modificar datos.</p>
    </header>
    <div class="sync-debug-banner">MODO DIAGNÓSTICO — SIN SINCRONIZACIÓN AUTOMÁTICA</div>
    ${syncDebugActionsHtml()}
    <section class="sync-debug-panel"><p>Cargando snapshot…</p></section>
  </main>`;
  bindSyncDebugActions();
  try{
    const snapshot=await window.GymOSSyncDiagnostics.snapshot();
    const local=snapshot.local||{};
    const remote=snapshot.remote||{};
    app.innerHTML=`<main class="screen sync-debug-screen" aria-labelledby="syncDebugTitle">
      ${syncDebugStyles()}
      <header class="section-header">
        <span class="section-kicker">DIAGNÓSTICO TEMPORAL</span>
        <h1 id="syncDebugTitle">Sincronización</h1>
        <p>Lectura local y Supabase sin ejecutar sincronización ni modificar datos.</p>
      </header>
      <div class="sync-debug-banner">MODO DIAGNÓSTICO — SIN SINCRONIZACIÓN AUTOMÁTICA</div>
      ${syncDebugActionsHtml()}
      <section class="sync-debug-status" aria-label="Estado de diagnóstico">
        <dl>
          ${renderDiagnosticRows([
            ["autenticación",snapshot.authenticated],
            ["estado sync",snapshot.syncStatus],
            ["última decisión",snapshot.lastDecision?.decision||null],
            ["motivo decisión",snapshot.lastDecision?.reason||null],
            ["último error",renderSyncDebugError(snapshot.lastError)]
          ])}
        </dl>
      </section>
      <div class="sync-debug-grid">
        ${renderSyncDebugPanel("LOCAL",[
          ["ownerId",local.ownerId,{mask:true}],
          ["deviceId",local.deviceId,{mask:true}],
          ["revision",local.localRevision],
          ["lastRemoteRevision",local.lastRemoteRevision],
          ["syncBaseRevision",local.syncBaseRevision],
          ["syncPending",local.syncPending],
          ["lastSyncAt",local.lastSyncAt],
          ["routineId",local.routineId],
          ["selectedSessionId",local.selectedSessionId],
          ["routineHash",local.routineHash],
          ["historyHash",local.historyHash]
        ])}
        ${renderSyncDebugPanel("SUPABASE",[
          ["revision",remote.revision],
          ["deviceId",remote.deviceId,{mask:true}],
          ["checksum",remote.checksum],
          ["routineId",remote.routineId],
          ["selectedSessionId",remote.selectedSessionId],
          ["routineHash",remote.routineHash],
          ["historyHash",remote.historyHash]
        ])}
      </div>
      <footer class="sync-debug-footnote">
        Snapshot: ${esc(snapshot.generatedAt||"—")}
      </footer>
    </main>`;
    bindSyncDebugActions();
  }catch(error){
    app.innerHTML=`<main class="screen sync-debug-screen" aria-labelledby="syncDebugTitle">
      ${syncDebugStyles()}
      <header class="section-header">
        <span class="section-kicker">DIAGNÓSTICO TEMPORAL</span>
        <h1 id="syncDebugTitle">Sincronización</h1>
      </header>
      <div class="sync-debug-banner">MODO DIAGNÓSTICO — SIN SINCRONIZACIÓN AUTOMÁTICA</div>
      ${syncDebugActionsHtml()}
      <section class="sync-debug-panel">
        <h2>No se pudo leer el diagnóstico</h2>
        <p>${esc(renderSyncDebugError(sanitizeSyncError(error)))}</p>
      </section>
    </main>`;
    bindSyncDebugActions();
  }
}

function render(){
  applyAppPreferences();
  if(state.screen!=="exerciseLibrary") cancelExerciseLibrarySearchDebounce();

  if(AUTH_REQUIRED&&!AUTH_CONFIGURED()){
    renderAuthConfigurationRequired();
    return;
  }

  if(state.passwordRecoveryMode){
    renderPasswordRecoveryGate();
    return;
  }

  if(state.authRedirectInProgress||!state.authResolved){
    renderAuthLoading();
    return;
  }

  if(isSyncDebugRequested()){
    renderSyncDebugScreen();
    return;
  }

  if(AUTH_REQUIRED&&!state.syncSession){
    if(state.syncUser&&!isEmailConfirmed(state.syncUser)){
      renderEmailVerificationGate(state.syncUser);
      return;
    }
    state.screen="account";
    renderAccount();
    setTimeout(bindGlobalAppearanceControls,0);
    return;
  }

  if(AUTH_REQUIRED&&!isEmailConfirmed(state.syncUser)){
    renderEmailVerificationGate(state.syncUser);
    return;
  }

  if(isAppAuthenticated()&&!onboardingCompleted()&&!getOnboardingProfile()?.onboardingDismissed&&state.screen!=="account"){
    state.screen="onboarding";
    renderOnboarding();
    return;
  }

  if(state.screen==="onboarding") renderOnboarding();
  else if(state.screen==="home") renderHome();
  else if(state.screen==="workout") renderWorkout();
  else if(state.screen==="workoutComplete") window.GymOSRecovery.renderWorkoutComplete();
  else if(state.screen==="recovery") window.GymOSRecovery.renderRecoveryCenter();
  else if(state.screen==="history") renderHistory();
  else if(state.screen==="stats") renderStats();
  else if(state.screen==="records") renderRecords();
  else if(state.screen==="body") renderBody();
  else if(state.screen==="editWorkout") renderEditWorkout();
  else if(state.screen==="plan") renderPlan();
  else if(state.screen==="routineHub") renderRoutineHub();
  else if(state.screen==="routineWorkflow"||state.screen==="routineEditor") renderRoutineHub();
  else if(state.screen==="blocks") renderBlocks();
  else if(state.screen==="blockEditor") renderBlockEditor();
  else if(state.screen==="blockAnalytics") renderBlockAnalytics();
  else if(state.screen==="globalAnalytics") renderGlobalAnalytics();
  else if(state.screen==="exerciseAnalytics") renderExerciseAnalytics();
  else if(state.screen==="exerciseLibrary") renderExerciseLibrary();
  else if(state.screen==="exerciseLibraryEditor") renderExerciseLibraryEditor();
  else if(state.screen==="exerciseSubstitution") renderExerciseSubstitution();
  else if(state.screen==="substitutionHistory") renderSubstitutionHistory();
  else if(state.screen==="exerciseDetail") renderExerciseDetail();
  else if(state.screen==="favoriteExercises") renderFavoriteExercises();
  else if(state.screen==="backupRestore") renderBackupRestore();
  else if(state.screen==="coach") renderCoach();
  else if(state.screen==="coachProposal") renderCoachProposal();
  else if(state.screen==="workoutAnalysis") renderWorkoutAnalysisDetail();
  else if(state.screen==="aiSettings") renderAiSettings();
  else if(state.screen==="progressDashboard") renderProgressDashboard();
  else if(state.screen==="coachChat") renderCoachChat();
  else if(state.screen==="nutrition") renderNutrition();
  else if(state.screen==="quickActions") renderQuickActionsEditor();
  else if(state.screen==="professionalNutrition") window.GymOSProfessionalNutrition.renderLibrary();
  else if(state.screen==="professionalNutritionImport") window.GymOSProfessionalNutrition.renderImport();
  else if(state.screen==="professionalNutritionPlan") window.GymOSProfessionalNutrition.renderPlan();
  else if(state.screen==="professionalNutritionAdapt") window.GymOSProfessionalNutrition.renderAdaptation();
  else if(state.screen==="developer") renderDeveloperMode();
  else if(state.screen==="health") renderHealth();
  else if(state.screen==="account") renderAccount();
  else renderSettings();
  queueMicrotask(()=>bindNav());
}

function homeGreeting(now=new Date()){
  const hour=now.getHours();
  if(hour<13) return "Buenos días";
  if(hour<21) return "Buenas tardes";
  return "Buenas noches";
}
function homeGreetingName(){
  return String(accountDisplayName()||"").trim().split(/\s+/)[0]||"";
}
function homeDateLabel(now=new Date()){
  const parts=new Intl.DateTimeFormat("es-ES",{
    weekday:"long",
    day:"numeric",
    month:"long"
  }).formatToParts(now);
  const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  const weekday=values.weekday
    ?values.weekday.charAt(0).toLocaleUpperCase("es")+values.weekday.slice(1)
    :"";
  return `${weekday} · ${values.day} ${values.month}`;
}
const HOME_HERO_IMAGE_SOURCE={
  getImages(){
    return Array.isArray(window.GymOSHeroImages?.images)
      ?window.GymOSHeroImages.images
      :[];
  },
  findByType(type){
    const images=this.getImages();
    const aliases={strength:"push",hypertrophy:"back",mobility:"rest",recovery:"rest"};
    const resolved=aliases[type]||type;
    return images.find(image=>image.type===resolved)
      ||images.find(image=>image.type==="rest")
      ||null;
  }
};
function homeSessionProfile(session=activeRoutineSession(resolveRuntimeSessionId())){
  const names=(session?.exercises||[])
    .map(exercise=>String(exercise.name||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase());
  if(!names.length){
    return {focus:"Recuperación y movilidad",heroType:"rest"};
  }
  const countMatches=terms=>names.reduce((score,name)=>score+terms.reduce((total,term)=>total+(name.includes(term)?1:0),0),0);
  const posterior=countMatches(["remo","jalon","dominada","peso muerto","femoral","hip thrust","glute"]);
  const lower=countMatches(["sentadilla","prensa","zancada","split squat","gemelo","cuadriceps"]);
  const push=countMatches(["press banca","pecho","press inclinado","press hombro","press militar","triceps","elevaciones laterales"]);
  const cardio=countMatches(["correr","cinta","bicic","eliptica","cardio","intervalos","caminar","senderismo","comba"]);
  if(cardio>0) return {focus:"Resistencia y ritmo",heroType:"cardio"};
  if(lower>=2&&push>=1) return {focus:"Pierna y torso",heroType:"legs"};
  if(posterior>=2) return {focus:"Espalda y cadena posterior",heroType:"back"};
  if(push>=2&&posterior>=1) return {focus:"Tren superior y fuerza",heroType:"push"};
  if(lower>=2) return {focus:"Pierna y estabilidad",heroType:"legs"};
  if(posterior>=1) return {focus:"Espalda y tirón",heroType:"back"};
  if(push>=1) return {focus:"Empuje y tren superior",heroType:"push"};
  return {focus:"Cuerpo completo y técnica",heroType:"push"};
}
function homeTrainingObjective(sessionProfile){
  const goal=String(getOnboardingProfile()?.goal||"");
  if(goal==="muscle") return `Hipertrofia · ${sessionProfile.focus}`;
  if(goal==="strength") return `Fuerza · ${sessionProfile.focus}`;
  if(goal==="fat_loss") return `Composición corporal · ${sessionProfile.focus}`;
  if(goal==="health") return `Salud y capacidad · ${sessionProfile.focus}`;
  return sessionProfile.focus;
}
function homeHeroContextType(dashboard,sessionProfile){
  if(dashboard.mode==="recovery"||dashboard.trainedToday) return "recovery";
  if(sessionProfile.heroType==="cardio") return "cardio";
  if(/movilidad|técnica/.test(sessionProfile.focus.toLocaleLowerCase("es"))) return "mobility";
  const goal=String(getOnboardingProfile()?.goal||"");
  if(goal==="strength") return "strength";
  if(goal==="muscle") return "hypertrophy";
  return sessionProfile.heroType;
}
function homeTodayDescription(dashboard,sessionProfile){
  if(window.GymOSRecovery?.dueCheckin?.()) return "Cuéntanos cómo has recuperado de la sesión de ayer.";
  if(dashboard.trainedToday) return "La sesión de hoy está completada.";
  const focus=sessionProfile.focus.toLocaleLowerCase("es");
  return `Hoy tienes una sesión centrada en ${focus}.`;
}
const WEEKLY_GOAL_CELEBRATION_KEY="gymos:weeklyGoalCelebrated";
const HOME_NUMBER_CACHE=new Map();
function claimWeeklyGoalCelebration(week){
  if(week.count<week.goal) return false;
  const weekKey=dateKey(week.start);
  if(localStorage.getItem(WEEKLY_GOAL_CELEBRATION_KEY)===weekKey) return false;
  localStorage.setItem(WEEKLY_GOAL_CELEBRATION_KEY,weekKey);
  return true;
}
function formatHomeAnimatedNumber(value,decimals=0,suffix=""){
  return `${Number(value).toLocaleString("es-ES",{
    minimumFractionDigits:decimals,
    maximumFractionDigits:decimals
  })}${suffix}`;
}
function animateHomeNumbers(){
  document.querySelectorAll("[data-home-number]").forEach(element=>{
    const key=element.dataset.homeNumberKey;
    const target=Number(element.dataset.homeNumberValue);
    const decimals=Math.max(0,Number(element.dataset.homeNumberDecimals)||0);
    const suffix=element.dataset.homeNumberSuffix||"";
    const previous=HOME_NUMBER_CACHE.has(key)?HOME_NUMBER_CACHE.get(key):target;
    HOME_NUMBER_CACHE.set(key,target);
    if(!Number.isFinite(target)||previous===target||document.body.classList.contains("reduce-motion")){
      element.textContent=formatHomeAnimatedNumber(target,decimals,suffix);
      return;
    }
    const startedAt=performance.now();
    const duration=220;
    const draw=timestamp=>{
      const progress=Math.min(1,(timestamp-startedAt)/duration);
      const eased=1-Math.pow(1-progress,3);
      const value=previous+(target-previous)*eased;
      element.textContent=formatHomeAnimatedNumber(value,decimals,suffix);
      if(progress<1) requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  });
}
function homeValidDate(value){
  const date=new Date(value);
  return Number.isFinite(date.getTime())?date:null;
}
function homeHistoryInRange(history,start,end){
  return (Array.isArray(history)?history:[]).filter(item=>{
    const date=homeValidDate(item?.date||item?.completedAt);
    return date&&date>=start&&date<end;
  });
}
function homeHeaderModel({now=new Date(),name="",session=null,focus="",hasRoutine=false,hasDraft=false,weekly=null}={}){
  const date=homeValidDate(now)||new Date(0);
  let description="Todavía no tienes una rutina activa.";
  if(hasRoutine&&hasDraft) description="Tienes un entrenamiento pendiente de continuar.";
  else if(hasRoutine&&session){
    const sessionFocus=String(focus||session.focus||"").trim().toLocaleLowerCase("es");
    description=sessionFocus?`Hoy toca ${sessionFocus}.`:"Tu próxima sesión está lista.";
  }
  return {
    greeting:homeGreeting(date),
    name:String(name||"").trim().split(/\s+/)[0]||"",
    dateLabel:homeDateLabel(date),
    description,
    weeklySummary:weekly?.configured
      ?`${weekly.count} de ${weekly.goal} ${weekly.goal===1?"sesión":"sesiones"} esta semana`
      :""
  };
}
function nextSessionModel({
  sessions=[],selectedSessionId=null,draft=null,draftStatus="missing",
  routineAvailable=true,routineValid=true,defaultDuration=45,restSeconds=90,
  exerciseLibrary=[]
}={}){
  const list=Array.isArray(sessions)?sessions:[];
  const selected=list.find(item=>item?.sessionId===selectedSessionId)||list[0]||null;
  if(!routineAvailable||!selected){
    return {
      available:false,valid:false,sessionId:null,name:"Sin rutina activa",focus:"",
      duration:null,exerciseCount:0,restSeconds:null,hasDraft:false,
      primaryAction:"routine-create",primaryLabel:"Crear mi rutina",canChange:false,
      preview:null,heroType:"rest"
    };
  }
  const valid=routineValid!==false&&Boolean(selected.sessionId)&&Array.isArray(selected.exercises);
  if(!valid){
    return {
      available:true,valid:false,sessionId:selected.sessionId||null,
      name:String(selected.name||"Rutina no disponible"),focus:"",
      duration:null,exerciseCount:0,restSeconds:null,hasDraft:false,
      primaryAction:"routine-review",primaryLabel:"Revisar mi rutina",
      canChange:list.length>1,preview:null,heroType:"rest"
    };
  }
  const index=list.indexOf(selected);
  const name=String(selected.name||selected.label||`Sesión ${index+1}`).trim();
  const sessionProfile=homeSessionProfile(selected);
  const hasDraft=Boolean(draft)&&draftStatus==="current";
  return {
    available:true,valid:true,sessionId:selected.sessionId,name,
    focus:String(selected.focus||sessionProfile.focus||"").trim(),
    duration:Math.max(1,Number(selected.estimatedDurationMinutes)||Number(defaultDuration)||45),
    exerciseCount:selected.exercises.length,
    restSeconds:[60,90,120,180].includes(Number(restSeconds))?Number(restSeconds):90,
    hasDraft,
    primaryAction:"workout",
    primaryLabel:hasDraft?"Continuar entrenamiento":"Comenzar entrenamiento",
    canChange:list.length>1,
    preview:homeSessionPreviewModel({session:selected,exerciseLibrary}),
    heroType:sessionProfile.heroType
  };
}
function homeSessionPreviewModel({session=null,exerciseLibrary=[]}={}){
  if(!session||!Array.isArray(session.exercises)) return null;
  const clean=value=>String(value??"").trim();
  const normalized=value=>clean(value).normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const library=Array.isArray(exerciseLibrary)?exerciseLibrary:[];
  const findReference=exercise=>{
    const id=clean(exercise?.exerciseId||exercise?.id);
    if(id){
      const exact=library.find(item=>clean(item?.id||item?.exerciseId)===id);
      if(exact) return exact;
    }
    const name=normalized(exercise?.name);
    const matches=library.filter(item=>
      normalized(item?.name)===name||
      (Array.isArray(item?.aliases)&&item.aliases.some(alias=>normalized(alias)===name))
    );
    return matches.length===1?matches[0]:null;
  };
  const rangeLabel=(value,{duration=false}={})=>{
    if(typeof value==="string"&&clean(value)) return clean(value);
    const min=Number(value?.min??value?.minimum);
    const max=Number(value?.max??value?.maximum);
    if(!Number.isFinite(min)&&!Number.isFinite(max)) return "Sin indicar";
    const start=Number.isFinite(min)?min:max;
    const end=Number.isFinite(max)?max:min;
    return `${start}${end!==start?`–${end}`:""} ${duration?"s":"reps"}`;
  };
  const exercises=session.exercises.map((exercise,index)=>{
    const prescription=exercise?.prescription||{};
    const target=prescription.target??exercise?.target??prescription.repRange;
    const targetType=normalized(target?.type||prescription.targetType);
    const reference=findReference(exercise);
    const rir=prescription.targetRir??exercise?.targetRir??exercise?.rir;
    return {
      order:index+1,name:clean(exercise?.name)||`Ejercicio ${index+1}`,
      sets:Math.max(0,Number(prescription.sets??exercise?.sets)||0),
      target:rangeLabel(target,{
        duration:targetType.includes("dur")||targetType.includes("time")
      }),
      rir:rangeLabel(rir).replace(/ reps$/, ""),
      restSeconds:Number.isFinite(Number(prescription.restSeconds??exercise?.restSeconds))
        ?Number(prescription.restSeconds??exercise?.restSeconds):null,
      notes:clean(exercise?.notes||prescription.notes),
      reference:reference?{
        name:clean(reference.name),short:clean(reference.instructions?.short),
        setup:Array.isArray(reference.instructions?.setup)
          ?reference.instructions.setup.map(clean).filter(Boolean):[],
        execution:Array.isArray(reference.instructions?.execution)
          ?reference.instructions.execution.map(clean).filter(Boolean):[]
      }:null
    };
  });
  const profile=homeSessionProfile(session);
  return {
    sessionId:clean(session.sessionId),name:clean(session.name||session.label)||"Sesión",
    focus:clean(session.focus||profile.focus)||"Enfoque general",
    duration:Math.max(1,Number(session.estimatedDurationMinutes)||45),
    exerciseCount:exercises.length,notes:clean(session.notes),exercises
  };
}
function weeklyGoalModel({history=[],goal=null,now=new Date()}={}){
  const date=homeValidDate(now)||new Date(0);
  const start=mondayOf(date);
  const end=addDays(start,7);
  const parsedGoal=Number(goal);
  const configured=goal!==null&&goal!==""&&Number.isInteger(parsedGoal)&&parsedGoal>0;
  const count=homeHistoryInRange(history,start,end).length;
  if(!configured){
    return {configured:false,start:start.toISOString(),end:end.toISOString(),count,goal:null,remaining:null,percentage:0,complete:false};
  }
  const percentage=Math.min(100,Math.max(0,Math.round((count/parsedGoal)*100)));
  return {
    configured:true,start:start.toISOString(),end:end.toISOString(),
    count,goal:parsedGoal,remaining:Math.max(0,parsedGoal-count),
    percentage,complete:count>=parsedGoal
  };
}
function recoverySummaryModel(input={}){
  const api=globalThis.GymOSRecovery||globalThis.window?.GymOSRecovery;
  if(api?.recoveryHomeSummaryModel){
    return api.recoveryHomeSummaryModel({
      entries:input.entries||[],
      checkins:input.checkins||[],
      referenceDate:input.referenceDate||"",
      online:input.online!==false,
      authenticated:input.authenticated!==false,
      error:input.error||null
    });
  }
  if(input.available===false) return {status:"unavailable",title:"Recuperación no está disponible.",action:null};
  if(input.error) return {status:"error",title:"No se pudo cargar tu recuperación.",action:"recovery"};
  if(input.pending){
    return {
      status:"pending",title:"Check-in pendiente",
      detail:"Cuéntanos cómo has recuperado.",
      action:"checkin",checkinId:String(input.pending.id||"")
    };
  }
  if(input.entry){
    const result=api?.resultForEntry?.(input.entry);
    return {
      status:"completed",title:result?.title||"Recuperación registrada",
      detail:"Evaluación completada hoy.",action:"recovery"
    };
  }
  return {status:"idle",title:"Todo al día",detail:"No tienes ninguna evaluación pendiente.",action:"recovery"};
}
function weeklyActivityModel({sessions=[],history=[],selectedSessionId=null,drafts=[],now=new Date()}={}){
  const list=Array.isArray(sessions)?sessions:[];
  const date=homeValidDate(now)||new Date(0);
  const start=mondayOf(date);
  const end=addDays(start,7);
  const weekHistory=homeHistoryInRange(history,start,end);
  const draftIds=new Set((Array.isArray(drafts)?drafts:[])
    .filter(item=>item&&item.status==="current")
    .map(item=>item.sessionId));
  return list.map((session,index)=>{
    const match=[...weekHistory].reverse().find(item=>
      item?.sessionId===session.sessionId||
      (session.legacySessionKey&&(item?.legacySessionKey===session.legacySessionKey||item?.session===session.legacySessionKey))
    )||null;
    let status="pending";
    if(draftIds.has(session.sessionId)) status="draft";
    else if(match) status="completed";
    else if(session.sessionId===selectedSessionId) status="next";
    return {
      sessionId:session.sessionId,
      name:String(session.name||session.label||`Sesión ${index+1}`),
      status,
      completedAt:match?(match.date||match.completedAt||null):null
    };
  });
}
function homeMetricModel(rows,key,label,unit){
  const values=(Array.isArray(rows)?rows:[])
    .map(item=>({date:item?.date,value:Number(item?.[key])}))
    .filter(item=>homeValidDate(item.date)&&Number.isFinite(item.value)&&item.value>0)
    .sort((a,b)=>homeValidDate(a.date)-homeValidDate(b.date));
  if(!values.length) return null;
  const latest=values.at(-1);
  const previous=values.at(-2)||null;
  return {
    key,label,unit,value:latest.value,date:latest.date,
    trend:previous?latest.value-previous.value:null,
    comparableCount:values.length
  };
}
function recentProgressModel({bodyHistory=[],history=[],now=new Date()}={}){
  const date=homeValidDate(now)||new Date(0);
  const monthStart=new Date(date.getFullYear(),date.getMonth(),1);
  const monthEnd=new Date(date.getFullYear(),date.getMonth()+1,1);
  const metrics=[
    homeMetricModel(bodyHistory,"weight","Peso actual","kg"),
    homeMetricModel(bodyHistory,"waist","Cintura","cm"),
    {
      key:"monthlySessions",label:"Sesiones este mes",unit:"",
      value:homeHistoryInRange(history,monthStart,monthEnd).length,
      date:null,trend:null,comparableCount:0
    }
  ].filter(Boolean).slice(0,3);
  const hasMeasurements=metrics.some(item=>item.key!=="monthlySessions");
  return {metrics,hasMeasurements,empty:!hasMeasurements&&!metrics.find(item=>item.key==="monthlySessions")?.value};
}
function lastWorkoutModel({history=[]}={}){
  const workout=(Array.isArray(history)?history:[])
    .filter(item=>homeValidDate(item?.date||item?.completedAt))
    .sort((a,b)=>homeValidDate(b.date||b.completedAt)-homeValidDate(a.date||a.completedAt))[0]||null;
  if(!workout) return {available:false};
  const snapshot=workout.sessionSnapshot||{};
  const exercises=Array.isArray(workout.exercises)?workout.exercises:[];
  const completedExercises=exercises.filter(exercise=>
    Array.isArray(exercise?.series)&&exercise.series.some(series=>series?.done)
  ).length;
  const durationMs=Number(workout.durationMs);
  const durationMinutes=Number.isFinite(durationMs)&&durationMs>=0
    ?Math.round(durationMs/60000)
    :Number(workout.durationMinutes||workout.duration);
  return {
    available:true,id:workout.id??null,
    name:String(workout.sessionName||snapshot.name||`Sesión ${workout.session||workout.legacySessionKey||""}`).trim(),
    focus:String(snapshot.focus||workout.sessionFocus||workout.focus||"").trim(),
    date:workout.date||workout.completedAt,
    durationMinutes:Number.isFinite(durationMinutes)&&durationMinutes>0?durationMinutes:null,
    completedExercises,totalExercises:exercises.length,
    substitutions:exercises.filter(item=>item?.substitution).length,
    hasDetail:workout.id!==null&&workout.id!==undefined&&exercises.length>0
  };
}
function readHomeDraft(session,canonicalRoutine){
  if(!session) return {draft:null,status:"missing"};
  try{
    if(canonicalRoutine){
      const draft=routineSessionRuntimeApi().getDraft(getCanonicalDrafts(),{
        ownerId:currentRoutineOwnerOrNull(),routine:canonicalRoutine,sessionId:session.sessionId
      });
      if(!draft) return {draft:null,status:"missing"};
      const result=routineSessionMigrationApi().draftStatus(draft,{
        ownerId:currentRoutineOwnerOrNull(),canonicalRoutine
      });
      return {draft,status:result.status};
    }
    const draft=readStoredJson(draftKey(session.legacySessionKey||session.sessionId));
    return {draft,status:draft?"current":"missing"};
  }catch(error){
    return {draft:null,status:"invalid"};
  }
}
function readHomeBodyHistory(){
  try{
    const rows=JSON.parse(localStorage.getItem("gymos:body")||"[]");
    return (Array.isArray(rows)?rows:[])
      .map(normalizeBodyMeasurement)
      .filter(row=>row.date)
      .sort((a,b)=>new Date(a.date)-new Date(b.date));
  }catch(error){return [];}
}
function readHomeExerciseLibrary(){
  try{
    const stored=JSON.parse(localStorage.getItem(EXERCISE_LIBRARY_KEY)||"null");
    if(Array.isArray(stored)&&stored.length) return stored;
  }catch(_){/* the session preview remains available without references */}
  return defaultExerciseLibrary();
}
function buildHomeDashboardModel(now=new Date()){
  const history=getHistory();
  const canonical=getCanonicalRoutine();
  let sessions=[];
  let routineValid=true;
  try{sessions=activeRoutineSessions();}
  catch(error){routineValid=false;}
  const selectedId=canonical
    ?routineSessionRuntimeApi().selectedSessionId({
      routine:canonical,
      preferredSessionId:state.selectedSessionId||localStorage.getItem(SELECTED_SESSION_ID_KEY),
      legacySelection:state.selectedSession||localStorage.getItem("gymos:selectedSession"),
      history
    })
    :(sessions.find(item=>item.legacySessionKey===state.selectedSession)||sessions[0])?.sessionId||null;
  const selected=sessions.find(item=>item.sessionId===selectedId)||sessions[0]||null;
  const draft=readHomeDraft(selected,canonical);
  const goalValue=localStorage.getItem("gymos:weeklyGoal");
  const weekly=weeklyGoalModel({history,goal:goalValue===null?null:Number(goalValue),now});
  const next=nextSessionModel({
    sessions,selectedSessionId:selected?.sessionId||null,draft:draft.draft,
    draftStatus:draft.status,routineAvailable:sessions.length>0,routineValid,
    defaultDuration:getOnboardingProfile()?.duration,restSeconds:getRestSeconds(),
    exerciseLibrary:readHomeExerciseLibrary()
  });
  const draftRows=selected&&draft.draft
    ?[{sessionId:selected.sessionId,status:draft.status}]
    :[];
  let recoveryInput={available:Boolean(window.GymOSRecovery)};
  try{
    const pending=window.GymOSRecovery?.dueCheckin?.()||null;
    const entry=window.GymOSRecovery?.entryForDate?.(dateKey(now))||null;
    recoveryInput={
      available:Boolean(window.GymOSRecovery?.dueCheckin&&window.GymOSRecovery?.startCheckin),
      pending,entry,
      entries:window.GymOSRecovery?.getEntries?.()||[],
      checkins:window.GymOSRecovery?.getCheckins?.()||[],
      referenceDate:dateKey(now),
      online:navigator.onLine!==false,
      authenticated:isAppAuthenticated()
    };
  }catch(error){recoveryInput={available:true,error:true};}
  return {
    header:homeHeaderModel({
      now,name:accountDisplayName(),session:selected,focus:next.focus,
      hasRoutine:next.available,hasDraft:next.hasDraft,weekly
    }),
    next,weekly,
    recovery:recoverySummaryModel(recoveryInput),
    activity:weeklyActivityModel({
      sessions,history,selectedSessionId:selected?.sessionId||null,drafts:draftRows,now
    }),
    progress:recentProgressModel({bodyHistory:readHomeBodyHistory(),history,now}),
    lastWorkout:lastWorkoutModel({history}),
    thought:getDailyThought(now,{history,weeklyGoal:weekly.configured?weekly.goal:getWeeklyGoal()})
  };
}
function renderHomeNextSession(model){
  const rest=model.restSeconds
    ?`${model.restSeconds%60===0?`${model.restSeconds/60} min`:`${model.restSeconds} s`} de descanso`
    :"";
  const meta=model.valid
    ?[`${model.duration} min`,`${model.exerciseCount} ${model.exerciseCount===1?"ejercicio":"ejercicios"}`,rest].filter(Boolean)
    :[];
  return `<section class="home-next-session" aria-labelledby="homeNextSessionTitle">
    <span class="section-kicker">TU PRÓXIMA SESIÓN</span>
    <h2 id="homeNextSessionTitle">${esc(model.name)}</h2>
    ${model.focus?`<p class="home-next-focus">${esc(model.focus)}</p>`:""}
    ${meta.length?`<p class="home-next-meta">${meta.map(esc).join(" <span aria-hidden=\"true\">·</span> ")}</p>`:""}
    ${model.hasDraft?'<p class="home-draft-state" role="status">Entrenamiento pendiente de continuar.</p>':""}
    <div class="home-next-actions">
      <button id="homePrimaryAction" class="primary" type="button" data-home-action="${esc(model.primaryAction)}">${esc(model.primaryLabel)}</button>
      ${model.preview?'<button id="homeViewSession" class="text-button" type="button">Ver sesión</button>':""}
      ${model.canChange?'<button id="homeSecondaryAction" class="text-button" type="button">Cambiar sesión</button>':""}
    </div>
  </section>`;
}
function renderHomeSessionPreview(model){
  if(!model) return "";
  const instructionList=items=>items.length
    ?`<ul>${items.map(item=>`<li>${esc(item)}</li>`).join("")}</ul>`:"";
  return `<dialog id="homeSessionPreview" class="home-session-preview" aria-labelledby="homeSessionPreviewTitle">
    <div class="home-session-preview-header"><div><span class="section-kicker">SESIÓN PLANIFICADA</span>
      <h2 id="homeSessionPreviewTitle">${esc(model.name)}</h2></div>
      <button id="closeHomeSessionPreview" class="icon-button" type="button" aria-label="Cerrar vista de sesión">×</button>
    </div>
    <p class="home-session-preview-summary">${esc(model.focus)} <span aria-hidden="true">·</span> ${model.duration} min <span aria-hidden="true">·</span> ${model.exerciseCount} ${model.exerciseCount===1?"ejercicio":"ejercicios"}</p>
    ${model.notes?`<p class="home-session-preview-notes"><strong>Notas:</strong> ${esc(model.notes)}</p>`:""}
    <div class="home-session-preview-exercises">${model.exercises.map(exercise=>`<article>
      <span class="home-session-preview-order">${exercise.order}</span><div><h3>${esc(exercise.name)}</h3>
      <dl><div><dt>Series</dt><dd>${exercise.sets||"—"}</dd></div><div><dt>Objetivo</dt><dd>${esc(exercise.target)}</dd></div>
        <div><dt>RIR</dt><dd>${esc(exercise.rir)}</dd></div><div><dt>Descanso</dt><dd>${exercise.restSeconds===null?"Sin indicar":`${exercise.restSeconds} s`}</dd></div></dl>
      ${exercise.notes?`<p>${esc(exercise.notes)}</p>`:""}
      ${exercise.reference?`<details class="home-session-reference"><summary>Ver ficha técnica</summary>
        <strong>${esc(exercise.reference.name)}</strong>${exercise.reference.short?`<p>${esc(exercise.reference.short)}</p>`:""}
        ${instructionList(exercise.reference.setup)}${instructionList(exercise.reference.execution)}</details>`:""}
      </div></article>`).join("")}</div>
  </dialog>`;
}
function renderHomeWeeklyGoal(model){
  if(!model.configured){
    return `<section class="card home-summary-card home-weekly-card" aria-labelledby="homeWeeklyTitle">
      <span class="section-kicker">OBJETIVO SEMANAL</span>
      <h2 id="homeWeeklyTitle">Sin objetivo configurado</h2>
      <p>Define cuántas sesiones quieres completar cada semana.</p>
      <button id="configureWeeklyGoal" class="text-button" type="button">Configurar objetivo →</button>
    </section>`;
  }
  const status=model.complete
    ?"Objetivo semanal completado."
    :`Te ${model.remaining===1?"falta":"faltan"} ${model.remaining} ${model.remaining===1?"sesión":"sesiones"}.`;
  return `<section class="card home-summary-card home-weekly-card" aria-labelledby="homeWeeklyTitle">
    <span class="section-kicker">OBJETIVO SEMANAL</span>
    <div class="home-summary-heading">
      <h2 id="homeWeeklyTitle">${model.count} de ${model.goal} sesiones</h2>
      <strong>${model.percentage} %</strong>
    </div>
    <div class="weekly-progress-track" role="progressbar" aria-label="${esc(`${model.count} de ${model.goal} sesiones completadas`)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${model.percentage}">
      <div class="weekly-progress-fill" data-weekly-progress="${model.percentage}"></div>
    </div>
    <p>${esc(status)}</p>
  </section>`;
}
function renderHomeRecovery(model){
  const action=model.action==="checkin"
    ?`<button class="text-button" type="button" data-home-recovery-checkin="${esc(model.checkinId)}">Completar check-in →</button>`
    :model.action==="recovery"
      ?'<button class="text-button" type="button" data-home-recovery>Ver recuperación →</button>'
      :"";
  return `<section class="card home-summary-card home-recovery-card home-recovery-${esc(model.status)}" aria-labelledby="homeRecoveryTitle">
    <span class="section-kicker">RECUPERACIÓN</span>
    <h2 id="homeRecoveryTitle">${esc(model.title)}</h2>
    ${model.detail?`<p>${esc(model.detail)}</p>`:""}
    ${action}
  </section>`;
}
function renderHomeWeek(items){
  if(!items.length) return "";
  const labels={completed:"Completada",next:"Próxima",draft:"Con entrenamiento pendiente",pending:"Pendiente"};
  return `<section class="home-week-section" aria-labelledby="homeWeekTitle">
    <div class="home-section-heading"><span class="section-kicker">ACTIVIDAD</span><h2 id="homeWeekTitle">Tu semana</h2></div>
    <div class="home-week-list">
      ${items.map(item=>`<article class="home-week-item home-week-${esc(item.status)}">
        <span class="home-week-state" aria-hidden="true"></span>
        <div><strong>${esc(item.name)}</strong><small>${esc(item.completedAt?`${labels[item.status]} el ${formatDate(item.completedAt)}`:labels[item.status])}</small></div>
      </article>`).join("")}
    </div>
  </section>`;
}
function renderHomeProgress(model){
  const measurementMetrics=model.metrics.filter(item=>item.key!=="monthlySessions");
  return `<section class="card home-detail-card home-progress-card" aria-labelledby="homeProgressTitle">
    <span class="section-kicker">PROGRESO RECIENTE</span>
    <h2 id="homeProgressTitle">${model.hasMeasurements?"Tus últimos datos":"Aún no hay medidas"}</h2>
    ${model.hasMeasurements?`<div class="home-progress-metrics">
      ${model.metrics.map(item=>`<div>
        <span>${esc(item.label)}</span>
        <strong>${item.key==="monthlySessions"?item.value:`${formatBodyNumber(item.value)} ${item.unit}`}</strong>
        ${item.trend===null?`${item.key!=="monthlySessions"?'<small>Una medición registrada</small>':""}`:`<small>${esc(signedBodyValue(item.trend,item.unit))} desde la anterior</small>`}
      </div>`).join("")}
    </div>`:`<p>Todavía no hay suficientes datos de progreso.</p>
      <p class="home-context-hint">${model.metrics.find(item=>item.key==="monthlySessions")?.value||0} sesiones completadas este mes.</p>`}
    <button id="${measurementMetrics.length?"openHomeProgress":"openHomeBody"}" class="text-button" type="button">${measurementMetrics.length?"Ver todo el progreso":"Registrar primera medición"} →</button>
  </section>`;
}
function renderHomeLastWorkout(model){
  if(!model.available){
    return `<section class="card home-detail-card home-last-workout-card" aria-labelledby="homeLastWorkoutTitle">
      <span class="section-kicker">ÚLTIMO ENTRENAMIENTO</span>
      <h2 id="homeLastWorkoutTitle">Tu primer entrenamiento aparecerá aquí.</h2>
    </section>`;
  }
  const completed=model.totalExercises
    ?`${model.completedExercises} de ${model.totalExercises} ejercicios completados`
    :"Entrenamiento guardado";
  return `<section class="card home-detail-card home-last-workout-card" aria-labelledby="homeLastWorkoutTitle">
    <span class="section-kicker">ÚLTIMO ENTRENAMIENTO</span>
    <h2 id="homeLastWorkoutTitle">${esc(model.name)}</h2>
    ${model.focus?`<p class="home-last-focus">${esc(model.focus)}</p>`:""}
    <p class="home-last-meta">${esc(formatDate(model.date))}${model.durationMinutes?` · ${model.durationMinutes} min`:""}</p>
    <strong class="home-last-completed">${esc(completed)}</strong>
    ${model.substitutions?`<small>${model.substitutions} ${model.substitutions===1?"sustitución":"sustituciones"}</small>`:""}
    ${model.hasDetail?`<button class="text-button" type="button" data-home-history-id="${esc(String(model.id))}">Ver detalle →</button>`:""}
  </section>`;
}

function homeDashboardState(now,week){
  const history=lastCompletedWorkouts();
  const latestWorkout=history[0]||null;
  const today=dateKey(now);
  const trainedToday=Boolean(latestWorkout&&dateKey(latestWorkout.date)===today);
  const latestDate=latestWorkout?new Date(latestWorkout.date):null;
  const startOfToday=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const startOfLatest=latestDate
    ?new Date(latestDate.getFullYear(),latestDate.getMonth(),latestDate.getDate())
    :null;
  const daysSinceTraining=startOfLatest
    ?Math.max(0,Math.floor((startOfToday-startOfLatest)/86400000))
    :null;
  const pendingCoach=getCoachProposals().find(proposal=>proposal?.status==="pending")||null;
  const weight=bodyMetricSummary("weight","kg");
  let mode="training";
  if(pendingCoach) mode="coach";
  else if(trainedToday) mode="recovery";
  else if(daysSinceTraining!==null&&daysSinceTraining>=4) mode="return";
  return {
    mode,
    week,
    latestWorkout,
    trainedToday,
    daysSinceTraining,
    pendingCoach,
    bodyPriority:!weight
  };
}
function homeDashboardHero(dashboard,sessionProfile,plannedDuration,plannedExercises){
  const selected=activeRoutineSession(resolveRuntimeSessionId());
  const selectedName=selected
    ?routineSessionRuntimeApi().displayName(
      selected,activeRoutineSessions().findIndex(item=>item.sessionId===selected.sessionId)
    )
    :"Sesión";
  let kicker="PRÓXIMA SESIÓN";
  let title=selectedName;
  let purposeLabel="OBJETIVO";
  let purpose=homeTrainingObjective(sessionProfile);
  let meta=`<span>${plannedDuration} min</span><i aria-hidden="true">·</i><span>${plannedExercises} ${plannedExercises===1?"ejercicio":"ejercicios"}</span>`;
  let primary="Comenzar entrenamiento";
  let secondary="Cambiar sesión →";

  if(dashboard.mode==="coach"){
    kicker="Coach";
    title="Revisión pendiente";
    purposeLabel="RECOMENDACIÓN";
    purpose=dashboard.pendingCoach?.summary||"Revisa el próximo ajuste antes de continuar.";
    meta="<span>Antes de la siguiente sesión</span>";
    primary="Revisar consejo";
    secondary=dashboard.trainedToday?"Ver entrenamiento →":"Entrenar ahora →";
  }else if(dashboard.mode==="recovery"){
    const hour=new Date().getHours();
    kicker="Sesión completada";
    title="Ahora toca recuperar";
    purposeLabel="AHORA";
    purpose=hour>=20?"Prioriza una buena noche de sueño.":"Repón energía e hidrátate.";
    meta=`<span>Come bien, hidrátate y prioriza el descanso.</span><i aria-hidden="true">·</i><span>${esc(dashboard.latestWorkout?.sessionName||`Sesión ${dashboard.latestWorkout?.session||""}`)} completada hoy</span>`;
    primary="Revisar recuperación";
    secondary="Ver entrenamiento →";
  }else if(dashboard.mode==="return"){
    kicker="PRÓXIMA SESIÓN";
    title=selectedName;
    purposeLabel="ENFOQUE";
    purpose=sessionProfile.focus;
    meta=`<span>${dashboard.daysSinceTraining} días desde la última sesión</span><i aria-hidden="true">·</i><span>${plannedDuration} min</span>`;
    primary="Retomar entrenamiento";
    secondary="Cambiar sesión →";
  }

  return `<section class="hero home-focus home-focus-${dashboard.mode}" data-dashboard-mode="${dashboard.mode}">
    <div class="home-focus-kicker">${esc(kicker)}</div>
    <h1>${esc(title)}</h1>
    <div class="home-focus-purpose">
      ${purposeLabel?`<span>${esc(purposeLabel)}</span>`:""}
      <strong>${esc(purpose)}</strong>
    </div>
    <div class="home-focus-meta">${meta}</div>
    <button id="homePrimaryAction" class="primary" type="button">${esc(primary)}</button>
    ${secondary?`<button id="homeSecondaryAction" class="text-button home-change-session" type="button">${esc(secondary)}</button>`:""}
  </section>`;
}
function homeWeeklyNextStep(week,dashboard,projectedPercentage){
  if(week.remaining===0){
    return dashboard.mode==="recovery"
      ?"Siguiente meta: recuperarte bien y mantener la continuidad."
      :"Siguiente meta: mantener la continuidad en la próxima sesión.";
  }
  if(dashboard.trainedToday) return `Tu próxima sesión te llevará al ${projectedPercentage} %.`;
  if(dashboard.mode==="return") return `Una sesión hoy te llevará al ${projectedPercentage} %.`;
  return `Si entrenas hoy alcanzarás el ${projectedPercentage} %.`;
}
function renderHomeWeeklyCard(week,dashboard,projectedPercentage){
  return `<section class="card weekly-home-card ${week.remaining===0?"weekly-goal-complete":""}">
    <div class="card-heading-row">
      <h2>${week.remaining===0?"Siguiente meta":"Objetivo semanal"}</h2>
      <button id="openPlan" class="text-button">Ver plan</button>
    </div>
    <div class="weekly-progress-summary">
      <strong><span data-home-number data-home-number-key="weekly-count" data-home-number-value="${week.count}" data-home-number-decimals="0">${week.count}</span> de ${week.goal} entrenamientos</strong>
      <span data-home-number data-home-number-key="weekly-percentage" data-home-number-value="${week.percentage}" data-home-number-decimals="0" data-home-number-suffix=" %">${week.percentage} %</span>
    </div>
    <div class="weekly-progress-track" role="progressbar" aria-label="Progreso del objetivo semanal" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${week.percentage}">
      <div class="weekly-progress-fill" data-weekly-progress="${week.percentage}"></div>
    </div>
    <p class="weekly-progress-projection">${esc(homeWeeklyNextStep(week,dashboard,projectedPercentage))}</p>
    ${week.remaining===0?'<div class="weekly-goal-achieved" role="status">Objetivo completado. El progreso continúa con una buena recuperación.</div>':""}
  </section>`;
}
function renderHomeBodyCard(){
  const selected=getBodySummaryMetrics();
  const hasAnyMetric=selected.some(key=>bodyMetricStats(key));
  return `<section class="card body-home-card ${bodyMetricStats("weight")?"":"body-home-priority"}">
    <div class="card-heading-row">
      <div><h2>Seguimiento corporal</h2><p class="subtle">${hasAnyMetric?"Tus últimas medidas":"Tu siguiente dato útil"}</p></div>
      <button type="button" class="quick-actions-edit" data-edit-body-summary aria-label="Editar métricas del resumen" title="Editar métricas">✎</button>
    </div>
    <div class="body-home-values">
      ${selected.map(renderHomeBodyMetric).join("")}
    </div>
    <button type="button" class="text-button body-home-all" data-open-body>Ver todas las medidas →</button>
  </section>`;
}
function renderBodySummaryEditor(){
  const existing=document.querySelector(".body-summary-editor-backdrop");
  if(!existing) state.bodySummaryReturnFocus=document.activeElement;
  existing?.remove();
  const selected=Array.isArray(state.bodySummaryDraft)?state.bodySummaryDraft:getBodySummaryMetrics();
  state.bodySummaryDraft=selected.slice();
  const modal=document.createElement("div");
  modal.className="body-summary-editor-backdrop";
  modal.innerHTML=`<section class="body-summary-editor" role="dialog" aria-modal="true" aria-labelledby="bodySummaryEditorTitle" aria-describedby="bodySummaryEditorHelp">
    <div class="card-heading-row">
      <div><span class="section-kicker">INICIO</span><h2 id="bodySummaryEditorTitle">Editar resumen corporal</h2><p id="bodySummaryEditorHelp" class="subtle">Elige exactamente cuatro métricas.</p></div>
      <button type="button" class="icon-button" data-close-body-summary aria-label="Cerrar">×</button>
    </div>
    <div class="body-summary-picker">
      ${BODY_METRIC_KEYS.map(key=>`<label class="${selected.includes(key)?"selected":""}">
        <input type="checkbox" data-body-summary-choice="${esc(key)}" ${selected.includes(key)?"checked":""} ${!selected.includes(key)&&selected.length>=4?"disabled":""}>
        <span>${esc(BODY_METRICS[key].shortLabel)}</span>
      </label>`).join("")}
    </div>
    <p class="body-summary-editor-count" role="status">${selected.length} de 4 seleccionadas</p>
    <button type="button" class="primary full" data-save-body-summary ${selected.length===4?"":"disabled"}>Guardar resumen</button>
  </section>`;
  document.body.appendChild(modal);
  const close=()=>{
    const returnFocus=state.bodySummaryReturnFocus;
    state.bodySummaryDraft=null;
    state.bodySummaryReturnFocus=null;
    modal.remove();
    if(returnFocus?.isConnected) returnFocus.focus();
  };
  modal.querySelector("[data-close-body-summary]").onclick=close;
  modal.onclick=event=>{if(event.target===modal) close();};
  modal.onkeydown=event=>{if(event.key==="Escape"){event.preventDefault();close();}};
  modal.querySelectorAll("[data-body-summary-choice]").forEach(input=>input.onchange=()=>{
    const key=input.dataset.bodySummaryChoice;
    if(input.checked&&state.bodySummaryDraft.length<4) state.bodySummaryDraft.push(key);
    if(!input.checked) state.bodySummaryDraft=state.bodySummaryDraft.filter(item=>item!==key);
    renderBodySummaryEditor();
  });
  modal.querySelector("[data-save-body-summary]").onclick=()=>{
    if(state.bodySummaryDraft.length!==4) return;
    saveBodySummaryMetrics(state.bodySummaryDraft);
    state.bodySummaryDraft=null;
    state.bodySummaryReturnFocus=null;
    modal.remove();
    renderHome();
    toast("Resumen corporal actualizado.");
  };
  modal.querySelector("[data-close-body-summary]").focus();
}

function quickActionNutritionContext(){
  const settings=getNutritionSettings();
  if(!hasNutritionTargets(settings)) return "Configura tus objetivos";
  const remaining=nutritionRemaining(settings,nutritionEntryForDate(dateKey(new Date())));
  return remaining.protein>0?`Te quedan ${Math.round(remaining.protein)} g de proteína`:"Objetivo de proteína completo";
}
function quickActionRecoveryContext(){
  return window.GymOSRecovery?.dueCheckin?.()?"Pendiente de ayer":"Ver estado";
}
function quickActionWeightContext(){
  const weight=bodyMetricSummary("weight","kg");
  return weight?`${formatWeight(weight.value)} kg`:"Sin registrar";
}
function quickActionCoachContext(){
  return getCoachProposals().some(item=>item.status==="pending")?"Consejo pendiente":"Abrir Coach";
}
function scrollToQuickActionTarget(selector){
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const target=document.querySelector(selector);
    if(target) target.scrollIntoView({behavior:getAppPreferences().animations?"smooth":"auto",block:"start"});
  }));
}
function openQuickActionScreen(screen,selector=null){
  navigateToScreen(screen);
  if(selector) scrollToQuickActionTarget(selector);
}
function changeQuickActionSession(){
  const available=availableRoutineSessions();
  if(!available.length) return;
  const current=resolveRuntimeSessionId();
  const next=available[(available.indexOf(current)+1)%available.length];
  persistSelectedRoutineSession(next,{mark:true});
  renderHome();
  toast(`${routineSessionRuntimeApi().displayName(activeRoutineSession(next))} seleccionada`);
}
function openQuickActionTimer(){
  openQuickActionScreen("workout");
  requestAnimationFrame(()=>startTimer(getRestSeconds()));
}
async function runQuickActionSync(){
  try{
    await syncNow();
    toast("Sincronización completada");
  }catch(error){
    console.error("Quick action sync",error);
    toast("No se pudo sincronizar ahora");
  }
}
function openBarcodeQuickAction(){
  if(typeof window.openBarcodeScanner==="function"){
    window.openBarcodeScanner();
    return;
  }
  state.nutritionDate=dateKey(new Date());
  openQuickActionScreen("nutrition","#nutritionDailyRecord");
  toast("El escáner se gestiona desde Nutrición");
}

const QUICK_ACTIONS_REGISTRY=Object.freeze({
  recovery:{label:"Recuperación",icon:"♥",context:quickActionRecoveryContext,action:()=>{state.recoveryView="overview";openQuickActionScreen("recovery");}},
  nutrition:{label:"Nutrición",icon:"◉",context:quickActionNutritionContext,action:()=>openQuickActionScreen("nutrition")},
  register_food:{label:"Registrar alimento",icon:"+",context:quickActionNutritionContext,action:()=>openQuickActionScreen("nutrition","#nutritionDailyRecord")},
  scan_food:{label:"Escanear alimento",pickerLabel:"Escanear código de barras",icon:"⌗",action:openBarcodeQuickAction},
  recipes:{label:"Crear receta",icon:"≡",action:()=>openQuickActionScreen("nutrition",".smart-recipes")},
  weight:{label:"Peso",icon:"◌",context:quickActionWeightContext,action:()=>openQuickActionScreen("body")},
  body_measurements:{label:"Medidas",pickerLabel:"Medidas corporales",icon:"↔",action:()=>openQuickActionScreen("body")},
  progress:{label:"Progreso",icon:"↗",action:()=>openQuickActionScreen("progressDashboard")},
  coach:{label:"Coach",icon:"✦",context:quickActionCoachContext,action:()=>openQuickActionScreen("coach")},
  workout_history:{label:"Historial",pickerLabel:"Historial de entrenamientos",icon:"↶",action:()=>openQuickActionScreen("history")},
  change_session:{label:"Cambiar sesión",icon:"⇄",context:()=>{
    const selected=activeRoutineSession(resolveRuntimeSessionId());
    return selected?routineSessionRuntimeApi().displayName(selected):"Sesión";
  },action:changeQuickActionSession},
  timer:{label:"Temporizador",icon:"◷",action:openQuickActionTimer},
  sports_profile:{label:"Perfil deportivo",icon:"◇",action:()=>openTrainingProfileEditor(1,{returnScreen:"settings"})},
  account:{label:"Cuenta",icon:"○",action:()=>openQuickActionScreen("account")},
  appearance:{label:"Apariencia",icon:"◐",action:()=>openQuickActionScreen("settings",".experience-card")},
  sync:{label:"Sincronización",icon:"↻",context:()=>syncStatusLabel(),action:runQuickActionSync}
});

function executeQuickAction(key){
  const action=QUICK_ACTIONS_REGISTRY[key];
  if(!action) return;
  try{
    const result=action.action?.();
    if(result?.catch) result.catch(error=>{
      console.error(`Quick action ${key}`,error);
      toast("No se pudo abrir este acceso");
    });
  }catch(error){
    console.error(`Quick action ${key}`,error);
    toast("No se pudo abrir este acceso");
  }
}
function renderHomeQuickActions(dashboard){
  const preferences=getQuickActionPreferences();
  if(preferences.hidden) return "";
  const actions=preferences.quickActions
    .map(item=>({key:item.key,...QUICK_ACTIONS_REGISTRY[item.key]}))
    .filter(item=>item.label);
  return `<section class="card home-quick-section">
    <div class="quick-actions-heading">
      <h2>Accesos rápidos</h2>
      <button id="editQuickActions" class="quick-actions-edit" type="button" aria-label="Editar accesos rápidos" title="Editar accesos rápidos">✎</button>
    </div>
    <div class="home-quick-grid quick-actions-count-${actions.length}">
      ${actions.map(action=>{
        const context=typeof action.context==="function"?action.context():"";
        return `<button data-quick-action="${esc(action.key)}" class="quick-action-card" type="button" aria-label="${esc(action.label)}${context?`. ${context}`:""}">
          <span aria-hidden="true">${action.icon}</span>
          <strong>${esc(action.label)}</strong>
          ${context?`<small>${esc(context)}</small>`:""}
        </button>`;
      }).join("")}
    </div>
  </section>`;
}

function quickActionsEditorDraft(){
  if(!Array.isArray(state.quickActionsDraft)){
    state.quickActionsDraft=getQuickActionPreferences().quickActions.map(item=>item.key);
    state.quickActionsDesiredCount=state.quickActionsDraft.length;
  }
  return state.quickActionsDraft;
}
function setQuickActionsEditorMessage(type,text){
  state.quickActionsEditorMessage={type,text};
}
function moveQuickActionDraft(key,direction){
  const draft=quickActionsEditorDraft();
  const index=draft.indexOf(key);
  const target=index+direction;
  if(index<0||target<0||target>=draft.length) return;
  [draft[index],draft[target]]=[draft[target],draft[index]];
  state.quickActionsEditorMessage=null;
  renderQuickActionsEditor();
}
function renderQuickActionsEditor(){
  const draft=quickActionsEditorDraft();
  const desired=Math.min(4,Math.max(2,Number(state.quickActionsDesiredCount)||4));
  const message=state.quickActionsEditorMessage;
  app.innerHTML=`<div class="app-shell">
    <header class="topbar quick-actions-editor-header">
      <button id="closeQuickActionsEditor" class="text-button" type="button">← Inicio</button>
      <div><div class="brand">Personalizar accesos rápidos</div><div class="subtle">Elige entre dos y cuatro acciones para Inicio.</div></div>
    </header>
    <main class="screen quick-actions-editor-screen">
      <section class="card quick-actions-count-card">
        <div><span class="section-kicker">CANTIDAD</span><h2>¿Cuántos accesos quieres?</h2></div>
        <div class="segmented-control" aria-label="Cantidad de accesos rápidos">
          ${[2,3,4].map(count=>`<button type="button" data-quick-count="${count}" class="${desired===count?"active":""}" aria-pressed="${desired===count}">${count}</button>`).join("")}
        </div>
      </section>
      <section class="card">
        <div class="card-heading-row">
          <div><span class="section-kicker">ORDEN</span><h2>Accesos seleccionados</h2><p class="subtle">Arrastra cada fila o utiliza los botones de subir y bajar.</p></div>
          <strong>${draft.length} / ${desired}</strong>
        </div>
        <div class="quick-actions-order-list">
          ${draft.map((key,index)=>{
            const action=QUICK_ACTIONS_REGISTRY[key];
            return `<article class="quick-actions-order-item" draggable="true" data-quick-order="${esc(key)}">
              <span class="quick-actions-drag" aria-hidden="true">⋮⋮</span>
              <span class="quick-actions-order-icon" aria-hidden="true">${action.icon}</span>
              <strong>${esc(action.label)}</strong>
              <div>
                <button type="button" data-quick-up="${esc(key)}" aria-label="Subir ${esc(action.label)}" ${index===0?"disabled":""}>↑</button>
                <button type="button" data-quick-down="${esc(key)}" aria-label="Bajar ${esc(action.label)}" ${index===draft.length-1?"disabled":""}>↓</button>
              </div>
            </article>`;
          }).join("")}
        </div>
      </section>
      <section class="card">
        <span class="section-kicker">DISPONIBLES</span>
        <h2>Elige tus acciones</h2>
        <div class="quick-actions-picker">
          ${QUICK_ACTION_KEYS.map(key=>{
            const action=QUICK_ACTIONS_REGISTRY[key];
            const selected=draft.includes(key);
            const disabled=!selected&&draft.length>=desired;
            return `<label class="${selected?"selected":""} ${disabled?"disabled":""}">
              <input type="checkbox" data-quick-choice="${esc(key)}" ${selected?"checked":""} ${disabled?"disabled":""}>
              <span aria-hidden="true">${action.icon}</span>
              <strong>${esc(action.pickerLabel||action.label)}</strong>
            </label>`;
          }).join("")}
        </div>
      </section>
      <p class="inline-message ${message?.type||""} ${message?"":"hidden"}" role="${message?.type==="error"?"alert":"status"}">${message?esc(message.text):""}</p>
      <div class="quick-actions-editor-actions">
        <button id="saveQuickActions" class="primary" type="button" ${draft.length!==desired?"disabled":""}>Guardar cambios</button>
        <button id="restoreQuickActions" class="secondary" type="button">Restaurar accesos recomendados</button>
        <button id="hideQuickActions" class="text-button" type="button">Ocultar accesos rápidos</button>
      </div>
    </main>${nav("home")}
  </div>`;

  document.getElementById("closeQuickActionsEditor").onclick=()=>{
    state.quickActionsDraft=null;
    state.quickActionsEditorMessage=null;
    state.screen="home";
    renderHome();
  };
  document.querySelectorAll("[data-quick-count]").forEach(button=>button.onclick=()=>{
    const count=Number(button.dataset.quickCount);
    state.quickActionsDesiredCount=count;
    if(state.quickActionsDraft.length>count) state.quickActionsDraft=state.quickActionsDraft.slice(0,count);
    state.quickActionsEditorMessage=state.quickActionsDraft.length<count
      ?{type:"info",text:`Selecciona ${count-state.quickActionsDraft.length} acceso${count-state.quickActionsDraft.length===1?"":"s"} más.`}
      :null;
    renderQuickActionsEditor();
  });
  document.querySelectorAll("[data-quick-choice]").forEach(input=>input.onchange=()=>{
    const key=input.dataset.quickChoice;
    if(input.checked){
      if(state.quickActionsDraft.length>=state.quickActionsDesiredCount){
        setQuickActionsEditorMessage("error",`Puedes seleccionar un máximo de ${state.quickActionsDesiredCount} accesos.`);
      }else{
        state.quickActionsDraft.push(key);
        state.quickActionsEditorMessage=null;
      }
    }else{
      state.quickActionsDraft=state.quickActionsDraft.filter(item=>item!==key);
      setQuickActionsEditorMessage("info",`Selecciona ${state.quickActionsDesiredCount-state.quickActionsDraft.length} acceso${state.quickActionsDesiredCount-state.quickActionsDraft.length===1?"":"s"} más.`);
    }
    renderQuickActionsEditor();
  });
  document.querySelectorAll("[data-quick-up]").forEach(button=>button.onclick=()=>moveQuickActionDraft(button.dataset.quickUp,-1));
  document.querySelectorAll("[data-quick-down]").forEach(button=>button.onclick=()=>moveQuickActionDraft(button.dataset.quickDown,1));
  document.querySelectorAll("[data-quick-order]").forEach(item=>{
    item.ondragstart=event=>{
      state.quickActionDragKey=item.dataset.quickOrder;
      event.dataTransfer.effectAllowed="move";
      event.dataTransfer.setData("text/plain",state.quickActionDragKey);
      item.classList.add("dragging");
    };
    item.ondragend=()=>{state.quickActionDragKey=null;item.classList.remove("dragging");};
    item.ondragover=event=>{event.preventDefault();event.dataTransfer.dropEffect="move";};
    item.ondrop=event=>{
      event.preventDefault();
      const source=state.quickActionDragKey||event.dataTransfer.getData("text/plain");
      const target=item.dataset.quickOrder;
      if(!source||source===target) return;
      const sourceIndex=state.quickActionsDraft.indexOf(source);
      const targetIndex=state.quickActionsDraft.indexOf(target);
      state.quickActionsDraft.splice(sourceIndex,1);
      state.quickActionsDraft.splice(targetIndex,0,source);
      state.quickActionDragKey=null;
      renderQuickActionsEditor();
    };
  });
  document.getElementById("saveQuickActions").onclick=()=>{
    if(state.quickActionsDraft.length!==state.quickActionsDesiredCount){
      setQuickActionsEditorMessage("error","Completa la selección antes de guardar.");
      renderQuickActionsEditor();
      return;
    }
    saveQuickActionPreferences({quickActions:state.quickActionsDraft,hidden:false});
    state.quickActionsDraft=null;
    state.quickActionsEditorMessage=null;
    state.screen="home";
    renderHome();
    toast("Accesos rápidos actualizados.");
  };
  document.getElementById("restoreQuickActions").onclick=()=>{
    state.quickActionsDraft=RECOMMENDED_QUICK_ACTIONS.slice();
    state.quickActionsDesiredCount=4;
    setQuickActionsEditorMessage("success","Se ha restaurado la selección recomendada. Guarda para aplicarla.");
    renderQuickActionsEditor();
  };
  document.getElementById("hideQuickActions").onclick=()=>{
    saveQuickActionPreferences({quickActions:state.quickActionsDraft,hidden:true});
    state.quickActionsDraft=null;
    state.quickActionsEditorMessage=null;
    state.screen="home";
    renderHome();
    toast("Accesos rápidos ocultos.");
  };
  bindNav();
}
function homeCoachInsight(dashboard){
  if(dashboard.pendingCoach){
    return {
      title:"Tienes una recomendación pendiente.",
      text:dashboard.pendingCoach.summary||"Revisa el análisis antes de la siguiente sesión.",
      proposalId:dashboard.pendingCoach.id
    };
  }
  if(dashboard.mode==="recovery"){
    return {
      title:"El trabajo de hoy ya está hecho.",
      text:"Prioriza descanso, nutrición y una recuperación suficiente antes de volver a cargar.",
      proposalId:null
    };
  }
  if(dashboard.mode==="return"){
    return {
      title:"Hoy no necesitas recuperar el tiempo perdido.",
      text:"Vuelve con margen y utiliza la primera serie para ajustar la carga.",
      proposalId:null
    };
  }
  try{
    const today=dateKey(new Date());
    const recovery=window.GymOSRecovery?.entryForDate?.(today)||null;
    const recentRecovery=window.GymOSRecovery?.getEntries?.().slice(-3)||[];
    if(recentRecovery.length===3&&recentRecovery.every(item=>Number(item.sleepHours)<6)){
      return {
        title:"Has dormido poco tres días seguidos.",
        text:"Considera reducir una serie por ejercicio y evita llegar al fallo.",
        proposalId:null
      };
    }
    if(recentRecovery.length>=2&&recentRecovery.filter(item=>Number(item.fatigue)>=3).length>=2){
      return {
        title:"La fatiga se mantiene alta.",
        text:"Mantén cargas cómodas y prioriza una ejecución estable.",
        proposalId:null
      };
    }
    const candidate=coachExerciseSummary()
      .filter(item=>item.historyCount>=2&&item.avgRir!==null&&item.avgRir>=3)
      .sort((a,b)=>b.avgRir-a.avgRir)[0]||null;
    if(candidate){
      return {
        title:recovery?.recoveryScore>=85?"Hoy estás descansado.":"Hay margen para progresar.",
        text:`Puedes intentar subir ligeramente la carga en ${candidate.name.toLocaleLowerCase("es")}.`,
        proposalId:null
      };
    }
    const recommendation=periodizationRecommendation();
    return {
      title:`Fase de ${recommendation.phase.toLocaleLowerCase("es")}.`,
      text:recommendation.action,
      proposalId:null
    };
  }catch(error){
    console.error("Home Coach insight",error);
    return {
      title:"Mantén el plan.",
      text:"Completa la próxima sesión con una técnica estable y registra el esfuerzo.",
      proposalId:null
    };
  }
}
function renderHomeCoachInsight(dashboard){
  const insight=homeCoachInsight(dashboard);
  return `<section class="home-coach-insight">
    <h2>Coach</h2>
    <strong>${esc(insight.title)}</strong>
    <p>${esc(insight.text)}</p>
    <button id="openHomeCoachInsight" class="text-button" type="button" ${insight.proposalId?`data-proposal-id="${esc(insight.proposalId)}"`:""}>Abrir Coach →</button>
  </section>`;
}

function renderHomeRecoveryStatus(dashboard){
  const pending=window.GymOSRecovery?.dueCheckin?.();
  if(pending){
    const dismissed=window.GymOSRecovery.reminderDismissed(pending);
    if(dismissed){
      return `<section class="home-recovery-status recovery-reminder-compact">
        <div><span class="section-kicker">RECUPERACIÓN PENDIENTE</span><strong>${esc(pending.sessionName||`Sesión ${pending.session}`)}</strong><small>Disponible durante todo el día.</small></div>
        <button class="text-button" type="button" data-open-recovery-checkin="${esc(pending.id)}">Revisar →</button>
      </section>`;
    }
    return `<section class="home-recovery-priority">
      <span class="section-kicker">PENDIENTE REGISTRAR RECUPERACIÓN · ${esc((pending.sessionName||`Sesión ${pending.session}`).toLocaleUpperCase("es"))}</span>
      <h2>¿Cómo has recuperado de la sesión de ayer?</h2>
      <p>Completa un check-in de 20–30 segundos.</p>
      <div><button class="primary" type="button" data-open-recovery-checkin="${esc(pending.id)}">Revisar recuperación</button><button class="text-button" type="button" data-dismiss-recovery-checkin="${esc(pending.id)}">Ahora no</button></div>
    </section>`;
  }
  const entry=window.GymOSRecovery?.entryForDate?.(dateKey(new Date()));
  if(!entry||dashboard?.trainedToday) return "";
  const result=window.GymOSRecovery?.resultForEntry?.(entry);
  return `<section class="home-recovery-status recorded">
    <div>
      <span class="section-kicker">RECUPERACIÓN</span>
      <strong>${esc(result?.title||"Recuperación registrada")}</strong>
    </div>
    <button class="text-button" type="button" data-open-recovery>Revisar →</button>
  </section>`;
}

function renderHome(){
  const now=new Date();
  const dashboard=buildHomeDashboardModel(now);
  const heroImage=HOME_HERO_IMAGE_SOURCE.findByType(dashboard.next.heroType);
  const thought=renderDailyThought(dashboard.thought);
  app.innerHTML=`<div class="app-shell">
    <main class="screen home-screen" aria-labelledby="homeGreetingTitle">
      <header class="home-context-header">
        <div class="home-greeting">
          <h1 id="homeGreetingTitle">${esc(dashboard.header.greeting)}${dashboard.header.name?`, ${esc(dashboard.header.name)}`:""}</h1>
          <div class="home-current-date">${esc(dashboard.header.dateLabel)}</div>
          <p class="home-today-description">${esc(dashboard.header.description)}</p>
        </div>
        ${dashboard.header.weeklySummary?`<p class="home-header-weekly-summary">${esc(dashboard.header.weeklySummary)}</p>`:""}
      </header>
      <div class="home-primary-grid">
        ${renderHomeNextSession(dashboard.next)}
        <div class="home-summary-stack">
          ${renderHomeWeeklyGoal(dashboard.weekly)}
          ${renderHomeRecovery(dashboard.recovery)}
        </div>
      </div>
      ${renderHomeWeek(dashboard.activity)}
      <div class="home-detail-grid">
        ${renderHomeProgress(dashboard.progress)}
        ${renderHomeLastWorkout(dashboard.lastWorkout)}
      </div>
      ${thought}
      ${renderHomeSessionPreview(dashboard.next.preview)}
    </main>${nav("home")}
  </div>`;
  const homeHero=document.querySelector(".home-next-session");
  if(homeHero&&heroImage?.file){
    homeHero.classList.add("has-hero-image");
    homeHero.style.setProperty("--home-hero-image",`url("${heroImage.file}")`);
    homeHero.dataset.heroName=heroImage.name;
  }
  const weeklyProgressFill=document.querySelector("[data-weekly-progress]");
  if(weeklyProgressFill){
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      weeklyProgressFill.style.width=`${weeklyProgressFill.dataset.weeklyProgress}%`;
    }));
  }
  const cycleHomeSession=()=>{
    const availableSessions=availableRoutineSessions();
    if(!availableSessions.length) return;
    const current=dashboard.next.sessionId;
    const next=availableSessions[(availableSessions.indexOf(current)+1)%availableSessions.length];
    persistSelectedRoutineSession(next);
    renderHome();
  };
  document.getElementById("homePrimaryAction")?.addEventListener("click",event=>{
    const action=event.currentTarget.dataset.homeAction;
    if(action==="workout") navigateToScreen("workout");
    else navigateToScreen("routineHub");
  },{once:true});
  const homeViewSession=document.getElementById("homeViewSession");
  const homeSessionPreview=document.getElementById("homeSessionPreview");
  homeViewSession?.addEventListener("click",()=>{
    if(typeof homeSessionPreview?.showModal==="function") homeSessionPreview.showModal();
  });
  document.getElementById("closeHomeSessionPreview")?.addEventListener("click",()=>{
    homeSessionPreview?.close();
  });
  homeSessionPreview?.addEventListener("close",()=>homeViewSession?.focus());
  const homeSecondaryAction=document.getElementById("homeSecondaryAction");
  homeSecondaryAction?.addEventListener("click",cycleHomeSession,{once:true});
  document.getElementById("configureWeeklyGoal")?.addEventListener("click",()=>navigateToScreen("settings"),{once:true});
  document.querySelector("[data-home-recovery]")?.addEventListener("click",()=>navigateToScreen("recovery"),{once:true});
  document.querySelector("[data-home-recovery-checkin]")?.addEventListener("click",event=>{
    const checkin=window.GymOSRecovery?.getCheckins?.()
      .find(item=>String(item.id)===event.currentTarget.dataset.homeRecoveryCheckin);
    if(checkin) window.GymOSRecovery.startCheckin(checkin);
    else navigateToScreen("recovery");
  },{once:true});
  document.getElementById("openHomeProgress")?.addEventListener("click",()=>navigateToScreen("progressDashboard"),{once:true});
  document.getElementById("openHomeBody")?.addEventListener("click",()=>navigateToScreen("body"),{once:true});
  document.querySelector("[data-home-history-id]")?.addEventListener("click",event=>{
    const id=event.currentTarget.dataset.homeHistoryId;
    const workout=getHistory().find(item=>String(item.id)===id);
    if(!workout) return;
    state.expandedHistoryId=workout.id;
    state.screen="history";
    renderHistory();
  },{once:true});
  bindNav();
}


function isTimedExercise(exercise){
  const recordType=activeWorkoutApi().exerciseRecordType(exercise);
  if(recordType) return recordType==="duration";
  const type=String(exercise?.type||"").toLowerCase();
  const target=typeof exercise?.target==="string"
    ?exercise.target.toLowerCase()
    :"";
  const name=String(exercise?.name||"").toLowerCase();
  return type.includes("time")||
    type.includes("tiempo")||
    target.includes("seg")||
    target.includes("sec")||
    target.includes("min")||
    /plancha|plank|isometr|wall sit|dead hang|farmer hold/.test(name);
}
function exerciseTimerKey(session,exerciseIndex,setIndex){
  return `${session}:${exerciseIndex}:${setIndex}`;
}
function getExerciseTimer(session,exerciseIndex,setIndex){
  const key=exerciseTimerKey(session,exerciseIndex,setIndex);
  if(!state.exerciseTimers[key]){
    state.exerciseTimers[key]={running:false,startedAt:null,elapsedMs:0,intervalId:null};
  }
  return state.exerciseTimers[key];
}
function currentExerciseTimerMs(timer){
  if(!timer.running||!timer.startedAt) return timer.elapsedMs||0;
  return (timer.elapsedMs||0)+(Date.now()-timer.startedAt);
}
function formatExerciseTimer(ms){
  const total=Math.max(0,Math.floor(ms/1000));
  return `${String(Math.floor(total/60)).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`;
}
function updateExerciseTimerDisplay(key){
  const timer=state.exerciseTimers[key];
  const display=document.querySelector(`[data-exercise-timer-display="${CSS.escape(key)}"]`);
  if(display&&timer) display.textContent=formatExerciseTimer(currentExerciseTimerMs(timer));
}
function startExerciseTimer(session,exerciseIndex,setIndex){
  const key=exerciseTimerKey(session,exerciseIndex,setIndex);
  const timer=getExerciseTimer(session,exerciseIndex,setIndex);
  if(timer.running) return;
  timer.running=true;
  timer.startedAt=Date.now();
  timer.intervalId=setInterval(()=>updateExerciseTimerDisplay(key),250);
  updateExerciseTimerDisplay(key);
}
function stopExerciseTimer(session,exerciseIndex,setIndex){
  const key=exerciseTimerKey(session,exerciseIndex,setIndex);
  const timer=getExerciseTimer(session,exerciseIndex,setIndex);
  if(timer.running){
    timer.elapsedMs=currentExerciseTimerMs(timer);
    timer.running=false;
    timer.startedAt=null;
    if(timer.intervalId) clearInterval(timer.intervalId);
    timer.intervalId=null;
  }
  const seconds=Math.max(1,Math.round((timer.elapsedMs||0)/1000));
  const draft=getDraft(session);
  draft.exercises[exerciseIndex].series[setIndex].seconds=seconds;
  draft.exercises[exerciseIndex].series[setIndex].reps="";
  draft.exercises[exerciseIndex].series[setIndex].weight="";
  saveDraft(draft);
  updateExerciseTimerDisplay(key);
  const input=document.querySelector(
    `[data-set-field="seconds"][data-set-index="${setIndex}"],[data-seconds="${exerciseIndex}:${setIndex}"]`
  );
  if(input) input.value=seconds;
  toast(`${seconds} segundos registrados`);
}
function resetExerciseTimer(session,exerciseIndex,setIndex){
  const key=exerciseTimerKey(session,exerciseIndex,setIndex);
  const timer=getExerciseTimer(session,exerciseIndex,setIndex);
  if(timer.intervalId) clearInterval(timer.intervalId);
  state.exerciseTimers[key]={running:false,startedAt:null,elapsedMs:0,intervalId:null};
  const draft=getDraft(session);
  draft.exercises[exerciseIndex].series[setIndex].seconds="";
  saveDraft(draft);
  updateExerciseTimerDisplay(key);
  const input=document.querySelector(
    `[data-set-field="seconds"][data-set-index="${setIndex}"],[data-seconds="${exerciseIndex}:${setIndex}"]`
  );
  if(input) input.value="";
}
function stopAllExerciseTimers(){
  if(!state.exerciseTimers || typeof state.exerciseTimers!=="object"){
    state.exerciseTimers={};
    return;
  }
  Object.values(state.exerciseTimers).forEach(timer=>{
    if(timer?.intervalId) clearInterval(timer.intervalId);
    if(timer?.running){
      timer.elapsedMs=currentExerciseTimerMs(timer);
      timer.running=false;
      timer.startedAt=null;
      timer.intervalId=null;
    }
  });
}

function activeWorkoutApi(){
  if(!window.GymOSActiveWorkout) throw new Error("active_workout_model_unavailable");
  return window.GymOSActiveWorkout;
}
function formatSessionElapsed(milliseconds){
  const total=Math.max(0,Math.floor(Number(milliseconds||0)/1000));
  const hours=Math.floor(total/3600);
  const minutes=Math.floor((total%3600)/60);
  const seconds=total%60;
  return hours
    ?`${String(hours).padStart(2,"0")}:${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}`
    :`${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}`;
}
function sessionElapsedAccessible(milliseconds){
  const total=Math.max(0,Math.floor(Number(milliseconds||0)/1000));
  const hours=Math.floor(total/3600);
  const minutes=Math.floor((total%3600)/60);
  const seconds=total%60;
  return `Tiempo de sesión: ${hours?`${hours} ${hours===1?"hora":"horas"}, `:""}${minutes} ${minutes===1?"minuto":"minutos"} y ${seconds} ${seconds===1?"segundo":"segundos"}`;
}
function stopWorkoutSessionTimer(){
  stopWorkoutSessionTimerDisplay();
  if(typeof state!=="undefined") state.workoutSessionTimer=null;
}
function updateWorkoutSessionElapsed(){
  const context=state.workoutSessionTimer;
  if(!context) return;
  const node=document.querySelector("[data-workout-session-elapsed]");
  if(
    currentRoutineOwnerOrNull()!==context.ownerId||
    state.screen!=="workout"||
    !node||
    node.dataset.draftId!==context.draftId
  ){
    stopWorkoutSessionTimer();
    return;
  }
  const elapsed=routineSessionRuntimeApi().sessionTimerElapsedMs(context.sessionTimer);
  node.textContent=formatSessionElapsed(elapsed);
  node.setAttribute("datetime",`PT${Math.floor(elapsed/1000)}S`);
  node.setAttribute("aria-label",sessionElapsedAccessible(elapsed));
  document.querySelectorAll("[data-workout-final-duration],[data-workout-summary-duration]").forEach(item=>{
    item.textContent=formatSessionElapsed(elapsed);
  });
  const reset=document.querySelector("[data-workout-session-reset]");
  if(reset) reset.hidden=elapsed<=0;
}
function startWorkoutSessionTimer({ownerId,draftId,sessionId,sessionTimer}){
  const current=state.workoutSessionTimer;
  const id=String(draftId||"");
  if(
    current&&current.ownerId===ownerId&&current.draftId===id&&
    current.sessionId===sessionId
  ){
    current.sessionTimer=sessionTimer;
    stopWorkoutSessionTimerDisplay();
    updateWorkoutSessionElapsed();
    if(sessionTimer.status==="running"){
      state.workoutSessionTimerInterval=setInterval(updateWorkoutSessionElapsed,1000);
    }
    return;
  }
  stopWorkoutSessionTimer();
  state.workoutSessionTimer={ownerId,draftId:id,sessionId,sessionTimer};
  updateWorkoutSessionElapsed();
  if(sessionTimer.status==="running"){
    state.workoutSessionTimerInterval=setInterval(updateWorkoutSessionElapsed,1000);
  }
}
function activeWorkoutExerciseKey(sessionId,exercise,index){
  return `${sessionId}:${activeWorkoutApi().exerciseIdentity(exercise,index)}`;
}
function previousExerciseForWorkout(last,exercise,index){
  if(!last?.exercises?.length) return null;
  const id=exercise?.exerciseId||exercise?.id;
  if(id){
    const exact=last.exercises.find(item=>
      (item?.exerciseId||item?.id)===id||
      item?.substitution?.plannedExerciseId===id
    );
    if(exact) return exact;
  }
  return last.exercises[index]||null;
}
function activeWorkoutExerciseStatus(exercise){
  const sets=(Array.isArray(exercise?.series)?exercise.series:[]).map(normalizeSeries);
  const completed=sets.filter(set=>set.done).length;
  const started=sets.some(activeWorkoutApi().setHasResults);
  if(completed===sets.length&&sets.length&&exercise?.completedAt) return "completed";
  if(started||completed) return "started";
  return "pending";
}
function updateActiveWorkoutProgressUi(draft){
  const exercises=Array.isArray(draft?.exercises)?draft.exercises:[];
  const completedExercises=exercises.filter(
    exercise=>activeWorkoutExerciseStatus(exercise)==="completed"
  ).length;
  const allSets=exercises.flatMap(exercise=>exercise.series||[]);
  const completedSets=allSets.filter(set=>set?.done).length;
  const pendingSets=Math.max(0,allSets.length-completedSets);
  const percentage=exercises.length
    ?Math.round((completedExercises/exercises.length)*100)
    :0;
  document.querySelectorAll("[data-workout-exercise-progress]").forEach(node=>{
    node.textContent=`${completedExercises} de ${exercises.length} ejercicios completados`;
  });
  document.querySelectorAll("[data-workout-completed-exercises]").forEach(node=>{
    node.textContent=`${completedExercises} de ${exercises.length}`;
  });
  document.querySelectorAll("[data-workout-completed-sets]").forEach(node=>{
    node.textContent=`${completedSets} de ${allSets.length}`;
  });
  document.querySelectorAll("[data-workout-pending-sets]").forEach(node=>{
    node.textContent=String(pendingSets);
  });
  document.querySelectorAll("[data-workout-incomplete-summary]").forEach(node=>{
    node.hidden=pendingSets===0;
    node.textContent=pendingSets
      ?`Hay ${pendingSets} ${pendingSets===1?"serie pendiente":"series pendientes"}. Puedes revisarlas antes de finalizar.`
      :"";
  });
  const progress=document.querySelector('[role="progressbar"][data-workout-session-progress]');
  if(progress){
    progress.setAttribute("aria-valuenow",String(completedExercises));
    const bar=progress.querySelector("span");
    if(bar) bar.style.width=`${percentage}%`;
  }
}
function updateActiveWorkoutExerciseUi(exerciseInstanceId,draft){
  const exercise=draft?.exercises?.find(
    item=>item.exerciseInstanceId===exerciseInstanceId
  );
  const card=document.querySelector(
    `[data-exercise-instance-id="${CSS.escape(exerciseInstanceId)}"]`
  );
  if(!exercise||!card) return;
  const status=activeWorkoutExerciseStatus(exercise);
  const statusLabel={completed:"Completado",started:"En curso",pending:"Pendiente"}[status];
  const completed=(exercise.series||[]).filter(set=>set?.done).length;
  card.classList.remove("status-completed","status-started","status-pending");
  card.classList.add(`status-${status}`);
  const statusNode=card.querySelector(".workout-exercise-state");
  if(statusNode){
    statusNode.dataset.status=status;
    statusNode.innerHTML=`${status==="completed"?"&#10003; ":""}${statusLabel}<small>${completed} de ${(exercise.series||[]).length} series</small>`;
  }
  const completion=card.querySelector("[data-complete-active-exercise]");
  if(completion) completion.textContent=exercise.completedAt
    ?"Actualizar ejercicio"
    :"Completar ejercicio";
  const saved=card.querySelector("[data-workout-exercise-saved]");
  if(saved) saved.hidden=!exercise.completedAt;
  const nextIndex=(exercise.series||[]).findIndex(set=>!set?.done);
  card.querySelectorAll("[data-active-set]").forEach((row,index)=>{
    row.classList.toggle("next",index===nextIndex);
  });
  const seriesSummary=activeWorkoutApi().setSeriesSummaryModel({
    series:exercise.series,plannedSets:exercise.sets
  });
  const sectionSummary=card.querySelector(".active-workout-section-heading small");
  if(sectionSummary) sectionSummary.textContent=seriesSummary.label;
  updateActiveWorkoutProgressUi(draft);
}
function renderActiveWorkoutGuide(
  guide,exercise,{dialog=false,labelledBy="exerciseGuideTitle"}={}
){
  const technique=guide.technique;
  const listHtml=items=>items.length?`<ul>${items.map(item=>`<li>${esc(item)}</li>`).join("")}</ul>`:"";
  return `<section class="active-workout-guide${dialog?" active-workout-reference-content":""}" aria-labelledby="${esc(labelledBy)}">
    <div class="active-workout-image">
      ${guide.image
        ?`<img src="${esc(guide.image.src)}" alt="${esc(guide.image.alt)}">`
        :'<div class="active-workout-image-placeholder" role="img" aria-label="Referencia visual pendiente"><strong>Referencia visual pendiente</strong><span>Puedes registrar el ejercicio con normalidad.</span></div>'}
    </div>
    <section class="active-workout-muscles" aria-labelledby="exerciseMusclesTitle">
      <h3 id="exerciseMusclesTitle">Músculos trabajados</h3>
      ${guide.muscles.available?`
        ${guide.muscles.primary.length?`<div><span>Principales</span><p>${guide.muscles.primary.map(value=>`<strong>${esc(value)}</strong>`).join("")}</p></div>`:""}
        ${guide.muscles.secondary.length?`<div><span>Secundarios</span><p>${guide.muscles.secondary.map(value=>`<strong>${esc(value)}</strong>`).join("")}</p></div>`:""}
      `:"<p>Información muscular todavía no disponible.</p>"}
    </section>
    <section class="active-workout-technique" aria-labelledby="exerciseTechniqueTitle">
      <h3 id="exerciseTechniqueTitle">Técnica</h3>
      ${technique.available?`
        ${technique.highlights.length?`<ul class="technique-highlights">${technique.highlights.map(item=>`<li>${esc(item)}</li>`).join("")}</ul>`:""}
        <details>
          <summary>Ver técnica completa</summary>
          ${technique.setup.length?`<h4>Preparación</h4>${listHtml(technique.setup)}`:""}
          ${technique.execution.length?`<h4>Consejos de ejecución</h4>${listHtml(technique.execution)}`:""}
          ${technique.breathing?`<h4>Respiración</h4><p>${esc(technique.breathing)}</p>`:""}
          <h4>Errores frecuentes</h4>
          <p>${technique.cautions.length
            ?"Evita forzar la técnica cuando aparezcan las señales indicadas."
            :"No hay errores frecuentes documentados todavía."}</p>
          ${technique.cautions.length?`<h4>Señales de molestia y advertencias</h4>${listHtml(technique.cautions)}`:""}
        </details>
      `:"<p>Aún no tenemos indicaciones confirmadas para este ejercicio. Puedes continuar con tu registro.</p>"}
    </section>
  </section>`;
}
function renderActiveWorkoutUnresolved(resolution,exercise,key){
  const showCandidates=state.workoutLibraryCandidateKey===key;
  const dismissed=Boolean(
    exercise.libraryResolutionDismissed||
    state.workoutUnresolvedDismissed?.has(key)
  );
  const candidates=showCandidates?`<div class="active-workout-candidates" aria-label="Fichas compatibles">
      ${resolution.candidates.map(candidate=>`<button type="button" data-workout-library-candidate="${esc(candidate.id)}">
        <strong>${esc(candidate.name)}</strong>
        <span>${[
          exerciseLibraryWorkflowApi().label(candidate.movementPattern),
          candidate.primaryMuscles?.length?candidate.primaryMuscles.map(exerciseLibraryWorkflowApi().label).join(", "):"",
          candidate.requiredEquipment?.length?candidate.requiredEquipment.map(exerciseLibraryWorkflowApi().label).join(", "):""
        ].filter(Boolean).map(esc).join(" · ")}</span>
        <small>Coincidencia compatible para revisar; no se aplicará sin tu confirmación.</small>
      </button>`).join("")}
      <p>La ficha elegida se asociará únicamente a este entrenamiento. No modificará tu rutina ni el historial ya guardado.</p>
    </div>`:"";
  if(dismissed){
    return `<section class="active-workout-resolution compact" role="status">
      <div class="active-workout-resolution-row">
        <span>Ficha pendiente</span>
        ${resolution.candidates.length?`<button type="button" class="text-button" data-workout-show-candidates aria-expanded="${showCandidates}">Seleccionar</button>`:""}
      </div>
      ${candidates}
    </section>`;
  }
  return `<section class="active-workout-resolution" role="status">
    <div class="active-workout-resolution-copy">
      <span class="section-kicker">Ficha pendiente</span>
      <h3>${resolution.candidates.length?"GymOS ha encontrado varias fichas posibles":"Este ejercicio no tiene una ficha confirmada"}</h3>
      <p>${resolution.candidates.length
        ?"Elige la ficha que corresponde a este ejercicio para ver su técnica y músculos trabajados."
        :"Puedes continuar el entrenamiento sin ficha; las series y la finalización seguirán disponibles."}</p>
    </div>
    <div class="active-workout-resolution-actions">
      ${resolution.candidates.length?`<button type="button" class="secondary" data-workout-show-candidates aria-expanded="${showCandidates}">Elegir ficha</button>`:""}
      <button type="button" class="text-button" data-workout-dismiss-resolution>Continuar sin ficha</button>
    </div>
    ${candidates}
  </section>`;
}
function renderActiveWorkoutSet(row,exerciseIndex,sessionId){
  const previous=row.previous
    ?row.timed
      ?row.previous.seconds?`${esc(String(row.previous.seconds))} s`:"—"
      :hasInputValue(row.previous.weight)||hasInputValue(row.previous.reps)
        ?`${esc(String(row.previous.weight||"—"))} kg × ${esc(String(row.previous.reps||"—"))}`
        :"—"
    :"—";
  const contentId=`activeSetContent${exerciseIndex}-${row.index}`;
  return `<article class="active-set-card ${row.done?"completed":""}" data-active-set="${row.index}" data-set-instance-id="${esc(row.setInstanceId||"")}">
    <header>
      <button type="button" class="active-set-toggle" data-workout-toggle-set aria-expanded="false" aria-controls="${esc(contentId)}">
        <span><span class="active-set-mobile-label">Serie </span>${row.number}</span>
        <span>
          ${row.planned?"":'<span class="active-set-extra-label">Extra</span>'}
          <span class="active-set-complete-mark" aria-label="Serie completada" ${row.done?"":"hidden"}>✓</span>
        </span>
      </button>
    </header>
    <div id="${esc(contentId)}" class="active-set-content" hidden>
      <div class="active-set-reference"><span><small>Anterior</small><strong>${previous}</strong></span><span><small>Objetivo</small><strong>${esc(row.target||"Sin definir")}</strong></span></div>
      <div class="active-set-fields ${row.timed?"duration-fields":"conventional-fields"}">
        ${row.timed
          ?`<div class="active-set-stopwatch">
              <span>Tiempo</span>
              <strong data-exercise-timer-display="${esc(exerciseTimerKey(sessionId,exerciseIndex,row.index))}">${formatExerciseTimer(currentExerciseTimerMs(getExerciseTimer(sessionId,exerciseIndex,row.index)))}</strong>
              <div><button type="button" data-active-timer-start="${row.index}" ${row.done?"disabled":""}>Iniciar</button><button type="button" data-active-timer-stop="${row.index}" ${row.done?"disabled":""}>Parar</button><button type="button" data-active-timer-reset="${row.index}" aria-label="Reiniciar cronómetro" ${row.done?"disabled":""}>↺</button></div>
            </div>
            <label><span>Duración <small>(segundos)</small></span><input inputmode="numeric" data-set-field="seconds" data-set-index="${row.index}" value="${esc(String(row.seconds))}" ${row.done?"disabled":""}></label>`
          :`<label><span>Peso <small>(kg)</small></span><input inputmode="decimal" data-set-field="weight" data-set-index="${row.index}" value="${esc(String(row.weight))}" ${row.done?"disabled":""}></label>
            <label><span>Repeticiones</span><input inputmode="numeric" data-set-field="reps" data-set-index="${row.index}" value="${esc(String(row.reps))}" ${row.done?"disabled":""}></label>`}
        <label><span>RIR</span><select data-set-field="rir" data-set-index="${row.index}" ${row.done?"disabled":""}>
          <option value="" ${row.rir===""?"selected":""}>—</option>
          ${[0,1,2,3,4,5].map(value=>`<option value="${value}" ${String(row.rir)===String(value)?"selected":""}>${value}</option>`).join("")}
        </select></label>
      </div>
      <label class="active-set-warmup" title="Serie de calentamiento"><input type="checkbox" data-set-warmup="${row.index}" ${row.warmup?"checked":""} ${row.done?"disabled":""}><span>Calentamiento</span></label>
      <div class="active-set-actions">
        <button type="button" class="${row.done?"secondary":"primary"}" data-complete-active-set="${row.index}" aria-pressed="${row.done}" aria-label="${row.done?`Corregir serie ${row.number}`:`Completar serie ${row.number}`}">${row.done?"Corregir":"Completar"}</button>
        ${row.canDelete?`<button type="button" class="text-button" data-delete-active-set="${row.index}" aria-label="Eliminar serie ${row.number}">Eliminar</button>`:""}
      </div>
    </div>
  </article>`;
}
function renderActiveRestOverlay(rest){
  if(!state.restOverlayOpen||!rest?.running) return "";
  return `<div class="workout-rest-overlay" data-rest-overlay>
    <section class="workout-rest-dialog" role="dialog" aria-modal="true" aria-labelledby="workoutRestOverlayTitle" tabindex="-1">
      <header><div><span>Descanso</span><strong id="workoutRestOverlayTitle" data-active-rest-overlay-time>${formatTimer(rest.remainingSeconds)}</strong></div><button type="button" class="icon-button" data-close-rest-overlay aria-label="Cerrar aviso de descanso">×</button></header>
      <p>El temporizador seguirá activo si cierras este aviso.</p>
      <div class="workout-rest-dialog-actions"><button type="button" class="secondary" data-add-rest>+30 s</button><button type="button" class="text-button" data-skip-rest>Omitir</button></div>
    </section>
  </div>`;
}
function syncActiveRestOverlay(){
  const shell=document.querySelector(".active-workout-shell");
  if(!shell) return;
  shell.querySelector("[data-rest-overlay]")?.remove();
  const rest=activeWorkoutApi().restTimerModel({
    deadlineEpochMs:state.timerDeadline,now:Date.now(),
    seconds:state.timerSeconds,running:Boolean(state.restTimerPayload),
    defaultSeconds:getRestSeconds()
  });
  const html=renderActiveRestOverlay(rest);
  if(!html) return;
  const workoutContent=shell.querySelector(
    ".active-workout-screen,.mobile-workout-main-content"
  );
  workoutContent?.setAttribute("inert","");
  workoutContent?.setAttribute("aria-hidden","true");
  shell.insertAdjacentHTML("beforeend",html);
  requestAnimationFrame(()=>shell.querySelector(".workout-rest-dialog")?.focus({preventScroll:true}));
}
function closeActiveRestOverlay({focusPersistent=true}={}){
  if(!state.restOverlayOpen&&!document.querySelector("[data-rest-overlay]")) return false;
  state.restOverlayOpen=false;
  document.querySelector("[data-rest-overlay]")?.remove();
  const workoutContent=document.querySelector(
    ".active-workout-screen,.mobile-workout-main-content"
  );
  if(!state.workoutMobileUi?.panel){
    workoutContent?.removeAttribute("inert");
    workoutContent?.removeAttribute("aria-hidden");
    document.body.classList.remove("mobile-workout-sheet-open");
  }
  if(focusPersistent){
    requestAnimationFrame(()=>document.querySelector(
      "[data-active-rest-container],.mobile-workout-rest"
    )?.scrollIntoView({
      behavior:document.body.classList.contains("reduce-motion")?"auto":"smooth",
      block:"start",inline:"nearest"
    }));
  }
  return true;
}
function hasInputValue(value){
  return value!==null&&value!==undefined&&value!=="";
}
function workoutDetailPanelKey(exerciseInstanceId,kind){
  return `${exerciseInstanceId}:${kind}`;
}
function workoutLocalSaveSucceeded(){
  return state.workoutDraftSaveStatus!=="local_error"&&(
    !state.workoutDraftLastError||
    state.workoutDraftLastError.code==="remote_sync_failed"
  );
}
function flushWorkoutDetailPanels(exerciseInstanceId,kinds=["notes","discomfort"]){
  const dirtyKeys=kinds
    .map(kind=>workoutDetailPanelKey(exerciseInstanceId,kind))
    .filter(key=>state.workoutDirtyDetailPanels.has(key));
  if(!dirtyKeys.length) return true;
  try{
    const saved=flushWorkoutDraftProgress({
      scheduleSync:true,silent:true,requireLocal:true
    });
    if(!saved||!workoutLocalSaveSucceeded()) return false;
    dirtyKeys.forEach(key=>state.workoutDirtyDetailPanels.delete(key));
    return true;
  }catch(error){
    updateActiveWorkoutInlineMessage();
    return false;
  }
}
function focusNextPendingWorkoutExercise(exerciseInstanceId){
  const draft=state.workoutDraftMemory;
  const exercises=draft?.exercises||[];
  const currentIndex=exercises.findIndex(
    exercise=>exercise.exerciseInstanceId===exerciseInstanceId
  );
  const ordered=currentIndex>=0
    ?[...exercises.slice(currentIndex+1),...exercises.slice(0,currentIndex)]
    :exercises;
  const next=ordered.find(
    exercise=>activeWorkoutExerciseStatus(exercise)!=="completed"
  );
  if(!next?.exerciseInstanceId) return;
  state.workoutExpandedExercises.add(next.exerciseInstanceId);
  requestAnimationFrame(()=>{
    const card=document.querySelector(
      `[data-exercise-instance-id="${CSS.escape(next.exerciseInstanceId)}"]`
    );
    if(!card) return;
    const toggle=card.querySelector("[data-workout-toggle-exercise]");
    const panel=card.querySelector(".workout-exercise-panel");
    card.classList.add("expanded");
    card.classList.add("workout-next-pending-highlight");
    toggle?.setAttribute("aria-expanded","true");
    if(panel) panel.hidden=false;
    card.scrollIntoView({
      behavior:document.body.classList.contains("reduce-motion")?"auto":"smooth",
      block:"nearest"
    });
    toggle?.focus({preventScroll:true});
    setTimeout(()=>card.classList.remove("workout-next-pending-highlight"),500);
  });
}
function collapseCompletedWorkoutExercise(exerciseInstanceId){
  state.workoutExpandedExercises.delete(exerciseInstanceId);
  const card=document.querySelector(
    `[data-exercise-instance-id="${CSS.escape(exerciseInstanceId)}"]`
  );
  const panel=card?.querySelector(".workout-exercise-panel");
  const reduceMotion=document.body.classList.contains("reduce-motion");
  let finished=false;
  const finish=()=>{
    if(finished) return;
    finished=true;
    renderWorkout();
    focusNextPendingWorkoutExercise(exerciseInstanceId);
  };
  if(!panel||reduceMotion){
    finish();
    return;
  }
  panel.style.maxHeight=`${panel.scrollHeight}px`;
  panel.style.overflow="hidden";
  requestAnimationFrame(()=>{
    panel.classList.add("is-collapsing");
    panel.style.maxHeight="0px";
  });
  panel.addEventListener("transitionend",finish,{once:true});
  setTimeout(finish,240);
}
function renderActiveWorkoutExercise({
  exercise,index,sessionId,last,library,defaultRest,currentExerciseIndex
}){
  const api=activeWorkoutApi();
  const exerciseId=api.exerciseIdentity(exercise,index);
  const instanceId=exercise.exerciseInstanceId||exerciseId;
  const key=activeWorkoutExerciseKey(sessionId,exercise,index);
  const selectedLibraryId=state.workoutVisualLibrarySelections.get(key)||
    exercise.resolvedLibraryExerciseId||null;
  const resolution=api.exerciseLibraryResolutionModel({
    exercise,library,selectedExerciseId:selectedLibraryId,
    normalize:window.GymOSExerciseDomain.normalizeToken
  });
  const googleReference=api.googleExerciseReferenceModel({
    exercise,libraryExercise:resolution.exercise
  });
  const guide=api.exerciseGuideModel({
    exercise:resolution.exercise,label:exerciseLibraryWorkflowApi().label
  });
  const timed=isTimedExercise(exercise);
  const previous=previousExerciseForWorkout(last,exercise,index);
  const rows=exercise.series.map((set,setIndex)=>api.setEntryModel({
    set,index:setIndex,previous:previous?.series?.[setIndex]||null,
    target:exercise.target,timed
  }));
  const status=activeWorkoutExerciseStatus(exercise);
  const seriesSummary=api.setSeriesSummaryModel({
    series:rows,plannedSets:exercise.sets
  });
  const detailSummary=api.exerciseDetailDisclosureModel(exercise);
  const completedSets=seriesSummary.completed;
  const expanded=state.workoutExpandedExercises.has(instanceId);
  const notesKey=workoutDetailPanelKey(instanceId,"notes");
  const discomfortKey=workoutDetailPanelKey(instanceId,"discomfort");
  const notesExpanded=state.workoutExpandedDetailPanels.has(notesKey);
  const discomfortExpanded=state.workoutExpandedDetailPanels.has(discomfortKey);
  const statusLabel={
    completed:"Completado",started:"En curso",pending:"Pendiente"
  }[status];
  const muscle=guide.muscles.primary[0]||"Grupo muscular pendiente";
  const pattern=guide.pattern||guide.category||"";
  const technique=guide.technique.highlights[0]||(
    guide.technique.available?"Consulta la referencia para revisar la técnica.":"Técnica pendiente de confirmar."
  );
  const recommendation=!timed
    ?exerciseRecommendation(previous,exercise.target,exercise.increment,exercise.type)
    :null;
  const restDuration=api.effectiveRestSeconds(exercise,defaultRest);
  return `<article class="workout-exercise-card status-${status}${expanded?" expanded":""}" data-exercise-instance-id="${esc(instanceId)}" data-exercise-index="${index}">
    <header class="workout-exercise-card-header">
      <button type="button" class="workout-exercise-toggle" data-workout-toggle-exercise aria-expanded="${expanded}" aria-controls="workoutExercisePanel${index}">
        <span class="workout-exercise-order">${index+1}</span>
        <span class="workout-exercise-title">
          <strong id="workoutExerciseTitle${index}">${esc(exercise.name)}</strong>
          <small>${esc(muscle)}${pattern?` · ${esc(pattern)}`:""}</small>
        </span>
        <span class="workout-exercise-prescription">${exercise.sets||rows.length} × ${esc(exercise.target||"—")} · RIR ${esc(exercise.targetRir||"—")} · ${restDuration} s descanso</span>
        <span class="workout-exercise-state" data-status="${status}">${status==="completed"?"✓ ":""}${statusLabel}<small>${esc(seriesSummary.performedLabel)}</small></span>
        <span class="workout-exercise-chevron" aria-hidden="true">⌄</span>
      </button>
    </header>
    <div id="workoutExercisePanel${index}" class="workout-exercise-panel" ${expanded?"":"hidden"} aria-labelledby="workoutExerciseTitle${index}">
      <div class="workout-exercise-quick-info">
        <p><strong>Técnica</strong><span>${esc(technique)}</span></p>
        <p><strong>Trabaja</strong><span>${esc([
          ...guide.muscles.primary,...guide.muscles.secondary
        ].slice(0,3).join(", ")||"Información muscular pendiente")}</span></p>
        <div>
          <a class="text-button" data-workout-reference href="${esc(googleReference.url)}" target="_blank" rel="noopener noreferrer">Ver referencia</a>
          <button type="button" class="text-button" data-workout-change-exercise aria-controls="workoutChangeDialog">Cambiar ejercicio</button>
        </div>
      </div>
      ${!resolution.exercise?renderActiveWorkoutUnresolved(resolution,exercise,key):""}
      ${recommendation?`<p class="workout-exercise-recommendation"><strong>${esc(recommendation.title)}</strong> ${esc(recommendation.text)}</p>`:""}
      <section class="active-workout-sets" aria-labelledby="activeWorkoutSetsTitle${index}">
        <div class="active-workout-section-heading"><h2 id="activeWorkoutSetsTitle${index}">Series <small>${esc(seriesSummary.label)}</small></h2><button type="button" class="text-button add-extra-set-header" data-add-extra-set>+ Añadir serie</button></div>
        <div class="active-set-desktop-head" aria-hidden="true"><span>#</span><span>Anterior / objetivo</span><span>Registro</span><span>Acciones</span></div>
        ${rows.map(row=>renderActiveWorkoutSet(row,index,sessionId)).join("")}
        <button type="button" class="text-button add-extra-set-footer" data-add-extra-set>+ Serie extra</button>
      </section>
      <div class="workout-exercise-details">
        <section class="workout-exercise-detail">
          <button type="button" class="workout-exercise-detail-toggle" data-workout-detail-toggle="notes" aria-expanded="${notesExpanded}" aria-controls="workoutExerciseNotesPanel${index}">
            <span>${esc(detailSummary.notes.label)}</span>
            ${detailSummary.notes.hasContent?'<span class="workout-detail-content-mark" aria-label="Nota añadida">✓</span>':""}
            <span class="workout-detail-chevron" aria-hidden="true">⌄</span>
          </button>
          <div id="workoutExerciseNotesPanel${index}" class="workout-exercise-detail-panel" ${notesExpanded?"":"hidden"}>
            <label class="active-workout-notes"><span class="sr-only">Notas del ejercicio</span><textarea data-active-workout-notes placeholder="Añade una nota opcional">${esc(exercise.notes||"")}</textarea></label>
          </div>
        </section>
        <section class="workout-exercise-detail">
          <button type="button" class="workout-exercise-detail-toggle" data-workout-detail-toggle="discomfort" aria-expanded="${discomfortExpanded}" aria-controls="workoutExerciseDiscomfortPanel${index}">
            <span>${esc(detailSummary.discomfort.label)}</span>
            ${detailSummary.discomfort.hasContent?`<span class="workout-detail-safe-summary">${esc(detailSummary.discomfort.safeSummary)}</span>`:""}
            <span class="workout-detail-chevron" aria-hidden="true">⌄</span>
          </button>
          <div id="workoutExerciseDiscomfortPanel${index}" class="workout-exercise-detail-panel" ${discomfortExpanded?"":"hidden"}>
            <label class="active-workout-notes"><span class="sr-only">Molestias durante el ejercicio</span><input data-active-workout-discomfort value="${esc(exercise.discomfort||"")}" placeholder="Describe la molestia"></label>
          </div>
        </section>
      </div>
      <div class="active-workout-exercise-completion">
        <button type="button" class="secondary" data-complete-active-exercise>${exercise.completedAt?"Actualizar ejercicio":"Completar ejercicio"}</button>
        <span role="status" data-workout-exercise-saved ${exercise.completedAt?"":"hidden"}>✓ Ejercicio guardado</span>
      </div>
    </div>
  </article>`;
}
function renderActiveWorkoutOverlays({draft,header,review,reference,rest,changeAllowed=false}){
  const statusLabels={completed:"Completado",started:"Iniciado",pending:"Pendiente"};
  const summary=state.workoutSessionOverviewOpen?`<div class="workout-modal-backdrop" data-workout-close-modal>
    <section id="workoutSessionOverviewDialog" class="workout-modal session-overview-modal" role="dialog" aria-modal="true" aria-labelledby="workoutSessionOverviewTitle">
      <header><div><span class="section-kicker">SESIÓN</span><h2 id="workoutSessionOverviewTitle">${esc(header.sessionName)}</h2></div><button type="button" class="icon-button" data-workout-close-modal aria-label="Cerrar">×</button></header>
      <div class="workout-session-exercise-list">
        ${draft.exercises.map((exercise,index)=>{
          const status=activeWorkoutExerciseStatus(exercise);
          return `<button type="button" data-workout-jump-exercise="${index}" data-exercise-id="${esc(activeWorkoutApi().exerciseIdentity(exercise,index))}" aria-current="${index===header.exerciseIndex?"step":"false"}">
            <span>${index+1}</span><strong>${esc(exercise.name)}</strong><small>${exercise.substitution?"Sustituido · ":""}${statusLabels[status]}</small>
          </button>`;
        }).join("")}
      </div>
    </section>
  </div>`:"";
  const referenceDialog=reference?`<div class="workout-modal-backdrop" data-workout-close-modal>
    <section id="workoutReferenceDialog" class="workout-modal workout-reference-modal" role="dialog" aria-modal="true" aria-labelledby="exerciseGuideTitle">
      <header><div><span class="section-kicker">TÉCNICA Y REFERENCIA</span><h2 id="exerciseGuideTitle">${esc(reference.exercise.name)}</h2></div><button type="button" class="icon-button" data-workout-close-modal aria-label="Cerrar referencia">×</button></header>
      ${renderActiveWorkoutGuide(reference.guide,reference.exercise,{dialog:true})}
    </section>
  </div>`:"";
  const change=state.workoutChangeMenuOpen?`<div class="workout-modal-backdrop" data-workout-close-modal>
    <section id="workoutChangeDialog" class="workout-modal workout-change-modal" role="dialog" aria-modal="true" aria-labelledby="workoutChangeTitle">
      <header><h2 id="workoutChangeTitle">¿Dónde quieres aplicar el cambio?</h2><button type="button" class="icon-button" data-workout-close-modal aria-label="Cerrar">×</button></header>
      ${changeAllowed?`<button type="button" data-workout-change-mode="temporary"><strong>Solo en este entrenamiento</strong><span>La rutina continuará igual.</span></button>
        <button type="button" data-workout-change-mode="permanent"><strong>Cambiar en mi rutina</strong><span>Se creará una propuesta para revisar y confirmar.</span></button>`
        :`<p class="form-message info">Primero debes elegir una ficha compatible para esta visita. GymOS no puede crear una sustitución segura desde una coincidencia ambigua.</p>`}
    </section>
  </div>`:"";
  const completion=state.workoutCompletionReviewOpen?`<div class="workout-modal-backdrop" data-workout-close-modal>
    <section id="workoutCompletionDialog" class="workout-modal workout-completion-modal" role="dialog" aria-modal="true" aria-labelledby="workoutCompletionTitle">
      <header><div><span class="section-kicker">REVISIÓN FINAL</span><h2 id="workoutCompletionTitle">Revisa tu entrenamiento</h2></div><button type="button" class="icon-button" data-workout-close-modal aria-label="Cerrar">×</button></header>
      <dl>
        <div><dt>Ejercicios completados</dt><dd>${review.completedExercises} de ${review.exercises.length}</dd></div>
        <div><dt>Ejercicios parciales</dt><dd>${review.partialExercises}</dd></div>
        <div><dt>Sin comenzar</dt><dd>${review.untouchedExercises}</dd></div>
        <div><dt>Series pendientes</dt><dd>${review.pendingSets}</dd></div>
        <div><dt>Duración</dt><dd>${formatSessionElapsed(review.elapsedMs)}</dd></div>
        <div><dt>Sustituciones</dt><dd>${review.substitutions}</dd></div>
        ${review.notes?`<div><dt>Ejercicios con notas</dt><dd>${review.notes}</dd></div>`:""}
      </dl>
      ${review.noteItems.length?`<section class="workout-review-notes" aria-labelledby="workoutReviewNotesTitle">
        <h3 id="workoutReviewNotesTitle">Notas registradas</h3>
        <ul>${review.noteItems.map(item=>`<li><strong>${esc(item.name)}</strong><span>${esc(item.text)}</span></li>`).join("")}</ul>
      </section>`:""}
      ${review.complete?"":`<div class="form-message info" role="status"><strong>Te quedan ${review.pendingSets} ${review.pendingSets===1?"serie pendiente":"series pendientes"}.</strong><p>Puedes volver al entrenamiento o finalizar conservando únicamente los resultados registrados.</p></div>`}
      <div class="workout-modal-actions">
        ${review.complete?"":'<button type="button" class="secondary" data-workout-close-modal>Volver al entrenamiento</button>'}
        <button type="button" class="primary" data-workout-finish ${state.finishingWorkout?"disabled":""}>${state.finishingWorkout?"Finalizando…":review.complete?"Finalizar entrenamiento":"Finalizar de todas formas"}</button>
      </div>
    </section>
  </div>`:"";
  const deleteSet=state.workoutSeriesDeleteCandidate?`<div class="workout-modal-backdrop" data-workout-close-modal>
    <section class="workout-modal" role="dialog" aria-modal="true" aria-labelledby="deleteWorkoutSetTitle">
      <h2 id="deleteWorkoutSetTitle">¿Eliminar esta serie?</h2>
      <p>La serie contiene datos. Esta acción no se puede deshacer.</p>
      <div class="workout-modal-actions"><button type="button" class="secondary" data-workout-close-modal>Cancelar</button><button type="button" class="danger-button" data-confirm-delete-active-set>Eliminar serie</button></div>
    </section>
  </div>`:"";
  const discard=state.workoutDiscardConfirmOpen?`<div class="workout-modal-backdrop" data-workout-close-modal>
    <section class="workout-modal" role="dialog" aria-modal="true" aria-labelledby="discardWorkoutTitle">
      <h2 id="discardWorkoutTitle">Descartar entrenamiento</h2>
      <p>Se eliminará este borrador y los resultados que todavía no has finalizado.</p>
      <div class="workout-modal-actions"><button type="button" class="secondary" data-workout-close-modal>Conservar entrenamiento</button><button type="button" class="danger-button" data-confirm-discard-workout>Descartar</button></div>
    </section>
  </div>`:"";
  return summary+referenceDialog+change+completion+deleteSet+discard+renderActiveRestOverlay(rest);
}
function closeActiveWorkoutOverlay(){
  const returnFocusSelector=state.workoutReturnFocusSelector;
  const showMobileSheetSaveError=()=>{
    const target=document.querySelector("[data-mobile-sheet-message]");
    if(target) target.innerHTML=renderActiveWorkoutInlineMessage();
  };
  if(state.workoutMobileUi?.panel==="notes"&&state.workoutDirtyDetailPanels.size){
    try{
      const saved=flushWorkoutDraftProgress({
        scheduleSync:true,silent:true,requireLocal:true
      });
      if(!saved||!workoutLocalSaveSucceeded()){
        updateActiveWorkoutInlineMessage();
        showMobileSheetSaveError();
        return false;
      }
      state.workoutDirtyDetailPanels.clear();
    }catch(error){
      updateActiveWorkoutInlineMessage();
      showMobileSheetSaveError();
      return false;
    }
  }
  updateMobileWorkoutUi({type:"CLOSE_PANEL"});
  state.workoutSessionOverviewOpen=false;
  state.workoutChangeMenuOpen=false;
  state.workoutReferenceExerciseId=null;
  state.workoutActionExerciseId=null;
  state.workoutCompletionReviewOpen=false;
  state.workoutDiscardConfirmOpen=false;
  state.workoutSeriesDeleteCandidate=null;
  state.workoutReturnFocusSelector=null;
  document.body.classList.remove("mobile-workout-sheet-open");
  renderWorkout();
  if(returnFocusSelector) requestAnimationFrame(()=>document.querySelector(returnFocusSelector)?.focus());
  return true;
}
function activeWorkoutRecoveryGuidanceModel(entry,recoveryApi=globalThis.GymOSRecovery||globalThis.window?.GymOSRecovery){
  const result=entry&&recoveryApi?.resultForEntry?.(entry);
  if(!result) return {available:false};
  return {
    available:true,
    status:String(result.status||"ready"),
    title:String(result.title||"Orientación de recuperación"),
    guidance:String(result.guidance||"Ajusta el esfuerzo según tus sensaciones reales.")
  };
}
function workoutSessionTimerForDraft(draft){
  return routineSessionRuntimeApi().normalizeSessionTimer(draft?.sessionTimer,{
    ownerId:draft?.ownerId||currentRoutineOwnerOrNull(),
    sessionId:draft?.sessionId||resolveRuntimeSessionId(),
    legacyStartedAt:draft?.sessionTimer?null:draft?.startedAt
  });
}
function workoutSessionElapsedMs(draft,now=Date.now()){
  return routineSessionRuntimeApi().sessionTimerElapsedMs(
    workoutSessionTimerForDraft(draft),now
  );
}
function startWorkoutSessionInDraft(draft,sessionId,now=Date.now()){
  const timer=workoutSessionTimerForDraft(draft);
  if(timer.status!=="idle") return false;
  const ownerId=currentRoutineOwnerOrNull();
  const resolved=resolveRuntimeSessionId(sessionId);
  draft.sessionTimer=routineSessionRuntimeApi().transitionSessionTimer(
    timer,"start",{ownerId,sessionId:resolved,now}
  );
  if(!draft.startedAt) draft.startedAt=new Date(now).toISOString();
  return true;
}
function setWorkoutSessionTimerAction(sessionId,action,now=Date.now()){
  const draft=getDraft(sessionId);
  const ownerId=currentRoutineOwnerOrNull();
  const resolved=resolveRuntimeSessionId(sessionId);
  const current=workoutSessionTimerForDraft(draft);
  if(action==="start"&&current.status==="running") return draft;
  const timer=routineSessionRuntimeApi().transitionSessionTimer(
    current,action,{ownerId,sessionId:resolved,now}
  );
  draft.sessionTimer=timer;
  if((action==="start"||action==="resume")&&!draft.startedAt){
    draft.startedAt=new Date(now).toISOString();
  }
  // El control es local y visible de inmediato; Supabase nunca participa aquí.
  return stageWorkoutDraft(draft,{immediate:true,scheduleSync:true});
}
function stopWorkoutSessionTimerDisplay(){
  if(typeof state==="undefined") return;
  clearInterval(state.workoutSessionTimerInterval);
  state.workoutSessionTimerInterval=null;
}
function updateWorkoutSessionTimerDisplay(draft){
  if(!draft) return;
  updateWorkoutSessionElapsed();
}
function startWorkoutSessionTimerDisplay(draft){
  if(!draft) return;
  startWorkoutSessionTimer({
    ownerId:draft.ownerId||currentRoutineOwnerOrNull(),
    draftId:draft.draftId,
    sessionId:draft.sessionId||resolveRuntimeSessionId(),
    sessionTimer:workoutSessionTimerForDraft(draft)
  });
}

const ACTIVE_WORKOUT_MOBILE_QUERY="(max-width:767px)";
let activeWorkoutLayoutWatcherBound=false;
let activeWorkoutViewportBound=false;
function activeWorkoutUsesMobileLayout(){
  return Boolean(window.matchMedia?.(ACTIVE_WORKOUT_MOBILE_QUERY).matches);
}
function activeWorkoutEditingInProgress(){
  const active=document.activeElement;
  return Boolean(
    state.screen==="workout"&&(
      active?.matches?.("[data-set-field],[data-active-workout-notes],[data-active-workout-discomfort]")||
      document.querySelector('.active-workout-shell .workout-modal[role="dialog"]')||
      state.workoutDirtyDetailPanels?.size
    )
  );
}
function requestSafeActiveWorkoutRender(){
  if(state.screen!=="workout") return;
  if(activeWorkoutEditingInProgress()){
    state.workoutDeferredRender=true;
    return;
  }
  state.workoutDeferredRender=false;
  renderWorkout();
}
function bindActiveWorkoutLayoutWatcher(){
  if(activeWorkoutLayoutWatcherBound||!window.matchMedia) return;
  activeWorkoutLayoutWatcherBound=true;
  const media=window.matchMedia(ACTIVE_WORKOUT_MOBILE_QUERY);
  media.addEventListener?.("change",()=>{
    if(state.workoutMobileUi?.panel){
      updateMobileWorkoutUi({type:"CLOSE_PANEL"});
      document.body.classList.remove("mobile-workout-sheet-open");
    }
    requestSafeActiveWorkoutRender();
  });
}
function updateActiveWorkoutVisualViewport(){
  const shell=document.querySelector(
    '.active-workout-shell[data-workout-layout="mobile"]'
  );
  if(!shell) return;
  const viewport=window.visualViewport;
  const height=viewport?.height||window.innerHeight;
  const offsetTop=viewport?.offsetTop||0;
  const keyboardInset=Math.max(
    0,window.innerHeight-height-offsetTop
  );
  shell.style.setProperty("--workout-visual-height",`${height}px`);
  shell.style.setProperty("--workout-keyboard-inset",`${keyboardInset}px`);
  shell.toggleAttribute("data-keyboard-open",keyboardInset>120);
}
function bindActiveWorkoutVisualViewport(){
  if(activeWorkoutViewportBound) return;
  activeWorkoutViewportBound=true;
  window.visualViewport?.addEventListener("resize",updateActiveWorkoutVisualViewport);
  window.visualViewport?.addEventListener("scroll",updateActiveWorkoutVisualViewport);
  window.addEventListener("resize",updateActiveWorkoutVisualViewport);
}
function updateMobileWorkoutUi(action){
  state.workoutMobileUi=activeWorkoutApi().reduceMobileWorkoutUi(
    state.workoutMobileUi,action
  );
}
function mobileWorkoutPrimaryButton(action){
  const attributes={
    start_session:"data-workout-session-toggle",
    complete_set:`data-complete-active-set="${Number(action.setIndex)}"`,
    save_set_correction:"data-mobile-save-set-correction",
    next_pending:`data-mobile-jump-exercise="${esc(action.exerciseInstanceId||"")}"`,
    complete_exercise:"data-complete-active-exercise",
    review:"data-workout-review",
    reset_anomalous:"data-workout-session-reset",
    open_routine:"data-open-routine-from-workout"
  }[action.kind]||"";
  return `<button type="button" class="primary mobile-workout-primary" ${attributes}>${esc(action.label)}</button>`;
}
function mobileCompletedSetLabel(row,timed=false){
  if(timed){
    return `${row.seconds||"—"} s${row.rir!==""?` · RIR ${row.rir}`:""}`;
  }
  return `${row.weight||"—"} kg × ${row.reps||"—"}${row.rir!==""?` · RIR ${row.rir}`:""}`;
}
function renderMobileWorkoutSheet({
  panel,model,draft,exercise,index,guide,resolution,review,changeAllowed
}){
  if(!panel) return "";
  const googleReference=activeWorkoutApi().googleExerciseReferenceModel({
    exercise,libraryExercise:resolution?.exercise
  });
  const close='<button type="button" class="icon-button mobile-workout-sheet-close" data-workout-close-modal aria-label="Cerrar panel">×</button>';
  const heading=(kicker,title,id,autofocus=false)=>`<header class="mobile-workout-sheet-header">
    <div>${kicker?`<span class="section-kicker">${esc(kicker)}</span>`:""}<h2 id="${id}" ${autofocus?'tabindex="-1" data-mobile-autofocus':""}>${esc(title)}</h2></div>${close}
  </header>`;
  let content="";
  let titleId="mobileWorkoutSheetTitle";
  if(panel==="exercises"){
    titleId="mobileWorkoutExercisesTitle";
    content=`${heading("SESIÓN","Ejercicios",titleId)}
      <div class="mobile-workout-exercise-list">
        ${model.exerciseRows.map(row=>`<button type="button" data-mobile-jump-exercise="${esc(row.exerciseInstanceId)}" aria-current="${row.current?"step":"false"}" ${row.current?"data-mobile-autofocus":""}>
          <span>${row.status==="completed"?"✓":row.index+1}</span>
          <strong>${esc(row.name)}</strong>
          <small>${row.status==="completed"?"Completado":row.status==="started"?"En progreso":"Pendiente"} · ${row.completedSets}/${row.totalSets}</small>
        </button>`).join("")}
      </div>`;
  }else if(panel==="technique"){
    titleId="mobileWorkoutTechniqueTitle";
    content=`${heading("TÉCNICA Y REFERENCIA",exercise.name,titleId,true)}
      ${renderActiveWorkoutGuide(guide,exercise,{
        dialog:true,labelledBy:titleId
      })}
      <a class="secondary mobile-workout-google-reference" href="${esc(googleReference.url)}" target="_blank" rel="noopener noreferrer">Ver referencia en Google</a>`;
  }else if(panel==="notes"){
    titleId="mobileWorkoutNotesTitle";
    content=`${heading("EJERCICIO","Notas y molestias",titleId)}
      <div data-mobile-sheet-message></div>
      <div class="mobile-workout-note-fields">
        <label><span>Notas del ejercicio</span><textarea data-active-workout-notes data-mobile-autofocus placeholder="Añade una nota opcional">${esc(exercise.notes||"")}</textarea></label>
        <label><span>Molestias durante el ejercicio</span><input data-active-workout-discomfort value="${esc(exercise.discomfort||"")}" placeholder="Describe la molestia"></label>
      </div>
      <div class="mobile-workout-sheet-actions"><button type="button" class="primary" data-mobile-save-close>Guardar y cerrar</button></div>`;
  }else if(panel==="library"){
    titleId="mobileWorkoutLibraryTitle";
    content=`${heading("FICHA PENDIENTE",resolution.candidates.length?"Varias fichas posibles":"Sin ficha confirmada",titleId,true)}
      <p class="subtle">${resolution.candidates.length
        ?"GymOS ha encontrado varias posibles fichas. Elige una solo si corresponde a este ejercicio."
        :"No hay una ficha compatible para seleccionar. Puedes continuar el entrenamiento con normalidad."}</p>
      ${resolution.candidates.length?`<div class="active-workout-candidates">
        ${resolution.candidates.map(candidate=>`<button type="button" data-workout-library-candidate="${esc(candidate.id)}">
          <strong>${esc(candidate.name)}</strong>
          <span>${esc(candidate.movementPattern||"Coincidencia compatible")}</span>
          <small>Usar en este entrenamiento</small>
        </button>`).join("")}
      </div>`:""}
      <div class="mobile-workout-sheet-actions"><button type="button" class="secondary" data-workout-dismiss-resolution>Continuar sin ficha</button></div>`;
  }else if(panel==="exercise_options"){
    titleId="mobileWorkoutExerciseOptionsTitle";
    const activeSet=model.activeSet;
    content=`${heading("EJERCICIO","Opciones",titleId)}
      <div class="mobile-workout-option-list">
        <button type="button" data-add-extra-set><strong>Añadir serie extra</strong><span>Se añadirá solo a este entrenamiento.</span></button>
        <button type="button" data-mobile-open-panel="change_exercise"><strong>Cambiar ejercicio</strong><span>Temporalmente o mediante una propuesta.</span></button>
        <button type="button" data-mobile-open-panel="notes"><strong>Notas y molestias</strong><span>${model.notesPresent?"Hay información registrada.":"Añade contexto opcional."}</span></button>
        ${activeSet?.canDelete?`<button type="button" class="danger-soft" data-mobile-request-delete="${esc(activeSet.setInstanceId||"")}"><strong>Eliminar serie ${activeSet.number}</strong><span>Se pedirá confirmación si contiene datos.</span></button>`:""}
      </div>`;
  }else if(panel==="change_exercise"){
    titleId="mobileWorkoutChangeTitle";
    content=`${heading("CAMBIAR EJERCICIO","¿Dónde quieres aplicar el cambio?",titleId)}
      <div class="mobile-workout-option-list">
        ${changeAllowed?`<button type="button" data-workout-change-mode="temporary"><strong>Solo en este entrenamiento</strong><span>La rutina continuará igual.</span></button>
          <button type="button" data-workout-change-mode="permanent"><strong>Proponer cambio en mi rutina</strong><span>Se creará una propuesta para revisar.</span></button>`
          :'<p class="form-message info">Primero debes seleccionar una ficha compatible para crear una sustitución segura.</p>'}
      </div>`;
  }else if(panel==="session_options"){
    titleId="mobileWorkoutSessionOptionsTitle";
    const timer=workoutSessionTimerForDraft(draft);
    content=`${heading("SESIÓN","Opciones de sesión",titleId)}
      <div class="mobile-workout-option-list">
        <button type="button" data-workout-session-toggle><strong>${timer.status==="running"?"Pausar cronómetro":timer.status==="paused"?"Reanudar cronómetro":"Empezar sesión"}</strong><span>El progreso registrado no cambia.</span></button>
        <button type="button" data-workout-session-reset><strong>Reiniciar tiempo</strong><span>No modifica ejercicios ni series.</span></button>
        <button type="button" data-mobile-open-panel="exercises"><strong>Ver ejercicios</strong><span>Consulta el estado completo de la sesión.</span></button>
        <button type="button" data-mobile-open-panel="review"><strong>Revisar y finalizar</strong><span>${review.complete?"Comprueba el resumen antes de guardar.":"Puedes finalizar conservando únicamente lo registrado."}</span></button>
        <button type="button" class="danger-soft" data-mobile-open-panel="discard"><strong>Descartar entrenamiento</strong><span>Requiere confirmación.</span></button>
      </div>`;
  }else if(panel==="delete_set"){
    titleId="mobileWorkoutDeleteSetTitle";
    content=`${heading("CONFIRMACIÓN","¿Eliminar esta serie?",titleId)}
      <p>La serie se retirará de este entrenamiento. Si contiene datos, esta acción no se puede deshacer.</p>
      <div class="mobile-workout-sheet-actions">
        <button type="button" class="secondary" data-workout-close-modal data-mobile-autofocus>Conservar serie</button>
        <button type="button" class="danger-button" data-confirm-delete-active-set>Eliminar serie</button>
      </div>`;
  }else if(panel==="discard"){
    titleId="mobileWorkoutDiscardTitle";
    content=`${heading("CONFIRMACIÓN","Descartar entrenamiento",titleId)}
      <p>Se eliminará este borrador y los resultados que todavía no has finalizado.</p>
      <div class="mobile-workout-sheet-actions">
        <button type="button" class="secondary" data-workout-close-modal data-mobile-autofocus>Conservar entrenamiento</button>
        <button type="button" class="danger-button" data-confirm-discard-workout>Descartar</button>
      </div>`;
  }else if(panel==="review"){
    titleId="mobileWorkoutReviewTitle";
    content=`${heading("REVISIÓN FINAL","Revisa tu entrenamiento",titleId,true)}
      <dl class="mobile-workout-review">
        <div><dt>Ejercicios completados</dt><dd>${review.completedExercises} de ${review.exercises.length}</dd></div>
        <div><dt>Ejercicios parciales</dt><dd>${review.partialExercises}</dd></div>
        <div><dt>Sin comenzar</dt><dd>${review.untouchedExercises}</dd></div>
        <div><dt>Series pendientes</dt><dd>${review.pendingSets}</dd></div>
        <div><dt>Duración</dt><dd>${formatSessionElapsed(review.elapsedMs)}</dd></div>
        <div><dt>Sustituciones</dt><dd>${review.substitutions}</dd></div>
        <div><dt>Ejercicios con notas</dt><dd>${review.notes}</dd></div>
      </dl>
      ${review.exercises.some(row=>row.status!=="completed")?`<div class="mobile-workout-review-pending" aria-label="Ejercicios pendientes">
        ${review.exercises.filter(row=>row.status!=="completed").map(row=>{
          const rowIndex=review.exercises.indexOf(row);
          const instanceId=model.exerciseRows[rowIndex]?.exerciseInstanceId||row.exerciseId;
          return `<button type="button" data-mobile-jump-exercise="${esc(instanceId)}"><strong>${esc(row.name)}</strong><span>${row.status==="partial"?"En progreso":"Sin comenzar"} · ${row.pendingSets} pendientes</span></button>`;
        }).join("")}
      </div>`:""}
      ${review.complete?"":`<p class="form-message info">Se conservarán únicamente los resultados registrados.</p>`}
      <div class="mobile-workout-sheet-actions">
        <button type="button" class="secondary" data-workout-close-modal>Volver</button>
        <button type="button" class="primary" data-workout-finish ${state.finishingWorkout?"disabled":""}>${state.finishingWorkout?"Finalizando…":review.complete?"Finalizar entrenamiento":"Finalizar de todas formas"}</button>
      </div>`;
  }
  if(!content) return "";
  return `<div class="workout-modal-backdrop mobile-workout-sheet-backdrop" data-workout-close-modal>
    <section class="workout-modal mobile-workout-sheet" role="dialog" aria-modal="true" aria-labelledby="${titleId}" data-exercise-instance-id="${esc(model.exerciseInstanceId||"")}" data-exercise-index="${index}">
      <span class="mobile-workout-sheet-handle" aria-hidden="true"></span>${content}
    </section>
  </div>`;
}
function renderMobileWorkout({
  ownerId,sessionId,draft,session,sessionName,last,library,elapsedForDisplay,
  elapsedAnomalous,sessionTimer,review,rest
}){
  const api=activeWorkoutApi();
  const ui=api.reduceMobileWorkoutUi(state.workoutMobileUi,{});
  state.workoutMobileUi=ui;
  const model=api.mobileWorkoutViewModel({
    draft,currentExerciseInstanceId:draft.currentExerciseInstanceId,
    selectedSetInstanceId:ui.selectedSetInstanceId,
    sessionTimerStatus:sessionTimer.status,elapsedAnomalous,
    saveStatus:state.workoutDraftSaveStatus,offline:!navigator.onLine
  });
  const exercise=model.exercise;
  const index=model.exerciseIndex;
  let guide={image:null,muscles:{available:false,primary:[],secondary:[]},technique:{available:false,highlights:[],setup:[],execution:[],breathing:"",cautions:[]}};
  let resolution={exercise:null,candidates:[]};
  let activeRow=null;
  let timed=false;
  if(exercise){
    const key=activeWorkoutExerciseKey(sessionId,exercise,index);
    resolution=api.exerciseLibraryResolutionModel({
      exercise,library,
      selectedExerciseId:state.workoutVisualLibrarySelections.get(key)||
        exercise.resolvedLibraryExerciseId||null,
      normalize:window.GymOSExerciseDomain.normalizeToken
    });
    guide=api.exerciseGuideModel({
      exercise:resolution.exercise,label:exerciseLibraryWorkflowApi().label
    });
    timed=isTimedExercise(exercise);
    if(model.activeSet){
      const previous=previousExerciseForWorkout(last,exercise,index);
      activeRow=api.setEntryModel({
        set:exercise.series[model.activeSetIndex],
        index:model.activeSetIndex,
        previous:previous?.series?.[model.activeSetIndex]||null,
        target:exercise.target,timed
      });
    }
  }
  const completedVisible=ui.completedExpanded
    ?model.completedSets
    :[];
  const progress=model.progress.total
    ?Math.round((model.progress.current/model.progress.total)*100)
    :0;
  const changeAllowed=Boolean(resolution.exercise);
  const panel=ui.panel;
  const modalOpen=Boolean(panel||state.restOverlayOpen);
  const activePrevious=activeRow?.previous
    ?timed
      ?activeRow.previous.seconds?`${activeRow.previous.seconds} s`:"—"
      :`${activeRow.previous.weight||"—"} kg × ${activeRow.previous.reps||"—"}`
    :"—";
  const activeSetHtml=activeRow?`<article class="mobile-workout-active-set" data-active-set="${activeRow.index}" data-set-instance-id="${esc(activeRow.setInstanceId||"")}">
    <header>
      <div><span class="section-kicker">SERIE ACTIVA</span><h2>Serie ${activeRow.number} de ${exercise.series.length}</h2></div>
      ${activeRow.planned?"":'<span class="mobile-workout-extra-badge">Extra</span>'}
    </header>
    <div class="mobile-workout-set-reference">
      <span><small>Anterior</small><strong>${esc(activePrevious)}</strong></span>
      <span><small>Objetivo</small><strong>${esc(activeRow.target||"Sin definir")}</strong></span>
    </div>
    <div class="mobile-workout-set-fields ${timed?"duration-fields":"conventional-fields"}">
      ${timed
        ?`<div class="mobile-workout-set-timer">
            <span>Cronómetro de serie</span>
            <strong data-exercise-timer-display="${esc(exerciseTimerKey(sessionId,index,activeRow.index))}">${formatExerciseTimer(currentExerciseTimerMs(getExerciseTimer(sessionId,index,activeRow.index)))}</strong>
            <div><button type="button" data-active-timer-start="${activeRow.index}">Iniciar</button><button type="button" data-active-timer-stop="${activeRow.index}">Parar</button><button type="button" data-active-timer-reset="${activeRow.index}" aria-label="Reiniciar cronómetro">↺</button></div>
          </div>
          <label><span>Duración <small>(segundos)</small></span><input inputmode="numeric" enterkeyhint="next" data-set-field="seconds" data-set-index="${activeRow.index}" value="${esc(String(activeRow.seconds))}"></label>`
        :`<label><span>Peso <small>(kg)</small></span><input inputmode="decimal" enterkeyhint="next" data-set-field="weight" data-set-index="${activeRow.index}" value="${esc(String(activeRow.weight))}"></label>
          <label><span>Repeticiones</span><input inputmode="numeric" enterkeyhint="next" data-set-field="reps" data-set-index="${activeRow.index}" value="${esc(String(activeRow.reps))}"></label>`}
      <label><span>RIR</span><select enterkeyhint="done" data-set-field="rir" data-set-index="${activeRow.index}">
        <option value="" ${activeRow.rir===""?"selected":""}>—</option>
        ${[0,1,2,3,4,5].map(value=>`<option value="${value}" ${String(activeRow.rir)===String(value)?"selected":""}>${value}</option>`).join("")}
      </select></label>
    </div>
    <label class="mobile-workout-warmup"><input type="checkbox" data-set-warmup="${activeRow.index}" ${activeRow.warmup?"checked":""}><span>Serie de calentamiento</span></label>
  </article>`:"";
  const primaryAction=model.primaryAction.kind==="complete_set"
    ?activeRow
      ?{...model.primaryAction,setIndex:activeRow.index}
      :{kind:"complete_exercise",label:"Completar ejercicio y continuar"}
    :model.primaryAction;
  app.innerHTML=`<div class="app-shell active-workout-shell" data-workout-layout="mobile">
    <main class="active-workout-mobile-screen">
      <div class="mobile-workout-main-content" ${modalOpen?"inert aria-hidden=\"true\"":""}>
        <header class="mobile-workout-header">
          <button type="button" class="icon-button" data-workout-back aria-label="Volver a Inicio">←</button>
          <button type="button" class="mobile-workout-position" data-mobile-open-panel="exercises" data-mobile-focus-id="exercise-position" aria-haspopup="dialog" aria-label="${esc(model.accessibleLabel)}. Abre el panel de ejercicios.">
            <strong>${esc(model.positionLabel)}</strong><span>${esc(sessionName)}</span>
          </button>
          <button type="button" class="mobile-workout-clock" data-mobile-open-panel="session_options" data-mobile-focus-id="session-clock" aria-haspopup="dialog" aria-label="${esc(sessionElapsedAccessible(elapsedForDisplay))}. Abre las opciones de sesión.">
            <time data-workout-session-elapsed data-draft-id="${esc(String(draft.draftId||""))}" datetime="PT${Math.floor(elapsedForDisplay/1000)}S">${elapsedAnomalous?"--:--":formatSessionElapsed(elapsedForDisplay)}</time>
          </button>
          <span class="mobile-workout-save" data-workout-save-status data-status="${esc(state.workoutDraftSaveStatus)}" role="status" aria-live="polite">${esc(model.save.label)}</span>
          <button type="button" class="icon-button" data-mobile-open-panel="session_options" data-mobile-focus-id="session-menu" aria-haspopup="dialog" aria-label="Opciones de sesión">⋯</button>
          <div class="mobile-workout-progress" role="progressbar" aria-label="Posición en la sesión" aria-valuemin="0" aria-valuemax="${model.progress.total}" aria-valuenow="${model.progress.current}"><span style="width:${progress}%"></span></div>
        </header>
        <div data-workout-inline-message>${renderActiveWorkoutInlineMessage()}</div>
        ${state.workoutDraftMessage?`<p class="workout-draft-message ${esc(state.workoutDraftMessage.type)}" role="${state.workoutDraftMessage.type==="warning"?"alert":"status"}">${esc(state.workoutDraftMessage.text)}</p>`:""}
        ${elapsedAnomalous?'<p class="form-message info">Este borrador conserva sus datos, pero debes retomar el tiempo antes de finalizar.</p>':""}
        ${rest.running?`<section class="mobile-workout-rest ${ui.restMinimized?"minimized":""}" aria-labelledby="activeRestTitle">
          <button type="button" class="mobile-workout-rest-toggle" data-mobile-toggle-rest aria-expanded="${!ui.restMinimized}" aria-label="${ui.restMinimized?"Expandir descanso":"Minimizar descanso"}">
            <span>Descanso</span><strong id="activeRestTitle" data-active-rest-time aria-live="off">${formatTimer(rest.remainingSeconds)}</strong>
          </button>
          ${ui.restMinimized?"":'<div><button type="button" data-skip-rest>Omitir</button><button type="button" data-add-rest>+30 s</button></div>'}
        </section>`:""}
        ${exercise?`<section class="mobile-workout-exercise" data-exercise-instance-id="${esc(model.exerciseInstanceId)}" data-exercise-index="${index}" aria-labelledby="mobileWorkoutExerciseTitle">
          <header class="mobile-workout-exercise-header">
            <div><h1 id="mobileWorkoutExerciseTitle" tabindex="-1">${esc(exercise.name)}</h1>
              <p>${model.prescription.sets} series · ${esc(model.prescription.target||"Objetivo pendiente")} · RIR ${esc(model.prescription.targetRir||"—")}${model.prescription.restSeconds?` · ${model.prescription.restSeconds} s descanso`:""}</p>
            </div>
            <button type="button" class="icon-button" data-mobile-open-panel="exercise_options" data-mobile-focus-id="exercise-menu" aria-label="Opciones del ejercicio">⋯</button>
          </header>
          <nav class="mobile-workout-context-actions" aria-label="Información del ejercicio">
            <button type="button" data-mobile-open-panel="technique" data-mobile-focus-id="technique">Técnica</button>
            <button type="button" data-mobile-open-panel="notes" data-mobile-focus-id="notes">Nota${model.notesPresent?" ✓":""}</button>
            <button type="button" data-mobile-open-panel="${resolution.exercise?"technique":"library"}" data-mobile-focus-id="library">Ficha${resolution.exercise?"":" pendiente"}</button>
            <button type="button" data-mobile-open-panel="exercise_options" data-mobile-focus-id="exercise-options">Opciones</button>
          </nav>
          ${!resolution.exercise?`<button type="button" class="mobile-workout-library-pending" data-mobile-open-panel="library" data-mobile-focus-id="library-pending"><span>Ficha pendiente</span><strong>${resolution.candidates.length?"Revisar opciones":"Continuar sin ficha"}</strong></button>`:""}
          ${model.completedSets.length?`<section class="mobile-workout-completed" aria-labelledby="mobileWorkoutCompletedTitle">
            <button type="button" class="mobile-workout-disclosure" data-mobile-toggle-completed aria-expanded="${ui.completedExpanded}">
              <span id="mobileWorkoutCompletedTitle">${model.completedSets.length} ${model.completedSets.length===1?"serie realizada":"series realizadas"}</span><strong>${ui.completedExpanded?"Ocultar":"Ver"}</strong>
            </button>
            <div class="mobile-workout-summary-rows">
              ${completedVisible.map(row=>`<button type="button" data-mobile-edit-set="${esc(row.setInstanceId||"")}" aria-label="Editar serie ${row.number}: ${esc(mobileCompletedSetLabel(row,timed))}">
                <span>✓ Serie ${row.number}</span><strong>${esc(mobileCompletedSetLabel(row,timed))}</strong><small>Editar</small>
              </button>`).join("")}
            </div>
          </section>`:""}
          ${activeSetHtml}
          ${model.futureSets.length?`<section class="mobile-workout-future">
            <button type="button" class="mobile-workout-disclosure" data-mobile-toggle-future aria-expanded="${ui.futureExpanded}">
              <span>${model.futureSets.length} ${model.futureSets.length===1?"serie pendiente":"series pendientes"}</span><strong>${ui.futureExpanded?"Ocultar":"Ver"}</strong>
            </button>
            ${ui.futureExpanded?`<div class="mobile-workout-summary-rows">
              ${model.futureSets.map(row=>`<button type="button" data-mobile-select-set="${esc(row.setInstanceId||"")}"><span>Serie ${row.number}</span><strong>Pendiente</strong><small>Activar</small></button>`).join("")}
            </div>`:""}
          </section>`:""}
        </section>`:`<section class="mobile-workout-empty" role="status"><h1>Esta sesión no tiene ejercicios</h1><p>Vuelve a Mi rutina para añadir ejercicios antes de empezar.</p></section>`}
        <p id="activeRestStatus" class="sr-only" aria-live="polite"></p>
        ${exercise?`<nav class="mobile-workout-exercise-nav" aria-label="Navegación entre ejercicios">
          <button type="button" data-mobile-previous-exercise ${model.previousExercise?"":"disabled"} aria-label="Ejercicio anterior">←</button>
          <button type="button" data-mobile-open-panel="exercises" data-mobile-focus-id="exercise-navigation" aria-haspopup="dialog">Ejercicios</button>
          <button type="button" data-mobile-next-exercise ${model.nextExercise?"":"disabled"} aria-label="Ejercicio siguiente">→</button>
        </nav>`:""}
        <footer class="mobile-workout-primary-bar" ${exercise?`data-exercise-instance-id="${esc(model.exerciseInstanceId)}" data-exercise-index="${index}"`:""} ${activeRow?`data-set-instance-id="${esc(activeRow.setInstanceId||"")}"`:""}>${mobileWorkoutPrimaryButton(primaryAction)}</footer>
      </div>
      ${renderMobileWorkoutSheet({
        panel,model,draft,exercise,index,guide,resolution,review,changeAllowed
      })}
    </main>
    ${renderActiveRestOverlay(rest)}
  </div>`;
  document.body.classList.toggle("mobile-workout-sheet-open",modalOpen);
  if(state.workoutRestAnnouncement){
    const status=document.getElementById("activeRestStatus");
    if(status) status.textContent=state.workoutRestAnnouncement;
    state.workoutRestAnnouncement=null;
  }
  if(!elapsedAnomalous) startWorkoutSessionTimer({
    ownerId,draftId:String(draft.draftId||""),sessionId,sessionTimer
  });
  else stopWorkoutSessionTimer();
  bindActiveWorkoutEvents({
    ownerId,sessionId,draftId:draft.draftId,
    workoutInstanceId:draft.workoutInstanceId,
    exerciseIndex:index,exerciseInstanceId:model.exerciseInstanceId,
    elapsedAnomalous
  });
  bindActiveWorkoutLayoutWatcher();
  bindActiveWorkoutVisualViewport();
  updateActiveWorkoutVisualViewport();
}

function renderWorkout(){
  const s=resolveRuntimeSessionId();
  const api=activeWorkoutApi();
  const ownerId=currentRoutineOwnerOrNull();
  const sessionId=s;
  const session=activeRoutineSession(sessionId);
  if(!session){
    document.body.classList.remove("mobile-workout-sheet-open");
    state.screen="home";renderHome();return;
  }
  const canonical=getCanonicalRoutine();
  const persisted=readHomeDraft(session,canonical);
  let draft=getDraft(sessionId);
  const sessionTimer=workoutSessionTimerForDraft(draft);
  const totalExercises=draft.exercises.length;
  if(state.workoutActiveInstanceId!==draft.workoutInstanceId){
    const restoredIndex=draft.exercises.findIndex(
      item=>item.exerciseInstanceId===draft.currentExerciseInstanceId
    );
    state.workoutExerciseIndex=restoredIndex>=0
      ?restoredIndex
      :(Number(draft.currentExerciseIndex)||0);
    state.workoutActiveInstanceId=draft.workoutInstanceId;
    state.workoutExpandedExercises=new Set();
    state.workoutExpandedDetailPanels=new Set();
    state.workoutDirtyDetailPanels=new Set();
    state.workoutMobileUi=api.reduceMobileWorkoutUi({},{});
  }
  restoreActiveRestTimer(draft,{
    now:Date.now(),announceExpired:Boolean(state.restTimerPayload)
  });
  const canonicalExerciseIndex=draft.exercises.findIndex(
    item=>item.exerciseInstanceId===draft.currentExerciseInstanceId
  );
  if(canonicalExerciseIndex>=0) state.workoutExerciseIndex=canonicalExerciseIndex;
  state.workoutExerciseIndex=Math.min(Math.max(0,state.workoutExerciseIndex||0),Math.max(0,totalExercises-1));
  const exerciseIndex=state.workoutExerciseIndex;
  const exercise=draft.exercises[exerciseIndex]||draft.exercises[0]||null;
  const sessionName=routineSessionRuntimeApi().displayName(
    session,activeRoutineSessions().findIndex(item=>item.sessionId===sessionId)
  );
  const headerBase=api.activeWorkoutHeaderModel({
    session:{...session,name:sessionName},exerciseIndex,totalExercises,
    startedAt:null,now:Date.now()
  });
  const elapsed=workoutSessionElapsedMs(draft);
  const elapsedAnomalous=elapsed>72*60*60*1000;
  const elapsedForDisplay=elapsedAnomalous?0:elapsed;
  const header={
    ...headerBase,
    elapsed:{available:true,elapsedMs:elapsed,anomalous:elapsedAnomalous}
  };
  const sessionTimerControl=api.sessionTimerControlModel({
    status:sessionTimer.status,
    elapsedMs:elapsedForDisplay,
    restored:Boolean(persisted.draft)
  });
  const last=lastWorkoutForSession(sessionId);
  const library=getExerciseLibrary();
  const review=api.workoutCompletionReviewModel({exercises:draft.exercises,elapsedMs:elapsedForDisplay});
  const recoveryGuidance=activeWorkoutRecoveryGuidanceModel(
    window.GymOSRecovery?.entryForDate?.(dateKey(new Date()))||null
  );
  const defaultRest=getRestSeconds();
  const rest=api.restTimerModel({
    deadlineEpochMs:state.timerDeadline,now:Date.now(),
    seconds:state.timerSeconds,running:Boolean(state.restTimerPayload),defaultSeconds:defaultRest
  });
  const completedExercises=draft.exercises.filter(
    item=>activeWorkoutExerciseStatus(item)==="completed"
  ).length;
  const progressPercentage=totalExercises
    ?Math.round((completedExercises/totalExercises)*100)
    :0;
  const referenceIndex=draft.exercises.findIndex(
    item=>item.exerciseInstanceId===state.workoutReferenceExerciseId
  );
  const referenceExercise=referenceIndex>=0?draft.exercises[referenceIndex]:null;
  let reference=null;
  if(referenceExercise){
    const referenceKey=activeWorkoutExerciseKey(sessionId,referenceExercise,referenceIndex);
    const referenceResolution=api.exerciseLibraryResolutionModel({
      exercise:referenceExercise,library,
      selectedExerciseId:state.workoutVisualLibrarySelections.get(referenceKey)||null,
      normalize:window.GymOSExerciseDomain.normalizeToken
    });
    reference={
      exercise:referenceExercise,
      guide:api.exerciseGuideModel({
        exercise:referenceResolution.exercise,label:exerciseLibraryWorkflowApi().label
      })
    };
  }
  const actionIndex=draft.exercises.findIndex(
    item=>item.exerciseInstanceId===state.workoutActionExerciseId
  );
  const actionExercise=actionIndex>=0?draft.exercises[actionIndex]:null;
  const actionResolution=actionExercise?api.exerciseLibraryResolutionModel({
    exercise:actionExercise,library,
    selectedExerciseId:state.workoutVisualLibrarySelections.get(
      activeWorkoutExerciseKey(sessionId,actionExercise,actionIndex)
    )||null,
    normalize:window.GymOSExerciseDomain.normalizeToken
  }):null;
  document.body.classList.remove("mobile-workout-sheet-open");
  app.innerHTML=`<div class="app-shell active-workout-shell">
    <main class="screen active-workout-screen" aria-labelledby="activeWorkoutTitle" ${state.restOverlayOpen?'inert aria-hidden="true"':""}>
      <header class="active-workout-context">
        <button type="button" class="icon-button active-workout-back" data-workout-back aria-label="Volver a Inicio">←</button>
        <div class="active-workout-session-title">
          <h1 id="activeWorkoutTitle">${esc(sessionName)}</h1>
          <span data-workout-exercise-progress>${completedExercises} de ${totalExercises} ejercicios completados</span>
        </div>
        <button type="button" class="active-workout-progress-trigger" data-workout-session-overview aria-expanded="${state.workoutSessionOverviewOpen}" aria-controls="workoutSessionOverviewDialog">
          <strong>${progressPercentage}%</strong><span>Ver sesión</span>
        </button>
        <section class="active-workout-session-clock" aria-labelledby="activeWorkoutSessionClockLabel">
          <span id="activeWorkoutSessionClockLabel">Tiempo de sesión</span>
          <time data-workout-session-elapsed data-draft-id="${esc(String(draft.draftId||""))}" datetime="PT${Math.floor(elapsedForDisplay/1000)}S" aria-label="${esc(header.elapsed.anomalous?"Tiempo de sesión pendiente de revisar":sessionElapsedAccessible(elapsedForDisplay))}">${header.elapsed.anomalous?"--:--":formatSessionElapsed(elapsedForDisplay)}</time>
          <div>
            <button type="button" class="primary" data-workout-session-toggle>${sessionTimerControl.primaryLabel}</button>
            <button type="button" class="text-button" data-workout-session-reset ${sessionTimerControl.showReset?"":"hidden"}>Reiniciar</button>
          </div>
        </section>
        <p class="active-workout-save-status" data-workout-save-status data-status="${esc(state.workoutDraftSaveStatus)}" role="status" aria-live="polite">${esc(workoutSaveStatusLabel())}</p>
        <div class="active-workout-session-progress" data-workout-session-progress role="progressbar" aria-label="Progreso por ejercicios" aria-valuemin="0" aria-valuemax="${totalExercises}" aria-valuenow="${completedExercises}"><span style="width:${progressPercentage}%"></span></div>
      </header>
      ${header.elapsed.anomalous?`<section class="form-message info active-workout-old-draft" role="status"><p>Este borrador lleva abierto un periodo inusual. Conservamos todos sus datos, pero debes reiniciar el contador antes de finalizar.</p><button type="button" class="secondary" data-workout-session-reset>Retomar tiempo desde ahora</button></section>`:""}
      <div data-workout-inline-message>${renderActiveWorkoutInlineMessage()}</div>
      ${state.workoutDraftMessage?`<p class="workout-draft-message ${esc(state.workoutDraftMessage.type)}" role="${state.workoutDraftMessage.type==="warning"?"alert":"status"}">${esc(state.workoutDraftMessage.text)}</p>`:""}
      <section class="active-workout-summary" aria-label="Resumen de la sesión">
        <div><span>Objetivo</span><strong>${esc(session.focus||"Completar la sesión")}</strong></div>
        <div><span>Ejercicios</span><strong data-workout-completed-exercises>${completedExercises} de ${totalExercises}</strong></div>
        <div><span>Series</span><strong data-workout-completed-sets>${review.exercises.reduce((sum,row)=>sum+row.completedSets,0)} de ${review.exercises.reduce((sum,row)=>sum+row.totalSets,0)}</strong></div>
        <div><span>Duración</span><strong data-workout-summary-duration>${formatSessionElapsed(elapsedForDisplay)}</strong></div>
        <div><span>Sincronización</span><strong data-workout-sync-summary>${esc(workoutSaveStatusLabel())}</strong></div>
      </section>
      ${recoveryGuidance.available?`<aside class="active-workout-recovery active-workout-recovery-${esc(recoveryGuidance.status)}" aria-label="Orientación de recuperación">
        <strong>${esc(recoveryGuidance.title)}</strong><p>${esc(recoveryGuidance.guidance)}</p>
      </aside>`:""}
      ${exercise?`<section class="workout-exercise-sheet" aria-label="Ejercicios de la sesión">
        ${draft.exercises.map((item,index)=>renderActiveWorkoutExercise({
          exercise:item,index,sessionId,last,library,defaultRest,
          currentExerciseIndex:exerciseIndex
        })).join("")}
      </section>`:`<section class="workout-empty-state" role="status"><h2>Esta sesión no tiene ejercicios</h2><p>Vuelve a Rutina para añadir ejercicios antes de empezar.</p><button type="button" data-open-routine-from-workout class="secondary">Ir a Rutina</button></section>`}
      <section class="active-rest-timer" data-active-rest-container aria-labelledby="activeRestTitle" ${rest.running?"":"hidden"}>
        <div><span>Descanso</span><strong id="activeRestTitle" data-active-rest-time aria-live="off">${formatTimer(rest.remainingSeconds)}</strong></div>
        <div><button type="button" class="text-button" data-skip-rest>Omitir</button><button type="button" class="secondary" data-add-rest>+30 s</button></div>
      </section>
      <p id="activeRestStatus" class="sr-only" aria-live="polite"></p>
      ${exercise?`<section class="active-workout-final-summary" aria-labelledby="activeWorkoutFinalSummaryTitle">
        <div><span class="section-kicker">RESUMEN FINAL</span><h2 id="activeWorkoutFinalSummaryTitle">Tu sesión de hoy</h2></div>
        <dl>
          <div><dt>Ejercicios completados</dt><dd data-workout-completed-exercises>${completedExercises} de ${totalExercises}</dd></div>
          <div><dt>Series completadas</dt><dd data-workout-completed-sets>${review.exercises.reduce((sum,row)=>sum+row.completedSets,0)} de ${review.exercises.reduce((sum,row)=>sum+row.totalSets,0)}</dd></div>
          <div><dt>Series pendientes</dt><dd data-workout-pending-sets>${review.pendingSets}</dd></div>
          <div><dt>Duración</dt><dd><time data-workout-final-duration>${formatSessionElapsed(elapsedForDisplay)}</time></dd></div>
        </dl>
        <p class="form-message info" data-workout-incomplete-summary ${review.pendingSets?"":"hidden"}>${review.pendingSets?`Hay ${review.pendingSets} ${review.pendingSets===1?"serie pendiente":"series pendientes"}. Puedes revisarlas antes de finalizar.`:""}</p>
        <nav class="active-exercise-navigation" aria-label="Acciones de la sesión">
          ${completedExercises<totalExercises?'<button type="button" class="secondary" data-workout-next-pending>Ir al siguiente pendiente</button>':""}
          <button type="button" class="secondary" data-workout-review aria-controls="workoutCompletionDialog">Revisar sesión</button>
          <button type="button" class="primary" data-workout-review aria-controls="workoutCompletionDialog">Finalizar entrenamiento</button>
          <div class="active-workout-more">
            <button type="button" class="icon-button" data-workout-discard-menu aria-label="Más acciones" aria-expanded="${state.workoutDiscardMenuOpen||false}">•••</button>
            ${state.workoutDiscardMenuOpen?'<button type="button" class="danger-soft" data-workout-discard>Descartar entrenamiento</button>':""}
          </div>
        </nav>
      </section>`:""}
    </main>
    ${renderActiveWorkoutOverlays({
      draft,header,review,reference,rest,
      changeAllowed:Boolean(actionResolution?.exercise)
    })}
    ${nav("workout")}
  </div>`;
  if(!header.elapsed.anomalous) startWorkoutSessionTimer({
    ownerId,draftId:String(draft.draftId||""),sessionId,sessionTimer
  });
  else stopWorkoutSessionTimer();
  bindActiveWorkoutEvents({
    ownerId,sessionId,draftId:draft.draftId,
    workoutInstanceId:draft.workoutInstanceId,
    exerciseIndex,exerciseInstanceId:exercise?.exerciseInstanceId||null,
    elapsedAnomalous:header.elapsed.anomalous
  });
  bindNav();
}

function activeWorkoutIdentityValid(context){
  if(currentRoutineOwnerOrNull()!==context.ownerId) return false;
  const session=activeRoutineSession(context.sessionId);
  if(!session) return false;
  const memory=state.workoutDraftMemory;
  if(
    memory?.status==="active"&&memory.ownerId===context.ownerId&&
    memory.sessionId===context.sessionId&&memory.draftId===context.draftId&&
    (!context.workoutInstanceId||memory.workoutInstanceId===context.workoutInstanceId)&&
    memory.routineId===getCanonicalRoutine()?.routineId
  ) return true;
  const stored=readHomeDraft(session,getCanonicalRoutine());
  return Boolean(stored.draft)&&(
    stored.draft.draftId===context.draftId&&
    (!context.workoutInstanceId||stored.draft.workoutInstanceId===context.workoutInstanceId)&&
    stored.draft.routineId===getCanonicalRoutine()?.routineId&&
    stored.draft.sessionId===context.sessionId
  );
}
function activeWorkoutHumanError(error){
  if(error?.name==="WorkoutPersistenceError"){
    return workoutPersistenceUserMessage(error).text;
  }
  return {
    owner_changed:"La cuenta activa cambió. Vuelve a abrir el entrenamiento.",
    owner_mismatch:"La cuenta activa cambió. Vuelve a abrir el entrenamiento.",
    draft_changed:"El entrenamiento cambió en otra vista. Vuelve a abrirlo.",
    exercise_changed:"El ejercicio cambió en otra vista. Se ha conservado la versión más reciente.",
    draft_session_not_found:"La sesión ya no está disponible.",
    session_not_found:"La sesión ya no está disponible."
  }[error?.message]||"Los cambios siguen en memoria. Revisa el estado de guardado.";
}
function setActiveWorkoutMessage(type,text,{retry=false}={}){
  state.workoutInlineMessage={type,text,retry:Boolean(retry)};
}
function bindActiveWorkoutEvents(context){
  const shell=document.querySelector(".active-workout-shell");
  const main=shell?.querySelector(
    ".active-workout-screen,.active-workout-mobile-screen"
  );
  if(!shell||!main) return;
  const getCurrent=()=>{
    if(!activeWorkoutIdentityValid(context)){
      const code=currentRoutineOwnerOrNull()===context.ownerId
        ?"invalid_workout_identity":"owner_mismatch";
      throw workoutPersistenceError(code,"active_context",new Error("owner_changed"));
    }
    const draft=getDraft(context.sessionId);
    if(draft.draftId!==context.draftId) throw new Error("draft_changed");
    if(draft.workoutInstanceId!==context.workoutInstanceId) throw new Error("draft_changed");
    return draft;
  };
  const exerciseMetaFromNode=node=>{
    const card=node?.closest?.("[data-exercise-instance-id]");
    if(!card) throw new Error("exercise_changed");
    return {
      exerciseInstanceId:card.dataset.exerciseInstanceId,
      exerciseIndex:Number(card.dataset.exerciseIndex)
    };
  };
  const currentExercise=(draft,exerciseInstanceId=context.exerciseInstanceId)=>{
    const exercise=draft.exercises.find(item=>item.exerciseInstanceId===exerciseInstanceId);
    if(!exercise) throw new Error("exercise_changed");
    return exercise;
  };
  const persist=(mutator,{
    immediate=false,scheduleSync=false,exerciseInstanceId=context.exerciseInstanceId
  }={})=>{
    const draft=getCurrent();
    const sessionStarted=startWorkoutSessionInDraft(draft,context.sessionId);
    mutator(draft,currentExercise(draft,exerciseInstanceId));
    if(!activeWorkoutIdentityValid(context)){
      throw workoutPersistenceError(
        "owner_mismatch","memory_commit_guard",new Error("owner_changed")
      );
    }
    const staged=stageWorkoutDraft(draft,{
      immediate:immediate||sessionStarted,
      scheduleSync:scheduleSync||sessionStarted
    });
    if((immediate||sessionStarted)&&!activeWorkoutIdentityValid(context)){
      throw workoutPersistenceError(
        "owner_mismatch","local_commit_guard",new Error("owner_changed")
      );
    }
    if(sessionStarted){
      startWorkoutSessionTimerDisplay(staged);
      const timerButton=main.querySelector("[data-workout-session-toggle]");
      if(timerButton) timerButton.textContent="Pausar";
      setActiveWorkoutMessage("success","Sesión iniciada.");
      updateActiveWorkoutInlineMessage();
    }
    return staged;
  };
  const navigateMobileWorkoutExercise=exerciseInstanceId=>{
    const draft=getCurrent();
    const target=draft.exercises.find(
      item=>item.exerciseInstanceId===exerciseInstanceId
    );
    if(!target) throw new Error("exercise_changed");
    const flushed=flushWorkoutDraftProgress({
      scheduleSync:true,silent:true,requireLocal:true
    });
    if(!flushed||!workoutLocalSaveSucceeded()) return false;
    draft.currentExerciseInstanceId=target.exerciseInstanceId;
    const staged=stageWorkoutDraft(draft,{immediate:true,scheduleSync:true});
    if(!workoutLocalSaveSucceeded()) return false;
    state.workoutExerciseIndex=staged.exercises.findIndex(
      item=>item.exerciseInstanceId===target.exerciseInstanceId
    );
    updateMobileWorkoutUi({type:"CLOSE_PANEL"});
    updateMobileWorkoutUi({type:"CLEAR_SET"});
    renderWorkout();
    requestAnimationFrame(()=>{
      document.getElementById("mobileWorkoutExerciseTitle")?.focus({
        preventScroll:true
      });
    });
    return true;
  };
  const rerenderWithError=error=>{
    if(error?.name==="WorkoutPersistenceError"){
      handleWorkoutPersistenceFailure(error);
    }else{
      setActiveWorkoutMessage("error",activeWorkoutHumanError(error));
    }
    renderWorkout();
  };
  main.addEventListener("input",event=>{
    const target=event.target;
    if(!target.matches(
      "[data-set-field],[data-active-workout-notes],[data-active-workout-discomfort]"
    )) return;
    try{
      const {exerciseInstanceId}=exerciseMetaFromNode(target);
      if(target.matches("[data-set-field]")){
        const setInstanceId=target.closest("[data-set-instance-id]")?.dataset.setInstanceId;
        persist((draft,exercise)=>{
          const set=exercise.series.find(item=>item.setInstanceId===setInstanceId);
          const correcting=state.workoutMobileUi?.selectedSetInstanceId===setInstanceId;
          if(!set||(set.done&&!correcting)) return;
          set[target.dataset.setField]=target.value;
          if(target.dataset.setField==="seconds"){set.weight="";set.reps="";}
        },{scheduleSync:true,exerciseInstanceId});
      }else if(target.matches("[data-active-workout-notes]")){
        persist(
          (draft,exercise)=>{exercise.notes=target.value;},
          {scheduleSync:true,exerciseInstanceId}
        );
        state.workoutDirtyDetailPanels.add(
          workoutDetailPanelKey(exerciseInstanceId,"notes")
        );
      }else if(target.matches("[data-active-workout-discomfort]")){
        persist(
          (draft,exercise)=>{exercise.discomfort=target.value;},
          {scheduleSync:true,exerciseInstanceId}
        );
        state.workoutDirtyDetailPanels.add(
          workoutDetailPanelKey(exerciseInstanceId,"discomfort")
        );
      }
    }catch(error){rerenderWithError(error);}
  });
  main.addEventListener("change",event=>{
    const target=event.target;
    if(!target.matches("[data-set-warmup]")) return;
    try{
      const {exerciseInstanceId}=exerciseMetaFromNode(target);
      const setInstanceId=target.closest("[data-set-instance-id]")?.dataset.setInstanceId;
      persist((draft,exercise)=>{
        const set=exercise.series.find(item=>item.setInstanceId===setInstanceId);
        const correcting=state.workoutMobileUi?.selectedSetInstanceId===setInstanceId;
        if(set&&(!set.done||correcting)) set.warmup=target.checked;
      },{immediate:true,exerciseInstanceId});
      renderWorkout();
    }catch(error){rerenderWithError(error);}
  });
  main.addEventListener("focusout",event=>{
    if(!event.target.matches(
      "[data-set-field],[data-active-workout-notes],[data-active-workout-discomfort]"
    )) return;
    const target=event.target;
    const meta=exerciseMetaFromNode(target);
    const kind=target.matches("[data-active-workout-notes]")
      ?"notes"
      :target.matches("[data-active-workout-discomfort]")
        ?"discomfort":null;
    try{
      const saved=flushWorkoutDraftProgress({
        scheduleSync:true,silent:true,requireLocal:true
      });
      if(saved&&workoutLocalSaveSucceeded()&&kind){
        state.workoutDirtyDetailPanels.delete(
          workoutDetailPanelKey(meta.exerciseInstanceId,kind)
        );
      }
    }catch(error){
      updateActiveWorkoutInlineMessage();
    }
    if(state.workoutDeferredRender&&!activeWorkoutEditingInProgress()){
      requestSafeActiveWorkoutRender();
    }
  });
  main.addEventListener("click",event=>{
    const button=event.target.closest("button");
    if(!button||button.disabled) return;
    unlockRestTimerAudioFromUserInteraction();
    try{
      if(button.matches("[data-mobile-open-panel]")){
        const panel=button.dataset.mobileOpenPanel;
        const exerciseCard=button.closest("[data-exercise-instance-id]");
        const focusId=button.dataset.mobileFocusId;
        if(!button.closest('.workout-modal[role="dialog"]')){
          state.workoutReturnFocusSelector=focusId
            ?`[data-mobile-focus-id="${CSS.escape(focusId)}"]`
            :exerciseCard
              ?`[data-exercise-instance-id="${CSS.escape(exerciseCard.dataset.exerciseInstanceId)}"] [data-mobile-open-panel="${CSS.escape(panel)}"]`
              :`[data-mobile-open-panel="${CSS.escape(panel)}"]`;
        }
        if(panel==="change_exercise"){
          state.workoutActionExerciseId=exerciseCard?.dataset.exerciseInstanceId||
            context.exerciseInstanceId;
        }
        updateMobileWorkoutUi({type:"OPEN_PANEL",panel});
        renderWorkout();
      }else if(button.matches("[data-mobile-save-close]")){
        closeActiveWorkoutOverlay();
      }else if(button.matches("[data-mobile-toggle-completed]")){
        updateMobileWorkoutUi({type:"TOGGLE_COMPLETED"});renderWorkout();
      }else if(button.matches("[data-mobile-toggle-future]")){
        updateMobileWorkoutUi({type:"TOGGLE_FUTURE"});renderWorkout();
      }else if(button.matches("[data-mobile-toggle-rest]")){
        updateMobileWorkoutUi({type:"TOGGLE_REST"});renderWorkout();
      }else if(button.matches("[data-mobile-select-set]")){
        updateMobileWorkoutUi({
          type:"SELECT_SET",setInstanceId:button.dataset.mobileSelectSet
        });
        renderWorkout();
      }else if(button.matches("[data-mobile-edit-set]")){
        const setInstanceId=button.dataset.mobileEditSet;
        updateMobileWorkoutUi({type:"SELECT_SET",setInstanceId});
        renderWorkout();
      }else if(button.matches("[data-mobile-save-set-correction]")){
        const saved=flushWorkoutDraftProgress({
          scheduleSync:true,silent:true,requireLocal:true
        });
        if(!saved||!workoutLocalSaveSucceeded()) return;
        updateMobileWorkoutUi({type:"CLEAR_SET"});
        setActiveWorkoutMessage("success","Corrección guardada.");
        renderWorkout();
      }else if(button.matches("[data-mobile-jump-exercise]")){
        navigateMobileWorkoutExercise(button.dataset.mobileJumpExercise);
      }else if(button.matches("[data-mobile-previous-exercise],[data-mobile-next-exercise]")){
        const draft=getCurrent();
        const currentIndex=draft.exercises.findIndex(
          item=>item.exerciseInstanceId===draft.currentExerciseInstanceId
        );
        const offset=button.matches("[data-mobile-previous-exercise]")?-1:1;
        const target=draft.exercises[currentIndex+offset];
        if(target) navigateMobileWorkoutExercise(target.exerciseInstanceId);
      }else if(button.matches("[data-mobile-request-delete]")){
        const {exerciseInstanceId}=exerciseMetaFromNode(button);
        state.workoutSeriesDeleteCandidate={
          exerciseInstanceId,
          setInstanceId:button.dataset.mobileRequestDelete
        };
        updateMobileWorkoutUi({type:"OPEN_PANEL",panel:"delete_set"});
        renderWorkout();
      }else if(button.matches("[data-workout-back]")){
        getCurrent();
        flushWorkoutDraftProgress({scheduleSync:false});
        stopAllExerciseTimers();
        stopWorkoutSessionTimer();
        state.workoutInlineMessage=null;
        state.screen="home";
        renderHome();
      }else if(button.matches("[data-workout-retry-save]")){
        const repair=repairInflatedLegacyWorkoutStorage({
          ownerId:currentRoutineOwnerOrNull()
        });
        if(repair.completed){
          flushWorkoutDraftProgress({scheduleSync:false,silent:true});
        }
        if(repair.completed&&!state.workoutDraftLastError){
          setActiveWorkoutMessage("success","Cambios guardados en este dispositivo.");
        }
        renderWorkout();
      }else if(button.matches("[data-workout-toggle-exercise]")){
        const {exerciseInstanceId}=exerciseMetaFromNode(button);
        const panel=document.getElementById(button.getAttribute("aria-controls"));
        const expanded=button.getAttribute("aria-expanded")==="true";
        if(expanded&&!flushWorkoutDetailPanels(exerciseInstanceId)) return;
        button.setAttribute("aria-expanded",String(!expanded));
        if(panel) panel.hidden=expanded;
        button.closest(".workout-exercise-card")?.classList.toggle("expanded",!expanded);
        if(expanded) state.workoutExpandedExercises.delete(exerciseInstanceId);
        else state.workoutExpandedExercises.add(exerciseInstanceId);
      }else if(button.matches("[data-workout-toggle-set]")){
        const setCard=button.closest("[data-active-set]");
        const panel=document.getElementById(button.getAttribute("aria-controls"));
        const expanded=button.getAttribute("aria-expanded")==="true";
        button.setAttribute("aria-expanded",String(!expanded));
        if(panel) panel.hidden=expanded;
        setCard?.classList.toggle("expanded",!expanded);
      }else if(button.matches("[data-workout-detail-toggle]")){
        const {exerciseInstanceId}=exerciseMetaFromNode(button);
        const kind=button.dataset.workoutDetailToggle;
        const key=workoutDetailPanelKey(exerciseInstanceId,kind);
        const panel=document.getElementById(button.getAttribute("aria-controls"));
        const expanded=button.getAttribute("aria-expanded")==="true";
        if(expanded&&!flushWorkoutDetailPanels(exerciseInstanceId,[kind])) return;
        button.setAttribute("aria-expanded",String(!expanded));
        if(panel) panel.hidden=expanded;
        button.closest(".workout-exercise-detail")?.classList.toggle(
          "expanded",!expanded
        );
        if(expanded){
          state.workoutExpandedDetailPanels.delete(key);
          button.focus({preventScroll:true});
        }else{
          state.workoutExpandedDetailPanels.add(key);
          if(event.detail===0){
            requestAnimationFrame(()=>panel?.querySelector(
              "textarea,input"
            )?.focus({preventScroll:true}));
          }
        }
      }else if(button.matches("[data-workout-reference]")){
        return;
      }else if(button.matches("[data-workout-session-toggle]")){
        const draft=getCurrent();
        const timer=workoutSessionTimerForDraft(draft);
        const action=timer.status==="running"?"pause":timer.status==="paused"?"resume":"start";
        const updated=setWorkoutSessionTimerAction(context.sessionId,action);
        if(action==="start"){
          const firstPending=updated.exercises.find(
            item=>activeWorkoutExerciseStatus(item)!=="completed"
          )||updated.exercises[0];
          if(firstPending?.exerciseInstanceId){
            state.workoutExerciseIndex=Math.max(
              0,updated.exercises.findIndex(
                item=>item.exerciseInstanceId===firstPending.exerciseInstanceId
              )
            );
          }
          if(!state.workoutDraftLastError){
            setActiveWorkoutMessage("success","Sesión iniciada.");
          }
        }
        if(action!=="start"&&!state.workoutDraftLastError) setActiveWorkoutMessage(
          "success",
          action==="pause"?"Cronómetro de sesión pausado.":"Cronómetro de sesión en marcha."
        );
        updateMobileWorkoutUi({type:"CLOSE_PANEL"});
        renderWorkout();
      }else if(button.matches("[data-workout-session-reset]")){
        const draft=getCurrent();
        if(workoutSessionElapsedMs(draft)>0&&!window.confirm(
          "¿Reiniciar el cronómetro de sesión? Las series registradas no se modificarán."
        )) return;
        setWorkoutSessionTimerAction(context.sessionId,"reset");
        if(!state.workoutDraftLastError){
          setActiveWorkoutMessage("success","El cronómetro de sesión se ha reiniciado.");
        }
        renderWorkout();
      }else if(button.matches("[data-workout-session-overview]")){
        state.workoutReturnFocusSelector="[data-workout-session-overview]";
        state.workoutSessionOverviewOpen=true;renderWorkout();
      }else if(button.matches("[data-workout-change-exercise]")){
        const {exerciseInstanceId}=exerciseMetaFromNode(button);
        state.workoutActionExerciseId=exerciseInstanceId;
        state.workoutReturnFocusSelector=`[data-exercise-instance-id="${CSS.escape(exerciseInstanceId)}"] [data-workout-change-exercise]`;
        state.workoutChangeMenuOpen=true;renderWorkout();
      }else if(button.matches("[data-workout-show-candidates]")){
        const {exerciseInstanceId,exerciseIndex}=exerciseMetaFromNode(button);
        const current=currentExercise(getCurrent(),exerciseInstanceId);
        state.workoutLibraryCandidateKey=activeWorkoutExerciseKey(
          context.sessionId,current,exerciseIndex
        );
        renderWorkout();
      }else if(button.matches("[data-workout-dismiss-resolution]")){
        const {exerciseInstanceId,exerciseIndex}=exerciseMetaFromNode(button);
        const draft=getCurrent();
        const current=currentExercise(draft,exerciseInstanceId);
        const key=activeWorkoutExerciseKey(context.sessionId,current,exerciseIndex);
        current.libraryResolutionDismissed=true;
        state.workoutUnresolvedDismissed.add(key);
        state.workoutLibraryCandidateKey=null;
        stageWorkoutDraft(draft,{immediate:true,scheduleSync:false});
        updateMobileWorkoutUi({type:"CLOSE_PANEL"});
        renderWorkout();
      }else if(button.matches("[data-workout-library-candidate]")){
        const {exerciseInstanceId,exerciseIndex}=exerciseMetaFromNode(button);
        const draft=getCurrent();
        const current=currentExercise(draft,exerciseInstanceId);
        const key=activeWorkoutExerciseKey(context.sessionId,current,exerciseIndex);
        const resolution=activeWorkoutApi().exerciseLibraryResolutionModel({
          exercise:current,library:getExerciseLibrary(),
          selectedExerciseId:state.workoutVisualLibrarySelections.get(key)||null,
          normalize:window.GymOSExerciseDomain.normalizeToken
        });
        const candidateId=button.dataset.workoutLibraryCandidate;
        if(!resolution.candidates.some(item=>item.id===candidateId)) return;
        current.resolvedLibraryExerciseId=candidateId;
        current.libraryResolutionDismissed=false;
        state.workoutVisualLibrarySelections.set(key,candidateId);
        state.workoutUnresolvedDismissed.delete(key);
        state.workoutLibraryCandidateKey=null;
        stageWorkoutDraft(draft,{immediate:true,scheduleSync:true});
        updateMobileWorkoutUi({type:"CLOSE_PANEL"});
        renderWorkout();
      }else if(button.matches("[data-active-timer-start]")){
        const {exerciseIndex}=exerciseMetaFromNode(button);
        startExerciseTimer(context.sessionId,exerciseIndex,Number(button.dataset.activeTimerStart));
      }else if(button.matches("[data-active-timer-stop]")){
        const {exerciseIndex}=exerciseMetaFromNode(button);
        stopExerciseTimer(context.sessionId,exerciseIndex,Number(button.dataset.activeTimerStop));
      }else if(button.matches("[data-active-timer-reset]")){
        const {exerciseIndex}=exerciseMetaFromNode(button);
        resetExerciseTimer(context.sessionId,exerciseIndex,Number(button.dataset.activeTimerReset));
      }else if(button.matches("[data-complete-active-set]")){
        const {exerciseInstanceId,exerciseIndex}=exerciseMetaFromNode(button);
        const setIndex=Number(button.dataset.completeActiveSet);
        const setInstanceId=button.closest("[data-set-instance-id]")?.dataset.setInstanceId;
        const busyKey=`${context.workoutInstanceId}:${exerciseInstanceId}:${setInstanceId}`;
        if(state.workoutSetBusyKey===busyKey) return;
        state.workoutSetBusyKey=busyKey;
        try{
          let startRest=false;
          const before=getCurrent();
          const beforeExercise=currentExercise(before,exerciseInstanceId);
          const restDuration=activeWorkoutApi().effectiveRestSeconds(
            beforeExercise,getRestSeconds()
          );
          const beforeSet=beforeExercise.series.find(item=>item.setInstanceId===setInstanceId);
          if(
            beforeSet&&!beforeSet.done&&
            isTimedExercise(beforeExercise)&&!hasInputValue(beforeSet.seconds)
          ){
            stopExerciseTimer(context.sessionId,exerciseIndex,setIndex);
          }
          persist((draft,exercise)=>{
            const set=exercise.series.find(item=>item.setInstanceId===setInstanceId);
            if(!set) return;
            const wasDone=Boolean(set.done);
            set.done=!wasDone;
            if(wasDone) exercise.completedAt=null;
            startRest=!wasDone&&!set.warmup;
          },{immediate:true,scheduleSync:true,exerciseInstanceId});
          if(startRest) startTimer(restDuration);
        }finally{state.workoutSetBusyKey=null;}
        updateMobileWorkoutUi({type:"CLEAR_SET"});
        const updated=getCurrent();
        const updatedExercise=currentExercise(updated,exerciseInstanceId);
        const updatedSet=updatedExercise.series.find(
          item=>item.setInstanceId===setInstanceId
        );
        const row=button.closest("[data-active-set]");
        if(row&&updatedSet){
          row.classList.toggle("completed",Boolean(updatedSet.done));
          row.querySelectorAll("input,select").forEach(control=>{
            control.disabled=Boolean(updatedSet.done);
          });
          const marker=row.querySelector(".active-set-complete-mark");
          if(marker) marker.hidden=!updatedSet.done;
          button.classList.toggle("primary",!updatedSet.done);
          button.classList.toggle("secondary",Boolean(updatedSet.done));
          button.setAttribute("aria-pressed",String(Boolean(updatedSet.done)));
          button.setAttribute(
            "aria-label",
            `${updatedSet.done?"Corregir":"Completar"} serie ${setIndex+1}`
          );
          button.textContent=updatedSet.done?"Corregir":"Completar";
        }
        updateActiveWorkoutExerciseUi(exerciseInstanceId,updated);
      }else if(button.matches("[data-add-extra-set]")){
        const {exerciseInstanceId}=exerciseMetaFromNode(button);
        const setInstanceId=secureSessionModelId("set");
        persist((draft,exercise)=>{
          exercise.series.push(normalizeSeries(activeWorkoutApi().manualExtraSetModel({
            setInstanceId,
            ownerId:draft.ownerId,
            workoutInstanceId:draft.workoutInstanceId,
            exerciseInstanceId:exercise.exerciseInstanceId,
            createdAt:new Date().toISOString(),
            target:exercise.target,
            targetRir:exercise.targetRir,
            restSeconds:exercise.restSeconds||getRestSeconds(),
            type:exercise.type
          })));
          exercise.completedAt=null;
        },{immediate:true,scheduleSync:true,exerciseInstanceId});
        state.workoutExpandedExercises.add(exerciseInstanceId);
        updateMobileWorkoutUi({type:"CLOSE_PANEL"});
        updateMobileWorkoutUi({type:"SELECT_SET",setInstanceId});
        renderWorkout();
        requestAnimationFrame(()=>{
          const row=document.querySelector(
            `[data-set-instance-id="${CSS.escape(setInstanceId)}"]`
          );
          row?.scrollIntoView({
            behavior:document.body.classList.contains("reduce-motion")?"auto":"smooth",
            block:"nearest"
          });
          if(window.matchMedia?.("(pointer:fine)")?.matches){
            row?.querySelector("[data-set-field]")?.focus({preventScroll:true});
          }
        });
      }else if(button.matches("[data-delete-active-set]")){
        const {exerciseInstanceId}=exerciseMetaFromNode(button);
        const setIndex=Number(button.dataset.deleteActiveSet);
        const setInstanceId=button.closest("[data-set-instance-id]")?.dataset.setInstanceId;
        const draft=getCurrent();
        const exercise=currentExercise(draft,exerciseInstanceId);
        const set=exercise.series.find(item=>item.setInstanceId===setInstanceId);
        if(!set||set.done) return;
        if(activeWorkoutApi().setHasResults(set)){
          state.workoutReturnFocusSelector=`[data-delete-active-set="${setIndex}"]`;
          state.workoutSeriesDeleteCandidate={
            exerciseInstanceId,setInstanceId
          };
          renderWorkout();
        }else{
          persist((current,currentExerciseRecord)=>{
            const removed=currentExerciseRecord.series.find(
              item=>item.setInstanceId===setInstanceId
            );
            currentExerciseRecord.series=currentExerciseRecord.series.filter(
              item=>item.setInstanceId!==setInstanceId
            );
            if(removed?.planned!==false){
              currentExerciseRecord.sets=currentExerciseRecord.series.filter(
                item=>item.planned!==false
              ).length;
            }
          },{immediate:true,scheduleSync:true,exerciseInstanceId});
          renderWorkout();
        }
      }else if(button.matches("[data-skip-rest]")){
        clearActiveRestTimer({removePersisted:true});
        updateTimerUI();
        const restContainer=main.querySelector("[data-active-rest-container]");
        if(restContainer) restContainer.hidden=true;
      }else if(button.matches("[data-add-rest]")){
        extendActiveRestTimer(30);renderWorkout();
      }else if(button.matches("[data-workout-next-pending]")){
        const draft=getCurrent();
        const pendingIndex=draft.exercises.findIndex(
          item=>activeWorkoutExerciseStatus(item)!=="completed"
        );
        if(pendingIndex<0) return;
        const pending=draft.exercises[pendingIndex];
        state.workoutExpandedExercises.add(pending.exerciseInstanceId);
        const card=main.querySelector(
          `[data-exercise-index="${pendingIndex}"]`
        );
        const toggle=card?.querySelector("[data-workout-toggle-exercise]");
        const panel=card?.querySelector(".workout-exercise-panel");
        card?.classList.add("expanded");
        toggle?.setAttribute("aria-expanded","true");
        if(panel) panel.hidden=false;
        card?.scrollIntoView({behavior:document.body.classList.contains("reduce-motion")?"auto":"smooth",block:"start"});
        requestAnimationFrame(()=>toggle?.focus());
      }else if(button.matches("[data-workout-review]")){
        flushWorkoutDraftProgress({scheduleSync:false});
        state.workoutReturnFocusSelector="[data-workout-review]";
        if(shell.dataset.workoutLayout==="mobile"){
          updateMobileWorkoutUi({type:"OPEN_PANEL",panel:"review"});
        }else{
          state.workoutCompletionReviewOpen=true;
        }
        renderWorkout();
      }else if(button.matches("[data-complete-active-exercise]")){
        const {exerciseInstanceId}=exerciseMetaFromNode(button);
        const draft=getCurrent();
        const exercise=currentExercise(draft,exerciseInstanceId);
        const started=exercise.series.filter(set=>activeWorkoutApi().setHasResults(set));
        const unfinished=exercise.series.some(set=>!set.done);
        const invalid=started.some(set=>isTimedExercise(exercise)
          ?!hasInputValue(set.seconds)
          :!hasInputValue(set.reps)
        );
        if(!started.length||invalid||unfinished){
          setActiveWorkoutMessage(
            "error",
            !started.length
              ?"Registra al menos una serie antes de completar el ejercicio."
              :invalid
                ?"Revisa las series empezadas antes de completar el ejercicio."
                :"Completa todas las series antes de completar el ejercicio."
          );
          updateActiveWorkoutInlineMessage();
          return;
        }
        try{
          const flushed=flushWorkoutDraftProgress({
            scheduleSync:false,silent:true,requireLocal:true
          });
          if(!flushed||!workoutLocalSaveSucceeded()) return;
          state.workoutDirtyDetailPanels.delete(
            workoutDetailPanelKey(exerciseInstanceId,"notes")
          );
          state.workoutDirtyDetailPanels.delete(
            workoutDetailPanelKey(exerciseInstanceId,"discomfort")
          );
        }catch(error){
          updateActiveWorkoutInlineMessage();
          return;
        }
        const saved=persist((current,currentExerciseRecord)=>{
          currentExerciseRecord.completedAt=new Date().toISOString();
        },{immediate:true,scheduleSync:true,exerciseInstanceId});
        if(!workoutLocalSaveSucceeded()) return;
        const savedExercise=currentExercise(saved,exerciseInstanceId);
        if(activeWorkoutExerciseStatus(savedExercise)!=="completed") return;
        setActiveWorkoutMessage("success","Ejercicio guardado.");
        updateActiveWorkoutInlineMessage();
        updateActiveWorkoutExerciseUi(exerciseInstanceId,saved);
        collapseCompletedWorkoutExercise(exerciseInstanceId);
      }else if(button.matches("[data-workout-discard-menu]")){
        state.workoutDiscardMenuOpen=!state.workoutDiscardMenuOpen;renderWorkout();
      }else if(button.matches("[data-workout-discard]")){
        state.workoutReturnFocusSelector="[data-workout-discard-menu]";
        state.workoutDiscardMenuOpen=false;state.workoutDiscardConfirmOpen=true;renderWorkout();
      }else if(button.matches("[data-open-routine-from-workout]")){
        stopWorkoutSessionTimer();navigateToScreen("routineHub");
      }
    }catch(error){rerenderWithError(error);}
  });
  shell.addEventListener("click",event=>{
    const button=event.target.closest("button");
    const restOverlay=event.target.closest?.("[data-rest-overlay]");
    if(restOverlay){
      if(
        event.target===restOverlay||
        button?.matches("[data-close-rest-overlay]")
      ){
        closeActiveRestOverlay();
      }else if(button?.matches("[data-skip-rest]")){
        clearActiveRestTimer({removePersisted:true});
        updateTimerUI();
      }else if(button?.matches("[data-add-rest]")){
        extendActiveRestTimer(30);
      }
      return;
    }
    if(button?.matches("[data-workout-close-modal]")||event.target.matches(".workout-modal-backdrop[data-workout-close-modal]")){
      closeActiveWorkoutOverlay();
      return;
    }
    if(button?.matches("[data-workout-jump-exercise]")){
      if(!activeWorkoutIdentityValid(context)) return rerenderWithError(new Error("owner_changed"));
      const index=Number(button.dataset.workoutJumpExercise);
      const draft=getDraft(context.sessionId);
      const exercise=draft.exercises[index];
      if(!exercise||activeWorkoutApi().exerciseIdentity(exercise,index)!==button.dataset.exerciseId) return;
      state.workoutSessionOverviewOpen=false;
      state.workoutExpandedExercises.add(exercise.exerciseInstanceId);
      renderWorkout();
      requestAnimationFrame(()=>{
        const target=document.querySelector(`[data-exercise-index="${index}"]`);
        target?.scrollIntoView({block:"start"});
        target?.querySelector("[data-workout-toggle-exercise]")?.focus();
      });
      return;
    }
    if(button?.matches("[data-workout-change-mode]")){
      const mode=button.dataset.workoutChangeMode;
      const draft=getCurrent();
      const index=draft.exercises.findIndex(
        item=>item.exerciseInstanceId===state.workoutActionExerciseId
      );
      if(index<0) return rerenderWithError(new Error("exercise_changed"));
      state.workoutChangeMenuOpen=false;
      updateMobileWorkoutUi({type:"CLOSE_PANEL"});
      state.workoutActionExerciseId=null;
      document.body.classList.remove("mobile-workout-sheet-open");
      openExerciseSubstitution(mode,index);
      return;
    }
    if(button?.matches("[data-confirm-delete-active-set]")){
      const candidate=state.workoutSeriesDeleteCandidate;
      try{
        if(!candidate) return;
        persist((draft,exercise)=>{
          const set=exercise.series.find(item=>item.setInstanceId===candidate.setInstanceId);
          if(!set||set.done) return;
          exercise.series=exercise.series.filter(item=>item.setInstanceId!==candidate.setInstanceId);
          if(set.planned!==false){
            exercise.sets=exercise.series.filter(item=>item.planned!==false).length;
          }
        },{
          immediate:true,scheduleSync:true,
          exerciseInstanceId:candidate.exerciseInstanceId
        });
        state.workoutSeriesDeleteCandidate=null;
        updateMobileWorkoutUi({type:"CLOSE_PANEL"});
        updateMobileWorkoutUi({type:"CLEAR_SET"});
        renderWorkout();
      }catch(error){rerenderWithError(error);}
      return;
    }
    if(button?.matches("[data-confirm-discard-workout]")){
      try{
        if(!activeWorkoutIdentityValid(context)) throw new Error("owner_changed");
        stopWorkoutSessionTimer();stopAllExerciseTimers();
        clearDraft(context.sessionId);
        clearActiveRestTimer({removePersisted:true});
        document.body.classList.remove("mobile-workout-sheet-open");
        state.workoutDiscardConfirmOpen=false;
        state.workoutExerciseIndex=0;
        state.screen="home";renderHome();
      }catch(error){rerenderWithError(error);}
      return;
    }
    if(button?.matches("[data-workout-finish]")){
      if(state.finishingWorkout) return;
      try{
        if(!activeWorkoutIdentityValid(context)) throw new Error("owner_changed");
        if(context.elapsedAnomalous){
          state.workoutCompletionReviewOpen=false;
          setActiveWorkoutMessage("error","Reinicia el contador de sesión antes de finalizar este borrador antiguo.");
          renderWorkout();
          return;
        }
        button.disabled=true;
        document.body.classList.remove("mobile-workout-sheet-open");
        stopWorkoutSessionTimer();stopAllExerciseTimers();
        finishWorkout();
      }catch(error){
        state.finishingWorkout=false;
        rerenderWithError(error);
      }
    }
  });
  main.addEventListener("focusin",event=>{
    if(
      !activeWorkoutUsesMobileLayout()||
      !event.target.matches("input,select,textarea")
    ) return;
    window.setTimeout(()=>{
      event.target.scrollIntoView({block:"center",inline:"nearest"});
    },0);
  });
  shell.addEventListener("keydown",event=>{
    if(
      event.key==="Enter"&&
      event.target.matches("[data-set-field]")&&
      !event.isComposing
    ){
      event.preventDefault();
      const fields=[...event.target.closest("[data-active-set]")?.querySelectorAll(
        "[data-set-field]"
      )||[]];
      const next=fields[fields.indexOf(event.target)+1];
      if(next) next.focus();
      else event.target.blur();
      return;
    }
    const restDialog=shell.querySelector('[data-rest-overlay] [role="dialog"]');
    if(event.key==="Escape"&&restDialog){
      event.preventDefault();closeActiveRestOverlay();
      return;
    }
    const dialog=shell.querySelector('.workout-modal[role="dialog"]');
    if(event.key==="Escape"&&dialog){
      event.preventDefault();closeActiveWorkoutOverlay();
    }else if(event.key==="Tab"&&dialog){
      const focusable=[...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')]
        .filter(node=>!node.hidden&&node.getClientRects().length);
      if(!focusable.length){event.preventDefault();dialog.focus();return;}
      const first=focusable[0],last=focusable[focusable.length-1];
      if(!focusable.includes(document.activeElement)){
        event.preventDefault();
        (event.shiftKey?last:first).focus();
      }else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  const dialog=shell.querySelector('.workout-modal[role="dialog"]');
  const focusTarget=dialog?.querySelector("[data-mobile-autofocus]")||
    dialog?.querySelector("button");
  focusTarget?.focus();
}

function renderLegacyWorkout(){
  const s=resolveRuntimeSessionId();
  const session=activeRoutineSession(s);
  if(!session){state.screen="home";renderHome();return;}
  const sessionName=routineSessionRuntimeApi().displayName(
    session,activeRoutineSessions().findIndex(item=>item.sessionId===s)
  );
  const d=getDraft(s),last=lastWorkoutForSession(s);
  const done=d.exercises.reduce((n,e)=>n+e.series.filter(x=>x.done).length,0);
  const total=d.exercises.reduce((sum,e)=>sum+e.series.length,0);
  const progress=total?Math.min(100,(done/total)*100):0;
  const emptySession=d.exercises.length===0;
  app.innerHTML=`<div class="app-shell">
    <main class="screen">
      <div class="workout-header">
        <div class="workout-title-row">
          <div><div class="subtle">Entrenamiento activo</div><h1>${esc(sessionName)} · ${done}/${total} series</h1></div>
          <button id="timerChip" class="timer-chip">${state.timerSeconds?formatTimer(state.timerSeconds):"Descanso"}</button>
        </div>
        <div class="progress"><span style="width:${progress}%"></span></div>
      </div>
      ${state.workoutDraftMessage?`<p class="workout-draft-message ${esc(state.workoutDraftMessage.type)}" role="${state.workoutDraftMessage.type==="warning"?"alert":"status"}">${esc(state.workoutDraftMessage.text)}</p>`:""}
      ${emptySession?`<section class="workout-empty-state" role="status"><h2>Esta sesión no tiene ejercicios</h2><p>Vuelve a Rutina para añadir ejercicios antes de empezar.</p><button type="button" id="openRoutineFromEmptyWorkout" class="secondary">Ir a Rutina</button></section>`:""}
      ${d.copiedFromLastSession ? `
        <div class="prefill-banner">
          <div><strong>Pesos preparados</strong><span>Se han copiado de tu último ${esc(sessionName.toLocaleLowerCase("es"))}.</span></div>
          <button id="clearPrefilledWeights" class="text-button">Vaciar pesos</button>
        </div>` : ""}
      ${d.exercises.map((ex,i)=>{
        const timed=isTimedExercise(ex);
        return `
        <section class="exercise-card ${timed?"timed-exercise-card":""}" data-exercise="${i}">
          <h2>${esc(ex.name)}</h2>
          <div class="target">Objetivo: ${ex.target} · RIR ${esc(ex.targetRir||"sin definir")}</div>
          <div class="exercise-context-actions">
            ${ex.substitution?.mode==="temporary"
              ?`<button type="button" class="text-button" data-undo-exercise-substitution="${i}">Volver al ejercicio planificado</button>`
              :`<button type="button" class="text-button" data-temporary-exercise-substitution="${i}">Cambiar ejercicio</button>`}
            <button type="button" class="text-button" data-permanent-exercise-substitution="${i}">Crear propuesta de cambio</button>
          </div>
          ${timed?`<div class="timed-exercise-note">Ejercicio por tiempo: inicia y detén el cronómetro en cada serie.</div>`:""}
          ${last?.exercises?.[i]?`<div class="last-session"><strong>Última vez:</strong> ${last.exercises[i].series.map(x=>{
            const normalized=normalizeSeries(x);
            if(timed){
              const seconds=Number(x.seconds||0);
              return seconds?`${seconds} s${normalized.rir!==""?` · RIR ${normalized.rir}`:""}`:"—";
            }
            return normalized.weight||normalized.reps?`${normalized.warmup?"Cal. ":""}${normalized.weight||"—"} × ${normalized.reps||"—"}${normalized.rir!==""?` · RIR ${normalized.rir}`:""}`:"—";
          }).join(" · ")}</div>`:""}
          ${timed?"":(()=>{
            const rec=exerciseRecommendation(last?.exercises?.[i],ex.target,ex.increment,ex.type);
            const record=recordStats(ex.name);
            return `<div class="recommendation ${rec.status}">
              <div class="recommendation-label">Recomendación</div>
              <strong>${rec.title}</strong>
              <span>${rec.text}</span>
              ${record?`<small class="recommendation-record">Récord: ${formatWeight(record.maxWeight.weight)} kg · e1RM ${formatWeight(Math.round(record.bestE1rm.e1rm*10)/10)} kg</small>`:""}
            </div>`;
          })()}
          ${timed
            ?`<div class="series-header timed-series-header"><span></span><span>Tiempo</span><span>Segundos</span><span>RIR</span><span>Hecha</span></div>`
            :`<div class="series-header series-header-v18"><span></span><span>Peso</span><span>Reps</span><span>RIR</span><span>Cal.</span><span>Hecha</span></div>`}
          ${ex.series.map((x,j)=>timed?`
            <div class="series-row timed-series-row">
              <div class="series-number">${j+1}</div>
              <div class="mini-timer">
                <strong data-exercise-timer-display="${exerciseTimerKey(s,i,j)}">${formatExerciseTimer(currentExerciseTimerMs(getExerciseTimer(s,i,j)))}</strong>
                <div class="mini-timer-actions">
                  <button type="button" class="timer-start" data-timer-start="${i}:${j}">Iniciar</button>
                  <button type="button" class="timer-stop" data-timer-stop="${i}:${j}">Parar</button>
                  <button type="button" class="timer-reset" data-timer-reset="${i}:${j}" aria-label="Reiniciar">↺</button>
                </div>
              </div>
              <input inputmode="numeric" data-seconds="${i}:${j}" value="${x.seconds||""}" placeholder="seg">
              <select data-field="rir" data-series="${j}" aria-label="RIR">
                <option value="" ${x.rir===""?"selected":""}>—</option>
                ${[0,1,2,3,4,5].map(v=>`<option value="${v}" ${String(x.rir)===String(v)?"selected":""}>${v}</option>`).join("")}
              </select>
              <button class="complete-btn ${x.done?"done":""}" data-done="${j}">${x.done?"✓":""}</button>
            </div>`
            :`
            <div class="series-row series-row-v18 ${x.warmup?"warmup-row":""}">
              <div class="series-number">${j+1}</div>
              <input inputmode="decimal" data-field="weight" data-series="${j}" value="${x.weight}" placeholder="kg">
              <input inputmode="numeric" data-field="reps" data-series="${j}" value="${x.reps}" placeholder="reps">
              <select data-field="rir" data-series="${j}" aria-label="RIR">
                <option value="" ${x.rir===""?"selected":""}>—</option>
                ${[0,1,2,3,4,5].map(v=>`<option value="${v}" ${String(x.rir)===String(v)?"selected":""}>${v}</option>`).join("")}
              </select>
              <label class="warmup-toggle"><input type="checkbox" data-warmup="${j}" ${x.warmup?"checked":""}><span>Cal.</span></label>
              <button class="complete-btn ${x.done?"done":""}" data-done="${j}">${x.done?"✓":""}</button>
            </div>`).join("")}
          <textarea data-notes="${i}" placeholder="Notas">${esc(ex.notes||"")}</textarea>
          <label class="workout-discomfort-field"><span>Molestias durante el ejercicio</span><input data-discomfort="${i}" value="${esc(ex.discomfort||"")}" placeholder="Déjalo vacío si no hubo molestias"></label>
        </section>`;
      }).join("")}
    </main>
    <div id="timerPanel" class="timer-panel hidden">
      <div class="timer-main"><div><div class="subtle">Descanso</div><div id="timerValue" class="timer-value">${formatTimer(state.timerSeconds)}</div></div><button id="closeTimer" class="secondary">Cerrar</button></div>
      <div class="timer-actions"><button class="secondary" data-time="60">60 s</button><button class="secondary" data-time="90">90 s</button><button class="secondary" data-time="120">120 s</button><button class="secondary" data-time="180">180 s</button></div>
    </div>
    <footer class="sticky-actions"><div class="sticky-actions-inner"><button id="backHome" class="secondary">Volver a la sesión</button><button id="finishWorkout" class="primary" ${emptySession?"disabled":""}>Revisar y finalizar sesión</button></div></footer>
  </div>`;

  document.querySelectorAll("[data-exercise]").forEach(card=>{
    const i=Number(card.dataset.exercise);
    card.querySelectorAll("[data-field]").forEach(inp=>inp.oninput=()=>{
      const draft=getDraft(s),j=Number(inp.dataset.series);
      draft.exercises[i].series[j][inp.dataset.field]=inp.value; saveDraft(draft);
    });
    card.querySelectorAll("[data-seconds]").forEach(inp=>inp.oninput=()=>{
      const [exerciseIndex,setIndex]=inp.dataset.seconds.split(":").map(Number);
      const draft=getDraft(s);
      draft.exercises[exerciseIndex].series[setIndex].seconds=inp.value;
      draft.exercises[exerciseIndex].series[setIndex].weight="";
      draft.exercises[exerciseIndex].series[setIndex].reps="";
      saveDraft(draft);
    });
    card.querySelectorAll("[data-timer-start]").forEach(btn=>btn.onclick=()=>{
      const [exerciseIndex,setIndex]=btn.dataset.timerStart.split(":").map(Number);
      startExerciseTimer(s,exerciseIndex,setIndex);
    });
    card.querySelectorAll("[data-timer-stop]").forEach(btn=>btn.onclick=()=>{
      const [exerciseIndex,setIndex]=btn.dataset.timerStop.split(":").map(Number);
      stopExerciseTimer(s,exerciseIndex,setIndex);
    });
    card.querySelectorAll("[data-timer-reset]").forEach(btn=>btn.onclick=()=>{
      const [exerciseIndex,setIndex]=btn.dataset.timerReset.split(":").map(Number);
      resetExerciseTimer(s,exerciseIndex,setIndex);
    });
    card.querySelectorAll("[data-warmup]").forEach(inp=>inp.onchange=()=>{
      const draft=getDraft(s),j=Number(inp.dataset.warmup);
      draft.exercises[i].series[j].warmup=inp.checked; saveDraft(draft); renderWorkout();
    });
    card.querySelectorAll("[data-done]").forEach(btn=>btn.onclick=()=>{
      unlockRestTimerAudioFromUserInteraction();
      const draft=getDraft(s),j=Number(btn.dataset.done);
      if(isTimedExercise(draft.exercises[i])&&!draft.exercises[i].series[j].seconds){
        stopExerciseTimer(s,i,j);
      }
      draft.exercises[i].series[j].done=!draft.exercises[i].series[j].done;
      saveDraft(draft);
      if(draft.exercises[i].series[j].done){
        startTimer(activeWorkoutApi().effectiveRestSeconds(
          draft.exercises[i],getRestSeconds()
        ),draft);
      }
      renderWorkout();
    });
  });
  document.querySelectorAll("[data-notes]").forEach(a=>a.oninput=()=>{
    const draft=getDraft(s); draft.exercises[Number(a.dataset.notes)].notes=a.value; saveDraft(draft);
  });
  document.querySelectorAll("[data-discomfort]").forEach(input=>input.oninput=()=>{
    const draft=getDraft(s);draft.exercises[Number(input.dataset.discomfort)].discomfort=input.value;saveDraft(draft);
  });
  const clearPrefilledWeights=document.getElementById("clearPrefilledWeights");
  if(clearPrefilledWeights) clearPrefilledWeights.onclick=()=>{
    const draft=getDraft(s);
    draft.exercises.forEach(ex=>ex.series.forEach(series=>series.weight=""));
    draft.copiedFromLastSession=false;
    saveDraft(draft);
    renderWorkout();
    toast("Pesos vaciados");
  };
  document.getElementById("backHome").onclick=()=>{stopAllExerciseTimers();state.screen="home";renderHome();};
  const openRoutineFromEmptyWorkout=document.getElementById("openRoutineFromEmptyWorkout");
  if(openRoutineFromEmptyWorkout) openRoutineFromEmptyWorkout.onclick=()=>{
    stopAllExerciseTimers();state.screen="routine";renderRoutine();
  };
  document.getElementById("finishWorkout").onclick=()=>{stopAllExerciseTimers();finishWorkout();};
  document.getElementById("timerChip").onclick=()=>document.getElementById("timerPanel").classList.remove("hidden");
  document.getElementById("closeTimer").onclick=()=>document.getElementById("timerPanel").classList.add("hidden");
  document.querySelectorAll("[data-time]").forEach(b=>b.onclick=()=>startTimer(Number(b.dataset.time)));
  document.querySelectorAll("[data-temporary-exercise-substitution]").forEach(button=>button.onclick=()=>{
    openExerciseSubstitution("temporary",Number(button.dataset.temporaryExerciseSubstitution));
  });
  document.querySelectorAll("[data-permanent-exercise-substitution]").forEach(button=>button.onclick=()=>{
    openExerciseSubstitution("permanent",Number(button.dataset.permanentExerciseSubstitution));
  });
  document.querySelectorAll("[data-undo-exercise-substitution]").forEach(button=>button.onclick=()=>{
    undoCurrentExerciseSubstitution(Number(button.dataset.undoExerciseSubstitution));
  });
}

function restTimerContextForDraft(draft=state.workoutDraftMemory){
  const ownerId=currentRoutineOwnerOrNull();
  const workoutInstanceId=String(draft?.workoutInstanceId||"").trim();
  const sessionId=String(draft?.sessionId||"").trim();
  return ownerId&&workoutInstanceId
    ?{ownerId,workoutInstanceId,sessionId:sessionId||null}
    :null;
}
function removeOwnerRestTimerData(ownerId){
  const normalized=workoutProgressApi().ownerId(ownerId);
  const prefix=`${REST_TIMER_STORAGE_PREFIX}${encodeURIComponent(normalized)}:`;
  const keys=[];
  for(let index=0;index<localStorage.length;index+=1){
    const key=localStorage.key(index);
    if(key?.startsWith(prefix)) keys.push(key);
  }
  keys.forEach(key=>localStorage.removeItem(key));
}
function restTimerStorageKey(context){
  if(!context?.ownerId||!context?.workoutInstanceId) return null;
  return `${REST_TIMER_STORAGE_PREFIX}${encodeURIComponent(context.ownerId)}:${encodeURIComponent(context.workoutInstanceId)}`;
}
function removeStoredRestTimer(context){
  const key=restTimerStorageKey(context);
  if(!key) return false;
  try{localStorage.removeItem(key);return true;}catch(_){return false;}
}
function persistRestTimer(payload){
  const key=restTimerStorageKey(payload);
  if(!key) return false;
  try{
    localStorage.setItem(key,JSON.stringify(payload));
    state.restTimerPersistenceFailed=false;
    return true;
  }catch(_){
    state.restTimerPersistenceFailed=true;
    return false;
  }
}
function readStoredRestTimer(context){
  const key=restTimerStorageKey(context);
  if(!key) return null;
  let raw;
  try{raw=localStorage.getItem(key);}catch(_){
    state.restTimerPersistenceFailed=true;
    return null;
  }
  if(raw===null) return null;
  let parsed=null;
  try{parsed=JSON.parse(raw);}catch(_){/* invalid payload is cleared below */}
  const api=activeWorkoutApi();
  const normalized=api.normalizeRestTimerPayload(parsed);
  if(!normalized||!api.restTimerBelongsTo(normalized,context)){
    removeStoredRestTimer(context);
    return null;
  }
  return normalized;
}
function clearActiveRestTimer({removePersisted=true}={}){
  const previous=state.restTimerPayload;
  state.restTimerGeneration=(state.restTimerGeneration||0)+1;
  clearInterval(state.timerInterval);
  state.timerInterval=null;
  state.timerSeconds=0;
  state.timerDeadline=null;
  state.restTimerPayload=null;
  state.restOverlayOpen=false;
  document.querySelector("[data-rest-overlay]")?.remove();
  if(!state.workoutMobileUi?.panel){
    const workoutContent=document.querySelector(
      ".active-workout-screen,.mobile-workout-main-content"
    );
    workoutContent?.removeAttribute("inert");
    workoutContent?.removeAttribute("aria-hidden");
    document.body?.classList.remove("mobile-workout-sheet-open");
  }
  state.restTimerPersistenceFailed=false;
  if(removePersisted&&previous) removeStoredRestTimer(previous);
}
let restTimerAudioContext=null;
function unlockRestTimerAudioFromUserInteraction(){
  const AudioContextConstructor=window.AudioContext||window.webkitAudioContext;
  if(typeof AudioContextConstructor!=="function") return false;
  try{
    if(!restTimerAudioContext||restTimerAudioContext.state==="closed"){
      restTimerAudioContext=new AudioContextConstructor();
    }
    if(restTimerAudioContext.state==="suspended"){
      const resumeResult=restTimerAudioContext.resume();
      if(resumeResult?.catch) resumeResult.catch(()=>{});
    }
    return true;
  }catch(_){return false;}
}
function playRestTimerFinishedSound(){
  const context=restTimerAudioContext;
  if(!context||context.state!=="running") return false;
  try{
    const oscillator=context.createOscillator();
    const gain=context.createGain();
    const start=context.currentTime;
    oscillator.type="sine";
    oscillator.frequency.setValueAtTime(880,start);
    oscillator.frequency.exponentialRampToValueAtTime(660,start+0.18);
    gain.gain.setValueAtTime(0.0001,start);
    gain.gain.exponentialRampToValueAtTime(0.12,start+0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001,start+0.18);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start+0.2);
    return true;
  }catch(_){return false;}
}
function vibrateRestTimerFinished(){
  try{
    if(typeof navigator.vibrate==="function") navigator.vibrate([200,100,200]);
  }catch(_){/* vibration is best-effort */}
}
async function showRestTimerFinishedNotification(){
  try{
    if(
      typeof Notification==="undefined"||Notification.permission!=="granted"||
      document.visibilityState!=="hidden"||!navigator.serviceWorker
    ) return false;
    const ready=navigator.serviceWorker.ready;
    if(!ready) return false;
    const registration=await ready;
    if(typeof registration?.showNotification!=="function") return false;
    await registration.showNotification("Descanso terminado",{
      body:"Es hora de continuar con la siguiente serie."
    });
    return true;
  }catch(_){return false;}
}
function emitRestTimerFinishedFeedback(){
  playRestTimerFinishedSound();
  vibrateRestTimerFinished();
  void showRestTimerFinishedNotification();
}
function finishActiveRestTimer({
  generation=state.restTimerGeneration,announce=true,rerender=true
}={}){
  if(generation!==state.restTimerGeneration||!state.restTimerPayload) return false;
  clearActiveRestTimer({removePersisted:true});
  updateTimerUI();
  if(announce){
    const status=document.getElementById("activeRestStatus");
    if(status) status.textContent="Descanso finalizado.";
    state.workoutRestAnnouncement="Descanso finalizado.";
    emitRestTimerFinishedFeedback();
  }
  if(rerender) requestSafeActiveWorkoutRender();
  return true;
}
function reconcileActiveRestTimer({now=Date.now(),announceExpired=true,generation=state.restTimerGeneration}={}){
  if(generation!==state.restTimerGeneration||!state.restTimerPayload) return false;
  const remaining=activeWorkoutApi().restTimerRemaining(state.restTimerPayload,now);
  state.timerSeconds=remaining;
  state.timerDeadline=state.restTimerPayload.deadlineEpochMs;
  updateTimerUI();
  if(remaining<=0) return finishActiveRestTimer({generation,announce:announceExpired});
  return true;
}
function scheduleActiveRestTimer(){
  if(state.timerInterval||!state.restTimerPayload) return;
  const generation=state.restTimerGeneration;
  state.timerInterval=setInterval(()=>{
    reconcileActiveRestTimer({generation,announceExpired:true});
  },1000);
}
function restoreActiveRestTimer(draft,{now=Date.now(),announceExpired=false}={}){
  const context=restTimerContextForDraft(draft);
  if(!context){clearActiveRestTimer({removePersisted:true});return null;}
  const api=activeWorkoutApi();
  if(state.restTimerPayload&&!api.restTimerBelongsTo(state.restTimerPayload,context)){
    clearActiveRestTimer({removePersisted:true});
  }
  if(!state.restTimerPayload) state.restTimerPayload=readStoredRestTimer(context);
  if(!state.restTimerPayload){
    state.timerSeconds=0;state.timerDeadline=null;
    clearInterval(state.timerInterval);state.timerInterval=null;
    return null;
  }
  if(api.restTimerRemaining(state.restTimerPayload,now)<=0){
    finishActiveRestTimer({announce:announceExpired,rerender:false});
    return null;
  }
  state.timerDeadline=state.restTimerPayload.deadlineEpochMs;
  state.timerSeconds=api.restTimerRemaining(state.restTimerPayload,now);
  scheduleActiveRestTimer();
  updateTimerUI();
  return state.restTimerPayload;
}
function startTimer(sec,draft=state.workoutDraftMemory,now=Date.now()){
  const duration=activeWorkoutApi().validRestSeconds(sec);
  const context=restTimerContextForDraft(draft);
  clearActiveRestTimer({removePersisted:true});
  if(duration===null||duration<=0||!context){updateTimerUI();return null;}
  const payload=activeWorkoutApi().buildRestTimerPayload({
    ...context,startedAtEpochMs:now,deadlineEpochMs:now+(duration*1000),durationSeconds:duration
  });
  if(!payload) return null;
  state.restTimerPayload=payload;
  state.restOverlayOpen=true;
  state.timerDeadline=payload.deadlineEpochMs;
  state.timerSeconds=duration;
  persistRestTimer(payload);
  updateTimerUI();
  const activeRest=document.querySelector("[data-active-rest-container]");
  if(activeRest) activeRest.hidden=false;
  const p=document.getElementById("timerPanel"); if(p)p.classList.remove("hidden");
  state.workoutRestAnnouncement=`Descanso iniciado: ${formatTimer(duration)}.`;
  const startedStatus=document.getElementById("activeRestStatus");
  if(startedStatus) startedStatus.textContent=state.workoutRestAnnouncement;
  scheduleActiveRestTimer();
  if(typeof syncActiveRestOverlay==="function") syncActiveRestOverlay();
  return payload;
}
function extendActiveRestTimer(seconds=30,now=Date.now()){
  const current=state.restTimerPayload;
  const extension=Math.max(0,Math.floor(Number(seconds)||0));
  if(!current||!extension) return null;
  const deadline=Math.max(current.deadlineEpochMs,now)+(extension*1000);
  const payload=activeWorkoutApi().buildRestTimerPayload({
    ...current,deadlineEpochMs:deadline,
    durationSeconds:Math.ceil((deadline-current.startedAtEpochMs)/1000)
  });
  if(!payload) return null;
  state.restTimerPayload=payload;
  state.timerDeadline=deadline;
  persistRestTimer(payload);
  reconcileActiveRestTimer({now,announceExpired:false});
  scheduleActiveRestTimer();
  return payload;
}
function formatTimer(sec){return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,"0")}`;}
function updateTimerUI(){
  const b=document.getElementById("timerChip");
  const timers=typeof document.querySelectorAll==="function"
    ?document.querySelectorAll("[data-active-rest-time],[data-active-rest-overlay-time]")
    :[];
  timers.forEach(node=>{node.textContent=formatTimer(state.timerSeconds);});
  const a=document.getElementById("timerValue");
  if(a)a.textContent=formatTimer(state.timerSeconds);
  if(b)b.textContent=state.timerSeconds?`Descanso · ${formatTimer(state.timerSeconds)}`:"Temporizador de descanso";
}
function finishWorkout(){
  if(state.finishingWorkout) return;
  flushWorkoutDraftProgress({scheduleSync:false,requireLocal:true});
  const ownerId=currentRoutineOwnerOrNull();
  const canonical=getCanonicalRoutine();
  const s=resolveRuntimeSessionId();
  const d=getDraft(s);
  if(!ownerId||!canonical) throw new Error("canonical_runtime_required");
  const existing=getHistory().find(workout=>
    workout.workoutInstanceId===d.workoutInstanceId||workout.draftId===d.draftId
  );
  if(existing){
    window.GymOSRecovery?.createPendingCheckin?.(existing);
    storeWorkoutProgressRecord({
      ...d,status:"finalized",completedAt:existing.date||new Date().toISOString(),
      revision:Math.max(1,Number(d.revision)||1)+1,
      updatedAt:existing.date||new Date().toISOString()
    },{active:false});
    clearDraft(s,{mark:false,preserveProgress:true});
    saveCurrentUserVault(ownerId);
    clearActiveRestTimer({removePersisted:true});
    state.completedWorkoutSummary=existing;
    state.screen="workoutComplete";
    window.GymOSRecovery.renderWorkoutComplete();
    return;
  }
  state.finishingWorkout=true;
  const completed=d.exercises.reduce((n,e)=>n+workingSeries(e.series).filter(x=>x.done).length,0);
  const completedExercises=d.exercises.map(exercise=>
    window.GymOSExerciseLibraryWorkflow?.historyExercise?.(exercise)||exercise
  );
  const workout=routineSessionRuntimeApi().historyEntry({
    ownerId,routine:canonical,sessionId:s,draft:d,workoutId:d.workoutInstanceId,
    date:new Date().toISOString(),durationMs:workoutSessionElapsedMs(d),
    completedSeries:completed,exercises:completedExercises
  });
  workout.draftId=d.draftId;
  workout.workoutInstanceId=d.workoutInstanceId;
  workout.routineRevision=canonical.revision;
  const before=captureRoutineSessionStartupStorage(ownerId);
  const progressKey=workoutProgressApi().progressStorageKey(ownerId,d.workoutInstanceId);
  const activeProgressKey=workoutProgressApi().activeWorkoutStorageKey(ownerId,s);
  const progressBefore=localStorage.getItem(progressKey);
  const activeProgressBefore=localStorage.getItem(activeProgressKey);
  try{
    assertActiveLocalOwner(ownerId);
    const history=getHistory();
    if(!history.some(item=>
      item.workoutInstanceId===d.workoutInstanceId||item.draftId===d.draftId
    )){
      localStorage.setItem(
        "gymos:history",
        JSON.stringify(mergeWorkoutHistory(history,[workout],ownerId))
      );
    }
    window.GymOSRecovery?.createPendingCheckin?.(workout,{mark:false,sync:false});
    storeWorkoutProgressRecord({
      ...d,status:"finalized",completedAt:workout.date,
      revision:Math.max(1,Number(d.revision)||1)+1,
      updatedAt:workout.date
    },{active:false});
    clearDraft(s,{mark:false,preserveProgress:true});
    const next=routineSessionRuntimeApi().nextSessionId(canonical,s);
    persistSelectedRoutineSession(next);
    assertActiveLocalOwner(ownerId);
    markLocalUpdated({schedule:false});
    assertActiveLocalOwner(ownerId);
    saveCurrentUserVault(ownerId);
    assertActiveLocalOwner(ownerId);
  }catch(error){
    restoreRoutineSessionStartupStorage(before,ownerId);
    restoreStorageValue(progressKey,progressBefore);
    restoreStorageValue(activeProgressKey,activeProgressBefore);
    state.finishingWorkout=false;
    throw error;
  }
  let newRecords=[];
  try{
    const workoutAnalysis=window.GymOSWorkoutAnalysis?.analyzeAndSave?.(workout,{force:true});
    if(workoutAnalysis) window.GymOSWorkoutAnalysis?.maybeGenerateAiNarrative?.(workoutAnalysis);
    newRecords=recordsForWorkout(workout);
    stopWorkoutSessionTimer();
    clearActiveRestTimer({removePersisted:true});
    state.completedWorkoutSummary=workout;
    state.screen="workoutComplete";
  }finally{
    state.finishingWorkout=false;
  }
  window.GymOSRecovery.renderWorkoutComplete();
  autoSync("entrenamiento finalizado");
  if(newRecords.length) showRecordsCelebration(newRecords);
  else toast(`${workout.sessionName} guardada`);
}
function showRecordsCelebration(records){
  const modal=document.createElement("div");
  modal.className="record-modal-backdrop";
  modal.innerHTML=`<div class="record-modal">
    <div class="record-trophy">★</div>
    <h2>${records.length===1?"Nuevo récord":"Nuevos récords"}</h2>
    <p>La sesión se ha guardado correctamente.</p>
    <div class="record-modal-list">
      ${records.slice(0,6).map(r=>`<div><strong>${r.exercise}</strong><span>${r.type}: ${r.value}</span></div>`).join("")}
    </div>
    <button class="primary full" id="closeRecordModal">Continuar</button>
  </div>`;
  document.body.appendChild(modal);
  document.getElementById("closeRecordModal").onclick=()=>modal.remove();
}

function renderHistory(){
  const h=getHistory();
  app.innerHTML=`<div class="app-shell">
    <header class="topbar"><div><div class="brand">Historial</div><div class="subtle">${h.length} entrenamientos</div></div></header>
    <main class="screen">
      ${h.length?h.map(w=>`
        <section class="card" data-history="${w.id}">
          <div class="history-item">
            <div><strong>${esc(w.sessionName||`Sesión ${w.session||w.legacySessionKey||""}`)}</strong><small>${formatDate(w.date)} · ${formatDuration(w.durationMs)} · ${w.completedSeries} series efectivas</small></div>
            <div class="chevron">›</div>
          </div>
          ${state.expandedHistoryId===w.id?`<div class="history-detail">
            ${w.exercises.map(e=>`<div class="exercise-summary"><strong>${esc(e.name)}</strong>${e.substitution?.mode==="temporary"?`<small>Realizado en lugar de ${esc(e.substitution.plannedExerciseName||"el ejercicio planificado")}</small>`:""}<span>${e.series.map(x=>{
              const s=normalizeSeries(x);
              return s.weight||s.reps?`${s.warmup?"Cal. ":""}${s.weight||"—"} × ${s.reps||"—"}${s.rir!==""?` · RIR ${s.rir}`:""}`:"—";
            }).join(" · ")}</span>${e.notes?`<small>${esc(e.notes)}</small>`:""}</div>`).join("")}
            <div class="history-actions">
              <button class="secondary" data-edit-workout="${w.id}">Editar sesión</button>
              <button class="danger-button" data-delete-workout="${w.id}">Eliminar</button>
            </div>
          </div>`:""}
        </section>`).join(""):`<div class="empty">Todavía no hay entrenamientos guardados.</div>`}
    </main>${nav("history")}
  </div>`;

  document.querySelectorAll("[data-history]").forEach(card=>card.onclick=()=>{
    const id=Number(card.dataset.history);
    state.expandedHistoryId=state.expandedHistoryId===id?null:id;
    renderHistory();
  });
  document.querySelectorAll("[data-edit-workout]").forEach(button=>button.onclick=event=>{
    event.stopPropagation();
    state.editWorkoutId=Number(button.dataset.editWorkout);
    state.screen="editWorkout";
    renderEditWorkout();
  });
  document.querySelectorAll("[data-delete-workout]").forEach(button=>button.onclick=event=>{
    event.stopPropagation();
    const id=Number(button.dataset.deleteWorkout);
    if(!confirm("¿Eliminar definitivamente este entrenamiento?")) return;
    saveHistory(getHistory().filter(w=>w.id!==id));
    window.GymOSWorkoutAnalysis?.deleteForWorkout?.(id);
    state.expandedHistoryId=null;
    toast("Entrenamiento eliminado");
    renderHistory();
  });
  bindNav();
}

function renderEditWorkout(){
  const workout=getHistory().find(w=>w.id===state.editWorkoutId);
  if(!workout){state.screen="history";renderHistory();return;}
  workout.exercises.forEach(ex=>ex.series=ex.series.map(normalizeSeries));

  app.innerHTML=`<div class="app-shell">
    <header class="topbar"><div><div class="brand">Editar ${esc(workout.sessionName||`sesión ${workout.session||""}`)}</div><div class="subtle">${formatDate(workout.date)}</div></div></header>
    <main class="screen">
      <section class="card">
        <label class="select-label">Fecha y hora</label>
        <input id="editWorkoutDate" type="datetime-local" value="${new Date(new Date(workout.date).getTime()-new Date(workout.date).getTimezoneOffset()*60000).toISOString().slice(0,16)}">
      </section>
      ${workout.exercises.map((ex,i)=>`
        <section class="exercise-card" data-edit-exercise="${i}">
          <h2>${esc(ex.name)}</h2>
          <div class="target">Objetivo: ${esc(ex.target||"Sin rango")} · RIR ${esc(ex.targetRir||"sin registrar")}</div>
          <div class="series-header series-header-v18"><span></span><span>Peso</span><span>Reps</span><span>RIR</span><span>Cal.</span><span></span></div>
          ${ex.series.map((x,j)=>`
            <div class="series-row series-row-v18 ${x.warmup?"warmup-row":""}">
              <div class="series-number">${j+1}</div>
              <input inputmode="decimal" data-edit-field="weight" data-series="${j}" value="${x.weight}" placeholder="kg">
              <input inputmode="numeric" data-edit-field="reps" data-series="${j}" value="${x.reps}" placeholder="reps">
              <select data-edit-field="rir" data-series="${j}">
                <option value="" ${x.rir===""?"selected":""}>—</option>
                ${[0,1,2,3,4,5].map(v=>`<option value="${v}" ${String(x.rir)===String(v)?"selected":""}>${v}</option>`).join("")}
              </select>
              <label class="warmup-toggle"><input type="checkbox" data-edit-warmup="${j}" ${x.warmup?"checked":""}><span>Cal.</span></label>
              <button class="complete-btn ${x.done?"done":""}" data-edit-done="${j}">${x.done?"✓":""}</button>
            </div>`).join("")}
          <textarea data-edit-notes="${i}" placeholder="Notas">${esc(ex.notes||"")}</textarea>
          <label class="workout-discomfort-field"><span>Molestias durante el ejercicio</span><input data-edit-discomfort="${i}" value="${esc(ex.discomfort||"")}" placeholder="Déjalo vacío si no hubo molestias"></label>
        </section>`).join("")}
    </main>
    <footer class="sticky-actions"><div class="sticky-actions-inner"><button id="cancelEditWorkout" class="secondary">Cancelar</button><button id="saveEditedWorkout" class="primary">Guardar cambios</button></div></footer>
  </div>`;

  const edited=structuredClone(workout);
  document.querySelectorAll("[data-edit-exercise]").forEach(card=>{
    const i=Number(card.dataset.editExercise);
    card.querySelectorAll("[data-edit-field]").forEach(input=>input.oninput=()=>{
      edited.exercises[i].series[Number(input.dataset.series)][input.dataset.editField]=input.value;
    });
    card.querySelectorAll("[data-edit-warmup]").forEach(input=>input.onchange=()=>{
      edited.exercises[i].series[Number(input.dataset.editWarmup)].warmup=input.checked;
      input.closest(".series-row").classList.toggle("warmup-row",input.checked);
    });
    card.querySelectorAll("[data-edit-done]").forEach(button=>button.onclick=()=>{
      const series=edited.exercises[i].series[Number(button.dataset.editDone)];
      series.done=!series.done;
      button.classList.toggle("done",series.done);
      button.textContent=series.done?"✓":"";
    });
  });
  document.querySelectorAll("[data-edit-notes]").forEach(area=>area.oninput=()=>{
    edited.exercises[Number(area.dataset.editNotes)].notes=area.value;
  });
  document.querySelectorAll("[data-edit-discomfort]").forEach(input=>input.oninput=()=>{
    edited.exercises[Number(input.dataset.editDiscomfort)].discomfort=input.value;
  });
  document.getElementById("cancelEditWorkout").onclick=()=>{state.screen="history";renderHistory();};
  document.getElementById("saveEditedWorkout").onclick=()=>{
    const dateValue=document.getElementById("editWorkoutDate").value;
    if(!dateValue){toast("Selecciona una fecha válida.");return;}
    edited.date=new Date(dateValue).toISOString();
    edited.completedSeries=edited.exercises.reduce((sum,e)=>sum+workingSeries(e.series).filter(s=>s.done).length,0);
    const history=getHistory().map(w=>w.id===edited.id?edited:w);
    saveHistory(history);
    const workoutAnalysis=window.GymOSWorkoutAnalysis?.analyzeAndSave?.(edited,{force:true});
    if(workoutAnalysis) window.GymOSWorkoutAnalysis?.maybeGenerateAiNarrative?.(workoutAnalysis);
    state.screen="history";
    state.expandedHistoryId=edited.id;
    toast("Entrenamiento actualizado");
    renderHistory();
  };
}


function renderStats(){
  const names=allExerciseNames();
  if(!state.selectedStatsExercise){
    state.selectedStatsExercise=names.find(name=>exerciseStats(name))||names[0];
  }
  const selected=state.selectedStatsExercise;
  const stats=exerciseStats(selected);
  const weekSessions=weeklySessionCount();
  const weekVolume=totalCurrentWeekVolume();

  app.innerHTML=`<div class="app-shell">
    <header class="topbar"><div><div class="brand">Estadísticas</div><div class="subtle">Tu evolución real</div></div></header>
    <main class="screen">
      <section class="stats-summary">
        <div class="metric-card"><span>Sesiones esta semana</span><strong>${weekSessions}</strong></div>
        <div class="metric-card"><span>Volumen semanal</span><strong>${compactNumber(weekVolume)} kg</strong></div>
      </section>

      <section class="card">
        <label class="select-label" for="exerciseSelect">Ejercicio</label>
        <select id="exerciseSelect">
          ${names.map(name=>`<option value="${name}" ${name===selected?"selected":""}>${name}</option>`).join("")}
        </select>
      </section>

      ${stats?`
        <section class="stats-grid">
          <div class="metric-card"><span>Peso máximo</span><strong>${formatWeight(stats.maxWeight)} kg</strong></div>
          <div class="metric-card"><span>Mejor serie</span><strong>${formatWeight(stats.bestSet.weight)} × ${stats.bestSet.reps}</strong></div>
          <div class="metric-card"><span>Volumen total</span><strong>${compactNumber(stats.totalVolume)} kg</strong></div>
          <div class="metric-card"><span>Última sesión</span><strong>${compactNumber(stats.lastVolume)} kg</strong></div>
        </section>

        <section class="card">
          <div class="stats-card-title">
            <div><h2>Evolución de volumen</h2><p class="subtle">Últimas ${Math.min(6,stats.rows.length)} sesiones</p></div>
            ${stats.change===null?"":`<div class="trend ${stats.change>=0?"positive":"negative"}">${stats.change>=0?"+":""}${stats.change.toFixed(1).replace(".",",")}%</div>`}
          </div>
          ${miniBars(stats.rows)}
        </section>

        <section class="card">
          <h2>Últimos registros</h2>
          ${stats.rows.slice(-5).reverse().map(row=>`
            <div class="stat-history-row">
              <div><strong>${formatDate(row.date)}</strong><small>Sesión ${row.session}</small></div>
              <div><strong>${compactNumber(row.volume)} kg</strong><small>${formatWeight(row.maxWeight)} kg máx.</small></div>
            </div>
          `).join("")}
        </section>
      `:`<div class="empty">Aún no hay datos suficientes para este ejercicio.</div>`}
    </main>${nav("stats")}
  </div>`;

  document.getElementById("exerciseSelect").onchange=e=>{
    state.selectedStatsExercise=e.target.value;
    renderStats();
  };
  bindNav();
}

function renderRecords(){
  const names=allExerciseNames();
  const available=names.filter(name=>recordStats(name));
  if(!state.selectedRecordExercise||!names.includes(state.selectedRecordExercise)){
    state.selectedRecordExercise=available[0]||names[0];
  }
  const selected=state.selectedRecordExercise;
  const records=recordStats(selected);
  const progression=progressionStatus(selected);

  app.innerHTML=`<div class="app-shell">
    <header class="topbar"><div><div class="brand">Récords</div><div class="subtle">Marcas personales y siguiente objetivo</div></div></header>
    <main class="screen">
      <section class="card">
        <label class="select-label" for="recordExerciseSelect">Ejercicio</label>
        <select id="recordExerciseSelect">
          ${names.map(name=>`<option value="${name}" ${name===selected?"selected":""}>${name}</option>`).join("")}
        </select>
      </section>

      <section class="progression-card ${progression.level}">
        <div class="record-kicker">Progresión</div>
        <h2>${progression.title}</h2>
        <p>${progression.text}</p>
      </section>

      ${records?`
        <section class="records-grid">
          <div class="record-card">
            <span>Peso máximo</span>
            <strong>${formatWeight(records.maxWeight.weight)} kg</strong>
            <small>${records.maxWeight.reps} reps · ${formatDate(records.maxWeight.date)}</small>
          </div>
          <div class="record-card">
            <span>Fuerza estimada</span>
            <strong>${formatWeight(Math.round(records.bestE1rm.e1rm*10)/10)} kg</strong>
            <small>e1RM · ${formatWeight(records.bestE1rm.weight)} × ${records.bestE1rm.reps}</small>
          </div>
          <div class="record-card">
            <span>Mejor serie</span>
            <strong>${formatWeight(records.bestVolumeSet.weight)} × ${records.bestVolumeSet.reps}</strong>
            <small>${compactNumber(records.bestVolumeSet.volume)} kg de volumen</small>
          </div>
          <div class="record-card">
            <span>Máximo de reps</span>
            <strong>${records.maxReps.reps}</strong>
            <small>con ${formatWeight(records.maxReps.weight)} kg</small>
          </div>
        </section>

        <section class="card">
          <h2>Mejores marcas recientes</h2>
          ${records.performances
            .slice()
            .sort((a,b)=>new Date(b.date)-new Date(a.date))
            .slice(0,8)
            .map(p=>`
              <div class="record-history-row">
                <div><strong>${formatWeight(p.weight)} × ${p.reps}</strong><small>${formatDate(p.date)} · Sesión ${p.session}</small></div>
                <div><strong>${formatWeight(Math.round(p.e1rm*10)/10)} kg</strong><small>e1RM</small></div>
              </div>
            `).join("")}
        </section>
      `:`<div class="empty">Todavía no hay marcas para este ejercicio.</div>`}
    </main>${nav("records")}
  </div>`;

  document.getElementById("recordExerciseSelect").onchange=e=>{
    state.selectedRecordExercise=e.target.value;
    renderRecords();
  };
  bindNav();
}

function bodyRowsForPeriod(rows,period){
  const days={weeks4:28,"3m":92,"6m":184}[period];
  if(!days) return rows;
  const cutoff=Date.now()-days*86400000;
  return rows.filter(row=>new Date(`${row.date}T12:00:00`).getTime()>=cutoff);
}
function bodyMetricChart(rows,keys){
  const series=keys.map(key=>({
    key,label:BODY_METRICS[key].shortLabel,
    points:rows.filter(row=>numericValue(row[key])!==null).map(row=>({date:row.date,value:numericValue(row[key])}))
  })).filter(item=>item.points.length);
  const values=series.flatMap(item=>item.points.map(point=>point.value));
  const dates=series.flatMap(item=>item.points.map(point=>new Date(`${point.date}T12:00:00`).getTime()));
  if(values.length<2) return `<div class="body-empty-chart">Añade al menos dos registros para ver la tendencia.</div>`;
  const min=Math.min(...values),max=Math.max(...values),range=Math.max(max-min,.5);
  const minDate=Math.min(...dates),maxDate=Math.max(...dates),dateRange=Math.max(maxDate-minDate,86400000);
  const width=640,height=230,pad=28;
  const colors=["var(--brand)","var(--body-chart-secondary,#0f766e)"];
  const position=point=>{
    const time=new Date(`${point.date}T12:00:00`).getTime();
    return {x:pad+((time-minDate)/dateRange)*(width-pad*2),y:height-pad-((point.value-min)/range)*(height-pad*2)};
  };
  return `<div class="body-detail-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolución de ${keys.map(key=>BODY_METRICS[key].shortLabel).join(" y ")}">
    ${series.map((item,index)=>{
      const points=item.points.map(point=>{const p=position(point);return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;}).join(" ");
      return `<polyline points="${points}" fill="none" stroke="${colors[index]}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>${item.points.map(point=>{const p=position(point);return `<circle cx="${p.x}" cy="${p.y}" r="4" fill="${colors[index]}"><title>${item.label}: ${formatWeight(point.value)} · ${formatDate(point.date)}</title></circle>`;}).join("")}`;
    }).join("")}</svg>
    ${series.length>1?`<div class="body-chart-legend">${series.map((item,index)=>`<span style="--legend-color:${colors[index]}">${esc(item.label)}</span>`).join("")}</div>`:""}
  </div>`;
}
function bodyMetricNeutralTrend(stats,unit){
  if(!stats?.previous) return "Primer registro";
  if(Math.abs(stats.delta)<.05) return "Sin cambios";
  return `${stats.delta>0?"Subió":"Bajó"} ${formatBodyNumber(Math.abs(stats.delta))} ${unit}`;
}
function bodyMetricGoalContext(key,stats){
  if(!stats?.previous) return "Este registro servirá como referencia para próximas mediciones.";
  const goal=String(getNutritionSettings()?.goal||getOnboardingProfile()?.goal||"").toLocaleLowerCase("es");
  if(goal.includes("defin")||goal==="fat_loss"){
    if(key==="waist"&&stats.delta<0) return "En definición, una reducción de cintura puede ser coherente con el objetivo.";
    if(key==="weight") return "Interpreta el peso junto con cintura, rendimiento y media semanal.";
    if(["chest","rightArm","leftArm","rightThigh","leftThigh"].includes(key)&&Math.abs(stats.delta)<.3) return "Mantener perímetros musculares puede ser una referencia útil durante la definición.";
  }
  if(goal.includes("volumen")||goal==="muscle"){
    if(key==="waist"&&stats.delta>1) return "En volumen, conviene revisar la cintura junto con el ritmo de ganancia.";
    if(["weight","chest","shoulders","rightArm","leftArm","rightThigh","leftThigh"].includes(key)&&stats.delta>0) return "La subida puede ser coherente con una fase de volumen; compárala con fuerza y cintura.";
  }
  return "La variación se muestra de forma neutral. Interprétala junto con tu objetivo y el resto de métricas.";
}
function bodyAsymmetrySummary(rightKey,leftKey,label){
  const right=bodyMetricStats(rightKey),left=bodyMetricStats(leftKey);
  if(!right||!left) return "";
  const difference=Math.abs(right.latest.value-left.latest.value);
  const previous=right.previous&&left.previous?Math.abs(right.previous.value-left.previous.value):null;
  const stable=previous!==null&&Math.abs(difference-previous)<=.3;
  return `<article class="body-asymmetry-card"><div><span class="section-kicker">${esc(label.toLocaleUpperCase("es"))}</span><h3>${stable?"Diferencia estable":"Asimetría registrada"}</h3></div><dl>
    <div><dt>${esc(BODY_METRICS[rightKey].shortLabel)}</dt><dd>${formatBodyNumber(right.latest.value)} cm</dd></div>
    <div><dt>${esc(BODY_METRICS[leftKey].shortLabel)}</dt><dd>${formatBodyNumber(left.latest.value)} cm</dd></div>
    <div><dt>Diferencia absoluta</dt><dd>${formatBodyNumber(difference)} cm</dd></div>
  </dl><small>Dato descriptivo; no constituye un diagnóstico.</small></article>`;
}
function renderBodyMetricCard(key){
  const definition=BODY_METRICS[key],stats=bodyMetricStats(key);
  if(!stats) return `<button type="button" class="body-overview-metric empty" data-body-metric="${esc(key)}"><span>${esc(definition.shortLabel)}</span><strong>Sin registrar</strong><small>Añadir primera medida →</small></button>`;
  return `<button type="button" class="body-overview-metric" data-body-metric="${esc(key)}"><span>${esc(definition.shortLabel)}</span><strong>${formatBodyNumber(stats.latest.value)} ${definition.unit}</strong><b>${esc(bodyMetricNeutralTrend(stats,definition.unit))}${stats.percent!==null?` · ${stats.percent>0?"+":stats.percent<0?"−":""}${formatBodyNumber(Math.abs(stats.percent))} %`:""}</b><small>${formatDate(stats.latest.date)}</small></button>`;
}
function renderBodyMetricDetail(key){
  const definition=BODY_METRICS[key];
  if(!definition){state.selectedBodyMetric=null;renderBody();return;}
  const rows=getBodyHistory(),stats=bodyMetricStats(key,rows);
  const chartKeys=definition.pair?[key,definition.pair]:[key];
  const history=stats?.entries.slice().reverse()||[];
  const weekly=key==="weight"&&stats?stats.entries.filter(item=>Date.now()-new Date(`${item.date}T12:00:00`).getTime()<=7*86400000):[];
  app.innerHTML=`<div class="app-shell"><header class="topbar"><button id="backBodyOverview" class="text-button" type="button">← Medidas</button><div><div class="brand">${esc(definition.label)}</div><div class="subtle">Histórico y tendencia</div></div></header>
    <main class="screen body-detail-screen">
      ${stats?`<section class="body-detail-hero"><span>Último valor · ${formatDate(stats.latest.date)}</span><strong>${formatBodyNumber(stats.latest.value)} ${definition.unit}</strong><p>${esc(bodyMetricNeutralTrend(stats,definition.unit))}${stats.percent!==null?` · ${stats.percent>0?"+":stats.percent<0?"−":""}${formatBodyNumber(Math.abs(stats.percent))} %`:""}</p></section>`:`<section class="body-detail-hero empty"><span>${esc(definition.shortLabel)}</span><strong>Sin registrar</strong><button id="addFirstBodyMetric" class="primary">Añadir primera medida</button></section>`}
      <section class="card"><div class="body-period-control" aria-label="Periodo del gráfico">${[["weeks4","4 semanas"],["3m","3 meses"],["6m","6 meses"],["all","Todo"]].map(([value,label])=>`<button type="button" data-body-period="${value}" class="${state.bodyMetricPeriod===value?"active":""}" aria-pressed="${state.bodyMetricPeriod===value}">${label}</button>`).join("")}</div>${bodyMetricChart(bodyRowsForPeriod(rows,state.bodyMetricPeriod),chartKeys)}</section>
      ${stats?`<section class="body-detail-stats"><article><span>Cambio anterior</span><strong>${stats.delta===null?"Primer registro":signedBodyValue(stats.delta,definition.unit)}</strong></article><article><span>Cambio mensual</span><strong>${stats.monthlyDelta===null?"Sin datos":signedBodyValue(stats.monthlyDelta,definition.unit)}</strong></article><article><span>Cambio total</span><strong>${stats.totalDelta===null?"Primer registro":signedBodyValue(stats.totalDelta,definition.unit)}</strong><small>${stats.totalPercent!==null?`${stats.totalPercent>0?"+":stats.totalPercent<0?"−":""}${formatBodyNumber(Math.abs(stats.totalPercent))} %`:""}</small></article>${weekly.length?`<article><span>Media últimos 7 días</span><strong>${formatBodyNumber(weekly.reduce((sum,item)=>sum+item.value,0)/weekly.length)} kg</strong></article>`:""}</section><section class="card body-goal-context"><h2>Interpretación</h2><p>${esc(bodyMetricGoalContext(key,stats))}</p></section>`:""}
      <section class="card"><h2>Historial</h2>${history.length?history.map(item=>`<div class="body-history-row"><div><strong>${formatDate(item.date)}</strong><small>${esc(rows.find(row=>row.id===item.id)?.notes||"Sin notas")}</small></div><strong>${formatBodyNumber(item.value)} ${definition.unit}</strong></div>`).join(""):`<div class="empty">Todavía no hay registros para esta métrica.</div>`}</section>
    </main>${nav("")}</div>`;
  document.getElementById("backBodyOverview").onclick=()=>{state.selectedBodyMetric=null;renderBody();};
  const addFirst=document.getElementById("addFirstBodyMetric");
  if(addFirst) addFirst.onclick=()=>{state.selectedBodyMetric=null;state.bodyEntryOpen=true;renderBody();};
  document.querySelectorAll("[data-body-period]").forEach(button=>button.onclick=()=>{state.bodyMetricPeriod=button.dataset.bodyPeriod;renderBodyMetricDetail(key);});
  bindNav();
}
function renderBody(){
  if(state.selectedBodyMetric){renderBodyMetricDetail(state.selectedBodyMetric);return;}
  const rows=getBodyHistory(),today=new Date().toISOString().slice(0,10);
  const categories=["General","Tronco","Brazos","Piernas"],message=state.bodyFormMessage;
  const lastDate=rows.at(-1)?.date;
  const daysSince=lastDate?Math.floor((Date.now()-new Date(`${lastDate}T12:00:00`).getTime())/86400000):null;
  const asymmetries=`${bodyAsymmetrySummary("rightArm","leftArm","Brazos")}${bodyAsymmetrySummary("rightThigh","leftThigh","Piernas")}`;
  app.innerHTML=`<div class="app-shell"><header class="topbar"><div><div class="brand">Seguimiento corporal</div><div class="subtle">Medidas, evolución y asimetrías</div></div><button id="toggleBodyEntry" class="primary" type="button">${state.bodyEntryOpen?"Cerrar":"Añadir medidas"}</button></header>
    <main class="screen body-screen-v2">
      ${daysSince!==null&&daysSince<14?`<aside class="body-frequency-note">Los perímetros suelen ser más útiles cada 2–4 semanas. El peso sí puede registrarse varias veces por semana.</aside>`:""}
      ${state.bodyEntryOpen?`<section class="card body-entry-card"><div><span class="section-kicker">REGISTRO RÁPIDO</span><h2>Añadir medidas</h2><p class="subtle">Guarda únicamente las medidas que hayas realizado hoy.</p></div><div class="body-form-grid body-form-complete">
        <label class="body-date-field"><span>Fecha</span><input id="bodyDate" type="date" value="${today}"></label>
        ${BODY_METRIC_KEYS.map(key=>{const metric=BODY_METRICS[key];return `<label class="body-measure-field"><span>${esc(metric.label)} <em>${esc(metric.tier)}</em></span><input id="bodyMetric-${esc(key)}" inputmode="decimal" placeholder="${metric.unit==="%"?"18,5":metric.unit==="kg"?"78,4":"—"}" aria-describedby="bodyHelp-${esc(key)}"><small id="bodyHelp-${esc(key)}">${esc(metric.help)}</small></label>`;}).join("")}
        <label class="body-note"><span>Notas</span><textarea id="bodyNotes" rows="3" placeholder="Condiciones de medición, método utilizado…"></textarea></label></div>
        <p id="bodyFormMessage" class="verification-message ${message?.type||""}" role="${message?.type==="error"?"alert":"status"}" ${message?"":"hidden"}>${message?esc(message.text):""}</p><button id="saveBody" class="primary full" type="button">Guardar medidas</button></section>`:""}
      ${categories.map(category=>`<section class="body-category"><div class="body-category-heading"><span class="section-kicker">${esc(category.toLocaleUpperCase("es"))}</span><h2>${esc(category)}</h2></div><div class="body-overview-grid">${BODY_METRIC_KEYS.filter(key=>BODY_METRICS[key].category===category).map(renderBodyMetricCard).join("")}</div></section>`).join("")}
      ${asymmetries?`<section class="body-asymmetry-section"><div class="body-category-heading"><span class="section-kicker">COMPARACIÓN</span><h2>Asimetrías registradas</h2></div><div class="body-asymmetry-grid">${asymmetries}</div></section>`:""}
      <section class="card"><h2>Registros</h2>${rows.length?rows.slice().reverse().map(row=>{const values=BODY_METRIC_KEYS.filter(key=>numericValue(row[key])!==null);return `<div class="body-history-row"><div><strong>${formatDate(row.date)}</strong><small>${esc(row.notes||`${values.length} ${values.length===1?"medida":"medidas"}`)}</small></div><div class="body-history-values"><span>${values.slice(0,2).map(key=>`${BODY_METRICS[key].shortLabel}: ${formatWeight(row[key])}`).join(" · ")}</span><button data-delete-body="${esc(row.id)}" class="body-delete" aria-label="Eliminar registro del ${formatDate(row.date)}">×</button></div></div>`;}).join(""):`<div class="empty">Todavía no hay registros. Añade tu primera medida cuando estés preparado.</div>`}</section>
    </main>${nav("")}</div>`;
  document.getElementById("toggleBodyEntry").onclick=()=>{state.bodyEntryOpen=!state.bodyEntryOpen;state.bodyFormMessage=null;renderBody();};
  document.querySelectorAll("[data-body-metric]").forEach(button=>button.onclick=()=>{state.selectedBodyMetric=button.dataset.bodyMetric;renderBodyMetricDetail(state.selectedBodyMetric);});
  const saveButton=document.getElementById("saveBody");
  if(saveButton) saveButton.onclick=()=>{
    const date=document.getElementById("bodyDate").value,values={};
    const showBodyError=text=>{
      state.bodyFormMessage={type:"error",text};
      const element=document.getElementById("bodyFormMessage");
      element.textContent=text;element.className="verification-message error";
      element.setAttribute("role","alert");element.hidden=false;
    };
    BODY_METRIC_KEYS.forEach(key=>{const raw=document.getElementById(`bodyMetric-${key}`).value.trim().replace(",",".");values[key]=raw===""?null:numericValue(raw);});
    if(!date){showBodyError("Selecciona una fecha.");return;}
    if(!BODY_METRIC_KEYS.some(key=>values[key]!==null)){showBodyError("Introduce al menos una medida.");return;}
    const invalid=BODY_METRIC_KEYS.find(key=>{const value=values[key];if(value===null)return false;if(key==="weight")return value<30||value>300;if(key==="bodyFat")return value<1||value>80;return value<10||value>300;});
    if(invalid){showBodyError(`Revisa el valor de ${BODY_METRICS[invalid].shortLabel}.`);return;}
    const current=getBodyHistory(),existing=current.find(row=>row.date===date),now=new Date().toISOString();
    const next=existing?{...existing}:{id:bodyMeasurementId(),date,createdAt:now};
    BODY_METRIC_KEYS.forEach(key=>{if(values[key]!==null)next[key]=values[key];});
    next.notes=document.getElementById("bodyNotes").value.trim()||existing?.notes||"";next.updatedAt=now;
    saveBodyHistory([...current.filter(row=>row.id!==next.id),next]);
    state.bodyEntryOpen=false;state.bodyFormMessage=null;toast("Medidas corporales guardadas.");renderBody();
  };
  document.querySelectorAll("[data-delete-body]").forEach(button=>button.onclick=()=>{if(!confirm("¿Eliminar este registro corporal?"))return;const id=button.dataset.deleteBody;saveBodyHistory(getBodyHistory().filter(row=>String(row.id)!==String(id)));deleteBodyMeasurementRemote(id);renderBody();});
  bindNav();
}

function renderPlan(){
  const week=weeklyProgress();
  const weeks=adherenceWeeks(8);
  const month=monthData(state.planMonth);
  const streak=completedWeekStreak();
  const monthWorkouts=month.cells.filter(Boolean).reduce((sum,c)=>sum+c.workouts,0);

  app.innerHTML=`<div class="app-shell">
    <header class="topbar"><div><div class="brand">Plan semanal</div><div class="subtle">Objetivo, adherencia y calendario</div></div></header>
    <main class="screen">
      <section class="weekly-hero ${week.remaining===0?"completed":""}">
        <div class="record-kicker">Esta semana</div>
        <div class="weekly-hero-number">${week.count}<span> / ${week.goal}</span></div>
        <h2>${week.remaining===0?"Objetivo cumplido":`${week.remaining} ${week.remaining===1?"sesión pendiente":"sesiones pendientes"}`}</h2>
        <div class="weekly-progress-track large"><div style="width:${week.percentage}%"></div></div>
        <p>${week.remaining===0?"La semana ya cumple el objetivo definido.":week.remaining===1?"Una sesión más completa el objetivo semanal.":`Distribuye las ${week.remaining} sesiones restantes según tu recuperación.`}</p>
      </section>

      <section class="plan-summary-grid">
        <div class="metric-card"><span>Racha</span><strong>${streak}</strong><small>${streak===1?"semana cumplida":"semanas cumplidas"}</small></div>
        <div class="metric-card"><span>Este mes</span><strong>${monthWorkouts}</strong><small>entrenamientos</small></div>
      </section>

      <section class="card">
        <div class="card-heading-row">
          <div><h2>Adherencia</h2><p class="subtle">Últimas ocho semanas</p></div>
          <strong>${Math.round((weeks.filter(w=>w.met).length/weeks.length)*100)}%</strong>
        </div>
        <div class="adherence-chart">
          ${weeks.map(w=>`
            <div class="adherence-column">
              <div class="adherence-bar-area">
                <div class="adherence-bar ${w.met?"met":""}" style="height:${Math.max(8,w.percentage)}%"></div>
              </div>
              <small>${new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit"}).format(w.start)}</small>
              <strong>${w.count}</strong>
            </div>
          `).join("")}
        </div>
      </section>

      <section class="card">
        <div class="calendar-heading">
          <button id="previousMonth" class="calendar-nav" aria-label="Mes anterior">‹</button>
          <div><h2>${monthLabel(state.planMonth)}</h2><p class="subtle">${monthWorkouts} entrenamientos registrados</p></div>
          <button id="nextMonth" class="calendar-nav" aria-label="Mes siguiente">›</button>
        </div>
        <div class="calendar-weekdays">${["L","M","X","J","V","S","D"].map(d=>`<span>${d}</span>`).join("")}</div>
        <div class="calendar-grid">
          ${month.cells.map(cell=>cell?`
            <div class="calendar-day ${cell.today?"today":""} ${cell.workouts?"trained":""}">
              <span>${cell.day}</span>
              <div class="calendar-markers">
                ${cell.workouts?`<i class="workout-marker">${cell.workouts>1?cell.workouts:""}</i>`:""}
                ${cell.body?`<i class="body-marker"></i>`:""}
              </div>
            </div>
          `:`<div class="calendar-day empty-day"></div>`).join("")}
        </div>
        <div class="calendar-legend">
          <span><i class="workout-marker"></i> Entrenamiento</span>
          <span><i class="body-marker"></i> Peso/cintura</span>
        </div>
      </section>

      <section class="card">
        <h2>Objetivo semanal</h2>
        <p class="subtle">Elige cuántas sesiones quieres completar cada semana.</p>
        <div class="weekly-goal-options">
          ${[1,2,3,4,5,6,7].map(value=>`<button data-weekly-goal="${value}" class="${getWeeklyGoal()===value?"active":""}">${value}</button>`).join("")}
        </div>
      </section>
    </main>${nav("")}
  </div>`;

  document.getElementById("previousMonth").onclick=()=>{
    state.planMonth=shiftMonth(state.planMonth,-1);
    renderPlan();
  };
  document.getElementById("nextMonth").onclick=()=>{
    state.planMonth=shiftMonth(state.planMonth,1);
    renderPlan();
  };
  document.querySelectorAll("[data-weekly-goal]").forEach(button=>button.onclick=()=>{
    saveWeeklyGoal(Number(button.dataset.weeklyGoal));
    toast("Objetivo semanal actualizado");
    renderPlan();
  });
  bindNav();
}


function esc(value){
  return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}
function editExerciseModal(session,index=null){
  const sessionModel=canonicalSessionByRef(session);
  const exercises=JSON.parse(JSON.stringify(sessionModel?.exercises||[]));
  const current=index===null
    ? {name:"",target:"8–10 reps",sets:3,increment:2.5,type:"peso"}
    : exercises[index];

  const layer=document.createElement("div");
  layer.className="routine-modal-layer";
  layer.innerHTML=`<div class="routine-modal">
    <div class="modal-handle"></div>
    <div class="card-heading-row">
      <h2>${index===null?"Añadir ejercicio":"Editar ejercicio"}</h2>
      <button id="closeRoutineModal" class="icon-button">×</button>
    </div>
    <label><span>Nombre</span><input id="reName" value="${esc(current.name)}" placeholder="Press banca"></label>
    <div class="routine-editor-grid">
      <label><span>Series</span><input id="reSets" type="number" min="1" max="10" value="${current.sets||3}"></label>
      <label><span>Tipo</span><select id="reType">
        <option value="peso" ${current.type==="peso"?"selected":""}>Peso</option>
        <option value="corporal" ${current.type==="corporal"?"selected":""}>Peso corporal</option>
        <option value="tiempo" ${current.type==="tiempo"?"selected":""}>Tiempo</option>
      </select></label>
    </div>
    <label><span>Objetivo</span><input id="reTarget" value="${esc(current.target)}" placeholder="8–10 reps"></label>
    <label><span>Incremento recomendado (kg)</span><input id="reIncrement" type="number" min="0" step="0.25" value="${current.increment||0}"></label>
    <div class="modal-actions">
      ${index!==null?'<button id="removeExercise" class="danger-soft">Eliminar</button>':""}
      <button id="saveExercise" class="primary">Guardar</button>
    </div>
  </div>`;
  document.body.appendChild(layer);

  const close=()=>layer.remove();
  document.getElementById("closeRoutineModal").onclick=close;
  layer.onclick=e=>{if(e.target===layer) close();};

  document.getElementById("saveExercise").onclick=()=>{
    const name=document.getElementById("reName").value.trim();
    if(!name){toast("Escribe el nombre del ejercicio.");return;}
    const value={
      name,
      target:document.getElementById("reTarget").value.trim()||"8–10 reps",
      sets:Math.max(1,Math.min(10,Number(document.getElementById("reSets").value)||3)),
      increment:Math.max(0,Number(document.getElementById("reIncrement").value)||0),
      type:document.getElementById("reType").value
    };
    if(index===null) exercises.push(value);
    else exercises[index]=value;
    saveCanonicalSessionExercises(session,exercises);
    close();
    toast(index===null?"Ejercicio añadido":"Ejercicio actualizado");
    renderRoutineEditor();
  };

  const remove=document.getElementById("removeExercise");
  if(remove) remove.onclick=()=>{
    if(!confirm(`¿Eliminar "${current.name}"?`)) return;
    exercises.splice(index,1);
    saveCanonicalSessionExercises(session,exercises);
    close();
    toast("Ejercicio eliminado");
    renderRoutineEditor();
  };
}

function substituteExerciseModal(session,index){
  const current=canonicalSessionByRef(session)?.exercises?.[index];
  if(!current) return;
  const library=getExerciseLibrary();
  const equipmentOptions=["Todos",...new Set(library.map(item=>item.equipment).filter(Boolean))];

  const layer=document.createElement("div");
  layer.className="routine-modal-layer";
  layer.innerHTML=`<div class="routine-modal substitution-modal">
    <div class="modal-handle"></div>
    <div class="card-heading-row">
      <div><h2>Sustituir ejercicio</h2><p class="subtle">${esc(current.name)}</p></div>
      <button id="closeSubstitutionModal" class="icon-button">×</button>
    </div>
    <div class="substitution-preserve-banner">
      Se conservarán las series, el objetivo y el incremento configurados.
    </div>
    <div class="library-filter-grid">
      <label><span>Buscar alternativa</span><input id="substitutionSearch" type="search" placeholder="Ejercicio, músculo o material"></label>
      <label><span>Material disponible</span><select id="substitutionEquipment">
        ${equipmentOptions.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join("")}
      </select></label>
    </div>
    <label class="favorite-filter"><input id="substitutionFavoritesOnly" type="checkbox"><span>Solo sustituciones favoritas</span></label>
    <label><span>Motivo</span><select id="substitutionReason">
      <option value="">Sin indicar</option>
      <option value="Dolor o molestia">Dolor o molestia</option>
      <option value="Material no disponible">Material no disponible</option>
      <option value="Máquina ocupada">Máquina ocupada</option>
      <option value="Preferencia personal">Preferencia personal</option>
      <option value="Entrenamiento en casa">Entrenamiento en casa</option>
      <option value="Otro">Otro</option>
    </select></label>
    <div id="substitutionResults" class="substitution-results"></div>
  </div>`;
  document.body.appendChild(layer);

  const close=()=>layer.remove();
  document.getElementById("closeSubstitutionModal").onclick=close;
  layer.onclick=e=>{if(e.target===layer) close();};

  const renderResults=()=>{
    const query=document.getElementById("substitutionSearch").value;
    const equipment=document.getElementById("substitutionEquipment").value;
    const favoritesOnly=document.getElementById("substitutionFavoritesOnly").checked;
    const results=suggestedSubstitutes(current.name,query,equipment,favoritesOnly);
    const container=document.getElementById("substitutionResults");
    container.innerHTML=results.length?results.map(item=>`
      <article class="substitution-option">
        <button class="substitution-option-main" data-choose-substitute="${item.id}">
          <strong>${esc(item.name)}</strong>
          <span>${esc(item.muscle)} · ${esc(item.equipment)} · ${esc(item.type)}</span>
          <small>${item.sameMuscle?"Mismo grupo muscular":item.muscle}${item.sameType?" · Mismo tipo":""}</small>
        </button>
        <button class="favorite-button ${item.favorite?"active":""}" data-favorite-substitute="${item.id}" aria-label="Favorito">★</button>
      </article>`).join(""):`<div class="routine-empty"><strong>Sin alternativas</strong><p>Prueba con otros filtros.</p></div>`;

    container.querySelectorAll("[data-choose-substitute]").forEach(button=>button.onclick=()=>{
      const replacement=library.find(item=>item.id===button.dataset.chooseSubstitute);
      const reason=document.getElementById("substitutionReason").value;
      if(applyExerciseSubstitution(session,index,replacement,reason)){
        close();
        toast(`${current.name} sustituido por ${replacement.name}`);
        renderRoutineEditor();
      }
    });
    container.querySelectorAll("[data-favorite-substitute]").forEach(button=>button.onclick=()=>{
      const replacement=library.find(item=>item.id===button.dataset.favoriteSubstitute);
      if(!replacement) return;
      const key=substitutionPairKey(current.name,replacement.name);
      const favorites=getFavoriteSubstitutions();
      const next=favorites.includes(key)?favorites.filter(item=>item!==key):[...favorites,key];
      saveFavoriteSubstitutions(next);
      renderResults();
    });
  };

  document.getElementById("substitutionSearch").oninput=renderResults;
  document.getElementById("substitutionEquipment").onchange=renderResults;
  document.getElementById("substitutionFavoritesOnly").onchange=renderResults;
  renderResults();
}

function moveRoutineExercise(session,index,direction){
  const exercises=JSON.parse(JSON.stringify(canonicalSessionByRef(session)?.exercises||[]));
  const target=index+direction;
  if(target<0||target>=exercises.length) return;
  [exercises[index],exercises[target]]=[exercises[target],exercises[index]];
  saveCanonicalSessionExercises(session,exercises);
  renderRoutineEditor();
}
function renderRoutineEditor(){
  return renderRoutineHub();
  const available=activeRoutineSessions();
  const selected=canonicalSessionByRef(state.editingSession)||available[0]||null;
  if(!selected){state.screen="settings";renderSettings();return;}
  const session=selected.sessionId;
  state.editingSession=session;
  const exercises=selected.exercises||[];
  const sessionName=routineSessionRuntimeApi().displayName(
    selected,available.findIndex(item=>item.sessionId===session)
  );

  app.innerHTML=`<div class="app-shell">
    <header class="topbar">
      <button id="backRoutineEditor" class="back-button">←</button>
      <div><div class="brand">Editor de rutina</div><div class="subtle">${available.length} sesiones</div></div>
      <button id="addRoutineExerciseTop" class="header-action">＋</button>
    </header>
    <main class="screen">
      <div class="session-picker routine-tabs" role="tablist" aria-label="Sesiones de la rutina">
        ${available.map(item=>`<button type="button" role="tab" aria-selected="${item.sessionId===session}" data-edit-session="${esc(item.sessionId)}" class="${item.sessionId===session?"active":""}">${esc(routineSessionRuntimeApi().displayName(item))}</button>`).join("")}
      </div>
      <section class="card">
        <div class="card-heading-row">
          <div><h2>${esc(sessionName)}</h2><p class="subtle">${exercises.length} ejercicios</p></div>
          <button id="addRoutineExercise" class="primary small-button">＋ Añadir</button>
        </div>
        <div class="routine-edit-list">
          ${exercises.length ? exercises.map((item,index)=>`<article class="routine-edit-item">
            <div class="routine-order-buttons">
              <button data-up="${index}" ${index===0?"disabled":""}>↑</button>
              <button data-down="${index}" ${index===exercises.length-1?"disabled":""}>↓</button>
            </div>
            <button class="routine-edit-main" data-edit="${index}">
              <strong>${esc(item.name)}</strong>
              <span>${item.sets} series · ${esc(item.target)} · +${Number(item.increment||0).toLocaleString("es-ES")} kg</span>
              ${item.substitutionOf?`<small class="substitution-note">Sustituye a ${esc(item.substitutionOf)}${item.substitutionReason?` · ${esc(item.substitutionReason)}`:""}</small>`:""}
            </button>
            <div class="routine-item-actions">
              <button class="icon-button substitution-button" data-substitute="${index}" title="Sustituir">⇄</button>
              ${item.substitutionOf?`<button class="icon-button" data-revert-substitution="${index}" title="Restaurar">↶</button>`:""}
              <button class="icon-button" data-edit="${index}">✎</button>
            </div>
          </article>`).join("") : `<div class="routine-empty"><strong>Sesión vacía</strong><p>Añade el primer ejercicio.</p></div>`}
        </div>
      </section>
      <section class="card">
        <h2>Acciones</h2>
        <div class="settings-actions">
          <button id="copyRoutineSession" class="secondary">Copiar esta sesión</button>
          <button id="clearRoutineSession" class="danger-soft">Vaciar sesión</button>
        </div>
      </section>
    </main>
  </div>`;

  document.getElementById("backRoutineEditor").onclick=()=>{state.screen="settings";renderSettings();};
  document.querySelectorAll("[data-edit-session]").forEach(b=>b.onclick=()=>{
    state.editingSession=b.dataset.editSession;
    renderRoutineEditor();
  });
  const add=()=>editExerciseModal(session);
  document.getElementById("addRoutineExercise").onclick=add;
  document.getElementById("addRoutineExerciseTop").onclick=add;
  document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>editExerciseModal(session,Number(b.dataset.edit)));
  document.querySelectorAll("[data-substitute]").forEach(b=>b.onclick=()=>substituteExerciseModal(session,Number(b.dataset.substitute)));
  document.querySelectorAll("[data-revert-substitution]").forEach(b=>b.onclick=()=>{
    if(revertLastSubstitution(session,Number(b.dataset.revertSubstitution))){
      toast("Ejercicio original restaurado");
      renderRoutineEditor();
    }
  });
  document.querySelectorAll("[data-up]").forEach(b=>b.onclick=()=>moveRoutineExercise(session,Number(b.dataset.up),-1));
  document.querySelectorAll("[data-down]").forEach(b=>b.onclick=()=>moveRoutineExercise(session,Number(b.dataset.down),1));

  document.getElementById("copyRoutineSession").onclick=()=>{
    const choices=available.map((item,index)=>`${index+1}. ${routineSessionRuntimeApi().displayName(item)}`).join("\n");
    const target=prompt(`¿A qué sesión quieres copiar ${sessionName}?\n${choices}\nEscribe el número.`);
    if(target===null) return;
    const dest=available[Number(target.trim())-1]?.sessionId;
    if(!dest){toast("Selecciona una sesión válida.");return;}
    if(dest===session){toast("Selecciona una sesión diferente.");return;}
    const destination=canonicalSessionByRef(dest);
    if(destination.exercises.length&&!confirm(`${routineSessionRuntimeApi().displayName(destination)} ya contiene ejercicios. ¿Sustituirlos?`)) return;
    saveCanonicalSessionExercises(dest,exercises.map(item=>({...item})));
    state.editingSession=dest;
    toast(`${sessionName} copiada`);
    renderRoutineEditor();
  };
  document.getElementById("clearRoutineSession").onclick=()=>{
    if(!exercises.length) return;
    if(!confirm(`¿Vaciar toda ${sessionName}?`)) return;
    saveCanonicalSessionExercises(session,[]);
    toast("Sesión vaciada");
    renderRoutineEditor();
  };
}


function renderBlocks(){
  const blocks=getTrainingBlocks();
  const active=getActiveBlock();
  app.innerHTML=`<div class="app-shell">
    <header class="topbar">
      <button id="backBlocks" class="back-button">←</button>
      <div><div class="brand">Bloques</div><div class="subtle">Planificación por semanas</div></div>
      <button id="newBlockTop" class="header-action">＋</button>
    </header>
    <main class="screen">
      ${blocks.length?blocks.map(block=>{
        const status=blockStatus(block);
        const isActive=active&&active.id===block.id;
        const completedWeeks=Array.from({length:status.total},(_,i)=>blockWeekSessionSummary(block,i+1).adherence>=100).filter(Boolean).length;
        const currentSummary=blockWeekSessionSummary(block,status.week);
        const completion=blockCompletionSummary(block);
        const finished=block.status==="completed"||Boolean(block.completedAt);
        return `<section class="card training-block-card ${isActive?"active-block":""} ${finished?"finished-block":""}">
          <div class="card-heading-row">
            <div>
              <div class="block-title-row"><h2>${esc(block.name)}</h2>${isActive?'<span class="active-pill">Activo</span>':""}${finished?'<span class="finished-pill">Finalizado</span>':""}</div>
              <p class="subtle">${formatBlockDate(block.startDate)} · ${block.weeks} semanas</p>
            </div>
            <button class="icon-button" data-edit-block="${block.id}">✎</button>
          </div>
          <div class="block-metrics">
            <div><span>Semana</span><strong>${status.week}/${status.total}</strong></div>
            <div><span>Objetivo</span><strong>${block.sessionsPerWeek}/sem</strong></div>
            <div><span>Adherencia</span><strong>${completion.adherence}%</strong></div>
          </div>
          <div class="block-session-strip compact">
            ${currentSummary.plan.map((s,i)=>`<span class="${i<currentSummary.matched.length?"done":""}">${i<currentSummary.matched.length?"✓ ":""}${s}</span>`).join("")}
          </div>
          <div class="block-progress-track"><div style="width:${currentSummary.adherence}%"></div></div>
          <p class="subtle block-adherence-label">Adherencia de la semana actual: ${currentSummary.adherence}%</p>
          <div class="settings-actions compact-actions">
            <button class="secondary" data-analytics-block="${block.id}">Estadísticas</button>
            ${!finished&&!isActive?`<button class="primary" data-activate-block="${block.id}">Activar</button>`:""}
            ${finished?`<button class="secondary" data-reopen-block="${block.id}">Reabrir</button>`:`<button class="secondary" data-complete-block="${block.id}">Finalizar</button>`}
            <button class="secondary" data-duplicate-block="${block.id}">Duplicar</button>
            <button class="danger-soft" data-delete-block="${block.id}">Eliminar</button>
          </div>
        </section>`;
      }).join(""):`<section class="card routine-empty"><strong>No hay bloques</strong><p>Crea uno para organizar las próximas semanas.</p></section>`}
      <section class="card"><button id="newBlockBottom" class="primary full">Crear bloque</button></section>
    </main>${nav("settings")}
  </div>`;

  document.getElementById("backBlocks").onclick=()=>{state.screen="settings";renderSettings();};
  const create=()=>{state.editingBlockId=null;state.screen="blockEditor";renderBlockEditor();};
  document.getElementById("newBlockTop").onclick=create;
  document.getElementById("newBlockBottom").onclick=create;

  document.querySelectorAll("[data-edit-block]").forEach(button=>button.onclick=()=>{
    state.editingBlockId=button.dataset.editBlock;
    state.screen="blockEditor";
    renderBlockEditor();
  });
  document.querySelectorAll("[data-activate-block]").forEach(button=>button.onclick=()=>{
    setActiveBlock(button.dataset.activateBlock);
    toast("Bloque activado");
    renderBlocks();
  });
  document.querySelectorAll("[data-duplicate-block]").forEach(button=>button.onclick=()=>{
    const source=blocks.find(x=>x.id===button.dataset.duplicateBlock);
    if(!source) return;
    const copy={...source,id:makeBlockId(),name:`${source.name} (copia)`,createdAt:new Date().toISOString()};
    saveTrainingBlocks([...blocks,copy]);
    toast("Bloque duplicado");
    renderBlocks();
  });
  document.querySelectorAll("[data-analytics-block]").forEach(button=>button.onclick=()=>{
    state.analyticsBlockId=button.dataset.analyticsBlock;
    state.screen="blockAnalytics";
    renderBlockAnalytics();
  });
  document.querySelectorAll("[data-complete-block]").forEach(button=>button.onclick=()=>{
    const block=blocks.find(x=>x.id===button.dataset.completeBlock);
    const summary=blockCompletionSummary(block);
    if(!confirm(`¿Finalizar "${block?.name||"este bloque"}"? Adherencia actual: ${summary.adherence}%.`)) return;
    completeTrainingBlock(button.dataset.completeBlock);
    toast("Bloque finalizado");
    renderBlocks();
  });
  document.querySelectorAll("[data-reopen-block]").forEach(button=>button.onclick=()=>{
    reopenTrainingBlock(button.dataset.reopenBlock);
    toast("Bloque reabierto");
    renderBlocks();
  });
  document.querySelectorAll("[data-delete-block]").forEach(button=>button.onclick=()=>{
    const block=blocks.find(x=>x.id===button.dataset.deleteBlock);
    if(!confirm(`¿Eliminar "${block?.name||"este bloque"}"?`)) return;
    const next=blocks.filter(x=>x.id!==button.dataset.deleteBlock);
    saveTrainingBlocks(next);
    if(localStorage.getItem("gymos:activeBlockId")===button.dataset.deleteBlock) setActiveBlock(null);
    toast("Bloque eliminado");
    renderBlocks();
  });
  bindNav();
}
function renderBlockEditor(){
  const blocks=getTrainingBlocks();
  const existing=blocks.find(x=>x.id===state.editingBlockId);
  const today=new Date().toISOString().slice(0,10);
  const block=existing||{
    name:"Nuevo bloque",
    startDate:today,
    weeks:4,
    sessionsPerWeek:getWeeklyGoal(),
    deloadWeek:4,
    notes:""
  };
  app.innerHTML=`<div class="app-shell">
    <header class="topbar">
      <button id="backBlockEditor" class="back-button">←</button>
      <div><div class="brand">${existing?"Editar bloque":"Nuevo bloque"}</div><div class="subtle">Planificación semanal</div></div>
      <button id="saveBlockTop" class="header-action">✓</button>
    </header>
    <main class="screen">
      <section class="card block-editor-form">
        <label><span>Nombre del bloque</span><input id="blockName" value="${esc(block.name)}" placeholder="Ej. Retorno al gimnasio"></label>
        <label><span>Fecha de inicio</span><input id="blockStart" type="date" value="${block.startDate}"></label>
        <div class="routine-editor-grid">
          <label><span>Duración</span><select id="blockWeeks">
            ${[4,6,8].map(n=>`<option value="${n}" ${Number(block.weeks)===n?"selected":""}>${n} semanas</option>`).join("")}
          </select></label>
          <label><span>Sesiones por semana</span><select id="blockSessions">
            ${[1,2,3,4,5,6,7].map(n=>`<option value="${n}" ${Number(block.sessionsPerWeek)===n?"selected":""}>${n}</option>`).join("")}
          </select></label>
        </div>
        <label><span>Semana de descarga</span><select id="blockDeload">
          <option value="0" ${!block.deloadWeek?"selected":""}>Sin descarga</option>
          ${[4,6,8].map(n=>`<option value="${n}" ${Number(block.deloadWeek)===n?"selected":""}>Semana ${n}</option>`).join("")}
        </select></label>
        <div class="routine-editor-grid deload-settings-grid">
          <label><span>Volumen en descarga</span><select id="blockDeloadVolume">
            ${[40,50,60,70,80].map(n=>`<option value="${n}" ${Number(block.deloadVolumePercent||60)===n?"selected":""}>${n}%</option>`).join("")}
          </select></label>
          <label><span>Intensidad en descarga</span><select id="blockDeloadIntensity">
            ${[60,70,80,90].map(n=>`<option value="${n}" ${Number(block.deloadIntensityPercent||80)===n?"selected":""}>${n}%</option>`).join("")}
          </select></label>
        </div>
        <div class="session-plan-editor">
          <span class="field-label">Orden semanal de sesiones</span>
          <div id="sessionPlanSlots" class="session-plan-slots">
            ${blockSessionPlan(block).map((session,index)=>`<label><span>Día ${index+1}</span><select data-plan-slot="${index}">
              ${activeRoutineSessions().map(item=>`<option value="${esc(item.sessionId)}" ${item.sessionId===session?"selected":""}>${esc(routineSessionRuntimeApi().displayName(item))}</option>`).join("")}
            </select></label>`).join("")}
          </div>
          <p class="subtle">Define el orden previsto. Las sesiones se marcan como completadas al registrarlas.</p>
        </div>
        <label><span>Notas</span><textarea id="blockNotes" rows="4" placeholder="Objetivo, indicaciones o recordatorios">${esc(block.notes||"")}</textarea></label>
        <button id="saveBlockBottom" class="primary full">Guardar bloque</button>
        ${existing?`<button id="openBlockAnalytics" class="secondary full block-finish-button">Ver estadísticas</button>
        <button id="finishBlockFromEditor" class="${block.status==="completed"?"secondary":"danger-soft"} full block-finish-button">
          ${block.status==="completed"?"Reabrir bloque":"Finalizar bloque"}
        </button>`:""}
      </section>
      ${existing?`<section class="card block-summary-card">
        ${(()=>{
          const summary=blockCompletionSummary(block);
          return `<div class="card-heading-row">
            <div><h2>Resumen del bloque</h2><p class="subtle">${summary.totalCompleted} de ${summary.totalPlanned} sesiones</p></div>
            <strong class="summary-score">${summary.adherence}%</strong>
          </div>
          <div class="block-summary-grid">
            <div><span>Semanas completas</span><strong>${summary.completedWeeks}/${block.weeks}</strong></div>
            <div><span>Sesiones hechas</span><strong>${summary.totalCompleted}</strong></div>
            <div><span>Sesiones previstas</span><strong>${summary.totalPlanned}</strong></div>
          </div>`;
        })()}
      </section>
      <section class="card">
        <h2>Progreso semanal</h2>
        <div class="block-week-list">
          ${Array.from({length:Number(block.weeks)},(_,i)=>{
            const week=i+1;
            const summary=blockWeekSessionSummary(block,week);
            const met=summary.adherence>=100;
            return `<div class="block-week-detail ${met?"met":""}">
              <div class="block-week-row">
                <span>Semana ${week}${Number(block.deloadWeek)===week?" · descarga":""}</span>
                <strong>${summary.completed}/${summary.plan.length} · ${summary.adherence}%</strong>
              </div>
              <div class="block-session-strip compact">
                ${summary.plan.map((s,index)=>`<span class="${index<summary.matched.length?"done":""}">${index<summary.matched.length?"✓ ":""}${s}</span>`).join("")}
              </div>
            </div>`;
          }).join("")}
        </div>
      </section>`:""}
    </main>
  </div>`;

  document.getElementById("backBlockEditor").onclick=()=>{state.screen="blocks";renderBlocks();};
  document.getElementById("blockSessions").onchange=()=>{
    const count=Number(document.getElementById("blockSessions").value);
    const container=document.getElementById("sessionPlanSlots");
    container.innerHTML=defaultSessionPlan(count).map((session,index)=>`<label><span>Día ${index+1}</span><select data-plan-slot="${index}">
      ${activeRoutineSessions().map(item=>`<option value="${esc(item.sessionId)}" ${item.sessionId===session?"selected":""}>${esc(routineSessionRuntimeApi().displayName(item))}</option>`).join("")}
    </select></label>`).join("");
  };
  const save=()=>{
    const name=document.getElementById("blockName").value.trim();
    const startDate=document.getElementById("blockStart").value;
    if(!name){toast("Escribe un nombre para el bloque.");return;}
    if(!startDate){toast("Selecciona una fecha de inicio.");return;}
    const weeks=Number(document.getElementById("blockWeeks").value);
    let deloadWeek=Number(document.getElementById("blockDeload").value);
    if(deloadWeek>weeks) deloadWeek=weeks;
    const value={
      id:existing?.id||makeBlockId(),
      name,
      startDate,
      weeks,
      sessionsPerWeek:Number(document.getElementById("blockSessions").value),
      sessionPlan:[...document.querySelectorAll("[data-plan-slot]")].map(select=>select.value),
      deloadWeek,
      deloadVolumePercent:Number(document.getElementById("blockDeloadVolume").value),
      deloadIntensityPercent:Number(document.getElementById("blockDeloadIntensity").value),
      notes:document.getElementById("blockNotes").value.trim(),
      createdAt:existing?.createdAt||new Date().toISOString(),
      updatedAt:new Date().toISOString()
    };
    const next=existing?blocks.map(x=>x.id===existing.id?value:x):[...blocks,value];
    saveTrainingBlocks(next);
    if(!getActiveBlock()) setActiveBlock(value.id);
    toast("Bloque guardado");
    state.screen="blocks";
    renderBlocks();
  };
  document.getElementById("saveBlockTop").onclick=save;
  document.getElementById("saveBlockBottom").onclick=save;
  const analyticsButton=document.getElementById("openBlockAnalytics");
  if(analyticsButton) analyticsButton.onclick=()=>{
    state.analyticsBlockId=block.id;
    state.screen="blockAnalytics";
    renderBlockAnalytics();
  };
  const finishButton=document.getElementById("finishBlockFromEditor");
  if(finishButton) finishButton.onclick=()=>{
    if(block.status==="completed"){
      reopenTrainingBlock(block.id);
      toast("Bloque reabierto");
    }else{
      const summary=blockCompletionSummary(block);
      if(!confirm(`¿Finalizar este bloque? Adherencia actual: ${summary.adherence}%.`)) return;
      completeTrainingBlock(block.id);
      toast("Bloque finalizado");
    }
    state.screen="blocks";
    renderBlocks();
  };
}


function renderBlockAnalytics(){
  const block=getTrainingBlocks().find(item=>item.id===state.analyticsBlockId);
  if(!block){
    state.screen="blocks";
    renderBlocks();
    return;
  }
  const data=blockAnalytics(block);
  const maxVolume=Math.max(1,...data.weekly.map(w=>w.volume));
  const maxWorkouts=Math.max(1,...data.weekly.map(w=>w.workouts));

  app.innerHTML=`<div class="app-shell">
    <header class="topbar">
      <button id="backBlockAnalytics" class="back-button">←</button>
      <div><div class="brand">Estadísticas</div><div class="subtle">${esc(block.name)}</div></div>
      <button id="exportBlockSummary" class="header-action">⇩</button>
    </header>
    <main class="screen">
      <section class="card analytics-hero">
        <div>
          <span class="analytics-label">Adherencia total</span>
          <strong class="analytics-main-score">${data.adherence}%</strong>
        </div>
        <div class="block-progress-track"><div style="width:${data.adherence}%"></div></div>
        <p class="subtle">${data.totalCompleted} de ${data.totalPlanned} sesiones previstas</p>
      </section>

      <section class="analytics-grid">
        <article class="card analytics-kpi"><span>Entrenamientos</span><strong>${data.workouts}</strong></article>
        <article class="card analytics-kpi"><span>Volumen</span><strong>${formatVolume(data.totalVolume)}</strong></article>
        <article class="card analytics-kpi"><span>Tiempo total</span><strong>${data.totalMinutes} min</strong></article>
        <article class="card analytics-kpi"><span>Duración media</span><strong>${data.avgMinutes} min</strong></article>
      </section>

      <section class="card">
        <div class="card-heading-row">
          <div><h2>Adherencia semanal</h2><p class="subtle">Sesiones realizadas frente a las previstas</p></div>
        </div>
        <div class="weekly-bars">
          ${data.weekly.map(week=>`<div class="weekly-bar-row">
            <span>S${week.week}${isDeloadWeek(block,week.week)?" · descarga":""}</span>
            <div class="weekly-bar-track"><div style="width:${week.adherence}%"></div></div>
            <strong>${week.adherence}%</strong>
          </div>`).join("")}
        </div>
      </section>

      <section class="card">
        <h2>Volumen semanal</h2>
        <div class="mini-chart">
          ${data.weekly.map(week=>`<div class="mini-chart-column">
            <div class="mini-chart-value">${week.volume?formatVolume(week.volume):"—"}</div>
            <div class="mini-chart-bar-wrap"><div class="mini-chart-bar" style="height:${Math.max(4,Math.round((week.volume/maxVolume)*100))}%"></div></div>
            <span>S${week.week}</span>
          </div>`).join("")}
        </div>
      </section>

      <section class="card">
        <h2>Entrenamientos por sesión</h2>
        <div class="session-stat-list">
          ${data.bySession.map(item=>`<div>
            <span>${esc(item.name)}</span>
            <div class="weekly-bar-track"><div style="width:${Math.round((item.count/maxWorkouts)*100)}%"></div></div>
            <strong>${item.count}</strong>
          </div>`).join("")}
        </div>
      </section>

      <section class="card">
        <h2>Mejores series registradas</h2>
        ${data.bestSets.length?`<div class="best-set-list">
          ${data.bestSets.slice(0,5).map((set,index)=>`<div>
            <span>${index+1}</span>
            <div><strong>${esc(set.exercise)}</strong><small>${set.weight.toLocaleString("es-ES")} kg × ${set.reps} reps</small></div>
          </div>`).join("")}
        </div>`:`<p class="subtle">Todavía no hay series con peso y repeticiones registradas.</p>`}
      </section>
    </main>
  </div>`;

  document.getElementById("backBlockAnalytics").onclick=()=>{state.screen="blocks";renderBlocks();};
  document.getElementById("exportBlockSummary").onclick=()=>{
    const exportData={
      gymosVersion:"2.3.3",
      exportedAt:new Date().toISOString(),
      block,
      analytics:data
    };
    const blob=new Blob([JSON.stringify(exportData,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;
    link.download=`gymos-bloque-${block.name.toLowerCase().replace(/[^a-z0-9]+/gi,"-")}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast("Resumen exportado");
  };
}


function renderGlobalAnalytics(){
  const data=globalTrainingAnalytics();
  const maxCategory=Math.max(1,...data.categories.map(x=>x.volume));

  app.innerHTML=`<div class="app-shell">
    <header class="topbar">
      <button id="backGlobalAnalytics" class="back-button">←</button>
      <div><div class="brand">Análisis global</div><div class="subtle">Volumen, progreso y estancamientos</div></div>
      <span></span>
    </header>
    <main class="screen">
      <section class="analytics-grid">
        <article class="card analytics-kpi"><span>Entrenamientos</span><strong>${data.workouts}</strong></article>
        <article class="card analytics-kpi"><span>Volumen total</span><strong>${formatVolume(data.totalVolume)}</strong></article>
        <article class="card analytics-kpi"><span>Series registradas</span><strong>${data.totalSets}</strong></article>
        <article class="card analytics-kpi"><span>Ejercicios activos</span><strong>${data.activeExercises}</strong></article>
      </section>

      <section class="card">
        <div class="card-heading-row">
          <div><h2>Estado del progreso</h2><p class="subtle">Comparación de las últimas series con las anteriores</p></div>
        </div>
        <div class="progress-status-grid">
          <div><span>Progresando</span><strong>${data.progressing}</strong></div>
          <div><span>Estancados</span><strong>${data.stagnating}</strong></div>
          <div><span>Con datos</span><strong>${data.exercises.filter(x=>x.sets>=4).length}</strong></div>
        </div>
      </section>

      <section class="card">
        <h2>Volumen por categoría</h2>
        ${data.categories.length?`<div class="category-volume-list">
          ${data.categories.map(item=>`<div>
            <div class="category-volume-header"><span>${esc(item.name)}</span><strong>${formatVolume(item.volume)}</strong></div>
            <div class="weekly-bar-track"><div style="width:${Math.round((item.volume/maxCategory)*100)}%"></div></div>
            <small>${item.sets} series · ${item.exercises} ejercicios</small>
          </div>`).join("")}
        </div>`:`<p class="subtle">Registra entrenamientos para generar el análisis.</p>`}
      </section>

      <section class="card">
        <div class="card-heading-row">
          <div><h2>Ejercicios</h2><p class="subtle">Ordenados por volumen acumulado</p></div>
        </div>
        ${data.exercises.length?`<div class="exercise-analysis-list">
          ${data.exercises.map(exercise=>`<button data-analysis-exercise="${esc(exercise.key)}" class="exercise-analysis-row">
            <div>
              <strong>${esc(exercise.name)}</strong>
              <span>${esc(exercise.type)} · ${exercise.sessions} sesiones · ${exercise.sets} series</span>
            </div>
            <div class="exercise-analysis-right">
              <strong>${formatVolume(exercise.totalVolume)}</strong>
              <span class="analysis-status ${exercise.stagnating?"warning":exercise.status==="Progresando"?"positive":""}">
                ${exercise.stagnating?"Posible estancamiento":exercise.status}
              </span>
            </div>
          </button>`).join("")}
        </div>`:`<p class="subtle">Todavía no hay ejercicios con datos suficientes.</p>`}
      </section>
    </main>${nav("settings")}
  </div>`;

  document.getElementById("backGlobalAnalytics").onclick=()=>{state.screen="settings";renderSettings();};
  document.querySelectorAll("[data-analysis-exercise]").forEach(button=>button.onclick=()=>{
    state.selectedAnalysisExercise=button.dataset.analysisExercise;
    state.screen="exerciseAnalytics";
    renderExerciseAnalytics();
  });
  bindNav();
}
function renderExerciseAnalytics(){
  const exercise=exerciseAnalytics().find(item=>item.key===state.selectedAnalysisExercise);
  if(!exercise){
    state.screen="globalAnalytics";
    renderGlobalAnalytics();
    return;
  }
  const rows=exercise.rows;
  const maxE1rm=Math.max(1,...rows.map(r=>r.e1rm));
  const recent=rows.slice(-12);

  app.innerHTML=`<div class="app-shell">
    <header class="topbar">
      <button id="backExerciseAnalytics" class="back-button">←</button>
      <div><div class="brand">${esc(exercise.name)}</div><div class="subtle">${esc(exercise.type)}</div></div>
      <span></span>
    </header>
    <main class="screen">
      <section class="analytics-grid">
        <article class="card analytics-kpi"><span>Mejor peso</span><strong>${exercise.bestWeight.toLocaleString("es-ES")} kg</strong></article>
        <article class="card analytics-kpi"><span>1RM estimado</span><strong>${Math.round(exercise.bestE1rm*10)/10} kg</strong></article>
        <article class="card analytics-kpi"><span>Volumen total</span><strong>${formatVolume(exercise.totalVolume)}</strong></article>
        <article class="card analytics-kpi"><span>Cambio reciente</span><strong>${trendLabel(exercise.recentChange)}</strong></article>
      </section>

      <section class="card">
        <div class="card-heading-row">
          <div><h2>Evaluación</h2><p class="subtle">Señal orientativa basada en las últimas series</p></div>
          <span class="analysis-status ${exercise.stagnating?"warning":exercise.status==="Progresando"?"positive":""}">
            ${exercise.stagnating?"Posible estancamiento":exercise.status}
          </span>
        </div>
        <p class="analysis-explanation">${
          exercise.stagnating
            ?"El rendimiento estimado apenas ha cambiado en las últimas series. Revisa técnica, recuperación, repeticiones objetivo y progresión de carga antes de modificar la rutina."
            :exercise.status==="Progresando"
              ?"Las últimas series muestran una mejora respecto al periodo anterior."
              :"Todavía no hay una señal clara de progreso o retroceso."
        }</p>
      </section>

      <section class="card">
        <h2>Tendencia de fuerza estimada</h2>
        <div class="strength-chart">
          ${recent.map(row=>`<div class="strength-chart-column">
            <div class="strength-chart-value">${Math.round(row.e1rm)} kg</div>
            <div class="strength-chart-bar-wrap"><div class="strength-chart-bar" style="height:${Math.max(5,Math.round((row.e1rm/maxE1rm)*100))}%"></div></div>
            <span>${row.date.toLocaleDateString("es-ES",{day:"2-digit",month:"2-digit"})}</span>
          </div>`).join("")}
        </div>
      </section>

      <section class="card">
        <h2>Últimas series</h2>
        <div class="recent-set-list">
          ${rows.slice(-10).reverse().map(row=>`<div>
            <div><strong>${row.weight.toLocaleString("es-ES")} kg × ${row.reps}</strong><span>${row.date.toLocaleDateString("es-ES")}</span></div>
            <span>1RM est. ${Math.round(row.e1rm*10)/10} kg</span>
          </div>`).join("")}
        </div>
      </section>
    </main>
  </div>`;

  document.getElementById("backExerciseAnalytics").onclick=()=>{state.screen="globalAnalytics";renderGlobalAnalytics();};
}


function renderSubstitutionHistory(){
  const history=getExerciseSubstitutions();
  app.innerHTML=`<div class="app-shell">
    <header class="topbar">
      <button id="backSubstitutionHistory" class="back-button">←</button>
      <div><div class="brand">Sustituciones</div><div class="subtle">Historial de cambios</div></div>
      <span></span>
    </header>
    <main class="screen">
      <section class="card">
        <div class="card-heading-row">
          <div><h2>Historial</h2><p class="subtle">${history.length} sustituciones registradas</p></div>
          ${history.length?'<button id="clearSubstitutionHistory" class="danger-soft small-button">Borrar</button>':""}
        </div>
        <div class="substitution-history-list">
          ${history.length?history.map(item=>`<article>
            <div><strong>${esc(item.from)} → ${esc(item.to)}</strong><span>Sesión ${esc(item.session)} · ${new Date(item.date).toLocaleDateString("es-ES")}</span></div>
            <span>${esc(item.reason||"Sin motivo indicado")}</span>
          </article>`).join(""):`<div class="routine-empty"><strong>Sin sustituciones</strong><p>Los cambios aparecerán aquí.</p></div>`}
        </div>
      </section>
    </main>
  </div>`;
  document.getElementById("backSubstitutionHistory").onclick=()=>{state.screen="settings";renderSettings();};
  const clear=document.getElementById("clearSubstitutionHistory");
  if(clear) clear.onclick=()=>{
    if(!confirm("¿Borrar todo el historial de sustituciones?")) return;
    saveExerciseSubstitutions([]);
    toast("Historial eliminado");
    renderSubstitutionHistory();
  };
}






function renderHealth(){
  const settings=getHealthSettings();
  const entry=healthEntryForDate(state.healthDate);
  const recovery=recoveryAssessment(state.healthDate);
  const weekly=weeklyHealthSummary();
  const imports=getHealthImports().slice().reverse().slice(0,5);

  app.innerHTML=`<div class="app-shell">
    <header class="topbar">
      <button id="backHealth" class="back-button">←</button>
      <div><div class="brand">Salud y recuperación</div><div class="subtle">Sueño, actividad y reloj</div></div>
      <input id="healthDate" class="header-date" type="date" value="${esc(state.healthDate)}">
    </header>
    <main class="screen">
      <section class="card recovery-hero recovery-${recovery.status.toLowerCase()}">
        <div class="health-score-ring" style="--score:${recovery.score}">
          <strong>${recovery.score}</strong><span>/100</span>
        </div>
        <div>
          <span class="section-kicker">RECUPERACIÓN ${esc(recovery.status.toUpperCase())}</span>
          <h1>${esc(recovery.recommendation)}</h1>
          <p>${recovery.reasons.length?recovery.reasons.map(esc).join(" · "):"No se han detectado señales negativas."}</p>
        </div>
      </section>

      <section class="card">
        <h2>Registro diario</h2>
        <div class="health-input-grid">
          <label><span>Pasos</span><input id="healthSteps" type="number" min="0" value="${esc(entry.steps)}"></label>
          <label><span>Sueño (horas)</span><input id="healthSleepHours" type="number" min="0" max="24" step="0.1" value="${esc(entry.sleepHours)}"></label>
          <label><span>Puntuación de sueño</span><input id="healthSleepScore" type="number" min="0" max="100" value="${esc(entry.sleepScore)}"></label>
          <label><span>FC en reposo (bpm)</span><input id="healthRestingHr" type="number" min="20" max="220" value="${esc(entry.restingHr)}"></label>
          <label><span>HRV (ms)</span><input id="healthHrv" type="number" min="0" value="${esc(entry.hrv)}"></label>
          <label><span>Calorías activas</span><input id="healthActiveCalories" type="number" min="0" value="${esc(entry.activeCalories)}"></label>
        </div>
        <label><span>Notas</span><textarea id="healthNotes" rows="3" placeholder="Estrés, enfermedad, sensaciones...">${esc(entry.notes)}</textarea></label>
        <button id="saveHealthEntry" class="primary full">Guardar datos</button>
      </section>

      <section class="card">
        <h2>Resumen de los últimos 7 días</h2>
        <div class="health-week-grid">
          <article><span>Días</span><strong>${weekly.days}</strong></article>
          <article><span>Sueño</span><strong>${weekly.sleep?weekly.sleep.toFixed(1)+" h":"—"}</strong></article>
          <article><span>Pasos</span><strong>${weekly.steps?Math.round(weekly.steps).toLocaleString("es-ES"):"—"}</strong></article>
          <article><span>FC reposo</span><strong>${weekly.restingHr?Math.round(weekly.restingHr)+" bpm":"—"}</strong></article>
          <article><span>HRV</span><strong>${weekly.hrv?Math.round(weekly.hrv)+" ms":"—"}</strong></article>
          <article><span>Cal. activas</span><strong>${weekly.activeCalories?Math.round(weekly.activeCalories):"—"}</strong></article>
        </div>
      </section>

      <section class="card">
        <div class="card-heading-row">
          <div><h2>Importar datos del reloj</h2><p class="subtle">Compatible por ahora con CSV. La conexión directa se añadirá en versiones posteriores.</p></div>
          <span class="mode-pill">CSV</span>
        </div>
        <input id="healthCsvFile" type="file" accept=".csv,text/csv">
        <div class="health-template-note">
          Columnas admitidas: fecha/date, pasos/steps, sleep_hours, sleep_score, resting_hr, HRV y active_calories.
        </div>
        ${imports.length?`<div class="health-import-list">${imports.map(item=>`<div><span>${esc(item.filename)}</span><strong>${item.rows} filas</strong><small>${new Date(item.createdAt).toLocaleString("es-ES")}</small></div>`).join("")}</div>`:""}
      </section>

      <section class="card">
        <h2>Conectores</h2>
        <div class="connector-grid">
          <article class="connector-card ready"><strong>CSV universal</strong><span>Disponible</span><small>Exportaciones de Garmin, Fitbit, Samsung Health y otros.</small></article>
          <article class="connector-card planned"><strong>Health Connect</strong><span>Preparado</span><small>Requerirá una aplicación Android nativa.</small></article>
          <article class="connector-card planned"><strong>Garmin Connect</strong><span>Planificado</span><small>Requiere acceso a la API y backend.</small></article>
          <article class="connector-card planned"><strong>Apple Health</strong><span>Planificado</span><small>Requerirá una aplicación iOS.</small></article>
        </div>
      </section>

      <section class="card">
        <h2>Objetivos y baseline</h2>
        <div class="health-input-grid">
          <label><span>Objetivo de sueño</span><input id="healthSleepTarget" type="number" min="4" max="12" step="0.25" value="${Number(settings.sleepTarget)}"></label>
          <label><span>Objetivo de pasos</span><input id="healthStepTarget" type="number" min="0" value="${Number(settings.stepTarget)}"></label>
          <label><span>FC reposo baseline</span><input id="healthRestingBaseline" type="number" min="20" max="220" value="${esc(settings.restingHrBaseline)}" placeholder="Automático"></label>
          <label><span>HRV baseline</span><input id="healthHrvBaseline" type="number" min="0" value="${esc(settings.hrvBaseline)}" placeholder="Automático"></label>
        </div>
        <button id="saveHealthSettings" class="secondary full">Guardar objetivos</button>
      </section>

      <section class="card warning-card">
        <h2>Uso responsable</h2>
        <p>La puntuación es una orientación basada en tus propios registros. No diagnostica enfermedades ni sustituye una valoración médica.</p>
      </section>
    </main>
  </div>`;

  document.getElementById("backHealth").onclick=()=>{state.screen="settings";renderSettings();};
  document.getElementById("healthDate").onchange=e=>{state.healthDate=e.target.value;renderHealth();};
  document.getElementById("saveHealthEntry").onclick=()=>{
    upsertHealthEntry({
      date:state.healthDate,
      steps:document.getElementById("healthSteps").value,
      sleepHours:document.getElementById("healthSleepHours").value,
      sleepScore:document.getElementById("healthSleepScore").value,
      restingHr:document.getElementById("healthRestingHr").value,
      hrv:document.getElementById("healthHrv").value,
      activeCalories:document.getElementById("healthActiveCalories").value,
      notes:document.getElementById("healthNotes").value.trim(),
      source:"manual"
    });
    toast("Datos de salud guardados");
    renderHealth();
  };
  document.getElementById("saveHealthSettings").onclick=()=>{
    saveHealthSettings({
      sleepTarget:Number(document.getElementById("healthSleepTarget").value||8),
      stepTarget:Number(document.getElementById("healthStepTarget").value||8000),
      restingHrBaseline:document.getElementById("healthRestingBaseline").value,
      hrvBaseline:document.getElementById("healthHrvBaseline").value
    });
    toast("Objetivos de salud guardados");
    renderHealth();
  };
  document.getElementById("healthCsvFile").onchange=async e=>{
    const file=e.target.files?.[0];
    if(!file) return;
    try{
      const rows=parseHealthCsv(await file.text(),file.name);
      addDeveloperLog("success",`Importación de salud completada: ${rows} filas`);
      toast(`${rows} registros importados`);
      renderHealth();
    }catch(error){
      addDeveloperLog("error","Error importando datos de salud",error.message);
      toast(error.message||"No se pudo importar el archivo de salud.");
    }
  };
}

function renderNutritionLegacy(){
  const settings=getNutritionSettings();
  const entry=nutritionEntryForDate(state.nutritionDate);
  const weekly=nutritionWeeklySummary();
  const assessment=bodyCompositionAssessment();
  const professionalPlans=window.GymOSProfessionalNutrition?.getPlans?.()||[];

  app.innerHTML=`<div class="app-shell">
    <header class="topbar">
      <button id="backNutrition" class="back-button">←</button>
      <div><div class="brand">Nutrición</div><div class="subtle">Macros y composición corporal</div></div>
      <input id="nutritionDate" class="header-date" type="date" value="${esc(state.nutritionDate)}">
    </header>
    <main class="screen">
      <section class="card nutrition-hero">
        <div class="card-heading-row">
          <div><h1>${esc(settings.goal)}</h1><p>${esc(assessment.message)}</p></div>
          <span class="nutrition-status">${esc(assessment.status)}</span>
        </div>
        <div class="nutrition-target-grid">
          <article><span>Calorías</span><strong>${Number(settings.calories).toLocaleString("es-ES")}</strong></article>
          <article><span>Proteína</span><strong>${Number(settings.protein)} g</strong></article>
          <article><span>Carbohidratos</span><strong>${Number(settings.carbs)} g</strong></article>
          <article><span>Grasa</span><strong>${Number(settings.fat)} g</strong></article>
        </div>
      </section>

      <section class="card">
        <h2>Registro diario</h2>
        <div class="nutrition-input-grid">
          <label><span>Calorías</span><input id="nutritionCalories" type="number" min="0" value="${esc(entry.calories)}"></label>
          <label><span>Proteína (g)</span><input id="nutritionProtein" type="number" min="0" value="${esc(entry.protein)}"></label>
          <label><span>Carbohidratos (g)</span><input id="nutritionCarbs" type="number" min="0" value="${esc(entry.carbs)}"></label>
          <label><span>Grasa (g)</span><input id="nutritionFat" type="number" min="0" value="${esc(entry.fat)}"></label>
          <label><span>Agua (L)</span><input id="nutritionWater" type="number" min="0" step="0.1" value="${esc(entry.water)}"></label>
          <label><span>Pasos</span><input id="nutritionSteps" type="number" min="0" value="${esc(entry.steps)}"></label>
        </div>
        <label><span>Notas</span><textarea id="nutritionNotes" rows="3" placeholder="Hambre, energía, comidas libres...">${esc(entry.notes)}</textarea></label>
        <button id="saveNutritionEntry" class="primary full">Guardar día</button>
      </section>

      <section class="card">
        <h2>Objetivos diarios</h2>
        ${[
          ["Calorías",entry.calories,settings.calories,"kcal"],
          ["Proteína",entry.protein,settings.protein,"g"],
          ["Carbohidratos",entry.carbs,settings.carbs,"g"],
          ["Grasa",entry.fat,settings.fat,"g"]
        ].map(([label,value,target,unit])=>`<div class="nutrition-progress-row">
          <div><span>${label}</span><strong>${Number(value||0).toLocaleString("es-ES")} / ${Number(target).toLocaleString("es-ES")} ${unit}</strong></div>
          <div class="nutrition-progress"><span style="width:${nutritionProgress(value,target)}%"></span></div>
        </div>`).join("")}
      </section>

      <section class="card">
        <h2>Promedio de los últimos 7 días</h2>
        <div class="nutrition-week-grid">
          <article><span>Días registrados</span><strong>${weekly.days}</strong></article>
          <article><span>Calorías</span><strong>${weekly.calories?Math.round(weekly.calories).toLocaleString("es-ES"):"—"}</strong></article>
          <article><span>Proteína</span><strong>${weekly.protein?Math.round(weekly.protein)+" g":"—"}</strong></article>
          <article><span>Pasos</span><strong>${weekly.steps?Math.round(weekly.steps).toLocaleString("es-ES"):"—"}</strong></article>
        </div>
      </section>

      <section class="card" id="nutritionDailyRecord">
        <h2>Configurar objetivo</h2>
        <label><span>Fase actual</span>
          <select id="nutritionGoal">
            ${["Definición","Mantenimiento","Volumen"].map(goal=>`<option ${settings.goal===goal?"selected":""}>${goal}</option>`).join("")}
          </select>
        </label>
        <div class="nutrition-input-grid">
          <label><span>Calorías</span><input id="nutritionTargetCalories" type="number" min="1000" value="${Number(settings.calories)}"></label>
          <label><span>Proteína (g)</span><input id="nutritionTargetProtein" type="number" min="0" value="${Number(settings.protein)}"></label>
          <label><span>Carbohidratos (g)</span><input id="nutritionTargetCarbs" type="number" min="0" value="${Number(settings.carbs)}"></label>
          <label><span>Grasa (g)</span><input id="nutritionTargetFat" type="number" min="0" value="${Number(settings.fat)}"></label>
          <label><span>Objetivo kg/semana</span><input id="nutritionWeeklyTarget" type="number" step="0.05" value="${Number(settings.weeklyTarget)}"></label>
        </div>
        <button id="saveNutritionSettings" class="secondary full">Guardar objetivos</button>
      </section>

      <section class="card professional-history-entry">
        <div class="card-heading-row">
          <div><span class="section-kicker">ARCHIVO HISTÓRICO</span><h2>Planificaciones profesionales</h2>
          <p>Conserva planes anteriores y adapta cantidades sin modificar tu objetivo actual.</p></div>
          <strong>${professionalPlans.length}</strong>
        </div>
        <button id="openProfessionalNutrition" class="secondary full">${professionalPlans.length?"Ver planificaciones":"Importar planificación"}</button>
      </section>

      <section class="card warning-card">
        <h2>Interpretación</h2>
        <p>GymOS compara el promedio registrado con tu tendencia de peso, pero no sustituye una valoración sanitaria o nutricional profesional.</p>
      </section>
    </main>
  </div>`;

  document.getElementById("backNutrition").onclick=()=>{state.screen="settings";renderSettings();};
  document.getElementById("nutritionDate").onchange=e=>{
    state.nutritionDate=e.target.value;
    renderNutrition();
  };
  document.getElementById("saveNutritionEntry").onclick=()=>{
    upsertNutritionEntry({
      date:state.nutritionDate,
      calories:document.getElementById("nutritionCalories").value,
      protein:document.getElementById("nutritionProtein").value,
      carbs:document.getElementById("nutritionCarbs").value,
      fat:document.getElementById("nutritionFat").value,
      water:document.getElementById("nutritionWater").value,
      steps:document.getElementById("nutritionSteps").value,
      notes:document.getElementById("nutritionNotes").value.trim()
    });
    toast("Registro nutricional guardado");
    renderNutrition();
  };
  document.getElementById("saveNutritionSettings").onclick=()=>{
    saveNutritionSettings({
      goal:document.getElementById("nutritionGoal").value,
      calories:Number(document.getElementById("nutritionTargetCalories").value||0),
      protein:Number(document.getElementById("nutritionTargetProtein").value||0),
      carbs:Number(document.getElementById("nutritionTargetCarbs").value||0),
      fat:Number(document.getElementById("nutritionTargetFat").value||0),
      weeklyTarget:Number(document.getElementById("nutritionWeeklyTarget").value||0)
    });
    toast("Objetivos nutricionales guardados");
    renderNutrition();
  };
  document.getElementById("openProfessionalNutrition").onclick=()=>{
    state.screen="professionalNutrition";
    window.GymOSProfessionalNutrition.renderLibrary();
  };
  const professionalFile=document.getElementById("professionalNutritionFile");
  professionalFile.onchange=async event=>{
    const file=event.target.files?.[0];
    event.target.value="";
    if(!file) return;
    try{
      await window.GymOSProfessionalNutrition.handleFileSelection(file);
    }catch(error){
      console.error("Professional nutrition import",error);
      toast(error.message||"No se pudo importar la planificación.");
    }
  };
}

function nutritionCalculatorDefaults(){
  const profile=getOnboardingProfile()||{};
  const current=getNutritionSettings();
  const latestWeight=bodyMetricSummary("weight","kg")?.value;
  const days=Number(profile.days||3);
  const activity=days>=5?"high":days>=3?"moderate":"light";
  return {
    sex:current.inputs?.sex||profile.sex||"",
    age:current.inputs?.age||profile.age||"",
    height:current.inputs?.height||profile.height||"",
    weight:latestWeight||current.inputs?.weight||profile.weight||"",
    activity:current.inputs?.activity||activity,
    trainingDays:current.inputs?.trainingDays??days,
    goal:current.goal||"Mantenimiento",
    weeklyRate:Math.abs(Number(current.weeklyTarget||0))||0
  };
}
function nutritionRateOptions(goal,current=0){
  const values=goal==="Definición"?[.25,.5,.75]:goal==="Volumen"?[.1,.25,.5]:[0];
  return values.map(value=>`<option value="${value}" ${Number(current)===value?"selected":""}>${goal==="Definición"?"Perder":goal==="Volumen"?"Ganar":"Mantener"} ${value?String(value).replace(".",",")+" kg":"peso"}</option>`).join("");
}
function nutritionRemaining(settings,entry){
  return {
    calories:Math.max(0,Number(settings.calories||0)-Number(entry.calories||0)),
    protein:Math.max(0,Number(settings.protein||0)-Number(entry.protein||0)),
    carbs:Math.max(0,Number(settings.carbs||0)-Number(entry.carbs||0)),
    fat:Math.max(0,Number(settings.fat||0)-Number(entry.fat||0))
  };
}
function renderNutritionCalculation(settings){
  if(!hasNutritionTargets(settings)||settings.source!=="gymos") return "";
  const inputs=settings.inputs||{};
  const date=settings.calculatedAt?new Date(settings.calculatedAt).toLocaleDateString("es-ES",{day:"numeric",month:"long",year:"numeric"}):"Sin fecha";
  return `<section class="card nutrition-transparency">
    <div class="card-heading-row"><div><span class="section-kicker">CALCULADO POR GYMOS</span><h2>Cómo se ha calculado</h2><p>${esc(date)}</p></div><button id="toggleNutritionCalculation" class="text-button">${state.nutritionCalculationExpanded?"Ocultar":"Ver cálculo"} →</button></div>
    ${state.nutritionCalculationExpanded?`<div class="nutrition-calculation-detail">
      <dl>
        <div><dt>Datos utilizados</dt><dd>${inputs.weight} kg · ${inputs.height} cm · ${inputs.age} años · ${esc(inputs.activityLabel||inputs.activity)} · ${inputs.trainingDays} entrenamientos</dd></div>
        <div><dt>BMR</dt><dd>${settings.bmr.toLocaleString("es-ES")} kcal · metabolismo basal con Mifflin-St Jeor</dd></div>
        <div><dt>TDEE</dt><dd>${settings.tdee.toLocaleString("es-ES")} kcal · BMR × factor de actividad ${inputs.effectiveFactor}</dd></div>
        <div><dt>${settings.dailyAdjustment<0?"Déficit":settings.dailyAdjustment>0?"Superávit":"Ajuste"}</dt><dd>${settings.dailyAdjustment>0?"+":""}${settings.dailyAdjustment} kcal/día según el ritmo semanal</dd></div>
        <div><dt>Macros</dt><dd>Proteína por kg, grasa mínima y carbohidratos con las calorías restantes.</dd></div>
      </dl>
    </div>`:""}
  </section>`;
}
function renderNutritionCalculator(){
  const defaults=state.nutritionPreview?.inputs||nutritionCalculatorDefaults();
  const preview=state.nutritionPreview;
  return `<section class="card nutrition-calculator-card">
    <span class="section-kicker">NECESIDADES PERSONALES</span><h2>Calcular mis necesidades</h2>
    <p class="subtle">La vista previa no se aplicará hasta que la confirmes.</p>
    <div class="nutrition-calculator-grid">
      <label><span>Sexo para la fórmula</span><select id="nutritionCalcSex"><option value="">Seleccionar</option><option value="male" ${defaults.sex==="male"?"selected":""}>Hombre</option><option value="female" ${defaults.sex==="female"?"selected":""}>Mujer</option></select></label>
      <label><span>Edad</span><input id="nutritionCalcAge" type="number" min="14" max="100" value="${esc(defaults.age)}"></label>
      <label><span>Altura (cm)</span><input id="nutritionCalcHeight" type="number" min="120" max="230" value="${esc(defaults.height)}"></label>
      <label><span>Peso (kg)</span><input id="nutritionCalcWeight" type="number" min="35" max="350" step=".1" value="${esc(defaults.weight)}"></label>
      <label><span>Actividad</span><select id="nutritionCalcActivity">${Object.entries(window.GymOSNutritionEngine.activityFactors).map(([key,item])=>`<option value="${key}" ${defaults.activity===key?"selected":""}>${esc(item.label)}</option>`).join("")}</select></label>
      <label><span>Entrenamientos semanales</span><input id="nutritionCalcTrainingDays" type="number" min="0" max="7" value="${esc(defaults.trainingDays)}"></label>
      <label><span>Objetivo</span><select id="nutritionCalcGoal">${["Definición","Mantenimiento","Volumen"].map(goal=>`<option ${defaults.goal===goal?"selected":""}>${goal}</option>`).join("")}</select></label>
      <label><span>Ritmo semanal</span><select id="nutritionCalcRate">${nutritionRateOptions(defaults.goal,defaults.weeklyRate)}</select></label>
    </div>
    <p id="nutritionCalculatorMessage" class="inline-message hidden" role="alert"></p>
    <button id="previewNutritionNeeds" class="secondary full">Calcular vista previa</button>
    ${preview?`<div class="nutrition-preview">
      <div><span>Metabolismo basal</span><strong>${preview.bmr.toLocaleString("es-ES")} kcal</strong></div>
      <div><span>Gasto energético</span><strong>${preview.tdee.toLocaleString("es-ES")} kcal</strong></div>
      <div><span>Objetivo</span><strong>${preview.calories.toLocaleString("es-ES")} kcal</strong></div>
      <div><span>Proteína</span><strong>${preview.protein} g</strong></div>
      <div><span>Grasa</span><strong>${preview.fat} g</strong></div>
      <div><span>Carbohidratos</span><strong>${preview.carbs} g</strong></div>
      <div><span>Fibra</span><strong>${preview.fiber} g</strong></div>
      <p>${preview.dailyAdjustment<0?"Déficit":preview.dailyAdjustment>0?"Superávit":"Sin ajuste energético"}: ${preview.dailyAdjustment>0?"+":""}${preview.dailyAdjustment} kcal/día.</p>
      <button id="applyNutritionPreview" class="primary full">Aplicar estos objetivos</button>
    </div>`:""}
  </section>`;
}
function renderSmartRecipes(settings,entry){
  if(!hasNutritionTargets(settings)) return "";
  const remaining=nutritionRemaining(settings,entry);
  const suggestions=state.nutritionRecipeSuggestions||[];
  const shopping=window.GymOSNutritionEngine.shoppingList(suggestions);
  return `<section class="card smart-recipes">
    <div class="card-heading-row"><div><span class="section-kicker">RECETAS</span><h2>Recetas inteligentes</h2><p>Calculadas con lo que te queda hoy.</p></div></div>
    <div class="remaining-macros"><span>${remaining.calories} kcal</span><span>P ${remaining.protein} g</span><span>C ${remaining.carbs} g</span><span>G ${remaining.fat} g</span></div>
    <div class="recipe-controls"><select id="nutritionRecipeType">${["desayuno","comida","cena","snack","preentreno","postentreno"].map(type=>`<option value="${type}" ${state.nutritionRecipeType===type?"selected":""}>${type.charAt(0).toLocaleUpperCase("es")+type.slice(1)}</option>`).join("")}</select><button id="generateNutritionRecipes" class="secondary">Calcular recetas</button></div>
    ${suggestions.length?`<div class="recipe-results">${suggestions.map(recipe=>`<article>
      <div><span class="section-kicker">${recipe.time} MIN</span><h3>${esc(recipe.name)}</h3><strong>${recipe.macros.calories} kcal · P ${recipe.macros.protein} · C ${recipe.macros.carbs} · G ${recipe.macros.fat}</strong></div>
      <ul>${recipe.ingredients.map(item=>`<li><span>${esc(item.name)}</span><strong>${item.quantity} ${esc(item.unit)}</strong></li>`).join("")}</ul>
      <small>Valores aproximados según las cantidades propuestas.</small>
    </article>`).join("")}</div>
    <details class="shopping-list"><summary>Lista de compra</summary>${shopping.map(item=>`<div><span>${esc(item.name)}</span><strong>${item.quantity} ${esc(item.unit)}</strong></div>`).join("")}</details>`:`<p class="subtle">Elige un momento del día para obtener propuestas.</p>`}
  </section>`;
}
function renderNutrition(){
  const settings=getNutritionSettings();
  const hasTargets=hasNutritionTargets(settings);
  const entry=nutritionEntryForDate(state.nutritionDate);
  const weekly=nutritionWeeklySummary();
  const assessment=bodyCompositionAssessment();
  const professionalPlans=window.GymOSProfessionalNutrition?.getPlans?.()||[];
  const sourceLabel=settings.source==="gymos"?"Calculado por GymOS":settings.source==="manual"?"Manual":"";

  app.innerHTML=`<div class="app-shell">
    <header class="topbar nutrition-topbar"><div><div class="brand">Nutrición</div><div class="subtle">Objetivos, registro y recetas</div></div><input id="nutritionDate" class="header-date" type="date" value="${esc(state.nutritionDate)}"></header>
    <main class="screen nutrition-screen-v5">
      ${hasTargets?`<section class="card nutrition-hero">
        <div class="card-heading-row"><div><span class="section-kicker">${esc(sourceLabel.toLocaleUpperCase("es"))}</span><h1>${esc(settings.goal)}</h1><p>${esc(assessment.message)}</p></div><span class="nutrition-status">${esc(assessment.status)}</span></div>
        <div class="nutrition-target-grid">
          <article><span>Calorías</span><strong>${Number(settings.calories).toLocaleString("es-ES")}</strong></article>
          <article><span>Proteína</span><strong>${settings.protein} g</strong></article>
          <article><span>Carbohidratos</span><strong>${settings.carbs} g</strong></article>
          <article><span>Grasa</span><strong>${settings.fat} g</strong></article>
          <article><span>Fibra</span><strong>${settings.fiber||"Sin calcular"}${settings.fiber?" g":""}</strong></article>
        </div>
        <button id="recalculateNutrition" class="text-button">Recalcular necesidades →</button>
      </section>`:`<section class="nutrition-needs-empty">
        <span class="section-kicker">PRIMER PASO</span><h1>Objetivos nutricionales sin calcular</h1><p>GymOS no mostrará calorías ni macros hasta calcularlos con tus datos.</p><button id="calculateNutritionNeeds" class="primary">Calcular mis necesidades</button>
      </section>`}
      ${state.nutritionCalculatorOpen||!hasTargets?renderNutritionCalculator():""}
      ${renderNutritionCalculation(settings)}
      <section class="card">
        <h2>Registro diario</h2>
        <div class="nutrition-input-grid">
          <label><span>Calorías</span><input id="nutritionCalories" type="number" min="0" value="${esc(entry.calories)}"></label>
          <label><span>Proteína (g)</span><input id="nutritionProtein" type="number" min="0" value="${esc(entry.protein)}"></label>
          <label><span>Carbohidratos (g)</span><input id="nutritionCarbs" type="number" min="0" value="${esc(entry.carbs)}"></label>
          <label><span>Grasa (g)</span><input id="nutritionFat" type="number" min="0" value="${esc(entry.fat)}"></label>
          <label><span>Agua (L)</span><input id="nutritionWater" type="number" min="0" step="0.1" value="${esc(entry.water)}"></label>
          <label><span>Pasos</span><input id="nutritionSteps" type="number" min="0" value="${esc(entry.steps)}"></label>
        </div>
        <label><span>Notas</span><textarea id="nutritionNotes" rows="3" placeholder="Hambre, energía, comidas libres...">${esc(entry.notes)}</textarea></label>
        <button id="saveNutritionEntry" class="primary full">Guardar día</button>
      </section>
      ${hasTargets?`<section class="card"><h2>Objetivos diarios</h2>${[["Calorías",entry.calories,settings.calories,"kcal"],["Proteína",entry.protein,settings.protein,"g"],["Carbohidratos",entry.carbs,settings.carbs,"g"],["Grasa",entry.fat,settings.fat,"g"]].map(([label,value,target,unit])=>`<div class="nutrition-progress-row"><div><span>${label}</span><strong>${Number(value||0).toLocaleString("es-ES")} / ${Number(target).toLocaleString("es-ES")} ${unit}</strong></div><div class="nutrition-progress"><span style="width:${nutritionProgress(value,target)}%"></span></div></div>`).join("")}</section>`:""}
      ${renderSmartRecipes(settings,entry)}
      <section class="card"><h2>Promedio de los últimos 7 días</h2><div class="nutrition-week-grid"><article><span>Días registrados</span><strong>${weekly.days}</strong></article><article><span>Calorías</span><strong>${weekly.calories?Math.round(weekly.calories).toLocaleString("es-ES"):"Sin datos"}</strong></article><article><span>Proteína</span><strong>${weekly.protein?Math.round(weekly.protein)+" g":"Sin datos"}</strong></article><article><span>Pasos</span><strong>${weekly.steps?Math.round(weekly.steps).toLocaleString("es-ES"):"Sin datos"}</strong></article></div></section>
      <details class="card manual-nutrition-settings"><summary>Objetivo manual</summary><p class="subtle">Los valores manuales se mantienen separados de los calculados por GymOS.</p><div class="nutrition-input-grid">
        <label><span>Fase</span><select id="nutritionGoal">${["Definición","Mantenimiento","Volumen"].map(goal=>`<option ${settings.goal===goal?"selected":""}>${goal}</option>`).join("")}</select></label>
        <label><span>Calorías</span><input id="nutritionTargetCalories" type="number" min="1000" value="${settings.source==="manual"?Number(settings.calories||""):""}"></label>
        <label><span>Proteína (g)</span><input id="nutritionTargetProtein" type="number" min="0" value="${settings.source==="manual"?Number(settings.protein||""):""}"></label>
        <label><span>Carbohidratos (g)</span><input id="nutritionTargetCarbs" type="number" min="0" value="${settings.source==="manual"?Number(settings.carbs||""):""}"></label>
        <label><span>Grasa (g)</span><input id="nutritionTargetFat" type="number" min="0" value="${settings.source==="manual"?Number(settings.fat||""):""}"></label>
        <label><span>Fibra (g)</span><input id="nutritionTargetFiber" type="number" min="0" value="${settings.source==="manual"?Number(settings.fiber||""):""}"></label>
      </div><button id="saveNutritionSettings" class="secondary full">Guardar objetivo manual</button></details>
      <section class="card professional-history-entry"><div class="card-heading-row"><div><span class="section-kicker">IMPORTADO</span><h2>Planes profesionales</h2><p>Nunca se sobrescriben automáticamente.</p></div><strong>${professionalPlans.length}</strong></div><button id="openProfessionalNutrition" class="secondary full">${professionalPlans.length?"Ver planes importados":"Importar plan profesional"}</button></section>
    </main>${nav("nutrition")}
  </div>`;

  document.getElementById("nutritionDate").onchange=event=>{state.nutritionDate=event.target.value;state.nutritionRecipeSuggestions=[];renderNutrition();};
  document.getElementById("saveNutritionEntry").onclick=()=>{upsertNutritionEntry({date:state.nutritionDate,calories:document.getElementById("nutritionCalories").value,protein:document.getElementById("nutritionProtein").value,carbs:document.getElementById("nutritionCarbs").value,fat:document.getElementById("nutritionFat").value,water:document.getElementById("nutritionWater").value,steps:document.getElementById("nutritionSteps").value,notes:document.getElementById("nutritionNotes").value.trim()});toast("Registro nutricional guardado");renderNutrition();};
  const calculate=document.getElementById("calculateNutritionNeeds");
  if(calculate) calculate.onclick=()=>{state.nutritionCalculatorOpen=true;renderNutrition();};
  const recalculate=document.getElementById("recalculateNutrition");
  if(recalculate) recalculate.onclick=()=>{state.nutritionCalculatorOpen=true;state.nutritionPreview=null;renderNutrition();};
  const goalInput=document.getElementById("nutritionCalcGoal");
  if(goalInput) goalInput.onchange=()=>{document.getElementById("nutritionCalcRate").innerHTML=nutritionRateOptions(goalInput.value,0);};
  const previewButton=document.getElementById("previewNutritionNeeds");
  if(previewButton) previewButton.onclick=()=>{
    const inputs={sex:document.getElementById("nutritionCalcSex").value,age:document.getElementById("nutritionCalcAge").value,height:document.getElementById("nutritionCalcHeight").value,weight:document.getElementById("nutritionCalcWeight").value,activity:document.getElementById("nutritionCalcActivity").value,trainingDays:document.getElementById("nutritionCalcTrainingDays").value,goal:document.getElementById("nutritionCalcGoal").value,weeklyRate:document.getElementById("nutritionCalcRate").value};
    try{state.nutritionPreview=window.GymOSNutritionEngine.calculateNutritionNeeds(inputs);renderNutrition();}catch(error){const message=document.getElementById("nutritionCalculatorMessage");message.textContent=error.message;message.classList.remove("hidden");}
  };
  const applyPreview=document.getElementById("applyNutritionPreview");
  if(applyPreview) applyPreview.onclick=()=>{saveNutritionSettings(state.nutritionPreview);state.nutritionPreview=null;state.nutritionCalculatorOpen=false;toast("Objetivos calculados y aplicados");renderNutrition();autoSync("objetivos nutricionales calculados");};
  const toggleCalculation=document.getElementById("toggleNutritionCalculation");
  if(toggleCalculation) toggleCalculation.onclick=()=>{state.nutritionCalculationExpanded=!state.nutritionCalculationExpanded;renderNutrition();};
  document.getElementById("saveNutritionSettings").onclick=()=>{
    const manual={source:"manual",goal:document.getElementById("nutritionGoal").value,calories:Number(document.getElementById("nutritionTargetCalories").value||0),protein:Number(document.getElementById("nutritionTargetProtein").value||0),carbs:Number(document.getElementById("nutritionTargetCarbs").value||0),fat:Number(document.getElementById("nutritionTargetFat").value||0),fiber:Number(document.getElementById("nutritionTargetFiber").value||0),weeklyTarget:0,calculatedAt:new Date().toISOString()};
    if(!["calories","protein","carbs","fat"].every(field=>manual[field]>0)){toast("Completa calorías y macros antes de guardar");return;}
    saveNutritionSettings(manual);toast("Objetivo manual guardado");renderNutrition();
  };
  const generateRecipes=document.getElementById("generateNutritionRecipes");
  if(generateRecipes) generateRecipes.onclick=()=>{state.nutritionRecipeType=document.getElementById("nutritionRecipeType").value;state.nutritionRecipeSuggestions=window.GymOSNutritionEngine.suggestRecipes({type:state.nutritionRecipeType,remaining:nutritionRemaining(settings,entry),goal:settings.goal});renderNutrition();};
  document.getElementById("openProfessionalNutrition").onclick=()=>{state.screen="professionalNutrition";window.GymOSProfessionalNutrition.renderLibrary();};
  const professionalFile=document.getElementById("professionalNutritionFile");
  professionalFile.onchange=async event=>{const file=event.target.files?.[0];event.target.value="";if(!file)return;try{await window.GymOSProfessionalNutrition.handleFileSelection(file);}catch(error){console.error("Professional nutrition import",error);toast(error.message||"No se pudo importar la planificación.");}};
  bindNav();
}

function progressComparisonChange(value){
  if(value===null||value===undefined||!Number.isFinite(Number(value))){
    return "Sin comparación suficiente";
  }
  const numeric=Number(value);
  return `${numeric>=0?"+":""}${numeric.toFixed(1).replace(".",",")} %`;
}
function progressComparisonValues(dimension,{unit=""}={}){
  if(
    dimension?.status!=="comparable"||
    !Number.isFinite(Number(dimension.previous))||
    !Number.isFinite(Number(dimension.current))
  ) return "No hay datos suficientes en ambas semanas";
  const format=value=>Math.round(Number(value)).toLocaleString("es-ES");
  return `${format(dimension.previous)} → ${format(dimension.current)}${unit?` ${unit}`:""}`;
}
function progressTrendLabel(value){
  return ({
    ascendente:"Ascendente",descendente:"Descendente",mixta:"Mixta",estable:"Estable",
    sin_comparacion:"Sin comparación",sin_datos:"Sin datos"
  })[value]||"Sin datos";
}
function renderProgressDashboard(){
  let analytics=null;
  let weeks=[],fatigue={score:0,level:"baja",reasons:[]};
  let periodization={phase:"Acumulación",action:"Mantener el plan actual.",reason:"Sin datos suficientes."};
  let adherence={available:false,completed:0,possible:0,percent:0};
  let weightTrend={entries:[],change:null,weeklyRate:null};
  let records=[];
  const recentRecovery=window.GymOSRecovery?.getEntries?.().slice(-7)||[];
  const averageRecovery=recentRecovery.length?Math.round(recentRecovery.reduce((sum,item)=>sum+Number(item.recoveryScore||0),0)/recentRecovery.length):null;
  try{
    analytics=progressAnalyticsSnapshot(state.progressRangeWeeks);
    weeks=analytics.weeks;
    const value=analytics.summary.adherence;
    adherence=value.available
      ?{available:true,completed:value.completed,possible:value.planned,percent:value.percent}
      :adherence;
  }catch(error){console.error("Progress analytics",error);}
  try{fatigue=fatigueAssessment();}catch(error){console.error("Progress fatigue",error);}
  try{periodization=periodizationRecommendation();}catch(error){console.error("Progress periodization",error);}
  try{weightTrend=bodyWeightTrend();}catch(error){console.error("Progress body trend",error);}
  try{records=analytics?.records?.slice(0,8)||personalRecords();}catch(error){console.error("Progress records",error);}
  const current=weeks.at(-1)||{workouts:0,sets:0,volume:0,muscleSets:{}};
  const summary=analytics?.summary||{sessions7:0,sessions14:0,sessions30:0,completed:0,incomplete:0,completedSets:0,totalReps:0,averageDurationMs:null,averageRir:null};
  const comparison=analytics?.comparison||{
    previous:{volume:0,sets:0,reps:0},current:{volume:0,sets:0,reps:0},
    dimensions:{volume:{status:"sin_datos"},sets:{status:"sin_datos"},reps:{status:"sin_datos"}},
    volumeChange:null,setChange:null,repsChange:null,increasedWeight:[],increasedReps:[],
    newRecords:[],bestSet:null,trend:"sin_datos"
  };
  const diagnostics=analytics?.diagnostics||{rawCounts:{localHistory:0,localProgress:0,remoteHistory:0,remoteProgress:0},deduplicatedSessions:0,completed:0,incomplete:0,pendingSync:0,withCompletedSets:0,discarded:{}};
  const muscleTotals={};
  weeks.forEach(week=>Object.entries(week.muscleSets).forEach(([muscle,count])=>{
    muscleTotals[muscle]=(muscleTotals[muscle]||0)+count;
  }));
  const muscles=Object.entries(muscleTotals).sort((a,b)=>b[1]-a[1]);
  const maxVolume=Math.max(1,...weeks.map(w=>w.volume));
  const maxSets=Math.max(1,...muscles.map(([,sets])=>sets));

  app.innerHTML=`<div class="app-shell">
    <header class="topbar">
      <button id="backProgressDashboard" class="back-button">←</button>
      <div><div class="brand">Progreso</div><div class="subtle">Últimas ${state.progressRangeWeeks} semanas</div></div>
      <select id="progressRange" class="header-select">
        <option value="4" ${state.progressRangeWeeks===4?"selected":""}>4 sem.</option>
        <option value="8" ${state.progressRangeWeeks===8?"selected":""}>8 sem.</option>
        <option value="12" ${state.progressRangeWeeks===12?"selected":""}>12 sem.</option>
      </select>
    </header>
    <main class="screen">
      <section class="analytics-grid">
        <article class="stat-card"><span>Entrenos esta semana</span><strong>${current.workouts}</strong></article>
        <article class="stat-card"><span>Series esta semana</span><strong>${current.sets}</strong></article>
        <article class="stat-card"><span>Volumen semanal</span><strong>${Math.round(current.volume).toLocaleString("es-ES")} kg</strong></article>
        <article class="stat-card"><span>Adherencia</span><strong>${adherence.available?`${Math.round(adherence.percent)} %`:"Sin plan"}</strong></article>
      </section>

      <section class="card progress-window-summary">
        <div class="card-heading-row"><div><h2>Actividad registrada</h2><p class="subtle">Sesiones locales y remotas válidas, sin duplicados.</p></div></div>
        <div class="progress-metric-grid">
          <article><span>Últimos 7 días</span><strong>${summary.sessions7}</strong></article>
          <article><span>Últimos 14 días</span><strong>${summary.sessions14}</strong></article>
          <article><span>Últimos 30 días</span><strong>${summary.sessions30}</strong></article>
          <article><span>Finalizadas</span><strong>${summary.completed}</strong></article>
          <article><span>Incompletas</span><strong>${summary.incomplete}</strong></article>
          <article><span>Series</span><strong>${summary.completedSets}</strong></article>
          <article><span>Repeticiones</span><strong>${summary.totalReps}</strong></article>
          <article><span>Duración media</span><strong>${summary.averageDurationMs?formatDuration(summary.averageDurationMs):"Sin datos"}</strong></article>
          <article><span>RIR medio</span><strong>${summary.averageRir===null?"Sin datos":summary.averageRir.toFixed(1).replace(".",",")}</strong></article>
        </div>
        ${adherence.available?"":`<p class="progress-data-note">La adherencia no se calcula hasta que configures un objetivo semanal explícito.</p>`}
      </section>

      <section class="card progress-comparison-card">
        <div class="card-heading-row"><div><h2>Evolución de las dos últimas semanas</h2><p class="subtle">${comparison.trend==="sin_comparacion"||comparison.trend==="sin_datos"?"No hay datos suficientes en ambas semanas.":"La tendencia combina carga, repeticiones, series y calidad de finalización."}</p></div><span class="trend-badge ${comparison.trend}">${esc(progressTrendLabel(comparison.trend))}</span></div>
        <div class="progress-week-comparison">
          <article><span>Volumen</span><strong>${progressComparisonChange(comparison.volumeChange)}</strong><small>${progressComparisonValues(comparison.dimensions?.volume,{unit:"kg"})}</small></article>
          <article><span>Series</span><strong>${progressComparisonChange(comparison.setChange)}</strong><small>${progressComparisonValues(comparison.dimensions?.sets)}</small></article>
          <article><span>Repeticiones</span><strong>${progressComparisonChange(comparison.repsChange)}</strong><small>${progressComparisonValues(comparison.dimensions?.reps)}</small></article>
        </div>
        <div class="progress-improvements">
          <p><strong>Más peso:</strong> ${comparison.increasedWeight.length?comparison.increasedWeight.map(esc).join(", "):"Sin aumentos comparables"}</p>
          <p><strong>Más repeticiones:</strong> ${comparison.increasedReps.length?comparison.increasedReps.map(esc).join(", "):"Sin aumentos comparables"}</p>
          <p><strong>Nuevos récords:</strong> ${comparison.newRecords.length?comparison.newRecords.map(esc).join(", "):"Ninguno en la semana actual"}</p>
          <p><strong>Mejor serie actual:</strong> ${comparison.bestSet?`${esc(comparison.bestSet.exercise)} · ${formatWeight(comparison.bestSet.weight||0)} × ${comparison.bestSet.reps||0}`:"Sin series comparables"}</p>
        </div>
      </section>

      <section class="card periodization-card">
        <div class="card-heading-row">
          <div><h2>Fase recomendada</h2><p class="subtle">${esc(periodization.reason)}</p></div>
          <span class="phase-badge">${esc(periodization.phase)}</span>
        </div>
        <p>${esc(periodization.action)}</p>
      </section>

      <section class="card">
        <div class="card-heading-row">
          <div><h2>Fatiga estimada</h2><p class="subtle">${fatigue.reasons.length?esc(fatigue.reasons.join(" · ")):"Sin señales claras de fatiga acumulada."}</p></div>
          <span class="fatigue-level ${fatigue.level}">${esc(fatigue.level)}</span>
        </div>
        <div class="fatigue-meter"><span style="width:${Math.min(100,fatigue.score/12*100)}%"></span></div>
      </section>

      <section class="card recovery-progress-card">
        <div class="card-heading-row"><div><h2>Recuperación reciente</h2><p class="subtle">${recentRecovery.length?`${recentRecovery.length} evaluaciones en los últimos registros.`:"Completa el check-in del día siguiente para añadir contexto."}</p></div><strong>${averageRecovery===null?"Sin datos":averageRecovery}</strong></div>
        ${averageRecovery!==null?`<div class="fatigue-meter recovery"><span style="width:${averageRecovery}%"></span></div>`:""}
      </section>

      <section class="card">
        <h2>Volumen por semana</h2>
        <div class="weekly-volume-chart">
          ${weeks.map(week=>`<div class="weekly-bar-item">
            <div class="weekly-bar-track"><span style="height:${Math.max(3,week.volume/maxVolume*100)}%"></span></div>
            <small>${esc(week.label)}</small>
            <strong>${Math.round(week.volume/100)/10}k</strong>
          </div>`).join("")}
        </div>
      </section>

      <section class="card">
        <h2>Volumen por ejercicio</h2>
        <div class="exercise-volume-list">
          ${analytics?.exercises?.length?analytics.exercises.slice(0,12).map(exercise=>`<div><span>${esc(exercise.name)}</span><strong>${Math.round(exercise.volume).toLocaleString("es-ES")} kg</strong></div>`).join(""):`<div class="routine-empty"><strong>Sin series registradas</strong><p>Las sesiones incompletas aparecerán aquí cuando contengan series completadas.</p></div>`}
        </div>
      </section>

      <section class="card">
        <h2>Distribución muscular</h2>
        <div class="muscle-volume-list">
          ${muscles.length?muscles.map(([muscle,sets])=>`<div>
            <div><span>${esc(muscle)}</span><strong>${sets} series</strong></div>
            <div class="muscle-progress"><span style="width:${sets/maxSets*100}%"></span></div>
          </div>`).join(""):`<div class="routine-empty"><strong>Sin datos suficientes</strong><p>Registra tus entrenamientos para ver la distribución.</p></div>`}
        </div>
      </section>

      <section class="card">
        <h2>Tendencia de peso</h2>
        ${weightTrend.change===null?`<div class="routine-empty"><strong>Faltan registros</strong><p>Necesitas al menos dos mediciones de peso.</p></div>`:`<div class="weight-trend-summary">
          <article><span>Cambio total</span><strong>${weightTrend.change>0?"+":""}${weightTrend.change.toFixed(1)} kg</strong></article>
          <article><span>Ritmo semanal</span><strong>${weightTrend.weeklyRate>0?"+":""}${weightTrend.weeklyRate.toFixed(2)} kg/sem.</strong></article>
          <article><span>Registros</span><strong>${weightTrend.entries.length}</strong></article>
        </div>`}
      </section>

      <section class="card">
        <h2>Récords personales</h2>
        <div class="records-list">
          ${records.length?records.map(record=>`<article>
            <div><strong>${esc(record.name)}</strong><span>Mejor carga: ${record.bestWeight?record.bestWeight.toLocaleString("es-ES")+" kg":"—"}</span></div>
            <strong>${record.best1RM?Math.round(record.best1RM*10)/10+" kg 1RM":"—"}</strong>
          </article>`).join(""):`<div class="routine-empty"><strong>Sin récords todavía</strong><p>Los mejores valores aparecerán al registrar series.</p></div>`}
        </div>
      </section>

      <details class="card progress-diagnostics">
        <summary>Diagnóstico de datos</summary>
        <p class="subtle">Recuento seguro sin identificadores técnicos. La consulta remota es de solo lectura.</p>
        <div class="progress-metric-grid">
          <article><span>Historial local</span><strong>${diagnostics.rawCounts.localHistory}</strong></article>
          <article><span>Progreso local</span><strong>${diagnostics.rawCounts.localProgress}</strong></article>
          <article><span>Historial remoto</span><strong>${state.progressRemoteStatus==="loaded"?diagnostics.rawCounts.remoteHistory:"—"}</strong></article>
          <article><span>Progreso remoto</span><strong>${state.progressRemoteStatus==="loaded"?diagnostics.rawCounts.remoteProgress:"—"}</strong></article>
          <article><span>Sin duplicados</span><strong>${diagnostics.deduplicatedSessions}</strong></article>
          <article><span>Finalizadas</span><strong>${diagnostics.completed}</strong></article>
          <article><span>Incompletas</span><strong>${diagnostics.incomplete}</strong></article>
          <article><span>Pendientes</span><strong>${diagnostics.pendingSync}</strong></article>
          <article><span>Con series</span><strong>${diagnostics.withCompletedSets}</strong></article>
        </div>
        <div class="progress-discard-list">
          ${Object.entries(diagnostics.discarded).length?Object.entries(diagnostics.discarded).map(([reason,count])=>`<div><span>${esc(reason)}</span><strong>${count}</strong></div>`).join(""):`<p>No hay registros descartados.</p>`}
        </div>
        <p class="progress-data-note">${state.progressRemoteStatus==="loading"?"Consultando la copia remota…":state.progressRemoteStatus==="loaded"?"Copia remota comprobada.":"Sin conexión remota; se muestran los datos disponibles offline."}</p>
        <button id="refreshProgressDiagnostics" class="secondary" type="button" ${state.progressRemoteStatus==="loading"?"disabled":""}>Actualizar diagnóstico remoto</button>
      </details>
    </main>
    ${nav("progressDashboard")}
  </div>`;

  document.getElementById("backProgressDashboard").onclick=()=>{state.screen="home";renderHome();};
  document.getElementById("progressRange").onchange=e=>{
    state.progressRangeWeeks=Number(e.target.value);
    renderProgressDashboard();
  };
  document.getElementById("refreshProgressDiagnostics").onclick=()=>{
    state.progressRemoteData=null;
    state.progressRemoteStatus="idle";
    renderProgressDashboard();
  };
  if(state.progressRemoteStatus==="idle"||state.progressRemoteData?.ownerId!==currentRoutineOwnerOrNull()){
    loadRemoteProgressData();
  }
}


function renderCoachChat(){
  const messages=getCoachChatMessages();
  const connection=getCoachConnection();

  app.innerHTML=`<div class="app-shell coach-chat-shell">
    <header class="topbar">
      <button id="backCoachChat" class="back-button">←</button>
      <div><div class="brand">Chat con GymOS Coach</div><div class="subtle">${connection.status==="connected"?"Backend conectado":"Conexión no verificada"}</div></div>
      <button id="clearCoachChat" class="header-action">Limpiar</button>
    </header>
    <main class="screen coach-chat-screen">
      <section id="coachChatMessages" class="coach-chat-messages">
        ${messages.length?messages.map(message=>`<article class="coach-chat-message ${esc(message.role)}">
          <div class="coach-chat-role">${message.role==="user"?"Tú":"Coach"}</div>
          <p>${esc(message.content).replace(/\n/g,"<br>")}</p>
          ${message.proposalId?`<button class="secondary" type="button" data-open-chat-proposal="${esc(message.proposalId)}">Ver propuesta generada</button>`:""}
          <small>${new Date(message.createdAt).toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})}</small>
        </article>`).join(""):`<section class="card coach-chat-empty">
          <h2>¿Qué quieres revisar?</h2>
          <p class="subtle">Ejemplos: “¿Debo subir peso en press banca?”, “Estoy muy cansado esta semana” o “Cambia un ejercicio que me molesta en el hombro”.</p>
        </section>`}
      </section>

      <section class="coach-quick-prompts">
        <button data-coach-prompt="Revisa mi fatiga y dime si debería hacer una descarga.">Revisar fatiga</button>
        <button data-coach-prompt="Analiza mis progresiones y dime qué ejercicios puedo subir.">Revisar cargas</button>
        <button data-coach-prompt="Revisa si mi rutina está equilibrada por grupos musculares.">Revisar equilibrio</button>
      </section>

      <section class="coach-chat-composer">
        <textarea id="coachChatInput" rows="3" placeholder="Escribe tu pregunta al Coach..."></textarea>
        <button id="sendCoachChat" class="primary">Enviar</button>
      </section>
    </main>
  </div>`;

  const messagesElement=document.getElementById("coachChatMessages");
  messagesElement.scrollTop=messagesElement.scrollHeight;

  document.getElementById("backCoachChat").onclick=()=>{state.screen="coach";renderCoach();};
  document.getElementById("clearCoachChat").onclick=()=>{
    if(!messages.length||confirm("¿Borrar la conversación con el Coach?")){
      clearCoachChat();
      renderCoachChat();
    }
  };

  document.querySelectorAll("[data-coach-prompt]").forEach(button=>button.onclick=()=>{
    document.getElementById("coachChatInput").value=button.dataset.coachPrompt;
    document.getElementById("coachChatInput").focus();
  });

  document.querySelectorAll("[data-open-chat-proposal]").forEach(button=>button.onclick=()=>{
    state.coachSessionId=button.dataset.openChatProposal;
    state.screen="coachProposal";
    renderCoachProposal();
  });

  const send=async()=>{
    const input=document.getElementById("coachChatInput");
    const button=document.getElementById("sendCoachChat");
    const value=input.value.trim();
    if(!value) return;
    button.disabled=true;
    button.textContent="Pensando...";
    input.disabled=true;
    try{
      await sendCoachChatMessage(value);
      renderCoachChat();
    }catch(error){
      toast(error.message||"No se pudo enviar el mensaje.");
      button.disabled=false;
      button.textContent="Enviar";
      input.disabled=false;
    }
  };
  document.getElementById("sendCoachChat").onclick=send;
  document.getElementById("coachChatInput").onkeydown=e=>{
    if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)) send();
  };
}

function renderCoach(){
  let settings={backendUrl:"",requireApproval:true,goal:"Mantenerme definido",sessionDuration:60};
  let proposals=[],snapshots=[],summaries=[],workoutAnalyses=[];
  try{
    window.GymOSWorkoutAnalysis?.ensureAnalyses?.(getHistory().slice(0,100));
  }catch(error){console.error("Workout analysis migration",error);}
  try{settings=getCoachSettings();}catch(error){console.error("Coach settings",error);}
  try{proposals=getCoachProposals();}catch(error){console.error("Coach proposals",error);}
  try{snapshots=getCoachSnapshots();}catch(error){console.error("Coach snapshots",error);}
  try{summaries=coachExerciseSummary();}catch(error){console.error("Coach summary",error);}
  try{workoutAnalyses=window.GymOSWorkoutAnalysis?.getAnalyses?.()||[];}catch(error){console.error("Workout analyses",error);}
  const latest=proposals[0]||null;
  const tracked=summaries.filter(item=>item.historyCount>0).length;

  app.innerHTML=`<div class="app-shell">
    <header class="topbar">
      <button id="backCoach" class="back-button">←</button>
      <div><div class="brand">GymOS Coach</div><div class="subtle">Revisión y adaptación de rutina</div></div>
      <span></span>
    </header>
    <main class="screen">
      <section class="card coach-hero">
        <span class="coach-badge">v3.0</span>
        <h1>Tu rutina, revisada con datos</h1>
        <p>El Coach analiza cargas, repeticiones, RIR, RPE e historial. Ningún cambio se aplica sin tu confirmación.</p>
        <div class="coach-summary-grid">
          <article><span>Ejercicios analizados</span><strong>${summaries.length}</strong></article>
          <article><span>Con historial</span><strong>${tracked}</strong></article>
          <article><span>Propuestas</span><strong>${proposals.length}</strong></article>
        </div>
      </section>

      <section class="coach-workout-analyses">
        <div class="card-heading-row">
          <div><span class="section-kicker">ÚLTIMAS SESIONES</span><h2>Valoraciones de entrenamientos</h2><p class="subtle">Análisis objetivo basado en tus series registradas.</p></div>
          <strong>${workoutAnalyses.length}</strong>
        </div>
        ${workoutAnalyses.length?`<div class="coach-workout-analysis-list">${workoutAnalyses.slice(0,6).map(item=>`
          <article class="card coach-workout-analysis-card">
            <div class="coach-analysis-card-heading">
              <span class="coach-analysis-state state-${esc(item.overallStatus)}">${esc(item.overallStatus==="demanding"||item.overallStatus==="below_expected"?"Revisar":item.overallStatus==="limited"?"Limitado":"Progresión")}</span>
              <small>${formatDate(item.workoutDate)} · ${item.analysisSource==="ai"?"IA":item.analysisSource==="local_fallback"?"Fallback local":"Reglas"}</small>
            </div>
            <h3>${esc(item.shortTitle)}</h3>
            <p>${esc(item.shortMessage)}</p>
            <button type="button" class="text-button" data-open-workout-analysis="${esc(item.id)}">Ver análisis →</button>
          </article>`).join("")}</div>`:`<div class="card coach-analysis-empty"><strong>Aún no hay valoraciones</strong><p>Se crearán automáticamente al finalizar el próximo entrenamiento.</p></div>`}
      </section>

      <section class="card">
        <div class="card-heading-row">
          <div><h2>Coach IA</h2><p class="subtle">La IA solo redacta; las reglas de GymOS siguen tomando las decisiones.</p></div>
          <span class="connection-badge ${getCoachSettings().aiEnabled?"connected":"unknown"}">${getCoachSettings().aiEnabled?esc(aiProviderLabel(getCoachConnection().provider||"rules")):"Desactivado"}</span>
        </div>
        <button id="openCoachAiSettings" class="secondary full">Abrir configuración de IA</button>
      </section>

      <section class="card coach-chat-entry">
        <h2>Hablar con el Coach</h2>
        <p class="subtle">Pregunta por cargas, fatiga, sustituciones o cambios en tu rutina. Las modificaciones seguirán necesitando confirmación.</p>
        <button id="openCoachChat" class="primary full">Abrir chat</button>
      </section>

      <section class="card">
        <h2>Nueva revisión</h2>
        <p class="subtle">La revisión local funciona sin enviar datos fuera del dispositivo.</p>
        <button id="runLocalCoach" class="primary full">Analizar mi evolución</button>
        <button id="runRemoteCoach" class="secondary full coach-secondary-action">Consultar backend de IA</button>
      </section>

      ${latest?`<section class="card">
        <div class="card-heading-row">
          <div><h2>Última propuesta</h2><p class="subtle">${new Date(latest.createdAt).toLocaleString("es-ES")} · ${latest.source==="remote"?"IA remota":"Análisis local"}</p></div>
          <span class="proposal-status ${esc(latest.status)}">${esc(latest.status)}</span>
        </div>
        <p>${esc(latest.summary)}</p>
        <button id="openLatestProposal" class="secondary full">Ver propuesta</button>
      </section>`:""}

      <section class="card">
        <h2>Configuración del Coach</h2>
        <label><span>Objetivo actual</span><input id="coachGoal" value="${esc(settings.goal)}"></label>
        <label><span>Duración máxima de sesión (min)</span><input id="coachDuration" type="number" min="20" max="180" value="${Number(settings.sessionDuration||60)}"></label>
        <label class="favorite-filter"><input id="coachRequireApproval" type="checkbox" ${settings.requireApproval?"checked":""}><span>Exigir siempre confirmación antes de cambiar la rutina</span></label>
        <button id="saveCoachSettings" class="secondary full">Guardar configuración</button>
      </section>

      <section class="card">
        <h2>Seguridad</h2>
        <p class="subtle">Los cambios aplicados guardan una copia de la rutina anterior.</p>
        <button id="undoCoachChange" class="danger-soft full" ${snapshots.length?"":"disabled"}>Deshacer último cambio del Coach</button>
      </section>

      <section class="card warning-card">
        <h2>Seguridad de la IA</h2>
        <p>GymOS no guarda claves de Gemini, OpenAI u Ollama en el navegador. Las credenciales permanecen exclusivamente en el servidor.</p>
      </section>
    </main>
    ${nav("coach")}
  </div>`;

  document.getElementById("backCoach").onclick=()=>{state.screen="home";renderHome();};
  document.getElementById("openCoachAiSettings").onclick=()=>{state.aiSettingsMessage=null;state.screen="aiSettings";renderAiSettings();};
  document.querySelectorAll("[data-open-workout-analysis]").forEach(button=>button.onclick=()=>{
    state.workoutAnalysisId=button.dataset.openWorkoutAnalysis;
    state.screen="workoutAnalysis";
    renderWorkoutAnalysisDetail();
  });
  document.getElementById("openCoachChat").onclick=()=>{state.screen="coachChat";renderCoachChat();};
  document.getElementById("runLocalCoach").onclick=()=>{
    const proposal=createLocalCoachProposal();
    state.screen="coachProposal";
    renderCoachProposal();
  };
  document.getElementById("runRemoteCoach").onclick=async()=>{
    try{
      toast("Consultando Coach...");
      await requestRemoteCoachProposal();
      state.screen="coachProposal";
      renderCoachProposal();
    }catch(error){
      toast(error.message||"No se pudo consultar el backend.");
    }
  };
  const latestButton=document.getElementById("openLatestProposal");
  if(latestButton) latestButton.onclick=()=>{
    state.coachSessionId=latest.id;
    state.screen="coachProposal";
    renderCoachProposal();
  };
  document.getElementById("saveCoachSettings").onclick=()=>{
    saveCoachSettings({
      ...settings,
      goal:document.getElementById("coachGoal").value.trim()||"Mantenerme definido",
      sessionDuration:Number(document.getElementById("coachDuration").value||60),
      requireApproval:document.getElementById("coachRequireApproval").checked
    });
    toast("Configuración guardada");
    renderCoach();
  };
  document.getElementById("undoCoachChange").onclick=()=>{
    if(!confirm("¿Restaurar la rutina anterior al último cambio del Coach?")) return;
    if(undoLastCoachChange()){
      toast("Último cambio deshecho");
      renderCoach();
    }
  };
}

function workoutAnalysisChange(value,suffix=" %"){
  if(value===null||value===undefined||!Number.isFinite(Number(value))) return "Sin comparación";
  const rounded=Math.round(Number(value)*10)/10;
  return `${rounded>0?"+":rounded<0?"−":""}${String(Math.abs(rounded)).replace(".",",")}${suffix}`;
}
function renderWorkoutAnalysisDetail(){
  const analyses=window.GymOSWorkoutAnalysis?.getAnalyses?.()||[];
  const item=analyses.find(analysis=>analysis.id===state.workoutAnalysisId)||analyses[0];
  if(!item){state.screen="coach";renderCoach();return;}
  const analysis=item.structuredAnalysis||{};
  const workout=getHistory().find(row=>String(row.id)===String(item.workoutId));
  const exercises=analysis.exercise_results||[];
  const actions=analysis.next_session_actions||[];
  const warnings=analysis.warnings||[];
  const progress=exercises.filter(row=>["clear_progression","moderate_progression"].includes(row.status));
  const maintain=exercises.filter(row=>row.action==="maintain");
  const fatigue=exercises.filter(row=>row.status==="excessive_effort");
  const discomfort=exercises.filter(row=>row.status==="discomfort");
  app.innerHTML=`<div class="app-shell">
    <header class="topbar">
      <button id="backWorkoutAnalysis" class="back-button" aria-label="Volver a Coach">←</button>
      <div><div class="brand">Análisis de ${esc(workout?.sessionName||`Sesión ${workout?.session||""}`)}</div><div class="subtle">${formatDate(item.workoutDate)} · ${item.analysisSource==="ai"?"Explicación con IA":item.analysisSource==="local_fallback"?"IA no disponible · fallback local":"Motor de reglas"}</div></div><span></span>
    </header>
    <main class="screen workout-analysis-screen">
      <section class="workout-analysis-hero">
        <span class="coach-analysis-state state-${esc(item.overallStatus)}">${esc(item.shortTitle)}</span>
        <h1>${esc(item.shortTitle)}</h1>
        <p>${esc(item.aiMessage||item.shortMessage)}</p>
        <div class="workout-analysis-summary">
          <article><span>Ejercicios</span><strong>${Number(analysis.completed_exercises||0)} de ${Number(analysis.planned_exercises||0)}</strong></article>
          <article><span>Series</span><strong>${Number(analysis.completed_series||0)} de ${Number(analysis.planned_series||0)}</strong></article>
          <article><span>Volumen comparable</span><strong>${workoutAnalysisChange(analysis.volume_change_percent)}</strong></article>
          <article><span>Duración</span><strong>${analysis.duration_ms?formatDuration(analysis.duration_ms):"Sin datos"}</strong></article>
        </div>
      </section>
      ${warnings.length?`<section class="card workout-analysis-warnings"><h2>Contexto del análisis</h2>${warnings.map(warning=>`<p>${esc(warning.message)}</p>`).join("")}</section>`:""}
      <section class="workout-analysis-exercises">
        <div><span class="section-kicker">EJERCICIO POR EJERCICIO</span><h2>Qué ocurrió</h2></div>
        ${exercises.map(result=>`<article class="card workout-exercise-analysis status-${esc(result.status)}">
          <div class="card-heading-row"><div><h3>${esc(result.exercise)}</h3><p class="subtle">${result.completed_sets} de ${result.planned_sets} series completadas</p></div><span class="exercise-analysis-status">${esc(result.status_label)}</span></div>
          <div class="exercise-analysis-comparison">
            <div><span>Ahora</span><strong>${result.current?.max_weight!==null&&result.current?.max_weight!==undefined?`${formatWeight(result.current.max_weight)} kg`:"Carga sin registrar"}${result.current?.total_reps?` · ${result.current.total_reps} rep.`:""}</strong></div>
            <div><span>Anterior</span><strong>${result.previous?`${result.previous.max_weight!==null&&result.previous.max_weight!==undefined?`${formatWeight(result.previous.max_weight)} kg`:"Sin carga"}${result.previous.total_reps?` · ${result.previous.total_reps} rep.`:""}`:"Sin sesión comparable"}</strong></div>
            <div><span>Cambio de volumen</span><strong>${workoutAnalysisChange(result.changes?.volume_percent)}</strong></div>
            <div><span>RIR</span><strong>${result.average_rir!==null&&result.average_rir!==undefined?String(Math.round(result.average_rir*10)/10).replace(".",","):"Sin registrar"}${result.target_rir?` · objetivo ${result.target_rir.min}–${result.target_rir.max}`:" · objetivo sin registrar"}</strong></div>
          </div>
          ${result.discomfort?`<p class="exercise-discomfort-alert"><strong>Molestia:</strong> ${esc(result.discomfort)}</p>`:""}
          <div class="exercise-analysis-recommendation"><span>${esc(result.action_label)}</span><p>${esc(result.recommendation)}</p></div>
        </article>`).join("")}
      </section>
      <section class="card workout-analysis-priorities">
        <h2>Prioridades para la próxima sesión</h2>
        ${progress.length?`<div><strong>Pueden progresar</strong><p>${progress.map(row=>esc(row.exercise)).join(" · ")}</p></div>`:""}
        ${maintain.length?`<div><strong>Conviene mantener</strong><p>${maintain.map(row=>esc(row.exercise)).join(" · ")}</p></div>`:""}
        ${fatigue.length?`<div><strong>Señales de esfuerzo excesivo</strong><p>${fatigue.map(row=>esc(row.exercise)).join(" · ")}</p></div>`:""}
        ${discomfort.length?`<div><strong>Molestias registradas</strong><p>${discomfort.map(row=>esc(row.exercise)).join(" · ")}</p></div>`:""}
        <div class="next-session-action-list">${actions.map(action=>`<article><span>${esc(action.label)}</span><strong>${esc(action.exercise)}</strong><p>${esc(action.recommendation)}</p><small>Requiere tu confirmación; GymOS no modificará la rutina automáticamente.</small></article>`).join("")}</div>
      </section>
      <section class="card workout-analysis-actions">
        <div><h2>Recalcular o redactar</h2><p class="subtle">La IA recibe únicamente el resultado estructurado anterior.</p></div>
        <button id="recalculateWorkoutAnalysis" class="secondary" type="button" ${workout?"":"disabled"}>Recalcular análisis</button>
        <button id="writeWorkoutAnalysisWithAi" class="secondary" type="button">${getCoachSettings().aiEnabled?"Regenerar mensaje con IA":"Configurar mensajes de IA"}</button>
        ${workout?`<button id="viewAnalyzedWorkout" class="text-button" type="button">Ver entrenamiento original →</button>`:""}
      </section>
    </main>${nav("coach")}
  </div>`;
  document.getElementById("backWorkoutAnalysis").onclick=()=>{state.screen="coach";renderCoach();};
  const recalculate=document.getElementById("recalculateWorkoutAnalysis");
  if(recalculate) recalculate.onclick=()=>{
    const updated=window.GymOSWorkoutAnalysis.analyzeAndSave(workout,{force:true});
    state.workoutAnalysisId=updated.id;toast("Análisis recalculado.");renderWorkoutAnalysisDetail();
  };
  document.getElementById("writeWorkoutAnalysisWithAi").onclick=async event=>{
    if(!getCoachSettings().aiEnabled){
      state.aiSettingsMessage=null;state.screen="aiSettings";renderAiSettings();return;
    }
    const button=event.currentTarget;button.disabled=true;button.textContent="Redactando…";
    try{
      const updated=await window.GymOSWorkoutAnalysis.maybeGenerateAiNarrative(item,{force:true});
      state.workoutAnalysisId=updated.id;
      toast(updated.analysisSource==="local_fallback"
        ?"La IA no está disponible. Se mantiene la explicación local."
        :"Explicación actualizada.");
      renderWorkoutAnalysisDetail();
    }catch(error){
      console.error("Workout analysis AI",error);toast(error.message||"No se pudo usar la IA; se mantiene el análisis local.");
      button.disabled=false;button.textContent="Redactar con IA";
    }
  };
  const viewWorkout=document.getElementById("viewAnalyzedWorkout");
  if(viewWorkout) viewWorkout.onclick=()=>{state.expandedHistoryId=workout.id;state.screen="history";renderHistory();};
  bindNav();
}

function renderCoachProposal(){
  const proposals=getCoachProposals();
  const proposal=proposals.find(item=>item.id===state.coachSessionId)||proposals[0];
  if(!proposal){
    state.screen="coach";
    renderCoach();
    return;
  }

  app.innerHTML=`<div class="app-shell">
    <header class="topbar">
      <button id="backCoachProposal" class="back-button">←</button>
      <div><div class="brand">Propuesta del Coach</div><div class="subtle">${proposal.source==="remote"?"IA remota":"Análisis local"}</div></div>
      <span></span>
    </header>
    <main class="screen">
      <section class="card">
        <div class="card-heading-row">
          <div><h2>${esc(proposal.summary)}</h2><p class="subtle">${new Date(proposal.createdAt).toLocaleString("es-ES")}</p></div>
          <span class="proposal-status ${esc(proposal.status)}">${esc(proposal.status)}</span>
        </div>
        ${proposal.notes?.length?`<div class="coach-notes">${proposal.notes.map(note=>`<p>${esc(note)}</p>`).join("")}</div>`:""}
      </section>

      <section class="coach-change-list">
        ${proposal.changes.length?proposal.changes.map(change=>`<article class="card coach-change-card">
          <div class="coach-change-heading">
            <div><strong>${esc(change.exercise)}</strong><span>${esc(change.sessionName||`Sesión ${change.session}`)}</span></div>
            <span class="coach-change-type">${esc(change.type)}</span>
          </div>
          <div class="coach-change-values">
            <span>${esc(change.field)}: <del>${esc(change.from)}</del> → <strong>${esc(change.to)}</strong></span>
          </div>
          <p>${esc(change.reason)}</p>
        </article>`).join(""):`<article class="card routine-empty"><strong>Sin cambios necesarios</strong><p>La recomendación actual es mantener la rutina.</p></article>`}
      </section>

      ${proposal.status==="pending"?`<section class="card coach-decision-card">
        <button id="applyCoachProposal" class="primary full" ${proposal.changes.length?"":"disabled"}>Aceptar y aplicar cambios</button>
        <button id="rejectCoachProposal" class="danger-soft full">Rechazar propuesta</button>
      </section>`:""}
    </main>
  </div>`;

  document.getElementById("backCoachProposal").onclick=()=>{state.screen="coach";renderCoach();};
  const apply=document.getElementById("applyCoachProposal");
  if(apply) apply.onclick=()=>{
    if(!confirm("¿Aplicar estos cambios a tu rutina? Se guardará una copia para poder deshacerlos.")) return;
    if(applyCoachProposal(proposal)){
      toast("Cambios aplicados");
      renderCoachProposal();
    }
  };
  const reject=document.getElementById("rejectCoachProposal");
  if(reject) reject.onclick=()=>{
    rejectCoachProposal(proposal.id);
    toast("Propuesta rechazada");
    renderCoachProposal();
  };
}

function renderFavoriteExercises(){
  let favorites=getFavoriteExercises();
  if(state.favoritesSort==="recent"){
    favorites=favorites.sort((a,b)=>{
      const aDate=favoriteExerciseUsage(a.name).lastDate||"";
      const bDate=favoriteExerciseUsage(b.name).lastDate||"";
      return new Date(bDate)-new Date(aDate);
    });
  }else if(state.favoritesSort==="used"){
    favorites=favorites.sort((a,b)=>favoriteExerciseUsage(b.name).setCount-favoriteExerciseUsage(a.name).setCount);
  }else{
    favorites=favorites.sort((a,b)=>a.name.localeCompare(b.name,"es"));
  }

  app.innerHTML=`<div class="app-shell">
    <header class="topbar">
      <button id="backFavoriteExercises" class="back-button">←</button>
      <div><div class="brand">Favoritos</div><div class="subtle">${favorites.length} ejercicios</div></div>
      <span></span>
    </header>
    <main class="screen">
      <section class="card favorite-toolbar">
        <label><span>Ordenar por</span><select id="favoriteSort">
          <option value="name" ${state.favoritesSort==="name"?"selected":""}>Nombre</option>
          <option value="used" ${state.favoritesSort==="used"?"selected":""}>Más utilizados</option>
          <option value="recent" ${state.favoritesSort==="recent"?"selected":""}>Uso más reciente</option>
        </select></label>
      </section>
      <section class="exercise-library-list">
        ${favorites.length?favorites.map(item=>{
          const usage=favoriteExerciseUsage(item.name);
          return `<article class="card favorite-exercise-card">
            <div class="exercise-library-card-top">
              <div>
                <h2>${esc(item.name)}</h2>
                <p class="subtle">${esc(item.muscle)} · ${esc(item.equipment)} · ${esc(item.type)}</p>
              </div>
              <button class="favorite-button active" data-remove-favorite="${item.id}" aria-label="Quitar favorito">★</button>
            </div>
            <div class="favorite-usage-row">
              <span>${usage.setCount} series registradas</span>
              <span>${usage.sessions.length?`En sesiones ${usage.sessions.join(", ")}`:"No está en la rutina"}</span>
              <span>${usage.lastDate?`Último uso: ${new Date(usage.lastDate).toLocaleDateString("es-ES")}`:"Sin uso registrado"}</span>
            </div>
            <div class="library-session-actions">
              ${activeRoutineSessions().map(session=>`<button class="secondary" data-favorite-add="${item.id}" data-target-session="${esc(session.sessionId)}">Añadir a ${esc(routineSessionRuntimeApi().displayName(session))}</button>`).join("")}
            </div>
            <button class="secondary full" data-favorite-detail="${item.id}">Ver ficha</button>
          </article>`;
        }).join(""):`<section class="card empty-library-state"><h2>Sin favoritos</h2><p class="subtle">Marca ejercicios con la estrella desde la biblioteca.</p></section>`}
      </section>
    </main>
  </div>`;

  document.getElementById("backFavoriteExercises").onclick=()=>{state.screen="settings";renderSettings();};
  document.getElementById("favoriteSort").onchange=e=>{state.favoritesSort=e.target.value;renderFavoriteExercises();};
  document.querySelectorAll("[data-remove-favorite]").forEach(button=>button.onclick=()=>{
    setExerciseFavorite(button.dataset.removeFavorite,false);
    toast("Eliminado de favoritos");
    renderFavoriteExercises();
  });
  document.querySelectorAll("[data-favorite-add]").forEach(button=>button.onclick=()=>{
    const item=getExerciseLibrary().find(exercise=>exercise.id===button.dataset.favoriteAdd);
    if(!item) return;
    addExerciseToRoutine(button.dataset.targetSession,item);
    toast(`${item.name} añadido a ${routineSessionRuntimeApi().displayName(canonicalSessionByRef(button.dataset.targetSession))}`);
  });
  document.querySelectorAll("[data-favorite-detail]").forEach(button=>button.onclick=()=>{
    state.selectedLibraryExerciseId=button.dataset.favoriteDetail;
    state.screen="exerciseDetail";
    renderExerciseDetail();
  });
}

function renderBackupRestore(){
  const coverage=syncCoverageSummary();
  const syncItems=[
    ["Rutina",coverage.routine],
    ["Historial",coverage.history],
    ["Peso corporal",coverage.bodyWeight],
    ["Bloques",coverage.blocks],
    ["Biblioteca",coverage.exerciseLibrary],
    ["Sustituciones",coverage.substitutions],
    ["Favoritos de sustitución",coverage.favoriteSubstitutions]
  ];

  app.innerHTML=`<div class="app-shell">
    <header class="topbar">
      <button id="backBackupRestore" class="back-button">←</button>
      <div><div class="brand">Copia y restauración</div><div class="subtle">Protección de datos GymOS</div></div>
      <span></span>
    </header>
    <main class="screen">
      <section class="card">
        <h2>Exportar copia completa</h2>
        <p class="subtle">Genera un archivo JSON con tu rutina, historial, peso, bloques, biblioteca, sustituciones y favoritos.</p>
        <button id="downloadGymOSBackup" class="primary full">Descargar copia de seguridad</button>
      </section>

      <section class="card">
        <h2>Restaurar una copia</h2>
        <p class="subtle">Selecciona un archivo creado por GymOS. Puedes combinarlo con tus datos actuales o reemplazarlos.</p>
        <input id="backupFileInput" type="file" accept="application/json,.json">
        <div class="backup-mode-grid">
          <button id="mergeBackup" class="secondary" disabled>Combinar datos</button>
          <button id="replaceBackup" class="danger-soft" disabled>Reemplazar todo</button>
        </div>
        <p id="backupFileStatus" class="subtle">Ningún archivo seleccionado.</p>
      </section>

      <section class="card">
        <h2>Cobertura de sincronización</h2>
        <p class="subtle">Estos apartados forman parte del paquete que GymOS prepara para Supabase.</p>
        <div class="sync-coverage-list">
          ${syncItems.map(([label,ok])=>`<div><span>${esc(label)}</span><strong class="${ok?"ok":"warn"}">${ok?"Incluido":"Pendiente"}</strong></div>`).join("")}
        </div>
      </section>

      <section class="card warning-card">
        <h2>Antes de actualizar</h2>
        <p>Descarga una copia y comprueba que la sincronización se ha completado. Así podrás restaurar tus datos aunque borres la caché o cambies de dispositivo.</p>
      </section>
    </main>
  </div>`;

  let selectedPayload=null;
  const fileInput=document.getElementById("backupFileInput");
  const status=document.getElementById("backupFileStatus");
  const mergeButton=document.getElementById("mergeBackup");
  const replaceButton=document.getElementById("replaceBackup");

  document.getElementById("backBackupRestore").onclick=()=>{state.screen="settings";renderSettings();};
  document.getElementById("downloadGymOSBackup").onclick=()=>{
    downloadGymOSBackup();
    toast("Copia de seguridad descargada");
  };

  fileInput.onchange=async()=>{
    selectedPayload=null;
    mergeButton.disabled=true;
    replaceButton.disabled=true;
    const file=fileInput.files?.[0];
    if(!file){status.textContent="Ningún archivo seleccionado.";return;}
    try{
      selectedPayload=validateGymOSBackup(await readJsonFile(file));
      status.textContent=`Copia válida: ${file.name}${selectedPayload.exportedAt?` · ${new Date(selectedPayload.exportedAt).toLocaleString("es-ES")}`:""}`;
      mergeButton.disabled=false;
      replaceButton.disabled=false;
    }catch(error){
      status.textContent=error.message||"No se pudo validar la copia.";
    }
  };

  mergeButton.onclick=()=>{
    if(!selectedPayload) return;
    importGymOSBackup(selectedPayload,"merge");
    toast("Copia combinada correctamente");
    renderBackupRestore();
  };
  replaceButton.onclick=()=>{
    if(!selectedPayload||!confirm("Esto reemplazará los datos actuales de GymOS. ¿Continuar?")) return;
    importGymOSBackup(selectedPayload,"replace");
    toast("Copia restaurada correctamente");
    renderBackupRestore();
  };
}


async function renderDeveloperMode(){
  if(!developerModeEnabled()){
    state.screen="settings";
    renderSettings();
    return;
  }
  const storage=storageDiagnostics();
  const connection=getCoachConnection();
  const sync=getSyncConfig();
  const logs=getDeveloperLogs();
  let sw={supported:"Comprobando",registered:false,controller:false};
  try{sw=await serviceWorkerDiagnostics();}catch(error){}

  app.innerHTML=`<div class="app-shell developer-shell">
    <header class="topbar">
      <button id="backDeveloper" class="back-button">←</button>
      <div><div class="eyebrow">HERRAMIENTAS AVANZADAS</div><div class="brand">Desarrollador</div></div>
      <span class="dev-badge">DEV</span>
    </header>
    <main class="screen">
      <section class="developer-status-grid">
        <article class="dev-stat-card"><span>Versión</span><strong>3.4.0</strong><small>Interfaz renovada</small></article>
        <article class="dev-stat-card"><span>Almacenamiento</span><strong>${formatBytes(storage.totalBytes)}</strong><small>${storage.itemCount} claves</small></article>
        <article class="dev-stat-card"><span>Red</span><strong>${navigator.onLine?"Online":"Offline"}</strong><small>${state.syncStatus||"sin estado"}</small></article>
        <article class="dev-stat-card"><span>Service worker</span><strong>${sw.registered?"Activo":"Inactivo"}</strong><small>${sw.controller?"Controlando app":"Sin controlador"}</small></article>
      </section>

      <section class="card">
        <div class="card-heading-row"><div><h2>Backend y servicios</h2><p class="subtle">Estado de las conexiones externas.</p></div></div>
        <div class="developer-service-list">
          <article><div><strong>GymOS Coach</strong><span>${esc(getCoachSettings().backendUrl||"URL no configurada")}</span></div><span class="service-status ${connection.status}">${connection.status}</span></article>
          <article><div><strong>Supabase</strong><span>${esc(sync.url||"Proyecto no configurado")}</span></div><span class="service-status ${sync.url&&sync.key?"connected":"unknown"}">${sync.url&&sync.key?"configurado":"pendiente"}</span></article>
          <article><div><strong>Service Worker</strong><span>${esc(sw.scope||"Sin ámbito registrado")}</span></div><span class="service-status ${sw.registered?"connected":"unknown"}">${sw.registered?"activo":"inactivo"}</span></article>
        </div>
        <div class="settings-actions">
          <button id="devTestCoach" class="secondary">Probar Coach</button>
          <button id="devForceSync" class="secondary">Forzar sincronización</button>
        </div>
      </section>

      <section class="card">
        <h2>Almacenamiento local</h2>
        <div class="developer-storage-list">
          ${storage.keys.slice(0,12).map(row=>`<div><span>${esc(row.key)}</span><strong>${formatBytes(row.size)}</strong></div>`).join("")}
        </div>
        ${storage.keys.length>12?`<p class="subtle">Se muestran las 12 claves de mayor tamaño.</p>`:""}
      </section>

      <section class="card">
        <div class="card-heading-row">
          <div><h2>Registro técnico</h2><p class="subtle">${logs.length} eventos guardados.</p></div>
          <button id="clearDevLogs" class="text-button">Limpiar</button>
        </div>
        <div class="developer-log-list">
          ${logs.length?logs.slice(0,20).map(log=>`<article class="${esc(log.level)}">
            <span>${new Date(log.createdAt).toLocaleString("es-ES")}</span>
            <strong>${esc(log.message)}</strong>
          </article>`).join(""):`<div class="routine-empty"><strong>Sin eventos</strong><p>Las acciones técnicas aparecerán aquí.</p></div>`}
        </div>
      </section>

      <section class="card">
        <h2>Diagnóstico</h2>
        <p class="subtle">Genera un archivo técnico sin incluir contraseñas ni claves secretas.</p>
        <div class="settings-actions">
          <button id="downloadDiagnostics" class="primary">Descargar diagnóstico</button>
          <button id="refreshAppCache" class="secondary">Actualizar caché</button>
        </div>
      </section>

      <section class="card danger-zone">
        <h2>Zona de pruebas</h2>
        <p class="subtle">Estas acciones pueden cerrar sesiones en curso o modificar datos locales.</p>
        <button id="resetUiPreferences" class="danger-soft full">Restablecer aspecto</button>
      </section>
    </main>
  </div>`;

  document.getElementById("backDeveloper").onclick=()=>{state.screen="settings";renderSettings();};
  document.getElementById("downloadDiagnostics").onclick=()=>{
    downloadDeveloperDiagnostics();
    addDeveloperLog("info","Diagnóstico descargado");
    toast("Diagnóstico descargado");
  };
  document.getElementById("clearDevLogs").onclick=()=>{
    clearDeveloperLogs();
    renderDeveloperMode();
  };
  document.getElementById("devTestCoach").onclick=async()=>{
    try{
      await testCoachConnection();
      addDeveloperLog("success","Conexión con Coach correcta");
      toast("Coach conectado");
    }catch(error){
      addDeveloperLog("error","Error de conexión con Coach",error.message);
      toast(error.message||"No se pudo completar la prueba de Coach.");
    }
    renderDeveloperMode();
  };
  document.getElementById("devForceSync").onclick=async()=>{
    try{
      await syncNow();
      addDeveloperLog("success","Sincronización manual completada");
      toast("Sincronización completada");
    }catch(error){
      addDeveloperLog("error","Error de sincronización",error.message);
      toast(error.message||"No se pudo completar la sincronización.");
    }
    renderDeveloperMode();
  };
  document.getElementById("refreshAppCache").onclick=async()=>{
    if("serviceWorker" in navigator){
      const registration=await navigator.serviceWorker.getRegistration();
      await registration?.update();
      addDeveloperLog("info","Comprobación de caché solicitada");
      toast("Caché comprobada");
    }
  };
  document.getElementById("resetUiPreferences").onclick=()=>{
    if(!confirm("¿Restablecer el aspecto y volver al modo usuario?")) return;
    saveAppPreferences({mode:"user",theme:"system",accent:"violet",density:"comfortable",fontScale:"normal",highContrast:false,largeTapTargets:false,compact:false,animations:true});
    state.screen="settings";
    renderSettings();
  };
}


function renderAccount(){
  const user=state.syncUser;
  const security=accountSecuritySummary();
  const migrationNeeded=Boolean(user&&hasLocalUserData()&&localMigrationStatus()!=="completed");
  const alias=accountAlias();
  const avatarKey=validAccountAvatarKey(state.accountProfile?.avatarKey);
  const createdAt=user?.created_at?new Date(user.created_at):null;
  const createdAtLabel=createdAt&&!Number.isNaN(createdAt.getTime())
    ?createdAt.toLocaleDateString("es-ES",{day:"2-digit",month:"long",year:"numeric"})
    :"No disponible";

  app.innerHTML=`<div class="app-shell">
    <header class="topbar">
      ${user?`<button id="backAccount" class="back-button">←</button>`:`<span></span>`}
      <div><div class="brand">Cuenta GymOS</div><div class="subtle">${user?"Acceso y privacidad":"Acceso obligatorio"}</div></div>
      ${user?`<span class="secure-account-badge">Protegida</span>`:`<span class="secure-account-badge">Privado</span>`}
    </header>
    <main class="screen">
      ${user?`
        <section class="card account-profile-card">
          <div class="large-account-avatar" data-account-avatar>${esc(accountAvatarContent(avatarKey))}</div>
          <div>
            <span class="section-kicker">SESIÓN ACTIVA</span>
            <h1 data-account-display-name>${esc(accountDisplayName(user))}</h1>
            <p>${esc(user.email||"")}</p>
            <small>ID interno: ${esc(user.id.slice(0,8))}…</small>
          </div>
        </section>
        <div id="accountManagementMessage" class="verification-message ${state.accountManagementMessage?.type||""}" role="${state.accountManagementMessage?.type==="error"?"alert":"status"}" ${state.accountManagementMessage?"":"hidden"}>${state.accountManagementMessage?esc(state.accountManagementMessage.text):""}</div>

        ${migrationNeeded?`
        <section class="card migration-card">
          <span class="section-kicker">DATOS ENCONTRADOS</span>
          <h2>Asociar los datos de este dispositivo</h2>
          <p class="subtle">GymOS ha encontrado información local. Se guardará en tu cuenta y quedará aislada mediante tu identificador de usuario.</p>
          <button id="migrateLocalData" class="primary full">Asociar mis datos a esta cuenta</button>
        </section>`:""}

        <section class="card account-identity-card">
          <div class="card-heading-row">
            <div><h2>Identidad visible</h2><p class="subtle">El alias y el avatar se sincronizan entre tus dispositivos.</p></div>
            <div class="account-avatar-preview" id="accountAvatarPreview">${esc(accountAvatarContent(avatarKey))}</div>
          </div>
          <label><span>Alias</span><input id="accountAlias" type="text" value="${esc(alias)}" maxlength="30" autocomplete="nickname" placeholder="${esc(accountDisplayName(user))}"></label>
          <span class="field-label">Elige un avatar</span>
          <div class="account-avatar-grid">
            ${ACCOUNT_AVATAR_OPTIONS.map(option=>`<button type="button" class="account-avatar-option ${option.key===avatarKey?"selected":""}" data-avatar-key="${option.key}" aria-pressed="${option.key===avatarKey}">
              <span>${esc(option.icon||accountInitials(alias||accountDisplayName(user)))}</span><small>${esc(option.label)}</small>
            </button>`).join("")}
          </div>
          ${state.accountProfileStatus==="loading"?`<p class="subtle account-profile-status">Cargando perfil de cuenta…</p>`:""}
          ${state.accountProfileStatus==="error"?`<p class="verification-message error account-profile-status">No se pudo cargar el perfil. Ejecuta <strong>database/supabase/account-profile.sql</strong> en Supabase y vuelve a iniciar sesión.</p>`:""}
          <button id="saveAccountProfile" class="primary full">Guardar cambios</button>
        </section>

        <section class="card account-data-card">
          <h2>Datos de la cuenta</h2>
          <div class="account-data-list">
            <div><span>Correo electrónico</span><strong>${esc(user.email||"No disponible")}</strong></div>
            <div><span>Correo verificado</span><strong class="${isEmailConfirmed(user)?"verified":"pending"}">${isEmailConfirmed(user)?"Sí":"No"}</strong></div>
            <div><span>Cuenta creada</span><strong>${esc(createdAtLabel)}</strong></div>
          </div>
        </section>

        <section class="card account-password-card">
          <h2>Cambiar contraseña</h2>
          <p class="subtle">La sesión actual se mantendrá abierta después del cambio.</p>
          <button type="button" id="openAccountPassword" class="secondary full" ${state.accountPasswordEditorOpen?"hidden":""}>Cambiar contraseña</button>
          <div id="accountPasswordForm" class="account-password-form" ${state.accountPasswordEditorOpen?"":"hidden"}>
            <label><span>Nueva contraseña</span><input id="accountNewPassword" type="password" autocomplete="new-password" minlength="8"></label>
            <label><span>Confirmar nueva contraseña</span><input id="accountConfirmPassword" type="password" autocomplete="new-password" minlength="8"></label>
            <label id="accountPasswordNonceRow" ${state.accountPasswordReauthRequired?"":"hidden"}><span>Código de verificación</span><input id="accountPasswordNonce" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="12" placeholder="Código enviado a tu correo"></label>
            <div id="accountPasswordMessage" class="verification-message account-password-message ${state.accountPasswordMessage?.type||""}" role="${state.accountPasswordMessage?.type==="error"?"alert":"status"}" ${state.accountPasswordMessage?"":"hidden"}>${state.accountPasswordMessage?esc(state.accountPasswordMessage.text):""}</div>
            <div class="settings-actions">
              <button type="button" id="cancelAccountPassword" class="secondary">Cancelar</button>
              <button type="button" id="saveAccountPassword" class="primary">Guardar contraseña</button>
            </div>
          </div>
        </section>

        <section class="card">
          <h2>Separación y seguridad</h2>
          <div class="security-check-list">
            <article class="ok"><span>✓</span><div><strong>Cuenta identificada</strong><small>Cada registro se asocia al UUID de esta cuenta.</small></div></article>
            <article class="ok"><span>✓</span><div><strong>Row Level Security</strong><small>El esquema incluido restringe cada fila a su propietario.</small></div></article>
            <article class="${security.publicKeyConfigured?"ok":"warning"}"><span>${security.publicKeyConfigured?"✓":"!"}</span><div><strong>Clave pública</strong><small>${security.publicKeyConfigured?"Configurada para operaciones normales.":"Pendiente de configurar en modo desarrollador."}</small></div></article>
            <article class="ok"><span>✓</span><div><strong>Sin claves secretas en la app</strong><small>La app cliente no necesita service_role.</small></div></article>
          </div>
        </section>

        <section class="card sync-v2-card">
          <div class="card-heading-row"><div><h2>Sincronización segura</h2><p class="subtle">Controla revisiones y evita sobrescribir cambios de otro dispositivo.</p></div><span class="mode-pill">v2</span></div>
          <div class="security-check-list">
            <article class="ok"><span>✓</span><div><strong>Dispositivo identificado</strong><small>Identidad local preparada</small></div></article>
            <article class="ok"><span>✓</span><div><strong>Revisión local</strong><small>${getLocalRevision()}</small></div></article>
            <article class="ok"><span>✓</span><div><strong>Última revisión remota</strong><small>${getLastRemoteRevision()}</small></div></article>
          </div>
          <label><span>Cuando haya conflicto</span><select id="syncConflictPreference"><option value="ask" ${getSyncConflictPreference()==="ask"?"selected":""}>Preguntarme</option><option value="local" ${getSyncConflictPreference()==="local"?"selected":""}>Mantener este dispositivo</option><option value="remote" ${getSyncConflictPreference()==="remote"?"selected":""}>Usar la nube</option></select></label>
          <button id="exportSyncAudit" class="secondary full">Exportar registro de sincronización</button>
        </section>

        <section class="card">
          <h2>Copia y sincronización</h2>
          <div class="settings-actions">
            <button id="accountSyncNow" class="primary">Sincronizar ahora</button>
            <button id="accountExport" class="secondary">Exportar copia</button>
          </div>
          <p class="subtle">Última sincronización: ${formatSyncDate(getLastSyncAt())}</p>
        </section>

        <section class="card danger-zone">
          <h2>Privacidad y eliminación</h2>
          <p class="subtle">Puedes borrar la copia alojada en la nube o registrar una solicitud de eliminación completa de la cuenta.</p>
          <button id="deleteCloudData" class="danger-soft full">Borrar mis datos de la nube</button>
          <button id="requestAccountDeletion" class="danger-soft full">Solicitar eliminación de cuenta</button>
          <button id="accountSignOut" class="secondary full">Cerrar sesión</button>
        </section>
      `:`
        <section class="card auth-hero-card">
          <span class="section-kicker">GYMOS MULTIUSUARIO</span>
          <h1>Tu espacio personal de entrenamiento</h1>
          <p>Cada cuenta mantiene sus entrenamientos, peso, nutrición y métricas de salud separados del resto.</p>
          <div class="auth-feature-row">
            <span>Cuenta propia</span><span>Datos aislados</span><span>Sincronización</span>
          </div>
        </section>

        <section class="card">
          <div class="segmented-control">
            <button data-account-mode="login" class="${state.accountMode==="login"?"active":""}">Iniciar sesión</button>
            <button data-account-mode="signup" class="${state.accountMode==="signup"?"active":""}">Crear cuenta</button>
          </div>
          <div id="accountMessage" class="verification-message ${state.accountMessage?.type||""}" role="${state.accountMessage?.type==="error"?"alert":"status"}" ${state.accountMessage?"":"hidden"}>${state.accountMessage?esc(state.accountMessage.text):""}</div>
          ${state.accountMode==="signup"?`
            <label><span>Nombre</span><input id="accountName" type="text" autocomplete="name" maxlength="80" placeholder="Tu nombre"></label>
          `:""}
          <label><span>Correo</span><input id="accountEmail" type="email" autocomplete="email" placeholder="tu@email.com" value="${esc(getSyncConfig().email||"")}"></label>
          <label><span>Contraseña</span><input id="accountPassword" type="password" autocomplete="${state.accountMode==="signup"?"new-password":"current-password"}" minlength="8" placeholder="Mínimo 8 caracteres"></label>
          ${state.accountMode==="signup"?`
            <label class="consent-row"><input id="accountConsent" type="checkbox"><span>Acepto que GymOS almacene mis datos de entrenamiento y salud en mi cuenta.</span></label>
          `:""}
          <button id="accountSubmit" class="primary full">${state.accountMode==="signup"?"Crear mi cuenta":"Iniciar sesión"}</button>
          
          ${state.accountMode==="login"?`<button id="accountResetPassword" class="text-button full">He olvidado mi contraseña</button>`:""}
        </section>

        <section class="card privacy-summary-card">
          <h2>Cómo se protegen tus datos</h2>
          <p>La base de datos usa políticas por usuario. La aplicación nunca debe incluir una clave administrativa y ningún usuario debería poder consultar filas de otra cuenta.</p>
        </section>
      `}
    </main>
  </div>`;

  const backAccount=document.getElementById("backAccount");
  if(backAccount) backAccount.onclick=()=>{state.accountIdentityDirty=false;state.screen="settings";renderSettings();};

  if(user){
    document.querySelectorAll("[data-avatar-key]").forEach(button=>button.onclick=()=>{
      state.accountIdentityDirty=true;
      document.querySelectorAll("[data-avatar-key]").forEach(option=>{
        const selected=option===button;
        option.classList.toggle("selected",selected);
        option.setAttribute("aria-pressed",String(selected));
      });
      const aliasValue=normalizeAccountAlias(document.getElementById("accountAlias").value)||accountDisplayName(user);
      document.getElementById("accountAvatarPreview").textContent=accountAvatarContent(button.dataset.avatarKey,aliasValue);
    });
    document.getElementById("accountAlias").oninput=event=>{
      state.accountIdentityDirty=true;
      const initialsButton=document.querySelector('[data-avatar-key="initials"] span');
      const displayValue=normalizeAccountAlias(event.target.value)||accountDisplayName(user);
      if(initialsButton) initialsButton.textContent=accountInitials(displayValue);
      if(document.querySelector('[data-avatar-key="initials"]')?.classList.contains("selected")){
        document.getElementById("accountAvatarPreview").textContent=accountInitials(displayValue);
      }
    };
    const migrateButton=document.getElementById("migrateLocalData");
    if(migrateButton) migrateButton.onclick=async()=>{
      migrateButton.disabled=true;
      migrateButton.textContent="Asociando datos…";
      try{
        await migrateLocalDataToAccount();
        toast("Datos asociados a tu cuenta");
        renderAccount();
      }catch(error){
        showAccountManagementMessage("error",error?.message||"No se pudieron asociar los datos.");
        migrateButton.disabled=false;
        migrateButton.textContent="Asociar mis datos a esta cuenta";
      }
    };
    document.getElementById("syncConflictPreference").onchange=e=>{setSyncConflictPreference(e.target.value);toast("Preferencia guardada");};
    document.getElementById("exportSyncAudit").onclick=()=>{
      const blob=new Blob([JSON.stringify({generatedAt:new Date().toISOString(),security:syncSecurityState(),audit:getSyncAudit()},null,2)],{type:"application/json"});
      const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=`gymos-sync-audit-${new Date().toISOString().slice(0,10)}.json`;link.click();URL.revokeObjectURL(url);
    };
    document.getElementById("saveAccountProfile").onclick=async()=>{
      const button=document.getElementById("saveAccountProfile");
      const aliasInput=document.getElementById("accountAlias");
      const selectedAvatar=document.querySelector("[data-avatar-key].selected")?.dataset.avatarKey||"initials";
      const normalizedAlias=normalizeAccountAlias(aliasInput.value);
      aliasInput.value=normalizedAlias;
      button.disabled=true;
      button.textContent="Guardando…";
      try{
        await saveAccountIdentityProfile(normalizedAlias,selectedAvatar);
        state.accountManagementMessage={type:"success",text:"Alias y avatar guardados correctamente."};
        renderAccount();
      }catch(error){
        showAccountManagementMessage("error",error?.message||"No se pudieron guardar el alias y el avatar.");
        button.disabled=false;
        button.textContent="Guardar cambios";
      }
    };
    const openPasswordButton=document.getElementById("openAccountPassword");
    const passwordForm=document.getElementById("accountPasswordForm");
    openPasswordButton.onclick=()=>{
      state.accountPasswordEditorOpen=true;
      state.accountPasswordMessage=null;
      state.accountPasswordReauthRequired=false;
      openPasswordButton.hidden=true;
      passwordForm.hidden=false;
      document.getElementById("accountPasswordMessage").hidden=true;
      document.getElementById("accountPasswordNonceRow").hidden=true;
      document.getElementById("accountPasswordNonce").value="";
      document.getElementById("accountNewPassword").focus();
    };
    document.getElementById("cancelAccountPassword").onclick=()=>{
      state.accountPasswordEditorOpen=false;
      state.accountPasswordMessage=null;
      state.accountPasswordReauthRequired=false;
      document.getElementById("accountNewPassword").value="";
      document.getElementById("accountConfirmPassword").value="";
      document.getElementById("accountPasswordNonce").value="";
      document.getElementById("accountPasswordMessage").hidden=true;
      document.getElementById("accountPasswordNonceRow").hidden=true;
      passwordForm.hidden=true;
      openPasswordButton.hidden=false;
    };
    document.getElementById("saveAccountPassword").onclick=async()=>{
      const newPasswordInput=document.getElementById("accountNewPassword");
      const confirmationInput=document.getElementById("accountConfirmPassword");
      const nonceInput=document.getElementById("accountPasswordNonce");
      const nonceRow=document.getElementById("accountPasswordNonceRow");
      const messageElement=document.getElementById("accountPasswordMessage");
      const button=document.getElementById("saveAccountPassword");
      const showPasswordMessage=(type,text)=>{
        state.accountPasswordMessage={type,text};
        const visibleMessage=document.getElementById("accountPasswordMessage")||messageElement;
        visibleMessage.className=`verification-message account-password-message ${type}`;
        visibleMessage.setAttribute("role",type==="error"?"alert":"status");
        visibleMessage.textContent=text;
        visibleMessage.hidden=false;
      };
      const newPassword=newPasswordInput.value;
      const confirmation=confirmationInput.value;

      if(!newPassword||!confirmation){
        showPasswordMessage("error","Completa ambos campos de contraseña.");
        return;
      }
      if(newPassword.length<8){
        showPasswordMessage("error","La contraseña debe tener al menos 8 caracteres.");
        return;
      }
      if(newPassword!==confirmation){
        showPasswordMessage("error","Las contraseñas no coinciden.");
        return;
      }
      const nonce=nonceInput.value.trim();
      if(state.accountPasswordReauthRequired&&!nonce){
        showPasswordMessage("error","Introduce el código de verificación enviado a tu correo.");
        return;
      }
      if(button.disabled) return;
      state.accountPasswordMessage=null;
      messageElement.hidden=true;
      button.disabled=true;
      button.textContent="Guardando…";
      try{
        const client=getSupabaseClient();
        if(!client||!isAppAuthenticated()){
          showPasswordMessage("error","Tu sesión ya no es válida. Cierra sesión y vuelve a entrar.");
          return;
        }
        const passwordOwnerId=currentRoutineOwnerOrNull();
        const passwordUserId=state.syncUser.id;
        const assertPasswordOwner=()=>{
          assertActiveLocalOwner(passwordOwnerId);
          if(state.syncUser?.id!==passwordUserId) throw new Error("owner_changed");
        };
        let data,error;
        if(state.accountPasswordReauthRequired){
          ({data,error}=await client.auth.updateUser({
            password:newPassword,
            nonce
          }));
        }else{
          ({data,error}=await client.auth.updateUser({
            password:newPassword
          }));
        }
        assertPasswordOwner();

        if(error){
          const code=String(error.code||"").toLowerCase();
          const errorMessage=String(error.message||"").toLowerCase();
          if(code==="same_password"||errorMessage.includes("same password")){
            showPasswordMessage("error","La nueva contraseña debe ser diferente de la actual.");
          }else if(code==="reauthentication_needed"||errorMessage.includes("reauthentication")){
            const {error:reauthError}=await client.auth.reauthenticate();
            assertPasswordOwner();
            if(reauthError){
              console.error("PASSWORD REAUTHENTICATION ERROR",{
                code:reauthError.code,status:reauthError.status
              });
              const reauthCode=String(reauthError.code||"").toLowerCase();
              if(["session_not_found","refresh_token_not_found","user_not_found"].includes(reauthCode)){
                showPasswordMessage("error","Tu sesión ya no es válida. Cierra sesión y vuelve a entrar.");
              }else{
                showPasswordMessage("error","No se pudo verificar tu identidad.");
              }
            }else{
              state.accountPasswordReauthRequired=true;
              nonceRow.hidden=false;
              showPasswordMessage("error","Por seguridad, debes volver a verificar tu identidad antes de cambiar la contraseña.");
              nonceInput.focus();
            }
          }else if(
            ["session_not_found","refresh_token_not_found","user_not_found"].includes(code)||
            errorMessage.includes("auth session missing")||
            errorMessage.includes("session expired")||
            errorMessage.includes("invalid refresh token")
          ){
            showPasswordMessage("error","Tu sesión ya no es válida. Cierra sesión y vuelve a entrar.");
          }else if(code==="weak_password"||errorMessage.includes("weak password")){
            showPasswordMessage("error",error.message||"La contraseña no cumple los requisitos de seguridad.");
          }else{
            console.error("PASSWORD UPDATE ERROR",{
              code:error.code,
              status:error.status
            });
            showPasswordMessage("error","No se pudo cambiar la contraseña.");
          }
          return;
        }

        if(!data?.user){
          console.error("PASSWORD UPDATE ERROR: missing user");
          showPasswordMessage("error","No se pudo cambiar la contraseña.");
          return;
        }

        const {
          data:{session}
        }=await client.auth.getSession();
        assertPasswordOwner();
        const {data:userData,error:userError}=await client.auth.getUser();
        assertPasswordOwner();
        if(!session||userError||userData?.user?.id!==passwordUserId){
          console.error("PASSWORD SESSION VERIFICATION ERROR",{
            code:userError?.code,status:userError?.status
          });
        }

        const visibleNewPassword=document.getElementById("accountNewPassword")||newPasswordInput;
        const visibleConfirmation=document.getElementById("accountConfirmPassword")||confirmationInput;
        const visibleNonce=document.getElementById("accountPasswordNonce")||nonceInput;
        const visibleNonceRow=document.getElementById("accountPasswordNonceRow")||nonceRow;
        visibleNewPassword.value="";
        visibleConfirmation.value="";
        visibleNonce.value="";
        visibleNonceRow.hidden=true;
        state.accountPasswordReauthRequired=false;
        showPasswordMessage("success","Contraseña actualizada correctamente.");
      }catch(error){
        console.error("UNEXPECTED PASSWORD UPDATE ERROR",{
          code:error?.code||error?.message,status:error?.status
        });
        const code=String(error?.code||"").toLowerCase();
        if(code==="same_password"){
          showPasswordMessage("error","La nueva contraseña debe ser diferente de la actual.");
        }else if(code==="reauthentication_needed"){
          showPasswordMessage("error","Por seguridad, debes volver a verificar tu identidad antes de cambiar la contraseña.");
        }else if(["session_not_found","refresh_token_not_found","user_not_found"].includes(code)){
          showPasswordMessage("error","Tu sesión ya no es válida. Cierra sesión y vuelve a entrar.");
        }else if(code==="weak_password"){
          showPasswordMessage("error",error?.message||"La contraseña no cumple los requisitos de seguridad.");
        }else{
          showPasswordMessage("error","No se pudo cambiar la contraseña.");
        }
      }finally{
        const visibleButton=document.getElementById("saveAccountPassword")||button;
        visibleButton.disabled=false;
        visibleButton.textContent="Guardar contraseña";
      }
    };
    document.getElementById("accountSyncNow").onclick=async()=>{
      try{await syncNow();toast("Sincronización completada");renderAccount();}
      catch(error){showAccountManagementMessage("error",error?.message||"No se pudo sincronizar.");}
    };
    document.getElementById("accountExport").onclick=()=>exportBackup();
    document.getElementById("deleteCloudData").onclick=async()=>{
      if(!confirm("¿Borrar la copia de tus datos alojada en la nube? Los datos del dispositivo no se borrarán.")) return;
      try{await deleteCloudData();toast("Datos de la nube eliminados");}
      catch(error){showAccountManagementMessage("error",error?.message||"No se pudieron borrar los datos de la nube.");}
    };
    document.getElementById("requestAccountDeletion").onclick=async()=>{
      if(!confirm("¿Registrar una solicitud de eliminación completa de tu cuenta?")) return;
      try{
        const ownerId=state.syncUser.id;
        await requestAccountDeletion();
        await signOutSync();
        deleteOwnerLocalData(ownerId,{removeOwner:true});
        state.accountMode="login";
        state.screen="account";
        toast("Solicitud registrada y datos locales eliminados");
        render();
      }catch(error){showAccountManagementMessage("error",error?.message||"No se pudo registrar la solicitud.");}
    };
    document.getElementById("accountSignOut").onclick=async()=>{
      if(!confirm("¿Quieres cerrar la sesión de GymOS?")) return;
      if(state.syncUser) saveCurrentUserVault(state.syncUser.id);
      try{
        await signOutSync();
        deactivateLocalUser();
        state.accountMode="login";
        state.screen="account";
        render();
      }catch(error){
        showAccountManagementMessage("error",error?.message||"No se pudo cerrar la sesión.");
      }
    };
  }else{
    document.querySelectorAll("[data-account-mode]").forEach(button=>button.onclick=()=>{
      state.accountMode=button.dataset.accountMode;
      state.accountMessage=null;
      renderAccount();
    });
    document.getElementById("accountSubmit").onclick=async()=>{
      const email=document.getElementById("accountEmail").value.trim();
      const password=document.getElementById("accountPassword").value;
      if(!email){
        showAccountMessage("error","Introduce tu correo.");
        return;
      }
      if(password.length<8){
        showAccountMessage("error","La contraseña debe tener al menos 8 caracteres.");
        return;
      }
      try{
        saveSyncConfig({...getSyncConfig(),email});
        if(state.accountMode==="signup"){
          const consent=document.getElementById("accountConsent");
          if(!consent.checked){
            showAccountMessage("error","Debes aceptar el almacenamiento de tus datos para crear la cuenta.");
            return;
          }
          const name=document.getElementById("accountName").value.trim();
          if(!name){
            showAccountMessage("error","Introduce tu nombre.");
            return;
          }
          await signUpWithPassword(email,password,name);
          state.accountMessage=null;
          state.emailVerificationMessage={type:"success",text:"Cuenta creada. Revisa tu correo y abre el enlace de confirmación."};
          toast("Cuenta creada");
        }else{
          await signInWithPassword(email,password);
          state.accountMessage=null;
          toast(isAppAuthenticated()?"Sesión iniciada":"Confirma tu correo para continuar");
        }
        if(state.syncUser){
          state.screen="home";
          render();
        }else{
          renderAccount();
        }
      }catch(error){
        showAccountMessage("error",friendlyAuthError(error,"No se pudo completar el acceso."));
      }
    };

    const resetButton=document.getElementById("accountResetPassword");
    if(resetButton) resetButton.onclick=async()=>{
      const email=document.getElementById("accountEmail").value.trim();
      if(!email){
        showAccountMessage("error","Introduce primero tu correo.");
        return;
      }
      try{
        await requestPasswordReset(email);
        showAccountMessage("success","Te hemos enviado un correo para restablecer la contraseña.");
      }catch(error){
        showAccountMessage("error",friendlyAuthError(error,"No se pudo enviar el correo de recuperación."));
      }
    };
  }
}

function renderAiSettings(){
  const settings=getCoachSettings();
  const connection=getCoachConnection();
  const provider=connection.provider||"rules";
  const status=aiStatusLabel(connection.aiStatus||connection.status,settings.aiEnabled);
  const message=state.aiSettingsMessage;
  app.innerHTML=`<div class="app-shell">
    <header class="topbar">
      <button id="backAiSettings" class="back-button" aria-label="Volver a Más">←</button>
      <div><div class="brand">Coach IA</div><div class="subtle">Configuración de inteligencia artificial</div></div><span></span>
    </header>
    <main class="screen ai-settings-screen">
      <section class="card ai-status-card">
        <div class="card-heading-row">
          <div><span class="section-kicker">PROVEEDOR ACTUAL</span><h1>${esc(aiProviderLabel(provider))}</h1></div>
          <span class="ai-connection-status status-${esc((connection.aiStatus||"unknown").replace("_","-"))}">${esc(status)}</span>
        </div>
        <dl>
          <div><dt>Modelo configurado</dt><dd>${esc(connection.model||"No configurado")}</dd></div>
          <div><dt>Última comprobación</dt><dd>${connection.aiCheckedAt?formatSyncDate(connection.aiCheckedAt):"Todavía no"}</dd></div>
          <div><dt>Modo del usuario</dt><dd>${settings.aiEnabled?"Mensajes de IA activados":"Reglas de GymOS"}</dd></div>
        </dl>
      </section>

      <section class="card ai-user-preferences">
        <span class="section-kicker">PREFERENCIA PERSONAL</span>
        <h2>Redacción de mensajes</h2>
        <label class="ai-enable-control">
          <input id="aiMessagesEnabled" type="checkbox" ${settings.aiEnabled?"checked":""}>
          <span><strong>Activar mensajes redactados con IA</strong><small>El análisis y las decisiones seguirán procediendo de las reglas internas.</small></span>
        </label>
        <div class="ai-provider-options" aria-label="Proveedores disponibles">
          ${[
            ["rules","Sin IA / Reglas de GymOS"],
            ["gemini","Gemini"],
            ["openai","OpenAI"],
            ["ollama","Ollama local"]
          ].map(([value,label])=>`<article class="${provider===value?"active":""}"><span>${esc(label)}</span><small>${provider===value?"Configurado por el servidor":"Disponible mediante configuración del servidor"}</small></article>`).join("")}
        </div>
        ${provider==="ollama"?`<p class="ai-ollama-warning">Ollama requiere que el servidor donde se ejecuta el modelo esté encendido y accesible.</p>`:""}
      </section>

      <section class="card ai-privacy-card">
        <span class="section-kicker">PRIVACIDAD</span>
        <h2>Datos mínimos</h2>
        <p>Los datos mínimos de la sesión pueden enviarse al proveedor configurado para redactar el comentario del Coach.</p>
        <ul><li>Ejercicio, carga y repeticiones.</li><li>RIR, estado estructurado y recomendación calculada.</li></ul>
        <p class="subtle">Nunca se envían correo, nombre completo, fotografías, credenciales ni claves del proveedor.</p>
      </section>

      ${developerModeEnabled()?`<section class="card ai-admin-card">
        <span class="section-kicker">ADMINISTRACIÓN DEL SERVIDOR</span>
        <h2>Backend seguro</h2>
        <p class="subtle">La URL puede guardarse en este dispositivo. El proveedor, modelo y claves se configuran exclusivamente mediante variables de entorno del servidor.</p>
        <label><span>URL del backend</span><input id="aiBackendUrl" type="url" value="${esc(settings.backendUrl||"")}" placeholder="https://backend.example.com"></label>
        <div class="ai-environment-reference">
          <article><strong>Gemini</strong><code>AI_PROVIDER · GEMINI_API_KEY · GEMINI_MODEL</code></article>
          <article><strong>OpenAI</strong><code>AI_PROVIDER · OPENAI_API_KEY · OPENAI_MODEL</code></article>
          <article><strong>Ollama</strong><code>AI_PROVIDER · OLLAMA_BASE_URL · OLLAMA_MODEL</code></article>
        </div>
        <p class="subtle">Una suscripción de ChatGPT no incluye automáticamente acceso a la API de OpenAI.</p>
      </section>`:""}

      <p id="aiSettingsMessage" class="verification-message ${message?.type||""}" role="${message?.type==="error"?"alert":"status"}" ${message?"":"hidden"}>${message?esc(message.text):""}</p>
      <div class="ai-settings-actions">
        <button id="testAiConnection" class="secondary" type="button">Probar conexión</button>
        <button id="saveAiSettings" class="primary" type="button">Guardar</button>
        <button id="disableAi" class="text-button" type="button">Desactivar IA</button>
      </div>
    </main>${nav("settings")}
  </div>`;
  document.getElementById("backAiSettings").onclick=()=>{state.aiSettingsMessage=null;state.screen="settings";renderSettings();};
  document.getElementById("testAiConnection").onclick=async event=>{
    const button=event.currentTarget;button.disabled=true;button.textContent="Comprobando…";
    try{
      const result=await fetchAiConfigurationStatus(true);
      state.aiSettingsMessage={
        type:result.aiStatus==="connected"?"success":"error",
        text:result.aiStatus==="connected"
          ?`Conexión correcta con ${aiProviderLabel(result.provider)}.`
          :result.aiStatus==="disabled"
            ?"El backend está configurado para utilizar las reglas de GymOS."
            :"El proveedor no está configurado o no responde."
      };
    }catch(error){
      state.aiSettingsMessage={type:"error",text:error.message||"No se pudo comprobar la conexión."};
    }
    renderAiSettings();
  };
  document.getElementById("saveAiSettings").onclick=async event=>{
    const button=event.currentTarget;button.disabled=true;button.textContent="Guardando…";
    const backendInput=document.getElementById("aiBackendUrl");
    const next={...settings,backendUrl:backendInput?.value.trim()||settings.backendUrl,aiEnabled:document.getElementById("aiMessagesEnabled").checked};
    saveCoachSettings(next);
    if(next.aiEnabled){
      try{
        const result=await fetchAiConfigurationStatus(true);
        if(result.aiStatus!=="connected"){
          saveCoachSettings({...next,aiEnabled:false});
          state.aiSettingsMessage={
            type:"error",
            text:result.provider==="ollama"
              ?"No se pudo conectar con Ollama. La IA permanece desactivada."
              :"El proveedor no está conectado. La IA permanece desactivada."
          };
        }else{
          state.aiSettingsMessage={type:"success",text:`Configuración guardada. ${aiProviderLabel(result.provider)} está conectado.`};
        }
      }catch(error){
        saveCoachSettings({...next,aiEnabled:false});
        state.aiSettingsMessage={type:"error",text:"No se pudo comprobar el backend. La IA permanece desactivada."};
      }
    }else{
      state.aiSettingsMessage={type:"success",text:"Configuración guardada en modo Reglas de GymOS."};
    }
    markLocalUpdated();
    renderAiSettings();
  };
  document.getElementById("disableAi").onclick=()=>{
    saveCoachSettings({...settings,aiEnabled:false});
    markLocalUpdated();
    state.aiSettingsMessage={type:"success",text:"Los mensajes de IA se han desactivado. GymOS seguirá usando sus reglas internas."};
    renderAiSettings();
  };
  bindNav();
}

let routineImportReadSequence=0;
function routineIoApi(){
  if(!window.GymOSRoutineIO) throw new Error("El módulo de archivos de rutina no está disponible.");
  return window.GymOSRoutineIO;
}
function downloadRoutineFile(content,fileName,type){
  const blob=content instanceof Blob?content:new Blob([content],{type});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement("a");
  anchor.href=url;
  anchor.download=fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
function styleRoutineWorksheet(sheet,columnCount,source={}){
  const widths=[18,12,24,22,20,18,22,30,10,18,10,16,22,18,20,28];
  sheet["!cols"]=widths.slice(0,columnCount).map(width=>({wch:width}));
  (source.hiddenColumns||[]).forEach(index=>{
    sheet["!cols"][index]={...(sheet["!cols"][index]||{wch:18}),hidden:true};
  });
  if(sheet["!ref"]) sheet["!autofilter"]={ref:sheet["!ref"]};
}
function downloadRoutineWorkbook(model,fileName){
  if(!window.XLSX) throw new Error("No se pudo cargar el lector de hojas de cálculo.");
  const workbook=XLSX.utils.book_new();
  model.sheets.forEach(source=>{
    const sheet=XLSX.utils.aoa_to_sheet(source.rows);
    styleRoutineWorksheet(sheet,Math.max(1,...source.rows.map(row=>row.length)),source);
    XLSX.utils.book_append_sheet(workbook,sheet,source.name);
  });
  workbook.Workbook=workbook.Workbook||{};
  workbook.Workbook.Sheets=model.sheets.map(source=>({
    name:source.name,Hidden:source.veryHidden?2:source.hidden?1:0
  }));
  XLSX.writeFile(workbook,fileName,{bookType:"xlsx",compression:true});
}
function exportCurrentRoutineFile(format,expectedOwnerId=null){
  if(expectedOwnerId&&currentRoutineOwnerOrNull()!==expectedOwnerId){
    throw new Error("La cuenta activa ha cambiado. Vuelve a solicitar la exportación.");
  }
  if(format!=="xlsx") throw new Error("El Centro de Rutina exporta únicamente Excel XLSX.");
  const routine=routineHubCurrentRoutine();
  const rows=window.GymOSRoutineExcel.workbookModel(routine).sheets
    .find(sheet=>sheet.name==="Rutina")?.rows||[];
  if(rows.length<=1) throw new Error("Todavía no hay ejercicios que exportar.");
  const fileName=`gymos-rutina-${new Date().toISOString().slice(0,10)}.xlsx`;
  downloadRoutineWorkbook(window.GymOSRoutineExcel.workbookModel(routine),fileName);
}
function downloadOfficialRoutineTemplate(format){
  if(format!=="xlsx") throw new Error("La plantilla oficial está disponible en formato XLSX.");
  const model=window.GymOSRoutineExcel.templateModel();
  downloadRoutineWorkbook(model,`gymos-plantilla-rutina-v${model.templateVersion}.xlsx`);
}
function routineImportContext(fileName,format){
  return {
    fileName,format,exerciseLibrary:getExerciseLibrary(),
    userProfile:window.GymOSProfileData?.getUserProfile?.()||{},
    currentLifeState:window.GymOSProfileData?.getCurrentLifeState?.()||null
  };
}
function currentRoutineOwnerOrNull(){
  try{return routineWorkflowOwnerId();}
  catch(_){return null;}
}
function workbookToRoutineModel(workbook){
  const api=routineIoApi();
  const formulaCells=[],errors=[],macroSheets=[],externalLinks=[];
  if(workbook.SheetNames.length>api.MAX_SHEETS){
    return {
      sheets:[],formulaCells:[],hasMacros:Boolean(workbook.vbaraw),
      errors:[{
        code:"too_many_sheets",severity:"error",row:null,column:null,value:null,
        message:`El libro supera el límite de ${api.MAX_SHEETS} hojas.`
      }]
    };
  }
  const workbookSheets=workbook.Workbook?.Sheets||[];
  workbook.SheetNames.forEach(name=>{
    const sheet=workbook.Sheets[name];
    if(sheet["!type"]==="macro") macroSheets.push(name);
    const cellKeys=Object.keys(sheet).filter(key=>key[0]!=="!");
    if(cellKeys.length>(api.MAX_ROWS+1)*api.MAX_COLUMNS){
      errors.push({
        code:"sheet_too_large",severity:"error",row:null,column:name,value:null,
        message:`La hoja ${name} contiene demasiadas celdas.`
      });
      return;
    }
    cellKeys.forEach(key=>{
      if(sheet[key]?.f||sheet[key]?.F) formulaCells.push({
        sheet:name,cell:key,value:sheet[key]?.f||sheet[key]?.F
      });
      const target=String(sheet[key]?.l?.Target||"").trim();
      if(target&&!target.startsWith("#")) externalLinks.push({
        sheet:name,cell:key,target
      });
    });
  });
  const hasMacros=Boolean(workbook.vbaraw)||macroSheets.length>0;
  const sheets=formulaCells.length||errors.length||hasMacros?[]:workbook.SheetNames.map(name=>{
    const sheet=workbook.Sheets[name];
    const visibility=Number(
      workbookSheets.find(item=>item?.name===name)?.Hidden
    )||0;
    let decoded=null;
    try{decoded=sheet["!ref"]?XLSX.utils.decode_range(sheet["!ref"]):null;}
    catch(_){
      errors.push({
        code:"invalid_sheet_range",severity:"error",row:null,column:name,value:null,
        message:`La hoja ${name} declara un rango no válido.`
      });
    }
    if(decoded){
      const rowCount=decoded.e.r-decoded.s.r+1;
      const columnCount=decoded.e.c-decoded.s.c+1;
      if(rowCount>api.MAX_ROWS+1){
        errors.push({
          code:"too_many_rows",severity:"error",row:null,column:name,value:rowCount,
          message:`La hoja ${name} supera el límite de ${api.MAX_ROWS} filas.`
        });
      }
      if(columnCount>api.MAX_COLUMNS){
        errors.push({
          code:"too_many_columns",severity:"error",row:null,column:name,value:columnCount,
          message:`La hoja ${name} supera el límite de ${api.MAX_COLUMNS} columnas.`
        });
      }
    }
    return {
      name,hidden:visibility!==0,
      type:sheet["!type"]||null,
      macro:sheet["!type"]==="macro",
      rows:errors.length?[]:XLSX.utils.sheet_to_json(
        sheet,{header:1,raw:false,defval:"",range:0}
      )
    };
  });
  return {
    sheets:errors.length?[]:sheets,formulaCells,
    hasMacros,
    externalLinks:[
      ...externalLinks,
      ...Object.keys(workbook.files||{}).filter(key=>
        /externalLinks|externalLink/i.test(key)
      ).map(target=>({target}))
    ],
    errors
  };
}
function routineReadError(error){
  const raw=String(error?.message||"").toLowerCase();
  if(/password|encrypted|encryption|cipher/.test(raw)){
    return {code:"encrypted_file",message:"El archivo está protegido con contraseña o cifrado y no puede leerse."};
  }
  if(/unsupported|format|file type/.test(raw)){
    return {code:"unsupported_format",message:"No se reconoce el formato del archivo."};
  }
  return {code:"corrupt_file",message:"El archivo está dañado o no contiene una hoja de cálculo válida."};
}
async function handleRoutineFileSelection(file){
  if(state.routineFileBusy==="reading") return;
  const api=routineIoApi();
  const descriptor=api.validateFileDescriptor({
    name:file?.name,size:file?.size,type:file?.type
  });
  const ownerAtStart=currentRoutineOwnerOrNull();
  if(!ownerAtStart){routineFile.value="";return;}
  const baselineHash=window.GymOSRoutineProposals.routineHash(activeRoutineForComparison());
  const operationId=++routineImportReadSequence;
  state.routineFileBusy="reading";
  state.routineFileChooser=null;
  state.routineImport={
    ownerId:ownerAtStart,baselineHash,operationId,status:"reading",
    fileName:descriptor.fileName,format:descriptor.format,preview:null,
    message:null,errorCode:null
  };
  if(state.screen==="routineWorkflow") renderRoutineHub();
  if(state.screen==="routineHub") renderRoutineHub();
  try{
    if(!descriptor.valid){
      state.routineImport.status="error";
      state.routineImport.preview={
        state:"errors",fileName:descriptor.fileName,format:descriptor.format.toUpperCase(),
        sheetName:null,rowCount:0,sessionCount:0,exerciseCount:0,
        recognizedExerciseCount:0,sessions:[],warnings:[],errors:descriptor.errors,
        ignoredRows:[],activationCompatible:false,reviewRequired:false,canSave:false
      };
      return;
    }
    if(state.screen==="routineHub"&&descriptor.format!=="xlsx"){
      state.routineImport.status="error";
      state.routineImport.preview={
        state:"errors",fileName:descriptor.fileName,format:descriptor.format.toUpperCase(),
        sheetName:null,rowCount:0,sessionCount:0,exerciseCount:0,
        recognizedExerciseCount:0,sessions:[],warnings:[],
        errors:[window.GymOSRoutineExcel.issue(
          "xlsx_required","El Centro de Rutina admite la plantilla Excel XLSX v2."
        )],
        ignoredRows:[],activationCompatible:false,reviewRequired:false,canSave:false
      };
      return;
    }
    const bytes=await file.arrayBuffer();
    if(
      currentRoutineOwnerOrNull()!==ownerAtStart||
      state.routineImport?.operationId!==operationId
    ) return;
    let workbookModel;
    if(descriptor.format==="csv"){
      const parsed=api.parseCsvText(new TextDecoder("utf-8").decode(bytes));
      workbookModel={
        sheets:parsed.errors.length?[]:[{name:"Rutina",hidden:false,rows:parsed.rows}],
        formulaCells:[],hasMacros:false,errors:parsed.errors
      };
    }else{
      if(!window.XLSX) throw new Error("No se pudo cargar el lector de hojas de cálculo.");
      const workbook=XLSX.read(bytes,{
        type:"array",raw:true,cellFormula:true,cellHTML:false,bookVBA:true,
        bookFiles:true
      });
      workbookModel=workbookToRoutineModel(workbook);
    }
    const preview=descriptor.format==="xlsx"
      ?window.GymOSRoutineExcel.inspectWorkbook(
        workbookModel,routineImportContext(descriptor.fileName,descriptor.format)
      )
      :api.inspectWorkbook(
        workbookModel,routineImportContext(descriptor.fileName,descriptor.format)
      );
    if(
      currentRoutineOwnerOrNull()!==ownerAtStart||
      state.routineImport?.operationId!==operationId
    ) return;
    state.routineImport.preview=preview;
    state.routineImport.status=preview.state;
  }catch(error){
    if(
      currentRoutineOwnerOrNull()===ownerAtStart&&
      state.routineImport?.operationId===operationId
    ){
      const readable=routineReadError(error);
      console.error("Routine import read failed",{
        code:readable.code,errorName:error?.name||null
      });
      state.routineImport.status="error";
      state.routineImport.errorCode=readable.code;
      state.routineImport.message=readable.message;
    }
  }finally{
    if(operationId===routineImportReadSequence) state.routineFileBusy=null;
    routineFile.value="";
    if(state.screen==="routineWorkflow") renderRoutineHub();
    if(state.screen==="routineHub") renderRoutineHub();
  }
}
function routineImportIssueList(items,title){
  if(!items?.length) return "";
  const location=item=>item.row
    ?`Fila ${esc(item.row)}${item.column?` · ${esc(item.column)}`:""}`
    :esc(item.column||"Archivo");
  return `<section class="routine-import-issues ${title==="Errores"?"errors":"warnings"}">
    <h3>${esc(title)}</h3>
    <ul>${items.map(item=>`<li>${location(item)}: ${esc(item.message)}${item.value?` <strong>“${esc(item.value)}”</strong>`:""}</li>`).join("")}</ul>
  </section>`;
}
function renderRoutineImport(){
  const current=state.routineImport;
  if(!current||current.status==="reading"){
    return `<section class="routine-workflow-heading">
      <span class="section-kicker">IMPORTAR RUTINA</span>
      <h1>${current?.status==="reading"?"Leyendo archivo…":"Revisa antes de guardar"}</h1>
      <p>${current?.status==="reading"?"Estamos validando el contenido sin guardar ningún dato.":"Elige un XLSX, XLS o CSV. La rutina activa no cambiará."}</p>
    </section>
    <section class="card routine-import-empty">
      <button id="chooseRoutineFile" class="primary full" type="button" ${current?.status==="reading"?"disabled":""}>${current?.status==="reading"?"Leyendo…":"Elegir archivo"}</button>
      <button id="cancelRoutineImport" class="text-button full" type="button">Cancelar importación</button>
    </section>`;
  }
  const preview=current.preview;
  if(!preview){
    return `<section class="card routine-import-empty" role="alert">
      <h2>No se pudo leer el archivo</h2>
      <p>${esc(current.message||"Comprueba el formato y vuelve a intentarlo.")}</p>
      <button id="chooseRoutineFile" class="secondary full" type="button">Elegir otro archivo</button>
      <button id="cancelRoutineImport" class="text-button full" type="button">Cancelar importación</button>
    </section>`;
  }
  const corrections=(preview.corrections?.length
    ?preview.corrections
    :preview.warnings?.filter(item=>item.severity==="correction"))||[];
  const importWarnings=(preview.warnings||[]).filter(item=>item.severity!=="correction");
  return `<section class="routine-workflow-heading">
    <span class="section-kicker">PREVIEW DE IMPORTACIÓN</span>
    <h1>${esc(preview.fileName)}</h1>
    <p>${esc(preview.format)}${preview.sheetName?` · Hoja ${esc(preview.sheetName)}`:""} · Nada se ha guardado todavía.</p>
  </section>
  <section class="card routine-import-summary">
    <div><span>Filas</span><strong>${preview.rowCount}</strong></div>
    <div><span>Sesiones</span><strong>${preview.sessionCount}</strong></div>
    <div><span>Ejercicios</span><strong>${preview.exerciseCount}</strong></div>
    <div><span>Reconocidos</span><strong>${preview.recognizedExerciseCount}</strong></div>
    <div><span>Activación</span><strong>${preview.activationCompatible?"Compatible":preview.reviewRequired?"Requiere revisión":"Bloqueada"}</strong></div>
    <div><span>Revisión</span><strong>${preview.reviewRequired?"Necesaria":"Sin avisos"}</strong></div>
  </section>
  <section class="card routine-import-validation" aria-live="polite">
    <span class="section-kicker">VALIDACIÓN</span>
    <h2>${preview.errors?.length?"Requiere correcciones":"Lista para revisar"}</h2>
    ${corrections.length?`<p>${corrections.length} ${corrections.length===1?"nombre se ha":"nombres se han"} normalizado automáticamente usando ${corrections.length===1?"su ID":"sus IDs"} de GymOS.</p>`:""}
  </section>
  ${current.message?`<p class="routine-workflow-message error" role="alert">${esc(current.message)}</p>`:""}
  ${routineImportIssueList(preview.errors,"Errores")}
  ${routineImportIssueList(importWarnings,"Avisos")}
  ${preview.ignoredRows.length?`<p class="routine-import-ignored">${preview.ignoredRows.length} filas vacías ignoradas.</p>`:""}
  <section class="routine-import-sessions">
    ${preview.sessions.map(session=>`<article class="card">
      <div class="card-heading-row"><div><h2>${esc(session.name)}</h2><p>${esc(window.GymOSRoutineWorkflowUI.presentableLabel(session.focus,"Enfoque general"))}</p></div><span class="mode-pill">${session.exerciseCount}</span></div>
      <ol>${session.exercises.map(exercise=>`<li>
        <span>${exercise.order}</span><div><strong>${esc(exercise.name)}</strong><small>${exercise.sets} series · ${esc(exercise.target)} · RIR ${esc(exercise.rir)} · ${exercise.restSeconds} s</small></div>
      </li>`).join("")}</ol>
    </article>`).join("")}
  </section>
  <div class="routine-import-actions">
    <button id="cancelRoutineImport" class="text-button" type="button" ${state.routineFileBusy?"disabled":""}>Cancelar importación</button>
    <button id="chooseRoutineFile" class="secondary" type="button" ${state.routineFileBusy?"disabled":""}>Elegir otro archivo</button>
    <button id="saveRoutineImport" class="primary" type="button" ${preview.canSave&&["valid","warnings","error"].includes(current.status)&&!state.routineFileBusy?"":"disabled"}>${current.status==="saving"?"Guardando…":"Guardar como propuesta"}</button>
  </div>`;
}
function routineWorkflowOwnerId(){
  return routineProposalOwnerId();
}
function routineWorkflowLabels(){
  return {
    goals:window.GymOSProfileData?.GOAL_OPTIONS||[],
    lifeStates:window.GymOSProfileData?.LIFE_STATE_OPTIONS||[],
    phases:window.GymOSProfileData?.TRAINING_PHASE_OPTIONS||[],
    experience:[
      {id:"beginner",label:"Principiante o retomando"},
      {id:"returning",label:"Principiante o retomando"},
      {id:"intermediate",label:"Intermedio"},
      {id:"advanced",label:"Avanzado"}
    ],
    locations:[
      {id:"gym",label:"Gimnasio"},
      {id:"home",label:"Casa"},
      {id:"mixed",label:"Gimnasio y casa"},
      {id:"other",label:"Otro lugar"}
    ],
    equipment:[
      {id:"bodyweight",label:"Peso corporal"},{id:"mat",label:"Esterilla"},
      {id:"bench",label:"Banco"},{id:"adjustable_bench",label:"Banco ajustable"},
      {id:"dumbbells",label:"Mancuernas"},{id:"barbell",label:"Barra"},
      {id:"plates",label:"Discos"},{id:"squat_rack",label:"Rack"},
      {id:"smith_machine",label:"Multipower"},{id:"cable_machine",label:"Poleas"},
      {id:"resistance_band",label:"Bandas"},{id:"leg_press",label:"Prensa"},
      {id:"lat_pulldown",label:"Jalón"},{id:"seated_row",label:"Remo sentado"},
      {id:"treadmill",label:"Cinta"},{id:"stationary_bike",label:"Bicicleta"}
    ]
  };
}
function ensureRoutineWorkflowState(){
  const ownerId=routineWorkflowOwnerId();
  if(state.routineImport?.ownerId&&state.routineImport.ownerId!==ownerId){
    routineImportReadSequence+=1;
    state.routineImport=null;
    state.routineFileChooser=null;
    state.routineFileBusy=null;
    routineFile.value="";
  }
  state.routineWorkflow=window.GymOSRoutineWorkflowUI.resetFlowForOwner(
    state.routineWorkflow,ownerId
  );
  return state.routineWorkflow;
}
function routineWorkflowGenerationSource(){
  const profileApi=window.GymOSProfileData;
  return {
    userProfile:profileApi.getUserProfile(),
    currentLifeState:profileApi.getCurrentLifeState(),
    activeGoalCycle:profileApi.getActiveGoalCycle(),
    activeTrainingPhase:profileApi.getActiveTrainingPhase(),
    exerciseLibrary:getExerciseLibrary(),
    currentRoutine:activeRoutineForComparison(),
    workoutHistory:getHistory(),
    generationPreferences:{
      preferredExerciseIds:getFavoriteExercises().map(exercise=>exercise.id),
      style:profileApi.getUserProfile()?.trainingPreferences?.style||"",
      cardio:profileApi.getUserProfile()?.trainingPreferences?.cardio||""
    }
  };
}
function routineWorkflowSummary(){
  const ownerId=routineWorkflowOwnerId();
  return window.GymOSRoutineWorkflowUI.workflowSummaryModel({
    ownerId,
    currentRoutine:activeRoutineForComparison(),
    proposalRecords:getRoutineProposalRecords(ownerId),
    activationRecords:getRoutineActivationRecords(ownerId),
    activeProposalId:null,
    activeActivationId:null,
    activeGoalCycle:window.GymOSProfileData.getActiveGoalCycle(),
    activeTrainingPhase:window.GymOSProfileData.getActiveTrainingPhase(),
    labels:routineWorkflowLabels()
  });
}
function routineWorkflowStatusLabel(status){
  return {
    pending_review:"Pendiente de revisión",
    stale:"Obsoleta",
    review_required:"Requiere revisión",
    incompatible:"No compatible",
    unavailable:"No disponible"
  }[status]||"Pendiente";
}
function routineWorkflowBlockerLabel(code){
  return {
    invalid_owner:"No se pudo validar el propietario.",
    proposal_not_found:"La propuesta ya no existe.",
    owner_mismatch:"La propuesta pertenece a otra cuenta.",
    proposal_not_pending:"La propuesta ya no está pendiente.",
    proposal_stale:"La rutina cambió desde que se generó la propuesta.",
    baseline_mismatch:"La rutina actual ya no coincide con la utilizada al generar.",
    activation_incompatible:"La propuesta contiene una estructura de sesiones no compatible.",
    review_required:"La propuesta requiere revisión.",
    unresolved_questions:"Hay preguntas pendientes.",
    missing_patterns:"Faltan patrones obligatorios.",
    proposal_invalid:"La propuesta contiene errores.",
    proposal_errors:"La validación encontró errores de seguridad."
  }[code]||"La propuesta no puede activarse todavía.";
}
function routineWorkflowDate(value){
  if(!value) return "Sin fecha";
  const date=new Date(value);
  return Number.isNaN(date.getTime())
    ?"Sin fecha"
    :date.toLocaleString("es-ES",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
}
function routineWorkflowMessage(){
  const message=state.routineWorkflow?.message;
  if(!message) return "";
  return `<p class="routine-workflow-message ${esc(message.type||"info")}" role="${message.type==="error"?"alert":"status"}">${esc(message.text)}</p>`;
}
function renderRoutineWorkflowSummary(model,preparation){
  const proposal=model.pendingProposal;
  const activation=model.reversibleActivation;
  const blocked=model.blockedActivation;
  const missing=preparation.missing;
  return `
    <section class="routine-workflow-hero">
      <span class="section-kicker">RUTINA ACTUAL</span>
      <h1>Mi rutina</h1>
      <p>${model.routine.sessionCount
        ?`${model.routine.sessionCount} sesiones · ${model.routine.exerciseCount} ejercicios`
        :"Todavía no hay sesiones configuradas."}</p>
      <div class="routine-session-summary">
        ${model.routine.sessions.map(session=>`<article>
          <strong>${esc(session.name)}</strong>
          <span>${session.exerciseCount} ejercicios${session.focus?` · ${esc(session.focus)}`:""}</span>
        </article>`).join("")}
      </div>
    </section>
    <section class="card routine-context-card">
      <div><span>Objetivo actual</span><strong>${esc(model.goal)}</strong><button id="editRoutineGoal" class="text-button" type="button">${model.goal==="Sin configurar"?"Configurar objetivo":"Editar objetivo"}</button></div>
      <div><span>Fase</span><strong>${esc(model.phase)}</strong><button id="editRoutinePhase" class="text-button" type="button">${model.phase==="Sin configurar"?"Configurar fase":"Editar fase"}</button></div>
      <div><span>Perfil de entrenamiento</span><strong>${preparation.summary.days?`${preparation.summary.days} días · ${preparation.summary.duration||"—"} min`:"Sin configurar"}</strong><button id="editTrainingProfile" class="text-button" type="button">Editar perfil de entrenamiento</button></div>
      <div><span>Última activación</span><strong>${model.lastActivation?esc(routineWorkflowDate(model.lastActivation.activatedAt)):"Sin activaciones"}</strong></div>
    </section>
    ${missing.length?`<section class="card routine-profile-pending" role="status">
      <span class="section-kicker">PERFIL PENDIENTE</span>
      <h2>Faltan ${missing.length} ${missing.length===1?"dato":"datos"} para poder generar tu rutina</h2>
      <ul>${missing.map(item=>`<li>${esc(item)}</li>`).join("")}</ul>
      <button id="completeRoutineProfile" class="secondary full" type="button">Completar perfil</button>
    </section>`:""}
    ${proposal?`<section class="card routine-proposal-summary">
      <div class="card-heading-row">
        <div><span class="section-kicker">PROPUESTA</span><h2>${esc(routineWorkflowStatusLabel(proposal.status))}</h2></div>
        <span class="mode-pill">${proposal.sessionCount} sesiones</span>
      </div>
      <p>${esc(proposal.weeklyStructure)} · ${proposal.diff.summary.total} cambios respecto a la rutina actual.</p>
      <button id="reviewRoutineProposal" class="primary full" type="button">Revisar propuesta pendiente</button>
    </section>`:`<section class="card routine-empty-state">
      <span class="section-kicker">PROPUESTA</span>
      <h2>Sin propuesta pendiente</h2>
      <p class="subtle">GymOS solo generará una propuesta cuando tú lo solicites.</p>
    </section>`}
    ${activation?`<section class="card routine-rollback-card">
      <span class="section-kicker">COPIA REVERSIBLE</span>
      <h2>Última activación disponible</h2>
      <p>Activada el ${esc(routineWorkflowDate(activation.activatedAt))}. Puedes recuperar la rutina anterior mientras no modifiques la actual.</p>
      <button id="openRoutineRollback" class="secondary full" type="button">Revertir a la rutina anterior</button>
    </section>`:""}
    ${blocked?`<section class="card routine-blocked-card" role="status">
      <span class="section-kicker">REVERSIÓN BLOQUEADA</span>
      <h2>La rutina cambió después de activarla</h2>
      <p>La copia se conserva para auditoría, pero GymOS no sobrescribirá tus cambios posteriores.</p>
    </section>`:""}
    <section class="card routine-files-card">
      <div>
        <span class="section-kicker">ARCHIVOS DE RUTINA</span>
        <h2>Importar, exportar o empezar con una plantilla</h2>
        <p class="subtle">La importación siempre crea una propuesta para revisar.</p>
      </div>
      <div class="routine-file-actions">
        <button id="toggleRoutineExport" class="secondary" type="button" ${state.routineFileBusy?"disabled":""}>${state.routineFileBusy==="exporting"?"Exportando…":"Exportar rutina"}</button>
        <button id="openRoutineImport" class="secondary" type="button" ${state.routineFileBusy?"disabled":""}>Importar rutina</button>
        <button id="toggleRoutineTemplate" class="text-button" type="button" ${state.routineFileBusy?"disabled":""}>${state.routineFileBusy==="template"?"Preparando…":"Descargar plantilla"}</button>
      </div>
      ${state.routineFileChooser==="export"?`<div class="routine-format-choice" role="group" aria-label="Formato de exportación">
        <span>Elige formato</span><button data-routine-export="xlsx" type="button" ${state.routineFileBusy?"disabled":""}>XLSX</button><button data-routine-export="csv" type="button" ${state.routineFileBusy?"disabled":""}>CSV</button>
      </div>`:""}
      ${state.routineFileChooser==="template"?`<div class="routine-format-choice" role="group" aria-label="Formato de plantilla">
        <span>Elige formato</span><button data-routine-template="xlsx" type="button" ${state.routineFileBusy?"disabled":""}>XLSX</button><button data-routine-template="csv" type="button" ${state.routineFileBusy?"disabled":""}>CSV</button>
      </div>`:""}
    </section>
    <button id="prepareRoutineProposal" class="primary full routine-main-action" type="button">${preparation.canGenerate?"Generar una nueva propuesta":"Completar perfil para generar"}</button>
  `;
}
function renderRoutineWorkflowPreparation(model){
  const summary=model.summary;
  const row=(label,value)=>`<div><span>${label}</span><strong>${esc(value||"Sin configurar")}</strong></div>`;
  return `
    <section class="routine-workflow-heading">
      <span class="section-kicker">ANTES DE GENERAR</span>
      <h1>Revisa tus datos</h1>
      <p>Estos datos se copiarán para crear la propuesta. La rutina actual no se modificará.</p>
    </section>
    ${model.missing.length?`<section class="routine-missing-data pending" role="status">
      <strong>Faltan ${model.missing.length} ${model.missing.length===1?"dato":"datos"} para poder generar tu rutina</strong>
      <ul>${model.missing.map(item=>`<li>${esc(item)}</li>`).join("")}</ul>
      <button id="completeRoutineProfileFromReview" class="secondary full" type="button">Completar perfil</button>
    </section>`:""}
    <section class="card routine-preparation-grid">
      ${row("Objetivo principal",summary.primaryGoal)}
      ${row("Objetivos secundarios",summary.secondaryGoals.join(", ")||"Ninguno")}
      ${row("Fase",summary.phase)}
      ${row("Estado vital",summary.lifeState)}
      ${row("Experiencia",summary.experience)}
      ${row("Disponibilidad",summary.days?`${summary.days} días por semana`:"Sin configurar")}
      ${row("Duración",summary.duration?`${summary.duration} minutos`:"Sin configurar")}
      ${row("Lugar",summary.location)}
      ${row("Equipamiento",summary.equipment.join(", ")||"Sin configurar")}
      ${row("Restricciones",summary.restrictions.join(", ")||"Ninguna indicada")}
      ${row("Preferencias",`${summary.preferences.preferredExerciseIds.length} favoritos · ${summary.preferences.avoidedExercises.length} evitados`)}
      ${row("Experiencia previa",`${summary.knownExerciseCount} ejercicios conocidos · ${summary.previousWorkoutCount} entrenamientos guardados`)}
    </section>
    <div class="routine-workflow-actions">
      <button id="cancelRoutineGeneration" class="secondary" type="button">Volver</button>
      <button id="generateRoutineProposal" class="primary" type="button" ${model.canGenerate&&state.routineWorkflow.busy!=="generating"?"":"disabled"}>
        ${state.routineWorkflow.busy==="generating"?"Generando…":"Generar propuesta"}
      </button>
    </div>
  `;
}
function renderRoutineDiff(proposal){
  const diff=proposal.diff;
  return `<section class="card routine-diff">
    <span class="section-kicker">COMPARACIÓN</span>
    <h2>${diff.summary.total?`${diff.summary.total} cambios propuestos`:"Sin diferencias detectadas"}</h2>
    <div class="routine-diff-grid">
      <div><strong>${diff.summary.sessionsAdded}</strong><span>sesiones añadidas</span></div>
      <div><strong>${diff.summary.sessionsRemoved}</strong><span>sesiones eliminadas</span></div>
      <div><strong>${diff.summary.exercisesAdded}</strong><span>ejercicios añadidos</span></div>
      <div><strong>${diff.summary.exercisesRemoved}</strong><span>ejercicios eliminados</span></div>
      <div><strong>${diff.summary.exercisesSubstituted}</strong><span>sustituciones</span></div>
      <div><strong>${diff.summary.prescriptionChanges}</strong><span>cambios de dosis</span></div>
    </div>
    ${diff.changes.length?`<details><summary>Ver cambios uno a uno</summary><ul>
      ${diff.changes.map(change=>`<li>${esc(change.message)}</li>`).join("")}
    </ul></details>`:""}
  </section>`;
}
function renderRoutineProposalReview(proposal){
  if(!proposal) return `<section class="card"><h1>Propuesta no disponible</h1><p>Vuelve al resumen para actualizar los datos.</p></section>`;
  return `
    <section class="routine-workflow-heading">
      <span class="section-kicker">REVISIÓN</span>
      <h1>${esc(proposal.weeklyStructure)}</h1>
      <p>${proposal.sessionCount} sesiones${proposal.estimatedDurationMin?` · hasta ${proposal.estimatedDurationMin} min`:""} · ${esc(proposal.primaryGoal)} · ${esc(proposal.phase)}</p>
    </section>
    <section class="card routine-proposal-health ${proposal.canActivate?"ready":"blocked"}">
      <div class="card-heading-row">
        <div><span>Estado</span><h2>${esc(routineWorkflowStatusLabel(proposal.status))}</h2></div>
        <span class="mode-pill">${proposal.compatible?"Compatible":"No compatible"}</span>
      </div>
      <p>Cobertura: ${proposal.coverage.balanced?"equilibrada":"incompleta"}.</p>
      ${proposal.stale?`<p class="routine-warning">La rutina cambió desde que se generó. Crea una propuesta nueva para actualizarla.</p>`:""}
      ${proposal.blockers.length?`<ul class="routine-blockers">${proposal.blockers.map(code=>`<li>${esc(routineWorkflowBlockerLabel(code))}</li>`).join("")}</ul>`:""}
      ${proposal.warnings.length?`<details open><summary>Advertencias</summary><ul>${proposal.warnings.map(item=>`<li>${esc(item)}</li>`).join("")}</ul></details>`:""}
      ${proposal.questions.length?`<details open><summary>Preguntas pendientes</summary><ul>${proposal.questions.map(item=>`<li>${esc(item)}</li>`).join("")}</ul></details>`:""}
    </section>
    ${renderRoutineDiff(proposal)}
    <section class="routine-proposal-sessions">
      ${proposal.sessions.map(session=>`<article class="card routine-proposal-session">
        <header class="routine-session-heading">
          <h2>${esc(session.name)}</h2>
          <p>${esc(session.focus)}${session.estimatedDurationMin?` · ${session.estimatedDurationMin} min`:""}</p>
          <span>${session.exercises.length} ${session.exercises.length===1?"ejercicio":"ejercicios"}</span>
        </header>
        <ol>${session.exercises.map(exercise=>`<li>
          <div class="routine-exercise-order">${exercise.order}</div>
          <div class="routine-exercise-content">
            <strong>${esc(exercise.name)}</strong>
            <div class="routine-exercise-prescription">
              <span>${exercise.sets} series</span><span>${esc(exercise.target)}</span>
              <span>${esc(exercise.rir)}</span><span>${exercise.restSeconds} s descanso</span>
            </div>
            <p class="routine-exercise-reason">${esc(exercise.reason)}</p>
            <details class="routine-exercise-why">
              <summary>¿Por qué este ejercicio?</summary>
              <div class="routine-exercise-classification"><span>${esc(exercise.pattern)}</span><span>${esc(exercise.role)}</span></div>
              ${exercise.reasons.length?`<ul class="routine-reason-list">${exercise.reasons.map(reason=>`<li>${esc(reason)}</li>`).join("")}</ul>`:""}
              ${exercise.warnings.length?`<div class="routine-exercise-warnings"><strong>Ten en cuenta</strong><ul>${exercise.warnings.map(warning=>`<li>${esc(warning)}</li>`).join("")}</ul></div>`:""}
              ${exercise.alternatives.length?`<div class="routine-exercise-alternatives"><strong>Alternativas disponibles</strong><ul>${exercise.alternatives.map(alternative=>`<li><strong>${esc(alternative.name)}</strong><span>${esc(alternative.reason)}</span></li>`).join("")}</ul></div>`:""}
            </details>
          </div>
        </li>`).join("")}</ol>
      </article>`).join("")}
    </section>
    <div class="routine-workflow-actions sticky-actions">
      <button id="discardRoutineProposal" class="danger-soft" type="button" ${state.routineWorkflow.busy?"disabled":""}>Descartar propuesta</button>
      ${proposal.stale?`<button id="regenerateRoutineProposal" class="primary" type="button">Generar nueva</button>`:`<button id="openRoutineActivation" class="primary" type="button" ${proposal.canActivate&&state.routineWorkflow.busy!=="activating"?"":"disabled"}>Activar rutina</button>`}
    </div>
  `;
}
function renderRoutineWorkflowConfirmation(model,proposal){
  const type=state.routineWorkflow.confirmation;
  if(type==="reject") return `<section class="routine-confirmation" role="dialog" aria-modal="false" aria-labelledby="routineRejectTitle" tabindex="-1">
    <h2 id="routineRejectTitle">Descartar propuesta</h2>
    <p>La rutina y el historial no se modificarán.</p>
    <label><span>Razón opcional</span><textarea id="routineRejectionReason" maxlength="500" rows="3" ${state.routineWorkflow.busy?"disabled":""}></textarea></label>
    <div><button id="cancelRoutineConfirmation" class="secondary" type="button" ${state.routineWorkflow.busy?"disabled":""}>Cancelar</button><button id="confirmRoutineRejection" class="danger" type="button" ${state.routineWorkflow.busy?"disabled":""}>${state.routineWorkflow.busy==="rejecting"?"Descartando…":"Descartar"}</button></div>
  </section>`;
  if(type==="activate"&&proposal) return `<section class="routine-confirmation" role="dialog" aria-modal="false" aria-labelledby="routineActivateTitle" tabindex="-1">
    <h2 id="routineActivateTitle">Sustituir la rutina actual</h2>
    <p>Pasarás de ${model.routine.sessionCount} a ${proposal.sessionCount} sesiones. Se guardará una copia reversible y tu historial no se borrará.</p>
    <p>${proposal.diff.summary.total} cambios principales forman parte de esta propuesta.</p>
    <label class="routine-confirm-check"><input id="confirmRoutineActivationCheck" type="checkbox" ${state.routineWorkflow.busy?"disabled":""}><span>Entiendo que mi rutina actual será sustituida y que podré revertirla mientras no la modifique posteriormente.</span></label>
    <div><button id="cancelRoutineConfirmation" class="secondary" type="button" ${state.routineWorkflow.busy?"disabled":""}>Cancelar</button><button id="confirmRoutineActivation" class="primary" type="button" disabled>${state.routineWorkflow.busy==="activating"?"Activando…":"Activar rutina"}</button></div>
  </section>`;
  if(type==="rollback"&&model.reversibleActivation){
    const activation=model.reversibleActivation;
    return `<section class="routine-confirmation" role="dialog" aria-modal="false" aria-labelledby="routineRollbackTitle" tabindex="-1">
      <h2 id="routineRollbackTitle">Revertir a la rutina anterior</h2>
      <p>Activación del ${esc(routineWorkflowDate(activation.activatedAt))}.</p>
      <p>Rutina actual: ${activation.current.sessionCount} sesiones. Se restaurarán ${activation.baseline.sessionCount} sesiones.</p>
      <p>Si modificaste la rutina posteriormente, GymOS bloqueará la reversión para proteger esos cambios.</p>
      <label class="routine-confirm-check"><input id="confirmRoutineRollbackCheck" type="checkbox" ${state.routineWorkflow.busy?"disabled":""}><span>Entiendo qué rutina se restaurará y quiero continuar.</span></label>
      <div><button id="cancelRoutineConfirmation" class="secondary" type="button" ${state.routineWorkflow.busy?"disabled":""}>Cancelar</button><button id="confirmRoutineRollback" class="primary" type="button" disabled>${state.routineWorkflow.busy==="rolling_back"?"Revirtiendo…":"Revertir rutina"}</button></div>
    </section>`;
  }
  return "";
}
function bindRoutineWorkflowEvents(model,proposal,preparation){
  const setWorkflow=next=>{state.routineWorkflow=next;renderRoutineWorkflow();};
  const back=document.getElementById("backRoutineWorkflow");
  if(back) back.onclick=()=>{
    if(state.routineWorkflow.view==="summary"){
      state.screen="settings";
      renderSettings();
    }else setWorkflow(window.GymOSRoutineWorkflowUI.setFlowView(state.routineWorkflow,"summary"));
  };
  const toggleExport=document.getElementById("toggleRoutineExport");
  if(toggleExport) toggleExport.onclick=()=>{
    state.routineFileChooser=state.routineFileChooser==="export"?null:"export";
    renderRoutineWorkflow();
  };
  const toggleTemplate=document.getElementById("toggleRoutineTemplate");
  if(toggleTemplate) toggleTemplate.onclick=()=>{
    state.routineFileChooser=state.routineFileChooser==="template"?null:"template";
    renderRoutineWorkflow();
  };
  document.querySelectorAll("[data-routine-export]").forEach(button=>{
    button.onclick=async()=>{
      if(state.routineFileBusy) return;
      const exportOwnerId=currentRoutineOwnerOrNull();
      if(!exportOwnerId) return;
      state.routineFileBusy="exporting";
      renderRoutineWorkflow();
      await Promise.resolve();
      try{
        exportCurrentRoutineFile(button.dataset.routineExport,exportOwnerId);
        state.routineFileChooser=null;
        state.routineWorkflow=window.GymOSRoutineWorkflowUI.finishOperation(
          state.routineWorkflow,{type:"success",text:"Rutina exportada sin modificar tus datos."}
        );
      }catch(error){
        state.routineWorkflow=window.GymOSRoutineWorkflowUI.finishOperation(
          state.routineWorkflow,{type:"error",text:error?.message||"No se pudo exportar la rutina."}
        );
      }finally{state.routineFileBusy=null;}
      renderRoutineWorkflow();
    };
  });
  document.querySelectorAll("[data-routine-template]").forEach(button=>{
    button.onclick=async()=>{
      if(state.routineFileBusy) return;
      state.routineFileBusy="template";
      renderRoutineWorkflow();
      await Promise.resolve();
      try{
        downloadOfficialRoutineTemplate(button.dataset.routineTemplate);
        state.routineFileChooser=null;
        state.routineWorkflow=window.GymOSRoutineWorkflowUI.finishOperation(
          state.routineWorkflow,{type:"success",text:"Plantilla oficial descargada."}
        );
      }catch(error){
        state.routineWorkflow=window.GymOSRoutineWorkflowUI.finishOperation(
          state.routineWorkflow,{type:"error",text:error?.message||"No se pudo descargar la plantilla."}
        );
      }finally{state.routineFileBusy=null;}
      renderRoutineWorkflow();
    };
  });
  const openImport=document.getElementById("openRoutineImport");
  if(openImport) openImport.onclick=()=>{
    if(state.routineFileBusy) return;
    state.routineImport=null;
    state.routineFileChooser=null;
    setWorkflow(window.GymOSRoutineWorkflowUI.setFlowView(state.routineWorkflow,"import"));
  };
  const chooseFile=document.getElementById("chooseRoutineFile");
  if(chooseFile) chooseFile.onclick=()=>{
    if(state.routineFileBusy) return;
    routineFile.click();
  };
  const cancelImport=document.getElementById("cancelRoutineImport");
  if(cancelImport) cancelImport.onclick=()=>{
    routineImportReadSequence+=1;
    state.routineFileBusy=null;
    state.routineImport=null;
    routineFile.value="";
    setWorkflow(window.GymOSRoutineWorkflowUI.setFlowView(state.routineWorkflow,"summary"));
  };
  const saveImport=document.getElementById("saveRoutineImport");
  if(saveImport) saveImport.onclick=async()=>{
    const preview=state.routineImport?.preview;
    if(!preview?.canSave||!preview.imported||state.routineFileBusy) return;
    const ownerIdAtPreview=state.routineImport.ownerId;
    const currentOwnerId=routineWorkflowOwnerId();
    if(ownerIdAtPreview!==currentOwnerId){
      state.routineImport=null;
      renderRoutineWorkflow();
      return;
    }
    const currentBaselineHash=window.GymOSRoutineProposals.routineHash(activeRoutineForComparison());
    if(currentBaselineHash!==state.routineImport.baselineHash){
      state.routineImport.status="stale";
      state.routineImport.errorCode="baseline_changed";
      state.routineImport.message="Tu rutina ha cambiado desde que se leyó el archivo. Elige el archivo de nuevo para recalcular la propuesta.";
      renderRoutineWorkflow();
      return;
    }
    state.routineFileBusy="saving";
    state.routineImport.status="saving";
    renderRoutineWorkflow();
    await Promise.resolve();
    try{
      const api=routineIoApi();
      const ownerId=routineWorkflowOwnerId();
      const baselineHash=window.GymOSRoutineProposals.routineHash(activeRoutineForComparison());
      if(ownerId!==ownerIdAtPreview||baselineHash!==currentBaselineHash){
        throw new Error("import_context_changed");
      }
      const fingerprint=api.importFingerprint({
        ownerId,result:preview.imported,baselineHash,
        templateVersion:preview.imported.templateVersion
      });
      const existing=api.findExistingImport(
        getRoutineProposalRecords(ownerId),ownerId,fingerprint
      );
      let record=existing;
      let created=false;
      if(!record){
        const timestamp=new Date().toISOString();
        const imported=api.buildImportedProposal({
          ownerId,result:preview.imported,baselineHash,
          format:state.routineImport.format,fileName:state.routineImport.fileName,
          templateVersion:preview.imported.templateVersion,generatedAt:timestamp
        });
        const persisted=persistRoutineProposal(imported,{ownerId,timestamp});
        record=persisted.record;
        created=persisted.created;
      }
      state.routineImport=null;
      state.routineWorkflow=window.GymOSRoutineWorkflowUI.finishOperation(
        window.GymOSRoutineWorkflowUI.setFlowView(
          state.routineWorkflow,"review",record.proposal.proposalId
        ),
        {
          type:"success",
          text:created
            ?"Rutina guardada como propuesta pendiente. Revísala antes de activar."
            :"Esta importación ya existía para la rutina actual; se ha recuperado."
        }
      );
    }catch(error){
      state.routineImport=state.routineImport||{
        ownerId:routineWorkflowOwnerId(),preview:null
      };
      state.routineImport.status="error";
      state.routineImport.errorCode=error?.message==="import_context_changed"
        ?"import_context_changed":"proposal_save_failed";
      state.routineImport.message=error?.message==="import_context_changed"
        ?"La cuenta o la rutina actual cambiaron durante el guardado. Vuelve a procesar el archivo."
        :"No se pudo guardar la propuesta. Inténtalo de nuevo.";
      console.error("Routine import proposal save failed",{
        code:state.routineImport.errorCode
      });
    }finally{
      state.routineFileBusy=null;
    }
    renderRoutineWorkflow();
  };
  const prepare=document.getElementById("prepareRoutineProposal");
  if(prepare) prepare.onclick=()=>{
    if(!preparation.canGenerate){
      openTrainingProfileEditor(trainingProfileMissingStep(preparation.missing),{
        returnScreen:"routineWorkflow",createProposal:true
      });
      return;
    }
    setWorkflow(window.GymOSRoutineWorkflowUI.setFlowView(state.routineWorkflow,"prepare"));
  };
  const editGoal=document.getElementById("editRoutineGoal");
  if(editGoal) editGoal.onclick=()=>openTrainingProfileEditor(2,{returnScreen:"routineWorkflow"});
  const editPhase=document.getElementById("editRoutinePhase");
  if(editPhase) editPhase.onclick=()=>openTrainingProfileEditor(2,{returnScreen:"routineWorkflow"});
  const editProfile=document.getElementById("editTrainingProfile");
  if(editProfile) editProfile.onclick=()=>openTrainingProfileEditor(1,{returnScreen:"routineWorkflow"});
  const completeProfile=document.getElementById("completeRoutineProfile");
  if(completeProfile) completeProfile.onclick=()=>openTrainingProfileEditor(
    trainingProfileMissingStep(preparation.missing),{returnScreen:"routineWorkflow",createProposal:true}
  );
  const completeFromReview=document.getElementById("completeRoutineProfileFromReview");
  if(completeFromReview) completeFromReview.onclick=()=>openTrainingProfileEditor(
    trainingProfileMissingStep(preparation.missing),{returnScreen:"routineWorkflow",createProposal:true}
  );
  const cancelGeneration=document.getElementById("cancelRoutineGeneration");
  if(cancelGeneration) cancelGeneration.onclick=()=>setWorkflow(
    window.GymOSRoutineWorkflowUI.setFlowView(state.routineWorkflow,"summary")
  );
  const review=document.getElementById("reviewRoutineProposal");
  if(review&&model.pendingProposal) review.onclick=()=>setWorkflow(
    window.GymOSRoutineWorkflowUI.setFlowView(
      state.routineWorkflow,"review",model.pendingProposal.proposalId
    )
  );
  const regenerate=document.getElementById("regenerateRoutineProposal");
  if(regenerate) regenerate.onclick=()=>setWorkflow(
    window.GymOSRoutineWorkflowUI.setFlowView(state.routineWorkflow,"prepare")
  );
  const generate=document.getElementById("generateRoutineProposal");
  if(generate) generate.onclick=async()=>{
    const ownerAtStart=routineWorkflowOwnerId();
    const started=window.GymOSRoutineWorkflowUI.beginOperation(state.routineWorkflow,"generating");
    if(!started.accepted) return;
    state.routineWorkflow=started.state;
    renderRoutineWorkflow();
    await Promise.resolve();
    if(
      currentRoutineOwnerOrNull()!==ownerAtStart||
      state.routineWorkflow?.ownerId!==ownerAtStart||
      state.routineWorkflow?.busy!=="generating"
    ) return;
    try{
      const prepared=window.GymOSRoutineWorkflowUI.preparationModel(
        routineWorkflowGenerationSource(),routineWorkflowLabels()
      );
      if(!prepared.canGenerate) throw new Error("Completa los datos obligatorios antes de generar.");
      const timestamp=new Date().toISOString();
      const generated=window.GymOSRoutineGenerator.generateRoutineProposal(
        prepared.input,{timestamp}
      );
      if(!Array.isArray(generated.sessions)||!generated.sessions.length){
        throw new Error(generated.unresolvedQuestions?.[0]||"La propuesta necesita más información antes de guardarse.");
      }
      const persisted=persistRoutineProposal(generated,{timestamp});
      state.routineWorkflow=window.GymOSRoutineWorkflowUI.finishOperation(
        window.GymOSRoutineWorkflowUI.setFlowView(
          state.routineWorkflow,"review",persisted.record.proposal.proposalId
        ),
        {type:"success",text:"Propuesta generada y guardada para revisión."}
      );
    }catch(error){
      state.routineWorkflow=window.GymOSRoutineWorkflowUI.finishOperation(
        state.routineWorkflow,{type:"error",text:error?.message||"No se pudo generar la propuesta."}
      );
    }
    renderRoutineWorkflow();
  };
  const discard=document.getElementById("discardRoutineProposal");
  if(discard) discard.onclick=()=>setWorkflow(
    window.GymOSRoutineWorkflowUI.openConfirmation(state.routineWorkflow,"reject")
  );
  const activate=document.getElementById("openRoutineActivation");
  if(activate) activate.onclick=()=>setWorkflow(
    window.GymOSRoutineWorkflowUI.openConfirmation(state.routineWorkflow,"activate")
  );
  const rollback=document.getElementById("openRoutineRollback");
  if(rollback) rollback.onclick=()=>setWorkflow(
    window.GymOSRoutineWorkflowUI.openConfirmation(state.routineWorkflow,"rollback")
  );
  const cancelConfirmation=document.getElementById("cancelRoutineConfirmation");
  if(cancelConfirmation) cancelConfirmation.onclick=()=>setWorkflow(
    window.GymOSRoutineWorkflowUI.closeConfirmation(state.routineWorkflow)
  );
  const activationCheck=document.getElementById("confirmRoutineActivationCheck");
  if(activationCheck) activationCheck.onchange=()=>{
    document.getElementById("confirmRoutineActivation").disabled=!activationCheck.checked;
  };
  const rollbackCheck=document.getElementById("confirmRoutineRollbackCheck");
  if(rollbackCheck) rollbackCheck.onchange=()=>{
    document.getElementById("confirmRoutineRollback").disabled=!rollbackCheck.checked;
  };
  const confirmRejection=document.getElementById("confirmRoutineRejection");
  if(confirmRejection&&proposal) confirmRejection.onclick=async()=>{
    const ownerAtStart=routineWorkflowOwnerId();
    const started=window.GymOSRoutineWorkflowUI.beginOperation(state.routineWorkflow,"rejecting");
    if(!started.accepted) return;
    const reason=document.getElementById("routineRejectionReason")?.value||"";
    state.routineWorkflow=started.state;
    renderRoutineWorkflow();
    await Promise.resolve();
    if(
      currentRoutineOwnerOrNull()!==ownerAtStart||
      state.routineWorkflow?.ownerId!==ownerAtStart||
      state.routineWorkflow?.busy!=="rejecting"
    ) return;
    try{
      rejectStoredRoutineProposal(proposal.proposalId,reason);
      state.routineWorkflow=window.GymOSRoutineWorkflowUI.finishOperation(
        window.GymOSRoutineWorkflowUI.setFlowView(state.routineWorkflow,"summary"),
        {type:"success",text:"Propuesta descartada. Tu rutina no ha cambiado."}
      );
    }catch(error){
      state.routineWorkflow=window.GymOSRoutineWorkflowUI.finishOperation(
        state.routineWorkflow,{type:"error",text:error?.message||"No se pudo descartar la propuesta."}
      );
    }
    renderRoutineWorkflow();
  };
  const confirmActivation=document.getElementById("confirmRoutineActivation");
  if(confirmActivation&&proposal) confirmActivation.onclick=async()=>{
    const checkbox=document.getElementById("confirmRoutineActivationCheck");
    if(!checkbox?.checked) return;
    const ownerAtStart=routineWorkflowOwnerId();
    const started=window.GymOSRoutineWorkflowUI.beginOperation(state.routineWorkflow,"activating");
    if(!started.accepted) return;
    state.routineWorkflow=started.state;
    renderRoutineWorkflow();
    await Promise.resolve();
    if(
      currentRoutineOwnerOrNull()!==ownerAtStart||
      state.routineWorkflow?.ownerId!==ownerAtStart||
      state.routineWorkflow?.busy!=="activating"
    ) return;
    try{
      const result=activateStoredRoutineProposal(proposal.proposalId,{confirmed:true});
      state.routineWorkflow=result.ok
        ?window.GymOSRoutineWorkflowUI.finishOperation(
          window.GymOSRoutineWorkflowUI.setFlowView(state.routineWorkflow,"summary"),
          {type:"success",text:"Rutina activada. Tu historial y tus pesos se mantienen."}
        )
        :window.GymOSRoutineWorkflowUI.finishOperation(
          state.routineWorkflow,{type:"error",text:result.message||"No se pudo activar la rutina."}
        );
    }catch(error){
      state.routineWorkflow=window.GymOSRoutineWorkflowUI.finishOperation(
        state.routineWorkflow,{type:"error",text:error?.message||"No se pudo activar la rutina."}
      );
    }
    renderRoutineWorkflow();
  };
  const confirmRollback=document.getElementById("confirmRoutineRollback");
  if(confirmRollback&&model.reversibleActivation) confirmRollback.onclick=async()=>{
    const checkbox=document.getElementById("confirmRoutineRollbackCheck");
    if(!checkbox?.checked) return;
    const ownerAtStart=routineWorkflowOwnerId();
    const started=window.GymOSRoutineWorkflowUI.beginOperation(state.routineWorkflow,"rolling_back");
    if(!started.accepted) return;
    state.routineWorkflow=started.state;
    renderRoutineWorkflow();
    await Promise.resolve();
    if(
      currentRoutineOwnerOrNull()!==ownerAtStart||
      state.routineWorkflow?.ownerId!==ownerAtStart||
      state.routineWorkflow?.busy!=="rolling_back"
    ) return;
    try{
      const result=rollbackStoredRoutineActivation(model.reversibleActivation.activationId);
      state.routineWorkflow=result.ok
        ?window.GymOSRoutineWorkflowUI.finishOperation(
          window.GymOSRoutineWorkflowUI.setFlowView(state.routineWorkflow,"summary"),
          {type:"success",text:"Rutina anterior restaurada. El historial permanece intacto."}
        )
        :window.GymOSRoutineWorkflowUI.finishOperation(
          window.GymOSRoutineWorkflowUI.setFlowView(state.routineWorkflow,"summary"),
          {type:"error",text:result.message||"La reversión está bloqueada porque la rutina cambió."}
        );
    }catch(error){
      state.routineWorkflow=window.GymOSRoutineWorkflowUI.finishOperation(
        state.routineWorkflow,{type:"error",text:error?.message||"No se pudo revertir la rutina."}
      );
    }
    renderRoutineWorkflow();
  };
}
function renderRoutineWorkflow(){
  return renderRoutineHub();
}

function routineHubCurrentRoutine(){
  return getCanonicalRoutine()||activeRoutineForComparison();
}
function routineHubPendingRecord(ownerId){
  return window.GymOSRoutineProposals.selectActiveProposalId(
    getRoutineProposalRecords(ownerId),ownerId,
    localStorage.getItem(ACTIVE_ROUTINE_PROPOSAL_ID_KEY)
  )
    ?getRoutineProposalRecords(ownerId).find(record=>
      record.proposal.proposalId===window.GymOSRoutineProposals.selectActiveProposalId(
        getRoutineProposalRecords(ownerId),ownerId,
        localStorage.getItem(ACTIVE_ROUTINE_PROPOSAL_ID_KEY)
      )
    )||null
    :null;
}
function routineHubPreviousActivation(ownerId){
  return window.GymOSRoutineWorkflowUI.selectReversibleActivation(
    getRoutineActivationRecords(ownerId),ownerId,
    localStorage.getItem(ACTIVE_ROUTINE_ACTIVATION_ID_KEY)
  );
}
function routineHubBuildCandidate(type,sessions,options={}){
  const baselineHash=window.GymOSRoutineProposals.routineHash(activeRoutineForComparison());
  return window.GymOSRoutineProposals.createCandidateProposal({
    type,sessions,baselineHash,generatedAt:new Date().toISOString(),
    source:{type},...options
  });
}
function routineHubImportCandidate(){
  const current=state.routineImport;
  const ownerId=currentRoutineOwnerOrNull();
  if(!current?.preview?.canSave||!current.preview.imported){
    throw new Error("Selecciona y valida un archivo antes de continuar.");
  }
  if(current.ownerId!==ownerId){
    throw new Error("La cuenta activa ha cambiado. Vuelve a seleccionar el archivo.");
  }
  const baselineHash=window.GymOSRoutineProposals.routineHash(activeRoutineForComparison());
  if(current.baselineHash!==baselineHash){
    throw new Error("La rutina actual cambió durante la importación. Vuelve a validar el archivo.");
  }
  const imported=window.GymOSRoutineExcel.importedProposalResult(current.preview.imported);
  return routineIoApi().buildImportedProposal({
    ownerId,result:imported,baselineHash,format:"xlsx",
    fileName:current.fileName,templateVersion:window.GymOSRoutineExcel.TEMPLATE_VERSION,
    generatedAt:new Date().toISOString()
  });
}
function routineHubReconfigureCandidate(values){
  const source=routineWorkflowGenerationSource();
  const input=JSON.parse(JSON.stringify(source));
  const reasons=Array.isArray(values.reasons)?values.reasons:[];
  if(reasons.includes("goal")) input.activeGoalCycle={
    ...(input.activeGoalCycle||{}),primaryGoal:String(values.goal||"")
  };
  if(reasons.includes("days")) input.userProfile.weeklyAvailability=Number(values.days);
  if(reasons.includes("duration")){
    input.userProfile.preferredSessionDurationMin=Number(values.duration);
  }
  if(reasons.includes("equipment")){
    input.userProfile.availableEquipment=String(values.equipment||"")
      .split(",").map(item=>item.trim()).filter(Boolean);
  }
  if(reasons.includes("limitations")){
    input.userProfile.injuries=String(values.limitations||"")
      .split(",").map(item=>item.trim()).filter(Boolean);
  }
  if(reasons.includes("performance")){
    input.userProfile.trainingExperience=String(values.performance||"");
  }
  if(reasons.includes("preferences")){
    const requested=String(values.preferences||"").split(",")
      .map(item=>item.trim().toLocaleLowerCase("es")).filter(Boolean);
    input.generationPreferences.preferredExerciseIds=getExerciseLibrary()
      .filter(item=>requested.includes(String(item.name||"").trim().toLocaleLowerCase("es")))
      .map(item=>item.id);
  }
  const generated=window.GymOSRoutineGenerator.generateRoutineProposal(input,{
    timestamp:new Date().toISOString()
  });
  if(!generated.sessions?.length){
    throw new Error(
      generated.unresolvedQuestions?.[0]||
      generated.warnings?.[0]||
      "El generador actual necesita más información para preparar una propuesta segura."
    );
  }
  return routineHubBuildCandidate("reconfigure",generated.sessions,{
    source:{type:"reconfigure",reasons},
    warnings:generated.warnings,
    unresolvedQuestions:generated.unresolvedQuestions,
    rationale:[
      ...generated.rationale,
      ...(values.other?[`Motivo indicado: ${String(values.other).trim()}`]:[])
    ]
  });
}
function routineImportDraftKey(ownerId){
  return `gymos:routine-import-draft:${encodeURIComponent(String(ownerId||""))}`;
}
function routineHubLoadTextDraft(ownerId){
  if(currentRoutineOwnerOrNull()!==ownerId) return "";
  return localStorage.getItem(routineImportDraftKey(ownerId))||"";
}
function routineHubSaveTextDraft(ownerId,value){
  if(currentRoutineOwnerOrNull()!==ownerId) throw new Error("La cuenta activa ha cambiado.");
  localStorage.setItem(routineImportDraftKey(ownerId),String(value||"").slice(0,100000));
}
function routineHubTextImportCandidate(result){
  if(!result?.canPropose||!result.parsed) throw new Error("Revisa la vista previa antes de crear la propuesta.");
  const api=window.GymOSRoutinesExperience;
  return routineHubBuildCandidate("import",api.proposalSessionsFromImport(result.parsed),{
    source:{type:"import",format:result.format},
    warnings:(result.warnings||[]).map(item=>item.message||String(item)),
    unresolvedQuestions:(result.warnings||[]).filter(item=>["sets_missing","target_missing","exercise_ambiguous"].includes(item.code)).map(item=>item.message),
    rationale:["Rutina importada y revisada como propuesta pendiente."]
  });
}
function routineHubProgressExport(ownerId,routine,options){
  const api=window.GymOSRoutinesExperience;
  const model=api.buildProgressExportViewModel({
    ownerId,routine,history:getHistory(),recovery:window.GymOSRecovery?.getEntries?.()||[],options
  });
  return {model,markdown:api.buildChatGPTMarkdown(model)};
}
function renderRoutineHub(){
  if(!window.GymOSRoutineHub) throw new Error("El Centro de Rutina no está disponible.");
  const ownerId=routineWorkflowOwnerId();
  if(state.routineImport?.ownerId&&state.routineImport.ownerId!==ownerId){
    routineImportReadSequence+=1;
    state.routineImport=null;
    state.routineFileBusy=null;
    routineFile.value="";
  }
  const routine=routineHubCurrentRoutine();
  const labels=routineWorkflowLabels();
  const data={
    ownerId,routine,
    pending:routineHubPendingRecord(ownerId),
    previousActivation:routineHubPreviousActivation(ownerId),
    activeWorkout:routineOwnerHasActiveWorkout(ownerId),
    progress:routineHubProgressExport(ownerId,routine,{period:"routine",includeRecovery:false}).model,
    nextSessionLabel:nextSuggestedSession(),
    importState:state.routineImport,
    library:getExerciseLibrary(),
    profile:window.GymOSProfileData.getUserProfile()||{},
    goalOptions:(labels.goals||[]).map(item=>({
      value:item.id||item.value,label:item.label||item.name||item.id
    }))
  };
  window.GymOSRoutineHub.render({
    root:app,data,navigation:nav("routineHub"),refresh:renderRoutineHub,
    actions:{
      downloadTemplate:()=>downloadOfficialRoutineTemplate("xlsx"),
      exportRoutine:()=>exportCurrentRoutineFile("xlsx",ownerId),
      chooseFile:()=>routineFile.click(),
      loadTextDraft:()=>routineHubLoadTextDraft(ownerId),
      saveTextDraft:value=>routineHubSaveTextDraft(ownerId,value),
      analyzeText:value=>window.GymOSRoutinesExperience.parseRoutineImport(value,{library:getExerciseLibrary()}),
      validateTextImport:result=>{
        const validation=window.GymOSRoutinesExperience.validateRoutineImport(result.parsed,{forActivation:true});
        return {...result,...validation,status:validation.valid?(validation.warnings.length?"warning":"valid"):"invalid"};
      },
      textImportCandidate:routineHubTextImportCandidate,
      buildProgress:options=>routineHubProgressExport(ownerId,routine,options),
      copyProgress:async value=>{
        try{await navigator.clipboard.writeText(String(value||""));return true;}
        catch(_){return false;}
      },
      downloadProgressMarkdown:value=>downloadRoutineFile(value,"progreso-gymos.md","text/markdown;charset=utf-8"),
      downloadProgressJson:model=>downloadRoutineFile(
        JSON.stringify(window.GymOSRoutinesExperience.buildStructuredProgressExport(model),null,2),
        "progreso-gymos.json","application/json;charset=utf-8"
      ),
      importProposal:async()=>routineHubImportCandidate(),
      buildCandidate:routineHubBuildCandidate,
      reconfigure:async values=>routineHubReconfigureCandidate(values),
      restoreCandidate:activation=>{
        const previous=activation?.baseline?.canonicalRoutine||activation?.baseline?.routine;
        return routineHubBuildCandidate(
          "restore",window.GymOSRoutineHub.proposalSessionsFromRoutine(previous),{
            source:{type:"restore",activationDate:activation?.activatedAt},
            rationale:["Versión anterior preparada para restauración explícita."]
          }
        );
      },
      storeProposal:async(proposal,{replacePending=false}={})=>
        persistRoutineProposal(proposal,{ownerId,replacePending}),
      discardProposal:async proposalId=>
        rejectStoredRoutineProposal(proposalId,"Descartada desde el Centro de Rutina.",{ownerId}),
      activate:async proposalId=>activateStoredRoutineProposal(proposalId,{
        ownerId,confirmed:true
      })
    }
  });
}

function exerciseLibraryWorkflowApi(){
  if(!window.GymOSExerciseLibraryWorkflow) throw new Error("El módulo de biblioteca no está disponible.");
  return window.GymOSExerciseLibraryWorkflow;
}
function exerciseLibraryOwner(){
  const owner=currentRoutineOwnerOrNull();
  if(!owner) throw new Error("No se pudo comprobar el propietario de la biblioteca.");
  return owner;
}
function exerciseLibraryContext(){
  const profile=window.GymOSProfileData;
  return {
    ownerId:exerciseLibraryOwner(),
    userProfile:profile?.getUserProfile?.()||{},
    currentLifeState:profile?.getCurrentLifeState?.()||null
  };
}
function exerciseLibraryFilterState(){
  const api=exerciseLibraryWorkflowApi();
  state.exerciseLibraryFilters=api.normalizeFilters(state.exerciseLibraryFilters||{});
  return state.exerciseLibraryFilters;
}
function exerciseLibraryMessageHtml(){
  const message=state.exerciseLibraryMessage;
  if(!message) return `<div class="library-live-region" aria-live="polite"></div>`;
  return `<div class="form-message ${message.type==="success"?"success":"error"}" role="${message.type==="success"?"status":"alert"}">${esc(message.text)}</div>`;
}
function exerciseSelectOptions(values,current){
  const api=exerciseLibraryWorkflowApi();
  return [`<option value="all">Todos</option>`,...values.map(value=>
    `<option value="${esc(value)}" ${current===api.normalizeFilters({category:value}).category?"selected":""}>${esc(api.label(value))}</option>`
  )].join("");
}
function exerciseUsageById(){
  const usage={};
  getHistory().forEach(workout=>(workout.exercises||[]).forEach(exercise=>{
    const id=exercise.exerciseId||exercise.id;
    if(!id) return;
    const row=usage[id]||{count:0,lastDate:null};
    row.count+=(exercise.series||[]).length;
    row.lastDate=!row.lastDate||String(workout.date)>row.lastDate?workout.date:row.lastDate;
    usage[id]=row;
  }));
  return usage;
}
function exerciseStatusLabel(status){
  return status==="ready"?"Listo":status==="archived"?"Archivado":"Requiere revisión";
}
function cancelExerciseLibrarySearchDebounce(){
  exerciseLibrarySearchDebounceVersion+=1;
  if(exerciseLibrarySearchDebounceTimer!==null){
    clearTimeout(exerciseLibrarySearchDebounceTimer);
    exerciseLibrarySearchDebounceTimer=null;
  }
}
function scheduleExerciseLibrarySearchUpdate(ownerId){
  cancelExerciseLibrarySearchDebounce();
  const version=exerciseLibrarySearchDebounceVersion;
  exerciseLibrarySearchDebounceTimer=setTimeout(()=>{
    exerciseLibrarySearchDebounceTimer=null;
    if(version!==exerciseLibrarySearchDebounceVersion) return;
    if(state.screen!=="exerciseLibrary"||currentRoutineOwnerOrNull()!==ownerId) return;
    state.exerciseLibrarySearchRefocus=true;
    renderExerciseLibrary();
  },200);
}
function renderExerciseLibrary(){
  cancelExerciseLibrarySearchDebounce();
  ensureExerciseLibraryWorkflowMigration();
  const api=exerciseLibraryWorkflowApi(),items=getExerciseLibrary();
  const filters=exerciseLibraryFilterState();
  const options=api.filterOptions(items);
  const filtered=api.filterExercises(items,filters,{usage:exerciseUsageById()});
  const context=exerciseLibraryContext();
  const cards=filtered.map(item=>api.cardModel(item,context));
  app.innerHTML=`<div class="app-shell exercise-library-shell">
    <header class="topbar">
      <button id="backExerciseLibrary" class="back-button" type="button" aria-label="Volver">←</button>
      <div><div class="brand">Biblioteca de ejercicios</div><div class="subtle">Busca, consulta y organiza tus ejercicios.</div></div>
      <button id="newLibraryExercise" class="header-action" type="button">Crear</button>
    </header>
    <main class="screen">
      ${exerciseLibraryMessageHtml()}
      <section class="card library-filter-card">
        <label class="library-search" for="librarySearch"><span>Buscar ejercicios</span>
          <input id="librarySearch" type="search" value="${esc(filters.query)}" placeholder="Nombre, alias, músculo o equipamiento">
        </label>
        ${filters.query?`<button id="clearLibrarySearch" class="text-button" type="button" aria-label="Limpiar búsqueda">Limpiar búsqueda</button>`:""}
        <div class="library-filter-grid phase-g-filter-grid">
          <label><span>Categoría</span><select id="libraryCategory">${exerciseSelectOptions(options.categories,filters.category)}</select></label>
          <label><span>Patrón</span><select id="libraryPattern">${exerciseSelectOptions(options.patterns,filters.pattern)}</select></label>
          <label><span>Músculo</span><select id="libraryMuscle">${exerciseSelectOptions(options.muscles,filters.muscle)}</select></label>
          <label><span>Equipamiento</span><select id="libraryEquipment">${exerciseSelectOptions(options.equipment,filters.equipment)}</select></label>
          <label><span>Dificultad</span><select id="libraryDifficulty">${exerciseSelectOptions(options.difficulties,filters.difficulty)}</select></label>
          <label><span>Estado</span><select id="libraryStatus">
            <option value="all" ${filters.status==="all"?"selected":""}>Todos</option>
            <option value="ready" ${filters.status==="ready"?"selected":""}>Listo</option>
            <option value="needs_review" ${filters.status==="needs_review"?"selected":""}>Requiere revisión</option>
          </select></label>
          <label><span>Ordenar</span><select id="librarySort">
            <option value="name" ${filters.sort==="name"?"selected":""}>Nombre</option>
            <option value="favorites" ${filters.sort==="favorites"?"selected":""}>Favoritos primero</option>
            <option value="used" ${filters.sort==="used"?"selected":""}>Más utilizados</option>
            <option value="recent" ${filters.sort==="recent"?"selected":""}>Recientemente añadidos</option>
          </select></label>
        </div>
        <div class="library-toggle-filters">
          <label><input id="libraryFavoritesOnly" type="checkbox" ${filters.favorites?"checked":""}><span>Favoritos</span></label>
          <label><input id="libraryCustomOnly" type="checkbox" ${filters.custom?"checked":""}><span>Personalizados</span></label>
          <label><input id="libraryArchivedOnly" type="checkbox" ${filters.archived?"checked":""}><span>Archivados</span></label>
        </div>
        <button id="resetLibraryFilters" class="text-button" type="button">Limpiar filtros</button>
      </section>
      <div class="library-results-header"><strong>${cards.length} resultados</strong><span>${items.length} en tu biblioteca</span></div>
      <section class="exercise-library-list phase-g-library-list">
        ${cards.length?cards.map(card=>`<article class="card exercise-library-card ${card.archived?"is-archived":""}">
          <div class="exercise-library-card-top">
            <button type="button" class="exercise-card-open" data-open-exercise-detail="${esc(card.id)}">
              <span class="exercise-library-title-row"><strong>${esc(card.name)}</strong><span class="custom-pill">${esc(card.origin)}</span></span>
              <span class="subtle">${esc(card.category)} · ${esc(card.pattern)}</span>
            </button>
            <button type="button" class="favorite-button ${card.favorite?"active":""}" data-favorite-exercise="${esc(card.id)}" aria-label="${card.favorite?"Quitar de favoritos":"Añadir a favoritos"}">★</button>
          </div>
          <div class="exercise-card-tags">
            ${card.muscles.map(value=>`<span>${esc(value)}</span>`).join("")}
            ${card.equipment.map(value=>`<span>${esc(value)}</span>`).join("")}
          </div>
          <div class="exercise-card-meta"><span>${esc(card.recordTypes.join(", "))}</span><span>${esc(card.difficulty)}</span><span class="${card.status==="ready"?"ready":"review"}">${esc(exerciseStatusLabel(card.status))}</span></div>
          ${card.warning?`<p class="exercise-context-warning">${esc(card.warning)}</p>`:""}
          <div class="settings-actions compact-actions">
            <button type="button" class="secondary" data-open-exercise-detail="${esc(card.id)}">Ver detalles</button>
            ${card.origin==="Personalizado"?`<button type="button" class="secondary" data-edit-library-exercise="${esc(card.id)}">Editar</button>
              <button type="button" class="text-button" data-remove-library-exercise="${esc(card.id)}">${card.archived?"Restaurar":"Gestionar"}</button>`:""}
          </div>
        </article>`).join(""):`<section class="card empty-library-state"><h2>Sin resultados</h2><p class="subtle">Prueba otros filtros o crea un ejercicio personalizado.</p></section>`}
      </section>
      ${renderExerciseRemovalConfirmation()}
    </main>${nav("settings")}
  </div>`;
  const readFilters=()=>api.normalizeFilters({
    query:document.getElementById("librarySearch")?.value||"",
    category:document.getElementById("libraryCategory")?.value,
    pattern:document.getElementById("libraryPattern")?.value,
    muscle:document.getElementById("libraryMuscle")?.value,
    equipment:document.getElementById("libraryEquipment")?.value,
    difficulty:document.getElementById("libraryDifficulty")?.value,
    status:document.getElementById("libraryStatus")?.value,
    sort:document.getElementById("librarySort")?.value,
    favorites:document.getElementById("libraryFavoritesOnly")?.checked,
    custom:document.getElementById("libraryCustomOnly")?.checked,
    archived:document.getElementById("libraryArchivedOnly")?.checked
  });
  const rerender=()=>{
    cancelExerciseLibrarySearchDebounce();
    state.exerciseLibraryFilters=readFilters();
    renderExerciseLibrary();
  };
  const search=document.getElementById("librarySearch");
  search.oninput=()=>{
    state.exerciseLibraryFilters=readFilters();
    scheduleExerciseLibrarySearchUpdate(context.ownerId);
  };
  search.onkeydown=event=>{
    if(event.key!=="Enter") return;
    event.preventDefault();
    state.exerciseLibraryFilters=readFilters();
    cancelExerciseLibrarySearchDebounce();
    state.exerciseLibrarySearchRefocus=true;
    renderExerciseLibrary();
  };
  document.getElementById("backExerciseLibrary").onclick=()=>{
    cancelExerciseLibrarySearchDebounce();state.screen="settings";renderSettings();
  };
  document.getElementById("newLibraryExercise").onclick=()=>{
    cancelExerciseLibrarySearchDebounce();
    state.editingLibraryExerciseId=null;state.exerciseLibraryEditBaseline=null;
    state.exerciseLibraryFormDraft=null;
    state.screen="exerciseLibraryEditor";renderExerciseLibraryEditor();
  };
  ["libraryCategory","libraryPattern","libraryMuscle","libraryEquipment","libraryDifficulty","libraryStatus","librarySort","libraryFavoritesOnly","libraryCustomOnly","libraryArchivedOnly"]
    .forEach(id=>document.getElementById(id).onchange=rerender);
  const clearSearch=document.getElementById("clearLibrarySearch");
  if(clearSearch) clearSearch.onclick=()=>{
    cancelExerciseLibrarySearchDebounce();
    state.exerciseLibraryFilters=api.normalizeFilters({...exerciseLibraryFilterState(),query:""});
    state.exerciseLibrarySearchRefocus=true;
    renderExerciseLibrary();
  };
  document.getElementById("resetLibraryFilters").onclick=()=>{
    cancelExerciseLibrarySearchDebounce();
    state.exerciseLibraryFilters=api.normalizeFilters();
    renderExerciseLibrary();
  };
  document.querySelectorAll("[data-open-exercise-detail]").forEach(button=>button.onclick=()=>{
    cancelExerciseLibrarySearchDebounce();
    state.selectedLibraryExerciseId=button.dataset.openExerciseDetail;state.screen="exerciseDetail";renderExerciseDetail();
  });
  document.querySelectorAll("[data-edit-library-exercise]").forEach(button=>button.onclick=()=>{
    const current=getExerciseLibrary().find(item=>item.id===button.dataset.editLibraryExercise);
    if(!current?.custom) return;
    state.editingLibraryExerciseId=current.id;state.exerciseLibraryEditBaseline=current.updatedAt||null;
    state.exerciseLibraryFormDraft=null;
    cancelExerciseLibrarySearchDebounce();
    state.screen="exerciseLibraryEditor";renderExerciseLibraryEditor();
  });
  document.querySelectorAll("[data-favorite-exercise]").forEach(button=>button.onclick=async()=>{
    if(state.exerciseLibraryBusy) return;
    const owner=exerciseLibraryOwner(),current=getExerciseLibrary().find(item=>item.id===button.dataset.favoriteExercise);
    if(!current) return;
    state.exerciseLibraryBusy="favorite";button.disabled=true;
    try{
      if(owner!==exerciseLibraryOwner()) return;
      setExerciseFavorite(current.id,!current.favorite);
      state.exerciseLibraryMessage={type:"success",text:current.favorite?"Eliminado de favoritos.":"Añadido a favoritos."};
    }finally{state.exerciseLibraryBusy=null;}
    renderExerciseLibrary();
  });
  document.querySelectorAll("[data-remove-library-exercise]").forEach(button=>button.onclick=()=>{
    const exercise=getExerciseLibrary().find(item=>item.id===button.dataset.removeLibraryExercise);
    if(!exercise?.custom) return;
    if(exercise.archived){restoreLibraryExercise(exercise.id);return;}
    state.exerciseLibraryDeleteCandidate=exercise.id;renderExerciseLibrary();
  });
  const cancel=document.getElementById("cancelExerciseRemoval");
  if(cancel) cancel.onclick=()=>{state.exerciseLibraryDeleteCandidate=null;renderExerciseLibrary();};
  const confirmRemoval=document.getElementById("confirmExerciseRemoval");
  if(confirmRemoval) confirmRemoval.onclick=()=>applyExerciseRemoval();
  bindNav();
  if(state.exerciseLibrarySearchRefocus){
    state.exerciseLibrarySearchRefocus=false;
    search.focus();
    search.setSelectionRange(search.value.length,search.value.length);
  }
}
function exerciseReferenceSources(){
  return {
    routine:activeRoutineForComparison(),history:getHistory(),
    drafts:getCanonicalDrafts()||{},
    proposals:getRoutineProposalRecords(),activations:getRoutineActivationRecords(),
    library:getExerciseLibrary()
  };
}
function renderExerciseRemovalConfirmation(){
  const id=state.exerciseLibraryDeleteCandidate;
  if(!id) return "";
  const api=exerciseLibraryWorkflowApi(),exercise=getExerciseLibrary().find(item=>item.id===id);
  if(!exercise?.custom) return "";
  const references=api.referenceSummary(id,exerciseReferenceSources());
  const policy=api.removalPolicy(exercise,references);
  const types={
    routine:"rutina activa",history:"historial",drafts:"entrenamiento en curso",
    proposals:"propuestas",activations:"activaciones y rollback",
    alternatives:"alternativas",favorites:"favoritos"
  };
  return `<section class="card destructive-confirmation" role="alertdialog" aria-modal="true" tabindex="-1" aria-labelledby="exerciseRemovalTitle">
    <h2 id="exerciseRemovalTitle">${policy.action==="archive"?"Archivar ejercicio":"Eliminar ejercicio"}</h2>
    <p><strong>${esc(exercise.name)}</strong></p>
    ${references.total?`<p>Se han encontrado ${references.total} referencias: ${references.types.map(type=>`${types[type]} (${references.counts[type]})`).join(", ")}.</p>
      <p>Se archivará para conservar los registros antiguos y dejará de recomendarse.</p>`
      :`<p>No tiene referencias. La eliminación será definitiva para este propietario.</p>`}
    <div class="settings-actions"><button id="cancelExerciseRemoval" class="secondary" type="button">Cancelar</button>
      <button id="confirmExerciseRemoval" class="danger-button" type="button">${policy.action==="archive"?"Archivar ejercicio":"Eliminar definitivamente"}</button></div>
  </section>`;
}
async function applyExerciseRemoval(){
  if(state.exerciseLibraryBusy) return;
  const api=exerciseLibraryWorkflowApi(),owner=exerciseLibraryOwner(),id=state.exerciseLibraryDeleteCandidate;
  const library=getExerciseLibrary(),exercise=library.find(item=>item.id===id);
  if(!exercise?.custom||(exercise.ownerId&&exercise.ownerId!==owner)) return;
  state.exerciseLibraryBusy="remove";
  try{
    const references=api.referenceSummary(id,exerciseReferenceSources());
    const policy=api.removalPolicy(exercise,references);
    if(owner!==exerciseLibraryOwner()) return;
    if(policy.action==="archive"){
      const result=api.archiveExercise(exercise,{timestamp:new Date().toISOString()});
      saveExerciseLibrary(library.map(item=>item.id===id?result.exercise:item),{
        touchUpdatedAt:false,ownerId:owner
      });
      state.exerciseLibraryMessage={type:"success",text:"Ejercicio archivado. Sus referencias se conservan."};
    }else if(policy.action==="delete"){
      saveExerciseLibrary(library.filter(item=>item.id!==id),{touchUpdatedAt:false,ownerId:owner});
      state.exerciseLibraryMessage={type:"success",text:"Ejercicio eliminado definitivamente."};
    }
    state.exerciseLibraryDeleteCandidate=null;
  }finally{state.exerciseLibraryBusy=null;}
  renderExerciseLibrary();
}
async function restoreLibraryExercise(id){
  if(state.exerciseLibraryBusy) return;
  const api=exerciseLibraryWorkflowApi(),owner=exerciseLibraryOwner();
  const library=getExerciseLibrary(),exercise=library.find(item=>item.id===id);
  if(!exercise?.custom||(exercise.ownerId&&exercise.ownerId!==owner)) return;
  state.exerciseLibraryBusy="restore";
  try{
    if(owner!==exerciseLibraryOwner()) return;
    const result=api.restoreExercise(exercise,{timestamp:new Date().toISOString()});
    if(result.changed) saveExerciseLibrary(library.map(item=>item.id===id?result.exercise:item),{
      touchUpdatedAt:false,ownerId:owner
    });
    state.exerciseLibraryMessage={type:"success",text:"Ejercicio restaurado."};
  }finally{state.exerciseLibraryBusy=null;}
  renderExerciseLibrary();
}
function csvField(value){return (Array.isArray(value)?value:[]).join(", ");}
function parseListField(id){return (document.getElementById(id)?.value||"").split(",").map(value=>value.trim()).filter(Boolean);}
function renderExerciseLibraryEditor(){
  const api=exerciseLibraryWorkflowApi(),domainApi=window.GymOSExerciseDomain;
  const library=getExerciseLibrary(),existing=library.find(item=>item.id===state.editingLibraryExerciseId);
  if(existing&&!existing.custom){state.screen="exerciseLibrary";renderExerciseLibrary();return;}
  const exercise=state.exerciseLibraryFormDraft||existing||{
    name:"",aliases:[],category:"strength",movementPattern:"horizontal_push",
    primaryMuscles:[],secondaryMuscles:[],requiredEquipment:[],trainingLocations:["gym"],
    difficulty:"beginner",recordTypes:["weight_reps"],defaultPrescription:{sets:3,repRange:{min:8,max:12},targetRir:{min:2,max:3},restSeconds:90},
    instructions:{short:"",setup:[],execution:[],breathing:"",stopIf:[]},notes:""
  };
  app.innerHTML=`<div class="app-shell exercise-library-shell">
    <header class="topbar"><button id="backLibraryEditor" class="back-button" type="button" aria-label="Volver">←</button>
      <div><div class="brand">${existing?"Editar ejercicio":"Crear ejercicio"}</div><div class="subtle">Los campos de seguridad incompletos requieren revisión.</div></div></header>
    <main class="screen">
      ${exerciseLibraryMessageHtml()}
      <section class="card library-editor-form">
        <label for="libraryExerciseName"><span>Nombre</span><input id="libraryExerciseName" maxlength="160" value="${esc(exercise.name)}" required></label>
        <label for="libraryExerciseAliases"><span>Alias opcionales</span><input id="libraryExerciseAliases" value="${esc(csvField(exercise.aliases))}" placeholder="Separados por comas"></label>
        <div class="routine-editor-grid">
          <label><span>Categoría</span><select id="libraryExerciseCategory">${domainApi.EXERCISE_CATEGORIES.map(value=>`<option value="${value}" ${exercise.category===value?"selected":""}>${esc(api.label(value))}</option>`).join("")}</select></label>
          <label><span>Patrón de movimiento</span><select id="libraryExercisePattern">${domainApi.MOVEMENT_PATTERNS.map(value=>`<option value="${value}" ${exercise.movementPattern===value?"selected":""}>${esc(api.label(value))}</option>`).join("")}</select></label>
          <label><span>Dificultad</span><select id="libraryExerciseDifficulty">${domainApi.EXPERIENCE_LEVELS.map(value=>`<option value="${value}" ${exercise.difficulty===value?"selected":""}>${esc(api.label(value))}</option>`).join("")}</select></label>
          <label><span>Tipo de registro</span><select id="libraryExerciseRecordType">${domainApi.RECORD_TYPES.map(value=>`<option value="${value}" ${(exercise.recordTypes||[])[0]===value?"selected":""}>${esc(api.label(value))}</option>`).join("")}</select></label>
        </div>
        <label><span>Músculos principales</span><input id="libraryExercisePrimaryMuscles" value="${esc(csvField(exercise.primaryMuscles))}" placeholder="chest, triceps"></label>
        <label><span>Músculos secundarios</span><input id="libraryExerciseSecondaryMuscles" value="${esc(csvField(exercise.secondaryMuscles))}"></label>
        <label><span>Equipamiento necesario</span><input id="libraryExerciseEquipment" value="${esc(csvField(exercise.requiredEquipment))}" placeholder="bodyweight, dumbbells"></label>
        <label><span>Lugar de entrenamiento</span><input id="libraryExerciseLocations" value="${esc(csvField(exercise.trainingLocations))}" placeholder="gym, home"></label>
        <fieldset class="library-prescription-fields"><legend>Prescripción predeterminada</legend>
          <label><span>Series</span><input id="libraryExerciseSets" type="number" min="1" max="10" value="${Number(exercise.defaultPrescription?.sets)||3}"></label>
          <label><span>Repeticiones mín.</span><input id="libraryExerciseRepMin" type="number" min="1" max="100" value="${Number(exercise.defaultPrescription?.repRange?.min)||8}"></label>
          <label><span>Repeticiones máx.</span><input id="libraryExerciseRepMax" type="number" min="1" max="100" value="${Number(exercise.defaultPrescription?.repRange?.max)||12}"></label>
          <label><span>Descanso (s)</span><input id="libraryExerciseRest" type="number" min="15" max="600" value="${Number(exercise.defaultPrescription?.restSeconds)||90}"></label>
        </fieldset>
        <label><span>Instrucciones breves</span><textarea id="libraryExerciseInstructions" rows="3">${esc(exercise.instructions?.short||"")}</textarea></label>
        <label><span>Notas</span><textarea id="libraryExerciseNotes" maxlength="1000" rows="3">${esc(exercise.notes||"")}</textarea></label>
        <button id="toggleExerciseAdvanced" class="secondary full" type="button" aria-expanded="${state.exerciseLibraryAdvancedOpen}">${state.exerciseLibraryAdvancedOpen?"Ocultar opciones avanzadas":"Mostrar opciones avanzadas"}</button>
        ${state.exerciseLibraryAdvancedOpen?`<div class="library-advanced-fields">
          <label><span>Complejidad técnica (1–5)</span><input id="libraryExerciseComplexity" type="number" min="1" max="5" value="${Number(exercise.technicalComplexity)||1}"></label>
          <label><span>Demanda de estabilidad (1–5)</span><input id="libraryExerciseStability" type="number" min="1" max="5" value="${Number(exercise.stabilityDemand)||1}"></label>
          <label><span>Demanda de equilibrio (1–5)</span><input id="libraryExerciseBalance" type="number" min="1" max="5" value="${Number(exercise.balanceDemand)||1}"></label>
          <label><span>Posiciones corporales</span><input id="libraryExercisePositions" value="${esc(csvField(exercise.bodyPositions))}"></label>
          <label><span>Tipos de carga</span><input id="libraryExerciseLoading" value="${esc(csvField(exercise.loadingTypes))}"></label>
          <label><span>Grupos de sustitución</span><input id="libraryExerciseGroups" value="${esc(csvField(exercise.substitutionGroups))}"></label>
          <label><span>Precauciones</span><input id="libraryExerciseCautions" value="${esc(csvField(exercise.cautionFlags))}"></label>
          <label><span>Exclusiones</span><input id="libraryExerciseExclusions" value="${esc(csvField(exercise.exclusionFlags))}"></label>
          <label><input id="libraryExerciseUnilateral" type="checkbox" ${exercise.unilateral?"checked":""}><span>Unilateral</span></label>
          <label><input id="libraryExerciseSupported" type="checkbox" ${exercise.supported?"checked":""}><span>Con apoyo</span></label>
        </div>`:""}
        <button id="saveLibraryExercise" class="primary full" type="button" ${state.exerciseLibraryBusy?"disabled":""}>${state.exerciseLibraryBusy==="save"?"Guardando…":existing?"Guardar cambios":"Crear ejercicio"}</button>
      </section>
    </main>
  </div>`;
  document.getElementById("backLibraryEditor").onclick=()=>{state.screen="exerciseLibrary";renderExerciseLibrary();};
  document.getElementById("toggleExerciseAdvanced").onclick=()=>{
    state.exerciseLibraryFormDraft=libraryExerciseFormValue();
    state.exerciseLibraryAdvancedOpen=!state.exerciseLibraryAdvancedOpen;
    renderExerciseLibraryEditor();
  };
  document.getElementById("saveLibraryExercise").onclick=()=>saveLibraryExerciseForm();
  document.getElementById("libraryExerciseName")?.focus();
}
function libraryExerciseFormValue(){
  const existing=getExerciseLibrary().find(item=>item.id===state.editingLibraryExerciseId);
  const base=state.exerciseLibraryFormDraft||existing||{};
  const numberOrBase=(id,key)=>{
    const element=document.getElementById(id);
    return element?Number(element.value)||undefined:base[key];
  };
  const listOrBase=(id,key)=>document.getElementById(id)?parseListField(id):(base[key]||[]);
  return {
    name:document.getElementById("libraryExerciseName")?.value,
    aliases:parseListField("libraryExerciseAliases"),
    category:document.getElementById("libraryExerciseCategory")?.value,
    movementPattern:document.getElementById("libraryExercisePattern")?.value,
    primaryMuscles:parseListField("libraryExercisePrimaryMuscles"),
    secondaryMuscles:parseListField("libraryExerciseSecondaryMuscles"),
    requiredEquipment:parseListField("libraryExerciseEquipment"),
    trainingLocations:parseListField("libraryExerciseLocations"),
    difficulty:document.getElementById("libraryExerciseDifficulty")?.value,
    recordTypes:[document.getElementById("libraryExerciseRecordType")?.value],
    defaultPrescription:{
      sets:Number(document.getElementById("libraryExerciseSets")?.value),
      repRange:{min:Number(document.getElementById("libraryExerciseRepMin")?.value),max:Number(document.getElementById("libraryExerciseRepMax")?.value)},
      targetRir:{min:2,max:3},restSeconds:Number(document.getElementById("libraryExerciseRest")?.value)
    },
    instructions:{...(base.instructions||{}),short:document.getElementById("libraryExerciseInstructions")?.value},
    notes:document.getElementById("libraryExerciseNotes")?.value,
    technicalComplexity:numberOrBase("libraryExerciseComplexity","technicalComplexity"),
    stabilityDemand:numberOrBase("libraryExerciseStability","stabilityDemand"),
    balanceDemand:numberOrBase("libraryExerciseBalance","balanceDemand"),
    bodyPositions:listOrBase("libraryExercisePositions","bodyPositions"),
    loadingTypes:listOrBase("libraryExerciseLoading","loadingTypes"),
    substitutionGroups:listOrBase("libraryExerciseGroups","substitutionGroups"),
    cautionFlags:listOrBase("libraryExerciseCautions","cautionFlags"),
    exclusionFlags:listOrBase("libraryExerciseExclusions","exclusionFlags"),
    pregnancy:base.pregnancy||{},
    unilateral:document.getElementById("libraryExerciseUnilateral")
      ?Boolean(document.getElementById("libraryExerciseUnilateral").checked):Boolean(base.unilateral),
    supported:document.getElementById("libraryExerciseSupported")
      ?Boolean(document.getElementById("libraryExerciseSupported").checked):Boolean(base.supported)
  };
}
function exerciseValidationMessage(code){
  return {
    exercise_name_required:"Escribe un nombre.",exercise_name_too_long:"El nombre es demasiado largo.",
    invalid_category:"Selecciona una categoría válida.",invalid_movement_pattern:"Selecciona un patrón válido.",
    invalid_record_type:"Selecciona un tipo de registro válido.",exercise_id_immutable:"El identificador no puede modificarse.",
    metadata_out_of_range:"Revisa los valores avanzados.",duplicate_name:"Ya existe otro ejercicio con ese nombre.",
    primary_muscles_review_required:"Añade al menos un músculo principal.",
    equipment_review_required:"Añade el equipamiento necesario.",
    instructions_review_required:"Añade instrucciones antes de usarlo en recomendaciones.",
    pregnancy_review_required:"La información de embarazo necesita revisión."
  }[code]||"Revisa los datos del ejercicio.";
}
function createExerciseIdentitySeed(){
  const secureCrypto=globalThis.crypto;
  if(typeof secureCrypto?.randomUUID==="function") return secureCrypto.randomUUID();
  if(typeof secureCrypto?.getRandomValues==="function"){
    const values=new Uint32Array(4);
    secureCrypto.getRandomValues(values);
    return [...values].map(value=>value.toString(16).padStart(8,"0")).join("-");
  }
  throw new Error("secure_identity_seed_unavailable");
}
async function saveLibraryExerciseForm(){
  if(state.exerciseLibraryBusy) return;
  const api=exerciseLibraryWorkflowApi(),owner=exerciseLibraryOwner();
  const form=libraryExerciseFormValue();
  state.exerciseLibraryFormDraft=form;
  state.exerciseLibraryBusy="save";renderExerciseLibraryEditor();
  try{
    const library=getExerciseLibrary();
    const existing=library.find(item=>item.id===state.editingLibraryExerciseId);
    if(existing&&existing.updatedAt!==state.exerciseLibraryEditBaseline) throw new Error("edit_conflict");
    if(owner!==exerciseLibraryOwner()) return;
    const timestamp=new Date().toISOString();
    const seed=createExerciseIdentitySeed();
    const result=api.buildCustomExercise(form,{ownerId:owner,library,existing,timestamp,idSeed:seed});
    if(!result.valid){
      state.exerciseLibraryMessage={type:"error",text:result.errors.map(exerciseValidationMessage).join(" ")};
      return;
    }
    if(owner!==exerciseLibraryOwner()) return;
    const currentLibrary=getExerciseLibrary(),currentExisting=currentLibrary.find(item=>item.id===existing?.id);
    if(existing&&currentExisting?.updatedAt!==state.exerciseLibraryEditBaseline) throw new Error("edit_conflict");
    if(result.changed) saveExerciseLibrary(existing
      ?currentLibrary.map(item=>item.id===existing.id?result.exercise:item)
      :[...currentLibrary,result.exercise],{touchUpdatedAt:false,ownerId:owner});
    state.exerciseLibraryMessage={
      type:"success",
      text:result.warnings.length
        ?`Ejercicio guardado como “Requiere revisión”. ${result.warnings.map(exerciseValidationMessage).join(" ")}`
        :(existing?"Ejercicio actualizado.":"Ejercicio creado.")
    };
    state.editingLibraryExerciseId=null;state.exerciseLibraryEditBaseline=null;state.exerciseLibraryFormDraft=null;state.screen="exerciseLibrary";
  }catch(error){
    state.exerciseLibraryMessage={type:"error",text:error?.message==="edit_conflict"
      ?"El ejercicio cambió en otro lugar. Vuelve a abrirlo antes de guardar."
      :"No se pudo guardar el ejercicio."};
  }finally{state.exerciseLibraryBusy=null;}
  state.screen==="exerciseLibrary"?renderExerciseLibrary():renderExerciseLibraryEditor();
}
function renderExerciseDetail(){
  const api=exerciseLibraryWorkflowApi(),item=getExerciseLibrary().find(exercise=>exercise.id===state.selectedLibraryExerciseId);
  if(!item){state.screen="exerciseLibrary";renderExerciseLibrary();return;}
  const detail=api.detailModel(item,exerciseLibraryContext());
  const lines=(values,empty="Sin información")=>values?.length?`<ul>${values.map(value=>`<li>${esc(value)}</li>`).join("")}</ul>`:`<p class="subtle">${empty}</p>`;
  app.innerHTML=`<div class="app-shell exercise-library-shell">
    <header class="topbar"><button id="backExerciseDetail" class="back-button" type="button" aria-label="Volver">←</button>
      <div><div class="brand">${esc(detail.name)}</div><div class="subtle">${esc(detail.origin)} · ${esc(exerciseStatusLabel(detail.status))}</div></div>
      ${detail.editable?`<button id="editExerciseFromDetail" class="header-action" type="button">Editar</button>`:""}
    </header>
    <main class="screen">
      <section class="card exercise-profile-card">
        <div class="exercise-profile-heading"><div><h1 tabindex="-1">${esc(detail.name)}</h1><p>${esc(detail.category)} · ${esc(detail.pattern)}</p></div>
          <button id="favoriteExerciseDetail" type="button" class="favorite-button ${detail.favorite?"active":""}" aria-label="${detail.favorite?"Quitar de favoritos":"Añadir a favoritos"}">★</button></div>
        <div class="exercise-card-tags">${detail.muscles.map(value=>`<span>${esc(value)}</span>`).join("")}${detail.equipment.map(value=>`<span>${esc(value)}</span>`).join("")}</div>
        ${detail.warning?`<p class="exercise-context-warning">${esc(detail.warning)}</p>`:""}
      </section>
      <section class="card exercise-detail-grid">
        <div><span>Subpatrón</span><strong>${esc(detail.subpattern)}</strong></div>
        <div><span>Músculos secundarios</span><strong>${esc(detail.secondaryMuscles.join(", ")||"Sin especificar")}</strong></div>
        <div><span>Ubicaciones</span><strong>${esc(detail.locations.join(", ")||"Sin especificar")}</strong></div>
        <div><span>Dificultad</span><strong>${esc(detail.difficulty)}</strong></div>
        <div><span>Registro</span><strong>${esc(detail.recordTypes.join(", "))}</strong></div>
        <div><span>Prescripción</span><strong>${Number(detail.prescription.sets)||"—"} series · ${Number(detail.prescription.restSeconds)||"—"} s</strong></div>
      </section>
      <section class="card"><h2>Instrucciones</h2><p>${esc(detail.instructions.short||"Sin instrucciones breves.")}</p>
        <h3>Preparación</h3>${lines(detail.instructions.setup)}
        <h3>Ejecución</h3>${lines(detail.instructions.execution)}
        <h3>Respiración</h3><p>${esc(detail.instructions.breathing||"Sin indicaciones específicas.")}</p>
        <h3>Señales para detenerse</h3>${lines(detail.instructions.stopIf,"Detente si aparece dolor o malestar inesperado.")}</section>
      <section class="card"><h2>Seguridad y restricciones</h2>${lines(detail.warnings,"No hay advertencias específicas registradas.")}
        ${detail.pregnancy?`<p class="subtle">Embarazo: información conservadora. Debe revisarse según etapa y situación individual.</p>`:""}</section>
      <section class="card"><h2>Alternativas conocidas</h2>${lines(detail.alternatives.map(id=>getExerciseLibrary().find(exercise=>exercise.id===id)?.name||api.label(id)))}</section>
    </main>
  </div>`;
  document.getElementById("backExerciseDetail").onclick=()=>{state.screen="exerciseLibrary";renderExerciseLibrary();};
  const edit=document.getElementById("editExerciseFromDetail");
  if(edit) edit.onclick=()=>{state.editingLibraryExerciseId=item.id;state.exerciseLibraryEditBaseline=item.updatedAt||null;state.exerciseLibraryFormDraft=null;state.screen="exerciseLibraryEditor";renderExerciseLibraryEditor();};
  document.getElementById("favoriteExerciseDetail").onclick=event=>{
    if(state.exerciseLibraryBusy) return;
    const owner=exerciseLibraryOwner();
    state.exerciseLibraryBusy="favorite";
    event.currentTarget.disabled=true;
    try{
      if(owner!==exerciseLibraryOwner()) return;
      if(setExerciseFavorite(item.id,!item.favorite)) renderExerciseDetail();
    }finally{
      state.exerciseLibraryBusy=null;
    }
  };
  document.querySelector("main h1")?.focus?.();
}
function findLibraryExerciseForRuntime(runtimeExercise){
  const library=getExerciseLibrary();
  const id=runtimeExercise?.exerciseId||runtimeExercise?.id;
  if(id){
    const exact=library.find(item=>item.id===id);
    if(exact) return exact;
  }
  const normalize=window.GymOSExerciseDomain.normalizeToken;
  const key=normalize(runtimeExercise?.name);
  const matches=library.filter(item=>normalize(item.name)===key||item.aliases?.some(alias=>normalize(alias)===key));
  return matches.length===1?matches[0]:null;
}
function resetSubstitutionTimers(session,index){
  Object.keys(state.exerciseTimers||{}).filter(key=>key.startsWith(`${session}:${index}:`)).forEach(key=>{
    const timer=state.exerciseTimers[key];if(timer?.intervalId) clearInterval(timer.intervalId);delete state.exerciseTimers[key];
  });
}
function openExerciseSubstitution(mode,exerciseIndex){
  const api=exerciseLibraryWorkflowApi(),owner=exerciseLibraryOwner(),session=resolveRuntimeSessionId();
  const source=mode==="temporary"?getDraft(session):activeRoutineSession(session);
  const exercise=mode==="temporary"?source.exercises?.[exerciseIndex]:source?.exercises?.[exerciseIndex];
  const key=activeWorkoutExerciseKey(session,exercise,exerciseIndex);
  const visualId=state.workoutVisualLibrarySelections.get(key);
  const original=(visualId?getExerciseLibrary().find(item=>item.id===visualId):null)
    ||findLibraryExerciseForRuntime(exercise);
  if(!original){
    state.workoutChangeMenuOpen=false;
    setActiveWorkoutMessage("info","Elige primero una ficha compatible para poder buscar una sustitución segura. Puedes continuar registrando sin resolverla.");
    state.screen="workout";
    renderWorkout();
    return;
  }
  if(mode==="temporary"&&api.hasExerciseResults(exercise)){
    state.workoutChangeMenuOpen=false;
    setActiveWorkoutMessage("info","No puedes cambiar este ejercicio en la sesión actual porque ya has empezado a registrar resultados.");
    state.screen="workout";
    renderWorkout();
    return;
  }
  const baselineHash=window.GymOSRoutineProposals.routineHash(activeRoutineForComparison());
  const draftHash=window.GymOSRoutineProposals.stableHash(getDraft(session));
  state.exerciseSubstitution={ownerId:owner,mode,session,exerciseIndex,originalExerciseId:original.id,baselineHash,draftHash,selectedId:null,reason:"",showAll:false,busy:null,message:null};
  stopWorkoutSessionTimer();
  stopAllExerciseTimers();
  state.screen="exerciseSubstitution";renderExerciseSubstitution();
}
function substitutionAlternatives(){
  const flow=state.exerciseSubstitution,original=getExerciseLibrary().find(item=>item.id===flow?.originalExerciseId);
  if(!flow||!original) return {available:[],unavailable:[],errors:["exercise_not_found"]};
  const knownIds=getHistory().flatMap(workout=>(workout.exercises||[]).map(exercise=>exercise.exerciseId||exercise.id).filter(Boolean));
  return exerciseLibraryWorkflowApi().evaluateAlternatives(original,getExerciseLibrary(),{
    ...exerciseLibraryContext(),knownExerciseIds:knownIds
  });
}
function substitutionBlockedLabel(code){
  return {
    archived:"Está archivado.",needs_review:"Su ficha necesita revisión.",
    invalid_exercise:"La ficha no es válida.",equipment_or_location_unavailable:"Requiere otro equipamiento o ubicación.",
    exercise_avoided:"Está en tu lista de ejercicios evitados.",
    record_type_incompatible:"Usa un tipo de registro incompatible.",
    owner_mismatch:"Pertenece a otro propietario.",pregnancy_not_reviewed:"No está revisado para el estado vital actual.",
    pregnancy_prohibited:"No está disponible para el estado vital actual.",
    pregnancy_risk_unknown:"Falta información de seguridad."
  }[code]||"No está disponible por una restricción.";
}
function renderAlternativeCard(row,selectable){
  const api=exerciseLibraryWorkflowApi(),exercise=row.exercise;
  return `<article class="card substitution-option ${selectable&&state.exerciseSubstitution.selectedId===exercise.id?"selected":""}">
    <div><h3>${esc(exercise.name)}</h3><p>${esc(api.label(exercise.movementPattern))} · ${esc(exercise.primaryMuscles.map(api.label).join(", "))}</p></div>
    <div class="exercise-card-tags">${exercise.requiredEquipment.map(value=>`<span>${esc(api.label(value))}</span>`).join("")}<span>${esc(api.label(exercise.difficulty))}</span><span>${esc(exercise.recordTypes.map(api.label).join(", "))}</span></div>
    <p><strong>${esc(row.label)}</strong> ${esc(row.reasons.join(" "))}</p>
    ${row.warnings.length?`<p class="exercise-context-warning">${esc(row.warnings.map(api.label).join(" "))}</p>`:""}
    ${selectable?`<button type="button" class="secondary full" data-select-substitute="${esc(exercise.id)}">Elegir alternativa</button>`
      :`<p class="unavailable-reason">${esc(row.blocked.map(substitutionBlockedLabel).join(" "))}</p>`}
  </article>`;
}
function renderExerciseSubstitution(){
  const flow=state.exerciseSubstitution;
  if(!flow||flow.ownerId!==currentRoutineOwnerOrNull()){state.exerciseSubstitution=null;state.screen="workout";renderWorkout();return;}
  const original=getExerciseLibrary().find(item=>item.id===flow.originalExerciseId);
  const alternatives=substitutionAlternatives();
  const available=flow.showAll?alternatives.available:alternatives.available.slice(0,10);
  const selected=getExerciseLibrary().find(item=>item.id===flow.selectedId);
  app.innerHTML=`<div class="app-shell exercise-library-shell">
    <header class="topbar"><button id="backExerciseSubstitution" class="back-button" type="button" aria-label="Volver">←</button>
      <div><div class="brand">${flow.mode==="temporary"?"Cambio para este entrenamiento":"Propuesta de cambio de rutina"}</div><div class="subtle">${esc(original?.name||"Ejercicio")}</div></div></header>
    <main class="screen">
      ${flow.message?`<div class="form-message error" role="alert">${esc(flow.message)}</div>`:`<div aria-live="polite"></div>`}
      <section class="card"><h2>Elige una alternativa</h2><p>${flow.mode==="temporary"
        ?"Solo cambiará el entrenamiento actual. La rutina seguirá intacta."
        :"Se creará una propuesta completa para revisar y activar de forma segura."}</p></section>
      ${alternatives.errors.length?`<section class="card form-message error" role="alert">La biblioteca contiene identificadores duplicados y debe corregirse antes de continuar.</section>`:""}
      <section class="substitution-options">${available.map(row=>renderAlternativeCard(row,true)).join("")||`<div class="card empty">No hay alternativas compatibles disponibles.</div>`}</section>
      ${alternatives.available.length>10&&!flow.showAll?`<button id="showMoreAlternatives" class="secondary full" type="button">Ver más alternativas</button>`:""}
      ${alternatives.unavailable.length?`<details class="card"><summary>No disponibles (${alternatives.unavailable.length})</summary><div class="substitution-options unavailable">${alternatives.unavailable.slice(0,10).map(row=>renderAlternativeCard(row,false)).join("")}</div></details>`:""}
      ${selected?`<section class="card substitution-selection-summary"><h2>Comparación</h2>
        <div class="substitution-compare"><div><span>Actual</span><strong>${esc(original.name)}</strong><p>${esc(exerciseLibraryWorkflowApi().label(original.movementPattern))}</p></div>
        <div><span>Propuesto</span><strong>${esc(selected.name)}</strong><p>${esc(exerciseLibraryWorkflowApi().label(selected.movementPattern))}</p></div></div>
        <label for="substitutionReason"><span>Motivo opcional</span><textarea id="substitutionReason" maxlength="500">${esc(flow.reason||"")}</textarea></label>
        <button id="applyExerciseSubstitution" class="primary full" type="button" ${flow.busy?"disabled":""}>${flow.busy?"Guardando…":flow.mode==="temporary"?"Aplicar en esta sesión":"Crear propuesta"}</button>
      </section>`:""}
    </main>
  </div>`;
  document.getElementById("backExerciseSubstitution").onclick=()=>{state.exerciseSubstitution=null;state.screen="workout";renderWorkout();};
  document.querySelectorAll("[data-select-substitute]").forEach(button=>button.onclick=()=>{flow.selectedId=button.dataset.selectSubstitute;renderExerciseSubstitution();});
  const more=document.getElementById("showMoreAlternatives");if(more) more.onclick=()=>{flow.showAll=true;renderExerciseSubstitution();};
  const apply=document.getElementById("applyExerciseSubstitution");
  if(apply) apply.onclick=()=>{flow.reason=document.getElementById("substitutionReason")?.value||"";applyExerciseLibrarySubstitution();};
}
async function applyExerciseLibrarySubstitution(){
  const flow=state.exerciseSubstitution;
  if(!flow||flow.busy) return;
  const api=exerciseLibraryWorkflowApi(),owner=exerciseLibraryOwner();
  if(owner!==flow.ownerId) return;
  const library=getExerciseLibrary(),original=library.find(item=>item.id===flow.originalExerciseId),replacement=library.find(item=>item.id===flow.selectedId);
  if(!original||!replacement) return;
  const ranked=substitutionAlternatives().available.find(row=>row.exercise.id===replacement.id);
  if(!ranked){flow.message="La alternativa ya no está disponible.";renderExerciseSubstitution();return;}
  flow.busy=flow.mode;renderExerciseSubstitution();
  try{
    if(owner!==exerciseLibraryOwner()) return;
    if(flow.mode==="temporary"){
      const current=getDraft(flow.session);
      if(window.GymOSRoutineProposals.stableHash(current)!==flow.draftHash) throw new Error("draft_changed");
      const result=api.temporarySubstitution({
        draft:current,session:flow.session,exerciseIndex:flow.exerciseIndex,
        original,replacement,reason:flow.reason,timestamp:new Date().toISOString()
      });
      if(!result.ok) throw new Error(result.code);
      if(owner!==exerciseLibraryOwner()) return;
      saveDraft(result.draft);resetSubstitutionTimers(flow.session,flow.exerciseIndex);
      state.exerciseSubstitution=null;state.screen="workout";renderWorkout();toast("Cambio aplicado solo a este entrenamiento.");
      return;
    }
    const currentRoutine=activeRoutineForComparison();
    const currentHash=window.GymOSRoutineProposals.routineHash(currentRoutine);
    if(currentHash!==flow.baselineHash) throw new Error("baseline_changed");
    const currentItem=Array.isArray(currentRoutine.sessions)
      ?currentRoutine.sessions.find(session=>session.sessionId===flow.session)?.exercises?.[flow.exerciseIndex]
      :currentRoutine[flow.session]?.[flow.exerciseIndex];
    if(findLibraryExerciseForRuntime(currentItem)?.id!==original.id) throw new Error("baseline_changed");
    const compatibility=window.GymOSRoutineGenerator.validateExerciseCompatibility({
      exercise:replacement,userProfile:window.GymOSProfileData.getUserProfile(),
      currentLifeState:window.GymOSProfileData.getCurrentLifeState()
    });
    const timestamp=new Date().toISOString();
    const proposal=api.permanentSubstitutionProposal({
      ownerId:owner,routine:currentRoutine,baselineHash:currentHash,sessionId:flow.session,
      exerciseIndex:flow.exerciseIndex,original,replacement,reason:flow.reason,generatedAt:timestamp,compatibility
    });
    if(owner!==exerciseLibraryOwner()||window.GymOSRoutineProposals.routineHash(activeRoutineForComparison())!==currentHash) throw new Error("baseline_changed");
    const existing=api.findExistingSubstitution(getRoutineProposalRecords(owner),owner,proposal.source.substitutionFingerprint);
    const persisted=existing?{record:existing,created:false}:persistRoutineProposal(proposal,{ownerId:owner,timestamp});
    ensureRoutineWorkflowState();
    state.routineWorkflow=window.GymOSRoutineWorkflowUI.finishOperation(
      window.GymOSRoutineWorkflowUI.setFlowView(state.routineWorkflow,"review",persisted.record.proposal.proposalId),
      {type:"success",text:persisted.created?"Sustitución guardada como propuesta pendiente.":"Esta sustitución ya existía y se ha recuperado."}
    );
    state.exerciseSubstitution=null;state.screen="routineHub";renderRoutineHub();
  }catch(error){
    flow.message={
      exercise_already_started:"No puedes cambiar este ejercicio porque ya has empezado a registrarlo.",
      record_type_incompatible:"El tipo de registro no permite un cambio rápido.",
      draft_changed:"El entrenamiento cambió. Vuelve a abrir la sustitución.",
      baseline_changed:"La rutina cambió. Vuelve a abrir la sustitución."
    }[error?.message]||"No se pudo aplicar la sustitución.";
  }finally{
    if(state.exerciseSubstitution===flow) flow.busy=null;
  }
  if(state.exerciseSubstitution===flow){
    renderExerciseSubstitution();
  }
}
async function undoCurrentExerciseSubstitution(exerciseIndex){
  if(state.exerciseLibraryBusy) return;
  const api=exerciseLibraryWorkflowApi(),owner=exerciseLibraryOwner(),session=resolveRuntimeSessionId();
  state.exerciseLibraryBusy="undo";
  try{
    const current=getDraft(session),result=api.undoTemporarySubstitution({draft:current,session,exerciseIndex});
    if(!result.ok){toast("No puedes deshacer el cambio porque ya has empezado a registrarlo.");return;}
    if(owner!==exerciseLibraryOwner()) return;
    if(!result.idempotent) saveDraft(result.draft);
    resetSubstitutionTimers(session,exerciseIndex);renderWorkout();
    if(!result.idempotent) toast("Ejercicio planificado restaurado.");
  }finally{state.exerciseLibraryBusy=null;}
}

function organizeSettingsScreen(main){
  if(!main) return;
  const cardFor=selector=>main.querySelector(selector)?.closest(".card")||null;
  const assigned=new Set();
  const definitions=[
    {
      id:"account-sync",title:"Cuenta y sincronización",
      description:"Gestiona tu sesión y comprueba si tus cambios están guardados.",
      cards:[cardFor(".account-entry-card")]
    },
    {
      id:"appearance",title:"Apariencia",
      description:"Adapta tema, texto, contraste y movimiento.",
      cards:[cardFor(".experience-card")]
    },
    {
      id:"training",title:"Entrenamiento",
      description:"Configura el comportamiento durante una sesión y accede a recuperación y Coach.",
      cards:[
        cardFor("#trainingRestSettings"),cardFor("#openRecoveryCenter"),cardFor("#openCoach")
      ]
    },
    {
      id:"routine-planning",title:"Rutina y planificación",
      description:"Revisa tu objetivo, planificación y biblioteca de ejercicios.",
      cards:[
        cardFor(".onboarding-profile-card"),
        cardFor("#openProgressDashboard"),cardFor("#openFavoriteExercises"),
        cardFor("#openSubstitutionHistory"),cardFor("#openExerciseLibrary"),
        cardFor("#openGlobalAnalytics"),cardFor("#openBlocksSettings")
      ]
    },
    {
      id:"data",title:"Datos",
      description:"Consulta tus registros y gestiona copias o datos locales.",
      cards:[
        cardFor("#openBackupRestore"),cardFor("#openHealth"),cardFor("#openBodySettings"),
        cardFor("#exportData"),cardFor("#deleteData")
      ]
    },
    {
      id:"advanced",title:"Avanzado",
      description:`GymOS ${GYMOS_VERSION} · Diagnóstico y configuración técnica.`,
      cards:[cardFor(".ai-settings-entry"),cardFor(".sync-card")]
    }
  ];
  const allCards=Array.from(main.children).filter(element=>element.classList.contains("card"));
  definitions.forEach(definition=>definition.cards=definition.cards.filter(card=>{
    if(!card||assigned.has(card)) return false;
    assigned.add(card);
    return true;
  }));
  definitions.at(-1).cards.push(...allCards.filter(card=>!assigned.has(card)));
  const fragment=document.createDocumentFragment();
  definitions.forEach(definition=>{
    if(!definition.cards.length) return;
    const section=document.createElement("section");
    section.className="settings-section";
    section.dataset.settingsSection=definition.id;
    section.setAttribute("aria-labelledby",`settings-${definition.id}`);
    section.innerHTML=`<header class="settings-section-heading">
      <h2 id="settings-${definition.id}">${definition.title}</h2>
      <p>${definition.description}</p>
    </header><div class="settings-section-grid"></div>`;
    const grid=section.querySelector(".settings-section-grid");
    definition.cards.forEach(card=>grid.appendChild(card));
    fragment.appendChild(section);
  });
  main.replaceChildren(fragment);
}

function renderSettings(){
  app.innerHTML=`<div class="app-shell">
    <header class="topbar"><div><div class="brand">Ajustes</div><div class="subtle">GymOS ${GYMOS_VERSION}</div></div></header>
    <main class="screen settings-screen">
      <section class="card account-entry-card">
        <div class="account-entry-main">
          <div class="account-avatar" ${state.syncUser?"data-account-avatar":""}>${state.syncUser?esc(accountAvatarContent()):"○"}</div>
          <div>
            <span class="section-kicker">CUENTA GYMOS</span>
            <h2>${state.syncUser?`Hola, <span data-account-display-name>${esc(accountDisplayName())}</span>`:"Tus datos, solo para ti"}</h2>
            <p class="subtle">${state.syncUser
              ?`Sesión iniciada como ${esc(state.syncUser.email||"usuario")}.`
              :"Crea una cuenta para mantener entrenamientos, nutrición y salud separados de otros usuarios."}</p>
          </div>
        </div>
        <div class="settings-account-sync-row">
          <span class="sync-dot ${esc(state.syncStatus)}" data-sync-dot aria-hidden="true"></span>
          <div><strong data-sync-label>${esc(syncStatusLabel())}</strong><small data-sync-description>${esc(syncStatusDescription())}</small></div>
        </div>
        <div class="settings-actions">
          <button id="openAccount" class="primary">${state.syncUser?"Gestionar cuenta":"Crear cuenta o iniciar sesión"}</button>
          ${state.syncIssue?.retryable&&navigator.onLine?`<button id="settingsSyncRetry" type="button" class="secondary">Reintentar sincronización</button>`:""}
          ${isAppAuthenticated()?`<button id="settingsSignOut" type="button" class="secondary">Cerrar sesión</button>`:""}
        </div>
      </section>


      <section class="card onboarding-profile-card">
        <div class="card-heading-row">
          <div>
            <span class="section-kicker">MI PLAN</span>
            <h2>Objetivo y perfil deportivo</h2>
            <p class="subtle">${onboardingCompleted()
              ?`${esc(onboardingGoalLabel(window.GymOSProfileData?.getActiveGoalCycle?.()?.primaryGoal))} · ${window.GymOSProfileData?.getUserProfile?.()?.weeklyAvailability||getOnboardingProfile().days} días por semana`
              :"Completa el cuestionario para crear una rutina adaptada."}</p>
          </div>
          <span class="mode-pill">${onboardingCompleted()?"Configurado":"Pendiente"}</span>
        </div>
        <button id="openOnboarding" class="primary full">${onboardingCompleted()?"Editar perfil de entrenamiento":"Configurar mi perfil"}</button>
      </section>

      <section class="card ai-settings-entry">
        <div class="card-heading-row">
          <div><span class="section-kicker">CONFIGURACIÓN</span><h2>Inteligencia artificial</h2><p class="subtle">Elige si el Coach puede utilizar el proveedor seguro configurado en el servidor para redactar sus mensajes.</p></div>
          <span class="mode-pill">${esc(aiStatusLabel(getCoachConnection().aiStatus||getCoachConnection().status,getCoachSettings().aiEnabled))}</span>
        </div>
        <button id="openAiSettings" class="secondary full" type="button">Configurar Coach IA</button>
      </section>

      <section class="card experience-card">
        <div class="card-heading-row">
          <div><span class="section-kicker">EXPERIENCIA</span><h2>Apariencia y experiencia</h2><p class="subtle">Adapta GymOS para entrenar sin distracciones o acceder a herramientas técnicas.</p></div>
          <span class="mode-pill">${developerModeEnabled()?"Desarrollador":"Usuario"}</span>
        </div>
        <div class="segmented-control" id="appModeControl">
          <button data-app-mode="user" class="${!developerModeEnabled()?"active":""}">Modo usuario</button>
          <button data-app-mode="developer" class="${developerModeEnabled()?"active":""}">Modo desarrollador</button>
        </div>
        <div class="appearance-grid">
          <label><span>Tema</span>
            <select id="appTheme">
              <option value="system" ${getAppPreferences().theme==="system"?"selected":""}>Automático</option>
              <option value="light" ${getAppPreferences().theme==="light"?"selected":""}>Claro</option>
              <option value="dark" ${getAppPreferences().theme==="dark"?"selected":""}>Oscuro</option>
            </select>
          </label>
          <label><span>Color principal</span>
            <select id="appAccent">
              <option value="violet" ${getAppPreferences().accent==="violet"?"selected":""}>Violeta</option>
              <option value="blue" ${getAppPreferences().accent==="blue"?"selected":""}>Azul</option>
              <option value="teal" ${getAppPreferences().accent==="teal"?"selected":""}>Verde azulado</option>
              <option value="orange" ${getAppPreferences().accent==="orange"?"selected":""}>Naranja</option>
            </select>
          </label>
          <label><span>Tamaño de texto</span>
            <select id="appFontScale">
              <option value="small" ${getAppPreferences().fontScale==="small"?"selected":""}>Pequeño</option>
              <option value="normal" ${getAppPreferences().fontScale==="normal"?"selected":""}>Normal</option>
              <option value="large" ${getAppPreferences().fontScale==="large"?"selected":""}>Grande</option>
              <option value="xlarge" ${getAppPreferences().fontScale==="xlarge"?"selected":""}>Muy grande</option>
            </select>
          </label>
          <label><span>Densidad</span>
            <select id="appDensity">
              <option value="compact" ${getAppPreferences().density==="compact"?"selected":""}>Compacta</option>
              <option value="comfortable" ${getAppPreferences().density==="comfortable"?"selected":""}>Cómoda</option>
              <option value="spacious" ${getAppPreferences().density==="spacious"?"selected":""}>Amplia</option>
            </select>
          </label>
          <fieldset class="daily-thought-preference">
            <legend>Pensamiento del día</legend>
            <div class="daily-thought-options">
              ${[
                ["automatic","Automático"],
                ["stoicism","Estoicismo"],
                ["science","Ciencia"],
                ["coach","Coach"],
                ["minimalist","Minimalista"],
                ["performance","Rendimiento"],
                ["disabled","Desactivado"]
              ].map(([value,label])=>`<label>
                <input type="radio" name="dailyThoughtPreference" value="${value}" ${getAppPreferences().dailyThought===value?"checked":""}>
                <span>${label}</span>
              </label>`).join("")}
            </div>
          </fieldset>
        </div>

        <div class="preset-grid">
          <button data-ui-preset="balanced"><strong>Equilibrado</strong><small>Automático y limpio</small></button>
          <button data-ui-preset="focus"><strong>Entrenamiento</strong><small>Oscuro y compacto</small></button>
          <button data-ui-preset="accessible"><strong>Accesible</strong><small>Texto grande y contraste</small></button>
          <button data-ui-preset="bold"><strong>Intenso</strong><small>Alto contraste</small></button>
        </div>

        <div class="preference-switches">
          <label><input id="compactUi" type="checkbox" ${getAppPreferences().compact?"checked":""}><span>Diseño compacto</span></label>
          <label><input id="reduceMotionUi" type="checkbox" ${getAppPreferences().animations?"":"checked"}><span>Reducir movimiento</span></label>
          <label><input id="highContrastUi" type="checkbox" ${getAppPreferences().highContrast?"checked":""}><span>Alto contraste</span></label>
          <label><input id="largeTapTargetsUi" type="checkbox" ${getAppPreferences().largeTapTargets?"checked":""}><span>Botones más grandes</span></label>
          <label><input id="quickActionsVisible" type="checkbox" ${getQuickActionPreferences().hidden?"":"checked"}><span>Mostrar accesos rápidos en Inicio</span></label>
        </div>
        ${developerModeEnabled()?`<button id="openDeveloperMode" class="secondary full">Abrir centro de desarrollador</button>`:""}
      </section>

      <section class="card sync-card developer-only"><span class="section-kicker">CONFIGURACIÓN TÉCNICA</span>
        <div class="card-heading-row">
          <div><h2>Sincronización automática</h2><p class="subtle" data-sync-label>${syncStatusLabel()}</p></div>
          <span class="sync-dot ${state.syncStatus}" data-sync-dot></span>
        </div>
        <p class="subtle">Los cambios se guardan primero en el dispositivo y se sincronizan automáticamente al abrir la app, terminar una sesión o recuperar Internet.</p>
        <div class="sync-summary">
          <div><span>Última sincronización</span><strong data-last-sync>${formatSyncDate(getLastSyncAt())}</strong></div>
          <div><span>Dispositivo</span><strong>${getDeviceName()}</strong></div>
        </div>
        <div class="sync-fields">
          <label><span>Supabase Project URL</span><input id="syncUrl" type="url" value="${getSyncConfig().url}" placeholder="https://xxxxx.supabase.co"></label>
          <label><span>Anon public key</span><input id="syncKey" type="password" value="${getSyncConfig().key}" placeholder="eyJ..."></label>
          
          <label><span>Nombre de este dispositivo</span><input id="deviceName" type="text" value="${getDeviceName()}" placeholder="Mi móvil"></label>
        </div>
        <div class="settings-actions">
          <button id="saveSyncConfig" class="secondary">Guardar configuración</button>
          ${state.syncUser
            ?`<button id="syncNow" class="primary">Sincronizar ahora</button>`
            :`<button id="openAccountFromSync" class="primary">Abrir cuenta</button>`}
        </div>
        ${state.syncUser?`<div class="sync-user">Conectado como <strong>${state.syncUser.email||"usuario"}</strong></div>`:""}
        <details class="sync-help">
          <summary>Cómo configurarlo</summary>
          <p>Ejecuta <strong>database/supabase/schema.sql</strong>, <strong>database/supabase/account-profile.sql</strong>, <strong>database/supabase/body-measurements.sql</strong> y <strong>database/supabase/workout-analyses.sql</strong>, y añade <strong>https://apl00028.github.io/mi-rutina/</strong> en Authentication → URL Configuration → Redirect URLs. Usa la clave <strong>Publishable</strong> o <strong>anon public</strong>, nunca una secret/service role.</p>
        </details>
      </section>
      <section class="card health-entry-card">
        <div class="card-heading-row">
          <div>
            <span class="coach-badge">NUEVO</span>
            <h2>Salud y recuperación</h2>
            <p class="subtle">Registra sueño, pasos, frecuencia cardiaca y HRV. Importa datos desde CSV y prepara futuras conexiones con relojes.</p>
          </div>
        </div>
        <button id="openHealth" class="primary full">Abrir salud y recuperación</button>
      </section>

      <section class="card recovery-entry-card">
        <div class="card-heading-row">
          <div>
            <h2>Recuperación</h2>
            <p class="subtle">Consulta evaluaciones pendientes, orientación e historial de recuperación.</p>
          </div>
        </div>
        <button id="openRecoveryCenter" class="primary full">Abrir recuperación</button>
      </section>

      <section class="card">
        <h2>Dashboard de progreso</h2>
        <p class="subtle">Volumen semanal, fatiga, adherencia, grupos musculares y récords personales.</p>
        <button id="openProgressDashboard" class="secondary full">Ver progreso</button>
      </section>

      <section class="card coach-entry-card">
        <div class="coach-card-heading">
          <div>
            <span class="coach-badge">NUEVO</span>
            <h2>GymOS Coach</h2>
            <p class="subtle">Analiza tu evolución y propone cambios que tú puedes aceptar, rechazar o deshacer.</p>
          </div>
        </div>
        <button id="openCoach" class="primary full">Abrir Coach</button>
      </section>

      <section class="card">
        <h2>Ejercicios favoritos</h2>
        <p class="subtle">${getFavoriteExercises().length} ejercicios marcados. Ordénalos y añádelos rápidamente a tu rutina.</p>
        <button id="openFavoriteExercises" class="secondary full">Gestionar favoritos</button>
      </section>

      <section class="card">
        <h2>Copia de seguridad</h2>
        <p class="subtle">Exporta todos tus datos o restaura una copia sin depender del navegador.</p>
        <button id="openBackupRestore" class="secondary full">Exportar o restaurar</button>
      </section>

      <section class="card">
        <h2>Sustituciones recientes</h2>
        <p class="subtle">${getExerciseSubstitutions().length} cambios guardados. Las sustituciones conservan la configuración de la sesión.</p>
        <button id="openSubstitutionHistory" class="secondary full">Ver historial</button>
      </section>
      <section class="card">
        <h2>Biblioteca de ejercicios</h2>
        <p class="subtle">Busca, consulta y organiza ejercicios GymOS y personalizados.</p>
        <button id="openExerciseLibrary" class="secondary full">Abrir biblioteca</button>
      </section>
      <section class="card">
        <h2>Análisis global</h2>
        <p class="subtle">Revisa volumen, progreso por ejercicio y posibles estancamientos.</p>
        <button id="openGlobalAnalytics" class="primary full">Abrir análisis</button>
      </section>
      <section class="card">
        <h2>Bloques de entrenamiento</h2>
        <p class="subtle">Organiza la rutina en periodos de 4, 6 u 8 semanas y controla el avance.</p>
        <button id="openBlocksSettings" class="primary full">Gestionar bloques</button>
      </section>
      <section class="card training-rest-card" id="trainingRestSettings">
        <h2>Descanso entre series</h2>
        <p class="subtle">Define el descanso de las próximas series. Un temporizador que ya esté en marcha conserva su tiempo actual.</p>
        <div class="rest-options" role="group" aria-label="Descanso por defecto">
          ${[60,90,120,180].map(value=>`<button type="button" class="rest-option ${getRestSeconds()===value?"active":""}" data-rest-setting="${value}" aria-pressed="${getRestSeconds()===value}" ${state.restPreferenceBusy?"disabled":""}>${value===60?"1 min":value===90?"1:30":value===120?"2 min":"3 min"}</button>`).join("")}
        </div>
      </section>
      <section class="card">
        <h2>Seguimiento corporal</h2>
        <p class="subtle">Registra peso y cintura para comprobar la tendencia junto con tu rendimiento.</p>
        <button id="openBodySettings" class="secondary full">Abrir seguimiento corporal</button>
      </section>
      <section class="card developer-only">
        <h2>Copia de seguridad</h2>
        <p class="subtle">Exporta tus entrenamientos a un archivo y podrás recuperarlos en este u otro móvil.</p>
        <div class="settings-actions">
          <button id="openBackupRestoreLegacy" class="secondary full">Abrir copia y restauración</button>
        </div>
      </section>
      <section class="card developer-only">
        <h2>Eliminar datos</h2>
        <p class="subtle">Esta acción borra el historial y las sesiones en curso de este dispositivo.</p>
        <button id="deleteData" class="danger full">Borrar todos los datos</button>
      </section>
    </main>${nav("settings")}
  </div>`;
  organizeSettingsScreen(document.querySelector(".settings-screen"));
  document.getElementById("openAccount").onclick=()=>{state.screen="account";renderAccount();};
  const settingsSyncRetry=document.getElementById("settingsSyncRetry");
  if(settingsSyncRetry) settingsSyncRetry.onclick=()=>retrySyncFromNavigation();
  const settingsSignOut=document.getElementById("settingsSignOut");
  if(settingsSignOut) settingsSignOut.onclick=async()=>{
    if(!confirm("¿Cerrar sesión en este dispositivo?")) return;
    settingsSignOut.disabled=true;
    try{
      await signOutSync();
      state.screen="account";
      render();
    }catch(_){
      settingsSignOut.disabled=false;
      toast("No se pudo cerrar la sesión. Inténtalo de nuevo.");
    }
  };
  const openOnboarding=document.getElementById("openOnboarding");
  if(openOnboarding) openOnboarding.onclick=()=>openTrainingProfileEditor(1,{returnScreen:"settings"});
  const openAccountFromSync=document.getElementById("openAccountFromSync");
  if(openAccountFromSync) openAccountFromSync.onclick=()=>{state.screen="account";renderAccount();};
  document.getElementById("openAiSettings").onclick=async()=>{
    state.aiSettingsMessage=null;
    state.screen="aiSettings";
    renderAiSettings();
    try{
      await fetchAiConfigurationStatus(false);
    }catch(error){
      state.aiSettingsMessage={type:"error",text:"No se pudo consultar el estado del backend."};
    }
    if(state.screen==="aiSettings") renderAiSettings();
  };
  document.querySelectorAll("[data-app-mode]").forEach(button=>button.onclick=()=>{
    const mode=button.dataset.appMode;
    if(mode==="developer"&&!confirm("El modo desarrollador muestra opciones técnicas y acciones avanzadas. ¿Activarlo?")) return;
    saveAppPreferences({mode});
    addDeveloperLog("info",`Modo ${mode} activado`);
    renderSettings();
  });
  document.getElementById("appTheme").onchange=e=>{
    saveAppPreferences({theme:e.target.value});
    renderSettings();
  };
  document.getElementById("appAccent").onchange=e=>{
    saveAppPreferences({accent:e.target.value});
    renderSettings();
  };
  document.getElementById("appFontScale").onchange=e=>{
    saveAppPreferences({fontScale:e.target.value});
    renderSettings();
  };
  document.getElementById("appDensity").onchange=e=>{
    saveAppPreferences({density:e.target.value});
    renderSettings();
  };
  document.querySelectorAll('[name="dailyThoughtPreference"]').forEach(input=>input.onchange=e=>{
    if(e.target.checked) saveAppPreferences({dailyThought:e.target.value});
  });
  document.querySelectorAll("[data-ui-preset]").forEach(button=>button.onclick=()=>{
    applyPreferencePreset(button.dataset.uiPreset);
    addDeveloperLog("info",`Preset visual ${button.dataset.uiPreset} aplicado`);
    renderSettings();
  });
  document.getElementById("compactUi").onchange=e=>{
    saveAppPreferences({compact:e.target.checked});
    renderSettings();
  };
  document.getElementById("reduceMotionUi").onchange=e=>{
    saveAppPreferences({animations:!e.target.checked});
    renderSettings();
  };
  document.getElementById("highContrastUi").onchange=e=>{
    saveAppPreferences({highContrast:e.target.checked});
    renderSettings();
  };
  document.getElementById("largeTapTargetsUi").onchange=e=>{
    saveAppPreferences({largeTapTargets:e.target.checked});
    renderSettings();
  };
  document.getElementById("quickActionsVisible").onchange=e=>{
    saveQuickActionPreferences({hidden:!e.target.checked});
    toast(e.target.checked?"Accesos rápidos visibles.":"Accesos rápidos ocultos.");
    renderSettings();
  };
  document.querySelectorAll("[data-rest-setting]").forEach(button=>button.onclick=()=>{
    if(state.restPreferenceBusy) return;
    state.restPreferenceBusy=true;
    document.querySelectorAll("[data-rest-setting]").forEach(option=>{option.disabled=true;});
    let changed=false;
    try{
      changed=saveRestSeconds(Number(button.dataset.restSetting)).changed;
    }catch(error){
      if(error?.message!=="owner_changed") toast("No se pudo guardar el descanso. Inténtalo de nuevo.");
    }finally{
      state.restPreferenceBusy=false;
    }
    if(changed) renderSettings();
    else document.querySelectorAll("[data-rest-setting]").forEach(option=>{option.disabled=false;});
  });
  const openDeveloperMode=document.getElementById("openDeveloperMode");
  if(openDeveloperMode) openDeveloperMode.onclick=()=>{state.screen="developer";renderDeveloperMode();};
  const saveSyncConfigButton=document.getElementById("saveSyncConfig");
  if(saveSyncConfigButton) saveSyncConfigButton.onclick=async()=>{
    const emailInput=document.getElementById("syncEmail");
    saveSyncConfig({
      url:document.getElementById("syncUrl")?.value||"",
      key:document.getElementById("syncKey")?.value||"",
      email:emailInput?.value||getSyncConfig().email||""
    });
    const deviceInput=document.getElementById("deviceName");
    if(deviceInput) saveDeviceName(deviceInput.value);
    await refreshSyncSession();
    toast("Configuración guardada");
    renderSettings();
  };

  const bindScreen=(id,screen,renderer)=>{
    const button=document.getElementById(id);
    if(button) button.onclick=()=>{state.screen=screen;renderer();};
  };

  bindScreen("openHealth","health",renderHealth);
  bindScreen("openRecoveryCenter","recovery",()=>window.GymOSRecovery.renderRecoveryCenter());
  bindScreen("openCoach","coach",renderCoach);
  bindScreen("openBackupRestore","backupRestore",renderBackupRestore);
  bindScreen("openTrainingBlocks","blocks",renderBlocks);
  bindScreen("openGlobalAnalytics","globalAnalytics",renderGlobalAnalytics);
  bindScreen("openExerciseLibrary","exerciseLibrary",renderExerciseLibrary);
  bindScreen("openFavoriteExercises","favoriteExercises",renderFavoriteExercises);
  bindScreen("openSubstitutionHistory","substitutionHistory",renderSubstitutionHistory);
  bindScreen("openProgressDashboard","progressDashboard",renderProgressDashboard);
  bindScreen("openBlocksSettings","blocks",renderBlocks);
  bindScreen("openBodySettings","body",renderBody);

  bindScreen("openBackupRestoreLegacy","backupRestore",renderBackupRestore);

  const deleteDataButton=document.getElementById("deleteData");
  if(deleteDataButton) deleteDataButton.onclick=()=>{
    if(!confirm("¿Borrar todos los datos locales de GymOS en este dispositivo?")) return;
    const ownerId=localStorage.getItem(LOCAL_OWNER_KEY)||(!AUTH_REQUIRED?"local":null);
    if(!ownerId){toast("No se pudo identificar al propietario de los datos");return;}
    deleteOwnerLocalData(ownerId);
    toast("Datos locales eliminados");
    state.screen="home";
    render();
  };

  bindNav();
}

function exportData(){
  const exportOwnerId=currentRoutineOwnerOrNull();
  const exportCanonicalRoutine=getCanonicalRoutine();
  const payload={
    version:1,
    exportedAt:new Date().toISOString(),
    history:getHistory(),
    drafts:{
      A:parseStoredJson(sanitizeWorkoutStorageValue(
        draftKey("A"),localStorage.getItem(draftKey("A")),{ownerId:exportOwnerId}
      ),null),
      B:parseStoredJson(sanitizeWorkoutStorageValue(
        draftKey("B"),localStorage.getItem(draftKey("B")),{ownerId:exportOwnerId}
      ),null),
      C:parseStoredJson(sanitizeWorkoutStorageValue(
        draftKey("C"),localStorage.getItem(draftKey("C")),{ownerId:exportOwnerId}
      ),null)
    },
    selectedSession:state.selectedSession,
    selectedSessionId:localStorage.getItem(SELECTED_SESSION_ID_KEY),
    routine:getRoutine(),
    canonicalRoutine:exportCanonicalRoutine,
    canonicalDrafts:sanitizeWorkoutDraftContainer(getCanonicalDrafts(),{
      ownerId:exportOwnerId,canonicalRoutine:exportCanonicalRoutine
    }),
    sessionModelMigration:readStoredJson(SESSION_MODEL_MIGRATION_KEY),
    body:getBodyHistory(),
    restSeconds:getRestSeconds(),
    weeklyGoal:getWeeklyGoal(),
    blocks:getTrainingBlocks(),
    activeBlockId:localStorage.getItem("gymos:activeBlockId"),
    routineProposals:getRoutineProposalRecords(),
    activeRoutineProposalId:localStorage.getItem(ACTIVE_ROUTINE_PROPOSAL_ID_KEY),
    routineActivationHistory:getRoutineActivationRecords(),
    activeRoutineActivationId:localStorage.getItem(ACTIVE_ROUTINE_ACTIVATION_ID_KEY),
    ...(window.GymOSProfileData?.exportSyncData?.()||{}),
    updatedAt:getLocalUpdatedAt()
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);
  a.download=`gymos-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();
  URL.revokeObjectURL(a.href);toast("Copia exportada");
}

routineFile.onchange=async()=>{
  const file=routineFile.files?.[0];
  if(!file) return;
  await handleRoutineFileSelection(file);
};

importFile.onchange=async()=>{
  const file=importFile.files[0]; if(!file)return;
  try{
    const data=JSON.parse(await file.text());
    importGymOSBackup(data,"merge");
    toast("Copia importada");renderSettings();
  }catch{toast("El archivo no es una copia válida de GymOS.");}
  importFile.value="";
};

if("serviceWorker" in navigator){navigator.serviceWorker.register(`service-worker.js?v=${encodeURIComponent(GYMOS_VERSION)}`);}

window.addEventListener("online",()=>{
  state.syncStatus=isAppAuthenticated()?"pending":"local";
  state.syncIssue=null;
  updateSyncIndicators();
  requestSafeActiveWorkoutRender();
  if(isSyncDebugRequested()) return;
  autoSync("conexión recuperada");
});
window.addEventListener("offline",()=>{
  state.syncStatus="offline";
  state.syncIssue={kind:"offline",retryable:true};
  updateSyncIndicators();
  requestSafeActiveWorkoutRender();
});
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="hidden"){
    flushWorkoutDraftProgress({scheduleSync:false,silent:true});
  }else{
    if(state.screen==="workout"&&state.workoutDraftMemory){
      restoreActiveRestTimer(state.workoutDraftMemory,{
        now:Date.now(),announceExpired:true
      });
      requestSafeActiveWorkoutRender();
    }
    if(isSyncDebugRequested()) return;
    autoSync("app reabierta");
  }
});
window.addEventListener("pagehide",()=>{
  flushWorkoutDraftProgress({scheduleSync:false,silent:true});
});
window.addEventListener("storage",event=>{
  const ownerId=currentRoutineOwnerOrNull();
  if(
    ownerId&&event.newValue&&(
      event.key===CANONICAL_DRAFTS_KEY||/^gymos:draft:[ABC]$/.test(event.key||"")
    )
  ){
    const repair=repairInflatedLegacyWorkoutStorage({ownerId});
    if(repair.completed&&state.screen==="workout") requestSafeActiveWorkoutRender();
    return;
  }
  if(!ownerId||!event.key?.startsWith(workoutProgressPrefix(ownerId))||!event.newValue) return;
  try{
    const incoming=JSON.parse(event.newValue);
    if(incoming.ownerId!==ownerId) return;
    const memory=state.workoutDraftMemory;
    if(memory?.workoutInstanceId===incoming.workoutInstanceId){
      const merged=workoutProgressApi().mergeDrafts(memory,incoming);
      state.workoutDraftMemory=JSON.parse(JSON.stringify(merged.draft));
      state.workoutDraftSaveStatus=merged.conflicts.length?"conflict":"saved_local";
      saveDraft(merged.draft,{mark:false,schedule:false});
      if(state.screen==="workout") requestSafeActiveWorkoutRender();
    }else{
      mergeIncomingWorkoutProgress([incoming],{writeCanonical:true});
    }
  }catch(error){
    if(error?.message==="owner_mismatch") return;
    console.warn("Workout progress storage event ignored",{code:error?.message||"invalid_progress"});
  }
});
setInterval(()=>{
  if(isSyncDebugRequested()) return;
  autoSync("sincronización periódica");
},5*60*1000);

render();
refreshSyncSession().then(user=>{
  render();
  if(isAppAuthenticated()&&!isSyncDebugRequested()) setTimeout(()=>autoSync("inicio"),500);
}).catch(error=>{
  console.error("GymOS startup auth",{
    code:error?.code||"startup_auth_failed",
    status:error?.status||null
  });
  render();
});

applyAppPreferences();

window.addEventListener("DOMContentLoaded",()=>bindNav());

document.addEventListener("DOMContentLoaded",()=>{
  applyAppearancePreference();
  applyFontScalePreference();
  bindGlobalAppearanceControls();
});

window.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener?.("change",()=>{
  if(getAppearancePreference()==="system") applyAppearancePreference("system");
});
