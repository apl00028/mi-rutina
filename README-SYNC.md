# GymOS v3.8.5 — Corrección de bloqueo de navegación

GymOS sigue funcionando completamente en modo local.

Para activar sincronización entre dispositivos:

1. Crea un proyecto gratuito en Supabase.
2. Abre SQL Editor.
3. Ejecuta el contenido de `supabase-schema.sql`.
4. En GymOS, abre Ajustes → Sincronización.
5. Introduce la Project URL y la anon public key.
6. Solicita el enlace de acceso por correo.
7. Abre el enlace recibido y vuelve a GymOS.
8. Pulsa “Sincronizar ahora”.

La aplicación guarda una única copia JSON por usuario con:
- rutina;
- historial;
- seguimiento corporal;
- sesión seleccionada;
- descanso;
- objetivo semanal.

Resolución de conflictos:
- se conserva la copia con `updated_at` más reciente;
- antes de descargar datos remotos, GymOS crea una copia local automática;
- siempre puedes exportar una copia JSON desde Ajustes.

Seguridad:
- usa únicamente la anon public key;
- nunca introduzcas la service_role key;
- Row Level Security limita cada fila a su propietario.


## URL de autenticación obligatoria

En Supabase abre:

Authentication → URL Configuration

Configura:

- Site URL: `https://apl00028.github.io/mi-rutina/`
- Redirect URLs: `https://apl00028.github.io/mi-rutina/`


## Novedades de la versión 2.1

- Sincronización automática al abrir GymOS.
- Sincronización al finalizar un entrenamiento.
- Reintento automático al recuperar Internet.
- Sincronización periódica cada cinco minutos.
- Indicador visible de estado.
- Fecha de última sincronización.
- Nombre identificativo del dispositivo.
- Copia local previa antes de descargar datos remotos más recientes.
- Funcionamiento normal sin conexión.

La resolución de conflictos conserva la copia con la fecha `updatedAt` más reciente. Antes de sustituir datos locales por una copia remota, GymOS guarda una copia local de seguridad.


## Novedades de la versión 2.2

- Editor de la rutina desde el móvil.
- Añadir, modificar y eliminar ejercicios.
- Editar series, objetivo, tipo e incremento.
- Reordenar ejercicios.
- Copiar una sesión completa a otra.
- Vaciar una sesión.
- Importación y exportación mediante Excel conservadas.


## Novedades de la versión 2.3.0

- Creación de bloques de 4, 6 u 8 semanas.
- Fecha de inicio y objetivo de sesiones semanales.
- Bloque activo visible en la pantalla principal.
- Cálculo automático de la semana actual.
- Progreso temporal del bloque.
- Seguimiento de sesiones realizadas por semana.
- Semana de descarga configurable.
- Duplicar, editar, activar y eliminar bloques.
- Sincronización y copia de seguridad de los bloques.


## Novedades de la versión 2.3.1

- Orden semanal configurable de sesiones A, B y C.
- Próxima sesión prevista visible en la pantalla principal.
- Botón para preparar la siguiente sesión del bloque.
- Adherencia semanal calculada según las sesiones planificadas.
- Estado visual de cada sesión prevista.
- Desglose semanal completo dentro del bloque.
- Ajuste automático del plan al cambiar el número de sesiones por semana.


## Novedades de la versión 2.3.2

- Semana de descarga destacada en la pantalla principal.
- Configuración del porcentaje de volumen e intensidad durante la descarga.
- Resumen global de adherencia del bloque.
- Total de sesiones previstas y completadas.
- Finalización manual del bloque.
- Posibilidad de reabrir un bloque finalizado.
- Estado visual de bloques terminados.
- El bloque finalizado deja de mostrarse como activo.


## Novedades de la versión 2.3.3

- Panel de estadísticas para cada bloque.
- Adherencia total y semanal.
- Total de entrenamientos, volumen y minutos acumulados.
- Duración media de las sesiones.
- Distribución de entrenamientos A, B y C.
- Gráfico semanal de volumen.
- Mejores series registradas.
- Exportación del resumen del bloque en JSON.


## Novedades de la versión 2.4.0

- Panel de análisis global desde Ajustes.
- Volumen total y por categoría de ejercicio.
- Seguimiento individual de cada ejercicio.
- Mejor peso y 1RM estimado.
- Tendencia reciente de fuerza.
- Detección orientativa de posibles estancamientos.
- Historial visual de las últimas series.
- Estado de progreso por ejercicio.


## Novedades de la versión 2.5.0

- Biblioteca inicial de ejercicios.
- Buscador por nombre, músculo, material, tipo o notas.
- Filtros por grupo muscular y equipamiento.
- Ejercicios favoritos.
- Creación y edición de ejercicios personalizados.
- Eliminación segura de ejercicios propios.
- Notas técnicas.
- Adición directa a las sesiones A, B o C.
- Biblioteca incluida en la sincronización.


## Novedades de la versión 2.5.1

