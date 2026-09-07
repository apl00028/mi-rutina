"""Phase 1A integration tests against disposable local PostgreSQL only.

Reuse the existing local database fixture (including running trainer RPCs),
not a mock of SQL/RLS. Set APTUS_TEST_POSTGRES_CONTAINER to opt in.
"""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
from threading import Barrier
import time
from uuid import uuid4

import pytest

from test_trainer_running_sessions_postgres import database as base_database

SQL_DIR = Path(__file__).resolve().parents[2] / 'database' / 'supabase'
T, A, T2, A2, ADMIN = [f'00000000-0000-0000-0000-{n:012}' for n in range(1, 6)]
CODES = {T: '1' * 64, A: '2' * 64, T2: '3' * 64, A2: '4' * 64}


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def token():
    return uuid4().hex + uuid4().hex


@pytest.fixture(scope='module')
def database(base_database):
    base_database('''
      alter table public.gymos_users add column expires_at timestamptz;
      alter table public.gymos_users add column email text;
      alter table public.gymos_users enable row level security;
      create policy own_access on public.gymos_users for select to authenticated
        using (user_id = auth.uid());
      grant select on public.gymos_users to authenticated;
      create table public.profiles (
        id uuid primary key references auth.users(id) on delete cascade,
        display_name text, alias text
      );
      alter table public.profiles enable row level security;
      grant select on public.trainer_athletes to authenticated;
    ''')
    base_database((SQL_DIR / 'trainer-athlete-invitations.sql').read_text())
    base_database((SQL_DIR / 'trainer-athlete-identities.sql').read_text())
    return base_database


@pytest.fixture
def db(database):
    database('truncate auth.users cascade;')
    for user, role in [(T, 'trainer'), (A, 'user'), (T2, 'trainer'), (A2, 'user'), (ADMIN, 'admin')]:
        database(f"insert into auth.users values ('{user}');"
                 f"insert into public.gymos_users(user_id, role, status) values ('{user}', '{role}', 'active');"
                 f"insert into public.profiles values ('{user}', 'Name-{role}', 'Alias-{role}');")
    for user, code in CODES.items():
        call(database, user, 'set_my_connection_contact_code', code)
    return database


def call(db, user, name, *args, error=None, role='authenticated'):
    return db(f"select public.{name}({', '.join('null' if a is None else literal(a) for a in args)});",
              role=role, user=user, error=error)


def create(db, actor=T, target=A, *, code=None, value=None, error=None, name=None):
    name = name or ('trainer_create_athlete_invitation' if actor in (T, T2) else 'athlete_create_trainer_invitation')
    return call(db, actor, name, code if code is not None else CODES[target], value or token(), error=error)


def rows(db, user, box):
    result = db(f'select row_to_json(r) from public.list_my_{box}_trainer_athlete_invitations() r;',
                role='authenticated', user=user)
    return [json.loads(line) for line in result.splitlines() if line]


def transition(db, user, invitation, action='accept', error=None):
    return call(db, user, f'{action}_trainer_athlete_invitation', invitation, error=error)


def state(db, invitation):
    return db(f"select status from public.trainer_athlete_invitations where id = '{invitation}';")


def expire(db, invitation):
    db(f"update public.trainer_athlete_invitations set created_at = now() - interval '9 days', "
       f"expires_at = now() - interval '1 day' where id = '{invitation}';")


@pytest.mark.parametrize('user', [A, T])
def test_contact_regeneration_invalidates_old_code(db, user):
    new_code = token()
    call(db, user, 'set_my_connection_contact_code', new_code)
    assert db(f"select count(*) from public.connection_contact_codes where user_id = '{user}';") == '1'
    actor = T if user == A else A
    create(db, actor, user, error='invitation_target_unavailable')
    assert create(db, actor, user, code=new_code)
    assert db(f"select updated_at >= created_at from public.connection_contact_codes where user_id = '{user}';") == 't'


@pytest.mark.parametrize('value', [None, '', 'A' * 64, 'a' * 63, 'a' * 65, 'g' * 64, 'a' * 64 + '\n'])
def test_contact_hash_format(db, value):
    call(db, A, 'set_my_connection_contact_code', value, error='invalid_contact_code_hash')


def test_contact_collision_is_sanitized(db):
    call(db, A, 'set_my_connection_contact_code', CODES[T], error='contact_code_conflict')
    assert db(f"select code_hash from public.connection_contact_codes where user_id = '{A}';") == CODES[A]


