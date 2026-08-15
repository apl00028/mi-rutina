from fastapi import APIRouter

from .exercises import router as exercises_router
from .health import router as health_router

router = APIRouter(prefix="/api/v1")
router.include_router(health_router)
router.include_router(exercises_router)
