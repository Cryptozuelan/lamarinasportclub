"use client";

import clsx from "clsx";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ChevronRight, Delete, LockKeyhole, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Logo } from "@/components/Logo";
import { esArbitroDe, listarArbitros, useArbitro, useArbitroStore, type ArbitroLista } from "@/lib/arbitro";
import { sonar, vibrar } from "@/lib/feedback";
import { useAmericanos, useEsStaff } from "@/lib/store";
import { useListaTorneos, useTorneos } from "@/lib/torneosStore";

const ULTIMO = "lamarina-arbitro-ultimo";

function leerUltimo(): string | null {
  try {
    return localStorage.getItem(ULTIMO);
  } catch {
    return null;
  }
}
function guardarUltimo(id: string) {
  try {
    localStorage.setItem(ULTIMO, id);
  } catch {
    /* sin almacenamiento */
  }
}

/** Torneos que se pueden arbitrar: los que no terminaron. */
export function useTorneosConArbitros() {
  const hoy = new Date().toISOString().slice(0, 10);
  return useListaTorneos().filter((t) => t.estado !== "FINALIZADO" && (t.dias.at(-1)?.fecha ?? hoy) >= hoy);
}

/** Teclado numérico grande para el código de 4 dígitos: se envía solo al completar. */
export function PadCodigo({ largo = 4, onCompleto, error, ocupado }: { largo?: number; onCompleto: (c: string) => void; error?: string | null; ocupado?: boolean }) {
  const [c, setC] = useState("");
  const [sacudir, setSacudir] = useState(0);
  useEffect(() => {
    if (error) {
      setC("");
      setSacudir((n) => n + 1);
      vibrar([40, 40, 40]);
    }
  }, [error]);
  const tocar = (d: string) => {
    if (ocupado) return;
    vibrar(8);
    const n = (c + d).slice(0, largo);
    setC(n);
    if (n.length === largo) setTimeout(() => onCompleto(n), 120);
  };
  return (
    <div className="mx-auto w-full max-w-xs">
      <motion.div key={sacudir} animate={sacudir ? { x: [0, -10, 10, -6, 6, 0] } : undefined} transition={{ duration: 0.35 }} className="mb-5 flex justify-center gap-4">
        {Array.from({ length: largo }, (_, i) => (
          <span key={i} className={clsx("size-5 rounded-full border-2 transition", i < c.length ? "border-lima bg-lima" : "border-white/25")} />
        ))}
      </motion.div>
      {error && <p className="-mt-2 mb-3 text-center text-sm font-semibold text-coral">{error}</p>}
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" onClick={() => tocar(d)} className="h-16 rounded-2xl bg-white/[0.06] font-display text-3xl font-bold transition active:scale-95 active:bg-lima active:text-marino-2">
            {d}
          </button>
        ))}
        <span />
        <button type="button" onClick={() => tocar("0")} className="h-16 rounded-2xl bg-white/[0.06] font-display text-3xl font-bold transition active:scale-95 active:bg-lima active:text-marino-2">
          0
        </button>
        <button type="button" onClick={() => setC((x) => x.slice(0, -1))} className="flex h-16 items-center justify-center rounded-2xl text-white/60 active:scale-95" aria-label="Borrar">
          <Delete className="size-7" />
        </button>
      </div>
    </div>
  );
}

type Paso = { p: "quien" } | { p: "codigo"; a: ArbitroLista } | { p: "registro" };

/**
 * Entrada del árbitro, pensada para la tablet: tu nombre de la lista y tu código de 4 números.
 * La primera vez se registra (nombre, apellido, teléfono, PIN que da el staff y su código), una
 * sola vez para todos los torneos del club: así cada punto queda firmado por una persona.
 */
