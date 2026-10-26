"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import { Building2, CalendarPlus, CloudRain, MapPin, Play, Plus, Trash2, Warehouse } from "lucide-react";
import { Hoja } from "@/components/ui/Hoja";
import { Stepper } from "@/components/ui/Stepper";
import { toast } from "@/components/ui/Toaster";
import { vibrar } from "@/lib/feedback";
import { aMinutos } from "@/lib/horarios";
import {
  agregarSede,
  nombrePista,
  partidosSuspendidos,
  textoPistas,
  quitarSede,
  reanudarPistas,
  suspenderPistas,
  suspensionesActivas,
  type ResultadoImprevisto,
} from "@/lib/torneo/imprevistos";
import { calcularMarcador, setsFinales } from "@/lib/torneo/marcador";
import { textoSets } from "@/lib/torneo/tabla";
import { fechaHoraLocal, programarTorneo } from "@/lib/torneo/programacion";
import { configurarTorneo, dupla, nombreDupla, tocar } from "@/lib/torneo/torneo";
import { useTorneos } from "@/lib/torneosStore";
import type { DiaTorneo, Torneo } from "@/types/torneo";
import { fechaCorta } from "./TorneoShell";

const MOTIVOS = ["Lluvia", "Pista mojada", "Falla de luz", "Mantenimiento"];
const DURACIONES: { label: string; min: number | null }[] = [
  { label: "30 min", min: 30 },
  { label: "1 hora", min: 60 },
  { label: "2 horas", min: 120 },
  { label: "Hasta nuevo aviso", min: null },
];

/**
 * Imprevistos (solo staff): suspender pistas por lluvia y reanudarlas, sumar una sede de apoyo
 * o un día más. Cada acción reprograma sola y dice qué cambió.
 */
