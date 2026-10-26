# Conexión con PadelReserve (para Juan)

> Manual completo de uso e integración: [docs/MANUAL.md](MANUAL.md)

La app funciona sola en **modo DEMO** (en memoria del servidor y en el `localStorage` de cada dispositivo). Arranca vacía; el staff carga datos de ejemplo de `data/mockData.json` con **Ajustes → Datos de prueba** (`POST /api/demo`). Para pasar a producción solo hay que conectar Supabase.

## 1. Variables de entorno (Vercel → Settings → Environment Variables)

| Variable | Uso |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase de PadelReserve |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (solo servidor) |
| `SUPABASE_AMERICANOS_TABLE` | Opcional, por defecto `americanos_eventos` |
| `SUPABASE_CLUB_TABLE` | Opcional, por defecto `club_config` |
| `SUPABASE_TORNEOS_TABLE` | Opcional, por defecto `torneos` |
| `SUPABASE_MARCADORES_TABLE` | Opcional, por defecto `torneos_marcadores` |
| `SUPABASE_EXTRAS_TABLE` | Opcional, por defecto `eventos_extras` (plantel de árbitros del club y fotos) |
| `STAFF_PIN` | PIN del staff (4 a 8 dígitos). En DEMO, si falta, es `1234`. Con Supabase, si falta, el PIN queda desactivado |
| `STAFF_SECRET` | Secreto (≥16 caracteres) para firmar la sesión de staff. **Obligatorio en producción** |
| `STAFF_EMAILS` | Opcional: correos con permiso de staff, separados por coma |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Opcional: se usa para el login con usuario de PadelReserve (si falta, usa la service role) |
| `SUPABASE_RANKING_TABLE` | Opcional, por defecto `ranking_fvp` |
| `CRON_SECRET` | Recomendado: Vercel lo manda a la sincronización diaria del ranking FVP. Sin él, `/api/ranking-fvp/sync` acepta una llamada cada 10 min |
| `FVP_SHEET_ID` / `FVP_SHEET_GIDS` | Opcional: otra hoja o pestañas (separadas por coma) si la FVP cambia el enlace |

Con las dos primeras definidas, `getRepository()` cambia de DEMO a SUPABASE automáticamente y el badge de la app pasa de "Demo" a "En línea".

## 2. Tablas

La opción rápida es correr `supabase/schema.sql`: guarda cada evento como JSONB y no toca las tablas existentes. Incluye `eventos_extras (id, evento_id, tipo, data jsonb, actualizado_en)` para el registro de árbitros y las fotos de duplas y jugadores (RLS activado; solo la usa el servidor con la service role).

Si prefieres usar las tablas normalizadas de PadelReserve (jugadores = usuarios, reservas de pista, etc.), implementa la interfaz `AmericanosRepository` en `lib/server/repository.ts`. Es lo único que hay que cambiar: el frontend solo habla con los endpoints.

```ts
interface AmericanosRepository {
  listar(): Promise<EventoAmericano[]>;
  obtener(id: string): Promise<EventoAmericano | null>;
  guardar(evento: EventoAmericano): Promise<EventoAmericano>;   // upsert por id
  eliminar(id: string): Promise<boolean>;
  obtenerClub(): Promise<ConfigClub>;
  guardarClub(club: ConfigClub): Promise<ConfigClub>;
}
```

Puntos de enganche útiles:

- `Jugador.usuarioId`: id del usuario de PadelReserve (para autocompletar jugadores y fotos con `fotoUrl`).
- `EventoAmericano.reservaIds`: reservas que bloquean las pistas del evento en PadelReserve.
- `EventoAmericano.canchas`: pistas físicas usadas (número, nombre, techada).

## 3. Permisos: solo el staff edita

- **Lectura pública:** `GET` de eventos, ranking, Modo TV y el QR. Los jugadores no necesitan cuenta.
- **Escritura solo staff:** `POST/PUT/DELETE /api/americanos*` y `POST /api/club` responden `401` sin sesión.
- **Sesión:** `POST /api/staff/login` con `{ pin }` o `{ email, password }` deja una cookie `lm_staff` httpOnly, firmada con HMAC (`STAFF_SECRET`), válida 12 h. `GET /api/staff/me` dice quién es y qué métodos de ingreso hay; `POST /api/staff/logout` la borra.
- **Usuario de PadelReserve:** se valida contra Supabase Auth (`/auth/v1/token?grant_type=password`). Entra quien tenga `app_metadata.role` (o `roles`) igual a `staff` o `admin`, o cuyo correo esté en `STAFF_EMAILS`. Para dar acceso a alguien: `update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"staff"}' where email = '…';`
- **Fuerza bruta:** 5 intentos fallidos por IP cada 10 minutos (luego `429`). En Vercel la memoria es por instancia; si quieres un límite global, muévelo a una tabla o a Upstash.
- Si el staff pierde la sesión estando sin señal, sus cambios quedan pendientes en el dispositivo y se suben al volver a ingresar.

