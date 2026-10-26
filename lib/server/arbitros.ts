import "server-only";
import type { NextResponse } from "next/server";
import type { ArbitroRegistrado, Torneo } from "@/types/torneo";
import { COOKIE_ARBITRO, crearTokenArbitro, hashCodigo, huellaClave, type SesionArbitro } from "./auth";
import { ErrorApi } from "./http";
import { getTorneosRepository } from "./repository";

/**
 * Plantel de árbitros del club. Vive aparte de los torneos (tabla `eventos_extras`, id
 * "arbitros:club") para que el código personal nunca viaje con un torneo y para que un
 * registro no compita con los cambios del staff. El staff crea el PIN de árbitros en
 * Ajustes; cada árbitro se registra una sola vez y su nombre y código sirven en todos los torneos.
 */
export interface ArbitroGuardado extends ArbitroRegistrado {
  codigoHash: string;
  actualizadoEn: string;
}

export interface PlantelArbitros {
  /** PIN para registrarse (solo lo ve el staff). null = registro cerrado. */
  pin: string | null;
  arbitros: ArbitroGuardado[];
}

/** El código se firma con este ámbito (antes era el id del torneo). */
export const AMBITO = "club";
const ID_PLANTEL = "arbitros:club";

export async function leerPlantel(): Promise<PlantelArbitros> {
  const x = await getTorneosRepository().obtenerExtra(ID_PLANTEL);
  const d = (x?.data ?? {}) as { pin?: string | null; arbitros?: (ArbitroGuardado & { codigoDemo?: string })[] };
  return {
    pin: d.pin ?? null,
    // Los árbitros de prueba (botón "Cargar datos de prueba") traen el código en claro solo para la demo.
    arbitros: (d.arbitros ?? []).map(({ codigoDemo, ...a }) => (!a.codigoHash && codigoDemo ? { ...a, codigoHash: hashCodigo(AMBITO, a.id, codigoDemo) } : a)),
  };
}

export async function guardarPlantel(p: PlantelArbitros): Promise<void> {
  await getTorneosRepository().guardarExtra({ id: ID_PLANTEL, torneoId: AMBITO, tipo: "arbitros", data: p, actualizadoEn: new Date().toISOString() });
}

/** Lo que ve cualquiera en la pantalla de entrada: nombre e inicial del apellido. */
export const arbitroPublico = (a: ArbitroGuardado) => ({ id: a.id, nombre: a.nombre, apellido: a.apellido ? `${a.apellido[0]}.` : "", activo: a.activo, registradoEn: a.registradoEn });

/** Lo que ve el staff: todo menos el código. */
export const arbitroStaff = ({ codigoHash: _c, actualizadoEn: _u, ...a }: ArbitroGuardado): ArbitroRegistrado => a;

export const nombreArbitro = (a: Pick<ArbitroRegistrado, "nombre" | "apellido">) => `${a.nombre} ${a.apellido}`.trim();

/** Huella del código que va en la cookie: si cambia el código, la sesión cae. */
export const huellaCodigo = (a: ArbitroGuardado) => huellaClave(a.codigoHash);

/** La sesión vale si el PIN del club no cambió y el árbitro sigue registrado, activo y con el mismo código. */
export async function sesionValida(s?: SesionArbitro | null, plantel?: PlantelArbitros): Promise<ArbitroGuardado | null> {
  if (!s?.arbitroId) return null;
  const p = plantel ?? (await leerPlantel());
  if (!p.pin || s.huella !== huellaClave(p.pin)) return null;
  const a = p.arbitros.find((x) => x.id === s.arbitroId);
  return a && a.activo && huellaCodigo(a) === s.hc ? a : null;
}

/** Para escribir en un torneo: sesión válida y el torneo existe. */
export async function arbitroValido(t: Torneo, s?: SesionArbitro | null): Promise<ArbitroGuardado | null> {
  if (t.eliminado) return null;
  return sesionValida(s);
}

export const opcionesCookie = (maxAge: number) => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge });

/** Plantel con el registro abierto, o el error que corresponde. */
export async function plantelAbierto(): Promise<PlantelArbitros & { pin: string }> {
  const p = await leerPlantel();
  if (!p.pin) throw new ErrorApi(403, "El club todavía no creó el PIN de árbitros. Pídelo al staff.");
  return p as PlantelArbitros & { pin: string };
}

/** Deja la sesión del árbitro en este dispositivo (una jornada: 16 h). */
export function conSesion(res: NextResponse, p: PlantelArbitros & { pin: string }, a: ArbitroGuardado): NextResponse {
  const { token, maxAge } = crearTokenArbitro({ arbitroId: a.id, nombre: nombreArbitro(a), huella: huellaClave(p.pin), hc: huellaCodigo(a) });
  res.cookies.set(COOKIE_ARBITRO, token, opcionesCookie(maxAge));
  return res;
}

export const sesionPublica = (a: ArbitroGuardado) => ({ id: a.id, nombre: nombreArbitro(a) });

/** PIN de árbitros nuevo: 4 dígitos con el generador criptográfico. */
export function pinNuevo(): string {
  const b = new Uint32Array(1);
  globalThis.crypto.getRandomValues(b);
  return String(b[0] % 10000).padStart(4, "0");
}
