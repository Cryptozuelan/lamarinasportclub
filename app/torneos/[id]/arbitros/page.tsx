"use client";

import clsx from "clsx";
import Link from "next/link";
import { use, useMemo, useState } from "react";
import { Flag, Settings, Shuffle, UserCheck } from "lucide-react";
import { StaffGate } from "@/components/StaffGate";
import { TorneoShell } from "@/components/torneo/TorneoShell";
import { toast } from "@/components/ui/Toaster";
import { vibrar } from "@/lib/feedback";
import { PlantelLista, usePlantel, type ArbitroStaff } from "@/components/ArbitrosClub";
import { franjasDia, partidosDeTurno, repartirTurnos } from "@/lib/torneo/arbitros";
import { nombrePista } from "@/lib/torneo/imprevistos";
import { useTorneos } from "@/lib/torneosStore";
import type { ArbitroRegistrado, Torneo, TurnoArbitro } from "@/types/torneo";

const pl = (n: number, s: string) => `${n} ${s}${n === 1 ? "" : "s"}`;

/** Árbitros del torneo (solo staff): quiénes se registraron, qué anotó cada uno y sus turnos. */
export default function ArbitrosTorneoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <StaffGate>
      <TorneoShell id={id} ancho="max-w-4xl">
        {(t) => <Arbitros torneo={t} />}
      </TorneoShell>
    </StaffGate>
  );
}

function Arbitros({ torneo }: { torneo: Torneo }) {
  const actualizar = useTorneos((s) => s.actualizar);
  const { lista, cargar } = usePlantel(torneo.id);
  const turnos = torneo.arbitros?.turnos ?? [];
  const activos = (lista ?? []).filter((a) => a.activo);
  const nombre = (id: string) => {
    const a = lista?.find((x) => x.id === id);
    return a ? `${a.nombre} ${a.apellido}` : "Árbitro";
  };
  const guardarTurnos = (ts: TurnoArbitro[], msg?: string) => {
    actualizar(torneo.id, (t) => ({ ...t, arbitros: { ...(t.arbitros ?? {}), turnos: ts } }));
    vibrar(10);
    if (msg) toast(msg);
  };

  return (
    <div className="space-y-8 pt-2">
      <section className="glass flex flex-wrap items-center gap-3 rounded-[2rem] p-5">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-lima text-marino-2">
          <Flag className="size-6" />
        </span>
        <div className="min-w-0 flex-1 basis-[14rem]">
          <p className="font-display text-xl font-bold">Árbitros del torneo</p>
          <p className="text-sm text-white/55">Los árbitros son del club: se registran una vez y sirven para todos los torneos. Aquí repartes sus turnos y ves lo que anotó cada uno en este torneo.</p>
        </div>
        <Link href="/club#arbitros" className="btn-ghost w-full !py-2.5 sm:w-auto">
          <Settings className="size-4" /> PIN y plantel en Ajustes
        </Link>
      </section>

      <section>
        <h2 className="label">Plantel del club {lista ? `· ${lista.length}` : ""}</h2>
        <PlantelLista
          lista={lista}
          onCambio={cargar}
          turnos={turnos}
          onBorrado={(id) => guardarTurnos(turnos.filter((x) => x.arbitroId !== id))}
          vacio="Todavía no hay árbitros registrados. Crea el PIN en Ajustes → Árbitros del club y envíaselo."
        />
      </section>

      <Turnos torneo={torneo} turnos={turnos} activos={activos} nombre={nombre} guardar={guardarTurnos} />
    </div>
  );
}

