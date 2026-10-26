/**
 * Ranking FVP: lectura de la lista oficial y chequeo de categorías.
 *
 * La lista sale de la hoja pública de la FVP ("Lista de ASCENSOS y ACTUALIZACIÓN
 * Ranking FVP"), exportada como CSV, o de un archivo que sube el staff. La hoja
 * trae varias tablas apiladas (una por categoría), cada una con su fila de
 * títulos, y algún título mal escrito; por eso se buscan las columnas por nombre
 * en cada tabla y la cédula manda: solo cuentan las filas que tienen una.
 *
 * Regla: nadie juega por debajo de su categoría FVP. Subir de nivel sí se puede.
 */
import type { CategoriaTorneo, Dupla, JugadorTorneo, NivelTorneo, Torneo, VerificacionFvp } from "@/types/torneo";
import type { AtletaFvp } from "@/types/ranking";

/** Hoja oficial de la FVP (enlace de su perfil de Instagram). */
export const HOJA_FVP = { id: "1lCDwPBYKAH_k2LrVq3l4MZbOaiSQx2mnek_zm96zpco", gids: ["216230878"] };

/**
 * CSV de una pestaña. Se usa la API de visualización (gviz) y no `/export`: la FVP
 * tiene desactivada la descarga y `/export` responde 400. `headers=0` evita que gviz
 * junte las primeras filas en un solo título; a cambio deja vacíos los títulos de
 * columnas numéricas (N°, ID EDO., PUNTUACIÓN), que se ubican por posición.
 */
export const urlCsvHoja = (id: string, gid: string) => `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&headers=0&gid=${gid}`;
export const urlHoja = (id: string, gid?: string) => `https://docs.google.com/spreadsheets/d/${id}/edit${gid ? `#gid=${gid}` : ""}`;

/** 1 = 1ra (la más alta) … 7 = 7ma. */
const RANGO: Record<NivelTorneo, number> = { "1RA": 1, "2DA": 2, "3RA": 3, "4TA": 4, "5TA": 5, "6TA": 6, "7MA": 7 };
const POR_RANGO: NivelTorneo[] = ["1RA", "2DA", "3RA", "4TA", "5TA", "6TA", "7MA"];

export const etiquetaNivel = (n: NivelTorneo) => n.slice(0, 1) + n.slice(1).toLowerCase();

/** ¿Puede alguien de categoría FVP `fvp` jugar una categoría `cat`? Solo en la suya o más arriba. */
export const puedeJugar = (cat: NivelTorneo, fvp: NivelTorneo) => RANGO[cat] <= RANGO[fvp];

/** La más alta de dos categorías. */
export const masAlta = (a: NivelTorneo, b: NivelTorneo) => (RANGO[a] <= RANGO[b] ? a : b);

/** Solo los dígitos de la cédula, sin ceros a la izquierda: "V-33.063.269" → "33063269". */
export function claveCedula(cedula?: string | null): string | null {
  const d = (cedula ?? "").replace(/\D/g, "").replace(/^0+/, "");
  return d.length >= 5 && d.length <= 10 ? d : null;
}

/** Formato de muestra: "V-33063269" (sin letra se asume V). */
export function formatoCedula(cedula: string): string {
  const clave = claveCedula(cedula);
  if (!clave) return cedula.trim();
  const letra = cedula.trim().match(/^[VEJP]/i)?.[0].toUpperCase() ?? "V";
  return `${letra}-${clave}`;
}

const sinAcentos = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const ORDINALES = ["primera", "segunda", "tercera", "cuarta", "quinta", "sexta", "septima"];

/** "1ra", "2DA", "Tercera", "4°", "5ta categoría" → NivelTorneo. */
export function leerNivel(x?: string | null): NivelTorneo | null {
  const s = sinAcentos(x ?? "");
  if (!s) return null;
  const m = s.match(/^([1-7])\s*(?:ra|da|ta|ma|era|°|º|a|o)?(?![\d])/);
  if (m) return POR_RANGO[Number(m[1]) - 1];
  const i = ORDINALES.findIndex((o) => s.startsWith(o));
  return i >= 0 ? POR_RANGO[i] : null;
}