@pytest.mark.parametrize('status,expiry,role', [
    ('active', None, 'admin'), ('suspended', None, 'user'), ('pending', None, 'user'),
    ('rejected', None, 'trainer'), ('active', "now() - interval '1 day'", 'user'),
])
def test_invalid_actor_cannot_use_contact_or_lists(db, status, expiry, role):
    db(f"update public.gymos_users set status='{status}', role='{role}', expires_at={expiry or 'null'} where user_id='{A}';")
    call(db, A, 'set_my_connection_contact_code', token(), error='42501')
    call(db, A, 'list_my_received_trainer_athlete_invitations', error='42501')
    call(db, A, 'list_my_sent_trainer_athlete_invitations', error='42501')


@pytest.mark.parametrize('actor,target,direction', [(T,A,'trainer_to_athlete'), (A,T,'athlete_to_trainer')])
def test_creation_and_private_boxes(db, actor, target, direction):
    value = token()
    invitation = create(db, actor, target, value=value)
    assert db('select count(*) from public.trainer_athletes;') == '0'
    sent, received = rows(db, actor, 'sent'), rows(db, target, 'received')
    assert sent[0]['id'] == received[0]['id'] == invitation
    assert sent[0]['inviter_id'] == actor and sent[0]['recipient_id'] == target
    assert sent[0]['direction'] == direction
    assert sent[0]['other_display_name'] and sent[0]['other_alias']
    assert received[0]['status'] == 'pending'
    assert not rows(db, actor, 'received') and not rows(db, target, 'sent')
    for outsider in [T2, A2]:
        assert rows(db, outsider, 'sent') == rows(db, outsider, 'received') == []
    encoded = json.dumps([sent, received])
    for secret in [value, CODES[target], 'token_hash', 'code_hash', 'email']:
        assert secret not in encoded
    assert db(f"select expires_at - created_at = interval '7 days' from public.trainer_athlete_invitations where id='{invitation}';") == 't'


@pytest.mark.parametrize('actor,target', [(T,T), (T,T2), (A,A), (A,A2)])
def test_self_and_same_role_have_generic_target_error(db, actor, target):
    create(db, actor, target, error='invitation_target_unavailable')


@pytest.mark.parametrize('code', ['', 'bad', 'f' * 64, 'A' * 64])
def test_invalid_unknown_codes_same_error(db, code):
    create(db, code=code, error='invitation_target_unavailable')


@pytest.mark.parametrize('actor,target', [(T,A), (A,T)])
@pytest.mark.parametrize('who', ['actor','target'])
@pytest.mark.parametrize('change', ["status='suspended'", "status='pending'", "status='rejected'",
                                     "expires_at=now()-interval '1 day'", "role='admin'"])
def test_creation_requires_both_eligible_accounts(db, actor, target, who, change):
    user = actor if who == 'actor' else target
    db(f"update public.gymos_users set {change} where user_id='{user}';")
    create(db, actor, target, error='42501' if who == 'actor' else 'invitation_target_unavailable')


@pytest.mark.parametrize('actor,name,target', [(A,'trainer_create_athlete_invitation',T), (T,'athlete_create_trainer_invitation',A)])
def test_endpoint_direction_cannot_be_forged(db, actor, name, target):
    create(db, actor, target, name=name, error='42501')


def test_existing_relationships_and_pending_duplicates(db):
    db(f"insert into public.trainer_athletes values ('{T}','{A}','active',now(),now());")
    create(db, error='invitation_conflict')
    db("update public.trainer_athletes set status='inactive';")
    invitation = create(db)
    create(db, error='invitation_conflict')
    create(db, A,T, error='invitation_conflict')
    assert state(db, invitation) == 'pending'
    assert db('select status from public.trainer_athletes;') == 'inactive'
    expire(db, invitation)
    assert rows(db,A,'received')[0]['status'] == 'expired'
    assert create(db,A,T) != invitation
    assert state(db,invitation) == 'expired'


def test_duplicate_token_and_invalid_token(db):
    value = token()
    create(db,value=value)
    create(db,T2,A2,value=value,error='invitation_conflict')
    for invalid in ['short','A'*64]:
        create(db,T2,A2,value=invalid,error='invalid_invitation_token_hash')


