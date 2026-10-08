"""Build an exact-deduplicated image dataset, then create leakage-safe splits."""

from __future__ import annotations

import csv
import hashlib
import json
import os
import re
import shutil
import tempfile
import uuid
from collections import Counter
from pathlib import Path
from typing import Annotated, Any
from urllib.parse import urlparse

from PIL import Image, UnidentifiedImageError
from sklearn.model_selection import StratifiedGroupKFold
import typer


PROJECT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_DIR.parent / "data"
DATASET_DIR = DATA_DIR / "dataset"
DEDUPLICATED_DIR = DATASET_DIR / "deduplicated"
SPLITS_DIR = DATASET_DIR / "splits"
DEFAULT_JSON = DATA_DIR / "mushrooms.json"
DEFAULT_ANNOTATIONS = DATA_DIR / "annotated.csv"
DEFAULT_NEAR_DUPLICATE_REVIEW = DATA_DIR / "image_duplicate_review.csv"
LABEL_TO_ID = {"macroscopic": 0, "micro": 1, "not-mushroom": -1}
SPLIT_SEED = 42
SPLIT_FOLD = 2
SPLIT_FOLDS = 5
app = typer.Typer(help=__doc__)


class DisjointSet:
    """Union-find for mushroom IDs and reviewed duplicate components."""

    def __init__(self) -> None:
        self.parents: dict[str, str] = {}

    def find(self, value: str) -> str:
        self.parents.setdefault(value, value)
        if self.parents[value] != value:
            self.parents[value] = self.find(self.parents[value])
        return self.parents[value]

    def union(self, left: str, right: str) -> None:
        left_root = self.find(left)
        right_root = self.find(right)
        if left_root == right_root:
            return
        first, second = sorted((left_root, right_root))
        self.parents[second] = first


def _image_suffix(url: str) -> str:
    suffix = Path(urlparse(url).path).suffix
    return suffix.lower() if re.fullmatch(r"\.[A-Za-z0-9]{1,10}", suffix) else ".img"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _load_annotations(path: Path) -> dict[tuple[str, str], str]:
    if not path.is_file():
        return {}
    labels: dict[tuple[str, str], str] = {}
    with path.open(newline="", encoding="utf-8-sig") as source:
        for line_number, row in enumerate(csv.DictReader(source), start=2):
            label = (row.get("label") or "").strip()
            if not label:
                continue
            if label not in LABEL_TO_ID:
                raise ValueError(f"Unknown annotation label on line {line_number}: {label!r}")
            key = ((row.get("id") or "").strip(), Path((row.get("image") or "").strip()).name)
            if not all(key):
                raise ValueError(f"Missing mushroom ID or image name on annotation line {line_number}")
            previous = labels.get(key)
            if previous is not None and previous != label:
                raise ValueError(f"Conflicting labels for {key}: {previous!r} and {label!r}")
            labels[key] = label
    return labels


def _load_raw_images(json_path: Path, image_root: Path) -> tuple[list[dict[str, str]], list[dict[str, Any]]]:
    raw = json.loads(json_path.read_text(encoding="utf-8"))
    mushrooms = raw.get("mushrooms") if isinstance(raw, dict) else None
    if not isinstance(mushrooms, list):
        raise ValueError(f"Expected a JSON object with a mushrooms list: {json_path}")

    rows: list[dict[str, str]] = []
    seen_ids: set[str] = set()
    for mushroom in mushrooms:
        mushroom_id = str(mushroom.get("id", "")).strip()
        if (
            not mushroom_id
            or Path(mushroom_id).name != mushroom_id
            or "/" in mushroom_id
            or "\\" in mushroom_id
            or mushroom_id in {".", ".."}
        ):
            raise ValueError(f"Unsafe or missing mushroom ID: {mushroom_id!r}")
        if mushroom_id in seen_ids:
            raise ValueError(f"Duplicate mushroom ID in raw JSON: {mushroom_id}")
        seen_ids.add(mushroom_id)
        properties = mushroom.get("properties") or {}
        urls = properties.get("images") or []
        if not isinstance(urls, list):
            raise ValueError(f"Expected properties.images to be a list for mushroom {mushroom_id}")
        for index, url in enumerate(urls, start=1):
            if not isinstance(url, str) or not url:
                raise ValueError(f"Invalid image URL at {mushroom_id}/{index:04d}")
            image_name = f"{index:04d}{_image_suffix(url)}"
            source_path = Path("images") / mushroom_id / image_name
            rows.append(
                {
                    "mushroom_id": mushroom_id,
                    "image": image_name,
                    "source_image_path": source_path.as_posix(),
                    "absolute_source_path": str(image_root / mushroom_id / image_name),
                    "url": url,
                }
            )
    return rows, mushrooms


