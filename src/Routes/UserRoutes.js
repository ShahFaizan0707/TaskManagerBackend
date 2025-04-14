// Routes/User.js
import express from 'express';
const router = express.Router();
import userService from '../Controllers/UserController.js';
import authenticateUser from '../Middleware/authMiddleware.js';

// Register a new user
router.post('/register', async (req, res) => {
  try {
    const userData = req.body;
    
    // Validate required fields
    if (!userData.email || !userData.password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const result = await userService.registerUser(userData);
    res.status(201).json(result);
  } catch (error) {
    console.error('Registration error:', error);
    
    if (error.message.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }
    
    if (error.message.includes('not initialized')) {
      return res.status(503).json({ 
        error: 'Database not initialized', 
        message: 'Please run database migrations first',
        details: error.message 
      });
    }
    
    res.status(500).json({ error: 'Registration failed', details: error.message });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const credentials = req.body;
    
    // Validate required fields
    if (!credentials.email || !credentials.password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const result = await userService.loginUser(credentials);
    res.json(result);
  } catch (error) {
    console.error('Login error:', error);
    
    if (error.message.includes('Invalid email or password')) {
      return res.status(401).json({ error: error.message });
    }
    
    if (error.message.includes('not initialized')) {
      return res.status(503).json({ 
        error: 'Database not initialized', 
        message: 'Please run database migrations first',
        details: error.message 
      });
    }
    
    res.status(500).json({ error: 'Login failed', details: error.message });
  }
});

// Get user profile (protected route)
router.get('/profile', authenticateUser, async (req, res) => {
  try {
    const userId = req.userId;
    const user = await userService.getUserProfile(userId);
    res.json(user);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    
    if (error.message.includes('not initialized')) {
      return res.status(503).json({ 
        error: 'Database not initialized', 
        message: 'Please run database migrations first',
        details: error.message 
      });
    }
    
    res.status(500).json({ error: 'Failed to fetch profile', details: error.message });
  }
});

// Update user profile (protected route)
router.put('/profile', authenticateUser, async (req, res) => {
  try {
    const userId = req.userId;
    const userData = req.body;
    const updatedUser = await userService.updateUserProfile(userId, userData);
    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating user profile:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    
    if (error.message.includes('not initialized')) {
      return res.status(503).json({ 
        error: 'Database not initialized', 
        message: 'Please run database migrations first',
        details: error.message 
      });
    }
    
    res.status(500).json({ error: 'Failed to update profile', details: error.message });
  }
});

export default router;