create table if not exists profiles (
  user_id text primary key references "user"(id) on delete cascade,
  display_name text,
  hide_avatar boolean not null default false,
  hide_from_leaderboard boolean not null default false,
  private_profile boolean not null default false,
  terms_accepted_at timestamptz
);

alter table games add column if not exists recorded_by text;
alter table games add column if not exists undone_by text;

update games g set recorded_by = s.leader_id
from tracker_sessions s
where s.id = g.session_id and g.recorded_by is null;
