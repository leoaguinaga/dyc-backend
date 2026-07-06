import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../prisma/generated/prisma/client.js';

const EMAIL    = process.argv[2] ?? 'admin@dyc.cl';
const PASSWORD = process.argv[3] ?? 'Admin1234!';
const NAME     = process.argv[4] ?? 'Administrador';

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

async function main() {
  // Verificar si el usuario ya existe
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });

  if (existing) {
    // Solo actualizar el rol si ya existe
    await prisma.user.update({
      where: { email: EMAIL },
      data: { role: 'administrador' },
    });
    console.log(`✔  Usuario ${EMAIL} ya existe — rol actualizado a administrador`);
    return;
  }

  // Crear usuario via better-auth (hashea la contraseña correctamente)
  const result = await auth.api.signUpEmail({
    body: { email: EMAIL, password: PASSWORD, name: NAME },
  });

  if (!result?.user) {
    console.error('❌  Error al crear el usuario:', result);
    process.exit(1);
  }

  // Asignar rol administrador
  await prisma.user.update({
    where: { id: result.user.id },
    data: { role: 'administrador' },
  });

  console.log('✔  Admin creado exitosamente');
  console.log(`   Email:      ${EMAIL}`);
  console.log(`   Contraseña: ${PASSWORD}`);
  console.log(`   ID:         ${result.user.id}`);
}

main()
  .catch((e) => {
    console.error('❌  Error:', e.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
