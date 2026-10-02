-- Run after migrations/20261003030000_trial_battle_and_support_triggers.sql.
-- Every boolean should return true; public_cards_not_ready_actions should be zero.

select exists (
  select 1 from information_schema.columns
  where table_schema='public' and table_name='cards' and column_name='trial_public'
    and is_nullable='NO' and column_default in ('false', 'false::boolean')
) as trial_public_is_private_by_default;

select count(*) as public_cards_not_ready_actions
from public.cards
where trial_public and (card_type <> 'action' or generation_status <> 'ready');

select exists (
  select 1 from pg_constraint c
  join pg_class t on t.oid=c.conrelid
  join pg_namespace n on n.oid=t.relnamespace
  where n.nspname='public' and t.relname='cards' and c.conname='cards_parent_card_id_fkey'
    and c.contype='f' and c.confdeltype='c' and c.convalidated
) as parent_part_delete_cascades;

select exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='support_condition_matches_trigger') as trigger_condition_function_exists;
select exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='trigger_battle_supports') as support_trigger_function_exists;
select exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='resolve_battle_armed_effects') as armed_combat_effect_function_exists;
select pg_get_functiondef('public.support_condition_valid(jsonb,integer)'::regprocedure) like '%on_card_destroyed%'
  as support_schema_accepts_destruction_condition;
select pg_get_functiondef('public.trigger_battle_supports(uuid,uuid,text,uuid)'::regprocedure) like '%lll.support_trigger_seen%'
  as nested_support_resolution_is_guarded;
select pg_get_functiondef('public.apply_battle_support(uuid,uuid,uuid,jsonb)'::regprocedure) like '%on_damage_taken%'
  and pg_get_functiondef('public.apply_battle_support(uuid,uuid,uuid,jsonb)'::regprocedure) like '%on_card_destroyed%'
  as support_damage_dispatches_reactive_triggers;

select pg_get_functiondef('public.apply_battle_action(uuid,uuid,text,bigint,text,jsonb)'::regprocedure) like '%trigger_battle_supports%'
  as battle_action_rpc_calls_support_triggers;
select pg_get_functiondef('public.apply_battle_action(uuid,uuid,text,bigint,text,jsonb)'::regprocedure) like '%resolve_battle_armed_effects%'
  as battle_action_rpc_calls_armed_effect_resolver;
select pg_get_functiondef('public.matchmake_and_create_battle(uuid,uuid)'::regprocedure) like '%on_turn_start%'
  as matchmaking_runs_first_turn_supports;
