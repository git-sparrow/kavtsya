# #287 — Could a small model generate the daily fortune batch in production?

Part of map #285. Researched 2026-10-03. Prices are list prices on that date. The throughput figures are estimates (see "Unverified").

## Answer

Yes. The best fit is a **Railway cron service on CPU** running a quantized ≤3B model through llama.cpp: roughly **$1–3/month** against about $1 on Sonnet 5. It needs no new vendor and plugs in as a second `AIProvider`.
A **laptop job** costs nothing, but it misses every day the Mac is off and needs the prod DB exposed. **Hosted fine-tune serving** is either per-hour GPU (≈$4–40/month) or Modal's free credits ($0 cash, one more vendor).
Fortune pricing per token is not the problem: Fireworks and Together no longer serve LoRA fine-tunes pay-per-token, so a custom model means paying for compute time.

## Decision for Olek

Nothing to do now. #285 rules production serving out of scope until a "go", so revisit this note only then and start with the Railway CPU option.

## Comparison (≈30 fortunes/day, ~2–4k output tokens)

| Option | Rough $/month | How it runs | Main risks |
|---|---|---|---|
| **Sonnet 5 (today)** | ~$1 (ADR 0007) | Messages API | Provider dependency |
| **Railway cron, CPU** | ~$0.8 (10 min/day) to ~$2.5 (30 min/day) at 4 vCPU + 4 GB, plus ~$0.4 for a 2.5 GB volume if the weights aren't baked into the image | Cron service: llama.cpp (or `node-llama-cpp` in-process) + the existing `generate-fortunes` script | CPU speed is unmeasured. A slow run overlaps the next one, which Railway then skips. Image/volume size. The script has to exit cleanly. |
| **Laptop (launchd)** | $0 cash | `StartCalendarInterval` job on the M4 Pro (MLX / llama.cpp) | No run while the Mac is off. Prod Postgres must take a public connection from home. "Works on my machine" is a single point of failure. Bus factor of 1. |
| **Modal (serverless, per-second)** | ~$1.5 on a T4 or ~$2 on CPU, both inside the $30/month free credit, so $0 cash | `modal.Cron` with a timezone, or an endpoint the Railway cron calls | New vendor + Python deploy surface. Free credit terms can change. Cold-start time is unmeasured. |
| **HF Inference Endpoints** | ~$4 (T4 $0.50/h, 15 min/day, billed per minute) | Start → generate → pause through the API each day | Start/pause orchestration. A scaled-to-zero endpoint still counts against quota. |
| **Replicate (private Cog model)** | ~$4 (T4 $0.81/h, about 10 min/day including boot) | Same pattern | Setup and idle time are billed for private models |
| **Fireworks/Together dedicated (LoRA)** | ~$40 (cheapest Fireworks GPU $8/h, 10 min/day) | LoRA runs **only** on dedicated deployments | Cost. Overkill for 30 lines. |

For reference, an *un-fine-tuned* <4B base on Fireworks serverless costs $0.10 per 1M tokens, which is effectively $0. That isn't "our own model", though.

## How it plugs into AIProvider (read, not edited)

- `AIProvider` has a single method, `generateFortunes(count): Promise<string[]>` (`apps/api/src/ai/provider.ts`). A small model only needs one more implementation next to `createClaudeProvider`.
- The cleanest seam is an **OpenAI-compatible provider**. llama.cpp's `llama-server`, Ollama and Modal-hosted servers all expose `/v1/chat/completions` and accept `response_format`, and llama.cpp also accepts a JSON schema. That means the JSON-array contract stays a schema rather than a hope, and the existing Zod parse stays as-is. llama.cpp loads a LoRA with `--lora`.
- `createAIProvider` (`apps/api/src/ai/index.ts`) would need `AI_PROVIDER` widened from `z.enum(["claude"])` plus an `AI_BASE_URL`. `AI_MODEL` already exists. The Claude-only `ANTHROPIC_API_KEY` requirement would move under the Claude branch.
- `fortunePrompt` lives in `claude.ts`. A fine-tuned model may want a much shorter prompt, so the prompt should belong to each provider and not be shared.
- An in-process alternative is `node-llama-cpp` (npm 3.22.1, checked 2026-10-03 with `npm view`; it can enforce a JSON schema during generation). That means no sidecar, but it adds a native dependency to `apps/api`.
- **Unchanged:** `generateDailyFortunes` is idempotent per Kyiv day, and ADR 0009 keeps the scan model-free, with fallbacks and `/health` showing an empty pool. A failed or slow small-model run therefore costs one day of fallback fortunes and never a Зернятко.
- **Laptop caveat:** the job fills *today's* pool only, so a laptop can't pre-fill days ahead without a code change.

