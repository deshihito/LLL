-- LLL initial database foundation
-- Apply with Supabase CLI or paste into the SQL editor.

create extension if not exists pgcrypto;

create type public.card_type as enum ('action', 'part', 'support');
create type public.skill_type as enum ('active', 'passive');
create type public.deck_card_role as enum ('action', 'part', 'support');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null default 'Player',
  avatar_url text,
  level integer not null default 1 check (level > 0),
  experience integer not null default 0 check (experience >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  card_type public.card_type not null,
  parent_card_id uuid references public.cards(id) on delete set null,
  title text not null check (char_length(title) between 1 and 120),
  description text,
  source_image_path text,
  rendered_image_path text,
  hp integer not null default 0 check (hp >= 0),
  atk integer not null default 0 check (atk >= 0),
  shield integer not null default 0 check (shield >= 0),
  speed integer not null default 0 check (speed >= 0),
  weight_ratio text not null default '1:1:1:1',
  skills jsonb not null default '[]'::jsonb,
  program_flow jsonb not null default '[]'::jsonb,
  generation_status text not null default 'draft' check (generation_status in ('draft', 'processing', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint card_part_parent_check check (card_type <> 'part' or parent_card_id is not null)
);

create table public.card_skills (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  slot smallint not null check (slot between 1 and 3),
  name text not null check (char_length(name) between 1 and 120),
  skill_type public.skill_type not null default 'active',
  power integer not null default 0 check (power between 0 and 200),
  cost integer not null default 50 check (cost >= 0),
  program_flow jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (card_id, slot)
);

create table public.decks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null default 'My Deck' check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.deck_cards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  slot_index smallint not null check (slot_index between 1 and 20),
  role public.deck_card_role not null,
  created_at timestamptz not null default now(),
  unique (deck_id, slot_index),
  unique (deck_id, card_id)
);

create index cards_owner_id_idx on public.cards(owner_id);
create index cards_parent_card_id_idx on public.cards(parent_card_id);
create index cards_type_idx on public.cards(card_type);
create index card_skills_card_id_idx on public.card_skills(card_id);
create index decks_owner_id_idx on public.decks(owner_id);
create index deck_cards_card_id_idx on public.deck_cards(card_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger cards_set_updated_at before update on public.cards
for each row execute function public.set_updated_at();
create trigger decks_set_updated_at before update on public.decks
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, avatar_url)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), nullif(new.raw_user_meta_data ->> 'full_name', ''), 'Player'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.cards enable row level security;
alter table public.card_skills enable row level security;
alter table public.decks enable row level security;
alter table public.deck_cards enable row level security;

create policy "profiles are readable by everyone"
on public.profiles for select using (true);
create policy "users update their own profile"
on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "users read their own cards"
on public.cards for select using (auth.uid() = owner_id);
create policy "users create their own cards"
on public.cards for insert with check (auth.uid() = owner_id);
create policy "users update their own cards"
on public.cards for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "users delete their own cards"
on public.cards for delete using (auth.uid() = owner_id);

create policy "users read skills on their cards"
on public.card_skills for select using (exists (select 1 from public.cards c where c.id = card_id and c.owner_id = auth.uid()));
create policy "users create skills on their cards"
on public.card_skills for insert with check (exists (select 1 from public.cards c where c.id = card_id and c.owner_id = auth.uid()));
create policy "users update skills on their cards"
on public.card_skills for update using (exists (select 1 from public.cards c where c.id = card_id and c.owner_id = auth.uid())) with check (exists (select 1 from public.cards c where c.id = card_id and c.owner_id = auth.uid()));
create policy "users delete skills on their cards"
on public.card_skills for delete using (exists (select 1 from public.cards c where c.id = card_id and c.owner_id = auth.uid()));

create policy "users read their own decks"
on public.decks for select using (auth.uid() = owner_id);
create policy "users create their own decks"
on public.decks for insert with check (auth.uid() = owner_id);
create policy "users update their own decks"
on public.decks for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "users delete their own decks"
on public.decks for delete using (auth.uid() = owner_id);

create policy "users read cards in their decks"
on public.deck_cards for select using (exists (select 1 from public.decks d where d.id = deck_id and d.owner_id = auth.uid()));
create policy "users add cards to their decks"
on public.deck_cards for insert with check (
  exists (select 1 from public.decks d where d.id = deck_id and d.owner_id = auth.uid())
  and exists (select 1 from public.cards c where c.id = card_id and c.owner_id = auth.uid())
);
create policy "users update cards in their decks"
on public.deck_cards for update using (exists (select 1 from public.decks d where d.id = deck_id and d.owner_id = auth.uid())) with check (exists (select 1 from public.decks d where d.id = deck_id and d.owner_id = auth.uid()));
create policy "users remove cards from their decks"
on public.deck_cards for delete using (exists (select 1 from public.decks d where d.id = deck_id and d.owner_id = auth.uid()));

-- Private bucket for original and rendered card images.
insert into storage.buckets (id, name, public)
values ('card-images', 'card-images', false)
on conflict (id) do nothing;

create policy "users manage their card images"
on storage.objects for all
using (bucket_id = 'card-images' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'card-images' and (storage.foldername(name))[1] = auth.uid()::text);
