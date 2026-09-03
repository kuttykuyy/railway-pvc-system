-- Which page each signed-in person opened, for the signup funnel.
CREATE TABLE IF NOT EXISTS "railway_pvc"."page_views" (
  "id" BIGSERIAL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "page_views_userId_createdAt_idx" ON "railway_pvc"."page_views" ("userId", "createdAt" DESC);
