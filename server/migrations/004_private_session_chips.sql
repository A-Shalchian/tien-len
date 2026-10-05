alter table games add column if not exists chip_rate integer not null default 0;

update games g set chip_rate = s.chip_rate
from tracker_sessions s
where s.id = g.session_id;
