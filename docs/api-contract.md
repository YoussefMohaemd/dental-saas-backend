# Dental SaaS API Contract (Derived from Frontend)

This contract is derived from Angular route/service/model behavior under:

- `Dental SaaS Web Application with Angular/src/app`
- `Dental SaaS Web Application with Angular/public/data`

It defines the backend-facing API expected by the current frontend workflows.

## 1) Envelope & transport conventions

- Base URL: `/api/v1`
- JSON over HTTPS.
- Success envelope:
  - `200/201`: `{ "data": ..., "meta"?: { "requestId"?: string, "pagination"?: { ... } } }`
  - `204`: empty body
- Error envelope:
  - `4xx/5xx`: `{ "error": { "code": string, "message": string, "details"?: object }, "meta"?: { "requestId"?: string } }`
- Correlation:
  - Client may send `x-request-id`.
  - Server echoes request id in response meta when available.

## 2) Auth & authorization expectations

Frontend auth behavior:

- Login page writes `dentalab-auth` and `dentalab-auth-token` in browser storage.
- Guard blocks all non-login routes when `dentalab-auth` is missing.
- HTTP interceptor sends `Authorization: Bearer <token>` when token exists.

Expected backend contract:

- `POST /auth/login` (public) returns access token + principal.
- All `/api/v1/**` (except health/login) require bearer auth.
- Role-based checks by endpoint group:
  - **Read operations**: `admin`, `ops`, `technician`, `billing`, `support` as applicable.
  - **Workflow transitions / status changes**: `admin`, `ops`, `technician`.
  - **Billing updates**: `admin`, `billing`.
  - **Reference-data write operations (doctor/clinic/patient management)**: `admin`, `ops`.

## 3) Query conventions (search/filter/sort/pagination)

Canonical list query params:

- `search` (string; case-insensitive contains match over resource-defined fields)
- `page` (1-based, default `1`)
- `pageSize` (default `20`, max `100`)
- `sortBy` (resource field)
- `sortDirection` (`asc` | `desc`)

Resource-level filters:

- Orders: `status[]`, `duration` (`today|week|month|2-months|3-months|6-months`), `service[]`
- Cases: `status[]`
- Patients/Doctors/Clinics: `status[]` (`Active|Inactive`)
- Doctors: `clinicId`
- Change requests: `status[]`, `priority[]`
- Billing: `status[]`, `dateFrom`, `dateTo`
- Documents: `category[]`
- Notifications: `type[]`, `read` (boolean)
- Reports range: `from`, `to`

Pagination response:

```json
{
  "meta": {
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "totalItems": 64,
      "totalPages": 4
    }
  }
}
```

## 4) Endpoint groups and DTOs

## 4.1 Health

- `GET /health` -> runtime + app health snapshot.

## 4.2 Auth

- `POST /auth/login`
  - Request: `{ email, password, rememberMe? }`
  - Response: `{ accessToken, tokenType: "Bearer", principal: { userId, tenantId, roles[] } }`

## 4.3 Orders & workflow

- `GET /orders` (list with query conventions)
- `POST /orders` (create order)
- `GET /orders/{orderId}`
- `PATCH /orders/{orderId}` (partial update: status/priority/notes/billing fields/etc.; status updates enforce workflow transition rules)
- `DELETE /orders/{orderId}`
- `POST /orders/{orderId}/workflow-transitions`
  - Request: `{ toStatus, mode?: "strict"|"override", reason?: string }`
- `GET /orders/{orderId}/sub-orders`
- `PUT /orders/{orderId}/sub-orders` (replace full set from create-order wizard)
- `POST /orders/{orderId}/sub-orders` (append services)

Core `Order` fields:

- `id, orderNumber, patientId, patientName, doctorId, doctorName, clinicId, clinicName`
- `scanCenterId, scanCenterName`
- `status, priority, restoration, arch, format, shade`
- `units, amount, billed, billedAmount?, billTo, vouchers`
- `isLocked, hasNotes, notes`
- `archiveDate?, receivedAt, sentAt?, updatedAt, chargedAt?, dueDate`
- `changeRequest?, csTask?, technicianId?, technicianName?`
- `creationData?` (service-level wizard details)

## 4.4 Sub-orders

