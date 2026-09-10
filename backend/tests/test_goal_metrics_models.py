import pytest
from pydantic import ValidationError

from app.domains.goals.models import (
    GoalMetricBaselinePut,
    GoalMetricCreate,
)


def test_invalid_metric_key_is_rejected():
    with pytest.raises(ValidationError):
        GoalMetricCreate(metric_key="longest_run")


def test_baseline_source_reference_is_coherent():
    with pytest.raises(ValidationError):
        GoalMetricBaselinePut(
            value=200,
            measured_at="2026-09-01",
            source_type="health_connect",
            source_record_id="record-1",
        )

    baseline = GoalMetricBaselinePut(
        value=200,
        measured_at="2026-09-01",
        source_type="health_connect",
        source_domain="running_sessions",
        source_record_id="record-1",
    )
    assert baseline.source_domain == "running_sessions"
