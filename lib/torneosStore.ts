"use client";

/**
 * Estado del cliente para Torneos: mismo esquema que Americanos (lib/store.ts).
 * - localStorage como fuente local; /api/torneos y /api/marcadores como servidor.
 * - BroadcastChannel: el marcador de pista y la TV en el mismo navegador se actualizan al instante.
 * - Sin internet los cambios quedan pendientes y se suben solos.
 * - El marcador punto a punto se sube aparte (es lo que cambia cada pocos segundos).
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { fusionarTorneos } from "@/lib/torneo/torneo";
import { aplicarAccion, type AccionPartido } from "@/lib/torneo/arbitraje";
import { useArbitroStore } from "@/lib/arbitro";
import { useAmericanos } from "@/lib/store";
import type { ApiMarcadoresRespuesta, ApiTorneosRespuesta, MarcadorVivo, Torneo } from "@/types/torneo";

interface EstadoTorneos {
  torneos: Record<string, Torneo>;
  marcadores: Record<string, MarcadorVivo>;
  pendientes: string[];
  marcadoresPendientes: string[];
  /** Acciones de árbitro sobre partidos que no llegaron al servidor (sin señal). */
  accionesPendientes: AccionPendiente[];
  /** torneoId → vence (ISO) de las claves de participante de este dispositivo. */
  accesos: Record<string, string>;
  hidratado: boolean;
  ultimoSync: string | null;
  offline: boolean;
  sincronizar: () => Promise<void>;
  sincronizarMarcadores: (torneoId: string) => Promise<void>;
  guardar: (t: Torneo) => void;
  actualizar: (id: string, fn: (t: Torneo) => Torneo) => void;
  guardarMarcador: (m: MarcadorVivo) => void;
  /** Llamar, empezar, cerrar o dar W.O. a un partido: se aplica ya y el servidor lo aplica sobre su versión. */
  accionPartido: (torneoId: string, partidoId: string, accion: AccionPartido) => Promise<string | null>;
  entrar: (torneoId: string, clave: string) => Promise<string | null>;
}

const canal = typeof window !== "undefined" && "BroadcastChannel" in window ? new BroadcastChannel("lamarina-torneos") : null;

const almacen = {
  getItem(k: string) {
    try {
      const v = localStorage.getItem(k);
      if (v) JSON.parse(v);
      return v;
    } catch {
      return null;
    }
  },
  setItem(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      // Cuota llena: se descartan los marcadores de partidos terminados y se reintenta.
      try {
        const s = JSON.parse(v) as { state: { marcadores: Record<string, MarcadorVivo> } };
        s.state.marcadores = Object.fromEntries(Object.entries(s.state.marcadores).filter(([, m]) => !m.finalizado));
        localStorage.setItem(k, JSON.stringify(s));
      } catch {
        /* sin almacenamiento: sigue en memoria */
      }
    }
  },
  removeItem(k: string) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* nada */
    }
  },
};

const esStaff = () => !!useAmericanos.getState().staff;
const esArbitro = () => !!useArbitroStore.getState().arbitro;

interface AccionPendiente {
  torneoId: string;
  partidoId: string;
  accion: AccionPartido;
  en: string;
}

