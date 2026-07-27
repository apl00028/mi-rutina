# GymOS Coach API — v4.0.0

Este backend mantiene las credenciales de IA fuera de GitHub Pages y ofrece
un contrato común para redactar mensajes del Coach con las reglas de GymOS
como fuente de verdad.

## Ejecución local

1. Copia `.env.example` como `.env`.
2. Configura `AI_PROVIDER` como `rules`, `gemini`, `openai` u `ollama`.
3. Añade en el servidor la clave y el modelo del proveedor elegido. No copies
   claves en el frontend.
4. Configura `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` para validar las
   sesiones recibidas.
5. Instala dependencias:

```bash
pip install -r requirements.txt
```

6. Ejecuta:

```bash
uvicorn main:app --reload --port 8080
```

7. En el modo desarrollador de GymOS configura la URL pública del backend.

## Endpoints

- `GET /health`: estado público, sin secretos.
- `GET /ai/status`: proveedor, modelo y comprobación de conexión; requiere sesión.
- `POST /workout-analysis`: redacción opcional sobre el análisis estructurado;
  requiere sesión y aplica límites por usuario.
- `POST /coach/chat`
- `POST /coach/review`

Si el proveedor no está disponible, `/workout-analysis` conserva el resultado
de las reglas y devuelve `analysis_source: "local_fallback"`.

## Seguridad

Las claves solo deben existir como variables de entorno del servidor. El
frontend envía un token de sesión de Supabase y únicamente los datos mínimos
del análisis: ejercicio, carga, repeticiones, RIR, estado y recomendación.

Para producción con varias réplicas, sustituye el limitador diario en memoria
por un almacén compartido.
