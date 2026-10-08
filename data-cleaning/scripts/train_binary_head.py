"""Train a two-output multilabel head, encoding not-mushroom images as [0, 0]."""

from __future__ import annotations

import atexit
import csv
import json
import random
from collections import Counter
from pathlib import Path
from typing import Annotated, Any

import numpy as np
import timm
import torch
import mlflow
from huggingface_hub import hf_hub_download
from PIL import Image
from torch import nn
from torch.utils.data import DataLoader, Dataset
import typer


PROJECT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_DIR.parent / "data"
MODEL_ID = "paulbauriegel/fungitastic-dinov3-vits16-384"
DEFAULT_MLFLOW_URI = f"sqlite:///{DATA_DIR / 'artifacts/mlflow/mlflow.db'}"
LABEL_TO_ID = {"macroscopic": 0, "micro": 1}
ID_TO_LABEL = {value: key for key, value in LABEL_TO_ID.items()}
NOT_MUSHROOM_LABEL = "not-mushroom"
NOT_MUSHROOM_LABEL_ID = -1
TRAIN_LABEL_ID_TO_NAME = {NOT_MUSHROOM_LABEL_ID: NOT_MUSHROOM_LABEL, **ID_TO_LABEL}
app = typer.Typer(help=__doc__)


class AnnotatedImages(Dataset[tuple[torch.Tensor, torch.Tensor]]):
    def __init__(self, manifest: Path, transform: Any) -> None:
        self.transform = transform
        with manifest.open(newline="", encoding="utf-8") as source:
            self.rows = list(csv.DictReader(source))
        if not self.rows:
            raise ValueError(f"No image rows in manifest: {manifest}")

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, torch.Tensor]:
        row = self.rows[index]
        image_path = (PROJECT_DIR / row["image_path"]).resolve()
        with Image.open(image_path) as source:
            image = source.convert("RGB")
        label_id = int(row["label_id"])
        if label_id == NOT_MUSHROOM_LABEL_ID:
            target = torch.zeros(len(LABEL_TO_ID), dtype=torch.float32)
        else:
            target = nn.functional.one_hot(
                torch.tensor(label_id), num_classes=len(LABEL_TO_ID)
            ).to(torch.float32)
        return self.transform(image), target


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def read_label_counts(manifest: Path) -> Counter[int]:
    with manifest.open(newline="", encoding="utf-8") as source:
        return Counter(int(row["label_id"]) for row in csv.DictReader(source))


def calculate_metrics(
    targets: list[list[int]], predictions: list[list[int]], losses: list[float]
) -> dict[str, Any]:
    per_label: dict[str, dict[str, int]] = {}
    balanced_accuracies = []
    f1_scores = []
    for label_id, label in ID_TO_LABEL.items():
        pairs = zip(targets, predictions, strict=True)
        true_positive = sum(target[label_id] == 1 and prediction[label_id] == 1 for target, prediction in pairs)
        pairs = zip(targets, predictions, strict=True)
        false_negative = sum(target[label_id] == 1 and prediction[label_id] == 0 for target, prediction in pairs)
        pairs = zip(targets, predictions, strict=True)
        false_positive = sum(target[label_id] == 0 and prediction[label_id] == 1 for target, prediction in pairs)
        pairs = zip(targets, predictions, strict=True)
        true_negative = sum(target[label_id] == 0 and prediction[label_id] == 0 for target, prediction in pairs)
        precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 0.0
        recall = true_positive / (true_positive + false_negative) if true_positive + false_negative else 0.0
        specificity = true_negative / (true_negative + false_positive) if true_negative + false_positive else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        balanced_accuracies.append((recall + specificity) / 2)
        f1_scores.append(f1)
        per_label[label] = {
            "true_positive": true_positive,
            "false_negative": false_negative,
            "false_positive": false_positive,
            "true_negative": true_negative,
        }

    total = len(targets)
    exact_match_accuracy = (
        sum(target == prediction for target, prediction in zip(targets, predictions, strict=True)) / total
        if total
        else 0.0
    )
    return {
        "loss": float(np.mean(losses)) if losses else 0.0,
        "exact_match_accuracy": exact_match_accuracy,
        "balanced_accuracy": float(np.mean(balanced_accuracies)),
        "macro_f1": float(np.mean(f1_scores)),
        "per_label_confusion": per_label,
        "label_support": {
            label: sum(target[label_id] for target in targets)
            for label_id, label in ID_TO_LABEL.items()
        },
    }


