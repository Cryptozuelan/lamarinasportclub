import { NextResponse } from "next/server";
import { sesionDe } from "@/lib/server/auth";
import { ErrorApi, leerJson, manejar } from "@/lib/server/http";
import { getTorneosRepository } from "@/lib/server/repository";
import { arbitroValido, nombreArbitro } from "@/lib/server/arbitros";
import { puedeVer, visorDe } from "@/lib/server/torneos";
import { validarMarcador } from "@/lib/torneo/validacion";
import type { ApiMarcadoresRespuesta, MarcadorVivo } from "@/types/torneo";

export const dynamic = "force-dynamic";

/**
 * GET /api/marcadores?torneoId=… → marcadores punto a punto (para el marcador de pista,
 * el cuadro en vivo y las estadísticas). `&desde=ISO` devuelve solo los cambiados después.
 */
export const GET = manejar(async (req: Request) => {
  const url = new URL(req.url);
  const torneoId = url.searchParams.get("torneoId");
  const desde = url.searchParams.get("desde");
  const repo = getTorneosRepository();
  const v = await visorDe(req);
  const torneos = new Map((await repo.listar()).map((t) => [t.id, t]));
  const marcadores = (await repo.listarMarcadores(torneoId)).filter((m) => {
    const t = torneos.get(m.torneoId);
    return t && puedeVer(t, v) && (!desde || m.actualizadoEn > desde);
  });
  return NextResponse.json<ApiMarcadoresRespuesta>({ modo: repo.modo, marcadores });
});

/**
 * POST /api/marcadores body: { marcador } → gana la versión más reciente.
 * Lo suben el staff y los árbitros del torneo del marcador (el árbitro queda como anotador).
 */
export const POST = manejar(async (req: Request) => {
  const body = (await leerJson(req)) as { marcador?: unknown } | null;
  const errores = validarMarcador(body?.marcador);
  if (errores.length) throw new ErrorApi(422, "Marcador inválido.", errores);
  let entrante = body!.marcador as MarcadorVivo;
  const repo = getTorneosRepository();
  const existente = await repo.obtenerMarcador(entrante.id);
  const staff = sesionDe(req);
  let quien: { id: string; nombre: string };
  if (staff) quien = { id: "staff", nombre: staff.nombre };
  else {
    const t = await repo.obtener(entrante.torneoId);
    const a = t ? await arbitroValido(t, (await visorDe(req)).arbitro) : null;
    if (!t || !a) throw new ErrorApi(401, "Solo el staff o los árbitros de este torneo pueden anotar.");
    // Solo partidos de su torneo.
    if (!t.categorias.some((c) => c.cuadro?.partidos.some((p) => p.id === entrante.id))) throw new ErrorApi(403, "Ese partido no es de tu torneo.");
    if (existente?.finalizado) throw new ErrorApi(403, "Ese partido ya se cerró. Para corregirlo, avisa al staff.");
    quien = { id: a.id, nombre: nombreArbitro(a) };
    entrante = { ...entrante, anotador: quien.nombre };
  }
  entrante = firmarPuntos(entrante, existente, quien);
  if (existente && existente.torneoId !== entrante.torneoId) throw new ErrorApi(409, "Ese marcador es de otro torneo.");
  const final = existente && existente.actualizadoEn > entrante.actualizadoEn ? existente : entrante;
  await repo.guardarMarcador(final);
  return NextResponse.json({ modo: repo.modo, marcador: final });
});

/**
 * Trazabilidad: cada punto nuevo queda firmado por quien lo subió (árbitro registrado o staff),
 * los ya firmados conservan su firma y la lista de anotadores suma los relevos.
 */
function firmarPuntos(m: MarcadorVivo, previo: MarcadorVivo | null, quien: { id: string; nombre: string }): MarcadorVivo {
  const antes = previo?.puntos ?? [];
  let nuevos = false;
  const puntos = m.puntos.map((p, i) => {
    const viejo = antes[i];
    if (viejo && viejo.t === p.t) return viejo.por ? { ...p, por: viejo.por } : p;
    if (p.por) return p;
    nuevos = true;
    return { ...p, por: quien.id };
  });
  const lista = [...(previo?.anotadores ?? []), ...(m.anotadores ?? [])].filter((a, i, arr) => arr.findIndex((b) => b.id === a.id) === i);
  if ((nuevos || !lista.length) && lista.at(-1)?.id !== quien.id) {
    const sin = lista.filter((a) => a.id !== quien.id);
    lista.splice(0, lista.length, ...sin, quien);
  }
  return { ...m, puntos, anotadores: lista.slice(-20) };
}
