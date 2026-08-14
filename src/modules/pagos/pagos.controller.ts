import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { PagosService } from './pagos.service.js';
import { renderReportePagosPng } from './pagos-reporte.render.js';
import {
  CreatePagoDto,
  MarcarPagadoDto,
  QueryPagosDto,
  ReportePagosDto,
  SubirComprobantePagoDto,
  UpdatePagoDto,
} from './dto/create-pago.dto.js';

const MAX_ARCHIVO_BYTES = 10 * 1024 * 1024;
const ARCHIVOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

@Controller('pagos')
@Roles('logistica', 'gerencia', 'administrador')
export class PagosController {
  constructor(private service: PagosService) {}

  @Get()
  @Roles('gerencia', 'administrador')
  findAll(@Query() query: QueryPagosDto) {
    return this.service.findAll(query);
  }

  @Get('resumen')
  @Roles('gerencia', 'administrador')
  resumen() {
    return this.service.resumen();
  }

  @Get('reporte')
  async reporte(@Query() query: ReportePagosDto) {
    return this.service.datosReporte(query);
  }

  @Get('reporte.png')
  async reportePng(@Query() query: ReportePagosDto, @Res() res: Response) {
    const data = await this.service.datosReporte(query);
    const png = await renderReportePagosPng({ ...data, generadoEn: new Date() });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="pagos-${data.tipo}-${data.fecha}.png"`,
    );
    res.send(png);
  }

  @Get('orden/:ordenCompraId')
  findByOrden(@Param('ordenCompraId') ordenCompraId: string) {
    return this.service.findByOrden(ordenCompraId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreatePagoDto, @Req() req: Request) {
    return this.service.create(dto, req.user!.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePagoDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/marcar-pagado')
  marcarPagado(@Param('id') id: string, @Body() dto: MarcarPagadoDto, @Req() req: Request) {
    return this.service.marcarPagado(id, dto, req.user!.id);
  }

  @Post(':id/cancelar')
  cancelar(@Param('id') id: string) {
    return this.service.cancelar(id);
  }

  @Post('comprobantes')
  @UseInterceptors(
    FileInterceptor('comprobante', {
      limits: { fileSize: MAX_ARCHIVO_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!ARCHIVOS_PERMITIDOS.includes(file.mimetype)) {
          cb(new BadRequestException('Formato no permitido (usa JPG, PNG, WEBP o PDF)'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  subirComprobante(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Debes adjuntar un archivo');
    return this.service.subirComprobante(file);
  }

  @Post(':id/comprobante')
  guardarComprobante(@Param('id') id: string, @Body() dto: SubirComprobantePagoDto) {
    return this.service.guardarComprobante(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