/** "Master +40", "MASTER 55", "Sub-13", "SUB 14", "Junior Sub-16" → etiqueta normalizada ("Master +40", "Sub-13"). */
export function leerEspecial(x?: string | null): string | null {
  const s = sinAcentos(x ?? "");
  const m = s.match(/master\s*\+?\s*(\d{2})/) ?? s.match(/^\+\s*(\d{2})$/);
  if (m) return `Master +${m[1]}`;
  const j = s.match(/sub\s*-?\s*(\d{1,2})/) ?? s.match(/^u\s*-?\s*(\d{1,2})$/);
  if (j) return `Sub-${Number(j[1])}`;
  return null;
}

function leerGenero(x?: string | null): "M" | "F" | null {
  const s = sinAcentos(x ?? "");
  if (/^(m|masc|caballero|hombre|varon)/.test(s)) return "M";
  if (/^(f|fem|dama|mujer)/.test(s)) return "F";
  return null;
}

function leerPuntos(x?: string | null): number | null {
  const s = (x ?? "").trim();
  if (!s) return null;
  const n = /^\d{1,3}(\.\d{3})+$/.test(s) ? Number(s.replace(/\./g, "")) : Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/* ---------- CSV ---------- */

/** CSV o texto pegado desde la hoja (tabs). Respeta comillas y saltos de línea dentro de ellas. */
export function leerCsv(texto: string): string[][] {
  const limpio = texto.replace(/^﻿/, "");
  const primera = limpio.split(/\r?\n/, 1)[0];
  const sep = primera.includes("\t") ? "\t" : (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ";" : ",";
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (c === '"') comillas = false;
      else celda += c;
    } else if (c === '"' && celda === "") comillas = true;
    else if (c === sep) {
      fila.push(celda);
      celda = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpio[i + 1] === "\n") i++;
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else celda += c;
  }
  if (celda !== "" || fila.length) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas.map((f) => f.map((x) => x.trim()));
}

/* ---------- lista FVP ---------- */

interface Columnas {
  cedula: number;
  nombre: number;
  categoria: number;
  origen: number;
  genero: number;
  estado: number;
  puntos: number;
  movimiento: number;
}

/** Fila de títulos: la que tiene una celda "CÉDULA". Devuelve dónde está cada dato. */
function columnas(fila: string[]): Columnas | null {
  const t = fila.map(sinAcentos);
  const busca = (re: RegExp) => t.findIndex((x) => re.test(x));
  const cedula = busca(/^(cedula|c\.?i\.?|ci|documento)\b/);
  if (cedula < 0) return null;
  const final = busca(/final/);
  const categoria = final >= 0 ? final : busca(/^categoria/);
  if (categoria < 0) return null;
  const nombre = busca(/nombre|atleta|jugador/);
  const idEdo = busca(/^id\.?\s*edo/);
  const estado = busca(/^estados?$/);
  const movimiento = busca(/movimiento/);
  const puntos = busca(/puntu|puntos/);
  // Formato de la hoja FVP: … ESTADO, PUNTUACIÓN, MOVIMIENTO. Sin título, se cuentan desde MOVIMIENTO.
  const vacia = (i: number) => i >= 0 && t[i] === "";
  return {
    cedula,
    // La hoja trae el título del nombre mal escrito en alguna tabla: va justo después de la cédula.
    nombre: nombre >= 0 ? nombre : cedula + 1,
    categoria,
    origen: busca(/origen/),
    genero: busca(/genero|sexo|rama/),
    estado: estado >= 0 ? estado : idEdo >= 0 ? idEdo + 1 : movimiento > 1 ? movimiento - 2 : -1,
    puntos: puntos >= 0 ? puntos : vacia(movimiento - 1) ? movimiento - 1 : -1,
    movimiento,
  };
}

