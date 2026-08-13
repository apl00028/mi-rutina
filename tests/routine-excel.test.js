"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const root=path.resolve(__dirname,"..");
const catalogSource=fs.readFileSync(path.join(root,"built-in-exercise-catalog.js"),"utf8");
const domainSource=fs.readFileSync(path.join(root,"exercise-domain.js"),"utf8");
const ioSource=fs.readFileSync(path.join(root,"routine-io.js"),"utf8");
const excelSource=fs.readFileSync(path.join(root,"routine-excel.js"),"utf8");
const appSource=fs.readFileSync(path.join(root,"app.js"),"utf8");

function plain(value){return JSON.parse(JSON.stringify(value));}
function stableHash(value){
  const source=JSON.stringify(value);
  let hash=2166136261;
  for(let index=0;index<source.length;index+=1){
    hash^=source.charCodeAt(index);
    hash=Math.imul(hash,16777619);
  }
  return `routine-${(hash>>>0).toString(36)}`;
}
function loadApi(){
  const context={
    console,
    GymOSProfileData:{normalizeOwnerId:value=>value},
    GymOSRoutineProposals:{
      stableHash,
      activationCompatibility:value=>{
        const count=value?.sessions?.length||0;
        return {compatible:count>=2&&count<=6,sessionCount:count,reasons:[]};
      }
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
  vm.runInContext(catalogSource,context,{filename:"built-in-exercise-catalog.js"});
  vm.runInContext(domainSource,context,{filename:"exercise-domain.js"});
  context.GymOSExerciseDomain={
    ...context.GymOSExerciseDomain,
    validateExerciseDefinition:()=>({valid:true,errors:[],warnings:[]})
  };
  vm.runInContext(ioSource,context,{filename:"routine-io.js"});
  vm.runInContext(excelSource,context,{filename:"routine-excel.js"});
  return {
    io:context.GymOSRoutineIO,excel:context.GymOSRoutineExcel,
    catalog:context.GymOSBuiltInExerciseCatalog,domain:context.GymOSExerciseDomain
  };
}
function library(){
  return [
    {id:"press",name:"Press de banca",aliases:[],movementPattern:"horizontal_push",function:"main",requiredEquipment:["bodyweight"],difficulty:"beginner",recordTypes:["weight_reps"],category:"strength"},
    {id:"row",name:"Remo sentado",aliases:[],movementPattern:"horizontal_pull",function:"main",requiredEquipment:["bodyweight"],difficulty:"beginner",recordTypes:["weight_reps"],category:"strength"}
  ];
}
function canonicalLibrary(api){
  return api.catalog.get().map(exercise=>({
    ...exercise,...plain(api.domain.LEGACY_EXERCISE_METADATA[exercise.id])
  }));
}
function routine(){
  return {
    schemaVersion:"4.2",routineId:"routine-private",revision:7,
    sessions:[
      {
        sessionId:"session-private-a",order:1,label:"A",name:"Torso",
        focus:"upper",estimatedDurationMinutes:55,notes:"Sin prisa",
        exercises:[{
          exerciseId:"press",name:"Press de banca",notes:"Pausa breve",
          prescription:{sets:4,target:{type:"repetitions",min:6,max:8},targetRir:{min:1,max:2},restSeconds:120,recordType:"weight_reps"}
        }]
      },
      {
        sessionId:"session-private-b",order:2,label:"B",name:"Espalda",
        focus:"upper",estimatedDurationMinutes:45,notes:"",
        exercises:[{
          exerciseId:"row",name:"Remo sentado",notes:"",
          prescription:{sets:3,target:{type:"repetitions",min:10,max:12},targetRir:{min:2,max:3},restSeconds:90,recordType:"weight_reps"}
        }]
      }
    ]
  };
}

test("Excel v2 usa una única definición y añade Biblioteca solo a la plantilla",()=>{
  const {excel}=loadApi();
  const model=plain(excel.templateModel());
  assert.deepEqual(model.sheets.map(sheet=>sheet.name),[
    "Instrucciones","Sesiones","Rutina","Biblioteca","_Catálogos","_GymOS"
  ]);
  assert.equal(model.sheets.find(sheet=>sheet.name==="_Catálogos").hidden,true);
  assert.equal(model.sheets.find(sheet=>sheet.name==="_GymOS").veryHidden,true);
  assert.deepEqual(
    model.sheets.find(sheet=>sheet.name==="Sesiones").rows[0].slice(0,6),
    ["Sesión","Orden","Nombre","Enfoque","Duración estimada (min)","Notas de sesión"]
  );
  assert.deepEqual(
    model.sheets.find(sheet=>sheet.name==="Rutina").rows[0].slice(0,11),
    ["Sesión","Orden","Ejercicio","Series","Tipo de objetivo","Objetivo mínimo",
      "Objetivo máximo","RIR mínimo","RIR máximo","Descanso (s)","Notas"]
  );
  assert.equal(plain(excel.workbookModel(routine())).sheets.some(sheet=>sheet.name==="Biblioteca"),false);
});

test("la plantilla física se genera determinísticamente desde el esquema",()=>{
  const {templateBuffer}=require("../scripts/generate-routine-template.js");
  const stored=fs.readFileSync(path.join(root,"plantilla-rutina-gymos.xlsx"));
  assert.deepEqual(templateBuffer(),stored);
});

test("detecta la plantilla antigua sin inventar prescripción",()=>{
  const {excel}=loadApi();
  const preview=plain(excel.inspectWorkbook({sheets:[{
    name:"Rutina",rows:[[
      "Sesión","Orden","Ejercicio","Series","Reps mín.","Reps máx.","Incremento kg","Tipo"
    ],["A",1,"Press",3,8,10,2.5,"peso"]]
  }]},{fileName:"antigua.xlsx",format:"xlsx"}));
  assert.equal(preview.canSave,false);
  assert.equal(preview.errors[0].code,"obsolete_template");
  assert.match(preview.errors[0].message,/versión anterior/);
});

test("errores v2 incluyen hoja, fila, columna y celda",()=>{
  const {excel}=loadApi();
  const model=plain(excel.workbookModel(routine()));
  const routineSheet=model.sheets.find(sheet=>sheet.name==="Rutina");
  routineSheet.rows[1][9]=700;
  const preview=plain(excel.inspectWorkbook(model,{
    fileName:"rutina.xlsx",format:"xlsx",exerciseLibrary:library(),
    userProfile:{availableEquipment:["bodyweight"],trainingLocation:"gym"}
  }));
  const error=preview.errors.find(item=>item.code==="invalid_rest");
  assert.deepEqual(error.location,{
    sheet:"Rutina",row:2,column:"Descanso (s)",cell:"J2"
  });
});

test("fórmulas, enlaces externos y macros se rechazan antes de convertir",()=>{
  const {excel}=loadApi();
  const preview=plain(excel.inspectWorkbook({
    sheets:[],formulaCells:[{sheet:"Rutina",cell:"J8",value:"WEBSERVICE(...)"}],
    externalLinks:[{target:"https://example.invalid/data"}],hasMacros:true
  },{fileName:"hostil.xlsx",format:"xlsx"}));
  assert.deepEqual(preview.errors.map(item=>item.code),[
    "formula_not_allowed","external_link_not_allowed","macros_not_allowed"
  ]);
  assert.equal(preview.canSave,false);
});

test("exportar e importar conserva semántica y no incluye datos personales",()=>{
  const {excel,io}=loadApi();
  const model=plain(excel.workbookModel(routine()));
  const serialized=JSON.stringify(model);
  assert.doesNotMatch(serialized,/owner|email|history|draft|token/i);
  assert.ok(model.sheets.find(sheet=>sheet.name==="Sesiones").hiddenColumns.length);
  assert.ok(model.sheets.find(sheet=>sheet.name==="Rutina").hiddenColumns.length);
  const preview=plain(excel.inspectWorkbook(model,{
    fileName:"rutina.xlsx",format:"xlsx",exerciseLibrary:library(),
    userProfile:{availableEquipment:["bodyweight"],trainingLocation:"gym"}
  }));
  assert.equal(preview.canSave,true);
  assert.equal(preview.sessionCount,2);
  assert.equal(preview.sessions[0].durationMin,55);
  const imported=excel.importedProposalResult(preview.imported);
  const canonical=io.canonicalImportedRoutine(imported);
  assert.deepEqual(plain(canonical.map(session=>session.id)),[
    "session-private-a","session-private-b"
  ]);
  assert.deepEqual(preview.sessions[0].exercises[0],{
    order:1,name:"Press de banca",sets:4,target:"6-8 reps",
    rir:"1-2",restSeconds:120,notes:"Pausa breve"
  });
});

test("claves visibles estables toleran etiquetas duplicadas",()=>{
  const {excel}=loadApi();
  const value=routine();
  value.sessions[0].label="Día";
  value.sessions[1].label="Día";
  const model=plain(excel.workbookModel(value));
  assert.deepEqual(
    model.sheets.find(sheet=>sheet.name==="Sesiones").rows.slice(1).map(row=>row[0]),
    ["A","B"]
  );
});

test("sesiones vacías se conservan como revisión pendiente",()=>{
  const {excel}=loadApi();
  const value=routine();
  value.sessions[1].exercises=[];
  const preview=plain(excel.inspectWorkbook(excel.workbookModel(value),{
    fileName:"rutina.xlsx",format:"xlsx",exerciseLibrary:library(),
    userProfile:{availableEquipment:["bodyweight"],trainingLocation:"gym"}
  }));
  assert.equal(preview.canSave,true);
  assert.equal(preview.reviewRequired,true);
  assert.equal(preview.imported.sessions[1].rows.length,0);
  assert.ok(preview.warnings.some(item=>item.code==="empty_session_review_required"));
});

test("schema incompatible e hipervínculos externos se bloquean",()=>{
  const {excel}=loadApi();
  const model=plain(excel.workbookModel(routine()));
  model.sheets.find(sheet=>sheet.name==="_GymOS").rows[1][1]="5.0";
  assert.equal(excel.inspectWorkbook(model).errors[0].code,"unsupported_schema_version");
  assert.match(appSource,/sheet\[key\]\?\.l\?\.Target/);
  const linked=plain(excel.inspectWorkbook({
    sheets:[],externalLinks:[{sheet:"Rutina",cell:"C2",target:"https://invalid.example"}]
  }));
  assert.equal(linked.errors[0].location.cell,"C2");
});

test("Biblioteca expone los 100 ejercicios canónicos con cabeceras y orden exactos",()=>{
  const {excel,catalog,domain}=loadApi();
  const source=plain(catalog.get());
  const sheet=plain(excel.templateModel()).sheets.find(item=>item.name==="Biblioteca");
  assert.deepEqual(sheet.rows[0],[
    "_GymOS exercise","Ejercicio","Alias","Patrón","Subpatrón",
    "Músculos principales","Músculos secundarios","Equipamiento técnico",
    "Grupo visible","Equipamiento visible","Tipo","Notas"
  ]);
  assert.equal(sheet.rows.length,101);
  assert.deepEqual(sheet.rows.slice(1).map(row=>row[0]),source.map(item=>item.id));
  assert.deepEqual(sheet.rows.slice(1).map(row=>row[1]),source.map(item=>item.name));
  for(const id of ["bench-press","back-squat","hip-flexor-stretch"]){
    const row=sheet.rows.find(item=>item[0]===id);
    const base=source.find(item=>item.id===id);
    const metadata=domain.LEGACY_EXERCISE_METADATA[id];
    assert.equal(row[2],plain(metadata.aliases).join(" · "));
    assert.equal(row[3],metadata.movementPattern);
    assert.equal(row[5],plain(metadata.primaryMuscles).join(" · "));
    assert.equal(row[8],base.muscle);
    assert.equal(row[11],base.notes);
  }
});

test("las instrucciones explican biblioteca, ChatGPT, estructura y activación",()=>{
  const {excel}=loadApi();
  const text=plain(excel.templateModel()).sheets.find(item=>item.name==="Instrucciones")
    .rows.flat().join(" ");
  assert.match(text,/Biblioteca/);
  assert.match(text,/ChatGPT/);
  assert.match(text,/_GymOS exercise es la única identidad autoritativa/);
  assert.match(text,/no lo traduzcas, abrevies, modifiques ni inventes/);
  assert.match(text,/GymOS lo reemplaza por el nombre oficial del ID válido/);
  assert.match(text,/aunque el texto corresponda a otro ejercicio conocido/);
  assert.match(text,/_Catálogos y _GymOS/);
  assert.match(text,/propuesta para revisar/);
  assert.match(text,/cuando actives/);
});

test("importar ignora Biblioteca y no muta el catálogo",()=>{
  const {excel}=loadApi();
  const exercises=library();
  const before=JSON.stringify(exercises);
  const model=plain(excel.workbookModel(routine()));
  model.sheets.splice(3,0,{name:"Biblioteca",rows:[["_GymOS exercise","Ejercicio"],["inventado","Inventado"]]});
  const result=plain(excel.inspectWorkbook(model,{
    fileName:"rutina.xlsx",format:"xlsx",exerciseLibrary:exercises,
    userProfile:{availableEquipment:["bodyweight"],trainingLocation:"gym"}
  }));
  assert.equal(result.canSave,true);
  assert.equal(JSON.stringify(exercises),before);
  assert.equal(result.sessions[0].exercises[0].name,"Press de banca");
});

test("Excel usa el ID válido como autoridad y conserva el flujo sin ID",()=>{
  const {excel}=loadApi();
  const context={
    fileName:"rutina.xlsx",format:"xlsx",exerciseLibrary:library(),
    userProfile:{availableEquipment:["bodyweight"],trainingLocation:"gym"}
  };
  const valid=plain(excel.workbookModel(routine()));
  assert.equal(excel.inspectWorkbook(valid,context).canSave,true);

  const unknown=plain(excel.workbookModel(routine()));
  unknown.sheets.find(item=>item.name==="Rutina").rows[1][11]="inventado";
  assert.ok(excel.inspectWorkbook(unknown,context).errors.some(item=>item.code==="unknown_exercise_id"));

  const mismatch=plain(excel.workbookModel(routine()));
  mismatch.sheets.find(item=>item.name==="Rutina").rows[1][2]="Remo sentado";
  const normalized=plain(excel.inspectWorkbook(mismatch,context));
  assert.equal(normalized.canSave,true);
  assert.equal(normalized.errors.length,0);
  assert.equal(normalized.correctionCount,1);
  assert.equal(normalized.sessions[0].exercises[0].name,"Press de banca");

  const withoutId=plain(excel.workbookModel(routine()));
  withoutId.sheets.find(item=>item.name==="Rutina").rows[1][11]="";
  assert.equal(excel.inspectWorkbook(withoutId,context).canSave,true);
});

test("cuatro IDs reales prevalecen sobre nombres canónicos de otros ejercicios",()=>{
  const api=loadApi(),{excel}=api;
  const exercises=plain(api.domain.migrateExerciseLibrary(api.catalog.get()).library);
  const byId=new Map(exercises.map(item=>[item.id,item]));
  const mismatches=new Map([
    ["leg-curl",byId.get("lying-leg-curl").name],
    ["biceps-curl",byId.get("barbell-curl").name],
    ["triceps-pushdown",byId.get("rope-pushdown").name],
    ["calf-raise",byId.get("seated-calf-raise").name]
  ]);
  const required=[...mismatches.keys()];
  const extra=exercises.filter(item=>
    !required.includes(item.id)&&item.recordTypes?.includes("weight_reps")
  ).slice(0,10);
  const selected=[...required.map(id=>byId.get(id)),...extra];
  assert.equal(selected.length,14);
  const sizes=[5,5,4];
  let offset=0;
  const source={schemaVersion:"4.2",routineId:"authoritative-ids",revision:1,sessions:sizes.map((size,index)=>{
    const sessionExercises=selected.slice(offset,offset+size);
    offset+=size;
    return {
      sessionId:`session-${index+1}`,order:index+1,label:String.fromCharCode(65+index),
      name:`Sesión ${index+1}`,focus:"full_body",estimatedDurationMinutes:50,notes:"",
      exercises:sessionExercises.map(item=>({
        exerciseId:item.id,name:mismatches.get(item.id)||item.name,notes:"",
        prescription:{sets:3,target:{type:"repetitions",min:8,max:12},targetRir:{min:1,max:3},restSeconds:90,recordType:"weight_reps"}
      }))
    };
  })};
  const preview=plain(excel.inspectWorkbook(plain(excel.workbookModel(source)),{
    fileName:"cuatro-normalizaciones.xlsx",format:"xlsx",exerciseLibrary:exercises,
    userProfile:{availableEquipment:[],trainingLocation:"gym"}
  }));
  assert.equal(preview.canSave,true);
  assert.equal(preview.errors.length,0);
  assert.equal(preview.reviewRequired,false);
  assert.equal(preview.sessionCount,3);
  assert.equal(preview.exerciseCount,14);
  assert.equal(preview.correctionCount,4);
  assert.deepEqual(preview.corrections.map(item=>item.exerciseId),required);
  const importedNames=preview.sessions.flatMap(session=>session.exercises.map(item=>item.name));
  required.forEach(id=>assert.ok(importedNames.includes(byId.get(id).name)));
});

test("tres IDs reales normalizan nombres sin bloquear ni perder contadores",()=>{
  const api=loadApi(),{excel}=api;
  const source=routine();
  source.sessions[0].exercises=[
    {
      exerciseId:"triceps-pushdown",name:"Extensión de tríceps en polea",
      prescription:{sets:3,target:{type:"repetitions",min:10,max:12},targetRir:{min:2,max:3},restSeconds:90}
    },
    {
      exerciseId:"leg-curl",name:"Flexión de rodilla en máquina",
      prescription:{sets:3,target:{type:"repetitions",min:10,max:15},targetRir:{min:2,max:3},restSeconds:90}
    }
  ];
  source.sessions[1].exercises=[{
    exerciseId:"calf-raise",name:"",
    prescription:{sets:4,target:{type:"repetitions",min:12,max:15},targetRir:{min:1,max:2},restSeconds:60}
  }];
  const model=plain(excel.workbookModel(source));
  const preview=plain(excel.inspectWorkbook(model,{
    fileName:"tres-normalizaciones.xlsx",format:"xlsx",
    exerciseLibrary:canonicalLibrary(api),userProfile:{availableEquipment:[],trainingLocation:"gym"}
  }));
  assert.equal(preview.canSave,true);
  assert.equal(preview.errors.length,0);
  assert.equal(preview.correctionCount,3);
  assert.equal(preview.sessionCount,2);
  assert.equal(preview.exerciseCount,3);
  assert.equal(preview.reviewRequired,false);
  assert.deepEqual(preview.sessions.flatMap(session=>session.exercises.map(item=>item.name)),[
    "Extensión de tríceps en polea con barra","Curl femoral sentado","Elevación de gemelos en máquina"
  ]);
  assert.deepEqual(preview.corrections.map(item=>item.exerciseId),[
    "triceps-pushdown","leg-curl","calf-raise"
  ]);
});

test("la plantilla física contiene Biblioteca visible, 100 filas de datos y ninguna fórmula",()=>{
  const {excel,catalog,domain}=loadApi();
  const XLSX=require("../vendor/xlsx.full.min.js");
  const {templateBuffer}=require("../scripts/generate-routine-template.js");
  const first=templateBuffer();
  const second=templateBuffer();
  assert.deepEqual(first,second);
  const workbook=XLSX.read(first,{type:"buffer",cellFormula:true});
  assert.deepEqual(workbook.SheetNames,[
    "Instrucciones","Sesiones","Rutina","Biblioteca","_Catálogos","_GymOS"
  ]);
  const librarySheet=workbook.Sheets.Biblioteca;
  const rows=XLSX.utils.sheet_to_json(librarySheet,{header:1,defval:""});
  assert.equal(rows.length,101);
  assert.equal(workbook.Workbook.Sheets.find(item=>item.name==="Biblioteca").Hidden,0);
  assert.equal(Object.values(librarySheet).some(cell=>cell&&typeof cell==="object"&&cell.f),false);
  const model={sheets:workbook.SheetNames.map(name=>({
    name,rows:XLSX.utils.sheet_to_json(workbook.Sheets[name],{header:1,defval:""})
  }))};
  const exerciseLibrary=plain(domain.migrateExerciseLibrary(catalog.get()).library);
  const inspection=plain(excel.inspectWorkbook(model,{
    fileName:"plantilla-rutina-gymos.xlsx",format:"xlsx",exerciseLibrary,
    userProfile:{availableEquipment:[],trainingLocation:"gym"}
  }));
  assert.deepEqual(inspection.errors,[]);
  assert.equal(inspection.canSave,true);
});
