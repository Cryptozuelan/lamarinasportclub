# La Marina Sport Club · Americanos & Torneos

PWA de PadelReserve para organizar americanos y torneos de pádel en La Marina Sport Club: setup en 60 segundos, cuadro vivo con cronómetro, marcador táctil, ranking animado en tiempo real y Modo TV para las pantallas de la terraza y el bar.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Framer Motion · Lucide · Zustand. Lista para Vercel.

## Pantallas

| Ruta | Qué hace |
| --- | --- |
| `/` | Inicio: tres entradas, **Americanos**, **Torneos** y **Árbitros** |
| `/arbitro` | Panel del árbitro (tablet): se registra una sola vez en el club (nombre, teléfono, PIN de árbitros y un código propio de 4 dígitos) y sirve para todos los torneos, luego entra tocando su nombre y su código. Ve su turno y su pista, llama, empieza, anota y toma las fotos de las duplas |
| `/americanos` | Eventos activos e historial, acceso rápido a Modo TV |
| `/setup` | Asistente de 5 pasos: categoría, formato y puntuación, pistas y horario, jugadores, resumen con sorteo |
| `/evento/:id` | Cuadro vivo: rondas con hora, cronómetro con alarma, pistas activas, carga de score |
| `/evento/:id/tabla` | Podio + ranking (PJ, PG, PP, PF, PC, +/-, PTS) con animación de posiciones |
| `/evento/:id/tv` | Dashboard fullscreen 1920×1080 que se escala a cualquier pantalla, con QR para seguir el ranking |
| `/club` | Ajustes (staff): pistas, horarios por día, contacto y **claves de torneos** |
| `/torneos` | Torneos del club; crear uno nuevo (staff) |
| `/torneos/:id` | En vivo: pistas, llamados, W.O., próximos, resultados; Imprevistos (staff) |
| `/torneos/:id/categorias` | Inscritos por categoría, cabezas de serie, pegar lista, reglas y **Sorteo** |
| `/torneos/:id/cuadros` | Grupos con tabla y "¿Por qué este orden?", llaves con byes, 3er puesto, consolación |
| `/torneos/:id/programacion` | Horarios por día y pista, "¿Cuándo juego?", Programar / Desde ahora / Imprevistos |
| `/torneos/:id/partido/:partido` | Partido para los atletas (con la clave): comparativa de estadísticas, tabla por jugador y punto a punto |
| `/torneos/:id/anotar/:partido` | Anotador del árbitro o del staff: asistente previo (fotos, sorteo con la pelota según FIP, lado, quién saca), un toque por punto, detalle opcional sin barra de tiempo, saque solo y aviso de cambio de lado con cronómetro FIP (directo tras el 1-0, 1:30 en impares, 2:00 entre sets) que también sale en la TV de la pista |
| `/torneos/:id/arbitros` | Árbitros (staff): el plantel del club con lo que anotó cada uno en ese torneo, pausar o borrar, y turnos por día, franja y pista con reparto automático |
| `/torneos/:id/pista/:n` | Pantalla de la esquina de cada pista (1920×1080) para el público: marcador, datos por dupla y relato sin métricas individuales |
| `/torneos/:id/tv` | Modo TV del torneo: todas las pistas, próximos, resultados y patrocinadores |
| `/torneos/:id/estadisticas` | Rankings y ficha por jugador; resumen para el club (staff) |
| `/torneos/:id/ajustes` | Días, pistas, desempates, patrocinadores, historial y eliminar (staff) |

## Reglas soportadas

- **Categorías:** Femenino, Masculino y Mixto en 7ma, 6ta, 5ta, 4ta, 3ra y Open (Open Mixto).
- **Formatos:** Individual (americano tradicional, cambias de pareja cada ronda), Dupla fija (todos contra todos) y Mixto (como Individual, pero cada pareja es siempre hombre + mujer). Internamente Mixto = `INDIVIDUAL_ROTATIVO` + categoría `MIXTO`.
- **Puntuación:** Puntos totales (16/21/24/32), Games con punto de oro (4/6/9) y Sets cortos a 4 (1 set o mejor de 3).
- **Rotación balanceada** (`lib/rotation.ts`): nadie repite compañero mientras sea posible, se minimizan rivales repetidos, se equilibra el nivel entre parejas, los descansos se reparten parejo y en Mixto cada pareja es hombre + mujer. Es determinista por semilla.