const CEDULA = /^[VEJP]?\s*-?\s*\d[\d.\s]{4,}$/i;
const MAX_AVISOS = 40;

/**
 * Lee la lista FVP (CSV de la hoja o archivo del staff).
 * Una cédula repetida se queda con la categoría más alta (la más exigente).
 */
export function leerListaFvp(texto: string): { atletas: AtletaFvp[]; avisos: string[] } {
  const avisos: string[] = [];
  const aviso = (m: string) => avisos.length < MAX_AVISOS && avisos.push(m);
  const porClave = new Map<string, AtletaFvp>();
  let cols: Columnas | null = null;
  let sinCedula = 0;
  let sinCategoria = 0;
  let repetidas = 0;

  for (const fila of leerCsv(texto)) {
    const titulos = columnas(fila);
    if (titulos) {
      cols = titulos;
      continue;
    }
    if (!cols) continue;
    const celda = (i: number) => (i >= 0 ? (fila[i] ?? "").trim() : "");
    const ced = celda(cols.cedula);
    const nombre = celda(cols.nombre).replace(/\s+/g, " ");
    if (!ced || !CEDULA.test(ced)) {
      if (nombre && /^s\s*\/\s*c$|^sin/i.test(ced)) sinCedula++;
      continue;
    }
    const clave = claveCedula(ced);
    const categoria = leerNivel(celda(cols.categoria));
    const especial = categoria ? null : leerEspecial(celda(cols.categoria));
    if (!clave) continue;
    if (!categoria && !especial) {
      sinCategoria++;
      aviso(`${formatoCedula(ced)} (${nombre || "sin nombre"}): no se entiende la categoría "${celda(cols.categoria)}".`);
      continue;
    }
    const atleta: AtletaFvp = {
      clave,
      cedula: formatoCedula(ced),
      nombre,
      genero: leerGenero(celda(cols.genero)),
      categoria,
      ...(especial ? { especiales: [especial] } : {}),
      origen: leerNivel(celda(cols.origen)),
      puntos: leerPuntos(celda(cols.puntos)),
      estado: celda(cols.estado) || null,
      movimiento: celda(cols.movimiento) || null,
    };
    const previo = porClave.get(clave);
    if (previo) {
      // Misma cédula en una tabla de nivel y en una de edad (Master / Sub): se juntan.
      const especiales = [...new Set([...(previo.especiales ?? []), ...(atleta.especiales ?? [])])];
      const base = !previo.categoria ? atleta : !categoria ? previo : masAlta(previo.categoria, categoria) === previo.categoria ? previo : atleta;
      if (previo.categoria && categoria) {
        repetidas++;
        if (previo.categoria !== categoria) aviso(`${atleta.cedula} aparece más de una vez (${previo.nombre} ${etiquetaNivel(previo.categoria)} / ${nombre} ${etiquetaNivel(categoria)}): se usa ${etiquetaNivel(base.categoria!)}.`);
      }
      porClave.set(clave, { ...base, categoria: base.categoria ?? null, ...(especiales.length ? { especiales } : {}) });
    } else porClave.set(clave, atleta);
  }

  if (sinCedula) avisos.unshift(`${sinCedula} atleta(s) sin cédula en la lista ("S/C"): no se pueden cruzar y quedan por verificar si se inscriben.`);
  if (repetidas) avisos.unshift(`${repetidas} cédula(s) repetidas: se usa la categoría más alta.`);
  if (sinCategoria) avisos.unshift(`${sinCategoria} fila(s) con categoría ilegible se ignoraron.`);
  return { atletas: [...porClave.values()], avisos };
}

/* ---------- chequeo de duplas ---------- */

export type BuscarAtleta = (cedula?: string | null) => AtletaFvp | null;

