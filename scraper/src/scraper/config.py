import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]

REQUIRED_VARS = ("DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD")


class ConfigError(Exception):
    pass


@dataclass(frozen=True)
class DbConfig:
    host: str
    port: int
    name: str
    user: str
    password: str

    @property
    def display(self) -> str:
        return f"{self.user}@{self.host}:{self.port}/{self.name}"


def load_db_config() -> DbConfig:
    env_file = PROJECT_ROOT / ".env"
    load_dotenv(env_file)
    missing = [var for var in REQUIRED_VARS if not os.getenv(var)]
    if missing:
        raise ConfigError(f"Missing variables in {env_file}: {', '.join(missing)}")
    return DbConfig(
        host=os.environ["DB_HOST"],
        port=int(os.environ["DB_PORT"]),
        name=os.environ["DB_NAME"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
    )
