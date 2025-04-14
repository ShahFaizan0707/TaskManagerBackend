// WebSocketController.js
import { WebSocketServer, WebSocket } from 'ws';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
let wss;

// Initialize WebSocket server
export function initializeWebSocketServer(server) {
  if (!wss) {
    wss = new WebSocketServer({
      server,
      path: '/ws' // This path must match the one used in the frontend
    });

    // Store connected clients with their user IDs for targeted messaging
    const clients = new Map();

    wss.on('connection', (ws, req) => {
      console.log('Client connected to WebSocket');

      // Extract user ID and project ID from query parameters
      const url = new URL(req.url, 'http://localhost');
      const userId = url.searchParams.get('userId');
      const projectId = url.searchParams.get('projectId');

      if (userId) {
        // Store client connection with user ID for targeted messages
        if (!clients.has(userId)) {
          clients.set(userId, new Set());
        }
        clients.get(userId).add(ws);

        // Store additional metadata on the connection
        ws.userId = userId;
        ws.projectId = projectId;

        // Send initial connection confirmation
        ws.send(JSON.stringify({
          type: 'CONNECTION_ESTABLISHED',
          data: {
            userId,
            projectId: projectId || null,
            timestamp: new Date().toISOString()
          }
        }));

        // Log user presence if in a project
        if (projectId) {
          // Fetch user info before broadcasting
          getUserInfo(userId).then(userInfo => {
            broadcastToProject(projectId, {
              type: 'USER_ONLINE',
              data: {
                userId,
                projectId,
                timestamp: new Date().toISOString(),
                user: userInfo // Include user info in the broadcast
              }
            }, ws);
          }).catch(err => console.error('Error fetching user info:', err));
        }
      }

      ws.on('message', async (message) => {
        try {
          const parsedMessage = JSON.parse(message);
          // Handle different message types
          switch (parsedMessage.type) {
            case 'PING':
              ws.send(JSON.stringify({ type: 'PONG', data: { timestamp: new Date().toISOString() } }));
              break;

            case 'JOIN_PROJECT':
              console.log(`User ${ws.userId} joining project ${parsedMessage.data.projectId}`);
              ws.projectId = parsedMessage.data.projectId;

              // Fetch user info before broadcasting
              const userInfo = await getUserInfo(ws.userId);

              broadcastToProject(parsedMessage.data.projectId, {
                type: 'USER_JOINED_PROJECT',
                data: {
                  userId: ws.userId,
                  projectId: parsedMessage.data.projectId,
                  timestamp: new Date().toISOString(),
                  user: userInfo // Include user info in the broadcast
                }
              }, ws);
              break;

            case 'LEAVE_PROJECT':
              // User is leaving a specific project room
              const oldProjectId = ws.projectId;
              ws.projectId = null;
              if (oldProjectId) {
                // Fetch user info before broadcasting
                const userInfo = await getUserInfo(ws.userId);

                broadcastToProject(oldProjectId, {
                  type: 'USER_LEFT_PROJECT',
                  data: {
                    userId: ws.userId,
                    projectId: oldProjectId,
                    timestamp: new Date().toISOString(),
                    user: userInfo // Include user info in the broadcast
                  }
                }, ws);
              }
              break;

            case 'TASK_STATUS_CHANGE':
              // User is changing a task status - handle and broadcast
              if (parsedMessage.data.taskId && parsedMessage.data.status) {
                // Update the task in the database
                const updatedTask = await prisma.task.update({
                  where: { id: parseInt(parsedMessage.data.taskId) },
                  data: { status: parsedMessage.data.status },
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
                    project: {
                      select: {
                        id: true,
                        name: true
                      }
                    }
                  }
                });
                console.log('Updated task Status for Project', updatedTask.projectId);
                broadcastToProject(updatedTask.projectId.toString(), {
                  type: 'TASK_STATUS_CHANGE',
                  data: updatedTask
                });
              }
              break;

            case 'NEW_TASK_MESSAGE':
              // Handle new message creation
              if (parsedMessage.data.taskId && parsedMessage.data.content) {
                // Create message in the database
                const newMessage = await prisma.taskMessage.create({
                  data: {
                    content: parsedMessage.data.content,
                    taskId: parseInt(parsedMessage.data.taskId),
                    userId: parseInt(ws.userId)
                  },
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        email: true
                      }
                    },
                    task: {
                      select: {
                        id: true,
                        projectId: true
                      }
                    }
                  }
                });

                // Broadcast the new message to everyone in the project
                if (newMessage.task && newMessage.task.projectId) {

                  // Log each client's projectId to debug
                  wss.clients.forEach(client => {
                    console.log('Client projectId:', client.projectId, 'Expected projectId:', newMessage.task.projectId);
                  });


                  broadcastToProject(newMessage.task.projectId, {
                    type: 'NEW_TASK_MESSAGE',
                    data: newMessage
                  });
                }
              }
              break;

            case 'USER_TYPING':
              // User is typing in a message area
              if (parsedMessage.context && parsedMessage.contextId) {
                broadcastToProject(ws.projectId, {
                  type: 'USER_TYPING',
                  data: {
                    userId: ws.userId,
                    context: parsedMessage.context, // 'project' or 'task'
                    contextId: parsedMessage.contextId,
                    timestamp: new Date().toISOString()
                  }
                }, ws);
              }
              break;

            default:
              console.log('Unknown message type:', parsedMessage.type);
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      });

      ws.on('close', () => {
        console.log('Client disconnected from WebSocket');

        // Remove client from the tracked connections
        if (userId && clients.has(userId)) {
          clients.get(userId).delete(ws);
          if (clients.get(userId).size === 0) {
            clients.delete(userId);
          }
        }

        // Notify project members that user is offline
        if (ws.projectId) {
          console.log(`User ${ws} disconnected from project ${ws.projectId}`);
          // Fetch user info before broadcasting
          getUserInfo(ws.userId).then(userInfo => {
            broadcastToProject(ws.projectId, {
              type: 'USER_OFFLINE',
              data: {
                userId: ws.userId,
                projectId: ws.projectId,
                timestamp: new Date().toISOString(),
                user: userInfo // Include user info in the broadcast
              }
            });
          }).catch(err => console.error('Error fetching user info:', err));
        }
      });
    });

    // Helper function to get user info
    async function getUserInfo(userId) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: parseInt(userId) },
          select: {
            id: true,
            name: true,
            email: true
          }
        });
        return user;
      } catch (error) {
        console.error('Error fetching user info:', error);
        return { id: userId, name: 'Unknown User' };
      }
    }

    // Helper function to broadcast to all clients in a project
    function broadcastToProject(projectId, message, excludeClient = null) {
      if (!projectId) {
        console.log('No projectId provided for broadcast');
        return;
      }
      let sentCount = 0;

      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN &&
          client.projectId === projectId &&
          client !== excludeClient) {
          client.send(JSON.stringify(message));
        }
        sentCount++;
      });
      console.log(`Message broadcast complete of type ${message.type} Sent to ${sentCount} clients`);
    }

    // Helper function to send message to a specific user
    function sendToUser(userId, message) {
      if (userId && clients.has(userId)) {
        clients.get(userId).forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
          }
        });
      }
    }

    // Expose methods for other controllers to use
    wss.broadcastToAll = function (message) {
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(message));
        }
      });
    };

    wss.broadcastToProject = broadcastToProject;
    wss.sendToUser = sendToUser;
  }

  return wss;
}

