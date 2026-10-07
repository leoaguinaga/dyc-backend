import type { Prisma } from '../../../../prisma/generated/prisma/client.js';
import type { PrismaClient } from '../../../prisma/types.js';
import { hoyLima } from '../../../shared/date/fecha.util.js';
import { EMPRESA_POR_DEFECTO_RUC, compactar } from './columnas.js';
import type { FilaCruda } from './lector-xlsx.js';
import {
  METODOS_CONOCIDOS,
  clave,
  claveCodigo,
  esAdministracion,
  esSinDato,
  huellaPersona,
  limpiar,
  parseComprobante,
  parseFecha,
  parseMonto,
  titulo,
  validarRuc,
} from './normalizacion.js';

export type AccionFila = 'crear' | 'omitir' | 'vincular' | 'revisar' | 'error';

export interface MensajeFila {
  nivel: 'error' | 'aviso' | 'info';
  texto: string;
}

/** Lo que se escribirá en `pagos` por una fila válida, con los ids ya resueltos. */
export interface DatosPago {
  codigoComprobante: string;
  subNumero: number;
  fecha: Date;
  monto: number;
  metodoPago: string | null;
  categoria: string | null;
  concepto: string | null;
  centroCosto: 'obra' | 'administracion';
  proyecto: {
    id: string | null;
    codigo: string | null;
    nuevo: boolean;
    nombreNuevo: string | null;
  };
  tipoBeneficiario: 'proveedor' | 'trabajador' | 'otro';
  beneficiarioNombre: string | null;
  beneficiarioTrabajadorId: string | null;
  numeroCuenta: string | null;
  empresaRuc: string;
  cuentaOrigen: { banco: string; numero: string } | null;
  responsableNombre: string | null;
  responsableTrabajadorId: string | null;
  importeRendido: number | null;
  estadoRendicion: 'abierto' | 'cerrado' | null;
  generadoPorNombre: string | null;
  generadoPorUserId: string | null;
  nota: string | null;
}

export interface FilaPlan {
  fila: number;
  comprobante: string | null;
  accion: AccionFila;
  mensajes: MensajeFila[];
  datos?: DatosPago;
  /** Pago existente con el que coincide (omitir / vincular). */
  pagoExistenteId?: string;
  /** Pagos que podrían ser el mismo (revisar). */
  candidatos?: string[];
}

export interface PlanImportacion {
  archivo: string;
  filas: FilaPlan[];
  /** Filas descartadas por quedar fuera de --desde / --hasta. */
  fueraDeRango: number;
  resumen: Record<AccionFila, number> & { total: number; montoCrear: number };
  proyectosFaltantes: {
    codigo: string;
    descripcion: string;
    filas: number;
    monto: number;
  }[];
  categoriasNuevas: string[];
  empresasNuevas: { ruc: string; razonSocial: string }[];
  cuentasNuevas: { ruc: string; banco: string; numero: string }[];
  personasSinVincular: { nombre: string; rol: string; filas: number }[];
}

export interface OpcionesPlan {
  desde?: Date;
  hasta?: Date;
  /** Enlazar con pagos ya existentes (sin código) en vez de dejarlos para revisión. */
  vincular?: boolean;
  /** Dar de alta las obras que no existan (estado liquidada). */
  crearProyectos?: boolean;
  /** Tolerancia de fecha al buscar un pago ya registrado y pagado. */
  ventanaDiasPagado?: number;
  /** Tolerancia de fecha al buscar un pago registrado como pendiente. */
  ventanaDiasPendiente?: number;
  empresaPorDefectoRuc?: string;
}

export interface OpcionesAplicar {
  usuarioId: string;
  archivo: string;
  etiqueta?: string;
  omitirErrores?: boolean;
}

export interface ResultadoAplicar {
  importacionId: string;
  creados: number;
  vinculados: number;
}

interface ProyectoRef {
  id: string;
  codigo: string;
  nombre: string;
}

interface Referencias {
  proyectosPorClave: Map<string, ProyectoRef>;
  proyectos: ProyectoRef[];
  empresasPorRuc: Map<string, { id: string; razonSocial: string }>;
  cuentasPorClave: Map<string, string>;
  trabajadoresPorHuella: Map<string, { id: string; nombre: string }[]>;
  usuariosPorHuella: Map<string, { id: string; name: string }[]>;
  categoriasPorClave: Map<string, string>;
}

interface Acumulado {
  proyectosFaltantes: Map<
    string,
    { codigo: string; descripcion: string; filas: number; monto: number }
  >;
  categoriasNuevas: Map<string, string>;
  empresasNuevas: Map<string, string>;
  cuentasNuevas: Map<string, { ruc: string; banco: string; numero: string }>;
  personasSinVincular: Map<
    string,
    { nombre: string; rol: string; filas: number }
  >;
}

interface PagoExistente {
  id: string;
  codigoComprobante: string | null;
  subNumero: number;
  monto: Prisma.Decimal;
  fechaPagoReal: Date | null;
  fechaProgramada: Date;
  estado: string;
}

interface PagoCandidato {
  id: string;
  monto: Prisma.Decimal;
  estado: string;
  fechaProgramada: Date;
  fechaPagoReal: Date | null;
  proyectoId: string | null;
  concepto: string | null;
  beneficiarioNombre: string | null;
  ordenCompra: { proyectoId: string } | null;
}

