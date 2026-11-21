-- AlterTable
ALTER TABLE "Cv" ADD COLUMN     "rerankFailedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MatchResult" ADD COLUMN     "rerankedAt" TIMESTAMP(3);
