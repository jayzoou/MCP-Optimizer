# MCP Optimizer

A minimal scaffold that runs Lighthouse to produce performance reports. The project includes a placeholder fixer that can be extended to integrate an LLM for automatic code fixes.

Quick start

1. Install runtime dependencies:

```bash
npm install lighthouse chrome-launcher
```

2. Start the server (after building or in dev):

```bash
npm run build
npm start
# or for development:
npm run dev
```

3. Run an audit:

```bash
curl -X POST http://localhost:3000/audit -H "Content-Type: application/json" -d '{"url":"https://example.com"}'
```

Notes
- `src/runner/lighthouseRunner.ts` — runs Lighthouse via `chrome-launcher` and returns the LHR.
- `src/fix/fixer.ts` — placeholder to convert LHR into actionable fixes; integrate LLM (e.g., via `@modelcontextprotocol/sdk`) here.

