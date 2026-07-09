import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { RequerimientosService } from './requerimientos.service.js';
import { CreateRequerimientoDto } from './dto/create-requerimiento.dto.js';
import { UpdateRequerimientoDto } from './dto/update-requerimiento.dto.js';
import { QueryRequerimientoDto } from './dto/query-requerimiento.dto.js';
import { ObservarRequerimientoDto } from './dto/revisar-requerimiento.dto.js';

const MAX_ARCHIVO_BYTES = 10 * 1024 * 1024;

@Controller('requerimientos')
@Roles(
  'supervisor', 'supervisor_civil', 'supervisor_electrico', 'pdr',
  'ing_civil', 'ing_electrico', 'jefe_sig',
  'logistica', 'gerencia', 'administrador',
)
export class RequerimientosController {
  constructor(private service: RequerimientosService) {}

  @Get()
  findAll(@Query() query: QueryRequerimientoDto, @Req() req: Request) {
    return this.service.findAll(query, req.user!.id, req.user!.role);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateRequerimientoDto, @Req() req: Request) {
    return this.service.create(dto, req.user!.id, req.user!.role);
  }

  @Post('archivos')
  @UseInterceptors(
    FileInterceptor('archivo', {
      limits: { fileSize: MAX_ARCHIVO_BYTES },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
          cb(new BadRequestException('Solo se permiten archivos PDF'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  subirArchivo(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Debes adjuntar un archivo PDF');
    return this.service.subirArchivo(file);
  }

  @Patch(':id')
  actualizar(@Param('id') id: string, @Body() dto: UpdateRequerimientoDto, @Req() req: Request) {
    return this.service.actualizar(id, dto, req.user!.id, req.user!.role);
  }

  @Post(':id/enviar')
  enviar(@Param('id') id: string, @Req() req: Request) {
    return this.service.enviar(id, req.user!.id, req.user!.role);
  }

  // Approver roles vary by tipo — the service validates the match
  @Post(':id/aprobar')
  @Roles('ing_civil', 'ing_electrico', 'jefe_sig', 'logistica', 'administrador')
  aprobar(@Param('id') id: string, @Req() req: Request) {
    return this.service.aprobar(id, req.user!.id, req.user!.role);
  }

  @Post(':id/observar')
  @Roles('ing_civil', 'ing_electrico', 'jefe_sig', 'logistica', 'administrador')
  observar(@Param('id') id: string, @Body() dto: ObservarRequerimientoDto, @Req() req: Request) {
    return this.service.observar(id, dto, req.user!.id, req.user!.role);
  }
}
