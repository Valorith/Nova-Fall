-- CreateEnum
CREATE TYPE "UpkeepStatus" AS ENUM ('PAID', 'WARNING', 'DECAY', 'COLLAPSE', 'ABANDONED');

-- AlterTable
ALTER TABLE "Node" ADD COLUMN     "upkeepStatus" "UpkeepStatus" NOT NULL DEFAULT 'PAID';
