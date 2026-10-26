"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, List, Volume2, VolumeX } from "lucide-react";
import { INDICE, PAGINAS, type Pagina } from "./paginas";

type Modo = "doble" | "simple";

/** Alto / ancho de cada página: libro abierto, y una sola página en el celular (aprovecha el alto). */
const RATIO = 1.42;
const RATIO_MAX_SIMPLE = 1.62;
const TAMANOS = [1, 1.12, 1.25];
const CLAVE = "lm-manual";

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function leerPrefs(): { p?: number; fs?: number; sonido?: boolean } {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) ?? "{}");
  } catch {
    return {};
  }
}

function guardarPrefs(datos: { p: number; fs: number; sonido: boolean }) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(datos));
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

/** Página visible (la izquierda en modo doble) según cuántas hojas están volteadas. */
const paginaDe = (modo: Modo, cur: number) => (modo === "doble" ? Math.max(0, 2 * cur - 1) : cur);
const hojaDe = (modo: Modo, p: number) => (modo === "doble" ? Math.ceil(p / 2) : p);

function Cara({ pagina, numero, lado, onIr }: { pagina: Pagina; numero: number; lado: "izq" | "der"; onIr: (p: number) => void }) {
  if (pagina.tipo === "tapa" || pagina.tipo === "contratapa")
    return <div className={`ml-pagina ml-p-${pagina.tipo} ml-${lado}`}>{pagina.cuerpo}</div>;
  return (
    <div className={`ml-pagina ml-${lado}${pagina.tipo === "apertura" ? " ml-p-apertura" : ""}`}>
      <div className="ml-corrido">
        <span>{pagina.seccion}</span>
        <span>Manual del staff</span>
      </div>
      <div className="ml-contenido">
        {pagina.cuerpo ?? (
          <>
            <p className="ml-eyebrow">Contenido</p>
            <h2>Índice</h2>
            <ol className="ml-indice">
              {INDICE.map((c) => (
                <li key={c.n}>
                  <button type="button" onClick={() => onIr(c.pagina)}>
                    <span className="ml-indice-n">{c.n}</span>
                    <span className="ml-indice-t">{c.titulo}</span>
                    <span className="ml-indice-p">{c.pagina}</span>
                  </button>
                </li>
              ))}
            </ol>
            <p className="ml-chico">Toca un capítulo para ir directo a esa página.</p>
          </>
        )}
      </div>
      <div className="ml-folio">{numero}</div>
    </div>
  );
}

function Reverso() {
  return (
    <div className="ml-pagina ml-izq ml-reverso">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/isotipo-256.png" alt="" draggable={false} />
    </div>
  );
}

