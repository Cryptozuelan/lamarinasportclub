import { NextResponse } from "next/server";
import { claveCorrecta, controlarIntentos, COOKIE_TORNEOS, ipDe, leerAccesos, limpiarIntentos, registrarFallo, tokenAccesos } from "@/lib/server/auth";
import { ErrorApi, leerJson, manejar } from "@/lib/server/http";
import { getTorneosRepository } from "@/lib/server/repository";
import { llaveAcceso } from "@/lib/server/torneos";

export const dynamic = "force-dynamic";

/** GET /api/torneos/acceso → { accesos: { [torneoId]: venceISO } } de este dispositivo. */
export const GET = manejar(async (req: Request) => {
  const accesos = Object.fromEntries(Object.entries(leerAccesos(req)).map(([llave, exp]) => [llave.split(":")[0], new Date(exp * 1000).toISOString()]));
  return NextResponse.json({ accesos });
});

/**
 * POST /api/torneos/acceso  { torneoId, clave } → entra como participante hasta que venza la clave.
 * La clave la define el staff en Ajustes → Claves de torneos.
 */
export const POST = manejar(async (req: Request) => {
  const ip = ipDe(req);
  controlarIntentos(ip);
  const body = (await leerJson(req)) as { torneoId?: unknown; clave?: unknown } | null;
  if (typeof body?.torneoId !== "string" || typeof body?.clave !== "string") throw new ErrorApi(400, "Envía { torneoId, clave }.");
  const t = await getTorneosRepository().obtener(body.torneoId);
  if (!t || t.eliminado) throw new ErrorApi(404, "Torneo no encontrado.");
  if (!t.acceso?.clave) return NextResponse.json({ ok: true, vence: null });
  const vence = new Date(t.acceso.vence).getTime();
  if (!(vence > Date.now())) throw new ErrorApi(410, "Este torneo ya terminó: la clave caducó.");
  if (!claveCorrecta(body.clave, t.acceso.clave)) {
    registrarFallo(ip);
    throw new ErrorApi(401, "Clave incorrecta. Pídela en la recepción de La Marina.");
  }
  limpiarIntentos(ip);
  const accesos = { ...leerAccesos(req), [llaveAcceso(t.id, t.acceso.clave)]: Math.floor(vence / 1000) };
  const { token, maxAge } = tokenAccesos(accesos);
  const res = NextResponse.json({ ok: true, vence: t.acceso.vence });
  res.cookies.set(COOKIE_TORNEOS, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge });
  return res;
});
