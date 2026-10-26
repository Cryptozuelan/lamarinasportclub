/**
 * Motor del marcador punto a punto (pádel).
 *
 * El marcador guarda solo la lista de puntos; todo lo demás (games, sets, quién
 * saca, cambio de lado, punto de oro, tie-break, break/set/match point y
 * estadísticas) se calcula re-jugando esa lista. Así "Deshacer" es quitar el
 * último punto y nunca queda un estado inconsistente.
 *
 * Sigue el Reglamento de Juego de la FIP (rev. 28.05.2021): Regla 1 (puntuación, punto de oro,
 * tie-break y métodos alternativos), Regla 2 (tiempos), Regla 5 (cambios de campo), Regla 6 y 8
 * (orden de saque y resto por set) y la tabla de penalizaciones.
 */
import type { AtencionMedica, FinPunto, Golpe, MarcadorVivo, NivelSancion, PuntoRegistrado, ReglasPartido, SancionPartido } from "@/types/torneo";
import type { SetScore } from "@/types/americano";

export type Lado = "A" | "B";
const otro = (l: Lado): Lado => (l === "A" ? "B" : "A");
const k = (l: Lado) => (l === "A" ? "a" : "b");

export type EventoPunto = "GAME" | "SET" | "PARTIDO" | null;

export interface PuntoJugado extends PuntoRegistrado {
  n: number;
  sacador: string;
  equipoSaca: Lado;
  /** Marcador antes del punto, desde A: "30-40", "5-4" en tie. */
  antes: string;
  /** Se jugó a punto de oro (40-40 con punto de oro). */
  oro: boolean;
  /** Antes del punto, la dupla que resta tenía break point. */
  breakPoint: boolean;
  enTie: boolean;
  evento: EventoPunto;
  /** Games del set tras el punto, ej. {a: 4, b: 3}. */
  games: SetScore;
  setIndex: number;
}

export interface EstadoMarcador {
  /** Sets cerrados + el set en curso (si no terminó el partido). */
  sets: SetScore[];
  setActual: number;
  games: SetScore;
  /** Puntos del game (o del tie) en curso. */
  puntos: SetScore;
  enTie: boolean;
  enSuperTie: boolean;
  sacador: string;
  equipoSaca: Lado;
  setsGanados: SetScore;
  terminado: boolean;
  ganador: Lado | null;
  /** 40-40 con punto de oro: el próximo punto define el game. */
  puntoDeOro: boolean;
  breakPoint: Lado | null;
  setPoint: Lado | null;
  matchPoint: Lado | null;
  /** Tras el último punto, los jugadores cambian de lado. */
  cambioDeLado: boolean;
  /** Cambios de lado hechos hasta ahora (para dibujar a cada dupla en su lado real). */
  cambiosDeLado: number;
  /** Texto de los puntos: ["40", "AD"] o ["5", "4"] en tie. */
  texto: [string, string];
  jugados: PuntoJugado[];
  /** Puntos seguidos de la dupla que ganó el último. */
  racha: { lado: Lado | null; puntos: number };
}

const ETIQUETA = ["0", "15", "30", "40"];

export const setsNecesarios = (r: ReglasPartido) => (r.sets === 3 ? 2 : 1);

/** ¿El set `i` se juega como súper tie-break? */
export const esSuperTie = (r: ReglasPartido, i: number) => r.sets === 3 && r.superTie && i === 2;

/** Puntos del tie-break decisivo que reemplaza al tercer set (FIP: 10 o 7). */
export const puntosTieDecisivo = (r: ReglasPartido) => r.tieDecisivo ?? 10;

function textoGame(p: SetScore, oro: boolean): [string, string] {
  if (p.a >= 3 && p.b >= 3) {
    if (oro || p.a === p.b) return ["40", "40"];
    return p.a > p.b ? ["AD", "40"] : ["40", "AD"];
  }
  return [ETIQUETA[Math.min(p.a, 3)], ETIQUETA[Math.min(p.b, 3)]];
}

