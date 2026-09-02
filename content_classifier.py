"""Portable inference helpers for the trained post content classifier."""

from dataclasses import dataclass
from pathlib import Path
import re
from typing import Sequence

import numpy as np


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_ARTIFACT = BASE_DIR / "models" / "content_classifier.npz"
TEXT_FEATURE_NAMES = (
    "recommendation_intent",
    "discussion_intent",
    "question_mark",
    "reader_address",
    "evaluation_language",
    "first_person",
    "word_count_scaled",
    "rhetorical_question",
)
RECOMMENDATION_INTENT = re.compile(
    r"(?:\b(?:i (?:would |can |definitely )?recommend|my recommendation|"
    r"earns my recommendation|easy recommendation|recommended for readers|"
    r"i would (?:confidently )?suggest|you should (?:read|try)|worth (?:reading|trying)|"
    r"try this|give this(?: one)? a (?:chance|shot)|give it a shot|put this on your list|"
    r"add this to your list|point them toward this|hand this to|send this to|easy rec|"
    r"solid yes|gets a yes|go try it|the move|reading list|strong entry point|my pick|"
    r"deserve a chance|pass this along|consider trying|should consider this|"
    r"read this (?:when|for)|i tell my friend|i say put|i still say give|"
    r"still i recommend)\b)",
    re.IGNORECASE,
)
DISCUSSION_INTENT = re.compile(
    r"(?:did anyone|does anyone|what do you think|who else|whose perspective|"
    r"why did nobody|was the ending|would the conflict|can we talk|"
    r"another reader's opinion|somebody else's opinion|someone to discuss|"
    r"need to know whether anyone)",
    re.IGNORECASE,
)
READER_ADDRESS = re.compile(r"\b(?:you|your|reader|readers|friend|anyone|somebody)\b", re.IGNORECASE)
EVALUATION_LANGUAGE = re.compile(
    r"\b(?:my quick take|i (?:liked|loved|hated|respected|admired|agree|disagree)|"
    r"felt|worked|uneven|useful|interesting|frustrating|not sure|still thinking|"
    r"wanted more|stronger|weaker|convincing|messier)\b",
    re.IGNORECASE,
)
FIRST_PERSON = re.compile(r"\b(?:i|i'm|i've|i'd|me|my)\b", re.IGNORECASE)
RHETORICAL_QUESTION = re.compile(
    r"^The setup where .+\? I was invested immediately\.$", re.IGNORECASE
)


def extract_text_features(texts: Sequence[str]) -> np.ndarray:
    """Return small, auditable intent features that complement semantics."""
    rows = []
    for value in texts:
        text = str(value)
        word_count = len(re.findall(r"[a-z0-9']+", text.lower()))
        rows.append(
            [
                float(bool(RECOMMENDATION_INTENT.search(text))),
                float(bool(DISCUSSION_INTENT.search(text))),
                float("?" in text),
                float(bool(READER_ADDRESS.search(text))),
                float(bool(EVALUATION_LANGUAGE.search(text))),
                float(bool(FIRST_PERSON.search(text))),
                min(word_count / 100.0, 2.0),
                float(bool(RHETORICAL_QUESTION.match(text))),
            ]
        )
    return np.asarray(rows, dtype="float32")


def build_classifier_inputs(texts: Sequence[str], embeddings: np.ndarray) -> np.ndarray:
    """Append intent features to frozen semantic embeddings."""
    semantic = np.asarray(embeddings, dtype="float32")
    intent = extract_text_features(texts)
    if semantic.ndim != 2 or len(semantic) != len(intent):
        raise ValueError("Texts and embeddings must contain the same number of rows")
    return np.concatenate([semantic, intent], axis=1).astype("float32")


