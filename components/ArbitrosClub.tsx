"use client";

import clsx from "clsx";
import { useCallback, useEffect, useState } from "react";
import {
  Eye,
  EyeOff,
  Flag,
  KeyRound,
  Lock,
  MessageCircle,
  Pause,
  Play,
  RefreshCw,
  Share2,
  Trash2,
} from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { toast } from "@/components/ui/Toaster";
import { vibrar } from "@/lib/feedback";
import type { ArbitroRegistrado, TurnoArbitro } from "@/types/torneo";

export type ArbitroStaff = ArbitroRegistrado & {
  partidos: number;
  puntos: number;
};

const pl = (n: number, s: string) => `${n} ${s}${n === 1 ? "" : "s"}`;

/** Plantel del club para el staff (con lo que anotó cada uno, en un torneo o en todos). */
export function usePlantel(torneoId?: string) {
  const [lista, setLista] = useState<ArbitroStaff[] | null>(null);
  const cargar = useCallback(async () => {
    try {
      const r = await fetch(
        `/api/arbitros${torneoId ? `?torneoId=${encodeURIComponent(torneoId)}` : ""}`,
        { cache: "no-store" },
      );
      if (r.ok)
        setLista(((await r.json()) as { arbitros: ArbitroStaff[] }).arbitros);
    } catch {
      setLista((l) => l ?? []);
    }
  }, [torneoId]);
  useEffect(() => {
    cargar();
    const i = setInterval(cargar, 15_000);
    return () => clearInterval(i);
  }, [cargar]);
  return { lista, cargar };
}

async function compartirPin(pin: string) {
  const texto = `Árbitros de La Marina\n1. Entra en ${location.origin}/arbitro\n2. Toca "Soy nuevo" y regístrate con el PIN ${pin}\n3. Crea tu código de 4 números: con él entras siempre, en todos los torneos.`;
  try {
    if (navigator.share)
      await navigator.share({ title: "Árbitros · La Marina", text: texto });
    else {
      await navigator.clipboard.writeText(texto);
      toast("Instrucciones copiadas", "info");
    }
  } catch {
    /* canceló */
  }
}

/**
 * Ajustes → Árbitros del club (solo staff): el PIN con el que se registran los árbitros y
 * el plantel. Cada árbitro se registra una vez y sirve para todos los torneos.
 */
export function ArbitrosClub() {
  const [pin, setPin] = useState<string | null | undefined>(undefined);
  const [ver, setVer] = useState(false);
  const [editar, setEditar] = useState(false);
  const [nuevo, setNuevo] = useState("");
  const { lista, cargar } = usePlantel();

  useEffect(() => {
    fetch("/api/arbitros/pin", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { pin: null }))
      .then((d: { pin: string | null }) => setPin(d.pin))
      .catch(() => setPin(null));
  }, []);

  async function fijar(valor: string | null | undefined, msg: string) {
    const r = await fetch("/api/arbitros/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(valor === undefined ? {} : { pin: valor }),
    });
    const d = (await r.json().catch(() => ({}))) as {
      pin?: string | null;
      error?: string;
    };
    if (!r.ok) return toast(d.error ?? "No se pudo guardar el PIN.", "error");
    setPin(d.pin ?? null);
    setEditar(false);
    setNuevo("");
    setVer(true);
    vibrar(12);
    toast(msg);
  }

  return (
    <section id="arbitros" className="mt-10 scroll-mt-6">
      <h2 className="label">Árbitros del club</h2>
      <div className="glass space-y-4 rounded-[2rem] p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-lima text-marino-2">
            <Flag className="size-5" />
          </span>
          <p className="text-sm text-white/60">
            Los árbitros se registran{" "}
            <b className="text-white/85">una sola vez</b> en Inicio → Árbitros
            con este PIN y crean su código personal. Con su nombre y su código
            anotan en todos los torneos. Solo el staff ve el PIN.
          </p>
        </div>

        {pin === undefined ? (
          <div className="h-12 animate-pulse rounded-2xl bg-white/5" />
        ) : pin && !editar ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="rounded-xl bg-white/5 px-4 py-2 font-display text-2xl font-bold tracking-[0.3em]"
              onClick={() => setVer((v) => !v)}
              title={ver ? "Ocultar" : "Ver"}
            >
              {ver ? pin : "•".repeat(pin.length)}
            </button>
            <button
              className="btn-ghost !p-2.5"
              onClick={() => setVer((v) => !v)}
              aria-label={ver ? "Ocultar PIN" : "Ver PIN"}
            >
              {ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
            <button
              className="btn-ghost !px-3 !py-2.5 text-xs"
              onClick={() => setEditar(true)}
            >
              <RefreshCw className="size-3.5" /> Cambiar PIN
            </button>
            <span className="flex-1" />
            <button
              className="btn-neon !py-2.5"
              onClick={() => compartirPin(pin)}
            >
              <Share2 className="size-4" /> Enviar a los árbitros
            </button>
            <button
              className="w-full pt-1 text-left text-xs text-white/40 hover:text-coral"
              onClick={() =>
                confirm(
                  "¿Cerrar el registro? Nadie nuevo podrá registrarse y los árbitros tendrán que esperar a que crees otro PIN para entrar.",
                ) && fijar(null, "Registro de árbitros cerrado")
              }
            >
              <Lock className="mr-1 inline size-3" /> Cerrar el registro de
              árbitros
            </button>
          </div>
        ) : (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (/^\d{4,6}$/.test(nuevo))
                fijar(
                  nuevo,
                  pin ? "PIN de árbitros cambiado" : "PIN de árbitros creado",
                );
            }}
          >
            <input
              className="input !w-40 text-center font-display text-2xl font-bold tracking-[0.3em]"
              value={nuevo}
              onChange={(e) =>
                setNuevo(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              inputMode="numeric"
              placeholder="PIN"
              aria-label="Nuevo PIN de árbitros (4 a 6 números)"
              autoFocus={editar}
            />
            <button
              className="btn-neon !py-2.5"
              disabled={!/^\d{4,6}$/.test(nuevo)}
            >
              <KeyRound className="size-4" />{" "}
              {pin ? "Guardar PIN" : "Crear PIN"}
            </button>
            <button
              type="button"
              className="btn-ghost !px-3 !py-2.5 text-xs"
              onClick={() =>
                fijar(
                  undefined,
                  pin ? "PIN de árbitros cambiado" : "PIN de árbitros creado",
                )
              }
            >
              <RefreshCw className="size-3.5" /> Uno al azar
            </button>
            {editar && (
              <button
                type="button"
                className="text-xs text-white/45"
                onClick={() => setEditar(false)}
              >
                Cancelar
              </button>
            )}
            <p className="w-full text-xs text-white/40">
              {pin
                ? "Al cambiarlo, los árbitros vuelven a entrar con su nombre y su código; los nuevos se registran con el PIN nuevo."
                : "De 4 a 6 números. Escríbelo tú o pide uno al azar."}
            </p>
          </form>
        )}
      </div>

      <h3 className="label mt-6">Plantel {lista ? `· ${lista.length}` : ""}</h3>
      <PlantelLista
        lista={lista}
        onCambio={cargar}
        vacio={
          pin
            ? "Nadie se registró todavía. Envíales el PIN con el botón de arriba."
            : "Crea el PIN para que los árbitros puedan registrarse."
        }
      />
    </section>
  );
}

