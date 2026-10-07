import {
  claveCodigo,
  codigoDesdeDigitos,
  esAdministracion,
  esSinDato,
  huellaPersona,
  parseComprobante,
  parseFecha,
  parseMonto,
  titulo,
  validarRuc,
} from './normalizacion.js';

const valor = <T>(r: { ok: boolean; valor?: T; error?: string }) => {
  if (!r.ok) throw new Error(r.error);
  return r.valor;
};

describe('parseMonto', () => {
  it.each([
    ['S/180,00', 180],
    ['S/1.269,00', 1269],
    ['S/2.568,00', 2568],
    ['S/ 25,00', 25],
    ['1,269.50', 1269.5],
    ['1.269.500', 1269500],
    ['1.269', 1269],
    ['180.5', 180.5],
    ['180', 180],
    [1672, 1672],
    [35.456, 35.46],
    ['(S/ 50,00)', -50],
    ['-50,25', -50.25],
  ])('%p → %p', (entrada, esperado) => {
    expect(valor(parseMonto(entrada))).toBe(esperado);
  });

  it('vacío es null, no cero', () => {
    expect(valor(parseMonto(''))).toBeNull();
    expect(valor(parseMonto(null))).toBeNull();
    expect(valor(parseMonto('  '))).toBeNull();
  });

  it.each(['abc', 'S/12,3456', 'US$ 100', '$50', '12,34,56'])(
    'rechaza %p',
    (entrada) => {
      expect(parseMonto(entrada).ok).toBe(false);
    },
  );
});

describe('parseFecha', () => {
  const iso = (r: ReturnType<typeof parseFecha>) =>
    valor(r)!.toISOString().slice(0, 10);

  it('formato peruano dd/mm/aaaa', () => {
    expect(iso(parseFecha('25/09/2026'))).toBe('2026-09-25');
    expect(iso(parseFecha('5/9/2026'))).toBe('2026-09-05');
    expect(iso(parseFecha('05-09-26'))).toBe('2026-09-05');
  });

  it('ISO y fechas nativas de Excel (se normalizan a medianoche UTC)', () => {
    expect(iso(parseFecha('2026-09-25'))).toBe('2026-09-25');
    expect(iso(parseFecha(new Date(Date.UTC(2026, 8, 25, 13, 45))))).toBe(
      '2026-09-25',
    );
  });

  it('serial de Excel', () => {
    // 46290 = 25/09/2026
    expect(iso(parseFecha(46290))).toBe('2026-09-25');
  });

  it('rechaza fechas imposibles o no reconocidas', () => {
    expect(parseFecha('31/02/2026').ok).toBe(false);
    expect(parseFecha('2026/13/01').ok).toBe(false);
    expect(parseFecha('ayer').ok).toBe(false);
  });

  it('vacío es null', () => {
    expect(valor(parseFecha(''))).toBeNull();
  });
});

describe('codigoDesdeDigitos', () => {
  it('convierte 262248 en 26-2248', () => {
    expect(codigoDesdeDigitos('262248')).toBe('26-2248');
    expect(codigoDesdeDigitos('26-2248')).toBe('26-2248');
    expect(codigoDesdeDigitos('26248')).toBe('26-0248');
    expect(codigoDesdeDigitos('2512345')).toBe('25-12345');
    // Los primeros comprobantes del año no llevan ceros: 2601 = 26-0001.
    expect(codigoDesdeDigitos('2601')).toBe('26-0001');
    expect(codigoDesdeDigitos('2699')).toBe('26-0099');
  });

  it('rechaza lo que no es un correlativo', () => {
    expect(codigoDesdeDigitos('123')).toBeNull();
    expect(codigoDesdeDigitos('F001-123')).toBeNull();
  });
});

