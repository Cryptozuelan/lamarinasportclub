"use client";

import clsx from "clsx";
import type { Patrocinador, Torneo } from "@/types/torneo";

function Marca({ p, alto }: { p: Patrocinador; alto: string }) {
  return p.logo ? (
    <span className="flex items-center justify-center rounded-xl bg-blanco/95 px-3 py-1.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p.logo} alt={p.nombre} className={clsx("w-auto max-w-[10rem] object-contain", alto)} />
    </span>
  ) : (
    <span className="font-display font-bold tracking-tight text-white/80">{p.nombre}</span>
  );
}

/** Franja de patrocinadores: el principal primero y más grande. */
export function FranjaPatrocinadores({ torneo, grande = false, className }: { torneo: Torneo; grande?: boolean; className?: string }) {
  const lista = [...(torneo.patrocinadores ?? [])].sort((a, b) => Number(!!b.principal) - Number(!!a.principal));
  if (!lista.length) return null;
  return (
    <div className={clsx("flex flex-wrap items-center gap-x-5 gap-y-3", className)}>
      <span className={clsx("font-semibold uppercase tracking-[0.2em] text-white/40", grande ? "text-sm" : "text-[10px]")}>Con el apoyo de</span>
      {lista.map((p) => (
        <span key={p.id} className={clsx(grande ? "text-2xl" : "text-sm")}>
          <Marca p={p} alto={p.principal ? (grande ? "h-14" : "h-8") : grande ? "h-10" : "h-6"} />
        </span>
      ))}
    </div>
  );
}

/** "Presenta" de una pista (pantallas de pista). */
export function PresentaPista({ torneo, numero }: { torneo: Torneo; numero: number }) {
  const p = torneo.patrocinadores?.find((x) => x.pista === numero);
  if (!p) return null;
  return (
    <span className="flex items-center gap-3 text-lg text-white/50">
      presenta <Marca p={p} alto="h-10" />
    </span>
  );
}
