import { test } from "node:test";
import assert from "node:assert/strict";
import { asientosDesdeGrupos, posicionesSiembra, proponerFormato, tamanosGrupos } from "../lib/torneo/cuadro.ts";
import { CONFIG_CUADRO_BASE, catMaster, catNivel, catJunior, validarDupla } from "../lib/torneo/categorias.ts";
import {
  cargarResultado,
  categoria,
  crearTorneo,
  ganadorPartido,
  inscribirDupla,
  publicarCategoria,
  quitarDupla,
  registrarSorteoDesempate,
  sortearCategoria,
  tablasCategoria,
} from "../lib/torneo/torneo.ts";
import { programarTorneo } from "../lib/torneo/programacion.ts";
import { validarResultadoTorneo } from "../lib/torneo/tabla.ts";
import { ace, anotarPunto, calcularMarcador, deshacer, faltaSaque, nuevoMarcador, statsPartido } from "../lib/torneo/marcador.ts";
import { CLUB_POR_DEFECTO } from "../lib/horarios.ts";
import type { JugadorTorneo, MarcadorVivo, ReglasPartido, Torneo } from "../types/torneo.ts";
import type { SetScore } from "../types/americano.ts";

const jug = (id: string, genero: "M" | "F" = "M", nac?: string): JugadorTorneo => ({ id, nombre: id, apellido: id.toUpperCase(), genero, fechaNacimiento: nac });

function torneoCon(n: number, catId = "M-4TA", dias = [{ fecha: "2026-11-07", inicio: "08:00", fin: "22:00" }, { fecha: "2026-11-08", inicio: "08:00", fin: "20:00" }]): Torneo {
  let t = crearTorneo({ nombre: "Copa", dias, canchas: CLUB_POR_DEFECTO.pistas, categorias: [catNivel("MASCULINO", "4TA")] });
  for (let i = 1; i <= n; i++) t = inscribirDupla(t, catId, jug(`${catId}-a${i}`), jug(`${catId}-b${i}`), { id: `d${i}`, puntos: 1000 - i * 10 });
  return t;
}

const s = (...xs: [number, number][]): SetScore[] => xs.map(([a, b]) => ({ a, b }));

function jugar(t: Torneo, x: string, y: string, sets: SetScore[]): Torneo {
  const c = t.categorias[0];
  const p = c.cuadro!.partidos.find((p) => (p.duplaA === x && p.duplaB === y) || (p.duplaA === y && p.duplaB === x))!;
  const orient = p.duplaA === x ? sets : sets.map((z) => ({ a: z.b, b: z.a }));
  const ganaA = orient.filter((z) => z.a > z.b).length > orient.filter((z) => z.b > z.a).length;
  return cargarResultado(t, p.id, { sets: orient, ganador: ganaA ? "A" : "B", tipo: "NORMAL" });
}

/* ---------- formato ---------- */

test("tamaños de grupo: de 3, y de 4 cuando no cuadra", () => {
  assert.deepEqual(tamanosGrupos(6), [3, 3]);
  assert.deepEqual(tamanosGrupos(7), [4, 3]);
  assert.deepEqual(tamanosGrupos(10), [4, 3, 3]);
  assert.deepEqual(tamanosGrupos(16, 4), [4, 4, 4, 4]);
});

test("formato propuesto según inscritos", () => {
  assert.equal(proponerFormato(2, CONFIG_CUADRO_BASE).config.formato, "ELIMINACION");
  assert.equal(proponerFormato(3, CONFIG_CUADRO_BASE).config.formato, "LIGA");
  assert.equal(proponerFormato(5, CONFIG_CUADRO_BASE).config.formato, "LIGA_FINAL");
  const p9 = proponerFormato(9, CONFIG_CUADRO_BASE);
  assert.equal(p9.config.formato, "GRUPOS_LLAVE");
  assert.equal(p9.llave, 8);
  assert.equal(p9.byes, 2);
  for (let n = 6; n <= 40; n++) assert.ok(proponerFormato(n, CONFIG_CUADRO_BASE).minimoPorDupla >= 2, `n=${n}`);
});

test("siembra estándar: 1 arriba, 2 abajo", () => {
  assert.deepEqual(posicionesSiembra(8), [1, 8, 4, 5, 2, 7, 3, 6]);
});