describe('parseComprobante', () => {
  it('toma el código y la línea del sub comprobante', () => {
    expect(valor(parseComprobante(262248, '262248,1'))).toEqual({
      codigo: '26-2248',
      subNumero: 1,
    });
    expect(valor(parseComprobante('262248', '262248,3'))).toEqual({
      codigo: '26-2248',
      subNumero: 3,
    });
  });

  it('acepta una sola de las dos columnas', () => {
    expect(valor(parseComprobante('262249', ''))).toEqual({
      codigo: '26-2249',
      subNumero: 1,
    });
    expect(valor(parseComprobante('', '262249,2'))).toEqual({
      codigo: '26-2249',
      subNumero: 2,
    });
    expect(valor(parseComprobante('262249', '2'))).toEqual({
      codigo: '26-2249',
      subNumero: 2,
    });
  });

  it('comprobantes de 4 y 5 dígitos del Excel real (2601.1, 26185.1)', () => {
    expect(valor(parseComprobante('2601', 2601.1))).toEqual({
      codigo: '26-0001',
      subNumero: 1,
    });
    expect(valor(parseComprobante('26185', 26185.2))).toEqual({
      codigo: '26-0185',
      subNumero: 2,
    });
    expect(valor(parseComprobante('', '2601,1'))).toEqual({
      codigo: '26-0001',
      subNumero: 1,
    });
  });

  it('el sub comprobante numérico de Excel (262248.1) también se entiende', () => {
    expect(valor(parseComprobante(262248, 262248.1))).toEqual({
      codigo: '26-2248',
      subNumero: 1,
    });
  });

  it('ambas vacías = pago sin código', () => {
    expect(valor(parseComprobante('', ''))).toBeNull();
  });

  it('detecta columnas que no coinciden y formatos raros', () => {
    expect(parseComprobante('262248', '262249,1').ok).toBe(false);
    expect(parseComprobante('', '1').ok).toBe(false);
    expect(parseComprobante('F001-77', '').ok).toBe(false);
    expect(parseComprobante('262248', 'uno').ok).toBe(false);
  });
});

describe('validarRuc', () => {
  it('valida el dígito verificador', () => {
    expect(validarRuc('20608745611')).toBe(true);
    expect(validarRuc('20608745612')).toBe(false);
    expect(validarRuc('2060874561')).toBe(false);
    expect(validarRuc('30608745611')).toBe(false);
  });
});

describe('textos', () => {
  it('"sin dato" cubre 0, NO APLICA y vacíos', () => {
    for (const v of ['', ' ', '0', 0, 'NO APLICA', 'no aplica', 'N/A', '-'])
      expect(esSinDato(v)).toBe(true);
    expect(esSinDato('PAGO EFECTIVO')).toBe(false);
    expect(esSinDato('19490158235022')).toBe(false);
  });

  it('administración no es obra ni persona', () => {
    for (const v of ['', '0', 'ADMINISTRACION', 'Administración', 'ADM'])
      expect(esAdministracion(v)).toBe(true);
    expect(esAdministracion('022-ING-26')).toBe(false);
  });

  it('la huella de persona ignora orden, acentos y partículas', () => {
    expect(huellaPersona('PALMA MENDOZA CARLOS LUIS')).toBe(
      huellaPersona('Carlos Luis Palma Mendoza'),
    );
    expect(huellaPersona('Muñoz de la Cruz José')).toBe(
      huellaPersona('JOSE MUNOZ CRUZ'),
    );
    expect(huellaPersona('PALMA MENDOZA CARLOS')).not.toBe(
      huellaPersona('PALMA MENDOZA CARLOS LUIS'),
    );
  });

  it('titulo para el tipo de operación', () => {
    expect(titulo('TRANSFERENCIA')).toBe('Transferencia');
    expect(titulo('débito  automático')).toBe('Débito Automático');
  });

  it('claveCodigo ignora espacios y mayúsculas en códigos de obra', () => {
    expect(claveCodigo('017- ING-26')).toBe(claveCodigo('017-ING-26'));
    expect(claveCodigo(' 15-ing-26 ')).toBe('15-ING-26');
    // 01-ING-26 y 001-ING-26 son obras distintas: no se rellenan ceros.
    expect(claveCodigo('01-ING-26')).not.toBe(claveCodigo('001-ING-26'));
  });
});
