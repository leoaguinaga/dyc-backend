import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { ClientesService } from './clientes.service.js';
import { CreateClienteDto } from './dto/create-cliente.dto.js';
import { UpdateClienteDto } from './dto/update-cliente.dto.js';
import { CreateContactoDto } from './dto/create-contacto.dto.js';
import { UpdateContactoDto } from './dto/update-contacto.dto.js';

@Controller('clientes')
@Roles('administrador', 'logistica', 'gerencia')
export class ClientesController {
  constructor(private clientesService: ClientesService) {}

  @Get()
  findAll() {
    return this.clientesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.clientesService.findOne(id);
  }

  @Post()
  @Roles('administrador', 'logistica')
  create(@Body() dto: CreateClienteDto) {
    return this.clientesService.create(dto);
  }

  @Patch(':id')
  @Roles('administrador', 'logistica')
  update(@Param('id') id: string, @Body() dto: UpdateClienteDto) {
    return this.clientesService.update(id, dto);
  }

  // --- Contactos ---

  @Get(':id/contactos')
  findContactos(@Param('id') id: string) {
    return this.clientesService.findContactos(id);
  }

  @Post(':id/contactos')
  @Roles('administrador', 'logistica')
  createContacto(@Param('id') id: string, @Body() dto: CreateContactoDto) {
    return this.clientesService.createContacto(id, dto);
  }

  @Patch(':id/contactos/:contactoId')
  @Roles('administrador', 'logistica')
  updateContacto(
    @Param('id') id: string,
    @Param('contactoId') contactoId: string,
    @Body() dto: UpdateContactoDto,
  ) {
    return this.clientesService.updateContacto(id, contactoId, dto);
  }
}
