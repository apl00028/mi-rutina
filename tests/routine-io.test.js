const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const root=path.join(__dirname,"..");
const moduleSource=fs.readFileSync(path.join(root,"routine-io.js"),"utf8");
const sessionModelSource=fs.readFileSync(path.join(root,"routine-session-model.js"),"utf8");
const proposalsSource=fs.readFileSync(path.join(root,"routine-proposals.js"),"utf8");
const activationSource=fs.readFileSync(path.join(root,"routine-activation.js"),"utf8");
const workflowSource=fs.readFileSync(path.join(root,"routine-workflow-ui.js"),"utf8");
const appSource=fs.readFileSync(path.join(root,"app.js"),"utf8");
const indexSource=fs.readFileSync(path.join(root,"index.html"),"utf8");
const workerSource=fs.readFileSync(path.join(root,"service-worker.js"),"utf8");
const OWNER_A="11111111-1111-4111-8111-111111111111";
const OWNER_B="22222222-2222-4222-8222-222222222222";
const T1="2026-07-28T10:00:00.000Z";

function plain(value){return JSON.parse(JSON.stringify(value));}
function loadApi(options={}){
  const normalizeOwnerId=value=>{
    if(value==="local"||/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)){
      return value.toLowerCase();
    }
    throw new Error("invalid owner");
  };
  const context={
    console,
    GymOSProfileData:{normalizeOwnerId},
    GymOSExerciseDomain:{
      validateExerciseDefinition:()=>({valid:true,errors:[],warnings:[]})
    },
    GymOSRoutineProposals:{
      stableHash(value){
        const source=JSON.stringify(value);
        let hash=2166136261;
        for(let index=0;index<source.length;index+=1){
          hash^=source.charCodeAt(index);
          hash=Math.imul(hash,16777619);
        }
        return `routine-${(hash>>>0).toString(36)}`;
      },
      activationCompatibility(proposal){
        const count=Array.isArray(proposal?.sessions)?proposal.sessions.length:0;
        return {
          compatible:count>=2&&count<=6,
          reasons:count>6?["La rutina no puede superar seis sesiones."]:[],
          sessionCount:count
        };
      }
    },
    GymOSRoutineGenerator:{
      ESSENTIAL_PATTERNS:options.requiredPatterns||[],
      validateExerciseCompatibility:options.compatibility||(()=>({
        compatible:true,blockers:[],warnings:[],unresolvedQuestions:[]
      }))
    }
  };
  context.globalThis=context;
  vm.runInNewContext(moduleSource,context,{filename:"routine-io.js"});
  return context.GymOSRoutineIO;
}
function exercise(id,name,pattern="horizontal_push",extra={}){
  return {
    id,name,aliases:[],movementPattern:pattern,function:"main",
    requiredEquipment:["bodyweight"],difficulty:"beginner",
    recordTypes:["weight_reps"],category:"strength",...extra
  };
}
function library(){
  return [
    exercise("press","Press de banca","horizontal_push"),
    exercise("row","Remo sentado","horizontal_pull"),
    exercise("squat","Sentadilla","knee_dominant"),
    exercise("hinge","Peso muerto rumano","hip_hinge"),
    exercise("pull","Jalón al pecho","vertical_pull"),
    exercise("plank","Plancha","anti_extension_core",{recordTypes:["duration"]})
  ];
}
function row(session,order,id,name,overrides={}){
  return {
    __rowNumber:order+1,templateVersion:1,session,
    sessionName:`Sesión ${session}`,focus:"full_body",durationMin:45,
    order,exerciseId:id,exerciseName:name,sets:3,target:"8-12 reps",
    rir:"2-3",restSeconds:90,pattern:"",role:"",recordType:"weight_reps",
    notes:"",...overrides
  };
}
function validRows(){
  return [
    row("A",1,"press","Press de banca"),
    row("B",1,"row","Remo sentado")
  ];
}
function convert(api,rows=validRows(),options={}){
  return plain(api.convertRows(rows,{
    exerciseLibrary:options.exerciseLibrary||library(),
    userProfile:options.userProfile||{availableEquipment:["bodyweight"],trainingLocation:"gym"},
    currentLifeState:options.currentLifeState||null
  }));
}
function workbook(api,rows=validRows(),name="Rutina"){
  return {sheets:[{name,rows:api.rowsAsTable(rows)}]};
}

test("1. esquema oficial de columnas",()=>{
  const api=loadApi();
  assert.deepEqual(plain(api.COLUMNS.map(item=>item.header)),[
    "Versión plantilla","Sesión","Nombre de sesión","Enfoque",
    "Duración sesión (min)","Orden de ejercicio","ID de ejercicio","Ejercicio",
    "Series","Objetivo","RIR","Descanso (s)","Patrón","Función",
    "Tipo de registro","Notas"
  ]);
});

test("2. modelo intermedio de plantilla XLSX",()=>{
  const api=loadApi(),model=plain(api.templateModel());
  assert.deepEqual(model.sheets.map(sheet=>sheet.name),["Rutina","Instrucciones"]);
  assert.equal(model.sheets[0].rows.length,1);
  assert.equal(model.sheets[0].rows[0].length,16);
});

test("3. plantilla CSV con BOM y encabezados",()=>{
  const api=loadApi(),csv=api.templateModel().csv;
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv,/Versión plantilla/);
  assert.equal(csv.split(/\r?\n/).length,1);
});

test("4. exporta rutina A/B/C",()=>{
  const api=loadApi();
  const rows=plain(api.exportRoutineRows({
    A:[{id:"press",name:"Press",sets:3,target:"8-12 reps"}],
    B:[{id:"row",name:"Remo",sets:4,target:"10 reps"}],
    C:[{id:"squat",name:"Sentadilla",sets:5,target:"5 reps"}]
  }));
  assert.deepEqual(rows.map(item=>item.session),["A","B","C"]);
});

test("5. no exporta la sesión C vacía",()=>{
  const api=loadApi();
  const rows=api.exportRoutineRows({A:[{id:"press",name:"Press",sets:3,target:"8"}],B:[{id:"row",name:"Remo",sets:3,target:"8"}],C:[]});
  assert.equal(rows.some(item=>item.session==="C"),false);
});

test("5b. exporta seis sesiones canónicas con etiquetas estables",()=>{
  const api=loadApi();
  const rows=plain(api.exportRoutineRows({
    sessions:Array.from({length:6},(_,index)=>({
      sessionId:`session-${index+1}`,
      name:`Día ${index+1}`,
      exercises:[{id:`exercise-${index+1}`,name:`Ejercicio ${index+1}`,sets:3,target:"8"}]
    }))
  }));
  assert.deepEqual(rows.map(item=>item.session),["A","B","C","D","E","F"]);
  assert.deepEqual(rows.map(item=>item.sessionName),[
    "Día 1","Día 2","Día 3","Día 4","Día 5","Día 6"
  ]);
});

