# SafeRoute AI training and evaluation

## Scope and provenance

SafeRoute uses Python scikit-learn locally; it does not call an external AI API. The included labelled CSV datasets are generated synthetic engineering examples, not actual transit operations data. Any accuracy/precision/recall value displayed by the UI comes from the training run's held-out split and must not be described as a real-world validation result or a safety guarantee.

## Models and inputs

| Task | Input features | Labels |
|---|---|---|
| Impact / accident detection | `accel_x`, `accel_y`, `accel_z` (m/s²); `gyro_x`, `gyro_y`, `gyro_z` (rad/s) | `Normal movement`, `Possible accident` |
| Driver behaviour | `speed_kmh`; `acceleration_longitudinal` (m/s²); `brake_intensity` (0–1); `harsh_brake_count` | `Safe`, `Risky driving` |
| Route anomaly | `distance_from_route_m`, `heading_delta_deg`, `speed_kmh`, `route_progress` (0–1) | `Normal route`, `Route deviation` |

Source CSVs are `datasets/accident_detection.csv`, `datasets/driver_behavior.csv`, and `datasets/route_anomaly.csv`. They are committed so the experiment is inspectable/reproducible.

## Train and save

From the repository root:

```bash
.venv/bin/python -m ai_models.train_all
```

`ai_models/train_all.py` regenerates deterministic demo rows (seed `20261118`) and fits one scikit-learn `Pipeline` per task: median imputation, standard scaling, and class-weighted `RandomForestClassifier`. It uses a stratified 75/25 train/test split with a fixed seed. It saves `ai_models/models/{accident,driving,route}_model.joblib` and `ai_models/models/metrics.json`.

The metadata records dataset/train/test row counts, labels, class counts, accuracy, macro precision/recall/F1, confusion matrix and its label order. Current sandbox run (2026-11-18) reported:

| Model | Test rows | Accuracy | Macro precision | Macro recall | Confusion matrix (label order in source metadata) |
|---|---:|---:|---:|---:|---|
| Impact | 600 | 0.9867 | 0.9732 | 0.9887 | `[[463, 7], [1, 129]]` |
| Driver behaviour | 600 | 1.0000 | 1.0000 | 1.0000 | `[[384, 0], [0, 216]]` |
| Route anomaly | 600 | 0.9983 | 0.9989 | 0.9965 | `[[456, 0], [1, 143]]` |

These figures are values measured from that synthetic test split, reproduced in `ai_models/models/metrics.json`. The perfect synthetic driver score is particularly not evidence that the classifier is reliable in road conditions. A generated dataset may encode easy-to-separate patterns; external evaluation on representative, ethically collected, properly governed transport data would be necessary before real use.

## Inference and UI

`ai_models/predict.py` loads the saved models and returns class labels, probabilities and provenance `synthetic_training_data`; missing/defaulted input fields are identified. Flask runs inference in-process on each telemetry submission. `GET /api/ai/summary` reads training metadata only when the metrics file exists; otherwise it returns `model_metrics: null` and the frontend displays no invented scores. Driver/route/impact screens show actual persisted model predictions and source tags.

The generated impact/route actions are for controlled UI/API testing only. The models must not automatically dispatch, contact emergency services, assess driver fitness, or replace human review.

## Colab notebook

Open `notebooks/train_models.ipynb` in Google Colab and upload the three CSVs, or run the notebook from the project root. It performs preprocessing, stratified train/test splitting, training, accuracy/macro precision/macro recall and confusion matrix calculation. For reproducibility, the Python training module is the canonical command.
