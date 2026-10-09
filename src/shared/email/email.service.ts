import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

const MAX_ATTEMPTS = 3;

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger('Email');
  private transporter: Transporter | null = null;
  private warned = false;

  constructor() {
    const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return;

    // Pool: reutiliza pocas conexiones y encola el resto. Sin pool, cada sendMail
    // abre su propia conexión y los envíos en ráfaga provocan 421 "Too many
    // concurrent SMTP connections".
    this.transporter = nodemailer.createTransport({
      pool: true,
      maxConnections: Number(process.env.SMTP_MAX_CONNECTIONS ?? 2),
      maxMessages: 100,
      host: SMTP_HOST,
      port: SMTP_PORT ? Number(SMTP_PORT) : 587,
      secure: SMTP_SECURE === 'true',
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }

  async send(input: SendEmailInput): Promise<void> {
    if (!this.transporter) {
      if (!this.warned) {
        this.logger.warn('SMTP no configurado (SMTP_HOST/SMTP_USER/SMTP_PASS) — los emails no se enviarán.');
        this.warned = true;
      }
      return;
    }

    const mail = {
      from: process.env.EMAIL_FROM ?? process.env.SMTP_USER,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: input.attachments,
    };

    // Reintenta errores SMTP transitorios (4xx, p. ej. 421) con backoff.
    for (let attempt = 1; ; attempt++) {
      try {
        await this.transporter.sendMail(mail);
        return;
      } catch (err) {
        const code = (err as { responseCode?: number }).responseCode;
        const transient = code !== undefined && code >= 400 && code < 500;
        if (!transient || attempt >= MAX_ATTEMPTS) throw err;
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  }
}
