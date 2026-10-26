"use client";

import { useState } from "react";
import { FlaskConical, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/Toaster";
import { vibrar } from "@/lib/feedback";
import { useAmericanos } from "@/lib/store";
import { useTorneos } from "@/lib/torneosStore";

/**
 * Ajustes → Datos de prueba (solo staff): carga en un toque americanos, un torneo en juego y
 * árbitros de ejemplo para enseñar la app, y los quita igual de fácil. No toca lo real.
 */
export function DatosPrueba({ onCambio }: { onCambio?: () => void }) {
  const [ocupado, setOcupado] = useState<"cargar" | "borrar" | null>(null);

  async function hacer(accion: "cargar" | "borrar") {
    if (
      accion === "borrar" &&
      !confirm(
        "¿Quitar los datos de prueba? Se borran los americanos, el torneo y los árbitros de ejemplo. Lo tuyo no se toca.",
      )
    )
      return;
    setOcupado(accion);
    try {
      const r = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok)
        return toast(d.error ?? "No se pudo. Revisa la conexión.", "error");
      await Promise.all([
        useAmericanos.getState().sincronizar(),
        useTorneos.getState().sincronizar(),
      ]);
      onCambio?.();
      vibrar(20);
      toast(
        accion === "cargar"
          ? "Datos de prueba cargados: mira Inicio"
          : "Datos de prueba borrados",
      );
    } catch {
      toast("Sin conexión. Necesitas internet para esto.", "error");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <section className="mt-10">
      <h2 className="label">Datos de prueba</h2>
      <div className="glass space-y-4 rounded-[2rem] p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-neon">
            <FlaskConical className="size-5" />
          </span>
          <p className="text-sm text-white/60">
            Para enseñar la app: crea 3 americanos, un torneo de hoy con
            partidos en juego y 6 árbitros de ejemplo (código{" "}
            <b className="text-white/85">1234</b>). Si no hay PIN de árbitros,
            queda el <b className="text-white/85">2468</b>. Se borra con un
            toque y no toca lo tuyo.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            className="btn-neon !py-3"
            disabled={!!ocupado}
            onClick={() => hacer("cargar")}
          >
            <FlaskConical className="size-4" />{" "}
            {ocupado === "cargar" ? "Cargando…" : "Cargar datos de prueba"}
          </button>
          <button
            className="btn-ghost !py-3 hover:!text-coral"
            disabled={!!ocupado}
            onClick={() => hacer("borrar")}
          >
            <Trash2 className="size-4" />{" "}
            {ocupado === "borrar" ? "Borrando…" : "Borrar datos de prueba"}
          </button>
        </div>
      </div>
    </section>
  );
}
