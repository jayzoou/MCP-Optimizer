#!/usr/bin/env node

// Lightweight CLI wrapper for the MCP Optimizer package.
// This file is intentionally small so `npx mcp-optimizer` can run it.

try {
  // Require built output. When installed via npm the package root
  // will contain `dist/index.js` after `npm pack` / `npm publish`.
  require('../dist/index.js');
} catch (err) {
  // Provide a helpful error for local development if the package
  // hasn't been built yet.
  console.error('Failed to start MCP Optimizer. Have you run `npm run build`?');
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
}
