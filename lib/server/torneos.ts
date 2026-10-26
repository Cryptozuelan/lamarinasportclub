import "server-only";
import type { Torneo } from "@/types/torneo";
import { arbitroDe, huellaClave, leerAccesos, sesionDe, type SesionArbitro } from "./auth";
import { sesionValida } from "./arbitros";

/** Lo que cada quien puede ver de un torneo. */
export type Visor = { staff: boolean; accesos: Record<string, number>; arbitro?: SesionArbitro | null };

/** Quién mira. La sesión de árbitro solo cuenta si sigue valiendo en el plantel del club. */
export async function visorDe(req: Request): Promise<Visor> {
  const s = arbitroDe(req);
  return { staff: !!sesionDe(req), accesos: leerAccesos(req), arbitro: s && (await sesionValida(s)) ? s : null };
}

/** Un árbitro del club (sesión ya validada en `visorDe`) ve y anota cualquier torneo vigente. */
export function esArbitroDe(t: Torneo, a?: SesionArbitro | null): boolean {
  return !!a?.arbitroId && !t.eliminado;
}

/** Clave del acceso en la cookie: torneo + huella de la clave vigente. */
export const llaveAcceso = (torneoId: string, clave: string) => `${torneoId}:${huellaClave(clave)}`;

export function puedeVer(t: Torneo, v: Visor): boolean {
  if (v.staff || !t.acceso?.clave || esArbitroDe(t, v.arbitro)) return true;
  if (!(new Date(t.acceso.vence).getTime() > Date.now())) return false;
  return !!v.accesos[llaveAcceso(t.id, t.acceso.clave)];
}

/**
 * Versión de un torneo para enviar al cliente: el staff la recibe completa; el resto
 * sin la clave, y si no tiene acceso (o la clave venció), un resumen sin datos.
 */
export function paraVisor(t: Torneo, v: Visor): Torneo {
  if (v.staff) return t;
  const acceso = t.acceso?.clave ? { clave: "", vence: t.acceso.vence } : null;
  if (puedeVer(t, v)) return { ...t, acceso, historial: [] };
  return {
    ...t,
    acceso,
    arbitros: null,
    bloqueado: true,
    jugadores: [],
    historial: [],
    bloqueos: [],
    categorias: t.categorias.map((c) => ({ ...c, duplas: [], cuadro: null })),
  };
}
