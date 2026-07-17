-- Optional personal/contact email for a user, separate from the corporate
-- login email. Notifications go to both when set.
ALTER TABLE "users" ADD COLUMN "correoContacto" TEXT;
