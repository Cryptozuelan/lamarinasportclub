/**
 * Lo que hace el árbitro (anotador) con un partido. El cliente lo aplica al instante y el
 * servidor lo vuelve a aplicar sobre la versión vigente del torneo (POST /api/torneos/:id/partidos/:pid),
 * así un árbitro nunca sube el torneo entero ni pisa cambios del staff.
 */
import type { ResultadoTorneo, Torneo } from "@/types/torneo";
import { cargarResultado, cargarWO, iniciarPartido, llamarAPista } from "./torneo.ts";

export type AccionPartido =
  | { accion: "llamar"; pista: number }
  | { accion: "iniciar"; pista?: number | null }
  | { accion: "resultado"; resultado: ResultadoTorneo }
  | { accion: "wo"; ganador: "A" | "B" };

export function aplicarAccion(t: Torneo, partidoId: string, a: AccionPartido, por?: string): Torneo {
  switch (a.accion) {
    case "llamar":
      return llamarAPista(t, partidoId, a.pista);
    case "iniciar":
      return iniciarPartido(t, partidoId, a.pista ?? undefined);
    case "resultado":
      return cargarResultado(t, partidoId, a.resultado, por);
    case "wo":
      return cargarWO(t, partidoId, a.ganador, por);
  }
}
