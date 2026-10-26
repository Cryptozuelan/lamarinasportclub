/**
 * Operaciones puras sobre un Torneo. La UI y la API comparten estas funciones.
 *
 * El cuadro se "resuelve" después de cada cambio (`resolverCuadro`): las llaves
 * toman a los clasificados de los grupos, los byes avanzan solos y los W.O. de
 * duplas retiradas se aplican sin que el staff toque nada.
 */
import type {
  BloqueHorario,
  CategoriaEnTorneo,
  CategoriaTorneo,
  ConfigCuadro,
  Cuadro,
  DiaTorneo,
  Dupla,
  FaseReglas,
  JugadorTorneo,
  Origen,
  PartidoTorneo,
  ReglasPartido,
  ResultadoTorneo,
  Torneo,
} from "@/types/torneo";
import type { PistaClub, SetScore } from "@/types/americano";
import { CONFIG_CUADRO_BASE, nombreCategoria, reglasPorDefecto } from "./categorias.ts";
import { duplasActivas, proponerFormato, sortear } from "./cuadro.ts";
import { CRITERIOS_POR_DEFECTO, calcularTablaGrupo, resultadoWO, type TablaGrupo } from "./tabla.ts";

export const nuevoId = (prefijo = "") =>
  prefijo + (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));

/** ISO estrictamente posterior a `previa` (relojes de dispositivos distintos). */
export function despues(previa?: string | null): string {
  const ahora = new Date().toISOString();
  if (!previa || ahora > previa) return ahora;
  return new Date(new Date(previa).getTime() + 1).toISOString();
}

export function tocar(t: Torneo, texto?: string, por?: string): Torneo {
  const en = despues(t.actualizadoEn);
  const historial = texto ? [...(t.historial ?? []), { en, por, texto }].slice(-300) : t.historial;
  return { ...t, actualizadoEn: en, historial };
}

/* ---------- creación ---------- */

export interface NuevoTorneoInput {
  nombre: string;
  clubId?: string;
  dias: DiaTorneo[];
  canchas: PistaClub[];
  categorias: CategoriaTorneo[];
  descansoMin?: number;
  toleranciaWO?: number;
  finalesUltimoDia?: boolean;
}

export function nuevaCategoria(c: CategoriaTorneo): CategoriaEnTorneo {
  return { categoria: c, duplas: [], config: { ...CONFIG_CUADRO_BASE }, reglas: reglasPorDefecto(), cuadro: null };
}

export function crearTorneo(input: NuevoTorneoInput): Torneo {
  const ahora = new Date().toISOString();
  return {
    id: nuevoId("t-"),
    clubId: input.clubId ?? "la-marina",
    nombre: input.nombre.trim() || "Torneo La Marina",
    dias: [...input.dias].sort((a, b) => a.fecha.localeCompare(b.fecha)),
    canchas: input.canchas,
    descansoMin: input.descansoMin ?? 45,
    toleranciaWO: input.toleranciaWO ?? 10, // FIP Regla 2.1
    finalesUltimoDia: input.finalesUltimoDia ?? true,
    bloqueos: [],
    criterios: CRITERIOS_POR_DEFECTO.map((c) => ({ ...c })),
    jugadores: [],
    categorias: input.categorias.map(nuevaCategoria),
    estado: "INSCRIPCION",
    historial: [{ en: ahora, texto: "Torneo creado" }],
    creadoEn: ahora,
    actualizadoEn: ahora,
  };
}

export const anioTorneo = (t: Torneo) => Number((t.dias[0]?.fecha ?? new Date().toISOString()).slice(0, 4));

/* ---------- consultas ---------- */

export function categoria(t: Torneo, categoriaId: string): CategoriaEnTorneo | undefined {
  return t.categorias.find((c) => c.categoria.id === categoriaId);
}

export function jugador(t: Torneo, id?: string | null): JugadorTorneo | undefined {
  return id ? t.jugadores.find((j) => j.id === id) : undefined;
}

export const nombreJugador = (j?: JugadorTorneo) => (j ? [j.nombre, j.apellido].filter(Boolean).join(" ") : "—");

/** Apellidos (o nombres) de la dupla: "García / Pérez". */
export function nombreDupla(t: Torneo, d?: Dupla | null): string {
  if (!d) return "Por definir";
  return d.jugadorIds.map((id) => {
    const j = jugador(t, id);
    return j ? j.apellido?.trim() || j.nombre : "?";
  }).join(" / ");
}

