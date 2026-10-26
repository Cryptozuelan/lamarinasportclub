"use client";

import clsx from "clsx";
import Link from "next/link";
import { Fragment, use, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Clock, Flag, Info, Share2, Trophy } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { TorneoShell } from "@/components/torneo/TorneoShell";
import { useAhora, useMarcadoresEnVivo } from "@/components/torneo/vivo";
import { useFotoDupla, useFotosTorneo } from "@/lib/fotos";
import { toast } from "@/components/ui/Toaster";
import { nombreCorto } from "@/lib/torneo/categorias";
import { nombrePista } from "@/lib/torneo/imprevistos";
import { calcularMarcador, NOMBRE_FIN, NOMBRE_GOLPE, pct, setsFinales, statsPartido, type EstadoMarcador, type Lado, type PuntoJugado, type StatsJugador } from "@/lib/torneo/marcador";
import { textoSets } from "@/lib/torneo/tabla";
import { categoria, dupla, nombreDupla, nombreJugador, partido } from "@/lib/torneo/torneo";
import { useMarcador } from "@/lib/torneosStore";
import type { MarcadorVivo, PartidoTorneo, Torneo } from "@/types/torneo";

/**
 * Página de un partido para los atletas (detrás de la clave del torneo): marcador en vivo,
 * comparativa de las duplas, tabla por jugador y el punto a punto completo.
 */
export default function PartidoPage({ params }: { params: Promise<{ id: string; pid: string }> }) {
  const { id, pid } = use(params);
  return (
    <TorneoShell id={id} ancho="max-w-3xl">
      {(t) => <Partido torneo={t} partidoId={decodeURIComponent(pid)} />}
    </TorneoShell>
  );
}

const COLOR: Record<Lado, string> = { A: "text-lima", B: "text-cielo" };
const BARRA: Record<Lado, string> = { A: "bg-lima", B: "bg-cielo" };

function Partido({ torneo, partidoId }: { torneo: Torneo; partidoId: string }) {
  const p = partido(torneo, partidoId);
  useMarcadoresEnVivo(torneo.id, p?.estado === "EN_JUEGO" ? 2500 : 15000);
  useFotosTorneo(torneo.id);
  const m = useMarcador(partidoId);
  const e = useMemo(() => (m ? calcularMarcador(m) : null), [m]);

  if (!p || p.bye) return <p className="mt-10 text-center text-white/60">Partido no encontrado.</p>;
  const nombreLado = (l: Lado) => nombreDupla(torneo, dupla(torneo, l === "A" ? p.duplaA : p.duplaB));

  return (
    <div className="mt-2 space-y-4 pb-10">
      <Link href={`/torneos/${torneo.id}/cuadros`} className="inline-flex items-center gap-1.5 text-sm text-white/55 hover:text-white">
        <ArrowLeft className="size-4" /> Cuadros
      </Link>
      <Cabecera torneo={torneo} p={p} m={m} e={e} nombreLado={nombreLado} />
      {m && e && m.puntos.length > 0 ? (
        <>
          <Comparativa m={m} e={e} />
          <Jugadores torneo={torneo} m={m} />
          <PuntoAPunto torneo={torneo} m={m} e={e} nombreLado={nombreLado} />
        </>
      ) : (
        <div className="glass flex flex-col items-center gap-2 rounded-3xl p-8 text-center text-white/60">
          <Info className="size-6 text-neon" />
          {p.estado === "FINALIZADO" ? "Este partido no se anotó punto a punto: solo está el resultado." : "Las estadísticas aparecen en cuanto el árbitro empiece a anotar."}
        </div>
      )}
    </div>
  );
}

/* ---------- marcador ---------- */

