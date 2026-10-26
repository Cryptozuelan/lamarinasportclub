"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ClipboardPaste, ExternalLink, FileUp, RefreshCw, Search } from "lucide-react";
import { Logo } from "@/components/Logo";
import { StaffChip, StaffGate } from "@/components/StaffGate";
import { Hoja } from "@/components/ui/Hoja";
import { toast } from "@/components/ui/Toaster";
import { etiquetaNivel, HOJA_FVP, urlHoja } from "@/lib/ranking/fvp";
import { NIVELES_TORNEO } from "@/lib/torneo/categorias";
import type { AtletaFvp, ResumenRankingFvp } from "@/types/ranking";

/** Lista FVP vigente: de dónde salió, cuándo, avisos, sincronizar, subir a mano y buscar. */
export default function RankingFvpPage() {
  return (
    <StaffGate>
      <RankingFvp />
    </StaffGate>
  );
}

const fecha = (iso?: string) => (iso ? new Date(iso).toLocaleString("es", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

async function enviar(body: object): Promise<{ resumen?: ResumenRankingFvp; error?: string; detalles?: string[]; status: number }> {
  try {
    const r = await fetch("/api/ranking-fvp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ...(await r.json()), status: r.status };
  } catch {
    return { error: "Sin conexión.", status: 0 };
  }
}

function RankingFvp() {
  const [resumen, setResumen] = useState<ResumenRankingFvp | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [pegar, setPegar] = useState(false);
  const [texto, setTexto] = useState("");
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<AtletaFvp[] | null>(null);
  const archivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/ranking-fvp", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { resumen?: ResumenRankingFvp }) => d.resumen && setResumen(d.resumen))
      .catch(() => toast("Sin conexión con el servidor.", "error"));
  }, []);

  useEffect(() => {
    if (q.trim().length < 3) return setResultados(null);
    const t = setTimeout(() => {
      fetch(`/api/ranking-fvp?q=${encodeURIComponent(q.trim())}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d: { resultados?: AtletaFvp[] }) => setResultados(d.resultados ?? []))
        .catch(() => setResultados([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  async function correr(body: object, ok: string) {
    setOcupado(true);
    let r = await enviar(body);
    // Lista mucho más corta que la vigente: se pide confirmación antes de reemplazarla.
    if (r.status === 422 && "texto" in body && r.error?.includes("Se conserva") && confirm(`${r.error}\n\n¿Reemplazarla igual?`)) r = await enviar({ ...body, forzar: true });
    setOcupado(false);
    if (r.resumen) {
      setResumen(r.resumen);
      toast(`${ok}: ${r.resumen.total.toLocaleString("es")} atletas.`);
      return true;
    }
    toast(r.error ?? "No se pudo cargar la lista.", "error");
    return false;
  }

  const leerArchivo = async (f: File) => {
    if (/\.xlsx?$/i.test(f.name)) return toast("Descarga la hoja como CSV (Archivo → Descargar → CSV) y súbela de nuevo.", "error");
    await correr({ texto: await f.text(), archivo: f.name }, "Lista cargada");
  };

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
      <header className="flex items-center gap-2 py-3">
        <Link href="/torneos" className="btn-ghost !p-2.5" aria-label="Torneos">
          <ArrowLeft className="size-5" />
        </Link>
        <span className="flex-1" />
        <StaffChip />
        <Logo compacto />
      </header>

      <section className="glass relative mt-2 overflow-hidden rounded-[2rem] p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-marca-2/30 blur-3xl" />
        <p className="label relative !mb-1">Ranking FVP</p>
        <h1 className="relative font-display text-2xl font-bold sm:text-3xl">
          {resumen?.cargado ? `${resumen.total.toLocaleString("es")} atletas` : resumen ? "Aún no hay lista cargada" : "Cargando…"}
        </h1>
        {resumen?.cargado && (
          <p className="relative mt-1 text-sm text-white/55">
            {resumen.fuente === "HOJA_FVP" ? "Hoja oficial de la FVP" : `Subida por ${resumen.por ?? "el staff"} (${resumen.origen})`} · {fecha(resumen.cargadoEn)}
          </p>
        )}
        {resumen?.ultimoError && <p className="relative mt-2 text-sm text-coral">Último intento ({fecha(resumen.ultimoError.en)}): {resumen.ultimoError.mensaje}</p>}
        {resumen?.cargado && (
          <div className="relative mt-4 flex flex-wrap gap-2">
            {[...NIVELES_TORNEO].reverse().map((n) =>
              resumen.porCategoria[n] ? (
                <span key={n} className="chip text-xs">
                  {etiquetaNivel(n)} <b className="text-lima">{resumen.porCategoria[n]!.toLocaleString("es")}</b>
                </span>
              ) : null,
            )}
            {Object.entries(resumen.especiales ?? {}).map(([e, n]) => (
              <span key={e} className="chip text-xs">
                {e} <b className="text-cielo">{n.toLocaleString("es")}</b>
              </span>
            ))}
          </div>
        )}
        <div className="relative mt-5 flex flex-wrap gap-2">
          <button className="btn-neon" disabled={ocupado} onClick={() => correr({ accion: "sincronizar" }, "Sincronizada con la FVP")}>
            <RefreshCw className={ocupado ? "size-4 animate-spin" : "size-4"} /> Sincronizar ahora
          </button>
          <button className="btn-ghost" disabled={ocupado} onClick={() => archivo.current?.click()}>
            <FileUp className="size-4" /> Subir CSV
          </button>
          <button className="btn-ghost" disabled={ocupado} onClick={() => setPegar(true)}>
            <ClipboardPaste className="size-4" /> Pegar
          </button>
        </div>
        <input
          ref={archivo}
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            if (f) leerArchivo(f);
            e.currentTarget.value = "";
          }}
        />
      </section>

      <section className="mt-6 text-sm text-white/60">
        <p>
          Cada día a las 6:00 a. m. la app lee la{" "}
          <a href={urlHoja(HOJA_FVP.id, HOJA_FVP.gids[0])} target="_blank" rel="noreferrer" className="font-semibold text-neon hover:underline">
            lista de ascensos y actualización del ranking FVP <ExternalLink className="inline size-3" />
          </a>{" "}
          y cruza a cada jugador por cédula. Nadie se inscribe por debajo de su categoría (subir sí se puede). Si la FVP cambia la hoja o deja de publicarla, se conserva la última lista buena y puedes subirla tú: descárgala como CSV o copia todas las celdas y pégalas.
        </p>
      </section>

      <section className="mt-8">
        <p className="label">Buscar atleta</p>
        <label className="glass flex items-center gap-2 rounded-2xl px-3">
          <Search className="size-4 text-white/40" />
          <input className="w-full bg-transparent py-3 outline-none" placeholder="Cédula o nombre" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {resultados && (
          <ul className="glass mt-2 divide-y divide-white/5 rounded-2xl text-sm">
            {resultados.map((a) => (
              <li key={a.clave} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-16 shrink-0 font-display text-lg font-bold leading-tight text-lima">
                  {a.categoria ? etiquetaNivel(a.categoria) : null}
                  {a.especiales?.map((e) => (
                    <span key={e} className="block text-[11px] font-semibold text-cielo">
                      {e}
                    </span>
                  ))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{a.nombre || "Sin nombre"}</span>
                  <span className="text-xs text-white/45">
                    {a.cedula}
                    {a.estado ? ` · ${a.estado}` : ""}
                    {a.movimiento ? ` · ${a.movimiento}${a.origen ? ` desde ${etiquetaNivel(a.origen)}` : ""}` : ""}
                  </span>
                </span>
                {a.puntos != null && <span className="text-xs text-white/50">{a.puntos.toLocaleString("es")} pts</span>}
              </li>
            ))}
            {!resultados.length && <li className="px-4 py-3 text-white/40">Nadie con esa cédula o nombre en la lista.</li>}
          </ul>
        )}
      </section>

      {!!resumen?.avisos.length && (
        <section className="mt-8">
          <p className="label">Avisos de la lista</p>
          <ul className="glass max-h-72 space-y-1 overflow-y-auto rounded-2xl p-4 text-xs text-white/60">
            {resumen.avisos.map((a, i) => (
              <li key={i}>• {a}</li>
            ))}
          </ul>
        </section>
      )}

      <Hoja
        abierta={pegar}
        onClose={() => setPegar(false)}
        titulo="Pegar lista FVP"
        sub="Copia todas las celdas de la hoja (con los títulos) y pégalas aquí"
        pie={
          <button
            className="btn-neon w-full"
            disabled={!texto.trim() || ocupado}
            onClick={async () => {
              if (await correr({ texto, archivo: "Lista pegada" }, "Lista cargada")) {
                setTexto("");
                setPegar(false);
              }
            }}
          >
            Cargar lista
          </button>
        }
      >
        <textarea className="input min-h-48 font-mono text-xs" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={"N°\tCÉDULA\tNOMBRE DEL ATLETA\tCAT. ORIGEN\tGÉNERO\t…\tCATEGORÍA FINAL"} />
      </Hoja>
    </main>
  );
}
