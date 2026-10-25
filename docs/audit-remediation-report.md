# Dental SaaS Audit and Remediation Report

## Scope

This audit covered the Angular frontend and the Node.js/Express/MongoDB backend.
The remediation focused on authenticated tenant isolation, API contract
compatibility, removal of client-side business mocks, security hardening, and
regression coverage. No AI integration, destructive database operation,
commit, or push was performed.

## Verified findings and fixes

### Tenant isolation

- The backend previously used a single default tenant identifier in the
  clinics, doctors, patients, and orders repositories.
- `DataVisibilityScope` now carries the trusted tenant identifier derived from
  the authenticated principal.
- Tenant scope is propagated through clinic, doctor, patient, order, and
  sub-order CRUD, pagination, counts, uniqueness checks, relation validation,
  and name lookups.
- Case, billing, change-request, and document related-record lookups now also
  include the authenticated tenant when enriching response DTOs.
- Document creation validates doctor, patient, clinic, order, and sub-order
  references against the authenticated tenant and derives `uploadedBy` from
  the authenticated user instead of trusting a client-supplied uploader.
- No `DEFAULT_TENANT_ID` references remain under backend `src`.
- Client-supplied `x-tenant-id` and `x-user-id` headers remain compatibility
  headers only; authorization uses the authenticated JWT/database scope.

### Authentication and authorization

- The existing `/api/v1` router-level authentication boundary was preserved.
- JWT claims are still checked against active database users and tenant IDs.
- A concrete role matrix is now enforced at write endpoints:
  - `admin` + `staff`: clinic/doctor lifecycle, order deletion, billing updates,
    and user listing.
  - `admin` only: user creation, role/status change, deactivate/reactivate.
  - `doctor`: order create/update, patient create/update, sub-order create/update.
  - `technician`: sub-order progress updates and case creation, without access to
    privileged master-data writes.
- Read endpoints remain tenant-scoped and available to authenticated roles.

### Frontend API contracts and tests

- Dashboard, reports, documents, login, reports-component, and order-detail
  tests were migrated from retired JSON fixtures to the current API/service
  contracts.
- The complete frontend browser suite passes: 393/393 tests.
- The frontend production build and type/lint checks pass.

### API coverage migration

- Sub-order forms, scan metadata, and activity notes are now persisted with
  the tenant-scoped sub-order document instead of remaining browser-only state.
  Local file selection remains metadata-only until a dedicated object-storage
  upload flow is approved; browser `File` objects are never treated as server
  persistence.
- Added `GET /api/v1/reports/sub-orders`, including tenant/role visibility,
  service filtering, date filtering, status summaries, completion rates,
  overdue work, and priority breakdowns.
- Added the Angular sub-order report page and linked it from the reports hub.
- Change-request status actions now call the existing authenticated backend
  endpoint instead of updating only the local signal.
- The existing dashboard, overview reports, order-range report, quarterly
  reporting source, team performance, CRUD screens, document/billing/case
  screens, and scan-center references are API-backed and tenant-scoped.
- Document deletion and metadata creation now call the backend rather than
  mutating browser-only state. Binary object storage is intentionally not
  claimed by the metadata endpoint.
- Doctor-scope enforcement for order writes now applies to relation validation
  (`patientId`, `doctorId`, `clinicId`) so doctor users cannot create or update
  orders for another doctor by manually submitting foreign identifiers.
- Grid and Forms are retained as explicitly local design/POC surfaces; they do
  not represent persisted business workflows and were not given speculative
  backend APIs.
- Settings profile/password access and user appearance, density, notification,
  and language preferences are API-backed and stored per authenticated
  tenant/user. Profile and organization administration remains governed by
  the user-management workflow. Scan-center reference settings are
  tenant-scoped MongoDB data.

### Security hardening

- Requests with a non-configured CORS origin are rejected with `403` instead
  of being allowed through without CORS headers.
- Login requests have an in-process IP-based rate limit and return `429` with
  `Retry-After` after repeated attempts. A shared/distributed limiter is still
  required for multi-instance deployments.
- Request IDs are accepted only when they match a bounded safe character set
  and length, preventing arbitrary header content from being reflected in API
  metadata.

## Validation

### Backend

All final backend checks passed:

- `npm run typecheck`
- `npm run lint`
- `npm test -- --reporter=dot` — 3 files, 11 tests passed
- `npm run build`

### Frontend

All final frontend checks passed:

- `npm run type-check`
- `npm run lint`
- `npm run build`
- `npm test -- --watch=false --browsers=ChromeHeadless` — 393 tests passed

## Remaining concerns

1. Business rules for which roles may create clinics, doctors, patients,
   orders, or assign technicians remain unspecified and were intentionally not
   changed.
2. The frontend production build uses same-origin `/api`; production must
   route that path to the backend. Development uses the Angular proxy.
3. A shared/distributed login rate limiter is required when running multiple
   backend instances.
4. Authentication access tokens remain in memory/session storage for the active
   browser session; refresh tokens use an HttpOnly cookie. The application
   should continue to enforce CSP and XSS controls at deployment.
5. Actual scan binary upload/download needs a storage contract, virus scanning
   policy, and retention rules before it can be connected to the API. The
   current document and sub-order integrations deliberately persist only file
   metadata.

## Future AI readiness

No AI feature or provider was added. The authenticated tenant scope and
service/repository boundaries provide the isolation primitives required for
future tenant-aware automation. Before implementation, AI commands must derive
tenant/user/doctor scope from the authenticated request, reject scope supplied
only by model output, validate all referenced relations server-side, require
confirmation for writes/deletes, and emit audit events.
