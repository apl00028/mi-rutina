from fastapi import APIRouter

router = APIRouter(
    tags=["Health"]
)


@router.get("/health")
def health_v1() -> dict[str, str]:
    return {
        "status": "ok",
        "api": "v1",
    }
