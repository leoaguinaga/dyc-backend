import { Body, Controller, Get, Param, Patch, Req } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { UsersService } from './users.service.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  getMe(@Req() req: Request & { user: { id: string } }) {
    return this.usersService.findOne(req.user.id);
  }

  @Get()
  @Roles('administrador', 'gerencia')
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @Roles('administrador', 'gerencia')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @Roles('administrador', 'gerencia')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }
}
