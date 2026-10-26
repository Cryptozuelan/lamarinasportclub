import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { consultar, databaseUrl, postgresActivo, tenantId } from "./db";
import { ErrorApi } from "./http";

/**
 * Sesión de staff.
 *
 * Todas las escrituras (POST/PUT/DELETE) exigen una cookie `lm_staff` firmada
 * con HMAC. Se obtiene en POST /api/staff/login con:
 *   - PIN del club (`STAFF_PIN`). En modo DEMO, si no se define, el PIN es 1234.
 *   - Usuario y contraseña de PadelReserve:
 *     · con `DATABASE_URL`: tablas `users` + `tenant_members` de Lyria (bcrypt).
 *       Entra quien sea owner/admin/staff_admin del tenant `TENANT_ID` o super_admin.
 *     · con Supabase: Supabase Auth, rol staff/admin en app_metadata.
 *     En ambos casos también entra quien esté en `STAFF_EMAILS`.
 * La lectura (ranking, Modo TV, QR) es pública.
 */

export const COOKIE = "lm_staff";
const DURACION_S = 12 * 3600;
export const PIN_DEMO = "1234";

export interface SesionStaff {
  sub: string;
  nombre: string;
  metodo: "PIN" | "PADELRESERVE";
  exp: number;
}

const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
export const supabaseActivo = () => !!(supabaseUrl() && supabaseKey());
/** Hay un backend real (Postgres o Supabase) contra el que validar usuarios. */
export const backendActivo = () => postgresActivo() || supabaseActivo();

export function pinConfigurado(): string | null {
  if (process.env.STAFF_PIN) return process.env.STAFF_PIN;
  return backendActivo() ? null : PIN_DEMO;
}

