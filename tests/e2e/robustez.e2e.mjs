// Prueba en navegador de usos indebidos y fallos (dos celulares, sin internet, recargas, etc.).
// Requiere la app corriendo en modo DEMO (carga sola los datos de prueba):  npm run build && npm start
// (STAFF_PIN si se cambió el PIN de demo 1234)
// y Playwright:  npx -y playwright@1.56 install chromium  (o PW_CHROMIUM=/ruta/a/chromium)
//   node tests/e2e/robustez.e2e.mjs
import { chromium } from "playwright";
const out = process.argv[2] ?? ".";
const U = process.env.APP_URL ?? "http://localhost:3000";
const b = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const errs = [];
let fallos = 0;
const ok = (c, m) => { if (!c) fallos++; console.log((c ? "PASS " : "FAIL ") + m); };
const nuevo = async (ctx) => { const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => d.accept(d.type() === "prompt" ? "ELIMINAR" : undefined)); return p; };
const vp = { viewport: { width: 390, height: 844 } };
const A = await b.newContext(vp), B = await b.newContext(vp);
const PIN = process.env.STAFF_PIN ?? "1234";

// La app arranca vacía: el staff carga los datos de prueba (Ajustes → Datos de prueba).
const S = await b.newContext(vp);
await S.request.post(`${U}/api/staff/login`, { data: { pin: PIN } });
if (!(await S.request.post(`${U}/api/demo`, { data: { accion: "cargar" } })).ok()) throw new Error("No se pudieron cargar los datos de prueba");
const ev = (await (await S.request.get(`${U}/api/americanos`)).json()).eventos.filter((e) => e.id.endsWith("evt_demo_mixto") && !e.eliminado).map((e) => e.id).sort().at(-1);
await S.close();

// 0) Espectador (jugador que escanea el QR): ve todo, no puede editar
{
  const E = await b.newContext(vp);
  const pe = await nuevo(E);
  await pe.goto(`${U}/evento/${ev}`, { waitUntil: "networkidle" }); await pe.waitForTimeout(1200);
  ok(await pe.locator("text=Modo espectador").count() > 0, "espectador: ve 'Modo espectador'");
  ok(await pe.locator("text=Cargar marcador").count() === 0, "espectador: no ve botones de carga");
  await pe.locator("text=Pista 2").first().click(); await pe.waitForTimeout(400);
  ok(await pe.locator("text=Guardar resultado").count() === 0, "espectador: tocar una pista no abre el marcador");
  const st = await pe.evaluate(async (id) => (await fetch(`/api/americanos/${id}`, { method: "DELETE" })).status, ev);
  ok(st === 401, `espectador: la API rechaza cambios (${st})`);
  await pe.goto(`${U}/setup`, { waitUntil: "networkidle" }); await pe.waitForTimeout(800);
  ok(await pe.locator("text=Acceso staff").count() > 0, "espectador: crear evento pide acceso staff");
  for (const d of "0000") await pe.getByLabel(d, { exact: true }).click();
  await pe.waitForTimeout(800);
  ok(await pe.locator("text=PIN o credenciales incorrectas").count() > 0, "PIN incorrecto: avisa y no entra");
  await E.close();
}

// Staff ingresa en los dos celulares
for (const ctx of [A, B]) {
  const r = await ctx.request.post(`${U}/api/staff/login`, { data: { pin: PIN } });
  if (!r.ok()) throw new Error("No se pudo ingresar como staff: " + (await r.text()));
}
const pa = await nuevo(A), pb = await nuevo(B);
await pa.goto(`${U}/evento/${ev}`, { waitUntil: "networkidle" });
await pb.goto(`${U}/evento/${ev}`, { waitUntil: "networkidle" });
await pa.waitForTimeout(1200); await pb.waitForTimeout(1200);

