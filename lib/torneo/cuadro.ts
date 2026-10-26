/**
 * Formato automático, sorteo, grupos y llaves.
 *
 * - El formato se propone según la cantidad de duplas (ver `proponerFormato`).
 * - La siembra respeta cabezas de serie y puntos de ranking; el resto se sortea.
 * - Grupos en serpiente (1-2-3-4 / 8-7-6-5) para equilibrar.
 * - Llave estándar de 2, 4, 8, 16, 32 o 64: el 1 arriba, el 2 abajo, byes para los
 *   mejores sembrados y nunca dos byes en el mismo partido.
 * - Los clasificados de un mismo grupo quedan en mitades opuestas de la llave.
 *
 * Todo es determinista por semilla: el mismo sorteo se puede reproducir y verificar.
 */
import type { ConfigCuadro, Cuadro, Dupla, FormatoCuadro, Grupo, Origen, PartidoTorneo } from "@/types/torneo";
import { crearRng } from "../rotation.ts";

export const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Duplas que entran al sorteo (las retiradas antes del sorteo no cuentan). */
export const duplasActivas = (duplas: Dupla[]) => duplas.filter((d) => d.estado === "ACTIVA");

/** Tamaños de grupo para n duplas con tamaño preferido t (3 o 4). Ej. 10, t=3 → [4, 3, 3]. */
export function tamanosGrupos(n: number, t: 3 | 4 = 3): number[] {
  if (n <= 0) return [];
  const g = Math.max(1, Math.floor(n / t));
  const base = Math.floor(n / g);
  const resto = n - base * g;
  return Array.from({ length: g }, (_, i) => base + (i < resto ? 1 : 0));
}

export const potenciaDe2 = (n: number) => {
  let p = 1;
  while (p < n) p *= 2;
  return p;
};

export interface Propuesta {
  config: ConfigCuadro;
  /** Explicación en una frase para el staff. */
  motivo: string;
  grupos: number[];
  /** Tamaño de la llave y byes. */
  llave: number;
  byes: number;
  partidos: number;
  /** Mínimo de partidos garantizados por dupla. */
  minimoPorDupla: number;
}

/** Cantidad de partidos de grupos (todos contra todos). */
const partidosGrupo = (k: number) => (k * (k - 1)) / 2;

/** Partidos de una llave de `q` participantes reales (los byes no se juegan). */
const partidosLlave = (q: number, tercer: boolean) => (q >= 2 ? q - 1 : 0) + (tercer && q >= 4 ? 1 : 0);

export function resumenFormato(n: number, config: ConfigCuadro): Propuesta {
  const { formato, tamanoGrupo, clasificanPorGrupo, tercerPuesto } = config;
  if (formato === "ELIMINACION") {
    const llave = potenciaDe2(Math.max(2, n));
    return {
      config,
      motivo: `Eliminación directa: llave de ${llave}${llave - n ? ` con ${llave - n} bye${llave - n > 1 ? "s" : ""} para los mejores sembrados` : ""}.`,
      grupos: [],
      llave,
      byes: llave - n,
      partidos: partidosLlave(n, tercerPuesto),
      minimoPorDupla: 1,
    };
  }
  if (formato === "LIGA" || formato === "LIGA_FINAL") {
    const final = formato === "LIGA_FINAL" ? 1 : 0;
    return {
      config,
      motivo:
        formato === "LIGA"
          ? `Un grupo de ${n}: todos contra todos, gana el primero de la tabla.`
          : `Un grupo de ${n}: todos contra todos y final entre el 1ro y el 2do.`,
      grupos: [n],
      llave: final ? 2 : 0,
      byes: 0,
      partidos: partidosGrupo(n) + final,
      minimoPorDupla: Math.max(0, n - 1),
    };
  }
  const grupos = tamanosGrupos(n, tamanoGrupo);
  const q = grupos.length * clasificanPorGrupo;
  const llave = potenciaDe2(q);
  const fase = llave >= 16 ? `una llave de ${llave}` : llave === 8 ? "cuartos de final" : llave === 4 ? "semifinales" : "la final";
  const byes = llave - q;
  return {
    config,
    motivo:
      `${grupos.length} grupos (${grupos.join(", ")}); pasan ${clasificanPorGrupo === 2 ? "1ro y 2do" : "los 1ros"} a ${fase}` +
      (byes ? `, y los ${byes} mejores primeros avanzan con bye.` : "."),
    grupos,
    llave,
    byes,
    partidos: grupos.reduce((s, k) => s + partidosGrupo(k), 0) + partidosLlave(q, tercerPuesto),
    minimoPorDupla: Math.min(...grupos) - 1,
  };
}

