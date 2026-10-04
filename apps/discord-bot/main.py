from __future__ import annotations

import logging
import os

import config
from bot import create_bot
from keep_alive import keep_alive


LOGGER = logging.getLogger("lll.discord_bot")


def main() -> None:
    if not config.TOKEN:
        raise RuntimeError("DISCORD_TOKEN or TOKEN is required")

    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    keep_alive()
    LOGGER.info("Starting LLL Discord bot")
    create_bot().run(config.TOKEN, log_handler=None)


if __name__ == "__main__":
    main()
