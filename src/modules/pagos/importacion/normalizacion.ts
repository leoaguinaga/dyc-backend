/**
 * Conversión de las celdas del Excel de tesorería a los tipos del sistema.
 * Todo son funciones puras: el Excel real mezcla texto con formato peruano
 * ("S/1.269,00", "25/09/2026", "262248,1") y valores nativos de Excel (números,
 * fechas, seriales), y las dos formas tienen que dar el mismo resultado.
 */

export type Resultado<T> =
  | { ok: true; valor: T }
  | { ok: false; error: string };

const ok = <T>(valor: T): Resultado<T> => ({ ok: true, valor });
const fallo = <T>(error: string): Resultado<T> => ({ ok: false, error });

/** Espacios de no separación y caracteres de ancho cero que Excel arrastra al copiar y pegar. */
const ESPACIOS_RAROS = new RegExp('[\\u00A0\\u200B-\\u200D\\uFEFF]', 'g');

/** Texto sin espacios raros ni dobles: lo que se guarda en la base. */
export function limpiar(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  if (
    typeof valor !== 'string' &&
    typeof valor !== 'number' &&
    typeof valor !== 'boolean'
  )
    return '';
  return String(valor).replace(ESPACIOS_RAROS, ' ').replace(/\s+/g, ' ').trim();
}

/** Texto comparable: mayúsculas, sin acentos, espacios simples. */
export function clave(valor: unknown): string {
  return limpiar(valor)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase();
}

const SIN_DATO = new Set([
  '',
  '0',
  'NO APLICA',
  'NOAPLICA',
  'N/A',
  'NA',
  '-',
  '--',
  'NINGUNO',
  'NINGUNA',
  'S/N',
]);

/** Celda vacía o con un marcador de "no hay" (0, NO APLICA, N/A, -). */
export function esSinDato(valor: unknown): boolean {
  return SIN_DATO.has(clave(valor));
}

const ADMINISTRACION = new Set([
  '',
  '0',
  'ADMINISTRACION',
  'ADMINISTRACION / OFICINA',
  'ADM',
  'OFICINA',
  'NO APLICA',
  'N/A',
]);

/** Centro de costo / responsable que no es una obra ni una persona concreta. */
export function esAdministracion(valor: unknown): boolean {
  return ADMINISTRACION.has(clave(valor));
}

const redondear2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * "S/1.269,00", "S/ 180,00", "1,269.00", "180", 180.5 → número con 2 decimales.
 * Vacío → null. Solo soles: un símbolo de dólar es un error, no se convierte.
 */
export function parseMonto(valor: unknown): Resultado<number | null> {
  if (valor === null || valor === undefined) return ok(null);
  if (typeof valor === 'number') {
    return Number.isFinite(valor)
      ? ok(redondear2(valor))
      : fallo('importe no numérico');
  }
  let texto = limpiar(valor).toUpperCase();
  if (!texto) return ok(null);
  if (/\$|USD|DOLAR|EUR|€/.test(texto))
    return fallo(
      `moneda no soportada ("${limpiar(valor)}"): el sistema solo maneja soles`,
    );

  const negativo = /^\(.*\)$/.test(texto) || texto.startsWith('-');
  texto = texto.replace(/S\/\.?|PEN|SOLES?/g, '').replace(/[\s()-]/g, '');
  if (!/^[0-9.,]+$/.test(texto))
    return fallo(`importe no reconocido: "${limpiar(valor)}"`);

  const ultimoPunto = texto.lastIndexOf('.');
  const ultimaComa = texto.lastIndexOf(',');
  let normalizado: string;
  if (ultimoPunto >= 0 && ultimaComa >= 0) {
    // El separador que aparece al final es el decimal; el otro agrupa miles.
    const decimal = ultimoPunto > ultimaComa ? '.' : ',';
    const miles = decimal === '.' ? ',' : '.';
    normalizado = texto.split(miles).join('').replace(decimal, '.');
  } else if (ultimoPunto >= 0 || ultimaComa >= 0) {
    const sep = ultimoPunto >= 0 ? '.' : ',';
    const partes = texto.split(sep);
    const decimales = partes[partes.length - 1].length;
    if (partes.length > 2) {
      // Varias apariciones: solo pueden ser separadores de miles (1.269.500).
      if (partes.slice(1).some((p) => p.length !== 3))
        return fallo(`importe no reconocido: "${limpiar(valor)}"`);
      normalizado = partes.join('');
    } else if (
      decimales === 3 &&
      partes[0].length >= 1 &&
      partes[0].length <= 3 &&
      partes[0] !== '0'
    ) {
      normalizado = partes.join(''); // "1.269" / "1,269" → miles
    } else if (decimales >= 1 && decimales <= 2) {
      normalizado = `${partes[0]}.${partes[1]}`;
    } else {
      return fallo(`importe no reconocido: "${limpiar(valor)}"`);
    }
  } else {
    normalizado = texto;
  }

  const numero = Number(normalizado);
  if (!Number.isFinite(numero))
    return fallo(`importe no reconocido: "${limpiar(valor)}"`);
  return ok(redondear2(negativo ? -numero : numero));
}

