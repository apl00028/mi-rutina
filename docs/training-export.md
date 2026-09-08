# Exportación de entrenamientos

Ajustes → Datos → Exportar entrenamientos es el único acceso al historial completo.
El análisis de rutinas ya no tiene otra implementación de descarga. Las plantillas
Excel de rutinas y las exportaciones independientes de salud/nutrición no cambian.

`GET /api/v1/training/export` usa `require_user`, su bearer y la clave publicable.
No acepta un propietario seleccionable. Cada consulta filtra por la identidad
actual y valida el propietario de cada fila recibida. No modifica datos ni RLS.
Lee workouts, routines, swimming_sessions y running_sessions con paginación por
id, hasta recibir una página vacía; no depende del tamaño máximo de PostgREST.
Si falla alguna fuente, no entrega una exportación parcial. Respuesta no-store.

El archivo `aptus-entrenamientos-YYYY-MM-DD.json` usa la fecha UTC de generación.
La versión 1 conserva modelos diferentes dentro de sessions:

- Workouts Aptus finalizados: todas sus series y datos originales (también
  calentamientos), inicio/fin almacenados y rutina asociada como contexto de
  planificación. La disciplina procede de la rutina persistida; el esquema
  actual clasifica rutinas históricas sin disciplina como strength. Si no hay
  rutina identificable, discipline es null, nunca una disciplina inventada.
- Natación persistida: origen, versión del parser, marcas temporales y data
  original, incluidos largos, intervalos y métricas derivadas cuando existan.
- Carrera persistida: identidad de origen, timestamps y data original, sin
  transformar valores desconocidos en cero ni calcular ritmos nuevos.
- Ciclismo: workouts finalizados cuya rutina tenga discipline=cycling. No existe
  una tabla/importador de sesiones externas de ciclismo equivalente en este flujo.

Se conservan ausencia, null, cero y los campos específicos sin aplanarlos a una
fila de gimnasio. Los campos de unidades y las notas del archivo explican la
interpretación. Los timestamps originales mantienen su offset; no se atribuye
una zona horaria a timestamps antiguos que carezcan de ella. Los datos de rutina
son planificación, no rendimiento observado. No se fusionan fuentes por parecido.

Límites deliberados: JSON completo, sin selector de periodo ni resumen Excel;
no incluye actividades que solo existan en Health Connect y aún no se hayan
persistido, entrenamientos activos ni rutinas nunca ejecutadas. No es una copia
de seguridad de toda la cuenta. Las páginas no constituyen un snapshot
transaccional entre tablas: conviene evitar editar/borrar sesiones mientras se
exporta. El documento completo se construye en memoria; no es una plataforma de
exportación asíncrona para volúmenes masivos.

Web inicia una descarga; Android reutiliza el patrón Filesystem Cache + Share
existente. El fichero temporal queda en la caché privada para que la aplicación
receptora pueda leerlo. El mensaje no afirma que el usuario lo haya guardado.
Si cambia la cuenta antes de entregar el archivo, se descarta la respuesta.

Despliegue: backend antes de frontend. No hay SQL que aplicar.