def _atomic_replace_directory(staged_dir: Path, output_dir: Path) -> None:
    backup_dir: Path | None = None
    if output_dir.exists():
        backup_dir = output_dir.with_name(f".{output_dir.name}.previous-{uuid.uuid4().hex}")
        os.replace(output_dir, backup_dir)
    try:
        os.replace(staged_dir, output_dir)
    except BaseException:
        if backup_dir is not None and backup_dir.exists() and not output_dir.exists():
            os.replace(backup_dir, output_dir)
        raise
    if backup_dir is not None:
        shutil.rmtree(backup_dir)


def _write_csv(path: Path, fieldnames: tuple[str, ...], rows: list[dict[str, Any]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as destination:
        writer = csv.DictWriter(destination, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def _relative_to_project(path: Path) -> str:
    return Path(os.path.relpath(path, PROJECT_DIR)).as_posix()


@app.command()
def deduplicate(
    data_dir: Annotated[Path, typer.Option(help="Raw data directory containing mushrooms.json and images/.")] = DATA_DIR,
    json_file: Annotated[Path, typer.Option(help="Raw source records; image numbering follows properties.images order.")] = DEFAULT_JSON,
    annotations: Annotated[Path, typer.Option(help="Optional image-level annotations to attach to the clean manifest.")] = DEFAULT_ANNOTATIONS,
    output_dir: Annotated[Path, typer.Option(help="Destination for unique images and their manifests.")] = DEDUPLICATED_DIR,
    overwrite: Annotated[bool, typer.Option(help="Replace an existing deduplicated dataset after a successful rebuild.")] = False,
) -> None:
    """Hash raw images and create one experiment-ready row per exact image."""
    image_root = data_dir / "images"
    if not image_root.is_dir():
        raise FileNotFoundError(f"Raw image directory does not exist: {image_root}")
    if not json_file.is_file():
        raise FileNotFoundError(f"Raw source JSON does not exist: {json_file}")
    if output_dir.exists() and not overwrite:
        raise FileExistsError(f"Dataset already exists: {output_dir}. Pass --overwrite to rebuild it.")

    annotations_by_key = _load_annotations(annotations)
    expected_rows, raw_mushrooms = _load_raw_images(json_file, image_root)
    groups: dict[str, list[dict[str, str]]] = {}
    issues: list[dict[str, str]] = []
    source_keys_seen: set[tuple[str, str]] = set()
    matched_annotation_keys: set[tuple[str, str]] = set()

    for row in expected_rows:
        key = (row["mushroom_id"], row["image"])
        if key in source_keys_seen:
            raise ValueError(f"Raw JSON maps multiple URLs to the same local image path: {key}")
        source_keys_seen.add(key)
        source_path = Path(row["absolute_source_path"])
        if not source_path.is_file():
            issues.append({"source_image_path": row["source_image_path"], "reason": "missing_file"})
            continue
        try:
            with Image.open(source_path) as image:
                image.verify()
            digest = _sha256(source_path)
        except (OSError, UnidentifiedImageError) as error:
            issues.append(
                {"source_image_path": row["source_image_path"], "reason": f"invalid_image: {type(error).__name__}"}
            )
            continue
        row["sha256"] = digest
        row["label"] = annotations_by_key.get(key, "")
        if row["label"]:
            matched_annotation_keys.add(key)
        groups.setdefault(digest, []).append(row)

    missing_annotations = sorted(set(annotations_by_key) - matched_annotation_keys)
    if missing_annotations:
        examples = ", ".join(f"{mushroom_id}/{image}" for mushroom_id, image in missing_annotations[:10])
        raise ValueError(
            f"{len(missing_annotations)} labeled images are missing or invalid in the raw dataset: {examples}"
        )

    output_dir.parent.mkdir(parents=True, exist_ok=True)
    staged_dir = Path(tempfile.mkdtemp(prefix=f".{output_dir.name}.building-", dir=output_dir.parent))
    try:
        unique_image_root = staged_dir / "images"
        manifest_rows: list[dict[str, Any]] = []
        source_map_rows: list[dict[str, Any]] = []
        duplicate_images = 0
        for digest, members in sorted(groups.items()):
            members.sort(key=lambda item: (item["mushroom_id"], item["image"]))
            labels = {member["label"] for member in members if member["label"]}
            if len(labels) > 1:
                sources = ", ".join(
                    f"{member['source_image_path']}={member['label']}"
                    for member in members
                    if member["label"]
                )
                raise ValueError(f"Exact duplicate images have conflicting labels: {sources}")
            representative = members[0]
            target = unique_image_root / representative["mushroom_id"] / representative["image"]
            target.parent.mkdir(parents=True, exist_ok=True)
            source = Path(representative["absolute_source_path"])
            try:
                os.link(source, target)
            except OSError:
                shutil.copy2(source, target)

            label = next(iter(labels), "")
            source_paths = [member["source_image_path"] for member in members]
            mushroom_ids = sorted({member["mushroom_id"] for member in members})
            manifest_row = {
                "image_path": _relative_to_project(output_dir / "images" / representative["mushroom_id"] / representative["image"]),
                "mushroom_id": representative["mushroom_id"],
                "image": representative["image"],
                "label": label,
                "label_id": LABEL_TO_ID[label] if label else "",
                "sha256": digest,
                "duplicate_count": len(members) - 1,
                "source_image_paths": json.dumps(source_paths, separators=(",", ":")),
                "mushroom_ids": json.dumps(mushroom_ids, separators=(",", ":")),
            }
            manifest_rows.append(manifest_row)
            duplicate_images += len(members) - 1
            canonical_path = manifest_row["image_path"]
            for member in members:
                source_map_rows.append(
                    {
                        "source_image_path": member["source_image_path"],
                        "canonical_image_path": canonical_path,
                        "sha256": digest,
                        "is_duplicate": str(member is not representative).lower(),
                    }
                )

        manifest_rows.sort(key=lambda row: (row["mushroom_id"], row["image"]))
        source_map_rows.sort(key=lambda row: row["source_image_path"])
        _write_csv(
            staged_dir / "manifest.csv",
            ("image_path", "mushroom_id", "image", "label", "label_id", "sha256", "duplicate_count", "source_image_paths", "mushroom_ids"),
            manifest_rows,
        )
        _write_csv(
            staged_dir / "source_map.csv",
            ("source_image_path", "canonical_image_path", "sha256", "is_duplicate"),
            source_map_rows,
        )
        _write_csv(staged_dir / "issues.csv", ("source_image_path", "reason"), issues)
        with (staged_dir / "mushrooms.jsonl").open("w", encoding="utf-8") as destination:
            for record in raw_mushrooms:
                destination.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")

        labels_summary = Counter(row["label"] for row in manifest_rows if row["label"])
        summary = {
            "status": "complete",
            "source_json": _relative_to_project(json_file),
            "source_images": _relative_to_project(image_root),
            "source_annotations": _relative_to_project(annotations) if annotations.is_file() else None,
            "deduplication": "exact SHA-256 over readable image files",
            "materialization": "hard links where supported, copy fallback otherwise",
            "source_image_files_expected": len(expected_rows),
            "source_image_files_readable": sum(len(members) for members in groups.values()),
            "unique_images": len(manifest_rows),
            "duplicate_images_removed": duplicate_images,
            "missing_or_invalid_images": len(issues),
            "labeled_unique_images": sum(labels_summary.values()),
            "labels": dict(sorted(labels_summary.items())),
            "manifest": _relative_to_project(output_dir / "manifest.csv"),
            "source_map": _relative_to_project(output_dir / "source_map.csv"),
            "raw_record_metadata": _relative_to_project(output_dir / "mushrooms.jsonl"),
            "issues": _relative_to_project(output_dir / "issues.csv"),
        }
        (staged_dir / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
        _atomic_replace_directory(staged_dir, output_dir)
    except BaseException:
        shutil.rmtree(staged_dir, ignore_errors=True)
        raise

    print(json.dumps(summary, indent=2))


def _load_reviewed_pairs(review_path: Path | None, source_to_hash: dict[str, str]) -> tuple[list[tuple[str, str]], int]:
    if review_path is None or not review_path.is_file():
        return [], 0
    pairs: set[tuple[str, str]] = set()
    ignored = 0
    with review_path.open(newline="", encoding="utf-8-sig") as source:
        reader = csv.DictReader(source)
        required = {"path_a", "path_b", "same_image"}
        if not required.issubset(reader.fieldnames or ()):
            raise ValueError(f"Near-duplicate review CSV must contain {sorted(required)}: {review_path}")
        for line_number, row in enumerate(reader, start=2):
            decision = (row.get("same_image") or "").strip().lower()
            if not decision or decision in {"false", "0", "no"}:
                continue
            if decision not in {"true", "1", "yes"}:
                raise ValueError(f"Invalid same_image value on line {line_number}: {decision!r}")
            left = Path((row.get("path_a") or "").strip().replace("\\", "/")).as_posix()
            right = Path((row.get("path_b") or "").strip().replace("\\", "/")).as_posix()
            if not left.startswith("images/"):
                left = f"images/{left}"
            if not right.startswith("images/"):
                right = f"images/{right}"
            if left not in source_to_hash or right not in source_to_hash:
                ignored += 1
                continue
            left_hash, right_hash = source_to_hash[left], source_to_hash[right]
            if left_hash != right_hash:
                pairs.add(tuple(sorted((left_hash, right_hash))))
    return sorted(pairs), ignored


@app.command()
def split(
    dataset_dir: Annotated[Path, typer.Option(help="Completed deduplicated dataset directory.")] = DEDUPLICATED_DIR,
    output_dir: Annotated[Path, typer.Option(help="Destination for train.csv, val.csv, and summary.json.")] = SPLITS_DIR,
    near_duplicate_review: Annotated[
        Path | None,
        typer.Option(help="Optional reviewed CSV with path_a,path_b,same_image columns; confirmed pairs stay in one split."),
    ] = DEFAULT_NEAR_DUPLICATE_REVIEW,
    folds: Annotated[int, typer.Option(min=2, help="Number of stratified group folds.")] = SPLIT_FOLDS,
    fold: Annotated[int, typer.Option(min=0, help="Fold index used as validation.")] = SPLIT_FOLD,
    seed: Annotated[int, typer.Option(help="Seed controlling the shuffled group folds.")] = SPLIT_SEED,
    overwrite: Annotated[bool, typer.Option(help="Replace existing split files after a successful rebuild.")] = False,
) -> None:
    """Split labeled rows from a completed deduplicated dataset by mushroom ID."""
    manifest_path = dataset_dir / "manifest.csv"
    summary_path = dataset_dir / "summary.json"
    if not manifest_path.is_file() or not summary_path.is_file():
        raise FileNotFoundError(f"Run the deduplicate command first; completed dataset not found at {dataset_dir}")
    dataset_summary = json.loads(summary_path.read_text(encoding="utf-8"))
    if dataset_summary.get("status") != "complete":
        raise ValueError(f"Deduplicated dataset is not marked complete: {dataset_dir}")
    if output_dir.exists() and not overwrite:
        raise FileExistsError(f"Split directory already exists: {output_dir}. Pass --overwrite to rebuild it.")
    if fold >= folds:
        raise ValueError(f"fold must be less than folds (got {fold} >= {folds})")

    with manifest_path.open(newline="", encoding="utf-8") as source:
        all_rows = list(csv.DictReader(source))
    rows = [row for row in all_rows if row["label"]]
    if not rows:
        raise ValueError("Deduplicated manifest contains no labeled images to split")
    source_to_hash: dict[str, str] = {}
    with (dataset_dir / "source_map.csv").open(newline="", encoding="utf-8") as source:
        for row in csv.DictReader(source):
            source_to_hash[row["source_image_path"]] = row["sha256"]

    groups = DisjointSet()
    for row in rows:
        image_node = f"image:{row['sha256']}"
        for mushroom_id in json.loads(row["mushroom_ids"]):
            groups.union(image_node, f"mushroom:{mushroom_id}")
    reviewed_pairs, ignored_review_pairs = _load_reviewed_pairs(near_duplicate_review, source_to_hash)
    for left_hash, right_hash in reviewed_pairs:
        groups.union(f"image:{left_hash}", f"image:{right_hash}")
    split_groups = [groups.find(f"image:{row['sha256']}") for row in rows]

    labels = [row["label"] for row in rows]
    splitter = StratifiedGroupKFold(n_splits=folds, shuffle=True, random_state=seed)
    folds_result = list(splitter.split(rows, labels, split_groups))
    train_indices, validation_indices = folds_result[fold]
    train_rows = [rows[index] for index in train_indices]
    validation_rows = [rows[index] for index in validation_indices]
    train_groups = {split_groups[index] for index in train_indices}
    validation_groups = {split_groups[index] for index in validation_indices}
    if train_groups & validation_groups:
        raise AssertionError("A mushroom or confirmed duplicate component appears in both splits")

    split_fields = tuple(all_rows[0].keys())
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    staged_dir = Path(tempfile.mkdtemp(prefix=f".{output_dir.name}.building-", dir=output_dir.parent))
    try:
        _write_csv(staged_dir / "train.csv", split_fields, train_rows)
        _write_csv(staged_dir / "val.csv", split_fields, validation_rows)
        summary = {
            "source_manifest": _relative_to_project(manifest_path),
            "source_dataset_summary": _relative_to_project(summary_path),
            "labels": LABEL_TO_ID,
            "labeled_unique_images": len(rows),
            "split_strategy": "StratifiedGroupKFold by mushroom ID and confirmed duplicate component",
            "near_duplicate_review": str(near_duplicate_review) if near_duplicate_review and near_duplicate_review.is_file() else None,
            "near_duplicate_pairs_confirmed": len(reviewed_pairs),
            "near_duplicate_review_pairs_ignored_unavailable": ignored_review_pairs,
            "split_seed": seed,
            "fold": fold,
            "folds": folds,
            "train": {
                "images": len(train_rows),
                "mushroom_ids": len({member for row in train_rows for member in json.loads(row["mushroom_ids"])}),
                "labels": dict(sorted(Counter(row["label"] for row in train_rows).items())),
            },
            "validation": {
                "images": len(validation_rows),
                "mushroom_ids": len({member for row in validation_rows for member in json.loads(row["mushroom_ids"])}),
                "labels": dict(sorted(Counter(row["label"] for row in validation_rows).items())),
            },
        }
        (staged_dir / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
        _atomic_replace_directory(staged_dir, output_dir)
    except BaseException:
        shutil.rmtree(staged_dir, ignore_errors=True)
        raise
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    app()