## Sources

| Claim | Source | Checked |
|---|---|---|
| Railway: Hobby $5 / Pro $20 incl. same usage; CPU $0.000463/vCPU-min, RAM $0.000231/GB-min; Hobby max 48 vCPU / 48 GB | https://docs.railway.com/reference/pricing/plans | 2026-10-03 |
| Railway: volume $0.15/GB/month, egress $0.05/GB | https://docs.railway.com/pricing | 2026-10-03 |
| Railway: volume limit Hobby 5 GB / Pro 50 GB | https://docs.railway.com/reference/volumes | 2026-10-03 |
| Railway cron: must exit when done; ≥5 min apart; next run is skipped if the previous one is still running | https://docs.railway.com/reference/cron-jobs | 2026-10-03 |
| launchd: a missed run fires on wake from sleep, but not if the Mac was off | https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/ScheduledJobs.html | 2026-10-03 |
| Fireworks: <4B serverless $0.10/1M tokens | https://docs.fireworks.ai/serverless/pricing | 2026-10-03 |
| Fireworks: LoRA "can only be deployed to on-demand (dedicated) deployments" | https://docs.fireworks.ai/fine-tuning/deploying-loras | 2026-10-03 |
| Fireworks: cheapest on-demand GPU $8/h, billed per GPU-second | https://fireworks.ai/pricing | 2026-10-03 |
| Together: "Serverless LoRA inference … has been discontinued" | https://docs.together.ai/docs/lora-inference | 2026-10-03 |
| Modal: T4 $0.000164/s, CPU $0.0000131/core/s, RAM $0.00000222/GiB/s; Starter $0 + $30/month credits | https://modal.com/pricing | 2026-10-03 |
| Modal: `modal.Cron(..., timezone=...)` | https://modal.com/docs/guide/cron | 2026-10-03 |
| HF Endpoints: T4 $0.50/h, billed per minute; scaled-to-zero still counts as used quota | https://huggingface.co/docs/inference-endpoints/pricing | 2026-10-03 |
| Replicate: private models bill setup + idle; T4 $0.81/h | https://replicate.com/pricing | 2026-10-03 |
| llama.cpp server: `/v1/chat/completions`, `response_format` json_schema, `--lora` | https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md | 2026-10-03 |
| Ollama: OpenAI-compatible `/v1/chat/completions` with `response_format` | https://docs.ollama.com/api/openai-compatibility | 2026-10-03 |
| `node-llama-cpp` 3.22.1, Node ≥20, JSON-schema enforcement | `npm view node-llama-cpp` | 2026-10-03 |

## Unverified

- **CPU throughput** for a Q4 ≤3B model on Railway vCPUs. The 10–30 min/day range is a guess, and it drives the whole Railway cost range. To check it after a "go", time one batch in a one-off Railway run.
- How many tokens Ukrainian takes. The ~2–4k output tokens/day figure is an estimate.
- Whether a Railway cron service is billed **only while running**. The docs don't say so explicitly, though it is implied by usage-based billing. Also unverified: whether a large image (~2–3 GB with the weights baked in) costs extra or slows each start.
- Whether Railway cron services can attach a volume.
- Cold-start and model-load times on Modal, HF and Replicate. The per-day minutes above are assumptions.
- How long Modal's $30 Starter credit lasts, and laptop electricity cost (assumed negligible).
- Whether any ≤3B model writes Ukrainian well enough. That is #286's and Mari's blind review's question, not this note's.
