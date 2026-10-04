import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import bcrypt from 'bcryptjs';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required.');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = 'admin@ribani.com';
  const password = 'Admin123456';

  const rol = await prisma.roles.findUnique({
    where: {
      codigo: 'ADMINISTRADOR',
    },
  });

  if (!rol) {
    throw new Error(
      'No existe el rol ADMINISTRADOR en la base de datos.',
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.usuarios.upsert({
    where: {
      email,
    },
    update: {
      rol_id: rol.id,
      password_hash: passwordHash,
      activo: true,
    },
    create: {
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