# Environment Configuration

1. Copy `env/.env.example` to `env/.env`:
   ```bash
   cp env/.env.example env/.env
   ```
2. Add your `GEMINI_API_KEY` (and optional `GEMINI_API_KEY_SECONDARY` for dual-key round-robin pooling and high-resolution Decision-1 X-Ray sharding).
3. Add an optional `GITHUB_TOKEN` (fine-grained read-only PAT) to raise GitHub API limits from 60 req/hr to 5,000 req/hr and analyze private repositories.
4. Both `backend/` and `studio/` support per-request BYOK headers (`x-gemini-api-key`, `x-github-token`) configured safely in the Studio Settings modal and kept only in browser session memory.

> Never commit `env/.env` or any real API keys.