## Torneos

- **Categorías:** 7ma a 1ra en Masculino, Femenino y Mixto, Master +40, +45 y +55 (M/F) y Junior Sub-12/13/14/16/18 (las mismas que usa la FVP), con validación de edad (año del torneo) y de género en Mixto.
- **Sorteo automático por categoría:** propone el formato según inscritos (eliminación, liga, liga + final, grupos + llave) y explica por qué; byes a los mejores sembrados; 2dos de un grupo en la mitad opuesta a su 1ro; cabezas de serie y puntos de ranking.
- **Desempates explicados:** 2 empatadas → partido entre ellas; 3 o más → sets y games entre las empatadas, luego en todo el grupo y por último sorteo registrado. El orden de criterios se ajusta por torneo.
- **Programación sin choques:** pistas, descanso mínimo (también entre categorías), dependencias de la llave, finales el último día en la pista principal, franjas bloqueadas y disponibilidad de cada dupla.
- **Imprevistos:** suspender pistas por lluvia (el partido en juego guarda su marcador y se reanuda), reanudar, sumar una sede de apoyo con su horario y tiempo de traslado, agregar un día. Todo reprograma solo.
- **Anotador punto a punto:** punto de oro, tie-break y súper tie-break, orden de saque, faltas, aces, winners y errores por jugador y golpe; estadísticas por jugador al instante.
- **Reglamento FIP (rev. 2021):** puntuación con ventaja o punto de oro (en mixto resta el del mismo sexo), mini set a 4 con tie-break 4-4, tie-break decisivo a 10 o a 7, tercer set sin tie-break; cambios de lado en games impares y cada 6 puntos del tie-break; cada dupla elige quién saca al empezar cada set; descansos de 20 s, 90 s y 120 s (sin descanso tras el primer game); W.O. a los 10 min de la hora prevista (o 5 min después de que terminó el partido anterior en la pista); peloteo de 0, 3 o 5 min al reanudar una suspensión; atención médica de 3 min una vez por jugador y accidente de hasta 15 min; tabla de penalizaciones (advertencia, pérdida de punto, descalificación) acumulada por dupla. El orden de desempate en grupos no lo fija el reglamento de juego: se configura por torneo.
- **Categorías verificadas con el ranking FVP:** la app lee cada día la lista oficial de la Federación Venezolana de Pádel y cruza a cada jugador por cédula. Nadie se inscribe por debajo de su categoría; lo dudoso queda "por verificar" y frena el sorteo hasta que el staff lo revise o autorice una excepción con motivo. Lista, búsqueda y carga manual en `/torneos/ranking`.
- **Clave de participantes:** una por torneo, vence al terminar el último día; el staff la ve y cambia en Ajustes. Cambiarla deja fuera a quien entró con la anterior.
- **Árbitros:** rol aparte del staff. El club tiene un solo PIN de árbitros, que el staff crea y cambia en Ajustes (página protegida con el PIN del staff). Sirve para que cada árbitro se registre una vez en el plantel del club; después entra con su nombre y su código en todos los torneos y únicamente puede llamar, empezar y anotar partidos: no abre cuadros, horarios ni ajustes. Cambiar el PIN cierra las sesiones abiertas. Cada árbitro se registra con nombre, apellido, teléfono y un código propio (guardado solo como HMAC), así cada punto queda firmado con su nombre y no hay "yo no fui". El staff asigna turnos por pista y franja (o los reparte solo) y ve cuántos partidos y puntos anotó cada uno.
- **Fotos de duplas y jugadores:** el árbitro (o el staff) fotografía a cada dupla en la pista; la foto sale junto a sus nombres en el anotador, la TV de la pista y la página del partido. En Americanos ("Jugadores y fotos") y en Inscritos de Torneos el staff puede fotografiar a cada jugador; su cara sale en cuadros, ranking y TV. Se comprimen en el dispositivo (≤400 KB).
- **Tres públicos:** la tablet del árbitro anota; las pantallas de TV muestran marcador y relato público; las estadísticas de cada atleta solo se ven con la clave del torneo.

