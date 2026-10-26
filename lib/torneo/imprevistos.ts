/**
 * Imprevistos del día: lluvia o pistas mojadas, sedes de apoyo y reprogramación automática.
 *
 * - Suspender pistas bloquea esas pistas desde ahora (por un rato o hasta nuevo aviso). Lo que se
 *   estaba jugando ahí queda suspendido con su marcador y se reprograma: sigue donde quedó.
 * - Reanudar libera las pistas desde ahora y vuelve a acomodar todo.
 * - Una sede de apoyo suma pistas de otro club (con su horario y el traslado desde La Marina).
 *   El programador evita que un jugador cambie de sede sin tiempo para llegar.
 */
import type { BloqueHorario, CanchaTorneo, DiaTorneo, PartidoTorneo, SedeTorneo, Torneo } from "@/types/torneo";
import { fechaHoraLocal, programarTorneo, type ResultadoProgramacion } from "./programacion.ts";
import { nuevoId, todosLosPartidos, tocar } from "./torneo.ts";

const PASO_MS = 15 * 60_000;
const redondearArriba = (ms: number) => Math.ceil(ms / PASO_MS) * PASO_MS;

export interface ResultadoImprevisto {
  torneo: Torneo;
  /** Partidos que se estaban jugando o estaban llamados y quedaron suspendidos. */
  suspendidos: string[];
  programacion: ResultadoProgramacion;
}

/** Pista donde está (o va a estar) un partido. */
export const pistaDe = (p: PartidoTorneo) => p.pistaReal ?? p.programacion?.pista ?? null;

export function nombrePista(t: Pick<Torneo, "canchas" | "sedes">, numero?: number | null): string {
  const c = t.canchas.find((x) => x.numero === numero);
  if (!c) return numero ? `Pista ${numero}` : "—";
  const sede = c.sedeId ? t.sedes?.find((s) => s.id === c.sedeId) : null;
  return sede ? `${c.nombre} · ${sede.nombre}` : c.nombre;
}

/** Etiqueta corta: "P3" en La Marina, "Club Lechería P2" en una sede de apoyo. */
export function pistaCorta(t: Pick<Torneo, "canchas" | "sedes">, numero?: number | null): string {
  const c = t.canchas.find((x) => x.numero === numero);
  const sede = c?.sedeId ? t.sedes?.find((s) => s.id === c.sedeId) : null;
  return sede ? `${sede.nombre} P${(numero ?? 0) % 100}` : `P${numero ?? "?"}`;
}

/** "todas las pistas", "las pistas exteriores" o la lista por nombre. */
export function textoPistas(t: Pick<Torneo, "canchas" | "sedes">, numeros: number[]): string {
  const activas = t.canchas.filter((c) => c.activa);
  const set = new Set(numeros);
  if (activas.length > 1 && activas.every((c) => set.has(c.numero))) return "todas las pistas";
  const exteriores = activas.filter((c) => !c.techada);
  if (exteriores.length > 1 && exteriores.length === set.size && exteriores.every((c) => set.has(c.numero))) return "las pistas al aire libre";
  return numeros.map((n) => nombrePista(t, n)).join(", ");
}

export function sedeDePista(t: Pick<Torneo, "canchas" | "sedes">, numero?: number | null): SedeTorneo | null {
  const c = t.canchas.find((x) => x.numero === numero);
  return (c?.sedeId && t.sedes?.find((s) => s.id === c.sedeId)) || null;
}

/** Bloqueos para `pistas` entre `desde` y `hasta` (o hasta el final del torneo), día por día. */
function bloqueosEntre(dias: DiaTorneo[], pistas: number[], desde: number, hasta: number | null, motivo: string, suspensionId: string): BloqueHorario[] {
  const out: BloqueHorario[] = [];
  const ini = fechaHoraLocal(desde);
  const fin = hasta === null ? null : fechaHoraLocal(hasta);
  for (const d of dias) {
    if (d.fecha < ini.fecha || (fin && d.fecha > fin.fecha)) continue;
    const inicio = d.fecha === ini.fecha ? ini.hora : "00:00";
    const termina = fin && d.fecha === fin.fecha ? fin.hora : "23:59";
    if (termina <= inicio) continue;
    for (const pista of pistas) out.push({ fecha: d.fecha, inicio, fin: termina, pista, motivo, suspensionId });
  }
  return out;
}

