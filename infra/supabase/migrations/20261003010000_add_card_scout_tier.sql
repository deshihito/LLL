-- Add the scout rank used by the card upload flow.
-- Safe to run after an older initial schema or a partially applied deployment.

alter table public.cards
  add column if not exists scout_tier text not null default 'normal';

update public.cards
set scout_tier = 'normal'
where scout_tier is null
   or scout_tier not in ('normal', 'elite', 'legend');

do $$
begin
  alter table public.cards
    add constraint cards_scout_tier_check
    check (scout_tier in ('normal', 'elite', 'legend'));
exception
  when duplicate_object then null;
end
$$;

create index if not exists cards_scout_tier_idx
  on public.cards(scout_tier);
