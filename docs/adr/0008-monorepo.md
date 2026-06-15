# Monorepo — single repo for mobile app and API

The React Native app (`apps/mobile`) and Hono backend (`apps/api`) live in a single repository rather than separate repos.

The primary benefit is shared TypeScript types — API request/response shapes are defined once in a shared package and imported by both the app and the API. This eliminates a whole class of bugs where the frontend and backend drift out of sync. For a solo or small team project, one repo is also simpler: one clone, one CI pipeline, one place to search for code.
