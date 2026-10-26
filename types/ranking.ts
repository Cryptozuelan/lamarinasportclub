/**
 * Ranking de la Federación Venezolana de Pádel (FVP).
 *
 * La FVP publica la "Lista de ASCENSOS y ACTUALIZACIÓN Ranking FVP" en una hoja
 * pública de Google. La app la lee cada día (o el staff la sube a mano) y la
 * guarda en este formato; ver lib/ranking/fvp.ts y docs/BACKEND.md.
 */
import type { NivelTorneo } from "./torneo";

export interface AtletaFvp {
  /** Solo dígitos, sin ceros a la izquierda: "33063269". */
  clave: string;
  /** Como viene en la hoja: "V-33063269". */
  cedula: string;
  nombre: string;
  genero: "M" | "F" | null;
  /** Categoría de nivel vigente (CATEGORÍA FINAL de la hoja). null = solo figura en una categoría por edad. */
  categoria: NivelTorneo | null;
  /** Categorías por edad en las que figura: "Master +40", "Sub-13"… */
  especiales?: string[];
  /** Categoría antes de la actualización (CAT. ORIGEN). */
  origen?: NivelTorneo | null;
  puntos?: number | null;
  estado?: string | null;
  movimiento?: string | null;
}

export type FuenteRanking = "HOJA_FVP" | "MANUAL";

export interface RankingFvp {
  fuente: FuenteRanking;
  /** Cuándo se cargó esta lista (ISO). */
  cargadoEn: string;
  /** Staff que la subió (solo MANUAL). */
  por?: string | null;
  /** Archivo subido o URL de la hoja. */
  origen?: string | null;
  atletas: AtletaFvp[];
  /** Filas que no se pudieron leer, cédulas repetidas, etc. */
  avisos: string[];
  /** Último intento de sincronización que falló (la lista anterior sigue vigente). */
  ultimoError?: { en: string; mensaje: string } | null;
}

/** Lo que devuelve GET /api/ranking-fvp (sin la lista completa). */
export interface ResumenRankingFvp {
  cargado: boolean;
  fuente?: FuenteRanking;
  cargadoEn?: string;
  por?: string | null;
  origen?: string | null;
  total: number;
  porCategoria: Partial<Record<NivelTorneo, number>>;
  /** Categorías por edad: "Master +40" → 5. */
  especiales: Record<string, number>;
  avisos: string[];
  ultimoError?: { en: string; mensaje: string } | null;
}
