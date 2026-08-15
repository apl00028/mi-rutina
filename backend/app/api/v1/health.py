from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health_v1() -> dict[str, str]:
    return {
        "status": "ok",
        "api": "v1",
    }
