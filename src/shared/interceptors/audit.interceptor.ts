import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Audit');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const isMutation = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method);

    if (!isMutation) return next.handle();

    return next.handle().pipe(
      tap(() => {
        const user = req.user;
        this.logger.log(
          JSON.stringify({
            userId: user?.id ?? 'anonymous',
            role: user?.role ?? null,
            method: req.method,
            path: req.url,
            ip: req.ip,
            timestamp: new Date().toISOString(),
          }),
        );
      }),
    );
  }
}
