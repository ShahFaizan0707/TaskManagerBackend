// UserController.js
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { generateToken } from '../Utils/jwt.js';

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

// Helper function to check if tables exist
async function ensureTablesExist() {
  try {
    await prisma.$queryRaw`SELECT 1 FROM users LIMIT 1`;
    return true;
  } catch (error) {
    if (error.code === 'P2021') {
      console.warn('Database tables do not exist yet. Run migrations first.');
      return false;
    }
    throw error;
  }
}

export async function registerUser(userData) {
  try {
    // Check if tables exist before operating
    const tablesExist = await ensureTablesExist();
    if (!tablesExist) {
      throw new Error('Database tables not initialized. Run migrations first.');
    }

    const { email, password, name } = userData;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Create the user
    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
      }
    });

    // Generate JWT token
    const token = generateToken(user.id);

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      token
    };
  } catch (error) {
    console.error('Error registering user:', error);
    throw error;
  }
}

export async function loginUser(credentials) {
  try {
    // Check if tables exist before operating
    const tablesExist = await ensureTablesExist();
    if (!tablesExist) {
      throw new Error('Database tables not initialized. Run migrations first.');
    }

    const { email, password } = credentials;

    // Find the user
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new Error('Invalid email or password');
    }

    // Generate JWT token
    const token = generateToken(user.id);

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      token
    };
  } catch (error) {
    console.error('Error logging in user:', error);
    throw error;
  }
}

export async function getUserProfile(userId) {
  try {
    // Check if tables exist before operating
    const tablesExist = await ensureTablesExist();
    if (!tablesExist) {
      throw new Error('Database tables not initialized. Run migrations first.');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { 
        createdProjects: true,
        projectMemberships: {
          include: {
            project: true
          }
        },
        assignedTasks: {
          include: {
            task: true
          }
        }
      }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Remove password from response
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    throw error;
  }
}

export async function updateUserProfile(userId, userData) {
  try {
    // Check if tables exist before operating
    const tablesExist = await ensureTablesExist();
    if (!tablesExist) {
      throw new Error('Database tables not initialized. Run migrations first.');
    }

    const { name, email, password } = userData;
    
    // Prepare update data
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (password) {
      updateData.password = await bcrypt.hash(password, SALT_ROUNDS);
    }

    // Update the user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData
    });

    // Remove password from response
    const { password: _, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
}

export default {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile
};