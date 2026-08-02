import { EstadoPago, TipoBeneficiario } from '../../../../prisma/types.js';
import type { ReporteEntidadMeta } from '../tipos.js';

export const PAGO_META: ReporteEntidadMeta = {
  entidad: 'pago',
  label: 'Pagos',
  modeloPrisma: 'pago',
  campoFechaDefault: 'fechaProgramada',
  campos: [
    { key: 'id', label: 'ID', tipo: 'string', path: ['id'], operadores: ['eq', 'in'], metrica: true },
    {
      key: 'estado',
      label: 'Estado',
      tipo: 'enum',
      path: ['estado'],
      enumValues: Object.values(EstadoPago),
      operadores: ['eq', 'neq', 'in'],
      agrupable: true,
    },
    {
      key: 'tipoBeneficiario',
      label: 'Tipo de beneficiario',
      tipo: 'enum',
      path: ['tipoBeneficiario'],
      enumValues: Object.values(TipoBeneficiario),
      operadores: ['eq', 'neq', 'in'],
      agrupable: true,
    },
    { key: 'monto', label: 'Monto', tipo: 'decimal', path: ['monto'], operadores: ['eq', 'gt', 'gte', 'lt', 'lte', 'between'], metrica: true },
    { key: 'porcentaje', label: 'Porcentaje', tipo: 'decimal', path: ['porcentaje'], operadores: ['eq', 'gt', 'gte', 'lt', 'lte'], metrica: true },
    { key: 'metodoPago', label: 'Método de pago', tipo: 'string', path: ['metodoPago'], operadores: ['contains', 'eq'], agrupable: true },
    { key: 'fechaProgramada', label: 'Fecha programada', tipo: 'date', path: ['fechaProgramada'], operadores: ['eq', 'gt', 'gte', 'lt', 'lte', 'between'] },
    { key: 'fechaPagoReal', label: 'Fecha de pago real', tipo: 'date', path: ['fechaPagoReal'], operadores: ['eq', 'gt', 'gte', 'lt', 'lte', 'between'] },
    {
      key: 'mesProgramado',
      label: 'Mes programado',
      tipo: 'string',
      path: ['fechaProgramada'],
      operadores: [],
      agrupable: true,
      virtual: { transform: 'mesTruncado' },
    },
    {
      key: 'ordenCompraId',
      label: 'Orden de compra',
      tipo: 'relacion',
      path: ['ordenCompraId'],
      operadores: ['eq', 'in'],
      relacion: { entidad: 'ordenCompra', labelField: 'numero' },
    },
    { key: 'ordenCompra.numero', label: 'Orden de compra — número', tipo: 'string', path: ['ordenCompra', 'numero'], operadores: ['contains', 'eq'], agrupable: true },
  ],
};
