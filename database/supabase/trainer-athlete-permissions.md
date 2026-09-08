# Permisos por relación y conexiones en Ajustes

Base revisada: `4508179` (invitaciones SQL, backend y frontend). No se aplica SQL remoto desde este cambio.

## Inventario y frontera

`trainer_athletes`: PK `(trainer_id, athlete_id)`, FK a `auth.users` con cascade,
status active/inactive, created_at/updated_at. Las invitaciones crean/reactivan
la relación solo cuando el receptor acepta. No se modifica ese consentimiento.

Los siguientes endpoints del router `/api/v1/trainer` usan RPCs públicas con
bearer del usuario y clave publicable; se conservan sus firmas/RETURNS:

| Endpoint | RPC | Autorización tras aplicar el SQL |
|---|---|---|
| GET /athletes | trainer_list_athlete_identities() | Relación activa + ambos roles/cuentas válidos (atleta user/admin); identidad básica |
| GET /athletes/{athlete_id} | trainer_get_athlete_overview(uuid) | Igual; cada bloque se filtra por dominio |
| GET /athletes/{athlete_id}/strength-sessions | trainer_list_athlete_strength_sessions(uuid) | strength |
| GET /athletes/{athlete_id}/running-sessions | trainer_list_athlete_running_sessions(uuid) | running |
| GET /athletes/{athlete_id}/running-sessions/{session_id} | trainer_get_athlete_running_session(uuid,text) | running |
| GET /athletes/{athlete_id}/swimming-sessions | trainer_list_athlete_swimming_sessions(uuid) | swimming |
| GET /athletes/{athlete_id}/swimming-sessions/{session_id} | trainer_get_athlete_swimming_session(uuid,text) | swimming |
| POST /templates/{template_id}/assign | trainer_assign_routine_template(uuid,text,text) | Dominio de la plantilla, también para escribir |

No hay RPC de sesiones de ciclismo ni endpoint separado de salud del entrenador.
Cycling se aplica a rutinas, asignaciones y al agregado de workouts en overview.
Health protege `health_weight_entries` y `health_body_measurements` del overview.
Los repositorios normales de salud, rutinas, workouts y endurance siguen usando
ownership del usuario; no se añade ninguna lectura directa para entrenadores.

El overview filtra antes de latest/count/limit: última actividad, conteos,
rutinas activas y última asignación. No basta ocultar un bloque en frontend.
Los campos de salud no compartidos quedan null; rutinas no compartidas null;
conteos y última sesión solo incluyen disciplinas compartidas y reconocidas
por la rutina persistida. Un workout sin rutina verificable no entra al agregado.
Se conserva el alcance histórico de overview (workouts Aptus, no sesiones
endurance externas) y el límite 25 de las RPCs de listas.

También se endurece RLS de `trainer_routine_assignments`: exige relación activa
+ permiso del dominio. Las plantillas propias del entrenador siguen siendo suyas.
Las políticas de lectura de relaciones validan rol/cuenta/expiry; las relaciones
son metadatos de conexión, no datos de salud. No hay escritura directa autenticada.

## Modelo y consentimiento

Nueva tabla `public.trainer_athlete_permissions`:
- trainer_id uuid NOT NULL, athlete_id uuid NOT NULL;
- domain text NOT NULL, CHECK swimming/running/cycling/strength/health;
- granted_at timestamptz NOT NULL DEFAULT clock_timestamp();
- PK (trainer_id, athlete_id, domain);
- FK compuesta a trainer_athletes ON DELETE CASCADE.

No fila = no permiso. No booleanos implícitos ni permisos por rol admin.
RLS activado, sin grants ni policies para acceso directo a esta tabla.
Solo el atleta dueño puede reemplazar sus dominios mediante RPC.

