import { NextResponse } from "next/server";
import { revisarFvpServidor } from "@/lib/ranking/fvp";
import { exigirStaff } from "@/lib/server/auth";
import { ErrorApi, leerJson, manejar } from "@/lib/server/http";
import { getTorneosRepository } from "@/lib/server/repository";
import { buscadorVigente } from "@/lib/server/rankingFvp";
import { paraVisor, visorDe } from "@/lib/server/torneos";
import { despues, fusionarTorneos } from "@/lib/torneo/torneo";
import { validarTorneo } from "@/lib/torneo/validacion";
import type { ApiTorneosRespuesta, Torneo } from "@/types/torneo";

export const dynamic = "force-dynamic";

/**
 * GET /api/torneos → { modo, torneos }. `?todos=1` incluye los eliminados.
 * El staff recibe todo; los participantes, según la clave del torneo (ver lib/server/torneos.ts).
 */
export const GET = manejar(async (req: Request) => {
  const repo = getTorneosRepository();
  const v = await visorDe(req);
  const todos = new URL(req.url).searchParams.get("todos") === "1";
  const torneos = (await repo.listar()).filter((t) => todos || !t.eliminado).map((t) => paraVisor(t, v));
  return NextResponse.json<ApiTorneosRespuesta>({ modo: repo.modo, torneos });
});

/**
 * POST /api/torneos body: { torneo } → upsert con fusión por partido (staff).
 * Las duplas nuevas o cambiadas se vuelven a chequear con el ranking FVP (ver lib/ranking/fvp.ts).
 */
export const POST = manejar(async (req: Request) => {
  const sesion = exigirStaff(req);
  const body = (await leerJson(req)) as { torneo?: unknown } | null;
  const errores = validarTorneo(body?.torneo);
  if (errores.length) throw new ErrorApi(422, "Torneo inválido.", errores);
  const entrante = body!.torneo as Torneo;
  const { bloqueado: _b, ...limpio } = entrante;
  const repo = getTorneosRepository();
  const existente = await repo.obtener(limpio.id);
  const fusionado = existente ? fusionarTorneos(existente, limpio) : limpio;
  const fvp = await buscadorVigente();
  const revisado = revisarFvpServidor(existente, fusionado, fvp?.buscar ?? null, { lista: fvp?.lista, staff: sesion.nombre });
  // Si el servidor corrigió algo, la versión sube para que el cliente la adopte al fusionar.
  const final = revisado.cambios ? { ...revisado.torneo, actualizadoEn: despues(fusionado.actualizadoEn) } : fusionado;
  await repo.guardar(final);
  return NextResponse.json({ modo: repo.modo, torneo: final }, { status: existente ? 200 : 201 });
});
