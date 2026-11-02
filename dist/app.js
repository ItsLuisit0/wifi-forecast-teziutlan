const M = window.MODELO_WIFI;
const C = window.CAMPUS;
const $ = (id) => document.getElementById(id);
const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes"];
const CLIMA = [
  "temperatura_c",
  "humedad_pct",
  "precipitacion_mm",
  "precip_prox_hora_mm",
  "viento_kmh",
];
const RED = [
  "dispositivos_conectados",
  "senal_dbm",
  "latencia_ms",
  "perdida_pct",
  "descarga_mbps",
];
const COLOR = {
  Buena: "var(--buena)",
  Regular: "var(--regular)",
  Deficiente: "var(--deficiente)",
};
const ICONO_CLASE = {
  Buena: "wifi-high",
  Regular: "wifi-medium",
  Deficiente: "wifi-slash",
};
// Íconos Phosphor (duotono): https://phosphoricons.com
const icono = (n) => `<i class="ico ph-duotone ph-${n}" aria-hidden="true"></i>`;
const medidos = new Set(); // campos que vienen de la medición del navegador

// ---------- Datos históricos exportados por train.py ----------
const perfil = new Map();
M.perfil.forEach((r) => {
  const o = Object.fromEntries(M.perfil_cols.map((c, i) => [c, r[i]]));
  perfil.set(`${o.edificio_id}|${o.planta}|${o.dia_semana}|${o.hora}`, o);
});
const distHora = M.dist_hora.map((r) =>
  Object.fromEntries(M.dist_cols.map((c, i) => [c, r[i]]))
);

// Misma regla de calidad que generar_dataset.py.
function calidad(lat, desc, perd) {
  if (lat > 120 || desc < 5 || perd > 5) return "Deficiente";
  if (lat <= 60 && desc >= 20 && perd <= 1) return "Buena";
  return "Regular";
}

// ---------- Almacenamiento local de la calibración ----------
function leerCalibracion() {
  try {
    return JSON.parse(localStorage.getItem("itst-coordenadas") || "{}");
  } catch {
    return {};
  }
}
function coordenadas(id) {
  return leerCalibracion()[id] || C.edificios[id];
}

// ---------- Paso 1: zona ----------
function llenarSelects() {
  M.edificios.forEach((e) =>
    $("edificio").add(new Option(`${e.edificio} · ${e.uso}`, e.edificio_id))
  );
  for (let h = 7; h <= 19; h++) {
    $("hora").add(new Option(`${String(h).padStart(2, "0")}:00`, h));
  }
}

function distanciaM(a, b) {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function detectarUbicacion() {
  if (!navigator.geolocation) {
    return ($("estado-gps").textContent =
      "Este navegador no permite obtener la ubicación.");
  }
  $("estado-gps").textContent = "Obteniendo ubicación…";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const yo = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      let mejor = null;
      M.edificios.forEach((e) => {
        const d = distanciaM(yo, coordenadas(e.edificio_id));
        if (!mejor || d < mejor.d) mejor = { id: e.edificio_id, nombre: e.edificio, d };
      });
      const precision = Math.round(pos.coords.accuracy);
      if (mejor.d > C.radioMaximoM) {
        $("estado-gps").textContent = `Estás a ${(mejor.d / 1000).toFixed(
          1
        )} km del campus. Elige el edificio a mano.`;
      } else {
        $("edificio").value = mejor.id;
        $("estado-gps").textContent = `Edificio más cercano: ${
          mejor.nombre
        } (a ${Math.round(mejor.d)} m, precisión ±${precision} m). El GPS no distingue planta: elígela.`;
        cambioDeZona();
      }
      cargarClima(yo);
    },
    (err) =>
      ($("estado-gps").textContent =
        `No se pudo obtener la ubicación (${err.message}). Elige el edificio a mano.`),
    { enableHighAccuracy: true, timeout: 15000 }
  );
}

function calibrar() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition((pos) => {
    const id = $("edificio").value;
    const cal = leerCalibracion();
    cal[id] = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    try {
      localStorage.setItem("itst-coordenadas", JSON.stringify(cal));
    } catch {
      /* sin almacenamiento */
    }
    $("estado-gps").textContent = `Guardado: ${
      $("edificio").selectedOptions[0].text
    } = ${cal[id].lat.toFixed(5)}, ${cal[id].lon.toFixed(
      5
    )}. Cópialo a edificios.js para hacerlo permanente.`;
  });
}

