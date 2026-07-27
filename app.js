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
function getRoutine(){
  const saved=JSON.parse(localStorage.getItem("gymos:routine")||"null");
  if(saved) return normalizeRoutine(saved);
  const converted={A:[],B:[],C:[]};
  Object.entries(defaultSessions).forEach(([session,items])=>{
    converted[session]=items.map(([name,target])=>({name,target,sets:3,increment:2.5,type:"peso"}));
  });
  return converted;
}
function saveRoutine(routine){
  localStorage.setItem("gymos:routine",JSON.stringify(normalizeRoutine(routine)));
  markLocalUpdated();
}
let sessions=getRoutine();

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
function addDays(date,days){
  const copy=new Date(date);
  copy.setDate(copy.getDate()+days);
  return copy;
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
  const sequence=["A","B","C","A","B","C","A"];
  return sequence.slice(0,Math.max(1,Math.min(7,Number(count)||3)));
}
function blockSessionPlan(block){
  const plan=Array.isArray(block.sessionPlan)?block.sessionPlan.filter(x=>["A","B","C"].includes(x)):[];
  return plan.length===Number(block.sessionsPerWeek)?plan:defaultSessionPlan(block.sessionsPerWeek);
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
    const index=remaining.indexOf(workout.session);
    if(index>=0){
      matched.push(workout.session);
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
  const bySession=["A","B","C"].map(session=>({
    session,
    count:workouts.filter(w=>w.session===session).length
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

function defaultExerciseLibrary(){
  return [
    {id:"bench-press",name:"Press de banca",muscle:"Pecho",equipment:"Barra",type:"Fuerza",favorite:true,custom:false,notes:"Escápulas retraídas y pies firmes."},
    {id:"incline-db-press",name:"Press inclinado con mancuernas",muscle:"Pecho",equipment:"Mancuernas",type:"Hipertrofia",favorite:false,custom:false,notes:"Controla la bajada."},
    {id:"lat-pulldown",name:"Jalón al pecho",muscle:"Espalda",equipment:"Polea",type:"Hipertrofia",favorite:false,custom:false,notes:"Lleva los codos hacia abajo."},
    {id:"barbell-row",name:"Remo con barra",muscle:"Espalda",equipment:"Barra",type:"Fuerza",favorite:false,custom:false,notes:"Mantén la espalda neutra."},
    {id:"back-squat",name:"Sentadilla trasera",muscle:"Piernas",equipment:"Barra",type:"Fuerza",favorite:true,custom:false,notes:"Rodillas alineadas con los pies."},
    {id:"leg-press",name:"Prensa de piernas",muscle:"Piernas",equipment:"Máquina",type:"Hipertrofia",favorite:false,custom:false,notes:"No bloquees las rodillas."},
    {id:"romanian-deadlift",name:"Peso muerto rumano",muscle:"Isquios",equipment:"Barra",type:"Fuerza",favorite:false,custom:false,notes:"Desplaza la cadera atrás."},
    {id:"leg-curl",name:"Curl femoral",muscle:"Isquios",equipment:"Máquina",type:"Hipertrofia",favorite:false,custom:false,notes:"Evita levantar la cadera."},
    {id:"overhead-press",name:"Press militar",muscle:"Hombros",equipment:"Barra",type:"Fuerza",favorite:false,custom:false,notes:"Aprieta glúteos y abdomen."},
    {id:"lateral-raise",name:"Elevaciones laterales",muscle:"Hombros",equipment:"Mancuernas",type:"Hipertrofia",favorite:true,custom:false,notes:"Sube con control."},
    {id:"biceps-curl",name:"Curl de bíceps",muscle:"Bíceps",equipment:"Mancuernas",type:"Hipertrofia",favorite:false,custom:false,notes:"Evita balancear el tronco."},
    {id:"triceps-pushdown",name:"Extensión de tríceps en polea",muscle:"Tríceps",equipment:"Polea",type:"Hipertrofia",favorite:false,custom:false,notes:"Mantén los codos pegados."},
    {id:"calf-raise",name:"Elevación de gemelos",muscle:"Gemelos",equipment:"Máquina",type:"Hipertrofia",favorite:false,custom:false,notes:"Busca recorrido completo."},
    {id:"plank",name:"Plancha",muscle:"Core",equipment:"Peso corporal",type:"Core",favorite:false,custom:false,notes:"Mantén la pelvis neutra."}
  ];
}
function getExerciseLibrary(){
  try{
    const saved=JSON.parse(localStorage.getItem(EXERCISE_LIBRARY_KEY)||"null");
    if(Array.isArray(saved)&&saved.length) return saved;
  }catch(error){}
  const defaults=defaultExerciseLibrary();
  localStorage.setItem(EXERCISE_LIBRARY_KEY,JSON.stringify(defaults));
  return defaults;
}
function saveExerciseLibrary(items){
  localStorage.setItem(EXERCISE_LIBRARY_KEY,JSON.stringify(items));
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
function addExerciseToRoutine(sessionKey,exercise){
  const routine=getRoutine();
  const key=["A","B","C"].includes(sessionKey)?sessionKey:"A";
  if(!Array.isArray(routine[key])) routine[key]=[];
  routine[key].push({
    name:exercise.name,
    sets:3,
    reps:"8-12",
    type:exercise.type||"Hipertrofia",
    increment:2.5,
    notes:exercise.notes||""
  });
  saveRoutine(routine);
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
      const sets=exercise.sets||exercise.completedSets||[];
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

const GYMOS_BACKUP_VERSION="4.0.3";
const GYMOS_BACKUP_KEYS=[
  "gymos:routine",
  "gymos:history",
  "gymos:bodyWeight",
  "gymos:trainingBlocks",
  "gymos:activeBlockId",
  "gymos:exerciseLibrary",
  "gymos:exerciseSubstitutions",
  "gymos:favoriteSubstitutions",
  "gymos:coachSettings",
  "gymos:coachProposals",
  "gymos:coachSnapshots",
  "gymos:coachChat",
  "gymos:coachConnection",
  "gymos:nutritionSettings",
  "gymos:nutritionEntries",
  "gymos:appPreferences",
  "gymos:developerLogs",
  "gymos:healthSettings",
  "gymos:healthEntries",
  "gymos:healthImports",
  "gymos:accountMigrationStatus",
  "gymos:accountMigrationAt",
  "gymos:syncAudit",
  "gymos:deviceId",
  "gymos:localRevision",
  "gymos:lastRemoteRevision",
  "gymos:syncConflictMode",
  "gymos:onboardingProfile"
];

function getFavoriteExercises(){
  return getExerciseLibrary().filter(item=>Boolean(item.favorite));
}
function setExerciseFavorite(id,value){
  const library=getExerciseLibrary();
  const item=library.find(exercise=>exercise.id===id);
  if(!item) return false;
  item.favorite=Boolean(value);
  saveExerciseLibrary(library);
  return true;
}
function favoriteExerciseUsage(name){
  const key=normalizeExerciseName(name);
  const routine=getRoutine();
  const sessionsUsed=["A","B","C"].filter(session=>(routine[session]||[]).some(item=>normalizeExerciseName(item.name)===key));
  const historyRows=exerciseTrainingHistory(name);
  return {
    sessions:sessionsUsed,
    setCount:historyRows.length,
    lastDate:historyRows[0]?.date||null
  };
}
function buildGymOSBackup(){
  const storage={};
  GYMOS_BACKUP_KEYS.forEach(key=>{
    const value=localStorage.getItem(key);
    if(value!==null) storage[key]=value;
  });
  return {
    app:"GymOS",
    backupVersion:GYMOS_BACKUP_VERSION,
    exportedAt:new Date().toISOString(),
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
  if(mode==="replace"){
    GYMOS_BACKUP_KEYS.forEach(key=>localStorage.removeItem(key));
  }
  Object.entries(backup.storage).forEach(([key,value])=>{
    if(!GYMOS_BACKUP_KEYS.includes(key)) return;
    if(mode==="merge"&&localStorage.getItem(key)!==null){
      if(key===EXERCISE_LIBRARY_KEY){
        try{
          const current=getExerciseLibrary();
          const incoming=JSON.parse(value);
          const byId=new Map(current.map(item=>[item.id,item]));
          (Array.isArray(incoming)?incoming:[]).forEach(item=>byId.set(item.id,item));
          saveExerciseLibrary([...byId.values()]);
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
    }
    localStorage.setItem(key,String(value));
  });
  sessions=getRoutine();
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
      autoWeeklyReview:false,
      requireApproval:true,
      goal:"Mantenerme definido",
      sessionDuration:60,
      ...JSON.parse(localStorage.getItem(COACH_SETTINGS_KEY)||"{}")
    };
  }catch(error){
    return {backendUrl:"",autoWeeklyReview:false,requireApproval:true,goal:"Mantenerme definido",sessionDuration:60};
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
  const routine=getRoutine();
  const rows=[];
  ["A","B","C"].forEach(session=>{
    (routine[session]||[]).forEach((item,index)=>{
      const history=exerciseTrainingHistory(item.name);
      const recent=history.slice(0,6);
      const avgRir=recent.filter(row=>row.rir!==null&&row.rir!=="").length
        ? recent.filter(row=>row.rir!==null&&row.rir!=="").reduce((sum,row)=>sum+Number(row.rir),0)/recent.filter(row=>row.rir!==null&&row.rir!=="").length
        : null;
      const bestRecent=Math.max(0,...recent.map(row=>row.estimated1RM||0));
      const older=history.slice(6,12);
      const bestOlder=Math.max(0,...older.map(row=>row.estimated1RM||0));
      rows.push({
        session,index,name:item.name,sets:Number(item.sets||0),target:item.target||item.reps||"",
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
  const routine=JSON.parse(JSON.stringify(getRoutine()));
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
    const item=routine[change.session]?.[change.index];
    if(!item||normalizeExerciseName(item.name)!==normalizeExerciseName(change.exercise)) return;
    item[change.field]=change.to;
    item.coachAdjustedAt=new Date().toISOString();
    item.coachReason=change.reason;
  });
  saveRoutine(routine);
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
  saveRoutine(latest.routine);
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
    routine:getRoutine(),
    recentWorkouts:lastCompletedWorkouts(12),
    exerciseSummary:coachExerciseSummary(),
    bodyWeight:getBodyWeightEntries?.()||[],
    nutrition:nutritionCoachContext(),
    health:healthCoachContext(),
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
function weeklyTrainingAnalytics(rangeWeeks=8){
  const weeks=[];
  const now=startOfWeek(new Date());
  for(let i=rangeWeeks-1;i>=0;i--){
    const start=new Date(now);
    start.setDate(start.getDate()-i*7);
    const key=weekKey(start);
    weeks.push({
      key,
      start,
      label:start.toLocaleDateString("es-ES",{day:"2-digit",month:"2-digit"}),
      workouts:0,
      sets:0,
      volume:0,
      avgRir:null,
      avgRpe:null,
      muscleSets:{}
    });
  }
  const byKey=new Map(weeks.map(w=>[w.key,w]));
  getHistory().forEach(workout=>{
    const date=workoutDateValue(workout);
    if(Number.isNaN(date.getTime())) return;
    const bucket=byKey.get(weekKey(date));
    if(!bucket) return;
    bucket.workouts+=1;
    const rirValues=[];
    const rpeValues=[];
    completedWorkoutExercises(workout).forEach(exercise=>{
      const libraryItem=exerciseLibraryItemByName(exercise.name);
      const muscle=libraryItem?.muscle||"Sin clasificar";
      const sets=Array.isArray(exercise.sets)?exercise.sets:(Array.isArray(exercise.completedSets)?exercise.completedSets:[]);
      sets.forEach(set=>{
        const weight=Number(set.weight??set.kg??0);
        const reps=Number(set.reps??0);
        if(!weight&&!reps) return;
        bucket.sets+=1;
        bucket.volume+=weight*reps;
        bucket.muscleSets[muscle]=(bucket.muscleSets[muscle]||0)+1;
        const rir=set.rir??set.RIR;
        const rpe=set.rpe??set.RPE;
        if(rir!==null&&rir!==undefined&&rir!=="") rirValues.push(Number(rir));
        if(rpe!==null&&rpe!==undefined&&rpe!=="") rpeValues.push(Number(rpe));
      });
    });
    if(rirValues.length){
      bucket._rir=(bucket._rir||[]).concat(rirValues);
    }
    if(rpeValues.length){
      bucket._rpe=(bucket._rpe||[]).concat(rpeValues);
    }
  });
  weeks.forEach(bucket=>{
    if(bucket._rir?.length) bucket.avgRir=bucket._rir.reduce((a,b)=>a+b,0)/bucket._rir.length;
    if(bucket._rpe?.length) bucket.avgRpe=bucket._rpe.reduce((a,b)=>a+b,0)/bucket._rpe.length;
    delete bucket._rir;
    delete bucket._rpe;
  });
  return weeks;
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
  const weeks=weeklyTrainingAnalytics(rangeWeeks);
  const target=3;
  const completed=weeks.reduce((sum,w)=>sum+w.workouts,0);
  const possible=target*rangeWeeks;
  return {completed,possible,percent:possible?Math.min(100,completed/possible*100):0};
}
function personalRecords(){
  const records=[];
  getExerciseLibrary().forEach(item=>{
    const stats=exerciseDetailStats(item.name);
    if(stats.bestWeight||stats.best1RM){
      records.push({name:item.name,bestWeight:stats.bestWeight,best1RM:stats.best1RM});
    }
  });
  return records.sort((a,b)=>b.best1RM-a.best1RM).slice(0,8);
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

function getAppPreferences(){
  try{
    return {
      mode:"user",
      theme:"system",
      accent:"violet",
      density:"comfortable",
      fontScale:"normal",
      highContrast:false,
      largeTapTargets:false,
      compact:false,
      animations:true,
      ...JSON.parse(localStorage.getItem(APP_PREFERENCES_KEY)||"{}")
    };
  }catch(error){
    return {mode:"user",theme:"system",accent:"violet",density:"comfortable",fontScale:"normal",highContrast:false,largeTapTargets:false,compact:false,animations:true};
  }
}
function saveAppPreferences(value){
  localStorage.setItem(APP_PREFERENCES_KEY,JSON.stringify({...getAppPreferences(),...value}));
  applyAppPreferences();
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
  const keys=Object.keys(localStorage).filter(key=>key.startsWith("gymos:"));
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
    return {
      calories:2200,
      protein:160,
      carbs:230,
      fat:65,
      goal:"Definición",
      weeklyTarget:-0.3,
      ...JSON.parse(localStorage.getItem(NUTRITION_SETTINGS_KEY)||"{}")
    };
  }catch(error){
    return {calories:2200,protein:160,carbs:230,fat:65,goal:"Definición",weeklyTarget:-0.3};
  }
}
function saveNutritionSettings(value){
  localStorage.setItem(NUTRITION_SETTINGS_KEY,JSON.stringify(value));
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
      backendVersion:null,
      ...JSON.parse(localStorage.getItem(COACH_CONNECTION_KEY)||"{}")
    };
  }catch(error){
    return {status:"unknown",checkedAt:null,model:null,backendVersion:null};
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
    routine:getRoutine(),
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
function applyExerciseSubstitution(session,index,replacement,reason){
  const routine=JSON.parse(JSON.stringify(getRoutine()));
  const current=routine[session]?.[index];
  if(!current||!replacement) return false;
  const next={
    ...current,
    name:replacement.name,
    substitutionOf:current.name,
    substitutionReason:reason||"",
    notes:current.notes||replacement.notes||""
  };
  routine[session][index]=next;
  saveRoutine(routine);
  sessions=getRoutine();

  const history=getExerciseSubstitutions();
  history.unshift({
    id:`sub-${Date.now().toString(36)}`,
    date:new Date().toISOString(),
    session,
    from:current.name,
    to:replacement.name,
    reason:reason||"",
    preserved:{sets:current.sets,target:current.target,increment:current.increment,type:current.type}
  });
  saveExerciseSubstitutions(history.slice(0,200));
  return true;
}
function revertLastSubstitution(session,index){
  const routine=JSON.parse(JSON.stringify(getRoutine()));
  const current=routine[session]?.[index];
  if(!current?.substitutionOf) return false;
  routine[session][index]={
    ...current,
    name:current.substitutionOf
  };
  delete routine[session][index].substitutionOf;
  delete routine[session][index].substitutionReason;
  saveRoutine(routine);
  sessions=getRoutine();
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
const AUTH_CONFIGURED=()=>Boolean(getSyncConfig().url&&getSyncConfig().key);

function localDataKeys(){
  const draftKeys=["A","B","C"].map(session=>draftKey(session));
  const additional=[
    "gymos:body","gymos:selectedSession","gymos:restSeconds","gymos:weeklyGoal",
    "gymos:localUpdatedAt","gymos:lastSyncAt","gymos:lastSyncHash"
  ];
  return [...new Set([...GYMOS_BACKUP_KEYS,...draftKeys,...additional])];
}

function snapshotCurrentLocalData(){
  const snapshot={};
  localDataKeys().forEach(key=>{
    const value=localStorage.getItem(key);
    if(value!==null) snapshot[key]=value;
  });
  return snapshot;
}

function clearCurrentUserData(){
  localDataKeys().forEach(key=>localStorage.removeItem(key));
}

function saveCurrentUserVault(userId){
  if(!userId) return;
  localStorage.setItem(`${LOCAL_VAULT_PREFIX}${userId}`,JSON.stringify(snapshotCurrentLocalData()));
}

function loadUserVault(userId){
  clearCurrentUserData();
  if(!userId) return;
  try{
    const snapshot=JSON.parse(localStorage.getItem(`${LOCAL_VAULT_PREFIX}${userId}`)||"{}");
    Object.entries(snapshot).forEach(([key,value])=>localStorage.setItem(key,String(value)));
  }catch(error){
    console.error("Could not load local user vault",error);
  }
}

function activateLocalUser(userId){
  if(!userId) return;
  const previous=localStorage.getItem(LOCAL_OWNER_KEY);
  if(previous===userId) return;

  if(previous){
    saveCurrentUserVault(previous);
    loadUserVault(userId);
  }else{
    const hasExisting=hasLocalUserData();
    if(hasExisting){
      localStorage.setItem(`${LOCAL_VAULT_PREFIX}${userId}`,JSON.stringify(snapshotCurrentLocalData()));
    }else{
      loadUserVault(userId);
    }
  }
  localStorage.setItem(LOCAL_OWNER_KEY,userId);
  state.selectedSession=localStorage.getItem("gymos:selectedSession")||nextSuggestedSession();
}

function deactivateLocalUser(){
  const current=localStorage.getItem(LOCAL_OWNER_KEY);
  if(current) saveCurrentUserVault(current);
  clearCurrentUserData();
  localStorage.removeItem(LOCAL_OWNER_KEY);
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
        <article class="ok"><span>3</span><div><strong>Ejecuta supabase-schema.sql</strong><small>Activa tablas y políticas por usuario.</small></div></article>
      </div>
      <p class="auth-config-note">No pongas nunca la clave <code>service_role</code> en GitHub Pages.</p>
    </main>
  </div>`;
}

let state = {
  screen: "home",
  selectedSession: localStorage.getItem("gymos:selectedSession") || nextSuggestedSession(),
  timerSeconds: 0,
  timerInterval: null,
  expandedHistoryId: null,
  selectedStatsExercise: null,
  selectedRecordExercise: null,
  editWorkoutId: null,
  planMonth: new Date().toISOString().slice(0,7),
  syncUser: null,
  syncStatus: navigator.onLine ? "local" : "offline",
  syncTimer: null,
  syncInProgress: false,
  applyingRemote: false,
  editingSession: "A",
  editingBlockId: null,
  analyticsBlockId: null,
  selectedAnalysisExercise: null,
  libraryQuery: "",
  libraryMuscle: "Todos",
  libraryEquipment: "Todos",
  libraryFavoritesOnly: false,
  editingLibraryExerciseId: null,
  selectedLibraryExerciseId: null,
  favoritesSort: "name",
  coachSessionId: null,
  progressRangeWeeks: 8,
  coachChatMessages: [],
  nutritionDate: new Date().toISOString().slice(0,10),
  developerLogFilter: "all",
  healthDate: new Date().toISOString().slice(0,10),
  accountMode: "login",
  onboardingStep: 1,
  onboardingDraft: null,
  exerciseTimers: {}
};

function getHistory(){ return JSON.parse(localStorage.getItem("gymos:history") || "[]"); }
function getBodyHistory(){
  return JSON.parse(localStorage.getItem("gymos:body")||"[]")
    .sort((a,b)=>new Date(a.date)-new Date(b.date));
}
function saveBodyHistory(rows){
  localStorage.setItem("gymos:body",JSON.stringify(rows));
  markLocalUpdated();
}
function bodyChange(field){
  const rows=getBodyHistory().filter(r=>numericValue(r[field])!==null);
  if(rows.length<2) return null;
  return numericValue(rows.at(-1)[field])-numericValue(rows[0][field]);
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
    weight:series?.weight??"",
    reps:series?.reps??"",
    rir:series?.rir??"",
    warmup:Boolean(series?.warmup),
    done:Boolean(series?.done)
  };
}
function workingSeries(series){
  return (series||[]).map(normalizeSeries).filter(s=>!s.warmup);
}
function getRestSeconds(){
  const value=Number(localStorage.getItem("gymos:restSeconds")||90);
  return [60,90,120,180].includes(value)?value:90;
}
function saveRestSeconds(value){
  localStorage.setItem("gymos:restSeconds",String(value));
  markLocalUpdated();
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
function getDeviceId(){
  let id=localStorage.getItem("gymos:deviceId");
  if(!id){
    id=(crypto.randomUUID?crypto.randomUUID():`device-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    localStorage.setItem("gymos:deviceId",id);
  }
  return id;
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
function markLocalUpdated(){
  if(state.applyingRemote) return;
  localStorage.setItem("gymos:updatedAt",new Date().toISOString());
  localStorage.setItem("gymos:syncPending","1");
  if(state.syncUser){
    state.syncStatus=navigator.onLine?"pending":"offline";
    scheduleAutoSync();
  }
}
function scheduleAutoSync(delay=2500){
  clearTimeout(state.syncTimer);
  if(!state.syncUser||state.syncInProgress) return;
  state.syncTimer=setTimeout(()=>autoSync("cambio local"),delay);
}
function formatSyncDate(value){
  if(!value) return "Todavía no";
  const date=new Date(value);
  if(Number.isNaN(date.getTime())) return "Todavía no";
  return date.toLocaleString("es-ES",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
}
function buildSyncPayload(){
  return {
    version:"3.7.0",
    updatedAt:getLocalUpdatedAt(),
    deviceId:getDeviceId(),
    deviceName:getDeviceName(),
    history:getHistory(),
    routine:getRoutine(),
    body:getBodyHistory(),
    selectedSession:localStorage.getItem("gymos:selectedSession")||"A",
    restSeconds:getRestSeconds(),
    weeklyGoal:getWeeklyGoal(),
    blocks:getTrainingBlocks(),
    activeBlockId:localStorage.getItem("gymos:activeBlockId"),
    exerciseLibrary:getExerciseLibrary(),
    exerciseSubstitutions:getExerciseSubstitutions(),
    nutritionSettings:getNutritionSettings(),
    nutritionEntries:getNutritionEntries(),
    healthSettings:getHealthSettings(),
    healthEntries:getHealthEntries(),
    healthImports:getHealthImports(),
    appPreferences:getAppPreferences(),
    favoriteSubstitutions:getFavoriteSubstitutions(),
    updatedAt:getLocalUpdatedAt()
  };
}
function applySyncPayload(payload){
  if(!payload||typeof payload!=="object") throw new Error("Copia remota no válida.");
  state.applyingRemote=true;
  try{
  if(Array.isArray(payload.history)) saveHistory(payload.history);
  if(payload.routine){saveRoutine(payload.routine);sessions=getRoutine();}
  if(Array.isArray(payload.body)) saveBodyHistory(payload.body);
  if(payload.nutritionSettings) saveNutritionSettings(payload.nutritionSettings);
  if(Array.isArray(payload.nutritionEntries)) saveNutritionEntries(payload.nutritionEntries);
  if(payload.healthSettings) saveHealthSettings(payload.healthSettings);
  if(Array.isArray(payload.healthEntries)) saveHealthEntries(payload.healthEntries);
  if(Array.isArray(payload.healthImports)) saveHealthImports(payload.healthImports);
  if(payload.appPreferences) saveAppPreferences(payload.appPreferences);
  if(["A","B","C"].includes(payload.selectedSession)){
    localStorage.setItem("gymos:selectedSession",payload.selectedSession);
    state.selectedSession=payload.selectedSession;
  }
  if([60,90,120,180].includes(Number(payload.restSeconds))) saveRestSeconds(Number(payload.restSeconds));
  if(Number(payload.weeklyGoal)>=1&&Number(payload.weeklyGoal)<=7) saveWeeklyGoal(Number(payload.weeklyGoal));
  if(Array.isArray(payload.blocks)) saveTrainingBlocks(payload.blocks);
  if(payload.activeBlockId) localStorage.setItem("gymos:activeBlockId",payload.activeBlockId);
    localStorage.setItem("gymos:updatedAt",payload.updatedAt||new Date().toISOString());
    localStorage.removeItem("gymos:syncPending");
  }finally{
    state.applyingRemote=false;
  }
}


const SYNC_AUDIT_KEY="gymos:syncAudit";
const DEVICE_ID_KEY="gymos:deviceId";
const LOCAL_REVISION_KEY="gymos:localRevision";
const LAST_REMOTE_REVISION_KEY="gymos:lastRemoteRevision";

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
function getSyncConflictPreference(){return localStorage.getItem("gymos:syncConflictMode")||"ask";}
function setSyncConflictPreference(value){localStorage.setItem("gymos:syncConflictMode",value);}
function getSyncAudit(){
  try{const value=JSON.parse(localStorage.getItem(SYNC_AUDIT_KEY)||"[]");return Array.isArray(value)?value:[];}
  catch(error){return [];}
}
function addSyncAudit(action,status,details={}){
  const items=getSyncAudit();
  items.push({id:`audit-${Date.now().toString(36)}`,createdAt:new Date().toISOString(),action,status,userId:state.syncUser?.id||null,deviceId:getDeviceId(),details});
  localStorage.setItem(SYNC_AUDIT_KEY,JSON.stringify(items.slice(-100)));
}
function simpleChecksum(value){
  const text=JSON.stringify(value);let hash=2166136261;
  for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return (hash>>>0).toString(16);
}
function buildSyncEnvelope(){
  const payload=buildSyncPayload();
  const revision=Math.max(getLocalRevision(),getLastRemoteRevision())+1;
  setLocalRevision(revision);
  return {schemaVersion:2,revision,deviceId:getDeviceId(),updatedAt:new Date().toISOString(),checksum:simpleChecksum(payload),payload};
}
function syncSecurityState(){
  return {authenticated:Boolean(state.syncUser),deviceId:getDeviceId(),localRevision:getLocalRevision(),lastRemoteRevision:getLastRemoteRevision(),conflictMode:getSyncConflictPreference(),audit:getSyncAudit().slice(-10)};
}
async function chooseConflictResolution(remote){
  const mode=getSyncConflictPreference();
  if(mode==="remote") return "remote";
  if(mode==="local") return "local";
  return confirm("Hay cambios tanto en este dispositivo como en la nube.\n\nAceptar: usar la nube.\nCancelar: mantener este dispositivo.")?"remote":"local";
}

function accountDisplayName(user=state.syncUser){
  return user?.user_metadata?.full_name||
    user?.user_metadata?.name||
    user?.email?.split("@")[0]||
    "Usuario";
}
function hasLocalUserData(){
  return getHistory().length>0||
    getBodyHistory().length>0||
    getNutritionEntries().length>0||
    getHealthEntries().length>0||
    Object.values(getRoutine()||{}).some(items=>Array.isArray(items)&&items.length>0);
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
  state.syncUser=data.user||null;
  return data;
}
async function signInWithPassword(email,password){
  const client=getSupabaseClient();
  if(!client) throw new Error("Configura Supabase antes de iniciar sesión.");
  const {data,error}=await client.auth.signInWithPassword({email,password});
  if(error) throw error;
  state.syncUser=data.user||null;
  state.syncStatus="connected";
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
  const {error}=await client.auth.resetPasswordForEmail(email,{
    redirectTo:GYMOS_PRODUCTION_URL
  });
  if(error) throw error;
}
async function updateAccountProfile(fullName){
  const client=getSupabaseClient();
  if(!client) throw new Error("Supabase no está configurado.");
  const {data,error}=await client.auth.updateUser({
    data:{full_name:fullName.trim()}
  });
  if(error) throw error;
  state.syncUser=data.user;
  await client.from("profiles").upsert({
    id:data.user.id,
    display_name:fullName.trim(),
    updated_at:new Date().toISOString()
  },{onConflict:"id"});
  return data.user;
}
async function migrateLocalDataToAccount(){
  if(!state.syncUser) throw new Error("Inicia sesión antes de migrar los datos.");
  const result=await syncNow({forceUpload:true});
  setLocalMigrationStatus("completed");
  localStorage.setItem("gymos:accountMigrationAt",new Date().toISOString());
  return result;
}
async function deleteCloudData(){
  const client=getSupabaseClient();
  if(!client||!state.syncUser) throw new Error("No hay una cuenta conectada.");
  const userId=state.syncUser.id;
  const {error}=await client.from("gymos_sync").delete().eq("user_id",userId);
  if(error) throw error;
  await client.from("profiles").delete().eq("id",userId);
  return true;
}
async function requestAccountDeletion(){
  const client=getSupabaseClient();
  if(!client||!state.syncUser) throw new Error("No hay una cuenta conectada.");
  const {error}=await client.from("account_deletion_requests").insert({
    user_id:state.syncUser.id,
    requested_at:new Date().toISOString(),
    status:"pending"
  });
  if(error) throw error;
}
function accountSecuritySummary(){
  return {
    authenticated:Boolean(state.syncUser),
    userId:state.syncUser?.id||null,
    emailVerified:Boolean(state.syncUser?.email_confirmed_at),
    rlsRequired:true,
    publicKeyConfigured:Boolean(getSyncConfig().key),
    secretKeyInClient:false
  };
}

function getSupabaseClient(){
  const config=getSyncConfig();
  if(!config.url||!config.key) return null;
  if(typeof supabase==="undefined") return null;
  try{
    return supabase.createClient(config.url,config.key,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
    });
  }catch(error){
    return null;
  }
}
async function refreshSyncSession(){
  const client=getSupabaseClient();
  if(!client){state.syncUser=null;state.syncStatus="local";return null;}
  try{
    const params=new URLSearchParams(location.search);
    const code=params.get("code");
    if(code){
      const {error:exchangeError}=await client.auth.exchangeCodeForSession(code);
      if(exchangeError) throw exchangeError;
      history.replaceState({},document.title,GYMOS_PRODUCTION_URL);
    }
    const {data,error}=await client.auth.getSession();
    if(error) throw error;
    state.syncUser=data.session?.user||null;
    state.syncStatus=state.syncUser?"connected":"configured";
    client.auth.onAuthStateChange((event,session)=>{
      const previousUserId=state.syncUser?.id||null;
      state.syncUser=session?.user||null;
      state.syncStatus=state.syncUser?"connected":"configured";

      if(state.syncUser&&state.syncUser.id!==previousUserId){
        activateLocalUser(state.syncUser.id);
      }
      if(event==="SIGNED_OUT"){
        deactivateLocalUser();
        state.screen="account";
      }

      updateSyncIndicators();
      if(event==="SIGNED_IN"||event==="SIGNED_OUT") queueMicrotask(()=>render());
    });
    return state.syncUser;
  }catch(error){
    console.error("GymOS auth error",error);
    state.syncUser=null;
    state.syncStatus="error";
    return null;
  }
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
  state.syncUser=null;
  state.syncStatus="configured";
}
async function syncNow(options={}){
  const client=getSupabaseClient();
  if(!client||!state.syncUser) throw new Error("No hay una cuenta conectada.");
  state.syncStatus="syncing";updateSyncIndicators();addSyncAudit("sync","started");
  try{
    const {data:remote,error:readError}=await client.from("gymos_sync").select("payload,revision,device_id,updated_at,checksum").eq("user_id",state.syncUser.id).maybeSingle();
    if(readError) throw readError;
    const remoteRevision=Number(remote?.revision||0);
    const localRevision=getLocalRevision();
    const lastRemote=getLastRemoteRevision();
    const conflict=remote && remoteRevision>lastRemote && localRevision>lastRemote && !options.forceUpload;
    if(conflict){
      const resolution=await chooseConflictResolution(remote);
      addSyncAudit("conflict",resolution,{remoteRevision,localRevision});
      if(resolution==="remote"){
        applySyncPayload(remote.payload||{});setLocalRevision(remoteRevision);setLastRemoteRevision(remoteRevision);
        localStorage.setItem("gymos:lastSyncAt",new Date().toISOString());state.syncStatus="connected";updateSyncIndicators();return {direction:"download",revision:remoteRevision};
      }
    }else if(remote && remoteRevision>localRevision && !options.forceUpload){
      applySyncPayload(remote.payload||{});setLocalRevision(remoteRevision);setLastRemoteRevision(remoteRevision);
      localStorage.setItem("gymos:lastSyncAt",new Date().toISOString());state.syncStatus="connected";addSyncAudit("sync","downloaded",{revision:remoteRevision});updateSyncIndicators();return {direction:"download",revision:remoteRevision};
    }
    const envelope=buildSyncEnvelope();
    const {error:writeError}=await client.from("gymos_sync").upsert({user_id:state.syncUser.id,payload:envelope.payload,revision:envelope.revision,device_id:envelope.deviceId,checksum:envelope.checksum,updated_at:envelope.updatedAt},{onConflict:"user_id"});
    if(writeError) throw writeError;
    setLastRemoteRevision(envelope.revision);localStorage.setItem("gymos:lastSyncAt",new Date().toISOString());state.syncStatus="connected";addSyncAudit("sync","uploaded",{revision:envelope.revision});updateSyncIndicators();return {direction:"upload",revision:envelope.revision};
  }catch(error){state.syncStatus="error";addSyncAudit("sync","error",{message:error.message});updateSyncIndicators();throw error;}
}

async function autoSync(reason="automática"){
  if(!state.syncUser||!navigator.onLine||state.syncInProgress) return;
  await syncNow({silent:true});
}
function updateSyncIndicators(){
  document.querySelectorAll("[data-sync-label]").forEach(el=>el.textContent=syncStatusLabel());
  document.querySelectorAll("[data-sync-dot]").forEach(el=>el.className=`sync-dot ${state.syncStatus}`);
  document.querySelectorAll("[data-last-sync]").forEach(el=>el.textContent=formatSyncDate(getLastSyncAt()));
}
function syncStatusLabel(){
  if(state.syncStatus==="syncing") return "Sincronizando…";
  if(state.syncStatus==="pending") return "Cambios pendientes";
  if(state.syncStatus==="offline") return "Sin conexión";
  if(state.syncStatus==="synced") return "Sincronizado";
  if(state.syncStatus==="connected") return "Cuenta conectada";
  if(state.syncStatus==="configured") return "Configurado, sin sesión";
  if(state.syncStatus==="error") return "Error de sincronización";
  return "Solo en este dispositivo";
}
function syncBadge(){
  if(!state.syncUser) return "";
  return `<button class="sync-badge" id="openSyncSettings" type="button">
    <span class="sync-dot ${state.syncStatus}" data-sync-dot></span>
    <span data-sync-label>${syncStatusLabel()}</span>
  </button>`;
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
  const h = JSON.parse(localStorage.getItem("gymos:history") || "[]");
  if(!h.length) return "A";
  return h[0].session === "A" ? "B" : h[0].session === "B" ? "C" : "A";
}
function draftKey(s){ return `gymos:draft:${s}`; }
function emptyDraft(s){
  const last = lastWorkoutForSession(s);
  return {
    session:s,
    startedAt:Date.now(),
    copiedFromLastSession:Boolean(last),
    exercises:sessions[s].map((item,exerciseIndex)=>({
      name:item.name,
      target:item.target,
      sets:item.sets,
      increment:item.increment,
      type:item.type,
      series:Array.from({length:item.sets},(_,seriesIndex)=>({
        weight:last?.exercises?.[exerciseIndex]?.series?.[seriesIndex]?.weight || "",
        reps:"",
        rir:"",
        warmup:false,
        done:false
      })),
      notes:""
    }))
  };
}
function getDraft(s){
  const draft=JSON.parse(localStorage.getItem(draftKey(s))||"null")||emptyDraft(s);
  draft.exercises.forEach(ex=>ex.series=ex.series.map(normalizeSeries));
  return draft;
}
function saveDraft(d){ localStorage.setItem(draftKey(d.session), JSON.stringify(d)); }
function clearDraft(s){ localStorage.removeItem(draftKey(s)); }
function lastWorkoutForSession(s){ return getHistory().find(w=>w.session===s); }
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
  return [...new Set(Object.values(sessions).flat().map(item=>item.name))];
}
function getExerciseHistory(name){
  const rows=[];
  getHistory().forEach(workout=>{
    const exercise=workout.exercises.find(e=>e.name===name);
    if(!exercise) return;
    const validSeries=workingSeries(exercise.series)
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
function estimatedOneRepMax(weight,reps){
  if(!weight||!reps) return 0;
  return weight*(1+reps/30);
}
function allExercisePerformances(name,excludeWorkoutId=null){
  const performances=[];
  getHistory().forEach(workout=>{
    if(excludeWorkoutId!==null&&workout.id===excludeWorkoutId) return;
    const exercise=workout.exercises.find(e=>e.name===name);
    if(!exercise) return;
    exercise.series.map(normalizeSeries).forEach((series,index)=>{
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
function recordsForWorkout(workout){
  const records=[];
  workout.exercises.forEach(exercise=>{
    const previous=allExercisePerformances(exercise.name,workout.id);
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
  const routineItem=Object.values(sessions).flat().find(x=>x.name===name);
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
function nav(active){
  const items=[
    ["home","⌂","Inicio"],
    ["progressDashboard","↗","Progreso"],
    ["coach","✦","Coach"],
    ["settings","☰","Más"]
  ];
  return `<nav class="bottom-nav modern-bottom-nav">
    ${items.map(([screen,icon,label])=>`<button type="button" data-nav="${screen}" class="${active===screen?"active":""}">
      <span class="nav-icon">${icon}</span><span class="nav-label">${label}</span>
    </button>`).join("")}
  </nav>`;
}
let globalNavigationBound=false;

function navigateToScreen(screen){
  try{
    stopAllExerciseTimers();
  }catch(error){
    console.error("Timer cleanup failed during navigation",error);
    state.exerciseTimers={};
  }

  if(screen==="workout"){
    const selected=state.selectedSession||localStorage.getItem("gymos:selectedSession");
    if(!selected){
      state.screen="home";
      renderHome();
      toast("Selecciona primero una sesión para entrenar");
      return;
    }
    state.selectedSession=selected;
  }

  state.screen=screen;

  try{
    render();
  }catch(error){
    console.error(`Could not render screen: ${screen}`,error);
    app.innerHTML=`<div class="app-shell">
      <main class="screen">
        <section class="card warning-card">
          <h1>No se pudo abrir ${esc(screen)}</h1>
          <p class="subtle">${esc(error?.message||"Error desconocido")}</p>
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
  if(globalNavigationBound) return;
  globalNavigationBound=true;

  document.addEventListener("click",event=>{
    const button=event.target.closest?.("[data-nav]");
    if(!button) return;
    event.preventDefault();
    event.stopPropagation();
    navigateToScreen(button.dataset.nav);
  });
}
function toast(msg){
  const el=document.createElement("div"); el.className="toast"; el.textContent=msg;
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
function newOnboardingDraft(){
  const current=getOnboardingProfile()||{};
  return {
    name:current.name||accountDisplayName(state.syncUser)||"",
    age:current.age||"",
    sex:current.sex||"",
    height:current.height||"",
    weight:current.weight||"",
    experience:current.experience||"beginner",
    goal:current.goal||"return",
    days:Number(current.days)||3,
    duration:Number(current.duration)||50,
    location:current.location||"gym",
    equipment:current.equipment||"full",
    painAreas:Array.isArray(current.painAreas)?current.painAreas:[],
    injuryNotes:current.injuryNotes||"",
    medicalRestriction:current.medicalRestriction||"no",
    avoidExercises:current.avoidExercises||"",
    preference:current.preference||"mixed",
    cardio:current.cardio||"walking",
    completedAt:current.completedAt||null
  };
}
function ensureOnboardingDraft(){
  if(!state.onboardingDraft) state.onboardingDraft=newOnboardingDraft();
  return state.onboardingDraft;
}
function onboardingGoalLabel(value){
  return ({
    fat_loss:"Perder grasa",
    muscle:"Ganar masa muscular",
    strength:"Mejorar fuerza",
    health:"Mejorar salud y condición física",
    return:"Retomar el entrenamiento",
    maintain:"Mantener forma física"
  })[value]||"Entrenamiento general";
}
function onboardingExperienceLabel(value){
  return ({new:"Nunca he entrenado",beginner:"Principiante",intermediate:"Intermedio",advanced:"Avanzado"})[value]||"Principiante";
}
function onboardingLocationLabel(value){
  return ({gym:"Gimnasio",home:"Casa",both:"Gimnasio y casa"})[value]||"Gimnasio";
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
    content=`
      <div class="onboarding-step-icon" aria-hidden="true">02</div>
      <span class="section-kicker">OBJETIVO</span>
      <h1>¿Qué quieres conseguir?</h1>
      <p class="onboarding-lead">Elige la prioridad que mejor representa tu situación actual.</p>
      <div class="choice-card-grid">
        ${[
          ["fat_loss","↘","Perder grasa","Manteniendo músculo y rendimiento"],
          ["muscle","+","Ganar músculo","Aumentar masa muscular progresivamente"],
          ["strength","↑","Mejorar fuerza","Priorizar fuerza y progresión"],
          ["health","♥","Mejorar salud","Moverte mejor y ganar condición física"],
          ["return","↻","Retomar el gimnasio","Volver de forma gradual y sostenible"],
          ["maintain","=","Mantenerte","Conservar fuerza y composición corporal"]
        ].map(([value,icon,title,desc])=>`<label class="choice-card ${p.goal===value?"selected":""}"><input type="radio" name="obGoal" value="${value}" ${p.goal===value?"checked":""}><span class="choice-icon">${icon}</span><span class="choice-copy"><strong>${title}</strong><small>${desc}</small></span><span class="choice-check">✓</span></label>`).join("")}
      </div>
      <label><span>Experiencia</span><select id="obExperience">
        <option value="new" ${p.experience==="new"?"selected":""}>Nunca he entrenado</option>
        <option value="beginner" ${p.experience==="beginner"?"selected":""}>Principiante o volviendo tras una pausa</option>
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
    const proposed=buildRecommendedRoutine(p);
    const sessionsToShow=Number(p.days)<=2?["A","B"]:["A","B","C"];
    content=`
      <div class="onboarding-step-icon success" aria-hidden="true">✓</div>
      <span class="section-kicker">TU PROPUESTA</span>
      <h1>Este es tu punto de partida</h1>
      <p class="onboarding-lead">Un plan inicial sencillo, progresivo y adaptado a tus respuestas.</p>
      <div class="onboarding-summary">
        <div><span>Objetivo</span><strong>${esc(onboardingGoalLabel(p.goal))}</strong></div>
        <div><span>Nivel</span><strong>${esc(onboardingExperienceLabel(p.experience))}</strong></div>
        <div><span>Disponibilidad</span><strong>${p.days} días · ${p.duration} min</strong></div>
        <div><span>Entorno</span><strong>${esc(onboardingLocationLabel(p.location))}</strong></div>
      </div>
      <div class="safety-callout"><strong>Antes de empezar</strong><p>${esc(onboardingSafetyMessage(p))}</p></div>
      <h2>Rutina recomendada</h2>
      <div class="routine-preview-list">
        ${sessionsToShow.map(session=>`<article><h3>Sesión ${session}</h3>${proposed[session].map(item=>`<div><span>${esc(item.name)}</span><small>${item.sets} × ${esc(item.target)}</small></div>`).join("")}</article>`).join("")}
      </div>
      <label class="consent-row"><input id="obConfirm" type="checkbox"><span>He revisado mis respuestas. Puedo guardar solo el perfil o sustituir mi rutina de forma explícita.</span></label>`;
  }

  app.innerHTML=`<div class="onboarding-shell">
    <header class="onboarding-header">
      <div class="onboarding-brand"><span class="onboarding-logo">G</span><div><div class="brand">GymOS</div><div class="subtle">Tu entrenamiento, bien planteado</div></div></div>
      <button id="cancelOnboarding" class="text-button">Salir</button>
    </header>
    <div class="onboarding-stepper" aria-label="Paso ${step} de 5">
      ${[1,2,3,4,5].map(n=>`<span class="${n<step?"done":n===step?"active":""}">${n<step?"✓":n}</span>`).join("")}
    </div>
    <div class="onboarding-progress"><span style="width:${progress}%"></span></div>
    <main class="onboarding-main">
      <section class="onboarding-card">${content}</section>
    </main>
    <div class="onboarding-actions-wrap">
      <div class="onboarding-actions">
        ${step>1?`<button id="obBack" class="secondary">Atrás</button>`:"<span></span>"}
        ${step===5
          ?`<div class="onboarding-final-actions">
              <button id="obSaveProfile" class="secondary">Guardar solo perfil</button>
              <button id="obNext" class="primary">Reemplazar rutina</button>
            </div>`
          :`<button id="obNext" class="primary">Continuar</button>`}
      </div>
    </div>
  </div>`;

  const cancel=document.getElementById("cancelOnboarding");
  if(cancel) cancel.onclick=()=>{state.onboardingDraft=null;state.onboardingStep=1;state.screen="home";renderHome();};

  const persistStep=()=>{
    if(step===1){
      p.name=document.getElementById("obName").value.trim();
      p.age=document.getElementById("obAge").value;
      p.height=document.getElementById("obHeight").value;
      p.weight=document.getElementById("obWeight").value;
      p.sex=document.getElementById("obSex").value;
    }else if(step===2){
      p.goal=document.querySelector('input[name="obGoal"]:checked')?.value||p.goal;
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
  document.querySelectorAll(".choice-card input").forEach(input=>{
    input.onchange=()=>{
      p.goal=input.value;
      state.onboardingDraft=p;
      document.querySelectorAll(".choice-card").forEach(card=>card.classList.remove("selected"));
      input.closest(".choice-card")?.classList.add("selected");
    };
  });
  const back=document.getElementById("obBack");
  if(back) back.onclick=()=>{persistStep();state.onboardingStep--;renderOnboarding();};
  const saveProfileOnly=document.getElementById("obSaveProfile");
  if(saveProfileOnly) saveProfileOnly.onclick=async()=>{
    persistStep();
    if(!document.getElementById("obConfirm").checked){
      alert("Confirma que has revisado tus respuestas.");
      return;
    }
    const now=new Date().toISOString();
    p.completedAt=now;
    p.updatedAt=now;
    saveOnboardingProfile(p);
    state.onboardingDraft=null;
    state.onboardingStep=1;
    state.screen="home";
    toast("Perfil guardado. Tu rutina no se ha modificado.");
    renderHome();
    setTimeout(()=>autoSync("perfil deportivo actualizado"),400);
  };
  document.getElementById("obNext").onclick=async()=>{
    persistStep();
    if(step===1){
      if(!p.name||!p.age||!p.height||!p.weight){
        alert("Completa nombre, edad, altura y peso para continuar.");
        return;
      }
      if(Number(p.age)<14||Number(p.age)>100){alert("Revisa la edad indicada.");return;}
    }
    if(step<5){
      state.onboardingStep++;
      renderOnboarding();
      return;
    }
    if(!document.getElementById("obConfirm").checked){
      alert("Confirma que has revisado la propuesta.");
      return;
    }
    const now=new Date().toISOString();
    p.completedAt=now;
    p.updatedAt=now;
    const routine=buildRecommendedRoutine(p);
    saveOnboardingProfile(p);
    saveRoutine(routine);
    sessions=getRoutine();
    saveWeeklyGoal(Math.max(2,Math.min(5,Number(p.days)||3)));
    state.selectedSession="A";
    localStorage.setItem("gymos:selectedSession","A");
    state.onboardingDraft=null;
    state.onboardingStep=1;
    state.screen="home";
    toast("Tu plan inicial está listo");
    renderHome();
    setTimeout(()=>autoSync("onboarding completado"),400);
  };
}

function render(){
  applyAppPreferences();

  if(AUTH_REQUIRED&&!AUTH_CONFIGURED()){
    renderAuthConfigurationRequired();
    return;
  }

  if(AUTH_REQUIRED&&!state.syncUser){
    state.screen="account";
    renderAccount();
    return;
  }

  if(state.syncUser&&!onboardingCompleted()&&state.screen!=="account"){
    state.screen="onboarding";
    renderOnboarding();
    return;
  }

  if(state.screen==="onboarding") renderOnboarding();
  else if(state.screen==="home") renderHome();
  else if(state.screen==="workout") renderWorkout();
  else if(state.screen==="history") renderHistory();
  else if(state.screen==="stats") renderStats();
  else if(state.screen==="records") renderRecords();
  else if(state.screen==="body") renderBody();
  else if(state.screen==="editWorkout") renderEditWorkout();
  else if(state.screen==="plan") renderPlan();
  else if(state.screen==="routineEditor") renderRoutineEditor();
  else if(state.screen==="blocks") renderBlocks();
  else if(state.screen==="blockEditor") renderBlockEditor();
  else if(state.screen==="blockAnalytics") renderBlockAnalytics();
  else if(state.screen==="globalAnalytics") renderGlobalAnalytics();
  else if(state.screen==="exerciseAnalytics") renderExerciseAnalytics();
  else if(state.screen==="exerciseLibrary") renderExerciseLibrary();
  else if(state.screen==="exerciseLibraryEditor") renderExerciseLibraryEditor();
  else if(state.screen==="substitutionHistory") renderSubstitutionHistory();
  else if(state.screen==="exerciseDetail") renderExerciseDetail();
  else if(state.screen==="favoriteExercises") renderFavoriteExercises();
  else if(state.screen==="backupRestore") renderBackupRestore();
  else if(state.screen==="coach") renderCoach();
  else if(state.screen==="coachProposal") renderCoachProposal();
  else if(state.screen==="progressDashboard") renderProgressDashboard();
  else if(state.screen==="coachChat") renderCoachChat();
  else if(state.screen==="nutrition") renderNutrition();
  else if(state.screen==="developer") renderDeveloperMode();
  else if(state.screen==="health") renderHealth();
  else if(state.screen==="account") renderAccount();
  else renderSettings();
  queueMicrotask(()=>bindNav());
}

function renderHome(){
  const h=getHistory(), last=h[0];
  app.innerHTML=`<div class="app-shell">
    <header class="topbar home-topbar"><div><div class="eyebrow">TU ENTRENAMIENTO</div><div class="brand">GymOS</div></div><div class="home-header-actions"><button id="homeThemeToggle" class="icon-button" aria-label="Cambiar tema">${resolvedTheme()==="dark"?"☀":"◐"}</button>${syncBadge()}</div></header>
    <main class="screen">
      <section class="hero">
        <div class="hero-label">Hoy toca</div>
        <h1>Sesión ${state.selectedSession}</h1>
        <p>${sessions[state.selectedSession].length} ejercicios · RIR 3–4</p>
        <button id="startWorkout" class="primary">Comenzar entrenamiento</button>
      </section>
      <section class="home-quick-grid health-home-grid">
        <button id="homeProgress" class="quick-action-card"><span>↗</span><strong>Progreso</strong><small>Tu evolución</small></button>
        <button id="homeCoach" class="quick-action-card"><span>✦</span><strong>Coach</strong><small>Revisión inteligente</small></button>
        <button id="homeNutrition" class="quick-action-card"><span>◎</span><strong>Nutrición</strong><small>Macros y peso</small></button>
        <button id="homeHealth" class="quick-action-card"><span>♥</span><strong>Recuperación</strong><small>Sueño y reloj</small></button>
      </section>
      <div class="session-picker modern-session-picker">
        ${["A","B","C"].map(s=>`<button data-session="${s}" class="${s===state.selectedSession?"active":""}">Sesión ${s}</button>`).join("")}
      </div>
      <section class="card">
        <h2>Resumen</h2>
        <div class="info-row"><span>Último entrenamiento</span><strong>${last?`Sesión ${last.session}`:"—"}</strong></div>
        <div class="info-row"><span>Duración</span><strong>${last?formatDuration(last.durationMs):"—"}</strong></div>
        <div class="info-row"><span>Entrenamientos guardados</span><strong>${h.length}</strong></div>
      </section>
      ${(()=>{
        const block=getActiveBlock();
        if(!block) return `<section class="card block-home-card">
          <div class="card-heading-row"><div><h2>Bloque de entrenamiento</h2><p class="subtle">Todavía no has creado uno</p></div><button id="openBlocksHome" class="text-button">Crear</button></div>
          <p class="subtle">Planifica tu rutina durante 4, 6 u 8 semanas.</p>
        </section>`;
        const status=blockStatus(block);
        const summary=blockWeekSessionSummary(block,status.week);
        const next=nextPlannedSession(block,status.week);
        const deload=isDeloadWeek(block,status.week);
        const deloadCfg=deloadSettings(block);
        const finished=block.status==="completed"||Boolean(block.completedAt);
        return `<section class="card block-home-card ${deload?"deload-card":""}">
          <div class="card-heading-row">
            <div><h2>${esc(block.name)}</h2><p class="subtle">Semana ${status.week} de ${status.total}</p></div>
            <button id="openBlocksHome" class="text-button">Abrir</button>
          </div>
          ${deload?`<div class="deload-banner">
            <strong>Semana de descarga</strong>
            <span>${deloadCfg.volumePercent}% del volumen · ${deloadCfg.intensityPercent}% de intensidad</span>
          </div>`:""}
          ${finished?`<div class="completed-banner"><strong>Bloque finalizado</strong><span>Consulta el resumen completo desde Bloques.</span></div>`:""}
          <div class="block-session-strip">
            ${summary.plan.map((session,index)=>{
              const completed=index<summary.matched.length;
              return `<span class="${completed?"done":session===next?"next":""}">${completed?"✓ ":""}${session}</span>`;
            }).join("")}
          </div>
          <div class="block-progress-track"><div style="width:${summary.adherence}%"></div></div>
          <div class="weekly-home-footer">
            <strong>${summary.completed} de ${summary.plan.length} sesiones · ${summary.adherence}%</strong>
            <span>${next?`Siguiente: ${next}`:status.status==="planned"?"Pendiente":"Semana completada"}</span>
          </div>
          ${next?`<button id="startNextPlannedSession" class="secondary full block-next-button">Preparar sesión ${next}</button>`:""}
        </section>`;
      })()}
      ${(()=>{
        const week=weeklyProgress();
        return `<section class="card weekly-home-card">
          <div class="card-heading-row">
            <div><h2>Objetivo semanal</h2><p class="subtle">${week.count} de ${week.goal} sesiones</p></div>
            <button id="openPlan" class="text-button">Ver plan</button>
          </div>
          <div class="weekly-progress-track"><div style="width:${week.percentage}%"></div></div>
          <div class="weekly-home-footer">
            <strong>${week.remaining===0?"Objetivo cumplido":`${week.remaining} ${week.remaining===1?"sesión pendiente":"sesiones pendientes"}`}</strong>
            <span>${completedWeekStreak()} semanas de racha</span>
          </div>
        </section>`;
      })()}
      ${(()=>{
        const body=latestBodyEntry();
        return `<section class="card body-home-card">
          <div class="card-heading-row"><div><h2>Seguimiento corporal</h2><p class="subtle">Peso y cintura</p></div><button id="openBody" class="text-button">Abrir</button></div>
          <div class="body-home-values">
            <div><span>Peso</span><strong>${body&&numericValue(body.weight)!==null?`${formatWeight(body.weight)} kg`:"—"}</strong></div>
            <div><span>Cintura</span><strong>${body&&numericValue(body.waist)!==null?`${formatWeight(body.waist)} cm`:"—"}</strong></div>
          </div>
        </section>`;
      })()}
    </main>${nav("home")}
  </div>`;
  document.querySelectorAll("[data-session]").forEach(b=>b.onclick=()=>{
    state.selectedSession=b.dataset.session;
    localStorage.setItem("gymos:selectedSession",state.selectedSession);
    renderHome();
  });
  const openSyncSettings=document.getElementById("openSyncSettings");
  if(openSyncSettings) openSyncSettings.onclick=()=>{state.screen="settings";renderSettings();};
  document.getElementById("homeThemeToggle").onclick=()=>{
    saveAppPreferences({theme:resolvedTheme()==="dark"?"light":"dark"});
    renderHome();
  };
  document.getElementById("homeProgress").onclick=()=>{state.screen="progressDashboard";renderProgressDashboard();};
  document.getElementById("homeCoach").onclick=()=>{state.screen="coach";renderCoach();};
  document.getElementById("homeNutrition").onclick=()=>{state.screen="nutrition";renderNutrition();};
  document.getElementById("homeHealth").onclick=()=>{state.screen="health";renderHealth();};
  document.getElementById("startWorkout").onclick=()=>{state.screen="workout";renderWorkout();};
  document.getElementById("openPlan").onclick=()=>{state.screen="plan";renderPlan();};
  const openBlocksHome=document.getElementById("openBlocksHome");
  if(openBlocksHome) openBlocksHome.onclick=()=>{state.screen="blocks";renderBlocks();};
  const startNextPlannedSession=document.getElementById("startNextPlannedSession");
  if(startNextPlannedSession) startNextPlannedSession.onclick=()=>{
    const block=getActiveBlock();
    if(!block) return;
    const status=blockStatus(block);
    const next=nextPlannedSession(block,status.week);
    if(!next) return;
    state.selectedSession=next;
    localStorage.setItem("gymos:selectedSession",next);
    toast(`Sesión ${next} preparada`);
    renderHome();
  };
  document.getElementById("openBody").onclick=()=>{state.screen="body";renderBody();};
  bindNav();
}


function isTimedExercise(exercise){
  const type=String(exercise?.type||"").toLowerCase();
  const target=String(exercise?.target||"").toLowerCase();
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
  const input=document.querySelector(`[data-seconds="${exerciseIndex}:${setIndex}"]`);
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
  const input=document.querySelector(`[data-seconds="${exerciseIndex}:${setIndex}"]`);
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

function renderWorkout(){
  const s=state.selectedSession,d=getDraft(s),last=lastWorkoutForSession(s);
  const done=d.exercises.reduce((n,e)=>n+e.series.filter(x=>x.done).length,0);
  const total=d.exercises.reduce((sum,e)=>sum+e.series.length,0);
  app.innerHTML=`<div class="app-shell">
    <main class="screen">
      <div class="workout-header">
        <div class="workout-title-row">
          <div><div class="subtle">Entrenamiento activo</div><h1>Sesión ${s} · ${done}/${total} series</h1></div>
          <button id="timerChip" class="timer-chip">${state.timerSeconds?formatTimer(state.timerSeconds):"Descanso"}</button>
        </div>
        <div class="progress"><span style="width:${(done/total)*100}%"></span></div>
      </div>
      ${d.copiedFromLastSession ? `
        <div class="prefill-banner">
          <div><strong>Pesos preparados</strong><span>Se han copiado de tu última sesión ${s}.</span></div>
          <button id="clearPrefilledWeights" class="text-button">Vaciar pesos</button>
        </div>` : ""}
      ${d.exercises.map((ex,i)=>{
        const timed=isTimedExercise(ex);
        return `
        <section class="exercise-card ${timed?"timed-exercise-card":""}" data-exercise="${i}">
          <h2>${ex.name}</h2>
          <div class="target">Objetivo: ${ex.target} · RIR 3–4</div>
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
          <textarea data-notes="${i}" placeholder="Notas">${ex.notes||""}</textarea>
        </section>`;
      }).join("")}
    </main>
    <div id="timerPanel" class="timer-panel hidden">
      <div class="timer-main"><div><div class="subtle">Descanso</div><div id="timerValue" class="timer-value">${formatTimer(state.timerSeconds)}</div></div><button id="closeTimer" class="secondary">Cerrar</button></div>
      <div class="timer-actions"><button class="secondary" data-time="60">60 s</button><button class="secondary" data-time="90">90 s</button><button class="secondary" data-time="120">120 s</button><button class="secondary" data-time="180">180 s</button></div>
    </div>
    <footer class="sticky-actions"><div class="sticky-actions-inner"><button id="backHome" class="secondary">Salir</button><button id="finishWorkout" class="primary">Finalizar</button></div></footer>
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
      const draft=getDraft(s),j=Number(btn.dataset.done);
      if(isTimedExercise(draft.exercises[i])&&!draft.exercises[i].series[j].seconds){
        stopExerciseTimer(s,i,j);
      }
      draft.exercises[i].series[j].done=!draft.exercises[i].series[j].done;
      saveDraft(draft);
      if(draft.exercises[i].series[j].done) startTimer(getRestSeconds());
      renderWorkout();
    });
  });
  document.querySelectorAll("[data-notes]").forEach(a=>a.oninput=()=>{
    const draft=getDraft(s); draft.exercises[Number(a.dataset.notes)].notes=a.value; saveDraft(draft);
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
  document.getElementById("finishWorkout").onclick=()=>{stopAllExerciseTimers();finishWorkout();};
  document.getElementById("timerChip").onclick=()=>document.getElementById("timerPanel").classList.remove("hidden");
  document.getElementById("closeTimer").onclick=()=>document.getElementById("timerPanel").classList.add("hidden");
  document.querySelectorAll("[data-time]").forEach(b=>b.onclick=()=>startTimer(Number(b.dataset.time)));
}

function startTimer(sec){
  clearInterval(state.timerInterval); state.timerSeconds=sec; updateTimerUI();
  const p=document.getElementById("timerPanel"); if(p)p.classList.remove("hidden");
  state.timerInterval=setInterval(()=>{
    state.timerSeconds--; updateTimerUI();
    if(state.timerSeconds<=0){clearInterval(state.timerInterval);if(navigator.vibrate)navigator.vibrate([200,100,200]);}
  },1000);
}
function formatTimer(sec){return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,"0")}`;}
function updateTimerUI(){
  const a=document.getElementById("timerValue"),b=document.getElementById("timerChip");
  if(a)a.textContent=formatTimer(state.timerSeconds);
  if(b)b.textContent=state.timerSeconds?formatTimer(state.timerSeconds):"Descanso";
}
function finishWorkout(){
  const s=state.selectedSession,d=getDraft(s);
  const completed=d.exercises.reduce((n,e)=>n+workingSeries(e.series).filter(x=>x.done).length,0);
  const workout={id:Date.now(),date:new Date().toISOString(),session:s,
    durationMs:Date.now()-(d.startedAt||Date.now()),completedSeries:completed,exercises:d.exercises};
  const h=getHistory();h.unshift(workout);saveHistory(h);clearDraft(s);
  const newRecords=recordsForWorkout(workout);
  state.selectedSession=s==="A"?"B":s==="B"?"C":"A";
  localStorage.setItem("gymos:selectedSession",state.selectedSession);
  clearInterval(state.timerInterval);state.timerSeconds=0;state.screen="home";renderHome();
  autoSync("entrenamiento finalizado");
  if(newRecords.length){
    showRecordsCelebration(newRecords);
  }else{
    toast(`Sesión ${s} guardada`);
  }
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
            <div><strong>Sesión ${w.session}</strong><small>${formatDate(w.date)} · ${formatDuration(w.durationMs)} · ${w.completedSeries} series efectivas</small></div>
            <div class="chevron">›</div>
          </div>
          ${state.expandedHistoryId===w.id?`<div class="history-detail">
            ${w.exercises.map(e=>`<div class="exercise-summary"><strong>${e.name}</strong><span>${e.series.map(x=>{
              const s=normalizeSeries(x);
              return s.weight||s.reps?`${s.warmup?"Cal. ":""}${s.weight||"—"} × ${s.reps||"—"}${s.rir!==""?` · RIR ${s.rir}`:""}`:"—";
            }).join(" · ")}</span>${e.notes?`<small>${e.notes}</small>`:""}</div>`).join("")}
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
    <header class="topbar"><div><div class="brand">Editar sesión ${workout.session}</div><div class="subtle">${formatDate(workout.date)}</div></div></header>
    <main class="screen">
      <section class="card">
        <label class="select-label">Fecha y hora</label>
        <input id="editWorkoutDate" type="datetime-local" value="${new Date(new Date(workout.date).getTime()-new Date(workout.date).getTimezoneOffset()*60000).toISOString().slice(0,16)}">
      </section>
      ${workout.exercises.map((ex,i)=>`
        <section class="exercise-card" data-edit-exercise="${i}">
          <h2>${ex.name}</h2>
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
          <textarea data-edit-notes="${i}" placeholder="Notas">${ex.notes||""}</textarea>
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
  document.getElementById("cancelEditWorkout").onclick=()=>{state.screen="history";renderHistory();};
  document.getElementById("saveEditedWorkout").onclick=()=>{
    const dateValue=document.getElementById("editWorkoutDate").value;
    if(!dateValue){alert("Selecciona una fecha válida.");return;}
    edited.date=new Date(dateValue).toISOString();
    edited.completedSeries=edited.exercises.reduce((sum,e)=>sum+workingSeries(e.series).filter(s=>s.done).length,0);
    const history=getHistory().map(w=>w.id===edited.id?edited:w);
    saveHistory(history);
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

function renderBody(){
  const rows=getBodyHistory();
  const latest=rows.at(-1);
  const weightChange=bodyChange("weight");
  const waistChange=bodyChange("waist");
  const today=new Date().toISOString().slice(0,10);

  app.innerHTML=`<div class="app-shell">
    <header class="topbar"><div><div class="brand">Seguimiento corporal</div><div class="subtle">Peso, cintura y tendencia</div></div></header>
    <main class="screen">
      <section class="card">
        <h2>Nuevo registro</h2>
        <div class="body-form-grid">
          <label><span>Fecha</span><input id="bodyDate" type="date" value="${today}"></label>
          <label><span>Peso (kg)</span><input id="bodyWeight" inputmode="decimal" placeholder="79,5"></label>
          <label><span>Cintura (cm)</span><input id="bodyWaist" inputmode="decimal" placeholder="88"></label>
          <label class="body-note"><span>Nota opcional</span><input id="bodyNote" type="text" placeholder="En ayunas, después de entrenar…"></label>
        </div>
        <button id="saveBody" class="primary full">Guardar registro</button>
      </section>

      <section class="body-summary-grid">
        <div class="metric-card"><span>Último peso</span><strong>${latest&&numericValue(latest.weight)!==null?`${formatWeight(latest.weight)} kg`:"—"}</strong><small>${weightChange===null?"Sin tendencia":`${weightChange>0?"+":""}${formatWeight(weightChange)} kg desde el inicio`}</small></div>
        <div class="metric-card"><span>Última cintura</span><strong>${latest&&numericValue(latest.waist)!==null?`${formatWeight(latest.waist)} cm`:"—"}</strong><small>${waistChange===null?"Sin tendencia":`${waistChange>0?"+":""}${formatWeight(waistChange)} cm desde el inicio`}</small></div>
      </section>

      <section class="card">
        <div class="stats-card-title"><div><h2>Evolución del peso</h2><p class="subtle">Últimos 12 registros</p></div></div>
        ${bodyTrendSvg(rows,"weight","Evolución del peso")}
      </section>

      <section class="card">
        <div class="stats-card-title"><div><h2>Evolución de cintura</h2><p class="subtle">Últimos 12 registros</p></div></div>
        ${bodyTrendSvg(rows,"waist","Evolución de cintura")}
      </section>

      <section class="card">
        <h2>Historial corporal</h2>
        ${rows.length?rows.slice().reverse().map(row=>`
          <div class="body-history-row">
            <div><strong>${formatDate(row.date)}</strong><small>${row.note||"Sin nota"}</small></div>
            <div class="body-history-values">
              <span>${numericValue(row.weight)!==null?`${formatWeight(row.weight)} kg`:"—"}</span>
              <span>${numericValue(row.waist)!==null?`${formatWeight(row.waist)} cm`:"—"}</span>
              <button data-delete-body="${row.id}" class="body-delete" aria-label="Eliminar registro">×</button>
            </div>
          </div>
        `).join(""):`<div class="empty">Todavía no hay registros corporales.</div>`}
      </section>
    </main>${nav("")}
  </div>`;

  document.getElementById("saveBody").onclick=()=>{
    const date=document.getElementById("bodyDate").value;
    const weight=numericValue(document.getElementById("bodyWeight").value.replace(",","."));
    const waist=numericValue(document.getElementById("bodyWaist").value.replace(",","."));
    const note=document.getElementById("bodyNote").value.trim();
    if(!date){alert("Selecciona una fecha.");return;}
    if(weight===null&&waist===null){alert("Introduce el peso, la cintura o ambos.");return;}
    if(weight!==null&&(weight<30||weight>300)){alert("Revisa el peso introducido.");return;}
    if(waist!==null&&(waist<40||waist>250)){alert("Revisa la cintura introducida.");return;}
    const current=getBodyHistory().filter(row=>row.date!==date);
    current.push({id:Date.now(),date,weight,waist,note});
    saveBodyHistory(current);
    toast("Registro corporal guardado");
    renderBody();
  };
  document.querySelectorAll("[data-delete-body]").forEach(button=>button.onclick=()=>{
    if(!confirm("¿Eliminar este registro corporal?")) return;
    saveBodyHistory(getBodyHistory().filter(row=>row.id!==Number(button.dataset.deleteBody)));
    renderBody();
  });
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
  const routine=JSON.parse(JSON.stringify(getRoutine()));
  const current=index===null
    ? {name:"",target:"8–10 reps",sets:3,increment:2.5,type:"peso"}
    : routine[session][index];

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
    if(!name){alert("Escribe el nombre del ejercicio.");return;}
    const value={
      name,
      target:document.getElementById("reTarget").value.trim()||"8–10 reps",
      sets:Math.max(1,Math.min(10,Number(document.getElementById("reSets").value)||3)),
      increment:Math.max(0,Number(document.getElementById("reIncrement").value)||0),
      type:document.getElementById("reType").value
    };
    if(index===null) routine[session].push(value);
    else routine[session][index]=value;
    saveRoutine(routine);
    sessions=getRoutine();
    close();
    toast(index===null?"Ejercicio añadido":"Ejercicio actualizado");
    renderRoutineEditor();
  };

  const remove=document.getElementById("removeExercise");
  if(remove) remove.onclick=()=>{
    if(!confirm(`¿Eliminar "${current.name}"?`)) return;
    routine[session].splice(index,1);
    saveRoutine(routine);
    sessions=getRoutine();
    close();
    toast("Ejercicio eliminado");
    renderRoutineEditor();
  };
}

function substituteExerciseModal(session,index){
  const routine=getRoutine();
  const current=routine[session]?.[index];
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
  const routine=JSON.parse(JSON.stringify(getRoutine()));
  const target=index+direction;
  if(target<0||target>=routine[session].length) return;
  [routine[session][index],routine[session][target]]=[routine[session][target],routine[session][index]];
  saveRoutine(routine);
  sessions=getRoutine();
  renderRoutineEditor();
}
function renderRoutineEditor(){
  const session=state.editingSession||"A";
  const routine=getRoutine();
  const exercises=routine[session]||[];

  app.innerHTML=`<div class="app-shell">
    <header class="topbar">
      <button id="backRoutineEditor" class="back-button">←</button>
      <div><div class="brand">Editor de rutina</div><div class="subtle">Sesiones A, B y C</div></div>
      <button id="addRoutineExerciseTop" class="header-action">＋</button>
    </header>
    <main class="screen">
      <div class="session-picker routine-tabs">
        ${["A","B","C"].map(s=>`<button data-edit-session="${s}" class="${s===session?"active":""}">Sesión ${s}</button>`).join("")}
      </div>
      <section class="card">
        <div class="card-heading-row">
          <div><h2>Sesión ${session}</h2><p class="subtle">${exercises.length} ejercicios</p></div>
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
    const target=prompt(`¿A qué sesión quieres copiar la sesión ${session}? Escribe A, B o C.`);
    if(target===null) return;
    const dest=target.trim().toUpperCase();
    if(!["A","B","C"].includes(dest)){alert("Escribe A, B o C.");return;}
    if(dest===session){alert("Selecciona una sesión diferente.");return;}
    if(routine[dest].length&&!confirm(`La sesión ${dest} ya contiene ejercicios. ¿Sustituirlos?`)) return;
    const next=JSON.parse(JSON.stringify(routine));
    next[dest]=next[session].map(x=>({...x}));
    saveRoutine(next);
    sessions=getRoutine();
    state.editingSession=dest;
    toast(`Sesión ${session} copiada a ${dest}`);
    renderRoutineEditor();
  };
  document.getElementById("clearRoutineSession").onclick=()=>{
    if(!exercises.length) return;
    if(!confirm(`¿Vaciar toda la sesión ${session}?`)) return;
    const next=JSON.parse(JSON.stringify(routine));
    next[session]=[];
    saveRoutine(next);
    sessions=getRoutine();
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
              ${["A","B","C"].map(s=>`<option value="${s}" ${s===session?"selected":""}>Sesión ${s}</option>`).join("")}
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
      ${["A","B","C"].map(s=>`<option value="${s}" ${s===session?"selected":""}>Sesión ${s}</option>`).join("")}
    </select></label>`).join("");
  };
  const save=()=>{
    const name=document.getElementById("blockName").value.trim();
    const startDate=document.getElementById("blockStart").value;
    if(!name){alert("Escribe un nombre para el bloque.");return;}
    if(!startDate){alert("Selecciona una fecha de inicio.");return;}
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
            <span>Sesión ${item.session}</span>
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


function renderExerciseLibrary(){
  const items=getExerciseLibrary();
  const muscles=["Todos",...new Set(items.map(item=>item.muscle).filter(Boolean))];
  const equipment=["Todos",...new Set(items.map(item=>item.equipment).filter(Boolean))];
  const filtered=exerciseLibraryFilters(items,state.libraryQuery,state.libraryMuscle,state.libraryEquipment,state.libraryFavoritesOnly);

  app.innerHTML=`<div class="app-shell">
    <header class="topbar">
      <button id="backExerciseLibrary" class="back-button">←</button>
      <div><div class="brand">Biblioteca</div><div class="subtle">${items.length} ejercicios disponibles</div></div>
      <button id="newLibraryExercise" class="header-action">＋</button>
    </header>
    <main class="screen">
      <section class="card library-filter-card">
        <label class="library-search"><span>Buscar</span><input id="librarySearch" type="search" value="${esc(state.libraryQuery)}" placeholder="Ejercicio, músculo o material"></label>
        <div class="library-filter-grid">
          <label><span>Grupo muscular</span><select id="libraryMuscle">${muscles.map(value=>`<option value="${esc(value)}" ${state.libraryMuscle===value?"selected":""}>${esc(value)}</option>`).join("")}</select></label>
          <label><span>Equipamiento</span><select id="libraryEquipment">${equipment.map(value=>`<option value="${esc(value)}" ${state.libraryEquipment===value?"selected":""}>${esc(value)}</option>`).join("")}</select></label>
        </div>
        <label class="favorite-filter"><input id="libraryFavoritesOnly" type="checkbox" ${state.libraryFavoritesOnly?"checked":""}><span>Mostrar solo favoritos</span></label>
      </section>

      <section class="library-results-header"><strong>${filtered.length} resultados</strong><button id="resetLibraryFilters" class="text-button">Limpiar filtros</button></section>

      <section class="exercise-library-list">
        ${filtered.length?filtered.map(item=>`<article class="card exercise-library-card">
          <div class="exercise-library-card-top">
            <div><div class="exercise-library-title-row"><h2>${esc(item.name)}</h2>${item.custom?'<span class="custom-pill">Propio</span>':""}</div>
            <p class="subtle">${esc(item.muscle)} · ${esc(item.equipment)} · ${esc(item.type)}</p></div>
            <button class="favorite-button ${item.favorite?"active":""}" data-favorite-exercise="${item.id}" aria-label="Favorito">★</button>
          </div>
          ${item.notes?`<p class="exercise-library-notes">${esc(item.notes)}</p>`:""}
          <div class="library-session-actions">${["A","B","C"].map(session=>`<button class="secondary" data-add-library-exercise="${item.id}" data-target-session="${session}">Añadir a ${session}</button>`).join("")}</div>
          <div class="settings-actions compact-actions">
            <button class="secondary" data-open-exercise-detail="${item.id}">Ver ficha</button>
            <button class="secondary" data-edit-library-exercise="${item.id}">Editar</button>
            ${item.custom?`<button class="danger-soft" data-delete-library-exercise="${item.id}">Eliminar</button>`:""}
          </div>
        </article>`).join(""):`<section class="card empty-library-state"><h2>Sin resultados</h2><p class="subtle">Prueba con otros filtros o crea un ejercicio personalizado.</p></section>`}
      </section>
    </main>${nav("settings")}
  </div>`;

  const rerender=()=>{
    state.libraryQuery=document.getElementById("librarySearch")?.value||"";
    state.libraryMuscle=document.getElementById("libraryMuscle")?.value||"Todos";
    state.libraryEquipment=document.getElementById("libraryEquipment")?.value||"Todos";
    state.libraryFavoritesOnly=Boolean(document.getElementById("libraryFavoritesOnly")?.checked);
    renderExerciseLibrary();
  };
  document.getElementById("backExerciseLibrary").onclick=()=>{state.screen="settings";renderSettings();};
  document.getElementById("newLibraryExercise").onclick=()=>{state.editingLibraryExerciseId=null;state.screen="exerciseLibraryEditor";renderExerciseLibraryEditor();};
  document.getElementById("librarySearch").oninput=rerender;
  document.getElementById("libraryMuscle").onchange=rerender;
  document.getElementById("libraryEquipment").onchange=rerender;
  document.getElementById("libraryFavoritesOnly").onchange=rerender;
  document.getElementById("resetLibraryFilters").onclick=()=>{state.libraryQuery="";state.libraryMuscle="Todos";state.libraryEquipment="Todos";state.libraryFavoritesOnly=false;renderExerciseLibrary();};
  document.querySelectorAll("[data-favorite-exercise]").forEach(button=>button.onclick=()=>{
    const library=getExerciseLibrary(); const item=library.find(x=>x.id===button.dataset.favoriteExercise);
    if(item) item.favorite=!item.favorite;
    saveExerciseLibrary(library); renderExerciseLibrary();
  });
  document.querySelectorAll("[data-add-library-exercise]").forEach(button=>button.onclick=()=>{
    const item=getExerciseLibrary().find(x=>x.id===button.dataset.addLibraryExercise);
    if(!item) return;
    addExerciseToRoutine(button.dataset.targetSession,item);
    toast(`${item.name} añadido a la sesión ${button.dataset.targetSession}`);
  });
  document.querySelectorAll("[data-open-exercise-detail]").forEach(button=>button.onclick=()=>{
    state.selectedLibraryExerciseId=button.dataset.openExerciseDetail;
    state.screen="exerciseDetail";
    renderExerciseDetail();
  });
  document.querySelectorAll("[data-edit-library-exercise]").forEach(button=>button.onclick=()=>{
    state.editingLibraryExerciseId=button.dataset.editLibraryExercise;state.screen="exerciseLibraryEditor";renderExerciseLibraryEditor();
  });
  document.querySelectorAll("[data-delete-library-exercise]").forEach(button=>button.onclick=()=>{
    const library=getExerciseLibrary(); const item=library.find(x=>x.id===button.dataset.deleteLibraryExercise);
    if(!item||!item.custom||!confirm(`¿Eliminar "${item.name}" de la biblioteca?`)) return;
    saveExerciseLibrary(library.filter(x=>x.id!==item.id));toast("Ejercicio eliminado");renderExerciseLibrary();
  });
  bindNav();
}

function renderExerciseLibraryEditor(){
  const library=getExerciseLibrary();
  const existing=library.find(item=>item.id===state.editingLibraryExerciseId);
  const exercise=existing||{name:"",muscle:"Pecho",equipment:"Mancuernas",type:"Hipertrofia",favorite:false,custom:true,notes:""};

  app.innerHTML=`<div class="app-shell">
    <header class="topbar">
      <button id="backLibraryEditor" class="back-button">←</button>
      <div><div class="brand">${existing?"Editar ejercicio":"Nuevo ejercicio"}</div><div class="subtle">Biblioteca GymOS</div></div>
      <button id="saveLibraryExerciseTop" class="header-action">Guardar</button>
    </header>
    <main class="screen">
      <section class="card library-editor-form">
        <label><span>Nombre</span><input id="libraryExerciseName" value="${esc(exercise.name)}" placeholder="Ej. Press en máquina"></label>
        <div class="routine-editor-grid">
          <label><span>Grupo muscular</span><input id="libraryExerciseMuscle" value="${esc(exercise.muscle)}" placeholder="Pecho"></label>
          <label><span>Equipamiento</span><input id="libraryExerciseEquipment" value="${esc(exercise.equipment)}" placeholder="Máquina"></label>
        </div>
        <label><span>Tipo</span><select id="libraryExerciseType">${["Fuerza","Hipertrofia","Core","Cardio","Movilidad","Otro"].map(value=>`<option value="${value}" ${exercise.type===value?"selected":""}>${value}</option>`).join("")}</select></label>
        <label><span>Notas técnicas</span><textarea id="libraryExerciseNotes" rows="5" placeholder="Recordatorios de ejecución">${esc(exercise.notes||"")}</textarea></label>
        <label class="favorite-filter"><input id="libraryExerciseFavorite" type="checkbox" ${exercise.favorite?"checked":""}><span>Marcar como favorito</span></label>
        <button id="saveLibraryExerciseBottom" class="primary full">${existing?"Guardar cambios":"Crear ejercicio"}</button>
      </section>
    </main>
  </div>`;

  const save=()=>{
    const name=document.getElementById("libraryExerciseName").value.trim();
    if(!name){toast("Escribe un nombre para el ejercicio");return;}
    const updated={
      id:existing?.id||makeExerciseId(name),name,
      muscle:document.getElementById("libraryExerciseMuscle").value.trim()||"Sin categoría",
      equipment:document.getElementById("libraryExerciseEquipment").value.trim()||"Sin material",
      type:document.getElementById("libraryExerciseType").value,
      notes:document.getElementById("libraryExerciseNotes").value.trim(),
      favorite:Boolean(document.getElementById("libraryExerciseFavorite").checked),
      custom:existing?Boolean(existing.custom):true
    };
    saveExerciseLibrary(existing?library.map(item=>item.id===existing.id?updated:item):[...library,updated]);
    toast(existing?"Ejercicio actualizado":"Ejercicio creado");
    state.screen="exerciseLibrary";renderExerciseLibrary();
  };
  document.getElementById("backLibraryEditor").onclick=()=>{state.screen="exerciseLibrary";renderExerciseLibrary();};
  document.getElementById("saveLibraryExerciseTop").onclick=save;
  document.getElementById("saveLibraryExerciseBottom").onclick=save;
}



function renderExerciseDetail(){
  const item=getExerciseLibrary().find(exercise=>exercise.id===state.selectedLibraryExerciseId);
  if(!item){
    state.screen="exerciseLibrary";
    renderExerciseLibrary();
    return;
  }
  const stats=exerciseDetailStats(item.name);
  const recent=stats.rows.slice(0,20);
  const bestWeight=stats.bestWeight?`${stats.bestWeight.toLocaleString("es-ES")} kg`:"—";
  const best1RM=stats.best1RM?`${Math.round(stats.best1RM*10)/10} kg`:"—";
  const totalVolume=stats.totalVolume?`${Math.round(stats.totalVolume).toLocaleString("es-ES")} kg`:"—";

  app.innerHTML=`<div class="app-shell">
    <header class="topbar">
      <button id="backExerciseDetail" class="back-button">←</button>
      <div><div class="brand">${esc(item.name)}</div><div class="subtle">Ficha técnica e historial</div></div>
      <button id="editExerciseFromDetail" class="header-action">Editar</button>
    </header>
    <main class="screen">
      <section class="card exercise-profile-card">
        <div class="exercise-profile-heading">
          <div>
            <h2>${esc(item.name)}</h2>
            <p class="subtle">${esc(item.muscle)} · ${esc(item.equipment)} · ${esc(item.type)}</p>
          </div>
          <span class="favorite-profile ${item.favorite?"active":""}">★</span>
        </div>
        <div class="exercise-profile-tags">
          <span>${esc(item.muscle)}</span><span>${esc(item.equipment)}</span><span>${esc(item.type)}</span>
        </div>
      </section>

      <section class="analytics-grid exercise-detail-stats">
        <article class="stat-card"><span>Mejor peso</span><strong>${bestWeight}</strong></article>
        <article class="stat-card"><span>1RM estimado</span><strong>${best1RM}</strong></article>
        <article class="stat-card"><span>Series registradas</span><strong>${stats.totalSets}</strong></article>
        <article class="stat-card"><span>Volumen acumulado</span><strong>${totalVolume}</strong></article>
      </section>

      <section class="card">
        <div class="card-heading-row">
          <div><h2>Notas técnicas</h2><p class="subtle">Recordatorios visibles para este ejercicio.</p></div>
        </div>
        <textarea id="exerciseTechnicalNotes" class="technical-notes-area" rows="5" placeholder="Ej. Mantener escápulas retraídas, controlar la bajada...">${esc(item.notes||"")}</textarea>
        <button id="saveExerciseTechnicalNotes" class="primary full">Guardar notas</button>
      </section>

      <section class="card">
        <div class="card-heading-row">
          <div><h2>Historial de rendimiento</h2><p class="subtle">${stats.totalSets?`${stats.totalSets} series registradas`:"Todavía no hay datos"}</p></div>
        </div>
        <div class="exercise-history-table">
          ${recent.length?recent.map(row=>`<article>
            <div>
              <strong>${row.weight.toLocaleString("es-ES")} kg × ${row.reps}</strong>
              <span>${row.date?new Date(row.date).toLocaleDateString("es-ES"):"Sin fecha"}${row.session?` · Sesión ${esc(row.session)}`:""} · Serie ${row.set}</span>
            </div>
            <div class="exercise-history-metrics">
              <span>${Math.round(row.volume).toLocaleString("es-ES")} kg vol.</span>
              <span>1RM ${Math.round(row.estimated1RM*10)/10} kg</span>
              ${row.rir!==null?`<span>RIR ${esc(row.rir)}</span>`:""}
              ${row.rpe!==null?`<span>RPE ${esc(row.rpe)}</span>`:""}
            </div>
          </article>`).join(""):`<div class="routine-empty"><strong>Sin historial todavía</strong><p>Cuando entrenes este ejercicio, aquí aparecerán tus cargas, repeticiones y estimaciones.</p></div>`}
        </div>
      </section>

      <section class="card">
        <h2>Añadir a una sesión</h2>
        <p class="subtle">Se añadirá con 3 series y un rango inicial de 8–12 repeticiones.</p>
        <div class="library-session-actions">
          ${["A","B","C"].map(session=>`<button class="secondary" data-detail-add-session="${session}">Añadir a ${session}</button>`).join("")}
        </div>
      </section>
    </main>
  </div>`;

  document.getElementById("backExerciseDetail").onclick=()=>{state.screen="exerciseLibrary";renderExerciseLibrary();};
  document.getElementById("editExerciseFromDetail").onclick=()=>{
    state.editingLibraryExerciseId=item.id;
    state.screen="exerciseLibraryEditor";
    renderExerciseLibraryEditor();
  };
  document.getElementById("saveExerciseTechnicalNotes").onclick=()=>{
    const notes=document.getElementById("exerciseTechnicalNotes").value;
    if(updateExerciseTechnicalNotes(item.id,notes)){
      toast("Notas técnicas guardadas");
      renderExerciseDetail();
    }
  };
  document.querySelectorAll("[data-detail-add-session]").forEach(button=>button.onclick=()=>{
    addExerciseToRoutine(button.dataset.detailAddSession,item);
    toast(`${item.name} añadido a la sesión ${button.dataset.detailAddSession}`);
  });
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
        <div class="recovery-score-ring" style="--score:${recovery.score}">
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
      alert(error.message);
    }
  };
}

function renderNutrition(){
  const settings=getNutritionSettings();
  const entry=nutritionEntryForDate(state.nutritionDate);
  const weekly=nutritionWeeklySummary();
  const assessment=bodyCompositionAssessment();

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

      <section class="card">
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
}

function renderProgressDashboard(){
  let weeks=[],fatigue={score:0,level:"baja",reasons:[]};
  let periodization={phase:"Acumulación",action:"Mantener el plan actual.",reason:"Sin datos suficientes."};
  let adherence={completed:0,possible:0,percent:0};
  let weightTrend={entries:[],change:null,weeklyRate:null};
  let records=[];
  try{weeks=weeklyTrainingAnalytics(state.progressRangeWeeks);}catch(error){console.error("Progress weeks",error);}
  try{fatigue=fatigueAssessment();}catch(error){console.error("Progress fatigue",error);}
  try{periodization=periodizationRecommendation();}catch(error){console.error("Progress periodization",error);}
  try{adherence=adherenceSummary(state.progressRangeWeeks);}catch(error){console.error("Progress adherence",error);}
  try{weightTrend=bodyWeightTrend();}catch(error){console.error("Progress body trend",error);}
  try{records=personalRecords();}catch(error){console.error("Progress records",error);}
  const current=weeks.at(-1)||{workouts:0,sets:0,volume:0,muscleSets:{}};
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
        <article class="stat-card"><span>Adherencia</span><strong>${Math.round(adherence.percent)} %</strong></article>
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
        <div class="fatigue-meter"><span style="width:${Math.min(100,fatigue.score/8*100)}%"></span></div>
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
    </main>
    ${nav("progressDashboard")}
  </div>`;

  document.getElementById("backProgressDashboard").onclick=()=>{state.screen="home";renderHome();};
  document.getElementById("progressRange").onchange=e=>{
    state.progressRangeWeeks=Number(e.target.value);
    renderProgressDashboard();
  };
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
          ${message.proposalId?`<button class="secondary" data-open-chat-proposal="${message.proposalId}">Ver propuesta generada</button>`:""}
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
      alert(error.message||"No se pudo enviar el mensaje.");
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
  let proposals=[],snapshots=[],summaries=[];
  try{settings=getCoachSettings();}catch(error){console.error("Coach settings",error);}
  try{proposals=getCoachProposals();}catch(error){console.error("Coach proposals",error);}
  try{snapshots=getCoachSnapshots();}catch(error){console.error("Coach snapshots",error);}
  try{summaries=coachExerciseSummary();}catch(error){console.error("Coach summary",error);}
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

      <section class="card">
        <div class="card-heading-row">
          <div><h2>Conexión con IA</h2><p class="subtle">Comprueba que el backend seguro está disponible.</p></div>
          <span id="coachConnectionBadge" class="connection-badge ${getCoachConnection().status}">${getCoachConnection().status==="connected"?"Conectado":getCoachConnection().status==="error"?"Error":"Sin comprobar"}</span>
        </div>
        <button id="testCoachConnection" class="secondary full">Probar conexión</button>
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
        <label><span>URL del backend seguro</span><input id="coachBackendUrl" type="url" placeholder="https://tu-backend.example.com" value="${esc(settings.backendUrl||"")}"></label>
        <label class="favorite-filter"><input id="coachRequireApproval" type="checkbox" ${settings.requireApproval?"checked":""}><span>Exigir siempre confirmación antes de cambiar la rutina</span></label>
        <button id="saveCoachSettings" class="secondary full">Guardar configuración</button>
      </section>

      <section class="card">
        <h2>Seguridad</h2>
        <p class="subtle">Los cambios aplicados guardan una copia de la rutina anterior.</p>
        <button id="undoCoachChange" class="danger-soft full" ${snapshots.length?"":"disabled"}>Deshacer último cambio del Coach</button>
      </section>

      <section class="card warning-card">
        <h2>Conexión con ChatGPT</h2>
        <p>Esta versión prepara la integración, pero no guarda claves de OpenAI en GitHub Pages. Para usar IA real necesitas un backend seguro configurado en esta pantalla.</p>
      </section>
    </main>
    ${nav("coach")}
  </div>`;

  document.getElementById("backCoach").onclick=()=>{state.screen="home";renderHome();};
  document.getElementById("openCoachChat").onclick=()=>{state.screen="coachChat";renderCoachChat();};
  document.getElementById("testCoachConnection").onclick=async()=>{
    const button=document.getElementById("testCoachConnection");
    button.disabled=true;
    button.textContent="Comprobando...";
    try{
      const connection=await testCoachConnection();
      toast(`Conectado${connection.model?` · ${connection.model}`:""}`);
      renderCoach();
    }catch(error){
      alert(error.message||"No se pudo conectar.");
      renderCoach();
    }
  };
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
      alert(error.message||"No se pudo consultar el backend.");
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
      backendUrl:document.getElementById("coachBackendUrl").value.trim(),
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
            <div><strong>${esc(change.exercise)}</strong><span>Sesión ${esc(change.session)}</span></div>
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
              ${["A","B","C"].map(session=>`<button class="secondary" data-favorite-add="${item.id}" data-target-session="${session}">Añadir a ${session}</button>`).join("")}
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
    toast(`${item.name} añadido a la sesión ${button.dataset.targetSession}`);
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
      alert(error.message);
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
      alert(error.message);
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

  app.innerHTML=`<div class="app-shell">
    <header class="topbar">
      ${user?`<button id="backAccount" class="back-button">←</button>`:`<span></span>`}
      <div><div class="brand">Cuenta GymOS</div><div class="subtle">${user?"Acceso y privacidad":"Acceso obligatorio"}</div></div>
      ${user?`<span class="secure-account-badge">Protegida</span>`:`<span class="secure-account-badge">Privado</span>`}
    </header>
    <main class="screen">
      ${user?`
        <section class="card account-profile-card">
          <div class="large-account-avatar">${esc(accountDisplayName(user).slice(0,1).toUpperCase())}</div>
          <div>
            <span class="section-kicker">SESIÓN ACTIVA</span>
            <h1>${esc(accountDisplayName(user))}</h1>
            <p>${esc(user.email||"")}</p>
            <small>ID interno: ${esc(user.id.slice(0,8))}…</small>
          </div>
        </section>

        ${migrationNeeded?`
        <section class="card migration-card">
          <span class="section-kicker">DATOS ENCONTRADOS</span>
          <h2>Asociar los datos de este dispositivo</h2>
          <p class="subtle">GymOS ha encontrado información local. Se guardará en tu cuenta y quedará aislada mediante tu identificador de usuario.</p>
          <button id="migrateLocalData" class="primary full">Asociar mis datos a esta cuenta</button>
        </section>`:""}

        <section class="card">
          <h2>Perfil</h2>
          <label><span>Nombre visible</span><input id="accountFullName" type="text" value="${esc(accountDisplayName(user))}" maxlength="80"></label>
          <label><span>Correo</span><input type="email" value="${esc(user.email||"")}" disabled></label>
          <button id="saveAccountProfile" class="secondary full">Guardar perfil</button>
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
            <article class="ok"><span>✓</span><div><strong>Dispositivo identificado</strong><small>${esc(getDeviceId().slice(0,18))}…</small></div></article>
            <article class="ok"><span>✓</span><div><strong>Revisión local</strong><small>${getLocalRevision()}</small></div></article>
            <article class="ok"><span>✓</span><div><strong>Última revisión remota</strong><small>${getLastRemoteRevision()}</small></div></article>
          </div>
          <label><span>Cuando haya conflicto</span><select id="syncConflictPreference"><option value="ask" ${getSyncConflictPreference()==="ask"?"selected":""}>Preguntarme</option><option value="local" ${getSyncConflictPreference()==="local"?"selected":""}>Mantener este dispositivo</option><option value="remote" ${getSyncConflictPreference()==="remote"?"selected":""}>Usar la nube</option></select></label>
          <button id="exportSyncAudit" class="secondary full">Exportar registro de sincronización</button>
        </section>

        <section class="card">
          <h2>Datos de la cuenta</h2>
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
  if(backAccount) backAccount.onclick=()=>{state.screen="settings";renderSettings();};

  if(user){
    const migrateButton=document.getElementById("migrateLocalData");
    if(migrateButton) migrateButton.onclick=async()=>{
      migrateButton.disabled=true;
      migrateButton.textContent="Asociando datos…";
      try{
        await migrateLocalDataToAccount();
        toast("Datos asociados a tu cuenta");
        renderAccount();
      }catch(error){
        alert(error.message);
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
      try{
        await updateAccountProfile(document.getElementById("accountFullName").value);
        toast("Perfil actualizado");
        renderAccount();
      }catch(error){alert(error.message);}
    };
    document.getElementById("accountSyncNow").onclick=async()=>{
      try{await syncNow();toast("Sincronización completada");renderAccount();}
      catch(error){alert(error.message);}
    };
    document.getElementById("accountExport").onclick=()=>exportBackup();
    document.getElementById("deleteCloudData").onclick=async()=>{
      if(!confirm("¿Borrar la copia de tus datos alojada en la nube? Los datos del dispositivo no se borrarán.")) return;
      try{await deleteCloudData();toast("Datos de la nube eliminados");}
      catch(error){alert(error.message);}
    };
    document.getElementById("requestAccountDeletion").onclick=async()=>{
      if(!confirm("¿Registrar una solicitud de eliminación completa de tu cuenta?")) return;
      try{
        await requestAccountDeletion();
        toast("Solicitud registrada");
      }catch(error){alert(error.message);}
    };
    document.getElementById("accountSignOut").onclick=async()=>{
      if(state.syncUser) saveCurrentUserVault(state.syncUser.id);
      await signOutSync();
      deactivateLocalUser();
      state.accountMode="login";
      state.screen="account";
      render();
    };
  }else{
    document.querySelectorAll("[data-account-mode]").forEach(button=>button.onclick=()=>{
      state.accountMode=button.dataset.accountMode;
      renderAccount();
    });
    document.getElementById("accountSubmit").onclick=async()=>{
      const email=document.getElementById("accountEmail").value.trim();
      const password=document.getElementById("accountPassword").value;
      if(!email) return alert("Introduce tu correo.");
      if(password.length<8) return alert("La contraseña debe tener al menos 8 caracteres.");
      try{
        saveSyncConfig({...getSyncConfig(),email});
        if(state.accountMode==="signup"){
          const consent=document.getElementById("accountConsent");
          if(!consent.checked) return alert("Debes aceptar el almacenamiento de tus datos para crear la cuenta.");
          const name=document.getElementById("accountName").value.trim();
          if(!name) return alert("Introduce tu nombre.");
          const result=await signUpWithPassword(email,password,name);
          if(result.session){
            await refreshSyncSession();
            if(state.syncUser) activateLocalUser(state.syncUser.id);
            toast("Cuenta creada");
          }else{
            alert("Cuenta creada. Revisa tu correo para verificarla.");
          }
        }else{
          await signInWithPassword(email,password);
          await refreshSyncSession();
          if(state.syncUser) activateLocalUser(state.syncUser.id);
          toast("Sesión iniciada");
        }
        if(state.syncUser){
          state.screen="home";
          render();
        }else{
          renderAccount();
        }
      }catch(error){alert(error.message);}
    };

    const resetButton=document.getElementById("accountResetPassword");
    if(resetButton) resetButton.onclick=async()=>{
      const email=document.getElementById("accountEmail").value.trim();
      if(!email) return alert("Introduce primero tu correo.");
      try{
        await requestPasswordReset(email);
        alert("Te hemos enviado un correo para restablecer la contraseña.");
      }catch(error){alert(error.message);}
    };
  }
}

function renderSettings(){
  app.innerHTML=`<div class="app-shell">
    <header class="topbar"><div><div class="brand">Ajustes</div><div class="subtle">GymOS v4.0.3 · Perfil sin sustituir rutina</div></div></header>
    <main class="screen">
      <section class="card account-entry-card">
        <div class="account-entry-main">
          <div class="account-avatar">${state.syncUser?esc(accountDisplayName().slice(0,1).toUpperCase()):"○"}</div>
          <div>
            <span class="section-kicker">CUENTA GYMOS</span>
            <h2>${state.syncUser?`Hola, ${esc(accountDisplayName())}`:"Tus datos, solo para ti"}</h2>
            <p class="subtle">${state.syncUser
              ?`Sesión iniciada como ${esc(state.syncUser.email||"usuario")}.`
              :"Crea una cuenta para mantener entrenamientos, nutrición y salud separados de otros usuarios."}</p>
          </div>
        </div>
        <button id="openAccount" class="primary full">${state.syncUser?"Gestionar cuenta":"Crear cuenta o iniciar sesión"}</button>
      </section>


      <section class="card onboarding-profile-card">
        <div class="card-heading-row">
          <div>
            <span class="section-kicker">MI PLAN</span>
            <h2>Objetivo y perfil deportivo</h2>
            <p class="subtle">${onboardingCompleted()
              ?`${esc(onboardingGoalLabel(getOnboardingProfile().goal))} · ${getOnboardingProfile().days} días por semana`
              :"Completa el cuestionario para crear una rutina adaptada."}</p>
          </div>
          <span class="mode-pill">${onboardingCompleted()?"Configurado":"Pendiente"}</span>
        </div>
        <button id="openOnboarding" class="primary full">${onboardingCompleted()?"Revisar objetivo y regenerar rutina":"Configurar mi plan"}</button>
      </section>

      <section class="card experience-card">
        <div class="card-heading-row">
          <div><span class="section-kicker">EXPERIENCIA</span><h2>Aspecto y modo de uso</h2><p class="subtle">Adapta GymOS para entrenar sin distracciones o acceder a herramientas técnicas.</p></div>
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
        </div>

        <div class="preset-grid">
          <button data-ui-preset="balanced"><strong>Equilibrado</strong><small>Automático y limpio</small></button>
          <button data-ui-preset="focus"><strong>Entrenamiento</strong><small>Oscuro y compacto</small></button>
          <button data-ui-preset="accessible"><strong>Accesible</strong><small>Texto grande y contraste</small></button>
          <button data-ui-preset="bold"><strong>Intenso</strong><small>Alto contraste</small></button>
        </div>

        <div class="preference-switches">
          <label><input id="compactUi" type="checkbox" ${getAppPreferences().compact?"checked":""}><span>Diseño compacto</span></label>
          <label><input id="animationsUi" type="checkbox" ${getAppPreferences().animations?"checked":""}><span>Animaciones</span></label>
          <label><input id="highContrastUi" type="checkbox" ${getAppPreferences().highContrast?"checked":""}><span>Alto contraste</span></label>
          <label><input id="largeTapTargetsUi" type="checkbox" ${getAppPreferences().largeTapTargets?"checked":""}><span>Botones más grandes</span></label>
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
          <p>Ejecuta <strong>supabase-schema.sql</strong> y añade <strong>https://apl00028.github.io/mi-rutina/</strong> en Authentication → URL Configuration → Redirect URLs. Usa la clave <strong>Publishable</strong> o <strong>anon public</strong>, nunca una secret/service role.</p>
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

      <section class="card nutrition-entry-card">
        <div class="card-heading-row">
          <div>
            <span class="coach-badge">NUEVO</span>
            <h2>Nutrición</h2>
            <p class="subtle">Registra calorías y macros, revisa tu tendencia semanal y compárala con el peso.</p>
          </div>
        </div>
        <button id="openNutrition" class="primary full">Abrir nutrición</button>
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
        <p class="subtle">Busca ejercicios, marca favoritos y añade ejercicios propios a tus sesiones.</p>
        <button id="openExerciseLibrary" class="primary full">Abrir biblioteca</button>
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
      <section class="card">
        <h2>Objetivo y calendario</h2>
        <p class="subtle">Consulta la adherencia semanal, la racha y el calendario de actividad.</p>
        <button id="openPlanSettings" class="secondary full">Abrir plan semanal</button>
      </section>
      <section class="card">
        <h2>Descanso entre series</h2>
        <p class="subtle">El temporizador se inicia al marcar una serie como completada.</p>
        <div class="rest-options">
          ${[60,90,120,180].map(value=>`<button class="rest-option ${getRestSeconds()===value?"active":""}" data-rest-setting="${value}">${value===60?"1 min":value===90?"1:30":value===120?"2 min":"3 min"}</button>`).join("")}
        </div>
      </section>
      <section class="card">
        <h2>Seguimiento corporal</h2>
        <p class="subtle">Registra peso y cintura para comprobar la tendencia junto con tu rendimiento.</p>
        <button id="openBodySettings" class="secondary full">Abrir seguimiento corporal</button>
      </section>
      <section class="card">
        <h2>Editar rutina</h2>
        <p class="subtle">Modifica sesiones y ejercicios directamente desde el móvil.</p>
        <button id="openRoutineEditor" class="primary full">Abrir editor de rutina</button>
      </section>
      <section class="card developer-only">
        <h2>Rutina desde Excel</h2>
        <p class="subtle">Descarga la plantilla, modifícala y vuelve a importarla. El historial anterior no se borra.</p>
        <div class="settings-actions">
          <a class="primary download-link" href="plantilla-rutina-gymos.xlsx" download>Descargar plantilla Excel</a>
          <button id="importRoutine" class="secondary">Importar rutina Excel</button>
          <button id="exportRoutine" class="secondary">Exportar rutina actual</button>
        </div>
        <div id="routinePreview"></div>
      </section>
      <section class="card developer-only">
        <h2>Copia de seguridad</h2>
        <p class="subtle">Exporta tus entrenamientos a un archivo y podrás recuperarlos en este u otro móvil.</p>
        <div class="settings-actions">
          <button id="exportData" class="primary">Exportar copia</button>
          <button id="importData" class="secondary">Importar copia</button>
        </div>
      </section>
      <section class="card developer-only">
        <h2>Eliminar datos</h2>
        <p class="subtle">Esta acción borra el historial y las sesiones en curso de este dispositivo.</p>
        <button id="deleteData" class="danger full">Borrar todos los datos</button>
      </section>
    </main>${nav("settings")}
  </div>`;
  document.getElementById("openAccount").onclick=()=>{state.screen="account";renderAccount();};
  const openOnboarding=document.getElementById("openOnboarding");
  if(openOnboarding) openOnboarding.onclick=()=>{state.onboardingDraft=newOnboardingDraft();state.onboardingStep=1;state.screen="onboarding";renderOnboarding();};
  const openAccountFromSync=document.getElementById("openAccountFromSync");
  if(openAccountFromSync) openAccountFromSync.onclick=()=>{state.screen="account";renderAccount();};
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
  document.querySelectorAll("[data-ui-preset]").forEach(button=>button.onclick=()=>{
    applyPreferencePreset(button.dataset.uiPreset);
    addDeveloperLog("info",`Preset visual ${button.dataset.uiPreset} aplicado`);
    renderSettings();
  });
  document.getElementById("compactUi").onchange=e=>{
    saveAppPreferences({compact:e.target.checked});
    renderSettings();
  };
  document.getElementById("animationsUi").onchange=e=>{
    saveAppPreferences({animations:e.target.checked});
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
  bindScreen("openNutrition","nutrition",renderNutrition);
  bindScreen("openCoach","coach",renderCoach);
  bindScreen("openBackupRestore","backupRestore",renderBackupRestore);
  bindScreen("openRoutineEditor","routineEditor",renderRoutineEditor);
  bindScreen("openTrainingBlocks","blocks",renderBlocks);
  bindScreen("openGlobalAnalytics","globalAnalytics",renderGlobalAnalytics);
  bindScreen("openExerciseLibrary","exerciseLibrary",renderExerciseLibrary);
  bindScreen("openFavoriteExercises","favoriteExercises",renderFavoriteExercises);
  bindScreen("openSubstitutionHistory","substitutionHistory",renderSubstitutionHistory);
  bindScreen("openProgressDashboard","progressDashboard",renderProgressDashboard);
  bindScreen("openBlocksSettings","blocks",renderBlocks);
  bindScreen("openPlanSettings","plan",renderPlan);
  bindScreen("openBodySettings","body",renderBody);

  const importRoutineButton=document.getElementById("importRoutine");
  if(importRoutineButton) importRoutineButton.onclick=()=>routineFile.click();

  const exportRoutineButton=document.getElementById("exportRoutine");
  if(exportRoutineButton) exportRoutineButton.onclick=function(){
    const rows=[];
    const routine=getRoutine();
    ["A","B","C"].forEach(session=>{
      routine[session].forEach((item,index)=>{
        const range=parseRepRange(item.target)||{min:"",max:""};
        rows.push({
          "Sesión":session,
          "Orden":index+1,
          "Ejercicio":item.name,
          "Series":item.sets,
          "Reps mín.":range.min,
          "Reps máx.":range.max,
          "Incremento kg":item.increment,
          "Tipo":item.type
        });
      });
    });
    const ws=XLSX.utils.json_to_sheet(rows);
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,"Rutina");
    XLSX.writeFile(wb,`rutina-gymos-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const exportDataButton=document.getElementById("exportData");
  if(exportDataButton) exportDataButton.onclick=()=>exportData();

  const importDataButton=document.getElementById("importData");
  if(importDataButton) importDataButton.onclick=()=>importFile.click();

  const deleteDataButton=document.getElementById("deleteData");
  if(deleteDataButton) deleteDataButton.onclick=()=>{
    if(!confirm("¿Borrar todos los datos locales de GymOS en este dispositivo?")) return;
    BACKUP_KEYS.forEach(key=>localStorage.removeItem(key));
    ["A","B","C"].forEach(session=>localStorage.removeItem(draftKey(session)));
    toast("Datos locales eliminados");
    state.screen="home";
    render();
  };

  bindNav();
}

function exportData(){
  const payload={
    version:1,
    exportedAt:new Date().toISOString(),
    history:getHistory(),
    drafts:{
      A:JSON.parse(localStorage.getItem(draftKey("A"))||"null"),
      B:JSON.parse(localStorage.getItem(draftKey("B"))||"null"),
      C:JSON.parse(localStorage.getItem(draftKey("C"))||"null")
    },
    selectedSession:state.selectedSession,
    routine:getRoutine(),
    body:getBodyHistory(),
    restSeconds:getRestSeconds(),
    weeklyGoal:getWeeklyGoal(),
    blocks:getTrainingBlocks(),
    activeBlockId:localStorage.getItem("gymos:activeBlockId"),
    updatedAt:getLocalUpdatedAt()
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);
  a.download=`gymos-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();
  URL.revokeObjectURL(a.href);toast("Copia exportada");
}

importFile.onchange=async()=>{
  const file=importFile.files[0]; if(!file)return;
  try{
    const data=JSON.parse(await file.text());
    if(!Array.isArray(data.history))throw new Error();
    saveHistory(data.history);
    if(Array.isArray(data.body)) saveBodyHistory(data.body);
    if([60,90,120,180].includes(Number(data.restSeconds))) saveRestSeconds(Number(data.restSeconds));
    if(Number(data.weeklyGoal)>=1&&Number(data.weeklyGoal)<=7) saveWeeklyGoal(Number(data.weeklyGoal));
    if(Array.isArray(data.blocks)) saveTrainingBlocks(data.blocks);
    if(data.activeBlockId) localStorage.setItem("gymos:activeBlockId",data.activeBlockId);
    if(data.routine){saveRoutine(data.routine);sessions=getRoutine();}
    ["A","B","C"].forEach(s=>{
      if(data.drafts&&data.drafts[s])localStorage.setItem(draftKey(s),JSON.stringify(data.drafts[s]));
    });
    state.selectedSession=data.selectedSession||nextSuggestedSession();
    localStorage.setItem("gymos:selectedSession",state.selectedSession);
    toast("Copia importada");renderSettings();
  }catch{alert("El archivo no es una copia válida de GymOS.");}
  importFile.value="";
};

if("serviceWorker" in navigator){navigator.serviceWorker.register("service-worker.js");}

window.addEventListener("online",()=>{
  state.syncStatus=state.syncUser?"pending":"local";
  updateSyncIndicators();
  autoSync("conexión recuperada");
});
window.addEventListener("offline",()=>{
  state.syncStatus="offline";
  updateSyncIndicators();
});
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible") autoSync("app reabierta");
});
setInterval(()=>autoSync("sincronización periódica"),5*60*1000);

refreshSyncSession().then(user=>{
  if(user) activateLocalUser(user.id);
  render();
  if(user) setTimeout(()=>autoSync("inicio"),500);
}).catch(error=>{
  console.error("GymOS startup auth",error);
  render();
});

applyAppPreferences();

window.addEventListener("DOMContentLoaded",()=>bindNav());
