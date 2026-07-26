const sessions = {
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

const app = document.getElementById("app");
const importFile = document.getElementById("importFile");

let state = {
  screen: "home",
  selectedSession: localStorage.getItem("gymos:selectedSession") || nextSuggestedSession(),
  timerSeconds: 0,
  timerInterval: null,
  expandedHistoryId: null
};

function getHistory(){ return JSON.parse(localStorage.getItem("gymos:history") || "[]"); }
function saveHistory(h){ localStorage.setItem("gymos:history", JSON.stringify(h)); }
function nextSuggestedSession(){
  const h = JSON.parse(localStorage.getItem("gymos:history") || "[]");
  if(!h.length) return "A";
  return h[0].session === "A" ? "B" : h[0].session === "B" ? "C" : "A";
}
function draftKey(s){ return `gymos:draft:${s}`; }
function emptyDraft(s){
  return {
    session:s, startedAt:Date.now(),
    exercises:sessions[s].map(([name,target])=>({
      name,target,series:[1,2,3].map(()=>({weight:"",reps:"",done:false})),notes:""
    }))
  };
}
function getDraft(s){ return JSON.parse(localStorage.getItem(draftKey(s)) || "null") || emptyDraft(s); }
function saveDraft(d){ localStorage.setItem(draftKey(d.session), JSON.stringify(d)); }
function clearDraft(s){ localStorage.removeItem(draftKey(s)); }
function lastWorkoutForSession(s){ return getHistory().find(w=>w.session===s); }
function formatDuration(ms){ return `${Math.max(1,Math.round(ms/60000))} min`; }
function formatDate(iso){
  return new Intl.DateTimeFormat("es-ES",{day:"numeric",month:"long",year:"numeric"}).format(new Date(iso));
}
function nav(active){
  return `<nav class="bottom-nav">
    <button data-nav="home" class="${active==="home"?"active":""}">Inicio</button>
    <button data-nav="history" class="${active==="history"?"active":""}">Historial</button>
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
    </main>${nav("home")}
  </div>`;
  document.querySelectorAll("[data-session]").forEach(b=>b.onclick=()=>{
    state.selectedSession=b.dataset.session;
    localStorage.setItem("gymos:selectedSession",state.selectedSession);
    renderHome();
  });
  document.getElementById("startWorkout").onclick=()=>{state.screen="workout";renderWorkout();};
  bindNav();
}

function renderWorkout(){
  const s=state.selectedSession,d=getDraft(s),last=lastWorkoutForSession(s);
  const done=d.exercises.reduce((n,e)=>n+e.series.filter(x=>x.done).length,0);
  const total=d.exercises.length*3;
  app.innerHTML=`<div class="app-shell">
    <main class="screen">
      <div class="workout-header">
        <div class="workout-title-row">
          <div><div class="subtle">Entrenamiento activo</div><h1>Sesión ${s} · ${done}/${total} series</h1></div>
          <button id="timerChip" class="timer-chip">${state.timerSeconds?formatTimer(state.timerSeconds):"Descanso"}</button>
        </div>
        <div class="progress"><span style="width:${(done/total)*100}%"></span></div>
      </div>
      ${d.exercises.map((ex,i)=>`
        <section class="exercise-card" data-exercise="${i}">
          <h2>${ex.name}</h2>
          <div class="target">Objetivo: ${ex.target} · RIR 3–4</div>
          ${last?`<div class="last-session"><strong>Última vez:</strong> ${last.exercises[i].series.map(x=>x.weight||x.reps?`${x.weight||"—"} × ${x.reps||"—"}`:"—").join(" · ")}</div>`:""}
          <div class="series-header"><span></span><span>Peso</span><span>Reps</span><span>Hecha</span></div>
          ${ex.series.map((x,j)=>`
            <div class="series-row">
              <div class="series-number">${j+1}</div>
              <input inputmode="decimal" data-field="weight" data-series="${j}" value="${x.weight}" placeholder="kg">
              <input inputmode="numeric" data-field="reps" data-series="${j}" value="${x.reps}" placeholder="reps">
              <button class="complete-btn ${x.done?"done":""}" data-done="${j}">${x.done?"✓":""}</button>
            </div>`).join("")}
          <textarea data-notes="${i}" placeholder="Notas">${ex.notes||""}</textarea>
        </section>`).join("")}
    </main>
    <div id="timerPanel" class="timer-panel hidden">
      <div class="timer-main"><div><div class="subtle">Descanso</div><div id="timerValue" class="timer-value">${formatTimer(state.timerSeconds)}</div></div><button id="closeTimer" class="secondary">Cerrar</button></div>
      <div class="timer-actions"><button class="secondary" data-time="60">60 s</button><button class="secondary" data-time="90">90 s</button><button class="secondary" data-time="120">120 s</button></div>
    </div>
    <footer class="sticky-actions"><div class="sticky-actions-inner"><button id="backHome" class="secondary">Salir</button><button id="finishWorkout" class="primary">Finalizar</button></div></footer>
  </div>`;

  document.querySelectorAll("[data-exercise]").forEach(card=>{
    const i=Number(card.dataset.exercise);
    card.querySelectorAll("input[data-field]").forEach(inp=>inp.oninput=()=>{
      const draft=getDraft(s),j=Number(inp.dataset.series);
      draft.exercises[i].series[j][inp.dataset.field]=inp.value; saveDraft(draft);
    });
    card.querySelectorAll("[data-done]").forEach(btn=>btn.onclick=()=>{
      const draft=getDraft(s),j=Number(btn.dataset.done);
      draft.exercises[i].series[j].done=!draft.exercises[i].series[j].done;
      saveDraft(draft); if(draft.exercises[i].series[j].done) startTimer(90); renderWorkout();
    });
  });
  document.querySelectorAll("[data-notes]").forEach(a=>a.oninput=()=>{
    const draft=getDraft(s); draft.exercises[Number(a.dataset.notes)].notes=a.value; saveDraft(draft);
  });
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
  const completed=d.exercises.reduce((n,e)=>n+e.series.filter(x=>x.done).length,0);
  const workout={id:Date.now(),date:new Date().toISOString(),session:s,
    durationMs:Date.now()-(d.startedAt||Date.now()),completedSeries:completed,exercises:d.exercises};
  const h=getHistory();h.unshift(workout);saveHistory(h);clearDraft(s);
  state.selectedSession=s==="A"?"B":s==="B"?"C":"A";
  localStorage.setItem("gymos:selectedSession",state.selectedSession);
  clearInterval(state.timerInterval);state.timerSeconds=0;state.screen="home";renderHome();
  toast(`Sesión ${s} guardada`);
}

function renderHistory(){
  const h=getHistory();
  app.innerHTML=`<div class="app-shell">
    <header class="topbar"><div><div class="brand">Historial</div><div class="subtle">${h.length} entrenamientos</div></div></header>
    <main class="screen">
      ${h.length?h.map(w=>`
        <section class="card" data-history="${w.id}">
          <div class="history-item">
            <div><strong>Sesión ${w.session}</strong><small>${formatDate(w.date)} · ${formatDuration(w.durationMs)} · ${w.completedSeries} series</small></div>
            <div class="chevron">›</div>
          </div>
          ${state.expandedHistoryId===w.id?`<div class="history-detail">
            ${w.exercises.map(e=>`<div class="exercise-summary"><strong>${e.name}</strong><span>${e.series.map(x=>x.weight||x.reps?`${x.weight||"—"} × ${x.reps||"—"}`:"—").join(" · ")}</span>${e.notes?`<small> · ${e.notes}</small>`:""}</div>`).join("")}
          </div>`:""}
        </section>`).join(""):`<div class="empty">Todavía no hay entrenamientos guardados.</div>`}
    </main>${nav("history")}
  </div>`;
  document.querySelectorAll("[data-history]").forEach(c=>c.onclick=()=>{
    const id=Number(c.dataset.history);state.expandedHistoryId=state.expandedHistoryId===id?null:id;renderHistory();
  });
  bindNav();
}

function renderSettings(){
  app.innerHTML=`<div class="app-shell">
    <header class="topbar"><div><div class="brand">Ajustes</div><div class="subtle">Datos y copias</div></div></header>
    <main class="screen">
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
  document.getElementById("exportData").onclick=exportData;
  document.getElementById("importData").onclick=()=>importFile.click();
  document.getElementById("deleteData").onclick=()=>{
    if(!confirm("¿Borrar todo el historial y las sesiones guardadas?"))return;
    Object.keys(localStorage).filter(k=>k.startsWith("gymos:")).forEach(k=>localStorage.removeItem(k));
    state.selectedSession="A";toast("Datos eliminados");renderSettings();
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
    selectedSession:state.selectedSession
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
render();