export function ArbitroLogin({ onListo }: { onListo?: () => void }) {
  const entrar = useArbitroStore((s) => s.entrar);
  const [paso, setPaso] = useState<Paso>({ p: "quien" });
  const [plantel, setPlantel] = useState<{ abierto: boolean; arbitros: ArbitroLista[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const ultimo = leerUltimo();

  useEffect(() => {
    listarArbitros().then((l) => {
      const p = l ?? { abierto: true, arbitros: [] };
      setPlantel(p);
      if (p.abierto && !p.arbitros.length) setPaso((x) => (x.p === "quien" ? { p: "registro" } : x));
    });
  }, []);

  const listo = async (a: { id: string }) => {
    guardarUltimo(a.id);
    vibrar([10, 40, 10]);
    sonar("ok");
    await useTorneos.getState().sincronizar();
    onListo?.();
  };
  const lista = plantel?.arbitros ?? null;
  const orden = [...(lista ?? [])].sort((a, b) => (a.id === ultimo ? -1 : b.id === ultimo ? 1 : a.nombre.localeCompare(b.nombre)));

  if (plantel && !plantel.abierto)
    return (
      <p className="glass w-full max-w-xl rounded-2xl p-5 text-left text-sm text-white/60">
        El club todavía no abrió el registro de árbitros. El staff crea el PIN en <b>Ajustes → Árbitros del club</b>.
      </p>
    );

  return (
    <div className="w-full max-w-xl text-left">
      <AnimatePresence mode="wait">
        {paso.p === "quien" && (
          <motion.div key="quien" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <p className="font-display text-2xl font-bold">¿Quién eres?</p>
            <p className="mb-4 text-sm text-white/55">Toca tu nombre y escribe tu código.</p>
            {lista === null ? (
              <div className="flex justify-center py-10">
                <div className="size-8 animate-spin rounded-full border-2 border-white/10 border-t-neon" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {orden.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      vibrar(8);
                      setError(null);
                      setPaso({ p: "codigo", a });
                    }}
                    className={clsx("flex flex-col items-center gap-2 rounded-3xl border p-4 transition active:scale-95", a.id === ultimo ? "seleccion sobre-marca" : "glass hover:border-neon/40")}
                  >
                    <Avatar nombre={`${a.nombre} ${a.apellido}`} size={56} />
                    <span className="text-center font-semibold leading-tight">
                      {a.nombre} {a.apellido}
                    </span>
                    {a.id === ultimo && <span className="text-[11px] font-semibold text-lima">Último en esta tablet</span>}
                  </button>
                ))}
              </div>
            )}
            <button className="btn-ghost mt-4 w-full !py-4 text-base" onClick={() => setPaso({ p: "registro" })}>
              <UserPlus className="size-5" /> Soy nuevo: registrarme
            </button>
          </motion.div>
        )}

        {paso.p === "codigo" && (
          <motion.div key="codigo" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-center">
            <button className="mb-3 inline-flex items-center gap-1.5 text-sm text-white/55" onClick={() => setPaso({ p: "quien" })}>
              <ArrowLeft className="size-4" /> No soy yo
            </button>
            <div className="flex flex-col items-center">
              <Avatar nombre={`${paso.a.nombre} ${paso.a.apellido}`} size={64} />
              <p className="mt-2 font-display text-2xl font-bold">Hola, {paso.a.nombre}</p>
              <p className="mb-5 text-sm text-white/55">Tu código de 4 números</p>
            </div>
            <PadCodigo
              error={error}
              ocupado={ocupado}
              onCompleto={async (c) => {
                setOcupado(true);
                const err = await entrar(paso.a.id, c);
                setOcupado(false);
                if (err) return setError(err);
                await listo(paso.a);
              }}
            />
            <button className="mt-5 text-sm text-white/45 underline-offset-4 hover:underline" onClick={() => setPaso({ p: "registro" })}>
              Olvidé mi código
            </button>
          </motion.div>
        )}

        {paso.p === "registro" && (
          <motion.div key="registro" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Registro hayLista={!!lista?.length} onVolver={() => setPaso({ p: "quien" })} onListo={listo} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Registro en tres toques: tus datos, el PIN del staff y tu código (dos veces). */
function Registro({ hayLista, onVolver, onListo }: { hayLista: boolean; onVolver: () => void; onListo: (a: { id: string }) => void }) {
  const registrar = useArbitroStore((s) => s.registrar);
  const [d, setD] = useState({ nombre: "", apellido: "", telefono: "", pin: "" });
  const [etapa, setEtapa] = useState<"datos" | "codigo" | "repetir">("datos");
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const datosOk = d.nombre.trim().length >= 2 && d.apellido.trim().length >= 2 && d.telefono.replace(/\D/g, "").length >= 7 && d.pin.length >= 4;

  if (etapa !== "datos")
    return (
      <div className="text-center">
        <button className="mb-3 inline-flex items-center gap-1.5 text-sm text-white/55" onClick={() => setEtapa("datos")}>
          <ArrowLeft className="size-4" /> Mis datos
        </button>
        <p className="font-display text-2xl font-bold">{etapa === "codigo" ? "Crea tu código" : "Repítelo"}</p>
        <p className="mb-5 text-sm text-white/55">{etapa === "codigo" ? "4 números que solo tú sepas. Con él entras cada vez." : "Para estar seguros de que lo recuerdas."}</p>
        <PadCodigo
          key={etapa}
          error={error}
          ocupado={ocupado}
          onCompleto={async (c) => {
            if (etapa === "codigo") {
              setCodigo(c);
              setError(null);
              return setEtapa("repetir");
            }
            if (c !== codigo) {
              setError("No coinciden. Créalo de nuevo.");
              return setEtapa("codigo");
            }
            setOcupado(true);
            const err = await registrar({ ...d, codigo: c });
            setOcupado(false);
            if (err) {
              setError(err);
              return setEtapa("datos");
            }
            const a = useArbitroStore.getState().arbitro;
            if (a) onListo(a);
          }}
        />
      </div>
    );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!datosOk) return;
        setError(null);
        setEtapa("codigo");
      }}
    >
      {hayLista && (
        <button type="button" className="inline-flex items-center gap-1.5 text-sm text-white/55" onClick={onVolver}>
          <ArrowLeft className="size-4" /> Ya estoy registrado
        </button>
      )}
      <div>
        <p className="font-display text-2xl font-bold">Regístrate como árbitro</p>
        <p className="text-sm text-white/55">Una sola vez: sirve para todos los torneos del club. Tu nombre queda en cada partido que anotes.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input className="input !py-4 text-lg" placeholder="Nombre" value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} autoComplete="given-name" maxLength={30} />
        <input className="input !py-4 text-lg" placeholder="Apellido" value={d.apellido} onChange={(e) => setD({ ...d, apellido: e.target.value })} autoComplete="family-name" maxLength={30} />
      </div>
      <input className="input !py-4 text-lg" placeholder="Teléfono (WhatsApp)" inputMode="tel" value={d.telefono} onChange={(e) => setD({ ...d, telefono: e.target.value })} autoComplete="tel" maxLength={20} />
      <div>
        <label className="label" htmlFor="arb-pin">PIN de árbitros (te lo da el staff)</label>
        <input
          id="arb-pin"
          className="input !py-4 text-center font-display text-2xl font-bold tracking-[0.4em]"
          value={d.pin}
          onChange={(e) => setD({ ...d, pin: e.target.value.replace(/\D/g, "").slice(0, 8) })}
          inputMode="numeric"
          autoComplete="off"
          placeholder="••••"
        />
      </div>
      {error && <p className="text-sm font-semibold text-coral">{error}</p>}
      <button className="btn-neon w-full !py-4 text-lg" disabled={!datosOk}>
        Seguir <ChevronRight className="size-5" />
      </button>
      <p className="text-center text-xs text-white/40">Si ya te registraste y olvidaste el código, usa el mismo teléfono: se actualiza.</p>
    </form>
  );
}

