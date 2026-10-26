"use client";

import clsx from "clsx";
import Link from "next/link";
import { use, useState } from "react";
import { motion } from "framer-motion";
import { Clock, CloudRain, Flag, Megaphone, MonitorPlay, Play, Radio, Timer, Trophy, Tv } from "lucide-react";
import { ImprevistosHoja } from "@/components/torneo/ImprevistosHoja";
import { toast } from "@/components/ui/Toaster";
import { MatchCard, ResultadoHoja } from "@/components/torneo/piezas";
import { TorneoShell } from "@/components/torneo/TorneoShell";
import { FranjaPatrocinadores } from "@/components/torneo/Patrocinadores";
import { MarcadorMini, useAhora, useMarcadoresEnVivo } from "@/components/torneo/vivo";
import { sonar, vibrar } from "@/lib/feedback";
import { nombreCorto } from "@/lib/torneo/categorias";
import { atrasoMinutos, estadoPistas, limiteWO, partidosListos, vencidosWO } from "@/lib/torneo/programacion";
import { nombrePista, pistaCorta, suspensionesActivas, textoPistas } from "@/lib/torneo/imprevistos";
import { cargarWO, categoria, dupla, llamarAPista, nombreDupla, progresoTorneo } from "@/lib/torneo/torneo";
import { useEsStaff } from "@/lib/store";
import { useTorneos } from "@/lib/torneosStore";
import type { PartidoTorneo, Torneo } from "@/types/torneo";

export default function TorneoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TorneoShell id={id}>{(t) => <EnVivo torneo={t} />}</TorneoShell>;
}

