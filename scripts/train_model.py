import csv
import json
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC


ROOT = Path(__file__).resolve().parents[1]
PROCESSED_DIR = ROOT / "data" / "processed"
REPORTS_DIR = ROOT / "reports" / "figures"
MODEL_DIR = ROOT / "apps" / "api" / "models"

FEATURE_METADATA = PROCESSED_DIR / "feature_columns.json"


def load_dataset() -> tuple[np.ndarray, np.ndarray, list[str]]:
    dataset_path = PROCESSED_DIR / "dataset.csv"
    with FEATURE_METADATA.open() as file:
        metadata = json.load(file)
    feature_columns = metadata["model_feature_columns"]

    with dataset_path.open(newline="") as file:
        rows = list(csv.DictReader(file))

    x = np.array([[float(row[column]) for column in feature_columns] for row in rows])
    label_column = "Label" if rows and "Label" in rows[0] else "label"
    y = np.array([int(row[label_column]) for row in rows])
    return x, y, feature_columns


def evaluate_model(
    family: str,
    variant: str,
    parameters: dict,
    model,
    x_test: np.ndarray,
    y_test: np.ndarray,
) -> dict:
    y_pred = model.predict(x_test)
    if hasattr(model, "predict_proba"):
        y_score = model.predict_proba(x_test)[:, 1]
    else:
        y_score = model.decision_function(x_test)

    return {
        "family": family,
        "variant": variant,
        "model": f"{family}_{variant}",
        "parameters": parameters,
        "accuracy": round(float(accuracy_score(y_test, y_pred)), 4),
        "precision": round(float(precision_score(y_test, y_pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y_test, y_pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y_test, y_pred, zero_division=0)), 4),
        "roc_auc": round(float(roc_auc_score(y_test, y_score)), 4),
        "confusion_matrix": confusion_matrix(y_test, y_pred).tolist(),
    }


def write_feature_importance(model: RandomForestClassifier, feature_columns: list[str]) -> None:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    path = REPORTS_DIR / "feature_importance.csv"
    pairs = sorted(
        zip(feature_columns, model.feature_importances_),
        key=lambda item: item[1],
        reverse=True,
    )
    with path.open("w", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(["feature", "importance"])
        for feature, importance in pairs:
            writer.writerow([feature, round(float(importance), 6)])


def main() -> None:
    x, y, feature_columns = load_dataset()
    label_counts = {int(label): int((y == label).sum()) for label in np.unique(y)}
    if len(label_counts) < 2:
        raise ValueError(f"Need both classes for training, got: {label_counts}")

    x_train, x_test, y_train, y_test = train_test_split(
        x,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y,
    )

    experiments = [
        (
            "random_forest",
            "baseline",
            {"n_estimators": 200, "max_depth": None, "min_samples_leaf": 1},
            RandomForestClassifier(
                n_estimators=200,
                max_depth=None,
                min_samples_leaf=1,
                random_state=42,
                class_weight="balanced",
            ),
        ),
        (
            "random_forest",
            "tuned",
            {"n_estimators": 500, "max_depth": 8, "min_samples_leaf": 3},
            RandomForestClassifier(
                n_estimators=500,
                max_depth=8,
                min_samples_leaf=3,
                random_state=42,
                class_weight="balanced",
            ),
        ),
        (
            "svm",
            "baseline",
            {"kernel": "rbf", "C": 1.0, "gamma": "scale"},
            make_pipeline(
                StandardScaler(),
                SVC(
                    kernel="rbf",
                    C=1.0,
                    gamma="scale",
                    probability=True,
                    class_weight="balanced",
                    random_state=42,
                ),
            ),
        ),
        (
            "svm",
            "tuned",
            {"kernel": "rbf", "C": 10.0, "gamma": "scale"},
            make_pipeline(
                StandardScaler(),
                SVC(
                    kernel="rbf",
                    C=10.0,
                    gamma="scale",
                    probability=True,
                    class_weight="balanced",
                    random_state=42,
                ),
            ),
        ),
        (
            "logistic_regression",
            "baseline",
            {"C": 1.0, "penalty": "l2", "solver": "lbfgs"},
            make_pipeline(
                StandardScaler(),
                LogisticRegression(
                    C=1.0,
                    penalty="l2",
                    solver="lbfgs",
                    max_iter=1000,
                    class_weight="balanced",
                    random_state=42,
                ),
            ),
        ),
        (
            "logistic_regression",
            "tuned",
            {"C": 0.3, "penalty": "l2", "solver": "lbfgs"},
            make_pipeline(
                StandardScaler(),
                LogisticRegression(
                    C=0.3,
                    penalty="l2",
                    solver="lbfgs",
                    max_iter=1000,
                    class_weight="balanced",
                    random_state=42,
                ),
            ),
        ),
    ]

    metrics = []
    fitted_models = {}
    for family, variant, parameters, model in experiments:
        model.fit(x_train, y_train)
        model_key = f"{family}_{variant}"
        fitted_models[model_key] = model
        metrics.append(evaluate_model(family, variant, parameters, model, x_test, y_test))

    best = max(metrics, key=lambda item: (item["f1"], item["roc_auc"]))
    best_model = fitted_models[best["model"]]

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    joblib.dump(best_model, MODEL_DIR / "model.joblib")
    comparison_csv = REPORTS_DIR / "model_comparison.csv"
    with comparison_csv.open("w", newline="") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=[
                "family",
                "variant",
                "model",
                "accuracy",
                "precision",
                "recall",
                "f1",
                "roc_auc",
                "parameters",
                "confusion_matrix",
            ],
        )
        writer.writeheader()
        for item in metrics:
            writer.writerow(
                {
                    **item,
                    "parameters": json.dumps(item["parameters"]),
                    "confusion_matrix": json.dumps(item["confusion_matrix"]),
                }
            )

    with (REPORTS_DIR / "model_metrics.json").open("w") as file:
        json.dump(
            {
                "feature_columns": feature_columns,
                "label_counts": label_counts,
                "test_size": int(len(y_test)),
                "train_size": int(len(y_train)),
                "best_model": best["model"],
                "best_family": best["family"],
                "best_variant": best["variant"],
                "metrics": metrics,
            },
            file,
            indent=2,
        )

    if best["family"] == "random_forest":
        write_feature_importance(best_model, feature_columns)
    else:
        feature_importance_path = REPORTS_DIR / "feature_importance.csv"
        if feature_importance_path.exists():
            feature_importance_path.unlink()

    print(f"Rows: {len(y)}")
    print(f"Label counts: {label_counts}")
    print(f"Best model: {best['model']}")
    print(json.dumps(metrics, indent=2))
    print(f"Wrote: {MODEL_DIR / 'model.joblib'}")
    print(f"Wrote: {REPORTS_DIR / 'model_metrics.json'}")
    print(f"Wrote: {comparison_csv}")


if __name__ == "__main__":
    main()