test("los clasificados de un mismo grupo quedan en mitades opuestas", () => {
  for (let G = 2; G <= 8; G++) {
    const grupos = Array.from({ length: G }, (_, i) => ({ id: `G${i}`, nombre: String(i), duplaIds: [] }));
    const asientos = asientosDesdeGrupos(grupos, 2);
    const tam = 2 ** Math.ceil(Math.log2(2 * G));
    const orden = posicionesSiembra(tam);
    for (const g of grupos) {
      const pos = asientos.map((o, i) => (o.tipo === "GRUPO" && o.grupoId === g.id ? orden.indexOf(i + 1) : -1)).filter((x) => x >= 0);
      assert.equal(pos.length, 2);
      assert.notEqual(Math.floor(pos[0] / (tam / 2)), Math.floor(pos[1] / (tam / 2)), `G=${G} grupo ${g.id}`);
    }
  }
});

/* ---------- categorías ---------- */

test("Master y Junior validan la edad del año del torneo", () => {
  const m45 = catMaster("MASCULINO", 45);
  assert.equal(validarDupla(m45, jug("a", "M", "1981-05-01"), jug("b", "M", "1980-01-01"), 2026), null);
  assert.match(validarDupla(m45, jug("a", "M", "1990-05-01"), jug("b", "M", "1980-01-01"), 2026)!, /Master \+45/);
  const s14 = catJunior("FEMENINO", 14);
  assert.match(validarDupla(s14, jug("a", "F", "2010-05-01"), jug("b", "F", "2013-01-01"), 2026)!, /Sub-14/);
  assert.match(validarDupla(catNivel("MIXTO", "3RA"), jug("a", "M"), jug("b", "M"), 2026)!, /Mixto/);
});

/* ---------- sorteo y llaves ---------- */

test("7 duplas: 2 grupos (4 y 3) y semifinales cruzadas", () => {
  let t = torneoCon(7);
  t = sortearCategoria(t, "M-4TA", { semilla: 7, config: proponerFormato(7, CONFIG_CUADRO_BASE).config });
  const c = categoria(t, "M-4TA")!;
  assert.deepEqual(c.cuadro!.grupos.map((g) => g.duplaIds.length), [4, 3]);
  // Serpiente: d1 y d2 (los mejores) en grupos distintos.
  assert.ok(c.cuadro!.grupos[0].duplaIds.includes("d1"));
  assert.ok(c.cuadro!.grupos[1].duplaIds.includes("d2"));
  const semis = c.cuadro!.partidos.filter((p) => p.fase === "LLAVE" && p.ronda === 1);
  assert.equal(semis.length, 2);
  const lados = semis.map((p) => [p.origenA, p.origenB].map((o) => (o.tipo === "GRUPO" ? `${o.puesto}${o.grupoId}` : "?")).join(" vs "));
  assert.deepEqual(lados, ["1GA vs 2GB", "1GB vs 2GA"]);
});

test("9 duplas: los 2 mejores primeros pasan con bye y la llave se llena sola", () => {
  let t = torneoCon(9);
  t = sortearCategoria(t, "M-4TA", { semilla: 3, config: proponerFormato(9, CONFIG_CUADRO_BASE).config });
  let c = categoria(t, "M-4TA")!;
  // Se juegan todos los grupos: gana siempre la dupla de mejor siembra.
  for (const p of c.cuadro!.partidos.filter((p) => p.fase === "GRUPOS")) {
    const [x, y] = [p.duplaA!, p.duplaB!].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
    t = jugar(t, x, y, s([6, 2], [6, 3]));
  }
  c = categoria(t, "M-4TA")!;
  const cuartos = c.cuadro!.partidos.filter((p) => p.fase === "LLAVE" && p.ronda === 1);
  assert.equal(cuartos.length, 4);
  const byes = cuartos.filter((p) => p.bye);
  assert.equal(byes.length, 2);
  assert.ok(byes.every((p) => p.estado === "FINALIZADO" && ganadorPartido(p)));
  const semis = c.cuadro!.partidos.filter((p) => p.fase === "LLAVE" && p.ronda === 2);
  // Los que pasaron con bye ya están en semis.
  assert.equal(semis.filter((p) => p.duplaA).length, 2);
  // Nadie del mismo grupo se cruza en cuartos.
  const grupoDe = (d: string) => c.cuadro!.grupos.find((g) => g.duplaIds.includes(d))!.id;
  for (const p of cuartos.filter((p) => !p.bye)) assert.notEqual(grupoDe(p.duplaA!), grupoDe(p.duplaB!));
});

