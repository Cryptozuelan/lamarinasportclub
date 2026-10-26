"use client";

import clsx from "clsx";
import Link from "next/link";
import { use } from "react";
import { ArrowLeft, CloudRain, Maximize, Megaphone, Minimize, Radio } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Escenario, Reloj, useCursorOculto, useFullscreenYWakeLock, useVertical } from "@/components/Pantalla";
import { QR } from "@/components/QR";
import { TorneoShellMinimo } from "@/components/torneo/minimo";
import { FranjaPatrocinadores } from "@/components/torneo/Patrocinadores";
import { textoOrigen } from "@/components/torneo/piezas";
import { MarcadorMini, useMarcadoresEnVivo } from "@/components/torneo/vivo";
import { nombreCorto } from "@/lib/torneo/categorias";
import { estadoPistas, partidosListos } from "@/lib/torneo/programacion";
import { textoSets } from "@/lib/torneo/tabla";
import { nombrePista } from "@/lib/torneo/imprevistos";
import { categoria } from "@/lib/torneo/torneo";
import type { Torneo } from "@/types/torneo";

/** Modo TV del torneo (terraza / bar): todas las pistas en vivo, lo que viene y los últimos resultados. */
export default function TorneoTVPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TorneoShellMinimo id={id}>{(t) => <TV torneo={t} />}</TorneoShellMinimo>;
}

