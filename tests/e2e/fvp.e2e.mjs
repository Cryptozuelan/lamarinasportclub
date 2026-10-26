// Prueba en navegador del chequeo de categorías con el ranking FVP.
// Requiere la app corriendo en modo DEMO recién iniciada:  npm run build && npm start
//   node tests/e2e/fvp.e2e.mjs [carpeta-capturas]
import { chromium } from "playwright";
const out = process.argv[2] ?? ".";
const U = process.env.APP_URL ?? "http://localhost:3000";
const PIN = process.env.STAFF_PIN ?? "1234";
const b = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const errs = [];
let fallos = 0;
const ok = (c, m) => { if (!c) fallos++; console.log((c ? "PASS " : "FAIL ") + m); };

// Lista inventada con la forma de la hoja de la FVP.
const filas = [["V-20000001", "LUIS SEGUNDA", "3ra", "Masculino", "2da"], ["V-20000002", "PEDRO SEGUNDA", "2da", "Masculino", "2da"]];
for (let i = 0; i < 30; i++) filas.push([`V-3${String(i).padStart(7, "0")}`, `JUGADOR QUINTA ${i}`, "6ta", "Masculino", "5ta"]);
const HOJA = ["N°,CÉDULA,NOMBRE DEL ATLETA,CAT. ORIGEN,GÉNERO,ID EDO.,estados,PUNTUACIÓN MÁXIMA,MOVIMIENTO,CATEGORÍA FINAL", ...filas.map((f, i) => `${i + 1},${f[0]},${f[1]},${f[2]},${f[3]},1,Distrito Capital,100,Ascenso,${f[4]}`)].join("\n");

const anon = await b.newContext();
const st = (await anon.request.get(`${U}/api/ranking-fvp`)).status();
ok(st === 401, `sin sesión la lista FVP no se puede leer (${st})`);
const stSync = (await anon.request.post(`${U}/api/ranking-fvp`, { data: { texto: HOJA } })).status();
ok(stSync === 401, `sin sesión no se puede subir una lista (${stSync})`);

const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const r = await ctx.request.post(`${U}/api/staff/login`, { data: { pin: PIN } });
if (!r.ok()) throw new Error("No se pudo ingresar como staff");
const subida = await (await ctx.request.post(`${U}/api/ranking-fvp`, { data: { texto: HOJA, archivo: "prueba.csv" } })).json();
ok(subida.resumen?.total === 32, `lista subida: ${subida.resumen?.total} atletas`);
const corta = await ctx.request.post(`${U}/api/ranking-fvp`, { data: { texto: "CEDULA,NOMBRE,CATEGORIA\nV-1234567,X,1ra" } });
ok(corta.status() === 422, "una lista mucho más corta no reemplaza a la vigente sin confirmar");

// Torneo de prueba con 4ta masculina abierta (copia del demo, sin inscritos).
{
  await ctx.request.post(`${U}/api/demo`, { data: { accion: "cargar" } });
  const { torneos } = await (await ctx.request.get(`${U}/api/torneos`)).json();
  const t = structuredClone(torneos.filter((x) => x.id.endsWith("t-open-2026") && !x.eliminado).sort((a, b) => a.id.localeCompare(b.id)).at(-1));
  const c = t.categorias.find((x) => x.categoria.id === "M-4TA");
  Object.assign(t, { id: "t-fvp-e2e", nombre: "Copa FVP (prueba)", jugadores: [], historial: [], categorias: [{ ...c, duplas: [], cuadro: null }], actualizadoEn: new Date().toISOString() });
  const res = await ctx.request.post(`${U}/api/torneos`, { data: { torneo: t } });
  if (!res.ok()) throw new Error("No se pudo crear el torneo de prueba: " + (await res.text()));
}

const p = await ctx.newPage();
p.on("pageerror", (e) => errs.push(e.message));
await p.goto(`${U}/torneos/t-fvp-e2e/categorias`, { waitUntil: "networkidle" });
await p.waitForTimeout(800);
await p.getByRole("button", { name: /^4ta M/ }).first().click();
await p.getByRole("button", { name: "Inscribir", exact: true }).first().click();
await p.waitForTimeout(300);

const nombres = p.getByPlaceholder("Nombre");
const apellidos = p.getByPlaceholder("Apellido");
const cedulas = p.getByPlaceholder("Cédula (V-12345678)");
await nombres.nth(0).fill("Luis"); await apellidos.nth(0).fill("Segunda"); await cedulas.nth(0).fill("V-20000001");
await nombres.nth(1).fill("Jugador"); await apellidos.nth(1).fill("Quinta"); await cedulas.nth(1).fill("30000001");
await p.waitForTimeout(1200);
ok(await p.locator("text=es 2da FVP y no puede jugar 4ta").count() > 0, "bloquea a un 2da en 4ta");
ok(await p.getByRole("button", { name: "Inscribir", exact: true }).last().isDisabled(), "no deja inscribir sin excepción");
await p.screenshot({ path: `${out}/fvp-bloqueo.png` });

