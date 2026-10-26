/** Clave de participantes y PIN de árbitros de un torneo. */
import type { DiaTorneo } from "@/types/torneo";

/** Venezuela (UTC-4, sin horario de verano). */
export const ZONA_CLUB = "-04:00";

// Sin 0/O ni 1/I/L para que se dicte y se lea sin errores.
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function claveAleatoria(largo = 6): string {
  const bytes = new Uint32Array(largo);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join("");
}

/** La clave vence a las 23:59 del último día del torneo (hora del club). */
export function venceAlTerminar(dias: Pick<DiaTorneo, "fecha">[]): string {
  const ultimo = [...dias].map((d) => d.fecha).sort().at(-1) ?? new Date().toISOString().slice(0, 10);
  return new Date(`${ultimo}T23:59:00${ZONA_CLUB}`).toISOString();
}

export const claveVigente = (acceso?: { vence: string } | null, ahora = Date.now()) => !!acceso && new Date(acceso.vence).getTime() > ahora;

/** PIN de árbitros: solo números, fácil de teclear en la tablet. */
export function pinAleatorio(largo = 6): string {
  const bytes = new Uint32Array(largo);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => String(b % 10)).join("");
}
