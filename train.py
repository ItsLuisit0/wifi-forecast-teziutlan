"""Entrena todos los modelos con el historial real de los access points del ITST
(4 al 18 de noviembre de 2026) y exporta los resultados a dist/modelo.js.

Este archivo solo coordina. Cada parte está en su propio archivo:
- datos.py                       → carga y preparación del CSV
- modelos/random_forest.py       → Random Forest
- modelos/red_neuronal.py        → Red neuronal MLP
- modelos/gradient_boosting.py   → HistGradientBoosting (referencia)
- modelos/persistencia.py        → Línea base
- modelos/evaluacion.py          → Métricas

Objetivo: pronosticar la calidad de señal de cada AP en la siguiente hora (t+1).
Clases: Buena (RSSI > -60 dBm), Regular (-70 a -60 dBm) y Débil (< -70 dBm).
"""

import json

import numpy as np
import pandas as pd

import datos
from modelos import gradient_boosting, persistencia, random_forest, red_neuronal
from modelos.evaluacion import evaluar_modelo

RUTA_SALIDA = datos.RAIZ_PROYECTO / "dist" / "modelo.js"


def muestras_verificacion(X_test, probs_rf, probs_mlp, idx_rf, idx_mlp, n=200):
    """Filas de prueba con las probabilidades de Python, para comprobar
    con verificar.cjs que el navegador calcula exactamente lo mismo."""
    rng = np.random.default_rng(42)
    n = min(n, len(X_test))
    salida = []
    for i in rng.choice(len(X_test), size=n, replace=False):
        salida.append(
            {
                "x": [None if pd.isna(v) else float(v) for v in X_test.iloc[i].values],
                "probs_rf": [float(probs_rf[i][j]) for j in idx_rf],
                "probs_mlp": [float(probs_mlp[i][j]) for j in idx_mlp],
            }
        )
    return salida


def main():
    # 1. Datos
    df_todo = datos.preparar_features(datos.cargar_dataset())
    df = df_todo.dropna(subset=[datos.OBJETIVO]).reset_index(drop=True)
    X_train, y_train, X_test, y_test, mascara_test = datos.dividir_train_test(df)
    print(f"Features ({len(datos.FEATURES)}): {datos.FEATURES}")
    print(
        f"Entrenamiento: {len(X_train)} filas | "
        f"Prueba (desde {datos.FECHA_CORTE_TEST}): {len(X_test)} filas"
    )

    # 2. Entrenamiento de cada modelo
    rf = random_forest.ModeloRandomForest().entrenar(X_train, y_train)
    mlp = red_neuronal.ModeloRedNeuronal().entrenar(X_train, y_train)
    hgb = gradient_boosting.ModeloGradientBoosting().entrenar(X_train, y_train)

    # 3. Evaluación con los mismos días de prueba
    clases = [c for c in datos.CLASES_ORDEN if c in rf.clases]
    comparativa = [
        evaluar_modelo(random_forest.NOMBRE, random_forest.CLAVE, y_test, rf.predecir(X_test), clases),
        evaluar_modelo(red_neuronal.NOMBRE, red_neuronal.CLAVE, y_test, mlp.predecir(X_test), clases),
        evaluar_modelo(gradient_boosting.NOMBRE, gradient_boosting.CLAVE, y_test, hgb.predecir(X_test), clases),
        evaluar_modelo(
            persistencia.NOMBRE, persistencia.CLAVE, y_test, persistencia.predecir(df.loc[mascara_test]), clases
        ),
    ]

    # 4. Exportación para la página
    verificacion = muestras_verificacion(
        X_test,
        rf.probabilidades(X_test),
        mlp.probabilidades(X_test),
        [rf.clases.index(c) for c in clases],
        [mlp.clases.index(c) for c in clases],
    )
    importancias = rf.importancias(datos.FEATURES)

    payload = {
        "version": "3.1-modelos-separados",
        "fuente": datos.RUTA_CSV.name,
        "clases": clases,
        "features": datos.FEATURES,
        "fecha_corte_test": datos.FECHA_CORTE_TEST,
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "comparativa": comparativa,
        "importancias": importancias,
        "datos": datos.resumen_datos(df_todo),
        "aps": datos.catalogo_aps(df_todo),
        "perfil_cols": datos.COLS_PERFIL,
        "perfil": datos.perfiles_tipicos(df_todo),
        "rf": rf.exportar(clases),
        "mlp": mlp.exportar(clases),
        "verificacion": verificacion,
    }

    RUTA_SALIDA.parent.mkdir(parents=True, exist_ok=True)
    with open(RUTA_SALIDA, "w", encoding="utf-8") as f:
        f.write("const MODELO = " + json.dumps(payload, ensure_ascii=False) + ";\n")
        f.write("if (typeof module !== 'undefined') module.exports = MODELO;\n")

    print(f"\nExportado {RUTA_SALIDA.relative_to(datos.RAIZ_PROYECTO)} con {len(verificacion)} muestras de control:")
    for item in comparativa:
        print(
            f" - {item['modelo']}: Acc={item['accuracy']:.4f} | "
            f"BalAcc={item['balanced_accuracy']:.4f} | "
            f"MacroF1={item['macro_f1']:.4f} | "
            f"RecallDébil={item['recall_debil']:.4f}"
        )
    print("Importancias RF:", ", ".join(f"{i['feature']}={i['importancia']}" for i in importancias))


if __name__ == "__main__":
    main()