## 4. Endpoints

| Método | Ruta | Cuerpo / respuesta |
| --- | --- | --- |
| GET | `/api/americanos` | `{ modo, eventos: EventoAmericano[] }` (sin eliminados; `?todos=1` los incluye) |
| POST | `/api/americanos` | `{ evento }` → upsert con fusión, `201` nuevo / `200` actualizado, `{ modo, evento }` |
| GET | `/api/americanos/:id` | `{ modo, evento, tabla: TablaPosiciones }` · `404` si no existe o está eliminado |
| PUT | `/api/americanos/:id` | `{ evento }` (igual que POST; el id debe coincidir con la URL) |
| DELETE | `/api/americanos/:id` | borrado lógico (`eliminado: true`), `204` |
| GET | `/api/club` | `{ modo, club: ConfigClub }` |
| POST | `/api/club` | `{ club }` → guarda si es más reciente que lo guardado |
| POST | `/api/staff/login` | `{ pin }` o `{ email, password }` → `{ staff }` + cookie |
| GET | `/api/staff/me` | `{ staff \| null, metodos: { pin, pinLargo, padelreserve } }` |
| POST | `/api/staff/logout` | borra la cookie |
| GET | `/api/torneos` | `{ modo, torneos }`. Staff: todo. Participante con clave: todo menos la clave. Sin clave: resumen con `bloqueado: true` |
| POST | `/api/torneos` | `{ torneo }` (staff) → valida, fusiona por partido y guarda |
| GET | `/api/torneos/acceso` | `{ accesos: { [torneoId]: venceISO } }` de este dispositivo |
| POST | `/api/torneos/acceso` | `{ torneoId, clave }` → cookie `lm_torneos` hasta que vence la clave. `401` clave incorrecta, `410` vencida, `429` demasiados intentos |
| GET | `/api/marcadores?torneoId=` | marcadores punto a punto del torneo (si el visitante puede verlo) |
| POST | `/api/marcadores` | `{ marcador }` (staff o árbitro del torneo) → gana el más reciente por `actualizadoEn`. Un árbitro no puede reabrir un marcador finalizado ni tocar otro torneo (`409`) |
| GET | `/api/arbitro` | `{ arbitro: { id, nombre } \| null }` (null si lo pausaron, lo borraron, cambió su código o el staff cambió el PIN de árbitros) |
| POST | `/api/arbitro` | `{ arbitroId, codigo }` → cookie `lm_arbitro` (16 h, vale en todos los torneos). `401` código incorrecto, `403` el club no tiene PIN de árbitros o el árbitro está pausado, `404` no registrado, `429` demasiados intentos |
| DELETE | `/api/arbitro` | cierra la sesión de árbitro |
| POST | `/api/arbitro/registro` | `{ pin, nombre, apellido, telefono, codigo }` (PIN de árbitros del club, código de 4 dígitos) → `201` + cookie. Mismo teléfono = cambia su código (olvidó el código). Mismo nombre con otro teléfono = `409`. Máximo 100 en el club |
| GET | `/api/arbitros[?torneoId=]` | `{ abierto, arbitros }`. Staff: plantel completo con teléfono, `activo`, partidos y puntos anotados (en ese torneo o en todos). Público (con PIN creado): solo nombre e inicial de los activos ("Carla R.") |
| PATCH | `/api/arbitros` | `{ id, activo }` (staff) → pausar o reactivar |
| DELETE | `/api/arbitros?id=` | borra al árbitro del plantel (staff); sus puntos conservan el nombre |
| GET | `/api/arbitros/pin` | `{ pin }` (staff) → PIN de árbitros del club, o `null` |
| POST | `/api/arbitros/pin` | (staff) `{ pin: "4 a 6 dígitos" }` lo fija, `{}` crea uno al azar, `{ pin: null }` cierra el registro. Cambiarlo cierra las sesiones de árbitro abiertas |
| POST | `/api/demo` | `{ accion: "cargar" \| "borrar" }` (staff) → datos de prueba (ids `demo-…`, fechas corridas a hoy) o borrado lógico de todo lo `demo-` y de los árbitros de ejemplo |
| GET | `/api/fotos?torneoId=` | `{ fotos: { [duplaId]: url } }` (con acceso al torneo) |
| POST | `/api/fotos` | `{ eventoId, tipo: "dupla" \| "jugador", id, img }` (`img` = data URL JPEG ≤450 KB) → `{ url }`. Duplas: staff o árbitro del torneo. Jugadores: solo staff (torneo o americano) |
| DELETE | `/api/fotos?eventoId=&tipo=&id=` | borra la foto (staff) |
| GET | `/api/fotos/:eventoId/:clave?v=` | la imagen (`d-<duplaId>` o `j-<jugadorId>`), con caché inmutable por versión |
| POST | `/api/torneos/:id/partidos/:pid` | `{ accion: "llamar" \| "iniciar" \| "resultado" \| "wo", … }` (staff o árbitro) → aplica la acción sobre la versión guardada y devuelve `{ torneo }` |

