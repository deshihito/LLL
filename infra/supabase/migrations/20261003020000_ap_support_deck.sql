-- LLL AP, automatic action-part expansion, and support-card foundation.
-- Apply after 20261003010000_card_scout_tier.sql.
-- Product clarification: support cards are not actors and cost 0 AP. They never use a player-shared AP pool.

alter table public.cards add column if not exists support_definition jsonb;
alter table public.battle_cards add column if not exists card_type public.card_type not null default 'action';
alter table public.battle_cards add column if not exists description text;
alter table public.battle_cards add column if not exists support_definition jsonb;
alter table public.battle_cards add column if not exists support_uses integer not null default 0 check (support_uses >= 0);
alter table public.battle_cards alter column ap set default 100;
alter table public.card_skills alter column cost set default 100;
alter table public.battle_actions drop constraint if exists battle_actions_action_type_check;
alter table public.battle_actions add constraint battle_actions_action_type_check
  check (action_type in ('use_skill', 'end_turn', 'equip_part', 'play_action', 'use_support'));

-- Existing generated active skills are upgraded; passive skills remain free.
update public.card_skills set cost = case when skill_type = 'active' then 100 else 0 end;
update public.cards c
set skills = (
  select coalesce(jsonb_agg(
    case
      when skill->>'skill_type' = 'active' then jsonb_set(skill, '{cost}', '100'::jsonb, true)
      when skill->>'skill_type' = 'passive' then jsonb_set(skill, '{cost}', '0'::jsonb, true)
      else skill
    end order by ord
  ), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(c.skills) = 'array' then c.skills else '[]'::jsonb end) with ordinality as src(skill, ord)
)
where jsonb_typeof(c.skills) = 'array';

create or replace function public.support_condition_count(p_node jsonb)
returns integer language plpgsql immutable set search_path = public as $$
declare v_total integer := 1; v_child jsonb;
begin
  if coalesce(jsonb_typeof(p_node),'') <> 'object' then return 1000; end if;
  if p_node ? 'all' or p_node ? 'any' then
    if jsonb_typeof(coalesce(p_node->'all', p_node->'any')) <> 'array' then return 1000; end if;
    for v_child in select value from jsonb_array_elements(coalesce(p_node->'all', p_node->'any')) loop
      v_total := v_total + public.support_condition_count(v_child);
    end loop;
  elsif p_node ? 'not' then
    v_total := v_total + public.support_condition_count(p_node->'not');
  end if;
  return v_total;
end;
$$;

create or replace function public.support_condition_valid(p_node jsonb, p_depth integer default 0)
returns boolean language plpgsql immutable set search_path = public as $$
declare v_child jsonb; v_type text; v_target text;
begin
  if p_depth > 3 or coalesce(jsonb_typeof(p_node),'') <> 'object' then return false; end if;
  if p_node ? 'all' and p_node ? 'any' then return false; end if;
  if p_node ? 'all' or p_node ? 'any' then
    if jsonb_typeof(coalesce(p_node->'all', p_node->'any')) <> 'array' or jsonb_array_length(coalesce(p_node->'all', p_node->'any')) < 1 then return false; end if;
    for v_child in select value from jsonb_array_elements(coalesce(p_node->'all', p_node->'any')) loop
      if not public.support_condition_valid(v_child, p_depth + 1) then return false; end if;
    end loop;
    return true;
  end if;
  if p_node ? 'not' then return public.support_condition_valid(p_node->'not', p_depth + 1); end if;
  v_type := p_node->>'type';
  v_target := p_node->>'target';
  if coalesce(v_type,'') not in ('always','on_turn_start','on_turn_end','on_attack','on_hit','on_damage_taken','hp_below','hp_above','ap_at_least','shield_broken','part_equipped','status_present','status_absent','turn_at_least') then return false; end if;
  if v_target is not null and v_target not in ('self','ally_front','ally_support','all_allies','enemy_front','enemy_support','all_enemies') then return false; end if;
  if v_type in ('hp_below','hp_above') and (jsonb_typeof(p_node->'value') is distinct from 'number' or (p_node->>'value')::numeric < 0 or (p_node->>'value')::numeric > 100) then return false; end if;
  if v_type in ('ap_at_least','turn_at_least') and (jsonb_typeof(p_node->'value') is distinct from 'number' or (p_node->>'value')::numeric < 0 or (p_node->>'value')::numeric > 1000) then return false; end if;
  if v_type in ('part_equipped','status_present','status_absent') and (length(coalesce(p_node->>'key','')) < 1 or length(p_node->>'key') > 80) then return false; end if;
  return true;
exception when others then return false;
end;
$$;

