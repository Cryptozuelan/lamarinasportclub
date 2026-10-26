/**
 * Tabla de un grupo y desempates explicados.
 *
 * Orden: partidos ganados. Empates:
 *   - 2 duplas: el partido entre ellas.
 *   - 3 o más: diferencia de sets y luego de games SOLO entre las empatadas; si no
 *     separa, sets y games de todo el grupo; si aún no, sorteo registrado.
 *   - Cada vez que un criterio separa, los subgrupos que siguen empatados vuelven a
 *     empezar (si quedan 2, decide el partido entre ellas).
 * Retiradas y descalificadas quedan últimas. W.O. = 6-0 6-0 (ver `resultadoWO`).
 *
 * Cada decisión queda escrita en `notas` para mostrar en la app el porqué.
 */
import type { CriterioDesempate, Cuadro, Dupla, Grupo, PartidoTorneo, ReglasPartido, ResultadoTorneo } from "@/types/torneo";
import type { SetScore } from "@/types/americano";
import { crearRng } from "../rotation.ts";

export interface FilaGrupo {
  duplaId: string;
  posicion: number;
  pj: number;
  pg: number;
  pp: number;
  setsF: number;
  setsC: number;
  gamesF: number;
  gamesC: number;
  retirada: boolean;
  /** Clasifica a la llave (solo cuando el grupo terminó). */
  clasifica: boolean;
  /** Explicación corta de por qué quedó en esta posición respecto a sus empatadas. */
  motivo?: string;
}

export interface NotaDesempate {
  duplaIds: string[];
  texto: string;
}

export interface TablaGrupo {
  grupo: Grupo;
  filas: FilaGrupo[];
  notas: NotaDesempate[];
  completo: boolean;
  jugados: number;
  total: number;
  /** Duplas empatadas en todo que necesitan sorteo (null si no hace falta). */
  sorteoPendiente: string[] | null;
}

export const CRITERIOS_POR_DEFECTO: CriterioDesempate[] = [
  { id: "ENFRENTAMIENTO", activo: true },
  { id: "SETS_ENTRE", activo: true },
  { id: "GAMES_ENTRE", activo: true },
  { id: "SETS_TODOS", activo: true },
  { id: "GAMES_TODOS", activo: true },
  { id: "GAMES_GANADOS", activo: false },
];

export const NOMBRE_CRITERIO: Record<CriterioDesempate["id"], string> = {
  ENFRENTAMIENTO: "Partido entre ellas (empate de 2)",
  SETS_ENTRE: "Diferencia de sets entre las empatadas",
  GAMES_ENTRE: "Diferencia de games entre las empatadas",
  SETS_TODOS: "Diferencia de sets en todo el grupo",
  GAMES_TODOS: "Diferencia de games en todo el grupo",
  GAMES_GANADOS: "Más games ganados en el grupo",
};

/* ---------- resultados ---------- */

export const setsGanados = (sets: SetScore[]) => ({
  a: sets.filter((s) => s.a > s.b).length,
  b: sets.filter((s) => s.b > s.a).length,
});

/** W.O.: el ganador se lleva todos los sets necesarios 6-0 (o a los games del formato). */
export function resultadoWO(reglas: ReglasPartido, ganador: "A" | "B"): ResultadoTorneo {
  const necesarios = reglas.sets === 3 ? 2 : 1;
  const set: SetScore = ganador === "A" ? { a: reglas.games, b: 0 } : { a: 0, b: reglas.games };
  return { sets: Array.from({ length: necesarios }, () => ({ ...set })), ganador, tipo: "WO" };
}

/**
 * Retiro durante el partido: se respetan los sets jugados y se completan los que faltan
 * a favor de quien sigue en pista (el set en curso se cierra con sus games actuales + lo necesario).
 */
