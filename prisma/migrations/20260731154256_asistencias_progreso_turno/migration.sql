-- AlterEnum
BEGIN;
CREATE TYPE "EstadoAsistencia_new" AS ENUM ('presente', 'tardio', 'falta');
ALTER TABLE "asistencias" ALTER COLUMN "estado" TYPE "EstadoAsistencia_new" USING ("estado"::text::"EstadoAsistencia_new");
ALTER TYPE "EstadoAsistencia" RENAME TO "EstadoAsistencia_old";
ALTER TYPE "EstadoAsistencia_new" RENAME TO "EstadoAsistencia";
DROP TYPE "public"."EstadoAsistencia_old";
COMMIT;

-- AlterTable
ALTER TABLE "asistencias" ADD COLUMN     "justificada" BOOLEAN,
ADD COLUMN     "salidaTempranaHora" TEXT,
ADD COLUMN     "salidaTempranaMotivo" TEXT;

