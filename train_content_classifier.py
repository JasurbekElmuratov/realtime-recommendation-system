"""Train and evaluate a linear content-type classifier over post embeddings."""

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support
from sklearn.model_selection import StratifiedGroupKFold

from content_classifier import (
    TEXT_FEATURE_NAMES,
    LinearContentClassifier,
    build_classifier_inputs,
)
from relevance import MODEL_NAME, load_model


BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data" / "labelled_posts_training.csv"
MODEL_DIR = BASE_DIR / "models"
ARTIFACT_FILE = MODEL_DIR / "content_classifier.npz"
METRICS_FILE = MODEL_DIR / "content_classifier_metrics.json"
PREDICTIONS_FILE = MODEL_DIR / "content_classifier_test_predictions.csv"
RANDOM_SEED = 42
EXPECTED_CLASSES = ("discussion", "recommendation", "review")
CANDIDATE_REGULARIZATION = (0.03, 0.1, 0.3, 1.0, 3.0, 10.0)


def validate_training_data(frame: pd.DataFrame) -> None:
    required = {"post_id", "book_id", "content", "content_type"}
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(f"Training data is missing: {', '.join(sorted(missing))}")
    if frame[list(required)].isna().any().any():
        raise ValueError("Training fields cannot contain blank values")
    classes = tuple(sorted(frame["content_type"].astype(str).unique()))
    if classes != EXPECTED_CLASSES:
        raise ValueError(f"Expected classes {EXPECTED_CLASSES}, found {classes}")
    if frame["content"].duplicated().any():
        raise ValueError("Training content must be unique")


def grouped_split_labels(
    frame: pd.DataFrame, *, seed: int = RANDOM_SEED, folds: int = 7
) -> np.ndarray:
    """Create roughly 71/14/14 splits while keeping each book in one split."""
    validate_training_data(frame)
    splitter = StratifiedGroupKFold(n_splits=folds, shuffle=True, random_state=seed)
    fold_ids = np.full(len(frame), -1, dtype="int8")
    dummy_features = np.zeros((len(frame), 1), dtype="float32")
    for fold_id, (_, held_out) in enumerate(
        splitter.split(dummy_features, frame["content_type"], groups=frame["book_id"])
    ):
        fold_ids[held_out] = fold_id
    if np.any(fold_ids < 0):
        raise RuntimeError("Every training row must be assigned to one fold")
    return np.where(fold_ids == 0, "validation", np.where(fold_ids == 1, "test", "train"))


def macro_metrics(actual: np.ndarray, predicted: np.ndarray) -> dict[str, float]:
    precision, recall, f1, _ = precision_recall_fscore_support(
        actual,
        predicted,
        labels=list(EXPECTED_CLASSES),
        average="macro",
        zero_division=0,
    )
    return {
        "accuracy": float(accuracy_score(actual, predicted)),
        "macro_precision": float(precision),
        "macro_recall": float(recall),
        "macro_f1": float(f1),
    }


def detailed_metrics(actual: np.ndarray, predicted: np.ndarray) -> dict[str, object]:
    summary: dict[str, object] = macro_metrics(actual, predicted)
    precision, recall, f1, support = precision_recall_fscore_support(
        actual,
        predicted,
        labels=list(EXPECTED_CLASSES),
        average=None,
        zero_division=0,
    )
    summary["per_class"] = {
        label: {
            "precision": float(precision[index]),
            "recall": float(recall[index]),
            "f1": float(f1[index]),
            "support": int(support[index]),
        }
        for index, label in enumerate(EXPECTED_CLASSES)
    }
    summary["confusion_matrix"] = confusion_matrix(
        actual, predicted, labels=list(EXPECTED_CLASSES)
    ).tolist()
    summary["confusion_matrix_labels"] = list(EXPECTED_CLASSES)
    return summary


def train_linear_head(
    embeddings: np.ndarray, labels: np.ndarray, splits: np.ndarray
) -> tuple[LogisticRegression, float, dict[str, float]]:
    """Select regularization strength using only the validation split."""
    train_mask = splits == "train"
    validation_mask = splits == "validation"
    best: tuple[float, float, LogisticRegression, dict[str, float]] | None = None
    for regularization in CANDIDATE_REGULARIZATION:
        classifier = LogisticRegression(
            C=regularization,
            max_iter=5000,
            solver="lbfgs",
            random_state=RANDOM_SEED,
        )
        classifier.fit(embeddings[train_mask], labels[train_mask])
        validation_predictions = classifier.predict(embeddings[validation_mask])
        metrics = macro_metrics(labels[validation_mask], validation_predictions)
        candidate = (metrics["macro_f1"], -regularization, classifier, metrics)
        if best is None or candidate[:2] > best[:2]:
            best = candidate
    assert best is not None
    return best[2], -best[1], best[3]


