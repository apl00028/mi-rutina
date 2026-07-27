from __future__ import annotations
import os
import httpx
from dataclasses import dataclass
from fastapi import Header, HTTPException, status

@dataclass(frozen=True)
class AuthenticatedUser:
    id: str
    email: str | None = None

async def require_user(authorization: str | None = Header(default=None)) -> AuthenticatedUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    url=os.getenv("SUPABASE_URL","").rstrip("/")
    key=os.getenv("SUPABASE_PUBLISHABLE_KEY","")
    if not url or not key:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Authentication service is not configured")
    token=authorization.split(" ",1)[1].strip()
    async with httpx.AsyncClient(timeout=10.0) as client:
        response=await client.get(f"{url}/auth/v1/user",headers={"Authorization":f"Bearer {token}","apikey":key})
    if response.status_code!=200:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired access token")
    payload=response.json()
    if not payload.get("id"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user payload")
    return AuthenticatedUser(id=payload["id"],email=payload.get("email"))
