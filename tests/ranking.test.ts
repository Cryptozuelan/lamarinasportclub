import { test } from "node:test";
import assert from "node:assert/strict";
import { buscadorFvp, buscarAtletas, claveCedula, leerEspecial, leerCsv, leerListaFvp, leerNivel, pendientesFvp, puedeJugar, revisarFvpServidor, verificarDupla } from "../lib/ranking/fvp.ts";
import { catMaster, catNivel } from "../lib/torneo/categorias.ts";
import { crearTorneo, inscribirDupla } from "../lib/torneo/torneo.ts";
import { CLUB_POR_DEFECTO } from "../lib/horarios.ts";
import type { JugadorTorneo, Torneo } from "../types/torneo.ts";

/**
 * Misma forma que la hoja de la FVP (datos inventados): resumen arriba, una tabla por
 * categoría apilada, con su fila de títulos y el título del nombre mal escrito en la primera.
 */
const HOJA = `FEDERACIÓN VENEZOLANA DE PÁDEL,,,,,,,,,
Ascensos y Descensos 2026,,,,,,,,,
Total atletas,6,,,,,,,,
,,,,,,,,,
CATEGORÍA 1ra - Rama femenina,,,,,,,,,
N°,CÉDULA,Alexander pirela,CAT. ORIGEN,GÉNERO,ID EDO.,estados,PUNTUACIÓN MÁXIMA,MOVIMIENTO,CATEGORÍA FINAL
1,V-10000001,ANA PRUEBA UNO,2da,Femenino,2,Anzoátegui,382,Ascenso,1ra
2,V-10.000.002,BEA PRUEBA DOS,4ta,Femenino,4,Aragua,"1.395",Ascenso,1ra
3,S/C,CARLA SIN CEDULA,2da,Femenino,4,Aragua,300,Ascenso,1ra
,,,,,,,,,
CATEGORÍA 2da,,,,,,,,,
N°,CÉDULA,NOMBRE DEL ATLETA,CAT. ORIGEN,GÉNERO,ID EDO.,Zulia,PUNTUACIÓN MÁXIMA,MOVIMIENTO,CATEGORÍA FINAL
1,V-20000001,LUIS PRUEBA,3ra,Masculino,23,Zulia,500,Ascenso,2da
2,V-10000001,ANA PRUEBA UNO,2da,Femenino,2,Anzoátegui,200,Mantener,2da
3,V-20000002,PEDRO PRUEBA,2da,Masculino,1,Distrito Capital,150,Mantener,Segunda
4,V-20000003,RAUL PRUEBA,4ta,Masculino,1,Distrito Capital,90,Ascenso,???
`;

const j = (id: string, cedula: string | null, genero: "M" | "F" = "M"): JugadorTorneo => ({ id, nombre: id, genero, cedula });

test("lee la hoja FVP: tablas apiladas, títulos mal escritos, S/C y cédulas repetidas", () => {
  const { atletas, avisos } = leerListaFvp(HOJA);
  const por = new Map(atletas.map((a) => [a.clave, a]));
  assert.equal(atletas.length, 4);
  assert.equal(por.get("10000001")!.categoria, "1RA", "repetida: se queda con la más alta");
  assert.equal(por.get("10000001")!.nombre, "ANA PRUEBA UNO");
  assert.equal(por.get("10000002")!.puntos, 1395);
  assert.equal(por.get("10000002")!.origen, "4TA");
  assert.equal(por.get("20000001")!.estado, "Zulia");
  assert.equal(por.get("20000001")!.genero, "M");
  assert.equal(por.get("20000002")!.categoria, "2DA");
  assert.ok(!por.has("20000003"));
  assert.ok(avisos.some((a) => a.includes("sin cédula")));
  assert.ok(avisos.some((a) => a.includes("repetidas")));
  assert.ok(avisos.some((a) => a.includes("???")));
});

test("lee lo pegado desde la hoja (tabs) y CSV con punto y coma", () => {
  const tabs = "CÉDULA\tNOMBRE\tCATEGORÍA FINAL\nV-30000001\tX\t3ra\n";
  assert.equal(leerListaFvp(tabs).atletas[0].categoria, "3RA");
  const pyc = "Cedula;Nombre;Categoria\n30000002;Y;5ta\n";
  assert.equal(leerListaFvp(pyc).atletas[0].categoria, "5TA");
  assert.deepEqual(leerCsv('a,"b, c",d\n1,"x ""y""",3'), [["a", "b, c", "d"], ["1", 'x "y"', "3"]]);
});

