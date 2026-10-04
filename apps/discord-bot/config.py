from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()

TOKEN = os.getenv("DISCORD_TOKEN") or os.getenv("TOKEN")
APPLICATION_ID = os.getenv("DISCORD_APPLICATION_ID")
GUILD_ID = os.getenv("DISCORD_GUILD_ID")
PREFIX = os.getenv("DISCORD_PREFIX", "!")
PORT = int(os.getenv("PORT", "10001"))
