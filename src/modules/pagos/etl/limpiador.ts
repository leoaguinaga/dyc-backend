import { EMPRESA_POR_DEFECTO_RUC, compactar } from '../importacion/columnas.js';
import type { ClaveColumna } from '../importacion/columnas.js';
import type { FilaCruda } from '../importacion/lector-xlsx.js';
import {
  clave,
  claveCodigo,
  esSinDato,
  limpiar,
  parseComprobante,
  parseFecha,
  parseMonto,
  validarRuc,
} from '../importacion/normalizacion.js';
import { buscarEnCatalogo } from './coincidencia.js';
import type { CatalogosDatos } from './catalogos.js';

export type AccionCentro = 'obra' | 'administracion';

/** Qué hacer con un centro de costo del Excel al llevarlo al sistema. */
export interface DecisionCentro {
  codigoExcel: string;
  accion: AccionCentro;
  /** Código de la obra en el sistema (o "ADMINISTRACION"). */
  codigoSistema: string;
  nombre: string;
  notas: string;
}

/** Corrección manual de una celda, identificada por comprobante y columna. */
export interface Correccion {
  comprobante: string;
  columna: ClaveColumna;
  valor: string;
}

export interface Cambio {
  fila: number;
  comprobante: string;
  columna: string;
  original: string;
  nuevo: string;
  regla: string;
}

export interface Excepcion {
  fila: number;
  comprobante: string;
  tipo: string;
  severidad: 'revisar' | 'info';
  detalle: string;
  sugerencia: string;
  /** Columna (clave) a corregir, si la sugerencia es un cambio de celda. */
  columna?: ClaveColumna;
}

export interface Exclusion {
  fila: number;
  comprobante: string;
  motivo:
    | 'incompleta'
    | 'anulada'
    | 'duplicada'
    | 'comprobante-ilegible'
    | 'fecha-invalida'
    | 'importe-invalido';
  detalle: string;
}

export interface FilaLimpia {
  filaOrigen: number;
  codigo: string;
  subNumero: number;
  fecha: Date;
  importe: number;
  tipoOperacion: string;
  banco: string;
  cuenta: string;
  tipoGasto: string;
  detalle: string;
  responsable: string;
  proveedor: string;
  cuentaProveedor: string;
  centroCosto: string;
  descCentroCosto: string;
  importeRendido: number | null;
  generoComprobante: string;
  estadoRendicion: string;
  empresa: string;
  ruc: string;
  nota: string;
}

export interface ResumenCentro {
  codigoExcel: string;
  descripcion: string;
  filas: number;
  importe: number;
  primerPago: Date;
  ultimoPago: Date;
  decision: DecisionCentro;
  /** El centro no estaba en el archivo de decisiones: se le propuso una acción por defecto. */
  propuestaNueva: boolean;
}

export interface Control {
  filas: number;
  importe: number;
  porMes: { mes: string; filas: number; importe: number }[];
  porTipoGasto: { tipoGasto: string; filas: number; importe: number }[];
}

export interface ResultadoLimpieza {
  filas: FilaLimpia[];
  cambios: Cambio[];
  excepciones: Excepcion[];
  exclusiones: Exclusion[];
  centros: ResumenCentro[];
  /** Decisiones finales (las que había + las propuestas), para persistirlas. */
  decisiones: Map<string, DecisionCentro>;
  control: Control;
  conteos: {
    leidas: number;
    limpias: number;
    fueraDeRango: number;
    fechasEnTexto: number;
    celdasConEspacios: number;
    sinBeneficiario: number;
    cambiosPorRegla: Record<string, number>;
  };
}

export interface OpcionesLimpieza {
  catalogos: CatalogosDatos | null;
  decisiones: Map<string, DecisionCentro>;
  correcciones: Correccion[];
  /** Rango por correlativo (la parte numérica tras el año: 26-1828 → 1828), inclusive. */
  desdeCorrelativo?: number;
  hastaCorrelativo?: number;
  desde?: Date;
  hasta?: Date;
}

const DIA_MS = 86_400_000;
const VENTANA_VECINOS = 5;
const TOLERANCIA_DIAS = 7;

