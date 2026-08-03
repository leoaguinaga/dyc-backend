import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../prisma/generated/prisma/client.js';

if (!process.env.DATABASE_URL) {
  console.error('❌  DATABASE_URL no definida en .env');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const DEFAULT_HORA_INICIO = '08:00';
const DEFAULT_HORA_FIN = '17:00';

function cruzaMedianoche(horaInicio: string, horaFin: string): boolean {
  return horaFin <= horaInicio;
}

// Nota: el backfill de Turno.turnoConfigId ya se ejecutó y esa columna es NOT NULL
// desde la migración 20260803010000_turno_config_id_required — este script ya no
// la toca. Se conserva para completar ProyectoTrabajador.turnoConfigId (que sigue
// nullable) en proyectos que se hayan creado después sin turno asignado explícito.
async function main() {
  const proyectos = await prisma.proyecto.findMany({
    select: {
      id: true,
      nombre: true,
      jornadaInicio: true,
      jornadaFin: true,
      toleranciaMinutos: true,
      toleranciaSalidaMinutos: true,
      _count: { select: { trabajadores: true } },
    },
  });

  let creados = 0;
  let omitidos = 0;
  let asignacionesActualizadas = 0;

  for (const proyecto of proyectos) {
    const necesitaConfig =
      proyecto.jornadaInicio !== null || proyecto._count.trabajadores > 0;

    if (!necesitaConfig) {
      omitidos++;
      continue;
    }

    const horaInicio = proyecto.jornadaInicio ?? DEFAULT_HORA_INICIO;
    const horaFin = proyecto.jornadaFin ?? DEFAULT_HORA_FIN;

    const turnoConfig = await prisma.turnoConfig.upsert({
      where: { proyectoId_nombre: { proyectoId: proyecto.id, nombre: 'General' } },
      update: {},
      create: {
        proyectoId: proyecto.id,
        nombre: 'General',
        horaInicio,
        horaFin,
        cruzaMedianoche: cruzaMedianoche(horaInicio, horaFin),
        toleranciaMinutos: proyecto.toleranciaMinutos ?? 10,
        toleranciaSalidaMinutos: proyecto.toleranciaSalidaMinutos ?? 60,
      },
    });
    creados++;

    const asignaciones = await prisma.proyectoTrabajador.updateMany({
      where: { proyectoId: proyecto.id, turnoConfigId: null },
      data: { turnoConfigId: turnoConfig.id },
    });
    asignacionesActualizadas += asignaciones.count;

    console.log(
      `✔  ${proyecto.nombre}: TurnoConfig "General" (${horaInicio}-${horaFin}) — ` +
        `${asignaciones.count} asignación(es) actualizadas`,
    );
  }

  console.log('---');
  console.log(`Proyectos con TurnoConfig creado/verificado: ${creados}`);
  console.log(`Proyectos omitidos (sin jornada ni trabajadores asignados): ${omitidos}`);
  console.log(`Total asignaciones backfilleadas: ${asignacionesActualizadas}`);
}

main()
  .catch((e) => {
    console.error('❌  Error:', e.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
