from app.services.exercises import DATA_FILE, get_exercise_by_id, load_exercises


def test_exercise_catalog_has_100_unique_ids():
    data = load_exercises()

    assert DATA_FILE.exists()
    assert len(data) == 100

    ids = [exercise.id for exercise in data]

    assert len(set(ids)) == 100
    assert all(exercise.name for exercise in data)


def test_get_exercise_by_id():
    exercise = get_exercise_by_id("bench-press")

    assert exercise is not None
    assert exercise.id == "bench-press"
    assert exercise.name == "Press de banca"


def test_unknown_exercise_id_returns_none():
    assert get_exercise_by_id("does-not-exist") is None
