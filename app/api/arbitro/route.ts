import { NextResponse } from "next/server";
import { arbitroDe, codigoCorrecto, controlarIntentos, COOKIE_ARBITRO, ipDe, limpiarIntentos, registrarFallo } from "@/lib/server/auth";
import { AMBITO, conSesion, opcionesCookie, plantelAbierto, sesionPublica, sesionValida } from "@/lib/server/arbitros";
import { ErrorApi, leerJson, manejar } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** GET /api/arbitro → { arbitro: { id, nombre } | null } de este dispositivo. */
export const GET = manejar(async (req: Request) => {
  const a = await sesionValida(arbitroDe(req));
  return NextResponse.json({ arbitro: a ? sesionPublica(a) : null });
});

/**
 * POST /api/arbitro  { arbitroId, codigo } → entra un árbitro del plantel del club
 * con su código personal de 4 dígitos.
 */
export const POST = manejar(async (req: Request) => {
  const ip = ipDe(req);
  controlarIntentos(ip);
  const body = (await leerJson(req)) as { arbitroId?: unknown; codigo?: unknown } | null;
  if (typeof body?.arbitroId !== "string" || typeof body?.codigo !== "string") throw new ErrorApi(400, "Envía { arbitroId, codigo }.");
  const p = await plantelAbierto();
  const a = p.arbitros.find((x) => x.id === body.arbitroId);
  if (!a) throw new ErrorApi(404, "No encontramos tu registro. Regístrate de nuevo.");
  if (!a.activo) throw new ErrorApi(403, "Tu acceso está pausado. Habla con el staff.");
  if (!codigoCorrecto(AMBITO, a.id, body.codigo, a.codigoHash)) {
    registrarFallo(ip);
    throw new ErrorApi(401, "Código incorrecto.");
  }
  limpiarIntentos(ip);
  return conSesion(NextResponse.json({ arbitro: sesionPublica(a) }), p, a);
});

/** DELETE /api/arbitro → cierra la sesión de árbitro de este dispositivo. */
export const DELETE = manejar(async () => {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_ARBITRO, "", opcionesCookie(0));
  return res;
});
