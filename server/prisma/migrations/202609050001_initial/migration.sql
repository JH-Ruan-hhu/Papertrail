CREATE TABLE "auth_records" ("kind" TEXT NOT NULL, "id" TEXT NOT NULL, "payload" JSONB NOT NULL, PRIMARY KEY ("kind", "id"));
CREATE TABLE "workspace_records" ("userId" TEXT NOT NULL, "entity" TEXT NOT NULL, "id" TEXT NOT NULL, "revision" INTEGER NOT NULL CHECK ("revision" > 0), "cursor" INTEGER NOT NULL CHECK ("cursor" > 0), "deletedAt" TIMESTAMPTZ, "payload" JSONB NOT NULL, PRIMARY KEY ("userId", "entity", "id"));
CREATE INDEX "workspace_records_userId_cursor_idx" ON "workspace_records" ("userId", "cursor");
