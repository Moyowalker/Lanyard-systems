import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiErrorBody, ErrorCode } from '@lanyard/contracts';

import { DomainError, codeForStatus } from './domain-error';

/**
 * Normalises every thrown error into the canonical envelope:
 *   { "error": { code, message, details?, traceId? } }
 * (docs/architecture/06 §2). Unknown errors are logged and returned as 500 INTERNAL
 * without leaking internals to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const traceId = (req.headers['x-request-id'] as string) || undefined;

    let status = 500;
    let body: ApiErrorBody = { code: ErrorCode.INTERNAL, message: 'Internal server error' };

    if (exception instanceof DomainError) {
      status = exception.httpStatus;
      body = { code: exception.code, message: exception.message, details: exception.details };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'object' && response !== null) {
        const obj = response as Record<string, unknown>;
        body = {
          code: (obj.code as string) ?? codeForStatus(status),
          message: Array.isArray(obj.message)
            ? (obj.message as string[]).join('; ')
            : ((obj.message as string) ?? exception.message),
          details: obj.details as ApiErrorBody['details'],
        };
      } else {
        body = { code: codeForStatus(status), message: String(response) };
      }
    } else {
      this.logger.error(
        exception instanceof Error ? exception.message : 'Unknown error',
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    res.status(status).json({ error: { ...body, traceId } });
  }
}
