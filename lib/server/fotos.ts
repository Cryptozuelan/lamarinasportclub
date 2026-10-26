import "server-only";
import type { EventoAmericano } from "@/types/americano";
import type { Torneo } from "@/types/torneo";
import { getRepository, getTorneosRepository } from "./repository";

/**
 * Fotos tomadas en el club: la de cada dupla de un torneo (la toma el árbitro en la pista o el staff)
 * y la de cada jugador de un torneo o americano (staff). JPEG comprimido en el dispositivo y
 * guardado en `eventos_extras`; se sirve en /api/fotos/:evento/:clave?v=versión.
 */
export interface FotoGuardada {
  img: string;
  por: string;
}

export type TipoFoto = "dupla" | "jugador";

export const idFoto = (eventoId: string, tipo: TipoFoto, id: string) => (tipo === "dupla" ? `foto:${eventoId}:${id}` : `fotoj:${eventoId}:${id}`);
export const claveFoto = (tipo: TipoFoto, id: string) => `${tipo === "dupla" ? "d" : "j"}-${id}`;
export const urlFoto = (eventoId: string, tipo: TipoFoto, id: string, v: string) =>
  `/api/fotos/${encodeURIComponent(eventoId)}/${encodeURIComponent(claveFoto(tipo, id))}?v=${encodeURIComponent(v)}`;

/** Torneo o americano dueño de la foto. */
export async function eventoDeFoto(eventoId: string): Promise<{ torneo: Torneo } | { americano: EventoAmericano } | null> {
  const t = await getTorneosRepository().obtener(eventoId);
  if (t && !t.eliminado) return { torneo: t };
  const e = await getRepository().obtener(eventoId);
  return e && !e.eliminado ? { americano: e } : null;
}
