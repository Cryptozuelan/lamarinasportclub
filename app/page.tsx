"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, BookOpen, Flag, Settings, Shuffle, Trophy } from "lucide-react";
import { InstallButton } from "@/components/InstallButton";
import { Logo } from "@/components/Logo";
import { StaffChip } from "@/components/StaffGate";
import { useAmericanos, useEsStaff, useListaEventos } from "@/lib/store";
import { useListaTorneos } from "@/lib/torneosStore";

/** Inicio: tres puertas, Americanos, Torneos y Árbitros. */
export default function Home() {
  const eventos = useListaEventos();
  const torneos = useListaTorneos();
  const esStaff = useEsStaff();
  const setPedirLogin = useAmericanos((s) => s.setPedirLogin);
  const americanosVivos = eventos.filter((e) => e.estado === "EN_CURSO").length;
  const torneosVivos = torneos.filter((t) => t.estado === "EN_JUEGO").length;
  const torneosProximos = torneos.filter((t) => t.estado !== "FINALIZADO").length;
  const partidosEnJuego = torneos.reduce((n, t) => n + t.categorias.reduce((m, c) => m + (c.cuadro?.partidos.filter((p) => p.estado === "EN_JUEGO").length ?? 0), 0), 0);

  const puertas = [
    {
      href: "/americanos",
      icon: Shuffle,
      titulo: "Americanos",
      lema: "Arma tu americano en 60 segundos.",
      detalle: "Rotación de parejas, cuadro vivo, ranking y Modo TV.",
      chip: americanosVivos ? `${americanosVivos} en vivo` : `${eventos.length} evento${eventos.length === 1 ? "" : "s"}`,
      vivo: americanosVivos > 0,
    },
    {
      href: "/torneos",
      icon: Trophy,
      titulo: "Torneos",
      lema: "Del sorteo a la final, solo.",
      detalle: "Todas las categorías, grupos y llaves automáticas, programación por días y marcador punto a punto.",
      chip: torneosVivos ? `${torneosVivos} en juego` : `${torneosProximos} activo${torneosProximos === 1 ? "" : "s"}`,
      vivo: torneosVivos > 0,
    },
    {
      href: "/arbitro",
      icon: Flag,
      titulo: "Árbitros",
      lema: "Anota el partido, punto a punto.",
      detalle: "La tablet de cada pista: un toque por punto. Los televisores y las estadísticas de los atletas se actualizan al instante.",
      chip: partidosEnJuego ? `${partidosEnJuego} partido${partidosEnJuego === 1 ? "" : "s"} en juego` : "Con PIN de árbitro",
      vivo: partidosEnJuego > 0,
    },
  ];

  return (
    <main className="pb-24">
      <div className="sobre-marca relative overflow-hidden bg-marca pb-16 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="pointer-events-none absolute -right-24 -top-32 size-80 rounded-full bg-marca-2/50 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 bottom-0 size-64 rounded-full bg-neon/15 blur-3xl" />
        <header className="relative mx-auto flex max-w-5xl items-center justify-end gap-2 px-4 py-3 sm:px-6">
          <InstallButton />
          <StaffChip />
          <Link href="/manual" className="btn-ghost !p-2.5" aria-label="Manual del staff" title="Manual del staff">
            <BookOpen className="size-4" />
          </Link>
          <Link
            href="/club"
            onClick={(e) => {
              if (esStaff) return;
              e.preventDefault();
              setPedirLogin(true);
            }}
            className="btn-ghost !p-2.5"
            aria-label="Ajustes"
            title="Ajustes del club"
          >
            <Settings className="size-4" />
          </Link>
        </header>
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 22 }}
          className="relative mx-auto mt-2 flex max-w-5xl justify-center px-6 sm:mt-6"
        >
          <Logo className="!h-auto max-h-[26svh] w-full max-w-[22rem] object-contain sm:max-w-md" />
        </motion.div>
      </div>

      <div className="relative -mt-8 rounded-t-[2rem] bg-fondo">
        <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6">
          <p className="label !text-neon">PadelReserve · La Marina Sport Club</p>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-5xl">¿Qué jugamos hoy?</h1>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {puertas.map((p, i) => (
              <motion.div key={p.href} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + i * 0.07 }} className={i === 2 ? "sm:col-span-2 lg:col-span-1" : undefined}>
                <Link
                  href={p.href}
                  className="glass group relative flex h-full min-h-56 flex-col overflow-hidden rounded-[2rem] p-6 transition hover:border-neon/40 active:scale-[0.99] sm:min-h-72 sm:p-8"
                >
                  <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-marca-2/30 blur-3xl transition group-hover:bg-neon/20" />
                  <div className="relative flex items-start justify-between">
                    <span className="flex size-14 items-center justify-center rounded-2xl bg-lima text-marino-2 shadow-[0_10px_30px_-10px_rgba(207,243,91,0.8)] sm:size-16">
                      <p.icon className="size-7 sm:size-8" />
                    </span>
                    <span className={p.vivo ? "chip border-neon/30 bg-neon/10 text-neon" : "chip"}>
                      {p.vivo && (
                        <span className="relative flex size-2">
                          <span className="absolute inline-flex size-full animate-ping rounded-full bg-neon opacity-70" />
                          <span className="relative inline-flex size-2 rounded-full bg-neon" />
                        </span>
                      )}
                      {p.chip}
                    </span>
                  </div>
                  <h2 className="relative mt-auto pt-8 font-display text-4xl font-bold tracking-tight sm:text-5xl">{p.titulo}</h2>
                  <p className="relative mt-1 font-semibold text-neon">{p.lema}</p>
                  <p className="relative mt-2 max-w-sm text-sm text-white/55">{p.detalle}</p>
                  <span className="relative mt-5 flex items-center gap-2 text-sm font-semibold text-white/80 group-hover:text-neon">
                    Entrar <ArrowRight className="size-4 transition group-hover:translate-x-1" />
                  </span>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
