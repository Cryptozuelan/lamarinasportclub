"use client";

import clsx from "clsx";
import { use, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Lightbulb, Search, Target, TrendingDown, TrendingUp, Zap } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Hoja } from "@/components/ui/Hoja";
import { TorneoShell } from "@/components/torneo/TorneoShell";
import { ResumenClub } from "@/components/torneo/ResumenClub";
import { useEsStaff } from "@/lib/store";
import { useMarcadoresEnVivo } from "@/components/torneo/vivo";
import { NOMBRE_GOLPE, pct, statsPartido, sumarStats, type StatsJugador } from "@/lib/torneo/marcador";
import { nombreJugador } from "@/lib/torneo/torneo";
import { useTorneos } from "@/lib/torneosStore";
import type { Golpe, Torneo } from "@/types/torneo";

export default function EstadisticasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TorneoShell id={id}>{(t) => <Estadisticas torneo={t} />}</TorneoShell>;
}

interface Fila {
  id: string;
  nombre: string;
  partidos: number;
  s: StatsJugador;
}

function Estadisticas({ torneo }: { torneo: Torneo }) {
  useMarcadoresEnVivo(torneo.id, 8000);
  const marcadores = useTorneos((s) => s.marcadores);
  const esStaff = useEsStaff();
  const [buscar, setBuscar] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  // ?jugador=ID abre directo su ficha (enlace desde la página de un partido).
  useEffect(() => {
    const j = new URLSearchParams(location.search).get("jugador");
    if (j) setAbierto(j);
  }, []);

  const filas = useMemo<Fila[]>(() => {
    const porJugador = new Map<string, StatsJugador[]>();
    for (const m of Object.values(marcadores)) {
      if (m.torneoId !== torneo.id || !m.puntos.length) continue;
      for (const s of statsPartido(m)) porJugador.set(s.jugadorId, [...(porJugador.get(s.jugadorId) ?? []), s]);
    }
    return [...porJugador.entries()].map(([id, lista]) => ({
      id,
      nombre: nombreJugador(torneo.jugadores.find((j) => j.id === id)),
      partidos: lista.length,
      s: sumarStats(lista)!,
    }));
  }, [marcadores, torneo]);

  const q = buscar.trim().toLowerCase();
  const visibles = filas.filter((f) => !q || f.nombre.toLowerCase().includes(q));
  const top = (fn: (f: Fila) => number, asc = false) => [...filas].filter((f) => f.s.puntosJugados >= 10).sort((a, b) => (asc ? fn(a) - fn(b) : fn(b) - fn(a))).slice(0, 5);
  const sel = filas.find((f) => f.id === abierto);

  if (!filas.length)
    return (
      <>
      {esStaff && <ResumenClub torneo={torneo} />}
      <div className="glass mt-6 flex flex-col items-center gap-3 rounded-3xl p-10 text-center text-white/60">
        <Target className="size-8 text-neon" />
        <p className="font-display text-xl font-semibold text-white">Las estadísticas aparecen cuando el staff anota punto a punto</p>
        <p className="max-w-md text-sm">Cada winner, error, ace y punto de oro queda guardado por jugador. Ideal para trabajar lo específico en clase.</p>
      </div>
      </>
    );

  return (
    <>
      {esStaff && <ResumenClub torneo={torneo} />}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Ranking titulo="Más winners" icon={Zap} filas={top((f) => f.s.winners)} valor={(f) => `${f.s.winners}`} onClick={setAbierto} />
        <Ranking titulo="% puntos ganados" icon={TrendingUp} filas={top((f) => f.s.puntosGanados / f.s.puntosJugados)} valor={(f) => `${pct(f.s.puntosGanados, f.s.puntosJugados)}%`} onClick={setAbierto} />
        <Ranking titulo="Menos errores no forzados" icon={TrendingDown} filas={top((f) => f.s.erroresNoForzados / f.partidos, true)} valor={(f) => `${(f.s.erroresNoForzados / f.partidos).toFixed(1)}/partido`} onClick={setAbierto} />
      </div>

      <label className="glass mt-6 flex items-center gap-2 rounded-xl px-3">
        <Search className="size-4 text-white/40" />
        <input className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-white/35" placeholder="Busca un jugador" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
      </label>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-white/40">
              <th className="py-2 text-left">Jugador</th>
              <th className="text-center">PJ</th>
              <th className="text-center">% Ptos</th>
              <th className="text-center">Winners</th>
              <th className="text-center">ENF</th>
              <th className="text-center">Aces</th>
              <th className="text-center">% 1er saque</th>
              <th className="text-center">Oro</th>
            </tr>
          </thead>
          <tbody>
            {visibles
              .sort((a, b) => b.s.winners - a.s.winners)
              .map((f) => (
                <tr key={f.id} className="cursor-pointer border-t border-white/5 hover:bg-white/[0.03]" onClick={() => setAbierto(f.id)}>
                  <td className="py-2">
                    <span className="flex items-center gap-2 font-semibold">
                      <Avatar nombre={f.nombre} size={28} /> {f.nombre}
                    </span>
                  </td>
                  <td className="text-center tabular text-white/60">{f.partidos}</td>
                  <td className="text-center tabular">{pct(f.s.puntosGanados, f.s.puntosJugados) ?? "—"}%</td>
                  <td className="text-center font-display font-bold tabular">{f.s.winners}</td>
                  <td className="text-center tabular">{f.s.erroresNoForzados}</td>
                  <td className="text-center tabular">{f.s.aces}</td>
                  <td className="text-center tabular">{pct(f.s.primerosDentro, f.s.saques) ?? "—"}%</td>
                  <td className="text-center tabular">
                    {f.s.puntosDeOroGanados}/{f.s.puntosDeOro}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <Hoja abierta={!!sel} onClose={() => setAbierto(null)} titulo={sel?.nombre ?? ""} sub={sel ? `${sel.partidos} partido(s) anotados en ${torneo.nombre}` : ""} ancho="max-w-2xl">
        {sel && <Ficha f={sel} />}
      </Hoja>
    </>
  );
}

function Ranking({ titulo, icon: Icon, filas, valor, onClick }: { titulo: string; icon: typeof Zap; filas: Fila[]; valor: (f: Fila) => string; onClick: (id: string) => void }) {
  return (
    <div className="glass rounded-3xl p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-neon" /> {titulo}
      </p>
      <ol className="mt-3 space-y-1.5">
        {filas.map((f, i) => (
          <li key={f.id}>
            <button className="flex w-full items-center gap-2 text-left text-sm" onClick={() => onClick(f.id)}>
              <span className={clsx("w-5 font-display font-bold", i === 0 ? "text-lima" : "text-white/40")}>{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{f.nombre}</span>
              <span className="font-display font-bold tabular">{valor(f)}</span>
            </button>
          </li>
        ))}
        {!filas.length && <li className="text-xs text-white/40">Hace falta más juego anotado.</li>}
      </ol>
    </div>
  );
}

/* ---------- ficha del jugador ---------- */

function Ficha({ f }: { f: Fila }) {
  const s = f.s;
  const ejes = [
    { l: "Puntos ganados", v: pct(s.puntosGanados, s.puntosJugados) ?? 0 },
    { l: "Al saque", v: pct(s.ganadosAlSaque, s.puntosAlSaque) ?? 0 },
    { l: "Al resto", v: pct(s.ganadosAlResto, s.puntosAlResto) ?? 0 },
    { l: "1er saque", v: pct(s.primerosDentro, s.saques) ?? 0 },
    { l: "Puntos de oro", v: pct(s.puntosDeOroGanados, s.puntosDeOro) ?? 0 },
    { l: "Breaks", v: pct(s.breaksConvertidos, s.breakPoints) ?? 0 },
  ];
  const golpes = (Object.entries(s.golpes) as [Golpe, { winners: number; errores: number }][]).sort((a, b) => b[1].winners + b[1].errores - (a[1].winners + a[1].errores));
  const max = Math.max(1, ...golpes.map(([, g]) => Math.max(g.winners, g.errores)));
  const mejor = [...golpes].sort((a, b) => b[1].winners - a[1].winners)[0];
  const peor = [...golpes].sort((a, b) => b[1].errores - a[1].errores)[0];
  const ratio = s.erroresNoForzados ? (s.winners / s.erroresNoForzados).toFixed(1) : s.winners ? "∞" : "—";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { v: s.winners, l: "Winners" },
          { v: s.erroresNoForzados, l: "Errores NF" },
          { v: s.aces, l: "Aces" },
          { v: ratio, l: "Winners por error" },
        ].map((x) => (
          <div key={x.l} className="glass rounded-2xl p-3">
            <p className="font-display text-2xl font-bold tabular">{x.v}</p>
            <p className="text-[11px] text-white/50">{x.l}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-2">
        <Radar ejes={ejes} />
        <ul className="space-y-1.5 text-sm">
          {ejes.map((e) => (
            <li key={e.l} className="flex justify-between gap-3">
              <span className="text-white/60">{e.l}</span>
              <span className="font-display font-bold tabular">{e.v}%</span>
            </li>
          ))}
          <li className="flex justify-between gap-3">
            <span className="text-white/60">Dobles faltas</span>
            <span className="font-display font-bold tabular">{s.doblesFaltas}</span>
          </li>
          <li className="flex justify-between gap-3">
            <span className="text-white/60">Mejor racha de su dupla</span>
            <span className="font-display font-bold tabular">{s.rachaMax} pts</span>
          </li>
        </ul>
      </div>

      {golpes.length > 0 && (
        <div>
          <div className="flex items-center justify-between">
            <p className="label !mb-0">Golpes que cierran puntos</p>
            <p className="flex gap-3 text-[11px] text-white/60">
              <span className="flex items-center gap-1"><i className="size-2.5 rounded-sm bg-lima" /> Winners</span>
              <span className="flex items-center gap-1"><i className="size-2.5 rounded-sm bg-coral" /> Errores</span>
            </p>
          </div>
          <ul className="mt-3 space-y-2">
            {golpes.map(([g, v]) => (
              <li key={g} className="grid grid-cols-[5.5rem_1fr] items-center gap-3 text-sm" title={`${NOMBRE_GOLPE[g]}: ${v.winners} winners, ${v.errores} errores`}>
                <span className="truncate capitalize text-white/70">{NOMBRE_GOLPE[g]}</span>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <motion.span initial={{ width: 0 }} animate={{ width: `${(v.winners / max) * 100}%` }} className="h-2 rounded-r bg-lima" />
                    <span className="text-xs tabular text-white/70">{v.winners}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <motion.span initial={{ width: 0 }} animate={{ width: `${(v.errores / max) * 100}%` }} className="h-2 rounded-r bg-coral" />
                    <span className="text-xs tabular text-white/70">{v.errores}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-lima/25 bg-lima/10 p-4 text-sm">
        <p className="flex items-center gap-2 font-semibold text-lima">
          <Lightbulb className="size-4" /> Para trabajar en clase
        </p>
        <ul className="mt-2 space-y-1 text-white/80">
          {mejor && mejor[1].winners > 0 && <li>Su golpe más efectivo: <b className="capitalize">{NOMBRE_GOLPE[mejor[0]]}</b> ({mejor[1].winners} winners).</li>}
          {peor && peor[1].errores > 0 && <li>Donde más falla: <b className="capitalize">{NOMBRE_GOLPE[peor[0]]}</b> ({peor[1].errores} errores).</li>}
          {s.saques > 0 && (pct(s.primerosDentro, s.saques) ?? 100) < 65 && <li>Primer saque por debajo del 65 %: trabajar regularidad antes que potencia.</li>}
          {s.puntosDeOro > 2 && (pct(s.puntosDeOroGanados, s.puntosDeOro) ?? 0) < 45 && <li>Pierde la mayoría de los puntos de oro: practicar la toma de decisión bajo presión.</li>}
          {!mejor && !peor && <li>Anota el golpe de cada punto (toque 3) para ver aquí sus fortalezas y fallas.</li>}
        </ul>
      </div>
    </div>
  );
}

/** Radar de 6 ejes (0–100 %). */
function Radar({ ejes }: { ejes: { l: string; v: number }[] }) {
  const R = 80;
  const c = 110;
  const pto = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / ejes.length;
    return [c + r * Math.cos(a), c + r * Math.sin(a)];
  };
  const poli = ejes.map((e, i) => pto(i, (R * Math.max(4, e.v)) / 100).join(",")).join(" ");
  return (
    <svg viewBox="0 0 220 220" className="mx-auto w-full max-w-64" role="img" aria-label="Radar de rendimiento">
      {[25, 50, 75, 100].map((n) => (
        <polygon key={n} points={ejes.map((_, i) => pto(i, (R * n) / 100).join(",")).join(" ")} fill="none" stroke="currentColor" className="text-white/10" />
      ))}
      {ejes.map((_, i) => {
        const [x, y] = pto(i, R);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="currentColor" className="text-white/10" />;
      })}
      <motion.polygon initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} style={{ transformOrigin: "110px 110px" }} points={poli} fill="rgb(207 243 91 / 0.22)" stroke="#cff35b" strokeWidth={2} strokeLinejoin="round" />
      {ejes.map((e, i) => {
        const [x, y] = pto(i, (R * Math.max(4, e.v)) / 100);
        return (
          <circle key={i} cx={x} cy={y} r={4} fill="#cff35b" stroke="#0c113d" strokeWidth={2}>
            <title>{`${e.l}: ${e.v}%`}</title>
          </circle>
        );
      })}
      {ejes.map((e, i) => {
        const [x, y] = pto(i, R + 16);
        return (
          <text key={e.l} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="fill-white/60 text-[8px] font-semibold">
            {e.l}
          </text>
        );
      })}
    </svg>
  );
}
