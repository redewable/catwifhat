-- ============================================================
-- catwifhat — analytics schema for Supabase (run once in the SQL editor)
-- Creates the events table, indexes, RLS lockdown, and the aggregate
-- functions the /stats dashboard calls. All reads/writes go through the
-- service-role key inside the Vercel serverless functions, so RLS stays
-- fully closed to the public.
-- ============================================================

create table if not exists public.events (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  type          text not null,
  page          text,
  session_id    text,          -- per-tab session
  visitor_id    text,          -- stable per-browser (uniques)
  referrer      text,
  referrer_host text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  country       text,
  region        text,
  city          text,
  device        text,          -- mobile | tablet | desktop
  meta          jsonb
);

create index if not exists events_created_idx on public.events (created_at desc);
create index if not exists events_type_idx    on public.events (type);
create index if not exists events_page_idx     on public.events (page);
create index if not exists events_visitor_idx  on public.events (visitor_id);

-- Lock the table down: only the service role (used server-side) can touch it.
alter table public.events enable row level security;

-- ---- aggregate helpers (called via /rest/v1/rpc/<name>) ----

create or replace function public.stats_overview(p_since timestamptz)
returns json language sql stable as $$
  select json_build_object(
    'events',    count(*),
    'pageviews', count(*) filter (where type = 'pageview'),
    'visitors',  count(distinct visitor_id) filter (where visitor_id is not null),
    'sessions',  count(distinct session_id) filter (where session_id is not null),
    'by_type',   (select coalesce(json_object_agg(t, c), '{}'::json)
                  from (select type t, count(*) c from public.events
                        where created_at >= p_since group by type) s)
  )
  from public.events where created_at >= p_since;
$$;

create or replace function public.stats_timeseries(p_since timestamptz, p_bucket text default 'day')
returns json language sql stable as $$
  select coalesce(json_agg(row_to_json(t) order by t.bucket), '[]'::json) from (
    select date_trunc(p_bucket, created_at) as bucket,
           count(*) filter (where type = 'pageview') as views,
           count(distinct visitor_id) as visitors
    from public.events
    where created_at >= p_since
    group by 1
  ) t;
$$;

-- Top values for a whitelisted dimension (the API only ever passes safe names).
create or replace function public.stats_top(p_dim text, p_since timestamptz, p_limit int default 12)
returns json language plpgsql stable as $$
declare result json;
begin
  if p_dim not in ('page','referrer_host','country','utm_source','utm_campaign','device','type','city') then
    return '[]'::json;
  end if;
  execute format($f$
    select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
      select %1$I as label, count(*) as count,
             count(distinct visitor_id) as visitors
      from public.events
      where created_at >= $1 and %1$I is not null and %1$I <> ''
      group by 1 order by 2 desc limit $2
    ) t
  $f$, p_dim) into result using p_since, p_limit;
  return result;
end; $$;