@dataclass(frozen=True)
class LinearContentClassifier:
    """A three-class softmax head trained over frozen sentence embeddings."""

    weights: np.ndarray
    bias: np.ndarray
    classes: np.ndarray
    embedding_model: str
    embedding_dimensions: int | None = None
    text_feature_names: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if self.weights.ndim != 2:
            raise ValueError("Classifier weights must be a two-dimensional matrix")
        if self.bias.shape != (self.weights.shape[0],):
            raise ValueError("Classifier bias must have one value per class")
        if self.classes.shape != (self.weights.shape[0],):
            raise ValueError("Classifier must have one class name per output row")
        if self.embedding_dimensions is not None:
            expected = self.embedding_dimensions + len(self.text_feature_names)
            if self.weights.shape[1] != expected:
                raise ValueError(
                    f"Classifier expects {expected} combined inputs, got {self.weights.shape[1]}"
                )

    def predict_embeddings(
        self, embeddings: np.ndarray
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        """Return labels, confidence, probability margin, and all probabilities."""
        values = np.asarray(embeddings, dtype="float32")
        if values.ndim != 2 or values.shape[1] != self.weights.shape[1]:
            raise ValueError(
                f"Expected embeddings shaped (n, {self.weights.shape[1]}), got {values.shape}"
            )
        logits = values @ self.weights.T + self.bias
        logits -= logits.max(axis=1, keepdims=True)
        probabilities = np.exp(logits)
        probabilities /= probabilities.sum(axis=1, keepdims=True)
        best_indices = probabilities.argmax(axis=1)
        sorted_probabilities = np.sort(probabilities, axis=1)
        confidence = probabilities[np.arange(len(values)), best_indices]
        margin = sorted_probabilities[:, -1] - sorted_probabilities[:, -2]
        return (
            self.classes[best_indices],
            confidence.astype("float32"),
            margin.astype("float32"),
            probabilities.astype("float32"),
        )

    def predict(
        self, texts: Sequence[str], embeddings: np.ndarray
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        """Classify text using semantic embeddings plus saved intent features."""
        if not self.text_feature_names:
            return self.predict_embeddings(embeddings)
        if tuple(self.text_feature_names) != TEXT_FEATURE_NAMES:
            raise ValueError("Classifier uses an unsupported text-feature definition")
        if self.embedding_dimensions is None:
            raise ValueError("Classifier artifact does not specify embedding dimensions")
        semantic = np.asarray(embeddings, dtype="float32")
        if semantic.ndim != 2 or semantic.shape[1] != self.embedding_dimensions:
            raise ValueError(
                f"Expected semantic embeddings shaped (n, {self.embedding_dimensions})"
            )
        intent = extract_text_features(texts)
        labels, confidence, margin, probabilities = self.predict_embeddings(
            np.concatenate([semantic, intent], axis=1).astype("float32")
        )
        recommendation_indices = np.where(self.classes == "recommendation")[0]
        if len(recommendation_indices) == 1:
            recommendation_index = int(recommendation_indices[0])
            blocked = (labels == "recommendation") & (intent[:, 0] == 0)
            if np.any(blocked):
                probabilities = probabilities.copy()
                probabilities[blocked, recommendation_index] = 0.0
                probabilities[blocked] /= probabilities[blocked].sum(axis=1, keepdims=True)
                best_indices = probabilities.argmax(axis=1)
                labels = self.classes[best_indices]
                sorted_probabilities = np.sort(probabilities, axis=1)
                confidence = probabilities[np.arange(len(probabilities)), best_indices]
                margin = sorted_probabilities[:, -1] - sorted_probabilities[:, -2]
        return (
            labels,
            confidence.astype("float32"),
            margin.astype("float32"),
            probabilities.astype("float32"),
        )


def load_content_classifier(
    artifact_path: str | Path = DEFAULT_ARTIFACT,
) -> LinearContentClassifier:
    """Load a classifier artifact without unsafe pickle deserialization."""
    with np.load(artifact_path, allow_pickle=False) as artifact:
        required = {"weights", "bias", "classes", "embedding_model"}
        missing = required - set(artifact.files)
        if missing:
            raise ValueError(
                f"Classifier artifact is missing: {', '.join(sorted(missing))}"
            )
        return LinearContentClassifier(
            weights=artifact["weights"].astype("float32"),
            bias=artifact["bias"].astype("float32"),
            classes=artifact["classes"].astype(str),
            embedding_model=str(artifact["embedding_model"].item()),
            embedding_dimensions=(
                int(artifact["embedding_dimensions"].item())
                if "embedding_dimensions" in artifact.files
                else None
            ),
            text_feature_names=(
                tuple(artifact["text_feature_names"].astype(str).tolist())
                if "text_feature_names" in artifact.files
                else ()
            ),
        )
