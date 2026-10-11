from dataclasses import dataclass
from typing import Callable

from scraper.stages import (
    export_json,
    funghi_italiani,
    funghi_italiani_topics,
    mushrooms,
    normalize,
    setup_db,
    wikipedia,
)


@dataclass(frozen=True)
class Stage:
    number: int
    title: str
    run: Callable[[], None]


STAGES: list[Stage] = [
    Stage(1, "Setup database", setup_db.run),
    Stage(2, "Download data from funghiitaliani.it", funghi_italiani.run),
    Stage(3, "Download funghiitaliani.it topics (taxonomy, photos)", funghi_italiani_topics.run),
    Stage(4, "Search Wikipedia pages (it, en)", wikipedia.run),
    Stage(5, "Build mushrooms from funghiitaliani.it and Wikipedia", mushrooms.run),
    Stage(6, "Normalize mushrooms characteristics to English", normalize.run),
    Stage(7, "Export mushrooms to JSON", export_json.run),
]