### Errores (siempre JSON)

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| 400 | JSON mal formado | `{ error }` |
| 401 | Sin sesión de staff (o PIN incorrecto) | `{ error }` |
| 403 | Usuario de PadelReserve sin rol staff | `{ error }` |
| 429 | Demasiados intentos de ingreso | `{ error }` |
| 404 | Evento inexistente o eliminado | `{ error }` |
| 413 | Cuerpo mayor a 1 MB | `{ error }` |
| 422 | Falla la validación | `{ error, detalles: string[] }` con cada problema en español |
| 502 | Supabase no responde o rechaza | `{ error, detalle }` |
| 500 | Cualquier otro error inesperado | `{ error, detalle }` |

La validación (`lib/validacion.ts`) revisa formato de ids, fechas y horas, rangos (pistas 1–6, hasta 48 jugadores y 30 rondas), jugadores duplicados, partidos que referencian jugadores inexistentes o repiten un jugador, y que cada marcador sea posible según el método de puntuación. Es TypeScript puro: se puede reutilizar tal cual en una Edge Function o un trigger.

## Reglas de sincronización (importante al implementar el repositorio)

1. **Nunca sobrescribir a ciegas.** Los endpoints ya hacen `fusionarEventos(guardado, entrante)` antes de `repo.guardar`. Si escribes directo a la base desde otro lado, usa la misma función.
2. **Fusión:** la estructura (rondas, ronda actual, cronómetro, plantel) viene de la versión con `actualizadoEn` más reciente; cada marcador conserva la carga más reciente según `Partido.actualizadoEn`. Así dos celulares cargando pistas distintas no se pisan, y un marcador cargado sin señal sobrevive aunque otro dispositivo ya haya avanzado la ronda.
3. **Marcas de tiempo monotónicas:** cada edición usa `despues(previa)`, que siempre es posterior a la versión editada aunque el reloj del celular esté atrasado.
4. **Borrado lógico:** `eliminado: true` es pegajoso en la fusión; una copia vieja no "resucita" un evento borrado. Si quieres borrar físicamente, hazlo con un job después de unos días.
5. **Re-sorteos:** al retirar o sumar jugadores a mitad del evento, las rondas futuras se regeneran con ids nuevos (`r5-p1-<sufijo>`), así la fusión nunca mezcla un cuadro viejo con uno nuevo.
6. **Offline:** el cliente guarda los ids con cambios sin confirmar en `pendientes` y los reenvía en cada sync y al recuperar la conexión. El servidor debe aceptar el mismo evento varias veces (es idempotente).

## Checklist para pasar a producción

- [ ] Correr `supabase/schema.sql` (o implementar `AmericanosRepository` sobre las tablas de PadelReserve).
- [ ] Definir `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en Vercel.
- [ ] Definir `STAFF_SECRET` (cadena larga aleatoria) y un `STAFF_PIN` distinto de 1234, o dar rol `staff` a los usuarios del club.
- [ ] Verificar: el badge de la app dice "En línea" y `GET /api/americanos` responde `"modo": "SUPABASE"`.
- [ ] Definir `CRON_SECRET` y revisar en Vercel → Cron Jobs que la sincronización del ranking FVP corre cada día.
- [ ] Correr `npm test` (lógica) y `node tests/e2e/robustez.e2e.mjs` contra el deploy (`APP_URL=https://…`) con una base de pruebas.


