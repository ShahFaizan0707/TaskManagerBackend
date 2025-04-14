// TaskController.js
import { PrismaClient } from '@prisma/client';
import { WebSocketServer } from 'ws';

const prisma = new PrismaClient();
let wss;

// Initialize WebSocket server if it doesn't exist
export function initializeWebSocket(server) {
  if (!wss) {
    wss = new WebSocketServer({ server });

    wss.on('connection', (ws) => {
      console.log('Client connected to WebSocket');

      ws.on('message', (message) => {
        console.log('Received message:', message);
      });

      ws.on('close', () => {
        console.log('Client disconnected from WebSocket');
      });
    });

    console.log('WebSocket server initialized');
  }
  return wss;
}

// Broadcast updates to all connected clients
function broadcastUpdate(eventType, data) {
  if (wss) {
    const message = JSON.stringify({ type: eventType, data });
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}

// Create a new task
export async function createTask(taskData, userId) {
  try {
    const { projectId, title, description, dueDate, status, priority, assignedUserIds } = taskData;

    // Check if project exists and user is a member
    const projectMember = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId
        }
      }
    });

    if (!projectMember) {
      throw new Error('You must be a member of the project to create tasks');
    }

    // Create task with transaction to ensure task and assignments are created
    const task = await prisma.$transaction(async (tx) => {
      // Create the task
      const newTask = await tx.task.create({
        data: {
          title,
          description,
          dueDate: dueDate ? new Date(dueDate) : undefined,
          status,
          priority,
          project: {
            connect: { id: projectId }
          }
        }
      });

      // Create assignments if provided
      if (assignedUserIds && assignedUserIds.length > 0) {
        const assignmentPromises = assignedUserIds.map(assignedUserId =>
          tx.taskAssignment.create({
            data: {
              task: { connect: { id: newTask.id } },
              user: { connect: { id: assignedUserId } }
            }
          })
        );

        await Promise.all(assignmentPromises);
      }

      // Return task with assignments
      return tx.task.findUnique({
        where: { id: newTask.id },
        include: {
          assignments: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          }
        }
      });
    });

    // Broadcast the new task to all clients
    broadcastUpdate('TASK_CREATED', task);

    return task;
  } catch (error) {
    console.error('Error creating task:', error);
    throw error;
  }
}

// Get a task by ID
export async function getTaskById(taskId, userId) {
  try {
    // Check if user has access to this task
    const taskAccess = await prisma.projectMember.findFirst({
      where: {
        userId,
        project: {
          tasks: {
            some: {
              id: taskId
            }
          }
        }
      }
    });

    if (!taskAccess) {
      throw new Error('You do not have access to this task');
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignments: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        },
        messages: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          },
          orderBy: {
            createdAt: 'asc'
          }
        },
        project: {
          select: {
            id: true,
            name: true,
            creatorId: true,
          }
        }
      }
    });


    if (!task) {
      throw new Error('Task not found');
    }

    return task;
  } catch (error) {
    console.error('Error fetching task:', error);
    throw error;
  }
}

// Get all tasks for a project
export async function getProjectTasks(projectId, userId) {
  try {
    // Check if user is a member of the project
    const projectMember = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId
        }
      }
    });

    if (!projectMember) {
      throw new Error('You must be a member of the project to view tasks');
    }

    const tasks = await prisma.task.findMany({
      where: { projectId },
      include: {
        assignments: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    return tasks;
  } catch (error) {
    console.error('Error fetching project tasks:', error);
    throw error;
  }
}

// Update a task
export async function updateTask(taskId, taskData, userId) {
  try {
    const { title, description, status, dueDate, assignedUserIds, priority } = taskData;
    // Check if user has access to this task
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: {
          include: {
            members: {
              where: {
                userId
              }
            }
          }
        }
      }
    });

    if (!task) {
      throw new Error('Task not found');
    }

    if (task.project.members.length === 0) {
      throw new Error('You do not have permission to update this task');
    }

    // Update task with transaction to ensure task and assignments are updated
    const updatedTask = await prisma.$transaction(async (tx) => {
      // Update the task
      const updated = await tx.task.update({
        where: { id: taskId },
        data: {
          title: title !== undefined ? title : undefined,
          description: description !== undefined ? description : undefined,
          status: status !== undefined ? status : undefined,
          priority: priority !== undefined ? priority : undefined,
          dueDate: dueDate ? new Date(dueDate) : undefined
        }
      });

      // Handle assignments if provided
      if (assignedUserIds) {
        // Delete existing assignments
        await tx.taskAssignment.deleteMany({
          where: { taskId }
        });

        // Create new assignments
        if (assignedUserIds.length > 0) {
          const assignmentPromises = assignedUserIds.map(assignedUserId =>
            tx.taskAssignment.create({
              data: {
                task: { connect: { id: taskId } },
                user: { connect: { id: assignedUserId } }
              }
            })
          );

          await Promise.all(assignmentPromises);
        }
      }

      // Return updated task with assignments
      return tx.task.findUnique({
        where: { id: taskId },
        include: {
          assignments: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          }
        }
      });
    });

    // Broadcast the task update to all clients
    broadcastUpdate('TASK_UPDATED', updatedTask);

    return updatedTask;
  } catch (error) {
    console.error('Error updating task:', error);
    throw error;
  }
}

