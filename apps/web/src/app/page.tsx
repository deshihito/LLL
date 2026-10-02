import { redirect } from "next/navigation";
import { auth } from "@/auth";
import HomeClient from "./home-client";

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return <HomeClient userName={session.user.name ?? "ユーザー"} />;
}
