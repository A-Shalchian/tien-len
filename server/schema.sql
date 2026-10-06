create table if not exists tracker_sessions (
  id text primary key,
  name text not null,
  leader_id text not null references "user"(id),
  rules jsonb not null,
  chip_rate integer not null default 0 check (chip_rate >= 0),
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists session_players (
  id serial primary key,
  session_id text not null references tracker_sessions(id) on delete cascade,
  position integer not null,
  name text not null,
  user_id text references "user"(id),
  unique (session_id, name),
  unique (session_id, user_id)
);

create table if not exists session_members (
  session_id text not null references tracker_sessions(id) on delete cascade,
  user_id text not null references "user"(id),
  joined_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table if not exists games (
  id text primary key,
  session_id text not null references tracker_sessions(id) on delete cascade,
  data jsonb not null,
  rules jsonb not null,
  chip_rate integer not null default 0,
  recorded_by text,
  undone_by text,
  created_at timestamptz not null default now(),
  undone_at timestamptz
);

create index if not exists games_session_idx on games (session_id, created_at);

create table if not exists chip_ledger (
  id bigserial primary key,
  user_id text not null references "user"(id),
  amount integer not null,
  reason text not null,
  session_id text,
  game_id text,
  day date,
  created_at timestamptz not null default now()
);

alter table chip_ledger drop constraint if exists chip_ledger_reason_check;
alter table chip_ledger add constraint chip_ledger_reason_check
  check (reason in ('signup', 'daily', 'admin', 'online'));

create index if not exists chip_ledger_user_idx on chip_ledger (user_id);
create unique index if not exists chip_ledger_daily_once on chip_ledger (user_id, day) where reason = 'daily';

create table if not exists profiles (
  user_id text primary key references "user"(id) on delete cascade,
  display_name text,
  hide_avatar boolean not null default false,
  hide_from_leaderboard boolean not null default false,
  private_profile boolean not null default false,
  terms_accepted_at timestamptz
);