await p.getByRole("switch", { name: "Autorizar excepción" }).click();
ok(await p.getByRole("button", { name: "Inscribir", exact: true }).last().isDisabled(), "la excepción pide motivo");
await p.getByPlaceholder(/Motivo/).fill("Vuelve de lesión, aprobado por la directiva");
await p.waitForTimeout(200);
ok(!(await p.getByRole("button", { name: "Inscribir", exact: true }).last().isDisabled()), "con motivo se puede inscribir");
await p.getByRole("button", { name: "Inscribir y otra" }).click();
await p.waitForTimeout(400);

await nombres.nth(0).fill("Jugador"); await apellidos.nth(0).fill("Cero"); await cedulas.nth(0).fill("V-30000002");
await nombres.nth(1).fill("Jugador"); await apellidos.nth(1).fill("Tres"); await cedulas.nth(1).fill("V-30000003");
await p.waitForTimeout(1200);
ok(await p.locator("text=FVP 5ta · JUGADOR QUINTA 2").count() > 0, "muestra la categoría FVP del jugador");
await p.getByRole("button", { name: "Inscribir y otra" }).click();
await p.waitForTimeout(400);

await nombres.nth(0).fill("Sin"); await apellidos.nth(0).fill("Cedula");
await nombres.nth(1).fill("Jugador"); await apellidos.nth(1).fill("Cuatro"); await cedulas.nth(1).fill("V-30000004");
await p.waitForTimeout(1200);
ok(await p.locator("text=Quedará por verificar").count() > 0, "sin cédula: avisa que queda por verificar");
await p.getByRole("button", { name: "Inscribir", exact: true }).last().click();
await p.waitForTimeout(800);

ok(await p.locator("text=FVP verificada").count() >= 1, "chip de dupla verificada");
ok(await p.locator("text=Excepción del staff").count() >= 1, "chip de excepción");
ok(await p.locator("text=FVP por verificar").count() === 1, "chip de dupla por verificar");
ok(await p.getByRole("button", { name: "Sorteo" }).isDisabled(), "el sorteo espera a que se revise");
await p.screenshot({ path: `${out}/fvp-lista.png`, fullPage: true });

await p.locator("text=FVP por verificar").click();
await p.waitForTimeout(300);
await p.getByPlaceholder("Cédula (V-12345678)").first().fill("V-30000005");
await p.waitForTimeout(1200);
await p.screenshot({ path: `${out}/fvp-revisar.png` });
await p.getByRole("button", { name: "Marcar verificada" }).click();
await p.waitForTimeout(800);
ok(await p.locator("text=FVP por verificar").count() === 0, "revisada: ya no queda nada por verificar");
ok(!(await p.getByRole("button", { name: "Sorteo" }).isDisabled()), "el sorteo se habilita");

// Trampa: un cliente que manda una dupla "verificada" que baja de categoría.
await p.waitForTimeout(1500);
const trampa = await p.evaluate(async () => {
  const { torneos } = await (await fetch("/api/torneos")).json();
  const t = torneos.find((x) => x.id === "t-fvp-e2e");
  t.jugadores.push({ id: "j-trampa-1", nombre: "Pedro", apellido: "Segunda", genero: "M", cedula: "V-20000002" }, { id: "j-trampa-2", nombre: "Otro", genero: "M", cedula: "V-30000009" });
  const c = t.categorias.find((x) => x.categoria.id === "M-4TA");
  c.duplas.push({ id: "d-trampa", jugadorIds: ["j-trampa-1", "j-trampa-2"], estado: "ACTIVA", inscritaEn: new Date().toISOString(), fvp: { estado: "VERIFICADA", categorias: [null, null], en: new Date().toISOString() } });
  t.actualizadoEn = new Date().toISOString();
  const res = await fetch("/api/torneos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ torneo: t }) });
  const d = await res.json();
  return d.torneo.categorias.find((x) => x.categoria.id === "M-4TA").duplas.find((x) => x.id === "d-trampa").fvp;
});
ok(trampa?.estado === "BLOQUEADA", `el servidor corrige la dupla tramposa (${trampa?.estado})`);

await p.goto(`${U}/torneos/ranking`, { waitUntil: "networkidle" });
await p.waitForTimeout(600);
ok(await p.locator("text=32 atletas").count() > 0, "pantalla del ranking: total");
await p.getByPlaceholder("Cédula o nombre").fill("pedro");
await p.waitForTimeout(800);
ok(await p.locator("text=PEDRO SEGUNDA").count() > 0, "busca por nombre");
await p.screenshot({ path: `${out}/fvp-ranking.png`, fullPage: true });

ok(errs.length === 0, `sin errores de página ${errs.join(" | ")}`);
await b.close();
console.log(fallos ? `${fallos} fallo(s)` : "Todo OK");
process.exit(fallos ? 1 : 0);
