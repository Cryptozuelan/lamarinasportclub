"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { Dices, Megaphone, RotateCcw, Sparkles, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Hoja } from "@/components/ui/Hoja";
import { Segmented } from "@/components/ui/Segmented";
import { Switch } from "@/components/ui/Switch";
import { toast } from "@/components/ui/Toaster";
import { sonar, vibrar } from "@/lib/feedback";
import { nombreCategoria } from "@/lib/torneo/categorias";
import { duplasActivas, proponerFormato, resumenFormato } from "@/lib/torneo/cuadro";
import { programarTorneo } from "@/lib/torneo/programacion";
import { categoria, nombreDupla, publicarCategoria, sortearCategoria } from "@/lib/torneo/torneo";
import { useAmericanos } from "@/lib/store";
import { useTorneos } from "@/lib/torneosStore";
import type { ConfigCuadro, FormatoCuadro, Origen, Torneo } from "@/types/torneo";

const FORMATOS: { id: FormatoCuadro; label: string }[] = [
  { id: "GRUPOS_LLAVE", label: "Grupos + llave" },
  { id: "ELIMINACION", label: "Eliminación" },
  { id: "LIGA_FINAL", label: "Liga + final" },
  { id: "LIGA", label: "Liga" },
];

/**
 * Popup "Sorteo" de una categoría: muestra el formato recomendado (y el porqué),
 * permite ajustarlo, hace el sorteo animado y publica: con eso se programan solos
 * los partidos en los días del torneo.
 */