@pytest.mark.parametrize('actor,target', [(T,A),(A,T)])
@pytest.mark.parametrize('existing', [False,True])
def test_accept_creates_or_reactivates_once(db, actor,target,existing):
    if existing:
        db(f"insert into public.trainer_athletes(trainer_id,athlete_id,status) values ('{T}','{A}','inactive');")
    invitation=create(db,actor,target)
    transition(db,actor,invitation,error='42501')
    transition(db,A2,invitation,error='42501')
    transition(db,target,invitation)
    assert state(db,invitation)=='accepted'
    assert db('select count(*) from public.trainer_athletes where status=\'active\';')=='1'
    assert rows(db,actor,'sent')[0]['accepted_at'] is not None
    transition(db,target,invitation,error='invitation_not_pending')
    db("update public.trainer_athletes set status='inactive';")
    transition(db,target,invitation,error='invitation_not_pending')
    assert db('select status from public.trainer_athletes;')=='inactive'


@pytest.mark.parametrize('who',[T,A])
@pytest.mark.parametrize('change',["role='admin'","role='trainer'","role='user'","status='pending'",
                                  "status='suspended'","status='rejected'","expires_at=now()-interval '1 day'"])
def test_accept_revalidates_accounts(db,who,change):
    if (who==T and change=="role='trainer'") or (who==A and change=="role='user'"):
        return
    invitation=create(db)
    db(f"update public.gymos_users set {change} where user_id='{who}';")
    transition(db,A,invitation,error='42501')
    assert state(db,invitation)=='pending'
    assert db('select count(*) from public.trainer_athletes;')=='0'


@pytest.mark.parametrize('action,actor',[('accept',A),('reject',A),('revoke',T)])
def test_expiry_blocks_transitions_without_rollback_lie(db,action,actor):
    invitation=create(db); expire(db,invitation)
    transition(db,actor,invitation,action,error='invitation_expired')
    assert state(db,invitation)=='pending'
    assert rows(db,T,'sent')[0]['status']=='expired'
    assert db('select count(*) from public.trainer_athletes;')=='0'


@pytest.mark.parametrize('action,actor,wrong',[('reject',A,T),('revoke',T,A)])
def test_rejection_revocation_and_terminal_history(db,action,actor,wrong):
    invitation=create(db)
    transition(db,wrong,invitation,action,error='42501')
    transition(db,A2,invitation,action,error='42501')
    transition(db,actor,invitation,action)
    assert state(db,invitation)=='revoked'
    assert rows(db,T,'sent')[0]['revoked_by']==actor
    for next_action,next_actor in [('accept',A),('reject',A),('revoke',T)]:
        transition(db,next_actor,invitation,next_action,error='invitation_not_pending')
    assert db('select count(*) from public.trainer_athletes;')=='0'


def test_missing_id_indistinguishable_from_foreign_id(db):
    invitation=create(db)
    transition(db,A2,invitation,error='invitation_not_available')
    transition(db,A2,str(uuid4()),error='invitation_not_available')


def test_accept_is_atomic_and_active_conflict_deterministic(db):
    invitation=create(db)
    # Failure after relation INSERT must roll back both relation and transition.
    db("""create function public.fail_invitation_update() returns trigger language plpgsql as $$
      begin raise exception 'test_atomic_failure'; end; $$;
      create trigger fail_invitation_update before update on public.trainer_athlete_invitations
      for each row execute function public.fail_invitation_update();""")
    try:
        transition(db,A,invitation,error='test_atomic_failure')
        assert state(db,invitation)=='pending'
        assert db('select count(*) from public.trainer_athletes;')=='0'
    finally:
        db('drop trigger fail_invitation_update on public.trainer_athlete_invitations; drop function public.fail_invitation_update();')
    db(f"insert into public.trainer_athletes(trainer_id,athlete_id) values ('{T}','{A}');")
    transition(db,A,invitation,error='relationship_already_active')
    assert state(db,invitation)=='pending'


def race(*actions):
    barrier=Barrier(len(actions))
    def attempt(action):
        barrier.wait(timeout=10)
        try:
            action(); return 'ok'
        except AssertionError as exc:
            # A unique/status conflict is expected; unrelated SQL failures are not.
            assert '23505' in str(exc), str(exc)
            return 'conflict'
    with ThreadPoolExecutor(max_workers=len(actions)) as pool:
        return list(pool.map(attempt,actions))


