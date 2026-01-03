import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runLighthouseAudit } from "./runner/lighthouseRunner";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as http from 'http';
import { IncomingMessage, ServerResponse } from 'http';
import { autoFixFromReport } from './fix/fixer';

export class LighthouseMcpServer {
  private readonly server: McpServer;
  private readonly reports: Map<string, any> = new Map();

  constructor() {
    this.server = new McpServer({ name: "Lighthouse MCP Server", version: "0.1.0" });
    this.registerTools();
  }

  /**
   * Run an audit and store the report. Returns stored record.
   */
  public async runAudit(options: { url: string; categories?: string[]; formFactor?: 'mobile' | 'desktop' }) {
    const { url, categories, formFactor } = options;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const opts: any = {};
    if (categories && categories.length > 0) opts.categories = categories;
    if (formFactor === 'mobile') opts.emulateMobile = true;

    const runnerResult = await runLighthouseAudit(url, opts);
    const reportJson = runnerResult.report;
    const lhr = runnerResult.lhr;
    const reportObj = typeof reportJson === 'string' ? JSON.parse(reportJson) : reportJson;

    const record = {
      id,
      url,
      fetchedAt: new Date().toISOString(),
      lhr,
      report: reportObj
    };

    this.reports.set(id, record);
    return record;
  }

  private registerTools(): void {
    this.server.tool(
      "lighthouse_run_audit",
      "Run a Lighthouse audit against a URL and store the report",
      {
        url: z.string().describe("The URL to audit, including protocol (http:// or https://)"),
        categories: z.array(z.string()).optional().describe("Optional Lighthouse categories to run, e.g. ['performance','accessibility']"),
        formFactor: z.enum(["mobile", "desktop"]).optional().describe("Emulated form factor")
      },
      async ({ url, categories, formFactor }) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        try {
          const opts: any = {};
          if (categories && categories.length > 0) opts.categories = categories;
          if (formFactor === 'mobile') opts.emulateMobile = true;
          const runnerResult = await runLighthouseAudit(url, opts);
          const reportJson = runnerResult.report;
          const lhr = runnerResult.lhr;
          const reportObj = typeof reportJson === 'string' ? JSON.parse(reportJson) : reportJson;
          this.reports.set(id, {
            id,
            url,
            fetchedAt: new Date().toISOString(),
            lhr,
            report: reportObj
          });
          const perf = lhr.categories?.performance?.score ?? null;
          const accessibility = lhr.categories?.accessibility?.score ?? null;
          const summary = {
            reportId: id,
            url,
            fetchedAt: new Date().toISOString(),
            performance: perf !== null ? Math.round(perf * 100) : undefined,
            accessibility: accessibility !== null ? Math.round(accessibility * 100) : undefined
          };
          // 返回所有信息，便于 HTTP 路由复用
          return {
            content: [
              { type: "text", text: JSON.stringify(summary, null, 2) },
              { type: "text", text: JSON.stringify(lhr, null, 2) },
              { type: "text", text: JSON.stringify(reportObj, null, 2) }
            ]
          };
        } catch (error) {
          return {
            content: [
              { type: "text", text: `Lighthouse audit failed: ${error}` }
            ]
          };
        }
      }
    );
    this.server.tool(
      "lighthouse_get_report",
      "Retrieve a previously-run Lighthouse report by reportId",
      {
        reportId: z.string().describe("The report id returned by `lighthouse_run_audit`")
      },
      async ({ reportId }) => {
        const record = this.reports.get(reportId);
        if (!record) {
          return {
            content: [
              { type: "text", text: `Report not found: ${reportId}` }
            ]
          };
        }
        return {
          content: [
            { type: "text", text: JSON.stringify(record.report, null, 2) }
          ]
        };
      }
    );

