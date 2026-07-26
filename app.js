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
const finishDialog = document.getElementById("finishDialog");
const finishSummary = document.getElementById("finishSummary");

let state = {
  screen: "home",
  selectedSession: localStorage.getItem("gymos:selectedSession") || nextSuggestedSession(),
  workoutStartedAt: null,
  timerSeconds: 0,
  timerRunning: false,
  timerInterval: null
};

function getHistory() {
  return JSON.parse(localStorage.getItem("gymos:history") || "[]");
}

function saveHistory(history) {
  localStorage.setItem("gymos:history", JSON.stringify(history));
}

function nextSuggestedSession() {
  const history = JSON.parse(localStorage.getItem("gymos:history") || "[]");
  if (!history.length) return "A";
  const last = history[0].session;
  return last === "A" ? "B" : last === "B" ? "C" : "A";
}

function draftKey(session) {
  return `gymos:draft:${session}`;
}

function emptyDraft(session) {
  return {
    session,
    startedAt: Date.now(),
    exercises: sessions[session].map(([name, target]) => ({
      name, target,
      series: [1,2,3].map(() => ({weight:"", reps:"", done:false})),
      notes:""
    }))
  };
}

function getDraft(session) {
  return JSON.parse(localStorage.getItem(draftKey(session)) || "null") || emptyDraft(session);
}

function saveDraft(draft) {
  localStorage.setItem(draftKey(draft.session), JSON.stringify(draft));
}

function clearDraft(session) {
  localStorage.removeItem(draftKey(session));
}

function lastWorkoutForSession(session) {
  return getHistory().find(w => w.session === session);
}

function formatDuration(ms) {
  const totalMin = Math.max(1, Math.round(ms / 60000));
  return `${totalMin} min`;
}

function render() {
  if (state.screen === "home") renderHome();
  else renderWorkout();
}

