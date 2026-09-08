CREATE TYPE "CategoriaServicioProyecto" AS ENUM ('ING', 'MAN');

ALTER TABLE "proyectos"
ADD COLUMN "categoriaServicio" "CategoriaServicioProyecto";
