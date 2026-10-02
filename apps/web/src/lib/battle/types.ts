import type { SupportDefinition } from "./support-schema.ts";

export type BattlePhase = "waiting" | "active" | "finished" | "aborted";
export type TurnBehavior = "end" | "continue";

export type BattleStatus = { key: string; remainingTurns: number; sourceActorId: string; value?: number; stat?: "max_hp" | "atk" | "shield" | "speed"; trigger?: string };
export type BattleEffect = {
  type: string;
  target?: string;
  value?: number;
  stat?: "max_hp" | "atk" | "shield" | "speed";
  duration?: number;
  key?: string;
  trigger?: string;
};
export type BattleSkill = {
  slot: number;
  name: string;
  description?: string;
  skill_type?: "active" | "passive";
  cost: number;
  turn_behavior?: TurnBehavior;
  conditions?: unknown;
  effects: BattleEffect[];
};
export type BattleCard = {
  cardId: string;
  title: string;
  hp: number;
  atk: number;
  shield: number;
  speed: number;
  skills: BattleSkill[];
  cardType?: "action" | "part" | "support";
  instanceId?: string;
  supportDefinition?: SupportDefinition | null;
  supportUses?: number;
};
export type BattleActor = {
  instanceId: string;
  cardId: string;
  title: string;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  speed: number;
  ap: number;
  maxAp: number;
  skills: BattleSkill[];
  statuses: BattleStatus[];
  defeated: boolean;
};
export type BattlePlayer = {
  playerId: string;
  actors: BattleActor[];
  hand: BattleCard[];
  discard: BattleCard[];
};
export type BattleEvent = {
  eventId: string;
  actionId: string;
  turn: number;
  sequence: number;
  type: string;
  sourceActorId: string | null;
  targetActorIds: string[];
  payload: Record<string, string | number | boolean | null>;
};
export type BattleState = {
  battleId: string;
  version: number;
  phase: BattlePhase;
  defeatTarget?: number;
  turn: number;
  activePlayerId: string;
  players: Record<string, BattlePlayer>;
  winnerPlayerId: string | null;
  destroyedByPlayer: Record<string, number>;
  processedActionIds: string[];
  events: BattleEvent[];
};
export type BattleAction =
  | { actionId: string; battleId: string; expectedVersion: number; playerId: string; type: "use_skill"; actorInstanceId: string; skillSlot: number; targetInstanceIds: string[] }
  | { actionId: string; battleId: string; expectedVersion: number; playerId: string; type: "use_support"; supportInstanceId: string; targetInstanceIds: string[] }
  | { actionId: string; battleId: string; expectedVersion: number; playerId: string; type: "end_turn" };
