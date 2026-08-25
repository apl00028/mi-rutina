# Aptus

Aptus es una aplicación personal de entrenamiento, salud y rendimiento.

## Arquitectura

- Frontend: Angular + TypeScript + Capacitor
- Android: Capacitor + Health Connect
- Backend: FastAPI + Pydantic
- Autenticación y persistencia: Supabase
- API principal: /api/v1

## Funcionalidades

- Rutinas y entrenamiento de fuerza
- Registro de peso, repeticiones, RIR y duración
- Series de calentamiento y molestias
- Descansos configurables
- Historial, e1RM y análisis de progreso
- Seguimiento de salud y composición corporal
- Nutrición
- Integración con Health Connect
- Preparación de fuerza, natación, ciclismo y carrera

## Estructura

- frontend/: aplicación Angular y Android
- backend/: API FastAPI
- database/supabase/: esquema y políticas RLS
- docs/: documentación técnica
- assets/: recursos
- scripts/: utilidades de mantenimiento

## Desarrollo

Frontend:

    cd frontend
    npm install
    npm start

Tests frontend:

    cd frontend
    npm test -- --watch=false

Backend:

    cd backend
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8080

Tests backend con Docker:

    docker run --rm -v "$PWD:/repo" -w /repo/backend aptus-backend-test pytest -q

## Compatibilidad

Algunos formatos conservan identificadores históricos como _GymOS únicamente para mantener compatibilidad con datos existentes.

## Seguridad

Las credenciales privadas permanecen en el backend. Supabase autentica a los usuarios y las tablas privadas utilizan políticas RLS.

Consulta SECURITY.md para más información.

## Estado

Proyecto personal en desarrollo activo.