function renderHome() {
  const history = getHistory();
  const last = history[0];
  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div>
          <div class="brand">GymOS</div>
          <div class="subtle">Tu entrenamiento, sin ruido</div>
        </div>
      </header>

      <main class="screen">
        <section class="hero">
          <div class="hero-label">Hoy toca</div>
          <h1>Sesión ${state.selectedSession}</h1>
          <p>${sessions[state.selectedSession].length} ejercicios · RIR 3–4</p>
          <button id="startWorkout" class="primary">Comenzar entrenamiento</button>
        </section>

        <div class="session-picker">
          ${["A","B","C"].map(s => `<button data-session="${s}" class="${s===state.selectedSession?"active":""}">Sesión ${s}</button>`).join("")}
        </div>

        <section class="info-card">
          <h2>Resumen</h2>
          <div class="info-row"><span>Último entrenamiento</span><strong>${last ? `Sesión ${last.session}` : "—"}</strong></div>
          <div class="info-row"><span>Duración</span><strong>${last ? formatDuration(last.durationMs) : "—"}</strong></div>
          <div class="info-row"><span>Entrenamientos guardados</span><strong>${history.length}</strong></div>
        </section>
      </main>
    </div>
  `;

  document.querySelectorAll("[data-session]").forEach(btn => {
    btn.onclick = () => {
      state.selectedSession = btn.dataset.session;
      localStorage.setItem("gymos:selectedSession", state.selectedSession);
      renderHome();
    };
  });

  document.getElementById("startWorkout").onclick = () => {
    const draft = getDraft(state.selectedSession);
    state.workoutStartedAt = draft.startedAt || Date.now();
    state.screen = "workout";
    renderWorkout();
  };
}

function renderWorkout() {
  const session = state.selectedSession;
  const draft = getDraft(session);
  const last = lastWorkoutForSession(session);

  app.innerHTML = `
    <div class="app-shell">
      <main class="screen">
        <div class="workout-header">
          <div class="workout-title-row">
            <div>
              <div class="subtle">Entrenamiento activo</div>
              <h1>Sesión ${session}</h1>
            </div>
            <button id="timerChip" class="timer-chip">${state.timerSeconds ? formatTimer(state.timerSeconds) : "Descanso"}</button>
          </div>
        </div>

        ${draft.exercises.map((ex, i) => `
          <section class="exercise-card" data-exercise="${i}">
            <h2>${ex.name}</h2>
            <div class="target">Objetivo: ${ex.target} · RIR 3–4</div>
            ${last ? `<div class="last-session"><strong>Última vez:</strong> ${last.exercises[i].series.map(s => s.weight || s.reps ? `${s.weight || "—"} × ${s.reps || "—"}` : "—").join(" · ")}</div>` : ""}
            <div class="series-header"><span></span><span>Peso</span><span>Reps</span><span>Hecha</span></div>
            ${ex.series.map((s, j) => `
              <div class="series-row">
                <div class="series-number">${j+1}</div>
                <input inputmode="decimal" data-field="weight" data-series="${j}" value="${s.weight}" placeholder="kg">
                <input inputmode="numeric" data-field="reps" data-series="${j}" value="${s.reps}" placeholder="reps">
                <button class="complete-btn ${s.done?"done":""}" data-done="${j}">${s.done?"✓":""}</button>
              </div>
            `).join("")}
            <textarea data-notes="${i}" placeholder="Notas">${ex.notes || ""}</textarea>
          </section>
        `).join("")}
      </main>

      <div id="timerPanel" class="timer-panel hidden">
        <div class="timer-main">
          <div>
            <div class="subtle">Descanso</div>
            <div id="timerValue" class="timer-value">${formatTimer(state.timerSeconds)}</div>
          </div>
          <button id="closeTimer" class="icon-btn">×</button>
        </div>
        <div class="timer-actions">
          <button class="secondary" data-time="60">60 s</button>
          <button class="secondary" data-time="90">90 s</button>
          <button class="secondary" data-time="120">120 s</button>
        </div>
      </div>

      <footer class="sticky-actions">
        <div class="sticky-actions-inner">
          <button id="backHome" class="secondary">Salir</button>
          <button id="finishWorkout" class="primary">Finalizar</button>
        </div>
      </footer>
    </div>
  `;

  document.querySelectorAll("[data-exercise]").forEach(card => {
    const i = Number(card.dataset.exercise);
    card.querySelectorAll("input[data-field]").forEach(input => {
      input.oninput = () => {
        const d = getDraft(session);
        const j = Number(input.dataset.series);
        d.exercises[i].series[j][input.dataset.field] = input.value;
        saveDraft(d);
      };
    });
    card.querySelectorAll("[data-done]").forEach(btn => {
      btn.onclick = () => {
        const d = getDraft(session);
        const j = Number(btn.dataset.done);
        d.exercises[i].series[j].done = !d.exercises[i].series[j].done;
        saveDraft(d);
        if (d.exercises[i].series[j].done) startTimer(90);
        renderWorkout();
      };
    });
  });

  document.querySelectorAll("[data-notes]").forEach(area => {
    area.oninput = () => {
      const d = getDraft(session);
      d.exercises[Number(area.dataset.notes)].notes = area.value;
      saveDraft(d);
    };
  });

  document.getElementById("backHome").onclick = () => {
    state.screen = "home";
    renderHome();
  };

  document.getElementById("finishWorkout").onclick = finishWorkout;
  document.getElementById("timerChip").onclick = () => document.getElementById("timerPanel").classList.remove("hidden");
  document.getElementById("closeTimer").onclick = () => document.getElementById("timerPanel").classList.add("hidden");
  document.querySelectorAll("[data-time]").forEach(btn => btn.onclick = () => startTimer(Number(btn.dataset.time)));
}

function startTimer(seconds) {
  clearInterval(state.timerInterval);
  state.timerSeconds = seconds;
  state.timerRunning = true;
  const panel = document.getElementById("timerPanel");
  if (panel) panel.classList.remove("hidden");
  updateTimerUI();

  state.timerInterval = setInterval(() => {
    state.timerSeconds -= 1;
    updateTimerUI();
    if (state.timerSeconds <= 0) {
      clearInterval(state.timerInterval);
      state.timerRunning = false;
      if (navigator.vibrate) navigator.vibrate([200,100,200]);
    }
  }, 1000);
}

function updateTimerUI() {
  const value = document.getElementById("timerValue");
  const chip = document.getElementById("timerChip");
  if (value) value.textContent = formatTimer(state.timerSeconds);
  if (chip) chip.textContent = state.timerSeconds ? formatTimer(state.timerSeconds) : "Descanso";
}

function formatTimer(seconds) {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2,"0");
  return `${m}:${s}`;
}

function finishWorkout() {
  const session = state.selectedSession;
  const draft = getDraft(session);
  const completedSeries = draft.exercises.reduce((n, ex) => n + ex.series.filter(s => s.done).length, 0);
  const durationMs = Date.now() - (draft.startedAt || state.workoutStartedAt || Date.now());

  const workout = {
    id: Date.now(),
    date: new Date().toISOString(),
    session,
    durationMs,
    completedSeries,
    exercises: draft.exercises
  };

  const history = getHistory();
  history.unshift(workout);
  saveHistory(history);
  clearDraft(session);

  state.selectedSession = session === "A" ? "B" : session === "B" ? "C" : "A";
  localStorage.setItem("gymos:selectedSession", state.selectedSession);
  state.screen = "home";
  clearInterval(state.timerInterval);
  state.timerSeconds = 0;

  finishSummary.textContent = `Sesión ${session} guardada · ${completedSeries} series completadas · ${formatDuration(durationMs)}.`;
  finishDialog.showModal();
  renderHome();
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js");
}

render();