@pytest.mark.parametrize('crossed',[False,True])
def test_concurrent_creates(db,crossed):
    outcomes=race(lambda:create(db),lambda:create(db,A,T) if crossed else create(db))
    assert sorted(outcomes)==['conflict','ok']
    assert db("select count(*) from public.trainer_athlete_invitations where status='pending';")=='1'
    assert db('select count(*) from public.trainer_athletes;')=='0'


def test_concurrent_accepts(db):
    invitation=create(db)
    assert sorted(race(lambda:transition(db,A,invitation),lambda:transition(db,A,invitation)))==['conflict','ok']
    assert state(db,invitation)=='accepted'
    assert db('select count(*) from public.trainer_athletes;')=='1'


def test_accept_vs_revoke(db):
    invitation=create(db)
    assert sorted(race(lambda:transition(db,A,invitation),lambda:transition(db,T,invitation,'revoke')))==['conflict','ok']
    final=state(db,invitation)
    assert final in ['accepted','revoked']
    assert db('select count(*) from public.trainer_athletes;')==('1' if final=='accepted' else '0')


def test_create_waiting_for_accept_does_not_leave_new_pending(db):
    invitation=create(db)
    with ThreadPoolExecutor(max_workers=1) as pool:
        accepting=pool.submit(db, f"begin; select public.accept_trainer_athlete_invitation('{invitation}'); "
                                  "select pg_sleep(2) /* INVITATION_TEST_HOLD */; commit;", role='authenticated',user=A)
        deadline=time.monotonic()+5
        while db("select count(*) from pg_stat_activity where wait_event='PgSleep' "
                 "and query like '%INVITATION_TEST_HOLD%';")=='0':
            assert time.monotonic()<deadline
            time.sleep(.02)
        create(db,error='invitation_conflict')
        accepting.result()
    assert state(db,invitation)=='accepted'
    assert db("select count(*) from public.trainer_athlete_invitations where status='pending';")=='0'


@pytest.mark.parametrize('role',['anon','authenticated'])
def test_table_and_private_privileges(db,role):
    for table in ['connection_contact_codes','trainer_athlete_invitations']:
        for statement in [f'select * from public.{table}', f'delete from public.{table}',
                          f'insert into public.{table} default values', f'update public.{table} set created_at=now()']:
            db(statement+';',role=role,user=A,error='42501')
        assert db(f"select relrowsecurity from pg_class where oid='public.{table}'::regclass;")=='t'
    assert db(f"select has_schema_privilege('{role}', 'aptus_private','USAGE');")=='f'
    assert db(f"select has_schema_privilege('{role}', 'aptus_private','CREATE');")=='f'
    db("select aptus_private.set_my_connection_contact_code(repeat('a',64));",role=role,user=A,error='42501')
    assert db(f"select bool_and(not has_function_privilege('{role}',p.oid,'EXECUTE')) "
              "from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='aptus_private';")=='t'


def test_public_rpc_grants_and_hardened_search_paths(db):
    names=['set_my_connection_contact_code','trainer_create_athlete_invitation','athlete_create_trainer_invitation',
           'list_my_received_trainer_athlete_invitations','list_my_sent_trainer_athlete_invitations',
           'accept_trainer_athlete_invitation','reject_trainer_athlete_invitation','revoke_trainer_athlete_invitation']
    name_sql=','.join(literal(n) for n in names)
    assert db(f"select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
              f"where n.nspname='public' and p.proname in ({name_sql}) and p.prosecdef "
              "and p.proconfig @> array['search_path=\"\"'] "
              "and has_function_privilege('authenticated',p.oid,'EXECUTE') "
              "and not has_function_privilege('anon',p.oid,'EXECUTE');")=='8'
    call(db,A,'set_my_connection_contact_code',token(),role='anon',error='42501')
    call(db,None,'set_my_connection_contact_code',token(),error='42501')


