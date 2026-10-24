import "server-only";
import { Pool } from "pg";

/**
 * Pool de Postgres compartido por el repositorio y el login de staff.
 *
 * Se activa con `DATABASE_URL` (ej. la base `sales_agent` de Lyria en Dokploy).
 * `TENANT_ID` es el tenant de Lyria al que pertenecen los eventos y el staff.
 * El pool vive en globalThis para no abrir conexiones nuevas en cada recarga de `next dev`.
 */

const global = globalThis as unknown as { __americanosPool?: Pool };

export const databaseUrl = () => process.env.DATABASE_URL;
export const postgresActivo = () => !!databaseUrl();
export const tenantId = () => process.env.TENANT_ID ?? "la_marina_sport_club";

export function pool(): Pool {
  if (!global.__americanosPool) {
    global.__americanosPool = new Pool({
      connectionString: databaseUrl(),
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: "lamarina-americanos",
    });
    // Un error en una conexión ociosa no debe tumbar el proceso.
    global.__americanosPool.on("error", (err) => console.error("[db] Postgres", err.message));
  }
  return global.__americanosPool;
}

/** Ejecuta una consulta; los errores salen con prefijo "Postgres" para que `manejar` responda 502. */
export async function consultar<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  try {
    const res = await pool().query(sql, params);
    return res.rows as T[];
  } catch (err) {
    throw new Error(`Postgres: ${(err as Error).message}`);
  }
}