- `GET /sub-orders/{subOrderId}`
- `GET /sub-orders/{subOrderId}/detail`
- `PUT /sub-orders/{subOrderId}/forms/{formId}` (save form payload/context)
- `PUT /sub-orders/{subOrderId}/scans/{scanId}/files` (selected/uploaded files)
- `POST /sub-orders/{subOrderId}/activity-notes`

Core sub-order summary:

- `id, orderId, service, icon, status, priority, dueDate, notes`
- `formsComplete/formsTotal`, `scansComplete/scansTotal`, `teeth[]`, `creationData?`

## 4.5 Cases / Patients / Doctors / Clinics / Scan centers

- `GET /cases`, `GET /cases/{caseId}`
- `GET /patients`, `GET /patients/{patientId}`, `POST /patients`, `PATCH /patients/{patientId}`, `DELETE /patients/{patientId}`
- `GET /doctors`, `GET /doctors/{doctorId}`, `POST /doctors`, `PATCH /doctors/{doctorId}`, `DELETE /doctors/{doctorId}`
- `GET /clinics`, `GET /clinics/{clinicId}`, `POST /clinics`, `PATCH /clinics/{clinicId}`, `DELETE /clinics/{clinicId}`
- `GET /scan-centers`, `GET /scan-centers/{scanCenterId}`

Business linkage constraints:

- Doctor `clinicId` must reference an existing clinic.
- Patient `doctorId` and `clinicId` must both exist and match (`doctor.clinicId === patient.clinicId`).
- Clinics/Doctors cannot be deleted while linked entities remain.

## 4.6 Change requests

- `GET /change-requests`
- `GET /change-requests/{requestId}`
- `PATCH /change-requests/{requestId}/status`
  - Request: `{ status: "Approved" | "Rejected" | "In Review" | "Completed", note? }`

## 4.7 Billing

- `GET /billing`
- `GET /billing/{recordId}`
- `PATCH /billing/{recordId}` (status/invoice metadata/payment dates)

## 4.8 Documents

- `GET /documents`
- `GET /documents/{documentId}`
- `POST /documents` (upload metadata + storage reference)
- `DELETE /documents/{documentId}`

## 4.9 Notifications

- `GET /notifications`
- `POST /notifications/{notificationId}/read`
- `POST /notifications/read-all`

## 4.10 Reporting / analytics

- `GET /dashboard/volume` (`{ weeks: VolumeWeek[] }`)
- `GET /reports/overview` (monthly revenue, restoration breakdown, turnaround, workflow share)
- `GET /reports/seed` (reporting seed metadata for archive/quarter/team derived views)
- `GET /reports/orders-range` (archive-like records; supports `from`, `to`, `search`)
- `GET /reports/quarterly-targets?year=YYYY`
- `GET /reports/quarterly-targets/{year}/{quarter}`
- `GET /reports/team-performance`

## 5) Workflow transition semantics

Order status flow:

`New -> Review -> Design -> Production -> Quality Check -> Ready -> Completed`

Terminal/exception:

- `Cancelled` is terminal.

Transition rules:

- `PATCH /orders/{orderId}` status transitions use strict server-side rules.
- Allowed forward transitions:
  - `New -> Review`
  - `Review -> Design`
  - `Design -> Production`
  - `Production -> Quality Check`
  - `Quality Check -> Ready`
  - `Ready -> Completed`
- `Cancelled` is allowed from any non-terminal status.
- Backend rejects no-op transitions (`toStatus === currentStatus`) with `409`.
- Backend enforces compare-and-set semantics on status changes; if another write changes the current status before `PATCH /orders/{orderId}` is applied, the API returns `409` with the current/requested statuses.
- Backend rejects invalid jumps with `422` and includes allowed next statuses in error details.
- Backend should write transition audit metadata (`from`, `to`, `actor`, `at`, `reason?`).

Sub-order derived status semantics:

- `pending`: no required forms/scans completed.
- `in-progress`: partial completion.
- `done`: all required forms/scans complete.
- `blocked`: explicit manual block (reason should be stored).

## 6) Source-of-truth DTO/types

Backend shared contracts were added at:

- `src/shared/application/contracts/dental-api-contract.ts`

These types should be reused by new module application/presentation layers to keep implementation aligned with this contract.
