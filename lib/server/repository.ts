/**
 * Capa de persistencia de los endpoints /api/americanos.
 *
 * - MODO DEMO (sin variables de entorno): memoria del servidor, sembrada con
 *   data/mockData.json. En Vercel cada instancia serverless tiene su propia
 *   memoria, así que es solo para demostraciones; el navegador además guarda
 *   todo en localStorage.
 * - MODO SUPABASE: se activa al definir NEXT_PUBLIC_SUPABASE_URL y
 *   SUPABASE_SERVICE_ROLE_KEY. Juan: implementa aquí el mapeo a las tablas de
 *   PadelReserve (ver docs/BACKEND.md). Por defecto usa una tabla JSONB
 *   `americanos_eventos` vía PostgREST, que funciona sin dependencias extra.
 * - MODO POSTGRES: se activa con `DATABASE_URL` y tiene prioridad sobre
 *   Supabase. Usa las tablas de db/postgres.sql, separadas por
 *   `tenant_id` (`TENANT_ID`, por defecto la_marina_sport_club).
 */
import "server-only";
import mock from "@/data/mockData.json";
import { CLUB_POR_DEFECTO } from "@/lib/horarios";
import { consultar, postgresActivo, tenantId } from "@/lib/server/db";
import type { ConfigClub, EventoAmericano } from "@/types/americano";

export interface AmericanosRepository {
  modo: "DEMO" | "SUPABASE" | "POSTGRES";
  listar(): Promise<EventoAmericano[]>;
  obtener(id: string): Promise<EventoAmericano | null>;
  guardar(evento: EventoAmericano): Promise<EventoAmericano>;
  eliminar(id: string): Promise<boolean>;
  obtenerClub(): Promise<ConfigClub>;
  guardarClub(club: ConfigClub): Promise<ConfigClub>;
}

const ordenar = (lista: EventoAmericano[]) => [...lista].sort((a, b) => b.actualizadoEn.localeCompare(a.actualizadoEn));

/* ---------- DEMO ---------- */

const memoria = globalThis as unknown as { __americanosDemo?: Map<string, EventoAmericano>; __clubDemo?: ConfigClub };

function almacenDemo(): Map<string, EventoAmericano> {
  if (!memoria.__americanosDemo) {
    memoria.__americanosDemo = new Map((mock.eventos as unknown as EventoAmericano[]).map((e) => [e.id, structuredClone(e)]));
  }
  return memoria.__americanosDemo;
}

const demoRepository: AmericanosRepository = {
  modo: "DEMO",
  async listar() {
    return ordenar([...almacenDemo().values()]);
  },
  async obtener(id) {
    return almacenDemo().get(id) ?? null;
  },
  async guardar(evento) {
    almacenDemo().set(evento.id, evento);
    return evento;
  },
  async eliminar(id) {
    return almacenDemo().delete(id);
  },
  async obtenerClub() {
    return memoria.__clubDemo ?? CLUB_POR_DEFECTO;
  },
  async guardarClub(club) {
    memoria.__clubDemo = club;
    return club;
  },
};

/* ---------- SUPABASE (PostgREST) ---------- */

function supabaseRepository(url: string, key: string): AmericanosRepository {
  const tabla = process.env.SUPABASE_AMERICANOS_TABLE ?? "americanos_eventos";
  const base = `${url.replace(/\/$/, "")}/rest/v1/${tabla}`;
  const baseClub = `${url.replace(/\/$/, "")}/rest/v1/${process.env.SUPABASE_CLUB_TABLE ?? "club_config"}`;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  async function pedir<T>(path: string, init?: RequestInit, url = base): Promise<T> {
    const res = await fetch(`${url}${path}`, { ...init, headers: { ...headers, ...init?.headers }, cache: "no-store" });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    return (res.status === 204 ? null : await res.json()) as T;
  }

  return {
    modo: "SUPABASE",
    async listar() {
      const filas = await pedir<{ data: EventoAmericano }[]>("?select=data&order=actualizado_en.desc");
      return filas.map((f) => f.data);
    },
    async obtener(id) {
      const filas = await pedir<{ data: EventoAmericano }[]>(`?select=data&id=eq.${encodeURIComponent(id)}`);
      return filas[0]?.data ?? null;
    },
    async guardar(evento) {
      await pedir("", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ id: evento.id, data: evento, estado: evento.estado, actualizado_en: evento.actualizadoEn }),
      });
      return evento;
    },
    async eliminar(id) {
      await pedir(`?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
      return true;
    },
    async obtenerClub() {
      const filas = await pedir<{ data: ConfigClub }[]>("?select=data&id=eq.la-marina", undefined, baseClub);
      return filas[0]?.data ?? CLUB_POR_DEFECTO;
    },
    async guardarClub(club) {
      await pedir(
        "",
        { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: "la-marina", data: club }) },
        baseClub,
      );
      return club;
    },
  };
}

/* ---------- POSTGRES (Dokploy / Lyria) ---------- */

/** Tablas de db/postgres.sql, siempre filtradas por tenant. */
const postgresRepository: AmericanosRepository = {
  modo: "POSTGRES",
  async listar() {
    const filas = await consultar<{ data: EventoAmericano }>("select data from americanos_eventos where tenant_id = $1 order by actualizado_en desc", [tenantId()]);
    return filas.map((f) => f.data);
  },
  async obtener(id) {
    const filas = await consultar<{ data: EventoAmericano }>("select data from americanos_eventos where tenant_id = $1 and id = $2", [tenantId(), id]);
    return filas[0]?.data ?? null;
  },
  async guardar(evento) {
    await consultar(
      `insert into americanos_eventos (tenant_id, id, data, estado, actualizado_en) values ($1, $2, $3, $4, $5)
       on conflict (tenant_id, id) do update set data = excluded.data, estado = excluded.estado, actualizado_en = excluded.actualizado_en`,
      [tenantId(), evento.id, evento, evento.estado, evento.actualizadoEn],
    );
    return evento;
  },
  async eliminar(id) {
    await consultar("delete from americanos_eventos where tenant_id = $1 and id = $2", [tenantId(), id]);
    return true;
  },
  async obtenerClub() {
    const filas = await consultar<{ data: ConfigClub }>("select data from americanos_club_config where tenant_id = $1", [tenantId()]);
    return filas[0]?.data ?? CLUB_POR_DEFECTO;
  },
  async guardarClub(club) {
    await consultar(
      `insert into americanos_club_config (tenant_id, data, actualizado_en) values ($1, $2, now())
       on conflict (tenant_id) do update set data = excluded.data, actualizado_en = now()`,
      [tenantId(), club],
    );
    return club;
  },
};

/** DATABASE_URL → Postgres; si no, Supabase; si no, DEMO. */
export function getRepository(): AmericanosRepository {
  if (postgresActivo()) return postgresRepository;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? supabaseRepository(url, key) : demoRepository;
}
