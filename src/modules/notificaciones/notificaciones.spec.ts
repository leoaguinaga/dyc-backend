import { NotificacionesService } from './notificaciones.service.js';
import { NotificacionesListener } from './notificaciones.listener.js';
import { buildActionEmail } from '../../shared/email/email-template.js';
import { EmailService } from '../../shared/email/email.service.js';
import { hoyLima } from '../../shared/date/fecha.util.js';
import { fn, prismaMock, type PrismaMock } from '../../testing/mocks.js';

const DIA = 86_400_000;
const hoy = hoyLima();

function setup() {
  const prisma: PrismaMock = prismaMock();
  const email = { send: fn(() => Promise.resolve()) };
  const service = new NotificacionesService(prisma as never, email as never);
  return { prisma, email, service };
}

const flush = () => new Promise((r) => setImmediate(r));

describe('NotificacionesService.crearParaUsuarios', () => {
  it('crea una notificación por usuario y envía correo al corporativo y al de contacto', async () => {
    const { service, prisma, email } = setup();
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', email: 'u1@dyc.cl', correoContacto: 'u1@gmail.com' },
      { id: 'u2', email: 'u2@dyc.cl', correoContacto: null },
    ]);
    await service.crearParaUsuarios(['u1', 'u2', 'u1'], {
      tipo: 'requerimiento_aprobado',
      titulo: 'Aprobado',
      mensaje: 'Listo',
      entidadTipo: 'Requerimiento',
      entidadId: 'r1',
    });
    expect(prisma.user.findMany.mock.calls[0][0].where.id.in).toEqual([
      'u1',
      'u2',
    ]);
    expect(prisma.notificacion.createMany.mock.calls[0][0].data).toHaveLength(
      2,
    );
    expect(email.send.mock.calls.map((c: any) => c[0].to)).toEqual([
      'u1@dyc.cl',
      'u1@gmail.com',
      'u2@dyc.cl',
    ]);
    expect(email.send.mock.calls[0][0].html).toContain('/requerimientos/r1');
  });

  it('no hace nada sin destinatarios y respeta enviarEmail=false', async () => {
    const { service, prisma, email } = setup();
    await service.crearParaUsuarios([], {
      tipo: 'obra_cerrada',
      titulo: 't',
      mensaje: 'm',
    });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', email: 'a@x', correoContacto: null },
    ]);
    await service.crearParaUsuarios(
      ['u1'],
      { tipo: 'obra_cerrada', titulo: 't', mensaje: 'm' },
      { enviarEmail: false },
    );
    expect(email.send).not.toHaveBeenCalled();
  });

  it('un error de correo no rompe la creación', async () => {
    const { service, prisma, email } = setup();
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', email: 'a@x', correoContacto: null },
    ]);
    email.send.mockRejectedValue(new Error('smtp caído'));
    await expect(
      service.crearParaUsuarios(['u1'], {
        tipo: 'pago_vencido',
        titulo: 't',
        mensaje: 'm',
        entidadTipo: 'Desconocido',
      }),
    ).resolves.toBeUndefined();
    await flush();
  });

  it('crearParaRoles resuelve usuarios por rol', async () => {
    const { service, prisma } = setup();
    prisma.user.findMany
      .mockResolvedValueOnce([{ id: 'u9' }])
      .mockResolvedValueOnce([]);
    await service.crearParaRoles(['gerencia'], {
      tipo: 'obra_cerrada',
      titulo: 't',
      mensaje: 'm',
    });
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
      role: { in: ['gerencia'] },
    });
  });
});

describe('NotificacionesService — bandeja', () => {
  it('lista, cuenta y marca como leídas solo las del usuario', async () => {
    const { service, prisma } = setup();
    await service.findAllMine('u1', { leida: false });
    expect(prisma.notificacion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', leida: false },
        take: 20,
        skip: 0,
      }),
    );
    prisma.notificacion.count.mockResolvedValue(3);
    expect(await service.countNoLeidas('u1')).toEqual({ count: 3 });
    await service.marcarLeida('n1', 'u1');
    expect(prisma.notificacion.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'n1', userId: 'u1' },
      data: expect.objectContaining({ leida: true }),
    });
    await service.marcarTodasLeidas('u1');
    expect(prisma.notificacion.updateMany).toHaveBeenLastCalledWith({
      where: { userId: 'u1', leida: false },
      data: expect.objectContaining({ leida: true }),
    });
  });
});

