import 'dotenv/config';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { generateSecret, generateURI } from 'otplib';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

// Uso: npx tsx scripts/generar-qr-2fa.ts <usuarioId> [--force]
// Imprime la URI otpauth por stdout; los mensajes van a stderr.

const usuarioId = process.argv[2];
const forzar = process.argv.includes('--force');

if (!usuarioId) {
  console.error('Uso: npx tsx scripts/generar-qr-2fa.ts <usuarioId> [--force]');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required.');
}

if (!process.env.TWO_FACTOR_ENCRYPTION_KEY) {
  throw new Error('TWO_FACTOR_ENCRYPTION_KEY is required.');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// Idéntico a AuthService.encryptSecret (AES-256-GCM, clave = sha256(TWO_FACTOR_ENCRYPTION_KEY)).
function encryptSecret(plain: string): string {
  const key = createHash('sha256')
    .update(process.env.TWO_FACTOR_ENCRYPTION_KEY as string)
    .digest();

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

async function main(): Promise<void> {
  const usuario = await prisma.usuarios.findUnique({
    where: { id: usuarioId },
  });

  if (!usuario) {
    throw new Error(`No existe un usuario con id ${usuarioId}.`);
  }

  if (!usuario.activo) {
    throw new Error('El usuario se encuentra desactivado.');
  }

  if (usuario.two_factor_enabled && !forzar) {
    console.error(
      'El usuario ya tiene 2FA habilitado. Regenerar el secreto invalidaría ' +
        'el autenticador actual. Usa --force si estás seguro.',
    );
    process.exit(1);
  }

  const secret = generateSecret();

  await prisma.usuarios.update({
    where: { id: usuario.id },
    data: {
      two_factor_secret: encryptSecret(secret),
      two_factor_enabled: false, // queda pendiente hasta verificar con un código
    },
  });

  const otpauthUrl = generateURI({
    issuer: 'RIBANI',
    label: usuario.email,
    secret,
  });

  console.error(
    `Secreto 2FA generado (cifrado y guardado) para ${usuario.email} ` +
      `(rol_id ${usuario.rol_id}). 2FA queda pendiente de verificación.`,
  );

  process.stdout.write(otpauthUrl);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