/** ¿Este punto, si lo gana `l`, cierra el game/tie? */
function cierraGame(r: ReglasPartido, p: SetScore, l: Lado, enTie: boolean, superTie: boolean): boolean {
  const mio = p[k(l)] + 1;
  const suyo = p[k(otro(l))];
  if (enTie) {
    const meta = superTie ? puntosTieDecisivo(r) : 7;
    return mio >= meta && mio - suyo >= 2;
  }
  if (r.puntoDeOro && p.a === 3 && p.b === 3) return true;
  return mio >= 4 && mio - suyo >= 2;
}

function cierraSet(r: ReglasPartido, g: SetScore, l: Lado, enTie: boolean): boolean {
  if (enTie) return true;
  const mio = g[k(l)] + 1;
  const suyo = g[k(otro(l))];
  return mio >= r.games && mio - suyo >= 2;
}

function entraEnTie(r: ReglasPartido, g: SetScore, set: number): boolean {
  if (r.tercerSetLargo && set === 2) return false;
  return r.tieBreakEn !== null && g.a === r.tieBreakEn && g.b === r.tieBreakEn;
}

/** Orden de saque vigente en el set `i`: el inicial con los cambios dentro de cada dupla pedidos al empezar un set. */
export function ordenDelSet(m: Pick<MarcadorVivo, "ordenSaque" | "ordenSets" | "jugadoresA">, i: number): [string, string, string, string] {
  let cambio: { A?: boolean; B?: boolean } = {};
  for (let s = 0; s <= i; s++) if (m.ordenSets?.[s]) cambio = m.ordenSets[s];
  const [s0, s1, s2, s3] = m.ordenSaque;
  const o: [string, string, string, string] = [s0, s1, s2, s3];
  const ladoDe = (id: string): Lado => (m.jugadoresA.includes(id) ? "A" : "B");
  // Posiciones 0 y 2 son de una dupla; 1 y 3 de la otra.
  if (cambio[ladoDe(s0)]) [o[0], o[2]] = [o[2], o[0]];
  if (cambio[ladoDe(s1)]) [o[1], o[3]] = [o[3], o[1]];
  return o;
}

