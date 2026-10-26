import { test } from "node:test";
import assert from "node:assert/strict";
import { proponerFormato } from "../lib/torneo/cuadro.ts";
import { CONFIG_CUADRO_BASE, catNivel } from "../lib/torneo/categorias.ts";
import { agregarSede, partidosSuspendidos, quitarSede, reanudarPistas, suspenderPistas, suspensionesActivas } from "../lib/torneo/imprevistos.ts";
import { programarTorneo } from "../lib/torneo/programacion.ts";
import { crearTorneo, iniciarPartido, inscribirDupla, publicarCategoria, sortearCategoria, todosLosPartidos } from "../lib/torneo/torneo.ts";
import { CLUB_POR_DEFECTO } from "../lib/horarios.ts";
import type { PartidoTorneo, Torneo } from "../types/torneo.ts";

const DIAS = [
  { fecha: "2026-11-07", inicio: "08:00", fin: "22:00" },
  { fecha: "2026-11-08", inicio: "08:00", fin: "20:00" },
];

function torneo(n: number, canchas = CLUB_POR_DEFECTO.pistas, dias = DIAS): Torneo {
  let t = crearTorneo({ nombre: "Copa", dias, canchas, categorias: [catNivel("MASCULINO", "4TA")] });
  for (let i = 1; i <= n; i++) t = inscribirDupla(t, "M-4TA", { id: `a${i}`, nombre: "A", apellido: `A${i}`, genero: "M" }, { id: `b${i}`, nombre: "B", apellido: `B${i}`, genero: "M" }, { id: `d${i}` });
  t = sortearCategoria(t, "M-4TA", { semilla: 3, config: proponerFormato(n, CONFIG_CUADRO_BASE).config });
  return programarTorneo(publicarCategoria(t, "M-4TA")).torneo;
}

const ms = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00`).getTime();
const inicio = (p: PartidoTorneo) => ms(p.programacion!.fecha, p.programacion!.hora);
const jugables = (t: Torneo) => todosLosPartidos(t).filter((p) => !p.bye);

test("lluvia: se suspenden las pistas, lo que estaba en juego conserva su lugar en la cola y nada cae en pista mojada", () => {
  let t = torneo(12);
  const primero = jugables(t).find((p) => p.programacion?.pista === 2)!;
  t = iniciarPartido(t, primero.id);
  const ahora = inicio(primero) + 30 * 60_000;
  const exteriores = [2, 3, 4, 5];
  const r = suspenderPistas(t, { pistas: exteriores, motivo: "Lluvia", ahora, hastaMs: ahora + 3 * 3600_000, marcadores: { [primero.id]: "6-4 2-1" } });

  assert.deepEqual(r.suspendidos, [primero.id]);
  const susp = r.torneo.categorias[0].cuadro!.partidos.find((p) => p.id === primero.id)!;
  assert.equal(susp.estado, "PENDIENTE");
  assert.equal(susp.suspendido?.marcador, "6-4 2-1");
  assert.ok(susp.programacion && inicio(susp) >= ahora, "el suspendido se reprograma hacia adelante");
  assert.equal(partidosSuspendidos(r.torneo).length, 1);

  for (const p of jugables(r.torneo)) {
    if (!p.programacion || p.estado !== "PENDIENTE") continue;
    const i = inicio(p);
    if (exteriores.includes(p.programacion.pista)) assert.ok(i >= ahora + 3 * 3600_000 || i + 90 * 60_000 <= ahora, `${p.id} cae en pista suspendida`);
  }
  assert.equal(suspensionesActivas(r.torneo, ahora).length, 1);
});

test("lluvia: al reanudar se vuelven a usar las pistas", () => {
  let t = torneo(12);
  const ahora = ms("2026-11-07", "10:00");
  t = suspenderPistas(t, { pistas: [2, 3, 4, 5], motivo: "Lluvia", ahora, hastaMs: null }).torneo;
  assert.ok(jugables(t).filter((p) => p.programacion && inicio(p) >= ahora).every((p) => p.programacion!.pista === 1));
  const id = suspensionesActivas(t, ahora)[0].id;
  const r = reanudarPistas(t, id, { ahora: ahora + 3600_000 });
  assert.equal(suspensionesActivas(r.torneo, ahora + 3600_000).length, 0);
  assert.ok(jugables(r.torneo).some((p) => p.programacion && p.programacion.pista !== 1 && inicio(p) >= ahora + 3600_000));
});

test("sede de apoyo: entra lo que no cabía y nadie cambia de sede sin tiempo de traslado", () => {
  const una = CLUB_POR_DEFECTO.pistas.slice(0, 1);
  const t = torneo(12, una, [{ fecha: "2026-11-07", inicio: "08:00", fin: "22:00" }]);
  const antes = programarTorneo(t);
  assert.ok(antes.sinLugar.length > 0);

  const conSede = agregarSede(t, { nombre: "Club Lechería", pistas: 3, techadas: true, trasladoMin: 30, provisional: true });
  assert.deepEqual(conSede.canchas.filter((c) => c.sedeId).map((c) => c.numero), [101, 102, 103]);
  const r = programarTorneo(conSede);
  assert.equal(r.sinLugar.length, 0, `sin lugar: ${r.sinLugar.join(", ")}`);

  const ps = jugables(r.torneo).filter((p) => p.programacion);
  const sede = (p: PartidoTorneo) => (p.programacion!.pista > 100 ? "x" : "");
  for (const a of ps)
    for (const b of ps) {
      if (a.id >= b.id) continue;
      if (![a.duplaA, a.duplaB].some((d) => d && [b.duplaA, b.duplaB].includes(d))) continue;
      const [x, y] = inicio(a) < inicio(b) ? [a, b] : [b, a];
      const gap = (inicio(y) - inicio(x)) / 60_000 - 90;
      const necesario = t.descansoMin + (sede(x) !== sede(y) ? 30 : 0);
      assert.ok(gap >= necesario, `${x.id} → ${y.id}: ${gap} min, hacen falta ${necesario}`);
    }
});

test("sede de apoyo: su horario limita sus pistas y no se quita con partidos en juego", () => {
  const una = CLUB_POR_DEFECTO.pistas.slice(0, 1);
  let t = torneo(6, una, [{ fecha: "2026-11-07", inicio: "08:00", fin: "22:00" }]);
  t = agregarSede(t, { nombre: "Club Apoyo", pistas: 2, techadas: true, trasladoMin: 20, horarios: [{ fecha: "2026-11-07", inicio: "14:00", fin: "18:00" }] });
  t = programarTorneo(t).torneo;
  for (const p of jugables(t).filter((p) => p.programacion && p.programacion.pista > 100)) {
    assert.ok(p.programacion!.hora >= "14:00" && inicio(p) + 90 * 60_000 <= ms("2026-11-07", "18:00"), `${p.id} fuera del horario de la sede`);
  }
  const enSede = jugables(t).find((p) => p.programacion && p.programacion.pista > 100);
  if (enSede) {
    const sedeId = t.sedes![0].id;
    assert.ok("error" in quitarSede(iniciarPartido(t, enSede.id), sedeId));
    const ok = quitarSede(t, sedeId, { ahora: ms("2026-11-07", "08:00") });
    assert.ok(!("error" in ok) && ok.torneo.canchas.filter((c) => c.sedeId).every((c) => !c.activa));
  }
});
