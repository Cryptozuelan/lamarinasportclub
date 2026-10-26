import { NextResponse } from "next/server";
import { sesionDe } from "@/lib/server/auth";
import { arbitroValido, nombreArbitro } from "@/lib/server/arbitros";
import { eventoDeFoto, idFoto, urlFoto, type FotoGuardada, type TipoFoto } from "@/lib/server/fotos";
import { ErrorApi, leerJson, manejar } from "@/lib/server/http";
import { getTorneosRepository } from "@/lib/server/repository";
import { puedeVer, visorDe } from "@/lib/server/torneos";

export const dynamic = "force-dynamic";

const MAX_FOTO = 450_000;

/** GET /api/fotos?torneoId= → { fotos: { [duplaId]: url } } de las duplas del torneo. */
export const GET = manejar(async (req: Request) => {
  const torneoId = new URL(req.url).searchParams.get("torneoId");
  if (!torneoId) throw new ErrorApi(400, "Falta torneoId.");
  const t = await getTorneosRepository().obtener(torneoId);
  if (!t || t.eliminado) throw new ErrorApi(404, "Torneo no encontrado.");
  if (!puedeVer(t, (await visorDe(req)))) return NextResponse.json({ fotos: {} });
  const lista = await getTorneosRepository().listarExtras(t.id, "foto");
  return NextResponse.json({ fotos: Object.fromEntries(lista.map((x) => { const id = x.id.split(":").slice(2).join(":"); return [id, urlFoto(t.id, "dupla", id, x.actualizadoEn)]; })) });
});

/**
 * POST /api/fotos { eventoId, tipo: "dupla" | "jugador", id, img: "data:image/jpeg;base64,…" } → { url }
 * Dupla de un torneo: el staff o un árbitro del torneo. Jugador (torneo o americano): el staff.
 */
export const POST = manejar(async (req: Request) => {
  const b = (await leerJson(req, 600_000)) as { eventoId?: unknown; tipo?: unknown; id?: unknown; img?: unknown } | null;
  if (typeof b?.eventoId !== "string" || typeof b?.id !== "string" || typeof b?.img !== "string" || (b.tipo !== "dupla" && b.tipo !== "jugador"))
    throw new ErrorApi(400, "Envía { eventoId, tipo, id, img }.");
  const tipo = b.tipo as TipoFoto;
  const ev = await eventoDeFoto(b.eventoId);
  if (!ev) throw new ErrorApi(404, "Evento no encontrado.");
  const staff = sesionDe(req);
  let por = staff?.nombre;
  if ("torneo" in ev) {
    const t = ev.torneo;
    if (!por && tipo === "dupla") {
      const a = await arbitroValido(t, (await visorDe(req)).arbitro);
      if (a) por = `Árbitro ${nombreArbitro(a)}`;
    }
    const existe = tipo === "dupla" ? t.categorias.some((c) => c.duplas.some((d) => d.id === b.id)) : t.jugadores.some((j) => j.id === b.id);
    if (por && !existe) throw new ErrorApi(404, "No está en este torneo.");
  } else {
    if (tipo !== "jugador") throw new ErrorApi(400, "En un americano las fotos son por jugador.");
    if (por && !ev.americano.jugadores.some((j) => j.id === b.id)) throw new ErrorApi(404, "Ese jugador no está en el americano.");
  }
  if (!por) throw new ErrorApi(401, tipo === "dupla" ? "Solo el staff o los árbitros del torneo pueden subir fotos." : "Solo el staff puede subir fotos.");
  if (!/^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/.test(b.img)) throw new ErrorApi(422, "La foto debe ser JPEG, WebP o PNG.");
  if (b.img.length > MAX_FOTO) throw new ErrorApi(413, "La foto pesa demasiado.");
  const x = await getTorneosRepository().guardarExtra({
    id: idFoto(b.eventoId, tipo, b.id),
    torneoId: b.eventoId,
    tipo: tipo === "dupla" ? "foto" : "foto-jugador",
    data: { img: b.img, por } satisfies FotoGuardada,
    actualizadoEn: new Date().toISOString(),
  });
  return NextResponse.json({ url: urlFoto(b.eventoId, tipo, b.id, x.actualizadoEn) }, { status: 201 });
});

/** DELETE /api/fotos?eventoId=&tipo=&id= (mismos permisos que subirla). */
export const DELETE = manejar(async (req: Request) => {
  const q = new URL(req.url).searchParams;
  const eventoId = q.get("eventoId");
  const tipo = q.get("tipo") as TipoFoto | null;
  const id = q.get("id");
  if (!eventoId || !id || (tipo !== "dupla" && tipo !== "jugador")) throw new ErrorApi(400, "Faltan eventoId, tipo e id.");
  const ev = await eventoDeFoto(eventoId);
  if (!ev) throw new ErrorApi(404, "Evento no encontrado.");
  const ok = !!sesionDe(req) || ("torneo" in ev && tipo === "dupla" && !!(await arbitroValido(ev.torneo, (await visorDe(req)).arbitro)));
  if (!ok) throw new ErrorApi(401, "Sin permiso.");
  await getTorneosRepository().borrarExtra(idFoto(eventoId, tipo, id));
  return NextResponse.json({ ok: true });
});
