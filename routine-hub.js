(function(global){
  "use strict";

  const VIEWS=Object.freeze([
    "overview","active","manual","import","reconfigure","proposal","versions"
  ]);
  const RECONFIGURE_REASONS=Object.freeze([
    ["goal","Objetivo"],
    ["days","Días disponibles"],
    ["duration","Duración de las sesiones"],
    ["equipment","Material disponible"],
    ["limitations","Lesión o limitación"],
    ["preferences","Preferencias de ejercicios"],
    ["performance","Rendimiento o nivel"],
    ["other","Otro motivo"]
  ]);
  let visualState=null,currentOptions=null;

  function text(value){return String(value??"").trim();}
  function list(value){return Array.isArray(value)?value:[];}
  function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
  function presentableFocus(value){
    const normalized=text(value).toLowerCase();
    return ({
      full_body:"Cuerpo completo",upper:"Tren superior",lower:"Tren inferior",
      push:"Empuje",pull:"Tirón",legs:"Piernas",strength:"Fuerza",
      hypertrophy:"Hipertrofia",conditioning:"Acondicionamiento"
    })[normalized]||text(value).replace(/[_-]+/g," ");
  }
  function esc(value){
    return String(value??"").replace(/[&<>"']/g,character=>({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    })[character]);
  }
  function ensureState(ownerId){
    if(!visualState||visualState.ownerId!==ownerId){
      visualState={
        ownerId,view:"overview",selectedSession:0,manual:null,
        reconfigureReasons:[],reconfigureValues:{},replacementCandidate:null,
        activationConfirmation:false,restoreFocusSelector:null,message:null,busy:null
      };
    }
    return visualState;
  }
  function setView(view){
    if(!VIEWS.includes(view)) return;
    visualState.view=view;
    visualState.activationConfirmation=false;
    visualState.message=null;
    refresh();
  }
  function refresh(){currentOptions?.refresh?.();}
  function orderedSessions(routine){
    if(Array.isArray(routine?.sessions)){
      return clone(routine.sessions).sort((a,b)=>
        (Number(a?.order)||999)-(Number(b?.order)||999)||
        text(a?.sessionId).localeCompare(text(b?.sessionId),"en")
      );
    }
    return ["A","B","C"].filter(key=>list(routine?.[key]).length).map((key,index)=>({
      sessionId:`legacy-${key}`,order:index+1,label:key,name:`Sesión ${key}`,
      focus:"",estimatedDurationMinutes:null,exercises:clone(routine[key])
    }));
  }
  function targetParts(exercise){
    const value=exercise?.prescription?.target??exercise?.target??exercise?.reps;
    if(value&&typeof value==="object"){
      return {
        type:value.type==="duration"?"duracion":"repeticiones",
        min:Number(value.min)||"",max:Number(value.max??value.min)||""
      };
    }
    const parsed=global.GymOSRoutineIO?.parseTarget?.(value);
    if(parsed){
      return {
        type:parsed.type==="duration"?"duracion":"repeticiones",
        min:Number(parsed.min),max:Number(parsed.max??parsed.min)
      };
    }
    return {type:"repeticiones",min:"",max:""};
  }
  function rangeParts(value){
    if(value&&typeof value==="object"){
      return {min:Number(value.min),max:Number(value.max??value.min)};
    }
    const match=text(value).match(/^(\d+(?:[.,]\d+)?)(?:\s*-\s*(\d+(?:[.,]\d+)?))?$/);
    return match
      ?{min:Number(match[1].replace(",",".")),max:Number((match[2]||match[1]).replace(",","."))}
      :{min:"",max:""};
  }
  function exerciseView(exercise,index){
    const target=targetParts(exercise);
    const rir=rangeParts(exercise?.prescription?.targetRir??exercise?.targetRir??exercise?.rir);
    const sets=Number(exercise?.prescription?.sets??exercise?.sets)||0;
    const rest=Number(exercise?.prescription?.restSeconds??exercise?.restSeconds);
    return {
      order:index+1,name:text(exercise?.name)||"Ejercicio",
      sets,target:`${target.min}${target.max!==target.min?`–${target.max}`:""} ${target.type==="duracion"?"s":"reps"}`,
      rir:rir.min===""?"Sin indicar":`${rir.min}${rir.max!==rir.min?`–${rir.max}`:""}`,
      rest:Number.isFinite(rest)?`${rest} s`:"Sin indicar",
      notes:text(exercise?.notes)||text(exercise?.prescription?.notes)
    };
  }
  function routineSummary(routine){
    const sessions=orderedSessions(routine);
    return {
      sessionCount:sessions.length,
      exerciseCount:sessions.reduce((sum,session)=>sum+list(session.exercises).length,0),
      revision:Number(routine?.revision)||null,
      name:text(routine?.name)||"Rutina actual",
      focus:[...new Set(sessions.map(session=>presentableFocus(session.focus)).filter(Boolean))].join(" · "),
      sessions
    };
  }
  function renderSessionDetail(session,index,{compact=false}={}){
    const exercises=list(session.exercises).map(exerciseView);
    const duration=Number(session.estimatedDurationMinutes??session.estimatedDurationMin);
    return `<section class="routine-hub-session ${compact?"compact":""}">
      <header>
        <div><span class="routine-hub-session-label">${esc(session.label||String.fromCharCode(65+index))}</span>
        <h2>${esc(session.name||`Sesión ${index+1}`)}</h2></div>
        <p>${esc(presentableFocus(session.focus)||"Enfoque general")}${duration?` · ${duration} min`:""}</p>
      </header>
      ${exercises.length?`<div class="routine-hub-exercises">${exercises.map(item=>`
        <article class="routine-hub-exercise">
          <span class="routine-hub-order">${item.order}</span>
          <div><strong>${esc(item.name)}</strong>
          <dl><div><dt>Series</dt><dd>${item.sets}</dd></div><div><dt>Objetivo</dt><dd>${esc(item.target)}</dd></div>
          <div><dt>RIR</dt><dd>${esc(item.rir)}</dd></div><div><dt>Descanso</dt><dd>${esc(item.rest)}</dd></div></dl>
          ${item.notes?`<p>${esc(item.notes)}</p>`:""}</div>
        </article>`).join("")}</div>`:`<p class="routine-hub-empty">Esta sesión no tiene ejercicios.</p>`}
    </section>`;
  }
  function renderOverview(data){
    const summary=routineSummary(data.routine);
    const pending=data.pending;
    const previous=data.previousActivation;
    return `<main class="screen routine-hub-screen" aria-labelledby="routineHubTitle">
      <header class="routine-hub-heading"><div><span class="section-kicker">PLANIFICACIÓN</span>
        <h1 id="routineHubTitle">Rutina</h1></div>
        ${data.activeWorkout?`<span class="routine-hub-workout-state">Entrenamiento en curso</span>`:""}
      </header>
      ${messageHtml()}
      <section class="routine-hub-current" aria-labelledby="routineCurrentTitle">
        <div><span class="section-kicker">RUTINA ACTUAL</span><h2 id="routineCurrentTitle">${esc(summary.name)}</h2>
          <p>${summary.sessionCount} sesiones · ${summary.exerciseCount} ejercicios</p>
          ${summary.focus?`<span>${esc(summary.focus)}</span>`:""}
        </div>
        <div class="routine-hub-primary-actions">
          <button type="button" class="secondary" data-hub-view="active">Ver rutina</button>
          <button type="button" class="primary" data-hub-action="start-manual">Editar</button>
        </div>
      </section>
      <section class="routine-hub-management" aria-labelledby="routineManagementTitle">
        <h2 id="routineManagementTitle">Centro de gestión</h2>
        <div class="routine-hub-action-grid">
          <button type="button" data-hub-view="import"><strong>Importar</strong><span>Desde Excel</span></button>
          <button type="button" data-hub-action="template"><strong>Plantilla</strong><span>Descargar Excel</span></button>
          <button type="button" data-hub-action="export"><strong>Exportar</strong><span>Rutina activa</span></button>
          <button type="button" data-hub-view="reconfigure"><strong>Reconfigurar</strong><span>Adaptar cambios</span></button>
        </div>
        <p class="routine-hub-file-note">Este archivo contiene tu planificación. No es una copia de seguridad completa.</p>
      </section>
      ${pending?`<section class="routine-hub-notice pending">
        <div><span class="section-kicker">PROPUESTA PENDIENTE</span><h2>${esc(sourceLabel(pending.proposal))}</h2>
          <p>${pending.comparison?.summary?.totalChanges||0} cambios · ${formatDate(pending.lifecycle?.createdAt)}</p></div>
        <div><button type="button" class="secondary" data-hub-action="discard-pending">Descartar</button>
          <button type="button" class="primary" data-hub-view="proposal">Revisar</button></div>
      </section>`:""}
      ${previous?`<section class="routine-hub-notice version">
        <div><span class="section-kicker">VERSIÓN ANTERIOR DISPONIBLE</span>
          <h2>Rutina previa</h2><p>Activación del ${formatDate(previous.activatedAt)}</p></div>
        <button type="button" class="secondary" data-hub-view="versions">Comparar</button>
      </section>`:""}
      ${replacementHtml()}
    </main>`;
  }
  function renderActive(data){
    const sessions=orderedSessions(data.routine);
    const selected=Math.min(visualState.selectedSession,sessions.length-1);
    return `<main class="screen routine-hub-screen" aria-labelledby="routineActiveTitle">
      ${subHeader("Rutina actual","routineActiveTitle")}
      <div class="routine-hub-session-tabs" role="tablist" aria-label="Sesiones">
        ${sessions.map((session,index)=>`<button type="button" role="tab" id="routineActiveTab${index}" aria-controls="routineActivePanel"
          tabindex="${selected===index?0:-1}" aria-selected="${selected===index}"
          data-hub-session="${index}">${esc(session.label||String.fromCharCode(65+index))}<span>${esc(session.name||`Sesión ${index+1}`)}</span></button>`).join("")}
      </div>
      <div class="routine-hub-desktop-session" id="routineActivePanel" role="tabpanel" aria-labelledby="routineActiveTab${selected}">${sessions[selected]?renderSessionDetail(sessions[selected],selected):""}</div>
      <div class="routine-hub-mobile-sessions">${sessions.map((session,index)=>`
        <details ${index===selected?"open":""} data-hub-details="${index}">
          <summary>${esc(session.label||String.fromCharCode(65+index))} · ${esc(session.name||`Sesión ${index+1}`)}</summary>
          ${renderSessionDetail(session,index,{compact:true})}
        </details>`).join("")}</div>
    </main>`;
  }
  function manualFromRoutine(routine){
    const sessions=orderedSessions(routine).map((session,index)=>({
      id:text(session.sessionId)||`manual-session-${index+1}`,
      order:index+1,label:text(session.label)||String.fromCharCode(65+index),
      name:text(session.name)||`Sesión ${index+1}`,focus:text(session.focus),
      estimatedDurationMinutes:Number(session.estimatedDurationMinutes)||60,
      notes:text(session.notes),
      exercises:list(session.exercises).map((exercise,exerciseIndex)=>{
        const target=targetParts(exercise);
        const rir=rangeParts(exercise?.prescription?.targetRir??exercise?.targetRir??exercise?.rir);
        return {
          exerciseId:text(exercise.exerciseId||exercise.id),
          name:text(exercise.name),targetType:target.type,targetMin:target.min,targetMax:target.max,
          sets:Number(exercise?.prescription?.sets??exercise.sets)||3,
          rirMin:rir.min,rirMax:rir.max,
          restSeconds:Number(exercise?.prescription?.restSeconds??exercise.restSeconds)||0,
          notes:text(exercise.notes)||text(exercise?.prescription?.notes),
          pattern:text(exercise.pattern||exercise.movementPattern),
          role:text(exercise.role||exercise.function),
          recordType:text(exercise?.prescription?.recordType||exercise.recordType)
        };
      })
    }));
    while(sessions.length<2){
      const index=sessions.length;
      sessions.push({
        id:`manual-session-${index+1}`,order:index+1,
        label:String.fromCharCode(65+index),name:`Sesión ${String.fromCharCode(65+index)}`,
        focus:"",estimatedDurationMinutes:60,notes:"",exercises:[]
      });
    }
    return sessions;
  }
  function manualExerciseForm(exercise,index,library){
    const selectedId=text(exercise.exerciseId);
    return `<article class="routine-manual-exercise" data-manual-exercise="${index}">
      <header><strong>Ejercicio ${index+1}</strong><div class="routine-manual-order-actions">
        <button type="button" class="icon-button" data-move-exercise="${index}" data-direction="-1" ${index===0?"disabled":""} aria-label="Subir ejercicio">↑</button>
        <button type="button" class="icon-button" data-move-exercise="${index}" data-direction="1" aria-label="Bajar ejercicio">↓</button>
        <button type="button" class="icon-button" data-remove-exercise="${index}" aria-label="Eliminar ejercicio">×</button>
      </div></header>
      <label><span>Ejercicio</span><select data-field="exerciseId" required>
        <option value="">Selecciona un ejercicio</option>
        ${list(library).map(item=>`<option value="${esc(item.id)}" ${text(item.id)===selectedId?"selected":""}>${esc(item.name)}</option>`).join("")}
      </select></label>
      <div class="routine-manual-grid">
        ${numberField("sets","Series",exercise.sets,1,10)}
        <label><span>Tipo de objetivo</span><select data-field="targetType"><option value="repeticiones" ${exercise.targetType==="repeticiones"?"selected":""}>Repeticiones</option><option value="duracion" ${exercise.targetType==="duracion"?"selected":""}>Duración</option></select></label>
        ${numberField("targetMin","Objetivo mínimo",exercise.targetMin,1,3600)}
        ${numberField("targetMax","Objetivo máximo",exercise.targetMax,1,3600)}
        ${numberField("rirMin","RIR mínimo",exercise.rirMin,0,10)}
        ${numberField("rirMax","RIR máximo",exercise.rirMax,0,10)}
        ${numberField("restSeconds","Descanso (s)",exercise.restSeconds,0,600)}
      </div>
      <label><span>Notas</span><textarea data-field="notes" maxlength="1000" rows="2">${esc(exercise.notes)}</textarea></label>
    </article>`;
  }
  function numberField(key,label,value,min,max){
    return `<label><span>${esc(label)}</span><input data-field="${key}" type="number" min="${min}" max="${max}" value="${esc(value)}" required></label>`;
  }
  function renderManual(data){
    if(!visualState.manual) visualState.manual=manualFromRoutine(data.routine);
    const sessions=visualState.manual;
    const selected=Math.min(visualState.selectedSession,sessions.length-1);
    const session=sessions[selected];
    return `<main class="screen routine-hub-screen" aria-labelledby="routineManualTitle">
      ${subHeader("Editar rutina","routineManualTitle")}
      <p class="routine-hub-intro">Los cambios se guardarán como propuesta. La rutina actual no se modificará.</p>
      <div class="routine-manual-session-picker" role="tablist">
        ${sessions.map((item,index)=>`<button type="button" role="tab" id="routineManualTab${index}" aria-controls="routineManualPanel"
          tabindex="${selected===index?0:-1}" aria-selected="${selected===index}" data-hub-session="${index}">${esc(item.label)}</button>`).join("")}
        <button type="button" class="icon-button" data-hub-action="move-session-up" ${selected<=0?"disabled":""} aria-label="Mover sesión a la izquierda">←</button>
        <button type="button" class="icon-button" data-hub-action="move-session-down" ${selected>=sessions.length-1?"disabled":""} aria-label="Mover sesión a la derecha">→</button>
        <button type="button" class="icon-button" data-hub-action="add-session" ${sessions.length>=6?"disabled":""} aria-label="Añadir sesión">+</button>
      </div>
      <form id="routineManualForm" class="routine-manual-form">
        <section class="routine-manual-session" id="routineManualPanel" role="tabpanel" aria-labelledby="routineManualTab${selected}" data-manual-session="${selected}">
          <div class="routine-manual-grid">
            <label><span>Nombre de sesión</span><input data-session-field="name" maxlength="160" value="${esc(session?.name)}" required></label>
            <label><span>Enfoque</span><input data-session-field="focus" maxlength="120" value="${esc(presentableFocus(session?.focus))}"></label>
            ${numberField("sessionDuration","Duración estimada (min)",session?.estimatedDurationMinutes,1,300).replace('data-field="sessionDuration"','data-session-field="estimatedDurationMinutes"')}
          </div>
          <label><span>Notas de sesión</span><textarea data-session-field="notes" maxlength="1000" rows="2">${esc(session?.notes)}</textarea></label>
          <div class="routine-manual-list">${list(session?.exercises).map((exercise,index)=>
            manualExerciseForm(exercise,index,data.library)
          ).join("")}</div>
          <div class="routine-manual-session-actions">
            <button type="button" class="secondary" data-hub-action="add-exercise">Añadir ejercicio</button>
            <button type="button" class="danger-soft" data-hub-action="remove-session" ${sessions.length<=2?"disabled":""}>Eliminar sesión</button>
          </div>
        </section>
        <footer class="routine-hub-sticky-actions">
          <button type="button" class="secondary" data-hub-view="overview">Cancelar</button>
          <button type="submit" class="primary">Revisar propuesta</button>
        </footer>
      </form>
      ${replacementHtml()}
    </main>`;
  }
  function renderImport(data){
    const current=data.importState;
    const preview=current?.preview;
    return `<main class="screen routine-hub-screen" aria-labelledby="routineImportTitle">
      ${subHeader("Importar desde Excel","routineImportTitle")}
      <p class="routine-hub-intro">Importar prepara una propuesta. Tu rutina actual no cambiará hasta que la actives.</p>
      <section class="routine-import-drop">
        <h2>Archivo XLSX de GymOS</h2>
        <p>Utiliza la plantilla actual para conservar sesiones, prescripción, RIR, descanso y notas.</p>
        <div><button type="button" class="secondary" data-hub-action="template">Descargar plantilla</button>
          <button type="button" class="primary" data-hub-action="choose-file" ${current?.status==="reading"?"disabled":""}>${current?.status==="reading"?"Validando…":"Seleccionar Excel"}</button></div>
      </section>
      ${current?.message?`<p class="routine-hub-message error" role="alert">${esc(current.message)}</p>`:""}
      ${preview?renderImportPreview(preview):""}
      ${preview?.canSave?`<footer class="routine-hub-sticky-actions"><button type="button" class="secondary" data-hub-view="overview">Cancelar</button>
        <button type="button" class="primary" data-hub-action="save-import">Guardar como propuesta</button></footer>`:""}
      ${replacementHtml()}
    </main>`;
  }
  function issueLocation(item){
    const value=item?.location||{};
    const parts=[];
    if(value.sheet) parts.push(`Hoja ${value.sheet}`);
    if(value.row) parts.push(`fila ${value.row}`);
    if(value.column) parts.push(`columna ${value.column}`);
    return parts.join(" · ")||"Archivo";
  }
  function renderImportPreview(preview){
    return `<section class="routine-import-preview" aria-live="polite">
      <header><div><span class="section-kicker">VALIDACIÓN</span><h2>${preview.errors?.length?"Requiere correcciones":"Vista previa"}</h2></div>
        <strong>${preview.sessionCount} sesiones · ${preview.exerciseCount} ejercicios</strong></header>
      ${preview.errors?.length?`<ul class="routine-import-error-list">${preview.errors.map(item=>
        `<li><strong>${esc(issueLocation(item))}:</strong> ${esc(item.message)}${item.help?` <span>${esc(item.help)}</span>`:""}</li>`
      ).join("")}</ul>`:""}
      ${preview.warnings?.length?`<ul class="routine-import-warning-list">${preview.warnings.map(item=>
        `<li><strong>${esc(issueLocation(item))}:</strong> ${esc(item.message)}</li>`
      ).join("")}</ul>`:""}
      ${preview.sessions?.length?`<div class="routine-import-session-preview">${preview.sessions.map(session=>
        `<article><strong>${esc(session.name)}</strong><span>${session.exerciseCount} ejercicios${session.durationMin?` · ${session.durationMin} min`:""}</span></article>`
      ).join("")}</div>`:""}
    </section>`;
  }
  function renderReconfigure(data){
    const selected=new Set(visualState.reconfigureReasons);
    const values=visualState.reconfigureValues||{};
    return `<main class="screen routine-hub-screen" aria-labelledby="routineReconfigureTitle">
      ${subHeader("Reconfigurar","routineReconfigureTitle")}
      <p class="routine-hub-intro">Selecciona únicamente lo que ha cambiado. El resto se heredará de tu configuración actual.</p>
      <form id="routineReconfigureForm" class="routine-reconfigure-form">
        <fieldset><legend>¿Qué ha cambiado?</legend><div class="routine-reason-grid">
          ${RECONFIGURE_REASONS.map(([value,label])=>`<label><input type="checkbox" name="reason" value="${value}" ${selected.has(value)?"checked":""}><span>${esc(label)}</span></label>`).join("")}
        </div></fieldset>
        ${selected.size?`<section class="routine-reconfigure-fields">
          ${selected.has("goal")?`<label><span>Nuevo objetivo</span><select name="goal" required>${data.goalOptions.map(option=>`<option value="${esc(option.value)}" ${text(values.goal)===text(option.value)?"selected":""}>${esc(option.label)}</option>`).join("")}</select></label>`:""}
          ${selected.has("days")?numberInput("days","Días disponibles",values.days??data.profile.weeklyAvailability,2,6):""}
          ${selected.has("duration")?numberInput("duration","Duración de las sesiones (min)",values.duration??data.profile.preferredSessionDurationMin,25,180):""}
          ${selected.has("equipment")?textInput("equipment","Material disponible",values.equipment??list(data.profile.availableEquipment).join(", ")): ""}
          ${selected.has("limitations")?textInput("limitations","Lesión o limitación",values.limitations??list(data.profile.injuries).join(", ")): ""}
          ${selected.has("preferences")?textInput("preferences","Ejercicios preferidos",values.preferences??""):""}
          ${selected.has("performance")?`<label><span>Rendimiento o nivel</span><select name="performance">${["returning","beginner","intermediate","advanced"].map(value=>`<option value="${value}" ${text(values.performance)===value?"selected":""}>${({returning:"Retomando",beginner:"Principiante",intermediate:"Intermedio",advanced:"Avanzado"})[value]}</option>`).join("")}</select></label>`:""}
          ${selected.has("other")?`<label><span>Otro motivo</span><textarea name="other" maxlength="500" required rows="3">${esc(values.other)}</textarea></label>`:""}
        </section>`:""}
        <footer class="routine-hub-sticky-actions"><button type="button" class="secondary" data-hub-view="overview">Cancelar</button>
          <button type="submit" class="primary" ${selected.size?"":"disabled"}>Generar propuesta</button></footer>
      </form>
      ${replacementHtml()}
    </main>`;
  }
  function numberInput(name,label,value,min,max){
    return `<label><span>${esc(label)}</span><input name="${name}" type="number" min="${min}" max="${max}" value="${esc(value)}" required></label>`;
  }
  function textInput(name,label,value){
    return `<label><span>${esc(label)}</span><input name="${name}" value="${esc(value)}" maxlength="500" required></label>`;
  }
  function proposalBlockers(record){
    const proposal=record?.proposal||{};
    const blockers=[];
    if(record?.comparison?.stale) blockers.push("La rutina actual cambió desde que se creó la propuesta.");
    if(proposal.reviewRequired) blockers.push("La propuesta requiere revisión antes de poder activarse.");
    if(list(proposal.unresolvedQuestions).length) blockers.push("Quedan datos por resolver.");
    if(record?.activationCompatibility?.compatible===false){
      blockers.push(...list(record.activationCompatibility.reasons));
    }
    if(list(proposal.sessions).some(session=>!list(session?.exercises).length)){
      blockers.push("Todas las sesiones necesitan al menos un ejercicio.");
    }
    if(proposal.validation?.valid===false){
      blockers.push("La propuesta contiene errores de validación.");
    }
    return [...new Set(blockers.map(text).filter(Boolean))];
  }
  function renderProposal(data){
    const record=data.pending;
    if(!record) return `<main class="screen routine-hub-screen">${subHeader("Propuesta","routineProposalTitle")}<p>No hay una propuesta pendiente.</p></main>`;
    const proposal=record.proposal;
    const proposed={sessions:proposal.sessions};
    const blockers=proposalBlockers(record);
    const changes=list(record.comparison?.changes);
    return `<main class="screen routine-hub-screen" aria-labelledby="routineProposalTitle">
      ${subHeader("Revisar propuesta","routineProposalTitle")}
      ${messageHtml()}
      <section class="routine-proposal-summary"><div><span class="section-kicker">${esc(sourceLabel(proposal).toUpperCase())}</span>
        <h2>${record.comparison?.summary?.totalChanges||0} cambios propuestos</h2>
        <p>${formatDate(proposal.generatedAt)}</p></div>
        ${record.comparison?.stale?`<strong class="routine-stale">La rutina actual cambió. Genera una propuesta nueva.</strong>`:""}
      </section>
      ${proposal.warnings?.length?`<section class="routine-proposal-warnings"><h2>Advertencias</h2><ul>${proposal.warnings.map(item=>`<li>${esc(item)}</li>`).join("")}</ul></section>`:""}
      ${changes.length?`<section class="routine-change-list" aria-labelledby="routineChangesTitle">
        <h2 id="routineChangesTitle">Qué cambia</h2>
        <ul>${changes.map(change=>`<li>${esc(change.description||"Cambio en la planificación.")}</li>`).join("")}</ul>
      </section>`:""}
      ${blockers.length?`<section class="routine-proposal-blockers" role="status"><h2>Antes de activar</h2>
        <ul>${blockers.map(item=>`<li>${esc(item)}</li>`).join("")}</ul></section>`:""}
      <section class="routine-comparison" aria-label="Comparación de rutina">
        <div><h2>Rutina actual</h2>${orderedSessions(data.routine).map(renderSessionDetail).join("")}</div>
        <div><h2>Nueva propuesta</h2>${orderedSessions(proposed).map(renderSessionDetail).join("")}</div>
      </section>
      ${data.activeWorkout?`<p class="routine-hub-message warning" role="status">${esc(global.GymOSRoutineActivation?.ACTIVE_WORKOUT_MESSAGE)}</p>`:""}
      <footer class="routine-hub-sticky-actions proposal-actions">
        <button type="button" class="secondary" data-hub-view="overview">Seguir usando la rutina actual</button>
        <button type="button" class="danger-soft" data-hub-action="discard-pending">Descartar propuesta</button>
        <button type="button" class="primary" data-hub-action="open-activation" ${blockers.length||data.activeWorkout?"disabled":""}>Activar nueva rutina</button>
      </footer>
      ${activationConfirmationHtml(data)}
    </main>`;
  }
  function renderVersions(data){
    const activation=data.previousActivation;
    if(!activation) return `<main class="screen routine-hub-screen">${subHeader("Versión anterior","routineVersionsTitle")}<p>No hay una versión anterior disponible.</p></main>`;
    const previous=activation.baseline?.canonicalRoutine||activation.baseline?.routine;
    return `<main class="screen routine-hub-screen" aria-labelledby="routineVersionsTitle">
      ${subHeader("Versión anterior disponible","routineVersionsTitle")}
      <p class="routine-hub-intro">Compara la versión anterior con la rutina actual antes de preparar su restauración.</p>
      <section class="routine-comparison">
        <div><h2>Rutina actual</h2>${orderedSessions(data.routine).map(renderSessionDetail).join("")}</div>
        <div><h2>Versión anterior</h2>${orderedSessions(previous).map(renderSessionDetail).join("")}</div>
      </section>
      ${data.activeWorkout?`<p class="routine-hub-message warning">Puedes preparar la restauración ahora. La activación quedará bloqueada hasta que termines o descartes el entrenamiento en curso.</p>`:""}
      <footer class="routine-hub-sticky-actions"><button type="button" class="secondary" data-hub-view="overview">Volver</button>
        <button type="button" class="primary" data-hub-action="prepare-restore">Preparar restauración</button></footer>
      ${replacementHtml()}
    </main>`;
  }
  function subHeader(title,id){
    return `<header class="routine-hub-subheader"><button type="button" class="back-button" data-hub-view="overview" aria-label="Volver">←</button><h1 id="${id}">${esc(title)}</h1></header>`;
  }
  function sourceLabel(proposal){
    return ({
      manual:"Edición manual",import:"Importación",imported:"Importación",
      reconfigure:"Reconfiguración",restore:"Restauración",generated:"Reconfiguración"
    })[proposal?.type]||"Propuesta";
  }
  function formatDate(value){
    const date=new Date(value);
    return Number.isNaN(date.getTime())?"Fecha no disponible":date.toLocaleDateString("es-ES",{day:"numeric",month:"short",year:"numeric"});
  }
  function messageHtml(){
    const message=visualState?.message;
    return message?`<p class="routine-hub-message ${esc(message.type||"info")}" role="status">${esc(message.text)}</p>`:"";
  }
  function replacementHtml(){
    if(!visualState?.replacementCandidate) return "";
    return `<div class="routine-hub-modal-layer"><section class="routine-hub-confirmation" role="dialog" aria-modal="true" aria-labelledby="replaceProposalTitle" tabindex="-1">
      <h2 id="replaceProposalTitle">Ya existe una propuesta pendiente</h2>
      <p>Puedes continuar revisándola o reemplazarla. La propuesta existente no se sustituirá sin tu confirmación.</p>
      <div><button type="button" class="secondary" data-hub-action="cancel-replacement">Continuar revisándola</button>
        <button type="button" class="danger" data-hub-action="confirm-replacement">Reemplazar propuesta</button></div>
    </section></div>`;
  }
  function activationConfirmationHtml(data){
    if(!visualState.activationConfirmation) return "";
    return `<div class="routine-hub-modal-layer"><section class="routine-hub-confirmation" role="dialog" aria-modal="true" aria-labelledby="activateRoutineTitle" tabindex="-1">
      <h2 id="activateRoutineTitle">Activar nueva rutina</h2>
      <p>La rutina actual se conservará como versión anterior disponible. Los entrenamientos históricos no cambiarán.</p>
      <label><input type="checkbox" id="routineHubActivationCheck"><span>He revisado la comparación y quiero activar esta rutina.</span></label>
      <div><button type="button" class="secondary" data-hub-action="close-activation">Cancelar</button>
        <button type="button" class="primary" id="routineHubConfirmActivation" disabled>Activar rutina</button></div>
    </section></div>`;
  }
  function captureManual(){
    const form=document.getElementById("routineManualForm");
    if(!form||!visualState.manual) return;
    const session=visualState.manual[visualState.selectedSession];
    form.querySelectorAll("[data-session-field]").forEach(control=>{
      const key=control.dataset.sessionField;
      session[key]=key==="estimatedDurationMinutes"?Number(control.value):control.value.trim();
    });
    session.exercises=[...form.querySelectorAll("[data-manual-exercise]")].map(container=>{
      const values={};
      container.querySelectorAll("[data-field]").forEach(control=>{
        values[control.dataset.field]=control.type==="number"?Number(control.value):control.value.trim();
      });
      const libraryItem=currentOptions.data.library.find(item=>text(item.id)===text(values.exerciseId));
      return {
        ...values,name:text(libraryItem?.name),pattern:text(libraryItem?.movementPattern),
        role:text(libraryItem?.function||libraryItem?.role||"main"),
        recordType:list(libraryItem?.recordTypes)[0]||(values.targetType==="duracion"?"duration":"weight_reps")
      };
    });
  }
  function captureReconfigure(){
    const form=document.getElementById("routineReconfigureForm");
    if(!form) return;
    const values=Object.fromEntries(new FormData(form).entries());
    delete values.reason;
    visualState.reconfigureValues={...visualState.reconfigureValues,...values};
  }
  function manualProposalSessions(){
    return visualState.manual.map((session,index)=>({
      id:session.id||`manual-session-${index+1}`,order:index+1,
      label:String.fromCharCode(65+index),name:text(session.name),focus:text(session.focus),
      estimatedDurationMinutes:Number(session.estimatedDurationMinutes),
      notes:text(session.notes),
      exercises:list(session.exercises).map(exercise=>({
        exerciseId:text(exercise.exerciseId),name:text(exercise.name),
        pattern:text(exercise.pattern),role:text(exercise.role),
        notes:text(exercise.notes),
        prescription:{
          sets:Number(exercise.sets),
          target:{
            type:exercise.targetType==="duracion"?"duration":"reps",
            min:Number(exercise.targetMin),max:Number(exercise.targetMax)
          },
          targetRir:{min:Number(exercise.rirMin),max:Number(exercise.rirMax)},
          restSeconds:Number(exercise.restSeconds),
          recordType:text(exercise.recordType)
        }
      }))
    }));
  }
  function proposalSessionsFromRoutine(routine){
    const previousManual=visualState?.manual;
    const source=manualFromRoutine(routine);
    if(visualState) visualState.manual=source;
    const sessions=manualProposalSessions();
    if(visualState) visualState.manual=previousManual;
    return sessions;
  }
  function validateManual(sessions){
    const errors=[];
    if(sessions.length<2||sessions.length>6) errors.push("La rutina debe tener entre 2 y 6 sesiones.");
    sessions.forEach((session,index)=>{
      if(!text(session.name)) errors.push(`Indica el nombre de la sesión ${index+1}.`);
      if(!list(session.exercises).length) errors.push(`${session.name||`Sesión ${index+1}`} necesita al menos un ejercicio.`);
      session.exercises.forEach((exercise,exerciseIndex)=>{
        const prefix=`${session.name||`Sesión ${index+1}`}, ejercicio ${exerciseIndex+1}`;
        if(!text(exercise.exerciseId)) errors.push(`${prefix}: selecciona un ejercicio.`);
        const prescription=exercise.prescription||{};
        const target=prescription.target||{},rir=prescription.targetRir||{};
        const maxTarget=target.type==="duration"?3600:100;
        if(!Number.isInteger(prescription.sets)||prescription.sets<1||prescription.sets>10) errors.push(`${prefix}: las series deben estar entre 1 y 10.`);
        if(!Number.isFinite(target.min)||target.min<1||target.min>maxTarget||target.max<target.min||target.max>maxTarget) errors.push(`${prefix}: revisa el objetivo mínimo y máximo.`);
        if(!Number.isFinite(rir.min)||rir.min<0||rir.max<rir.min||rir.max>10) errors.push(`${prefix}: revisa el RIR.`);
        if(!Number.isFinite(prescription.restSeconds)||prescription.restSeconds<0||prescription.restSeconds>600) errors.push(`${prefix}: el descanso debe estar entre 0 y 600.`);
      });
    });
    return errors;
  }
  async function submitCandidate(candidate){
    if(visualState.busy) return;
    visualState.busy="saving_proposal";
    refresh();
    let result;
    try{
      result=await currentOptions.actions.storeProposal(candidate,{replacePending:false});
    }catch(error){
      visualState.busy=null;
      visualState.message={type:"error",text:error?.message||"No se pudo guardar la propuesta."};
      refresh();
      return;
    }
    visualState.busy=null;
    if(result?.requiresReplacementConfirmation){
      visualState.replacementCandidate=candidate;
      visualState.restoreFocusSelector='[data-hub-view="overview"]';
      refresh();
      return;
    }
    visualState.replacementCandidate=null;
    visualState.manual=null;
    visualState.view="proposal";
    visualState.message={type:"success",text:"Propuesta guardada. La rutina actual no ha cambiado."};
    refresh();
  }
  function bind(data,actions){
    document.querySelectorAll("[data-hub-view]").forEach(button=>button.onclick=()=>{
      if(visualState.view==="manual") captureManual();
      setView(button.dataset.hubView);
    });
    const sessionTabs=[...document.querySelectorAll("[data-hub-session]")];
    sessionTabs.forEach(button=>{
      button.onclick=()=>{
        if(visualState.view==="manual") captureManual();
        visualState.selectedSession=Number(button.dataset.hubSession)||0;refresh();
      };
      button.onkeydown=event=>{
        if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key)) return;
        event.preventDefault();
        const current=Number(button.dataset.hubSession)||0;
        const next=event.key==="Home"?0:event.key==="End"?sessionTabs.length-1:
          (current+(event.key==="ArrowRight"?1:-1)+sessionTabs.length)%sessionTabs.length;
        sessionTabs[next]?.click();
      };
    });
    document.querySelectorAll("[data-hub-details]").forEach(details=>details.ontoggle=()=>{
      if(!details.open) return;
      document.querySelectorAll("[data-hub-details]").forEach(other=>{
        if(other!==details) other.open=false;
      });
    });
    const action=name=>document.querySelector(`[data-hub-action="${name}"]`);
    action("start-manual")?.addEventListener("click",()=>{
      visualState.manual=manualFromRoutine(data.routine);visualState.selectedSession=0;setView("manual");
    });
    action("template")?.addEventListener("click",()=>{
      try{actions.downloadTemplate();}
      catch(error){visualState.message={type:"error",text:error?.message||"No se pudo descargar la plantilla."};refresh();}
    });
    action("export")?.addEventListener("click",()=>{
      try{actions.exportRoutine();}
      catch(error){visualState.message={type:"error",text:error?.message||"No se pudo exportar la rutina."};refresh();}
    });
    action("choose-file")?.addEventListener("click",()=>actions.chooseFile());
    action("save-import")?.addEventListener("click",async()=>{
      if(visualState.busy) return;
      visualState.busy="preparing_import";refresh();
      try{
        const candidate=await actions.importProposal();
        visualState.busy=null;
        if(candidate) await submitCandidate(candidate);
      }catch(error){
        visualState.busy=null;
        visualState.message={type:"error",text:error?.message||"No se pudo preparar la importación."};refresh();
      }
    });
    action("discard-pending")?.addEventListener("click",async()=>{
      if(visualState.busy||!data.pending||!confirm("¿Descartar la propuesta pendiente?")) return;
      visualState.busy="discarding";refresh();
      try{
        await actions.discardProposal(data.pending.proposal.proposalId);
        visualState.view="overview";visualState.message={type:"success",text:"Propuesta descartada."};
      }catch(error){
        visualState.message={type:"error",text:error?.message||"No se pudo descartar la propuesta."};
      }
      visualState.busy=null;refresh();
    });
    action("add-session")?.addEventListener("click",()=>{
      captureManual();
      if(visualState.manual.length>=6) return;
      const index=visualState.manual.length;
      visualState.manual.push({
        id:`manual-session-${index+1}`,order:index+1,label:String.fromCharCode(65+index),
        name:`Sesión ${String.fromCharCode(65+index)}`,focus:"full_body",
        estimatedDurationMinutes:60,notes:"",exercises:[]
      });
      visualState.selectedSession=index;refresh();
    });
    action("remove-session")?.addEventListener("click",()=>{
      captureManual();
      if(visualState.manual.length<=2) return;
      visualState.manual.splice(visualState.selectedSession,1);
      visualState.selectedSession=Math.max(0,visualState.selectedSession-1);refresh();
    });
    const moveSession=direction=>{
      captureManual();
      const from=visualState.selectedSession;
      const to=from+direction;
      if(to<0||to>=visualState.manual.length) return;
      [visualState.manual[from],visualState.manual[to]]=[
        visualState.manual[to],visualState.manual[from]
      ];
      visualState.selectedSession=to;
      refresh();
    };
    action("move-session-up")?.addEventListener("click",()=>moveSession(-1));
    action("move-session-down")?.addEventListener("click",()=>moveSession(1));
    action("add-exercise")?.addEventListener("click",()=>{
      captureManual();
      visualState.manual[visualState.selectedSession].exercises.push({
        exerciseId:"",name:"",sets:3,targetType:"repeticiones",targetMin:8,targetMax:12,
        rirMin:2,rirMax:2,restSeconds:90,notes:""
      });
      refresh();
    });
    document.querySelectorAll("[data-remove-exercise]").forEach(button=>button.onclick=()=>{
      captureManual();
      visualState.manual[visualState.selectedSession].exercises.splice(Number(button.dataset.removeExercise),1);
      refresh();
    });
    document.querySelectorAll("[data-move-exercise]").forEach(button=>button.onclick=()=>{
      captureManual();
      const exercises=visualState.manual[visualState.selectedSession].exercises;
      const from=Number(button.dataset.moveExercise);
      const to=from+Number(button.dataset.direction);
      if(to<0||to>=exercises.length) return;
      [exercises[from],exercises[to]]=[exercises[to],exercises[from]];
      refresh();
    });
    document.getElementById("routineManualForm")?.addEventListener("submit",async event=>{
      event.preventDefault();captureManual();
      const sessions=manualProposalSessions();
      const errors=validateManual(sessions);
      if(errors.length){
        visualState.message={type:"error",text:errors[0]};refresh();return;
      }
      await submitCandidate(actions.buildCandidate("manual",sessions,{
        rationale:["Rutina preparada mediante edición manual."]
      }));
    });
    document.querySelectorAll('input[name="reason"]').forEach(input=>input.onchange=()=>{
      captureReconfigure();
      visualState.reconfigureReasons=[...document.querySelectorAll('input[name="reason"]:checked')].map(item=>item.value);
      refresh();
    });
    const reconfigureForm=document.getElementById("routineReconfigureForm");
    reconfigureForm?.addEventListener("input",captureReconfigure);
    reconfigureForm?.addEventListener("submit",async event=>{
      event.preventDefault();
      if(visualState.busy) return;
      const values=Object.fromEntries(new FormData(event.currentTarget).entries());
      values.reasons=clone(visualState.reconfigureReasons);
      visualState.busy="reconfiguring";refresh();
      try{
        const candidate=await actions.reconfigure(values);
        visualState.busy=null;
        if(candidate) await submitCandidate(candidate);
      }catch(error){
        visualState.busy=null;
        visualState.message={type:"error",text:error?.message||"No se pudo reconfigurar la rutina."};refresh();
      }
    });
    action("prepare-restore")?.addEventListener("click",async()=>{
      if(visualState.busy) return;
      try{
        const candidate=actions.restoreCandidate(data.previousActivation);
        await submitCandidate(candidate);
      }catch(error){
        visualState.message={type:"error",text:error?.message||"No se pudo preparar la restauración."};refresh();
      }
    });
    action("open-activation")?.addEventListener("click",()=>{
      visualState.activationConfirmation=true;
      visualState.restoreFocusSelector='[data-hub-action="open-activation"]';
      refresh();
    });
    action("close-activation")?.addEventListener("click",()=>{
      visualState.activationConfirmation=false;refresh();
    });
    const check=document.getElementById("routineHubActivationCheck");
    const confirmButton=document.getElementById("routineHubConfirmActivation");
    if(check&&confirmButton){
      check.onchange=()=>{confirmButton.disabled=!check.checked;};
      confirmButton.onclick=async()=>{
        confirmButton.disabled=true;
        const result=await actions.activate(data.pending.proposal.proposalId);
        visualState.activationConfirmation=false;
        visualState.view=result?.ok?"overview":"proposal";
        visualState.message={
          type:result?.ok?"success":"error",
          text:result?.ok?"Rutina activada. La versión anterior queda disponible.":result?.message||"No se pudo activar la rutina."
        };
        refresh();
      };
    }
    action("cancel-replacement")?.addEventListener("click",()=>{
      visualState.replacementCandidate=null;visualState.view="proposal";refresh();
    });
    action("confirm-replacement")?.addEventListener("click",async()=>{
      const candidate=visualState.replacementCandidate;
      if(!candidate||visualState.busy) return;
      visualState.busy="replacing";refresh();
      let result;
      try{result=await actions.storeProposal(candidate,{replacePending:true});}
      catch(error){
        visualState.busy=null;
        visualState.message={type:"error",text:error?.message||"No se pudo reemplazar la propuesta."};
        refresh();
        return;
      }
      if(result?.created){
        visualState.replacementCandidate=null;visualState.manual=null;
        visualState.view="proposal";
        visualState.message={type:"success",text:"Propuesta reemplazada tras tu confirmación."};
      }
      visualState.busy=null;
      refresh();
    });
  }
  function render(options){
    currentOptions=options;
    const data=options.data;
    ensureState(data.ownerId);
    const renderers={
      overview:renderOverview,active:renderActive,manual:renderManual,
      import:renderImport,reconfigure:renderReconfigure,proposal:renderProposal,
      versions:renderVersions
    };
    options.root.innerHTML=`<div class="app-shell routine-hub-shell" aria-busy="${visualState.busy?"true":"false"}">
      <header class="topbar routine-hub-topbar"><div><div class="brand">Rutina</div><div class="subtle">Planificación y cambios bajo tu control</div></div></header>
      ${renderers[visualState.view](data)}
      ${options.navigation||""}
    </div>`;
    bind(data,options.actions);
    options.root.onkeydown=event=>{
      const modal=options.root.querySelector(".routine-hub-confirmation");
      if(event.key==="Tab"&&modal){
        const focusable=[...modal.querySelectorAll(
          'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
        )];
        if(focusable.length){
          const first=focusable[0],last=focusable[focusable.length-1];
          if(event.shiftKey&&document.activeElement===first){
            event.preventDefault();last.focus();
          }else if(!event.shiftKey&&document.activeElement===last){
            event.preventDefault();first.focus();
          }
        }
        return;
      }
      if(event.key!=="Escape") return;
      if(visualState.activationConfirmation){
        visualState.activationConfirmation=false;
        refresh();
      }else if(visualState.replacementCandidate){
        visualState.replacementCandidate=null;
        refresh();
      }else if(visualState.view!=="overview"){
        setView("overview");
      }
    };
    const confirmation=options.root.querySelector(".routine-hub-confirmation");
    if(confirmation) confirmation.focus();
    else if(visualState.restoreFocusSelector){
      options.root.querySelector(visualState.restoreFocusSelector)?.focus();
      visualState.restoreFocusSelector=null;
    }
    return clone(visualState);
  }
  function reset(ownerId=null){
    visualState=ownerId?{ownerId,view:"overview",selectedSession:0,manual:null,
      reconfigureReasons:[],reconfigureValues:{},replacementCandidate:null,activationConfirmation:false,
      restoreFocusSelector:null,message:null,busy:null}:null;
  }

  global.GymOSRoutineHub=Object.freeze({
    VIEWS,RECONFIGURE_REASONS,render,reset,routineSummary,manualFromRoutine,
    proposalSessionsFromRoutine,validateManual
  });
})(typeof window!=="undefined"?window:globalThis);
