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

let currentSession = localStorage.getItem("currentSession") || "A";
const workout = document.getElementById("workout");
const status = document.getElementById("saveStatus");

function storageKey(session, exerciseIndex, field) {
  return `gym:${session}:${exerciseIndex}:${field}`;
}

function saveField(session, exerciseIndex, field, value) {
  localStorage.setItem(storageKey(session, exerciseIndex, field), value);
  status.textContent = "Guardado";
  clearTimeout(window.__saveTimer);
  window.__saveTimer = setTimeout(() => status.textContent = "Guardado automático", 900);
}

function render() {
  workout.innerHTML = "";
  document.querySelectorAll(".tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.session === currentSession);
  });

  sessions[currentSession].forEach(([name, target], exerciseIndex) => {
    const card = document.createElement("section");
    card.className = "exercise";
    card.innerHTML = `
      <h2>${name}</h2>
      <div class="target">Objetivo: ${target} · RIR 3–4</div>
      <div class="series-grid">
        <div></div><div class="head">Peso</div><div class="head">Reps</div>
        ${[1,2,3].map(series => `
          <label>Serie ${series}</label>
          <input inputmode="decimal" placeholder="kg" data-field="s${series}w">
          <input inputmode="numeric" placeholder="reps" data-field="s${series}r">
        `).join("")}
      </div>
      <textarea placeholder="Notas" data-field="notes"></textarea>
    `;

    card.querySelectorAll("[data-field]").forEach(input => {
      const field = input.dataset.field;
      input.value = localStorage.getItem(storageKey(currentSession, exerciseIndex, field)) || "";
      input.addEventListener("input", () => {
        saveField(currentSession, exerciseIndex, field, input.value);
      });
    });

    workout.appendChild(card);
  });
}

document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    currentSession = btn.dataset.session;
    localStorage.setItem("currentSession", currentSession);
    render();
    window.scrollTo({top: 0, behavior: "smooth"});
  });
});

document.getElementById("clearSession").addEventListener("click", () => {
  if (!confirm(`¿Vaciar todos los datos de la sesión ${currentSession}?`)) return;
  sessions[currentSession].forEach((_, exerciseIndex) => {
    ["s1w","s1r","s2w","s2r","s3w","s3r","notes"].forEach(field => {
      localStorage.removeItem(storageKey(currentSession, exerciseIndex, field));
    });
  });
  render();
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js");
}

render();
