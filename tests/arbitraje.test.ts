/** Árbitros: acciones de partido y relato público (sin datos individuales). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { aplicarAccion } from "../lib/torneo/arbitraje.ts";
import { CONFIG_CUADRO_BASE, catNivel } from "../lib/torneo/categorias.ts";
import { proponerFormato } from "../lib/torneo/cuadro.ts";
import { crearTorneo, inscribirDupla, publicarCategoria, sortearCategoria } from "../lib/torneo/torneo.ts";
import { programarTorneo } from "../lib/torneo/programacion.ts";
import { anotarPunto, calcularMarcador, detallarUltimo, nuevoMarcador, relatoPublico, relatoPunto } from "../lib/torneo/marcador.ts";
import { pinAleatorio } from "../lib/torneo/acceso.ts";
import { CLUB_POR_DEFECTO } from "../lib/horarios.ts";
import type { JugadorTorneo, MarcadorVivo, ReglasPartido, Torneo } from "../types/torneo.ts";

const jug = (id: string): JugadorTorneo => ({ id, nombre: id, apellido: id.toUpperCase(), genero: "M" });

function torneo(): Torneo {
  let t = crearTorneo({ nombre: "Copa", dias: [{ fecha: "2026-11-07", inicio: "08:00", fin: "22:00" }], canchas: CLUB_POR_DEFECTO.pistas, categorias: [catNivel("MASCULINO", "4TA")] });
  const cid = "M-4TA";
  for (let i = 1; i <= 4; i++) t = inscribirDupla(t, cid, jug(`a${i}`), jug(`b${i}`), { id: `d${i}`, puntos: 1000 - i });
  t = sortearCategoria(t, cid, { semilla: 3, por: "Staff", config: proponerFormato(4, CONFIG_CUADRO_BASE).config });
  t = publicarCategoria(t, cid, "Staff");
  return programarTorneo(t).torneo;
}
const partido = (t: Torneo, id: string) => t.categorias.flatMap((c) => c.cuadro?.partidos ?? []).find((p) => p.id === id)!;

test("el árbitro llama, empieza y carga el resultado", () => {
  let t = torneo();
  const p = t.categorias[0].cuadro!.partidos.find((x) => x.duplaA && x.duplaB)!;
  t = aplicarAccion(t, p.id, { accion: "llamar", pista: 2 }, "Árbitro Ana");
  assert.equal(partido(t, p.id).estado, "LLAMADO");
  t = aplicarAccion(t, p.id, { accion: "iniciar" }, "Árbitro Ana");
  assert.equal(partido(t, p.id).estado, "EN_JUEGO");
  t = aplicarAccion(t, p.id, { accion: "resultado", resultado: { sets: [{ a: 6, b: 3 }, { a: 6, b: 4 }], ganador: "A", tipo: "NORMAL" } }, "Árbitro Ana");
  const fin = partido(t, p.id);
  assert.equal(fin.estado, "FINALIZADO");
  assert.equal(fin.resultado?.ganador, "A");
});

test("W.O. desde el panel del árbitro", () => {
  let t = torneo();
  const p = t.categorias[0].cuadro!.partidos.find((x) => x.duplaA && x.duplaB)!;
  t = aplicarAccion(t, p.id, { accion: "llamar", pista: 1 });
  t = aplicarAccion(t, p.id, { accion: "wo", ganador: "B" }, "Árbitro Ana");
  assert.equal(partido(t, p.id).estado, "FINALIZADO");
  assert.equal(partido(t, p.id).resultado?.tipo, "WO");
  assert.equal(t.historial?.at(-1)?.por, "Árbitro Ana");
});

test("el PIN de árbitros es numérico", () => {
  for (let i = 0; i < 50; i++) assert.match(pinAleatorio(), /^\d{6}$/);
  assert.match(pinAleatorio(4), /^\d{4}$/);
});

const reglas: ReglasPartido = { sets: 3, games: 6, tieBreakEn: 6, puntoDeOro: true, superTie: true, minutos: 90 };
const marcador = (): MarcadorVivo =>
  nuevoMarcador({ partidoId: "p", torneoId: "t", categoriaId: "c", reglas, jugadoresA: ["a1", "a2"], jugadoresB: ["b1", "b2"], sacaPrimero: "A", primerA: "a1", primerB: "b1" });
const lado = (l: "A" | "B") => (l === "A" ? "Pérez / Gómez" : "Ruiz / Díaz");

test("el error guarda dónde terminó la pelota y el relato lo cuenta", () => {
  let m = anotarPunto(marcador(), "A");
  m = detallarUltimo(m, { fin: "ERROR_NO_FORZADO", jugadorId: "b1", golpe: "VOLEA", zona: "RED" });
  const p = calcularMarcador(m).jugados.at(-1)!;
  assert.equal(p.zona, "RED");
  assert.match(relatoPunto(p, (id) => id.toUpperCase(), lado), /B1, error no forzado.* a la red\. Punto para Pérez \/ Gómez/);
});

test("el relato público no nombra jugadores ni golpes (las TV no muestran métricas de atletas)", () => {
  let m = marcador();
  m = anotarPunto(m, "B");
  m = detallarUltimo(m, { fin: "WINNER", jugadorId: "b2", golpe: "REMATE" });
  const p = calcularMarcador(m).jugados.at(-1)!;
  const txt = relatoPublico(p, lado);
  assert.equal(txt, "Punto para Ruiz / Díaz");
  assert.ok(!/b2|remate|winner/i.test(txt));
});

test("el relato público marca punto de oro y break", () => {
  let m = marcador();
  for (const l of "AAABBB") m = anotarPunto(m, l as "A" | "B");
  m = anotarPunto(m, "B"); // 40-40 punto de oro: gana el que resta → break
  const p = calcularMarcador(m).jugados.at(-1)!;
  assert.equal(relatoPublico(p, lado), "Punto para Ruiz / Díaz · punto de oro · break");
});
