import { PagosImportService } from './importacion.service.js';
import type { PlanImportacion } from './importacion.service.js';
import type { FilaCruda } from './lector-xlsx.js';

type Fila = Record<string, unknown>;

/** Fila del Excel con valores válidos; cada test pisa lo que le interesa. */
function fila(numero: number, valores: Fila = {}): FilaCruda {
  return {
    fila: numero,
    valores: {
      subComprobante: '262248,1',
      comprobante: '262248',
      fecha: '25/09/2026',
      importe: 'S/180,00',
      tipoOperacion: 'TRANSFERENCIA',
      banco: 'BCP-D&C INGENIERIA Y PROYECTOS',
      cuenta: '305-98401930-95',
      tipoGasto: 'VIATICOS',
      detalle: 'HOSPEDAJE DEL 25 AL 28/09',
      responsable: 'PALMA MENDOZA CARLOS LUIS',
      proveedor: 'NO APLICA',
      cuentaProveedor: '0',
      centroCosto: '022-ING-26',
      descCentroCosto: 'VIDEO WALL PUCALLPA',
      importeRendido: 'S/180,00',
      generoComprobante: 'JESSICA MEDRANO CARRASCO',
      estadoRendicion: 'CERRADO',
      empresa: 'D&C INGENIERIA Y PROYECTOS SAC',
      ruc: '20608745611',
      ...valores,
    },
  };
}

interface Escenario {
  existentes?: Fila[];
  candidatos?: Fila[];
  cuentas?: Fila[];
}

function montar({
  existentes = [],
  candidatos = [],
  cuentas = [],
}: Escenario = {}) {
  const llamadas = {
    createMany: [] as Fila[][],
    empresaCreate: [] as Fila[],
    cuentaCreate: [] as Fila[],
    proyectoCreate: [] as Fila[],
    pagoUpdate: [] as { where: Fila; data: Fila }[],
    importacion: [] as Fila[],
  };
  const pagoActual: Fila = {
    id: 'pg-viejo',
    estado: 'pendiente',
    fechaPagoReal: null,
    codigoComprobante: null,
    subNumero: 1,
    metodoPago: null,
    categoria: null,
    concepto: 'Hospedaje',
    numeroCuenta: null,
    beneficiarioNombre: null,
    ordenCompraId: null,
    empresaId: null,
    cuentaOrigenId: null,
    responsableRendicionId: null,
    responsableRendicionNombre: null,
    importeRendido: null,
    estadoRendicion: null,
    generadoPorNombre: null,
    pagadoPorId: null,
  };

  const prisma: Record<string, unknown> = {
    proyecto: {
      findMany: () =>
        Promise.resolve([
          { id: 'p-022', codigo: '022-ING-26', nombre: 'VIDEO WALL PUCALLPA' },
          {
            id: 'p-025',
            codigo: '025-ING-26',
            nombre: 'TIENDA BCS ADIDAS SAN MIGUEL',
          },
        ]),
      create: (args: { data: Fila }) => {
        llamadas.proyectoCreate.push(args.data);
        return Promise.resolve({ id: `nuevo-${args.data.codigo as string}` });
      },
    },
    empresa: {
      findMany: () =>
        Promise.resolve([
          { id: 'e-dyc', ruc: '20608745611', razonSocial: 'DYC' },
        ]),
      findUnique: ({ where }: { where: { ruc: string } }) =>
        Promise.resolve(where.ruc === '20608745611' ? { id: 'e-dyc' } : null),
      create: (args: { data: Fila }) => {
        llamadas.empresaCreate.push(args.data);
        return Promise.resolve({ id: 'e-nueva' });
      },
    },
    cuentaEmpresa: {
      findMany: () => Promise.resolve(cuentas),
      create: (args: { data: Fila }) => {
        llamadas.cuentaCreate.push(args.data);
        return Promise.resolve({ id: 'c-nueva' });
      },
    },
    trabajador: {
      findMany: () =>
        Promise.resolve([
          { id: 't-palma', nombre: 'Carlos Luis Palma Mendoza' },
        ]),
    },
    user: {
      findMany: () =>
        Promise.resolve([
          { id: 'u-jessica', name: 'Jessica Medrano Carrasco' },
        ]),
    },
    pagoRecurrente: { findMany: () => Promise.resolve([]) },
    pago: {
      findMany: (args: {
        distinct?: string[];
        where: { codigoComprobante?: unknown };
      }) => {
        if (args.distinct) return Promise.resolve([]);
        if (args.where.codigoComprobante === null)
          return Promise.resolve(candidatos);
        return Promise.resolve(existentes);
      },
      createMany: (args: { data: Fila[] }) => {
        llamadas.createMany.push(args.data);
        return Promise.resolve({ count: args.data.length });
      },
      findUniqueOrThrow: () => Promise.resolve({ ...pagoActual }),
      update: (args: { where: Fila; data: Fila }) => {
        llamadas.pagoUpdate.push(args);
        return Promise.resolve({});
      },
    },
    importacionPagos: {
      create: (args: { data: Fila }) => {
        llamadas.importacion.push(args.data);
        return Promise.resolve({ id: 'lote-1' });
      },
      update: (args: { data: Fila }) => {
        llamadas.importacion.push(args.data);
        return Promise.resolve({});
      },
    },
  };
  prisma.$transaction = (fn: (tx: unknown) => Promise<unknown>) => fn(prisma);
  return { servicio: new PagosImportService(prisma as never), llamadas };
}

