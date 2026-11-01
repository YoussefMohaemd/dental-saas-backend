# Dental AI Assistant Audit & Design (Phase 0-2)

**Date:** 2026-11-01  
**Scope:** Backend + Frontend audit, architecture, Qwen/vLLM production hosting baseline, and implementation kickoff

## 1) Current repository reality

### Backend (`dental-saas-backend`)

What already exists and is reusable:
- Central authentication + request principal (`auth.middleware.ts`, `request-context.ts`).
- Capability model and role resolution (`authorization-policy.ts`).
- Tenant/doctor/clinic scoping helpers (`http-utils.ts` + scoped repositories/services).
- Mature module boundaries: `presentation -> application -> domain -> infrastructure`.
- Existing business services for Orders, Sub-orders, Patients, Cases, Reports, Billing.
- Central error handling and response envelopes.

What was missing before this phase:
- No backend assistant module.
- No backend conversation/pending-action/audit persistence for assistant.
- No LLM provider abstraction or vLLM adapter.
- No assistant-specific API contract endpoints.
- No production inference deployment package for Qwen3.5-9B.

### Frontend (`Dental SaaS Web Application with Angular`)

What already exists and is reusable:
- Dedicated AI page and reusable chat UI components.
- Capability-aware quick actions and state management.
- Existing authenticated API infrastructure (`ApiEndpoint`, interceptors, auth service).

Current gap:
- AI chat is currently mock-driven in the facade.
- No backend assistant integration service yet.

## 2) Security and architecture risks found

1. **Assistant backend missing entirely** (high): current AI UX can imply capability checks but has no server-side assistant enforcement path yet.
2. **Delete protection not centralized for assistant** (critical for this feature): existing platform allows delete for some roles; assistant-specific hard deny needed in backend code path.
3. **No assistant confirmation workflow** (high): write-like intent lacked pending action + user/tenant-bound token enforcement.
4. **No assistant audit trail** (medium): no assistant-specific event lineage for prompts/plans/confirmations.
5. **No isolated model deployment package** (high): no pinned vLLM + Qwen runtime profile for production.

## 3) Qwen3.5-9B + vLLM compatibility review

Evidence used:
- Qwen official recipe: `https://recipes.vllm.ai/Qwen/Qwen3.5-9B`
- vLLM online serving docs: `https://docs.vllm.ai/en/stable/serving/online_serving/`
- Hugging Face model metadata API for `Qwen/Qwen3.5-9B` (Apache-2.0 tag)

Findings:
- vLLM compatibility baseline is documented with **vLLM >= 0.17.0**.
- Official Qwen recipe includes the required parser flags:
  - `--enable-auto-tool-choice`
  - `--tool-call-parser qwen3_coder`
  - `--reasoning-parser qwen3`
- OpenAI-compatible APIs and `/health` are supported by vLLM serving.
- Model licensing is compatible with Apache-2.0 usage.

## 4) Production GPU sizing baseline (phase-0 estimate)

From official recipe baseline:
- Qwen3.5-9B fits single **24 GB GPU** for initial serving profile.

Recommended baseline tiers (must be validated by domain load tests before go-live):
- **Tier A (staging / low concurrency):** 1x 24 GB GPU (A10G/L4/RTX4090), max model len 8k, bounded seqs.
- **Tier B (production default):** 1x 48 GB GPU (L40S/A6000-class) for safer concurrency headroom + larger KV cache envelope.
- **Tier C (high concurrency):** 2x 80 GB GPUs with tensor-parallel rollout and queue controls.

Important note:
- This repository currently lacks live GPU benchmarking in CI; these are deployment starting points, not final SLO-validated capacity.

## 5) Deployment architecture (designed)

Angular UI -> Node API (`/api/v1/assistant/*`) -> Internal Assistant Module -> vLLM private endpoint -> (planned phase-3+) allowlisted business tool execution via existing application services -> MongoDB.

New deployment package added:
- `deploy/ai-inference/docker-compose.yml`
- `deploy/ai-inference/README.md`

## 6) Implementation status started in this branch (Phase 1 + 2 kickoff)

Implemented now:
- `src/modules/assistant` foundation with modular boundaries.
- Allowlisted tool registry with explicit no-delete surface.
- Permission guard with `all` vs `any` capability matching support.
- Action planner validation (unknown/invalid/cyclic/delete-blocking constraints).
- Prompt catalog service with capability-filtered suggestions.
- Conversation + pending action + audit models and repositories.
- LLM provider abstraction + mock provider + vLLM provider adapter.
- Assistant API routes:
  - `GET /api/v1/assistant/suggestions`
  - `POST /api/v1/assistant/conversations`
  - `GET /api/v1/assistant/conversations/:id`
  - `POST /api/v1/assistant/conversations/:id/messages`
  - `POST /api/v1/assistant/actions/:id/confirm`
- Assistant test coverage added (unit + integration security checks for unauthenticated/spoofed access).

Not finished yet (intentional for next phases):
- Real business tool execution for read-only assistant responses (phase 3).
- Write execution after confirmation against existing services (phase 4).
- Frontend live API integration replacing mock facade logic (phase 6).
- Distributed rate limiting and full observability dashboards (phase 7).
