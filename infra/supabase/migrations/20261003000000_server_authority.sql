-- LLL server-authoritative battle boundary.
-- Apply after 20261002030000_battle_foundation.sql.
-- The API authenticates Auth.js, resolves the Supabase profile id, then calls these RPCs with service_role.

create or replace function public.matchmake_and_create_battle(p_player_id uuid, p_deck_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_expires timestamptz := v_now + interval '120 seconds';
  v_own public.matchmaking_queue%rowtype;
  v_opponent public.matchmaking_queue%rowtype;
  v_battle_id uuid;
  v_action_count integer;
  v_next_index integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('lll:matchmaking', 0));

  if not exists (select 1 from public.decks where id = p_deck_id and owner_id = p_player_id) then
    raise exception using errcode = 'P0001', message = 'DECK_NOT_OWNED';
  end if;
  select count(*) into v_action_count from public.deck_cards where deck_id = p_deck_id and role = 'action';
  if v_action_count < 1 or v_action_count > 5 then
    raise exception using errcode = 'P0001', message = 'INVALID_ACTION_COUNT';
  end if;

  update public.matchmaking_queue set status = 'expired' where status = 'queued' and expires_at <= v_now;
  select * into v_own from public.matchmaking_queue where player_id = p_player_id for update;
  if found and v_own.status = 'matched' and v_own.battle_id is not null then
    return jsonb_build_object('status', 'matched', 'battleId', v_own.battle_id);
  end if;
  insert into public.matchmaking_queue(player_id, deck_id, status, queued_at, expires_at, battle_id)
  values (p_player_id, p_deck_id, 'queued', v_now, v_expires, null)
  on conflict (player_id) do update set deck_id = excluded.deck_id, status = 'queued', queued_at = excluded.queued_at, expires_at = excluded.expires_at, battle_id = null;

  select * into v_opponent
  from public.matchmaking_queue
  where status = 'queued' and player_id <> p_player_id and expires_at > v_now
  order by queued_at asc
  limit 1
  for update skip locked;
  if not found then return jsonb_build_object('status', 'waiting'); end if;

  insert into public.battles(status, turn, active_player_id, started_at)
  values ('active', 1, p_player_id, v_now)
  returning id into v_battle_id;
  insert into public.battle_players(battle_id, player_id, deck_id, seat, ready_at)
  values (v_battle_id, p_player_id, p_deck_id, 1, v_now), (v_battle_id, v_opponent.player_id, v_opponent.deck_id, 2, v_now);

  insert into public.battle_cards(battle_id, player_id, source_card_id, instance_id, title, zone, field_index, hp, max_hp, atk, def, speed, ap, skills)
  select v_battle_id, p_player_id, c.id, p_player_id::text || '-' || row_number() over (order by dc.slot_index), c.title,
    case when dc.role = 'action' and row_number() over (partition by dc.role order by dc.slot_index) <= 2 then 'field'::public.battle_zone else 'deck'::public.battle_zone end,
    case when dc.role = 'action' and row_number() over (partition by dc.role order by dc.slot_index) <= 2 then row_number() over (partition by dc.role order by dc.slot_index)::smallint else null end,
    greatest(0,c.hp), greatest(0,c.hp), greatest(0,c.atk), greatest(0,c.shield), greatest(0,c.speed), 50, c.skills
  from public.deck_cards dc join public.cards c on c.id = dc.card_id where dc.deck_id = p_deck_id;
  insert into public.battle_cards(battle_id, player_id, source_card_id, instance_id, title, zone, field_index, hp, max_hp, atk, def, speed, ap, skills)
  select v_battle_id, v_opponent.player_id, c.id, v_opponent.player_id::text || '-' || row_number() over (order by dc.slot_index), c.title,
    case when dc.role = 'action' and row_number() over (partition by dc.role order by dc.slot_index) <= 2 then 'field'::public.battle_zone else 'deck'::public.battle_zone end,
    case when dc.role = 'action' and row_number() over (partition by dc.role order by dc.slot_index) <= 2 then row_number() over (partition by dc.role order by dc.slot_index)::smallint else null end,
    greatest(0,c.hp), greatest(0,c.hp), greatest(0,c.atk), greatest(0,c.shield), greatest(0,c.speed), 50, c.skills
  from public.deck_cards dc join public.cards c on c.id = dc.card_id where dc.deck_id = v_opponent.deck_id;

  update public.matchmaking_queue set status = 'matched', battle_id = v_battle_id where player_id in (p_player_id, v_opponent.player_id);
  return jsonb_build_object('status', 'matched', 'battleId', v_battle_id);
end;
$$;

