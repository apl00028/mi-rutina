import json
import os
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from openai import OpenAI
from pydantic import BaseModel, Field

from app.core.auth import AuthenticatedUser, require_user
from app.core.rate_limit import ai_daily_rate_limiter, coach_rate_limiter
from app.domains.coach.service import (
    check_connection,
    configuration_status,
    generate_coach_message,
)


router = APIRouter(
    tags=["Coach"]
)

MODEL = os.getenv("OPENAI_MODEL", "")
API_KEY = os.getenv("OPENAI_API_KEY", "")


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class CoachChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: list[dict[str, Any]] = Field(default_factory=list)
    context: dict[str, Any] = Field(default_factory=dict)


class CoachReviewRequest(BaseModel):
    version: str
    generatedAt: str
    settings: dict[str, Any]
    routine: dict[str, Any]
    recentWorkouts: list[dict[str, Any]]
    exerciseSummary: list[dict[str, Any]]
    bodyWeight: list[dict[str, Any]] = Field(default_factory=list)
    activeBlock: dict[str, Any] | None = None


class WorkoutAnalysisRequest(BaseModel):
    workout_analysis: dict[str, Any]


SYSTEM_PROMPT = """
You are Aptus Coach, a conservative strength-training assistant.

Use only the supplied Aptus data. Never invent completed workouts, pain,
weights, repetitions, RIR, RPE, injuries, or goals.

Training changes must be returned as structured proposals and must never be
described as already applied. The user must approve every change.

Priorities:
1. Safety and pain awareness.
2. Sustainable adherence.
3. Maintain or improve performance.
4. Match the user's stated goal.
5. Prefer small changes over complete routine redesigns.\n6. Nutrition advice must be conservative, based only on supplied logs, and avoid medical claims.\n7. Health and wearable data are recovery signals only. Never diagnose, and recommend medical evaluation when symptoms or abnormal values are concerning.

For exercise changes, use exact session names A, B, or C and exact zero-based
exercise indexes from the supplied routine.

Allowed proposal fields:
- sets
- increment
- target
- name

Allowed change types:
- progression
- fatigue
- stagnation
- substitution
- deload

Respond only as JSON matching the requested schema.
""".strip()


def client() -> OpenAI:
    if not API_KEY or not MODEL:
        raise HTTPException(
            status_code=503,
            detail="OpenAI chat/review is not configured on the backend.",
        )
    return OpenAI(api_key=API_KEY)


def parse_json_response(raw: str) -> dict[str, Any]:
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail="The model returned an invalid structured response.",
        ) from exc


@router.post("/coach/chat")
def coach_chat(
    request: CoachChatRequest,
    user: AuthenticatedUser = Depends(require_user),
) -> dict[str, Any]:
    coach_rate_limiter.check(user.id)
    ai_daily_rate_limiter.check(user.access_token)

    schema = {
        "message": "A concise Spanish answer grounded in the supplied data.",
        "actions": ["Optional short suggested next actions."],
        "proposal": {
            "summary": "Optional summary.",
            "notes": ["Optional notes."],
            "changes": [
                {
                    "type": "progression|fatigue|stagnation|substitution|deload",
                    "session": "A|B|C",
                    "index": 0,
                    "exercise": "Exact current exercise name",
                    "field": "sets|increment|target|name",
                    "from": "Current value",
                    "to": "Proposed value",
                    "reason": "Grounded reason",
                }
            ],
        },
    }

    response = client().responses.create(
        model=MODEL,
        instructions=SYSTEM_PROMPT,
        input=json.dumps(
            {
                "task": "Answer the user's message and optionally create a proposal.",
                "required_response_schema": schema,
                "message": request.message,
                "history": request.history[-12:],
                "gymos_context": request.context,
            },
            ensure_ascii=False,
        ),
    )
    data = parse_json_response(response.output_text)
    data.setdefault("message", "No se ha generado una respuesta.")
    data.setdefault("actions", [])
    return data


@router.post("/coach/review")
def coach_review(
    request: CoachReviewRequest,
    user: AuthenticatedUser = Depends(require_user),
) -> dict[str, Any]:
    coach_rate_limiter.check(user.id)
    ai_daily_rate_limiter.check(user.access_token)

    schema = {
        "summary": "Review summary in Spanish.",
        "notes": ["Grounded observations."],
        "changes": [
            {
                "type": "progression|fatigue|stagnation|substitution|deload",
                "session": "A|B|C",
                "index": 0,
                "exercise": "Exact current exercise name",
                "field": "sets|increment|target|name",
                "from": "Current value",
                "to": "Proposed value",
                "reason": "Grounded reason",
            }
        ],
    }

    response = client().responses.create(
        model=MODEL,
        instructions=SYSTEM_PROMPT,
        input=json.dumps(
            {
                "task": "Perform a conservative weekly training review.",
                "required_response_schema": schema,
                "gymos_context": request.model_dump(),
            },
            ensure_ascii=False,
        ),
    )
    data = parse_json_response(response.output_text)
    data.setdefault("summary", "Revisión completada.")
    data.setdefault("notes", [])
    data.setdefault("changes", [])
    return data


@router.get("/ai/status")
def ai_status(
    check: bool = False,
    user: AuthenticatedUser = Depends(require_user),
) -> dict[str, Any]:
    del user
    return check_connection() if check else configuration_status()


@router.post("/workout-analysis")
def workout_analysis_message(
    request: WorkoutAnalysisRequest,
    user: AuthenticatedUser = Depends(require_user),
) -> dict[str, Any]:
    coach_rate_limiter.check(user.id)
    ai_daily_rate_limiter.check(user.access_token)
    result = generate_coach_message(request.workout_analysis)
    return {
        "message": result.message,
        "provider": result.provider,
        "model": result.model,
        "analysis_source": result.analysis_source,
        "fallback": result.analysis_source == "local_fallback",
    }