/** Campos de un pago existente que `vincular` puede rellenar (y que `deshacer` restaura). */
const CAMPOS_VINCULABLES = [
  'estado',
  'fechaPagoReal',
  'codigoComprobante',
  'subNumero',
  'metodoPago',
  'categoria',
  'concepto',
  'numeroCuenta',
  'beneficiarioNombre',
  'beneficiarioTrabajadorId',
  'tipoBeneficiario',
  'empresaId',
  'cuentaOrigenId',
  'responsableRendicionId',
  'responsableRendicionNombre',
  'importeRendido',
  'estadoRendicion',
  'generadoPorNombre',
  'pagadoPorId',
  'nota',
] as const;

interface SnapshotVinculado {
  pagoId: string;
  antes: Record<string, unknown>;
}

interface ResumenLote {
  vinculados: SnapshotVinculado[];
  proyectosCreados: string[];
  empresasCreadas: string[];
  cuentasCreadas: string[];
  plan: PlanImportacion['resumen'];
}

const CHUNK_CREATE = 500;
const DIA_MS = 86_400_000;

const diasEntre = (a: Date, b: Date) =>
  Math.round((a.getTime() - b.getTime()) / DIA_MS);
const mismoMonto = (a: number, b: number) => Math.abs(a - b) < 0.005;

/** Valor listo para guardar como JSON: fechas en ISO y Decimal como número. */
function serializar(valor: unknown): unknown {
  if (valor instanceof Date) return valor.toISOString();
  if (valor && typeof valor === 'object' && 'toNumber' in valor)
    return (valor as { toNumber(): number }).toNumber();
  return valor;
}

const STOPWORDS_OBRA = new Set([
  'DE',
  'DEL',
  'LA',
  'LAS',
  'LOS',
  'Y',
  'EN',
  'PARA',
  'CON',
  'TIENDA',
  'SAC',
]);

function tokensObra(texto: string): Set<string> {
  return new Set(
    clave(texto)
      .split(/[^A-Z0-9]+/)
      .filter((t) => t.length >= 3 && !STOPWORDS_OBRA.has(t)),
  );
}

