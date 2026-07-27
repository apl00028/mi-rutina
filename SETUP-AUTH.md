# GymOS v3.9.0 — Configuración de acceso privado

## 1. Crear el proyecto

Crea un proyecto en Supabase.

## 2. Configurar la aplicación

En Supabase abre:

Project Settings → API

Copia:

- Project URL
- anon public key

Edita `auth-config.js`:

```js
window.GYMOS_AUTH_CONFIG = {
  supabaseUrl: "https://TU-PROYECTO.supabase.co",
  supabaseAnonKey: "TU_ANON_PUBLIC_KEY"
};
```

No uses nunca `service_role`.

## 3. Crear las tablas y políticas

Abre SQL Editor en Supabase y ejecuta todo el contenido de:

`supabase-schema.sql`

Después puedes ejecutar `RLS-ISOLATION-TEST.sql` para revisar el aislamiento.

## 4. Configurar autenticación

En Authentication → Providers:

- deja Email activado;
- decide si quieres exigir confirmación por correo;
- configura Site URL con la dirección exacta de GitHub Pages;
- añade la misma dirección en Redirect URLs.

## 5. Publicar

Sube todo el contenido de esta carpeta al repositorio, incluyendo:

- `auth-config.js`
- `supabase-schema.sql`
- `app.js`
- `index.html`
- `service-worker.js`

## Comportamiento

- Nadie puede entrar en GymOS sin iniciar sesión.
- Cada cuenta tiene una bóveda local separada en el navegador.
- Al cerrar sesión, los datos activos se retiran de la vista.
- Al cambiar de cuenta, GymOS guarda y recupera la bóveda de la cuenta correcta.
- La nube usa `user_id` y Row Level Security.
