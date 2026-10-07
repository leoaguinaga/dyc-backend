import { Body, Controller, Get, Param, Patch, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { UsersService } from './users.service.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { Permissions } from '../../shared/decorators/permissions.decorator.js';
import { Modulo, SinModulo } from '../../shared/decorators/modulo.decorator.js';

@Controller('users')
@Modulo('usuarios')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  @SinModulo()
  getMe(@Req() req: Request & { user: { id: string } }) {
    return this.usersService.findOne(req.user.id);
  }

  @Patch('me/password')
  @SinModulo()
  async changeOwnPassword(
    @Req() req: Request & { user: { id: string } },
    @Body() dto: ChangePasswordDto,
  ) {
    await this.usersService.changeOwnPassword(req.user.id, dto.newPassword);
    return { status: true };
  }

  @Get()
  @Permissions('users.manage')
  @Roles('administrador', 'gerencia')
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @Permissions('users.manage')
  @Roles('administrador', 'gerencia')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Get(':id/actividad')
  @Permissions('users.manage')
  @Roles('administrador', 'gerencia')
  findActivity(@Param('id') id: string) {
    return this.usersService.findActivity(id);
  }

  @Get(':id/auditoria')
  @Permissions('users.manage')
  @Roles('administrador', 'gerencia')
  findAuditLog(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const parsedPage = Math.max(1, Number(page) || 1);
    const parsedPageSize = Math.min(100, Math.max(1, Number(pageSize) || 50));
    return this.usersService.findAuditLog(id, parsedPage, parsedPageSize);
  }

  @Patch(':id')
  @Permissions('users.manage')
  @Roles('administrador', 'gerencia')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Patch(':id/password')
  @Permissions('users.manage')
  @Roles('administrador', 'gerencia')
  async changePassword(@Param('id') id: string, @Body() dto: ChangePasswordDto) {
    await this.usersService.changePassword(id, dto.newPassword);
    return { status: true };
  }
}
