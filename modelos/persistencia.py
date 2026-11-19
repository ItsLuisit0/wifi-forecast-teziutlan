"""Línea base: persistencia.

No aprende nada: supone que la calidad de la siguiente hora será igual a la
actual. Sirve para comprobar si los modelos realmente aportan algo.
"""

NOMBRE = "Persistencia (línea base)"
CLAVE = "base"


def predecir(df_test):
    """Devuelve la calidad actual (hora t) como pronóstico de la hora t + 1."""
    return df_test["calidad_actual"]
