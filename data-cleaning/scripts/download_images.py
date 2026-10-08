"""Download mushroom images listed in the project JSON data."""


import os
import re
import shutil
import tempfile
from collections.abc import Iterator
from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from http.client import HTTPException
from math import isfinite
from pathlib import Path
from time import sleep
from typing import Annotated, Literal, TypeAlias
from pydantic import AnyHttpUrl, BaseModel, Field, StrictInt, StrictStr, ValidationError, field_validator
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import typer
from tqdm import tqdm

app = typer.Typer(help=__doc__)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_JSON = PROJECT_ROOT / "data" / "mushrooms.json"
DEFAULT_OUTPUT = PROJECT_ROOT / "data" / "images"

USER_AGENT="CoolBot/0.0 (https://example.org/coolbot/; coolbot@example.org) generic-library/0.0"

DownloadStatus: TypeAlias = Literal["downloaded", "skipped", "failed"]
DownloadResult: TypeAlias = tuple[DownloadStatus, str | None]


class MushroomProperties(BaseModel):
    images: list[AnyHttpUrl] = Field(default_factory=list)


class MushroomRecord(BaseModel):
    id: StrictInt | StrictStr
    properties: MushroomProperties

    @field_validator("id")
    @classmethod
    def validate_output_id(cls, value: int | str) -> int | str:
        folder_name = str(value)
        if (
            folder_name in {"", ".", ".."}
            or Path(folder_name).name != folder_name
            or "/" in folder_name
            or "\\" in folder_name
        ):
            raise ValueError(f"Unsafe mushroom id for output path: {folder_name!r}")
        return value


class MushroomsFile(BaseModel):
    mushrooms: list[MushroomRecord]


@dataclass(frozen=True)
class Download:
    destination: Path
    url: str


def image_downloads(
    data: MushroomsFile, output_dir: Path
) -> Iterator[Download]:
    """Yield one safe, uniquely named destination for each image URL."""
    for mushroom in data.mushrooms:
        mushroom_id = str(mushroom.id)
        for index, url in enumerate(mushroom.properties.images, start=1):
            suffix = Path(url.path or "").suffix
            if not re.fullmatch(r"\.[A-Za-z0-9]{1,10}", suffix):
                suffix = ".img"
            destination = output_dir / mushroom_id / f"{index:04d}{suffix.lower()}"
            yield Download(destination=destination, url=str(url))


def retry_delay(error: HTTPError, retry_number: int) -> float:
    """Return the server's Retry-After delay, or a bounded exponential fallback."""
    retry_after = error.headers.get("Retry-After") if error.headers is not None else None
    if retry_after is not None:
        retry_after = retry_after.strip()
        try:
            delay_seconds = float(retry_after)
        except ValueError:
            try:
                retry_at = parsedate_to_datetime(retry_after)
            except (TypeError, ValueError, OverflowError):
                retry_at = None
            if retry_at is not None:
                if retry_at.tzinfo is None:
                    retry_at = retry_at.replace(tzinfo=timezone.utc)
                return max(0.0, (retry_at - datetime.now(timezone.utc)).total_seconds())
        else:
            if isfinite(delay_seconds) and delay_seconds >= 0:
                return delay_seconds

    return min(60.0, 2.0**retry_number)


def remove_temporary_file(path: Path | None) -> None:
    if path is None:
        return
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass


def download_one(
    job: Download,
    timeout: float,
    overwrite: bool,
    max_retries: int,
) -> DownloadResult:
    """Download one image atomically, returning a typed status and optional error."""
    destination = job.destination
    temporary_path: Path | None = None
    retries = 0
    try:
        if not overwrite and destination.is_file() and destination.stat().st_size > 0:
            return "skipped", None

        destination.parent.mkdir(parents=True, exist_ok=True)
        while True:
            request = Request(job.url, headers={"User-Agent": USER_AGENT})
            try:
                with urlopen(request, timeout=timeout) as response:
                    with tempfile.NamedTemporaryFile(
                        mode="wb",
                        dir=destination.parent,
                        prefix=f".{destination.name}.",
                        delete=False,
                    ) as temporary_file:
                        temporary_path = Path(temporary_file.name)
                        shutil.copyfileobj(response, temporary_file)
                        if temporary_file.tell() == 0:
                            raise OSError("server returned an empty image")

                if temporary_path is None:
                    raise OSError("could not create a temporary image file")
                os.replace(temporary_path, destination)
                return "downloaded", None
            except HTTPError as error:
                if error.code != 429 or retries >= max_retries:
                    error.close()
                    remove_temporary_file(temporary_path)
                    return "failed", f"{job.url}: {error}"

                delay = retry_delay(error, retries)
                error.close()
                sleep(delay)
                retries += 1
            except (HTTPException, OSError, URLError, ValueError) as error:
                remove_temporary_file(temporary_path)
                return "failed", f"{job.url}: {error}"
    except (OSError, OverflowError, ValueError) as error:
        remove_temporary_file(temporary_path)
        return "failed", f"{job.url}: {error}"


@app.command()
def download(
    json_file: Annotated[
        Path,
        typer.Option(
            "--json",
            help="JSON file containing the mushroom records.",
            exists=True,
            file_okay=True,
            dir_okay=False,
            readable=True,
            resolve_path=True,
        ),
    ] = DEFAULT_JSON,
    output_dir: Annotated[
        Path,
        typer.Option(
            "--output-dir",
            help="Directory where images are stored under one folder per mushroom id.",
            file_okay=False,
            resolve_path=True,
        ),
    ] = DEFAULT_OUTPUT,
    workers: Annotated[
        int,
        typer.Option(min=1, max=64, help="Maximum concurrent downloads."),
    ] = 8,
    timeout: Annotated[
        float,
        typer.Option(min=1.0, help="Timeout for each image request, in seconds."),
    ] = 30.0,
    max_retries: Annotated[
        int,
        typer.Option(min=0, max=20, help="Maximum retries after HTTP 429 responses."),
    ] = 5,
    overwrite: Annotated[
        bool,
        typer.Option(help="Download again when an image file already exists."),
    ] = False,
) -> None:
    """Download every image to data/images/<mushroom-id>/."""
    try:
        data = MushroomsFile.model_validate_json(json_file.read_bytes())
    except (OSError, ValidationError) as error:
        raise typer.BadParameter(f"Could not read or validate JSON file {json_file}: {error}") from error

    jobs = list(image_downloads(data, output_dir))
    if not jobs:
        typer.echo("No image URLs found.")
        raise typer.Exit()

    counts: dict[DownloadStatus, int] = {"downloaded": 0, "skipped": 0, "failed": 0}
    errors: list[str] = []
    pending: set[Future[DownloadResult]] = set()
    job_iterator = iter(jobs)

    with ThreadPoolExecutor(max_workers=workers) as executor:
        with tqdm(total=len(jobs), desc="Downloading images", unit="image") as progress:
            while True:
                while len(pending) < workers * 2:
                    try:
                        job = next(job_iterator)
                    except StopIteration:
                        break
                    pending.add(
                        executor.submit(download_one, job, timeout, overwrite, max_retries)
                    )

                if not pending:
                    break

                completed, _ = wait(pending, return_when=FIRST_COMPLETED)
                for future in completed:
                    pending.remove(future)
                    status, error = future.result()
                    counts[status] += 1
                    if status == "failed" and error is not None and len(errors) < 20:
                        errors.append(error)
                    progress.update()

    typer.echo(
        f"Images: {len(jobs)} total; {counts['downloaded']} downloaded, "
        f"{counts['skipped']} already present, {counts['failed']} failed."
    )
    for error in errors:
        typer.echo(f"Failed: {error}", err=True)
    if counts["failed"]:
        raise typer.Exit(code=1)


if __name__ == "__main__":
    app()
