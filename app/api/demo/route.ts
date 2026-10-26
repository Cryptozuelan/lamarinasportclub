import { NextResponse } from "next/server";
import { sesionDe } from "@/lib/server/auth";
import { borrarDemo, cargarDemo } from "@/lib/server/demo";
import { ErrorApi, leerJson, manejar } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** POST /api/demo { accion: "cargar" | "borrar" } (staff) → datos de prueba para enseñar la app. */
export const POST = manejar(async (req: Request) => {
  if (!sesionDe(req)) throw new ErrorApi(401, "Solo el staff.");
  const b = (await leerJson(req)) as { accion?: unknown } | null;
  if (b?.accion === "cargar") return NextResponse.json({ ok: true, ...(await cargarDemo()) });
  if (b?.accion === "borrar") {
    await borrarDemo();
    return NextResponse.json({ ok: true });
  }
  throw new ErrorApi(400, 'Envía { accion: "cargar" | "borrar" }.');
});
