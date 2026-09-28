import { montoConIgv, IGV_RATE } from './igv.util.js';

describe('montoConIgv', () => {
  it('no toca el monto si los precios de línea ya incluyen IGV', () => {
    expect(montoConIgv(55000, true)).toBe(55000);
    expect(montoConIgv(0, true)).toBe(0);
  });

  it('agrega el 18% cuando el IGV no está incluido', () => {
    // Caso real: OC-2026-0062 — subtotal S/46,610.17 → total S/55,000.00
    expect(montoConIgv(46610.17, false)).toBe(55000);
  });

  it('usa la tasa vigente (18%) para casos arbitrarios', () => {
    expect(montoConIgv(1000, false)).toBe(1000 * (1 + IGV_RATE));
    expect(montoConIgv(100, false)).toBe(118);
  });

  it('redondea a 2 decimales', () => {
    expect(montoConIgv(10.005, false)).toBe(11.81);
  });

  it('trata montos negativos o cero de forma consistente (sin lanzar)', () => {
    expect(montoConIgv(0, false)).toBe(0);
    expect(() => montoConIgv(-100, false)).not.toThrow();
  });
});
