-- turnoConfigId ya fue backfilleado (scripts/backfill-turno-config.ts) — se vuelve requerido
ALTER TABLE "turnos" ALTER COLUMN "turnoConfigId" SET NOT NULL;

-- Reemplaza el índice único: ahora puede haber varias jornadas el mismo día (una por turno)
DROP INDEX "turnos_proyectoId_fecha_key";
CREATE UNIQUE INDEX "turnos_proyectoId_fecha_turnoConfigId_key" ON "turnos"("proyectoId", "fecha", "turnoConfigId");

-- La relación ahora es requerida: ON DELETE RESTRICT (antes SET NULL) — impide borrar un
-- TurnoConfig referenciado por turnos existentes; el borrado lógico es vía TurnoConfig.activo.
ALTER TABLE "turnos" DROP CONSTRAINT "turnos_turnoConfigId_fkey";
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_turnoConfigId_fkey" FOREIGN KEY ("turnoConfigId") REFERENCES "turno_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