test("cédulas y niveles", () => {
  assert.equal(claveCedula("V-33.063.269"), "33063269");
  assert.equal(claveCedula("e 08123456"), "8123456");
  assert.equal(claveCedula("S/C"), null);
  assert.equal(leerNivel("1ra"), "1RA");
  assert.equal(leerNivel("7MA"), "7MA");
  assert.equal(leerNivel("Tercera"), "3RA");
  assert.equal(leerNivel("4°"), "4TA");
  assert.equal(leerNivel("Open"), null);
  assert.ok(puedeJugar("2DA", "3RA"), "subir de nivel se puede");
  assert.ok(puedeJugar("3RA", "3RA"));
  assert.ok(!puedeJugar("4TA", "3RA"), "bajar no");
});

test("verificar dupla: bloquea a quien baja de categoría, deja por verificar a quien no aparece", () => {
  const buscar = buscadorFvp(leerListaFvp(HOJA).atletas);
  const luis = j("luis", "V-20000001");
  const pedro = j("pedro", "20000002");
  assert.equal(verificarDupla(catNivel("MASCULINO", "2DA"), [luis, pedro], buscar)!.estado, "VERIFICADA");
  assert.equal(verificarDupla(catNivel("MASCULINO", "1RA"), [luis, pedro], buscar)!.estado, "VERIFICADA");
  const b = verificarDupla(catNivel("MASCULINO", "3RA"), [luis, pedro], buscar)!;
  assert.equal(b.estado, "BLOQUEADA");
  assert.deepEqual(b.categorias, ["2DA", "2DA"]);
  assert.match(b.nota!, /luis es 2da FVP y no puede jugar 3ra/);
  const p = verificarDupla(catNivel("MASCULINO", "2DA"), [luis, j("nuevo", null)], buscar)!;
  assert.equal(p.estado, "POR_VERIFICAR");
  assert.match(p.nota!, /sin cédula/);
  assert.equal(verificarDupla(catNivel("MASCULINO", "2DA"), [luis, j("x", "V-99999999")], buscar)!.estado, "POR_VERIFICAR");
  assert.equal(verificarDupla(catNivel("MASCULINO", "2DA"), [luis, pedro], null)!.estado, "POR_VERIFICAR", "sin lista");
  assert.equal(verificarDupla(catMaster("MASCULINO", 45), [luis, pedro], buscar), null, "Master no se chequea");
  // Mixto: la regla vale para cada jugador.
  const ana = j("ana", "V-10000001", "F");
  assert.equal(verificarDupla(catNivel("MIXTO", "2DA"), [luis, ana], buscar)!.estado, "BLOQUEADA");
});

function torneoBase(): Torneo {
  return crearTorneo({ nombre: "Copa", dias: [{ fecha: "2026-11-07", inicio: "08:00", fin: "22:00" }], canchas: CLUB_POR_DEFECTO.pistas, categorias: [catNivel("MASCULINO", "3RA")] });
}