/**
 * Formato recomendado para n duplas:
 *   2 → final directa · 3 → liga · 4-5 → liga + final · 6+ → grupos de 3 (o 4) y llave.
 */
export function proponerFormato(n: number, base: ConfigCuadro): Propuesta {
  let formato: FormatoCuadro = "GRUPOS_LLAVE";
  if (n <= 2) formato = "ELIMINACION";
  else if (n === 3) formato = "LIGA";
  else if (n <= 5) formato = "LIGA_FINAL";
  return resumenFormato(n, { ...base, formato, manual: false });
}

/* ---------- siembra ---------- */

/**
 * Ordena las duplas para el sorteo: primero cabezas de serie fijados, luego por puntos
 * de ranking (desc), y las que no tienen puntos se sortean entre sí.
 */
export function ordenSiembra(duplas: Dupla[], semilla: number): Dupla[] {
  const rng = crearRng(semilla);
  const azar = new Map(duplas.map((d) => [d.id, rng()]));
  return [...duplas].sort((a, b) => {
    const ca = a.cabezaSerie ?? Infinity;
    const cb = b.cabezaSerie ?? Infinity;
    if (ca !== cb) return ca - cb;
    const pa = a.puntos ?? -1;
    const pb = b.puntos ?? -1;
    if (pa !== pb) return pb - pa;
    return azar.get(a.id)! - azar.get(b.id)!;
  });
}

/** Reparto en serpiente: fila 1 A→Z, fila 2 Z→A… respetando los tamaños de cada grupo. */
export function repartirEnGrupos(ordenadas: Dupla[], tamanos: number[]): Grupo[] {
  const grupos: Grupo[] = tamanos.map((_, i) => ({ id: `G${LETRAS[i]}`, nombre: LETRAS[i], duplaIds: [] }));
  let fila = 0;
  let i = 0;
  while (i < ordenadas.length) {
    const orden = fila % 2 === 0 ? grupos.map((_, k) => k) : grupos.map((_, k) => grupos.length - 1 - k);
    for (const k of orden) {
      if (i >= ordenadas.length) break;
      if (grupos[k].duplaIds.length < tamanos[k]) grupos[k].duplaIds.push(ordenadas[i++].id);
    }
    fila++;
  }
  return grupos;
}

/** Orden de siembra por posición en la llave. 8 → [1, 8, 4, 5, 2, 7, 3, 6]. */
export function posicionesSiembra(tam: number): number[] {
  let arr = [1];
  while (arr.length < tam) {
    const n = arr.length * 2;
    arr = arr.flatMap((x) => [x, n + 1 - x]);
  }
  return arr;
}

/* ---------- partidos ---------- */

/** Jornadas de un grupo todos contra todos (método del círculo). Devuelve pares de índices. */
export function jornadasGrupo(k: number): [number, number][][] {
  if (k === 3) return [[[1, 2]], [[0, 2]], [[0, 1]]]; // el sembrado 1 debuta contra el ya-jugado
  const ids = Array.from({ length: k % 2 ? k + 1 : k }, (_, i) => i);
  const n = ids.length;
  const jornadas: [number, number][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const j: [number, number][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = ids[i];
      const b = ids[n - 1 - i];
      if (a < k && b < k) j.push(a < b ? [a, b] : [b, a]);
    }
    jornadas.push(j);
    ids.splice(1, 0, ids.pop()!);
  }
  return jornadas;
}

const NOMBRE_RONDA: Record<number, string> = { 2: "Final", 4: "Semifinal", 8: "Cuartos", 16: "Octavos", 32: "Dieciseisavos", 64: "Treintaidosavos" };

export function nombreRonda(participantes: number): string {
  return NOMBRE_RONDA[participantes] ?? `Ronda de ${participantes}`;
}

function partidoBase(categoriaId: string, p: Omit<PartidoTorneo, "categoriaId" | "estado" | "duplaA" | "duplaB">): PartidoTorneo {
  return { ...p, categoriaId, estado: "PENDIENTE", duplaA: null, duplaB: null };
}

