import { eventoDeFoto, idFoto } from "@/lib/server/fotos";
import { ErrorApi, manejar } from "@/lib/server/http";
import { getTorneosRepository } from "@/lib/server/repository";
import { puedeVer, visorDe } from "@/lib/server/torneos";

export const dynamic = "force-dynamic";

/**
 * GET /api/fotos/:eventoId/:clave?v= → la imagen. clave = d-<duplaId> o j-<jugadorId>.
 * En un torneo con clave, solo quien puede verlo; los americanos son públicos.
 */
export const GET = manejar(async (req: Request, ctx: { params: Promise<{ eventoId: string; clave: string }> }) => {
  const { eventoId, clave } = await ctx.params;
  const c = decodeURIComponent(clave);
  const tipo = c.startsWith("d-") ? "dupla" : c.startsWith("j-") ? "jugador" : null;
  const ev = tipo ? await eventoDeFoto(eventoId) : null;
  if (!ev || ("torneo" in ev && !puedeVer(ev.torneo, (await visorDe(req))))) throw new ErrorApi(404, "Sin foto.");
  const x = await getTorneosRepository().obtenerExtra(idFoto(eventoId, tipo!, c.slice(2)));
  const m = (x?.data as { img?: string } | undefined)?.img?.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (!m) throw new ErrorApi(404, "Sin foto.");
  return new Response(Buffer.from(m[2], "base64"), { headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=31536000, immutable" } });
});
