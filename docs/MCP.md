# MCP Server (MCP-Optimizer)

This project includes a minimal MCP server implementation using `@modelcontextprotocol/sdk`.

Files
- `src/mcpServer.ts` — minimal MCP server exposing a `run-audit` tool that calls the existing Lighthouse runner and fixer. Defaults to port `4010` (env `MCP_PORT`).
- `src/index.ts` — starts both the existing HTTP audit endpoint and the MCP server.

Extended features
- The `run-audit` tool now accepts optional parameters: `categories` (string[]), `emulateMobile` (boolean), and `onlyFailures` (boolean). These are passed to the handler and can be used to tune the audit or filter results.
- A read-only resource `latest-audit` is registered and returns the most recent Lighthouse report stored in memory.

Run (development)

```bash
npm install
npm run dev
```

Notes
- The MCP implementation is intentionally minimal and uses `any` in a few places to remain compatible across SDK versions. If the SDK API differs, consult the SDK examples and docs at https://github.com/model-context-protocol/typescript-sdk and adjust `src/mcpServer.ts` accordingly.
