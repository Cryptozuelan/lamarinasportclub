/**
 * Modelos de Torneos (PadelReserve · La Marina Sport Club).
 *
 * Contrato entre el frontend y `/app/api/torneos` + `/app/api/marcadores`.
 * El backend solo necesita mapear sus tablas a estas formas; ver
 * `lib/server/repository.ts` y docs/BACKEND.md.
 *
 * Todo lo derivable (tablas de grupo, llaves, estadísticas) se calcula en
 * `lib/torneo/*` a partir de estos datos, así nunca queda desincronizado.
 */
import type { Genero, PistaClub, SetScore } from "./americano";

export type RamaTorneo = "MASCULINO" | "FEMENINO" | "MIXTO";

export type NivelTorneo = "7MA" | "6TA" | "5TA" | "4TA" | "3RA" | "2DA" | "1RA";

export type TipoCategoria = "NIVEL" | "MASTER" | "JUNIOR" | "LIBRE";

export interface CategoriaTorneo {
  /** Estable y legible, ej. "M-4TA", "F-MASTER45", "M-SUB14". */
  id: string;
  tipo: TipoCategoria;
  rama: RamaTorneo;
  nivel?: NivelTorneo;
  /** Master: edad mínima (45, 55). Junior: edad máxima (12, 14, 16, 18). */
  edad?: number;
  /** Nombre libre (categorías LIBRE o renombradas). */
  nombre?: string;
}

export interface JugadorTorneo {
  id: string;
  nombre: string;
  apellido?: string;
  genero: Genero;
  /** YYYY-MM-DD. Se usa para validar Master y Junior. */
  fechaNacimiento?: string | null;
  telefono?: string;
  fotoUrl?: string | null;
  /** id del usuario en PadelReserve, si existe. */
  usuarioId?: string | null;
  /** Cédula ("V-12345678"). Cruza al jugador con el ranking FVP. */
  cedula?: string | null;
  /** Lado en el que juega (opcional, solo informativo). */
  lado?: "DRIVE" | "REVES";
}

export type EstadoDupla = "ACTIVA" | "RETIRADA" | "DESCALIFICADA";

/**
 * Chequeo de la dupla contra el ranking FVP (solo categorías por nivel).
 * - VERIFICADA: los dos están en la lista y ninguno juega por debajo de su categoría.
 * - POR_VERIFICAR: alguno sin cédula o no aparece en la lista; el staff lo revisa.
 * - BLOQUEADA: alguno juega por debajo de su categoría FVP.
 * - EXCEPCION: el staff la autorizó igual (queda quién, cuándo y por qué).
 */
export type EstadoFvp = "VERIFICADA" | "POR_VERIFICAR" | "BLOQUEADA" | "EXCEPCION";

export interface VerificacionFvp {
  estado: EstadoFvp;
  /** Categoría FVP de cada jugador, en el orden de `jugadorIds` (null = no aparece). */
  categorias: [NivelTorneo | null, NivelTorneo | null];
  /** Motivo del bloqueo o de la excepción. */
  nota?: string;
  en: string;
  por?: string;
  /** Fecha de la lista FVP con la que se verificó. */
  lista?: string | null;
}
export interface Dupla {
  id: string;
  jugadorIds: [string, string];
  /** Puntos de ranking (FVP o del club). Ordenan la siembra. */
  puntos?: number;
  /** Cabeza de serie fijado a mano (1 = primer sembrado). Gana sobre `puntos`. */
  cabezaSerie?: number | null;
  estado: EstadoDupla;
  /** Franjas en que la dupla NO puede jugar (la programación las respeta). */
  noDisponible?: BloqueHorario[];
  /** Resultado del chequeo contra el ranking FVP. */
  fvp?: VerificacionFvp | null;
  inscritaEn: string;
}

/** Reglas de un partido. */
export interface ReglasPartido {
  /** 1 = un set; 3 = al mejor de 3. */
  sets: 1 | 3;
  /** Games para ganar un set (4, 6 o 9). */
  games: number;
  /** En qué empate de games se juega tie-break (6 → 6-6). null = sin tie-break, se gana por 2. */
  tieBreakEn: number | null;
  /** 40-40 se define a un punto (true) o con ventaja (false). */
  puntoDeOro: boolean;
  /** El tercer set se reemplaza por un tie-break decisivo (FIP Regla 1: súper tie-break a 10 o tie-break a 7). */
  superTie: boolean;
  /** Puntos del tie-break decisivo que reemplaza al tercer set: 10 (súper tie-break, por defecto) o 7. */
  tieDecisivo?: 7 | 10;
  /** Tercer set sin tie-break: con 6-6 se sigue hasta sacar 2 games de diferencia (FIP Regla 1.4). */
  tercerSetLargo?: boolean;
  /** Duración estimada en minutos (para programar). */
  minutos: number;
}