export function resultadoRetiro(reglas: ReglasPartido, setsJugados: SetScore[], ganador: "A" | "B"): ResultadoTorneo {
  const necesarios = reglas.sets === 3 ? 2 : 1;
  const sets = setsJugados.map((s) => ({ ...s }));
  const g = ganador === "A" ? "a" : "b";
  const p = ganador === "A" ? "b" : "a";
  const ultimo = sets[sets.length - 1];
  const iUlt = sets.length - 1;
  if (ultimo && !setTerminado(reglas, ultimo, iUlt)) {
    if (iUlt === 2 && reglas.sets === 3 && reglas.superTie) {
      // Tie-break decisivo en curso: se cierra a la meta (o con 2 de diferencia).
      ultimo[g] = Math.max(reglas.tieDecisivo ?? 10, ultimo[p] + 2);
    } else {
      ultimo[g] = Math.max(reglas.games, ultimo[p] + 2);
      const conTie = reglas.tieBreakEn !== null && !(reglas.tercerSetLargo && iUlt === 2);
      if (conTie && ultimo[p] >= reglas.tieBreakEn!) ultimo[g] = reglas.tieBreakEn! + 1;
    }
  }
  while (setsGanados(sets)[g] < necesarios) sets.push(ganador === "A" ? { a: reglas.games, b: 0 } : { a: 0, b: reglas.games });
  return { sets, ganador, tipo: "RETIRO" };
}

/** ¿El set `s` (de índice `i`) está terminado? Con `tercerSetLargo` el 3er set no tiene tie-break (FIP Regla 1.4). */
export function setTerminado(r: ReglasPartido, s: SetScore, i = 0): boolean {
  const hi = Math.max(s.a, s.b);
  const lo = Math.min(s.a, s.b);
  const sinTie = r.tieBreakEn === null || (r.tercerSetLargo && i === 2);
  if (sinTie) return hi >= r.games && hi - lo >= 2 && (hi === r.games || hi - lo === 2);
  if (hi >= r.games && hi - lo >= 2 && hi <= r.tieBreakEn! + 1 && (hi === r.games || lo >= r.games - 1)) return true;
  return hi === r.tieBreakEn! + 1 && lo === r.tieBreakEn;
}

/** Valida un resultado cargado a mano. Devuelve el error o null. */
export function validarResultadoTorneo(r: ReglasPartido, sets: SetScore[], esDecisivoSuperTie = r.sets === 3 && r.superTie): string | null {
  const necesarios = r.sets === 3 ? 2 : 1;
  if (!sets.length) return "Carga al menos un set.";
  let a = 0;
  let b = 0;
  for (let i = 0; i < sets.length; i++) {
    if (a === necesarios || b === necesarios) return "Sobran sets: el partido ya estaba definido.";
    const s = sets[i];
    if (s.a < 0 || s.b < 0 || !Number.isInteger(s.a) || !Number.isInteger(s.b)) return `Set ${i + 1}: números inválidos.`;
    if (i === 2 && esDecisivoSuperTie) {
      const hi = Math.max(s.a, s.b);
      const lo = Math.min(s.a, s.b);
      const meta = r.tieDecisivo ?? 10;
      if (hi < meta || hi - lo < 2 || (hi > meta && hi - lo !== 2))
        return meta === 10 ? "Súper tie-break: a 10 con 2 de diferencia (ej. 10-7, 12-10)." : "Tie-break decisivo: a 7 con 2 de diferencia (ej. 7-4, 9-7).";
    } else if (!setTerminado(r, s, i)) {
      return `Set ${i + 1}: ${s.a}-${s.b} no es un set terminado.`;
    }
    if (s.a > s.b) a++;
    else b++;
  }
  if (a < necesarios && b < necesarios) return "Falta un set: el partido no está definido.";
  return null;
}

export function ganadorDe(sets: SetScore[]): "A" | "B" {
  const g = setsGanados(sets);
  return g.a > g.b ? "A" : "B";
}

/** "6-4 3-6 10-7" desde el lado de A. */
export function textoSets(sets: SetScore[], invertir = false): string {
  return sets.map((s) => (invertir ? `${s.b}-${s.a}` : `${s.a}-${s.b}`)).join(" ");
}

/* ---------- tabla ---------- */

interface Acum {
  pj: number;
  pg: number;
  pp: number;
  setsF: number;
  setsC: number;
  gamesF: number;
  gamesC: number;
}

const vacio = (): Acum => ({ pj: 0, pg: 0, pp: 0, setsF: 0, setsC: 0, gamesF: 0, gamesC: 0 });

