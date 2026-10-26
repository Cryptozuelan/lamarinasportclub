"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowLeftRight, Camera, Check, ChevronRight, CircleSlash, Flag, HeartPulse, MoreHorizontal, Play, ShieldAlert, Timer, Trophy, Undo2, X, Zap } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { FotoDupla, TomarFoto } from "@/components/Foto";
import { PelotaPadel } from "@/components/torneo/PelotaPadel";
import { AnotadorGate, useVolverAnotador } from "@/components/torneo/Arbitraje";
import { Hoja } from "@/components/ui/Hoja";
import { toast } from "@/components/ui/Toaster";
import { TorneoShellMinimo } from "@/components/torneo/minimo";
import { useAhora } from "@/components/torneo/vivo";
import { sonar, vibrar } from "@/lib/feedback";
import { subirFoto, useFotos, useFotosTorneo } from "@/lib/fotos";
import { otroLado, resolverSorteo, sortear, type LadoPista } from "@/lib/torneo/arbitros";
import { nombreCorto } from "@/lib/torneo/categorias";
import {
  ace,
  alternarOrdenSet,
  anotarPunto,
  atencionEnCurso,
  calcularMarcador,
  cambioDeLadoEnCurso,
  descansoReglamentario,
  deshacer,
  detallarUltimo,
  faltaSaque,
  ladoActual,
  NOMBRE_GOLPE,
  NOMBRE_SANCION,
  nuevoMarcador,
  ordenDelSet,
  pedirAtencion,
  peloteoTrasSuspension,
  proximaSancion,
  puedeElegirOrden,
  puedePedirAtencion,
  quitarUltimaSancion,
  relatoPunto,
  sancionar,
  setsFinales,
  statsPartido,
  type Lado,
} from "@/lib/torneo/marcador";
import { resultadoRetiro, textoSets } from "@/lib/torneo/tabla";
import { nombrePista } from "@/lib/torneo/imprevistos";
import { categoria, dupla, nombreDupla, partido, reglasDe } from "@/lib/torneo/torneo";
import { useArbitro } from "@/lib/arbitro";
import { useAmericanos } from "@/lib/store";
import { useMarcador, useTorneos } from "@/lib/torneosStore";
import type { EleccionSorteo, FinPunto, Golpe, JugadorTorneo, MarcadorVivo, PartidoTorneo, Torneo } from "@/types/torneo";

export default function AnotarPage({ params }: { params: Promise<{ id: string; pid: string }> }) {
  const { id, pid } = use(params);
  return (
    <AnotadorGate torneoId={id}>
      <TorneoShellMinimo id={id}>{(t) => <Anotador torneo={t} partidoId={decodeURIComponent(pid)} />}</TorneoShellMinimo>
    </AnotadorGate>
  );
}

const GOLPES: Golpe[] = ["REMATE", "X3", "X4", "VIBORA", "BANDEJA", "VOLEA", "GLOBO", "CHIQUITA", "BAJADA", "DRIVE", "REVES"];

const corto = (j?: JugadorTorneo) => (j ? j.nombre : "?");

function Anotador({ torneo, partidoId }: { torneo: Torneo; partidoId: string }) {
  const p = partido(torneo, partidoId);
  const marcador = useMarcador(partidoId);
  // Antes de ofrecer "empezar", trae el marcador del servidor: si el partido ya se está
  // anotando en otro teléfono, se sigue desde ahí en vez de empezar de cero.
  const [listo, setListo] = useState(false);
  useEffect(() => {
    useTorneos.getState().sincronizarMarcadores(torneo.id).finally(() => setListo(true));
  }, [torneo.id]);
  if (!p) return <p className="p-10 text-center text-white/60">Partido no encontrado.</p>;
  if (!p.duplaA || !p.duplaB) return <p className="p-10 text-center text-white/60">Todavía no se conocen las dos duplas.</p>;
  if (!marcador && !listo)
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <div className="size-10 animate-spin rounded-full border-2 border-white/10 border-t-neon" />
      </main>
    );
  if (!marcador) return <Preparar torneo={torneo} p={p} />;
  return <Tablero torneo={torneo} p={p} m={marcador} />;
}

/* ---------- 1. antes de empezar: fotos, sorteo, elección y saque ---------- */

type PasoPrevio = "fotos" | "sorteo" | "eleccion" | "lado" | "otra" | "saque1" | "saque2" | "listo";

