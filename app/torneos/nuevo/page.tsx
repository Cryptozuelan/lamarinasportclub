"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { Logo } from "@/components/Logo";
import { MapaPistas } from "@/components/MapaPistas";
import { StaffGate } from "@/components/StaffGate";
import { Stepper } from "@/components/ui/Stepper";
import { Switch } from "@/components/ui/Switch";
import { toast } from "@/components/ui/Toaster";
import { fechaCorta } from "@/components/torneo/TorneoShell";
import { vibrar } from "@/lib/feedback";
import { aMinutos, horarioDelDia } from "@/lib/horarios";
import { useAmericanos } from "@/lib/store";
import { catalogoCategorias, nombreCorto } from "@/lib/torneo/categorias";
import { claveAleatoria, venceAlTerminar } from "@/lib/torneo/acceso";
import { crearTorneo } from "@/lib/torneo/torneo";
import { useTorneos } from "@/lib/torneosStore";
import type { CategoriaTorneo, DiaTorneo } from "@/types/torneo";

export default function NuevoTorneoPage() {
  return (
    <StaffGate>
      <NuevoTorneo />
    </StaffGate>
  );
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function proximoSabado(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  return iso(d);
}

function sumarDias(fecha: string, n: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return iso(new Date(y, m - 1, d + n));
}

function diasEntre(desde: string, hasta: string): number {
  const [a, b] = [desde, hasta].map((f) => {
    const [y, m, d] = f.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / 86_400_000);
}

const MAX_DIAS = 10;

/**
 * Horario por defecto de un día de torneo. Se usa el del club para ese día de la
 * semana, salvo que esté cerrado o tenga una franja corta (menos de 8 h, p. ej. un
 * domingo configurado solo de noche): ahí se toma la franja más amplia del club.
 */
function horarioTorneo(club: Parameters<typeof horarioDelDia>[0], fecha: string): { inicio: string; fin: string } {
  const h = horarioDelDia(club, fecha);
  const largo = (x: { apertura: string; cierre: string }) => aMinutos(x.cierre) - aMinutos(x.apertura);
  if (h.abierto && largo(h) >= 8 * 60) return { inicio: h.apertura, fin: h.cierre };
  const amplio = club.dias.filter((d) => d.abierto).sort((a, b) => largo(b) - largo(a))[0];
  return amplio && largo(amplio) > 0 ? { inicio: amplio.apertura, fin: amplio.cierre } : { inicio: "08:00", fin: "22:00" };
}

function NuevoTorneo() {
  const router = useRouter();
  const club = useAmericanos((s) => s.club);
  const guardar = useTorneos((s) => s.guardar);
  const [nombre, setNombre] = useState("");
  const [inicio, setInicio] = useState(proximoSabado);
  const [cantidad, setCantidad] = useState(2);
  const [horas, setHoras] = useState<Record<string, Partial<DiaTorneo>>>({});
  const pistasClub = club.pistas.filter((p) => p.activa);
  const [pistas, setPistas] = useState<number[]>(pistasClub.map((p) => p.numero));
  const [categorias, setCategorias] = useState<CategoriaTorneo[]>([]);
  const [descanso, setDescanso] = useState(45);
  const [tolerancia, setTolerancia] = useState(10);
  const [finalesUltimo, setFinalesUltimo] = useState(true);
  const catalogo = useMemo(catalogoCategorias, []);

  const dias: DiaTorneo[] = Array.from({ length: cantidad }, (_, i) => {
    const fecha = sumarDias(inicio, i);
    const h = horarioTorneo(club, fecha);
    return { fecha, inicio: horas[fecha]?.inicio ?? h.inicio, fin: horas[fecha]?.fin ?? h.fin };
  });
  const ultimo = sumarDias(inicio, cantidad - 1);

  const elegida = (c: CategoriaTorneo) => categorias.some((x) => x.id === c.id);
  const alternar = (c: CategoriaTorneo) => {
    vibrar(8);
    setCategorias((cs) => (cs.some((x) => x.id === c.id) ? cs.filter((x) => x.id !== c.id) : [...cs, c]));
  };
  const alternarGrupo = (lista: CategoriaTorneo[]) => {
    const todas = lista.every(elegida);
    setCategorias((cs) => (todas ? cs.filter((x) => !lista.some((l) => l.id === x.id)) : [...cs, ...lista.filter((l) => !cs.some((x) => x.id === l.id))]));
  };

  const errores = [
    !nombre.trim() && "Ponle nombre al torneo.",
    !pistas.length && "Elige al menos una pista.",
    !categorias.length && "Elige al menos una categoría.",
    dias.some((d) => d.fin <= d.inicio) && "Revisa los horarios: la hora de fin va después del inicio.",
  ].filter(Boolean) as string[];

  function crear() {
    if (errores.length) return toast(errores[0], "error");
    const canchas = pistas.map((n) => club.pistas.find((p) => p.numero === n)!).filter(Boolean);
    const t = crearTorneo({
      nombre,
      dias,
      canchas,
      categorias,
      descansoMin: descanso,
      toleranciaWO: tolerancia,
      finalesUltimoDia: finalesUltimo,
    });
    guardar({ ...t, acceso: { clave: claveAleatoria(), vence: venceAlTerminar(t.dias) }, arbitros: { turnos: [] } });
    toast("Torneo creado. Ahora inscribe las duplas.");
    router.push(`/torneos/${t.id}/categorias`);
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-36 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
      <header className="flex items-center justify-between py-3">
        <Link href="/torneos" className="btn-ghost !p-2.5" aria-label="Volver">
          <ArrowLeft className="size-5" />
        </Link>
        <Logo compacto />
        <span className="w-10" />
      </header>

      <h1 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">Nuevo torneo</h1>
      <p className="mt-2 text-white/55">Días, pistas y categorías. Las inscripciones, el sorteo y los horarios van después, por categoría.</p>

      <section className="mt-8">
        <label className="label" htmlFor="nombre">Nombre</label>
        <input id="nombre" className="input text-lg" placeholder="Nombre del torneo" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} />
      </section>

      <section className="mt-8">
        <h2 className="label">Días en La Marina</h2>
        <div className="glass flex flex-wrap items-center gap-4 rounded-2xl p-4">
          <div>
            <p className="mb-1 text-xs text-white/50">Primer día</p>
            <input type="date" className="input !w-auto !py-2" value={inicio} onChange={(e) => e.target.value && setInicio(e.target.value)} />
          </div>
          <div>
            <p className="mb-1 text-xs text-white/50">Cantidad de días</p>
            <Stepper valor={cantidad} onChange={setCantidad} min={1} max={MAX_DIAS} />
          </div>
          <div>
            <p className="mb-1 text-xs text-white/50">Último día</p>
            <input
              type="date"
              className="input !w-auto !py-2"
              value={ultimo}
              min={inicio}
              max={sumarDias(inicio, MAX_DIAS - 1)}
              onChange={(e) => {
                if (!e.target.value) return;
                const n = diasEntre(inicio, e.target.value) + 1;
                if (n < 1) toast("El último día no puede ser antes del primero.", "error");
                else if (n > MAX_DIAS) toast(`Un torneo puede durar hasta ${MAX_DIAS} días.`, "error");
                else setCantidad(n);
              }}
              aria-label="Último día"
            />
          </div>
        </div>
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {dias.map((d) => (
            <li key={d.fecha} className="glass flex items-center gap-3 rounded-2xl p-3">
              <span className="w-24 shrink-0 font-semibold capitalize">{fechaCorta(d.fecha)}</span>
              <input
                type="time"
                step={900}
                className="input !w-auto min-w-0 flex-1 !px-2 !py-2 text-center"
                value={d.inicio}
                onChange={(e) => setHoras((h) => ({ ...h, [d.fecha]: { ...h[d.fecha], inicio: e.target.value } }))}
                aria-label={`Inicio ${d.fecha}`}
              />
              <span className="text-white/40">a</span>
              <input
                type="time"
                step={900}
                className="input !w-auto min-w-0 flex-1 !px-2 !py-2 text-center"
                value={d.fin}
                onChange={(e) => setHoras((h) => ({ ...h, [d.fecha]: { ...h[d.fecha], fin: e.target.value } }))}
                aria-label={`Fin ${d.fecha}`}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="label">Pistas del torneo</h2>
        <MapaPistas pistas={pistasClub} seleccion={pistas} onToggle={(n) => setPistas((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n].sort((a, b) => a - b)))} />
        <p className="mt-2 text-xs text-white/45">Las finales van en la primera pista elegida.</p>
      </section>

      <section className="mt-8">
        <div className="flex items-end justify-between">
          <h2 className="label">Categorías</h2>
          <span className="mb-2 text-xs text-white/50">{categorias.length} elegida(s)</span>
        </div>
        <div className="space-y-4">
          {catalogo.map((g) => (
            <div key={g.grupo} className="glass rounded-2xl p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-semibold">{g.grupo}</p>
                <button className="text-xs font-semibold text-neon" onClick={() => alternarGrupo(g.categorias)}>
                  {g.categorias.every(elegida) ? "Quitar todas" : "Todas"}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {g.categorias.map((c) => {
                  const on = elegida(c);
                  return (
                    <button
                      key={c.id}
                      onClick={() => alternar(c)}
                      aria-pressed={on}
                      className={clsx("flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition", on ? "seleccion sobre-marca text-lima" : "border-white/10 text-white/70 hover:border-white/25")}
                    >
                      {on && <Check className="size-3.5" strokeWidth={3} />}
                      {nombreCorto(c)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="label">Reglas del día</h2>
        <div className="glass divide-y divide-white/5 rounded-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold">Descanso mínimo</p>
              <p className="text-xs text-white/50">Entre partidos de un mismo jugador, aunque juegue dos categorías.</p>
            </div>
            <Stepper valor={descanso} onChange={setDescanso} min={0} max={180} paso={15} sufijo="min" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold">Tolerancia de W.O.</p>
              <p className="text-xs text-white/50">FIP: 10 min desde la hora prevista (o 5 min después de que termine el partido anterior en la pista).</p>
            </div>
            <Stepper valor={tolerancia} onChange={setTolerancia} min={5} max={30} paso={5} sufijo="min" />
          </div>
          <div className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold">Semis y finales el último día</p>
              <p className="text-xs text-white/50">En la pista principal, con público.</p>
            </div>
            <Switch activo={finalesUltimo} onChange={setFinalesUltimo} etiqueta="Semis y finales el último día" />
          </div>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/5 bg-fondo/80 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-sm text-white/55">
            {errores[0] ?? `${cantidad} día${cantidad > 1 ? "s" : ""} · ${pistas.length} pista${pistas.length > 1 ? "s" : ""} · ${categorias.length} categoría${categorias.length === 1 ? "" : "s"}`}
          </p>
          <button className="btn-neon" onClick={crear} disabled={errores.length > 0}>
            <Trophy className="size-4" /> Crear torneo
          </button>
        </div>
      </div>
    </main>
  );
}
