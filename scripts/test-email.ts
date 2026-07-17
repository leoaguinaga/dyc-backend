import 'dotenv/config';
import nodemailer from 'nodemailer';

const TO = process.argv[2];

if (!TO) {
  console.error('❌  Uso: pnpm tsx scripts/test-email.ts destinatario@correo.com');
  process.exit(1);
}

const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, EMAIL_FROM } = process.env;

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
  console.error('❌  Faltan SMTP_HOST / SMTP_USER / SMTP_PASS en .env');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT ? Number(SMTP_PORT) : 587,
  secure: SMTP_SECURE === 'true',
  auth: { user: SMTP_USER, pass: SMTP_PASS },
  logger: true,
  debug: true,
});

async function main() {
  await transporter.verify();
  console.log('✅  Conexión SMTP verificada');

  const info = await transporter.sendMail({
    from: EMAIL_FROM ?? SMTP_USER,
    to: TO,
    subject: 'Prueba SMTP — Díaz y Castillo',
    html: '<p>Este es un correo de prueba enviado desde el backend.</p>',
  });

  console.log('✅  Correo enviado:', info.messageId);
}

main().catch((err) => {
  console.error('❌  Error al enviar:', err);
  process.exit(1);
});
