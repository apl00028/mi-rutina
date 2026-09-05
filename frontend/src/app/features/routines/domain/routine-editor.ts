/** Persistence is supplied by the caller; the existing athlete forms own editing/validation. */
export interface RoutineDocument {
  routineId: string;
  schemaVersion: string;
  revision: number;
  discipline?: string;
  name?: string;
  sessions: any[];
  createdAt?: string;
  updatedAt?: string;
}

export interface RoutineEditorContext {
  routine: RoutineDocument;
  mode: 'create' | 'edit' | 'import';
  saveLabel: string;
  save: (routine: RoutineDocument) => Promise<void>;
  cancel: () => void;
}

export function copyRoutine(routine: RoutineDocument): RoutineDocument {
  const copy = structuredClone(routine);
  copy.routineId = `routine-${crypto.randomUUID()}`;
  copy.revision = 1;
  copy.createdAt = copy.updatedAt = new Date().toISOString();
  // Exercise IDs refer to the catalogue. Session/block IDs belong to this copy.
  for (const session of copy.sessions) {
    session.sessionId = crypto.randomUUID();
    for (const block of session.blocks ?? []) block.id = crypto.randomUUID();
  }
  return copy;
}

export function newRoutine(discipline: 'strength' | 'swimming' | 'running'): RoutineDocument {
  return {
    routineId: `routine-${crypto.randomUUID()}`,
    schemaVersion: '4.2', revision: 1, discipline, name: '',
    sessions: [newRoutineSession(discipline)],
  };
}

export function newRoutineSession(discipline: string): RoutineDocument['sessions'][number] {
  const session = { sessionId: crypto.randomUUID(), name: 'Sesión A' };
  if (discipline === 'strength') return { ...session, exercises: [] };
  const set = discipline === 'swimming'
    ? { repetitions: 1, distanceMeters: 50, stroke: 'freestyle', workType: 'swim', intensity: 'easy', restSeconds: 20 }
    : { repetitions: 1, targetType: 'duration', durationSeconds: 600, intensityMode: 'free', recoverySeconds: 0 };
  return {
    ...session, title: session.name, date: '', objective: '', estimatedDurationMinutes: 0,
    ...(discipline === 'swimming' ? { poolLengthMeters: 25, technicalFocus: [] } : {}),
    blocks: [{ id: crypto.randomUUID(), type: 'main', title: 'Principal', sets: [set] }],
  };
}
