-- CreateIndex
CREATE INDEX "Node_status_idx" ON "Node"("status");

-- CreateIndex
CREATE INDEX "Node_upkeepStatus_idx" ON "Node"("upkeepStatus");

-- CreateIndex
CREATE INDEX "Node_ownerId_upkeepStatus_idx" ON "Node"("ownerId", "upkeepStatus");

-- CreateIndex
CREATE INDEX "Node_attackCooldownUntil_idx" ON "Node"("attackCooldownUntil");