export function dupla(t: Torneo, id?: string | null): Dupla | undefined {
  if (!id) return undefined;
  for (const c of t.categorias) {
    const d = c.duplas.find((x) => x.id === id);
    if (d) return d;
  }
  return undefined;
}

export function todosLosPartidos(t: Torneo): PartidoTorneo[] {
  return t.categorias.flatMap((c) => c.cuadro?.partidos ?? []);
}

export function partido(t: Torneo, id: string): PartidoTorneo | undefined {
  for (const c of t.categorias) {
    const p = c.cuadro?.partidos.find((x) => x.id === id);
    if (p) return p;
  }
  return undefined;
}

/** Fase de reglas de un partido: grupos, llave o semis/final. */
export function faseReglas(c: CategoriaEnTorneo, p: PartidoTorneo): FaseReglas {
  if (p.fase === "GRUPOS") return "GRUPOS";
  const rondas = Math.max(...(c.cuadro?.partidos.filter((x) => x.fase === "LLAVE" && x.cuadro === p.cuadro).map((x) => x.ronda) ?? [1]));
  return p.cuadro !== "CONSOLACION" && p.ronda >= rondas - 1 ? "SEMIS_FINAL" : "LLAVE";
}

export function reglasDe(t: Torneo, p: PartidoTorneo): ReglasPartido {
  const c = categoria(t, p.categoriaId)!;
  return c.reglas[faseReglas(c, p)];
}

export function tablasCategoria(t: Torneo, c: CategoriaEnTorneo): TablaGrupo[] {
  if (!c.cuadro) return [];
  return c.cuadro.grupos.map((g) =>
    calcularTablaGrupo(g, c.cuadro!.partidos, c.duplas, {
      nombre: (id) => nombreDupla(t, c.duplas.find((d) => d.id === id)),
      criterios: t.criterios,
      superTie: c.reglas.GRUPOS.sets === 3 && c.reglas.GRUPOS.superTie,
      sorteo: c.cuadro!.sorteosDesempate,
      semilla: c.cuadro!.semilla,
    }),
  );
}

export function ganadorPartido(p: PartidoTorneo): string | null {
  if (p.estado !== "FINALIZADO") return null;
  if (p.bye) return p.duplaA ?? p.duplaB;
  if (!p.resultado) return null;
  return p.resultado.ganador === "A" ? p.duplaA : p.duplaB;
}

export function perdedorPartido(p: PartidoTorneo): string | null {
  if (p.estado !== "FINALIZADO" || p.bye || !p.resultado) return null;
  return p.resultado.ganador === "A" ? p.duplaB : p.duplaA;
}

export type EstadoCategoria = "INSCRIPCION" | "SORTEADA" | "PUBLICADA" | "EN_JUEGO" | "FINALIZADA";

export function estadoCategoria(c: CategoriaEnTorneo): EstadoCategoria {
  if (!c.cuadro) return "INSCRIPCION";
  if (!c.cuadro.publicado) return "SORTEADA";
  const jugables = c.cuadro.partidos.filter((p) => !p.bye);
  if (jugables.length && jugables.every((p) => p.estado === "FINALIZADO")) return "FINALIZADA";
  if (jugables.some((p) => p.estado !== "PENDIENTE")) return "EN_JUEGO";
  return "PUBLICADA";
}

export function campeon(c: CategoriaEnTorneo): string | null {
  const llave = c.cuadro?.partidos.filter((p) => p.fase === "LLAVE" && p.cuadro !== "CONSOLACION" && !p.tercerPuesto) ?? [];
  if (!llave.length) {
    // Liga: gana el 1ro cuando el grupo terminó.
    return null;
  }
  const final = llave.reduce((a, b) => (b.ronda > a.ronda ? b : a));
  return ganadorPartido(final);
}

/* ---------- resolver el cuadro ---------- */

interface Lado {
  dupla: string | null;
  /** Este lado nunca va a tener rival (bye). */
  bye: boolean;
}

/**
 * Completa las llaves con lo que ya se sabe y aplica byes y W.O. automáticos.
 * Si un cambio altera a un participante de un partido ya jugado, ese resultado se
 * anula y queda anotado en `anulados` (la UI pide confirmación antes).
 */
