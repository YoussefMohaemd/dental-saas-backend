# Backend Architecture Baseline

This backend follows a **modular-monolith** baseline with strict layer boundaries.

## Layer conventions

Each feature module (`src/modules/<feature>`) is organized as:

- `domain/`: business concepts, invariants, and ports (no framework dependencies).
- `application/`: use-cases and orchestration over domain ports/types.
- `infrastructure/`: technical adapters (runtime, persistence, external systems).
- `presentation/`: HTTP controllers/routes and transport mapping.

Shared cross-cutting primitives live under `src/shared` with the same layered intent.

## Dependency direction

Allowed flow is inward:

`presentation -> application -> domain`

`infrastructure -> domain` (implements domain/application ports)

Rules:

- Domain must not import application, infrastructure, or presentation code.
- Application must not import presentation or infrastructure implementations.
- Presentation can import application contracts/use-cases and shared transport helpers.
- Infrastructure can depend on framework/libraries but should expose domain/application ports.

## Shared baseline primitives

- **Error taxonomy + mapping**
  - `src/shared/domain/errors/domain-error.ts`
  - `src/shared/application/errors/application-error.ts`
  - `src/shared/presentation/http/error-mapping.ts`
- **Pagination/query contracts**
  - `src/shared/application/contracts/pagination.ts`
  - `src/shared/application/contracts/query.ts`
- **Frontend-derived API contract baseline**
  - `docs/api-contract.md`
  - `src/shared/application/contracts/dental-api-contract.ts`
- **MongoDB persistence data model baseline**
  - `docs/data-model.md`
  - `src/shared/domain/entities/dental-data-model.ts`
  - `src/shared/infrastructure/persistence/mongoose/**`
- **Authenticated request context typing**
  - `src/shared/presentation/http/request-context.ts`
- **Consistent API envelopes**
  - `src/shared/presentation/http/api-response.ts`

## Implemented feature example

`health` is wired as a reference module:

- `src/modules/health/domain`
- `src/modules/health/application`
- `src/modules/health/infrastructure`
- `src/modules/health/presentation`

## Supporting feature modules (v1)

The following additional route groups are now wired under `/api/v1` with
validated request schemas, envelope-consistent responses, and pagination/filter
support where applicable:

- `cases`
- `orders` / `sub-orders`
- `billing`
- `change-requests`
- `scan-centers`
- `dashboard` / `reports` aggregate endpoints
- `documents`
- `notifications`
- `settings/reference-data` (settings-backed supporting datasets)
- `users` (admin-controlled user provisioning and role/status management)

## Operations and reproducibility

- Local Docker/dev setup and validation commands: `docs/dev-runbook.md`

## API documentation

- OpenAPI document generation is centralized in `src/docs/openapi.ts`.
- Express docs routes are exposed from `src/docs/openapi.routes.ts`.
- Runtime docs endpoints:
  - `GET /api/docs/openapi.json`
  - `GET /api/docs`
