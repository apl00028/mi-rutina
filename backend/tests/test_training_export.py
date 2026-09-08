import asyncio
import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.core.auth import AuthenticatedUser, require_user
from app.domains.workouts import export


def row(id, data, **extra):
    return {'id': id, 'user_id': 'own', 'data': data, **extra}


@pytest.fixture
def api(monkeypatch):
    app = FastAPI(); app.include_router(export.router)
    app.dependency_overrides[require_user] = lambda: AuthenticatedUser(id='own', role='user', access_token='own-token')
    state = {'tables': {name: [] for name in export.TABLES}, 'requests': []}
    def handle(request):
        state['requests'].append(request)
        assert request.headers['authorization'] == 'Bearer own-token'
        assert request.headers['apikey'] == 'publishable'
        assert request.url.params['user_id'] == 'eq.own'
        if state.get('fail'): return httpx.Response(500, json={'detail': 'private-secret'})
        rows = state['tables'][request.url.path.rsplit('/', 1)[-1]]
        cursor = request.url.params.get('id', 'gt.')[3:]
        # Simulate a server page cap smaller than the requested limit.
        return httpx.Response(200, json=[r for r in rows if r['id'] > cursor][:1])
    upstream = httpx.AsyncClient(transport=httpx.MockTransport(handle))
    monkeypatch.setattr(export, '_supabase_config', lambda: ('https://supabase.test','publishable'))
    monkeypatch.setattr(export, 'get_supabase_http_client', lambda: upstream)
    with TestClient(app) as client: yield client, state, app
    asyncio.run(upstream.aclose())


def test_all_disciplines_and_original_details_across_pages(api):
    client,state,_ = api
    for i,d in enumerate(('strength','running','swimming','cycling')):
        state['tables']['routines'].append(row(str(i), {'name':d}, discipline=d))
        state['tables']['workouts'].append(row(str(i), {'status':'finished','routineId':str(i), 'sets':[{'weight':0,'reps':None,'setType':'warmup'}]}))
    state['tables']['workouts'].append(row('9', {'status':'active'}))
    swim = {'laps':[{'stroke':'freestyle','duration_seconds':30}], 'pace_seconds_per_100m_from_speed':100, 'distance_meters':None}
    run = {'distance_meters':0,'heart_rate_average_bpm':None}
    state['tables']['swimming_sessions']=[row('s',swim,source='garmin_fit',started_at='2026-09-07T23:30:00+02:00')]
    state['tables']['running_sessions']=[row('r',run,source='health_connect',source_record_id='native-id')]
    response=client.get('/training/export?user_id=other'); assert response.status_code==200
    result=response.json(); assert result['count']==6
    assert {r['discipline'] for r in result['sessions']}=={'strength','running','swimming','cycling'}
    assert result['sessions'][0]['data']['sets'][0]['weight']==0
    assert result['sessions'][-2]['data']==swim
    assert result['sessions'][-2]['started_at']=='2026-09-07T23:30:00+02:00'
    assert result['sessions'][-1]['data']==run
    assert 'speed_average_meters_per_second' not in result['sessions'][-1]['data']
    assert all('user_id' not in r for r in result['sessions'])


def test_empty(api):
    client,_,_=api
    assert client.get('/training/export').json()['sessions']==[]


def test_unknown_discipline_is_not_invented(api):
    client,state,_=api
    state['tables']['workouts']=[row('x',{'status':'finished','routineId':'deleted'})]
    assert client.get('/training/export').json()['sessions'][0]['discipline'] is None


@pytest.mark.parametrize('failure',['upstream','ownership'])
def test_fail_closed_without_partial_export_or_private_error(api,failure):
    client,state,_=api
    if failure=='upstream': state['fail']=True
    else: state['tables']['running_sessions']=[row('r',{},user_id='other')]
    response=client.get('/training/export')
    assert response.status_code==502
    assert 'private-secret' not in response.text
    assert 'sessions' not in response.json()


def test_unauthenticated_denied(api):
    client,state,app=api;app.dependency_overrides.clear()
    assert client.get('/training/export').status_code in (401,403)
    assert not state['requests']
