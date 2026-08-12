# GymOS v4.2: runtime multisesión

## Modelo activo

GymOS utiliza el contenedor canónico `gymos:activeRoutine` para rutinas de dos a
seis sesiones. `routineId` identifica la rutina y `sessionId` identifica cada
sesión, aunque cambien su nombre u orden. `gymos:selectedSessionId` es la
selección autoritativa.

Las claves A/B/C se conservan únicamente como compatibilidad con datos
anteriores. No existen sombras legacy D/E/F.

## Drafts e historial

Los drafts canónicos de `gymos:routineDrafts` quedan aislados por `ownerId`,
`routineId`, `sessionId` y `draftId`. Los drafts A/B/C migrados siguen
disponibles mediante sus sombras de compatibilidad.

Una sesión finalizada registra `routineId`, `sessionId`, el nombre y snapshot de
la sesión, además de `legacySessionKey` cuando existe. El historial antiguo por
letra permanece legible y no se reescribe masivamente.

## Activación, sincronización y rollback

Las propuestas de dos a seis sesiones se activan sin regenerar ni truncar sus
IDs. El plan conserva la rutina canónica completa y genera únicamente la sombra
A/B/C que corresponda.

La rutina, drafts, selección y metadatos canónicos viajan en backup, vault y
sincronización. Las escrituras validan el propietario activo y restauran el
snapshot previo si falla una operación transaccional. El rollback recupera la
rutina y selección anteriores con sus IDs originales.

## Migración

H3 reutiliza la migración transaccional H2
`4.2.0-alpha.1-phase-h2`. No crea una segunda migración ni asigna IDs nuevos a
cuentas ya migradas.

## Compatibilidad offline

`routine-session-runtime.js` se carga después del modelo y la migración, y antes
de `app.js`. El service worker lo almacena junto al resto de módulos de la misma
versión de caché para evitar mezclar runtimes incompatibles.

## Deuda técnica auditada

H4 consolidó las definiciones equivalentes y muertas de `getDeviceId` y
`addDays`; queda una única implementación efectiva de cada función.

Se mantienen temporalmente dos definiciones históricas de
`estimatedOneRepMax`, porque difieren para una repetición y consolidarlas
requiere una decisión funcional. También se conservan los renderizadores
históricos de biblioteca: la última definición es la efectiva y las pruebas de
Fase G protegen ese comportamiento. Su retirada se pospone a Fase I/J para no
alterar funcionalidad durante el cierre multisesión.

## Lista manual reproducible H4

La automatización de navegador no estuvo disponible durante el cierre. La
revisión manual debe ejecutarse en un perfil de prueba, con DevTools abierto y
viewport móvil:

1. Para cada cantidad de dos a seis, genera una propuesta, revisa que aparezcan
   todas las sesiones con su nombre y actívala.
2. En Inicio, usa «Cambiar sesión» hasta completar una vuelta; recarga entre dos
   cambios y confirma que se conserva la sesión elegida.
3. Abre cada sesión, registra valores `0` y valores parciales, vuelve a Inicio y
   comprueba que su draft reaparece sin mezclarse con otra sesión.
4. En una sesión sin resultados, realiza y deshaz una sustitución temporal.
   Finaliza después una sesión con sustitución y confirma el ejercicio realizado
   en Historial y Progreso.
5. Crea una sustitución permanente desde Biblioteca, revisa la propuesta y
   confirma que la rutina no cambia hasta activarla.
6. Activa una segunda rutina con diferente número de sesiones y ejecuta
   rollback. Comprueba nombres, orden, selección y drafts restaurados.
7. Cambia entre dos cuentas de prueba durante lectura de importación y durante
   la confirmación de una propuesta; no debe aparecer información de la cuenta
   anterior.
8. Importa una rutina de cuatro sesiones, expórtala y confirma que las cuatro
   sesiones y sus nombres sobreviven al roundtrip.
9. Repite con datos legacy A/B/C, huecos A/C, solo B y solo C; comprueba que no
   aparecen claves legacy D/E/F.
10. Activa modo sin conexión después de una carga completa, recarga y abre
    Inicio, Mi rutina y Entrenar. Revisa que la consola no contenga errores de
    módulos o caché mezclada.
11. Repite los pasos esenciales con tema claro/oscuro, los cuatro tamaños de
    texto y navegación por teclado a 360, 390, 430 y 768 px.