function Preparar({ torneo, p }: { torneo: Torneo; p: PartidoTorneo }) {
  const guardarMarcador = useTorneos((s) => s.guardarMarcador);
  const accionPartido = useTorneos((s) => s.accionPartido);
  const staff = useAmericanos((s) => s.staff);
  const arbitro = useArbitro();
  const volver = useVolverAnotador(torneo.id);
  const fotos = useFotosTorneo(torneo.id);
  const dA = dupla(torneo, p.duplaA)!;
  const dB = dupla(torneo, p.duplaB)!;
  const jug = (id: string) => torneo.jugadores.find((j) => j.id === id);
  const nombre = (l: Lado) => nombreDupla(torneo, l === "A" ? dA : dB);
  const pista = p.pistaReal ?? p.programacion?.pista ?? torneo.canchas[0]?.numero ?? 1;

  const [paso, setPaso] = useState<PasoPrevio>(() => (fotos[dA.id] && fotos[dB.id] ? "sorteo" : "fotos"));
  const [gana, setGana] = useState<Lado | null>(null);
  const [eligio, setEligio] = useState<EleccionSorteo | null>(null);
  const [lado, setLado] = useState<LadoPista | null>(null);
  const [otraElige, setOtraElige] = useState<"SACAR" | "RESTAR" | null>(null);
  const [primero, setPrimero] = useState<string | null>(null);
  const [segundo, setSegundo] = useState<string | null>(null);
  const [historial, setHistorial] = useState<PasoPrevio[]>([]);

  const ir = (x: PasoPrevio) => {
    vibrar(10);
    setHistorial((h) => [...h, paso]);
    setPaso(x);
  };
  const atras = () => {
    const h = [...historial];
    const prev = h.pop();
    setHistorial(h);
    if (prev) setPaso(prev);
  };

  const plan = gana && eligio && lado ? resolverSorteo({ gana, eligio, lado, otraElige: otraElige ?? undefined }) : null;
  const saca = plan?.sacaPrimero ?? null;
  const eligeLado: Lado | null = gana && eligio ? (eligio === "LADO" ? gana : otroLado(gana)) : null;

  function empezar() {
    if (!plan || !primero || !segundo) return;
    const m = nuevoMarcador({
      partidoId: p.id,
      torneoId: torneo.id,
      categoriaId: p.categoriaId,
      reglas: reglasDe(torneo, p),
      jugadoresA: dA.jugadorIds,
      jugadoresB: dB.jugadorIds,
      sacaPrimero: plan.sacaPrimero,
      primerA: plan.sacaPrimero === "A" ? primero : segundo,
      primerB: plan.sacaPrimero === "B" ? primero : segundo,
      pista,
      anotador: staff?.nombre ?? arbitro?.nombre,
      arbitroId: staff ? "staff" : arbitro?.id,
      sorteo: gana && eligio ? { gana, eligio } : null,
      ladoInicialA: plan.ladoInicialA,
    });
    vibrar([10, 40, 10]);
    sonar("ok");
    guardarMarcador(m);
    accionPartido(torneo.id, p.id, { accion: "iniciar", pista }).then((err) => err && toast(err, "error"));
  }

  const Titulo = ({ t, sub }: { t: React.ReactNode; sub?: React.ReactNode }) => (
    <div className="mb-6 text-center">
      <h1 className="font-display text-3xl font-bold leading-tight sm:text-4xl">{t}</h1>
      {sub && <p className="mt-2 text-white/55">{sub}</p>}
    </div>
  );
  const Grande = ({ onClick, children, primario }: { onClick: () => void; children: React.ReactNode; primario?: boolean }) => (
    <button onClick={onClick} className={clsx("flex min-h-24 flex-1 flex-col items-center justify-center gap-2 rounded-3xl border p-5 text-lg font-bold transition active:scale-95", primario ? "seleccion sobre-marca text-lima" : "glass hover:border-neon/40")}>
      {children}
    </button>
  );
  const pasos: PasoPrevio[] = ["fotos", "sorteo", "eleccion", "lado", "saque1", "listo"];
  const iPaso = pasos.indexOf(paso === "otra" ? "lado" : paso === "saque2" ? "saque1" : paso);

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="flex items-center gap-3 py-2">
        {historial.length ? (
          <button className="btn-ghost !p-2.5" onClick={atras} aria-label="Atrás">
            <ArrowLeft className="size-5" />
          </button>
        ) : (
          <Link href={volver} className="btn-ghost !p-2.5" aria-label="Volver">
            <ArrowLeft className="size-5" />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {nombreCorto(categoria(torneo, p.categoriaId)!.categoria)} · {p.etiqueta}
          </p>
          <p className="text-xs text-white/50">{nombrePista(torneo, pista)} · Antes de empezar</p>
        </div>
        <div className="flex gap-1.5">
          {pasos.map((x, i) => (
            <span key={x} className={clsx("h-1.5 rounded-full transition-all", i === iPaso ? "w-6 bg-lima" : i < iPaso ? "w-2 bg-lima/60" : "w-2 bg-white/15")} />
          ))}
        </div>
      </header>

      <AnimatePresence mode="wait">
        <motion.section key={paso} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.2 }} className="flex flex-1 flex-col pt-6">
          {paso === "fotos" && (
            <>
              <Titulo t="Foto de las duplas" sub="Junto a la red, las dos juntas. Sale en la TV y en el partido de los atletas." />
              <div className="grid gap-4 sm:grid-cols-2">
                {(["A", "B"] as const).map((l) => {
                  const d = l === "A" ? dA : dB;
                  const js = d.jugadorIds.map(jug);
                  const url = fotos[d.id];
                  return (
                    <TomarFoto
                      key={l}
                      className="group relative block overflow-hidden rounded-[2rem] border border-white/10 text-left"
                      etiqueta={`Foto de ${nombre(l)}`}
                      onFoto={async (img) => {
                        const r = await subirFoto(torneo.id, "dupla", d.id, img);
                        if (r.url) useFotos.getState().poner(torneo.id, d.id, r.url);
                        else toast(r.error!, "error");
                      }}
                    >
                      <FotoDupla url={url} nombres={js.map((j) => j?.nombre ?? "?")} fotos={js.map((j) => j?.fotoUrl)} className="aspect-[4/3] w-full" avatar={64} />
                      <span className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/80 to-transparent p-4 pt-10">
                        <span className={clsx("h-6 w-1.5 rounded-full", l === "A" ? "bg-lima" : "bg-cielo")} />
                        <span className="min-w-0 flex-1 truncate font-display text-lg font-bold">{nombre(l)}</span>
                        <span className={clsx("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold", url ? "bg-white/15" : "bg-lima text-marino-2")}>
                          <Camera className="size-4" /> {url ? "Repetir" : "Tomar"}
                        </span>
                      </span>
                    </TomarFoto>
                  );
                })}
              </div>
              <button className={clsx("mt-auto w-full !py-5 text-lg", fotos[dA.id] || fotos[dB.id] ? "btn-neon" : "btn-ghost")} onClick={() => ir("sorteo")}>
                {fotos[dA.id] && fotos[dB.id] ? "Listo, al sorteo" : "Seguir sin foto"} <ChevronRight className="size-5" />
              </button>
            </>
          )}

          {paso === "sorteo" && (
            <Sorteo
              nombre={nombre}
              fotos={{ A: fotos[dA.id], B: fotos[dB.id] }}
              onGanador={(l) => {
                setGana(l);
                setEligio(null);
                setLado(null);
                setOtraElige(null);
                ir("eleccion");
              }}
            />
          )}

          {paso === "eleccion" && gana && (
            <>
              <Titulo t={<>Ganó <span className="text-lima">{nombre(gana)}</span></>} sub="¿Qué elige?" />
              <div className="flex flex-col gap-3 sm:flex-row">
                <Grande onClick={() => (setEligio("SACAR"), ir("lado"))}>
                  <Zap className="size-8 text-lima" /> Sacar
                </Grande>
                <Grande onClick={() => (setEligio("RESTAR"), ir("lado"))}>
                  <Undo2 className="size-8 -scale-x-100 text-cielo" /> Restar
                </Grande>
                <Grande onClick={() => (setEligio("LADO"), ir("lado"))}>
                  <ArrowLeftRight className="size-8 text-white/80" /> Elegir lado
                </Grande>
              </div>
              <p className="mt-5 text-center text-sm text-white/45">Reglamento FIP: quien gana el sorteo elige sacar, restar o el lado. La otra dupla elige lo que queda.</p>
            </>
          )}

          {paso === "lado" && eligeLado && (
            <>
              <Titulo t={<><span className={eligeLado === "A" ? "text-lima" : "text-cielo"}>{nombre(eligeLado)}</span>: ¿de qué lado empieza?</>} sub="Visto desde tu silla de árbitro." />
              <Cancha
                onElegir={(x) => {
                  setLado(x);
                  ir(eligio === "LADO" ? "otra" : "saque1");
                }}
              />
            </>
          )}

          {paso === "otra" && gana && (
            <>
              <Titulo t={<><span className={otroLado(gana) === "A" ? "text-lima" : "text-cielo"}>{nombre(otroLado(gana))}</span>: ¿saca o resta?</>} />
              <div className="flex flex-col gap-3 sm:flex-row">
                <Grande onClick={() => (setOtraElige("SACAR"), ir("saque1"))}>
                  <Zap className="size-8 text-lima" /> Sacar
                </Grande>
                <Grande onClick={() => (setOtraElige("RESTAR"), ir("saque1"))}>
                  <Undo2 className="size-8 -scale-x-100 text-cielo" /> Restar
                </Grande>
              </div>
            </>
          )}

          {(paso === "saque1" || paso === "saque2") && saca && (() => {
            const l = paso === "saque1" ? saca : otroLado(saca);
            const d = l === "A" ? dA : dB;
            return (
              <>
                <Titulo t={paso === "saque1" ? <>¿Quién saca primero en <span className={l === "A" ? "text-lima" : "text-cielo"}>{nombre(l)}</span>?</> : <>¿Y en <span className={l === "A" ? "text-lima" : "text-cielo"}>{nombre(l)}</span>, quién sacará?</>} sub={paso === "saque1" ? "Abre el partido sacando." : "Saca en el segundo game."} />
                <div className="grid grid-cols-2 gap-4">
                  {d.jugadorIds.map((id) => {
                    const j = jug(id);
                    return (
                      <button
                        key={id}
                        onClick={() => {
                          if (paso === "saque1") {
                            setPrimero(id);
                            ir("saque2");
                          } else {
                            setSegundo(id);
                            ir("listo");
                          }
                        }}
                        className="glass flex flex-col items-center gap-3 rounded-[2rem] p-6 transition hover:border-neon/40 active:scale-95"
                      >
                        <Avatar nombre={[j?.nombre, j?.apellido].join(" ")} fotoUrl={j?.fotoUrl} size={96} />
                        <span className="font-display text-xl font-bold">{corto(j)}</span>
                        <span className="text-sm text-white/45">{j?.apellido}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            );
          })()}

          {paso === "listo" && plan && primero && segundo && (
            <>
              <Titulo t="Todo listo" sub="Revisa y empieza." />
              <Cancha
                duplas={{
                  [plan.ladoInicialA]: { lado: "A" as Lado, nombre: nombre("A"), saca: plan.sacaPrimero === "A" ? corto(jug(primero)) : null, foto: fotos[dA.id] },
                  [plan.ladoInicialA === "IZQ" ? "DER" : "IZQ"]: { lado: "B" as Lado, nombre: nombre("B"), saca: plan.sacaPrimero === "B" ? corto(jug(primero)) : null, foto: fotos[dB.id] },
                }}
              />
              <ul className="mt-5 space-y-1.5 text-sm text-white/65">
                <li>
                  · Ganó el sorteo <b className="text-white">{nombre(gana!)}</b> y eligió {eligio === "SACAR" ? "sacar" : eligio === "RESTAR" ? "restar" : "lado"}.
                </li>
                <li>
                  · Saca <b className="text-white">{corto(jug(primero))}</b>; en el 2º game, <b className="text-white">{corto(jug(segundo))}</b>.
                </li>
                <li>· Los cambios de lado, el orden de saque y los descansos van solos.</li>
              </ul>
              <button className="btn-neon mt-auto w-full !py-6 text-xl" onClick={empezar}>
                <Play className="size-6" /> Empezar partido
              </button>
            </>
          )}
        </motion.section>
      </AnimatePresence>
    </main>
  );
}

/**
 * Sorteo con la pelota: un toque y la pelota rebota de un lado al otro hasta caer en una dupla.
 * Usa el azar criptográfico del dispositivo. Si ya lo sortearon con moneda o raqueta, se marca a mano.
 */
function Sorteo({ nombre, fotos, onGanador }: { nombre: (l: Lado) => string; fotos: Record<Lado, string | undefined>; onGanador: (l: Lado) => void }) {
  const [girando, setGirando] = useState(false);
  const [gano, setGano] = useState<Lado | null>(null);
  const [x, setX] = useState<number[]>([0]);
  const ancho = useRef<HTMLDivElement>(null);

  function lanzar() {
    if (girando || gano) return;
    const g = sortear();
    const w = (ancho.current?.clientWidth ?? 600) / 2 - 70;
    const signo = (l: Lado) => (l === "A" ? -1 : 1);
    // Rebotes que se van achicando y terminan del lado ganador.
    const camino = [0, -0.9 * w, 0.8 * w, -0.65 * w, 0.5 * w, -0.3 * w, signo(g) * 0.95 * w];
    setX(camino);
    setGirando(true);
    sonar("tap");
    vibrar([10, 60, 10, 60, 10, 60, 10]);
    setTimeout(() => {
      setGirando(false);
      setGano(g);
      sonar("ok");
      vibrar([30, 40, 80]);
    }, 2300);
  }

  return (
    <>
      <div className="mb-6 text-center">
        <h1 className="font-display text-3xl font-bold leading-tight sm:text-4xl">{gano ? <>Ganó <span className={gano === "A" ? "text-lima" : "text-cielo"}>{nombre(gano)}</span></> : "Sorteo"}</h1>
        <p className="mt-2 text-white/55">{gano ? "Elige qué hace: sacar, restar o el lado." : girando ? "La pelota decide…" : "Toca la pelota."}</p>
      </div>
      <div ref={ancho} className="relative grid grid-cols-2 gap-4">
        {(["A", "B"] as const).map((l) => (
          <motion.div
            key={l}
            animate={gano ? { scale: gano === l ? 1.04 : 0.96, opacity: gano === l ? 1 : 0.4 } : { scale: 1, opacity: 1 }}
            className={clsx("relative flex min-h-48 flex-col justify-end overflow-hidden rounded-[2rem] border p-5", gano === l ? "seleccion sobre-marca" : "glass")}
          >
            {fotos[l] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fotos[l]} alt="" className="absolute inset-0 size-full object-cover opacity-50" />
            )}
            <span className="absolute inset-0 bg-gradient-to-t from-marino-2/95 via-marino-2/30 to-transparent" />
            <span className={clsx("relative mb-2 h-1.5 w-10 rounded-full", l === "A" ? "bg-lima" : "bg-cielo")} />
            <span className="relative font-display text-xl font-bold leading-tight sm:text-2xl">{nombre(l)}</span>
            {gano === l && (
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="relative mt-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-lima px-3 py-1 text-sm font-bold text-marino-2">
                <Trophy className="size-4" /> Ganó el sorteo
              </motion.span>
            )}
          </motion.div>
        ))}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <motion.button
            type="button"
            onClick={lanzar}
            aria-label="Sortear con la pelota"
            className="pointer-events-auto relative size-32 rounded-full drop-shadow-[0_12px_30px_rgba(217,243,57,0.45)] sm:size-36"
            animate={
              girando
                ? { x, y: [0, -70, -10, -55, -10, -35, 0], rotate: 1080 }
                : gano
                  ? { x: x.at(-1), y: 0, rotate: 1080, scale: 0.55 }
                  : { x: 0, y: [0, -14, 0], rotate: 0, scale: 1 }
            }
            transition={girando ? { duration: 2.2, ease: "easeOut" } : gano ? { duration: 0.3 } : { y: { repeat: Infinity, duration: 1.6, ease: "easeInOut" } }}
          >
            <PelotaPadel className="size-full" />
            {!girando && !gano && <span className="absolute inset-0 animate-ping rounded-full border-2 border-lima/40" />}
          </motion.button>
        </div>
      </div>
      {gano ? (
        <div className="mt-auto grid grid-cols-3 gap-2 pt-6">
          <button className="btn-ghost" onClick={() => (setGano(null), setX([0]))}>
            Repetir
          </button>
          <button className="btn-neon col-span-2 !py-5 text-lg" onClick={() => onGanador(gano)}>
            Seguir <ChevronRight className="size-5" />
          </button>
        </div>
      ) : (
        <div className="mt-auto pt-8 text-center">
          <p className="mb-2 text-sm text-white/45">¿Ya lo sortearon con moneda o raqueta? Marca quién ganó:</p>
          <div className="grid grid-cols-2 gap-2">
            {(["A", "B"] as const).map((l) => (
              <button key={l} disabled={girando} className="btn-ghost !py-3 text-sm" onClick={() => onGanador(l)}>
                Ganó {nombre(l)}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** La pista vista desde la silla del árbitro: para elegir lado o para ver cómo empiezan. */
function Cancha({
  onElegir,
  duplas,
}: {
  onElegir?: (l: LadoPista) => void;
  duplas?: Partial<Record<LadoPista, { lado: Lado; nombre: string; saca: string | null; foto?: string }>>;
}) {
  return (
    <div className="relative grid aspect-[2/1] grid-cols-2 overflow-hidden rounded-[2rem] border-4 border-white/70 bg-gradient-to-b from-[#1f4fd1] to-[#163ba3]">
      {/* red */}
      <span className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-1.5 -translate-x-1/2 bg-white shadow-[0_0_12px_rgba(255,255,255,0.6)]" />
      {/* líneas de saque */}
      <span className="pointer-events-none absolute inset-y-0 left-[18%] w-0.5 bg-white/60" />
      <span className="pointer-events-none absolute inset-y-0 right-[18%] w-0.5 bg-white/60" />
      <span className="pointer-events-none absolute left-[18%] right-[18%] top-1/2 h-0.5 bg-white/60" />
      {(["IZQ", "DER"] as const).map((x) => {
        const d = duplas?.[x];
        const Comp = onElegir ? "button" : "div";
        return (
          <Comp
            key={x}
            onClick={onElegir ? () => onElegir(x) : undefined}
            className={clsx("relative flex flex-col items-center justify-center gap-2 p-4 text-center transition", onElegir && "hover:bg-white/10 active:bg-lima/25")}
          >
            {d?.foto && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.foto} alt="" className="absolute inset-0 size-full object-cover opacity-35" />
            )}
            {d ? (
              <>
                <span className={clsx("relative rounded-full px-3 py-1 font-display text-lg font-bold text-marino-2 sm:text-xl", d.lado === "A" ? "bg-lima" : "bg-cielo")}>{d.nombre}</span>
                {d.saca && (
                  <span className="relative flex items-center gap-1 rounded-full bg-black/40 px-3 py-1 text-sm font-semibold">
                    <Zap className="size-3.5 text-lima" /> Saca {d.saca}
                  </span>
                )}
              </>
            ) : (
              <span className="relative z-10 flex flex-col items-center rounded-2xl bg-marino-2/70 px-5 py-3 backdrop-blur">
                <span className="font-display text-2xl font-bold">{x === "IZQ" ? "Izquierda" : "Derecha"}</span>
                <span className="text-sm text-white/70">Toca este lado</span>
              </span>
            )}
          </Comp>
        );
      })}
    </div>
  );
}

/* ---------- 2. el tablero: un toque por punto ---------- */

interface Bandeja {
  /** Número del punto al que pertenece (si llega otro, se cierra sola). */
  n: number;
  gana: Lado;
  paso: "COMO" | "GOLPE";
}

function Tablero({ torneo, p, m }: { torneo: Torneo; p: PartidoTorneo; m: MarcadorVivo }) {
  const router = useRouter();
  const guardarMarcador = useTorneos((s) => s.guardarMarcador);
  const accionPartido = useTorneos((s) => s.accionPartido);
  const volver = useVolverAnotador(torneo.id);
  const e = useMemo(() => calcularMarcador(m), [m]);
  const [bandeja, setBandeja] = useState<Bandeja | null>(null);
  const [cerradoCambio, setCerradoCambio] = useState(-1);
  const [menu, setMenu] = useState(false);
  const [sancionDe, setSancionDe] = useState<Lado | null>(null);
  const ahora = useAhora(1000);
  const jug = (id: string) => torneo.jugadores.find((j) => j.id === id);
  const nombreLado = (l: Lado) => nombreDupla(torneo, dupla(torneo, l === "A" ? p.duplaA : p.duplaB));
  const ultimo = e.jugados.at(-1);
  const fotos = useFotosTorneo(torneo.id);

  // Partido que se reanuda (suspendido por lluvia, cambio de pista…): vuelve a estar en juego
  // en su pista nueva y sigue con el mismo marcador.
  useEffect(() => {
    if (p.estado === "EN_JUEGO" || p.estado === "FINALIZADO" || m.finalizado) return;
    const pista = p.pistaReal ?? p.programacion?.pista ?? m.pista ?? null;
    accionPartido(torneo.id, p.id, { accion: "iniciar", pista });
    if (pista !== m.pista) guardarMarcador({ ...m, pista, actualizadoEn: new Date().toISOString() });
    if (p.suspendido) {
      // FIP Regla 2.11–2.15: se sigue exactamente donde quedó; peloteo según cuánto duró la suspensión.
      const min = Math.round((Date.now() - new Date(p.suspendido.en).getTime()) / 60_000);
      const peloteo = peloteoTrasSuspension(min);
      toast(`Se reanuda: ${textoSets(setsFinales(e).filter((s) => s.a + s.b > 0)) || "0-0"} · ${peloteo ? `${peloteo} min de peloteo` : "sin peloteo"}`, "info");
    }
    // Solo al entrar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Avisos al anotador: cambio de lado, fin de set.
  const avisado = useRef(m.puntos.length);
  useEffect(() => {
    if (m.puntos.length <= avisado.current) {
      avisado.current = m.puntos.length;
      return;
    }
    avisado.current = m.puntos.length;
    if (ultimo?.evento === "SET") toast(`Set para ${nombreLado(ultimo.gana)}`, "info");
    if (e.cambioDeLado) {
      sonar("ok");
      vibrar([30, 60, 30]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.puntos.length]);

  function punto(l: Lado) {
    if (e.terminado) return;
    vibrar(15);
    sonar("tap");
    const nuevo = anotarPunto(m, l);
    guardarMarcador(nuevo);
    setBandeja({ n: nuevo.puntos.length, gana: l, paso: "COMO" });
  }

  function como(fin: FinPunto, jugadorId: string) {
    if (!bandeja || bandeja.n !== m.puntos.length) return;
    vibrar(8);
    guardarMarcador(detallarUltimo(m, { fin, jugadorId }));
    setBandeja({ ...bandeja, paso: "GOLPE" });
  }

  function golpe(g: Golpe) {
    vibrar(8);
    guardarMarcador(detallarUltimo(m, { golpe: g }));
    setBandeja(null);
  }

  function confirmar(tipo: "NORMAL" | "RETIRO" | "DESCALIFICACION" = "NORMAL", ganador?: Lado, marcador: MarcadorVivo = m) {
    const reglas = reglasDe(torneo, p);
    const est = marcador === m ? e : calcularMarcador(marcador);
    const resultado =
      tipo === "NORMAL"
        ? { sets: setsFinales(est), ganador: est.ganador!, tipo: "NORMAL" as const }
        : { ...resultadoRetiro(reglas, setsFinales(est).filter((s) => s.a + s.b > 0), ganador!), tipo };
    guardarMarcador({ ...marcador, finalizado: true, actualizadoEn: new Date().toISOString() });
    accionPartido(torneo.id, p.id, { accion: "resultado", resultado }).then((err) => err && toast(err, "error"));
    sonar("ok");
    toast(`Resultado guardado: ${textoSets(resultado.sets)}`);
    router.push(volver);
  }

  const Mitad = ({ lado }: { lado: Lado }) => {
    const i = lado === "A" ? 0 : 1;
    const saca = !e.terminado && e.equipoSaca === lado;
    const ids = lado === "A" ? m.jugadoresA : m.jugadoresB;
    const foto = fotos[(lado === "A" ? p.duplaA : p.duplaB) ?? ""];
    return (
      <motion.button
        layout
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
        onClick={() => punto(lado)}
        disabled={e.terminado}
        className={clsx(
          "relative flex flex-1 select-none flex-col items-center justify-center overflow-hidden rounded-[2rem] border active:scale-[0.985]",
          lado === "A" ? "border-lima/25 bg-gradient-to-br from-marino to-marino-2" : "border-cielo/25 bg-gradient-to-br from-[#122a6b] to-marino-2",
        )}
      >
        {foto && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={foto} alt="" className="pointer-events-none absolute inset-0 size-full object-cover opacity-30" />
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-marino-2/40 via-marino-2/70 to-marino-2/95" />
          </>
        )}
        <span className={clsx("pointer-events-none absolute inset-x-10 top-0 h-24 rounded-full blur-3xl", lado === "A" ? "bg-lima/15" : "bg-cielo/20")} />
        <span className={clsx("relative mb-2 rounded-full px-3 py-0.5 text-xs font-bold uppercase tracking-[0.18em]", lado === "A" ? "bg-lima/15 text-lima" : "bg-cielo/15 text-cielo")}>{nombreLado(lado)}</span>
        <span className="relative flex items-center gap-2 text-sm font-semibold text-white/75">
          {ids.map((id) => (
            <span key={id} className={clsx("flex items-center gap-1.5 rounded-full px-2 py-0.5", saca && e.sacador === id && "bg-lima text-marino-2")}>
              {saca && e.sacador === id && <Zap className="size-3" />}
              {corto(jug(id))}
            </span>
          ))}
        </span>
        <motion.span key={`${e.texto[i]}-${m.puntos.length}`} initial={{ scale: 0.8, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }} className="relative font-display text-[22vw] font-bold leading-none tabular landscape:text-[16vh] sm:text-8xl">
          {e.texto[i]}
        </motion.span>
        <span className="relative mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/40">Toca para punto</span>
      </motion.button>
    );
  };
  // Cada dupla se dibuja en el lado de la pista donde está (visto desde la silla) y se cambian solas.
  const izquierda: Lado = ladoActual(m, e, "A") === "IZQ" ? "A" : "B";

  const sets = setsFinales(e);
  const esMixto = categoria(torneo, p.categoriaId)?.categoria.rama === "MIXTO";
  const descanso = descansoReglamentario(e);
  const quedaDescanso = descanso && ultimo ? Math.ceil((new Date(ultimo.t).getTime() + descanso.segundos * 1000 - ahora) / 1000) : 0;
  const atencion = atencionEnCurso(m, ahora);
  const cambio = !e.terminado && !atencion && cerradoCambio !== m.puntos.length ? cambioDeLadoEnCurso(e, ahora) : null;
  const eligeOrden = puedeElegirOrden(e);
  const orden = ordenDelSet(m, e.setActual);
  const siguiente = orden[(orden.indexOf(e.sacador) + 1) % 4];
  const mmss = (seg: number) => `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")}`;

  function sancion(lado: Lado, motivo: string, directa = false) {
    const nivel = directa ? "DESCALIFICACION" : proximaSancion(m, lado);
    if (nivel === "DESCALIFICACION" && !confirm(`${NOMBRE_SANCION.DESCALIFICACION} de ${nombreLado(lado)}: pierde el partido. ¿Confirmas?`)) return;
    const r = sancionar(m, { lado, motivo, directa });
    setSancionDe(null);
    setMenu(false);
    vibrar([40, 40, 40]);
    if (r.nivel === "DESCALIFICACION") {
      confirmar("DESCALIFICACION", lado === "A" ? "B" : "A", r.marcador);
      return;
    }
    guardarMarcador(r.marcador);
    toast(`${NOMBRE_SANCION[r.nivel]} a ${nombreLado(lado)}${r.nivel === "PUNTO" ? ": punto para la otra dupla" : ""}`, r.nivel === "PUNTO" ? "error" : "info");
  }

  return (
    <main className="flex h-dvh flex-col gap-2 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))]">
      {/* Marcador */}
      <header className="glass flex items-center gap-2 rounded-2xl px-3 py-2">
        <Link href={volver} className="btn-ghost !p-2" aria-label="Salir">
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1 space-y-0.5">
          {(["A", "B"] as const).map((l) => (
            <div key={l} className="flex items-center gap-2 text-sm">
              <span className={clsx("size-1.5 rounded-full", e.equipoSaca === l && !e.terminado ? "bg-lima" : "bg-transparent")} />
              <span className="min-w-0 flex-1 truncate font-semibold">{nombreLado(l)}</span>
              {sets.map((s, j) => (
                <span key={j} className={clsx("w-5 text-center font-display tabular", j === e.setActual && !e.terminado ? "font-bold text-lima" : "text-white/55")}>
                  {l === "A" ? s.a : s.b}
                </span>
              ))}
            </div>
          ))}
        </div>
        <button className="btn-ghost !p-2" onClick={() => setMenu(true)} aria-label="Más opciones">
          <MoreHorizontal className="size-4" />
        </button>
      </header>

      <AnimatePresence>
        {!e.terminado && (e.puntoDeOro || e.matchPoint || e.setPoint || e.enTie) && (
          <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-center text-xs font-bold uppercase tracking-[0.2em] text-lima">
            {e.matchPoint ? `Punto de partido · ${nombreLado(e.matchPoint)}` : e.setPoint ? `Punto de set · ${nombreLado(e.setPoint)}` : e.puntoDeOro ? "Punto de oro" : e.enSuperTie ? "Súper tie-break" : "Tie-break"}
          </motion.p>
        )}
      </AnimatePresence>

      {!e.terminado && e.puntoDeOro && (
        <p className="-mt-1 text-center text-[11px] text-white/50">
          {esMixto ? "Resta el jugador del mismo sexo que el sacador, sin cambiar de lado." : "La dupla que resta elige de qué lado recibe, sin cambiar posiciones."}
        </p>
      )}

      {atencion && (
        <div className="flex items-center justify-center gap-2 rounded-2xl bg-coral/15 px-3 py-2 text-sm font-semibold text-coral">
          <HeartPulse className="size-4" />
          {atencion.atencion.tipo === "LESION" ? "Atención médica" : "Accidente"} · {corto(jug(atencion.atencion.jugadorId))} · {mmss(atencion.quedan)}
        </div>
      )}

      {!e.terminado && !atencion && descanso && !e.cambioDeLado && quedaDescanso > 0 && descanso.segundos >= 90 && (
        <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70">
          <Timer className="size-3.5 text-lima" /> {descanso.motivo} · {mmss(quedaDescanso)}
        </div>
      )}

      {eligeOrden && (
        <div className="glass flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2 text-xs">
          <span className="font-semibold text-white/60">Set {e.setActual + 1}: cada dupla elige quién saca</span>
          <button className="chip !py-1" onClick={() => guardarMarcador(alternarOrdenSet(m, e.setActual, e.equipoSaca))}>
            <Zap className="size-3 text-lima" /> Saca {corto(jug(e.sacador))} <ArrowLeftRight className="size-3" />
          </button>
          <button className="chip !py-1" onClick={() => guardarMarcador(alternarOrdenSet(m, e.setActual, e.equipoSaca === "A" ? "B" : "A"))}>
            Luego {corto(jug(siguiente))} <ArrowLeftRight className="size-3" />
          </button>
        </div>
      )}

      {e.terminado ? (
        <Final torneo={torneo} m={m} nombreLado={nombreLado} onConfirmar={() => confirmar()} onDeshacer={() => guardarMarcador(deshacer(m))} />
      ) : (
        <div className="relative flex flex-1 flex-col gap-2 landscape:flex-row">
          <Mitad key={izquierda} lado={izquierda} />
          <Mitad key={izquierda === "A" ? "B" : "A"} lado={izquierda === "A" ? "B" : "A"} />

          {/* Cambio de lado reglamentario: aviso grande con la cuenta regresiva. */}
          <AnimatePresence>
            {cambio && (
              <CambioDeLado key={m.puntos.length} cambio={cambio} onCerrar={() => setCerradoCambio(m.puntos.length)} />
            )}
          </AnimatePresence>

          {/* Toques 2 y 3, opcionales: no bloquean el siguiente punto. */}
          <AnimatePresence>
            {bandeja && bandeja.n === m.puntos.length && (
              <motion.div
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 40, opacity: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 36 }}
                className="glass-strong absolute inset-x-2 bottom-2 rounded-3xl p-3"
                onClick={(ev) => ev.stopPropagation()}
              >
                {bandeja.paso === "COMO" ? (
                  <div className="grid grid-cols-2 gap-3 pr-10">
                    <div>
                      <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-lima">Winner de</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(bandeja.gana === "A" ? m.jugadoresA : m.jugadoresB).map((id) => (
                          <button key={id} className="btn-ghost !flex-col !gap-1 !px-1 !py-3 text-sm" onClick={() => como("WINNER", id)}>
                            <Avatar nombre={corto(jug(id))} fotoUrl={jug(id)?.fotoUrl} size={40} />
                            {corto(jug(id))}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-coral">Error de</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(bandeja.gana === "A" ? m.jugadoresB : m.jugadoresA).map((id) => (
                          <div key={id} className="flex flex-col gap-1">
                            <button className="btn-ghost !flex-col !gap-1 !px-1 !py-3 text-sm" onClick={() => como("ERROR_NO_FORZADO", id)}>
                              <Avatar nombre={corto(jug(id))} fotoUrl={jug(id)?.fotoUrl} size={40} />
                              {corto(jug(id))}
                            </button>
                            <button className="rounded-xl bg-white/5 py-2 text-xs font-semibold text-white/65" onClick={() => como("ERROR_FORZADO", id)}>
                              forzado
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    {m.puntos.at(-1)?.fin?.startsWith("ERROR") && (
                      <div className="mb-2 flex items-center gap-1.5">
                        <p className="mr-1 text-[11px] font-bold uppercase tracking-wider text-white/50">¿Dónde?</p>
                        {(["RED", "AFUERA"] as const).map((z) => (
                          <button
                            key={z}
                            className={clsx("btn-ghost !px-3 !py-1.5 text-xs", m.puntos.at(-1)?.zona === z && "seleccion !text-lima")}
                            onClick={() => {
                              vibrar(8);
                              guardarMarcador(detallarUltimo(m, { zona: m.puntos.at(-1)?.zona === z ? null : z }));
                            }}
                          >
                            {z === "RED" ? "A la red" : "Afuera"}
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-white/50">¿Con qué golpe? (opcional)</p>
                    <div className="flex flex-wrap gap-2 pr-10">
                      {GOLPES.map((g) => (
                        <button key={g} className="btn-ghost !px-4 !py-2.5 text-sm capitalize" onClick={() => golpe(g)}>
                          {NOMBRE_GOLPE[g]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <button className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-full bg-white/10 text-white/70" onClick={() => setBandeja(null)} aria-label="Cerrar sin detalle">
                  <X className="size-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Saque y deshacer */}
      {!e.terminado && (
        <footer className="grid grid-cols-3 gap-2">
          <button className={clsx("btn-ghost !py-3.5", m.faltaPendiente && "!border-amber-300/60 !text-amber-200")} onClick={() => guardarMarcador(faltaSaque(m))}>
            <CircleSlash className="size-4" /> {m.faltaPendiente ? "2ª falta" : "Falta"}
          </button>
          <button
            className="btn-ghost !py-3.5"
            onClick={() => {
              vibrar(15);
              guardarMarcador(ace(m));
            }}
          >
            <Zap className="size-4" /> Ace
          </button>
          <button
            className="btn-ghost !py-3.5"
            disabled={!m.puntos.length && !m.faltaPendiente}
            onClick={() => {
              vibrar(20);
              setBandeja(null);
              guardarMarcador(deshacer(m));
            }}
          >
            <Undo2 className="size-4" /> Deshacer
          </button>
        </footer>
      )}
      {ultimo && !e.terminado && <p className="truncate text-center text-[11px] text-white/40">{relatoPunto(ultimo, (id) => corto(jug(id)), nombreLado)}</p>}

      <Hoja abierta={menu} onClose={() => setMenu(false)} titulo="Opciones del partido" sub={p.etiqueta}>
        <div className="space-y-2">
          <button
            className="btn-ghost w-full"
            onClick={() => {
              // Rota el orden de saque de una dupla (si se cargó mal quién sacaba).
              const [s0, s1, s2, s3] = m.ordenSaque;
              guardarMarcador({ ...m, ordenSaque: [s2, s1, s0, s3], actualizadoEn: new Date().toISOString() });
              setMenu(false);
              toast("Se cambió el sacador de la primera dupla.", "info");
            }}
          >
            <ArrowLeftRight className="size-4" /> Corregir quién saca (dupla que abrió)
          </button>
          <button
            className="btn-ghost w-full"
            onClick={() => {
              const [s0, s1, s2, s3] = m.ordenSaque;
              guardarMarcador({ ...m, ordenSaque: [s0, s3, s2, s1], actualizadoEn: new Date().toISOString() });
              setMenu(false);
              toast("Se cambió el sacador de la segunda dupla.", "info");
            }}
          >
            <ArrowLeftRight className="size-4" /> Corregir quién saca (otra dupla)
          </button>
          <p className="label !mt-5">Sanciones (FIP)</p>
          {(["A", "B"] as const).map((l) => (
            <button key={l} className="btn-ghost w-full !justify-between" onClick={() => {
                setMenu(false);
                setSancionDe(l);
              }}>
              <span className="flex items-center gap-2">
                <ShieldAlert className="size-4 text-amber-200" /> {nombreLado(l)}
              </span>
              <span className="text-xs text-white/50">Próxima: {NOMBRE_SANCION[proximaSancion(m, l)]}</span>
            </button>
          ))}
          {!!m.sanciones?.length && (
            <div className="rounded-2xl bg-white/5 p-3 text-xs text-white/60">
              {m.sanciones.map((x, i) => (
                <p key={i}>
                  {NOMBRE_SANCION[x.nivel]} · {nombreLado(x.lado)} · {x.motivo}
                </p>
              ))}
              <button className="mt-2 font-semibold text-lima" onClick={() => guardarMarcador(quitarUltimaSancion(m))}>
                Quitar la última
              </button>
            </div>
          )}

          <p className="label !mt-5">Atención médica (FIP)</p>
          <div className="grid grid-cols-2 gap-2">
            {[...m.jugadoresA, ...m.jugadoresB].map((id) => (
              <button
                key={id}
                className="btn-ghost !py-2 text-xs"
                disabled={!puedePedirAtencion(m, id, "LESION")}
                onClick={() => {
                  guardarMarcador(pedirAtencion(m, id, "LESION"));
                  setMenu(false);
                  toast(`Atención médica de 3 min para ${corto(jug(id))}`, "info");
                }}
              >
                <HeartPulse className="size-3.5" /> {corto(jug(id))}
                {!puedePedirAtencion(m, id, "LESION") && " · usada"}
              </button>
            ))}
          </div>
          <details className="text-xs text-white/50">
            <summary className="cursor-pointer py-1">Accidente ajeno al juego (hasta 15 min, no cuenta)</summary>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[...m.jugadoresA, ...m.jugadoresB].map((id) => (
                <button
                  key={id}
                  className="btn-ghost !py-2 text-xs"
                  onClick={() => {
                    guardarMarcador(pedirAtencion(m, id, "ACCIDENTE"));
                    setMenu(false);
                  }}
                >
                  {corto(jug(id))}
                </button>
              ))}
            </div>
          </details>
          <p className="text-[11px] text-white/40">Lesión: 3 min una vez por jugador, no se cede al compañero. Con una herida sangrante no se puede seguir jugando.</p>

          <p className="label !mt-5">Retiro por lesión</p>
          {(["A", "B"] as const).map((l) => (
            <button
              key={l}
              className="btn-ghost w-full !text-coral"
              onClick={() => {
                if (!confirm(`¿Se retira ${nombreLado(l)}? El partido se da a la otra dupla.`)) return;
                confirmar("RETIRO", l === "A" ? "B" : "A");
              }}
            >
              <Flag className="size-4" /> Se retira {nombreLado(l)}
            </button>
          ))}
        </div>
      </Hoja>

      <Hoja abierta={sancionDe !== null} onClose={() => setSancionDe(null)} titulo="Sanción" sub={sancionDe ? `${nombreLado(sancionDe)} · ${NOMBRE_SANCION[proximaSancion(m, sancionDe)]}` : undefined}>
        {sancionDe && (
          <div className="space-y-3">
            <p className="text-xs text-white/50">Tabla FIP: 1ª advertencia, 2ª pérdida de punto, 3ª descalificación. Se suman las de los dos jugadores de la dupla.</p>
            <div className="flex flex-wrap gap-2">
              {MOTIVOS_SANCION.map((mo) => (
                <button key={mo} className="btn-ghost !px-3 !py-2 text-xs" onClick={() => sancion(sancionDe, mo)}>
                  {mo}
                </button>
              ))}
            </div>
            <button className="btn-ghost w-full !text-coral" onClick={() => sancion(sancionDe, "Infracción muy grave", true)}>
              <ShieldAlert className="size-4" /> Infracción muy grave: descalificación directa
            </button>
          </div>
        )}
      </Hoja>
    </main>
  );
}

const MOTIVOS_SANCION = ["Demora en el juego", "Conducta antideportiva", "Obscenidad", "Abuso de pelota", "Abuso de pala o equipo", "Abuso verbal", "Indumentaria", "Consejos fuera de tiempo"];

function Final({ torneo, m, nombreLado, onConfirmar, onDeshacer }: { torneo: Torneo; m: MarcadorVivo; nombreLado: (l: Lado) => string; onConfirmar: () => void; onDeshacer: () => void }) {
  const e = calcularMarcador(m);
  const stats = statsPartido(m);
  const jug = (id: string) => torneo.jugadores.find((j) => j.id === id);
  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="seleccion sobre-marca rounded-[2rem] border p-6 text-center">
        <p className="label !text-lima">Partido terminado</p>
        <p className="font-display text-3xl font-bold">{nombreLado(e.ganador!)}</p>
        <p className="mt-1 font-display text-xl text-white/80">{textoSets(setsFinales(e), e.ganador === "B")}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {stats.map((s) => (
          <div key={s.jugadorId} className="glass rounded-2xl p-3 text-xs">
            <p className="mb-1 truncate font-semibold">{jug(s.jugadorId)?.nombre}</p>
            <p className="text-white/60">
              {s.winners} winners · {s.erroresNoForzados} ENF · {s.aces} aces
            </p>
          </div>
        ))}
      </div>
      <div className="mt-auto grid grid-cols-3 gap-2 pt-3">
        <button className="btn-ghost" onClick={onDeshacer}>
          <Undo2 className="size-4" /> Deshacer
        </button>
        <button className="btn-neon col-span-2 text-base" onClick={onConfirmar}>
          <Check className="size-5" /> Confirmar resultado
        </button>
      </div>
    </div>
  );
}

/** Aviso de cambio de lado con cuenta regresiva (FIP Regla 2: sin descanso tras el 1-0, 90 s en games impares, 120 s entre sets). */
function CambioDeLado({ cambio, onCerrar }: { cambio: NonNullable<ReturnType<typeof cambioDeLadoEnCurso>>; onCerrar: () => void }) {
  const total = cambio.directo ? 20 : cambio.segundos;
  const quedan = Math.max(0, cambio.quedan);
  const tiempo = !cambio.directo && cambio.quedan <= 0;
  const aviso = useRef(false);
  useEffect(() => {
    if (tiempo && !aviso.current) {
      aviso.current = true;
      sonar("alarma");
      vibrar([80, 60, 80]);
    }
  }, [tiempo]);
  const r = 44;
  const largo = 2 * Math.PI * r;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      role="status"
      aria-live="polite"
      className={clsx(
        "glass-strong absolute left-1/2 top-3 z-20 flex w-[min(30rem,calc(100%-1.5rem))] -translate-x-1/2 items-center gap-4 rounded-3xl border p-4 shadow-2xl",
        tiempo ? "border-coral/60" : "border-lima/50",
      )}
      onClick={(ev) => ev.stopPropagation()}
    >
      {cambio.directo ? (
        <motion.span animate={{ x: [-6, 6, -6] }} transition={{ repeat: Infinity, duration: 1.2 }} className="flex size-24 shrink-0 items-center justify-center rounded-full bg-lima text-marino-2">
          <ArrowLeftRight className="size-11" />
        </motion.span>
      ) : (
        <span className="relative size-24 shrink-0">
          <svg viewBox="0 0 100 100" className="size-full -rotate-90">
            <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="8" />
            <circle
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={tiempo ? "#ff6b6b" : "#c6ef3c"}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={largo}
              strokeDashoffset={largo * (1 - quedan / total)}
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
          <span className={clsx("absolute inset-0 flex items-center justify-center font-display text-2xl font-bold tabular", tiempo && "text-coral")}>
            {Math.floor(quedan / 60)}:{String(quedan % 60).padStart(2, "0")}
          </span>
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className={clsx("font-display text-2xl font-bold leading-tight", tiempo ? "text-coral" : "text-lima")}>
          {tiempo ? "¡Tiempo! A jugar" : cambio.directo ? "Cambien de lado ya" : "Cambio de lado"}
        </p>
        <p className="mt-0.5 text-sm text-white/65">
          {cambio.directo ? "Primer game del set: sin descanso." : tiempo ? "Se cumplió el descanso reglamentario." : `${cambio.segundos === 120 ? "Fin de set" : cambio.segundos === 90 ? "Game impar" : "Tie-break"}: descanso máximo ${cambio.segundos === 120 ? "2:00" : cambio.segundos === 90 ? "1:30" : `${cambio.segundos} s`}`}
        </p>
        <p className="mt-1 text-xs text-white/45">Las duplas ya se cambiaron en la pantalla.</p>
      </div>
      <button className="btn-ghost shrink-0 !p-2.5" onClick={onCerrar} aria-label="Cerrar aviso">
        <X className="size-5" />
      </button>
    </motion.div>
  );
}