export type FaseReglas = "GRUPOS" | "LLAVE" | "SEMIS_FINAL";

export type FormatoCuadro =
  /** Grupos todos contra todos y llave con los clasificados. */
  | "GRUPOS_LLAVE"
  /** Eliminación directa desde el inicio. */
  | "ELIMINACION"
  /** Un solo grupo todos contra todos; gana el primero. */
  | "LIGA"
  /** Un solo grupo y final entre 1ro y 2do. */
  | "LIGA_FINAL";

export interface ConfigCuadro {
  formato: FormatoCuadro;
  /** Tamaño preferido de grupo (3 o 4). */
  tamanoGrupo: 3 | 4;
  /** Cuántos pasan por grupo a la llave (1 o 2). */
  clasificanPorGrupo: 1 | 2;
  tercerPuesto: boolean;
  /** Cuadro de consolación para los eliminados en grupos. */
  consolacion: boolean;
  /** El staff eligió el formato a mano (no se re-propone al cambiar inscritos). */
  manual?: boolean;
}

export interface Grupo {
  id: string;
  /** "A", "B", … */
  nombre: string;
  duplaIds: string[];
}

/** De dónde sale cada lado de un partido de llave. */
export type Origen =
  | { tipo: "DUPLA"; duplaId: string }
  | { tipo: "GRUPO"; grupoId: string; puesto: number }
  | { tipo: "GANADOR"; partidoId: string }
  | { tipo: "PERDEDOR"; partidoId: string }
  | { tipo: "BYE" };

export type EstadoPartidoTorneo = "PENDIENTE" | "LLAMADO" | "EN_JUEGO" | "FINALIZADO";

export type TipoResultado = "NORMAL" | "WO" | "RETIRO" | "DESCALIFICACION";

export interface ResultadoTorneo {
  sets: SetScore[];
  ganador: "A" | "B";
  tipo: TipoResultado;
}

export interface Programacion {
  /** YYYY-MM-DD */
  fecha: string;
  /** "HH:MM" */
  hora: string;
  pista: number;
  /** Fijado a mano: la reprogramación automática no lo mueve. */
  fijo?: boolean;
}

export type CuadroPartido = "PRINCIPAL" | "CONSOLACION";

export interface PartidoTorneo {
  id: string;
  categoriaId: string;
  fase: "GRUPOS" | "LLAVE";
  cuadro?: CuadroPartido;
  grupoId?: string;
  /** Grupos: jornada (1, 2, 3…). Llave: ronda (1 = primera ronda). */
  ronda: number;
  /** Llave: posición dentro de la ronda (0 = arriba). */
  posicion?: number;
  /** Ej. "Grupo A · J1", "Cuartos 2", "Final". */
  etiqueta: string;
  origenA: Origen;
  origenB: Origen;
  /** Duplas ya conocidas (se completan solas al avanzar la llave). */
  duplaA: string | null;
  duplaB: string | null;
  /** Partido resuelto por bye: no se juega. */
  bye?: boolean;
  /** Partido por el 3er puesto. */
  tercerPuesto?: boolean;
  estado: EstadoPartidoTorneo;
  resultado?: ResultadoTorneo | null;
  programacion?: Programacion | null;
  /** ISO. Cuándo se llamó a pista, empezó y terminó en la realidad. */
  llamadoEn?: string | null;
  inicioEn?: string | null;
  finEn?: string | null;
  /** Pista en la que se está jugando (puede diferir de la programada). */
  pistaReal?: number | null;
  /**
   * Partido interrumpido (lluvia, pista mojada, luz…): vuelve a quedar por programar y,
   * al reanudarse, sigue con el mismo marcador.
   */
  suspendido?: { en: string; motivo: string; marcador?: string } | null;
  actualizadoEn?: string;
}

export interface CriterioDesempate {
  id: "ENFRENTAMIENTO" | "SETS_ENTRE" | "GAMES_ENTRE" | "SETS_TODOS" | "GAMES_TODOS" | "GAMES_GANADOS";
  activo: boolean;
}

export interface Cuadro {
  config: ConfigCuadro;
  grupos: Grupo[];
  partidos: PartidoTorneo[];
  /** Semilla del sorteo (reproducible y verificable). */
  semilla: number;
  sorteadoEn: string;
  sorteadoPor?: string;
  /** Publicado = visible al público y programado. */
  publicado: boolean;
  /** Desempates resueltos por sorteo, por grupo: orden final de las empatadas. */
  sorteosDesempate?: Record<string, { orden: string[]; en: string; por?: string }>;
}