/** Centros de costo que no son obras: gastos de la empresa. */
const CENTROS_ADMINISTRATIVOS = new Set([
  'OFICINACHICLAYO',
  'GERENCIA',
  'OTROSGASTOSDIVERSOS',
]);
/** Centros que tienen forma de código pero no son una obra de campo: se proponen como obra y se piden confirmar. */
const CENTROS_A_CONFIRMAR = new Set(['00-ING-LIC', 'HOM']);

export const CODIGO_ADMINISTRACION = 'ADMINISTRACION';

const correlativo = (codigo: string) => Number(codigo.slice(3));
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dmy = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
const dias = (a: Date, b: Date) =>
  Math.round((a.getTime() - b.getTime()) / DIA_MS);

/** Acción por defecto para un centro de costo que nadie decidió todavía. */
export function proponerDecision(
  codigoExcel: string,
  descripcion: string,
): DecisionCentro {
  const llave = claveCodigo(codigoExcel);
  if (CENTROS_ADMINISTRATIVOS.has(llave)) {
    return {
      codigoExcel,
      accion: 'administracion',
      codigoSistema: CODIGO_ADMINISTRACION,
      nombre: descripcion,
      notas:
        'Gasto de la empresa, no de una obra. El centro original queda en la observación del pago.',
    };
  }
  return {
    codigoExcel,
    accion: 'obra',
    codigoSistema: limpiar(codigoExcel).replace(/\s+/g, ''),
    nombre: descripcion,
    notas: CENTROS_A_CONFIRMAR.has(llave)
      ? 'Confirmar: no es una obra de campo. ¿Va como obra o como administración?'
      : '',
  };
}

interface Parseada {
  cruda: FilaCruda;
  valores: Partial<Record<ClaveColumna, unknown>>;
  codigo: string;
  subNumero: number;
  etiqueta: string;
  fecha: Date | null;
}

