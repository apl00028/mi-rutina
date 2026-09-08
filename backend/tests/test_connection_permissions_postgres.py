"""Domain permission boundary on disposable local PostgreSQL, using real RPCs/RLS."""
from concurrent.futures import ThreadPoolExecutor
import json
from threading import Barrier
import pytest
from test_trainer_athlete_invitations_postgres import (
    database as invitation_database, base_database, db, call, create, transition,
    T, A, T2, A2, ADMIN, SQL_DIR, literal,
)

DOMAINS = ['swimming', 'running', 'cycling', 'strength', 'health']


@pytest.fixture(scope='module')
def database(invitation_database):
    execute = invitation_database
    for filename in [
        'active-routines.sql', 'swimming-sessions.sql', 'health-tracking.sql',
        'expand-health-metrics.sql', 'add-health-body-measurements.sql',
        'trainer-routine-templates.sql', 'trainer-routine-assignments.sql',
        'trainer-athlete-overview.sql', 'trainer-athlete-strength-sessions.sql',
        'trainer-athlete-swimming-sessions.sql', 'trainer-athlete-swimming-session-detail.sql',
    ]:
        execute((SQL_DIR / filename).read_text())
    # A pre-existing active relationship has no inferred consent after migration.
    execute(f"insert into auth.users values ('{T}'), ('{A}'); insert into public.trainer_athletes values ('{T}', '{A}', 'active', now(), now());")
    execute((SQL_DIR / 'trainer-athlete-permissions.sql').read_text())
    assert execute('select count(*) from public.trainer_athletes;') == '1'
    assert execute('select count(*) from public.trainer_athlete_permissions;') == '0'
    execute('grant select on public.trainer_routine_assignments to authenticated;')
    return execute


def link(db):
    invitation = create(db)
    transition(db, A, invitation)
    return invitation


def stamp(db):
    return db(f"select updated_at from public.trainer_athletes where trainer_id='{T}' and athlete_id='{A}';")


def grant(db, domains, user=A, expected=None, error=None):
    return db(f"select public.set_my_trainer_permissions('{T}', array[{','.join(literal(d) for d in domains)}]::text[], {literal(expected or stamp(db))});",
              role='authenticated', user=user, error=error)


def has(db, domain, user=T):
    return call(db, user, 'trainer_has_athlete_domain', A, domain) == 't'


def list_rows(db, rpc, *args, user=T):
    result = db(f"select row_to_json(r) from public.{rpc}({','.join(literal(a) for a in args)}) r;", role='authenticated', user=user)
    return [json.loads(line) for line in result.splitlines() if line]


def seed(db):
    for domain in DOMAINS[:-1]:
        data = json.dumps({'discipline': domain, 'name': 'private-' + domain, 'sessions': [{'sessionId': 's', 'name': 'private-' + domain}]})
        workout = json.dumps({'workoutId': domain, 'routineId': domain, 'sessionId': 's', 'status': 'finished', 'startedAt': '2026-09-07T08:00:00Z', 'finishedAt': '2026-09-07T09:00:00Z'})
        db(f"insert into public.routines(id,user_id,data) values ('{domain}','{A}',{literal(data)});"
           f"insert into public.active_routines(user_id,routine_id,discipline) values ('{A}','{domain}','{domain}');"
           f"insert into public.workouts(id,user_id,data) values ('{domain}','{A}',{literal(workout)});")
    db(f"insert into public.swimming_sessions(id,user_id,source,started_at,data) values ('swim','{A}','health_connect',now(),'{{}}');"
       f"insert into public.health_weight_entries(user_id,measurement_date,weight_kg) values ('{A}',current_date,75);")


@pytest.mark.parametrize('domain', DOMAINS)
def test_exact_grant_and_default_denial(db, domain):
    link(db)
    assert not any(has(db, d) for d in DOMAINS)
    grant(db, [domain])
    assert [d for d in DOMAINS if has(db, d)] == [domain]
    assert not has(db, domain, T2)
    assert not has(db, domain, ADMIN)
    assert not has(db, domain, A)
    grant(db, [])
    assert not has(db, domain)


