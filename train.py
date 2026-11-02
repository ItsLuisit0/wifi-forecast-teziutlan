"""Entrena el Random Forest que predice la calidad Wi-Fi de la SIGUIENTE hora.

Ejecutar: python train.py [ruta_al_csv]
Entrada:  data/historico_wifi_itst.csv (o el CSV real con las mismas columnas)
Salida:   dist/modelo.js (árboles, métricas y perfiles históricos para la app)

Idea: con lo que se sabe AHORA en una zona (clima, hora, conectados y estado de
la red) se predice cómo estará la red en esa misma zona dentro de una hora.
"""

from pathlib import Path
import sys, json, hashlib

import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    f1_score,
    recall_score,
    confusion_matrix,
)

ROOT = Path(__file__).resolve().parent
SOURCE = (
    Path(sys.argv[1])
    if len(sys.argv) > 1
    else ROOT / "data/historico_wifi_itst.csv"
)
LABELS = ["Buena", "Regular", "Deficiente"]
INICIO_PRUEBA = "2026-10-12"  # las últimas 2 semanas se reservan para la prueba

# Variables que la app puede conocer en el momento de la consulta.
CONTEXTO = [
    "edificio_id",
    "planta_alta",
    "hora",
    "dia_semana",
    "temperatura_c",
    "humedad_pct",
    "precipitacion_mm",
    "llueve",
    "viento_kmh",
    "precip_prox_hora_mm",
    "dispositivos_conectados",
]
RED = [
    "senal_dbm",
    "latencia_ms",
    "perdida_pct",
    "descarga_mbps",
    "calidad_actual_num",
]
FEATURES = CONTEXTO + RED


# 1. Lectura y preparación (U3).
df = pd.read_csv(SOURCE, encoding="utf-8-sig")
assert df["id_medicion"].is_unique, "IDs repetidos"
df = df.drop_duplicates(subset=["fecha_hora", "edificio_id", "planta"])
df["fecha_hora"] = pd.to_datetime(df["fecha_hora"])
df["fecha"] = df["fecha_hora"].dt.date.astype(str)
df["planta_alta"] = (df["planta"] == "Alta").astype(int)
df["calidad_actual_num"] = df["calidad_actual"].map(
    {l: i for i, l in enumerate(LABELS)}
)
df = df.sort_values(["edificio_id", "planta", "fecha_hora"])

# 2. Objetivo: la calidad de la misma zona una hora después, el mismo día.
zona_dia = df.groupby(["fecha", "edificio_id", "planta"])
df["calidad_siguiente"] = zona_dia["calidad_actual"].shift(-1)
df["precip_prox_hora_mm"] = zona_dia["precipitacion_mm"].shift(-1)  # en la app: pronóstico
df = df.dropna(subset=["calidad_siguiente"])

train = df[df["fecha"] < INICIO_PRUEBA]
test = df[df["fecha"] >= INICIO_PRUEBA]

# Imputación con la mediana del ENTRENAMIENTO (sin fuga de información de la prueba).
medianas = train[FEATURES].median()
X_train = train[FEATURES].fillna(medianas).to_numpy(np.float64)
X_test = test[FEATURES].fillna(medianas).to_numpy(np.float64)
y_train, y_test = (
    train["calidad_siguiente"].to_numpy(),
    test["calidad_siguiente"].to_numpy(),
)

PARAMS = dict(
    n_estimators=120,
    max_depth=10,
    min_samples_leaf=8,
    class_weight="balanced",
    random_state=42,
    n_jobs=-1,
)


def evaluar(pred):
    return dict(
        accuracy=round(float(accuracy_score(y_test, pred)), 4),
        balanced_accuracy=round(float(balanced_accuracy_score(y_test, pred)), 4),
        macro_f1=round(float(f1_score(y_test, pred, average="macro")), 4),
        recall_deficiente=round(
            float(
                recall_score(
                    y_test, pred, labels=["Deficiente"], average="macro"
                )
            ),
            4,
        ),
    )


# 3. Líneas base: la clase más frecuente y "la próxima hora será igual que ahora".
mas_frecuente = pd.Series(y_train).mode()[0]
resultados = {
    "Clase más frecuente": evaluar(np.full(len(y_test), mas_frecuente)),
    "Persistencia (igual que ahora)": evaluar(
        test["calidad_actual"].to_numpy()
    ),
}

# 4. Random Forest solo con contexto (clima, zona, hora, conectados) y completo.
idx_ctx = [FEATURES.index(f) for f in CONTEXTO]
rf_ctx = RandomForestClassifier(**PARAMS).fit(X_train[:, idx_ctx], y_train)
resultados["Random Forest solo contexto"] = evaluar(
    rf_ctx.predict(X_test[:, idx_ctx])
)

rf = RandomForestClassifier(**PARAMS).fit(X_train, y_train)
pred_test = rf.predict(X_test)
resultados["Random Forest completo"] = evaluar(pred_test)
confusion = confusion_matrix(y_test, pred_test, labels=LABELS).tolist()

