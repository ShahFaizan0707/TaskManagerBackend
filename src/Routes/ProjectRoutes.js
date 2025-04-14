// Routes/Project.js
import express from 'express';
const router = express.Router();
import projectController from '../Controllers/ProjectController.js';
import authenticateUser from '../Middleware/authMiddleware.js';

// All project routes require authentication
router.use(authenticateUser);

// Create a new project
router.post('/', async (req, res) => {
  try {
    const userId = req.userId;
    const projectData = req.body;
    
    // Validate required fields
    if (!projectData.name) {
      return res.status(400).json({ error: 'Project name is required' });
    }
    
    const project = await projectController.createProject(projectData, userId);
    res.status(201).json(project);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project', details: error.message });
  }
});

// Get a project by ID
router.get('/:projectId', async (req, res) => {
  try {
    const userId = req.userId;
    const projectId = parseInt(req.params.projectId);
    
    const project = await projectController.getProjectById(projectId, userId);
    res.json(project);
  } catch (error) {
    console.error('Error fetching project:', error);
    
    if (error.message.includes('access')) {
      return res.status(403).json({ error: error.message });
    }
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to fetch project', details: error.message });
  }
});

// Get all projects for the user
router.get('/', async (req, res) => {
  try {
    const userId = req.userId;
    const projects = await projectController.getUserProjects(userId);
    res.json(projects);
  } catch (error) {
    console.error('Error fetching user projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects', details: error.message });
  }
});

// Update a project
router.put('/:projectId', async (req, res) => {
  try {
    const userId = req.userId;
    const projectId = parseInt(req.params.projectId);
    const projectData = req.body;
    
    const updatedProject = await projectController.updateProject(projectId, projectData, userId);
    res.json(updatedProject);
  } catch (error) {
    console.error('Error updating project:', error);
    
    if (error.message.includes('creator')) {
      return res.status(403).json({ error: error.message });
    }
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to update project', details: error.message });
  }
});

// Delete a project
router.delete('/:projectId', async (req, res) => {
  try {
    const userId = req.userId;
    const projectId = parseInt(req.params.projectId);
    
    const result = await projectController.deleteProject(projectId, userId);
    res.json(result);
  } catch (error) {
    console.error('Error deleting project:', error);
    
    if (error.message.includes('creator')) {
      return res.status(403).json({ error: error.message });
    }
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to delete project', details: error.message });
  }
});

// Add a member to a project
router.post('/:projectId/members', async (req, res) => {
  try {
    const userId = req.userId;
    const projectId = parseInt(req.params.projectId);
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Member email is required' });
    }
    
    const member = await projectController.addProjectMember(projectId, email, userId);
    res.status(201).json(member);
  } catch (error) {
    console.error('Error adding project member:', error);
    
    if (error.message.includes('creator')) {
      return res.status(403).json({ error: error.message });
    }
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    
    if (error.message.includes('already a member')) {
      return res.status(409).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to add member', details: error.message });
  }
});

// Remove a member from a project
router.delete('/:projectId/members/:memberId', async (req, res) => {
  try {
    const userId = req.userId;
    const projectId = parseInt(req.params.projectId);
    const memberId = parseInt(req.params.memberId);
    
    const result = await projectController.removeProjectMember(projectId, memberId, userId);
    res.json(result);
  } catch (error) {
    console.error('Error removing project member:', error);
    
    if (error.message.includes('creator')) {
      return res.status(403).json({ error: error.message });
    }
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to remove member', details: error.message });
  }
});

// Add a message to a project
router.post('/:projectId/messages', async (req, res) => {
  try {
    const userId = req.userId;
    const projectId = parseInt(req.params.projectId);
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Message content is required' });
    }
    
    const message = await projectController.addProjectMessage(projectId, content, userId);
    res.status(201).json(message);
  } catch (error) {
    console.error('Error adding project message:', error);
    
    if (error.message.includes('member')) {
      return res.status(403).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to add message', details: error.message });
  }
});

export default router;