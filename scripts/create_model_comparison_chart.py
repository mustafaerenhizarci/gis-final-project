import csv
from pathlib import Path
from xml.sax.saxutils import escape


ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "reports" / "figures" / "model_comparison.csv"
OUTPUT = ROOT / "reports" / "figures" / "model_comparison_chart.svg"


METRICS = [
    ("accuracy", "#2563eb", "Accuracy"),
    ("f1", "#dc2626", "F1"),
    ("roc_auc", "#16a34a", "ROC-AUC"),
]


def read_rows() -> list[dict]:
    with INPUT.open(newline="") as file:
        return list(csv.DictReader(file))


def short_label(model: str) -> str:
    return (
        model.replace("random_forest", "RF")
        .replace("logistic_regression", "LR")
        .replace("baseline", "base")
        .replace("tuned", "tuned")
        .replace("svm", "SVM")
    )


def text(x: float, y: float, value: str, size: int = 13, anchor: str = "middle", weight: str = "400") -> str:
    return (
        f'<text x="{x:.1f}" y="{y:.1f}" text-anchor="{anchor}" '
        f'font-family="Arial, sans-serif" font-size="{size}" font-weight="{weight}" '
        f'fill="#111827">{escape(value)}</text>'
    )


def rect(x: float, y: float, width: float, height: float, fill: str) -> str:
    return f'<rect x="{x:.1f}" y="{y:.1f}" width="{width:.1f}" height="{height:.1f}" fill="{fill}"/>'


def line(x1: float, y1: float, x2: float, y2: float, stroke: str = "#d1d5db", width: float = 1) -> str:
    return (
        f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
        f'stroke="{stroke}" stroke-width="{width}"/>'
    )


def build_svg(rows: list[dict]) -> str:
    width = 1400
    height = 820
    margin_left = 110
    margin_right = 60
    margin_top = 100
    margin_bottom = 170
    chart_width = width - margin_left - margin_right
    chart_height = height - margin_top - margin_bottom
    baseline = margin_top + chart_height

    group_width = chart_width / len(rows)
    bar_width = 38
    bar_gap = 10
    metric_group_width = len(METRICS) * bar_width + (len(METRICS) - 1) * bar_gap

    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="820" viewBox="0 0 1400 820">',
        '<rect width="1400" height="820" fill="#ffffff"/>',
        text(width / 2, 44, "Model Performance Comparison", 28, "middle", "700"),
        text(width / 2, 72, "Accuracy, F1 Score, and ROC-AUC for six classifier runs", 15, "middle", "400"),
    ]

    # Grid and y-axis labels.
    for tick in [0.0, 0.2, 0.4, 0.6, 0.8, 1.0]:
        y = baseline - tick * chart_height
        parts.append(line(margin_left, y, width - margin_right, y, "#e5e7eb"))
        parts.append(text(margin_left - 16, y + 5, f"{tick:.1f}", 13, "end"))

    parts.append(line(margin_left, margin_top, margin_left, baseline, "#6b7280", 1.5))
    parts.append(line(margin_left, baseline, width - margin_right, baseline, "#6b7280", 1.5))

    best_model = max(rows, key=lambda row: (float(row["f1"]), float(row["roc_auc"])))["model"]

    for index, row in enumerate(rows):
        group_x = margin_left + index * group_width + group_width / 2
        start_x = group_x - metric_group_width / 2

        if row["model"] == best_model:
            parts.append(
                f'<rect x="{group_x - group_width / 2 + 8:.1f}" y="{margin_top - 10:.1f}" '
                f'width="{group_width - 16:.1f}" height="{chart_height + 20:.1f}" '
                f'fill="#fef3c7" opacity="0.55" rx="6"/>'
            )
            parts.append(text(group_x, margin_top - 20, "Best model", 13, "middle", "700"))

        for metric_index, (metric, color, _) in enumerate(METRICS):
            value = float(row[metric])
            bar_height = value * chart_height
            x = start_x + metric_index * (bar_width + bar_gap)
            y = baseline - bar_height
            parts.append(rect(x, y, bar_width, bar_height, color))
            parts.append(text(x + bar_width / 2, y - 8, f"{value:.3f}", 11, "middle"))

        label = short_label(row["model"])
        label_y = baseline + 28
        parts.append(
            f'<text x="{group_x:.1f}" y="{label_y:.1f}" text-anchor="end" '
            f'transform="rotate(-28 {group_x:.1f} {label_y:.1f})" '
            f'font-family="Arial, sans-serif" font-size="13" fill="#111827">{escape(label)}</text>'
        )

    # Legend.
    legend_x = margin_left
    legend_y = height - 52
    for index, (_, color, label) in enumerate(METRICS):
        x = legend_x + index * 170
        parts.append(f'<rect x="{x:.1f}" y="{legend_y - 13:.1f}" width="18" height="18" fill="{color}"/>')
        parts.append(text(x + 28, legend_y + 1, label, 14, "start"))

    parts.append(text(width - margin_right, height - 30, "Source: reports/figures/model_comparison.csv", 12, "end"))
    parts.append("</svg>")
    return "\n".join(parts)


def main() -> None:
    rows = read_rows()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(build_svg(rows))
    print(f"Wrote: {OUTPUT}")


if __name__ == "__main__":
    main()
