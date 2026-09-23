import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service.js';

// La ruta llega como "/users/abc123/password" (sin el prefijo global "api").
// Se toma el primer segmento como "tipo de entidad" y, si el segundo
// segmento no es una subruta de acción conocida (editar, password, etc.),
// se asume que es el id del recurso afectado.
const ACTION_SUFFIXES = new Set(['password', 'actividad', 'aprobar', 'rechazar']);

function parseEntidad(path: string): { tipo: string | null; id: string | null } {
  const segments = path.split('?')[0].split('/').filter(Boolean);
  if (segments.length === 0) return { tipo: null, id: null };
  const tipo = segments[0];
  const second = segments[1];
  if (second && !ACTION_SUFFIXES.has(second)) return { tipo, id: second };
  return { tipo, id: null };
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const isMutation = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method);

    if (!isMutation) return next.handle();

    return next.handle().pipe(
      tap(() => {
        const user = req.user;
        const res = context.switchToHttp().getResponse<Response>();
        const { tipo, id } = parseEntidad(req.url);

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

        this.prisma.auditLog
          .create({
            data: {
              userId: user?.id ?? null,
              method: req.method,
              path: req.url,
              entidadTipo: tipo,
              entidadId: id,
              statusCode: res.statusCode,
              ip: req.ip ?? null,
            },
          })
          .catch((err: Error) => this.logger.error(`No se pudo guardar el audit log: ${err.message}`));
      }),
    );
  }
}
