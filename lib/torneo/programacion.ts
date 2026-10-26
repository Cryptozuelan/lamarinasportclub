/**
 * Programación automática: reparte los partidos en los días, horas y pistas del torneo.
 *
 * Reglas:
 * - Cada pista, una cosa a la vez; se respetan franjas bloqueadas y la disponibilidad de cada dupla.
 * - Nadie juega dos partidos sin el descanso mínimo (también si está en dos categorías).
 * - Un partido de llave va después de los partidos de los que sale cada lado (+ descanso).
 * - Las categorías avanzan parejas: se intercalan jornada por jornada.
 * - Semis y finales el último día (opcional) y en las pistas principales.
 * - Lo ya jugado, en juego o fijado a mano no se mueve.
 *
 * El tiempo se maneja en minutos absolutos: díaÍndice * 1440 + minutos del día.
 */
import type { PartidoTorneo, Programacion, Torneo } from "@/types/torneo";
import { aHora, aMinutos } from "../horarios.ts";
import { categoria, faseReglas } from "./torneo.ts";

const PASO = 15;
const DIA = 1440;

interface Intervalo {
  ini: number;
  fin: number;
  /** Sede donde se juega (para sumar el traslado al descanso). */
  sede?: string;
}

const choca = (lista: Intervalo[], ini: number, fin: number) => lista.some((x) => ini < x.fin && x.ini < fin);

export interface ResultadoProgramacion {
  torneo: Torneo;
  programados: number;
  /** Partidos que no entraron en los días elegidos. */
  sinLugar: string[];
  /** Horas de pista que faltan para que entre todo. */
  horasFaltantes: number;
  /** Hora en que termina el último partido, por día. */
  finPorDia: Record<string, string>;
}

export interface OpcionesProgramacion {
  /** Reprogramar solo desde este momento (ISO). Lo anterior queda como está. */
  desde?: string;
  /** Incluye categorías sorteadas aunque no estén publicadas (vista previa del Sorteo). */
  incluirBorradores?: boolean;
}

