# AI Inference Deployment (Qwen3.5-9B + vLLM)

This deployment package provisions a private vLLM server for the Dental SaaS assistant backend.

## Security boundaries

- The inference service is exposed only on an internal Docker network (`assistant-private`).
- Browser clients must never connect to inference directly.
- Backend calls vLLM through private connectivity and validates authorization before every tool operation.

## Runtime assumptions

- Linux host with NVIDIA drivers + NVIDIA Container Toolkit.
- Docker Engine with Compose plugin.
- Persistent storage mounted for Hugging Face model cache (`hf-cache` volume).

## Launch

```bash
cd deploy/ai-inference
docker compose up -d
```

## Required environment

- `HUGGING_FACE_HUB_TOKEN` (optional for gated/private model pulls).
- `VLLM_MAX_MODEL_LEN` default `8192`.
- `VLLM_GPU_MEMORY_UTILIZATION` default `0.9`.
- `VLLM_MAX_NUM_SEQS` default `16`.

## vLLM arguments required by Qwen tool-calling profile

- `--enable-auto-tool-choice`
- `--tool-call-parser qwen3_coder`
- `--reasoning-parser qwen3`

## Health and readiness

- Liveness endpoint: `GET /health`
- Metrics endpoint: `GET /metrics`
- OpenAI-compatible endpoints: `/v1/chat/completions`, `/v1/responses`, `/v1/models`

## Version pinning

- Image pinned to `vllm/vllm-openai:v0.17.0`.
- Model pinned to `Qwen/Qwen3.5-9B`.

Do not replace with floating `latest` tags in production.
