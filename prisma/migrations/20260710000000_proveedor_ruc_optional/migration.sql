-- Allow registering a proveedor without a RUC. RUC is now required only at
-- OC emission time (validated in application code), not at registration.
ALTER TABLE "proveedores" ALTER COLUMN "ruc" DROP NOT NULL;
