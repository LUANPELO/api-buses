const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const mercadopago = require("mercadopago");
const app = express();

// Configurar MercadoPago
mercadopago.configurations.setAccessToken(process.env.MP_ACCESS_TOKEN || 'TEST-2951436048534426-123009-f91237d83c6e49f20efb2ed1e44b5a95-1577636154');

// Middlewares
app.use(cors());
app.use(express.json());

// Rutas de archivos
const routesFile = path.join(__dirname, "assets", "routes.json");
const ticketsFile = path.join(__dirname, "assets", "tickets.json");
const paymentsFile = path.join(__dirname, "assets", "payments.json");

// Crear archivos si no existen
if (!fs.existsSync(ticketsFile)) {
  fs.writeFileSync(ticketsFile, JSON.stringify([], null, 2));
}

if (!fs.existsSync(paymentsFile)) {
  fs.writeFileSync(paymentsFile, JSON.stringify([], null, 2));
}

// Función helper para generar ID único
const generateTicketId = () => {
  return 'TICKET_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
};

const generatePaymentId = () => {
  return 'PAY_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
};

// Endpoint de prueba
app.get("/", (req, res) => {
  res.json({
    message: "🚍 API de Rutas de Buses funcionando",
    endpoints: {
      "GET /": "Esta página",
      "GET /routes": "Obtener todas las rutas",
      "POST /tickets": "Crear nuevo ticket",
      "GET /tickets": "Obtener todos los tickets",
      "GET /tickets/:id": "Obtener un ticket específico",
      "PATCH /tickets/:id": "Actualizar un ticket",
      "POST /process-payment": "Procesar pago con MercadoPago",
      "GET /payment-status/:payment_id": "Consultar estado de pago",
      "GET /payments": "Obtener todos los pagos",
      "GET /health": "Estado del servidor"
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
        count: routes.routes ? routes.routes.length : routes.length
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

// ⭐ ENDPOINT PARA CREAR RESERVAS (sin pago) - CORREGIDO CON PRECIO DINÁMICO
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

    // ✅ BUSCAR EL PRECIO DE LA RUTA EN routes.json
    fs.readFile(routesFile, "utf8", (err, routesData) => {
      if (err) {
        console.error("❌ Error leyendo routes.json:", err);
        return res.status(500).json({
          success: false,
          error: "No se pudo obtener información de rutas"
        });
      }

      let routePrice = 45000; // Precio por defecto si no se encuentra la ruta
      
      try {
        const routesJson = JSON.parse(routesData);
        const routes = routesJson.routes || routesJson;
        
        // Buscar la ruta específica
        const selectedRoute = routes.find(r => 
          r.origin === trip.origin && r.destination === trip.destination
        );
        
        if (selectedRoute && selectedRoute.price) {
          routePrice = selectedRoute.price;
          console.log(`✅ Precio encontrado para ${trip.origin} → ${trip.destination}: $${routePrice}`);
        } else {
          console.warn(`⚠️ Ruta no encontrada: ${trip.origin} → ${trip.destination}. Usando precio por defecto: $${routePrice}`);
        }
      } catch (parseErr) {
        console.error("❌ Error parseando routes.json:", parseErr);
      }

      // ✅ CALCULAR PRECIO TOTAL DINÁMICAMENTE
      const totalPrice = passengers.reduce((total, p) => {
        const basePrice = routePrice; // ✅ Ahora usa el precio real de la ruta
        const insurancePrice = p.hasInsurance ? 2000 : 0;
        return total + basePrice + insurancePrice;
      }, 0);

      console.log(`💰 Cálculo de precio:`);
      console.log(`   - Precio base por pasajero: $${routePrice}`);
      console.log(`   - Número de pasajeros: ${passengers.length}`);
      console.log(`   - Pasajeros con seguro: ${passengers.filter(p => p.hasInsurance).length}`);
      console.log(`   - TOTAL: $${totalPrice} COP`);

      // ✅ DATOS VALIDADOS - Crear el ticket (ESTADO PENDIENTE DE PAGO)
      const newTicket = {
        id: generateTicketId(),
        status: "PENDING_PAYMENT",
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
        totalPrice: totalPrice, // ✅ Ahora es dinámico
        routePrice: routePrice  // ✅ Guardamos el precio base de la ruta
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

          console.log("✅ Reserva creada (pendiente de pago):", newTicket.id);
          console.log(`👥 Pasajeros: ${newTicket.totalPassengers}`);
          console.log(`💺 Asientos: ${newTicket.seats.join(', ')}`);
          console.log(`💰 Precio total: $${newTicket.totalPrice} COP`);
          
          // ✅ RESPUESTA EXITOSA (formato que espera Flutter)
          res.status(200).json({
            success: true,
            message: "Reserva creada exitosamente - Pendiente de pago",
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
              routePrice: newTicket.routePrice,
              createdAt: newTicket.createdAt
            }
          });
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

// 🚀 NUEVO ENDPOINT PARA PROCESAR PAGOS CON MERCADOPAGO
app.post("/process-payment", async (req, res) => {
  try {
    console.log("💳 Procesando pago:", JSON.stringify(req.body, null, 2));
    
    const { reservation, amount, payment_method, card_data, pse_data } = req.body;
    
    // Validar datos básicos
    if (!reservation || !amount || !payment_method) {
      return res.status(400).json({
        success: false,
        error: "Datos de pago incompletos",
        required: ["reservation", "amount", "payment_method"]
      });
    }

    // Simular procesamiento con MercadoPago
    // En producción, aquí harías la llamada real a MercadoPago
    let paymentResult;
    
    if (payment_method === 'card') {
      // Simular pago con tarjeta
      if (!card_data || !card_data.card_number || !card_data.cardholder_name || !card_data.expiry_date || !card_data.cvv) {
        return res.status(400).json({
          success: false,
          error: "Datos de tarjeta incompletos"
        });
      }

      // SIMULACIÓN - En producción usar MercadoPago SDK
      paymentResult = await simulateCardPayment(card_data, amount);
      
    } else if (payment_method === 'pse') {
      // Simular pago PSE
      if (!pse_data || !pse_data.document_number || !pse_data.email || !pse_data.bank_id) {
        return res.status(400).json({
          success: false,
          error: "Datos de PSE incompletos"
        });
      }

      // SIMULACIÓN - En producción usar MercadoPago SDK
      paymentResult = await simulatePSEPayment(pse_data, amount);
    }

    if (!paymentResult.success) {
      return res.status(400).json({
        success: false,
        error: paymentResult.error || "Error procesando el pago"
      });
    }

    // Crear registro de pago
    const paymentRecord = {
      id: generatePaymentId(),
      mercadopago_id: paymentResult.payment_id,
      reservation_id: reservation.reservation_id,
      amount: amount,
      method: payment_method,
      status: paymentResult.status,
      created_at: new Date().toISOString(),
      processed_at: paymentResult.status === 'approved' ? new Date().toISOString() : null,
      details: paymentResult.details || {},
    };

    // Guardar pago
    const payments = await readJSONFile(paymentsFile);
    payments.push(paymentRecord);
    await writeJSONFile(paymentsFile, payments);

    // Si el pago es exitoso, actualizar el ticket
    if (paymentResult.status === 'approved') {
      await updateTicketPaymentStatus(reservation.reservation_id, 'PAID', paymentRecord.id);
      
      // Obtener datos actualizados del ticket
      const tickets = await readJSONFile(ticketsFile);
      const updatedTicket = tickets.find(t => t.id === reservation.reservation_id);
      
      if (updatedTicket) {
        // Respuesta exitosa
        return res.status(200).json({
          success: true,
          message: "Pago procesado exitosamente",
          payment: {
            id: paymentRecord.id,
            status: paymentRecord.status,
            method: payment_method === 'card' ? 'Tarjeta de Crédito/Débito' : 'PSE',
            amount: amount,
            processed_at: paymentRecord.processed_at
          },
          ticket: {
            id: updatedTicket.id,
            status: updatedTicket.status,
            passengers: updatedTicket.totalPassengers,
            mainPassenger: `${updatedTicket.passengers[0].name} ${updatedTicket.passengers[0].lastName}`,
            trip: `${updatedTicket.trip.origin} → ${updatedTicket.trip.destination}`,
            date: updatedTicket.trip.date,
            schedule: updatedTicket.trip.schedule,
            seats: updatedTicket.seats,
            totalPrice: updatedTicket.totalPrice,
            paymentId: paymentRecord.id
          }
        });
      }
    }

    // Pago rechazado o pendiente
    return res.status(400).json({
      success: false,
      error: `Pago ${paymentResult.status}: ${paymentResult.message}`,
      payment_status: paymentResult.status,
      details: paymentResult.details
    });

  } catch (error) {
    console.error("❌ Error procesando pago:", error);
    res.status(500).json({
      success: false,
      error: "Error interno procesando el pago",
      details: error.message
    });
  }
});

// 🔍 FUNCIÓN PARA SIMULAR PAGO CON TARJETA
async function simulateCardPayment(cardData, amount) {
  // Simular delay de procesamiento
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Simular diferentes escenarios
  const cardNumber = cardData.card_number.replace(/\s/g, '');
  
  // Tarjetas de prueba
  if (cardNumber.startsWith('4111') || cardNumber.startsWith('5555')) {
    return {
      success: true,
      payment_id: 'MP_' + Date.now(),
      status: 'approved',
      message: 'Pago aprobado',
      details: {
        card_last_digits: cardNumber.slice(-4),
        cardholder_name: cardData.cardholder_name,
        payment_method_id: 'visa'
      }
    };
  }
  
  // Simular rechazo para otras tarjetas
  if (cardNumber.startsWith('4000')) {
    return {
      success: false,
      status: 'rejected',
      error: 'Tarjeta rechazada por el banco emisor',
      details: { reason: 'insufficient_funds' }
    };
  }
  
  // Por defecto aprobar
  return {
    success: true,
    payment_id: 'MP_' + Date.now(),
    status: 'approved',
    message: 'Pago aprobado',
    details: {
      card_last_digits: cardNumber.slice(-4),
      cardholder_name: cardData.cardholder_name,
      payment_method_id: 'mastercard'
    }
  };
}

// 🔍 FUNCIÓN PARA SIMULAR PAGO PSE
async function simulatePSEPayment(pseData, amount) {
  // Simular delay de procesamiento
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Por defecto aprobar PSE
  return {
    success: true,
    payment_id: 'PSE_' + Date.now(),
    status: 'approved',
    message: 'Pago PSE aprobado',
    details: {
      bank_id: pseData.bank_id,
      document_number: pseData.document_number,
      email: pseData.email,
      payment_method_id: 'pse'
    }
  };
}

// 🔧 FUNCIÓN HELPER PARA ACTUALIZAR ESTADO DE PAGO DEL TICKET
async function updateTicketPaymentStatus(ticketId, paymentStatus, paymentId) {
  try {
    const tickets = await readJSONFile(ticketsFile);
    const ticketIndex = tickets.findIndex(t => t.id === ticketId);
    
    if (ticketIndex !== -1) {
      tickets[ticketIndex].paymentStatus = paymentStatus;
      tickets[ticketIndex].status = paymentStatus === 'PAID' ? 'CONFIRMED' : 'PENDING_PAYMENT';
      tickets[ticketIndex].paymentId = paymentId;
      tickets[ticketIndex].paidAt = paymentStatus === 'PAID' ? new Date().toISOString() : null;
      
      await writeJSONFile(ticketsFile, tickets);
      console.log(`✅ Ticket ${ticketId} actualizado a: ${paymentStatus}`);
      return true;
    }
    
    console.error(`❌ Ticket ${ticketId} no encontrado para actualizar pago`);
    return false;
  } catch (error) {
    console.error("Error actualizando estado de pago:", error);
    return false;
  }
}

// 🔧 FUNCIONES HELPER PARA ARCHIVOS JSON
function readJSONFile(filepath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filepath, "utf8", (err, data) => {
      if (err) {
        if (err.code === 'ENOENT') {
          resolve([]); // Archivo no existe, devolver array vacío
        } else {
          reject(err);
        }
        return;
      }
      
      try {
        const parsed = data.trim() ? JSON.parse(data) : [];
        resolve(parsed);
      } catch (parseErr) {
        console.error(`Error parsing ${filepath}:`, parseErr);
        resolve([]); // En caso de error, devolver array vacío
      }
    });
  });
}

function writeJSONFile(filepath, data) {
  return new Promise((resolve, reject) => {
    fs.writeFile(filepath, JSON.stringify(data, null, 2), (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

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

// Endpoint para actualizar un ticket (PATCH)
app.patch("/tickets/:id", async (req, res) => {
  try {
    const ticketId = req.params.id;
    const updates = req.body;
    
    const tickets = await readJSONFile(ticketsFile);
    const ticketIndex = tickets.findIndex(t => t.id === ticketId);
    
    if (ticketIndex === -1) {
      return res.status(404).json({
        success: false,
        error: "Ticket no encontrado"
      });
    }
    
    // Actualizar el ticket con los nuevos datos
    tickets[ticketIndex] = {
      ...tickets[ticketIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    await writeJSONFile(ticketsFile, tickets);
    
    console.log(`✅ Ticket ${ticketId} actualizado`);
    
    res.json({
      success: true,
      message: "Ticket actualizado exitosamente",
      data: tickets[ticketIndex]
    });
  } catch (error) {
    console.error("Error actualizando ticket:", error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor"
    });
  }
});

// 🔍 NUEVO ENDPOINT PARA CONSULTAR ESTADO DE PAGO
app.get("/payment-status/:payment_id", async (req, res) => {
  try {
    const paymentId = req.params.payment_id;
    const payments = await readJSONFile(paymentsFile);
    const payment = payments.find(p => p.id === paymentId);
    
    if (!payment) {
      return res.status(404).json({
        success: false,
        error: "Pago no encontrado"
      });
    }
    
    res.json({
      success: true,
      data: payment
    });
  } catch (error) {
    console.error("Error consultando pago:", error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor"
    });
  }
});

// 📊 ENDPOINT PARA OBTENER TODOS LOS PAGOS
app.get("/payments", async (req, res) => {
  try {
    const payments = await readJSONFile(paymentsFile);
    res.json({
      success: true,
      data: payments,
      count: payments.length
    });
  } catch (error) {
    console.error("Error obteniendo pagos:", error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor"
    });
  }
});

// Endpoint de salud del servidor
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development',
    mercadopago_configured: !!process.env.MP_ACCESS_TOKEN
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
      "PATCH /tickets/:id",
      "POST /process-payment",
      "GET /payment-status/:payment_id",
      "GET /payments",
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
  console.log(`💳 Archivo de pagos: ${paymentsFile}`);
  console.log(`⏰ Iniciado en: ${new Date().toISOString()}`);
  console.log(`🔧 Entorno: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💰 MercadoPago: ${process.env.MP_ACCESS_TOKEN ? 'Configurado' : 'Token de prueba'}`);
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

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promesa rechazada:', reason);
  process.exit(1);
});
