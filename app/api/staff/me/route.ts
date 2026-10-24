import { NextResponse } from "next/server";
import { backendActivo, pinConfigurado, sesionDe } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

/** GET /api/staff/me → { staff: { nombre, metodo } | null, metodos } */
export async function GET(req: Request) {
  const s = sesionDe(req);
  return NextResponse.json({
    staff: s ? { nombre: s.nombre, metodo: s.metodo } : null,
    metodos: { pin: !!pinConfigurado(), pinLargo: pinConfigurado()?.length ?? 4, padelreserve: backendActivo() },
  });
}
