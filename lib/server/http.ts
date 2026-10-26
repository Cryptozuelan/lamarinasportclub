import "server-only";
import { NextResponse } from "next/server";

/** Límite de cuerpo: un evento de 48 jugadores y 30 rondas pesa ~300 KB. */
const MAX_BYTES = 1_000_000;

export class ErrorApi extends Error {
  constructor(
    public status: number,
    message: string,
    public detalles?: string[],
  ) {
    super(message);
  }
}

export async function leerJson(req: Request, max = MAX_BYTES): Promise<unknown> {
  const limite = `El cuerpo supera ${Math.round(max / 1_000_000)} MB.`;
  const largo = Number(req.headers.get("content-length") ?? 0);
  if (largo > max) throw new ErrorApi(413, limite);
  const texto = await req.text();
  if (texto.length > max) throw new ErrorApi(413, limite);
  try {
    return JSON.parse(texto);
  } catch {
    throw new ErrorApi(400, "JSON inválido.");
  }
}

/** Envuelve un handler: errores conocidos → su status; inesperados → 500 o 502 (backend). */
export function manejar<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ErrorApi) return NextResponse.json({ error: err.message, detalles: err.detalles }, { status: err.status });
      const msg = (err as Error)?.message ?? "Error desconocido";
      console.error("[api/americanos]", msg);
      const esBackend = msg.startsWith("Supabase") || msg.startsWith("Postgres");
      return NextResponse.json({ error: esBackend ? "No se pudo conectar con la base de datos." : "Error interno.", detalle: msg }, { status: esBackend ? 502 : 500 });
    }
  };
}
