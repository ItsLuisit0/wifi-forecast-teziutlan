"""Modelo 2: Red neuronal MLP (perceptrón multicapa).

Dos capas ocultas (64 y 32 neuronas, ReLU) y salida softmax.
Las variables se imputan por mediana y se estandarizan antes de entrar.
Sus pesos se exportan a dist/modelo.js para ejecutarla en el navegador.
"""

import numpy as np
from sklearn.impute import SimpleImputer
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.utils.class_weight import compute_sample_weight

NOMBRE = "Red Neuronal MLP"
CLAVE = "mlp"
CAPAS_OCULTAS = (64, 32)


class ModeloRedNeuronal:
    def __init__(self):
        self.imputador = SimpleImputer(strategy="median")
        self.escalador = StandardScaler()
        self.modelo = MLPClassifier(
            hidden_layer_sizes=CAPAS_OCULTAS,
            activation="relu",
            alpha=1e-3,
            max_iter=500,
            early_stopping=True,
            validation_fraction=0.15,
            random_state=42,
        )

    def _transformar(self, X):
        return self.escalador.transform(self.imputador.transform(X))

    def entrenar(self, X_train, y_train):
        X = self.escalador.fit_transform(self.imputador.fit_transform(X_train))
        # Pesos balanceados para que la clase minoritaria cuente igual
        pesos = compute_sample_weight(class_weight="balanced", y=y_train)
        self.modelo.fit(X, y_train, sample_weight=pesos)
        return self

    def predecir(self, X):
        return self.modelo.predict(self._transformar(X))

    def probabilidades(self, X):
        return self.modelo.predict_proba(self._transformar(X))

    @property
    def clases(self):
        return list(self.modelo.classes_)

    def exportar(self, clases_orden):
        """Exporta pesos, sesgos y el escalado para ejecutarla en JavaScript."""
        orden_idx = [self.clases.index(c) for c in clases_orden]
        pesos = [w.tolist() for w in self.modelo.coefs_]
        sesgos = [b.tolist() for b in self.modelo.intercepts_]
        # Reordenar la capa de salida para que coincida con clases_orden
        pesos[-1] = np.array(pesos[-1])[:, orden_idx].tolist()
        sesgos[-1] = np.array(sesgos[-1])[orden_idx].tolist()
        return {
            "capas": list(CAPAS_OCULTAS),
            "iteraciones": int(self.modelo.n_iter_),
            "medianas": [float(m) for m in self.imputador.statistics_],
            "medias": [float(m) for m in self.escalador.mean_],
            "escalas": [float(s) for s in self.escalador.scale_],
            "pesos": pesos,
            "sesgos": sesgos,
        }