Decisión confirmada: relaciones existentes se conservan SIN concesiones
iniciales, igual que las nuevas. Habrá una interrupción deliberada del acceso
hasta que el atleta guarde sus elecciones en Ajustes. No se infiere consentimiento
por asignaciones antiguas, emails, invitaciones aceptadas ni sesiones anteriores.

El caso del administrador que también es atleta histórico se configura desde su
propia sesión con `domains: ["swimming"]`. Los identificadores reales se usan
solo como fixtures de tests. No hay excepciones por UUID ni cambios de rol.


## Contratos nuevos

RPCs públicas, todas SECURITY DEFINER, search_path='', EXECUTE solo authenticated:

- `list_my_trainer_athlete_connections()` RETURNS TABLE (
  trainer_id uuid, athlete_id uuid, status text, created_at timestamptz,
  updated_at timestamptz, other_display_name text, other_alias text, domains text[]).
- `set_my_trainer_permissions(p_trainer_id uuid, p_domains text[], p_expected_updated_at timestamptz)` RETURNS timestamptz.
- `unlink_my_trainer_athlete_connection(p_other_user_id uuid, p_expected_updated_at timestamptz)` RETURNS void.
- `trainer_has_athlete_domain(p_athlete_id uuid, p_domain text)` RETURNS boolean.
  El helper público se necesita desde RLS y devuelve únicamente el acceso del actor
  auth.uid(); nunca acepta trainer_id ni resuelve usuarios ajenos.

Helpers privados sin USAGE/EXECUTE para authenticated/anon/PUBLIC:
`trainer_has_active_athlete(uuid)` y trigger `clear_relationship_permissions()`.
La validez requiere trainer exacto, atleta user/admin, ambas cuentas active y
expires_at nulo o futuro, relación active y concesión exacta.

HTTP, reutilizando el dominio connections:
- GET `/api/v1/connections/relationships`: lista tipada.
- PUT `/api/v1/connections/trainers/{trainer_id}/permissions`:
  `{domains: [...], expected_updated_at: <timestamp original>}` → `{updated_at: ...}`.
- POST `/api/v1/connections/relationships/{other_user_id}/unlink`:
  `{expected_updated_at: ...}` → 204.

No user_id del atleta en la escritura: siempre auth.uid(). Admin solo participa
como atleta propietario; no como entrenador ni en relaciones ajenas. Actualización por trainer
rechazada tanto en backend como SQL. Errores de cuenta 403, relación ajena/no
visible 404 genérico, versión obsoleta 409, dominios inválidos 400/422. Sin DETAIL.

## Concurrencia y revocación

Edición y unlink bloquean la fila de relación FOR UPDATE y comparan
expected_updated_at. Solo una operación con la misma versión puede ganar;
la otra recibe conflicto. El frontend conserva los timestamps completos sin
convertirlos a Date ni recortar microsegundos. Cada escritura avanza updated_at.
La asignación también bloquea la relación antes de comprobar el permiso y escribir.

Unlink cambia status a inactive; el trigger borra todas las concesiones.
Reactivar no las recupera. Se requiere nueva invitación aceptada y nueva elección
del atleta. Las consultas iniciadas antes de un commit pueden terminar con su
snapshot anterior; no se puede retirar información ya descargada.

FK cascade garantiza borrado final al eliminar auth.users. `delete-account.sql`
no necesita otro DELETE: su limpieza intermedia no elimina estas concesiones,
pero el borrado final de auth.users sí las elimina a través de trainer_athletes.

## UX y despliegue

Ajustes → Conexiones muestra Entrenadores para user/admin y Clientes para trainer.
Contiene relaciones, invitaciones, código de contacto, edición explícita de
permisos por atleta y confirmación de desvinculación para ambos participantes.
Trainer → Clientes conserva la consulta operativa y enlaza a Ajustes para gestión.
`/entrenadores` redirige a `/ajustes/conexiones`; sin enlace de navegación principal.
No se declara guardado/desvinculado hasta recibir éxito del backend.

