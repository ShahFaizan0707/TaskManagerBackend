import express from 'express';
const router = express.Router();
import authenticateUser from '../Middleware/authMiddleware.js';

import getProjectFocusRecommendation from '../Controllers/GeminiController.js';

router.use(authenticateUser);

router.post('/', async (req, res) => {
  try {
    const userId = req.userId;
    const Data = await getProjectFocusRecommendation.getProjectFocusRecommendation(userId);
    res.status(201).json(Data);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project', details: error.message });
  }
});

export default router;