@pytest.mark.parametrize('who', [T, A])
@pytest.mark.parametrize('change', ["status='suspended'", "expires_at=now()-interval '1 day'", "role='admin'"])
def test_account_eligibility_on_all_reads(db, who, change):
    link(db); grant(db, DOMAINS); seed(db)
    db(f"update public.gymos_users set {change} where user_id='{who}';")
    if who == A and change == "role='admin'":
        assert all(has(db, d) for d in DOMAINS)
        assert list_rows(db, 'trainer_get_athlete_overview', A)
        return
    assert not any(has(db, d) for d in DOMAINS)
    assert list_rows(db, 'trainer_get_athlete_overview', A) == []
    assert list_rows(db, 'trainer_list_athlete_identities') == []


@pytest.mark.parametrize('domain,rpc,args', [
    ('running','trainer_list_athlete_running_sessions',(A,)),
    ('strength','trainer_list_athlete_strength_sessions',(A,)),
    ('swimming','trainer_list_athlete_swimming_sessions',(A,)),
    ('swimming','trainer_get_athlete_swimming_session',(A,'swim')),
])
def test_real_session_rpc_boundary(db, domain, rpc, args):
    link(db); seed(db)
    assert list_rows(db, rpc, *args) == []
    grant(db, [domain]); assert list_rows(db, rpc, *args)
    assert list_rows(db, rpc, *args, user=T2) == []
    db(f"update public.trainer_athletes set status='inactive';")
    assert list_rows(db, rpc, *args) == []
    assert db('select count(*) from public.trainer_athlete_permissions;') == '0'


def test_overview_filters_before_aggregation_and_routines(db):
    link(db); seed(db); grant(db, ['swimming'])
    row = list_rows(db, 'trainer_get_athlete_overview', A)[0]
    assert all(v is None for v in row['health'].values())
    assert row['active_routines']['swimming']['routine_id'] == 'swimming'
    assert all(row['active_routines'][d] is None for d in ['running','cycling','strength'])
    assert row['recent_training']['last_completed']['routine_id'] == 'swimming'
    assert 'private-running' not in json.dumps(row)
    grant(db, ['health'])
    row = list_rows(db, 'trainer_get_athlete_overview', A)[0]
    assert row['health']['weight_kg'] == 75
    assert row['recent_training']['last_completed'] is None
    assert row['recent_training']['completed_last_7_days'] == 0
    assert all(v is None for v in row['active_routines'].values())


@pytest.mark.parametrize('user', [T, T2, A2, ADMIN])
def test_non_owner_cannot_modify(db, user):
    link(db); grant(db, ['swimming'], user=user, error='42501')
    assert not has(db, 'swimming')


def test_list_ownership_and_invalid_domains(db):
    link(db); grant(db, ['swimming'])
    for user in [T,A]:
        rows = list_rows(db,'list_my_trainer_athlete_connections',user=user)
        assert len(rows) == 1 and rows[0]['domains'] == ['swimming']
    assert list_rows(db,'list_my_trainer_athlete_connections',user=T2) == []
    for domains in [['admin'], ['swimming','swimming']]: grant(db,domains,error='connection_permissions_invalid')
    assert has(db,'swimming')


def test_effective_privileges_no_direct_table_bypass(db):
    link(db)
    for role in ['authenticated','anon']:
        for table in ['trainer_athlete_permissions']:
            for sql in [f'select * from public.{table}', f'delete from public.{table}',
                        f"insert into public.{table} values ('{T}','{A}','running',now())",
                        f"update public.{table} set domain='health'"]:
                db(sql+';',role=role,user=A,error='42501')
        db(f"update public.trainer_athletes set status='active';",role=role,user=A,error='42501')
    call(db,A,'list_my_trainer_athlete_connections',role='anon',error='42501')
    call(db,A,'trainer_has_athlete_domain',A,'health',role='anon',error='42501')
    assert db("select has_schema_privilege('authenticated','aptus_private','USAGE');") == 'f'


