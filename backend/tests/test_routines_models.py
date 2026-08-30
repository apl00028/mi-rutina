import copy

import pytest
from pydantic import ValidationError

from app.domains.routines.models import Routine


def swimming_routine_payload():
    return {
        "schemaVersion": "4.2",
        "routineId": "swim-1",
        "revision": 1,
        "discipline": "swimming",
        "sessions": [
            {
                "sessionId": "swim-session-1",
                "poolLengthMeters": 25,
                "blocks": [
                    {
                        "id": "main",
                        "sets": [
                            {
                                "repetitions": 4,
                                "distanceMeters": 100,
                                "restSeconds": 30,
                                "stroke": "freestyle",
                                "workType": "swim",
                                "intensity": "controlled",
                            }
                        ],
                    }
                ],
            }
        ],
    }


def test_valid_swimming_routine_is_accepted():
    routine = Routine.model_validate(swimming_routine_payload())

    assert routine.discipline == "swimming"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("repetitions", 0),
        ("distanceMeters", -1),
        ("restSeconds", -1),
        ("stroke", "butterfly"),
        ("workType", "race"),
        ("intensity", "maximum"),
    ],
)
def test_invalid_swimming_set_is_rejected(field, value):
    payload = copy.deepcopy(swimming_routine_payload())
    payload["sessions"][0]["blocks"][0]["sets"][0][field] = value

    with pytest.raises(ValidationError, match=field):
        Routine.model_validate(payload)


@pytest.mark.parametrize(
    "mutation",
    [
        lambda payload: payload.update(sessions=[]),
        lambda payload: payload["sessions"][0].update(blocks="invalid"),
        lambda payload: payload["sessions"][0].update(poolLengthMeters=0),
        lambda payload: payload["sessions"][0]["blocks"][0].update(sets=[]),
    ],
)
def test_invalid_swimming_structure_is_rejected(mutation):
    payload = copy.deepcopy(swimming_routine_payload())
    mutation(payload)

    with pytest.raises(ValidationError):
        Routine.model_validate(payload)


def test_legacy_strength_routine_keeps_existing_shape():
    routine = Routine.model_validate(
        {
            "schemaVersion": "4.2",
            "routineId": "legacy-strength",
            "revision": 1,
            "sessions": [
                {
                    "sessionId": "strength-a",
                    "exercises": [],
                }
            ],
        }
    )

    assert routine.discipline is None
