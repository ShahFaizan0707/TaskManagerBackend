// ProjectController.js
import { PrismaClient } from '@prisma/client';
import { broadcastUpdate } from './WebSocketController.js';

const prisma = new PrismaClient();

// Create a new project
export async function createProject(projectData, userId) {
  try {
    const { name, description, memberIds = [] } = projectData;

    // Create project with transaction to ensure project and members are created
    const project = await prisma.$transaction(async (tx) => {
      // Create the project
      const newProject = await tx.project.create({
        data: {
          name,
          description,
          creator: {
            connect: { id: userId }
          }
        }
      });

      // Add creator as a member
      await tx.projectMember.create({
        data: {
          project: { connect: { id: newProject.id } },
          user: { connect: { id: userId } }
        }
      });

      // Add additional members if provided
      if (memberIds.length > 0) {
        // Filter out the creator and any duplicate IDs
        const uniqueMemberIds = [...new Set(memberIds.filter(id => id !== userId))];

        const memberPromises = uniqueMemberIds.map(memberId =>
          tx.projectMember.create({
            data: {
              project: { connect: { id: newProject.id } },
              user: { connect: { id: memberId } }
            }
          })
        );

        await Promise.all(memberPromises);
      }

      // Return project with members
      return tx.project.findUnique({
        where: { id: newProject.id },
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
    });

    // Broadcast the new project to all clients
    broadcastUpdate('PROJECT_CREATED', project);

    return project;
  } catch (error) {
    console.error('Error creating project:', error);
    throw error;
  }
}

// Get a project by ID
export async function getProjectById(projectId, userId) {
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

    const project = await prisma.project.findUnique({
      where: { id: projectId },
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
        tasks: {
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
        }
      }
    });

    if (!project) {
      throw new Error('Project not found');
    }

    return project;
  } catch (error) {
    console.error('Error fetching project:', error);
    throw error;
  }
}

