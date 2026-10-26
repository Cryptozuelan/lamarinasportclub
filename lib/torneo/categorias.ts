/** Catálogo de categorías de torneo y validación de edades (Master / Junior). */
import type { CategoriaTorneo, ConfigCuadro, FaseReglas, JugadorTorneo, NivelTorneo, RamaTorneo, ReglasPartido } from "@/types/torneo";

export const NIVELES_TORNEO: NivelTorneo[] = ["7MA", "6TA", "5TA", "4TA", "3RA", "2DA", "1RA"];

const NIVEL_LABEL: Record<NivelTorneo, string> = {
  "7MA": "7ma",
  "6TA": "6ta",
  "5TA": "5ta",
  "4TA": "4ta",
  "3RA": "3ra",
  "2DA": "2da",
  "1RA": "1ra",
};

export const RAMAS_TORNEO: { id: RamaTorneo; label: string; corto: string }[] = [
  { id: "MASCULINO", label: "Masculino", corto: "M" },
  { id: "FEMENINO", label: "Femenino", corto: "F" },
  { id: "MIXTO", label: "Mixto", corto: "X" },
];

export const EDADES_MASTER = [40, 45, 55];
export const EDADES_JUNIOR = [12, 13, 14, 16, 18];

const corto = (r: RamaTorneo) => RAMAS_TORNEO.find((x) => x.id === r)!.corto;

export function catNivel(rama: RamaTorneo, nivel: NivelTorneo): CategoriaTorneo {
  return { id: `${corto(rama)}-${nivel}`, tipo: "NIVEL", rama, nivel };
}
export function catMaster(rama: RamaTorneo, edad: number): CategoriaTorneo {
  return { id: `${corto(rama)}-MASTER${edad}`, tipo: "MASTER", rama, edad };
}
export function catJunior(rama: RamaTorneo, edad: number): CategoriaTorneo {
  return { id: `${corto(rama)}-SUB${edad}`, tipo: "JUNIOR", rama, edad };
}

/** Todas las categorías que ofrece el sistema, agrupadas como las ve el staff. */
export function catalogoCategorias(): { grupo: string; categorias: CategoriaTorneo[] }[] {
  return [
    { grupo: "Masculino", categorias: NIVELES_TORNEO.map((n) => catNivel("MASCULINO", n)) },
    { grupo: "Femenino", categorias: NIVELES_TORNEO.map((n) => catNivel("FEMENINO", n)) },
    { grupo: "Mixto", categorias: NIVELES_TORNEO.map((n) => catNivel("MIXTO", n)) },
    {
      grupo: "Master",
      categorias: EDADES_MASTER.flatMap((e) => [catMaster("MASCULINO", e), catMaster("FEMENINO", e)]),
    },
    {
      grupo: "Junior",
      categorias: EDADES_JUNIOR.flatMap((e) => [catJunior("MASCULINO", e), catJunior("FEMENINO", e)]),
    },
  ];
}

export function nombreCategoria(c: CategoriaTorneo): string {
  if (c.nombre?.trim()) return c.nombre.trim();
  const rama = RAMAS_TORNEO.find((r) => r.id === c.rama)!.label;
  if (c.tipo === "MASTER") return `Master +${c.edad} ${rama}`;
  if (c.tipo === "JUNIOR") return `Junior Sub-${c.edad} ${rama}`;
  if (c.tipo === "NIVEL" && c.nivel) return `${NIVEL_LABEL[c.nivel]} ${rama}`;
  return rama;
}

/** Etiqueta corta para chips: "4ta M", "+45 F", "Sub-14 M". */
export function nombreCorto(c: CategoriaTorneo): string {
  if (c.nombre?.trim()) return c.nombre.trim();
  const r = corto(c.rama);
  if (c.tipo === "MASTER") return `+${c.edad} ${r}`;
  if (c.tipo === "JUNIOR") return `Sub-${c.edad} ${r}`;
  if (c.nivel) return `${NIVEL_LABEL[c.nivel]} ${r}`;
  return r;
}

/** Edad que cumple el jugador en el año `anio` (criterio de las categorías por edad). */
export function edadEnAnio(fechaNacimiento: string, anio: number): number {
  return anio - Number(fechaNacimiento.slice(0, 4));
}

