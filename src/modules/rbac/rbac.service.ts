import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Role } from '../../prisma/types.js';

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  async hasAnyPermission(role: Role, required: string[]) {
    if (role === 'admin_ti') return true;
    return (await this.prisma.rolePermission.count({
      where: { role, permission: { code: { in: required }, activo: true } },
    })) > 0;
  }

  list() {
    return this.prisma.permission.findMany({ orderBy: { code: 'asc' }, include: { roles: { select: { role: true } } } });
  }

  async setRoles(code: string, roles: Role[], description?: string) {
    return this.prisma.$transaction(async (tx) => {
      const permission = await tx.permission.upsert({ where: { code }, create: { code, description }, update: { description } });
      await tx.rolePermission.deleteMany({ where: { permissionId: permission.id } });
      if (roles.length) await tx.rolePermission.createMany({ data: roles.map((role) => ({ role, permissionId: permission.id })) });
      return tx.permission.findUniqueOrThrow({ where: { id: permission.id }, include: { roles: { select: { role: true } } } });
    });
  }
}