const pagoExistente = (extra: Fila = {}) => ({
  id: 'pg-existente',
  codigoComprobante: '26-2248',
  subNumero: 1,
  monto: 180,
  fechaPagoReal: new Date(Date.UTC(2026, 8, 25)),
  fechaProgramada: new Date(Date.UTC(2026, 8, 25)),
  estado: 'pagado',
  ...extra,
});

const candidato = (extra: Fila = {}) => ({
  id: 'pg-viejo',
  monto: 180,
  estado: 'pagado',
  fechaProgramada: new Date(Date.UTC(2026, 8, 24)),
  fechaPagoReal: new Date(Date.UTC(2026, 8, 26)),
  proyectoId: 'p-022',
  concepto: 'Hospedaje',
  beneficiarioNombre: null,
  ordenCompra: null,
  ...extra,
});

describe('PagosImportService.planificar', () => {
  it('una fila válida se crea y deja todo resuelto (código, obra, trabajador, usuario, rendición)', async () => {
    const { servicio } = montar();
    const plan = await servicio.planificar([fila(4)], 'pagos.xlsx');

    expect(plan.resumen).toMatchObject({ crear: 1, error: 0, montoCrear: 180 });
    const d = plan.filas[0].datos!;
    expect(plan.filas[0].comprobante).toBe('26-2248.1');
    expect(d).toMatchObject({
      codigoComprobante: '26-2248',
      subNumero: 1,
      monto: 180,
      metodoPago: 'Transferencia',
      centroCosto: 'obra',
      tipoBeneficiario: 'trabajador', // proveedor "NO APLICA" → el dinero fue al responsable
      beneficiarioNombre: 'PALMA MENDOZA CARLOS LUIS',
      beneficiarioTrabajadorId: 't-palma', // "APELLIDOS NOMBRES" se vincula con "Nombres Apellidos"
      responsableTrabajadorId: 't-palma',
      numeroCuenta: null, // "0"
      importeRendido: 180,
      estadoRendicion: 'cerrado',
      generadoPorUserId: 'u-jessica',
      empresaRuc: '20608745611',
      cuentaOrigen: {
        banco: 'BCP-D&C INGENIERIA Y PROYECTOS',
        numero: '305-98401930-95',
      },
    });
    expect(d.proyecto).toMatchObject({ id: 'p-022', nuevo: false });
    expect(d.fecha.toISOString().slice(0, 10)).toBe('2026-09-25');
    expect(plan.cuentasNuevas).toEqual([
      {
        ruc: '20608745611',
        banco: 'BCP-D&C INGENIERIA Y PROYECTOS',
        numero: '305-98401930-95',
      },
    ]);
    expect(plan.categoriasNuevas).toEqual(['VIATICOS']);
  });

  it('con proveedor, ese es el beneficiario y administración no se vincula a una persona', async () => {
    const { servicio } = montar();
    const plan = await servicio.planificar(
      [
        fila(4, {
          responsable: 'ADMINISTRACION',
          proveedor: 'H&M FERRETERO CASTILLO',
          cuentaProveedor: '1912675233054',
        }),
      ],
      'pagos.xlsx',
    );
    expect(plan.filas[0].datos).toMatchObject({
      tipoBeneficiario: 'proveedor',
      beneficiarioNombre: 'H&M FERRETERO CASTILLO',
      numeroCuenta: '1912675233054',
      responsableNombre: 'ADMINISTRACION',
      responsableTrabajadorId: null,
    });
    expect(plan.personasSinVincular).toEqual([]);
  });

  it('gasto de oficina: centro de costo vacío/0/ADMINISTRACION', async () => {
    const { servicio } = montar();
    const plan = await servicio.planificar(
      [fila(4, { centroCosto: '0', descCentroCosto: '' })],
      'pagos.xlsx',
    );
    expect(plan.filas[0].datos).toMatchObject({
      centroCosto: 'administracion',
    });
    expect(plan.filas[0].datos!.proyecto.id).toBeNull();
  });

  it('una obra inexistente es error y se lista como faltante con su importe; con crearProyectos se da de alta', async () => {
    const { servicio } = montar();
    const sin = await servicio.planificar(
      [
        fila(4, {
          centroCosto: '019-26-04',
          descCentroCosto: 'ESTACION LA CULTURA',
        }),
      ],
      'pagos.xlsx',
    );
    expect(sin.filas[0].accion).toBe('error');
    expect(sin.filas[0].mensajes[0].texto).toMatch(/019-26-04.*no existe/);
    expect(sin.proyectosFaltantes).toEqual([
      {
        codigo: '019-26-04',
        descripcion: 'ESTACION LA CULTURA',
        filas: 1,
        monto: 180,
      },
    ]);

    const con = await servicio.planificar(
      [
        fila(4, {
          centroCosto: '019-26-04',
          descCentroCosto: 'ESTACION LA CULTURA',
        }),
      ],
      'pagos.xlsx',
      { crearProyectos: true },
    );
    expect(con.filas[0].accion).toBe('crear');
    expect(con.filas[0].datos!.proyecto).toMatchObject({
      nuevo: true,
      codigo: '019-26-04',
      nombreNuevo: 'ESTACION LA CULTURA',
    });
  });

  it('sugiere la obra parecida cuando el código está mal escrito pero la descripción coincide', async () => {
    const { servicio } = montar();
    const plan = await servicio.planificar(
      [
        fila(4, {
          centroCosto: '22-ING-26',
          descCentroCosto: 'VIDEO WALL PUCALLPA',
        }),
      ],
      'pagos.xlsx',
    );
    expect(plan.filas[0].mensajes[0].texto).toMatch(
      /¿será 022-ING-26 - VIDEO WALL PUCALLPA\?/,
    );
  });

  it('avisa si la descripción no parece la obra del código', async () => {
    const { servicio } = montar();
    const plan = await servicio.planificar(
      [fila(4, { descCentroCosto: 'ESTACION LA CULTURA' })],
      'pagos.xlsx',
    );
    expect(plan.filas[0].accion).toBe('crear');
    expect(
      plan.filas[0].mensajes.some(
        (m) => m.nivel === 'aviso' && /no parece la obra/.test(m.texto),
      ),
    ).toBe(true);
  });

  it.each([
    ['importe vacío', { importe: '' }, /Falta el importe/],
    ['importe cero', { importe: 'S/0,00' }, /mayor que cero/],
    ['importe en dólares', { importe: 'US$ 100' }, /solo maneja soles/],
    ['fecha inexistente', { fecha: '31/02/2026' }, /fecha inexistente/],
    ['sin fecha', { fecha: '' }, /Falta la fecha/],
    [
      'sin comprobante',
      { comprobante: '', subComprobante: '' },
      /Falta el N° de comprobante/,
    ],
    [
      'sub que no corresponde al comprobante',
      { subComprobante: '262249,1' },
      /no corresponde/,
    ],
    [
      'RUC con dígito verificador malo',
      { ruc: '20608745612' },
      /RUC de la empresa inválido/,
    ],
    [
      'estado de rendición desconocido',
      { estadoRendicion: 'PENDIENTE' },
      /no reconocido/,
    ],
  ])('error: %s', async (_nombre, valores, mensaje) => {
    const { servicio } = montar();
    const plan = await servicio.planificar([fila(4, valores)], 'pagos.xlsx');
    expect(plan.filas[0].accion).toBe('error');
    expect(
      plan.filas[0].mensajes.some(
        (m) => m.nivel === 'error' && mensaje.test(m.texto),
      ),
    ).toBe(true);
    expect(plan.filas[0].datos).toBeUndefined();
  });

  it('una empresa nueva necesita razón social; con ella se da de alta', async () => {
    const { servicio } = montar();
    const sin = await servicio.planificar(
      [fila(4, { ruc: '20100070970', empresa: '' })],
      'pagos.xlsx',
    );
    expect(sin.filas[0].accion).toBe('error');
    const con = await servicio.planificar(
      [fila(4, { ruc: '20100070970', empresa: 'SUPERMERCADOS PERUANOS SA' })],
      'pagos.xlsx',
    );
    expect(con.filas[0].accion).toBe('crear');
    expect(con.empresasNuevas).toEqual([
      { ruc: '20100070970', razonSocial: 'SUPERMERCADOS PERUANOS SA' },
    ]);
  });

  it('RUC vacío asume la empresa por defecto', async () => {
    const { servicio } = montar();
    const plan = await servicio.planificar(
      [fila(4, { ruc: '', empresa: '' })],
      'pagos.xlsx',
    );
    expect(plan.filas[0].datos!.empresaRuc).toBe('20608745611');
  });

  it('el mismo comprobante dos veces en el archivo: la segunda fila es error; numerando la línea, no', async () => {
    const { servicio } = montar();
    const repetido = await servicio.planificar(
      [fila(4), fila(5)],
      'pagos.xlsx',
    );
    expect(repetido.filas.map((f) => f.accion)).toEqual(['crear', 'error']);
    expect(repetido.filas[1].mensajes[0].texto).toMatch(
      /ya aparece en la fila 4/,
    );

    const lineas = await servicio.planificar(
      [fila(4), fila(5, { subComprobante: '262248,2' })],
      'pagos.xlsx',
    );
    expect(lineas.filas.map((f) => f.accion)).toEqual(['crear', 'crear']);
    expect(lineas.filas[1].datos!.subNumero).toBe(2);
  });

  it('filtra por rango de fechas y cuenta lo que queda fuera', async () => {
    const { servicio } = montar();
    const plan = await servicio.planificar(
      [
        fila(4),
        fila(5, {
          subComprobante: '',
          comprobante: '262100',
          fecha: '10/08/2026',
        }),
      ],
      'pagos.xlsx',
      { desde: new Date(Date.UTC(2026, 7, 15)) },
    );
    expect(plan.filas).toHaveLength(1);
    expect(plan.fueraDeRango).toBe(1);
  });

  describe('duplicados', () => {
    it('mismo código y mismo importe en el sistema → se omite', async () => {
      const { servicio } = montar({ existentes: [pagoExistente()] });
      const plan = await servicio.planificar([fila(4)], 'pagos.xlsx');
      expect(plan.filas[0]).toMatchObject({
        accion: 'omitir',
        pagoExistenteId: 'pg-existente',
      });
    });

    it('mismo código pero otro importe → revisar, sin tocar nada', async () => {
      const { servicio } = montar({
        existentes: [pagoExistente({ monto: 200 })],
      });
      const plan = await servicio.planificar([fila(4)], 'pagos.xlsx');
      expect(plan.filas[0].accion).toBe('revisar');
      expect(plan.filas[0].mensajes[0].texto).toMatch(
        /Excel S\/ 180.00 vs sistema S\/ 200.00/,
      );
    });

    it('la línea cuenta: el sistema tiene 26-2248.1 y el Excel trae la .2 → es nuevo', async () => {
      const { servicio } = montar({ existentes: [pagoExistente()] });
      const plan = await servicio.planificar(
        [fila(4, { subComprobante: '262248,2' })],
        'pagos.xlsx',
      );
      expect(plan.filas[0].accion).toBe('crear');
    });

    it('pago registrado a mano sin código (mismo importe, obra y fecha cercana) → revisar por defecto', async () => {
      const { servicio } = montar({ candidatos: [candidato()] });
      const plan = await servicio.planificar([fila(4)], 'pagos.xlsx');
      expect(plan.filas[0]).toMatchObject({
        accion: 'revisar',
        candidatos: ['pg-viejo'],
      });
      expect(plan.filas[0].mensajes[0].texto).toMatch(/--vincular/);
    });

    it('con vincular y un único candidato → enlazar', async () => {
      const { servicio } = montar({ candidatos: [candidato()] });
      const plan = await servicio.planificar([fila(4)], 'pagos.xlsx', {
        vincular: true,
      });
      expect(plan.filas[0]).toMatchObject({
        accion: 'vincular',
        pagoExistenteId: 'pg-viejo',
      });
    });

    it('varios candidatos → revisar a mano aunque se pida vincular', async () => {
      const { servicio } = montar({
        candidatos: [candidato(), candidato({ id: 'pg-otro' })],
      });
      const plan = await servicio.planificar([fila(4)], 'pagos.xlsx', {
        vincular: true,
      });
      expect(plan.filas[0]).toMatchObject({
        accion: 'revisar',
        candidatos: ['pg-viejo', 'pg-otro'],
      });
    });

    it('un candidato no puede reclamarlo dos filas', async () => {
      const { servicio } = montar({ candidatos: [candidato()] });
      const plan = await servicio.planificar(
        [
          fila(4),
          fila(5, { subComprobante: '262249,1', comprobante: '262249' }),
        ],
        'pagos.xlsx',
        { vincular: true },
      );
      expect(plan.filas.map((f) => f.accion)).toEqual(['vincular', 'crear']);
    });

    it.each([
      ['otro importe', { monto: 181 }],
      ['otra obra', { proyectoId: 'p-025' }],
      [
        'pagado hace 10 días',
        {
          fechaPagoReal: new Date(Date.UTC(2026, 8, 15)),
          fechaProgramada: new Date(Date.UTC(2026, 8, 15)),
        },
      ],
    ])('no es candidato si cambia: %s', async (_nombre, extra) => {
      const { servicio } = montar({ candidatos: [candidato(extra)] });
      const plan = await servicio.planificar([fila(4)], 'pagos.xlsx', {
        vincular: true,
      });
      expect(plan.filas[0].accion).toBe('crear');
    });

    it('un pendiente tolera más días de diferencia que un pagado', async () => {
      const pendiente = candidato({
        estado: 'pendiente',
        fechaPagoReal: null,
        fechaProgramada: new Date(Date.UTC(2026, 8, 10)),
      });
      const { servicio } = montar({ candidatos: [pendiente] });
      const plan = await servicio.planificar([fila(4)], 'pagos.xlsx', {
        vincular: true,
      });
      expect(plan.filas[0].accion).toBe('vincular');
      expect(plan.filas[0].mensajes[0].texto).toMatch(/se marca como pagado/);
    });

    it('gasto de administración solo coincide con pagos sin obra', async () => {
      const { servicio } = montar({
        candidatos: [candidato({ proyectoId: null })],
      });
      const oficina = await servicio.planificar(
        [fila(4, { centroCosto: 'ADMINISTRACION' })],
        'pagos.xlsx',
        { vincular: true },
      );
      expect(oficina.filas[0].accion).toBe('vincular');
      const obra = await servicio.planificar([fila(4)], 'pagos.xlsx', {
        vincular: true,
      });
      expect(obra.filas[0].accion).toBe('crear');
    });
  });
});