/**
 * Suspende pistas (lluvia, pista mojada, falla de luz…). Lo que estaba en juego o llamado en esas
 * pistas se suspende conservando el marcador, y todo lo pendiente se reprograma desde ahora.
 */
export function suspenderPistas(
  t: Torneo,
  opts: { pistas: number[]; motivo: string; ahora?: number; hastaMs?: number | null; marcadores?: Record<string, string>; por?: string },
): ResultadoImprevisto {
  const ahora = opts.ahora ?? Date.now();
  const suspensionId = nuevoId("s-");
  const pistas = new Set(opts.pistas);
  const hasta = opts.hastaMs == null ? null : redondearArriba(opts.hastaMs);
  const bloqueos = bloqueosEntre(t.dias, opts.pistas, ahora, hasta, opts.motivo, suspensionId);
  const suspendidos: string[] = [];
  const en = new Date(ahora).toISOString();
  let out: Torneo = {
    ...t,
    bloqueos: [...t.bloqueos, ...bloqueos],
    categorias: t.categorias.map((c) =>
      c.cuadro
        ? {
            ...c,
            cuadro: {
              ...c.cuadro,
              partidos: c.cuadro.partidos.map((p) => {
                if ((p.estado !== "EN_JUEGO" && p.estado !== "LLAMADO") || !pistas.has(pistaDe(p) ?? -1)) return p;
                if (p.estado === "EN_JUEGO") suspendidos.push(p.id);
                return {
                  ...p,
                  estado: "PENDIENTE" as const,
                  llamadoEn: null,
                  pistaReal: null,
                  programacion: p.programacion ? { ...p.programacion, fijo: false } : p.programacion,
                  suspendido: p.estado === "EN_JUEGO" ? { en, motivo: opts.motivo, marcador: opts.marcadores?.[p.id] } : p.suspendido ?? null,
                  actualizadoEn: en,
                };
              }),
            },
          }
        : c,
    ),
  };
  const lista = textoPistas(t, opts.pistas);
  out = tocar(out, `${opts.motivo}: se suspenden ${lista}${suspendidos.length ? ` (${suspendidos.length} partido${suspendidos.length > 1 ? "s" : ""} interrumpido${suspendidos.length > 1 ? "s" : ""})` : ""}.`, opts.por);
  const programacion = programarTorneo(out, { desde: new Date(redondearArriba(ahora)).toISOString() });
  return { torneo: programacion.torneo, suspendidos, programacion };
}

/** Suspensiones activas o futuras (agrupadas), para mostrar y reanudar. */
export function suspensionesActivas(t: Torneo, ahora = Date.now()): { id: string; motivo: string; pistas: number[]; hasta: string | null }[] {
  const hoy = fechaHoraLocal(ahora);
  const grupos = new Map<string, BloqueHorario[]>();
  for (const b of t.bloqueos) {
    if (!b.suspensionId) continue;
    if (b.fecha < hoy.fecha || (b.fecha === hoy.fecha && b.fin <= hoy.hora)) continue;
    grupos.set(b.suspensionId, [...(grupos.get(b.suspensionId) ?? []), b]);
  }
  const ultimoDia = [...t.dias].map((d) => d.fecha).sort().at(-1);
  return [...grupos].map(([id, bs]) => {
    const ultimo = bs.reduce((a, b) => (`${b.fecha} ${b.fin}` > `${a.fecha} ${a.fin}` ? b : a));
    const indefinida = ultimo.fecha === ultimoDia && ultimo.fin === "23:59";
    return { id, motivo: bs[0].motivo ?? "Suspensión", pistas: [...new Set(bs.map((b) => b.pista!))].sort((a, b) => a - b), hasta: indefinida ? null : `${ultimo.fecha}T${ultimo.fin}` };
  });
}

