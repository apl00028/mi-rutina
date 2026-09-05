# Experiencia de entrenador: contratos inspeccionados

Inspección local previa al rediseño, 5 de septiembre de 2026. No se ha consultado una cuenta de producción ni modificado backend o SQL. Había cambios locales en App y Trainer, conservados como base.

- `core/trainer.service.ts` y `backend/app/domains/trainer/{models,router,service}.py`: clientes, overview, listado de fuerza con ejercicios y series, listado de natación y detalle individual, listado de carrera, plantillas con Routine completo y asignación.
- Fuerza: reps, carga, duración, RIR y RPE registrados. Natación: distancia, piscina, duración, FC, ritmo, brazadas, largos, tiempos y training effect opcionales. Carrera: nombre y fechas; duración solo si existe o como tiempo transcurrido entre inicio y fin. No hay endpoint trainer de sesiones de bicicleta.
- Los tres listados de rendimiento tienen límite de 25 registros por disciplina y no exponen paginación. El calendario representa las sesiones disponibles, no un historial completo.
- `trainer-athlete-overview.sql`: `completed_last_7_days` y `last_completed` proceden de `workouts`; no incluyen `swimming_sessions` importadas. La interfaz debe explicitar ese alcance, sin presentarlo como un total de todas las fuentes.
- Rutinas activas: solo identificador, nombre y fecha. No existe una ruta autorizada del trainer para leer el Routine del atleta. No enlazar a las rutinas propias del entrenador ni sustituir una copia asignada por la plantilla actual.
- El overview solo devuelve `trainer.last_assignment`, no todas las asignaciones ni su vigencia. No inferir «Asignada a…» en la biblioteca.
- `trainer-routine-assignments.sql`: el POST exige `athlete_id` y un `routine_id` no vacío y sin espacios exteriores. Crea una copia y su asignación en una transacción; rechaza un ID ya existente; no cambia `active_routines`. Una nueva asignación usa un UUID criptográfico y conserva el ID al reintentar el mismo intento. No hay reemplazo o activación implícita.
- Routine: `sessions[]`; fuerza usa `exercises[]` con `sets`, `target`, `targetRir`, `weight`, `restSeconds` y `prescription`; natación usa `blocks[].sets[]`; carrera usa bloques con duración/distancia, repeticiones, intensidad y recuperación. Ver `pages/routines/routines.ts`, `features/swimming/domain/swimming-routine.ts` y `features/running/domain/running-routine.ts`. No se inventa un esquema específico de bicicleta.


## Verificación

- Pruebas HTTP y de componentes: navegación por query, atrás/adelante, distinción trainer/admin, detalle por día, métricas opcionales, errores parciales, respuestas tardías de natación, filtros y asignación con UUID interno. Sin envíos a clientes reales.
- Compilación de desarrollo y producción. Producción avisa del presupuesto inicial (aprox. 655 kB frente a 500 kB) y de los estilos de Entrenar/Nutrición; no bloquea la compilación.
- Revisión en Chrome a 390 px y 1440 px con respuestas simuladas ajustadas a los contratos locales. Panel, Clientes, calendario, sesiones, biblioteca, detalle y selección de cliente. Se conserva la separación de roles y se omiten enlaces a detalles que la API no permite leer.
