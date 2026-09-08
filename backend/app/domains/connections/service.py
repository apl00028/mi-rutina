from .models import Connection, ConnectionPermissionsUpdate, ConnectionUpdated
from uuid import UUID

from pydantic import TypeAdapter

from app.core.auth import AuthenticatedUser
from . import repository
from .codes import generate_contact_code, generate_invitation_token, normalize_contact_code, sha256_secret
from .models import ContactCodeResponse, Invitation, InvitationBox, InvitationCreated

TARGET_UNAVAILABLE = "El código de contacto no es válido o no está disponible."


class ConnectionError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


# Match complete SQL messages, never forward PostgREST details or constraint names.
SQL_ERRORS = {
    "connection_not_available": (404, "Conexión no disponible."),
    "connection_changed": (409, "La conexión ha cambiado. Actualiza antes de guardar."),
    "connection_permissions_invalid": (400, "Los permisos no son válidos."),
    "invitation_target_unavailable": (400, TARGET_UNAVAILABLE),
    "invitation_conflict": (409, "Ya existe una invitación o relación para este contacto."),
    "relationship_already_active": (409, "La relación ya está activa."),
    "invitation_not_pending": (409, "La invitación ya no está pendiente."),
    "invitation_expired": (409, "La invitación ha caducado."),
    "connection_actor_not_authorized": (403, "Operación no autorizada."),
    "invitation_accounts_not_eligible": (403, "Operación no autorizada."),
    "invitation_not_available": (404, "Invitación no disponible."),
    "contact_code_conflict": (409, "No se pudo renovar el código de contacto. Inténtalo de nuevo."),
}


async def renew_contact_code(user: AuthenticatedUser) -> ContactCodeResponse:
    code = generate_contact_code()
    await repository.set_contact_code(user, sha256_secret(normalize_contact_code(code)))
    return ContactCodeResponse(code=code)


async def create_invitation(user: AuthenticatedUser, code: str, *, trainer: bool) -> InvitationCreated:
    try:
        canonical = normalize_contact_code(code)
    except ValueError:
        raise ConnectionError(400, TARGET_UNAVAILABLE) from None
    invitation_id = await repository.create_invitation(
        user, sha256_secret(canonical), sha256_secret(generate_invitation_token()), trainer=trainer,
    )
    return InvitationCreated(id=UUID(invitation_id))


async def list_invitations(user: AuthenticatedUser, box: InvitationBox) -> list[Invitation]:
    return TypeAdapter(list[Invitation]).validate_python(await repository.list_invitations(user, box))


async def list_connections(user: AuthenticatedUser) -> list[Connection]:
    return TypeAdapter(list[Connection]).validate_python(await repository.list_connections(user))


async def set_permissions(user: AuthenticatedUser, trainer_id: UUID, request: ConnectionPermissionsUpdate) -> ConnectionUpdated:
    if len(request.domains) != len(set(request.domains)):
        raise ConnectionError(400, "Los permisos no son válidos.")
    stamp = await repository.set_permissions(user, trainer_id, request.domains, request.expected_updated_at.isoformat())
    return ConnectionUpdated(updated_at=stamp)
