# GymOS v2.0.1 — Sincronización opcional con Supabase

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

Si Supabase mantiene `http://localhost:3000`, el enlace mágico abrirá localhost y fallará.
