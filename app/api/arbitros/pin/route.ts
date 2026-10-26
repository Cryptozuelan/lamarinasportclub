import { NextResponse } from "next/server";
import { sesionDe } from "@/lib/server/auth";
import { guardarPlantel, leerPlantel, pinNuevo } from "@/lib/server/arbitros";
import { ErrorApi, leerJson, manejar } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** GET /api/arbitros/pin (staff) → { pin } del registro de árbitros del club (null si está cerrado). */
export const GET = manejar(async (req: Request) => {
  if (!sesionDe(req)) throw new ErrorApi(401, "Solo el staff.");
  return NextResponse.json({ pin: (await leerPlantel()).pin });
});

/**
 * POST /api/arbitros/pin { pin?: string | null } (staff)
 * Con `pin` (4 a 6 números) lo fija; sin `pin`, crea uno al azar; `pin: null` cierra el registro.
 * Cambiarlo cierra las sesiones abiertas: los árbitros vuelven a entrar con su nombre y su código.
 */
export const POST = manejar(async (req: Request) => {
  if (!sesionDe(req)) throw new ErrorApi(401, "Solo el staff.");
  const b = ((await leerJson(req)) ?? {}) as { pin?: unknown };
  let pin: string | null;
  if (b.pin === null) pin = null;
  else if (b.pin === undefined) pin = pinNuevo();
  else if (typeof b.pin === "string" && /^\d{4,6}$/.test(b.pin.trim())) pin = b.pin.trim();
  else throw new ErrorApi(422, "El PIN de árbitros son de 4 a 6 números.");
  const p = await leerPlantel();
  await guardarPlantel({ ...p, pin });
  return NextResponse.json({ pin });
});
