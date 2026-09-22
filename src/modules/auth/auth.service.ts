import { Injectable } from '@nestjs/common';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailService } from '../../shared/email/email.service.js';
import { buildActionEmail } from '../../shared/email/email-template.js';
import { impersonationPlugin } from './impersonation.plugin.js';

@Injectable()
export class AuthService {
  readonly auth: any;

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
  ) {
    this.auth = betterAuth({
      database: prismaAdapter(this.prisma, { provider: 'postgresql' }),
      plugins: [impersonationPlugin(this.prisma)],
      emailAndPassword: {
        enabled: true,
        sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
          const email = buildActionEmail({
            title: 'Restablece tu contraseña',
            message: 'Recibimos una solicitud para restablecer tu contraseña en el sistema interno de Díaz y Castillo. Si no la solicitaste, puedes ignorar este correo.',
            tone: 'security',
            actionLabel: 'Elegir nueva contraseña',
            actionUrl: url,
          });
          await this.email.send({
            to: user.email,
            subject: 'Restablece tu contraseña — Díaz y Castillo',
            ...email,
          });
        },
      },
      session: {
        expiresIn: 60 * 60 * 24 * 7,
        updateAge: 60 * 60 * 24,
      },
      trustedOrigins: [process.env.FRONTEND_URL ?? 'http://localhost:3000'],
      advanced: {
        crossSubDomainCookies: {
          enabled: true,
          domain: process.env.COOKIE_DOMAIN ?? undefined,
        },
        defaultCookieAttributes: {
          secure: true,
          sameSite: 'none',
        },
      },
      user: {
        additionalFields: {
          role: {
            type: 'string',
            defaultValue: 'supervisor',
            input: false,
          },
          correoContacto: {
            type: 'string',
            required: false,
            input: true,
          },
        },
        changeEmail: {
          enabled: true,
        },
      },
      // Ninguna cuenta actual tiene emailVerified=true (no hay flujo de verificación
      // al registrarse), así que un cambio de correo siempre cae en esta rama: el
      // correo solo se reemplaza cuando el usuario confirma el enlace desde SU
      // NUEVO correo — evita que un typo lo deje sin acceso.
      emailVerification: {
        sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
          const email = buildActionEmail({
            title: 'Confirma tu nuevo correo',
            message: 'Confirma este correo para actualizar el acceso a tu cuenta de Díaz y Castillo. Si no solicitaste el cambio, puedes ignorar este correo.',
            tone: 'security',
            actionLabel: 'Confirmar mi correo',
            actionUrl: url,
          });
          await this.email.send({
            to: user.email,
            subject: 'Confirma tu nuevo correo — Díaz y Castillo',
            ...email,
          });
        },
      },
    });
  }
}