// Get all projects for a user
export async function getUserProjects(userId) {
  try {
    // Fetch projects with detailed user involvement
    const projects = await prisma.project.findMany({
      where: {
        OR: [
          { creatorId: userId },
          { members: { some: { userId } } }
        ]
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
        },
        tasks: {
          include: {
            assignments: true
          }
        },
        _count: {
          select: {
            tasks: true
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    // Calculate dashboard metrics
    const enhancedProjects = projects.map(project => {
      // Status counts for user's assigned tasks in this project
      const userTaskMetrics = {
        total: 0,
        todo: 0,
        inProgress: 0,
        underReview: 0,
        completed: 0,
        overdue: 0,
        priorities: {
          low: 0,
          medium: 0,
          high: 0,
          urgent: 0
        }
      };

      // Tasks assigned to this user in this project
      const userAssignedTasks = project.tasks.filter(task =>
        task.assignments.some(assignment => assignment.userId === userId)
      );

      userAssignedTasks.forEach(task => {
        userTaskMetrics.total++;

        // Count by status
        if (task.status === 'TODO') userTaskMetrics.todo++;
        else if (task.status === 'IN_PROGRESS') userTaskMetrics.inProgress++;
        else if (task.status === 'UNDER_REVIEW') userTaskMetrics.underReview++;
        else if (task.status === 'COMPLETED') userTaskMetrics.completed++;

        // Count overdue tasks (exclude completed tasks)
        if (task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'COMPLETED') {
          userTaskMetrics.overdue++;
        }

        // Count by priority
        if (task.priority === 'LOW') userTaskMetrics.priorities.low++;
        else if (task.priority === 'MEDIUM') userTaskMetrics.priorities.medium++;
        else if (task.priority === 'HIGH') userTaskMetrics.priorities.high++;
        else if (task.priority === 'URGENT') userTaskMetrics.priorities.urgent++;
      });

      // Also calculate project-wide metrics (all tasks regardless of assignment)
      const projectTaskMetrics = {
        total: project.tasks.length,
        todo: project.tasks.filter(task => task.status === 'TODO').length,
        inProgress: project.tasks.filter(task => task.status === 'IN_PROGRESS').length,
        underReview: project.tasks.filter(task => task.status === 'UNDER_REVIEW').length,
        completed: project.tasks.filter(task => task.status === 'COMPLETED').length,
        unassigned: project.tasks.filter(task => task.assignments.length === 0).length,
        overdue: project.tasks.filter(task =>
          task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'COMPLETED'
        ).length
      };

      // Calculate completion percentage for the project
      const completionPercentage = project.tasks.length > 0
        ? (projectTaskMetrics.completed / project.tasks.length) * 100
        : 0;

      // Return enhanced project with metrics
      return {
        ...project,
        userTaskMetrics,
        projectTaskMetrics,
        completionPercentage,
        // Upcoming deadlines (next 7 days)
        upcomingDeadlines: project.tasks
          .filter(task =>
            task.dueDate &&
            new Date(task.dueDate) >= new Date() &&
            new Date(task.dueDate) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) &&
            task.status !== 'COMPLETED'
          )
          .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
          .slice(0, 5) // Limit to 5 upcoming deadlines
      };
    });

    // Calculate global dashboard metrics across all projects
    const dashboardSummary = {
      totalProjects: projects.length,
      totalTasks: projects.reduce((sum, project) => sum + project._count.tasks, 0),
      userAssignedTasks: {
        total: projects.reduce((sum, project) =>
          sum + project.tasks.filter(task =>
            task.assignments.some(assignment => assignment.userId === userId)
          ).length, 0),
        completed: projects.reduce((sum, project) =>
          sum + project.tasks.filter(task =>
            task.assignments.some(assignment => assignment.userId === userId) &&
            task.status === 'COMPLETED'
          ).length, 0),
        overdue: projects.reduce((sum, project) =>
          sum + project.tasks.filter(task =>
            task.assignments.some(assignment => assignment.userId === userId) &&
            task.dueDate &&
            new Date(task.dueDate) < new Date() &&
            task.status !== 'COMPLETED'
          ).length, 0)
      },
      projectsCreatedByUser: projects.filter(project => project.creatorId === userId).length
    };

    // Remove the full tasks array to keep response size manageable
    const cleanedProjects = enhancedProjects.map(project => {
      const { tasks, ...rest } = project;
      return rest;
    });

    return {
      projects: cleanedProjects,
      dashboardSummary
    };
  } catch (error) {
    console.error('Error fetching user projects:', error);
    throw error;
  }
}
// Update a project
export async function updateProject(projectId, projectData, userId) {
  try {
    const { name, description } = projectData;

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
      throw new Error('Only the project creator can update project details');
    }

    // Update the project
    const updatedProject = await prisma.project.update({
      where: { id: projectId },
      data: {
        name: name !== undefined ? name : undefined,
        description: description !== undefined ? description : undefined
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

    // Broadcast the project update to all clients
    broadcastUpdate('PROJECT_UPDATED', updatedProject);

    return updatedProject;
  } catch (error) {
    console.error('Error updating project:', error);
    throw error;
  }
}

// Delete a project
export async function deleteProject(projectId, userId) {
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
      throw new Error('Only the project creator can delete the project');
    }

    // Delete the project (cascade will handle members, tasks, messages)
    await prisma.project.delete({
      where: { id: projectId }
    });

    // Broadcast the project deletion to all clients
    broadcastUpdate('PROJECT_DELETED', { id: projectId });

    return { id: projectId, deleted: true };
  } catch (error) {
    console.error('Error deleting project:', error);
    throw error;
  }
}

// Add a member to a project
export async function addProjectMember(projectId, memberEmail, userId) {
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

    // Find the user by email
    const memberUser = await prisma.user.findUnique({
      where: { email: memberEmail }
    });

    if (!memberUser) {
      throw new Error(`User with email ${memberEmail} not found`);
    }

    // Check if user is already a member
    const existingMember = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId: memberUser.id
        }
      }
    });

    if (existingMember) {
      throw new Error('User is already a member of this project');
    }

    // Add the member
    const member = await prisma.projectMember.create({
      data: {
        project: { connect: { id: projectId } },
        user: { connect: { id: memberUser.id } }
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

    // Broadcast the member addition to all clients
    broadcastUpdate('PROJECT_MEMBER_ADDED', { projectId, member });

    return member;
  } catch (error) {
    console.error('Error adding project member:', error);
    throw error;
  }
}

// Remove a member from a project
export async function removeProjectMember(projectId, memberId, userId) {
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

    // if (project.creatorId !== userId) {
    //   throw new Error('Only the project creator can remove members');
    // }

    // Prevent removing the creator
    if (memberId === project.creatorId) {
      throw new Error('Cannot remove the project creator from the project');
    }
    // Delete all task assignments for this user within the project
    await prisma.taskAssignment.deleteMany({
      where: {
        userId: memberId,
        task: {
          projectId
        }
      }
    });

    // Remove the member
    await prisma.projectMember.delete({
      where: {
        projectId_userId: {
          projectId,
          userId: memberId
        }
      }
    });

    // Broadcast the member removal to all clients
    broadcastUpdate('PROJECT_MEMBER_REMOVED', { projectId, memberId });
    return { projectId, memberId, removed: true };
  } catch (error) {
    console.error('Error removing project member:', error);
    throw error;
  }
}

// Add a message to a project
export async function addProjectMessage(projectId, content, userId) {
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
      throw new Error('You must be a member of the project to add messages');
    }

    const message = await prisma.projectMessage.create({
      data: {
        content,
        project: { connect: { id: projectId } },
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
    broadcastUpdate('PROJECT_MESSAGE_CREATED', message);

    return message;
  } catch (error) {
    console.error('Error adding project message:', error);
    throw error;
  }
}

export default {
  createProject,
  getProjectById,
  getUserProjects,
  updateProject,
  deleteProject,
  addProjectMember,
  removeProjectMember,
  addProjectMessage
};