// 1) Dos dispositivos cargan pistas distintas casi a la vez
const cargar = async (p, idx, botonTexto) => {
  await p.locator("button:has-text('Cargar marcador')").nth(idx).click(); await p.waitForTimeout(500);
  for (let i = 0; i < 15; i++) await p.getByLabel("Sumar").first().click();
  await p.click("text=Guardar resultado"); await p.waitForTimeout(300);
};
await cargar(pa, 0); // pista 2 en A (pista 1 ya tiene resultado)
await cargar(pb, 1); // pista 5 en B
await pa.waitForTimeout(1500);
await pa.evaluate(() => window.dispatchEvent(new Event("online"))); await pb.evaluate(() => window.dispatchEvent(new Event("online")));
await pa.waitForTimeout(2500); await pb.evaluate(() => window.dispatchEvent(new Event("online"))); await pb.waitForTimeout(2000);
const srv = await (await fetch(`${U}/api/americanos/${ev}`)).json();
const fin = srv.evento.rondas[2].partidos.filter((p) => p.estado === "FINALIZADO").length;
ok(fin === 3, `dos dispositivos: servidor tiene ${fin}/3 pistas con resultado`);
const enB = await pb.locator("text=Editar marcador").count();
ok(enB === 3, `dos dispositivos: el celular B ve ${enB}/3 marcadores`);

// 2) Doble toque en Guardar no rompe nada
await pa.locator("text=Editar marcador").first().click(); await pa.waitForTimeout(500);
await pa.getByLabel("Restar").first().click();
await pa.locator("text=Guardar resultado").dblclick().catch(() => {});
await pa.waitForTimeout(600);
ok(errs.length === 0, "doble toque en Guardar sin errores");

// 3) Deshacer la corrección
const btnDeshacer = pa.locator("button:has-text('Deshacer')").first();
ok(await btnDeshacer.isVisible(), "aparece botón Deshacer");
await btnDeshacer.click(); await pa.waitForTimeout(400);

// 4) Recargar a mitad de ronda: el cronómetro sigue
await pa.click("text=Reanudar"); await pa.waitForTimeout(2200);
const t1 = await pa.locator("aside span.font-display").first().textContent();
await pa.reload({ waitUntil: "networkidle" }); await pa.waitForTimeout(1500);
const t2 = await pa.locator("aside span.font-display").first().textContent();
ok(t1 && t2 && t2 <= t1, `recarga a mitad de ronda: reloj ${t1} → ${t2} (sigue corriendo)`);

// 5) Sin internet: cargar, volver online, se sube
await A.setOffline(true);
await pa.locator("text=Siguiente").click(); await pa.waitForTimeout(800); // cierra ronda 3 (todas cargadas)
await pa.click("text=Iniciar ronda"); await pa.waitForTimeout(300);
await cargar(pa, 0);
await pa.waitForTimeout(1500);
const badge = await pa.locator("text=Sin conexión").count();
ok(badge > 0, "sin internet: muestra 'Sin conexión'");
await pa.screenshot({ path: `${out}/m-offline.png` });
await A.setOffline(false);
await pa.evaluate(() => window.dispatchEvent(new Event("online"))); await pa.waitForTimeout(3000);
const srv2 = await (await fetch(`${U}/api/americanos/${ev}`)).json();
ok(srv2.evento.rondaActual === 4 && srv2.evento.rondas[3].partidos.some((p) => p.estado === "FINALIZADO"), `vuelve internet: servidor en ronda ${srv2.evento.rondaActual} con el marcador offline`);

