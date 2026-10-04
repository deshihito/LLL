from __future__ import annotations

import logging
import threading

from flask import Flask

import config

LOGGER = logging.getLogger("lll.discord_bot.keep_alive")
app = Flask(__name__)


@app.get("/")
def home() -> tuple[str, int]:
    return "LLL Discord bot is alive", 200


@app.get("/health")
def health() -> tuple[dict[str, str], int]:
    return {"status": "ok", "service": "discord-bot"}, 200


def _run() -> None:
    app.run(host="0.0.0.0", port=config.PORT, debug=False, use_reloader=False)


def keep_alive() -> None:
    thread = threading.Thread(target=_run, name="discord-health-server", daemon=True)
    thread.start()
    LOGGER.info("Health server started on port %s", config.PORT)
