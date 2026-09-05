import { Component, Input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Capacitor } from '@capacitor/core';
import {
  Directory,
  Encoding,
  Filesystem
} from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Routines } from '../../../../pages/routines/routines';
import { Endurance } from '../../../../pages/endurance/endurance';
import { copyRoutine, newRoutineSession, RoutineDocument, RoutineEditorContext } from '../../domain/routine-editor';
import { parseRunningRoutine } from '../../domain/running-routine-import';

/** Hosts the existing forms. No HTTP or athlete persistence belongs here. */
@Component({
  selector: 'app-routine-editor', standalone: true,
  imports: [FormsModule, Routines, Endurance],
  templateUrl: './routine-editor.html', styleUrl: './routine-editor.scss',
})
export class RoutineEditor implements OnInit {
  @Input({ required: true }) context!: RoutineEditorContext;
  document = signal<RoutineDocument | null>(null);
  sessionContext = signal<RoutineEditorContext | null>(null);
  name = signal('');
  importText = signal('');
  error = signal<string | null>(null);
  saving = signal(false);

  ngOnInit(): void {
    this.document.set(structuredClone(this.context.routine));
    this.name.set(this.context.routine.name ?? '');
    if (this.context.mode !== 'import' && this.context.routine.discipline !== 'strength') this.editSession(0);
  }

  importJson(): void {
    this.error.set(null);
    try {
      const routine = copyRoutine(parseRunningRoutine(this.importText().trim()));
      // The destination identity is stable across retries.
      routine.routineId = this.context.routine.routineId;
      this.document.set(routine);
      this.name.set(routine.name ?? '');
      this.importText.set('');
      this.importReady.set(true);
    } catch (error) {
      this.error.set((error as Error).message);
    }
  }

  importReady = signal(false);
  runningCopyMessage = signal<string | null>(null);

  private runningRoutineExample(): RoutineDocument {
    return {
      routineId: 'routine-example',
      schemaVersion: '4.2',
      revision: 1,
      discipline: 'running',
      name: 'Rutina de carrera',
      sessions: [
        {
          sessionId: 'session-example',
          name: 'Sesión 1',
          title: 'Sesión 1',
          date: '',
          objective: '',
          estimatedDurationMinutes: 30,
          blocks: [
            {
              id: 'block-warmup',
              type: 'warmup',
              title: 'Calentamiento',
              sets: [
                {
                  repetitions: 1,
                  targetType: 'duration',
                  durationSeconds: 600,
                  intensityMode: 'free',
                  recoverySeconds: 0,
                },
              ],
            },
            {
              id: 'block-main',
              type: 'main',
              title: 'Principal',
              sets: [
                {
                  repetitions: 3,
                  targetType: 'distance',
                  distanceMeters: 800,
                  intensityMode: 'free',
                  recoverySeconds: 120,
                },
              ],
            },
          ],
        },
      ],
    };
  }

  async downloadRunningRoutineExample(): Promise<void> {
    this.error.set(null);

    const json =
      JSON.stringify(
        this.runningRoutineExample(),
        null,
        2
      );

    const filename =
      'aptus_ejemplo_rutina_carrera.json';

    try {
      if (!Capacitor.isNativePlatform()) {
        const blob =
          new Blob(
            [json],
            {
              type: 'application/json'
            }
          );

        const url =
          URL.createObjectURL(blob);

        const anchor =
          document.createElement('a');

        anchor.href = url;
        anchor.download = filename;

        document.body.appendChild(
          anchor
        );

        anchor.click();

        document.body.removeChild(
          anchor
        );

        URL.revokeObjectURL(url);

        return;
      }

      const result =
        await Filesystem.writeFile({
          path: filename,
          data: json,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
          recursive: true
        });

      await Share.share({
        title:
          'Aptus · Ejemplo de rutina de carrera',
        text:
          'Ejemplo JSON compatible con el importador de rutinas de carrera de Aptus',
        url:
          result.uri,
        dialogTitle:
          'Compartir ejemplo'
      });
    } catch {
      this.error.set(
        'No se pudo generar o compartir el ejemplo JSON.'
      );
    }
  }

