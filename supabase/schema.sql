-- Esquema mínimo para que los endpoints funcionen con Supabase sin tocar
-- las tablas existentes de PadelReserve. Juan puede reemplazarlo por un
-- mapeo a tablas normalizadas editando lib/server/repository.ts.

create table if not exists public.americanos_eventos (
  id             text primary key,
  data           jsonb not null,            -- EventoAmericano completo (types/americano.ts)
  estado         text not null default 'BORRADOR',
  actualizado_en timestamptz not null default now()
);
create index if not exists americanos_eventos_actualizado_idx on public.americanos_eventos (actualizado_en desc);

create table if not exists public.club_config (
  id   text primary key,                     -- 'la-marina'
  data jsonb not null                        -- ConfigClub (pistas, horarios, contacto)
);

-- Los endpoints usan la service role key desde el servidor; no se expone al navegador.
alter table public.americanos_eventos enable row level security;
alter table public.club_config enable row level security;

-- Torneos (types/torneo.ts). Mismo patrón JSONB que americanos_eventos.
create table if not exists public.torneos (
  id             text primary key,
  club_id        text not null default 'la-marina',
  data           jsonb not null,            -- Torneo completo
  estado         text not null default 'INSCRIPCION',
  actualizado_en timestamptz not null default now()
);
create index if not exists torneos_club_idx on public.torneos (club_id, actualizado_en desc);

-- Marcador punto a punto de cada partido (MarcadorVivo). id = id del partido.
create table if not exists public.torneos_marcadores (
  id             text primary key,
  torneo_id      text not null references public.torneos (id) on delete cascade,
  data           jsonb not null,
  actualizado_en timestamptz not null default now()
);
create index if not exists torneos_marcadores_torneo_idx on public.torneos_marcadores (torneo_id);

-- Datos sueltos de torneos y americanos (evento_id = id del torneo o del americano):
-- plantel de árbitros del club (id 'arbitros:club', tipo 'arbitros'), foto de dupla (tipo 'foto') y foto de jugador (tipo 'foto-jugador').
-- Las fotos son JPEG de ~40-80 KB en base64; si prefieres Storage, cambia guardarExtra/obtenerExtra.
create table if not exists public.eventos_extras (
  id             text primary key,
  evento_id      text not null,
  tipo           text not null,
  data           jsonb not null,
  actualizado_en timestamptz not null default now()
);
create index if not exists eventos_extras_evento_idx on public.eventos_extras (evento_id, tipo);

alter table public.torneos enable row level security;
alter table public.torneos_marcadores enable row level security;
alter table public.eventos_extras enable row level security;

-- Ranking FVP vigente (RankingFvp en types/ranking.ts): una sola fila id = 'fvp'.
-- La llena la sincronización diaria con la hoja de la FVP o el archivo que sube el staff.
create table if not exists public.ranking_fvp (
  id             text primary key,
  data           jsonb not null,
  actualizado_en timestamptz not null default now()
);
alter table public.ranking_fvp enable row level security;