/** Suma de games: el súper tie-break cuenta como 1 game para el ganador (criterio habitual). */
function gamesDeSet(s: SetScore, i: number, superTie: boolean): SetScore {
  if (i === 2 && superTie) return s.a > s.b ? { a: 1, b: 0 } : { a: 0, b: 1 };
  return s;
}

function acumular(partidos: PartidoTorneo[], ids: Set<string>, superTie: boolean): Map<string, Acum> {
  const m = new Map<string, Acum>([...ids].map((id) => [id, vacio()]));
  for (const p of partidos) {
    if (p.estado !== "FINALIZADO" || !p.resultado || !p.duplaA || !p.duplaB) continue;
    if (!ids.has(p.duplaA) || !ids.has(p.duplaB)) continue;
    const A = m.get(p.duplaA)!;
    const B = m.get(p.duplaB)!;
    A.pj++;
    B.pj++;
    if (p.resultado.ganador === "A") {
      A.pg++;
      B.pp++;
    } else {
      B.pg++;
      A.pp++;
    }
    p.resultado.sets.forEach((s, i) => {
      if (s.a > s.b) {
        A.setsF++;
        B.setsC++;
      } else if (s.b > s.a) {
        B.setsF++;
        A.setsC++;
      }
      const g = gamesDeSet(s, i, superTie);
      A.gamesF += g.a;
      A.gamesC += g.b;
      B.gamesF += g.b;
      B.gamesC += g.a;
    });
  }
  return m;
}

const signo = (n: number) => (n > 0 ? `+${n}` : String(n));

export interface ContextoTabla {
  nombre: (duplaId: string) => string;
  criterios?: CriterioDesempate[];
  superTie?: boolean;
  sorteo?: Cuadro["sorteosDesempate"];
  semilla?: number;
}