// ---------- Paso 2: clima (Open-Meteo, sin clave) ----------
async function cargarClima(punto = coordenadas($("edificio").value)) {
  $("estado-clima").textContent = "Consultando Open-Meteo…";
  const url =
    "https://api.open-meteo.com/v1/forecast?latitude=" +
    punto.lat +
    "&longitude=" +
    punto.lon +
    "&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m" +
    "&hourly=precipitation&forecast_hours=3&timezone=auto";
  try {
    const r = await fetch(url);
    if (!r.ok) throw Error("HTTP " + r.status);
    const d = await r.json();
    $("temperatura_c").value = d.current.temperature_2m;
    $("humedad_pct").value = d.current.relative_humidity_2m;
    $("precipitacion_mm").value = d.current.precipitation;
    $("viento_kmh").value = d.current.wind_speed_10m;
    $("precip_prox_hora_mm").value =
      d.hourly.precipitation[1] ?? d.current.precipitation;
    $("estado-clima").textContent = `Clima real de Open-Meteo (${d.current.time.replace(
      "T",
      " "
    )}).`;
  } catch (e) {
    CLIMA.forEach((c) => {
      if ($(c).value === "") $(c).value = M.medianas[c];
    });
    $("estado-clima").textContent = `Sin conexión con Open-Meteo (${e.message}). Se usan valores típicos; puedes escribirlos.`;
  }
  predecir();
}

// ---------- Paso 3: red ahora ----------
function ajustarHoraActual() {
  const ahora = new Date();
  let dia = (ahora.getDay() + 6) % 7;
  let hora = ahora.getHours();
  let nota = "";
  if (dia > 4) {
    dia = 4;
    nota = "Hoy no hay clases: se usa el viernes como referencia. ";
  }
  if (hora < 7) {
    hora = 7;
    nota += "Antes de las 7:00 se usa las 07:00.";
  }
  if (hora > 19) {
    hora = 19;
    nota += "El histórico termina a las 20:00: se usa las 19:00.";
  }
  $("dia_semana").value = dia;
  $("hora").value = hora;
  $("nota-hora").textContent = nota;
}

function valoresTipicos() {
  const p = perfil.get(
    `${$("edificio").value}|${$("planta").value}|${$("dia_semana").value}|${
      $("hora").value
    }`
  );
  if (!p) return;
  const mapa = {
    dispositivos_conectados: Math.round(p.dispositivos),
    senal_dbm: p.senal,
    latencia_ms: p.latencia,
    perdida_pct: p.perdida,
    descarga_mbps: p.descarga,
  };
  RED.forEach((c) => {
    if (!medidos.has(c)) $(c).value = mapa[c];
  });
}

async function tiempoFetch(url) {
  const t0 = performance.now();
  const r = await fetch(
    url + (url.includes("?") ? "&" : "?") + "nc=" + Math.random(),
    { cache: "no-store" }
  );
  const buf = await r.arrayBuffer();
  return { ms: performance.now() - t0, bytes: buf.byteLength };
}

async function medirRed() {
  $("estado-red").textContent = "Midiendo latencia y descarga…";
  const pequeno =
    "https://cdnjs.cloudflare.com/ajax/libs/normalize/8.0.1/normalize.min.css";
  const grande =
    "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
  const tiempos = [];
  let fallos = 0;
  for (let i = 0; i < 8; i++) {
    try {
      tiempos.push((await tiempoFetch(pequeno)).ms);
    } catch {
      fallos++;
    }
  }
  try {
    if (tiempos.length < 3) throw Error("sin respuesta");
    const ordenados = tiempos.slice(1).sort((a, b) => a - b); // la 1.ª incluye DNS y TLS
    const latencia = ordenados[Math.floor(ordenados.length / 2)];
    const d = await tiempoFetch(grande);
    const mbps = (d.bytes * 8) / (d.ms / 1000) / 1e6;
    $("latencia_ms").value = latencia.toFixed(1);
    $("descarga_mbps").value = mbps.toFixed(1);
    $("perdida_pct").value = ((fallos / 8) * 100).toFixed(2);
    ["latencia_ms", "descarga_mbps", "perdida_pct"].forEach((c) =>
      medidos.add(c)
    );
    $("estado-red").textContent =
      "Latencia, descarga y pérdida medidas desde el navegador (aproximadas). Señal y dispositivos: típicos del histórico.";
  } catch (e) {
    $("estado-red").textContent = `No se pudo medir (${e.message}). Se mantienen los valores típicos.`;
  }
  predecir();
}

