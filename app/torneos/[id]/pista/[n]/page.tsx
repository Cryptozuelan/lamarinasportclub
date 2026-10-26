"use client";

import clsx from "clsx";
import Link from "next/link";
import { use, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, CloudRain, Maximize, Megaphone, Minimize, Trophy } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Logo } from "@/components/Logo";
import { Escenario, Reloj, useCursorOculto, useFullscreenYWakeLock } from "@/components/Pantalla";
import { QR } from "@/components/QR";
import { TorneoShellMinimo } from "@/components/torneo/minimo";
import { FranjaPatrocinadores, PresentaPista } from "@/components/torneo/Patrocinadores";
import { useAhora, useMarcadoresEnVivo } from "@/components/torneo/vivo";
import { useFotoDupla, useFotosTorneo } from "@/lib/fotos";
import { nombreCategoria } from "@/lib/torneo/categorias";
import { atencionEnCurso, calcularMarcador, cambioDeLadoEnCurso, descansoReglamentario, relatoPublico, setsFinales, type Lado } from "@/lib/torneo/marcador";
import { estadoPistas, limiteWO } from "@/lib/torneo/programacion";
import { categoria, dupla, nombreDupla, nombreJugador } from "@/lib/torneo/torneo";
import { useMarcador } from "@/lib/torneosStore";
import type { MarcadorVivo, PartidoTorneo, Torneo } from "@/types/torneo";

