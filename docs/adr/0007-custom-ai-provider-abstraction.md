# Custom AI provider abstraction over the Vercel AI SDK

Ворожка calls are routed through a custom TypeScript abstraction layer rather than the Vercel AI SDK or any third-party AI wrapper.

The abstraction defines an `AIProvider` interface with a `generateFortune(context)` method. Each AI provider (Claude, OpenAI, etc.) is a concrete implementation. A factory function reads `process.env.AI_PROVIDER` and `process.env.AI_MODEL` to select the active implementation at runtime — no code change needed to swap providers.

We rejected the Vercel AI SDK because it adds an external dependency we don't control and reduces what we learn. Building the abstraction ourselves teaches the Strategy pattern, keeps the codebase dependency-light, and gives full control over prompt construction, error handling, and response parsing per provider.

Default provider: Anthropic Claude (Haiku model for speed and cost).
