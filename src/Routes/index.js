// Routes/index.js
import express from 'express';
import userRoutes from './UserRoutes.js';
import projectRoutes from './ProjectRoutes.js';
import projectMemberRoutes from './ProjectMemberRoutes.js';
import taskRoutes from './TaskRoutes.js';
import webSocketRoutes from './WebSocketRoutes.js';
import geminiRoutes from './GeminiRoutes.js';

const router = express.Router();

// API version prefix
const API_PREFIX = '/api';

// Register all routes
router.use(`${API_PREFIX}/users`, userRoutes);
router.use(`${API_PREFIX}/projects`, projectRoutes);
router.use(`${API_PREFIX}/members`, projectMemberRoutes);
router.use(`${API_PREFIX}/tasks`, taskRoutes);
router.use(`${API_PREFIX}/gemini`, geminiRoutes);
router.use(`${API_PREFIX}/ws`, webSocketRoutes);

// Health check endpoint
router.get(`${API_PREFIX}/health`, (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;