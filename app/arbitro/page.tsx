"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, CalendarClock, Camera, CloudRain, Flag, LogOut, Megaphone, Play, Tv, UserX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FotoDupla, TomarFoto } from "@/components/Foto";
import { Logo } from "@/components/Logo";
import { Hoja } from "@/components/ui/Hoja";
import { StaffChip } from "@/components/StaffGate";
import { ArbitroLogin, useTorneosConArbitros } from "@/components/torneo/Arbitraje";
import { MarcadorMini, useAhora, useMarcadoresEnVivo } from "@/components/torneo/vivo";
import { toast } from "@/components/ui/Toaster";
import { useArbitro, useArbitroStore } from "@/lib/arbitro";
import { vibrar } from "@/lib/feedback";
import { subirFoto, useFotoDupla, useFotos, useFotosTorneo } from "@/lib/fotos";
import { partidosDeTurno, relojClub, turnoActual, turnosDe } from "@/lib/torneo/arbitros";
import { nombreCorto } from "@/lib/torneo/categorias";
import { nombrePista } from "@/lib/torneo/imprevistos";
import { estadoPistas, limiteWO, type EstadoPista } from "@/lib/torneo/programacion";
import { categoria, dupla, nombreDupla } from "@/lib/torneo/torneo";
import { useEsStaff } from "@/lib/store";
import { useListaTorneos, useTorneo, useTorneos } from "@/lib/torneosStore";
import type { PartidoTorneo, Torneo, TurnoArbitro } from "@/types/torneo";

const PISTA_GUARDADA = "lamarina-arbitro-pista";

/**
 * Panel del árbitro: lo que se ve en la tablet de la esquina de cada pista.
 * Solo su pista: el partido en juego, el que está llamado y el siguiente. Sin cuadros,
 * horarios ni ajustes: eso es del staff.
 */