function TV({ torneo }: { torneo: Torneo }) {
  useMarcadoresEnVivo(torneo.id, 2000);
  const { full, alternar } = useFullscreenYWakeLock();
  const oculto = useCursorOculto();
  const vertical = useVertical();
  const pistas = estadoPistas(torneo);
  const proximos = partidosListos(torneo).filter((p) => !pistas.some((c) => c.llamado?.id === p.id)).slice(0, 6);
  const recientes = torneo.categorias
    .flatMap((c) => c.cuadro?.partidos ?? [])
    .filter((p) => p.estado === "FINALIZADO" && !p.bye && p.finEn)
    .sort((a, b) => (b.finEn ?? "").localeCompare(a.finEn ?? ""))
    .slice(0, 5);
  const url = typeof window !== "undefined" ? `${location.origin}/torneos/${torneo.id}` : "";
  const cat = (id: string) => nombreCorto(categoria(torneo, id)!.categoria);

  return (
    <Escenario oculto={oculto} vertical={vertical}>
      <header className="flex items-center gap-6">
        <Logo className="!h-14" />
        <div className="h-12 w-px bg-white/10" />
        <h1 className="min-w-0 flex-1 truncate font-display text-4xl font-bold">{torneo.nombre}</h1>
        <Reloj />
        <div className={clsx("flex gap-2 transition-opacity", oculto && "opacity-0")}>
          <Link href={`/torneos/${torneo.id}`} className="btn-ghost !p-3" aria-label="Salir">
            <ArrowLeft className="size-5" />
          </Link>
          <button className="btn-ghost !p-3" onClick={alternar} aria-label="Pantalla completa">
            {full ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
          </button>
        </div>
      </header>
      <div className={clsx("grid min-h-0 flex-1 gap-6", vertical ? "grid-cols-1" : "grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]")}>
        <div className="grid min-h-0 auto-rows-fr grid-cols-2 gap-5">
          {pistas.map((c) => (
            <div key={c.numero} className={clsx("glass flex min-h-0 flex-col rounded-[2rem] p-6", c.enJuego && "!border-neon/40")}>
              <div className="flex items-center gap-3">
                <span className={clsx("flex size-12 items-center justify-center rounded-full font-display text-2xl font-bold", c.enJuego ? "bg-lima text-marino-2" : "bg-pista text-blanco")}>{c.numero}</span>
                <p className="flex-1 truncate font-display text-2xl font-bold">
                  {c.nombre}
                  {c.sede && <span className="font-normal text-cielo"> · {c.sede}</span>}
                </p>
                {c.enJuego ? (
                  <span className="flex items-center gap-2 text-lg font-semibold text-neon">
                    <Radio className="size-5" /> {cat(c.enJuego.categoriaId)}
                  </span>
                ) : c.llamado ? (
                  <span className="flex items-center gap-2 text-lg font-semibold text-lima">
                    <Megaphone className="size-5" /> Llamado
                  </span>
                ) : c.suspendida ? (
                  <span className="flex items-center gap-2 text-lg font-semibold text-amber-200">
                    <CloudRain className="size-5" /> {c.suspendida}
                  </span>
                ) : (
                  <span className="text-lg text-white/40">Libre</span>
                )}
              </div>
              <div className="mt-auto pt-4">
                {c.enJuego ? (
                  <MarcadorMini torneo={torneo} p={c.enJuego} grande />
                ) : c.llamado ? (
                  <p className="text-2xl font-semibold leading-snug">
                    {textoOrigen(torneo, c.llamado, "A")} <span className="text-white/35">vs</span> {textoOrigen(torneo, c.llamado, "B")}
                  </p>
                ) : (
                  <p className="text-xl text-white/40">{c.siguiente ? `Siguiente: ${textoOrigen(torneo, c.siguiente, "A")} vs ${textoOrigen(torneo, c.siguiente, "B")}` : "—"}</p>
                )}
              </div>
            </div>
          ))}
          <div className="glass flex items-center gap-6 rounded-[2rem] p-6">
            <div className="rounded-2xl bg-blanco p-3">
              <QR texto={url} size={150} />
            </div>
            <div>
              <p className="font-display text-2xl font-bold">Sigue el torneo</p>
              <p className="mt-1 text-lg text-white/55">Cuadros, horarios y tus estadísticas</p>
            </div>
          </div>
        </div>
        <div className="flex min-h-0 flex-col gap-5">
          <div className="glass min-h-0 flex-1 rounded-[2rem] p-6">
            <p className="font-display text-2xl font-bold">Próximos partidos</p>
            <ul className="mt-4 space-y-3">
              {proximos.map((p) => (
                <li key={p.id} className="flex items-center gap-4 rounded-2xl bg-white/[0.04] px-4 py-3">
                  <span className="w-16 font-display text-xl font-bold text-lima">{p.programacion?.hora ?? "--"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-semibold">
                      {textoOrigen(torneo, p, "A")} <span className="text-white/35">vs</span> {textoOrigen(torneo, p, "B")}
                    </p>
                    <p className="text-sm text-white/45">
                      {cat(p.categoriaId)} · {p.etiqueta} · {nombrePista(torneo, p.programacion?.pista)}
                    </p>
                  </div>
                </li>
              ))}
              {!proximos.length && <li className="text-lg text-white/40">No hay más partidos listos.</li>}
            </ul>
          </div>
          <div className="glass rounded-[2rem] p-6">
            <p className="font-display text-2xl font-bold">Últimos resultados</p>
            <ul className="mt-4 space-y-2.5">
              {recientes.map((p) => {
                const ganaA = p.resultado?.ganador === "A";
                return (
                  <li key={p.id} className="flex items-center gap-3 text-lg">
                    <span className="w-20 shrink-0 text-sm text-white/45">{cat(p.categoriaId)}</span>
                    <span className="min-w-0 flex-1 truncate">
                      <b>{textoOrigen(torneo, p, ganaA ? "A" : "B")}</b> <span className="text-white/40">a</span> {textoOrigen(torneo, p, ganaA ? "B" : "A")}
                    </span>
                    <span className="font-display font-bold text-lima">{textoSets(p.resultado!.sets, !ganaA)}</span>
                  </li>
                );
              })}
              {!recientes.length && <li className="text-lg text-white/40">Todavía no hay resultados.</li>}
            </ul>
          </div>
          {!!torneo.patrocinadores?.length && (
            <div className="glass rounded-[2rem] p-6">
              <FranjaPatrocinadores torneo={torneo} grande />
            </div>
          )}
        </div>
      </div>
    </Escenario>
  );
}
