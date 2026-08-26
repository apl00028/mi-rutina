from __future__ import annotations

import httpx


_supabase_http_client: (
    httpx.AsyncClient | None
) = None


def get_supabase_http_client(
) -> httpx.AsyncClient:
    global _supabase_http_client

    if (
        _supabase_http_client is None
        or _supabase_http_client.is_closed
    ):
        _supabase_http_client = (
            httpx.AsyncClient(
                timeout=10.0
            )
        )

    return _supabase_http_client


async def close_supabase_http_client(
) -> None:
    global _supabase_http_client

    if _supabase_http_client is None:
        return

    if not _supabase_http_client.is_closed:
        await _supabase_http_client.aclose()

    _supabase_http_client = None
