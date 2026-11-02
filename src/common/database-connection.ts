import { readFileSync } from 'node:fs';
import type { PoolConfig } from 'pg';

/** TLS de PostgreSQL es independiente del HTTP local del frontend. */
export function databaseConnectionOptions(
  connectionString: string,
): PoolConfig {
  const url = new URL(connectionString);
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'ssl'])
    url.searchParams.delete(key);
  const ca = readFileSync(
    process.env.DATABASE_SSL_CA_PATH ||
      new URL('../../certs/supabase-ca.crt', import.meta.url),
    'utf8',
  );
  return {
    connectionString: url.toString(),
    ssl: { ca, rejectUnauthorized: true },
  };
}