function Cabecera({ torneo, p, m, e, nombreLado }: { torneo: Torneo; p: PartidoTorneo; m?: MarcadorVivo; e: EstadoMarcador | null; nombreLado: (l: Lado) => string }) {
  const ahora = useAhora(30_000);
  const vivo = p.estado === "EN_JUEGO" && !!e && !e.terminado;
  const sets = e ? setsFinales(e) : (p.resultado?.sets ?? []);
  const ganador = e?.terminado ? e.ganador : p.resultado?.ganador;
  const pista = p.pistaReal ?? p.programacion?.pista;
  const min = p.inicioEn ? Math.round(((p.finEn ? new Date(p.finEn).getTime() : ahora) - new Date(p.inicioEn).getTime()) / 60_000) : null;
  const compartir = async () => {
    const texto = `${nombreLado("A")} vs ${nombreLado("B")} · ${torneo.nombre}`;
    try {
      if (navigator.share) await navigator.share({ title: texto, url: location.href });
      else {
        await navigator.clipboard.writeText(location.href);
        toast("Enlace copiado", "info");
      }
    } catch {
      /* canceló */
    }
  };

  return (
    <section className={clsx("relative overflow-hidden rounded-[2rem] border p-5 sm:p-6", vivo ? "seleccion sobre-marca" : "glass")}>
      <div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-marca-2/30 blur-3xl" />
      <div className="relative flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
        {vivo ? (
          <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-neon">
            <span className="size-2 animate-pulse rounded-full bg-neon" /> En vivo
          </span>
        ) : p.estado === "FINALIZADO" ? (
          <span className="text-lima">Final</span>
        ) : (
          <span>{p.programacion ? `Programado ${p.programacion.hora}` : "Por programar"}</span>
        )}
        <span>·</span>
        <span className="truncate">
          {nombreCorto(categoria(torneo, p.categoriaId)!.categoria)} · {p.etiqueta}
          {pista ? ` · ${nombrePista(torneo, pista)}` : ""}
        </span>
        <button className="ml-auto rounded-full p-1.5 text-white/60 hover:text-white" onClick={compartir} aria-label="Compartir">
          <Share2 className="size-4" />
        </button>
      </div>

      <div className="relative mt-4 space-y-2">
        {(["A", "B"] as const).map((l) => {
          const ids = (l === "A" ? m?.jugadoresA : m?.jugadoresB) ?? dupla(torneo, l === "A" ? p.duplaA : p.duplaB)?.jugadorIds ?? [];
          const saca = vivo && e?.equipoSaca === l;
          return (
            <div key={l} className={clsx("flex items-center gap-3 rounded-2xl px-3 py-2.5", ganador === l ? "bg-lima/10" : "bg-white/[0.03]")}>
              <span className={clsx("h-10 w-1.5 shrink-0 rounded-full", BARRA[l])} />
              <FotoDuplaMini torneoId={torneo.id} duplaId={l === "A" ? p.duplaA : p.duplaB} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-lg font-bold sm:text-xl">{nombreLado(l)}</p>
                <p className="flex flex-wrap gap-x-2 text-xs text-white/50">
                  {ids.map((id) => (
                    <span key={id} className={clsx(saca && e?.sacador === id && "font-semibold text-lima")}>
                      {saca && e?.sacador === id ? "● " : ""}
                      {torneo.jugadores.find((j) => j.id === id)?.nombre}
                    </span>
                  ))}
                </p>
              </div>
              {ganador === l && <Trophy className="size-5 shrink-0 text-lima" />}
              {sets.map((s, i) => {
                const actual = vivo && i === e!.setActual;
                const mio = l === "A" ? s.a : s.b;
                const suyo = l === "A" ? s.b : s.a;
                return (
                  <span key={i} className={clsx("w-7 text-center font-display text-2xl font-bold tabular", actual ? "text-white" : mio > suyo ? "text-lima" : "text-white/35")}>
                    {mio}
                  </span>
                );
              })}
              {vivo && (
                <motion.span key={`${e!.texto[l === "A" ? 0 : 1]}-${m!.puntos.length}`} initial={{ scale: 0.85 }} animate={{ scale: 1 }} className="w-12 rounded-xl bg-blanco/10 py-1 text-center font-display text-2xl font-bold tabular text-lima">
                  {e!.texto[l === "A" ? 0 : 1]}
                </motion.span>
              )}
            </div>
          );
        })}
      </div>

      <div className="relative mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/45">
        {min !== null && (
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" /> {Math.floor(min / 60) ? `${Math.floor(min / 60)} h ` : ""}
            {min % 60} min
          </span>
        )}
        {m?.anotador && (
          <span className="flex items-center gap-1">
            <Flag className="size-3.5" /> {(m.anotadores?.length ?? 0) > 1 ? `Árbitros: ${m.anotadores!.map((a) => a.nombre).join(" → ")}` : `Árbitro: ${m.anotador}`}
          </span>
        )}
        {p.resultado && p.resultado.tipo !== "NORMAL" && <span className="font-semibold text-amber-200">{p.resultado.tipo === "WO" ? "W.O." : p.resultado.tipo === "RETIRO" ? "Retiro" : "Descalificación"}</span>}
        {vivo && (e!.matchPoint || e!.setPoint || e!.puntoDeOro || e!.enTie) && (
          <span className="font-bold uppercase tracking-wider text-lima">
            {e!.matchPoint ? "Punto de partido" : e!.setPoint ? "Punto de set" : e!.puntoDeOro ? "Punto de oro" : e!.enSuperTie ? "Súper tie-break" : "Tie-break"}
          </span>
        )}
      </div>
    </section>
  );
}

