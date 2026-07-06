-- CreateEnum
CREATE TYPE "EstadoSolicitud" AS ENUM ('borrador', 'enviada', 'cotizada', 'aprobada', 'cancelada');

-- CreateEnum
CREATE TYPE "EstadoCotizacion" AS ENUM ('pendiente', 'recibida', 'aprobada', 'rechazada');

-- CreateTable
CREATE TABLE "solicitudes_cotizacion" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "obraId" TEXT NOT NULL,
    "estado" "EstadoSolicitud" NOT NULL DEFAULT 'borrador',
    "nota" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solicitudes_cotizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitud_items" (
    "id" TEXT NOT NULL,
    "solicitudId" TEXT NOT NULL,
    "itemInventarioId" TEXT NOT NULL,
    "cantidadTotal" DECIMAL(12,2) NOT NULL,
    "cantidadAlmacen" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cantidadCompra" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "solicitud_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizaciones" (
    "id" TEXT NOT NULL,
    "solicitudId" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "estado" "EstadoCotizacion" NOT NULL DEFAULT 'pendiente',
    "fechaRecibida" TIMESTAMP(3),
    "validezDias" INTEGER,
    "nota" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cotizaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizacion_items" (
    "id" TEXT NOT NULL,
    "cotizacionId" TEXT NOT NULL,
    "descripcionProveedor" TEXT NOT NULL,
    "itemInventarioId" TEXT,
    "solicitudItemId" TEXT,
    "precioUnit" DECIMAL(12,2) NOT NULL,
    "cantidad" DECIMAL(12,2) NOT NULL,
    "unidad" "UnidadMedida" NOT NULL,

    CONSTRAINT "cotizacion_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "solicitudes_cotizacion_codigo_key" ON "solicitudes_cotizacion"("codigo");

-- AddForeignKey
ALTER TABLE "solicitudes_cotizacion" ADD CONSTRAINT "solicitudes_cotizacion_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "obras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_items" ADD CONSTRAINT "solicitud_items_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "solicitudes_cotizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_items" ADD CONSTRAINT "solicitud_items_itemInventarioId_fkey" FOREIGN KEY ("itemInventarioId") REFERENCES "items_inventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "solicitudes_cotizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_items" ADD CONSTRAINT "cotizacion_items_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "cotizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_items" ADD CONSTRAINT "cotizacion_items_itemInventarioId_fkey" FOREIGN KEY ("itemInventarioId") REFERENCES "items_inventario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_items" ADD CONSTRAINT "cotizacion_items_solicitudItemId_fkey" FOREIGN KEY ("solicitudItemId") REFERENCES "solicitud_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
