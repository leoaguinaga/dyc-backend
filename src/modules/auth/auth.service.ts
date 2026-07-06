import { Injectable } from '@nestjs/common';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class AuthService {
  readonly auth: any;

  constructor(private prisma: PrismaService) {
    this.auth = betterAuth({
      database: prismaAdapter(this.prisma, { provider: 'postgresql' }),
      emailAndPassword: { enabled: true },
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
        },
      },
    });
  }
}