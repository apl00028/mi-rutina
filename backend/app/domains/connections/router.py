import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute
from uuid import UUID

from app.core.auth import AuthenticatedUser, require_user
from app.domains.exercises.custom_repository import SupabaseConfigError
from . import repository, service
from .models import ContactCodeResponse, Invitation, InvitationBox, InvitationCreate, InvitationCreated


class ConnectionRoute(APIRoute):
    """Keep upstream errors and validation inputs containing secrets private."""
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def safe_handler(request):
            try:
                return await handler(request)
            except RequestValidationError:
                raise HTTPException(422, "Solicitud no válida.") from None
            except service.ConnectionError as exc:
                raise HTTPException(exc.status, exc.detail) from None
            except (SupabaseConfigError, httpx.TimeoutException):
                raise HTTPException(503, "Servicio de conexiones no disponible.") from None
            except httpx.HTTPStatusError as exc:
                try:
                    error = exc.response.json()
                    message = error.get("message") if isinstance(error, dict) else None
                    mapped = service.SQL_ERRORS.get(message) if isinstance(message, str) else None
                except ValueError:
                    mapped = None
                status, detail = mapped or (502, "No se pudo completar la operación de conexiones.")
                raise HTTPException(status, detail) from None
            except (httpx.HTTPError, ValueError, TypeError, AttributeError):
                raise HTTPException(502, "No se pudo completar la operación de conexiones.") from None

        return safe_handler


router = APIRouter(tags=["Connections"], route_class=ConnectionRoute)


async def require_participant(user: AuthenticatedUser = Depends(require_user)) -> AuthenticatedUser:
    if user.role not in {"user", "trainer"}:
        raise HTTPException(403, "Operación no autorizada.")
    return user


async def require_inviting_trainer(user: AuthenticatedUser = Depends(require_participant)) -> AuthenticatedUser:
    if user.role != "trainer":
        raise HTTPException(403, "Operación no autorizada.")
    return user


async def require_inviting_athlete(user: AuthenticatedUser = Depends(require_participant)) -> AuthenticatedUser:
    if user.role != "user":
        raise HTTPException(403, "Operación no autorizada.")
    return user


@router.post("/connections/contact-code", response_model=ContactCodeResponse)
async def renew_contact_code(response: Response, user: AuthenticatedUser = Depends(require_participant)):
    response.headers["Cache-Control"] = "no-store"
    return await service.renew_contact_code(user)


@router.post("/trainer/invitations", response_model=InvitationCreated, status_code=201)
async def trainer_invite(body: InvitationCreate, user: AuthenticatedUser = Depends(require_inviting_trainer)):
    return await service.create_invitation(user, body.contact_code.get_secret_value(), trainer=True)


@router.post("/athlete/invitations", response_model=InvitationCreated, status_code=201)
async def athlete_invite(body: InvitationCreate, user: AuthenticatedUser = Depends(require_inviting_athlete)):
    return await service.create_invitation(user, body.contact_code.get_secret_value(), trainer=False)


@router.get("/connections/invitations", response_model=list[Invitation])
async def list_invitations(box: InvitationBox, user: AuthenticatedUser = Depends(require_participant)):
    return await service.list_invitations(user, box)


@router.post("/connections/invitations/{id}/accept", status_code=204)
async def accept_invitation(id: UUID, user: AuthenticatedUser = Depends(require_participant)):
    await repository.transition(user, id, "accept")


@router.post("/connections/invitations/{id}/reject", status_code=204)
async def reject_invitation(id: UUID, user: AuthenticatedUser = Depends(require_participant)):
    await repository.transition(user, id, "reject")


@router.post("/connections/invitations/{id}/revoke", status_code=204)
async def revoke_invitation(id: UUID, user: AuthenticatedUser = Depends(require_participant)):
    await repository.transition(user, id, "revoke")