// Function to broadcast updates - can be imported by other controllers
export function broadcastUpdate(eventType, data) {
  if (wss) {
    const message = { type: eventType, data };

    // For project-specific updates, only broadcast to those in the project
    if (data && data.projectId) {
      wss.broadcastToProject(data.projectId, message);
    }
    // For task-specific updates, find the project and broadcast to those in the project
    else if (eventType.startsWith('TASK_') && data && data.id) {
      prisma.task.findUnique({
        where: { id: data.id },
        select: { projectId: true }
      }).then(task => {
        if (task) {
          wss.broadcastToProject(task.projectId, message);
        }
      }).catch(error => {
        console.error('Error getting task project for broadcast:', error);
      });
    }
    // For other updates, broadcast to all
    else {
      wss.broadcastToAll(message);
    }
  }
}

// Get active users in a project
export async function getActiveProjectUsers(projectId) {
  if (!wss) return [];

  const activeUsersSet = new Set();

  wss.clients.forEach(client => {
    if (client.projectId === projectId && client.userId) {
      const parsedId = parseInt(client.userId);
      if (!isNaN(parsedId)) {
        activeUsersSet.add(parsedId);
      }
    }
  });

  const activeUsers = Array.from(activeUsersSet);
  console.log(`Active users in project ${projectId}:`, activeUsers);

  if (activeUsers.length > 0) {
    try {
      const users = await prisma.user.findMany({
        where: {
          id: {
            in: activeUsers
          }
        },
        select: {
          id: true,
          name: true,
          email: true
        }
      });
      return users;
    } catch (error) {
      console.error('Error fetching active user details:', error);
      return [];
    }
  }

  return [];
}

export default {
  initializeWebSocketServer,
  broadcastUpdate,
  getActiveProjectUsers
};