export function resolverCuadro(t: Torneo, c: CategoriaEnTorneo): { cuadro: Cuadro | null; anulados: string[] } {
  if (!c.cuadro) return { cuadro: null, anulados: [] };
  const anulados: string[] = [];
  const reglas = c.reglas;
  const activas = new Set(duplasActivas(c.duplas).map((d) => d.id));
  const ahora = new Date().toISOString();

  // 1) Grupos: partidos pendientes con una dupla retirada → W.O. para la otra.
  let partidos = c.cuadro.partidos.map((p) => {
    if (p.fase !== "GRUPOS" || p.estado === "FINALIZADO" || !p.duplaA || !p.duplaB) return p;
    const aFuera = !activas.has(p.duplaA);
    const bFuera = !activas.has(p.duplaB);
    if (!aFuera && !bFuera) return p;
    if (aFuera && bFuera) return { ...p, estado: "FINALIZADO" as const, resultado: resultadoWO(reglas.GRUPOS, "A"), actualizadoEn: ahora };
    return { ...p, estado: "FINALIZADO" as const, resultado: resultadoWO(reglas.GRUPOS, aFuera ? "B" : "A"), actualizadoEn: ahora };
  });

  const tablas = new Map(tablasCategoria(t, { ...c, cuadro: { ...c.cuadro, partidos } }).map((tb) => [tb.grupo.id, tb]));
  const porId = new Map(partidos.map((p) => [p.id, p]));

  const lado = (o: Origen): Lado => {
    switch (o.tipo) {
      case "DUPLA":
        return { dupla: o.duplaId, bye: false };
      case "BYE":
        return { dupla: null, bye: true };
      case "GRUPO": {
        const tb = tablas.get(o.grupoId);
        if (!tb) return { dupla: null, bye: true };
        if (tb.grupo.duplaIds.length < o.puesto) return { dupla: null, bye: true };
        if (!tb.completo || tb.sorteoPendiente) return { dupla: null, bye: false };
        const fila = tb.filas[o.puesto - 1];
        return fila && !fila.retirada ? { dupla: fila.duplaId, bye: false } : { dupla: null, bye: true };
      }
      case "GANADOR":
      case "PERDEDOR": {
        const p = porId.get(o.partidoId);
        if (!p) return { dupla: null, bye: true };
        if (p.bye && p.estado === "FINALIZADO" && !p.duplaA && !p.duplaB) return { dupla: null, bye: true };
        if (o.tipo === "PERDEDOR" && p.bye) return { dupla: null, bye: p.estado === "FINALIZADO" };
        const d = o.tipo === "GANADOR" ? ganadorPartido(p) : perdedorPartido(p);
        return { dupla: d, bye: false };
      }
    }
  };

  // 2) Llaves en orden de ronda: los ganadores van subiendo.
  const llave = partidos.filter((p) => p.fase === "LLAVE").sort((a, b) => a.ronda - b.ronda || (a.tercerPuesto ? 1 : 0) - (b.tercerPuesto ? 1 : 0));
  for (const original of llave) {
    const A = lado(original.origenA);
    const B = lado(original.origenB);
    let p: PartidoTorneo = { ...original, duplaA: A.dupla, duplaB: B.dupla };
    const cambio = original.duplaA !== p.duplaA || original.duplaB !== p.duplaB;
    if (cambio && original.estado !== "PENDIENTE" && !original.bye) {
      anulados.push(original.id);
      p = { ...p, estado: "PENDIENTE", resultado: null, inicioEn: null, finEn: null, llamadoEn: null, actualizadoEn: ahora };
    }
    if (A.bye || B.bye) {
      const listo = (A.bye || A.dupla !== null) && (B.bye || B.dupla !== null);
      p = { ...p, bye: true, estado: listo ? "FINALIZADO" : "PENDIENTE", resultado: null, programacion: null };
    } else {
      if (p.bye) p = { ...p, bye: false, estado: "PENDIENTE" };
      // Dupla retirada en la llave: W.O. automático para la otra.
      if (p.estado !== "FINALIZADO" && p.duplaA && p.duplaB) {
        const aFuera = !activas.has(p.duplaA);
        const bFuera = !activas.has(p.duplaB);
        if (aFuera !== bFuera) {
          const r = reglas[faseReglas(c, p)];
          p = { ...p, estado: "FINALIZADO", resultado: resultadoWO(r, aFuera ? "B" : "A"), actualizadoEn: ahora };
        }
      }
    }
    porId.set(p.id, p);
  }
  partidos = partidos.map((p) => porId.get(p.id)!);
  return { cuadro: { ...c.cuadro, partidos }, anulados };
}

