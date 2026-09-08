import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

interface TrainingExport { schema_version: number; generated_at: string; count: number; sessions: unknown[]; }

@Injectable({providedIn: 'root'})
export class TrainingExportService {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly error = signal('');

  async download(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.message.set(''); this.error.set('');
    const userId = this.auth.user()?.id;
    try {
      const token = await this.auth.getAccessToken();
      if (!userId || !token || this.auth.user()?.id !== userId) throw new Error('auth');
      const result = await firstValueFrom(this.http.get<TrainingExport>(`${environment.apiUrl}/training/export`, {
        headers: new HttpHeaders({Authorization: `Bearer ${token}`}),
      }));
      if (this.auth.user()?.id !== userId) throw new Error('auth');
      if (!result.count) { this.message.set('No tienes entrenamientos guardados para exportar.'); return; }
      const filename = `aptus-entrenamientos-${result.generated_at.slice(0, 10)}.json`;
      const data = JSON.stringify(result, null, 2);
      if (Capacitor.isNativePlatform()) {
        const file = await Filesystem.writeFile({path: filename, data, encoding: Encoding.UTF8, directory: Directory.Cache, recursive: true});
        if (this.auth.user()?.id !== userId) {
          await Filesystem.deleteFile({path: filename, directory: Directory.Cache});
          throw new Error('auth');
        }
        await Share.share({title: 'Aptus · Historial de entrenamiento', url: file.uri, dialogTitle: 'Guardar o compartir historial'});
        this.message.set('Historial preparado para guardar o compartir.');
      } else {
        const url = URL.createObjectURL(new Blob([data], {type: 'application/json;charset=utf-8'}));
        const anchor = document.createElement('a');
        anchor.href = url; anchor.download = filename; document.body.appendChild(anchor);
        try { anchor.click(); } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
        this.message.set('Descarga del historial iniciada.');
      }
    } catch { this.error.set('No se pudo exportar el historial. Comprueba tu sesión y vuelve a intentarlo.'); }
    finally { this.busy.set(false); }
  }
}
