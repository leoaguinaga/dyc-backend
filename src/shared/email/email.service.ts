import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger('Email');
  private transporter: Transporter | null = null;
  private warned = false;

  constructor() {
    const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return;

    this.transporter = nodemailer.createTransport({
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

    await this.transporter.sendMail({
      from: process.env.EMAIL_FROM ?? process.env.SMTP_USER,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
  }
}
