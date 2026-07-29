const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const root=path.join(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const appSource=read("app.js");
const stylesSource=read("styles.css");
const indexSource=read("index.html");

test("I1 mantiene una única implementación de los puntos consolidados",()=>{
  const count=name=>(appSource.match(new RegExp(`function ${name}\\(`,"g"))||[]).length;
  for(const name of [
    "estimatedOneRepMax","renderExerciseLibrary",
    "renderExerciseLibraryEditor","renderExerciseDetail"
  ]) assert.equal(count(name),1,name);
});

test("I1 e1RM trata una repetición como medición directa",()=>{
  const source=appSource.match(/function estimatedOneRepMax\(weight,reps\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(source);
  const context={};
  vm.runInNewContext(`${source};result=[
    estimatedOneRepMax(100,1),
    estimatedOneRepMax(100,2),
    estimatedOneRepMax(0,8)
  ];`,context);
  assert.deepEqual(Array.from(context.result),[100,100*(1+2/30),0]);
});

test("I1 APIs de módulos quedan congeladas y sus nombres son únicos",()=>{
  const files=[
    "daily-thoughts.js","assets/heroes/manifest.js","recovery-center.js",
    "professional-nutrition.js","nutrition-engine.js","workout-analysis.js",
    "exercise-domain.js","profile-data.js","routine-session-model.js",
    "routine-session-migration.js","routine-session-runtime.js",
    "routine-generator.js","routine-proposals.js","routine-activation.js",
    "routine-io.js","exercise-library-workflow.js","routine-workflow-ui.js"
  ];
  const names=[];
  for(const file of files){
    const source=read(file);
    assert.match(source,/GymOS[A-Za-z0-9_]+\s*=\s*Object\.freeze\(/,file);
    names.push(...Array.from(source.matchAll(/(?:window|global)\.(GymOS[A-Za-z0-9_]+)\s*=/g),match=>match[1]));
  }
  assert.equal(new Set(names).size,names.length);
});

test("I2 no usa alertas genéricas ni eventos onclick inline",()=>{
  assert.doesNotMatch(appSource,/\balert\s*\(/);
  assert.doesNotMatch(`${indexSource}\n${appSource}`,/<[^>]+\sonclick\s*=/i);
});

test("I3 ofrece foco visible y respeta reducción de movimiento",()=>{
  assert.match(stylesSource,/:focus-visible/);
  assert.match(stylesSource,/@media\s*\(prefers-reduced-motion:reduce\)/);
});