describe('NotificacionesService — recordatorios diarios', () => {
  it('revisarPagos avisa vencidos y próximos una vez al día y envía un resumen', async () => {
    const { service, prisma, email } = setup();
    prisma.pago.findMany.mockResolvedValue([
      {
        id: 'p1',
        fechaProgramada: new Date(hoy.getTime() - 2 * DIA),
        monto: '1500',
        concepto: null,
        beneficiarioNombre: null,
        ordenCompra: {
          numero: 'OC-1',
          proveedorNombreLibre: null,
          proveedor: { razonSocial: 'Ferretería' },
        },
      },
      {
        id: 'p2',
        fechaProgramada: new Date(hoy.getTime() + DIA),
        monto: '200',
        concepto: 'Alquiler',
        beneficiarioNombre: null,
        ordenCompra: null,
      },
      {
        id: 'p3',
        fechaProgramada: new Date(hoy.getTime() + 30 * DIA),
        monto: '1',
        concepto: null,
        beneficiarioNombre: null,
        ordenCompra: null,
      },
      {
        id: 'p4',
        fechaProgramada: new Date(hoy.getTime() + DIA),
        monto: '1',
        concepto: null,
        beneficiarioNombre: 'Ya avisado',
        ordenCompra: null,
      },
    ]);
    prisma.notificacion.findFirst.mockImplementation((args: any) =>
      Promise.resolve(args.where.entidadId === 'p4' ? { id: 'n' } : null),
    );
    prisma.user.findMany.mockImplementation((args: any) =>
      Promise.resolve(
        args.select.id
          ? [{ id: 'g1' }]
          : [{ email: 'g@dyc.cl', correoContacto: 'g@gmail.com' }],
      ),
    );
    await service.revisarPagos();
    const mensajes = prisma.notificacion.createMany.mock.calls.map(
      (c: any) => c[0].data[0],
    );
    expect(mensajes.map((m: any) => [m.tipo, m.entidadId])).toEqual([
      ['pago_vencido', 'p1'],
      ['pago_por_vencer', 'p2'],
    ]);
    expect(mensajes[0].mensaje).toContain('Ferretería (OC OC-1) venció');
    expect(email.send).toHaveBeenCalledTimes(2);
    expect(email.send.mock.calls[0][0].subject).toBe(
      'Resumen de pagos que requieren atención',
    );
  });

  it('revisarCobros avisa por obra y no envía resumen si no hay nada', async () => {
    const { service, prisma, email } = setup();
    await service.revisarCobros();
    expect(email.send).not.toHaveBeenCalled();
    prisma.cobro.findMany.mockResolvedValue([
      {
        id: 'c1',
        fechaProgramada: new Date(hoy.getTime() + DIA),
        monto: '5000',
        proyecto: { codigo: '26-001', nombre: 'Obra' },
      },
    ]);
    prisma.user.findMany.mockImplementation((args: any) =>
      Promise.resolve(
        args.select.id
          ? [{ id: 'g1' }]
          : [{ email: 'g@dyc.cl', correoContacto: null }],
      ),
    );
    await service.revisarCobros();
    expect(prisma.notificacion.createMany.mock.calls[0][0].data[0]).toEqual(
      expect.objectContaining({
        tipo: 'cobro_por_vencer',
        entidadTipo: 'Cobro',
      }),
    );
    expect(email.send.mock.calls[0][0].subject).toBe(
      'Resumen de próximos vencimientos de cobros',
    );
  });
});