@pytest.mark.parametrize('actor', [T,A])
def test_unlink_removes_grants_and_reaccept_does_not_restore(db,actor):
    link(db); grant(db,DOMAINS)
    call(db,actor,'unlink_my_trainer_athlete_connection', A if actor==T else T,stamp(db))
    assert not any(has(db,d) for d in DOMAINS)
    assert list_rows(db,'list_my_trainer_athlete_connections',user=actor) == []
    link(db)
    assert not any(has(db,d) for d in DOMAINS)


def test_concurrent_edits_one_wins_other_conflicts(db):
    link(db); expected=stamp(db); barrier=Barrier(2)
    def edit(domain):
        barrier.wait()
        try: grant(db,[domain],expected=expected); return 'ok'
        except AssertionError as exc:
            assert 'connection_changed' in str(exc); return 'conflict'
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(edit,['running','swimming'])) == ['conflict','ok']
    assert db('select count(*) from public.trainer_athlete_permissions;') == '1'


def test_cascade_cleanup(db):
    link(db); grant(db,DOMAINS)
    db(f"delete from auth.users where id='{A}';")
    assert db('select count(*) from public.trainer_athlete_permissions;') == '0'


def test_external_running_detail_cannot_bypass_domain(db):
    from test_trainer_running_sessions_postgres import add_external
    link(db)
    add_external(db,row_id='external',started_at='2026-09-06T08:00:00Z',ended_at='2026-09-06T09:00:00Z')
    rpc='trainer_get_athlete_running_session'
    assert list_rows(db,rpc,A,'health-connect:external') == []
    grant(db,['swimming']); assert list_rows(db,rpc,A,'health-connect:external') == []
    grant(db,['running']); assert list_rows(db,rpc,A,'health-connect:external')[0]['id'] == 'health-connect:external'
    assert list_rows(db,rpc,A,'health-connect:external',user=T2) == []


@pytest.mark.parametrize('domain', ['swimming','running','cycling','strength'])
def test_assignment_and_direct_assignment_read_require_domain(db,domain):
    link(db)
    data=json.dumps({'discipline':domain,'name':'Template','sessions':[]})
    db(f"insert into public.trainer_routine_templates(id,trainer_id,name,discipline,data) values ('template','{T}','Template','{domain}',{literal(data)});")
    call(db,T,'trainer_assign_routine_template',A,'template','new-routine',error='trainer_domain_not_authorized')
    assert db(f"select count(*) from public.routines where user_id='{A}';") == '0'
    grant(db,[domain]); call(db,T,'trainer_assign_routine_template',A,'template','new-routine')
    assert db('select count(*) from public.trainer_routine_assignments;',role='authenticated',user=T) == '1'
    grant(db,[])
    assert db('select count(*) from public.trainer_routine_assignments;',role='authenticated',user=T) == '0'
    assert db('select count(*) from public.trainer_routine_assignments;',role='authenticated',user=A) == '1'


@pytest.mark.parametrize('user', [A2,T2,ADMIN])
def test_unlink_foreign_relation_is_denied(db,user):
    link(db); grant(db,['swimming'])
    call(db,user,'unlink_my_trainer_athlete_connection',T,stamp(db),error='42501')
    assert has(db,'swimming')


def test_unlink_racing_permission_edit_cannot_resurrect_access(db):
    link(db); grant(db,['swimming']); expected=stamp(db); barrier=Barrier(2)
    def operation(unlink):
        barrier.wait()
        try:
            if unlink: call(db,A,'unlink_my_trainer_athlete_connection',T,expected)
            else: grant(db,['running'],expected=expected)
            return 'ok'
        except AssertionError as exc:
            assert 'connection_changed' in str(exc) or 'connection_not_available' in str(exc)
            return 'conflict'
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(operation,[False,True])) == ['conflict','ok']
    status=db('select status from public.trainer_athletes;')
    if status=='active':
        call(db,A,'unlink_my_trainer_athlete_connection',T,stamp(db))
    assert not any(has(db,d) for d in DOMAINS)
    assert db('select count(*) from public.trainer_athlete_permissions;') == '0'


