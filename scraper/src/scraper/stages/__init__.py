from dataclasses import dataclass
from typing import Callable

from scraper.stages import funghi_italiani, setup_db, wikipedia


@dataclass(frozen=True)
class Stage:
    number: int
    title: str
    run: Callable[[], None]


STAGES: list[Stage] = [
    Stage(1, "Setup database", setup_db.run),
    Stage(2, "Download data from funghiitaliani.it", funghi_italiani.run),
    Stage(3, "Search Wikipedia pages (it, en)", wikipedia.run),
]
