/**
 * Seed de desarrollo — DyC ERP
 * Crea usuarios, clientes, proyectos, trabajadores, proveedores,
 * almacenes fijos, ítems de inventario y activos de ejemplo.
 */
import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../prisma/generated/prisma/client.js';

if (!process.env.DATABASE_URL) {
  console.error('❌  DATABASE_URL no definida en .env');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: { enabled: true },
});

// ── Helpers ────────────────────────────────────────────────────────────────

async function crearUsuario(
  email: string,
  password: string,
  name: string,
  role: 'administrador' | 'gerencia' | 'logistica' | 'supervisor',
) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({ where: { email }, data: { role } });
    return existing;
  }
  const result = await auth.api.signUpEmail({ body: { email, password, name } });
  if (!result?.user) throw new Error(`No se pudo crear usuario ${email}`);
  return prisma.user.update({ where: { id: result.user.id }, data: { role } });
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱  Iniciando seed…\n');

  // ── 1. Usuarios ──────────────────────────────────────────────────────────
  console.log('👤  Creando usuarios…');
  const uAdmin = await crearUsuario('admin@dyc.cl',      'Admin1234!',    'Administrador DyC',   'administrador');
  const uGer   = await crearUsuario('gerencia@dyc.cl',   'Admin1234!',    'Carlos Díaz Gerente', 'gerencia');
  const uLog   = await crearUsuario('logistica@dyc.cl',  'Admin1234!',    'María García',        'logistica');
  const uSup   = await crearUsuario('supervisor@dyc.cl', 'Admin1234!',    'Roberto Castillo',    'supervisor');
  console.log('   ✔  admin · gerencia · logistica · supervisor\n');

  // ── 2. Clientes ──────────────────────────────────────────────────────────
  console.log('🏢  Creando clientes…');
  const cMinera = await prisma.cliente.create({
    data: {
      razonSocial:     'Minera Andina S.A.C.',
      nombreComercial: 'Minera Andina',
      ruc:             '20123456789',
      direccion:       'Av. Minería 450, Chiclayo',
      contactos: {
        create: [
          { nombre: 'Ing. Jorge Quispe',    cargo: 'Jefe de Proyectos',   email: 'j.quispe@mineraandina.com', telefono: '+51 987 001 001' },
          { nombre: 'Srta. Patricia Vega',  cargo: 'Supervisora de Obra', email: 'p.vega@mineraandina.com',   telefono: '+51 987 001 002' },
        ],
      },
    },
    include: { contactos: true },
  });

  const cMuni = await prisma.cliente.create({
    data: {
      razonSocial:     'Municipalidad Provincial de Chiclayo',
      nombreComercial: 'Muni Chiclayo',
      ruc:             '20789456123',
      direccion:       'Plaza de Armas s/n, Chiclayo',
      contactos: {
        create: [
          { nombre: 'Arq. Rosa Limo', cargo: 'Gerente de Obras', email: 'r.limo@munichiclayo.gob.pe', telefono: '+51 987 002 001' },
        ],
      },
    },
    include: { contactos: true },
  });

  const cConst = await prisma.cliente.create({
    data: {
      razonSocial:     'Constructora Pacífico E.I.R.L.',
      nombreComercial: 'Pacífico',
      ruc:             '20567891234',
      direccion:       'Jr. Industrial 1200, Lima',
      contactos: {
        create: [
          { nombre: 'Ing. Andrés Torres', cargo: 'Director Técnico', email: 'a.torres@cpacific.pe', telefono: '+51 987 003 001' },
        ],
      },
    },
    include: { contactos: true },
  });
  console.log(`   ✔  ${cMinera.razonSocial} · ${cMuni.razonSocial} · ${cConst.razonSocial}\n`);

  // ── 3. Trabajadores ──────────────────────────────────────────────────────
  console.log('👷  Creando trabajadores…');
  const tCarlos = await prisma.trabajador.create({
    data: { nombre: 'Carlos Mendoza Ríos',    dni: '45123456', cargo: 'Supervisor Civil',         telefono: '+51 987 101 001', email: 'c.mendoza@dyc.cl',  activo: true, userId: uSup.id },
  });
  const tMaria = await prisma.trabajador.create({
    data: { nombre: 'María García López',     dni: '47234567', cargo: 'Asistente Administración', telefono: '+51 987 101 002', email: 'm.garcia@dyc.cl',   activo: true, userId: uLog.id },
  });
  const tRoberto = await prisma.trabajador.create({
    data: { nombre: 'Roberto Sánchez Díaz',   dni: '43345678', cargo: 'Ingeniero Civil',          telefono: '+51 987 101 003', email: 'r.sanchez@dyc.cl',  activo: true },
  });
  const tAna = await prisma.trabajador.create({
    data: { nombre: 'Ana Torres Vega',        dni: '48456789', cargo: 'Prevencionista de riesgo', telefono: '+51 987 101 004', email: 'a.torres@dyc.cl',   activo: true },
  });
  const tLuis = await prisma.trabajador.create({
    data: { nombre: 'Luis Ramírez Castro',    dni: '41567890', cargo: 'Operario',                 telefono: '+51 987 101 005', activo: true },
  });
  const tJuan = await prisma.trabajador.create({
    data: { nombre: 'Juan Flores Huamán',     dni: '44678901', cargo: 'Residente de obra',        telefono: '+51 987 101 006', email: 'j.flores@dyc.cl',   activo: true },
  });
  const tSofia = await prisma.trabajador.create({
    data: { nombre: 'Sofía Paredes Núñez',    dni: '46789012', cargo: 'Ingeniero Eléctrico',      telefono: '+51 987 101 007', email: 's.paredes@dyc.cl',  activo: true },
  });
  console.log('   ✔  7 trabajadores\n');

  // ── 4. Proveedores ───────────────────────────────────────────────────────
  console.log('🚚  Creando proveedores…');
  await prisma.proveedor.create({
    data: {
      razonSocial: 'Electro Norte SAC', ruc: '20401234567', direccion: 'Av. Eléctrica 234, Chiclayo',
      banco: 'BCP', numeroCuenta: '193-1234567-0-89', moneda: 'SOLES',
      condicionPago: '50% adelanto, 50% contra entrega',
      contactos: { create: [
        { nombre: 'Ing. Luis Peña',    cargo: 'Ejecutivo de Ventas', email: 'ventas@electronorte.com',  telefono: '+51 74 567890', esPrincipal: true },
        { nombre: 'Sra. Carla Ruiz',   cargo: 'Jefa de Despacho',    email: 'despacho@electronorte.com', telefono: '+51 74 567891' },
      ]},
    },
  });
  await prisma.proveedor.create({
    data: {
      razonSocial: 'Ferretería Los Andes SRL', ruc: '20512345678', direccion: 'Jr. Comercio 890, Chiclayo',
      banco: 'BBVA', numeroCuenta: '0011-0567-0200123456', moneda: 'SOLES',
      condicionPago: 'Pago contado contra entrega',
      contactos: { create: [
        { nombre: 'Sr. Pedro Chávez', cargo: 'Gerente Comercial', email: 'pedidos@ferretlosandes.com', telefono: '+51 74 678901', esPrincipal: true },
      ]},
    },
  });
  await prisma.proveedor.create({
    data: {
      razonSocial: 'Cementos Pacasmayo SAA', ruc: '20100113833', direccion: 'Av. Industrial 100, Pacasmayo',
      banco: 'Interbank', numeroCuenta: '898-3001234567', moneda: 'SOLES',
      condicionPago: '30% adelanto, 70% a 30 días factura',
      contactos: { create: [
        { nombre: 'Sra. Carmen Ibáñez', cargo: 'Ejecutiva de Clientes', email: 'clientes@cempac.com.pe',   telefono: '+51 44 234567', esPrincipal: true },
        { nombre: 'Ing. Rafael Mora',   cargo: 'Soporte Técnico',       email: 'tecnico@cempac.com.pe',     telefono: '+51 44 234568' },
      ]},
    },
  });
  await prisma.proveedor.create({
    data: {
      razonSocial: 'Herramientas Pro Lima SAC', ruc: '20634567891', direccion: 'Av. Argentina 1500, Lima',
      banco: 'Scotiabank', numeroCuenta: '000-1234567', moneda: 'DOLARES',
      condicionPago: '50% adelanto, 50% contra entrega',
      contactos: { create: [
        { nombre: 'Ing. Marco Salinas', cargo: 'Director de Ventas', email: 'ventas@herraprolima.com', telefono: '+51 1 3456789', esPrincipal: true },
      ]},
    },
  });
  console.log('   ✔  4 proveedores\n');

  // ── 5. Proyectos ─────────────────────────────────────────────────────────
  console.log('🏗️   Creando proyectos…');
  const proy1 = await prisma.proyecto.create({
    data: {
      codigo:    'PRY-2024-001',
      nombre:    'Línea 30kV Chiclayo Norte',
      ciudad:    'Chiclayo',
      direccion: 'Km. 12 Carretera Pomalca',
      ambitoGeografico: 'local',
      estado:    'ejecucion',
      clienteId: cMinera.id,
      coordinadorClienteId: cMinera.contactos[0].id,
      coordinadorEmpresaId: tRoberto.id,
      ejecutorId:           tCarlos.id,
      prevencionistaId:     tAna.id,
      fechaInicio: new Date('2024-03-01'),
      fechaFin:    new Date('2024-10-31'),
      supervisores: { create: { userId: uSup.id } },
    },
  });

  const proy2 = await prisma.proyecto.create({
    data: {
      codigo:    'PRY-2024-002',
      nombre:    'Remodelación Mercado Central',
      ciudad:    'Chiclayo',
      direccion: 'Av. Balta 512, Chiclayo',
      ambitoGeografico: 'local',
      estado:    'ejecucion',
      clienteId: cMuni.id,
      coordinadorClienteId: cMuni.contactos[0].id,
      coordinadorEmpresaId: tJuan.id,
      ejecutorId:           tSofia.id,
      prevencionistaId:     tAna.id,
      fechaInicio: new Date('2024-05-01'),
      fechaFin:    new Date('2025-02-28'),
    },
  });

  const proy3 = await prisma.proyecto.create({
    data: {
      codigo:    'PRY-2024-003',
      nombre:    'Ampliación Planta Industrial Lima',
      ciudad:    'Lima',
      direccion: 'Av. Industrial 3400, Callao',
      ambitoGeografico: 'local',
      estado:    'planificacion',
      clienteId: cConst.id,
      coordinadorClienteId: cConst.contactos[0].id,
      fechaInicio: new Date('2024-06-15'),
      fechaFin:    new Date('2025-06-14'),
    },
  });

  // Proyecto con subproyecto
  const proy4 = await prisma.proyecto.create({
    data: {
      codigo:          'PRY-2024-004',
      nombre:          'Cadena de Tiendas Norte',
      ambitoGeografico: 'nacional',
      estado:          'ejecucion',
      clienteId:       cConst.id,
      fechaInicio:     new Date('2024-01-15'),
      fechaFin:        new Date('2025-12-31'),
    },
  });

  await prisma.proyecto.create({
    data: {
      codigo:    'PRY-2024-004-A',
      nombre:    'Tienda Chiclayo Centro',
      ciudad:    'Chiclayo',
      direccion: 'Av. Balta 1200',
      ambitoGeografico: 'local',
      estado:    'ejecucion',
      parentId:  proy4.id,
      clienteId: cConst.id,
      fechaInicio: new Date('2024-03-01'),
      fechaFin:    new Date('2024-12-31'),
    },
  });

  await prisma.proyecto.create({
    data: {
      codigo:         'PRY-2023-010',
      nombre:         'Subestación Eléctrica Trujillo',
      ciudad:         'Trujillo',
      ambitoGeografico: 'local',
      estado:         'cierre',
      fechaInicio:    new Date('2023-01-10'),
      fechaFin:       new Date('2023-11-30'),
      fechaInicioReal: new Date('2023-01-15'),
      fechaFinReal:    new Date('2023-12-05'),
      notaInicioReal:  'Retraso por permisos municipales pendientes',
    },
  });
  console.log('   ✔  6 proyectos (1 con subproyecto)\n');

  // ── 6. Almacenes ─────────────────────────────────────────────────────────
  console.log('🏭  Creando almacenes…');

  const almChiclayo = await prisma.almacen.create({
    data: { nombre: 'Almacén Chiclayo', tipo: 'fijo', ciudad: 'Chiclayo' },
  });
  const almLima = await prisma.almacen.create({
    data: { nombre: 'Almacén Lima', tipo: 'fijo', ciudad: 'Lima' },
  });

  await prisma.almacen.create({
    data: { nombre: `Almacén ${proy1.nombre}`, tipo: 'temporal' },
  });
  await prisma.almacen.create({
    data: { nombre: `Almacén ${proy2.nombre}`, tipo: 'temporal' },
  });
  await prisma.almacen.create({
    data: { nombre: `Almacén ${proy3.nombre}`, tipo: 'temporal' },
  });
  console.log('   ✔  2 fijos + 3 temporales\n');

  // ── 7. Catálogo de ítems ─────────────────────────────────────────────────
  console.log('📦  Creando catálogo de ítems…');
  await Promise.all([
    prisma.itemInventario.create({ data: { codigo: 'ELE-001', nombre: 'Cable THW 10mm²',            unidad: 'rollo', categoria: 'Eléctrico', tipo: 'consumible' } }),
    prisma.itemInventario.create({ data: { codigo: 'ELE-002', nombre: 'Cable THW 4mm²',             unidad: 'rollo', categoria: 'Eléctrico', tipo: 'consumible' } }),
    prisma.itemInventario.create({ data: { codigo: 'ELE-003', nombre: 'Tubo conduit EMT 3/4"',      unidad: 'und',   categoria: 'Eléctrico', tipo: 'consumible' } }),
    prisma.itemInventario.create({ data: { codigo: 'CIV-001', nombre: 'Cemento Portland 42.5kg',   unidad: 'bolsa', categoria: 'Civil',     tipo: 'consumible' } }),
    prisma.itemInventario.create({ data: { codigo: 'CIV-002', nombre: 'Arena gruesa',              unidad: 'm3',    categoria: 'Civil',     tipo: 'consumible' } }),
    prisma.itemInventario.create({ data: { codigo: 'ELE-004', nombre: 'Cinta aislante 3M',         unidad: 'und',   categoria: 'Eléctrico', tipo: 'consumible' } }),
    prisma.itemInventario.create({ data: { codigo: 'ELE-005', nombre: 'Conector compresión Cu 10mm²', unidad: 'und', categoria: 'Eléctrico', tipo: 'consumible' } }),
    prisma.itemInventario.create({ data: { codigo: 'ELE-006', nombre: 'Varilla cobre 5/8" x 2.4m', unidad: 'und',   categoria: 'Eléctrico', tipo: 'consumible' } }),
    prisma.itemInventario.create({ data: { codigo: 'HER-001', nombre: 'Taladro percutor Bosch GBH 2-26', unidad: 'und', categoria: 'Herramientas', tipo: 'activo' } }),
    prisma.itemInventario.create({ data: { codigo: 'HER-002', nombre: 'Compresor de aire 50L',           unidad: 'und', categoria: 'Herramientas', tipo: 'activo' } }),
    prisma.itemInventario.create({ data: { codigo: 'MED-001', nombre: 'Multímetro digital Fluke 115',    unidad: 'und', categoria: 'Medición',     tipo: 'activo' } }),
    prisma.itemInventario.create({ data: { codigo: 'MED-002', nombre: 'Megóhmetro Fluke 1507',           unidad: 'und', categoria: 'Medición',     tipo: 'activo' } }),
    prisma.itemInventario.create({ data: { codigo: 'MED-003', nombre: 'Nivel láser Bosch GLL 3-80',      unidad: 'und', categoria: 'Medición',     tipo: 'activo' } }),
  ]);
  console.log('   ✔  8 consumibles + 5 equipos\n');

  // ── 9. Asignación de trabajadores a proyectos ────────────────────────────
  console.log('📋  Asignando trabajadores a proyectos…');
  await prisma.proyectoTrabajador.createMany({
    data: [
      { proyectoId: proy1.id, trabajadorId: tCarlos.id,  fechaIngreso: new Date('2024-03-01') },
      { proyectoId: proy1.id, trabajadorId: tAna.id,     fechaIngreso: new Date('2024-03-01') },
      { proyectoId: proy1.id, trabajadorId: tLuis.id,    fechaIngreso: new Date('2024-03-15') },
      { proyectoId: proy2.id, trabajadorId: tJuan.id,    fechaIngreso: new Date('2024-05-01') },
      { proyectoId: proy2.id, trabajadorId: tSofia.id,   fechaIngreso: new Date('2024-05-01') },
      { proyectoId: proy2.id, trabajadorId: tMaria.id,   fechaIngreso: new Date('2024-05-10') },
    ],
  });
  console.log('   ✔  6 asignaciones\n');

  // ── 10. Hitos de ejemplo ─────────────────────────────────────────────────
  console.log('🎯  Creando hitos…');
  await prisma.hito.createMany({
    data: [
      { proyectoId: proy1.id, nombre: 'Entrega de diseño eléctrico',    fechaProgramada: new Date('2024-04-15'), cumplimiento: 'si',         responsableId: tRoberto.id, actualizadoEn: new Date() },
      { proyectoId: proy1.id, nombre: 'Instalación de postes km 0-6',   fechaProgramada: new Date('2024-06-30'), cumplimiento: 'si',         responsableId: tCarlos.id,  actualizadoEn: new Date() },
      { proyectoId: proy1.id, nombre: 'Tendido de cable km 0-6',        fechaProgramada: new Date('2024-08-15'), cumplimiento: 'programado', responsableId: tCarlos.id,  actualizadoEn: new Date() },
      { proyectoId: proy2.id, nombre: 'Demolición estructura antigua',  fechaProgramada: new Date('2024-06-15'), cumplimiento: 'si',         responsableId: tJuan.id,    actualizadoEn: new Date() },
      { proyectoId: proy2.id, nombre: 'Estructura metálica nueva',      fechaProgramada: new Date('2024-10-01'), cumplimiento: 'programado', responsableId: tSofia.id,   actualizadoEn: new Date() },
    ],
  });
  console.log('   ✔  5 hitos\n');

  // ── Resumen ───────────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════');
  console.log('✅  Seed completado');
  console.log('');
  console.log('   Accesos de prueba (todos con Admin1234!):');
  console.log('   admin@dyc.cl       → administrador');
  console.log('   gerencia@dyc.cl    → gerencia');
  console.log('   logistica@dyc.cl   → logistica');
  console.log('   supervisor@dyc.cl  → supervisor');
  console.log('═══════════════════════════════════════');
}

main()
  .catch((e) => {
    console.error('❌  Error en seed:', e.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
