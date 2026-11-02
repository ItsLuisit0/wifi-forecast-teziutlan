"""Genera el histórico SIMULADO de mediciones Wi-Fi del ITST.

Ejecutar: python generar_dataset.py
Salida:   data/historico_wifi_itst.csv

Los datos NO son mediciones reales. Sirven para construir y probar el
prototipo mientras se recolectan datos reales con el mismo formato de columnas.
Todos los supuestos están en las constantes de este archivo y en README.md.
"""

from pathlib import Path
import numpy as np
import pandas as pd

SEED = 2026
INICIO, FIN = "2026-08-31", "2026-10-23"  # 8 semanas de clases, lunes a viernes
HORAS = range(7, 21)  # una medición por hora, de 07:00 a 20:00
ROOT = Path(__file__).resolve().parent

# Edificio: (nombre, uso, personas base por planta, puntos de acceso por planta,
#            capacidad del enlace en Mbps, señal base dBm baja/alta)
EDIFICIOS = [
    ("Edificio A", "Aulas", 45, 2, 150, (-55, -60)),
    ("Edificio B", "Aulas", 50, 2, 150, (-57, -62)),
    ("Edificio C", "Aulas", 40, 2, 120, (-60, -64)),
    ("Edificio D", "Laboratorios de cómputo", 35, 3, 300, (-48, -52)),
    ("Edificio E", "Aulas y cubículos", 55, 2, 150, (-58, -66)),
    ("Edificio F", "Biblioteca", 60, 3, 250, (-50, -55)),
    ("Edificio G", "Administrativo", 25, 1, 100, (-54, -58)),
    ("Edificio H", "Cafetería y usos múltiples", 70, 2, 120, (-62, -67)),
    ("Edificio I", "Laboratorios de ingeniería", 30, 2, 150, (-56, -61)),
    ("Edificio J", "Posgrado y auditorio", 20, 1, 100, (-59, -63)),
]
PLANTAS = ["Baja", "Alta"]

# Ocupación relativa por hora (1.0 = hora pico).
CURVA = {7: 0.35, 8: 0.7, 9: 0.9, 10: 1.0, 11: 1.0, 12: 0.95, 13: 0.85,
         14: 0.6, 15: 0.65, 16: 0.75, 17: 0.7, 18: 0.55, 19: 0.4, 20: 0.2}
CURVA_CAFETERIA = {7: 0.3, 8: 0.5, 9: 0.6, 10: 0.7, 11: 0.8, 12: 0.9, 13: 1.0,
                   14: 1.0, 15: 0.9, 16: 0.6, 17: 0.5, 18: 0.4, 19: 0.3, 20: 0.15}
FACTOR_DIA = {0: 1.0, 1: 1.05, 2: 1.05, 3: 1.0, 4: 0.8}  # lunes=0 ... viernes=4

rng = np.random.default_rng(SEED)
dias = pd.bdate_range(INICIO, FIN)


def clima_del_dia(i_dia):
    """Clima horario simulado para Teziutlán en temporada de lluvias (sep-oct)."""
    lluvioso = rng.random() < 0.55
    t_min = 12.5 - 0.04 * i_dia + rng.normal(0, 0.8)
    amplitud = (6.5 if not lluvioso else 4.0) + rng.normal(0, 0.8)
    inicio_lluvia = int(rng.integers(13, 18)) if lluvioso else 99
    duracion = int(rng.integers(2, 6))
    intensidad = rng.gamma(2.0, 1.4) if lluvioso else 0.0
    viento_base = rng.uniform(6, 14)
    filas = {}
    for h in HORAS:
        fase = np.sin(np.pi * (h - 7) / 14)  # máximo hacia las 14:00
        lloviendo = inicio_lluvia <= h < inicio_lluvia + duracion
        temp = t_min + amplitud * fase - (1.5 if lloviendo else 0) + rng.normal(0, 0.4)
        precip = max(0.0, intensidad * rng.uniform(0.3, 1.5)) if lloviendo else 0.0
        if not lloviendo and rng.random() < 0.04:  # llovizna aislada
            precip = round(rng.uniform(0.1, 0.4), 1)
        hum = 97 - 2.2 * (temp - 10) + (6 if precip > 0 else 0) + rng.normal(0, 2.5)
        viento = viento_base + 6 * fase + (8 if precip > 3 else 0) + rng.normal(0, 2)
        filas[h] = dict(
            temperatura_c=round(temp, 1),
            humedad_pct=round(float(np.clip(hum, 55, 100))),
            precipitacion_mm=round(precip, 1),
            llueve=int(precip >= 0.1),
            viento_kmh=round(max(0.0, viento), 1),
        )
    return filas


