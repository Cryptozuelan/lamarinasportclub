import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { ErrorApi, manejar } from "@/lib/server/http";
import { resumen, sincronizarHoja } from "@/lib/server/rankingFvp";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Sin CRON_SECRET cualquiera podría dispararla: solo se permite una vez cada 10 minutos. */
const ESPERA_MS = 10 * 60_000;
const memoria = globalThis as unknown as { __fvpUltimaSync?: number };

function autorizado(req: Request): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return true;
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secreto}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** GET /api/ranking-fvp/sync → Vercel Cron (vercel.json), una vez al día. */
export const GET = manejar(async (req: Request) => {
  if (!autorizado(req)) throw new ErrorApi(401, "No autorizado.");
  if (!process.env.CRON_SECRET && Date.now() - (memoria.__fvpUltimaSync ?? 0) < ESPERA_MS) throw new ErrorApi(429, "Ya se sincronizó hace poco.");
  memoria.__fvpUltimaSync = Date.now();
  const r = resumen(await sincronizarHoja());
  return NextResponse.json({ ok: true, total: r.total, cargadoEn: r.cargadoEn });
});