export function SorteoPopup({ torneo, categoriaId, abierto, onClose }: { torneo: Torneo; categoriaId: string; abierto: boolean; onClose: () => void }) {
  const guardar = useTorneos((s) => s.guardar);
  const staff = useAmericanos((s) => s.staff);
  const cat = categoria(torneo, categoriaId)!;
  const n = duplasActivas(cat.duplas).length;
  const [config, setConfig] = useState<ConfigCuadro>(() => (cat.config.manual ? cat.config : proponerFormato(n, cat.config).config));
  const [vista, setVista] = useState<Torneo | null>(null);
  const [tirada, setTirada] = useState(0);

  useEffect(() => {
    if (!abierto) return;
    setConfig(cat.config.manual ? cat.config : proponerFormato(n, cat.config).config);
    setVista(cat.cuadro && !cat.cuadro.publicado ? torneo : null);
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const resumen = useMemo(() => resumenFormato(n, config), [n, config]);
  const recomendado = useMemo(() => proponerFormato(n, cat.config), [n, cat.config]);
  const esRecomendado = recomendado.config.formato === config.formato && recomendado.config.tamanoGrupo === config.tamanoGrupo;
  const set = (c: Partial<ConfigCuadro>) => {
    setVista(null);
    setConfig((x) => ({ ...x, ...c, manual: true }));
  };

  const programa = useMemo(() => (vista ? programarTorneo(vista, { incluirBorradores: true }) : null), [vista]);
  const cuadro = vista ? categoria(vista, categoriaId)?.cuadro : null;
  const nombre = (id?: string | null) => nombreDupla(torneo, cat.duplas.find((d) => d.id === id));

  function sortear() {
    vibrar([10, 40, 10]);
    sonar("tap");
    setTirada((x) => x + 1);
    setVista(sortearCategoria(torneo, categoriaId, { config, por: staff?.nombre }));
  }

  function publicar() {
    if (!vista) return;
    const publicado = publicarCategoria(vista, categoriaId, staff?.nombre);
    const res = programarTorneo(publicado);
    guardar(res.torneo);
    sonar("ok");
    if (res.sinLugar.length) toast(`Publicado. ${res.sinLugar.length} partido(s) no entran en los días elegidos: faltan ~${res.horasFaltantes} h de pista.`, "error");
    else toast(`${nombreCategoria(cat.categoria)} publicada y programada (${res.programados} partidos).`);
    onClose();
  }

  const textoOrigen = (o: Origen) => {
    if (o.tipo === "BYE") return "BYE";
    if (o.tipo === "DUPLA") return nombre(o.duplaId);
    if (o.tipo === "GRUPO") return `${o.puesto}º Grupo ${cuadro?.grupos.find((g) => g.id === o.grupoId)?.nombre ?? ""}`;
    return o.tipo === "GANADOR" ? "Ganador" : "Perdedor";
  };

  const primeraRonda = cuadro?.partidos.filter((p) => p.fase === "LLAVE" && p.ronda === 1 && p.cuadro !== "CONSOLACION") ?? [];

  return (
    <Hoja
      abierta={abierto}
      onClose={onClose}
      titulo={`Sorteo · ${nombreCategoria(cat.categoria)}`}
      sub={`${n} duplas inscritas`}
      ancho="max-w-3xl"
      pie={
        n < 2 ? null : vista ? (
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost flex-1" onClick={sortear}>
              <RotateCcw className="size-4" /> Repetir sorteo
            </button>
            <button className="btn-neon flex-[2]" onClick={publicar}>
              <Megaphone className="size-4" /> Publicar y programar
            </button>
          </div>
        ) : (
          <button className="btn-neon w-full text-base" onClick={sortear}>
            <Dices className="size-5" /> Sortear
          </button>
        )
      }
    >
      {n < 2 ? (
        <p className="rounded-2xl bg-white/5 p-4 text-sm text-white/60">Hacen falta al menos 2 duplas para sortear.</p>
      ) : (
        <>
          <div className="rounded-2xl border border-lima/30 bg-lima/10 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-lima">
              <Sparkles className="size-4" /> {esRecomendado ? "Formato recomendado" : "Formato personalizado"}
            </p>
            <p className="mt-1 text-sm">{resumen.motivo}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="chip">{resumen.partidos} partidos</span>
              <span className="chip">Mínimo {resumen.minimoPorDupla} por dupla</span>
              {resumen.byes > 0 && <span className="chip">{resumen.byes} bye{resumen.byes > 1 ? "s" : ""}</span>}
              {!esRecomendado && (
                <button className="chip text-neon" onClick={() => { setVista(null); setConfig(recomendado.config); }}>
                  Volver al recomendado
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <Segmented opciones={FORMATOS} valor={config.formato} onChange={(f) => set({ formato: f })} className="!flex-wrap" />
            {config.formato === "GRUPOS_LLAVE" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs text-white/50">Duplas por grupo</p>
                  <Segmented opciones={[{ id: "3", label: "Grupos de 3" }, { id: "4", label: "Grupos de 4" }]} valor={String(config.tamanoGrupo)} onChange={(v) => set({ tamanoGrupo: Number(v) as 3 | 4 })} />
                </div>
                <div>
                  <p className="mb-1 text-xs text-white/50">Pasan por grupo</p>
                  <Segmented opciones={[{ id: "1", label: "Solo 1ro" }, { id: "2", label: "1ro y 2do" }]} valor={String(config.clasificanPorGrupo)} onChange={(v) => set({ clasificanPorGrupo: Number(v) as 1 | 2 })} />
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {config.formato !== "LIGA" && (
                <label className="flex items-center gap-3 text-sm">
                  <Switch activo={config.tercerPuesto} onChange={(v) => set({ tercerPuesto: v })} etiqueta="Partido por el 3er puesto" /> 3er puesto
                </label>
              )}
              {config.formato === "GRUPOS_LLAVE" && (
                <label className="flex items-center gap-3 text-sm">
                  <Switch activo={config.consolacion} onChange={(v) => set({ consolacion: v })} etiqueta="Cuadro de consolación" /> Consolación para eliminados en grupos
                </label>
              )}
            </div>
          </div>

          <AnimatePresence mode="wait">
            {cuadro && (
              <motion.div key={tirada} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-6">
                {cuadro.grupos.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {cuadro.grupos.map((g, gi) => (
                      <div key={g.id} className="glass rounded-2xl p-3">
                        <p className="mb-2 font-display text-sm font-bold text-lima">Grupo {g.nombre}</p>
                        <ol className="space-y-1.5">
                          {g.duplaIds.map((id, i) => {
                            const d = cat.duplas.find((x) => x.id === id);
                            return (
                              <motion.li
                                key={id}
                                initial={{ opacity: 0, y: -14, scale: 0.9 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={{ delay: (i * cuadro.grupos.length + gi) * 0.07, type: "spring", stiffness: 380, damping: 24 }}
                                className={clsx("flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs", i === 0 ? "bg-lima/15 font-semibold" : "bg-white/5")}
                              >
                                <span className="w-4 text-white/40">{i + 1}</span>
                                <span className="truncate">{nombreDupla(torneo, d)}</span>
                              </motion.li>
                            );
                          })}
                        </ol>
                      </div>
                    ))}
                  </div>
                )}
                {primeraRonda.length > 0 && (
                  <div className="mt-4">
                    <p className="label">{primeraRonda[0].etiqueta.replace(/ \d+$/, "")}</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {primeraRonda.map((p, i) => (
                        <motion.div
                          key={p.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.3 + i * 0.05 }}
                          className="glass flex items-center gap-2 rounded-xl px-3 py-2 text-xs"
                        >
                          <span className={clsx("flex-1 truncate", p.origenA.tipo === "BYE" && "text-white/35")}>{p.duplaA ? nombre(p.duplaA) : textoOrigen(p.origenA)}</span>
                          <span className="font-bold text-white/30">vs</span>
                          <span className={clsx("flex-1 truncate text-right", p.origenB.tipo === "BYE" && "font-semibold text-lima")}>
                            {p.duplaB ? nombre(p.duplaB) : textoOrigen(p.origenB)}
                          </span>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
                {programa && (
                  <p className={clsx("mt-4 flex items-start gap-2 rounded-xl p-3 text-xs", programa.sinLugar.length ? "bg-coral/10 text-coral" : "bg-white/5 text-white/60")}>
                    {programa.sinLugar.length ? <TriangleAlert className="mt-0.5 size-4 shrink-0" /> : <Sparkles className="mt-0.5 size-4 shrink-0 text-neon" />}
                    {programa.sinLugar.length
                      ? `Con los días y pistas actuales no entran ${programa.sinLugar.length} partidos (faltan ~${programa.horasFaltantes} h de pista). Agrega horario, un día o una pista, o usa grupos de 3.`
                      : `Todo entra en los días del torneo. Termina: ${Object.entries(programa.finPorDia).map(([f, h]) => `${new Date(`${f}T12:00:00`).toLocaleDateString("es", { weekday: "short", day: "numeric" })} ${h}`).join(" · ")}.`}
                  </p>
                )}
                <p className="mt-3 text-center text-[11px] text-white/35">Semilla {cuadro.semilla} · el mismo número reproduce este sorteo</p>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </Hoja>
  );
}