describe('NotificacionesListener', () => {
  const service = {
    crearParaRoles: fn(() => Promise.resolve()),
    crearParaUsuarios: fn(() => Promise.resolve()),
  };
  const listener = new NotificacionesListener(service as never);
  beforeEach(() => {
    service.crearParaRoles.mockClear();
    service.crearParaUsuarios.mockClear();
  });

  it('avisa a aprobadores, gestores y al creador según el evento', async () => {
    await listener.onRequerimientoCreado({
      requerimientoId: 'r1',
      codigo: 'RQ-1',
      nombre: 'Cemento',
    });
    await listener.onCotizacionRecibida({
      solicitudId: 's1',
      solicitudCodigo: 'SC-1',
      proveedorNombre: 'X',
    });
    await listener.onCotizacionEstadoCambiado({
      solicitudId: 's1',
      solicitudCodigo: 'SC-1',
      estado: 'cotizada',
    });
    await listener.onCotizacionEstadoCambiado({
      solicitudId: 's1',
      solicitudCodigo: 'SC-1',
      estado: 'enviada',
    });
    await listener.onOrdenCompraGenerada({
      ordenCompraId: 'o1',
      numero: 'OC-1',
      proveedorNombre: 'X',
    });
    await listener.onCompraSimpleCreada({
      compraSimpleId: 'c1',
      compraSimpleCodigo: 'CS-1',
      compraSimpleNombre: 'EPP',
      tipo: 'administrativo',
    });
    await listener.onCompraSimpleAprobacionTecnica({
      grupoId: 'g',
      compraSimpleId: 'c1',
      compraSimpleCodigo: 'CS-1',
      compraSimpleNombre: 'EPP',
    });
    await listener.onObraCerrada({
      proyectoId: 'p1',
      codigo: null,
      nombre: 'Obra',
      cerradoPorId: 'u',
    });
    await listener.onCobroCreado({
      cobroId: 'c',
      proyectoId: 'p1',
      codigo: '26-1',
      nombre: 'Obra',
      monto: 1000,
      fechaProgramada: new Date(),
    });
    await listener.onPlanillaGenerada({
      planillaId: 'pl',
      proyectoId: 'p1',
      proyectoNombre: 'Obra',
      periodoInicio: 'a',
      periodoFin: 'b',
      totalGeneral: '10.00',
    });
    const tipos = service.crearParaRoles.mock.calls.map((c: any) => c[1].tipo);
    expect(tipos).toEqual([
      'requerimiento_creado',
      'cotizacion_recibida',
      'solicitud_lista_adjudicar',
      'orden_compra_generada',
      'compra_simple_pendiente_tecnico',
      'compra_simple_pendiente_gerencia',
      'obra_cerrada',
      'cobro_por_vencer',
      'planilla_generada',
    ]);
    expect(service.crearParaRoles.mock.calls[4][0]).toContain('logistica');
  });

  it.each([
    'aprobado',
    'observado',
    'en_cotizacion',
    'pendiente_conformidad',
    'recibido',
    'cancelado',
  ] as const)(
    'cambio de requerimiento a %s avisa al creador',
    async (estado) => {
      await listener.onRequerimientoEstadoCambiado({
        requerimientoId: 'r1',
        codigo: 'RQ-1',
        nombre: 'Cemento',
        estado,
        creadoPorId: 'sup',
      });
      expect(service.crearParaUsuarios).toHaveBeenCalledWith(
        ['sup'],
        expect.objectContaining({ tipo: `requerimiento_${estado}` }),
      );
    },
  );
});

describe('plantilla de correo', () => {
  it('escapa HTML, incluye acción segura y lista de ítems', () => {
    const correo = buildActionEmail({
      title: 'Pago <vencido>',
      message: 'Monto "alto" & urgente',
      tone: 'critical',
      actionLabel: 'Revisar',
      actionUrl: 'https://erp.dyc.pe/pagos',
      reference: 'REF',
      items: [{ title: 'OC-1', detail: 'Vence hoy', emphasis: 'S/ 100' }],
    });
    expect(correo.html).toContain('Pago &lt;vencido&gt;');
    expect(correo.html).toContain('&quot;alto&quot; &amp; urgente');
    expect(correo.html).toContain('https://erp.dyc.pe/pagos');
    expect(correo.html).toContain('S/ 100');
    expect(correo.text).toContain('Revisar');
  });

  it('descarta URLs que no son http(s)', () => {
    const correo = buildActionEmail({
      title: 't',
      message: 'm',
      actionLabel: 'x',
      actionUrl: 'javascript:alert(1)',
    });
    expect(correo.html).not.toContain('javascript:');
    const sinUrl = buildActionEmail({
      title: 't',
      message: 'm',
      actionUrl: 'no es url',
    });
    expect(sinUrl.html).toContain('t');
  });
});

describe('EmailService', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('sin SMTP configurado no envía y avisa una sola vez', async () => {
    delete process.env.SMTP_HOST;
    const service = new EmailService();
    await service.send({ to: 'a@x', subject: 's', html: 'h' });
    await service.send({ to: 'a@x', subject: 's', html: 'h' });
  });

  it('reintenta errores SMTP transitorios y propaga los definitivos', async () => {
    Object.assign(process.env, {
      SMTP_HOST: 'smtp.test',
      SMTP_USER: 'u',
      SMTP_PASS: 'p',
      EMAIL_FROM: 'erp@dyc.pe',
    });
    const service = new EmailService();
    const sendMail = fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('busy'), { responseCode: 421 }),
      )
      .mockResolvedValueOnce({});
    (service as any).transporter = { sendMail };
    const realSetTimeout = global.setTimeout;
    (global as any).setTimeout = (cb: () => void) => realSetTimeout(cb, 0);
    try {
      await service.send({ to: 'a@x', subject: 's', html: 'h' });
      expect(sendMail).toHaveBeenCalledTimes(2);
      expect(sendMail.mock.calls[0][0].from).toBe('erp@dyc.pe');
      sendMail.mockRejectedValueOnce(
        Object.assign(new Error('rechazado'), { responseCode: 550 }),
      );
      await expect(
        service.send({ to: 'a@x', subject: 's', html: 'h' }),
      ).rejects.toThrow('rechazado');
    } finally {
      global.setTimeout = realSetTimeout;
    }
  });
});
