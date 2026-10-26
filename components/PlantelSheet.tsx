"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, Mars, RotateCcw, UserMinus, UserPlus, Venus, X } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { TomarFoto } from "@/components/Foto";
import { toast } from "@/components/ui/Toaster";
import {
  activosEnEvento,
  agregarJugador,
  agregarPareja,
  nuevoId,
  primeraRondaEditable,
  reincorporarJugador,
  retirarJugador,
  retirarPareja,
} from "@/lib/evento";
import { vibrar } from "@/lib/feedback";
import { subirFoto } from "@/lib/fotos";
import { partidosPorRonda } from "@/lib/rotation";
import { nivelParaSuma } from "@/lib/categories";
import type { EventoAmericano, Genero, Jugador } from "@/types/americano";

/**
 * Cambios de plantel a mitad del evento: retirar a alguien (lesión, se tuvo que
 * ir) o sumar a quien llegó tarde. Las rondas ya jugadas no se tocan; las que
 * faltan se vuelven a sortear manteniendo el balance.
 */
export function PlantelSheet({
  evento,
  abierto,
  onClose,
  onCambio,
}: {
  evento: EventoAmericano;
  abierto: boolean;
  onClose: () => void;
  onCambio: (fn: (e: EventoAmericano) => EventoAmericano, mensaje: string) => void;
}) {
  const dupla = evento.modalidad === "DUPLA_FIJA";
  const mixto = evento.categoria.rama === "MIXTO";
  const generoFijo: Genero | null = evento.categoria.rama === "FEMENINO" ? "F" : evento.categoria.rama === "MASCULINO" ? "M" : null;
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [genero, setGenero] = useState<Genero>(generoFijo ?? "F");
  const desde = primeraRondaEditable(evento);
  const sinRondasFuturas = desde > evento.totalRondas;
  const porId = new Map(evento.jugadores.map((j) => [j.id, j]));

  const nuevoJugador = (nombre: string, g: Genero): Jugador => {
    const [n, ...resto] = nombre.trim().split(/\s+/);
    return { id: nuevoId("jug_"), nombre: n, apellido: resto.join(" ") || undefined, genero: g, nivel: evento.categoria.suma ? nivelParaSuma(evento.categoria.suma) : evento.categoria.nivel, fotoUrl: null };
  };

  const nombreRepetido = (n: string) => evento.jugadores.some((j) => !j.retirado && `${j.nombre} ${j.apellido ?? ""}`.trim().toLowerCase() === n.trim().toLowerCase());

  function puedeQuedar(sinId: string): string | null {
    if (dupla) return activosEnEvento(evento) - 1 < 2 ? "Deben quedar al menos 2 parejas." : null;
    const quedan = evento.jugadores.filter((j) => !j.retirado && j.id !== sinId);
    if (partidosPorRonda(quedan, evento.pistas, mixto) === 0)
      return mixto ? "Deben quedar al menos 2 hombres y 2 mujeres." : "Deben quedar al menos 4 jugadores.";
    return null;
  }

  function agregar() {
    if (sinRondasFuturas) return toast("Ya no quedan rondas por sortear.", "error");
    if (dupla) {
      if (!a.trim() || !b.trim()) return toast("Escribe los dos nombres de la pareja", "error");
      const ja = nuevoJugador(a, generoFijo ?? "M");
      const jb = nuevoJugador(b, generoFijo ?? "F");
      onCambio((e) => agregarPareja(e, ja, jb), `Pareja ${ja.nombre} / ${jb.nombre} agregada desde la ronda ${desde}`);
    } else {
      if (!a.trim()) return toast("Escribe el nombre", "error");
      if (nombreRepetido(a)) return toast(`Ya hay un jugador llamado ${a.trim()}`, "error");
      const j = nuevoJugador(a, generoFijo ?? genero);
      onCambio((e) => agregarJugador(e, j), `${j.nombre} entra desde la ronda ${desde}`);
    }
    setA("");
    setB("");
    vibrar(15);
  }

  return (
    <AnimatePresence>
      {abierto && (
        <>
          <motion.div className="fixed inset-0 z-50 bg-marino-2/50 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal
            aria-label="Jugadores del evento"
            className="glass-strong fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[88dvh] max-w-xl overflow-y-auto rounded-t-[2rem] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:bottom-6 sm:rounded-[2rem]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-xl font-bold">{dupla ? "Parejas" : "Jugadores"}</h2>
                <p className="text-xs text-white/50">
                  {sinRondasFuturas
                    ? "Ya no quedan rondas por sortear."
                    : `Los cambios re-sortean desde la ronda ${desde}. Lo jugado y sus puntos se conservan.`}
                </p>
              </div>
              <button className="btn-ghost !p-2.5" onClick={onClose} aria-label="Cerrar">
                <X className="size-5" />
              </button>
            </div>

            <div className="glass mt-4 flex flex-col gap-2 rounded-2xl p-3 sm:flex-row">
              {!dupla && !generoFijo && (
                <button
                  type="button"
                  onClick={() => setGenero((g) => (g === "M" ? "F" : "M"))}
                  className={clsx("flex h-11 shrink-0 items-center justify-center gap-1 rounded-xl border px-3 text-xs font-semibold", genero === "F" ? "border-fuchsia-400/40 text-fuchsia-300" : "border-cielo/40 text-cielo")}
                >
                  {genero === "F" ? <Venus className="size-4" /> : <Mars className="size-4" />}
                  {genero === "F" ? "Mujer" : "Hombre"}
                </button>
              )}
              <input className="input" placeholder={dupla ? "Jugador 1" : "Llegó tarde: nombre"} value={a} onChange={(e) => setA(e.target.value)} onKeyDown={(e) => e.key === "Enter" && agregar()} />
              {dupla && <input className="input" placeholder="Jugador 2" value={b} onChange={(e) => setB(e.target.value)} onKeyDown={(e) => e.key === "Enter" && agregar()} />}
              <button className="btn-neon shrink-0" onClick={agregar} disabled={sinRondasFuturas}>
                <UserPlus className="size-4" /> Sumar
              </button>
            </div>

            <ul className="mt-4 space-y-2">
              {dupla
                ? evento.parejas.map((p) => (
                    <li key={p.id} className={clsx("glass flex items-center gap-3 rounded-2xl px-3 py-2", p.retirada && "opacity-45")}>
                      <span className="flex -space-x-2">
                        {p.jugadorIds.map((id) => {
                          const j = porId.get(id);
                          return j ? <FotoJugador key={id} evento={evento} j={j} onCambio={onCambio} /> : <Avatar key={id} nombre="?" size={30} />;
                        })}
                      </span>
                      <span className="flex-1 truncate text-sm font-medium">{p.nombre}</span>
                      {p.retirada ? (
                        <span className="chip">Retirada</span>
                      ) : (
                        <button
                          className="btn-ghost !px-3 !py-1.5 text-xs text-coral"
                          disabled={sinRondasFuturas}
                          onClick={() => {
                            const motivo = puedeQuedar(p.id);
                            if (motivo) return toast(motivo, "error");
                            if (!confirm(`¿Retirar a ${p.nombre}? Sus puntos se conservan y no jugará desde la ronda ${desde}.`)) return;
                            onCambio((e) => retirarPareja(e, p.id), `${p.nombre} retirada`);
                          }}
                        >
                          <UserMinus className="size-3.5" /> Retirar
                        </button>
                      )}
                    </li>
                  ))
                : evento.jugadores.map((j) => (
                    <li key={j.id} className={clsx("glass flex items-center gap-3 rounded-2xl px-3 py-2", j.retirado && "opacity-45")}>
                      <FotoJugador evento={evento} j={j} onCambio={onCambio} />
                      <span className="flex-1 truncate text-sm font-medium">
                        {j.nombre} {j.apellido}
                      </span>
                      {j.retirado ? (
                        <button
                          className="btn-ghost !px-3 !py-1.5 text-xs"
                          disabled={sinRondasFuturas}
                          onClick={() => onCambio((e) => reincorporarJugador(e, j.id), `${j.nombre} vuelve desde la ronda ${desde}`)}
                        >
                          <RotateCcw className="size-3.5" /> Reincorporar
                        </button>
                      ) : (
                        <button
                          className="btn-ghost !px-3 !py-1.5 text-xs text-coral"
                          disabled={sinRondasFuturas}
                          onClick={() => {
                            const motivo = puedeQuedar(j.id);
                            if (motivo) return toast(motivo, "error");
                            if (!confirm(`¿Retirar a ${j.nombre}? Sus puntos se conservan y no jugará desde la ronda ${desde}.`)) return;
                            onCambio((e) => retirarJugador(e, j.id), `${j.nombre} ${j.genero === "F" ? "retirada" : "retirado"}`);
                          }}
                        >
                          <UserMinus className="size-3.5" /> Retirar
                        </button>
                      )}
                    </li>
                  ))}
            </ul>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/** Toca la cara del jugador para tomarle la foto (sale en el cuadro, el ranking y la TV). */
function FotoJugador({ evento, j, onCambio }: { evento: EventoAmericano; j: Jugador; onCambio: (fn: (e: EventoAmericano) => EventoAmericano, mensaje: string) => void }) {
  return (
    <TomarFoto
      className="relative rounded-full"
      etiqueta={`Foto de ${j.nombre}`}
      onFoto={async (img) => {
        const r = await subirFoto(evento.id, "jugador", j.id, img);
        if (!r.url) return toast(r.error!, "error");
        onCambio((e) => ({ ...e, jugadores: e.jugadores.map((x) => (x.id === j.id ? { ...x, fotoUrl: r.url } : x)) }), `Foto de ${j.nombre} lista`);
      }}
    >
      <Avatar nombre={`${j.nombre} ${j.apellido ?? ""}`} fotoUrl={j.fotoUrl} size={30} />
      {!j.fotoUrl && (
        <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-lima text-marino-2">
          <Camera className="size-2.5" />
        </span>
      )}
    </TomarFoto>
  );
}
