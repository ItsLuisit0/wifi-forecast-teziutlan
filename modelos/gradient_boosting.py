"""Modelo 3: HistGradientBoosting.

Serie de árboles donde cada uno corrige los errores del anterior.
Solo se usa como referencia para comparar; no se exporta a la página.
"""

from sklearn.ensemble import HistGradientBoostingClassifier

NOMBRE = "HistGradientBoosting"
CLAVE = "hgb"


class ModeloGradientBoosting:
    def __init__(self):
        # Maneja valores faltantes por sí solo, no necesita imputador
        self.modelo = HistGradientBoostingClassifier(
            max_depth=6,
            learning_rate=0.08,
            max_iter=150,
            class_weight="balanced",
            random_state=42,
        )

    def entrenar(self, X_train, y_train):
        self.modelo.fit(X_train, y_train)
        return self

    def predecir(self, X):
        return self.modelo.predict(X)
