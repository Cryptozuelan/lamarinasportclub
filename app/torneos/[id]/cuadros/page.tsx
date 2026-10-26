"use client";

import clsx from "clsx";
import { use, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Crown, Dices, HelpCircle, Trophy } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { toast } from "@/components/ui/Toaster";
import { CategoriaChips, MatchCard, ResultadoHoja, textoOrigen, useCategoriaSel } from "@/components/torneo/piezas";
import { TorneoShell } from "@/components/torneo/TorneoShell";
import { crearRng } from "@/lib/rotation";
import { nombreCategoria } from "@/lib/torneo/categorias";
import { campeon, dupla, nombreDupla, nombreJugador, registrarSorteoDesempate, tablasCategoria } from "@/lib/torneo/torneo";
import type { TablaGrupo } from "@/lib/torneo/tabla";
import { useEsStaff } from "@/lib/store";
import { useTorneos } from "@/lib/torneosStore";
import type { CategoriaEnTorneo, PartidoTorneo, Torneo } from "@/types/torneo";

export default function CuadrosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TorneoShell id={id}>{(t) => <Cuadros torneo={t} />}</TorneoShell>;
}

function Cuadros({ torneo }: { torneo: Torneo }) {
  const esStaff = useEsStaff();
  const [cat, setCat] = useCategoriaSel(torneo, !esStaff);
  const [abierto, setAbierto] = useState<string | null>(null);
  if (!cat) return <p className="mt-16 text-center text-white/50">Todavía no hay cuadros publicados.</p>;
  return (
    <>
      <CategoriaChips torneo={torneo} valor={cat.categoria.id} onChange={setCat} soloPublicadas={!esStaff} />
      {!cat.cuadro ? (
        <p className="glass mt-6 rounded-3xl p-10 text-center text-white/55">
          {nombreCategoria(cat.categoria)} aún no tiene sorteo. {esStaff ? "Hazlo desde Inscritos → Sorteo." : ""}
        </p>
      ) : (
        <CuadroCategoria torneo={torneo} cat={cat} onPartido={setAbierto} />
      )}
      <ResultadoHoja torneo={torneo} partidoId={abierto} onClose={() => setAbierto(null)} />
    </>
  );
}

function CuadroCategoria({ torneo, cat, onPartido }: { torneo: Torneo; cat: CategoriaEnTorneo; onPartido: (id: string) => void }) {
  const tablas = useMemo(() => tablasCategoria(torneo, cat), [torneo, cat]);
  const llave = cat.cuadro!.partidos.filter((p) => p.fase === "LLAVE" && p.cuadro !== "CONSOLACION");
  const consolacion = cat.cuadro!.partidos.filter((p) => p.fase === "LLAVE" && p.cuadro === "CONSOLACION");
  const ganador = campeon(cat);
  const liga = cat.config.formato === "LIGA" && tablas[0]?.completo ? tablas[0].filas[0]?.duplaId : null;
  const campeonId = ganador ?? liga;

  return (
    <div className="mt-4 space-y-8">
      {!cat.cuadro!.publicado && <p className="rounded-2xl bg-cielo/10 p-3 text-sm text-cielo">Borrador: este cuadro aún no está publicado ni programado.</p>}
      {campeonId && <Campeon torneo={torneo} duplaId={campeonId} />}
      {tablas.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">Fase de grupos</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {tablas.map((tb) => (
              <GrupoCard key={tb.grupo.id} torneo={torneo} cat={cat} tabla={tb} onPartido={onPartido} />
            ))}
          </div>
        </section>
      )}
      {llave.length > 0 && <Llave torneo={torneo} partidos={llave} titulo="Cuadro final" onPartido={onPartido} />}
      {consolacion.length > 0 && <Llave torneo={torneo} partidos={consolacion} titulo="Consolación" onPartido={onPartido} />}
    </div>
  );
}

function Campeon({ torneo, duplaId }: { torneo: Torneo; duplaId: string }) {
  const d = dupla(torneo, duplaId);
  const js = d?.jugadorIds.map((id) => torneo.jugadores.find((j) => j.id === id)) ?? [];
  return (
    <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="seleccion sobre-marca relative overflow-hidden rounded-[2rem] border p-6 text-center">
      <div className="pointer-events-none absolute inset-x-0 -top-20 mx-auto size-60 rounded-full bg-lima/30 blur-3xl" />
      <Trophy className="relative mx-auto size-10 text-lima" />
      <p className="label relative mt-2 !text-lima">Campeones</p>
      <div className="relative mt-2 flex justify-center -space-x-3">
        {js.map((j) => (
          <Avatar key={j?.id} nombre={nombreJugador(j)} fotoUrl={j?.fotoUrl} size={56} className="ring-4 ring-marino" />
        ))}
      </div>
      <p className="relative mt-3 font-display text-2xl font-bold">{js.map(nombreJugador).join(" / ")}</p>
    </motion.div>
  );
}