/** Pantalla de una pista (las de las esquinas): marcador oficial en grande y relato punto a punto. */
export default function PistaPage({ params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = use(params);
  return <TorneoShellMinimo id={id}>{(t) => <Pantalla torneo={t} numero={Number(n)} />}</TorneoShellMinimo>;
}

function Pantalla({ torneo, numero }: { torneo: Torneo; numero: number }) {
  useMarcadoresEnVivo(torneo.id, 1500);
  useFotosTorneo(torneo.id);
  const { full, alternar } = useFullscreenYWakeLock();
  const oculto = useCursorOculto();
  const estado = estadoPistas(torneo).find((p) => p.numero === numero);
  const partido = estado?.enJuego ?? null;
  const marcador = useMarcador(partido?.id);
  const cancha = torneo.canchas.find((c) => c.numero === numero);
  const url = typeof window !== "undefined" ? `${location.origin}/torneos/${torneo.id}` : "";

  return (
    <Escenario oculto={oculto} vertical={false}>
      <header className="flex items-center gap-6">
        <Logo className="!h-14" />
        <div className="h-12 w-px bg-white/10" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-3xl font-bold">{torneo.nombre}</h1>
          <p className="text-lg text-white/50">{partido ? `${nombreCategoria(categoria(torneo, partido.categoriaId)!.categoria)} · ${partido.etiqueta}` : "Marcador oficial"}</p>
        </div>
        <PresentaPista torneo={torneo} numero={numero} />
        <span className="flex items-center gap-3 rounded-2xl bg-lima px-5 py-2 font-display text-3xl font-bold text-marino-2">{cancha?.nombre ?? `Pista ${numero}`}</span>
        <Reloj />
        <div className={clsx("flex gap-2 transition-opacity", oculto && "opacity-0")}>
          <Link href={`/torneos/${torneo.id}`} className="btn-ghost !p-3" aria-label="Salir">
            <ArrowLeft className="size-5" />
          </Link>
          <button className="btn-ghost !p-3" onClick={alternar} aria-label="Pantalla completa">
            {full ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
          </button>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {partido && marcador ? (
          <motion.div key={partido.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_28rem] gap-6">
            <Marcador torneo={torneo} p={partido} m={marcador} />
            <Relato torneo={torneo} p={partido} m={marcador} />
          </motion.div>
        ) : (
          <motion.div key="espera" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid flex-1 grid-cols-[minmax(0,1fr)_26rem] items-center gap-10">
            {estado?.suspendida && !estado.llamado ? (
              <div className="text-center">
                <CloudRain className="mx-auto size-24 text-amber-200" />
                <p className="mt-6 font-display text-6xl font-bold">Pista suspendida</p>
                <p className="mt-3 text-3xl text-white/55">{estado.suspendida}. Los horarios ya se reacomodaron: revisa el tuyo con el QR del club.</p>
              </div>
            ) : (
              <Siguiente torneo={torneo} p={estado?.llamado ?? estado?.siguiente ?? null} llamado={!!estado?.llamado} />
            )}
            <div className="glass flex flex-col items-center rounded-[2rem] p-8 text-center">
              <div className="rounded-3xl bg-blanco p-4">
                <QR texto={url} size={280} />
              </div>
              <p className="mt-5 font-display text-2xl font-bold">Sigue el torneo</p>
              <p className="mt-1 text-lg text-white/55">Cuadros, horarios y tus estadísticas</p>
              <FranjaPatrocinadores torneo={torneo} className="mt-6 justify-center" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Escenario>
  );
}

function Marcador({ torneo, p, m }: { torneo: Torneo; p: PartidoTorneo; m: MarcadorVivo }) {
  const e = useMemo(() => calcularMarcador(m), [m]);
  const sets = setsFinales(e);
  const jug = (id: string) => torneo.jugadores.find((j) => j.id === id);
  const ahora = useAhora(1000);
  const atencion = atencionEnCurso(m, ahora);
  const descanso = descansoReglamentario(e);
  const ultimoT = e.jugados.at(-1)?.t;
  const quedaDescanso = descanso && ultimoT ? Math.ceil((new Date(ultimoT).getTime() + descanso.segundos * 1000 - ahora) / 1000) : 0;
  const cambio = cambioDeLadoEnCurso(e, ahora);
  const mmss = (seg: number) => `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")}`;
  const aviso = e.terminado
    ? null
    : atencion
      ? `ATENCIÓN MÉDICA · ${mmss(atencion.quedan)}`
      : cambio
        ? cambio.directo
          ? "CAMBIO DE LADO · SIN DESCANSO"
          : cambio.quedan > 0
            ? `CAMBIO DE LADO · ${mmss(cambio.quedan)}`
            : "CAMBIO DE LADO · ¡A JUGAR!"
      : descanso && descanso.segundos >= 90 && quedaDescanso > 0
        ? `${descanso.motivo.toUpperCase()} · ${mmss(quedaDescanso)}`
        : e.matchPoint
      ? "PUNTO DE PARTIDO"
      : e.setPoint
        ? "PUNTO DE SET"
        : e.puntoDeOro
          ? "PUNTO DE ORO"
          : e.breakPoint
            ? "BREAK POINT"
            : e.enSuperTie
              ? "SÚPER TIE-BREAK"
              : e.enTie
                ? "TIE-BREAK"
                : null;
  const ultimos = e.jugados.slice(-16);

  return (
    <div className="flex min-h-0 flex-col gap-5">
      <div className="glass flex flex-1 flex-col justify-center gap-4 rounded-[2.5rem] p-8">
        <div className="grid grid-cols-[1fr_repeat(var(--sets),5rem)_11rem] items-center gap-4 text-center text-lg font-semibold uppercase tracking-[0.2em] text-white/35" style={{ ["--sets" as string]: sets.length }}>
          <span className="text-left">{m.reglas.sets === 3 ? "Mejor de 3" : "1 set"} · {m.reglas.puntoDeOro ? "punto de oro" : "ventaja"}</span>
          {sets.map((_, i) => (
            <span key={i}>{i === 2 && m.reglas.superTie ? ((m.reglas.tieDecisivo ?? 10) === 7 ? "TB" : "STB") : `Set ${i + 1}`}</span>
          ))}
          <span>{e.enTie ? "Tie" : "Puntos"}</span>
        </div>
        {(["A", "B"] as const).map((l, i) => {
          const ids = l === "A" ? m.jugadoresA : m.jugadoresB;
          const gana = e.terminado && e.ganador === l;
          return (
            <div key={l} className={clsx("grid grid-cols-[1fr_repeat(var(--sets),5rem)_11rem] items-center gap-4 rounded-[2rem] px-6 py-5", gana ? "seleccion" : "bg-white/[0.04]")} style={{ ["--sets" as string]: sets.length }}>
              <div className="flex min-w-0 items-center gap-5">
                <span className={clsx("h-20 w-2 shrink-0 rounded-full", l === "A" ? "bg-lima" : "bg-cielo")} />
                <CaraDupla torneo={torneo} duplaId={l === "A" ? p.duplaA : p.duplaB} ids={ids} alto={96} />
                <div className="min-w-0">
                  <p className="truncate font-display text-5xl font-bold">{nombreDupla(torneo, dupla(torneo, l === "A" ? p.duplaA : p.duplaB))}</p>
                  <p className="mt-1 flex items-center gap-3 text-xl text-white/55">
                    {ids.map((id) => (
                      <span key={id} className={clsx("flex items-center gap-2", !e.terminado && e.sacador === id && "font-bold text-lima")}>
                        {!e.terminado && e.sacador === id && <span className="size-3.5 rounded-full bg-lima shadow-[0_0_14px_rgba(207,243,91,0.9)]" />}
                        {jug(id)?.nombre}
                      </span>
                    ))}
                  </p>
                </div>
              </div>
              {sets.map((s, j) => (
                <span key={j} className={clsx("font-display text-6xl font-bold tabular", j === e.setActual && !e.terminado ? "text-white" : (l === "A" ? s.a > s.b : s.b > s.a) ? "text-lima" : "text-white/35")}>
                  {l === "A" ? s.a : s.b}
                </span>
              ))}
              <motion.span
                key={`${e.texto[i]}-${m.puntos.length}`}
                initial={{ scale: 0.85, opacity: 0.5 }}
                animate={{ scale: 1, opacity: 1 }}
                className={clsx("rounded-3xl py-3 font-display text-8xl font-bold tabular", e.terminado ? "text-white/30" : "bg-blanco/10 text-lima")}
              >
                {e.terminado ? gana ? <Trophy className="mx-auto size-20 text-lima" /> : "" : e.texto[i]}
              </motion.span>
            </div>
          );
        })}
        <div className="flex h-12 items-center justify-center">
          <AnimatePresence mode="wait">
            {aviso && (
              <motion.span key={aviso} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: [1, 1.06, 1], opacity: 1 }} transition={{ scale: { repeat: Infinity, duration: 1.4 } }} className="rounded-full bg-lima px-8 py-2 font-display text-2xl font-bold tracking-[0.2em] text-marino-2">
                {aviso}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="grid grid-cols-[1.4fr_repeat(3,minmax(0,1fr))] gap-4">
        <div className="glass rounded-[1.5rem] p-4">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/40">Últimos puntos</p>
          <div className="mt-3 flex gap-1.5">
            {ultimos.map((x) => (
              <span key={x.n} className={clsx("h-6 flex-1 rounded", x.gana === "A" ? "bg-lima" : "bg-cielo")} />
            ))}
          </div>
          {e.racha.puntos >= 3 && !e.terminado && (
            <p className="mt-2 text-base text-white/60">
              Racha de {e.racha.puntos} puntos · {nombreDupla(torneo, dupla(torneo, e.racha.lado === "A" ? p.duplaA : p.duplaB))}
            </p>
          )}
        </div>
        {/* Datos del partido por dupla. Las métricas de cada atleta las ven solo los participantes. */}
        {[
          { t: "Puntos", f: (l: Lado) => e.jugados.filter((x) => x.gana === l).length },
          { t: "Breaks", f: (l: Lado) => e.jugados.filter((x) => x.gana === l && x.breakPoint && x.gana !== x.equipoSaca).length },
          { t: "Puntos de oro", f: (l: Lado) => e.jugados.filter((x) => x.gana === l && x.oro).length },
        ].map((s) => (
          <div key={s.t} className="glass rounded-[1.5rem] p-4">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/40">{s.t}</p>
            <p className="mt-2 font-display text-4xl font-bold tabular">
              <span className="text-lima">{s.f("A")}</span> <span className="text-white/25">·</span> <span className="text-cielo">{s.f("B")}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Relato({ torneo, p, m }: { torneo: Torneo; p: PartidoTorneo; m: MarcadorVivo }) {
  const e = useMemo(() => calcularMarcador(m), [m]);
  const lado = (l: Lado) => nombreDupla(torneo, dupla(torneo, l === "A" ? p.duplaA : p.duplaB));
  const lista = e.jugados.slice(-7).reverse();
  const url = typeof window !== "undefined" ? `${location.origin}/torneos/${torneo.id}/partido/${encodeURIComponent(p.id)}` : "";
  return (
    <div className="glass flex min-h-0 flex-col rounded-[2.5rem] p-6">
      <div className="flex items-center justify-between">
        <p className="font-display text-2xl font-bold">Punto x punto</p>
        <span className="flex items-center gap-2 text-base font-semibold text-neon">
          <span className="size-2.5 animate-pulse rounded-full bg-neon" /> EN VIVO
        </span>
      </div>
      <div className="mt-4 min-h-0 flex-1 space-y-2.5 overflow-hidden">
        <AnimatePresence initial={false}>
          {lista.map((x) => (
            <motion.div key={x.n} layout initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} className={clsx("rounded-2xl border-l-4 bg-white/[0.04] px-4 py-3", x.gana === "A" ? "border-lima" : "border-cielo")}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-lg leading-snug text-white/85">{relatoPublico(x, lado)}</p>
                <span className="shrink-0 text-sm text-white/35">#{x.n}</span>
              </div>
              {x.evento && <p className="mt-1 text-sm font-bold uppercase tracking-wider text-lima">{x.evento === "GAME" ? "Game" : x.evento === "SET" ? "Set" : "Partido"} para {lado(x.gana)}</p>}
            </motion.div>
          ))}
        </AnimatePresence>
        {!lista.length && <p className="text-lg text-white/40">El partido está por empezar.</p>}
      </div>
      <div className="mt-4 flex items-center gap-4 rounded-2xl bg-white/[0.04] p-3">
        <div className="shrink-0 rounded-xl bg-blanco p-2">
          <QR texto={url} size={96} />
        </div>
        <p className="text-base leading-snug text-white/60">
          <span className="block font-semibold text-white">Estadísticas del partido</span>
          Para los atletas, con la clave del torneo
        </p>
      </div>
    </div>
  );
}

function Siguiente({ torneo, p, llamado }: { torneo: Torneo; p: PartidoTorneo | null; llamado: boolean }) {
  const ahora = useAhora(10_000);
  if (!p)
    return (
      <div className="text-center">
        <p className="font-display text-6xl font-bold">Pista libre</p>
        <p className="mt-3 text-2xl text-white/50">No hay partidos pendientes en esta pista.</p>
      </div>
    );
  const cat = categoria(torneo, p.categoriaId)!;
  const limite = limiteWO(torneo, p);
  const minutos = limite === null ? null : Math.max(0, Math.ceil((limite - ahora) / 60_000));
  return (
    <div>
      <p className={clsx("flex items-center gap-3 font-display text-3xl font-bold uppercase tracking-[0.2em]", llamado ? "text-lima" : "text-white/45")}>
        {llamado && <Megaphone className="size-9" />} {llamado ? "Llamado a pista" : "Siguiente partido"}
      </p>
      <p className="mt-2 text-2xl text-white/55">
        {nombreCategoria(cat.categoria)} · {p.etiqueta}
        {!llamado && p.programacion ? ` · ${p.programacion.hora}` : ""}
      </p>
      <div className="mt-8 space-y-4">
        {[p.duplaA, p.duplaB].map((d, i) => (
          <div key={i} className="glass flex items-center gap-6 rounded-[2rem] px-8 py-6">
            <CaraDupla torneo={torneo} duplaId={d} ids={dupla(torneo, d)?.jugadorIds ?? []} alto={92} />
            <p className="font-display text-5xl font-bold">{dupla(torneo, d)?.jugadorIds.map((id) => nombreJugador(torneo.jugadores.find((x) => x.id === id))).join(" / ")}</p>
          </div>
        ))}
      </div>
      {llamado && minutos !== null && (
        <p className="mt-8 font-display text-3xl text-white/70">
          Presentarse en <span className="font-bold text-lima">{minutos} min</span> o se aplica W.O.
        </p>
      )}
    </div>
  );
}

/** Foto de la dupla tomada en la pista; si no hay, las caras de los dos jugadores. */
function CaraDupla({ torneo, duplaId, ids, alto }: { torneo: Torneo; duplaId: string | null; ids: string[]; alto: number }) {
  const url = useFotoDupla(torneo.id, duplaId);
  const jug = (id: string) => torneo.jugadores.find((j) => j.id === id);
  if (url)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" style={{ height: alto, width: alto * 1.35 }} className="shrink-0 rounded-[1.5rem] object-cover ring-4 ring-marino-2" />;
  return (
    <div className="flex shrink-0 -space-x-4">
      {ids.map((id) => (
        <Avatar key={id} nombre={nombreJugador(jug(id))} fotoUrl={jug(id)?.fotoUrl} size={alto - 10} className="ring-4 ring-marino-2" />
      ))}
    </div>
  );
}
