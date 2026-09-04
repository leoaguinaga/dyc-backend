CREATE TABLE "pagos_recurrentes" (
  "id" TEXT NOT NULL,
  "concepto" TEXT NOT NULL,
  "categoria" TEXT,
  "centroCosto" TEXT NOT NULL DEFAULT 'administracion',
  "proyectoId" TEXT,
  "beneficiarioNombre" TEXT,
  "banco" TEXT,
  "numeroCuenta" TEXT,
  "cci" TEXT,
  "montoReferencial" DECIMAL(12,2),
  "diaVencimiento" INTEGER NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "creadoPorId" TEXT NOT NULL,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pagos_recurrentes_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "pagos" ADD COLUMN "recurrenciaId" TEXT, ADD COLUMN "periodoRecurrente" TEXT;
ALTER TABLE "pagos_recurrentes" ADD CONSTRAINT "pagos_recurrentes_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pagos_recurrentes" ADD CONSTRAINT "pagos_recurrentes_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_recurrenciaId_fkey" FOREIGN KEY ("recurrenciaId") REFERENCES "pagos_recurrentes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "pagos_recurrentes_activo_diaVencimiento_idx" ON "pagos_recurrentes"("activo", "diaVencimiento");
CREATE UNIQUE INDEX "pagos_recurrenciaId_periodoRecurrente_key" ON "pagos"("recurrenciaId", "periodoRecurrente");
