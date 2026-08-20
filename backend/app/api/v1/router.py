from fastapi import APIRouter

from .admin import router as admin_router
from .analytics import (
    router as analytics_router,
)
from .exercises import router as exercises_router
from .health import router as health_router
from .me import router as me_router
from .routines import router as routines_router
from app.api.v1.workouts import (
    router as workouts_router,
)
from .onboarding import (
    router as onboarding_router,
)


router = APIRouter(
    prefix="/api/v1"
)

router.include_router(
    health_router
)

router.include_router(
    me_router
)

router.include_router(
    admin_router
)

router.include_router(
    analytics_router
)

router.include_router(
    exercises_router
)

router.include_router(
    routines_router
)

router.include_router(
    workouts_router
)
router.include_router(
    onboarding_router
)
