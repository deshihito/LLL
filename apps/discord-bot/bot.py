from __future__ import annotations

import logging
from pathlib import Path

import discord
from discord.ext import commands

import config


LOGGER = logging.getLogger("lll.discord_bot")
COGS_DIR = Path(__file__).parent / "cogs"


class LLLBot(commands.Bot):
    def __init__(self) -> None:
        intents = discord.Intents.none()
        super().__init__(
            command_prefix=commands.when_mentioned,
            intents=intents,
            application_id=int(config.APPLICATION_ID) if config.APPLICATION_ID else None,
        )

    async def setup_hook(self) -> None:
        LOGGER.info("--- COGS LOADING PROCESS START ---")
        for module in sorted(COGS_DIR.glob("*.py")):
            if module.name.startswith("_"):
                continue
            extension = f"cogs.{module.stem}"
            try:
                await self.load_extension(extension)
                LOGGER.info("Loaded cog: %s", extension)
            except Exception:
                LOGGER.exception("Failed to load cog: %s", extension)

        if config.GUILD_ID:
            guild = discord.Object(id=int(config.GUILD_ID))
            self.tree.copy_global_to(guild=guild)
            synced = await self.tree.sync(guild=guild)
            LOGGER.info("Synced %d command(s) to guild %s", len(synced), config.GUILD_ID)
        else:
            synced = await self.tree.sync()
            LOGGER.info("Synced %d global command(s)", len(synced))

    async def on_ready(self) -> None:
        if self.user is not None:
            LOGGER.info("Logged in as %s (%s)", self.user, self.user.id)
            LOGGER.info("Active cogs: %s", list(self.cogs))


def create_bot() -> LLLBot:
    return LLLBot()


def main() -> None:
    if not config.TOKEN:
        raise RuntimeError("DISCORD_TOKEN or TOKEN is required")
    create_bot().run(config.TOKEN, log_handler=None)


if __name__ == "__main__":
    main()
