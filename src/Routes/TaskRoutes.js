// Routes/Task.js
import express from 'express';
const router = express.Router();
import taskController from '../Controllers/TaskController.js';
import authenticateUser from '../Middleware/authMiddleware.js';

// All task routes require authentication
router.use(authenticateUser);

// Create a new task
router.post('/', async (req, res) => {
  try {
    const userId = req.userId;
    const taskData = req.body;

    // Parse projectId to integer
    const projectId = parseInt(taskData.projectId, 10);
    if (isNaN(projectId) || !taskData.title) {
      return res.status(400).json({ error: 'Valid Project ID and task title are required' });
    }
    taskData.projectId = projectId;

    const task = await taskController.createTask(taskData, userId);
    res.status(201).json(task);
  } catch (error) {
    console.error('Error creating task:', error);
    
    if (error.message.includes('member')) {
      return res.status(403).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to create task', details: error.message });
  }
});

// Get a task by ID
router.get('/:taskId', async (req, res) => {
  try {
    const userId = req.userId;
    const taskId = parseInt(req.params.taskId);
    
    const task = await taskController.getTaskById(taskId, userId);
    res.json(task);
  } catch (error) {
    console.error('Error fetching task:', error);
    
    if (error.message.includes('access')) {
      return res.status(403).json({ error: error.message });
    }
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to fetch task', details: error.message });
  }
});

// Get all tasks for a project
router.get('/project/:projectId', async (req, res) => {
  try {
    const userId = req.userId;
    const projectId = parseInt(req.params.projectId);
    
    const tasks = await taskController.getProjectTasks(projectId, userId);
    res.json(tasks);
  } catch (error) {
    console.error('Error fetching project tasks:', error);
    
    if (error.message.includes('member')) {
      return res.status(403).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to fetch tasks', details: error.message });
  }
});

// Update a task
router.put('/:taskId', async (req, res) => {
  try {
    const userId = req.userId;
    const taskId = parseInt(req.params.taskId);
    const taskData = req.body;
    
    const updatedTask = await taskController.updateTask(taskId, taskData, userId);
    res.json(updatedTask);
  } catch (error) {
    console.error('Error updating task:', error);
    
    if (error.message.includes('permission')) {
      return res.status(403).json({ error: error.message });
    }
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to update task', details: error.message });
  }
});

// Delete a task
router.delete('/:taskId', async (req, res) => {
  try {
    const userId = req.userId;
    const taskId = parseInt(req.params.taskId);
    
    const result = await taskController.deleteTask(taskId, userId);
    res.json(result);
  } catch (error) {
    console.error('Error deleting task:', error);
    
    if (error.message.includes('permission')) {
      return res.status(403).json({ error: error.message });
    }
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to delete task', details: error.message });
  }
});

// Add a message to a task
router.post('/:taskId/messages', async (req, res) => {
  try {
    const userId = req.userId;
    const taskId = parseInt(req.params.taskId);
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Message content is required' });
    }
    
    const message = await taskController.addTaskMessage(taskId, content, userId);
    res.status(201).json(message);
  } catch (error) {
    console.error('Error adding task message:', error);
    
    if (error.message.includes('access')) {
      return res.status(403).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to add message', details: error.message });
  }
});

// Assign task to user(s)
router.post('/:taskId/assign', async (req, res) => {
  try {
    const userId = req.userId;
    const taskId = parseInt(req.params.taskId);
    const { userIds } = req.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'Array of user IDs is required' });
    }
    
    const updatedTask = await taskController.assignTask(taskId, userIds, userId);
    res.json(updatedTask);
  } catch (error) {
    console.error('Error assigning task:', error);
    
    if (error.message.includes('permission')) {
      return res.status(403).json({ error: error.message });
    }
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to assign task', details: error.message });
  }
});

// Update task status
router.patch('/:taskId/status', async (req, res) => {
  try {
    const userId = req.userId;
    const taskId = parseInt(req.params.taskId);
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }
    
    const updatedTask = await taskController.updateTaskStatus(taskId, status, userId);
    res.json(updatedTask);
  } catch (error) {
    console.error('Error updating task status:', error);
    
    if (error.message.includes('permission')) {
      return res.status(403).json({ error: error.message });
    }
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to update status', details: error.message });
  }
});
// Remove a user from a task
router.delete('/:taskId/unassign/:userId', async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    const targetUserId = parseInt(req.params.userId);
    const currentUserId = req.userId;

    const result = await taskController.unassignUser(taskId, targetUserId, currentUserId);
    res.json(result);
  } catch (error) {
    console.error('Error unassigning user:', error);

    if (error.message.includes('permission')) {
      return res.status(403).json({ error: error.message });
    }

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to unassign user', details: error.message });
  }
});


export default router;