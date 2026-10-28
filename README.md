# dental-saas-backend

Production-oriented Node.js (LTS) + TypeScript + Express backend scaffold.

## Scripts

- `npm run dev` - start in watch mode with `tsx`
- `npm run lint` - run ESLint
- `npm run typecheck` - run TypeScript type checks
- `npm run test` - run Vitest test suite (includes Supertest API integration checks)
- `npm run build` - compile to `dist/`
- `npm run start` - run compiled server
- `npm run seed:dev` - seed local development data from backend `seed-data` JSON files (non-production)

## Environment

Copy `.env.example` to `.env` and adjust values as needed.

- `NODE_ENV` (`development` | `test` | `production`)
- `PORT` (default `3000`)
- `LOG_LEVEL` (`fatal` | `error` | `warn` | `info` | `debug` | `trace` | `silent`)
- `CORS_ALLOWED_ORIGIN` allowed frontend origin for credentialed browser API calls (default `http://localhost:4200`)
- `AUTH_ACCESS_TOKEN_SECRET` / `AUTH_REFRESH_TOKEN_SECRET` (min 32 chars; safe development defaults are used when omitted, but production must override)
- `AUTH_ACCESS_TOKEN_TTL_SECONDS` (default `900`, max `3600`)
- `AUTH_REFRESH_TOKEN_TTL_SECONDS` (default `604800`)
- `AUTH_JWT_ISSUER` / `AUTH_JWT_AUDIENCE`
- `AUTH_REFRESH_COOKIE_NAME`
- `AUTH_REFRESH_COOKIE_DOMAIN` (optional)
- `AUTH_REFRESH_COOKIE_PATH` (default `/api/auth`)
- `AUTH_REFRESH_COOKIE_SECURE` (`true` required in production)
- `AUTH_REFRESH_COOKIE_SAME_SITE` (`strict` | `lax` | `none`; `none` requires secure cookie)
- `AUTH_REFRESH_COOKIE_HTTP_ONLY` (default `true`)
- `MONGODB_URI` MongoDB connection URI used by app startup and seed script

## Included baseline

- Strict TypeScript config (`tsconfig.json` + build config)
- ESLint flat config + Prettier
- Zod-based environment validation
- Pino + pino-http structured logging
- Express middleware baseline with 404 and centralized error handling
- Modular-monolith baseline (`src/modules` + `src/shared`)
- Health endpoint at `GET /api/health`
- Auth foundation endpoints:
  - `POST /api/auth/login`
  - `POST /api/auth/refresh`
  - `POST /api/auth/logout`
  - `GET /api/auth/me` (protected)
  - Auth responses (`login`/`refresh`/`me`) now include `user.capabilities`,
    a server-derived permission list for role-based frontend UX.
  - `POST /api/auth/sessions/revoke` (protected, admin role)
  - No public registration endpoint is exposed
- User/role provisioning endpoints under `/api/v1`:
  - `GET /api/v1/users` (protected)
  - `GET /api/v1/users/:userId` (protected)
  - `POST /api/v1/users` (protected, admin role)
  - `PATCH /api/v1/users/:userId/role-status` (protected, admin role)
  - `POST /api/v1/users/:userId/deactivate` (protected, admin role)
  - `POST /api/v1/users/:userId/reactivate` (protected, admin role)

## OpenAPI / Swagger docs

- OpenAPI JSON: `GET /api/docs/openapi.json`
- Swagger UI: `GET /api/docs`
- Spec includes all implemented endpoint groups: auth, users, clinics, doctors,
  patients, orders/sub-orders, cases, billing, change-requests, scan-centers,
  reports, documents, notifications, settings, and health.
- Reporting includes `GET /api/v1/reports/sub-orders`, a tenant-scoped
  operational report for sub-order status, service throughput, overdue work,
  and priority breakdowns.
- Auth-protected routes declare `bearerAuth` (JWT) and admin-only operations
  include explicit role requirements in operation metadata/description.
- Tenant/user scope for `/api/v1/**` is derived from authenticated JWT claims,
  not from client-supplied tenant/user headers.
- Tenant-sensitive repositories and reporting/application services use the
  authenticated tenant scope for CRUD, pagination, relation checks, counts,
  and related-record name lookups. Document creation also verifies supplied
  doctor, patient, clinic, order, sub-order, and uploader references belong to
  the authenticated tenant.
- Non-admin doctor and clinic visibility remains governed by the existing
  authenticated data-scope rules; no new role restrictions were introduced.
- Doctor-scoped access now fails closed: non-admin users with doctor role must
  resolve to an active doctor profile in the authenticated tenant, otherwise
  the request is rejected with `403 FORBIDDEN`.
- Startup logging redacts MongoDB connection credentials; full `MONGODB_URI`
  values are not emitted to logs.
- Postman collection (all endpoints): `postman/Dental-SaaS-API.postman_collection.json`

See `docs/README.md` for architecture boundaries and dependency direction.
See `docs/audit-remediation-report.md` for the verified tenant-isolation
remediation, validation results, and remaining release concerns.

## Local Docker reproducibility

- `Dockerfile` provides `dev` and `runtime` targets.
- `docker-compose.yml` runs backend + MongoDB for local development.
- Runbook: `docs/dev-runbook.md`.

## Development login bootstrap

After running `npm run seed:dev`, sample data from
`dental-saas-backend/seed-data/*.json` is imported into MongoDB and development users are seeded with password `ChangeMe123!`:
- `dev-admin@example.test`
- `dev-tech@example.test`
- `dev-staff@example.test`
- `dev-manager@example.test`
- `dev-admin-tenant2@example.test`
- `dev-doctor-tenant2@example.test`

Seeded tenant ids for local multi-tenant verification:
- Tenant 1: `66f100000000000000000001`
- Tenant 2: `66f100000000000000000101`

The login endpoint validates `tenantId` + `email` together. To test tenant isolation, authenticate each tenant separately and verify that lists/details (including `/api/v1/change-requests`) do not leak records across tenant boundaries.

Seed files included by default:
- `clinics.json`
- `doctors.json`
- `patients.json`
- `scan-centers.json`
- `orders.json`
- `sub-orders.json`
- `cases.json`
- `billing.json`
- `change-requests.json`
- `documents.json`
- `notifications.json`