- Sustitución de ejercicios desde el editor de rutina.
- Alternativas ordenadas por grupo muscular y tipo.
- Filtro por material disponible.
- Motivo de sustitución: dolor, material, ocupación, casa o preferencia.
- Conservación automática de series, objetivo e incremento.
- Sustituciones favoritas.
- Restauración rápida del ejercicio original.
- Historial de sustituciones.
- Sincronización del historial y favoritos con Supabase.


## Novedades de la versión 2.5.2

- Ficha individual para cada ejercicio.
- Grupo muscular, equipamiento y tipo visibles en la ficha.
- Notas técnicas editables.
- Mejor peso registrado.
- Estimación de 1RM.
- Volumen acumulado.
- Número total de series registradas.
- Historial reciente de cargas, repeticiones, volumen, RIR y RPE.
- Acceso directo desde la biblioteca.
- Adición del ejercicio a las sesiones A, B o C desde su ficha.


## Novedades de la versión 2.5.3

- Pantalla específica para ejercicios favoritos.
- Ordenación por nombre, uso o fecha reciente.
- Información de uso por ejercicio favorito.
- Adición rápida a las sesiones A, B o C.
- Exportación completa de datos en JSON.
- Restauración combinada o reemplazo completo.
- Validación del archivo antes de restaurarlo.
- Cobertura visible del paquete de sincronización.
- Inclusión de rutina, historial, peso, bloques, biblioteca, sustituciones y favoritos.


## Novedades de la versión 3.0.0

- Nueva pantalla GymOS Coach.
- Análisis local de evolución sin enviar datos fuera del dispositivo.
- Propuestas de progresión, reducción de fatiga y mantenimiento.
- Uso de cargas, repeticiones, historial y RIR.
- Vista comparativa antes de aplicar cambios.
- Aprobación o rechazo manual de cada propuesta.
- Copia automática de la rutina antes de modificarla.
- Botón para deshacer el último cambio del Coach.
- Historial de propuestas y estados.
- Configuración del objetivo y duración máxima de las sesiones.
- Preparación para conectar un backend seguro de IA.
- Endpoint esperado: POST /coach/review.
- Las claves de OpenAI no se almacenan en el frontend público.


## Novedades de la versión 3.1.0

- Dashboard de progreso de 4, 8 o 12 semanas.
- Volumen semanal y número de series.
- Adherencia estimada sobre tres sesiones por semana.
- Distribución de series por grupo muscular.
- Récords personales y 1RM estimado.
- Tendencia de peso y ritmo semanal.
- Estimación de fatiga usando RIR, RPE, volumen y rendimiento.
- Recomendación de fase: acumulación, progresión, consolidación o descarga.
- Descarga automática propuesta por el Coach cuando la fatiga es alta.
- Mejor integración de la periodización con las propuestas del Coach.


## Novedades de la versión 3.2.0

- Chat integrado con GymOS Coach.
- Contexto automático de rutina, entrenamientos, fatiga, periodización y peso.
- Propuestas estructuradas generadas desde el chat.
- Confirmación manual antes de aplicar cualquier modificación.
- Prueba de conexión con el backend desde GymOS.
- Estado de conexión visible.
- Historial local de conversación.
- Accesos rápidos para revisar fatiga, cargas y equilibrio muscular.
- Manejo de errores y tiempo máximo de espera.
- Backend FastAPI incluido en la carpeta `backend`.
- Endpoints `/health`, `/coach/chat` y `/coach/review`.
- Configuración segura mediante variables de entorno.
- Restricción CORS configurable.
- La clave de OpenAI nunca se guarda en el frontend.


## Novedades de la versión 3.3.0

- Nuevo módulo de nutrición.
- Registro diario de calorías, proteínas, carbohidratos y grasas.
- Registro de agua, pasos y notas.
- Objetivos configurables de calorías y macronutrientes.
- Fases de definición, mantenimiento y volumen.
- Objetivo de cambio de peso semanal.
- Promedios de los últimos siete días.
- Barras de cumplimiento diario.
- Comparación entre tendencia de peso y objetivo semanal.
- Contexto nutricional integrado en GymOS Coach.
- Datos nutricionales incluidos en copias de seguridad y sincronización.
- Backend actualizado para interpretar el contexto nutricional de forma conservadora.


## Novedades de la versión 3.4.0

- Rediseño visual completo con superficies, sombras y jerarquía más moderna.
- Nueva pantalla de inicio con accesos rápidos a Progreso, Coach y Nutrición.
- Barra inferior renovada: Inicio, Entrenar, Progreso, Coach y Más.
- Tema claro, oscuro o automático según el dispositivo.
- Modo Usuario para ocultar configuraciones técnicas.
- Modo Desarrollador con diagnóstico, estado de servicios, almacenamiento y logs.
- Centro de desarrollador con prueba del backend Coach y sincronización manual.
- Descarga de diagnóstico técnico sin contraseñas ni claves secretas.
- Opción de interfaz compacta.
- Posibilidad de desactivar animaciones.
- Preferencias visuales incluidas en copias de seguridad.
- Compatibilidad mantenida con entrenamiento, nutrición, progreso, Coach y backend.


