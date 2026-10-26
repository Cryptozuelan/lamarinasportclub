"use client";

import Link from "next/link";
import { useEsStaff } from "@/lib/store";
import { useTorneo, useTorneos } from "@/lib/torneosStore";
import type { Torneo } from "@/types/torneo";
import { ClaveGate } from "./TorneoShell";

/** Carga y acceso del torneo sin encabezado ni pestañas (anotador, pantallas de pista y TV). */
export function TorneoShellMinimo({ id, children }: { id: string; children: (t: Torneo) => React.ReactNode }) {
  const torneo = useTorneo(id);
  const hidratado = useTorneos((s) => s.hidratado);
  const ultimoSync = useTorneos((s) => s.ultimoSync);
  const esStaff = useEsStaff();
  if (!torneo)
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        {!hidratado || !ultimoSync ? (
          <div className="size-10 animate-spin rounded-full border-2 border-white/10 border-t-neon" />
        ) : (
          <Link href="/torneos" className="btn-neon">Torneo no encontrado · Volver</Link>
        )}
      </main>
    );
  if (torneo.bloqueado && !esStaff) return <ClaveGate torneo={torneo} />;
  return <>{children(torneo)}</>;
}
