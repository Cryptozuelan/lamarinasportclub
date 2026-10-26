import { NextResponse } from "next/server";
import { buscarAtletas } from "@/lib/ranking/fvp";
import { exigirStaff } from "@/lib/server/auth";
import { ErrorApi, leerJson, manejar } from "@/lib/server/http";
import { buscadorVigente, cargarManual, obtenerRanking, resumen, sincronizarHoja } from "@/lib/server/rankingFvp";
import type { AtletaFvp } from "@/types/ranking";

export const dynamic = "force-dynamic";

const MAX_CEDULAS = 300;

/**
 * GET /api/ranking-fvp (staff)
 *   → { resumen }                         estado de la lista vigente
 *   ?cedulas=V-1,V-2 → { resumen, atletas: { "V-1": AtletaFvp | null } }
 *   ?q=texto         → { resumen, resultados: AtletaFvp[] } (nombre o cédula, máx. 25)
 */
export const GET = manejar(async (req: Request) => {
  exigirStaff(req);
  const params = new URL(req.url).searchParams;
  const cedulas = params.get("cedulas");
  const q = params.get("q")?.trim();
  if (cedulas != null) {
    const lista = cedulas.split(",").map((s) => s.trim()).filter(Boolean).slice(0, MAX_CEDULAS);
    const [r, b] = await Promise.all([obtenerRanking(), buscadorVigente()]);
    const atletas: Record<string, AtletaFvp | null> = Object.fromEntries(lista.map((c) => [c, b?.buscar(c) ?? null]));
    return NextResponse.json({ resumen: resumen(r), atletas });
  }
  const r = await obtenerRanking();
  if (q) return NextResponse.json({ resumen: resumen(r), resultados: buscarAtletas(r?.atletas ?? [], q.slice(0, 80)) });
  return NextResponse.json({ resumen: resumen(r) });
});

/**
 * POST /api/ranking-fvp (staff)
 *   { accion: "sincronizar" }                 → lee ya la hoja de la FVP
 *   { texto, archivo, forzar? }               → reemplaza la lista con la que sube el staff
 * Una lista mucho más corta que la vigente se rechaza salvo `forzar`.
 */
export const POST = manejar(async (req: Request) => {
  const sesion = exigirStaff(req);
  const body = (await leerJson(req, 5_000_000)) as { accion?: string; texto?: unknown; archivo?: unknown; forzar?: unknown } | null;
  if (body?.accion === "sincronizar") return NextResponse.json({ resumen: resumen(await sincronizarHoja()) });
  if (typeof body?.texto !== "string") throw new ErrorApi(400, "Falta el contenido de la lista.");
  const archivo = typeof body.archivo === "string" && body.archivo.trim() ? body.archivo.trim().slice(0, 120) : "Lista subida por el staff";
  const r = await cargarManual(body.texto, archivo, sesion.nombre, body.forzar === true);
  return NextResponse.json({ resumen: resumen(r) });
});
