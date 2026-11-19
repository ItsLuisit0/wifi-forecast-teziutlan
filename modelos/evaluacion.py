"""Métricas comunes para comparar todos los modelos con el mismo conjunto de prueba."""

from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    confusion_matrix,
    f1_score,
    recall_score,
)


def evaluar_modelo(nombre: str, clave: str, y_true, y_pred, etiquetas: list) -> dict:
    cm = confusion_matrix(y_true, y_pred, labels=etiquetas).tolist()
    recalls = recall_score(y_true, y_pred, labels=etiquetas, average=None, zero_division=0)
    idx_debil = etiquetas.index("Débil")
    return {
        "modelo": nombre,
        "clave": clave,
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "balanced_accuracy": round(float(balanced_accuracy_score(y_true, y_pred)), 4),
        "macro_f1": round(
            float(f1_score(y_true, y_pred, labels=etiquetas, average="macro", zero_division=0)), 4
        ),
        "recall_debil": round(float(recalls[idx_debil]), 4),
        "matriz_confusion": cm,
    }