export function calcularMarcador(m: Pick<MarcadorVivo, "reglas" | "ordenSaque" | "puntos" | "jugadoresA" | "ordenSets">): EstadoMarcador {
  const r = m.reglas;
  let orden = ordenDelSet(m, 0);
  const equipoDe = (id: string): Lado => (m.jugadoresA.includes(id) ? "A" : "B");

  const sets: SetScore[] = [{ a: 0, b: 0 }];
  let setActual = 0;
  let games: SetScore = { a: 0, b: 0 };
  let puntos: SetScore = { a: 0, b: 0 };
  let enTie = esSuperTie(r, 0);
  let numGame = 0; // games jugados en todo el partido (para el orden de saque)
  let puntosEnTie = 0;
  const setsG: SetScore = { a: 0, b: 0 };
  let terminado = false;
  let ganador: Lado | null = null;
  let cambioDeLado = false;
  let cambiosDeLado = 0;
  const jugados: PuntoJugado[] = [];
  let racha = { lado: null as Lado | null, puntos: 0 };

  const sacadorActual = () => (enTie ? orden[(numGame + Math.floor((puntosEnTie + 1) / 2)) % 4] : orden[numGame % 4]);

  m.puntos.forEach((pt, n) => {
    if (terminado) return;
    const sacador = sacadorActual();
    const equipoSaca = equipoDe(sacador);
    const superT = esSuperTie(r, setActual);
    const oro = !enTie && r.puntoDeOro && puntos.a === 3 && puntos.b === 3;
    const resta = otro(equipoSaca);
    const breakPoint = !enTie && cierraGame(r, puntos, resta, false, false);
    const antes = enTie ? `${puntos.a}-${puntos.b}` : textoGame(puntos, r.puntoDeOro).join("-");
    const tieAntes = enTie;
    const setAntes = setActual;
    const l = pt.gana;
    let evento: EventoPunto = null;
    cambioDeLado = false;

    racha = racha.lado === l ? { lado: l, puntos: racha.puntos + 1 } : { lado: l, puntos: 1 };

    if (cierraGame(r, puntos, l, enTie, superT)) {
      evento = "GAME";
      const setCerrado = cierraSet(r, games, l, enTie);
      games = { ...games, [k(l)]: games[k(l)] + 1 };
      numGame++;
      puntos = { a: 0, b: 0 };
      puntosEnTie = 0;
      if (setCerrado) {
        evento = "SET";
        sets[setActual] = { ...games };
        setsG[k(l)]++;
        const totalSet = games.a + games.b;
        if (setsG[k(l)] >= setsNecesarios(r)) {
          terminado = true;
          ganador = l;
          evento = "PARTIDO";
        } else {
          setActual++;
          sets.push({ a: 0, b: 0 });
          games = { a: 0, b: 0 };
          enTie = esSuperTie(r, setActual);
          orden = ordenDelSet(m, setActual);
          // Tras un set con número impar de games se cambia de lado (el tie-break cuenta como un game).
          cambioDeLado = totalSet % 2 === 1;
        }
      } else {
        sets[setActual] = { ...games };
        enTie = entraEnTie(r, games, setActual);
        cambioDeLado = (games.a + games.b) % 2 === 1;
      }
    } else {
      puntos = { ...puntos, [k(l)]: puntos[k(l)] + 1 };
      if (enTie) {
        puntosEnTie++;
        cambioDeLado = puntosEnTie % 6 === 0;
      }
    }

    if (cambioDeLado) cambiosDeLado++;
    jugados.push({ ...pt, n: n + 1, sacador, equipoSaca, antes, oro, breakPoint, enTie: tieAntes, evento, games: { ...sets[setAntes] }, setIndex: setAntes });
  });

  const sacador = sacadorActual();
  const equipoSaca = equipoDe(sacador);
  const superT = esSuperTie(r, setActual);
  const resta = otro(equipoSaca);
  const puntoDeOro = !terminado && !enTie && r.puntoDeOro && puntos.a === 3 && puntos.b === 3;
  const breakPoint = !terminado && !enTie && cierraGame(r, puntos, resta, false, false) ? resta : null;
  const amenaza = (l: Lado) => !terminado && cierraGame(r, puntos, l, enTie, superT) && cierraSet(r, games, l, enTie);
  const setPoint = amenaza("A") ? "A" : amenaza("B") ? "B" : null;
  const matchPoint = setPoint && setsG[k(setPoint)] + 1 >= setsNecesarios(r) ? setPoint : null;
  const texto: [string, string] = enTie ? [String(puntos.a), String(puntos.b)] : textoGame(puntos, r.puntoDeOro);

  return {
    sets,
    setActual,
    games,
    puntos,
    enTie,
    enSuperTie: enTie && superT,
    sacador,
    equipoSaca,
    setsGanados: setsG,
    terminado,
    ganador,
    puntoDeOro,
    breakPoint,
    setPoint,
    matchPoint,
    cambioDeLado,
    cambiosDeLado,
    texto,
    jugados,
    racha,
  };
}

/** Sets para guardar como resultado del partido (sin el set vacío final). */
export function setsFinales(e: EstadoMarcador): SetScore[] {
  return e.sets.filter((s, i) => i < e.setActual || s.a + s.b > 0 || e.terminado);
}

/* ---------- registrar ---------- */

export function anotarPunto(m: MarcadorVivo, gana: Lado, detalle: Partial<Pick<PuntoRegistrado, "fin" | "jugadorId" | "golpe">> = {}): MarcadorVivo {
  if (calcularMarcador(m).terminado) return m;
  const punto: PuntoRegistrado = {
    gana,
    fin: detalle.fin ?? null,
    jugadorId: detalle.jugadorId ?? null,
    golpe: detalle.golpe ?? null,
    primerSaqueFalla: m.faltaPendiente || undefined,
    t: new Date().toISOString(),
  };
  return { ...m, puntos: [...m.puntos, punto], faltaPendiente: false, actualizadoEn: new Date().toISOString() };
}

