/** Reglamento de Juego FIP (rev. 28.05.2021) aplicado al motor de torneos. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alternarOrdenSet,
  anotarPunto,
  atencionEnCurso,
  cambioDeLadoEnCurso,
  calcularMarcador,
  descansoReglamentario,
  deshacer,
  nuevoMarcador,
  pedirAtencion,
  peloteoTrasSuspension,
  proximaSancion,
  puedeElegirOrden,
  puedePedirAtencion,
  sancionar,
  statsPartido,
} from "../lib/torneo/marcador.ts";
import { resultadoRetiro, setTerminado, validarResultadoTorneo } from "../lib/torneo/tabla.ts";
import { limiteWO } from "../lib/torneo/programacion.ts";
import { tieBreakPorDefecto } from "../lib/torneo/categorias.ts";
import type { MarcadorVivo, PartidoTorneo, ReglasPartido, Torneo } from "../types/torneo.ts";

const base: ReglasPartido = { sets: 3, games: 6, tieBreakEn: 6, puntoDeOro: true, superTie: true, minutos: 90 };

function marcador(r: ReglasPartido = base): MarcadorVivo {
  return nuevoMarcador({ partidoId: "p", torneoId: "t", categoriaId: "c", reglas: r, jugadoresA: ["a1", "a2"], jugadoresB: ["b1", "b2"], sacaPrimero: "A", primerA: "a1", primerB: "b1" });
}
const puntos = (m: MarcadorVivo, seq: string) => [...seq].reduce((acc, ch) => anotarPunto(acc, ch as "A" | "B"), m);
const games = (m: MarcadorVivo, lado: "A" | "B", n: number) => puntos(m, lado.repeat(4 * n));

test("FIP 1: mini set a 4 con tie-break en 4-4; 4-3 no cierra el set", () => {
  const r: ReglasPartido = { ...base, games: 4, tieBreakEn: tieBreakPorDefecto(4) };
  assert.equal(r.tieBreakEn, 4);
  let m = marcador(r);
  for (let i = 0; i < 3; i++) m = games(games(m, "A", 1), "B", 1);
  m = games(m, "A", 1); // 4-3
  let e = calcularMarcador(m);
  assert.equal(e.setActual, 0);
  m = games(m, "B", 1); // 4-4
  e = calcularMarcador(m);
  assert.ok(e.enTie);
  assert.ok(setTerminado(r, { a: 5, b: 4 }));
  assert.ok(setTerminado(r, { a: 4, b: 2 }));
  assert.ok(!setTerminado(r, { a: 4, b: 3 }));
});

test("FIP 1.4: tercer set sin tie-break se gana por 2 (8-6)", () => {
  const r: ReglasPartido = { ...base, superTie: false, tercerSetLargo: true };
  let m = games(games(marcador(r), "A", 6), "B", 6); // 6-0, 0-6
  for (let i = 0; i < 6; i++) m = games(games(m, "A", 1), "B", 1); // 6-6
  let e = calcularMarcador(m);
  assert.ok(!e.enTie);
  m = games(m, "A", 2); // 8-6
  e = calcularMarcador(m);
  assert.ok(e.terminado);
  assert.deepEqual(e.sets[2], { a: 8, b: 6 });
  assert.equal(validarResultadoTorneo(r, [{ a: 6, b: 0 }, { a: 0, b: 6 }, { a: 8, b: 6 }]), null);
  assert.ok(validarResultadoTorneo(r, [{ a: 6, b: 0 }, { a: 0, b: 6 }, { a: 7, b: 6 }]));
  // Retiro con 9-9 en el tercero: se cierra 11-9.
  assert.deepEqual(resultadoRetiro(r, [{ a: 6, b: 0 }, { a: 0, b: 6 }, { a: 9, b: 9 }], "B").sets[2], { a: 9, b: 11 });
});

test("FIP 1: tie-break decisivo a 7 en vez del tercer set", () => {
  const r: ReglasPartido = { ...base, tieDecisivo: 7 };
  let m = games(games(marcador(r), "A", 6), "B", 6);
  assert.ok(calcularMarcador(m).enSuperTie);
  m = puntos(m, "AAAAAA");
  assert.equal(calcularMarcador(m).matchPoint, "A");
  m = anotarPunto(m, "A");
  assert.ok(calcularMarcador(m).terminado);
  assert.equal(validarResultadoTorneo(r, [{ a: 6, b: 0 }, { a: 0, b: 6 }, { a: 7, b: 4 }]), null);
  assert.ok(validarResultadoTorneo(r, [{ a: 6, b: 0 }, { a: 0, b: 6 }, { a: 10, b: 4 }]));
});

test("FIP 6.10 y 8.3: cada dupla elige quién saca al empezar el set", () => {
  let m = games(marcador(), "A", 6); // set 1: 6-0
  let e = calcularMarcador(m);
  assert.ok(puedeElegirOrden(e));
  const antes = e.sacador;
  m = alternarOrdenSet(m, 1, e.equipoSaca);
  e = calcularMarcador(m);
  assert.notEqual(e.sacador, antes);
  assert.equal(m.jugadoresA.includes(e.sacador), m.jugadoresA.includes(antes), "sigue sacando la misma dupla");
  // El set 1 no cambia retroactivamente.
  assert.equal(e.jugados[0].sacador, "a1");
  m = anotarPunto(m, "A");
  assert.ok(!puedeElegirOrden(calcularMarcador(m)));
});

test("FIP 2: descansos de 20 s, 90 s, sin descanso tras el primer game y 120 s entre sets", () => {
  let m = puntos(marcador(), "A");
  assert.deepEqual(descansoReglamentario(calcularMarcador(m))?.segundos, 20);
  m = puntos(m, "AAA"); // 1-0: cambio sin descanso
  assert.equal(descansoReglamentario(calcularMarcador(m))?.segundos, 0);
  m = games(m, "A", 2); // 3-0: cambio de lado
  assert.equal(descansoReglamentario(calcularMarcador(m))?.segundos, 90);
  m = games(m, "A", 3); // 6-0
  assert.equal(descansoReglamentario(calcularMarcador(m))?.segundos, 120);
  assert.equal(peloteoTrasSuspension(4), 0);
  assert.equal(peloteoTrasSuspension(12), 3);
  assert.equal(peloteoTrasSuspension(45), 5);
});

test("Cambio de lado en curso: directo tras el 1-0, 90 s en 2-1, nada en 2-0", () => {
  const t = (m: MarcadorVivo) => new Date(m.puntos.at(-1)!.t).getTime();
  let m = puntos(marcador(), "AAAA"); // 1-0
  let c = cambioDeLadoEnCurso(calcularMarcador(m), t(m));
  assert.ok(c?.directo);
  assert.equal(c?.segundos, 0);
  m = puntos(m, "BBBB"); // 1-1: no se cambia
  assert.equal(cambioDeLadoEnCurso(calcularMarcador(m), t(m)), null);
  m = puntos(m, "AAAA"); // 2-1: 90 s
  c = cambioDeLadoEnCurso(calcularMarcador(m), t(m) + 30_000);
  assert.equal(c?.segundos, 90);
  assert.equal(c?.quedan, 60);
  assert.equal(cambioDeLadoEnCurso(calcularMarcador(m), t(m) + 101_000), null, "se apaga pasado el tiempo");
});

test("FIP sanciones: advertencia, punto y descalificación, acumuladas por dupla", () => {
  let m = marcador();
  let r = sancionar(m, { lado: "A", jugadorId: "a1", motivo: "Abuso de pelota" });
  assert.equal(r.nivel, "ADVERTENCIA");
  assert.equal(r.marcador.puntos.length, 0);
  r = sancionar(r.marcador, { lado: "A", jugadorId: "a2", motivo: "Obscenidad" });
  assert.equal(r.nivel, "PUNTO");
  const e = calcularMarcador(r.marcador);
  assert.deepEqual(e.texto, ["0", "15"]);
  assert.equal(statsPartido(r.marcador)[0].puntosJugados, 0, "el punto de sanción no es un punto jugado");
  assert.equal(proximaSancion(r.marcador, "A"), "DESCALIFICACION");
  assert.equal(proximaSancion(r.marcador, "B"), "ADVERTENCIA");
  // Deshacer el punto quita también la sanción que lo generó.
  m = deshacer(r.marcador);
  assert.equal(m.sanciones?.length, 1);
  assert.equal(sancionar(marcador(), { lado: "B", motivo: "Agresión", directa: true }).nivel, "DESCALIFICACION");
});

test("FIP 2.17–2.19: una atención por lesión por jugador; el accidente no cuenta", () => {
  let m = pedirAtencion(marcador(), "a1", "LESION");
  assert.ok(!puedePedirAtencion(m, "a1", "LESION"));
  assert.ok(puedePedirAtencion(m, "a2", "LESION"), "no se cede, pero el compañero tiene la suya");
  assert.ok(puedePedirAtencion(m, "a1", "ACCIDENTE"));
  const t0 = new Date(m.atenciones![0].t).getTime();
  assert.equal(atencionEnCurso(m, t0 + 60_000)?.quedan, 120);
  assert.equal(atencionEnCurso(m, t0 + 181_000), null);
  m = pedirAtencion(m, "a1", "LESION");
  assert.equal(m.atenciones!.length, 1);
});

test("FIP 2.1: W.O. a los 10 min de la hora prevista, o 5 min después de que terminó el anterior en la pista", () => {
  const prog = (hora: string, extra: Partial<PartidoTorneo> = {}): PartidoTorneo =>
    ({ id: hora, categoriaId: "c", fase: "GRUPO", estado: "LLAMADO", programacion: { fecha: "2026-11-07", hora, pista: 1 }, ...extra }) as PartidoTorneo;
  const ms = (h: string) => new Date(`2026-11-07T${h}:00`).getTime();
  const anterior = prog("09:00", { estado: "FINALIZADO", finEn: new Date(ms("10:40")).toISOString() });
  const p = prog("10:30", { llamadoEn: new Date(ms("10:41")).toISOString() });
  const t = { toleranciaWO: 10, categorias: [{ cuadro: { partidos: [anterior, p] } }] } as unknown as Torneo;
  // Hora prevista = 10:40 + 5 = 10:45 → W.O. desde 10:55.
  assert.equal(limiteWO(t, p), ms("10:55"));
  // Sin partido anterior: 10 min después de la hora programada.
  const solo = prog("10:30", { llamadoEn: new Date(ms("10:20")).toISOString() });
  assert.equal(limiteWO({ toleranciaWO: 10 }, solo), ms("10:40"));
});