/** El anotador lo usan el staff y los árbitros de ese torneo; al resto le pide el PIN. */
export function AnotadorGate({ torneoId, children }: { torneoId: string; children: React.ReactNode }) {
  const esStaff = useEsStaff();
  const arbitro = useArbitro();
  const setPedirLogin = useAmericanos((s) => s.setPedirLogin);
  if (esStaff === undefined || (arbitro === undefined && !esStaff))
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <div className="size-10 animate-spin rounded-full border-2 border-white/10 border-t-neon" />
      </main>
    );
  if (esStaff || esArbitroDe(arbitro, torneoId)) return <>{children}</>;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 p-6 text-center">
      <Logo compacto className="size-14" />
      <span className="flex size-16 items-center justify-center rounded-2xl bg-lima text-marino-2">
        <LockKeyhole className="size-8" />
      </span>
      <div>
        <h1 className="font-display text-2xl font-bold">Anotador oficial</h1>
        <p className="mt-1 max-w-sm text-sm text-white/55">Solo el árbitro del partido o el staff. Entra con tu nombre y tu código.</p>
      </div>
      <ArbitroLogin />
      <div className="flex gap-3">
        <Link href={`/torneos/${torneoId}`} className="btn-ghost">
          <ArrowLeft className="size-4" /> Torneo
        </Link>
        <button className="btn-ghost" onClick={() => setPedirLogin(true)}>
          Soy staff
        </button>
      </div>
    </main>
  );
}

/** A dónde vuelve el anotador: el árbitro a su panel, el staff al torneo. */
export function useVolverAnotador(torneoId: string): string {
  const arbitro = useArbitro();
  const esStaff = useEsStaff();
  return !esStaff && esArbitroDe(arbitro, torneoId) ? "/arbitro" : `/torneos/${torneoId}`;
}