test("servidor: no deja pasar una dupla 'verificada' que baja de categoría y firma las excepciones", () => {
  const buscar = buscadorFvp(leerListaFvp(HOJA).atletas);
  const base = torneoBase();
  const trampa = inscribirDupla(base, "M-3RA", j("luis", "V-20000001"), j("pedro", "V-20000002"), {
    id: "d1",
    fvp: { estado: "VERIFICADA", categorias: [null, null], en: "2026-10-24T00:00:00.000Z" },
  });
  const r = revisarFvpServidor(base, trampa, buscar, { staff: "Moncho", lista: "L1" });
  assert.equal(r.cambios, 1);
  const d = r.torneo.categorias[0].duplas[0];
  assert.equal(d.fvp!.estado, "BLOQUEADA");
  assert.equal(pendientesFvp(r.torneo, "M-3RA").length, 1, "frena el sorteo");

  // Excepción: queda firmada con el staff de la sesión, no con lo que diga el cliente.
  const exc = inscribirDupla(base, "M-3RA", j("luis", "V-20000001"), j("pedro", "V-20000002"), {
    id: "d1",
    fvp: { estado: "EXCEPCION", categorias: ["2DA", "2DA"], nota: "Vuelve de lesión", por: "Otro", en: "2026-10-24T00:00:00.000Z" },
  });
  const e = revisarFvpServidor(base, exc, buscar, { staff: "Moncho" });
  assert.equal(e.torneo.categorias[0].duplas[0].fvp!.por, "Moncho");
  assert.equal(pendientesFvp(e.torneo, "M-3RA").length, 0);
  // Guardar de nuevo sin cambios no la toca.
  assert.equal(revisarFvpServidor(e.torneo, e.torneo, buscar, { staff: "Ana" }).cambios, 0);

  // Una excepción sin motivo no vale: se vuelve a chequear.
  const sinMotivo = inscribirDupla(base, "M-3RA", j("luis", "V-20000001"), j("pedro", "V-20000002"), {
    id: "d2",
    fvp: { estado: "EXCEPCION", categorias: [null, null], nota: "  ", en: "2026-10-24T00:00:00.000Z" },
  });
  assert.equal(revisarFvpServidor(base, sinMotivo, buscar, { staff: "Moncho" }).torneo.categorias[0].duplas[0].fvp!.estado, "BLOQUEADA");
});

test("servidor: un ascenso posterior no saca a una dupla ya inscrita; con validación apagada no se chequea", () => {
  const base = torneoBase();
  const ok = inscribirDupla(base, "M-3RA", j("a", "V-40000001"), j("b", "V-40000002"), {
    id: "d1",
    fvp: { estado: "VERIFICADA", categorias: ["3RA", "4TA"], en: "2026-10-01T00:00:00.000Z" },
  });
  const ascendieron = buscadorFvp(leerListaFvp("CEDULA,NOMBRE,CATEGORIA FINAL\nV-40000001,A,1ra\nV-40000002,B,1ra\n").atletas);
  assert.equal(revisarFvpServidor(ok, ok, ascendieron, { staff: "Moncho" }).cambios, 0);
  const apagado = { ...inscribirDupla(base, "M-3RA", j("luis", "V-20000001"), j("pedro", "V-20000002"), { id: "d9" }), validarFvp: false };
  assert.equal(revisarFvpServidor(base, apagado, ascendieron, { staff: "Moncho" }).cambios, 0);
  assert.equal(pendientesFvp(apagado, "M-3RA").length, 0);
});

test("servidor: sin lista cargada respeta lo que manda el staff", () => {
  const base = torneoBase();
  const t = inscribirDupla(base, "M-3RA", j("a", "V-1234567"), j("b", null), { id: "d1" });
  assert.equal(revisarFvpServidor(base, t, null, { staff: "Moncho" }).cambios, 0);
});

test("lee el CSV que entrega gviz (headers=0): títulos numéricos vacíos y resumen arriba", () => {
  const gviz = [
    `"","","TOTAL ASCENSOS","","TOTAL DESCENSOS","","MANTIENEN CATEGORÍA","","DISTRIBUCIÓN RAMAS",""`,
    `"","","4,218","","160","","1,946","","4,778 M / 1,546 F",""`,
    `"","CÉDULA","Alexander pirela","CAT. ORIGEN","GÉNERO","","estados","","MOVIMIENTO","CATEGORÍA FINAL"`,
    `"1","V-50000001","ANA GVIZ","2da","Femenino","2","Anzoátegui","382","Ascenso","1ra"`,
    `"53","S/C","SIN CEDULA","1ra","Femenino","15","Distrito Capital / Miranda","180","Mantener","1ra"`,
    `"","CÉDULA","NOMBRE DEL ATLETA","CAT. ORIGEN","GÉNERO","","Zulia","","MOVIMIENTO","CATEGORÍA FINAL"`,
    `"1","V-50000002","LUIS GVIZ","3ra","Masculino","23","Zulia","1.200","Ascenso","2da"`,
  ].join("\n");
  const { atletas } = leerListaFvp(gviz);
  assert.equal(atletas.length, 2);
  const luis = atletas.find((a) => a.clave === "50000002")!;
  assert.equal(luis.categoria, "2DA");
  assert.equal(luis.puntos, 1200);
  assert.equal(luis.estado, "Zulia");
  assert.equal(luis.nombre, "LUIS GVIZ");
});

