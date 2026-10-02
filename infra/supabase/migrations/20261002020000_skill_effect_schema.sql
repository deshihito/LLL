-- LLL extensible skill effect schema
-- Apply after 20261002010000_user_and_generation_foundation.sql.

alter table public.card_skills
  add column if not exists description text not null default '',
  add column if not exists conditions jsonb not null default '{"all":[{"type":"always"}]}'::jsonb,
  add column if not exists effects jsonb not null default '[]'::jsonb,
  add column if not exists schema_version smallint not null default 1;

create index if not exists card_skills_schema_version_idx on public.card_skills(schema_version);

comment on column public.card_skills.conditions is 'Validated condition tree: all/any/not with max depth 3 and max 12 nodes.';
comment on column public.card_skills.effects is 'Validated ordered effect list; max 6 effects per skill.';
comment on column public.card_skills.schema_version is 'Skill effect schema version for future migrations.';
