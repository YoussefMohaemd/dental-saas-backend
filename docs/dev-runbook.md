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

The seed imports `seed-data/*.json` when those files are present. If the directory is
not present, it generates a deterministic connected dataset containing 5 clinics,
5 doctors, 35 patients, 35 orders, 25 cases, billing records, documents,
notifications, and change requests. This keeps a fresh checkout reproducible.

Run in Compose backend container:

```bash
docker compose run --rm backend npm run seed:dev
```

Run on host (if MongoDB is reachable using your configured `MONGODB_URI`):

```bash
npm run seed:dev
```

The seeded development accounts use `ChangeMe123!`:

| Account | Email | Scope |
| --- | --- | --- |
| Platform Admin | `def.admin@export.test` | All tenant records |
| Platform Admin (compatibility) | `dev-admin@example.test` | All tenant records |
| Doctor 1 | `doctor1@example.test` | Doctor 1's records |
| Doctor 2 | `doctor2@example.test` | Doctor 2's records |
| Doctor 3 | `doctor3@example.test` | Doctor 3's records |
| Doctor 4 | `doctor4@example.test` | Doctor 4's records |
| Doctor 5 | `doctor5@example.test` | Doctor 5's records |

The Postman collection uses the Platform Admin account by default. Run
`Authenticate regular doctor account` after changing `regularEmail` to verify
ownership filtering. The `Advance order workflow (New to Review)` request
demonstrates the valid status transition; subsequent transitions must follow
the order `Review`, `Design`, `Production`, `Quality Check`, `Ready`, `Completed`.

## 5) Quality and build checks

Run from the backend project root:

```bash
npm run typecheck
npm run lint
npm run build
```

Run the backend regression tests with:

```bash
npm test
```

## 6) Runtime notes

- App API base: `http://localhost:3000/api`
- Health check: `GET http://localhost:3000/api/health`
- Backend startup now validates env and opens MongoDB connection before listening.