def test_public_rpc_execution_and_private_schema_boundary(db):
    for signature in ['list_my_trainer_athlete_connections()', 'set_my_trainer_permissions(uuid,text[],timestamp with time zone)',
                      'unlink_my_trainer_athlete_connection(uuid,timestamp with time zone)', 'trainer_has_athlete_domain(uuid,text)']:
        assert db(f"select has_function_privilege('authenticated','public.{signature}','EXECUTE');") == 't'
        assert db(f"select has_function_privilege('anon','public.{signature}','EXECUTE');") == 'f'
        assert db(f"select prosecdef and proconfig @> array['search_path=\"\"'] from pg_proc where oid='public.{signature}'::regprocedure;") == 't'
    for signature in ['trainer_has_active_athlete(uuid)', 'clear_relationship_permissions()']:
        assert db(f"select has_function_privilege('authenticated','aptus_private.{signature}','EXECUTE');") == 'f'


# Real identifiers are fixtures only; production authorization has no UUID exceptions.
REAL_ADMIN_ATHLETE = '5a36255a-582f-4a6f-8dd2-4993720ca2e9'
REAL_TRAINER = 'd06ce5a9-3cf6-40bd-90b1-6a1beb3a06c6'


@pytest.fixture
def admin_pair(db):
    for user, role in [(REAL_ADMIN_ATHLETE, 'admin'), (REAL_TRAINER, 'trainer')]:
        db(f"insert into auth.users values ('{user}');"
           f"insert into public.gymos_users(user_id,role,status) values ('{user}','{role}','active');")
    db(f"insert into public.trainer_athletes(trainer_id,athlete_id) values ('{REAL_TRAINER}','{REAL_ADMIN_ATHLETE}');")
    seed(db)
    # Move fixture data to the real athlete ID without any production special case.
    db(f"delete from public.active_routines; update public.routines set user_id='{REAL_ADMIN_ATHLETE}';"
       f"update public.workouts set user_id='{REAL_ADMIN_ATHLETE}';"
       f"update public.swimming_sessions set user_id='{REAL_ADMIN_ATHLETE}';"
       f"update public.health_weight_entries set user_id='{REAL_ADMIN_ATHLETE}';"
       f"insert into public.active_routines(user_id,routine_id,discipline) select user_id,id,discipline from public.routines;")
    return db


def real_stamp(db):
    return db(f"select updated_at from public.trainer_athletes where trainer_id='{REAL_TRAINER}' and athlete_id='{REAL_ADMIN_ATHLETE}';")


def real_grant(db, domains, error=None):
    return db(f"select public.set_my_trainer_permissions('{REAL_TRAINER}', array[{','.join(literal(d) for d in domains)}]::text[], {literal(real_stamp(db))});",
              role='authenticated',user=REAL_ADMIN_ATHLETE,error=error)