export function limpiarMaestra(
  crudas: FilaCruda[],
  opciones: OpcionesLimpieza,
): ResultadoLimpieza {
  const cambios: Cambio[] = [];
  const excepciones: Excepcion[] = [];
  const exclusiones: Exclusion[] = [];
  let celdasEnFilaActual = 0;
  const espaciosPorEtiqueta = new Map<string, number>();
  const sinBeneficiarioEtiquetas = new Set<string>();

  const registrar = (c: Cambio) => cambios.push(c);
  const texto = (v: unknown): string => {
    const original =
      typeof v === 'string'
        ? v
        : typeof v === 'number' || typeof v === 'boolean'
          ? String(v)
          : '';
    const limpio = limpiar(v);
    if (original !== limpio && original.trim() !== '') celdasEnFilaActual++;
    return limpio;
  };

  // --- 1. Comprobante de cada fila ---------------------------------------
  const filas: Parseada[] = [];
  for (const cruda of crudas) {
    const comp = parseComprobante(
      cruda.valores.comprobante,
      cruda.valores.subComprobante,
    );
    if (!comp.ok || !comp.valor) {
      exclusiones.push({
        fila: cruda.fila,
        comprobante: '',
        motivo: 'comprobante-ilegible',
        detalle: comp.ok ? 'Sin N° de comprobante' : comp.error,
      });
      excepciones.push({
        fila: cruda.fila,
        comprobante: '',
        tipo: 'comprobante-ilegible',
        severidad: 'revisar',
        detalle: comp.ok ? 'La fila no tiene N° de comprobante' : comp.error,
        sugerencia:
          'Corrige el N° de comprobante en el Excel original y vuelve a correr el ETL.',
      });
      continue;
    }
    filas.push({
      cruda,
      valores: { ...cruda.valores },
      codigo: comp.valor.codigo,
      subNumero: comp.valor.subNumero,
      etiqueta: `${comp.valor.codigo}.${comp.valor.subNumero}`,
      fecha: null,
    });
  }

  // --- 2. Correcciones manuales (antes de cualquier otra regla) ----------
  const porEtiqueta = new Map(filas.map((f) => [f.etiqueta, f]));
  for (const c of opciones.correcciones) {
    const comp = parseComprobante(c.comprobante, '');
    const objetivo =
      comp.ok && comp.valor
        ? (porEtiqueta.get(`${comp.valor.codigo}.${comp.valor.subNumero}`) ??
          porEtiqueta.get(`${comp.valor.codigo}.1`))
        : undefined;
    if (!objetivo) {
      excepciones.push({
        fila: 0,
        comprobante: c.comprobante,
        tipo: 'correccion-sin-fila',
        severidad: 'revisar',
        detalle: `La corrección de "${c.comprobante}" no coincide con ninguna fila del archivo`,
        sugerencia: 'Revisa el N° de comprobante de la hoja Correcciones.',
      });
      continue;
    }
    const original = objetivo.valores[c.columna];
    objetivo.valores[c.columna] = c.valor;
    registrar({
      fila: objetivo.cruda.fila,
      comprobante: objetivo.etiqueta,
      columna: c.columna,
      original: original instanceof Date ? iso(original) : limpiar(original),
      nuevo: c.valor,
      regla: 'correccion-manual',
    });
  }

  // --- 3. Orden y correlativo --------------------------------------------
  filas.sort(
    (a, b) =>
      correlativo(a.codigo) - correlativo(b.codigo) ||
      a.subNumero - b.subNumero,
  );

  // Un mismo comprobante puede repartirse en varias líneas (26-1671.1, .2). Si dos filas traen la misma
  // línea pero son gastos distintos, a la segunda se le asigna la siguiente línea; si son idénticas, es un duplicado.
  const mismoGasto = (a: Parseada, b: Parseada) =>
    ['importe', 'detalle', 'centroCosto', 'proveedor', 'fecha'].every(
      (k) =>
        limpiar(a.valores[k as ClaveColumna]) ===
        limpiar(b.valores[k as ClaveColumna]),
    );
  const vistos = new Map<string, Parseada>();
  const unicas: Parseada[] = [];
  for (const f of filas) {
    const previa = vistos.get(f.etiqueta);
    if (!previa) {
      vistos.set(f.etiqueta, f);
      unicas.push(f);
      continue;
    }
    if (mismoGasto(f, previa)) {
      exclusiones.push({
        fila: f.cruda.fila,
        comprobante: f.etiqueta,
        motivo: 'duplicada',
        detalle: `Es idéntica a la fila ${previa.cruda.fila} (mismo comprobante, importe, detalle, centro y proveedor)`,
      });
      excepciones.push({
        fila: f.cruda.fila,
        comprobante: f.etiqueta,
        tipo: 'fila-duplicada',
        severidad: 'revisar',
        detalle: `La fila ${f.cruda.fila} repite exactamente a la fila ${previa.cruda.fila}`,
        sugerencia:
          'Se excluye. Si en realidad es otra línea del mismo comprobante, cámbiale el sub comprobante en el Excel original.',
      });
      continue;
    }
    const maxima = Math.max(
      ...unicas.filter((u) => u.codigo === f.codigo).map((u) => u.subNumero),
    );
    const original = f.etiqueta;
    f.subNumero = maxima + 1;
    f.etiqueta = `${f.codigo}.${f.subNumero}`;
    vistos.set(f.etiqueta, f);
    unicas.push(f);
    registrar({
      fila: f.cruda.fila,
      comprobante: f.etiqueta,
      columna: 'N° DE SUB COMPROBANTE',
      original,
      nuevo: f.etiqueta,
      regla: 'sub-renumerado',
    });
    excepciones.push({
      fila: f.cruda.fila,
      comprobante: f.etiqueta,
      tipo: 'sub-renumerado',
      severidad: 'info',
      detalle: `El comprobante ${f.codigo} traía la línea ${original.split('.')[1]} repetida en las filas ${previa.cruda.fila} y ${f.cruda.fila} (gastos distintos)`,
      sugerencia: `Se tomó como otra línea del mismo comprobante: ${f.etiqueta}.`,
    });
  }

  const numeros = [...new Set(unicas.map((f) => correlativo(f.codigo)))];
  for (let i = 1; i < numeros.length; i++) {
    if (numeros[i] - numeros[i - 1] > 1) {
      const desde = numeros[i - 1] + 1;
      const hasta = numeros[i] - 1;
      excepciones.push({
        fila: 0,
        comprobante: '',
        tipo: 'hueco-correlativo',
        severidad: 'revisar',
        detalle:
          desde === hasta
            ? `Falta el comprobante ${desde}`
            : `Faltan los comprobantes ${desde} al ${hasta}`,
        sugerencia:
          'Confirma si fueron anulados o si faltan filas en el Excel.',
      });
    }
  }

  // --- 4. Fechas ----------------------------------------------------------
  const sinFecha = new Set<Parseada>();
  for (const f of unicas) {
    const original = f.valores.fecha;
    const r = parseFecha(original);
    if (!r.ok || !r.valor) {
      sinFecha.add(f);
      exclusiones.push({
        fila: f.cruda.fila,
        comprobante: f.etiqueta,
        motivo: 'fecha-invalida',
        detalle: r.ok ? 'Sin fecha de operación' : r.error,
      });
      excepciones.push({
        fila: f.cruda.fila,
        comprobante: f.etiqueta,
        tipo: 'fecha-invalida',
        severidad: 'revisar',
        detalle: r.ok ? 'La fila no tiene fecha de operación' : r.error,
        sugerencia:
          'Escribe la fecha correcta en la hoja Correcciones (columna FECHA DE OPERACION).',
        columna: 'fecha',
      });
      continue;
    }
    f.fecha = r.valor;
    if (typeof original === 'string') {
      registrar({
        fila: f.cruda.fila,
        comprobante: f.etiqueta,
        columna: 'FECHA DE OPERACION',
        original: String(original),
        nuevo: iso(r.valor),
        regla: 'fecha-texto',
      });
    }
  }

  // Los comprobantes se emiten en orden: una fecha lejos de la de sus vecinos casi siempre es un error de tipeo.
  const conFecha = unicas.filter((f) => f.fecha);
  conFecha.forEach((f, i) => {
    const vecinos = [
      ...conFecha.slice(Math.max(0, i - VENTANA_VECINOS), i),
      ...conFecha.slice(i + 1, i + 1 + VENTANA_VECINOS),
    ]
      .map((v) => v.fecha!.getTime())
      .sort((a, b) => a - b);
    if (vecinos.length < 4) return;
    const mediana = new Date(vecinos[Math.floor(vecinos.length / 2)]);
    if (Math.abs(dias(f.fecha!, mediana)) <= TOLERANCIA_DIAS) return;
    const invertida =
      f.fecha!.getUTCDate() <= 12 &&
      f.fecha!.getUTCDate() !== f.fecha!.getUTCMonth() + 1
        ? new Date(
            Date.UTC(
              f.fecha!.getUTCFullYear(),
              f.fecha!.getUTCDate() - 1,
              f.fecha!.getUTCMonth() + 1,
            ),
          )
        : null;
    const sugerida =
      invertida && Math.abs(dias(invertida, mediana)) <= TOLERANCIA_DIAS
        ? invertida
        : null;
    excepciones.push({
      fila: f.cruda.fila,
      comprobante: f.etiqueta,
      tipo: 'fecha-fuera-de-secuencia',
      severidad: 'revisar',
      detalle: `Fecha ${dmy(f.fecha!)} entre comprobantes de alrededor del ${dmy(mediana)}`,
      sugerencia: sugerida
        ? `¿Día y mes invertidos? Sería ${dmy(sugerida)}. Si es así, ponlo en la hoja Correcciones.`
        : `Confirma la fecha. Si es un error, corrígela en la hoja Correcciones (esperada cerca del ${dmy(mediana)}).`,
      columna: 'fecha',
    });
  });

  // --- 5. Limpieza fila a fila -------------------------------------------
  const cat = opciones.catalogos;
  const decisiones = new Map(opciones.decisiones);
  const decisionesNuevas = new Set<string>();
  const limpias: FilaLimpia[] = [];
  const centroOriginalDe = new Map<string, string>();
  const centrosBase = new Map<string, { descripcion: string }>();
  for (const c of cat?.centros ?? [])
    centrosBase.set(claveCodigo(c.codigo), {
      descripcion: limpiar(c.descripcion),
    });

  for (const f of unicas) {
    if (sinFecha.has(f)) continue;
    celdasEnFilaActual = 0;
    const v = f.valores;
    const fila = f.cruda.fila;
    const etiqueta = f.etiqueta;
    const exc = (e: Omit<Excepcion, 'fila' | 'comprobante'>) =>
      excepciones.push({ fila, comprobante: etiqueta, ...e });
    const cambio = (
      columna: string,
      original: string,
      nuevo: string,
      regla: string,
    ) => {
      if (original !== nuevo)
        registrar({
          fila,
          comprobante: etiqueta,
          columna,
          original,
          nuevo,
          regla,
        });
    };

    const tipoOperacion = texto(v.tipoOperacion);
    if (clave(tipoOperacion) === 'ANULADA') {
      exclusiones.push({
        fila,
        comprobante: etiqueta,
        motivo: 'anulada',
        detalle: 'Comprobante anulado',
      });
      continue;
    }

    const tipoGasto = texto(v.tipoGasto);
    const detalle = texto(v.detalle);
    const responsableOriginal = texto(v.responsable);
    const proveedorOriginal = texto(v.proveedor);
    const centroOriginal = texto(v.centroCosto);
    const estadoTexto = clave(v.estadoRendicion);
    const faltantes = [
      !tipoGasto && 'TIPO DE GASTO',
      !detalle && 'DETALLE DEL GASTO',
      !responsableOriginal && 'RESPONSABLE DE LA RENDICION',
      !proveedorOriginal && 'PROVEEDOR',
      !centroOriginal && 'CENTRO DE COSTO',
      !estadoTexto && 'ABIERTO / CERRADO',
    ].filter(Boolean) as string[];
    if (faltantes.length) {
      exclusiones.push({
        fila,
        comprobante: etiqueta,
        motivo: 'incompleta',
        detalle: `Falta completar: ${faltantes.join(', ')}`,
      });
      continue;
    }

    const importeR = parseMonto(v.importe);
    if (!importeR.ok || importeR.valor === null || importeR.valor <= 0) {
      const detalleImporte = !importeR.ok
        ? importeR.error
        : importeR.valor === null
          ? 'Sin importe'
          : `Importe no positivo (${importeR.valor})`;
      exclusiones.push({
        fila,
        comprobante: etiqueta,
        motivo: 'importe-invalido',
        detalle: detalleImporte,
      });
      exc({
        tipo: 'importe-invalido',
        severidad: 'revisar',
        detalle: detalleImporte,
        sugerencia: 'Corrige el importe en la hoja Correcciones.',
        columna: 'importe',
      });
      continue;
    }

    if (estadoTexto !== 'ABIERTO' && estadoTexto !== 'CERRADO') {
      exclusiones.push({
        fila,
        comprobante: etiqueta,
        motivo: 'incompleta',
        detalle: `ABIERTO / CERRADO no reconocido: "${limpiar(v.estadoRendicion)}"`,
      });
      continue;
    }

    // Responsable contra el catálogo (corrige variantes de escritura como SANCHES → SANCHEZ).
    let responsable = responsableOriginal;
    if (
      cat?.responsables.length &&
      !esSinDato(responsableOriginal) &&
      clave(responsableOriginal) !== 'ADMINISTRACION'
    ) {
      const m = buscarEnCatalogo(responsableOriginal, cat.responsables, 2);
      if (m.tipo === 'orden' || m.tipo === 'aproximado') {
        responsable = m.valor;
        cambio(
          'RESPONSABLE DE LA RENDICION',
          responsableOriginal,
          responsable,
          m.tipo === 'aproximado'
            ? 'responsable-catalogo'
            : 'responsable-orden',
        );
      } else if (m.tipo === 'exacto') {
        responsable = m.valor;
      } else {
        exc({
          tipo: 'responsable-fuera-de-catalogo',
          severidad: 'info',
          detalle: `"${responsableOriginal}" no está en el catálogo de responsables${m.tipo === 'ambiguo' ? ` (varios parecidos: ${m.candidatos.join(' | ')})` : ''}`,
          sugerencia:
            'Se carga tal cual como nombre. Si es un error de escritura, corrígelo en la hoja Correcciones.',
          columna: 'responsable',
        });
      }
    }

    // Proveedor y su cuenta contra el catálogo (la cuenta se toma como texto del catálogo).
    let proveedor = proveedorOriginal;
    let cuentaProveedor = esSinDato(v.cuentaProveedor)
      ? '0'
      : texto(v.cuentaProveedor);
    if (cat?.proveedores.length && !esSinDato(proveedorOriginal)) {
      const nombres = cat.proveedores.map((p) => p.nombre);
      const m = buscarEnCatalogo(proveedorOriginal, nombres, 1);
      if (
        m.tipo === 'exacto' ||
        m.tipo === 'orden' ||
        m.tipo === 'aproximado'
      ) {
        proveedor = m.valor;
        if (m.tipo !== 'exacto')
          cambio(
            'PROVEEDOR',
            proveedorOriginal,
            proveedor,
            'proveedor-catalogo',
          );
        const cuentas = cat.proveedores.find(
          (p) => p.nombre === m.valor,
        )!.cuentas;
        if (cuentas.length === 1) {
          if (
            cuentaProveedor !== '0' &&
            compactar(cuentaProveedor) !== compactar(cuentas[0])
          ) {
            cambio(
              'CUENTA CTE O AHORROS PROVEEDOR',
              cuentaProveedor,
              cuentas[0],
              'cuenta-catalogo',
            );
          }
          cuentaProveedor = cuentas[0];
        } else if (cuentas.length > 1) {
          exc({
            tipo: 'proveedor-cuentas-ambiguas',
            severidad: 'info',
            detalle: `"${proveedor}" tiene ${cuentas.length} cuentas en el catálogo: ${cuentas.join(' | ')}`,
            sugerencia: 'Se conserva la cuenta que trae la fila.',
          });
        }
      } else {
        exc({
          tipo: 'proveedor-fuera-de-catalogo',
          severidad: 'info',
          detalle: `"${proveedorOriginal}" no está en el catálogo de proveedores`,
          sugerencia:
            'Se carga tal cual como beneficiario. Considera agregarlo al catálogo.',
          columna: 'proveedor',
        });
      }
    }
    if (esSinDato(proveedor) && clave(responsable) === 'ADMINISTRACION')
      sinBeneficiarioEtiquetas.add(etiqueta);

    // Centro de costo → decisión (obra / administración) y código del sistema.
    const llaveCentro = claveCodigo(centroOriginal);
    const base = centrosBase.get(llaveCentro);
    const descLista = texto(v.descCentroCosto);
    const descripcion = base?.descripcion || descLista;
    if (!decisiones.has(llaveCentro)) {
      decisiones.set(
        llaveCentro,
        proponerDecision(centroOriginal, descripcion),
      );
      decisionesNuevas.add(llaveCentro);
    }
    const decision = decisiones.get(llaveCentro)!;
    const centroCosto =
      decision.accion === 'administracion'
        ? CODIGO_ADMINISTRACION
        : decision.codigoSistema;
    const descCentroCosto =
      decision.accion === 'administracion'
        ? 'ADMINISTRACION / OFICINA'
        : decision.nombre || descripcion;
    if (!descLista && descripcion)
      cambio(
        'DESCRIPCIÓN DEL CENTRO DE COSTOS',
        '',
        descripcion,
        'descripcion-centro',
      );
    const nota =
      decision.accion === 'administracion'
        ? `Centro de costo (Excel): ${centroOriginal}${descripcion ? ` - ${descripcion}` : ''}`
        : '';

    // Rendición.
    const rendidoR = parseMonto(v.importeRendido);
    const importeRendido = rendidoR.ok ? rendidoR.valor : null;
    if (!rendidoR.ok) {
      exc({
        tipo: 'importe-rendido-ilegible',
        severidad: 'info',
        detalle: rendidoR.error,
        sugerencia: 'Se carga sin importe rendido.',
        columna: 'importeRendido',
      });
    } else if (importeRendido !== null) {
      if (
        estadoTexto === 'CERRADO' &&
        importeRendido > importeR.valor + 0.005
      ) {
        exc({
          tipo: 'rendicion-inconsistente',
          severidad: 'info',
          detalle: `Rendición cerrada con importe rendido (${importeRendido}) mayor al pagado (${importeR.valor})`,
          sugerencia: 'Probable devolución o diferencia por conciliar.',
        });
      } else if (
        estadoTexto === 'CERRADO' &&
        importeRendido < importeR.valor - 0.005
      ) {
        exc({
          tipo: 'rendicion-inconsistente',
          severidad: 'info',
          detalle: `Rendición cerrada con importe rendido (${importeRendido}) menor al pagado (${importeR.valor})`,
          sugerencia: 'Probable saldo devuelto o por conciliar.',
        });
      } else if (
        estadoTexto === 'ABIERTO' &&
        Math.abs(importeRendido - importeR.valor) < 0.005
      ) {
        exc({
          tipo: 'rendicion-inconsistente',
          severidad: 'info',
          detalle: 'Rendición abierta con el importe rendido igual al pagado',
          sugerencia: '¿Falta cerrarla en el Excel?',
        });
      }
    } else if (estadoTexto === 'CERRADO') {
      exc({
        tipo: 'rendicion-inconsistente',
        severidad: 'info',
        detalle: 'Rendición cerrada sin importe rendido',
        sugerencia: 'Se carga sin importe rendido.',
      });
    }

    const ruc = texto(v.ruc).replace(/\D/g, '') || EMPRESA_POR_DEFECTO_RUC;
    if (!validarRuc(ruc)) {
      exc({
        tipo: 'ruc-invalido',
        severidad: 'revisar',
        detalle: `RUC de la empresa inválido: "${limpiar(v.ruc)}"`,
        sugerencia: 'Corrígelo en la hoja Correcciones (columna RUC EMPRESA).',
        columna: 'ruc',
      });
    }

    limpias.push({
      filaOrigen: fila,
      codigo: f.codigo,
      subNumero: f.subNumero,
      fecha: f.fecha!,
      importe: importeR.valor,
      tipoOperacion,
      banco: texto(v.banco),
      cuenta: texto(v.cuenta),
      tipoGasto,
      detalle,
      responsable,
      proveedor,
      cuentaProveedor,
      centroCosto,
      descCentroCosto,
      importeRendido,
      generoComprobante: texto(v.generoComprobante),
      estadoRendicion: estadoTexto,
      empresa: texto(v.empresa),
      ruc,
      nota,
    });
    centroOriginalDe.set(etiqueta, centroOriginal);
    espaciosPorEtiqueta.set(etiqueta, celdasEnFilaActual);
  }

  // --- 6. Rango pedido -----------------------------------------------------
  const enRango = limpias.filter((l) => {
    const n = correlativo(l.codigo);
    if (
      opciones.desdeCorrelativo !== undefined &&
      n < opciones.desdeCorrelativo
    )
      return false;
    if (
      opciones.hastaCorrelativo !== undefined &&
      n > opciones.hastaCorrelativo
    )
      return false;
    if (opciones.desde && l.fecha < opciones.desde) return false;
    if (opciones.hasta && l.fecha > opciones.hasta) return false;
    return true;
  });
  const etiquetasEnRango = new Set(
    enRango.map((l) => `${l.codigo}.${l.subNumero}`),
  );
  const etiquetasFuera = new Set(
    limpias
      .map((l) => `${l.codigo}.${l.subNumero}`)
      .filter((e) => !etiquetasEnRango.has(e)),
  );
  /** Lo que no cae en el rango pedido no es parte de esta carga: no se reporta. */
  const pertenece = (etiqueta: string) =>
    !etiqueta ||
    (!etiquetasFuera.has(etiqueta) && !fueraPorCorrelativo(etiqueta, opciones));

  // --- 7. Centros y control ------------------------------------------------
  const centros = new Map<string, ResumenCentro>();
  for (const l of enRango) {
    const original =
      centroOriginalDe.get(`${l.codigo}.${l.subNumero}`) ?? l.centroCosto;
    const llave = claveCodigo(original);
    const previo = centros.get(llave);
    centros.set(llave, {
      codigoExcel: original,
      descripcion: centrosBase.get(llave)?.descripcion || l.descCentroCosto,
      filas: (previo?.filas ?? 0) + 1,
      importe: redondear2((previo?.importe ?? 0) + l.importe),
      primerPago:
        previo && previo.primerPago < l.fecha ? previo.primerPago : l.fecha,
      ultimoPago:
        previo && previo.ultimoPago > l.fecha ? previo.ultimoPago : l.fecha,
      decision: decisiones.get(llave)!,
      propuestaNueva: decisionesNuevas.has(llave),
    });
  }

  const cambiosDelRango = cambios.filter((c) => pertenece(c.comprobante));

  return {
    filas: enRango,
    cambios: cambiosDelRango,
    excepciones: excepciones.filter((e) => pertenece(e.comprobante)),
    exclusiones: exclusiones.filter((e) => pertenece(e.comprobante)),
    centros: [...centros.values()].sort((a, b) => b.filas - a.filas),
    decisiones,
    control: {
      filas: enRango.length,
      importe: redondear2(enRango.reduce((s, l) => s + l.importe, 0)),
      porMes: agrupar(enRango, (l) => iso(l.fecha).slice(0, 7)).map(
        ([mes, e]) => ({ mes, ...e }),
      ),
      porTipoGasto: agrupar(enRango, (l) => l.tipoGasto).map(
        ([tipoGasto, e]) => ({ tipoGasto, ...e }),
      ),
    },
    conteos: {
      leidas: crudas.length,
      limpias: enRango.length,
      fueraDeRango: limpias.length - enRango.length,
      fechasEnTexto: cambiosDelRango.filter((c) => c.regla === 'fecha-texto')
        .length,
      celdasConEspacios: enRango.reduce(
        (n, l) =>
          n + (espaciosPorEtiqueta.get(`${l.codigo}.${l.subNumero}`) ?? 0),
        0,
      ),
      sinBeneficiario: enRango.filter((l) =>
        sinBeneficiarioEtiquetas.has(`${l.codigo}.${l.subNumero}`),
      ).length,
      cambiosPorRegla: contarPorRegla(cambiosDelRango),
    },
  };
}

