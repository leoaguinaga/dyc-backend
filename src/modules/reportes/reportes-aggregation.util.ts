import type { FuncionMetrica } from './catalogo/tipos.js';

export interface EstadoMetrica {
  funcion: FuncionMetrica;
  count: number;
  sum: number;
  min: number | null;
  max: number | null;
}

export function crearEstadoMetrica(funcion: FuncionMetrica): EstadoMetrica {
  return { funcion, count: 0, sum: 0, min: null, max: null };
}

export function acumularMetrica(estado: EstadoMetrica, valorCrudo: unknown): void {
  if (valorCrudo === null || valorCrudo === undefined) return;

  if (estado.funcion === 'count') {
    estado.count += 1;
    return;
  }

  const valor = Number(valorCrudo);
  if (Number.isNaN(valor)) return;

  estado.count += 1;
  estado.sum += valor;
  estado.min = estado.min === null ? valor : Math.min(estado.min, valor);
  estado.max = estado.max === null ? valor : Math.max(estado.max, valor);
}

export function finalizarMetrica(estado: EstadoMetrica): number {
  switch (estado.funcion) {
    case 'count':
      return estado.count;
    case 'sum':
      return estado.sum;
    case 'avg':
      return estado.count === 0 ? 0 : estado.sum / estado.count;
    case 'min':
      return estado.min ?? 0;
    case 'max':
      return estado.max ?? 0;
  }
}

export function claveDeGrupo(valores: unknown[]): string {
  return JSON.stringify(valores);
}
