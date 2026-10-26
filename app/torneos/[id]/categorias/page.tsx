"use client";

import clsx from "clsx";
import { use, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Camera, ClipboardPaste, Crown, Dices, Plus, Settings2, Trash2, Undo2, UserPlus } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { TomarFoto } from "@/components/Foto";
import { subirFoto, useFotoDupla, useFotos, useFotosTorneo } from "@/lib/fotos";
import { StaffGate } from "@/components/StaffGate";
import { Hoja } from "@/components/ui/Hoja";
import { Segmented } from "@/components/ui/Segmented";
import { Stepper } from "@/components/ui/Stepper";
import { Switch } from "@/components/ui/Switch";
import { toast } from "@/components/ui/Toaster";
import { AtletaFvpLinea, EstadoFvpChip, ExcepcionFvp, RevisarFvpHoja } from "@/components/torneo/Fvp";
import { SorteoPopup } from "@/components/torneo/SorteoPopup";
import { TorneoShell } from "@/components/torneo/TorneoShell";
import { descripcionReglas, minutosEstimados, nombreCategoria, nombreCorto, tieBreakPorDefecto, validarDupla } from "@/lib/torneo/categorias";
import { claveCedula, formatoCedula, pendientesFvp, verificarDupla } from "@/lib/ranking/fvp";
import { useRankingFvp } from "@/lib/rankingFvpCliente";
import { useAmericanos } from "@/lib/store";
import { duplasActivas, ordenSiembra, proponerFormato, resumenFormato } from "@/lib/torneo/cuadro";
import {
  anioTorneo,
  configurarCategoria,
  deshacerSorteo,
  editarDupla,
  estadoCategoria,
  inscribirDupla,
  nombreDupla,
  nombreJugador,
  nuevoId,
  quitarDupla,
  tocar,
} from "@/lib/torneo/torneo";
import { useTorneos } from "@/lib/torneosStore";
import type { CategoriaEnTorneo, Dupla, FaseReglas, JugadorTorneo, ReglasPartido, Torneo, VerificacionFvp } from "@/types/torneo";

export default function CategoriasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <StaffGate>
      <TorneoShell id={id}>{(t) => <Categorias torneo={t} />}</TorneoShell>
    </StaffGate>
  );
}

const ESTADO_LABEL = { INSCRIPCION: "Inscripciones", SORTEADA: "Sorteada (borrador)", PUBLICADA: "Publicada", EN_JUEGO: "En juego", FINALIZADA: "Finalizada" };

function Categorias({ torneo }: { torneo: Torneo }) {
  useFotosTorneo(torneo.id);
  const [sel, setSel] = useState(torneo.categorias[0]?.categoria.id ?? "");
  const cat = torneo.categorias.find((c) => c.categoria.id === sel) ?? torneo.categorias[0];
  if (!cat) return <p className="mt-10 text-center text-white/50">Este torneo no tiene categorías.</p>;
  return (
    <>
      <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:px-0">
        {torneo.categorias.map((c) => {
          const on = c.categoria.id === cat.categoria.id;
          const estado = estadoCategoria(c);
          return (
            <button
              key={c.categoria.id}
              onClick={() => setSel(c.categoria.id)}
              className={clsx("flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition", on ? "seleccion sobre-marca text-lima" : "border-white/10 text-white/70")}
            >
              <span className={clsx("size-2 rounded-full", estado === "INSCRIPCION" ? "bg-amber-300" : estado === "SORTEADA" ? "bg-cielo" : "bg-neon")} />
              {nombreCorto(c.categoria)}
              <span className="text-xs font-normal text-white/50">{duplasActivas(c.duplas).length}</span>
            </button>
          );
        })}
      </div>
      <PanelCategoria key={cat.categoria.id} torneo={torneo} cat={cat} />
    </>
  );
}

