from app.models.custom_exercise import CustomExerciseCreate
from app.models.exercise import Exercise
from app.repositories.custom_exercises import create_custom_exercise
from auth import AuthenticatedUser


async def register_custom_exercise(
    user: AuthenticatedUser,
    payload: CustomExerciseCreate,
) -> Exercise:
    row = await create_custom_exercise(user, payload)

    return Exercise(
        id=f"custom-{row['id']}",
        name=row["name"],
        muscle=row["muscle"],
        equipment=row["equipment"],
        type=row["type"],
        favorite=False,
        custom=True,
        notes=row.get("notes", ""),
        category=row["category"],
        recordTypes=row.get("record_types") or None,
    )