// ---------- Predicción ----------
function leer(c) {
  const v = parseFloat($(c).value);
  return Number.isFinite(v) ? v : M.medianas[c];
}

function predecir() {
  const actual = calidad(
    leer("latencia_ms"),
    leer("descarga_mbps"),
    leer("perdida_pct")
  );
  const v = {
    edificio_id: +$("edificio").value,
    planta_alta: $("planta").value === "Alta" ? 1 : 0,
    hora: +$("hora").value,
    dia_semana: +$("dia_semana").value,
    llueve: leer("precipitacion_mm") >= 0.1 ? 1 : 0,
    calidad_actual_num: M.labels.indexOf(actual),
  };
  [...CLIMA, ...RED].forEach((c) => (v[c] = leer(c)));

  const r = predecirBosque(M, M.features.map((f) => v[f]));
  const prob = Object.fromEntries(
    M.clases.map((c, i) => [c, r.probabilidades[i]])
  );
  const sig = v.hora + 1;

  $("clase-ahora").textContent = actual;
  $("clase-ahora").style.color = COLOR[actual];
  $("tile-ahora").dataset.clase = actual;
  $("icono-ahora").className = `ico ph-duotone ph-${ICONO_CLASE[actual]}`;
  $("clase-futura").textContent = r.clase;
  $("clase-futura").style.color = COLOR[r.clase];
  $("tile-futura").dataset.clase = r.clase;
  $("icono-futura").className = `ico ph-duotone ph-${ICONO_CLASE[r.clase]}`;
  $("confianza").textContent = `Confianza del modelo: ${(prob[r.clase] * 100).toFixed(0)} %`;
  $("titulo-futuro").textContent = `A las ${String(sig).padStart(2, "0")}:00`;
  $("barras-prob").innerHTML = M.labels
    .map(
      (l) => `
      <div class="barra">
        <span style="color:${COLOR[l]}">${icono(ICONO_CLASE[l])}<em style="color:var(--texto);font-style:normal">${l}</em></span>
        <div><i style="width:${(prob[l] * 100).toFixed(
          1
        )}%;background:${COLOR[l]}"></i></div>
        <b>${(prob[l] * 100).toFixed(0)}%</b>
      </div>`
    )
    .join("");

  const h = distHora.find(
    (d) =>
      d.edificio_id === v.edificio_id &&
      d.planta === $("planta").value &&
      d.hora === sig
  );
  const nombre = $("edificio").selectedOptions[0].text.split(" · ")[0];
  $("explicacion").textContent =
    `En el histórico, ${nombre} planta ${$("planta").value.toLowerCase()} a las ${sig}:00 fue deficiente el ` +
    `${(h.Deficiente * 100).toFixed(0)} % de las veces. ` +
    (v.precip_prox_hora_mm >= 0.1
      ? `Se pronostica lluvia (${v.precip_prox_hora_mm} mm), lo que suele concentrar gente bajo techo. `
      : "") +
    `Con ${Math.round(
      v.dispositivos_conectados
    )} dispositivos conectados ahora, la probabilidad de calidad deficiente es ${(
      prob.Deficiente * 100
    ).toFixed(0)} %.`;
  dibujarHistorico(v.edificio_id, $("planta").value, sig);
}

function dibujarHistorico(id, planta, resaltar) {
  const filas = distHora.filter(
    (d) => d.edificio_id === id && d.planta === planta
  );
  const W = 560;
  const H = 150;
  const bw = W / filas.length;
  let svg = `<svg viewBox="0 0 ${W} ${H + 22}" role="img" aria-label="Calidad histórica por hora">`;
  filas.forEach((d, i) => {
    let y = H;
    ["Buena", "Regular", "Deficiente"].forEach((l) => {
      const alto = d[l] * H;
      y -= alto;
      svg += `<rect x="${i * bw + 3}" y="${y}" width="${bw - 6}" height="${alto}" fill="${COLOR[l]}"><title>${d.hora}:00 · ${l} ${(d[l] * 100).toFixed(0)} %</title></rect>`;
    });
    const marca = d.hora === resaltar;
    svg += `<text x="${i * bw + bw / 2}" y="${H + 16}" text-anchor="middle" class="${marca ? "eje marca" : "eje"}">${d.hora}</text>`;
    if (marca) {
      svg += `<rect x="${i * bw + 1}" y="0" width="${bw - 2}" height="${H}" class="resalte"/>`;
    }
  });
  $("grafica-hora").innerHTML = svg + "</svg>";
}