Orden remoto recomendado (requiere acción posterior autorizada):
1. Comunicar la retirada temporal del acceso y verificar los prerrequisitos SQL.
2. Aplicar UNA VEZ `trainer-athlete-permissions.sql` completo y transaccional.
   Incluye CREATE OR REPLACE de los cuatro helpers de invitaciones que cambian
   (actor, creación, transición y listado), para actualizar instalaciones ya desplegadas.
   No reaplicar `trainer-athlete-invitations.sql`: es el bootstrap de tablas.
   No reaplicar las definiciones antiguas de trainer después: restaurarían accesos.
3. Verificar ACL/RLS y que todos los dominios están denegados inicialmente.
4. Desplegar backend corregido; después frontend corregido (APK incluido cuando
   corresponda). Así ninguna UI nueva llama endpoints/RPCs todavía inexistentes.
5. Con la sesión autenticada del admin-atleta, obtener la versión de SU relación
   y guardar explícitamente solo swimming. Verificar natación sí, los demás no,
   otro trainer no y admin sin capacidades trainer. Puede hacerse mediante API
   tras el paso 4 de backend para acortar la espera del frontend.

Antes del commit SQL sobreviven los permisos amplios del sistema anterior.
Desde ese commit hasta la concesión inicial hay denegación total de dominios,
intencional y temporal. Conceder swimming restaura únicamente natación.
Si se requiere interrumpir inmediatamente el acceso anterior, la suspensión debe
cubrir RPCs/lecturas directas en Supabase, no únicamente el backend HTTP.

El SQL no es idempotente: un segundo intento falla en CREATE TABLE y revierte.
No se publica ni ejecuta remotamente desde esta tarea. Un rollback que restaure
RPCs anteriores volvería a exponer datos sin consentimiento; ante incidencia,
preferir corregir hacia delante o revocar EXECUTE de lecturas trainer temporalmente.

## Orden único de bootstrap y barrera de históricos

Para una instalación nueva, aplicar los archivos completos en este orden:
1. Base y SQL históricos, respetando sus dependencias (cuentas/perfiles,
   rutinas/workouts/endurance/salud, trainer-athletes, plantillas, asignaciones
   y consultas trainer).
2. `trainer-athlete-invitations.sql`.
3. `trainer-athlete-permissions.sql` **AL FINAL**.

Una instalación que ya tiene base e invitaciones solo necesita el paso 3.
Después no se reaplican históricos protegidos ni se reaplica automáticamente
permissions.sql. Las siguientes modificaciones requieren un cambio SQL posterior
revisado que preserve la autorización vigente.

La señal estable es la existencia de `public.trainer_athlete_permissions`,
consultada mediante `pg_catalog.to_regclass`; no depende de filas, UUIDs ni
nombres de policies. Estos diez históricos abortan con SQLSTATE 55000 y el
mensaje `trainer_permissions_installed` si la tabla ya existe:

- trainer-athletes.sql
- trainer-routine-assignments.sql
- trainer-athlete-identities.sql
- trainer-athlete-overview.sql
- trainer-athlete-strength-sessions.sql
- trainer-athlete-swimming-sessions.sql
- trainer-athlete-swimming-session-detail.sql
- trainer-athlete-running-sessions.sql
- trainer-athlete-running-session-detail.sql
- trainer-athlete-invitations.sql

La comprobación precede a toda modificación y el archivo completo está dentro
de BEGIN/COMMIT: incluso un cliente que continúa tras el error no puede aplicar
las sentencias restantes. Ejecutar siempre el archivo completo, sin seleccionar
solo fragmentos ni intercalar COMMIT. La barrera evita reaplicaciones accidentales;
no pretende limitar a un administrador que elimine deliberadamente la barrera.
Los tests PostgreSQL verifican error explícito, definiciones/ACLs/policies intactas,
relación/permisos intactos y autorización swimming-only después de cada intento,
tanto con parada al primer error como continuando tras él.
