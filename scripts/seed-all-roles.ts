import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../prisma/generated/prisma/client.js';

if (!process.env.DATABASE_URL) {
  console.error('❌  DATABASE_URL no definida en .env');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: { enabled: true },
});

const ROLES = [
  { role: 'supervisor', name: 'Supervisor Demo' },
  { role: 'supervisor_civil', name: 'Supervisor Civil Demo' },
  { role: 'supervisor_electrico', name: 'Supervisor Eléctrico Demo' },
  { role: 'pdr', name: 'PDR Demo' },
  { role: 'ing_civil', name: 'Ingeniero Civil Demo' },
  { role: 'ing_electrico', name: 'Ingeniero Eléctrico Demo' },
  { role: 'jefe_sig', name: 'Jefe SIG Demo' },
  { role: 'logistica', name: 'Logística Demo' },
  { role: 'gerencia', name: 'Gerencia Demo' },
  { role: 'administrador', name: 'Administrador Demo' },
] as const;

const PASSWORD = 'Demo1234!';

function emailFor(role: string) {
  return `${role.replace(/_/g, '.')}@dyc.cl`;
}

async function ensureUser(role: (typeof ROLES)[number]['role'], name: string) {
  const email = emailFor(role);
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    await prisma.user.update({ where: { email }, data: { role } });
    console.log(`✔  ${email} ya existía — rol asegurado (${role})`);
    return;
  }

  const result = await auth.api.signUpEmail({
    body: { email, password: PASSWORD, name },
  });

  if (!result?.user) {
    console.error(`❌  Error al crear ${email}:`, result);
    return;
  }

  await prisma.user.update({ where: { id: result.user.id }, data: { role } });
  console.log(`✔  Creado ${email} (${role})`);
}

async function main() {
  for (const { role, name } of ROLES) {
    await ensureUser(role, name);
  }
}

main()
  .catch((e) => {
    console.error('❌  Error:', e.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
