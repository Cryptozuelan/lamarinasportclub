import "server-only";
import mock from "@/data/mockData.json";
import type { EventoAmericano } from "@/types/americano";
import type { MarcadorVivo, Torneo } from "@/types/torneo";
import { leerPlantel, guardarPlantel, type ArbitroGuardado } from "./arbitros";
import { getRepository, getTorneosRepository } from "./repository";

/**
 * Datos de prueba para enseñar la app (botón en Ajustes): dos americanos en juego y uno terminado,
 * un torneo en pleno desarrollo con marcadores punto a punto, y seis árbitros (código 1234, PIN 2468).
 * Las fechas se corren para que el torneo y los americanos sean de hoy.
 */
const DIA_BASE = "2026-10-24";
const datos = mock as unknown as { eventos: EventoAmericano[]; torneos: Torneo[]; marcadores: MarcadorVivo[]; extras: { data: { pin: string; arbitros: (ArbitroGuardado & { codigoDemo?: string })[] } }[] };

/** Lo cargado lleva ids "demo-…": así se reconoce para borrarlo, y cada carga es nueva (un evento borrado no revive). */
const PREFIJO = "demo-";
const ARBITROS_DEMO = datos.extras.flatMap((x) => x.data.arbitros.map((a) => a.id));

const hoyClub = () => new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10);

/** Corre todas las fechas `dias` días (las horas quedan igual) y renombra los ids de eventos. */
function correr<T>(x: T, dias: number, ids: Map<string, string>): T {
  let json = JSON.stringify(x);
  for (const [viejo, nuevo] of ids) json = json.split(`"${viejo}`).join(`"${nuevo}`);
  if (!dias) return JSON.parse(json) as T;
  json = json.replace(/"(\d{4}-\d{2}-\d{2})(T[^"]*)?"/g, (_, f: string, resto = "") => {
    const d = new Date(`${f}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + dias);
    return `"${d.toISOString().slice(0, 10)}${resto}"`;
  });
  return JSON.parse(json) as T;
}

export async function cargarDemo(): Promise<{ americanos: number; torneos: number; arbitros: number }> {
  const dias = Math.round((new Date(`${hoyClub()}T12:00:00Z`).getTime() - new Date(`${DIA_BASE}T12:00:00Z`).getTime()) / 86_400_000);
  const ahora = new Date().toISOString();
  const marca = Date.now().toString(36);
  const ids = new Map([...datos.eventos, ...datos.torneos].map((x) => [x.id, `${PREFIJO}${marca}-${x.id}`]));
  const am = getRepository();
  for (const e of datos.eventos) await am.guardar({ ...correr(e, dias, ids), actualizadoEn: ahora });
  const tr = getTorneosRepository();
  for (const t of datos.torneos) await tr.guardar({ ...correr(t, dias, ids), actualizadoEn: ahora });
  for (const m of datos.marcadores) await tr.guardarMarcador(correr(m, dias, ids));
  const p = await leerPlantel();
  const nuevos = datos.extras.flatMap((x) => x.data.arbitros).filter((a) => !p.arbitros.some((y) => y.id === a.id));
  await guardarPlantel({ pin: p.pin ?? datos.extras[0]?.data.pin ?? null, arbitros: [...p.arbitros, ...(nuevos as ArbitroGuardado[])] });
  return { americanos: datos.eventos.length, torneos: datos.torneos.length, arbitros: nuevos.length };
}

/** Quita lo que cargó `cargarDemo` (borrado lógico, así los otros dispositivos también lo sueltan). */
export async function borrarDemo(): Promise<void> {
  const ahora = new Date().toISOString();
  const am = getRepository();
  for (const e of await am.listar()) if (e.id.startsWith(PREFIJO) && !e.eliminado) await am.guardar({ ...e, eliminado: true, actualizadoEn: ahora });
  const tr = getTorneosRepository();
  for (const t of await tr.listar()) if (t.id.startsWith(PREFIJO) && !t.eliminado) await tr.guardar({ ...t, eliminado: true, actualizadoEn: ahora });
  const p = await leerPlantel();
  await guardarPlantel({ ...p, arbitros: p.arbitros.filter((a) => !ARBITROS_DEMO.includes(a.id)) });
}
