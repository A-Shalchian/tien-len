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

alter table games add column if not exists client_id text;
create unique index if not exists games_client_id_idx on games (session_id, client_id) where client_id is not null;

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

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'chip_ledger'::regclass and conname = 'chip_ledger_reason_check'
      and pg_get_constraintdef(oid) like '%''refill''%'
  ) then
    alter table chip_ledger drop constraint if exists chip_ledger_reason_check;
    alter table chip_ledger add constraint chip_ledger_reason_check
      check (reason in ('signup', 'daily', 'admin', 'online', 'refill'));
  end if;
end;
$$;

create index if not exists chip_ledger_user_idx on chip_ledger (user_id);
create unique index if not exists chip_ledger_daily_once on chip_ledger (user_id, day) where reason = 'daily';
create index if not exists chip_ledger_claims_idx on chip_ledger (user_id, created_at) where reason in ('daily', 'refill');

create table if not exists profiles (
  user_id text primary key references "user"(id) on delete cascade,
  display_name text,
  hide_avatar boolean not null default false,
  hide_from_leaderboard boolean not null default false,
  private_profile boolean not null default false,
  terms_accepted_at timestamptz
);

create table if not exists online_hands (
  id text primary key,
  stake integer not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists online_hand_players (
  hand_id text not null references online_hands(id) on delete cascade,
  seat integer not null,
  user_id text references "user"(id) on delete set null,
  name text not null,
  place integer,
  points integer not null,
  chips integer not null,
  primary key (hand_id, seat)
);

create index if not exists online_hand_players_user_idx on online_hand_players (user_id);

create table if not exists admin_log (
  id bigserial primary key,
  admin_id text references "user"(id) on delete set null,
  admin_email text not null,
  action text not null,
  target text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_log_created_idx on admin_log (created_at desc);

create table if not exists emote_reviews (
  id text primary key,
  status text not null check (status in ('approved', 'rejected', 'pending')),
  updated_by text references "user"(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists user_balances (
  user_id text primary key references "user"(id) on delete cascade,
  balance integer not null default 0
);

create or replace function apply_chip_ledger() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into user_balances (user_id, balance) values (new.user_id, new.amount)
    on conflict (user_id) do update set balance = user_balances.balance + excluded.balance;
    return new;
  end if;
  update user_balances set balance = balance - old.amount where user_id = old.user_id;
  return old;
end;
$$;

lock table chip_ledger in share row exclusive mode;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'chip_ledger_balance') then
    delete from user_balances;
    insert into user_balances (user_id, balance)
      select user_id, sum(amount)::int from chip_ledger group by user_id;
  end if;
end;
$$;

create or replace trigger chip_ledger_balance
  after insert or delete on chip_ledger
  for each row execute function apply_chip_ledger();
