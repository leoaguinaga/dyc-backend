import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { AsistenciasService } from './asistencias.service.js';

/**
 * Cierra las jornadas que nadie cerró. Corre cada hora (no a una hora fija de
 * medianoche) porque el plazo depende del horario de cada obra: un turno de
 * noche termina de madrugada. La primera corrida tras desplegar también cierra
 * las jornadas atrasadas que ya vencieron.
 */
@Injectable()
export class CierreAutomaticoService {
  private readonly logger = new Logger('CierreAutomatico');
  private corriendo = false;

  constructor(
    private prisma: PrismaService,
    private asistencias: AsistenciasService,
    private notificaciones: NotificacionesService,
  ) {}

  @Cron('10 * * * *', { timeZone: 'America/Lima' })
  async ejecutar() {
    if (this.corriendo) return;
    this.corriendo = true;
    try {
      const abiertos = await this.prisma.turno.findMany({
        where: { estado: 'abierto' },
        select: { id: true },
      });

      for (const { id } of abiertos) {
        try {
          const cerrado = await this.asistencias.cerrarAutomaticamente(id);
          if (cerrado) await this.avisar(cerrado);
        } catch (err) {
          this.logger.error(`No se pudo cerrar el turno ${id}: ${String(err)}`);
        }
      }
    } finally {
      this.corriendo = false;
    }
  }

  private async avisar(cerrado: {
    turnoId: string;
    proyectoId: string;
    fecha: Date;
    conHorasExtra: boolean;
  }) {
    const proyecto = await this.prisma.proyecto.findUnique({
      where: { id: cerrado.proyectoId },
      select: { nombre: true, prevencionista: { select: { userId: true } } },
    });
    if (!proyecto) return;

    const [y, m, d] = cerrado.fecha.toISOString().slice(0, 10).split('-');
    const input = {
      tipo: 'asistencia_cierre_automatico' as const,
      titulo: 'Jornada cerrada automáticamente',
      mensaje: `La jornada del ${d}/${m}/${y} de ${proyecto.nombre} no se cerró a tiempo y la cerró el sistema. ${
        cerrado.conHorasExtra
          ? 'Revisa si se consideran las horas extra.'
          : 'Revisa que los registros sean correctos.'
      }`,
      entidadTipo: 'Turno',
      entidadId: cerrado.turnoId,
    };

    // Solo en la aplicación: esta corrida puede cerrar varias jornadas atrasadas a la vez.
    const opciones = { enviarEmail: false };
    await this.notificaciones.crearParaRoles(
      ['administrador', 'gerencia', 'jefe_sig', 'admin_ti'],
      input,
      opciones,
    );
    const prevencionistaUserId = proyecto.prevencionista?.userId;
    if (prevencionistaUserId) {
      await this.notificaciones.crearParaUsuarios(
        [prevencionistaUserId],
        input,
        opciones,
      );
    }
  }
}
