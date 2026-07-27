# GymOS Coach API — v3.2.0

Este backend evita exponer la clave de OpenAI en GitHub Pages.

## Ejecución local

1. Copia `.env.example` como `.env`.
2. Añade `OPENAI_API_KEY`.
3. Instala dependencias:

```bash
pip install -r requirements.txt
```

4. Ejecuta:

```bash
uvicorn main:app --reload --port 8080
```

5. En GymOS configura:

```text
http://localhost:8080
```

## Endpoints

- `GET /health`
- `POST /coach/chat`
- `POST /coach/review`

## Despliegue

Puede desplegarse en Render, Railway, Fly.io, Google Cloud Run o un servidor
propio. Configura `ALLOWED_ORIGINS` con la URL real de GitHub Pages.

La clave de OpenAI solo debe existir como variable de entorno del servidor.
