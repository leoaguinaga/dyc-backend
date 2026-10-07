import type { Role } from '../../prisma/types.js';
import { puedeCrearTipo, tiposCreablesPorRol } from './tipos-creables.js';

describe('tiposCreablesPorRol', () => {
  it.each<Role>(['jefe_sig', 'pdr', 'coordinador_ssoma'])(
    '"%s" solo crea seguridad',
    (rol) => {
      expect(tiposCreablesPorRol(rol)).toEqual(['seguridad']);
    },
  );

  it('tesorería no crea requerimientos ni compras', () => {
    expect(tiposCreablesPorRol('tesoreria')).toEqual([]);
    expect(puedeCrearTipo('tesoreria', 'seguridad')).toBe(false);
  });

  it.each<Role>(['ing_electrico', 'supervisor_electrico'])(
    '"%s" crea eléctrico y seguridad',
    (rol) => {
      expect(tiposCreablesPorRol(rol)).toEqual(['electrico', 'seguridad']);
    },
  );

  it.each<Role>(['ing_civil', 'supervisor_civil'])(
    '"%s" crea civil y eléctrico',
    (rol) => {
      expect(tiposCreablesPorRol(rol)).toEqual(['civil', 'electrico']);
    },
  );

  it.each<Role>(['logistica', 'administrador', 'gerencia', 'admin_ti'])(
    '"%s" crea cualquier tipo',
    (rol) => {
      expect(tiposCreablesPorRol(rol).sort()).toEqual([
        'administrativo',
        'civil',
        'electrico',
        'seguridad',
      ]);
    },
  );

  it('los roles técnicos no crean administrativo', () => {
    const tecnicos: Role[] = [
      'jefe_sig',
      'pdr',
      'ing_civil',
      'ing_electrico',
      'supervisor_civil',
      'supervisor_electrico',
    ];
    for (const rol of tecnicos) {
      expect(puedeCrearTipo(rol, 'administrativo')).toBe(false);
    }
  });

  it('ing. civil no crea seguridad y jefe SIG no crea civil', () => {
    expect(puedeCrearTipo('ing_civil', 'seguridad')).toBe(false);
    expect(puedeCrearTipo('jefe_sig', 'civil')).toBe(false);
  });
});
