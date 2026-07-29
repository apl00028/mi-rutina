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
