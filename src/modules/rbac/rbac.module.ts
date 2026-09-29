import { Module } from '@nestjs/common';
import { RbacService } from './rbac.service.js';
import { RbacController } from './rbac.controller.js';

@Module({ controllers: [RbacController], providers: [RbacService], exports: [RbacService] })
export class RbacModule {}
