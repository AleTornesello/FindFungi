from dataclasses import dataclass
from typing import Callable

from scraper.stages import setup_db


@dataclass(frozen=True)
class Stage:
    number: int
    title: str
    run: Callable[[], None]


STAGES: list[Stage] = [
    Stage(1, "Setup database", setup_db.run),
]
