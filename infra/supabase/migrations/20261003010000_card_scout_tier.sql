-- Persist the selected scout tier so card presentation can reflect real card metadata.
-- Existing cards remain NULL: we do not infer a tier that was not recorded at creation time.
alter table public.cards
  add column if not exists scout_tier text
  check (scout_tier is null or scout_tier in ('normal', 'elite', 'legend'));

comment on column public.cards.scout_tier is
  'Scout tier selected at creation. NULL for historical cards without recorded tier.';
