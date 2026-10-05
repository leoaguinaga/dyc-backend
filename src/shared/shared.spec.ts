import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { lastValueFrom, of } from 'rxjs';
import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from './guards/auth.guard.js';
import { ResponsableAsistenciaGuard } from './guards/responsable-asistencia.guard.js';
import { AuditInterceptor } from './interceptors/audit.interceptor.js';
import { HttpExceptionFilter } from './filters/http-exception.filter.js';
import { LocalStorageProvider } from './storage/local-storage.provider.js';
import { IS_PUBLIC_KEY } from './decorators/public.decorator.js';
import { REQUIRE_RESPONSABLE_ASISTENCIA_KEY } from './decorators/require-responsable-asistencia.decorator.js';
import { fn, prismaMock } from '../testing/mocks.js';

function contexto(
  meta: Record<string, unknown>,
  req: Record<string, unknown>,
  res: Record<string, unknown> = {},
) {
  const handler = () => undefined;
  for (const [k, v] of Object.entries(meta))
    Reflect.defineMetadata(k, v, handler);
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  function setup(session: unknown, dbUser: unknown) {
    const prisma = prismaMock();
    prisma.user.findUnique.mockResolvedValue(dbUser);
    const authService = {
      auth: { api: { getSession: fn(() => Promise.resolve(session)) } },
    };
    return new AuthGuard(
      new Reflector(),
      authService as never,
      prisma as never,
    );
  }

  it('deja pasar endpoints públicos sin sesión', async () => {
    expect(
      await setup(null, null).canActivate(
        contexto({ [IS_PUBLIC_KEY]: true }, { headers: {} }),
      ),
    ).toBe(true);
  });

  it('carga el rol desde la base y lo deja en req.user', async () => {
    const req: Record<string, unknown> = { headers: { cookie: 'x' } };
    const guard = setup(
      { user: { id: 'u1' } },
      { id: 'u1', name: 'Ana', email: 'a@x', role: 'logistica' },
    );
    expect(await guard.canActivate(contexto({}, req))).toBe(true);
    expect(req.user).toEqual({
      id: 'u1',
      name: 'Ana',
      email: 'a@x',
      role: 'logistica',
    });
  });

  it('rechaza sin sesión o si el usuario ya no existe', async () => {
    await expect(
      setup(null, null).canActivate(contexto({}, { headers: {} })),
    ).rejects.toThrow(UnauthorizedException);
    await expect(
      setup({ user: { id: 'u1' } }, null).canActivate(
        contexto({}, { headers: {} }),
      ),
    ).rejects.toThrow('Usuario no encontrado');
  });
});

describe('ResponsableAsistenciaGuard', () => {
  function setup() {
    const prisma = prismaMock();
    return {
      prisma,
      guard: new ResponsableAsistenciaGuard(new Reflector(), prisma as never),
    };
  }
  const meta = { [REQUIRE_RESPONSABLE_ASISTENCIA_KEY]: true };

  it('sin el decorador no restringe; administración y Jefe SIG siempre pasan', async () => {
    const { guard } = setup();
    expect(
      await guard.canActivate(contexto({}, { user: { role: 'pdr' } })),
    ).toBe(true);
    expect(
      await guard.canActivate(
        contexto(meta, { user: { role: 'jefe_sig' }, params: {} }),
      ),
    ).toBe(true);
  });

  it('el prevencionista solo opera su obra', async () => {
    const { guard, prisma } = setup();
    const req = (proyectoId?: string) => ({
      user: { id: 'u1', role: 'pdr' },
      params: { proyectoId },
    });
    await expect(guard.canActivate(contexto(meta, req()))).rejects.toThrow(
      /proyectoId/,
    );
    await expect(guard.canActivate(contexto(meta, req('p1')))).rejects.toThrow(
      'Obra no encontrada',
    );
    prisma.proyecto.findUnique.mockResolvedValue({ prevencionistaId: 't1' });
    await expect(guard.canActivate(contexto(meta, req('p1')))).rejects.toThrow(
      ForbiddenException,
    );
    prisma.trabajador.findUnique.mockResolvedValueOnce({ id: 't2' });
    await expect(guard.canActivate(contexto(meta, req('p1')))).rejects.toThrow(
      /No eres el encargado/,
    );
    prisma.trabajador.findUnique.mockResolvedValueOnce({ id: 't1' });
    expect(await guard.canActivate(contexto(meta, req('p1')))).toBe(true);
  });
});