export function buscadorFvp(atletas: AtletaFvp[]): BuscarAtleta {
  const mapa = new Map(atletas.map((a) => [a.clave, a]));
  return (cedula) => {
    const clave = claveCedula(cedula);
    return clave ? (mapa.get(clave) ?? null) : null;
  };
}

const nombreDe = (j: JugadorTorneo) => [j.nombre, j.apellido].filter(Boolean).join(" ");

/**
 * Chequea una dupla contra el ranking. null = la categoría no es por nivel (Master, Junior, libre).
 * `buscar` null = no hay lista cargada: todo queda por verificar.
 */
export function verificarDupla(
  cat: CategoriaTorneo,
  jugadores: [JugadorTorneo, JugadorTorneo],
  buscar: BuscarAtleta | null,
  extra: { lista?: string | null; en?: string } = {},
): VerificacionFvp | null {
  if (cat.tipo !== "NIVEL" || !cat.nivel) return null;
  const en = extra.en ?? new Date().toISOString();
  if (!buscar) return { estado: "POR_VERIFICAR", categorias: [null, null], nota: "No hay lista FVP cargada.", en, lista: null };
  const bloqueos: string[] = [];
  const faltan: string[] = [];
  const categorias = jugadores.map((j) => {
    if (!claveCedula(j.cedula)) {
      faltan.push(`${nombreDe(j)}: sin cédula`);
      return null;
    }
    const a = buscar(j.cedula);
    if (!a) {
      faltan.push(`${nombreDe(j)}: no aparece en la lista FVP`);
      return null;
    }
    if (!a.categoria) {
      faltan.push(`${nombreDe(j)}: en la FVP solo figura en ${a.especiales?.join(", ") || "una categoría por edad"}, sin categoría de nivel`);
      return null;
    }
    if (!puedeJugar(cat.nivel!, a.categoria)) bloqueos.push(`${nombreDe(j)} es ${etiquetaNivel(a.categoria)} FVP y no puede jugar ${etiquetaNivel(cat.nivel!)}.`);
    return a.categoria;
  }) as [NivelTorneo | null, NivelTorneo | null];
  const estado = bloqueos.length ? "BLOQUEADA" : faltan.length ? "POR_VERIFICAR" : "VERIFICADA";
  const nota = [...bloqueos, ...faltan].join(" ") || undefined;
  return { estado, categorias, nota, en, lista: extra.lista ?? null };
}

/** Duplas activas de categorías por nivel que frenan el sorteo (por verificar o bloqueadas). */
export function pendientesFvp(t: Torneo, categoriaId: string): Dupla[] {
  if (t.validarFvp === false) return [];
  const c = t.categorias.find((x) => x.categoria.id === categoriaId);
  if (!c || c.categoria.tipo !== "NIVEL") return [];
  return c.duplas.filter((d) => d.estado === "ACTIVA" && d.fvp && (d.fvp.estado === "POR_VERIFICAR" || d.fvp.estado === "BLOQUEADA"));
}

/**
 * Lo que hace el servidor al guardar un torneo: vuelve a chequear con la lista FVP
 * las duplas nuevas o cambiadas (el cliente no puede marcarse "verificada" solo) y
 * firma las excepciones con el staff de la sesión. Las duplas que no cambiaron se
 * respetan aunque la lista se haya actualizado después (un ascenso no saca a nadie
 * de un torneo ya inscrito).
 */