export function programarTorneo(t: Torneo, opts: OpcionesProgramacion = {}): ResultadoProgramacion {
  const dias = [...t.dias].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const idxDia = new Map(dias.map((d, i) => [d.fecha, i]));
  const ventanas: Intervalo[] = dias.map((d, i) => ({ ini: i * DIA + aMinutos(d.inicio), fin: i * DIA + aMinutos(d.fin) }));
  // Pistas de la sede principal primero: ahí caen las finales y lo que más se ve.
  const canchas = t.canchas.filter((c) => c.activa).sort((a, b) => Number(!!a.sedeId) - Number(!!b.sedeId));
  const sedes = new Map((t.sedes ?? []).map((s) => [s.id, s]));
  const sedeDe = new Map(canchas.map((c) => [c.numero, c.sedeId ?? ""]));
  const trasladoA = (sede: string) => sedes.get(sede)?.trasladoMin ?? 0;
  /** Descanso necesario entre dos partidos de un jugador según dónde se juega cada uno. */
  const descansoEntre = (a: string, b: string) => t.descansoMin + (a === b ? 0 : trasladoA(a) + trasladoA(b));
  const abs = (fecha: string, hora: string) => (idxDia.get(fecha) ?? -1) * DIA + aMinutos(hora);
  const desde = opts.desde ? aAbsoluto(opts.desde, idxDia) : -Infinity;

  const ocupPista = new Map<number, Intervalo[]>(canchas.map((c) => [c.numero, []]));
  const ocupJugador = new Map<string, Intervalo[]>();
  const finDe = new Map<string, number>();
  const ocupar = (jug: string[], iv: Intervalo) => {
    for (const j of jug) ocupJugador.set(j, [...(ocupJugador.get(j) ?? []), iv]);
  };

  for (const b of t.bloqueos) {
    const iv = { ini: abs(b.fecha, b.inicio), fin: abs(b.fecha, b.fin) };
    if (iv.ini < 0) continue;
    for (const c of canchas) if (!b.pista || b.pista === c.numero) ocupPista.get(c.numero)!.push(iv);
  }
  // Sedes de apoyo con su propio horario: fuera de él, sus pistas no están.
  for (const c of canchas) {
    const horarios = c.sedeId ? sedes.get(c.sedeId)?.horarios : undefined;
    if (!horarios) continue;
    dias.forEach((d, i) => {
      const h = horarios.find((x) => x.fecha === d.fecha);
      const lista = ocupPista.get(c.numero)!;
      if (!h) lista.push({ ini: i * DIA, fin: (i + 1) * DIA });
      else lista.push({ ini: i * DIA, fin: i * DIA + aMinutos(h.inicio) }, { ini: i * DIA + aMinutos(h.fin), fin: (i + 1) * DIA });
    });
  }

  const cats = t.categorias.filter((c) => c.cuadro && (c.cuadro.publicado || opts.incluirBorradores));
  const jugadoresDe = (catId: string, duplaId: string | null) => {
    if (!duplaId) return [];
    return categoria(t, catId)?.duplas.find((d) => d.id === duplaId)?.jugadorIds ?? [];
  };
  const noDisponible = (catId: string, duplaId: string | null): Intervalo[] => {
    if (!duplaId) return [];
    const d = categoria(t, catId)?.duplas.find((x) => x.id === duplaId);
    return (d?.noDisponible ?? []).map((b) => ({ ini: abs(b.fecha, b.inicio), fin: abs(b.fecha, b.fin) })).filter((x) => x.ini >= 0);
  };

  const duracion = (p: PartidoTorneo) => {
    const c = categoria(t, p.categoriaId)!;
    return c.reglas[faseReglas(c, p)].minutos;
  };

  // 1) Lo que no se mueve ocupa su lugar.
  const aProgramar: PartidoTorneo[] = [];
  for (const c of cats) {
    for (const p of c.cuadro!.partidos) {
      if (p.bye) continue;
      const prog = p.programacion;
      const ini = prog ? abs(prog.fecha, prog.hora) : -1;
      // Lo pendiente se puede mover (también lo atrasado o suspendido); lo fijado a mano no, salvo que se haya suspendido.
      const fijo = p.estado !== "PENDIENTE" || (prog?.fijo && !p.suspendido);
      if (fijo && prog && ini >= 0) {
        const fin = p.finEn && p.estado === "FINALIZADO" ? Math.max(ini + 30, aAbsoluto(p.finEn, idxDia)) : ini + duracion(p);
        const iv = { ini, fin, sede: sedeDe.get(p.pistaReal ?? prog.pista) ?? "" };
        ocupPista.get(p.pistaReal ?? prog.pista)?.push(iv);
        ocupar([...jugadoresDe(c.categoria.id, p.duplaA), ...jugadoresDe(c.categoria.id, p.duplaB)], iv);
        finDe.set(p.id, fin);
      } else if (p.estado === "FINALIZADO") {
        finDe.set(p.id, -Infinity);
      } else {
        aProgramar.push(p);
      }
    }
  }

  // 2) Prioridad: jornada de grupos, luego rondas de llave; categorías intercaladas.
  const maxJornada = Math.max(0, ...cats.flatMap((c) => c.cuadro!.partidos.filter((p) => p.fase === "GRUPOS").map((p) => p.ronda)));
  const ordenCat = new Map(cats.map((c, i) => [c.categoria.id, i]));
  const nivel = (p: PartidoTorneo) => (p.fase === "GRUPOS" ? p.ronda : maxJornada + p.ronda + (p.cuadro === "CONSOLACION" ? 0.5 : 0) + (p.tercerPuesto ? 0.1 : 0));
  aProgramar.sort(
    (a, b) => nivel(a) - nivel(b) || (a.posicion ?? 0) - (b.posicion ?? 0) || ordenCat.get(a.categoriaId)! - ordenCat.get(b.categoriaId)! || a.id.localeCompare(b.id),
  );

  // Dependencias: de qué partidos sale cada lado.
  const porId = new Map(cats.flatMap((c) => c.cuadro!.partidos).map((p) => [p.id, p]));
  const gruposDe = new Map<string, PartidoTorneo[]>();
  for (const p of porId.values()) if (p.fase === "GRUPOS") gruposDe.set(`${p.categoriaId}|${p.grupoId}`, [...(gruposDe.get(`${p.categoriaId}|${p.grupoId}`) ?? []), p]);
  const finDependencias = (p: PartidoTorneo, visto = new Set<string>()): number => {
    let max = -Infinity;
    for (const o of [p.origenA, p.origenB]) {
      if (o.tipo === "GANADOR" || o.tipo === "PERDEDOR") {
        const dep = porId.get(o.partidoId);
        if (!dep || visto.has(dep.id)) continue;
        visto.add(dep.id);
        const f = dep.bye ? finDependencias(dep, visto) : (finDe.get(dep.id) ?? Infinity);
        max = Math.max(max, f);
      } else if (o.tipo === "GRUPO") {
        for (const g of gruposDe.get(`${p.categoriaId}|${o.grupoId}`) ?? []) max = Math.max(max, finDe.get(g.id) ?? Infinity);
      }
    }
    return max;
  };

  const ultimoDia = ventanas.length - 1;
  const esFinalDeLlave = (p: PartidoTorneo) => {
    if (p.fase !== "LLAVE" || p.cuadro === "CONSOLACION") return false;
    const c = categoria(t, p.categoriaId)!;
    return faseReglas(c, p) === "SEMIS_FINAL";
  };

  const sinLugar: string[] = [];
  const nuevas = new Map<string, Programacion>();
  let minutosSinLugar = 0;

  for (const p of aProgramar) {
    const dur = duracion(p);
    const dep = finDependencias(p);
    if (dep === Infinity) {
      sinLugar.push(p.id);
      minutosSinLugar += dur;
      continue;
    }
    let minimo = Math.max(desde, dep > -Infinity ? dep + t.descansoMin : -Infinity);
    if (t.finalesUltimoDia && esFinalDeLlave(p) && ventanas[ultimoDia]) minimo = Math.max(minimo, ventanas[ultimoDia].ini);
    const jug = [...jugadoresDe(p.categoriaId, p.duplaA), ...jugadoresDe(p.categoriaId, p.duplaB)];
    const indisp = [...noDisponible(p.categoriaId, p.duplaA), ...noDisponible(p.categoriaId, p.duplaB)];
    // Pistas en orden de prioridad: la principal primero (ahí caen las finales).
    const ordenPistas = canchas.map((c) => c.numero);

    let elegido: { ini: number; pista: number } | null = null;
    for (const v of ventanas) {
      if (elegido) break;
      let ini = Math.max(v.ini, Math.ceil(minimo / PASO) * PASO);
      // alinear al paso desde el inicio del día
      if (ini > v.ini) ini = v.ini + Math.ceil((ini - v.ini) / PASO) * PASO;
      for (; ini + dur <= v.fin; ini += PASO) {
        const fin = ini + dur;
        if (choca(indisp, ini, fin)) continue;
        const pista = ordenPistas.find((n) => {
          if (choca(ocupPista.get(n)!, ini, fin)) return false;
          const sede = sedeDe.get(n) ?? "";
          return !jug.some((j) => (ocupJugador.get(j) ?? []).some((x) => {
            const r = descansoEntre(x.sede ?? "", sede);
            return ini < x.fin + r && x.ini - r < fin;
          }));
        });
        if (pista !== undefined) {
          elegido = { ini, pista };
          break;
        }
      }
    }
    if (!elegido) {
      sinLugar.push(p.id);
      minutosSinLugar += dur;
      finDe.set(p.id, Infinity);
      continue;
    }
    const iv = { ini: elegido.ini, fin: elegido.ini + dur, sede: sedeDe.get(elegido.pista) ?? "" };
    ocupPista.get(elegido.pista)!.push(iv);
    ocupar(jug, iv);
    finDe.set(p.id, iv.fin);
    const d = Math.floor(elegido.ini / DIA);
    nuevas.set(p.id, { fecha: dias[d].fecha, hora: aHora(elegido.ini - d * DIA), pista: elegido.pista });
  }

  const finPorDia: Record<string, string> = {};
  for (const [id, f] of finDe) {
    if (!Number.isFinite(f) || !porId.has(id)) continue;
    const d = Math.floor(f / DIA);
    if (!dias[d]) continue;
    const h = aHora(f - d * DIA);
    if (!finPorDia[dias[d].fecha] || h > finPorDia[dias[d].fecha]) finPorDia[dias[d].fecha] = h;
  }

  const torneo: Torneo = {
    ...t,
    categorias: t.categorias.map((c) =>
      c.cuadro && cats.includes(c)
        ? {
            ...c,
            cuadro: {
              ...c.cuadro,
              partidos: c.cuadro.partidos.map((p) =>
                nuevas.has(p.id) ? { ...p, programacion: nuevas.get(p.id)! } : sinLugar.includes(p.id) ? { ...p, programacion: null } : p,
              ),
            },
          }
        : c,
    ),
  };
  return {
    torneo,
    programados: nuevas.size,
    sinLugar,
    horasFaltantes: Math.ceil(minutosSinLugar / Math.max(1, canchas.length) / 6) / 10,
    finPorDia,
  };
}

