import { ordenarTareas, type TareaDashboard } from './dashboard.service.js';

function tarea(
  id: string,
  prioridad: TareaDashboard['prioridad'],
  requiereAccion = true,
): TareaDashboard {
  return {
    id,
    tipo: 'prueba',
    prioridad,
    titulo: id,
    contexto: id,
    href: '/',
    requiereAccion,
    bloqueada: false,
    proxima: false,
  };
}

describe('ordenarTareas', () => {
  it('prioriza bloqueos críticos y después acciones directas', () => {
    const ordenadas = ordenarTareas([
      tarea('seguimiento', 'normal', false),
      tarea('accion-normal', 'normal'),
      tarea('critica', 'critica'),
      tarea('alta', 'alta'),
    ]);

    expect(ordenadas.map((item) => item.id)).toEqual([
      'critica',
      'alta',
      'accion-normal',
      'seguimiento',
    ]);
  });
});