def run_epoch(
    model: nn.Module,
    classifier: nn.Module,
    last_transformer_block: nn.Module | None,
    loader: DataLoader,
    device: torch.device,
    loss_function: nn.Module,
    optimizer: torch.optim.Optimizer | None,
) -> dict[str, Any]:
    training = optimizer is not None
    model.eval()
    classifier.train(training)
    if last_transformer_block is not None:
        last_transformer_block.train(training)
    targets: list[list[int]] = []
    predictions: list[list[int]] = []
    losses: list[float] = []

    for images, labels in loader:
        images = images.to(device, non_blocking=True)
        labels = labels.to(device, non_blocking=True)
        if training:
            optimizer.zero_grad(set_to_none=True)

        with torch.set_grad_enabled(training):
            with torch.autocast(
                device_type="cuda",
                dtype=torch.bfloat16,
                enabled=device.type == "cuda",
            ):
                logits = model(images)
                multilabel_targets = labels.float()
                loss = loss_function(logits.float(), multilabel_targets)
            if training:
                loss.backward()
                optimizer.step()

        losses.append(float(loss.detach().cpu()))
        targets.extend(multilabel_targets.detach().to(torch.int64).cpu().tolist())
        predictions.extend((logits.detach().float().sigmoid() >= 0.5).to(torch.int64).cpu().tolist())

    return calculate_metrics(targets, predictions, losses)


def save_history(path: Path, history: list[dict[str, Any]]) -> None:
    fields = (
        "epoch",
        "train_loss",
        "val_loss",
        "val_exact_match_accuracy",
        "val_balanced_accuracy",
        "val_macro_f1",
    )
    with path.open("w", newline="", encoding="utf-8") as destination:
        writer = csv.DictWriter(destination, fieldnames=fields)
        writer.writeheader()
        writer.writerows({key: row[key] for key in fields} for row in history)


def close_unfinished_mlflow_run() -> None:
    """Mark the active run failed if training exits before normal completion."""
    if mlflow.active_run() is not None:
        mlflow.end_run(status="FAILED")


