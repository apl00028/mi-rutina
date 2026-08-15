"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const test=require("node:test");

const root=path.resolve(__dirname,"..");
const moduleSource=fs.readFileSync(path.join(root,"routine-session-model.js"),"utf8");
const indexSource=fs.readFileSync(path.join(root,"index.html"),"utf8");
const workerSource=fs.readFileSync(path.join(root,"service-worker.js"),"utf8");

function loadModel(extraContext={}){
  const context={console,...extraContext};
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(moduleSource,context,{filename:"routine-session-model.js"});
  return context.GymOSRoutineSessionModel;
}
function plain(value){return JSON.parse(JSON.stringify(value));}
function exercise(id="exercise-1",overrides={}){
  return {
    id,
    name:`Ejercicio ${id}`,
    sets:3,
    reps:"8-10",
    rir:2,
    restSeconds:90,
    prescription:{tempo:"2-0-2",notes:"Control técnico"},
    ...overrides
  };
}
function session(order,overrides={}){
  return {
    sessionId:`stable-session-${order}`,
    order,
    label:String.fromCharCode(64+order),
    name:`Sesión ${order}`,
    focus:`Enfoque ${order}`,
    estimatedDurationMinutes:45+order,
    exercises:[exercise(`exercise-${order}`)],
    ...overrides
  };
}
function routine(count=2,overrides={}){
  return {
    schemaVersion:"4.2",
    routineId:"stable-routine-id",
    revision:1,
    sessions:Array.from({length:count},(_,index)=>session(index+1)),
    ...overrides
  };
}
function json(value){return JSON.stringify(plain(value));}
function codes(result){return result.errors.map(error=>error.code);}
function expectModelError(fn,code){
  assert.throws(fn,error=>error&&error.code===code);
}

for(const count of [2,3,4,5,6]){
  test(`valida una rutina canónica de ${count} sesiones`,()=>{
    const model=loadModel();
    const validation=plain(model.validateCanonicalRoutine(routine(count)));
    assert.equal(validation.valid,true);
    assert.equal(validation.activation.compatible,true);
    assert.equal(validation.activation.sessionCount,count);
  });
}

test("bloquea más de seis sesiones sin truncar",()=>{
  const model=loadModel();
  const input=routine(7);
  const validation=plain(model.validateCanonicalRoutine(input));
  assert.equal(validation.valid,false);
  assert.ok(codes(validation).includes("too_many_sessions"));
  assert.equal(input.sessions.length,7);
  expectModelError(()=>model.normalizeCanonicalRoutine(input),"invalid_canonical_routine");
});

test("bloquea sessionId duplicado",()=>{
  const model=loadModel();
  const input=routine(2);
  input.sessions[1].sessionId=input.sessions[0].sessionId;
  assert.ok(codes(plain(model.validateCanonicalRoutine(input))).includes("duplicate_session_id"));
});

test("bloquea order duplicado",()=>{
  const model=loadModel();
  const input=routine(2);
  input.sessions[1].order=input.sessions[0].order;
  assert.ok(codes(plain(model.validateCanonicalRoutine(input))).includes("duplicate_session_order"));
});

test("bloquea order inválido",()=>{
  const model=loadModel();
  const input=routine(2);
  input.sessions[0].order=0;
  assert.ok(codes(plain(model.validateCanonicalRoutine(input))).includes("invalid_session_order"));
});

test("bloquea routineId ausente",()=>{
  const model=loadModel();
  const input=routine(2);
  delete input.routineId;
  assert.ok(codes(plain(model.validateCanonicalRoutine(input))).includes("invalid_routine_id"));
});

test("bloquea sessionId ausente",()=>{
  const model=loadModel();
  const input=routine(2);
  delete input.sessions[0].sessionId;
  assert.ok(codes(plain(model.validateCanonicalRoutine(input))).includes("invalid_session_id"));
});

test("bloquea referencias circulares y valores no serializables",()=>{
  const model=loadModel();
  const input=routine(2);
  input.self=input;
  const circular=plain(model.validateCanonicalRoutine(input));
  assert.equal(circular.valid,false);
  assert.ok(codes(circular).includes("circular_reference"));
  const withFunction=routine(2);
  withFunction.sessions[0].helper=()=>true;
  assert.ok(codes(plain(model.validateCanonicalRoutine(withFunction))).includes("non_serializable_value"));
});

test("permite temporalmente menos de dos sesiones pero no la considera activable",()=>{
  const model=loadModel();
  const validation=plain(model.validateCanonicalRoutine(routine(1)));
  assert.equal(validation.valid,true);
  assert.deepEqual(validation.activation,{
    compatible:false,
    code:"not_enough_sessions",
    sessionCount:1
  });
});