/** Fecha y hora locales (del dispositivo, como el resto de la programación) de un instante. */
export function fechaHoraLocal(ms: number): { fecha: string; hora: string } {
  const d = new Date(ms);
  const dos = (n: number) => String(n).padStart(2, "0");
  return { fecha: `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`, hora: `${dos(d.getHours())}:${dos(d.getMinutes())}` };
}

/** ISO → minutos absolutos según los días del torneo (hora local del dispositivo). */
function aAbsoluto(iso: string, idxDia: Map<string, number>): number {
  const d = new Date(iso);
  const fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const i = idxDia.get(fecha);
  const min = d.getHours() * 60 + d.getMinutes();
  if (i !== undefined) return i * DIA + min;
  // Fuera de los días del torneo: antes del primero o después del último.
  const fechas = [...idxDia.keys()].sort();
  return fecha < fechas[0] ? -Infinity : fechas.length * DIA;
}

/* ---------- día del torneo: cero demoras ---------- */

export interface EstadoPista {
  numero: number;
  nombre: string;
  enJuego: PartidoTorneo | null;
  llamado: PartidoTorneo | null;
  siguiente: PartidoTorneo | null;
  /** Sede de apoyo (vacío = club organizador). */
  sede: string | null;
  /** Pista suspendida ahora (lluvia, mantenimiento…): motivo. */
  suspendida: string | null;
}