test("eliminación directa con 5: llave de 8, 3 byes que avanzan solos", () => {
  let t = torneoCon(5);
  t = sortearCategoria(t, "M-4TA", { semilla: 1, config: { ...CONFIG_CUADRO_BASE, formato: "ELIMINACION" } });
  const c = categoria(t, "M-4TA")!;
  const r1 = c.cuadro!.partidos.filter((p) => p.ronda === 1);
  assert.equal(r1.length, 4);
  assert.equal(r1.filter((p) => p.bye).length, 3);
  // d1, d2, d3 (mejores) pasan con bye; d4 vs d5 se juega.
  const jugable = r1.find((p) => !p.bye)!;
  assert.deepEqual([jugable.duplaA, jugable.duplaB].sort(), ["d4", "d5"]);
  const r2 = c.cuadro!.partidos.filter((p) => p.ronda === 2);
  assert.ok(r2.some((p) => p.duplaA === "d1"));
});

/* ---------- desempates ---------- */

function grupoDe3(): Torneo {
  let t = torneoCon(3);
  t = sortearCategoria(t, "M-4TA", { semilla: 9, config: { ...CONFIG_CUADRO_BASE, formato: "LIGA" } });
  return t;
}

test("triple empate: decide la diferencia de games entre las empatadas y lo explica", () => {
  let t = grupoDe3();
  t = jugar(t, "d1", "d2", s([6, 0], [6, 0]));
  t = jugar(t, "d2", "d3", s([6, 4], [6, 4]));
  t = jugar(t, "d3", "d1", s([6, 3], [6, 3]));
  const [tb] = tablasCategoria(t, t.categorias[0]);
  assert.ok(tb.completo);
  assert.deepEqual(tb.filas.map((f) => f.duplaId), ["d1", "d3", "d2"]);
  assert.match(tb.notas[0].texto, /Empate entre 3 .*games entre las empatadas/);
  assert.equal(tb.sorteoPendiente, null);
});

test("triple empate que separa a una y deja 2: decide el partido entre ellas", () => {
  let t = grupoDe3();
  t = jugar(t, "d1", "d2", s([6, 4], [3, 6], [10, 8])); // d1 gana 2-1
  t = jugar(t, "d2", "d3", s([6, 4], [6, 4])); // d2 gana 2-0
  t = jugar(t, "d3", "d1", s([6, 4], [6, 4])); // d3 gana 2-0
  // Sets entre ellas: d1 2-3 (-1), d2 3-2 (+1), d3 2-2 (0) → d2, d3, d1
  const [tb] = tablasCategoria(t, t.categorias[0]);
  assert.deepEqual(tb.filas.map((f) => f.duplaId), ["d2", "d3", "d1"]);
  assert.match(tb.notas[0].texto, /sets/);
});

test("empate en todo: pide sorteo y lo respeta al registrarlo", () => {
  let t = grupoDe3();
  t = jugar(t, "d1", "d2", s([6, 4], [6, 4]));
  t = jugar(t, "d2", "d3", s([6, 4], [6, 4]));
  t = jugar(t, "d3", "d1", s([6, 4], [6, 4]));
  let [tb] = tablasCategoria(t, t.categorias[0]);
  assert.deepEqual([...tb.sorteoPendiente!].sort(), ["d1", "d2", "d3"]);
  t = registrarSorteoDesempate(t, "M-4TA", tb.grupo.id, ["d3", "d1", "d2"]);
  [tb] = tablasCategoria(t, t.categorias[0]);
  assert.equal(tb.sorteoPendiente, null);
  assert.deepEqual(tb.filas.map((f) => f.duplaId), ["d3", "d1", "d2"]);
});

