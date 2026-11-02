// Comprueba que la predicción en JavaScript coincide con scikit-learn.
// Ejecutar: node verificar.cjs
const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const { predecirBosque } = require("./dist/forest.js");

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync("dist/modelo.js", "utf8"), ctx);
const m = ctx.window.MODELO_WIFI;

let maxErr = 0;
let iguales = 0;

m.verificacion.entradas.forEach((x, i) => {
  const r = predecirBosque(m, x);
  const esperado = m.verificacion.probabilidades[i];

  r.probabilidades.forEach((p, j) => {
    maxErr = Math.max(maxErr, Math.abs(p - esperado[j]));
  });

  if (r.clase === m.clases[esperado.indexOf(Math.max(...esperado))]) {
    iguales++;
  }
});

assert(maxErr < 1e-4, "Diferencia con sklearn: " + maxErr);

console.log(
  JSON.stringify({
    casos: m.verificacion.entradas.length,
    clases_iguales: iguales,
    error_max: maxErr,
  })
);