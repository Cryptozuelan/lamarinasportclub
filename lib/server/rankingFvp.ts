import "server-only";
import { buscadorFvp, contarEspeciales, contarPorCategoria, HOJA_FVP, leerListaFvp, urlCsvHoja, urlHoja, type BuscarAtleta } from "@/lib/ranking/fvp";
import type { FuenteRanking, RankingFvp, ResumenRankingFvp } from "@/types/ranking";
import { ErrorApi } from "./http";
import { getRankingRepository } from "./repository";

/**
 * Ranking FVP en el servidor: sincronización con la hoja oficial, carga manual
 * y búsqueda por cédula. Variables opcionales:
 *   FVP_SHEET_ID    id de la hoja de Google (por defecto la oficial de la FVP)
 *   FVP_SHEET_GIDS  pestañas a leer, separadas por coma
 *   CRON_SECRET     lo manda Vercel Cron en `Authorization: Bearer …`
 */

/** Una lista nueva con menos de esta fracción de la anterior se rechaza (la hoja cambió de formato o vino a medias). */
const MINIMO_RELATIVO = 0.5;
const MINIMO_ATLETAS = 20;

const hoja = () => ({
  id: process.env.FVP_SHEET_ID?.trim() || HOJA_FVP.id,
  gids: process.env.FVP_SHEET_GIDS?.split(",").map((s) => s.trim()).filter(Boolean) ?? HOJA_FVP.gids,
});

const cache = globalThis as unknown as { __fvpBuscar?: { cargadoEn: string; buscar: BuscarAtleta }; __fvpDemo?: Promise<RankingFvp | null> };

/**
 * En modo DEMO la lista vive en la memoria de cada instancia de Vercel: una instancia
 * nueva no la tiene. Para que la búsqueda y la inscripción funcionen igual, la primera
 * lectura de cada instancia la descarga de la hoja (una sola vez).
 */
export async function obtenerRanking(): Promise<RankingFvp | null> {
  const repo = getRankingRepository();
  const r = await repo.obtener();
  if (r || repo.modo !== "DEMO" || process.env.NODE_ENV === "test") return r;
  cache.__fvpDemo ??= sincronizarHoja().catch(() => null);
  return cache.__fvpDemo;
}

/** Buscador por cédula de la lista vigente (null = no hay lista). Se arma una vez por versión. */
export async function buscadorVigente(): Promise<{ buscar: BuscarAtleta; lista: string } | null> {
  const r = await obtenerRanking();
  if (!r?.atletas.length) return null;
  if (cache.__fvpBuscar?.cargadoEn !== r.cargadoEn) cache.__fvpBuscar = { cargadoEn: r.cargadoEn, buscar: buscadorFvp(r.atletas) };
  return { buscar: cache.__fvpBuscar.buscar, lista: r.cargadoEn };
}

export function resumen(r: RankingFvp | null): ResumenRankingFvp {
  if (!r) return { cargado: false, total: 0, porCategoria: {}, especiales: {}, avisos: [] };
  return {
    cargado: r.atletas.length > 0,
    fuente: r.fuente,
    cargadoEn: r.cargadoEn,
    por: r.por,
    origen: r.origen,
    total: r.atletas.length,
    porCategoria: contarPorCategoria(r.atletas),
    especiales: contarEspeciales(r.atletas),
    avisos: r.avisos,
    ultimoError: r.ultimoError,
  };
}

/** Guarda una lista nueva si es razonable; si no, conserva la anterior y anota el error. */
async function reemplazar(texto: string, fuente: FuenteRanking, origen: string, por: string | null, forzar = false): Promise<RankingFvp> {
  const repo = getRankingRepository();
  const anterior = await repo.obtener();
  const { atletas, avisos } = leerListaFvp(texto);
  const minimo = forzar ? 1 : Math.max(MINIMO_ATLETAS, Math.floor((anterior?.atletas.length ?? 0) * MINIMO_RELATIVO));
  if (atletas.length < minimo) {
    const mensaje = atletas.length
      ? `La lista trae solo ${atletas.length} atletas (la vigente tiene ${anterior?.atletas.length ?? 0}). Se conserva la anterior.`
      : "No se encontró ninguna fila con CÉDULA y CATEGORÍA. ¿Cambió el formato de la hoja?";
    if (anterior) await repo.guardar({ ...anterior, ultimoError: { en: new Date().toISOString(), mensaje } });
    throw new ErrorApi(422, mensaje, avisos.slice(0, 10));
  }
  return repo.guardar({ fuente, cargadoEn: new Date().toISOString(), por, origen, atletas, avisos, ultimoError: null });
}

/** Descarga la hoja oficial (todas sus pestañas configuradas) y la guarda. */
export async function sincronizarHoja(): Promise<RankingFvp> {
  const { id, gids } = hoja();
  const partes: string[] = [];
  try {
    for (const gid of gids) {
      const res = await fetch(urlCsvHoja(id, gid), { cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(20_000) });
      const tipo = res.headers.get("content-type") ?? "";
      if (!res.ok || tipo.includes("text/html")) throw new Error(res.ok ? "la hoja dejó de ser pública" : `Google respondió ${res.status}`);
      partes.push(await res.text());
    }
  } catch (err) {
    const mensaje = `No se pudo leer la hoja de la FVP: ${(err as Error).message}. Se conserva la lista anterior.`;
    const repo = getRankingRepository();
    const anterior = await repo.obtener();
    if (anterior) await repo.guardar({ ...anterior, ultimoError: { en: new Date().toISOString(), mensaje } });
    throw new ErrorApi(502, mensaje);
  }
  return reemplazar(partes.join("\n"), "HOJA_FVP", urlHoja(id, gids[0]), null);
}

/** Lista que sube el staff (CSV descargado de la hoja o texto pegado). */
export async function cargarManual(texto: string, archivo: string, por: string, forzar: boolean): Promise<RankingFvp> {
  if (!texto.trim()) throw new ErrorApi(400, "El archivo está vacío.");
  return reemplazar(texto, "MANUAL", archivo, por, forzar);
}
