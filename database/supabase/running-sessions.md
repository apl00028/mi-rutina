# Running sessions: storage contract

This step adds storage only. There is no backend HTTP endpoint, frontend sync,
trainer query change or backfill. Apply `running-sessions.sql` once, then apply
the updated `delete-account.sql`. The schema script is transactional; it is
intentionally not an upgrade script for an already existing running table.

## Ownership and writes

The only client write entrypoint is the Supabase RPC
`public.upsert_my_running_session(p_session jsonb)`. It returns one row from
`running_sessions`. Call it with the authenticated user's JWT, not service-role
credentials. Its public definer facade delegates to the definer implementation
in `aptus_private`, which must remain outside PostgREST's exposed schemas.
Only the public facade grants EXECUTE to authenticated. PUBLIC, anon and
authenticated have neither USAGE/CREATE on the private schema nor EXECUTE on
the private implementation. The facade delegates with its owner's privileges;
the private implementation still derives ownership exclusively from auth.uid()
and rejects a missing identity. Both functions have an empty search path and
use no dynamic SQL.

The table grants authenticated users SELECT only, with ownership RLS. There
are no client write policies or direct INSERT/UPDATE/DELETE grants. The RPC
always gets the owner from `auth.uid()`; the payload cannot supply `user_id`,
`id`, `source`, administrative timestamps, or unknown keys. Authentication and
account-status checks in the future HTTP endpoint remain a separate concern.

`source` is fixed to `health_connect`. Identity is exactly
`(user_id, source, source_package, source_record_id)`. The database generates a
random UUID string for `id` on insertion. An atomic upsert on the identity
constraint preserves the original `id` and `created_at`, updates activity
timestamps and data, and refreshes `updated_at`. No SELECT-before-INSERT is used.
Concurrent updates serialize on the conflicting row; the last applied update
wins for supplied fields. This does not implement source revision ordering.

## Payload

```json
{
  "source_package": "com.garmin.android.apps.connectmobile",
  "source_record_id": "actual-health-connect-record-id",
  "started_at": "2026-08-30T08:00:00Z",
  "ended_at": "2026-08-30T08:25:00Z",
  "data": {
    "schema_version": 1,
    "exercise_type": 33,
    "distance_meters": 5000,
    "heart_rate_average_bpm": null
  }
}
```

All five top-level fields are required. Package and record ID must be nonblank
strings, at most 256 and 1024 characters respectively; their contents are not
rewritten. These fields come from the record's Metadata, not calculated metrics.
Timestamps must include seconds and an explicit `Z` or `+/-HH:MM` offset. They
are finite instants stored as `timestamptz`; end must not precede start. No
calendar date or timezone policy is introduced here.

`data` is an object with required numeric `schema_version: 1` and
`exercise_type: 33` (running) or `34` (treadmill). Optional fields map only from
fields already returned by the native running reader:

| Stored key | Native field | Validation |
| --- | --- | --- |
| `distance_meters` | `distanceMeters` | Nonnegative number or null |
| `heart_rate_average_bpm` | `heartRateAverageBpm` | Nonnegative number or null |
| `heart_rate_max_bpm` | `heartRateMaxBpm` | Nonnegative number or null |
| `heart_rate_sample_count` | `heartRateSampleCount` | Nonnegative integer or null |
| `speed_average_meters_per_second` | `speedAverageMetersPerSecond` | Nonnegative number or null |
| `speed_max_meters_per_second` | `speedMaxMetersPerSecond` | Nonnegative number or null |
| `speed_sample_count` | `speedSampleCount` | Nonnegative integer or null |
| `lap_count` | `lapCount` | Nonnegative integer or null |
| `segment_count` | `segmentCount` | Nonnegative integer or null |
| `has_route` | `hasRoute` | Boolean or null |

Unknown fields and numeric strings are rejected. Omitted metrics preserve the
previous value on update (and remain absent on insertion); explicit null clears
the value to null. Unknown values are never replaced with zero. This is a
shallow merge of a flat, validated object. A future adapter should omit metrics
whose native subread failed, rather than erasing successful previous reads.
Native diagnostic error strings are not persisted as activity metrics.

`durationSeconds` is currently derived from start/end; `paceSecondsPerKmFromSpeed`
is derived from average speed. Neither is duplicated in storage. Their future
response adapter can calculate elapsed seconds and `1000 / positive_speed`.
Missing speed does not produce a pace; elapsed duration is not moving time.

Different record IDs/writers are different identities even at identical times.
Reimported/recreated records or future sources require explicit reconciliation;
there is no approximate time/distance deduplication or delete-on-missing behavior.

## Real local PostgreSQL tests

Requirements: Docker, Python and pytest. No Python PostgreSQL driver is needed.
The container publishes no port and has no production connection credentials.

```sh
docker run --detach --rm --name aptus-running-step2-test \
  -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16
docker exec aptus-running-step2-test pg_isready -U postgres
APTUS_TEST_POSTGRES_CONTAINER=aptus-running-step2-test \
  python3 -m pytest -q -p no:cacheprovider backend/tests/test_running_sessions_postgres.py
docker stop aptus-running-step2-test
```

Wait for `pg_isready` to report readiness before running tests. Each test run
creates and drops its own database in that disposable local container. Without
the environment variable, tests skip explicitly. They install the actual
running schema/RPC and account cleanup SQL, test concurrent writes, constraints,
RLS and grants using actual PostgreSQL roles. Only `auth.uid()`, `auth.users`
and unrelated cleanup tables are minimal test stubs. This is not a test of
Supabase JWT validation, PostgREST schema exposure or a remote deployment.

Rollback: disable consumers, restore the previous account cleanup function and
revoke the new RPC's execute grants; retain the table/data. Dropping the table
is destructive and is not part of routine rollback.