test("normalizar clona, ordena y no muta la entrada",()=>{
  const model=loadModel();
  const input=routine(3);
  input.sessions=[input.sessions[2],input.sessions[0],input.sessions[1]];
  input.compatibleMetadata={source:"manual",nested:{enabled:true}};
  const before=json(input);
  const normalized=plain(model.normalizeCanonicalRoutine(input));
  assert.equal(json(input),before);
  assert.deepEqual(normalized.sessions.map(item=>item.order),[1,2,3]);
  assert.deepEqual(normalized.compatibleMetadata,input.compatibleMetadata);
  normalized.sessions[0].exercises[0].sets=99;
  assert.equal(input.sessions.find(item=>item.order===1).exercises[0].sets,3);
});

test("normalizar repetidamente conserva igualdad JSON exacta y revision",()=>{
  const model=loadModel();
  const once=plain(model.normalizeCanonicalRoutine(routine(3)));
  const twice=plain(model.normalizeCanonicalRoutine(once));
  assert.equal(json(twice),json(once));
  assert.equal(twice.revision,1);
});

test("el hash no depende del orden físico cuando order no cambia",()=>{
  const model=loadModel();
  const first=routine(3);
  const reordered={...first,sessions:[first.sessions[2],first.sessions[0],first.sessions[1]]};
  assert.equal(model.canonicalRoutineHash(first),model.canonicalRoutineHash(reordered));
});

test("cambiar order cambia el hash y conserva sessionId",()=>{
  const model=loadModel();
  const first=routine(2);
  const reordered=plain(first);
  const ids=reordered.sessions.map(item=>item.sessionId);
  [reordered.sessions[0].order,reordered.sessions[1].order]=[
    reordered.sessions[1].order,reordered.sessions[0].order
  ];
  assert.notEqual(model.canonicalRoutineHash(first),model.canonicalRoutineHash(reordered));
  assert.deepEqual(reordered.sessions.map(item=>item.sessionId),ids);
});

test("renombrar una sesión conserva su sessionId",()=>{
  const model=loadModel();
  const input=routine(2);
  const id=input.sessions[0].sessionId;
  input.sessions[0].name="Nuevo nombre";
  const normalized=plain(model.normalizeCanonicalRoutine(input));
  assert.equal(normalized.sessions[0].sessionId,id);
});

test("reordenar físicamente conserva todos los sessionId",()=>{
  const model=loadModel();
  const input=routine(3);
  const expected=input.sessions.map(item=>item.sessionId).sort();
  input.sessions.reverse();
  const normalized=plain(model.normalizeCanonicalRoutine(input));
  assert.deepEqual(normalized.sessions.map(item=>item.sessionId).sort(),expected);
});

test("cambiar label conserva sessionId y no cambia el hash",()=>{
  const model=loadModel();
  const input=routine(2);
  const changed=plain(input);
  changed.sessions[0].label="Torso favorito";
  assert.equal(changed.sessions[0].sessionId,input.sessions[0].sessionId);
  assert.equal(model.canonicalRoutineHash(changed),model.canonicalRoutineHash(input));
});

test("deriva las etiquetas A–F sin convertirlas en identidad",()=>{
  const model=loadModel();
  assert.deepEqual([1,2,3,4,5,6].map(order=>model.deriveSessionLabel(order)),["A","B","C","D","E","F"]);
  expectModelError(()=>model.deriveSessionLabel(7),"invalid_session_order");
});

function legacyFixture(){
  return {
    A:[exercise("legacy-a",{sets:4,reps:"6-8"})],
    B:[exercise("legacy-b",{sets:2,reps:"12-15"})],
    C:[exercise("legacy-c",{sets:3,reps:"8"})]
  };
}
function legacyOptions(legacyRoutine=legacyFixture()){
  return {
    legacyRoutine,
    routineId:"routine-fixed-id",
    sessionIds:{
      A:"session-fixed-a",
      B:"session-fixed-b",
      C:"session-fixed-c"
    },
    sessionMetadata:{
      A:{name:"Torso",focus:"Empuje y tirón",estimatedDurationMinutes:50},
      B:{name:"Pierna",focus:"Tren inferior",estimatedDurationMinutes:55},
      C:{name:"Mixta",focus:"Cuerpo completo",estimatedDurationMinutes:45}
    },
    migrationVersion:"phase-h1"
  };
}

test("crea y aplica una migración legacy A/B/C",()=>{
  const model=loadModel();
  const migrated=plain(model.applyLegacyMigrationPlan(model.createLegacyMigrationPlan(legacyOptions())));
  assert.deepEqual(migrated.sessions.map(item=>item.sessionId),[
    "session-fixed-a","session-fixed-b","session-fixed-c"
  ]);
  assert.deepEqual(migrated.sessions.map(item=>item.legacySessionKey),["A","B","C"]);
  assert.equal(plain(model.validateCanonicalRoutine(migrated)).activation.compatible,true);
});

