"use client";

import clsx from "clsx";
import { useParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronRight, Eye, LockKeyhole, Flag, Pause, Pencil, Play, RotateCcw, Trash2, Trophy, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { PlantelSheet } from "@/components/PlantelSheet";
import { useEffect, useRef, useState } from "react";
import { AvatarPareja } from "@/components/Avatar";
import { Cronometro, MarcadorRonda } from "@/components/Cronometro";
import { EnEspera } from "@/components/EnEspera";
import { EventoShell } from "@/components/EventoShell";
import { ScoreModal } from "@/components/ScoreModal";
import { Confetti } from "@/components/ui/Confetti";
import { toast } from "@/components/ui/Toaster";
import { useReloj } from "@/hooks/useReloj";
import {
  avanzarRonda,
  borrarResultado,
  cargarResultado,
  despues,
  eliminarEvento,
  iniciarRonda,
  pausarRonda,
  progresoEvento,
  reiniciarCronometro,
  rondaCompleta,
  volverARonda,
} from "@/lib/evento";
import { sonar, vibrar } from "@/lib/feedback";
import { horaRonda, nombrePista } from "@/lib/horarios";
import { PistaLabel } from "@/components/PistaLabel";
import { calcularTabla, ganador } from "@/lib/scoring";
import { useAmericanos, useEsStaff } from "@/lib/store";
import type { EventoAmericano, Jugador, Partido } from "@/types/americano";

export default function CuadroVivoPage() {
  const { id } = useParams<{ id: string }>();
  return <EventoShell id={id}>{(evento) => <CuadroVivo evento={evento} />}</EventoShell>;
}

function CuadroVivo({ evento }: { evento: EventoAmericano }) {
  const actualizar = useAmericanos((s) => s.actualizar);
  const esStaff = useEsStaff();
  const setPedirLogin = useAmericanos((s) => s.setPedirLogin);
  const [vista, setVista] = useState(evento.rondaActual);
  const [abierto, setAbierto] = useState<Partido | null>(null);
  const [fiesta, setFiesta] = useState(false);
  const [plantel, setPlantel] = useState(false);
  const router = useRouter();
  const rondaPrevia = useRef(evento.rondaActual);

  // Sigue a la ronda actual cuando avanza (también si avanza desde otro dispositivo).
  useEffect(() => {
    if (rondaPrevia.current !== evento.rondaActual) {
      setVista(evento.rondaActual);
      rondaPrevia.current = evento.rondaActual;
    }
  }, [evento.rondaActual]);

  const ronda = evento.rondas.find((r) => r.numero === vista) ?? evento.rondas[0];
  const esActual = ronda?.numero === evento.rondaActual && evento.estado !== "FINALIZADO";
  const conReloj = evento.cronometro !== false;
  const reloj = useReloj(esActual && conReloj ? ronda : undefined, evento.duracionRondaMin);
  const relojVista = useReloj(ronda, evento.duracionRondaMin, { alarma: false });
  const prog = progresoEvento(evento);
  const porId = new Map(evento.jugadores.map((j) => [j.id, j]));
  const pendientes = ronda?.partidos.filter((p) => p.estado !== "FINALIZADO").length ?? 0;
  const ultima = evento.rondaActual >= evento.totalRondas;

  const act = (fn: (e: EventoAmericano) => EventoAmericano) => actualizar(evento.id, fn);

  function avanzar() {
    if (pendientes > 0 && !confirm(`Quedan ${pendientes} partido(s) sin resultado en esta ronda. ¿Avanzar igual?`)) return;
    const antesRonda = evento.rondaActual;
    const antesEstado = evento.estado;
    const r0 = evento.rondas.find((r) => r.numero === antesRonda);
    act(avanzarRonda);
    const deshacer = () =>
      act((e) => ({
        ...e,
        rondaActual: antesRonda,
        estado: antesEstado,
        actualizadoEn: despues(e.actualizadoEn),
        rondas: e.rondas.map((r) =>
          r.numero === antesRonda && r0 ? { ...r, estado: r0.estado, inicioEn: r0.inicioEn, segundosAcumulados: r0.segundosAcumulados } : r,
        ),
      }));
    setFiesta(true);
    setTimeout(() => setFiesta(false), 3200);
    sonar("ok");
    vibrar([30, 50, 30, 50, 80]);
    if (ultima) {
      const campeon = calcularTabla(evento).filas[0];
      toast(`🏆 ¡${campeon?.nombre ?? "Campeón"} gana el evento!`, "ok", { label: "Deshacer", fn: deshacer });
    } else {
      toast(`Ronda ${evento.rondaActual} cerrada`, "ok", { label: "Deshacer", fn: deshacer });
    }
  }

  if (!ronda) return <p className="mt-10 text-center text-white/50">Este evento no tiene rondas. Revisa la cantidad de jugadores.</p>;

  return (
    <div>
      <Confetti activo={fiesta} />

      {/* Selector de rondas */}
      <div className="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {evento.rondas.map((r) => {
          const completa = rondaCompleta(r);
          const actual = r.numero === evento.rondaActual && evento.estado !== "FINALIZADO";
          return (
            <button
              key={r.numero}
              onClick={() => {
                vibrar(8);
                setVista(r.numero);
              }}
              className={clsx(
                "relative flex shrink-0 items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-semibold transition",
                r.numero === vista ? "seleccion sobre-marca text-white" : "glass border-transparent text-white/70 hover:border-white/20",
              )}
            >
              {completa && <Check className="size-3.5" strokeWidth={3} />}
              R{r.numero}
              {conReloj && <span className={clsx("text-[11px] font-medium", r.numero === vista ? "text-lima" : "text-white/40")}>{horaRonda(evento, r.numero)}</span>}
              {actual && r.numero !== vista && <span className="absolute -right-1 -top-1 size-2.5 animate-pulse rounded-full bg-neon" />}
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* Panel de control de la ronda */}
        <aside className="glass flex flex-col items-center rounded-3xl p-6 lg:sticky lg:top-4 lg:self-start">
          <p className="label !mb-1">
            Ronda {ronda.numero} de {evento.totalRondas}
            {conReloj && ` · ${horaRonda(evento, ronda.numero)}`}
          </p>
          {conReloj ? (
            <Cronometro
              restantes={esActual ? reloj.restantes : relojVista.restantes}
              progreso={esActual ? reloj.progreso : relojVista.progreso}
              corriendo={esActual && reloj.corriendo}
              className="my-3"
            />
          ) : (
            <MarcadorRonda ronda={ronda} total={evento.totalRondas} className="my-3" />
          )}

          {!esStaff ? (
            <div className="mt-1 flex w-full flex-col items-center gap-2 text-center">
              <span className="chip">
                <Eye className="size-3" /> Modo espectador
              </span>
              <p className="text-xs text-white/50">Estás viendo el cuadro en vivo. Solo el staff carga marcadores.</p>
              <button className="btn-ghost w-full text-xs" onClick={() => setPedirLogin(true)}>
                <LockKeyhole className="size-3.5" /> Soy staff
              </button>
            </div>
          ) : evento.estado === "FINALIZADO" ? (
            <div className="mt-2 flex flex-col items-center gap-2 text-center">
              <Trophy className="size-8 text-neon" />
              <p className="font-semibold">Evento finalizado</p>
              <button className="btn-ghost text-xs" onClick={() => act((e) => volverARonda(e, e.totalRondas))}>
                <Pencil className="size-3.5" /> Reabrir para corregir
              </button>
            </div>
          ) : esActual ? (
            <div className="flex w-full flex-col gap-2">
              {ronda.estado === "EN_JUEGO" ? (
                conReloj && (
                  <button className="btn-ghost w-full" onClick={() => act((e) => pausarRonda(e))}>
                    <Pause className="size-4" /> Pausar
                  </button>
                )
              ) : (
                <button
                  className="btn-neon w-full py-4 text-base"
                  onClick={() => {
                    sonar("ok");
                    vibrar(20);
                    act((e) => iniciarRonda(e));
                  }}
                >
                  <Play className="size-5" /> {ronda.estado === "PAUSADA" && conReloj ? "Reanudar" : "Iniciar ronda"}
                </button>
              )}
              <div className="flex gap-2">
                {conReloj && (
                  <button className="btn-ghost flex-1 !px-3 text-xs" onClick={() => act((e) => reiniciarCronometro(e))}>
                    <RotateCcw className="size-3.5" /> Reloj
                  </button>
                )}
                <button
                  className={clsx("flex-1 !px-3 text-xs", rondaCompleta(ronda) ? "btn-neon animate-pulse-neon" : "btn-ghost")}
                  onClick={avanzar}
                >
                  {ultima ? <Flag className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                  {ultima ? "Finalizar" : "Siguiente"}
                </button>
              </div>
            </div>
          ) : (
            <button className="btn-ghost w-full text-xs" onClick={() => act((e) => volverARonda(e, ronda.numero))}>
              Hacer esta la ronda actual
            </button>
          )}

          <div className="mt-6 w-full">
            <div className="mb-1.5 flex justify-between text-xs text-white/50">
              <span>Progreso del evento</span>
              <span className="font-semibold text-white">
                {prog.jugados}/{prog.total}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/5">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-neon to-emerald-400" animate={{ width: `${prog.pct}%` }} />
            </div>
          </div>

          {esStaff && <div className="mt-6 flex w-full gap-2">
            <button className="btn-ghost flex-1 !px-3 text-xs" onClick={() => setPlantel(true)}>
              <Users className="size-3.5" /> {evento.modalidad === "DUPLA_FIJA" ? "Parejas y fotos" : "Jugadores y fotos"}
            </button>
            <button
              className="btn-ghost !px-3 text-xs text-coral"
              aria-label="Eliminar evento"
              title="Eliminar evento"
              onClick={() => {
                if (!confirm(`¿Eliminar "${evento.nombre}"? Se borra en todos los dispositivos.`)) return;
                if (evento.estado !== "BORRADOR" && prompt('Escribe ELIMINAR para confirmar') !== "ELIMINAR") return;
                act(eliminarEvento);
                toast("Evento eliminado", "info");
                router.push("/americanos");
              }}
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>}
        </aside>

        {/* Pistas activas */}
        <section>
          <AnimatePresence mode="popLayout">
            <motion.div
              key={ronda.numero}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="grid gap-4 sm:grid-cols-2"
            >
              {ronda.partidos.map((p, i) => (
                <PistaCard
                  key={p.id}
                  partido={p}
                  evento={evento}
                  porId={porId}
                  index={i}
                  soloLectura={!esStaff}
                  onClick={() => {
                    vibrar(10);
                    if (!esStaff) {
                      toast("Solo el staff carga marcadores", "info", { label: "Soy staff", fn: () => setPedirLogin(true) });
                      return;
                    }
                    if (ronda.numero > evento.rondaActual && p.estado !== "FINALIZADO") {
                      toast(`La ronda ${ronda.numero} aún no empieza. Estás en la ronda ${evento.rondaActual}.`, "info");
                      return;
                    }
                    setAbierto(p);
                  }}
                />
              ))}
            </motion.div>
          </AnimatePresence>
          {esStaff && pendientes > 0 && (
            <p className="mt-4 text-center text-xs text-white/40">Toca una pista para cargar el marcador · {pendientes} pendiente(s)</p>
          )}
          <EnEspera evento={evento} ronda={ronda} />
        </section>
      </div>

      <PlantelSheet
        evento={evento}
        abierto={plantel}
        onClose={() => setPlantel(false)}
        onCambio={(fn, mensaje) => {
          act(fn);
          toast(mensaje, "info");
        }}
      />

      <ScoreModal
        partido={abierto}
        config={evento.puntuacion}
        nombrePista={abierto ? nombrePista(evento, abierto.pista) : ""}
        jugadores={evento.jugadores}
        onClose={() => setAbierto(null)}
        onGuardar={(r) => {
          if (!abierto) return; // doble toque
          const p = abierto;
          const previo = p.resultado;
          act((e) => cargarResultado(e, p.id, r));
          toast(`${nombrePista(evento, p.pista)}: ${previo ? "marcador corregido" : "resultado guardado"}`, "ok", {
            label: "Deshacer",
            fn: () => act((e) => (previo ? cargarResultado(e, p.id, previo) : borrarResultado(e, p.id))),
          });
          setAbierto(null);
        }}
        onBorrar={() => {
          if (!abierto) return;
          const p = abierto;
          const previo = p.resultado;
          if (!confirm(`¿Borrar el resultado de ${nombrePista(evento, p.pista)}?`)) return;
          act((e) => borrarResultado(e, p.id));
          toast("Resultado borrado", "info", previo ? { label: "Deshacer", fn: () => act((e) => cargarResultado(e, p.id, previo)) } : undefined);
          setAbierto(null);
        }}
      />
    </div>
  );
}

function PistaCard({
  partido,
  evento,
  porId,
  index,
  onClick,
  soloLectura = false,
}: {
  partido: Partido;
  evento: EventoAmericano;
  porId: Map<string, Jugador>;
  index: number;
  onClick: () => void;
  soloLectura?: boolean;
}) {
  const res = partido.resultado;
  const g = res ? ganador(evento.puntuacion, res) : null;
  const terminado = partido.estado === "FINALIZADO";
  const enJuego = partido.estado === "EN_JUEGO";

  const Lado = ({ lado }: { lado: "A" | "B" }) => {
    const par = lado === "A" ? partido.parejaA : partido.parejaB;
    const js = par.jugadorIds.map((id) => porId.get(id));
    const gana = g === (lado === "A" ? 1 : -1);
    const valor = res ? (lado === "A" ? res.puntosA : res.puntosB) : null;
    return (
      <div className={clsx("flex items-center gap-3 rounded-2xl p-3 transition", gana ? "bg-neon/10" : terminado ? "opacity-60" : "")}>
        <AvatarPareja nombres={js.map((j) => j?.nombre ?? "?")} fotos={js.map((j) => j?.fotoUrl)} size={38} />
        <div className="min-w-0 flex-1">
          {js.map((j, i) => (
            <p key={i} className={clsx("truncate text-sm leading-snug", gana ? "font-bold text-white" : "font-medium text-white/85")}>
              {j ? `${j.nombre}${j.apellido ? ` ${j.apellido.charAt(0)}.` : ""}` : "?"}
            </p>
          ))}
        </div>
        {valor !== null && (
          <motion.span key={valor} initial={{ scale: 1.4 }} animate={{ scale: 1 }} className={clsx("font-display text-3xl font-bold tabular", gana ? "text-neon" : "text-white/70")}>
            {valor}
          </motion.span>
        )}
      </div>
    );
  };

  return (
    <motion.button
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={clsx(
        "glass group relative w-full overflow-hidden rounded-3xl p-3 text-left transition hover:border-neon/40",
        enJuego && "border-neon/25",
      )}
    >
      <div className="flex items-center justify-between px-2 pb-2 pt-1">
        <PistaLabel evento={evento} numero={partido.pista} className="text-sm tracking-[0.2em]" />
        {terminado ? (
          <span className="chip border-neon/30 text-neon">
            <Check className="size-3" /> Final
            {res?.sets && res.sets.length > 0 && <span className="ml-1 text-white/60">{res.sets.map((s) => `${s.a}-${s.b}`).join(" ")}</span>}
            {res?.tieBreak && <span className="ml-1 text-white/60">(tie {res.tieBreak.a}-{res.tieBreak.b})</span>}
          </span>
        ) : enJuego ? (
          <span className="chip">
            <span className="size-1.5 animate-pulse rounded-full bg-neon" /> Jugando
          </span>
        ) : (
          <span className="chip text-white/50">Por jugar</span>
        )}
      </div>
      <Lado lado="A" />
      <div className="relative my-1 flex items-center justify-center">
        <span className="absolute inset-x-3 h-px bg-white/10" />
        <span className="relative rounded-full border border-white/10 bg-fondo px-2.5 py-0.5 text-[10px] font-black tracking-widest text-white/40">VS</span>
      </div>
      <Lado lado="B" />
      {!soloLectura && (
        <div className="mt-2 flex items-center justify-center gap-1.5 rounded-xl bg-white/[0.03] py-2 text-xs font-semibold text-white/50 transition group-hover:bg-neon group-hover:text-noche">
          <Pencil className="size-3.5" /> {terminado ? "Editar marcador" : "Cargar marcador"}
        </div>
      )}
    </motion.button>
  );
}

