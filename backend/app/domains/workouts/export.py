"""Lossless export of the authenticated user's persisted training history."""
import asyncio
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response

from app.core.auth import AuthenticatedUser, require_user
from app.core.http_client import get_supabase_http_client
from app.domains.exercises.custom_repository import _supabase_config, SupabaseConfigError

router = APIRouter(tags=['Training export'])
TABLES = ('workouts', 'routines', 'swimming_sessions', 'running_sessions')


async def read_all(user: AuthenticatedUser, table: str) -> list[dict]:
    # Keyset pagination also works when PostgREST caps pages below the requested size.
    url, key = _supabase_config()
    rows = []
    cursor = None
    while True:
        params = {'user_id': f'eq.{user.id}', 'order': 'id.asc', 'limit': '500'}
        if cursor is not None:
            params['id'] = f'gt.{cursor}'
        response = await get_supabase_http_client().get(
            f'{url}/rest/v1/{table}', params=params,
            headers={'Authorization': f'Bearer {user.access_token}', 'apikey': key},
        )
        response.raise_for_status()
        page = response.json()
        if not isinstance(page, list) or any(
            not isinstance(row, dict) or row.get('user_id') != user.id
            or not isinstance(row.get('id'), str) or not isinstance(row.get('data'), dict)
            for row in page
        ):
            raise RuntimeError('Invalid export source')
        if not page:
            return rows
        if page[-1]['id'] == cursor:
            raise RuntimeError('Export pagination did not advance')
        rows.extend(page)
        cursor = page[-1]['id']


def build_export(tables: dict[str, list[dict]]) -> dict:
    routines = {row['id']: row for row in tables['routines']}
    records = []
    for row in tables['workouts']:
        data = row['data']
        if data.get('status') != 'finished':
            continue
        routine = routines.get(data.get('routineId'))
        discipline = routine.get('discipline') if routine else None
        if not discipline and routine:
            discipline = routine['data'].get('discipline')
        records.append({
            'discipline': discipline, 'source_table': 'workouts', 'source': 'aptus',
            'id': row['id'], 'started_at': data.get('startedAt'),
            'ended_at': data.get('finishedAt'), 'data': data,
            'routine': routine['data'] if routine else None,
        })
    for table, discipline in [('swimming_sessions', 'swimming'), ('running_sessions', 'running')]:
        for row in tables[table]:
            records.append({
                'discipline': discipline, 'source_table': table,
                **{key: value for key, value in row.items() if key != 'user_id'},
            })
    return {
        'schema_version': 1,
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'scope': 'persisted_finished_workouts_and_external_sessions',
        'notes': [
            'Original source data is preserved, including null and absent fields; no metrics are recalculated.',
            'Timestamps retain their stored offset. Legacy timestamps without an offset have unknown timezone.',
            'Discipline is null when the associated routine cannot establish it.',
            'Routines are planning context, not observed performance. Health Connect data not yet persisted is excluded.',
            'Separate source records are preserved; no cross-source identity is inferred from timestamps or metrics.',
        ],
        'units': {'workout_weight': 'kg', 'workout_duration_and_rest': 's',
                  'distance_meters': 'm', 'duration_seconds': 's',
                  'heart_rate_bpm': 'beats/min', 'speed_meters_per_second': 'm/s',
                  'pace_seconds_per_100m': 's/100m', 'pace_seconds_per_100m_from_speed': 's/100m (derived from speed)'},
        'count': len(records), 'sessions': records,
    }


@router.get('/training/export')
async def export_training(response: Response, user: AuthenticatedUser = Depends(require_user)):
    response.headers['Cache-Control'] = 'no-store'
    try:
        pages = await asyncio.gather(*(read_all(user, table) for table in TABLES))
        return build_export(dict(zip(TABLES, pages)))
    except SupabaseConfigError:
        raise HTTPException(503, 'La exportación no está disponible.') from None
    except (httpx.HTTPError, RuntimeError, ValueError):
        raise HTTPException(502, 'No se pudo recuperar el historial completo. Inténtalo de nuevo.') from None
