# Local development runbook (Docker + reproducibility)

This runbook is for **local development only** and uses intentionally non-production sample data.

## 1) Prerequisites

- Docker Desktop (Compose v2)
- Node.js 20+ and npm (for running checks directly on host, optional)

## 2) Environment setup

```bash
cp .env.example .env
```

Required variables:

- `NODE_ENV=development`
- `PORT=3000`
- `LOG_LEVEL=info`
- `MONGODB_URI=mongodb://mongodb:27017/dental_saas_dev` (Compose network)

## 3) Start local stack (backend + MongoDB)

```bash
docker compose up --build -d
```

Check logs:

```bash
docker compose logs -f backend
```

Stop stack:

```bash
docker compose down
```

Remove database volume too (optional reset):

```bash
docker compose down -v
```

## 4) Seed development data (non-production only)

The seed includes clearly labeled demo entities like `Sample Smile Clinic (DEV ONLY)`.

Run in Compose backend container:

```bash
docker compose run --rm backend npm run seed:dev
```

Run on host (if MongoDB is reachable using your configured `MONGODB_URI`):

```bash
npm run seed:dev
```

## 5) Quality and build checks

Run from the backend project root:

```bash
npm run typecheck
npm run lint
npm run build
```

Tests: no dedicated `npm test` script is currently defined in this scaffold.

## 6) Runtime notes

- App API base: `http://localhost:3000/api`
- Health check: `GET http://localhost:3000/api/health`
- Backend startup now validates env and opens MongoDB connection before listening.
