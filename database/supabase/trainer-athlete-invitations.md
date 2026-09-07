# Trainer–athlete invitations: phase 1A

SQL-only infrastructure. No HTTP routes, UI, email, deep links or unlink operation.
`trainer` means a human trainer; `coach` is not a role in this flow.

## Dependencies and installation

Apply `trainer-athlete-invitations.sql` once, after `schema.sql`,
`account-profile.sql` and `trainer-athletes.sql`. This is a standalone SQL script,
following the repository's SQL Editor convention, not a migration-framework file.
It executes in a transaction and notifies PostgREST to reload its schema.
The tests never execute SQL against remote Supabase.

Production prerequisites confirmed for this phase: `gymos_users.user_id` references
`auth.users`, `role` is `user|trainer|admin`, `status` is
`pending|active|rejected|suspended`, and `expires_at` is nullable timestamptz.
Eligible accounts have active status and no expired access. Only role `trainer`
can occupy trainer_id, only `user` can occupy athlete_id. Admin is excluded.

Both new tables have RLS enabled, no client policies and no privileges for
PUBLIC, anon or authenticated. No direct reads or writes. Existing
`trainer_athletes` read policies are unchanged. Only acceptance inserts or
reactivates a relationship; no relationship is created by issuing a code or invite.

## Public contract

All eight public wrappers are SECURITY DEFINER with `search_path = ''` and EXECUTE
only for authenticated among client roles. Their private implementations are in
`aptus_private`, whose USAGE/CREATE and private function EXECUTE privileges are
revoked from PUBLIC, anon and authenticated. Actor identity always comes from
`auth.uid()`. The existing running wrapper continues to work through its owner.
No service-role credentials are used by this infrastructure.

| Function | Arguments | Result |
| --- | --- | --- |
| set_my_connection_contact_code | p_code_hash text | void |
| trainer_create_athlete_invitation | p_contact_code_hash text, p_token_hash text | uuid |
| athlete_create_trainer_invitation | p_contact_code_hash text, p_token_hash text | uuid |
| list_my_received_trainer_athlete_invitations | none | rows below |
| list_my_sent_trainer_athlete_invitations | none | rows below |
| accept_trainer_athlete_invitation | p_invitation_id uuid | void |
| reject_trainer_athlete_invitation | p_invitation_id uuid | void |
| revoke_trainer_athlete_invitation | p_invitation_id uuid | void |

List columns: `id`, `trainer_id`, `athlete_id`, `inviter_id`, derived `recipient_id`,
derived `direction` (`trainer_to_athlete|athlete_to_trainer`), effective `status`,
`created_at`, `expires_at`, `accepted_at`, `revoked_at`, `revoked_by`,
`other_display_name`, `other_alias`. Identity fields come only from the other
participant's profile and may be null. No email, health data or hashes are returned.
Terminal history remains visible to an eligible participant in the appropriate box.
No public resolution/search endpoint exists.

The later backend must generate high-entropy random contact codes and invitation
tokens and submit their lowercase hexadecimal SHA-256 hashes. This phase accepts
only the exact 64-character format; it cannot prove that an input was generated
randomly. A contact hash is itself a sensitive capability for these RPCs. Do not
log or expose it. Regeneration replaces the owner's sole code, preserving created_at
and updating updated_at. It does not change previously issued invitations.

Invitation token hashes are unique but are not used to authorize phase 1A
acceptance: the authenticated recipient explicitly accepts by invitation UUID.
Any later token resolver must retain recipient authentication and state checks;
knowing a token must never transfer the invitation to a different account.

## State and expiry semantics

Creation returns a fresh invitation UUID, with server wall-clock created_at and
expires_at exactly seven days later. Sender direction is fixed by the public RPC.
No inviter/user ID is accepted as an argument.

Only recipient can accept/reject; only inviter can revoke. Rejection is represented
as revoked with revoked_by=recipient. Revocation uses revoked_by=inviter.
All transitions require an eligible actor and a nonexpired stored pending row.
Acceptance additionally rechecks both roles, statuses and account expiries.

