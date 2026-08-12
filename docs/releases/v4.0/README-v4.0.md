# GymOS v4.0.0

## Nuevo flujo inicial

Después de iniciar sesión por primera vez, GymOS muestra un cuestionario de cinco pasos:

1. Datos básicos
2. Objetivo y experiencia
3. Disponibilidad y equipamiento
4. Lesiones, molestias y ejercicios a evitar
5. Revisión y creación del plan

La rutina se genera con reglas internas y precauciones básicas, no mediante improvisación libre de IA.

## Datos y sincronización

El perfil deportivo se guarda en `gymos:onboardingProfile`, forma parte de la copia de seguridad y se sincroniza mediante la tabla `gymos_sync` ya creada en Supabase.

No hace falta ejecutar SQL adicional para actualizar desde v3.9.1.

## Volver a realizar el cuestionario

Más → Objetivo y perfil deportivo → Revisar objetivo y regenerar rutina.

Al confirmar una nueva propuesta, se reemplaza la rutina actual. El historial de entrenamientos no se borra.
