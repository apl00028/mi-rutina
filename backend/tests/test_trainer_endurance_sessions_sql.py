from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[2]


def _sql(name: str) -> str:
    return (
        ROOT
        / "database"
        / "supabase"
        / name
    ).read_text(encoding="utf-8").lower()


def test_swimming_sessions_rpc_contract_and_source():
    sql = _sql(
        "trainer-athlete-swimming-sessions.sql"
    )

    assert (
        "create function public.trainer_list_athlete_swimming_sessions(\n"
        "  p_athlete_id uuid\n"
        ")"
    ) in sql
    assert "p_trainer_id" not in sql
    assert "returns table (\n  id text," in sql
    assert "  discipline text," in sql
    assert "  title text," in sql
    assert "  event_at text," in sql
    assert "  started_at text," in sql
    assert "  duration_seconds double precision," in sql
    assert "from authorized_relation" in sql
    assert "join public.swimming_sessions" in sql
    assert "swimming_sessions.user_id = authorized_relation.athlete_id" in sql
    assert "'swimming'::text as discipline" in sql
    assert "swimming_sessions.started_at::text as event_at" in sql
    assert "swimming_sessions.started_at::text as started_at" in sql
    assert "session_duration.duration_seconds" in sql
    assert "total_timer_time_seconds" in sql
    assert "total_elapsed_time_seconds" in sql
    assert "total_moving_time_seconds" in sql
    assert "order by swimming_sessions.started_at desc" in sql
    assert "limit 25" in sql


def test_swimming_sessions_rpc_does_not_shift_late_sessions_to_next_day():
    sql = _sql(
        "trainer-athlete-swimming-sessions.sql"
    )

    assert "swimming_sessions.started_at::text as event_at" in sql
    assert "interval '1 second'" not in sql
    assert "as finished_at" not in sql


def test_running_sessions_rpc_contract_and_source():
    sql = _sql(
        "trainer-athlete-running-sessions.sql"
    )

    assert (
        "create function public.trainer_list_athlete_running_sessions(\n"
        "  p_athlete_id uuid\n"
        ")"
    ) in sql
    assert "p_trainer_id" not in sql
    assert "returns table (\n  id text," in sql
    assert "  discipline text," in sql
    assert "  title text," in sql
    assert "  event_at text," in sql
    assert "  routine_id text," in sql
    assert "  session_id text," in sql
    assert "  started_at text," in sql
    assert "  finished_at text" in sql
    assert "from authorized_relation" in sql
    assert "join public.workouts" in sql
    assert "join public.routines" in sql
    assert "workouts.data->>'finishedat' as event_at" in sql
    assert "routines.discipline = 'running'" in sql
    assert "workouts.data->>'status' = 'finished'" in sql
    assert "workouts.data ? 'finishedat'" in sql
    assert (
        "order by (workouts.data->>'finishedat')::timestamptz desc"
        in sql
    )
    assert "limit 25" in sql


def test_endurance_sessions_rpcs_share_trainer_security_boundary():
    for name in [
        "trainer-athlete-swimming-sessions.sql",
        "trainer-athlete-running-sessions.sql",
    ]:
        sql = _sql(name)

        assert "security definer" in sql
        assert "set search_path = ''" in sql
        assert "selectauth.uid" not in sql
        assert "current_trainer.user_id = (select auth.uid())" in sql
        assert "current_trainer.role = 'trainer'" in sql
        assert "current_trainer.status = 'active'" in sql
        assert "trainer_athletes.trainer_id = (select auth.uid())" in sql
        assert "trainer_athletes.athlete_id = p_athlete_id" in sql
        assert "trainer_athletes.status = 'active'" in sql
        assert "notify pgrst, 'reload schema';" in sql
        assert "create policy" not in sql
        assert "alter table" not in sql
        assert re.search(r"\binsert\b|\bupdate\b|\bdelete\b", sql) is None


def test_endurance_sessions_rpc_privileges():
    cases = {
        "trainer-athlete-swimming-sessions.sql":
            "trainer_list_athlete_swimming_sessions",
        "trainer-athlete-running-sessions.sql":
            "trainer_list_athlete_running_sessions",
    }

    for name, function_name in cases.items():
        sql = _sql(name)

        assert (
            "revoke all\n"
            f"on function public.{function_name}(uuid)\n"
            "from public, anon"
        ) in sql
        assert (
            "grant execute\n"
            f"on function public.{function_name}(uuid)\n"
            "to authenticated"
        ) in sql