# 5. Modelo final con todo el histórico para usarlo en la app.
modelo = RandomForestClassifier(**PARAMS).fit(
    df[FEATURES].fillna(medianas).to_numpy(np.float64),
    df["calidad_siguiente"].to_numpy(),
)

arboles = []
for est in modelo.estimators_:
    t = est.tree_
    hoja = t.children_left == -1
    valores = t.value[:, 0, :] / t.value[:, 0, :].sum(axis=1, keepdims=True)
    arboles.append(
        dict(
            l=t.children_left.tolist(),
            r=t.children_right.tolist(),
            f=t.feature.tolist(),
            t=t.threshold.tolist(),
            v=[
                [round(float(p), 5) for p in valores[i]] if hoja[i] else 0
                for i in range(t.node_count)
            ],
        )
    )

# 6. Perfiles históricos por zona, día y hora: valores por defecto en la app.
completo = pd.read_csv(SOURCE, encoding="utf-8-sig")
perfil = (
    completo.groupby(["edificio_id", "planta", "dia_semana", "hora"])
    .agg(
        dispositivos=("dispositivos_conectados", "mean"),
        senal=("senal_dbm", "median"),
        latencia=("latencia_ms", "median"),
        perdida=("perdida_pct", "median"),
        descarga=("descarga_mbps", "median"),
    )
    .round(1)
    .reset_index()
)
dist_hora = (
    completo.groupby(["edificio_id", "planta", "hora"])["calidad_actual"]
    .value_counts(normalize=True)
    .unstack(fill_value=0)
    .reindex(columns=LABELS, fill_value=0)
    .round(3)
    .reset_index()
)
edificios = (
    completo.groupby("edificio_id")[["edificio", "uso"]]
    .first()
    .reset_index()
    .to_dict(orient="records")
)

# Casos de verificación: la app en JavaScript debe dar las mismas probabilidades.
muestra = (
    df.sample(200, random_state=1)[FEATURES]
    .fillna(medianas)
    .to_numpy(np.float64)
)

salida = dict(
    meta=dict(
        fuente=SOURCE.name,
        sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        registros=int(len(completo)),
        entrenamiento=int(len(train)),
        prueba=int(len(test)),
        inicio_prueba=INICIO_PRUEBA,
        fecha_min=str(df["fecha"].min()),
        fecha_max=str(df["fecha"].max()),
        sklearn=sklearn.__version__,
        parametros=PARAMS,
        objetivo="calidad_siguiente (misma zona, +1 hora)",
        resultados=resultados,
        confusion=confusion,
        importancia=sorted(
            zip(
                FEATURES,
                [round(float(x), 4) for x in modelo.feature_importances_],
            ),
            key=lambda x: -x[1],
        ),
    ),
    features=FEATURES,
    labels=LABELS,
    clases=modelo.classes_.tolist(),
    medianas={k: round(float(v), 3) for k, v in medianas.items()},
    edificios=edificios,
    perfil=perfil.to_dict(orient="split")["data"],
    perfil_cols=list(perfil.columns),
    dist_hora=dist_hora.to_dict(orient="split")["data"],
    dist_cols=list(dist_hora.columns),
    arboles=arboles,
    verificacion=dict(
        entradas=muestra.tolist(),
        probabilidades=modelo.predict_proba(muestra).round(8).tolist(),
    ),
)


def legible(x, nivel=0):
    """JSON indentado: objetos en varias líneas, listas de números en una sola línea,
    tablas (listas de filas) con una fila por línea y cada árbol con un arreglo por línea."""
    compacto = lambda v: json.dumps(v, ensure_ascii=False, separators=(", ", ": "))
    pad, pad2 = "  " * nivel, "  " * (nivel + 1)
    if isinstance(x, dict):
        if not x:
            return "{}"
        if all(isinstance(v, list) for v in x.values()):  # árbol: l, r, f, t, v
            items = [
                f"{pad2}{compacto(k)}: {compacto(v)}" for k, v in x.items()
            ]
        else:
            items = [
                f"{pad2}{compacto(k)}: {legible(v, nivel + 1)}"
                for k, v in x.items()
            ]
        return "{\n" + ",\n".join(items) + "\n" + pad + "}"
    if isinstance(x, list):
        if all(not isinstance(v, (dict, list)) for v in x):
            return compacto(x)
        return (
            "[\n"
            + ",\n".join(pad2 + legible(v, nivel + 1) for v in x)
            + "\n"
            + pad
            + "]"
        )
    return compacto(x)


(ROOT / "dist").mkdir(exist_ok=True)
(ROOT / "dist/modelo.js").write_text(
    "// Generado por train.py: no editar a mano.\nwindow.MODELO_WIFI = "
    + legible(salida)
    + ";\n",
    encoding="utf-8",
)
print(
    json.dumps(
        dict(
            resultados=resultados,
            confusion=confusion,
            importancia=salida["meta"]["importancia"][:8],
        ),
        ensure_ascii=False,
        indent=2,
    )
)
print(
    "modelo.js:",
    round((ROOT / "dist/modelo.js").stat().st_size / 1e6, 2),
    "MB",
)