import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.domains.coach.router import (
    router as coach_router,
)
from app.domains.coach.service import (
    configuration_status,
)
from app.api.v1.router import router as api_v1_router
from app.core.security_headers import apply_security_headers
from app.core.observability import observe_request
from app.core.http_client import (
    close_supabase_http_client,
)

load_dotenv()

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:8000").split(",")
    if origin.strip()
]

@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        yield
    finally:
        await close_supabase_http_client()


app = FastAPI(
    title="Aptus API",
    version="4.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_v1_router)
app.include_router(coach_router)


@app.middleware("http")
async def observability_middleware(request, call_next):
    return await observe_request(
        request,
        call_next,
    )



@app.middleware("http")
async def security_headers_middleware(request, call_next):
    response = await call_next(request)
    apply_security_headers(request, response)
    return response


@app.get(
    "/health",
    include_in_schema=False,
)
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "version": "4.0.0",
    }
