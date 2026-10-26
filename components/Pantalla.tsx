"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";

/** Piezas de las pantallas grandes (Modo TV y pantallas de pista): escala fija, pantalla completa y sin que se apague. */

export function useFullscreenYWakeLock() {
  const [full, setFull] = useState(false);
  useEffect(() => {
    const h = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    // Evita que la pantalla del bar se apague.
    let lock: { release: () => Promise<void> } | null = null;
    const pedir = () =>
      (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock
        ?.request("screen")
        .then((l) => (lock = l))
        .catch(() => undefined);
    pedir();
    document.addEventListener("visibilitychange", pedir);
    return () => {
      document.removeEventListener("fullscreenchange", h);
      document.removeEventListener("visibilitychange", pedir);
      lock?.release().catch(() => undefined);
    };
  }, []);
  const alternar = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => undefined);
  return { full, alternar };
}

export function useCursorOculto() {
  const [oculto, setOculto] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const mover = () => {
      setOculto(false);
      clearTimeout(t);
      t = setTimeout(() => setOculto(true), 3000);
    };
    mover();
    window.addEventListener("mousemove", mover);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousemove", mover);
    };
  }, []);
  return oculto;
}

export function Reloj() {
  const [h, setH] = useState("");
  useEffect(() => {
    const f = () => setH(new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }));
    f();
    const t = setInterval(f, 10_000);
    return () => clearInterval(t);
  }, []);
  return <span className="font-display text-3xl font-semibold tabular text-white/70">{h}</span>;
}

export function useVertical() {
  const [vertical, setVertical] = useState(false);
  useEffect(() => {
    const ver = () => setVertical(window.innerHeight > window.innerWidth * 1.1);
    ver();
    window.addEventListener("resize", ver);
    return () => window.removeEventListener("resize", ver);
  }, []);
  return vertical;
}

export function Escenario({ oculto, vertical, children }: { oculto: boolean; vertical: boolean; children: React.ReactNode }) {
  const [ancho, alto] = vertical ? [1080, 1920] : [1920, 1080];
  const [escala, setEscala] = useState(1);
  useEffect(() => {
    const ajustar = () => setEscala(Math.min(window.innerWidth / ancho, window.innerHeight / alto));
    ajustar();
    window.addEventListener("resize", ajustar);
    return () => window.removeEventListener("resize", ajustar);
  }, [ancho, alto]);
  return (
    <main className={clsx("tema-noche pantalla fixed inset-0 flex items-center justify-center overflow-hidden", oculto && "cursor-none")}>
      <div
        className="flex shrink-0 flex-col gap-6 p-10"
        style={{ width: ancho, height: alto, transform: `scale(${escala})`, transformOrigin: "center" }}
      >
        {children}
      </div>
    </main>
  );
}
