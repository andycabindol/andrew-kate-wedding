-- Invitation data and replies are accessible only through the Edge Function.
create table public.wedding_invitations (
  id text primary key check (length(id) between 1 and 100),
  label text not null check (length(label) between 1 and 200),
  members jsonb not null check (jsonb_typeof(members) = 'array' and jsonb_array_length(members) between 1 and 30),
  search_names text[] not null,
  created_at timestamptz not null default now()
);
create index wedding_invitations_search_names_idx on public.wedding_invitations using gin(search_names);
create table public.wedding_rsvps (
  invitation_id text primary key references public.wedding_invitations(id) on delete restrict,
  responses jsonb not null check (jsonb_typeof(responses) = 'array' and jsonb_array_length(responses) between 1 and 30),
  wishes text not null default '' check (length(wishes) <= 2000),
  updated_at timestamptz not null default now()
);
create table public.wedding_rate_limits (
  key text primary key,
  window_start timestamptz not null,
  attempts integer not null default 1
);
alter table public.wedding_invitations enable row level security;
alter table public.wedding_rsvps enable row level security;
alter table public.wedding_rate_limits enable row level security;
revoke all on public.wedding_invitations, public.wedding_rsvps, public.wedding_rate_limits from anon, authenticated;
grant all on public.wedding_invitations, public.wedding_rsvps, public.wedding_rate_limits to service_role;

-- Atomic, bounded request counting. No raw IP addresses are retained.
create function public.wedding_check_rate_limit(p_key text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare count_now integer;
begin
  delete from public.wedding_rate_limits where window_start < now() - interval '1 day';
  insert into public.wedding_rate_limits(key, window_start, attempts)
    values (p_key, now(), 1)
  on conflict (key) do update set
    attempts = case when wedding_rate_limits.window_start < now() - interval '10 minutes' then 1 else wedding_rate_limits.attempts + 1 end,
    window_start = case when wedding_rate_limits.window_start < now() - interval '10 minutes' then now() else wedding_rate_limits.window_start end
  returning attempts into count_now;
  return count_now <= 30;
end;
$$;
revoke all on function public.wedding_check_rate_limit(text) from public, anon, authenticated;
grant execute on function public.wedding_check_rate_limit(text) to service_role;