describe('PagosImportService.aplicar', () => {
  async function planDe(
    servicio: PagosImportService,
    filas: FilaCruda[],
    opciones = {},
  ): Promise<PlanImportacion> {
    return servicio.planificar(filas, 'pagos.xlsx', opciones);
  }

  it('crea los pagos como pagados/importados, con el lote y sin tocar los que ya existen', async () => {
    const { servicio, llamadas } = montar({
      existentes: [
        pagoExistente({
          codigoComprobante: '26-2249',
          subNumero: 1,
          monto: 300,
        }),
      ],
    });
    const plan = await planDe(servicio, [
      fila(4),
      fila(5, {
        subComprobante: '262249,1',
        comprobante: '262249',
        importe: 300,
      }),
    ]);
    expect(plan.resumen).toMatchObject({ crear: 1, omitir: 1 });

    const r = await servicio.aplicar(plan, {
      usuarioId: 'u-tes',
      archivo: 'pagos.xlsx',
      etiqueta: 'brecha',
    });

    expect(r).toEqual({ importacionId: 'lote-1', creados: 1, vinculados: 0 });
    expect(llamadas.createMany).toHaveLength(1);
    expect(llamadas.createMany[0]).toHaveLength(1);
    expect(llamadas.createMany[0][0]).toMatchObject({
      origen: 'importado',
      estado: 'pagado',
      codigoComprobante: '26-2248',
      subNumero: 1,
      monto: 180,
      proyectoId: 'p-022',
      empresaId: 'e-dyc',
      cuentaOrigenId: 'c-nueva',
      responsableRendicionId: 't-palma',
      estadoRendicion: 'cerrado',
      pagadoPorId: 'u-jessica',
      registradoPorId: 'u-tes',
      importacionId: 'lote-1',
    });
    expect(llamadas.cuentaCreate).toEqual([
      expect.objectContaining({
        banco: 'BCP-D&C INGENIERIA Y PROYECTOS',
        numero: '305-98401930-95',
      }),
    ]);
    expect(llamadas.importacion[0]).toMatchObject({
      archivo: 'pagos.xlsx',
      etiqueta: 'brecha',
      filas: 2,
      creados: 1,
      vinculados: 0,
      omitidos: 1,
    });
  });

  it('reutiliza una cuenta de origen que ya existe aunque cambie el formato del número', async () => {
    const { servicio, llamadas } = montar({
      cuentas: [
        {
          id: 'c-vieja',
          numero: '30598401930 95',
          empresa: { ruc: '20608745611' },
        },
      ],
    });
    const plan = await planDe(servicio, [fila(4)]);
    expect(plan.cuentasNuevas).toEqual([]);

    await servicio.aplicar(plan, { usuarioId: 'u', archivo: 'x.xlsx' });
    expect(llamadas.cuentaCreate).toHaveLength(0);
    expect(llamadas.createMany[0][0]).toMatchObject({
      cuentaOrigenId: 'c-vieja',
    });
  });

  it('se niega si hay errores salvo omitirErrores', async () => {
    const { servicio, llamadas } = montar();
    const plan = await planDe(servicio, [
      fila(4),
      fila(5, {
        subComprobante: '262249,1',
        comprobante: '262249',
        importe: '',
      }),
    ]);
    await expect(
      servicio.aplicar(plan, { usuarioId: 'u', archivo: 'x.xlsx' }),
    ).rejects.toThrow(/1 fila\(s\) con error/);
    expect(llamadas.createMany).toHaveLength(0);

    const r = await servicio.aplicar(plan, {
      usuarioId: 'u',
      archivo: 'x.xlsx',
      omitirErrores: true,
    });
    expect(r.creados).toBe(1);
  });

  it('se niega si no hay nada nuevo que cargar', async () => {
    const { servicio } = montar({ existentes: [pagoExistente()] });
    const plan = await planDe(servicio, [fila(4)]);
    await expect(
      servicio.aplicar(plan, { usuarioId: 'u', archivo: 'x.xlsx' }),
    ).rejects.toThrow(/No hay filas nuevas/);
  });

  it('da de alta empresas y obras nuevas solo cuando se pidió', async () => {
    const { servicio, llamadas } = montar();
    const plan = await planDe(
      servicio,
      [
        fila(4, {
          centroCosto: '019-26-04',
          descCentroCosto: 'ESTACION LA CULTURA',
          ruc: '20100070970',
          empresa: 'SUPERMERCADOS PERUANOS SA',
        }),
      ],
      { crearProyectos: true },
    );
    await servicio.aplicar(plan, { usuarioId: 'u', archivo: 'x.xlsx' });

    expect(llamadas.empresaCreate).toEqual([
      { ruc: '20100070970', razonSocial: 'SUPERMERCADOS PERUANOS SA' },
    ]);
    expect(llamadas.proyectoCreate).toEqual([
      {
        codigo: '019-26-04',
        nombre: 'ESTACION LA CULTURA',
        estado: 'liquidada',
      },
    ]);
    expect(llamadas.createMany[0][0]).toMatchObject({
      proyectoId: 'nuevo-019-26-04',
      empresaId: 'e-nueva',
    });
  });

  it('enlazar: completa solo lo vacío, marca pagado y guarda cómo estaba para poder deshacer', async () => {
    const { servicio, llamadas } = montar({
      candidatos: [candidato({ estado: 'pendiente', fechaPagoReal: null })],
    });
    const plan = await planDe(servicio, [fila(4)], { vincular: true });
    expect(plan.filas[0].accion).toBe('vincular');

    const r = await servicio.aplicar(plan, {
      usuarioId: 'u-tes',
      archivo: 'x.xlsx',
    });

    expect(r).toMatchObject({ creados: 0, vinculados: 1 });
    expect(llamadas.createMany).toHaveLength(0);
    const { where, data } = llamadas.pagoUpdate[0];
    expect(where).toEqual({ id: 'pg-viejo' });
    expect(data).toMatchObject({
      estado: 'pagado',
      codigoComprobante: '26-2248',
      metodoPago: 'Transferencia',
      beneficiarioNombre: 'PALMA MENDOZA CARLOS LUIS',
      estadoRendicion: 'cerrado',
    });
    expect(data.fechaPagoReal).toEqual(new Date(Date.UTC(2026, 8, 25)));
    expect(data).not.toHaveProperty('concepto'); // ya tenía "Hospedaje": no se pisa
    expect(data).not.toHaveProperty('monto');

    const resumen = llamadas.importacion.at(-1)!.resumen as {
      vinculados: { pagoId: string; antes: Fila }[];
    };
    expect(resumen.vinculados[0].pagoId).toBe('pg-viejo');
    expect(resumen.vinculados[0].antes).toMatchObject({
      estado: 'pendiente',
      codigoComprobante: null,
      fechaPagoReal: null,
    });
  });

  it('enlazar no toca el beneficiario de un pago que nace de una orden de compra', async () => {
    const { servicio, llamadas } = montar({ candidatos: [candidato()] });
    // el pago del sistema viene de una OC: findUniqueOrThrow devuelve ordenCompraId
    const prisma = (
      servicio as unknown as {
        prisma: { pago: { findUniqueOrThrow: () => Promise<Fila> } };
      }
    ).prisma;
    const original = prisma.pago.findUniqueOrThrow;
    prisma.pago.findUniqueOrThrow = () =>
      original().then((p) => ({ ...p, ordenCompraId: 'oc-1' }));

    const plan = await planDe(servicio, [fila(4)], { vincular: true });
    await servicio.aplicar(plan, { usuarioId: 'u', archivo: 'x.xlsx' });
    expect(llamadas.pagoUpdate[0].data).not.toHaveProperty(
      'beneficiarioNombre',
    );
    expect(llamadas.pagoUpdate[0].data).not.toHaveProperty('tipoBeneficiario');
  });
});
