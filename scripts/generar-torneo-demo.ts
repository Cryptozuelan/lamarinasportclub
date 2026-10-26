/**
 * Agrega a data/mockData.json un torneo de ejemplo en pleno desarrollo (con marcadores punto a punto).
 *   node --experimental-strip-types scripts/generar-torneo-demo.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { repartirTurnos } from "../lib/torneo/arbitros.ts";
import { CLUB_POR_DEFECTO } from "../lib/horarios.ts";
import { crearRng } from "../lib/rotation.ts";
import { catJunior, catMaster, catNivel } from "../lib/torneo/categorias.ts";
import { ace, anotarPunto, calcularMarcador, faltaSaque, nuevoMarcador, setsFinales } from "../lib/torneo/marcador.ts";
import { programarTorneo } from "../lib/torneo/programacion.ts";
import {
  actualizarPartido,
  cargarResultado,
  crearTorneo,
  inscribirDupla,
  publicarCategoria,
  reglasDe,
  sortearCategoria,
  todosLosPartidos,
} from "../lib/torneo/torneo.ts";
import type { Golpe, JugadorTorneo, MarcadorVivo, PartidoTorneo, Torneo } from "../types/torneo.ts";

const rng = crearRng(1107);
const azar = <T,>(xs: T[]) => xs[Math.floor(rng() * xs.length)];
const ZONA = "-04:00";
const AHORA = new Date(`2026-10-24T11:50:00${ZONA}`).getTime();

const HOMBRES = ["Alejandro", "Gabriel", "Daniel", "Miguel", "José", "Carlos", "Luis", "Andrés", "Ricardo", "Javier", "Eduardo", "Fernando", "Rafael", "Simón", "Héctor", "Gustavo", "Óscar", "Manuel", "Iván", "Pedro", "Rodrigo", "Ernesto", "Víctor", "Ramón"];
const MUJERES = ["María", "Gabriela", "Andrea", "Valentina", "Daniela", "Carolina", "Mariana", "Fabiola", "Patricia", "Alejandra", "Verónica", "Adriana", "Natalia", "Carla", "Irene", "Elena", "Lorena", "Mónica"];
const APELLIDOS = ["Rodríguez", "González", "Pérez", "Hernández", "García", "Martínez", "López", "Díaz", "Romero", "Sánchez", "Ramírez", "Torres", "Flores", "Rivas", "Mendoza", "Castillo", "Guerra", "Bello", "Briceño", "Urdaneta", "Montilla", "Carrasquel", "Zambrano", "Villegas", "Araujo", "Chacón", "Uzcátegui", "Pacheco", "Salazar", "Lugo", "Marcano", "Rengifo", "Colmenares", "Ochoa", "Arismendi", "Silva", "Fuenmayor", "Quintero", "Machado", "Sucre"];

let n = 0;
const usados = new Set<string>();
function jugador(genero: "M" | "F", nacimiento?: string): JugadorTorneo {
  let nombre = "", apellido = "";
  do {
    nombre = azar(genero === "M" ? HOMBRES : MUJERES);
    apellido = azar(APELLIDOS);
  } while (usados.has(`${nombre} ${apellido}`));
  usados.add(`${nombre} ${apellido}`);
  return { id: `tj_${String(++n).padStart(3, "0")}`, nombre, apellido, genero, fechaNacimiento: nacimiento };
}

const nac = (desde: number, hasta: number) => `${desde + Math.floor(rng() * (hasta - desde + 1))}-0${1 + Math.floor(rng() * 9)}-1${Math.floor(rng() * 9)}`;

const categorias = [
  { cat: catNivel("MASCULINO", "4TA"), duplas: 9, a: "M", b: "M" },
  { cat: catNivel("MASCULINO", "2DA"), duplas: 8, a: "M", b: "M" },
  { cat: catNivel("MASCULINO", "1RA"), duplas: 4, a: "M", b: "M" },
  { cat: catNivel("FEMENINO", "5TA"), duplas: 6, a: "F", b: "F" },
  { cat: catNivel("MIXTO", "5TA"), duplas: 5, a: "M", b: "F" },
  { cat: catMaster("MASCULINO", 45), duplas: 6, a: "M", b: "M", nac: [1966, 1979] as const },
  { cat: catJunior("MASCULINO", 16), duplas: 3, a: "M", b: "M", nac: [2010, 2012] as const },
] as const;

let t: Torneo = crearTorneo({
  nombre: "Open La Marina 2026",
  dias: [
    { fecha: "2026-10-23", inicio: "16:00", fin: "23:00" },
    { fecha: "2026-10-24", inicio: "08:00", fin: "23:00" },
    { fecha: "2026-10-25", inicio: "08:00", fin: "20:00" },
  ],
  canchas: CLUB_POR_DEFECTO.pistas,
  categorias: categorias.map((c) => c.cat),
});
t = { ...t, id: "t-open-2026", creadoEn: "2026-10-10T14:00:00.000Z", acceso: { clave: "MARINA", vence: new Date(`2026-10-25T23:59:00${ZONA}`).toISOString() }, arbitros: { turnos: [] } };

const fuerza = new Map<string, number>();
for (const c of categorias) {
  for (let i = 0; i < c.duplas; i++) {
    const r = "nac" in c ? c.nac : null;
    const a = jugador(c.a, r ? nac(r[0], r[1]) : undefined);
    const b = jugador(c.b, r ? nac(r[0], r[1]) : undefined);
    const id = `${c.cat.id}-d${i + 1}`;
    t = inscribirDupla(t, c.cat.id, a, b, { id, puntos: 1200 - i * 90 - Math.floor(rng() * 60), cabezaSerie: i < 2 ? i + 1 : null });
    fuerza.set(id, 1 - i * 0.06 + rng() * 0.1);
  }
  t = sortearCategoria(t, c.cat.id, { semilla: 7 + n, por: "Staff" });
  t = publicarCategoria(t, c.cat.id, "Staff");
}
t = programarTorneo(t).torneo;

/* ---------- simular lo que ya se jugó ---------- */

