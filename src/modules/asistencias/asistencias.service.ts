import {
  BadRequestException,
  ConflictException,
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
import { EditarHorarioTurnoDto } from './dto/editar-horario-turno.dto.js';
import { RevisarCierreDto } from './dto/revisar-cierre.dto.js';
import { RegistrarDesdeHojaDto } from './dto/registrar-desde-hoja.dto.js';
import type { EstadoAsistencia, Role } from '../../prisma/types.js';
import { STORAGE_PROVIDER } from '../../shared/storage/storage.interface.js';
import type { StorageProvider } from '../../shared/storage/storage.interface.js';
import { hoyLima, soloFechaUTC } from '../../shared/date/fecha.util.js';

export const FOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Lima es UTC-5 todo el año (sin horario de verano). Las horas "HH:mm" del turno y
// de los obreros se guardan como reloj de Lima pero se combinan con la fecha en UTC,
// así que un instante real (Date) debe llevarse a ese mismo marco antes de compararlo.
const LIMA_OFFSET_HORAS = 5;

// Tope de gracia después de la hora fin del horario: pasado este margen el sistema
// cierra la jornada por su cuenta (7 pm de fin → 11 pm de cierre).
export const TOPE_CIERRE_AUTOMATICO_HORAS = 4;

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
        turnoConfig: { select: { nombre: true } },
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

  async abrirTurno(
    proyectoId: string,
    actorId: string,
    actorRole: Role,
    dto: CreateTurnoDto,
  ) {
    const turnoConfig = await this.prisma.turnoConfig.findFirst({
      where: { id: dto.turnoConfigId, proyectoId, activo: true },
    });
    if (!turnoConfig) {
      throw new BadRequestException(
        'El turno de horario indicado no existe o está inactivo para esta obra',
      );
    }

    const fecha = dto.fecha ? this.soloFecha(new Date(dto.fecha)) : this.hoy();
    const esFechaPasada = fecha.getTime() !== this.hoy().getTime();

    if (esFechaPasada) {
      if (
        actorRole !== 'administrador' &&
        actorRole !== 'gerencia' &&
        actorRole !== 'admin_ti'
      ) {
        throw new BadRequestException(
          'Solo administración o gerencia pueden registrar asistencia de una fecha distinta a hoy',
        );
      }
      if (!dto.motivo) {
        throw new BadRequestException(
          'Debes indicar un motivo para registrar asistencia de una fecha distinta a hoy',
        );
      }
    }

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
        ...(esFechaPasada
          ? {
              corregidoPorId: actorId,
              corregidoEn: new Date(),
              motivoCorreccion: dto.motivo,
            }
          : {}),
      },
    });
  }

  async subirFoto(
    proyectoId: string,
    turnoId: string,
    file: Express.Multer.File,
  ) {
    // La foto es evidencia: también se puede adjuntar a una jornada ya cerrada
    // (por ejemplo la hoja firmada que llega a oficina después).
    const existe = await this.prisma.turno.findFirst({
      where: { id: turnoId, proyectoId },
      select: { id: true },
    });
    if (!existe) throw new NotFoundException(`Turno ${turnoId} no encontrado`);

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
            horaSalidaReal: item.horaSalidaReal,
            justificada: item.justificada,
            justificacion: item.justificacion,
            salidaTempranaHora: item.salidaTempranaHora,
            salidaTempranaMotivo: item.salidaTempranaMotivo,
          },
          update: {
            estado: item.estado,
            horaLlegadaReal: item.horaLlegadaReal,
            horaSalidaReal: item.horaSalidaReal,
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

    // Una reapertura es una corrección del turno original, no un nuevo turno.
    // Conservamos la hora de cierre que originó el cálculo para que editar una
    // llegada/salida no cambie las horas solo por el tiempo transcurrido.
    const horaCierreReal = turno.horaCierreReal ?? new Date();
    const calculos = asistencias.map((a) => ({
      trabajadorId: a.trabajadorId,
      nombre: a.trabajador.nombre,
      ...this.calcularHoras(
        a.estado,
        a.horaLlegadaReal,
        a.horaSalidaReal ?? a.salidaTempranaHora,
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

    // En una reapertura se corrige el turno original: no se debe desplazar
    // el cierre a la hora actual solo porque se volvió a guardar.
    const horaCierreReal = turno.horaCierreReal ?? new Date();
    const calculos = asistencias.map((a) => ({
      asistenciaId: a.id,
      ...this.calcularHoras(
        a.estado,
        a.horaLlegadaReal,
        a.horaSalidaReal ?? a.salidaTempranaHora,
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
        data: {
          estado: 'cerrado',
          horaCierreReal,
          cerradoPorId: actorId,
          // Un cierre hecho por una persona reemplaza cualquier cierre automático previo.
          cierreAutomatico: false,
          cierreRevisadoEn: null,
          cierreRevisadoPorId: null,
        },
      }),
    ]);

    return this.findTurnoDetalle(proyectoId, turnoId);
  }

  /**
   * Instante real en que vence el plazo para cerrar la jornada: hora fin del
   * horario (en el día siguiente si cruza medianoche) más el tope de gracia.
   */
  limiteCierreAutomatico(
    fecha: Date,
    turnoConfig: { horaFin: string; cruzaMedianoche: boolean },
  ): Date {
    const finJornada = this.combinarFechaHora(
      fecha,
      turnoConfig.horaFin,
      turnoConfig.cruzaMedianoche,
    );
    return new Date(
      finJornada.getTime() +
        (TOPE_CIERRE_AUTOMATICO_HORAS + LIMA_OFFSET_HORAS) * 3_600_000,
    );
  }

  /**
   * Cierra una jornada abierta cuyo plazo venció. Calcula las horas de quien no
   * marcó salida hasta el límite (por eso pueden aparecer horas extra), deja
   * `pagarExtra` en falso y marca la jornada para revisión. No exige foto ni que
   * todos los obreros asignados tengan registro: quien no tiene registro no suma
   * horas y el revisor lo ve en el detalle.
   */
  async cerrarAutomaticamente(turnoId: string) {
    const turno = await this.prisma.turno.findUnique({
      where: { id: turnoId },
      include: { turnoConfig: true, asistencias: true },
    });
    if (!turno || turno.estado !== 'abierto') return null;

    const limite = this.limiteCierreAutomatico(turno.fecha, turno.turnoConfig);
    if (Date.now() < limite.getTime()) return null;

    const calculos = turno.asistencias.map((a) => ({
      asistenciaId: a.id,
      ...this.calcularHoras(
        a.estado,
        a.horaLlegadaReal,
        a.horaSalidaReal ?? a.salidaTempranaHora,
        turno.fecha,
        limite,
        turno.turnoConfig,
      ),
    }));

    await this.prisma.$transaction([
      ...calculos.map((c) =>
        this.prisma.asistencia.update({
          where: { id: c.asistenciaId },
          data: {
            horasNormales: c.horasNormales,
            horasExtra: c.horasExtra,
            pagarExtra: false,
          },
        }),
      ),
      this.prisma.turno.update({
        where: { id: turno.id },
        data: {
          estado: 'cerrado',
          horaCierreReal: limite,
          cerradoPorId: null,
          cierreAutomatico: true,
          cierreRevisadoEn: null,
          cierreRevisadoPorId: null,
        },
      }),
    ]);

    return {
      turnoId: turno.id,
      proyectoId: turno.proyectoId,
      fecha: turno.fecha,
      conHorasExtra: calculos.some((c) => c.horasExtra > 0),
    };
  }

  /** Obreros asignados a la obra en una fecha y horario: la base para cargar una hoja física. */
  async obrerosParaHoja(
    proyectoId: string,
    fecha: string,
    turnoConfigId: string,
  ) {
    const asignados = await this.obrerosAsignados(
      proyectoId,
      soloFechaUTC(new Date(fecha)),
      turnoConfigId,
    );
    return asignados
      .map((pt) => ({
        trabajadorId: pt.trabajadorId,
        nombre: pt.trabajador.nombre,
        dni: pt.trabajador.dni,
        cargo: pt.trabajador.cargo,
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  /**
   * Oficina carga la jornada desde la hoja física firmada: crea el turno ya
   * cerrado, con la hora de ingreso y salida de cada obrero. La foto de la hoja
   * es opcional y se adjunta aparte; si no se adjunta queda constancia.
   */
  async registrarDesdeHoja(
    proyectoId: string,
    actorId: string,
    dto: RegistrarDesdeHojaDto,
  ) {
    const turnoConfig = await this.prisma.turnoConfig.findFirst({
      where: { id: dto.turnoConfigId, proyectoId, activo: true },
    });
    if (!turnoConfig) {
      throw new BadRequestException(
        'El horario indicado no existe o está inactivo para esta obra',
      );
    }

    const fecha = soloFechaUTC(new Date(dto.fecha));
    if (fecha.getTime() > this.hoy().getTime()) {
      throw new BadRequestException(
        'No se puede registrar una hoja con fecha futura',
      );
    }

    const existente = await this.prisma.turno.findUnique({
      where: {
        proyectoId_fecha_turnoConfigId: {
          proyectoId,
          fecha,
          turnoConfigId: dto.turnoConfigId,
        },
      },
      select: { id: true },
    });
    if (existente) {
      throw new ConflictException({
        message:
          'Ya existe una jornada de esta obra, fecha y horario. Corrígela desde su detalle.',
        turnoId: existente.id,
      });
    }

    const asignados = await this.obrerosAsignados(
      proyectoId,
      fecha,
      dto.turnoConfigId,
    );
    const validos = new Set(asignados.map((pt) => pt.trabajadorId));
    const invalidos = dto.obreros.filter((o) => !validos.has(o.trabajadorId));
    if (invalidos.length > 0) {
      throw new BadRequestException(
        'Hay obreros que no están asignados a esta obra en esa fecha y horario. Asígnalos primero.',
      );
    }
    const repetidos = new Set(dto.obreros.map((o) => o.trabajadorId));
    if (repetidos.size !== dto.obreros.length) {
      throw new BadRequestException('Hay un obrero repetido en la hoja');
    }

    const { horaInicio, cruzaMedianoche, toleranciaMinutos } = turnoConfig;
    const minutos = (hhmm: string) => {
      const [h, m] = hhmm.split(':').map(Number);
      return h * 60 + m;
    };
    const pagarExtra = dto.pagarExtra ?? false;

    const filas = dto.obreros.map((o) => {
      // Un ingreso "antes" de la hora de inicio en un turno de noche cae después de medianoche.
      const llegada =
        cruzaMedianoche && o.horaLlegadaReal < horaInicio
          ? minutos(o.horaLlegadaReal) + 24 * 60
          : minutos(o.horaLlegadaReal);
      const estado: EstadoAsistencia =
        llegada > minutos(horaInicio) + toleranciaMinutos
          ? 'tardio'
          : 'presente';
      const horas = this.calcularHoras(
        estado,
        o.horaLlegadaReal,
        o.horaSalidaReal,
        fecha,
        new Date(),
        turnoConfig,
      );
      return {
        trabajadorId: o.trabajadorId,
        estado,
        horaLlegadaReal: o.horaLlegadaReal,
        horaSalidaReal: o.horaSalidaReal,
        horasNormales: horas.horasNormales,
        horasExtra: horas.horasExtra,
        pagarExtra: horas.horasExtra > 0 ? pagarExtra : false,
      };
    });

    const aInstante = (hhmm: string, diaSiguiente: boolean) =>
      new Date(
        this.combinarFechaHora(fecha, hhmm, diaSiguiente).getTime() +
          LIMA_OFFSET_HORAS * 3_600_000,
      );

    const turno = await this.prisma.turno.create({
      data: {
        proyectoId,
        fecha,
        turnoConfigId: dto.turnoConfigId,
        estado: 'cerrado',
        origen: 'hoja',
        horaAperturaReal: aInstante(turnoConfig.horaInicio, false),
        horaCierreReal: aInstante(turnoConfig.horaFin, cruzaMedianoche),
        fotoOmitida: true,
        motivoFotoOmitida: 'Registrado desde la hoja física, sin foto adjunta',
        abiertoPorId: actorId,
        cerradoPorId: actorId,
        asistencias: { create: filas },
      },
      select: { id: true },
    });

    return { turnoId: turno.id };
  }

  /** Resuelve una jornada cerrada automáticamente: decide si se pagan las horas extra. */
  async revisarCierre(
    proyectoId: string,
    turnoId: string,
    actorId: string,
    dto: RevisarCierreDto,
  ) {
    const turno = await this.prisma.turno.findFirst({
      where: { id: turnoId, proyectoId },
    });
    if (!turno) throw new NotFoundException(`Turno ${turnoId} no encontrado`);
    if (turno.estado !== 'cerrado' || !turno.cierreAutomatico) {
      throw new BadRequestException('Esta jornada no se cerró automáticamente');
    }
    if (turno.cierreRevisadoEn) {
      throw new BadRequestException('Este cierre ya fue revisado');
    }

    await this.prisma.$transaction([
      this.prisma.asistencia.updateMany({
        where: { turnoId, horasExtra: { gt: 0 } },
        data: { pagarExtra: dto.pagarExtra },
      }),
      this.prisma.turno.update({
        where: { id: turnoId },
        data: { cierreRevisadoEn: new Date(), cierreRevisadoPorId: actorId },
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

  async editarHorario(
    proyectoId: string,
    turnoId: string,
    dto: EditarHorarioTurnoDto,
  ) {
    const turno = await this.prisma.turno.findFirst({
      where: { id: turnoId, proyectoId },
    });
    if (!turno) throw new NotFoundException(`Turno ${turnoId} no encontrado`);
    if (turno.estado !== 'abierto') {
      throw new BadRequestException('Solo se puede editar una jornada abierta');
    }
    const fecha = new Date(dto.fecha);
    const apertura = new Date(dto.horaAperturaReal);
    const cierre = new Date(dto.horaCierreReal);
    if (cierre <= apertura) {
      throw new BadRequestException('La hora de cierre debe ser posterior a la apertura');
    }
    return this.prisma.turno.update({
      where: { id: turnoId },
      data: { fecha, horaAperturaReal: apertura, horaCierreReal: cierre },
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
      const horasHastaSalida = this.diffHoras(entradaEfectiva, salidaEfectiva);
      const horasNormales = Math.min(duracionJornada, horasHastaSalida);
      const excedente = this.diffHoras(finJornada, salidaEfectiva);
      return {
        horasNormales,
        horasExtra: excedente > toleranciaSalidaMinutos / 60 ? excedente : 0,
      };
    }

    const horasNormalesBase = Math.min(
      duracionJornada,
      this.diffHoras(entradaEfectiva, finJornada),
    );

    const cierreEnRelojLima = new Date(
      horaCierreReal.getTime() - LIMA_OFFSET_HORAS * 3_600_000,
    );
    const excedente = this.diffHoras(finJornada, cierreEnRelojLima);
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
