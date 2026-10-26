"use client";

import clsx from "clsx";
import { useState } from "react";
import { BadgeCheck, CircleAlert, ShieldAlert, ShieldCheck } from "lucide-react";
import { Hoja } from "@/components/ui/Hoja";
import { Switch } from "@/components/ui/Switch";
import { toast } from "@/components/ui/Toaster";
import { claveCedula, etiquetaNivel, formatoCedula, puedeJugar, verificarDupla } from "@/lib/ranking/fvp";
import { useRankingFvp } from "@/lib/rankingFvpCliente";
import { useAmericanos } from "@/lib/store";
import { nombreCategoria } from "@/lib/torneo/categorias";
import { guardarJugadores, editarDupla, nombreJugador, tocar } from "@/lib/torneo/torneo";
import { useTorneos } from "@/lib/torneosStore";
import type { AtletaFvp } from "@/types/ranking";
import type { CategoriaEnTorneo, Dupla, JugadorTorneo, NivelTorneo, Torneo, VerificacionFvp } from "@/types/torneo";

const ESTILO: Record<VerificacionFvp["estado"], { texto: string; clase: string; Icono: typeof BadgeCheck }> = {
  VERIFICADA: { texto: "FVP verificada", clase: "text-neon", Icono: BadgeCheck },
  POR_VERIFICAR: { texto: "FVP por verificar", clase: "text-amber-300", Icono: CircleAlert },
  BLOQUEADA: { texto: "Categoría FVP más alta", clase: "text-coral", Icono: ShieldAlert },
  EXCEPCION: { texto: "Excepción del staff", clase: "text-cielo", Icono: ShieldCheck },
};

/** Chip con el estado FVP de una dupla. */
export function EstadoFvpChip({ v, onClick }: { v?: VerificacionFvp | null; onClick?: () => void }) {
  if (!v) return null;
  const e = ESTILO[v.estado];
  const contenido = (
    <>
      <e.Icono className="size-3" /> {e.texto}
      {v.estado === "EXCEPCION" && v.por ? ` · ${v.por}` : ""}
      {v.estado !== "VERIFICADA" && v.nota ? <span className="truncate font-normal text-white/50"> · {v.nota}</span> : null}
    </>
  );
  return onClick ? (
    <button onClick={onClick} title={v.nota} className={clsx("chip max-w-full !py-0.5 text-left text-[11px] underline-offset-2 hover:underline", e.clase)}>
      {contenido}
    </button>
  ) : (
    <span title={v.nota} className={clsx("chip max-w-full !py-0.5 text-[11px]", e.clase)}>
      {contenido}
    </span>
  );
}

/** Línea bajo la cédula de un jugador: lo que dice el ranking. */
export function AtletaFvpLinea({ cedula, atleta, listo, nivel }: { cedula: string; atleta: AtletaFvp | null; listo: boolean; nivel?: NivelTorneo }) {
  if (!claveCedula(cedula)) return cedula.trim() ? <p className="mt-1 text-xs text-white/40">Cédula incompleta.</p> : null;
  if (!listo) return <p className="mt-1 text-xs text-white/40">Buscando en el ranking FVP…</p>;
  if (!atleta) return <p className="mt-1 text-xs text-amber-300">{formatoCedula(cedula)} no aparece en la lista FVP.</p>;
  if (!atleta.categoria)
    return (
      <p className="mt-1 text-xs text-amber-300">
        FVP {atleta.especiales?.join(", ")} (sin categoría de nivel) · {atleta.nombre}
      </p>
    );
  const ok = !nivel || puedeJugar(nivel, atleta.categoria);
  return (
    <p className={clsx("mt-1 text-xs", ok ? "text-neon" : "text-coral")}>
      FVP {etiquetaNivel(atleta.categoria)}
      {atleta.especiales?.length ? ` · ${atleta.especiales.join(", ")}` : ""} · {atleta.nombre}
      {atleta.estado ? ` · ${atleta.estado}` : ""}
    </p>
  );
}

/** Interruptor + motivo para autorizar una dupla bloqueada o sin verificar. */
export function ExcepcionFvp({ activa, motivo, onActiva, onMotivo }: { activa: boolean; motivo: string; onActiva: (v: boolean) => void; onMotivo: (m: string) => void }) {
  return (
    <div className="glass rounded-2xl p-3">
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>Autorizar excepción del staff</span>
        <Switch activo={activa} onChange={onActiva} etiqueta="Autorizar excepción" />
      </label>
      {activa && (
        <input className="input mt-2 !py-2 text-sm" placeholder="Motivo (queda registrado con tu nombre)" value={motivo} onChange={(e) => onMotivo(e.target.value)} maxLength={160} />
      )}
    </div>
  );
}