create or replace function public.is_valid_support_definition(p_definition jsonb)
returns boolean language plpgsql immutable set search_path = public as $$
declare v_effect jsonb; v_type text; v_target text;
begin
  if coalesce(jsonb_typeof(p_definition),'') <> 'object' then return false; end if;
  if coalesce((p_definition->>'version')::integer,-1) <> 1 then return false; end if;
  if coalesce(p_definition->>'timing','') not in ('on_play','on_turn_start','on_turn_end','on_damage_taken','on_card_destroyed') then return false; end if;
  if coalesce(p_definition->>'target_scope','') not in ('self','ally_front','ally_support','all_allies','enemy_front','enemy_support','all_enemies') then return false; end if;
  if jsonb_typeof(p_definition->'cost') is distinct from 'number' or (p_definition->>'cost')::integer <> 0 then return false; end if;
  if jsonb_typeof(p_definition->'consume_on_play') is distinct from 'boolean' then return false; end if;
  if jsonb_typeof(p_definition->'max_uses_per_battle') is distinct from 'number' or (p_definition->>'max_uses_per_battle')::integer not between 1 and 3 then return false; end if;
  if public.support_condition_valid(p_definition->'conditions') is not true or public.support_condition_count(p_definition->'conditions') > 12 then return false; end if;
  if jsonb_typeof(p_definition->'effects') is distinct from 'array' or jsonb_array_length(p_definition->'effects') not between 1 and 6 then return false; end if;
  for v_effect in select value from jsonb_array_elements(p_definition->'effects') loop
    v_type := v_effect->>'type'; v_target := v_effect->>'target';
    if jsonb_typeof(v_effect) <> 'object' or coalesce(v_target,'') not in ('self','ally_front','ally_support','all_allies','enemy_front','enemy_support','all_enemies') then return false; end if;
    if coalesce(v_type,'') not in ('damage','heal','stat_modifier','ap_change','shield_change','status_apply','status_remove','counter','follow_up') then return false; end if;
    if v_type in ('damage','heal','ap_change','shield_change') and jsonb_typeof(v_effect->'value') is distinct from 'number' then return false; end if;
    if v_type = 'ap_change' and v_target <> 'self' then return false; end if;
    if v_type = 'stat_modifier' and (coalesce(v_effect->>'stat','') not in ('max_hp','atk','shield','speed') or jsonb_typeof(v_effect->'value') is distinct from 'number' or coalesce((v_effect->>'duration')::integer,0) not between 1 and 5) then return false; end if;
    if v_type = 'status_apply' and (coalesce(v_effect->>'key','') not in ('stun','burn','guard_break','overdrive') or jsonb_typeof(v_effect->'value') is distinct from 'number' or coalesce((v_effect->>'duration')::integer,0) not between 1 and 5) then return false; end if;
    if v_type = 'status_remove' and coalesce(v_effect->>'key','') not in ('stun','burn','guard_break','overdrive') then return false; end if;
    if v_type = 'counter' and (coalesce(v_effect->>'trigger','') <> 'on_damage_taken' or jsonb_typeof(v_effect->'value') is distinct from 'number' or coalesce((v_effect->>'duration')::integer,0) not between 1 and 5) then return false; end if;
    if v_type = 'follow_up' and (coalesce(v_effect->>'trigger','') <> 'on_hit' or jsonb_typeof(v_effect->'value') is distinct from 'number') then return false; end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;

alter table public.cards drop constraint if exists cards_support_definition_type_check;
alter table public.cards add constraint cards_support_definition_type_check
  check (support_definition is null or (card_type = 'support' and public.is_valid_support_definition(support_definition))) not valid;
alter table public.battle_cards drop constraint if exists battle_cards_support_definition_type_check;
alter table public.battle_cards add constraint battle_cards_support_definition_type_check
  check (support_definition is null or (card_type = 'support' and public.is_valid_support_definition(support_definition))) not valid;

create or replace function public.support_condition_matches(p_node jsonb, p_battle_id uuid, p_player_id uuid, p_target_ids text[], p_turn integer)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_child jsonb; v_actor public.battle_cards%rowtype; v_type text; v_value numeric;
begin
  if p_node ? 'all' then
    for v_child in select value from jsonb_array_elements(p_node->'all') loop
      if not public.support_condition_matches(v_child,p_battle_id,p_player_id,p_target_ids,p_turn) then return false; end if;
    end loop;
    return true;
  elsif p_node ? 'any' then
    for v_child in select value from jsonb_array_elements(p_node->'any') loop
      if public.support_condition_matches(v_child,p_battle_id,p_player_id,p_target_ids,p_turn) then return true; end if;
    end loop;
    return false;
  elsif p_node ? 'not' then
    return not public.support_condition_matches(p_node->'not',p_battle_id,p_player_id,p_target_ids,p_turn);
  end if;
  v_type := p_node->>'type'; v_value := coalesce((p_node->>'value')::numeric,0);
  if v_type = 'always' then return true; end if;
  if v_type = 'turn_at_least' then return p_turn >= v_value; end if;
  select * into v_actor from public.battle_cards bc
    where bc.battle_id=p_battle_id and bc.zone='field' and not bc.defeated
      and ((cardinality(coalesce(p_target_ids,'{}'::text[])) > 0 and bc.instance_id=any(p_target_ids)) or (cardinality(coalesce(p_target_ids,'{}'::text[])) = 0 and bc.player_id=p_player_id))
    order by case when bc.player_id=p_player_id then 0 else 1 end, bc.field_index limit 1;
  if not found then return false; end if;
  if v_type = 'hp_below' then return v_actor.hp::numeric/greatest(v_actor.max_hp,1)*100 < v_value; end if;
  if v_type = 'hp_above' then return v_actor.hp::numeric/greatest(v_actor.max_hp,1)*100 > v_value; end if;
  if v_type = 'ap_at_least' then return v_actor.ap >= v_value; end if;
  if v_type = 'shield_broken' then return v_actor.def <= 0; end if;
  if v_type = 'status_present' then return exists(select 1 from jsonb_array_elements(coalesce(v_actor.statuses,'[]'::jsonb)) s where (s->>'key')=(p_node->>'key')); end if;
  if v_type = 'status_absent' then return not exists(select 1 from jsonb_array_elements(coalesce(v_actor.statuses,'[]'::jsonb)) s where (s->>'key')=(p_node->>'key')); end if;
  -- Event-trigger and part-equipment conditions are not true for a manual on-play action.
  return false;
exception when others then return false;
end;
$$;

