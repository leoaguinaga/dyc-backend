export const IGV_RATE = 0.18;

/**
 * Total final a pagar de una OC/cotización: si `incluyeIgv` es true, los
 * precios de línea (y por tanto `montoTotal`) ya lo incluyen; si es false,
 * el IGV se agrega encima. El plan de pagos (cuotas, detracción, etc.) debe
 * repartirse siempre sobre este monto final, nunca sobre el subtotal.
 */
export function montoConIgv(montoTotal: number, incluyeIgv: boolean): number {
  if (incluyeIgv) return montoTotal;
  return Math.round(montoTotal * (1 + IGV_RATE) * 100) / 100;
}
