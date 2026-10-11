# Find Fungi data cleaning

`data/mushrooms.json` and `data/images/` are the raw source data. Dataset preparation is a two-step process:

```bash
uv run python scripts/prepare_dataset.py deduplicate
uv run python scripts/prepare_dataset.py split
```

The `deduplicate` command hashes every readable image listed by the raw JSON, keeps one canonical copy of each exact SHA-256 match, and writes an experiment-ready manifest under `data/dataset/deduplicated/`. It attaches matching image-level labels from `data/annotated.csv` and preserves the raw mushroom records as `mushrooms.jsonl`; species properties are not treated as image-level labels. The generated image files use hard links when available and copy otherwise, so the raw tree remains intact. Missing or unreadable raw images are listed in `issues.csv`; duplicate source paths map to the retained image in `source_map.csv`.

The `split` command reads only labeled canonical images from the deduplicated manifest. It keeps each mushroom ID and every exact-duplicate component in a single fold, then writes `train.csv`, `val.csv`, and `summary.json` under `data/dataset/splits/`. Confirmed pairs from `data/image_duplicate_review.csv` are also kept in one fold when that optional review file exists. Rebuilding existing outputs requires `--overwrite`.

Training consumes the split manifests and freezes the backbone by default. Pass `--train-last-layer` to also train the final transformer block immediately before the classifier, using a separate `--last-layer-learning-rate` that defaults to `1e-6`:

```bash
uv run python scripts/train_binary_head.py
uv run python scripts/train_binary_head.py --train-last-layer
```

Whole-tree prediction scans `data/images/` and logs its CSV only as an MLflow artifact under a prediction child run of the training run; the temporary CSV is removed after logging. The error-analysis notebook selects a finished prediction run from the `fungitastic-binary-head` experiment, downloads its artifact from the associated training run, and evaluates only canonical labeled rows from the deduplicated manifest. Set `PREDICTION_RUN_ID` in the notebook to inspect a specific prediction run.
