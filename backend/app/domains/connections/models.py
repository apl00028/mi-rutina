from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, SecretStr

InvitationBox = Literal["received", "sent"]
InvitationAction = Literal["accept", "reject", "revoke"]


class InvitationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    contact_code: SecretStr


class ContactCodeResponse(BaseModel):
    code: str


class InvitationCreated(BaseModel):
    id: UUID


class Invitation(BaseModel):
    # Unexpected upstream fields (including hashes) never enter a response.
    model_config = ConfigDict(extra="ignore")
    id: UUID
    trainer_id: UUID
    athlete_id: UUID
    inviter_id: UUID
    recipient_id: UUID
    direction: Literal["trainer_to_athlete", "athlete_to_trainer"]
    status: Literal["pending", "accepted", "expired", "revoked"]
    created_at: AwareDatetime
    expires_at: AwareDatetime
    accepted_at: AwareDatetime | None
    revoked_at: AwareDatetime | None
    revoked_by: UUID | None
    other_display_name: str | None
    other_alias: str | None


ConnectionDomain = Literal["swimming", "running", "cycling", "strength", "health"]


class Connection(BaseModel):
    trainer_id: UUID
    athlete_id: UUID
    status: Literal["active", "inactive"]
    created_at: AwareDatetime
    updated_at: AwareDatetime
    other_display_name: str | None
    other_alias: str | None
    domains: list[ConnectionDomain]


class ConnectionVersion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_updated_at: AwareDatetime


class ConnectionPermissionsUpdate(ConnectionVersion):
    domains: list[ConnectionDomain]


class ConnectionUpdated(BaseModel):
    updated_at: AwareDatetime