const GOLPES_WINNER: Golpe[] = ["REMATE", "REMATE", "X3", "VIBORA", "VIBORA", "BANDEJA", "VOLEA", "VOLEA", "CHIQUITA", "BAJADA", "GLOBO"];
const GOLPES_ERROR: Golpe[] = ["VOLEA", "BANDEJA", "VIBORA", "DRIVE", "REVES", "REVES", "GLOBO", "BAJADA", "REMATE"];
const inicio = (p: PartidoTorneo) => new Date(`${p.programacion!.fecha}T${p.programacion!.hora}:00${ZONA}`).getTime();
const marcadores: MarcadorVivo[] = [];

/** Juega punto a punto con detalle; se detiene en `limite` puntos (partido en curso). */
function simular(p: PartidoTorneo, ini: number, limite = Infinity, favorito: "A" | "B" | null = null): MarcadorVivo {
  const da = t.categorias.flatMap((c) => c.duplas).find((d) => d.id === p.duplaA)!;
  const db = t.categorias.flatMap((c) => c.duplas).find((d) => d.id === p.duplaB)!;
  const pA = favorito ? (favorito === "A" ? 0.56 : 0.44) : 0.5 + ((fuerza.get(da.id) ?? 0.8) - (fuerza.get(db.id) ?? 0.8)) * 0.35;
  let m = nuevoMarcador({
    partidoId: p.id, torneoId: t.id, categoriaId: p.categoriaId, reglas: reglasDe(t, p),
    jugadoresA: da.jugadorIds, jugadoresB: db.jugadorIds,
    sacaPrimero: rng() < 0.5 ? "A" : "B", primerA: da.jugadorIds[0], primerB: db.jugadorIds[0],
    pista: p.programacion!.pista, anotador: "Staff",
  });
  let reloj = ini + 4 * 60_000;
  while (!calcularMarcador(m).terminado && m.puntos.length < limite) {
    const e = calcularMarcador(m);
    const sacaA = e.equipoSaca === "A";
    const r = rng();
    const ganadores = (l: "A" | "B") => [...(l === "A" ? da : db).jugadorIds];
    if (r < 0.025) m = ace(m);
    else if (r < 0.075 && rng() < 0.2) m = faltaSaque(faltaSaque(m));
    else {
      if (r < 0.075) m = faltaSaque(m);
      const gana = rng() < pA + (sacaA ? 0.06 : -0.06) ? "A" : "B";
      const pierde = gana === "A" ? "B" : "A";
      const tipo = rng();
      m =
        tipo < 0.2 ? anotarPunto(m, gana, { fin: "WINNER", jugadorId: azar(ganadores(gana)), golpe: azar(GOLPES_WINNER) })
        : tipo < 0.5 ? anotarPunto(m, gana, { fin: "ERROR_NO_FORZADO", jugadorId: azar(ganadores(pierde)), golpe: azar(GOLPES_ERROR) })
        : tipo < 0.7 ? anotarPunto(m, gana, { fin: "ERROR_FORZADO", jugadorId: azar(ganadores(pierde)) })
        : anotarPunto(m, gana);
    }
    reloj += 26_000 + Math.floor(rng() * 30_000);
    m = { ...m, puntos: m.puntos.map((x, i) => (i === m.puntos.length - 1 ? { ...x, t: new Date(reloj).toISOString() } : x)) };
  }
  return { ...m, iniciadoEn: new Date(ini + 4 * 60_000).toISOString(), actualizadoEn: new Date(reloj).toISOString(), finalizado: calcularMarcador(m).terminado };
}

