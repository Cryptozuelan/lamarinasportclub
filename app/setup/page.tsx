"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Clock,
  CloudRain,
  Coffee,
  Dices,
  Hash,
  Layers,
  Mars,
  Plus,
  Rocket,
  Settings2,
  Shuffle,
  Sigma,
  Sun,
  Timer,
  TimerOff,
  Trash2,
  UserPlus,
  Users,
  Venus,
  Warehouse,
  X,
} from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Logo } from "@/components/Logo";
import { StaffGate } from "@/components/StaffGate";
import { Segmented } from "@/components/ui/Segmented";
import { Stepper } from "@/components/ui/Stepper";
import { Switch } from "@/components/ui/Switch";
import { toast } from "@/components/ui/Toaster";
import {
  categoriaLabel,
  cumpleSuma,
  ejemplosSuma,
  formatoDe,
  formatoLabel,
  formatosPara,
  LIMITES_SUMA,
  METODOS,
  nivelLabel,
  nivelParaSuma,
  NIVELES,
  nivelesPara,
  NUMERO_NIVEL,
  RAMAS,
  sumaPareja,
  type Formato,
} from "@/lib/categories";
import { crearEvento, generarRondas, nuevoId } from "@/lib/evento";
import { sonar, vibrar } from "@/lib/feedback";
import { partidosPorUnidad, planRondas } from "@/lib/rotation";
import { configPorDefecto, CRITERIOS, criterioDe, descripcionPuntuacion } from "@/lib/scoring";
import { ReglasPuntuacion } from "@/components/ReglasPuntuacion";
import { SelectorHorario } from "@/components/SelectorHorario";
import { MapaPistas } from "@/components/MapaPistas";
import { aMinutos, DIAS, diaSemana, horaFinPrevista, horarioDelDia, nombrePista, rondasQueCaben, validarFranja } from "@/lib/horarios";
import { MAX_RONDAS } from "@/lib/validacion";
import { useAmericanos } from "@/lib/store";
import { hayBorrador, useBorrador, useLimpiarBorrador } from "@/hooks/useBorrador";
import type { Categoria, ConfigPuntuacion, Genero, Jugador, MetodoPuntuacion, Modalidad, Nivel, Pareja, Rama } from "@/types/americano";

const PASOS = ["Categoría", "Formato", "Jugadores", "Pistas", "Listo"];
const P_JUGADORES = 2;
const P_PISTAS = 3;

const variantes = {
  entra: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  centro: { x: 0, opacity: 1 },
  sale: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
};

export default function SetupPage() {
  return (
    <StaffGate>
      <Suspense>
        <Setup />
      </Suspense>
    </StaffGate>
  );
}

