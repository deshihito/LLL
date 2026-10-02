-- LLL user and generation foundation
-- Apply after 20261002000000_initial.sql.

create table public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  display_name text,
  timezone text not null default 'Asia/Tokyo',
  locale text not null default 'ja-JP',
  notifications_enabled boolean not null default true,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_type text not null check (notification_type in ('system', 'card_generation', 'battle', 'reward')),
  title text not null check (char_length(title) between 1 and 160),
  body text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.card_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  card_id uuid references public.cards(id) on delete set null,
  source_image_path text not null,
  provider text not null default 'gemini',
  status text not null default 'queued' check (status in ('queued', 'processing', 'succeeded', 'failed')),
  attempt_count smallint not null default 0 check (attempt_count >= 0),
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index notifications_unread_idx on public.notifications(user_id) where read_at is null;
create index generation_jobs_user_created_idx on public.card_generation_jobs(user_id, created_at desc);
create index generation_jobs_status_idx on public.card_generation_jobs(status);

create trigger user_settings_set_updated_at before update on public.user_settings
for each row execute function public.set_updated_at();
create trigger generation_jobs_set_updated_at before update on public.card_generation_jobs
for each row execute function public.set_updated_at();

-- Keep the profile and settings records aligned with Auth users.
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

  insert into public.user_settings (user_id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), nullif(new.raw_user_meta_data ->> 'full_name', '')))
  on conflict (user_id) do nothing;

  return new;
end;
$$;

alter table public.user_settings enable row level security;
alter table public.notifications enable row level security;
alter table public.card_generation_jobs enable row level security;

create policy "users read their own settings"
on public.user_settings for select using (auth.uid() = user_id);
create policy "users create their own settings"
on public.user_settings for insert with check (auth.uid() = user_id);
create policy "users update their own settings"
on public.user_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users read their own notifications"
on public.notifications for select using (auth.uid() = user_id);
create policy "users mark their own notifications"
on public.notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users read their own generation jobs"
on public.card_generation_jobs for select using (auth.uid() = user_id);
create policy "users create their own generation jobs"
on public.card_generation_jobs for insert with check (auth.uid() = user_id);
create policy "users update their own generation jobs"
on public.card_generation_jobs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Supabase's API roles need explicit table privileges in addition to RLS.
grant select, insert, update on public.user_settings to authenticated;
grant select, update on public.notifications to authenticated;
grant select, insert, update on public.card_generation_jobs to authenticated;
