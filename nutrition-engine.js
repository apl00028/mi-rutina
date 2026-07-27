(function(){
  "use strict";

  const ACTIVITY_FACTORS={
    sedentary:{label:"Sedentaria",factor:1.2},
    light:{label:"Ligera",factor:1.35},
    moderate:{label:"Moderada",factor:1.5},
    high:{label:"Alta",factor:1.7},
    very_high:{label:"Muy alta",factor:1.85}
  };
  const RECIPES=[
    {id:"oats-skyr",type:"desayuno",name:"Avena con skyr y fruta",time:8,ingredients:[["Avena",60,"g"],["Skyr natural",250,"g"],["Plátano",120,"g"],["Almendras",15,"g"]],macros:{calories:585,protein:38,carbs:82,fat:13}},
    {id:"eggs-toast",type:"desayuno",name:"Tostadas con huevo y claras",time:12,ingredients:[["Pan integral",100,"g"],["Huevos",2,"ud"],["Claras",180,"g"],["Tomate",120,"g"]],macros:{calories:535,protein:43,carbs:52,fat:17}},
    {id:"chicken-rice",type:"comida",name:"Arroz con pollo y verduras",time:25,ingredients:[["Arroz en seco",100,"g"],["Pechuga de pollo",180,"g"],["Verduras",250,"g"],["Aceite de oliva",10,"g"]],macros:{calories:720,protein:55,carbs:91,fat:14}},
    {id:"salmon-potato",type:"comida",name:"Salmón con patata y ensalada",time:25,ingredients:[["Salmón",180,"g"],["Patata",350,"g"],["Ensalada",200,"g"],["Aceite de oliva",5,"g"]],macros:{calories:710,protein:45,carbs:67,fat:27}},
    {id:"turkey-pasta",type:"cena",name:"Pasta con pavo y calabacín",time:22,ingredients:[["Pasta en seco",90,"g"],["Pavo",180,"g"],["Calabacín",250,"g"],["Aceite de oliva",8,"g"]],macros:{calories:670,protein:55,carbs:76,fat:15}},
    {id:"hake-sweet-potato",type:"cena",name:"Merluza con boniato",time:20,ingredients:[["Merluza",220,"g"],["Boniato",300,"g"],["Verduras",200,"g"],["Aceite de oliva",10,"g"]],macros:{calories:610,protein:51,carbs:70,fat:13}},
    {id:"yogurt-snack",type:"snack",name:"Yogur proteico con fruta",time:5,ingredients:[["Yogur alto en proteína",250,"g"],["Fruta",150,"g"],["Frutos secos",15,"g"]],macros:{calories:330,protein:29,carbs:34,fat:10}},
    {id:"banana-oats-pre",type:"preentreno",name:"Avena y plátano preentreno",time:5,ingredients:[["Avena",50,"g"],["Plátano",120,"g"],["Yogur natural",150,"g"]],macros:{calories:390,protein:18,carbs:68,fat:6}},
    {id:"rice-whey-post",type:"postentreno",name:"Crema de arroz postentreno",time:7,ingredients:[["Crema de arroz",70,"g"],["Proteína whey",30,"g"],["Fruta",120,"g"]],macros:{calories:470,protein:32,carbs:76,fat:4}}
  ];

  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  function calculateNutritionNeeds(input){
    const sex=String(input.sex||"");
    const age=Number(input.age);
    const height=Number(input.height);
    const weight=Number(input.weight);
    const trainingDays=clamp(Number(input.trainingDays||0),0,7);
    const activity=ACTIVITY_FACTORS[input.activity]||null;
    const goal=["Definición","Mantenimiento","Volumen"].includes(input.goal)?input.goal:"Mantenimiento";
    const weeklyRate=goal==="Mantenimiento"?0:Math.abs(Number(input.weeklyRate||0));
    if(!["male","female"].includes(sex)) throw new Error("Indica el sexo utilizado para el cálculo.");
    if(!age||age<14||age>100) throw new Error("Indica una edad válida.");
    if(!height||height<120||height>230) throw new Error("Indica una altura válida.");
    if(!weight||weight<35||weight>350) throw new Error("Registra un peso válido.");
    if(!activity) throw new Error("Selecciona un nivel de actividad.");
    if(goal!=="Mantenimiento"&&!weeklyRate) throw new Error("Selecciona un ritmo semanal.");

    const sexConstant=sex==="male"?5:-161;
    const bmr=Math.round(10*weight+6.25*height-5*age+sexConstant);
    const effectiveFactor=clamp(activity.factor+trainingDays*.012,1.2,1.95);
    const tdee=Math.round(bmr*effectiveFactor);
    const weeklyEnergy=weeklyRate*7700;
    const dailyAdjustment=Math.round(weeklyEnergy/7)*(goal==="Definición"?-1:goal==="Volumen"?1:0);
    const calories=Math.max(1200,Math.round((tdee+dailyAdjustment)/10)*10);
    const proteinPerKg=goal==="Definición"?2.2:goal==="Volumen"?2:1.8;
    const protein=Math.round(weight*proteinPerKg);
    const fat=Math.max(Math.round(weight*.8),Math.round(calories*.22/9));
    const carbs=Math.max(0,Math.round((calories-protein*4-fat*9)/4));
    const fiber=Math.max(25,Math.round(calories/1000*14));
    return {
      calculated:true,source:"gymos",goal,weeklyTarget:goal==="Definición"?-weeklyRate:weeklyRate,
      calories,protein,carbs,fat,fiber,bmr,tdee,dailyAdjustment,
      calculatedAt:new Date().toISOString(),
      inputs:{sex,age,height,weight,activity:input.activity,activityLabel:activity.label,baseActivityFactor:activity.factor,effectiveFactor:Number(effectiveFactor.toFixed(3)),trainingDays,goal,weeklyRate}
    };
  }

  function scaleRecipe(recipe,remaining,goal){
    const phaseFactor=goal==="Definición"?.88:goal==="Volumen"?1.12:1;
    const desiredCalories=Math.max(100,Math.min(Number(remaining.calories),recipe.macros.calories*1.35));
    const proteinNeed=Math.max(0,Number(remaining.protein||0));
    const calorieFactor=desiredCalories/recipe.macros.calories;
    const proteinFactor=proteinNeed?Math.min(1.35,Math.max(.75,proteinNeed/recipe.macros.protein)):1;
    const factor=clamp((calorieFactor*.72+proteinFactor*.28)*phaseFactor,.55,1.45);
    const step=(unit)=>unit==="ud"?1:5;
    const ingredients=recipe.ingredients.map(([name,quantity,unit])=>({
      name,unit,quantity:Math.max(step(unit),Math.round(quantity*factor/step(unit))*step(unit))
    }));
    return {
      ...recipe,ingredients,
      macros:Object.fromEntries(Object.entries(recipe.macros).map(([key,value])=>[key,Math.round(value*factor)])),
      approximate:true
    };
  }
  function suggestRecipes({type,remaining,goal}){
    if(Number(remaining?.calories)<=0) return [];
    return RECIPES.filter(recipe=>recipe.type===type).map(recipe=>scaleRecipe(recipe,remaining,goal)).slice(0,3);
  }
  function shoppingList(recipes){
    const list=new Map();
    recipes.forEach(recipe=>recipe.ingredients.forEach(item=>{
      const key=`${item.name}|${item.unit}`;
      const current=list.get(key)||{name:item.name,unit:item.unit,quantity:0};
      current.quantity+=item.quantity;
      list.set(key,current);
    }));
    return [...list.values()];
  }

  window.GymOSNutritionEngine={activityFactors:ACTIVITY_FACTORS,calculateNutritionNeeds,suggestRecipes,shoppingList};
})();