const ordenados = () =>
  todosLosPartidos(t)
    .filter((p) => p.programacion && !p.bye && p.estado !== "FINALIZADO")
    .sort((a, b) => inicio(a) - inicio(b) || a.programacion!.pista - b.programacion!.pista);

// Grupo A de 4ta: triple empate (cada dupla gana un partido) para mostrar el desempate explicado.
const GA = t.categorias.find((c) => c.categoria.id === "M-4TA")!.cuadro!.grupos[0].duplaIds;
const TRIPLE = "M-4TA:GA:J3:1";
function ganadorForzado(p: PartidoTorneo): "A" | "B" | null {
  if (p.grupoId !== "GA" || p.categoriaId !== "M-4TA") return null;
  const vence = (x: string, y: string) => (GA.indexOf(y) - GA.indexOf(x) + 3) % 3 === 1;
  return vence(p.duplaA!, p.duplaB!) ? "A" : "B";
}
function jugarHasta(p: PartidoTorneo, ini: number): MarcadorVivo {
  const quiere = ganadorForzado(p);
  for (let i = 0; ; i++) {
    const m = simular(p, ini, Infinity, quiere);
    if (!quiere || calcularMarcador(m).ganador === quiere || i > 300) return m;
  }
}

let enCurso = 0;
let llamado = false;
for (let vuelta = 0; vuelta < 400; vuelta++) {
  // El llamado va a una pista que esté libre ahora (se adelanta si hace falta).
  const ocupadas = new Set(todosLosPartidos(t).filter((x) => x.estado === "EN_JUEGO").map((x) => x.programacion?.pista));
  const p = ordenados().find((x) => x.duplaA && x.duplaB && x.estado === "PENDIENTE" && (inicio(x) <= AHORA || (enCurso >= 4 && !ocupadas.has(x.programacion!.pista))));
  if (!p) break;
  const ini = inicio(p);
  const minutos = reglasDe(t, p).minutos * 60_000;
  if (ini + minutos * 0.85 <= AHORA || p.id === TRIPLE) {
    const m = jugarHasta(p, p.id === TRIPLE ? ini - 25 * 60_000 : ini);
    const e = calcularMarcador(m);
    const fin = new Date(m.actualizadoEn).toISOString();
    t = actualizarPartido(t, p.id, (x) => ({ ...x, estado: "EN_JUEGO", inicioEn: m.iniciadoEn, llamadoEn: new Date(ini - 5 * 60_000).toISOString(), pistaReal: x.programacion!.pista, finEn: fin }));
    t = cargarResultado(t, p.id, { sets: setsFinales(e), ganador: e.ganador!, tipo: "NORMAL" }, "Staff");
    marcadores.push(m);
  } else if (ini <= AHORA && enCurso < 5) {
    enCurso++;
    const m = simular(p, ini, 40 + Math.floor(rng() * 60));
    t = actualizarPartido(t, p.id, (x) => ({ ...x, estado: "EN_JUEGO", inicioEn: m.iniciadoEn, llamadoEn: new Date(ini - 5 * 60_000).toISOString(), pistaReal: x.programacion!.pista }));
    marcadores.push({ ...m, actualizadoEn: new Date(AHORA).toISOString() });
  } else if (!llamado) {
    llamado = true;
    t = actualizarPartido(t, p.id, (x) => ({ ...x, estado: "LLAMADO", llamadoEn: new Date(AHORA - 4 * 60_000).toISOString(), pistaReal: x.programacion!.pista }));
  } else break;
}
t = {
  ...t,
  estado: "EN_JUEGO",
  actualizadoEn: new Date(AHORA).toISOString(),
  // Marcas de ejemplo (genéricas) para ver cómo salen en TV y pantallas de pista.
  patrocinadores: [
    { id: "pat-1", nombre: "Patrocinador principal", principal: true, pista: 1 },
    { id: "pat-2", nombre: "Marca aliada", pista: 2 },
    { id: "pat-3", nombre: "Bebida oficial" },
  ],
};