An invitation is effectively expired whenever stored status is pending and
expires_at <= clock_timestamp(). Lists return expired in that case. Transition
RPCs reject it with invitation_expired, leaving the stored pending row intact:
raising an exception rolls back the transaction, so updating then raising would
not persist expiry. Creating a new invitation for the pair materializes expired
pending rows before insertion. No scheduler or time-dependent index is needed.
Wall-clock checks after locking prevent a transaction started before expiry from
accepting after expiry while waiting for a lock.

Accepted/revoked/expired rows never become pending again. Reaccepting an accepted
invitation conflicts, even if the relationship has subsequently become inactive.
Reactivation requires a new invitation and explicit recipient acceptance.

## Concurrency and errors

Normal PostgREST READ COMMITTED isolation is assumed. No advisory locks.

* Unique partial `(trainer_id, athlete_id) WHERE status='pending'` arbitrates
  concurrent and crossed creations. One succeeds and the other conflicts; issuing
  an inverse invite never accepts an existing one.
* Transitions use SELECT FOR UPDATE on the invitation. Concurrent accept/accept
  or accept/revoke serialize and only one terminal transition succeeds.
* Relationship PK and INSERT ON CONFLICT reactivate only an inactive relationship.
  An already active relationship produces relationship_already_active and the
  invitation transition rolls back. No duplicate relationship is possible.
* Creation checks active relationships both before and after insertion. The latter
  covers an INSERT waiting for a concurrent acceptance to remove its pending index
  entry; the next statement sees the newly committed active relationship and rolls
  back the attempted new invitation.
* Expiry materialization, invitation creation, and acceptance writes are each
  atomic within their respective RPC transaction. A client must retry the whole
  call after any database serialization/deadlock error; not an individual step.

| SQLSTATE | Message | Meaning |
| --- | --- | --- |
| 42501 | connection_actor_not_authorized | absent/invalid account or wrong actor role |
| 22023 | invitation_target_unavailable | malformed/unknown code, self, wrong/ineligible recipient |
| 22023 | invalid_contact_code_hash / invalid_invitation_token_hash | malformed own input |
| 23505 | contact_code_conflict | code hash already belongs to another account |
| 23505 | invitation_conflict | pending pair, active relationship or token collision |
| 42501 | invitation_not_available | missing/foreign invitation or wrong participant action |
| 23505 | invitation_not_pending | terminal invitation |
| 22023 | invitation_expired | pending but past its deadline |
| 42501 | invitation_accounts_not_eligible | one participant no longer eligible at acceptance |
| 23505 | relationship_already_active | acceptance finds an already active relationship |

Target errors deliberately do not distinguish nonexistence from role/status/expiry.
Unique-conflict exceptions are sanitized so constraint DETAIL does not leak hashes.
These are capability-based lookups, not arbitrary user/email search. Rate limits
and secret redaction for the eventual HTTP layer remain outside phase 1A.

## Deletion and rollback

FK cascades remove contact codes and invitations when either participant is
removed from auth.users. `revoked_by` is also a participant; tests verify that its
ON DELETE SET NULL FK does not prevent the participant cascade for revoked rows.
The existing explicit deletion RPC is unchanged in this phase; final auth-user
deletion performs the cascade. No unlink operation is introduced.

Conceptual rollback: revoke/drop these eight wrappers, drop their five private
implementations, then drop invitations and contact codes. Do not drop the shared
aptus_private schema or change its privileges: running uses it too. Rollback must
not silently delete accepted trainer_athletes relationships; that needs a separate
product decision. Back up invitation history before dropping tables.

## Local verification

Use the same disposable local PostgreSQL container convention as the running tests:

```bash
APTUS_TEST_POSTGRES_CONTAINER=<local-postgres-container> \
  python -m pytest -q -p no:cacheprovider \
  backend/tests/test_trainer_athlete_invitations_postgres.py
```

Each test run creates/drops its own database. auth.users/auth.uid and unrelated
schema dependencies are fixtures; production invitation SQL and existing running
and trainer identity RPC SQL are executed unmodified. Tests use actual PostgreSQL
privileges, role switching, row locks, constraints, transactions and concurrent
connections. Fixture-only setup uses the local database owner, not a service role
for client RPC invocations.
