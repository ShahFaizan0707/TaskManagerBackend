import express from "express";
import cors from "cors";
import http from 'http';
import dotenv from "dotenv";
import prisma from "./configuration/database.js"; 
import routes from './Routes/index.js';
import { initializeWebSocketServer } from './Controllers/WebSocketController.js';

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

const server = http.createServer(app);

initializeWebSocketServer(server);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));



// Register all routes
app.use(routes);


app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Something went wrong',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});


// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
});

// Database connection test
async function testDatabaseConnection() {
  try {
    // Test the connection by executing a simple query
    await prisma.$queryRaw`SELECT 1+1 as result`;
    console.log("✅ Database connection successful");
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    process.exit(1);
  }
}

// Start server only after database connection is confirmed
async function startServer() {
  try {
    await testDatabaseConnection();
    
    // Start the server - IMPORTANT: Use 'server.listen', not 'app.listen'
    server.listen(port, () => {
      console.log(`✅ Server running on port ${port}`);
      console.log(`📝 Database URL: ${process.env.DATABASE_URL}`);
      console.log(`🔌 WebSocket server running on ws://localhost:${port}/ws`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}


// Handle graceful shutdown
process.on("SIGTERM", async () => {
  console.log(
    "SIGTERM received. Closing HTTP server and database connection..."
  );
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log(
    "SIGINT received. Closing HTTP server and database connection..."
  );
  await prisma.$disconnect();
  process.exit(0);
});

// Start the server
startServer().catch((error) => {
  console.error("Startup error:", error);
  process.exit(1);
});