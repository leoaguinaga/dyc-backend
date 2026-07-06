-- Nuevos enums
CREATE TYPE "EstadoRequerimiento" AS ENUM ('borrador', 'enviado', 'aprobado', 'rechazado');

-- Agregar nuevos valores al enum EstadoSolicitud
ALTER TYPE "EstadoSolicitud" ADD VALUE IF NOT EXISTS 'seleccionada';
ALTER TYPE "EstadoSolicitud" ADD VALUE IF NOT EXISTS 'aprobada_solicitante';
ALTER TYPE "EstadoSolicitud" ADD VALUE IF NOT EXISTS 'aprobada_gerencia';

-- Catálogo de productos por proveedor
CREATE TABLE "catalogo_productos_proveedor" (
  "id"          TEXT NOT NULL,
  "proveedorId" TEXT NOT NULL,
  "descripcion" TEXT NOT NULL,
  "precioRef"   DECIMAL(12,2) NOT NULL,
  "unidad"      "UnidadMedida" NOT NULL DEFAULT 'und',
  "vigente"     BOOLEAN NOT NULL DEFAULT true,
  "nota"        TEXT,
  "creadoEn"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "catalogo_productos_proveedor_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalogo_productos_proveedor_proveedorId_fkey"
    FOREIGN KEY ("proveedorId") REFERENCES "proveedores"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Requerimientos
CREATE TABLE "requerimientos" (
  "id"            TEXT NOT NULL,
  "codigo"        TEXT NOT NULL,
  "proyectoId"    TEXT NOT NULL,
  "creadoPorId"   TEXT NOT NULL,
  "estado"        "EstadoRequerimiento" NOT NULL DEFAULT 'borrador',
  "urgente"       BOOLEAN NOT NULL DEFAULT false,
  "nota"          TEXT,
  "notaRevision"  TEXT,
  "creadoEn"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "requerimientos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "requerimientos_codigo_key" UNIQUE ("codigo"),
  CONSTRAINT "requerimientos_proyectoId_fkey"
    FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "requerimientos_creadoPorId_fkey"
    FOREIGN KEY ("creadoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Items de requerimiento
CREATE TABLE "requerimiento_items" (
  "id"              TEXT NOT NULL,
  "requerimientoId" TEXT NOT NULL,
  "descripcion"     TEXT NOT NULL,
  "cantidad"        DECIMAL(12,2) NOT NULL,
  "unidad"          "UnidadMedida" NOT NULL DEFAULT 'und',
  "nota"            TEXT,

  CONSTRAINT "requerimiento_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "requerimiento_items_requerimientoId_fkey"
    FOREIGN KEY ("requerimientoId") REFERENCES "requerimientos"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Vincular SolicitudCotizacion con Requerimiento
ALTER TABLE "solicitudes_cotizacion" ADD COLUMN IF NOT EXISTS "requerimientoId" TEXT;
ALTER TABLE "solicitudes_cotizacion"
  ADD CONSTRAINT "solicitudes_cotizacion_requerimientoId_fkey"
  FOREIGN KEY ("requerimientoId") REFERENCES "requerimientos"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
