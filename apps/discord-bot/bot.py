from __future__ import annotations

import logging
import os
from pathlib import Path

import discord
from discord.ext import commands


LOGGER = logging.getLogger("lll.discord_bot")
COGS_DIR = Path(__file__).parent / "cogs"


class LLLBot(commands.Bot):
    def __init__(self) -> None:
        intents = discord.Intents.none()
        application_id = os.getenv("DISCORD_APPLICATION_ID")
        super().__init__(
            command_prefix=commands.when_mentioned,
            intents=intents,
            application_id=int(application_id) if application_id else None,
        )

    async def setup_hook(self) -> None:
        for module in sorted(COGS_DIR.glob("*_cog.py")):
            extension = f"cogs.{module.stem}"
            LOGGER.info("Loading cog: %s", extension)
            await self.load_extension(extension)

        guild_id = os.getenv("DISCORD_GUILD_ID")
        if guild_id:
            guild = discord.Object(id=int(guild_id))
            self.tree.copy_global_to(guild=guild)
            synced = await self.tree.sync(guild=guild)
            LOGGER.info("Synced %d command(s) to guild %s", len(synced), guild_id)
        else:
            synced = await self.tree.sync()
            LOGGER.info("Synced %d global command(s)", len(synced))

    async def on_ready(self) -> None:
        if self.user is not None:
            LOGGER.info("Logged in as %s (%s)", self.user, self.user.id)


def create_bot() -> LLLBot:
    return LLLBot()


def main() -> None:
    token = os.getenv("DISCORD_TOKEN")
    if not token:
        raise RuntimeError("DISCORD_TOKEN is required")

    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    bot = create_bot()
    bot.run(token, log_handler=None)


if __name__ == "__main__":
    main()
