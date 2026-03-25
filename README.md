# AI Test Builder

Async AI-orchestrated test generator that creates MAQs/MCQs from syllabus topics and complexity levels.

## Stack
- Frontend: Next.js + Tailwind
- Backend API: Node.js + Express
- Worker: BullMQ
- Database: PostgreSQL + Prisma
- Queue broker: Redis

## Quick Start
1. Copy `.env.example` to `.env` and fill values.
2. Ensure Docker Desktop is running.
3. Start infra: `docker compose up -d`
4. Install deps: `npm install`
5. Generate Prisma client: `npm run db:generate`
6. Apply migrations: `npm run db:migrate`
7. Start apps: `npm run dev`

## Apps
- `apps/web`: frontend
- `apps/server`: API + Prisma
- `apps/worker`: BullMQ worker
- `packages/shared`: shared types and validation

## Implemented Vertical Slice
- Create syllabus from frontend form via `POST /api/syllabi`
- Start async run via `POST /api/generation-runs`
- Worker generates 10 questions by slot/topic and stores records
- Poll run status in UI at `/runs/[id]`
- Preview generated test at `/tests/[id]`

## Added Evaluator Features
- Branded PDF export with cover metadata, framed pages, footer page numbers, and sign-off section
- One-click publish action for generated tests
- Published history page with filters by subject, complexity, and state
- Analytics panel with topic coverage bars and difficulty gauge
