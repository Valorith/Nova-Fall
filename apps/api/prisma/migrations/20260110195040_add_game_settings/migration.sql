-- CreateTable
CREATE TABLE "GameSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameSetting_key_key" ON "GameSetting"("key");

-- CreateIndex
CREATE INDEX "GameSetting_key_idx" ON "GameSetting"("key");
