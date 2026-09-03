from pathlib import Path
import re


def _sql() -> str:
    return (
        Path(__file__).resolve().parents[2]
        / "database"
        / "supabase"
        / "trainer-athlete-strength-sessions.sql"
    ).read_text(encoding="utf-8").lower()


def test_strength_sessions_rpc_signature_and_contract():
    sql = _sql()

    assert (
        "create function public.trainer_list_athlete_strength_sessions(\n"
        "  p_athlete_id uuid\n"
        ")"
    ) in sql
    assert "p_trainer_id" not in sql
    assert (
        "returns table (\n"
        "  workout_id text,\n"
        "  routine_id text,\n"
        "  session_id text,\n"
        "  session_name text,\n"
        "  started_at text,\n"
        "  finished_at text,\n"
        "  exercises jsonb\n"
        ")"
    ) in sql


def test_strength_sessions_rpc_security_boundary():
    sql = _sql()

    assert "security definer" in sql
    assert "set search_path = ''" in sql
    assert "selectauth.uid" not in sql
    assert "current_trainer.user_id = (select auth.uid())" in sql
    assert "current_trainer.role = 'trainer'" in sql
    assert "current_trainer.status = 'active'" in sql
    assert "trainer_athletes.trainer_id = (select auth.uid())" in sql
    assert "trainer_athletes.athlete_id = p_athlete_id" in sql
    assert "trainer_athletes.status = 'active'" in sql


def test_strength_sessions_rpc_filters_finished_strength_workouts():
    sql = _sql()

    assert "join public.workouts" in sql
    assert "join public.routines" in sql
    assert "routines.id = workouts.data->>'routineid'" in sql
    assert "routines.discipline = 'strength'" in sql
    assert "workouts.data->>'status' = 'finished'" in sql
    assert "workouts.data ? 'finishedat'" in sql
    assert (
        "order by (workouts.data->>'finishedat')::timestamptz desc"
        in sql
    )


def test_strength_sessions_rpc_parses_real_set_and_name_fields():
    sql = _sql()

    assert "workout_set.value->>'exerciseid'" in sql
    assert "routine_exercise.exercise->>'exerciseid'" in sql
    assert "routine_exercise.exercise->>'name'" in sql
    assert "routine_exercise.exercise->>'title'" in sql
    assert "workout_set.value->'setindex'" in sql
    assert "workout_set.value->'settype'" in sql
    assert "workout_set.value->'reps'" in sql
    assert "workout_set.value->'weight'" in sql
    assert "workout_set.value->'rir'" in sql
    assert "workout_set.value->'rpe'" in sql
    assert "workout_set.value->'durationseconds'" in sql
    assert "'set_index'" in sql
    assert "'set_order'" in sql
    assert "'set_type'" in sql
    assert "'weight_kg'" in sql
    assert "'duration_seconds'" in sql


def test_strength_sessions_rpc_has_no_sql_typos():
    sql = _sql()

    assert "selectauth" not in sql
    assert "isnot" not in sql
    assert "(select auth.uid())" in sql
    assert "is not null" in sql


def test_strength_sessions_rpc_privileges_and_no_writes():
    sql = _sql()

    assert (
        "revoke all\n"
        "on function public.trainer_list_athlete_strength_sessions(uuid)\n"
        "from public, anon"
    ) in sql
    assert (
        "grant execute\n"
        "on function public.trainer_list_athlete_strength_sessions(uuid)\n"
        "to authenticated"
    ) in sql
    assert "notify pgrst, 'reload schema';" in sql
    assert "create policy" not in sql
    assert "alter table" not in sql
    assert re.search(r"\binsert\b|\bupdate\b|\bdelete\b", sql) is None
