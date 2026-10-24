import { NextResponse } from "next/server";
import { COOKIE, controlarIntentos, crearToken, ipDe, limpiarIntentos, registrarFallo, verificarPadelReserve, verificarPin } from "@/lib/server/auth";
import { ErrorApi, leerJson, manejar } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/staff/login
 *   { pin }               → PIN del club
 *   { email, password }   → usuario de PadelReserve con rol staff
 * Responde { staff: { nombre, metodo } } y deja la cookie de sesión (12 h).
 */
export const POST = manejar(async (req: Request) => {
  const ip = ipDe(req);
  controlarIntentos(ip);
  const body = (await leerJson(req)) as { pin?: unknown; email?: unknown; password?: unknown } | null;
  // Además de por IP, se limita por cuenta: rotar IPs no da intentos infinitos contra un email.
  const claves = typeof body?.email === "string" ? [ip, `email:${body.email.trim().toLowerCase()}`] : [ip];
  claves.forEach(controlarIntentos);

  let sesion: Parameters<typeof crearToken>[0] | null = null;
  if (typeof body?.pin === "string" || typeof body?.pin === "number") {
    if (verificarPin(String(body.pin))) sesion = { sub: "pin", nombre: "Staff La Marina", metodo: "PIN" };
  } else if (typeof body?.email === "string" && typeof body?.password === "string") {
    sesion = await verificarPadelReserve(body.email.trim(), body.password);
  } else {
    throw new ErrorApi(400, "Envía { pin } o { email, password }.");
  }

  if (!sesion) {
    claves.forEach(registrarFallo);
    throw new ErrorApi(401, "PIN o credenciales incorrectas.");
  }
  claves.forEach(limpiarIntentos);
  const { token, maxAge } = crearToken(sesion);
  const res = NextResponse.json({ staff: { nombre: sesion.nombre, metodo: sesion.metodo } });
  res.cookies.set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge });
  return res;
});
