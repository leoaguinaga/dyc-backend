import { Injectable } from '@nestjs/common';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailService } from '../../shared/email/email.service.js';

@Injectable()
export class AuthService {
  readonly auth: any;

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
  ) {
    this.auth = betterAuth({
      database: prismaAdapter(this.prisma, { provider: 'postgresql' }),
      emailAndPassword: {
        enabled: true,
        sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
          await this.email.send({
            to: user.email,
            subject: 'Restablece tu contraseña — Díaz y Castillo',
            html: `
              <p>Hola,</p>
              <p>Recibimos una solicitud para restablecer tu contraseña en el sistema interno de Díaz y Castillo.</p>
              <p><a href="${url}">Haz clic aquí para elegir una nueva contraseña</a></p>
              <p>Si no solicitaste esto, puedes ignorar este correo.</p>
            `,
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
          await this.email.send({
            to: user.email,
            subject: 'Confirma tu nuevo correo — Díaz y Castillo',
            html: `
              <p>Hola,</p>
              <p>Confirma tu nuevo correo para el sistema interno de Díaz y Castillo haciendo clic en el siguiente enlace:</p>
              <p><a href="${url}">Confirmar mi nuevo correo</a></p>
              <p>Si no solicitaste este cambio, puedes ignorar este correo.</p>
            `,
          });
        },
      },
    });
  }
}