test("dupla retirada: sus partidos pendientes pasan a W.O. y queda última", () => {
  let t = grupoDe3();
  t = jugar(t, "d1", "d2", s([6, 4], [6, 4]));
  t = quitarDupla(t, "M-4TA", "d1");
  const c = t.categorias[0];
  const pendientes = c.cuadro!.partidos.filter((p) => p.estado !== "FINALIZADO");
  assert.equal(pendientes.length, 1); // solo d2 vs d3
  const [tb] = tablasCategoria(t, c);
  assert.equal(tb.filas.at(-1)!.duplaId, "d1");
});

test("validación de resultados", () => {
  const r: ReglasPartido = { sets: 3, games: 6, tieBreakEn: 6, puntoDeOro: true, superTie: true, minutos: 90 };
  assert.equal(validarResultadoTorneo(r, s([6, 4], [7, 6])), null);
  assert.equal(validarResultadoTorneo(r, s([6, 4], [4, 6], [10, 7])), null);
  assert.match(validarResultadoTorneo(r, s([6, 4], [4, 6], [10, 9]))!, /Súper/);
  assert.match(validarResultadoTorneo(r, s([6, 5]))!, /no es un set terminado/);
  assert.match(validarResultadoTorneo(r, s([6, 4], [6, 4], [6, 1]))!, /Sobran/);
});

/* ---------- programación ---------- */

test("programación: sin choques de pista ni de jugador, con descanso, y finales el último día", () => {
  let t = torneoCon(12);
  t = sortearCategoria(t, "M-4TA", { semilla: 11, config: proponerFormato(12, CONFIG_CUADRO_BASE).config });
  t = publicarCategoria(t, "M-4TA");
  const res = programarTorneo(t);
  assert.equal(res.sinLugar.length, 0, `sin lugar: ${res.sinLugar.join(", ")}`);
  const c = res.torneo.categorias[0];
  const jugables = c.cuadro!.partidos.filter((p) => !p.bye);
  assert.ok(jugables.every((p) => p.programacion));
  const aMin = (p: (typeof jugables)[number]) => (p.programacion!.fecha === "2026-11-08" ? 1440 : 0) + Number(p.programacion!.hora.slice(0, 2)) * 60 + Number(p.programacion!.hora.slice(3));
  const dur = (p: (typeof jugables)[number]) => (p.fase === "GRUPOS" ? c.reglas.GRUPOS.minutos : 105);
  for (const a of jugables) {
    for (const b of jugables) {
      if (a.id >= b.id) continue;
      const solapan = aMin(a) < aMin(b) + dur(b) && aMin(b) < aMin(a) + dur(a);
      if (solapan) assert.notEqual(a.programacion!.pista, b.programacion!.pista, `${a.id} y ${b.id} en la misma pista`);
      const comparten = [a.duplaA, a.duplaB].some((d) => d && [b.duplaA, b.duplaB].includes(d));
      if (comparten) {
        const separacion = Math.max(aMin(b) - (aMin(a) + dur(a)), aMin(a) - (aMin(b) + dur(b)));
        assert.ok(separacion >= t.descansoMin, `${a.id} y ${b.id}: descanso ${separacion}`);
      }
    }
  }
  const final = jugables.find((p) => p.etiqueta === "Final")!;
  assert.equal(final.programacion!.fecha, "2026-11-08");
  assert.equal(final.programacion!.pista, 1);
});

test("programación: avisa cuando no entra todo", () => {
  let t = torneoCon(16, "M-4TA", [{ fecha: "2026-11-07", inicio: "08:00", fin: "12:00" }]);
  t = sortearCategoria(t, "M-4TA", { semilla: 2, config: proponerFormato(16, CONFIG_CUADRO_BASE).config });
  t = publicarCategoria(t, "M-4TA");
  const res = programarTorneo(t);
  assert.ok(res.sinLugar.length > 0);
  assert.ok(res.horasFaltantes > 0);
});

/* ---------- marcador ---------- */

const reglas: ReglasPartido = { sets: 3, games: 6, tieBreakEn: 6, puntoDeOro: true, superTie: true, minutos: 90 };

function marcador(r = reglas): MarcadorVivo {
  return nuevoMarcador({
    partidoId: "p",
    torneoId: "t",
    categoriaId: "c",
    reglas: r,
    jugadoresA: ["a1", "a2"],
    jugadoresB: ["b1", "b2"],
    sacaPrimero: "A",
    primerA: "a1",
    primerB: "b1",
  });
}