/** ¿Los 4 jugadores están libres ahora (no juegan ni están llamados en otra pista)? */
function libres(t: Torneo, p: PartidoTorneo, ocupados: Set<string>): boolean {
  const c = categoria(t, p.categoriaId);
  const ids = [p.duplaA, p.duplaB].flatMap((d) => c?.duplas.find((x) => x.id === d)?.jugadorIds ?? []);
  return ids.length === 4 && ids.every((j) => !ocupados.has(j));
}

/** Partidos listos para jugar (ambas duplas conocidas, no jugados), en orden de programación. */
export function partidosListos(t: Torneo): PartidoTorneo[] {
  return t.categorias
    .filter((c) => c.cuadro?.publicado)
    .flatMap((c) => c.cuadro!.partidos)
    .filter((p) => !p.bye && p.estado === "PENDIENTE" && p.duplaA && p.duplaB)
    .sort((a, b) => claveProg(a).localeCompare(claveProg(b)));
}

const claveProg = (p: PartidoTorneo) => (p.programacion ? `${p.programacion.fecha} ${p.programacion.hora} ${p.programacion.pista}` : "~");

/**
 * Qué pasa en cada pista ahora y cuál es el siguiente partido. Si una pista queda libre
 * antes de hora, se le asigna el próximo partido listo cuyos jugadores estén libres
 * (de cualquier categoría): así se recupera tiempo en vez de esperar.
 */
