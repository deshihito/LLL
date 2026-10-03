-- Performance indexes and row-lock based matchmaking.
-- Apply after 20261003030000_trial_battle_and_support_triggers.sql.
create index if not exists deck_cards_deck_role_idx
  on public.deck_cards(deck_id, role);
create index if not exists matchmaking_queue_status_expires_idx
  on public.matchmaking_queue(status, expires_at, queued_at);
create index if not exists matchmaking_queue_queued_expires_idx
  on public.matchmaking_queue(expires_at, queued_at)
  where status = 'queued';

-- A per-player advisory lock makes repeated clicks/idempotent retries safe without
-- serializing unrelated players. Candidate rows remain protected by SKIP LOCKED.
create or replace function public.matchmake_and_create_battle(p_player_id uuid, p_deck_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_now timestamptz := now();
  v_expires timestamptz := v_now + interval '120 seconds';
  v_own public.matchmaking_queue%rowtype;
  v_opponent public.matchmaking_queue%rowtype;
  v_battle_id uuid;
  v_action_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('lll:matchmaking:player:' || p_player_id::text, 0));
  if not exists (select 1 from public.decks where id = p_deck_id and owner_id = p_player_id) then
    raise exception using errcode='P0001', message='DECK_NOT_OWNED';
  end if;
  select count(*) into v_action_count from public.deck_cards where deck_id = p_deck_id and role = 'action';
  if v_action_count not between 1 and 5 then
    raise exception using errcode='P0001', message='INVALID_ACTION_COUNT';
  end if;

  -- Expiry is handled by the candidate predicate; avoid updating every expired row
  -- in every request. A separate cleanup job can archive old expired rows later.
  select * into v_own from public.matchmaking_queue where player_id = p_player_id for update;
  if found and v_own.status = 'matched' and v_own.battle_id is not null then
    return jsonb_build_object('status','matched','battleId',v_own.battle_id);
  end if;

  insert into public.matchmaking_queue(player_id,deck_id,status,queued_at,expires_at,battle_id)
  values (p_player_id,p_deck_id,'queued',v_now,v_expires,null)
  on conflict (player_id) do update
    set deck_id=excluded.deck_id,status='queued',queued_at=excluded.queued_at,expires_at=excluded.expires_at,battle_id=null
    where public.matchmaking_queue.status <> 'matched';

  -- Re-read after the upsert so a matched row can never be overwritten by a retry.
  select * into v_own from public.matchmaking_queue where player_id = p_player_id for update;
  if v_own.status = 'matched' and v_own.battle_id is not null then
    return jsonb_build_object('status','matched','battleId',v_own.battle_id);
  end if;

  select * into v_opponent
    from public.matchmaking_queue
    where status='queued' and player_id<>p_player_id and expires_at>v_now
    order by queued_at asc
    limit 1
    for update skip locked;
  if not found then return jsonb_build_object('status','waiting'); end if;

  insert into public.battles(status,turn,active_player_id,started_at)
    values('active',1,p_player_id,v_now) returning id into v_battle_id;
  insert into public.battle_players(battle_id,player_id,deck_id,seat,ready_at)
    values(v_battle_id,p_player_id,p_deck_id,1,v_now),(v_battle_id,v_opponent.player_id,v_opponent.deck_id,2,v_now);
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
  perform public.trigger_battle_supports(v_battle_id,p_player_id,'on_turn_start',null);
  update public.matchmaking_queue set status='matched',battle_id=v_battle_id where player_id in(p_player_id,v_opponent.player_id);
  return jsonb_build_object('status','matched','battleId',v_battle_id);
end;
$$;
revoke all on function public.matchmake_and_create_battle(uuid,uuid) from public,anon,authenticated;
grant execute on function public.matchmake_and_create_battle(uuid,uuid) to service_role;

create or replace function public.cancel_matchmaking(p_player_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('lll:matchmaking:player:' || p_player_id::text, 0));
  update public.matchmaking_queue
    set status='cancelled'
    where player_id=p_player_id and status='queued';
  return true;
end;
$$;
revoke all on function public.cancel_matchmaking(uuid) from public,anon,authenticated;
grant execute on function public.cancel_matchmaking(uuid) to service_role;

create or replace function public.support_condition_matches_many(p_items jsonb, p_battle_id uuid, p_player_id uuid, p_turn integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_result jsonb := '{}'::jsonb;
begin
  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_result := v_result || jsonb_build_object(
      v_item->>'instanceId',
      public.support_condition_matches(
        v_item->'conditions', p_battle_id, p_player_id,
        array(select jsonb_array_elements_text(coalesce(v_item->'targetIds', '[]'::jsonb))), p_turn
      )
    );
  end loop;
  return v_result;
end;
$$;
revoke all on function public.support_condition_matches_many(jsonb,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.support_condition_matches_many(jsonb,uuid,uuid,integer) to service_role;
