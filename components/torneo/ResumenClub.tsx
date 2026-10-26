"use client";

import { Building2, CalendarCheck, Clock, CloudRain, Flag, Timer, Users, Zap } from "lucide-react";
import { useTorneos } from "@/lib/torneosStore";
import { todosLosPartidos } from "@/lib/torneo/torneo";
import type { Torneo } from "@/types/torneo";

/**
 * Resumen para el dueño del club y los patrocinadores: cuánto se jugó, puntualidad,
 * uso de pistas e imprevistos. Solo lo ve el staff.
 */
export function ResumenClub({ torneo }: { torneo: Torneo }) {
  const marcadores = useTorneos((s) => s.marcadores);
  const partidos = todosLosPartidos(torneo).filter((p) => !p.bye);
  const jugados = partidos.filter((p) => p.estado === "FINALIZADO");
  const minutosPista = jugados.reduce((acc, p) => (p.inicioEn && p.finEn ? acc + Math.max(0, (new Date(p.finEn).getTime() - new Date(p.inicioEn).getTime()) / 60_000) : acc), 0);
  const atrasos = partidos
    .filter((p) => p.inicioEn && p.programacion)
    .map((p) => (new Date(p.inicioEn!).getTime() - new Date(`${p.programacion!.fecha}T${p.programacion!.hora}:00`).getTime()) / 60_000);
  const puntuales = atrasos.filter((a) => a <= 10).length;
  const jugadores = new Set(torneo.categorias.flatMap((c) => c.duplas.filter((d) => d.estado === "ACTIVA").flatMap((d) => d.jugadorIds))).size;
  const wo = jugados.filter((p) => p.resultado?.tipo === "WO").length;
  const retiros = jugados.filter((p) => p.resultado?.tipo === "RETIRO" || p.resultado?.tipo === "DESCALIFICACION").length;
  const suspensiones = new Set(torneo.bloqueos.map((b) => b.suspensionId).filter(Boolean)).size;
  const puntos = Object.values(marcadores).filter((m) => m.torneoId === torneo.id).reduce((a, m) => a + m.puntos.length, 0);
  const sedes = (torneo.sedes ?? []).length;

  const tiles = [
    { icon: Users, v: jugadores, l: "Jugadores inscritos" },
    { icon: CalendarCheck, v: `${jugados.length}/${partidos.length}`, l: "Partidos jugados" },
    { icon: Timer, v: `${Math.round(minutosPista / 60)} h`, l: "Horas de pista jugadas" },
    { icon: Clock, v: atrasos.length ? `${Math.round((puntuales / atrasos.length) * 100)}%` : "—", l: "Empezaron en hora (±10 min)" },
    { icon: Zap, v: puntos.toLocaleString("es"), l: "Puntos anotados en vivo" },
    { icon: Flag, v: `${wo} · ${retiros}`, l: "W.O. · retiros" },
    { icon: CloudRain, v: suspensiones, l: "Suspensiones por clima" },
    { icon: Building2, v: sedes + 1, l: sedes ? "Sedes usadas" : "Sede" },
  ];

  return (
    <section className="mt-2">
      <p className="label">Resumen para el club</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.l} className="glass rounded-2xl p-3">
            <t.icon className="size-4 text-neon" />
            <p className="mt-1.5 font-display text-xl font-bold tabular">{t.v}</p>
            <p className="text-[11px] leading-tight text-white/50">{t.l}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
