# Custom AI provider abstraction over the Vercel AI SDK

Ворожка calls are routed through a custom TypeScript abstraction layer rather than the Vercel AI SDK or any third-party AI wrapper.

The abstraction defines an `AIProvider` interface with a fortune-generation method — in v1, `generateFortunes(count)` to produce the daily batch of generic fortunes (a future personalized variant can take per-Customer context). Each AI provider (Claude, OpenAI, etc.) is a concrete implementation. A factory function reads `process.env.AI_PROVIDER` and `process.env.AI_MODEL` to select the active implementation at runtime — no code change needed to swap providers.

We rejected the Vercel AI SDK because it adds an external dependency we don't control and reduces what we learn. Building the abstraction ourselves teaches the Strategy pattern, keeps the codebase dependency-light, and gives full control over prompt construction, error handling, and response parsing per provider.

Default provider: Anthropic Claude. Default model: **Claude Sonnet 5** — amended 2026-07-10 from Haiku after a live A/B on the Ворожка smoke script: Haiku's Ukrainian carried grammar slips even with few-shot examples («ляглася», «виднішся», «охорони»), while Sonnet 5's batch was clean, and at ~30 fortunes/day the cost difference is immaterial (≈$0.25 vs ≈$1/month). Haiku remains one env var away (`AI_MODEL=claude-haiku-4-5`) for higher-volume AI features where its economics matter.