test("6. exportación excluye cargas, resultados y estado",()=>{
  const api=loadApi();
  const rows=plain(api.exportRoutineRows({A:[{
    id:"press",name:"Press",sets:3,target:"8",kg:80,done:true,
    results:[{kg:80,reps:8}],draft:{value:1}
  }],B:[],C:[]}));
  const json=JSON.stringify(rows);
  assert.doesNotMatch(json,/"kg"|"results"|"done"|"draft"/);
});

test("7. roundtrip conserva prescripción",()=>{
  const api=loadApi();
  const routine={
    A:[{id:"press",name:"Press de banca",prescription:{sets:4,target:{type:"repetitions",min:6,max:8},targetRir:{min:1,max:2},restSeconds:120,recordType:"weight_reps"}}],
    B:[{id:"row",name:"Remo sentado",prescription:{sets:3,target:{type:"repetitions",min:10,max:12},targetRir:{min:2,max:3},restSeconds:90,recordType:"weight_reps"}}],
    C:[]
  };
  const exported=api.exportRoutineRows(routine);
  const preview=plain(api.inspectWorkbook(workbook(api,exported),{
    fileName:"rutina.xlsx",format:"xlsx",exerciseLibrary:library(),
    userProfile:{availableEquipment:["bodyweight"],trainingLocation:"gym"}
  }));
  const first=preview.imported.sessions[0].rows[0];
  assert.deepEqual(first.prescription,undefined);
  assert.equal(first.sets,4);
  assert.deepEqual(first.target,{type:"repetitions",min:6,max:8});
  assert.deepEqual(first.targetRir,{min:1,max:2});
  assert.equal(first.restSeconds,120);
});

test("8. encabezados toleran tildes y mayúsculas",()=>{
  const api=loadApi();
  const mapped=plain(api.mapHeaders([
    "SESIÓN","ORDEN DE EJERCICIO","ID DE EJERCICIO","SERIES",
    "OBJETIVO","RIR","DESCANSO (S)"
  ]));
  assert.equal(mapped.valid,true);
});

test("9. acepta alias ingleses",()=>{
  const api=loadApi();
  const mapped=plain(api.mapHeaders([
    "session","exercise order","exercise_id","sets","reps","target rir","rest_seconds"
  ]));
  assert.equal(mapped.valid,true);
});

test("10. archivo vacío rechazado",()=>{
  const api=loadApi();
  assert.equal(api.validateFileDescriptor({name:"rutina.xlsx",size:0}).valid,false);
  assert.equal(api.selectRoutineSheet({sheets:[]}).errors[0].code,"empty_workbook");
});

test("11. hoja ambigua rechazada",()=>{
  const api=loadApi();
  const result=plain(api.selectRoutineSheet({
    sheets:[{name:"Uno",rows:[["x"]]},{name:"Dos",rows:[["x"]]}]
  }));
  assert.equal(result.errors[0].code,"ambiguous_sheet");
});

test("12. una sesión rechazada",()=>{
  const api=loadApi(),result=convert(api,[row("A",1,"press","Press de banca")]);
  assert.equal(result.valid,false);
  assert.ok(result.errors.some(item=>item.code==="too_few_sessions"));
});

test("13. siete sesiones rechazadas",()=>{
  const api=loadApi();
  const rows="ABCDEFG".split("").map((session,index)=>row(session,1,index%2?"row":"press",index%2?"Remo sentado":"Press de banca"));
  assert.ok(convert(api,rows).errors.some(item=>item.code==="too_many_sessions"));
});

test("14. sesión con fila vacía de ejercicio rechazada",()=>{
  const api=loadApi();
  const rows=[row("A",1,"","",{exerciseId:"",exerciseName:""}),...validRows()];
  assert.ok(convert(api,rows).errors.some(item=>item.code==="exercise_required"));
});

test("15. más de 20 ejercicios por sesión",()=>{
  const api=loadApi();
  const lib=Array.from({length:22},(_,index)=>exercise(`x-${index}`,`Ejercicio ${index}`));
  const rows=lib.slice(0,21).map((item,index)=>row("A",index+1,item.id,item.name))
    .concat(row("B",1,lib[21].id,lib[21].name));
  assert.ok(convert(api,rows,{exerciseLibrary:lib}).errors.some(item=>item.code==="too_many_session_exercises"));
});

test("16. más de 100 ejercicios totales",()=>{
  const api=loadApi();
  const lib=Array.from({length:102},(_,index)=>exercise(`x-${index}`,`Ejercicio ${index}`));
  const rows=lib.map((item,index)=>row(String.fromCharCode(65+Math.floor(index/17)),index%17+1,item.id,item.name));
  assert.ok(convert(api,rows,{exerciseLibrary:lib}).errors.some(item=>item.code==="too_many_exercises"));
});

test("17. series inválidas",()=>{
  const api=loadApi();
  assert.ok(convert(api,[row("A",1,"press","Press de banca",{sets:11}),row("B",1,"row","Remo sentado")]).errors.some(item=>item.code==="invalid_sets"));
});

test("18. RIR inválido",()=>{
  const api=loadApi();
  assert.ok(convert(api,[row("A",1,"press","Press de banca",{rir:"12"}),row("B",1,"row","Remo sentado")]).errors.some(item=>item.code==="invalid_rir"));
});

test("19. descanso inválido",()=>{
  const api=loadApi();
  assert.ok(convert(api,[row("A",1,"press","Press de banca",{restSeconds:601}),row("B",1,"row","Remo sentado")]).errors.some(item=>item.code==="invalid_rest"));
});

test("20. objetivo inválido",()=>{
  const api=loadApi();
  assert.ok(convert(api,[row("A",1,"press","Press de banca",{target:"muchas"}),row("B",1,"row","Remo sentado")]).errors.some(item=>item.code==="invalid_target"));
});

test("21. orden duplicado",()=>{
  const api=loadApi();
  const rows=[row("A",1,"press","Press de banca"),row("A",1,"row","Remo sentado"),row("B",1,"squat","Sentadilla")];
  assert.ok(convert(api,rows).errors.some(item=>item.code==="duplicate_order"));
});

test("22. matching por ID exacto",()=>{
  const api=loadApi();
  assert.equal(api.matchExercise({exerciseId:"press",exerciseName:""},(()=>{const byId=new Map([["press",library()[0]]]);return {byId,byName:new Map()};})()).exercise.id,"press");
});

test("23. matching por nombre único",()=>{
  const api=loadApi();
  const result=convert(api,[row("A",1,"","Press de banca"),row("B",1,"","Remo sentado")]);
  assert.equal(result.valid,true);
  assert.deepEqual(result.sessions.map(item=>item.rows[0].exerciseId),["press","row"]);
});

test("24. nombre ambiguo bloqueado",()=>{
  const api=loadApi();
  const lib=[exercise("one","Press"),exercise("two","Press"),exercise("row","Remo")];
  const result=convert(api,[row("A",1,"","Press"),row("B",1,"row","Remo")],{exerciseLibrary:lib});
  assert.ok(result.errors.some(item=>item.code==="ambiguous_exercise"));
});

