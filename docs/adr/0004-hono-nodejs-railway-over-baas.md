# Hono on Node.js (Railway) over a BaaS

We use Hono as the API framework running on Node.js, deployed to Railway alongside a PostgreSQL instance, rather than a Backend-as-a-Service (Supabase, Firebase).

A BaaS would ship faster but couples the React Native app to a third-party API, limits what you can learn about backend architecture, and creates meaningful lock-in at the client layer. Hono on Railway keeps the backend fully owned — the app only knows about our own API endpoints. Migration to a different host later is a straightforward redeploy.

Railway was chosen over Cloudflare Workers because Workers cannot make TCP connections to standard PostgreSQL, which would force a specialised driver (Neon) and a non-standard runtime. Node.js on Railway uses standard TCP, standard `postgres.js`, and a conventional mental model.
