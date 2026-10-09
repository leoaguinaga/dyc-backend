export type EmailTone = 'action' | 'warning' | 'critical' | 'success' | 'info' | 'security';

export interface ActionEmailInput {
  title: string;
  message: string;
  tone?: EmailTone;
  actionLabel?: string;
  actionUrl?: string;
  reference?: string;
  preheader?: string;
  footer?: string;
  items?: Array<{ title: string; detail?: string; emphasis?: string }>;
}

const TONES: Record<EmailTone, { accent: string; soft: string; label: string }> = {
  action: { accent: '#2563eb', soft: '#eff6ff', label: 'ACCIÓN REQUERIDA' },
  warning: { accent: '#b45309', soft: '#fffbeb', label: 'PRÓXIMO VENCIMIENTO' },
  critical: { accent: '#b91c1c', soft: '#fef2f2', label: 'ATENCIÓN PRIORITARIA' },
  success: { accent: '#047857', soft: '#ecfdf5', label: 'ACTUALIZACIÓN CONFIRMADA' },
  info: { accent: '#334155', soft: '#f8fafc', label: 'ACTUALIZACIÓN DEL SISTEMA' },
  security: { accent: '#4338ca', soft: '#eef2ff', label: 'SEGURIDAD DE TU CUENTA' },
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

function safeUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Plantilla transaccional compartida. Usa estilos inline para que Gmail y Outlook
 * conserven la jerarquía visual sin depender de CSS externo.
 */
export function buildActionEmail(input: ActionEmailInput) {
  const tone = TONES[input.tone ?? 'info'];
  const title = escapeHtml(input.title);
  const message = escapeHtml(input.message).replace(/\n/g, '<br />');
  const reference = input.reference ? escapeHtml(input.reference) : undefined;
  const actionLabel = input.actionLabel ? escapeHtml(input.actionLabel) : undefined;
  const actionUrl = safeUrl(input.actionUrl);
  const footer = escapeHtml(
    input.footer ?? 'Este es un aviso automático del sistema de Díaz y Castillo.',
  );
  const preheader = escapeHtml(input.preheader ?? input.message);
  const itemRows = input.items?.map((item) => {
    const detail = item.detail ? `<div style="margin-top:3px;color:#64748b;font-size:12px;line-height:1.45;">${escapeHtml(item.detail)}</div>` : '';
    const emphasis = item.emphasis ? `<td align="right" style="padding:14px 0 14px 16px;color:#172033;font-size:13px;font-weight:700;white-space:nowrap;vertical-align:top;">${escapeHtml(item.emphasis)}</td>` : '';
    return `<tr><td style="padding:14px 0;border-bottom:1px solid #e2e8f0;color:#172033;font-size:13px;font-weight:700;line-height:1.4;vertical-align:top;">${escapeHtml(item.title)}${detail}</td>${emphasis}</tr>`;
  }).join('') ?? '';
  const itemList = itemRows ? `<div style="margin-top:24px;"><div style="margin:0 0 8px;color:#172033;font-size:11px;font-weight:700;letter-spacing:.08em;">DETALLE</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${itemRows}</table></div>` : '';

  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f7fb;color:#172033;font-family:Aptos,'Segoe UI',Helvetica,sans-serif;">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f7fb;">
      <tr><td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;">
          <tr><td style="padding:0 4px 18px;font-size:14px;font-weight:700;letter-spacing:.01em;color:#172033;">DÍAZ Y CASTILLO <span style="font-weight:400;color:#64748b;">| Sistema de gestión</span></td></tr>
          <tr><td style="background:#ffffff;border-radius:12px;overflow:hidden;">
            <div style="height:5px;background:${tone.accent};line-height:5px;font-size:5px;">&nbsp;</div>
            <div style="padding:32px 32px 28px;">
              <div style="display:inline-block;margin:0 0 18px;padding:7px 10px;border-radius:999px;background:${tone.soft};color:${tone.accent};font-size:11px;font-weight:700;letter-spacing:.08em;line-height:1;">${tone.label}</div>
              <h1 style="margin:0 0 16px;color:#172033;font-size:25px;line-height:1.22;font-weight:700;letter-spacing:-.02em;">${title}</h1>
              <p style="margin:0;color:#475569;font-size:16px;line-height:1.65;">${message}</p>
              ${reference ? `<div style="margin:24px 0 0;padding:14px 16px;background:#f8fafc;border-radius:8px;color:#475569;font-size:13px;line-height:1.5;"><strong style="display:block;margin-bottom:3px;color:#172033;font-size:11px;letter-spacing:.08em;">REFERENCIA</strong>${reference}</div>` : ''}
              ${itemList}
              ${actionLabel && actionUrl ? `<div style="margin-top:28px;"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:13px 18px;border-radius:8px;background:${tone.accent};color:#ffffff;font-size:14px;font-weight:700;line-height:1;text-decoration:none;">${actionLabel}</a></div>` : ''}
            </div>
          </td></tr>
          <tr><td style="padding:18px 8px 0;color:#64748b;font-size:12px;line-height:1.55;">${footer}</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    'DÍAZ Y CASTILLO — Sistema de gestión',
    '',
    input.title,
    '',
    input.message,
    ...(input.reference ? ['', `Referencia: ${input.reference}`] : []),
    ...(input.items?.flatMap((item) => [`- ${item.title}${item.detail ? `: ${item.detail}` : ''}${item.emphasis ? ` (${item.emphasis})` : ''}`]) ?? []),
    ...(actionLabel && actionUrl ? ['', `${actionLabel}: ${actionUrl}`] : []),
    '',
    input.footer ?? 'Este es un aviso automático del sistema de Díaz y Castillo.',
  ].join('\n');

  return { html, text };
}