function GrupoCard({ torneo, cat, tabla, onPartido }: { torneo: Torneo; cat: CategoriaEnTorneo; tabla: TablaGrupo; onPartido: (id: string) => void }) {
  const esStaff = useEsStaff();
  const guardar = useTorneos((s) => s.guardar);
  const [porque, setPorque] = useState(false);
  const pasan = cat.config.formato === "GRUPOS_LLAVE" ? cat.config.clasificanPorGrupo : cat.config.formato === "LIGA_FINAL" ? 2 : 1;
  const partidos = cat.cuadro!.partidos.filter((p) => p.fase === "GRUPOS" && p.grupoId === tabla.grupo.id).sort((a, b) => a.ronda - b.ronda);
  const signo = (n: number) => (n > 0 ? `+${n}` : String(n));

  function sortearEmpate() {
    const ids = tabla.sorteoPendiente!;
    const rng = crearRng(Date.now() % 2 ** 31);
    const orden = [...ids].map((id) => ({ id, r: rng() })).sort((a, b) => a.r - b.r).map((x) => x.id);
    guardar(registrarSorteoDesempate(torneo, cat.categoria.id, tabla.grupo.id, orden));
    toast(`Sorteo: ${orden.map((id) => nombreDupla(torneo, dupla(torneo, id))).join(" > ")}`);
  }

  return (
    <div className="glass overflow-hidden rounded-3xl">
      <div className="flex items-center justify-between px-4 pt-4">
        <p className="font-display text-lg font-bold">Grupo {tabla.grupo.nombre}</p>
        <span className="text-xs text-white/45">
          {tabla.completo ? "Cerrado" : `${tabla.jugados}/${tabla.total} jugados`}
        </span>
      </div>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-white/40">
            <th className="w-8 py-1.5 pl-4 text-left">#</th>
            <th className="text-left">Dupla</th>
            <th className="w-8 text-center">PJ</th>
            <th className="w-8 text-center">PG</th>
            <th className="w-10 text-center">Sets</th>
            <th className="w-12 pr-4 text-center">Games</th>
          </tr>
        </thead>
        <tbody>
          {tabla.filas.map((f) => {
            const clasifica = tabla.completo && f.posicion <= pasan && !f.retirada;
            return (
              <motion.tr layout key={f.duplaId} className={clsx("border-t border-white/5", f.retirada && "opacity-40")}>
                <td className="py-2 pl-4">
                  <span className={clsx("flex size-6 items-center justify-center rounded-md font-display text-xs font-bold", clasifica ? "bg-lima text-marino-2" : f.posicion <= pasan ? "bg-lima/15 text-lima" : "text-white/40")}>
                    {f.posicion}
                  </span>
                </td>
                <td className="max-w-0 py-2">
                  <p className="truncate font-semibold">{nombreDupla(torneo, dupla(torneo, f.duplaId))}</p>
                  {f.motivo && <p className="truncate text-[11px] text-white/40">{f.motivo}</p>}
                </td>
                <td className="text-center tabular text-white/60">{f.pj}</td>
                <td className="text-center font-display font-bold tabular">{f.pg}</td>
                <td className="text-center tabular text-white/70">{signo(f.setsF - f.setsC)}</td>
                <td className="pr-4 text-center tabular text-white/70">{signo(f.gamesF - f.gamesC)}</td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
      {(tabla.notas.length > 0 || tabla.sorteoPendiente) && (
        <div className="px-4 pt-2">
          <button className="flex items-center gap-1.5 text-xs font-semibold text-neon" onClick={() => setPorque((x) => !x)}>
            <HelpCircle className="size-3.5" /> ¿Por qué este orden?
          </button>
          {porque && (
            <ul className="mt-2 space-y-1.5 rounded-xl bg-white/5 p-3 text-xs leading-relaxed text-white/75">
              {tabla.notas.map((n, i) => (
                <li key={i}>{n.texto}</li>
              ))}
            </ul>
          )}
          {tabla.sorteoPendiente && esStaff && (
            <button className="btn-neon mt-2 w-full !py-2 text-xs" onClick={sortearEmpate}>
              <Dices className="size-4" /> Sortear el desempate
            </button>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
        {partidos.map((p) => (
          <MatchCard key={p.id} torneo={torneo} p={p} onClick={() => onPartido(p.id)} compacto />
        ))}
      </div>
    </div>
  );
}

function Llave({ torneo, partidos, titulo, onPartido }: { torneo: Torneo; partidos: PartidoTorneo[]; titulo: string; onPartido: (id: string) => void }) {
  const rondas = [...new Set(partidos.filter((p) => !p.tercerPuesto).map((p) => p.ronda))].sort((a, b) => a - b);
  const tercero = partidos.find((p) => p.tercerPuesto);
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
        <Crown className="size-5 text-lima" /> {titulo}
      </h2>
      <div className="-mx-4 overflow-x-auto px-4 pb-4">
        <div className="flex min-w-max gap-6">
          {rondas.map((r, ri) => {
            const lista = partidos.filter((p) => p.ronda === r && !p.tercerPuesto).sort((a, b) => (a.posicion ?? 0) - (b.posicion ?? 0));
            return (
              <div key={r} className="flex w-60 flex-col">
                <p className="label text-center">{lista[0]?.etiqueta.replace(/ \d+$/, "").replace(" · Consolación", "")}</p>
                <div className="flex flex-1 flex-col justify-around gap-3">
                  {lista.map((p) => (
                    <div key={p.id} className="relative">
                      {ri < rondas.length - 1 && <span className="pointer-events-none absolute -right-6 top-1/2 h-px w-6 bg-white/15" />}
                      {p.bye ? (
                        <div className="rounded-2xl border border-dashed border-white/10 px-3 py-2 text-xs text-white/40">
                          Pase directo · <span className="font-semibold text-white/70">{p.duplaA || p.duplaB ? nombreDupla(torneo, dupla(torneo, p.duplaA ?? p.duplaB)) : textoOrigen(torneo, p, p.origenA?.tipo === "BYE" ? "B" : "A")}</span>
                        </div>
                      ) : (
                        <MatchCard torneo={torneo} p={p} onClick={() => onPartido(p.id)} compacto />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {tercero && (
        <div className="mt-2 max-w-xs">
          <MatchCard torneo={torneo} p={tercero} onClick={() => onPartido(tercero.id)} compacto />
        </div>
      )}
    </section>
  );
}
