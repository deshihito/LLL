/** 初期バトルルール。変更時はここだけを更新する。 */
export const BATTLE_CONFIG = {
  initialAp: 50,
  maxAp: 1000,
  maxFieldActors: 2,
  maxActionsPerTurn: 2,
  defeatCount: 3,
  damageRandomMin: 0.8,
  damageRandomMax: 1.2,
  damageRoundUnit: 10,
} as const;