export interface DocumentEmailInput {
  /** Texto de la insignia de estado, p. ej. "Orden emitida". */
  statusLabel: string;
  tone?: EmailTone;
  title: string;
  /** Rótulo y valor destacados, p. ej. "MONTO TOTAL" / "S/ 4,850.00". */
  amountLabel: string;
  amount: string;
  amountNote?: string;
  details: Array<{ label: string; value: string; critical?: boolean }>;
  /** Nombres de los archivos adjuntos, mostrados como fichas. */
  attachments?: string[];
  primaryAction: { label: string; url: string };
  secondaryAction?: { label: string; url: string };
  detailLink?: { label: string; url: string };
  preheader?: string;
  footer?: string;
}

/**
 * Plantilla para avisos sobre un documento con monto (orden de compra, pago): el monto manda,
 * la ficha se lee de un vistazo y hay una acción principal. Misma base visual que
 * `buildActionEmail`; estilos inline y sin emojis para que Outlook no los renderice distinto.
 */
export function buildDocumentEmail(input: DocumentEmailInput) {
  const tone = TONES[input.tone ?? 'info'];
  const footer = escapeHtml(input.footer ?? 'Este es un aviso automático del sistema de Díaz y Castillo.');
  const preheader = escapeHtml(input.preheader ?? `${input.title} · ${input.amount}`);
  const primaryUrl = safeUrl(input.primaryAction.url);
  const secondaryUrl = input.secondaryAction ? safeUrl(input.secondaryAction.url) : undefined;
  const detailUrl = input.detailLink ? safeUrl(input.detailLink.url) : undefined;

  const rows = input.details
    .map(
      (d) =>
        `<tr><td style="padding:7px 16px 7px 0;color:#64748b;font-size:13px;line-height:1.45;vertical-align:top;white-space:nowrap;">${escapeHtml(d.label)}</td><td style="padding:7px 0;color:${d.critical ? '#b91c1c' : '#172033'};font-size:13px;font-weight:700;line-height:1.45;vertical-align:top;">${escapeHtml(d.value)}</td></tr>`,
    )
    .join('');
  const chips = (input.attachments ?? [])
    .map(
      (name) =>
        `<span style="display:inline-block;margin:0 6px 6px 0;padding:5px 10px;border:1px solid #e2e8f0;border-radius:6px;background:#f8fafc;color:#334155;font-size:12px;">${escapeHtml(name)}</span>`,
    )
    .join('');
  const primary = primaryUrl
    ? `<a href="${escapeHtml(primaryUrl)}" style="display:inline-block;margin:0 10px 10px 0;padding:13px 18px;border-radius:8px;background:${tone.accent};color:#ffffff;font-size:14px;font-weight:700;line-height:1;text-decoration:none;">${escapeHtml(input.primaryAction.label)}</a>`
    : '';
  const secondary =
    input.secondaryAction && secondaryUrl
      ? `<a href="${escapeHtml(secondaryUrl)}" style="display:inline-block;margin:0 10px 10px 0;padding:12px 17px;border-radius:8px;border:1px solid #94a3b8;background:#ffffff;color:#172033;font-size:14px;font-weight:700;line-height:1;text-decoration:none;">${escapeHtml(input.secondaryAction.label)}</a>`
      : '';
  const detail =
    input.detailLink && detailUrl
      ? `<div style="margin-top:6px;"><a href="${escapeHtml(detailUrl)}" style="color:#2563eb;font-size:13px;text-decoration:underline;">${escapeHtml(input.detailLink.label)}</a></div>`
      : '';

  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f7fb;color:#172033;font-family:Aptos,'Segoe UI',Helvetica,sans-serif;">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f7fb;">
      <tr><td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;">
          <tr><td style="padding:0 4px 18px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
              <td style="font-size:14px;font-weight:700;letter-spacing:.01em;color:#172033;">DÍAZ Y CASTILLO <span style="font-weight:400;color:#64748b;">| Sistema de gestión</span></td>
              <td align="right"><span style="display:inline-block;padding:7px 10px;border-radius:999px;background:${tone.soft};color:${tone.accent};font-size:11px;font-weight:700;letter-spacing:.06em;line-height:1;">${escapeHtml(input.statusLabel.toUpperCase())}</span></td>
            </tr></table>
          </td></tr>
          <tr><td style="background:#ffffff;border-radius:12px;overflow:hidden;">
            <div style="height:5px;background:${tone.accent};line-height:5px;font-size:5px;">&nbsp;</div>
            <div style="padding:30px 32px 28px;">
              <h1 style="margin:0 0 20px;color:#172033;font-size:16px;line-height:1.4;font-weight:700;">${escapeHtml(input.title)}</h1>
              <div style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:.08em;">${escapeHtml(input.amountLabel)}</div>
              <div style="margin:4px 0 0;color:#172033;font-size:34px;line-height:1.15;font-weight:700;letter-spacing:-.02em;">${escapeHtml(input.amount)}${input.amountNote ? ` <span style="font-size:14px;font-weight:600;color:#64748b;letter-spacing:0;">${escapeHtml(input.amountNote)}</span>` : ''}</div>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0;">${rows}</table>
              ${chips ? `<div style="margin:0 0 6px;">${chips}</div>` : ''}
              <div style="margin-top:22px;">${primary}${secondary}</div>
              ${detail}
            </div>
          </td></tr>
          <tr><td style="padding:18px 8px 0;color:#64748b;font-size:12px;line-height:1.55;">${footer}</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    'DÍAZ Y CASTILLO — Sistema de gestión',
    '',
    `[${input.statusLabel}] ${input.title}`,
    '',
    `${input.amountLabel}: ${input.amount}${input.amountNote ? ` ${input.amountNote}` : ''}`,
    ...input.details.map((d) => `${d.label}: ${d.value}`),
    ...(input.attachments?.length ? ['', `Adjuntos: ${input.attachments.join(', ')}`] : []),
    '',
    ...(primaryUrl ? [`${input.primaryAction.label}: ${primaryUrl}`] : []),
    ...(input.secondaryAction && secondaryUrl ? [`${input.secondaryAction.label}: ${secondaryUrl}`] : []),
    ...(input.detailLink && detailUrl ? [`${input.detailLink.label}: ${detailUrl}`] : []),
    '',
    input.footer ?? 'Este es un aviso automático del sistema de Díaz y Castillo.',
  ].join('\n');

  return { html, text };
}
