const MODELO = require("./dist/modelo.js");
const { predecirForest, predecirMLP } = require("./dist/forest.js");

const TOLERANCIA = 1e-4;
let maxErrRF = 0;
let maxErrMLP = 0;

for (const muestra of MODELO.verificacion) {
  const resRF = predecirForest(muestra.x, MODELO);
  const resMLP = predecirMLP(muestra.x, MODELO);

  muestra.probs_rf.forEach((pPy, i) => {
    const err = Math.abs(pPy - resRF.probs[i]);
    if (err > maxErrRF) maxErrRF = err;
  });

  muestra.probs_mlp.forEach((pPy, i) => {
    const err = Math.abs(pPy - resMLP.probs[i]);
    if (err > maxErrMLP) maxErrMLP = err;
  });
}

console.log(`Muestras verificadas: ${MODELO.verificacion.length}`);
console.log(`Error máximo Random Forest:     ${maxErrRF.toExponential(3)}`);
console.log(`Error máximo Red Neuronal MLP:  ${maxErrMLP.toExponential(3)}`);

if (maxErrRF > TOLERANCIA || maxErrMLP > TOLERANCIA) {
  console.error(`FALLO: Se superó la tolerancia permitida (${TOLERANCIA}).`);
  process.exit(1);
}

console.log("OK: Ambos modelos cumplen paridad numérica con scikit-learn.");