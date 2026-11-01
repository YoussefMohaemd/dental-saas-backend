# Dental AI Assistant Full Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a production-ready, secure Dental SaaS assistant that uses existing backend business services with strict authorization, tenant isolation, and hard delete denial.

**Architecture:** Keep assistant logic isolated in `src/modules/assistant` and route all operations through existing backend application services. LLM inference stays externalized behind a provider interface (vLLM in production, mock in tests). Security controls remain backend-enforced at planning, authorization, confirmation, and execution layers.

**Tech Stack:** Node.js, TypeScript, Express 5, Mongoose, Zod, Vitest, vLLM, Qwen3.5-9B

**Spec:** `docs/superpowers/specs/2026-11-01-dental-ai-assistant-audit-and-design.md`

## Global Constraints

- Never trust `tenantId`, `userId`, roles, capabilities, or scope coming from Angular or LLM output.
- Assistant must never execute delete operations, even when user has delete capability.
- Keep LLM isolated from direct database access and direct arbitrary endpoint selection.
- Use allowlisted tools only; no generic CRUD, no generic HTTP tool, no direct Mongoose business queries in assistant service.
- Keep Angular UI/design unchanged; backend returns structured result payloads only.
- Pin runtime/model versions; no floating `latest` usage for production critical components.

## Review Focus

- Prompt injection carrying fake tool instructions must not bypass allowlist or capability checks.
- Cross-tenant conversation or pending-action access must always return a safe denial/not-found.
- Confirmation replay with reused token must fail after one successful confirmation.
- Multi-action dependency failure must not produce success-shaped responses.
- Oversized user input must be rejected deterministically before provider invocation.

---

### Task 1: Complete Read-Only Tool Execution Pipeline (Phase 3)

**Files:**
- Modify: `src/modules/assistant/application/assistant-service.ts`
- Create: `src/modules/assistant/application/action-executor.ts`
- Create: `src/modules/assistant/application/tool-handlers/*.ts`
- Test: `src/modules/assistant/application/action-executor.test.ts`

**Interfaces:**
- Consumes: `ActionPlanner.validatePlan(plan)`, `PermissionGuard.assertCapabilities(...)`, `AssistantToolRegistry.get(name)`
- Produces: `ActionExecutor.executeReadActions(...) -> { results, partialFailures }`

- [ ] **Step 1: Write failing tests for read-only execution and partial failures**

```ts
it('executes read actions through allowlisted handlers only', async () => {
  const result = await executor.executeReadActions(...);
  expect(result.results).toHaveLength(2);
});
```

- [ ] **Step 2: Run assistant execution tests and verify RED**

Run: `npm run test -- src/modules/assistant/application/action-executor.test.ts`  
Expected: FAIL with missing executor/handler behavior

- [ ] **Step 3: Implement `ActionExecutor` and handler mapping**

Implement:
- `executeReadActions(actions, context): Promise<ExecutionResult>`
- explicit per-tool handler dispatch
- partial failure aggregation without success spoofing

- [ ] **Step 4: Re-run execution tests and verify GREEN**

Run: `npm run test -- src/modules/assistant/application/action-executor.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/assistant/application src/modules/assistant/application/*.test.ts
git commit -m "feat(assistant): add read-only action executor"
```

### Task 2: Integrate Existing Business Services per Tool

**Files:**
- Modify: `src/modules/orders/application/orders-service.ts`
- Modify: `src/modules/reports/application/reports-service.ts`
- Modify: `src/modules/patients/application/patient-service.ts`
- Create: `src/modules/assistant/application/tool-handlers/business-services-handler.ts`
- Test: `src/modules/assistant/application/tool-handlers/business-services-handler.test.ts`

**Interfaces:**
- Consumes: existing services and DTO contracts from `shared/application/contracts/dental-api-contract.ts`
- Produces: structured assistant tool result objects for read-only flows

- [ ] **Step 1: Write failing tests for order/report/patient handler output contracts**
- [ ] **Step 2: Run tool-handler tests and verify RED**

Run: `npm run test -- src/modules/assistant/application/tool-handlers/business-services-handler.test.ts`  
Expected: FAIL on unresolved service mapping

- [ ] **Step 3: Implement handler adapter to existing services without direct DB querying**
- [ ] **Step 4: Re-run tests and verify GREEN**

Run: `npm run test -- src/modules/assistant/application/tool-handlers/business-services-handler.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/assistant/application/tool-handlers src/modules/*/application
git commit -m "feat(assistant): wire read tools to existing business services"
```

### Task 3: Implement Write Confirmation Execution (Phase 4)

**Files:**
- Modify: `src/modules/assistant/application/assistant-service.ts`
- Modify: `src/modules/assistant/application/confirmation-service.ts`
- Create: `src/modules/assistant/application/write-executor.ts`
- Test: `src/modules/assistant/application/write-executor.test.ts`