    // 新增：从用户 Prompt 中识别 URL 并自动运行 Lighthouse 审计
    this.server.tool(
      "lighthouse_analyze_prompt",
      "Scan a text prompt for a URL, run Lighthouse, and return a summary",
      {
        prompt: z.string().describe("A text prompt that may contain a URL to analyze")
      },
      async ({ prompt }) => {
        try {
          const urlMatch = prompt.match(/https?:\/\/[^\s"'<>]+/i);
          if (!urlMatch) {
            return {
              content: [{ type: "text", text: "No URL found in prompt." }]
            };
          }
          const url = urlMatch[0];
          const result = await this.runAuditViaTool({ url });
          let fix = null;
          if (result && result.lhr) {
            fix = await autoFixFromReport({ lhr: result.lhr, report: JSON.stringify(result.report) });
          }
          const perf = result.lhr?.categories?.performance?.score ?? null;
          const accessibility = result.lhr?.categories?.accessibility?.score ?? null;
          const summary = {
            reportId: result.id,
            url: result.url,
            fetchedAt: result.fetchedAt,
            performance: perf !== null ? Math.round(perf * 100) : undefined,
            accessibility: accessibility !== null ? Math.round(accessibility * 100) : undefined
          };
          return {
            content: [
              { type: "text", text: JSON.stringify(summary, null, 2) },
              { type: "text", text: JSON.stringify(result.lhr || {}, null, 2) },
              { type: "text", text: JSON.stringify(result.report || {}, null, 2) },
              { type: "text", text: JSON.stringify({ fix }, null, 2) }
            ]
          };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Error analyzing prompt: ${String(err)}` }] };
        }
      }
    );
  }

  // 新增：暴露一个直接调用 MCP 工具的接口
  async runAuditViaTool(params: { url: string; categories?: string[]; formFactor?: 'mobile' | 'desktop' }) {
    // Some versions of the MCP SDK don't expose an `invokeTool` helper.
    // Call the internal runner directly and return a shape similar to the
    // tool's output so HTTP callers can use `result.summary` / `result.lhr`.
    const record = await this.runAudit(params);
    const perf = record.lhr?.categories?.performance?.score ?? null;
    const accessibility = record.lhr?.categories?.accessibility?.score ?? null;
    const summary = {
      reportId: record.id,
      url: record.url,
      fetchedAt: record.fetchedAt,
      performance: perf !== null ? Math.round(perf * 100) : undefined,
      accessibility: accessibility !== null ? Math.round(accessibility * 100) : undefined
    };
    // return record plus a `summary` to match existing HTTP handler expectations
    return { ...record, summary };
  }

  async connect(transport: Transport): Promise<void> {
    await this.server.connect(transport);
  }
}

export default LighthouseMcpServer;

export async function startMcpServer(): Promise<void> {
  // Run HTTP/SSE server
  // Prefer explicit environment variables, but also allow parsing CLI args
  // (e.g. when launched directly without the lightweight `bin` wrapper).
  let portEnv = process.env.PORT || process.env.AUDIT_PORT;
  if (!portEnv) {
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a.includes('=') && !a.startsWith('--')) {
        const [k, v] = a.split('=', 2);
        if ((k === 'PORT' || k === 'AUDIT_PORT') && v !== undefined) {
          portEnv = v;
          break;
        }
      }
      if (a.startsWith('--port=')) {
        portEnv = a.split('=')[1];
        break;
      } else if (a === '--port' && args[i + 1]) {
        portEnv = args[i + 1];
        break;
      } else if (a.startsWith('--audit-port=')) {
        portEnv = a.split('=')[1];
        break;
      } else if (a === '--audit-port' && args[i + 1]) {
        portEnv = args[i + 1];
        break;
      }
    }
  }

  const port = Number(portEnv || 5000);
  const mcp = new LighthouseMcpServer();
  let sseTransport: SSEServerTransport | null = null;
  let stdioTransport: StdioServerTransport | null = null;
  // If process stdin/stdout appear to be non-TTY pipes, assume we're being
  // launched as a stdio child by an MCP host and use the stdio transport.
  const shouldUseStdio = (process.stdin && !process.stdin.isTTY) && (process.stdout && !process.stdout.isTTY);
  if (shouldUseStdio) {
    // Redirect console output to stderr to avoid corrupting the JSON stdio protocol
    const _orig = { log: console.log, info: console.info, warn: console.warn };
    console.log = (...args: any[]) => { process.stderr.write(args.map(String).join(' ') + '\n'); };
    console.info = console.log;
    console.warn = console.log;
    try {
      stdioTransport = new StdioServerTransport(process.stdin, process.stdout);
      await mcp.connect(stdioTransport as unknown as Transport);
      console.error('Stdio: connected to parent process over stdio');
      // When running over stdio we do not start the HTTP server; stay alive
      // and let the parent coordinate messages. Return a promise that
      // resolves when the transport closes.
      return new Promise((resolve, reject) => {
        stdioTransport!.onclose = () => resolve();
        stdioTransport!.onerror = (err: any) => reject(err);
      });
    } catch (err) {
      console.error('Stdio: failed to start transport, falling back to HTTP:', err);
      stdioTransport = null;
      // restore console in case we fall back to HTTP server mode
      console.log = _orig.log;
      console.info = _orig.info;
      console.warn = _orig.warn;
    }
  }
  const pendingPosts: Array<{ body: string; url: string | undefined; headers: any }> = [];

  const { Readable, Writable } = await (async () => {
    const mod = await import('stream');
    return { Readable: mod.Readable, Writable: mod.Writable };
  })();

  function makeMockReq(body: string, url?: string, headers?: any) {
    const r = new Readable({ read() { this.push(body); this.push(null); } }) as any;
    r.method = 'POST';
    r.url = url || '/sse';
    r.headers = headers || { 'content-type': 'application/json' };
    return r as IncomingMessage;
  }

  function makeMockRes() {
    const w = new Writable({ write(chunk, _enc, cb) { cb(); } }) as any;
    w.writeHead = (status: number, headers?: any) => { w.statusCode = status; w._headers = headers; };
    w.end = (data?: any) => { if (data) { try { /* consume */ } catch (_) {} } };
    return w as unknown as ServerResponse<IncomingMessage>;
  }

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url && req.url.startsWith('/sse')) {
        // SSE handshake: set headers and create transport
        // Ensure we send proper SSE headers so clients don't fallback to polling.
        // Register the transport using '/sse' as the message POST path
        sseTransport = new SSEServerTransport('/sse', res as unknown as ServerResponse<IncomingMessage>);
        try {
          await mcp.connect(sseTransport);
          console.info('SSE: new connection established');
        } catch (err) {
          console.error('SSE: failed to start transport:', err);
          // Ensure client receives an error
          try {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'failed to start sse transport' }));
          } catch (_) { }
          return;
        }
        // replay any pending POSTs that arrived before the GET
        if (pendingPosts.length > 0) {
          console.info(`SSE: replaying ${pendingPosts.length} pending POST(s)`);
          for (const p of pendingPosts.splice(0)) {
            try {
              const mockReq = makeMockReq(p.body, p.url, p.headers);
              const mockRes = makeMockRes();
              // don't await to avoid blocking the handshake
              sseTransport.handlePostMessage(mockReq as unknown as IncomingMessage, mockRes as unknown as ServerResponse<IncomingMessage>).catch((err: any) => {
                console.error('SSE: replay handlePostMessage failed:', err);
              });
            } catch (err) {
              console.error('SSE: failed to replay pending POST:', err);
            }
          }
        }
        return;
      }

      if (req.method === 'POST' && req.url && (req.url === '/messages' || req.url.startsWith('/sse'))) {
        console.info(`SSE: received POST to ${req.url}`);
        if (!sseTransport) {
          // Buffer the POST body so it can be processed once the GET arrives.
          try {
            let body = '';
            for await (const chunk of req) {
              body += chunk;
            }
            console.info('SSE: POST received before GET; buffering');
            pendingPosts.push({ body, url: req.url, headers: req.headers });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
            return;
          } catch (e) {
            console.error('SSE: error reading POST body before GET:', e);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(e) }));
            return;
          }
        }
        try {
          await sseTransport.handlePostMessage(req as unknown as IncomingMessage, res as unknown as ServerResponse<IncomingMessage>);
          return;
        } catch (err) {
          console.error('SSE: handlePostMessage failed:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(err) }));
          return;
        }
      }

      if (req.method === 'POST' && req.url === '/audit') {
        let body = '';
        for await (const chunk of req) {
          body += chunk;
        }
        const parsed = JSON.parse(body || '{}');
        const url = parsed.url as string | undefined;
        if (!url) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'missing url' }));
          return;
        }
        try {
          const result = await mcp.runAuditViaTool({ url, categories: parsed.categories, formFactor: parsed.formFactor });
          let fix = null;
          if (result && result.lhr) {
            fix = await autoFixFromReport({ lhr: result.lhr, report: JSON.stringify(result.report) });
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ summary: result.summary, fix, error: (result as any).error }));
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(err) }));
        }
        return;
      }

      // fallback
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'MCP Optimizer running — POST /audit { "url": "https://..." }' }));
    } catch (outerErr: any) {
      // ensure no plain-text stdout noise
      try {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(outerErr) }));
      } catch (_) {
        // ignore
      }
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(port, () => resolve());
    server.on('error', reject);
  });
}
