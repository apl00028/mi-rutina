(function(global){
  "use strict";

  function clone(value){return JSON.parse(JSON.stringify(value));}
  function deepFreeze(value){
    if(!value||typeof value!=="object"||Object.isFrozen(value)) return value;
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
      "notes":"Escápulas retraídas y pies firmes.",
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
      "notes":"Mantén las muñecas neutras y controla la bajada.",
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
      "notes":"Usa una inclinación moderada y evita elevar los hombros.",
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
      "name":"Press de pecho en máquina",
      "muscle":"Pecho",
      "equipment":"Máquina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Ajusta el asiento para que las empuñaduras queden a la altura del pecho.",
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
      "notes":"Mantén una ligera flexión de codo y junta los brazos sin encoger hombros.",
      "category":"strength"
    },
    {
      "id":"pec-deck-fly",
      "name":"Aperturas en peck deck",
      "muscle":"Pecho",
      "equipment":"Máquina",
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
      "notes":"No bajes más allá de un rango cómodo para el hombro.",
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
      "notes":"Mantén el cuerpo alineado y los codos en una trayectoria cómoda.",
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
      "name":"Jalón al pecho",
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
      "name":"Jalón al pecho con agarre neutro",
      "muscle":"Espalda",
      "equipment":"Polea",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Inicia el movimiento bajando las escápulas antes de flexionar los codos.",
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
      "equipment":"Máquina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Usa la mínima asistencia que permita repeticiones limpias.",
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
      "notes":"Mantén las costillas controladas y evita impulsarte.",
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
      "notes":"Mantén la espalda neutra.",
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
      "notes":"Evita llevar el tronco hacia atrás para completar la repetición.",
      "category":"strength"
    },
    {
      "id":"machine-row",
      "name":"Remo en máquina",
      "muscle":"Espalda",
      "equipment":"Máquina",
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
      "notes":"Mantén la pelvis estable y lleva el codo hacia la cadera.",
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
      "notes":"Mantén el pecho apoyado y evita encoger los hombros.",
      "category":"strength"
    },
    {
      "id":"t-bar-row",
      "name":"Remo en T",
      "muscle":"Espalda",
      "equipment":"Máquina",
      "type":"Fuerza",
      "favorite":false,
      "custom":false,
      "notes":"Mantén el abdomen activo y no redondees la zona lumbar.",
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
      "notes":"Mantén los codos casi extendidos y mueve desde el hombro.",
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
      "notes":"Mantén los codos altos y el tronco erguido.",
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
      "notes":"Sujeta la carga cerca del pecho y mantén el pie completo apoyado.",
      "category":"strength"
    },
    {
      "id":"smith-squat",
      "name":"Sentadilla en máquina Smith",
      "muscle":"Piernas",
      "equipment":"Máquina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Coloca los pies donde puedas mantener una trayectoria cómoda.",
      "category":"strength"
    },
    {
      "id":"hack-squat",
      "name":"Sentadilla hack",
      "muscle":"Piernas",
      "equipment":"Máquina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Mantén la espalda apoyada y controla la profundidad.",
      "category":"strength"
    },
    {
      "id":"leg-press",
      "name":"Prensa de piernas",
      "muscle":"Piernas",
      "equipment":"Máquina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"No bloquees las rodillas.",
      "category":"strength"
    },
    {
      "id":"bulgarian-split-squat",
      "name":"Sentadilla búlgara",
      "muscle":"Piernas",
      "equipment":"Mancuernas",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Mantén estable la rodilla delantera y controla la bajada.",
      "category":"strength"
    },
    {
      "id":"reverse-lunge",
      "name":"Zancada hacia atrás",
      "muscle":"Piernas",
      "equipment":"Mancuernas",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Da un paso suficiente para mantener el talón delantero apoyado.",
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
      "notes":"Mantén el tronco estable y evita pasos demasiado cortos.",
      "category":"strength"
    },
    {
      "id":"step-up",
      "name":"Subida al cajón",
      "muscle":"Piernas",
      "equipment":"Mancuernas",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Impúlsate con la pierna que está sobre el cajón.",
      "category":"strength"
    },
    {
      "id":"leg-extension",
      "name":"Extensión de piernas",
      "muscle":"Cuádriceps",
      "equipment":"Máquina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Alinea la rodilla con el eje de la máquina.",
      "category":"strength"
    },
    {
      "id":"hip-thrust",
      "name":"Hip thrust con barra",
      "muscle":"Glúteos",
      "equipment":"Barra",
      "type":"Fuerza",
      "favorite":false,
      "custom":false,
      "notes":"Termina extendiendo la cadera sin hiperextender la zona lumbar.",
      "category":"strength"
    },
    {
      "id":"machine-hip-thrust",
      "name":"Hip thrust en máquina",
      "muscle":"Glúteos",
      "equipment":"Máquina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Ajusta la almohadilla sobre la pelvis y controla la bajada.",
      "category":"strength"
    },
    {
      "id":"glute-bridge",
      "name":"Puente de glúteos",
      "muscle":"Glúteos",
      "equipment":"Peso corporal",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Aprieta glúteos arriba sin arquear la espalda.",
      "category":"strength",
      "recordTypes":[
        "bodyweight_reps"
      ]
    },
    {
      "id":"cable-kickback",
      "name":"Extensión de cadera en polea",
      "muscle":"Glúteos",
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
      "notes":"Desplaza la cadera atrás.",
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
      "notes":"Mantén las mancuernas cerca de las piernas y lleva la cadera atrás.",
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
      "notes":"Prepara tensión antes de despegar la barra del suelo.",
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
      "notes":"Mantén el torso firme y empuja el suelo con los pies.",
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
      "notes":"Mantén las rodillas alineadas con los pies y la barra cerca.",
      "category":"strength"
    },
    {
      "id":"leg-curl",
      "name":"Curl femoral sentado",
      "muscle":"Isquios",
      "equipment":"Máquina",
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
      "equipment":"Máquina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Mantén la pelvis apoyada durante toda la repetición.",
      "category":"strength"
    },
    {
      "id":"single-leg-curl",
      "name":"Curl femoral unilateral",
      "muscle":"Isquios",
      "equipment":"Máquina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Completa el recorrido sin girar la pelvis.",
      "category":"strength"
    },
    {
      "id":"cable-pull-through",
      "name":"Pull through en polea",
      "muscle":"Glúteos",
      "equipment":"Polea",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Deja que la cadera viaje atrás y termina contrayendo glúteos.",
      "category":"strength"
    },
    {
      "id":"machine-hip-abduction",
      "name":"Abducción de cadera en máquina",
      "muscle":"Glúteos",
      "equipment":"Máquina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Mantén la pelvis estable y evita impulsos.",
      "category":"strength"
    },
    {
      "id":"cable-hip-abduction",
      "name":"Abducción de cadera en polea",
      "muscle":"Glúteos",
      "equipment":"Polea",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Mueve la pierna sin inclinar el tronco.",
      "category":"strength"
    },
    {
      "id":"machine-hip-adduction",
      "name":"Aducción de cadera en máquina",
      "muscle":"Aductores",
      "equipment":"Máquina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Cierra las piernas con control y sin rebotes.",
      "category":"strength"
    },
    {
      "id":"nordic-hamstring-curl",
      "name":"Curl nórdico de isquios",
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
      "notes":"Aprieta glúteos y abdomen.",
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
      "notes":"Mantén los antebrazos verticales y evita arquear la espalda.",
      "category":"strength"
    },
    {
      "id":"machine-shoulder-press",
      "name":"Press de hombros en máquina",
      "muscle":"Hombros",
      "equipment":"Máquina",
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
      "name":"Elevación lateral en polea",
      "muscle":"Hombros",
      "equipment":"Polea",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Mantén tensión continua y evita elevar el hombro.",
      "category":"strength"
    },
    {
      "id":"machine-lateral-raise",
      "name":"Elevación lateral en máquina",
      "muscle":"Hombros",
      "equipment":"Máquina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Alinea el hombro con el eje de la máquina.",
      "category":"strength"
    },
    {
      "id":"front-raise",
      "name":"Elevación frontal con mancuernas",
      "muscle":"Hombros",
      "equipment":"Mancuernas",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Eleva hasta una altura cómoda sin balancear el tronco.",
      "category":"strength"
    },
    {
      "id":"rear-delt-fly",
      "name":"Pájaros con mancuernas",
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
      "name":"Pájaros en peck deck",
      "muscle":"Hombros",
      "equipment":"Máquina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Mantén el pecho apoyado y abre desde el hombro.",
      "category":"strength"
    },
    {
      "id":"upright-row",
      "name":"Remo al mentón",
      "muscle":"Hombros",
      "equipment":"Barra",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Usa un agarre cómodo y no subas por encima de un rango sin dolor.",
      "category":"strength"
    },
    {
      "id":"cable-external-rotation",
      "name":"Rotación externa de hombro en polea",
      "muscle":"Hombros",
      "equipment":"Polea",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Mantén el codo pegado al cuerpo y usa poca carga.",
      "category":"strength"
    },
    {
      "id":"biceps-curl",
      "name":"Curl de bíceps con mancuernas",
      "muscle":"Bíceps",
      "equipment":"Mancuernas",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Evita balancear el tronco.",
      "category":"strength"
    },
    {
      "id":"barbell-curl",
      "name":"Curl de bíceps con barra",
      "muscle":"Bíceps",
      "equipment":"Barra",
      "type":"Fuerza",
      "favorite":false,
      "custom":false,
      "notes":"Mantén los codos cerca del tronco.",
      "category":"strength"
    },
    {
      "id":"ez-bar-curl",
      "name":"Curl de bíceps con barra EZ",
      "muscle":"Bíceps",
      "equipment":"Barra EZ",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Usa el agarre que mantenga las muñecas cómodas.",
      "category":"strength"
    },
    {
      "id":"hammer-curl",
      "name":"Curl martillo",
      "muscle":"Bíceps",
      "equipment":"Mancuernas",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Mantén las palmas enfrentadas durante todo el recorrido.",
      "category":"strength"
    },
    {
      "id":"incline-db-curl",
      "name":"Curl inclinado con mancuernas",
      "muscle":"Bíceps",
      "equipment":"Mancuernas",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Mantén los hombros atrás y evita adelantarlos.",
      "category":"strength"
    },
    {
      "id":"preacher-curl",
      "name":"Curl predicador",
      "muscle":"Bíceps",
      "equipment":"Barra EZ",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Mantén el brazo apoyado y no hiperextiendas el codo.",
      "category":"strength"
    },
    {
      "id":"cable-curl",
      "name":"Curl de bíceps en polea",
      "muscle":"Bíceps",
      "equipment":"Polea",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Evita mover los hombros y mantén tensión continua.",
      "category":"strength"
    },
    {
      "id":"concentration-curl",
      "name":"Curl concentrado",
      "muscle":"Bíceps",
      "equipment":"Mancuernas",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Apoya el brazo y completa el recorrido sin impulso.",
      "category":"strength"
    },
    {
      "id":"triceps-pushdown",
      "name":"Extensión de tríceps en polea con barra",
      "muscle":"Tríceps",
      "equipment":"Polea",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Mantén los codos pegados.",
      "category":"strength"
    },
    {
      "id":"rope-pushdown",
      "name":"Extensión de tríceps con cuerda",
      "muscle":"Tríceps",
      "equipment":"Polea",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Separa los extremos de la cuerda al final sin mover los codos.",
      "category":"strength"
    },
    {
      "id":"overhead-cable-extension",
      "name":"Extensión de tríceps sobre la cabeza en polea",
      "muscle":"Tríceps",
      "equipment":"Polea",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Mantén los codos orientados al frente y las costillas controladas.",
      "category":"strength"
    },
    {
      "id":"skull-crusher",
      "name":"Press francés tumbado con barra EZ",
      "muscle":"Tríceps",
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
      "muscle":"Tríceps",
      "equipment":"Barra",
      "type":"Fuerza",
      "favorite":false,
      "custom":false,
      "notes":"Usa un agarre cómodo y mantén los codos controlados.",
      "category":"strength"
    },
    {
      "id":"triceps-dip",
      "name":"Fondos para tríceps",
      "muscle":"Tríceps",
      "equipment":"Peso corporal",
      "type":"Fuerza",
      "favorite":false,
      "custom":false,
      "notes":"Mantén el tronco más vertical y evita una profundidad dolorosa.",
      "category":"strength",
      "recordTypes":[
        "bodyweight_reps"
      ]
    },
    {
      "id":"single-arm-cable-extension",
      "name":"Extensión de tríceps unilateral en polea",
      "muscle":"Tríceps",
      "equipment":"Polea",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Mantén el hombro estable y extiende por completo sin impulso.",
      "category":"strength"
    },
    {
      "id":"db-overhead-triceps-extension",
      "name":"Extensión de tríceps sobre la cabeza con mancuerna",
      "muscle":"Tríceps",
      "equipment":"Mancuernas",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Mantén las costillas controladas y evita abrir demasiado los codos.",
      "category":"strength"
    },
    {
      "id":"calf-raise",
      "name":"Elevación de gemelos en máquina",
      "muscle":"Gemelos",
      "equipment":"Máquina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Busca recorrido completo.",
      "category":"strength"
    },
    {
      "id":"standing-calf-raise",
      "name":"Elevación de gemelos de pie",
      "muscle":"Gemelos",
      "equipment":"Mancuernas",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Pausa arriba y baja el talón con control.",
      "category":"strength"
    },
    {
      "id":"seated-calf-raise",
      "name":"Elevación de gemelos sentado",
      "muscle":"Gemelos",
      "equipment":"Máquina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Mantén la almohadilla estable sobre los muslos.",
      "category":"strength"
    },
    {
      "id":"leg-press-calf-raise",
      "name":"Elevación de gemelos en prensa",
      "muscle":"Gemelos",
      "equipment":"Máquina",
      "type":"Hipertrofia",
      "favorite":false,
      "custom":false,
      "notes":"Mueve solo el tobillo y mantén las rodillas estables.",
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
      "notes":"Mantén la pelvis neutra.",
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
      "notes":"Mantén cadera, hombros y pies alineados.",
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
      "notes":"Mantén la zona lumbar estable mientras alternas brazos y piernas.",
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
      "notes":"Resiste la rotación y mantén el tronco inmóvil.",
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
      "name":"Elevación de rodillas colgado",
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
      "notes":"Usa una velocidad e inclinación que permitan mantener una técnica cómoda.",
      "category":"cardio",
      "recordTypes":[
        "distance_time"
      ]
    },
    {
      "id":"stationary-bike",
      "name":"Bicicleta estática",
      "muscle":"Cardio",
      "equipment":"Bicicleta",
      "type":"Cardio",
      "favorite":false,
      "custom":false,
      "notes":"Ajusta el sillín para pedalear sin bloquear la rodilla.",
      "category":"cardio",
      "recordTypes":[
        "distance_time"
      ]
    },
    {
      "id":"elliptical",
      "name":"Elíptica",
      "muscle":"Cardio",
      "equipment":"Elíptica",
      "type":"Cardio",
      "favorite":false,
      "custom":false,
      "notes":"Mantén una cadencia estable y el tronco erguido.",
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
      "notes":"Alterna flexión y extensión suave sin forzar el rango.",
      "category":"mobility",
      "recordTypes":[
        "mobility_quality"
      ]
    },
    {
      "id":"thoracic-rotation",
      "name":"Rotación torácica en cuadrupedia",
      "muscle":"Movilidad",
      "equipment":"Esterilla",
      "type":"Movilidad",
      "favorite":false,
      "custom":false,
      "notes":"Rota desde la zona torácica sin desplazar la pelvis.",
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
      "notes":"Mantén la pelvis neutra y avanza suavemente.",
      "category":"mobility",
      "recordTypes":[
        "mobility_quality"
      ]
    }
  ]);
  const api=Object.freeze({
    get:function(){return clone(CATALOG);},
    size:CATALOG.length
  });

  global.GymOSBuiltInExerciseCatalog=api;
  if(typeof module!=="undefined"&&module.exports) module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
