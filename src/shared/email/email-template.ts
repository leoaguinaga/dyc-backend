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
