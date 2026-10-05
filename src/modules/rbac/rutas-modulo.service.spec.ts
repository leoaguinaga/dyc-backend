import { Controller, Get, Post } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { RutasModuloService } from './rutas-modulo.service.js';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { Public } from '../../shared/decorators/public.decorator.js';
import { Permissions } from '../../shared/decorators/permissions.decorator.js';
import {
  Modulo,
  NivelModulo,
  SinModulo,
} from '../../shared/decorators/modulo.decorator.js';
import { RequireResponsableAsistencia } from '../../shared/decorators/require-responsable-asistencia.decorator.js';

@Controller('clientes')
@Modulo('clientes')
@Roles('administrador', 'logistica')
class ClientesFalso {
  @Get() listar() {}
  @Post() @Roles('administrador') crear() {}
  @Post('buscar') @NivelModulo('ver') buscar() {}
  @Get('me') @SinModulo() propio() {}
  @Get('publico') @Public() publico() {}
  @Get('permiso') @Permissions('users.manage') conPermiso() {}
  ayudante() {}
}

@Controller('asistencias/proyectos/:proyectoId/turnos')
@Modulo('asistencia')
class AsistenciaFalsa {
  @Post() @RequireResponsableAsistencia() abrir() {}
  @Post('cerrar')
  @Roles('pdr', 'logistica')
  @RequireResponsableAsistencia()
  cerrar() {}
}

@Controller('libre')
class SinModuloFalso {
  @Get() libre() {}
}

describe('RutasModuloService', () => {
  async function rutas() {
    const ref = await Test.createTestingModule({
      imports: [DiscoveryModule],
      controllers: [ClientesFalso, AsistenciaFalsa, SinModuloFalso],
      providers: [RutasModuloService],
    }).compile();
    const service = ref.get(RutasModuloService);
    service.onModuleInit();
    return service.listar();
  }

  it('inventaría solo endpoints con módulo, sin públicos ni @SinModulo', async () => {
    const lista = await rutas();
    expect(lista.map((r) => r.ruta).sort()).toEqual([
      'GET /clientes',
      'GET /clientes/permiso',
      'POST /asistencias/proyectos/:proyectoId/turnos',
      'POST /asistencias/proyectos/:proyectoId/turnos/cerrar',
      'POST /clientes',
      'POST /clientes/buscar',
    ]);
  });

  it('toma el nivel del método salvo @NivelModulo y hereda @Roles de la clase', async () => {
    const lista = await rutas();
    const por = (ruta: string) => lista.find((r) => r.ruta === ruta)!;
    expect(por('GET /clientes')).toEqual(
      expect.objectContaining({
        nivel: 'ver',
        roles: ['administrador', 'logistica'],
      }),
    );
    expect(por('POST /clientes')).toEqual(
      expect.objectContaining({ nivel: 'editar', roles: ['administrador'] }),
    );
    expect(por('POST /clientes/buscar').nivel).toBe('ver');
    expect(por('GET /clientes/permiso').permisos).toEqual(['users.manage']);
  });

  it('acota a los responsables de asistencia cuando el endpoint lo exige', async () => {
    const lista = await rutas();
    const abrir = lista.find(
      (r) => r.ruta === 'POST /asistencias/proyectos/:proyectoId/turnos',
    )!;
    expect(abrir.roles).toEqual(
      expect.arrayContaining(['administrador', 'gerencia', 'jefe_sig', 'pdr']),
    );
    expect(abrir.roles).not.toContain('logistica');
    const cerrar = lista.find((r) => r.ruta.endsWith('/cerrar'))!;
    expect(cerrar.roles).toEqual(['pdr']);
  });
});