test("categorías por edad de la FVP (Master +40, Sub-13…): se leen y se juntan con la de nivel", () => {
  const hoja = [
    `"","CÉDULA","NOMBRE DEL ATLETA","CAT. ORIGEN","GÉNERO","","ESTADO","","MOVIMIENTO","CATEGORÍA FINAL"`,
    `"1","V-60000001","ANTONIO MASTER","4ta","Masculino","1","Distrito Capital","10","Mantener","Master +40"`,
    `"2","V-60000002","MARIO SOLO MASTER","","Masculino","1","Distrito Capital","10","Mantener","Master +55"`,
    `"3","V-60000003","CARLOS JUNIOR","","Masculino","1","Distrito Capital","10","Mantener","Sub-13"`,
    `"","CÉDULA","NOMBRE DEL ATLETA","CAT. ORIGEN","GÉNERO","","ESTADO","","MOVIMIENTO","CATEGORÍA FINAL"`,
    `"1","V-60000001","ANTONIO MASTER","4ta","Masculino","1","Distrito Capital","10","Ascenso","3ra"`,
  ].join("\n");
  const { atletas, avisos } = leerListaFvp(hoja);
  assert.ok(!avisos.some((a) => a.includes("no se entiende")), avisos.join(" | "));
  const por = new Map(atletas.map((a) => [a.clave, a]));
  assert.equal(por.get("60000001")!.categoria, "3RA");
  assert.deepEqual(por.get("60000001")!.especiales, ["Master +40"]);
  assert.equal(por.get("60000002")!.categoria, null);
  assert.deepEqual(por.get("60000003")!.especiales, ["Sub-13"]);
  assert.equal(leerEspecial("MASTER 45"), "Master +45");
  assert.equal(leerEspecial("Junior Sub-16"), "Sub-16");
  // Solo Master en la FVP → para una categoría por nivel queda por verificar.
  const buscar = buscadorFvp(atletas);
  const v = verificarDupla(catNivel("MASCULINO", "4TA"), [j("mario", "V-60000002"), j("antonio", "V-60000001")], buscar)!;
  assert.equal(v.estado, "BLOQUEADA", "antonio es 3ra");
  const w = verificarDupla(catNivel("MASCULINO", "3RA"), [j("mario", "V-60000002"), j("antonio", "V-60000001")], buscar)!;
  assert.equal(w.estado, "POR_VERIFICAR");
  assert.match(w.nota!, /Master \+55/);
});

test("búsqueda por nombre (acentos, mayúsculas, orden) y por cédula", () => {
  const { atletas } = leerListaFvp(
    "CEDULA,NOMBRE,CATEGORIA FINAL\nV-18949321,MIGUEL MARTINEZ,2da\nV-18.000.001,MARTÍNEZ PÉREZ MIGUEL ÁNGEL,4ta\nV-20000009,ANA MIGUELENA,5ta\n",
  );
  const nombres = (q: string) => buscarAtletas(atletas, q).map((a) => a.nombre);
  assert.deepEqual(nombres("miguel martinez"), ["MIGUEL MARTINEZ", "MARTÍNEZ PÉREZ MIGUEL ÁNGEL"]);
  assert.deepEqual(nombres("Martínez Miguel"), ["MIGUEL MARTINEZ", "MARTÍNEZ PÉREZ MIGUEL ÁNGEL"]);
  assert.deepEqual(nombres("miguel ang"), ["MARTÍNEZ PÉREZ MIGUEL ÁNGEL"]);
  assert.deepEqual(nombres("V-18.949.321"), ["MIGUEL MARTINEZ"]);
  assert.deepEqual(nombres("18949321"), ["MIGUEL MARTINEZ"]);
  assert.deepEqual(nombres("1894"), ["MIGUEL MARTINEZ"]);
  assert.deepEqual(nombres("migue"), ["MIGUEL MARTINEZ", "MARTÍNEZ PÉREZ MIGUEL ÁNGEL", "ANA MIGUELENA"]);
});
