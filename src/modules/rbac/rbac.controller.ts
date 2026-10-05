import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { RbacService } from './rbac.service.js';
import type { Role } from '../../prisma/types.js';

@Controller('rbac/permissions')
@Roles('admin_ti')
export class RbacController {
  constructor(private readonly rbac: RbacService) {}
  @Get() list() {
    return this.rbac.list();
  }
  @Put(':code') setRoles(
    @Param('code') code: string,
    @Body() body: { roles: Role[]; description?: string },
  ) {
    return this.rbac.setRoles(code, body.roles, body.description);
  }
}
