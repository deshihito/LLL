-- LLL battle foundation
-- Apply after 20261002020000_skill_effect_schema.sql.
-- Runtime state is snapshotted so a generated card update cannot rewrite an in-progress battle.

do $$ begin
  create type public.battle_status as enum ('waiting', 'active', 'finished', 'aborted');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.battle_zone as enum ('field', 'hand', 'deck', 'discard');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.battle_action_status as enum ('accepted', 'rejected');
exception when duplicate_object then null;
end $$;

create table if not exists public.battles (
  id uuid primary key default gen_random_uuid(),
  mode text not null default 'pvp' check (mode = 'pvp'),
  status public.battle_status not null default 'waiting',
  turn integer not null default 0 check (turn >= 0),
  active_player_id uuid references public.profiles(id) on delete set null,
  winner_player_id uuid references public.profiles(id) on delete set null,
  state_version bigint not null default 1 check (state_version > 0),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.battle_players (
  battle_id uuid not null references public.battles(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  seat smallint not null check (seat in (1, 2)),
  deck_id uuid not null references public.decks(id) on delete restrict,
  destroyed_count smallint not null default 0 check (destroyed_count >= 0 and destroyed_count <= 3),
  ready_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (battle_id, player_id),
  unique (battle_id, seat),
  unique (battle_id, deck_id)
);

create table if not exists public.battle_cards (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid not null references public.battles(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  source_card_id uuid references public.cards(id) on delete set null,
  instance_id text not null,
  title text not null,
  zone public.battle_zone not null default 'deck',
  field_index smallint check (field_index is null or field_index between 1 and 2),
  hp integer not null check (hp >= 0),
  max_hp integer not null check (max_hp >= 0),
  atk integer not null check (atk >= 0),
  def integer not null check (def >= 0),
  speed integer not null check (speed >= 0),
  ap integer not null default 50 check (ap between 0 and 1000),
  defeated boolean not null default false,
  statuses jsonb not null default '[]'::jsonb,
  skills jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (battle_id, instance_id),
  constraint battle_card_field_index_check check ((zone = 'field') = (field_index is not null)),
  constraint battle_card_hp_check check (hp <= max_hp)
);

create table if not exists public.battle_actions (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid not null references public.battles(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  client_action_id text not null check (char_length(client_action_id) between 1 and 120),
  expected_version bigint not null check (expected_version > 0),
  action_type text not null check (action_type in ('use_skill', 'end_turn', 'equip_part', 'play_action')),
  status public.battle_action_status not null default 'accepted',
  reject_reason text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (battle_id, client_action_id)
);

create table if not exists public.battle_events (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid not null references public.battles(id) on delete cascade,
  sequence bigint not null check (sequence > 0),
  action_id uuid references public.battle_actions(id) on delete set null,
  event_type text not null,
  source_player_id uuid references public.profiles(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (battle_id, sequence)
);

create table if not exists public.matchmaking_queue (
  player_id uuid primary key references public.profiles(id) on delete cascade,
  deck_id uuid not null references public.decks(id) on delete restrict,
  status text not null default 'queued' check (status in ('queued', 'matched', 'cancelled', 'expired')),
  queued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  battle_id uuid references public.battles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists battles_status_created_idx on public.battles(status, created_at desc);
create index if not exists battle_players_player_idx on public.battle_players(player_id, joined_at desc);
create index if not exists battle_cards_battle_zone_idx on public.battle_cards(battle_id, zone);
create index if not exists battle_actions_battle_created_idx on public.battle_actions(battle_id, created_at);
create index if not exists battle_events_battle_sequence_idx on public.battle_events(battle_id, sequence);
create index if not exists matchmaking_queue_status_idx on public.matchmaking_queue(status, queued_at);

create or replace function public.is_battle_participant(p_battle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.battle_players
    where battle_id = p_battle_id and player_id = auth.uid()
  );
$$;

drop trigger if exists battles_set_updated_at on public.battles;
create trigger battles_set_updated_at before update on public.battles
for each row execute function public.set_updated_at();
drop trigger if exists battle_cards_set_updated_at on public.battle_cards;
create trigger battle_cards_set_updated_at before update on public.battle_cards
for each row execute function public.set_updated_at();
drop trigger if exists matchmaking_queue_set_updated_at on public.matchmaking_queue;
create trigger matchmaking_queue_set_updated_at before update on public.matchmaking_queue
for each row execute function public.set_updated_at();

alter table public.battles enable row level security;
alter table public.battle_players enable row level security;
alter table public.battle_cards enable row level security;
alter table public.battle_actions enable row level security;
alter table public.battle_events enable row level security;
alter table public.matchmaking_queue enable row level security;

drop policy if exists "participants read battles" on public.battles;
create policy "participants read battles"
on public.battles for select using (public.is_battle_participant(id));

drop policy if exists "participants read battle players" on public.battle_players;
create policy "participants read battle players"
on public.battle_players for select using (player_id = auth.uid() or public.is_battle_participant(battle_id));

drop policy if exists "participants read battle cards" on public.battle_cards;
create policy "participants read battle cards"
on public.battle_cards for select using (public.is_battle_participant(battle_id));

drop policy if exists "participants create battle actions" on public.battle_actions;
create policy "participants create battle actions"
on public.battle_actions for insert with check (player_id = auth.uid() and public.is_battle_participant(battle_id));

drop policy if exists "participants read battle actions" on public.battle_actions;
create policy "participants read battle actions"
on public.battle_actions for select using (public.is_battle_participant(battle_id));

drop policy if exists "participants read battle events" on public.battle_events;
create policy "participants read battle events"
on public.battle_events for select using (public.is_battle_participant(battle_id));

drop policy if exists "users manage own matchmaking entry" on public.matchmaking_queue;
create policy "users manage own matchmaking entry"
on public.matchmaking_queue for all using (player_id = auth.uid()) with check (player_id = auth.uid());

grant select on public.battles, public.battle_players, public.battle_cards, public.battle_actions, public.battle_events to authenticated;
grant insert on public.battle_actions to authenticated;
grant select, insert, update, delete on public.matchmaking_queue to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.battle_events;
exception when duplicate_object then null;
end $$;