/* ---------- comparativa ---------- */

/** Totales por dupla: lo individual se suma, lo de la dupla se toma una vez. */
function porDupla(stats: StatsJugador[], l: Lado) {
  const xs = stats.filter((s) => s.lado === l);
  const suma = (k: keyof StatsJugador) => xs.reduce((n, s) => n + (s[k] as number), 0);
  const uno = xs[0];
  return {
    puntos: uno?.puntosGanados ?? 0,
    jugados: uno?.puntosJugados ?? 0,
    alSaque: suma("ganadosAlSaque"),
    alSaqueDe: suma("puntosAlSaque"),
    alResto: uno?.ganadosAlResto ?? 0,
    alRestoDe: uno?.puntosAlResto ?? 0,
    primeros: suma("primerosDentro"),
    saques: suma("saques"),
    aces: suma("aces"),
    df: suma("doblesFaltas"),
    winners: suma("winners"),
    enf: suma("erroresNoForzados"),
    ef: suma("erroresForzados"),
    bp: uno?.breakPoints ?? 0,
    bpG: uno?.breaksConvertidos ?? 0,
    oro: uno?.puntosDeOro ?? 0,
    oroG: uno?.puntosDeOroGanados ?? 0,
    racha: uno?.rachaMax ?? 0,
  };
}