/** Completa el detalle del último punto (toques 2 y 3 del anotador). */
export function detallarUltimo(m: MarcadorVivo, detalle: Partial<Pick<PuntoRegistrado, "fin" | "jugadorId" | "golpe" | "zona">>): MarcadorVivo {
  if (!m.puntos.length) return m;
  const puntos = [...m.puntos];
  puntos[puntos.length - 1] = { ...puntos[puntos.length - 1], ...detalle };
  return { ...m, puntos, actualizadoEn: new Date().toISOString() };
}

/** Falta de saque: la primera queda pendiente; la segunda es doble falta (punto para quien resta). */
export function faltaSaque(m: MarcadorVivo): MarcadorVivo {
  const e = calcularMarcador(m);
  if (e.terminado) return m;
  if (!m.faltaPendiente) return { ...m, faltaPendiente: true, actualizadoEn: new Date().toISOString() };
  return anotarPunto(m, otro(e.equipoSaca), { fin: "DOBLE_FALTA", jugadorId: e.sacador, golpe: "SAQUE" });
}

export function ace(m: MarcadorVivo): MarcadorVivo {
  const e = calcularMarcador(m);
  return anotarPunto(m, e.equipoSaca, { fin: "ACE", jugadorId: e.sacador, golpe: "SAQUE" });
}

export function deshacer(m: MarcadorVivo): MarcadorVivo {
  if (m.faltaPendiente) return { ...m, faltaPendiente: false, actualizadoEn: new Date().toISOString() };
  if (!m.puntos.length) return m;
  const quitado = m.puntos.length - 1;
  // Si el punto era por sanción, la sanción se va con él.
  const sanciones = m.sanciones?.filter((s) => s.punto !== quitado);
  return { ...m, puntos: m.puntos.slice(0, -1), sanciones, actualizadoEn: new Date().toISOString() };
}

/* ---------- orden de saque por set (FIP Regla 6.10 y 8.3) ---------- */

/**
 * Al empezar un set cada dupla puede cambiar quién saca primero. Alterna, para el set `set`,
 * el sacador de la dupla `lado` respecto del orden que venía rigiendo.
 */
export function alternarOrdenSet(m: MarcadorVivo, set: number, lado: Lado): MarcadorVivo {
  let vigente: { A?: boolean; B?: boolean } = {};
  for (let s = 0; s <= set; s++) if (m.ordenSets?.[s]) vigente = m.ordenSets[s];
  const nuevo = { ...vigente, [lado]: !vigente[lado] };
  return { ...m, ordenSets: { ...m.ordenSets, [set]: nuevo }, actualizadoEn: new Date().toISOString() };
}

/** Al inicio de un set (0-0, ningún punto jugado en él) se puede elegir el orden de saque de cada dupla. */
export function puedeElegirOrden(e: EstadoMarcador): boolean {
  return !e.terminado && e.setActual > 0 && e.games.a + e.games.b === 0 && e.puntos.a + e.puntos.b === 0;
}

/* ---------- tiempos (FIP Regla 2) ---------- */

export interface Descanso {
  segundos: number;
  motivo: string;
}

/**
 * Tiempo máximo hasta el próximo saque según el último punto:
 * 20 s entre puntos, 90 s en el cambio de lado, sin descanso tras el primer game del set,
 * 20 s en los cambios del tie-break y 120 s al terminar un set.
 */
