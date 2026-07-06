-- Agregar descripcion y unidad; hacer itemInventarioId opcional
ALTER TABLE "solicitud_items" ADD COLUMN "descripcion" TEXT NOT NULL DEFAULT '';
ALTER TABLE "solicitud_items" ADD COLUMN "unidad" "UnidadMedida" NOT NULL DEFAULT 'und';
ALTER TABLE "solicitud_items" ALTER COLUMN "itemInventarioId" DROP NOT NULL;

-- Rellenar descripcion con el nombre del item de inventario donde exista
UPDATE "solicitud_items" si
SET "descripcion" = i.nombre, "unidad" = i.unidad
FROM "items_inventario" i
WHERE si."itemInventarioId" = i.id;
