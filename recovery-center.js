(function(){
  "use strict";

  const STORAGE_KEY="gymos:dailyRecovery";
  const CHECKINS_KEY="gymos:recoveryCheckins";
  const PROVIDERS=["manual","apple_health","google_fit","garmin","polar","whoop","oura","fitbit"];
  const providerAdapters=new Map();
  const sleepOptions=[
    {value:4.5,label:"<5"},
    {value:5.5,label:"5–6"},
    {value:6.5,label:"6–7"},
    {value:7.5,label:"7–8"},
    {value:8.5,label:"8+"}
  ];
  const scaleLabels={
    sleepQuality:["Muy mala","Mala","Normal","Buena","Muy buena"],
    energy:["Muy baja","Baja","Normal","Alta","Muy alta"],
    fatigue:["Ninguna","Ligera","Moderada","Alta","Muy alta"],
    stress:["Muy bajo","Bajo","Normal","Alto","Muy alto"],
    painLevel:["Ninguna","Leves","Moderadas","Importantes"],
    motivation:["Muy baja","Baja","Normal","Alta","Muy alta"]
  };
  const painLocations=["Hombro","Espalda","Rodilla","Cadera","Codo","Muñeca","Tobillo","Otro"];

  function getEntries(){
    try{
      const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]");
      return Array.isArray(value)?value.map(normalizeEntry).sort((a,b)=>a.date.localeCompare(b.date)):[];
    }catch(error){
      return [];
    }
  }
  function normalizeEntry(entry){
    return {
      id:entry.id||`recovery-${entry.date}`,
      date:String(entry.date||""),
      sleepHours:Number(entry.sleepHours??entry.sleep_hours??0),
      sleepQuality:Number(entry.sleepQuality??entry.sleep_quality??0),
      energy:Number(entry.energy??0),
      fatigue:Number(entry.fatigue??0),
      stress:Number(entry.stress??0),
      motivation:Number(entry.motivation??3),
      painLevel:Number(entry.painLevel??entry.pain_level??0),
      painLocation:Array.isArray(entry.painLocation??entry.pain_location)
        ?(entry.painLocation??entry.pain_location)
        :entry.painLocation||entry.pain_location?[entry.painLocation||entry.pain_location]:[],
      recoveryScore:Number(entry.recoveryScore??entry.recovery_score??0),
      coachMessage:String((entry.coachMessage??entry.coach_message)||""),
      notes:String(entry.notes||""),
      workoutId:String(entry.workoutId??entry.workout_id??""),
      checkinId:String(entry.checkinId??entry.checkin_id??""),
      source:String(entry.source||"manual"),
      createdAt:entry.createdAt||entry.created_at||new Date().toISOString(),
      updatedAt:entry.updatedAt||entry.updated_at||new Date().toISOString()
    };
  }
  function saveEntries(entries,mark=true){
    const normalized=entries.map(normalizeEntry)
      .filter(entry=>entry.date)
      .sort((a,b)=>a.date.localeCompare(b.date))
      .slice(-730);
    localStorage.setItem(STORAGE_KEY,JSON.stringify(normalized));
    if(mark&&typeof markLocalUpdated==="function") markLocalUpdated();
    return normalized;
  }
  function entryForDate(date){
    return getEntries().find(entry=>entry.date===date)||null;
  }
  function normalizeCheckin(checkin){
    return {
      id:String(checkin.id||`recovery-checkin-${checkin.workoutId??checkin.workout_id}`),
      workoutId:String(checkin.workoutId??checkin.workout_id??""),
      userId:String(checkin.userId??checkin.user_id??""),
      workoutDate:checkin.workoutDate??checkin.workout_date??"",
      availableFrom:String(checkin.availableFrom??checkin.available_from??""),
      status:checkin.status==="completed"?"completed":"pending",
      session:String(checkin.session||""),
      sessionId:String(checkin.sessionId??checkin.session_id??""),
      sessionName:String(checkin.sessionName??checkin.session_name??""),
      completedAt:checkin.completedAt??checkin.completed_at??null,
      createdAt:checkin.createdAt??checkin.created_at??new Date().toISOString(),
      updatedAt:checkin.updatedAt??checkin.updated_at??new Date().toISOString()
    };
  }
  function getCheckins(){
    try{
      const value=JSON.parse(localStorage.getItem(CHECKINS_KEY)||"[]");
      return Array.isArray(value)?value.map(normalizeCheckin):[];
    }catch(error){return [];}
  }
  function saveCheckins(checkins,mark=true){
    const normalized=checkins.map(normalizeCheckin).filter(checkin=>checkin.workoutId);
    localStorage.setItem(CHECKINS_KEY,JSON.stringify(normalized.slice(-500)));
    if(mark&&typeof markLocalUpdated==="function") markLocalUpdated();
    return normalized;
  }
  function mergeCheckins(incoming,mark=false){
    const merged=new Map(getCheckins().map(checkin=>[checkin.id,checkin]));
    (incoming||[]).map(normalizeCheckin).forEach(checkin=>{
      const current=merged.get(checkin.id);
      if(!current||new Date(checkin.updatedAt)>=new Date(current.updatedAt)) merged.set(checkin.id,checkin);
    });
    return saveCheckins([...merged.values()],mark);
  }
  function nextLocalDate(value){
    const date=new Date(value);
    return dateKey(new Date(date.getFullYear(),date.getMonth(),date.getDate()+1));
  }
  function createPendingCheckin(workout){
    if(!workout?.id||!workout?.date) return null;
    const checkin=normalizeCheckin({
      id:`recovery-checkin-${workout.id}`,
      workoutId:String(workout.id),
      userId:state.syncUser?.id||"",
      workoutDate:workout.date,
      availableFrom:nextLocalDate(workout.date),
      status:"pending",
      session:workout.session,
      sessionId:workout.sessionId||"",
      sessionName:workout.sessionName||"",
      createdAt:new Date().toISOString(),
      updatedAt:new Date().toISOString()
    });
    mergeCheckins([checkin],true);
    syncWithSupabase();
    return checkin;
  }
  function dueCheckin(referenceDate=dateKey(new Date())){
    return getCheckins()
      .filter(checkin=>checkin.status==="pending"&&checkin.availableFrom===referenceDate)
      .sort((a,b)=>a.workoutDate.localeCompare(b.workoutDate))[0]||null;
  }
  function upcomingCheckin(referenceDate=dateKey(new Date())){
    return getCheckins()
      .filter(checkin=>checkin.status==="pending"&&dateKey(new Date(checkin.workoutDate))===referenceDate&&checkin.availableFrom>referenceDate)
      .sort((a,b)=>b.workoutDate.localeCompare(a.workoutDate))[0]||null;
  }
  function checkinById(id){return getCheckins().find(checkin=>checkin.id===id)||null;}
  function completeCheckin(id){
    const checkins=getCheckins();
    const index=checkins.findIndex(checkin=>checkin.id===id);
    if(index<0) return null;
    checkins[index]={...checkins[index],status:"completed",completedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    saveCheckins(checkins);
    syncWithSupabase();
    return checkins[index];
  }
  function reminderDismissed(checkin){
    return Boolean(checkin&&localStorage.getItem(`gymos:recovery-reminder:${dateKey(new Date())}:${checkin.id}`));
  }
  function dismissReminder(checkin){
    if(checkin) localStorage.setItem(`gymos:recovery-reminder:${dateKey(new Date())}:${checkin.id}`,"1");
  }
  function startCheckin(checkin){
    state.recoveryCheckinId=checkin?.id||null;
    state.recoveryDraft=draftForToday();
    state.recoveryView="checkin";
    state.screen="recovery";
    renderRecoveryCenter();
  }
  function upsertLocal(entry){
    const entries=getEntries();
    const normalized=normalizeEntry(entry);
    const index=entries.findIndex(item=>item.date===normalized.date);
    if(index>=0){
      normalized.id=entries[index].id;
      normalized.createdAt=entries[index].createdAt;
      entries[index]=normalized;
    }else{
      entries.push(normalized);
    }
    saveEntries(entries);
    return normalized;
  }
  function scoreLabel(score){
    if(score>=85) return "Excelente recuperación";
    if(score>=70) return "Buena recuperación";
    if(score>=55) return "Recuperación moderada";
    if(score>=40) return "Recuperación baja";
    return "Recuperación muy baja";
  }
  function calculateScore(input){
    let score=100;
    if(input.sleepHours<5) score-=30;
    else if(input.sleepHours<6) score-=22;
    else if(input.sleepHours<7) score-=12;
    else if(input.sleepHours<8) score-=4;
    score-=(5-input.sleepQuality)*5;
    score-=(5-input.energy)*6;
    score-=input.fatigue*8;
    score-=(input.stress-1)*5;
    score-=(5-input.motivation)*3;
    score-=input.painLevel*10;
    return Math.max(0,Math.min(100,Math.round(score)));
  }
  function coachRecommendation(score,input){
    if(score>=85&&input.fatigue<=1&&input.painLevel<=1){
      return input.energy>=4
        ?"Mantén el entrenamiento previsto. Si la técnica se mantiene estable, puedes intentar progresar ligeramente en cargas."
        :"Mantén el entrenamiento previsto y utiliza el calentamiento para ajustar la carga.";
    }
    if(score>=70) return "Puedes entrenar según lo previsto. Conserva margen y controla el esfuerzo de las últimas series.";
    if(score>=55) return "Entrena, pero evita llegar al fallo y prioriza una ejecución estable.";
    if(score>=40) return "Considera reducir una serie por ejercicio y mantener cargas cómodas.";
    if(input.painLevel>=2) return "Hoy conviene priorizar movilidad suave y evitar los movimientos que resulten incómodos.";
    return "Una sesión muy ligera o un día de descanso puede ayudarte a volver con mejores sensaciones.";
  }
  function resultDetails(entry){
    const lines=[];
    if(entry.sleepHours>=7.5) lines.push("Dormiste bien.");
    else if(entry.sleepHours>=6) lines.push("El sueño fue algo más corto de lo ideal.");
    else lines.push("Has dormido menos de seis horas.");
    if(entry.energy>=4) lines.push("Tu energía es alta.");
    else if(entry.energy<=2) lines.push("Tu energía está más baja de lo habitual.");
    else lines.push("Tu energía es estable.");
    if(entry.fatigue<=1) lines.push("La fatiga muscular es baja.");
    else if(entry.fatigue>=3) lines.push("Notas bastante fatiga muscular.");
    if(entry.motivation<=2) lines.push("La motivación está más baja de lo habitual.");
    if(entry.painLevel===0) lines.push("No aparecen molestias importantes.");
    else if(entry.painLevel===1) lines.push("Has registrado molestias leves.");
    else lines.push(`Has registrado molestias en ${entry.painLocation.length?entry.painLocation.join(", ").toLocaleLowerCase("es"):"alguna zona"}.`);
    return lines.slice(0,3);
  }
  function analyzeSignals(entries=getEntries()){
    const recent=entries.slice(-7);
    const signals=[];
    if(recent.slice(-3).length===3&&recent.slice(-3).every(entry=>entry.fatigue>=3)){
      signals.push("La fatiga lleva varios días alta. Puede ser útil moderar el volumen.");
    }
    if(recent[0]&&recent.at(-1).sleepHours<6){
      signals.push("El último descanso registrado fue inferior a seis horas.");
    }
    if(recent.slice(-3).length===3&&recent.slice(-3).filter(entry=>entry.stress>=4).length>=2){
      signals.push("El estrés ha estado elevado varios días. Ajusta el esfuerzo según tus sensaciones.");
    }
    const painCounts={};
    recent.forEach(entry=>entry.painLocation.forEach(location=>{
      painCounts[location]=(painCounts[location]||0)+1;
    }));
    const repeatedPain=Object.entries(painCounts).sort((a,b)=>b[1]-a[1]).find(([,count])=>count>=2);
    if(repeatedPain){
      signals.push(`Has señalado molestias en ${repeatedPain[0].toLocaleLowerCase("es")} más de una vez. Evita forzar esa zona.`);
    }
    return signals.slice(0,3);
  }
  function createEntry(draft){
    const now=new Date().toISOString();
    const linkedCheckin=state.recoveryCheckinId?checkinById(state.recoveryCheckinId):null;
    const base={
      id:`recovery-${draft.date}`,
      date:draft.date,
      sleepHours:Number(draft.sleepHours),
      sleepQuality:Number(draft.sleepQuality),
      energy:Number(draft.energy),
      fatigue:Number(draft.fatigue),
      stress:Number(draft.stress),
      motivation:Number(draft.motivation),
      painLevel:Number(draft.painLevel),
      painLocation:Number(draft.painLevel)>0?[...(draft.painLocation||[])]:[],
      workoutId:linkedCheckin?.workoutId||"",
      checkinId:linkedCheckin?.id||"",
      notes:String(draft.notes||"").trim(),
      source:"manual",
      createdAt:now,
      updatedAt:now
    };
    const recoveryScore=calculateScore(base);
    return {...base,recoveryScore,coachMessage:coachRecommendation(recoveryScore,base)};
  }
  function remoteRow(entry){
    return {
      user_id:state.syncUser.id,
      date:entry.date,
      sleep_hours:entry.sleepHours,
      sleep_quality:entry.sleepQuality,
      energy:entry.energy,
      fatigue:entry.fatigue,
      stress:entry.stress,
      motivation:entry.motivation,
      pain_level:entry.painLevel,
      pain_location:entry.painLocation,
      recovery_score:entry.recoveryScore,
      coach_message:entry.coachMessage,
      notes:entry.notes,
      workout_id:entry.workoutId||null,
      checkin_id:entry.checkinId||null,
      source:entry.source,
      updated_at:entry.updatedAt
    };
  }
  async function syncWithSupabase(){
    if(typeof isAppAuthenticated!=="function"||!isAppAuthenticated()) return {status:"local"};
    const client=getSupabaseClient();
    if(!client) return {status:"local"};
    try{
      const {data,error}=await client.from("daily_recovery")
        .select("id,date,sleep_hours,sleep_quality,energy,fatigue,stress,motivation,pain_level,pain_location,recovery_score,coach_message,notes,workout_id,checkin_id,source,created_at,updated_at")
        .eq("user_id",state.syncUser.id)
        .order("date",{ascending:true});
      if(error) throw error;
      const merged=new Map();
      [...(data||[]).map(normalizeEntry),...getEntries()].forEach(entry=>{
        const current=merged.get(entry.date);
        if(!current||new Date(entry.updatedAt)>=new Date(current.updatedAt)) merged.set(entry.date,entry);
      });
      const entries=saveEntries([...merged.values()],false);
      if(entries.length){
        const {error:writeError}=await client.from("daily_recovery")
          .upsert(entries.map(remoteRow),{onConflict:"user_id,date"});
        if(writeError) throw writeError;
      }
      const {data:remoteCheckins,error:checkinsError}=await client.from("recovery_checkins")
        .select("id,workout_id,user_id,workout_date,available_from,status,session,completed_at,created_at,updated_at")
        .eq("user_id",state.syncUser.id);
      if(checkinsError) throw checkinsError;
      const remoteCheckinMap=new Map((remoteCheckins||[]).map(checkin=>[String(checkin.id),checkin]));
      const checkins=mergeCheckins(remoteCheckins||[],false);
      if(checkins.length){
        const pendingWrites=checkins.filter(checkin=>{
          const remote=remoteCheckinMap.get(checkin.id);
          return !remote||new Date(checkin.updatedAt)>new Date(remote.updated_at);
        });
        const {error:writeCheckinsError}=pendingWrites.length
          ?await client.from("recovery_checkins").upsert(pendingWrites.map(checkin=>({
          id:checkin.id,user_id:state.syncUser.id,workout_id:checkin.workoutId,
          workout_date:checkin.workoutDate,available_from:checkin.availableFrom,
          status:checkin.status,session:checkin.session,completed_at:checkin.completedAt,
          updated_at:checkin.updatedAt
        })),{onConflict:"id"})
          :{error:null};
        if(writeCheckinsError) throw writeCheckinsError;
      }
      return {status:"synced",count:entries.length,checkins:checkins.length};
    }catch(error){
      console.warn("Recovery Center sync unavailable",error);
      return {status:"error",error};
    }
  }
  async function saveEntry(entry){
    const saved=upsertLocal(entry);
    syncWithSupabase();
    if(typeof autoSync==="function") autoSync("recovery check-in");
    return saved;
  }
  function registerProvider(key,adapter){
    if(!PROVIDERS.includes(key)||key==="manual") throw new Error("Proveedor de recuperación no compatible.");
    if(!adapter||typeof adapter.readDaily!=="function") throw new Error("El proveedor debe implementar readDaily(date).");
    providerAdapters.set(key,adapter);
  }
  async function importFromProvider(key,date=dateKey(new Date())){
    const adapter=providerAdapters.get(key);
    if(!adapter) throw new Error("El proveedor de recuperación todavía no está conectado.");
    const imported=await adapter.readDaily(date);
    const entry=createEntry({...imported,date});
    entry.source=key;
    return saveEntry(entry);
  }
  function draftForToday(){
    const today=dateKey(new Date());
    const existing=entryForDate(today);
    return existing?{
      date:today,
      sleepHours:existing.sleepHours,
      sleepQuality:existing.sleepQuality,
      energy:existing.energy,
      fatigue:existing.fatigue,
      stress:existing.stress,
      motivation:existing.motivation,
      painLevel:existing.painLevel,
      painLocation:[...existing.painLocation],
      notes:existing.notes||""
    }:{
      date:today,sleepHours:null,sleepQuality:null,energy:null,fatigue:null,stress:null,motivation:null,painLevel:null,painLocation:[],notes:""
    };
  }
  function validateDraft(draft){
    const required=["sleepHours","sleepQuality","energy","fatigue","stress","motivation","painLevel"];
    if(required.some(field=>draft[field]===null||draft[field]===undefined||draft[field]==="")){
      return "Completa todas las preguntas para calcular tu recuperación.";
    }
    if(Number(draft.painLevel)>0&&!draft.painLocation.length){
      return "Indica dónde notas las molestias.";
    }
    return "";
  }
  function optionGroup(name,options,current){
    return `<div class="recovery-option-grid ${options.length===4?"four-options":""}">
      ${options.map(option=>{
        const value=typeof option==="object"?option.value:option[0];
        const label=typeof option==="object"?option.label:option[1];
        return `<label><input type="radio" name="${name}" value="${value}" ${Number(current)===Number(value)?"checked":""}><span>${esc(label)}</span></label>`;
      }).join("")}
    </div>`;
  }
  function renderCheckin(){
    const draft=state.recoveryDraft||draftForToday();
    const linkedCheckin=state.recoveryCheckinId?checkinById(state.recoveryCheckinId):null;
    const workoutDay=linkedCheckin?dateKey(new Date(linkedCheckin.workoutDate)):null;
    const yesterday=new Date();
    yesterday.setDate(yesterday.getDate()-1);
    const workoutWhen=workoutDay===dateKey(yesterday)
      ?"Realizada ayer"
      :linkedCheckin?`Realizada el ${new Date(linkedCheckin.workoutDate).toLocaleDateString("es-ES",{day:"numeric",month:"long"})}`:"";
    state.recoveryDraft=draft;
    app.innerHTML=`<div class="app-shell">
      <header class="topbar recovery-topbar"><div><div class="brand">Recovery Center</div><div class="subtle">Check-in diario · menos de 30 segundos</div></div><button id="closeRecovery" class="text-button">Cerrar</button></header>
      <main class="screen recovery-screen">
        ${linkedCheckin?`<section class="recovery-workout-context"><span class="section-kicker">EVALUACIÓN PENDIENTE</span><h1>Recuperación de ${esc(linkedCheckin.sessionName||`Sesión ${linkedCheckin.session}`)}</h1><p>${esc(workoutWhen)}</p></section>`:""}
        <form id="recoveryCheckinForm" class="recovery-checkin">
          <section class="recovery-question">
            <span class="section-kicker">1 DE 8</span><h2>¿Cuántas horas has dormido?</h2>
            ${optionGroup("sleepHours",sleepOptions,draft.sleepHours)}
          </section>
          <section class="recovery-question">
            <span class="section-kicker">2 DE 8</span><h2>Calidad del sueño</h2>
            ${optionGroup("sleepQuality",scaleLabels.sleepQuality.map((label,index)=>[index+1,label]),draft.sleepQuality)}
          </section>
          <section class="recovery-question">
            <span class="section-kicker">3 DE 8</span><h2>Energía</h2>
            ${optionGroup("energy",scaleLabels.energy.map((label,index)=>[index+1,label]),draft.energy)}
          </section>
          <section class="recovery-question">
            <span class="section-kicker">4 DE 8</span><h2>Fatiga muscular</h2>
            ${optionGroup("fatigue",scaleLabels.fatigue.map((label,index)=>[index,label]),draft.fatigue)}
          </section>
          <section class="recovery-question">
            <span class="section-kicker">5 DE 8</span><h2>Estrés</h2>
            ${optionGroup("stress",scaleLabels.stress.map((label,index)=>[index+1,label]),draft.stress)}
          </section>
          <section class="recovery-question">
            <span class="section-kicker">6 DE 8</span><h2>Dolor muscular o molestias</h2>
            ${optionGroup("painLevel",scaleLabels.painLevel.map((label,index)=>[index,label]),draft.painLevel)}
            <div id="painLocationPanel" class="pain-location-panel ${Number(draft.painLevel)>0?"":"hidden"}">
              <span>¿Dónde lo notas?</span>
              <div class="pain-location-grid">
                ${painLocations.map(location=>`<label><input type="checkbox" name="painLocation" value="${location}" ${draft.painLocation.includes(location)?"checked":""}><span>${location}</span></label>`).join("")}
              </div>
            </div>
          </section>
          <section class="recovery-question">
            <span class="section-kicker">7 DE 8</span><h2>Motivación para entrenar</h2>
            ${optionGroup("motivation",scaleLabels.motivation.map((label,index)=>[index+1,label]),draft.motivation)}
          </section>
          <section class="recovery-question">
            <span class="section-kicker">8 DE 8</span><h2>Notas</h2>
            <p>Opcional. Añade cualquier contexto que pueda ayudar al Coach.</p>
            <textarea id="recoveryNotes" rows="3" maxlength="500" placeholder="Sensaciones, descanso, molestias...">${esc(draft.notes||"")}</textarea>
          </section>
          <div id="recoveryFormMessage" class="inline-message hidden" role="alert"></div>
          <button class="primary full recovery-submit" type="submit">Calcular Recovery Score</button>
        </form>
      </main>
    </div>`;
    document.getElementById("closeRecovery").onclick=()=>{state.recoveryView="overview";state.screen="home";renderHome();};
    document.querySelectorAll('input[type="radio"]').forEach(input=>input.onchange=event=>{
      state.recoveryDraft[event.target.name]=Number(event.target.value);
      if(event.target.name==="painLevel"){
        const visible=Number(event.target.value)>0;
        document.getElementById("painLocationPanel").classList.toggle("hidden",!visible);
        if(!visible){
          state.recoveryDraft.painLocation=[];
          document.querySelectorAll('[name="painLocation"]').forEach(item=>item.checked=false);
        }
      }
    });
    document.querySelectorAll('[name="painLocation"]').forEach(input=>input.onchange=()=>{
      state.recoveryDraft.painLocation=[...document.querySelectorAll('[name="painLocation"]:checked')].map(item=>item.value);
    });
    document.getElementById("recoveryCheckinForm").onsubmit=async event=>{
      event.preventDefault();
      state.recoveryDraft.notes=document.getElementById("recoveryNotes").value.trim();
      const message=validateDraft(state.recoveryDraft);
      const messageNode=document.getElementById("recoveryFormMessage");
      if(message){
        messageNode.textContent=message;
        messageNode.classList.remove("hidden");
        return;
      }
      const button=event.submitter;
      button.disabled=true;
      button.textContent="Calculando…";
      const entry=await saveEntry(createEntry(state.recoveryDraft));
      if(state.recoveryCheckinId) completeCheckin(state.recoveryCheckinId);
      state.recoveryResultDate=entry.date;
      state.recoveryCheckinId=null;
      state.recoveryDraft=null;
      state.recoveryView="result";
      renderRecoveryCenter();
    };
  }
  function sevenDaySeries(){
    const entries=new Map(getEntries().map(entry=>[entry.date,entry]));
    const days=[];
    const today=new Date();
    for(let offset=6;offset>=0;offset--){
      const day=new Date(today.getFullYear(),today.getMonth(),today.getDate()-offset);
      const key=dateKey(day);
      days.push({date:key,label:day.toLocaleDateString("es-ES",{weekday:"short"}).replace(".",""),entry:entries.get(key)||null});
    }
    return days;
  }
  function renderHistory(){
    const days=sevenDaySeries();
    const recorded=days.map(day=>day.entry).filter(Boolean);
    const average=field=>{
      const values=recorded.map(entry=>Number(entry[field])).filter(Number.isFinite);
      return values.length?Math.round(values.reduce((sum,value)=>sum+value,0)/values.length):null;
    };
    return `<section class="card recovery-history-card">
      <div class="card-heading-row"><div><h2>Últimos 7 días</h2><p class="subtle">${recorded.length} check-ins registrados</p></div></div>
      <div class="recovery-chart" aria-label="Recovery Score de los últimos siete días">
        ${days.map(day=>`<div class="recovery-chart-day">
          <div class="recovery-chart-track"><span style="height:${day.entry?Math.max(8,day.entry.recoveryScore):4}%" class="${day.entry?"":"empty"}"></span></div>
          <strong>${day.entry?day.entry.recoveryScore:"·"}</strong><small>${day.label}</small>
        </div>`).join("")}
      </div>
      ${recorded.length?`<div class="recovery-averages">
        <div><span>Score</span><strong>${average("recoveryScore")}</strong></div>
        <div><span>Sueño</span><strong>${(recorded.reduce((sum,item)=>sum+item.sleepHours,0)/recorded.length).toFixed(1)} h</strong></div>
        <div><span>Energía</span><strong>${average("energy")} / 5</strong></div>
        <div><span>Fatiga</span><strong>${average("fatigue")} / 4</strong></div>
        <div><span>Estrés</span><strong>${average("stress")} / 5</strong></div>
      </div>`:""}
    </section>`;
  }
  function renderOverview(){
    const today=dateKey(new Date());
    const current=entryForDate(today);
    const resultDate=state.recoveryResultDate||today;
    const result=entryForDate(resultDate);
    const showResult=state.recoveryView==="result"&&result;
    const signals=analyzeSignals();
    const featured=showResult?result:current;
    const pending=dueCheckin(today);
    const upcoming=upcomingCheckin(today);
    const showFeatured=Boolean(featured&&!upcoming);
    app.innerHTML=`<div class="app-shell">
      <header class="topbar recovery-topbar"><div><div class="brand">Recovery Center</div><div class="subtle">Cómo entrenar hoy</div></div><button id="backRecoveryHome" class="text-button">Inicio</button></header>
      <main class="screen recovery-screen">
        ${showFeatured?`<section class="recovery-result ${showResult?"recovery-result-new":""}">
          <span class="section-kicker">RECOVERY SCORE</span>
          <div class="recovery-score-ring ${showResult?"":"animated"}" style="--recovery-score:${featured.recoveryScore}" data-recovery-ring>
            <strong data-recovery-score="${featured.recoveryScore}">${showResult?0:featured.recoveryScore}</strong>
          </div>
          <h1>${scoreLabel(featured.recoveryScore)}</h1>
          <div class="recovery-explanation">${resultDetails(featured).map(line=>`<p>${esc(line)}</p>`).join("")}</div>
          <div class="recovery-coach-message"><span>Recomendación del Coach</span><strong>${esc(featured.coachMessage)}</strong></div>
          <button id="editRecoveryCheckin" class="secondary full">${featured.date===today?"Actualizar check-in":"Registrar recuperación de hoy"}</button>
        </section>`:pending?`<section class="recovery-empty-state">
          <span class="section-kicker">${esc((pending.sessionName||`Sesión ${pending.session}`).toLocaleUpperCase("es"))}</span>
          <h1>¿Cómo has recuperado?</h1>
          <p>Evalúa el sueño posterior a la sesión, la fatiga, la energía, las molestias y el estrés.</p>
          <button id="startRecoveryCheckin" class="primary full">Revisar recuperación</button>
        </section>`:upcoming?`<section class="recovery-empty-state recovery-immediate-guidance">
          <span class="section-kicker">${esc((upcoming.sessionName||`Sesión ${upcoming.session}`).toLocaleUpperCase("es"))} COMPLETADA</span>
          <h1>Ahora toca recuperarte</h1>
          <p>Come bien. Hidrátate. Descansa.</p>
          <small>El check-in de sueño y Recovery Score estará disponible mañana.</small>
        </section>`:`<section class="recovery-empty-state">
          <span class="section-kicker">RECOVERY CENTER</span>
          <h1>No hay evaluaciones pendientes</h1>
          <p>Después de entrenar, el check-in estará disponible al día siguiente.</p>
        </section>`}
        ${signals.length?`<section class="recovery-signals"><h2>Patrones recientes</h2>${signals.map(signal=>`<p>${esc(signal)}</p>`).join("")}</section>`:""}
        ${renderHistory()}
        <p class="recovery-disclaimer">Estas recomendaciones orientan el entrenamiento y no sustituyen una valoración profesional.</p>
      </main>${nav("")}
    </div>`;
    document.getElementById("backRecoveryHome").onclick=()=>{state.recoveryView="overview";state.screen="home";renderHome();};
    const start=document.getElementById("startRecoveryCheckin");
    if(start) start.onclick=()=>startCheckin(pending);
    const edit=document.getElementById("editRecoveryCheckin");
    if(edit) edit.onclick=()=>{state.recoveryDraft=draftForToday();state.recoveryView="checkin";renderRecoveryCenter();};
    if(showResult&&showFeatured){
      const scoreNode=document.querySelector("[data-recovery-score]");
      const ring=document.querySelector("[data-recovery-ring]");
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        ring.classList.add("animated");
        const target=Number(scoreNode.dataset.recoveryScore);
        const startAt=performance.now();
        const draw=timestamp=>{
          const progress=Math.min(1,(timestamp-startAt)/240);
          scoreNode.textContent=Math.round(target*(1-Math.pow(1-progress,3)));
          if(progress<1) requestAnimationFrame(draw);
        };
        if(document.body.classList.contains("reduce-motion")) scoreNode.textContent=target;
        else requestAnimationFrame(draw);
      }));
    }
    bindNav();
  }
  function renderRecoveryCenter(){
    if(state.recoveryView==="checkin") renderCheckin();
    else renderOverview();
  }
  function renderWorkoutComplete(){
    const workout=state.completedWorkoutSummary;
    app.innerHTML=`<div class="app-shell">
      <main class="screen workout-complete-screen">
        <section class="workout-complete-card">
          <span class="section-kicker">SESIÓN COMPLETADA</span>
          <h1>Ahora toca recuperar</h1>
          <p>Come bien, hidrátate y descansa.</p>
          ${workout?`<div class="workout-complete-meta">${esc(workout.sessionName||`Sesión ${workout.session}`)} · ${formatDuration(workout.durationMs)}</div>`:""}
          <button id="reviewRecoveryAfterWorkout" class="primary full">Revisar recuperación</button>
          <div class="workout-complete-links"><button id="viewCompletedWorkout" class="text-button">Ver entrenamiento</button><button id="backHomeAfterWorkout" class="text-button">Volver a Inicio</button></div>
        </section>
      </main>
    </div>`;
    document.getElementById("reviewRecoveryAfterWorkout").onclick=()=>{
      state.recoveryView="overview";
      state.screen="recovery";
      renderRecoveryCenter();
    };
    document.getElementById("viewCompletedWorkout").onclick=()=>{
      state.expandedHistoryId=workout?.id||null;
      state.screen="history";
      renderHistory();
    };
    document.getElementById("backHomeAfterWorkout").onclick=()=>{
      state.screen="home";
      renderHome();
    };
  }

  window.GymOSRecovery=Object.freeze({
    storageKey:STORAGE_KEY,
    providers:PROVIDERS,
    getEntries,
    entryForDate,
    saveEntries,
    getCheckins,
    saveCheckins,
    mergeCheckins,
    createPendingCheckin,
    dueCheckin,
    upcomingCheckin,
    completeCheckin,
    reminderDismissed,
    dismissReminder,
    startCheckin,
    calculateScore,
    scoreLabel,
    resultDetails,
    analyzeSignals,
    coachRecommendation,
    registerProvider,
    importFromProvider,
    syncWithSupabase
  });
  window.renderRecoveryCenter=renderRecoveryCenter;
  window.renderWorkoutComplete=renderWorkoutComplete;
})();