/**
 * ¿Puede jugar esta persona en la categoría? Devuelve el motivo si no.
 * - Rama: masculino solo hombres, femenino solo mujeres, mixto una de cada uno (se valida en la dupla).
 * - Master +N: cumple N o más en el año del torneo.
 * - Junior Sub-N: no cumple más de N en el año del torneo.
 */
export function validarJugador(c: CategoriaTorneo, j: JugadorTorneo, anio: number): string | null {
  if (c.rama === "MASCULINO" && j.genero !== "M") return `${j.nombre} no puede jugar en categoría masculina.`;
  if (c.rama === "FEMENINO" && j.genero !== "F") return `${j.nombre} no puede jugar en categoría femenina.`;
  if (c.tipo === "MASTER" || c.tipo === "JUNIOR") {
    if (!j.fechaNacimiento) return `Falta la fecha de nacimiento de ${j.nombre}.`;
    const edad = edadEnAnio(j.fechaNacimiento, anio);
    if (c.tipo === "MASTER" && edad < c.edad!) return `${j.nombre} cumple ${edad} en ${anio}; Master +${c.edad} pide ${c.edad} o más.`;
    if (c.tipo === "JUNIOR" && edad > c.edad!) return `${j.nombre} cumple ${edad} en ${anio}; Sub-${c.edad} es hasta ${c.edad}.`;
  }
  return null;
}

export function validarDupla(c: CategoriaTorneo, a: JugadorTorneo, b: JugadorTorneo, anio: number): string | null {
  if (a.id === b.id) return "La dupla necesita dos jugadores distintos.";
  if (c.rama === "MIXTO" && a.genero === b.genero) return "En Mixto la dupla es un hombre y una mujer.";
  return validarJugador(c, a, anio) ?? validarJugador(c, b, anio);
}

/* ---------- reglas por defecto ---------- */

export const REGLAS_BASE: ReglasPartido = { sets: 3, games: 6, tieBreakEn: 6, puntoDeOro: true, superTie: true, minutos: 90 };

/** Grupos y llave al mejor de 3 con punto de oro y súper tie; semis y final con tercer set completo. */
export function reglasPorDefecto(): Record<FaseReglas, ReglasPartido> {
  return {
    GRUPOS: { ...REGLAS_BASE },
    LLAVE: { ...REGLAS_BASE },
    SEMIS_FINAL: { ...REGLAS_BASE, superTie: false, minutos: 105 },
  };
}

export const CONFIG_CUADRO_BASE: ConfigCuadro = {
  formato: "GRUPOS_LLAVE",
  tamanoGrupo: 3,
  clasificanPorGrupo: 2,
  tercerPuesto: false,
  consolacion: false,
};

/** Juego en el que se juega el tie-break según el largo del set (FIP: mini set 4-4, set 6-6; set largo a 9, 8-8). */
export function tieBreakPorDefecto(games: number): number {
  return games === 9 ? 8 : games;
}

export function descripcionReglas(r: ReglasPartido): string {
  const sets = r.sets === 1 ? `1 set a ${r.games}` : `Mejor de 3 a ${r.games}`;
  const decisivo =
    r.sets !== 3 ? null : r.superTie ? ((r.tieDecisivo ?? 10) === 7 ? "tie-break a 7 en vez del 3er set" : "súper tie-break") : r.tercerSetLargo ? "tercer set sin tie-break" : "tercer set";
  const extra = [r.puntoDeOro ? "punto de oro" : "ventaja", r.tieBreakEn === null ? "sin tie-break" : null, decisivo].filter(Boolean).join(" · ");
  return `${sets} · ${extra}`;
}

/** Duración estimada de un partido según sus reglas (para la programación). Incluye los 5 min de peloteo (FIP Regla 2.2). */
export function minutosEstimados(r: Pick<ReglasPartido, "sets" | "games" | "superTie" | "tieDecisivo" | "tercerSetLargo">): number {
  const porSet = r.games * 7; // ~7 min por game ganado (el set promedia ~1,6 games por cada uno ganado)
  if (r.sets === 1) return Math.round((porSet * 1.1) / 15) * 15;
  const decisivo = r.superTie ? ((r.tieDecisivo ?? 10) === 7 ? 8 : 12) : porSet * (r.tercerSetLargo ? 0.7 : 0.6);
  return Math.round((porSet * 2 + decisivo) / 15) * 15;
}