const EPOCA_EXCEL = Date.UTC(1899, 11, 30);

function fechaValida(anio: number, mes: number, dia: number): Date | null {
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  const coincide =
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia;
  return coincide ? fecha : null;
}

/**
 * Fecha calendario a medianoche UTC (mismo convenio que el resto del sistema).
 * Acepta Date de Excel, serial numérico, "dd/mm/aaaa" (formato peruano) y ISO.
 */
export function parseFecha(valor: unknown): Resultado<Date | null> {
  if (valor === null || valor === undefined) return ok(null);
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return fallo('fecha inválida');
    return ok(
      new Date(
        Date.UTC(
          valor.getUTCFullYear(),
          valor.getUTCMonth(),
          valor.getUTCDate(),
        ),
      ),
    );
  }
  if (typeof valor === 'number') return desdeSerial(valor);

  const texto = limpiar(valor);
  if (!texto) return ok(null);

  const latina = texto.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/);
  if (latina) {
    const anio =
      latina[3].length === 2 ? 2000 + Number(latina[3]) : Number(latina[3]);
    const fecha = fechaValida(anio, Number(latina[2]), Number(latina[1]));
    return fecha ? ok(fecha) : fallo(`fecha inexistente: "${texto}"`);
  }
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/);
  if (iso) {
    const fecha = fechaValida(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return fecha ? ok(fecha) : fallo(`fecha inexistente: "${texto}"`);
  }
  if (/^\d{5}(\.\d+)?$/.test(texto)) return desdeSerial(Number(texto));
  return fallo(`fecha no reconocida: "${texto}" (usa dd/mm/aaaa)`);
}

function desdeSerial(serial: number): Resultado<Date | null> {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000)
    return fallo(`fecha no reconocida: ${serial}`);
  return ok(new Date(EPOCA_EXCEL + Math.floor(serial) * 86_400_000));
}

const CODIGO_CON_GUION = /^\d{2}-\d{4,6}$/;

/** 262248 → "26-2248"; 2601 → "26-0001" (año de 2 dígitos + correlativo, rellenado a 4). */
export function codigoDesdeDigitos(digitos: string): string | null {
  if (CODIGO_CON_GUION.test(digitos)) return digitos;
  if (!/^\d{4,8}$/.test(digitos)) return null;
  const codigo = `${digitos.slice(0, 2)}-${digitos.slice(2).padStart(4, '0')}`;
  return CODIGO_CON_GUION.test(codigo) ? codigo : null;
}

export interface Comprobante {
  codigo: string;
  subNumero: number;
}