  private runningChatGPTPrompt(): string {
    return `Quiero que generes una rutina de carrera compatible con Aptus.

Devuélveme ÚNICAMENTE JSON válido.
No uses Markdown.
No añadas explicaciones fuera del JSON.

Usa exactamente este contrato:

- routineId: string
- schemaVersion: "4.2"
- revision: número finito
- discipline: "running"
- name: string opcional
- sessions: array con al menos una sesión

Cada sesión debe incluir:
- sessionId: string
- title: string
- blocks: array con al menos un bloque

También puede incluir:
- name
- date
- objective
- estimatedDurationMinutes

Cada bloque debe incluir:
- id: string
- type: "warmup" | "main" | "intervals" | "sprints" | "cooldown"
- title: string
- sets: array con al menos una prescripción

Cada set debe incluir:
- repetitions: número mayor que 0
- targetType: "duration" o "distance"
- intensityMode: "heartRateMax" | "heartRateRange" | "rpeRange" | "paceRange" | "sprint" | "free"

Si targetType es "duration":
- durationSeconds debe ser un número mayor que 0

Si targetType es "distance":
- distanceMeters debe ser un número mayor que 0

Campos opcionales del set:
- heartRateMaxBpm
- heartRateMinBpm
- heartRateMaxRangeBpm
- rpeMin
- rpeMax
- paceMinSecondsPerKm
- paceMaxSecondsPerKm
- recoverySeconds
- instruction

No inventes otros valores para targetType, intensityMode o type.

El JSON debe poder pasar directamente por el importador de Aptus sin transformaciones.

OBJETIVO Y CONTEXTO DEL DEPORTISTA

[Escribe aquí el objetivo, nivel, disponibilidad, limitaciones y contexto necesario.]
`;
  }

  async copyRunningChatGPTInstructions(): Promise<void> {
    this.runningCopyMessage.set(null);
    this.error.set(null);

    const text =
      this.runningChatGPTPrompt();

    try {
      if (
        navigator.clipboard?.writeText
      ) {
        await navigator.clipboard.writeText(
          text
        );
      } else {
        const textarea =
          document.createElement(
            'textarea'
          );

        textarea.value = text;
        textarea.setAttribute(
          'readonly',
          ''
        );
        textarea.style.position =
          'fixed';
        textarea.style.opacity =
          '0';

        document.body.appendChild(
          textarea
        );

        textarea.select();

        const copied =
          document.execCommand(
            'copy'
          );

        document.body.removeChild(
          textarea
        );

        if (!copied) {
          throw new Error(
            'No se pudo copiar.'
          );
        }
      }

      this.runningCopyMessage.set(
        'Instrucciones copiadas.'
      );
    } catch {
      this.error.set(
        'No se pudieron copiar las instrucciones.'
      );
    }
  }


  async readJson(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      this.importText.set(await file.text());
      this.importJson();
    } catch {
      this.error.set('No se pudo leer el archivo.');
    } finally { input.value = ''; }
  }

  sessionTitle(session: RoutineDocument['sessions'][number], index: number): string {
    return session.title || session.name || `Sesión ${index + 1}`;
  }

  editSession(index: number): void {
    if (this.saving()) return;
    const routine = this.document()!;
    this.sessionContext.set({
      routine: { ...structuredClone(routine), sessions: [structuredClone(routine.sessions[index])] },
      mode: 'edit', saveLabel: 'Aplicar sesión',
      cancel: () => this.sessionContext.set(null),
      save: async (edited) => {
        this.document.update(current => ({ ...current!, sessions: current!.sessions.map((session, i) =>
          i === index ? { ...edited.sessions[0], name: edited.sessions[0].title } : session) }));
        this.sessionContext.set(null);
      },
    });
  }

  addSession(): void {
    const routine = this.document()!;
    const session = newRoutineSession(routine.discipline!);
    session.name = session.title = `Sesión ${routine.sessions.length + 1}`;
    this.document.set({ ...routine, sessions: [...routine.sessions, session] });
    this.editSession(routine.sessions.length);
  }

  removeSession(index: number): void {
    if (this.document()!.sessions.length <= 1 || this.saving()) return;
    this.document.update(routine => ({ ...routine!, sessions: routine!.sessions.filter((_, i) => i !== index) }));
  }

  async save(): Promise<void> {
    if (this.saving() || this.sessionContext()) return;
    this.error.set(null);
    if (!this.name().trim()) { this.error.set('Indica un nombre para la plantilla.'); return; }
    this.saving.set(true);
    try {
      await this.context.save({ ...this.document()!, name: this.name().trim(),
        revision: this.context.routine.revision + (this.context.mode === 'edit' ? 1 : 0),
        updatedAt: new Date().toISOString() });
    } catch (error) { this.error.set((error as Error).message); }
    finally { this.saving.set(false); }
  }
}