/** Sube una acción de partido. Devuelve el error del servidor, "offline" si no hubo red, o null. */
async function enviarAccion(a: AccionPendiente): Promise<string | null> {
  try {
    const res = await fetch(`/api/torneos/${encodeURIComponent(a.torneoId)}/partidos/${encodeURIComponent(a.partidoId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(a.accion),
    });
    const data = (await res.json().catch(() => ({}))) as { torneo?: Torneo; error?: string };
    useTorneos.setState((s) => ({
      // Hecha o rechazada, ya no se reintenta.
      accionesPendientes: s.accionesPendientes.filter((x) => x !== a && !(x.partidoId === a.partidoId && x.en === a.en)),
      torneos: data.torneo ? unir(s.torneos, [data.torneo]) : s.torneos,
      offline: false,
    }));
    return res.ok ? null : (data.error ?? "No se pudo guardar.");
  } catch {
    useTorneos.setState({ offline: true });
    return "offline";
  }
}

function unir(local: Record<string, Torneo>, remotos: Torneo[]) {
  const out = { ...local };
  for (const t of remotos) {
    // Sin acceso (o clave vencida) el servidor manda un resumen: reemplaza lo local.
    if (t.bloqueado) out[t.id] = t;
    else out[t.id] = out[t.id] && !out[t.id].bloqueado ? fusionarTorneos(out[t.id], t) : t;
  }
  return out;
}

const masNuevo = (a: MarcadorVivo | undefined, b: MarcadorVivo) => (!a || b.actualizadoEn > a.actualizadoEn ? b : a);

async function enviar(t: Torneo) {
  try {
    const res = await fetch("/api/torneos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ torneo: t }) });
    if (res.status === 401) {
      if (useAmericanos.getState().staff) useAmericanos.setState({ staff: null, pedirLogin: true });
      return;
    }
    if (!res.ok) return;
    const data = (await res.json()) as { torneo?: Torneo };
    useTorneos.setState((s) => ({
      torneos: data.torneo ? unir(s.torneos, [data.torneo]) : s.torneos,
      pendientes: s.pendientes.filter((id) => id !== t.id || s.torneos[id]?.actualizadoEn !== t.actualizadoEn),
      offline: false,
    }));
  } catch {
    useTorneos.setState({ offline: true });
  }
}

async function enviarMarcador(m: MarcadorVivo) {
  try {
    const res = await fetch("/api/marcadores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ marcador: m }) });
    if (!res.ok) return;
    useTorneos.setState((s) => ({
      marcadoresPendientes: s.marcadoresPendientes.filter((id) => id !== m.id || s.marcadores[id]?.actualizadoEn !== m.actualizadoEn),
      offline: false,
    }));
  } catch {
    useTorneos.setState({ offline: true });
  }
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
function subir(clave: string, ms: number, fn: () => void) {
  clearTimeout(timers.get(clave));
  timers.set(
    clave,
    setTimeout(() => {
      timers.delete(clave);
      fn();
    }, ms),
  );
}

export const useTorneos = create<EstadoTorneos>()(
  persist(
    (set, get) => ({
      torneos: {},
      marcadores: {},
      pendientes: [],
      marcadoresPendientes: [],
      accionesPendientes: [],
      accesos: {},
      hidratado: false,
      ultimoSync: null,
      offline: false,

      async sincronizar() {
        try {
          const [rt, ra] = await Promise.all([fetch("/api/torneos?todos=1", { cache: "no-store" }), fetch("/api/torneos/acceso", { cache: "no-store" })]);
          if (!rt.ok) throw new Error(String(rt.status));
          const data = (await rt.json()) as ApiTorneosRespuesta;
          const accesos = ra.ok ? ((await ra.json()) as { accesos: Record<string, string> }).accesos : get().accesos;
          set((s) => ({ torneos: unir(s.torneos, data.torneos), accesos, ultimoSync: new Date().toISOString(), offline: false }));
          if (!esStaff() && !esArbitro()) return;
          const { accionesPendientes } = get();
          for (const a of accionesPendientes) await enviarAccion(a);
          if (!esStaff()) {
            // El árbitro solo sube sus marcadores; el torneo lo cambia el servidor con sus acciones.
            const { marcadores: ms, marcadoresPendientes: mp } = get();
            await Promise.all(mp.map((id) => ms[id]).filter(Boolean).map(enviarMarcador));
            return;
          }
          const remotos = new Map(data.torneos.map((t) => [t.id, t]));
          const { torneos, pendientes, marcadores, marcadoresPendientes } = get();
          await Promise.all([
            ...Object.values(torneos)
              .filter((t) => !t.bloqueado && (pendientes.includes(t.id) || !remotos.has(t.id) || t.actualizadoEn > remotos.get(t.id)!.actualizadoEn))
              .map(enviar),
            ...marcadoresPendientes.map((id) => marcadores[id]).filter(Boolean).map(enviarMarcador),
          ]);
        } catch {
          set({ offline: true });
        }
      },

      async sincronizarMarcadores(torneoId) {
        try {
          const res = await fetch(`/api/marcadores?torneoId=${encodeURIComponent(torneoId)}`, { cache: "no-store" });
          if (!res.ok) return;
          const { marcadores } = (await res.json()) as ApiMarcadoresRespuesta;
          set((s) => {
            const out = { ...s.marcadores };
            for (const m of marcadores) out[m.id] = masNuevo(out[m.id], m);
            return { marcadores: out };
          });
        } catch {
          /* se reintenta en el próximo ciclo */
        }
      },

      guardar(t) {
        set((s) => ({ torneos: { ...s.torneos, [t.id]: t }, pendientes: s.pendientes.includes(t.id) ? s.pendientes : [...s.pendientes, t.id] }));
        canal?.postMessage({ tipo: "torneo", torneo: t });
        subir(`t:${t.id}`, 400, () => {
          const actual = get().torneos[t.id];
          if (actual) enviar(actual);
        });
      },

      actualizar(id, fn) {
        const actual = get().torneos[id];
        if (actual && !actual.bloqueado) get().guardar(fn(actual));
      },

      guardarMarcador(m) {
        set((s) => ({
          marcadores: { ...s.marcadores, [m.id]: m },
          marcadoresPendientes: s.marcadoresPendientes.includes(m.id) ? s.marcadoresPendientes : [...s.marcadoresPendientes, m.id],
        }));
        canal?.postMessage({ tipo: "marcador", marcador: m });
        // Rápido para que la pantalla de pista vaya casi al ritmo del partido.
        subir(`m:${m.id}`, 250, () => {
          const actual = get().marcadores[m.id];
          if (actual) enviarMarcador(actual);
        });
      },

      async accionPartido(torneoId, partidoId, accion) {
        const t = get().torneos[torneoId];
        if (!t || t.bloqueado) return "Torneo no disponible en este dispositivo.";
        const nombre = useAmericanos.getState().staff?.nombre ?? (useArbitroStore.getState().arbitro ? `Árbitro ${useArbitroStore.getState().arbitro!.nombre}` : undefined);
        const local = aplicarAccion(t, partidoId, accion, nombre);
        set((s) => ({ torneos: { ...s.torneos, [torneoId]: local } }));
        canal?.postMessage({ tipo: "torneo", torneo: local });
        const pendiente: AccionPendiente = { torneoId, partidoId, accion, en: new Date().toISOString() };
        set((s) => ({ accionesPendientes: [...s.accionesPendientes, pendiente] }));
        const error = await enviarAccion(pendiente);
        if (error === "offline") {
          // Queda en cola (ya está en accionesPendientes) y se sube sola al volver la señal.
          return null;
        }
        if (error) {
          // El servidor no la aceptó: se vuelve a lo que diga el servidor.
          await get().sincronizar();
        }
        return error;
      },

      async entrar(torneoId, clave) {
        try {
          const r = await fetch("/api/torneos/acceso", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ torneoId, clave }) });
          const d = (await r.json()) as { ok?: boolean; vence?: string | null; error?: string };
          if (!r.ok) return d.error ?? "No se pudo entrar.";
          if (d.vence) set((s) => ({ accesos: { ...s.accesos, [torneoId]: d.vence! } }));
          await get().sincronizar();
          return null;
        } catch {
          return "Sin conexión. Necesitas internet para entrar con la clave.";
        }
      },
    }),
    {
      name: "lamarina-torneos-v1",
      storage: createJSONStorage(() => almacen),
      partialize: (s) => ({
        torneos: s.torneos,
        marcadores: s.marcadores,
        pendientes: s.pendientes,
        marcadoresPendientes: s.marcadoresPendientes,
        accionesPendientes: s.accionesPendientes,
        accesos: s.accesos,
      }),
      skipHydration: true,
    },
  ),
);

canal?.addEventListener("message", (ev: MessageEvent) => {
  const msg = ev.data as { tipo: "torneo"; torneo: Torneo } | { tipo: "marcador"; marcador: MarcadorVivo };
  if (msg.tipo === "torneo") useTorneos.setState((s) => ({ torneos: unir(s.torneos, [msg.torneo]) }));
  if (msg.tipo === "marcador") useTorneos.setState((s) => ({ marcadores: { ...s.marcadores, [msg.marcador.id]: masNuevo(s.marcadores[msg.marcador.id], msg.marcador) } }));
});

if (typeof window !== "undefined") {
  window.addEventListener("online", () => useTorneos.getState().sincronizar());
}

export function useTorneo(id: string) {
  return useTorneos((s) => (s.torneos[id]?.eliminado ? undefined : s.torneos[id]));
}

export function useListaTorneos() {
  const torneos = useTorneos((s) => s.torneos);
  return Object.values(torneos)
    .filter((t) => !t.eliminado)
    .sort((a, b) => (b.dias[0]?.fecha ?? "").localeCompare(a.dias[0]?.fecha ?? "") || b.actualizadoEn.localeCompare(a.actualizadoEn));
}

export function useMarcador(partidoId?: string | null) {
  return useTorneos((s) => (partidoId ? s.marcadores[partidoId] : undefined));
}