/**
 * "N° DE SUB COMPROBANTE" (262248,1) + "Nº COMPROBANTE" (262248) → código AA-NNNN
 * y línea. Cualquiera de las dos columnas basta; si vienen ambas deben
 * coincidir. Ambas vacías → null (el pago se carga sin código).
 */
export function parseComprobante(
  numeroCrudo: unknown,
  subCrudo: unknown,
): Resultado<Comprobante | null> {
  const numero = limpiar(numeroCrudo);
  const sub = limpiar(subCrudo);
  if (!numero && !sub) return ok(null);

  let codigoSub: string | null = null;
  let subNumero = 1;
  if (sub) {
    const conBase = sub.match(/^(\d{2}-\d{4,6}|\d{4,8})\s*[,.]\s*(\d{1,3})$/);
    if (conBase) {
      codigoSub = codigoDesdeDigitos(conBase[1]);
      subNumero = Number(conBase[2]);
    } else if (/^\d{1,3}$/.test(sub)) {
      subNumero = Number(sub);
    } else if (codigoDesdeDigitos(sub)) {
      codigoSub = codigoDesdeDigitos(sub);
    } else {
      return fallo(
        `N° de sub comprobante no reconocido: "${sub}" (formato esperado: 262248,1)`,
      );
    }
  }

  let codigoNumero: string | null = null;
  if (numero) {
    codigoNumero = codigoDesdeDigitos(numero);
    if (!codigoNumero)
      return fallo(
        `N° de comprobante no reconocido: "${numero}" (formato esperado: 262248 o 26-2248)`,
      );
  }

  if (codigoSub && codigoNumero && codigoSub !== codigoNumero) {
    return fallo(
      `el sub comprobante (${sub}) no corresponde al N° de comprobante (${numero})`,
    );
  }
  const codigo = codigoNumero ?? codigoSub;
  if (!codigo)
    return fallo(`falta el N° de comprobante (solo hay la línea "${sub}")`);
  if (subNumero < 1)
    return fallo(`la línea del sub comprobante debe ser 1 o más ("${sub}")`);
  return ok({ codigo, subNumero });
}

/** Dígito verificador del RUC peruano (módulo 11). */
export function validarRuc(ruc: string): boolean {
  if (!/^(10|15|16|17|20)\d{9}$/.test(ruc)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((acc, peso, i) => acc + peso * Number(ruc[i]), 0);
  const resto = 11 - (suma % 11);
  const digito = resto === 10 ? 0 : resto === 11 ? 1 : resto;
  return digito === Number(ruc[10]);
}

const PALABRAS_VACIAS = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'Y', 'E']);

/**
 * Huella de un nombre de persona independiente del orden: el Excel escribe
 * "PALMA MENDOZA CARLOS LUIS" y el sistema puede tener "Carlos Luis Palma Mendoza".
 */
export function huellaPersona(nombre: unknown): string {
  return clave(nombre)
    .split(/[^A-Z0-9]+/)
    .filter((t) => t && !PALABRAS_VACIAS.has(t))
    .sort()
    .join(' ');
}

/** "TRANSFERENCIA" → "Transferencia" (el vocabulario que ya usa la pantalla de pagos). */
export function titulo(valor: unknown): string {
  return limpiar(valor)
    .toLowerCase()
    .replace(
      /(^|\s)(\S)/g,
      (_, esp: string, letra: string) => esp + letra.toUpperCase(),
    );
}

export const METODOS_CONOCIDOS = new Set([
  'TRANSFERENCIA',
  'EFECTIVO',
  'YAPE',
  'PLIN',
  'CHEQUE',
  'DEPOSITO',
  'DEBITO AUTOMATICO',
]);

/**
 * Llave para comparar códigos de obra: sin espacios ni mayúsculas. El Excel de
 * tesorería trae "017- ING-26" (con espacio) y el mismo código sin él.
 */
export function claveCodigo(valor: unknown): string {
  return clave(valor).replace(/\s+/g, '');
}
