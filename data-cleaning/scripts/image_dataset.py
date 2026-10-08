"""Reusable image dataset for notebook and script DataLoaders."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Sequence

from PIL import Image
from torch import Tensor
from torch.utils.data import Dataset


class ImagePathDataset(Dataset[Tensor]):
    """Load RGB images from explicit paths and apply a supplied transform."""

    def __init__(self, image_paths: Sequence[Path], transform: Any) -> None:
        self.image_paths = [Path(path) for path in image_paths]
        self.transform = transform

    def __len__(self) -> int:
        return len(self.image_paths)

    def __getitem__(self, index: int) -> Tensor:
        with Image.open(self.image_paths[index]) as source:
            image = source.convert("RGB")
        return self.transform(image)
