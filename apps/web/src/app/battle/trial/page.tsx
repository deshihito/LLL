import { redirect } from "next/navigation";
import { auth } from "@/auth";
import TrialBattleClient from "./trial-battle-client";
import { FullscreenRequired } from "@/components/fullscreen-button";

export default async function TrialBattlePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <FullscreenRequired><TrialBattleClient playerId={session.user.id} playerName={session.user.name ?? "あなた"} /></FullscreenRequired>;
}