export function partidosDeGrupos(categoriaId: string, grupos: Grupo[]): PartidoTorneo[] {
  const out: PartidoTorneo[] = [];
  for (const g of grupos) {
    jornadasGrupo(g.duplaIds.length).forEach((jornada, r) => {
      jornada.forEach(([a, b], i) => {
        out.push({
          ...partidoBase(categoriaId, {
            id: `${categoriaId}:${g.id}:J${r + 1}:${i + 1}`,
            fase: "GRUPOS",
            grupoId: g.id,
            ronda: r + 1,
            etiqueta: `Grupo ${g.nombre} · J${r + 1}`,
            origenA: { tipo: "DUPLA", duplaId: g.duplaIds[a] },
            origenB: { tipo: "DUPLA", duplaId: g.duplaIds[b] },
          }),
          duplaA: g.duplaIds[a],
          duplaB: g.duplaIds[b],
        });
      });
    });
  }
  return out;
}

/**
 * Arma una llave de eliminación a partir de los "asientos" sembrados (asiento i = sembrado i+1).
 * Los asientos que faltan son byes. Devuelve todos los partidos, con los byes ya resueltos.
 */
export function construirLlave(
  categoriaId: string,
  asientos: Origen[],
  opts: { tercerPuesto?: boolean; cuadro?: "PRINCIPAL" | "CONSOLACION"; prefijo?: string } = {},
): PartidoTorneo[] {
  const tam = potenciaDe2(Math.max(2, asientos.length));
  const orden = posicionesSiembra(tam);
  const cuadro = opts.cuadro ?? "PRINCIPAL";
  const pre = opts.prefijo ?? (cuadro === "CONSOLACION" ? "C" : "L");
  const sufijo = cuadro === "CONSOLACION" ? " · Consolación" : "";
  const enPosicion: Origen[] = orden.map((s) => asientos[s - 1] ?? { tipo: "BYE" });

  const partidos: PartidoTorneo[] = [];
  let anteriores: PartidoTorneo[] = [];
  const rondas = Math.log2(tam);
  for (let r = 1; r <= rondas; r++) {
    const participantes = tam / 2 ** (r - 1);
    const cantidad = participantes / 2;
    const nombre = nombreRonda(participantes);
    const actuales: PartidoTorneo[] = [];
    for (let i = 0; i < cantidad; i++) {
      const origenA: Origen = r === 1 ? enPosicion[2 * i] : { tipo: "GANADOR", partidoId: anteriores[2 * i].id };
      const origenB: Origen = r === 1 ? enPosicion[2 * i + 1] : { tipo: "GANADOR", partidoId: anteriores[2 * i + 1].id };
      actuales.push(
        partidoBase(categoriaId, {
          id: `${categoriaId}:${pre}${r}:${i + 1}`,
          fase: "LLAVE",
          cuadro,
          ronda: r,
          posicion: i,
          etiqueta: (cantidad > 1 ? `${nombre} ${i + 1}` : nombre) + sufijo,
          origenA,
          origenB,
        }),
      );
    }
    partidos.push(...actuales);
    anteriores = actuales;
  }
  if (opts.tercerPuesto && tam >= 4) {
    const semis = partidos.filter((p) => p.ronda === rondas - 1);
    partidos.push(
      partidoBase(categoriaId, {
        id: `${categoriaId}:${pre}3P`,
        fase: "LLAVE",
        cuadro,
        ronda: rondas,
        posicion: 1,
        etiqueta: "3er puesto" + sufijo,
        origenA: { tipo: "PERDEDOR", partidoId: semis[0].id },
        origenB: { tipo: "PERDEDOR", partidoId: semis[1].id },
        tercerPuesto: true,
      }),
    );
  }
  return partidos;
}

/**
 * Asientos de la llave a partir de los grupos: primero los 1ros (A, B, C…), luego los 2dos.
 * Los 2dos se ubican para que nunca caigan en la misma mitad que el 1ro de su grupo
 * (y, si se puede, tampoco en el mismo cuarto).
 */