registros = []
for i_dia, dia in enumerate(dias):
    clima = clima_del_dia(i_dia)
    dow = dia.dayofweek
    for e_id, (nombre, uso, base, aps, enlace, senal) in enumerate(EDIFICIOS, 1):
        for p_id, planta in enumerate(PLANTAS):
            # Falla de punto de acceso: ~3 % de los días por zona, dura 1 a 4 horas.
            falla_ini = int(rng.integers(7, 20)) if rng.random() < 0.03 else 99
            falla_fin = falla_ini + int(rng.integers(1, 5))
            ruido = 0.0  # ruido autocorrelacionado (AR(1)) de la zona durante el día
            for h in HORAS:
                c = clima[h]
                curva = CURVA_CAFETERIA if "Cafetería" in uso else CURVA
                ocup = curva[h] * FACTOR_DIA[dow]
                # Con lluvia la gente se refugia en biblioteca, cafetería y planta baja.
                if c["llueve"]:
                    ocup *= 1.25 if uso in ("Biblioteca", "Cafetería y usos múltiples") else 1.08
                    if p_id == 0:
                        ocup *= 1.05
                personas = base * (1.1 if p_id == 0 else 0.9) * ocup
                dispositivos = int(rng.poisson(max(personas * 1.35, 1)))

                carga = dispositivos / (aps * 32)  # 32 clientes cómodos por AP
                ruido = 0.75 * ruido + rng.normal(0, 0.12)
                en_falla = falla_ini <= h < falla_fin
                tormenta = c["precipitacion_mm"] > 4 and c["viento_kmh"] > 22

                senal_dbm = senal[p_id] - 0.04 * max(0, c["humedad_pct"] - 85) + rng.normal(0, 2.5)
                latencia = 14 + 70 * carga ** 2 + 10 * max(0, -62 - senal_dbm) / 5
                latencia *= np.exp(ruido)
                descarga = enlace / max(dispositivos, 1) * 6 * np.exp(-ruido) * rng.uniform(0.85, 1.1)
                descarga = min(descarga, 95)
                perdida = 0.15 + 3.0 * max(0, carga - 0.75) + 0.08 * max(0, -65 - senal_dbm)
                perdida += abs(rng.normal(0, 0.15))
                if tormenta and rng.random() < 0.35:  # microcortes del enlace con tormenta
                    latencia += rng.uniform(40, 120)
                    perdida += rng.uniform(1, 4)
                if en_falla:
                    latencia += rng.uniform(120, 300)
                    descarga *= rng.uniform(0.03, 0.15)
                    perdida += rng.uniform(5, 15)
                subida = descarga * rng.uniform(0.25, 0.4)

                registros.append(dict(
                    fecha_hora=f"{dia:%Y-%m-%d} {h:02d}:00",
                    dia_semana=dow,
                    hora=h,
                    edificio_id=e_id,
                    edificio=nombre,
                    uso=uso,
                    planta=planta,
                    **c,
                    dispositivos_conectados=dispositivos,
                    senal_dbm=round(senal_dbm),
                    latencia_ms=round(latencia, 1),
                    perdida_pct=round(min(perdida, 100), 2),
                    descarga_mbps=round(descarga, 1),
                    subida_mbps=round(subida, 1),
                ))

df = pd.DataFrame(registros)


def calidad(lat, desc, perd):
    """Regla de calidad (escrita antes de entrenar, no la aprende el modelo)."""
    if lat > 120 or desc < 5 or perd > 5:
        return "Deficiente"
    if lat <= 60 and desc >= 20 and perd <= 1:
        return "Buena"
    return "Regular"


df["calidad_actual"] = [calidad(*v) for v in df[["latencia_ms", "descarga_mbps", "perdida_pct"]].values]

# Faltantes realistas para practicar la U3 (se generan DESPUÉS de calcular la calidad).
n = len(df)
df.loc[rng.random(n) < 0.012, "dispositivos_conectados"] = np.nan  # el controlador no respondió
falla_speedtest = rng.random(n) < 0.006
df.loc[falla_speedtest, ["descarga_mbps", "subida_mbps"]] = np.nan
df["dispositivos_conectados"] = df["dispositivos_conectados"].astype("Int64")

df.insert(0, "id_medicion", [f"M{i:05d}" for i in range(1, n + 1)])
(ROOT / "data").mkdir(exist_ok=True)
df.to_csv(ROOT / "data/historico_wifi_itst.csv", index=False, encoding="utf-8-sig")
print(df.shape)
print(df["calidad_actual"].value_counts(normalize=True).round(3).to_dict())
print(df.describe().round(1).T[["mean", "min", "max"]])
