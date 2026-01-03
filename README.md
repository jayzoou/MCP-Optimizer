# MCP Optimizer

A minimal scaffold that runs Lighthouse to produce performance reports. The project includes a placeholder fixer that can be extended to integrate an LLM for automatic code fixes.

## Using with an MCP Host
This section provides an example of launching via an MCP host (stdio).

If you want to configure an MCP host to spawn the optimizer via `npx`, add a server entry like the following to your host config:

```json
{
	"mcpServers": {
		"mcp-optimizer": {
			"command": "npx",
			"args": ["-y", "mcp-optimizer@latest", "--","--port", "5000"]
		}
	}
}
```

This will instruct the host to spawn `npx -y mcp-optimizer@latest -- --port 5000` and communicate with the child over stdio.

## Quick start

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