export function Libro() {
  const escenaRef = useRef<HTMLDivElement>(null);
  const hojasRef = useRef<(HTMLDivElement | null)[]>([]);
  const proyRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const [modo, setModo] = useState<Modo | null>(null);
  const [pw, setPw] = useState(0);
  const [ph, setPh] = useState(0);
  const [cur, setCur] = useState(0);
  const [fs, setFs] = useState(1);
  const [sonido, setSonido] = useState(true);
  const motor = useRef({ modo: "doble" as Modo, ang: [] as number[], cur: 0, ocupado: false, moviendo: -1 });
  const prefs = useRef({ fs: 1, sonido: true });
  prefs.current = { fs, sonido };

  const nHojas = (m: Modo) => (m === "doble" ? PAGINAS.length / 2 : PAGINAS.length);
  const maxCur = (m: Modo) => (m === "doble" ? nHojas(m) : nHojas(m) - 1);

  // Medir el espacio y elegir libro abierto (doble) o una página (simple).
  useLayoutEffect(() => {
    const guardadas = leerPrefs();
    if (guardadas.fs && TAMANOS.includes(guardadas.fs)) setFs(guardadas.fs);
    if (typeof guardadas.sonido === "boolean") setSonido(guardadas.sonido);
    let primera = true;
    const medir = () => {
      const el = escenaRef.current;
      if (!el) return;
      const { width, height } = el.getBoundingClientRect();
      const nuevo: Modo = width < 720 ? "simple" : "doble";
      const ancho = Math.floor(
        nuevo === "doble" ? Math.min(width / 2 - 20, height / RATIO, 620) : Math.min(width, height / RATIO, 560),
      );
      const m = motor.current;
      const p = primera ? Math.min(guardadas.p ?? 0, PAGINAS.length - 1) : paginaDe(m.modo, m.cur);
      if (primera || nuevo !== m.modo) {
        const c = Math.min(hojaDe(nuevo, p), maxCur(nuevo));
        m.modo = nuevo;
        m.cur = c;
        m.ang = Array.from({ length: nHojas(nuevo) }, (_, i) => (i < c ? 180 : 0));
        setCur(c);
        setModo(nuevo);
      }
      primera = false;
      const w = Math.max(200, ancho);
      setPw(w);
      setPh(Math.round(nuevo === "doble" ? w * RATIO : Math.min(height, w * RATIO_MAX_SIMPLE)));
    };
    medir();
    const ro = new ResizeObserver(medir);
    if (escenaRef.current) ro.observe(escenaRef.current);
    return () => ro.disconnect();
  }, []);

  const pintar = useCallback((i: number, a: number) => {
    const el = hojasRef.current[i];
    if (!el) return;
    el.style.transform = `rotateY(${-a}deg)`;
    const f = el.firstElementChild?.lastElementChild as HTMLElement | null;
    const b = el.lastElementChild?.lastElementChild as HTMLElement | null;
    if (f) f.style.opacity = String((Math.min(a, 90) / 90) * 0.6);
    if (b) b.style.opacity = String(((180 - Math.max(a, 90)) / 90) * 0.6);
    const proy = proyRef.current;
    if (proy && motor.current.moviendo === i) {
      proy.style.opacity = String(Math.sin((a * Math.PI) / 180) * 0.7);
      proy.dataset.lado = a < 90 ? "der" : "izq";
    } else if (proy && motor.current.moviendo === -1) proy.style.opacity = "0";
  }, []);

  const ordenar = useCallback(() => {
    const m = motor.current;
    const n = m.ang.length;
    m.ang.forEach((a, i) => {
      const el = hojasRef.current[i];
      if (!el) return;
      el.style.zIndex = String(m.moviendo === i ? 3 * n : a >= 180 ? i + 1 : 2 * n - i);
      el.style.visibility = m.modo === "simple" && a >= 180 && m.moviendo !== i ? "hidden" : "visible";
      pintar(i, a);
    });
  }, [pintar]);

  useLayoutEffect(() => {
    if (modo) ordenar();
  }, [modo, pw, ordenar]);

  useEffect(() => {
    if (modo) guardarPrefs({ p: paginaDe(modo, cur), fs, sonido });
  }, [modo, cur, fs, sonido]);

  const sonar = useCallback(() => {
    if (!prefs.current.sonido) return;
    try {
      const ctx = (audioRef.current ??= new AudioContext());
      const dur = 0.42;
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let k = 0; k < len; k++) {
        const t = k / len;
        d[k] = (Math.random() * 2 - 1) * Math.sin(Math.PI * Math.min(1, t * 1.6)) * Math.pow(1 - t, 1.5);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filtro = ctx.createBiquadFilter();
      filtro.type = "bandpass";
      filtro.frequency.value = 2600;
      filtro.Q.value = 0.6;
      const vol = ctx.createGain();
      vol.gain.value = 0.22;
      src.connect(filtro).connect(vol).connect(ctx.destination);
      src.start();
    } catch {
      /* sin audio */
    }
  }, []);

  const animar = useCallback(
    (i: number, desde: number, hasta: number, ms: number, curva = easeInOut) =>
      new Promise<void>((fin) => {
        const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const total = reducido ? 0 : ms * (Math.abs(hasta - desde) / 180);
        const t0 = performance.now();
        const paso = (t: number) => {
          const k = total ? Math.min(1, (t - t0) / total) : 1;
          const a = desde + (hasta - desde) * curva(k);
          motor.current.ang[i] = a;
          pintar(i, a);
          if (k < 1) requestAnimationFrame(paso);
          else fin();
        };
        requestAnimationFrame(paso);
      }),
    [pintar],
  );

  const cerrar = useCallback(
    (i: number, destino: number) => {
      const m = motor.current;
      m.ang[i] = destino;
      m.moviendo = -1;
      m.cur = m.ang.filter((a) => a >= 180).length;
      m.ocupado = false;
      ordenar();
      setCur(m.cur);
    },
    [ordenar],
  );

  const levantar = useCallback(
    (i: number) => {
      motor.current.moviendo = i;
      ordenar();
    },
    [ordenar],
  );

  const voltear = useCallback(
    async (dir: 1 | -1, ms = 900) => {
      const m = motor.current;
      if (m.ocupado) return;
      const i = dir > 0 ? m.cur : m.cur - 1;
      if (i < 0 || i >= m.ang.length || (dir > 0 && m.cur >= maxCur(m.modo))) return;
      m.ocupado = true;
      const destino = dir > 0 ? 180 : 0;
      setCur(m.cur + dir);
      levantar(i);
      sonar();
      await animar(i, m.ang[i], destino, ms);
      cerrar(i, destino);
    },
    [animar, cerrar, levantar, sonar],
  );

  const ir = useCallback(
    async (p: number) => {
      const m = motor.current;
      if (m.ocupado) return;
      const meta = Math.min(hojaDe(m.modo, p), maxCur(m.modo));
      let vueltas = 0;
      while (m.cur !== meta && vueltas++ < 60) await voltear(m.cur < meta ? 1 : -1, 420);
    },
    [voltear],
  );

  // Arrastrar la hoja con el dedo o el mouse.
  const arrastre = useRef<{ dir: 1 | -1; x0: number; i: number; a0: number; movido: boolean; id: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    const m = motor.current;
    if (m.ocupado || e.button !== 0 || (e.target as HTMLElement).closest("button,a")) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const dir: 1 | -1 = m.modo === "doble" ? (x > r.width / 2 ? 1 : -1) : x > r.width * 0.3 ? 1 : -1;
    const i = dir > 0 ? m.cur : m.cur - 1;
    if (i < 0 || i >= m.ang.length || (dir > 0 && m.cur >= maxCur(m.modo))) return;
    arrastre.current = { dir, x0: e.clientX, i, a0: m.ang[i], movido: false, id: e.pointerId };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = arrastre.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x0;
    if (!d.movido) {
      if (Math.abs(dx) < 8) return;
      d.movido = true;
      motor.current.ocupado = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      levantar(d.i);
    }
    const tramo = (motor.current.modo === "doble" ? 1.7 : 0.95) * pw;
    const a = Math.max(0, Math.min(180, d.a0 - (dx / tramo) * 180));
    motor.current.ang[d.i] = a;
    pintar(d.i, a);
  };

  const soltar = async (e: React.PointerEvent, cancelado = false) => {
    const d = arrastre.current;
    if (!d || d.id !== e.pointerId) return;
    arrastre.current = null;
    if (!d.movido) {
      if (!cancelado) void voltear(d.dir);
      return;
    }
    const a = motor.current.ang[d.i];
    const sigue = !cancelado && (d.dir > 0 ? a > 50 : a < 130);
    const destino = sigue === d.dir > 0 ? 180 : 0;
    if (sigue) {
      setCur(motor.current.cur + d.dir);
      sonar();
    }
    await animar(d.i, a, destino, 650, easeOut);
    cerrar(d.i, destino);
  };

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") void voltear(1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") void voltear(-1);
      else if (e.key === "Home") void ir(0);
      else if (e.key === "End") void ir(PAGINAS.length - 1);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [voltear, ir]);

  const n = modo ? nHojas(modo) : 0;
  const tope = modo ? maxCur(modo) : 0;
  const desplazamiento = modo === "doble" ? (cur === 0 ? -pw / 2 : cur === n ? pw / 2 : 0) : 0;
  const ultima = PAGINAS.length - 1;
  let contador = "";
  if (modo === "doble") contador = cur === 0 ? "Portada" : cur === n ? "Contraportada" : `Págs. ${2 * cur - 1}–${2 * cur} de ${ultima - 1}`;
  else if (modo) contador = cur === 0 ? "Portada" : cur === ultima ? "Contraportada" : `Pág. ${cur} de ${ultima - 1}`;

  return (
    <div className="ml-app">
      <header className="ml-barra">
        <Link href="/" className="ml-icono" aria-label="Volver a la app">
          <ArrowLeft className="size-4" />
        </Link>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/isotipo-256.png" alt="" className="ml-barra-logo" />
        <div className="ml-barra-titulo">
          <b>Manual del staff</b>
          <span>La Marina Americanos</span>
        </div>
        <button
          type="button"
          className="ml-icono"
          aria-label="Tamaño de letra"
          title="Tamaño de letra"
          onClick={() => setFs((v) => TAMANOS[(TAMANOS.indexOf(v) + 1) % TAMANOS.length])}
        >
          <span className="ml-aa">Aa</span>
        </button>
        <button
          type="button"
          className="ml-icono"
          aria-label={sonido ? "Silenciar el sonido de las hojas" : "Activar el sonido de las hojas"}
          aria-pressed={sonido}
          onClick={() => setSonido((v) => !v)}
        >
          {sonido ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
        </button>
      </header>

      <div className="ml-escena" ref={escenaRef}>
        {!modo || !pw ? (
          <p className="ml-cargando">Abriendo el libro…</p>
        ) : (
          <div
            className={`ml-libro ml-libro-${modo}${cur === 0 ? " ml-ini" : cur === n ? " ml-fin" : ""}`}
            style={
              {
                "--pw": `${pw}px`,
                "--fs": fs,
                "--izq": Math.min(cur, 14),
                "--der": Math.min(tope - cur, 14),
                width: modo === "doble" ? pw * 2 : pw,
                height: ph,
                transform: `translateX(${desplazamiento}px)`,
              } as React.CSSProperties
            }
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => void soltar(e)}
            onPointerCancel={(e) => void soltar(e, true)}
          >
            {modo === "doble" && cur > 0 && <div className="ml-canto ml-canto-izq" />}
            {cur < tope && <div className="ml-canto ml-canto-der" />}
            {Array.from({ length: n }, (_, i) => {
              const frente = modo === "doble" ? 2 * i : i;
              return (
                <div
                  key={`${modo}-${i}`}
                  className="ml-hoja"
                  ref={(el) => {
                    hojasRef.current[i] = el;
                  }}
                >
                  <div className="ml-cara ml-cara-frente">
                    <Cara pagina={PAGINAS[frente]} numero={frente} lado="der" onIr={ir} />
                    <div className="ml-sombra" />
                  </div>
                  <div className="ml-cara ml-cara-atras">
                    {modo === "doble" ? <Cara pagina={PAGINAS[frente + 1]} numero={frente + 1} lado="izq" onIr={ir} /> : <Reverso />}
                    <div className="ml-sombra" />
                  </div>
                </div>
              );
            })}
            <div className="ml-proyeccion" ref={proyRef} />
          </div>
        )}
      </div>

      <nav className="ml-controles" aria-label="Navegación del libro">
        <button type="button" className="ml-icono" onClick={() => void voltear(-1)} disabled={cur === 0} aria-label="Página anterior">
          <ChevronLeft className="size-5" />
        </button>
        <button type="button" className="ml-indice-btn" onClick={() => void ir(2)}>
          <List className="size-4" />
          Índice
        </button>
        <span className="ml-contador" aria-live="polite">
          {contador}
        </span>
        <button type="button" className="ml-icono" onClick={() => void voltear(1)} disabled={cur >= tope} aria-label="Página siguiente">
          <ChevronRight className="size-5" />
        </button>
      </nav>
    </div>
  );
}