@app.command()
def train(
    train_csv: Annotated[Path, typer.Option(help="Training manifest generated by prepare_dataset.py.")] = DATA_DIR / "dataset/splits/train.csv",
    val_csv: Annotated[Path, typer.Option(help="Validation manifest generated by prepare_dataset.py.")] = DATA_DIR / "dataset/splits/val.csv",
    output_dir: Annotated[Path, typer.Option(help="Directory for the head, metrics, and history.")] = DATA_DIR / "artifacts/fungitastic-binary",
    mlflow_tracking_uri: Annotated[str, typer.Option(help="MLflow tracking URI; defaults to a local SQLite database.")] = DEFAULT_MLFLOW_URI,
    mlflow_experiment: Annotated[str, typer.Option(help="MLflow experiment name.")] = "fungitastic-binary-head",
    device: Annotated[str, typer.Option(help="Training requires the host CUDA GPU.")] = "cuda",
    batch_size: Annotated[int, typer.Option(min=1)] = 16,
    epochs: Annotated[int, typer.Option(min=1)] = 50,
    patience: Annotated[int, typer.Option(min=1)] = 5,
    learning_rate: Annotated[float, typer.Option(min=0.0)] = 1e-3,
    train_last_layer: Annotated[
        bool,
        typer.Option(
            "--train-last-layer/--freeze-last-layer",
            help="Also train the final transformer block immediately before the classification head.",
        ),
    ] = False,
    last_layer_learning_rate: Annotated[
        float,
        typer.Option(min=0.0, help="Learning rate for the optional final transformer block (default: 1e-6)."),
    ] = 1e-6,
    weight_decay: Annotated[float, typer.Option(min=0.0)] = 0.05,
    seed: Annotated[int, typer.Option()] = 42,
    num_workers: Annotated[int, typer.Option(min=0)] = 8,
) -> None:
    """Train the binary head and optionally its final transformer block."""
    if device != "cuda":
        raise ValueError("This training entrypoint requires --device cuda.")
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is unavailable. Run this script outside the sandbox on the host GPU.")
    if not train_csv.is_file() or not val_csv.is_file():
        raise FileNotFoundError(
            "Split manifests are missing; first run `uv run python scripts/prepare_dataset.py deduplicate` "
            "and then `uv run python scripts/prepare_dataset.py split`."
        )

    set_seed(seed)
    device = torch.device("cuda")
    output_dir.mkdir(parents=True, exist_ok=True)
    mlflow.set_tracking_uri(mlflow_tracking_uri)
    if mlflow_tracking_uri.startswith("sqlite:///"):
        artifact_root = DATA_DIR / "artifacts/mlflow/artifacts"
        artifact_root.mkdir(parents=True, exist_ok=True)
        if mlflow.get_experiment_by_name(mlflow_experiment) is None:
            mlflow.create_experiment(
                mlflow_experiment,
                artifact_location=artifact_root.as_uri(),
            )
    mlflow.set_experiment(mlflow_experiment)
    print(f"Device: {torch.cuda.get_device_name(device)}")
    print(f"CUDA: {torch.version.cuda}; PyTorch: {torch.__version__}")

    base_checkpoint_path = hf_hub_download(repo_id=MODEL_ID, filename="best.pt")
    base_model_revision = Path(base_checkpoint_path).parent.name
    base_checkpoint = torch.load(base_checkpoint_path, map_location="cpu", weights_only=False)
    model = timm.create_model(
        base_checkpoint["model_name"],
        pretrained=False,
        num_classes=int(base_checkpoint["num_classes"]),
        img_size=int(base_checkpoint["img_size"]),
    )
    model.load_state_dict(base_checkpoint["model_state"], strict=True)
    if not hasattr(model, "reset_classifier") or not hasattr(model, "get_classifier"):
        raise TypeError("The loaded timm model does not expose the expected classifier interface.")
    model.reset_classifier(num_classes=len(LABEL_TO_ID))

    for parameter in model.parameters():
        parameter.requires_grad_(False)
    classifier = model.get_classifier()
    if not isinstance(classifier, nn.Module):
        raise TypeError("Expected the model's classifier to be a torch module.")
    for parameter in classifier.parameters():
        parameter.requires_grad_(True)

    last_transformer_block: nn.Module | None = None
    if train_last_layer:
        blocks = getattr(model, "blocks", None)
        if blocks is None or len(blocks) == 0:
            raise TypeError("--train-last-layer requires a timm model exposing non-empty model.blocks.")
        last_transformer_block = blocks[-1]
        if not isinstance(last_transformer_block, nn.Module):
            raise TypeError("Expected the final transformer block to be a torch module.")
        for parameter in last_transformer_block.parameters():
            parameter.requires_grad_(True)

    classifier_parameter_ids = {id(parameter) for parameter in classifier.parameters()}
    last_layer_parameter_ids = (
        {id(parameter) for parameter in last_transformer_block.parameters()}
        if last_transformer_block is not None
        else set()
    )
    expected_trainable_parameter_ids = classifier_parameter_ids | last_layer_parameter_ids
    trainable_parameter_ids = {id(parameter) for parameter in model.parameters() if parameter.requires_grad}
    if not classifier_parameter_ids or trainable_parameter_ids != expected_trainable_parameter_ids:
        raise AssertionError("Only the selected binary head and final transformer block may be trainable.")
    model.to(device)
    classifier = model.get_classifier()
    if (
        not isinstance(classifier, nn.Linear)
        or classifier.out_features != len(LABEL_TO_ID)
        or classifier.bias is None
    ):
        raise TypeError("Expected a two-output linear classifier with a bias for multilabel classification.")

    data_config = timm.data.resolve_model_data_config(model)
    train_transform = timm.data.create_transform(**data_config, is_training=True)
    val_transform = timm.data.create_transform(**data_config, is_training=False)
    train_dataset = AnnotatedImages(train_csv, train_transform)
    val_dataset = AnnotatedImages(val_csv, val_transform)

    train_counts = read_label_counts(train_csv)
    missing_classes = set(LABEL_TO_ID.values()) - set(train_counts)
    if missing_classes:
        raise ValueError(f"Training split has no examples for class IDs: {sorted(missing_classes)}")
    train_prevalences = torch.tensor(
        [train_counts[index] / len(train_dataset) for index in range(len(LABEL_TO_ID))],
        dtype=classifier.bias.dtype,
        device=device,
    )
    with torch.no_grad():
        classifier.bias.copy_(torch.logit(train_prevalences))
    train_loss_function = nn.BCEWithLogitsLoss()
    val_loss_function = nn.BCEWithLogitsLoss()

    training_component = (
        "binary classification head and final transformer block"
        if train_last_layer
        else "binary classification head only"
    )
    active_run = mlflow.start_run(
        run_name=f"{'head-plus-last-layer' if train_last_layer else 'head-only'}-seed-{seed}"
    )
    run_id = active_run.info.run_id
    atexit.register(close_unfinished_mlflow_run)
    mlflow.set_tags(
        {
            "model_id": MODEL_ID,
            "model_revision": base_model_revision,
            "training_component": training_component,
            "output_mode": "multilabel_sigmoid",
            "negative_label": NOT_MUSHROOM_LABEL,
            "framework": "pytorch",
        }
    )
    mlflow.log_params(
        {
            "model_id": MODEL_ID,
            "model_revision": base_model_revision,
            "train_images": len(train_dataset),
            "validation_images": len(val_dataset),
            "train_macroscopic_images": train_counts[0],
            "train_micro_images": train_counts[1],
            "train_not_mushroom_images": train_counts[NOT_MUSHROOM_LABEL_ID],
            "train_macroscopic_prevalence": float(train_prevalences[0].item()),
            "train_micro_prevalence": float(train_prevalences[1].item()),
            "initial_bias_macroscopic": float(classifier.bias[0].item()),
            "initial_bias_micro": float(classifier.bias[1].item()),
            "output_mode": "multilabel_sigmoid",
            "loss": "BCEWithLogitsLoss",
            "negative_label": NOT_MUSHROOM_LABEL,
            "negative_target": "[0, 0]",
            "bias_initialization": "logit(training_class_prevalence)",
            "batch_size": batch_size,
            "num_workers": num_workers,
            "epochs": epochs,
            "patience": patience,
            "learning_rate": learning_rate,
            "train_last_layer": train_last_layer,
            "last_layer_learning_rate": last_layer_learning_rate if train_last_layer else "disabled",
            "weight_decay": weight_decay,
            "seed": seed,
            "device": torch.cuda.get_device_name(device),
            "torch_version": torch.__version__,
            "cuda_version": torch.version.cuda,
        }
    )
    optimizer_groups = [
        {"params": classifier.parameters(), "lr": learning_rate},
    ]
    if last_transformer_block is not None:
        optimizer_groups.append(
            {"params": last_transformer_block.parameters(), "lr": last_layer_learning_rate}
        )
    optimizer = torch.optim.AdamW(optimizer_groups, lr=learning_rate, weight_decay=weight_decay)

    loader_generator = torch.Generator().manual_seed(seed)
    loader_settings = {
        "batch_size": batch_size,
        "num_workers": num_workers,
        "pin_memory": True,
        "persistent_workers": num_workers > 0,
    }
    train_loader = DataLoader(
        train_dataset,
        shuffle=True,
        generator=loader_generator,
        **loader_settings,
    )
    val_loader = DataLoader(val_dataset, shuffle=False, **loader_settings)

    history: list[dict[str, Any]] = []
    best_metrics: dict[str, Any] | None = None
    best_selection_key: tuple[float, float] | None = None
    best_val_loss = float("inf")
    best_epoch = 0
    stale_epochs = 0
    best_head_path = output_dir / "best_binary_head.pt"

    print(
        f"Trainable head parameters: {sum(parameter.numel() for parameter in classifier.parameters()):,}; "
        f"trainable final-block parameters: "
        f"{sum(parameter.numel() for parameter in last_transformer_block.parameters()) if last_transformer_block else 0:,}; "
        f"frozen parameters: {sum(parameter.numel() for parameter in model.parameters() if not parameter.requires_grad):,}"
    )
    print(
        f"Learning rates: head={learning_rate:g}; "
        f"final block={last_layer_learning_rate:g}" if train_last_layer
        else f"Learning rate: head={learning_rate:g}; final block frozen"
    )
    print(
        f"Images: train={len(train_dataset)}, val={len(val_dataset)}; multilabel outputs={LABEL_TO_ID}; "
        f"negative target={NOT_MUSHROOM_LABEL}:[0, 0]; "
        f"initial bias={classifier.bias.detach().cpu().tolist()}"
    )

    for epoch in range(1, epochs + 1):
        train_metrics = run_epoch(
            model, classifier, last_transformer_block, train_loader, device, train_loss_function, optimizer
        )
        val_metrics = run_epoch(
            model, classifier, last_transformer_block, val_loader, device, val_loss_function, None
        )
        mlflow.log_metrics(
            {
                "train_loss": train_metrics["loss"],
                "train_exact_match_accuracy": train_metrics["exact_match_accuracy"],
                "train_balanced_accuracy": train_metrics["balanced_accuracy"],
                "train_macro_f1": train_metrics["macro_f1"],
                "val_loss": val_metrics["loss"],
                "val_exact_match_accuracy": val_metrics["exact_match_accuracy"],
                "val_balanced_accuracy": val_metrics["balanced_accuracy"],
                "val_macro_f1": val_metrics["macro_f1"],
            },
            step=epoch,
        )
        history.append(
            {
                "epoch": epoch,
                "train_loss": train_metrics["loss"],
                "val_loss": val_metrics["loss"],
                "val_exact_match_accuracy": val_metrics["exact_match_accuracy"],
                "val_balanced_accuracy": val_metrics["balanced_accuracy"],
                "val_macro_f1": val_metrics["macro_f1"],
            }
        )
        save_history(output_dir / "history.csv", history)

        print(
            f"Epoch {epoch:02d}: train_loss={train_metrics['loss']:.4f} "
            f"val_loss={val_metrics['loss']:.4f} "
            f"val_exact_match={val_metrics['exact_match_accuracy']:.4f} "
            f"val_balanced_accuracy={val_metrics['balanced_accuracy']:.4f} "
            f"val_macro_f1={val_metrics['macro_f1']:.4f}"
        )

        selection_key = (
            round(float(val_metrics["macro_f1"]), 4),
            -round(float(val_metrics["loss"]), 4),
        )
        improved_model = best_selection_key is None or selection_key > best_selection_key
        improved_val_loss = val_metrics["loss"] < best_val_loss
        if improved_model:
            best_selection_key = selection_key
            best_epoch = epoch
            best_metrics = val_metrics
            torch.save(
                {
                    "model_id": MODEL_ID,
                    "model_revision": base_model_revision,
                    "label_to_id": LABEL_TO_ID,
                    "negative_label": NOT_MUSHROOM_LABEL,
                    "negative_label_id": NOT_MUSHROOM_LABEL_ID,
                    "negative_target": [0, 0],
                    "output_mode": "multilabel_sigmoid",
                    "bias_initialization": "logit(training_class_prevalence)",
                    "training_label_prevalence": {
                        ID_TO_LABEL[index]: float(train_prevalences[index].item())
                        for index in range(len(LABEL_TO_ID))
                    },
                    "classifier_state_dict": {
                        name: tensor.detach().cpu()
                        for name, tensor in classifier.state_dict().items()
                    },
                    "last_transformer_block_state_dict": (
                        {
                            name: tensor.detach().cpu()
                            for name, tensor in last_transformer_block.state_dict().items()
                        }
                        if last_transformer_block is not None
                        else None
                    ),
                    "data_config": {
                        key: list(value) if isinstance(value, tuple) else value
                        for key, value in data_config.items()
                    },
                    "best_epoch": best_epoch,
                    "validation_metrics": best_metrics,
                    "training_config": {
                        "batch_size": batch_size,
                        "num_workers": num_workers,
                        "epochs": epochs,
                        "patience": patience,
                        "learning_rate": learning_rate,
                        "train_last_layer": train_last_layer,
                        "last_layer_learning_rate": last_layer_learning_rate if train_last_layer else None,
                        "weight_decay": weight_decay,
                        "seed": seed,
                    },
                },
                best_head_path,
            )

        if improved_val_loss:
            best_val_loss = val_metrics["loss"]
            stale_epochs = 0
        else:
            stale_epochs += 1
        if stale_epochs >= patience:
            print(f"Early stopping after {epoch} epochs; best macro-F1 epoch was {best_epoch}.")
            break

    if best_metrics is None:
        raise RuntimeError("Training ended without a selected checkpoint.")
    result = {
        "model_id": MODEL_ID,
        "model_revision": base_model_revision,
        "device": torch.cuda.get_device_name(device),
        "torch_version": torch.__version__,
        "cuda_version": torch.version.cuda,
        "train_images": len(train_dataset),
        "validation_images": len(val_dataset),
        "train_label_counts": {
            TRAIN_LABEL_ID_TO_NAME[key]: value for key, value in sorted(train_counts.items())
        },
        "train_label_prevalence": {
            ID_TO_LABEL[index]: float(train_prevalences[index].item())
            for index in range(len(LABEL_TO_ID))
        },
        "output_mode": "multilabel_sigmoid",
        "negative_label": NOT_MUSHROOM_LABEL,
        "negative_target": [0, 0],
        "bias_initialization": "logit(training_class_prevalence)",
        "validation_label_counts": {
            TRAIN_LABEL_ID_TO_NAME[key]: value
            for key, value in sorted(read_label_counts(val_csv).items())
        },
        "best_epoch": best_epoch,
        "epochs_completed": len(history),
        "trainable_component": training_component,
        "training_config": {
            "batch_size": batch_size,
            "num_workers": num_workers,
            "epochs": epochs,
            "patience": patience,
            "learning_rate": learning_rate,
            "train_last_layer": train_last_layer,
            "last_layer_learning_rate": last_layer_learning_rate if train_last_layer else None,
            "weight_decay": weight_decay,
            "seed": seed,
        },
        "validation_metrics": best_metrics,
        "checkpoint": "checkpoint/best_binary_head.pt",
        "mlflow_experiment": mlflow_experiment,
        "mlflow_run_id": run_id,
    }
    (output_dir / "metrics.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    mlflow.log_metrics(
        {
            "best_epoch": best_epoch,
            "best_val_loss": best_metrics["loss"],
            "best_val_exact_match_accuracy": best_metrics["exact_match_accuracy"],
            "best_val_balanced_accuracy": best_metrics["balanced_accuracy"],
            "best_val_macro_f1": best_metrics["macro_f1"],
        },
        step=best_epoch,
    )
    mlflow.log_artifact(str(best_head_path), artifact_path="checkpoint")
    mlflow.log_artifact(str(output_dir / "history.csv"), artifact_path="training")
    mlflow.log_artifact(str(output_dir / "metrics.json"), artifact_path="training")
    split_summary_path = DATA_DIR / "dataset/splits/summary.json"
    if split_summary_path.is_file():
        mlflow.log_artifact(str(split_summary_path), artifact_path="data")
    mlflow.end_run(status="FINISHED")
    atexit.unregister(close_unfinished_mlflow_run)
    for local_artifact in (
        best_head_path,
        output_dir / "history.csv",
        output_dir / "metrics.json",
    ):
        local_artifact.unlink(missing_ok=True)
    print(f"MLflow experiment: {mlflow_experiment}; run ID: {run_id}")
    print(f"MLflow tracking URI: {mlflow.get_tracking_uri()}")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    app()