## Novedades de la versión 3.5.0

- Cuatro colores principales: violeta, azul, verde azulado y naranja.
- Temas claro, oscuro y automático.
- Tamaño de texto pequeño, normal, grande y muy grande.
- Densidad compacta, cómoda y amplia.
- Presets Equilibrado, Entrenamiento, Accesible e Intenso.
- Alto contraste.
- Botones y controles táctiles más grandes.
- Animaciones configurables.
- Preferencias persistentes e incluidas en las copias de seguridad.
- Compatibilidad mantenida con los modos Usuario y Desarrollador.


## Novedades de la versión 3.6.0

- Nuevo panel de salud y recuperación.
- Registro manual de sueño, pasos, frecuencia cardiaca en reposo, HRV y calorías activas.
- Puntuación diaria de recuperación basada en datos personales y baseline.
- Resumen de salud de los últimos siete días.
- Importación universal mediante CSV.
- Historial de importaciones.
- Preparación de conectores para Health Connect, Garmin Connect y Apple Health.
- Objetivos de sueño y pasos configurables.
- Baselines automáticos o manuales de frecuencia cardiaca y HRV.
- Datos de salud integrados en GymOS Coach.
- Datos y configuración incluidos en copias de seguridad.
- Advertencias de uso responsable y ausencia de diagnóstico médico.


## Novedades de la versión 3.7.0

- Pantalla específica de cuenta.
- Registro mediante correo y contraseña.
- Inicio de sesión mediante correo y contraseña.
- Inicio de sesión con Google preparado mediante Supabase OAuth.
- Recuperación de contraseña.
- Perfil con nombre visible.
- Detección y migración de datos locales a la cuenta.
- Sincronización ampliada para entrenamiento, nutrición, salud y preferencias.
- Separación de datos mediante UUID de usuario.
- Nuevo esquema SQL con Row Level Security para lectura, escritura y borrado.
- Tabla de perfiles.
- Solicitudes de eliminación de cuenta.
- Borrado de la copia de datos alojada en la nube.
- Exportación de datos desde la cuenta.
- Documento SECURITY.md con pruebas obligatorias de aislamiento.
- La app cliente utiliza únicamente una clave pública; las claves administrativas quedan fuera.

## Importante

Esta versión crea la base multiusuario, pero aún no es la versión final para
Google Play. Antes de una publicación pública deben añadirse autenticación del
backend Coach, límites de uso, política de privacidad, página web de eliminación
de cuenta y pruebas automáticas con dos usuarios independientes.


## Novedades de la versión 3.8.0

- Sincronización bidireccional con revisiones.
- Identificador persistente por dispositivo.
- Detección y resolución de conflictos.
- Registro exportable de sincronización.
- Checksum del contenido.
- SQL actualizado con metadatos y auditoría protegida por RLS.
- Prueba de aislamiento entre usuarios.
- Base de autenticación y limitación de peticiones para el backend Coach.


## Corrección v3.8.1

- El Excel ya no se descarga automáticamente al abrir «Más».
- La rutina solo se exporta al pulsar «Exportar rutina actual».
- Se restauran correctamente los botones de navegación y las pantallas de Ajustes.
- Se corrige la configuración técnica cuando el campo de correo no está presente.


## Parche v3.8.2

- Detección automática de planchas, planks e isométricos.
- Los ejercicios por tiempo no muestran peso ni repeticiones.
- Mini cronómetro independiente en cada serie.
- Botones para iniciar, parar y reiniciar.
- Al parar, el tiempo queda registrado automáticamente en segundos.
- También se puede corregir el número de segundos manualmente.
- El historial muestra el tiempo realizado en cada serie.


## Parche v3.8.3

- Corregido el botón Inicio dentro de la pantalla Más.
- Restaurada la activación de toda la barra inferior después de cargar Ajustes.
- Corregidos también Entrenar, Progreso, Coach y Más.
- Restaurados los accesos a Progreso, Bloques, Plan semanal y Seguimiento corporal.
- Se conserva el cronómetro por serie de la versión 3.8.2.


## Parche v3.8.4

- La barra inferior usa ahora un controlador global que sobrevive a todos los cambios de pantalla.
- Inicio, Entrenar, Progreso, Coach y Más funcionan desde cualquier sección.
- Se mantienen también bindings directos para accesibilidad.
- Entrenar vuelve a Inicio para seleccionar una sesión cuando todavía no hay ninguna elegida.
- Los cronómetros activos se detienen de forma segura al cambiar de pantalla.
- La navegación se reactiva automáticamente después de cada renderizado.


## Parche v3.8.5

- Corregida la causa real del bloqueo de la barra inferior.
- El estado `exerciseTimers` no estaba inicializado y producía un error al pulsar cualquier icono.
- La limpieza de cronómetros ahora es defensiva.
- Un posible error del cronómetro ya no puede bloquear Inicio, Entrenar, Progreso, Coach o Más.
- Mantiene todas las funciones de las versiones anteriores.
