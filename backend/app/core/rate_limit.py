from collections import defaultdict, deque
import os
from threading import Lock
import time

import httpx
from fastapi import HTTPException, status


class SlidingWindowRateLimiter:
    def __init__(
        self,
        requests: int = 20,
        window_seconds: int = 60,
    ):
        self.requests = requests
        self.window_seconds = window_seconds
        self.events = defaultdict(deque)
        self.lock = Lock()

    def check(
        self,
        key: str,
    ) -> None:
        now = time.monotonic()
        cutoff = now - self.window_seconds

        with self.lock:
            events = self.events[
                str(key)
            ]

            while (
                events
                and events[0] <= cutoff
            ):
                events.popleft()

            if (
                len(events)
                >= self.requests
            ):
                raise HTTPException(
                    status_code=(
                        status.HTTP_429_TOO_MANY_REQUESTS
                    ),
                    detail=(
                        "Rate limit exceeded"
                    ),
                )

            events.append(now)


class PersistentDailyUserRateLimiter:
    def __init__(
        self,
        requests: int = 10,
    ):
        self.requests = requests

    def check(
        self,
        access_token: str | None,
    ) -> None:
        supabase_url = os.getenv(
            "SUPABASE_URL",
            "",
        ).rstrip("/")

        publishable_key = os.getenv(
            "SUPABASE_PUBLISHABLE_KEY",
            "",
        )

        if (
            not supabase_url
            or not publishable_key
        ):
            raise HTTPException(
                status_code=(
                    status.HTTP_503_SERVICE_UNAVAILABLE
                ),
                detail=(
                    "AI quota service "
                    "is not configured"
                ),
            )

        if not access_token:
            raise HTTPException(
                status_code=(
                    status.HTTP_401_UNAUTHORIZED
                ),
                detail="Missing access token",
            )

        try:
            with httpx.Client(
                timeout=5.0
            ) as client:
                response = client.post(
                    (
                        f"{supabase_url}"
                        "/rest/v1/rpc/"
                        "consume_ai_daily_quota"
                    ),
                    headers={
                        "Authorization":
                            f"Bearer {access_token}",
                        "apikey":
                            publishable_key,
                        "Content-Type":
                            "application/json",
                    },
                    json={
                        "p_limit":
                            self.requests,
                    },
                )

        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=(
                    status.HTTP_503_SERVICE_UNAVAILABLE
                ),
                detail=(
                    "AI quota service "
                    "is unavailable"
                ),
            ) from exc

        if response.status_code != 200:
            raise HTTPException(
                status_code=(
                    status.HTTP_503_SERVICE_UNAVAILABLE
                ),
                detail=(
                    "AI quota service "
                    "is unavailable"
                ),
            )

        try:
            payload = response.json()
        except ValueError as exc:
            raise HTTPException(
                status_code=(
                    status.HTTP_502_BAD_GATEWAY
                ),
                detail=(
                    "Invalid AI quota response"
                ),
            ) from exc

        if (
            not isinstance(
                payload,
                list,
            )
            or not payload
            or not isinstance(
                payload[0],
                dict,
            )
        ):
            raise HTTPException(
                status_code=(
                    status.HTTP_502_BAD_GATEWAY
                ),
                detail=(
                    "Invalid AI quota response"
                ),
            )

        if not payload[0].get(
            "allowed",
            False,
        ):
            raise HTTPException(
                status_code=(
                    status.HTTP_429_TOO_MANY_REQUESTS
                ),
                detail=(
                    "Daily AI limit exceeded"
                ),
            )


coach_rate_limiter = SlidingWindowRateLimiter(
    requests=max(
        1,
        int(
            os.getenv(
                "AI_RATE_LIMIT_PER_MINUTE",
                "20",
            )
        ),
    ),
    window_seconds=60,
)


ai_daily_rate_limiter = (
    PersistentDailyUserRateLimiter(
        requests=max(
            1,
            int(
                os.getenv(
                    "AI_DAILY_LIMIT_PER_USER",
                    "10",
                )
            ),
        )
    )
)