function conCategoria(t: Torneo, categoriaId: string, fn: (c: CategoriaEnTorneo) => CategoriaEnTorneo): Torneo {
  return { ...t, categorias: t.categorias.map((c) => (c.categoria.id === categoriaId ? fn(c) : c)) };
}

/** Recalcula el cuadro de una categoría y deja registro de lo anulado. */
function recalcular(t: Torneo, categoriaId: string, por?: string): Torneo {
  const c = categoria(t, categoriaId);
  if (!c?.cuadro) return t;
  const { cuadro, anulados } = resolverCuadro(t, c);
  let out = conCategoria(t, categoriaId, (x) => ({ ...x, cuadro }));
  for (const id of anulados) {
    const p = c.cuadro.partidos.find((x) => x.id === id);
    out = tocar(out, `${p?.etiqueta ?? id} (${nombreCategoria(c.categoria)}): resultado anulado porque cambió un participante.`, por);
  }
  return out;
}

export function recalcularTodo(t: Torneo): Torneo {
  return t.categorias.reduce((acc, c) => recalcular(acc, c.categoria.id), t);
}

/* ---------- categorías ---------- */

export function agregarCategoria(t: Torneo, c: CategoriaTorneo): Torneo {
  if (categoria(t, c.id)) return t;
  return tocar({ ...t, categorias: [...t.categorias, nuevaCategoria(c)] }, `Categoría agregada: ${nombreCategoria(c)}`);
}

export function quitarCategoria(t: Torneo, categoriaId: string): Torneo {
  const c = categoria(t, categoriaId);
  if (!c) return t;
  return tocar({ ...t, categorias: t.categorias.filter((x) => x.categoria.id !== categoriaId) }, `Categoría quitada: ${nombreCategoria(c.categoria)}`);
}

export function configurarCategoria(
  t: Torneo,
  categoriaId: string,
  cambios: { config?: Partial<ConfigCuadro>; reglas?: Partial<Record<FaseReglas, ReglasPartido>>; cupo?: number | null; nombre?: string },
): Torneo {
  return tocar(
    conCategoria(t, categoriaId, (c) => ({
      ...c,
      categoria: cambios.nombre !== undefined ? { ...c.categoria, nombre: cambios.nombre || undefined } : c.categoria,
      config: cambios.config ? { ...c.config, ...cambios.config } : c.config,
      reglas: cambios.reglas ? { ...c.reglas, ...cambios.reglas } : c.reglas,
      cupo: cambios.cupo !== undefined ? cambios.cupo : c.cupo,
    })),
  );
}

/* ---------- inscripciones ---------- */

/** Agrega o actualiza jugadores (por id) en el padrón del torneo. */
export function guardarJugadores(t: Torneo, jugadores: JugadorTorneo[]): Torneo {
  const m = new Map(t.jugadores.map((j) => [j.id, j]));
  for (const j of jugadores) m.set(j.id, { ...m.get(j.id), ...j });
  return { ...t, jugadores: [...m.values()] };
}

export function inscribirDupla(
  t: Torneo,
  categoriaId: string,
  a: JugadorTorneo,
  b: JugadorTorneo,
  extra: { puntos?: number; cabezaSerie?: number | null; id?: string; fvp?: Dupla["fvp"] } = {},
): Torneo {
  const d: Dupla = {
    id: extra.id ?? nuevoId("d-"),
    jugadorIds: [a.id, b.id],
    puntos: extra.puntos,
    cabezaSerie: extra.cabezaSerie ?? null,
    ...(extra.fvp ? { fvp: extra.fvp } : {}),
    estado: "ACTIVA",
    inscritaEn: new Date().toISOString(),
  };
  const conJugadores = guardarJugadores(t, [a, b]);
  return tocar(conCategoria(conJugadores, categoriaId, (c) => ({ ...c, duplas: [...c.duplas, d] })));
}

