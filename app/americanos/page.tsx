"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Settings, Plus, Sparkles, Timer, Trophy, Tv } from "lucide-react";
import { EventoCard } from "@/components/EventoCard";
import { InstallButton } from "@/components/InstallButton";
import { Logo } from "@/components/Logo";
import { ModoBadge } from "@/components/ModoBadge";
import { StaffChip } from "@/components/StaffGate";
import { useAmericanos, useEsStaff, useListaEventos } from "@/lib/store";

const FEATURES = [
  {
    icon: Sparkles,
    t: "Rotación inteligente",
    d: "Nadie repite pareja y los descansos se reparten parejo.",
  },
  {
    icon: Timer,
    t: "Cuadro vivo",
    d: "Cronómetro de ronda y marcador táctil por pista.",
  },
  {
    icon: Trophy,
    t: "Ranking al instante",
    d: "La tabla se reordena con cada resultado.",
  },
  { icon: Tv, t: "Modo TV", d: "Pantalla gigante para la terraza y el bar." },
];

export default function Americanos() {
  const eventos = useListaEventos();
  const hidratado = useAmericanos((s) => s.hidratado);
  const esStaff = useEsStaff();
  const setPedirLogin = useAmericanos((s) => s.setPedirLogin);
  // Sin sesión, "Nuevo Americano" abre el acceso staff en lugar del setup.
  const soloStaff = (e: React.MouseEvent) => {
    if (esStaff) return;
    e.preventDefault();
    setPedirLogin(true);
  };
  const enVivo = eventos.filter((e) => e.estado !== "FINALIZADO");
  const pasados = eventos.filter((e) => e.estado === "FINALIZADO");

  return (
    <main className="pb-24">
      {/* Encabezado de marca, como en el sistema de reservas */}
      <div className="sobre-marca relative overflow-hidden bg-marca pb-16 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="pointer-events-none absolute -right-24 -top-32 size-80 rounded-full bg-marca-2/50 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 bottom-0 size-64 rounded-full bg-neon/15 blur-3xl" />
        <header className="relative mx-auto flex max-w-5xl items-center justify-end gap-2 px-4 py-3 sm:px-6">
          <Link href="/" className="btn-ghost mr-auto !p-2.5" aria-label="Inicio">
            <ArrowLeft className="size-4" />
          </Link>
          <InstallButton />
          <ModoBadge />
          <StaffChip />
          <Link href="/club" onClick={soloStaff} className="btn-ghost !p-2.5" aria-label="Mi club" title="Mi club: pistas y horarios">
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
          <section className="glass relative overflow-hidden rounded-[2rem] p-6 sm:p-10">
            <div className="pointer-events-none absolute -right-20 -top-20 size-60 rounded-full bg-marca-2/30 blur-3xl" />
            <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="label relative !text-neon">
              PadelReserve · Americanos
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="relative max-w-xl font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl"
            >
              Arma tu americano en <span className="text-marca">60 segundos</span>.
            </motion.h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="relative mt-4 max-w-md text-white/60">
              Elige categoría, pistas y jugadores. Nosotros armamos las parejas, el cuadro y el ranking en vivo.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="relative mt-8 flex flex-wrap gap-3"
            >
              <Link href="/setup" onClick={soloStaff} className="btn-neon animate-pulse-neon text-base">
                <Plus className="size-5" /> Nuevo Americano
              </Link>
              {enVivo[0] && (
                <Link href={`/evento/${enVivo[0].id}/tv`} className="btn-ghost text-base">
                  <Tv className="size-5" /> Abrir Modo TV
                </Link>
              )}
            </motion.div>
          </section>

          <section className="mt-10">
            <div className="mb-4 flex items-end justify-between">
              <h2 className="font-display text-xl font-semibold">Eventos activos</h2>
              <span className="text-xs text-white/40">{enVivo.length} evento(s)</span>
            </div>
            {!hidratado ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[0, 1].map((i) => (
                  <div key={i} className="glass h-40 animate-pulse rounded-3xl" />
                ))}
              </div>
            ) : enVivo.length === 0 ? (
              <Link
                href="/setup"
                onClick={soloStaff}
                className="glass flex flex-col items-center gap-2 rounded-3xl border-dashed p-10 text-center text-white/60 hover:text-white"
              >
                <Plus className="size-8 text-neon" />
                Aún no hay eventos. ¡Crea el primero!
              </Link>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {enVivo.map((e, i) => (
                  <EventoCard key={e.id} evento={e} index={i} />
                ))}
              </div>
            )}
          </section>

          {pasados.length > 0 && (
            <section className="mt-10">
              <h2 className="mb-4 font-display text-xl font-semibold">Historial</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {pasados.map((e, i) => (
                  <EventoCard key={e.id} evento={e} index={i} />
                ))}
              </div>
            </section>
          )}

          <section className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.t}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="glass rounded-2xl p-4"
              >
                <span className="flex size-9 items-center justify-center rounded-xl bg-lima text-marino-2">
                  <f.icon className="size-5" />
                </span>
                <p className="mt-3 text-sm font-semibold">{f.t}</p>
                <p className="mt-1 text-xs leading-relaxed text-white/50">{f.d}</p>
              </motion.div>
            ))}
          </section>
        </div>
      </div>
    </main>
  );
}