def test_exact_admin_owner_swimming_only_lifecycle(admin_pair):
    db=admin_pair
    assert list_rows(db,'list_my_trainer_athlete_connections',user=REAL_ADMIN_ATHLETE)[0]['athlete_id'] == REAL_ADMIN_ATHLETE
    assert db('select count(*) from public.trainer_athletes;',role='authenticated',user=REAL_ADMIN_ATHLETE) == '1'
    real_grant(db,['swimming'])
    for domain in DOMAINS:
        assert call(db,REAL_TRAINER,'trainer_has_athlete_domain',REAL_ADMIN_ATHLETE,domain) == ('t' if domain=='swimming' else 'f')
        assert call(db,T2,'trainer_has_athlete_domain',REAL_ADMIN_ATHLETE,domain) == 'f'
    assert list_rows(db,'trainer_list_athlete_swimming_sessions',REAL_ADMIN_ATHLETE,user=REAL_TRAINER)
    assert list_rows(db,'trainer_get_athlete_swimming_session',REAL_ADMIN_ATHLETE,'swim',user=REAL_TRAINER)
    for domain in ['running','strength']:
        assert list_rows(db,f'trainer_list_athlete_{domain}_sessions',REAL_ADMIN_ATHLETE,user=REAL_TRAINER) == []
    row=list_rows(db,'trainer_get_athlete_overview',REAL_ADMIN_ATHLETE,user=REAL_TRAINER)[0]
    assert all(v is None for v in row['health'].values())
    assert row['active_routines']['swimming']
    assert all(row['active_routines'][d] is None for d in ['running','strength','cycling'])
    assert row['recent_training']['last_completed']['routine_id']=='swimming'
    assert list_rows(db,'trainer_get_athlete_overview',REAL_ADMIN_ATHLETE,user=T2)==[]
    assert list_rows(db,'trainer_get_athlete_overview',A,user=REAL_ADMIN_ATHLETE)==[]
    assert list_rows(db,'trainer_list_athlete_identities',user=REAL_ADMIN_ATHLETE)==[]
    # Admin ownership never permits managing the other athlete's pair.
    link(db)
    call(db,REAL_ADMIN_ATHLETE,'set_my_trainer_permissions',T,'{health}',stamp(db),error='connection_not_available')
    call(db,REAL_ADMIN_ATHLETE,'unlink_my_trainer_athlete_connection',T,stamp(db),error='connection_not_available')
    real_grant(db,[])
    assert list_rows(db,'trainer_list_athlete_swimming_sessions',REAL_ADMIN_ATHLETE,user=REAL_TRAINER)==[]
    real_grant(db,['swimming'])
    call(db,REAL_ADMIN_ATHLETE,'unlink_my_trainer_athlete_connection',REAL_TRAINER,real_stamp(db))
    assert db(f"select count(*) from public.trainer_athlete_permissions where athlete_id='{REAL_ADMIN_ATHLETE}';")=='0'
    call(db,REAL_TRAINER,'set_my_connection_contact_code','b'*64)
    invitation=call(db,REAL_ADMIN_ATHLETE,'athlete_create_trainer_invitation','b'*64,'c'*64)
    transition(db,REAL_TRAINER,invitation)
    assert list_rows(db,'list_my_trainer_athlete_connections',user=REAL_ADMIN_ATHLETE)[0]['domains']==[]
    assert call(db,REAL_TRAINER,'trainer_has_athlete_domain',REAL_ADMIN_ATHLETE,'swimming')=='f'


@pytest.mark.parametrize('change',["status='suspended'", "expires_at=now()-interval '1 day'"])
def test_exact_admin_ineligible_denied(admin_pair,change):
    db=admin_pair;real_grant(db,['swimming'])
    db(f"update public.gymos_users set {change} where user_id='{REAL_ADMIN_ATHLETE}';")
    real_grant(db,[],error='connection_actor_not_authorized')
    call(db,REAL_ADMIN_ATHLETE,'list_my_trainer_athlete_connections',error='connection_actor_not_authorized')
    call(db,REAL_ADMIN_ATHLETE,'unlink_my_trainer_athlete_connection',REAL_TRAINER,real_stamp(db),error='connection_actor_not_authorized')
    assert list_rows(db,'trainer_list_athlete_swimming_sessions',REAL_ADMIN_ATHLETE,user=REAL_TRAINER)==[]


@pytest.mark.parametrize('action',['accept','reject','revoke'])
def test_exact_admin_invitation_actions(admin_pair,action):
    db=admin_pair
    call(db,REAL_ADMIN_ATHLETE,'unlink_my_trainer_athlete_connection',REAL_TRAINER,real_stamp(db))
    call(db,REAL_ADMIN_ATHLETE,'set_my_connection_contact_code','a'*64)
    call(db,REAL_TRAINER,'set_my_connection_contact_code','b'*64)
    if action=='revoke':
        invitation=call(db,REAL_ADMIN_ATHLETE,'athlete_create_trainer_invitation','b'*64,'d'*64)
    else:
        invitation=call(db,REAL_TRAINER,'trainer_create_athlete_invitation','a'*64,'d'*64)
    assert list_rows(db,'list_my_received_trainer_athlete_invitations' if action!='revoke' else 'list_my_sent_trainer_athlete_invitations',user=REAL_ADMIN_ATHLETE)
    transition(db,REAL_ADMIN_ATHLETE,invitation,action)
    call(db,REAL_ADMIN_ATHLETE,'trainer_create_athlete_invitation','a'*64,'e'*64,error='connection_actor_not_authorized')


