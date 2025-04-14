// Routes/WebSocket.js
import express from 'express';
const router = express.Router();
import webSocketController from '../Controllers/WebSocketController.js';
import authenticateUser from '../Middleware/authMiddleware.js';

// All WebSocket endpoint routes require authentication
router.use(authenticateUser);

// Get active users in a project
router.get('/active-users/:projectId', async (req, res) => {
  try {
    const userId = req.userId;
    const projectId = parseInt(req.params.projectId);
    
    // Verify user is a member of the project (optional extra security)
    // This check could be added here if needed
    
    const activeUsers = await webSocketController.getActiveProjectUsers(projectId);
    res.json(activeUsers);
  } catch (error) {
    console.error('Error fetching active project users:', error);
    res.status(500).json({ error: 'Failed to fetch active users', details: error.message });
  }
});

// Manual broadcast endpoint (primarily for testing)
router.post('/broadcast', async (req, res) => {
  try {
    const userId = req.userId;
    const { eventType, data, projectId } = req.body;
    
    if (!eventType || !data) {
      return res.status(400).json({ error: 'Event type and data are required' });
    }
    
    // For added security, we could check if the user has permission to broadcast to the specified project
    
    webSocketController.broadcastUpdate(eventType, { ...data, _triggeredBy: userId });
    res.json({ success: true, message: 'Broadcast sent' });
  } catch (error) {
    console.error('Error broadcasting message:', error);
    res.status(500).json({ error: 'Failed to broadcast message', details: error.message });
  }
});

export default router;