export function asientosDesdeGrupos(grupos: Grupo[], clasifican: 1 | 2): Origen[] {
  const primeros: Origen[] = grupos.map((g) => ({ tipo: "GRUPO", grupoId: g.id, puesto: 1 }));
  if (clasifican === 1 || grupos.length === 1) {
    return clasifican === 1 ? primeros : [...primeros, { tipo: "GRUPO", grupoId: grupos[0].id, puesto: 2 }];
  }
  const G = grupos.length;
  const tam = potenciaDe2(2 * G);
  const orden = posicionesSiembra(tam);
  const posDeSiembra = (s: number) => orden.indexOf(s);
  const mitad = (pos: number) => Math.floor(pos / (tam / 2));
  const cuarto = (pos: number) => Math.floor(pos / Math.max(1, tam / 4));
  const rival = (pos: number) => pos ^ 1;

  // Asientos G+1..2G para los segundos: se busca la asignación con menos choques.
  const asientosSegundos = Array.from({ length: G }, (_, i) => G + 1 + i);
  let mejor: number[] = asientosSegundos.map((_, i) => i);
  let mejorCosto = Infinity;
  const usado = new Array(G).fill(false);
  const actual: number[] = [];
  const costoDe = (g: number, asiento: number) => {
    const p2 = posDeSiembra(asiento);
    const p1 = posDeSiembra(g + 1);
    return (rival(p1) === p2 ? 1000 : 0) + (mitad(p1) === mitad(p2) ? 100 : 0) + (tam >= 8 && cuarto(p1) === cuarto(p2) ? 10 : 0);
  };
  let pasos = 0;
  const buscar = (k: number, costo: number) => {
    if (costo >= mejorCosto || pasos++ > 50_000) return;
    if (k === G) {
      mejorCosto = costo;
      mejor = [...actual];
      return;
    }
    // Segundo del grupo k → asiento asientosSegundos[j]. Se prueba primero el "espejo" (2do de A con el último).
    for (let jj = 0; jj < G; jj++) {
      const j = G - 1 - ((k + jj) % G);
      if (usado[j]) continue;
      usado[j] = true;
      actual[k] = j;
      buscar(k + 1, costo + costoDe(k, asientosSegundos[j]));
      usado[j] = false;
    }
  };
  buscar(0, 0);

  const segundos: Origen[] = new Array(G);
  mejor.forEach((j, k) => {
    segundos[j] = { tipo: "GRUPO", grupoId: grupos[k].id, puesto: 2 };
  });
  return [...primeros, ...segundos];
}

export interface OpcionesSorteo {
  categoriaId: string;
  duplas: Dupla[];
  config: ConfigCuadro;
  semilla: number;
  por?: string;
  ahora?: string;
}

/** El sorteo completo de una categoría: grupos, partidos de grupo, llave y byes resueltos. */
export function sortear({ categoriaId, duplas, config, semilla, por, ahora }: OpcionesSorteo): Cuadro {
  const activas = duplasActivas(duplas);
  const ordenadas = ordenSiembra(activas, semilla);
  let grupos: Grupo[] = [];
  let partidos: PartidoTorneo[] = [];

  if (config.formato === "ELIMINACION") {
    partidos = construirLlave(
      categoriaId,
      ordenadas.map((d) => ({ tipo: "DUPLA", duplaId: d.id })),
      { tercerPuesto: config.tercerPuesto },
    );
  } else {
    const tamanos = config.formato === "GRUPOS_LLAVE" ? tamanosGrupos(ordenadas.length, config.tamanoGrupo) : [ordenadas.length];
    grupos = repartirEnGrupos(ordenadas, tamanos);
    partidos = partidosDeGrupos(categoriaId, grupos);
    if (config.formato === "LIGA_FINAL") {
      partidos.push(...construirLlave(categoriaId, asientosDesdeGrupos(grupos, 2)));
    } else if (config.formato === "GRUPOS_LLAVE") {
      partidos.push(...construirLlave(categoriaId, asientosDesdeGrupos(grupos, config.clasificanPorGrupo), { tercerPuesto: config.tercerPuesto }));
      if (config.consolacion) {
        // Consolación: los que no clasificaron (3ros y 4tos), sembrados por puesto.
        const asientos: Origen[] = [];
        for (let puesto = config.clasificanPorGrupo + 1; puesto <= Math.max(...tamanos); puesto++) {
          for (const g of grupos) if (g.duplaIds.length >= puesto) asientos.push({ tipo: "GRUPO", grupoId: g.id, puesto });
        }
        if (asientos.length >= 2) partidos.push(...construirLlave(categoriaId, asientos, { cuadro: "CONSOLACION" }));
      }
    }
  }

  return {
    config,
    grupos,
    partidos,
    semilla,
    sorteadoEn: ahora ?? new Date().toISOString(),
    sorteadoPor: por,
    publicado: false,
  };
}
