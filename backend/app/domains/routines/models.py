from math import isfinite
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Routine(BaseModel):
    model_config = ConfigDict(extra="allow")

    routineId: str = Field(min_length=1)
    schemaVersion: str = Field(min_length=1)
    revision: int = Field(ge=0)
    discipline: Literal[
        "strength",
        "swimming",
        "cycling",
        "running",
    ] | None = None
    sessions: list[dict[str, Any]] = Field(default_factory=list)
    createdAt: str | None = None
    updatedAt: str | None = None

    @model_validator(mode="after")
    def validate_canonical_shape(self) -> "Routine":
        for index, session in enumerate(self.sessions):
            session_id = session.get("sessionId")
            if not isinstance(session_id, str) or not session_id.strip():
                raise ValueError(f"sessions[{index}].sessionId is required")

            exercises = session.get("exercises")
            if exercises is not None and not isinstance(exercises, list):
                raise ValueError(f"sessions[{index}].exercises must be a list")

        if self.discipline == "swimming":
            self._validate_swimming_sessions()

        return self

    def _validate_swimming_sessions(self) -> None:
        if not self.sessions:
            raise ValueError("swimming routines require at least one session")

        allowed_values = {
            "stroke": {"freestyle", "backstroke", "breaststroke", "mixed"},
            "workType": {"swim", "technique", "kick", "pull"},
            "intensity": {"easy", "controlled", "strong"},
        }

        for session_index, session in enumerate(self.sessions):
            session_path = f"sessions[{session_index}]"
            pool_length = session.get("poolLengthMeters")

            if pool_length is not None:
                self._require_number(pool_length, f"{session_path}.poolLengthMeters", gt=0)

            blocks = session.get("blocks")
            if not isinstance(blocks, list):
                raise ValueError(f"{session_path}.blocks must be a list")

            for block_index, block in enumerate(blocks):
                block_path = f"{session_path}.blocks[{block_index}]"
                if not isinstance(block, dict):
                    raise ValueError(f"{block_path} must be an object")

                sets = block.get("sets")
                if not isinstance(sets, list) or not sets:
                    raise ValueError(f"{block_path}.sets must be a non-empty list")

                for set_index, swimming_set in enumerate(sets):
                    set_path = f"{block_path}.sets[{set_index}]"
                    if not isinstance(swimming_set, dict):
                        raise ValueError(f"{set_path} must be an object")

                    self._require_number(
                        swimming_set.get("repetitions"),
                        f"{set_path}.repetitions",
                        gt=0,
                    )
                    self._require_number(
                        swimming_set.get("distanceMeters"),
                        f"{set_path}.distanceMeters",
                        gt=0,
                    )
                    self._require_number(
                        swimming_set.get("restSeconds"),
                        f"{set_path}.restSeconds",
                        ge=0,
                    )

                    for field, allowed in allowed_values.items():
                        value = swimming_set.get(field)
                        if value is not None and value not in allowed:
                            raise ValueError(
                                f"{set_path}.{field} has an unsupported value"
                            )

    @staticmethod
    def _require_number(
        value: Any,
        path: str,
        *,
        gt: float | None = None,
        ge: float | None = None,
    ) -> None:
        if (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not isfinite(value)
            or (gt is not None and value <= gt)
            or (ge is not None and value < ge)
        ):
            comparator = f"> {gt}" if gt is not None else f">= {ge}"
            raise ValueError(f"{path} must be a finite number {comparator}")
