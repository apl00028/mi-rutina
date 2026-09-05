import { RunningRoutineBlock, RunningRoutineSet } from '../../running/domain/running-routine';
import { RoutineDocument } from './routine-editor';

/** The existing Health OS running JSON contract, shared by both save destinations. */
export function parseRunningRoutine(raw: string): RoutineDocument {
    if (!raw) {

      throw new Error('Pega primero una rutina de Health OS.'
      );
    }


    let routine:
      RoutineDocument;


    try {

      routine =
        JSON.parse(raw) as RoutineDocument;

    } catch {

      throw new Error('El JSON de la rutina no es válido.'
      );
    }


    if (
      !routine
      || typeof routine !== 'object'
      || !routine.routineId
      || !routine.schemaVersion
      || !Number.isFinite(
        routine.revision
      )
      || routine.discipline !==
        'running'
      || !Array.isArray(
        routine.sessions
      )
      || routine.sessions.length === 0
    ) {

      throw new Error('La rutina no tiene el formato esperado para carrera.'
      );
    }


    for (const session of routine.sessions) {


    if (
      !session
      || !session.sessionId
      || !session.title
      || !Array.isArray(
        session.blocks
      )
      || session.blocks.length === 0
    ) {

      throw new Error('La rutina necesita al menos una sesión de carrera con bloques.'
      );
    }


    const invalidBlock =
      session.blocks.some(
        (block: RunningRoutineBlock) =>
          !block
          || !block.id
          || !block.title
          || !Array.isArray(
            block.sets
          )
          || block.sets.length === 0
      );


    if (invalidBlock) {

      throw new Error('Cada bloque debe contener al menos una prescripción.'
      );
    }


    const invalidSet =
      session.blocks.some(
        (block: RunningRoutineBlock) =>
          block.sets.some(
            (set: RunningRoutineSet) => {

              if (
                !set
                || !Number.isFinite(
                  set.repetitions
                )
                || set.repetitions <= 0
              ) {
                return true;
              }


              if (
                set.targetType ===
                  'duration'
              ) {

                return (
                  set.durationSeconds == null
                  || !Number.isFinite(
                    set.durationSeconds
                  )
                  || set.durationSeconds <= 0
                );
              }


              if (
                set.targetType ===
                  'distance'
              ) {

                return (
                  set.distanceMeters == null
                  || !Number.isFinite(
                    set.distanceMeters
                  )
                  || set.distanceMeters <= 0
                );
              }


              return true;
            }
          )
      );


    if (invalidSet) {

      throw new Error('Hay una prescripción de carrera no válida.'
      );
    }


    }
    return routine;
}