function contarPorRegla(cambios: Cambio[]): Record<string, number> {
  const cuenta: Record<string, number> = {};
  for (const c of cambios) cuenta[c.regla] = (cuenta[c.regla] ?? 0) + 1;
  return cuenta;
}

const redondear2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function agrupar(items: FilaLimpia[], llave: (l: FilaLimpia) => string) {
  const m = new Map<string, { filas: number; importe: number }>();
  for (const l of items) {
    const k = llave(l);
    const e = m.get(k) ?? { filas: 0, importe: 0 };
    e.filas++;
    e.importe = redondear2(e.importe + l.importe);
    m.set(k, e);
  }
  return [...m].sort((a, b) => a[0].localeCompare(b[0]));
}

/** ¿El comprobante (AA-NNNN.s) cae fuera del rango por correlativo pedido? */
function fueraPorCorrelativo(etiqueta: string, o: OpcionesLimpieza): boolean {
  const comp = parseComprobante(etiqueta.split('.')[0], '');
  if (!comp.ok || !comp.valor) return false;
  const n = correlativo(comp.valor.codigo);
  return (
    (o.desdeCorrelativo !== undefined && n < o.desdeCorrelativo) ||
    (o.hastaCorrelativo !== undefined && n > o.hastaCorrelativo)
  );
}

/**
 * Convierte "26-1828" o "261828" al correlativo numérico. Un número corto ("1828") es
 * ambiguo (los primeros comprobantes del año son de 4 dígitos: 2601 = 26-0001), así que se rechaza.
 */
export function parseCorrelativo(valor: string): number {
  const texto = valor.trim();
  if (/^\d{1,4}$/.test(texto)) {
    throw new Error(
      `"${valor}" es ambiguo: escribe el comprobante con el año, por ejemplo 26-1828`,
    );
  }
  const comp = parseComprobante(texto, '');
  if (comp.ok && comp.valor) return correlativo(comp.valor.codigo);
  throw new Error(
    `No entiendo el comprobante "${valor}" (usa 26-1828 o 261828)`,
  );
}
