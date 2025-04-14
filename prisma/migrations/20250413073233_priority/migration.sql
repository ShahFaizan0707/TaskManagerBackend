-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "priority" "TaskPriority" NOT NULL DEFAULT 'LOW';
