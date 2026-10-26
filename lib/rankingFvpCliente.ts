"use client";

/**
 * Consulta del ranking FVP desde las pantallas del staff: busca por cédula en
 * /api/ranking-fvp, con caché en memoria para no repetir la misma cédula.
 */
import { useEffect, useMemo, useState } from "react";
import { claveCedula, type BuscarAtleta } from "@/lib/ranking/fvp";
import type { AtletaFvp, ResumenRankingFvp } from "@/types/ranking";

const cache = new Map<string, AtletaFvp | null>();
let version: string | undefined;

async function pedir(cedulas: string[]): Promise<ResumenRankingFvp> {
  const res = await fetch(`/api/ranking-fvp?cedulas=${encodeURIComponent(cedulas.join(","))}`, { cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  const d = (await res.json()) as { resumen: ResumenRankingFvp; atletas: Record<string, AtletaFvp | null> };
  // Lista nueva en el servidor: lo guardado deja de valer.
  if (d.resumen.cargadoEn !== version) {
    cache.clear();
    version = d.resumen.cargadoEn;
  }
  for (const [c, a] of Object.entries(d.atletas)) cache.set(claveCedula(c)!, a);
  return d.resumen;
}

export interface ConsultaFvp {
  resumen: ResumenRankingFvp | null;
  /** Buscador para `verificarDupla`; null = no hay lista o no hay conexión. */
  buscar: BuscarAtleta | null;
  /** Todas las cédulas pedidas ya tienen respuesta. */
  listo: boolean;
  error: boolean;
}

export function useRankingFvp(cedulas: (string | null | undefined)[]): ConsultaFvp {
  const claves = useMemo(() => [...new Set(cedulas.map(claveCedula).filter((c): c is string => !!c))].sort(), [cedulas]);
  const llave = claves.join(",");
  const [resumen, setResumen] = useState<ResumenRankingFvp | null>(null);
  const [error, setError] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    let vivo = true;
    const faltan = claves.filter((c) => !cache.has(c));
    if (resumen && !faltan.length) return;
    const t = setTimeout(
      () => {
        pedir(faltan)
          .then((r) => {
            if (!vivo) return;
            setResumen(r);
            setError(false);
            setTick((x) => x + 1);
          })
          .catch(() => vivo && setError(true));
      },
      resumen ? 350 : 0,
    );
    return () => {
      vivo = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [llave]);

  const cargada = !!resumen?.cargado && !error;
  return {
    resumen,
    buscar: cargada ? (c) => cache.get(claveCedula(c) ?? "") ?? null : null,
    listo: error || (!!resumen && (!cargada || claves.every((c) => cache.has(c)))),
    error,
  };
}