export function calcularTablaGrupo(grupo: Grupo, partidosCategoria: PartidoTorneo[], duplas: Dupla[], ctx: ContextoTabla): TablaGrupo {
  const criterios = (ctx.criterios ?? CRITERIOS_POR_DEFECTO).filter((c) => c.activo).map((c) => c.id);
  const superTie = ctx.superTie ?? true;
  const partidos = partidosCategoria.filter((p) => p.fase === "GRUPOS" && p.grupoId === grupo.id);
  const todos = new Set(grupo.duplaIds);
  const general = acumular(partidos, todos, superTie);
  const estadoDe = (id: string) => duplas.find((d) => d.id === id)?.estado ?? "ACTIVA";
  const retiradas = grupo.duplaIds.filter((id) => estadoDe(id) !== "ACTIVA");
  const activas = grupo.duplaIds.filter((id) => estadoDe(id) === "ACTIVA");
  const notas: NotaDesempate[] = [];
  const motivos = new Map<string, string>();
  let sorteoPendiente: string[] | null = null;
  const N = ctx.nombre;

  const partidoEntre = (x: string, y: string) =>
    partidos.find((p) => p.estado === "FINALIZADO" && p.resultado && ((p.duplaA === x && p.duplaB === y) || (p.duplaA === y && p.duplaB === x)));

  const valor = (crit: CriterioDesempate["id"], ids: string[]): Map<string, number> => {
    const entre = crit === "SETS_ENTRE" || crit === "GAMES_ENTRE";
    const m = entre ? acumular(partidos, new Set(ids), superTie) : general;
    return new Map(
      ids.map((id) => {
        const a = m.get(id)!;
        const v = crit.startsWith("SETS") ? a.setsF - a.setsC : crit === "GAMES_GANADOS" ? a.gamesF : a.gamesF - a.gamesC;
        return [id, v];
      }),
    );
  };

  const resolver = (ids: string[], pg: number): string[] => {
    if (ids.length === 1) return ids;
    if (ids.length === 2 && criterios.includes("ENFRENTAMIENTO")) {
      const [x, y] = ids;
      const p = partidoEntre(x, y);
      if (p) {
        const gana = p.resultado!.ganador === "A" ? p.duplaA! : p.duplaB!;
        const pierde = gana === x ? y : x;
        const marcador = textoSets(p.resultado!.sets, gana === p.duplaB);
        const wo = p.resultado!.tipo === "WO" ? " (W.O.)" : "";
        notas.push({ duplaIds: [gana, pierde], texto: `${N(gana)} queda delante de ${N(pierde)}: le ganó el partido entre ambas ${marcador}${wo}.` });
        motivos.set(gana, `Ganó a ${N(pierde)}`);
        motivos.set(pierde, `Perdió con ${N(gana)}`);
        return [gana, pierde];
      }
    }
    const lista = ids.length === 2 ? criterios.filter((c) => !c.endsWith("_ENTRE") && c !== "ENFRENTAMIENTO") : criterios.filter((c) => c !== "ENFRENTAMIENTO");
    for (const crit of lista) {
      const v = valor(crit, ids);
      const distintos = [...new Set(v.values())].sort((a, b) => b - a);
      if (distintos.length < 2) continue;
      const nombreCrit = NOMBRE_CRITERIO[crit].toLowerCase();
      const detalle = [...ids].sort((a, b) => v.get(b)! - v.get(a)!).map((id) => `${N(id)} ${crit === "GAMES_GANADOS" ? v.get(id) : signo(v.get(id)!)}`);
      const quien = ids.length === 2 ? "Empate entre 2" : `Empate entre ${ids.length}`;
      notas.push({ duplaIds: ids, texto: `${quien} con ${pg} victoria${pg === 1 ? "" : "s"}: se ordena por ${nombreCrit} (${detalle.join(", ")}).` });
      for (const id of ids) motivos.set(id, `${NOMBRE_CRITERIO[crit].replace(" (empate de 2)", "")}: ${crit === "GAMES_GANADOS" ? v.get(id) : signo(v.get(id)!)}`);
      const out: string[] = [];
      for (const d of distintos) out.push(...resolver(ids.filter((id) => v.get(id) === d), pg));
      return out;
    }
    // Empate total: sorteo.
    const guardado = ctx.sorteo?.[grupo.id];
    if (guardado && ids.every((id) => guardado.orden.includes(id))) {
      const orden = [...ids].sort((a, b) => guardado.orden.indexOf(a) - guardado.orden.indexOf(b));
      notas.push({ duplaIds: ids, texto: `Empate en todos los criterios entre ${ids.map(N).join(", ")}: se resolvió por sorteo.` });
      for (const id of ids) motivos.set(id, "Sorteo");
      return orden;
    }
    sorteoPendiente = [...(sorteoPendiente ?? []), ...ids];
    notas.push({ duplaIds: ids, texto: `Empate en todos los criterios entre ${ids.map(N).join(", ")}: hay que sortear el orden.` });
    for (const id of ids) motivos.set(id, "Empate total · sorteo pendiente");
    const rng = crearRng((ctx.semilla ?? 1) + ids.join("").length);
    return [...ids].sort((a, b) => a.localeCompare(b)).map((id) => ({ id, r: rng() })).sort((a, b) => a.r - b.r).map((x) => x.id);
  };

  const porPg = new Map<number, string[]>();
  for (const id of activas) {
    const pg = general.get(id)!.pg;
    porPg.set(pg, [...(porPg.get(pg) ?? []), id]);
  }
  const orden: string[] = [];
  for (const pg of [...porPg.keys()].sort((a, b) => b - a)) orden.push(...resolver(porPg.get(pg)!, pg));
  orden.push(...retiradas);

  const total = partidos.length;
  const jugados = partidos.filter((p) => p.estado === "FINALIZADO").length;
  const completo = total > 0 && jugados === total;
  const filas: FilaGrupo[] = orden.map((id, i) => {
    const a = general.get(id)!;
    return {
      duplaId: id,
      posicion: i + 1,
      ...a,
      retirada: estadoDe(id) !== "ACTIVA",
      clasifica: false,
      motivo: estadoDe(id) !== "ACTIVA" ? (estadoDe(id) === "RETIRADA" ? "Retirada" : "Descalificada") : motivos.get(id),
    };
  });
  return { grupo, filas, notas, completo, jugados, total, sorteoPendiente: completo ? sorteoPendiente : null };
}
