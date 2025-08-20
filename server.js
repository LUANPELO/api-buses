const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Rutas de archivos
const routesFile = path.join(__dirname, "assets", "routes.json");
const ticketsFile = path.join(__dirname, "assets", "tickets.json");

// Crear archivo de tickets si no existe
if (!fs.existsSync(ticketsFile)) {
  fs.writeFileSync(ticketsFile, JSON.stringify([], null, 2));
}

// Función helper para generar ID único
const generateTicketId = () => {
  return 'TICKET_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
};

// Endpoint de prueba
app.get("/", (req, res) => {
  res.json({
    message: "🚍 API de Rutas de Buses funcionando",
    endpoints: {
      "GET /": "Esta página",
      "GET /routes": "Obtener todas las rutas",
      "POST /tickets": "Crear nuevo ticket",
      "GET /tickets": "Obtener todos los tickets"
    },
    status: "✅ Servidor funcionando correctamente",
    timestamp: new Date().toISOString()
  });
});

// Endpoint que devuelve el JSON de rutas
app.get("/routes", (req, res) => {
  fs.readFile(routesFile, "utf8", (err, data) => {
    if (err) {
      console.error("Error leyendo routes.json:", err);
      return res.status(500).json({ 
        error: "No se pudo leer el archivo de rutas",
        details: err.message 
      });
    }
    
    try {
      const routes = JSON.parse(data);
      res.json({
        success: true,
        data: routes,
        count: routes.length
      });
    } catch (parseErr) {
      console.error("Error parsing routes.json:", parseErr);
      res.status(500).json({
        error: "Error al procesar el archivo de rutas",
        details: parseErr.message
      });
    }
  });
});

// ⭐ Endpoint para crear tickets (lo que necesita tu Flutter app)
app.post("/tickets", (req, res) => {
  try {
    console.log("📝 Nueva reserva recibida:", JSON.stringify(req.body, null, 2));
    
    // Validar datos requeridos
    const { passenger, trip, seats, acceptedTerms } = req.body;
    
    if (!passenger || !trip || !seats || !acceptedTerms) {
      return res.status(400).json({
        success: false,
        error: "Datos incompletos",
        missing: {
          passenger: !passenger,
          trip: !trip,
          seats: !seats,
          acceptedTerms: !acceptedTerms
        }
      });
    }

    // Validar datos del pasajero
    const requiredPassengerFields = ['name', 'lastName', 'documentType', 'documentNumber'];
    const missingFields = requiredPassengerFields.filter(field => !passenger[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Datos del pasajero incompletos",
        missing_fields: missingFields
      });
    }

    // Crear el ticket
    const newTicket = {
      id: generateTicketId(),
      status: "CONFIRMED",
      createdAt: new Date().toISOString(),
      passenger: {
        ...passenger,
        fullPhone: `${passenger.countryCode || ''}${passenger.phone || ''}`.replace(/\+/g, '+')
      },
      trip,
      seats: Array.isArray(seats) ? seats : [seats],
      acceptedTerms,
      paymentStatus: "PENDING"
    };

    // Leer tickets existentes
    fs.readFile(ticketsFile, "utf8", (err, data) => {
      let tickets = [];
      
      if (!err && data.trim()) {
        try {
          tickets = JSON.parse(data);
        } catch (parseErr) {
          console.error("Error parsing tickets.json:", parseErr);
          tickets = [];
        }
      }

      // Agregar nuevo ticket
      tickets.push(newTicket);

      // Guardar en archivo
      fs.writeFile(ticketsFile, JSON.stringify(tickets, null, 2), (writeErr) => {
        if (writeErr) {
          console.error("Error guardando ticket:", writeErr);
          return res.status(500).json({
            success: false,
            error: "No se pudo guardar la reserva",
            details: writeErr.message
          });
        }

        console.log("✅ Ticket guardado exitosamente:", newTicket.id);
        
        // Respuesta exitosa (exactamente lo que espera Flutter)
        res.status(200).json({
          success: true,
          message: "Reserva creada exitosamente",
          ticket: {
            id: newTicket.id,
            status: newTicket.status,
            passenger: `${newTicket.passenger.name} ${newTicket.passenger.lastName}`,
            trip: `${newTicket.trip.origin} → ${newTicket.trip.destination}`,
            seats: newTicket.seats,
            createdAt: newTicket.createdAt
          }
        });
      });
    });

  } catch (error) {
    console.error("❌ Error procesando ticket:", error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
      details: error.message
    });
  }
});

// Endpoint para obtener todos los tickets
app.get("/tickets", (req, res) => {
  fs.readFile(ticketsFile, "utf8", (err, data) => {
    if (err) {
      return res.status(500).json({ 
        success: false,
        error: "No se pudieron leer los tickets" 
      });
    }
    
    try {
      const tickets = data.trim() ? JSON.parse(data) : [];
      res.json({
        success: true,
        data: tickets,
        count: tickets.length
      });
    } catch (parseErr) {
      console.error("Error parsing tickets:", parseErr);
      res.status(500).json({
        success: false,
        error: "Error al procesar los tickets"
      });
    }
  });
});

// Endpoint de salud del servidor
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// Middleware para manejar rutas no encontradas
app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint no encontrado",
    path: req.path,
    method: req.method,
    available_endpoints: [
      "GET /",
      "GET /routes", 
      "POST /tickets",
      "GET /tickets",
      "GET /health"
    ]
  });
});

// Puerto y host según Render
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor corriendo en http://0.0.0.0:${PORT}`);
  console.log(`📁 Archivo de rutas: ${routesFile}`);
  console.log(`🎫 Archivo de tickets: ${ticketsFile}`);
  console.log(`⏰ Iniciado en: ${new Date().toISOString()}`);
});

// Manejo de errores no capturados
process.on('uncaughtException', (err) => {
  console.error('❌ Error no capturado:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promesa rechazada:', reason);
});
