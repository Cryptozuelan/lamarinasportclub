"use client";

/**
 * Fotos de duplas y jugadores: se comprimen en el dispositivo (JPEG ~900 px, < 400 KB),
 * se suben a /api/fotos y se muestran por URL versionada (el navegador las guarda en caché).
 */
import { useEffect } from "react";
import { create } from "zustand";

export type TipoFoto = "dupla" | "jugador";

/** Reduce la foto de la cámara a un JPEG liviano y bien orientado. */
export async function comprimirFoto(file: File, lado = 900): Promise<string> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions).catch(() => null);
  const fuente: CanvasImageSource & { width: number; height: number } =
    bmp ??
    (await new Promise<HTMLImageElement>((ok, mal) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = mal;
      img.src = URL.createObjectURL(file);
    }));
  const escala = Math.min(1, lado / Math.max(fuente.width, fuente.height));
  const c = document.createElement("canvas");
  c.width = Math.round(fuente.width * escala);
  c.height = Math.round(fuente.height * escala);
  c.getContext("2d")!.drawImage(fuente, 0, 0, c.width, c.height);
  let q = 0.8;
  let url = c.toDataURL("image/jpeg", q);
  while (url.length > 400_000 && q > 0.4) {
    q -= 0.1;
    url = c.toDataURL("image/jpeg", q);
  }
  return url;
}

export async function subirFoto(eventoId: string, tipo: TipoFoto, id: string, img: string): Promise<{ url?: string; error?: string }> {
  try {
    const r = await fetch("/api/fotos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventoId, tipo, id, img }) });
    const d = (await r.json()) as { url?: string; error?: string };
    return r.ok ? { url: d.url } : { error: d.error ?? "No se pudo subir la foto." };
  } catch {
    return { error: "Sin conexión: la foto necesita internet para subirse." };
  }
}

export async function borrarFoto(eventoId: string, tipo: TipoFoto, id: string): Promise<boolean> {
  try {
    return (await fetch(`/api/fotos?${new URLSearchParams({ eventoId, tipo, id })}`, { method: "DELETE" })).ok;
  } catch {
    return false;
  }
}

/* ---------- fotos de duplas de un torneo ---------- */

interface EstadoFotos {
  porTorneo: Record<string, Record<string, string>>;
  cargar: (torneoId: string) => Promise<void>;
  poner: (torneoId: string, duplaId: string, url: string | null) => void;
}

export const useFotos = create<EstadoFotos>()((set) => ({
  porTorneo: {},
  async cargar(torneoId) {
    try {
      const r = await fetch(`/api/fotos?torneoId=${encodeURIComponent(torneoId)}`, { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as { fotos: Record<string, string> };
      set((s) => ({ porTorneo: { ...s.porTorneo, [torneoId]: d.fotos } }));
    } catch {
      /* sin conexión: se queda con lo que tenía */
    }
  },
  poner(torneoId, duplaId, url) {
    set((s) => {
      const actual = { ...(s.porTorneo[torneoId] ?? {}) };
      if (url) actual[duplaId] = url;
      else delete actual[duplaId];
      return { porTorneo: { ...s.porTorneo, [torneoId]: actual } };
    });
  },
}));

/** Fotos de las duplas del torneo; se refrescan cada `cadaMs` (30 s por defecto). */
export function useFotosTorneo(torneoId: string | null | undefined, cadaMs = 30_000): Record<string, string> {
  const fotos = useFotos((s) => (torneoId ? s.porTorneo[torneoId] : undefined));
  useEffect(() => {
    if (!torneoId) return;
    const cargar = () => useFotos.getState().cargar(torneoId);
    cargar();
    const id = setInterval(cargar, cadaMs);
    return () => clearInterval(id);
  }, [torneoId, cadaMs]);
  return fotos ?? VACIO;
}
const VACIO: Record<string, string> = {};

/** URL de la foto de una dupla (sin pedir nada: usa lo que ya cargó `useFotosTorneo`). */
export function useFotoDupla(torneoId: string, duplaId: string | null | undefined): string | null {
  return useFotos((s) => (duplaId ? s.porTorneo[torneoId]?.[duplaId] : undefined)) ?? null;
}
