"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, LayoutGrid, ListOrdered, Tv } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ModoBadge } from "@/components/ModoBadge";
import { QRBoton } from "@/components/QRPopup";
import { StaffChip } from "@/components/StaffGate";
import { EstadoBadge } from "@/components/EventoCard";
import { categoriaLabel } from "@/lib/categories";
import { useAmericanos, useEvento } from "@/lib/store";
import type { EventoAmericano } from "@/types/americano";

export function EventoShell({ id, children }: { id: string; children: (evento: EventoAmericano) => React.ReactNode }) {
  const evento = useEvento(id);
  const hidratado = useAmericanos((s) => s.hidratado);
  const ultimoSync = useAmericanos((s) => s.ultimoSync);
  const pathname = usePathname();

  if (!evento) {
    const cargando = !hidratado || !ultimoSync;
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        {cargando ? (
          <div className="size-10 animate-spin rounded-full border-2 border-white/10 border-t-neon" />
        ) : (
          <>
            <p className="font-display text-2xl font-bold">Evento no encontrado</p>
            <Link href="/americanos" className="btn-neon">Volver al inicio</Link>
          </>
        )}
      </main>
    );
  }

  const tabs = [
    { href: `/evento/${id}`, label: "Cuadro", icon: LayoutGrid },
    { href: `/evento/${id}/tabla`, label: "Ranking", icon: ListOrdered },
    { href: `/evento/${id}/tv`, label: "Modo TV", corto: "TV", icon: Tv },
  ];

  return (
    <div className="mx-auto min-h-dvh max-w-6xl px-4 pb-28 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
      <header className="flex items-center gap-3 py-3">
        <Link href="/americanos" className="btn-ghost !p-2.5" aria-label="Americanos">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg font-bold leading-tight sm:text-xl">{evento.nombre}</h1>
          <div className="mt-1 flex items-center gap-2">
            <EstadoBadge estado={evento.estado} />
            <span className="hidden text-xs text-white/50 sm:inline">{categoriaLabel(evento.categoria)}</span>
          </div>
        </div>
        <ModoBadge />
        <StaffChip />
        <Logo compacto className="hidden sm:block" />
      </header>

      {children(evento)}

      <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="glass-strong flex gap-1 rounded-2xl p-1.5 shadow-2xl">
          {tabs.map((t) => {
            const activo = pathname === t.href;
            return (
              <Link key={t.href} href={t.href} className={clsx("relative flex items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 py-2.5 text-sm font-semibold transition min-[380px]:gap-2 min-[380px]:px-3 sm:px-4", activo ? "text-noche" : "text-white/60 hover:text-white")}>
                {activo && <motion.span layoutId="tab-activa" className="absolute inset-0 rounded-xl bg-neon" transition={{ type: "spring", stiffness: 500, damping: 35 }} />}
                <t.icon className="relative size-4" />
                <span className="relative">
                  {"corto" in t ? (
                    <>
                      <span className="sm:hidden">{t.corto}</span>
                      <span className="hidden sm:inline">{t.label}</span>
                    </>
                  ) : (
                    t.label
                  )}
                </span>
              </Link>
            );
          })}
          <QRBoton evento={evento} className="flex items-center rounded-xl px-2.5 py-2.5 text-white/60 transition hover:text-white min-[380px]:px-3" />
        </div>
      </nav>
    </div>
  );
}