// Delete a task
export async function deleteTask(taskId, userId) {
  try {
    // Check if user has access to this task
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: {
          include: {
            members: {
              where: {
                userId
              }
            }
          }
        }
      }
    });

    if (!task) {
      throw new Error('Task not found');
    }

    if (task.project.members.length === 0) {
      throw new Error('You do not have permission to delete this task');
    }

    // Delete the task (cascade will handle assignments and messages)
    await prisma.task.delete({
      where: { id: taskId }
    });

    // Broadcast the task deletion to all clients
    broadcastUpdate('TASK_DELETED', { id: taskId });

    return { id: taskId, deleted: true };
  } catch (error) {
    console.error('Error deleting task:', error);
    throw error;
  }
}

// Add a message to a task
export async function addTaskMessage(taskId, content, userId) {
  try {
    // Check if user has access to this task
    const taskAccess = await prisma.projectMember.findFirst({
      where: {
        userId,
        project: {
          tasks: {
            some: {
              id: taskId
            }
          }
        }
      }
    });

    if (!taskAccess) {
      throw new Error('You do not have access to this task');
    }

    const message = await prisma.taskMessage.create({
      data: {
        content,
        task: { connect: { id: taskId } },
        user: { connect: { id: userId } }
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    // Broadcast the new message to all clients
    broadcastUpdate('TASK_MESSAGE_CREATED', message);

    return message;
  } catch (error) {
    console.error('Error adding task message:', error);
    throw error;
  }
}

// Assign task to user(s)
export async function assignTask(taskId, userIds, userId) {
  try {
    // Check if user has access to this task
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: {
          include: {
            members: {
              where: {
                userId
              }
            }
          }
        }
      }
    });

    if (!task) {
      throw new Error('Task not found');
    }

    if (task.project.members.length === 0) {
      throw new Error('You do not have permission to assign this task');
    }

    // Handle assignments with transaction
    const updatedTask = await prisma.$transaction(async (tx) => {
      // Delete existing assignments
      await tx.taskAssignment.deleteMany({
        where: { taskId }
      });

      // Create new assignments
      const assignmentPromises = userIds.map(assigneeId =>
        tx.taskAssignment.create({
          data: {
            task: { connect: { id: taskId } },
            user: { connect: { id: assigneeId } }
          }
        })
      );

      await Promise.all(assignmentPromises);

      // Return updated task with assignments
      return tx.task.findUnique({
        where: { id: taskId },
        include: {
          assignments: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          }
        }
      });
    });

    // Broadcast the task assignment update to all clients
    broadcastUpdate('TASK_ASSIGNED', updatedTask);

    return updatedTask;
  } catch (error) {
    console.error('Error assigning task:', error);
    throw error;
  }
}

export async function unassignUser(taskId, targetUserId, currentUserId) {
  try {
    // Check if user has access to this task
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: {
          include: {
            members: {
              where: { userId: currentUserId }
            }
          }
        }
      }
    });

    if (!task) {
      throw new Error('Task not found');
    }

    if (task.project.members.length === 0) {
      throw new Error('You do not have permission to unassign this task');
    }

    // Remove the user assignment
    await prisma.taskAssignment.deleteMany({
      where: {
        taskId,
        userId: targetUserId
      }
    });

    // Fetch and return the updated task
    const updatedTask = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignments: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    });
    return updatedTask;
  } catch (error) {
    console.error('Error unassigning user:', error);
    throw error;
  }
}


// Update task status
export async function updateTaskStatus(taskId, status, userId) {
  try {
    // Check if user has access to this task
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: {
          include: {
            members: {
              where: {
                userId
              }
            }
          }
        }
      }
    });

    if (!task) {
      throw new Error('Task not found');
    }

    if (task.project.members.length === 0) {
      throw new Error('You do not have permission to update this task');
    }

    // Update the task status
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: { status },
      include: {
        assignments: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    });

    // Broadcast the status update to all clients
    broadcastUpdate('TASK_STATUS_UPDATED', updatedTask);

    return updatedTask;
  } catch (error) {
    console.error('Error updating task status:', error);
    throw error;
  }
}

export default {
  initializeWebSocket,
  createTask,
  getTaskById,
  getProjectTasks,
  updateTask,
  deleteTask,
  addTaskMessage,
  assignTask,
  unassignUser,
  updateTaskStatus
};