import {
  Injectable
} from '@angular/core';

import {
  Capacitor
} from '@capacitor/core';

import {
  FirebaseCrashlytics,
  StackFrame
} from '@capacitor-firebase/crashlytics';


export interface ErrorReportingContext {
  source: string;
  route?: string;
  endpoint?: string;
  method?: string;
  status?: number;
  requestId?: string;
}


@Injectable({
  providedIn: 'root'
})
export class ErrorReportingService {

  private readonly reportedObjects =
    new WeakSet<object>();


  async report(
    error: unknown,
    context: ErrorReportingContext
  ): Promise<void> {

    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const reportableObject =
      typeof error === 'object'
      && error !== null
        ? error
        : null;

    if (reportableObject) {
      if (
        this.reportedObjects.has(
          reportableObject
        )
      ) {
        return;
      }

      this.reportedObjects.add(
        reportableObject
      );
    }

    try {
      const normalized =
        this.normalizeError(
          error,
          context
        );

      const keysAndValues =
        this.contextKeys(context);

      await FirebaseCrashlytics.recordException({
        message:
          normalized.message,

        ...(normalized.stacktrace.length
          ? {
              stacktrace:
                normalized.stacktrace
            }
          : {}),

        ...(keysAndValues.length
          ? {
              keysAndValues
            }
          : {})
      });

    } catch {
      if (reportableObject) {
        this.reportedObjects.delete(
          reportableObject
        );
      }

      /*
       * Error reporting must never affect
       * the user's normal Aptus experience.
       */
    }
  }


  async breadcrumb(
    message: string
  ): Promise<void> {

    if (!Capacitor.isNativePlatform()) {
      return;
    }

    try {
      await FirebaseCrashlytics.log({
        message:
          this.sanitizeText(message)
      });

    } catch {
      /*
       * Crashlytics must remain best-effort.
       */
    }
  }


  private normalizeError(
    error: unknown,
    context: ErrorReportingContext
  ): {
    message: string;
    stacktrace: StackFrame[];
  } {

    if (
      context.source === 'http'
    ) {
      return {
        message:
          Number.isInteger(
            context.status
          )
            ? `HTTP request failed (${context.status})`
            : 'HTTP request failed',

        stacktrace:
          error instanceof Error
            ? this.parseStack(
                error.stack
              )
            : []
      };
    }

    if (error instanceof Error) {
      return {
        message:
          this.sanitizeText(
            `${error.name}: ${error.message}`
          ),

        stacktrace:
          this.parseStack(
            error.stack
          )
      };
    }

    if (typeof error === 'string') {
      return {
        message:
          this.sanitizeText(error),

        stacktrace: []
      };
    }

    return {
      message:
        'Unknown application error',

      stacktrace: []
    };
  }


  private contextKeys(
    context: ErrorReportingContext
  ) {
    const values: Array<{
      key: string;
      value: string | number | boolean;
      type:
        | 'string'
        | 'long'
        | 'double'
        | 'boolean'
        | 'int'
        | 'float';
    }> = [
      {
        key: 'source',
        value:
          this.sanitizeText(
            context.source
          ),
        type: 'string'
      }
    ];

    if (context.route) {
      values.push({
        key: 'route',
        value:
          this.sanitizePath(
            context.route
          ),
        type: 'string'
      });
    }

    if (context.endpoint) {
      values.push({
        key: 'endpoint',
        value:
          this.sanitizePath(
            context.endpoint
          ),
        type: 'string'
      });
    }

    if (context.method) {
      values.push({
        key: 'method',
        value:
          context.method
            .toUpperCase()
            .slice(0, 12),
        type: 'string'
      });
    }

    if (
      Number.isInteger(
        context.status
      )
    ) {
      values.push({
        key: 'status',
        value:
          context.status as number,
        type: 'int'
      });
    }

    if (context.requestId) {
      values.push({
        key: 'request_id',
        value:
          context.requestId
            .slice(0, 100),
        type: 'string'
      });
    }

    return values;
  }


  private sanitizeText(
    value: string
  ): string {

    return value
      .replace(
        /Bearer\s+\S+/gi,
        'Bearer [redacted]'
      )
      .replace(
        /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
        '[token]'
      )
      .replace(
        /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
        '[email]'
      )
      .replace(
        /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
        '[id]'
      )
      .replace(
        /([?&][^=\s]+)=([^&#\s]*)/g,
        '$1=[redacted]'
      )
      .slice(0, 500);
  }


  private sanitizePath(
    value: string
  ): string {

    return value
      .split('?')[0]
      .split('#')[0]
      .replace(
        /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
        ':id'
      )
      .slice(0, 300);
  }


  private parseStack(
    stack?: string
  ): StackFrame[] {

    if (!stack) {
      return [];
    }

    const frames: StackFrame[] = [];

    for (
      const line of stack
        .split('\n')
        .slice(1, 41)
    ) {
      const match =
        line.match(
          /^\s*at\s+(?:(.*?)\s+\()?(.+?):(\d+):(\d+)\)?$/
        );

      if (!match) {
        continue;
      }

      const fileName =
        match[2]
          .split('?')[0]
          .split('#')[0]
          .split('/')
          .pop();

      frames.push({
        ...(match[1]
          ? {
              functionName:
                match[1]
                  .slice(0, 120)
            }
          : {}),

        ...(fileName
          ? {
              fileName:
                fileName
                  .slice(0, 160)
            }
          : {}),

        lineNumber:
          Number(match[3])
      });
    }

    return frames;
  }
}