function Setup() {
  const router = useRouter();
  const params = useSearchParams();
  const guardar = useAmericanos((s) => s.guardar);
  const club = useAmericanos((s) => s.club);

  // El paso vive en la URL (?paso=2): la flecha y el "atrás" del celular vuelven al paso anterior, no al inicio.
  const pasoUrl = Math.max(0, Math.min(PASOS.length - 1, Number(params.get("paso")) || 0));
  const pasosEmpujados = useRef(0);
  const limpiarBorrador = useLimpiarBorrador();
  useEffect(() => {
    if (hayBorrador())
      toast("Recuperamos el evento que estabas armando", "info", {
        label: "Empezar de cero",
        fn: () => {
          limpiarBorrador();
          location.replace("/setup");
        },
      });
  }, [limpiarBorrador]);

  const [rama, setRama] = useBorrador<Rama>("rama", "MIXTO");
  const [nivel, setNivel] = useBorrador<Nivel>("nivel", "5TA");
  const [suma, setSuma] = useBorrador<number | null>("suma", null);
  const [nombreCategoria, setNombreCategoria] = useBorrador("nombreCategoria", "");
  const [modalidad, setModalidad] = useBorrador<Modalidad>("modalidad", "INDIVIDUAL_ROTATIVO");
  const [puntuacion, setPuntuacion] = useBorrador<ConfigPuntuacion>("puntuacion", configPorDefecto("PUNTOS_TOTALES"));
  const pistasActivas = club.pistas.filter((c) => c.activa);
  const [seleccion, setSeleccion] = useBorrador<number[]>("seleccion", () => club.pistas.filter((c) => c.activa && c.techada).map((c) => c.numero));
  // Techadas primero (la primera recibe el partido de mayor nivel), luego por número.
  const canchas = pistasActivas
    .filter((c) => seleccion.includes(c.numero))
    .sort((a, b) => Number(b.techada) - Number(a.techada) || a.numero - b.numero);
  const pistas = Math.max(1, canchas.length);
  const [cronometro, setCronometro] = useBorrador("cronometro", true);
  const [duracion, setDuracion] = useBorrador("duracion", 15);
  const [manual, setManual] = useBorrador<{ n: number; firma: string } | null>("rondas", null);
  const [jugadores, setJugadores] = useBorrador<Jugador[]>("jugadores", []);
  const [parejas, setParejas] = useBorrador<Pareja[]>("parejas", []);
  const [nombre, setNombre] = useBorrador("nombre", "");
  const [semilla, setSemilla] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const [fecha, setFecha] = useBorrador("fecha", () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [horaInicio, setHoraInicio] = useBorrador("horaInicio", "19:00");
  const [horaFin, setHoraFin] = useBorrador("horaFin", "22:00");

  const categoria: Categoria = { rama, nivel, ...(suma ? { suma } : {}), ...(nombreCategoria.trim() ? { nombre: nombreCategoria.trim() } : {}) };
  const nivelJugadores: Nivel = suma ? nivelParaSuma(suma) : nivel;

  const horarioDia = horarioDelDia(club, fecha);
  const errorHorario = validarFranja(horarioDia, horaInicio, horaFin);

  const mixto = rama === "MIXTO";
  const dupla = modalidad === "DUPLA_FIJA";
  const generoFijo: Genero | null = rama === "FEMENINO" ? "F" : rama === "MASCULINO" ? "M" : null;
  const nH = jugadores.filter((j) => j.genero === "M").length;
  const nF = jugadores.length - nH;
  const unidades = dupla ? parejas.length : jugadores.length;
  const generoCuenta = mixto && !dupla ? { hombres: nH, mujeres: nF } : undefined;

  // Rondas automáticas: salen de las duplas/jugadores inscritos y de las pistas.
  const plan = planRondas(unidades, modalidad, pistas, generoCuenta);
  const firma = `${modalidad}|${unidades}|${nH}|${pistas}`;
  // Un ajuste manual solo vale para la misma cantidad de jugadores y pistas; si cambian, vuelve a automático.
  const totalRondas = manual && typeof manual === "object" && manual.firma === firma ? manual.n : plan.rondas;
  const esAuto = totalRondas === plan.rondas;
  const setRondas = (n: number) => setManual(n === plan.rondas ? null : { n, firma });

  const caben = cronometro ? rondasQueCaben(horaInicio, horaFin, duracion, club.minutosEntreRondas) : 0;
  const finPrevisto = horaFinPrevista({ horaInicio, duracionRondaMin: duracion, minutosEntreRondas: club.minutosEntreRondas, totalRondas });
  const excedeFranja = cronometro && !errorHorario && aMinutos(finPrevisto) > aMinutos(horaFin);

  const { porRonda, enEspera } = plan;
  const reparto: [number, number] =
    totalRondas === plan.rondas
      ? plan.partidos
      : dupla
        ? partidosPorUnidad(parejas.length, porRonda, totalRondas, 2).map((x) => Math.min(x, totalRondas)) as [number, number]
        : generoCuenta
          ? (() => {
              const h = partidosPorUnidad(nH, porRonda, totalRondas, 2);
              const m = partidosPorUnidad(nF, porRonda, totalRondas, 2);
              return [Math.min(h[0], m[0]), Math.max(h[1], m[1])] as [number, number];
            })()
          : partidosPorUnidad(jugadores.length, porRonda, totalRondas, 4);

  const errorJugadores = useMemo(() => {
    if (dupla) {
      if (parejas.length < 2) return `Faltan ${2 - parejas.length} dupla(s): mínimo 2.`;
      return null;
    }
    if (mixto) {
      if (nF < 2 || nH < 2) return `En mixto necesitas al menos 2 mujeres y 2 hombres (van ${nF} y ${nH}).`;
      return null;
    }
    if (jugadores.length < 4) return `Faltan ${4 - jugadores.length} jugador(es) para el primer partido.`;
    return null;
  }, [dupla, parejas.length, jugadores.length, mixto, nH, nF]);

  // Si se recarga en un paso al que todavía no se puede llegar, se queda en Jugadores.
  const paso = pasoUrl > P_JUGADORES && errorJugadores ? P_JUGADORES : pasoUrl;
  const pasoPrevio = useRef(paso);
  const dir = paso >= pasoPrevio.current ? 1 : -1;
  useEffect(() => {
    pasoPrevio.current = paso;
    window.scrollTo({ top: 0 });
  }, [paso]);

  const preview = useMemo(() => {
    if (errorJugadores) return null;
    return generarRondas({ modalidad, jugadores, parejas, pistas, canchas, totalRondas: 1, semilla, categoria: { rama, nivel } })[0];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorJugadores, modalidad, jugadores, parejas, pistas, seleccion.join(), semilla, rama, nivel]);

  const errorPaso = paso === P_JUGADORES ? errorJugadores : paso === P_PISTAS ? errorHorario : null;
  const puedeAvanzar = !errorPaso;

  function ir(n: number) {
    n = Math.max(0, Math.min(PASOS.length - 1, n));
    if (n === paso) return;
    if (n > paso && !puedeAvanzar) {
      vibrar([30, 40, 30]);
      toast(errorPaso ?? "Completa este paso", "error");
      return;
    }
    if (n > P_JUGADORES && errorJugadores) {
      vibrar([30, 40, 30]);
      toast(errorJugadores, "error");
      return;
    }
    vibrar(10);
    const url = n ? `/setup?paso=${n}` : "/setup";
    if (n === paso - 1 && pasosEmpujados.current > 0) {
      // Volver un paso = el mismo "atrás" del navegador, así el historial queda limpio.
      pasosEmpujados.current--;
      router.back();
    } else if (n > paso) {
      pasosEmpujados.current++;
      router.push(url, { scroll: false });
    } else router.replace(url, { scroll: false });
  }

  function volver() {
    if (paso > 0) ir(paso - 1);
    else router.push("/americanos");
  }

  function elegirFormato(f: Formato) {
    setModalidad(f === "DUPLA_FIJA" ? "DUPLA_FIJA" : "INDIVIDUAL_ROTATIVO");
  }

  function cambiarRama(r: Rama) {
    setRama(r);
    if (r === "FEMENINO") {
      // En Femenino no hay 2da: el nivel pasa a 3ra.
      if (nivel === "2DA") setNivel("3RA");
      setJugadores((js) => js.map((j) => (j.nivel === "2DA" ? { ...j, nivel: "3RA" } : j)));
    }
    const g: Genero | null = r === "FEMENINO" ? "F" : r === "MASCULINO" ? "M" : null;
    if (g) setJugadores((js) => js.map((j) => ({ ...j, genero: g })));
  }

  function crear() {
    const evento = crearEvento({
      nombre: nombre || `Americano ${categoriaLabel(categoria)}`,
      categoria,
      fecha,
      horaInicio,
      horaFin,
      minutosEntreRondas: club.minutosEntreRondas,
      modalidad,
      puntuacion,
      pistas,
      canchas,
      duracionRondaMin: duracion,
      cronometro,
      totalRondas,
      // En dupla fija solo cuentan los jugadores que están en alguna pareja.
      jugadores: dupla ? jugadores.filter((j) => parejas.some((p) => p.jugadorIds.includes(j.id))) : jugadores,
      parejas: dupla ? parejas : [],
      semilla,
    });
    guardar(evento);
    limpiarBorrador();
    sonar("ok");
    vibrar([20, 40, 60]);
    toast("¡Evento creado! A jugar 🎾");
    router.replace(`/evento/${evento.id}`);
  }

  const unidad = dupla ? "dupla" : "jugador";
  const unidadPl = dupla ? "duplas" : "jugadores";

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 pb-32 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
      <header className="flex items-center justify-between py-3">
        <button onClick={volver} className="btn-ghost !p-2.5" aria-label={paso > 0 ? `Volver a ${PASOS[paso - 1]}` : "Volver al inicio"}>
          <ArrowLeft className="size-5" />
        </button>
        <Logo compacto />
        <span className="w-10 text-right text-xs font-semibold text-white/40">
          {paso + 1}/{PASOS.length}
        </span>
      </header>

      <nav className="mt-4 grid grid-cols-5 gap-1.5" aria-label="Pasos">
        {PASOS.map((p, i) => (
          <button key={p} onClick={() => (i <= paso ? ir(i) : ir(paso + 1))} className="group text-left" aria-current={i === paso ? "step" : undefined}>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <motion.div className="h-full bg-neon" animate={{ width: i <= paso ? "100%" : "0%" }} transition={{ duration: 0.35 }} />
            </div>
            <span className={clsx("mt-2 hidden text-[11px] font-semibold sm:block", i === paso ? "text-white" : "text-white/40")}>{p}</span>
          </button>
        ))}
      </nav>

      <div className="relative mt-8 flex-1">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.section
            key={paso}
            custom={dir}
            variants={variantes}
            initial="entra"
            animate="centro"
            exit="sale"
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          >
            {paso === 0 && (
              <Paso titulo="¿Qué categoría se juega?" sub="Staff La Marina · configura el evento">
                <span className="label">Rama</span>
                <Segmented
                  opciones={RAMAS.map((r) => ({
                    id: r.id,
                    label: (
                      <span className="flex items-center justify-center gap-1.5">
                        {r.id === "FEMENINO" ? <Venus className="size-4" /> : r.id === "MASCULINO" ? <Mars className="size-4" /> : <Users className="size-4" />}
                        {r.label}
                      </span>
                    ),
                  }))}
                  valor={rama}
                  onChange={cambiarRama}
                />

                <span className="label mt-8">Tipo de categoría</span>
                <div className="grid grid-cols-2 gap-3">
                  <Opcion activo={!suma} onClick={() => setSuma(null)}>
                    <span className="flex items-center gap-2 font-semibold">
                      <Layers className="size-4 text-neon" /> Por nivel
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-white/50">Todos del mismo nivel: 4ta, 5ta, Open…</span>
                  </Opcion>
                  <Opcion activo={!!suma} onClick={() => setSuma(suma ?? 9)}>
                    <span className="flex items-center gap-2 font-semibold">
                      <Sigma className="size-4 text-neon" /> Suma
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-white/50">Las categorías de la pareja suman N (ej. 4ta + 5ta = 9).</span>
                  </Opcion>
                </div>

                <AnimatePresence mode="wait" initial={false}>
                  {suma ? (
                    <motion.div key="suma" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="glass mt-4 rounded-2xl p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold">Suma</p>
                          <p className="text-xs text-white/50">{ejemplosSuma(suma) || "—"}</p>
                        </div>
                        <Stepper valor={suma} onChange={setSuma} min={LIMITES_SUMA.min} max={LIMITES_SUMA.max} grande />
                      </div>
                      <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto">
                        {[6, 7, 8, 9, 10, 11, 12].map((n) => (
                          <SlotChip key={n} activo={n === suma} enRango={false} onClick={() => setSuma(n)}>
                            Suma {n}
                          </SlotChip>
                        ))}
                      </div>
                      <p className="mt-3 text-xs text-white/45">
                        Una pareja no puede sumar menos de {suma} (sería más fuerte). Open cuenta como 1, 2da como 2… 7ma como 7. A cada jugador le eliges su categoría al inscribirlo.
                      </p>
                    </motion.div>
                  ) : (
                    <motion.div key="nivel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                      <span className="label mt-6">Nivel</span>
                      <div className={clsx("grid grid-cols-4 gap-2.5", rama === "FEMENINO" ? "sm:grid-cols-6" : "sm:grid-cols-7")}>
                        {nivelesPara(rama).map((n) => (
                          <Opcion key={n} activo={nivel === n} onClick={() => setNivel(n)} className="!px-1 py-4 text-center">
                            <span className={clsx("font-display font-bold", n === "OPEN" && rama === "MIXTO" ? "text-sm" : "text-xl")}>{nivelLabel(n, rama)}</span>
                          </Opcion>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <label className="mt-6 block">
                  <span className="label">Nombre propio de la categoría (opcional)</span>
                  <input
                    className="input"
                    maxLength={60}
                    placeholder={`Nombre del evento (opcional) · si lo dejas vacío: ${categoriaLabel({ ...categoria, nombre: null })}`}
                    value={nombreCategoria}
                    onChange={(e) => setNombreCategoria(e.target.value)}
                  />
                </label>
                <p className="mt-6 text-center text-sm text-white/50">
                  Categoría: <span className="font-semibold text-neon">{categoriaLabel(categoria)}</span>
                </p>
              </Paso>
            )}

            {paso === 1 && (
              <Paso titulo="Formato y puntuación" sub="¿Cómo se forman las parejas y cómo se cuenta?">
                <span className="label">Formato</span>
                <div className="grid gap-3 sm:grid-cols-2">
                  {formatosPara(rama).map((f) => (
                    <Opcion key={f.id} activo={formatoDe(modalidad) === f.id} onClick={() => elegirFormato(f.id)}>
                      <span className="flex items-center gap-2 font-semibold">
                        {f.id === "INDIVIDUAL" ? <Shuffle className="size-4 text-neon" /> : <Users className="size-4 text-neon" />}
                        {f.label}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-white/50">{f.descripcion}</span>
                    </Opcion>
                  ))}
                </div>
                {!mixto && (
                  <p className="mt-2 text-xs text-white/40">¿Mixto? Elige la rama Mixto en el paso anterior: Individual arma siempre hombre + mujer.</p>
                )}

                <span className="label mt-8">Método de puntuación</span>
                <div className="grid gap-3 sm:grid-cols-3">
                  {METODOS.map((m) => (
                    <Opcion
                      key={m.id}
                      activo={puntuacion.metodo === m.id}
                      onClick={() => setPuntuacion({ ...configPorDefecto(m.id as MetodoPuntuacion), criterio: puntuacion.criterio })}
                    >
                      <span className="font-semibold">{m.label}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-white/50">{m.descripcion}</span>
                    </Opcion>
                  ))}
                </div>

                <ReglasPuntuacion valor={puntuacion} onChange={setPuntuacion} />
                <span className="label mt-8">¿Cómo se arma el ranking?</span>
                <div className="grid gap-3 sm:grid-cols-3">
                  {CRITERIOS.map((c) => (
                    <Opcion key={c.id} activo={criterioDe(puntuacion) === c.id} onClick={() => setPuntuacion({ ...puntuacion, criterio: c.id })}>
                      <span className="font-semibold">{c.label}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-white/50">{c.descripcion}</span>
                    </Opcion>
                  ))}
                </div>
              </Paso>
            )}

            {paso === P_JUGADORES && (
              <Paso
                titulo={dupla ? "Inscribe las duplas" : mixto ? "Mujeres y hombres" : "¿Quiénes juegan?"}
                sub={
                  dupla
                    ? mixto
                      ? "Cada dupla es un hombre + una mujer y juega contra todas"
                      : "Cada dupla juega contra todas"
                    : mixto
                      ? "Anota a cada uno en su casilla: en cada ronda se arma hombre + mujer al azar, sin repetir pareja"
                      : "Escribe un nombre y presiona Enter"
                }
              >
                {dupla ? (
                  <EditorParejas
                    parejas={parejas}
                    setParejas={setParejas}
                    jugadores={jugadores}
                    setJugadores={setJugadores}
                    generoFijo={generoFijo}
                    nivel={nivelJugadores}
                    categoria={categoria}
                  />
                ) : mixto ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <EditorJugadores titulo="Mujeres" jugadores={jugadores} setJugadores={setJugadores} genero="F" nivel={nivelJugadores} conNivel={!!suma} />
                    <EditorJugadores titulo="Hombres" jugadores={jugadores} setJugadores={setJugadores} genero="M" nivel={nivelJugadores} conNivel={!!suma} />
                  </div>
                ) : (
                  <EditorJugadores jugadores={jugadores} setJugadores={setJugadores} genero={generoFijo ?? "M"} nivel={nivelJugadores} conNivel={!!suma} />
                )}
                <AccionesPlantel
                  hayAlguien={jugadores.length > 0}
                  onVaciar={() => {
                    if (!confirm(`¿Quitar a todos los ${unidadPl}?`)) return;
                    setJugadores([]);
                    setParejas([]);
                  }}
                />
                <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
                  {errorJugadores ? (
                    <span className="chip border-coral/30 text-coral">{errorJugadores}</span>
                  ) : (
                    <>
                      <span className="chip border-neon/30 text-neon">
                        <Check className="size-3" /> {unidades} {unidadPl} · {porRonda} partido(s) por ronda en {pistas} pista(s)
                      </span>
                      {enEspera > 0 && (
                        <span className="chip">
                          <Coffee className="size-3" /> {enEspera} {enEspera === 1 ? unidad : unidadPl} en espera por ronda (rotan)
                        </span>
                      )}
                    </>
                  )}
                </div>
                {!errorJugadores && generoCuenta && nH !== nF && (
                  <p className="mt-3 text-xs text-amber-200/80">
                    Hay {Math.abs(nH - nF)} {nH > nF ? "hombre(s)" : "mujer(es)"} de más: en cada ronda descansan por turnos. Con igual número de mujeres y hombres nadie espera de más.
                  </p>
                )}
              </Paso>
            )}

            {paso === P_PISTAS && (
              <Paso titulo="Pistas y rondas" sub="Toca las pistas que usará el evento">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm text-white/60">
                    <span className="font-semibold text-white">{pistas}</span> de {pistasActivas.length} pistas
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-ghost !px-3 !py-1.5 text-xs"
                      onClick={() => {
                        vibrar(10);
                        setSeleccion(pistasActivas.filter((c) => c.techada).map((c) => c.numero));
                        toast("Solo pistas techadas ☔", "info");
                      }}
                    >
                      <CloudRain className="size-3.5" /> ¿Llueve?
                    </button>
                    <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => setSeleccion(pistasActivas.map((c) => c.numero))}>
                      Todas
                    </button>
                  </div>
                </div>
                <MapaPistas
                  pistas={pistasActivas}
                  seleccion={seleccion}
                  onToggle={(n) => setSeleccion((s) => (s.includes(n) ? (s.length > 1 ? s.filter((x) => x !== n) : s) : [...s, n]))}
                />
                <p className="mt-2 text-xs text-white/40">Las techadas reciben primero los partidos.</p>
                {porRonda < pistas && (
                  <p className="mt-2 text-xs text-amber-200/80">
                    Con {unidades} {unidadPl} solo se llenan {porRonda} pista(s) por ronda; {pistas - porRonda === 1 ? "la otra queda libre" : `${pistas - porRonda} quedan libres`}.
                  </p>
                )}

                {/* Rondas: automáticas según inscritos y pistas */}
                <span className="label mt-8 flex items-center gap-1.5">
                  <Hash className="size-3.5" /> Rondas
                </span>
                <div className="glass rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="font-display text-2xl font-bold tabular">{totalRondas}</span>
                      <span className="text-sm font-semibold text-white/70">rondas</span>
                      {esAuto ? (
                        <span className="chip border-neon/30 !py-0.5 text-[10px] text-neon">Automático</span>
                      ) : (
                        <button className="chip !py-0.5 text-[10px] text-white/60 hover:text-neon" onClick={() => setManual(null)}>
                          Manual · volver a {plan.rondas}
                        </button>
                      )}
                    </div>
                    <Stepper valor={totalRondas} onChange={setRondas} min={1} max={MAX_RONDAS} />
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-white/55">
                    {dupla
                      ? totalRondas >= plan.sinRepetir
                        ? `Todas contra todas: cada dupla juega ${parejas.length - 1} partidos`
                        : `Cada dupla juega ${reparto[0] === reparto[1] ? reparto[0] : `${reparto[0]}–${reparto[1]}`} partidos (el todos contra todos completo son ${plan.sinRepetir} rondas)`
                      : reparto[0] === reparto[1]
                        ? `Nadie repite pareja · todos juegan ${reparto[0]} partidos`
                        : `Nadie repite pareja · juegan ${reparto[0]}–${reparto[1]} partidos`}
                    {` · ${porRonda} partido${porRonda === 1 ? "" : "s"} por ronda`}
                    {enEspera > 0 && ` · ${enEspera} en espera`}
                  </p>
                  {!dupla && !esAuto && totalRondas > plan.sinRepetir && plan.sinRepetir > 0 && (
                    <p className="mt-3 rounded-xl bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
                      Con {generoCuenta ? `${nF} mujeres y ${nH} hombres` : `${jugadores.length} jugadores`} caben {plan.sinRepetir} rondas sin repetir pareja. Desde la ronda {plan.sinRepetir + 1} alguien repite compañero.
                    </p>
                  )}
                  {dupla && totalRondas > plan.sinRepetir && (
                    <p className="mt-3 rounded-xl bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
                      El todos contra todos se completa en {plan.sinRepetir} rondas. Desde la ronda {plan.sinRepetir + 1} empieza una segunda vuelta y se repiten cruces.
                    </p>
                  )}
                  {!dupla && esAuto && !plan.equitativo && (
                    <p className="mt-3 rounded-xl bg-white/5 px-3 py-2 text-xs leading-relaxed text-white/60">
                      Con {generoCuenta ? `${nF} mujeres y ${nH} hombres` : `${jugadores.length} jugadores`} en {porRonda} pista{porRonda === 1 ? "" : "s"} los descansos no dan exacto: algunos juegan un partido más.{" "}
                      {plan.rondasParejas ? (
                        <>
                          Para que todos jueguen lo mismo hacen falta {plan.rondasParejas} rondas.{" "}
                          <button className="font-semibold text-neon underline underline-offset-2" onClick={() => setRondas(plan.rondasParejas!)}>
                            Usar {plan.rondasParejas} rondas
                          </button>
                        </>
                      ) : (
                        "La app reparte las esperas por turnos para que la diferencia nunca pase de uno."
                      )}
                    </p>
                  )}
                  {!esAuto && reparto[0] !== reparto[1] && plan.equitativo && (
                    <p className="mt-3 text-xs text-white/50">Con {totalRondas} rondas algunos juegan un partido más que otros. Con {plan.rondas} todos juegan lo mismo.</p>
                  )}
                </div>

                {/* Cronómetro on/off */}
                <div className="glass mt-4 rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        {cronometro ? <Timer className="size-4 text-neon" /> : <TimerOff className="size-4 text-white/50" />} Cronómetro por ronda
                      </p>
                      <p className="text-xs text-white/50">
                        {cronometro ? "Cuenta regresiva en la app y en la TV, con alarma al final." : "Apagado: cada ronda termina cuando se cargan los marcadores."}
                      </p>
                    </div>
                    <Switch activo={cronometro} onChange={setCronometro} etiqueta="Cronómetro por ronda" />
                  </div>
                  <AnimatePresence initial={false}>
                    {cronometro && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                        <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4">
                          <p className="text-sm text-white/70">Duración de cada ronda</p>
                          <Stepper valor={duracion} onChange={setDuracion} min={5} max={45} paso={5} sufijo="min" />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Horario */}
                <div className="mt-8 flex items-center justify-between">
                  <span className="label !mb-0 flex items-center gap-1.5">
                    <Clock className="size-3.5" /> Horario del evento
                  </span>
                  <Link href="/club" className="flex items-center gap-1 text-xs text-white/50 hover:text-neon">
                    <Settings2 className="size-3.5" /> Mi club
                  </Link>
                </div>
                <div className="glass mt-3 rounded-2xl p-4">
                  <SelectorHorario
                    club={club}
                    fecha={fecha}
                    setFecha={setFecha}
                    horaInicio={horaInicio}
                    setHoraInicio={setHoraInicio}
                    horaFin={horaFin}
                    setHoraFin={setHoraFin}
                  />
                  {errorHorario ? (
                    <p className="mt-3 text-sm text-coral">{errorHorario}</p>
                  ) : cronometro ? (
                    <p className={clsx("mt-3 text-sm", excedeFranja ? "text-amber-200" : "text-white/60")}>
                      {totalRondas} rondas de {duracion} min (+{club.minutosEntreRondas} de cambio) · termina aprox. a las{" "}
                      <span className="font-semibold text-white">{finPrevisto}</span>
                      {excedeFranja && (
                        <>
                          {" "}
                          · se pasa de las {horaFin}.{" "}
                          {caben > 0 && (
                            <button className="font-semibold text-amber-100 underline underline-offset-2" onClick={() => setRondas(caben)}>
                              Ajustar a {caben} rondas
                            </button>
                          )}
                        </>
                      )}
                    </p>
                  ) : (
                    <p className="mt-3 text-sm text-white/60">
                      Reservado de {horaInicio} a {horaFin} · sin cronómetro, las rondas avanzan cuando el staff carga los marcadores.
                    </p>
                  )}
                </div>
              </Paso>
            )}

            {paso === 4 && (
              <Paso titulo="¡Todo listo!" sub="Revisa y lanza el evento">
                <span className="label">Nombre del evento</span>
                <input
                  className="input text-lg font-semibold"
                  placeholder={`Americano ${categoriaLabel(categoria)}`}
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                />
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="chip text-neon">{categoriaLabel(categoria)}</span>
                  <span className="chip">{formatoLabel(modalidad, rama)}</span>
                  <span className="chip">{descripcionPuntuacion(puntuacion)}</span>
                  <span className="chip">{pistas} pistas</span>
                  <span className="chip">
                    {totalRondas} rondas{cronometro ? ` × ${duracion} min` : " · sin cronómetro"}
                  </span>
                  <span className="chip">
                    <CalendarDays className="size-3" /> {DIAS[diaSemana(fecha)]} {fecha.slice(8)}/{fecha.slice(5, 7)} · {horaInicio}–{cronometro ? finPrevisto : horaFin}
                  </span>
                  <span className="chip">
                    {dupla ? `${parejas.length} duplas` : generoCuenta ? `${nF} mujeres · ${nH} hombres` : `${jugadores.length} jugadores`}
                  </span>
                  {enEspera > 0 && (
                    <span className="chip">
                      <Coffee className="size-3" /> {enEspera} en espera por ronda
                    </span>
                  )}
                </div>

                {preview && (
                  <div className="mt-8">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="label !mb-0">Vista previa · Ronda 1</span>
                      <button
                        className="btn-ghost !px-3 !py-1.5 text-xs"
                        onClick={() => {
                          sonar("tap");
                          vibrar(10);
                          setSemilla(Math.floor(Math.random() * 2 ** 31));
                        }}
                      >
                        <Dices className="size-3.5" /> Otro sorteo
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {preview.partidos.map((p) => (
                        <motion.div key={`${semilla}-${p.id}`} initial={{ opacity: 0, rotateX: -30 }} animate={{ opacity: 1, rotateX: 0 }} className="glass rounded-2xl p-4">
                          <p className="text-[11px] font-bold uppercase tracking-widest text-neon">{nombrePista({ canchas }, p.pista)}</p>
                          <p className="mt-2 text-sm font-semibold">{nombrePar(p.parejaA, jugadores)}</p>
                          <p className="my-1 text-[10px] font-bold text-white/30">VS</p>
                          <p className="text-sm font-semibold">{nombrePar(p.parejaB, jugadores)}</p>
                        </motion.div>
                      ))}
                    </div>
                    {preview.descansanIds.length > 0 && (
                      <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-white/50">
                        <Coffee className="size-3.5" /> En espera:
                        {preview.descansanIds.map((id) => (
                          <span key={id} className="chip !py-0.5">
                            {dupla ? parejas.find((p) => p.id === id)?.nombre : jugadores.find((j) => j.id === id)?.nombre}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                )}
              </Paso>
            )}
          </motion.section>
        </AnimatePresence>
      </div>

      <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-white/5 bg-fondo/85 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl gap-3 px-4 sm:px-6">
          {paso > 0 && (
            <button className="btn-ghost" onClick={() => ir(paso - 1)}>
              <ArrowLeft className="size-4" /> Atrás
            </button>
          )}
          {paso < PASOS.length - 1 ? (
            <button className={clsx("btn-neon flex-1 text-base", !puedeAvanzar && "opacity-50")} onClick={() => ir(paso + 1)}>
              Siguiente <ArrowRight className="size-4" />
            </button>
          ) : (
            <button className="btn-neon flex-1 text-base" onClick={crear} disabled={!!errorJugadores || !!errorHorario}>
              <Rocket className="size-5" /> Crear y abrir cuadro
            </button>
          )}
        </div>
      </footer>
    </main>
  );

  function nombrePar(p: Pareja, js: Jugador[]) {
    return p.nombre ?? p.jugadorIds.map((id) => js.find((j) => j.id === id)?.nombre).join(" / ");
  }
}

/* ---------- piezas del wizard ---------- */

function Paso({ titulo, sub, children }: { titulo: string; sub: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{titulo}</h1>
      <p className="mb-8 mt-2 text-white/50">{sub}</p>
      {children}
    </div>
  );
}

function Opcion({ activo, onClick, children, className }: { activo: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      onClick={() => {
        vibrar(10);
        onClick();
      }}
      aria-pressed={activo}
      className={clsx(
        "relative rounded-2xl border-2 p-4 text-left transition",
        activo ? "seleccion sobre-marca" : "glass border-transparent hover:border-white/20",
        className,
      )}
    >
      {activo && (
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-lima text-noche shadow-[0_0_12px_rgba(207,243,91,0.6)]">
          <Check className="size-3" strokeWidth={3} />
        </motion.span>
      )}
      {children}
    </motion.button>
  );
}

function SlotChip({ activo, enRango, onClick, children }: { activo: boolean; enRango: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => {
        vibrar(8);
        onClick();
      }}
      className={clsx(
        "shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold tabular transition",
        activo ? "bg-neon text-noche" : enRango ? "bg-neon/15 text-neon" : "bg-white/5 text-white/60 hover:bg-white/10",
      )}
    >
      {children}
    </button>
  );
}

function crearJugador(nombreCompleto: string, genero: Genero, nivel: Nivel): Jugador {
  const [nombre, ...resto] = nombreCompleto.trim().split(/\s+/);
  return { id: nuevoId("jug_"), nombre, apellido: resto.join(" ") || undefined, genero, nivel, fotoUrl: null };
}

/** Separa "Ana, Luis; Pedro" en nombres limpios, sin repetir los que ya están. */
function nombresNuevos(texto: string, jugadores: Jugador[]): string[] {
  const existentes = new Set(jugadores.map((j) => `${j.nombre} ${j.apellido ?? ""}`.trim().toLowerCase()));
  const todos = texto.split(/[,\n;]/).map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean);
  const nombres = todos.filter((n) => {
    const k = n.toLowerCase();
    if (existentes.has(k)) return false;
    existentes.add(k);
    return true;
  });
  if (todos.length > nombres.length) toast("Nombre repetido omitido: agrega el apellido para distinguirlos", "error");
  return nombres;
}

/** Selector compacto de categoría por jugador (para categorías por suma). */
/** Selector compacto de categoría por jugador. Las mujeres no tienen 2da. */
function NivelSelect({ valor, onChange, label, femenino = false }: { valor?: Nivel; onChange: (n: Nivel) => void; label: string; femenino?: boolean }) {
  return (
    <select
      value={valor ?? "5TA"}
      onChange={(e) => {
        vibrar(8);
        onChange(e.target.value as Nivel);
      }}
      aria-label={label}
      className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-1.5 py-1.5 text-xs font-semibold text-white outline-none [color-scheme:dark] focus:border-neon/50"
    >
      {nivelesPara(femenino ? "FEMENINO" : "MASCULINO").map((n) => (
        <option key={n} value={n}>
          {nivelLabel(n)}
        </option>
      ))}
    </select>
  );
}

/**
 * Lista de jugadores de un género. En mixto se usan dos (Mujeres y Hombres),
 * cada una con su casilla para escribir.
 */
function EditorJugadores({
  titulo,
  jugadores,
  setJugadores,
  genero,
  nivel,
  conNivel,
}: {
  titulo?: string;
  jugadores: Jugador[];
  setJugadores: React.Dispatch<React.SetStateAction<Jugador[]>>;
  genero: Genero;
  nivel: Nivel;
  conNivel: boolean;
}) {
  const [texto, setTexto] = useState("");
  const [nivelNuevo, setNivelNuevo] = useState<Nivel>(nivel);
  const input = useRef<HTMLInputElement>(null);
  const lista = titulo ? jugadores.filter((j) => j.genero === genero) : jugadores;
  const mujer = genero === "F";

  function agregar() {
    const nombres = nombresNuevos(texto, jugadores);
    if (jugadores.length + nombres.length > 48) {
      toast("Máximo 48 jugadores por evento", "error");
      return;
    }
    if (!nombres.length) return;
    vibrar(10);
    sonar("tap");
    setJugadores((js) => [...js, ...nombres.map((n) => crearJugador(n, genero, conNivel ? nivelNuevo : nivel))]);
    setTexto("");
    input.current?.focus();
  }

  return (
    <div className={clsx(titulo && "glass rounded-3xl p-3", titulo && (mujer ? "border-fuchsia-400/20" : "border-cielo/20"))}>
      {titulo && (
        <div className="mb-3 flex items-center justify-between px-1">
          <span className={clsx("flex items-center gap-2 font-display text-lg font-bold", mujer ? "text-fuchsia-300" : "text-cielo")}>
            {mujer ? <Venus className="size-5" /> : <Mars className="size-5" />} {titulo}
          </span>
          <span className={clsx("chip tabular", mujer ? "text-fuchsia-200" : "text-cielo")}>{lista.length}</span>
        </div>
      )}
      <div className="flex gap-2">
        {conNivel && <NivelSelect valor={nivelNuevo} onChange={setNivelNuevo} label="Categoría del jugador" femenino={mujer} />}
        <input
          ref={input}
          className="input"
          placeholder={titulo ? (mujer ? "Nombre de la jugadora" : "Nombre del jugador") : "Nombre Apellido (o varios separados por coma)"}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && agregar()}
          enterKeyHint="done"
          autoComplete="off"
          aria-label={titulo ? `Agregar ${mujer ? "mujer" : "hombre"}` : "Agregar jugador"}
        />
        <button className="btn-neon !px-4" onClick={agregar} aria-label={titulo ? `Agregar ${mujer ? "mujer" : "hombre"}` : "Agregar jugador"}>
          <UserPlus className="size-5" />
        </button>
      </div>

      <ul className={clsx("mt-3 grid gap-2", !titulo && "sm:grid-cols-2")}>
        <AnimatePresence initial={false}>
          {lista.map((j, i) => (
            <motion.li
              key={j.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, x: -30 }}
              className={clsx("flex items-center gap-3 rounded-2xl px-3 py-2", titulo ? "bg-white/[0.04]" : "glass")}
            >
              <span className="w-5 text-right text-xs font-semibold text-white/30">{i + 1}</span>
              <Avatar nombre={`${j.nombre} ${j.apellido ?? ""}`} size={32} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {j.nombre} {j.apellido}
              </span>
              {conNivel && (
                <NivelSelect valor={j.nivel} femenino={j.genero === "F"} label={`Categoría de ${j.nombre}`} onChange={(n) => setJugadores((js) => js.map((x) => (x.id === j.id ? { ...x, nivel: n } : x)))} />
              )}
              <button
                className="rounded-lg p-2 text-white/40 hover:bg-coral/10 hover:text-coral"
                onClick={() => setJugadores((js) => js.filter((x) => x.id !== j.id))}
                aria-label={`Quitar a ${j.nombre}`}
              >
                <X className="size-4" />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {titulo && lista.length === 0 && <p className="px-1 pb-1 pt-2 text-xs text-white/35">Escribe un nombre y presiona Enter. Puedes pegar varios separados por coma.</p>}
    </div>
  );
}

function AccionesPlantel({ hayAlguien, onVaciar }: { hayAlguien: boolean; onVaciar: () => void }) {
  if (!hayAlguien) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {hayAlguien && (
        <button className="btn-ghost !py-2 text-xs text-coral" onClick={onVaciar}>
          <Trash2 className="size-3.5" /> Vaciar
        </button>
      )}
    </div>
  );
}

function EditorParejas({
  parejas,
  setParejas,
  jugadores,
  setJugadores,
  generoFijo,
  nivel,
  categoria,
}: {
  parejas: Pareja[];
  setParejas: React.Dispatch<React.SetStateAction<Pareja[]>>;
  jugadores: Jugador[];
  setJugadores: React.Dispatch<React.SetStateAction<Jugador[]>>;
  generoFijo: Genero | null;
  nivel: Nivel;
  categoria: Categoria;
}) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const conSuma = !!categoria.suma;
  const [nivelA, setNivelA] = useState<Nivel>(nivel);
  const [nivelB, setNivelB] = useState<Nivel>(nivel);
  const refA = useRef<HTMLInputElement>(null);
  const porId = new Map(jugadores.map((j) => [j.id, j]));
  const mixta = !generoFijo;

  function agregar() {
    if (!a.trim() || !b.trim()) {
      toast("Escribe los dos nombres de la dupla", "error");
      return;
    }
    if (jugadores.length + 2 > 48) {
      toast("Máximo 24 duplas por evento", "error");
      return;
    }
    if (conSuma && !cumpleSuma(categoria, nivelA, nivelB))
      toast(`Ojo: ${nivelLabel(nivelA)} + ${nivelLabel(nivelB)} suma ${sumaPareja(nivelA, nivelB)}, menos que ${categoria.suma}`, "error");
    // En dupla mixta: primer jugador hombre, segundo mujer.
    const ja = crearJugador(a, generoFijo ?? "M", conSuma ? nivelA : nivel);
    const jb = crearJugador(b, generoFijo ?? "F", conSuma ? nivelB : nivel);
    setJugadores((js) => [...js, ja, jb]);
    setParejas((ps) => [...ps, { id: nuevoId("par_"), jugadorIds: [ja.id, jb.id], nombre: `${ja.nombre} / ${jb.nombre}` }]);
    setA("");
    setB("");
    vibrar(10);
    sonar("tap");
    refA.current?.focus();
  }

  function quitar(p: Pareja) {
    setParejas((ps) => ps.filter((x) => x.id !== p.id));
    setJugadores((js) => js.filter((j) => !p.jugadorIds.includes(j.id)));
  }

  const cambiarNivel = (id: string, n: Nivel) => setJugadores((js) => js.map((x) => (x.id === id ? { ...x, nivel: n } : x)));

  return (
    <div>
      <div className="glass flex flex-col gap-2 rounded-2xl p-3 sm:flex-row">
        <div className="flex flex-1 gap-2">
          {conSuma && <NivelSelect valor={nivelA} onChange={setNivelA} label="Categoría del jugador 1" femenino={generoFijo === "F"} />}
          <input
            ref={refA}
            className="input"
            placeholder={mixta ? "Hombre" : "Jugador 1"}
            value={a}
            onChange={(e) => setA(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && agregar()}
            aria-label={mixta ? "Hombre de la dupla" : "Jugador 1"}
          />
        </div>
        <div className="flex flex-1 gap-2">
          {conSuma && <NivelSelect valor={nivelB} onChange={setNivelB} label="Categoría del jugador 2" femenino={(generoFijo ?? "F") === "F"} />}
          <input
            className="input"
            placeholder={mixta ? "Mujer" : "Jugador 2"}
            value={b}
            onChange={(e) => setB(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && agregar()}
            aria-label={mixta ? "Mujer de la dupla" : "Jugador 2"}
          />
        </div>
        <button className="btn-neon" onClick={() => agregar()}>
          <Plus className="size-4" /> Dupla
        </button>
      </div>
      {conSuma && (
        <p className="mt-2 text-xs text-white/45">
          Suma {categoria.suma}: {nivelLabel(nivelA)} + {nivelLabel(nivelB)} = <span className={cumpleSuma(categoria, nivelA, nivelB) ? "text-neon" : "text-coral"}>{sumaPareja(nivelA, nivelB)}</span>
        </p>
      )}
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        <AnimatePresence initial={false}>
          {parejas.map((p, i) => {
            const [x, y] = p.jugadorIds.map((id) => porId.get(id));
            const s = sumaPareja(x?.nivel, y?.nivel);
            const ok = cumpleSuma(categoria, x?.nivel, y?.nivel);
            return (
              <motion.li
                key={p.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, x: -30 }}
                className={clsx("glass rounded-2xl px-3 py-2", conSuma && !ok && "border-coral/40")}
              >
                <div className="flex items-center gap-3">
                  <span className="w-5 text-right text-xs font-semibold text-white/30">{i + 1}</span>
                  <span className="flex -space-x-2">
                    <Avatar nombre={x?.nombre ?? "?"} size={32} />
                    <Avatar nombre={y?.nombre ?? "?"} size={32} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.nombre}</span>
                  {conSuma && <span className={clsx("chip !py-0.5 tabular", ok ? "text-neon" : "border-coral/40 text-coral")}>Σ {s ?? "?"}</span>}
                  <button className="rounded-lg p-2 text-white/40 hover:bg-coral/10 hover:text-coral" onClick={() => quitar(p)} aria-label={`Quitar dupla ${p.nombre}`}>
                    <X className="size-4" />
                  </button>
                </div>
                {conSuma && x && y && (
                  <div className="mt-2 flex items-center gap-2 pl-8 text-xs text-white/50">
                    <span className="truncate">{x.nombre}</span>
                    <NivelSelect valor={x.nivel} femenino={x.genero === "F"} onChange={(n) => cambiarNivel(x.id, n)} label={`Categoría de ${x.nombre}`} />
                    <span>+</span>
                    <span className="truncate">{y.nombre}</span>
                    <NivelSelect valor={y.nivel} femenino={y.genero === "F"} onChange={(n) => cambiarNivel(y.id, n)} label={`Categoría de ${y.nombre}`} />
                  </div>
                )}
                {conSuma && !ok && <p className="mt-1 pl-8 text-[11px] text-coral">Suma {s}: menos de {categoria.suma}, esta dupla es más fuerte que la categoría.</p>}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}
