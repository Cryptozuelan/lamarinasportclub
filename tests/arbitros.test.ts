/** Árbitros registrados: turnos, sorteo FIP y lado de la pista de cada dupla. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { franjasDia, partidosDeTurno, repartirTurnos, resolverSorteo, sortear } from "../lib/torneo/arbitros.ts";
import { anotarPunto, calcularMarcador, ladoActual, nuevoMarcador } from "../lib/torneo/marcador.ts";
import type { MarcadorVivo, ReglasPartido, Torneo } from "../types/torneo.ts";
import mock from "../data/mockData.json" with { type: "json" };

const torneo = (mock as unknown as { torneos: Torneo[] }).torneos[0];

test("un día largo se parte en mañana y tarde; uno corto queda en una franja", () => {
  assert.deepEqual(franjasDia({ fecha: "2026-10-24", inicio: "08:00", fin: "23:00" }), [
    { desde: "08:00", hasta: "16:00" },
    { desde: "16:00", hasta: "23:00" },
  ]);
  assert.deepEqual(franjasDia({ fecha: "2026-10-23", inicio: "16:00", fin: "23:00" }), [{ desde: "16:00", hasta: "23:00" }]);
});

test("el reparto no pone a un árbitro en dos pistas a la vez y la carga queda pareja", () => {
  const ids = ["a", "b", "c", "d", "e", "f"];
  const ts = repartirTurnos(torneo, ids);
  assert.ok(ts.length > 0);
  const franjas = new Map<string, string[]>();
  for (const x of ts) {
    const k = `${x.fecha} ${x.desde}`;
    franjas.set(k, [...(franjas.get(k) ?? []), x.arbitroId]);
    assert.ok(partidosDeTurno(torneo, x).length > 0, "solo pistas con partidos");
  }
  for (const [k, quienes] of franjas) assert.equal(new Set(quienes).size, quienes.length, `doble turno en ${k}`);
  const carga = ids.map((id) => ts.filter((x) => x.arbitroId === id).length);
  assert.ok(Math.max(...carga) - Math.min(...carga) <= 1, `carga dispareja: ${carga}`);
});

test("con menos árbitros que pistas, cada franja usa a todos sin repetir", () => {
  const ts = repartirTurnos(torneo, ["a", "b"]);
  const k = new Set(ts.map((x) => `${x.fecha} ${x.desde} ${x.arbitroId}`));
  assert.equal(k.size, ts.length);
});

test("sorteo FIP: quien gana elige saque, resto o lado; la otra dupla lo que queda", () => {
  // Gana A y saca: B elige lado (B a la izquierda → A a la derecha).
  assert.deepEqual(resolverSorteo({ gana: "A", eligio: "SACAR", lado: "IZQ" }), { sacaPrimero: "A", ladoInicialA: "DER" });
  // Gana A y resta: saca B.
  assert.deepEqual(resolverSorteo({ gana: "A", eligio: "RESTAR", lado: "DER" }), { sacaPrimero: "B", ladoInicialA: "IZQ" });
  // Gana B, elige lado izquierdo; A elige restar → saca B.
  assert.deepEqual(resolverSorteo({ gana: "B", eligio: "LADO", lado: "IZQ", otraElige: "RESTAR" }), { sacaPrimero: "B", ladoInicialA: "DER" });
  // Gana B, elige lado; A elige sacar.
  assert.deepEqual(resolverSorteo({ gana: "B", eligio: "LADO", lado: "DER", otraElige: "SACAR" }), { sacaPrimero: "A", ladoInicialA: "IZQ" });
});

test("el sorteo sale a veces A y a veces B", () => {
  const vistos = new Set(Array.from({ length: 64 }, () => sortear()));
  assert.deepEqual([...vistos].sort(), ["A", "B"]);
});

const reglas: ReglasPartido = { sets: 3, games: 6, tieBreakEn: 6, puntoDeOro: true, superTie: true, minutos: 90 };
const marcador = (): MarcadorVivo => ({
  ...nuevoMarcador({ partidoId: "p", torneoId: "t", categoriaId: "c", reglas, jugadoresA: ["a1", "a2"], jugadoresB: ["b1", "b2"], sacaPrimero: "A", primerA: "a1", primerB: "b1" }),
  ladoInicialA: "IZQ",
});
const game = (m: MarcadorVivo, l: "A" | "B") => [0, 1, 2, 3].reduce((x) => anotarPunto(x, l), m);

test("las duplas cambian de lado en los games impares (y la pantalla las sigue)", () => {
  let m = marcador();
  let e = calcularMarcador(m);
  assert.equal(ladoActual(m, e, "A"), "IZQ");
  m = game(m, "A"); // 1-0: cambio
  e = calcularMarcador(m);
  assert.equal(e.cambiosDeLado, 1);
  assert.equal(ladoActual(m, e, "A"), "DER");
  assert.equal(ladoActual(m, e, "B"), "IZQ");
  m = game(m, "B"); // 1-1: sin cambio
  e = calcularMarcador(m);
  assert.equal(ladoActual(m, e, "A"), "DER");
  m = game(m, "A"); // 2-1: cambio
  e = calcularMarcador(m);
  assert.equal(ladoActual(m, e, "A"), "IZQ");
});