create or replace function public.apply_battle_action(
  p_battle_id uuid, p_player_id uuid, p_client_action_id text, p_expected_version bigint,
  p_action_type text, p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_battle public.battles%rowtype;
  v_action public.battle_actions%rowtype;
  v_actor public.battle_cards%rowtype;
  v_target public.battle_cards%rowtype;
  v_skill jsonb;
  v_effect jsonb;
  v_action_id uuid;
  v_cost integer;
  v_slot integer;
  v_amount integer;
  v_damage integer;
  v_seq bigint;
  v_action_count integer;
  v_target_key text;
  v_multiplier numeric;
  v_next_player uuid;
  v_winner uuid;
begin
  if length(coalesce(p_client_action_id,'')) not between 1 and 120 then raise exception using errcode='P0001', message='INVALID_ACTION_ID'; end if;
  select * into v_battle from public.battles where id = p_battle_id for update;
  if not found or not exists (select 1 from public.battle_players where battle_id = p_battle_id and player_id = p_player_id) then raise exception using errcode='P0001', message='BATTLE_NOT_FOUND'; end if;
  select * into v_action from public.battle_actions where battle_id = p_battle_id and client_action_id = p_client_action_id;
  if found then return jsonb_build_object('status','duplicate','actionId',v_action.id,'stateVersion',v_battle.state_version); end if;
  if v_battle.status <> 'active' then raise exception using errcode='P0001', message='BATTLE_NOT_ACTIVE'; end if;
  if v_battle.state_version <> p_expected_version or v_battle.active_player_id <> p_player_id then raise exception using errcode='P0001', message='STALE_BATTLE_STATE'; end if;
  if p_action_type not in ('use_skill','end_turn') then raise exception using errcode='P0001', message='UNSUPPORTED_ACTION'; end if;

  insert into public.battle_actions(battle_id, player_id, client_action_id, expected_version, action_type, payload)
  values (p_battle_id, p_player_id, p_client_action_id, p_expected_version, p_action_type, p_payload) returning * into v_action;
  select coalesce(max(sequence),0)+1 into v_seq from public.battle_events where battle_id = p_battle_id;

  if p_action_type = 'end_turn' then
    select player_id into v_next_player from public.battle_players where battle_id = p_battle_id and player_id <> p_player_id limit 1;
    update public.battles set active_player_id=v_next_player, turn=turn+1, state_version=state_version+1 where id=p_battle_id;
    insert into public.battle_events(battle_id,sequence,action_id,event_type,source_player_id,payload) values (p_battle_id,v_seq,v_action.id,'turn_ended',p_player_id,jsonb_build_object('turn',v_battle.turn+1,'activePlayerId',v_next_player));
    return jsonb_build_object('status','accepted','actionId',v_action.id,'stateVersion',v_battle.state_version+1);
  end if;

  v_slot := greatest(1,coalesce((p_payload->>'skillSlot')::integer,1));
  select * into v_actor from public.battle_cards where battle_id=p_battle_id and player_id=p_player_id and not defeated and zone='field' and (p_payload->>'actorInstanceId' is null or instance_id=p_payload->>'actorInstanceId') order by field_index limit 1 for update;
  if not found or v_actor.defeated or v_actor.zone <> 'field' then raise exception using errcode='P0001', message='ACTOR_NOT_AVAILABLE'; end if;
  select x.elem into v_skill from jsonb_array_elements(coalesce(v_actor.skills,'[]'::jsonb)) with ordinality as x(elem,ord) where coalesce((x.elem->>'slot')::integer,x.ord::integer)=v_slot limit 1;
  if v_skill is null then raise exception using errcode='P0001', message='SKILL_NOT_FOUND'; end if;
  v_cost := coalesce((v_skill->>'cost')::integer,50);
  if v_actor.ap < v_cost then raise exception using errcode='P0001', message='NOT_ENOUGH_AP'; end if;
  update public.battle_cards set ap=ap-v_cost where id=v_actor.id;
  insert into public.battle_events(battle_id,sequence,action_id,event_type,source_player_id,payload) values (p_battle_id,v_seq,v_action.id,'action_accepted',p_player_id,jsonb_build_object('actorInstanceId',v_actor.instance_id,'skillSlot',v_slot,'ap',v_actor.ap-v_cost,'turn',v_battle.turn));
  v_seq := v_seq + 1;

  for v_effect in select value from jsonb_array_elements(coalesce(v_skill->'effects','[]'::jsonb)) loop
    v_target_key := coalesce(v_effect->>'target','enemy_front');
    if v_target_key = 'all_enemies' then
      for v_target in select * from public.battle_cards where battle_id=p_battle_id and player_id<>p_player_id and zone='field' and not defeated order by field_index for update loop
        if v_effect->>'type'='damage' then
          v_multiplier := 0.8 + random()*0.4; v_amount := coalesce((v_effect->>'value')::integer,0); v_damage := greatest(0,round(v_amount * (greatest(0, v_actor.atk)::numeric / greatest(1, v_actor.atk + v_target.def)) * v_multiplier)::integer);
          update public.battle_cards set hp=greatest(0,hp-v_damage), defeated=(hp-v_damage<=0) where id=v_target.id;
          insert into public.battle_events values (gen_random_uuid(),p_battle_id,v_seq,v_action.id,'damage_applied',p_player_id,jsonb_build_object('targetInstanceId',v_target.instance_id,'damage',v_damage,'turn',v_battle.turn),now()); v_seq:=v_seq+1;
        end if;
      end loop;
    else
      if v_target_key in ('self','ally_front','ally_support','all_allies') then
        select * into v_target from public.battle_cards where id=v_actor.id for update;
      else
        select bc.* into v_target from public.battle_cards bc where bc.battle_id=p_battle_id and bc.player_id<>p_player_id and bc.instance_id in (select jsonb_array_elements_text(coalesce(p_payload->'targetInstanceIds','[]'::jsonb))) and not bc.defeated limit 1 for update;
        if not found then select * into v_target from public.battle_cards where battle_id=p_battle_id and player_id<>p_player_id and zone='field' and not defeated order by field_index limit 1 for update; end if;
      end if;
      if v_target.id is not null then
        if v_effect->>'type'='damage' then
          v_multiplier := 0.8 + random()*0.4; v_amount := coalesce((v_effect->>'value')::integer,0); v_damage := greatest(0,round(v_amount * (greatest(0, v_actor.atk)::numeric / greatest(1, v_actor.atk + v_target.def)) * v_multiplier)::integer);
          update public.battle_cards set hp=greatest(0,hp-v_damage), defeated=(hp-v_damage<=0) where id=v_target.id;
          insert into public.battle_events values (gen_random_uuid(),p_battle_id,v_seq,v_action.id,'damage_applied',p_player_id,jsonb_build_object('targetInstanceId',v_target.instance_id,'damage',v_damage,'turn',v_battle.turn),now()); v_seq:=v_seq+1;
        elsif v_effect->>'type'='heal' then
          v_amount := greatest(0,coalesce((v_effect->>'value')::integer,0)); update public.battle_cards set hp=least(max_hp,hp+v_amount) where id=v_target.id;
          insert into public.battle_events values (gen_random_uuid(),p_battle_id,v_seq,v_action.id,'heal_applied',p_player_id,jsonb_build_object('targetInstanceId',v_target.instance_id,'amount',v_amount,'turn',v_battle.turn),now()); v_seq:=v_seq+1;
        elsif v_effect->>'type'='ap_change' and v_target.id=v_actor.id then
          v_amount := coalesce((v_effect->>'value')::integer,0); update public.battle_cards set ap=greatest(0,least(1000,ap+v_amount)) where id=v_target.id;
        end if;
      end if;
    end if;
  end loop;

  update public.battle_players bp set destroyed_count=(select count(*) from public.battle_cards bc where bc.battle_id=p_battle_id and bc.player_id=bp.player_id and bc.defeated and bc.zone='field') where battle_id=p_battle_id;
  select player_id into v_winner from public.battle_players where battle_id=p_battle_id and destroyed_count>=3 limit 1;
  if v_winner is not null then
    select player_id into v_next_player from public.battle_players where battle_id=p_battle_id and player_id<>v_winner limit 1;
    update public.battles set status='finished', winner_player_id=v_next_player, finished_at=now(), state_version=state_version+1 where id=p_battle_id;
    insert into public.battle_events values (gen_random_uuid(),p_battle_id,v_seq,v_action.id,'battle_finished',p_player_id,jsonb_build_object('winnerPlayerId',v_next_player,'turn',v_battle.turn),now());
    return jsonb_build_object('status','accepted','actionId',v_action.id,'stateVersion',v_battle.state_version+1,'winnerPlayerId',v_next_player);
  end if;
  select count(*) into v_action_count from public.battle_events where battle_id=p_battle_id and event_type='action_accepted' and payload->>'turn'=v_battle.turn::text and source_player_id=p_player_id;
  if coalesce(v_skill->>'turn_behavior','end') <> 'continue' or v_action_count >= 2 then
    select player_id into v_next_player from public.battle_players where battle_id=p_battle_id and player_id<>p_player_id limit 1;
    update public.battles set active_player_id=v_next_player, turn=turn+1, state_version=state_version+1 where id=p_battle_id;
  else
    update public.battles set state_version=state_version+1 where id=p_battle_id;
  end if;
  return jsonb_build_object('status','accepted','actionId',v_action.id,'stateVersion',v_battle.state_version+1);
end;
$$;

revoke all on function public.matchmake_and_create_battle(uuid,uuid) from public, anon, authenticated;
revoke all on function public.apply_battle_action(uuid,uuid,text,bigint,text,jsonb) from public, anon, authenticated;
grant execute on function public.matchmake_and_create_battle(uuid,uuid) to service_role;
grant execute on function public.apply_battle_action(uuid,uuid,text,bigint,text,jsonb) to service_role;

create or replace function public.cancel_matchmaking(p_player_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('lll:matchmaking', 0));
  update public.matchmaking_queue set status='cancelled' where player_id=p_player_id and status='queued';
  return true;
end;
$$;
revoke all on function public.cancel_matchmaking(uuid) from public, anon, authenticated;
grant execute on function public.cancel_matchmaking(uuid) to service_role;
