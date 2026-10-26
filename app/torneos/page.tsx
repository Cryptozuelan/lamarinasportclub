"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, CalendarDays, ChevronRight, KeyRound, Layers, ListChecks, Plus, Users } from "lucide-react";
import { Logo } from "@/components/Logo";
import { StaffChip } from "@/components/StaffGate";
import { EstadoTorneoBadge, rangoFechas } from "@/components/torneo/TorneoShell";
import { nombreCorto } from "@/lib/torneo/categorias";
import { progresoTorneo } from "@/lib/torneo/torneo";
import { useAmericanos, useEsStaff } from "@/lib/store";
import { useListaTorneos, useTorneos } from "@/lib/torneosStore";
import type { Torneo } from "@/types/torneo";

export default function TorneosPage() {
  const torneos = useListaTorneos();
  const hidratado = useTorneos((s) => s.hidratado);
  const esStaff = useEsStaff();
  const setPedirLogin = useAmericanos((s) => s.setPedirLogin);
  const activos = torneos.filter((t) => t.estado !== "FINALIZADO");
  const pasados = torneos.filter((t) => t.estado === "FINALIZADO");
  const soloStaff = (e: React.MouseEvent) => {
    if (esStaff) return;
    e.preventDefault();
    setPedirLogin(true);
  };

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
      <header className="flex items-center gap-2 py-3">
        <Link href="/" className="btn-ghost !p-2.5" aria-label="Inicio">
          <ArrowLeft className="size-5" />
        </Link>
        <span className="flex-1" />
        <StaffChip />
        <Logo compacto />
      </header>

      <section className="glass relative mt-4 overflow-hidden rounded-[2rem] p-6 sm:p-10">
        <div className="pointer-events-none absolute -right-20 -top-20 size-60 rounded-full bg-marca-2/30 blur-3xl" />
        <p className="label relative !text-neon">PadelReserve · Torneos</p>
        <h1 className="relative max-w-xl font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
          Del sorteo a la <span className="text-lima">final</span>, solo.
        </h1>
        <p className="relative mt-4 max-w-lg text-white/60">
          Inscribe duplas por categoría y el sistema arma grupos, llaves, byes, desempates y horarios en los días del torneo. El staff anota punto a punto y las pantallas de pista se actualizan solas.
        </p>
        <div className="relative mt-8 flex flex-wrap gap-3">
          <Link href="/torneos/nuevo" onClick={soloStaff} className="btn-neon animate-pulse-neon text-base">
            <Plus className="size-5" /> Nuevo torneo
          </Link>
          {esStaff && (
            <Link href="/torneos/ranking" className="btn-ghost text-base">
              <ListChecks className="size-5" /> Ranking FVP
            </Link>
          )}
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="font-display text-xl font-semibold">Torneos activos</h2>
          <span className="text-xs text-white/40">{activos.length} torneo(s)</span>
        </div>
        {!hidratado ? (
          <div className="glass h-40 animate-pulse rounded-3xl" />
        ) : activos.length === 0 ? (
          <Link href="/torneos/nuevo" onClick={soloStaff} className="glass flex flex-col items-center gap-2 rounded-3xl border-dashed p-10 text-center text-white/60 hover:text-white">
            <Plus className="size-8 text-neon" />
            Aún no hay torneos. ¡Crea el primero!
          </Link>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {activos.map((t, i) => (
              <TorneoCard key={t.id} torneo={t} index={i} />
            ))}
          </div>
        )}
      </section>

      {pasados.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 font-display text-xl font-semibold">Historial</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {pasados.map((t, i) => (
              <TorneoCard key={t.id} torneo={t} index={i} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function TorneoCard({ torneo: t, index }: { torneo: Torneo; index: number }) {
  const prog = progresoTorneo(t);
  const pct = prog.total ? Math.round((prog.jugados / prog.total) * 100) : 0;
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }}>
      <Link href={`/torneos/${t.id}`} className="glass group block rounded-3xl p-5 transition hover:border-neon/30 active:scale-[0.99]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <EstadoTorneoBadge estado={t.estado} />
              {t.bloqueado && (
                <span className="chip text-amber-200">
                  <KeyRound className="size-3" /> Con clave
                </span>
              )}
            </div>
            <h3 className="truncate font-display text-lg font-semibold">{t.nombre}</h3>
            <p className="mt-1 truncate text-sm text-white/50">{t.categorias.map((c) => nombreCorto(c.categoria)).join(" · ") || "Sin categorías"}</p>
          </div>
          <ChevronRight className="mt-1 size-5 shrink-0 text-white/30 transition group-hover:translate-x-1 group-hover:text-neon" />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/50">
          <span className="flex items-center gap-1.5"><CalendarDays className="size-3.5" /> {rangoFechas(t)}</span>
          <span className="flex items-center gap-1.5"><Layers className="size-3.5" /> {t.categorias.length} cat.</span>
          {!t.bloqueado && <span className="flex items-center gap-1.5"><Users className="size-3.5" /> {prog.duplas} duplas</span>}
          {!t.bloqueado && prog.total > 0 && <span className="ml-auto font-semibold text-white/70">{prog.jugados}/{prog.total} partidos</span>}
        </div>
        {!t.bloqueado && prog.total > 0 && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
            <motion.div className="h-full rounded-full bg-neon" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: "easeOut" }} />
          </div>
        )}
      </Link>
    </motion.div>
  );
}
