"use client";

import clsx from "clsx";
import { use, useMemo, useState } from "react";
import { CalendarClock, Clock, CloudRain, RefreshCw, Search, TriangleAlert, Wand2 } from "lucide-react";
import { ImprevistosHoja } from "@/components/torneo/ImprevistosHoja";
import { toast } from "@/components/ui/Toaster";
import { MatchCard, ResultadoHoja } from "@/components/torneo/piezas";
import { nombrePista } from "@/lib/torneo/imprevistos";
import { fechaCorta, TorneoShell } from "@/components/torneo/TorneoShell";
import { nombreCorto } from "@/lib/torneo/categorias";
import { atrasoMinutos, programarTorneo } from "@/lib/torneo/programacion";
import { categoria, dupla, nombreJugador } from "@/lib/torneo/torneo";
import { useEsStaff } from "@/lib/store";
import { useTorneos } from "@/lib/torneosStore";
import type { PartidoTorneo, Torneo } from "@/types/torneo";

export default function ProgramacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TorneoShell id={id} ancho="max-w-7xl">{(t) => <Programacion torneo={t} />}</TorneoShell>;
}

function Programacion({ torneo }: { torneo: Torneo }) {
  const esStaff = useEsStaff();
  const guardar = useTorneos((s) => s.guardar);
  const hoy = new Date().toISOString().slice(0, 10);
  const [dia, setDia] = useState(torneo.dias.find((d) => d.fecha >= hoy)?.fecha ?? torneo.dias[0]?.fecha ?? "");
  const [buscar, setBuscar] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [imprevistos, setImprevistos] = useState(false);

  const partidos = useMemo(
    () => torneo.categorias.filter((c) => c.cuadro?.publicado).flatMap((c) => c.cuadro!.partidos).filter((p) => !p.bye),
    [torneo],
  );
  const sinHorario = partidos.filter((p) => !p.programacion && p.estado !== "FINALIZADO");
  const q = buscar.trim().toLowerCase();
  const coincide = (p: PartidoTorneo) => {
    if (!q) return true;
    const ids = [p.duplaA, p.duplaB].flatMap((d) => dupla(torneo, d)?.jugadorIds ?? []);
    return ids.some((id) => nombreJugador(torneo.jugadores.find((j) => j.id === id)).toLowerCase().includes(q));
  };
  const delDia = partidos.filter((p) => p.programacion?.fecha === dia && coincide(p));
  const horas = [...new Set(delDia.map((p) => p.programacion!.hora))].sort();
  const pistas = torneo.canchas.filter((c) => c.activa);
  const atraso = atrasoMinutos(torneo);

  function programar(desdeAhora: boolean) {
    // Con el torneo ya en marcha nunca se programa hacia atrás: se acomoda desde ahora.
    const empezado = partidos.some((p) => p.inicioEn);
    const res = programarTorneo(torneo, desdeAhora || empezado ? { desde: new Date().toISOString() } : {});
    guardar(res.torneo);
    if (res.sinLugar.length) toast(`${res.sinLugar.length} partido(s) no entran: faltan ~${res.horasFaltantes} h de pista.`, "error");
    else toast(`${res.programados} partidos programados.`);
  }

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="-mx-4 flex flex-1 gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {torneo.dias.map((d) => {
            const n = partidos.filter((p) => p.programacion?.fecha === d.fecha).length;
            return (
              <button
                key={d.fecha}
                onClick={() => setDia(d.fecha)}
                className={clsx("shrink-0 rounded-xl border px-3 py-2 text-left text-sm transition", d.fecha === dia ? "seleccion sobre-marca" : "border-white/10")}
              >
                <span className={clsx("block font-semibold capitalize", d.fecha === dia && "text-lima")}>{fechaCorta(d.fecha)}</span>
                <span className="block text-[11px] text-white/50">
                  {d.inicio}–{d.fin} · {n} partidos
                </span>
              </button>
            );
          })}
        </div>
        {esStaff && (
          <div className="flex gap-2">
            <button className="btn-ghost !py-2" onClick={() => programar(false)} title="Vuelve a armar los horarios de lo que no está fijo">
              <Wand2 className="size-4" /> Programar
            </button>
            <button className="btn-ghost !py-2" onClick={() => programar(true)} title="Reacomoda lo que falta desde ahora">
              <RefreshCw className="size-4" /> Desde ahora
            </button>
            <button className="btn-ghost !py-2 !text-amber-200" onClick={() => setImprevistos(true)} title="Lluvia, pistas, sedes y días">
              <CloudRain className="size-4" /> Imprevistos
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="glass flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3">
          <Search className="size-4 text-white/40" />
          <input className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-white/35" placeholder="¿Cuándo juego? Busca tu nombre" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        </label>
        {atraso >= 10 && (
          <span className="chip border-coral/30 bg-coral/10 text-coral">
            <Clock className="size-3" /> Atraso de {atraso} min
          </span>
        )}
      </div>

      {sinHorario.length > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-2xl bg-coral/10 p-3 text-sm text-coral">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {sinHorario.length} partido(s) sin horario: no entran en los días y pistas del torneo. Agrega horario o un día, o reprograma.
        </p>
      )}

      {horas.length === 0 ? (
        <div className="glass mt-6 flex flex-col items-center gap-2 rounded-3xl p-10 text-center text-white/55">
          <CalendarClock className="size-8 text-neon" />
          {q ? "No hay partidos con ese nombre este día." : "No hay partidos programados este día."}
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {/* Celular: lista por hora. Computadora: grilla hora × pista. */}
          <div className="hidden lg:block">
            <div className="grid gap-3" style={{ gridTemplateColumns: `4.5rem repeat(${pistas.length}, minmax(0, 1fr))` }}>
              <span />
              {pistas.map((c) => (
                <p key={c.numero} className="label text-center">{nombrePista(torneo, c.numero)}</p>
              ))}
              {horas.map((h) => (
                <Fila key={h} hora={h} pistas={pistas.map((c) => c.numero)} partidos={delDia.filter((p) => p.programacion!.hora === h)} torneo={torneo} onPartido={setAbierto} />
              ))}
            </div>
          </div>
          <div className="space-y-4 lg:hidden">
            {horas.map((h) => (
              <div key={h}>
                <p className="mb-2 font-display text-lg font-bold text-lima">{h}</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {delDia
                    .filter((p) => p.programacion!.hora === h)
                    .sort((a, b) => a.programacion!.pista - b.programacion!.pista)
                    .map((p) => (
                      <div key={p.id}>
                        <p className="mb-1 text-[11px] font-semibold text-white/45">
                          {nombrePista(torneo, p.programacion!.pista)} · {nombreCorto(categoria(torneo, p.categoriaId)!.categoria)}
                        </p>
                        <MatchCard torneo={torneo} p={p} onClick={() => setAbierto(p.id)} compacto sinHora />
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <ResultadoHoja torneo={torneo} partidoId={abierto} onClose={() => setAbierto(null)} />
      {esStaff && <ImprevistosHoja torneo={torneo} abierta={imprevistos} onClose={() => setImprevistos(false)} />}
    </>
  );
}

function Fila({ hora, pistas, partidos, torneo, onPartido }: { hora: string; pistas: number[]; partidos: PartidoTorneo[]; torneo: Torneo; onPartido: (id: string) => void }) {
  return (
    <>
      <p className="pt-3 font-display text-lg font-bold text-lima">{hora}</p>
      {pistas.map((n) => {
        const p = partidos.find((x) => x.programacion!.pista === n);
        return p ? (
          <div key={n}>
            <p className="mb-1 truncate text-[11px] font-semibold text-white/45">{nombreCorto(categoria(torneo, p.categoriaId)!.categoria)}</p>
            <MatchCard torneo={torneo} p={p} onClick={() => onPartido(p.id)} compacto />
          </div>
        ) : (
          <div key={n} className="rounded-2xl border border-dashed border-white/5" />
        );
      })}
    </>
  );
}
