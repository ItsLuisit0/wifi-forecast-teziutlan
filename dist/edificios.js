// Coordenadas de cada edificio para detectar la zona con el GPS del navegador.
// SON APROXIMADAS: recorre el campus y usa el botón "Guardar mi posición como
// coordenadas de este edificio" en la app, o edita aquí los valores.
window.CAMPUS = {
  nombre: 'Instituto Tecnológico Superior de Teziutlán',
  radioMaximoM: 400, // a más distancia se considera que estás fuera del campus
  edificios: {
    1: { lat: 19.84020, lon: -97.36120 },
    2: { lat: 19.84020, lon: -97.36060 },
    3: { lat: 19.84020, lon: -97.36000 },
    4: { lat: 19.83975, lon: -97.36120 },
    5: { lat: 19.83975, lon: -97.36060 },
    6: { lat: 19.83975, lon: -97.36000 },
    7: { lat: 19.83930, lon: -97.36120 },
    8: { lat: 19.83930, lon: -97.36060 },
    9: { lat: 19.83930, lon: -97.36000 },
    10: { lat: 19.83885, lon: -97.36060 },
  },
};
