import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { AyudaService } from './ayuda.service.js';
import { CreateHelpVideoDto } from './dto/create-help-video.dto.js';
import { UpdateHelpVideoDto } from './dto/update-help-video.dto.js';

@Controller('ayuda')
export class AyudaController {
  constructor(private service: AyudaService) {}

  @Get('videos')
  findAll(@Req() req: Request) {
    return this.service.findAllForRole(req.user!.role);
  }

  @Post('videos')
  @Roles('admin_ti')
  create(@Body() dto: CreateHelpVideoDto, @Req() req: Request) {
    return this.service.create(dto, req.user!.id);
  }

  @Patch('videos/:id')
  @Roles('admin_ti')
  update(@Param('id') id: string, @Body() dto: UpdateHelpVideoDto) {
    return this.service.update(id, dto);
  }

  @Delete('videos/:id')
  @Roles('admin_ti')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