test("migra una rutina legacy de A/B",()=>{
  const model=loadModel();
  const legacy=legacyFixture();
  delete legacy.C;
  const migrated=plain(model.applyLegacyMigrationPlan(model.createLegacyMigrationPlan(legacyOptions(legacy))));
  assert.equal(migrated.sessions.length,2);
  assert.deepEqual(migrated.sessions.map(item=>item.legacySessionKey),["A","B"]);
});

test("una sesión C vacía se ignora y no se fabrica",()=>{
  const model=loadModel();
  const legacy=legacyFixture();
  legacy.C=[];
  const options=legacyOptions(legacy);
  delete options.sessionMetadata.C;
  const migrated=plain(model.applyLegacyMigrationPlan(model.createLegacyMigrationPlan(options)));
  assert.equal(migrated.sessions.length,2);
  assert.equal(migrated.sessions.some(item=>item.legacySessionKey==="C"),false);
});

test("la migración conserva ejercicios, prescripción e IDs exactamente",()=>{
  const model=loadModel();
  const legacy=legacyFixture();
  const before=json(legacy);
  const migrated=plain(model.applyLegacyMigrationPlan(model.createLegacyMigrationPlan(legacyOptions(legacy))));
  assert.equal(json(legacy),before);
  assert.equal(json(migrated.sessions[0].exercises),json(legacy.A));
  assert.deepEqual(migrated.sessions[0].exercises[0].prescription,legacy.A[0].prescription);
  assert.equal(migrated.sessions[0].exercises[0].id,"legacy-a");
});

test("la migración conserva legacySessionKey y el orden legacy incluso con un hueco",()=>{
  const model=loadModel();
  const legacy=legacyFixture();
  legacy.B=[];
  const options=legacyOptions(legacy);
  delete options.sessionMetadata.B;
  const migrated=plain(model.applyLegacyMigrationPlan(model.createLegacyMigrationPlan(options)));
  assert.deepEqual(migrated.sessions.map(item=>[item.legacySessionKey,item.order]),[["A",1],["C",3]]);
});

test("una sesión vacía con metadatos asociados se conserva sin inventar ejercicios",()=>{
  const model=loadModel();
  const legacy=legacyFixture();
  legacy.B=[];
  legacy.extraMetadata={source:"legacy"};
  const migrated=plain(model.applyLegacyMigrationPlan(model.createLegacyMigrationPlan(legacyOptions(legacy))));
  const session=migrated.sessions.find(item=>item.legacySessionKey==="B");
  assert.ok(session);
  assert.equal(session.order,2);
  assert.deepEqual(session.exercises,[]);
  assert.equal(session.name,"Pierna");
  assert.deepEqual(migrated.extraMetadata,{source:"legacy"});
});

test("falta de ID legacy produce un error explícito",()=>{
  const model=loadModel();
  const options=legacyOptions();
  delete options.sessionIds.B;
  expectModelError(()=>model.createLegacyMigrationPlan(options),"missing_legacy_session_id");
});

test("crear y aplicar el mismo plan dos veces produce el mismo JSON",()=>{
  const model=loadModel();
  const firstPlan=plain(model.createLegacyMigrationPlan(legacyOptions()));
  const secondPlan=plain(model.createLegacyMigrationPlan(legacyOptions()));
  assert.equal(json(firstPlan),json(secondPlan));
  assert.equal(
    json(model.applyLegacyMigrationPlan(firstPlan)),
    json(model.applyLegacyMigrationPlan(secondPlan))
  );
});

test("una rutina canónica pasa sin remigrarse",()=>{
  const model=loadModel();
  const canonical=routine(3);
  const before=json(canonical);
  const plan=plain(model.createLegacyMigrationPlan({legacyRoutine:canonical}));
  assert.equal(plan.kind,"canonical_passthrough");
  assert.equal(json(model.applyLegacyMigrationPlan(plan)),before);
  assert.equal(json(canonical),before);
});

test("el adaptador temporal acepta dos sesiones y devuelve una copia",()=>{
  const model=loadModel();
  const input=routine(2);
  const before=json(input);
  const view=plain(model.canonicalToLegacyRuntimeView(input));
  assert.deepEqual(Object.keys(view),["A","B"]);
  view.A[0].sets=99;
  assert.equal(input.sessions[0].exercises[0].sets,3);
  assert.equal(json(input),before);
});

test("el adaptador temporal acepta tres sesiones usando order",()=>{
  const model=loadModel();
  const input=routine(3);
  input.sessions=[input.sessions[2],input.sessions[0],input.sessions[1]];
  const view=plain(model.canonicalToLegacyRuntimeView(input));
  assert.deepEqual(Object.keys(view),["A","B","C"]);
  assert.equal(view.A[0].id,"exercise-1");
  assert.equal(view.C[0].id,"exercise-3");
});