**Interfaces:**
- Consumes: pending action repository and confirmed payload
- Produces: one-time confirmed write execution with idempotency and scope revalidation

- [ ] **Step 1: Write failing tests for one-time confirmation and replay denial**
- [ ] **Step 2: Run write-executor tests and verify RED**

Run: `npm run test -- src/modules/assistant/application/write-executor.test.ts`  
Expected: FAIL with confirmation replay or missing revalidation

- [ ] **Step 3: Implement `WriteExecutor.executeConfirmedAction(...)` with per-tool revalidation**
- [ ] **Step 4: Re-run tests and verify GREEN**

Run: `npm run test -- src/modules/assistant/application/write-executor.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/assistant/application
git commit -m "feat(assistant): execute confirmed write actions safely"
```

### Task 4: Frontend API Integration without UI Redesign (Phase 6)

**Files:**
- Modify: `../Dental SaaS Web Application with Angular/src/app/core/enum/api.endpoint.ts`
- Create: `../Dental SaaS Web Application with Angular/src/app/core/services/assistant-data.service.ts`
- Modify: `../Dental SaaS Web Application with Angular/src/app/features/ai/state/ai-chat.facade.ts`
- Test: `../Dental SaaS Web Application with Angular/src/app/features/ai/state/ai-chat.facade.spec.ts`

**Interfaces:**
- Consumes: `/api/v1/assistant/*` endpoints
- Produces: live assistant conversation state from backend responses

- [ ] **Step 1: Write failing frontend tests for API-driven conversation flow**
- [ ] **Step 2: Run targeted frontend AI state tests and verify RED**

Run: `npm --prefix "../Dental SaaS Web Application with Angular" run test -- --watch=false --include src/app/features/ai/state/ai-chat.facade.spec.ts`  
Expected: FAIL due missing assistant API wiring

- [ ] **Step 3: Implement assistant data service and facade integration (no UI structure/style changes)**
- [ ] **Step 4: Re-run frontend AI tests and verify GREEN**

Run: `npm --prefix "../Dental SaaS Web Application with Angular" run test -- --watch=false --include src/app/features/ai/state/ai-chat.facade.spec.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ../Dental\ SaaS\ Web\ Application\ with\ Angular/src/app/core ../Dental\ SaaS\ Web\ Application\ with\ Angular/src/app/features/ai
git commit -m "feat(frontend): integrate ai facade with assistant backend contracts"
```

### Task 5: Security, Performance, and Ops Hardening (Phase 7-8)

**Files:**
- Modify: `src/modules/assistant/application/assistant-service.ts`
- Modify: `src/config/env.ts`
- Create: `src/modules/assistant/application/rate-limit-guard.ts`
- Create: `docs/assistant/production-readiness.md`
- Test: `src/modules/assistant/application/security-regression.test.ts`

**Interfaces:**
- Consumes: assistant request context and per-user/per-tenant limits
- Produces: bounded assistant execution with deterministic 429/timeout behavior

- [ ] **Step 1: Write failing security tests for abuse limits, injection attempts, and confirmation replay**
- [ ] **Step 2: Run security regression suite and verify RED**

Run: `npm run test -- src/modules/assistant/application/security-regression.test.ts`  
Expected: FAIL for unimplemented limits/protections

- [ ] **Step 3: Implement rate and execution bounds with explicit error responses**
- [ ] **Step 4: Re-run security tests and verify GREEN**

Run: `npm run test -- src/modules/assistant/application/security-regression.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/assistant src/config/env.ts docs/assistant/production-readiness.md
git commit -m "feat(assistant): add security and runtime hardening gates"
```

### Task 6: Final Validation and Release Gate

**Files:**
- Modify: `docs/superpowers/specs/2026-11-01-dental-ai-assistant-audit-and-design.md`
- Modify: `README.md`
- Test: `src/tests/api.integration.test.ts`

**Interfaces:**
- Consumes: full assistant module behavior
- Produces: documented release decision with explicit remaining risks

- [ ] **Step 1: Add failing acceptance checklist test rows for all critical assistant criteria**
- [ ] **Step 2: Run full backend suite and verify RED/GREEN loop per failures**

Run: `npm test`  
Expected: PASS for all assistant and existing guarded suites; any failure documented by name.

- [ ] **Step 3: Run backend lint + typecheck + build**

Run: `npm run lint && npm run typecheck && npm run build`  
Expected: PASS or explicitly documented pre-existing blocker with unaffected assistant scope.

- [ ] **Step 4: Update production readiness docs with final evidence paths**
- [ ] **Step 5: Commit**

```bash
git add README.md docs/superpowers/specs/2026-11-01-dental-ai-assistant-audit-and-design.md
git commit -m "docs(assistant): finalize validation and production readiness evidence"
```
