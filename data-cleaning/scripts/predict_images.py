"""Predict macroscopic, microscopic, not-mushroom, or ambiguous images under data/images."""

from __future__ import annotations

import csv
import json
import os
import tempfile
import time
from pathlib import Path
from typing import Annotated, Any

import timm
import torch
from mlflow import MlflowClient
from huggingface_hub import hf_hub_download
from PIL import Image
from torch import Tensor
from torch.utils.data import DataLoader, Dataset
from tqdm import tqdm
import typer


PROJECT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_DIR.parent / "data"
DEFAULT_MLFLOW_URI = f"sqlite:///{DATA_DIR / 'artifacts/mlflow/mlflow.db'}"
MLFLOW_EXPERIMENT = "fungitastic-binary-head"
ID_TO_LABEL = {0: "macroscopic", 1: "micro"}
ID_TO_PREDICTION_LABEL = {0: "macroscopic", 1: "microscopic"}
MODEL_ID = "paulbauriegel/fungitastic-dinov3-vits16-384"
app = typer.Typer(help=__doc__)


class ImageFiles(Dataset[tuple[int, Tensor | None, str]]):
    def __init__(self, paths: list[Path], transform: Any) -> None:
        self.paths = paths
        self.transform = transform

    def __len__(self) -> int:
        return len(self.paths)

    def __getitem__(self, index: int) -> tuple[int, Tensor | None, str]:
        try:
            with Image.open(self.paths[index]) as source:
                image = source.convert("RGB")
            return index, self.transform(image), ""
        except Exception as error:
            message = f"{type(error).__name__}: {error}".replace("\n", " ")
            return index, None, message[:500]


def collate_images(
    batch: list[tuple[int, Tensor | None, str]],
) -> tuple[list[int], list[int], Tensor | None, dict[int, str]]:
    batch_order = [index for index, _, _ in batch]
    valid_rows = [(index, image) for index, image, error in batch if not error and image is not None]
    errors = {index: error for index, _, error in batch if error}
    valid_indices = [index for index, _ in valid_rows]
    images = torch.stack([image for _, image in valid_rows]) if valid_rows else None
    return batch_order, valid_indices, images, errors


def load_model(head_path: Path, device: torch.device) -> tuple[torch.nn.Module, Any, dict[str, Any]]:
    head_checkpoint = torch.load(head_path, map_location="cpu", weights_only=True)
    if head_checkpoint.get("model_id") != MODEL_ID:
        raise ValueError(f"Checkpoint was not trained from {MODEL_ID}: {head_path}")
    if head_checkpoint.get("label_to_id") != {"macroscopic": 0, "micro": 1}:
        raise ValueError(f"Checkpoint has an unexpected binary label mapping: {head_path}")
    if head_checkpoint.get("output_mode") != "multilabel_sigmoid":
        raise ValueError("Checkpoint uses the old single-label objective; retrain with scripts/train_binary_head.py.")
    revision = head_checkpoint.get("model_revision")
    if not revision:
        raise ValueError(f"Checkpoint does not record its base-model revision: {head_path}")

    base_path = hf_hub_download(repo_id=MODEL_ID, filename="best.pt", revision=revision)
    base_checkpoint = torch.load(base_path, map_location="cpu", weights_only=False)
    model = timm.create_model(
        base_checkpoint["model_name"],
        pretrained=False,
        num_classes=int(base_checkpoint["num_classes"]),
        img_size=int(base_checkpoint["img_size"]),
    )
    model.load_state_dict(base_checkpoint["model_state"], strict=True)
    model.reset_classifier(num_classes=len(ID_TO_LABEL))
    model.get_classifier().load_state_dict(head_checkpoint["classifier_state_dict"], strict=True)
    last_transformer_block_state = head_checkpoint.get("last_transformer_block_state_dict")
    if last_transformer_block_state is not None:
        blocks = getattr(model, "blocks", None)
        if blocks is None or len(blocks) == 0:
            raise TypeError("Checkpoint contains a tuned final block, but this model exposes no model.blocks.")
        blocks[-1].load_state_dict(last_transformer_block_state, strict=True)
    model.to(device).eval()

    data_config = head_checkpoint.get("data_config") or timm.data.resolve_model_data_config(model)
    transform = timm.data.create_transform(**data_config, is_training=False)
    return model, transform, data_config


