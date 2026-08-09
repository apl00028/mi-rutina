(function(global){
  "use strict";

  function clone(value){
    return JSON.parse(JSON.stringify(value));
  }

  function deepFreeze(value){
    if(!value || typeof value!=="object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  const CATALOG=deepFreeze([
    {
      "id":"bench-press",
      "name":"Press de banca",
      "muscle":"Pecho",
      "equipment":"Barra",
      "type":"Fuerza",
      "favorite":true,
      "custom":false,
      "notes":"EscÃ¡pulas retraÃ­das y pies firmes.",
      "category":"strength"
    },
    {
      "id":"dumbbell-bench-press",
      "name":"Press de banca con mancuernas",
      "muscle":"Pecho",
      "equipment":"Mancuernas",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n las muÃ±ecas neutras y controla la bajada.",
      "category":"strength"
    },
    {
      "id":"incline-barbell-press",
      "name":"Press inclinado con barra",
      "muscle":"Pecho",
      "equipment":"Barra",
      "type":"Fuerza",
      "favorite":false,
      "custom":false,
      "notes":"Usa una inclinaciÃ³n moderada y evita elevar los hombros.",
      "category":"strength"
    },
    {
      "id":"incline-db-press",
      "name":"Press inclinado con mancuernas",
      "muscle":"Pecho",
      "equipment":"Mancuernas",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Controla la bajada.",
      "category":"strength"
    },
    {
      "id":"decline-bench-press",
      "name":"Press declinado con barra",
      "muscle":"Pecho",
      "equipment":"Barra",
      "type":"Fuerza",
      "favorite":false,
      "custom":false,
      "notes":"Asegura bien las piernas y usa un recorrido controlado.",
      "category":"strength"
    },
    {
      "id":"machine-chest-press",
      "name":"Press de pecho en mÃ¡quina",
      "muscle":"Pecho",
      "equipment":"MÃ¡quina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Ajusta el asiento para que las empuÃ±aduras queden a la altura del pecho.",
      "category":"strength"
    },
    {
      "id":"cable-chest-fly",
      "name":"Aperturas en polea",
      "muscle":"Pecho",
      "equipment":"Polea",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n una ligera flexiÃ³n de codo y junta los brazos sin encoger hombros.",
      "category":"strength"
    },
    {
      "id":"pec-deck-fly",
      "name":"Aperturas en peck deck",
      "muscle":"Pecho",
      "equipment":"MÃ¡quina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Apoya la espalda y evita adelantar los hombros.",
      "category":"strength"
    },
    {
      "id":"dumbbell-fly",
      "name":"Aperturas con mancuernas",
      "muscle":"Pecho",
      "equipment":"Mancuernas",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"No bajes mÃ¡s allÃ¡ de un rango cÃ³modo para el hombro.",
      "category":"strength"
    },
    {
      "id":"push-up",
      "name":"Flexiones",
      "muscle":"Pecho",
      "equipment":"Peso corporal",
      "type":"Fuerza",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n el cuerpo alineado y los codos en una trayectoria cÃ³moda.",
      "category":"strength",
      "recordTypes":[
        "bodyweight_reps"
      ]
    },
    {
      "id":"chest-dip",
      "name":"Fondos para pecho",
      "muscle":"Pecho",
      "equipment":"Peso corporal",
      "type":"Fuerza",
      "favorite":false,
      "custom":false,
      "notes":"Inclina ligeramente el tronco y evita una profundidad dolorosa.",
      "category":"strength",
      "recordTypes":[
        "bodyweight_reps"
      ]
    },
    {
      "id":"lat-pulldown",
      "name":"JalÃ³n al pecho",
      "muscle":"Espalda",
      "equipment":"Polea",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Lleva los codos hacia abajo.",
      "category":"strength"
    },
    {
      "id":"neutral-grip-lat-pulldown",
      "name":"JalÃ³n al pecho con agarre neutro",
      "muscle":"Espalda",
      "equipment":"Polea",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Inicia el movimiento bajando las escÃ¡pulas antes de flexionar los codos.",
      "category":"strength"
    },
    {
      "id":"pull-up",
      "name":"Dominadas pronas",
      "muscle":"Espalda",
      "equipment":"Peso corporal",
      "type":"Fuerza",
      "favorite":false,
      "custom":false,
      "notes":"Evita balancearte y termina con control escapular.",
      "category":"strength",
      "recordTypes":[
        "bodyweight_reps"
      ]
    },
    {
      "id":"assisted-pull-up",
      "name":"Dominadas asistidas",
      "muscle":"Espalda",
      "equipment":"MÃ¡quina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Usa la mÃ­nima asistencia que permita repeticiones limpias.",
      "category":"strength",
      "recordTypes":[
        "assisted_reps"
      ]
    },
    {
      "id":"chin-up",
      "name":"Dominadas supinas",
      "muscle":"Espalda",
      "equipment":"Peso corporal",
      "type":"Fuerza",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n las costillas controladas y evita impulsarte.",
      "category":"strength",
      "recordTypes":[
        "bodyweight_reps"
      ]
    },
    {
      "id":"barbell-row",
      "name":"Remo con barra",
      "muscle":"Espalda",
      "equipment":"Barra",
      "type":"Fuerza",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n la espalda neutra.",
      "category":"strength"
    },
    {
      "id":"seated-cable-row",
      "name":"Remo sentado en polea",
      "muscle":"Espalda",
      "equipment":"Polea",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Evita llevar el tronco hacia atrÃ¡s para completar la repeticiÃ³n.",
      "category":"strength"
    },
    {
      "id":"machine-row",
      "name":"Remo en mÃ¡quina",
      "muscle":"Espalda",
      "equipment":"MÃ¡quina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Ajusta el apoyo para mantener el pecho estable.",
      "category":"strength"
    },
    {
      "id":"one-arm-dumbbell-row",
      "name":"Remo con mancuerna a una mano",
      "muscle":"Espalda",
      "equipment":"Mancuernas",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n la pelvis estable y lleva el codo hacia la cadera.",
      "category":"strength"
    },
    {
      "id":"chest-supported-db-row",
      "name":"Remo con mancuernas apoyado en banco",
      "muscle":"Espalda",
      "equipment":"Mancuernas",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n el pecho apoyado y evita encoger los hombros.",
      "category":"strength"
    },
    {
      "id":"t-bar-row",
      "name":"Remo en T",
      "muscle":"Espalda",
      "equipment":"MÃ¡quina",
      "type":"Fuerza",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n el abdomen activo y no redondees la zona lumbar.",
      "category":"strength"
    },
    {
      "id":"straight-arm-pulldown",
      "name":"Pullover en polea con brazos rectos",
      "muscle":"Espalda",
      "equipment":"Polea",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n los codos casi extendidos y mueve desde el hombro.",
      "category":"strength"
    },
    {
      "id":"face-pull",
      "name":"Face pull",
      "muscle":"Hombros",
      "equipment":"Polea",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Tira hacia la cara separando las manos y rotando externamente.",
      "category":"strength"
    },
    {
      "id":"back-squat",
      "name":"Sentadilla trasera",
      "muscle":"Piernas",
      "equipment":"Barra",
      "type":"Fuerza",
      "favorite":true,
      "custom":false,
      "notes":"Rodillas alineadas con los pies.",
      "category":"strength"
    },
    {
      "id":"front-squat",
      "name":"Sentadilla frontal",
      "muscle":"Piernas",
      "equipment":"Barra",
      "type":"Fuerza",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n los codos altos y el tronco erguido.",
      "category":"strength"
    },
    {
      "id":"goblet-squat",
      "name":"Sentadilla goblet",
      "muscle":"Piernas",
      "equipment":"Mancuernas",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Sujeta la carga cerca del pecho y mantÃ©n el pie completo apoyado.",
      "category":"strength"
    },
    {
      "id":"smith-squat",
      "name":"Sentadilla en mÃ¡quina Smith",
      "muscle":"Piernas",
      "equipment":"MÃ¡quina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Coloca los pies donde puedas mantener una trayectoria cÃ³moda.",
      "category":"strength"
    },
    {
      "id":"hack-squat",
      "name":"Sentadilla hack",
      "muscle":"Piernas",
      "equipment":"MÃ¡quina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n la espalda apoyada y controla la profundidad.",
      "category":"strength"
    },
    {
      "id":"leg-press",
      "name":"Prensa de piernas",
      "muscle":"Piernas",
      "equipment":"MÃ¡quina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"No bloquees las rodillas.",
      "category":"strength"
    },
    {
      "id":"bulgarian-split-squat",
      "name":"Sentadilla bÃºlgara",
      "muscle":"Piernas",
      "equipment":"Mancuernas",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n estable la rodilla delantera y controla la bajada.",
      "category":"strength"
    },
    {
      "id":"reverse-lunge",
      "name":"Zancada hacia atrÃ¡s",
      "muscle":"Piernas",
      "equipment":"Mancuernas",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Da un paso suficiente para mantener el talÃ³n delantero apoyado.",
      "category":"strength"
    },
    {
      "id":"walking-lunge",
      "name":"Zancadas caminando",
      "muscle":"Piernas",
      "equipment":"Mancuernas",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n el tronco estable y evita pasos demasiado cortos.",
      "category":"strength"
    },
    {
      "id":"step-up",
      "name":"Subida al cajÃ³n",
      "muscle":"Piernas",
      "equipment":"Mancuernas",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"ImpÃºlsate con la pierna que estÃ¡ sobre el cajÃ³n.",
      "category":"strength"
    },
    {
      "id":"leg-extension",
      "name":"ExtensiÃ³n de piernas",
      "muscle":"CuÃ¡driceps",
      "equipment":"MÃ¡quina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Alinea la rodilla con el eje de la mÃ¡quina.",
      "category":"strength"
    },
    {
      "id":"hip-thrust",
      "name":"Hip thrust con barra",
      "muscle":"GlÃºteos",
      "equipment":"Barra",
      "type":"Fuerza",
      "favorite":false,
      "custom":false,
      "notes":"Termina extendiendo la cadera sin hiperextender la zona lumbar.",
      "category":"strength"
    },
    {
      "id":"machine-hip-thrust",
      "name":"Hip thrust en mÃ¡quina",
      "muscle":"GlÃºteos",
      "equipment":"MÃ¡quina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Ajusta la almohadilla sobre la pelvis y controla la bajada.",
      "category":"strength"
    },
    {
      "id":"glute-bridge",
      "name":"Puente de glÃºteos",
      "muscle":"GlÃºteos",
      "equipment":"Peso corporal",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Aprieta glÃºteos arriba sin arquear la espalda.",
      "category":"strength",
      "recordTypes":[
        "bodyweight_reps"
      ]
    },
    {
      "id":"cable-kickback",
      "name":"ExtensiÃ³n de cadera en polea",
      "muscle":"GlÃºteos",
      "equipment":"Polea",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Extiende la cadera sin arquear la zona lumbar ni girar la pelvis.",
      "category":"strength"
    },
    {
      "id":"romanian-deadlift",
      "name":"Peso muerto rumano",
      "muscle":"Isquios",
      "equipment":"Barra",
      "type":"Fuerza",
      "favorite":false,
      "custom":false,
      "notes":"Desplaza la cadera atrÃ¡s.",
      "category":"strength"
    },
    {
      "id":"db-romanian-deadlift",
      "name":"Peso muerto rumano con mancuernas",
      "muscle":"Isquios",
      "equipment":"Mancuernas",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n las mancuernas cerca de las piernas y lleva la cadera atrÃ¡s.",
      "category":"strength"
    },
    {
      "id":"conventional-deadlift",
      "name":"Peso muerto convencional",
      "muscle":"Cadena posterior",
      "equipment":"Barra",
      "type":"Fuerza",
      "favorite":false,
      "custom":false,
      "notes":"Prepara tensiÃ³n antes de despegar la barra del suelo.",
      "category":"strength"
    },
    {
      "id":"trap-bar-deadlift",
      "name":"Peso muerto con barra hexagonal",
      "muscle":"Cadena posterior",
      "equipment":"Barra",
      "type":"Fuerza",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n el torso firme y empuja el suelo con los pies.",
      "category":"strength"
    },
    {
      "id":"sumo-deadlift",
      "name":"Peso muerto sumo",
      "muscle":"Cadena posterior",
      "equipment":"Barra",
      "type":"Fuerza",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n las rodillas alineadas con los pies y la barra cerca.",
      "category":"strength"
    },
    {
      "id":"leg-curl",
      "name":"Curl femoral sentado",
      "muscle":"Isquios",
      "equipment":"MÃ¡quina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Evita levantar la cadera.",
      "category":"strength"
    },
    {
      "id":"lying-leg-curl",
      "name":"Curl femoral tumbado",
      "muscle":"Isquios",
      "equipment":"MÃ¡quina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n la pelvis apoyada durante toda la repeticiÃ³n.",
      "category":"strength"
    },
    {
      "id":"single-leg-curl",
      "name":"Curl femoral unilateral",
      "muscle":"Isquios",
      "equipment":"MÃ¡quina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Completa el recorrido sin girar la pelvis.",
      "category":"strength"
    },
    {
      "id":"cable-pull-through",
      "name":"Pull through en polea",
      "muscle":"GlÃºteos",
      "equipment":"Polea",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Deja que la cadera viaje atrÃ¡s y termina contrayendo glÃºteos.",
      "category":"strength"
    },
    {
      "id":"machine-hip-abduction",
      "name":"AbducciÃ³n de cadera en mÃ¡quina",
      "muscle":"GlÃºteos",
      "equipment":"MÃ¡quina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n la pelvis estable y evita impulsos.",
      "category":"strength"
    },
    {
      "id":"cable-hip-abduction",
      "name":"AbducciÃ³n de cadera en polea",
      "muscle":"GlÃºteos",
      "equipment":"Polea",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Mueve la pierna sin inclinar el tronco.",
      "category":"strength"
    },
    {
      "id":"machine-hip-adduction",
      "name":"AducciÃ³n de cadera en mÃ¡quina",
      "muscle":"Aductores",
      "equipment":"MÃ¡quina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Cierra las piernas con control y sin rebotes.",
      "category":"strength"
    },
    {
      "id":"nordic-hamstring-curl",
      "name":"Curl nÃ³rdico de isquios",
      "muscle":"Isquios",
      "equipment":"Peso corporal",
      "type":"Fuerza",
      "favorite":false,
      "custom":false,
      "notes":"Desciende solo hasta donde puedas mantener la cadera extendida.",
      "category":"strength",
      "recordTypes":[
        "bodyweight_reps"
      ]
    },
    {
      "id":"overhead-press",
      "name":"Press militar",
      "muscle":"Hombros",
      "equipment":"Barra",
      "type":"Fuerza",
      "favorite":false,
      "custom":false,
      "notes":"Aprieta glÃºteos y abdomen.",
      "category":"strength"
    },
    {
      "id":"db-shoulder-press",
      "name":"Press de hombros con mancuernas",
      "muscle":"Hombros",
      "equipment":"Mancuernas",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n los antebrazos verticales y evita arquear la espalda.",
      "category":"strength"
    },
    {
      "id":"machine-shoulder-press",
      "name":"Press de hombros en mÃ¡quina",
      "muscle":"Hombros",
      "equipment":"MÃ¡quina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Ajusta el asiento para empezar con las manos cerca de los hombros.",
      "category":"strength"
    },
    {
      "id":"arnold-press",
      "name":"Press Arnold",
      "muscle":"Hombros",
      "equipment":"Mancuernas",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Rota de forma suave sin forzar el hombro.",
      "category":"strength"
    },
    {
      "id":"lateral-raise",
      "name":"Elevaciones laterales",
      "muscle":"Hombros",
      "equipment":"Mancuernas",
      "type":"Hipertrofia",
      "favorite":true,
      "custom":false,
      "notes":"Sube con control.",
      "category":"strength"
    },
    {
      "id":"cable-lateral-raise",
      "name":"ElevaciÃ³n lateral en polea",
      "muscle":"Hombros",
      "equipment":"Polea",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n tensiÃ³n continua y evita elevar el hombro.",
      "category":"strength"
    },
    {
      "id":"machine-lateral-raise",
      "name":"ElevaciÃ³n lateral en mÃ¡quina",
      "muscle":"Hombros",
      "equipment":"MÃ¡quina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Alinea el hombro con el eje de la mÃ¡quina.",
      "category":"strength"
    },
    {
      "id":"front-raise",
      "name":"ElevaciÃ³n frontal con mancuernas",
      "muscle":"Hombros",
      "equipment":"Mancuernas",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Eleva hasta una altura cÃ³moda sin balancear el tronco.",
      "category":"strength"
    },
    {
      "id":"rear-delt-fly",
      "name":"PÃ¡jaros con mancuernas",
      "muscle":"Hombros",
      "equipment":"Mancuernas",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Abre los brazos sin encoger los hombros.",
      "category":"strength"
    },
    {
      "id":"reverse-pec-deck",
      "name":"PÃ¡jaros en peck deck",
      "muscle":"Hombros",
      "equipment":"MÃ¡quina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n el pecho apoyado y abre desde el hombro.",
      "category":"strength"
    },
    {
      "id":"upright-row",
      "name":"Remo al mentÃ³n",
      "muscle":"Hombros",
      "equipment":"Barra",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Usa un agarre cÃ³modo y no subas por encima de un rango sin dolor.",
      "category":"strength"
    },
    {
      "id":"cable-external-rotation",
      "name":"RotaciÃ³n externa de hombro en polea",
      "muscle":"Hombros",
      "equipment":"Polea",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n el codo pegado al cuerpo y usa poca carga.",
      "category":"strength"
    },
    {
      "id":"biceps-curl",
      "name":"Curl de bÃ­ceps con mancuernas",
      "muscle":"BÃ­ceps",
      "equipment":"Mancuernas",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Evita balancear el tronco.",
      "category":"strength"
    },
    {
      "id":"barbell-curl",
      "name":"Curl de bÃ­ceps con barra",
      "muscle":"BÃ­ceps",
      "equipment":"Barra",
      "type":"Fuerza",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n los codos cerca del tronco.",
      "category":"strength"
    },
    {
      "id":"ez-bar-curl",
      "name":"Curl de bÃ­ceps con barra EZ",
      "muscle":"BÃ­ceps",
      "equipment":"Barra EZ",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Usa el agarre que mantenga las muÃ±ecas cÃ³modas.",
      "category":"strength"
    },
    {
      "id":"hammer-curl",
      "name":"Curl martillo",
      "muscle":"BÃ­ceps",
      "equipment":"Mancuernas",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n las palmas enfrentadas durante todo el recorrido.",
      "category":"strength"
    },
    {
      "id":"incline-db-curl",
      "name":"Curl inclinado con mancuernas",
      "muscle":"BÃ­ceps",
      "equipment":"Mancuernas",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n los hombros atrÃ¡s y evita adelantarlos.",
      "category":"strength"
    },
    {
      "id":"preacher-curl",
      "name":"Curl predicador",
      "muscle":"BÃ­ceps",
      "equipment":"Barra EZ",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n el brazo apoyado y no hiperextiendas el codo.",
      "category":"strength"
    },
    {
      "id":"cable-curl",
      "name":"Curl de bÃ­ceps en polea",
      "muscle":"BÃ­ceps",
      "equipment":"Polea",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Evita mover los hombros y mantÃ©n tensiÃ³n continua.",
      "category":"strength"
    },
    {
      "id":"concentration-curl",
      "name":"Curl concentrado",
      "muscle":"BÃ­ceps",
      "equipment":"Mancuernas",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Apoya el brazo y completa el recorrido sin impulso.",
      "category":"strength"
    },
    {
      "id":"triceps-pushdown",
      "name":"ExtensiÃ³n de trÃ­ceps en polea con barra",
      "muscle":"TrÃ­ceps",
      "equipment":"Polea",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n los codos pegados.",
      "category":"strength"
    },
    {
      "id":"rope-pushdown",
      "name":"ExtensiÃ³n de trÃ­ceps con cuerda",
      "muscle":"TrÃ­ceps",
      "equipment":"Polea",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Separa los extremos de la cuerda al final sin mover los codos.",
      "category":"strength"
    },
    {
      "id":"overhead-cable-extension",
      "name":"ExtensiÃ³n de trÃ­ceps sobre la cabeza en polea",
      "muscle":"TrÃ­ceps",
      "equipment":"Polea",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n los codos orientados al frente y las costillas controladas.",
      "category":"strength"
    },
    {
      "id":"skull-crusher",
      "name":"Press francÃ©s tumbado con barra EZ",
      "muscle":"TrÃ­ceps",
      "equipment":"Barra EZ",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Mueve desde el codo y evita abrirlos en exceso.",
      "category":"strength"
    },
    {
      "id":"close-grip-bench-press",
      "name":"Press de banca con agarre cerrado",
      "muscle":"TrÃ­ceps",
      "equipment":"Barra",
      "type":"Fuerza",
      "favorite":false,
      "custom":false,
      "notes":"Usa un agarre cÃ³modo y mantÃ©n los codos controlados.",
      "category":"strength"
    },
    {
      "id":"triceps-dip",
      "name":"Fondos para trÃ­ceps",
      "muscle":"TrÃ­ceps",
      "equipment":"Peso corporal",
      "type":"Fuerza",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n el tronco mÃ¡s vertical y evita una profundidad dolorosa.",
      "category":"strength",
      "recordTypes":[
        "bodyweight_reps"
      ]
    },
    {
      "id":"single-arm-cable-extension",
      "name":"ExtensiÃ³n de trÃ­ceps unilateral en polea",
      "muscle":"TrÃ­ceps",
      "equipment":"Polea",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n el hombro estable y extiende por completo sin impulso.",
      "category":"strength"
    },
    {
      "id":"db-overhead-triceps-extension",
      "name":"ExtensiÃ³n de trÃ­ceps sobre la cabeza con mancuerna",
      "muscle":"TrÃ­ceps",
      "equipment":"Mancuernas",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n las costillas controladas y evita abrir demasiado los codos.",
      "category":"strength"
    },
    {
      "id":"calf-raise",
      "name":"ElevaciÃ³n de gemelos en mÃ¡quina",
      "muscle":"Gemelos",
      "equipment":"MÃ¡quina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Busca recorrido completo.",
      "category":"strength"
    },
    {
      "id":"standing-calf-raise",
      "name":"ElevaciÃ³n de gemelos de pie",
      "muscle":"Gemelos",
      "equipment":"Mancuernas",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Pausa arriba y baja el talÃ³n con control.",
      "category":"strength"
    },
    {
      "id":"seated-calf-raise",
      "name":"ElevaciÃ³n de gemelos sentado",
      "muscle":"Gemelos",
      "equipment":"MÃ¡quina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n la almohadilla estable sobre los muslos.",
      "category":"strength"
    },
    {
      "id":"leg-press-calf-raise",
      "name":"ElevaciÃ³n de gemelos en prensa",
      "muscle":"Gemelos",
      "equipment":"MÃ¡quina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Mueve solo el tobillo y mantÃ©n las rodillas estables.",
      "category":"strength"
    },
    {
      "id":"plank",
      "name":"Plancha",
      "muscle":"Core",
      "equipment":"Peso corporal",
      "type":"Core",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n la pelvis neutra.",
      "category":"strength",
      "recordTypes":[
        "duration"
      ]
    },
    {
      "id":"side-plank",
      "name":"Plancha lateral",
      "muscle":"Core",
      "equipment":"Peso corporal",
      "type":"Core",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n cadera, hombros y pies alineados.",
      "category":"strength",
      "recordTypes":[
        "duration"
      ]
    },
    {
      "id":"dead-bug",
      "name":"Dead bug",
      "muscle":"Core",
      "equipment":"Peso corporal",
      "type":"Core",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n la zona lumbar estable mientras alternas brazos y piernas.",
      "category":"strength",
      "recordTypes":[
        "guided_repetitions"
      ]
    },
    {
      "id":"bird-dog",
      "name":"Bird dog",
      "muscle":"Core",
      "equipment":"Peso corporal",
      "type":"Core",
      "favorite":false,
      "custom":false,
      "notes":"Extiende brazo y pierna sin girar la pelvis.",
      "category":"strength",
      "recordTypes":[
        "guided_repetitions"
      ]
    },
    {
      "id":"pallof-press",
      "name":"Press Pallof",
      "muscle":"Core",
      "equipment":"Polea",
      "type":"Core",
      "favorite":false,
      "custom":false,
      "notes":"Resiste la rotaciÃ³n y mantÃ©n el tronco inmÃ³vil.",
      "category":"strength"
    },
    {
      "id":"cable-crunch",
      "name":"Crunch en polea",
      "muscle":"Core",
      "equipment":"Polea",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Flexiona el tronco sin tirar con los brazos.",
      "category":"strength"
    },
    {
      "id":"reverse-crunch",
      "name":"Crunch inverso",
      "muscle":"Core",
      "equipment":"Peso corporal",
      "type":"Core",
      "favorite":false,
      "custom":false,
      "notes":"Eleva la pelvis con control sin balancear las piernas.",
      "category":"strength",
      "recordTypes":[
        "bodyweight_reps"
      ]
    },
    {
      "id":"hanging-knee-raise",
      "name":"ElevaciÃ³n de rodillas colgado",
      "muscle":"Core",
      "equipment":"Peso corporal",
      "type":"Fuerza",
      "favorite":false,
      "custom":false,
      "notes":"Evita balancearte y eleva la pelvis al final.",
      "category":"strength",
      "recordTypes":[
        "bodyweight_reps"
      ]
    },
    {
      "id":"ab-wheel-rollout",
      "name":"Rueda abdominal",
      "muscle":"Core",
      "equipment":"Rueda abdominal",
      "type":"Fuerza",
      "favorite":false,
      "custom":false,
      "notes":"Avanza solo hasta donde puedas mantener la pelvis y las costillas controladas.",
      "category":"strength",
      "recordTypes":[
        "bodyweight_reps"
      ]
    },
    {
      "id":"farmer-carry",
      "name":"Paseo del granjero",
      "muscle":"Cuerpo completo",
      "equipment":"Mancuernas",
      "type":"Fuerza",
      "favorite":false,
      "custom":false,
      "notes":"Camina erguido sin inclinarte ni encoger los hombros.",
      "category":"strength",
      "recordTypes":[
        "distance_time"
      ]
    },
    {
      "id":"treadmill-walk",
      "name":"Caminata en cinta",
      "muscle":"Cardio",
      "equipment":"Cinta",
      "type":"Cardio",
      "favorite":false,
      "custom":false,
      "notes":"Usa una velocidad e inclinaciÃ³n que permitan mantener una tÃ©cnica cÃ³moda.",
      "category":"cardio",
      "recordTypes":[
        "distance_time"
      ]
    },
    {
      "id":"stationary-bike",
      "name":"Bicicleta estÃ¡tica",
      "muscle":"Cardio",
      "equipment":"Bicicleta",
      "type":"Cardio",
      "favorite":false,
      "custom":false,
      "notes":"Ajusta el sillÃ­n para pedalear sin bloquear la rodilla.",
      "category":"cardio",
      "recordTypes":[
        "distance_time"
      ]
    },
    {
      "id":"elliptical",
      "name":"ElÃ­ptica",
      "muscle":"Cardio",
      "equipment":"ElÃ­ptica",
      "type":"Cardio",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n una cadencia estable y el tronco erguido.",
      "category":"cardio",
      "recordTypes":[
        "distance_time"
      ]
    },
    {
      "id":"cat-cow",
      "name":"Gato-vaca",
      "muscle":"Movilidad",
      "equipment":"Esterilla",
      "type":"Movilidad",
      "favorite":false,
      "custom":false,
      "notes":"Alterna flexiÃ³n y extensiÃ³n suave sin forzar el rango.",
      "category":"mobility",
      "recordTypes":[
        "mobility_quality"
      ]
    },
    {
      "id":"thoracic-rotation",
      "name":"RotaciÃ³n torÃ¡cica en cuadrupedia",
      "muscle":"Movilidad",
      "equipment":"Esterilla",
      "type":"Movilidad",
      "favorite":false,
      "custom":false,
      "notes":"Rota desde la zona torÃ¡cica sin desplazar la pelvis.",
      "category":"mobility",
      "recordTypes":[
        "mobility_quality"
      ]
    },
    {
      "id":"hip-flexor-stretch",
      "name":"Estiramiento de flexores de cadera",
      "muscle":"Movilidad",
      "equipment":"Esterilla",
      "type":"Movilidad",
      "favorite":false,
      "custom":false,
      "notes":"MantÃ©n la pelvis neutra y avanza suavemente.",
      "category":"mobility",
      "recordTypes":[
        "mobility_quality"
      ]
    }
  ]);

  global.GymOSBuiltInExerciseCatalog=Object.freeze({
    get:function(){
      return clone(CATALOG);
    },
    size:CATALOG.length
  });
})(typeof window!=="undefined"?window:globalThis);
