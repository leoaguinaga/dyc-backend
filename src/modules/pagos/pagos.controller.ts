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
import type { AuthenticatedUser } from '../../shared/guards/auth.guard.js';
import { PagosService } from './pagos.service.js';
import { renderReportePagosPng } from './pagos-reporte.render.js';
import {
  CreatePagoDto,
  CreateRecordatorioPagoDto,
  CreatePagoRecurrenteDto,
  UpdatePagoRecurrenteDto,
  CreatePlanillaStaffDto,
  MarcarPagadoDto,
  QueryPagosDto,
  ReportePagosDto,
  SubirComprobantePagoDto,
  UpdatePagoDto,
} from './dto/create-pago.dto.js';

type AuthRequest = Request & { user: AuthenticatedUser };
const ROLES_OPERATIVOS = [
  'supervisor',
  'supervisor_civil',
  'supervisor_electrico',
  'pdr',
  'ing_civil',
  'ing_electrico',
  'jefe_sig',
  'logistica',
  'gerencia',
  'administrador',
] as const;

const MAX_ARCHIVO_BYTES = 10 * 1024 * 1024;
const ARCHIVOS_PERMITIDOS = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

@Controller('pagos')
@Roles(...ROLES_OPERATIVOS)
export class PagosController {
  constructor(private service: PagosService) {}

  @Get()
  findAll(@Query() query: QueryPagosDto, @Req() req: AuthRequest) {
    return this.service.findAll(query, req.user);
  }

  @Get('resumen')
  @Roles('gerencia', 'administrador')
  resumen() {
    return this.service.resumen();
  }

  @Get('reporte')
  @Roles('administrador', 'gerencia', 'admin_ti')
  async reporte(@Query() query: ReportePagosDto) {
    return this.service.datosReporte(query);
  }

  @Get('reporte.png')
  @Roles('administrador', 'gerencia', 'admin_ti')
  async reportePng(@Query() query: ReportePagosDto, @Res() res: Response) {
    const data = await this.service.datosReporte(query);
    const png = await renderReportePagosPng({
      ...data,
      generadoEn: new Date(),
    });
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
  findOne(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.service.findOneVisible(id, req.user);
  }

  @Post()
  create(@Body() dto: CreatePagoDto, @Req() req: AuthRequest) {
    return this.service.create(dto, req.user!.id);
  }

  @Post('recordatorios')
  @Roles(
    'supervisor_civil',
    'supervisor_electrico',
    'pdr',
    'ing_civil',
    'ing_electrico',
    'jefe_sig',
    'logistica',
    'gerencia',
    'administrador',
  )
  crearRecordatorio(
    @Body() dto: CreateRecordatorioPagoDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.createRecordatorio(dto, req.user);
  }

  @Get('recurrentes/lista')
  @Roles('administrador', 'gerencia')
  listarRecurrentes() {
    return this.service.listarRecurrentes();
  }

  @Post('recurrentes')
  @Roles('administrador')
  crearRecurrente(
    @Body() dto: CreatePagoRecurrenteDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.crearRecurrente(dto, req.user.id);
  }

  @Patch('recurrentes/:id')
  @Roles('administrador')
  actualizarRecurrente(
    @Param('id') id: string,
    @Body() dto: UpdatePagoRecurrenteDto,
  ) {
    return this.service.actualizarRecurrente(id, dto);
  }

  @Delete('recurrentes/:id')
  @Roles('administrador')
  eliminarRecurrente(@Param('id') id: string) {
    return this.service.eliminarRecurrente(id);
  }

  @Post('recurrentes/generar')
  @Roles('administrador')
  generarRecurrentes() {
    return this.service.generarRecurrentes();
  }

  @Get('planilla-staff')
  @Roles('administrador', 'gerencia')
  listarPlanillaStaff() {
    return this.service.listarPlanillaStaff();
  }

  @Post('planilla-staff')
  @Roles('administrador')
  generarPlanillaStaff(
    @Body() dto: CreatePlanillaStaffDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.generarPlanillaStaff(dto.periodo, req.user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePagoDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.update(id, dto, req.user);
  }

  @Post(':id/marcar-pagado')
  @Roles('administrador', 'gerencia', 'admin_ti')
  marcarPagado(
    @Param('id') id: string,
    @Body() dto: MarcarPagadoDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.marcarPagado(id, dto, req.user!.id);
  }

  @Post(':id/cancelar')
  cancelar(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.service.cancelar(id, req.user);
  }

  @Post('comprobantes')
  @UseInterceptors(
    FileInterceptor('comprobante', {
      limits: { fileSize: MAX_ARCHIVO_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!ARCHIVOS_PERMITIDOS.includes(file.mimetype)) {
          cb(
            new BadRequestException(
              'Formato no permitido (usa JPG, PNG, WEBP o PDF)',
            ),
            false,
          );
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
  guardarComprobante(
    @Param('id') id: string,
    @Body() dto: SubirComprobantePagoDto,
  ) {
    return this.service.guardarComprobante(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
