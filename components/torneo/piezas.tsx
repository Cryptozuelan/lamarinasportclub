"use client";

import clsx from "clsx";
import Link from "next/link";
import { BarChart3, CalendarClock, Flag, MapPin, Minus, Plus, Radio, Trash2, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { Hoja } from "@/components/ui/Hoja";
import { toast } from "@/components/ui/Toaster";
import { vibrar } from "@/lib/feedback";
import { nombreCorto } from "@/lib/torneo/categorias";
import { duplasActivas } from "@/lib/torneo/cuadro";
import { nombrePista, pistaCorta } from "@/lib/torneo/imprevistos";
import { esSuperTie } from "@/lib/torneo/marcador";
import { ganadorDe, resultadoRetiro, textoSets, validarResultadoTorneo } from "@/lib/torneo/tabla";
import { borrarResultado, cargarResultado, cargarWO, categoria, dupla, estadoCategoria, moverPartido, nombreDupla, reglasDe } from "@/lib/torneo/torneo";
import { useEsStaff } from "@/lib/store";
import { useTorneos } from "@/lib/torneosStore";
import type { CategoriaEnTorneo, PartidoTorneo, Torneo } from "@/types/torneo";
import type { SetScore } from "@/types/americano";
import { fechaCorta } from "./TorneoShell";

/** Fila horizontal de categorías para elegir. */
export function CategoriaChips({ torneo, valor, onChange, soloPublicadas = false }: { torneo: Torneo; valor: string; onChange: (id: string) => void; soloPublicadas?: boolean }) {
  const lista = torneo.categorias.filter((c) => !soloPublicadas || c.cuadro?.publicado);
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:px-0">
      {lista.map((c) => {
        const on = c.categoria.id === valor;
        const estado = estadoCategoria(c);
        return (
          <button
            key={c.categoria.id}
            onClick={() => {
              vibrar(6);
              onChange(c.categoria.id);
            }}
            className={clsx("flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition", on ? "seleccion sobre-marca text-lima" : "border-white/10 text-white/70")}
          >
            <span className={clsx("size-2 rounded-full", estado === "EN_JUEGO" ? "bg-neon" : estado === "FINALIZADA" ? "bg-white/40" : estado === "INSCRIPCION" ? "bg-amber-300" : "bg-cielo")} />
            {nombreCorto(c.categoria)}
            <span className="text-xs font-normal text-white/50">{duplasActivas(c.duplas).length}</span>
          </button>
        );
      })}
    </div>
  );
}

export function useCategoriaSel(torneo: Torneo, soloPublicadas = false): [CategoriaEnTorneo | undefined, (id: string) => void] {
  const lista = torneo.categorias.filter((c) => !soloPublicadas || c.cuadro?.publicado);
  const [sel, setSel] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const q = new URLSearchParams(location.search).get("c");
      if (q && lista.some((c) => c.categoria.id === q)) return q;
    }
    return lista[0]?.categoria.id ?? "";
  });
  const cat = lista.find((c) => c.categoria.id === sel) ?? lista[0];
  const cambiar = (id: string) => {
    setSel(id);
    try {
      const u = new URL(location.href);
      u.searchParams.set("c", id);
      history.replaceState(null, "", u);
    } catch {
      /* nada */
    }
  };
  return [cat, cambiar];
}

/** Una línea de dupla en una tarjeta de partido. */
function LineaDupla({ nombre, sets, gana, bye, invertir }: { nombre: string; sets?: SetScore[]; gana?: boolean; bye?: boolean; invertir?: boolean }) {
  return (
    <div className={clsx("flex items-center gap-2", gana === false && "text-white/45")}>
      <span className={clsx("min-w-0 flex-1 truncate text-sm", gana && "font-bold text-white", bye && "italic text-white/35")}>{nombre}</span>
      {gana && <Trophy className="size-3.5 shrink-0 text-lima" />}
      {sets?.map((s, i) => (
        <span key={i} className={clsx("w-5 text-center font-display text-sm tabular", (invertir ? s.b > s.a : s.a > s.b) ? "font-bold text-lima" : "text-white/50")}>
          {invertir ? s.b : s.a}
        </span>
      ))}
    </div>
  );
}

