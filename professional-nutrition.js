(function(){
  "use strict";

  const STORAGE_KEY="gymos:professionalNutritionPlans";
  const DB_NAME="gymos-professional-files";
  const DB_STORE="sources";
  const CATEGORIES=["desayuno","comida","merienda","cena"];
  const CATEGORY_LABELS={desayuno:"Desayuno",comida:"Comida",merienda:"Merienda",cena:"Cena"};
  const PHASE_LABELS={definition:"Definición",maintenance:"Mantenimiento",volume:"Volumen"};
  const MEAL_SHARES={desayuno:.25,comida:.35,merienda:.15,cena:.25};
  const FOOD_DATA=[
    {terms:["pollo","pavo"],role:"protein",kcal:120,protein:23,carbs:0,fat:2},
    {terms:["ternera","vacuno"],role:"protein",kcal:170,protein:22,carbs:0,fat:8},
    {terms:["atún","atun","merluza","pescado blanco"],role:"protein",kcal:110,protein:23,carbs:0,fat:2},
    {terms:["salmón","salmon"],role:"protein-fat",kcal:208,protein:20,carbs:0,fat:13},
    {terms:["huevo"],role:"protein-fat",kcal:143,protein:13,carbs:1,fat:10},
    {terms:["claras"],role:"protein",kcal:48,protein:11,carbs:1,fat:0},
    {terms:["yogur","skyr","queso fresco"],role:"protein",kcal:70,protein:10,carbs:4,fat:1},
    {terms:["proteína","proteina","whey"],role:"protein",kcal:380,protein:78,carbs:8,fat:6},
    {terms:["arroz"],role:"carb",kcal:360,protein:7,carbs:79,fat:1},
    {terms:["pasta"],role:"carb",kcal:350,protein:12,carbs:71,fat:2},
    {terms:["avena"],role:"carb",kcal:380,protein:13,carbs:62,fat:7},
    {terms:["pan"],role:"carb",kcal:260,protein:9,carbs:49,fat:3},
    {terms:["patata","boniato"],role:"carb",kcal:82,protein:2,carbs:18,fat:0},
    {terms:["plátano","platano"],role:"carb",kcal:89,protein:1,carbs:23,fat:0},
    {terms:["fruta"],role:"carb",kcal:55,protein:1,carbs:13,fat:0},
    {terms:["aceite"],role:"added-fat",kcal:900,protein:0,carbs:0,fat:100},
    {terms:["mantequilla","crema de cacahuete"],role:"added-fat",kcal:610,protein:20,carbs:15,fat:50},
    {terms:["frutos secos","almendra","nuez"],role:"added-fat",kcal:610,protein:20,carbs:15,fat:53},
    {terms:["aguacate"],role:"fat",kcal:160,protein:2,carbs:9,fat:15},
    {terms:["verdura","ensalada","brócoli","brocoli","calabacín","calabacin","espinaca","tomate"],role:"vegetable",kcal:30,protein:2,carbs:5,fat:0}
  ];

  const round=(value,step=5)=>Math.max(step,Math.round(value/step)*step);
  const normalizedText=value=>String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
  const number=value=>{
    if(typeof value==="number") return Number.isFinite(value)?value:null;
    const match=String(value??"").replace(",",".").match(/-?\d+(?:\.\d+)?/);
    return match?Number(match[0]):null;
  };
  const bool=value=>["1","si","sí","true","yes","x"].includes(normalizedText(value));
  const uid=()=>crypto.randomUUID?.()||`professional-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const today=()=>new Date().toISOString().slice(0,10);
  function dateValue(value,fallback=today()){
    if(value instanceof Date&&!Number.isNaN(value.getTime())) return value.toISOString().slice(0,10);
    const text=String(value||"").trim();
    const iso=text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const local=text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if(local) return `${local[3]}-${local[2].padStart(2,"0")}-${local[1].padStart(2,"0")}`;
    return fallback;
  }

  function getPlans(){
    try{
      const plans=JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]");
      return Array.isArray(plans)?plans:[];
    }catch(error){return [];}
  }
  function savePlans(plans,mark=true){
    localStorage.setItem(STORAGE_KEY,JSON.stringify(plans.slice(-100)));
    if(mark&&typeof markLocalUpdated==="function") markLocalUpdated();
    return plans;
  }
  function mergePlans(incoming,mark=false){
    const merged=new Map(getPlans().map(plan=>[plan.id,plan]));
    (incoming||[]).forEach(plan=>{
      const current=merged.get(plan.id);
      if(!current||new Date(plan.updatedAt||0)>=new Date(current.updatedAt||0)) merged.set(plan.id,plan);
    });
    return savePlans([...merged.values()],mark);
  }
  function upsertPlan(plan){
    const plans=getPlans();
    const index=plans.findIndex(item=>item.id===plan.id);
    if(index>=0) plans[index]=plan;
    else plans.push(plan);
    savePlans(plans);
    syncWithSupabase();
    if(typeof autoSync==="function") autoSync("planificación nutricional profesional");
    return plan;
  }
  function planById(id){return getPlans().find(plan=>plan.id===id)||null;}

  function openFileDb(){
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open(DB_NAME,1);
      request.onupgradeneeded=()=>request.result.createObjectStore(DB_STORE,{keyPath:"planId"});
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
  }
  async function storeSourceFile(planId,file,dataUrl){
    const db=await openFileDb();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction(DB_STORE,"readwrite");
      transaction.objectStore(DB_STORE).put({planId,name:file.name,type:file.type,size:file.size,lastModified:file.lastModified,dataUrl});
      transaction.oncomplete=()=>resolve();
      transaction.onerror=()=>reject(transaction.error);
    });
  }
  async function getSourceFile(planId){
    const db=await openFileDb();
    return new Promise((resolve,reject)=>{
      const request=db.transaction(DB_STORE).objectStore(DB_STORE).get(planId);
      request.onsuccess=()=>resolve(request.result||null);
      request.onerror=()=>reject(request.error);
    });
  }
  function fileDataUrl(file){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(reader.result);
      reader.onerror=()=>reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
  async function sourceChecksum(buffer){
    if(!crypto.subtle) return "";
    const hash=await crypto.subtle.digest("SHA-256",buffer);
    return [...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
  }

  function normalizedRow(row){
    return Object.fromEntries(Object.entries(row||{}).map(([key,value])=>[normalizedText(key).replace(/[^a-z0-9]+/g,"_"),value]));
  }
  function pick(row,aliases){
    for(const alias of aliases){
      const value=row[normalizedText(alias).replace(/[^a-z0-9]+/g,"_")];
      if(value!==undefined&&value!==null&&String(value).trim()!=="") return value;
    }
    return "";
  }
  function inferCategory(value){
    const text=normalizedText(value);
    if(/desay|breakfast/.test(text)) return "desayuno";
    if(/meriend|snack|pre.?entreno/.test(text)) return "merienda";
    if(/cena|dinner/.test(text)) return "cena";
    return "comida";
  }
  function parseIngredientText(text){
    return String(text||"").split(/\r?\n|;/).map(value=>value.trim()).filter(Boolean).map(line=>{
      const match=line.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l|ud|unidad(?:es)?|cucharad[ao]s?)?\s*$/i)
        ||line.match(/^(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l|ud|unidad(?:es)?|cucharad[ao]s?)?\s+(.+)$/i);
      if(!match) return {id:uid(),name:line,quantity:null,unit:"",alternatives:[]};
      const quantity=number(match[2]&&isNaN(Number(match[1]))?match[2]:match[1]);
      const name=match[3]&&isNaN(Number(match[1]))?match[1]:match[3];
      const unit=match[3]&&isNaN(Number(match[1]))?match[3]:(match[2]||"g");
      return {id:uid(),name:String(name).trim(),quantity,unit:String(unit||"g").trim(),alternatives:[]};
    });
  }
  function mealNutrition(row){
    return {
      calories:number(pick(row,["calorias","calorías","kcal","energia","energía"])),
      protein:number(pick(row,["proteina","proteína","protein"])),
      carbs:number(pick(row,["carbohidratos","hidratos","carbs"])),
      fat:number(pick(row,["grasa","grasas","fat"])),
      fiber:number(pick(row,["fibra","fiber"])),
      micronutrients:pick(row,["micronutrientes","vitaminas","minerales"])||""
    };
  }
  function ingredientNutritionFromRow(row){
    return {
      calories:number(pick(row,["calorias_ingrediente","kcal_ingrediente","ingredient_calories"])),
      protein:number(pick(row,["proteina_ingrediente","ingredient_protein"])),
      carbs:number(pick(row,["carbohidratos_ingrediente","ingredient_carbs"])),
      fat:number(pick(row,["grasa_ingrediente","ingredient_fat"])),
      fiber:number(pick(row,["fibra_ingrediente","ingredient_fiber"]))
    };
  }
  function rowsToMeals(rawRows){
    const groups=new Map();
    rawRows.map(normalizedRow).forEach((row,index)=>{
      const mealName=String(pick(row,["comida","nombre_comida","meal","plato","receta"])||`Comida ${index+1}`).trim();
      const category=inferCategory(pick(row,["categoria","categoría","momento","tipo"])||mealName);
      const time=String(pick(row,["hora","horario","time"])||"").trim();
      const sourceVersion=String(pick(row,["version","versión"])||"").trim();
      const key=`${category}|${normalizedText(mealName)}|${time}|${normalizedText(sourceVersion)}`;
      if(!groups.has(key)){
        groups.set(key,{
          id:uid(),name:mealName,category,time,
          flexibleTime:bool(pick(row,["horario_flexible","flexible"])),
          trainingDay:bool(pick(row,["dia_entrenamiento","día_entrenamiento","training_day","preentreno"])),
          instructions:String(pick(row,["preparacion","preparación","instrucciones","instructions"])||"").trim(),
          nutrition:mealNutrition(row),ingredients:[],alternatives:[],
          sourceVersion
        });
      }
      const meal=groups.get(key);
      const ingredientName=String(pick(row,["ingrediente","alimento","ingredient"])||"").trim();
      const quantity=number(pick(row,["cantidad","quantity","gramos","peso"]));
      const unit=String(pick(row,["unidad","unit"])||"g").trim();
      const alternatives=String(pick(row,["alternativas","equivalencias","alternatives"])||"").split(/\||;|\n/).map(item=>item.trim()).filter(Boolean);
      if(ingredientName){
        meal.ingredients.push({
          id:uid(),name:ingredientName,quantity,unit,
          dryWeight:bool(pick(row,["peso_seco","en_seco","dry_weight"])),
          alternatives,
          nutrition:ingredientNutritionFromRow(row)
        });
      }else{
        parseIngredientText(pick(row,["ingredientes","ingredients"])).forEach(ingredient=>meal.ingredients.push(ingredient));
      }
      meal.alternatives=[...new Set([...meal.alternatives,...alternatives])];
      if(!meal.instructions) meal.instructions=String(pick(row,["preparacion","preparación","instrucciones"])||"").trim();
    });
    return [...groups.values()].filter(meal=>meal.ingredients.length||meal.name);
  }
  function normalizeStructuredMeal(meal,index){
    const category=inferCategory(meal.category||meal.type||meal.name);
    const ingredients=Array.isArray(meal.ingredients)
      ?meal.ingredients.map(ingredient=>({
        id:ingredient.id||uid(),name:String(ingredient.name||ingredient.ingredient||"Ingrediente"),
        quantity:number(ingredient.quantity??ingredient.amount),unit:String(ingredient.unit||"g"),
        dryWeight:Boolean(ingredient.dryWeight??ingredient.dry_weight),
        alternatives:Array.isArray(ingredient.alternatives)?ingredient.alternatives:[],
        nutrition:ingredient.nutrition||{}
      }))
      :parseIngredientText(meal.ingredients);
    return {
      id:meal.id||uid(),name:String(meal.name||`Comida ${index+1}`),category,
      time:String(meal.time||""),flexibleTime:Boolean(meal.flexibleTime),
      trainingDay:Boolean(meal.trainingDay??meal.training_day),
      instructions:String(meal.instructions||meal.preparation||""),
      nutrition:meal.nutrition||{},ingredients,
      alternatives:Array.isArray(meal.alternatives)?meal.alternatives:[],
      sourceVersion:String(meal.sourceVersion||meal.version||"")
    };
  }
  async function parseProfessionalNutritionFile(file){
    const buffer=await file.arrayBuffer();
    let payload;
    if(/\.json$/i.test(file.name)||file.type==="application/json"){
      payload=JSON.parse(new TextDecoder().decode(buffer));
    }else{
      if(!window.XLSX) throw new Error("No se ha podido cargar el lector de hojas de cálculo.");
      const workbook=XLSX.read(buffer,{type:"array",cellDates:true});
      payload=workbook.SheetNames.flatMap(sheet=>XLSX.utils.sheet_to_json(workbook.Sheets[sheet],{defval:""}).map(row=>({...row,__sheet:sheet})));
    }
    const structured=!Array.isArray(payload)&&Array.isArray(payload.meals);
    const sourceRows=Array.isArray(payload)?payload:(payload.rows||payload.data||[]);
    const firstRow=normalizedRow(sourceRows[0]||{});
    const meals=structured?payload.meals.map(normalizeStructuredMeal):rowsToMeals(sourceRows);
    if(!meals.length) throw new Error("No se han encontrado comidas reconocibles en el archivo.");
    const id=uid();
    const dataUrl=await fileDataUrl(file);
    await storeSourceFile(id,file,dataUrl);
    return {
      id,type:"professional_historical",title:structured?String(payload.title||file.name.replace(/\.[^.]+$/,"")):file.name.replace(/\.[^.]+$/,""),
      planDate:structured
        ?dateValue(payload.date,new Date(file.lastModified||Date.now()).toISOString().slice(0,10))
        :dateValue(pick(firstRow,["fecha_plan","fecha","date"]),new Date(file.lastModified||Date.now()).toISOString().slice(0,10)),
      professional:structured
        ?String(payload.professional||payload.source||"")
        :String(pick(firstRow,["profesional","nutricionista","procedencia","origen","source"])||""),
      sourceFile:{name:file.name,type:file.type||"application/octet-stream",size:file.size,lastModified:file.lastModified,checksum:await sourceChecksum(buffer)},
      meals,savedAdaptations:[],importedAt:new Date().toISOString(),updatedAt:new Date().toISOString()
    };
  }

  function foodReference(name){
    const text=normalizedText(name);
    return FOOD_DATA.find(item=>item.terms.some(term=>text.includes(normalizedText(term))))||{role:"other",kcal:150,protein:5,carbs:20,fat:5};
  }
  function ingredientNutrition(ingredient){
    const supplied=ingredient.nutrition||{};
    const quantity=Number(ingredient.quantity||0);
    const unit=normalizedText(ingredient.unit);
    const grams=unit==="kg"?quantity*1000:unit==="l"?quantity*1000:quantity;
    const reference=foodReference(ingredient.name);
    const factor=Math.max(0,grams)/100;
    const direct={
      calories:number(supplied.calories),protein:number(supplied.protein),
      carbs:number(supplied.carbs),fat:number(supplied.fat),fiber:number(supplied.fiber)
    };
    const hasDirect=Object.values(direct).some(value=>value!==null&&value>0);
    return {
      role:reference.role,
      approximate:!hasDirect,
      calories:hasDirect?(direct.calories||0):reference.kcal*factor,
      protein:hasDirect?(direct.protein||0):reference.protein*factor,
      carbs:hasDirect?(direct.carbs||0):reference.carbs*factor,
      fat:hasDirect?(direct.fat||0):reference.fat*factor,
      fiber:hasDirect?(direct.fiber||0):0
    };
  }
  function totalsForIngredients(ingredients){
    return ingredients.reduce((totals,ingredient)=>{
      const values=ingredientNutrition(ingredient);
      ["calories","protein","carbs","fat","fiber"].forEach(field=>totals[field]+=values[field]||0);
      totals.approximate=totals.approximate||values.approximate;
      return totals;
    },{calories:0,protein:0,carbs:0,fat:0,fiber:0,approximate:false});
  }
  function phaseDailyTarget(target,phase){
    const calories=Number(target.calories);
    const protein=Number(target.protein);
    const fat=Number(target.fat);
    if(!calories||!protein||!fat) throw new Error("Calcula primero tus objetivos nutricionales.");
    if(phase==="definition"){
      const phaseCalories=Math.round(calories*.85);
      const phaseFat=Math.max(Math.round(fat*.85),45);
      return {calories:phaseCalories,protein:Math.max(protein,Math.round(protein*1.02)),fat:phaseFat,carbs:Math.max(0,Math.round((phaseCalories-protein*4-phaseFat*9)/4))};
    }
    if(phase==="volume"){
      const phaseCalories=Math.round(calories*1.12);
      const phaseFat=Math.round(fat*1.05);
      return {calories:phaseCalories,protein, fat:phaseFat,carbs:Math.max(0,Math.round((phaseCalories-protein*4-phaseFat*9)/4))};
    }
    return {calories,protein,carbs:Number(target.carbs||Math.max(0,(calories-protein*4-fat*9)/4)),fat};
  }
  function mealTarget(template,dailyTarget,dayType){
    let share=MEAL_SHARES[template.category]||.25;
    if(dayType==="training"&&(template.trainingDay||template.category==="merienda")) share+=.05;
    const carbShare=dayType==="training"&&(template.trainingDay||["comida","merienda"].includes(template.category))?share*1.18:share;
    return {
      calories:dailyTarget.calories*share,
      protein:dailyTarget.protein*share,
      carbs:dailyTarget.carbs*carbShare,
      fat:dailyTarget.fat*share
    };
  }
  function adaptVersion(template,target,phase,dayType){
    const daily=phaseDailyTarget(target,phase);
    const desired=mealTarget(template,daily,dayType);
    const originalIngredients=template.ingredients.map(ingredient=>({...ingredient,alternatives:[...(ingredient.alternatives||[])]}));
    const ingredientEstimate=totalsForIngredients(originalIngredients);
    const sourceNutrition=template.nutrition||{};
    const original={...ingredientEstimate};
    ["calories","protein","carbs","fat","fiber"].forEach(field=>{
      const supplied=number(sourceNutrition[field]);
      if(supplied!==null&&supplied>0) original[field]=supplied;
    });
    let adapted=originalIngredients.map(ingredient=>{
      const nutrition=ingredientNutrition(ingredient);
      let factor=1;
      if(nutrition.role==="vegetable") factor=1;
      else if(nutrition.role==="protein") factor=Math.max(.8,Math.min(1.6,desired.protein/Math.max(1,original.protein)));
      else if(nutrition.role==="protein-fat") factor=Math.max(.8,Math.min(1.3,desired.protein/Math.max(1,original.protein)));
      else if(nutrition.role==="carb") factor=Math.max(.55,Math.min(1.8,desired.carbs/Math.max(1,original.carbs)));
      else if(nutrition.role==="added-fat"||nutrition.role==="fat") factor=Math.max(.5,Math.min(1.5,desired.fat/Math.max(1,original.fat)));
      else factor=Math.max(.75,Math.min(1.35,desired.calories/Math.max(1,original.calories)));
      const originalQuantity=Number(ingredient.quantity);
      return {
        ...ingredient,
        originalQuantity:Number.isFinite(originalQuantity)?originalQuantity:null,
        quantity:Number.isFinite(originalQuantity)?round(originalQuantity*factor,normalizedText(ingredient.unit).includes("unidad")?1:5):null,
        adjustmentFactor:Number(factor.toFixed(2))
      };
    });
    let preWorkout=null;
    if(dayType==="training"&&target.includePreWorkout&&!template.trainingDay){
      const moved=adapted.filter(item=>foodReference(item.name).role==="carb"&&Number(item.quantity)>0).map(item=>{
        const quantity=round(Number(item.quantity)*.25,normalizedText(item.unit).includes("unidad")?1:5);
        return {...item,quantity};
      });
      if(moved.length){
        const movedById=new Map(moved.map(item=>[item.id,item.quantity]));
        adapted=adapted.map(item=>movedById.has(item.id)?{...item,quantity:Math.max(0,Number(item.quantity)-movedById.get(item.id))}:item);
        preWorkout={name:"Distribución preentreno",ingredients:moved,nutrition:totalsForIngredients(moved)};
      }
    }
    const mainEstimated=totalsForIngredients(adapted);
    const estimated=preWorkout
      ?["calories","protein","carbs","fat","fiber"].reduce((totals,field)=>({...totals,[field]:(mainEstimated[field]||0)+(preWorkout.nutrition[field]||0)}),{approximate:mainEstimated.approximate||preWorkout.nutrition.approximate})
      :mainEstimated;
    const reasons=[];
    if(phase==="definition") reasons.push("Se mantiene la proteína y se recortan principalmente carbohidratos y grasas añadidas.");
    if(phase==="maintenance") reasons.push("Las cantidades se aproximan al objetivo de mantenimiento conservando el reparto original.");
    if(phase==="volume") reasons.push("El aumento energético se concentra principalmente en carbohidratos.");
    if(dayType==="training") reasons.push("Se priorizan carbohidratos alrededor del entrenamiento.");
    if(preWorkout) reasons.push("Parte de los carbohidratos se separa como comida preentreno sin aumentar el total diario.");
    if(adapted.some(item=>foodReference(item.name).role==="vegetable")) reasons.push("Las verduras y alimentos de baja densidad energética se mantienen.");
    return {
      id:uid(),phase,dayType,createdAt:new Date().toISOString(),
      target:{daily,meal:desired},original:{ingredients:originalIngredients,nutrition:original},
      adapted:{ingredients:adapted,nutrition:estimated},
      preWorkout,reason:reasons.join(" "),approximate:ingredientEstimate.approximate||estimated.approximate
    };
  }
  function adaptProfessionalMealTemplate(template,nutritionTarget){
    const dayType=nutritionTarget.dayType==="training"?"training":"rest";
    return {
      definition:adaptVersion(template,nutritionTarget,"definition",dayType),
      maintenance:adaptVersion(template,nutritionTarget,"maintenance",dayType),
      volume:adaptVersion(template,nutritionTarget,"volume",dayType)
    };
  }
  function equivalentTemplates(template,plans=getPlans(),allowCrossCategory=false){
    return plans.flatMap(plan=>plan.meals.map(meal=>({...meal,planId:plan.id,planTitle:plan.title})))
      .filter(meal=>meal.id!==template.id&&(allowCrossCategory||meal.category===template.category));
  }

  async function syncWithSupabase(){
    if(typeof isAppAuthenticated!=="function"||!isAppAuthenticated()) return {status:"local"};
    const client=getSupabaseClient();
    if(!client) return {status:"local"};
    try{
      const {data,error}=await client.from("professional_nutrition_plans").select("*").eq("user_id",state.syncUser.id);
      if(error) throw error;
      const remoteRows=new Map((data||[]).map(row=>[row.id,row]));
      const merged=new Map(getPlans().map(plan=>[plan.id,plan]));
      for(const row of data||[]){
        const remote={id:row.id,type:"professional_historical",title:row.title,planDate:row.plan_date,professional:row.professional||"",sourceFile:row.source_file||{},meals:row.meals||[],savedAdaptations:row.saved_adaptations||[],importedAt:row.imported_at,updatedAt:row.updated_at};
        const local=merged.get(remote.id);
        if(!local||new Date(remote.updatedAt)>new Date(local.updatedAt)) merged.set(remote.id,remote);
        if(row.source_file_data&&!await getSourceFile(remote.id)){
          await storeSourceFile(remote.id,{name:remote.sourceFile.name,type:remote.sourceFile.type,size:remote.sourceFile.size,lastModified:remote.sourceFile.lastModified},row.source_file_data);
        }
      }
      const plans=savePlans([...merged.values()],false);
      for(const plan of plans){
        const remoteRow=remoteRows.get(plan.id);
        if(remoteRow&&new Date(remoteRow.updated_at)>=new Date(plan.updatedAt||0)) continue;
        const source=await getSourceFile(plan.id);
        const {error:writeError}=await client.from("professional_nutrition_plans").upsert({
          id:plan.id,user_id:state.syncUser.id,title:plan.title,plan_date:plan.planDate||null,
          professional:plan.professional||"",source_file:plan.sourceFile||{},source_file_data:source?.dataUrl||null,
          meals:plan.meals||[],saved_adaptations:plan.savedAdaptations||[],
          imported_at:plan.importedAt,updated_at:plan.updatedAt
        },{onConflict:"id"});
        if(writeError) throw writeError;
      }
      return {status:"synced",count:plans.length};
    }catch(error){
      console.warn("Professional nutrition sync unavailable",error);
      return {status:"error",error};
    }
  }

  function nutritionSummary(values){
    const item=values||{};
    return `${Math.round(item.calories||0)} kcal · P ${Math.round(item.protein||0)} g · C ${Math.round(item.carbs||0)} g · G ${Math.round(item.fat||0)} g`;
  }
  function mealPreview(meal){
    return `<article class="professional-meal-row">
      <div><span class="section-kicker">${esc(CATEGORY_LABELS[meal.category]||meal.category)}</span><h3>${esc(meal.name)}</h3>
      <p>${meal.time?`${esc(meal.time)} · `:""}${meal.ingredients.length} ingredientes${meal.trainingDay?" · Día de entrenamiento":""}</p></div>
    </article>`;
  }
  function renderLibrary(){
    const plans=getPlans();
    app.innerHTML=`<div class="app-shell">
      <header class="topbar"><button id="backProfessionalNutrition" class="back-button">←</button><div><div class="brand">Planificaciones profesionales</div><div class="subtle">Histórico, no objetivo actual</div></div><span></span></header>
      <main class="screen professional-nutrition-screen">
        <section class="professional-library-intro"><span class="section-kicker">ARCHIVO HISTÓRICO</span><h1>Planificaciones profesionales</h1><p>Consulta planes anteriores y adapta cantidades sin cambiar tu objetivo ni tu plan actual.</p>
          <button id="importProfessionalPlan" class="primary">Importar planificación</button>
        </section>
        <section class="professional-plan-list">
          ${plans.length?plans.slice().reverse().map(plan=>`<button class="professional-plan-card" data-plan-id="${esc(plan.id)}"><span>${esc(plan.planDate||"Sin fecha")}</span><strong>${esc(plan.title)}</strong><small>${esc(plan.professional||"Procedencia no indicada")} · ${plan.meals.length} comidas</small></button>`).join(""):`<div class="empty">Todavía no hay planificaciones históricas importadas.</div>`}
        </section>
      </main>${nav("nutrition")}
    </div>`;
    document.getElementById("backProfessionalNutrition").onclick=()=>{state.screen="nutrition";renderNutrition();};
    document.getElementById("importProfessionalPlan").onclick=()=>document.getElementById("professionalNutritionFile").click();
    document.querySelectorAll("[data-plan-id]").forEach(button=>button.onclick=()=>{state.professionalNutritionPlanId=button.dataset.planId;state.screen="professionalNutritionPlan";renderProfessionalNutritionPlan();});
  }
  function renderImport(){
    const draft=state.professionalNutritionDraft;
    if(!draft){state.screen="professionalNutrition";renderLibrary();return;}
    app.innerHTML=`<div class="app-shell">
      <header class="topbar"><button id="cancelProfessionalImport" class="back-button">←</button><div><div class="brand">Revisar importación</div><div class="subtle">Planificación histórica profesional</div></div><span></span></header>
      <main class="screen professional-nutrition-screen">
        <section class="card professional-import-meta">
          <label><span>Título</span><input id="professionalPlanTitle" maxlength="100" value="${esc(draft.title)}"></label>
          <label><span>Fecha del plan</span><input id="professionalPlanDate" type="date" value="${esc(draft.planDate)}"></label>
          <label><span>Profesional o procedencia</span><input id="professionalPlanSource" maxlength="120" value="${esc(draft.professional)}" placeholder="Nombre o procedencia"></label>
          <div class="source-file-line"><span>Archivo de origen</span><strong>${esc(draft.sourceFile.name)}</strong><small>${Math.max(1,Math.round(draft.sourceFile.size/1024))} KB · original conservado</small></div>
        </section>
        <section><h2>Comidas detectadas</h2>${draft.meals.map(mealPreview).join("")}</section>
        <p id="professionalImportMessage" class="inline-message hidden" role="alert"></p>
        <button id="confirmProfessionalImport" class="primary full">Guardar como planificación histórica</button>
      </main>${nav("nutrition")}
    </div>`;
    document.getElementById("cancelProfessionalImport").onclick=()=>{state.professionalNutritionDraft=null;state.screen="professionalNutrition";renderLibrary();};
    document.getElementById("confirmProfessionalImport").onclick=()=>{
      const professional=document.getElementById("professionalPlanSource").value.trim();
      if(!professional){
        const message=document.getElementById("professionalImportMessage");
        message.textContent="Indica el profesional o la procedencia del archivo.";
        message.classList.remove("hidden");
        return;
      }
      draft.title=document.getElementById("professionalPlanTitle").value.trim()||draft.sourceFile.name;
      draft.planDate=document.getElementById("professionalPlanDate").value;
      draft.professional=professional;
      draft.updatedAt=new Date().toISOString();
      upsertPlan(draft);
      state.professionalNutritionDraft=null;
      state.professionalNutritionPlanId=draft.id;
      state.screen="professionalNutritionPlan";
      toast("Planificación histórica guardada");
      renderProfessionalNutritionPlan();
    };
  }
  function renderPlan(){
    const plan=planById(state.professionalNutritionPlanId);
    if(!plan){state.screen="professionalNutrition";renderLibrary();return;}
    const canAdapt=typeof hasNutritionTargets==="function"&&hasNutritionTargets();
    app.innerHTML=`<div class="app-shell">
      <header class="topbar"><button id="backProfessionalPlan" class="back-button">←</button><div><div class="brand">${esc(plan.title)}</div><div class="subtle">Planificación histórica profesional</div></div><span></span></header>
      <main class="screen professional-nutrition-screen">
        <section class="professional-plan-meta"><span>${esc(plan.planDate||"Sin fecha")}</span><strong>${esc(plan.professional)}</strong><small>Origen: ${esc(plan.sourceFile?.name||"Archivo importado")}</small><button id="downloadProfessionalSource" class="text-button">Descargar archivo original →</button></section>
        <section class="professional-plan-meals">
          ${plan.meals.map(meal=>`<article class="card professional-meal-card">
            <span class="section-kicker">${esc(CATEGORY_LABELS[meal.category]||meal.category)}</span><h2>${esc(meal.name)}</h2>
            <p class="subtle">${meal.time?`${esc(meal.time)} · `:""}${meal.flexibleTime?"Horario flexible · ":""}${meal.trainingDay?"Preparada para día de entrenamiento":"Uso flexible"}${meal.sourceVersion?` · Versión ${esc(meal.sourceVersion)}`:""}</p>
            <div class="professional-ingredients">${meal.ingredients.map(ingredient=>`<div><span>${esc(ingredient.name)}${ingredient.dryWeight?" · en seco":""}</span><strong>${ingredient.quantity??"—"} ${esc(ingredient.unit||"")}</strong>${ingredient.alternatives?.length?`<small>Alternativas: ${esc(ingredient.alternatives.join(", "))}</small>`:""}</div>`).join("")}</div>
            ${number(meal.nutrition?.fiber)>0||meal.nutrition?.micronutrients?`<p class="professional-nutrients">${number(meal.nutrition?.fiber)>0?`Fibra: ${number(meal.nutrition.fiber)} g. `:""}${meal.nutrition?.micronutrients?`Micronutrientes: ${esc(meal.nutrition.micronutrients)}`:""}</p>`:""}
            ${meal.alternatives?.length?`<p class="professional-alternatives"><strong>Equivalencias originales:</strong> ${esc(meal.alternatives.join(", "))}</p>`:""}
            ${meal.instructions?`<p class="professional-instructions">${esc(meal.instructions)}</p>`:""}
            <button class="secondary full" data-adapt-meal="${esc(meal.id)}" ${canAdapt?"":"disabled"}>${canAdapt?"Adaptar cantidades":"Calcula primero tus objetivos"}</button>
          </article>`).join("")}
        </section>
        ${plan.savedAdaptations?.length?`<section class="saved-adaptations"><h2>Adaptaciones confirmadas</h2>${plan.savedAdaptations.slice().reverse().map(item=>`<article><div><strong>${esc(item.mealName)}</strong><span>${esc(PHASE_LABELS[item.phase])} · ${item.dayType==="training"?"Entrenamiento":"Descanso"}</span></div><small>${esc(nutritionSummary(item.adapted?.nutrition))}</small></article>`).join("")}</section>`:""}
      </main>${nav("nutrition")}
    </div>`;
    document.getElementById("backProfessionalPlan").onclick=()=>{state.screen="professionalNutrition";renderLibrary();};
    document.getElementById("downloadProfessionalSource").onclick=async()=>{
      const source=await getSourceFile(plan.id);
      if(!source?.dataUrl){toast("El archivo original no está disponible en este dispositivo.");return;}
      const link=document.createElement("a");
      link.href=source.dataUrl;
      link.download=source.name||plan.sourceFile?.name||"planificacion-profesional";
      link.click();
    };
    document.querySelectorAll("[data-adapt-meal]").forEach(button=>button.onclick=()=>{
      state.professionalNutritionMealId=button.dataset.adaptMeal;
      state.professionalNutritionDayType="rest";
      state.professionalNutritionIncludePreWorkout=false;
      state.screen="professionalNutritionAdapt";
      renderProfessionalNutritionAdaptation();
    });
  }
  function renderAdaptation(){
    const plan=planById(state.professionalNutritionPlanId);
    const meal=plan?.meals.find(item=>item.id===state.professionalNutritionMealId);
    if(!plan||!meal){state.screen="professionalNutritionPlan";renderPlan();return;}
    const settings=getNutritionSettings();
    if(typeof hasNutritionTargets!=="function"||!hasNutritionTargets(settings)){
      toast("Calcula primero tus objetivos nutricionales.");
      state.screen="nutrition";
      renderNutrition();
      return;
    }
    const versions=adaptProfessionalMealTemplate(meal,{...settings,dayType:state.professionalNutritionDayType,includePreWorkout:state.professionalNutritionIncludePreWorkout});
    app.innerHTML=`<div class="app-shell">
      <header class="topbar"><button id="backProfessionalAdapt" class="back-button">←</button><div><div class="brand">Adaptar cantidades</div><div class="subtle">${esc(meal.name)}</div></div><span></span></header>
      <main class="screen professional-nutrition-screen">
        <section class="adapt-day-type"><span>Tipo de día</span><div><button data-day-type="rest" class="${state.professionalNutritionDayType==="rest"?"active":""}">Descanso</button><button data-day-type="training" class="${state.professionalNutritionDayType==="training"?"active":""}">Entrenamiento</button></div></section>
        ${state.professionalNutritionDayType==="training"&&!meal.trainingDay?`<label class="preworkout-option"><input id="includePreWorkout" type="checkbox" ${state.professionalNutritionIncludePreWorkout?"checked":""}><span><strong>Distribuir una comida preentreno</strong><small>Separa parte de los carbohidratos de esta comida sin aumentar el total diario.</small></span></label>`:""}
        <section class="professional-original"><h2>Cantidades originales</h2><div class="professional-ingredients">${meal.ingredients.map(item=>`<div><span>${esc(item.name)}</span><strong>${item.quantity??"—"} ${esc(item.unit||"")}</strong></div>`).join("")}</div><p>${esc(nutritionSummary(versions.maintenance.original.nutrition))}</p></section>
        <section class="adaptation-versions">
          ${Object.entries(versions).map(([phase,version])=>`<article class="card adaptation-version">
            <span class="section-kicker">${esc(PHASE_LABELS[phase])}</span>
            <h2>${esc(meal.name)}</h2>
            <div class="professional-ingredients">${version.adapted.ingredients.map(item=>`<div><span>${esc(item.name)}</span><strong>${item.quantity??"—"} ${esc(item.unit||"")}</strong><small>Original: ${item.originalQuantity??"—"} ${esc(item.unit||"")}</small></div>`).join("")}</div>
            ${version.preWorkout?`<div class="preworkout-preview"><span class="section-kicker">PREENTRENO</span>${version.preWorkout.ingredients.map(item=>`<div><span>${esc(item.name)}</span><strong>${item.quantity} ${esc(item.unit||"")}</strong></div>`).join("")}</div>`:""}
            <p class="adaptation-reason">${esc(version.reason)}</p>
            <strong class="nutrition-estimate">${esc(nutritionSummary(version.adapted.nutrition))}</strong>
            ${version.approximate?`<p class="approximation-warning">Valores nutricionales estimados. Revisa las etiquetas y cantidades reales.</p>`:""}
            <button class="primary full" data-save-adaptation="${phase}">Confirmar y guardar esta versión</button>
          </article>`).join("")}
        </section>
        <section class="equivalent-templates"><h2>Plantillas equivalentes</h2><p>Solo se muestran alternativas de ${esc(CATEGORY_LABELS[meal.category].toLocaleLowerCase("es"))}.</p>
          ${equivalentTemplates(meal).slice(0,4).map(item=>`<div><strong>${esc(item.name)}</strong><span>${esc(item.planTitle)}</span></div>`).join("")||`<div class="empty">No hay otras plantillas de esta categoría.</div>`}
        </section>
      </main>${nav("nutrition")}
    </div>`;
    document.getElementById("backProfessionalAdapt").onclick=()=>{state.screen="professionalNutritionPlan";renderPlan();};
    document.querySelectorAll("[data-day-type]").forEach(button=>button.onclick=()=>{state.professionalNutritionDayType=button.dataset.dayType;renderAdaptation();});
    const includePreWorkout=document.getElementById("includePreWorkout");
    if(includePreWorkout) includePreWorkout.onchange=()=>{state.professionalNutritionIncludePreWorkout=includePreWorkout.checked;renderAdaptation();};
    document.querySelectorAll("[data-save-adaptation]").forEach(button=>button.onclick=()=>{
      const version=versions[button.dataset.saveAdaptation];
      plan.savedAdaptations=plan.savedAdaptations||[];
      plan.savedAdaptations.push({...version,mealId:meal.id,mealName:meal.name,category:meal.category});
      plan.updatedAt=new Date().toISOString();
      upsertPlan(plan);
      button.disabled=true;
      button.textContent="Versión guardada";
      toast("Adaptación confirmada y guardada");
    });
  }

  async function handleFileSelection(file){
    state.professionalNutritionDraft=await parseProfessionalNutritionFile(file);
    state.screen="professionalNutritionImport";
    renderImport();
  }

  window.GymOSProfessionalNutrition=Object.freeze({
    storageKey:STORAGE_KEY,getPlans,savePlans,mergePlans,parseProfessionalNutritionFile,
    adaptProfessionalMealTemplate,equivalentTemplates,syncWithSupabase,handleFileSelection
  });
  window.adaptProfessionalMealTemplate=adaptProfessionalMealTemplate;
  window.renderProfessionalNutritionLibrary=renderLibrary;
  window.renderProfessionalNutritionImport=renderImport;
  window.renderProfessionalNutritionPlan=renderPlan;
  window.renderProfessionalNutritionAdaptation=renderAdaptation;
})();