/** Revisar una dupla ya inscrita: completar cédulas, verificar o autorizar. */
export function RevisarFvpHoja({ torneo, cat, dupla, onClose }: { torneo: Torneo; cat: CategoriaEnTorneo; dupla: Dupla | null; onClose: () => void }) {
  return (
    <Hoja abierta={!!dupla} onClose={onClose} titulo="Ranking FVP" sub={nombreCategoria(cat.categoria)}>
      {dupla && <Revisar key={dupla.id} torneo={torneo} cat={cat} dupla={dupla} onClose={onClose} />}
    </Hoja>
  );
}

function Revisar({ torneo, cat, dupla, onClose }: { torneo: Torneo; cat: CategoriaEnTorneo; dupla: Dupla; onClose: () => void }) {
  const guardar = useTorneos((s) => s.guardar);
  const staff = useAmericanos((s) => s.staff);
  const jugadores = dupla.jugadorIds.map((id) => torneo.jugadores.find((j) => j.id === id)) as [JugadorTorneo | undefined, JugadorTorneo | undefined];
  const [cedulas, setCedulas] = useState(jugadores.map((j) => j?.cedula ?? ""));
  const [excepcion, setExcepcion] = useState(dupla.fvp?.estado === "EXCEPCION");
  const [motivo, setMotivo] = useState(dupla.fvp?.estado === "EXCEPCION" ? (dupla.fvp.nota ?? "") : "");
  const fvp = useRankingFvp(cedulas);
  if (!jugadores[0] || !jugadores[1]) return <p className="text-sm text-white/50">Dupla incompleta.</p>;
  const nuevos = jugadores.map((j, i) => ({ ...j!, cedula: cedulas[i].trim() ? formatoCedula(cedulas[i]) : null })) as [JugadorTorneo, JugadorTorneo];
  const v = verificarDupla(cat.categoria, nuevos, fvp.buscar, { lista: fvp.resumen?.cargadoEn });

  function aplicar() {
    if (!v) return;
    if (excepcion && !motivo.trim()) return toast("Escribe el motivo de la excepción.", "error");
    const final: VerificacionFvp = excepcion ? { ...v, estado: "EXCEPCION", nota: motivo.trim(), por: staff?.nombre } : v;
    let t = guardarJugadores(torneo, nuevos);
    t = editarDupla(t, cat.categoria.id, dupla.id, { fvp: final });
    const texto = excepcion ? `Excepción FVP para ${nuevos.map(nombreJugador).join(" / ")} (${nombreCategoria(cat.categoria)}): ${motivo.trim()}` : undefined;
    guardar(texto ? tocar(t, texto, staff?.nombre) : t);
    toast(excepcion ? "Excepción registrada." : v.estado === "VERIFICADA" ? "Dupla verificada." : "Cédulas guardadas.");
    onClose();
  }

  return (
    <div className="space-y-3">
      {nuevos.map((j, i) => (
        <div key={j.id} className="glass rounded-2xl p-3">
          <p className="mb-2 text-sm font-semibold">{nombreJugador(j)}</p>
          <input className="input !py-2.5" placeholder="Cédula (V-12345678)" inputMode="text" value={cedulas[i]} onChange={(e) => setCedulas((c) => c.map((x, k) => (k === i ? e.target.value : x)))} />
          <AtletaFvpLinea cedula={cedulas[i]} atleta={fvp.buscar?.(cedulas[i]) ?? null} listo={fvp.listo} nivel={cat.categoria.nivel} />
        </div>
      ))}
      {v?.nota && v.estado !== "VERIFICADA" && <p className={clsx("text-sm", v.estado === "BLOQUEADA" ? "text-coral" : "text-amber-300")}>{v.nota}</p>}
      {fvp.resumen && !fvp.resumen.cargado && <p className="text-xs text-white/45">Aún no hay lista FVP cargada. Cárgala en Torneos → Ranking FVP.</p>}
      {v?.estado !== "VERIFICADA" && <ExcepcionFvp activa={excepcion} motivo={motivo} onActiva={setExcepcion} onMotivo={setMotivo} />}
      <button className="btn-neon w-full" onClick={aplicar} disabled={!fvp.listo}>
        {excepcion ? "Autorizar" : v?.estado === "VERIFICADA" ? "Marcar verificada" : "Guardar cédulas"}
      </button>
    </div>
  );
}
