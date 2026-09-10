from pathlib import Path


def sql() -> str:
    return (
        Path(__file__).resolve().parents[2]
        / "database"
        / "supabase"
        / "goals.sql"
    ).read_text(encoding="utf-8").lower()


def test_metric_and_baseline_schema_invariants():
    source = sql()
    assert "create table if not exists public.goal_metrics" in source
    assert "references public.goals(id) on delete cascade" in source
    assert "unique (goal_id, metric_key)" in source
    assert "target_value numeric null" in source
    assert "create table if not exists public.goal_metric_baselines" in source
    assert "unique (goal_metric_id)" in source
    assert "measured_at date not null" in source
    assert "source_record_id text null" in source
    assert "goal_metric_baselines_source_type_check" in source


def test_units_are_not_persisted_as_arbitrary_text():
    source = sql()
    metrics = source.split(
        "create table if not exists public.goal_metrics"
    )[1].split(
        "create table if not exists public.goal_metric_baselines"
    )[0]
    baselines = source.split(
        "create table if not exists public.goal_metric_baselines"
    )[1]
    assert "unit text" not in metrics
    assert "unit text" not in baselines


def test_metric_tables_have_owner_rls_without_delete():
    source = sql()
    for table in ("goal_metrics", "goal_metric_baselines"):
        assert f"alter table public.{table} enable row level security" in source
        assert f"{table}_select_own" in source
        assert f"{table}_insert_own" in source
        assert f"{table}_update_own" in source
        assert f"grant select, insert, update on public.{table}" in source
    assert "goal_metrics_delete" not in source
    assert "goal_metric_baselines_delete" not in source
