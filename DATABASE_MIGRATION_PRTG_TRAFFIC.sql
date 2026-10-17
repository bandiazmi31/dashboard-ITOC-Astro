-- ============================================
-- PRTG traffic history: sensors, hourly In/Out rates, sync log, and read functions.
-- Run manually in Supabase SQL Editor. Writes come only from the server (service role, which bypasses RLS).
-- Reads: any authenticated dashboard user.
-- ============================================

create table if not exists prtg_sensors (
  sensor_id  integer primary key,              -- PRTG objid
  name       text not null,
  device     text,
  grp        text,                             -- "group" is reserved in SQL
  status     text,
  updated_at timestamptz not null default now()
);

create table if not exists prtg_traffic_hourly (
  sensor_id  integer not null references prtg_sensors (sensor_id) on delete cascade,
  hour_start timestamptz not null,             -- start of the PRTG hour, UTC
  channel    text not null check (channel in ('in', 'out')),
  mbit       numeric(12, 3),                   -- Mbit/s hourly average; null = no data
  primary key (sensor_id, hour_start, channel)
);

create index if not exists prtg_traffic_hourly_hour_idx on prtg_traffic_hourly (hour_start);

create table if not exists prtg_sync_runs (
  id           bigint generated always as identity primary key,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  window_start timestamptz,
  window_end   timestamptz,
  status       text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  sensors_seen integer not null default 0,
  rows_written integer not null default 0,
  errors       jsonb not null default '[]'::jsonb
);

-- Row Level Security -------------------------------------------------------

alter table prtg_sensors        enable row level security;
alter table prtg_traffic_hourly enable row level security;
alter table prtg_sync_runs      enable row level security;

create policy "authenticated read sensors"
  on prtg_sensors for select to authenticated
  using (true);

create policy "authenticated read traffic"
  on prtg_traffic_hourly for select to authenticated
  using (true);

create policy "authenticated read sync runs"
  on prtg_sync_runs for select to authenticated
  using (true);

-- No insert, update or delete policies: only the service role writes.

-- Read functions -----------------------------------------------------------
-- These run as the caller (security invoker), so RLS applies to them too.

-- One row per hour, summed across all sensors.
create or replace function traffic_total_hourly(p_from timestamptz, p_to timestamptz)
returns table (hour_start timestamptz, in_mbit numeric, out_mbit numeric)
language sql stable
as $$
  select t.hour_start,
         sum(t.mbit) filter (where t.channel = 'in'),
         sum(t.mbit) filter (where t.channel = 'out')
  from prtg_traffic_hourly t
  where t.hour_start >= p_from and t.hour_start < p_to
  group by t.hour_start
  order by t.hour_start;
$$;

-- Top N sensors by average In + Out over the window.
create or replace function traffic_top_sensors(p_from timestamptz, p_to timestamptz, p_n integer default 10)
returns table (sensor_id integer, name text, device text, avg_in_mbit numeric, avg_out_mbit numeric)
language sql stable
as $$
  select s.sensor_id, s.name, s.device,
         avg(t.mbit) filter (where t.channel = 'in')  as avg_in_mbit,
         avg(t.mbit) filter (where t.channel = 'out') as avg_out_mbit
  from prtg_traffic_hourly t
  join prtg_sensors s on s.sensor_id = t.sensor_id
  where t.hour_start >= p_from and t.hour_start < p_to
  group by s.sensor_id, s.name, s.device
  order by coalesce(avg(t.mbit) filter (where t.channel = 'in'), 0)
         + coalesce(avg(t.mbit) filter (where t.channel = 'out'), 0) desc,
           s.name
  limit p_n;
$$;

-- Hourly In and Out for one sensor.
create or replace function traffic_sensor_series(p_sensor integer, p_from timestamptz, p_to timestamptz)
returns table (hour_start timestamptz, in_mbit numeric, out_mbit numeric)
language sql stable
as $$
  select t.hour_start,
         max(t.mbit) filter (where t.channel = 'in'),
         max(t.mbit) filter (where t.channel = 'out')
  from prtg_traffic_hourly t
  where t.sensor_id = p_sensor
    and t.hour_start >= p_from and t.hour_start < p_to
  group by t.hour_start
  order by t.hour_start;
$$;

grant execute on function traffic_total_hourly(timestamptz, timestamptz) to authenticated;
grant execute on function traffic_top_sensors(timestamptz, timestamptz, integer) to authenticated;
grant execute on function traffic_sensor_series(integer, timestamptz, timestamptz) to authenticated;