/** Lista del plantel con WhatsApp, pausar y borrar. Con `turnos`, muestra los de ese torneo. */
export function PlantelLista({
  lista,
  onCambio,
  turnos,
  onBorrado,
  vacio,
}: {
  lista: ArbitroStaff[] | null;
  onCambio: () => void;
  turnos?: TurnoArbitro[];
  onBorrado?: (id: string) => void;
  vacio: string;
}) {
  async function cambiarActivo(a: ArbitroStaff) {
    const r = await fetch("/api/arbitros", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: a.id, activo: !a.activo }),
    });
    if (!r.ok) return toast("No se pudo cambiar. Revisa la conexión.", "error");
    toast(
      a.activo
        ? `${a.nombre} queda en pausa: no puede anotar`
        : `${a.nombre} puede anotar otra vez`,
    );
    onCambio();
  }
  async function borrar(a: ArbitroStaff) {
    if (
      !confirm(
        `¿Borrar a ${a.nombre} ${a.apellido} del plantel? Sus partidos anotados conservan su nombre.`,
      )
    )
      return;
    const r = await fetch(
      `/api/arbitros?${new URLSearchParams({ id: a.id })}`,
      { method: "DELETE" },
    );
    if (!r.ok) return toast("No se pudo borrar.", "error");
    onBorrado?.(a.id);
    onCambio();
  }

  if (lista === null)
    return (
      <div className="flex justify-center py-8">
        <div className="size-8 animate-spin rounded-full border-2 border-white/10 border-t-neon" />
      </div>
    );
  if (!lista.length)
    return (
      <p className="glass rounded-2xl p-5 text-sm text-white/55">{vacio}</p>
    );
  return (
    <ul className="space-y-2">
      {lista.map((a) => {
        const tel = (a.telefono ?? "").replace(/\D/g, "");
        const suyos = turnos?.filter((x) => x.arbitroId === a.id).length;
        return (
          <li
            key={a.id}
            className={clsx(
              "glass flex flex-wrap items-center gap-3 rounded-2xl p-4",
              !a.activo && "opacity-60",
            )}
          >
            <Avatar nombre={`${a.nombre} ${a.apellido}`} size={44} />
            <div className="min-w-0 flex-1 basis-[12rem]">
              <p className="font-semibold">
                {a.nombre} {a.apellido}{" "}
                {!a.activo && (
                  <span className="chip ml-1 !text-amber-200">En pausa</span>
                )}
              </p>
              <p className="text-xs text-white/50">
                {suyos !== undefined && `${pl(suyos, "turno")} · `}
                {pl(a.partidos, "partido")}{" "}
                {a.partidos === 1 ? "anotado" : "anotados"} ·{" "}
                {pl(a.puntos, "punto")} · {a.telefono}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {tel && (
                <a
                  className="btn-ghost !p-2.5"
                  href={`https://wa.me/${tel.length === 11 && tel.startsWith("0") ? `58${tel.slice(1)}` : tel}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="WhatsApp"
                >
                  <MessageCircle className="size-4" />
                </a>
              )}
              <button
                className="btn-ghost !px-3 !py-2 text-xs"
                onClick={() => cambiarActivo(a)}
              >
                {a.activo ? (
                  <>
                    <Pause className="size-3.5" /> Pausar
                  </>
                ) : (
                  <>
                    <Play className="size-3.5" /> Reactivar
                  </>
                )}
              </button>
              <button
                className="btn-ghost !p-2.5 hover:!text-coral"
                onClick={() => borrar(a)}
                aria-label="Borrar árbitro"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