create or replace function public.save_deck_cards(p_deck_id uuid, p_player_id uuid, p_card_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_requested record; v_card public.cards%rowtype; v_part record; v_expanded uuid[] := '{}'::uuid[]; v_action_count integer := 0;
begin
  perform 1 from public.decks where id=p_deck_id and owner_id=p_player_id for update;
  if not found then raise exception using errcode='P0001', message='DECK_NOT_OWNED'; end if;
  if cardinality(coalesce(p_card_ids,'{}'::uuid[])) > 20 then raise exception using errcode='P0001', message='TOO_MANY_REQUESTED'; end if;

  for v_requested in
    select x.id, min(x.ord) as first_ord from unnest(coalesce(p_card_ids,'{}'::uuid[])) with ordinality x(id,ord) group by x.id order by min(x.ord)
  loop
    select * into v_card from public.cards where id=v_requested.id and owner_id=p_player_id for share;
    if not found then raise exception using errcode='P0001', message='CARD_NOT_OWNED'; end if;
    if v_card.generation_status <> 'ready' then raise exception using errcode='P0001', message='CARD_NOT_READY'; end if;
    if v_card.card_type = 'part' then raise exception using errcode='P0001', message='PART_CARD_CANNOT_BE_SELECTED'; end if;
    if v_card.card_type not in ('action','support') then raise exception using errcode='P0001', message='UNSUPPORTED_CARD_TYPE'; end if;
    if v_card.card_type = 'action' then
      v_action_count := v_action_count + 1;
      if v_action_count > 5 then raise exception using errcode='P0001', message='ACTION_LIMIT'; end if;
    end if;
    v_expanded := array_append(v_expanded,v_card.id);
    if v_card.card_type = 'action' then
      for v_part in
        select id from public.cards where owner_id=p_player_id and parent_card_id=v_card.id and card_type='part' and generation_status='ready' order by created_at asc,id asc limit 2 for share
      loop
        if not v_part.id=any(v_expanded) then v_expanded := array_append(v_expanded,v_part.id); end if;
      end loop;
    end if;
    if cardinality(v_expanded) > 20 then raise exception using errcode='P0001', message='DECK_LIMIT'; end if;
  end loop;

  delete from public.deck_cards where deck_id=p_deck_id;
  insert into public.deck_cards(deck_id,card_id,slot_index,role)
    select p_deck_id,c.id,x.ord::integer,c.card_type::text::public.deck_card_role
    from unnest(v_expanded) with ordinality x(id,ord) join public.cards c on c.id=x.id;
  return coalesce((select jsonb_agg(jsonb_build_object('id',dc.id,'card_id',dc.card_id,'slot_index',dc.slot_index,'role',dc.role,'created_at',dc.created_at) order by dc.slot_index) from public.deck_cards dc where dc.deck_id=p_deck_id),'[]'::jsonb);
end;
$$;
revoke all on function public.save_deck_cards(uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.save_deck_cards(uuid,uuid,uuid[]) to service_role;

create or replace function public.matchmake_and_create_battle(p_player_id uuid, p_deck_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_now timestamptz := now(); v_expires timestamptz := v_now + interval '120 seconds'; v_own public.matchmaking_queue%rowtype; v_opponent public.matchmaking_queue%rowtype; v_battle_id uuid; v_action_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('lll:matchmaking',0));
  if not exists(select 1 from public.decks where id=p_deck_id and owner_id=p_player_id) then raise exception using errcode='P0001',message='DECK_NOT_OWNED'; end if;
  select count(*) into v_action_count from public.deck_cards where deck_id=p_deck_id and role='action';
  if v_action_count not between 1 and 5 then raise exception using errcode='P0001',message='INVALID_ACTION_COUNT'; end if;
  update public.matchmaking_queue set status='expired' where status='queued' and expires_at<=v_now;
  select * into v_own from public.matchmaking_queue where player_id=p_player_id for update;
  if found and v_own.status='matched' and v_own.battle_id is not null then return jsonb_build_object('status','matched','battleId',v_own.battle_id); end if;
  insert into public.matchmaking_queue(player_id,deck_id,status,queued_at,expires_at,battle_id) values(p_player_id,p_deck_id,'queued',v_now,v_expires,null)
    on conflict(player_id) do update set deck_id=excluded.deck_id,status='queued',queued_at=excluded.queued_at,expires_at=excluded.expires_at,battle_id=null;
  select * into v_opponent from public.matchmaking_queue where status='queued' and player_id<>p_player_id and expires_at>v_now order by queued_at asc limit 1 for update skip locked;
  if not found then return jsonb_build_object('status','waiting'); end if;
  insert into public.battles(status,turn,active_player_id,started_at) values('active',1,p_player_id,v_now) returning id into v_battle_id;
  insert into public.battle_players(battle_id,player_id,deck_id,seat,ready_at) values(v_battle_id,p_player_id,p_deck_id,1,v_now),(v_battle_id,v_opponent.player_id,v_opponent.deck_id,2,v_now);

  insert into public.battle_cards(battle_id,player_id,source_card_id,instance_id,title,description,card_type,support_definition,support_uses,zone,field_index,hp,max_hp,atk,def,speed,ap,skills)
  select v_battle_id,p_player_id,c.id,p_player_id::text||'-'||row_number() over(order by dc.slot_index),c.title,c.description,c.card_type,case when c.card_type='support' then c.support_definition else null end,0,
    case when dc.role='support' then 'hand'::public.battle_zone when dc.role='action' and row_number() over(partition by dc.role order by dc.slot_index)<=2 then 'field'::public.battle_zone else 'deck'::public.battle_zone end,
    case when dc.role='action' and row_number() over(partition by dc.role order by dc.slot_index)<=2 then row_number() over(partition by dc.role order by dc.slot_index)::smallint else null end,
    greatest(0,c.hp),greatest(0,c.hp),greatest(0,c.atk),greatest(0,c.shield),greatest(0,c.speed),case when dc.role='action' then 100 else 0 end,c.skills
  from public.deck_cards dc join public.cards c on c.id=dc.card_id where dc.deck_id=p_deck_id;
  insert into public.battle_cards(battle_id,player_id,source_card_id,instance_id,title,description,card_type,support_definition,support_uses,zone,field_index,hp,max_hp,atk,def,speed,ap,skills)
  select v_battle_id,v_opponent.player_id,c.id,v_opponent.player_id::text||'-'||row_number() over(order by dc.slot_index),c.title,c.description,c.card_type,case when c.card_type='support' then c.support_definition else null end,0,
    case when dc.role='support' then 'hand'::public.battle_zone when dc.role='action' and row_number() over(partition by dc.role order by dc.slot_index)<=2 then 'field'::public.battle_zone else 'deck'::public.battle_zone end,
    case when dc.role='action' and row_number() over(partition by dc.role order by dc.slot_index)<=2 then row_number() over(partition by dc.role order by dc.slot_index)::smallint else null end,
    greatest(0,c.hp),greatest(0,c.hp),greatest(0,c.atk),greatest(0,c.shield),greatest(0,c.speed),case when dc.role='action' then 100 else 0 end,c.skills
  from public.deck_cards dc join public.cards c on c.id=dc.card_id where dc.deck_id=v_opponent.deck_id;
  update public.matchmaking_queue set status='matched',battle_id=v_battle_id where player_id in(p_player_id,v_opponent.player_id);
  return jsonb_build_object('status','matched','battleId',v_battle_id);
end;
$$;

create or replace function public.apply_battle_support(p_battle_id uuid,p_player_id uuid,p_action_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_battle public.battles%rowtype; v_support public.battle_cards%rowtype; v_action public.battle_actions%rowtype; v_effect jsonb; v_target public.battle_cards%rowtype; v_definition jsonb; v_scope text; v_ids text[]; v_valid_count integer; v_reason text; v_seq bigint; v_type text; v_target_key text; v_amount integer; v_damage integer; v_multiplier numeric; v_source_atk integer; v_target_def integer; v_idx integer := 0; v_winner uuid; v_other uuid; v_uses integer;
begin
  select * into v_battle from public.battles where id=p_battle_id for update;
  select * into v_action from public.battle_actions where id=p_action_id;
  select * into v_support from public.battle_cards where battle_id=p_battle_id and player_id=p_player_id and instance_id=p_payload->>'supportInstanceId' and zone='hand' and card_type='support' for update;
  if not found then v_reason:='SUPPORT_NOT_AVAILABLE'; end if;
  if v_reason is null then
    v_definition:=v_support.support_definition; v_uses:=v_support.support_uses;
    if not public.is_valid_support_definition(v_definition) then v_reason:='SUPPORT_DEFINITION_INVALID';
    elsif v_support.defeated then v_reason:='SUPPORT_NOT_AVAILABLE';
    elsif (v_definition->>'timing')<>'on_play' then v_reason:='SUPPORT_TIMING_NOT_PLAYABLE';
    elsif v_uses >= (v_definition->>'max_uses_per_battle')::integer then v_reason:='SUPPORT_USE_LIMIT';
    end if;
  end if;
  if jsonb_typeof(p_payload->'targetInstanceIds')<>'array' then v_reason:=coalesce(v_reason,'SUPPORT_TARGET_INVALID');
  else
    select array_agg(value order by ord) into v_ids from jsonb_array_elements_text(p_payload->'targetInstanceIds') with ordinality x(value,ord);
    if coalesce(cardinality(v_ids),0)=0 or cardinality(v_ids)<>(select count(distinct id) from unnest(v_ids) id) then v_reason:=coalesce(v_reason,'SUPPORT_TARGET_INVALID'); end if;
  end if;
  if v_reason is null then
    v_scope:=v_definition->>'target_scope';
    select count(*) into v_valid_count from public.battle_cards bc
      where bc.battle_id=p_battle_id and bc.instance_id=any(v_ids) and bc.zone='field' and not bc.defeated and
      case v_scope
        when 'self' then bc.player_id=p_player_id and bc.field_index=1
        when 'ally_front' then bc.player_id=p_player_id and bc.field_index=1
        when 'ally_support' then bc.player_id=p_player_id and bc.field_index=2
        when 'all_allies' then bc.player_id=p_player_id
        when 'enemy_front' then bc.player_id<>p_player_id and bc.field_index=1
        when 'enemy_support' then bc.player_id<>p_player_id and bc.field_index=2
        when 'all_enemies' then bc.player_id<>p_player_id
        else false end;
    if v_valid_count<>cardinality(v_ids) then v_reason:='SUPPORT_TARGET_INVALID';
    elsif v_scope='all_allies' and v_valid_count<>(select count(*) from public.battle_cards where battle_id=p_battle_id and player_id=p_player_id and zone='field' and not defeated) then v_reason:='SUPPORT_TARGET_INVALID';
    elsif v_scope='all_enemies' and v_valid_count<>(select count(*) from public.battle_cards where battle_id=p_battle_id and player_id<>p_player_id and zone='field' and not defeated) then v_reason:='SUPPORT_TARGET_INVALID';
    elsif not public.support_condition_matches(v_definition->'conditions',p_battle_id,p_player_id,v_ids,v_battle.turn) then v_reason:='SUPPORT_CONDITION_NOT_MET';
    end if;
  end if;
  if v_reason is not null then
    update public.battle_actions set status='rejected',reject_reason=v_reason where id=p_action_id;
    select coalesce(max(sequence),0)+1 into v_seq from public.battle_events where battle_id=p_battle_id;
    insert into public.battle_events(battle_id,sequence,action_id,event_type,source_player_id,payload)
      values(p_battle_id,v_seq,p_action_id,'support_play_rejected',p_player_id,jsonb_build_object('reason',v_reason,'supportInstanceId',p_payload->>'supportInstanceId','turn',v_battle.turn));
    update public.battles set state_version=state_version+1 where id=p_battle_id;
    return jsonb_build_object('status','rejected','actionId',p_action_id,'reason',v_reason,'stateVersion',v_battle.state_version+1);
  end if;

  select coalesce(max(sequence),0)+1 into v_seq from public.battle_events where battle_id=p_battle_id;
  insert into public.battle_events(battle_id,sequence,action_id,event_type,source_player_id,payload)
    values(p_battle_id,v_seq,p_action_id,'support_play_accepted',p_player_id,jsonb_build_object('supportInstanceId',v_support.instance_id,'targetInstanceIds',to_jsonb(v_ids),'apCost',0,'turn',v_battle.turn));
  v_seq:=v_seq+1;
  select coalesce((select greatest(0,bc.atk+coalesce((select sum((s.value->>'value')::integer) from jsonb_array_elements(coalesce(bc.statuses,'[]'::jsonb)) s(value) where s.value->>'key'='modifier_atk'),0)) from public.battle_cards bc where bc.battle_id=p_battle_id and bc.player_id=p_player_id and bc.zone='field' and not bc.defeated order by bc.field_index limit 1),0) into v_source_atk;

  for v_effect in select value from jsonb_array_elements(v_definition->'effects') with ordinality x(value,ord) order by x.ord loop
    v_idx:=v_idx+1; v_type:=v_effect->>'type'; v_target_key:=v_effect->>'target'; v_amount:=coalesce((v_effect->>'value')::integer,0);
    for v_target in
      select * from public.battle_cards bc where bc.battle_id=p_battle_id and bc.instance_id=any(v_ids) and bc.zone='field' and not bc.defeated and
        case v_target_key
          when 'self' then bc.player_id=p_player_id and bc.field_index=1
          when 'ally_front' then bc.player_id=p_player_id and bc.field_index=1
          when 'ally_support' then bc.player_id=p_player_id and bc.field_index=2
          when 'all_allies' then bc.player_id=p_player_id
          when 'enemy_front' then bc.player_id<>p_player_id and bc.field_index=1
          when 'enemy_support' then bc.player_id<>p_player_id and bc.field_index=2
          when 'all_enemies' then bc.player_id<>p_player_id
          else false end
      order by bc.field_index for update
    loop
      if v_type='damage' then
        v_target_def:=greatest(0,v_target.def+coalesce((select sum((s.value->>'value')::integer) from jsonb_array_elements(coalesce(v_target.statuses,'[]'::jsonb)) s(value) where s.value->>'key'='modifier_shield'),0)); v_multiplier:=0.8+random()*0.4; v_damage:=greatest(0,ceil(((case when v_target_def>0 then v_amount*(v_source_atk::numeric/v_target_def)+v_source_atk else v_amount+v_source_atk end)*v_multiplier)/10)*10);
        update public.battle_cards set hp=greatest(0,hp-v_damage),defeated=(hp-v_damage<=0) where id=v_target.id;
        insert into public.battle_events(battle_id,sequence,action_id,event_type,source_player_id,payload) values(p_battle_id,v_seq,p_action_id,'damage_applied',p_player_id,jsonb_build_object('targetInstanceId',v_target.instance_id,'damage',v_damage,'turn',v_battle.turn,'supportInstanceId',v_support.instance_id)); v_seq:=v_seq+1;
      elsif v_type='heal' then
        v_amount:=greatest(0,v_amount); update public.battle_cards set hp=least(max_hp,hp+v_amount) where id=v_target.id;
        insert into public.battle_events(battle_id,sequence,action_id,event_type,source_player_id,payload) values(p_battle_id,v_seq,p_action_id,'heal_applied',p_player_id,jsonb_build_object('targetInstanceId',v_target.instance_id,'amount',v_amount,'turn',v_battle.turn,'supportInstanceId',v_support.instance_id)); v_seq:=v_seq+1;
      elsif v_type='ap_change' then
        update public.battle_cards set ap=greatest(0,least(1000,ap+v_amount)) where id=v_target.id;
      elsif v_type='shield_change' then
        update public.battle_cards set def=greatest(0,def+v_amount) where id=v_target.id;
      elsif v_type='status_apply' then
        update public.battle_cards set statuses=(select coalesce(jsonb_agg(s.value),'[]'::jsonb) from jsonb_array_elements(coalesce(statuses,'[]'::jsonb)) s(value) where (s.value->>'key')<>(v_effect->>'key')) || jsonb_build_array(jsonb_build_object('key',v_effect->>'key','remainingTurns',(v_effect->>'duration')::integer,'sourceActorId',v_support.instance_id,'value',v_amount)) where id=v_target.id;
      elsif v_type='status_remove' then
        update public.battle_cards set statuses=(select coalesce(jsonb_agg(s.value),'[]'::jsonb) from jsonb_array_elements(coalesce(statuses,'[]'::jsonb)) s(value) where (s.value->>'key')<>(v_effect->>'key')) where id=v_target.id;
      elsif v_type='stat_modifier' then
        update public.battle_cards set statuses=(select coalesce(jsonb_agg(s.value),'[]'::jsonb) from jsonb_array_elements(coalesce(statuses,'[]'::jsonb)) s(value) where (s.value->>'key')<>('modifier_' || (v_effect->>'stat'))) || jsonb_build_array(jsonb_build_object('key',('modifier_' || (v_effect->>'stat')),'stat',v_effect->>'stat','remainingTurns',(v_effect->>'duration')::integer,'sourceActorId',v_support.instance_id,'value',v_amount)) where id=v_target.id;
      elsif v_type='counter' or v_type='follow_up' then
        update public.battle_cards set statuses=(select coalesce(jsonb_agg(s.value),'[]'::jsonb) from jsonb_array_elements(coalesce(statuses,'[]'::jsonb)) s(value) where (s.value->>'key')<>v_type) || jsonb_build_array(jsonb_build_object('key',v_type,'trigger',v_effect->>'trigger','remainingTurns',coalesce((v_effect->>'duration')::integer,1),'sourceActorId',v_support.instance_id,'value',v_amount)) where id=v_target.id;
      end if;
      insert into public.battle_events(battle_id,sequence,action_id,event_type,source_player_id,payload)
        values(p_battle_id,v_seq,p_action_id,'support_effect_applied',p_player_id,jsonb_build_object('effectIndex',v_idx,'effectType',v_type,'targetInstanceId',v_target.instance_id,'supportInstanceId',v_support.instance_id,'turn',v_battle.turn)); v_seq:=v_seq+1;
    end loop;
  end loop;

  update public.battle_cards set support_uses=support_uses+1, zone=case when (v_definition->>'consume_on_play')::boolean then 'discard'::public.battle_zone else zone end where id=v_support.id;
  if (v_definition->>'consume_on_play')::boolean then
    insert into public.battle_events(battle_id,sequence,action_id,event_type,source_player_id,payload) values(p_battle_id,v_seq,p_action_id,'support_discarded',p_player_id,jsonb_build_object('supportInstanceId',v_support.instance_id,'turn',v_battle.turn)); v_seq:=v_seq+1;
  end if;
  update public.battle_players bp set destroyed_count=(select count(*) from public.battle_cards bc where bc.battle_id=p_battle_id and bc.player_id=bp.player_id and bc.defeated and bc.zone='field') where bp.battle_id=p_battle_id;
  select player_id into v_winner from public.battle_players where battle_id=p_battle_id and destroyed_count>=3 limit 1;
  if v_winner is not null then
    select player_id into v_other from public.battle_players where battle_id=p_battle_id and player_id<>v_winner limit 1;
    update public.battles set status='finished',winner_player_id=v_other,finished_at=now(),state_version=state_version+1 where id=p_battle_id;
    insert into public.battle_events(battle_id,sequence,action_id,event_type,source_player_id,payload) values(p_battle_id,v_seq,p_action_id,'battle_finished',p_player_id,jsonb_build_object('winnerPlayerId',v_other,'turn',v_battle.turn));
    return jsonb_build_object('status','accepted','actionId',p_action_id,'stateVersion',v_battle.state_version+1,'winnerPlayerId',v_other);
  end if;
  update public.battles set state_version=state_version+1 where id=p_battle_id;
  return jsonb_build_object('status','accepted','actionId',p_action_id,'stateVersion',v_battle.state_version+1);
end;
$$;

create or replace function public.apply_battle_action(p_battle_id uuid,p_player_id uuid,p_client_action_id text,p_expected_version bigint,p_action_type text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_battle public.battles%rowtype; v_action public.battle_actions%rowtype; v_actor public.battle_cards%rowtype; v_target public.battle_cards%rowtype; v_skill jsonb; v_effect jsonb; v_action_id uuid; v_cost integer; v_slot integer; v_amount integer; v_damage integer; v_seq bigint; v_action_count integer; v_target_key text; v_multiplier numeric; v_next_player uuid; v_winner uuid; v_before_ap integer;
begin
  if length(coalesce(p_client_action_id,'')) not between 1 and 120 then raise exception using errcode='P0001',message='INVALID_ACTION_ID'; end if;
  select * into v_battle from public.battles where id=p_battle_id for update;
  if not found or not exists(select 1 from public.battle_players where battle_id=p_battle_id and player_id=p_player_id) then raise exception using errcode='P0001',message='BATTLE_NOT_FOUND'; end if;
  select * into v_action from public.battle_actions where battle_id=p_battle_id and client_action_id=p_client_action_id;
  if found then
    if v_action.status='rejected' then return jsonb_build_object('status','rejected','actionId',v_action.id,'reason',v_action.reject_reason,'stateVersion',v_battle.state_version); end if;
    return jsonb_build_object('status','duplicate','actionId',v_action.id,'stateVersion',v_battle.state_version);
  end if;
  if v_battle.status<>'active' then raise exception using errcode='P0001',message='BATTLE_NOT_ACTIVE'; end if;
  if v_battle.state_version<>p_expected_version or v_battle.active_player_id<>p_player_id then raise exception using errcode='P0001',message='STALE_BATTLE_STATE'; end if;
  if p_action_type not in ('use_skill','end_turn','use_support') then raise exception using errcode='P0001',message='UNSUPPORTED_ACTION'; end if;
  insert into public.battle_actions(battle_id,player_id,client_action_id,expected_version,action_type,payload) values(p_battle_id,p_player_id,p_client_action_id,p_expected_version,p_action_type,p_payload) returning * into v_action;
  if p_action_type='use_support' then return public.apply_battle_support(p_battle_id,p_player_id,v_action.id,p_payload); end if;
  select coalesce(max(sequence),0)+1 into v_seq from public.battle_events where battle_id=p_battle_id;
  if p_action_type='end_turn' then
    select player_id into v_next_player from public.battle_players where battle_id=p_battle_id and player_id<>p_player_id limit 1;
    update public.battles set active_player_id=v_next_player,turn=turn+1,state_version=state_version+1 where id=p_battle_id;
    insert into public.battle_events(battle_id,sequence,action_id,event_type,source_player_id,payload) values(p_battle_id,v_seq,v_action.id,'turn_ended',p_player_id,jsonb_build_object('turn',v_battle.turn+1,'activePlayerId',v_next_player));
    v_seq:=v_seq+1;
    for v_actor in select * from public.battle_cards where battle_id=p_battle_id and player_id=v_next_player and zone='field' and not defeated order by field_index for update loop
      v_before_ap:=v_actor.ap;
      v_amount:=least(1000,v_actor.ap+greatest(0,v_actor.speed+coalesce((select sum((st.value->>'value')::integer) from jsonb_array_elements(coalesce(v_actor.statuses,'[]'::jsonb)) st(value) where st.value->>'key'='modifier_speed'),0)))-v_before_ap;
      update public.battle_cards set ap=v_before_ap+v_amount where id=v_actor.id;
      insert into public.battle_events(battle_id,sequence,action_id,event_type,source_player_id,payload) values(p_battle_id,v_seq,v_action.id,'ap_changed',v_next_player,jsonb_build_object('actorInstanceId',v_actor.instance_id,'amount',v_amount,'ap',v_before_ap+v_amount,'turn',v_battle.turn+1));
      v_seq:=v_seq+1;
    end loop;
    update public.battle_cards bc set statuses=(select coalesce(jsonb_agg(jsonb_set(s.value,'{remainingTurns}',to_jsonb((s.value->>'remainingTurns')::integer-1)) order by s.ord),'[]'::jsonb) from jsonb_array_elements(coalesce(bc.statuses,'[]'::jsonb)) with ordinality s(value,ord) where coalesce((s.value->>'remainingTurns')::integer,0)>1) where bc.battle_id=p_battle_id and bc.player_id=v_next_player and bc.zone='field';
    return jsonb_build_object('status','accepted','actionId',v_action.id,'stateVersion',v_battle.state_version+1);
  end if;
  v_slot:=greatest(1,coalesce((p_payload->>'skillSlot')::integer,1));
  select * into v_actor from public.battle_cards where battle_id=p_battle_id and player_id=p_player_id and not defeated and zone='field' and (p_payload->>'actorInstanceId' is null or instance_id=p_payload->>'actorInstanceId') order by field_index limit 1 for update;
  if not found or v_actor.defeated or v_actor.zone<>'field' then raise exception using errcode='P0001',message='ACTOR_NOT_AVAILABLE'; end if;
  select x.elem into v_skill from jsonb_array_elements(coalesce(v_actor.skills,'[]'::jsonb)) with ordinality x(elem,ord) where coalesce((x.elem->>'slot')::integer,x.ord::integer)=v_slot limit 1;
  if v_skill is null then raise exception using errcode='P0001',message='SKILL_NOT_FOUND'; end if;
  if coalesce(v_skill->>'skill_type','active')='active' then v_cost:=100; elsif v_skill->>'skill_type'='passive' then v_cost:=0; else raise exception using errcode='P0001',message='UNSUPPORTED_SKILL_TYPE'; end if;
  if v_actor.ap<v_cost then raise exception using errcode='P0001',message='NOT_ENOUGH_AP'; end if;
  update public.battle_cards set ap=ap-v_cost where id=v_actor.id;
  insert into public.battle_events(battle_id,sequence,action_id,event_type,source_player_id,payload) values(p_battle_id,v_seq,v_action.id,'action_accepted',p_player_id,jsonb_build_object('actorInstanceId',v_actor.instance_id,'skillSlot',v_slot,'apCost',v_cost,'ap',v_actor.ap-v_cost,'turn',v_battle.turn));
  v_seq:=v_seq+1;
  for v_effect in select value from jsonb_array_elements(coalesce(v_skill->'effects','[]'::jsonb)) loop
    v_target_key:=coalesce(v_effect->>'target','enemy_front');
    if v_target_key='all_enemies' then
      for v_target in select * from public.battle_cards where battle_id=p_battle_id and player_id<>p_player_id and zone='field' and not defeated order by field_index for update loop
        if v_effect->>'type'='damage' then
          v_multiplier:=0.8+random()*0.4; v_amount:=coalesce((v_effect->>'value')::integer,0); v_damage:=greatest(0,ceil(((case when v_target.def>0 then v_amount*(v_actor.atk::numeric/v_target.def)+v_actor.atk else v_amount+v_actor.atk end)*v_multiplier)/10)*10);
          update public.battle_cards set hp=greatest(0,hp-v_damage),defeated=(hp-v_damage<=0) where id=v_target.id;
          insert into public.battle_events(battle_id,sequence,action_id,event_type,source_player_id,payload) values(p_battle_id,v_seq,v_action.id,'damage_applied',p_player_id,jsonb_build_object('targetInstanceId',v_target.instance_id,'damage',v_damage,'turn',v_battle.turn)); v_seq:=v_seq+1;
        end if;
      end loop;
    else
      if v_target_key in ('self','ally_front','ally_support','all_allies') then select * into v_target from public.battle_cards where id=v_actor.id for update;
      else
        select bc.* into v_target from public.battle_cards bc where bc.battle_id=p_battle_id and bc.player_id<>p_player_id and bc.instance_id in(select jsonb_array_elements_text(coalesce(p_payload->'targetInstanceIds','[]'::jsonb))) and not bc.defeated limit 1 for update;
        if not found then select * into v_target from public.battle_cards where battle_id=p_battle_id and player_id<>p_player_id and zone='field' and not defeated order by field_index limit 1 for update; end if;
      end if;
      if v_target.id is not null then
        if v_effect->>'type'='damage' then
          v_multiplier:=0.8+random()*0.4; v_amount:=coalesce((v_effect->>'value')::integer,0); v_damage:=greatest(0,ceil(((case when v_target.def>0 then v_amount*(v_actor.atk::numeric/v_target.def)+v_actor.atk else v_amount+v_actor.atk end)*v_multiplier)/10)*10);
          update public.battle_cards set hp=greatest(0,hp-v_damage),defeated=(hp-v_damage<=0) where id=v_target.id;
          insert into public.battle_events(battle_id,sequence,action_id,event_type,source_player_id,payload) values(p_battle_id,v_seq,v_action.id,'damage_applied',p_player_id,jsonb_build_object('targetInstanceId',v_target.instance_id,'damage',v_damage,'turn',v_battle.turn)); v_seq:=v_seq+1;
        elsif v_effect->>'type'='heal' then
          v_amount:=greatest(0,coalesce((v_effect->>'value')::integer,0)); update public.battle_cards set hp=least(max_hp,hp+v_amount) where id=v_target.id;
          insert into public.battle_events(battle_id,sequence,action_id,event_type,source_player_id,payload) values(p_battle_id,v_seq,v_action.id,'heal_applied',p_player_id,jsonb_build_object('targetInstanceId',v_target.instance_id,'amount',v_amount,'turn',v_battle.turn)); v_seq:=v_seq+1;
        elsif v_effect->>'type'='ap_change' and v_target.id=v_actor.id then
          v_amount:=coalesce((v_effect->>'value')::integer,0); update public.battle_cards set ap=greatest(0,least(1000,ap+v_amount)) where id=v_target.id;
        end if;
      end if;
    end if;
  end loop;
  update public.battle_players bp set destroyed_count=(select count(*) from public.battle_cards bc where bc.battle_id=p_battle_id and bc.player_id=bp.player_id and bc.defeated and bc.zone='field') where bp.battle_id=p_battle_id;
  select player_id into v_winner from public.battle_players where battle_id=p_battle_id and destroyed_count>=3 limit 1;
  if v_winner is not null then
    select player_id into v_next_player from public.battle_players where battle_id=p_battle_id and player_id<>v_winner limit 1;
    update public.battles set status='finished',winner_player_id=v_next_player,finished_at=now(),state_version=state_version+1 where id=p_battle_id;
    insert into public.battle_events(battle_id,sequence,action_id,event_type,source_player_id,payload) values(p_battle_id,v_seq,v_action.id,'battle_finished',p_player_id,jsonb_build_object('winnerPlayerId',v_next_player,'turn',v_battle.turn));
    return jsonb_build_object('status','accepted','actionId',v_action.id,'stateVersion',v_battle.state_version+1,'winnerPlayerId',v_next_player);
  end if;
  select count(*) into v_action_count from public.battle_events where battle_id=p_battle_id and event_type='action_accepted' and payload->>'turn'=v_battle.turn::text and source_player_id=p_player_id;
  if coalesce(v_skill->>'turn_behavior','end')<>'continue' or v_action_count>=2 then
    select player_id into v_next_player from public.battle_players where battle_id=p_battle_id and player_id<>p_player_id limit 1;
    update public.battles set active_player_id=v_next_player,turn=turn+1,state_version=state_version+1 where id=p_battle_id;
    -- AP regeneration is applied before temporary stat modifiers expire.
    for v_actor in select * from public.battle_cards where battle_id=p_battle_id and player_id=v_next_player and zone='field' and not defeated order by field_index for update loop
      v_before_ap:=v_actor.ap; v_amount:=least(1000,v_actor.ap+greatest(0,v_actor.speed+coalesce((select sum((st.value->>'value')::integer) from jsonb_array_elements(coalesce(v_actor.statuses,'[]'::jsonb)) st(value) where st.value->>'key'='modifier_speed'),0)))-v_before_ap;
      update public.battle_cards set ap=v_before_ap+v_amount where id=v_actor.id;
      insert into public.battle_events(battle_id,sequence,action_id,event_type,source_player_id,payload) values(p_battle_id,v_seq,v_action.id,'ap_changed',v_next_player,jsonb_build_object('actorInstanceId',v_actor.instance_id,'amount',v_amount,'ap',v_before_ap+v_amount,'turn',v_battle.turn+1)); v_seq:=v_seq+1;
    end loop;
    update public.battle_cards bc set statuses=(select coalesce(jsonb_agg(jsonb_set(s.value,'{remainingTurns}',to_jsonb((s.value->>'remainingTurns')::integer-1)) order by s.ord),'[]'::jsonb) from jsonb_array_elements(coalesce(bc.statuses,'[]'::jsonb)) with ordinality s(value,ord) where coalesce((s.value->>'remainingTurns')::integer,0)>1) where bc.battle_id=p_battle_id and bc.player_id=v_next_player and bc.zone='field';
  else update public.battles set state_version=state_version+1 where id=p_battle_id; end if;
  return jsonb_build_object('status','accepted','actionId',v_action.id,'stateVersion',v_battle.state_version+1);
end;
$$;

revoke all on function public.matchmake_and_create_battle(uuid,uuid) from public,anon,authenticated;
revoke all on function public.apply_battle_action(uuid,uuid,text,bigint,text,jsonb) from public,anon,authenticated;
revoke all on function public.apply_battle_support(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.support_condition_matches(jsonb,uuid,uuid,text[],integer) from public,anon,authenticated;
revoke all on function public.support_condition_count(jsonb) from public,anon,authenticated;
revoke all on function public.support_condition_valid(jsonb,integer) from public,anon,authenticated;
revoke all on function public.is_valid_support_definition(jsonb) from public,anon,authenticated;
grant execute on function public.matchmake_and_create_battle(uuid,uuid) to service_role;
grant execute on function public.apply_battle_action(uuid,uuid,text,bigint,text,jsonb) to service_role;
grant execute on function public.apply_battle_support(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.support_condition_matches(jsonb,uuid,uuid,text[],integer) to service_role;
grant execute on function public.is_valid_support_definition(jsonb) to service_role;
grant execute on function public.support_condition_count(jsonb) to service_role;
grant execute on function public.support_condition_valid(jsonb,integer) to service_role;