test("25. ejercicio desconocido bloqueado",()=>{
  const api=loadApi();
  const result=convert(api,[row("A",1,"","Press raro"),row("B",1,"row","Remo sentado")]);
  assert.ok(result.errors.some(item=>item.code==="unknown_exercise"));
});

test("26. ID válido y nombre distinto produce warning",()=>{
  const api=loadApi(),result=convert(api,[row("A",1,"press","Nombre distinto"),row("B",1,"row","Remo sentado")]);
  assert.ok(result.warnings.some(item=>item.code==="exercise_name_mismatch"));
  assert.equal(result.sessions[0].rows[0].name,"Press de banca");
});

test("27. patrón del archivo no sustituye la biblioteca",()=>{
  const api=loadApi(),result=convert(api,[row("A",1,"press","Press de banca",{pattern:"hip_hinge"}),row("B",1,"row","Remo sentado")]);
  assert.equal(result.sessions[0].rows[0].pattern,"horizontal_push");
  assert.ok(result.warnings.some(item=>item.code==="pattern_mismatch"));
});

test("28. función del archivo no sustituye la biblioteca",()=>{
  const api=loadApi(),result=convert(api,[row("A",1,"press","Press de banca",{role:"support"}),row("B",1,"row","Remo sentado")]);
  assert.equal(result.sessions[0].rows[0].role,"main");
  assert.ok(result.warnings.some(item=>item.code==="role_mismatch"));
});

test("29. equipamiento incompatible requiere revisión",()=>{
  const api=loadApi({compatibility:()=>({
    compatible:false,blockers:["equipment_or_location_unavailable"],warnings:[],unresolvedQuestions:[]
  })});
  const result=convert(api);
  assert.equal(result.reviewRequired,true);
  assert.ok(result.warnings.some(item=>/equipamiento/.test(item.message)));
});

test("30. restricción incompatible requiere revisión",()=>{
  const api=loadApi({compatibility:()=>({
    compatible:false,blockers:["knee_restriction"],warnings:[],unresolvedQuestions:[]
  })});
  assert.equal(convert(api).reviewRequired,true);
});

test("31. dos sesiones son compatibles",()=>{
  const api=loadApi(),preview=api.previewModel({fileName:"x.csv",format:"csv",sheetName:"Rutina",rowCount:2,result:convert(api)});
  assert.equal(preview.activationCompatible,true);
});

test("32. tres sesiones son compatibles",()=>{
  const api=loadApi(),result=convert(api,[...validRows(),row("C",1,"squat","Sentadilla")]);
  const preview=api.previewModel({fileName:"x.csv",format:"csv",sheetName:"Rutina",rowCount:3,result});
  assert.equal(preview.activationCompatible,true);
});

test("33. cuatro a seis sesiones son activables en H3",()=>{
  const api=loadApi();
  [4,5,6].forEach(count=>{
    const rows=Array.from({length:count},(_,index)=>row(String.fromCharCode(65+index),1,index%2?"row":"press",index%2?"Remo sentado":"Press de banca"));
    const result=convert(api,rows);
    const preview=api.previewModel({fileName:"x.csv",format:"csv",sheetName:"Rutina",rowCount:count,result});
    assert.equal(preview.activationCompatible,true);
    assert.equal(result.sessions.length,count);
  });
});

test("34. fórmulas rechazadas antes de convertir",()=>{
  const api=loadApi();
  const preview=plain(api.inspectWorkbook({...workbook(api),formulaCells:["Rutina!A2"]},{fileName:"x.xlsx",format:"xlsx"}));
  assert.equal(preview.errors[0].code,"formula_not_allowed");
});

test("35. archivo superior a 5 MB rechazado",()=>{
  const api=loadApi();
  assert.equal(api.validateFileDescriptor({name:"x.xlsx",size:api.MAX_FILE_BYTES+1}).errors[0].code,"file_too_large");
});

test("36. CSV formula injection neutralizada y reversible",()=>{
  const api=loadApi();
  ["=1+1","+SUM(A1:A2)","-cmd","@value"].forEach(value=>{
    const protectedValue=api.protectCsvText(value);
    assert.ok(protectedValue.startsWith("'"));
    assert.equal(api.unprotectCsvText(protectedValue),value);
  });
  assert.equal(api.unprotectCsvText(api.protectCsvText("'=literal")),"'=literal");
  assert.ok(api.serializeCsv([{notes:"=1+1"}]).includes(api.CSV_TEXT_GUARD+"=1+1"));
});

test("37. texto HTML se escapa en la preview de app",()=>{
  assert.match(appSource,/preview\.fileName\)/);
  assert.match(appSource,/esc\(exercise\.name\)/);
  assert.doesNotMatch(appSource,/innerHTML\s*\+=\s*preview/);
});

