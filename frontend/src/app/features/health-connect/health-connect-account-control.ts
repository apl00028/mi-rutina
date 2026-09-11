import {
  Component,
  OnInit,
  signal
} from '@angular/core';

import {
  Capacitor
} from '@capacitor/core';

import {
  HealthConnect,
  hasSwimmingHealthConnectPermissions
} from '../../core/health-connect.plugin';

import {
  HealthConnectAccountService
} from '../../core/health-connect-account.service';


@Component({
  selector:
    'app-health-connect-account-control',

  standalone: true,

  template: `
    <section class="hc-account">
      <strong>
        Conexión de esta cuenta
      </strong>

      @if (loading()) {
        <small>
          Comprobando conexión…
        </small>
      } @else if (!supported()) {
        <small>
          Health Connect solo está disponible
          en Android compatible.
        </small>
      } @else if (connected()) {
        <p class="ok">
          Conectado a esta cuenta de Aptus.
        </p>

        <button
          type="button"
          class="disconnect"
          [disabled]="busy()"
          (click)="disconnect()"
        >
          Desconectar Health Connect
        </button>
      } @else {
        <p>
          No conectado a esta cuenta.
          Los permisos Android de otra cuenta
          no activan la sincronización.
        </p>

        <button
          type="button"
          [disabled]="busy()"
          (click)="connect()"
        >
          @if (busy()) {
            Conectando…
          } @else {
            Conectar Health Connect
          }
        </button>
      }

      @if (message()) {
        <p class="ok">
          {{ message() }}
        </p>
      }

      @if (error()) {
        <p class="error">
          {{ error() }}
        </p>
      }
    </section>
  `,

  styles: [`
    .hc-account {
      display: grid;
      gap: .65rem;
      padding: 1rem;
      margin-bottom: 1rem;
      border: 1px solid
        rgba(148, 163, 184, .28);
      border-radius: .9rem;
    }

    button {
      min-height: 44px;
      border: 0;
      border-radius: .75rem;
      padding: .75rem 1rem;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
      background: #16877d;
      color: white;
    }

    button:disabled {
      opacity: .6;
      cursor: default;
    }

    .disconnect {
      background: transparent;
      border: 1px solid
        rgba(248, 113, 113, .55);
      color: #fca5a5;
    }

    p, small {
      margin: 0;
    }

    .ok {
      color: #6ee7b7;
    }

    .error {
      color: #fca5a5;
    }
  `]
})
export class HealthConnectAccountControl
  implements OnInit {

  readonly loading =
    signal(true);

  readonly busy =
    signal(false);

  readonly connected =
    signal(false);

  readonly supported =
    signal(false);

  readonly message =
    signal<string | null>(null);

  readonly error =
    signal<string | null>(null);


  constructor(
    private account:
      HealthConnectAccountService
  ) {}


  async ngOnInit(): Promise<void> {

    const supported =
      Capacitor.isNativePlatform()
      && Capacitor.getPlatform() ===
        'android';

    this.supported.set(
      supported
    );

    if (!supported) {
      this.loading.set(false);
      return;
    }

    try {
      this.connected.set(
        await this.account.enabled(
          true
        )
      );
    } catch {
      this.connected.set(false);
    } finally {
      this.loading.set(false);
    }
  }


  async connect(): Promise<void> {
    if (this.busy()) {
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    this.message.set(null);

    try {
      const availability =
        await HealthConnect
          .isAvailable();

      if (!availability.supported) {
        throw new Error(
          'Health Connect no está disponible.'
        );
      }

      let permissions =
        await HealthConnect
          .permissionStatus();

      if (
        !hasSwimmingHealthConnectPermissions(
          permissions
        )
      ) {
        await HealthConnect
          .openPermissions();

        permissions =
          await HealthConnect
            .permissionStatus();
      }

      if (
        !hasSwimmingHealthConnectPermissions(
          permissions
        )
      ) {
        throw new Error(
          'Faltan permisos de ejercicio, '
          + 'distancia, velocidad o frecuencia '
          + 'cardiaca.'
        );
      }

      await this.account.connect();

      this.connected.set(true);

      this.message.set(
        'Health Connect queda conectado '
        + 'solo a esta cuenta de Aptus.'
      );

    } catch (error) {
      this.error.set(
        error instanceof Error
          ? error.message
          : 'No se pudo conectar Health Connect.'
      );
    } finally {
      this.busy.set(false);
    }
  }


  async disconnect(): Promise<void> {
    if (this.busy()) {
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    this.message.set(null);

    try {
      await this.account.disconnect();

      this.connected.set(false);

      this.message.set(
        'Health Connect se ha desconectado '
        + 'de esta cuenta. Los permisos Android '
        + 'no se han revocado.'
      );

    } catch {
      this.error.set(
        'No se pudo desconectar Health Connect.'
      );
    } finally {
      this.busy.set(false);
    }
  }
}