/** ¿La descripción del Excel es razonablemente la misma obra que el nombre del sistema? */
function descripcionCompatible(descripcion: string, nombre: string): boolean {
  const a = clave(descripcion);
  const b = clave(nombre);
  if (!a || !b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const ta = tokensObra(descripcion);
  const tb = tokensObra(nombre);
  if (!ta.size || !tb.size) return false;
  const comunes = [...ta].filter((t) => tb.has(t)).length;
  return comunes / Math.min(ta.size, tb.size) >= 0.5;
}

export class PagosImportService {
  constructor(private readonly prisma: PrismaClient) {}

  // -------------------------------------------------------------------------
  // Planificación (solo lectura): valida cada fila y decide qué hacer con ella
  // -------------------------------------------------------------------------

  async planificar(
    crudas: FilaCruda[],
    archivo: string,
    opciones: OpcionesPlan = {},
  ): Promise<PlanImportacion> {
    const refs = await this.cargarReferencias();
    const acumulado: Acumulado = {
      proyectosFaltantes: new Map(),
      categoriasNuevas: new Map(),
      empresasNuevas: new Map(),
      cuentasNuevas: new Map(),
      personasSinVincular: new Map(),
    };

    let fueraDeRango = 0;
    const filas: FilaPlan[] = [];
    for (const cruda of crudas) {
      const fila = this.analizarFila(cruda, refs, acumulado, opciones);
      const fecha = fila.datos?.fecha ?? this.fechaCruda(cruda);
      if (
        fecha &&
        ((opciones.desde && fecha < opciones.desde) ||
          (opciones.hasta && fecha > opciones.hasta))
      ) {
        fueraDeRango++;
        continue;
      }
      filas.push(fila);
    }

    await this.resolverDuplicados(filas, opciones);
    return this.armarPlan(archivo, filas, fueraDeRango, acumulado);
  }

  private fechaCruda(cruda: FilaCruda): Date | null {
    const fecha = parseFecha(cruda.valores.fecha);
    return fecha.ok ? fecha.valor : null;
  }

  private async cargarReferencias(): Promise<Referencias> {
    const [
      proyectos,
      empresas,
      cuentas,
      trabajadores,
      usuarios,
      categorias,
      categoriasRecurrentes,
    ] = await Promise.all([
      this.prisma.proyecto.findMany({
        where: { codigo: { not: null } },
        select: { id: true, codigo: true, nombre: true },
      }),
      this.prisma.empresa.findMany({
        select: { id: true, ruc: true, razonSocial: true },
      }),
      this.prisma.cuentaEmpresa.findMany({
        select: { id: true, numero: true, empresa: { select: { ruc: true } } },
      }),
      this.prisma.trabajador.findMany({ select: { id: true, nombre: true } }),
      this.prisma.user.findMany({ select: { id: true, name: true } }),
      this.prisma.pago.findMany({
        where: { categoria: { not: null } },
        distinct: ['categoria'],
        select: { categoria: true },
      }),
      this.prisma.pagoRecurrente.findMany({
        where: { categoria: { not: null } },
        distinct: ['categoria'],
        select: { categoria: true },
      }),
    ]);

    const proyectosRef = proyectos.map((p) => ({
      id: p.id,
      codigo: p.codigo!,
      nombre: p.nombre,
    }));
    const agrupar = <T>(items: T[], huella: (item: T) => string) => {
      const mapa = new Map<string, T[]>();
      for (const item of items) {
        const h = huella(item);
        if (h) mapa.set(h, [...(mapa.get(h) ?? []), item]);
      }
      return mapa;
    };

    return {
      proyectosPorClave: new Map(
        proyectosRef.map((p) => [claveCodigo(p.codigo), p]),
      ),
      proyectos: proyectosRef,
      empresasPorRuc: new Map(
        empresas.map((e) => [e.ruc, { id: e.id, razonSocial: e.razonSocial }]),
      ),
      cuentasPorClave: new Map(
        cuentas.map((c) => [`${c.empresa.ruc}|${compactar(c.numero)}`, c.id]),
      ),
      trabajadoresPorHuella: agrupar(trabajadores, (t) =>
        huellaPersona(t.nombre),
      ),
      usuariosPorHuella: agrupar(usuarios, (u) => huellaPersona(u.name)),
      categoriasPorClave: new Map(
        [...categorias, ...categoriasRecurrentes].map(
          (c) => [clave(c.categoria), c.categoria!] as [string, string],
        ),
      ),
    };
  }

  private analizarFila(
    cruda: FilaCruda,
    refs: Referencias,
    acum: Acumulado,
    opciones: OpcionesPlan,
  ): FilaPlan {
    const v = cruda.valores;
    const mensajes: MensajeFila[] = [];
    const error = (texto: string) => mensajes.push({ nivel: 'error', texto });
    const aviso = (texto: string) => mensajes.push({ nivel: 'aviso', texto });
    const info = (texto: string) => mensajes.push({ nivel: 'info', texto });

    // --- Comprobante, fecha, importe ---------------------------------------
    const comp = parseComprobante(v.comprobante, v.subComprobante);
    let comprobante: { codigo: string; subNumero: number } | null = null;
    if (!comp.ok) error(comp.error);
    else if (!comp.valor)
      error(
        'Falta el N° de comprobante (es la llave para no duplicar pagos al volver a cargar)',
      );
    else comprobante = comp.valor;

    const fechaR = parseFecha(v.fecha);
    let fecha: Date | null = null;
    if (!fechaR.ok) error(fechaR.error);
    else if (!fechaR.valor) error('Falta la fecha de operación');
    else fecha = fechaR.valor;

    const montoR = parseMonto(v.importe);
    let monto: number | null = null;
    if (!montoR.ok) error(montoR.error);
    else if (montoR.valor === null) error('Falta el importe');
    else if (montoR.valor <= 0)
      error(`El importe debe ser mayor que cero (${montoR.valor})`);
    else monto = montoR.valor;

    if (
      comprobante &&
      fecha &&
      comprobante.codigo.slice(0, 2) !== String(fecha.getUTCFullYear()).slice(2)
    ) {
      aviso(
        `El comprobante ${comprobante.codigo} es de otro año que la fecha de operación (${fecha.toISOString().slice(0, 10)})`,
      );
    }
    if (fecha && fecha.getTime() > hoyLima().getTime() + DIA_MS) {
      aviso(
        `La fecha de operación está en el futuro (${fecha.toISOString().slice(0, 10)})`,
      );
    }

    // --- Tipo de operación, tipo de gasto, detalle -------------------------
    const metodoTexto = limpiar(v.tipoOperacion);
    const metodoPago = metodoTexto ? titulo(metodoTexto) : null;
    if (!metodoPago) aviso('Sin tipo de operación');
    else if (
      !METODOS_CONOCIDOS.has(clave(metodoTexto)) &&
      !clave(metodoTexto).startsWith('TRANSFERENCIA')
    ) {
      aviso(`Tipo de operación poco usual: "${metodoPago}"`);
    }

    const categoriaTexto = limpiar(v.tipoGasto);
    let categoria: string | null = null;
    if (categoriaTexto && !esSinDato(categoriaTexto)) {
      categoria =
        refs.categoriasPorClave.get(clave(categoriaTexto)) ??
        categoriaTexto.toUpperCase();
      if (!refs.categoriasPorClave.has(clave(categoriaTexto)))
        acum.categoriasNuevas.set(clave(categoriaTexto), categoria);
    } else {
      aviso('Sin tipo de gasto');
    }

    const concepto = limpiar(v.detalle) || null;
    if (!concepto) aviso('Sin detalle del gasto');

    // --- Centro de costo ----------------------------------------------------
    const codigoCC = limpiar(v.centroCosto);
    const descCC = limpiar(v.descCentroCosto);
    let centroCosto: 'obra' | 'administracion' = 'obra';
    const proyecto: DatosPago['proyecto'] = {
      id: null,
      codigo: null,
      nuevo: false,
      nombreNuevo: null,
    };
    if (esAdministracion(codigoCC)) {
      centroCosto = 'administracion';
    } else {
      const existente = refs.proyectosPorClave.get(claveCodigo(codigoCC));
      if (existente) {
        proyecto.id = existente.id;
        proyecto.codigo = existente.codigo;
        if (descCC && !descripcionCompatible(descCC, existente.nombre)) {
          aviso(
            `La descripción "${descCC}" no parece la obra ${existente.codigo} del sistema ("${existente.nombre}")`,
          );
        }
      } else {
        const previo = acum.proyectosFaltantes.get(claveCodigo(codigoCC));
        acum.proyectosFaltantes.set(claveCodigo(codigoCC), {
          codigo: codigoCC,
          descripcion: previo?.descripcion || descCC,
          filas: (previo?.filas ?? 0) + 1,
          monto: (previo?.monto ?? 0) + (monto ?? 0),
        });
        if (opciones.crearProyectos) {
          proyecto.codigo = codigoCC;
          proyecto.nuevo = true;
          proyecto.nombreNuevo = descCC || codigoCC;
          info(
            `Se dará de alta la obra ${codigoCC} (${proyecto.nombreNuevo}) como liquidada`,
          );
        } else {
          const parecida = descCC
            ? refs.proyectos.find((p) =>
                descripcionCompatible(descCC, p.nombre),
              )
            : undefined;
          error(
            `El centro de costo "${codigoCC}" no existe como obra en el sistema${
              parecida
                ? ` (¿será ${parecida.codigo} - ${parecida.nombre}?)`
                : ''
            }`,
          );
        }
      }
    }

    // --- Empresa y cuenta de origen ----------------------------------------
    const rucTexto =
      limpiar(v.ruc).replace(/\D/g, '') ||
      opciones.empresaPorDefectoRuc ||
      EMPRESA_POR_DEFECTO_RUC;
    const razonSocial = limpiar(v.empresa);
    if (!validarRuc(rucTexto)) {
      error(`RUC de la empresa inválido: "${limpiar(v.ruc) || rucTexto}"`);
    } else if (!refs.empresasPorRuc.has(rucTexto)) {
      if (razonSocial) {
        acum.empresasNuevas.set(rucTexto, razonSocial);
        info(`Empresa nueva (RUC ${rucTexto}): se dará de alta`);
      } else {
        error(
          `La empresa con RUC ${rucTexto} no existe en el sistema y la fila no trae su razón social`,
        );
      }
    }

    const bancoTexto = limpiar(v.banco);
    const cuentaTexto = limpiar(v.cuenta);
    let cuentaOrigen: DatosPago['cuentaOrigen'] = null;
    if (cuentaTexto && !esSinDato(cuentaTexto)) {
      cuentaOrigen = { banco: bancoTexto || 'SIN ROTULO', numero: cuentaTexto };
      if (!bancoTexto) aviso('La cuenta de origen no trae el nombre del banco');
      const llave = `${rucTexto}|${compactar(cuentaTexto)}`;
      if (!refs.cuentasPorClave.has(llave) && validarRuc(rucTexto)) {
        acum.cuentasNuevas.set(llave, {
          ruc: rucTexto,
          banco: cuentaOrigen.banco,
          numero: cuentaOrigen.numero,
        });
      }
    } else if (bancoTexto && !esSinDato(bancoTexto)) {
      aviso(
        `El banco "${bancoTexto}" no trae número de cuenta: no se registra la cuenta de origen`,
      );
    } else {
      aviso('Sin cuenta de origen');
    }

    // --- Responsable, beneficiario, quién generó el comprobante -------------
    const responsableTexto = limpiar(v.responsable);
    const responsableEsAdm = esAdministracion(responsableTexto);
    const responsableNombre =
      responsableTexto && !esSinDato(responsableTexto)
        ? responsableTexto
        : null;
    let responsableTrabajadorId: string | null = null;
    if (responsableNombre && !responsableEsAdm) {
      const coincidencias =
        refs.trabajadoresPorHuella.get(huellaPersona(responsableNombre)) ?? [];
      if (coincidencias.length === 1)
        responsableTrabajadorId = coincidencias[0].id;
      else
        this.sinVincular(
          acum,
          responsableNombre,
          'responsable de la rendición',
          coincidencias.length > 1
            ? 'varios trabajadores con ese nombre'
            : undefined,
        );
    }

    const proveedor = esSinDato(v.proveedor) ? null : limpiar(v.proveedor);
    const numeroCuenta = esSinDato(v.cuentaProveedor)
      ? null
      : limpiar(v.cuentaProveedor);
    let tipoBeneficiario: DatosPago['tipoBeneficiario'] = 'otro';
    let beneficiarioNombre: string | null = null;
    let beneficiarioTrabajadorId: string | null = null;
    if (proveedor) {
      tipoBeneficiario = 'proveedor';
      beneficiarioNombre = proveedor;
    } else if (responsableNombre && !responsableEsAdm) {
      // "NO APLICA" en proveedor: el dinero fue al responsable de la rendición.
      tipoBeneficiario = responsableTrabajadorId ? 'trabajador' : 'otro';
      beneficiarioNombre = responsableNombre;
      beneficiarioTrabajadorId = responsableTrabajadorId;
    } else {
      aviso('Sin proveedor ni responsable: el pago queda sin beneficiario');
    }

    const generoTexto = limpiar(v.generoComprobante);
    const generadoPorNombre =
      generoTexto && !esSinDato(generoTexto) ? generoTexto : null;
    let generadoPorUserId: string | null = null;
    if (generadoPorNombre) {
      const coincidencias =
        refs.usuariosPorHuella.get(huellaPersona(generadoPorNombre)) ?? [];
      if (coincidencias.length === 1) generadoPorUserId = coincidencias[0].id;
      else
        this.sinVincular(
          acum,
          generadoPorNombre,
          'generó el comprobante',
          coincidencias.length > 1
            ? 'varios usuarios con ese nombre'
            : undefined,
        );
    }

    // --- Rendición -----------------------------------------------------------
    const rendidoR = parseMonto(v.importeRendido);
    let importeRendido: number | null = null;
    if (!rendidoR.ok) error(`Importe rendido: ${rendidoR.error}`);
    else importeRendido = rendidoR.valor;

    const estadoTexto = clave(v.estadoRendicion);
    let estadoRendicion: DatosPago['estadoRendicion'] = null;
    if (estadoTexto === 'ABIERTO' || estadoTexto === 'ABIERTA')
      estadoRendicion = 'abierto';
    else if (estadoTexto === 'CERRADO' || estadoTexto === 'CERRADA')
      estadoRendicion = 'cerrado';
    else if (estadoTexto)
      error(
        `"ABIERTO / CERRADO" no reconocido: "${limpiar(v.estadoRendicion)}"`,
      );

    if (estadoRendicion === 'cerrado' && importeRendido === null)
      aviso('Rendición cerrada sin importe rendido');
    if (
      importeRendido !== null &&
      monto !== null &&
      importeRendido > monto + 0.005
    ) {
      aviso(
        `El importe rendido (${importeRendido}) supera al importe pagado (${monto})`,
      );
    }

    // --- Resultado ----------------------------------------------------------
    const hayError = mensajes.some((m) => m.nivel === 'error');
    const fila: FilaPlan = {
      fila: cruda.fila,
      comprobante: comprobante ? this.etiquetaComprobante(comprobante) : null,
      accion: hayError ? 'error' : 'crear',
      mensajes,
    };
    if (!hayError && comprobante && fecha && monto !== null) {
      fila.datos = {
        codigoComprobante: comprobante.codigo,
        subNumero: comprobante.subNumero,
        fecha,
        monto,
        metodoPago,
        categoria,
        concepto,
        centroCosto,
        proyecto,
        tipoBeneficiario,
        beneficiarioNombre,
        beneficiarioTrabajadorId,
        numeroCuenta,
        empresaRuc: rucTexto,
        cuentaOrigen,
        responsableNombre,
        responsableTrabajadorId,
        importeRendido,
        estadoRendicion,
        generadoPorNombre,
        generadoPorUserId,
        nota: limpiar(v.nota) || null,
      };
    }
    return fila;
  }

  private etiquetaComprobante(c: { codigo: string; subNumero: number }) {
    return `${c.codigo}.${c.subNumero}`;
  }

  private sinVincular(
    acum: Acumulado,
    nombre: string,
    rol: string,
    motivo?: string,
  ) {
    const llave = `${rol}|${huellaPersona(nombre)}`;
    const previo = acum.personasSinVincular.get(llave);
    acum.personasSinVincular.set(llave, {
      nombre,
      rol: motivo ? `${rol} (${motivo})` : rol,
      filas: (previo?.filas ?? 0) + 1,
    });
  }

  // -------------------------------------------------------------------------
  // Duplicados: dentro del archivo, contra el sistema por código, y contra
  // pagos del sistema que todavía no tienen código (la brecha de agosto)
  // -------------------------------------------------------------------------

  private async resolverDuplicados(filas: FilaPlan[], opciones: OpcionesPlan) {
    const validas = filas.filter((f) => f.datos);
    if (!validas.length) return;

    // 1) Repetidos dentro del mismo archivo.
    const vistos = new Map<string, number>();
    for (const fila of validas) {
      const llave = `${fila.datos!.codigoComprobante}.${fila.datos!.subNumero}`;
      const anterior = vistos.get(llave);
      if (anterior !== undefined) {
        fila.accion = 'error';
        fila.mensajes.push({
          nivel: 'error',
          texto: `El comprobante ${llave} ya aparece en la fila ${anterior}. Si es otra línea de la misma transferencia, numérala (${fila.datos!.codigoComprobante.replace('-', '')},2)`,
        });
        delete fila.datos;
      } else {
        vistos.set(llave, fila.fila);
      }
    }

    const pendientes = filas.filter((f) => f.datos);
    if (!pendientes.length) return;

    // 2) Contra el sistema por código exacto.
    const codigos = [
      ...new Set(pendientes.map((f) => f.datos!.codigoComprobante)),
    ];
    const existentes: PagoExistente[] = await this.prisma.pago.findMany({
      where: { codigoComprobante: { in: codigos } },
      select: {
        id: true,
        codigoComprobante: true,
        subNumero: true,
        monto: true,
        fechaPagoReal: true,
        fechaProgramada: true,
        estado: true,
      },
    });
    const porCodigo = new Map(
      existentes.map((p) => [`${p.codigoComprobante}.${p.subNumero}`, p]),
    );

    const sinCodigoExistente: FilaPlan[] = [];
    for (const fila of pendientes) {
      const d = fila.datos!;
      const existente = porCodigo.get(`${d.codigoComprobante}.${d.subNumero}`);
      if (!existente) {
        sinCodigoExistente.push(fila);
        continue;
      }
      fila.pagoExistenteId = existente.id;
      const fechaExistente =
        existente.fechaPagoReal ?? existente.fechaProgramada;
      if (mismoMonto(Number(existente.monto), d.monto)) {
        fila.accion = 'omitir';
        fila.mensajes.push({
          nivel: 'info',
          texto: `Ya existe en el sistema (pago ${existente.id}); no se vuelve a cargar`,
        });
      } else {
        fila.accion = 'revisar';
        fila.mensajes.push({
          nivel: 'aviso',
          texto: `El comprobante ya existe pero con otro importe: Excel S/ ${d.monto.toFixed(2)} vs sistema S/ ${Number(existente.monto).toFixed(2)} (${fechaExistente.toISOString().slice(0, 10)}). No se toca`,
        });
      }
    }
    if (!sinCodigoExistente.length) return;

    // 3) Contra pagos del sistema sin código (registrados a mano antes de existir el correlativo).
    const fechas = sinCodigoExistente.map((f) => f.datos!.fecha.getTime());
    const margen =
      Math.max(
        opciones.ventanaDiasPagado ?? 3,
        opciones.ventanaDiasPendiente ?? 30,
      ) * DIA_MS;
    const rango = {
      gte: new Date(Math.min(...fechas) - margen),
      lte: new Date(Math.max(...fechas) + margen),
    };
    const candidatos: PagoCandidato[] = await this.prisma.pago.findMany({
      where: {
        codigoComprobante: null,
        estado: { in: ['pagado', 'pendiente'] },
        OR: [{ fechaPagoReal: rango }, { fechaProgramada: rango }],
      },
      select: {
        id: true,
        monto: true,
        estado: true,
        fechaProgramada: true,
        fechaPagoReal: true,
        proyectoId: true,
        concepto: true,
        beneficiarioNombre: true,
        ordenCompra: { select: { proyectoId: true } },
      },
    });
    if (!candidatos.length) return;

    const reclamados = new Set<string>();
    for (const fila of sinCodigoExistente) {
      const coinciden = this.coincidencias(
        fila.datos!,
        candidatos,
        reclamados,
        opciones,
      );
      if (!coinciden.length) continue;

      const descripcion = (c: PagoCandidato) =>
        `${c.id} (${c.estado}, S/ ${Number(c.monto).toFixed(2)}, ${(c.fechaPagoReal ?? c.fechaProgramada).toISOString().slice(0, 10)}${
          c.concepto || c.beneficiarioNombre
            ? `, ${c.concepto ?? c.beneficiarioNombre}`
            : ''
        })`;

      if (coinciden.length === 1 && opciones.vincular) {
        const candidato = coinciden[0];
        reclamados.add(candidato.id);
        fila.accion = 'vincular';
        fila.pagoExistenteId = candidato.id;
        fila.mensajes.push({
          nivel: 'aviso',
          texto: `Se enlaza con el pago ya registrado ${descripcion(candidato)}${
            candidato.estado === 'pendiente' ? ' y se marca como pagado' : ''
          }; solo se completan los campos vacíos`,
        });
      } else {
        fila.accion = 'revisar';
        fila.candidatos = coinciden.map((c) => c.id);
        fila.mensajes.push({
          nivel: 'aviso',
          texto:
            coinciden.length === 1
              ? `Parece ser el pago ya registrado ${descripcion(coinciden[0])}. Usa --vincular para enlazarlos o cárgalo aparte si es otro pago`
              : `Podría ser cualquiera de ${coinciden.length} pagos ya registrados: ${coinciden.map(descripcion).join(' | ')}. Resuélvelo a mano`,
        });
      }
    }
  }

  private coincidencias(
    datos: DatosPago,
    candidatos: PagoCandidato[],
    reclamados: Set<string>,
    opciones: OpcionesPlan,
  ): PagoCandidato[] {
    if (datos.proyecto.nuevo) return [];
    const ventanaPagado = opciones.ventanaDiasPagado ?? 3;
    const ventanaPendiente = opciones.ventanaDiasPendiente ?? 30;
    return candidatos.filter((c) => {
      if (reclamados.has(c.id)) return false;
      if (!mismoMonto(Number(c.monto), datos.monto)) return false;
      const proyectoCandidato =
        c.proyectoId ?? c.ordenCompra?.proyectoId ?? null;
      if (proyectoCandidato !== datos.proyecto.id) return false;
      const pagado = c.estado === 'pagado';
      const referencia = pagado
        ? (c.fechaPagoReal ?? c.fechaProgramada)
        : c.fechaProgramada;
      return (
        Math.abs(diasEntre(referencia, datos.fecha)) <=
        (pagado ? ventanaPagado : ventanaPendiente)
      );
    });
  }

  private armarPlan(
    archivo: string,
    filas: FilaPlan[],
    fueraDeRango: number,
    acum: Acumulado,
  ): PlanImportacion {
    const resumen = {
      total: filas.length,
      crear: 0,
      omitir: 0,
      vincular: 0,
      revisar: 0,
      error: 0,
      montoCrear: 0,
    };
    for (const fila of filas) {
      resumen[fila.accion]++;
      if (fila.accion === 'crear') resumen.montoCrear += fila.datos!.monto;
    }
    resumen.montoCrear = Math.round(resumen.montoCrear * 100) / 100;

    return {
      archivo,
      filas,
      fueraDeRango,
      resumen,
      proyectosFaltantes: [...acum.proyectosFaltantes.values()].sort(
        (a, b) => b.monto - a.monto,
      ),
      categoriasNuevas: [...acum.categoriasNuevas.values()].sort(),
      empresasNuevas: [...acum.empresasNuevas].map(([ruc, razonSocial]) => ({
        ruc,
        razonSocial,
      })),
      cuentasNuevas: [...acum.cuentasNuevas.values()],
      personasSinVincular: [...acum.personasSinVincular.values()].sort(
        (a, b) => b.filas - a.filas,
      ),
    };
  }

  // -------------------------------------------------------------------------
  // Aplicar: todo o nada, en una sola transacción
  // -------------------------------------------------------------------------

  async aplicar(
    plan: PlanImportacion,
    opciones: OpcionesAplicar,
  ): Promise<ResultadoAplicar> {
    if (plan.resumen.error > 0 && !opciones.omitirErrores) {
      throw new Error(
        `El archivo tiene ${plan.resumen.error} fila(s) con error. Corrígelas o usa --omitir-errores para cargar solo las válidas.`,
      );
    }
    const aCrear = plan.filas.filter((f) => f.accion === 'crear' && f.datos);
    const aVincular = plan.filas.filter(
      (f) => f.accion === 'vincular' && f.datos && f.pagoExistenteId,
    );
    if (!aCrear.length && !aVincular.length)
      throw new Error('No hay filas nuevas que cargar.');

    return this.prisma.$transaction(
      async (tx) => {
        const lote: ResumenLote = {
          vinculados: [],
          proyectosCreados: [],
          empresasCreadas: [],
          cuentasCreadas: [],
          plan: plan.resumen,
        };
        const filas = [...aCrear, ...aVincular];

        // Maestros: empresas, cuentas y (si se pidió) obras que aún no existen.
        const empresaIds = new Map<string, string>();
        for (const ruc of new Set(filas.map((f) => f.datos!.empresaRuc))) {
          const existente = await tx.empresa.findUnique({
            where: { ruc },
            select: { id: true },
          });
          if (existente) {
            empresaIds.set(ruc, existente.id);
            continue;
          }
          const razonSocial =
            plan.empresasNuevas.find((e) => e.ruc === ruc)?.razonSocial ?? ruc;
          const creada = await tx.empresa.create({
            data: { ruc, razonSocial },
            select: { id: true },
          });
          empresaIds.set(ruc, creada.id);
          lote.empresasCreadas.push(creada.id);
        }

        const cuentaIds = new Map<string, string>();
        for (const fila of filas) {
          const cuenta = fila.datos!.cuentaOrigen;
          if (!cuenta) continue;
          const llave = `${fila.datos!.empresaRuc}|${compactar(cuenta.numero)}`;
          if (cuentaIds.has(llave)) continue;
          const empresaId = empresaIds.get(fila.datos!.empresaRuc)!;
          const existentes = await tx.cuentaEmpresa.findMany({
            where: { empresaId },
            select: { id: true, numero: true },
          });
          const hallada = existentes.find(
            (c) => compactar(c.numero) === compactar(cuenta.numero),
          );
          if (hallada) {
            cuentaIds.set(llave, hallada.id);
            continue;
          }
          const creada = await tx.cuentaEmpresa.create({
            data: { empresaId, banco: cuenta.banco, numero: cuenta.numero },
            select: { id: true },
          });
          cuentaIds.set(llave, creada.id);
          lote.cuentasCreadas.push(creada.id);
        }

        const proyectoIds = new Map<string, string>();
        for (const fila of filas) {
          const p = fila.datos!.proyecto;
          if (!p.nuevo || !p.codigo || proyectoIds.has(claveCodigo(p.codigo)))
            continue;
          const creado = await tx.proyecto.create({
            data: {
              codigo: p.codigo,
              nombre: p.nombreNuevo ?? p.codigo,
              estado: 'liquidada',
            },
            select: { id: true },
          });
          proyectoIds.set(claveCodigo(p.codigo), creado.id);
          lote.proyectosCreados.push(creado.id);
        }

        const importacion = await tx.importacionPagos.create({
          data: {
            archivo: opciones.archivo,
            etiqueta: opciones.etiqueta,
            filas: plan.resumen.total,
            creados: aCrear.length,
            vinculados: aVincular.length,
            omitidos:
              plan.resumen.omitir + plan.resumen.revisar + plan.resumen.error,
            creadoPorId: opciones.usuarioId,
          },
          select: { id: true },
        });

        const contexto = {
          empresaIds,
          cuentaIds,
          proyectoIds,
          usuarioId: opciones.usuarioId,
          importacionId: importacion.id,
        };
        const nuevos = aCrear.map((f) =>
          this.datosCreacion(f.datos!, contexto),
        );
        for (let i = 0; i < nuevos.length; i += CHUNK_CREATE) {
          await tx.pago.createMany({ data: nuevos.slice(i, i + CHUNK_CREATE) });
        }

        for (const fila of aVincular) {
          lote.vinculados.push(await this.vincular(tx, fila, contexto));
        }

        await tx.importacionPagos.update({
          where: { id: importacion.id },
          data: { resumen: lote as unknown as Prisma.InputJsonValue },
        });
        return {
          importacionId: importacion.id,
          creados: aCrear.length,
          vinculados: aVincular.length,
        };
      },
      { maxWait: 30_000, timeout: 300_000 },
    );
  }

  private datosCreacion(
    d: DatosPago,
    ctx: {
      empresaIds: Map<string, string>;
      cuentaIds: Map<string, string>;
      proyectoIds: Map<string, string>;
      usuarioId: string;
      importacionId: string;
    },
  ): Prisma.PagoCreateManyInput {
    return {
      origen: 'importado',
      estado: 'pagado',
      centroCosto: d.centroCosto,
      proyectoId: d.proyecto.nuevo
        ? ctx.proyectoIds.get(claveCodigo(d.proyecto.codigo))
        : d.proyecto.id,
      concepto: d.concepto,
      categoria: d.categoria,
      tipoBeneficiario: d.tipoBeneficiario,
      beneficiarioTrabajadorId: d.beneficiarioTrabajadorId,
      beneficiarioNombre: d.beneficiarioNombre,
      numeroCuenta: d.numeroCuenta,
      monto: d.monto,
      fechaProgramada: d.fecha,
      fechaPagoReal: d.fecha,
      metodoPago: d.metodoPago,
      codigoComprobante: d.codigoComprobante,
      subNumero: d.subNumero,
      empresaId: ctx.empresaIds.get(d.empresaRuc),
      cuentaOrigenId: d.cuentaOrigen
        ? ctx.cuentaIds.get(
            `${d.empresaRuc}|${compactar(d.cuentaOrigen.numero)}`,
          )
        : null,
      responsableRendicionId: d.responsableTrabajadorId,
      responsableRendicionNombre: d.responsableNombre,
      importeRendido: d.importeRendido,
      estadoRendicion: d.estadoRendicion,
      generadoPorNombre: d.generadoPorNombre,
      nota: d.nota,
      pagadoPorId: d.generadoPorUserId,
      registradoPorId: ctx.usuarioId,
      importacionId: ctx.importacionId,
    };
  }

  /**
   * Completa un pago ya registrado con los datos del Excel. Nunca pisa lo que
   * el sistema ya tiene (monto, fecha programada, obra, beneficiario): solo
   * rellena vacíos y, si estaba pendiente, lo marca pagado. Devuelve los
   * valores anteriores para poder deshacerlo.
   */
  private async vincular(
    tx: Prisma.TransactionClient,
    fila: FilaPlan,
    ctx: { empresaIds: Map<string, string>; cuentaIds: Map<string, string> },
  ): Promise<SnapshotVinculado> {
    const d = fila.datos!;
    const actual = await tx.pago.findUniqueOrThrow({
      where: { id: fila.pagoExistenteId! },
    });
    const deseado: Record<string, unknown> = {
      estado: 'pagado',
      fechaPagoReal: actual.fechaPagoReal ?? d.fecha,
      codigoComprobante: d.codigoComprobante,
      subNumero: d.subNumero,
      metodoPago: actual.metodoPago ?? d.metodoPago,
      categoria: actual.categoria ?? d.categoria,
      concepto: actual.concepto ?? d.concepto,
      numeroCuenta: actual.numeroCuenta ?? d.numeroCuenta,
      // Los pagos de una OC toman el beneficiario de la orden; solo los manuales sin él se completan.
      ...(actual.beneficiarioNombre || actual.ordenCompraId
        ? {}
        : {
            beneficiarioNombre: d.beneficiarioNombre,
            beneficiarioTrabajadorId: d.beneficiarioTrabajadorId,
            tipoBeneficiario: d.tipoBeneficiario,
          }),
      empresaId: actual.empresaId ?? ctx.empresaIds.get(d.empresaRuc),
      cuentaOrigenId:
        actual.cuentaOrigenId ??
        (d.cuentaOrigen
          ? ctx.cuentaIds.get(
              `${d.empresaRuc}|${compactar(d.cuentaOrigen.numero)}`,
            )
          : null),
      responsableRendicionId:
        actual.responsableRendicionId ?? d.responsableTrabajadorId,
      responsableRendicionNombre:
        actual.responsableRendicionNombre ?? d.responsableNombre,
      importeRendido: actual.importeRendido ?? d.importeRendido,
      estadoRendicion: actual.estadoRendicion ?? d.estadoRendicion,
      generadoPorNombre: actual.generadoPorNombre ?? d.generadoPorNombre,
      nota: actual.nota ?? d.nota,
      pagadoPorId: actual.pagadoPorId ?? d.generadoPorUserId,
    };

    const antes: Record<string, unknown> = {};
    const cambios: Record<string, unknown> = {};
    for (const campo of CAMPOS_VINCULABLES) {
      if (!(campo in deseado)) continue;
      const valorActual = (actual as Record<string, unknown>)[campo] ?? null;
      const valorNuevo = deseado[campo] ?? null;
      const igual =
        JSON.stringify(serializar(valorActual)) ===
        JSON.stringify(serializar(valorNuevo));
      if (igual) continue;
      antes[campo] = serializar(valorActual);
      cambios[campo] = valorNuevo;
    }
    if (Object.keys(cambios).length) {
      await tx.pago.update({
        where: { id: actual.id },
        data: cambios,
      });
    }
    return { pagoId: actual.id, antes };
  }

  // -------------------------------------------------------------------------
  // Deshacer un lote
  // -------------------------------------------------------------------------

  async listarLotes() {
    return this.prisma.importacionPagos.findMany({
      orderBy: { creadoEn: 'desc' },
      include: {
        creadoPor: { select: { name: true } },
        _count: { select: { pagos: true } },
      },
    });
  }

  /**
   * Borra los pagos creados por el lote, devuelve los vinculados a su estado
   * anterior y quita las obras que el lote dio de alta (si nadie más las usa).
   * Se niega si algún pago del lote ya tiene comprobantes adjuntos, salvo `forzar`.
   */
  async deshacer(importacionId: string, opciones: { forzar?: boolean } = {}) {
    const lote = await this.prisma.importacionPagos.findUnique({
      where: { id: importacionId },
    });
    if (!lote) throw new Error(`No existe el lote ${importacionId}`);
    if (lote.deshechoEn)
      throw new Error(
        `El lote ${importacionId} ya se deshizo el ${lote.deshechoEn.toISOString()}`,
      );

    const conComprobantes = await this.prisma.pago.count({
      where: { importacionId, comprobantes: { some: {} } },
    });
    if (conComprobantes && !opciones.forzar) {
      throw new Error(
        `${conComprobantes} pago(s) del lote ya tienen comprobantes adjuntos. Usa --forzar para borrarlos igual.`,
      );
    }

    const resumen = (lote.resumen ?? {
      vinculados: [],
      proyectosCreados: [],
    }) as unknown as Partial<ResumenLote>;
    const { borrados, restaurados } = await this.prisma.$transaction(
      async (tx) => {
        const borrados = (
          await tx.pago.deleteMany({ where: { importacionId } })
        ).count;
        for (const { pagoId, antes } of resumen.vinculados ?? []) {
          const datos = { ...antes };
          if (typeof datos.fechaPagoReal === 'string')
            datos.fechaPagoReal = new Date(datos.fechaPagoReal);
          await tx.pago.update({
            where: { id: pagoId },
            data: datos,
          });
        }
        await tx.importacionPagos.update({
          where: { id: importacionId },
          data: { deshechoEn: new Date() },
        });
        return { borrados, restaurados: (resumen.vinculados ?? []).length };
      },
      { maxWait: 30_000, timeout: 300_000 },
    );

    // Las obras creadas por el lote se borran aparte: si ya tienen otros datos la FK lo impide y se dejan.
    const obrasConservadas: string[] = [];
    for (const id of resumen.proyectosCreados ?? []) {
      await this.prisma.proyecto
        .delete({ where: { id } })
        .catch(() => obrasConservadas.push(id));
    }
    return { borrados, restaurados, obrasConservadas };
  }
}