function PanelCategoria({ torneo, cat }: { torneo: Torneo; cat: CategoriaEnTorneo }) {
  const guardar = useTorneos((s) => s.guardar);
  const [sorteo, setSorteo] = useState(false);
  const [inscribir, setInscribir] = useState(false);
  const [pegar, setPegar] = useState(false);
  const [reglas, setReglas] = useState(false);
  const [revisar, setRevisar] = useState<Dupla | null>(null);
  const id = cat.categoria.id;
  const porRevisar = pendientesFvp(torneo, id);
  const activas = duplasActivas(cat.duplas);
  const estado = estadoCategoria(cat);
  const sorteada = !!cat.cuadro;
  const propuesta = cat.config.manual ? resumenFormato(activas.length, cat.config) : proponerFormato(activas.length, cat.config);
  const ordenadas = useMemo(() => ordenSiembra(cat.duplas, 1), [cat.duplas]);
  const jugado = cat.cuadro?.partidos.some((p) => !p.bye && p.estado !== "PENDIENTE");

  return (
    <section className="mt-4">
      <div className="glass relative overflow-hidden rounded-[2rem] p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-marca-2/30 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="label !mb-1">{ESTADO_LABEL[estado]}</p>
            <h2 className="font-display text-2xl font-bold sm:text-3xl">{nombreCategoria(cat.categoria)}</h2>
            <p className="mt-1 text-sm text-white/55">
              {activas.length} dupla{activas.length === 1 ? "" : "s"}
              {activas.length >= 2 && ` · ${propuesta.motivo}`}
            </p>
            <p className="mt-1 text-xs text-white/40">Grupos: {descripcionReglas(cat.reglas.GRUPOS)} · Final: {descripcionReglas(cat.reglas.SEMIS_FINAL)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={() => setReglas(true)}>
              <Settings2 className="size-4" /> Reglas
            </button>
            {!jugado && (
              <button className="btn-neon animate-pulse-neon" onClick={() => setSorteo(true)} disabled={activas.length < 2 || porRevisar.length > 0}>
                <Dices className="size-4" /> Sorteo
              </button>
            )}
            {sorteada && !jugado && (
              <button
                className="btn-ghost"
                onClick={() => {
                  guardar(deshacerSorteo(torneo, id));
                  toast("Sorteo deshecho. Puedes editar inscripciones.", "info");
                }}
              >
                <Undo2 className="size-4" /> Deshacer sorteo
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-end justify-between gap-3">
        <h3 className="font-display text-lg font-semibold">Duplas</h3>
        <div className="flex gap-2">
          <button className="btn-ghost !px-3 !py-2" onClick={() => setPegar(true)} disabled={sorteada}>
            <ClipboardPaste className="size-4" /> <span className="hidden sm:inline">Pegar lista</span>
          </button>
          <button className="btn-neon !px-3 !py-2" onClick={() => setInscribir(true)} disabled={sorteada}>
            <UserPlus className="size-4" /> Inscribir
          </button>
        </div>
      </div>
      {sorteada && <p className="mt-2 text-xs text-white/45">Para sumar duplas después del sorteo, deshaz el sorteo (si no hay partidos jugados).</p>}
      {porRevisar.length > 0 && !sorteada && (
        <p className="mt-2 text-sm text-amber-300">
          {porRevisar.length} dupla{porRevisar.length === 1 ? "" : "s"} sin pasar el chequeo del ranking FVP. Revísala{porRevisar.length === 1 ? "" : "s"} (toca el aviso de cada una) para poder hacer el sorteo.
        </p>
      )}

      {cat.duplas.length === 0 ? (
        <button onClick={() => setInscribir(true)} className="glass mt-3 flex w-full flex-col items-center gap-2 rounded-3xl border-dashed p-10 text-center text-white/60 hover:text-white">
          <Plus className="size-8 text-neon" /> Inscribe la primera dupla
        </button>
      ) : (
        <ul className="mt-3 space-y-2">
          {ordenadas.map((d, i) => {
            const [a, b] = d.jugadorIds.map((j) => torneo.jugadores.find((x) => x.id === j));
            const fuera = d.estado !== "ACTIVA";
            return (
              <motion.li layout key={d.id} className={clsx("glass flex flex-wrap items-center gap-3 rounded-2xl p-3", fuera && "opacity-50")}>
                <span className={clsx("flex size-8 shrink-0 items-center justify-center rounded-lg font-display text-sm font-bold", d.cabezaSerie ? "bg-lima text-marino-2" : "bg-white/5 text-white/50")}>
                  {d.cabezaSerie ? <Crown className="size-4" /> : i + 1}
                </span>
                <FotosInscrito torneo={torneo} d={d} jugadores={[a, b]} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{nombreJugador(a)} / {nombreJugador(b)}</p>
                  <p className="text-xs text-white/45">
                    {fuera ? (d.estado === "RETIRADA" ? "Retirada" : "Descalificada") : d.puntos != null ? `${d.puntos} pts ranking` : "Sin puntos de ranking"}
                    {d.cabezaSerie ? ` · Cabeza de serie ${d.cabezaSerie}` : ""}
                  </p>
                </div>
                {!sorteada && (
                  <>
                    <input
                      type="number"
                      inputMode="numeric"
                      className="input !w-20 !px-2 !py-1.5 text-center text-sm"
                      placeholder="pts"
                      value={d.puntos ?? ""}
                      onChange={(e) => guardar(editarDupla(torneo, cat.categoria.id, d.id, { puntos: e.target.value === "" ? undefined : Number(e.target.value) }))}
                      aria-label="Puntos de ranking"
                    />
                    <button
                      className={clsx("btn-ghost !p-2", d.cabezaSerie && "!text-lima")}
                      title="Cabeza de serie"
                      onClick={() => {
                        const usados = cat.duplas.map((x) => x.cabezaSerie ?? 0);
                        guardar(editarDupla(torneo, cat.categoria.id, d.id, { cabezaSerie: d.cabezaSerie ? null : Math.max(0, ...usados) + 1 }));
                      }}
                    >
                      <Crown className="size-4" />
                    </button>
                  </>
                )}
                {!fuera && (
                  <button
                    className="btn-ghost !p-2 text-coral"
                    title={sorteada ? "Retirar dupla (sus partidos pendientes pasan a W.O.)" : "Quitar"}
                    onClick={() => {
                      if (sorteada && !confirm(`¿Retirar a ${nombreDupla(torneo, d)}? Sus partidos pendientes pasan a W.O.`)) return;
                      guardar(quitarDupla(torneo, cat.categoria.id, d.id));
                    }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
                {!fuera && torneo.validarFvp !== false && d.fvp && (
                  <div className="-mt-1 w-full pl-11">
                    <EstadoFvpChip v={d.fvp} onClick={() => setRevisar(d)} />
                  </div>
                )}
              </motion.li>
            );
          })}
        </ul>
      )}

      <InscribirHoja torneo={torneo} cat={cat} abierta={inscribir} onClose={() => setInscribir(false)} />
      <PegarHoja torneo={torneo} cat={cat} abierta={pegar} onClose={() => setPegar(false)} />
      <ReglasHoja torneo={torneo} cat={cat} abierta={reglas} onClose={() => setReglas(false)} />
      <SorteoPopup torneo={torneo} categoriaId={id} abierto={sorteo} onClose={() => setSorteo(false)} />
      <RevisarFvpHoja torneo={torneo} cat={cat} dupla={revisar && (cat.duplas.find((d) => d.id === revisar.id) ?? null)} onClose={() => setRevisar(null)} />
    </section>
  );
}

/* ---------- inscribir ---------- */

interface Borrador {
  nombre: string;
  apellido: string;
  genero: "M" | "F";
  nacimiento: string;
  cedula: string;
}

const vacio = (genero: "M" | "F"): Borrador => ({ nombre: "", apellido: "", genero, nacimiento: "", cedula: "" });

/** El mismo jugador si ya está en el torneo: por cédula y, si no hay, por nombre. */
function aJugador(b: Borrador, existentes: JugadorTorneo[]): JugadorTorneo {
  const clave = claveCedula(b.cedula);
  const igual =
    (clave ? existentes.find((j) => claveCedula(j.cedula) === clave) : undefined) ??
    existentes.find((j) => j.nombre.toLowerCase() === b.nombre.trim().toLowerCase() && (j.apellido ?? "").toLowerCase() === b.apellido.trim().toLowerCase());
  return {
    ...(igual ?? {}),
    id: igual?.id ?? nuevoId("j-"),
    nombre: b.nombre.trim(),
    apellido: b.apellido.trim() || undefined,
    genero: b.genero,
    fechaNacimiento: b.nacimiento || igual?.fechaNacimiento || null,
    cedula: clave ? formatoCedula(b.cedula) : (igual?.cedula ?? null),
  };
}

/** Lo que se guarda en la dupla: la verificación o, si el staff la autorizó, la excepción firmada. */
function conExcepcion(v: VerificacionFvp | null, excepcion: boolean, motivo: string, staff?: string): VerificacionFvp | undefined {
  if (!v) return undefined;
  return excepcion && v.estado !== "VERIFICADA" ? { ...v, estado: "EXCEPCION", nota: motivo.trim(), por: staff } : v;
}

function InscribirHoja({ torneo, cat, abierta, onClose }: { torneo: Torneo; cat: CategoriaEnTorneo; abierta: boolean; onClose: () => void }) {
  const guardar = useTorneos((s) => s.guardar);
  const g1 = cat.categoria.rama === "FEMENINO" ? "F" : "M";
  const g2 = cat.categoria.rama === "MASCULINO" ? "M" : "F";
  const [a, setA] = useState<Borrador>(vacio(g1));
  const [b, setB] = useState<Borrador>(vacio(g2));
  const [puntos, setPuntos] = useState("");
  const [excepcion, setExcepcion] = useState(false);
  const [motivo, setMotivo] = useState("");
  const staff = useAmericanos((s) => s.staff);
  const conEdad = cat.categoria.tipo === "MASTER" || cat.categoria.tipo === "JUNIOR";
  const chequeaFvp = torneo.validarFvp !== false && cat.categoria.tipo === "NIVEL";
  const ja = aJugador(a, torneo.jugadores);
  const jb = aJugador(b, torneo.jugadores);
  const fvp = useRankingFvp(chequeaFvp ? [ja.cedula, jb.cedula] : []);
  const v = chequeaFvp ? verificarDupla(cat.categoria, [ja, jb], fvp.buscar, { lista: fvp.resumen?.cargadoEn }) : null;
  const error =
    !a.nombre.trim() || !b.nombre.trim()
      ? "Escribe el nombre de los dos jugadores."
      : (validarDupla(cat.categoria, ja, jb, anioTorneo(torneo)) ??
        (chequeaFvp && !fvp.listo
          ? "Buscando en el ranking FVP…"
          : v?.estado === "BLOQUEADA" && !excepcion
            ? v.nota!
            : excepcion && v?.estado !== "VERIFICADA" && !motivo.trim()
              ? "Escribe el motivo de la excepción."
              : null));

  function inscribir(seguir: boolean) {
    if (error) return toast(error, "error");
    const final = conExcepcion(v, excepcion, motivo, staff?.nombre);
    let t = inscribirDupla(torneo, cat.categoria.id, ja, jb, { puntos: puntos ? Number(puntos) : undefined, fvp: final });
    if (final?.estado === "EXCEPCION") t = tocar(t, `Excepción FVP para ${nombreJugador(ja)} / ${nombreJugador(jb)} (${nombreCategoria(cat.categoria)}): ${final.nota}`, staff?.nombre);
    guardar(t);
    toast(final?.estado === "POR_VERIFICAR" ? `Inscritos. Queda por verificar en el ranking FVP.` : `${ja.apellido ?? ja.nombre} / ${jb.apellido ?? jb.nombre} inscritos.`, final?.estado === "POR_VERIFICAR" ? "info" : undefined);
    setA(vacio(g1));
    setB(vacio(g2));
    setPuntos("");
    setExcepcion(false);
    setMotivo("");
    if (!seguir) onClose();
  }

  const campos = (x: Borrador, set: (b: Borrador) => void, n: number) => (
    <div className="glass rounded-2xl p-3">
      <p className="mb-2 text-xs font-semibold text-white/50">Jugador {n}</p>
      <div className="grid grid-cols-2 gap-2">
        <input className="input !py-2.5" placeholder="Nombre" value={x.nombre} onChange={(e) => set({ ...x, nombre: e.target.value })} list="jugadores-torneo" autoFocus={n === 1} />
        <input className="input !py-2.5" placeholder="Apellido" value={x.apellido} onChange={(e) => set({ ...x, apellido: e.target.value })} />
      </div>
      {chequeaFvp && (
        <>
          <input className="input mt-2 !py-2.5" placeholder="Cédula (V-12345678)" value={x.cedula} onChange={(e) => set({ ...x, cedula: e.target.value })} aria-label={`Cédula del jugador ${n}`} />
          <AtletaFvpLinea cedula={x.cedula} atleta={fvp.buscar?.(x.cedula) ?? null} listo={fvp.listo} nivel={cat.categoria.nivel} />
        </>
      )}
      {(cat.categoria.rama === "MIXTO" || conEdad) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {cat.categoria.rama === "MIXTO" && (
            <Segmented opciones={[{ id: "M", label: "Hombre" }, { id: "F", label: "Mujer" }]} valor={x.genero} onChange={(g) => set({ ...x, genero: g })} className="flex-1" />
          )}
          {conEdad && (
            <label className="flex flex-1 items-center gap-2 text-xs text-white/50">
              Nacimiento
              <input type="date" className="input !py-2" value={x.nacimiento} onChange={(e) => set({ ...x, nacimiento: e.target.value })} />
            </label>
          )}
        </div>
      )}
    </div>
  );

  return (
    <Hoja
      abierta={abierta}
      onClose={onClose}
      titulo="Inscribir dupla"
      sub={nombreCategoria(cat.categoria)}
      pie={
        <div className="space-y-2">
          {error && (a.nombre || b.nombre) && <p className="text-sm text-coral">{error}</p>}
          {!error && v?.estado === "POR_VERIFICAR" && <p className="text-sm text-amber-300">{v.nota} Quedará por verificar y frena el sorteo hasta que el staff la revise.</p>}
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => inscribir(true)} disabled={!!error}>
              Inscribir y otra
            </button>
            <button className="btn-neon flex-1" onClick={() => inscribir(false)} disabled={!!error}>
              Inscribir
            </button>
          </div>
        </div>
      }
    >
      <datalist id="jugadores-torneo">
        {torneo.jugadores.map((j) => (
          <option key={j.id} value={j.nombre}>
            {nombreJugador(j)}
          </option>
        ))}
      </datalist>
      <div className="space-y-3">
        {campos(a, setA, 1)}
        {campos(b, setB, 2)}
        {v && v.estado !== "VERIFICADA" && fvp.listo && (a.nombre || b.nombre) && <ExcepcionFvp activa={excepcion} motivo={motivo} onActiva={setExcepcion} onMotivo={setMotivo} />}
        {chequeaFvp && fvp.resumen && !fvp.resumen.cargado && <p className="text-xs text-white/45">Aún no hay lista FVP cargada: la dupla quedará por verificar. Cárgala en Torneos → Ranking FVP.</p>}
        {chequeaFvp && fvp.error && <p className="text-xs text-white/45">Sin conexión con el ranking FVP: la dupla quedará por verificar.</p>}
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            Puntos de ranking <span className="text-white/40">(opcional, ordenan la siembra)</span>
          </span>
          <input type="number" inputMode="numeric" className="input !w-24 !py-2 text-center" value={puntos} onChange={(e) => setPuntos(e.target.value)} />
        </label>
      </div>
    </Hoja>
  );
}

const CEDULA_EN_TEXTO = /\b[VEve]-?\s?\d[\d.]{4,}\d\b/;

/** Pegar una lista: una dupla por línea, "Nombre Apellido [V-cédula] / Nombre Apellido [V-cédula] [puntos]". */
function PegarHoja({ torneo, cat, abierta, onClose }: { torneo: Torneo; cat: CategoriaEnTorneo; abierta: boolean; onClose: () => void }) {
  const guardar = useTorneos((s) => s.guardar);
  const [texto, setTexto] = useState("");
  const anio = anioTorneo(torneo);
  const chequeaFvp = torneo.validarFvp !== false && cat.categoria.tipo === "NIVEL";
  const fvp = useRankingFvp(chequeaFvp ? (texto.match(new RegExp(CEDULA_EN_TEXTO, "g")) ?? []) : []);
  const lineas = texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^(.+?)\s*(?:\/|&|\s[-–]\s|\sy\s)\s*(.+?)(?:\s+(\d+))?$/i);
      if (!m) return { l, error: "Usa: Nombre Apellido / Nombre Apellido" };
      const partir = (s: string, genero: "M" | "F"): Borrador => {
        const cedula = s.match(CEDULA_EN_TEXTO)?.[0] ?? "";
        const [nombre, ...resto] = s.replace(cedula, " ").trim().split(/\s+/);
        return { nombre: nombre ?? "", apellido: resto.join(" "), genero, nacimiento: "", cedula };
      };
      const g1 = cat.categoria.rama === "FEMENINO" ? "F" : "M";
      const g2 = cat.categoria.rama === "MASCULINO" ? "M" : "F";
      const a = aJugador(partir(m[1], g1), torneo.jugadores);
      const b = aJugador(partir(m[2], g2), torneo.jugadores);
      const conEdad = cat.categoria.tipo === "MASTER" || cat.categoria.tipo === "JUNIOR";
      const v = chequeaFvp ? verificarDupla(cat.categoria, [a, b], fvp.buscar, { lista: fvp.resumen?.cargadoEn }) : null;
      const error = !a.nombre || !b.nombre ? "Faltan nombres" : (conEdad ? null : validarDupla(cat.categoria, a, b, anio)) ?? (v?.estado === "BLOQUEADA" ? v.nota! : null);
      return { l, a, b, puntos: m[3] ? Number(m[3]) : undefined, error, fvp: v ?? undefined };
    });
  const validas = lineas.filter((x) => !x.error && x.a && x.b);

  return (
    <Hoja
      abierta={abierta}
      onClose={onClose}
      titulo="Pegar lista de duplas"
      sub="Una dupla por línea · ej. Luis Zea V-12345678 / Juan Pérez V-23456789 850"
      pie={
        <button
          className="btn-neon w-full"
          disabled={!validas.length || (chequeaFvp && !fvp.listo)}
          onClick={() => {
            let t = torneo;
            for (const v of validas) t = inscribirDupla(t, cat.categoria.id, v.a!, v.b!, { puntos: v.puntos, fvp: v.fvp });
            guardar(t);
            toast(`${validas.length} duplas inscritas.`);
            setTexto("");
            onClose();
          }}
        >
          Inscribir {validas.length || ""} dupla{validas.length === 1 ? "" : "s"}
        </button>
      }
    >
      <textarea className="input min-h-40 font-mono text-sm" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={"Nombre Apellido / Nombre Apellido  puntos (opcional)\nUna dupla por línea"} />
      {lineas.some((x) => x.error) && (
        <ul className="mt-2 space-y-1 text-xs text-coral">
          {lineas.filter((x) => x.error).map((x, i) => (
            <li key={i}>
              {x.l}: {x.error}
            </li>
          ))}
        </ul>
      )}
      {(cat.categoria.tipo === "MASTER" || cat.categoria.tipo === "JUNIOR") && <p className="mt-2 text-xs text-white/45">En Master y Junior completa luego la fecha de nacimiento de cada jugador.</p>}
      {chequeaFvp && (
        <p className="mt-2 text-xs text-white/45">
          Con cédula se cruza con el ranking FVP: quien juegue por debajo de su categoría no se inscribe. Sin cédula, la dupla queda por verificar.
        </p>
      )}
    </Hoja>
  );
}

/* ---------- reglas por fase ---------- */

const FASES: { id: FaseReglas; label: string }[] = [
  { id: "GRUPOS", label: "Grupos" },
  { id: "LLAVE", label: "Llave" },
  { id: "SEMIS_FINAL", label: "Semis y final" },
];

function ReglasHoja({ torneo, cat, abierta, onClose }: { torneo: Torneo; cat: CategoriaEnTorneo; abierta: boolean; onClose: () => void }) {
  const guardar = useTorneos((s) => s.guardar);
  const [fase, setFase] = useState<FaseReglas>("GRUPOS");
  const r = cat.reglas[fase];
  const set = (c: Partial<ReglasPartido>) => {
    const nueva = { ...r, ...c };
    if (c.sets !== undefined || c.games !== undefined || c.superTie !== undefined || c.tieDecisivo !== undefined || c.tercerSetLargo !== undefined) nueva.minutos = minutosEstimados(nueva);
    // FIP: mini set a 4 con tie-break en 4-4; set a 6 con tie-break en 6-6; set largo a 9 con tie-break en 8-8.
    if (c.games !== undefined) nueva.tieBreakEn = tieBreakPorDefecto(nueva.games);
    guardar(configurarCategoria(torneo, cat.categoria.id, { reglas: { [fase]: nueva } }));
  };
  return (
    <Hoja abierta={abierta} onClose={onClose} titulo="Reglas de juego" sub={nombreCategoria(cat.categoria)}>
      <Segmented opciones={FASES} valor={fase} onChange={setFase} />
      <div className="mt-4 space-y-4">
        <div>
          <p className="label">Sets</p>
          <Segmented opciones={[{ id: "1", label: "1 set" }, { id: "3", label: "Mejor de 3" }]} valor={String(r.sets)} onChange={(v) => set({ sets: Number(v) as 1 | 3 })} />
        </div>
        <div>
          <p className="label">Games por set</p>
          <Segmented opciones={[{ id: "4", label: "A 4 (mini set)" }, { id: "6", label: "A 6" }, { id: "9", label: "A 9 (largo)" }]} valor={String(r.games)} onChange={(v) => set({ games: Number(v) })} />
        </div>
        {r.sets === 3 && (
          <div>
            <p className="label">Con un set por lado</p>
            <Segmented
              opciones={[
                { id: "STB10", label: "Súper tie a 10" },
                { id: "TB7", label: "Tie-break a 7" },
                { id: "SET", label: "Tercer set" },
              ]}
              valor={!r.superTie ? "SET" : (r.tieDecisivo ?? 10) === 7 ? "TB7" : "STB10"}
              onChange={(v) => set(v === "SET" ? { superTie: false } : { superTie: true, tieDecisivo: v === "TB7" ? 7 : 10, tercerSetLargo: false })}
            />
          </div>
        )}
        <div className="glass divide-y divide-white/5 rounded-2xl">
          <label className="flex items-center justify-between gap-3 p-3 text-sm">
            <span>
              Punto de oro en 40-40
              <span className="block text-xs text-white/45">{r.puntoDeOro ? "Resta quien elija la dupla que resta; en mixto, el del mismo sexo que el sacador." : "Con ventaja: se gana con 2 puntos seguidos."}</span>
            </span>
            <Switch activo={r.puntoDeOro} onChange={(v) => set({ puntoDeOro: v })} etiqueta="Punto de oro" />
          </label>
          <label className="flex items-center justify-between gap-3 p-3 text-sm">
            <span>Tie-break en {r.tieBreakEn ?? tieBreakPorDefecto(r.games)}-{r.tieBreakEn ?? tieBreakPorDefecto(r.games)}</span>
            <Switch activo={r.tieBreakEn !== null} onChange={(v) => set({ tieBreakEn: v ? tieBreakPorDefecto(r.games) : null })} etiqueta="Tie-break" />
          </label>
          {r.sets === 3 && !r.superTie && r.tieBreakEn !== null && (
            <label className="flex items-center justify-between gap-3 p-3 text-sm">
              <span>
                Tercer set sin tie-break
                <span className="block text-xs text-white/45">Con 6-6 se sigue hasta sacar 2 games de diferencia.</span>
              </span>
              <Switch activo={!!r.tercerSetLargo} onChange={(v) => set({ tercerSetLargo: v })} etiqueta="Tercer set sin tie-break" />
            </label>
          )}
          <div className="flex items-center justify-between gap-3 p-3 text-sm">
            <span>Duración estimada</span>
            <Stepper valor={r.minutos} onChange={(v) => guardar(configurarCategoria(torneo, cat.categoria.id, { reglas: { [fase]: { ...r, minutos: v } } }))} min={30} max={180} paso={15} sufijo="min" />
          </div>
        </div>
        <p className="text-xs text-white/45">{descripcionReglas(r)}. Según el Reglamento de Juego FIP (rev. 2021). La duración se usa para armar los horarios; si ya estaban programados, reprograma desde Horarios.</p>
      </div>
    </Hoja>
  );
}

/**
 * Fotos desde Inscritos (staff): toca la cara de un jugador para su foto, o la cámara para la
 * foto de la dupla. Se ven en el cuadro, el anotador, la TV y la página del partido.
 */
function FotosInscrito({ torneo, d, jugadores }: { torneo: Torneo; d: Dupla; jugadores: (JugadorTorneo | undefined)[] }) {
  const actualizar = useTorneos((s) => s.actualizar);
  const urlDupla = useFotoDupla(torneo.id, d.id);
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex -space-x-2">
        {jugadores.map((j, i) =>
          j ? (
            <TomarFoto
              key={j.id}
              className="rounded-full"
              etiqueta={`Foto de ${nombreJugador(j)}`}
              onFoto={async (img) => {
                const r = await subirFoto(torneo.id, "jugador", j.id, img);
                if (!r.url) return toast(r.error!, "error");
                actualizar(torneo.id, (t) => ({ ...t, jugadores: t.jugadores.map((x) => (x.id === j.id ? { ...x, fotoUrl: r.url } : x)) }));
                toast(`Foto de ${j.nombre} lista`);
              }}
            >
              <Avatar nombre={nombreJugador(j)} fotoUrl={j.fotoUrl} size={34} className="ring-2 ring-fondo" />
            </TomarFoto>
          ) : (
            <Avatar key={i} nombre="?" size={34} />
          ),
        )}
      </div>
      <TomarFoto
        className="relative flex h-9 w-11 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/5 text-white/50"
        etiqueta="Foto de la dupla"
        onFoto={async (img) => {
          const r = await subirFoto(torneo.id, "dupla", d.id, img);
          if (!r.url) return toast(r.error!, "error");
          useFotos.getState().poner(torneo.id, d.id, r.url);
          toast("Foto de la dupla lista");
        }}
      >
        {urlDupla ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={urlDupla} alt="" className="size-full object-cover" />
        ) : (
          <Camera className="size-4" />
        )}
      </TomarFoto>
    </div>
  );
}
