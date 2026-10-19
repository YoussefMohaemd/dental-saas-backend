# MongoDB Data Model Notes

This project now includes Mongoose persistence definitions under:

- `src/shared/infrastructure/persistence/mongoose/models`
- Shared schema helpers: `src/shared/infrastructure/persistence/mongoose/shared-schema.ts`
- Registry/bootstrap: `src/shared/infrastructure/persistence/mongoose/models/index.ts`

## Relationship decisions

- Every business collection is tenant-scoped via `tenantId`.
- Core operational chain:
  - `orders` -> `patients`, `doctors`, `clinics`
  - `subOrders` -> `orders`
  - `changeRequests` -> `orders`, `users` (requester/assignee)
  - `billingRecords` -> `orders`, `patients`, `doctors`, `clinics`
  - `documents` can link to `orders`, `subOrders`, `patients`, `doctors`, `clinics`
  - `notifications` target `users` and can carry optional `relatedId` metadata
  - `cases` align with patient/doctor/clinic and operational priority/status tracking

## Indexing decisions

### Unique indexes (true uniqueness)

- `users`: `{ tenantId, email }`
- `clinics`: `{ tenantId, name }`
- `doctors`: `{ tenantId, email }`
- `doctors`: sparse `{ tenantId, lookupId }` (optional external lookup)
- `orders`: `{ tenantId, orderNumber }`
- `cases`: `{ tenantId, caseNumber }`
- `changeRequests`: `{ tenantId, requestNumber }`
- `billingRecords`: `{ tenantId, orderId }` (single billing record per order)
- `billingRecords`: sparse `{ tenantId, invoiceNumber }` (invoice number unique when present)

### Query-support indexes

- `orders`: status/priority/due-date, patient timeline, clinic recent updates, technician work queues
- `subOrders`: order+status and due-date priority queues
- `patients`: clinic/doctor lookup and recent visit filtering
- `doctors`: clinic/status lookup
- `notifications`: recipient unread feed and type history
- `documents`: category timeline, patient timeline, and order/sub-order fetches
- `cases`: workflow board + patient timeline
- `changeRequests`: order history and status board
- `billingRecords`: due-date and payment-state filtering

These choices are aligned with the frontend contract query patterns and expected operational dashboards.
