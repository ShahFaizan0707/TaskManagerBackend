// ProjectMemberController.js
import { PrismaClient } from '@prisma/client';
import { broadcastUpdate } from './WebSocketController.js';

const prisma = new PrismaClient();

// Get all members of a project
export async function getProjectMembers(projectId, userId) {
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
      throw new Error('You do not have access to this project');
    }
    
    const members = await prisma.projectMember.findMany({
      where: { projectId },
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
    
    return members;
  } catch (error) {
    console.error('Error fetching project members:', error);
    throw error;
  }
}

// Add multiple members to a project at once
export async function addMultipleProjectMembers(projectId, memberEmails, userId) {
  try {
    // Check if user is the project creator
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        creator: true
      }
    });
    
    if (!project) {
      throw new Error('Project not found');
    }
    
    if (project.creatorId !== userId) {
      throw new Error('Only the project creator can add members');
    }
    
    // Get existing members
    const existingMembers = await prisma.projectMember.findMany({
      where: { projectId },
      include: {
        user: true
      }
    });
    
    const existingEmails = existingMembers.map(member => member.user.email);
    
    // Filter out duplicates
    const uniqueEmails = [...new Set(memberEmails)];
    
    // Filter out already existing members
    const newEmails = uniqueEmails.filter(email => !existingEmails.includes(email));
    
    // Find users by emails
    const users = await prisma.user.findMany({
      where: {
        email: {
          in: newEmails
        }
      }
    });
    
    const foundEmails = users.map(user => user.email);
    const notFoundEmails = newEmails.filter(email => !foundEmails.includes(email));
    
    // Add the members with transaction
    const addedMembers = await prisma.$transaction(async (tx) => {
      const memberPromises = users.map(user => 
        tx.projectMember.create({
          data: {
            project: { connect: { id: projectId } },
            user: { connect: { id: user.id } }
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
        })
      );
      
      return Promise.all(memberPromises);
    });
    
    // Broadcast the member additions to all clients
    broadcastUpdate('PROJECT_MEMBERS_ADDED', { projectId, members: addedMembers });
    
    return {
      added: addedMembers,
      notFound: notFoundEmails,
      alreadyMembers: uniqueEmails.filter(email => existingEmails.includes(email))
    };
  } catch (error) {
    console.error('Error adding project members:', error);
    throw error;
  }
}

// Leave a project (for self-removal)
export async function leaveProject(projectId, userId) {
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
      throw new Error('You are not a member of this project');
    }
    
    // Check if user is the project creator
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });
    
    if (project.creatorId === userId) {
      throw new Error('Project creator cannot leave the project. Transfer ownership or delete the project instead.');
    }
    
    // Remove user from the project
    await prisma.projectMember.delete({
      where: {
        projectId_userId: {
          projectId,
          userId
        }
      }
    });
    
    // Broadcast the member removal to all clients
    broadcastUpdate('PROJECT_MEMBER_LEFT', { projectId, userId });
    
    return { projectId, left: true };
  } catch (error) {
    console.error('Error leaving project:', error);
    throw error;
  }
}

// Get user's tasks across all projects
export async function getUserTasks(userId) {
  try {
    const tasks = await prisma.task.findMany({
      where: {
        assignments: {
          some: {
            userId
          }
        }
      },
      include: {
        project: {
          select: {
            id: true,
            name: true
          }
        },
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
      orderBy: [
        { status: 'asc' }, // TODO first, COMPLETED last
        { dueDate: 'asc' }, // Earliest due date first
        { updatedAt: 'desc' } // Most recently updated first
      ]
    });
    
    return tasks;
  } catch (error) {
    console.error('Error fetching user tasks:', error);
    throw error;
  }
}

// Transfer project ownership to another member
export async function transferProjectOwnership(projectId, newOwnerId, userId) {
  try {
    // Check if user is the project creator
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        creator: true
      }
    });
    
    if (!project) {
      throw new Error('Project not found');
    }
    
    if (project.creatorId !== userId) {
      throw new Error('Only the project creator can transfer ownership');
    }
    
    // Check if new owner is a member of the project
    const newOwnerMember = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId: newOwnerId
        }
      }
    });
    
    if (!newOwnerMember) {
      throw new Error('New owner must be a member of the project');
    }
    
    // Transfer ownership
    const updatedProject = await prisma.project.update({
      where: { id: projectId },
      data: {
        creatorId: newOwnerId
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        members: {
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
    
    // Broadcast the ownership transfer to all clients
    broadcastUpdate('PROJECT_OWNERSHIP_TRANSFERRED', { 
      projectId, 
      previousOwnerId: userId, 
      newOwnerId 
    });
    
    return updatedProject;
  } catch (error) {
    console.error('Error transferring project ownership:', error);
    throw error;
  }
}

// Get tasks assigned to a specific user in a project
export async function getUserProjectTasks(projectId, userId, targetUserId) {
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
      throw new Error('You do not have access to this project');
    }
    
    // If no targetUserId provided, use the current user's ID
    const userIdToQuery = targetUserId || userId;
    
    const tasks = await prisma.task.findMany({
      where: {
        projectId,
        assignments: {
          some: {
            userId: userIdToQuery
          }
        }
      },
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
      orderBy: [
        { status: 'asc' },
        { dueDate: 'asc' },
        { updatedAt: 'desc' }
      ]
    });
    
    return tasks;
  } catch (error) {
    console.error('Error fetching user project tasks:', error);
    throw error;
  }
}

export async function getNonProjectMembers(projectId, userId, search = '') {
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
      throw new Error('You do not have access to this project');
    }

    // Get users not in the project and filter by search
    const users = await prisma.user.findMany({
      where: {
        AND: [
          {
            NOT: {
              projectMemberships: {
                some: {
                  projectId
                }
              }
            }
          },
          {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } }
            ]
          }
        ]
      },
      select: {
        id: true,
        name: true,
        email: true
      }
    });

    return users;
  } catch (error) {
    console.error('Error fetching non-project members:', error);
    throw error;
  }
}

export default {
  getProjectMembers,
  addMultipleProjectMembers,
  leaveProject,
  getUserTasks,
  transferProjectOwnership,
  getUserProjectTasks,
  getNonProjectMembers
};