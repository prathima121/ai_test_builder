-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GeneratedTest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "totalMarks" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" DATETIME,
    "publishedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GeneratedTest_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TestGenerationRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_GeneratedTest" ("createdAt", "durationMinutes", "id", "runId", "title", "totalMarks") SELECT "createdAt", "durationMinutes", "id", "runId", "title", "totalMarks" FROM "GeneratedTest";
DROP TABLE "GeneratedTest";
ALTER TABLE "new_GeneratedTest" RENAME TO "GeneratedTest";
CREATE UNIQUE INDEX "GeneratedTest_runId_key" ON "GeneratedTest"("runId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
