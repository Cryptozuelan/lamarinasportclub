"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, CalendarPlus, History, ImagePlus, Megaphone, Save, Star, Trash2 } from "lucide-react";
import { StaffGate } from "@/components/StaffGate";
import { fechaCorta, TorneoShell } from "@/components/torneo/TorneoShell";
import { Stepper } from "@/components/ui/Stepper";
import { toast } from "@/components/ui/Toaster";
import { vibrar } from "@/lib/feedback";
import { aMinutos } from "@/lib/horarios";
import { nombrePista } from "@/lib/torneo/imprevistos";
import { fechaHoraLocal, programarTorneo } from "@/lib/torneo/programacion";
import { NOMBRE_CRITERIO } from "@/lib/torneo/tabla";
import { configurarTorneo, eliminarTorneo, nuevoId, todosLosPartidos } from "@/lib/torneo/torneo";
import { useTorneos } from "@/lib/torneosStore";
import type { CriterioDesempate, DiaTorneo, Patrocinador, Torneo } from "@/types/torneo";

/** Ajustes del torneo (solo staff): datos, días, pistas, desempates, patrocinadores e historial. */
export default function AjustesTorneoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <StaffGate>
      <TorneoShell id={id} ancho="max-w-3xl">
        {(t) => <Ajustes key={t.id} torneo={t} />}
      </TorneoShell>
    </StaffGate>
  );
}

function Interruptor({ valor, onChange, etiqueta }: { valor: boolean; onChange: (v: boolean) => void; etiqueta: string }) {
  return (
    <button
      role="switch"
      aria-checked={valor}
      aria-label={etiqueta}
      onClick={() => {
        vibrar(8);
        onChange(!valor);
      }}
      className={clsx("relative h-7 w-12 shrink-0 rounded-full transition", valor ? "bg-neon" : "bg-white/15")}
    >
      <motion.span layout className={clsx("absolute top-1 size-5 rounded-full bg-blanco shadow", valor ? "right-1" : "left-1")} />
    </button>
  );
}