// 6) Retirar jugador y sumar uno tarde
await pa.click("button:has-text('Jugadores')"); await pa.waitForTimeout(500);
await pa.locator("button:has-text('Retirar')").first().click(); await pa.waitForTimeout(600);
await pa.fill("input[placeholder='Llegó tarde: nombre']", "Pedro Tarde"); await pa.click("button:has-text('Sumar')"); await pa.waitForTimeout(600);
await pa.screenshot({ path: `${out}/m-plantel.png` });
await pa.getByLabel("Cerrar").click(); await pa.waitForTimeout(400);
const e3 = (await (await fetch(`${U}/api/americanos/${ev}`)).json()).evento;
await pa.waitForTimeout(1200);
const e4 = (await (await fetch(`${U}/api/americanos/${ev}`)).json()).evento;
const ret = e4.jugadores.find((j) => j.retirado);
const tarde = e4.jugadores.find((j) => j.nombre === "Pedro");
const futuras = e4.rondas.filter((r) => r.numero > 4);
const usaRet = futuras.some((r) => r.partidos.some((p) => [...p.parejaA.jugadorIds, ...p.parejaB.jugadorIds].includes(ret?.id)));
const usaTarde = futuras.some((r) => r.partidos.some((p) => [...p.parejaA.jugadorIds, ...p.parejaB.jugadorIds].includes(tarde?.id)));
ok(ret && !usaRet, `retirado (${ret?.nombre}) fuera de rondas futuras`);
ok(tarde && usaTarde, "jugador tarde entra en rondas futuras");

// 7) Ronda futura bloqueada
await pa.click("button:has-text('R6')"); await pa.waitForTimeout(400);
await pa.locator("button:has-text('Cargar marcador')").first().click(); await pa.waitForTimeout(400);
ok(await pa.locator("text=aún no empieza").count() > 0, "no deja cargar marcador en una ronda futura");

// 8) Borrador del setup sobrevive a cerrar la app
const ps = await nuevo(A);
await ps.goto(`${U}/setup`, { waitUntil: "networkidle" });
await ps.click("text=Siguiente"); await ps.waitForTimeout(300); await ps.click("text=Siguiente"); await ps.waitForTimeout(400);
await ps.fill("input[placeholder='Nombre de la jugadora']", "Uno Uno, Dos Dos, uno uno, Tres Tres"); await ps.keyboard.press("Enter"); await ps.waitForTimeout(500);
const n1 = await ps.locator("button[aria-label^='Quitar a']").count();
ok(n1 === 3, `nombres repetidos se omiten (${n1} de 4)`);
await ps.close();
const ps2 = await nuevo(A);
await ps2.goto(`${U}/setup`, { waitUntil: "networkidle" }); await ps2.waitForTimeout(800);
ok(await ps2.locator("text=Recuperamos").count() > 0, "al volver al setup avisa que recuperó el borrador");
await ps2.click("text=Siguiente"); await ps2.waitForTimeout(300); await ps2.click("text=Siguiente"); await ps2.waitForTimeout(400);
ok(await ps2.locator("button[aria-label^='Quitar a']").count() === 3, "los jugadores del borrador siguen ahí");
await ps2.click("text=Siguiente"); await ps2.waitForTimeout(300);
ok(await ps2.locator("text=al menos 2 mujeres y 2 hombres").count() > 0, "mixto con 3 mujeres y 0 hombres no deja avanzar y explica por qué");

// 9) Eliminar evento desde A desaparece en B
await pa.goto(`${U}/evento/${ev}`, { waitUntil: "networkidle" }); await pa.waitForTimeout(800);
await pa.getByLabel("Eliminar evento").click(); await pa.waitForTimeout(1500);
await pb.goto(`${U}/`, { waitUntil: "networkidle" }); await pb.waitForTimeout(2500);
ok(await pb.locator("text=Americano Viernes Neón").count() === 0, "evento eliminado en A desaparece en B");

// 10) localStorage corrupto no deja la app colgada
const C = await b.newContext(vp); const pc = await nuevo(C);
await pc.goto(`${U}/`); await pc.evaluate(() => localStorage.setItem("lamarina-americanos-v1", "{roto"));
await pc.reload({ waitUntil: "networkidle" }); await pc.waitForTimeout(1500);
ok(await pc.locator("text=Eventos activos").count() > 0 && (await pc.locator(".animate-pulse.h-40").count()) === 0, "datos locales corruptos: la app carga igual");

console.log(errs.length ? "ERRORES JS:\n" + errs.join("\n") : "sin errores de JavaScript");
if (fallos) process.exitCode = 1;
await b.close();
