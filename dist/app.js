(function () {
  "use strict";

  const { predecirAmbos, predecirForest } = window.WiFiModelos;
  const $ = (id) => document.getElementById(id);
  const pct = (v, dec = 0) => `${(v * 100).toFixed(dec)}%`;
  const hh = (h) => `${String(((h % 24) + 24) % 24).padStart(2, "0")}:00`;
  const num = (v) => Number(v).toLocaleString("es-MX");

  const CLASES = MODELO.clases;
  const COLOR = { Buena: "var(--buena)", Regular: "var(--regular)", "Débil": "var(--debil)" };
  const NIVEL = { Buena: 3, Regular: 2, "Débil": 1 };
  const FRASE = {
    Buena: "Ideal para videollamadas, clases en línea y descargas.",
    Regular: "Alcanza para navegar y trabajar; el video puede tener cortes.",
    "Débil": "Espera lentitud y desconexiones. Conviene moverte a otro salón o área.",
  };
  const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const DIAS_LARGO = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
  const NOMBRE_TIPO = { 0: "No laborable", 1: "Baja asistencia", 2: "Laboral (sábado)", 3: "Laboral normal" };

  const NOMBRE_FEATURE = {
    ap_num: "Access point",
    hora: "Hora del día",
    dia_semana: "Día de la semana",
    tipo_dia_cod: "Tipo de día",
    clientes_conectados: "Clientes conectados",
    clientes_2_4ghz: "Clientes en 2.4 GHz",
    clientes_5ghz: "Clientes en 5 GHz",
    velocidad_descarga_mbps: "Velocidad de descarga",
    velocidad_subida_mbps: "Velocidad de subida",
    rssi_dbm: "Señal actual (RSSI)",
    enlace_mbps: "Velocidad del enlace",
    es_malla: "Enlace inalámbrico",
    modelo_ap_cod: "Modelo del AP",
  };

  const INFO_MODELOS = {
    rf: {
      icono: "ph-tree-structure",
      etiqueta: "Modelo principal",
      texto: `${MODELO.rf.n_arboles} árboles de decisión que votan; se promedian sus probabilidades. Corre en tu navegador.`,
    },
    mlp: {
      icono: "ph-brain",
      etiqueta: "En la página",
      texto: `Red neuronal con capas de ${MODELO.mlp.capas.join(" y ")} neuronas y salida softmax. También corre en tu navegador.`,
    },
    hgb: {
      icono: "ph-stack",
      etiqueta: "Referencia",
      texto: "Árboles en serie donde cada uno corrige al anterior. Solo se usa para comparar.",
    },
    base: {
      icono: "ph-equals",
      etiqueta: "Línea base",
      texto: "No aprende: repite la calidad de la hora actual. Sirve para saber si los modelos aportan.",
    },
  };

  // ======================= Tema =======================
  try {
    const guardado = localStorage.getItem("itst-tema");
    if (guardado) document.documentElement.dataset.theme = guardado;
  } catch (e) { /* sin almacenamiento */ }

  $("btn-tema").addEventListener("click", () => {
    const raiz = document.documentElement;
    const oscuro =
      raiz.dataset.theme === "dark" ||
      (!raiz.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
    raiz.dataset.theme = oscuro ? "light" : "dark";
    try { localStorage.setItem("itst-tema", raiz.dataset.theme); } catch (e) { /* nada */ }
  });

  // ======================= Pestañas =======================
  function abrirSeccion(nombre, desplazar) {
    document.querySelectorAll(".pestana").forEach((b) => {
      const activa = b.dataset.seccion === nombre;
      b.classList.toggle("activa", activa);
      b.setAttribute("aria-selected", activa ? "true" : "false");
      $(`sec-${b.dataset.seccion}`).hidden = !activa;
    });
    history.replaceState(null, "", `#${nombre}`);
    if (desplazar) window.scrollTo({ top: 0, behavior: "smooth" });
  }
  document.querySelectorAll(".pestana").forEach((b) =>
    b.addEventListener("click", () => abrirSeccion(b.dataset.seccion, true))
  );
  document.querySelectorAll("[data-ir]").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      abrirSeccion(a.dataset.ir, true);
    })
  );
  const hashInicial = location.hash.slice(1);
  if (document.querySelector(`.pestana[data-seccion="${hashInicial}"]`)) abrirSeccion(hashInicial);

  // ======================= Utilidades =======================
  function pilaHtml(obj) {
    return CLASES.filter((c) => obj[c] > 0)
      .map((c) => `<i style="width:${obj[c] * 100}%;background:${COLOR[c]}" title="${c}: ${pct(obj[c])}"></i>`)
      .join("");
  }
  function leyendaHtml(extra = {}) {
    return CLASES.map(
      (c) => `<span><i class="cuadro" style="background:${COLOR[c]}"></i>${c}${extra[c] !== undefined ? ` <b>${extra[c]}</b>` : ""}</span>`
    ).join("");
  }
  const fmtFecha = (iso) => {
    const [a, m, d] = iso.split("-").map(Number);
    return new Date(a, m - 1, d).toLocaleDateString("es-MX", { day: "numeric", month: "long" });
  };

  // ======================= Datos de los AP =======================
  const D = MODELO.datos;
  function edificioDe(ap) {
    const m = ap.nombre.match(/^E([A-Z])\s*-/);
    return m ? m[1] : "otros";
  }
  function nombreCorto(ap) {
    return ap.nombre.replace(/^E[A-Z]\s*-\s*/, "").replace(/^AP\s*-?\s*/i, "").trim() || ap.nombre;
  }
  const EDIFICIOS = {};
  MODELO.aps.forEach((ap) => (EDIFICIOS[edificioDe(ap)] ||= []).push(ap));
  const ORDEN_EDIF = Object.keys(EDIFICIOS).sort((a, b) =>
    a === "otros" ? 1 : b === "otros" ? -1 : a.localeCompare(b)
  );
  const nombreEdificio = (k) => (k === "otros" ? "Áreas comunes" : `Edificio ${k}`);

  $("kicker-datos").textContent = `${D.aps} salones y áreas · ${fmtFecha(D.fecha_inicio)} al ${fmtFecha(D.fecha_fin)}`;
  $("kicker-fuente").textContent = `${num(D.registros)} registros · ${D.dias} días`;
  $("pie-fuente").textContent = `Datos: ${MODELO.fuente}`;

  // ======================= Hora de Teziutlán =======================
  // Se usa la zona horaria del campus aunque el dispositivo esté en otra.
  const ZONA = "America/Mexico_City";
  function horaTeziutlan() {
    const partes = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: ZONA,
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(new Date())
        .map((p) => [p.type, p.value])
    );
    const dias = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    return { dia: dias[partes.weekday], hora: Number(partes.hour) % 24, minuto: Number(partes.minute) };
  }
  const fechaTeziutlan = () =>
    new Intl.DateTimeFormat("es-MX", { timeZone: ZONA, weekday: "long", day: "numeric", month: "long" }).format(new Date());

  // ======================= Estado =======================
  const ahora = horaTeziutlan();
  // AP inicial: el de historial más variado (mezcla de las tres clases)
  const entropia = (ap) => -CLASES.reduce((s, c) => s + (ap[c] > 0 ? ap[c] * Math.log(ap[c]) : 0), 0);
  const masUsado = [...MODELO.aps].sort((a, b) => entropia(b) - entropia(a))[0];
  const estado = {
    edificio: edificioDe(masUsado),
    ap: masUsado.id,
    modo: "ahora", // "ahora" = hora real de Teziutlán · "otra" = día y hora elegidos
    dia: ahora.dia,
    tipo: null,
    hora: ahora.hora,
    minuto: ahora.minuto,
  };
  estado.tipo = tipoPorDia(estado.dia);

  function tipoPorDia(dia) {
    if (dia === 6) return 0;
    if (dia === 5) return 2;
    return 3;
  }

  const entradas = {
    clientes_conectados: $("in-clientes"),
    clientes_2_4ghz: $("in-c24"),
    clientes_5ghz: $("in-c5"),
    velocidad_descarga_mbps: $("in-desc"),
    velocidad_subida_mbps: $("in-sub"),
    rssi_dbm: $("in-rssi"),
  };

  const apPorId = (id) => MODELO.aps.find((a) => a.id === id);

  function tipicos(apId, tipo, hora) {
    const porTipo = (MODELO.perfil[apId] || {})[String(tipo)] || [];
    for (let d = 0; d < 24; d++) {
      const v = porTipo[(hora + d) % 24] || porTipo[(hora - d + 24) % 24];
      if (v) return Object.fromEntries(MODELO.perfil_cols.map((c, i) => [c, v[i]]));
    }
    return {};
  }

  function vector(ap, hora, mediciones) {
    const ctx = {
      ap_num: ap.num,
      hora: ((hora % 24) + 24) % 24,
      dia_semana: estado.dia,
      tipo_dia_cod: estado.tipo,
      enlace_mbps: ap.enlace_mbps,
      es_malla: ap.es_malla,
      modelo_ap_cod: ap.modelo_ap_cod,
      ...mediciones,
    };
    return MODELO.features.map((f) => (f in ctx && ctx[f] !== "" ? Number(ctx[f]) : NaN));
  }

  // Pronóstico con valores típicos (para el mapa y la tira del día)
  const pronosticoTipico = (ap, hora) =>
    predecirForest(vector(ap, hora, tipicos(ap.id, estado.tipo, ((hora % 24) + 24) % 24)), MODELO);

  const puntaje = (r) => r.mapa.Buena * 2 + r.mapa.Regular;

  // ======================= Controles =======================
  function dibujarEdificios() {
    $("chips-edificio").innerHTML = ORDEN_EDIF.map(
      (k) => `
      <button type="button" class="opcion ${k === estado.edificio ? "activo" : ""}" role="radio"
        aria-checked="${k === estado.edificio}" data-edificio="${k}" title="${nombreEdificio(k)}">
        ${k === "otros" ? "Áreas comunes" : `Edificio ${k}`}
      </button>`
    ).join("");
  }

  function dibujarAps() {
    $("chips-ap").innerHTML = EDIFICIOS[estado.edificio]
      .map(
        (ap) => `
        <button type="button" class="opcion ${ap.id === estado.ap ? "activo" : ""}" role="radio"
          aria-checked="${ap.id === estado.ap}" data-ap="${ap.id}" title="${ap.nombre} · ${ap.id}">
          ${nombreCorto(ap)}
        </button>`
      )
      .join("");
  }

  function dibujarDias() {
    $("chips-dia").innerHTML = DIAS.map(
      (d, i) => `<button type="button" class="dia ${i === estado.dia ? "activo" : ""}" role="radio"
        aria-checked="${i === estado.dia}" data-dia="${i}">${d}</button>`
    ).join("");
  }

  function seleccionarAp(id, desplazar) {
    const ap = apPorId(id);
    estado.ap = id;
    estado.edificio = edificioDe(ap);
    dibujarEdificios();
    dibujarAps();
    rellenarTipicos();
    actualizar();
    if (desplazar) $("resultado").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  $("chips-edificio").addEventListener("click", (e) => {
    const b = e.target.closest("[data-edificio]");
    if (!b) return;
    const k = b.dataset.edificio;
    const mejor = [...EDIFICIOS[k]].sort((a, z) => z.clientes_prom - a.clientes_prom)[0];
    seleccionarAp(mejor.id);
  });
  $("chips-ap").addEventListener("click", (e) => {
    const b = e.target.closest("[data-ap]");
    if (b) seleccionarAp(b.dataset.ap);
  });
  $("chips-dia").addEventListener("click", (e) => {
    const b = e.target.closest("[data-dia]");
    if (!b) return;
    ponerMomento(Number(b.dataset.dia), estado.hora, estado.minuto);
  });

  // ---------- Modo "Ahora mismo" / "Predicción Wi-Fi" ----------
  const inputHora = $("input-hora");
  const dosDig = (n) => String(n).padStart(2, "0");

  function ponerMomento(dia, hora, minuto) {
    const cambioHora = dia !== estado.dia || hora !== estado.hora;
    if (dia !== estado.dia) {
      estado.tipo = tipoPorDia(dia);
      $("sel-tipo").value = String(estado.tipo);
    }
    estado.dia = dia;
    estado.hora = hora;
    estado.minuto = minuto;
    inputHora.value = `${dosDig(hora)}:${dosDig(minuto)}`;
    dibujarDias();
    if (cambioHora) rellenarTipicos();
    actualizar();
  }

  function cambiarModo(modo) {
    estado.modo = modo;
    document.querySelectorAll(".modo").forEach((b) => {
      const act = b.dataset.modo === modo;
      b.classList.toggle("activo", act);
      b.setAttribute("aria-checked", act ? "true" : "false");
    });
    $("panel-ahora").hidden = modo !== "ahora";
    $("panel-otra").hidden = modo !== "otra";
    if (modo === "ahora") {
      const t = horaTeziutlan();
      ponerMomento(t.dia, t.hora, t.minuto);
    } else {
      actualizar();
    }
  }
  document.querySelectorAll(".modo").forEach((b) =>
    b.addEventListener("click", () => cambiarModo(b.dataset.modo))
  );

  inputHora.addEventListener("change", () => {
    if (!inputHora.value) return;
    const [h, m] = inputHora.value.split(":").map(Number);
    ponerMomento(estado.dia, h, m);
  });
  $("atajos-hora").addEventListener("click", (e) => {
    const b = e.target.closest("[data-hora]");
    if (!b) return;
    const [h, m] = b.dataset.hora.split(":").map(Number);
    ponerMomento(estado.dia, h, m);
  });

  // Reloj en vivo: en modo "Ahora mismo" se actualiza solo
  function tic() {
    const t = horaTeziutlan();
    $("reloj-ahora").textContent = `${dosDig(t.hora)}:${dosDig(t.minuto)}`;
    $("fecha-ahora").textContent = `${fechaTeziutlan()} · hora de Teziutlán`;
    if (estado.modo === "ahora" && (t.hora !== estado.hora || t.dia !== estado.dia || t.minuto !== estado.minuto)) {
      ponerMomento(t.dia, t.hora, t.minuto);
    }
  }
  setInterval(tic, 15000);

  $("sel-tipo").value = String(estado.tipo);
  $("sel-tipo").addEventListener("change", (e) => {
    estado.tipo = Number(e.target.value);
    rellenarTipicos();
    actualizar();
  });

  function rellenarTipicos() {
    const t = tipicos(estado.ap, estado.tipo, estado.hora);
    Object.entries(entradas).forEach(([col, el]) => {
      if (t[col] === undefined) return;
      const dec = col.startsWith("clientes") ? 0 : col === "rssi_dbm" ? 1 : 4;
      el.value = Number(t[col]).toFixed(dec);
    });
  }
  Object.values(entradas).forEach((el) => el.addEventListener("input", actualizar));
  $("btn-restablecer").addEventListener("click", () => {
    rellenarTipicos();
    actualizar();
  });

  // ======================= Render del pronóstico =======================
  function actualizar() {
    const ap = apPorId(estado.ap);
    const horaSig = (estado.hora + 1) % 24;
    const momento = `${dosDig(estado.hora)}:${dosDig(estado.minuto)}`;
    $("txt-destino").innerHTML =
      `<span>` +
      (estado.modo === "ahora"
        ? `Son las <b>${momento}</b>; te decimos cómo estará la señal a las <b>${hh(horaSig)}</b>.`
        : `Simulando el <b>${DIAS_LARGO[estado.dia]}</b> a las <b>${momento}</b>; predicción para las <b>${hh(horaSig)}</b>.`) +
      `</span>`;

    const mediciones = Object.fromEntries(Object.entries(entradas).map(([c, el]) => [c, el.value]));
    const res = predecirAmbos(vector(ap, estado.hora, mediciones), MODELO);
    const clase = res.rf.clase;

    // Cabecera del resultado
    const r = $("resultado");
    r.style.setProperty("--c", COLOR[clase]);
    r.dataset.nivel = NIVEL[clase];
    $("res-lugar").innerHTML = `${ap.nombre} <small>${ap.id} · ${nombreEdificio(edificioDe(ap))}</small>`;
    $("res-hora").textContent = `${DIAS_LARGO[estado.dia]} · ${hh(horaSig)}`;
    $("res-clase").textContent = clase;
    $("res-frase").textContent = FRASE[clase];

    [["rf", res.rf], ["mlp", res.mlp]].forEach(([k, m]) => {
      $(`voto-${k}`).style.setProperty("--c", COLOR[m.clase]);
      $(`voto-${k}-clase`).textContent = m.clase;
      $(`voto-${k}-pct`).textContent = pct(m.confianza);
    });

    $("consenso").innerHTML = res.consenso
      ? `<span class="punto-estado"></span><span>Los dos modelos coinciden.</span>`
      : `<span class="punto-estado"></span><span>Los modelos no coinciden; se muestra el Random Forest, el modelo principal.</span>`;
    $("consenso").classList.toggle("desacuerdo", !res.consenso);

    $("probs").innerHTML = CLASES.map(
      (c) => `
      <div class="prob">
        <span class="prob-clase"><i class="cuadro" style="background:${COLOR[c]}"></i>${c}</span>
        <div class="pista"><i style="width:${res.rf.mapa[c] * 100}%;background:${COLOR[c]}"></i></div>
        <b>${pct(res.rf.mapa[c])}</b>
      </div>`
    ).join("");

    dibujarTira(ap, horaSig);
    const mapa = dibujarMapa(horaSig);
    dibujarSugerencia(ap, clase, mapa);
  }

  // Tira de 24 horas: pronóstico de cada hora con valores típicos
  function dibujarTira(ap, horaSig) {
    const horas = Array.from({ length: 24 }, (_, h) => ({ h, r: pronosticoTipico(ap, h - 1) }));
    const ordenadas = [...horas].sort((a, b) => puntaje(b.r) - puntaje(a.r));
    const mejor = ordenadas[0];
    const peor = ordenadas[ordenadas.length - 1];

    $("tira-dia").innerHTML = horas
      .map(
        ({ h, r }) => `
        <button type="button" class="celda ${h === horaSig ? "actual" : ""}" data-h="${h}"
          style="--c:${COLOR[r.clase]};--alto:${30 + r.confianza * 70}%"
          title="${hh(h)} · ${r.clase} (${pct(r.confianza)})" aria-label="${hh(h)}: ${r.clase}">
          <span class="barra-celda"></span>
          <small>${h}</small>
        </button>`
      )
      .join("");
    $("nota-dia").innerHTML =
      `Mejor hora <b>${hh(mejor.h)}</b> <span class="sep">·</span> Peor hora <b>${hh(peor.h)}</b>`;
    $("leyenda-dia").innerHTML = leyendaHtml() + `<span class="nota-chica">La altura indica la seguridad del modelo. Toca una hora para verla arriba.</span>`;
  }

  $("tira-dia").addEventListener("click", (e) => {
    const b = e.target.closest("[data-h]");
    if (!b) return;
    // Ver otra hora es una simulación: se pasa al modo "Predicción Wi-Fi"
    if (estado.modo !== "otra") cambiarModo("otra");
    ponerMomento(estado.dia, (Number(b.dataset.h) + 23) % 24, 0);
  });

  // Mapa: todos los AP agrupados por edificio
  function dibujarMapa(horaSig) {
    $("mapa-hora").textContent = hh(horaSig);
    const resultados = {};
    const conteo = { Buena: 0, Regular: 0, "Débil": 0 };
    MODELO.aps.forEach((ap) => {
      const r = pronosticoTipico(ap, estado.hora);
      resultados[ap.id] = r;
      conteo[r.clase]++;
    });

    $("resumen-mapa").innerHTML = CLASES.map(
      (c) => `<span class="resumen-item" style="--c:${COLOR[c]}"><i class="dot"></i><b>${conteo[c]}</b> ${c}</span>`
    ).join("");

    $("mapa-red").innerHTML = ORDEN_EDIF.map(
      (k) => `
      <div class="edif">
        <p class="edif-nombre">${nombreEdificio(k)}</p>
        <div class="edif-aps">
          ${EDIFICIOS[k]
            .map((ap) => {
              const r = resultados[ap.id];
              return `<button type="button" class="ap-celda ${ap.id === estado.ap ? "sel" : ""}" data-ap="${ap.id}"
                style="--c:${COLOR[r.clase]}" title="${ap.nombre} · ${r.clase} (${pct(r.confianza)})">
                <i class="dot"></i><span>${nombreCorto(ap)}</span>
              </button>`;
            })
            .join("")}
        </div>
      </div>`
    ).join("");
    return resultados;
  }

  $("mapa-red").addEventListener("click", (e) => {
    const b = e.target.closest("[data-ap]");
    if (b) seleccionarAp(b.dataset.ap, true);
  });

  // Recomendación: el mejor AP cercano si el actual no es "Buena"
  function dibujarSugerencia(ap, clase, mapa) {
    const btn = $("sugerencia");
    if (clase === "Buena") {
      btn.hidden = true;
      return;
    }
    const buscar = (lista) =>
      lista
        .filter((a) => a.id !== ap.id && NIVEL[mapa[a.id].clase] > NIVEL[clase])
        .sort((a, b) => puntaje(mapa[b.id]) - puntaje(mapa[a.id]))[0];
    const vecino = buscar(EDIFICIOS[edificioDe(ap)]);
    const alt = vecino || buscar(MODELO.aps);
    if (!alt) {
      btn.hidden = true;
      return;
    }
    const r = mapa[alt.id];
    btn.hidden = false;
    btn.dataset.ap = alt.id;
    btn.style.setProperty("--c", COLOR[r.clase]);
    btn.innerHTML = `
      <span><small>${vecino ? "Mejor opción en este edificio" : "Mejor opción en el campus"}</small>
      <em><b>${alt.nombre}</b> · señal ${r.clase.toLowerCase()} (${pct(r.confianza)})</em></span>
      <i class="ph ph-arrow-right"></i>`;
  }
  $("sugerencia").addEventListener("click", (e) => seleccionarAp(e.currentTarget.dataset.ap, true));

  // ======================= MODELOS =======================
  $("sub-modelos").textContent =
    `Se entrenaron con ${num(MODELO.n_train)} registros hasta el ${fmtFecha(MODELO.fecha_corte_test)} ` +
    `y se pusieron a prueba con ${num(MODELO.n_test)} registros de los días siguientes.`;

  const mejorF1 = Math.max(...MODELO.comparativa.map((m) => m.macro_f1));
  let modeloSel = "rf";

  function dibujarModelos() {
    $("modelos-grid").innerHTML = MODELO.comparativa
      .map((m) => {
        const info = INFO_MODELOS[m.clave];
        const esMejor = m.macro_f1 === mejorF1;
        return `
        <button type="button" class="modelo-card ${m.clave === modeloSel ? "activo" : ""}" data-clave="${m.clave}">
          <div class="mc-cabeza">
            <i class="ph ${info.icono} mc-icono"></i>
            <span class="mc-tag">${esMejor ? "Mejor F1 · " : ""}${info.etiqueta}</span>
          </div>
          <p class="mc-nombre">${m.modelo}</p>
          <p class="mc-num">${pct(m.accuracy, 1)}<small>accuracy</small></p>
          <dl class="mc-datos">
            <div><dt>Detecta "Débil"</dt><dd>${pct(m.recall_debil)}</dd></div>
            <div><dt>F1 macro</dt><dd>${m.macro_f1.toFixed(3)}</dd></div>
            <div><dt>Balanceada</dt><dd>${pct(m.balanced_accuracy, 1)}</dd></div>
          </dl>
        </button>`;
      })
      .join("");
  }

  function metricasPorClase(cm) {
    return CLASES.map((clase, i) => {
      const tp = cm[i][i];
      const real = cm[i].reduce((a, b) => a + b, 0);
      const pred = cm.reduce((a, f) => a + f[i], 0);
      return { clase, precision: pred ? tp / pred : 0, recall: real ? tp / real : 0, casos: real };
    });
  }

  function dibujarDetalle() {
    const m = MODELO.comparativa.find((x) => x.clave === modeloSel);
    const info = INFO_MODELOS[m.clave];
    $("detalle-titulo").textContent = m.modelo;
    $("detalle-desc").textContent = info.texto;

    const cm = m.matriz_confusion;
    $("matriz").innerHTML = `
      <div class="matriz" style="--n:${CLASES.length}">
        <span></span>${CLASES.map((c) => `<span class="m-cab">dijo ${c}</span>`).join("")}
        ${cm
          .map((fila, i) => {
            const total = fila.reduce((a, b) => a + b, 0) || 1;
            return `<span class="m-fila">era ${CLASES[i]}</span>${fila
              .map(
                (v, j) => `<span class="m-celda ${i === j ? "diag" : ""}" style="--a:${(v / total).toFixed(3)}">
                  <b>${num(v)}</b><small>${pct(v / total)}</small></span>`
              )
              .join("")}`;
          })
          .join("")}
      </div>`;

    $("por-clase").innerHTML = metricasPorClase(cm)
      .map(
        (r) => `
        <div class="clase-met">
          <p><i class="cuadro" style="background:${COLOR[r.clase]}"></i><b>${r.clase}</b><small>${num(r.casos)} horas reales</small></p>
          <div class="met"><span>Recall</span><div class="pista"><i style="width:${r.recall * 100}%;background:${COLOR[r.clase]}"></i></div><b>${pct(r.recall)}</b></div>
          <div class="met"><span>Precisión</span><div class="pista"><i style="width:${r.precision * 100}%;background:${COLOR[r.clase]};opacity:.6"></i></div><b>${pct(r.precision)}</b></div>
        </div>`
      )
      .join("");
  }

  $("modelos-grid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-clave]");
    if (!b) return;
    modeloSel = b.dataset.clave;
    dibujarModelos();
    dibujarDetalle();
  });
  dibujarModelos();
  dibujarDetalle();


  // ======================= DATOS =======================
  $("kpis-datos").innerHTML = [
    [num(D.registros), "registros", "una fila por salón y por hora"],
    [D.aps, "salones y áreas", `${ORDEN_EDIF.length - 1} edificios y áreas comunes`],
    [D.clientes_prom, "clientes en promedio", `máximo ${D.clientes_max} en un salón`],
    [`${D.rssi_prom}`, "dBm de señal promedio", "RSSI de los clientes"],
  ]
    .map(
      ([v, t, s]) => `
      <div class="kpi">
        <b>${v}</b><span>${t}</span><small>${s}</small>
      </div>`
    )
    .join("");

  // Dona de la distribución general
  (function dona() {
    const total = CLASES.reduce((a, c) => a + D.conteo_clases[c], 0);
    const R = 60;
    const C = 2 * Math.PI * R;
    let acum = 0;
    const arcos = CLASES.map((c) => {
      const frac = D.conteo_clases[c] / total;
      const a = `<circle cx="80" cy="80" r="${R}" fill="none" stroke="${COLOR[c]}" stroke-width="10"
        stroke-dasharray="${C * frac} ${C}" stroke-dashoffset="${-C * acum}" transform="rotate(-90 80 80)"><title>${c}: ${pct(frac, 1)}</title></circle>`;
      acum += frac;
      return a;
    }).join("");
    $("dona").innerHTML = `
      <svg viewBox="0 0 160 160" class="dona" role="img" aria-label="Distribución de calidad">
        ${arcos}
        <text x="80" y="78" text-anchor="middle" class="dona-num">${pct(D.conteo_clases.Regular / total)}</text>
        <text x="80" y="96" text-anchor="middle" class="dona-txt">es Regular</text>
      </svg>
      <div class="dona-leyenda">${CLASES.map(
        (c) => `<div><i class="cuadro" style="background:${COLOR[c]}"></i><span>${c}</span><b>${pct(D.conteo_clases[c] / total, 1)}</b><small>${num(D.conteo_clases[c])} horas</small></div>`
      ).join("")}</div>`;
  })();

  // Barras apiladas por hora
  // Se dibuja con el ancho real del contenedor para que ocupe todo el espacio
  // sin agrandar las letras; se vuelve a dibujar al abrir la pestaña o cambiar el tamaño.
  function graficaHoras() {
    const cont = $("grafica-hora");
    if (!cont.clientWidth) return;
    const serie = D.por_hora;
    const W = cont.clientWidth, H = 240, abajo = 22, arriba = 6;
    const util = H - abajo - arriba;
    const paso = W / serie.length;
    const barras = serie
      .map((it, i) => {
        let y = arriba;
        const x = i * paso + 2.5;
        const w = paso - 5;
        const rects = [...CLASES].reverse().map((c) => {
          const h = it[c] * util;
          const rr = `<rect x="${x}" y="${y}" width="${w}" height="${Math.max(0, h - 1)}" rx="2" fill="${COLOR[c]}"></rect>`;
          y += h;
          return rr;
        }).join("");
        const lbl = i % 3 === 0 ? `<text x="${x + w / 2}" y="${H - 6}" text-anchor="middle">${it.hora}h</text>` : "";
        return `<g><title>${hh(it.hora)} · ${CLASES.map((c) => `${c} ${pct(it[c])}`).join(" · ")}</title>${rects}${lbl}</g>`;
      })
      .join("");
    cont.innerHTML = `<svg class="grafica" viewBox="0 0 ${W} ${H}" role="img" aria-label="Calidad por hora">${barras}</svg>`;
  }
  $("leyenda-hora").innerHTML = leyendaHtml();
  graficaHoras();
  let esperaResize;
  window.addEventListener("resize", () => {
    clearTimeout(esperaResize);
    esperaResize = setTimeout(graficaHoras, 150);
  });
  document.querySelector('.pestana[data-seccion="datos"]').addEventListener("click", () => requestAnimationFrame(graficaHoras));

  $("tipos-dia").innerHTML = D.por_tipo_dia
    .map(
      (t) => `
      <div class="tipo">
        <p class="tipo-nombre">${t.tipo === "Laboral (sabado)" ? "Laboral (sábado)" : t.tipo}</p>
        <p class="tipo-meta">${t.dias} ${t.dias === 1 ? "día" : "días"} · ${t.clientes_prom} clientes prom.</p>
        <div class="pila">${pilaHtml(t)}</div>
        <p class="tipo-debil"><b>${pct(t["Débil"])}</b> de horas con señal débil</p>
      </div>`
    )
    .join("");

  let orden = "peor";
  let verTodos = false;
  function dibujarRanking() {
    const lista = [...MODELO.aps].sort((a, b) =>
      orden === "peor" ? b["Débil"] - a["Débil"] || a.rssi_prom - b.rssi_prom : a["Débil"] - b["Débil"] || b.rssi_prom - a.rssi_prom
    );
    const visibles = verTodos ? lista : lista.slice(0, 8);
    $("ranking").innerHTML = visibles
      .map(
        (a, i) => `
        <button type="button" class="rank" data-ap="${a.id}" title="Ver pronóstico de ${a.nombre}">
          <span class="rank-pos">${i + 1}</span>
          <span class="rank-nombre"><b>${a.nombre}</b><small>${a.id} · ${a.modelo.replace(/\s*\(.*\)/, "")} · ${a.clientes_prom} clientes · ${a.rssi_prom} dBm</small></span>
          <span class="pila">${pilaHtml(a)}</span>
          <span class="rank-pct" style="color:var(--debil)">${pct(a["Débil"])}</span>
        </button>`
      )
      .join("");
    $("btn-ver-todos").innerHTML = verTodos
      ? "Ver menos"
      : `Ver los ${lista.length}`;
  }
  document.querySelectorAll(".seg").forEach((b) =>
    b.addEventListener("click", () => {
      orden = b.dataset.orden;
      document.querySelectorAll(".seg").forEach((x) => x.classList.toggle("activo", x === b));
      dibujarRanking();
    })
  );
  $("btn-ver-todos").addEventListener("click", () => {
    verTodos = !verTodos;
    dibujarRanking();
  });
  $("ranking").addEventListener("click", (e) => {
    const b = e.target.closest("[data-ap]");
    if (!b) return;
    abrirSeccion("pronostico");
    seleccionarAp(b.dataset.ap, true);
  });
  dibujarRanking();

  // ======================= Arranque =======================
  dibujarEdificios();
  dibujarAps();
  dibujarDias();
  inputHora.value = `${dosDig(estado.hora)}:${dosDig(estado.minuto)}`;
  rellenarTipicos();
  tic();
  actualizar();
})();