function EnVivo({ torneo }: { torneo: Torneo }) {
  useMarcadoresEnVivo(torneo.id);
  const ahora = useAhora(15_000);
  const esStaff = useEsStaff();
  const guardar = useTorneos((s) => s.guardar);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [imprevistos, setImprevistos] = useState(false);
  const prog = progresoTorneo(torneo);
  const pistas = estadoPistas(torneo, ahora);
  const suspensiones = suspensionesActivas(torneo, ahora);
  const atraso = atrasoMinutos(torneo, new Date(ahora));
  const vencidos = new Set(vencidosWO(torneo, ahora).map((p) => p.id));
  const asignados = new Set(pistas.map((p) => p.siguiente?.id));
  const proximos = partidosListos(torneo).filter((p) => !asignados.has(p.id)).slice(0, 8);
  const recientes = torneo.categorias
    .flatMap((c) => c.cuadro?.partidos ?? [])
    .filter((p) => p.estado === "FINALIZADO" && !p.bye && p.finEn)
    .sort((a, b) => (b.finEn ?? "").localeCompare(a.finEn ?? ""))
    .slice(0, 6);
  const publicadas = torneo.categorias.filter((c) => c.cuadro?.publicado).length;

  const llamar = (p: PartidoTorneo, pista: number) => {
    vibrar([10, 30, 10]);
    sonar("ok");
    guardar(llamarAPista(torneo, p.id, pista));
    toast(`A ${nombrePista(torneo, pista)}: ${nombreDupla(torneo, dupla(torneo, p.duplaA))} vs ${nombreDupla(torneo, dupla(torneo, p.duplaB))}`);
  };

  return (
    <>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: Trophy, v: `${prog.jugados}/${prog.total}`, l: "Partidos jugados" },
          { icon: Radio, v: prog.enJuego, l: "En juego ahora" },
          { icon: Timer, v: prog.duplas, l: "Duplas" },
          { icon: Clock, v: atraso >= 5 ? `+${atraso}′` : "En hora", l: atraso >= 5 ? "Atraso" : "Programación", alerta: atraso >= 15 },
        ].map((s) => (
          <div key={s.l} className={clsx("glass rounded-2xl p-4", s.alerta && "!border-coral/40")}>
            <s.icon className={clsx("size-4", s.alerta ? "text-coral" : "text-neon")} />
            <p className={clsx("mt-2 font-display text-2xl font-bold tabular", s.alerta && "text-coral")}>{s.v}</p>
            <p className="text-xs text-white/50">{s.l}</p>
          </div>
        ))}
      </div>

      {publicadas === 0 ? (
        <div className="glass mt-6 rounded-3xl p-8 text-center text-white/60">
          <p className="font-display text-xl font-semibold text-white">Aún no hay cuadros publicados</p>
          <p className="mt-2 text-sm">{esStaff ? "Inscribe duplas en cada categoría y toca Sorteo para armar y programar el cuadro." : "El staff publicará los cuadros y horarios pronto."}</p>
          {esStaff && (
            <Link href={`/torneos/${torneo.id}/categorias`} className="btn-neon mt-5">
              Ir a inscripciones
            </Link>
          )}
        </div>
      ) : (
        <>
          {suspensiones.map((s) => (
            <div key={s.id} className="mt-6 flex items-center gap-3 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm">
              <CloudRain className="size-5 shrink-0 text-amber-200" />
              <p className="flex-1">
                <b>{s.motivo}:</b> {textoPistas(torneo, s.pistas)} sin juego {s.hasta ? `hasta las ${s.hasta.slice(11)}` : "hasta nuevo aviso"}. Los horarios ya están actualizados.
              </p>
              {esStaff && (
                <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => setImprevistos(true)}>
                  Gestionar
                </button>
              )}
            </div>
          ))}
          <div className="mt-8 flex items-end justify-between gap-3">
            <h2 className="font-display text-xl font-semibold">Pistas</h2>
            <div className="flex items-center gap-4">
              {esStaff && (
                <button onClick={() => setImprevistos(true)} className="flex items-center gap-1.5 text-sm font-semibold text-amber-200">
                  <CloudRain className="size-4" /> Imprevistos
                </button>
              )}
              <Link href={`/torneos/${torneo.id}/tv`} className="flex items-center gap-1.5 text-sm font-semibold text-neon">
                <Tv className="size-4" /> Modo TV
              </Link>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pistas.map((c, i) => {
              const actual = c.enJuego ?? c.llamado;
              const cat = actual ? categoria(torneo, actual.categoriaId) : null;
              return (
                <motion.div
                  key={c.numero}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={clsx("glass relative overflow-hidden rounded-3xl p-4", c.enJuego && "!border-neon/40")}
                >
                  <div className="flex items-center gap-2">
                    <span className={clsx("flex size-9 items-center justify-center rounded-full font-display font-bold", c.enJuego ? "bg-lima text-marino-2" : c.sede ? "bg-cielo/25 text-cielo" : "bg-pista text-blanco")}>{c.sede ? c.numero % 100 : c.numero}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        {c.nombre}
                        {c.sede && <span className="font-normal text-cielo"> · {c.sede}</span>}
                      </p>
                      <p className="text-xs text-white/45">
                        {c.enJuego ? `En juego · ${nombreCorto(cat!.categoria)} · ${c.enJuego.etiqueta}` : c.llamado ? `Llamado · ${nombreCorto(cat!.categoria)}` : c.suspendida ? `Suspendida · ${c.suspendida}` : "Libre"}
                      </p>
                    </div>
                    <Link href={`/torneos/${torneo.id}/pista/${c.numero}`} className="btn-ghost !p-2" title="Pantalla de esta pista" aria-label={`Pantalla de ${c.nombre}`}>
                      <MonitorPlay className="size-4" />
                    </Link>
                  </div>
                  <div className="mt-3">
                    {c.enJuego ? (
                      <button className="block w-full text-left" onClick={() => setAbierto(c.enJuego!.id)}>
                        <MarcadorMini torneo={torneo} p={c.enJuego} />
                      </button>
                    ) : c.llamado ? (
                      <div>
                        <MatchCard torneo={torneo} p={c.llamado} compacto onClick={() => setAbierto(c.llamado!.id)} />
                        <Llamado torneo={torneo} p={c.llamado} ahora={ahora} />
                        {esStaff && (
                          <div className="mt-2 flex gap-2">
                            <Link href={`/torneos/${torneo.id}/anotar/${encodeURIComponent(c.llamado.id)}`} className="btn-neon flex-1 !py-2">
                              <Play className="size-4" /> Empezar
                            </Link>
                          </div>
                        )}
                        {esStaff && vencidos.has(c.llamado.id) && (
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            {(["A", "B"] as const).map((l) => {
                              const p = c.llamado!;
                              const nombre = nombreDupla(torneo, dupla(torneo, l === "A" ? p.duplaA : p.duplaB));
                              return (
                                <button
                                  key={l}
                                  className="btn-ghost !py-1.5 text-xs !text-coral"
                                  onClick={() => {
                                    if (!confirm(`¿W.O.? No se presentó ${nombre}.`)) return;
                                    guardar(cargarWO(torneo, p.id, l === "A" ? "B" : "A", "Staff"));
                                    toast(`W.O.: gana ${nombreDupla(torneo, dupla(torneo, l === "A" ? p.duplaB : p.duplaA))}`);
                                  }}
                                >
                                  <Flag className="size-3.5" /> No vino {nombre}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : c.siguiente ? (
                      <div>
                        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">Siguiente</p>
                        <MatchCard torneo={torneo} p={c.siguiente} compacto onClick={() => setAbierto(c.siguiente!.id)} />
                        {esStaff && (
                          <button className="btn-neon mt-2 w-full !py-2" onClick={() => llamar(c.siguiente!, c.numero)}>
                            <Megaphone className="size-4" /> Llamar a {c.sede ? pistaCorta(torneo, c.numero) : c.nombre.toLowerCase()}
                          </button>
                        )}
                      </div>
                    ) : c.suspendida ? (
                      <p className="flex items-center justify-center gap-2 py-4 text-sm text-amber-200">
                        <CloudRain className="size-4" /> {c.suspendida}: sin juego por ahora
                      </p>
                    ) : (
                      <p className="py-4 text-center text-sm text-white/40">Sin partidos listos</p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {proximos.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-3 font-display text-xl font-semibold">Próximos</h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {proximos.map((p) => (
                  <MatchCard key={p.id} torneo={torneo} p={p} compacto onClick={() => setAbierto(p.id)} />
                ))}
              </div>
            </section>
          )}
          {recientes.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-3 font-display text-xl font-semibold">Últimos resultados</h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {recientes.map((p) => (
                  <MatchCard key={p.id} torneo={torneo} p={p} compacto onClick={() => setAbierto(p.id)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
      <FranjaPatrocinadores torneo={torneo} className="mt-10 justify-center border-t border-white/5 pt-6" />
      <ResultadoHoja torneo={torneo} partidoId={abierto} onClose={() => setAbierto(null)} />
      {esStaff && <ImprevistosHoja torneo={torneo} abierta={imprevistos} onClose={() => setImprevistos(false)} />}
    </>
  );
}

function Llamado({ torneo, p, ahora }: { torneo: Torneo; p: PartidoTorneo; ahora: number }) {
  const limite = limiteWO(torneo, p);
  if (!p.llamadoEn || limite === null) return null;
  const pasados = Math.floor((ahora - new Date(p.llamadoEn).getTime()) / 60_000);
  const quedan = Math.ceil((limite - ahora) / 60_000);
  return (
    <p className={clsx("mt-2 text-xs font-semibold", quedan <= 0 ? "text-coral" : quedan <= 5 ? "text-amber-200" : "text-white/50")}>
      {quedan > 0 ? quedan > torneo.toleranciaWO
          ? `Llamado hace ${pasados} min · hora prevista ${new Date(limite - torneo.toleranciaWO * 60_000).toTimeString().slice(0, 5)}`
          : `Llamado hace ${pasados} min · W.O. en ${quedan} min` : `Pasó la tolerancia de ${torneo.toleranciaWO} min: se puede dar W.O.`}
    </p>
  );
}
