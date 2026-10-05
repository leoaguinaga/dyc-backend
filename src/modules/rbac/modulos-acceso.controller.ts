import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../../shared/guards/auth.guard.js';
import { Role } from '../../prisma/types.js';
import { RbacService } from './rbac.service.js';
import { SetNivelModuloDto } from './dto/set-nivel-modulo.dto.js';

type ReqAutenticado = Request & { user: AuthenticatedUser };

function validarRol(role: string): Role {
  if (!(role in Role))
    throw new BadRequestException(`Rol desconocido: ${role}`);
  return role as Role;
}

@Controller('rbac/modulos')
export class ModulosAccesoController {
  constructor(private readonly rbac: RbacService) {}

  /** Excepciones que aplican al usuario actual (null = según su rol). */
  @Get('mios')
  mios(@Req() req: ReqAutenticado) {
    return this.rbac.misModulos(req.user.id, req.user.role);
  }

  @Get()
  @Roles('admin_ti', 'administrador', 'gerencia')
  matriz() {
    return this.rbac.matriz();
  }

  @Put(':modulo/roles/:role')
  @Roles('admin_ti')
  setNivelRol(
    @Param('modulo') modulo: string,
    @Param('role') role: string,
    @Body() dto: SetNivelModuloDto,
    @Req() req: ReqAutenticado,
  ) {
    return this.rbac.setNivelRol(
      modulo,
      validarRol(role),
      dto.nivel,
      req.user.id,
    );
  }

  @Get('usuarios/:userId')
  @Roles('admin_ti', 'administrador', 'gerencia')
  accesosUsuario(@Param('userId') userId: string) {
    return this.rbac.accesosUsuario(userId);
  }

  @Put(':modulo/usuarios/:userId')
  @Roles('admin_ti')
  setNivelUsuario(
    @Param('modulo') modulo: string,
    @Param('userId') userId: string,
    @Body() dto: SetNivelModuloDto,
    @Req() req: ReqAutenticado,
  ) {
    return this.rbac.setNivelUsuario(modulo, userId, dto.nivel, req.user.id);
  }
}
