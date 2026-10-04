import { createPublicKey, verify } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DISCORD_PING = 1;
const DISCORD_APPLICATION_COMMAND = 2;
const DISCORD_CALLBACK_CHANNEL_MESSAGE = 4;
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
let cachedPublicKey: string | null = null;
let commandRegistered = false;

async function resolvePublicKey(): Promise<string | null> {
  if (cachedPublicKey) return cachedPublicKey;
  const configuredPublicKey = process.env.DISCORD_PUBLIC_KEY;
  if (configuredPublicKey) return configuredPublicKey;
  const token = process.env.DISCORD_TOKEN;
  const applicationId = process.env.DISCORD_APPLICATION_ID;
  if (!token || !applicationId) return null;
  try {
    const response = await fetch(`https://discord.com/api/v10/applications/${applicationId}`, {
      headers: { Authorization: `Bot ${token}` },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { verify_key?: string };
    cachedPublicKey = payload.verify_key ?? null;
    return cachedPublicKey;
  } catch (error) {
    console.error("Discord application lookup failed", error);
    return null;
  }
}

async function verifyDiscordSignature(body: string, signature: string | null, timestamp: string | null): Promise<boolean> {
  const publicKey = await resolvePublicKey();
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

async function registerPingCommand(): Promise<void> {
  if (commandRegistered) return;
  const token = process.env.DISCORD_TOKEN;
  const applicationId = process.env.DISCORD_APPLICATION_ID;
  if (!token || !applicationId) return;
  const guildId = process.env.DISCORD_GUILD_ID;
  const endpoint = guildId
    ? `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`
    : `https://discord.com/api/v10/applications/${applicationId}/commands`;
  try {
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: { Authorization: `Bot ${token}`, "content-type": "application/json" },
      body: JSON.stringify([{ name: "ping", description: "Botの応答速度を確認します" }]),
      cache: "no-store",
    });
    if (!response.ok) {
      console.error("Discord ping command registration failed", response.status);
      return;
    }
    commandRegistered = true;
  } catch (error) {
    console.error("Discord ping command registration failed", error);
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");

  if (!(await verifyDiscordSignature(rawBody, signature, timestamp))) {
    return NextResponse.json({ error: "Invalid request signature" }, { status: 401 });
  }

  let interaction: { type?: number; data?: { name?: string } };
  try {
    interaction = JSON.parse(rawBody) as typeof interaction;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (interaction.type === DISCORD_PING) {
    await registerPingCommand();
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
