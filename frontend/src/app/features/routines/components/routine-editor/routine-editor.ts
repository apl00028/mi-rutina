import { Component, Input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