def resolve_mlflow_checkpoint(
    tracking_uri: str,
    experiment_name: str,
    run_id: str | None = None,
) -> tuple[Path, str]:
    client = MlflowClient(tracking_uri=tracking_uri)
    experiment = client.get_experiment_by_name(experiment_name)
    if experiment is None:
        raise ValueError(f"MLflow experiment does not exist: {experiment_name}")

    if run_id is not None:
        run = client.get_run(run_id)
        if run.info.experiment_id != experiment.experiment_id:
            raise ValueError(f"MLflow run {run_id} is not in experiment {experiment_name!r}.")
        if run.info.status != "FINISHED":
            raise ValueError(f"MLflow run {run_id} is not FINISHED (status={run.info.status}).")
        candidate_runs = [run]
    else:
        candidate_runs = client.search_runs(
            [experiment.experiment_id],
            filter_string="attributes.status = 'FINISHED'",
            order_by=["attributes.start_time DESC"],
            max_results=100,
        )

    for run in candidate_runs:
        checkpoint_artifact = "checkpoint/best_binary_head.pt"
        artifacts = client.list_artifacts(run.info.run_id, "checkpoint")
        if not any(Path(artifact.path).name == "best_binary_head.pt" for artifact in artifacts):
            continue
        downloaded_path = Path(client.download_artifacts(run.info.run_id, checkpoint_artifact))
        if downloaded_path.is_file():
            return downloaded_path, run.info.run_id

    if run_id is not None:
        raise FileNotFoundError(f"MLflow run {run_id} does not contain {checkpoint_artifact}.")
    raise FileNotFoundError(
        f"No FINISHED run in experiment {experiment_name!r} contains checkpoint/best_binary_head.pt."
    )


def log_prediction_run(
    tracking_uri: str,
    experiment_name: str,
    training_run_id: str,
    prediction_file: Path,
    *,
    batch_size: int,
    auto_batch_size: bool,
    max_batch_size: int,
    num_workers: int,
    image_root: Path,
    files_found: int,
    predictions_written: int,
    failed_files: int,
    unknown_predictions: int,
    not_mushroom_predictions: int,
    seconds: float,
) -> tuple[str, str]:
    """Record a child prediction run and log its CSV under the training run."""
    client = MlflowClient(tracking_uri=tracking_uri)
    training_run = client.get_run(training_run_id)
    experiment = client.get_experiment_by_name(experiment_name)
    if experiment is None or training_run.info.experiment_id != experiment.experiment_id:
        raise ValueError(f"Training run {training_run_id} is not in experiment {experiment_name!r}.")

    prediction_run = client.create_run(
        experiment.experiment_id,
        tags={
            "mlflow.parentRunId": training_run_id,
            "run_type": "prediction",
            "model_id": MODEL_ID,
        },
        run_name=f"prediction-{time.strftime('%Y%m%d-%H%M%S')}",
    )
    prediction_run_id = prediction_run.info.run_id
    artifact_directory = f"predictions/{prediction_run_id}"
    try:
        parameters = {
            "training_run_id": training_run_id,
            "model_id": MODEL_ID,
            "batch_size": batch_size,
            "auto_batch_size": auto_batch_size,
            "max_batch_size": max_batch_size,
            "num_workers": num_workers,
            "image_root": str(image_root),
            "output_file": prediction_file.name,
        }
        for key, value in parameters.items():
            client.log_param(prediction_run_id, key, str(value))
        metrics = {
            "files_found": files_found,
            "predictions_written": predictions_written,
            "failed_files": failed_files,
            "unknown_predictions": unknown_predictions,
            "not_mushroom_predictions": not_mushroom_predictions,
            "seconds": seconds,
        }
        for key, value in metrics.items():
            client.log_metric(prediction_run_id, key, float(value), step=0)
        client.log_artifact(training_run_id, str(prediction_file), artifact_path=artifact_directory)
        artifact_path = f"{artifact_directory}/{prediction_file.name}"
        client.set_tag(prediction_run_id, "prediction_artifact_path", artifact_path)
        client.set_terminated(prediction_run_id, status="FINISHED")
    except BaseException:
        client.set_terminated(prediction_run_id, status="FAILED")
        raise
    return prediction_run_id, artifact_path


def batch_fits(model: torch.nn.Module, device: torch.device, input_size: tuple[int, ...], batch_size: int) -> bool:
    try:
        images = torch.zeros((batch_size, *input_size), dtype=torch.float32, device=device)
        with torch.inference_mode(), torch.autocast(device_type="cuda", dtype=torch.bfloat16):
            logits = model(images)
            logits.float().sigmoid()
        torch.cuda.synchronize(device)
        del images, logits
        torch.cuda.empty_cache()
        return True
    except torch.cuda.OutOfMemoryError:
        torch.cuda.empty_cache()
        return False


