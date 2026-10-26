import { NextResponse } from "next/server";
import { claveCorrecta, controlarIntentos, hashCodigo, ipDe, limpiarIntentos, registrarFallo } from "@/lib/server/auth";
import { AMBITO, conSesion, guardarPlantel, plantelAbierto, sesionPublica, type ArbitroGuardado } from "@/lib/server/arbitros";
import { ErrorApi, leerJson, manejar } from "@/lib/server/http";

export const dynamic = "force-dynamic";

const limpiar = (s: unknown, max: number) => (typeof s === "string" ? s.trim().replace(/\s+/g, " ").slice(0, max) : "");
const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * POST /api/arbitro/registro  { pin, nombre, apellido, telefono, codigo }
 * Registro en el plantel de árbitros del club, una sola vez, con el PIN que da el staff
 * y un código personal de 4 dígitos. Sirve para todos los torneos.
 * Si ya estaba registrado con ese teléfono, actualiza su código (así recupera el acceso).
 */
export const POST = manejar(async (req: Request) => {
  const ip = ipDe(req);
  controlarIntentos(ip);
  const b = (await leerJson(req)) as Record<string, unknown> | null;
  const p = await plantelAbierto();
  const nombre = limpiar(b?.nombre, 30);
  const apellido = limpiar(b?.apellido, 30);
  const telefono = limpiar(b?.telefono, 20).replace(/[^\d+]/g, "");
  const codigo = limpiar(b?.codigo, 4);
  if (typeof b?.pin !== "string" || !claveCorrecta(b.pin, p.pin)) {
    registrarFallo(ip);
    throw new ErrorApi(401, "PIN de árbitros incorrecto. Pídelo al staff.");
  }
  if (nombre.length < 2 || apellido.length < 2) throw new ErrorApi(422, "Escribe tu nombre y tu apellido.");
  if (telefono.replace(/\D/g, "").length < 7) throw new ErrorApi(422, "Escribe tu teléfono: es para que el staff te ubique.");
  if (!/^\d{4}$/.test(codigo)) throw new ErrorApi(422, "Tu código personal son 4 números.");
  limpiarIntentos(ip);

  const lista = p.arbitros;
  const tel = telefono.replace(/\D/g, "").slice(-10);
  const ahora = new Date().toISOString();
  let a = lista.find((x) => x.telefono && x.telefono.replace(/\D/g, "").slice(-10) === tel);
  if (!a && lista.some((x) => sinAcentos(`${x.nombre} ${x.apellido}`) === sinAcentos(`${nombre} ${apellido}`)))
    throw new ErrorApi(409, "Ya hay un árbitro con ese nombre y otro teléfono. Si eres tú, usa el mismo teléfono con el que te registraste.");
  if (lista.length >= 100 && !a) throw new ErrorApi(422, "El club ya tiene 100 árbitros registrados.");
  if (a) {
    a = { ...a, nombre, apellido, telefono, actualizadoEn: ahora };
    a.codigoHash = hashCodigo(AMBITO, a.id, codigo);
    const i = lista.findIndex((x) => x.id === a!.id);
    lista[i] = a;
  } else {
    const id = `arb-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
    a = { id, nombre, apellido, telefono, activo: true, registradoEn: ahora, actualizadoEn: ahora, codigoHash: hashCodigo(AMBITO, id, codigo) } satisfies ArbitroGuardado;
    lista.push(a);
  }
  if (!a.activo) throw new ErrorApi(403, "Tu acceso está pausado. Habla con el staff.");
  await guardarPlantel({ ...p, arbitros: lista });
  return conSesion(NextResponse.json({ arbitro: sesionPublica(a) }, { status: 201 }), p, a);
});