function Comparativa({ m, e }: { m: MarcadorVivo; e: EstadoMarcador }) {
  const stats = useMemo(() => statsPartido(m), [m]);
  const A = porDupla(stats, "A");
  const B = porDupla(stats, "B");
  const filas: { t: string; a: number; b: number; ta?: string; tb?: string; menosEsMejor?: boolean }[] = [
    { t: "Puntos ganados", a: A.puntos, b: B.puntos },
    { t: "Ganados al saque", a: pct(A.alSaque, A.alSaqueDe) ?? 0, b: pct(B.alSaque, B.alSaqueDe) ?? 0, ta: `${pct(A.alSaque, A.alSaqueDe) ?? 0}%`, tb: `${pct(B.alSaque, B.alSaqueDe) ?? 0}%` },
    { t: "Ganados al resto", a: pct(A.alResto, A.alRestoDe) ?? 0, b: pct(B.alResto, B.alRestoDe) ?? 0, ta: `${pct(A.alResto, A.alRestoDe) ?? 0}%`, tb: `${pct(B.alResto, B.alRestoDe) ?? 0}%` },
    { t: "1er saque dentro", a: pct(A.primeros, A.saques) ?? 0, b: pct(B.primeros, B.saques) ?? 0, ta: `${pct(A.primeros, A.saques) ?? 0}%`, tb: `${pct(B.primeros, B.saques) ?? 0}%` },
    { t: "Winners", a: A.winners, b: B.winners },
    { t: "Errores no forzados", a: A.enf, b: B.enf, menosEsMejor: true },
    { t: "Breaks", a: A.bpG, b: B.bpG, ta: `${A.bpG}/${A.bp}`, tb: `${B.bpG}/${B.bp}` },
    { t: "Puntos de oro", a: A.oroG, b: B.oroG, ta: `${A.oroG}/${A.oro}`, tb: `${B.oroG}/${B.oro}` },
    { t: "Aces", a: A.aces, b: B.aces },
    { t: "Dobles faltas", a: A.df, b: B.df, menosEsMejor: true },
    { t: "Racha máxima", a: A.racha, b: B.racha },
  ];
  return (
    <section className="glass rounded-[2rem] p-5">
      <p className="label">Partido · {e.jugados.length} puntos</p>
      <div className="mt-2 space-y-3">
        {filas.map((f) => {
          const total = f.a + f.b || 1;
          const mejorA = f.menosEsMejor ? f.a < f.b : f.a > f.b;
          const mejorB = f.menosEsMejor ? f.b < f.a : f.b > f.a;
          return (
            <div key={f.t}>
              <div className="flex items-baseline justify-between text-sm">
                <span className={clsx("w-14 font-display text-lg font-bold tabular", mejorA ? "text-lima" : "text-white/70")}>{f.ta ?? f.a}</span>
                <span className="text-xs text-white/55">{f.t}</span>
                <span className={clsx("w-14 text-right font-display text-lg font-bold tabular", mejorB ? "text-cielo" : "text-white/70")}>{f.tb ?? f.b}</span>
              </div>
              <div className="mt-1 flex h-1.5 gap-1">
                <div className="flex flex-1 justify-end overflow-hidden rounded-full bg-white/5">
                  <motion.div className="h-full rounded-full bg-lima" initial={{ width: 0 }} animate={{ width: `${(f.a / total) * 100}%` }} />
                </div>
                <div className="flex-1 overflow-hidden rounded-full bg-white/5">
                  <motion.div className="h-full rounded-full bg-cielo" initial={{ width: 0 }} animate={{ width: `${(f.b / total) * 100}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- jugadores ---------- */

function Jugadores({ torneo, m }: { torneo: Torneo; m: MarcadorVivo }) {
  const stats = useMemo(() => statsPartido(m), [m]);
  const orden = [...m.jugadoresA, ...m.jugadoresB];
  return (
    <section className="glass rounded-[2rem] p-5">
      <div className="flex items-center gap-2">
        <p className="label !mb-0">Jugadores</p>
        <span className="text-[11px] text-white/40">Toca un nombre para ver su torneo</span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-white/50">
              <th className="pb-2 text-left font-semibold" />
              <th className="w-14 pb-2 pl-2 text-center align-bottom font-semibold leading-tight">Winners</th>
              <th className="w-14 pb-2 pl-2 text-center align-bottom font-semibold leading-tight">E. forz.</th>
              <th className="w-14 pb-2 pl-2 text-center align-bottom font-semibold leading-tight">E. no forz.</th>
              <th className="w-14 pb-2 pl-2 text-center align-bottom font-semibold leading-tight">Aces</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {orden.map((id) => {
              const s = stats.find((x) => x.jugadorId === id);
              const j = torneo.jugadores.find((x) => x.id === id);
              if (!s) return null;
              return (
                <tr key={id}>
                  <td className="py-2.5 pr-2">
                    <Link href={`/torneos/${torneo.id}/estadisticas?jugador=${encodeURIComponent(id)}`} className="flex items-center gap-2 font-semibold hover:text-neon">
                      <span className={clsx("size-2 shrink-0 rounded-full", BARRA[s.lado])} />
                      <Avatar nombre={nombreJugador(j)} fotoUrl={j?.fotoUrl} size={26} />
                      <span className="truncate">{nombreJugador(j)}</span>
                    </Link>
                  </td>
                  <td className="py-2.5 pl-2 text-center font-display text-base font-bold tabular">{s.winners}</td>
                  <td className="py-2.5 pl-2 text-center font-display text-base font-bold tabular text-white/75">{s.erroresForzados}</td>
                  <td className="py-2.5 pl-2 text-center font-display text-base font-bold tabular text-white/75">{s.erroresNoForzados}</td>
                  <td className="py-2.5 pl-2 text-center font-display text-base font-bold tabular text-white/75">{s.aces}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------- punto a punto ---------- */

type Filtro = "TODOS" | "CLAVE" | number;

function PuntoAPunto({ torneo, m, e, nombreLado }: { torneo: Torneo; m: MarcadorVivo; e: EstadoMarcador; nombreLado: (l: Lado) => string }) {
  const [filtro, setFiltro] = useState<Filtro>("TODOS");
  const [verTodo, setVerTodo] = useState(false);
  const ladoDe = (id: string): Lado => (m.jugadoresA.includes(id) ? "A" : "B");
  const nombre = (id: string) => torneo.jugadores.find((j) => j.id === id)?.nombre ?? "";

  // Cambios de lado tras cada punto (games impares, fin de set impar y cada 6 puntos de tie-break).
  const cambios = useMemo(() => {
    const out = new Set<number>();
    let tie = 0;
    let setPrev = 0;
    for (const p of e.jugados) {
      if (p.setIndex !== setPrev) {
        tie = 0;
        setPrev = p.setIndex;
      }
      if (p.enTie && !p.evento) {
        tie++;
        if (tie % 6 === 0) out.add(p.n);
      }
      if (p.evento === "GAME" && (p.games.a + p.games.b) % 2 === 1) out.add(p.n);
      if (p.evento === "SET" && (p.games.a + p.games.b) % 2 === 1) out.add(p.n);
    }
    return out;
  }, [e.jugados]);

  const sets = [...new Set(e.jugados.map((p) => p.setIndex))];
  const clave = (p: PuntoJugado) => p.oro || p.breakPoint || !!p.evento;
  const lista = e.jugados.filter((p) => (filtro === "TODOS" ? true : filtro === "CLAVE" ? clave(p) : p.setIndex === filtro)).reverse();
  const visibles = verTodo ? lista : lista.slice(0, 40);
  const textoSetsFinal = textoSets(setsFinales(e).filter((s) => s.a + s.b > 0));

  return (
    <section className="glass rounded-[2rem] p-5">
      <p className="font-display text-lg font-bold">Punto a punto · {e.jugados.length} puntos</p>
      <div className="-mx-5 mt-3 flex gap-1.5 overflow-x-auto px-5 pb-1">
        {(["TODOS", ...sets, "CLAVE"] as Filtro[]).map((f) => (
          <button
            key={String(f)}
            onClick={() => setFiltro(f)}
            className={clsx("chip shrink-0 !py-1.5", filtro === f && "!border-neon/40 !bg-neon/10 !text-neon")}
          >
            {f === "TODOS" ? "Todos" : f === "CLAVE" ? "Momentos clave" : m.reglas.sets === 3 && m.reglas.superTie && f === 2 ? "Súper tie" : `Set ${f + 1}`}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {visibles.map((p) => (
          <Fragment key={p.n}>
            {p.evento === "PARTIDO" && (
              <p className="pt-1 text-xs font-bold uppercase tracking-[0.15em] text-lima">
                Partido para {nombreLado(p.gana)} · {textoSetsFinal}
              </p>
            )}
            {p.evento === "SET" && (
              <p className="pt-1 text-xs font-bold uppercase tracking-[0.15em] text-lima">
                Set para {nombreLado(p.gana)} · {p.games.a}-{p.games.b}
              </p>
            )}
            {cambios.has(p.n) && p.evento !== "PARTIDO" && <p className="py-1 text-center text-[11px] font-bold uppercase tracking-[0.2em] text-white/30">Cambio de lado</p>}
            <div className={clsx("flex items-start gap-3 rounded-2xl border-l-4 bg-white/[0.03] px-3 py-2.5", p.gana === "A" ? "border-lima" : "border-cielo")}>
              <p className="min-w-0 flex-1 text-sm leading-snug text-white/80">
                <Relato p={p} nombre={nombre} ladoDe={ladoDe} nombreLado={nombreLado} />
                {p.evento === "GAME" && (
                  <span className="mt-0.5 block text-xs font-semibold text-white/45">
                    Game {nombreLado(p.gana)} · {p.games.a}-{p.games.b}
                    {p.breakPoint && p.gana !== p.equipoSaca ? " · break" : ""}
                  </span>
                )}
              </p>
              <span className="shrink-0 text-right text-[11px] leading-tight text-white/35">
                #{p.n}
                <span className="block">{p.enTie ? `TB ${p.antes}` : p.antes}</span>
              </span>
            </div>
          </Fragment>
        ))}
        {!visibles.length && <p className="text-sm text-white/45">Nada con este filtro todavía.</p>}
        {!verTodo && lista.length > visibles.length && (
          <button className="btn-ghost w-full" onClick={() => setVerTodo(true)}>
            Ver los {lista.length} puntos
          </button>
        )}
      </div>
    </section>
  );
}

/** Relato con los nombres en el color de su dupla, como en la pantalla de la pista. */
function Relato({ p, nombre, ladoDe, nombreLado }: { p: PuntoJugado; nombre: (id: string) => string; ladoDe: (id: string) => Lado; nombreLado: (l: Lado) => string }) {
  const quien = p.jugadorId ? <span className={clsx("font-semibold", COLOR[ladoDe(p.jugadorId)])}>{nombre(p.jugadorId)}</span> : null;
  const para = <span className={clsx("font-semibold", COLOR[p.gana])}>{nombreLado(p.gana)}</span>;
  const extra = [p.oro ? "punto de oro" : null, p.breakPoint && p.gana !== p.equipoSaca ? "break" : null].filter(Boolean).join(" · ");
  let cuerpo: React.ReactNode;
  if (p.fin === "SANCION") cuerpo = <>Punto por sanción{quien && <> a {quien}</>}. Punto para {para}</>;
  else if (p.fin === "ACE") cuerpo = <>Ace de {quien}. Punto para {para}</>;
  else if (p.fin === "DOBLE_FALTA") cuerpo = <>Doble falta de {quien}. Punto para {para}</>;
  else if (p.fin === "WINNER") cuerpo = <>Winner de {quien}{p.golpe ? ` (${NOMBRE_GOLPE[p.golpe]})` : ""}. Punto para {para}</>;
  else if (p.fin) {
    const golpe = p.golpe && p.golpe !== "SAQUE" ? ` de ${NOMBRE_GOLPE[p.golpe]}` : "";
    const zona = p.zona ? (p.zona === "RED" ? " a la red" : " afuera") : "";
    cuerpo = (
      <>
        {quien}
        {quien ? ", " : ""}
        {NOMBRE_FIN[p.fin].toLowerCase()}
        {golpe}
        {zona}. Punto para {para}
      </>
    );
  } else cuerpo = <>Punto para {para}</>;
  return (
    <>
      {cuerpo}
      {extra && <span className="text-white/45"> · {extra}</span>}
    </>
  );
}

function FotoDuplaMini({ torneoId, duplaId }: { torneoId: string; duplaId: string | null }) {
  const url = useFotoDupla(torneoId, duplaId);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" className="h-11 w-14 shrink-0 rounded-xl object-cover" /> : null;
}