def save_artifact(
    classifier: LogisticRegression, output_path: Path, *, embedding_dimensions: int
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        output_path,
        weights=classifier.coef_.astype("float32"),
        bias=classifier.intercept_.astype("float32"),
        classes=classifier.classes_.astype(str),
        embedding_model=np.asarray(MODEL_NAME),
        embedding_dimensions=np.asarray(embedding_dimensions, dtype="int32"),
        text_feature_names=np.asarray(TEXT_FEATURE_NAMES),
        artifact_version=np.asarray(1, dtype="int32"),
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Train a review/recommendation/discussion classifier."
    )
    parser.add_argument("--data", type=Path, default=DATA_FILE)
    parser.add_argument("--artifact", type=Path, default=ARTIFACT_FILE)
    parser.add_argument("--metrics", type=Path, default=METRICS_FILE)
    parser.add_argument("--predictions", type=Path, default=PREDICTIONS_FILE)
    return parser


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    frame = pd.read_csv(args.data)
    validate_training_data(frame)
    frame["dataset_split"] = grouped_split_labels(frame)

    model = load_model()
    embeddings = model.encode(
        frame["content"].astype(str).tolist(),
        batch_size=64,
        convert_to_numpy=True,
        normalize_embeddings=True,
        show_progress_bar=True,
    ).astype("float32")
    classifier_inputs = build_classifier_inputs(frame["content"].astype(str).tolist(), embeddings)
    labels = frame["content_type"].astype(str).to_numpy()
    splits = frame["dataset_split"].to_numpy()
    classifier, best_regularization, validation_metrics = train_linear_head(
        classifier_inputs, labels, splits
    )

    test_mask = splits == "test"
    test_predictions = classifier.predict(classifier_inputs[test_mask])
    test_probabilities = classifier.predict_proba(classifier_inputs[test_mask])
    test_metrics = detailed_metrics(labels[test_mask], test_predictions)

    save_artifact(classifier, args.artifact, embedding_dimensions=embeddings.shape[1])
    portable = LinearContentClassifier(
        classifier.coef_.astype("float32"),
        classifier.intercept_.astype("float32"),
        classifier.classes_.astype(str),
        MODEL_NAME,
        int(embeddings.shape[1]),
        TEXT_FEATURE_NAMES,
    )
    portable_predictions, confidence, margin, portable_probabilities = portable.predict(
        frame.loc[test_mask, "content"].astype(str).tolist(), embeddings[test_mask]
    )
    if not np.array_equal(test_predictions, portable_predictions):
        raise RuntimeError("Portable inference does not match training inference")
    if not np.allclose(test_probabilities, portable_probabilities, atol=1e-5):
        raise RuntimeError("Portable probabilities do not match training probabilities")

    split_summary = {
        split: {
            "rows": int(np.sum(splits == split)),
            "unique_books": int(frame.loc[splits == split, "book_id"].nunique()),
            "class_counts": {
                label: int(np.sum((splits == split) & (labels == label)))
                for label in EXPECTED_CLASSES
            },
        }
        for split in ("train", "validation", "test")
    }
    report = {
        "embedding_model": MODEL_NAME,
        "embedding_dimensions": int(embeddings.shape[1]),
        "intent_feature_names": list(TEXT_FEATURE_NAMES),
        "classifier_input_dimensions": int(classifier_inputs.shape[1]),
        "recommendation_requires_explicit_intent": True,
        "classifier": "multinomial logistic regression (linear softmax head)",
        "random_seed": RANDOM_SEED,
        "regularization_c": best_regularization,
        "splits": split_summary,
        "validation": validation_metrics,
        "test": test_metrics,
    }
    args.metrics.parent.mkdir(parents=True, exist_ok=True)
    args.metrics.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    predictions = frame.loc[
        test_mask, ["post_id", "book_id", "content", "content_type"]
    ].copy()
    predictions = predictions.rename(columns={"content_type": "actual_content_type"})
    predictions["predicted_content_type"] = portable_predictions
    predictions["confidence"] = np.round(confidence, 6)
    predictions["probability_margin"] = np.round(margin, 6)
    for class_index, label in enumerate(classifier.classes_):
        predictions[f"probability_{label}"] = np.round(
            portable_probabilities[:, class_index], 6
        )
    args.predictions.parent.mkdir(parents=True, exist_ok=True)
    predictions.to_csv(args.predictions, index=False)

    print("Split summary:")
    for split, values in split_summary.items():
        print(
            f"  {split}: {values['rows']} rows, {values['unique_books']} books, "
            f"classes={values['class_counts']}"
        )
    print(f"Selected regularization C: {best_regularization}")
    print(f"Validation macro F1: {validation_metrics['macro_f1']:.2%}")
    print(f"Test accuracy: {test_metrics['accuracy']:.2%}")
    print(f"Test macro F1: {test_metrics['macro_f1']:.2%}")
    print(f"Confusion matrix labels: {list(EXPECTED_CLASSES)}")
    print(np.asarray(test_metrics["confusion_matrix"]))
    print(f"Model artifact: {args.artifact}")
    print(f"Metrics: {args.metrics}")
    print(f"Test predictions: {args.predictions}")


if __name__ == "__main__":
    main()