Toda la lógica de juego (rotación, validación de marcadores, tabla) es TypeScript puro en `lib/` y se puede reutilizar en el backend o en una Edge Function.

## Torneos: datos y reglas

- Tablas `torneos` y `torneos_marcadores` (JSONB, en `supabase/schema.sql`). Implementa `TorneosRepository` en `lib/server/repository.ts` si prefieres tablas normalizadas.
- Un torneo guarda categorías, duplas, cuadros (grupos y llaves), programación, bloqueos (incluidas suspensiones por lluvia), sedes, patrocinadores, historial y la clave de participantes. El marcador punto a punto vive aparte por partido para no reenviar el torneo en cada punto.
- **Fusión:** la configuración sale de la versión más reciente y cada partido conserva su versión más reciente (`fusionarTorneos`).
- **Clave:** el servidor nunca la envía a quien no es staff. La cookie `lm_torneos` guarda, por torneo, una huella de la clave vigente: si el staff la cambia, los accesos anteriores dejan de valer.
- **Árbitros:** un solo plantel del club en `eventos_extras` (id `arbitros:club`, `evento_id` `club`, tipo `arbitros`, `data = { pin, arbitros }`): el PIN de árbitros (solo staff) y por árbitro nombre, apellido, teléfono, `activo` y el código propio guardado solo como HMAC (`STAFF_SECRET`), que nunca sale del servidor. La cookie `lm_arbitro` va firmada (HMAC) con `{ arbitroId, nombre, huella del PIN, huella del código, exp }`; dura 16 h, vale en todos los torneos no eliminados y deja de valer si el staff lo pausa, lo borra o cambia el PIN. `torneo.arbitros.pin` y `vence` de versiones anteriores se ignoran. Cada punto guarda `por` (id del árbitro o `staff`) y el marcador la lista `anotadores` (relevos). Los turnos van en `torneo.arbitros.turnos` (`{ arbitroId, fecha, pista, desde, hasta }`).
- **Fotos:** también en `eventos_extras`: dupla `foto:<torneoId>:<duplaId>` (tipo `foto`), jugador `fotoj:<eventoId>:<jugadorId>` (tipo `foto-jugador`), con la imagen como data URL. La foto del jugador queda además en `jugador.fotoUrl` apuntando a `/api/fotos/...`, así sale en todo sitio con avatar. Si más adelante prefieres Supabase Storage, solo cambia `lib/server/fotos.ts` y la ruta `/api/fotos`.
- **Sesión del árbitro (detalle):** Solo puede usar `/api/torneos/:id/partidos/:pid` y `/api/marcadores` de su torneo: nunca sube el torneo entero, así no pisa cambios del staff. Un W.O. solo se acepta pasado el límite FIP; un resultado ya finalizado solo lo corrige el staff. El PIN nunca sale del servidor salvo para el staff.
- **Lógica pura reutilizable:** `lib/torneo/*` (sorteo, tablas, programación, imprevistos, marcador) no depende de React ni del servidor.

## Ranking FVP: pasos pendientes para producción (Juan)

Todo el código está listo; faltan solo estos pasos de configuración, que necesitan acceso a Vercel y Supabase:

1. **Tabla en Supabase.** En el SQL Editor de PadelReserve corre solo este bloque (también está al final de `supabase/schema.sql`):
   ```sql
   create table if not exists public.ranking_fvp (
     id             text primary key,
     data           jsonb not null,
     actualizado_en timestamptz not null default now()
   );
   alter table public.ranking_fvp enable row level security;
   ```
   Guarda una sola fila (`id = 'fvp'`) con la lista vigente (~6.300 atletas, ~1 MB de JSONB). Sin la tabla, `/api/ranking-fvp` y el guardado de torneos responden 502 en modo SUPABASE.