@pytest.mark.parametrize('action,inviter', [('revoke',REAL_ADMIN_ATHLETE),('reject',A),('accept',A)])
def test_admin_cannot_act_on_historic_trainer_side(admin_pair,action,inviter):
    db=admin_pair
    invitation=db(f"insert into public.trainer_athlete_invitations(trainer_id,athlete_id,inviter_id,token_hash,status,expires_at) "
                  f"values ('{REAL_ADMIN_ATHLETE}','{A}','{inviter}',repeat('f',64),'pending',now()+interval '7 days') returning id;")
    box='sent' if action=='revoke' else 'received'
    assert list_rows(db,f'list_my_{box}_trainer_athlete_invitations',user=REAL_ADMIN_ATHLETE)==[]
    transition(db,REAL_ADMIN_ATHLETE,invitation,action,error='invitation_not_available')


PROTECTED_HISTORICAL_SQL = [
    'trainer-athlete-strength-sessions.sql',
    'trainer-athlete-swimming-sessions.sql',
    'trainer-athlete-swimming-session-detail.sql',
    'trainer-athlete-running-sessions.sql',
    'trainer-athlete-running-session-detail.sql',
    'trainer-athlete-identities.sql',
    'trainer-athlete-overview.sql',
    'trainer-routine-assignments.sql',
    'trainer-athletes.sql',
    'trainer-athlete-invitations.sql',
]


def authorization_snapshot(db):
    # Include OIDs/ACLs as well as definitions: DROP/recreate must not go unnoticed.
    return db("""
      select jsonb_build_object(
        'functions', (select jsonb_agg(jsonb_build_array(p.oid, p.proacl,
            pg_get_functiondef(p.oid)) order by p.oid)
          from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname in ('public','aptus_private') and p.prokind='f'),
        'policies', (select jsonb_agg(to_jsonb(p) order by p.oid) from pg_policy p),
        'tables', (select jsonb_agg(jsonb_build_array(c.oid,c.relacl,
            c.relrowsecurity,c.relforcerowsecurity) order by c.oid)
          from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname in ('public','aptus_private') and c.relkind='r'),
        'relationships', (select jsonb_agg(to_jsonb(r) order by trainer_id,athlete_id)
          from public.trainer_athletes r),
        'permissions', (select jsonb_agg(to_jsonb(p) order by trainer_id,athlete_id,domain)
          from public.trainer_athlete_permissions p)
      );
    """)


def assert_swimming_only(db):
    assert {domain: has(db, domain) for domain in DOMAINS} == {
        domain: domain == 'swimming' for domain in DOMAINS
    }
    assert list_rows(db, 'trainer_list_athlete_swimming_sessions', A)
    assert list_rows(db, 'trainer_get_athlete_swimming_session', A, 'swim')
    for domain in ('running', 'strength'):
        assert list_rows(db, f'trainer_list_athlete_{domain}_sessions', A) == []
    overview = list_rows(db, 'trainer_get_athlete_overview', A)[0]
    assert all(value is None for value in overview['health'].values())
    assert overview['active_routines']['swimming']
    assert all(overview['active_routines'][d] is None for d in ('running','strength','cycling'))
    assert overview['recent_training']['last_completed']['routine_id'] == 'swimming'


@pytest.mark.parametrize('filename', PROTECTED_HISTORICAL_SQL)
def test_historical_reapply_fails_without_changing_authorization(db, filename):
    link(db)
    seed(db)
    grant(db, ['swimming'])
    assert_swimming_only(db)
    before = authorization_snapshot(db)
    script = (SQL_DIR / filename).read_text()
    db(script, error='trainer_permissions_installed: historical trainer SQL cannot be reapplied')
    assert authorization_snapshot(db) == before
    assert_swimming_only(db)
    # psql normally stops on error in this fixture. Also exercise clients which
    # continue: the explicit transaction must reject ALL remaining statements.
    output = db('\\set ON_ERROR_STOP off\n' + script + "\nselect 'client_continued';")
    assert 'client_continued' in output
    assert authorization_snapshot(db) == before
    assert_swimming_only(db)
