const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Ruta del archivo JSON (en carpeta assets)
const routesFile = path.join(__dirname, "assets", "routes.json");

// Endpoint de prueba
app.get("/", (req, res) => {
  res.send("🚍 API de Rutas de Buses funcionando");
});

// Endpoint que devuelve el JSON de rutas
app.get("/routes", (req, res) => {
  fs.readFile(routesFile, "utf8", (err, data) => {
    if (err) {
      return res.status(500).json({ error: "No se pudo leer el archivo" });
    }
    res.json(JSON.parse(data));
  });
});

// Puerto y host según Render
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor corriendo en http://0.0.0.0:${PORT}`);
});
