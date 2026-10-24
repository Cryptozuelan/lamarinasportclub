import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/health → { ok: true }. No toca la base de datos: el healthcheck de
 * Docker no debe reiniciar el contenedor cuando cae Postgres.
 */
export function GET() {
  return NextResponse.json({ ok: true });
}
