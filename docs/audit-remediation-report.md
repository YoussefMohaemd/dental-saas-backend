# Dental SaaS Audit and Remediation Report

## Scope

This audit covered the Angular frontend and the Node.js/Express/MongoDB backend.
The remediation focused on authenticated tenant isolation, API contract
compatibility, and regression coverage. No AI integration, destructive database
operation, commit, or push was performed.

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
- Document creation validates doctor, patient, clinic, order, sub-order, and
  uploader references against the authenticated tenant.
- No `DEFAULT_TENANT_ID` references remain under backend `src`.
- Client-supplied `x-tenant-id` and `x-user-id` headers remain compatibility
  headers only; authorization uses the authenticated JWT/database scope.

### Authentication and authorization

- The existing `/api/v1` router-level authentication boundary was preserved.
- JWT claims are still checked against active database users and tenant IDs.
- Existing doctor/clinic visibility behavior was preserved; no new role
  restrictions were invented.

### Frontend API contracts and tests

- Document, auth-guard, header logout, and billing test fixtures were updated
  to match the current API-backed services and authentication state.
- The focused frontend regression set passes.
- The frontend production build continues to pass.

## Validation

### Backend

All final backend checks passed:

- `npm run typecheck`
- `npm run lint`
- `npm test -- --reporter=dot` — 3 files, 11 tests passed
- `npm run build`

### Frontend

Passed:

- `npm run type-check`
- `npm run lint`
- `npm run build`
- Focused updated regression set — 25 tests passed

The full frontend suite currently reports **370 passed and 22 failed**. The
remaining failures are pre-existing fixture/contract drift in dashboard,
reports, login, view-order, and reports-component tests. They still expect
retired static JSON fixtures or pre-authentication login defaults; they do not
indicate a failure in the tenant-scope remediation. The failing suites should
be migrated to the current API-backed services in a separate frontend test
modernization pass.

## Remaining concerns

1. Frontend environment files still target `http://localhost:3000/api` for
   production-oriented builds. Deployment-specific API configuration should be
   supplied before production release.
2. Scan-center and settings data are currently in-memory reference data and
   are not tenant-specific. They are authenticated but should move to
   tenant-scoped persistence before multi-tenant production use.
3. Business rules for which roles may create clinics, doctors, patients,
   orders, or assign technicians remain unspecified and were intentionally not
   changed.
4. The remaining frontend test failures should be resolved before treating
   the frontend suite as a release gate.
5. Authentication token persistence still supports browser storage for
   “remember me”; deployment hardening should assess the application's XSS
   controls and preferred refresh-token storage policy.

## Future AI readiness

No AI feature or provider was added. The authenticated tenant scope and
service/repository boundaries provide the isolation primitives required for
future tenant-aware automation, subject to explicit product authorization and
audit requirements.
