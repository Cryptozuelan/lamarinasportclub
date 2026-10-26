/**
 * Árbitros de un torneo: turnos (qué pista y en qué franja le toca a cada uno), reparto
 * automático y el sorteo previo del partido según el reglamento FIP.
 * Lógica pura: la usan el panel del árbitro, la pantalla de turnos del staff y los tests.
 */
import type { DiaTorneo, EleccionSorteo, PartidoTorneo, Torneo, TurnoArbitro } from "@/types/torneo";

type Lado = "A" | "B";
export type LadoPista = "IZQ" | "DER";

const aMin = (h: string) => {
  const [a, b] = h.split(":").map(Number);
  return a * 60 + b;
};
const aHora = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Franjas de un día para repartir turnos: una si el día es corto, mañana y tarde si pasa de 8 h. */
export function franjasDia(d: DiaTorneo): { desde: string; hasta: string }[] {
  const ini = aMin(d.inicio);
  const fin = aMin(d.fin) <= ini ? 24 * 60 : aMin(d.fin);
  if (fin - ini <= 8 * 60) return [{ desde: d.inicio, hasta: aHora(fin) }];
  const medio = Math.round((ini + fin) / 2 / 60) * 60;
  return [
    { desde: d.inicio, hasta: aHora(medio) },
    { desde: aHora(medio), hasta: aHora(fin) },
  ];
}

const partidos = (t: Torneo): PartidoTorneo[] => t.categorias.flatMap((c) => c.cuadro?.partidos ?? []).filter((p) => !p.bye);

/** Partidos programados en la pista y franja de un turno. */
export function partidosDeTurno(t: Torneo, tu: Pick<TurnoArbitro, "fecha" | "pista" | "desde" | "hasta">): PartidoTorneo[] {
  const d = aMin(tu.desde);
  const h = aMin(tu.hasta) || 24 * 60;
  return partidos(t)
    .filter((p) => p.programacion?.fecha === tu.fecha && p.programacion.pista === tu.pista)
    .filter((p) => {
      const m = aMin(p.programacion!.hora);
      return m >= d && m < h;
    })
    .sort((a, b) => a.programacion!.hora.localeCompare(b.programacion!.hora));
}

/** Pistas con algún partido en esa franja (si no hay programación todavía, todas). */
function pistasConJuego(t: Torneo, fecha: string, f: { desde: string; hasta: string }): number[] {
  const todas = t.canchas.map((c) => c.numero);
  if (!partidos(t).some((p) => p.programacion)) return todas;
  return todas.filter((n) => partidosDeTurno(t, { fecha, pista: n, ...f }).length > 0);
}

/**
 * Reparte los turnos entre los árbitros activos: carga pareja, sin dos pistas a la vez,
 * con descanso entre franjas cuando hay árbitros de sobra y, a igual carga, la misma pista
 * que ya conocen. Devuelve un turno por pista y franja con juego.
 */
export function repartirTurnos(t: Torneo, arbitroIds: string[], semilla = 1): TurnoArbitro[] {
  if (!arbitroIds.length) return [];
  const carga = new Map(arbitroIds.map((id) => [id, 0]));
  const ultimaPista = new Map<string, number>();
  let anterior = new Set<string>();
  const out: TurnoArbitro[] = [];
  for (const dia of t.dias) {
    for (const f of franjasDia(dia)) {
      const libres = new Set(arbitroIds);
      const ahora = new Set<string>();
      for (const pista of pistasConJuego(t, dia.fecha, f)) {
        if (!libres.size) break;
        const peso = (id: string) => (carga.get(id) ?? 0) * 10 + (anterior.has(id) ? 3 : 0) - (ultimaPista.get(id) === pista ? 1 : 0);
        const orden = [...libres].sort((a, b) => peso(a) - peso(b) || ((arbitroIds.indexOf(a) + semilla) % arbitroIds.length) - ((arbitroIds.indexOf(b) + semilla) % arbitroIds.length));
        const id = orden[0];
        libres.delete(id);
        ahora.add(id);
        carga.set(id, (carga.get(id) ?? 0) + 1);
        ultimaPista.set(id, pista);
        out.push({ id: `tu-${dia.fecha}-${f.desde.replace(":", "")}-p${pista}`, arbitroId: id, fecha: dia.fecha, pista, desde: f.desde, hasta: f.hasta });
      }
      anterior = ahora;
    }
  }
  return out;
}

/** Turnos de un árbitro, en orden. */
export function turnosDe(t: Torneo, arbitroId: string): TurnoArbitro[] {
  return (t.arbitros?.turnos ?? []).filter((x) => x.arbitroId === arbitroId).sort((a, b) => `${a.fecha}${a.desde}`.localeCompare(`${b.fecha}${b.desde}`));
}

/** Fecha y hora del club (UTC-4) para un instante. */
export function relojClub(ms: number): { fecha: string; hora: string } {
  const iso = new Date(ms - 4 * 3600_000).toISOString();
  return { fecha: iso.slice(0, 10), hora: iso.slice(11, 16) };
}

/**
 * Turno que corre ahora (o el próximo de hoy) para un árbitro: 30 min antes de empezar ya
 * cuenta, y se estira mientras su pista tenga un partido sin terminar de esa franja.
 */
export function turnoActual(t: Torneo, arbitroId: string, ahora: number): TurnoArbitro | null {
  const { fecha, hora } = relojClub(ahora);
  const hoy = turnosDe(t, arbitroId).filter((x) => x.fecha === fecha);
  const m = aMin(hora);
  const corriendo = hoy.find((x) => m >= aMin(x.desde) - 30 && (m < (aMin(x.hasta) || 24 * 60) || partidosDeTurno(t, x).some((p) => p.estado === "EN_JUEGO" || p.estado === "LLAMADO")));
  return corriendo ?? hoy.find((x) => aMin(x.desde) > m) ?? null;
}

/* ---------- sorteo previo (FIP) ---------- */

/** Moneda al aire con el generador criptográfico del dispositivo. */
export function sortear(): Lado {
  const b = new Uint8Array(1);
  globalThis.crypto.getRandomValues(b);
  return b[0] % 2 === 0 ? "A" : "B";
}

export const otroLado = (l: Lado): Lado => (l === "A" ? "B" : "A");

/**
 * Quien gana el sorteo elige sacar, restar o el lado; la otra dupla elige lo que queda
 * (si el ganador eligió saque o resto, la otra elige lado; si eligió lado, la otra elige saque o resto).
 */
export function resolverSorteo(s: {
  gana: Lado;
  eligio: EleccionSorteo;
  /** Lado elegido y quién lo eligió. */
  lado: LadoPista;
  /** Solo si el ganador eligió lado: qué eligió la otra dupla. */
  otraElige?: "SACAR" | "RESTAR";
}): { sacaPrimero: Lado; ladoInicialA: LadoPista } {
  const otra = otroLado(s.gana);
  const eligeLado = s.eligio === "LADO" ? s.gana : otra;
  const ladoInicialA: LadoPista = eligeLado === "A" ? s.lado : s.lado === "IZQ" ? "DER" : "IZQ";
  let sacaPrimero: Lado;
  if (s.eligio === "SACAR") sacaPrimero = s.gana;
  else if (s.eligio === "RESTAR") sacaPrimero = otra;
  else sacaPrimero = s.otraElige === "RESTAR" ? s.gana : otra;
  return { sacaPrimero, ladoInicialA };
}