// ---------- Panel del modelo ----------
function pintarModelo() {
  const m = M.meta;
  $("badge-datos").title = `Fuente: ${m.fuente}`;
  $("meta-modelo").textContent =
    `${m.registros.toLocaleString("es-MX")} mediciones (${m.fecha_min} a ${m.fecha_max}). ` +
    `Entrenamiento: ${m.entrenamiento.toLocaleString("es-MX")} filas antes del ${m.inicio_prueba}; prueba: ${m.prueba.toLocaleString("es-MX")} filas de las últimas 2 semanas, que el modelo nunca vio. Objetivo: ${m.objetivo}.`;

  const rf = m.resultados["Random Forest completo"];
  $("kpis").innerHTML = [
    ["t-azul", "target", rf.accuracy, "Exactitud"],
    ["t-morado", "sliders-horizontal", rf.macro_f1, "F1 macro"],
    ["t-ambar", "warning", rf.recall_deficiente, "Detecta deficiente (recall)"],
    ["t-verde", "tree-evergreen", m.parametros.n_estimators, "Árboles en el bosque"],
  ]
    .map(
      ([tono, ico, x, txt]) =>
        `<div class="kpi"><span class="paso-ico ${tono}">${icono(ico)}</span><div><b>${
          Number.isInteger(x) ? x : (x * 100).toFixed(0) + " %"
        }</b><small>${txt}</small></div></div>`
    )
    .join("");

  const filas = Object.entries(m.resultados).map(
    ([k, r]) =>
      `<tr${k === "Random Forest completo" ? ' class="destacado"' : ""}><td>${k}</td>` +
      ["accuracy", "macro_f1", "recall_deficiente"]
        .map((c) => `<td>${r[c].toFixed(2)}</td>`)
        .join("") +
      "</tr>"
  );
  $("tabla-resultados").innerHTML =
    "<tr><th>Modelo</th><th>Exactitud</th><th>F1 macro</th><th>Recall deficiente</th></tr>" +
    filas.join("");

  $("tabla-confusion").innerHTML =
    "<tr><th>Real \\ Predicho</th>" +
    M.labels.map((l) => `<th>${l}</th>`).join("") +
    "</tr>" +
    m.confusion
      .map(
        (f, i) =>
          `<tr><th>${M.labels[i]}</th>${f
            .map((n, j) => `<td class="${i === j ? "diag" : ""}">${n}</td>`)
            .join("")}</tr>`
      )
      .join("");

  const max = m.importancia[0][1];
  $("importancia").innerHTML = m.importancia
    .slice(0, 10)
    .map(
      ([f, x]) =>
        `<div class="barra"><span>${f}</span><div><i style="width:${
          (x / max) * 100
        }%"></i></div><b>${(x * 100).toFixed(1)}%</b></div>`
    )
    .join("");
}

function cambioDeZona() {
  const e = M.edificios.find((x) => x.edificio_id === +$("edificio").value);
  $("uso-edificio").textContent = `Uso: ${e.uso}.`;
  valoresTipicos();
  predecir();
}

// ---------- Tema claro / oscuro ----------
function cambiarTema() {
  const actual =
    document.documentElement.dataset.theme ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const nuevo = actual === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = nuevo;
  try {
    localStorage.setItem("itst-tema", nuevo);
  } catch {
    /* sin almacenamiento */
  }
}

// ---------- Inicio ----------
$("btn-tema").onclick = cambiarTema;
llenarSelects();
ajustarHoraActual();
pintarModelo();
cambioDeZona();
cargarClima();
$("btn-gps").onclick = detectarUbicacion;
$("btn-calibrar").onclick = calibrar;
$("btn-clima").onclick = () => cargarClima();
$("btn-medir").onclick = medirRed;
["edificio", "planta", "dia_semana", "hora"].forEach((id) =>
  $(id).addEventListener("change", cambioDeZona)
);
[...CLIMA, ...RED].forEach((id) =>
  $(id).addEventListener("input", () => {
    if (RED.includes(id)) medidos.add(id);
    predecir();
  })
);