2. **`CRON_SECRET` en Vercel** (Settings → Environment Variables, Production): una cadena aleatoria, por ejemplo `openssl rand -hex 32`. Vercel la manda sola en `Authorization: Bearer …` al cron de `vercel.json`. Sin ella, la ruta de sincronización queda abierta (con límite de una llamada cada 10 min). Haz Redeploy después de agregarla.
3. **Revisar el cron.** Vercel → proyecto → Settings → Cron Jobs: debe aparecer `/api/ranking-fvp/sync` con `0 10 * * *` (10:00 UTC = 6:00 a. m. en Venezuela). En el plan Hobby se permite un cron diario; si se necesita más seguido, hace falta Pro.
4. **Primera sincronización.** Entra como staff a `https://lamarinasportclub.vercel.app/torneos/ranking` y toca **Sincronizar ahora**. Debe mostrar unos 6.300 atletas repartidos por categoría. Prueba también desde terminal: `curl -H "Authorization: Bearer $CRON_SECRET" https://lamarinasportclub.vercel.app/api/ranking-fvp/sync` → `{"ok":true,"total":…}`. Esto no se pudo probar en desarrollo porque ese entorno no tenía salida a Google.
5. **Si falla la descarga:** el mensaje aparece en rojo en esa pantalla. Causas probables: la FVP cambió el enlace o la hoja dejó de ser pública. Abre la hoja desde el Instagram de la FVP (@federacionpadelve, enlace "Lista de ASCENSOS y ACTUALIZACIÓN Ranking FVP"), copia el id (lo que va entre `/d/` y `/edit`) y el `gid` de la pestaña, y ponlos en `FVP_SHEET_ID` y `FVP_SHEET_GIDS` (varias pestañas separadas por coma). Mientras tanto el staff puede subir el CSV a mano (Archivo → Descargar → CSV) en la misma pantalla.
6. **Verificar el bloqueo:** en un torneo de prueba, inscribe en 4ta a alguien que la lista tenga en 2da o 3ra: debe salir en rojo y no dejar inscribir sin excepción. Prueba de navegador completa (en una base de pruebas): `APP_URL=https://… STAFF_PIN=<pin> node tests/e2e/fvp.e2e.mjs`.

Valores actuales por defecto: hoja `1lCDwPBYKAH_k2LrVq3l4MZbOaiSQx2mnek_zm96zpco`, pestaña `216230878`.

## Ranking FVP: categorías verificadas

- **Fuente:** la hoja pública "Lista de ASCENSOS y ACTUALIZACIÓN Ranking FVP" que la FVP enlaza en su Instagram. Se lee como CSV con la API de visualización de Google (`/gviz/tq?tqx=out:csv&headers=0&gid=…`), porque la FVP tiene la descarga desactivada y `/export` responde 400. `app.fvp.com.ve` no tiene API pública, por eso no se usa.
- **Cuándo:** Vercel Cron llama a `GET /api/ranking-fvp/sync` todos los días a las 10:00 UTC (6:00 a. m. en Venezuela), ver `vercel.json`. El staff también puede "Sincronizar ahora", subir el CSV o pegar las celdas en `/torneos/ranking`.
- **A prueba de cambios de la FVP:** la hoja trae varias tablas apiladas con títulos a veces mal escritos; `leerListaFvp` busca las columnas por nombre en cada tabla y usa la cédula como llave. Si la hoja deja de ser pública, falla o trae menos de la mitad de atletas que la lista vigente, se conserva la anterior y se muestra el error.
- **Regla:** en categorías por nivel (7ma a 1ra, M/F/Mixto) nadie se inscribe por debajo de su CATEGORÍA FINAL FVP; subir sí se puede. Master, Junior y libres se validan por edad, no por ranking. Quien en la FVP solo figura en una categoría por edad (Master +40/+55, Sub-13…) queda por verificar si se inscribe en una por nivel. Se apaga por torneo en Ajustes.
- **Estados por dupla (`Dupla.fvp`):** `VERIFICADA`, `POR_VERIFICAR` (sin cédula o no aparece; frena el sorteo hasta que el staff la revise), `BLOQUEADA` y `EXCEPCION` (el staff la autoriza con motivo; queda firmada con su nombre y en el historial).
- **El servidor manda:** al guardar un torneo, `POST /api/torneos` vuelve a chequear las duplas nuevas o cambiadas con la lista vigente (`revisarFvpServidor`), así un cliente no puede marcarse "verificada". Las duplas ya inscritas no se tocan si la lista cambia después.
- **Endpoints (solo staff):** `GET /api/ranking-fvp` (resumen), `?cedulas=V-1,V-2` (búsqueda), `?q=texto`; `POST /api/ranking-fvp` con `{ accion: "sincronizar" }` o `{ texto, archivo, forzar? }`.
- **Tabla:** `ranking_fvp` (una fila JSONB, en `supabase/schema.sql`).

## 5. Tiempo real

Hoy la sincronización es: mismo navegador al instante (BroadcastChannel) y otros dispositivos cada 8 s (polling a `/api/americanos`). Con Supabase se puede cambiar el polling de `components/Providers.tsx` por una suscripción Realtime a `americanos_eventos` sin tocar el resto.