## Permisos

Los jugadores ven todo sin cuenta (cuadro, ranking, Modo TV y el QR). Crear eventos, cargar marcadores y configurar el club es solo para el staff: PIN del club (demo: `1234`, cámbialo con `STAFF_PIN`) o usuario de PadelReserve con rol staff.

## Ranking del formato Individual

Al crear el evento se elige cómo suma cada jugador: **todos los puntos** de su pareja en cada partido (americano clásico, por defecto), **solo los de las rondas ganadas**, o **por victorias** (3 por ganar, 1 por empate).

## A prueba de errores

- **Dos o más celulares a la vez:** cada marcador se fusiona por partido; nadie pisa lo que cargó otro.
- **Sin señal en pista:** todo se guarda en el dispositivo y se sube solo al volver la conexión (el badge muestra cuántos cambios faltan subir).
- **Recargar o cerrar la app:** el cronómetro sigue (se basa en la hora de inicio) y el setup a medio armar se recupera.
- **Errores de carga:** marcadores imposibles bloqueados con mensaje claro, doble toque ignorado, "Deshacer" al guardar, corregir, borrar y cerrar ronda; no se puede cargar una ronda que aún no empieza.
- **Cambios de plantel:** retirar a alguien (conserva sus puntos) o sumar a quien llegó tarde; se re-sortean solo las rondas que faltan, sin repetir compañeros.
- **Borrar evento:** doble confirmación y borrado lógico que se propaga a todos los dispositivos.
- **Datos locales dañados o almacenamiento lleno:** la app arranca igual y sigue trabajando contra la API.

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 87 tests: americanos (rotación, marcadores, horarios, fusión, plantel, validación) y torneos (sorteo, desempates, programación, lluvia, sedes, anotador, reglamento FIP)
node tests/e2e/robustez.e2e.mjs   # 22 pruebas en navegador (con la app corriendo)
node tests/e2e/horario.e2e.mjs    # 18 pruebas del selector de fecha y horas (celular y computadora)
npm run typecheck
npm run build
```

Sin variables de entorno corre en **modo DEMO**, en memoria y **vacía**. Para enseñarla, el staff toca **Ajustes → Datos de prueba → Cargar datos de prueba**: crea 3 americanos, un torneo de hoy en pleno juego (clave `MARINA`) y 6 árbitros de ejemplo (código `1234`, PIN de árbitros `2468` si no había uno); **Borrar datos de prueba** los quita sin tocar lo real. Los datos salen de `data/mockData.json` (americanos: `node --experimental-strip-types scripts/generar-mock.ts`; torneo: `node --experimental-strip-types scripts/generar-torneo-demo.ts`). Las pruebas de navegador los cargan solas. Para conectar Supabase ver [docs/BACKEND.md](docs/BACKEND.md).

## Despliegue en Vercel

1. Importa el repositorio en Vercel (framework Next.js, sin configuración extra).
2. Asigna el dominio `lamarinasportclub.vercel.app` en Settings → Domains.
3. Agrega `STAFF_PIN` y `STAFF_SECRET` (y luego las de Supabase) en Settings → Environment Variables. Ver `.env.example`.

## Estructura

```
app/                 páginas y API routes (app/api/americanos, club, torneos, marcadores, staff)
components/          UI (ScoreModal, Leaderboard, Cronometro, EventoShell, …) y components/torneo/
lib/                 lógica pura: rotation, scoring, evento, horarios, store, torneosStore
lib/torneo/          categorias, cuadro, tabla, torneo, programacion, imprevistos, marcador, acceso, validacion
lib/server/          repositorio DEMO / Supabase, sesión de staff y acceso a torneos
types/               americano.ts y torneo.ts
public/              manifest.json, sw.js, iconos y logo
```
