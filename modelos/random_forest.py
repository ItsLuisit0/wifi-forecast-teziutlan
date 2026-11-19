"""Modelo 1: Random Forest.

120 árboles de decisión; cada árbol vota y se promedian sus probabilidades.
Es el modelo principal: sus árboles se exportan a dist/modelo.js y
dist/forest.js los recorre en el navegador.
"""

from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer

NOMBRE = "Random Forest"
CLAVE = "rf"
N_ARBOLES = 120
PROFUNDIDAD_MAX = 10


class ModeloRandomForest:
    def __init__(self):
        self.imputador = SimpleImputer(strategy="median")
        self.modelo = RandomForestClassifier(
            n_estimators=N_ARBOLES,
            max_depth=PROFUNDIDAD_MAX,
            min_samples_leaf=8,
            class_weight="balanced",
            random_state=42,
            n_jobs=-1,
        )

    def entrenar(self, X_train, y_train):
        self.modelo.fit(self.imputador.fit_transform(X_train), y_train)
        return self

    def predecir(self, X):
        return self.modelo.predict(self.imputador.transform(X))

    def probabilidades(self, X):
        return self.modelo.predict_proba(self.imputador.transform(X))

    @property
    def clases(self):
        return list(self.modelo.classes_)

    def importancias(self, features):
        return sorted(
            [
                {"feature": col, "importancia": round(float(imp), 4)}
                for col, imp in zip(features, self.modelo.feature_importances_)
            ],
            key=lambda x: x["importancia"],
            reverse=True,
        )

    def exportar(self, clases_orden):
        """Convierte los árboles a listas para ejecutarlos en JavaScript."""
        orden_idx = [self.clases.index(c) for c in clases_orden]
        arboles = []
        for estimador in self.modelo.estimators_:
            t = estimador.tree_
            valores = []
            for v in t.value:
                fila = v[0].astype(float)
                suma = fila.sum()
                fila = fila / suma if suma > 0 else fila
                valores.append([round(float(fila[j]), 6) for j in orden_idx])
            arboles.append(
                {
                    "izq": t.children_left.tolist(),
                    "der": t.children_right.tolist(),
                    "feat": t.feature.tolist(),
                    # Umbrales en float64 exacto para paridad total con scikit-learn
                    "umbral": [float(u) for u in t.threshold],
                    "val": valores,
                }
            )
        return {
            "n_arboles": len(self.modelo.estimators_),
            "max_depth": PROFUNDIDAD_MAX,
            "medianas": [float(m) for m in self.imputador.statistics_],
            "arboles": arboles,
        }
