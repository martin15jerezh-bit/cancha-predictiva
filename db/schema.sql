-- DOS Scout Pro relational schema.
-- Target database: PostgreSQL. The MVP UI uses local persistence, but these tables
-- are the intended backend contract for production.

create table roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (name in ('admin', 'entrenador', 'asistente', 'jugador')),
  description text not null default ''
);

create table users (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references roles(id),
  email text not null unique,
  full_name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  competition text not null,
  external_team_id text,
  name text not null,
  city text,
  zone text,
  coach text,
  primary_color text,
  secondary_color text,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition, name)
);

create table players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id),
  external_player_id text,
  name text not null,
  position text,
  jersey_number text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table games (
  id uuid primary key default gen_random_uuid(),
  competition text not null,
  external_game_id text,
  phase text,
  round text,
  game_date date,
  home_team_id uuid references teams(id),
  away_team_id uuid references teams(id),
  home_score integer,
  away_score integer,
  status text not null default 'scheduled',
  venue text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition, external_game_id)
);

create table game_sources (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id),
  source_url text not null,
  provider text not null default 'Genius Sports',
  raw_payload jsonb,
  loaded_by uuid references users(id),
  loaded_at timestamptz not null default now(),
  last_synced_at timestamptz,
  status text not null default 'processed',
  unique (source_url)
);

create table team_game_stats (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id),
  team_id uuid not null references teams(id),
  points integer,
  rebounds_offensive integer,
  rebounds_defensive integer,
  rebounds_total integer,
  assists integer,
  steals integer,
  turnovers integer,
  fouls integer,
  fg2_made integer,
  fg2_attempted integer,
  fg3_made integer,
  fg3_attempted integer,
  ft_made integer,
  ft_attempted integer,
  evidence_level text not null default 'confirmed',
  unique (game_id, team_id)
);

create table player_game_stats (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id),
  player_id uuid not null references players(id),
  team_id uuid not null references teams(id),
  started boolean,
  minutes numeric(5,2),
  points integer,
  rebounds_offensive integer,
  rebounds_defensive integer,
  rebounds_total integer,
  assists integer,
  steals integer,
  turnovers integer,
  fouls integer,
  fg2_made integer,
  fg2_attempted integer,
  fg3_made integer,
  fg3_attempted integer,
  ft_made integer,
  ft_attempted integer,
  evidence_level text not null default 'confirmed',
  unique (game_id, player_id)
);

create table quarter_stats (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id),
  team_id uuid not null references teams(id),
  quarter integer not null check (quarter between 1 and 4),
  points_for integer,
  points_against integer,
  differential integer,
  evidence_level text not null default 'confirmed',
  confidence numeric(4,3),
  unique (game_id, team_id, quarter)
);

create table inferred_rotations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id),
  generated_for_game_id uuid references games(id),
  sample_size integer not null,
  starters jsonb not null,
  first_changes jsonb not null,
  core_rotation jsonb not null,
  closers jsonb not null,
  confidence numeric(4,3) not null,
  rule_version text not null,
  generated_at timestamptz not null default now()
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references users(id),
  own_team_id uuid not null references teams(id),
  rival_team_id uuid not null references teams(id),
  game_id uuid references games(id),
  report_type text not null check (report_type in ('prepartido', 'postpartido', 'tecnico_largo', 'resumen_ejecutivo')),
  format text not null default 'markdown',
  content text not null,
  file_url text,
  created_at timestamptz not null default now()
);

create table presentations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references users(id),
  report_id uuid references reports(id),
  own_team_id uuid not null references teams(id),
  rival_team_id uuid not null references teams(id),
  sections jsonb not null,
  format text not null default 'markdown',
  file_url text,
  created_at timestamptz not null default now()
);

create table notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  team_id uuid references teams(id),
  rival_team_id uuid references teams(id),
  game_id uuid references games(id),
  player_id uuid references players(id),
  scope text not null check (scope in ('rival', 'partido', 'jugador', 'equipo')),
  title text not null,
  body text not null,
  visibility text not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  source_before jsonb,
  source_after jsonb,
  manual_reason text,
  created_at timestamptz not null default now()
);

create table profile_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  team_id uuid references teams(id),
  primary_color text,
  secondary_color text,
  notes_private_default boolean not null default true,
  rival_history jsonb not null default '[]'::jsonb,
  downloaded_reports jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, team_id)
);
