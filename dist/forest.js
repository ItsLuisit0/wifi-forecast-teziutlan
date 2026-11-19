(function (root) {
  "use strict";

  function recorrerArbol(arbol, xF32) {
    let nodo = 0;
    let profundidad = 0;
    while (arbol.izq[nodo] !== -1) {
      const feat = arbol.feat[nodo];
      nodo = xF32[feat] <= arbol.umbral[nodo] ? arbol.izq[nodo] : arbol.der[nodo];
      profundidad++;
    }
    return { probs: arbol.val[nodo], profundidad };
  }

  function predecirForest(xRaw, modelo) {
    const { medianas, arboles } = modelo.rf;
    const nClases = modelo.clases.length;

    const xF32 = xRaw.map((val, j) => {
      const limpio = Number.isFinite(val) ? val : medianas[j];
      return Math.fround(limpio);
    });

    const sumaProbs = new Array(nClases).fill(0);
    const votos = new Array(nClases).fill(0);
    let sumaProfundidad = 0;

    for (let i = 0; i < arboles.length; i++) {
      const { probs: hoja, profundidad } = recorrerArbol(arboles[i], xF32);
      sumaProfundidad += profundidad;

      let mejorClaseArbol = 0;
      for (let c = 0; c < nClases; c++) {
        sumaProbs[c] += hoja[c];
        if (hoja[c] > hoja[mejorClaseArbol]) {
          mejorClaseArbol = c;
        }
      }
      votos[mejorClaseArbol]++;
    }

    const totalArboles = arboles.length || 1;
    const probs = sumaProbs.map((s) => s / totalArboles);
    const idxMax = probs.indexOf(Math.max(...probs));

    const orden = [...probs].sort((a, b) => b - a);
    const margen = orden.length > 1 ? orden[0] - orden[1] : orden[0];

    return {
      clase: modelo.clases[idxMax],
      confianza: probs[idxMax],
      margen,
      probs,
      votos,
      totalArboles,
      profundidadMedia: sumaProfundidad / totalArboles,
      mapa: Object.fromEntries(modelo.clases.map((c, i) => [c, probs[i]])),
      mapaVotos: Object.fromEntries(modelo.clases.map((c, i) => [c, votos[i]])),
    };
  }

  function predecirMLP(xRaw, modelo) {
    const { medianas, medias, escalas, pesos, sesgos } = modelo.mlp;

    // 1. Imputación por mediana + estandarización Z-score
    const zScores = xRaw.map((val, j) => {
      const limpio = Number.isFinite(val) ? val : medianas[j];
      const escala = escalas[j] || 1;
      return (limpio - medias[j]) / escala;
    });

    let activacion = [...zScores];
    const resumenCapas = [];

    // 2. Propagación por capas ocultas (ReLU) y capa de salida
    for (let capa = 0; capa < pesos.length; capa++) {
      const W = pesos[capa];
      const b = sesgos[capa];
      const esSalida = capa === pesos.length - 1;
      const siguiente = new Array(b.length);
      let activas = 0;

      for (let neurona = 0; neurona < b.length; neurona++) {
        let suma = b[neurona];
        for (let entrada = 0; entrada < activacion.length; entrada++) {
          suma += activacion[entrada] * W[entrada][neurona];
        }
        const val = esSalida ? suma : Math.max(0, suma);
        siguiente[neurona] = val;
        if (!esSalida && val > 0) activas++;
      }

      if (!esSalida) {
        resumenCapas.push({
          capa: capa + 1,
          total: b.length,
          activas,
          pctActivas: (activas / b.length) * 100,
        });
      }
      activacion = siguiente;
    }

    // 3. Softmax numéricamente estable
    const maxLogit = Math.max(...activacion);
    const exps = activacion.map((z) => Math.exp(z - maxLogit));
    const sumaExp = exps.reduce((a, b) => a + b, 0) || 1;
    const probs = exps.map((e) => e / sumaExp);
    const idxMax = probs.indexOf(Math.max(...probs));

    const orden = [...probs].sort((a, b) => b - a);
    const margen = orden.length > 1 ? orden[0] - orden[1] : orden[0];

    return {
      clase: modelo.clases[idxMax],
      confianza: probs[idxMax],
      margen,
      probs,
      logits: activacion,
      zScores,
      resumenCapas,
      mapa: Object.fromEntries(modelo.clases.map((c, i) => [c, probs[i]])),
    };
  }

  function predecirAmbos(xRaw, modelo) {
    const rf = predecirForest(xRaw, modelo);
    const mlp = predecirMLP(xRaw, modelo);
    return {
      rf,
      mlp,
      consenso: rf.clase === mlp.clase,
    };
  }

  const api = { predecirForest, predecirMLP, predecirAmbos };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.WiFiModelos = api;
  }
})(typeof window !== "undefined" ? window : globalThis);