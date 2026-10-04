from __future__ import annotations

import time

import discord
from discord import app_commands
from discord.ext import commands


class UtilityCog(commands.Cog, name="Utility"):
    """Basic operational commands for the LLL Discord bot."""

    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @app_commands.command(name="ping", description="Botの応答速度を確認します")
    async def ping(self, interaction: discord.Interaction) -> None:
        started = time.perf_counter()
        await interaction.response.defer(thinking=False)
        response_ms = round((time.perf_counter() - started) * 1000)
        gateway_ms = round(self.bot.latency * 1000)
        await interaction.edit_original_response(
            content=f"Pong! 応答 {response_ms}ms / Gateway {gateway_ms}ms"
        )


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(UtilityCog(bot))