function Ajustes({ torneo }: { torneo: Torneo }) {
  const guardar = useTorneos((s) => s.guardar);
  const router = useRouter();
  const [b, setB] = useState(() => ({
    nombre: torneo.nombre,
    dias: torneo.dias.map((d) => ({ ...d })),
    descansoMin: torneo.descansoMin,
    toleranciaWO: torneo.toleranciaWO,
    finalesUltimoDia: torneo.finalesUltimoDia,
    canchas: torneo.canchas.map((c) => ({ ...c })),
    criterios: torneo.criterios.map((c) => ({ ...c })),
    patrocinadores: (torneo.patrocinadores ?? []).map((p) => ({ ...p })),
    validarFvp: torneo.validarFvp !== false,
  }));
  const archivo = useRef<HTMLInputElement>(null);
  const [nuevoSponsor, setNuevoSponsor] = useState("");

  const conJuego = new Set(todosLosPartidos(torneo).filter((p) => p.programacion && p.estado !== "PENDIENTE").map((p) => p.programacion!.fecha));
  const horarioInvalido = b.dias.some((d) => aMinutos(d.fin) <= aMinutos(d.inicio));
  const criteriosCambiaron = JSON.stringify(b.criterios) !== JSON.stringify(torneo.criterios);
  const agendaCambio =
    JSON.stringify(b.dias) !== JSON.stringify(torneo.dias) ||
    JSON.stringify(b.canchas.map((c) => c.activa)) !== JSON.stringify(torneo.canchas.map((c) => c.activa)) ||
    b.descansoMin !== torneo.descansoMin ||
    b.finalesUltimoDia !== torneo.finalesUltimoDia;

  const guardarTodo = () => {
    let t = configurarTorneo(torneo, { ...b, nombre: b.nombre.trim() || torneo.nombre, dias: [...b.dias].sort((x, y) => x.fecha.localeCompare(y.fecha)) });
    let extra = "";
    if (agendaCambio) {
      const empezado = todosLosPartidos(t).some((p) => p.inicioEn);
      const r = programarTorneo(t, empezado ? { desde: new Date().toISOString() } : {});
      t = r.torneo;
      extra = r.sinLugar.length ? ` · ${r.sinLugar.length} partidos no entran: suma un día o una sede` : " · horarios reacomodados";
    }
    guardar(t);
    vibrar(20);
    toast(`Ajustes guardados${extra}${criteriosCambiaron ? " · tablas recalculadas" : ""}`);
  };

  const setDia = (i: number, d: Partial<DiaTorneo>) => setB((x) => ({ ...x, dias: x.dias.map((y, k) => (k === i ? { ...y, ...d } : y)) }));
  const moverCriterio = (i: number, d: -1 | 1) =>
    setB((x) => {
      const c = [...x.criterios];
      const j = i + d;
      if (j < 0 || j >= c.length) return x;
      [c[i], c[j]] = [c[j], c[i]];
      return { ...x, criterios: c };
    });
  const setSponsor = (id: string, cambios: Partial<Patrocinador>) => setB((x) => ({ ...x, patrocinadores: x.patrocinadores.map((p) => (p.id === id ? { ...p, ...cambios } : p)) }));

  const subirLogo = async (f: File, id: string) => {
    const logo = await reducirImagen(f, 360);
    if (!logo) return toast("No se pudo leer la imagen", "error");
    if (logo.length > 150_000) return toast("El logo es muy pesado: usa uno más simple (PNG o SVG)", "error");
    setSponsor(id, { logo });
  };

  return (
    <div className="pb-40">
      <h2 className="mt-2 font-display text-2xl font-bold">Ajustes del torneo</h2>
      <p className="mt-1 text-sm text-white/50">Los cambios de días, pistas o descanso reacomodan los horarios solos al guardar.</p>

      <p className="label mt-8">Datos</p>
      <div className="glass space-y-4 rounded-2xl p-4">
        <input className="input" value={b.nombre} onChange={(e) => setB({ ...b, nombre: e.target.value })} aria-label="Nombre del torneo" />
        <div className="flex items-center justify-between gap-3 text-sm">
          <div>
            <p className="font-semibold">Descanso mínimo</p>
            <p className="text-xs text-white/50">Entre dos partidos de un mismo jugador</p>
          </div>
          <Stepper valor={b.descansoMin} onChange={(v) => setB({ ...b, descansoMin: v })} min={0} max={180} paso={15} sufijo="min" />
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <div>
            <p className="font-semibold">Tolerancia para W.O.</p>
            <p className="text-xs text-white/50">FIP: 10 min desde la hora prevista, nunca antes</p>
          </div>
          <Stepper valor={b.toleranciaWO} onChange={(v) => setB({ ...b, toleranciaWO: v })} min={5} max={30} paso={5} sufijo="min" />
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <div>
            <p className="font-semibold">Semis y finales el último día</p>
            <p className="text-xs text-white/50">En la pista principal de La Marina</p>
          </div>
          <Interruptor valor={b.finalesUltimoDia} onChange={(v) => setB({ ...b, finalesUltimoDia: v })} etiqueta="Finales el último día" />
        </div>
      </div>

      <p className="label mt-8">Días</p>
      <ul className="space-y-2">
        {b.dias.map((d, i) => (
          <li key={i} className="glass flex flex-wrap items-center gap-2 rounded-2xl p-3">
            <input type="date" className="input !w-auto !py-2 text-sm [color-scheme:dark]" value={d.fecha} onChange={(e) => e.target.value && setDia(i, { fecha: e.target.value })} disabled={conJuego.has(d.fecha)} />
            <span className="text-sm capitalize text-white/50">{fechaCorta(d.fecha)}</span>
            <div className="ml-auto flex items-center gap-2">
              <input type="time" step={1800} className="input !w-auto !px-3 !py-2 text-sm [color-scheme:dark]" value={d.inicio} onChange={(e) => setDia(i, { inicio: e.target.value })} />
              <span className="text-white/30">–</span>
              <input type="time" step={1800} className="input !w-auto !px-3 !py-2 text-sm [color-scheme:dark]" value={d.fin} onChange={(e) => setDia(i, { fin: e.target.value })} />
              {b.dias.length > 1 && !conJuego.has(d.fecha) && (
                <button className="rounded-lg p-2 text-white/40 hover:text-coral" onClick={() => setB({ ...b, dias: b.dias.filter((_, k) => k !== i) })} aria-label="Quitar día">
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <button
        className="btn-ghost mt-2 !py-2 text-xs"
        onClick={() => {
          const ultimo = [...b.dias].sort((x, y) => x.fecha.localeCompare(y.fecha)).at(-1)!;
          const f = new Date(`${ultimo.fecha}T12:00:00`);
          f.setDate(f.getDate() + 1);
          setB({ ...b, dias: [...b.dias, { ...ultimo, fecha: fechaHoraLocal(f.getTime()).fecha }] });
        }}
      >
        <CalendarPlus className="size-3.5" /> Agregar día
      </button>
      {horarioInvalido && <p className="mt-2 text-xs text-coral">Hay un día que cierra antes de abrir.</p>}

      <p className="label mt-8">Pistas</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {b.canchas.map((c) => (
          <li key={c.numero} className={clsx("glass flex items-center gap-3 rounded-2xl p-3 text-sm", !c.activa && "opacity-50")}>
            <span className="flex-1 truncate font-semibold">{nombrePista(torneo, c.numero)}</span>
            <span className="text-xs text-white/45">{c.techada ? "Techada" : "Exterior"}</span>
            <Interruptor valor={c.activa} onChange={(v) => setB({ ...b, canchas: b.canchas.map((x) => (x.numero === c.numero ? { ...x, activa: v } : x)) })} etiqueta={`${c.nombre} en uso`} />
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-white/45">Las sedes de apoyo y las suspensiones por lluvia se manejan en Horarios → Imprevistos.</p>

      <p className="label mt-8">Desempate en grupos (en este orden)</p>
      <ul className="space-y-1.5">
        {b.criterios.map((c, i) => (
          <li key={c.id} className={clsx("glass flex items-center gap-2 rounded-2xl p-2.5 text-sm", !c.activo && "opacity-50")}>
            <span className="w-6 text-center font-display font-bold text-neon">{i + 1}</span>
            <span className="flex-1">{NOMBRE_CRITERIO[c.id as CriterioDesempate["id"]]}</span>
            <button className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 disabled:opacity-20" onClick={() => moverCriterio(i, -1)} disabled={i === 0} aria-label="Subir">
              <ArrowUp className="size-4" />
            </button>
            <button className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 disabled:opacity-20" onClick={() => moverCriterio(i, 1)} disabled={i === b.criterios.length - 1} aria-label="Bajar">
              <ArrowDown className="size-4" />
            </button>
            <Interruptor valor={c.activo} onChange={(v) => setB({ ...b, criterios: b.criterios.map((x) => (x.id === c.id ? { ...x, activo: v } : x)) })} etiqueta={NOMBRE_CRITERIO[c.id as CriterioDesempate["id"]]} />
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-white/45">Primero cuentan los partidos ganados. Si sigue el empate después de todos los criterios, se sortea y queda registrado.</p>

      <p className="label mt-8">Ranking FVP</p>
      <div className="glass rounded-2xl p-4">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            Validar categorías con el ranking FVP
            <span className="mt-0.5 block text-xs text-white/45">Nadie se inscribe por debajo de su categoría FVP; los casos dudosos los revisa el staff.</span>
          </span>
          <Interruptor valor={b.validarFvp} onChange={(v) => setB((x) => ({ ...x, validarFvp: v }))} etiqueta="Validar con ranking FVP" />
        </label>
        <Link href="/torneos/ranking" className="mt-3 inline-block text-xs font-semibold text-neon hover:underline">
          Ver la lista FVP cargada →
        </Link>
      </div>

      <p className="label mt-8">Patrocinadores</p>
      <ul className="space-y-2">
        {b.patrocinadores.map((p) => (
          <li key={p.id} className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3">
            <button
              className="flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-blanco/90"
              onClick={() => {
                archivo.current!.dataset.id = p.id;
                archivo.current!.click();
              }}
              aria-label={`Logo de ${p.nombre}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.logo ? <img src={p.logo} alt="" className="max-h-10 max-w-[4.5rem] object-contain" /> : <ImagePlus className="size-5 text-marino-2/60" />}
            </button>
            <input className="input !w-auto min-w-0 flex-1 !py-2" value={p.nombre} onChange={(e) => setSponsor(p.id, { nombre: e.target.value })} aria-label="Nombre del patrocinador" />
            <select className="input !w-auto !py-2 text-sm" value={p.pista ?? ""} onChange={(e) => setSponsor(p.id, { pista: e.target.value ? Number(e.target.value) : null })} aria-label="Pista que presenta">
              <option value="">Sin pista</option>
              {torneo.canchas.map((c) => (
                <option key={c.numero} value={c.numero}>
                  Presenta {nombrePista(torneo, c.numero)}
                </option>
              ))}
            </select>
            <button className={clsx("rounded-lg p-2", p.principal ? "text-lima" : "text-white/30 hover:text-white")} onClick={() => setSponsor(p.id, { principal: !p.principal })} aria-label="Patrocinador principal" title="Principal">
              <Star className={clsx("size-4", p.principal && "fill-current")} />
            </button>
            <button className="rounded-lg p-2 text-white/40 hover:text-coral" onClick={() => setB({ ...b, patrocinadores: b.patrocinadores.filter((x) => x.id !== p.id) })} aria-label="Quitar patrocinador">
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!nuevoSponsor.trim()) return;
          setB({ ...b, patrocinadores: [...b.patrocinadores, { id: nuevoId("pat-"), nombre: nuevoSponsor.trim(), principal: b.patrocinadores.length === 0 }] });
          setNuevoSponsor("");
        }}
      >
        <input className="input !py-2" placeholder="Nombre de la marca" value={nuevoSponsor} onChange={(e) => setNuevoSponsor(e.target.value)} />
        <button className="btn-ghost !py-2">
          <Megaphone className="size-4" /> Agregar
        </button>
      </form>
      <p className="mt-2 text-xs text-white/45">Salen en el Modo TV, en las pantallas de pista (la pista que presentan) y en la app del torneo.</p>
      <input
        ref={archivo}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          const id = e.currentTarget.dataset.id;
          if (f && id) subirLogo(f, id);
          e.currentTarget.value = "";
        }}
      />

      <p className="label mt-8 flex items-center gap-1.5">
        <History className="size-3.5" /> Historial de cambios
      </p>
      <ul className="glass max-h-80 divide-y divide-white/5 overflow-y-auto rounded-2xl text-sm">
        {[...(torneo.historial ?? [])].reverse().slice(0, 150).map((h, i) => (
          <li key={i} className="flex gap-3 px-4 py-2.5">
            <span className="w-24 shrink-0 text-xs capitalize text-white/40">
              {new Date(h.en).toLocaleString("es", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className="flex-1 text-white/80">{h.texto}</span>
            {h.por && <span className="shrink-0 text-xs text-white/40">{h.por}</span>}
          </li>
        ))}
        {!torneo.historial?.length && <li className="px-4 py-3 text-white/40">Sin cambios registrados.</li>}
      </ul>

      <button
        className="btn-ghost mt-10 w-full !text-coral"
        onClick={() => {
          if (prompt(`Para eliminar el torneo escribe su nombre: ${torneo.nombre}`)?.trim() !== torneo.nombre) return;
          guardar(eliminarTorneo(torneo));
          toast("Torneo eliminado");
          router.push("/torneos");
        }}
      >
        <Trash2 className="size-4" /> Eliminar torneo
      </button>

      <div className="fixed inset-x-0 bottom-24 z-30 flex justify-center px-4">
        <button className="btn-neon w-full max-w-md shadow-2xl" disabled={horarioInvalido} onClick={guardarTodo}>
          <Save className="size-5" /> Guardar ajustes
        </button>
      </div>
    </div>
  );
}

/** Reduce una imagen a `max` px de lado y la devuelve como data URL (los logos viajan dentro del torneo). */
async function reducirImagen(f: File, max: number): Promise<string | null> {
  if (f.type === "image/svg+xml") {
    if (f.size > 150_000) return null;
    return await new Promise((ok) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result));
      r.onerror = () => ok(null);
      r.readAsDataURL(f);
    });
  }
  try {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    // WebP con transparencia: un logo queda en pocas decenas de KB.
    const webp = c.toDataURL("image/webp", 0.85);
    return webp.startsWith("data:image/webp") ? webp : c.toDataURL("image/png");
  } catch {
    return null;
  }
}
