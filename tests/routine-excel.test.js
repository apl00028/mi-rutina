"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const root=path.resolve(__dirname,"..");
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
    GymOSExerciseDomain:{validateExerciseDefinition:()=>({valid:true,errors:[],warnings:[]})},
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
  vm.runInContext(ioSource,context,{filename:"routine-io.js"});
  vm.runInContext(excelSource,context,{filename:"routine-excel.js"});
  return {io:context.GymOSRoutineIO,excel:context.GymOSRoutineExcel};
}
function library(){
  return [
    {id:"press",name:"Press de banca",aliases:[],movementPattern:"horizontal_push",function:"main",requiredEquipment:["bodyweight"],difficulty:"beginner",recordTypes:["weight_reps"],category:"strength"},
    {id:"row",name:"Remo sentado",aliases:[],movementPattern:"horizontal_pull",function:"main",requiredEquipment:["bodyweight"],difficulty:"beginner",recordTypes:["weight_reps"],category:"strength"}
  ];
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

test("Excel v2 usa una única definición para sus cinco hojas",()=>{
  const {excel}=loadApi();
  const model=plain(excel.templateModel());
  assert.deepEqual(model.sheets.map(sheet=>sheet.name),[
    "Instrucciones","Sesiones","Rutina","_Catálogos","_GymOS"
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
