from typing import Any
from uuid import UUID

from app.core.auth import AuthenticatedUser
from app.core.http_client import get_supabase_http_client
from app.domains.exercises.custom_repository import _supabase_config
from .models import InvitationAction, InvitationBox


async def _rpc(user: AuthenticatedUser, name: str, params: dict) -> Any:
    url, key = _supabase_config()
    response = await get_supabase_http_client().post(
        f"{url}/rest/v1/rpc/{name}",
        headers={"Authorization": f"Bearer {user.access_token}", "apikey": key},
        json=params,
    )
    response.raise_for_status()
    return response.json() if response.content else None


async def set_contact_code(user: AuthenticatedUser, code_hash: str) -> None:
    await _rpc(user, "set_my_connection_contact_code", {"p_code_hash": code_hash})


async def create_invitation(
    user: AuthenticatedUser, code_hash: str, token_hash: str, *, trainer: bool,
) -> Any:
    name = "trainer_create_athlete_invitation" if trainer else "athlete_create_trainer_invitation"
    return await _rpc(user, name, {"p_contact_code_hash": code_hash, "p_token_hash": token_hash})


async def list_invitations(user: AuthenticatedUser, box: InvitationBox) -> Any:
    name = {
        "received": "list_my_received_trainer_athlete_invitations",
        "sent": "list_my_sent_trainer_athlete_invitations",
    }[box]
    return await _rpc(user, name, {})


async def transition(user: AuthenticatedUser, invitation_id: UUID, action: InvitationAction) -> None:
    name = {
        "accept": "accept_trainer_athlete_invitation",
        "reject": "reject_trainer_athlete_invitation",
        "revoke": "revoke_trainer_athlete_invitation",
    }[action]
    await _rpc(user, name, {"p_invitation_id": str(invitation_id)})
