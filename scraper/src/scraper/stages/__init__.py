from dataclasses import dataclass
from typing import Callable

from scraper.stages import funghi_italiani, normalize, setup_db, wikipedia, wikipedia_data


@dataclass(frozen=True)
class Stage:
    number: int
    title: str
    run: Callable[[], None]


STAGES: list[Stage] = [
    Stage(1, "Setup database", setup_db.run),
    Stage(2, "Download data from funghiitaliani.it", funghi_italiani.run),
    Stage(3, "Search Wikipedia pages (it, en)", wikipedia.run),
    Stage(4, "Scrape Wikipedia data into mushrooms", wikipedia_data.run),
    Stage(5, "Normalize mushrooms characteristics to English", normalize.run),
]
