"use client";

/**
 * Sesión de árbitro (anotador) en este dispositivo: rol aparte del staff, del plantel del club
 * (sirve para todos los torneos).
 * La cookie la pone el servidor (POST /api/arbitro); aquí solo se refleja quién es.
 */
import { create } from "zustand";

export interface Arbitro {
  /** Árbitro del plantel del club. */
  id: string;
  nombre: string;
}

/** Lo que muestra la pantalla de entrada: nombre e inicial del apellido. */
export interface ArbitroLista {
  id: string;
  nombre: string;
  apellido: string;
}

export interface DatosRegistro {
  pin: string;
  nombre: string;
  apellido: string;
  telefono: string;
  codigo: string;
}

interface EstadoArbitro {
  /** undefined = todavía no se sabe. */
  arbitro: Arbitro | null | undefined;
  cargar: () => Promise<void>;
  entrar: (arbitroId: string, codigo: string) => Promise<string | null>;
  registrar: (d: DatosRegistro) => Promise<string | null>;
  salir: () => Promise<void>;
}

export const useArbitroStore = create<EstadoArbitro>()((set) => ({
  arbitro: undefined,
  async cargar() {
    try {
      const r = await fetch("/api/arbitro", { cache: "no-store" });
      const d = (await r.json()) as { arbitro: Arbitro | null };
      set({ arbitro: d.arbitro });
    } catch {
      set((s) => ({ arbitro: s.arbitro ?? null }));
    }
  },
  async entrar(arbitroId, codigo) {
    return enviar(set, "/api/arbitro", { arbitroId, codigo });
  },
  async registrar(datos) {
    return enviar(set, "/api/arbitro/registro", datos);
  },
  async salir() {
    try {
      await fetch("/api/arbitro", { method: "DELETE" });
    } finally {
      set({ arbitro: null });
    }
  },
}));

async function enviar(set: (p: Partial<EstadoArbitro>) => void, url: string, body: object): Promise<string | null> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = (await r.json()) as { arbitro?: Arbitro; error?: string };
    if (!r.ok || !d.arbitro) return d.error ?? "No se pudo entrar.";
    set({ arbitro: d.arbitro });
    return null;
  } catch {
    return "Sin conexión. Necesitas internet para entrar como árbitro.";
  }
}

/** Plantel del club para elegir "¿quién eres?". `abierto` = el staff ya creó el PIN de árbitros. */
export async function listarArbitros(): Promise<{ abierto: boolean; arbitros: ArbitroLista[] } | null> {
  try {
    const r = await fetch("/api/arbitros", { cache: "no-store" });
    return r.ok ? ((await r.json()) as { abierto: boolean; arbitros: ArbitroLista[] }) : null;
  } catch {
    return null;
  }
}

let pedido = false;
/** Árbitro de este dispositivo (lo consulta una vez por carga). */
export function useArbitro(): Arbitro | null | undefined {
  const arbitro = useArbitroStore((s) => s.arbitro);
  if (typeof window !== "undefined" && !pedido) {
    pedido = true;
    queueMicrotask(() => useArbitroStore.getState().cargar());
  }
  return arbitro;
}

/** ¿Puede anotar este torneo? Los árbitros del club anotan en cualquier torneo. */
export const esArbitroDe = (a: Arbitro | null | undefined, _torneoId?: string) => !!a;