export interface CategoriaEnTorneo {
  categoria: CategoriaTorneo;
  duplas: Dupla[];
  config: ConfigCuadro;
  reglas: Record<FaseReglas, ReglasPartido>;
  cuadro: Cuadro | null;
  /** Cupo máximo de duplas (opcional). */
  cupo?: number | null;
}

export interface BloqueHorario {
  fecha: string;
  inicio: string;
  fin: string;
  /** Pista bloqueada; sin pista = aplica a todas (o a la dupla). */
  pista?: number | null;
  motivo?: string;
  /** Suspensiones por clima: se agrupan para poder reanudarlas juntas. */
  suspensionId?: string;
}

/** Club donde se juega parte del torneo (sede principal o de apoyo). */
export interface SedeTorneo {
  id: string;
  nombre: string;
  direccion?: string;
  /** Minutos para ir desde la sede principal: se suman al descanso si un jugador cambia de sede. */
  trasladoMin: number;
  /** Horario disponible en esa sede por día; sin horario = el del torneo. */
  horarios?: DiaTorneo[];
  /** Sede de apoyo agregada por un imprevisto (no estaba en el plan). */
  provisional?: boolean;
}

/** Marca que apoya el torneo: sale en el Modo TV, en las pantallas de pista y en la app. */
export interface Patrocinador {
  id: string;
  nombre: string;
  /** Logo como data URL (PNG/JPG/SVG reducido). */
  logo?: string | null;
  /** Pista que presenta ("Pista 1 presentada por…"). */
  pista?: number | null;
  /** Principal: más grande y siempre visible. */
  principal?: boolean;
}

/** Pista del torneo: del club o de una sede de apoyo. */
export type CanchaTorneo = PistaClub & { sedeId?: string };

export interface DiaTorneo {
  fecha: string;
  inicio: string;
  fin: string;
}

export type EstadoTorneo = "INSCRIPCION" | "PROGRAMADO" | "EN_JUEGO" | "FINALIZADO";

export interface RegistroCambio {
  en: string;
  por?: string;
  texto: string;
}

export interface Torneo {
  id: string;
  /** Club organizador (multi-club). */
  clubId: string;
  nombre: string;
  dias: DiaTorneo[];
  /** Pistas que usa el torneo, en orden de prioridad (finales en la primera). */
  canchas: CanchaTorneo[];
  /** Sedes. Sin sedes = todo en el club organizador. Las pistas sin `sedeId` son de la sede principal. */
  sedes?: SedeTorneo[];
  patrocinadores?: Patrocinador[];
  /** Descanso mínimo entre partidos de un mismo jugador. */
  descansoMin: number;
  /** Minutos de tolerancia antes de proponer W.O. */
  toleranciaWO: number;
  /** Semifinales y finales el último día. */
  finalesUltimoDia: boolean;
  bloqueos: BloqueHorario[];
  criterios: CriterioDesempate[];
  /** Validar las categorías por nivel con el ranking FVP (por defecto sí). */
  validarFvp?: boolean;
  jugadores: JugadorTorneo[];
  categorias: CategoriaEnTorneo[];
  estado: EstadoTorneo;
  historial?: RegistroCambio[];
  /**
   * Clave de participantes: da acceso a cuadros, horarios, marcadores y estadísticas
   * durante el torneo y caduca en `vence`. Sin clave, el torneo es público.
   * Solo el staff recibe la clave; al resto la API le llega vacía.
   */
  acceso?: { clave: string; vence: string } | null;
  /**
   * Árbitros del torneo: qué pista y franja le toca a cada árbitro del plantel del club.
   * El PIN y el registro de árbitros son del club (Ajustes → Árbitros), no de cada torneo;
   * `pin` y `vence` quedan solo por compatibilidad con torneos viejos y se ignoran.
   */
  arbitros?: { turnos?: TurnoArbitro[]; pin?: string; vence?: string } | null;
  /** Solo en respuestas de la API: sin clave válida se recibe un resumen sin datos. */
  bloqueado?: boolean;
  creadoEn: string;
  actualizadoEn: string;
  eliminado?: boolean;
}

/* ---------- Marcador en vivo (punto a punto) ---------- */

export type FinPunto = "WINNER" | "ERROR_NO_FORZADO" | "ERROR_FORZADO" | "ACE" | "DOBLE_FALTA" | "SANCION";

