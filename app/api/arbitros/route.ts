import { NextResponse } from "next/server";
import { sesionDe } from "@/lib/server/auth";
import { arbitroPublico, arbitroStaff, guardarPlantel, leerPlantel } from "@/lib/server/arbitros";
import { ErrorApi, leerJson, manejar } from "@/lib/server/http";
import { getTorneosRepository } from "@/lib/server/repository";

export const dynamic = "force-dynamic";

/**
 * GET /api/arbitros[?torneoId=] → plantel de árbitros del club.
 * Staff: todo (teléfono, estado y cuántos partidos y puntos anotó cada uno, en ese torneo o en
 * todos). Resto: nombre e inicial de los activos, solo con el registro abierto (es la lista de
 * "¿quién eres?").
 */
export const GET = manejar(async (req: Request) => {
  const torneoId = new URL(req.url).searchParams.get("torneoId");
  const p = await leerPlantel();
  if (sesionDe(req)) {
    const repo = getTorneosRepository();
    const ids = torneoId ? [torneoId] : (await repo.listar()).filter((t) => !t.eliminado).map((t) => t.id);
    const partidos = new Map<string, number>();
    const puntos = new Map<string, number>();
    for (const id of ids)
      for (const m of await repo.listarMarcadores(id)) {
        for (const x of new Set((m.anotadores ?? []).map((a) => a.id))) partidos.set(x, (partidos.get(x) ?? 0) + 1);
        for (const pt of m.puntos) if (pt.por) puntos.set(pt.por, (puntos.get(pt.por) ?? 0) + 1);
      }
    return NextResponse.json({ abierto: !!p.pin, arbitros: p.arbitros.map((a) => ({ ...arbitroStaff(a), partidos: partidos.get(a.id) ?? 0, puntos: puntos.get(a.id) ?? 0 })) });
  }
  return NextResponse.json({ abierto: !!p.pin, arbitros: p.pin ? p.arbitros.filter((a) => a.activo).map(arbitroPublico) : [] });
});

/** PATCH /api/arbitros { id, activo } (staff) → pausa o reactiva a un árbitro. */
export const PATCH = manejar(async (req: Request) => {
  if (!sesionDe(req)) throw new ErrorApi(401, "Solo el staff.");
  const b = (await leerJson(req)) as { id?: unknown; activo?: unknown } | null;
  if (typeof b?.id !== "string" || typeof b?.activo !== "boolean") throw new ErrorApi(400, "Envía { id, activo }.");
  const p = await leerPlantel();
  const a = p.arbitros.find((x) => x.id === b.id);
  if (!a) throw new ErrorApi(404, "Árbitro no encontrado.");
  a.activo = b.activo;
  a.actualizadoEn = new Date().toISOString();
  await guardarPlantel(p);
  return NextResponse.json({ arbitro: arbitroStaff(a) });
});

/** DELETE /api/arbitros?id= (staff) → borra al árbitro del plantel (sus partidos anotados conservan su nombre). */
export const DELETE = manejar(async (req: Request) => {
  if (!sesionDe(req)) throw new ErrorApi(401, "Solo el staff.");
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw new ErrorApi(400, "Falta id.");
  const p = await leerPlantel();
  await guardarPlantel({ ...p, arbitros: p.arbitros.filter((x) => x.id !== id) });
  return NextResponse.json({ ok: true });
});
