import { createAuthEndpoint, createAuthMiddleware, getSessionFromCtx, APIError } from 'better-auth/api';
import { deleteSessionCookie, expireCookie, setSessionCookie } from 'better-auth/cookies';
import type { PrismaService } from '../../prisma/prisma.service.js';

export function impersonationPlugin(prisma: PrismaService) {
  const impersonateUserEndpoint = createAuthEndpoint(
    '/impersonate-user',
    {
      method: 'POST',
      use: [
        createAuthMiddleware(async (ctx) => {
          const session = await getSessionFromCtx(ctx);
          if (!session) throw APIError.fromStatus('UNAUTHORIZED');
          return { session };
        }),
      ],
    },
    async (ctx) => {
      const body = ctx.body as { userId?: string } | undefined;
      const targetUserId = body?.userId;

      if (!targetUserId || typeof targetUserId !== 'string') {
        throw APIError.from('BAD_REQUEST', {
          code: 'INVALID_USER_ID',
          message: 'userId es requerido.',
        });
      }

      // 1. Verificar que quien llama tenga el rol admin_ti
      const callerUser = await prisma.user.findUnique({
        where: { id: ctx.context.session.user.id },
      });

      if (callerUser?.role !== 'admin_ti') {
        throw APIError.from('FORBIDDEN', {
          code: 'FORBIDDEN',
          message: 'Solo los usuarios con rol de Administración TI pueden iniciar sesiones de soporte.',
        });
      }

      // 2. Buscar al usuario destino con todos sus campos requeridos por better-auth
      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
      });

      if (!targetUser) {
        throw APIError.from('NOT_FOUND', {
          code: 'USER_NOT_FOUND',
          message: 'El usuario especificado no existe.',
        });
      }

      if (targetUser.id === callerUser.id) {
        throw APIError.from('BAD_REQUEST', {
          code: 'CANNOT_IMPERSONATE_SELF',
          message: 'Ya te encuentras en tu propia cuenta.',
        });
      }

      // 3. Crear una nueva sesión para el usuario objetivo
      const newSession = await ctx.context.internalAdapter.createSession(targetUser.id, true);
      if (!newSession) {
        throw APIError.from('INTERNAL_SERVER_ERROR', {
          code: 'SESSION_CREATION_FAILED',
          message: 'Error al generar la sesión de impersonación.',
        });
      }

      // 4. Guardar token de admin en cookie firmada
      const authCookies = ctx.context.authCookies;
      const adminCookieProp = ctx.context.createAuthCookie('admin_session');
      await ctx.setSignedCookie(
        adminCookieProp.name,
        `${ctx.context.session.session.token}:${callerUser.id}`,
        ctx.context.secret,
        authCookies.sessionToken.attributes,
      );

      // 5. Guardar cookie descriptiva para que el SSR/cliente de Next.js muestre el banner
      const infoCookieProp = ctx.context.createAuthCookie('impersonation_info');
      ctx.setCookie(
        infoCookieProp.name,
        JSON.stringify({
          adminId: callerUser.id,
          adminName: callerUser.name,
          targetId: targetUser.id,
          targetName: targetUser.name,
          targetRole: targetUser.role,
        }),
        {
          ...authCookies.sessionToken.attributes,
          httpOnly: false,
        },
      );

      // 6. Configurar la nueva sesión activa en las cookies
      deleteSessionCookie(ctx);
      await setSessionCookie(
        ctx,
        {
          session: newSession,
          user: targetUser,
        },
        true,
      );

      return ctx.json({
        success: true,
        user: {
          id: targetUser.id,
          name: targetUser.name,
          email: targetUser.email,
          role: targetUser.role,
        },
      });
    },
  );

  const stopImpersonatingEndpoint = createAuthEndpoint(
    '/stop-impersonating',
    {
      method: 'POST',
    },
    async (ctx) => {
      // 1. Obtener la cookie firmada de admin_session
      const adminSessionCookie = ctx.context.createAuthCookie('admin_session');
      const adminCookieVal = await ctx.getSignedCookie(
        adminSessionCookie.name,
        ctx.context.secret,
      );

      if (!adminCookieVal) {
        throw APIError.from('BAD_REQUEST', {
          code: 'NO_ADMIN_SESSION',
          message: 'No existe una sesión de administración activa para restaurar.',
        });
      }

      const [adminSessionToken, adminUserId] = adminCookieVal.split(':');
      if (!adminSessionToken || !adminUserId) {
        throw APIError.from('BAD_REQUEST', {
          code: 'INVALID_ADMIN_TOKEN',
          message: 'Token de sesión de administrador inválido.',
        });
      }

      // 2. Validar que la sesión de admin original exista en BD
      const adminSession = await ctx.context.internalAdapter.findSession(adminSessionToken);
      if (!adminSession || adminSession.session.userId !== adminUserId) {
        throw APIError.from('UNAUTHORIZED', {
          code: 'ADMIN_SESSION_EXPIRED',
          message: 'La sesión original de administración ha expirado.',
        });
      }

      // 3. Eliminar la sesión temporal de impersonación actual
      const currentSession = await getSessionFromCtx(ctx);
      if (currentSession?.session?.token) {
        await ctx.context.internalAdapter.deleteSession(currentSession.session.token);
      }

      // 4. Restaurar la sesión de administración original
      deleteSessionCookie(ctx);
      await setSessionCookie(ctx, adminSession, true);

      // 5. Expirar cookies de impersonación
      expireCookie(ctx, adminSessionCookie);
      const infoCookieProp = ctx.context.createAuthCookie('impersonation_info');
      expireCookie(ctx, infoCookieProp);

      return ctx.json({
        success: true,
        user: adminSession.user,
      });
    },
  );

  return {
    id: 'impersonation',
    endpoints: {
      impersonateUser: impersonateUserEndpoint,
      stopImpersonating: stopImpersonatingEndpoint,
    },
  };
}