export function descansoReglamentario(e: EstadoMarcador): Descanso | null {
  const u = e.jugados.at(-1);
  if (!u || e.terminado) return null;
  if (u.evento === "SET") return { segundos: 120, motivo: e.cambioDeLado ? "Fin de set · cambio de lado" : "Fin de set" };
  if (u.enTie && e.cambioDeLado) return { segundos: 20, motivo: "Cambio de lado en el tie-break" };
  if (u.evento === "GAME" && e.cambioDeLado) {
    return u.games.a + u.games.b === 1 ? { segundos: 0, motivo: "Cambio de lado sin descanso (primer game del set)" } : { segundos: 90, motivo: "Cambio de lado" };
  }
  return { segundos: 20, motivo: "Entre puntos" };
}

/**
 * Cambio de lado que está corriendo ahora (para el aviso del árbitro y las pantallas):
 * tras el primer game del set se cambia sin descanso (se avisa 20 s), en los demás games
 * impares hay 90 s, al terminar un set 120 s y en el tie-break 20 s cada 6 puntos.
 */
export function cambioDeLadoEnCurso(e: EstadoMarcador, ahora: number): (Descanso & { quedan: number; directo: boolean }) | null {
  const d = descansoReglamentario(e);
  const u = e.jugados.at(-1);
  if (!d || !u || !e.cambioDeLado) return null;
  const directo = d.segundos === 0;
  const quedan = Math.ceil((new Date(u.t).getTime() + (directo ? 20 : d.segundos) * 1000 - ahora) / 1000);
  if (quedan <= -10) return null;
  return { ...d, quedan, directo };
}

/** Peloteo al reanudar un partido suspendido por causas ajenas a los jugadores (FIP Regla 2.11–2.14). */
export function peloteoTrasSuspension(minutosSuspendido: number): number {
  if (minutosSuspendido <= 5) return 0;
  if (minutosSuspendido <= 20) return 3;
  return 5;
}

/* ---------- sanciones (FIP, tabla de penalizaciones) ---------- */

export const NOMBRE_SANCION: Record<NivelSancion, string> = {
  ADVERTENCIA: "Advertencia",
  PUNTO: "Advertencia con pérdida de punto",
  DESCALIFICACION: "Descalificación",
};

/** Qué sanción le toca a la dupla en su próxima infracción (se acumulan entre sus dos jugadores). */
export function proximaSancion(m: Pick<MarcadorVivo, "sanciones">, lado: Lado): NivelSancion {
  const n = (m.sanciones ?? []).filter((s) => s.lado === lado).length;
  return n === 0 ? "ADVERTENCIA" : n === 1 ? "PUNTO" : "DESCALIFICACION";
}

/**
 * Registra una infracción. La 2ª da el punto a la otra dupla; la 3ª (o una infracción muy grave,
 * `directa`) descalifica: el partido se cierra a favor de la otra dupla.
 */
export function sancionar(
  m: MarcadorVivo,
  input: { lado: Lado; jugadorId?: string | null; motivo: string; directa?: boolean },
): { marcador: MarcadorVivo; nivel: NivelSancion } {
  const nivel: NivelSancion = input.directa ? "DESCALIFICACION" : proximaSancion(m, input.lado);
  const t = new Date().toISOString();
  const sancion: SancionPartido = { lado: input.lado, jugadorId: input.jugadorId ?? null, nivel, motivo: input.motivo, t, ...(input.directa ? { directa: true } : {}) };
  let marcador: MarcadorVivo = m;
  if (nivel === "PUNTO" && !calcularMarcador(m).terminado) {
    sancion.punto = m.puntos.length;
    marcador = anotarPunto({ ...m, faltaPendiente: false }, otro(input.lado), { fin: "SANCION", jugadorId: input.jugadorId ?? null });
  }
  return { marcador: { ...marcador, sanciones: [...(m.sanciones ?? []), sancion], actualizadoEn: t }, nivel };
}

