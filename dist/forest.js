// Recorre los árboles exportados por train.py y promedia las probabilidades de sus hojas.
(function (root) {
  function predecirBosque(modelo, entradas) {
    if (entradas.length !== modelo.features.length || entradas.some((v) => !Number.isFinite(v)))
      throw Error('Faltan variables o hay valores no numéricos.');
    const x = entradas.map(Math.fround); // scikit-learn compara en float32
    const prob = modelo.clases.map(() => 0);
    for (const a of modelo.arboles) {
      let n = 0;
      while (a.l[n] !== -1) n = x[a.f[n]] <= a.t[n] ? a.l[n] : a.r[n];
      a.v[n].forEach((p, i) => (prob[i] += p / modelo.arboles.length));
    }
    const mejor = prob.indexOf(Math.max(...prob));
    return { clase: modelo.clases[mejor], probabilidades: prob };
  }
  root.predecirBosque = predecirBosque;
})(typeof module !== 'undefined' ? module.exports : window);
