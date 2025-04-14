// Middleware/authMiddleware.js
import { verifyToken } from '../Utils/jwt.js';

export const authenticateUser = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Split the header to get the token
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }
    
    // Verify token
    const decodedToken = verifyToken(token);
    
    // Add user ID to request object
    req.userId = decodedToken.userId;
    
    // Proceed to next middleware or route handler
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    console.error('Authentication error:', error);
    return res.status(500).json({ error: 'Authentication failed', details: error.message });
  }
};

export default authenticateUser;