-- Create new enums
CREATE TYPE "EstadoProyecto" AS ENUM ('planificacion', 'ejecucion', 'cierre', 'liquidada');
CREATE TYPE "AmbitoGeografico" AS ENUM ('local', 'nacional', 'internacional');
CREATE TYPE "CumplimientoHito" AS ENUM ('si', 'no', 'programado');

-- Rename tables
ALTER TABLE "obras" RENAME TO "proyectos";
ALTER TABLE "obras_supervisores" RENAME TO "proyectos_supervisores";
ALTER TABLE "obras_trabajadores" RENAME TO "proyectos_trabajadores";

-- Rename columns obraId -> proyectoId
ALTER TABLE "proyectos_supervisores" RENAME COLUMN "obraId" TO "proyectoId";
ALTER TABLE "proyectos_trabajadores" RENAME COLUMN "obraId" TO "proyectoId";
ALTER TABLE "almacenes" RENAME COLUMN "obraId" TO "proyectoId";
ALTER TABLE "solicitudes_cotizacion" RENAME COLUMN "obraId" TO "proyectoId";

-- Migrate estado column from EstadoObra to EstadoProyecto (new type)
ALTER TABLE "proyectos" ALTER COLUMN "estado" DROP DEFAULT;
ALTER TABLE "proyectos" ALTER COLUMN "estado" TYPE "EstadoProyecto"
  USING CASE "estado"::text
    WHEN 'activa' THEN 'ejecucion'::"EstadoProyecto"
    WHEN 'pausada' THEN 'planificacion'::"EstadoProyecto"
    WHEN 'cerrada' THEN 'cierre'::"EstadoProyecto"
    ELSE 'planificacion'::"EstadoProyecto"
  END;
ALTER TABLE "proyectos" ALTER COLUMN "estado" SET DEFAULT 'planificacion';

-- Drop old enum
DROP TYPE "EstadoObra";

-- Add new columns to proyectos
ALTER TABLE "proyectos" ADD COLUMN "parentId" TEXT;
ALTER TABLE "proyectos" ADD COLUMN "ambitoGeografico" "AmbitoGeografico" NOT NULL DEFAULT 'local';
ALTER TABLE "proyectos" ADD COLUMN "notaInicioReal" TEXT;

-- Add self-referencing FK for subproyectos
ALTER TABLE "proyectos" ADD CONSTRAINT "proyectos_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "proyectos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create hitos table
CREATE TABLE "hitos" (
    "id" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "fechaProgramada" TIMESTAMP(3) NOT NULL,
    "evidencia" TEXT,
    "cumplimiento" "CumplimientoHito" NOT NULL DEFAULT 'programado',
    "responsableId" TEXT NOT NULL,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hitos_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "hitos" ADD CONSTRAINT "hitos_proyectoId_fkey"
  FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hitos" ADD CONSTRAINT "hitos_responsableId_fkey"
  FOREIGN KEY ("responsableId") REFERENCES "trabajadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rename indexes for consistency
ALTER INDEX IF EXISTS "obras_pkey" RENAME TO "proyectos_pkey";
ALTER INDEX IF EXISTS "obras_codigo_key" RENAME TO "proyectos_codigo_key";
ALTER INDEX IF EXISTS "obras_supervisores_pkey" RENAME TO "proyectos_supervisores_pkey";
ALTER INDEX IF EXISTS "obras_trabajadores_obraId_trabajadorId_key" RENAME TO "proyectos_trabajadores_proyectoId_trabajadorId_key";
