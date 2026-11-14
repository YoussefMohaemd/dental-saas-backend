# Assistant Financial Tools Design

**Date:** 2026-11-08  
**Domain:** Software engineering (backend + assistant integration)  
**Requested outcome:** AI Assistant must return real financial reports (aggregation-based), not order listings.

## Intent and Why

The assistant currently routes many financial requests to `search_orders`, then renders order rows. This fails the core user intent: when the user asks for "profit/revenue", they want computed totals, comparisons, and period summaries.

This design adds dedicated financial read tools to the assistant backend so:
- financial calculations happen in backend aggregation code (authoritative data source),
- the LLM only interprets intent and presents returned values,
- financial report intent is clearly separated from order listing intent.

## Goals

1. Add dedicated assistant tools for financial reporting:
   - `get_financial_report`
   - `compare_financial_periods`
   - `get_financial_report_by_doctor`
2. Ensure financial requests use aggregation results, not `search_orders` listings.
3. Reuse and align with existing reports business logic and scope enforcement from:
   - `src/modules/reports/application/reports-service.ts`
   - `src/modules/reports/presentation/reports.routes.ts`
4. Preserve tenant scope, role/capability checks, and doctor/clinic visibility constraints.
5. Support period behavior:
   - default (unspecified): last completed month,
   - current month: month start -> now,
   - last month: full previous calendar month,
   - quarter/year requests: exact quarter date bounds,
   - period comparison: total A vs total B + delta + delta %.
6. Keep existing assistant capabilities/features stable (no regression in non-financial paths).

## Non-goals

- No frontend/UI redesign for chat, workflow cards, or report pages.
- No change to write tools (`create_*`, `update_*`) behavior.
- No replacement/removal of `search_orders` for legitimate order-listing requests.
- No broad reporting module rewrite outside what is needed for assistant financial tools.

## Anti-goals (failure conditions)

- Returning order lists when user asked for financial totals/comparisons.
- Letting LLM compute totals itself from row text.
- Bypassing existing authorization or tenant/data-visibility scope.
- Introducing a different revenue/profit definition than existing reports logic without explicit decision.

## Existing System Reality (reused surfaces)

1. Assistant tooling architecture already exists:
   - tool registry: `assistant/application/tool-registry.ts`
   - execution: `assistant/application/assistant-action-executor.ts`
   - formatting: `assistant/application/assistant-result-formatter.ts`
   - planner/system prompt: `assistant/application/assistant-service.ts`
2. Reports module already includes aggregation patterns and scoped filtering:
   - `buildScopedFilter(...)` in `reports-service.ts`
   - quarter and revenue-style summaries using `BillingRecordModel` and scoped data.
3. Current assistant financial behavior is biased toward `search_orders`, which produces item lists.

## Approaches considered

### Approach A — Dedicated assistant financial tools (selected)

Add new read-only tools + executor paths + result formatting backed by reports aggregation services.

**Pros**
- Clear separation between financial-report and order-list intents.
- Deterministic, testable financial outputs.
- Minimal changes to existing assistant architecture.

**Cons**
- Requires adding/expanding reports-service functions and assistant schemas.

### Approach B — Deterministic intent router before LLM

Bypass LLM planning for financial intents and execute reports directly.

**Pros**
- Very strict routing.

**Cons**
- Larger behavioral shift; more coupling in request path.
- Less flexible for mixed intents in one prompt.

### Approach C — Prompt-only constraints

Keep existing tools; only tighten instructions.

**Pros**
- Fast to ship.

**Cons**
- Not reliable enough; still can produce listing-shaped output.

**Chosen by user:** Approach A.

## Chosen Design

### 1) New assistant read tools

Add to `tool-registry.ts`:

- `get_financial_report`
  - Arguments (normalized schema):
    - `periodType`: `"last-complete-month" | "current-month-to-date" | "previous-month" | "quarter" | "custom-range"`
    - `year?`: number (required for quarter)
    - `quarter?`: 1|2|3|4 (required for quarter)
    - `from?` / `to?`: ISO date (required for custom-range)
    - `doctorId?`: string (optional filter; only when allowed by scope)
- `compare_financial_periods`
  - Arguments:
    - `left`: same period object shape as `get_financial_report`
    - `right`: same period object shape
    - `doctorId?`: optional
