import { PrismaClient } from '@prisma/client';

// Instantiate Prisma with detailed logging
const prisma = new PrismaClient({
  log: ['error', 'warn', 'query'],
  errorFormat: 'pretty',
});

// Add comprehensive error handling
prisma.$on('error', (e) => {
  console.error('Prisma Error:', {
    message: e.message,
    target: e.target,
    code: e.code,
    meta: e.meta
  });
});

// Add query logging in development
if (process.env.NODE_ENV !== 'production') {
  prisma.$on('query', (e) => {
    console.log('Query:', e.query);
    console.log('Duration:', e.duration + 'ms');
    if (e.params) console.log('Params:', e.params);
  });
}

// Test database connection
async function testConnection() {
  try {
    await prisma.$connect();
    console.log('✅ Database connection successful');
  } catch (error) {
    console.error('❌ Database connection failed:', {
      message: error.message,
      code: error.code,
      meta: error.meta
    });
    throw error;
  }
}

// Initial connection test
testConnection().catch(error => {
  console.error('Failed to establish initial database connection');
  process.exit(1);
});

// Extend the client with a custom connect method
const extendedPrisma = prisma.$extends({
  model: {
    $allModels: {
      async safeCreate(args) {
        try {
          const result = await this.create(args);
          return { success: true, data: result };
        } catch (error) {
          console.error(`Error in ${this.name}.create:`, error);
          return { success: false, error: error.message };
        }
      }
    }
  }
});

export default extendedPrisma;