test("el adaptador temporal rechaza cuatro sesiones sin truncar",()=>{
  const model=loadModel();
  const input=routine(4);
  const before=json(input);
  expectModelError(()=>model.canonicalToLegacyRuntimeView(input),"legacy_runtime_incompatible");
  assert.equal(json(input),before);
  assert.equal(input.sessions.length,4);
});

test("el hash ignora estado visual y timestamps no estructurales",()=>{
  const model=loadModel();
  const first=routine(2);
  const changed=plain(first);
  changed.selectedSession="A";
  changed.uiState={open:true};
  changed.sessions[0].panelState={expanded:true};
  changed.sessions[0].exercises[0].updatedAt="2099-01-01T00:00:00.000Z";
  assert.equal(model.canonicalRoutineHash(first),model.canonicalRoutineHash(changed));
});

test("el hash incluye nombre, duración, ejercicios, prescripción y revision",()=>{
  const model=loadModel();
  const original=routine(2);
  for(const mutate of [
    value=>{value.sessions[0].name="Otro nombre";},
    value=>{value.sessions[0].estimatedDurationMinutes+=1;},
    value=>{value.sessions[0].exercises[0].sets+=1;},
    value=>{value.sessions[0].exercises[0].prescription.tempo="3-1-1";},
    value=>{value.revision+=1;}
  ]){
    const changed=plain(original);
    mutate(changed);
    assert.notEqual(model.canonicalRoutineHash(original),model.canonicalRoutineHash(changed));
  }
});

test("el módulo puro no contiene fuentes de IDs, tiempo ni efectos externos",()=>{
  const forbidden=[
    /Math\.random/,/Date\.now/,/\bcrypto\b/,/\bdocument\b/,/\blocalStorage\b/,
    /\bsessionStorage\b/,/\bfetch\s*\(/,/\bXMLHttpRequest\b/,/\bWebSocket\b/,
    /\bSupabase\b/,/\bnavigator\b/,/\bsetTimeout\b/,/\bsetInterval\b/,/\bapp\.js\b/
  ];
  forbidden.forEach(pattern=>assert.doesNotMatch(moduleSource,pattern));
});

test("cargar y usar el módulo no modifica almacenamiento, rutina, historial ni drafts",()=>{
  const storage={
    "gymos:routine":json({A:[exercise("a")],B:[exercise("b")],C:[exercise("c")]}),
    "gymos:history":json([{id:"history-1",session:"A"}]),
    "gymos:draft:A":json({session:"A",exercises:[exercise("a")]}),
    "gymos:draft:B":json({session:"B",exercises:[exercise("b")]}),
    "gymos:draft:C":json({session:"C",exercises:[exercise("c")]})
  };
  const before=json(storage);
  const model=loadModel({storageSentinel:storage});
  model.validateCanonicalRoutine(routine(2));
  model.normalizeCanonicalRoutine(routine(2));
  model.canonicalRoutineHash(routine(2));
  assert.equal(json(storage),before);
});

test("el script se carga exactamente una vez, después de profile-data y antes del generador",()=>{
  const matches=indexSource.match(/<script src="routine-session-model\.js"><\/script>/g)||[];
  assert.equal(matches.length,1);
  assert.ok(indexSource.indexOf('src="profile-data.js"')<indexSource.indexOf('src="routine-session-model.js"'));
  assert.ok(indexSource.indexOf('src="routine-session-model.js"')<indexSource.indexOf('src="routine-generator.js"'));
});

test("el service worker incluye el módulo H1 una vez y usa la caché rc.2",()=>{
  const matches=workerSource.match(/routine-session-model\.js/g)||[];
  assert.equal(matches.length,1);
  assert.match(workerSource,/const GYMOS_BUILD_VERSION="4\.2\.0-rc\.9-adoption916"/);
  assert.match(workerSource,/const CACHE=`gymos-cache-\$\{GYMOS_BUILD_VERSION\}`/);
  assert.equal((workerSource.match(/addEventListener\("fetch"/g)||[]).length,1);
});

test("la API pública queda limitada a responsabilidades puras explícitas",()=>{
  const model=loadModel();
  [
    "normalizeCanonicalRoutine","validateCanonicalRoutine","canonicalRoutineHash",
    "sortSessions","deriveSessionLabel","createLegacyMigrationPlan",
    "applyLegacyMigrationPlan","canonicalToLegacyRuntimeView","isCanonicalRoutine",
    "cloneCanonicalRoutine"
  ].forEach(name=>assert.equal(typeof model[name],"function",name));
  assert.equal(model.SCHEMA_VERSION,"4.2");
  assert.equal(model.MAX_SESSIONS,6);
});
