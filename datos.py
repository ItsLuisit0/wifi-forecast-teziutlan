"""Carga y preparación del CSV real de los access points del ITST.

También genera los resúmenes que usa la página (pestaña "Datos" y
valores típicos de cada AP en la pestaña "Pronóstico").
"""

from pathlib import Path

import numpy as np
import pandas as pd

RAIZ_PROYECTO = Path(__file__).resolve().parent
RUTA_CSV = RAIZ_PROYECTO / "data" / "historial_wifi_ap_04_18_nov_2026.csv"

# Días de prueba (validación temporal): todo lo que ocurre desde esta fecha
FECHA_CORTE_TEST = "2026-11-16"

CLASES_ORDEN = ["Buena", "Regular", "Débil"]
# "Excelente" solo aparece 3 veces en el CSV, así que se une con "Buena"
MAPA_CALIDAD = {
    "Excelente": "Buena",
    "Buena": "Buena",
    "Regular": "Regular",
    "Debil": "Débil",
    "Débil": "Débil",
}
TIPO_DIA_COD = {
    "No laborable": 0,
    "Baja asistencia": 1,
    "Laboral (sabado)": 2,
    "Laboral normal": 3,
}

FEATURES = [
    "ap_num",
    "hora",
    "dia_semana",
    "tipo_dia_cod",
    "clientes_conectados",
    "clientes_2_4ghz",
    "clientes_5ghz",
    "velocidad_descarga_mbps",
    "velocidad_subida_mbps",
    "rssi_dbm",
    "enlace_mbps",
    "es_malla",
    "modelo_ap_cod",
]
OBJETIVO = "calidad_proxima_hora"

# Columnas que se usan para el "perfil típico" de cada AP en la página
COLS_PERFIL = [
    "clientes_conectados",
    "clientes_2_4ghz",
    "clientes_5ghz",
    "velocidad_descarga_mbps",
    "velocidad_subida_mbps",
    "rssi_dbm",
]


def cargar_dataset() -> pd.DataFrame:
    if not RUTA_CSV.exists():
        raise FileNotFoundError(f"No se encontró el CSV en {RUTA_CSV}")
    print(f"Dataset cargado desde: {RUTA_CSV.relative_to(RAIZ_PROYECTO)}")
    return pd.read_csv(RUTA_CSV, encoding="utf-8-sig")


def codificar_modelo_ap(texto: str) -> int:
    if "LR" in texto:
        return 2
    if "Pro" in texto:
        return 1
    return 0  # UAP-AC-Lite


def preparar_features(df: pd.DataFrame) -> pd.DataFrame:
    datos = df.copy()
    datos["fecha_hora"] = pd.to_datetime(datos["fecha_hora"])
    datos["fecha"] = datos["fecha_hora"].dt.strftime("%Y-%m-%d")
    datos["hora"] = datos["fecha_hora"].dt.hour
    datos["dia_semana"] = datos["fecha_hora"].dt.day_of_week  # 0 = lunes
    datos["tipo_dia_cod"] = datos["tipo_dia"].map(TIPO_DIA_COD)
    datos["ap_num"] = datos["identificador_ap"].str.extract(r"(\d+)")[0].astype(int)
    datos["rssi_dbm"] = datos["calidad_senal_rssi_dbm"]
    enlace = datos["Velocidad del enlace del AP (Mbps)"].str.extract(r"(\d+)")[0]
    datos["enlace_mbps"] = pd.to_numeric(enlace, errors="coerce").fillna(0)
    datos["es_malla"] = datos["tipo_enlace_ap"].str.contains("malla", case=False).astype(int)
    datos["modelo_ap_cod"] = datos["modelo_ap"].map(codificar_modelo_ap)
    datos["calidad_actual"] = datos["calidad_senal_nivel"].map(MAPA_CALIDAD)

    # Objetivo: calidad del mismo AP en la hora siguiente (t + 1)
    datos = datos.sort_values(["identificador_ap", "fecha_hora"]).reset_index(drop=True)
    grupo = datos.groupby("identificador_ap")
    siguiente_hora = grupo["fecha_hora"].shift(-1)
    datos[OBJETIVO] = grupo["calidad_actual"].shift(-1)
    consecutivo = (siguiente_hora - datos["fecha_hora"]) == pd.Timedelta(hours=1)
    datos.loc[~consecutivo, OBJETIVO] = np.nan
    # La última hora de cada AP no tiene "siguiente hora": se queda con NaN
    return datos


