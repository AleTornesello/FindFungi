# Research: distinguishing macroscopic vs microscopic fungal images

> **Scope / terminology.** The prompt says “microscopic and microscopic”; I assume the intended task is **macroscopic vs microscopic image classification**. Here, *microscopic* means an image made through a microscope of fungal structures that are not visible to the naked eye; this matches FunghiItaliani's own definition of *microfotografia micologica*. Images that combine both modalities, diagrams, or ambiguous close-ups should be kept as a third **mixed/uncertain** class during labeling rather than forced into a binary label.  
> Source: [FunghiItaliani — “Microfotografia micologica”](https://enciclopedia.funghiitaliani.it/termine.php?show=3902).

## Bottom line

For this dataset, I would **not train directly from `properties.microscopic`**. It is a mushroom-record-level field imported from the source API's `micro` field, while the images are a separate list assembled from a Wikipedia cover plus forum photos. The same mushroom record can contain both normal field photographs and microscope images.  
Sources: [stage 2 importer](../../scraper/src/scraper/stages/funghi_italiani.py), [schema](../../scraper/src/scraper/schema.py), [JSON exporter](../../scraper/src/scraper/stages/export_json.py).

The best progression is:

1. **Exploit source context and deduplicate URLs** to create high-confidence weak labels.
2. **Build a small hand-labeled gold set** and try simple visual features + logistic regression.
3. **Try CLIP zero-shot** with microscopy-vs-field-photo prompts.
4. **Use CLIP or DINOv2 embeddings + a linear classifier** on the gold set.
5. Only if needed, **fine-tune a pretrained image classifier**.
6. In production, combine source-context rules + model confidence and send uncertain cases to review.

For this problem, step 4 is likely the best accuracy/effort trade-off.

---

## What is actually in `mushrooms.json`

I parsed the current `data/mushrooms.json` blob on `master` (blob SHA `cb85a6da49d623394c6f0e89f7863f50d0ea9496`). The current file contains:

| Item | Count |
|---|---:|
| Mushroom records | 1,457 |
| Image occurrences | 44,157 |
| Unique image URLs | 31,567 |
| Duplicate image occurrences | 12,590 (28.5%) |
| Records with `microscopic=true` | 589 |
| Records with `microscopic=false` | 868 |
| Unique image URLs appearing under **both** flag values | 5,767 (18.3% of unique URLs) |

Source: [current dataset](../../data/mushrooms.json).

That last row is decisive: **the record-level `microscopic` value cannot be treated as an image-level ground-truth label**. Thousands of exact same URLs occur under both values.

This happens naturally because the scraper allows several source records/synonyms to share a FunghiItaliani topic, and the JSON exporter then attaches the same topic photos to each matching mushroom row. The source DB keeps `funghi_italiani_topic_id`, but it is intentionally not exported to the public JSON.  
Sources: [photo scraper](../../scraper/src/scraper/stages/funghi_italiani_photos.py), [schema](../../scraper/src/scraper/schema.py), [exporter](../../scraper/src/scraper/stages/export_json.py).

The exporter also explicitly orders images as **Wikipedia cover first, then FunghiItaliani topic photos**. In the current JSON, 1,406 records start with a Wikimedia image, 50 start with a FunghiItaliani image, and 1 starts with another source.  
Source: [exporter](../../scraper/src/scraper/stages/export_json.py), [current dataset](../../data/mushrooms.json).

A concrete example is **Agaricus bisporus**. The dataset record has `microscopic=true`, while its source topic contains ordinary mushroom photographs followed by microscopy images of spores, basidia, and cheilocystidia. The page also labels microscope observations with magnifications such as `200×` and `600×`.  
Sources: [current dataset](../../data/mushrooms.json), [FunghiItaliani — Agaricus bisporus](https://www.funghiitaliani.it/topic/16230-agaricus-bisporus-je-lange-imbach-1946/).

---

## First define the image-level target

Use three labels while building the dataset:

- **macro** — ordinary photograph of a fruiting body or other structure visible without a microscope;
- **micro** — image acquired through a microscope;
- **uncertain/mixed** — composite panels, drawings, screenshots, scale diagrams, images where modality cannot be confidently determined.

The source's own glossary says microphotographs are generally images of sections or fungal structures not visible to the naked eye and are often accompanied by information such as magnification, reagents/stains, measurements in micrometres, and the morphology being observed. That makes those textual signals especially useful here.  
Source: [FunghiItaliani microscopy glossary](https://enciclopedia.funghiitaliani.it/termine.php?show=3902).

Do not collapse `uncertain` into one class during annotation. You can decide later how the app should handle it.

---

# Technique ladder: simplest to hardest

## 0. Data hygiene first: exact deduplication and grouped evaluation

Before any classifier, collapse exact duplicate URLs when creating the training/evaluation manifest. The current file has 44,157 occurrences but only 31,567 unique URLs, so a naive random image split can put identical images in train and test.

Even better, preserve or reconstruct a **group ID** for each source topic. The source database already has `funghi_italiani_topic_id` and `post_id`; exporting those to an internal training manifest would make this straightforward.  
Sources: [schema](../../scraper/src/scraper/schema.py), [photo scraper](../../scraper/src/scraper/stages/funghi_italiani_photos.py).

For validation, keep all images from the same topic/group in one fold. Scikit-learn's `GroupKFold` guarantees non-overlapping groups; `StratifiedGroupKFold` additionally tries to preserve class proportions while keeping groups separate.  
Sources: [scikit-learn GroupKFold](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.GroupKFold.html), [scikit-learn cross-validation guide](https://scikit-learn.org/stable/modules/cross_validation.html#stratifiedgroupkfold).

**If you only have the JSON:** build connected groups from records that share any exact image URL, so synonym records that reuse photos cannot be split across train/test.

---

## 1. Source-context rules / weak supervision — easiest and very dataset-specific

The scraper currently keeps the image URL and `post_id`, but not the text immediately surrounding each image. Add an internal training export that retains local DOM/text context around every image.

High-confidence **micro** signals from the source itself include:

- section/context words such as `Microscopia`, `Spore`, `Basidi`, `Cheilocistidi`, `Pleurocistidi`, `Ife`, `Aschi`;
- measurement patterns containing `µm`;
- magnification patterns such as `200×`, `600×`, `1000×`;
- stain/reagent wording, e.g. the source example uses `Rosso Congo`.

These are not arbitrary features: the FunghiItaliani glossary explicitly describes magnification, reagents, micrometre measurements, and microscopic morphology as common metadata around microphotographs.  
Source: [FunghiItaliani microscopy glossary](https://enciclopedia.funghiitaliani.it/termine.php?show=3902).

The **Agaricus bisporus** page shows why local context is useful: normal mushroom images appear first, then text describing spores/basidia/cheilocystidia appears next to later microscopy images.  
Source: [FunghiItaliani — Agaricus bisporus](https://www.funghiitaliani.it/topic/16230-agaricus-bisporus-je-lange-imbach-1946/).

A practical rule engine can assign only **high-confidence** labels and leave the rest unknown. Example:

```text
micro_score =
  +3 if local text contains "Microscopia"
  +3 if local text matches a magnification such as 1000×
  +2 if local text contains µm
  +2 for microscopy terms: spore/basidi/cistidi/ife/aschi
  +1 for microscopy reagent/stain terms

if micro_score >= threshold:
    weak_label = micro
else:
    weak_label = unknown
```

Do not use the whole post indiscriminately: a post can contain both macro and micro images. Prefer the nearest preceding/following text node or a small DOM window around each image.

**Why try this first:** it uses information that is already present at the source and can generate a large, fairly precise seed set without image inference.

---

## 2. Cheap image-only heuristics + logistic regression

Once you have a few hundred manually checked images, test whether the modalities are separable with simple features.

Useful candidates:

- RGB/HSV intensity and saturation histograms;
- fraction of near-white/near-black pixels;
- Canny edge density;
- Laplacian/gradient statistics;
- LBP texture histogram;
- HOG descriptor;
- optional OCR tokens from annotations/scale bars.

OpenCV provides image histograms, Canny edge detection, Sobel gradients, and Laplacian operators.  
Sources: [OpenCV histograms](https://docs.opencv.org/4.x/d1/db7/tutorial_py_histogram_begins.html), [OpenCV Canny](https://docs.opencv.org/4.x/da/d22/tutorial_py_canny.html), [OpenCV image gradients](https://docs.opencv.org/4.x/d5/d0f/tutorial_py_gradients.html).

Scikit-image exposes both **LBP**, described in its docs as a visual descriptor often used in texture classification, and **HOG**, which converts local gradient orientation structure into a feature vector.  
Sources: [scikit-image feature API](https://scikit-image.org/docs/stable/api/skimage.feature.html), [scikit-image HOG example](https://scikit-image.org/docs/stable/auto_examples/features_detection/plot_hog.html).

Fit a regularized logistic regression on these features; scikit-learn's implementation is regularized by default.  
Source: [scikit-learn LogisticRegression](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.LogisticRegression.html).

For microscopy screenshots containing text, Tesseract can extract printed text from images, so OCR can recover strings such as `µm`, `1000x`, or structure names when those annotations are burned into the pixels.  
Source: [Tesseract user manual](https://tesseract-ocr.github.io/tessdoc/).

**Expected weakness:** these features can learn the visual style of particular contributors, microscopes, stains, or backgrounds rather than the real modality boundary. Treat this as a baseline, not the final answer.

---

## 3. CLIP zero-shot — very little labeling

OpenAI's CLIP accepts images and natural-language text and returns image/text similarities; its official repository includes a zero-shot classification example.  
Source: [OpenAI CLIP repository](https://github.com/openai/CLIP).

Try several prompts per class and average their text embeddings.

**Micro prompt examples**

- “a microscope image of fungal spores”
- “a microscopy image of fungal hyphae”
- “a microscope image of basidia and cystidia”
- “a brightfield microscopy image of fungal cells”

**Macro prompt examples**

- “a field photograph of a mushroom fruiting body”
- “a close-up photograph of a mushroom cap and stem”
- “a mushroom growing outdoors”
- “a macroscopic photograph of a fungus”

Do not trust the raw softmax probability as calibrated confidence. Use it as a ranking/margin signal, then measure a threshold on the held-out gold set.

This is an excellent baseline because it costs almost no training effort and immediately tells you whether the semantic distinction is already represented by a general vision-language model.

---

## 4. Pretrained embeddings + a linear probe — recommended sweet spot

Manually label a gold set of **unique** images, then freeze a pretrained encoder and train only a small classifier.

Two good options:

### CLIP embeddings

The official CLIP repository exposes `model.encode_image()` and includes a complete example that trains scikit-learn logistic regression on frozen image features.  
Source: [OpenAI CLIP repository — linear probe example](https://github.com/openai/CLIP).

### DINOv2 embeddings

Meta's DINOv2 repository states that its pretrained models produce visual features that can be used directly with simple linear classifiers, and its evaluation code includes k-NN, logistic-regression, and linear-classification protocols.  
Source: [Meta DINOv2 repository](https://github.com/facebookresearch/dinov2).

For this task I would test **DINOv2 ViT-S/14 or CLIP ViT-B/32 + logistic regression** before any fine-tuning. The classifier is cheap to train, the embedding can capture much more than hand-built texture features, and a few hundred to a few thousand well-labeled images may be enough to establish whether the task is easy.

Keep the source-context signals as extra scalar features if useful, e.g. concatenate:

```text
[vision_embedding,
 has_microscopy_term,
 has_magnification,
 has_micrometre_unit,
 source_is_wikimedia,
 image_position_in_topic/post]
```

Then compare **vision only** vs **context only** vs **vision + context** on the same grouped folds.

---

## 5. Fine-tune a pretrained classifier — harder

If the linear-probe error is still too high, fine-tune a pretrained image model such as ResNet.

TorchVision provides pretrained ResNet weights and the preprocessing transforms associated with those weights. PyTorch's official transfer-learning tutorial demonstrates the two standard modes: fine-tuning a pretrained network or freezing it as a fixed feature extractor.  
Sources: [TorchVision ResNet-50](https://docs.pytorch.org/vision/main/models/generated/torchvision.models.resnet50), [PyTorch transfer-learning tutorial](https://docs.pytorch.org/tutorials/beginner/transfer_learning_tutorial.html).

Suggested progression:

1. replace the final classification head and freeze the backbone;
2. train only the head;
3. unfreeze the last block(s) and fine-tune with a lower learning rate;
4. stop based on grouped validation F1/recall, not training loss.

Fine-tuning is justified only after the frozen-feature baselines, because this dataset has enough duplication and source-specific style that an end-to-end model can overfit those shortcuts very easily.

---

## 6. Hybrid model + human review — hardest, best production behavior

A robust production classifier does not need to force every image into a class.

Use:

```text
final_score =
    model_probability
  + source_context_features
  + OCR_features
```

Then define three operating regions:

- confidently macro;
- confidently micro;
- uncertain -> manual review / leave unfiltered.

The source-context rule system is especially valuable as an explanation layer: “classified as microscopy because nearby text contains `Spore`, `µm`, and `1000×`.”

---

# How I would build the benchmark

## 1. Create a training manifest with provenance

Do not train directly from the public JSON shape. Produce an internal table like:

```text
image_url
mushroom_id
genus
species
topic_id
post_id
position
source            # wikimedia / funghiitaliani
nearby_text
record_microscopic_flag
label             # macro / micro / uncertain
```

The required provenance already exists upstream in the scraper/database, especially `topic_id`, `post_id`, and photo position.  
Sources: [schema](../../scraper/src/scraper/schema.py), [photo scraper](../../scraper/src/scraper/stages/funghi_italiani_photos.py).

## 2. Build a gold set

Label a diverse sample of unique URLs. Sample across:

- many mushroom taxa;
- old and new forum uploads;
- Wikimedia vs FunghiItaliani;
- different posters/topics;
- easy and ambiguous examples;
- examples produced by the weak-rule system at high, medium, and low confidence.

Keep `uncertain/mixed` separate during annotation.

## 3. Split by source group, not by image

Best: use `topic_id` as the group. If topic IDs are unavailable, group records connected by shared image URLs. Use `StratifiedGroupKFold` if class balance becomes a problem.  
Source: [scikit-learn grouped cross-validation](https://scikit-learn.org/stable/modules/cross_validation.html#stratifiedgroupkfold).

## 4. Report the right metrics

Report per-class **precision, recall, and F1**, not only accuracy. Scikit-learn's `classification_report` reports those metrics and class support.  
Source: [scikit-learn classification_report](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.classification_report.html).

If the app's goal is “never show microscope images in the normal gallery”, optimize primarily for **micro recall**. If the goal is “do not accidentally hide normal mushroom photos”, optimize for **micro precision** instead.

Also report metrics separately for:

- FunghiItaliani vs Wikimedia;
- images with vs without useful text context;
- exact duplicates removed;
- newer vs older uploads if styles changed over time.

---

# Recommended experiment order for FindFungi

| Order | Method | Labels needed | Compute | Why try it |
|---|---|---:|---:|---|
| 1 | Exact URL dedupe + source-context regex rules | none | tiny | Dataset-specific, interpretable, can bootstrap labels |
| 2 | Handcrafted image features + logistic regression | hundreds | tiny | Establishes a cheap image-only baseline |
| 3 | CLIP zero-shot | none | low | Fast semantic baseline |
| 4 | CLIP/DINOv2 embeddings + logistic regression | hundreds–thousands | low/moderate | **Best first serious model** |
| 5 | Fine-tuned ResNet/other pretrained classifier | hundreds–thousands | moderate/high | Use only if frozen features plateau |
| 6 | Hybrid ensemble + review queue | gold set + weak labels | moderate | Best for robust production filtering |

## My recommendation

Start by changing the scraper/training export to retain **topic/post provenance and nearby text**, then manually label a modest gold set of **unique** images. Run these three baselines on exactly the same grouped split:

1. source-context rules;
2. CLIP zero-shot;
3. DINOv2 or CLIP embeddings + logistic regression.

Only move to end-to-end fine-tuning if the linear probe cannot meet the desired error rate.

The main thing to avoid is training on `properties.microscopic` as if it were the label. The current dataset directly demonstrates that it is not an image-level modality label.

---

## Primary sources

### FindFungi / data source

- [FindFungi dataset](../../data/mushrooms.json)
- [FindFungi stage 2 — imports the source `micro` field](../../scraper/src/scraper/stages/funghi_italiani.py)
- [FindFungi database schema](../../scraper/src/scraper/schema.py)
- [FindFungi photo scraper](../../scraper/src/scraper/stages/funghi_italiani_photos.py)
- [FindFungi JSON exporter](../../scraper/src/scraper/stages/export_json.py)
- [FunghiItaliani — definition of mycological microphotography](https://enciclopedia.funghiitaliani.it/termine.php?show=3902)
- [FunghiItaliani — Agaricus bisporus example topic](https://www.funghiitaliani.it/topic/16230-agaricus-bisporus-je-lange-imbach-1946/)

### Image processing / ML

- [OpenCV — image histograms](https://docs.opencv.org/4.x/d1/db7/tutorial_py_histogram_begins.html)
- [OpenCV — Canny edge detection](https://docs.opencv.org/4.x/da/d22/tutorial_py_canny.html)
- [OpenCV — image gradients](https://docs.opencv.org/4.x/d5/d0f/tutorial_py_gradients.html)
- [scikit-image — feature API (LBP/HOG)](https://scikit-image.org/docs/stable/api/skimage.feature.html)
- [scikit-image — HOG](https://scikit-image.org/docs/stable/auto_examples/features_detection/plot_hog.html)
- [scikit-learn — LogisticRegression](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.LogisticRegression.html)
- [scikit-learn — GroupKFold](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.GroupKFold.html)
- [scikit-learn — grouped/stratified cross-validation](https://scikit-learn.org/stable/modules/cross_validation.html#stratifiedgroupkfold)
- [scikit-learn — classification_report](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.classification_report.html)
- [OpenAI — CLIP source repository](https://github.com/openai/CLIP)
- [Meta — DINOv2 source repository](https://github.com/facebookresearch/dinov2)
- [TorchVision — ResNet-50 pretrained weights](https://docs.pytorch.org/vision/main/models/generated/torchvision.models.resnet50)
- [PyTorch — transfer learning tutorial](https://docs.pytorch.org/tutorials/beginner/transfer_learning_tutorial.html)
- [Tesseract — official user manual](https://tesseract-ocr.github.io/tessdoc/)
