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

// ⭐ ENDPOINT CORREGIDO PARA MÚLTIPLES PASAJEROS
app.post("/tickets", (req, res) => {
  try {
    console.log("📝 Nueva reserva recibida:", JSON.stringify(req.body, null, 2));
    
    // Validar estructura básica de datos
    const { passengers, trip, seats, acceptedTerms, billing } = req.body;
    
    // Validar que todos los campos principales estén presentes
    if (!passengers || !trip || !seats || acceptedTerms === undefined || !billing) {
      return res.status(400).json({
        success: false,
        error: "Datos incompletos en la solicitud",
        received: {
          passengers: !!passengers,
          trip: !!trip,
          seats: !!seats,
          acceptedTerms: acceptedTerms !== undefined,
          billing: !!billing
        },
        details: "Faltan campos obligatorios en el JSON enviado"
      });
    }

    // Validar que passengers sea un array con elementos
    if (!Array.isArray(passengers) || passengers.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Se requiere al menos un pasajero",
        received_passengers: passengers
      });
    }

    // Validar datos de cada pasajero
    const requiredPassengerFields = ['name', 'lastName', 'documentType', 'documentNumber', 'birthDate'];
    for (let i = 0; i < passengers.length; i++) {
      const passenger = passengers[i];
      const missingFields = requiredPassengerFields.filter(field => !passenger[field] || passenger[field].toString().trim() === '');
      
      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Pasajero ${i + 1}: Datos incompletos`,
          missing_fields: missingFields,
          passenger_data: passenger
        });
      }

      // Validar tipos de datos específicos
      if (typeof passenger.hasMinors !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: `Pasajero ${i + 1}: 'hasMinors' debe ser true o false`,
          received: passenger.hasMinors
        });
      }

      if (typeof passenger.hasPets !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: `Pasajero ${i + 1}: 'hasPets' debe ser true o false`,
          received: passenger.hasPets
        });
      }
    }

    // Validar datos de facturación
    const requiredBillingFields = ['documentType', 'documentNumber', 'name', 'phone', 'email'];
    const missingBillingFields = requiredBillingFields.filter(field => !billing[field] || billing[field].toString().trim() === '');
    
    if (missingBillingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Datos de facturación incompletos",
        missing_billing_fields: missingBillingFields,
        billing_data: billing
      });
    }

    // Validar datos del viaje
    const requiredTripFields = ['origin', 'destination', 'date', 'schedule'];
    const missingTripFields = requiredTripFields.filter(field => !trip[field]);
    
    if (missingTripFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Datos del viaje incompletos",
        missing_trip_fields: missingTripFields
      });
    }

    // Validar asientos
    if (!Array.isArray(seats) || seats.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Se requiere al menos un asiento seleccionado",
        received_seats: seats
      });
    }

    // Verificar que cantidad de pasajeros coincida con asientos
    if (passengers.length !== seats.length) {
      return res.status(400).json({
        success: false,
        error: "La cantidad de pasajeros no coincide con la cantidad de asientos",
        passengers_count: passengers.length,
        seats_count: seats.length
      });
    }

    // Validar términos y condiciones
    if (!acceptedTerms) {
      return res.status(400).json({
        success: false,
        error: "Debe aceptar los términos y condiciones"
      });
    }

    // ✅ DATOS VALIDADOS - Crear el ticket
    const newTicket = {
      id: generateTicketId(),
      status: "CONFIRMED",
      createdAt: new Date().toISOString(),
      passengers: passengers.map((passenger, index) => ({
        name: passenger.name.trim(),
        lastName: passenger.lastName.trim(),
        documentType: passenger.documentType,
        documentNumber: passenger.documentNumber.trim(),
        birthDate: passenger.birthDate,
        hasMinors: passenger.hasMinors,
        hasPets: passenger.hasPets,
        hasInsurance: passenger.hasInsurance || false,
        seat: passenger.seat || seats[index]
      })),
      trip: {
        origin: trip.origin,
        destination: trip.destination,
        date: trip.date,
        schedule: trip.schedule
      },
      seats: seats,
      billing: {
        documentType: billing.documentType,
        documentNumber: billing.documentNumber.trim(),
        name: billing.name.trim(),
        phone: billing.phone.trim(),
        countryCode: billing.countryCode || '+57',
        email: billing.email.trim().toLowerCase(),
        fullPhone: `${billing.countryCode || '+57'}${billing.phone.trim()}`
      },
      acceptedTerms: acceptedTerms,
      paymentStatus: "PENDING",
      totalPassengers: passengers.length,
      totalPrice: passengers.reduce((total, p) => {
        const basePrice = 45000; // Precio base por pasajero
        const insurancePrice = p.hasInsurance ? 2000 : 0;
        return total + basePrice + insurancePrice;
      }, 0)
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
          console.error("❌ Error guardando ticket:", writeErr);
          return res.status(500).json({
            success: false,
            error: "No se pudo guardar la reserva",
            details: writeErr.message
          });
        }

        console.log("✅ Ticket guardado exitosamente:", newTicket.id);
        console.log(`👥 Pasajeros: ${newTicket.totalPassengers}`);
        console.log(`💺 Asientos: ${newTicket.seats.join(', ')}`);
        console.log(`💰 Precio total: $${newTicket.totalPrice} COP`);
        
        // ✅ RESPUESTA EXITOSA (formato que espera Flutter)
        res.status(200).json({
          success: true,
          message: "Reserva creada exitosamente",
          ticket: {
            id: newTicket.id,
            status: newTicket.status,
            passengers: newTicket.totalPassengers,
            mainPassenger: `${newTicket.passengers[0].name} ${newTicket.passengers[0].lastName}`,
            trip: `${newTicket.trip.origin} → ${newTicket.trip.destination}`,
            date: newTicket.trip.date,
            schedule: newTicket.trip.schedule,
            seats: newTicket.seats,
            totalPrice: newTicket.totalPrice,
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
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
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

// Endpoint para obtener un ticket específico
app.get("/tickets/:id", (req, res) => {
  const ticketId = req.params.id;
  
  fs.readFile(ticketsFile, "utf8", (err, data) => {
    if (err) {
      return res.status(500).json({ 
        success: false,
        error: "No se pudieron leer los tickets" 
      });
    }
    
    try {
      const tickets = data.trim() ? JSON.parse(data) : [];
      const ticket = tickets.find(t => t.id === ticketId);
      
      if (!ticket) {
        return res.status(404).json({
          success: false,
          error: "Ticket no encontrado"
        });
      }
      
      res.json({
        success: true,
        data: ticket
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
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
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
      "GET /tickets/:id",
      "GET /health"
    ]
  });
});

// Middleware de manejo de errores
app.use((err, req, res, next) => {
  console.error('❌ Error no manejado:', err);
  res.status(500).json({
    success: false,
    error: "Error interno del servidor",
    details: process.env.NODE_ENV === 'development' ? err.message : 'Error interno'
  });
});

// Puerto y host según Render
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor corriendo en http://0.0.0.0:${PORT}`);
  console.log(`📁 Archivo de rutas: ${routesFile}`);
  console.log(`🎫 Archivo de tickets: ${ticketsFile}`);
  console.log(`⏰ Iniciado en: ${new Date().toISOString()}`);
  console.log(`🔧 Entorno: ${process.env.NODE_ENV || 'development'}`);
});

// Manejo de errores no capturados
process.on('uncaughtException', (err) => {
  console.error('❌ Error no capturado:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promesa rechazada:', reason);
  process.exit(1);
});
