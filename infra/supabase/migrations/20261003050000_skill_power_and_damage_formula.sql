-- Skill power is the base damage value and is capped at 150.
update public.card_skills set power = least(greatest(power, 0), 150) where power < 0 or power > 150;
alter table public.card_skills drop constraint if exists card_skills_power_check;
alter table public.card_skills add constraint card_skills_power_check check (power between 0 and 150) not valid;
alter table public.card_skills validate constraint card_skills_power_check;
-- Keep the authoritative SQL battle functions aligned with the documented damage rule:
-- power * (attacker ATK / (attacker ATK + target DEF)) * random factor [0.8, 1.2].

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
        v_target_def:=greatest(0,v_target.def+coalesce((select sum((s.value->>'value')::integer) from jsonb_array_elements(coalesce(v_target.statuses,'[]'::jsonb)) s(value) where s.value->>'key'='modifier_shield'),0)); v_multiplier:=0.8+random()*0.4; v_damage:=greatest(0,round(v_amount * (greatest(0, v_source_atk)::numeric / greatest(1, v_source_atk + v_target_def)) * v_multiplier)::integer;
        update public.battle_cards set hp=greatest(0,hp-v_damage) where id=v_target.id;
        insert into public.battle_events(battle_id,sequence,action_id,event_type,source_player_id,payload) values(p_battle_id,v_seq,p_action_id,'damage_applied',p_player_id,jsonb_build_object('targetInstanceId',v_target.instance_id,'damage',v_damage,'turn',v_battle.turn,'supportInstanceId',v_support.instance_id)); v_seq:=v_seq+1;
        perform public.trigger_battle_supports(p_battle_id,v_target.player_id,'on_damage_taken',p_action_id);
        select * into v_target from public.battle_cards where id=v_target.id;
        if v_target.hp<=0 and not v_target.defeated then
          update public.battle_cards set defeated=true where id=v_target.id;
          perform public.trigger_battle_supports(p_battle_id,v_target.player_id,'on_card_destroyed',p_action_id);
        end if;
        select coalesce(max(sequence),0)+1 into v_seq from public.battle_events where battle_id=p_battle_id;
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
$$;;

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
    perform public.trigger_battle_supports(p_battle_id,p_player_id,'on_turn_end',v_action.id);
    select coalesce(max(sequence),0)+1 into v_seq from public.battle_events where battle_id=p_battle_id;
    select * into v_battle from public.battles where id=p_battle_id;
    if v_battle.status<>'active' then return jsonb_build_object('status','accepted','actionId',v_action.id,'stateVersion',v_battle.state_version); end if;
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
    perform public.trigger_battle_supports(p_battle_id,v_next_player,'on_turn_start',v_action.id);
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
$$;;