export function textoOrigen(t: Torneo, p: PartidoTorneo, lado: "A" | "B"): string {
  const o = lado === "A" ? p.origenA : p.origenB;
  const d = lado === "A" ? p.duplaA : p.duplaB;
  if (d) return nombreDupla(t, dupla(t, d));
  if (o.tipo === "BYE") return "BYE";
  if (o.tipo === "GRUPO") {
    const g = categoria(t, p.categoriaId)?.cuadro?.grupos.find((x) => x.id === o.grupoId);
    return `${o.puesto}º Grupo ${g?.nombre ?? ""}`;
  }
  if (o.tipo === "GANADOR" || o.tipo === "PERDEDOR") {
    const ref = categoria(t, p.categoriaId)?.cuadro?.partidos.find((x) => x.id === o.partidoId);
    return `${o.tipo === "GANADOR" ? "Ganador" : "Perdedor"} ${ref?.etiqueta ?? ""}`;
  }
  return "Por definir";
}

export function MatchCard({ torneo, p, onClick, compacto = false, sinHora = false }: { torneo: Torneo; p: PartidoTorneo; onClick?: () => void; compacto?: boolean; sinHora?: boolean }) {
  const r = p.resultado;
  const fin = p.estado === "FINALIZADO" && !p.bye;
  const ganaA = fin ? r?.ganador === "A" : p.bye && p.estado === "FINALIZADO" ? !!p.duplaA : undefined;
  const ganaB = fin ? r?.ganador === "B" : p.bye && p.estado === "FINALIZADO" ? !!p.duplaB : undefined;
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={clsx(
        "glass block w-full rounded-2xl text-left transition",
        compacto ? "p-2.5" : "p-3",
        onClick && "hover:border-neon/30 active:scale-[0.99]",
        p.estado === "EN_JUEGO" && "!border-neon/50 shadow-[0_0_0_1px_rgba(166,232,74,0.3)]",
      )}
    >
      <div className="mb-1.5 flex items-center gap-2 text-[11px] text-white/45">
        <span className="truncate font-semibold uppercase tracking-wide">{p.etiqueta}</span>
        {p.estado === "EN_JUEGO" && (
          <span className="ml-auto flex items-center gap-1 font-semibold text-neon">
            <Radio className="size-3" /> En juego
          </span>
        )}
        {p.estado === "LLAMADO" && <span className="ml-auto font-semibold text-amber-200">Llamado a pista {p.pistaReal}</span>}
        {p.estado === "PENDIENTE" && p.suspendido && (
          <span className="ml-auto shrink-0 font-semibold text-amber-200">Suspendido{p.suspendido.marcador ? ` · ${p.suspendido.marcador}` : ""}</span>
        )}
        {p.estado === "PENDIENTE" && p.programacion && !p.bye && !sinHora && !p.suspendido && (
          <span className="ml-auto shrink-0 capitalize">
            {fechaCorta(p.programacion.fecha)} {p.programacion.hora} · {pistaCorta(torneo, p.programacion.pista)}
          </span>
        )}
        {r?.tipo === "WO" && <span className="ml-auto font-semibold text-amber-200">W.O.</span>}
        {r?.tipo === "RETIRO" && <span className="ml-auto font-semibold text-amber-200">Retiro</span>}
        {r?.tipo === "DESCALIFICACION" && <span className="ml-auto font-semibold text-coral">Descalificación</span>}
      </div>
      <div className="space-y-1">
        <LineaDupla nombre={textoOrigen(torneo, p, "A")} sets={fin ? r?.sets : undefined} gana={ganaA} bye={p.origenA.tipo === "BYE"} />
        <LineaDupla nombre={textoOrigen(torneo, p, "B")} sets={fin ? r?.sets : undefined} gana={ganaB} bye={p.origenB.tipo === "BYE"} invertir />
      </div>
    </Comp>
  );
}

/* ---------- cargar resultado ---------- */

