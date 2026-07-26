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


const app = document.getElementById("app");
const importFile = document.getElementById("importFile");
const routineFile = document.getElementById("routineFile");

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
  syncStatus: "local"
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
function getSyncConfig(){
  return {
    url:localStorage.getItem("gymos:supabaseUrl")||"",
    key:localStorage.getItem("gymos:supabaseAnonKey")||"",
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
function markLocalUpdated(){
  localStorage.setItem("gymos:updatedAt",new Date().toISOString());
}
function buildSyncPayload(){
  return {
    version:"2.0",
    updatedAt:getLocalUpdatedAt(),
    history:getHistory(),
    routine:getRoutine(),
    body:getBodyHistory(),
    selectedSession:localStorage.getItem("gymos:selectedSession")||"A",
    restSeconds:getRestSeconds(),
    weeklyGoal:getWeeklyGoal(),
    updatedAt:getLocalUpdatedAt()
  };
}
function applySyncPayload(payload){
  if(!payload||typeof payload!=="object") throw new Error("Copia remota no válida.");
  if(Array.isArray(payload.history)) saveHistory(payload.history);
  if(payload.routine){saveRoutine(payload.routine);sessions=getRoutine();}
  if(Array.isArray(payload.body)) saveBodyHistory(payload.body);
  if(["A","B","C"].includes(payload.selectedSession)){
    localStorage.setItem("gymos:selectedSession",payload.selectedSession);
    state.selectedSession=payload.selectedSession;
  }
  if([60,90,120,180].includes(Number(payload.restSeconds))) saveRestSeconds(Number(payload.restSeconds));
  if(Number(payload.weeklyGoal)>=1&&Number(payload.weeklyGoal)<=7) saveWeeklyGoal(Number(payload.weeklyGoal));
  localStorage.setItem("gymos:updatedAt",payload.updatedAt||new Date().toISOString());
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
  const {data,error}=await client.auth.getSession();
  if(error){state.syncUser=null;state.syncStatus="error";return null;}
  state.syncUser=data.session?.user||null;
  state.syncStatus=state.syncUser?"connected":"configured";
  return state.syncUser;
}
async function sendMagicLink(email){
  const client=getSupabaseClient();
  if(!client) throw new Error("Configura primero Supabase.");
  const redirectTo=location.origin+location.pathname;
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
async function syncNow(){
  const client=getSupabaseClient();
  if(!client) throw new Error("Supabase no está configurado.");
  const {data:{session},error:sessionError}=await client.auth.getSession();
  if(sessionError||!session?.user) throw new Error("Inicia sesión antes de sincronizar.");
  const user=session.user;
  const {data:remote,error:readError}=await client
    .from("gymos_sync")
    .select("payload,updated_at")
    .eq("user_id",user.id)
    .maybeSingle();
  if(readError) throw readError;

  const localPayload=buildSyncPayload();
  const localTime=new Date(localPayload.updatedAt||0).getTime();
  const remotePayload=remote?.payload||null;
  const remoteTime=new Date(remotePayload?.updatedAt||remote?.updated_at||0).getTime();

  if(remotePayload&&remoteTime>localTime){
    localStorage.setItem("gymos:preSyncBackup",JSON.stringify(localPayload));
    applySyncPayload(remotePayload);
    state.syncStatus="synced";
    return "downloaded";
  }

  const uploadPayload={...localPayload,updatedAt:new Date().toISOString()};
  const {error:writeError}=await client.from("gymos_sync").upsert({
    user_id:user.id,
    payload:uploadPayload,
    updated_at:uploadPayload.updatedAt
  },{onConflict:"user_id"});
  if(writeError) throw writeError;
  localStorage.setItem("gymos:updatedAt",uploadPayload.updatedAt);
  state.syncStatus="synced";
  return remotePayload?"uploaded":"created";
}
function syncStatusLabel(){
  if(state.syncStatus==="synced") return "Sincronizado";
  if(state.syncStatus==="connected") return "Cuenta conectada";
  if(state.syncStatus==="configured") return "Configurado, sin sesión";
  if(state.syncStatus==="error") return "Error de conexión";
  return "Solo en este dispositivo";
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
  return `<nav class="bottom-nav">
    <button data-nav="home" class="${active==="home"?"active":""}">Inicio</button>
    <button data-nav="history" class="${active==="history"?"active":""}">Historial</button>
    <button data-nav="stats" class="${active==="stats"?"active":""}">Estadísticas</button>
    <button data-nav="records" class="${active==="records"?"active":""}">Récords</button>
    <button data-nav="settings" class="${active==="settings"?"active":""}">Ajustes</button>
  </nav>`;
}
function bindNav(){
  document.querySelectorAll("[data-nav]").forEach(b=>b.onclick=()=>{
    state.screen=b.dataset.nav; render();
  });
}
function toast(msg){
  const el=document.createElement("div"); el.className="toast"; el.textContent=msg;
  document.body.appendChild(el); setTimeout(()=>el.remove(),1800);
}

function render(){
  if(state.screen==="home") renderHome();
  else if(state.screen==="workout") renderWorkout();
  else if(state.screen==="history") renderHistory();
  else if(state.screen==="stats") renderStats();
  else if(state.screen==="records") renderRecords();
  else if(state.screen==="body") renderBody();
  else if(state.screen==="editWorkout") renderEditWorkout();
  else if(state.screen==="plan") renderPlan();
  else renderSettings();
}

function renderHome(){
  const h=getHistory(), last=h[0];
  app.innerHTML=`<div class="app-shell">
    <header class="topbar"><div><div class="brand">GymOS</div><div class="subtle">Entrena y registra</div></div></header>
    <main class="screen">
      <section class="hero">
        <div class="hero-label">Hoy toca</div>
        <h1>Sesión ${state.selectedSession}</h1>
        <p>${sessions[state.selectedSession].length} ejercicios · RIR 3–4</p>
        <button id="startWorkout" class="primary">Comenzar entrenamiento</button>
      </section>
      <div class="session-picker">
        ${["A","B","C"].map(s=>`<button data-session="${s}" class="${s===state.selectedSession?"active":""}">Sesión ${s}</button>`).join("")}
      </div>
      <section class="card">
        <h2>Resumen</h2>
        <div class="info-row"><span>Último entrenamiento</span><strong>${last?`Sesión ${last.session}`:"—"}</strong></div>
        <div class="info-row"><span>Duración</span><strong>${last?formatDuration(last.durationMs):"—"}</strong></div>
        <div class="info-row"><span>Entrenamientos guardados</span><strong>${h.length}</strong></div>
      </section>
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
  document.getElementById("startWorkout").onclick=()=>{state.screen="workout";renderWorkout();};
  document.getElementById("openPlan").onclick=()=>{state.screen="plan";renderPlan();};
  document.getElementById("openBody").onclick=()=>{state.screen="body";renderBody();};
  bindNav();
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
      ${d.exercises.map((ex,i)=>`
        <section class="exercise-card" data-exercise="${i}">
          <h2>${ex.name}</h2>
          <div class="target">Objetivo: ${ex.target} · RIR 3–4</div>
          ${last?.exercises?.[i]?`<div class="last-session"><strong>Última vez:</strong> ${last.exercises[i].series.map(x=>{
            const s=normalizeSeries(x);
            return s.weight||s.reps?`${s.warmup?"Cal. ":""}${s.weight||"—"} × ${s.reps||"—"}${s.rir!==""?` · RIR ${s.rir}`:""}`:"—";
          }).join(" · ")}</div>`:""}
          ${(()=>{
            const rec=exerciseRecommendation(last?.exercises?.[i],ex.target,ex.increment,ex.type);
            const record=recordStats(ex.name);
            return `<div class="recommendation ${rec.status}">
              <div class="recommendation-label">Recomendación</div>
              <strong>${rec.title}</strong>
              <span>${rec.text}</span>
              ${record?`<small class="recommendation-record">Récord: ${formatWeight(record.maxWeight.weight)} kg · e1RM ${formatWeight(Math.round(record.bestE1rm.e1rm*10)/10)} kg</small>`:""}
            </div>`;
          })()}
          <div class="series-header series-header-v18"><span></span><span>Peso</span><span>Reps</span><span>RIR</span><span>Cal.</span><span>Hecha</span></div>
          ${ex.series.map((x,j)=>`
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
        </section>`).join("")}
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
    card.querySelectorAll("[data-warmup]").forEach(inp=>inp.onchange=()=>{
      const draft=getDraft(s),j=Number(inp.dataset.warmup);
      draft.exercises[i].series[j].warmup=inp.checked; saveDraft(draft); renderWorkout();
    });
    card.querySelectorAll("[data-done]").forEach(btn=>btn.onclick=()=>{
      const draft=getDraft(s),j=Number(btn.dataset.done);
      draft.exercises[i].series[j].done=!draft.exercises[i].series[j].done;
      saveDraft(draft); if(draft.exercises[i].series[j].done) startTimer(getRestSeconds()); renderWorkout();
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
  document.getElementById("backHome").onclick=()=>{state.screen="home";renderHome();};
  document.getElementById("finishWorkout").onclick=finishWorkout;
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

function renderSettings(){
  app.innerHTML=`<div class="app-shell">
    <header class="topbar"><div><div class="brand">Ajustes</div><div class="subtle">GymOS v2.0 · Local-first y sincronización</div></div></header>
    <main class="screen">
      <section class="card sync-card">
        <div class="card-heading-row">
          <div><h2>Sincronización</h2><p class="subtle">${syncStatusLabel()}</p></div>
          <span class="sync-dot ${state.syncStatus}"></span>
        </div>
        <p class="subtle">Opcional. GymOS seguirá funcionando sin cuenta y sin conexión.</p>
        <div class="sync-fields">
          <label><span>Supabase Project URL</span><input id="syncUrl" type="url" value="${getSyncConfig().url}" placeholder="https://xxxxx.supabase.co"></label>
          <label><span>Anon public key</span><input id="syncKey" type="password" value="${getSyncConfig().key}" placeholder="eyJ..."></label>
          <label><span>Correo</span><input id="syncEmail" type="email" value="${getSyncConfig().email}" placeholder="tu@email.com"></label>
        </div>
        <div class="settings-actions">
          <button id="saveSyncConfig" class="secondary">Guardar configuración</button>
          ${state.syncUser
            ?`<button id="syncNow" class="primary">Sincronizar ahora</button><button id="signOutSync" class="secondary">Cerrar sesión</button>`
            :`<button id="sendMagicLink" class="primary">Enviar enlace de acceso</button>`}
        </div>
        ${state.syncUser?`<div class="sync-user">Conectado como <strong>${state.syncUser.email||"usuario"}</strong></div>`:""}
        <details class="sync-help">
          <summary>Cómo configurarlo</summary>
          <p>Ejecuta el archivo <strong>supabase-schema.sql</strong> en tu proyecto de Supabase. Usa únicamente la clave <strong>anon public</strong>, nunca la service role.</p>
        </details>
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
        <h2>Rutina desde Excel</h2>
        <p class="subtle">Descarga la plantilla, modifícala y vuelve a importarla. El historial anterior no se borra.</p>
        <div class="settings-actions">
          <a class="primary download-link" href="plantilla-rutina-gymos.xlsx" download>Descargar plantilla Excel</a>
          <button id="importRoutine" class="secondary">Importar rutina Excel</button>
          <button id="exportRoutine" class="secondary">Exportar rutina actual</button>
        </div>
        <div id="routinePreview"></div>
      </section>
      <section class="card">
        <h2>Copia de seguridad</h2>
        <p class="subtle">Exporta tus entrenamientos a un archivo y podrás recuperarlos en este u otro móvil.</p>
        <div class="settings-actions">
          <button id="exportData" class="primary">Exportar copia</button>
          <button id="importData" class="secondary">Importar copia</button>
        </div>
      </section>
      <section class="card">
        <h2>Eliminar datos</h2>
        <p class="subtle">Esta acción borra el historial y las sesiones en curso de este dispositivo.</p>
        <button id="deleteData" class="danger full">Borrar todos los datos</button>
      </section>
    </main>${nav("settings")}
  </div>`;
  document.getElementById("saveSyncConfig").onclick=async()=>{
    saveSyncConfig({
      url:document.getElementById("syncUrl").value,
      key:document.getElementById("syncKey").value,
      email:document.getElementById("syncEmail").value
    });
    await refreshSyncSession();
    toast("Configuración guardada");
    renderSettings();
  };
  const magicButton=document.getElementById("sendMagicLink");
  if(magicButton) magicButton.onclick=async()=>{
    try{
      const email=document.getElementById("syncEmail").value.trim();
      if(!email){alert("Introduce tu correo.");return;}
      saveSyncConfig({
        url:document.getElementById("syncUrl").value,
        key:document.getElementById("syncKey").value,
        email
      });
      await sendMagicLink(email);
      alert("Te hemos enviado un enlace de acceso. Ábrelo desde este dispositivo y vuelve a GymOS.");
    }catch(error){
      alert("No se pudo enviar el enlace: "+error.message);
    }
  };
  const syncButton=document.getElementById("syncNow");
  if(syncButton) syncButton.onclick=async()=>{
    syncButton.disabled=true;
    syncButton.textContent="Sincronizando…";
    try{
      const result=await syncNow();
      toast(result==="downloaded"?"Datos remotos descargados":"Datos sincronizados");
      renderSettings();
    }catch(error){
      alert("No se pudo sincronizar: "+error.message);
      syncButton.disabled=false;
      syncButton.textContent="Sincronizar ahora";
    }
  };
  const signOutButton=document.getElementById("signOutSync");
  if(signOutButton) signOutButton.onclick=async()=>{
    await signOutSync();
    toast("Sesión cerrada");
    renderSettings();
  };
  document.getElementById("openPlanSettings").onclick=()=>{state.screen="plan";renderPlan();};
  document.querySelectorAll("[data-rest-setting]").forEach(button=>button.onclick=()=>{
    saveRestSeconds(Number(button.dataset.restSetting));
    toast("Descanso actualizado");
    renderSettings();
  });
  document.getElementById("openBodySettings").onclick=()=>{state.screen="body";renderBody();};
  document.getElementById("importRoutine").onclick=()=>{
    if(typeof XLSX==="undefined"){
      alert("No se ha podido cargar el lector de Excel. Abre GymOS con conexión a Internet y vuelve a intentarlo.");
      return;
    }
    routineFile.click();
  };
  document.getElementById("exportRoutine").onclick=exportRoutine;
  document.getElementById("exportData").onclick=exportData;
  document.getElementById("importData").onclick=()=>importFile.click();
  document.getElementById("deleteData").onclick=()=>{
    if(!confirm("¿Borrar todo el historial y las sesiones guardadas?"))return;
    Object.keys(localStorage).filter(k=>k.startsWith("gymos:")).forEach(k=>localStorage.removeItem(k));
    state.selectedSession="A";toast("Datos eliminados");renderSettings();
  };
  bindNav();
}


function normalizeHeader(value){
  return String(value||"").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/\s+/g," ");
}
function parseRoutineRows(rows){
  const routine={A:[],B:[],C:[]};
  const errors=[];
  rows.forEach((row,index)=>{
    const line=index+2;
    const normalized={};
    Object.entries(row).forEach(([key,value])=>normalized[normalizeHeader(key)]=value);
    const session=String(normalized["sesion"]||"").trim().toUpperCase();
    const name=String(normalized["ejercicio"]||"").trim();
    if(!session&&!name) return;
    if(!["A","B","C"].includes(session)){errors.push(`Fila ${line}: sesión no válida.`);return;}
    if(!name){errors.push(`Fila ${line}: falta el ejercicio.`);return;}
    const order=Number(normalized["orden"]);
    const sets=Number(normalized["series"]);
    const min=Number(normalized["reps min."]??normalized["reps min"]??normalized["reps minima"]);
    const max=Number(normalized["reps max."]??normalized["reps max"]??normalized["reps maxima"]);
    const increment=Number(normalized["incremento kg"]||0);
    const type=String(normalized["tipo"]||"peso").trim().toLowerCase();
    if(!Number.isFinite(order)){errors.push(`Fila ${line}: orden no válido.`);return;}
    if(!Number.isFinite(sets)||sets<1||sets>10){errors.push(`Fila ${line}: series debe estar entre 1 y 10.`);return;}
    if(!Number.isFinite(min)||!Number.isFinite(max)||max<min){errors.push(`Fila ${line}: rango objetivo no válido.`);return;}
    if(!["peso","tiempo","repeticiones","distancia"].includes(type)){errors.push(`Fila ${line}: tipo no válido.`);return;}
    const unit=type==="tiempo"?"s":"reps";
    routine[session].push({name,target:min===max?`${min} ${unit}`:`${min}–${max} ${unit}`,sets,increment:Number.isFinite(increment)?increment:0,type,order});
  });
  Object.keys(routine).forEach(s=>routine[s].sort((a,b)=>a.order-b.order).forEach(x=>delete x.order));
  if(Object.values(routine).every(items=>items.length===0)) errors.push("El archivo no contiene ejercicios válidos.");
  return {routine,errors};
}
function showRoutinePreview(routine,fileName){
  const preview=document.getElementById("routinePreview");
  preview.innerHTML=`<div class="routine-preview">
    <strong>Vista previa: ${fileName}</strong>
    ${["A","B","C"].map(s=>`<div class="preview-session"><span>Sesión ${s}</span><strong>${routine[s].length} ejercicios</strong></div>`).join("")}
    <div class="import-mode">
      <label><input type="radio" name="routineMode" value="all" checked> Sustituir toda la rutina</label>
      <label><input type="radio" name="routineMode" value="A"> Solo sesión A</label>
      <label><input type="radio" name="routineMode" value="B"> Solo sesión B</label>
      <label><input type="radio" name="routineMode" value="C"> Solo sesión C</label>
    </div>
    <button id="confirmRoutineImport" class="primary full">Confirmar importación</button>
  </div>`;
  document.getElementById("confirmRoutineImport").onclick=()=>{
    const mode=document.querySelector('input[name="routineMode"]:checked').value;
    const current=getRoutine();
    if(mode==="all"){
      ["A","B","C"].forEach(s=>{
        if(routine[s].length) current[s]=routine[s];
      });
    }else{
      if(!routine[mode].length){
        alert(`El Excel no contiene ejercicios para la sesión ${mode}.`);
        return;
      }
      current[mode]=routine[mode];
    }
    saveRoutine(current);
    sessions=getRoutine();
    ["A","B","C"].forEach(clearDraft);
    state.selectedStatsExercise=null;
    toast("Rutina actualizada");
    renderSettings();
  };
}
function exportRoutine(){
  if(typeof XLSX==="undefined"){
    alert("No se ha podido cargar el generador de Excel.");
    return;
  }
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
}
routineFile.onchange=async()=>{
  const file=routineFile.files[0];
  if(!file) return;
  try{
    const data=await file.arrayBuffer();
    const workbook=XLSX.read(data,{type:"array"});
    const first=workbook.Sheets[workbook.SheetNames[0]];
    const rows=XLSX.utils.sheet_to_json(first,{defval:""});
    const parsed=parseRoutineRows(rows);
    if(parsed.errors.length){
      alert("No se ha importado la rutina:\n\n"+parsed.errors.slice(0,12).join("\n"));
      return;
    }
    showRoutinePreview(parsed.routine,file.name);
  }catch(error){
    alert("No se ha podido leer el Excel. Comprueba que utilizas la plantilla de GymOS.");
  }finally{
    routineFile.value="";
  }
};

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
refreshSyncSession().finally(()=>render());