export function editarDupla(t: Torneo, categoriaId: string, duplaId: string, cambios: Partial<Pick<Dupla, "puntos" | "cabezaSerie" | "jugadorIds" | "noDisponible" | "fvp">>): Torneo {
  return tocar(conCategoria(t, categoriaId, (c) => ({ ...c, duplas: c.duplas.map((d) => (d.id === duplaId ? { ...d, ...cambios } : d)) })));
}

/** Antes del sorteo se borra; después queda como retirada (sus partidos pasan a W.O.). */
export function quitarDupla(t: Torneo, categoriaId: string, duplaId: string, motivo: "RETIRADA" | "DESCALIFICADA" = "RETIRADA", por?: string): Torneo {
  const c = categoria(t, categoriaId);
  if (!c) return t;
  const d = c.duplas.find((x) => x.id === duplaId);
  if (!c.cuadro) return tocar(conCategoria(t, categoriaId, (x) => ({ ...x, duplas: x.duplas.filter((y) => y.id !== duplaId) })));
  const out = conCategoria(t, categoriaId, (x) => ({ ...x, duplas: x.duplas.map((y) => (y.id === duplaId ? { ...y, estado: motivo } : y)) }));
  return recalcular(tocar(out, `${nombreDupla(t, d)} ${motivo === "RETIRADA" ? "se retiró" : "fue descalificada"} (${nombreCategoria(c.categoria)}). Sus partidos pendientes pasan a W.O.`, por), categoriaId);
}

/** Reemplaza a un jugador de una dupla (lesión): conserva resultados y programación. */
export function reemplazarJugador(t: Torneo, categoriaId: string, duplaId: string, saleId: string, entra: JugadorTorneo, por?: string): Torneo {
  const sale = jugador(t, saleId);
  const out = guardarJugadores(t, [entra]);
  return tocar(
    conCategoria(out, categoriaId, (c) => ({
      ...c,
      duplas: c.duplas.map((d) => (d.id === duplaId ? { ...d, jugadorIds: d.jugadorIds.map((id) => (id === saleId ? entra.id : id)) as [string, string] } : d)),
    })),
    `${nombreJugador(entra)} reemplaza a ${nombreJugador(sale)}.`,
    por,
  );
}

/* ---------- sorteo ---------- */

export function propuestaCategoria(c: CategoriaEnTorneo) {
  const n = duplasActivas(c.duplas).length;
  return c.config.manual ? undefined : proponerFormato(n, c.config);
}

export function sortearCategoria(t: Torneo, categoriaId: string, opts: { semilla?: number; por?: string; config?: ConfigCuadro } = {}): Torneo {
  const c = categoria(t, categoriaId);
  if (!c) return t;
  const config = opts.config ?? c.config;
  const semilla = opts.semilla ?? Math.floor(Math.random() * 2 ** 31);
  const cuadro = sortear({ categoriaId, duplas: c.duplas, config, semilla, por: opts.por });
  const out = conCategoria(t, categoriaId, (x) => ({ ...x, config, cuadro }));
  return recalcular(tocar(out, `Sorteo de ${nombreCategoria(c.categoria)} (semilla ${semilla}).`, opts.por), categoriaId);
}

export function publicarCategoria(t: Torneo, categoriaId: string, por?: string): Torneo {
  const c = categoria(t, categoriaId);
  if (!c?.cuadro) return t;
  const out = conCategoria(t, categoriaId, (x) => ({ ...x, cuadro: { ...x.cuadro!, publicado: true } }));
  return tocar({ ...out, estado: out.estado === "INSCRIPCION" ? "PROGRAMADO" : out.estado }, `Cuadro publicado: ${nombreCategoria(c.categoria)}.`, por);
}

/** Vuelve a inscripciones (borra el cuadro). Solo si no hay partidos jugados. */
export function deshacerSorteo(t: Torneo, categoriaId: string, por?: string): Torneo {
  const c = categoria(t, categoriaId);
  if (!c?.cuadro) return t;
  if (c.cuadro.partidos.some((p) => p.estado !== "PENDIENTE" && !p.bye)) return t;
  return tocar(conCategoria(t, categoriaId, (x) => ({ ...x, cuadro: null })), `Sorteo deshecho: ${nombreCategoria(c.categoria)}.`, por);
}

