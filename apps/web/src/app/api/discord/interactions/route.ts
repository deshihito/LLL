import { createPublicKey, verify } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DISCORD_PING = 1;
const DISCORD_APPLICATION_COMMAND = 2;
const DISCORD_CALLBACK_CHANNEL_MESSAGE = 4;
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function verifyDiscordSignature(body: string, signature: string | null, timestamp: string | null): boolean {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey || !signature || !timestamp || !/^[0-9a-f]{128}$/i.test(publicKey)) return false;
  if (!/^[0-9a-f]{128}$/i.test(signature) || !/^\d+$/.test(timestamp)) return false;

  try {
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKey, "hex")]),
      format: "der",
      type: "spki",
    });
    return verify(null, Buffer.from(timestamp + body), key, Buffer.from(signature, "hex"));
  } catch (error) {
    console.error("Discord signature verification failed", error);
    return false;
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");

  if (!verifyDiscordSignature(rawBody, signature, timestamp)) {
    return NextResponse.json({ error: "Invalid request signature" }, { status: 401 });
  }

  let interaction: { type?: number; data?: { name?: string } };
  try {
    interaction = JSON.parse(rawBody) as typeof interaction;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (interaction.type === DISCORD_PING) {
    return NextResponse.json({ type: DISCORD_PING });
  }

  if (interaction.type === DISCORD_APPLICATION_COMMAND && interaction.data?.name === "ping") {
    return NextResponse.json({
      type: DISCORD_CALLBACK_CHANNEL_MESSAGE,
      data: { content: "Pong! Vercel Interaction is alive." },
    });
  }

  return NextResponse.json({
    type: DISCORD_CALLBACK_CHANNEL_MESSAGE,
    data: { content: "このコマンドはまだ実装されていません。" },
  });
}
