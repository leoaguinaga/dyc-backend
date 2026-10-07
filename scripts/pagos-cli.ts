import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../prisma/generated/prisma/client.js';

/** Conexión de los scripts de pagos. Falla pronto si no hay base configurada. */
export function crearPrisma(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    console.error('❌  DATABASE_URL no definida en .env');
    process.exit(1);
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
}

/** "host/base" de la conexión activa, sin usuario ni clave, para que se vea a qué base se escribe. */
export function describirBd(): string {
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    return `${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}`;
  } catch {
    return '(DATABASE_URL no válida)';
  }
}

/** Pide escribir el nombre de la base antes de una operación que modifica datos. */
export async function confirmarEscritura(
  accion: string,
  omitir: boolean,
): Promise<boolean> {
  const bd = describirBd();
  if (omitir) return true;
  const base = bd.split('/').pop() ?? bd;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const respuesta = await rl.question(
      `\n⚠️  Vas a ${accion} en ${bd}.\n   Escribe el nombre de la base (${base}) para confirmar: `,
    );
    return respuesta.trim() === base;
  } finally {
    rl.close();
  }
}

/** AAAA-MM-DD → Date a medianoche UTC (el convenio de fechas del sistema). */
export function parseFechaArg(
  valor: string | undefined,
  nombre: string,
): Date | undefined {
  if (!valor) return undefined;
  const m = valor.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const fecha = m
    ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
    : null;
  if (!fecha || Number.isNaN(fecha.getTime())) {
    console.error(
      `❌  ${nombre} debe tener el formato AAAA-MM-DD (recibí "${valor}")`,
    );
    process.exit(1);
  }
  return fecha;
}

export const soles = (n: number) =>
  n.toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
