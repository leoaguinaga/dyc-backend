import type { Role } from '../../prisma/types.js';
import { soloPendienteGerencia, tiposListadosPorRol } from './alcance-listado.js';

describe('tiposListadosPorRol', () => {
  it('los ings ven civil y eléctrico', () => {
    expect(tiposListadosPorRol('rol', 'ing_civil')).toEqual([
      'civil',
      'electrico',
    ]);
    expect(tiposListadosPorRol('rol', 'ing_electrico')).toEqual([
      'civil',
      'electrico',
    ]);
  });

  it('Jefe SIG ve seguridad y administrativo', () => {
    expect(tiposListadosPorRol('rol', 'jefe_sig')).toEqual([
      'seguridad',
      'administrativo',
    ]);
  });

  it.each<Role>([
    'logistica',
    'administrador',
    'admin_ti',
    'gerencia',
    'supervisor',
    'pdr',
  ])('"%s" no se filtra por tipo', (rol) => {
    expect(tiposListadosPorRol('rol', rol)).toBeNull();
  });

  it('sin ?alcance=rol no filtra a nadie', () => {
    expect(tiposListadosPorRol(undefined, 'ing_civil')).toBeNull();
    expect(tiposListadosPorRol(undefined, 'jefe_sig')).toBeNull();
  });
});

describe('soloPendienteGerencia', () => {
  it('aplica solo a gerencia con ?alcance=rol', () => {
    expect(soloPendienteGerencia('rol', 'gerencia')).toBe(true);
    expect(soloPendienteGerencia(undefined, 'gerencia')).toBe(false);
    expect(soloPendienteGerencia('rol', 'administrador')).toBe(false);
    expect(soloPendienteGerencia('rol', 'logistica')).toBe(false);
  });
});