export function ResultadoHoja({ torneo, partidoId, onClose }: { torneo: Torneo; partidoId: string | null; onClose: () => void }) {
  const guardar = useTorneos((s) => s.guardar);
  const esStaff = useEsStaff();
  const p = partidoId ? torneo.categorias.flatMap((c) => c.cuadro?.partidos ?? []).find((x) => x.id === partidoId) : undefined;
  const reglas = p ? reglasDe(torneo, p) : null;
  const [sets, setSets] = useState<SetScore[]>([]);
  const [prog, setProg] = useState({ fecha: "", hora: "", pista: 1 });

  useEffect(() => {
    if (!p || !reglas) return;
    setSets(p.resultado?.sets.map((s) => ({ ...s })) ?? Array.from({ length: reglas.sets === 3 ? 2 : 1 }, () => ({ a: 0, b: 0 })));
    setProg({ fecha: p.programacion?.fecha ?? torneo.dias[0]?.fecha ?? "", hora: p.programacion?.hora ?? "09:00", pista: p.programacion?.pista ?? torneo.canchas[0]?.numero ?? 1 });
    // Solo al abrir otro partido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partidoId]);

  if (!p || !reglas) return <Hoja abierta={false} onClose={onClose} titulo="">{null}</Hoja>;
  const listo = !!p.duplaA && !!p.duplaB && !p.bye;
  const nA = textoOrigen(torneo, p, "A");
  const nB = textoOrigen(torneo, p, "B");
  const error = validarResultadoTorneo(reglas, sets);
  const necesarios = reglas.sets === 3 ? 2 : 1;
  const ganados = { a: sets.filter((s) => s.a > s.b).length, b: sets.filter((s) => s.b > s.a).length };
  const puedeOtroSet = reglas.sets === 3 && sets.length < 3 && ganados.a < necesarios && ganados.b < necesarios;

  const setVal = (i: number, lado: "a" | "b", d: number) => {
    vibrar(6);
    setSets((xs) => xs.map((s, k) => (k === i ? { ...s, [lado]: Math.max(0, s[lado] + d) } : s)));
  };

  return (
    <Hoja
      abierta={!!partidoId}
      onClose={onClose}
      titulo={p.etiqueta}
      sub={`${nombreCorto(categoria(torneo, p.categoriaId)!.categoria)} · ${nA} vs ${nB}`}
      pie={
        esStaff && listo ? (
          <div className="space-y-2">
            <Link href={`/torneos/${torneo.id}/anotar/${encodeURIComponent(p.id)}`} className="btn-neon w-full text-base">
              <Radio className="size-5" /> Anotar punto a punto
            </Link>
            {p.estado !== "PENDIENTE" && (
              <Link href={`/torneos/${torneo.id}/partido/${encodeURIComponent(p.id)}`} className="btn-ghost w-full">
                <BarChart3 className="size-4" /> Ver partido y estadísticas
              </Link>
            )}
            <button
              className="btn-ghost w-full"
              disabled={!!error}
              onClick={() => {
                guardar(cargarResultado(torneo, p.id, { sets, ganador: ganadorDe(sets), tipo: "NORMAL" }));
                toast(`Resultado guardado: ${textoSets(sets)}`);
                onClose();
              }}
            >
              Guardar resultado final {error ? "" : textoSets(sets)}
            </button>
          </div>
        ) : null
      }
    >
      {!listo ? (
        <p className="rounded-2xl bg-white/5 p-4 text-sm text-white/60">{p.bye ? "Pase directo (bye): no se juega." : "Todavía no se conocen las dos duplas de este partido."}</p>
      ) : !esStaff ? (
        <>
          <MatchCard torneo={torneo} p={p} />
          {p.estado !== "PENDIENTE" && (
            <Link href={`/torneos/${torneo.id}/partido/${encodeURIComponent(p.id)}`} className="btn-neon mt-4 w-full text-base">
              <BarChart3 className="size-5" /> Ver partido y estadísticas
            </Link>
          )}
        </>
      ) : (
        <>
          <div className="space-y-3">
            {sets.map((s, i) => (
              <div key={i} className="glass rounded-2xl p-3">
                <p className="mb-2 text-xs font-semibold text-white/50">{esSuperTie(reglas, i) ? "Súper tie-break" : `Set ${i + 1}`}</p>
                {(["a", "b"] as const).map((lado) => (
                  <div key={lado} className="flex items-center gap-3 py-1">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{lado === "a" ? nA : nB}</span>
                    <button className="btn-ghost !p-2" onClick={() => setVal(i, lado, -1)} aria-label="Restar">
                      <Minus className="size-4" />
                    </button>
                    <span className="w-8 text-center font-display text-2xl font-bold tabular">{s[lado]}</span>
                    <button className="btn-ghost !p-2" onClick={() => setVal(i, lado, 1)} aria-label="Sumar">
                      <Plus className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            {puedeOtroSet && (
              <button className="btn-ghost flex-1 !py-2 text-xs" onClick={() => setSets((xs) => [...xs, { a: 0, b: 0 }])}>
                <Plus className="size-3.5" /> {esSuperTie(reglas, sets.length) ? "Súper tie-break" : "Tercer set"}
              </button>
            )}
            {sets.length > necesarios && (
              <button className="btn-ghost flex-1 !py-2 text-xs" onClick={() => setSets((xs) => xs.slice(0, -1))}>
                <Minus className="size-3.5" /> Quitar set
              </button>
            )}
          </div>
          {error && sets.some((s) => s.a + s.b > 0) && <p className="mt-2 text-xs text-coral">{error}</p>}

          <p className="label mt-5">No se presentó (W.O.)</p>
          <div className="grid grid-cols-2 gap-2">
            {(["A", "B"] as const).map((l) => (
              <button
                key={l}
                className="btn-ghost !py-2 text-xs"
                onClick={() => {
                  if (!confirm(`¿W.O.? No se presentó ${l === "A" ? nA : nB}.`)) return;
                  guardar(cargarWO(torneo, p.id, l === "A" ? "B" : "A"));
                  onClose();
                }}
              >
                <Flag className="size-3.5" /> {l === "A" ? nA : nB}
              </button>
            ))}
          </div>

          {p.estado !== "FINALIZADO" && (
            <>
              <p className="label mt-5">Retiro por lesión (con el marcador de arriba)</p>
              <div className="grid grid-cols-2 gap-2">
                {(["A", "B"] as const).map((l) => (
                  <button
                    key={l}
                    className="btn-ghost !py-2 text-xs"
                    onClick={() => {
                      const sale = l === "A" ? nA : nB;
                      if (!confirm(`¿Se retira ${sale}? El partido se da por terminado con el marcador cargado y avanza la otra dupla.`)) return;
                      const gana = l === "A" ? "B" : "A";
                      guardar(cargarResultado(torneo, p.id, resultadoRetiro(reglas, sets.filter((s) => s.a + s.b > 0), gana), "Staff"));
                      toast(`Retiro de ${sale}: avanza ${gana === "A" ? nA : nB}`);
                      onClose();
                    }}
                  >
                    <Flag className="size-3.5" /> Se retira {l === "A" ? nA : nB}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-white/40">Si la dupla no sigue en el torneo, retírala en Inscritos: sus partidos pendientes quedan como W.O.</p>
            </>
          )}

          <p className="label mt-5">Horario</p>
          <div className="flex flex-wrap gap-2">
            <select className="input !w-auto !py-2" value={prog.fecha} onChange={(e) => setProg({ ...prog, fecha: e.target.value })}>
              {torneo.dias.map((d) => (
                <option key={d.fecha} value={d.fecha}>
                  {fechaCorta(d.fecha)}
                </option>
              ))}
            </select>
            <input type="time" step={900} className="input !w-auto !py-2" value={prog.hora} onChange={(e) => setProg({ ...prog, hora: e.target.value })} />
            <select className="input !w-auto !py-2" value={prog.pista} onChange={(e) => setProg({ ...prog, pista: Number(e.target.value) })}>
              {torneo.canchas.filter((c) => c.activa).map((c) => (
                <option key={c.numero} value={c.numero}>
                  {nombrePista(torneo, c.numero)}
                </option>
              ))}
            </select>
            <button
              className="btn-ghost !py-2"
              onClick={() => {
                guardar(moverPartido(torneo, p.id, prog));
                toast("Partido movido. Queda fijo al reprogramar.");
              }}
            >
              <CalendarClock className="size-4" /> Mover
            </button>
          </div>
          {p.estado === "FINALIZADO" && (
            <button
              className="btn-ghost mt-5 w-full !text-coral"
              onClick={() => {
                if (!confirm("¿Borrar el resultado? Si la dupla ya avanzó en la llave, ese partido se anula.")) return;
                guardar(borrarResultado(torneo, p.id));
                onClose();
              }}
            >
              <Trash2 className="size-4" /> Borrar resultado
            </button>
          )}
          {p.programacion && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-white/45">
              <MapPin className="size-3.5" /> Programado: {fechaCorta(p.programacion.fecha)} {p.programacion.hora} · {nombrePista(torneo, p.programacion.pista)}
              {p.programacion.fijo ? " · fijado a mano" : ""}
            </p>
          )}
        </>
      )}
    </Hoja>
  );
}