test("38. preview no modifica rutina ni historial",()=>{
  const api=loadApi();
  const routine={A:[{id:"x"}],B:[],C:[]},history=[{id:"h"}];
  const before=[JSON.stringify(routine),JSON.stringify(history)];
  api.inspectWorkbook(workbook(api),{fileName:"x.xlsx",format:"xlsx",exerciseLibrary:library(),userProfile:{availableEquipment:["bodyweight"]}});
  assert.deepEqual([JSON.stringify(routine),JSON.stringify(history)],before);
  assert.doesNotMatch(moduleSource,/saveRoutine\s*\(|saveHistory\s*\(/);
});

test("39. cancelar no modifica datos",()=>{
  const section=appSource.slice(appSource.indexOf('const cancelImport='),appSource.indexOf('const saveImport='));
  assert.doesNotMatch(section,/saveRoutine|saveHistory|persistRoutineProposal|localStorage/);
});

test("40. guardar crea propuesta pending mediante persistRoutineProposal",()=>{
  assert.match(appSource,/const persisted=persistRoutineProposal\(imported/);
  const api=loadApi(),result=convert(api);
  const proposal=plain(api.buildImportedProposal({
    ownerId:OWNER_A,result,baselineHash:"routine-base",format:"csv",
    fileName:"x.csv",generatedAt:T1
  }));
  assert.equal(Object.hasOwn(proposal,"status"),false);
  assert.equal(proposal.version,api.MODEL_VERSION);
  assert.equal(proposal.source.type,"file_import");
});

test("41. guardar no activa la propuesta",()=>{
  const section=appSource.slice(appSource.indexOf('const saveImport='),appSource.indexOf('const prepare='));
  assert.doesNotMatch(section,/activateStoredRoutineProposal|saveRoutine\s*\(|saveHistory\s*\(/);
});

test("42. importación repetida contra el mismo baseline es idempotente",()=>{
  const api=loadApi(),result=convert(api);
  const args={ownerId:OWNER_A,result,baselineHash:"routine-base",templateVersion:1};
  const fingerprint=api.importFingerprint(args);
  const proposal=api.buildImportedProposal({...args,format:"csv",fileName:"uno.csv",generatedAt:T1});
  const record={ownerId:OWNER_A,proposal,lifecycle:{createdAt:T1,status:"pending_review"}};
  assert.equal(api.findExistingImport([record],OWNER_A,fingerprint).proposal.proposalId,proposal.proposalId);
  assert.equal(api.importFingerprint({...args,fileName:"otro.csv"}),fingerprint);
});

test("43. cambio de baseline genera fingerprint distinto",()=>{
  const api=loadApi(),result=convert(api);
  assert.notEqual(
    api.importFingerprint({ownerId:OWNER_A,result,baselineHash:"one"}),
    api.importFingerprint({ownerId:OWNER_A,result,baselineHash:"two"})
  );
});

test("44. cambio de propietario limpia preview",()=>{
  const section=appSource.slice(appSource.indexOf("function ensureRoutineWorkflowState"),appSource.indexOf("function routineWorkflowGenerationSource"));
  assert.match(section,/state\.routineImport=null/);
  const api=loadApi(),result=convert(api);
  assert.notEqual(
    api.importFingerprint({ownerId:OWNER_A,result,baselineHash:"same"}),
    api.importFingerprint({ownerId:OWNER_B,result,baselineHash:"same"})
  );
});

test("45. archivo y bytes no entran en backup o sync",()=>{
  assert.doesNotMatch(moduleSource,/\barrayBuffer\b|\bFileReader\b|\blocalStorage\b|\bsupabase\b|\bdocument\./i);
  const proposalSection=moduleSource.slice(moduleSource.indexOf("function buildImportedProposal"),moduleSource.indexOf("function findExistingImport"));
  assert.doesNotMatch(proposalSection,/bytes|binary|path:/i);
  assert.match(appSource,/routineProposals:getRoutineProposalRecords\(\)/);
});

test("46. propuesta original permanece inmutable",()=>{
  const api=loadApi(),result=convert(api);
  const before=JSON.stringify(result);
  const proposal=api.buildImportedProposal({
    ownerId:OWNER_A,result,baselineHash:"base",format:"xlsx",
    fileName:"x.xlsx",generatedAt:T1
  });
  proposal.sessions[0].exercises[0].name="Cambiado";
  assert.equal(JSON.stringify(result),before);
});

test("47. abrir y cerrar mantiene rutina e historial",()=>{
  const section=appSource.slice(appSource.indexOf("function renderRoutineImport"),appSource.indexOf("function routineWorkflowOwnerId"));
  assert.doesNotMatch(section,/saveRoutine\s*\(|saveHistory\s*\(|markLocalUpdated\s*\(/);
  const routine={A:[{id:"press"}],B:[],C:[]},history=[{session:"A"}];
  const before=`${JSON.stringify(routine)}|${JSON.stringify(history)}`;
  loadApi().templateModel();
  assert.equal(`${JSON.stringify(routine)}|${JSON.stringify(history)}`,before);
});

test("integración de script, input y service worker",()=>{
  assert.ok(indexSource.indexOf("routine-activation.js")<indexSource.indexOf("routine-io.js"));
  assert.ok(indexSource.indexOf("routine-io.js")<indexSource.indexOf("routine-excel.js"));
  assert.ok(indexSource.indexOf("routine-excel.js")<indexSource.indexOf("routine-hub.js"));
  assert.match(indexSource,/id="routineFile" type="file" accept="\.xlsx"/);
  assert.match(workerSource,/gymos-cache-4\.2\.0-routine-hub/);
  assert.match(workerSource,/routine-io\.js/);
  assert.match(workerSource,/routine-excel\.js/);
  assert.match(workerSource,/routine-hub\.js/);
  assert.match(workerSource,/fetch\(e\.request\)/);
  assert.equal((indexSource.match(/routine-io\.js/g)||[]).length,1);
  assert.equal((workerSource.match(/routine-io\.js/g)||[]).length,1);
  const assets=JSON.parse(workerSource.match(/const ASSETS=(\[[^\n]+\]);/)?.[1]||"[]");
  assets.filter(asset=>asset!=="./").forEach(asset=>{
    assert.equal(fs.existsSync(path.join(root,asset)),true,asset);
  });
});

test("rechaza extensiones no permitidas y macros",()=>{
  const api=loadApi();
  [".xlsm",".json",".zip",".exe"].forEach(extension=>{
    assert.equal(api.validateFileDescriptor({name:`x${extension}`,size:10}).valid,false);
  });
  const preview=api.inspectWorkbook({...workbook(api),hasMacros:true},{fileName:"x.xls",format:"xls"});
  assert.equal(preview.errors[0].code,"macros_not_allowed");
});

test("filas y errores conservan contexto corregible",()=>{
  const api=loadApi();
  const result=convert(api,[row("A",1,"press","Press de banca",{sets:0}),row("B",1,"row","Remo sentado")]);
  const error=result.errors.find(item=>item.code==="invalid_sets");
  assert.equal(error.row,2);
  assert.equal(error.column,"Series");
  assert.equal(error.value,"0");
  assert.match(error.message,/1 y 10/);
});

test("la propuesta importada encaja en persistencia C y queda pendiente",()=>{
  const normalizeOwnerId=value=>{
    if(value==="local"||/^[0-9a-f-]{36}$/i.test(String(value))) return String(value).toLowerCase();
    throw new Error("invalid owner");
  };
  const context={
    console,GymOSProfileData:{normalizeOwnerId},
    GymOSExerciseDomain:{
      validateExerciseDefinition:()=>({valid:true,errors:[],warnings:[]})
    },
    GymOSRoutineGenerator:{
      ESSENTIAL_PATTERNS:[],
      validateExerciseCompatibility:()=>({
        compatible:true,blockers:[],warnings:[],unresolvedQuestions:[]
      })
    }
  };
  context.window=context;
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(sessionModelSource,context,{filename:"routine-session-model.js"});
  vm.runInContext(proposalsSource,context,{filename:"routine-proposals.js"});
  vm.runInContext(moduleSource,context,{filename:"routine-io.js"});
  const api=context.GymOSRoutineIO;
  const result=plain(api.convertRows(validRows(),{
    exerciseLibrary:library(),userProfile:{availableEquipment:["bodyweight"]}
  }));
  const currentRoutine={A:[{id:"old",name:"Anterior",sets:3,target:"8 reps"}],B:[],C:[]};
  const baselineHash=context.GymOSRoutineProposals.routineHash(currentRoutine);
  const proposal=api.buildImportedProposal({
    ownerId:OWNER_A,result,baselineHash,format:"xlsx",
    fileName:"plan.xlsx",generatedAt:T1
  });
  const stored=plain(context.GymOSRoutineProposals.storeProposal([],{
    ownerId:OWNER_A,proposal,currentRoutine,timestamp:T1
  }));
  assert.equal(stored.record.lifecycle.status,"pending_review");
  assert.equal(stored.record.proposal.type,"imported");
  assert.equal(Object.hasOwn(stored.record.proposal,"status"),false);
  assert.equal(stored.record.baseline.routineHash,baselineHash);
  assert.deepEqual(currentRoutine,{A:[{id:"old",name:"Anterior",sets:3,target:"8 reps"}],B:[],C:[]});
});

test("contrato completo llega desde archivo hasta createActivationPlan",()=>{
  const normalizeOwnerId=value=>{
    if(value==="local"||/^[0-9a-f-]{36}$/i.test(String(value))) return String(value).toLowerCase();
    throw new Error("invalid owner");
  };
  const context={
    console,GymOSProfileData:{normalizeOwnerId},
    GymOSExerciseDomain:{
      validateExerciseDefinition:()=>({valid:true,errors:[],warnings:[]})
    },
    GymOSRoutineGenerator:{
      ESSENTIAL_PATTERNS:[],
      validateExerciseCompatibility:()=>({
        compatible:true,blockers:[],warnings:[],unresolvedQuestions:[]
      })
    }
  };
  context.window=context;
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(sessionModelSource,context,{filename:"routine-session-model.js"});
  vm.runInContext(proposalsSource,context,{filename:"routine-proposals.js"});
  vm.runInContext(activationSource,context,{filename:"routine-activation.js"});
  vm.runInContext(workflowSource,context,{filename:"routine-workflow-ui.js"});
  vm.runInContext(moduleSource,context,{filename:"routine-io.js"});
  const api=context.GymOSRoutineIO;
  const preview=plain(api.inspectWorkbook(workbook(api),{
    fileName:"plan.xlsx",format:"xlsx",exerciseLibrary:library(),
    userProfile:{availableEquipment:["bodyweight"],trainingLocation:"gym"}
  }));
  const currentRoutine={A:[{id:"old",name:"Anterior",sets:3,target:"8 reps"}],B:[],C:[]};
  const history=[{id:"history-1",session:"A"}];
  const beforeRoutine=JSON.stringify(currentRoutine),beforeHistory=JSON.stringify(history);
  const baselineHash=context.GymOSRoutineProposals.routineHash(currentRoutine);
  const proposal=plain(api.buildImportedProposal({
    ownerId:OWNER_A,result:preview.imported,baselineHash,
    format:"xlsx",fileName:"plan.xlsx",generatedAt:T1
  }));
  [
    "version","proposalId","generatedAt","inputSummary","weeklyStructure",
    "sessions","coverage","validation","warnings","unresolvedQuestions",
    "reviewRequired","activationCompatibility","source"
  ].forEach(key=>assert.ok(Object.hasOwn(proposal,key),key));
  assert.equal(Object.hasOwn(proposal,"status"),false);
  const persisted=plain(context.GymOSRoutineProposals.storeProposal([],{
    ownerId:OWNER_A,proposal,currentRoutine,timestamp:T1
  }));
  const recovered=plain(context.GymOSRoutineProposals.normalizeRecords(
    persisted.records,OWNER_A,{activeProposalId:proposal.proposalId}
  ))[0];
  assert.deepEqual(recovered.activationCompatibility,proposal.activationCompatibility);
  assert.equal(context.GymOSRoutineProposals.validateRecord(recovered,OWNER_A).valid,true);
  const reviewModel=plain(context.GymOSRoutineWorkflowUI.proposalViewModel(recovered,{
    ownerId:OWNER_A,currentRoutine,labels:{}
  }));
  assert.equal(reviewModel.canActivate,true);
  assert.equal(
    context.GymOSRoutineProposals.compareRoutineProposal(currentRoutine,recovered.proposal,{
      baselineHash:recovered.baseline.routineHash,timestamp:T1
    }).stale,
    false
  );
  const activation=plain(context.GymOSRoutineActivation.createActivationPlan({
    ownerId:OWNER_A,proposalRecord:recovered,currentRoutine,
    targetRoutineId:"routine-target-fixed",
    selectedSession:"A",drafts:{A:null,B:null,C:null},
    rawBaseline:{},confirmed:true,timestamp:"2026-07-28T11:00:00.000Z"
  }));
  assert.equal(activation.ok,true);
  assert.deepEqual(activation.routine.A[0].prescription,{
    sets:3,target:{type:"repetitions",min:8,max:12},
    targetRir:{min:2,max:3},restSeconds:90,recordType:"weight_reps"
  });
  assert.equal(activation.routine.A[0].id,"press");
  assert.deepEqual(activation.routine.A[0].equipment,["bodyweight"]);
  const fourRows="ABCD".split("").map((session,index)=>row(
    session,1,index%2?"row":"press",index%2?"Remo sentado":"Press de banca"
  ));
  const fourResult=plain(api.convertRows(fourRows,{
    exerciseLibrary:library(),userProfile:{availableEquipment:["bodyweight"]}
  }));
  const fourProposal=plain(api.buildImportedProposal({
    ownerId:OWNER_A,result:fourResult,baselineHash,
    format:"csv",fileName:"cuatro.csv",generatedAt:T1
  }));
  const fourStored=plain(context.GymOSRoutineProposals.storeProposal([],{
    ownerId:OWNER_A,proposal:fourProposal,currentRoutine,timestamp:T1
  }));
  assert.equal(fourStored.record.activationCompatibility.compatible,true);
  assert.equal(fourStored.record.proposal.sessions.length,4);
  assert.equal(context.GymOSRoutineWorkflowUI.proposalViewModel(fourStored.record,{
    ownerId:OWNER_A,currentRoutine,labels:{}
  }).canActivate,true);
  const activated=plain(context.GymOSRoutineActivation.createActivationPlan({
    ownerId:OWNER_A,proposalRecord:fourStored.record,currentRoutine,
    targetRoutineId:"routine-imported-four",
    confirmed:true,timestamp:"2026-07-28T11:00:00.000Z"
  }));
  assert.equal(activated.ok,true);
  assert.equal(activated.canonicalRoutine.sessions.length,4);
  assert.equal(JSON.stringify(currentRoutine),beforeRoutine);
  assert.equal(JSON.stringify(history),beforeHistory);
});

test("cuatro a seis sesiones persisten completas y quedan activables en H3",()=>{
  const api=loadApi();
  [4,5,6].forEach(count=>{
    const rows=Array.from({length:count},(_,index)=>row(
      String.fromCharCode(65+index),1,index%2?"row":"press",
      index%2?"Remo sentado":"Press de banca"
    ));
    const result=convert(api,rows);
    const proposal=plain(api.buildImportedProposal({
      ownerId:OWNER_A,result,baselineHash:"routine-base",
      format:"csv",fileName:"plan.csv",generatedAt:T1
    }));
    assert.equal(proposal.sessions.length,count);
    assert.equal(proposal.activationCompatibility.compatible,true,`sesiones:${count}`);
    assert.equal(proposal.sessions.flatMap(item=>item.exercises).length,count);
  });
});

test("fingerprint es igual entre XLSX, CSV, cabeceras equivalentes y filas reordenadas",()=>{
  const api=loadApi(),rows=[
    row("A",1,"press","Press de banca",{sets:3}),
    row("A",2,"squat","Sentadilla",{sets:"3.0"}),
    row("B",1,"row","Remo sentado",{sets:3})
  ];
  const xlsxPreview=plain(api.inspectWorkbook(workbook(api,rows),{
    fileName:"uno.xlsx",format:"xlsx",exerciseLibrary:library(),
    userProfile:{availableEquipment:["bodyweight"]}
  }));
  const csvRows=api.exportRoutineRows({sessions:plain(xlsxPreview.imported.sessions).map(session=>({
    name:session.name,focus:session.focus,durationMin:session.durationMin,
    exercises:session.rows.map(item=>({
      id:item.exerciseId,name:item.name,pattern:item.pattern,role:item.role,
      prescription:{
        sets:item.sets,target:item.target,targetRir:item.targetRir,
        restSeconds:item.restSeconds,recordType:item.recordType
      }
    }))
  }))});
  const parsed=api.parseCsvText(api.serializeCsv(csvRows));
  const csvPreview=plain(api.inspectWorkbook({
    sheets:[{name:" rutina ",hidden:false,rows:parsed.rows}]
  },{
    fileName:"dos.csv",format:"csv",exerciseLibrary:library(),
    userProfile:{availableEquipment:["bodyweight"]}
  }));
  const reordered=plain(api.inspectWorkbook(workbook(api,[rows[2],rows[1],rows[0]]),{
    fileName:"uno.xlsx",format:"xlsx",exerciseLibrary:library(),
    userProfile:{availableEquipment:["bodyweight"]}
  }));
  const aliasTable=plain(api.rowsAsTable(rows));
  aliasTable[0]=[
    "VERSION","SESSION","SESSION NAME","FOCUS","DURATION MIN",
    "EXERCISE ORDER","EXERCISE_ID","EXERCISE NAME","SETS","REPS",
    "TARGET RIR","REST_SECONDS","MOVEMENT_PATTERN","ROLE","RECORD_TYPE","NOTES"
  ];
  const aliasPreview=plain(api.inspectWorkbook({
    sheets:[{name:" Rútina ",hidden:false,rows:aliasTable}]
  },{
    fileName:"alias.csv",format:"csv",exerciseLibrary:library(),
    userProfile:{availableEquipment:["bodyweight"]}
  }));
  const args={ownerId:OWNER_A,baselineHash:"routine-base"};
  const fingerprints=[
    api.importFingerprint({...args,result:xlsxPreview.imported}),
    api.importFingerprint({...args,result:csvPreview.imported}),
    api.importFingerprint({...args,result:reordered.imported}),
    api.importFingerprint({...args,result:aliasPreview.imported})
  ];
  assert.equal(new Set(fingerprints).size,1);
  assert.equal(JSON.stringify(xlsxPreview),JSON.stringify(reordered));
  const first=api.buildImportedProposal({
    ...args,result:xlsxPreview.imported,format:"xlsx",fileName:"uno.xlsx",generatedAt:T1
  });
  const second=api.buildImportedProposal({
    ...args,result:reordered.imported,format:"xlsx",fileName:"uno.xlsx",generatedAt:T1
  });
  assert.equal(JSON.stringify(first),JSON.stringify(second));
  const record={
    ownerId:OWNER_A,proposal:first,
    lifecycle:{status:"pending_review",createdAt:T1}
  };
  assert.equal(
    api.findExistingImport([record],OWNER_A,fingerprints[1]).proposal.proposalId,
    first.proposalId
  );
});

test("fingerprint cambia con propietario, prescripción, ejercicio, orden lógico o baseline",()=>{
  const api=loadApi(),base=convert(api);
  const fingerprint=changes=>api.importFingerprint({
    ownerId:changes.ownerId||OWNER_A,
    result:changes.result||base,
    baselineHash:changes.baselineHash||"base"
  });
  const changedSets=convert(api,[row("A",1,"press","Press de banca",{sets:4}),row("B",1,"row","Remo sentado")]);
  const changedExercise=convert(api,[row("A",1,"squat","Sentadilla"),row("B",1,"row","Remo sentado")]);
  const changedOrder=convert(api,[
    row("A",1,"press","Press de banca"),row("A",2,"squat","Sentadilla"),
    row("B",1,"row","Remo sentado")
  ]);
  const swappedOrder=convert(api,[
    row("A",2,"press","Press de banca"),row("A",1,"squat","Sentadilla"),
    row("B",1,"row","Remo sentado")
  ]);
  [
    fingerprint({ownerId:OWNER_B}),fingerprint({result:changedSets}),
    fingerprint({result:changedExercise}),fingerprint({result:changedOrder}),
    fingerprint({baselineHash:"other"})
  ].forEach(value=>assert.notEqual(value,fingerprint({})));
  assert.notEqual(fingerprint({result:changedOrder}),fingerprint({result:swappedOrder}));
});

test("encabezados duplicados y ambiguos se rechazan con columnas originales",()=>{
  const api=loadApi();
  const duplicate=[
    "Sesión","Orden de ejercicio","ID de ejercicio","Ejercicio","exercise_name",
    "Series","Objetivo","RIR","Descanso (s)"
  ];
  const duplicateResult=plain(api.tableRowsToObjects([
    duplicate,["A",1,"press","Press","Otro",3,"8","2",90]
  ]));
  assert.equal(duplicateResult.errors[0].code,"duplicate_header");
  assert.match(duplicateResult.errors[0].column,/Ejercicio/);
  assert.match(duplicateResult.errors[0].column,/exercise_name/);
  const ambiguous=plain(api.mapHeaders([
    "Sesión","Orden","ID de ejercicio","Series","Objetivo","RIR","Descanso","duration"
  ]));
  assert.equal(ambiguous.valid,false);
  assert.equal(ambiguous.ambiguous[0].header,"duration");
  const ambiguousResult=plain(api.tableRowsToObjects([
    ["Sesión","Orden","ID de ejercicio","Series","Objetivo","RIR","Descanso","duration"]
  ]));
  assert.equal(ambiguousResult.errors[0].code,"ambiguous_header");
});

test("selección de hoja respeta Rutina, exclusiones, visibilidad y ambigüedad",()=>{
  const api=loadApi(),data=[["Sesión"]];
  assert.equal(api.selectRoutineSheet({sheets:[
    {name:"Instrucciones",rows:[["Ayuda"]]},
    {name:" RÚTINA ",rows:data}
  ]}).sheet.name," RÚTINA ");
  assert.equal(api.selectRoutineSheet({sheets:[
    {name:"Ejemplo",rows:[["Muestra"]]},
    {name:"Rutina",rows:data}
  ]}).sheet.name,"Rutina");
  assert.equal(api.selectRoutineSheet({sheets:[
    {name:"Datos A",rows:data},{name:"Datos B",rows:data}
  ]}).errors[0].code,"ambiguous_sheet");
  assert.equal(api.selectRoutineSheet({sheets:[
    {name:"Rutina",hidden:true,rows:data}
  ]}).errors[0].code,"hidden_sheet");
  assert.equal(api.selectRoutineSheet({sheets:[
    {name:"Rutina",hidden:true,rows:data},{name:"Plan visible",hidden:false,rows:data}
  ]}).sheet.name,"Plan visible");
  assert.equal(api.selectRoutineSheet({sheets:[
    {name:"Rutina",type:"macro",rows:data}
  ]}).errors[0].code,"macros_not_allowed");
});

test("fórmulas f y F, valores calculados, hojas ocultas y macros se bloquean",()=>{
  const api=loadApi(),base=workbook(api);
  [
    {formulaCells:["Rutina!A2"]},
    {formulaCells:["Oculta!Z500"]}
  ].forEach(extra=>{
    assert.equal(api.inspectWorkbook({...base,...extra},{
      fileName:"x.xlsx",format:"xlsx"
    }).errors[0].code,"formula_not_allowed");
  });
  assert.equal(api.inspectWorkbook({...base,hasMacros:true},{
    fileName:"x.xls",format:"xls"
  }).errors[0].code,"macros_not_allowed");
  assert.match(appSource,/sheet\[key\]\?\.f\|\|sheet\[key\]\?\.F/);
  assert.ok(appSource.indexOf("formulaCells.length")<appSource.indexOf("sheet_to_json"));
  const literal=api.inspectWorkbook({
    sheets:[
      {name:"Rutina",hidden:false,rows:base.sheets[0].rows},
      {name:"Instrucciones",hidden:false,rows:[["=SUM(A1:A2) como texto"]]}
    ],
    formulaCells:[],hasMacros:false
  },{
    fileName:"x.xlsx",format:"xlsx",exerciseLibrary:library(),
    userProfile:{availableEquipment:["bodyweight"]}
  });
  assert.equal(literal.errors.some(item=>item.code==="formula_not_allowed"),false);
});

test("descriptor bloquea macros, doble extensión y MIME incompatible",()=>{
  const api=loadApi();
  [".xlsm",".xlam",".xlsb"].forEach(extension=>{
    assert.equal(api.validateFileDescriptor({name:`x${extension}`,size:10}).valid,false);
  });
  assert.ok(api.validateFileDescriptor({name:"plan.exe.xlsx",size:10}).errors.some(item=>item.code==="manipulated_extension"));
  assert.ok(api.validateFileDescriptor({
    name:"plan.xlsx",size:10,type:"text/csv"
  }).errors.some(item=>item.code==="mime_mismatch"));
  assert.equal(api.validateFileDescriptor({
    name:"plan.xls",size:10,type:"application/vnd.ms-excel"
  }).valid,true);
});

test("CSV injection cubre espacios, controles y conserva apóstrofos legítimos",()=>{
  const api=loadApi();
  ["=SUM(A1:A2)"," +CMD","\t@IMPORT","\n-1+2","-1+2"].forEach(value=>{
    const guarded=api.protectCsvText(value);
    assert.ok(guarded.startsWith(api.CSV_TEXT_GUARD));
    assert.equal(api.unprotectCsvText(guarded),value);
  });
  ["'Texto legítimo","Texto normal"].forEach(value=>{
    assert.equal(api.unprotectCsvText(api.protectCsvText(value)),value);
  });
});

test("CSV robusto conserva comillas, separadores, saltos, Unicode y vacíos",()=>{
  const api=loadApi();
  const rows=[{
    templateVersion:1,session:"A",sessionName:"Fuerza, técnica; control",
    focus:"Tren\nsuperior",durationMin:45,order:1,exerciseId:"press",
    exerciseName:'Press "especial"',sets:3,target:"8-12 reps",rir:"2-3",
    restSeconds:90,pattern:"horizontal_push",role:"main",
    recordType:"weight_reps",notes:"Línea 1\r\nLínea 2 · ñ",extra:""
  }];
  const csv=api.serializeCsv(rows);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv,/'?""especial""/);
  const parsed=api.parseCsvText(csv);
  assert.equal(parsed.errors.length,0);
  const objects=plain(api.tableRowsToObjects(parsed.rows));
  assert.equal(objects.rows[0].sessionName,"Fuerza, técnica; control");
  assert.equal(objects.rows[0].focus,"Tren\nsuperior");
  assert.equal(objects.rows[0].exerciseName,'Press "especial"');
  assert.equal(objects.rows[0].notes,"Línea 1\r\nLínea 2 · ñ");
  assert.equal(api.mapHeaders(["una línea de texto"]).valid,false);
});

test("límites de hojas, columnas, biblioteca y texto bloquean antes de propuesta",()=>{
  const api=loadApi();
  const sheets=Array.from({length:api.MAX_SHEETS+1},(_,index)=>({
    name:`Hoja ${index}`,rows:[["x"]]
  }));
  assert.equal(api.selectRoutineSheet({sheets}).errors[0].code,"too_many_sheets");
  const csvHeader=Array.from({length:api.MAX_COLUMNS+1},(_,index)=>`col-${index}`).join(",");
  assert.ok(api.parseCsvText(csvHeader).errors.some(item=>item.code==="too_many_columns"));
  const duplicatedLibrary=[...library(),exercise("press","Otro press")];
  assert.ok(convert(api,validRows(),{exerciseLibrary:duplicatedLibrary}).errors.some(item=>item.code==="library_duplicate_ids"));
  assert.ok(convert(api,[
    row("A",1,"press","Press de banca",{notes:"x".repeat(1001)}),
    row("B",1,"row","Remo sentado")
  ]).errors.some(item=>item.code==="notes_too_long"));
  const workbookSection=appSource.slice(
    appSource.indexOf("function workbookToRoutineModel"),
    appSource.indexOf("function routineReadError")
  );
  assert.match(workbookSection,/XLSX\.utils\.decode_range\(sheet\["!ref"\]\)/);
  assert.ok(workbookSection.indexOf("decode_range")<workbookSection.indexOf("sheet_to_json"));
});

test("prescripción admite formatos oficiales y rechaza valores ambiguos",()=>{
  const api=loadApi();
  assert.deepEqual(plain(api.parseTarget("8")),{type:"repetitions",min:8,max:8});
  assert.deepEqual(plain(api.parseTarget("8-12")),{type:"repetitions",min:8,max:12});
  assert.deepEqual(plain(api.parseTarget("8–12 reps")),{type:"repetitions",min:8,max:12});
  assert.deepEqual(plain(api.parseTarget("30 s")),{type:"duration",min:30,max:30});
  assert.deepEqual(plain(api.parseTarget("30-45 s")),{type:"duration",min:30,max:45});
  ["muchas","8 kg","=8","-8","12-8"].forEach(value=>assert.equal(api.parseTarget(value),null));
});

test("tipo de registro incoherente conserva datos y exige revisión",()=>{
  const api=loadApi();
  const result=convert(api,[
    row("A",1,"plank","Plancha",{target:"8",recordType:"duration"}),
    row("B",1,"row","Remo sentado")
  ]);
  assert.equal(result.sessions[0].rows[0].target.type,"repetitions");
  assert.equal(result.sessions[0].rows[0].recordType,"duration");
  assert.equal(result.reviewRequired,true);
  assert.ok(result.warnings.some(item=>item.code==="record_type_mismatch"));
});

test("la importación ignora cargas, resultados y estados ejecutados",()=>{
  const api=loadApi();
  const table=plain(api.rowsAsTable(validRows()));
  table[0].push("kg","completed","results");
  table.slice(1).forEach(item=>item.push(100,true,'[{"reps":8}]'));
  const preview=plain(api.inspectWorkbook({
    sheets:[{name:"Rutina",rows:table}]
  },{
    fileName:"plan.xlsx",format:"xlsx",exerciseLibrary:library(),
    userProfile:{availableEquipment:["bodyweight"]}
  }));
  const proposal=api.buildImportedProposal({
    ownerId:OWNER_A,result:preview.imported,baselineHash:"base",
    format:"xlsx",fileName:"plan.xlsx",generatedAt:T1
  });
  proposal.sessions.flatMap(session=>session.exercises).forEach(item=>{
    assert.equal(Object.hasOwn(item,"kg"),false);
    assert.equal(Object.hasOwn(item,"completed"),false);
    assert.equal(Object.hasOwn(item,"results"),false);
  });
});

test("preview es JSON puro y cancelación libera referencias",()=>{
  const api=loadApi(),preview=api.inspectWorkbook(workbook(api),{
    fileName:"plan.xlsx",format:"xlsx",exerciseLibrary:library(),
    userProfile:{availableEquipment:["bodyweight"]}
  });
  assert.doesNotThrow(()=>JSON.stringify(preview));
  assert.doesNotMatch(JSON.stringify(preview),/ArrayBuffer|Uint8Array/);
  const cancelSection=appSource.slice(
    appSource.indexOf("const cancelImport="),
    appSource.indexOf("const saveImport=")
  );
  assert.match(cancelSection,/state\.routineImport=null/);
  assert.match(cancelSection,/routineFile\.value=""/);
  assert.match(cancelSection,/routineImportReadSequence\+=1/);
});

test("cambio de propietario o baseline bloquea guardado",()=>{
  const handler=appSource.slice(
    appSource.indexOf("async function handleRoutineFileSelection"),
    appSource.indexOf("function routineImportIssueList")
  );
  assert.match(handler,/currentRoutineOwnerOrNull\(\)!==ownerAtStart/);
  assert.match(handler,/operationId/);
  const save=appSource.slice(
    appSource.indexOf("const saveImport="),
    appSource.indexOf("const prepare=")
  );
  assert.match(save,/ownerIdAtPreview!==currentOwnerId/);
  assert.match(save,/currentBaselineHash!==state\.routineImport\.baselineHash/);
  assert.match(save,/baseline_changed/);
  assert.ok(save.indexOf("baseline_changed")<save.indexOf("persistRoutineProposal"));
});

test("busy impide doble lectura, exportación, plantilla y persistencia",()=>{
  const read=appSource.slice(
    appSource.indexOf("async function handleRoutineFileSelection"),
    appSource.indexOf("function routineImportIssueList")
  );
  assert.match(read,/state\.routineFileBusy==="reading"\) return/);
  assert.match(read,/finally[\s\S]*state\.routineFileBusy=null/);
  const eventStart=appSource.indexOf("function bindRoutineWorkflowEvents");
  const events=appSource.slice(
    eventStart,appSource.indexOf("function renderRoutineWorkflow",eventStart)
  );
  assert.match(events,/if\(state\.routineFileBusy\) return/);
  assert.match(events,/state\.routineFileBusy="exporting"/);
  assert.match(events,/state\.routineFileBusy="template"/);
  assert.match(events,/state\.routineFileBusy="saving"/);
});

test("exportación y plantilla no causan efectos funcionales",()=>{
  const exportSection=appSource.slice(
    appSource.indexOf("function exportCurrentRoutineFile"),
    appSource.indexOf("function routineImportContext")
  );
  assert.doesNotMatch(exportSection,/markLocalUpdated|saveCurrentUserVault|scheduleAutoSync|persistRoutineProposal|saveRoutine\s*\(|saveHistory\s*\(/);
  assert.doesNotMatch(exportSection,/localStorage\.(setItem|removeItem)|saveRoutineProposalRecords|saveRoutineActivationRecords/);
  assert.match(exportSection,/routineHubCurrentRoutine\(\)/);
  const downloadSection=appSource.slice(
    appSource.indexOf("function downloadRoutineFile"),
    appSource.indexOf("function styleRoutineWorksheet")
  );
  assert.match(downloadSection,/URL\.revokeObjectURL\(url\)/);
  assert.match(downloadSection,/anchor\.remove\(\)/);
});

test("exportar XLSX y descargar la plantilla conserva storage relevante exacto",()=>{
  const api=loadApi();
  const excelSource=fs.readFileSync(path.join(root,"routine-excel.js"),"utf8");
  const excelContext={window:{}};
  vm.createContext(excelContext);
  vm.runInContext(excelSource,excelContext,{filename:"routine-excel.js"});
  const storage={
    "gymos:routine":JSON.stringify({
      A:[{id:"press",name:"Press de banca",sets:3,target:"8-12 reps"}],
      B:[{id:"row",name:"Remo sentado",sets:3,target:"8-12 reps"}],C:[]
    }),
    "gymos:history":JSON.stringify([{id:"h-1"}]),
    "gymos:updatedAt":"2026-07-28T09:00:00.000Z",
    "gymos:localRevision":"revision-7",
    "gymos:syncPending":"true",
    "gymos:userVaults":JSON.stringify({[OWNER_A]:{routine:"preserved"}}),
    "gymos:routineProposals":JSON.stringify([{proposalId:"p-1"}]),
    "gymos:routineActivationHistory":JSON.stringify([{activationId:"a-1"}])
  };
  const before=JSON.stringify(storage);
  const start=appSource.indexOf("function exportCurrentRoutineFile");
  const end=appSource.indexOf("function routineImportContext",start);
  const functions=appSource.slice(start,end);
  const downloads=[];
  const context={
    routineIoApi:()=>api,
    currentRoutineOwnerOrNull:()=>OWNER_A,
    routineHubCurrentRoutine:()=>JSON.parse(storage["gymos:routine"]),
    window:{GymOSRoutineExcel:excelContext.window.GymOSRoutineExcel},
    downloadRoutineFile:(content,name,type)=>downloads.push({kind:"blob",content,name,type}),
    downloadRoutineWorkbook:(model,name)=>downloads.push({kind:"workbook",model,name}),
    Date
  };
  vm.createContext(context);
  vm.runInContext(functions,context,{filename:"routine-export-functions.js"});
  context.exportCurrentRoutineFile("xlsx",OWNER_A);
  context.downloadOfficialRoutineTemplate("xlsx");
  assert.throws(()=>context.exportCurrentRoutineFile("csv",OWNER_A),/XLSX/);
  assert.throws(()=>context.downloadOfficialRoutineTemplate("csv"),/XLSX/);
  assert.equal(downloads.length,2);
  assert.equal(JSON.stringify(storage),before);
});
