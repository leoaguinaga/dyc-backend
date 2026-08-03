import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateTurnoDto } from './dto/create-turno.dto.js';
import { RegistrarAsistenciaDto } from './dto/registrar-asistencia.dto.js';
import { OmitirFotoDto } from './dto/omitir-foto.dto.js';
import { CerrarTurnoDto } from './dto/cerrar-turno.dto.js';
import { ReabrirTurnoDto } from './dto/reabrir-turno.dto.js';
import type { EstadoAsistencia } from '../../prisma/types.js';
import { STORAGE_PROVIDER } from '../../shared/storage/storage.interface.js';
import type { StorageProvider } from '../../shared/storage/storage.interface.js';
import { hoyLima, soloFechaUTC } from '../../shared/date/fecha.util.js';

export const FOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

@Injectable()
export class AsistenciasService {
  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private storage: StorageProvider,
  ) {}

  findTurnos(proyectoId: string) {
    return this.prisma.turno.findMany({
      where: { proyectoId },
      orderBy: { fecha: 'desc' },
      include: {
        abiertoPor: { select: { id: true, name: true } },
        cerradoPor: { select: { id: true, name: true } },
        corregidoPor: { select: { id: true, name: true } },
      },
    });
  }

  async findTurnoDetalle(proyectoId: string, turnoId: string) {
    const turno = await this.prisma.turno.findFirst({
      where: { id: turnoId, proyectoId },
      include: {
        asistencias: true,
        turnoConfig: true,
        abiertoPor: { select: { id: true, name: true } },
        cerradoPor: { select: { id: true, name: true } },
        corregidoPor: { select: { id: true, name: true } },
      },
    });
    if (!turno) throw new NotFoundException(`Turno ${turnoId} no encontrado`);

    const asignados = await this.obrerosAsignados(
      proyectoId,
      turno.fecha,
      turno.turnoConfigId,
    );
    const asistenciaPorTrabajador = new Map(
      turno.asistencias.map((a) => [a.trabajadorId, a]),
    );

    return {
      ...turno,
      obreros: asignados.map((pt) => ({
        trabajadorId: pt.trabajadorId,
        nombre: pt.trabajador.nombre,
        dni: pt.trabajador.dni,
        cargo: pt.trabajador.cargo,
        asistencia: asistenciaPorTrabajador.get(pt.trabajadorId) ?? null,
      })),
    };
  }

  async abrirTurno(proyectoId: string, actorId: string, dto: CreateTurnoDto) {
    const turnoConfig = await this.prisma.turnoConfig.findFirst({
      where: { id: dto.turnoConfigId, proyectoId, activo: true },
    });
    if (!turnoConfig) {
      throw new BadRequestException(
        'El turno de horario indicado no existe o está inactivo para esta obra',
      );
    }

    const fecha = dto.fecha ? this.soloFecha(new Date(dto.fecha)) : this.hoy();

    const turnoExistente = await this.prisma.turno.findUnique({
      where: {
        proyectoId_fecha_turnoConfigId: {
          proyectoId,
          fecha,
          turnoConfigId: turnoConfig.id,
        },
      },
    });
    if (turnoExistente) {
      throw new BadRequestException(
        'Ya existe un turno abierto para esta obra, este turno de horario y esta fecha',
      );
    }

    return this.prisma.turno.create({
      data: {
        proyectoId,
        fecha,
        turnoConfigId: turnoConfig.id,
        horaAperturaReal: new Date(),
        abiertoPorId: actorId,
      },
    });
  }

  async subirFoto(
    proyectoId: string,
    turnoId: string,
    file: Express.Multer.File,
  ) {
    await this.turnoAbierto(proyectoId, turnoId);

    const { url } = await this.storage.save({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      folder: 'asistencias',
    });

    return this.prisma.turno.update({
      where: { id: turnoId },
      data: { fotoUrl: url, fotoOmitida: false, motivoFotoOmitida: null },
    });
  }

  async omitirFoto(proyectoId: string, turnoId: string, dto: OmitirFotoDto) {
    await this.turnoAbierto(proyectoId, turnoId);

    return this.prisma.turno.update({
      where: { id: turnoId },
      data: { fotoOmitida: true, motivoFotoOmitida: dto.motivo },
    });
  }

  async registrarAsistencias(
    proyectoId: string,
    turnoId: string,
    dto: RegistrarAsistenciaDto,
  ) {
    const turno = await this.turnoAbierto(proyectoId, turnoId);
    this.assertEvidenciaResuelta(turno);

    const asignados = await this.obrerosAsignados(
      proyectoId,
      turno.fecha,
      turno.turnoConfigId,
    );
    const trabajadorIdsValidos = new Set(
      asignados.map((pt) => pt.trabajadorId),
    );
    const invalidos = dto.asistencias
      .map((a) => a.trabajadorId)
      .filter((id) => !trabajadorIdsValidos.has(id));
    if (invalidos.length > 0) {
      throw new BadRequestException(
        `Trabajador(es) no asignado(s) a esta obra en la fecha del turno: ${invalidos.join(', ')}`,
      );
    }

    await this.prisma.$transaction(
      dto.asistencias.map((item) =>
        this.prisma.asistencia.upsert({
          where: {
            turnoId_trabajadorId: { turnoId, trabajadorId: item.trabajadorId },
          },
          create: {
            turnoId,
            trabajadorId: item.trabajadorId,
            estado: item.estado,
            horaLlegadaReal: item.horaLlegadaReal,
            justificada: item.justificada,
            justificacion: item.justificacion,
            salidaTempranaHora: item.salidaTempranaHora,
            salidaTempranaMotivo: item.salidaTempranaMotivo,
          },
          update: {
            estado: item.estado,
            horaLlegadaReal: item.horaLlegadaReal,
            justificada: item.justificada,
            justificacion: item.justificacion,
            salidaTempranaHora: item.salidaTempranaHora,
            salidaTempranaMotivo: item.salidaTempranaMotivo,
          },
        }),
      ),
    );

    return this.findTurnoDetalle(proyectoId, turnoId);
  }

  async previsualizarCierre(proyectoId: string, turnoId: string) {
    const turno = await this.turnoAbierto(proyectoId, turnoId);
    const { turnoConfig, asistencias } = await this.datosParaCalculo(
      proyectoId,
      turno,
    );

    const horaCierreReal = new Date();
    const calculos = asistencias.map((a) => ({
      trabajadorId: a.trabajadorId,
      nombre: a.trabajador.nombre,
      ...this.calcularHoras(
        a.estado,
        a.horaLlegadaReal,
        a.salidaTempranaHora,
        turno.fecha,
        horaCierreReal,
        turnoConfig,
      ),
    }));

    const afectados = calculos.filter((c) => c.horasExtra > 0);

    return {
      hayExcedente: afectados.length > 0,
      trabajadoresAfectados: afectados.map((a) => ({
        trabajadorId: a.trabajadorId,
        nombre: a.nombre,
        horasExtra: a.horasExtra,
      })),
      totalHorasExtra: afectados.reduce((s, a) => s + a.horasExtra, 0),
    };
  }

  async cerrarTurno(
    proyectoId: string,
    turnoId: string,
    actorId: string,
    dto: CerrarTurnoDto,
  ) {
    const turno = await this.turnoAbierto(proyectoId, turnoId);
    this.assertEvidenciaResuelta(turno);

    const { turnoConfig, asistencias } = await this.datosParaCalculo(
      proyectoId,
      turno,
    );

    const horaCierreReal = new Date();
    const calculos = asistencias.map((a) => ({
      asistenciaId: a.id,
      ...this.calcularHoras(
        a.estado,
        a.horaLlegadaReal,
        a.salidaTempranaHora,
        turno.fecha,
        horaCierreReal,
        turnoConfig,
      ),
    }));

    const hayExcedente = calculos.some((c) => c.horasExtra > 0);
    if (hayExcedente && dto.pagarExtra === undefined) {
      throw new BadRequestException(
        'Este turno tiene horas extra por encima de la tolerancia — confirma con GET .../cerrar-preview y reenvía el cierre indicando si se pagarán',
      );
    }

    await this.prisma.$transaction([
      ...calculos.map((c) =>
        this.prisma.asistencia.update({
          where: { id: c.asistenciaId },
          data: {
            horasNormales: c.horasNormales,
            horasExtra: c.horasExtra,
            pagarExtra: c.horasExtra > 0 ? (dto.pagarExtra ?? false) : false,
          },
        }),
      ),
      this.prisma.turno.update({
        where: { id: turnoId },
        data: { estado: 'cerrado', horaCierreReal, cerradoPorId: actorId },
      }),
    ]);

    return this.findTurnoDetalle(proyectoId, turnoId);
  }

  async reabrirTurno(
    proyectoId: string,
    turnoId: string,
    actorId: string,
    dto: ReabrirTurnoDto,
  ) {
    const turno = await this.prisma.turno.findFirst({
      where: { id: turnoId, proyectoId },
    });
    if (!turno) throw new NotFoundException(`Turno ${turnoId} no encontrado`);
    if (turno.estado !== 'cerrado') {
      throw new BadRequestException('El turno no está cerrado');
    }

    return this.prisma.turno.update({
      where: { id: turnoId },
      data: {
        estado: 'abierto',
        corregidoPorId: actorId,
        corregidoEn: new Date(),
        motivoCorreccion: dto.motivo,
      },
    });
  }

  private async datosParaCalculo(
    proyectoId: string,
    turno: { id: string; fecha: Date; turnoConfigId: string },
  ) {
    const turnoConfig = await this.prisma.turnoConfig.findUnique({
      where: { id: turno.turnoConfigId },
    });
    if (!turnoConfig) {
      throw new BadRequestException(
        'El turno no tiene un turno de horario configurado',
      );
    }

    const asignados = await this.obrerosAsignados(
      proyectoId,
      turno.fecha,
      turno.turnoConfigId,
    );
    const asistencias = await this.prisma.asistencia.findMany({
      where: { turnoId: turno.id },
      include: { trabajador: { select: { nombre: true } } },
    });
    const marcados = new Set(asistencias.map((a) => a.trabajadorId));
    const faltantes = asignados.filter((pt) => !marcados.has(pt.trabajadorId));
    if (faltantes.length > 0) {
      throw new BadRequestException(
        `Falta registrar la asistencia de: ${faltantes.map((pt) => pt.trabajador.nombre).join(', ')}`,
      );
    }

    return { turnoConfig, asistencias };
  }

  private assertEvidenciaResuelta(turno: {
    fotoUrl: string | null;
    fotoOmitida: boolean;
  }) {
    if (!turno.fotoUrl && !turno.fotoOmitida) {
      throw new BadRequestException(
        'Debes subir la foto de evidencia o justificar por qué se omite antes de continuar',
      );
    }
  }

  private async turnoAbierto(proyectoId: string, turnoId: string) {
    const turno = await this.prisma.turno.findFirst({
      where: { id: turnoId, proyectoId },
    });
    if (!turno) throw new NotFoundException(`Turno ${turnoId} no encontrado`);
    if (turno.estado !== 'abierto') {
      throw new BadRequestException('El turno ya está cerrado');
    }
    return turno;
  }

  private obrerosAsignados(
    proyectoId: string,
    fecha: Date,
    turnoConfigId: string,
  ) {
    return this.prisma.proyectoTrabajador.findMany({
      where: {
        proyectoId,
        turnoConfigId,
        fechaIngreso: { lte: fecha },
        OR: [{ fechaSalida: null }, { fechaSalida: { gte: fecha } }],
        // Asistencia es para obreros (mano de obra que cobra por hora),
        // no para supervisores/prevencionistas/back office — cargos según
        // el grupo "Obreros" de CARGOS en CreateTrabajadorForm.tsx.
        trabajador: { cargo: { in: ['Operario', 'Técnico'] } },
      },
      include: {
        trabajador: { select: { nombre: true, dni: true, cargo: true } },
      },
    });
  }

  private calcularHoras(
    estado: EstadoAsistencia,
    horaLlegadaReal: string | null,
    salidaTempranaHora: string | null,
    turnoFecha: Date,
    horaCierreReal: Date,
    turnoConfig: {
      horaInicio: string;
      horaFin: string;
      cruzaMedianoche: boolean;
      toleranciaSalidaMinutos: number;
    },
  ): { horasNormales: number; horasExtra: number } {
    if (estado === 'falta') {
      return { horasNormales: 0, horasExtra: 0 };
    }

    const { horaInicio, horaFin, cruzaMedianoche, toleranciaSalidaMinutos } =
      turnoConfig;

    const inicioJornada = this.combinarFechaHora(turnoFecha, horaInicio, false);
    const finJornada = this.combinarFechaHora(
      turnoFecha,
      horaFin,
      cruzaMedianoche,
    );
    const duracionJornada = this.diffHoras(inicioJornada, finJornada);

    const entradaEfectiva =
      estado === 'tardio' && horaLlegadaReal
        ? this.combinarFechaHora(
            turnoFecha,
            horaLlegadaReal,
            this.esDiaSiguiente(horaLlegadaReal, horaInicio, cruzaMedianoche),
          )
        : inicioJornada;

    if (salidaTempranaHora) {
      const salidaEfectiva = this.combinarFechaHora(
        turnoFecha,
        salidaTempranaHora,
        this.esDiaSiguiente(salidaTempranaHora, horaInicio, cruzaMedianoche),
      );
      const horasNormales = Math.min(
        duracionJornada,
        this.diffHoras(entradaEfectiva, salidaEfectiva),
      );
      return { horasNormales, horasExtra: 0 };
    }

    const horasNormalesBase = Math.min(
      duracionJornada,
      this.diffHoras(entradaEfectiva, finJornada),
    );

    const excedente = this.diffHoras(finJornada, horaCierreReal);
    const dentroDeTolerancia = excedente * 60 <= toleranciaSalidaMinutos;

    return dentroDeTolerancia
      ? { horasNormales: horasNormalesBase + excedente, horasExtra: 0 }
      : { horasNormales: horasNormalesBase, horasExtra: excedente };
  }

  // Turnos que cruzan medianoche (ej. noche 22:00–06:00): una hora "HH:mm" menor
  // que horaInicio cae en el día calendario siguiente al de turnoFecha.
  private esDiaSiguiente(
    hhmm: string,
    horaInicio: string,
    cruzaMedianoche: boolean,
  ): boolean {
    return cruzaMedianoche && hhmm < horaInicio;
  }

  private combinarFechaHora(
    fecha: Date,
    hhmm: string,
    diaSiguiente: boolean,
  ): Date {
    const [horas, minutos] = hhmm.split(':').map(Number);
    const d = new Date(fecha);
    if (diaSiguiente) d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(horas, minutos, 0, 0);
    return d;
  }

  private diffHoras(desde: Date, hasta: Date): number {
    return Math.max(0, (hasta.getTime() - desde.getTime()) / 3_600_000);
  }

  private hoy(): Date {
    return hoyLima();
  }

  private soloFecha(d: Date): Date {
    return soloFechaUTC(d);
  }
}