export function ImprevistosHoja({ torneo, abierta, onClose }: { torneo: Torneo; abierta: boolean; onClose: () => void }) {
  const guardar = useTorneos((s) => s.guardar);
  const marcadores = useTorneos((s) => s.marcadores);
  const activas = torneo.canchas.filter((c) => c.activa);
  const exteriores = activas.filter((c) => !c.techada).map((c) => c.numero);
  const [pistas, setPistas] = useState<number[]>(exteriores.length ? exteriores : activas.map((c) => c.numero));
  const [motivo, setMotivo] = useState("Lluvia");
  const [duracion, setDuracion] = useState<number | null>(60);
  const [resumen, setResumen] = useState<string | null>(null);
  const [sedeAbierta, setSedeAbierta] = useState(false);

  const suspensiones = suspensionesActivas(torneo);
  const suspendidos = partidosSuspendidos(torneo);
  const sinLugar = useMemo(() => programarTorneo(torneo, { desde: new Date().toISOString() }).sinLugar.length, [torneo]);

  const aplicar = (r: ResultadoImprevisto, titulo: string) => {
    guardar(r.torneo);
    vibrar([10, 30, 10]);
    const partes = [`${r.programacion.programados} partidos reacomodados`];
    if (r.suspendidos.length) partes.push(`${r.suspendidos.length} interrumpido${r.suspendidos.length > 1 ? "s" : ""}: siguen con su marcador al reanudar`);
    if (r.programacion.sinLugar.length) partes.push(`${r.programacion.sinLugar.length} no entran en los días del torneo: suma una sede o un día`);
    setResumen(`${titulo}. ${partes.join(" · ")}.`);
    toast(titulo);
  };

  const suspender = () => {
    if (!pistas.length) return toast("Elige al menos una pista", "error");
    const textos: Record<string, string> = {};
    for (const [id, m] of Object.entries(marcadores)) if (m.torneoId === torneo.id && !m.finalizado) textos[id] = textoSets(setsFinales(calcularMarcador(m)).filter((x) => x.a + x.b > 0));
    const ahora = Date.now();
    aplicar(
      suspenderPistas(torneo, { pistas, motivo, ahora, hastaMs: duracion === null ? null : ahora + duracion * 60_000, marcadores: textos, por: "Staff" }),
      `${motivo}: ${pistas.length > 1 ? `${textoPistas(torneo, pistas)} suspendidas` : `${nombrePista(torneo, pistas[0])} suspendida`}`,
    );
  };

  const agregarDia = () => {
    const ultimo = [...torneo.dias].sort((a, b) => a.fecha.localeCompare(b.fecha)).at(-1)!;
    const d = new Date(`${ultimo.fecha}T12:00:00`);
    d.setDate(d.getDate() + 1);
    const nuevo: DiaTorneo = { ...ultimo, fecha: fechaHoraLocal(d.getTime()).fecha };
    const t = tocar(configurarTorneo(torneo, { dias: [...torneo.dias, nuevo] }), `Se agrega un día: ${fechaCorta(nuevo.fecha)}.`, "Staff");
    const r = programarTorneo(t, { desde: new Date().toISOString() });
    aplicar({ torneo: r.torneo, suspendidos: [], programacion: r }, `Día agregado: ${fechaCorta(nuevo.fecha)}`);
  };

  const alternar = (n: number) => setPistas((xs) => (xs.includes(n) ? xs.filter((x) => x !== n) : [...xs, n].sort((a, b) => a - b)));

  return (
    <Hoja abierta={abierta} onClose={onClose} titulo="Imprevistos" sub="Lluvia, pistas, sedes y días. Todo se reprograma solo." ancho="max-w-lg">
      {resumen && <p className="mb-4 rounded-2xl border border-neon/30 bg-neon/10 p-3 text-sm text-white/85">{resumen}</p>}

      {suspensiones.length > 0 && (
        <section className="mb-5 space-y-2">
          <p className="label">Suspendido ahora</p>
          {suspensiones.map((s) => (
            <div key={s.id} className="glass flex items-center gap-3 rounded-2xl border-amber-300/30 p-3">
              <CloudRain className="size-5 shrink-0 text-amber-200" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {s.motivo} · {textoPistas(torneo, s.pistas)}
                </p>
                <p className="text-xs text-white/50">{s.hasta ? `Hasta las ${s.hasta.slice(11)}${s.hasta.slice(0, 10) !== fechaHoraLocal(Date.now()).fecha ? ` del ${fechaCorta(s.hasta.slice(0, 10))}` : ""}` : "Hasta nuevo aviso"}</p>
              </div>
              <button className="btn-neon !px-3 !py-2 text-xs" onClick={() => aplicar(reanudarPistas(torneo, s.id, { por: "Staff" }), "Pistas reanudadas")}>
                <Play className="size-3.5" /> Reanudar
              </button>
            </div>
          ))}
        </section>
      )}

      {suspendidos.length > 0 && (
        <section className="mb-5">
          <p className="label">Partidos interrumpidos</p>
          <ul className="space-y-1.5">
            {suspendidos.map((p) => (
              <li key={p.id} className="rounded-xl bg-white/5 px-3 py-2 text-sm">
                <span className="font-semibold">{nombreDupla(torneo, dupla(torneo, p.duplaA))}</span> <span className="text-white/40">vs</span>{" "}
                <span className="font-semibold">{nombreDupla(torneo, dupla(torneo, p.duplaB))}</span>
                <span className="block text-xs text-white/50">
                  {p.suspendido?.marcador ? `Iban ${p.suspendido.marcador} · ` : ""}
                  {p.programacion ? `Sigue ${fechaCorta(p.programacion.fecha)} ${p.programacion.hora} en ${nombrePista(torneo, p.programacion.pista)}` : "Sin horario todavía"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="label">Suspender pistas</p>
      <div className="flex flex-wrap gap-1.5">
        {activas.map((c) => (
          <button key={c.numero} onClick={() => alternar(c.numero)} className={clsx("chip !py-1.5", pistas.includes(c.numero) && "!border-amber-300/60 !bg-amber-300/15 !text-amber-100")}>
            {c.techada ? <Warehouse className="size-3" /> : <CloudRain className="size-3" />} {nombrePista(torneo, c.numero)}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-3 text-xs">
        {exteriores.length > 0 && (
          <button className="font-semibold text-neon" onClick={() => setPistas(exteriores)}>
            Solo exteriores
          </button>
        )}
        <button className="font-semibold text-neon" onClick={() => setPistas(activas.map((c) => c.numero))}>
          Todas
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {MOTIVOS.map((m) => (
          <button key={m} onClick={() => setMotivo(m)} className={clsx("chip !py-1.5", motivo === m && "seleccion")}>
            {m}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {DURACIONES.map((d) => (
          <button key={d.label} onClick={() => setDuracion(d.min)} className={clsx("chip !py-1.5", duracion === d.min && "seleccion")}>
            {d.label}
          </button>
        ))}
      </div>
      <button className="btn-neon mt-3 w-full" onClick={suspender}>
        <CloudRain className="size-4" /> Suspender y reprogramar
      </button>
      <p className="mt-2 text-xs text-white/45">Lo que se esté jugando en esas pistas se para con su marcador y sigue después, donde haya lugar. Nada se programa en una pista suspendida.</p>

      <p className="label mt-7">Sedes</p>
      <ul className="space-y-2">
        <li className="glass flex items-center gap-3 rounded-2xl p-3 text-sm">
          <Building2 className="size-4 text-neon" />
          <span className="flex-1 font-semibold">La Marina (principal)</span>
          <span className="text-xs text-white/45">{torneo.canchas.filter((c) => !c.sedeId && c.activa).length} pistas</span>
        </li>
        {(torneo.sedes ?? []).map((s) => {
          const n = torneo.canchas.filter((c) => c.sedeId === s.id && c.activa).length;
          return (
            <li key={s.id} className={clsx("glass flex items-center gap-3 rounded-2xl p-3 text-sm", !n && "opacity-50")}>
              <MapPin className="size-4 text-cielo" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {s.nombre} {s.provisional && <span className="chip ml-1 !py-0 !text-[10px]">Provisional</span>}
                </p>
                <p className="text-xs text-white/45">
                  {n ? `${n} pistas · ${s.trasladoMin} min de traslado` : "Ya no se usa"}
                  {s.horarios?.length ? ` · ${s.horarios.map((h) => `${fechaCorta(h.fecha)} ${h.inicio}–${h.fin}`).join(", ")}` : ""}
                </p>
              </div>
              {n > 0 && (
                <button
                  className="rounded-lg p-2 text-white/40 hover:text-coral"
                  aria-label={`Dejar de usar ${s.nombre}`}
                  onClick={() => {
                    if (!confirm(`¿Dejar de usar ${s.nombre}? Lo pendiente ahí se reprograma.`)) return;
                    const r = quitarSede(torneo, s.id, { por: "Staff" });
                    if ("error" in r) return toast(r.error, "error");
                    aplicar(r, `${s.nombre} ya no se usa`);
                  }}
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {sedeAbierta ? (
        <NuevaSede
          torneo={torneo}
          onCancel={() => setSedeAbierta(false)}
          onListo={(t, nombre) => {
            const r = programarTorneo(t, { desde: new Date().toISOString() });
            aplicar({ torneo: r.torneo, suspendidos: [], programacion: r }, `Sede agregada: ${nombre}`);
            setSedeAbierta(false);
          }}
        />
      ) : (
        <button className="btn-ghost mt-2 w-full !py-2 text-sm" onClick={() => setSedeAbierta(true)}>
          <Plus className="size-4" /> Sumar un club (sede de apoyo)
        </button>
      )}

      <p className="label mt-7">Días</p>
      <div className="glass flex items-center gap-3 rounded-2xl p-3 text-sm">
        <CalendarPlus className="size-4 text-neon" />
        <p className="flex-1 text-white/70">{sinLugar ? `${sinLugar} partido${sinLugar > 1 ? "s" : ""} no entra${sinLugar > 1 ? "n" : ""} en los días actuales.` : "Todo entra en los días del torneo."}</p>
        <button className={clsx("!px-3 !py-2 text-xs", sinLugar ? "btn-neon" : "btn-ghost")} onClick={agregarDia}>
          Agregar un día
        </button>
      </div>
    </Hoja>
  );
}

function NuevaSede({ torneo, onCancel, onListo }: { torneo: Torneo; onCancel: () => void; onListo: (t: Torneo, nombre: string) => void }) {
  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [pistas, setPistas] = useState(3);
  const [techadas, setTechadas] = useState(true);
  const [traslado, setTraslado] = useState(20);
  const [cuando, setCuando] = useState<"HOY" | "TODO">("HOY");
  const hoy = fechaHoraLocal(Date.now());
  const diaHoy = torneo.dias.find((d) => d.fecha === hoy.fecha);

  const crear = () => {
    if (!nombre.trim()) return toast("Escribe el nombre del club", "error");
    // "Desde ahora, hoy": la sede solo cuenta para lo que queda del día (lo típico con lluvia).
    const desde = Math.ceil((aMinutos(hoy.hora) + 1) / 15) * 15;
    const horarios =
      cuando === "HOY" && diaHoy
        ? [{ fecha: hoy.fecha, inicio: `${String(Math.floor(desde / 60)).padStart(2, "0")}:${String(desde % 60).padStart(2, "0")}`, fin: diaHoy.fin }]
        : undefined;
    onListo(agregarSede(torneo, { nombre, direccion, pistas, techadas, trasladoMin: traslado, horarios, provisional: cuando === "HOY" }, "Staff"), nombre.trim());
  };

  return (
    <div className="glass mt-2 space-y-3 rounded-2xl p-4">
      <input className="input" placeholder="Club (ej. Club Lechería)" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      <input className="input" placeholder="Dirección (opcional)" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
      <div className="flex items-center justify-between text-sm">
        <span>Pistas disponibles</span>
        <Stepper valor={pistas} onChange={setPistas} min={1} max={10} />
      </div>
      <div className="flex items-center justify-between text-sm">
        <span>Traslado desde La Marina</span>
        <Stepper valor={traslado} onChange={setTraslado} min={0} max={120} paso={5} sufijo="min" />
      </div>
      <div className="flex gap-1.5">
        <button className={clsx("chip flex-1 justify-center !py-2", techadas && "seleccion")} onClick={() => setTechadas(true)}>
          Techadas
        </button>
        <button className={clsx("chip flex-1 justify-center !py-2", !techadas && "seleccion")} onClick={() => setTechadas(false)}>
          Al aire libre
        </button>
      </div>
      <div className="flex gap-1.5">
        <button className={clsx("chip flex-1 justify-center !py-2", cuando === "HOY" && "seleccion")} onClick={() => setCuando("HOY")} disabled={!diaHoy}>
          Desde ahora, hoy
        </button>
        <button className={clsx("chip flex-1 justify-center !py-2", cuando === "TODO" && "seleccion")} onClick={() => setCuando("TODO")}>
          Todo el torneo
        </button>
      </div>
      <p className="text-xs text-white/45">El traslado se suma al descanso cuando un jugador cambia de club entre partidos. Las finales quedan en La Marina.</p>
      <div className="flex gap-2">
        <button className="btn-ghost flex-1" onClick={onCancel}>
          Cancelar
        </button>
        <button className="btn-neon flex-1" onClick={crear}>
          Agregar y reprogramar
        </button>
      </div>
    </div>
  );
}