export function estadoPistas(t: Torneo, ahora = Date.now()): EstadoPista[] {
  const { fecha, hora } = fechaHoraLocal(ahora);
  const bloqueoAhora = (n: number) => t.bloqueos.find((b) => b.fecha === fecha && b.inicio <= hora && hora < b.fin && (!b.pista || b.pista === n));
  const partidos = t.categorias.filter((c) => c.cuadro?.publicado).flatMap((c) => c.cuadro!.partidos);
  const ocupados = new Set<string>();
  for (const p of partidos) {
    if (p.estado !== "EN_JUEGO" && p.estado !== "LLAMADO") continue;
    const c = categoria(t, p.categoriaId);
    for (const d of [p.duplaA, p.duplaB]) for (const j of c?.duplas.find((x) => x.id === d)?.jugadorIds ?? []) ocupados.add(j);
  }
  const listos = partidosListos(t);
  const asignados = new Set<string>();
  return t.canchas
    .filter((c) => c.activa)
    .map((c) => {
      const pistaDe = (p: PartidoTorneo) => p.pistaReal ?? p.programacion?.pista;
      const enJuego = partidos.find((p) => p.estado === "EN_JUEGO" && pistaDe(p) === c.numero) ?? null;
      const llamado = partidos.find((p) => p.estado === "LLAMADO" && pistaDe(p) === c.numero) ?? null;
      const sede = c.sedeId ? (t.sedes?.find((s) => s.id === c.sedeId) ?? null) : null;
      const bloqueo = bloqueoAhora(c.numero);
      // Primero el programado para esta pista; si sus jugadores no están libres, el siguiente listo
      // de la misma sede (nadie cambia de club sin tiempo de traslado). Una pista suspendida no recibe partidos.
      const mismaSede = (p: PartidoTorneo) => (t.canchas.find((x) => x.numero === p.programacion?.pista)?.sedeId ?? "") === (c.sedeId ?? "");
      const candidatos = bloqueo ? [] : [...listos.filter((p) => p.programacion?.pista === c.numero), ...listos.filter(mismaSede)];
      const siguiente = candidatos.find((p) => !asignados.has(p.id) && libres(t, p, ocupados)) ?? null;
      if (siguiente) asignados.add(siguiente.id);
      return { numero: c.numero, nombre: c.nombre, enJuego, llamado, siguiente, sede: sede?.nombre ?? null, suspendida: bloqueo ? (bloqueo.motivo ?? "Suspendida") : null };
    });
}

/** Minutos de atraso del torneo: cuánto después de lo programado empezaron los partidos de hoy. */
export function atrasoMinutos(t: Torneo, ahora = new Date()): number {
  const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;
  const min = ahora.getHours() * 60 + ahora.getMinutes();
  let atraso = 0;
  for (const p of t.categorias.flatMap((c) => c.cuadro?.partidos ?? [])) {
    if (p.bye || !p.programacion || p.programacion.fecha !== hoy) continue;
    const prog = aMinutos(p.programacion.hora);
    if (p.inicioEn) {
      const i = new Date(p.inicioEn);
      atraso = Math.max(atraso, i.getHours() * 60 + i.getMinutes() - prog);
    } else if (p.estado === "PENDIENTE" || p.estado === "LLAMADO") {
      atraso = Math.max(atraso, min - prog);
    }
  }
  return Math.max(0, atraso);
}

/**
 * Momento (ms) desde el que se puede dar W.O. a un partido llamado (FIP Regla 2.1: 10 minutos
 * después de la hora prevista). La hora prevista es la programada, pero si la pista se liberó
 * más tarde cuenta como prevista 5 minutos después de que terminó el partido anterior (FIP Regla 2,
 * Caso 1). Y si se lo llamó más tarde todavía, desde el llamado: nadie pierde por llegar a su hora.
 */
export function limiteWO(t: Pick<Torneo, "toleranciaWO"> & Partial<Pick<Torneo, "categorias">>, p: PartidoTorneo): number | null {
  if (!p.llamadoEn) return null;
  const llamado = new Date(p.llamadoEn).getTime();
  const programado = p.programacion ? new Date(`${p.programacion.fecha}T${p.programacion.hora}:00`).getTime() : 0;
  const pista = p.pistaReal ?? p.programacion?.pista;
  let finAnterior = 0;
  if (pista != null && t.categorias) {
    for (const x of t.categorias.flatMap((c) => c.cuadro?.partidos ?? [])) {
      if (x.id === p.id || !x.finEn || (x.pistaReal ?? x.programacion?.pista) !== pista) continue;
      const fin = new Date(x.finEn).getTime();
      if (fin <= llamado) finAnterior = Math.max(finAnterior, fin);
    }
  }
  const prevista = Math.max(programado, finAnterior ? finAnterior + 5 * 60_000 : 0);
  return Math.max(llamado, prevista) + t.toleranciaWO * 60_000;
}

/** Partidos llamados que ya superaron la tolerancia de W.O. */
export function vencidosWO(t: Torneo, ahora = Date.now()): PartidoTorneo[] {
  return t.categorias
    .flatMap((c) => c.cuadro?.partidos ?? [])
    .filter((p) => p.estado === "LLAMADO" && (limiteWO(t, p) ?? Infinity) < ahora);
}

