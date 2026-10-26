"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import { calcularMarcador, setsFinales, type EstadoMarcador } from "@/lib/torneo/marcador";
import { dupla, nombreDupla } from "@/lib/torneo/torneo";
import { useMarcador, useTorneos } from "@/lib/torneosStore";
import type { MarcadorVivo, PartidoTorneo, Torneo } from "@/types/torneo";

/** Trae los marcadores del torneo cada `ms` mientras la pantalla está visible. */
export function useMarcadoresEnVivo(torneoId: string, ms = 3000) {
  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && useTorneos.getState().sincronizarMarcadores(torneoId);
    tick();
    const t = setInterval(tick, ms);
    return () => clearInterval(t);
  }, [torneoId, ms]);
}

export function estadoDe(m?: MarcadorVivo): EstadoMarcador | null {
  return m ? calcularMarcador(m) : null;
}

/** Marcador compacto para tarjetas: sets, games y puntos del game en curso. */
export function MarcadorMini({ torneo, p, grande = false }: { torneo: Torneo; p: PartidoTorneo; grande?: boolean }) {
  const m = useMarcador(p.id);
  const e = estadoDe(m);
  const lados = [
    { lado: "A" as const, nombre: nombreDupla(torneo, dupla(torneo, p.duplaA)) },
    { lado: "B" as const, nombre: nombreDupla(torneo, dupla(torneo, p.duplaB)) },
  ];
  const sets = e ? setsFinales(e) : (p.resultado?.sets ?? []);
  return (
    <div className="space-y-1.5">
      {lados.map(({ lado, nombre }, i) => {
        const k = lado === "A" ? "a" : "b";
        const saca = e && !e.terminado && e.equipoSaca === lado;
        return (
          <div key={lado} className="flex items-center gap-2">
            <span className={clsx("size-2 shrink-0 rounded-full", saca ? "bg-lima shadow-[0_0_8px_rgba(207,243,91,0.9)]" : "bg-transparent")} />
            <span className={clsx("min-w-0 flex-1 truncate font-semibold", grande ? "text-lg" : "text-sm")}>{nombre}</span>
            {sets.map((s, j) => (
              <span key={j} className={clsx("w-5 text-center font-display tabular", grande ? "text-lg" : "text-sm", j === (e?.setActual ?? -1) && !e?.terminado ? "font-bold text-white" : "text-white/50")}>
                {s[k]}
              </span>
            ))}
            {e && !e.terminado && (
              <span className={clsx("ml-1 rounded-lg bg-white/10 text-center font-display font-bold tabular text-lima", grande ? "w-12 py-1 text-xl" : "w-9 py-0.5 text-sm")}>{e.texto[i]}</span>
            )}
          </div>
        );
      })}
      {e && !e.terminado && (e.puntoDeOro || e.matchPoint || e.setPoint || e.breakPoint) && (
        <p className="text-[11px] font-bold uppercase tracking-wider text-lima">
          {e.matchPoint ? "Punto de partido" : e.setPoint ? "Punto de set" : e.puntoDeOro ? "Punto de oro" : "Break point"}
        </p>
      )}
    </div>
  );
}

/** Hora actual que se refresca cada `ms`. */
export function useAhora(ms = 15_000) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return ahora;
}
