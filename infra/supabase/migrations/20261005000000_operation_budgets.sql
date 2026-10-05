-- Apply before deploying the updated upload / generation / battle APIs.
begin;
create table public.api_operation_budgets (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  operation text not null check (operation in ('card_upload', 'card_generation', 'battle_action')),
  window_start timestamptz not null,
  used integer not null check (used > 0),
  primary key (actor_id, operation, window_start)
);
create table public.api_operation_audit (
  request_id uuid primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  operation text not null,
  result text not null check (result in ('admitted', 'rate_limited')),
  created_at timestamptz not null default now()
);
create index api_operation_audit_created_idx on public.api_operation_audit(created_at desc);
alter table public.api_operation_budgets enable row level security;
alter table public.api_operation_audit enable row level security;
revoke all on public.api_operation_budgets, public.api_operation_audit from public, anon, authenticated;
grant select, insert, update, delete on public.api_operation_budgets, public.api_operation_audit to service_role;

create function public.consume_api_operation(p_actor_id uuid, p_operation text, p_request_id uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  budget integer; bucket timestamptz; used_count integer; allowed boolean;
begin
  case p_operation
    when 'card_upload' then budget := 30; bucket := date_trunc('hour', now());
    when 'card_generation' then budget := 12; bucket := date_trunc('hour', now());
    when 'battle_action' then budget := 120; bucket := date_trunc('minute', now());
    else raise exception 'UNKNOWN_OPERATION';
  end case;
  insert into public.api_operation_budgets(actor_id, operation, window_start, used)
  values (p_actor_id, p_operation, bucket, 1)
  on conflict (actor_id, operation, window_start) do update
    set used = least(public.api_operation_budgets.used + 1, budget + 1)
  returning used into used_count;
  allowed := used_count <= budget;
  insert into public.api_operation_audit(request_id, actor_id, operation, result)
  values (p_request_id, p_actor_id, p_operation, case when allowed then 'admitted' else 'rate_limited' end);
  -- Only stale buckets belonging to this actor are removed here.
  delete from public.api_operation_budgets where actor_id = p_actor_id and window_start < now() - interval '2 days';
  return allowed;
end;
$$;
revoke all on function public.consume_api_operation(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.consume_api_operation(uuid, text, uuid) to service_role;
comment on table public.api_operation_audit is 'Ingress admission audit, not action outcome or gameplay analytics. Retain 30 days with a scheduled service-role cleanup.';
commit;
