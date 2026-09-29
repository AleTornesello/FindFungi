import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]

REQUIRED_VARS = ("DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD")

DEFAULT_FIRECRAWL_API_URL = "https://api.firecrawl.dev"
DEFAULT_FIRECRAWL_CONCURRENCY = 2


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


@dataclass(frozen=True)
class FirecrawlConfig:
    api_key: str  # empty: keyless access, with much lower rate limits
    api_url: str
    concurrency: int


def _load_env() -> Path:
    env_file = PROJECT_ROOT / ".env"
    load_dotenv(env_file)
    return env_file


def load_db_config() -> DbConfig:
    env_file = _load_env()
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


def load_firecrawl_config() -> FirecrawlConfig:
    env_file = _load_env()
    concurrency = os.getenv("FIRECRAWL_CONCURRENCY") or str(DEFAULT_FIRECRAWL_CONCURRENCY)
    if not concurrency.isdigit() or int(concurrency) < 1:
        raise ConfigError(
            f"FIRECRAWL_CONCURRENCY in {env_file} must be a positive integer"
        )
    return FirecrawlConfig(
        api_key=os.getenv("FIRECRAWL_API_KEY", ""),
        api_url=(os.getenv("FIRECRAWL_API_URL") or DEFAULT_FIRECRAWL_API_URL).rstrip("/"),
        concurrency=int(concurrency),
    )
