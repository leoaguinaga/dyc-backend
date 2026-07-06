-- Drop tables relacionadas a tracking de inventario
DROP TABLE IF EXISTS "traslado_items" CASCADE;
DROP TABLE IF EXISTS "traslados" CASCADE;
DROP TABLE IF EXISTS "activos" CASCADE;

-- Drop enums que ya no se usan
DROP TYPE IF EXISTS "TipoTraslado";
DROP TYPE IF EXISTS "EstadoActivo";

-- Simplificar almacenes: quitar proyectoId, agregar notas
ALTER TABLE "almacenes" DROP COLUMN IF EXISTS "proyectoId";
ALTER TABLE "almacenes" ADD COLUMN IF NOT EXISTS "notas" TEXT;

-- Agregar notas a items_inventario
ALTER TABLE "items_inventario" ADD COLUMN IF NOT EXISTS "notas" TEXT;
