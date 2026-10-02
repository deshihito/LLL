import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import HomeClient from "../home-client";

const sections = new Set(["scout", "binder", "decks", "battle", "profile", "notifications", "settings", "help"]);

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.has(section)) notFound();
  const session = await auth();
  if (!session?.user) redirect("/login");
  return <HomeClient user={session.user} />;
}
