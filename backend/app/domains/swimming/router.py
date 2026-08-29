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
from app.domains.swimming.fit_parser import (
    parse_swimming_fit,
)
from app.domains.swimming.models import (
    SwimmingFitSession,
)


router = APIRouter(
    tags=["Swimming"]
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
    del user

    filename = file.filename or ""

    if not filename.lower().endswith(".fit"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only FIT files are supported",
        )

    contents = await file.read()

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

        return parse_swimming_fit(temp_path)

    except HTTPException:
        raise
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
