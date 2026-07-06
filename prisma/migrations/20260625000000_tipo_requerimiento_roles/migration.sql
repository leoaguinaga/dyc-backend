-- Add new specialized roles to Role enum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'supervisor_civil';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'supervisor_electrico';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'pdr';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ing_civil';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ing_electrico';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'jefe_sig';

-- Create TipoRequerimiento enum
CREATE TYPE "TipoRequerimiento" AS ENUM ('electrico', 'civil', 'seguridad', 'administrativo');

-- Add tipo to requerimientos (default civil for existing rows)
ALTER TABLE "requerimientos" ADD COLUMN "tipo" "TipoRequerimiento" NOT NULL DEFAULT 'civil';