/** Quita la última sanción (si fue de punto, también ese punto, siempre que sea el último). */
export function quitarUltimaSancion(m: MarcadorVivo): MarcadorVivo {
  const lista = m.sanciones ?? [];
  const ult = lista.at(-1);
  if (!ult) return m;
  if (ult.punto !== undefined) {
    if (ult.punto !== m.puntos.length - 1) return m;
    return deshacer(m);
  }
  return { ...m, sanciones: lista.slice(0, -1), actualizadoEn: new Date().toISOString() };
}

/* ---------- atención médica (FIP Regla 2.17–2.20) ---------- */

export const SEGUNDOS_ATENCION: Record<AtencionMedica["tipo"], number> = { LESION: 180, ACCIDENTE: 900 };

/** Un jugador tiene una sola atención por lesión por partido (no la puede ceder). El accidente ajeno al juego no cuenta. */
export function puedePedirAtencion(m: Pick<MarcadorVivo, "atenciones">, jugadorId: string, tipo: AtencionMedica["tipo"]): boolean {
  if (tipo === "ACCIDENTE") return true;
  return !(m.atenciones ?? []).some((a) => a.jugadorId === jugadorId && a.tipo === "LESION");
}

export function pedirAtencion(m: MarcadorVivo, jugadorId: string, tipo: AtencionMedica["tipo"]): MarcadorVivo {
  if (!puedePedirAtencion(m, jugadorId, tipo)) return m;
  const t = new Date().toISOString();
  return { ...m, atenciones: [...(m.atenciones ?? []), { jugadorId, tipo, t }], actualizadoEn: t };
}

/** Atención en curso (si la hay) y segundos que le quedan. */
export function atencionEnCurso(m: Pick<MarcadorVivo, "atenciones">, ahora = Date.now()): { atencion: AtencionMedica; quedan: number } | null {
  const a = m.atenciones?.at(-1);
  if (!a) return null;
  const quedan = Math.ceil((new Date(a.t).getTime() + SEGUNDOS_ATENCION[a.tipo] * 1000 - ahora) / 1000);
  return quedan > 0 ? { atencion: a, quedan } : null;
}

/* ---------- relato ---------- */

export const NOMBRE_FIN: Record<FinPunto, string> = {
  WINNER: "Winner",
  ERROR_NO_FORZADO: "Error no forzado",
  ERROR_FORZADO: "Error forzado",
  ACE: "Ace",
  DOBLE_FALTA: "Doble falta",
  SANCION: "Punto por sanción",
};

export const NOMBRE_GOLPE: Record<Golpe, string> = {
  REMATE: "remate",
  X3: "x3",
  X4: "x4",
  VIBORA: "víbora",
  BANDEJA: "bandeja",
  VOLEA: "volea",
  GLOBO: "globo",
  CHIQUITA: "chiquita",
  BAJADA: "bajada de pared",
  DRIVE: "drive",
  REVES: "revés",
  SAQUE: "saque",
};

export function relatoPunto(p: PuntoJugado, nombreJugador: (id: string) => string, nombreLado: (l: Lado) => string): string {
  const quien = p.jugadorId ? nombreJugador(p.jugadorId) : null;
  let base = `Punto para ${nombreLado(p.gana)}`;
  if (p.fin === "ACE") base = `${quien}, ace. ${base}`;
  else if (p.fin === "DOBLE_FALTA") base = `${quien}, doble falta. ${base}`;
  else if (p.fin === "SANCION") base = `Sanción${quien ? ` a ${quien}` : ""}: punto para ${nombreLado(p.gana)}`;
  else if (p.fin) {
    const golpe = p.golpe && p.golpe !== "SAQUE" ? ` de ${NOMBRE_GOLPE[p.golpe]}` : "";
    const zona = p.fin.startsWith("ERROR") && p.zona ? (p.zona === "RED" ? " a la red" : " afuera") : "";
    base = `${quien ? `${quien}, ` : ""}${NOMBRE_FIN[p.fin].toLowerCase()}${golpe}${zona}. ${base}`;
  }
  base = base.charAt(0).toUpperCase() + base.slice(1);
  if (p.oro) base += " · punto de oro";
  if (p.breakPoint && p.gana !== p.equipoSaca) base += " · break";
  return base;
}