const ruta = new URL("../data/mockData.json", import.meta.url);
const mock = JSON.parse(readFileSync(ruta, "utf8"));
// Árbitros registrados de ejemplo (código 1234) y sus turnos repartidos.
const arbitrosDemo = [
  { id: "arb-demo-carla", nombre: "Carla", apellido: "Rodríguez", telefono: "04140000001" },
  { id: "arb-demo-jose", nombre: "José", apellido: "Méndez", telefono: "04140000002" },
  { id: "arb-demo-ana", nombre: "Ana", apellido: "Pérez", telefono: "04140000003" },
  { id: "arb-demo-luis", nombre: "Luis", apellido: "Salas", telefono: "04140000004" },
  { id: "arb-demo-maria", nombre: "María", apellido: "Gil", telefono: "04140000005" },
  { id: "arb-demo-pedro", nombre: "Pedro", apellido: "Arias", telefono: "04140000006" },
].map((a) => ({ ...a, activo: true, registradoEn: "2026-10-22T14:00:00.000Z", actualizadoEn: "2026-10-22T14:00:00.000Z", codigoDemo: "1234" }));
t = { ...t, arbitros: { ...t.arbitros!, turnos: repartirTurnos(t, arbitrosDemo.map((a) => a.id)) } };

mock.torneos = [t];
mock.marcadores = marcadores;
mock.extras = [{ id: "arbitros:club", torneoId: "club", tipo: "arbitros", data: { pin: "2468", arbitros: arbitrosDemo }, actualizadoEn: "2026-10-22T14:00:00.000Z" }];
writeFileSync(ruta, JSON.stringify(mock, null, 2) + "\n");

const fin = todosLosPartidos(t).filter((p) => p.estado === "FINALIZADO" && !p.bye).length;
console.log(`Torneo demo: ${todosLosPartidos(t).length} partidos, ${fin} jugados, ${enCurso} en juego, ${marcadores.length} marcadores.`);