function secreto(): string {
  const s = process.env.STAFF_SECRET;
  if (s && s.length >= 16) return s;
  // Sin secreto propio se deriva uno de lo que exista. Para producción define STAFF_SECRET.
  return `lamarina:${databaseUrl() ?? supabaseKey() ?? ""}:${pinConfigurado() ?? ""}:sesion-staff`;
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const firmar = (datos: string) => createHmac("sha256", secreto()).update(datos).digest("base64url");

export function crearToken(s: Omit<SesionStaff, "exp">): { token: string; maxAge: number } {
  const payload: SesionStaff = { ...s, exp: Math.floor(Date.now() / 1000) + DURACION_S };
  const datos = b64(JSON.stringify(payload));
  return { token: `${datos}.${firmar(datos)}`, maxAge: DURACION_S };
}

export function leerToken(token?: string | null): SesionStaff | null {
  if (!token) return null;
  const [datos, firma] = token.split(".");
  if (!datos || !firma) return null;
  const esperada = Buffer.from(firmar(datos));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  try {
    const s = JSON.parse(Buffer.from(datos, "base64url").toString()) as SesionStaff;
    return s.exp > Date.now() / 1000 ? s : null;
  } catch {
    return null;
  }
}

function cookieDe(req: Request): string | null {
  const c = req.headers.get("cookie") ?? "";
  const m = c.split(/;\s*/).find((x) => x.startsWith(`${COOKIE}=`));
  return m ? decodeURIComponent(m.slice(COOKIE.length + 1)) : null;
}

export function sesionDe(req: Request): SesionStaff | null {
  return leerToken(cookieDe(req));
}

/** Lanza 401 si la petición no viene de staff. */
export function exigirStaff(req: Request): SesionStaff {
  const s = sesionDe(req);
  if (!s) throw new ErrorApi(401, "Solo el staff de La Marina puede hacer cambios. Ingresa con tu PIN o usuario de PadelReserve.");
  return s;
}

/* ---------- login ---------- */

const intentos = new Map<string, { n: number; desde: number }>();
const MAX_INTENTOS = 5;
const VENTANA_MS = 10 * 60_000;

export function controlarIntentos(ip: string) {
  const ahora = Date.now();
  // Las claves por email permiten llenar el Map con emails inventados: se podan las vencidas.
  if (intentos.size > 5_000) for (const [k, v] of intentos) if (ahora - v.desde >= VENTANA_MS) intentos.delete(k);
  const i = intentos.get(ip);
  if (i && ahora - i.desde < VENTANA_MS && i.n >= MAX_INTENTOS) throw new ErrorApi(429, "Demasiados intentos. Espera unos minutos.");
  if (!i || ahora - i.desde >= VENTANA_MS) intentos.set(ip, { n: 0, desde: ahora });
}
export const registrarFallo = (ip: string) => {
  const i = intentos.get(ip);
  if (i) i.n++;
};
export const limpiarIntentos = (ip: string) => intentos.delete(ip);

export function verificarPin(pin: string): boolean {
  const ok = pinConfigurado();
  if (!ok) return false;
  const a = Buffer.from(String(pin));
  const b = Buffer.from(ok);
  return a.length === b.length && timingSafeEqual(a, b);
}

const emailsStaff = () => (process.env.STAFF_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

/** Roles de tenant_members (Lyria) que pueden editar. `member` y los viewers solo miran. */
const ROLES_TENANT_STAFF = ["owner", "admin", "staff_admin"];
/** Hash bcrypt válido de una cadena cualquiera: iguala el tiempo de respuesta si el email no existe. */
const HASH_FALSO = "$2b$12$C6UzMDM.H6dfI/f/IKcEeO5iOZAYsxu6LhuYYJ.aCyH9qQ6mH.Vy6";

/** Login con usuario de PadelReserve: Postgres de Lyria si hay DATABASE_URL; si no, Supabase Auth. */
export async function verificarPadelReserve(email: string, password: string): Promise<Omit<SesionStaff, "exp"> | null> {
  return postgresActivo() ? verificarLyria(email, password) : verificarSupabase(email, password);
}

async function verificarLyria(email: string, password: string): Promise<Omit<SesionStaff, "exp"> | null> {
  // Como Lyria: solo cuentan las membresías aceptadas. Si hay emails que solo
  // difieren en mayúsculas, gana el que coincide exacto.
  const [u] = await consultar<{ id: string; email: string; full_name: string; password_hash: string | null; user_role: string; tenant_role: string | null }>(
    `select u.id, u.email, u.full_name, u.password_hash, u.role as user_role, tm.role as tenant_role
       from users u
       left join tenant_members tm on tm.user_id = u.id and tm.tenant_id = $2 and tm.accepted_at is not null
      where lower(u.email) = lower($1) and u.is_active
      order by (u.email = $1) desc, u.id
      limit 1`,
    [email, tenantId()],
  );
  const ok = await bcrypt.compare(password, u?.password_hash || HASH_FALSO);
  if (!u?.password_hash || !ok) return null;
  const esStaff = u.user_role === "super_admin" || ROLES_TENANT_STAFF.includes(u.tenant_role ?? "") || emailsStaff().includes(u.email.toLowerCase());
  // Usuarios de otros tenants reciben el mismo 401 que una contraseña errónea:
  // este login no debe servir para comprobar contraseñas de todo Lyria.
  if (!esStaff && !u.tenant_role) return null;
  if (!esStaff) throw new ErrorApi(403, "Tu usuario no tiene permisos de staff en La Marina.");
  return { sub: u.id, nombre: u.full_name || u.email, metodo: "PADELRESERVE" };
}

/** Supabase Auth, grant password. */
async function verificarSupabase(email: string, password: string): Promise<Omit<SesionStaff, "exp"> | null> {
  const url = supabaseUrl();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? supabaseKey();
  if (!url || !key) return null;
  const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  if (res.status === 400 || res.status === 401) return null;
  if (!res.ok) throw new Error(`Supabase auth ${res.status}`);
  const { user } = (await res.json()) as { user: { id: string; email: string; app_metadata?: { role?: string; roles?: string[] }; user_metadata?: { full_name?: string; nombre?: string } } };
  const roles = [user.app_metadata?.role, ...(user.app_metadata?.roles ?? [])].filter(Boolean) as string[];
  const esStaff = roles.some((r) => ["staff", "admin"].includes(r)) || emailsStaff().includes(user.email.toLowerCase());
  if (!esStaff) throw new ErrorApi(403, "Tu usuario no tiene permisos de staff en La Marina.");
  return { sub: user.id, nombre: user.user_metadata?.full_name ?? user.user_metadata?.nombre ?? user.email, metodo: "PADELRESERVE" };
}

/**
 * IP del cliente. Traefik (Dokploy) agrega la IP real al FINAL de
 * X-Forwarded-For; lo de la izquierda lo puede inventar el cliente, así que
 * se usa el último salto.
 */
export function ipDe(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || req.headers.get("x-real-ip") || "local";
}

/* ---------- participantes de torneos ---------- */

/**
 * Clave de participantes por torneo. La cookie `lm_torneos` guarda, firmada, a qué
 * torneos entró este dispositivo y hasta cuándo (el vencimiento de cada clave).
 */
export const COOKIE_TORNEOS = "lm_torneos";

export type AccesosTorneo = Record<string, number>;

export function leerAccesos(req: Request): AccesosTorneo {
  const c = req.headers.get("cookie") ?? "";
  const m = c.split(/;\s*/).find((x) => x.startsWith(`${COOKIE_TORNEOS}=`));
  const token = m ? decodeURIComponent(m.slice(COOKIE_TORNEOS.length + 1)) : null;
  if (!token) return {};
  const [datos, firma] = token.split(".");
  if (!datos || !firma) return {};
  const esperada = Buffer.from(firmar(`t:${datos}`));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return {};
  try {
    const todos = JSON.parse(Buffer.from(datos, "base64url").toString()) as AccesosTorneo;
    const ahora = Date.now() / 1000;
    return Object.fromEntries(Object.entries(todos).filter(([, exp]) => exp > ahora));
  } catch {
    return {};
  }
}

export function tokenAccesos(accesos: AccesosTorneo): { token: string; maxAge: number } {
  const datos = b64(JSON.stringify(accesos));
  const max = Math.max(60, ...Object.values(accesos).map((exp) => Math.ceil(exp - Date.now() / 1000)));
  return { token: `${datos}.${firmar(`t:${datos}`)}`, maxAge: max };
}

/** Huella corta de la clave: al cambiarla, los accesos dados con la anterior dejan de valer. */
export function huellaClave(clave: string): string {
  return firmar(`k:${clave.trim().toUpperCase()}`).slice(0, 10);
}

export function claveCorrecta(recibida: string, esperada: string): boolean {
  const a = Buffer.from(recibida.trim().toUpperCase());
  const b = Buffer.from(esperada.trim().toUpperCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ---------- árbitros (anotadores) ---------- */

/**
 * Sesión de árbitro: rol aparte del staff, del club. Cada árbitro se registra una vez con el PIN
 * de árbitros que el staff crea en Ajustes, su nombre y un código personal; la cookie guarda quién es
 * y huellas del PIN y de su código: si el staff cambia el PIN, lo pausa, o el árbitro cambia su
 * código, la sesión deja de valer.
 */
export const COOKIE_ARBITRO = "lm_arbitro";
const DURACION_ARBITRO_S = 16 * 3600;

export interface SesionArbitro {
  /** Árbitro del plantel del club. */
  arbitroId: string;
  nombre: string;
  /** Huella del PIN de árbitros del club. */
  huella: string;
  /** Huella de su código personal. */
  hc: string;
  exp: number;
}

/** Código personal del árbitro, guardado solo como HMAC ligado al ámbito (el club) y al árbitro. */
export function hashCodigo(ambito: string, arbitroId: string, codigo: string): string {
  return firmar(`r:${ambito}:${arbitroId}:${codigo.trim()}`);
}

export function codigoCorrecto(ambito: string, arbitroId: string, codigo: string, hash: string): boolean {
  const a = Buffer.from(hashCodigo(ambito, arbitroId, codigo));
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function crearTokenArbitro(s: Omit<SesionArbitro, "exp">): { token: string; maxAge: number } {
  const exp = Math.floor(Date.now() / 1000) + DURACION_ARBITRO_S;
  const datos = b64(JSON.stringify({ ...s, exp }));
  return { token: `${datos}.${firmar(`a:${datos}`)}`, maxAge: Math.max(60, exp - Math.floor(Date.now() / 1000)) };
}

export function arbitroDe(req: Request): SesionArbitro | null {
  const c = req.headers.get("cookie") ?? "";
  const m = c.split(/;\s*/).find((x) => x.startsWith(`${COOKIE_ARBITRO}=`));
  const token = m ? decodeURIComponent(m.slice(COOKIE_ARBITRO.length + 1)) : null;
  if (!token) return null;
  const [datos, firma] = token.split(".");
  if (!datos || !firma) return null;
  const esperada = Buffer.from(firmar(`a:${datos}`));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  try {
    const s = JSON.parse(Buffer.from(datos, "base64url").toString()) as SesionArbitro;
    return s.arbitroId && s.exp > Date.now() / 1000 ? s : null;
  } catch {
    return null;
  }
}