def find_max_batch_size(
    model: torch.nn.Module,
    device: torch.device,
    input_size: tuple[int, ...],
    cap: int,
) -> tuple[int, bool]:
    """Start at an estimated batch of 256, then grow or back off to find a fit."""
    lower = 0
    candidate = min(256, cap)
    if batch_fits(model, device, input_size, candidate):
        lower = candidate
        while lower < cap:
            candidate = min(lower * 2, cap)
            if not batch_fits(model, device, input_size, candidate):
                break
            lower = candidate

    if lower == cap:
        return lower, True
    upper = candidate
    if lower == 0:
        if not batch_fits(model, device, input_size, 1):
            raise RuntimeError("The model cannot run inference with a batch size of one on this GPU.")
        lower = 1
    while lower + 1 < upper:
        middle = (lower + upper) // 2
        if batch_fits(model, device, input_size, middle):
            lower = middle
        else:
            upper = middle
    return lower, False


@app.command()
def predict(
    image_root: Annotated[Path, typer.Option(help="Root directory containing all images to classify.")] = DATA_DIR / "images",
    mlflow_tracking_uri: Annotated[str, typer.Option(help="MLflow tracking URI.")] = DEFAULT_MLFLOW_URI,
    mlflow_experiment: Annotated[str, typer.Option(help="MLflow experiment containing fine-tuned heads.")] = MLFLOW_EXPERIMENT,
    mlflow_run_id: Annotated[str | None, typer.Option(help="Use this run; defaults to the latest finished run with a checkpoint.")] = None,
    batch_size: Annotated[int, typer.Option(min=1, help="Inference batch size when auto probing is disabled.")] = 16,
    auto_batch_size: Annotated[bool, typer.Option(help="Probe CUDA, then use its largest successful batch.")] = False,
    max_batch_size: Annotated[int, typer.Option(min=1, help="Upper bound for automatic batch probing.")] = 4096,
    num_workers: Annotated[int, typer.Option(min=0)] = 8,
    device: Annotated[str, typer.Option(help="Inference requires the host CUDA GPU.")] = "cuda",
) -> None:
    """Log class probabilities and predictions for every image file to MLflow."""
    if batch_size < 1 or max_batch_size < 1 or num_workers < 0:
        raise ValueError("batch sizes must be positive and worker count cannot be negative")
    if device != "cuda":
        raise ValueError("This prediction entrypoint requires --device cuda.")
    if not image_root.is_dir():
        raise FileNotFoundError(f"Image directory does not exist: {image_root}")
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is unavailable. Run this script outside the sandbox on the host GPU.")

    image_root = image_root.resolve()
    paths = sorted(path for path in image_root.rglob("*") if path.is_file())
    if not paths:
        raise ValueError(f"No files found under {image_root}")

    device = torch.device("cuda")
    head_checkpoint, training_run_id = resolve_mlflow_checkpoint(
        mlflow_tracking_uri,
        mlflow_experiment,
        mlflow_run_id,
    )
    print(f"Using head checkpoint from MLflow run {training_run_id}")
    print(f"Loading {MODEL_ID} on {torch.cuda.get_device_name(device)}")
    model, transform, data_config = load_model(head_checkpoint, device)
    input_size = tuple(int(dimension) for dimension in data_config["input_size"])
    batch_size_cap_reached = False
    if auto_batch_size:
        batch_size, batch_size_cap_reached = find_max_batch_size(
            model,
            device,
            input_size,
            max_batch_size,
        )
        cap_note = " (cap reached; increase --max-batch-size to probe further)" if batch_size_cap_reached else ""
        print(f"Largest tested inference batch: {batch_size}{cap_note}")
    dataset = ImageFiles(paths, transform)
    loader_batch_size = min(64, batch_size)
    loader = DataLoader(
        dataset,
        batch_size=loader_batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=True,
        persistent_workers=num_workers > 0,
        prefetch_factor=1 if num_workers > 0 else None,
        collate_fn=collate_images,
    )
    input_size = tuple(int(dimension) for dimension in data_config["input_size"])
    gpu_batch = torch.empty((batch_size, *input_size), dtype=torch.float32, device=device)
    probabilities_by_index: list[list[float] | None] = [None] * len(paths)
    errors_by_index: list[str] = [""] * len(paths)
    pending_indices: list[int] = []
    pending_count = 0
    started = time.perf_counter()

    def flush_pending() -> None:
        nonlocal pending_count
        if not pending_indices:
            return
        with torch.inference_mode(), torch.autocast(device_type="cuda", dtype=torch.bfloat16):
            probabilities = model(gpu_batch[:pending_count]).float().sigmoid().cpu()
        for position, index in enumerate(pending_indices):
            probabilities_by_index[index] = probabilities[position].tolist()
        pending_indices.clear()
        pending_count = 0

    for _, valid_indices, images, errors in tqdm(
        loader,
        total=(len(paths) + loader_batch_size - 1) // loader_batch_size,
        desc="Loading image chunks",
        unit="chunk",
    ):
        for index, error in errors.items():
            errors_by_index[index] = error
        if images is not None:
            offset = 0
            while offset < len(valid_indices):
                count = min(batch_size - pending_count, len(valid_indices) - offset)
                gpu_batch[pending_count : pending_count + count].copy_(
                    images[offset : offset + count],
                    non_blocking=True,
                )
                pending_indices.extend(valid_indices[offset : offset + count])
                pending_count += count
                offset += count
                if pending_count == batch_size:
                    flush_pending()
    flush_pending()

    temporary_output_dir = tempfile.TemporaryDirectory(prefix="find-fungi-predictions-")
    output = Path(temporary_output_dir.name) / "predictions.csv"
    partial_output = output.with_name(output.name + ".partial")
    fieldnames = (
        "image_path",
        "mushroom_id",
        "image",
        "predicted_label",
        "probability_macroscopic",
        "probability_micro",
        "confidence",
        "error",
    )
    failed = 0

    try:
        with partial_output.open("w", newline="", encoding="utf-8") as output_file:
            writer = csv.DictWriter(output_file, fieldnames=fieldnames)
            writer.writeheader()
            for index, path in enumerate(paths):
                relative_path = path.relative_to(image_root).as_posix()
                probabilities = probabilities_by_index[index]
                error = errors_by_index[index]
                if probabilities is None:
                    failed += 1
                    writer.writerow(
                        {
                            "image_path": (Path("images") / relative_path).as_posix(),
                            "mushroom_id": path.parent.name,
                            "image": path.name,
                            "predicted_label": "",
                            "probability_macroscopic": "",
                            "probability_micro": "",
                            "confidence": "",
                            "error": error or "Image could not be decoded or transformed",
                        }
                    )
                else:
                    predicted_ids = [
                        label_id
                        for label_id, probability in enumerate(probabilities)
                        if probability >= 0.5
                    ]
                    if len(predicted_ids) == 0:
                        predicted_label = "not-mushroom"
                        confidence = 1.0 - max(probabilities)
                    elif len(predicted_ids) == 1:
                        predicted_label = ID_TO_PREDICTION_LABEL[predicted_ids[0]]
                        confidence = probabilities[predicted_ids[0]]
                    else:
                        predicted_label = "unknown"
                        confidence = ""
                    writer.writerow(
                        {
                            "image_path": (Path("images") / relative_path).as_posix(),
                            "mushroom_id": path.parent.name,
                            "image": path.name,
                            "predicted_label": predicted_label,
                            "probability_macroscopic": f"{probabilities[0]:.8f}",
                            "probability_micro": f"{probabilities[1]:.8f}",
                            "confidence": f"{confidence:.8f}" if confidence != "" else "",
                            "error": "",
                        }
                    )

        os.replace(partial_output, output)
    except BaseException:
        partial_output.unlink(missing_ok=True)
        raise

    seconds = round(time.perf_counter() - started, 2)
    predictions_written = len(paths) - failed
    unknown_predictions = sum(
        probabilities is not None and sum(probability >= 0.5 for probability in probabilities) == 2
        for probabilities in probabilities_by_index
    )
    not_mushroom_predictions = sum(
        probabilities is not None and sum(probability >= 0.5 for probability in probabilities) == 0
        for probabilities in probabilities_by_index
    )
    prediction_run_id, artifact_path = log_prediction_run(
        mlflow_tracking_uri,
        mlflow_experiment,
        training_run_id,
        output,
        batch_size=batch_size,
        auto_batch_size=auto_batch_size,
        max_batch_size=max_batch_size,
        num_workers=num_workers,
        image_root=image_root,
        files_found=len(paths),
        predictions_written=predictions_written,
        failed_files=failed,
        unknown_predictions=unknown_predictions,
        not_mushroom_predictions=not_mushroom_predictions,
        seconds=seconds,
    )
    temporary_output_dir.cleanup()

    print(
        json.dumps(
            {
                "files_found": len(paths),
                "predictions_written": predictions_written,
                "failed_files": failed,
                "mlflow_training_run_id": training_run_id,
                "mlflow_prediction_run_id": prediction_run_id,
                "mlflow_artifact_path": artifact_path,
                "unknown_predictions": unknown_predictions,
                "not_mushroom_predictions": not_mushroom_predictions,
                "batch_size": batch_size,
                "batch_size_cap_reached": batch_size_cap_reached,
                "num_workers": num_workers,
                "seconds": seconds,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    app()