/** Intercambia dos duplas entre grupos (o dentro de la llave inicial). Solo sin partidos jugados en esos grupos. */
export function intercambiarDuplas(t: Torneo, categoriaId: string, x: string, y: string, por?: string): Torneo {
  const c = categoria(t, categoriaId);
  if (!c?.cuadro || x === y) return t;
  const jugado = (id: string) => c.cuadro!.partidos.some((p) => p.estado !== "PENDIENTE" && !p.bye && (p.duplaA === id || p.duplaB === id));
  if (jugado(x) || jugado(y)) return t;
  const swap = (id: string) => (id === x ? y : id === y ? x : id);
  const swapOrigen = (o: Origen): Origen => (o.tipo === "DUPLA" ? { ...o, duplaId: swap(o.duplaId) } : o);
  const cuadro: Cuadro = {
    ...c.cuadro,
    grupos: c.cuadro.grupos.map((g) => ({ ...g, duplaIds: g.duplaIds.map(swap) })),
    partidos: c.cuadro.partidos.map((p) => ({
      ...p,
      origenA: swapOrigen(p.origenA),
      origenB: swapOrigen(p.origenB),
      duplaA: p.fase === "GRUPOS" && p.duplaA ? swap(p.duplaA) : p.duplaA,
      duplaB: p.fase === "GRUPOS" && p.duplaB ? swap(p.duplaB) : p.duplaB,
    })),
  };
  const out = conCategoria(t, categoriaId, (k) => ({ ...k, cuadro }));
  return recalcular(tocar(out, `Cambio en el cuadro: ${nombreDupla(t, dupla(t, x))} ⇄ ${nombreDupla(t, dupla(t, y))}.`, por), categoriaId);
}

export function registrarSorteoDesempate(t: Torneo, categoriaId: string, grupoId: string, orden: string[], por?: string): Torneo {
  const c = categoria(t, categoriaId);
  if (!c?.cuadro) return t;
  const cuadro = { ...c.cuadro, sorteosDesempate: { ...c.cuadro.sorteosDesempate, [grupoId]: { orden, en: new Date().toISOString(), por } } };
  const grupo = c.cuadro.grupos.find((g) => g.id === grupoId);
  return recalcular(tocar(conCategoria(t, categoriaId, (k) => ({ ...k, cuadro })), `Sorteo de desempate en Grupo ${grupo?.nombre}.`, por), categoriaId);
}

/* ---------- partidos ---------- */

export function actualizarPartido(t: Torneo, partidoId: string, fn: (p: PartidoTorneo) => PartidoTorneo): Torneo {
  const p = partido(t, partidoId);
  if (!p) return t;
  const ahora = despues(p.actualizadoEn);
  return conCategoria(t, p.categoriaId, (c) => ({
    ...c,
    cuadro: c.cuadro && { ...c.cuadro, partidos: c.cuadro.partidos.map((x) => (x.id === partidoId ? { ...fn(x), actualizadoEn: ahora } : x)) },
  }));
}

export function cargarResultado(t: Torneo, partidoId: string, resultado: ResultadoTorneo, por?: string): Torneo {
  const p = partido(t, partidoId);
  if (!p) return t;
  const out = actualizarPartido(t, partidoId, (x) => ({ ...x, estado: "FINALIZADO", resultado, finEn: x.finEn ?? new Date().toISOString() }));
  return recalcular({ ...tocar(out), estado: out.estado === "FINALIZADO" ? out.estado : "EN_JUEGO" }, p.categoriaId, por);
}

export function borrarResultado(t: Torneo, partidoId: string, por?: string): Torneo {
  const p = partido(t, partidoId);
  if (!p) return t;
  const out = actualizarPartido(t, partidoId, (x) => ({ ...x, estado: "PENDIENTE", resultado: null, finEn: null, inicioEn: null }));
  return recalcular(tocar(out, `Resultado borrado: ${p.etiqueta}.`, por), p.categoriaId, por);
}

export function cargarWO(t: Torneo, partidoId: string, ganador: "A" | "B", por?: string): Torneo {
  const p = partido(t, partidoId);
  if (!p) return t;
  const out = cargarResultado(t, partidoId, resultadoWO(reglasDe(t, p), ganador), por);
  const pierde = ganador === "A" ? p.duplaB : p.duplaA;
  return tocar(out, `W.O. en ${p.etiqueta}: no se presentó ${nombreDupla(t, dupla(t, pierde))}.`, por);
}

