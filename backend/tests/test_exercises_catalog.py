from app.api.v1.exercises import DATA_FILE, load_exercises


def test_exercise_catalog_has_100_unique_ids():
    data = load_exercises()

    assert DATA_FILE.exists()
    assert len(data) == 100

    ids = [exercise.id for exercise in data]

    assert len(set(ids)) == 100
    assert all(exercise.name for exercise in data)
