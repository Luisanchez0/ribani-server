import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import bcrypt from 'bcryptjs';
import { databaseConnectionOptions } from '../src/common/database-connection.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required.');
}

const adapter = new PrismaPg(databaseConnectionOptions(connectionString));
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !password ||
    password.length < 12 ||
    Buffer.byteLength(password) > 72
  ) {
    throw new Error(
      'Define SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD (minimo 12 caracteres, maximo 72 bytes).',
    );
  }
  const existing = await prisma.usuarios.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    console.log('El usuario ya existe; no se cambia su password ni rol.');
    return;
  }

  const rol = await prisma.roles.findUnique({
    where: {
      codigo: 'ADMINISTRADOR',
    },
  });

  if (!rol) {
    throw new Error('No existe el rol ADMINISTRADOR en la base de datos.');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.usuarios.create({
    data: {
      rol_id: rol.id,
      nombre: 'Administrador',
      apellido: 'RIBANI',
      email,
      password_hash: passwordHash,
      activo: true,
    },
  });

  console.log('Administrador creado/actualizado:');
  console.log({
    id: admin.id,
    email: admin.email,
    rol_id: admin.rol_id,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
