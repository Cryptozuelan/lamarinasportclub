/** Validación de payloads de torneos y marcadores que llegan a la API (lista vacía = válido). */
import type { MarcadorVivo, Torneo } from "@/types/torneo";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID = /^[\w:.-]{1,160}$/;

export const MAX_CATEGORIAS = 40;
export const MAX_DUPLAS_CATEGORIA = 128;

const texto = (x: unknown, max = 200): x is string => typeof x === "string" && x.trim().length > 0 && x.length <= max;

export function validarTorneo(x: unknown): string[] {
  const errores: string[] = [];
  const err = (m: string) => errores.length < 25 && errores.push(m);
  if (!x || typeof x !== "object") return ["El torneo debe ser un objeto."];
  const t = x as Partial<Torneo>;
  if (!texto(t.id, 100) || !ID.test(t.id)) err("id inválido.");
  if (!texto(t.nombre, 120)) err("nombre es obligatorio (máx. 120 caracteres).");
  if (!Array.isArray(t.dias) || !t.dias.length || t.dias.length > 31) err("dias: entre 1 y 31 días.");
  else
    for (const d of t.dias) {
      if (!FECHA.test(d?.fecha ?? "") || !HORA.test(d?.inicio ?? "") || !HORA.test(d?.fin ?? "")) err("Cada día necesita fecha YYYY-MM-DD e inicio/fin HH:MM.");
      else if (d.fin <= d.inicio) err(`${d.fecha}: la hora de fin debe ser posterior al inicio.`);
    }
  if (!Array.isArray(t.canchas) || !t.canchas.length) err("canchas: al menos una pista.");
  if (!Array.isArray(t.categorias) || t.categorias.length > MAX_CATEGORIAS) err(`categorias: máximo ${MAX_CATEGORIAS}.`);
  else
    for (const c of t.categorias) {
      if (!c?.categoria?.id || !ID.test(c.categoria.id)) err("Categoría sin id válido.");
      if (!Array.isArray(c?.duplas) || c.duplas.length > MAX_DUPLAS_CATEGORIA) err(`${c?.categoria?.id}: máximo ${MAX_DUPLAS_CATEGORIA} duplas.`);
    }
  if (!Array.isArray(t.jugadores)) err("jugadores debe ser una lista.");
  if (t.acceso != null && (typeof t.acceso.clave !== "string" || t.acceso.clave.length > 40 || typeof t.acceso.vence !== "string")) err("acceso inválido.");
  if (t.arbitros != null && typeof t.arbitros !== "object") err("arbitros inválido.");
  const turnos = t.arbitros?.turnos;
  if (turnos != null) {
    if (!Array.isArray(turnos) || turnos.length > 500) err("arbitros.turnos: máximo 500.");
    else if (turnos.some((x) => !x || typeof x.arbitroId !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x.fecha) || !/^\d{2}:\d{2}$/.test(x.desde) || !/^\d{2}:\d{2}$/.test(x.hasta) || !Number.isInteger(x.pista)))
      err("arbitros.turnos: cada turno necesita árbitro, fecha, pista y horario.");
  }
  if (t.sedes != null && (!Array.isArray(t.sedes) || t.sedes.length > 8 || t.sedes.some((s) => !texto(s?.nombre, 80) || typeof s.trasladoMin !== "number"))) err("sedes: máximo 8, con nombre y traslado.");
  if (t.patrocinadores != null) {
    if (!Array.isArray(t.patrocinadores) || t.patrocinadores.length > 16) err("patrocinadores: máximo 16.");
    else if (t.patrocinadores.some((p) => !texto(p?.nombre, 80) || (p.logo != null && (typeof p.logo !== "string" || !p.logo.startsWith("data:image/") || p.logo.length > 150_000))))
      err("Cada patrocinador necesita nombre y, si tiene logo, una imagen de hasta ~100 KB.");
  }
  if (typeof t.actualizadoEn !== "string") err("actualizadoEn es obligatorio.");
  return errores;
}

export function validarMarcador(x: unknown): string[] {
  if (!x || typeof x !== "object") return ["El marcador debe ser un objeto."];
  const m = x as Partial<MarcadorVivo>;
  const errores: string[] = [];
  if (!texto(m.id, 160) || !ID.test(m.id)) errores.push("id inválido.");
  if (!texto(m.torneoId, 100)) errores.push("torneoId es obligatorio.");
  if (!Array.isArray(m.ordenSaque) || m.ordenSaque.length !== 4) errores.push("ordenSaque: 4 jugadores.");
  if (!Array.isArray(m.puntos) || m.puntos.length > 600) errores.push("puntos: máximo 600.");
  else if (m.puntos.some((p) => p?.gana !== "A" && p?.gana !== "B")) errores.push("Cada punto necesita gana: A o B.");
  if (m.sanciones != null && (!Array.isArray(m.sanciones) || m.sanciones.length > 20)) errores.push("sanciones: máximo 20.");
  if (m.atenciones != null && (!Array.isArray(m.atenciones) || m.atenciones.length > 20)) errores.push("atenciones: máximo 20.");
  if (m.anotadores != null && (!Array.isArray(m.anotadores) || m.anotadores.length > 20)) errores.push("anotadores: máximo 20.");
  if (m.ladoInicialA != null && m.ladoInicialA !== "IZQ" && m.ladoInicialA !== "DER") errores.push("ladoInicialA: IZQ o DER.");
  if (typeof m.actualizadoEn !== "string") errores.push("actualizadoEn es obligatorio.");
  return errores;
}
