export const RULESET_VERSION = "lll-core-2026-10-05";

/** 初期バトルルール。変更時はここだけを更新する。 */
export const BATTLE_CONFIG = {
  initialAp: 100,
  maxAp: 1000,
  maxFieldActors: 2,
  maxActionsPerTurn: 2,
  defeatCount: 3,
  damageRandomMin: 0.8,
  damageRandomMax: 1.2,
} as const;
