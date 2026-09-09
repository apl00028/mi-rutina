import json
import logging
import time
import traceback
from collections.abc import Awaitable, Callable
from uuid import uuid4
from pathlib import Path

from starlette.requests import Request
from starlette.responses import JSONResponse, Response


logger = logging.getLogger(
    "uvicorn.error.aptus.requests"
)


def _safe_route_path(
    request: Request,
) -> str:
    route = request.scope.get(
        "route"
    )

    route_path = getattr(
        route,
        "path",
        None,
    )

    if isinstance(
        route_path,
        str,
    ) and route_path:
        return route_path

    return "<unmatched>"


async def observe_request(
    request: Request,
    call_next: Callable[
        [Request],
        Awaitable[Response],
    ],
) -> Response:
    request_id = str(uuid4())
    request.state.request_id = request_id

    started_at = time.perf_counter()

    try:
        response = await call_next(request)
    except Exception as exc:
        duration_ms = round(
            (
                time.perf_counter()
                - started_at
            )
            * 1000,
            2,
        )

        logger.error(
            json.dumps(
                {
                    "event":
                        "request_failed",
                    "request_id":
                        request_id,
                    "method":
                        request.method,
                    "path":
                        _safe_route_path(
                            request
                        ),
                    "duration_ms":
                        duration_ms,
                    "exception_type":
                        type(exc).__name__,
                    "exception_frames": [
                        {
                            "file":
                                Path(frame.filename).name,
                            "function":
                                frame.name,
                            "line":
                                frame.lineno,
                        }
                        for frame in traceback.extract_tb(
                            exc.__traceback__
                        )[-8:]
                    ],
                },
                separators=(",", ":"),
            )
        )

        response = JSONResponse(
            status_code=500,
            content={
                "detail":
                    "Internal server error"
            },
        )
        response.headers[
            "X-Request-ID"
        ] = request_id

        return response

    duration_ms = round(
        (
            time.perf_counter()
            - started_at
        )
        * 1000,
        2,
    )

    response.headers[
        "X-Request-ID"
    ] = request_id

    logger.info(
        json.dumps(
            {
                "event":
                    "request_completed",
                "request_id":
                    request_id,
                "method":
                    request.method,
                "path":
                    _safe_route_path(
                        request
                    ),
                "status":
                    response.status_code,
                "duration_ms":
                    duration_ms,
            },
            separators=(",", ":"),
        )
    )

    return response