const puntos = (m: MarcadorVivo, seq: string) => [...seq].reduce((acc, ch) => anotarPunto(acc, ch as "A" | "B"), m);

test("marcador: punto de oro define el game a 40-40", () => {
  let m = puntos(marcador(), "AAABBB");
  let e = calcularMarcador(m);
  assert.deepEqual(e.texto, ["40", "40"]);
  assert.ok(e.puntoDeOro);
  m = anotarPunto(m, "B");
  e = calcularMarcador(m);
  assert.deepEqual(e.games, { a: 0, b: 1 });
  assert.equal(e.jugados.at(-1)!.oro, true);
  assert.equal(e.jugados.at(-1)!.breakPoint, true);
});

test("marcador: ventaja cuando no hay punto de oro", () => {
  const m = puntos(marcador({ ...reglas, puntoDeOro: false }), "AAABBBA");
  assert.deepEqual(calcularMarcador(m).texto, ["AD", "40"]);
});

test("marcador: orden de saque A1, B1, A2, B2 y cambio de lado en games impares", () => {
  let m = marcador();
  const sacadores: string[] = [];
  for (let g = 0; g < 4; g++) {
    sacadores.push(calcularMarcador(m).sacador);
    m = puntos(m, "AAAA");
    if (g === 0) assert.ok(calcularMarcador(m).cambioDeLado);
    if (g === 1) assert.ok(!calcularMarcador(m).cambioDeLado);
  }
  assert.deepEqual(sacadores, ["a1", "b1", "a2", "b2"]);
});

test("marcador: tie-break a 7 en 6-6 y súper tie-break a 10 en el tercer set", () => {
  let m = marcador();
  for (let g = 0; g < 6; g++) m = puntos(m, "AAAABBBB");
  let e = calcularMarcador(m);
  assert.deepEqual(e.games, { a: 6, b: 6 });
  assert.ok(e.enTie);
  m = puntos(m, "AAAAAA");
  assert.ok(calcularMarcador(m).setPoint === "A");
  m = anotarPunto(m, "A");
  e = calcularMarcador(m);
  assert.deepEqual(e.sets[0], { a: 7, b: 6 });
  // Set 2 para B 6-0
  for (let g = 0; g < 6; g++) m = puntos(m, "BBBB");
  e = calcularMarcador(m);
  assert.ok(e.enSuperTie);
  m = puntos(m, "AAAAAAAAA");
  assert.equal(calcularMarcador(m).matchPoint, "A");
  m = anotarPunto(m, "A");
  e = calcularMarcador(m);
  assert.ok(e.terminado);
  assert.equal(e.ganador, "A");
  assert.deepEqual(e.sets, [{ a: 7, b: 6 }, { a: 0, b: 6 }, { a: 1, b: 0 }]);
});

test("marcador: doble falta, ace, deshacer y estadísticas", () => {
  let m = marcador();
  m = faltaSaque(m);
  m = faltaSaque(m); // doble falta de a1 → punto B
  m = ace(m); // ace de a1 → punto A
  m = anotarPunto(m, "A", { fin: "WINNER", jugadorId: "a2", golpe: "VIBORA" });
  m = anotarPunto(m, "A", { fin: "ERROR_NO_FORZADO", jugadorId: "b1", golpe: "GLOBO" });
  let e = calcularMarcador(m);
  assert.deepEqual(e.texto, ["40", "15"]);
  const st = statsPartido(m);
  const a1 = st.find((x) => x.jugadorId === "a1")!;
  const a2 = st.find((x) => x.jugadorId === "a2")!;
  const b1 = st.find((x) => x.jugadorId === "b1")!;
  assert.equal(a1.doblesFaltas, 1);
  assert.equal(a1.aces, 1);
  assert.equal(a1.saques, 4);
  assert.equal(a1.primerosDentro, 3);
  assert.equal(a2.winners, 1);
  assert.equal(a2.golpes.VIBORA?.winners, 1);
  assert.equal(b1.erroresNoForzados, 1);
  m = deshacer(m);
  e = calcularMarcador(m);
  assert.deepEqual(e.texto, ["30", "15"]);
});