function Turnos({
  torneo,
  turnos,
  activos,
  nombre,
  guardar,
}: {
  torneo: Torneo;
  turnos: TurnoArbitro[];
  activos: ArbitroStaff[];
  nombre: (id: string) => string;
  guardar: (ts: TurnoArbitro[], msg?: string) => void;
}) {
  const pistas = torneo.canchas.filter((c) => c.activa).map((c) => c.numero);
  const resumen = useMemo(() => {
    const m = new Map<string, { turnos: number; partidos: number }>();
    for (const x of turnos) {
      const r = m.get(x.arbitroId) ?? { turnos: 0, partidos: 0 };
      r.turnos++;
      r.partidos += partidosDeTurno(torneo, x).length;
      m.set(x.arbitroId, r);
    }
    return m;
  }, [torneo, turnos]);

  const poner = (fecha: string, f: { desde: string; hasta: string }, pista: number, arbitroId: string) => {
    const id = `tu-${fecha}-${f.desde.replace(":", "")}-p${pista}`;
    const sin = turnos.filter((x) => x.id !== id);
    // Un árbitro no puede estar en dos pistas a la vez.
    const choca = arbitroId && sin.find((x) => x.arbitroId === arbitroId && x.fecha === fecha && x.desde === f.desde);
    if (choca && !confirm(`${nombre(arbitroId)} ya está en ${nombrePista(torneo, choca.pista)} en esa franja. ¿Lo cambias a esta pista?`)) return;
    const final = sin.filter((x) => !(choca && x.id === choca.id));
    guardar(arbitroId ? [...final, { id, arbitroId, fecha, pista, desde: f.desde, hasta: f.hasta }] : final);
  };

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="label !mb-0">Turnos</h2>
          <p className="text-sm text-white/55">Cada árbitro ve en su tablet la pista y los partidos que le tocan.</p>
        </div>
        <button
          className="btn-neon"
          disabled={!activos.length}
          onClick={() => {
            if (turnos.length && !confirm("¿Repartir de nuevo? Se reemplazan los turnos actuales.")) return;
            guardar(
              repartirTurnos(
                torneo,
                activos.map((a) => a.id),
                Date.now() % 7,
              ),
              "Turnos repartidos de forma pareja",
            );
          }}
        >
          <Shuffle className="size-4" /> Repartir automáticamente
        </button>
      </div>

      {activos.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {activos.map((a) => {
            const r = resumen.get(a.id);
            return (
              <span key={a.id} className="chip">
                <UserCheck className="size-3.5 text-lima" /> {a.nombre} · {pl(r?.turnos ?? 0, "turno")} · {pl(r?.partidos ?? 0, "partido")}
              </span>
            );
          })}
        </div>
      )}

      <div className="space-y-4">
        {torneo.dias.map((d) => (
          <div key={d.fecha} className="glass overflow-x-auto rounded-[1.5rem] p-4">
            <p className="mb-3 font-display text-lg font-bold capitalize">{new Date(`${d.fecha}T12:00:00`).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" })}</p>
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-xs text-white/45">
                  <th className="pb-2 text-left font-semibold">Franja</th>
                  {pistas.map((n) => (
                    <th key={n} className="pb-2 pl-2 text-left font-semibold">
                      {nombrePista(torneo, n)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {franjasDia(d).map((f) => (
                  <tr key={f.desde} className="align-top">
                    <td className="py-1.5 pr-2 font-display font-bold tabular text-white/70">
                      {f.desde}–{f.hasta}
                    </td>
                    {pistas.map((n) => {
                      const x = turnos.find((t) => t.fecha === d.fecha && t.desde === f.desde && t.pista === n);
                      const cuantos = partidosDeTurno(torneo, { fecha: d.fecha, pista: n, ...f }).length;
                      return (
                        <td key={n} className="py-1.5 pl-2">
                          <select
                            className={clsx("input !py-2 !pl-3 text-sm", x ? "!border-lima/40 text-white" : "text-white/40")}
                            value={x?.arbitroId ?? ""}
                            onChange={(e) => poner(d.fecha, f, n, e.target.value)}
                          >
                            <option value="">Sin árbitro</option>
                            {activos.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.nombre} {a.apellido}
                              </option>
                            ))}
                            {x && !activos.some((a) => a.id === x.arbitroId) && <option value={x.arbitroId}>{nombre(x.arbitroId)}</option>}
                          </select>
                          <p className="mt-1 text-[11px] text-white/40">{pl(cuantos, "partido")}</p>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
}