def dividir_train_test(df: pd.DataFrame):
    """División temporal: entrenamiento antes de FECHA_CORTE_TEST, prueba desde esa fecha."""
    mascara_test = df["fecha"] >= FECHA_CORTE_TEST
    return (
        df.loc[~mascara_test, FEATURES],
        df.loc[~mascara_test, OBJETIVO],
        df.loc[mascara_test, FEATURES],
        df.loc[mascara_test, OBJETIVO],
        mascara_test,
    )


# ---------- Resúmenes para la página ----------
def proporciones(serie: pd.Series) -> dict:
    total = len(serie) or 1
    conteos = serie.value_counts()
    return {c: round(float(conteos.get(c, 0) / total), 4) for c in CLASES_ORDEN}


def resumen_datos(df: pd.DataFrame) -> dict:
    """Información descriptiva del CSV para la pestaña "Datos"."""
    por_hora = [
        {"hora": int(h), **proporciones(g["calidad_actual"])}
        for h, g in df.groupby("hora")
    ]
    por_tipo = [
        {
            "tipo": tipo,
            "dias": int(g["fecha"].nunique()),
            "clientes_prom": round(float(g["clientes_conectados"].mean()), 1),
            **proporciones(g["calidad_actual"]),
        }
        for tipo, g in df.groupby("tipo_dia")
    ]
    por_tipo.sort(key=lambda r: -TIPO_DIA_COD[r["tipo"]])

    conteo = df["calidad_actual"].value_counts()
    return {
        "registros": int(len(df)),
        "aps": int(df["identificador_ap"].nunique()),
        "dias": int(df["fecha"].nunique()),
        "fecha_inicio": df["fecha"].min(),
        "fecha_fin": df["fecha"].max(),
        "clientes_prom": round(float(df["clientes_conectados"].mean()), 1),
        "clientes_max": int(df["clientes_conectados"].max()),
        "rssi_prom": round(float(df["rssi_dbm"].mean()), 1),
        "conteo_clases": {c: int(conteo.get(c, 0)) for c in CLASES_ORDEN},
        "por_hora": por_hora,
        "por_tipo_dia": por_tipo,
    }


def catalogo_aps(df: pd.DataFrame) -> list:
    aps = []
    for ap_id, g in df.groupby("identificador_ap"):
        fila = g.iloc[0]
        aps.append(
            {
                "id": ap_id,
                "num": int(fila["ap_num"]),
                "nombre": fila["nombre_ap"].strip(),
                "modelo": fila["modelo_ap"],
                "enlace": fila["tipo_enlace_ap"],
                "enlace_mbps": float(fila["enlace_mbps"]),
                "es_malla": int(fila["es_malla"]),
                "modelo_ap_cod": int(fila["modelo_ap_cod"]),
                "clientes_prom": round(float(g["clientes_conectados"].mean()), 1),
                "rssi_prom": round(float(g["rssi_dbm"].mean()), 1),
                **proporciones(g["calidad_actual"]),
            }
        )
    return sorted(aps, key=lambda a: a["num"])


def perfiles_tipicos(df: pd.DataFrame) -> dict:
    """Mediana de cada medición por AP, tipo de día y hora.
    La página la usa para rellenar el formulario con valores realistas."""
    medianas = df.groupby(["identificador_ap", "tipo_dia_cod", "hora"])[COLS_PERFIL].median()
    perfil = {}
    for (ap_id, tipo, hora), fila in medianas.iterrows():
        valores = [round(float(v), 4) for v in fila.values]
        perfil.setdefault(ap_id, {}).setdefault(str(int(tipo)), [None] * 24)[int(hora)] = valores
    return perfil