/**
 * Relato para el público (televisores y pantallas de pista): quién ganó el punto y si fue
 * de oro o break, sin atribuir winners ni errores a cada atleta (eso lo ven solo los participantes).
 */
export function relatoPublico(p: PuntoJugado, nombreLado: (l: Lado) => string): string {
  let base = p.fin === "SANCION" ? `Punto por sanción para ${nombreLado(p.gana)}` : `Punto para ${nombreLado(p.gana)}`;
  if (p.oro) base += " · punto de oro";
  if (p.breakPoint && p.gana !== p.equipoSaca) base += " · break";
  return base;
}

/* ---------- estadísticas ---------- */

export interface StatsJugador {
  jugadorId: string;
  lado: Lado;
  puntosJugados: number;
  puntosGanados: number;
  winners: number;
  erroresNoForzados: number;
  erroresForzados: number;
  aces: number;
  doblesFaltas: number;
  saques: number;
  primerosDentro: number;
  puntosAlSaque: number;
  ganadosAlSaque: number;
  puntosAlResto: number;
  ganadosAlResto: number;
  puntosDeOro: number;
  puntosDeOroGanados: number;
  breakPoints: number;
  breaksConvertidos: number;
  rachaMax: number;
  /** Golpes que cerraron puntos: winners (a favor) y errores (en contra). */
  golpes: Partial<Record<Golpe, { winners: number; errores: number }>>;
}

export function statsVacias(jugadorId: string, lado: Lado): StatsJugador {
  return {
    jugadorId,
    lado,
    puntosJugados: 0,
    puntosGanados: 0,
    winners: 0,
    erroresNoForzados: 0,
    erroresForzados: 0,
    aces: 0,
    doblesFaltas: 0,
    saques: 0,
    primerosDentro: 0,
    puntosAlSaque: 0,
    ganadosAlSaque: 0,
    puntosAlResto: 0,
    ganadosAlResto: 0,
    puntosDeOro: 0,
    puntosDeOroGanados: 0,
    breakPoints: 0,
    breaksConvertidos: 0,
    rachaMax: 0,
    golpes: {},
  };
}

export function statsPartido(m: MarcadorVivo): StatsJugador[] {
  const e = calcularMarcador(m);
  const ladoDe = (id: string): Lado => (m.jugadoresA.includes(id) ? "A" : "B");
  const stats = new Map<string, StatsJugador>([...m.jugadoresA, ...m.jugadoresB].map((id) => [id, statsVacias(id, ladoDe(id))]));
  const rachas: Record<Lado, number> = { A: 0, B: 0 };
  let ultimo: Lado | null = null;
  let actual = 0;
  for (const p of e.jugados) {
    // Un punto por sanción suma al marcador pero no es un punto jugado.
    if (p.fin === "SANCION") continue;
    actual = ultimo === p.gana ? actual + 1 : 1;
    ultimo = p.gana;
    rachas[p.gana] = Math.max(rachas[p.gana], actual);
    for (const s of stats.values()) {
      s.puntosJugados++;
      const gano = s.lado === p.gana;
      if (gano) s.puntosGanados++;
      if (p.oro) {
        s.puntosDeOro++;
        if (gano) s.puntosDeOroGanados++;
      }
      if (s.lado === p.equipoSaca) {
        if (p.sacador === s.jugadorId) {
          s.puntosAlSaque++;
          if (gano) s.ganadosAlSaque++;
        }
      } else {
        s.puntosAlResto++;
        if (gano) s.ganadosAlResto++;
        if (p.breakPoint) {
          s.breakPoints++;
          if (gano) s.breaksConvertidos++;
        }
      }
    }
    const sac = stats.get(p.sacador);
    if (sac) {
      sac.saques++;
      if (!p.primerSaqueFalla) sac.primerosDentro++;
    }
    const prot = p.jugadorId ? stats.get(p.jugadorId) : undefined;
    if (prot && p.fin) {
      if (p.fin === "WINNER") prot.winners++;
      if (p.fin === "ACE") {
        prot.aces++;
        prot.winners++;
      }
      if (p.fin === "ERROR_NO_FORZADO") prot.erroresNoForzados++;
      if (p.fin === "ERROR_FORZADO") prot.erroresForzados++;
      if (p.fin === "DOBLE_FALTA") prot.doblesFaltas++;
      if (p.golpe) {
        const g = (prot.golpes[p.golpe] ??= { winners: 0, errores: 0 });
        if (p.fin === "WINNER" || p.fin === "ACE") g.winners++;
        else g.errores++;
      }
    }
  }
  for (const s of stats.values()) s.rachaMax = rachas[s.lado];
  return [...stats.values()];
}

