import { NextResponse } from "next/server";
import { sesionDe } from "@/lib/server/auth";
import { ErrorApi, leerJson, manejar } from "@/lib/server/http";
import { getTorneosRepository } from "@/lib/server/repository";
import { arbitroValido, nombreArbitro } from "@/lib/server/arbitros";
import { paraVisor, visorDe } from "@/lib/server/torneos";
import { limiteWO } from "@/lib/torneo/programacion";
import { validarResultadoTorneo } from "@/lib/torneo/tabla";
import { cargarResultado, cargarWO, iniciarPartido, llamarAPista, partido, reglasDe } from "@/lib/torneo/torneo";
import type { AccionPartido } from "@/lib/torneo/arbitraje";
import type { Torneo } from "@/types/torneo";

export const dynamic = "force-dynamic";

const TIPOS = ["NORMAL", "RETIRO", "DESCALIFICACION"];

/**
 * POST /api/torneos/:id/partidos/:pid  { accion, … }
 *
 * Lo que hace el árbitro con un partido, aplicado en el servidor sobre la versión vigente del
 * torneo (así no pisa nada de lo que el staff cambió en paralelo). Lo pueden usar el staff y los
 * árbitros del torneo. El árbitro no corrige un resultado ya cargado y solo da W.O. cuando venció
 * la tolerancia: lo demás queda para el staff.
 */
export const POST = manejar(async (req: Request, ctx: { params: Promise<{ id: string; pid: string }> }) => {
  const { id, pid } = await ctx.params;
  const repo = getTorneosRepository();
  const t = await repo.obtener(id);
  if (!t || t.eliminado) throw new ErrorApi(404, "Torneo no encontrado.");
  const v = await visorDe(req);
  const staff = sesionDe(req);
  const arbitro = staff ? null : await arbitroValido(t, v.arbitro);
  if (!staff && !arbitro) throw new ErrorApi(401, "Solo el staff o los árbitros de este torneo pueden anotar.");
  const p = partido(t, pid);
  if (!p || p.bye) throw new ErrorApi(404, "Partido no encontrado.");
  const body = (await leerJson(req)) as Partial<AccionPartido> | null;
  const por = staff ? staff.nombre : `Árbitro ${nombreArbitro(arbitro!)}`;
  const pistaValida = (n: unknown) => typeof n === "number" && t.canchas.some((c) => c.numero === n && c.activa);
  let final: Torneo;

  switch (body?.accion) {
    case "llamar": {
      if (p.estado !== "PENDIENTE" || !p.duplaA || !p.duplaB) throw new ErrorApi(409, "Este partido no se puede llamar ahora.");
      if (!pistaValida(body.pista)) throw new ErrorApi(400, "Pista inválida.");
      final = llamarAPista(t, pid, body.pista!);
      break;
    }
    case "iniciar": {
      if (p.estado === "FINALIZADO") throw new ErrorApi(409, "El partido ya terminó.");
      if (!p.duplaA || !p.duplaB) throw new ErrorApi(409, "Todavía no se conocen las dos duplas.");
      if (body.pista != null && !pistaValida(body.pista)) throw new ErrorApi(400, "Pista inválida.");
      final = iniciarPartido(t, pid, body.pista ?? undefined);
      break;
    }
    case "resultado": {
      if (arbitro && p.estado === "FINALIZADO") throw new ErrorApi(403, "El resultado ya está cargado. Para corregirlo, avisa al staff.");
      const r = body.resultado;
      if (!r || !Array.isArray(r.sets) || !r.sets.length || r.sets.length > 3 || (r.ganador !== "A" && r.ganador !== "B") || !TIPOS.includes(r.tipo))
        throw new ErrorApi(422, "Resultado inválido.");
      if (r.sets.some((s) => !Number.isInteger(s?.a) || !Number.isInteger(s?.b) || s.a < 0 || s.b < 0 || s.a > 99 || s.b > 99)) throw new ErrorApi(422, "Resultado inválido.");
      if (r.tipo === "NORMAL") {
        const error = validarResultadoTorneo(reglasDe(t, p), r.sets);
        if (error) throw new ErrorApi(422, error);
      }
      final = cargarResultado(t, pid, { sets: r.sets.map((s) => ({ a: s.a, b: s.b })), ganador: r.ganador, tipo: r.tipo }, por);
      break;
    }
    case "wo": {
      if (body.ganador !== "A" && body.ganador !== "B") throw new ErrorApi(400, "Indica quién gana por W.O.");
      if (p.estado === "FINALIZADO") throw new ErrorApi(409, "El partido ya terminó.");
      if (arbitro) {
        const limite = p.estado === "LLAMADO" ? limiteWO(t, p) : null;
        if (limite === null || limite > Date.now()) throw new ErrorApi(403, "Todavía corre la tolerancia: el W.O. se puede dar cuando se cumpla.");
      }
      final = cargarWO(t, pid, body.ganador, por);
      break;
    }
    default:
      throw new ErrorApi(400, "Acción desconocida.");
  }

  await repo.guardar(final);
  return NextResponse.json({ modo: repo.modo, torneo: paraVisor(final, v) });
});
