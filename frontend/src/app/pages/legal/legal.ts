import {
  Component,
  input
} from '@angular/core';

import {
  RouterLink
} from '@angular/router';


@Component({
  selector: 'app-legal-page',
  standalone: true,
  imports: [
    RouterLink
  ],
  template: `
    <main class="legal-page">
      <a
        class="legal-back"
        routerLink="/login"
      >
        Aptus
      </a>

      @if (page() === 'privacy') {
        <article>
          <h1>Política de privacidad de Aptus</h1>

          <p>
            Última actualización: 26 de agosto de 2026.
          </p>

          <h2>1. Qué datos puede tratar Aptus</h2>

          <p>
            Aptus puede tratar los datos que introduces
            voluntariamente en la aplicación, incluidos datos
            de cuenta, rutinas, entrenamientos, nutrición,
            peso, composición corporal, medidas corporales
            y recuperación.
          </p>

          <h2>2. Datos de Health Connect</h2>

          <p>
            En dispositivos Android compatibles, y únicamente
            después de que concedas los permisos correspondientes,
            Aptus puede leer desde Health Connect:
          </p>

          <ul>
            <li>pasos;</li>
            <li>sesiones de ejercicio;</li>
            <li>frecuencia cardiaca en reposo;</li>
            <li>sesiones y duración del sueño;</li>
            <li>peso corporal;</li>
            <li>porcentaje de grasa corporal.</li>
          </ul>

          <p>
            Aptus solicita únicamente permisos de lectura de
            Health Connect. No escribe ni modifica datos en
            Health Connect.
          </p>

          <p>
            En la versión actual de Aptus, los datos leídos desde
            Health Connect se utilizan para mostrarlos dentro de
            la aplicación y no se envían al backend de Aptus ni
            se almacenan en la cuenta del usuario.
          </p>

          <p>
            Los permisos de Health Connect pueden concederse,
            revisarse o retirarse desde los ajustes del dispositivo
            en cualquier momento.
          </p>

          <h2>3. Para qué utilizamos los datos</h2>

          <p>
            Los datos almacenados en Aptus se utilizan para
            proporcionar las funciones de la aplicación, gestionar
            tu cuenta, registrar y analizar entrenamientos,
            rutinas, nutrición y métricas de salud, y mostrar
            evolución y tendencias.
          </p>

          <p>
            Aptus no utiliza los datos de Health Connect para
            publicidad ni para vender información personal.
          </p>

          <h2>4. Servicios e infraestructura</h2>

          <p>
            Aptus utiliza Supabase para funciones de autenticación
            y almacenamiento de los datos asociados a la cuenta.
            Los servicios de backend de Aptus están alojados en
            Render.
          </p>

          <p>
            Estos proveedores pueden procesar los datos necesarios
            para prestar sus servicios técnicos conforme a sus
            respectivas condiciones y medidas de seguridad.
          </p>

          <h2>5. Conservación de los datos</h2>

          <p>
            Los datos asociados a tu cuenta se conservan mientras
            mantengas tu cuenta de Aptus o mientras sean necesarios
            para proporcionar el servicio.
          </p>

          <p>
            Los datos procedentes de Health Connect que actualmente
            solo se leen para su visualización no se almacenan de
            forma persistente por Aptus.
          </p>

          <h2>6. Eliminación de cuenta y datos</h2>

          <p>
            Puedes eliminar tu cuenta directamente desde
            Ajustes → Cuenta → Eliminar cuenta.
          </p>

          <p>
            Al confirmar la eliminación se eliminan la cuenta de
            autenticación y los datos asociados almacenados por
            Aptus, incluidos perfil, rutinas, entrenamientos,
            nutrición y métricas de salud, salvo aquellos cuya
            conservación fuese exigida legalmente.
          </p>

          <p>
            También puedes consultar las instrucciones públicas en
            <a routerLink="/delete-account">
              Eliminar una cuenta de Aptus
            </a>.
          </p>

          <h2>7. Seguridad</h2>

          <p>
            Aptus utiliza autenticación y comunicaciones cifradas
            mediante HTTPS y limita el acceso a los datos de cada
            usuario mediante mecanismos de autenticación y
            autorización.
          </p>

          <h2>8. Contacto</h2>

          <p>
            Para consultas relacionadas con privacidad,
            protección de datos o eliminación de cuenta,
            puedes contactar con Aptus en
            <a href="mailto:apl00028@gmail.com">
              apl00028@gmail.com
            </a>.
          </p>

          <h2>9. Cambios en esta política</h2>

          <p>
            Esta política puede actualizarse cuando cambien las
            funciones de Aptus o la forma en que se tratan los
            datos. La fecha de última actualización se mostrará
            al comienzo de esta página.
          </p>
        </article>
      } @else {
        <article>
          <h1>Eliminar una cuenta de Aptus</h1>

          <p>
            Puedes eliminar permanentemente tu cuenta de Aptus y
            los datos asociados directamente desde la aplicación.
          </p>

          <h2>Desde la aplicación</h2>

          <ol>
            <li>Abre Aptus.</li>
            <li>Entra en Ajustes.</li>
            <li>Abre Cuenta.</li>
            <li>Selecciona Eliminar cuenta.</li>
            <li>Escribe ELIMINAR para confirmar.</li>
            <li>Confirma la eliminación definitiva.</li>
          </ol>

          <h2>Qué se elimina</h2>

          <p>
            Se elimina la cuenta de autenticación y los datos
            asociados al usuario, incluidos perfil, rutinas,
            entrenamientos, nutrición y métricas de salud.
          </p>

          <h2>Si no puedes acceder a tu cuenta</h2>

          <p>
            Si no puedes acceder a Aptus y necesitas solicitar
            la eliminación de tu cuenta, escribe desde el correo
            asociado a tu cuenta a
            <a href="mailto:apl00028@gmail.com">
              apl00028@gmail.com
            </a>.
          </p>

          <p>
            Consulta también la
            <a routerLink="/privacy">
              Política de privacidad de Aptus
            </a>.
          </p>
        </article>
      }
    </main>
  `,
  styles: [`
    :host {
      display: block;
    }

    .legal-page {
      max-width: 760px;
      margin: 0 auto;
      padding: 32px 20px 64px;
      line-height: 1.6;
    }

    .legal-back {
      display: inline-block;
      margin-bottom: 28px;
      font-weight: 700;
      text-decoration: none;
    }

    article {
      display: grid;
      gap: 14px;
    }

    h1,
    h2,
    p,
    ol {
      margin: 0;
    }

    h2 {
      margin-top: 18px;
    }

    ol {
      padding-left: 22px;
    }
  `]
})
export class LegalPage {
  readonly page =
    input.required<
      'privacy' | 'delete-account'
    >();
}