/** Tabla de penalizaciones FIP: 1ª advertencia, 2ª pérdida de punto, 3ª descalificación. Se acumulan por dupla. */
export type NivelSancion = "ADVERTENCIA" | "PUNTO" | "DESCALIFICACION";

export interface SancionPartido {
  lado: "A" | "B";
  jugadorId?: string | null;
  nivel: NivelSancion;
  /** Infracción muy grave: descalificación directa. */
  directa?: boolean;
  motivo: string;
  /** Índice del punto que generó (pérdida de punto), para que "Deshacer" la quite junto al punto. */
  punto?: number;
  t: string;
}

/** FIP Regla 2.17–2.19: lesión 3 min una vez por jugador; accidente ajeno al juego hasta 15 min y no cuenta. */
export interface AtencionMedica {
  jugadorId: string;
  tipo: "LESION" | "ACCIDENTE";
  t: string;
}

export type Golpe =
  | "REMATE"
  | "X3"
  | "X4"
  | "VIBORA"
  | "BANDEJA"
  | "VOLEA"
  | "GLOBO"
  | "CHIQUITA"
  | "BAJADA"
  | "DRIVE"
  | "REVES"
  | "SAQUE";

export interface PuntoRegistrado {
  /** Dupla que ganó el punto. */
  gana: "A" | "B";
  /** Cómo terminó (opcional). */
  fin?: FinPunto | null;
  /** Jugador protagonista: quien hizo el winner/ace, o quien cometió el error. */
  jugadorId?: string | null;
  golpe?: Golpe | null;
  /** En un error: si la pelota fue a la red o afuera (opcional). */
  zona?: "RED" | "AFUERA" | null;
  /** Hubo falta de primer saque en este punto. */
  primerSaqueFalla?: boolean;
  /** ISO */
  t: string;
  /** Quién lo anotó: id del árbitro registrado o "staff" (trazabilidad). */
  por?: string;
}

export interface MarcadorVivo {
  /** = partidoId */
  id: string;
  torneoId: string;
  categoriaId: string;
  reglas: ReglasPartido;
  /** Orden de saque: [A1, B1, A2, B2] o [B1, A1, B2, A2]. */
  ordenSaque: [string, string, string, string];
  /** Jugadores de cada lado: [drive, revés]. */
  jugadoresA: [string, string];
  jugadoresB: [string, string];
  puntos: PuntoRegistrado[];
  /** Falta de primer saque pendiente en el punto en curso. */
  faltaPendiente?: boolean;
  /**
   * Cambio de orden dentro de cada dupla al empezar un set (FIP Regla 6.10 y 8.3). Clave = índice del set;
   * true = ese set saca primero el otro jugador de la dupla respecto del orden inicial. Rige hasta el próximo cambio.
   */
  ordenSets?: Record<number, { A?: boolean; B?: boolean }>;
  sanciones?: SancionPartido[];
  atenciones?: AtencionMedica[];
  pista?: number | null;
  anotador?: string;
  /** Árbitro registrado que lo empezó (id). */
  arbitroId?: string;
  /** Todos los que anotaron puntos en este partido, en orden (relevos incluidos). */
  anotadores?: { id: string; nombre: string }[];
  /** Sorteo previo (FIP): quién lo ganó y qué eligió. */
  sorteo?: { gana: "A" | "B"; eligio: EleccionSorteo } | null;
  /** Lado de la pista donde empezó la dupla A, visto desde la silla del árbitro. */
  ladoInicialA?: "IZQ" | "DER";
  iniciadoEn: string;
  finalizado: boolean;
  actualizadoEn: string;
}

export interface ApiTorneosRespuesta {
  modo: "DEMO" | "SUPABASE";
  torneos: Torneo[];
}

export interface ApiMarcadoresRespuesta {
  modo: "DEMO" | "SUPABASE";
  marcadores: MarcadorVivo[];
}

/** Lo que elige quien gana el sorteo (FIP): sacar, restar o el lado de la pista. */
export type EleccionSorteo = "SACAR" | "RESTAR" | "LADO";

/** Turno de un árbitro: una pista durante una franja de un día. */
export interface TurnoArbitro {
  id: string;
  arbitroId: string;
  /** YYYY-MM-DD */
  fecha: string;
  pista: number;
  /** HH:mm */
  desde: string;
  hasta: string;
}

/** Árbitro registrado en un torneo (sin su código personal, que nunca sale del servidor). */
export interface ArbitroRegistrado {
  id: string;
  nombre: string;
  apellido: string;
  /** Solo lo ve el staff. */
  telefono?: string;
  activo: boolean;
  registradoEn: string;
}