/** Reanuda una suspensión desde ahora y reprograma lo pendiente. */
export function reanudarPistas(t: Torneo, suspensionId: string, opts: { ahora?: number; por?: string } = {}): ResultadoImprevisto {
  const ahora = opts.ahora ?? Date.now();
  const { fecha, hora } = fechaHoraLocal(ahora);
  const bloqueos = t.bloqueos.flatMap((b) => {
    if (b.suspensionId !== suspensionId) return [b];
    if (b.fecha > fecha || (b.fecha === fecha && b.inicio >= hora)) return []; // no empezó: se quita
    if (b.fecha === fecha && b.fin > hora) return [{ ...b, fin: hora }]; // en curso: termina ahora
    return [b]; // ya pasó: queda como registro
  });
  const motivo = t.bloqueos.find((b) => b.suspensionId === suspensionId)?.motivo ?? "Suspensión";
  const out = tocar({ ...t, bloqueos }, `Se reanudan las pistas (${motivo.toLowerCase()}).`, opts.por);
  const programacion = programarTorneo(out, { desde: new Date(redondearArriba(ahora)).toISOString() });
  return { torneo: programacion.torneo, suspendidos: [], programacion };
}

/** Partidos suspendidos que esperan reanudarse. */
export const partidosSuspendidos = (t: Torneo) => todosLosPartidos(t).filter((p) => p.suspendido && p.estado === "PENDIENTE");

/* ---------- sedes ---------- */

export interface NuevaSedeInput {
  nombre: string;
  direccion?: string;
  pistas: number;
  techadas: boolean;
  trasladoMin: number;
  horarios?: DiaTorneo[];
  provisional?: boolean;
}

/** Suma un club como sede: sus pistas se numeran aparte (101, 102… / 201, 202…) para no confundirlas. */
export function agregarSede(t: Torneo, input: NuevaSedeInput, por?: string): Torneo {
  const sede: SedeTorneo = {
    id: nuevoId("sede-"),
    nombre: input.nombre.trim() || "Sede de apoyo",
    direccion: input.direccion?.trim() || undefined,
    trasladoMin: Math.max(0, input.trasladoMin),
    horarios: input.horarios,
    provisional: input.provisional,
  };
  const base = (Math.floor(Math.max(0, ...t.canchas.map((c) => c.numero)) / 100) + 1) * 100;
  const canchas: CanchaTorneo[] = Array.from({ length: Math.max(1, input.pistas) }, (_, i) => ({
    numero: base + i + 1,
    nombre: `Pista ${i + 1}`,
    techada: input.techadas,
    activa: true,
    sedeId: sede.id,
  }));
  return tocar(
    { ...t, sedes: [...(t.sedes ?? []), sede], canchas: [...t.canchas, ...canchas] },
    `Nueva sede${input.provisional ? " provisional" : ""}: ${sede.nombre} (${canchas.length} pista${canchas.length > 1 ? "s" : ""}).`,
    por,
  );
}

/**
 * Deja de usar una sede. Sus pistas quedan desactivadas (lo jugado ahí conserva su registro) y lo
 * pendiente se reprograma. No se puede mientras haya partidos en juego o llamados ahí.
 */
export function quitarSede(t: Torneo, sedeId: string, opts: { ahora?: number; por?: string } = {}): ResultadoImprevisto | { error: string } {
  const pistas = new Set(t.canchas.filter((c) => c.sedeId === sedeId).map((c) => c.numero));
  const ocupada = todosLosPartidos(t).find((p) => (p.estado === "EN_JUEGO" || p.estado === "LLAMADO") && pistas.has(pistaDe(p) ?? -1));
  if (ocupada) return { error: `Hay un partido ${ocupada.estado === "EN_JUEGO" ? "en juego" : "llamado"} en esa sede (${ocupada.etiqueta}).` };
  const sede = t.sedes?.find((s) => s.id === sedeId);
  const out = tocar({ ...t, canchas: t.canchas.map((c) => (c.sedeId === sedeId ? { ...c, activa: false } : c)) }, `Se deja de usar la sede ${sede?.nombre ?? ""}.`, opts.por);
  const programacion = programarTorneo(out, { desde: new Date(redondearArriba(opts.ahora ?? Date.now())).toISOString() });
  return { torneo: programacion.torneo, suspendidos: [], programacion };
}
