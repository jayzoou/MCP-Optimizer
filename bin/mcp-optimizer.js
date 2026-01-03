#!/usr/bin/env node

// Lightweight CLI wrapper for the MCP Optimizer package.
// Accept `--port <n>` or `--port=<n>` (or `--audit-port`) to configure the server
// port when launching via `npx` (e.g. `npx -y mcp-optimizer -- --port 6000`).

try {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    // Accept environment-style args like PORT=6000
    if (a.includes('=') && !a.startsWith('--')) {
      const [k, v] = a.split('=', 2);
      if (k && v !== undefined) {
        process.env[k] = v;
        continue;
      }
    }
    if (a.startsWith('--port=')) {
      process.env.PORT = a.split('=')[1];
    }
    else if (a === '--port' && args[i + 1]) {
      process.env.PORT = args[i + 1];
      i++;
    }
    else if (a.startsWith('--audit-port=')) {
      process.env.AUDIT_PORT = a.split('=')[1];
    }
    else if (a === '--audit-port' && args[i + 1]) {
      process.env.AUDIT_PORT = args[i + 1];
      i++;
    }
  }

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
