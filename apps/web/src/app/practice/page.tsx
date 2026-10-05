import type { Metadata } from "next";
import TrialBattleClient from "../battle/trial/trial-battle-client";
export const metadata: Metadata = { title: "LLL | はじめてのカードバトル", description: "ログイン不要。サンプルカードでルールを学ぶ練習バトル。" };
export default function PracticePage() {
  return <TrialBattleClient playerId="practice-player" playerName="あなた" sampleMode />;
}