/** Suma estadísticas de varios partidos (ej. todo el torneo de un jugador). */
export function sumarStats(lista: StatsJugador[]): StatsJugador | null {
  if (!lista.length) return null;
  const out = statsVacias(lista[0].jugadorId, lista[0].lado);
  for (const s of lista) {
    for (const key of Object.keys(out) as (keyof StatsJugador)[]) {
      if (typeof out[key] === "number" && key !== "rachaMax") (out[key] as number) += s[key] as number;
    }
    out.rachaMax = Math.max(out.rachaMax, s.rachaMax);
    for (const [g, v] of Object.entries(s.golpes) as [Golpe, { winners: number; errores: number }][]) {
      const t = (out.golpes[g] ??= { winners: 0, errores: 0 });
      t.winners += v.winners;
      t.errores += v.errores;
    }
  }
  return out;
}

export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);

export function nuevoMarcador(input: {
  partidoId: string;
  torneoId: string;
  categoriaId: string;
  reglas: ReglasPartido;
  jugadoresA: [string, string];
  jugadoresB: [string, string];
  /** Quién saca primero en cada dupla y qué dupla empieza. */
  sacaPrimero: Lado;
  primerA: string;
  primerB: string;
  pista?: number | null;
  anotador?: string;
  arbitroId?: string;
  sorteo?: MarcadorVivo["sorteo"];
  ladoInicialA?: MarcadorVivo["ladoInicialA"];
}): MarcadorVivo {
  const segA = input.jugadoresA.find((j) => j !== input.primerA)!;
  const segB = input.jugadoresB.find((j) => j !== input.primerB)!;
  const ordenSaque: [string, string, string, string] =
    input.sacaPrimero === "A" ? [input.primerA, input.primerB, segA, segB] : [input.primerB, input.primerA, segB, segA];
  const ahora = new Date().toISOString();
  return {
    id: input.partidoId,
    torneoId: input.torneoId,
    categoriaId: input.categoriaId,
    reglas: input.reglas,
    ordenSaque,
    jugadoresA: input.jugadoresA,
    jugadoresB: input.jugadoresB,
    puntos: [],
    pista: input.pista ?? null,
    anotador: input.anotador,
    arbitroId: input.arbitroId,
    anotadores: input.arbitroId && input.anotador ? [{ id: input.arbitroId, nombre: input.anotador }] : undefined,
    sorteo: input.sorteo ?? null,
    ladoInicialA: input.ladoInicialA,
    iniciadoEn: ahora,
    finalizado: false,
    actualizadoEn: ahora,
  };
}

/** Lado de la pista (visto desde la silla del árbitro) donde está ahora cada dupla. */
export function ladoActual(m: MarcadorVivo, e: Pick<EstadoMarcador, "cambiosDeLado">, l: Lado): "IZQ" | "DER" {
  const inicialA = m.ladoInicialA ?? "IZQ";
  const a = e.cambiosDeLado % 2 === 0 ? inicialA : inicialA === "IZQ" ? "DER" : "IZQ";
  return l === "A" ? a : a === "IZQ" ? "DER" : "IZQ";
}
