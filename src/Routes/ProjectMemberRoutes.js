// Routes/ProjectMember.js
import express from 'express';
const router = express.Router();
import projectMemberController from '../Controllers/ProjectMemberController.js';
import authenticateUser from '../Middleware/authMiddleware.js';

// All routes require authentication
router.use(authenticateUser);

// Get all members of a project
router.get('/project/:projectId/members', async (req, res) => {
  try {
    const userId = req.userId;
    const projectId = parseInt(req.params.projectId);
    
    const members = await projectMemberController.getProjectMembers(projectId, userId);
    res.json(members);
  } catch (error) {
    console.error('Error fetching project members:', error);
    
    if (error.message.includes('access')) {
      return res.status(403).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to fetch members', details: error.message });
  }
});

// Add multiple members to a project at once
router.post('/project/:projectId/members/batch', async (req, res) => {
  try {
    const userId = req.userId;
    const projectId = parseInt(req.params.projectId);
    const { emails } = req.body;
    
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'Array of member emails is required' });
    }
    
    const result = await projectMemberController.addMultipleProjectMembers(projectId, emails, userId);
    res.status(201).json(result);
  } catch (error) {
    console.error('Error adding project members:', error);
    
    if (error.message.includes('creator')) {
      return res.status(403).json({ error: error.message });
    }
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to add members', details: error.message });
  }
});

// Leave a project (self-removal)
router.delete('/project/:projectId/leave', async (req, res) => {
  try {
    const userId = req.userId;
    const projectId = parseInt(req.params.projectId);
    
    const result = await projectMemberController.leaveProject(projectId, userId);
    res.json(result);
  } catch (error) {
    console.error('Error leaving project:', error);
    
    if (error.message.includes('creator')) {
      return res.status(403).json({ error: error.message });
    }
    
    if (error.message.includes('not a member')) {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to leave project', details: error.message });
  }
});

// Get user's tasks across all projects
router.get('/tasks', async (req, res) => {
  try {
    const userId = req.userId;
    
    const tasks = await projectMemberController.getUserTasks(userId);
    res.json(tasks);
  } catch (error) {
    console.error('Error fetching user tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks', details: error.message });
  }
});

// Transfer project ownership to another member
router.post('/project/:projectId/transfer-ownership', async (req, res) => {
  try {
    const userId = req.userId;
    const projectId = parseInt(req.params.projectId);
    const { newOwnerId } = req.body;
    
    if (!newOwnerId) {
      return res.status(400).json({ error: 'New owner ID is required' });
    }
    
    const updatedProject = await projectMemberController.transferProjectOwnership(projectId, newOwnerId, userId);
    res.json(updatedProject);
  } catch (error) {
    console.error('Error transferring project ownership:', error);
    
    if (error.message.includes('creator')) {
      return res.status(403).json({ error: error.message });
    }
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to transfer ownership', details: error.message });
  }
});

// Get tasks assigned to a specific user in a project
router.get('/project/:projectId/user/:targetUserId?/tasks', async (req, res) => {
  try {
    const userId = req.userId;
    const projectId = parseInt(req.params.projectId);
    const targetUserId = parseInt(req.params.targetUserId) || userId;
    
    const tasks = await projectMemberController.getUserProjectTasks(projectId, userId, targetUserId);
    res.json(tasks);
  } catch (error) {
    console.error('Error fetching user project tasks:', error);
    
    if (error.message.includes('access')) {
      return res.status(403).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to fetch tasks', details: error.message });
  }
});

// Get all users who are not members of a specific project
router.get('/project/:projectId/non-members', async (req, res) => {
  try {
    const userId = req.userId;
    const projectId = parseInt(req.params.projectId);
    const search = req.query.search?.toString() || '';

    const users = await projectMemberController.getNonProjectMembers(projectId, userId, search);
    res.json(users);
  } catch (error) {
    console.error('Error fetching non-project members:', error);

    if (error.message.includes('access')) {
      return res.status(403).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to fetch non-members', details: error.message });
  }
});


export default router;