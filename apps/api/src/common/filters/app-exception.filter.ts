import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppError } from '@findash/shared';

/**
 * Global exception filter — converts AppError and HttpException to structured JSON.
 * All error responses follow: { error: { code, message, meta?, timestamp } }
 */
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    let meta: Record<string, unknown> | undefined;

    if (exception instanceof AppError) {
      statusCode = exception.statusCode;
      code = exception.code;
      message = exception.message;
      meta = exception.meta;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      code = 'HTTP_ERROR';
      message = typeof body === 'string' ? body : (body as any).message ?? message;
    } else {
      this.logger.error('Unhandled exception', exception);
    }

    response.status(statusCode).json({
      error: {
        code,
        message,
        ...(meta ? { meta } : {}),
        timestamp: new Date().toISOString(),
        path: request.url,
      },
    });
  }
}