def test_existing_relationship_reads_and_running_rpcs(db):
    invitation=create(db); transition(db,A,invitation)
    for user in [T,A]:
        assert db('select count(*) from public.trainer_athletes;',role='authenticated',user=user)=='1'
    assert db('select count(*) from public.trainer_athletes;',role='authenticated',user=T2)=='0'
    assert db('select count(*) from public.trainer_list_athlete_identities();',role='authenticated',user=T)=='1'
    db(f"insert into public.running_sessions(user_id,id,source,source_package,source_record_id,started_at,ended_at,data) "
       f"values ('{A}','external','health_connect','garmin','record',now()-interval '30 minutes',now(),"
       "'{\"schema_version\":1,\"exercise_type\":33}');")
    assert db(f"select count(*) from public.trainer_list_athlete_running_sessions('{A}');",role='authenticated',user=T)=='1'
    assert db(f"select count(*) from public.trainer_get_athlete_running_session('{A}','health-connect:external');",role='authenticated',user=T)=='1'
    db("select public.upsert_my_running_session('{\"source_package\":\"garmin\",\"source_record_id\":\"record\","
       "\"started_at\":\"2026-09-07T08:00:00Z\",\"ended_at\":\"2026-09-07T09:00:00Z\","
       "\"data\":{\"schema_version\":1,\"exercise_type\":33}}');",role='authenticated',user=A)


@pytest.mark.parametrize('action,actor',[('accept',A),('reject',A),('revoke',T)])
@pytest.mark.parametrize('deleted',[T,A])
def test_participant_delete_cascades_including_revoked_by(db,action,actor,deleted):
    invitation=create(db); transition(db,actor,invitation,action)
    db(f"delete from auth.users where id='{deleted}';")
    assert db('select count(*) from public.trainer_athlete_invitations;')=='0'
    assert db(f"select count(*) from public.connection_contact_codes where user_id='{deleted}';")=='0'


@pytest.mark.parametrize('patch', [
    {'trainer_id': A}, {'inviter_id': A2}, {'token_hash': 'A'*64}, {'token_hash': 'a'*63},
    {'status': 'unknown'}, {'status': 'accepted'}, {'status': 'revoked'},
    {'accepted_at': '2026-09-07T08:00:00Z'}, {'revoked_at': '2026-09-07T08:00:00Z'},
    {'revoked_by': A}, {'status':'expired','accepted_at':'2026-09-07T08:00:00Z'},
    {'status':'revoked','revoked_at':'2026-09-07T08:00:00Z','revoked_by':A2},
    {'status':'accepted','accepted_at':'2026-09-07T08:00:00Z','revoked_by':A},
    {'expires_at':'2026-09-06T08:00:00Z'},
])
def test_table_constraints_reject_invalid_rows_even_for_owner(db,patch):
    values={'trainer_id':T,'athlete_id':A,'inviter_id':T,'token_hash':token(),'status':'pending',
            'created_at':'2026-09-07T08:00:00Z','expires_at':'2026-09-14T08:00:00Z', **patch}
    db(f"insert into public.trainer_athlete_invitations ({','.join(values)}) "
       f"values ({','.join(literal(v) for v in values.values())});", error='23514')
    assert db('select count(*) from public.trainer_athlete_invitations;')=='0'


def test_future_access_expiry_and_missing_profile_are_supported(db):
    db("update public.gymos_users set expires_at=now()+interval '1 day';")
    db(f"delete from public.profiles where id='{A}';")
    invitation=create(db)
    assert rows(db,T,'sent')[0]['other_display_name'] is None
    transition(db,A,invitation)
    assert state(db,invitation)=='accepted'


def test_stored_expired_is_terminal_and_all_terminal_states_remain_listed(db):
    old=create(db); expire(db,old)
    new=create(db)
    transition(db,A,old,error='invitation_not_pending')
    transition(db,T,new,'revoke')
    assert {row['status'] for row in rows(db,T,'sent')}=={'expired','revoked'}
    invitation=create(db)
    transition(db,A,invitation)
    assert {row['status'] for row in rows(db,A,'received')}=={'expired','revoked','accepted'}


def test_anonymous_cannot_execute_any_public_wrapper(db):
    names={
      'set_my_connection_contact_code':[token()],
      'trainer_create_athlete_invitation':[CODES[A],token()],
      'athlete_create_trainer_invitation':[CODES[T],token()],
      'list_my_received_trainer_athlete_invitations':[],
      'list_my_sent_trainer_athlete_invitations':[],
      'accept_trainer_athlete_invitation':[str(uuid4())],
      'reject_trainer_athlete_invitation':[str(uuid4())],
      'revoke_trainer_athlete_invitation':[str(uuid4())],
    }
    for name,args in names.items():
        call(db,A,name,*args,role='anon',error='42501')
