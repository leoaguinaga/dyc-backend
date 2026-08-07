import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { ComprasSimplesService } from './compras-simples.service.js';
import { CreateCompraSimpleDto } from './dto/create-compra-simple.dto.js';
import { AprobarGrupoDto, ObservarGrupoDto } from './dto/decision-grupo.dto.js';

const MAX_ARCHIVO_BYTES = 10 * 1024 * 1024;

@Controller('compras-simples')
@Roles(
  'supervisor', 'supervisor_civil', 'supervisor_electrico', 'pdr',
  'ing_civil', 'ing_electrico', 'jefe_sig',
  'logistica', 'gerencia', 'administrador',
)
export class ComprasSimplesController {
  constructor(private service: ComprasSimplesService) {}

  @Get()
  findAll(@Query('proyectoId') proyectoId?: string) {
    return this.service.findAll({ proyectoId });
  }

  @Get('mi-trabajador')
  miTrabajador(@Req() req: Request) {
    return this.service.miTrabajador(req.user!.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCompraSimpleDto, @Req() req: Request) {
    return this.service.create(dto, req.user!.id, req.user!.role);
  }

  @Post('grupos/:grupoId/aprobar')
  aprobarGrupo(
    @Param('grupoId') grupoId: string,
    @Body() dto: AprobarGrupoDto,
    @Req() req: Request,
  ) {
    return this.service.aprobarGrupo(grupoId, dto, req.user!.id, req.user!.role);
  }

  @Post('grupos/:grupoId/observar')
  observarGrupo(
    @Param('grupoId') grupoId: string,
    @Body() dto: ObservarGrupoDto,
    @Req() req: Request,
  ) {
    return this.service.observarGrupo(grupoId, dto, req.user!.id, req.user!.role);
  }

  @Post('grupos/:grupoId/reenviar')
  reenviarGrupo(@Param('grupoId') grupoId: string, @Req() req: Request) {
    return this.service.reenviarGrupo(grupoId, req.user!.id, req.user!.role);
  }

  @Post('grupos/:grupoId/archivos')
  @UseInterceptors(
    FileInterceptor('archivo', {
      limits: { fileSize: MAX_ARCHIVO_BYTES },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype !== 'application/pdf' && !file.mimetype.startsWith('image/')) {
          cb(new BadRequestException('Solo se permiten archivos PDF o imágenes'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  subirArchivo(
    @Param('grupoId') grupoId: string,
    @Req() req: Request,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Debes adjuntar un archivo');
    return this.service.subirArchivo(grupoId, file, req.user!.id);
  }
}