- `get_financial_report_by_doctor`
  - Arguments:
    - `doctorId`: string
    - `period`: period object shape as above

All are `read` operations requiring `reports.read`.

### 2) Reports aggregation service extension (single source of truth)

In `reports-service.ts`, add reusable aggregation helpers:

- Resolve period bounds (UTC-safe start/end) for:
  - last complete month,
  - current month to date,
  - previous month,
  - quarter+year,
  - custom range.
- Financial aggregate query returning:
  - `totalProfit` (aligned with existing reports revenue definition),
  - `totalOrders` (orders in period, scoped),
  - optional monthly breakdown for quarter/custom multi-month periods.
- Comparison aggregate wrapper returning:
  - period A total,
  - period B total,
  - `difference`,
  - `changePercent` (safe when baseline is zero).

Aggregation must execute in backend using MongoDB (`OrderModel` / `BillingRecordModel` as decided by existing reporting logic), with scope/tenant constraints applied.

### 3) Assistant action executor integration

In `assistant-action-executor.ts`:

- Add strict zod schemas for the 3 new tools.
- Route tool execution to reports-service aggregation functions.
- Return compact structured payloads for formatting.
- Add guard: if action tool is one of financial tools, never fallback to `search_orders`.

### 4) Result formatting for financial outputs

In `assistant-result-formatter.ts`:

- Add formatters for:
  - single financial report summary,
  - period comparison summary,
  - doctor-scoped financial summary.
- Prioritize:
  - `Total Profit`,
  - `Total Orders`,
  - concise breakdown/comparison metrics.
- Avoid row-level order dumps unless explicitly requested by order-detail intent/tool.

### 5) Prompt/system guidance updates

In `assistant-service.ts` system prompt:

- Add explicit instruction:
  - financial intents (`profit`, `revenue`, `أرباح`, `مقارنة أرباح`, quarter profit) must use financial tools.
  - `search_orders` is only for order lookup/listing requests.

In frontend workflow guardrails (`ai-chat.facade.ts`) keep existing report guardrails and align wording with the new backend financial tools.

## Authorization and Scope

- Tool capability: `reports.read`.
- Data visibility: preserve existing scope behavior (admin/doctor/technician/clinic constraints) by reusing scoped filter logic.
- Doctor-specific reports:
  - admins/managers/staff may request arbitrary `doctorId` within tenant,
  - doctor-scoped users can only access their own doctor scope,
  - unauthorized doctor access returns `403 Forbidden`.

## Data definition alignment

Financial totals must match current backend report semantics used by existing reports features. The implementation must reuse/centralize that logic, not create an assistant-only formula.

Confirmed decisions:
- Canonical financial source: `BillingRecordModel` amounts (primary), with orders used for order counts only.
- Metric definition for profit/revenue in assistant financial reports: `SUM(BillingRecord.amount)` over the resolved period.
- Period boundary timezone: `UTC`.

## Edge cases

- Zero-data period => totals zero with clear "no records in period" note.
- Comparison baseline zero => `changePercent = null` and textual explanation.
- Invalid quarter/year/date ranges => validation error with actionable message.
- Custom range with `from > to` => validation error.
- Time-zone boundaries handled consistently (UTC boundaries documented and tested).

## Testing Strategy

Add/extend tests in backend assistant + reports modules:

1. **reports-service tests**
   - period resolution (current month, previous month, last complete month, quarter),
   - aggregation totals with scoped filters,
   - comparison diff and percent including zero-baseline edge.
2. **assistant executor tests**
   - new tools parse/execute correctly,
   - malformed args rejected,
   - financial intents return structured aggregates.
3. **assistant hardening/behavior tests**
   - financial request plans invoke financial tools (not `search_orders`),
   - order-list request still allowed to use `search_orders`.
4. **authorization tests**
   - `reports.read` required,
   - doctor scope restrictions enforced.
5. **regression tests**
   - existing non-financial tools unaffected.

## What is left to the builder

- Exact internal function names and file-level extraction boundaries.
- Whether monthly breakdown is always returned or conditional by span length.
- Final wording/formatting details in assistant markdown output (while preserving required metric order).

## Implementation boundaries

- Backend + assistant integration only.
- No unrelated refactors.
- No frontend UI redesign.
- Preserve all current existing features.
