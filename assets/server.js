const express = require('express');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

// Leer las rutas desde el archivo JSON
const routes = JSON.parse(fs.readFileSync('./assets/routes.json', 'utf8')).routes;

// Endpoint para obtener todas las rutas
app.get('/routes', (req, res) => {
  res.json(routes);
});

// Endpoint para buscar rutas por origen y destino
app.get('/routes/search', (req, res) => {
  const { origin, destination } = req.query;
  const results = routes.filter(route =>
    (!origin || route.origin.toLowerCase() === origin.toLowerCase()) &&
    (!destination || route.destination.toLowerCase() === destination.toLowerCase())
  );
  res.json(results);
});

app.listen(PORT, () => {
  console.log(`API de buses corriendo en el puerto ${PORT}`);
});