export function llamarAPista(t: Torneo, partidoId: string, pista: number): Torneo {
  return tocar(actualizarPartido(t, partidoId, (x) => ({ ...x, estado: "LLAMADO", llamadoEn: new Date().toISOString(), pistaReal: pista })));
}

export function iniciarPartido(t: Torneo, partidoId: string, pista?: number): Torneo {
  const out = actualizarPartido(t, partidoId, (x) => ({
    ...x,
    estado: "EN_JUEGO",
    suspendido: null,
    inicioEn: x.inicioEn ?? new Date().toISOString(),
    pistaReal: pista ?? x.pistaReal ?? x.programacion?.pista ?? null,
  }));
  return tocar({ ...out, estado: "EN_JUEGO" });
}

export function moverPartido(t: Torneo, partidoId: string, prog: { fecha: string; hora: string; pista: number }, por?: string): Torneo {
  const p = partido(t, partidoId);
  return tocar(
    actualizarPartido(t, partidoId, (x) => ({ ...x, programacion: { ...prog, fijo: true } })),
    `${p?.etiqueta} movido a ${prog.fecha} ${prog.hora}, pista ${prog.pista}.`,
    por,
  );
}

export function configurarTorneo(
  t: Torneo,
  cambios: Partial<Pick<Torneo, "nombre" | "dias" | "canchas" | "descansoMin" | "toleranciaWO" | "finalesUltimoDia" | "bloqueos" | "criterios" | "sedes" | "patrocinadores" | "validarFvp">>,
): Torneo {
  const out = { ...t, ...cambios };
  return cambios.criterios ? recalcularTodo(tocar(out, "Criterios de desempate actualizados.")) : tocar(out);
}

export function agregarBloqueo(t: Torneo, b: BloqueHorario): Torneo {
  return tocar({ ...t, bloqueos: [...t.bloqueos, b] }, `Franja bloqueada: ${b.fecha} ${b.inicio}-${b.fin}${b.pista ? ` pista ${b.pista}` : ""}.`);
}

export function eliminarTorneo(t: Torneo): Torneo {
  return tocar({ ...t, eliminado: true });
}

/* ---------- multi-dispositivo ---------- */

/**
 * Une dos versiones del mismo torneo: la más reciente manda en configuración e
 * inscripciones, y cada partido conserva su versión más reciente (así dos
 * anotadores en pistas distintas no se pisan).
 */
export function fusionarTorneos(a: Torneo, b: Torneo): Torneo {
  const [nuevo, viejo] = a.actualizadoEn >= b.actualizadoEn ? [a, b] : [b, a];
  if (nuevo.eliminado || viejo.eliminado) return { ...nuevo, eliminado: true };
  const partidosViejos = new Map(todosLosPartidos(viejo).map((p) => [p.id, p]));
  let hubo = false;
  const categorias = nuevo.categorias.map((c) => {
    if (!c.cuadro) return c;
    const vc = categoria(viejo, c.categoria.id);
    if (vc?.cuadro?.semilla !== c.cuadro.semilla) return c;
    const partidos = c.cuadro.partidos.map((p) => {
      const v = partidosViejos.get(p.id);
      if (v && (v.actualizadoEn ?? "") > (p.actualizadoEn ?? "")) {
        hubo = true;
        return v;
      }
      return p;
    });
    return { ...c, cuadro: { ...c.cuadro, partidos } };
  });
  const out = { ...nuevo, categorias };
  return hubo ? recalcularTodo(out) : out;
}

/* ---------- utilidades ---------- */

export function setsVacios(r: ReglasPartido): SetScore[] {
  return Array.from({ length: r.sets === 3 ? 2 : 1 }, () => ({ a: 0, b: 0 }));
}

export function progresoTorneo(t: Torneo) {
  const jugables = todosLosPartidos(t).filter((p) => !p.bye);
  return {
    total: jugables.length,
    jugados: jugables.filter((p) => p.estado === "FINALIZADO").length,
    enJuego: jugables.filter((p) => p.estado === "EN_JUEGO").length,
    duplas: t.categorias.reduce((s, c) => s + duplasActivas(c.duplas).length, 0),
  };
}
