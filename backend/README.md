# Aptus API

Backend FastAPI de Aptus.

Gestiona autenticación, lógica de dominio, acceso a datos y servicios utilizados por el frontend Angular y la aplicación Android.

## Stack

- Python 3.12
- FastAPI
- Pydantic
- Supabase
- pytest

## Ejecución local

    cp .env.example .env
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8080

Configura en .env las variables necesarias de Supabase y, cuando corresponda, del proveedor de IA.

## Estructura

- main.py: arranque de FastAPI, CORS y montaje de routers
- app/api/v1/: API versionada principal
- app/core/: autenticación, seguridad y utilidades compartidas
- app/domains/: lógica organizada por dominio
- app/data/: datos utilizados por servicios del backend
- tests/: tests del backend

## API

La funcionalidad principal de Aptus se publica bajo:

    /api/v1

Incluye recursos relacionados con:

- cuenta
- ejercicios
- rutinas
- entrenamientos
- analítica
- salud
- nutrición
- onboarding
- administración

Health checks:

    GET /health
    GET /api/v1/health

## Coach e IA

Actualmente siguen disponibles endpoints específicos fuera de /api/v1:

    POST /coach/chat
    POST /coach/review
    GET  /ai/status
    POST /workout-analysis

Su permanencia se evaluará independientemente de la retirada del antiguo frontend estático.

## Autenticación

El frontend utiliza sesiones de Supabase y envía el token correspondiente al backend.

Las credenciales privadas y las claves de servicios externos deben permanecer únicamente en el servidor.

## Supabase

Los esquemas y políticas SQL se encuentran en:

    database/supabase/

Algunos tests verifican estos archivos, por lo que al ejecutar pytest mediante Docker conviene montar el repositorio completo.

## Catálogo de ejercicios

El backend carga actualmente el catálogo desde:

    app/data/exercise_domain.json

La generación y mantenimiento de este catálogo se consolidará para retirar las últimas dependencias heredadas del sistema anterior.

## Tests

Desde la raíz del repositorio:

    docker run --rm -v "$PWD:/repo" -w /repo/backend aptus-backend-test pytest -q

## Seguridad

- Variables sensibles mediante entorno
- Autenticación en recursos privados
- Políticas RLS en Supabase
- CORS limitado a orígenes autorizados en producción
- Ninguna clave privada debe incluirse en el frontend