describe('AuditInterceptor', () => {
  const next = { handle: () => of('ok') };

  it('no registra lecturas', async () => {
    const prisma = prismaMock();
    const interceptor = new AuditInterceptor(prisma as never);
    await lastValueFrom(
      interceptor.intercept(
        contexto({}, { method: 'GET', url: '/users' }),
        next,
      ),
    );
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('registra mutaciones con entidad e id deducidos de la ruta', async () => {
    const prisma = prismaMock();
    const interceptor = new AuditInterceptor(prisma as never);
    const req = {
      method: 'PATCH',
      url: '/users/abc123?x=1',
      user: { id: 'u1', role: 'gerencia' },
      ip: '1.1.1.1',
    };
    await lastValueFrom(
      interceptor.intercept(contexto({}, req, { statusCode: 200 }), next),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        method: 'PATCH',
        entidadTipo: 'users',
        entidadId: 'abc123',
        statusCode: 200,
      }),
    });
  });

  it('las subrutas de acción no se toman como id y un fallo al guardar no rompe la respuesta', async () => {
    const prisma = prismaMock();
    prisma.auditLog.create.mockRejectedValue(new Error('db caída'));
    const interceptor = new AuditInterceptor(prisma as never);
    await lastValueFrom(
      interceptor.intercept(
        contexto({}, { method: 'POST', url: '/users/password' }, {}),
        next,
      ),
    );
    await lastValueFrom(
      interceptor.intercept(
        contexto({}, { method: 'DELETE', url: '/' }, {}),
        next,
      ),
    );
    expect(prisma.auditLog.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        userId: null,
        entidadTipo: 'users',
        entidadId: null,
      }),
    );
    expect(prisma.auditLog.create.mock.calls[1][0].data).toEqual(
      expect.objectContaining({ entidadTipo: null }),
    );
    await new Promise((r) => setImmediate(r));
  });
});

describe('HttpExceptionFilter', () => {
  it('responde con estado, mensaje y ruta', () => {
    const json = fn();
    const response = { status: fn(() => ({ json })) };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ url: '/x' }),
      }),
    };
    new HttpExceptionFilter().catch(
      new NotFoundException('No está'),
      host as never,
    );
    expect(response.status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        message: 'No está',
        path: '/x',
      }),
    );
    new HttpExceptionFilter().catch(new ForbiddenException(), host as never);
    expect(json).toHaveBeenLastCalledWith(
      expect.objectContaining({ statusCode: 403, message: 'Forbidden' }),
    );
  });
});

describe('LocalStorageProvider', () => {
  const cwd = process.cwd();
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dyc-storage-'));
    process.chdir(dir);
  });
  afterEach(() => {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  });

  it('guarda con extensión según MIME y borra sin salir de uploads', async () => {
    const storage = new LocalStorageProvider();
    const pdf = await storage.save({
      buffer: Buffer.from('%PDF'),
      originalName: 'cot.pdf',
      mimeType: 'application/pdf',
      folder: 'cotizaciones',
    });
    expect(pdf.url).toMatch(/^\/uploads\/cotizaciones\/.+\.pdf$/);
    expect(pdf.nombre).toBe('cot.pdf');
    const ruta = join(dir, pdf.url);
    expect(existsSync(ruta)).toBe(true);
    const otro = await storage.save({
      buffer: Buffer.from('x'),
      originalName: 'a',
      mimeType: 'text/plain',
    });
    expect(otro.url).toMatch(/^\/uploads\/requerimientos\/.+\.bin$/);
    await storage.remove(pdf.url);
    expect(existsSync(ruta)).toBe(false);
    await storage.remove(pdf.url);
    await expect(storage.remove('/otra/ruta')).rejects.toThrow(/no pertenece/);
    await expect(storage.remove('/uploads/../../etc/passwd')).rejects.toThrow(
      /no es segura/,
    );
  });
});
