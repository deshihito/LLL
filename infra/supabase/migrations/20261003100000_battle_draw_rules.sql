-- Common card-game draw rules: four cards at battle start and one card at each turn start.
create or replace function public.draw_battle_cards(p_battle_id uuid,p_player_id uuid,p_amount integer default 1)
returns integer language plpgsql security definer set search_path = public as $$
declare v_card public.battle_cards%rowtype; v_drawn integer := 0;
begin
  for v_card in
    select * from public.battle_cards
    where battle_id=p_battle_id and player_id=p_player_id and zone='deck'
    order by coalesce(nullif(substring(instance_id from '[0-9]+$'),'')::integer,2147483647), id
    limit greatest(coalesce(p_amount,0),0)
    for update
  loop
    update public.battle_cards set zone='hand',field_index=null where id=v_card.id;
    v_drawn := v_drawn + 1;
  end loop;
  return v_drawn;
end;
$$;

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
    case when dc.role='action' and row_number() over(partition by dc.role order by dc.slot_index)<=2 then 'field'::public.battle_zone else 'deck'::public.battle_zone end,
    case when dc.role='action' and row_number() over(partition by dc.role order by dc.slot_index)<=2 then row_number() over(partition by dc.role order by dc.slot_index)::smallint else null end,
    greatest(0,c.hp),greatest(0,c.hp),greatest(0,c.atk),greatest(0,c.shield),greatest(0,c.speed),case when dc.role='action' then 100 else 0 end,c.skills
  from public.deck_cards dc join public.cards c on c.id=dc.card_id where dc.deck_id=p_deck_id;
  insert into public.battle_cards(battle_id,player_id,source_card_id,instance_id,title,description,card_type,support_definition,support_uses,zone,field_index,hp,max_hp,atk,def,speed,ap,skills)
  select v_battle_id,v_opponent.player_id,c.id,v_opponent.player_id::text||'-'||row_number() over(order by dc.slot_index),c.title,c.description,c.card_type,case when c.card_type='support' then c.support_definition else null end,0,
    case when dc.role='action' and row_number() over(partition by dc.role order by dc.slot_index)<=2 then 'field'::public.battle_zone else 'deck'::public.battle_zone end,
    case when dc.role='action' and row_number() over(partition by dc.role order by dc.slot_index)<=2 then row_number() over(partition by dc.role order by dc.slot_index)::smallint else null end,
    greatest(0,c.hp),greatest(0,c.hp),greatest(0,c.atk),greatest(0,c.shield),greatest(0,c.speed),case when dc.role='action' then 100 else 0 end,c.skills
  from public.deck_cards dc join public.cards c on c.id=dc.card_id where dc.deck_id=v_opponent.deck_id;
  perform public.draw_battle_cards(v_battle_id,p_player_id,4);
  perform public.draw_battle_cards(v_battle_id,v_opponent.player_id,4);
  perform public.trigger_battle_supports(v_battle_id,p_player_id,'on_turn_start',null);
  update public.matchmaking_queue set status='matched',battle_id=v_battle_id where player_id in(p_player_id,v_opponent.player_id);
  return jsonb_build_object('status','matched','battleId',v_battle_id);
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
  if p_action_type not in ('use_skill','end_turn','use_support','play_action','equip_part') then raise exception using errcode='P0001',message='UNSUPPORTED_ACTION'; end if;
  insert into public.battle_actions(battle_id,player_id,client_action_id,expected_version,action_type,payload) values(p_battle_id,p_player_id,p_client_action_id,p_expected_version,p_action_type,p_payload) returning * into v_action;
  if p_action_type='use_support' then return public.apply_battle_support(p_battle_id,p_player_id,v_action.id,p_payload); end if;
  if p_action_type='play_action' then
    select * into v_actor from public.battle_cards where battle_id=p_battle_id and player_id=p_player_id and instance_id=p_payload->>'cardInstanceId' and card_type='action' and zone='hand' for update;
    if not found then raise exception using errcode='P0001',message='ACTION_CARD_NOT_IN_HAND'; end if;
    if (select count(*) from public.battle_cards where battle_id=p_battle_id and player_id=p_player_id and zone='field') >= 2 then raise exception using errcode='P0001',message='FIELD_IS_FULL'; end if;
    select coalesce(max(field_index),0)+1 into v_slot from public.battle_cards where battle_id=p_battle_id and player_id=p_player_id and zone='field';
    update public.battle_cards set zone='field',field_index=v_slot where id=v_actor.id;
    insert into public.battle_events(battle_id,sequence,action_id,event_type,source_player_id,payload) values(p_battle_id,v_seq,v_action.id,'action_card_played',p_player_id,jsonb_build_object('cardInstanceId',v_actor.instance_id,'fieldIndex',v_slot,'turn',v_battle.turn));
    update public.battles set state_version=state_version+1 where id=p_battle_id;
    return jsonb_build_object('status','accepted','actionId',v_action.id,'stateVersion',v_battle.state_version+1);
  end if;
  if p_action_type='equip_part' then
    select * into v_actor from public.battle_cards where battle_id=p_battle_id and player_id=p_player_id and instance_id=p_payload->>'partInstanceId' and card_type='part' and zone='hand' for update;
    select * into v_target from public.battle_cards where battle_id=p_battle_id and player_id=p_player_id and instance_id=p_payload->>'targetInstanceId' and card_type='action' and zone='field' and not defeated for update;
    if not found or v_actor.id is null then raise exception using errcode='P0001',message='PART_OR_TARGET_NOT_AVAILABLE'; end if;
    if not exists (select 1 from public.cards c where c.id=v_actor.source_card_id and c.parent_card_id=v_target.source_card_id and c.card_type='part') then raise exception using errcode='P0001',message='PART_TARGET_INVALID'; end if;
    update public.battle_cards set equipped_part_ids=coalesce(equipped_part_ids,'[]'::jsonb) || jsonb_build_array(v_actor.instance_id) where id=v_target.id;
    update public.battle_cards set zone='discard' where id=v_actor.id;
    insert into public.battle_events(battle_id,sequence,action_id,event_type,source_player_id,payload) values(p_battle_id,v_seq,v_action.id,'part_equipped',p_player_id,jsonb_build_object('partInstanceId',v_actor.instance_id,'targetInstanceId',v_target.instance_id,'turn',v_battle.turn));
    update public.battles set state_version=state_version+1 where id=p_battle_id;
    return jsonb_build_object('status','accepted','actionId',v_action.id,'stateVersion',v_battle.state_version+1);
  end if;
  select coalesce(max(sequence),0)+1 into v_seq from public.battle_events where battle_id=p_battle_id;
  if p_action_type='end_turn' then
    perform public.trigger_battle_supports(p_battle_id,p_player_id,'on_turn_end',v_action.id);
    select coalesce(max(sequence),0)+1 into v_seq from public.battle_events where battle_id=p_battle_id;
    select * into v_battle from public.battles where id=p_battle_id;
    if v_battle.status<>'active' then return jsonb_build_object('status','accepted','actionId',v_action.id,'stateVersion',v_battle.state_version); end if;
    select player_id into v_next_player from public.battle_players where battle_id=p_battle_id and player_id<>p_player_id limit 1;
    update public.battles set active_player_id=v_next_player,turn=turn+1,state_version=state_version+1 where id=p_battle_id;
    perform public.draw_battle_cards(p_battle_id,v_next_player,1);
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
    perform public.trigger_battle_supports(p_battle_id,v_next_player,'on_turn_start',v_action.id);
    return jsonb_build_object('status','accepted','actionId',v_action.id,'stateVersion',v_battle.state_version+1);
  end if;
  v_slot:=greatest(1,coalesce((p_payload->>'skillSlot')::integer,1));
  select * into v_actor from public.battle_cards where battle_id=p_battle_id and player_id=p_player_id and not defeated and zone='field' and (p_payload->>'actorInstanceId' is null or instance_id=p_payload->>'actorInstanceId') order by field_index limit 1 for update;
  if not found or v_actor.defeated or v_actor.zone<>'field' then raise exception using errcode='P0001',message='ACTOR_NOT_AVAILABLE'; end if;
  select x.elem into v_skill from jsonb_array_elements(coalesce(v_actor.skills,'[]'::jsonb)) with ordinality x(elem,ord) where coalesce((x.elem->>'slot')::integer,x.ord::integer)=v_slot limit 1;
  if v_skill is null then raise exception using errcode='P0001',message='SKILL_NOT_FOUND'; end if;
  if not public.support_condition_matches(coalesce(v_skill->'conditions','{"type":"always"}'::jsonb),p_battle_id,p_player_id,array(select jsonb_array_elements_text(coalesce(p_payload->'targetInstanceIds','[]'::jsonb))),v_battle.turn) then raise exception using errcode='P0001',message='SKILL_CONDITION_NOT_MET'; end if;
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
          v_multiplier:=0.8+random()*0.4; v_amount:=coalesce((v_effect->>'value')::integer,0); v_damage:=greatest(0,round(v_amount * (greatest(0, v_actor.atk)::numeric / greatest(1, v_actor.atk + v_target.def)) * v_multiplier)::integer;
          update public.battle_cards set hp=greatest(0,hp-v_damage) where id=v_target.id;
          insert into public.battle_events(battle_id,sequence,action_id,event_type,source_player_id,payload) values(p_battle_id,v_seq,v_action.id,'damage_applied',p_player_id,jsonb_build_object('targetInstanceId',v_target.instance_id,'damage',v_damage,'turn',v_battle.turn)); v_seq:=v_seq+1;
          perform public.trigger_battle_supports(p_battle_id,v_target.player_id,'on_damage_taken',v_action.id);
          select * into v_target from public.battle_cards where id=v_target.id;
          if v_target.hp<=0 and not v_target.defeated then
            update public.battle_cards set defeated=true where id=v_target.id;
            insert into public.battle_events(battle_id,sequence,action_id,event_type,source_player_id,payload) values(p_battle_id,v_seq,v_action.id,'actor_defeated',v_target.player_id,jsonb_build_object('actorInstanceId',v_target.instance_id,'turn',v_battle.turn)); v_seq:=v_seq+1;
            perform public.trigger_battle_supports(p_battle_id,v_target.player_id,'on_card_destroyed',v_action.id);
          end if;
          perform public.resolve_battle_armed_effects(p_battle_id,v_action.id,v_actor.instance_id,v_target.instance_id);
          select coalesce(max(sequence),0)+1 into v_seq from public.battle_events where battle_id=p_battle_id;
          select * into v_battle from public.battles where id=p_battle_id;
          if v_battle.status<>'active' then return jsonb_build_object('status','accepted','actionId',v_action.id,'stateVersion',v_battle.state_version,'winnerPlayerId',v_battle.winner_player_id); end if;
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
          v_multiplier:=0.8+random()*0.4; v_amount:=coalesce((v_effect->>'value')::integer,0); v_damage:=greatest(0,round(v_amount * (greatest(0, v_actor.atk)::numeric / greatest(1, v_actor.atk + v_target.def)) * v_multiplier)::integer;
          update public.battle_cards set hp=greatest(0,hp-v_damage) where id=v_target.id;
          insert into public.battle_events(battle_id,sequence,action_id,event_type,source_player_id,payload) values(p_battle_id,v_seq,v_action.id,'damage_applied',p_player_id,jsonb_build_object('targetInstanceId',v_target.instance_id,'damage',v_damage,'turn',v_battle.turn)); v_seq:=v_seq+1;
          perform public.trigger_battle_supports(p_battle_id,v_target.player_id,'on_damage_taken',v_action.id);
          select * into v_target from public.battle_cards where id=v_target.id;
          if v_target.hp<=0 and not v_target.defeated then
            update public.battle_cards set defeated=true where id=v_target.id;
            insert into public.battle_events(battle_id,sequence,action_id,event_type,source_player_id,payload) values(p_battle_id,v_seq,v_action.id,'actor_defeated',v_target.player_id,jsonb_build_object('actorInstanceId',v_target.instance_id,'turn',v_battle.turn)); v_seq:=v_seq+1;
            perform public.trigger_battle_supports(p_battle_id,v_target.player_id,'on_card_destroyed',v_action.id);
          end if;
          perform public.resolve_battle_armed_effects(p_battle_id,v_action.id,v_actor.instance_id,v_target.instance_id);
          select coalesce(max(sequence),0)+1 into v_seq from public.battle_events where battle_id=p_battle_id;
          select * into v_battle from public.battles where id=p_battle_id;
          if v_battle.status<>'active' then return jsonb_build_object('status','accepted','actionId',v_action.id,'stateVersion',v_battle.state_version,'winnerPlayerId',v_battle.winner_player_id); end if;
        elsif v_effect->>'type'='heal' then
          v_amount:=greatest(0,coalesce((v_effect->>'value')::integer,0)); update public.battle_cards set hp=least(max_hp,hp+v_amount) where id=v_target.id;
          insert into public.battle_events(battle_id,sequence,action_id,event_type,source_player_id,payload) values(p_battle_id,v_seq,v_action.id,'heal_applied',p_player_id,jsonb_build_object('targetInstanceId',v_target.instance_id,'amount',v_amount,'turn',v_battle.turn)); v_seq:=v_seq+1;
        elsif v_effect->>'type'='shield_change' then
          v_amount:=coalesce((v_effect->>'value')::integer,0); update public.battle_cards set def=greatest(0,def+v_amount) where id=v_target.id;
          insert into public.battle_events(battle_id,sequence,action_id,event_type,source_player_id,payload) values(p_battle_id,v_seq,v_action.id,'shield_changed',p_player_id,jsonb_build_object('targetInstanceId',v_target.instance_id,'amount',v_amount,'turn',v_battle.turn)); v_seq:=v_seq+1;
        elsif v_effect->>'type'='stat_modifier' then
          update public.battle_cards set statuses=(select coalesce(jsonb_agg(s.value),'[]'::jsonb) from jsonb_array_elements(coalesce(statuses,'[]'::jsonb)) s(value) where s.value->>'key'<>('modifier_' || (v_effect->>'stat'))) || jsonb_build_array(jsonb_build_object('key','modifier_' || (v_effect->>'stat'),'stat',v_effect->>'stat','value',coalesce((v_effect->>'value')::integer,0),'remainingTurns',coalesce((v_effect->>'duration')::integer,1))) where id=v_target.id;
          insert into public.battle_events(battle_id,sequence,action_id,event_type,source_player_id,payload) values(p_battle_id,v_seq,v_action.id,'stat_changed',p_player_id,jsonb_build_object('targetInstanceId',v_target.instance_id,'stat',v_effect->>'stat','value',coalesce((v_effect->>'value')::integer,0),'turn',v_battle.turn)); v_seq:=v_seq+1;
        elsif v_effect->>'type'='status_apply' then
          update public.battle_cards set statuses=(select coalesce(jsonb_agg(s.value),'[]'::jsonb) from jsonb_array_elements(coalesce(statuses,'[]'::jsonb)) s(value) where s.value->>'key'<>(v_effect->>'key')) || jsonb_build_array(jsonb_build_object('key',v_effect->>'key','value',coalesce((v_effect->>'value')::integer,0),'remainingTurns',coalesce((v_effect->>'duration')::integer,1))) where id=v_target.id;
          insert into public.battle_events(battle_id,sequence,action_id,event_type,source_player_id,payload) values(p_battle_id,v_seq,v_action.id,'status_applied',p_player_id,jsonb_build_object('targetInstanceId',v_target.instance_id,'key',v_effect->>'key','turn',v_battle.turn)); v_seq:=v_seq+1;
        elsif v_effect->>'type'='status_remove' then
          update public.battle_cards set statuses=(select coalesce(jsonb_agg(s.value),'[]'::jsonb) from jsonb_array_elements(coalesce(statuses,'[]'::jsonb)) s(value) where s.value->>'key'<>(v_effect->>'key')) where id=v_target.id;
          insert into public.battle_events(battle_id,sequence,action_id,event_type,source_player_id,payload) values(p_battle_id,v_seq,v_action.id,'status_removed',p_player_id,jsonb_build_object('targetInstanceId',v_target.instance_id,'key',v_effect->>'key','turn',v_battle.turn)); v_seq:=v_seq+1;
        elsif v_effect->>'type' in ('counter','follow_up') then
          update public.battle_cards set statuses=coalesce(statuses,'[]'::jsonb) || jsonb_build_array(jsonb_build_object('key',v_effect->>'type','trigger',v_effect->>'trigger','value',coalesce((v_effect->>'value')::integer,0),'remainingTurns',coalesce((v_effect->>'duration')::integer,1))) where id=v_target.id;
          insert into public.battle_events(battle_id,sequence,action_id,event_type,source_player_id,payload) values(p_battle_id,v_seq,v_action.id,(v_effect->>'type') || '_armed',p_player_id,jsonb_build_object('targetInstanceId',v_target.instance_id,'turn',v_battle.turn)); v_seq:=v_seq+1;
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
    perform public.trigger_battle_supports(p_battle_id,p_player_id,'on_turn_end',v_action.id);
    select * into v_battle from public.battles where id=p_battle_id;
    if v_battle.status<>'active' then return jsonb_build_object('status','accepted','actionId',v_action.id,'stateVersion',v_battle.state_version); end if;
    select player_id into v_next_player from public.battle_players where battle_id=p_battle_id and player_id<>p_player_id limit 1;
    update public.battles set active_player_id=v_next_player,turn=turn+1,state_version=state_version+1 where id=p_battle_id;
    perform public.draw_battle_cards(p_battle_id,v_next_player,1);
    -- AP regeneration is applied before temporary stat modifiers expire.
    for v_actor in select * from public.battle_cards where battle_id=p_battle_id and player_id=v_next_player and zone='field' and not defeated order by field_index for update loop
      v_before_ap:=v_actor.ap; v_amount:=least(1000,v_actor.ap+greatest(0,v_actor.speed+coalesce((select sum((st.value->>'value')::integer) from jsonb_array_elements(coalesce(v_actor.statuses,'[]'::jsonb)) st(value) where st.value->>'key'='modifier_speed'),0)))-v_before_ap;
      update public.battle_cards set ap=v_before_ap+v_amount where id=v_actor.id;
      insert into public.battle_events(battle_id,sequence,action_id,event_type,source_player_id,payload) values(p_battle_id,v_seq,v_action.id,'ap_changed',v_next_player,jsonb_build_object('actorInstanceId',v_actor.instance_id,'amount',v_amount,'ap',v_before_ap+v_amount,'turn',v_battle.turn+1)); v_seq:=v_seq+1;
    end loop;
    update public.battle_cards bc set statuses=(select coalesce(jsonb_agg(jsonb_set(s.value,'{remainingTurns}',to_jsonb((s.value->>'remainingTurns')::integer-1)) order by s.ord),'[]'::jsonb) from jsonb_array_elements(coalesce(bc.statuses,'[]'::jsonb)) with ordinality s(value,ord) where coalesce((s.value->>'remainingTurns')::integer,0)>1) where bc.battle_id=p_battle_id and bc.player_id=v_next_player and bc.zone='field';
    perform public.trigger_battle_supports(p_battle_id,v_next_player,'on_turn_start',v_action.id);
  else update public.battles set state_version=state_version+1 where id=p_battle_id; end if;
  return jsonb_build_object('status','accepted','actionId',v_action.id,'stateVersion',v_battle.state_version+1);
end;
$$;

revoke all on function public.draw_battle_cards(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.draw_battle_cards(uuid,uuid,integer) to service_role;