export function revisarFvpServidor(
  existente: Torneo | null,
  entrante: Torneo,
  buscar: BuscarAtleta | null,
  ctx: { lista?: string | null; staff: string; en?: string },
): { torneo: Torneo; cambios: number } {
  if (entrante.validarFvp === false) return { torneo: entrante, cambios: 0 };
  const en = ctx.en ?? new Date().toISOString();
  const jugadoresNuevos = new Map(entrante.jugadores.map((j) => [j.id, j]));
  const jugadoresViejos = new Map((existente?.jugadores ?? []).map((j) => [j.id, j]));
  let cambios = 0;
  const categorias = entrante.categorias.map((c) => {
    if (c.categoria.tipo !== "NIVEL") return c;
    const previas = new Map((existente?.categorias.find((x) => x.categoria.id === c.categoria.id)?.duplas ?? []).map((d) => [d.id, d]));
    const duplas = c.duplas.map((d) => {
      if (d.estado !== "ACTIVA") return d;
      const p = previas.get(d.id);
      const js = d.jugadorIds.map((id) => jugadoresNuevos.get(id));
      if (!js[0] || !js[1]) return d;
      const cedulasCambiaron = d.jugadorIds.some((id) => claveCedula(jugadoresViejos.get(id)?.cedula) !== claveCedula(jugadoresNuevos.get(id)?.cedula));
      const cambio = !p || p.jugadorIds.join() !== d.jugadorIds.join() || cedulasCambiaron || JSON.stringify(p.fvp ?? null) !== JSON.stringify(d.fvp ?? null);
      if (!cambio) return d;
      if (d.fvp?.estado === "EXCEPCION" && d.fvp.nota?.trim()) {
        // Excepción ya firmada para la misma dupla: se conserva tal cual estaba.
        const misma = p?.fvp?.estado === "EXCEPCION" && p.fvp.nota === d.fvp.nota && !cedulasCambiaron && p.jugadorIds.join() === d.jugadorIds.join();
        const fvp = misma ? p!.fvp! : { ...d.fvp, por: ctx.staff };
        if (JSON.stringify(fvp) === JSON.stringify(d.fvp)) return d;
        cambios++;
        return { ...d, fvp };
      }
      // Sin lista en el servidor no hay con qué contrastar: se deja lo que mandó el staff.
      if (!buscar) return d;
      const v = verificarDupla(c.categoria, js as [JugadorTorneo, JugadorTorneo], buscar, { lista: ctx.lista, en });
      if (!v || (d.fvp?.estado === v.estado && d.fvp.categorias?.join() === v.categorias.join())) return d;
      cambios++;
      return { ...d, fvp: v };
    });
    return { ...c, duplas };
  });
  return cambios ? { torneo: { ...entrante, categorias }, cambios } : { torneo: entrante, cambios: 0 };
}

/** Resumen por categoría (para la pantalla del ranking). */
export function contarPorCategoria(atletas: AtletaFvp[]): Partial<Record<NivelTorneo, number>> {
  const out: Partial<Record<NivelTorneo, number>> = {};
  for (const a of atletas) if (a.categoria) out[a.categoria] = (out[a.categoria] ?? 0) + 1;
  return out;
}

/** Cuántos hay en cada categoría por edad ("Master +40", "Sub-13", …). */
export function contarEspeciales(atletas: AtletaFvp[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of atletas) for (const e of a.especiales ?? []) out[e] = (out[e] ?? 0) + 1;
  return out;
}

/**
 * Búsqueda por nombre o cédula: sin importar acentos, mayúsculas ni el orden de las
 * palabras ("miguel martinez" encuentra "MARTÍNEZ PÉREZ, MIGUEL ÁNGEL"); la cédula con
 * o sin "V-" y puntos, también incompleta.
 */
export function buscarAtletas(atletas: AtletaFvp[], q: string, limite = 25): AtletaFvp[] {
  const palabras = sinAcentos(q)
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!palabras.length) return [];
  const digitos = q.replace(/\D/g, "").replace(/^0+/, "");
  const soloCedula = digitos.length >= 4 && palabras.every((p) => /^([vejp]|[vejp]?\d+)$/.test(p));
  const out: AtletaFvp[] = [];
  for (const a of atletas) {
    const ok = soloCedula
      ? a.clave.includes(digitos)
      : (() => {
          const nombre = ` ${sinAcentos(a.nombre).replace(/[^a-z0-9ñ\s]/g, " ")} `;
          return palabras.every((p) => nombre.includes(` ${p}`));
        })();
    if (ok) out.push(a);
    if (out.length >= limite) break;
  }
  return out;
}
