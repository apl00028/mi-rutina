from pathlib import Path
from tempfile import NamedTemporaryFile

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
)

from app.core.auth import (
    AuthenticatedUser,
    require_user,
)
from app.domains.swimming.models import (
    SwimmingFitSession,
)
from app.domains.swimming.fit_parser import NonSwimmingFitError
from app.domains.swimming.service import (
    import_user_swimming_fit,
    list_user_swimming_sessions,
)


router = APIRouter(
    tags=["Swimming"]
)

MAX_FIT_FILE_SIZE_BYTES = 10 * 1024 * 1024


@router.get(
    "/swimming/sessions",
    response_model=list[SwimmingFitSession],
    response_model_exclude_none=True,
)
async def list_swimming_sessions(
    user: AuthenticatedUser = Depends(require_user),
) -> list[SwimmingFitSession]:
    return await list_user_swimming_sessions(
        user
    )


@router.post(
    "/swimming/import-fit",
    response_model=SwimmingFitSession,
    response_model_exclude_none=True,
)
async def import_swimming_fit(
    file: UploadFile = File(...),
    user: AuthenticatedUser = Depends(require_user),
) -> SwimmingFitSession:
    filename = file.filename or ""

    if not filename.lower().endswith(".fit"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only FIT files are supported",
        )

    contents = await file.read(
        MAX_FIT_FILE_SIZE_BYTES + 1
    )

    if len(contents) > MAX_FIT_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=(
                status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
            ),
            detail="FIT file is too large",
        )

    if not contents:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="FIT file is empty",
        )

    temp_path: Path | None = None

    try:
        with NamedTemporaryFile(
            suffix=".fit",
            delete=False,
        ) as temp_file:
            temp_file.write(contents)
            temp_path = Path(temp_file.name)

        return await import_user_swimming_fit(
            user,
            temp_path,
            contents,
        )

    except HTTPException:
        raise
    except NonSwimmingFitError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid or unsupported FIT file",
        ) from exc

    finally:
        if temp_path is not None:
            temp_path.unlink(
                missing_ok=True
            )
