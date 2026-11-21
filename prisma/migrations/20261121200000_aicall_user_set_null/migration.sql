-- AiCall rows must survive user deletion (global daily AI budget sums them).
-- DropForeignKey
ALTER TABLE "AiCall" DROP CONSTRAINT "AiCall_userId_fkey";

-- AddForeignKey
ALTER TABLE "AiCall" ADD CONSTRAINT "AiCall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