export default function ArbitroPage() {
  const arbitro = useArbitro();
  const esStaff = useEsStaff();
  const hidratado = useTorneos((s) => s.hidratado);
  const enCurso = useTorneosConArbitros();
  const salir = useArbitroStore((s) => s.salir);
  const [elegido, setElegido] = useState<string | null>(null);

  if (arbitro === undefined || esStaff === undefined || !hidratado)
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <div className="size-10 animate-spin rounded-full border-2 border-white/10 border-t-neon" />
      </main>
    );

  // Árbitro del club o staff: si hay un solo torneo en curso (o uno donde tiene turno hoy), entra directo.
  if (arbitro || esStaff) {
    const hoy = relojClub(Date.now()).fecha;
    const conTurno = arbitro ? enCurso.filter((t) => turnosDe(t, arbitro.id).some((x) => x.fecha === hoy)) : [];
    const id = elegido ?? (conTurno.length === 1 ? conTurno[0].id : enCurso.length === 1 ? enCurso[0].id : null);
    if (id) return <Panel torneoId={id} nombre={arbitro?.nombre ?? "Staff"} arbitroId={arbitro?.id} alCambiar={enCurso.length > 1 ? () => setElegido(null) : undefined} />;
  }

  return (
    <main className="min-h-dvh pb-16">
      <div className="sobre-marca relative overflow-hidden bg-marca pb-14 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="pointer-events-none absolute -right-24 -top-32 size-80 rounded-full bg-marca-2/50 blur-3xl" />
        <header className="relative mx-auto flex max-w-xl items-center gap-2 px-4 py-3">
          <Link href="/" className="btn-ghost !p-2.5" aria-label="Inicio">
            <ArrowLeft className="size-4" />
          </Link>
          <span className="flex-1" />
          {arbitro ? (
            <button className="btn-ghost !px-3 !py-2 text-xs" onClick={() => salir()}>
              <LogOut className="size-3.5" /> Salir ({arbitro.nombre.split(" ")[0]})
            </button>
          ) : (
            <StaffChip />
          )}
        </header>
        <div className="relative mx-auto max-w-xl px-6 pt-4">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-lima text-marino-2">
            <Flag className="size-7" />
          </span>
          <h1 className="mt-5 font-display text-4xl font-bold tracking-tight">{arbitro ? `Hola, ${arbitro.nombre.split(" ")[0]}` : "Árbitros"}</h1>
          <p className="mt-2 text-white/65">La tablet de la pista. Un toque por punto: el marcador de la pista, los televisores y las estadísticas de los atletas se actualizan al instante.</p>
        </div>
      </div>
      <div className="relative -mt-6 rounded-t-[2rem] bg-fondo px-4 pt-8">
        <div className="mx-auto flex max-w-xl flex-col items-center">
          {arbitro || esStaff ? (
            <div className="w-full space-y-2">
              <p className="label">¿Qué torneo vas a anotar?</p>
              {enCurso.map((t) => (
                <button key={t.id} className="glass w-full rounded-2xl px-5 py-4 text-left hover:border-neon/40" onClick={() => setElegido(t.id)}>
                  <span className="block font-display text-lg font-bold">{t.nombre}</span>
                  {arbitro && turnosDe(t, arbitro.id).length > 0 && <span className="block text-xs text-lima">Tienes {turnosDe(t, arbitro.id).length} turnos en este torneo</span>}
                </button>
              ))}
              {!enCurso.length && <p className="glass rounded-2xl p-5 text-center text-sm text-white/55">No hay torneos en curso. Cuando el staff cree uno, aparece aquí.</p>}
            </div>
          ) : (
            <>
              <ArbitroLogin />
              <p className="mt-6 max-w-sm text-center text-xs text-white/45">El PIN de árbitros te lo da el staff. Te registras una sola vez y sirve para todos los torneos del club.</p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function Panel({ torneoId, nombre, arbitroId, alCambiar }: { torneoId: string; nombre: string; arbitroId?: string; alCambiar?: () => void }) {
  const torneo = useTorneo(torneoId);
  const salir = useArbitroStore((s) => s.salir);
  const ahora = useAhora(1000);
  useMarcadoresEnVivo(torneoId, 4000);
  useFotosTorneo(torneoId);
  const [pista, setPista] = useState<number | null>(null);
  const [todas, setTodas] = useState(false);
  const [verTurnos, setVerTurnos] = useState(false);
  const turno = torneo && !torneo.bloqueado && arbitroId ? turnoActual(torneo, arbitroId, ahora) : null;
  const misTurnos = torneo && !torneo.bloqueado && arbitroId ? turnosDe(torneo, arbitroId) : [];

  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(`${PISTA_GUARDADA}:${torneoId}`));
      if (v) setPista(v);
    } catch {
      /* sin almacenamiento */
    }
  }, [torneoId]);
  // Con turno asignado, la tablet se pone sola en la pista que le toca.
  useEffect(() => {
    if (turno) setPista(turno.pista);
  }, [turno?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const elegir = (n: number) => {
    vibrar(8);
    setPista(n);
    try {
      localStorage.setItem(`${PISTA_GUARDADA}:${torneoId}`, String(n));
    } catch {
      /* nada */
    }
  };

  const pistas = useMemo(() => (torneo && !torneo.bloqueado ? estadoPistas(torneo, ahora) : []), [torneo, ahora]);
  if (!torneo || torneo.bloqueado)
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="size-10 animate-spin rounded-full border-2 border-white/10 border-t-neon" />
        <p className="text-sm text-white/50">Cargando el torneo…</p>
      </main>
    );
  const actual = pistas.find((e) => e.numero === pista) ?? null;
  const hoy = relojClub(ahora).fecha;
  const pistasHoy = new Set(misTurnos.filter((x) => x.fecha === hoy).map((x) => x.pista));
  const visibles = todas || !pistasHoy.size ? pistas : pistas.filter((e) => pistasHoy.has(e.numero) || e.numero === pista);

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 pb-10 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <header className="flex items-center gap-3 py-2">
        <Logo compacto className="size-10" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-bold leading-tight">{torneo.nombre}</p>
          <p className="flex items-center gap-1.5 text-xs text-white/55">
            <Flag className="size-3 text-lima" /> Árbitro · {nombre}
          </p>
        </div>
        <Link href={`/torneos/${torneo.id}/tv`} className="btn-ghost !p-2.5" title="Modo TV" aria-label="Modo TV">
          <Tv className="size-4" />
        </Link>
        {alCambiar ? (
          <button className="btn-ghost !px-3 !py-2 text-xs" onClick={alCambiar}>
            Cambiar torneo
          </button>
        ) : nombre !== "Staff" ? (
          <button
            className="btn-ghost !p-2.5"
            aria-label="Salir"
            title="Salir"
            onClick={() => confirm("¿Cerrar la sesión de árbitro en esta tablet?") && salir()}
          >
            <LogOut className="size-4" />
          </button>
        ) : null}
      </header>

      {arbitroId && (
        <button onClick={() => setVerTurnos(true)} className="glass mt-3 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition hover:border-neon/40">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-lima/15 text-lima">
            <CalendarClock className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            {turno ? (
              <>
                <span className="block font-semibold">
                  Tu turno: {nombrePista(torneo, turno.pista)} · {turno.desde}–{turno.hasta}
                </span>
                <span className="block text-xs text-white/50">
                  {(() => {
                    const ps = partidosDeTurno(torneo, turno);
                    const hechos = ps.filter((p) => p.estado === "FINALIZADO").length;
                    return `${ps.length} partidos · ${hechos} terminados`;
                  })()}
                </span>
              </>
            ) : misTurnos.length ? (
              <>
                <span className="block font-semibold">Ahora no tienes turno</span>
                <span className="block text-xs text-white/50">Toca para ver tus {misTurnos.length} turnos del torneo</span>
              </>
            ) : (
              <>
                <span className="block font-semibold">Sin turnos asignados</span>
                <span className="block text-xs text-white/50">El staff te asigna pista. Mientras, elige la pista donde estás.</span>
              </>
            )}
          </span>
          {misTurnos.length > 0 && <span className="chip shrink-0">{misTurnos.length} turnos</span>}
        </button>
      )}

      <p className="label mt-4">{pistasHoy.size && !todas ? "Tus pistas hoy" : "Pista"}</p>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {visibles.map((e) => (
          <button
            key={e.numero}
            onClick={() => elegir(e.numero)}
            className={clsx("relative shrink-0 rounded-2xl border px-4 py-2.5 text-left transition", e.numero === pista ? "seleccion sobre-marca" : "border-white/10 hover:border-neon/40")}
          >
            <span className={clsx("block font-display text-lg font-bold", e.numero === pista && "text-lima")}>{nombrePista(torneo, e.numero)}</span>
            <span className="block text-[11px] text-white/50">{e.suspendida ? "Suspendida" : e.enJuego ? "En juego" : e.llamado ? "Llamado" : e.siguiente ? `Sigue ${e.siguiente.programacion?.hora ?? ""}` : "Libre"}</span>
            {e.enJuego && <span className="absolute right-2 top-2 size-2 animate-pulse rounded-full bg-neon" />}
          </button>
        ))}
        {pistasHoy.size > 0 && (
          <button onClick={() => setTodas((v) => !v)} className="shrink-0 rounded-2xl border border-dashed border-white/15 px-4 py-2.5 text-sm text-white/55">
            {todas ? "Solo las mías" : "Otra pista"}
          </button>
        )}
      </div>

      <Hoja abierta={verTurnos} onClose={() => setVerTurnos(false)} titulo="Mis turnos" sub={`${nombre} · ${torneo.nombre}`}>
        <MisTurnos torneo={torneo} turnos={misTurnos} ahora={ahora} />
      </Hoja>

      <AnimatePresence mode="wait">
        {!actual ? (
          <motion.div key="elige" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass mt-6 flex flex-1 flex-col items-center justify-center rounded-[2rem] p-10 text-center">
            <Flag className="size-10 text-lima" />
            <p className="mt-4 font-display text-2xl font-bold">Elige tu pista</p>
            <p className="mt-1 max-w-xs text-sm text-white/55">Queda guardada en esta tablet. Verás solo los partidos de esa pista.</p>
          </motion.div>
        ) : (
          <motion.div key={actual.numero} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5 flex flex-1 flex-col gap-4">
            <PistaArbitro torneo={torneo} e={actual} ahora={ahora} />
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function MisTurnos({ torneo, turnos, ahora }: { torneo: Torneo; turnos: TurnoArbitro[]; ahora: number }) {
  if (!turnos.length) return <p className="py-6 text-center text-sm text-white/55">Todavía no tienes turnos. El staff los asigna en el torneo → Árbitros.</p>;
  const total = turnos.reduce((s, x) => s + partidosDeTurno(torneo, x).length, 0);
  const { fecha, hora } = relojClub(ahora);
  return (
    <div className="space-y-2">
      <p className="text-sm text-white/60">
        Te tocan <b className="text-white">{turnos.length} turnos</b> con <b className="text-white">{total} partidos</b> programados.
      </p>
      {turnos.map((x) => {
        const ps = partidosDeTurno(torneo, x);
        const paso = x.fecha < fecha || (x.fecha === fecha && x.hasta <= hora);
        const ahoraSi = x.fecha === fecha && x.desde <= hora && hora < x.hasta;
        return (
          <div key={x.id} className={clsx("flex items-center gap-3 rounded-2xl border px-4 py-3", ahoraSi ? "seleccion sobre-marca" : "border-white/10", paso && "opacity-50")}>
            <div className="w-24 shrink-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/50">{new Date(`${x.fecha}T12:00:00`).toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" })}</p>
              <p className="font-display font-bold tabular">
                {x.desde}–{x.hasta}
              </p>
            </div>
            <p className="min-w-0 flex-1 font-semibold">{nombrePista(torneo, x.pista)}</p>
            <span className="chip shrink-0">{ps.length} partidos</span>
          </div>
        );
      })}
    </div>
  );
}

function Duplas({ torneo, p }: { torneo: Torneo; p: PartidoTorneo }) {
  return (
    <div className="space-y-3">
      {[p.duplaA, p.duplaB].map((d, i) => (
        <FilaDupla key={i} torneo={torneo} duplaId={d} color={i === 0 ? "bg-lima" : "bg-cielo"} />
      ))}
    </div>
  );
}

/** Dupla con su foto; la cámara para tomarla está a un toque. */
function FilaDupla({ torneo, duplaId, color }: { torneo: Torneo; duplaId: string | null; color: string }) {
  const url = useFotoDupla(torneo.id, duplaId);
  const d = dupla(torneo, duplaId);
  const js = (d?.jugadorIds ?? []).map((id) => torneo.jugadores.find((j) => j.id === id));
  return (
    <div className="flex items-center gap-3">
      <span className={clsx("h-12 w-1.5 shrink-0 rounded-full", color)} />
      {duplaId && (
        <TomarFoto
          className="group relative shrink-0 overflow-hidden rounded-2xl"
          etiqueta={url ? "Repetir foto de la dupla" : "Foto de la dupla"}
          onFoto={async (img) => {
            const r = await subirFoto(torneo.id, "dupla", duplaId, img);
            if (r.url) {
              useFotos.getState().poner(torneo.id, duplaId, r.url);
              toast("Foto lista: ya se ve en la TV");
            } else toast(r.error!, "error");
          }}
        >
          <FotoDupla url={url} nombres={js.map((j) => j?.nombre ?? "?")} fotos={js.map((j) => j?.fotoUrl)} className="h-14 w-20 rounded-2xl" avatar={30} />
          <span className="absolute bottom-1 right-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white">
            <Camera className="size-3.5" />
          </span>
        </TomarFoto>
      )}
      <span className="min-w-0 font-display text-2xl font-bold leading-tight">{nombreDupla(torneo, d)}</span>
    </div>
  );
}

function Encabezado({ torneo, p, rotulo, vivo = false }: { torneo: Torneo; p: PartidoTorneo; rotulo: string; vivo?: boolean }) {
  return (
    <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
      {vivo && <span className="size-2 animate-pulse rounded-full bg-neon" />}
      <span className={vivo ? "text-neon" : "text-lima"}>{rotulo}</span>
      <span>·</span>
      <span className="truncate">
        {nombreCorto(categoria(torneo, p.categoriaId)!.categoria)} · {p.etiqueta}
      </span>
    </div>
  );
}

/** Lo que viene en esta pista según la programación, para que el árbitro sepa a quién esperar. */
function DespuesEnPista({ torneo, pista, excluir }: { torneo: Torneo; pista: number; excluir: string }) {
  const proximos = torneo.categorias
    .flatMap((c) => c.cuadro?.partidos ?? [])
    .filter((p) => p.id !== excluir && p.estado === "PENDIENTE" && p.programacion?.pista === pista)
    .sort((a, b) => `${a.programacion!.fecha} ${a.programacion!.hora}`.localeCompare(`${b.programacion!.fecha} ${b.programacion!.hora}`))
    .slice(0, 2);
  if (!proximos.length) return <div className="flex-1" />;
  return (
    <div className="mt-auto pt-6">
      <p className="label">Después en esta pista</p>
      <ul className="space-y-2">
        {proximos.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] px-4 py-3">
            <span className="font-display text-lg font-bold tabular-nums text-lima">{p.programacion!.hora}</span>
            <span className="min-w-0 flex-1 truncate text-sm">
              {p.duplaA && p.duplaB ? `${nombreDupla(torneo, dupla(torneo, p.duplaA))} vs ${nombreDupla(torneo, dupla(torneo, p.duplaB))}` : "Por definir"}
            </span>
            <span className="shrink-0 text-xs text-white/45">
              {nombreCorto(categoria(torneo, p.categoriaId)!.categoria)} · {p.etiqueta}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PistaArbitro({ torneo, e, ahora }: { torneo: Torneo; e: EstadoPista; ahora: number }) {
  const accionPartido = useTorneos((s) => s.accionPartido);
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const hacer = async (pid: string, a: Parameters<typeof accionPartido>[2], ok: string) => {
    setOcupado(true);
    vibrar(15);
    const err = await accionPartido(torneo.id, pid, a);
    setOcupado(false);
    toast(err ?? ok, err ? "error" : undefined);
  };
  const anotar = (p: PartidoTorneo) => `/torneos/${torneo.id}/anotar/${encodeURIComponent(p.id)}`;

  if (e.enJuego)
    return (
      <div className="seleccion sobre-marca flex flex-1 flex-col rounded-[2rem] border p-6">
        <Encabezado torneo={torneo} p={e.enJuego} rotulo="En juego" vivo />
        <MarcadorMini torneo={torneo} p={e.enJuego} grande />
        <DespuesEnPista torneo={torneo} pista={e.numero} excluir={e.enJuego.id} />
        <Link href={anotar(e.enJuego)} className="btn-neon mt-6 w-full !py-5 text-lg">
          <Play className="size-6" /> Seguir anotando
        </Link>
      </div>
    );

  if (e.llamado) {
    const p = e.llamado;
    const limite = limiteWO(torneo, p);
    const quedan = limite === null ? null : Math.ceil((limite - ahora) / 1000);
    const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    return (
      <div className="glass flex flex-1 flex-col rounded-[2rem] p-6">
        <Encabezado torneo={torneo} p={p} rotulo="Llamado a pista" />
        <Duplas torneo={torneo} p={p} />
        {quedan !== null && (
          <p className={clsx("mt-5 rounded-2xl px-4 py-3 text-center text-sm font-semibold", quedan > 0 ? "bg-white/5 text-white/70" : "bg-coral/15 text-coral")}>
            {quedan > 0 ? `Tolerancia FIP: W.O. posible en ${mmss(quedan)}` : "Pasó la tolerancia: si una dupla no está, se puede dar W.O."}
          </p>
        )}
        <DespuesEnPista torneo={torneo} pista={e.numero} excluir={p.id} />
        <Link href={anotar(p)} className="btn-neon mt-6 w-full !py-5 text-lg">
          <Play className="size-6" /> Empezar partido
        </Link>
        {quedan !== null && quedan <= 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(["A", "B"] as const).map((l) => {
              const ausente = nombreDupla(torneo, dupla(torneo, l === "A" ? p.duplaA : p.duplaB));
              return (
                <button
                  key={l}
                  disabled={ocupado}
                  className="btn-ghost !py-3 text-sm !text-coral"
                  onClick={() => confirm(`¿No se presentó ${ausente}? Pierde por W.O.`) && hacer(p.id, { accion: "wo", ganador: l === "A" ? "B" : "A" }, `W.O. registrado: no vino ${ausente}.`)}
                >
                  <UserX className="size-4" /> No vino {ausente}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (e.suspendida)
    return (
      <div className="glass flex flex-1 flex-col items-center justify-center rounded-[2rem] p-10 text-center">
        <CloudRain className="size-12 text-amber-200" />
        <p className="mt-4 font-display text-2xl font-bold">Pista suspendida</p>
        <p className="mt-1 text-sm text-white/55">{e.suspendida}. El staff avisa cuando se reanuda.</p>
      </div>
    );

  if (e.siguiente) {
    const p = e.siguiente;
    return (
      <div className="glass flex flex-1 flex-col rounded-[2rem] p-6">
        <Encabezado torneo={torneo} p={p} rotulo={p.programacion ? `Siguiente · ${p.programacion.hora}` : "Siguiente"} />
        <Duplas torneo={torneo} p={p} />
        <p className="mt-4 text-sm text-white/50">Cuando estén las duplas, llama a pista: empieza a correr la tolerancia y la pantalla de la pista los anuncia.</p>
        <div className="mt-auto grid grid-cols-2 gap-2 pt-6">
          <button disabled={ocupado} className="btn-ghost !py-4" onClick={() => hacer(p.id, { accion: "llamar", pista: e.numero }, "Llamado a pista.")}>
            <Megaphone className="size-5" /> Llamar a pista
          </button>
          <button
            disabled={ocupado}
            className="btn-neon !py-4"
            onClick={async () => {
              // Queda en esta pista (aunque estuviera programado en otra) y se abre el anotador.
              setOcupado(true);
              const err = await accionPartido(torneo.id, p.id, { accion: "llamar", pista: e.numero });
              setOcupado(false);
              if (err) toast(err, "error");
              else router.push(anotar(p));
            }}
          >
            <Play className="size-5" /> Empezar ya
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="glass flex flex-1 flex-col items-center justify-center rounded-[2rem] p-10 text-center">
      <Flag className="size-10 text-white/30" />
      <p className="mt-4 font-display text-2xl font-bold">Sin partidos por ahora</p>
      <p className="mt-1 text-sm text-white/55">Cuando haya uno listo para esta pista aparece aquí solo.</p>
    </div>
  );
}
