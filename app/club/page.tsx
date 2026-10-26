"use client";

import clsx from "clsx";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, AtSign, Copy, MapPin, MessageCircle, Plus, Save, Sun, Trash2, Warehouse } from "lucide-react";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { ArbitrosClub } from "@/components/ArbitrosClub";
import { DatosPrueba } from "@/components/DatosPrueba";
import { ClavesTorneos } from "@/components/torneo/ClavesTorneos";
import { StaffGate } from "@/components/StaffGate";
import { Stepper } from "@/components/ui/Stepper";
import { toast } from "@/components/ui/Toaster";
import { aMinutos, DIAS, ORDEN_DIAS } from "@/lib/horarios";
import { sonar, vibrar } from "@/lib/feedback";
import { useAmericanos } from "@/lib/store";
import type { ConfigClub, ContactoClub, HorarioDia, PistaClub } from "@/types/americano";

export default function ClubPage() {
  return (
    <StaffGate>
      <Club />
    </StaffGate>
  );
}

function Club() {
  const club = useAmericanos((s) => s.club);
  const hidratado = useAmericanos((s) => s.hidratado);
  const guardarClub = useAmericanos((s) => s.guardarClub);
  const [borrador, setBorrador] = useState<ConfigClub>(club);
  const [demo, setDemo] = useState(0);

  useEffect(() => {
    if (hidratado) setBorrador(club);
  }, [hidratado, club]);

  const setDia = (d: number, h: Partial<HorarioDia>) => setBorrador((b) => ({ ...b, dias: b.dias.map((x, i) => (i === d ? { ...x, ...h } : x)) }));
  const setPista = (n: number, h: Partial<PistaClub>) => setBorrador((b) => ({ ...b, pistas: b.pistas.map((x) => (x.numero === n ? { ...x, ...h } : x)) }));
  const setContacto = (h: Partial<ContactoClub>) => setBorrador((b) => ({ ...b, contacto: { ...b.contacto, ...h } }));
  const invalidos = borrador.dias.filter((d) => d.abierto && aMinutos(d.cierre) <= aMinutos(d.apertura)).length;

  return (
    <main className="mx-auto max-w-2xl px-4 pb-32 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
      <header className="flex items-center justify-between py-3">
        <Link href="/" className="btn-ghost !p-2.5" aria-label="Volver">
          <ArrowLeft className="size-5" />
        </Link>
        <Logo compacto />
        <span className="w-10" />
      </header>

      <h1 className="mt-6 font-display text-3xl font-bold tracking-tight">Mi club</h1>
      <p className="mt-2 text-white/50">Pistas, horarios y contacto de {borrador.nombre}. Todo lo que configures aquí se usa al crear eventos.</p>

      <h2 className="label mt-10">Pistas</h2>
      <ul className="space-y-2">
        {borrador.pistas.map((c) => (
          <li key={c.numero} className={clsx("glass flex flex-wrap items-center gap-3 rounded-2xl p-3 transition", !c.activa && "opacity-50")}>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-neon/10 font-display font-bold text-neon">{c.numero}</span>
            <input className="input !w-auto min-w-0 flex-1 !py-2" value={c.nombre} onChange={(e) => setPista(c.numero, { nombre: e.target.value })} aria-label={`Nombre pista ${c.numero}`} />
            <div className="flex gap-1 rounded-xl bg-white/5 p-1">
              <button
                onClick={() => setPista(c.numero, { techada: true })}
                className={clsx("flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold", c.techada ? "bg-cielo/20 text-cielo" : "text-white/50")}
              >
                <Warehouse className="size-3.5" /> Techada
              </button>
              <button
                onClick={() => setPista(c.numero, { techada: false })}
                className={clsx("flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold", !c.techada ? "bg-amber-400/20 text-amber-300" : "text-white/50")}
              >
                <Sun className="size-3.5" /> Exterior
              </button>
            </div>
            <button
              role="switch"
              aria-checked={c.activa}
              aria-label={`${c.nombre} habilitada`}
              title={c.activa ? "Habilitada" : "Deshabilitada (mantenimiento)"}
              onClick={() => {
                vibrar(8);
                setPista(c.numero, { activa: !c.activa });
              }}
              className={clsx("relative h-7 w-12 shrink-0 rounded-full transition", c.activa ? "bg-neon" : "bg-white/15")}
            >
              <motion.span layout className={clsx("absolute top-1 size-5 rounded-full bg-blanco shadow", c.activa ? "right-1" : "left-1")} />
            </button>
            {borrador.pistas.length > 1 && c.numero === Math.max(...borrador.pistas.map((x) => x.numero)) && (
              <button className="rounded-lg p-2 text-white/40 hover:text-coral" onClick={() => setBorrador((b) => ({ ...b, pistas: b.pistas.filter((x) => x.numero !== c.numero) }))} aria-label="Quitar pista">
                <Trash2 className="size-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {borrador.pistas.length < 6 && (
        <button
          className="btn-ghost mt-2 !py-2 text-xs"
          onClick={() =>
            setBorrador((b) => {
              const n = Math.max(0, ...b.pistas.map((x) => x.numero)) + 1;
              return { ...b, pistas: [...b.pistas, { numero: n, nombre: `Pista ${n}`, techada: true, activa: true }] };
            })
          }
        >
          <Plus className="size-3.5" /> Agregar pista
        </button>
      )}

      <h2 className="label mt-10">Horarios</h2>

      <ul className="space-y-2">
        {ORDEN_DIAS.map((d, i) => {
          const h = borrador.dias[d];
          return (
            <motion.li key={d} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3">
              <button
                role="switch"
                aria-checked={h.abierto}
                onClick={() => {
                  vibrar(8);
                  setDia(d, { abierto: !h.abierto });
                }}
                className={clsx("relative h-7 w-12 shrink-0 rounded-full transition", h.abierto ? "bg-neon" : "bg-white/15")}
                aria-label={`${DIAS[d]} abierto`}
              >
                <motion.span layout className={clsx("absolute top-1 size-5 rounded-full bg-blanco shadow", h.abierto ? "right-1" : "left-1")} />
              </button>
              <span className="w-24 font-semibold">{DIAS[d]}</span>
              {h.abierto ? (
                <div className="ml-auto flex items-center gap-2">
                  <input type="time" step={1800} value={h.apertura} onChange={(e) => setDia(d, { apertura: e.target.value })} className="input !w-auto !px-3 !py-2 text-sm [color-scheme:dark]" />
                  <span className="text-white/30">–</span>
                  <input type="time" step={1800} value={h.cierre} onChange={(e) => setDia(d, { cierre: e.target.value })} className="input !w-auto !px-3 !py-2 text-sm [color-scheme:dark]" />
                  <button
                    className="rounded-lg p-2 text-white/40 hover:bg-white/10 hover:text-white"
                    title="Copiar a todos los días"
                    onClick={() => {
                      setBorrador((b) => ({ ...b, dias: b.dias.map((x) => (x.abierto ? { ...x, apertura: h.apertura, cierre: h.cierre } : x)) }));
                      toast("Horario copiado a los días abiertos", "info");
                    }}
                  >
                    <Copy className="size-4" />
                  </button>
                </div>
              ) : (
                <span className="ml-auto text-sm text-white/40">Cerrado</span>
              )}
            </motion.li>
          );
        })}
      </ul>

      <div className="glass mt-6 flex items-center justify-between rounded-2xl p-4">
        <div>
          <p className="text-sm font-semibold">Cambio entre rondas</p>
          <p className="text-xs text-white/50">Tiempo para rotar de pista</p>
        </div>
        <Stepper valor={borrador.minutosEntreRondas} onChange={(v) => setBorrador((b) => ({ ...b, minutosEntreRondas: v }))} min={0} max={15} sufijo="min" />
      </div>

      <h2 className="label mt-10">Contacto (se muestra en el Modo TV)</h2>
      <div className="grid gap-2">
        <label className="glass flex items-center gap-3 rounded-2xl px-4 py-1">
          <AtSign className="size-4 text-neon" />
          <input className="w-full bg-transparent py-3 outline-none placeholder:text-white/30" placeholder="Instagram (ej. lamarinasportclub)" value={borrador.contacto.instagram ?? ""} onChange={(e) => setContacto({ instagram: e.target.value.replace(/^@/, "") })} />
        </label>
        <label className="glass flex items-center gap-3 rounded-2xl px-4 py-1">
          <MessageCircle className="size-4 text-neon" />
          <input className="w-full bg-transparent py-3 outline-none placeholder:text-white/30" placeholder="WhatsApp de reservas" inputMode="tel" value={borrador.contacto.whatsapp ?? ""} onChange={(e) => setContacto({ whatsapp: e.target.value })} />
        </label>
        <label className="glass flex items-center gap-3 rounded-2xl px-4 py-1">
          <MapPin className="size-4 text-neon" />
          <input className="w-full bg-transparent py-3 outline-none placeholder:text-white/30" placeholder="Dirección" value={borrador.contacto.direccion ?? ""} onChange={(e) => setContacto({ direccion: e.target.value })} />
        </label>
      </div>

      <ClavesTorneos />

      <ArbitrosClub key={demo} />

      <DatosPrueba onCambio={() => setDemo((n) => n + 1)} />

      <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-white/5 bg-fondo/85 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-xl">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <button
            className="btn-neon w-full text-base"
            disabled={invalidos > 0}
            onClick={() => {
              guardarClub(borrador);
              sonar("ok");
              vibrar(20);
              toast("Configuración del club guardada");
            }}
          >
            <Save className="size-5" /> {invalidos > 0 ? "Revisa los horarios (cierre antes de apertura)" : "Guardar cambios"}
          </button>
        </div>
      </footer>
    </main>
  );
}
