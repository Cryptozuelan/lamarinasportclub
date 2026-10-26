"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, BarChart3, CalendarClock, Flag, GitFork, KeyRound, LayoutDashboard, Lock, Settings, Users } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/Logo";
import { StaffChip } from "@/components/StaffGate";
import { useEsStaff } from "@/lib/store";
import { useTorneo, useTorneos } from "@/lib/torneosStore";
import type { Torneo } from "@/types/torneo";

export const fechaCorta = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" });

export function rangoFechas(t: Pick<Torneo, "dias">): string {
  if (!t.dias.length) return "Sin fechas";
  const a = t.dias[0].fecha;
  const b = t.dias[t.dias.length - 1].fecha;
  return a === b ? fechaCorta(a) : `${fechaCorta(a)} – ${fechaCorta(b)}`;
}

export function EstadoTorneoBadge({ estado }: { estado: Torneo["estado"] }) {
  if (estado === "EN_JUEGO")
    return (
      <span className="chip border-neon/30 bg-neon/10 text-neon">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-neon opacity-70" />
          <span className="relative inline-flex size-2 rounded-full bg-neon" />
        </span>
        En juego
      </span>
    );
  if (estado === "FINALIZADO") return <span className="chip">Finalizado</span>;
  if (estado === "PROGRAMADO") return <span className="chip text-cielo">Programado</span>;
  return <span className="chip text-amber-200">Inscripciones</span>;
}

/** Pantalla de clave para participantes. */
export function ClaveGate({ torneo }: { torneo: Torneo }) {
  const entrar = useTorneos((s) => s.entrar);
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const vencida = torneo.acceso?.vence ? new Date(torneo.acceso.vence).getTime() < Date.now() : false;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">
      <Logo compacto className="mb-6 size-14" />
      <span className="flex size-16 items-center justify-center rounded-2xl bg-lima text-marino-2">
        {vencida ? <Lock className="size-8" /> : <KeyRound className="size-8" />}
      </span>
      <h1 className="mt-5 font-display text-2xl font-bold">{torneo.nombre}</h1>
      <p className="mt-1 text-sm text-white/50">{rangoFechas(torneo)}</p>
      {vencida ? (
        <p className="mt-6 max-w-sm text-white/70">El torneo terminó y la clave de participantes caducó. ¡Gracias por jugar en La Marina!</p>
      ) : (
        <form
          className="mt-6 w-full max-w-xs"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!clave.trim()) return;
            setEnviando(true);
            setError(await entrar(torneo.id, clave));
            setEnviando(false);
          }}
        >
          <label className="label" htmlFor="clave">Clave del torneo</label>
          <input
            id="clave"
            className="input text-center font-display text-2xl font-bold uppercase tracking-[0.3em]"
            value={clave}
            onChange={(e) => setClave(e.target.value.toUpperCase())}
            autoComplete="one-time-code"
            autoCapitalize="characters"
            placeholder="••••••"
            maxLength={20}
          />
          {error && <p className="mt-2 text-sm text-coral">{error}</p>}
          <button className="btn-neon mt-4 w-full" disabled={enviando || !clave.trim()}>
            Entrar
          </button>
          <p className="mt-4 text-xs text-white/45">La clave te la da el staff de La Marina y vale durante los días del torneo.</p>
        </form>
      )}
      <Link href="/torneos" className="btn-ghost mt-8">
        <ArrowLeft className="size-4" /> Torneos
      </Link>
    </main>
  );
}

export function TorneoShell({ id, children, ancho = "max-w-6xl" }: { id: string; children: (t: Torneo) => React.ReactNode; ancho?: string }) {
  const torneo = useTorneo(id);
  const hidratado = useTorneos((s) => s.hidratado);
  const ultimoSync = useTorneos((s) => s.ultimoSync);
  const esStaff = useEsStaff();
  const pathname = usePathname();

  if (!torneo) {
    const cargando = !hidratado || !ultimoSync;
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        {cargando ? (
          <div className="size-10 animate-spin rounded-full border-2 border-white/10 border-t-neon" />
        ) : (
          <>
            <p className="font-display text-2xl font-bold">Torneo no encontrado</p>
            <Link href="/torneos" className="btn-neon">Ver torneos</Link>
          </>
        )}
      </main>
    );
  }
  if (torneo.bloqueado && !esStaff) return <ClaveGate torneo={torneo} />;

  const base = `/torneos/${id}`;
  const tabs = [
    { href: base, label: "En vivo", icon: LayoutDashboard },
    { href: `${base}/cuadros`, label: "Cuadros", icon: GitFork },
    { href: `${base}/programacion`, label: "Horarios", icon: CalendarClock },
    ...(esStaff ? [{ href: `${base}/categorias`, label: "Inscritos", icon: Users }] : []),
    { href: `${base}/estadisticas`, label: "Stats", icon: BarChart3 },
  ];

  return (
    <div className={clsx("mx-auto min-h-dvh px-4 pb-28 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6", ancho)}>
      <header className="flex items-center gap-3 py-3">
        <Link href="/torneos" className="btn-ghost !p-2.5" aria-label="Torneos">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg font-bold leading-tight sm:text-xl">{torneo.nombre}</h1>
          <div className="mt-1 flex items-center gap-2">
            <EstadoTorneoBadge estado={torneo.estado} />
            <span className="hidden text-xs text-white/50 sm:inline">{rangoFechas(torneo)}</span>
          </div>
        </div>
        <StaffChip />
        {esStaff && (
          <Link href={`/torneos/${id}/arbitros`} className={clsx("btn-ghost !p-2.5", pathname.endsWith("/arbitros") && "!border-neon/50 !text-neon")} aria-label="Árbitros y turnos" title="Árbitros y turnos">
            <Flag className="size-5" />
          </Link>
        )}
        {esStaff && (
          <Link href={`/torneos/${id}/ajustes`} className={clsx("btn-ghost !p-2.5", pathname.endsWith("/ajustes") && "!border-neon/50 !text-neon")} aria-label="Ajustes del torneo">
            <Settings className="size-5" />
          </Link>
        )}
        <Logo compacto className="hidden sm:block" />
      </header>

      {children(torneo)}

      <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="glass-strong flex gap-0.5 rounded-2xl p-1.5 shadow-2xl">
          {tabs.map((t) => {
            const activo = t.href === base ? pathname === base : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={clsx(
                  "relative flex flex-col items-center gap-0.5 whitespace-nowrap rounded-xl px-2.5 py-2 text-[11px] font-semibold transition min-[400px]:px-3 sm:flex-row sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm",
                  activo ? "text-noche" : "text-white/60 hover:text-white",
                )}
              >
                {activo && <motion.span layoutId="tab-torneo" className="absolute inset-0 rounded-xl bg-neon" transition={{ type: "spring", stiffness: 500, damping: 35 }} />}
                <t.icon className="relative size-4" />
                <span className="relative">{t.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
