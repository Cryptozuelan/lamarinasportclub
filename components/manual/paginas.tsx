import type { ReactNode } from "react";

/** Contenido del libro del staff. Cada entrada es una página; el orden es el del libro (portada = 0). */
export type Pagina = {
  tipo?: "tapa" | "contratapa" | "apertura";
  /** Título corrido que se muestra arriba de la página. */
  seccion?: string;
  cuerpo: ReactNode;
};

function Pasos({ items }: { items: ReactNode[] }) {
  return (
    <ol className="ml-pasos">
      {items.map((t, i) => (
        <li key={i}>
          <span className="ml-paso-n">{i + 1}</span>
          <span>{t}</span>
        </li>
      ))}
    </ol>
  );
}

function Nota({ titulo, children, tono = "neon" }: { titulo: string; children: ReactNode; tono?: "neon" | "cielo" | "coral" }) {
  return (
    <aside className={`ml-nota ml-nota-${tono}`}>
      <b>{titulo}</b>
      <div>{children}</div>
    </aside>
  );
}

function Captura({ src, alt, ancho = false }: { src: string; alt: string; ancho?: boolean }) {
  return (
    <figure className={ancho ? "ml-captura ml-captura-ancha" : "ml-captura"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" draggable={false} />
    </figure>
  );
}

function Apertura({ n, titulo, bajada }: { n: string; titulo: string; bajada: string }) {
  return (
    <header className="ml-apertura">
      <span className="ml-cap-n">{n}</span>
      <p className="ml-eyebrow">Capítulo {n}</p>
      <h2>{titulo}</h2>
      <p className="ml-bajada">{bajada}</p>
    </header>
  );
}

const B = ({ children }: { children: ReactNode }) => <b className="ml-btn">{children}</b>;

/** Capítulos para el índice: página donde empieza cada uno. */
export const INDICE: { n: string; titulo: string; pagina: number }[] = [
  { n: "1", titulo: "Antes de empezar", pagina: 3 },
  { n: "2", titulo: "Mi club", pagina: 5 },
  { n: "3", titulo: "Crear un americano", pagina: 6 },
  { n: "4", titulo: "El cuadro vivo", pagina: 12 },
  { n: "5", titulo: "Ranking y Modo TV", pagina: 15 },
  { n: "6", titulo: "Sin señal y otros imprevistos", pagina: 18 },
  { n: "7", titulo: "Preguntas frecuentes", pagina: 20 },
];

export const PAGINAS: Pagina[] = [
  // 0 · Portada
  {
    tipo: "tapa",
    cuerpo: (
      <div className="ml-tapa">
        <svg className="ml-tapa-cancha" viewBox="0 0 100 140" aria-hidden="true">
          <rect x="14" y="10" width="72" height="120" rx="1" />
          <line x1="14" y1="70" x2="86" y2="70" />
          <line x1="14" y1="41" x2="86" y2="41" />
          <line x1="14" y1="99" x2="86" y2="99" />
          <line x1="50" y1="41" x2="50" y2="99" />
        </svg>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo.png" alt="La Marina Sport Club" className="ml-tapa-logo" draggable={false} />
        <div className="ml-tapa-titulo">
          <p className="ml-eyebrow">Americanos & Torneos</p>
          <h1>
            Manual
            <br />
            <span>del staff</span>
          </h1>
          <p>Todo lo que necesitas para llevar un americano de principio a fin, desde el PIN hasta el podio.</p>
        </div>
        <p className="ml-tapa-pie">Edición 2026 · PadelReserve</p>
      </div>
    ),
  },
  // 1 · Bienvenida
  {
    seccion: "Bienvenida",
    cuerpo: (
      <>
        <p className="ml-eyebrow">Para quien está en la pista</p>
        <h2>Hola, equipo.</h2>
        <p>
          Este libro explica cómo usar la app de Americanos de La Marina el día del evento: crear el cuadro, cargar marcadores, mover
          jugadores y poner el ranking en la tele del bar.
        </p>
        <p>No hace falta leerlo entero. Si algo pasa en plena ronda, ve al capítulo 6 o a las preguntas frecuentes.</p>
        <h3>Cómo leer este libro</h3>
        <ul className="ml-lista">
          <li>Arrastra la esquina de la hoja o desliza con el dedo para pasar página.</li>
          <li>En el computador también puedes usar las flechas ← → del teclado.</li>
          <li>
            <B>Índice</B> te lleva a cualquier capítulo y <B>Aa</B> agranda la letra.
          </li>
        </ul>
        <Nota titulo="Palabras que vas a ver" tono="cielo">
          <b>Staff</b>: quien organiza y carga marcadores. <b>Jugadores</b>: miran todo desde su celular, sin poder cambiar nada.
          <b> Pista</b>: cada cancha del club.
        </Nota>
      </>
    ),
  },
  // 2 · Índice
  { seccion: "Índice", cuerpo: null },
  // 3 · Capítulo 1
  {
    tipo: "apertura",
    seccion: "Antes de empezar",
    cuerpo: (
      <>
        <Apertura n="1" titulo="Antes de empezar" bajada="Qué es la app, quién puede editar y cómo instalarla." />
        <p>
          La Marina Americanos organiza americanos y torneos de pádel del club. Es parte de PadelReserve y funciona en celular, tablet,
          computador y la tele del bar.
        </p>
        <div className="ml-dos">
          <div className="ml-tarjeta">
            <b>Staff</b>
            <span>Crea eventos, carga marcadores, cambia jugadores y edita Mi club.</span>
          </div>
          <div className="ml-tarjeta">
            <b>Jugadores</b>
            <span>Ven el cuadro, el ranking y su pista en modo espectador.</span>
          </div>
        </div>
        <h3>Instalar la app</h3>
        <ul className="ml-lista">
          <li>
            <b>Android / Chrome:</b> botón <B>Instalar</B> en el inicio, o menú ⋮ → Instalar app.
          </li>
          <li>
            <b>iPhone:</b> en Safari, Compartir → Agregar a inicio.
          </li>
        </ul>
      </>
    ),
  },
  // 4 · PIN
  {
    seccion: "Antes de empezar",
    cuerpo: (
      <>
        <h2>Entrar como staff</h2>
        <Pasos
          items={[
            <>
              Toca <B>Soy staff</B>. Aparece en cualquier pantalla que lo pida.
            </>,
            <>Escribe el PIN del club en el teclado. Con 4 dígitos entra solo, sin botón.</>,
            <>
              Si tienes usuario de PadelReserve, también puedes entrar por la pestaña <B>PadelReserve</B> con tu correo.
            </>,
            <>
              Para salir, toca el chip de staff arriba y confirma.
            </>,
          ]}
        />
        <div className="ml-dato">
          <span className="ml-dato-n">12 h</span>
          <span>dura la sesión en ese dispositivo. Después pide el PIN otra vez.</span>
        </div>
        <Nota titulo="5 intentos" tono="coral">
          Tras 5 PIN incorrectos seguidos, ese dispositivo espera 10 minutos. Si urge, entra desde otro celular.
        </Nota>
        <Nota titulo="El badge de arriba" tono="cielo">
          <b>En línea</b>: todo se guarda en PadelReserve. <b>Demo</b>: modo de prueba, nada llega a la base del club.
        </Nota>
      </>
    ),
  },
  // 5 · Mi club
  {
    tipo: "apertura",
    seccion: "Mi club",
    cuerpo: (
      <>
        <Apertura n="2" titulo="Mi club" bajada="Los datos del club que usan todos los eventos nuevos." />
        <p>
          En el inicio, toca el engranaje <B>Mi club</B>. Lo que guardes aquí se usa al crear cada americano.
        </p>
        <ul className="ml-lista">
          <li>
            <b>Pistas:</b> nombre de cada una y si es techada. Hoy hay 4 techadas (1 a 4) y 1 al aire libre (5).
          </li>
          <li>
            <b>Horario:</b> apertura y cierre por día de la semana.
          </li>
          <li>
            <b>Minutos entre rondas:</b> el tiempo para cambiar de pista.
          </li>
          <li>
            <b>Contacto:</b> dirección e Instagram que ven los jugadores.
          </li>
        </ul>
        <Nota titulo="¿Llueve?" tono="cielo">
          Al crear un evento, el botón <B>¿Llueve?</B> deja solo las pistas techadas. Las techadas siempre reciben los partidos primero.
        </Nota>
      </>
    ),
  },
  // 6 · Capítulo 3
  {
    tipo: "apertura",
    seccion: "Crear un americano",
    cuerpo: (
      <>
        <Apertura n="3" titulo="Crear un americano" bajada="Un asistente de 5 pasos. Si se cierra la app, el borrador queda guardado." />
        <p>
          En el inicio toca <B>Nuevo Americano</B>.
        </p>
        <ol className="ml-ruta">
          <li>
            <b>Categoría</b>
            <span>Femenino, Masculino o Mixto, y el nivel.</span>
          </li>
          <li>
            <b>Formato</b>
            <span>Cómo se arman las parejas, cómo se cuenta y cómo se ordena el ranking.</span>
          </li>
          <li>
            <b>Pistas</b>
            <span>Cuáles se usan, fecha, horario y minutos por ronda.</span>
          </li>
          <li>
            <b>Jugadores</b>
            <span>Nombres, o parejas en Dupla fija.</span>
          </li>
          <li>
            <b>Listo</b>
            <span>Revisas el resumen y creas el evento.</span>
          </li>
        </ol>
      </>
    ),
  },
  // 7 · Categoría y formato
  {
    seccion: "Crear un americano",
    cuerpo: (
      <>
        <p className="ml-eyebrow">Paso 1</p>
        <h2>Categoría</h2>
        <div className="ml-tabla-wrap">
          <table className="ml-tabla">
            <tbody>
              <tr>
                <th>Femenino</th>
                <td>7ma · 6ta · 5ta · 4ta · 3ra · Open</td>
              </tr>
              <tr>
                <th>Masculino</th>
                <td>7ma · 6ta · 5ta · 4ta · 3ra · Open</td>
              </tr>
              <tr>
                <th>Mixto</th>
                <td>7ma · 6ta · 5ta · 4ta · 3ra · Open Mixto</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="ml-eyebrow">Paso 2</p>
        <h2>Formato</h2>
        <div className="ml-tres">
          <div className="ml-tarjeta">
            <b>Individual</b>
            <span>El americano clásico. Cada ronda cambias de pareja.</span>
          </div>
          <div className="ml-tarjeta">
            <b>Dupla fija</b>
            <span>Parejas inscritas que juegan todos contra todos.</span>
          </div>
          <div className="ml-tarjeta">
            <b>Mixto</b>
            <span>Como Individual, pero cada pareja es siempre un hombre y una mujer.</span>
          </div>
        </div>
        <p className="ml-chico">
          El sorteo no repite compañero, reparte rivales y equilibra niveles. El mismo evento siempre da el mismo cuadro.
        </p>
      </>
    ),
  },
  // 8 · Puntuación
  {
    seccion: "Crear un americano",
    cuerpo: (
      <>
        <p className="ml-eyebrow">Paso 2 · Reglas</p>
        <h2>Puntuación a tu medida</h2>
        <p>Eliges cómo se cuenta y escribes cualquier número. Los atajos cubren lo habitual.</p>
        <div className="ml-tabla-wrap">
          <table className="ml-tabla">
            <thead>
              <tr>
                <th>Método</th>
                <th>Opciones</th>
                <th>Ejemplo</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>Puntos</th>
                <td>En total o primero en llegar, de 4 a 99</td>
                <td>24 en total (13-11) o a 13 (13-9)</td>
              </tr>
              <tr>
                <th>Games</th>
                <td>En total o primero en llegar, de 1 a 15. Punto de oro o ventaja</td>
                <td>5 en total</td>
              </tr>
              <tr>
                <th>Sets</th>
                <td>1 set, mejor de 3 o de 5, de 2 a 9 games por set</td>
                <td>Mejor de 3 a 6 (6-4, 5-7, 10-8)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Nota titulo="Siempre hay un resumen">
          Debajo de las reglas la app escribe la regla completa, por ejemplo: «5 games en total · si quedan 2-2, tie a 5 · punto de oro».
          Léelo en voz alta a los jugadores antes de empezar.
        </Nota>
      </>
    ),
  },
  // 9 · Tie-break y ranking
  {
    seccion: "Crear un americano",
    cuerpo: (
      <>
        <h3>Tie-break y super tie</h3>
        <ul className="ml-lista">
          <li>
            <b>Games:</b> tie-break opcional si empatan, de 3 a 21 puntos. Ejemplo: 5 games en total, si quedan 2-2 el último game es un
            tie a 5 (3-2, tie 5-3).
          </li>
          <li>
            <b>Sets:</b> super tie opcional en el set decisivo, por ejemplo a 10.
          </li>
        </ul>
        <p className="ml-eyebrow">Paso 2 · Criterio</p>
        <h2>¿Cómo se ordena el ranking?</h2>
        <div className="ml-pila">
          <div className="ml-tarjeta">
            <b>Todos los puntos</b>
            <span>Cada jugador suma los puntos de su pareja, gane o pierda. El más usado en americanos.</span>
          </div>
          <div className="ml-tarjeta">
            <b>Solo rondas ganadas</b>
            <span>Solo cuentan los puntos de los partidos ganados.</span>
          </div>
          <div className="ml-tarjeta">
            <b>Por victorias</b>
            <span>3 puntos por ganar y 1 por empatar, como en una liga.</span>
          </div>
        </div>
      </>
    ),
  },
  // 10 · Pistas y horario
  {
    seccion: "Crear un americano",
    cuerpo: (
      <>
        <p className="ml-eyebrow">Paso 3</p>
        <h2>Pistas y horario</h2>
        <div className="ml-con-captura">
          <Captura src="/manual/pistas.webp" alt="Paso Pistas y horario con 3 pistas techadas elegidas" />
          <div>
            <ul className="ml-lista">
              <li>Toca las pistas que se usarán (de 1 a 6).</li>
              <li>Elige fecha, hora de inicio y fin.</li>
              <li>
                Ajusta los <b>minutos por ronda</b>. La app calcula cuántas rondas caben y a qué hora termina.
              </li>
              <li>
                Abajo dice para cuántos jugadores es ideal. Con 3 pistas, 12 jugadores.
              </li>
            </ul>
            <Nota titulo="Lluvia" tono="cielo">
              <B>¿Llueve?</B> deja solo las techadas. <B>Todas</B> vuelve a marcarlas todas.
            </Nota>
          </div>
        </div>
      </>
    ),
  },
  // 11 · Jugadores y listo
  {
    seccion: "Crear un americano",
    cuerpo: (
      <>
        <p className="ml-eyebrow">Paso 4</p>
        <h2>Jugadores</h2>
        <ul className="ml-lista">
          <li>Escribe los nombres. En Mixto, marca si es hombre o mujer.</li>
          <li>En Dupla fija, inscribe cada pareja.</li>
          <li>La app avisa si falta gente o si sobran jugadores para las pistas elegidas.</li>
        </ul>
        <Nota titulo="Si sobra gente">
          Cada ronda descansa quien menos ha jugado, así nadie descansa dos veces seguidas si se puede evitar.
        </Nota>
        <p className="ml-eyebrow">Paso 5</p>
        <h2>Listo</h2>
        <p>
          Revisa el resumen: categoría, formato, reglas, pistas, horario y jugadores. Toca <B>Crear</B> y las rondas se sortean solas.
        </p>
        <div className="ml-dato">
          <span className="ml-dato-n">60 s</span>
          <span>es lo que toma crear un americano cuando ya conoces el asistente.</span>
        </div>
      </>
    ),
  },
  // 12 · Capítulo 4 · Cuadro vivo
  {
    tipo: "apertura",
    seccion: "El cuadro vivo",
    cuerpo: (
      <>
        <Apertura n="4" titulo="El cuadro vivo" bajada="La pantalla donde pasa todo durante el evento." />
        <div className="ml-con-captura">
          <Captura src="/manual/live.webp" alt="Cuadro con las pistas 1, 2 y 3 con resultado final" />
          <div>
            <ul className="ml-lista">
              <li>
                La pestaña <B>Cuadro</B> muestra la ronda actual con una tarjeta por pista: pareja A contra pareja B.
              </li>
              <li>
                Toca <B>Iniciar ronda</B> para arrancar el cronómetro. Puedes pausar, reanudar y reiniciar.
              </li>
              <li>Las pistas cargadas quedan con el sello Final y el ganador en verde.</li>
            </ul>
          </div>
        </div>
      </>
    ),
  },
  // 13 · Cargar marcador
  {
    seccion: "El cuadro vivo",
    cuerpo: (
      <>
        <h2>Cargar un marcador</h2>
        <Pasos
          items={[
            <>Toca la tarjeta de la pista.</>,
            <>Marca el resultado o elige un atajo con los finales válidos.</>,
            <>
              Toca <B>Guardar</B>. Aparece «Pista 2: resultado guardado».
            </>,
          ]}
        />
        <ul className="ml-lista">
          <li>No deja guardar un resultado imposible con las reglas del evento.</li>
          <li>Si se definió en tie-break, puedes anotar su marcador (opcional).</li>
          <li>Si se acaba el tiempo, guarda el marcador parcial.</li>
        </ul>
        <Nota titulo="¿Te equivocaste?">
          Toca <B>Deshacer</B> en el aviso, o después <B>Editar marcador</B> en la tarjeta.
        </Nota>
        <h3>Pasar de ronda</h3>
        <p>
          Con todas las pistas cargadas, toca <B>Siguiente</B> (o <B>Finalizar</B> en la última). Puedes volver a una ronda anterior para
          corregir.
        </p>
      </>
    ),
  },
  // 14 · Cambios de plantel
  {
    seccion: "El cuadro vivo",
    cuerpo: (
      <>
        <h2>Alguien se va, alguien llega</h2>
        <div className="ml-con-captura">
          <Captura src="/manual/jugadores.webp" alt="Hoja de jugadores con opciones para retirar y sumar" />
          <div>
            <p>
              Toca <B>Jugadores</B> (o <B>Parejas</B> en Dupla fija) en la barra del evento.
            </p>
            <ul className="ml-lista">
              <li>
                <b>Retirar:</b> por lesión o porque se tuvo que ir.
              </li>
              <li>
                <b>Llegó tarde:</b> súmalo a las rondas que faltan.
              </li>
              <li>
                <b>Reincorporar:</b> vuelve quien se había retirado.
              </li>
            </ul>
            <Nota titulo="Lo jugado se respeta">
              Los resultados ya cargados no cambian. Solo se re-sortean las rondas que faltan.
            </Nota>
          </div>
        </div>
      </>
    ),
  },
  // 15 · Capítulo 5 · Ranking
  {
    tipo: "apertura",
    seccion: "Ranking y Modo TV",
    cuerpo: (
      <>
        <Apertura n="5" titulo="Ranking y Modo TV" bajada="La tabla en vivo, en el celular y en la tele del bar." />
        <div className="ml-con-captura">
          <Captura src="/manual/tabla.webp" alt="Ranking en vivo con flechas de subida y bajada" />
          <div>
            <dl className="ml-glosario">
              <dt>PJ</dt>
              <dd>Partidos jugados</dd>
              <dt>PG</dt>
              <dd>Partidos ganados</dd>
              <dt>PP</dt>
              <dd>Partidos perdidos</dd>
              <dt>PF</dt>
              <dd>Puntos a favor</dd>
              <dt>PC</dt>
              <dd>Puntos en contra</dd>
              <dt>+/-</dt>
              <dd>Diferencia</dd>
            </dl>
            <p className="ml-chico">
              Las flechas muestran quién subió o bajó. Al finalizar aparece el podio y un botón para compartir.
            </p>
          </div>
        </div>
      </>
    ),
  },
  // 16 · Modo TV
  {
    seccion: "Ranking y Modo TV",
    cuerpo: (
      <>
        <h2>Modo TV</h2>
        <Captura src="/manual/tv.webp" alt="Modo TV con pistas en juego, ranking y código QR" ancho />
        <Pasos
          items={[
            <>
              En el computador o Smart TV del club, abre el evento y toca <B>Modo TV</B>.
            </>,
            <>Ponlo en pantalla completa con el botón del Modo TV o F11.</>,
            <>Listo. La pantalla no se apaga, el cursor se esconde y el ranking cambia de página cada 12 s.</>,
          ]}
        />
      </>
    ),
  },
  // 17 · QR y espectadores
  {
    seccion: "Ranking y Modo TV",
    cuerpo: (
      <>
        <h2>El QR para los jugadores</h2>
        <p>Los jugadores no necesitan cuenta. Pueden seguir el evento de tres formas:</p>
        <ul className="ml-lista">
          <li>Escanear el QR con el logo de La Marina que sale en el Modo TV.</li>
          <li>
            Escanear el QR grande que muestras tú: botón <B>QR</B> en la barra de abajo del evento. Tocando el QR del Modo TV también se
            agranda.
          </li>
          <li>Abrir el enlace que compartes por WhatsApp.</li>
        </ul>
        <div className="ml-tarjeta ml-tarjeta-destacada">
          <b>Modo espectador</b>
          <span>
            Ven el cuadro, el ranking y su pista, pero no pueden cambiar nada. Solo el staff con sesión puede editar.
          </span>
        </div>
        <Nota titulo="Truco" tono="cielo">
          Antes de la primera ronda, muestra el QR grande en la pista central. Así todos saben a qué pista les toca sin preguntarte.
        </Nota>
      </>
    ),
  },
  // 18 · Capítulo 6 · Sin señal
  {
    tipo: "apertura",
    seccion: "Imprevistos",
    cuerpo: (
      <>
        <Apertura n="6" titulo="Sin señal y otros imprevistos" bajada="La app sigue funcionando aunque se corte internet." />
        <ul className="ml-lista">
          <li>
            <b>Sin señal:</b> sigue cargando. Todo queda guardado en el celular.
          </li>
          <li>
            <b>«N por subir»</b> en el badge: hay cambios esperando conexión. Se suben solos al volver la señal. Si no bajan, entra de nuevo
            como staff.
          </li>
          <li>
            <b>Dos celulares:</b> pueden cargar pistas distintas al mismo tiempo sin pisarse. Cada marcador guarda su carga más reciente.
          </li>
          <li>
            <b>Se fue la luz:</b> al volver, abre la app; el evento sigue donde quedó.
          </li>
        </ul>
        <Nota titulo="Borrar un evento" tono="coral">
          <B>Eliminar evento</B> pide confirmar y escribir ELIMINAR. Úsalo solo con eventos de prueba o duplicados.
        </Nota>
      </>
    ),
  },
  // 19 · Checklist de la noche
  {
    seccion: "Imprevistos",
    cuerpo: (
      <>
        <p className="ml-eyebrow">Para pegar en la recepción</p>
        <h2>La noche del americano</h2>
        <h3>Antes</h3>
        <ul className="ml-check">
          <li>Celular o tablet cargados y con sesión de staff.</li>
          <li>Mirar el cielo: si llueve, ¿Llueve? en el paso Pistas.</li>
          <li>Crear el evento con los inscritos.</li>
          <li>Abrir el Modo TV en la tele del bar.</li>
        </ul>
        <h3>Durante</h3>
        <ul className="ml-check">
          <li>Leer la regla de puntuación a los jugadores.</li>
          <li>Iniciar ronda y cargar cada pista al terminar.</li>
          <li>Siguiente cuando estén todas cargadas.</li>
        </ul>
        <h3>Al cerrar</h3>
        <ul className="ml-check">
          <li>Finalizar en la última ronda.</li>
          <li>Mostrar el podio y compartirlo.</li>
        </ul>
      </>
    ),
  },
  // 20 · Capítulo 7 · FAQ 1
  {
    tipo: "apertura",
    seccion: "Preguntas frecuentes",
    cuerpo: (
      <>
        <Apertura n="7" titulo="Preguntas frecuentes" bajada="Lo que más se pregunta en la pista." />
        <dl className="ml-faq">
          <dt>No me acepta el PIN.</dt>
          <dd>Revisa que sea el PIN vigente del club. Tras 5 intentos fallidos hay que esperar 10 minutos.</dd>
          <dt>Llegó un jugador tarde o se lesionó uno.</dt>
          <dd>Botón Jugadores en el cuadro. Se re-sortea desde la próxima ronda.</dd>
          <dt>Cargué mal un resultado.</dt>
          <dd>Deshacer en el aviso, o Editar marcador en la tarjeta de la pista. Puedes volver a rondas anteriores.</dd>
        </dl>
      </>
    ),
  },
  // 21 · FAQ 2
  {
    seccion: "Preguntas frecuentes",
    cuerpo: (
      <dl className="ml-faq">
        <dt>La app no me deja guardar un marcador.</dt>
        <dd>Ese resultado no es posible con las reglas del evento. Revisa el resumen de reglas o usa los atajos.</dd>
        <dt>La tele se ve cortada.</dt>
        <dd>Pon pantalla completa con F11 o el botón del Modo TV. La pantalla se adapta a cualquier tamaño.</dd>
        <dt>El badge dice «Demo».</dt>
        <dd>La app está en modo de prueba y no guarda en PadelReserve. Avisa a Juan.</dd>
        <dt>Me pidió el PIN otra vez.</dt>
        <dd>La sesión dura 12 horas por dispositivo. Vuelve a escribir el PIN.</dd>
        <dt>Un jugador quiere ver su pista.</dt>
        <dd>Que escanee el QR. En modo espectador ve su pista, el cuadro y el ranking.</dd>
      </dl>
    ),
  },
  // 22 · Cierre
  {
    seccion: "Fin del partido",
    cuerpo: (
      <div className="ml-cierre">
        <p className="ml-eyebrow">Fin del partido</p>
        <h2>Gracias por hacer de cada americano una buena noche.</h2>
        <p>
          ¿Algo de este libro no coincide con lo que ves en la app, o te falta una respuesta? Avísale al administrador para sumarlo a la
          próxima edición.
        </p>
        <p className="ml-chico">Datos del club como horarios, nombres de pistas y contacto se editan en Mi club.</p>
      </div>
    ),
  },
  // 23 · Contratapa
  {
    tipo: "contratapa",
    cuerpo: (
      <div className="ml-contratapa">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/isotipo-256.png" alt="" draggable={false} />
        <p>La Marina Sport Club</p>
        <p className="ml-chico">lamarinasportclub.vercel.app</p>
      </div>
    ),
  },
];
